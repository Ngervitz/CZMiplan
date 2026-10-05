/**
 * server/bin/financial-identity-v2-golden-test.js — financial_input_identity_v2 golden vectors.
 *
 * input -> canonical string -> sha256, all hardcoded. If any vector fails, v2 changed: ship v3 instead.
 * Also: zero vs unknown current payment and mora vs reclamo_disputa never collide, fields shadow-03
 * does not read never change the identity, equal canonical strings give the same shadow-03 decision,
 * and v1 / v2 never produce the same canonical string. v1 itself is pinned by
 * server/bin/financial-identity-golden-test.js (run it too).
 *
 * node server/bin/financial-identity-v2-golden-test.js
 */
"use strict";

var crypto = require("crypto");
var assert = require("assert");
var identityV2 = require("../modules/diagnosis/financialIdentityV2");
var identityV1 = require("../modules/diagnosis/financialIdentity");
var classifier = require("../../engine/classifier/financial-classifier");

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
function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
var C = identityV2.canonicalizeFinancialInputV2;

var GOLDEN = [
  ["mora_zero", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"mora","pago_mensual_actual":0,"pago":0,"estado":"mora","pago_fuente":"mora_sin_pago"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"mora\",null,\"0\",null]]]",
    "ecd13ea7290d56137943bdbfdb04dc72ff40bc42f15050db87c253d74ebdd747"],
  ["mora_unknown", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"mora","pago_mensual_actual":null,"pago":0,"estado":"mora","pago_fuente":"mora_sin_pago"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"mora\",null,null,null]]]",
    "c8088657a2cf59ba9e27fc5496581eddc043a7b4ab167586bae67f43c1eedf54"],
  ["mora_positive", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"mora","pago_mensual_actual":7000,"pago":0,"estado":"mora"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"mora\",null,\"7000\",null]]]",
    "912f70c147a60960b27e903be2bfc9cf0b762040a40d1acef640892ec0eae591"],
  ["reclamo_zero", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"reclamo_disputa","pago_mensual_actual":0,"pago":0,"estado":"mora"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"reclamo_disputa\",null,\"0\",null]]]",
    "26b3328cca88847125842ad130d92c18fe45a645840fd4259cabcbbc8d9c7a7f"],
  ["atrasado_current", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"atrasado_pagando","pago_mensual_actual":10000,"ultimo_pago_declarado":4000,"pago":4000,"estado":"atraso_leve"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"atrasado_pagando\",null,\"10000\",null]]]",
    "01dc444bcdc0bb9f30ddc174fbd57eec4465580d61c4afc0c7aa0137ac774edf"],
  ["pagando_normal", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"pagando_normal","pago":8000,"pago_mensual_actual":99,"pago_clarificacion":"sin_cuota","estado":"al_dia"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"pagando_normal\",\"8000\",null,\"sin_cuota\"]]]",
    "41d01a21195f843301e13c2f2e51476c3cd9300148f0f0d64e0612dba8519a9c"],
  ["deje_pagar", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"deje_pagar","pago":900,"pago_mensual_actual":900,"estado":"mora","atraso_tiempo":"mas_90"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"deje_pagar\",null,null,null]]]",
    "4b381a02c667f318d2a79ed1159506d15aeeacaaa7041d09f9a1ec00fb1cb8ed"],
  ["legacy_mora_reclamo", {"ingreso":60000,"gastos":{"vivienda":30000},"custom_expenses":[],"deudas":[{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"mora_reclamo","pago":0,"pago_mensual_actual":0,"estado":"mora"}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"60000\",false,[[\"vivienda\",\"30000\"]],[],false,[[\"prestamo\",\"banco qa\",\"200000\",\"mora_reclamo\",\"0\",null,null]]]",
    "aff2021928a70e34b42a8558bf0c2e96513ee6b3f9ee628f9b8489ae9f2c7267"],
  ["mixed_entries", {"ingreso":"65000.50","gastos":{"vivienda":30000,"comida":"x","agua":0},"custom_expenses":[{"amount":450},{"amount":"-1"},{"amount":99,"included":false}],"deudas":["x",{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"pagada"},{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"mora","cancelada":true},{"monto":"5000","estado":"al_dia","pago":"100"},{"tipo":"prestamo","acreedor":"Banco QA","monto":"200000","situacion_ui":"no_seguro","pago":"1500","pago_mensual_actual":3}],"no_debts_declared":false,"entry_context":{"field_provenance":{"ingreso":{"source":"user_entered","user_modified":true}}},"debt_contract_version":"v2"},
    "[\"financial_input_identity_v2\",\"65000.5\",false,[[\"comida\",\"!invalid\"],[\"vivienda\",\"30000\"]],[\"450\",\"!invalid\"],false,[\"!invalid_entry\",\"!paid_or_cancelled\",\"!paid_or_cancelled\",[null,null,\"5000\",null,\"100\",null,null],[\"prestamo\",\"banco qa\",\"200000\",\"no_seguro\",\"1500\",null,null]]]",
    "aee863d032524986e270dd5e0bfae6b898d2a3c78f19807af77c0cbd9e66d96c"],
  ["empty_prefill", {"ingreso":42000,"deudas":[],"no_debts_declared":true,"debt_contract_version":"v2","entry_context":{"field_provenance":{"ingreso":{"source":"url_prefill","user_modified":false}}}},
    "[\"financial_input_identity_v2\",\"42000\",true,[],[],true,[]]",
    "a41f6e610abdc0a58f51523fb6f5ae65def773828e9e05ef0c428c61d0213839"],
];

check("version constant is financial_input_identity_v2 (v1 constant untouched)",
  identityV2.FINANCIAL_INPUT_IDENTITY_VERSION === "financial_input_identity_v2" &&
  identityV1.FINANCIAL_INPUT_IDENTITY_VERSION === "financial_input_identity_v1");

GOLDEN.forEach(function (g) {
  var canonical = C(clone(g[1]));
  var derived = identityV2.deriveFinancialInputIdentityV2(clone(g[1]));
  check("[golden] " + g[0] + ": canonical == golden; hash == sha256(golden canonical) == derived identity",
    canonical === g[2] && sha256(g[2]) === g[3] && derived && derived.version === "financial_input_identity_v2" && derived.value === g[3],
    { canonical: canonical, derived: derived });
});

var byName = {};
GOLDEN.forEach(function (g) { byName[g[0]] = g; });
check("[zero vs unknown] mora pago_mensual_actual 0 and null have different identities; 7000 differs from both",
  byName.mora_zero[3] !== byName.mora_unknown[3] && byName.mora_positive[3] !== byName.mora_zero[3] && byName.mora_positive[3] !== byName.mora_unknown[3]);
check("[mora vs reclamo] mora and reclamo_disputa with the same payment have different identities",
  byName.mora_zero[3] !== byName.reclamo_zero[3]);
var absent = clone(byName.mora_unknown[1]);
delete absent.deudas[0].pago_mensual_actual;
var blank = clone(byName.mora_unknown[1]);
blank.deudas[0].pago_mensual_actual = "";
var strZero = clone(byName.mora_zero[1]);
strZero.deudas[0].pago_mensual_actual = "0";
check("[zero vs unknown] absent / blank / null current payment share the unknown identity (shadow-03 reads all as unknown); \"0\" == 0",
  C(absent) === byName.mora_unknown[2] && C(blank) === byName.mora_unknown[2] && C(strZero) === byName.mora_zero[2]);

// fields shadow-03 does not read never change v2
var noise = clone(byName.atrasado_current[1]);
noise.deudas[0].estado = "mora";
noise.deudas[0].ultimo_pago_declarado = 1;
noise.deudas[0].pago = 1;
noise.deudas[0].pago_fuente = "declarado";
noise.deudas[0].debt_confidence = "low";
noise.deudas[0].atraso_tiempo = "30_90";
noise.debt_contract_version = "v1";
var reordered = {};
Object.keys(byName.atrasado_current[1]).reverse().forEach(function (k) { reordered[k] = clone(byName.atrasado_current[1][k]); });
check("[invariance] estado / ultimo_pago_declarado / legacy pago (atrasado) / pago_fuente / confidence / atraso / marker value / key order " +
  "do not change v2", C(noise) === byName.atrasado_current[2] && C(reordered) === byName.atrasado_current[2]);

// v1 and v2 never collide
var collide = GOLDEN.filter(function (g) { return identityV1.canonicalizeFinancialInput(clone(g[1])) === g[2]; });
var v1v2 = GOLDEN.every(function (g) {
  var a = identityV1.deriveFinancialInputIdentity(clone(g[1]));
  var b = identityV2.deriveFinancialInputIdentityV2(clone(g[1]));
  return a.version !== b.version && a.value !== b.value;
});
check("[v1 vs v2] the same snapshot never has the same canonical string / value under v1 and v2", collide.length === 0 && v1v2, collide);
check("[v1 vs v2] v1 ignores pago_mensual_actual (0 and null collide under v1 by design: v1 = historical contract)",
  identityV1.canonicalizeFinancialInput(clone(byName.mora_zero[1])) === identityV1.canonicalizeFinancialInput(clone(byName.mora_unknown[1])));

// equal canonical => same shadow-03 decision; differing identity fields => different decision
function decision(r) {
  var x = clone(r);
  delete x.provenance.income;
  return x;
}
var pairs = 0;
var bad = [];
GOLDEN.forEach(function (g) {
  var variant = clone(g[1]);
  (Array.isArray(variant.deudas) ? variant.deudas : []).forEach(function (d) {
    if (!d || typeof d !== "object") return;
    d.estado = "x";
    d.ultimo_pago_declarado = 123;
    d.pago_fuente = "x";
    var kind = typeof d.situacion_ui === "string" ? d.situacion_ui.trim() : "";
    var readsCurrent = kind === "atrasado_pagando" || kind === "mora" || kind === "reclamo_disputa";
    if (readsCurrent || kind === "deje_pagar") d.pago = 777;
    if (!readsCurrent) d.pago_mensual_actual = 5;
  });
  if (C(variant) !== g[2]) { bad.push({ name: g[0], reason: "canonical changed" }); return; }
  pairs++;
  if (!eq(decision(classifier.classifyFinancialShadowV3(clone(g[1]))), decision(classifier.classifyFinancialShadowV3(variant)))) {
    bad.push({ name: g[0], reason: "decision changed" });
  }
});
check("[equivalence] " + pairs + " golden inputs mutated on non-identity fields: same canonical and same shadow-03 result", bad.length === 0 && pairs === GOLDEN.length, bad);
var dz = classifier.classifyFinancialShadowV3(clone(byName.mora_zero[1]));
var du = classifier.classifyFinancialShadowV3(clone(byName.mora_unknown[1]));
var dr = classifier.classifyFinancialShadowV3(clone(byName.reclamo_zero[1]));
check("[equivalence] the distinguished pairs really decide differently under shadow-03 (zero: REGULARIZACION, unknown: incomplete; " +
  "reclamo: incomplete with DEBT_IN_DISPUTE)",
  dz.strategy === "REGULARIZACION" && du.classification_status === "incomplete" && dr.classification_status === "incomplete" &&
  dr.verification_reasons.some(function (r) { return r.code === "DEBT_IN_DISPUTE"; }));

var failed = results.filter(function (r) { return !r.ok; }).length;
console.log("FINANCIAL_IDENTITY_V2_GOLDEN_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
if (failed) process.exitCode = 1;
