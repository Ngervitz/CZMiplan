/**
 * engine/classifier/financial-classifier.js — CLASSIFIER-SHADOW-01
 *
 * New deterministic financial classifier (SHADOW ONLY).
 * Normative source: dev/backend-arch/CLASSIFIER-CONTRACT-CONSOLIDATED-01.md
 *
 * Public API: classifyFinancialShadow(engineInput) → shadow result (plain object).
 *
 * Shadow means shadow: this module is not required by engine/core/pipeline.js,
 * server/ or js/. It never reads survey answers, scores, planId, scoreReset,
 * nivelR, financial_stage, debt stock thresholds, debt type or behavioral flags.
 * It never mutates its input and never reads the clock, env, randomness or I/O.
 */
"use strict";

var CLASSIFIER_VERSION = "miplan-financial-classifier-shadow-02";
var CONTRACT_ID = "CLASSIFIER-CONTRACT-CONSOLIDATED-01";

// T-v1 (contract §10.3): server-side versioned constant. Never read from input, env, DB or flags.
var DEBT_BURDEN_THRESHOLD = 0.30;
var DEBT_BURDEN_THRESHOLD_VERSION = "T-v1";

var UNKNOWN = "unknown";
var NOT_APPLICABLE = "N/A";

var CONTENCION = "CONTENCION";
var REGULARIZACION = "REGULARIZACION";
var REDUCCION_CARGA = "REDUCCION_CARGA";
var CONSOLIDACION = "CONSOLIDACION";
var MANTENIMIENTO_OPTIMIZACION = "MANTENIMIENTO_OPTIMIZACION";

var STRATEGY_ORDER = [
  CONTENCION,
  REGULARIZACION,
  REDUCCION_CARGA,
  CONSOLIDACION,
  MANTENIMIENTO_OPTIMIZACION,
];

// Contract §19.1. Array order = catalog order (verification_reasons ordering).
// #16 ACTIVE_MORA_EXTERNAL_CONTRADICTION is conceptual (K11 not live) and never emitted here.
var REASON_CATALOG = [
  { code: "INCOME_UNKNOWN", fact: "monthly_income" },
  { code: "INCOME_PREFILL_UNCONFIRMED", fact: "monthly_income" },
  { code: "EXPENSES_UNKNOWN", fact: "monthly_expenses" },
  { code: "DEBT_SET_INCOMPLETE", fact: "debt_set_complete" },
  { code: "NO_DEBTS_DECLARED_WITH_DEBTS", fact: "debt_set_complete" },
  { code: "DEBT_PAYMENT_UNKNOWN", fact: "monthly_debt_payment" },
  { code: "DEBT_PAYMENT_ONLY_LAST_KNOWN", fact: "monthly_debt_payment" },
  { code: "DEBT_PROBLEM_DECLARED_MORA_UNKNOWN", fact: "active_mora" },
  { code: "DEBT_SITUATION_UNSURE", fact: "active_mora" },
  { code: "DEBT_SITUATION_MISSING", fact: "active_mora" },
  { code: "DEBT_BALANCE_ZERO_NOT_SETTLED", fact: "active_debt" },
  { code: "DEBT_BALANCE_UNKNOWN", fact: "active_debt" },
  { code: "DEBT_MORA_STATE_BALANCE_ZERO", fact: "active_mora" },
  { code: "DEBT_PAYMENT_DECLARED_BALANCE_ZERO", fact: "monthly_debt_payment" },
  { code: "DEBT_PAYMENT_DECLARED_BALANCE_UNKNOWN", fact: "monthly_debt_payment" },
  { code: "ACTIVE_MORA_EXTERNAL_CONTRADICTION", fact: "active_mora" },
  { code: "DEBT_MORA_STATE_BALANCE_UNKNOWN", fact: "active_mora" },
];

var REASON_INDEX = {};
REASON_CATALOG.forEach(function (r, i) {
  REASON_INDEX[r.code] = i;
});

var SITUATIONS = {
  pagando_normal: true,
  atrasado_pagando: true,
  deje_pagar: true,
  mora_reclamo: true,
  no_seguro: true,
};

// States that trigger the validity exception when the balance is 0 or missing (§8.1).
var MORA_OR_PROBLEM_STATES = {
  atrasado_pagando: true,
  deje_pagar: true,
  mora_reclamo: true,
  legacy_mora: true,
};

