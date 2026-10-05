/**
 * server/bin/debt-contract-test.js — DEBT-PAYMENT-CONTRACT-V2: contract selection by explicit marker.
 *
 * input_snapshot.debt_contract_version selects financial_input_identity_v1 + shadow-02 ("v1" or absent)
 * vs financial_input_identity_v2 + shadow-03 ("v2"); nothing else does. Real diagnosis service + the
 * in-memory twin of the dedup RPC (server/testing/memoryStrategyEvaluations.js). No network, no DB.
 *
 * node -r ./server/testing/networkTrap.js server/bin/debt-contract-test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..", "..");
var debtContract = require("../../js/debtContract");
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;
var deriveV1 = require("../modules/diagnosis/financialIdentity").deriveFinancialInputIdentity;
var deriveV2 = require("../modules/diagnosis/financialIdentityV2").deriveFinancialInputIdentityV2;
var createMemoryStrategyEvaluationStore = require("../testing/memoryStrategyEvaluations").createMemoryStrategyEvaluationStore;
var classifier = require("../../engine/classifier/financial-classifier");
var runEngine = require("../../engine").runEngine;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function eq(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch (_e) {
    return false;
  }
}
function clone(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}

var SHADOW_02 = "miplan-financial-classifier-shadow-02";
var SHADOW_03 = "miplan-financial-classifier-shadow-03";
var ID_V1 = "financial_input_identity_v1";
var ID_V2 = "financial_input_identity_v2";
var CONFIRMED = { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } };
function input(deudas, marker) {
  var o = { ingreso: 60000, gastos: { vivienda: 30000 }, custom_expenses: [], deudas: deudas,
    no_debts_declared: false, entry_context: clone(CONFIRMED) };
  if (marker !== undefined) o.debt_contract_version = marker;
  return o;
}
function debt(sit, extra) {
  return Object.assign({ tipo: "prestamo", acreedor: "Banco QA", monto: "200000", situacion_ui: sit }, extra || {});
}
// legacy fields as the app writes them for mora / reclamo (pago 0, estado mora)
function moraDebt(sit, current) {
  return debt(sit, { pago: 0, estado: "mora", pago_fuente: "mora_sin_pago", pago_mensual_actual: current });
}

var ANON = "33333333-3333-4333-8333-333333333333";
var JOURNEY = "55555555-5555-4555-8555-555555555555";
var JOURNEY_2 = "66666666-6666-4666-8666-666666666666";

function harness() {
  var store = createMemoryStrategyEvaluationStore();
  var diagnoses = [];
  var n = 0;
  var repo = {
    insertDiagnosis: async function (row) {
      n += 1;
      var id = "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
      diagnoses.push(Object.assign({ diagnosis_id: id }, clone(row)));
      return { diagnosis_id: id };
    },
    recordFinancialStrategyEvaluation: async function (row) { return store.record(clone(row)); },
    upsertShadowResult: async function () { return null; },
  };
  var journeyService = {
    assertOwned: async function () { return true; },
    surveyVersionOf: async function () { return 2; },
  };
  var service = createDiagnosisService({ repository: repo, tenantId: "miplan-default", journeyService: journeyService });
  return {
    store: store,
    diagnoses: diagnoses,
    diagnose: function (body, journeyId) {
      return service.createDiagnosis({ anonymousId: ANON, body: Object.assign({ journey_id: journeyId || JOURNEY }, clone(body)) });
    },
  };
}

async function main() {
  // ---------- marker resolution ----------
  var R = debtContract.resolveDebtContractVersion;
  check("[marker] absent -> v1 (legacy); \"v1\" -> v1; \"v2\" -> v2",
    R({}) === "v1" && R({ debt_contract_version: "v1" }) === "v1" && R({ debt_contract_version: "v2" }) === "v2");
  check("[marker] invalid present values -> null (fail closed): null, \"\", \"V2\", 2, \"v3\", undefined-own-key, {}",
    [null, "", "V2", 2, "v3", undefined, {}].every(function (v) { return R({ debt_contract_version: v }) === null; }) &&
    R(null) === null && R([]) === null);
  var shapeOnly = input([moraDebt("mora", 0), debt("reclamo_disputa", { pago_mensual_actual: 0 })]);
  check("[marker] V2-shaped snapshot without marker is v1: pago_mensual_actual / mora / reclamo_disputa never select v2",
    R(shapeOnly) === "v1" && debtContract.identityVersionFor(shapeOnly) === ID_V1);
  check("[marker] survey_version / unrelated fields never select v2",
    R(Object.assign(clone(shapeOnly), { survey_version: 2, source_survey_version: 2, contract: "v2" })) === "v1");

  // ---------- static: the marker has one reader and one writer ----------
  var mentions = [];
  ["js", "server/modules", "engine"].forEach(function (dir) {
    (function walk(d) {
      fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
        var p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "bin") walk(p); return; }
        if (!/\.js$/.test(e.name)) return;
        if (/["']debt_contract_version["']|\.debt_contract_version\b/.test(fs.readFileSync(p, "utf8"))) {
          mentions.push(path.relative(ROOT, p).replace(/\\/g, "/"));
        }
      });
    })(path.join(ROOT, dir));
  });
  check("[static] debt_contract_version is used in code only by js/debtContract.js (reader) and js/shadowDiagnosis.js (writer)",
    eq(mentions.sort(), ["js/debtContract.js", "js/shadowDiagnosis.js"]), mentions);
  var serviceSrc = fs.readFileSync(path.join(ROOT, "server/modules/diagnosis/service.js"), "utf8");
  check("[static] service selects identity + classifier only via resolveDebtContractVersion (no pago_mensual_actual / survey sniffing)",
    /CONTRACTS\[resolveDebtContractVersion\(args\.engineInput\)\]/.test(serviceSrc) && serviceSrc.indexOf("pago_mensual_actual") === -1 &&
    serviceSrc.indexOf("reclamo_disputa") === -1);

  // ---------- selection through the real service ----------
  var shape = [moraDebt("mora", 0)];
  var cases = [
    ["same shape, marker v1", input(shape, "v1"), ID_V1, SHADOW_02],
    ["same shape, marker v2", input(shape, "v2"), ID_V2, SHADOW_03],
    ["same shape, no marker (legacy)", input(shape), ID_V1, SHADOW_02],
  ];
  for (var i = 0; i < cases.length; i++) {
    var h = harness();
    var resp = await h.diagnose(cases[i][1]);
    var s = resp.v2_financial_strategy;
    var expectedId = cases[i][2] === ID_V1 ? deriveV1(clone(cases[i][1])) : deriveV2(clone(cases[i][1]));
    check("[select] " + cases[i][0] + " -> " + cases[i][2] + " + " + cases[i][3],
      !!s && s.financial_input_identity.version === cases[i][2] && s.provenance.classifier_version === cases[i][3] &&
      eq(s.financial_input_identity, { version: expectedId.version, value: expectedId.value }) &&
      h.store.evaluations.length === 1 && h.store.evaluations[0].classifier_version === cases[i][3] &&
      h.store.evaluations[0].financial_input_identity_version === cases[i][2], s);
  }

  var h1 = harness();
  var v2FieldUnderV1 = await h1.diagnose(input([moraDebt("atrasado_pagando", 10000)], "v1"));
  var plainV1 = await harness().diagnose(input([moraDebt("atrasado_pagando", 99999)], "v1"));
  check("[select] V2 field under v1 does not change version: shadow-02, identity v1, pago_mensual_actual ignored (same identity as another value)",
    v2FieldUnderV1.v2_financial_strategy.provenance.classifier_version === SHADOW_02 &&
    v2FieldUnderV1.v2_financial_strategy.financial_input_identity.version === ID_V1 &&
    eq(v2FieldUnderV1.v2_financial_strategy.financial_input_identity, plainV1.v2_financial_strategy.financial_input_identity));

  var missing = clone(input([debt("atrasado_pagando", { pago: 4000, ultimo_pago_declarado: 4000 })], "v2"));
  var hm = harness();
  var respMissing = await hm.diagnose(missing);
  var sm = respMissing.v2_financial_strategy;
  check("[select] V2 field missing under v2: no silent fallback — still shadow-03 / identity v2, payment unknown (legacy pago / ultimo not used)",
    sm.provenance.classifier_version === SHADOW_03 && sm.financial_input_identity.version === ID_V2 &&
    sm.classification_status === "incomplete" &&
    sm.verification.missing_facts.some(function (f) { return f.fact === "monthly_debt_payment" && f.debt_index === 0; }) &&
    !respMissing.v2_action_context, sm);

  var invalidMarkers = [null, "", "V2", 2, "v3"];
  for (var k = 0; k < invalidMarkers.length; k++) {
    var hi = harness();
    var warned = [];
    var origWarn = console.warn;
    console.warn = function (m) { warned.push(String(m)); };
    var respInvalid;
    try {
      respInvalid = await hi.diagnose(input(shape, invalidMarkers[k]));
    } finally {
      console.warn = origWarn;
    }
    check("[select] invalid marker " + JSON.stringify(invalidMarkers[k]) + ": legacy diagnosis kept, no V2 strategy, no evaluation, warns INVALID_DEBT_CONTRACT_VERSION",
      !!respInvalid.diagnosis_id && !!respInvalid.result && !("v2_financial_strategy" in respInvalid) &&
      !("v2_action_context" in respInvalid) && hi.store.evaluations.length === 0 && hi.diagnoses.length === 1 &&
      warned.some(function (w) { return w.indexOf("INVALID_DEBT_CONTRACT_VERSION") !== -1; }), { resp: respInvalid, warned: warned });
  }

  // ---------- legacy engine ignores the marker and the new field ----------
  var NOW = { now_ms: 1790000000000 };
  var baseLegacy = input([moraDebt("mora", 0), debt("pagando_normal", { pago: 5000 })]);
  var withMarker = Object.assign(clone(baseLegacy), { debt_contract_version: "v2" });
  var noNewField = clone(baseLegacy);
  noNewField.deudas.forEach(function (d) { delete d.pago_mensual_actual; });
  var engBase = runEngine(clone(baseLegacy), NOW).engine_result;
  var engMarker = runEngine(clone(withMarker), NOW).engine_result;
  var engNoField = runEngine(clone(noNewField), NOW).engine_result;
  var engDiff = [];
  (function diff(a, b, p) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      Object.keys(Object.assign({}, a, b)).forEach(function (k) { diff(a[k], b[k], p + "." + k); });
    } else engDiff.push(p + ": " + JSON.stringify(a) + " | " + JSON.stringify(b));
  })({ m: engBase, f: engBase }, { m: engMarker, f: engNoField }, "");
  check("[legacy] engine_result identical with / without marker and with / without pago_mensual_actual", engDiff.length === 0, engDiff.slice(0, 10));
  var hs = harness();
  await hs.diagnose(withMarker);
  check("[snapshot] marker and pago_mensual_actual persist in input_snapshot unchanged (0 stays 0)",
    hs.diagnoses[0].input_snapshot.debt_contract_version === "v2" && hs.diagnoses[0].input_snapshot.deudas[0].pago_mensual_actual === 0);

  // ---------- historical snapshots ----------
  var historical = input([debt("mora_reclamo", { pago: 0, estado: "mora", pago_fuente: "mora_sin_pago" })]);
  var hh = harness();
  var respHist = await hh.diagnose(historical);
  var direct02 = classifier.classifyFinancialShadow(clone(historical));
  check("[historical] mora_reclamo snapshot without marker -> v1 / shadow-02, same decision as the direct shadow-02 call, identity v1 value unchanged",
    respHist.v2_financial_strategy.provenance.classifier_version === SHADOW_02 &&
    respHist.v2_financial_strategy.strategy === direct02.strategy &&
    respHist.v2_financial_strategy.classification_status === direct02.classification_status &&
    eq(respHist.v2_financial_strategy.financial_input_identity, (function (x) { return { version: x.version, value: x.value }; })(deriveV1(clone(historical)))));
  var histV3 = classifier.classifyFinancialShadowV3(input([debt("mora_reclamo", { pago: 0 })], "v2"));
  check("[historical] mora_reclamo is never reinterpreted as mora / reclamo_disputa by shadow-03 (situation missing -> incomplete, no mora / dispute fact)",
    histV3.classification_status === "incomplete" &&
    !histV3.verification_reasons.some(function (r) { return r.code === "DEBT_IN_DISPUTE"; }) &&
    histV3.canonical_facts.debts[0].active_mora.status !== "KNOWN" , histV3.canonical_facts.debts[0]);

  // ---------- flows & action context through the service ----------
  var flows = [
    ["mora, pago 0", [moraDebt("mora", 0)], 30000, "REGULARIZACION"],
    ["atrasado, pago 10000", [moraDebt("atrasado_pagando", 10000)], 20000, "REGULARIZACION"],
    ["atrasado, pago 35000", [moraDebt("atrasado_pagando", 35000)], -5000, "CONTENCION"],
  ];
  for (var f = 0; f < flows.length; f++) {
    var hf = harness();
    var rf = await hf.diagnose(input(flows[f][1], "v2"));
    var stored = hf.store.evaluations[0].result;
    var ac = rf.v2_action_context;
    var okAc = flows[f][3] === "REGULARIZACION"
      ? eq(Object.keys(ac || {}), ["mora_debts"]) && eq(ac.mora_debts, [{ debt_index: 0 }])
      : eq(Object.keys(ac || {}).sort(), ["active_debts", "monthly_gap"]) && ac.monthly_gap.amount === 5000;
    check("[flow] income 60000, expenses 30000, " + flows[f][0] + " -> flow " + flows[f][2] + ", " + flows[f][3] +
      (flows[f][3] === "REGULARIZACION" ? ", action context only mora_debts (no surplus)" : ", action context gap 5000"),
      rf.v2_financial_strategy.strategy === flows[f][3] && stored.canonical_facts.canonical_flow === flows[f][2] &&
      okAc && JSON.stringify(ac).indexOf("surplus") === -1,
      { strategy: rf.v2_financial_strategy.strategy, flow: stored.canonical_facts.canonical_flow, ac: ac });
  }
  var hd = harness();
  var rd = await hd.diagnose(input([debt("reclamo_disputa", { pago: 0, estado: "mora", pago_mensual_actual: 0 })], "v2"));
  var sd = rd.v2_financial_strategy;
  check("[dispute] reclamo_disputa only: incomplete, strategy null, verification reason DEBT_IN_DISPUTE on the debt, no action context",
    sd.classification_status === "incomplete" && sd.strategy === null &&
    eq(sd.verification.reasons, [{ code: "DEBT_IN_DISPUTE", fact: "active_mora", subject: "debt", debt_index: 0 }]) &&
    rd.v2_action_context === null, sd);

  // ---------- dedup keys never collide ----------
  var hk = harness();
  await hk.diagnose(input(shape, "v1"));
  await hk.diagnose(input(shape, "v2"));
  await hk.diagnose(input([moraDebt("mora", null)], "v2"));
  await hk.diagnose(input([moraDebt("reclamo_disputa", 0)], "v2"));
  await hk.diagnose(input(shape, "v2"));
  var keys = hk.store.evaluations.map(function (e) { return [e.financial_input_identity_version, e.financial_input_identity, e.classifier_version].join("|"); });
  check("[dedup] v1/shadow-02 vs v2/shadow-03, 0 vs null, mora vs reclamo -> 4 distinct evaluations; repeat v2 reuses (5 diagnoses, 5 links)",
    hk.store.evaluations.length === 4 && new Set(keys).size === 4 && hk.store.links.length === 5 &&
    hk.store.links[4].evaluation_id === hk.store.links[1].evaluation_id, keys);
  var otherJourney = harness();
  await otherJourney.diagnose(input(shape, "v2"), JOURNEY);
  await otherJourney.diagnose(input(shape, "v2"), JOURNEY_2);
  check("[dedup] same v2 identity in another journey is a separate evaluation (journey-scoped, unchanged)",
    otherJourney.store.evaluations.length === 2);

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("DEBT_CONTRACT_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
