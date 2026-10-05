/**
 * server/modules/diagnosis/actionContext.js — V2-ACTION-CONTEXT-AND-USER-CHOICE-01
 *
 * action_context: minimal server-owned projection of a stored V2 evaluation result
 * (financial_strategy_evaluations.result) into the facts needed to instantiate actions.
 * Pure and deterministic: reads only classification_status, strategy and canonical_facts of
 * the stored result; never the request, the clock, the survey or the classifier.
 *
 * Exposed keys depend on the strategy (only what that strategy's actions need):
 *   CONTENCION                  { monthly_gap, active_debts }
 *   REGULARIZACION              { mora_debts }
 *   REDUCCION_CARGA             { active_debts }
 *   CONSOLIDACION               { monthly_surplus, active_debts }
 *   MANTENIMIENTO_OPTIMIZACION  { monthly_surplus }
 * Not classified (or unknown strategy / malformed result) → null.
 *
 *   monthly_gap      { amount, certainty: "exact" }       canonical_flow known and < 0, amount = -flow
 *                    { amount, certainty: "lower_bound" } canonical_flow unknown and flow_sign negative:
 *                    amount = -(income - known expenses (unknown → 0) - known active payments), the same
 *                    bound the classifier uses (§4.5); unknown amounts are >= 0, so the gap is at least this.
 *                    null otherwise.
 *   monthly_surplus  { amount } only when canonical_flow is known and > 0; never for 0, < 0 or unknown.
 *   mora_debts       [{ debt_index }] debts whose own active_mora === true (never the aggregate).
 *   active_debts     [{ debt_index, monthly_debt_payment }] debts whose own active_debt === true (in mora
 *                    or not); monthly_debt_payment = known amount (KNOWN_POSITIVE / KNOWN_ZERO) or null if
 *                    unknown (only CONTENCION can be classified with an unknown payment).
 * debt_index is the position in input_snapshot.deudas (paid/invalid entries keep their slot).
 * Lists are ordered by debt_index. Amounts are UYU rounded to cents (monetary contract precision).
 * monthly_surplus and active_debts are re-derived in SQL by miplan_private.v2_choice_authority
 * (migration 20261001120000) to authorize user choices (lower_payment_intent eligibility:
 * server/modules/userChoice/service.js); any change here must keep that function and the JS ↔ SQL
 * parity test in server/bin/v2-user-choice-db-test.js in step.
 *
 * V2-CTA-INTERACTION-01 — expense_categories (only when the caller passes the expense input of the
 * evaluation's origin diagnosis snapshot, i.e. { gastos, custom_expenses }):
 *   CONTENCION, and MANTENIMIENTO_OPTIMIZACION without monthly_surplus (flow 0)
 *                    [{ expense_ref, amount }] catalog categories in EXPENSE_CATALOG order, then
 *                    custom expenses as "custom:<n>". Projected from the financial_input_identity_v1
 *                    canonical form, so evaluations reused across diagnoses (same identity) project
 *                    the same list. n = 1-based position in the identity's custom list (blank / zero /
 *                    excluded entries are not counted; invalid ones are counted but never projected):
 *                    a positional V1 reference, not a semantic identity. Unknown gastos keys, invalid
 *                    amounts and amounts that round to 0 cents or reach 1e12 are left out.
 * Without that argument the output is exactly the result-only projection above.
 * Re-derived in SQL by miplan_private.v2_expense_categories (migration 20261001180000); keep the
 * JS ↔ SQL parity test in server/bin/v2-interaction-db-test.js in step.
 *
 * Disputed debts (debt contract v2, situacion_ui reclamo_disputa): disputedDebtIndices reads the
 * DEBT_IN_DISPUTE verification reasons that shadow-03 stores in the result (one per such debt). They stay
 * in active_debts and the canonical facts, but are never the target of a debt-targeted action
 * (lower_payment_intent, surplus_to_debt, creditor_contact_step). Re-derived in SQL by
 * miplan_private.v2_disputed_debts (migration 20261004120000).
 */
"use strict";