var PHANTOM = "debt_set";

// ---------------------------------------------------------------------------
// Parsing — never converts missing / null / "" / NaN into 0.
// MONETARY-CONTRACT-01: EngineInput amounts are already canonical (number or
// dot-decimal string). Human formats ("65.000", "50,000") are resolved at the UI
// boundary and are not reinterpreted here.
// ---------------------------------------------------------------------------

function parseAmount(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  var s = raw.trim();
  if (s === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  var n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isBlankAmount(raw) {
  return raw == null || (typeof raw === "string" && raw.trim() === "");
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Person facts: income (K10, K6, K5) and expenses (K7)
// ---------------------------------------------------------------------------

function readIncomeProvenance(entryContext) {
  var out = { source: null, detail: null, user_modified: null, nature: null, prefill_unconfirmed: false };
  if (!isPlainObject(entryContext) || !isPlainObject(entryContext.field_provenance)) return out;
  var fp = entryContext.field_provenance;
  var meta = isPlainObject(fp.ingreso) ? fp.ingreso : isPlainObject(fp.declared_ingreso) ? fp.declared_ingreso : null;
  if (!meta) return out;
  out.source = typeof meta.source === "string" ? meta.source : null;
  out.detail = typeof meta.detail === "string" ? meta.detail : null;
  out.user_modified = meta.user_modified === true;
  // §4.1.1: A3 handoff income was declared by the user in Credizona; only the exact
  // handoff provenance carries that authority. Any other handoff/URL shape stays prefill.
  var handoffDeclared = out.source === "handoff" && out.detail === "handoff";
  var isPrefill = !handoffDeclared &&
    (out.source === "url_prefill" || out.source === "handoff" || out.detail === "handoff");
  out.prefill_unconfirmed = isPrefill && !out.user_modified;
  if (handoffDeclared || (out.source === "user_entered" && !out.prefill_unconfirmed)) {
    out.nature = "user_declared";
  }
  return out;
}

function deriveIncome(input) {
  var raw = input.ingreso != null ? input.ingreso : input.declared_ingreso;
  var n = parseAmount(raw);
  var prov = readIncomeProvenance(input.entry_context);
  if (n == null || n <= 0) {
    return { value: UNKNOWN, reason: "INCOME_UNKNOWN", provenance: prov };
  }
  if (prov.prefill_unconfirmed) {
    return { value: UNKNOWN, reason: "INCOME_PREFILL_UNCONFIRMED", provenance: prov };
  }
  return { value: n, reason: null, provenance: prov };
}

// Blank / 0 = no declared expense (captured today without an existence flag; see
// EXPENSE-COMPLETENESS-CONTRACT). A non-blank value that is not a canonical
// non-negative amount means the expense was declared but its amount is unknown,
// so the total is unknown — never a partial sum.
function deriveExpenses(input) {
  var total = 0;
  var declaredUnknown = false;
  function add(raw) {
    if (isBlankAmount(raw)) return;
    var n = parseAmount(raw);
    if (n == null || n < 0) {
      declaredUnknown = true;
      return;
    }
    total += n;
  }
  var gastos = isPlainObject(input.gastos) ? input.gastos : {};
  Object.keys(gastos)
    .sort()
    .forEach(function (k) {
      add(gastos[k]);
    });
  var custom = Array.isArray(input.custom_expenses) ? input.custom_expenses : [];
  custom.forEach(function (c) {
    if (!isPlainObject(c)) return;
    if (c.included === false || c._included === false) return;
    add(c.amount != null ? c.amount : c.monto);
  });
  if (declaredUnknown) return { value: UNKNOWN, reason: "EXPENSES_UNKNOWN" };
  if (total > 0) return { value: total, reason: null };
  return { value: UNKNOWN, reason: "EXPENSES_UNKNOWN" };
}

// ---------------------------------------------------------------------------
// Debt facts (§6–§8)
// ---------------------------------------------------------------------------

function isPaidOrCancelled(d) {
  return d.cancelada === true || d.situacion_ui === "pagada";
}

function resolveSituation(d) {
  var sit = d.situacion_ui;
  if (typeof sit === "string" && sit.trim() !== "") {
    sit = sit.trim();
    if (SITUATIONS[sit]) return { kind: sit, source: "situacion_ui" };
    return { kind: "missing", source: "situacion_ui_unrecognized" };
  }
  var estado = typeof d.estado === "string" ? d.estado.trim() : "";
  if (estado === "al_dia") return { kind: "legacy_al_dia", source: "legacy_estado" };
  if (estado === "mora" || /^atraso_/.test(estado)) {
    return { kind: "legacy_mora", source: "legacy_estado" };
  }
  return { kind: "missing", source: estado ? "legacy_estado_unmapped" : "none" };
}

function deriveDebt(d, index) {
  var sit = resolveSituation(d);
  var balance = parseAmount(d.monto);
  var balanceStatus = balance == null || balance < 0 ? "missing" : balance === 0 ? "zero" : "positive";
  var codes = [];
  var out = {
    debt_index: index,
    active_debt: null,
    active_mora: null,
    monthly_debt_payment: null,
  };

  // active_debt (§7.1). Never inferred from situacion_ui alone.
  if (balanceStatus === "positive") {
    out.active_debt = true;
  } else if (balanceStatus === "zero") {
    out.active_debt = UNKNOWN;
    codes.push("DEBT_BALANCE_ZERO_NOT_SETTLED");
  } else {
    out.active_debt = UNKNOWN;
    codes.push("DEBT_BALANCE_UNKNOWN");
  }

  // active_mora (§8.1)
  switch (sit.kind) {
    case "pagando_normal":
    case "legacy_al_dia":
      out.active_mora = false;
      break;
    case "atrasado_pagando":
    case "deje_pagar":
    case "legacy_mora":
      out.active_mora = true;
      break;
    case "mora_reclamo":
      out.active_mora = UNKNOWN;
      out.declared_debt_problem = true;
      codes.push("DEBT_PROBLEM_DECLARED_MORA_UNKNOWN");
      break;
    case "no_seguro":
      out.active_mora = UNKNOWN;
      codes.push("DEBT_SITUATION_UNSURE");
      break;
    default:
      out.active_mora = UNKNOWN;
      codes.push("DEBT_SITUATION_MISSING");
  }
  // Validity exception: balance 0 (CONTRACT-03 §4) or missing (P-01) + mora / problem state.
  if (MORA_OR_PROBLEM_STATES[sit.kind] && balanceStatus !== "positive") {
    out.active_mora = UNKNOWN;
    codes.push(balanceStatus === "zero" ? "DEBT_MORA_STATE_BALANCE_ZERO" : "DEBT_MORA_STATE_BALANCE_UNKNOWN");
  }

  // monthly_debt_payment (§6.1–§6.2)
  var confirmedActive = out.active_debt === true;
  var unauthorizedCode = balanceStatus === "zero"
    ? "DEBT_PAYMENT_DECLARED_BALANCE_ZERO"
    : "DEBT_PAYMENT_DECLARED_BALANCE_UNKNOWN";
  var declared = parseAmount(d.pago);

  if (sit.kind === "atrasado_pagando") {
    out.monthly_debt_payment = { status: "UNKNOWN", value: UNKNOWN };
    codes.push("DEBT_PAYMENT_ONLY_LAST_KNOWN");
    var last = parseAmount(d.ultimo_pago_declarado);
    if (last == null) last = declared;
    if (last != null && last > 0) out.last_payment_amount = last;
  } else if (sit.kind === "mora_reclamo") {
    out.monthly_debt_payment = { status: "UNKNOWN", value: UNKNOWN };
    codes.push("DEBT_PAYMENT_UNKNOWN");
  } else if (sit.kind === "deje_pagar") {
    if (confirmedActive) {
      out.monthly_debt_payment = { status: "KNOWN_ZERO", value: 0 };
    } else {
      out.monthly_debt_payment = { status: "UNKNOWN", value: UNKNOWN };
      codes.push(unauthorizedCode);
    }
  } else if (declared != null && declared > 0) {
    if (confirmedActive) {
      out.monthly_debt_payment = { status: "KNOWN_POSITIVE", value: declared };
    } else {
      out.monthly_debt_payment = { status: "UNKNOWN", value: UNKNOWN };
      out.declared_payment_amount = declared;
      codes.push(unauthorizedCode);
    }
  } else {
    out.monthly_debt_payment = { status: "UNKNOWN", value: UNKNOWN };
    codes.push("DEBT_PAYMENT_UNKNOWN");
  }

  out.provenance = {
    declared_situation: typeof d.situacion_ui === "string" && d.situacion_ui !== "" ? d.situacion_ui : null,
    situation_source: sit.source,
    legacy_estado: sit.source === "legacy_estado" || sit.source === "legacy_estado_unmapped" ? d.estado : null,
    balance_status: balanceStatus,
  };
  if (sit.kind === "pagando_normal" && typeof d.pago_clarificacion === "string" && d.pago_clarificacion) {
    out.provenance.payment_clarification = d.pago_clarificacion;
  }

  return { fact: out, codes: codes };
}

// ---------------------------------------------------------------------------
// Aggregation — TRUE > UNKNOWN > FALSE (§7.2, §8.2)
// ---------------------------------------------------------------------------

function aggregateExistential(values) {
  var sawUnknown = false;
  for (var i = 0; i < values.length; i++) {
    if (values[i] === true) return true;
    if (values[i] === UNKNOWN) sawUnknown = true;
  }
  return sawUnknown ? UNKNOWN : false;
}

// ---------------------------------------------------------------------------
// Compatible strategy set S (§15)
//
// Unknown amounts are >= 0 with no ceiling (§3.3). A debt with active_debt
// unknown always has an UNKNOWN payment (§6.2), so it is modelled as an
// optional debt: excluded, or included with a free payment. The debt-set
// incompleteness is modelled as one more optional debt (PHANTOM).
// ---------------------------------------------------------------------------

function sumKnownPayments(list) {
  var total = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i].payment !== null) total += list[i].payment;
  }
  return total;
}

