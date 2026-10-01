/**
 * server/bin/action-context-test.js — V2-ACTION-CONTEXT-AND-USER-CHOICE-01 (action_context only).
 *
 * Acceptance 1–10 for buildActionContext + the public v2_action_context of POST /v1/diagnoses
 * (real service + app, in-memory twin of the evaluation RPC, fake journey ownership).
 * Also: client forgery is ignored, the stored evaluation is the authority, determinism across a
 * jsonb-like round trip, and an invariant sweep over every classified input of a generated grid.
 * No network, no DB.
 *
 * node -r ./server/testing/networkTrap.js server/bin/action-context-test.js
 */
"use strict";

var assert = require("assert");
var http = require("http");

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;
var createMemoryStrategyEvaluationStore = require("../testing/memoryStrategyEvaluations").createMemoryStrategyEvaluationStore;
var ac = require("../modules/diagnosis/actionContext");
var classifier = require("../../engine/classifier/financial-classifier");
var FIXTURES = require("../../dev/backend-arch/classifier-shadow/fixtures").FIXTURES;
var sweepInputs = require("../testing/actionContextSweep").sweepInputs;

var buildActionContext = ac.buildActionContext;
var classify = classifier.classifyFinancialShadow;

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
/** Same values, object keys reordered (what a jsonb round trip does). */
function reorderKeys(x) {
  if (Array.isArray(x)) return x.map(reorderKeys);
  if (x && typeof x === "object") {
    var out = {};
    Object.keys(x).sort().reverse().forEach(function (k) { out[k] = reorderKeys(x[k]); });
    return out;
  }
  return x;
}

var CONFIRMED = { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } };
function input(o) {
  return Object.assign({ ingreso: 100000, gastos: { vivienda: 40000 }, deudas: [], no_debts_declared: false,
    entry_context: clone(CONFIRMED) }, o);
}
function debt(monto, pago, sit, extra) {
  return Object.assign({ monto: String(monto), pago: pago, situacion_ui: sit }, extra || {});
}
function ctxOf(i) {
  var r = classify(clone(i));
  return { r: r, ac: buildActionContext(r) };
}

// ---------- service + app harness ----------
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var ANON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var JA = "11111111-1111-4111-8111-111111111111";
var JB = "22222222-2222-4222-8222-222222222222";
var OWNERS = {};
OWNERS[JA] = ANON_A;
OWNERS[JB] = ANON_B;
var journeyService = {
  assertOwned: async function (jid, anon) {
    if (OWNERS[jid] !== anon) {
      var e = new Error("JOURNEY_NOT_OWNED");
      e.status = 403;
      e.code = "JOURNEY_NOT_OWNED";
      throw e;
    }
  },
  surveyVersionOf: async function (jid, anon) {
    return OWNERS[jid] === anon ? 2 : null;
  },
};

function memoryRepo(opts) {
  opts = opts || {};
  var store = createMemoryStrategyEvaluationStore();
  var n = 0;
  return {
    insertDiagnosis: async function () {
      n += 1;
      return { diagnosis_id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0") };
    },
    recordFinancialStrategyEvaluation: async function (row) {
      var reply = store.record(clone(row));
      return opts.tamper ? opts.tamper(reply) : reply;
    },
    upsertShadowResult: async function () { return null; },
    store: store,
  };
}

function startApp(repo) {
  var service = createDiagnosisService({ repository: repo, tenantId: "miplan-default", journeyService: journeyService });
  var app = createApp(loadConfig({
    NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "",
  }), { journeyService: journeyService, diagnosisService: service });
  return new Promise(function (resolve) {
    var server = http.createServer(app);
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port }); });
  });
}

