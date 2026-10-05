/**
 * engine/bin/classifier-shadow03-test.js — miplan-financial-classifier-shadow-03 (debt contract v2).
 *
 * [R] shadow-02 unchanged: deterministic fuzz + the action-context sweep classified by the current
 *     module and by the pre-change classifier (MIPLAN_CLASSIFIER_BASELINE, default
 *     %TEMP%/miplan-debt-contract-pre/engine/classifier/financial-classifier.js) must be deep-equal.
 * [S] shadow-03 debt states: atrasado_pagando / mora / reclamo_disputa / deje_pagar / pagando_normal,
 *     zero vs unknown current payment, mora_reclamo / legacy estado not reinterpreted.
 * [F] cash flow uses the current effective payment; strategy priority unchanged.
 * [A] action context: REGULARIZACION exposes mora_debts only.
 *
 * node engine/bin/classifier-shadow03-test.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var assert = require("assert");

var classifier = require("../classifier/financial-classifier");
var buildActionContext = require("../../server/modules/diagnosis/actionContext").buildActionContext;
var sweep = require("../../server/testing/actionContextSweep");

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

var V3 = classifier.classifyFinancialShadowV3;
var V2 = classifier.classifyFinancialShadow;
var CONFIRMED = { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } };

function input(deudas, o) {
  return Object.assign({ ingreso: 60000, gastos: { vivienda: 30000 }, custom_expenses: [], deudas: deudas,
    no_debts_declared: false, entry_context: clone(CONFIRMED), debt_contract_version: "v2" }, o || {});
}
function debt(sit, extra) {
  return Object.assign({ tipo: "prestamo", acreedor: "Banco QA", monto: "200000", situacion_ui: sit }, extra || {});
}
function codesOf(r, i) {
  return r.verification_reasons.filter(function (x) { return x.debt_index === i; }).map(function (x) { return x.code; });
}

// deterministic PRNG (mulberry32)
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}
var SITS = ["pagando_normal", "atrasado_pagando", "deje_pagar", "mora_reclamo", "mora", "reclamo_disputa", "no_seguro",
  "", " mora ", "pagada", "otra", undefined];
var AMOUNTS = [undefined, null, "", "0", 0, "5000", 5000, 12000.5, "35000", "-5", "abc", "65.000", 200000, "0.0"];
function randomInput(r) {
  var n = Math.floor(r() * 4);
  var deudas = [];
  for (var i = 0; i < n; i++) {
    var d = { tipo: pick(r, ["prestamo", "tarjeta", undefined]), acreedor: pick(r, ["Banco QA", "OCA", ""]),
      monto: pick(r, [undefined, "", "0", "50000", 200000, "-1", "x"]), situacion_ui: pick(r, SITS),
      pago: pick(r, AMOUNTS), pago_mensual_actual: pick(r, AMOUNTS), ultimo_pago_declarado: pick(r, AMOUNTS),
      estado: pick(r, [undefined, "al_dia", "mora", "atraso_leve", "x"]), pago_clarificacion: pick(r, [undefined, null, "sin_cuota"]) };
    if (r() < 0.1) d.cancelada = true;
    Object.keys(d).forEach(function (k) { if (d[k] === undefined) delete d[k]; });
    deudas.push(r() < 0.05 ? "not-an-object" : d);
  }
  var o = { ingreso: pick(r, [undefined, 0, 30000, 60000, "100000", "x"]),
    gastos: pick(r, [{}, { vivienda: 30000 }, { vivienda: "x" }, { vivienda: 90000, comida: "5000" }]),
    custom_expenses: pick(r, [[], [{ amount: 1000 }], [{ amount: "x", included: true }]]),
    deudas: deudas, no_debts_declared: r() < 0.2,
    entry_context: pick(r, [clone(CONFIRMED), null, { field_provenance: { ingreso: { source: "url_prefill", user_modified: false } } }]) };
  var marker = pick(r, [undefined, "v1", "v2", null, "V2"]);
  if (marker !== undefined) o.debt_contract_version = marker;
  return o;
}

// ---------------------------------------------------------------- [R] shadow-02 regression
var baselineFile = process.env.MIPLAN_CLASSIFIER_BASELINE ||
  path.join(os.tmpdir(), "miplan-debt-contract-pre", "engine", "classifier", "financial-classifier.js");
if (fs.existsSync(baselineFile)) {
  var base = require(baselineFile);
  var r = rng(20261003);
  var inputs = sweep.sweepInputs().map(clone);
  for (var k = 0; k < 6000; k++) inputs.push(randomInput(r));
  var diffs = [];
  inputs.forEach(function (inp, idx) {
    var a = JSON.stringify(V2(clone(inp)));
    var b = JSON.stringify(base.classifyFinancialShadow(clone(inp)));
    if (a !== b && diffs.length < 3) diffs.push({ idx: idx, input: inp });
  });
  check("[R] shadow-02 output byte-identical to the pre-change classifier on " + inputs.length +
    " inputs (sweep + fuzz with v2 fields / markers / new situations)", diffs.length === 0, diffs);
  check("[R] shadow-02 constants unchanged (version, catalog)", classifier.CLASSIFIER_VERSION === base.CLASSIFIER_VERSION &&
    classifier.CLASSIFIER_VERSION === "miplan-financial-classifier-shadow-02" && eq(classifier.REASON_CATALOG, base.REASON_CATALOG));
} else {
  check("[R] pre-change classifier baseline available (MIPLAN_CLASSIFIER_BASELINE)", false, baselineFile);
}

// ---------------------------------------------------------------- shadow-03 identity of the module
check("[S] shadow-03 version / contract; catalog = shadow-02 catalog + DEBT_IN_DISPUTE (fact active_mora) appended",
  classifier.CLASSIFIER_VERSION_V3 === "miplan-financial-classifier-shadow-03" &&
  V3(input([])).classifier_version === "miplan-financial-classifier-shadow-03" &&
  typeof V3(input([])).contract === "string" && V3(input([])).contract !== V2(input([])).contract &&
  eq(classifier.REASON_CATALOG_V3.slice(0, classifier.REASON_CATALOG.length), classifier.REASON_CATALOG) &&
  eq(classifier.REASON_CATALOG_V3.slice(-1), [{ code: "DEBT_IN_DISPUTE", fact: "active_mora" }]));
var frozen = input([debt("mora", { pago_mensual_actual: 0 })]);
var frozenCopy = clone(frozen);
V3(frozen);
check("[S] shadow-03 never mutates its input and is deterministic", eq(frozen, frozenCopy) && eq(V3(clone(frozenCopy)), V3(clone(frozenCopy))));

// ---------------------------------------------------------------- [S] debt states
function fact(d) {
  return V3(input([d])).canonical_facts.debts[0];
}
var atrPos = fact(debt("atrasado_pagando", { pago_mensual_actual: 10000, ultimo_pago_declarado: 4000, pago: 4000 }));
var atrZero = fact(debt("atrasado_pagando", { pago_mensual_actual: 0, ultimo_pago_declarado: 4000, pago: 4000 }));
var atrNull = fact(debt("atrasado_pagando", { pago_mensual_actual: null, ultimo_pago_declarado: 4000, pago: 4000 }));
var atrAbsent = fact(debt("atrasado_pagando", { ultimo_pago_declarado: 4000, pago: 4000 }));
check("[S] atrasado_pagando: active_mora=true; pago_mensual_actual >0 -> KNOWN_POSITIVE, 0 -> KNOWN_ZERO, null/absent -> UNKNOWN; " +
  "ultimo_pago_declarado / legacy pago never used (no last_payment_amount, no DEBT_PAYMENT_ONLY_LAST_KNOWN)",
  atrPos.active_mora === true && eq(atrPos.monthly_debt_payment, { status: "KNOWN_POSITIVE", value: 10000 }) &&
  eq(atrZero.monthly_debt_payment, { status: "KNOWN_ZERO", value: 0 }) &&
  eq(atrNull.monthly_debt_payment, { status: "UNKNOWN", value: "unknown" }) && eq(atrAbsent.monthly_debt_payment, atrNull.monthly_debt_payment) &&
  [atrPos, atrZero, atrNull].every(function (f) { return f.last_payment_amount === undefined; }) &&
  codesOf(V3(input([debt("atrasado_pagando", { pago_mensual_actual: null, ultimo_pago_declarado: 4000 })])), 0).indexOf("DEBT_PAYMENT_ONLY_LAST_KNOWN") === -1,
  { atrPos: atrPos, atrZero: atrZero, atrNull: atrNull });
var moraPos = fact(debt("mora", { pago_mensual_actual: 7000, pago: 0 }));
var moraZero = fact(debt("mora", { pago_mensual_actual: 0, pago: 0 }));
var moraNull = fact(debt("mora", { pago_mensual_actual: null, pago: 0 }));
check("[S] mora: active_mora=true; >0 -> KNOWN_POSITIVE, 0 -> KNOWN_ZERO, null -> UNKNOWN (DEBT_PAYMENT_UNKNOWN); legacy pago ignored",
  [moraPos, moraZero, moraNull].every(function (f) { return f.active_mora === true; }) &&
  eq(moraPos.monthly_debt_payment, { status: "KNOWN_POSITIVE", value: 7000 }) &&
  eq(moraZero.monthly_debt_payment, { status: "KNOWN_ZERO", value: 0 }) &&
  eq(moraNull.monthly_debt_payment, { status: "UNKNOWN", value: "unknown" }) &&
  eq(codesOf(V3(input([debt("mora", { pago_mensual_actual: null, pago: 5000 })])), 0), ["DEBT_PAYMENT_UNKNOWN"]),
  { moraPos: moraPos, moraZero: moraZero, moraNull: moraNull });
var recR = V3(input([debt("reclamo_disputa", { pago_mensual_actual: 0 })]));
var rec = recR.canonical_facts.debts[0];
check("[S] reclamo_disputa: active_mora NOT assumed (unknown) with the stable reason DEBT_IN_DISPUTE (fact active_mora); " +
  "never DEBT_SITUATION_MISSING / DEBT_PROBLEM_DECLARED_MORA_UNKNOWN; payment from pago_mensual_actual",
  rec.active_mora === "unknown" && eq(codesOf(recR, 0), ["DEBT_IN_DISPUTE"]) &&
  eq(recR.verification_reasons.filter(function (x) { return x.code === "DEBT_IN_DISPUTE"; }),
    [{ code: "DEBT_IN_DISPUTE", fact: "active_mora", subject: "debt", debt_index: 0 }]) &&
  eq(rec.monthly_debt_payment, { status: "KNOWN_ZERO", value: 0 }) && rec.declared_debt_problem === undefined, recR);
check("[S] reclamo_disputa with flow >= 0 fails closed: incomplete, no strategy, missing = [active_mora of that debt]",
  recR.classification_status === "incomplete" && recR.strategy === null &&
  eq(recR.missing_required_facts, [{ fact: "active_mora", subject: "debt", debt_index: 0 }]) && recR.invariant_violations.length === 0, recR);
var recNeg = V3(input([debt("reclamo_disputa", { pago_mensual_actual: 35000 })]));
check("[S] reclamo_disputa with a known negative flow: CONTENCION by flow priority (independent of the dispute), dispute still in verification",
  recNeg.strategy === "CONTENCION" && codesOf(recNeg, 0).indexOf("DEBT_IN_DISPUTE") !== -1, recNeg);
var deje = fact(debt("deje_pagar", { pago_mensual_actual: 9000, pago: 9000 }));
check("[S] deje_pagar: KNOWN_ZERO and active_mora=true (pago_mensual_actual / pago not read)",
  deje.active_mora === true && eq(deje.monthly_debt_payment, { status: "KNOWN_ZERO", value: 0 }), deje);
var pn02 = V2(input([debt("pagando_normal", { pago: 8000, pago_mensual_actual: 1, pago_clarificacion: null })])).canonical_facts.debts[0];
var pn03 = fact(debt("pagando_normal", { pago: 8000, pago_mensual_actual: 1 }));
var pnZero = fact(debt("pagando_normal", { pago: 0, pago_clarificacion: "sin_cuota" }));
check("[S] pagando_normal preserved: same per-debt facts as shadow-02 (pago, not pago_mensual_actual); 0 stays UNKNOWN + clarification provenance",
  pn03.active_mora === false && eq(pn03.monthly_debt_payment, pn02.monthly_debt_payment) &&
  eq(pn03.monthly_debt_payment, { status: "KNOWN_POSITIVE", value: 8000 }) &&
  eq(pnZero.monthly_debt_payment, { status: "UNKNOWN", value: "unknown" }) && pnZero.provenance.payment_clarification === "sin_cuota",
  { pn02: pn02, pn03: pn03, pnZero: pnZero });
var legacyMR = V3(input([debt("mora_reclamo", { pago: 0, pago_mensual_actual: 0 })]));
var legacyEstado = V3(input([{ tipo: "prestamo", monto: "50000", estado: "mora", pago: 5000 }]));
check("[S] historical mora_reclamo is NOT reinterpreted under shadow-03 (unrecognized -> DEBT_SITUATION_MISSING, mora unknown, " +
  "pago_mensual_actual not read); legacy estado is not mapped either",
  legacyMR.canonical_facts.debts[0].active_mora === "unknown" &&
  legacyMR.canonical_facts.debts[0].provenance.situation_source === "situacion_ui_unrecognized" &&
  codesOf(legacyMR, 0).indexOf("DEBT_SITUATION_MISSING") !== -1 && codesOf(legacyMR, 0).indexOf("DEBT_IN_DISPUTE") === -1 &&
  eq(legacyMR.canonical_facts.debts[0].monthly_debt_payment, { status: "UNKNOWN", value: "unknown" }) &&
  legacyEstado.canonical_facts.debts[0].active_mora === "unknown" && eq(legacyEstado.provenance.legacy_situation_mapping_debt_indices, []),
  { legacyMR: legacyMR.canonical_facts.debts[0], legacyEstado: legacyEstado.canonical_facts.debts[0] });
var zeroBal = V3(input([debt("mora", { monto: "0", pago_mensual_actual: 5000 })]));
check("[S] mora with balance 0: validity exception (DEBT_MORA_STATE_BALANCE_ZERO) and the declared payment is not authorized",
  zeroBal.canonical_facts.debts[0].active_mora === "unknown" && codesOf(zeroBal, 0).indexOf("DEBT_MORA_STATE_BALANCE_ZERO") !== -1 &&
  codesOf(zeroBal, 0).indexOf("DEBT_PAYMENT_DECLARED_BALANCE_ZERO") !== -1 && zeroBal.canonical_facts.debts[0].declared_payment_amount === 5000,
  zeroBal.canonical_facts.debts[0]);
var badAmounts = ["", "abc", "-5", "65,000", undefined].map(function (v) {
  return fact(debt("mora", { pago_mensual_actual: v })).monthly_debt_payment.status;
});
check("[S] blank / invalid / negative / non-canonical current payment -> UNKNOWN (never 0); canonical dot-decimal strings follow MONETARY-CONTRACT-01",
  eq(badAmounts, ["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"]) &&
  eq(fact(debt("mora", { pago_mensual_actual: "0" })).monthly_debt_payment, { status: "KNOWN_ZERO", value: 0 }), badAmounts);

// ---------------------------------------------------------------- [F] cash flow
var f1 = V3(input([debt("mora", { pago_mensual_actual: 0 })]));
var f2 = V3(input([debt("atrasado_pagando", { pago_mensual_actual: 10000 })]));
var f3 = V3(input([debt("atrasado_pagando", { pago_mensual_actual: 35000 })]));
check("[F] income 60000, expenses 30000: mora + pago 0 -> flow 30000, REGULARIZACION", f1.canonical_facts.canonical_flow === 30000 && f1.strategy === "REGULARIZACION", f1.canonical_facts);
check("[F] atrasado + pago 10000 -> flow 20000, REGULARIZACION", f2.canonical_facts.canonical_flow === 20000 && f2.strategy === "REGULARIZACION", f2.canonical_facts);
check("[F] atrasado + pago 35000 -> flow -5000, CONTENCION (priority unchanged)", f3.canonical_facts.canonical_flow === -5000 && f3.strategy === "CONTENCION", f3.canonical_facts);
var f4 = V3(input([debt("mora", { pago_mensual_actual: null })]));
check("[F] mora + unknown payment: flow unknown, never computed with 0 -> incomplete (REGULARIZACION vs CONTENCION) with the payment as missing fact",
  f4.canonical_facts.canonical_flow === "unknown" && f4.canonical_facts.monthly_debt_payments === "unknown" && f4.strategy === null &&
  eq(f4.compatible_strategies, ["CONTENCION", "REGULARIZACION"]) &&
  eq(f4.missing_required_facts, [{ fact: "monthly_debt_payment", subject: "debt", debt_index: 0 }]), f4);
check("[F] same facts under shadow-02 (legacy contract) keep the historical reading: atrasado payment UNKNOWN -> no flow",
  V2(input([debt("atrasado_pagando", { pago_mensual_actual: 10000, pago: 4000, ultimo_pago_declarado: 4000 })])).canonical_facts.canonical_flow === "unknown");

// ---------------------------------------------------------------- [A] action context
var ac = [f1, f2].map(buildActionContext);
check("[A] REGULARIZACION action context = { mora_debts } only (no surplus, reserve, extra payment)",
  ac.every(function (c) { return eq(Object.keys(c), ["mora_debts"]) && eq(c.mora_debts, [{ debt_index: 0 }]); }), ac);
var acMixed = buildActionContext(V3(input([debt("mora", { pago_mensual_actual: 5000 }), debt("pagando_normal", { pago: 3000 }),
  debt("reclamo_disputa", { pago_mensual_actual: 0 })], { ingreso: 100000 })));
check("[A] mixed mora + pagando_normal + reclamo_disputa: REGULARIZACION lists only the debt whose own active_mora is true",
  eq(acMixed, { mora_debts: [{ debt_index: 0 }] }), acMixed);

// ---------------------------------------------------------------- invariants on fuzz
var r2 = rng(7);
var viol = [];
for (var j = 0; j < 4000; j++) {
  var inp = randomInput(r2);
  var res = V3(clone(inp));
  if (res.invariant_violations.length && viol.length < 3) viol.push({ input: inp, v: res.invariant_violations });
}
check("[S] shadow-03 emits no invariant violation on 4000 fuzzed inputs", viol.length === 0, viol);

var failed = results.filter(function (x) { return !x.ok; }).length;
console.log("CLASSIFIER_SHADOW03_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
if (failed) process.exitCode = 1;