function flowRange(I, E, Pk, U) {
  var minFlow = E === null || U ? -Infinity : (I === null ? 0 : I) - E - Pk;
  var maxFlow = I === null ? Infinity : I - (E === null ? 0 : E) - Pk;
  return { neg: minFlow < 0, zero: minFlow <= 0 && maxFlow >= 0, pos: maxFlow > 0 };
}

// Exists flow > 0 with debt_burden_ratio <= T.
function feasiblePositiveSustainable(I, E, Pk) {
  if (I === null) return true;
  var eMin = E === null ? 0 : E;
  return I - eMin - Pk > 0 && Pk / I <= DEBT_BURDEN_THRESHOLD;
}

// Exists flow > 0 with debt_burden_ratio > T.
function feasiblePositiveHigh(I, E, Pk, U) {
  var eMin = E === null ? 0 : E;
  if (!U) {
    if (Pk <= 0) return false;
    if (I === null) return eMin + Pk < Pk / DEBT_BURDEN_THRESHOLD;
    return Pk / I > DEBT_BURDEN_THRESHOLD && I - eMin - Pk > 0;
  }
  if (I === null) return true;
  if (Pk / I > DEBT_BURDEN_THRESHOLD) return I - eMin - Pk > 0;
  return (I - eMin) / I > DEBT_BURDEN_THRESHOLD;
}

