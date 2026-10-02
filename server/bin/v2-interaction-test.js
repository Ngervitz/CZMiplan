/**
 * server/bin/v2-interaction-test.js — V2-CTA-INTERACTION-01 unit contract (no DB, no network).
 *
 * expense_categories projection (identity V1 canonical form), action_context extension per case,
 * the 7 operative CTA cases on real classifier output, USER_CHOICE request validation for
 * expense_reduction_intent / creditor_contact_step, repository parameters, state projection and
 * financial_action_v1 derivation (EXPENSE_REDUCTION_TARGET + existing choice types).
 *
 * node -r ./server/testing/networkTrap.js server/bin/v2-interaction-test.js
 */
"use strict";

var assert = require("assert");
var ac = require("../modules/diagnosis/actionContext");
var buildActionContext = ac.buildActionContext;
var projectExpenseCategories = ac.projectExpenseCategories;
var deriveModule = require("../modules/financialAction/derive");
var userChoice = require("../modules/userChoice/service");
var createUserChoiceRepository = require("../modules/userChoice/repository").createUserChoiceRepository;
var financialIdentity = require("../modules/diagnosis/financialIdentity");
var classifier = require("../../engine/classifier/financial-classifier");
var sweep = require("../testing/actionContextSweep");
var cases = require("../testing/v2InteractionCases");

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
function eq(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch (_e) {
    return false;
  }
}
function walkKeys(x, out) {
  if (Array.isArray(x)) { x.forEach(function (y) { walkKeys(y, out); }); return out; }
  if (x && typeof x === "object") Object.keys(x).forEach(function (k) { out.push(k); walkKeys(x[k], out); });
  return out;
}
async function codeOf(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return e.code || e.message;
  }
}

