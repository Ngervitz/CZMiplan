/**
 * server/bin/disputed-debt-targets-test.js — V2-DISPUTED-DEBT-TARGETS-01, JS authority (no DB).
 *
 * A debt declared reclamo_disputa (debt contract v2, shadow-03 DEBT_IN_DISPUTE reason) is never the target
 * of lower_payment_intent, surplus_to_debt or creditor_contact_step; it stays in active_debts. Covers the
 * eligibility helpers, FinancialAction derivation, the public projection (incl. historical heads), the
 * frontend widgets, mixed debts, and that shadow-02 (V1) results keep the pre-change eligibility exactly.
 * Strategies the classifier cannot reach with a disputed active debt (CONSOLIDACION; a disputed debt with
 * active_mora true) are exercised on stored results with an injected DEBT_IN_DISPUTE reason.
 *
 * node -r ./server/testing/networkTrap.js server/bin/disputed-debt-targets-test.js
 */
"use strict";

var ui = require("../../js/v2Interaction");
var userChoice = require("../modules/userChoice/service");
var actionContext = require("../modules/diagnosis/actionContext");
var derive = require("../modules/financialAction/derive");
var classifier = require("../../engine/classifier/financial-classifier");
var sweep = require("../testing/actionContextSweep");

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
    require("assert").deepStrictEqual(a, b);
    return true;
  } catch (_e) {
    return false;
  }
}

var CONFIRMED = { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } };
function v2(o) {
  return Object.assign({ ingreso: 50000, gastos: { vivienda: 40000 }, custom_expenses: [], deudas: [], no_debts_declared: false,
    entry_context: clone(CONFIRMED), debt_contract_version: "v2" }, clone(o));
}
function debt(sit, extra) {
  return Object.assign({ tipo: "prestamo", acreedor: "Banco QA", monto: "100000", situacion_ui: sit }, extra || {});
}
var NORMAL = function (pago) { return debt("pagando_normal", { pago: String(pago) }); };
var DISPUTE = function (current) { return debt("reclamo_disputa", { acreedor: "Financiera D", pago_mensual_actual: current }); };
var MORA = function (current) { return debt("mora", { acreedor: "Banco M", pago_mensual_actual: current }); };
var ATRASADO = function (current) { return debt("atrasado_pagando", { acreedor: "Banco A", pago_mensual_actual: current }); };

