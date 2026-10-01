/**
 * server/bin/v2-strategy-test.js — V2-NEW-STRATEGY-INTEGRATION-01 (compute-only).
 *
 * Real JANUS builder → Mi Plan journey (memory repo, same service as production) →
 * POST /v1/diagnoses with journey_id → legacy engine unchanged + new classifier persisted
 * only for survey V2 journeys. Also checks the Supabase repository calls with a fake
 * client and the (unapplied) migration file statically. No network, no DB.
 * JANUS repo path: JANUS_REPO_DIR or ../../Mie Backend/mie-backend.
 *
 * node server/bin/v2-strategy-test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var http = require("http");
var path = require("path");

var ROOT = path.join(__dirname, "..", "..");
var JANUS_DIR = process.env.JANUS_REPO_DIR || path.join(ROOT, "..", "..", "Mie Backend", "mie-backend");

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createMemoryJourneyRepository = require("../modules/journey/repository").createMemoryJourneyRepository;
var createJourneyRepository = require("../modules/journey/repository").createJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;
var createDiagnosisRepository = require("../modules/diagnosis/repository").createDiagnosisRepository;
var extractEngineInput = require("../modules/diagnosis/service").extractEngineInput;
var deriveFinancialInputIdentity = require("../modules/diagnosis/financialIdentity").deriveFinancialInputIdentity;
var createMemoryStrategyEvaluationStore = require("../testing/memoryStrategyEvaluations").createMemoryStrategyEvaluationStore;
var classifier = require("../../engine/classifier/financial-classifier");
var buildActionContext = require("../modules/diagnosis/actionContext").buildActionContext;
var FIELDS_BY_STRATEGY = require("../modules/diagnosis/actionContext").FIELDS_BY_STRATEGY;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail) : ""));
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
  return JSON.parse(JSON.stringify(o));
}

// ---------- JANUS (real builder) ----------
if (!fs.existsSync(path.join(JANUS_DIR, "src", "lib", "miplanHandoffTokens.js"))) {
  console.error("JANUS repo not found at " + JANUS_DIR + " (set JANUS_REPO_DIR)");
  process.exit(1);
}
[["SUPABASE_URL", "https://example.supabase.co"], ["SUPABASE_SERVICE_ROLE_KEY", "test"],
  ["APIFY_TOKEN", "test"], ["APIFY_ACTOR_ID", "test"]].forEach(function (kv) {
  if (!process.env[kv[0]]) process.env[kv[0]] = kv[1];
});
delete process.env.MIPLAN_HANDOFF_SURVEY_V2_ENABLED;
var janusTokens = require(path.join(JANUS_DIR, "src", "lib", "miplanHandoffTokens"));

// Synthetic episode (no real person).
var EPISODE = {
  cz_id: 9002, ci: 11111111, lrw_id: "LRW-000-000-002", email: "qa-strategy@example.test",
  nombre: "QA", apellido: "Strategy", salario: 100000, relacion_laboral: "EPR",
  solicitudes_estados_id: 3, synced_at: "2026-09-29T12:00:00.000Z",
};
var ISSUED = "2026-09-29T12:00:00.000Z";
var BASE = { p1: "A", p2: "B", p3: "C", p4: "B", p5: "A", p6: "B", p8: "C", p9: "A", p10: "B" };
function surveyRow(version, p7, over) {
  return Object.assign({ cz_id: 77, ci: 11111111, completed_at: "2026-09-29T11:00:00.000Z",
    version_cuestionario: version, p7: p7 }, BASE, over || {});
}
function janusCtx(row, v2Enabled) {
  return janusTokens.buildAllowlistedContext(EPISODE, row, ISSUED, { surveyV2Enabled: v2Enabled === true });
}

// ---------- Engine input fixtures (confirmed income unless stated) ----------
var CONFIRMED = { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } };
function input(o) {
  return Object.assign({ ingreso: 100000, gastos: { vivienda: 40000 }, deudas: [],
    no_debts_declared: false, entry_context: clone(CONFIRMED) }, o);
}
function debt(monto, pago, sit) {
  return { monto: String(monto), pago: pago, situacion_ui: sit };
}
var LEGACY_ANSWERS = { p1: "C", p2: "C", p3: "C", p4: "C", p5: "C", p6: "C", p7: "C", p8: "C", p9: "C", p10: "C" };

var STRATEGY_CASES = [
  ["CONTENCION (flow < 0)", input({ gastos: { vivienda: 90000 }, deudas: [debt(100000, 20000, "pagando_normal")] }), "CONTENCION"],
  ["REGULARIZACION (flow >= 0 + active mora)", input({ deudas: [debt(100000, null, "deje_pagar")] }), "REGULARIZACION"],
  ["REDUCCION_CARGA (burden > T=30%)", input({ deudas: [debt(300000, 40000, "pagando_normal")] }), "REDUCCION_CARGA"],
  ["REDUCCION_CARGA (flow = 0)", input({ deudas: [debt(300000, 60000, "pagando_normal")] }), "REDUCCION_CARGA"],
  ["CONSOLIDACION (flow > 0, no mora, burden <= 30%)", input({ deudas: [debt(100000, 30000, "pagando_normal")] }), "CONSOLIDACION"],
  ["MANTENIMIENTO_OPTIMIZACION (no active debt)", input({ no_debts_declared: true }), "MANTENIMIENTO_OPTIMIZACION"],
];
var INCOMPLETE_CASES = [
  ["url_prefill income not confirmed", input({ entry_context: { field_provenance: { ingreso: { source: "url_prefill", user_modified: false } } },
    deudas: [debt(100000, 10000, "pagando_normal")] })],
  ["expenses missing (missing != 0)", input({ gastos: {}, deudas: [debt(100000, 10000, "pagando_normal")] })],
  ["debt payment unknown", input({ deudas: [debt(100000, null, "pagando_normal")] })],
  ["debt step not done", input({})],
  ["more than one compatible strategy", input({ deudas: [debt(100000, 10000, "atrasado_pagando"), debt(50000, 5000, "pagando_normal")] })],
];

// ---------- Harness ----------
var ANON = "33333333-3333-4333-8333-333333333333";
var OTHER_ANON = "44444444-4444-4444-8444-444444444444";
var FIXED_NOW = 1790000000000;
Date.now = function () { return FIXED_NOW; };

function memoryDiagnosisRepository(opts) {
  opts = opts || {};
  var diagnoses = [];
  var strategies = [];
  var store = createMemoryStrategyEvaluationStore();
  var n = 0;
  return {
    insertDiagnosis: async function (row) {
      n += 1;
      var id = "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
      diagnoses.push(Object.assign({ diagnosis_id: id }, clone(row)));
      return { diagnosis_id: id };
    },
    recordFinancialStrategyEvaluation: async function (row) {
      if (opts.failStrategyInsert) {
        var e = new Error("DB_STRATEGY_EVALUATION_FAILED");
        e.code = "DB_STRATEGY_EVALUATION_FAILED";
        throw e;
      }
      var dup = strategies.some(function (s) { return s.diagnosis_id === row.diagnosis_id; });
      if (!dup) strategies.push(clone(row));
      var reply = store.record(clone(row));
      return opts.strategyReply ? opts.strategyReply(reply) : reply;
    },
    upsertShadowResult: async function () { return null; },
    _test: { diagnoses: diagnoses, strategies: strategies },
  };
}

function startApp(diagRepo, journeyService, extra) {
  var service = createDiagnosisService(Object.assign({
    repository: diagRepo, tenantId: "miplan-default", journeyService: journeyService,
  }, extra || {}));
  var app = createApp(loadConfig({
    NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "",
  }), { journeyService: journeyService, diagnosisService: service });
  return new Promise(function (resolve) {
    var server = http.createServer(app);
    server.listen(0, "127.0.0.1", function () {
      resolve({ server: server, port: server.address().port });
    });
  });
}

function post(port, body, anon) {
  return new Promise(function (resolve, reject) {
    var raw = JSON.stringify(body);
    var req = http.request({ hostname: "127.0.0.1", port: port, path: "/v1/diagnoses", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw),
        "X-MiPlan-Anonymous-Id": anon || ANON } }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      });
    });
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

function withoutId(respBody) {
  var b = clone(respBody);
  delete b.diagnosis_id;
  return b;
}
var V2_PROP = "v2_financial_strategy";
var AC_PROP = "v2_action_context";
function hasV2(respBody) {
  return Object.prototype.hasOwnProperty.call(respBody, V2_PROP);
}
function hasAC(respBody) {
  return Object.prototype.hasOwnProperty.call(respBody, AC_PROP);
}
function legacyPart(respBody) {
  var b = clone(respBody);
  delete b[V2_PROP];
  delete b[AC_PROP];
  return b;
}
var PUBLIC_V2_KEYS = ["survey_version", "classification_status", "strategy", "reasons", "verification", "provenance",
  "financial_input_identity"];
var PUBLIC_V2_NESTED_KEYS = ["required", "missing_facts", "classifier_version", "contract", "code", "fact", "subject", "debt_index",
  "version", "value"];
function expectedProjection(result, postedBody) {
  function ref(x) {
    var o = { fact: x.fact, subject: x.subject };
    if (x.subject === "debt") o.debt_index = x.debt_index;
    return o;
  }
  return {
    survey_version: 2,
    classification_status: result.classification_status,
    strategy: result.strategy,
    reasons: result.entry_reasons,
    verification: {
      required: result.verification_required,
      reasons: result.verification_reasons.map(function (x) { return Object.assign({ code: x.code }, ref(x)); }),
      missing_facts: result.missing_required_facts.map(ref),
    },
    provenance: { classifier_version: result.classifier_version, contract: result.contract },
    financial_input_identity: deriveFinancialInputIdentity(extractEngineInput(clone(postedBody))),
  };
}

async function main() {
  var journeyRepo = createMemoryJourneyRepository();
  var journeyService = createJourneyService({ repository: journeyRepo, tenantId: "miplan-default" });
  // Pre-change behaviour: same journey ownership, no survey-version capability.
  var legacyJourneyService = { assertOwned: journeyService.assertOwned };

  var contexts = {
    V1: janusCtx(surveyRow(1, "B"), false),
    V2_E: janusCtx(surveyRow(2, "E"), true),
    V2_J: janusCtx(surveyRow(2, "J"), true),
    WITHHELD: janusCtx(surveyRow(2, "E"), false),
    ABSENT: janusCtx(null, true),
  };
  var journeys = {};
  var names = Object.keys(contexts);
  for (var i = 0; i < names.length; i++) {
    var j = await journeyService.createFromHandoffRedeem(ANON, "v2-strategy-" + names[i], clone(contexts[names[i]]));
    journeys[names[i]] = j.journey_id;
  }
  var stored = function (name) { return journeyRepo._test.byId.get(journeys[name]).bootstrap_context; };
  check("fixtures: V1 journey stores survey v1, V2 E/J store survey v2, withheld/absent store no survey",
    stored("V1").survey && stored("V1").survey.source_survey_version === 1 &&
    stored("V2_E").survey.source_survey_version === 2 && stored("V2_J").survey.source_survey_version === 2 &&
    stored("V2_E").survey.loan_purpose !== stored("V2_J").survey.loan_purpose &&
    !stored("WITHHELD").survey && stored("WITHHELD").survey_handoff.status === "withheld" && !stored("ABSENT").survey);

  // Survey version resolved server-side (memory repo mirrors the RPC contract).
  var versions = {};
  for (var k = 0; k < names.length; k++) {
    versions[names[k]] = await journeyService.surveyVersionOf(journeys[names[k]], ANON);
  }
  check("surveyVersionOf: V1=1, V2_E=2, V2_J=2, WITHHELD=null, ABSENT=null",
    eq(versions, { V1: 1, V2_E: 2, V2_J: 2, WITHHELD: null, ABSENT: null }), versions);
  var ownErr = null;
  try { await journeyService.surveyVersionOf(journeys.V2_E, OTHER_ANON); } catch (e) { ownErr = e.code; }
  check("surveyVersionOf enforces journey ownership", ownErr === "JOURNEY_OWNERSHIP_MISMATCH", ownErr);
  var rejCtx = clone(contexts.V1);
  rejCtx.survey.source_survey_version = 3;
  journeys.UNKNOWN_VERSION = (await journeyService.createFromHandoffRedeem(ANON, "v2-strategy-UNKNOWN_VERSION", rejCtx)).journey_id;
  var unkVersion = await journeyService.surveyVersionOf(journeys.UNKNOWN_VERSION, ANON);
  check("surveyVersionOf: unknown survey version (3) -> null", unkVersion === null, unkVersion);
  var rejV2Ctx = clone(contexts.V2_E);
  rejV2Ctx.survey.loan_purpose = "not_a_loan_purpose";
  journeys.REJECTED = (await journeyService.createFromHandoffRedeem(ANON, "v2-strategy-REJECTED", rejV2Ctx)).journey_id;
  check("fixture: invalid V2 survey rejected at the boundary (survey_rejected, no survey stored)",
    !stored("REJECTED").survey && stored("REJECTED").survey_rejected &&
    stored("REJECTED").survey_rejected.source_survey_version === 2, stored("REJECTED"));
  // Raw bootstrap values that never pass the sanitizer, as if written directly in the DB.
  journeys.STRING_2 = (await journeyService.createFromHandoffRedeem(ANON, "v2-strategy-STRING_2", clone(contexts.V2_E))).journey_id;
  stored("STRING_2").survey.source_survey_version = "2";
  journeys.NULL_VERSION = (await journeyService.createFromHandoffRedeem(ANON, "v2-strategy-NULL_VERSION", clone(contexts.V2_E))).journey_id;
  stored("NULL_VERSION").survey.source_survey_version = null;
  var rawVersions = {
    REJECTED: await journeyService.surveyVersionOf(journeys.REJECTED, ANON),
    STRING_2: await journeyService.surveyVersionOf(journeys.STRING_2, ANON),
    NULL_VERSION: await journeyService.surveyVersionOf(journeys.NULL_VERSION, ANON),
  };
  check("surveyVersionOf: rejected survey, string \"2\" and JSON null -> null",
    eq(rawVersions, { REJECTED: null, STRING_2: null, NULL_VERSION: null }), rawVersions);

  var repo = memoryDiagnosisRepository();
  var baseRepo = memoryDiagnosisRepository();
  var app = await startApp(repo, journeyService);
  var baseApp = await startApp(baseRepo, legacyJourneyService);

  async function both(body, anon) {
    var a = await post(app.port, body, anon);
    var b = await post(baseApp.port, body, anon);
    return { now: a, base: b };
  }
  function lastStrategy() {
    return repo._test.strategies[repo._test.strategies.length - 1];
  }
  function lastDiagnosis(r) {
    return r._test.diagnoses[r._test.diagnoses.length - 1];
  }
  function sameAsBase(r) {
    return r.now.status === 200 && r.base.status === 200 && eq(withoutId(r.now.body), withoutId(r.base.body)) &&
      eq(Object.assign({}, lastDiagnosis(repo), { diagnosis_id: null }),
        Object.assign({}, lastDiagnosis(baseRepo), { diagnosis_id: null }));
  }
  // Confirmed V2: the legacy part is byte-identical to pre-change; v2_financial_strategy + v2_action_context are the only additions.
  function sameAsBaseV2(r) {
    return r.now.status === 200 && r.base.status === 200 && hasV2(r.now.body) && !hasV2(r.base.body) &&
      hasAC(r.now.body) && !hasAC(r.base.body) &&
      eq(withoutId(legacyPart(r.now.body)), withoutId(r.base.body)) &&
      eq(Object.keys(r.now.body), Object.keys(r.base.body).concat([V2_PROP, AC_PROP])) &&
      eq(Object.assign({}, lastDiagnosis(repo), { diagnosis_id: null }),
        Object.assign({}, lastDiagnosis(baseRepo), { diagnosis_id: null }));
  }

  // ---- V1 / unversioned / no journey: legacy only, nothing classified ----
  var nonV2 = [["[T5] V1", journeys.V1], ["[T6] WITHHELD", journeys.WITHHELD], ["[T7] REJECTED (invalid V2 survey)", journeys.REJECTED],
    ["[T8] ABSENT survey", journeys.ABSENT], ["[T9] no journey", null], ["[T10] UNKNOWN_VERSION (3)", journeys.UNKNOWN_VERSION],
    ["[T10] INVALID_VERSION (string \"2\")", journeys.STRING_2], ["[T10] INVALID_VERSION (JSON null)", journeys.NULL_VERSION]];
  for (var a = 0; a < nonV2.length; a++) {
    var before = repo._test.strategies.length;
    var body = Object.assign(clone(STRATEGY_CASES[4][1]), { tiene_encuesta: true, respuestas: clone(LEGACY_ANSWERS) });
    if (nonV2[a][1]) body.journey_id = nonV2[a][1];
    var r = await both(body);
    check(nonV2[a][0] + ": legacy response and persisted diagnosis identical to pre-change, no strategy computed",
      sameAsBase(r) && repo._test.strategies.length === before, { status: r.now.status, strategies: repo._test.strategies.length - before });
    check(nonV2[a][0] + ": v2_financial_strategy literally absent (no key, not null, not {})",
      !hasV2(r.now.body) && JSON.stringify(r.now.body).indexOf(V2_PROP) === -1, Object.keys(r.now.body));
  }

  // ---- V2: 6 deterministic strategies ----
  for (var s = 0; s < STRATEGY_CASES.length; s++) {
    var c = STRATEGY_CASES[s];
    var vb = Object.assign(clone(c[1]), { journey_id: journeys.V2_E });
    var vr = await both(vb);
    var row = lastStrategy();
    var direct = classifier.classifyFinancialShadow(clone(extractEngineInput(clone(vb))));
    check("V2 " + c[0] + ": strategy " + c[2] + ", legacy response unchanged, row = classifier output",
      sameAsBaseV2(vr) && row && row.diagnosis_id === vr.now.body.diagnosis_id && row.journey_id === journeys.V2_E &&
      row.survey_version === 2 && row.classification_status === "classified" && row.strategy === c[2] &&
      row.classifier_version === classifier.CLASSIFIER_VERSION && row.contract === "CLASSIFIER-CONTRACT-CONSOLIDATED-01" &&
      row.threshold_version === "T-v1" && row.result.debt_burden_threshold === 0.30 &&
      row.result.invariant_violations.length === 0 && eq(row.result, direct),
      row && { strategy: row.strategy, status: row.classification_status });
    check("[T1] V2 " + c[0] + ": persistence confirmed -> v2_financial_strategy = projection of the persisted row (legacy fields untouched)",
      eq(vr.now.body[V2_PROP], expectedProjection(row.result, vb)) && vr.now.body[V2_PROP].strategy === c[2] &&
      vr.now.body[V2_PROP].classification_status === "classified" && vr.now.body[V2_PROP].reasons.length > 0 &&
      vr.now.body[V2_PROP].verification.missing_facts.length === 0 &&
      JSON.stringify(legacyPart(vr.now.body)).indexOf(c[2]) === -1 && vr.now.body.strategy === undefined,
      vr.now.body[V2_PROP]);
    check("V2 " + c[0] + ": v2_action_context = action_context of the persisted evaluation result (never computed from the request)",
      eq(vr.now.body[AC_PROP], buildActionContext(row.result)) && vr.now.body[AC_PROP] !== null &&
      eq(Object.keys(vr.now.body[AC_PROP]), FIELDS_BY_STRATEGY[c[2]]), vr.now.body[AC_PROP]);
  }

  // ---- V2: incomplete ----
  for (var q = 0; q < INCOMPLETE_CASES.length; q++) {
    var ic = INCOMPLETE_CASES[q];
    var ib = Object.assign(clone(ic[1]), { journey_id: journeys.V2_E });
    var ir = await both(ib);
    var irow = lastStrategy();
    check("V2 incomplete — " + ic[0] + ": classification_status incomplete, strategy null, missing facts listed",
      sameAsBaseV2(ir) && irow && irow.diagnosis_id === ir.now.body.diagnosis_id &&
      irow.classification_status === "incomplete" && irow.strategy === null &&
      irow.result.missing_required_facts.length > 0 && irow.result.invariant_violations.length === 0,
      irow && { status: irow.classification_status, strategy: irow.strategy, missing: irow.result.missing_required_facts });
    var iv = ir.now.body[V2_PROP];
    check("[T2] V2 incomplete — " + ic[0] + ": 200 + v2_financial_strategy {survey_version 2, incomplete, strategy null} = row projection",
      ir.now.status === 200 && iv && iv.survey_version === 2 && iv.classification_status === "incomplete" &&
      iv.strategy === null && Object.prototype.hasOwnProperty.call(iv, "strategy") && eq(iv.reasons, []) &&
      iv.verification.required === true && iv.verification.reasons.length > 0 &&
      iv.verification.missing_facts.length > 0 && eq(iv, expectedProjection(irow.result, ib)), iv);
    check("V2 incomplete — " + ic[0] + ": v2_action_context present and null (no strategy, nothing to act on)",
      hasAC(ir.now.body) && ir.now.body[AC_PROP] === null, ir.now.body[AC_PROP]);
  }
  var unconfirmed = repo._test.strategies[repo._test.strategies.length - INCOMPLETE_CASES.length];
  check("V2 incomplete: unconfirmed URL income reported as INCOME_PREFILL_UNCONFIRMED (not treated as 0)",
    unconfirmed.result.canonical_facts.monthly_income === classifier.UNKNOWN &&
    unconfirmed.result.verification_reasons.some(function (v) { return v.code === "INCOME_PREFILL_UNCONFIRMED"; }),
    unconfirmed.result.verification_reasons);

  // ---- V2-HANDOFF-INCOME-AUTHORITY-01: income declared in Credizona, carried by the handoff ----
  var HANDOFF_PROV = { source: "handoff", user_modified: false, detail: "handoff" };
  var bootIncome = stored("V2_E").financial_prefill && stored("V2_E").financial_prefill.ingreso;
  check("fixture: V2 journey bootstrap carries the Credizona income (financial_prefill.ingreso = salario)",
    bootIncome === EPISODE.salario, stored("V2_E").financial_prefill);
  function handoffBody(o, prov) {
    return Object.assign(clone(STRATEGY_CASES[4][1]), { ingreso: bootIncome, entry_context: { field_provenance: { ingreso: prov || HANDOFF_PROV } },
      journey_id: journeys.V2_E }, o || {});
  }
  var hr = await both(handoffBody());
  var hrow = clone(lastStrategy());
  check("V2 + Credizona handoff income: income known, classified normally (CONSOLIDACION), legacy response unchanged",
    sameAsBaseV2(hr) && hrow.classification_status === "classified" && hrow.strategy === "CONSOLIDACION" &&
    hrow.result.canonical_facts.monthly_income === bootIncome && hrow.result.missing_required_facts.length === 0 &&
    !hrow.result.verification_reasons.some(function (x) { return x.fact === "monthly_income"; }),
    { status: hrow.classification_status, strategy: hrow.strategy, reasons: hrow.result.verification_reasons });
  check("V2 + Credizona handoff income: provenance kept as source handoff, nature user_declared",
    eq(hrow.result.provenance.income, { source: "handoff", detail: "handoff", user_modified: false, nature: "user_declared",
      prefill_unconfirmed: false }), hrow.result.provenance.income);
  await post(app.port, handoffBody(null, { source: "user_entered", user_modified: true }));
  var urow = clone(lastStrategy());
  var hFin = clone(hrow.result);
  var uFin = clone(urow.result);
  delete hFin.provenance.income;
  delete uFin.provenance.income;
  check("invariance: same income entered in Mi Plan vs declared in Credizona -> identical financial classification",
    eq(hFin, uFin) && urow.strategy === hrow.strategy &&
    urow.result.provenance.income.source === "user_entered" && urow.result.provenance.income.nature === "user_declared");
  var negatives = [
    ["handoff without income", handoffBody({ ingreso: undefined }), "INCOME_UNKNOWN"],
    ["handoff income 0", handoffBody({ ingreso: 0 }), "INCOME_UNKNOWN"],
    ["handoff income not canonical ('65,000')", handoffBody({ ingreso: "65,000" }), "INCOME_UNKNOWN"],
    ["handoff income not a number ('abc')", handoffBody({ ingreso: "abc" }), "INCOME_UNKNOWN"],
    ["handoff provenance without detail", handoffBody(null, { source: "handoff", user_modified: false }), "INCOME_PREFILL_UNCONFIRMED"],
    ["handoff provenance with foreign detail", handoffBody(null, { source: "handoff", user_modified: false, detail: "backend" }),
      "INCOME_PREFILL_UNCONFIRMED"],
    ["url_prefill claiming detail handoff", handoffBody(null, { source: "url_prefill", user_modified: false, detail: "handoff" }),
      "INCOME_PREFILL_UNCONFIRMED"],
  ];
  for (var ng = 0; ng < negatives.length; ng++) {
    var nb = JSON.parse(JSON.stringify(negatives[ng][1]));
    var nr = await both(nb);
    var nrow = lastStrategy();
    check("V2 negative — " + negatives[ng][0] + ": income stays unknown (" + negatives[ng][2] + "), incomplete",
      sameAsBaseV2(nr) && nrow.diagnosis_id === nr.now.body.diagnosis_id &&
      nrow.result.canonical_facts.monthly_income === classifier.UNKNOWN && nrow.classification_status === "incomplete" &&
      nrow.strategy === null && nrow.result.verification_reasons.some(function (x) { return x.code === negatives[ng][2]; }),
      { income: nrow.result.canonical_facts.monthly_income, reasons: nrow.result.verification_reasons });
  }

  // ---- Invariance: P7=E vs P7=J, behavioural signals, legacy plan/scoreReset ----
  var facts = STRATEGY_CASES[4][1];
  var variants = [
    ["V2 P7=E", journeys.V2_E, {}],
    ["V2 P7=J", journeys.V2_J, {}],
    ["V2 P7=E + legacy answers (legacy plan/scoreReset change)", journeys.V2_E, { tiene_encuesta: true, respuestas: clone(LEGACY_ANSWERS) }],
    ["V2 P7=J + all-A answers", journeys.V2_J, { tiene_encuesta: true, respuestas: { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" } }],
    ["V2 P7=E + behavioural extras", journeys.V2_E, { loan_purpose: "other", help_receptivity: "autonomous", survey_version: 2 }],
  ];
  var invRows = [];
  var legacyViews = [];
  for (var v = 0; v < variants.length; v++) {
    var ivb = Object.assign(clone(facts), variants[v][2], { journey_id: variants[v][1] });
    var ivr = await post(app.port, ivb);
    invRows.push(clone(lastStrategy().result));
    legacyViews.push({ planId: ivr.body.result.planId, scoreReset: ivr.body.result.scoreReset, nivelR: ivr.body.result.nivelR,
      enc: ivr.body.result.enc });
  }
  check("invariance: P7=E vs P7=J and behavioural variants -> identical full classifier output (" + invRows[0].strategy + ")",
    invRows.every(function (x) { return eq(x, invRows[0]); }), invRows.map(function (x) { return x.strategy; }));
  check("legacy has no authority: legacy planId/scoreReset/enc differ across variants while strategy is identical",
    !eq(legacyViews[0], legacyViews[2]) && eq(invRows[0], invRows[2]), legacyViews);

  // ---- V2-END-TO-END-WIRING-01: public contract of v2_financial_strategy ----
  var piiBody = Object.assign(clone(facts), { journey_id: journeys.V2_E, deudas: [Object.assign(debt(100000, 30000, "pagando_normal"),
    { acreedor: "Acreedor Privado QA-9931", tipo: "prestamo" })], nombre: EPISODE.nombre, email: EPISODE.email });
  var pii = await post(app.port, piiBody);
  var pv = pii.body[V2_PROP];
  var FORBIDDEN_KEYS = ["canonical_facts", "debts", "debug", "invariant_violations", "threshold_version",
    "debt_burden_threshold", "verification_required", "verification_reasons", "missing_required_facts", "entry_reasons",
    "compatible_strategies", "income", "debt_set_basis", "excluded_debts", "legacy_situation_mapping_debt_indices",
    "acreedor", "acreedor_raw", "nombre", "email", "ci", "celular", "telefono", "planId", "plan_id", "scoreReset", "nivelR"];
  var seenKeys = [];
  (function walk(x) {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x && typeof x === "object") Object.keys(x).forEach(function (k) { seenKeys.push(k); walk(x[k]); });
  })(pv);
  check("contract: v2_financial_strategy has exactly the 7 public keys, survey_version numeric 2 from the journey bootstrap",
    pii.status === 200 && pv && eq(Object.keys(pv), PUBLIC_V2_KEYS) && pv.survey_version === 2, pv && Object.keys(pv));
  check("contract: financial_input_identity = {version financial_input_identity_v1, value sha256 hex} derived by the server",
    pv && eq(Object.keys(pv.financial_input_identity), ["version", "value"]) &&
    pv.financial_input_identity.version === "financial_input_identity_v1" && /^[0-9a-f]{64}$/.test(pv.financial_input_identity.value) &&
    eq(pv.financial_input_identity, deriveFinancialInputIdentity(extractEngineInput(clone(piiBody)))),
    pv && pv.financial_input_identity);
  check("contract: verification = {required, reasons, missing_facts}; provenance = {classifier_version, contract}",
    pv && eq(Object.keys(pv.verification), ["required", "reasons", "missing_facts"]) &&
    typeof pv.verification.required === "boolean" && pv.verification.required === (pv.verification.reasons.length > 0) &&
    eq(pv.provenance, { classifier_version: classifier.CLASSIFIER_VERSION, contract: "CLASSIFIER-CONTRACT-CONSOLIDATED-01" }),
    pv && { verification: pv.verification, provenance: pv.provenance });
  check("contract: nested keys only from the public allowlist; no internal / threshold / legacy / PII keys anywhere",
    seenKeys.every(function (k) { return PUBLIC_V2_NESTED_KEYS.concat(PUBLIC_V2_KEYS).indexOf(k) !== -1; }) &&
    FORBIDDEN_KEYS.every(function (k) { return seenKeys.indexOf(k) === -1; }), seenKeys);
  var pvRaw = JSON.stringify(pv);
  check("contract: no PII / free text in v2_financial_strategy (creditor, name, email, CI, amounts)",
    [piiBody.deudas[0].acreedor, EPISODE.nombre, EPISODE.apellido, EPISODE.email, String(EPISODE.ci), "100000", "30000"]
      .every(function (s) { return pvRaw.indexOf(s) === -1; }), pvRaw);

  // ---- Legacy independence (same facts / different planId; same planId / different facts) ----
  var indepA = [];
  var extrasA = [{}, { tiene_encuesta: true, respuestas: clone(LEGACY_ANSWERS) },
    { tiene_encuesta: true, respuestas: { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" } }];
  for (var ia = 0; ia < extrasA.length; ia++) {
    var ra = await post(app.port, Object.assign(clone(facts), extrasA[ia], { journey_id: journeys.V2_E }));
    indepA.push({ planId: ra.body.result.planId, v2: ra.body[V2_PROP] });
  }
  var planIdsA = indepA.map(function (x) { return x.planId; });
  check("independence A: same financial facts, different legacy planId (" + planIdsA.join("/") + ") -> identical v2_financial_strategy (" +
    indepA[0].v2.strategy + ")",
    planIdsA.filter(function (p, i) { return planIdsA.indexOf(p) === i; }).length === planIdsA.length &&
    indepA.every(function (x) { return x.v2 && eq(x.v2, indepA[0].v2); }), indepA);
  async function planAndStrategy(cases, extra) {
    var outB = [];
    for (var ib = 0; ib < cases.length; ib++) {
      var rb = await post(app.port, Object.assign(clone(cases[ib][1]), extra, { journey_id: journeys.V2_E }));
      outB.push({ planId: rb.body.result.planId, strategy: rb.body[V2_PROP] && rb.body[V2_PROP].strategy });
    }
    return outB;
  }
  var indepB1 = await planAndStrategy(STRATEGY_CASES, { tiene_encuesta: true, respuestas: clone(LEGACY_ANSWERS) });
  var stratsB1 = indepB1.map(function (x) { return x.strategy; });
  check("independence B: same legacy planId (" + indepB1[0].planId + ") with different facts -> the 5 different strategies",
    indepB1.every(function (x) { return x.planId === indepB1[0].planId; }) &&
    classifier.STRATEGY_ORDER.every(function (st) { return stratsB1.indexOf(st) !== -1; }), indepB1);
  var indepB2 = await planAndStrategy([STRATEGY_CASES[4], STRATEGY_CASES[5]], {});
  check("independence B (no legacy survey): same planId (" + indepB2[0].planId + ") -> CONSOLIDACION vs MANTENIMIENTO_OPTIMIZACION",
    indepB2[0].planId === indepB2[1].planId && indepB2[0].strategy === "CONSOLIDACION" &&
    indepB2[1].strategy === "MANTENIMIENTO_OPTIMIZACION", indepB2);
  var projSrc = require("../modules/diagnosis/service").projectV2FinancialStrategy.toString();
  check("no strategy <-> planId mapping: projection reads only the classifier result (no planId/scoreReset/nivelR/engine_result)",
    !/planId|plan_id|scoreReset|nivelR|engine_result|flujo|mora|carga/i.test(projSrc), projSrc);

  // ---- Failure isolation (migration not applied, DB error, classifier error) ----
  var failingJourney = {
    assertOwned: journeyService.assertOwned,
    surveyVersionOf: async function () {
      var e = new Error("DB_JOURNEY_SURVEY_VERSION_FAILED");
      e.code = "DB_JOURNEY_SURVEY_VERSION_FAILED";
      throw e;
    },
  };
  var failRepoA = memoryDiagnosisRepository();
  var failAppA = await startApp(failRepoA, failingJourney);
  var failRepoB = memoryDiagnosisRepository({ failStrategyInsert: true });
  var failAppB = await startApp(failRepoB, journeyService);
  var failRepoC = memoryDiagnosisRepository();
  var failAppC = await startApp(failRepoC, journeyService, { classifyFn: function () { throw new Error("boom"); } });
  var fb = Object.assign(clone(facts), { journey_id: journeys.V2_E });
  var refResp = await post(baseApp.port, fb);
  var warn = console.warn;
  var warnings = [];
  console.warn = function (m) { warnings.push(String(m)); };
  var fa = await post(failAppA.port, fb);
  var fbr = await post(failAppB.port, fb);
  var fc = await post(failAppC.port, fb);
  console.warn = warn;
  check("RPC missing/failing (migration not applied): 200, legacy response unchanged, no strategy row",
    fa.status === 200 && eq(withoutId(fa.body), withoutId(refResp.body)) && failRepoA._test.strategies.length === 0);
  check("strategy insert failure: 200, legacy response unchanged",
    fbr.status === 200 && eq(withoutId(fbr.body), withoutId(refResp.body)));
  check("[T3] classifier exception: 200, legacy response unchanged, no strategy row",
    fc.status === 200 && eq(withoutId(fc.body), withoutId(refResp.body)) && failRepoC._test.strategies.length === 0);
  check("failures logged by code only (no input data)",
    warnings.length === 3 && warnings.every(function (w) { return /^\[v2-strategy\] not recorded: [A-Za-z_]+$/.test(w); }), warnings);
  check("survey-version failure / insert failure / classifier failure: v2_financial_strategy literally absent",
    [fa, fbr, fc].every(function (x) { return !hasV2(x.body) && JSON.stringify(x.body).indexOf(V2_PROP) === -1; }));

  // ---- Exposure requires a confirmed write (RPC reply), never a read-back ----
  var classifyCalls = [];
  var spyClassify = function (ei) {
    var out = classifier.classifyFinancialShadow(ei);
    classifyCalls.push({ status: out.classification_status, strategy: out.strategy });
    return out;
  };
  var failRepoD = memoryDiagnosisRepository({ failStrategyInsert: true });
  var failAppD = await startApp(failRepoD, journeyService, { classifyFn: spyClassify });
  var unconfirmedReplies = [
    ["RPC reply without linked flag", function (x) { delete x.linked; return x; }],
    ["RPC reply without evaluation_id", function (x) { delete x.evaluation_id; return x; }],
    ["RPC reply for another diagnosis_id", function (x) { return Object.assign(x, { diagnosis_id: "00000000-0000-4000-8000-999999999999" }); }],
    ["RPC reply with another classification_status", function (x) { return Object.assign(x, { classification_status: "incomplete" }); }],
    ["RPC reply with another strategy", function (x) { return Object.assign(x, { strategy: "CONTENCION" }); }],
    ["RPC reply for another financial identity", function (x) { return Object.assign(x, { financial_input_identity: new Array(65).join("0") }); }],
    ["RPC reply for another identity version", function (x) { return Object.assign(x, { financial_input_identity_version: "financial_input_identity_v2" }); }],
    ["RPC reply for another classifier_version", function (x) { return Object.assign(x, { classifier_version: "other-classifier" }); }],
    ["RPC reply whose stored result has another strategy", function (x) { x.result.strategy = "CONTENCION"; return x; }],
    ["RPC reply without stored result", function (x) { delete x.result; return x; }],
    ["RPC reply null", function () { return null; }],
  ];
  var unconfirmedApps = [];
  for (var ur = 0; ur < unconfirmedReplies.length; ur++) {
    var urRepo = memoryDiagnosisRepository({ strategyReply: unconfirmedReplies[ur][1] });
    unconfirmedApps.push({ name: unconfirmedReplies[ur][0], repo: urRepo, app: await startApp(urRepo, journeyService) });
  }
  var warnings2 = [];
  console.warn = function (m) { warnings2.push(String(m)); };
  var fd = await post(failAppD.port, fb);
  var dWarnings = warnings2.slice();
  var urResp = [];
  for (var uq = 0; uq < unconfirmedApps.length; uq++) {
    urResp.push(await post(unconfirmedApps[uq].app.port, fb));
  }
  console.warn = warn;
  console.log("EVIDENCE persistence failure: classifier calls=" + JSON.stringify(classifyCalls) + " strategy rows=" +
    failRepoD._test.strategies.length + " http=" + fd.status + " hasOwnProperty(" + V2_PROP + ")=" + hasV2(fd.body) +
    " keys=" + JSON.stringify(Object.keys(fd.body)) + " warning=" + JSON.stringify(dWarnings));
  check("[T4] persistence failure after a successful classification: classifier ran (CONSOLIDACION), insert threw, 200, property absent",
    classifyCalls.length === 1 && classifyCalls[0].strategy === "CONSOLIDACION" && failRepoD._test.strategies.length === 0 &&
    fd.status === 200 && !hasV2(fd.body) && eq(withoutId(fd.body), withoutId(refResp.body)), { calls: classifyCalls, body: Object.keys(fd.body) });
  check("persistence failure: one structured warning, code only (DB_STRATEGY_EVALUATION_FAILED), no error details in the response",
    eq(dWarnings, ["[v2-strategy] not recorded: DB_STRATEGY_EVALUATION_FAILED"]) &&
    JSON.stringify(fd.body).indexOf("DB_STRATEGY_EVALUATION_FAILED") === -1 && JSON.stringify(fd.body).indexOf("v2-strategy") === -1, dWarnings);
  for (var uc = 0; uc < unconfirmedApps.length; uc++) {
    check("unconfirmed write — " + unconfirmedApps[uc].name + ": 200, legacy response unchanged, property absent",
      urResp[uc].status === 200 && !hasV2(urResp[uc].body) && eq(withoutId(urResp[uc].body), withoutId(refResp.body)),
      Object.keys(urResp[uc].body));
  }
  check("unconfirmed writes: one structured warning each (V2_STRATEGY_WRITE_UNCONFIRMED), code only",
    warnings2.length === 1 + unconfirmedApps.length &&
    warnings2.slice(1).every(function (w) { return w === "[v2-strategy] not recorded: V2_STRATEGY_WRITE_UNCONFIRMED"; }), warnings2);
  check("confirmation uses the write reply only (no read-back of financial_strategy_results in service/repository)",
    ["service.js", "repository.js"].every(function (f) {
      var src = fs.readFileSync(path.join(ROOT, "server", "modules", "diagnosis", f), "utf8");
      return !/getFinancialStrategy|selectFinancialStrategy|from\(["']financial_strategy_results/.test(src);
    }));
  [failAppD].concat(unconfirmedApps.map(function (x) { return x.app; })).forEach(function (x) { x.server.close(); });

  // ---- DB-side V2 authority rejects (SURVEY_VERSION_NOT_V2) through the real Supabase repository ----
  var notV2Calls = [];
  var notV2Client = {
    rpc: async function (name, params) {
      notV2Calls.push({ name: name, params: clone(params) });
      if (name === "miplan_persist_diagnosis") return { data: "00000000-0000-4000-8000-00000000abcd", error: null };
      if (name === "miplan_record_financial_strategy_evaluation") {
        return { data: null, error: { message: "SURVEY_VERSION_NOT_V2", code: "55000" } };
      }
      return { data: null, error: { message: "unexpected rpc " + name } };
    },
  };
  var notV2Repo = createDiagnosisRepository({ client: notV2Client, backendSecret: "s3cret", tenantId: "miplan-default" });
  var notV2App = await startApp(notV2Repo, journeyService);
  var warnings3 = [];
  console.warn = function (m) { warnings3.push(String(m)); };
  var nv = await post(notV2App.port, fb);
  console.warn = warn;
  notV2App.server.close();
  var nvPersist = notV2Calls.filter(function (x) { return x.name === "miplan_persist_diagnosis"; });
  var nvInsert = notV2Calls.filter(function (x) { return x.name === "miplan_record_financial_strategy_evaluation"; });
  var baseDiag = lastDiagnosis(baseRepo);
  console.log("EVIDENCE SURVEY_VERSION_NOT_V2: http=" + nv.status + " hasOwnProperty(" + V2_PROP + ")=" + hasV2(nv.body) +
    " keys=" + JSON.stringify(Object.keys(nv.body)) + " rpc_calls=" + JSON.stringify(notV2Calls.map(function (x) { return x.name; })) +
    " warning=" + JSON.stringify(warnings3));
  check("SURVEY_VERSION_NOT_V2 from the insert RPC: 200, legacy response identical to pre-change, v2_financial_strategy absent (no key, not null, not {})",
    nv.status === 200 && eq(withoutId(nv.body), withoutId(refResp.body)) && !hasV2(nv.body) &&
    JSON.stringify(nv.body).indexOf(V2_PROP) === -1 && nv.body.diagnosis_id === "00000000-0000-4000-8000-00000000abcd",
    { status: nv.status, keys: Object.keys(nv.body) });
  check("SURVEY_VERSION_NOT_V2: legacy diagnosis persisted once and intact (same snapshot/result as pre-change), insert RPC attempted once",
    nvPersist.length === 1 && nvInsert.length === 1 &&
    eq(nvPersist[0].params.p_engine_result, baseDiag.engine_result) && eq(nvPersist[0].params.p_input_snapshot, baseDiag.input_snapshot) &&
    nvPersist[0].params.p_journey_id === journeys.V2_E && nvInsert[0].params.p_diagnosis_id === "00000000-0000-4000-8000-00000000abcd",
    notV2Calls.map(function (x) { return x.name; }));
  check("SURVEY_VERSION_NOT_V2: one structured warning with the DB code only, nothing leaked in the response",
    eq(warnings3, ["[v2-strategy] not recorded: SURVEY_VERSION_NOT_V2"]) &&
    JSON.stringify(nv.body).indexOf("SURVEY_VERSION") === -1 && JSON.stringify(nv.body).indexOf("v2-strategy") === -1, warnings3);

  var own = await post(app.port, Object.assign(clone(facts), { journey_id: journeys.V2_E }), OTHER_ANON);
  check("foreign journey_id still rejected before any engine/classifier work (403)",
    own.status === 403 && own.body && JSON.stringify(own.body).indexOf("JOURNEY_OWNERSHIP_MISMATCH") !== -1, own);

  [app, baseApp, failAppA, failAppB, failAppC].forEach(function (x) { x.server.close(); });

  // ---- Supabase repositories (fake client) ----
  var calls = [];
  function fakeClient(reply) {
    return { rpc: async function (name, params) { calls.push({ name: name, params: params }); return reply(name, params); } };
  }
  var jr = createJourneyRepository({ client: fakeClient(function () { return { data: 2, error: null }; }),
    backendSecret: "s3cret", tenantId: "t" });
  var gv = await jr.getJourneySurveyVersion("11111111-1111-4111-8111-111111111111", ANON);
  check("journey repo: calls miplan_get_journey_survey_version(p_secret, p_journey_id, p_anonymous_id) -> 2",
    gv === 2 && calls[0].name === "miplan_get_journey_survey_version" &&
    eq(Object.keys(calls[0].params).sort(), ["p_anonymous_id", "p_journey_id", "p_secret"]) && calls[0].params.p_secret === "s3cret");
  var odd = [];
  var oddValues = ["2", 3, 0, null, 2.5, true];
  for (var ov = 0; ov < oddValues.length; ov++) {
    var val = oddValues[ov];
    var jro = createJourneyRepository({ client: fakeClient(function () { return { data: val, error: null }; }),
      backendSecret: "s3cret", tenantId: "t" });
    odd.push(await jro.getJourneySurveyVersion("11111111-1111-4111-8111-111111111111", ANON));
  }
  check("journey repo: anything other than 1/2 normalizes to null", odd.every(function (x) { return x === null; }), odd);
  var jre = createJourneyRepository({ client: fakeClient(function () { return { data: null, error: { message: "function does not exist" } }; }),
    backendSecret: "s3cret", tenantId: "t" });
  var jreErr = null;
  try { await jre.getJourneySurveyVersion("11111111-1111-4111-8111-111111111111", ANON); } catch (e) { jreErr = e.code; }
  check("journey repo: RPC error -> DB_JOURNEY_SURVEY_VERSION_FAILED", jreErr === "DB_JOURNEY_SURVEY_VERSION_FAILED", jreErr);

  calls = [];
  var dr = createDiagnosisRepository({ client: fakeClient(function () { return { data: { inserted: true }, error: null }; }),
    backendSecret: "s3cret", tenantId: "t" });
  var sample = classifier.classifyFinancialShadow(clone(STRATEGY_CASES[4][1]));
  var sampleId = deriveFinancialInputIdentity(clone(STRATEGY_CASES[4][1]));
  await dr.recordFinancialStrategyEvaluation({ diagnosis_id: "d", journey_id: "j", anonymous_id: ANON,
    identity_version: sampleId.version, identity: sampleId.value, survey_version: 2,
    classifier_version: sample.classifier_version, contract: sample.contract, threshold_version: sample.threshold_version,
    classification_status: sample.classification_status, strategy: sample.strategy, result: sample });
  check("diagnosis repo: calls miplan_record_financial_strategy_evaluation with the 13 migration params",
    calls[0].name === "miplan_record_financial_strategy_evaluation" &&
    eq(Object.keys(calls[0].params).sort(), ["p_anonymous_id", "p_classification_status", "p_classifier_version", "p_contract",
      "p_diagnosis_id", "p_identity", "p_identity_version", "p_journey_id", "p_result", "p_secret", "p_strategy",
      "p_survey_version", "p_threshold_version"]) &&
    calls[0].params.p_strategy === "CONSOLIDACION" && eq(calls[0].params.p_result, sample) &&
    calls[0].params.p_anonymous_id === ANON && calls[0].params.p_identity === sampleId.value);

  // ---- Migration file (written, not applied) ----
  var sql = fs.readFileSync(path.join(ROOT, "server", "migrations", "20260929120000_v2_financial_strategy_results.sql"), "utf8");
  var code = sql.replace(/--[^\n]*/g, "");
  check("migration: marked WRITTEN, NOT APPLIED", /WRITTEN, NOT APPLIED/.test(sql));
  check("migration: additive only (no DROP/UPDATE/DELETE/TRUNCATE, no ALTER of existing tables)",
    !/\b(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.)/i.test(code) &&
    !/ALTER\s+TABLE\s+public\.(diagnoses|journeys|shadow_results)/i.test(code));
  check("migration: both RPCs secret-gated (b2_persist) and SECURITY DEFINER",
    (code.match(/WHERE s\.name = 'b2_persist'/g) || []).length === 2 &&
    (code.match(/SECURITY DEFINER/g) || []).length === 2 &&
    (code.match(/RAISE EXCEPTION 'MIPLAN_UNAUTHORIZED'/g) || []).length === 2);
  check("migration: version RPC returns smallint and never the context",
    /miplan_get_journey_survey_version\([\s\S]*?\)\s*RETURNS smallint/.test(code) && !/RETURN\s+ctx/i.test(code));
  check("migration: table has RLS, the 5 strategies, status/strategy coherence and survey_version = 2",
    /ALTER TABLE public\.financial_strategy_results ENABLE ROW LEVEL SECURITY/.test(code) &&
    classifier.STRATEGY_ORDER.every(function (st) { return code.indexOf("'" + st + "'") !== -1; }) &&
    /\(classification_status = 'classified'\) = \(strategy IS NOT NULL\)/.test(code) &&
    /CHECK \(survey_version = 2\)/.test(code));
  check("migration: no plan_id / scoreReset columns (no legacy mapping)",
    !/plan_id|planid|score_reset|scorereset|nivel/i.test(code));
  check("static SQL: table privileges revoked from PUBLIC and from anon, authenticated (RLS kept, no policies)",
    /REVOKE ALL ON TABLE public\.financial_strategy_results FROM PUBLIC;/.test(code) &&
    /REVOKE ALL ON TABLE public\.financial_strategy_results FROM anon, authenticated;/.test(code) &&
    !/CREATE POLICY/i.test(code) && !/GRANT[^;]*ON TABLE public\.financial_strategy_results/i.test(code));
  var insertFn = (code.match(/CREATE OR REPLACE FUNCTION public\.miplan_insert_financial_strategy_result\([\s\S]*?\$function\$;/) || [""])[0];
  var insertBody = insertFn.slice(insertFn.indexOf("BEGIN"));
  var at = function (re) { var m = re.exec(insertBody); return m ? m.index : -1; };
  var iVersionSelect = at(/SELECT true, j\.bootstrap_context -> 'survey' -> 'source_survey_version'\s+INTO journey_found, raw_version\s+FROM public\.journeys j\s+WHERE j\.journey_id = diag_journey;/);
  var iNotV2 = at(/IF journey_version IS DISTINCT FROM 2 THEN\s+RAISE EXCEPTION 'SURVEY_VERSION_NOT_V2'/);
  var iMismatch = at(/IF p_survey_version IS DISTINCT FROM journey_version THEN\s+RAISE EXCEPTION 'SURVEY_VERSION_MISMATCH'/);
  var iInsert = at(/INSERT INTO public\.financial_strategy_results/);
  var iDiag = at(/SELECT true, d\.journey_id INTO diag_found, diag_journey\s+FROM public\.diagnoses d\s+WHERE d\.diagnosis_id = p_diagnosis_id;/);
  check("static SQL: insert RPC derives the survey version diagnosis -> journey -> bootstrap_context and raises SURVEY_VERSION_NOT_V2 before any INSERT",
    iDiag !== -1 && iVersionSelect > iDiag && iNotV2 > iVersionSelect && iMismatch > iNotV2 && iInsert > iMismatch,
    { iDiag: iDiag, iVersionSelect: iVersionSelect, iNotV2: iNotV2, iMismatch: iMismatch, iInsert: iInsert });
  check("static SQL: same strict version rule as the lookup RPC (JSON number 1|2 only; absent/string/other -> not V2)",
    /IF raw_version IS NOT NULL AND jsonb_typeof\(raw_version\) = 'number' AND raw_version::text IN \('1', '2'\) THEN\s+journey_version := raw_version::text::smallint;/.test(insertBody));
  check("static SQL: persisted survey_version / journey_id come from the DB (journey_version, diag_journey), never from p_survey_version / p_journey_id",
    /\)\s*VALUES\s*\(\s*p_diagnosis_id,\s*diag_journey,\s*journey_version,\s*p_classifier_version,/.test(insertBody) &&
    (insertBody.match(/p_survey_version/g) || []).length === 1 && (insertBody.match(/p_journey_id/g) || []).length === 2);
  check("static SQL: insert RPC does not call miplan_get_journey_survey_version (single secret check, no anonymous_id authority)",
    insertBody.indexOf("miplan_get_journey_survey_version") === -1 && (insertBody.match(/b2_persist/g) || []).length === 1);
  check("static SQL: first write wins (ON CONFLICT (diagnosis_id) DO NOTHING; no DO UPDATE / UPDATE)",
    /ON CONFLICT \(diagnosis_id\) DO NOTHING/.test(insertBody) && !/DO UPDATE|\bUPDATE\b/i.test(insertBody) &&
    /diagnosis_id uuid PRIMARY KEY REFERENCES public\.diagnoses \(diagnosis_id\)/.test(code));
  check("static SQL: insert RPC signature unchanged (no p_anonymous_id)",
    !/p_anonymous_id/.test(insertFn) &&
    /REVOKE ALL ON FUNCTION public\.miplan_insert_financial_strategy_result\(\s*text, uuid, uuid, smallint, text, text, text, text, text, jsonb\s*\) FROM PUBLIC;/.test(code));

  var failed = results.filter(function (x) { return !x.ok; }).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed");
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