async function main() {
  // ---- [1] expense_categories projection ----
  var p1 = projectExpenseCategories({
    gastos: { ocio: "3.000", otros: 5000, vivienda: 20000, servicios: " 4500.5 ", salud: "x", educacion: -10, transporte: "0.001",
      alimentacion: "8000.555", hijos_familia: "" },
    custom_expenses: [{ amount: 0 }, { amount: "" }, { amount: "abc" }, { amount: 300, included: false }, { monto: "450" },
      { amount: 1200.555, label: "Gym" }, "not-an-object", { amount: null, monto: 99 }, { amount: 7, _included: false }],
  });
  check("[1] catalog order, unknown key 'otros' ignored, invalid / negative / sub-cent / blank excluded, whitespace trimmed, half-up cents, " +
    "'3.000' is the dot-decimal amount 3 (classifier semantics)", eq(p1.slice(0, 4), [
    { expense_ref: "vivienda", amount: 20000 }, { expense_ref: "alimentacion", amount: 8000.56 }, { expense_ref: "servicios", amount: 4500.5 },
    { expense_ref: "ocio", amount: 3 }]), p1);
  check("[1] custom:<n> = position in the identity custom list: blank / zero / excluded / non-object skipped, invalid counted but not projected, " +
    "monto used when amount is null", eq(p1.slice(4), [
    { expense_ref: "custom:2", amount: 450 }, { expense_ref: "custom:3", amount: 1200.56 }, { expense_ref: "custom:4", amount: 99 }]), p1);
  check("[1] amount bounds: 999999999999.99 kept, 999999999999.995 (rounds to 1e12) and 13-digit amounts left out",
    eq(projectExpenseCategories({ gastos: { vivienda: "999999999999.99", ocio: "999999999999.995", salud: "1000000000000" } }),
      [{ expense_ref: "vivienda", amount: 999999999999.99 }]));
  check("[1] long decimals round on the decimal string, never through a float (1500.5549999999999999 -> 1500.55)",
    eq(projectExpenseCategories({ gastos: { vivienda: "1500.5549999999999999" } }), [{ expense_ref: "vivienda", amount: 1500.55 }]));
  check("[1] malformed input -> [] (null / array gastos / non-array custom)",
    eq(projectExpenseCategories(null), []) && eq(projectExpenseCategories({ gastos: [1, 2], custom_expenses: { a: 1 } }), []));

  // identity invariance: same financial_input_identity_v1 => same projection
  var base = { ingreso: 50000, gastos: { vivienda: 20000, alimentacion: "8000" }, custom_expenses: [{ amount: 1500 }, { amount: "abc" }, { amount: 700 }], deudas: [] };
  var variants = [
    { gastos: { alimentacion: 8000, vivienda: "20000.00" } },
    { gastos: { vivienda: " 20000 ", alimentacion: "008000", ocio: 0, salud: "" } },
    { custom_expenses: [{ amount: 0 }, { monto: "1500" }, { amount: "" }, { amount: "abc" }, { amount: 999, included: false }, { amount: "700.0" }] },
    { custom_expenses: [{ id: "c1", label: "Gym", amount: 1500, included: true }, { amount: "abc" }, { amount: 700, _included: true }] },
  ];
  var invariant = variants.every(function (v) {
    var a = Object.assign(clone(base), v);
    var same = financialIdentity.deriveFinancialInputIdentity(a).value === financialIdentity.deriveFinancialInputIdentity(base).value;
    return same && eq(projectExpenseCategories(a), projectExpenseCategories(base));
  });
  check("[1] identity invariance: 4 differently written inputs with the same identity v1 project identical categories (custom:1, custom:3)",
    invariant && eq(projectExpenseCategories(base).map(function (c) { return c.expense_ref; }), ["vivienda", "alimentacion", "custom:1", "custom:3"]));
  var fuzzOk = 0;
  var fuzzBad = [];
  var seed = 7;
  function rnd(n) { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; }
  var RAW = [0, "", " ", "0", "0.00", 1500, "1500", " 1500 ", "1500.004", "1500.005", "-3", "x", null, 12.5, "12.50", true, {}, "1e3", 1e-7];
  for (var f = 0; f < 400; f++) {
    var g = {};
    ["vivienda", "ocio", "salud", "otros", "transporte"].forEach(function (k) { if (rnd(3)) g[k] = RAW[rnd(RAW.length)]; });
    var cust = [];
    for (var c = rnd(4); c > 0; c--) {
      var item = {};
      if (rnd(2)) item.amount = RAW[rnd(RAW.length)]; else item.monto = RAW[rnd(RAW.length)];
      if (!rnd(5)) item.included = false;
      cust.push(item);
    }
    var x = { gastos: g, custom_expenses: cust };
    var y = { gastos: JSON.parse(JSON.stringify(g)), custom_expenses: JSON.parse(JSON.stringify(cust)).concat([{ amount: 0 }, { amount: "" }]) };
    var idx = financialIdentity.deriveFinancialInputIdentity(Object.assign({ deudas: [] }, x)).value;
    var idy = financialIdentity.deriveFinancialInputIdentity(Object.assign({ deudas: [] }, y)).value;
    if (idx === idy && eq(projectExpenseCategories(x), projectExpenseCategories(y))) fuzzOk += 1; else fuzzBad.push(x);
  }
  check("[1] fuzz 400: JSON round-trip + trailing blank/zero customs keep identity and projection", fuzzBad.length === 0, fuzzBad.slice(0, 2));

  // ---- [2] action_context extension ----
  var inputs = sweep.sweepInputs();
  var noArgSame = inputs.every(function (inp) {
    var r = classifier.classifyFinancialShadow(clone(inp));
    var a = buildActionContext(r);
    return a === null || eq(Object.keys(a), ac.FIELDS_BY_STRATEGY[r.strategy]);
  });
  check("[2] without the expense input: exactly the result-only projection (keys == FIELDS_BY_STRATEGY) for " + inputs.length + " sweep inputs", noArgSame);
  var extBad = [];
  inputs.forEach(function (inp) {
    var r = classifier.classifyFinancialShadow(clone(inp));
    var a1 = buildActionContext(r);
    var a2 = buildActionContext(r, { gastos: inp.gastos, custom_expenses: inp.custom_expenses });
    if (a1 === null) { if (a2 !== null) extBad.push("null"); return; }
    var wants = r.strategy === "CONTENCION" || (r.strategy === "MANTENIMIENTO_OPTIMIZACION" && a1.monthly_surplus === null);
    var expected = Object.assign({}, a1);
    if (wants) expected.expense_categories = projectExpenseCategories({ gastos: inp.gastos, custom_expenses: inp.custom_expenses });
    if (!eq(a2, expected)) extBad.push(r.strategy);
  });
  check("[2] with the expense input: expense_categories only for CONTENCION and MANTENIMIENTO without surplus; every other key unchanged",
    extBad.length === 0, extBad.slice(0, 5));

  // ---- [3] the 7 operative cases on real classifier output ----
  var CASES = cases.CASES;
  var caseRows = CASES.map(function (cs) {
    var r = classifier.classifyFinancialShadow(clone(cs.input));
    var a = buildActionContext(r, { gastos: cs.input.gastos, custom_expenses: cs.input.custom_expenses });
    return { id: cs.id, strategy: r.strategy, ac: a, lower: userChoice.lowerPaymentEligible(r), want: cs };
  });
  var caseBad = caseRows.filter(function (row) {
    var w = row.want;
    if (row.strategy !== w.strategy || !row.ac) return true;
    var hasExp = Array.isArray(row.ac.expense_categories) && row.ac.expense_categories.length > 0;
    if (hasExp !== w.expenses) return true;
    if ((row.lower.length > 0) !== w.lowerPayment) return true;
    if (w.surplus !== (row.ac.monthly_surplus != null && row.ac.monthly_surplus.amount > 0)) return true;
    if (w.mora !== (Array.isArray(row.ac.mora_debts) && row.ac.mora_debts.length > 0)) return true;
    return false;
  });
  check("[3] 7 cases: strategy, expense widget, lower-payment eligibility, surplus and mora list as specified " +
    JSON.stringify(caseRows.map(function (r) { return r.id + "=" + r.strategy; })), caseBad.length === 0,
    caseBad.map(function (r) { return { id: r.id, strategy: r.strategy, ac: r.ac, lower: r.lower }; }));

  // ---- [4] request validation (service, fake repository) ----
  var recorded = [];
  var fakeRepo = {
    recordUserChoice: async function (row) { recorded.push(row); return { evaluation_id: row.evaluation_id, appended: true, current: null }; },
    getUserChoiceState: async function () { throw new Error("unused"); },
    recordDebtManagementOptIn: async function () { throw new Error("unused"); },
  };
  var svc = userChoice.createUserChoiceService({ repository: fakeRepo, interactionEnabled: true });
  var EV = "11111111-1111-4111-8111-111111111111";
  var ANON = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  function rec(body) { return svc.recordChoice({ anonymousId: ANON, evaluationId: EV, body: body }); }
  var bad = {
    noRef: await codeOf(rec({ choice_type: "expense_reduction_intent", amount: 100 })),
    unknownRef: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "otros", amount: 100 })),
    custom0: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "custom:0", amount: 100 })),
    custom5digits: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "custom:10000", amount: 100 })),
    markedNoAmount: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "vivienda" })),
    unmarkedAmount: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "vivienda", state: "unmarked", amount: 5 })),
    badState: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "vivienda", state: "done", amount: 5 })),
    withDebt: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 5, debt_index: 0 })),
    amount3dec: await codeOf(rec({ choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: "10.001" })),
    contactNoState: await codeOf(rec({ choice_type: "creditor_contact_step", debt_index: 0 })),
    contactBadState: await codeOf(rec({ choice_type: "creditor_contact_step", debt_index: 0, state: "agreed" })),
    contactAmount: await codeOf(rec({ choice_type: "creditor_contact_step", debt_index: 0, state: "planned", amount: 10 })),
    contactRef: await codeOf(rec({ choice_type: "creditor_contact_step", debt_index: 0, state: "planned", expense_ref: "vivienda" })),
    lowerWithRef: await codeOf(rec({ choice_type: "lower_payment_intent", debt_index: 0, expense_ref: "vivienda" })),
    reserveWithRef: await codeOf(rec({ choice_type: "surplus_reserve", destination: "emergency_fund", amount: 10, expense_ref: "ocio" })),
  };
  check("[4] malformed expense / contact requests rejected before the DB, with stable codes",
    bad.noRef === "INVALID_EXPENSE_REF" && bad.unknownRef === "INVALID_EXPENSE_REF" && bad.custom0 === "INVALID_EXPENSE_REF" &&
    bad.custom5digits === "INVALID_EXPENSE_REF" && bad.markedNoAmount === "INVALID_AMOUNT" && bad.unmarkedAmount === "INVALID_CHOICE_PAYLOAD" &&
    bad.badState === "INVALID_CHOICE_PAYLOAD" && bad.withDebt === "INVALID_CHOICE_PAYLOAD" && bad.amount3dec === "INVALID_AMOUNT" &&
    bad.contactNoState === "INVALID_CHOICE_PAYLOAD" && bad.contactBadState === "INVALID_CHOICE_PAYLOAD" &&
    bad.contactAmount === "INVALID_CHOICE_PAYLOAD" && bad.contactRef === "INVALID_CHOICE_PAYLOAD" &&
    bad.lowerWithRef === "INVALID_CHOICE_PAYLOAD" && bad.reserveWithRef === "INVALID_CHOICE_PAYLOAD" && recorded.length === 0, bad);
  await rec({ choice_type: "expense_reduction_intent", expense_ref: "custom:2", amount: "1500.50" });
  await rec({ choice_type: "expense_reduction_intent", expense_ref: "ocio", state: "unmarked" });
  await rec({ choice_type: "creditor_contact_step", debt_index: 3, state: "contacted" });
  check("[4] well-formed requests reach the repository with only the user's choice (default state marked; no strategy / amount authority)",
    eq(recorded.map(function (r) { return [r.choice_type, r.expense_ref, r.choice_state, r.amount, r.debt_index, r.lower_payment_state, r.reserve_destination]; }), [
      ["expense_reduction_intent", "custom:2", "marked", 1500.5, null, null, null],
      ["expense_reduction_intent", "ocio", "unmarked", null, null, null, null],
      ["creditor_contact_step", null, "contacted", null, 3, null, null]]), recorded);

  // ---- [5] repository parameters ----
  var calls = [];
  var repo = createUserChoiceRepository({ backendSecret: "s", client: { rpc: async function (name, params) { calls.push(params); return { data: { ok: true }, error: null }; } } });
  await repo.recordUserChoice({ anonymous_id: ANON, evaluation_id: EV, diagnosis_id: null, choice_type: "lower_payment_intent", debt_index: 0,
    amount: null, reserve_destination: null, lower_payment_state: "marked", expense_ref: null, choice_state: null });
  await repo.recordUserChoice({ anonymous_id: ANON, evaluation_id: EV, diagnosis_id: null, choice_type: "expense_reduction_intent", debt_index: null,
    amount: 10, reserve_destination: null, lower_payment_state: null, expense_ref: "vivienda", choice_state: "marked" });
  check("[5] original choice types keep the nine-argument named call; the new types add p_expense_ref / p_choice_state",
    Object.keys(calls[0]).length === 9 && !("p_expense_ref" in calls[0]) && !("p_choice_state" in calls[0]) &&
    calls[1].p_expense_ref === "vivienda" && calls[1].p_choice_state === "marked" && Object.keys(calls[1]).length === 11, calls);

  // ---- [6] state projection + [7] derivation ----
  var c1 = CASES.filter(function (c) { return c.id === "CONTENCION_WITH_DEBT"; })[0];
  var r1 = classifier.classifyFinancialShadow(clone(c1.input));
  var rawState = {
    evaluation_id: EV, classification_status: "classified", strategy: r1.strategy, classifier_version: r1.classifier_version,
    financial_input_identity_version: "financial_input_identity_v1", financial_input_identity: "a".repeat(64), result: r1,
    origin_expense_input: { gastos: c1.input.gastos, custom_expenses: c1.input.custom_expenses },
    lower_payment_intent: [{ event_id: "e1", debt_index: 0, seq: 1, created_at: "t1" }],
    surplus_allocation: null,
    expense_reduction_intent: [
      { event_id: "e2", expense_ref: "vivienda", amount: 5000, seq: 2, created_at: "t2" },
      { event_id: "e3", expense_ref: "ocio", amount: 999999, seq: 1, created_at: "t3" }],
    creditor_contact_step: [],
    debt_management_opt_in: null,
  };
  var fetched = userChoice.createUserChoiceService({ repository: Object.assign({}, fakeRepo, { getUserChoiceState: async function () { return clone(rawState); } }) });
  var st1 = await fetched.getState({ anonymousId: ANON, evaluationId: EV });
  var leak = ["result", "canonical_facts", "input_snapshot", "debts", "canonical_flow", "monthly_income", "anonymous_id", "journey_id",
    "seq", "event_id", "supersedes_event_id", "slot_key", "classifier_version", "financial_input_identity", "origin_expense_input", "gastos",
    "custom_expenses", "label", "authority", "source_choice"];
  var keys1 = walkKeys(st1, []);
  check("[6] CONTENCION with eligible debt: action_context carries expense_categories; choices list both levers (lower payment + expenses)",
    eq(Object.keys(st1.action_context), ["monthly_gap", "active_debts", "expense_categories"]) &&
    eq(st1.choices.lower_payment_intent.map(function (x) { return x.state; }), ["marked"]) &&
    eq(st1.choices.expense_reduction_intent.map(function (x) { return [x.expense_ref, x.state, x.amount]; }),
      st1.action_context.expense_categories.map(function (c) { return [c.expense_ref, c.expense_ref === "vivienda" ? "marked" : "unmarked", c.expense_ref === "vivienda" ? 5000 : null]; })),
    st1);
  check("[6] derived actions: LOWER_PAYMENT_REQUEST + EXPENSE_REDUCTION_TARGET(vivienda, current, target); the ocio head (> current / not offered) produces nothing",
    eq(st1.financial_actions, [
      { action_type: "LOWER_PAYMENT_REQUEST", action_version: "financial_action_v1", strategy: "CONTENCION", source_choice_type: "lower_payment_intent",
        params: { debt_index: 0, monthly_debt_payment: 15000 } },
      { action_type: "EXPENSE_REDUCTION_TARGET", action_version: "financial_action_v1", strategy: "CONTENCION", source_choice_type: "expense_reduction_intent",
        params: { expense_ref: "vivienda", current_amount: 40000, target_reduction: 5000 } }]), st1.financial_actions);
  check("[6] public state never exposes internal ids, the stored result, the snapshot or the action authority object",
    leak.every(function (k) { return keys1.indexOf(k) === -1; }), keys1);
  var oldShape = clone(rawState);
  delete oldShape.origin_expense_input;
  delete oldShape.expense_reduction_intent;
  delete oldShape.creditor_contact_step;
  var stOld = await userChoice.createUserChoiceService({ repository: Object.assign({}, fakeRepo, { getUserChoiceState: async function () { return clone(oldShape); } }) })
    .getState({ anonymousId: ANON, evaluationId: EV });
  check("[6] previous RPC reply (before migration 20261001180000): result-only action_context, empty expense list, lower payment action still derived",
    eq(stOld.action_context, buildActionContext(r1)) && eq(stOld.choices.expense_reduction_intent, []) &&
    eq(stOld.financial_actions.map(function (a) { return a.action_type; }), ["LOWER_PAYMENT_REQUEST"]), stOld);

  var internal = deriveModule.deriveFinancialActions(clone(rawState), buildActionContext(r1, rawState.origin_expense_input));
  check("[7] internal action keeps its authority (evaluation, strategy, classifier_version, identity v1) and source event; deterministic",
    internal.length === 2 && internal[1].authority.evaluation_id === EV && internal[1].authority.classifier_version === r1.classifier_version &&
    eq(internal[1].authority.financial_input_identity, { version: "financial_input_identity_v1", value: "a".repeat(64) }) &&
    eq(internal[1].source_choice, { choice_type: "expense_reduction_intent", event_id: "e2", seq: 2 }) &&
    eq(internal, deriveModule.deriveFinancialActions(clone(rawState), buildActionContext(r1, rawState.origin_expense_input))), internal);

  function actionsFor(caseId, heads) {
    var cs = CASES.filter(function (c) { return c.id === caseId; })[0];
    var r = classifier.classifyFinancialShadow(clone(cs.input));
    var s = Object.assign({ evaluation_id: EV, classification_status: "classified", strategy: r.strategy, classifier_version: r.classifier_version, result: r,
      origin_expense_input: { gastos: cs.input.gastos, custom_expenses: cs.input.custom_expenses },
      lower_payment_intent: [], surplus_allocation: null, expense_reduction_intent: [], creditor_contact_step: [] }, heads);
    var a = Object.prototype.hasOwnProperty.call(s, "origin_expense_input") ? buildActionContext(r, s.origin_expense_input) : buildActionContext(r);
    return deriveModule.deriveFinancialActions(s, a).map(deriveModule.projectFinancialAction);
  }
  var d = {
    mantZero: actionsFor("MANTENIMIENTO_FLOW_ZERO", { expense_reduction_intent: [{ event_id: "x", expense_ref: "alimentacion", amount: 2000, seq: 1 }] }),
    mantZeroReserve: actionsFor("MANTENIMIENTO_FLOW_ZERO", { surplus_allocation: { choice_type: "surplus_reserve", reserve_destination: "emergency_fund", amount: 10 } }),
    mantPos: actionsFor("MANTENIMIENTO_SURPLUS", { surplus_allocation: { event_id: "s", seq: 1, choice_type: "surplus_reserve", reserve_destination: "planned_goal", amount: 20000 } }),
    mantPosExpense: actionsFor("MANTENIMIENTO_SURPLUS", { expense_reduction_intent: [{ event_id: "x", expense_ref: "vivienda", amount: 100, seq: 1 }] }),
    cons: actionsFor("CONSOLIDACION", { surplus_allocation: { choice_type: "surplus_to_debt", debt_index: 0, amount: 60000 } }),
    consOver: actionsFor("CONSOLIDACION", { surplus_allocation: { choice_type: "surplus_to_debt", debt_index: 0, amount: 60000.01 } }),
    consBadDebt: actionsFor("CONSOLIDACION", { surplus_allocation: { choice_type: "surplus_to_debt", debt_index: 7, amount: 10 } }),
    red: actionsFor("REDUCCION_CARGA", { lower_payment_intent: [{ debt_index: 0 }] }),
    redExpense: actionsFor("REDUCCION_CARGA", { expense_reduction_intent: [{ expense_ref: "vivienda", amount: 100 }] }),
    reg: actionsFor("REGULARIZACION", { creditor_contact_step: [{ debt_index: 0, state: "contacted" }], lower_payment_intent: [{ debt_index: 0 }] }),
    contNoDebt: actionsFor("CONTENCION_NO_ELIGIBLE_DEBT", { expense_reduction_intent: [{ expense_ref: "custom:1", amount: 3000 }] }),
    contNoDebtFull: actionsFor("CONTENCION_NO_ELIGIBLE_DEBT", { expense_reduction_intent: [{ expense_ref: "custom:1", amount: 3000.01 }] }),
  };
  function types(list) { return list.map(function (a) { return a.action_type + (a.params.expense_ref ? ":" + a.params.expense_ref : ""); }); }
  check("[7] per case: MANT flow 0 -> EXPENSE_REDUCTION_TARGET (no surplus action); MANT surplus -> MONTHLY_RESERVE (no expense action); " +
    "CONSOLIDACION -> EXTRA_DEBT_PAYMENT (amount <= surplus, active debt); REDUCCION_CARGA -> LOWER_PAYMENT_REQUEST only; " +
    "REGULARIZACION -> no financial action; CONTENCION without eligible debt -> EXPENSE_REDUCTION_TARGET on custom:1 (<= current)",
    eq(types(d.mantZero), ["EXPENSE_REDUCTION_TARGET:alimentacion"]) && eq(d.mantZeroReserve, []) &&
    eq(d.mantPos, [{ action_type: "MONTHLY_RESERVE", action_version: "financial_action_v1", strategy: "MANTENIMIENTO_OPTIMIZACION",
      source_choice_type: "surplus_reserve", params: { destination: "planned_goal", amount: 20000 } }]) && eq(d.mantPosExpense, []) &&
    eq(d.cons, [{ action_type: "EXTRA_DEBT_PAYMENT", action_version: "financial_action_v1", strategy: "CONSOLIDACION",
      source_choice_type: "surplus_to_debt", params: { debt_index: 0, amount: 60000 } }]) && eq(d.consOver, []) && eq(d.consBadDebt, []) &&
    eq(types(d.red), ["LOWER_PAYMENT_REQUEST"]) && eq(d.redExpense, []) && eq(d.reg, []) &&
    eq(d.contNoDebt, [{ action_type: "EXPENSE_REDUCTION_TARGET", action_version: "financial_action_v1", strategy: "CONTENCION",
      source_choice_type: "expense_reduction_intent", params: { expense_ref: "custom:1", current_amount: 3000, target_reduction: 3000 } }]) &&
    eq(d.contNoDebtFull, []), d);
  var incomplete = deriveModule.deriveFinancialActions({ classification_status: "incomplete", strategy: null,
    lower_payment_intent: [{ debt_index: 0 }] }, null);
  check("[7] incomplete evaluation or missing action_context -> no actions", eq(incomplete, []));

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_INTERACTION_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