function v3(o) {
  return classifier.classifyFinancialShadowV3(v2(o));
}
/** Stored result plus a DEBT_IN_DISPUTE reason on debtIndex (state the classifier never emits for that strategy). */
function injectDispute(result, debtIndex) {
  var r = clone(result);
  r.verification_reasons.push({ code: "DEBT_IN_DISPUTE", fact: "active_mora", subject: "debt", debt_index: debtIndex });
  return r;
}
function stateOf(result, heads) {
  return Object.assign({ evaluation_id: "11111111-1111-4111-8111-111111111111", classification_status: result.classification_status,
    strategy: result.strategy, classifier_version: result.classifier_version, financial_input_identity_version: "financial_input_identity_v2",
    financial_input_identity: "a".repeat(64), result: result, origin_expense_input: { gastos: { vivienda: 40000 }, custom_expenses: [] },
    lower_payment_intent: [], surplus_allocation: null, expense_reduction_intent: [], creditor_contact_step: [], debt_management_opt_in: null }, heads || {});
}
async function project(result, heads) {
  var raw = stateOf(result, heads);
  var svc = userChoice.createUserChoiceService({ repository: { getUserChoiceState: async function () { return clone(raw); } } });
  return svc.getState({ anonymousId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", evaluationId: raw.evaluation_id });
}
function actionsOf(result, heads) {
  var st = stateOf(result, heads);
  return derive.deriveFinancialActions(st, actionContext.buildActionContext(result)).map(derive.projectFinancialAction);
}
var LOWER = function (i) { return { event_id: "l" + i, debt_index: i, seq: 1, created_at: "t" }; };
var SURPLUS_TO = function (i, amount) { return { event_id: "s", choice_type: "surplus_to_debt", debt_index: i, amount: amount, seq: 1, created_at: "t" }; };
var CONTACT = function (i, state) { return { event_id: "c" + i, debt_index: i, state: state, seq: 1, created_at: "t" }; };
var LABEL = { debtLabel: function (i) { return "Deuda #" + (i + 1); } };

/** Pre-change eligibility (reference for V1 / non-disputed results). */
function oldLower(result) {
  var ac = actionContext.buildActionContext(result);
  if (!ac || userChoice.LOWER_PAYMENT_STRATEGIES.indexOf(result.strategy) === -1) return [];
  return (ac.active_debts || []).filter(function (d) { return typeof d.monthly_debt_payment === "number" && d.monthly_debt_payment > 0; })
    .map(function (d) { return d.debt_index; });
}
function oldSurplus(result) {
  var ac = actionContext.buildActionContext(result);
  return ac && ac.monthly_surplus ? (ac.active_debts || []).map(function (d) { return d.debt_index; }) : [];
}
function oldContact(result) {
  var ac = actionContext.buildActionContext(result);
  return ac ? (ac.mora_debts || []).map(function (d) { return d.debt_index; }) : [];
}

async function main() {
  // ---- [AUTH] canonical signal ----
  var contDispute = v3({ deudas: [DISPUTE(15000)] });
  check("[AUTH] shadow-03 reclamo_disputa -> one DEBT_IN_DISPUTE debt reason; disputedDebtIndices reads it ([0])",
    contDispute.classifier_version === classifier.CLASSIFIER_VERSION_V3 && eq(actionContext.disputedDebtIndices(contDispute), [0]), contDispute.verification_reasons);
  check("[AUTH] disputedDebtIndices ignores malformed / other reasons (person subject, other code, -1, 1.5, \"1\", null) and dedups",
    eq(actionContext.disputedDebtIndices({ verification_reasons: [
      { code: "DEBT_IN_DISPUTE", subject: "person" }, { code: "DEBT_SITUATION_UNSURE", subject: "debt", debt_index: 0 },
      { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: -1 }, { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: 1.5 },
      { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: "1" }, null,
      { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: 3 }, { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: 2 },
      { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: 3 }] }), [2, 3]) &&
    eq(actionContext.disputedDebtIndices(null), []) && eq(actionContext.disputedDebtIndices({ verification_reasons: "x" }), []));
  check("[AUTH] the disputed debt stays in action_context.active_debts (financial model unchanged)",
    contDispute.strategy === "CONTENCION" && eq(actionContext.buildActionContext(contDispute).active_debts, [{ debt_index: 0, monthly_debt_payment: 15000 }]));

  // ---- [LP] lower payment ----
  var contNormal = v3({ deudas: [NORMAL(15000)] });
  var contMixed = v3({ deudas: [NORMAL(8000), DISPUTE(7000)] });
  check("[LP-1] CONTENCION + normal debt: eligible [0]; marked head -> LOWER_PAYMENT_REQUEST",
    contNormal.strategy === "CONTENCION" && eq(userChoice.lowerPaymentEligible(contNormal), [0]) &&
    eq(actionsOf(contNormal, { lower_payment_intent: [LOWER(0)] }).map(function (a) { return a.action_type + ":" + a.params.debt_index; }), ["LOWER_PAYMENT_REQUEST:0"]));
  check("[LP-2] CONTENCION + disputed debt (known current payment 15000): not eligible",
    eq(userChoice.lowerPaymentEligible(contDispute), []));
  check("[LP-3] CONTENCION + normal (0) + disputed (1): only [0] eligible",
    contMixed.strategy === "CONTENCION" && eq(userChoice.lowerPaymentEligible(contMixed), [0]), { s: contMixed.strategy, e: userChoice.lowerPaymentEligible(contMixed) });
  check("[LP-5] a marked head on the disputed debt never derives LOWER_PAYMENT_REQUEST (alone or next to a valid one)",
    eq(actionsOf(contDispute, { lower_payment_intent: [LOWER(0)] }), []) &&
    eq(actionsOf(contMixed, { lower_payment_intent: [LOWER(0), LOWER(1)] }).map(function (a) { return a.params.debt_index; }), [0]));
  var pMixed = await project(contMixed, { lower_payment_intent: [LOWER(0), LOWER(1)] });
  check("[LP-4][HIST] projection with a (historical) marked head on the disputed debt: listed choices [0 marked], actions only debt 0",
    eq(pMixed.choices.lower_payment_intent.map(function (c) { return c.debt_index + ":" + c.state; }), ["0:marked"]) &&
    eq(pMixed.financial_actions.map(function (a) { return a.action_type + ":" + a.params.debt_index; }), ["LOWER_PAYMENT_REQUEST:0"]), pMixed.choices);

  // ---- [SD] surplus to debt ----
  var consol = classifier.classifyFinancialShadowV3(v2({ ingreso: 100000, gastos: { vivienda: 30000 }, deudas: [NORMAL(10000), debt("pagando_normal", { acreedor: "Banco B", pago: "5000" })] }));
  var consolD1 = injectDispute(consol, 1);
  var consolD0 = injectDispute(consol, 0);
  var consolBoth = injectDispute(consolD1, 0);
  check("[SD-6] CONSOLIDACION + normal debts: surplus targets [0, 1]; surplus_to_debt head on 1 -> EXTRA_DEBT_PAYMENT",
    consol.strategy === "CONSOLIDACION" && eq(userChoice.surplusToDebtEligible(consol), [0, 1]) &&
    eq(actionsOf(consol, { surplus_allocation: SURPLUS_TO(1, 1000) }).map(function (a) { return a.action_type + ":" + a.params.debt_index; }), ["EXTRA_DEBT_PAYMENT:1"]),
    { s: consol.strategy });
  check("[SD-7] CONSOLIDACION with every debt disputed (injected): no surplus target",
    eq(userChoice.surplusToDebtEligible(consolBoth), []));
  check("[SD-8] normal (0) + disputed (1): only [0]; normal (1) + disputed (0): only [1]",
    eq(userChoice.surplusToDebtEligible(consolD1), [0]) && eq(userChoice.surplusToDebtEligible(consolD0), [1]));
  check("[SD-10] surplus_to_debt head on the disputed debt never derives EXTRA_DEBT_PAYMENT; on the normal one it does",
    eq(actionsOf(consolD1, { surplus_allocation: SURPLUS_TO(1, 1000) }), []) &&
    eq(actionsOf(consolD1, { surplus_allocation: SURPLUS_TO(0, 1000) }).map(function (a) { return a.action_type + ":" + a.params.debt_index; }), ["EXTRA_DEBT_PAYMENT:0"]));
  var pSD = await project(consolD1, { surplus_allocation: SURPLUS_TO(1, 1000) });
  var pSDok = await project(consolD1, { surplus_allocation: SURPLUS_TO(0, 1000) });
  check("[SD-9][HIST] projection: surplus_to_debt_targets [0]; a (historical) head on the disputed debt is not presented as current; a valid one is",
    eq(pSD.choices.surplus_to_debt_targets, [{ debt_index: 0 }]) && pSD.choices.surplus_allocation === null && pSD.financial_actions.length === 0 &&
    pSDok.choices.surplus_allocation && pSDok.choices.surplus_allocation.debt_index === 0 && pSDok.financial_actions.length === 1, { pSD: pSD.choices });
  check("[SD] surplus_reserve is not debt-targeted: unaffected by a disputed debt (MONTHLY_RESERVE still derived)",
    eq(actionsOf(consolBoth, { surplus_allocation: { event_id: "s", choice_type: "surplus_reserve", reserve_destination: "emergency_fund", amount: 1000, seq: 1, created_at: "t" } })
      .map(function (a) { return a.action_type; }), ["MONTHLY_RESERVE"]));

  // ---- [CC] creditor contact ----
  var reg = v3({ ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [MORA(0)] });
  var regMixed = v3({ ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [MORA(0), DISPUTE(0)] });
  var regTwoMora = v3({ ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [MORA(0), debt("mora", { acreedor: "Banco N", pago_mensual_actual: 0 })] });
  var regMoraDisputed = injectDispute(regTwoMora, 1);
  check("[CC-11] REGULARIZACION + mora: contact target [0]",
    reg.strategy === "REGULARIZACION" && eq(userChoice.creditorContactEligible(reg), [0]));
  check("[CC-12/13] disputed debt is never a contact target (real mora + dispute -> [0]; dispute even with active_mora true, injected -> excluded)",
    regMixed.strategy === "REGULARIZACION" && eq(userChoice.creditorContactEligible(regMixed), [0]) &&
    eq(actionContext.buildActionContext(regMoraDisputed).mora_debts, [{ debt_index: 0 }, { debt_index: 1 }]) &&
    eq(userChoice.creditorContactEligible(regMoraDisputed), [0]), { regMixed: regMixed.strategy });
  var pCC = await project(regMoraDisputed, { creditor_contact_step: [CONTACT(0, "planned"), CONTACT(1, "contacted")] });
  check("[CC-14][HIST] mora (0) + disputed (1): only debt 0 listed (its planned head kept); a (historical) head on the disputed debt is not listed",
    eq(pCC.choices.creditor_contact_step.map(function (c) { return c.debt_index + ":" + c.state; }), ["0:planned"]), pCC.choices);

  // ---- [UI] widgets mirror the authority ----
  var hLower = ui.renderPanel(await project(contMixed), LABEL);
  var hSurplus = ui.renderPanel(await project(consolD1), LABEL);
  var hContact = ui.renderPanel(await project(regMoraDisputed, { creditor_contact_step: [CONTACT(1, "contacted")] }), LABEL);
  var hSurplusAll = ui.renderPanel(await project(consol), LABEL);
  check("[UI] lower payment rows only for the normal debt; no row / button for the disputed one",
    /data-v2i-row="lower" data-index="0"/.test(hLower) && !/data-index="1"/.test(hLower), hLower.slice(0, 400));
  check("[UI] surplus selector offers debt:0 and both reserves, never debt:1 (disputed); without disputes it offers debt:0 and debt:1",
    /value="debt:0"/.test(hSurplus) && !/value="debt:1"/.test(hSurplus) && /value="reserve:emergency_fund"/.test(hSurplus) &&
    /value="debt:0"/.test(hSurplusAll) && /value="debt:1"/.test(hSurplusAll));
  check("[UI] contact controls only for the mora debt; no planned / contacted control or next step for the disputed debt",
    /data-v2i="contact" data-index="0"/.test(hContact) && !/data-v2i="contact" data-index="1"/.test(hContact) &&
    hContact.indexOf("acreedor de Deuda #2") === -1);

  // ---- [REG] regression ----
  var contMora = v3({ ingreso: 50000, gastos: { vivienda: 40000 }, deudas: [MORA(15000)] });
  var contAtr = v3({ ingreso: 50000, gastos: { vivienda: 40000 }, deudas: [ATRASADO(15000)] });
  check("[REG-17] mora with a known current payment under CONTENCION stays lower-payment eligible",
    contMora.strategy === "CONTENCION" && eq(userChoice.lowerPaymentEligible(contMora), [0]));
  check("[REG-18] atrasado_pagando with a known current payment under CONTENCION stays lower-payment eligible; atrasado under REGULARIZACION stays a contact target",
    contAtr.strategy === "CONTENCION" && eq(userChoice.lowerPaymentEligible(contAtr), [0]) &&
    eq(userChoice.creditorContactEligible(v3({ ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [ATRASADO(10000)] })), [0]));

  var v1Diff = [];
  var v1Count = 0;
  sweep.sweepInputs().forEach(function (inp) {
    var r = classifier.classifyFinancialShadow(inp);
    v1Count += 1;
    if (!eq(userChoice.lowerPaymentEligible(r), oldLower(r)) || !eq(userChoice.surplusToDebtEligible(r), oldSurplus(r)) ||
        !eq(userChoice.creditorContactEligible(r), oldContact(r)) || actionContext.disputedDebtIndices(r).length) v1Diff.push(inp);
  });
  var v1Rec = classifier.classifyFinancialShadow(Object.assign(v2({ deudas: [DISPUTE(15000)] }), { debt_contract_version: undefined }));
  check("[REG-20] V1 / shadow-02: no result carries DEBT_IN_DISPUTE; eligibility identical to the pre-change rules on " + v1Count +
    " sweep results, incl. an unrecognized situacion_ui 'reclamo_disputa'",
    v1Diff.length === 0 && v1Count > 50 && actionContext.disputedDebtIndices(v1Rec).length === 0 &&
    eq(userChoice.lowerPaymentEligible(v1Rec), oldLower(v1Rec)), v1Diff.slice(0, 2));

  // shadow-03 fuzz: new = pre-change minus disputed, and disputed active debts only ever reach CONTENCION / REGULARIZACION
  var seed = 20261004;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var SITS = ["pagando_normal", "atrasado_pagando", "deje_pagar", "mora", "reclamo_disputa", "no_seguro"];
  var PAYS = [0, null, 1500, 9000, 30000, undefined];
  var fuzzFail = [];
  var reach = {};
  var normalLost = 0;
  for (var f = 0; f < 20000; f++) {
    var ds = [];
    var n = 1 + Math.floor(rnd() * 3);
    for (var k = 0; k < n; k++) {
      var sit = SITS[Math.floor(rnd() * SITS.length)];
      var dd = { tipo: "prestamo", monto: String(10000 + Math.floor(rnd() * 300000)), situacion_ui: sit, pago: String(Math.floor(rnd() * 20000)) };
      var pay = PAYS[Math.floor(rnd() * PAYS.length)];
      if (pay !== undefined) dd.pago_mensual_actual = pay;
      ds.push(dd);
    }
    var r3 = classifier.classifyFinancialShadowV3(v2({ ingreso: 20000 + Math.floor(rnd() * 100000), gastos: { vivienda: Math.floor(rnd() * 60000) }, deudas: ds }));
    var disputed = actionContext.disputedDebtIndices(r3);
    var expectDisputed = ds.map(function (d, i) { return d.situacion_ui === "reclamo_disputa" ? i : -1; }).filter(function (i) { return i >= 0; });
    var minus = function (list) { return list.filter(function (i) { return disputed.indexOf(i) === -1; }); };
    if (!eq(disputed, expectDisputed) || !eq(userChoice.lowerPaymentEligible(r3), minus(oldLower(r3))) ||
        !eq(userChoice.surplusToDebtEligible(r3), minus(oldSurplus(r3))) || !eq(userChoice.creditorContactEligible(r3), minus(oldContact(r3)))) {
      fuzzFail.push({ ds: ds, s: r3.strategy });
    }
    if (oldLower(r3).some(function (i) { return disputed.indexOf(i) === -1 && userChoice.lowerPaymentEligible(r3).indexOf(i) === -1; })) normalLost += 1;
    if (r3.classification_status === "classified") {
      var ac = actionContext.buildActionContext(r3);
      var disputedActive = (ac.active_debts || []).some(function (d) { return disputed.indexOf(d.debt_index) !== -1; }) ||
        r3.canonical_facts.debts.some(function (d) { return d.active_debt === true && disputed.indexOf(d.debt_index) !== -1; });
      if (disputedActive) reach[r3.strategy] = (reach[r3.strategy] || 0) + 1;
    }
  }
  check("[REG-19] shadow-03 fuzz (20000): disputed set == reclamo_disputa debts; every eligibility == pre-change minus disputed; no non-disputed debt loses eligibility",
    fuzzFail.length === 0 && normalLost === 0, fuzzFail.slice(0, 2));
  check("[SD/CC] reachability: classified results with a disputed active debt are only CONTENCION / REGULARIZACION " + JSON.stringify(reach) +
    " (CONSOLIDACION / REDUCCION_CARGA / MANTENIMIENTO cases above use an injected reason)",
    Object.keys(reach).every(function (s) { return s === "CONTENCION" || s === "REGULARIZACION"; }) && reach.CONTENCION > 0, reach);

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("DISPUTED_DEBT_TARGETS_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