function addScenario(S, model, activeList, includeOptional) {
  var I = model.income;
  var E = model.expenses;
  var Pk = sumKnownPayments(activeList);
  var U = includeOptional || activeList.some(function (d) { return d.payment === null; });
  var anyActive = activeList.length > 0 || includeOptional;

  var moraTrue =
    activeList.some(function (d) { return d.mora !== false; }) ||
    (includeOptional && model.optional.some(function (d) { return d.mora !== false; }));
  var moraFalse =
    !activeList.some(function (d) { return d.mora === true; }) &&
    (!includeOptional || model.optional.some(function (d) { return d.mora !== true; }));

  var f = flowRange(I, E, Pk, U);
  if (f.neg) S[CONTENCION] = true;
  if (!(f.zero || f.pos)) return;
  if (moraTrue) S[REGULARIZACION] = true;
  if (!moraFalse) return;
  if (!anyActive) {
    S[MANTENIMIENTO_OPTIMIZACION] = true;
    return;
  }
  if (f.zero) S[REDUCCION_CARGA] = true;
  if (f.pos) {
    if (feasiblePositiveSustainable(I, E, Pk)) S[CONSOLIDACION] = true;
    if (feasiblePositiveHigh(I, E, Pk, U)) S[REDUCCION_CARGA] = true;
  }
}