function post(port, body, anon) {
  return new Promise(function (resolve, reject) {
    var raw = JSON.stringify(body);
    var req = http.request({ hostname: "127.0.0.1", port: port, path: "/v1/diagnoses", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw),
        "X-MiPlan-Anonymous-Id": anon || ANON_A } }, function (res) {
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

var PUBLIC_AC_KEYS = ["monthly_gap", "amount", "certainty", "monthly_surplus", "mora_debts", "active_debts", "debt_index",
  "monthly_debt_payment"];
var FORBIDDEN_KEYS = ["canonical_facts", "debts", "monthly_income", "monthly_expenses", "monthly_debt_payments", "canonical_flow",
  "flow_sign", "active_debt", "active_mora", "debt_burden_ratio", "burden_status", "debt_set_complete", "provenance",
  "last_payment_amount", "declared_payment_amount", "declared_debt_problem", "input_snapshot", "result", "evaluation_id",
  "journey_id", "anonymous_id", "acreedor", "acreedor_raw", "tipo", "situacion_ui", "monto", "pago", "secret", "p_secret"];
function walkKeys(x, out) {
  if (Array.isArray(x)) { x.forEach(function (y) { walkKeys(y, out); }); return out; }
  if (x && typeof x === "object") Object.keys(x).forEach(function (k) { out.push(k); walkKeys(x[k], out); });
  return out;
}

async function main() {
  // ---- [1] CONTENCION exact gap ----
  var c1 = ctxOf(input({ gastos: { vivienda: 90000 }, deudas: [debt(100000, 20000, "pagando_normal")] }));
  check("[1] CONTENCION, canonical_flow known (-10000) -> monthly_gap {10000, exact} + active_debts; no surplus",
    c1.r.strategy === "CONTENCION" && c1.r.canonical_facts.canonical_flow === -10000 &&
    eq(c1.ac, { monthly_gap: { amount: 10000, certainty: "exact" }, active_debts: [{ debt_index: 0, monthly_debt_payment: 20000 }] }), c1.ac);

  // ---- [2] CONTENCION lower bound ----
  var fx = FIXTURES.filter(function (f) { return f.id === "PREC_FLOW_NEGATIVE_BOUND_MORA_UNKNOWN"; })[0];
  var c2a = ctxOf(fx.input);
  check("[2] CONTENCION, payment unknown (mora_reclamo): flow unknown, flow_sign negative -> monthly_gap {20000, lower_bound}",
    c2a.r.strategy === "CONTENCION" && c2a.r.canonical_facts.canonical_flow === classifier.UNKNOWN &&
    c2a.r.canonical_facts.flow_sign === "negative" && eq(c2a.ac, { monthly_gap: { amount: 20000, certainty: "lower_bound" },
      active_debts: [{ debt_index: 0, monthly_debt_payment: null }] }), c2a.ac);
  var lbIn = input({ gastos: { vivienda: 90000 }, deudas: [debt(100000, 20000, "pagando_normal"), debt(50000, null, "mora_reclamo")] });
  var c2b = ctxOf(lbIn);
  var completions = [1, 5000, 50000].map(function (p) {
    var full = clone(lbIn);
    full.deudas[1] = debt(50000, p, "pagando_normal");
    var cr = classify(full);
    return { p: p, flow: cr.canonical_facts.canonical_flow, gap: buildActionContext(cr) && buildActionContext(cr).monthly_gap };
  });
  check("[2] lower bound counts known active payments (100000 - 90000 - 20000) and is <= the exact gap of every completion",
    c2b.r.strategy === "CONTENCION" && eq(c2b.ac.monthly_gap, { amount: 10000, certainty: "lower_bound" }) &&
    completions.every(function (x) { return x.gap && x.gap.certainty === "exact" && x.gap.amount === 10000 + x.p && x.gap.amount >= 10000; }),
    { ac: c2b.ac, completions: completions });
  var c2c = ctxOf(input({ ingreso: 50000, gastos: { vivienda: "no se" }, deudas: [debt(100000, 60000, "pagando_normal")] }));
  check("[2] expenses unknown count as 0 in the bound (never invented): 50000 - 0 - 60000 -> {10000, lower_bound}",
    c2c.r.strategy === "CONTENCION" && c2c.r.canonical_facts.monthly_expenses === classifier.UNKNOWN &&
    eq(c2c.ac, { monthly_gap: { amount: 10000, certainty: "lower_bound" }, active_debts: [{ debt_index: 0, monthly_debt_payment: 60000 }] }), c2c.ac);

  // ---- [2b] CONTENCION active_debts (debts on which lower_payment_intent can be instantiated) ----
  var contIn = input({ gastos: { vivienda: 90000 }, deudas: [
    debt(100000, 10000, "pagando_normal"),
    debt(50000, 5000, "pagando_normal"),
    debt(80000, 8000, "pagando_normal"),
    debt(50000, 5000, "pagando_normal", { cancelada: true }),
    debt(50000, null, "deje_pagar"),
    debt(40000, 4000, "atrasado_pagando"),
  ] });
  var c2d = ctxOf(contIn);
  var c2dFacts = c2d.r.canonical_facts.debts.map(function (d) { return [d.debt_index, d.active_debt, d.active_mora, d.monthly_debt_payment.status]; });
  check("[2b] CONTENCION multiple debts -> active_debts = every debt with its own active_debt true, by debt_index: known payments, " +
    "mora with KNOWN_ZERO stays 0, mora with unknown payment -> null (declared 4000 never used); paid debt (3) absent",
    c2d.r.strategy === "CONTENCION" && eq(c2d.ac.active_debts, [
      { debt_index: 0, monthly_debt_payment: 10000 }, { debt_index: 1, monthly_debt_payment: 5000 },
      { debt_index: 2, monthly_debt_payment: 8000 }, { debt_index: 4, monthly_debt_payment: 0 },
      { debt_index: 5, monthly_debt_payment: null }]) && eq(Object.keys(c2d.ac), ["monthly_gap", "active_debts"]) &&
    JSON.stringify(c2d.ac).indexOf("4000") === -1, { ac: c2d.ac, facts: c2dFacts });
  var c2dMora = c2d.r.canonical_facts.debts.filter(function (d) { return d.active_mora === true; }).map(function (d) { return d.debt_index; });
  check("[2b] CONTENCION mora semantics unchanged: debts 4 and 5 are active_mora true in canonical facts and still listed as active debts " +
    "(active_debts never filters by mora; no mora_debts key outside REGULARIZACION)",
    eq(c2dMora, [4, 5]) && !("mora_debts" in c2d.ac), { mora: c2dMora, ac: c2d.ac });
  var contRev = clone(contIn);
  contRev.deudas = [contIn.deudas[2], contIn.deudas[1], contIn.deudas[0]];
  var c2e = ctxOf(contRev);
  check("[2b] CONTENCION debt_index stable = position in input_snapshot.deudas (reordering moves the indices with the debts)",
    c2e.r.strategy === "CONTENCION" && eq(c2e.ac.active_debts, [{ debt_index: 0, monthly_debt_payment: 8000 },
      { debt_index: 1, monthly_debt_payment: 5000 }, { debt_index: 2, monthly_debt_payment: 10000 }]), c2e.ac);
  var c2f = ctxOf(input({ gastos: { vivienda: 110000 }, deudas: [], no_debts_declared: true }));
  check("[2b] CONTENCION without debts -> active_debts [] (no invented debts)",
    c2f.r.strategy === "CONTENCION" && eq(c2f.ac, { monthly_gap: { amount: 10000, certainty: "exact" }, active_debts: [] }), c2f.ac);
  var contDup = clone(c2d.r);
  contDup.canonical_facts.debts.push(clone(contDup.canonical_facts.debts[0]));
  var contBadIdx = clone(c2d.r);
  contBadIdx.canonical_facts.debts[1].debt_index = 1.5;
  var contNoDebts = clone(c2d.r);
  delete contNoDebts.canonical_facts.debts;
  var contIncomplete = clone(c2d.r);
  contIncomplete.classification_status = "incomplete";
  check("[2b] CONTENCION malformed / incomplete (duplicate or fractional debt_index, missing debts, not classified) -> null (fail closed)",
    [contDup, contBadIdx, contNoDebts, contIncomplete].every(function (r) { return buildActionContext(r) === null; }));

  // ---- [3] REGULARIZACION: only debt-level confirmed mora ----
  var c3 = ctxOf(input({ deudas: [
    debt(100000, 10000, "pagando_normal"),
    debt(50000, null, "deje_pagar"),
    debt(30000, 5000, "no_seguro"),
    debt(20000, null, "deje_pagar"),
    debt(10000, 1000, "pagando_normal", { cancelada: true }),
  ] }));
  var moraFlags = c3.r.canonical_facts.debts.map(function (d) { return [d.debt_index, d.active_mora]; });
  check("[3] REGULARIZACION -> mora_debts = only debts with their own active_mora true [1,3]; mora unknown (2), false (0), cancelled (4) excluded",
    c3.r.strategy === "REGULARIZACION" && c3.r.canonical_facts.active_mora === true &&
    eq(c3.ac, { mora_debts: [{ debt_index: 1 }, { debt_index: 3 }] }), { ac: c3.ac, mora: moraFlags });
  var c3b = ctxOf(FIXTURES.filter(function (f) { return f.id === "M4_ACTIVE_MORA_TRUE_PLUS_UNKNOWN"; })[0].input);
  check("[3] fixture M4 (mora true + mora unknown): the aggregate never promotes the unknown debt",
    c3b.r.strategy !== "REGULARIZACION" || c3b.ac.mora_debts.every(function (m) {
      return c3b.r.canonical_facts.debts.filter(function (d) { return d.debt_index === m.debt_index; })[0].active_mora === true;
    }), { strategy: c3b.r.strategy, ac: c3b.ac });

  // ---- [4] REDUCCION_CARGA: active debts ----
  var c4 = ctxOf(input({ deudas: [debt(300000, 25000, "pagando_normal"), debt(80000, 15000, "pagando_normal")] }));
  check("[4] REDUCCION_CARGA -> active_debts with their known monthly payment; no surplus/gap exposed",
    c4.r.strategy === "REDUCCION_CARGA" &&
    eq(c4.ac, { active_debts: [{ debt_index: 0, monthly_debt_payment: 25000 }, { debt_index: 1, monthly_debt_payment: 15000 }] }), c4.ac);
  var c4z = ctxOf(input({ deudas: [debt(300000, 60000, "pagando_normal")] }));
  check("[4] REDUCCION_CARGA with flow = 0 -> active_debts only (flow 0 is not a surplus)",
    c4z.r.strategy === "REDUCCION_CARGA" && c4z.r.canonical_facts.canonical_flow === 0 &&
    eq(c4z.ac, { active_debts: [{ debt_index: 0, monthly_debt_payment: 60000 }] }), c4z.ac);

  // ---- [5] CONSOLIDACION ----
  var c5 = ctxOf(input({ deudas: [debt(100000, 30000, "pagando_normal")] }));
  check("[5] CONSOLIDACION -> monthly_surplus {30000} + active_debts",
    c5.r.strategy === "CONSOLIDACION" && eq(c5.ac, { monthly_surplus: { amount: 30000 },
      active_debts: [{ debt_index: 0, monthly_debt_payment: 30000 }] }), c5.ac);

  // ---- [6] / [7] MANTENIMIENTO ----
  var c6 = ctxOf(input({ no_debts_declared: true }));
  check("[6] MANTENIMIENTO_OPTIMIZACION flow > 0 -> monthly_surplus {60000}",
    c6.r.strategy === "MANTENIMIENTO_OPTIMIZACION" && eq(c6.ac, { monthly_surplus: { amount: 60000 } }), c6.ac);
  var c7 = ctxOf(input({ gastos: { vivienda: 100000 }, no_debts_declared: true }));
  check("[7] MANTENIMIENTO_OPTIMIZACION flow = 0 -> monthly_surplus null (no invented surplus)",
    c7.r.strategy === "MANTENIMIENTO_OPTIMIZACION" && c7.r.canonical_facts.canonical_flow === 0 &&
    eq(c7.ac, { monthly_surplus: null }), c7.ac);
  var c7b = ctxOf(input({ deudas: [debt(50000, 5000, "pagando_normal", { cancelada: true })] }));
  check("[7] MANTENIMIENTO via only paid/cancelled debts -> surplus from canonical_flow, no debt lists",
    c7b.r.strategy === "MANTENIMIENTO_OPTIMIZACION" && eq(c7b.ac, { monthly_surplus: { amount: 60000 } }), c7b.ac);

  // ---- [8] debt_index keeps snapshot identity/order ----
  var mixed = input({ deudas: [
    debt(10000, 1000, "pagando_normal", { cancelada: true }),
    debt(100000, 10000, "pagando_normal"),
    null,
    debt(60000, 6000, "pagando_normal"),
  ] });
  var c8 = ctxOf(mixed);
  check("[8] debt_index = position in input_snapshot.deudas: paid (0) and invalid (2) keep their slots -> active [1,3]",
    c8.r.strategy === "CONSOLIDACION" && eq(c8.ac.active_debts.map(function (d) { return d.debt_index; }), [1, 3]) &&
    eq(c8.ac.active_debts.map(function (d) { return d.monthly_debt_payment; }), [10000, 6000]), c8.ac);
  var rev = input({ deudas: [debt(60000, 6000, "pagando_normal"), debt(100000, 10000, "pagando_normal")] });
  var c8r = ctxOf(rev);
  check("[8] reordering debts reorders indices with them (no renumbering by amount): [0 -> 6000, 1 -> 10000]",
    eq(c8r.ac.active_debts, [{ debt_index: 0, monthly_debt_payment: 6000 }, { debt_index: 1, monthly_debt_payment: 10000 }]), c8r.ac);
  var shuffled = clone(c8.r);
  shuffled.canonical_facts.debts.reverse();
  check("[8] lists ordered by debt_index even if the stored debts array is not",
    eq(buildActionContext(shuffled), c8.ac), buildActionContext(shuffled));

  // ---- [9] unknown payment never invented ----
  var synthetic = clone(c5.r);
  synthetic.canonical_facts.debts.push({ debt_index: 1, active_debt: true, active_mora: false,
    monthly_debt_payment: { status: "UNKNOWN", value: "unknown" }, declared_payment_amount: 4444, last_payment_amount: 5555 });
  synthetic.canonical_facts.debts.push({ debt_index: 2, active_debt: true, active_mora: true,
    monthly_debt_payment: { status: "KNOWN_ZERO", value: 0 } });
  var a9 = buildActionContext(synthetic);
  check("[9] unknown payment -> monthly_debt_payment null (not 0, not declared/last amount); KNOWN_ZERO stays 0",
    eq(a9.active_debts, [{ debt_index: 0, monthly_debt_payment: 30000 }, { debt_index: 1, monthly_debt_payment: null },
      { debt_index: 2, monthly_debt_payment: 0 }]) && JSON.stringify(a9).indexOf("4444") === -1 && JSON.stringify(a9).indexOf("5555") === -1, a9);

  // ---- [10] public response ----
  var repo = memoryRepo();
  var app = await startApp(repo);
  var pub = await post(app.port, Object.assign(clone(mixed), { journey_id: JA,
    deudas: [debt(10000, 1000, "pagando_normal", { cancelada: true, acreedor: "Acreedor QA-7781" }),
      debt(100000, 10000, "pagando_normal", { acreedor: "Banco QA-7782", tipo: "prestamo" }),
      debt(60000, 6000, "pagando_normal", { acreedor: "Financiera QA-7783" })] }));
  var pac = pub.body.v2_action_context;
  var acKeys = walkKeys(pac, []);
  var raw = JSON.stringify(pac);
  check("[10] public v2_action_context: only action keys, no canonical facts / snapshot / ids / creditor / secret keys",
    pub.status === 200 && pac && acKeys.every(function (k) { return PUBLIC_AC_KEYS.indexOf(k) !== -1; }) &&
    FORBIDDEN_KEYS.every(function (k) { return acKeys.indexOf(k) === -1; }) &&
    ["QA-7781", "QA-7782", "QA-7783", "prestamo", "100000", "pagando_normal"].every(function (s) { return raw.indexOf(s) === -1; }),
    { keys: acKeys, raw: raw });
  check("[10] v2_financial_strategy contract untouched: exactly its 7 keys and no amounts inside",
    eq(Object.keys(pub.body.v2_financial_strategy), ["survey_version", "classification_status", "strategy", "reasons", "verification",
      "provenance", "financial_input_identity"]) &&
    ["10000", "6000", "100000"].every(function (s) { return JSON.stringify(pub.body.v2_financial_strategy).indexOf(s) === -1; }),
    pub.body.v2_financial_strategy);
  check("[10] response top level: legacy keys + v2_financial_strategy + v2_action_context only (no evaluation/canonical/snapshot)",
    eq(Object.keys(pub.body), ["diagnosis_id", "engine_version", "result", "journey_id", "v2_financial_strategy", "v2_action_context"]),
    Object.keys(pub.body));
  var noJourney = await post(app.port, input({ deudas: [debt(100000, 30000, "pagando_normal")] }));
  check("[10] no journey (no V2) -> v2_action_context literally absent",
    noJourney.status === 200 && !Object.prototype.hasOwnProperty.call(noJourney.body, "v2_action_context"), Object.keys(noJourney.body));

  // ---- forgery: the client cannot shape strategy / action_context / surplus ----
  var clean = await post(app.port, Object.assign(input({ deudas: [debt(100000, 30000, "pagando_normal")] }), { journey_id: JA }));
  var forged = await post(app.port, Object.assign(input({ deudas: [debt(100000, 30000, "pagando_normal")] }), { journey_id: JA,
    strategy: "MANTENIMIENTO_OPTIMIZACION", classification_status: "classified",
    v2_action_context: { monthly_surplus: { amount: 999999 } }, action_context: { monthly_surplus: { amount: 999999 } },
    monthly_surplus: 999999, canonical_flow: 999999, canonical_facts: { canonical_flow: 999999, debts: [] },
    v2_financial_strategy: { strategy: "CONTENCION" }, result: { strategy: "CONTENCION" }, evaluation_id: "00000000-0000-4000-8000-000000000999" }));
  check("forgery: injected strategy / action_context / surplus / canonical facts / evaluation_id are ignored (same context as clean body)",
    clean.status === 200 && forged.status === 200 && eq(forged.body.v2_action_context, clean.body.v2_action_context) &&
    eq(forged.body.v2_action_context, { monthly_surplus: { amount: 30000 }, active_debts: [{ debt_index: 0, monthly_debt_payment: 30000 }] }) &&
    forged.body.v2_financial_strategy.strategy === "CONSOLIDACION", { clean: clean.body.v2_action_context, forged: forged.body.v2_action_context });
  var foreign = await post(app.port, Object.assign(input({ deudas: [debt(100000, 30000, "pagando_normal")] }), { journey_id: JA }), ANON_B);
  check("ownership: another owner posting with journey A -> 403 JOURNEY_NOT_OWNED, no action_context",
    foreign.status === 403 && !Object.prototype.hasOwnProperty.call(foreign.body, "v2_action_context"), foreign);

  // ---- the stored evaluation is the authority; reuse keeps the same context ----
  var evBefore = repo.store.evaluations.length;
  var reuse = await post(app.port, Object.assign(input({ deudas: [debt(100000, 30000, "pagando_normal")],
    entry_context: { field_provenance: { ingreso: { source: "handoff", user_modified: false, detail: "handoff" } } } }), { journey_id: JA }));
  check("reuse: same journey + financial identity (other income provenance) -> same evaluation, identical v2_action_context",
    reuse.status === 200 && repo.store.evaluations.length === evBefore && eq(reuse.body.v2_action_context, clean.body.v2_action_context),
    { evaluations: repo.store.evaluations.length - evBefore, ac: reuse.body.v2_action_context });
  var otherJourney = await post(app.port, Object.assign(input({ deudas: [debt(100000, 30000, "pagando_normal")] }), { journey_id: JB }), ANON_B);
  check("scope: another owner's journey with the same finances -> its own evaluation (same derived context, never shared)",
    otherJourney.status === 200 && repo.store.evaluations.length === evBefore + 1 &&
    eq(otherJourney.body.v2_action_context, clean.body.v2_action_context), repo.store.evaluations.length - evBefore);
  app.server.close();

  var tamperRepo = memoryRepo({ tamper: function (reply) {
    var t = clone(reply);
    t.result.canonical_facts.canonical_flow = 12345;
    return t;
  } });
  var tApp = await startApp(tamperRepo);
  var tResp = await post(tApp.port, Object.assign(input({ deudas: [debt(100000, 30000, "pagando_normal")] }), { journey_id: JA }));
  check("authority: v2_action_context is derived from the stored evaluation result returned by the DB, not recomputed per request",
    tResp.status === 200 && eq(tResp.body.v2_action_context.monthly_surplus, { amount: 12345 }), tResp.body.v2_action_context);
  tApp.server.close();

  // ---- determinism / malformed ----
  check("determinism: same result twice and after a jsonb-like key reordering -> identical action_context",
    [c1, c2a, c2d, c3, c4, c5, c6, c7, c8].every(function (c) {
      return eq(buildActionContext(c.r), c.ac) && eq(buildActionContext(reorderKeys(clone(c.r))), c.ac);
    }));
  var dup = clone(c5.r);
  dup.canonical_facts.debts.push(clone(dup.canonical_facts.debts[0]));
  var badIdx = clone(c5.r);
  badIdx.canonical_facts.debts[0].debt_index = "0";
  var unknownStrategy = clone(c5.r);
  unknownStrategy.strategy = "COMMERCIAL_OFFER";
  check("fail closed: incomplete, null, unknown strategy, duplicate or non-integer debt_index -> null",
    buildActionContext(classify(input({ deudas: [debt(100000, null, "pagando_normal")] }))) === null &&
    buildActionContext(null) === null && buildActionContext(unknownStrategy) === null &&
    buildActionContext(dup) === null && buildActionContext(badIdx) === null);
  check("cents: amounts rounded to cents (float noise from decimal inputs never leaks)",
    eq(ctxOf(input({ ingreso: "100000.10", gastos: { vivienda: "40000.20" }, deudas: [debt(100000, "20000.30", "pagando_normal")] })).ac,
      { monthly_surplus: { amount: 39999.6 }, active_debts: [{ debt_index: 0, monthly_debt_payment: 20000.3 }] }),
    ctxOf(input({ ingreso: "100000.10", gastos: { vivienda: "40000.20" }, deudas: [debt(100000, "20000.30", "pagando_normal")] })));

  // ---- invariant sweep ----
  var inputs = sweepInputs();
  var violations = [];
  var byStrategy = {};
  var certainties = {};
  inputs.forEach(function (i, n) {
    var r = classify(clone(i));
    var a = buildActionContext(r);
    var cf = r.canonical_facts;
    function bad(msg) { violations.push(n + ":" + msg); }
    if (r.classification_status !== "classified") { if (a !== null) bad("incomplete with context"); return; }
    byStrategy[r.strategy] = (byStrategy[r.strategy] || 0) + 1;
    if (!a || !eq(Object.keys(a), ac.FIELDS_BY_STRATEGY[r.strategy])) return bad("keys");
    if ("monthly_gap" in a) {
      if (!a.monthly_gap || !(a.monthly_gap.amount > 0)) bad("CONTENCION without gap");
      else {
        certainties[a.monthly_gap.certainty] = (certainties[a.monthly_gap.certainty] || 0) + 1;
        if ((a.monthly_gap.certainty === "exact") !== (typeof cf.canonical_flow === "number")) bad("certainty");
      }
    }
    if ("monthly_surplus" in a) {
      var expect = typeof cf.canonical_flow === "number" && cf.canonical_flow > 0;
      if (expect !== (a.monthly_surplus !== null)) bad("surplus presence");
      if (a.monthly_surplus && a.monthly_surplus.amount !== cf.canonical_flow) bad("surplus amount");
    }
    if ("mora_debts" in a) {
      if (a.mora_debts.length === 0) bad("REGULARIZACION without a confirmed mora debt");
      a.mora_debts.forEach(function (m) {
        if (cf.debts.filter(function (d) { return d.debt_index === m.debt_index; })[0].active_mora !== true) bad("mora not confirmed");
      });
    }
    if ("active_debts" in a) {
      var activeIdx = cf.debts.filter(function (d) { return d.active_debt === true; }).map(function (d) { return d.debt_index; });
      if (!eq(a.active_debts.map(function (d) { return d.debt_index; }), activeIdx)) bad("active set");
      a.active_debts.forEach(function (d) {
        var src = cf.debts.filter(function (x) { return x.debt_index === d.debt_index; })[0].monthly_debt_payment;
        var expectP = src.status === "UNKNOWN" ? null : src.value;
        if (d.monthly_debt_payment !== expectP) bad("payment");
        if (d.monthly_debt_payment === null && r.strategy !== "CONTENCION") bad("classified " + r.strategy + " with unknown payment");
      });
    }
  });
  check("[9] sweep: " + inputs.length + " inputs; every classified context satisfies the contract (gap/surplus/mora/active rules, " +
    "no unknown payment in REDUCCION/CONSOLIDACION, incomplete -> null)", violations.length === 0, violations.slice(0, 10));
  check("sweep covers all 5 strategies and both gap certainties " + JSON.stringify(byStrategy) + " " + JSON.stringify(certainties),
    Object.keys(byStrategy).length === 5 && certainties.exact > 0 && certainties.lower_bound > 0, { byStrategy: byStrategy, certainties: certainties });

  var failed = results.filter(function (x) { return !x.ok; }).length;
  console.log("ACTION_CONTEXT_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