var canonicalizeFinancialInput = require("../../../js/financialInputIdentity").canonicalizeFinancialInput;

var EXPENSE_CATALOG = ["vivienda", "alimentacion", "servicios", "transporte", "salud", "educacion", "hijos_familia", "ocio"];
var MAX_CUSTOM_REF = 9999;
var MAX_EXPENSE_CENTS = 1e14;
var INVALID_EXPENSE = "!invalid";

var UNKNOWN = "unknown";
var KNOWN_PAYMENT = { KNOWN_POSITIVE: true, KNOWN_ZERO: true };
var DISPUTE_CODE = "DEBT_IN_DISPUTE";

var FIELDS_BY_STRATEGY = {
  CONTENCION: ["monthly_gap", "active_debts"],
  REGULARIZACION: ["mora_debts"],
  REDUCCION_CARGA: ["active_debts"],
  CONSOLIDACION: ["monthly_surplus", "active_debts"],
  MANTENIMIENTO_OPTIMIZACION: ["monthly_surplus"],
};

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isAmount(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Half-up to cents on the decimal representation (the JSON text PostgreSQL receives), so it equals
 * round(numeric, 2) in miplan_private.v2_choice_authority for every non-negative amount.
 */
function cents(n) {
  var s = String(n);
  if (/e/i.test(s)) return Math.round(n * 100) / 100;
  return Number(Math.round(Number(s + "e2")) + "e-2");
}

function isDebtIndex(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function knownPayment(d) {
  var p = d.monthly_debt_payment;
  return isPlainObject(p) && KNOWN_PAYMENT[p.status] === true && isAmount(p.value) && p.value >= 0 ? p.value : null;
}

function knownActivePayments(debts) {
  var total = 0;
  debts.forEach(function (d) {
    if (d.active_debt !== true) return;
    var p = knownPayment(d);
    if (p !== null) total += p;
  });
  return total;
}

function monthlyGap(cf, debts) {
  var flow = cf.canonical_flow;
  if (isAmount(flow)) {
    var exact = cents(-flow);
    return flow < 0 && exact > 0 ? { amount: exact, certainty: "exact" } : null;
  }
  if (flow !== UNKNOWN || cf.flow_sign !== "negative" || !isAmount(cf.monthly_income)) return null;
  var expenses = isAmount(cf.monthly_expenses) ? cf.monthly_expenses : 0;
  var bound = cf.monthly_income - expenses - knownActivePayments(debts);
  var amount = cents(-bound);
  return bound < 0 && amount > 0 ? { amount: amount, certainty: "lower_bound" } : null;
}

function monthlySurplus(cf) {
  var flow = cf.canonical_flow;
  if (!isAmount(flow) || flow <= 0) return null;
  var amount = cents(flow);
  return amount > 0 ? { amount: amount } : null;
}

function byIndex(a, b) {
  return a.debt_index - b.debt_index;
}

function moraDebts(debts) {
  return debts
    .filter(function (d) { return d.active_mora === true; })
    .map(function (d) { return { debt_index: d.debt_index }; })
    .sort(byIndex);
}

function activeDebts(debts) {
  return debts
    .filter(function (d) { return d.active_debt === true; })
    .map(function (d) {
      var p = knownPayment(d);
      return { debt_index: d.debt_index, monthly_debt_payment: p === null ? null : cents(p) };
    })
    .sort(byIndex);
}

/**
 * @param {object} result stored evaluation result
 * @returns {number[]} debt_index of every DEBT_IN_DISPUTE debt reason, ascending, no duplicates
 */
function disputedDebtIndices(result) {
  var reasons = isPlainObject(result) && Array.isArray(result.verification_reasons) ? result.verification_reasons : [];
  var seen = {};
  var out = [];
  reasons.forEach(function (r) {
    if (!isPlainObject(r) || r.code !== DISPUTE_CODE || r.subject !== "debt" || !isDebtIndex(r.debt_index)) return;
    if (seen[r.debt_index]) return;
    seen[r.debt_index] = true;
    out.push(r.debt_index);
  });
  return out.sort(function (a, b) { return a - b; });
}

/**
 * Cents of a canonical non-negative decimal string, half-up on the decimal digits (= round(numeric, 2)
 * in SQL), or null when the integer part has more than 12 digits.
 */
function canonicalCents(c) {
  var m = /^(\d+)(?:\.(\d+))?$/.exec(c);
  if (!m || m[1].length > 12) return null;
  var frac = (m[2] || "") + "000";
  return Number(m[1]) * 100 + Number(frac.slice(0, 2)) + (frac.charAt(2) >= "5" ? 1 : 0);
}

function expenseAmount(c) {
  if (typeof c !== "string" || c === INVALID_EXPENSE) return null;
  var cts = canonicalCents(c);
  return cts !== null && cts > 0 && cts < MAX_EXPENSE_CENTS ? cts / 100 : null;
}

/**
 * @param {{ gastos?: object, custom_expenses?: Array }} expenseInput expense part of input_snapshot
 * @returns {Array<{expense_ref: string, amount: number}>}
 */
function projectExpenseCategories(expenseInput) {
  if (!isPlainObject(expenseInput)) return [];
  var canonical = canonicalizeFinancialInput({ gastos: expenseInput.gastos, custom_expenses: expenseInput.custom_expenses });
  if (canonical == null) return [];
  var parsed = JSON.parse(canonical);
  var byKey = {};
  parsed[3].forEach(function (pair) { byKey[pair[0]] = pair[1]; });
  var out = [];
  EXPENSE_CATALOG.forEach(function (k) {
    var amount = Object.prototype.hasOwnProperty.call(byKey, k) ? expenseAmount(byKey[k]) : null;
    if (amount !== null) out.push({ expense_ref: k, amount: amount });
  });
  parsed[4].forEach(function (c, i) {
    var amount = i + 1 <= MAX_CUSTOM_REF ? expenseAmount(c) : null;
    if (amount !== null) out.push({ expense_ref: "custom:" + (i + 1), amount: amount });
  });
  return out;
}

function expenseCategoriesApply(strategy, out) {
  return strategy === "CONTENCION" || (strategy === "MANTENIMIENTO_OPTIMIZACION" && out.monthly_surplus === null);
}

/**
 * @param {object} result stored evaluation result (classifier output shape)
 * @param {object} [expenseInput] { gastos, custom_expenses } of the evaluation's origin diagnosis snapshot
 * @returns {object|null}
 */
function buildActionContext(result, expenseInput) {
  if (!isPlainObject(result) || result.classification_status !== "classified") return null;
  var fields = Object.prototype.hasOwnProperty.call(FIELDS_BY_STRATEGY, result.strategy)
    ? FIELDS_BY_STRATEGY[result.strategy]
    : null;
  var cf = result.canonical_facts;
  if (!fields || !isPlainObject(cf) || !Array.isArray(cf.debts)) return null;
  var debts = cf.debts;
  var seen = {};
  for (var i = 0; i < debts.length; i++) {
    if (!isPlainObject(debts[i]) || !isDebtIndex(debts[i].debt_index) || seen[debts[i].debt_index]) return null;
    seen[debts[i].debt_index] = true;
  }
  var build = {
    monthly_gap: function () { return monthlyGap(cf, debts); },
    monthly_surplus: function () { return monthlySurplus(cf); },
    mora_debts: function () { return moraDebts(debts); },
    active_debts: function () { return activeDebts(debts); },
  };
  var out = {};
  fields.forEach(function (f) {
    out[f] = build[f]();
  });
  if (arguments.length > 1 && expenseCategoriesApply(result.strategy, out)) {
    out.expense_categories = projectExpenseCategories(expenseInput);
  }
  return out;
}

module.exports = {
  FIELDS_BY_STRATEGY: FIELDS_BY_STRATEGY,
  EXPENSE_CATALOG: EXPENSE_CATALOG,
  buildActionContext: buildActionContext,
  projectExpenseCategories: projectExpenseCategories,
  disputedDebtIndices: disputedDebtIndices,
};