function computeS(model) {
  var S = {};
  addScenario(S, model, model.active, false);
  if (model.optional.length > 0) addScenario(S, model, model.active, true);
  return STRATEGY_ORDER.filter(function (s) { return S[s]; });
}

function cloneModel(model) {
  return {
    income: model.income,
    expenses: model.expenses,
    active: model.active.map(function (d) { return { key: d.key, payment: d.payment, mora: d.mora }; }),
    optional: model.optional.map(function (d) { return { key: d.key, mora: d.mora }; }),
  };
}

function withOptionalExcluded(model, key) {
  var m = cloneModel(model);
  m.optional = m.optional.filter(function (d) { return d.key !== key; });
  return m;
}

function withOptionalIncluded(model, key, mora) {
  var m = cloneModel(model);
  var found = null;
  m.optional = m.optional.filter(function (d) {
    if (d.key === key) {
      found = d;
      return false;
    }
    return true;
  });
  if (found) {
    m.active.push({ key: key, payment: null, mora: mora === undefined ? found.mora : mora });
  }
  return m;
}

function withActiveMora(model, key, mora) {
  var m = cloneModel(model);
  m.active.forEach(function (d) {
    if (d.key === key) d.mora = mora;
  });
  return m;
}

function hasNonContencion(S) {
  return S.some(function (s) { return s !== CONTENCION; });
}

function hasReductionOrConsolidation(S) {
  return S.indexOf(REDUCCION_CARGA) !== -1 || S.indexOf(CONSOLIDACION) !== -1;
}

// §17: a fact is missing iff two completions that differ only in that fact
// yield different strategies. Closed forms per fact type (monotone tree,
// unbounded unknown amounts).
function computeMissingFacts(model, S, incomeUnknown, expensesUnknown) {
  var missing = [];
  if (S.length < 2) return missing;

  if (incomeUnknown) missing.push({ fact: "monthly_income", subject: "person" });
  if (expensesUnknown) missing.push({ fact: "monthly_expenses", subject: "person" });

  var phantom = model.optional.filter(function (d) { return d.key === PHANTOM; })[0];
  if (phantom) {
    var setMatters =
      hasNonContencion(computeS(withOptionalExcluded(model, PHANTOM))) ||
      hasNonContencion(computeS(withOptionalIncluded(model, PHANTOM))) ||
      hasReductionOrConsolidation(computeS(withOptionalIncluded(model, PHANTOM, false)));
    if (setMatters) missing.push({ fact: "debt_set_complete", subject: "person" });
  }

  var debtKeys = [];
  model.active.forEach(function (d) { debtKeys.push({ key: d.key, kind: "active", mora: d.mora, payment: d.payment }); });
  model.optional.forEach(function (d) {
    if (d.key !== PHANTOM) debtKeys.push({ key: d.key, kind: "optional", mora: d.mora, payment: null });
  });
  debtKeys.sort(function (a, b) { return a.key - b.key; });

  debtKeys.forEach(function (d) {
    var subject = { fact: null, subject: "debt", debt_index: d.key };
    if (d.kind === "optional") {
      if (hasNonContencion(computeS(withOptionalExcluded(model, d.key)))) {
        missing.push(Object.assign({}, subject, { fact: "active_debt" }));
      }
      if (d.mora === UNKNOWN &&
          hasReductionOrConsolidation(computeS(withOptionalIncluded(model, d.key, false)))) {
        missing.push(Object.assign({}, subject, { fact: "active_mora" }));
      }
      if (hasNonContencion(computeS(withOptionalIncluded(model, d.key)))) {
        missing.push(Object.assign({}, subject, { fact: "monthly_debt_payment" }));
      }
    } else {
      if (d.mora === UNKNOWN &&
          hasReductionOrConsolidation(computeS(withActiveMora(model, d.key, false)))) {
        missing.push(Object.assign({}, subject, { fact: "active_mora" }));
      }
      if (d.payment === null) {
        missing.push(Object.assign({}, subject, { fact: "monthly_debt_payment" }));
      }
    }
  });
  return missing;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function classifyFinancialShadow(input) {
  if (!isPlainObject(input)) throw new Error("CLASSIFIER_INPUT_REQUIRED");

  var reasons = [];
  function addReason(code, subject, debtIndex) {
    var entry = { code: code, fact: REASON_CATALOG[REASON_INDEX[code]].fact, subject: subject };
    if (subject === "debt") entry.debt_index = debtIndex;
    reasons.push(entry);
  }

  var income = deriveIncome(input);
  if (income.reason) addReason(income.reason, "person");
  var expenses = deriveExpenses(input);
  if (expenses.reason) addReason(expenses.reason, "person");

  var rawDebts = Array.isArray(input.deudas) ? input.deudas : [];
  var noDebtsDeclared = input.no_debts_declared === true;
  var debtSetComplete = noDebtsDeclared || rawDebts.length > 0;

  var debts = [];
  var excluded = [];
  var legacyMapped = [];
  rawDebts.forEach(function (d, i) {
    if (!isPlainObject(d)) {
      excluded.push({ debt_index: i, reason: "invalid_entry" });
      return;
    }
    if (isPaidOrCancelled(d)) {
      excluded.push({ debt_index: i, reason: "paid_or_cancelled" });
      return;
    }
    var r = deriveDebt(d, i);
    if (r.fact.provenance.situation_source === "legacy_estado") legacyMapped.push(i);
    debts.push(r.fact);
    r.codes.forEach(function (c) { addReason(c, "debt", i); });
  });

  if (!debtSetComplete) addReason("DEBT_SET_INCOMPLETE", "person");
  var anyConfirmedActive = debts.some(function (d) { return d.active_debt === true; });
  if (noDebtsDeclared && anyConfirmedActive) addReason("NO_DEBTS_DECLARED_WITH_DEBTS", "person");

  var incompleteMarker = debtSetComplete ? [] : [UNKNOWN];
  var activeDebt = aggregateExistential(debts.map(function (d) { return d.active_debt; }).concat(incompleteMarker));
  var activeMora = aggregateExistential(debts.map(function (d) { return d.active_mora; }).concat(incompleteMarker));

  // monthly_debt_payments (§4.3, §6.3)
  var monthlyPayments;
  var knownActivePayments = 0;
  var paymentsUnknown = !debtSetComplete;
  debts.forEach(function (d) {
    if (d.active_debt === UNKNOWN) {
      paymentsUnknown = true;
      return;
    }
    if (d.monthly_debt_payment.status === "UNKNOWN") {
      paymentsUnknown = true;
    } else {
      knownActivePayments += d.monthly_debt_payment.value;
    }
  });
  monthlyPayments = paymentsUnknown ? UNKNOWN : knownActivePayments;

  // canonical_flow, flow_sign, bound (§4.4, §4.5)
  var incomeKnown = income.value !== UNKNOWN;
  var expensesKnown = expenses.value !== UNKNOWN;
  var canonicalFlow = UNKNOWN;
  var flowSign = UNKNOWN;
  if (incomeKnown && expensesKnown && monthlyPayments !== UNKNOWN) {
    canonicalFlow = income.value - expenses.value - monthlyPayments;
    flowSign = canonicalFlow < 0 ? "negative" : canonicalFlow === 0 ? "zero" : "positive";
  } else if (incomeKnown &&
             income.value - (expensesKnown ? expenses.value : 0) - knownActivePayments < 0) {
    flowSign = "negative";
  }

  // Burden (§10)
  var ratio;
  var burdenStatus;
  if (activeDebt === false) {
    ratio = NOT_APPLICABLE;
    burdenStatus = NOT_APPLICABLE;
  } else if (activeDebt === UNKNOWN || !incomeKnown || monthlyPayments === UNKNOWN) {
    ratio = UNKNOWN;
    burdenStatus = UNKNOWN;
  } else {
    ratio = monthlyPayments / income.value;
    burdenStatus = ratio > DEBT_BURDEN_THRESHOLD ? "high" : "sustainable";
  }

  // S (§15)
  var model = {
    income: incomeKnown ? income.value : null,
    expenses: expensesKnown ? expenses.value : null,
    active: [],
    optional: [],
  };
  debts.forEach(function (d) {
    if (d.active_debt === true) {
      model.active.push({
        key: d.debt_index,
        payment: d.monthly_debt_payment.status === "UNKNOWN" ? null : d.monthly_debt_payment.value,
        mora: d.active_mora,
      });
    } else {
      model.optional.push({ key: d.debt_index, mora: d.active_mora });
    }
  });
  if (!debtSetComplete) model.optional.push({ key: PHANTOM, mora: UNKNOWN });

  var S = computeS(model);
  var classified = S.length === 1;
  var strategy = classified ? S[0] : null;

  // entry_reasons (§19.2)
  var entryReasons = [];
  if (strategy === CONTENCION) entryReasons = ["FLOW_NEGATIVE"];
  else if (strategy === REGULARIZACION) entryReasons = ["ACTIVE_MORA"];
  else if (strategy === CONSOLIDACION) entryReasons = ["SUSTAINABLE_DEBT_BURDEN"];
  else if (strategy === MANTENIMIENTO_OPTIMIZACION) entryReasons = ["NO_ACTIVE_DEBT"];
  else if (strategy === REDUCCION_CARGA) {
    if (burdenStatus === "high") entryReasons.push("HIGH_DEBT_BURDEN");
    if (canonicalFlow === 0) entryReasons.push("FLOW_ZERO");
  }

  // verification (§16, §19.1): catalog order, then debt order.
  reasons.sort(function (a, b) {
    var d = REASON_INDEX[a.code] - REASON_INDEX[b.code];
    if (d !== 0) return d;
    return (a.debt_index == null ? -1 : a.debt_index) - (b.debt_index == null ? -1 : b.debt_index);
  });

  var missing = classified ? [] : computeMissingFacts(model, S, !incomeKnown, !expensesKnown);

  var invariantViolations = [];
  if (!classified && reasons.length === 0) invariantViolations.push("INCOMPLETE_WITHOUT_VERIFICATION");
  if (!classified && missing.length === 0) invariantViolations.push("INCOMPLETE_WITHOUT_MISSING_FACTS");
  if (S.length === 0) invariantViolations.push("EMPTY_COMPATIBLE_SET");
  if (strategy === REDUCCION_CARGA && entryReasons.length === 0) {
    invariantViolations.push("REDUCCION_CARGA_WITHOUT_ENTRY_REASON");
  }

  return {
    classifier_version: CLASSIFIER_VERSION,
    contract: CONTRACT_ID,
    classification_status: classified ? "classified" : "incomplete",
    strategy: strategy,
    compatible_strategies: S,
    entry_reasons: entryReasons,
    canonical_facts: {
      monthly_income: income.value,
      monthly_expenses: expenses.value,
      monthly_debt_payments: monthlyPayments,
      canonical_flow: canonicalFlow,
      flow_sign: flowSign,
      active_debt: activeDebt,
      active_mora: activeMora,
      debt_burden_ratio: ratio,
      burden_status: burdenStatus,
      debt_set_complete: debtSetComplete,
      debts: debts,
    },
    debt_burden_threshold: DEBT_BURDEN_THRESHOLD,
    threshold_version: DEBT_BURDEN_THRESHOLD_VERSION,
    verification_required: reasons.length > 0,
    missing_required_facts: missing,
    verification_reasons: reasons,
    provenance: {
      income: income.provenance,
      debt_set_basis: noDebtsDeclared ? "no_debts_declared" : rawDebts.length > 0 ? "debts_loaded" : "incomplete",
      excluded_debts: excluded,
      legacy_situation_mapping_debt_indices: legacyMapped,
    },
    invariant_violations: invariantViolations,
  };
}

module.exports = {
  CLASSIFIER_VERSION: CLASSIFIER_VERSION,
  DEBT_BURDEN_THRESHOLD: DEBT_BURDEN_THRESHOLD,
  DEBT_BURDEN_THRESHOLD_VERSION: DEBT_BURDEN_THRESHOLD_VERSION,
  REASON_CATALOG: REASON_CATALOG,
  STRATEGY_ORDER: STRATEGY_ORDER,
  UNKNOWN: UNKNOWN,
  NOT_APPLICABLE: NOT_APPLICABLE,
  classifyFinancialShadow: classifyFinancialShadow,
};
