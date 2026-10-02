/**
 * server/bin/v2-user-choice-db-test.js — V2-USER-CHOICE-01, isolated DB harness.
 *
 * Throwaway embedded PostgreSQL 17 (temp dir, loopback, deleted at the end) with every repo migration
 * applied, then 20261001120000_v2_user_choices.sql (WRITTEN, NOT APPLIED anywhere else). The real app
 * (HTTP on loopback) runs the real diagnosis / journey / user choice services and Supabase repositories
 * through an rpc() adapter over node-postgres, so every read and write goes through the real RPCs.
 * Never reads .env / SUPABASE_*; no remote host is ever contacted.
 *
 * Deps (outside the repo): MIPLAN_ISOLATED_DEPS dir with embedded-postgres + pg installed
 * (default %TEMP%/miplan-v2-isolated-pg17).
 *
 * node -r ./server/testing/networkTrap.js server/bin/v2-user-choice-db-test.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
var net = require("net");
var http = require("http");
var path = require("path");
var crypto = require("crypto");
var pathToFileURL = require("url").pathToFileURL;
var createRequire = require("module").createRequire;

var ROOT = path.join(__dirname, "..", "..");
var DEPS = process.env.MIPLAN_ISOLATED_DEPS || path.join(os.tmpdir(), "miplan-v2-isolated-pg17");
var pg = createRequire(path.join(DEPS, "package.json"))("pg");

var e2e = require("../../dev/backend-arch/classifier-shadow/v2-wiring-e2e");
var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;
var createDiagnosisRepository = require("../modules/diagnosis/repository").createDiagnosisRepository;
var createJourneyRepository = require("../modules/journey/repository").createJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;
var createUserChoiceRepository = require("../modules/userChoice/repository").createUserChoiceRepository;
var userChoiceModule = require("../modules/userChoice/service");
var createUserChoiceService = userChoiceModule.createUserChoiceService;
var lowerPaymentEligible = userChoiceModule.lowerPaymentEligible;
var buildActionContext = require("../modules/diagnosis/actionContext").buildActionContext;
var classifier = require("../../engine/classifier/financial-classifier");
var sweep = require("../testing/actionContextSweep");

var MIGRATION = "20261001120000_v2_user_choices.sql";
var SECRET = crypto.randomBytes(24).toString("hex");
var TENANT = "miplan-default";
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var ANON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var FAKE_UUID = "12345678-1234-4234-8234-123456789abc";

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
/** Deep equality, object key order ignored (jsonb reorders keys), array order significant. */
function eq(a, b) {
  try {
    require("assert").deepStrictEqual(a, b);
    return true;
  } catch (_e) {
    return false;
  }
}
async function errorOf(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return String(e.message || e.code) + " [" + e.code + "]";
  }
}
function walkKeys(x, out) {
  if (Array.isArray(x)) { x.forEach(function (y) { walkKeys(y, out); }); return out; }
  if (x && typeof x === "object") Object.keys(x).forEach(function (k) { out.push(k); walkKeys(x[k], out); });
  return out;
}

// ---- Supabase-style rpc() over node-postgres (PostgREST overload rule: exact argument names) ----
function makeRpcClient(pool) {
  var sigCache = {};
  async function signature(name, keys) {
    if (!sigCache[name]) {
      var r = await pool.query(
        "SELECT p.proargnames AS names, p.pronargs AS nargs, p.pronargdefaults AS ndef, oidvectortypes(p.proargtypes) AS types " +
        "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1", [name]);
      sigCache[name] = r.rows.map(function (row) {
        return { names: row.names, types: row.types.split(", "), required: row.names.slice(0, row.nargs - row.ndef) };
      });
    }
    var sigs = sigCache[name];
    var exact = sigs.filter(function (s) { return s.names.length === keys.length && keys.every(function (k) { return s.names.indexOf(k) !== -1; }); });
    if (exact.length === 1) return exact[0];
    var fit = sigs.filter(function (s) {
      return keys.every(function (k) { return s.names.indexOf(k) !== -1; }) && s.required.every(function (k) { return keys.indexOf(k) !== -1; });
    });
    if (fit.length === 1) return fit[0];
    throw new Error("RPC_SIGNATURE_UNRESOLVED " + name);
  }
  return {
    rpc: async function (name, params) {
      try {
        var keys = Object.keys(params);
        var sig = await signature(name, keys);
        var values = [];
        var args = keys.map(function (k, i) {
          var type = sig.types[sig.names.indexOf(k)];
          var v = params[k];
          values.push(v == null ? null : type === "jsonb" ? JSON.stringify(v) : v);
          return k + " => $" + (i + 1) + "::" + type;
        });
        var r = await pool.query("SELECT public." + name + "(" + args.join(", ") + ") AS v", values);
        return { data: r.rows[0].v, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e.message), code: e.code } };
      }
    },
  };
}

var CHOICE_SQL = "SELECT public.miplan_record_user_choice(p_secret => $1, p_anonymous_id => $2, p_evaluation_id => $3::uuid, " +
  "p_diagnosis_id => $4::uuid, p_choice_type => $5, p_debt_index => $6::integer, p_amount => $7::numeric, " +
  "p_reserve_destination => $8, p_lower_payment_state => $9) AS v";
function choiceArgs(o) {
  return [o.secret === undefined ? SECRET : o.secret, o.anon || ANON_A, o.evaluation_id, o.diagnosis_id || null, o.type,
    o.debt_index === undefined ? null : o.debt_index, o.amount === undefined ? null : o.amount,
    o.destination === undefined ? null : o.destination, o.state === undefined ? null : o.state];
}
var OPT_IN_SQL = "SELECT public.miplan_record_debt_management_opt_in(p_secret => $1, p_anonymous_id => $2, p_evaluation_id => $3::uuid, " +
  "p_diagnosis_id => $4::uuid, p_state => $5, p_consent_text_version => $6) AS v";
var STATE_SQL = "SELECT public.miplan_get_user_choice_state(p_secret => $1, p_anonymous_id => $2, p_evaluation_id => $3::uuid) AS v";

var ROLLBACK_SQL = [
  "DROP FUNCTION public.miplan_get_user_choice_state(text, text, uuid, uuid);",
  "DROP FUNCTION public.miplan_record_debt_management_opt_in(text, text, uuid, uuid, text, text);",
  "DROP FUNCTION public.miplan_record_user_choice(text, text, uuid, uuid, text, integer, numeric, text, text);",
  "DROP TABLE public.debt_management_opt_in_events;",
  "DROP TABLE public.financial_strategy_user_choice_events;",
  "DROP FUNCTION miplan_private.forbid_user_choice_mutation();",
  "DROP FUNCTION miplan_private.v2_choice_authority(jsonb);",
].join("\n");

function request(port, method, urlPath, body, anon) {
  return new Promise(function (resolve, reject) {
    var raw = body === undefined ? null : JSON.stringify(body);
    var headers = {};
    if (raw !== null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(raw);
    }
    if (anon) headers["X-MiPlan-Anonymous-Id"] = anon;
    var req = http.request({ hostname: "127.0.0.1", port: port, path: urlPath, method: method, headers: headers, agent: false }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        var text = Buffer.concat(chunks).toString("utf8");
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
        resolve({ status: res.statusCode, body: parsed, raw: text });
      });
    });
    req.on("error", reject);
    if (raw !== null) req.write(raw);
    req.end();
  });
}

async function main() {
  var EmbeddedPostgres = (await import(pathToFileURL(path.join(DEPS, "node_modules", "embedded-postgres", "dist", "index.js")).href)).default;
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-choice-pg-"));
  var port = 54000 + Math.floor(Math.random() * 900);
  var password = crypto.randomBytes(12).toString("hex");
  var server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: password, port: port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: function () {}, onError: function () {} });
  await server.initialise();
  await server.start();
  await server.createDatabase("miplan_isolated");
  var pool = new pg.Pool({ host: "127.0.0.1", port: port, user: "postgres", password: password, database: "miplan_isolated", max: 40 });
  try {
    await run(pool);
  } finally {
    await pool.end();
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  var failed = results.filter(function (r) { return !r.ok; }).length;
  var tagged = function (tag) {
    var rs = results.filter(function (r) { return r.name.indexOf(tag) === 0; });
    return rs.filter(function (r) { return r.ok; }).length + "/" + rs.length;
  };
  console.log("OWNERSHIP_TESTS: " + tagged("[F]") + "  CONCURRENCY_TESTS: " + tagged("[D-concurrency]"));
  console.log("V2_USER_CHOICE_DB_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

async function run(pool) {
  var ver = (await pool.query("SHOW server_version")).rows[0].server_version;
  var host = (await pool.query("SELECT coalesce(inet_server_addr()::text, 'local') AS h")).rows[0].h;
  console.log("isolated PostgreSQL " + ver + " @ " + host + " (throwaway cluster)");
  async function q(sql, args) {
    return (await pool.query(sql, args || [])).rows;
  }

  // ---- Supabase environment emulation (roles + default privileges), then repo migrations ----
  await pool.query(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" +
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
  var files = fs.readdirSync(path.join(ROOT, "server", "migrations")).filter(function (f) { return /\.sql$/.test(f); }).sort();
  var sqlOf = function (f) { return fs.readFileSync(path.join(ROOT, "server", "migrations", f), "utf8"); };
  check("migration: " + MIGRATION + " present; only earlier migrations applied before it (later ones extend it and have their own harness)",
    files.indexOf(MIGRATION) !== -1, files.slice(-2));
  for (var i = 0; i < files.length; i++) {
    if (files[i] >= MIGRATION) continue;
    await pool.query(sqlOf(files[i]));
  }
  var migrationSql = sqlOf(MIGRATION);
  var topLevelSql = migrationSql.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--[^\n]*/g, "");
  var alters = (topLevelSql.match(/ALTER TABLE\s+[\w.]+/g) || []).map(function (s) { return s.replace(/ALTER TABLE\s+/, ""); });
  check("migration: additive only (no top-level DROP / UPDATE / INSERT / DELETE FROM; ALTER TABLE only on its 2 new tables)",
    !/\bDROP\b/i.test(topLevelSql) && !/^\s*(UPDATE|INSERT|DELETE\s+FROM)\b/im.test(topLevelSql) &&
    alters.every(function (t) { return t === "public.financial_strategy_user_choice_events" || t === "public.debt_management_opt_in_events"; }), alters);
  var admin = await pool.connect();
  await admin.query("BEGIN");
  await admin.query(migrationSql);
  await admin.query("ROLLBACK");
  admin.release();
  var afterRollback = (await q("SELECT to_regclass('public.financial_strategy_user_choice_events') AS a, " +
    "to_regclass('public.debt_management_opt_in_events') AS b, to_regprocedure('miplan_private.v2_choice_authority(jsonb)') AS f"))[0];
  check("migration: applies inside a transaction and ROLLBACK leaves no trace", afterRollback.a === null && afterRollback.b === null && afterRollback.f === null);
  await pool.query(migrationSql);
  await pool.query(migrationSql);
  check("migration: applied after all existing migrations; re-applying is a no-op (IF NOT EXISTS / OR REPLACE)", true);
  await pool.query("INSERT INTO miplan_private.backend_secrets (name, secret) VALUES ('b2_persist', $1)", [SECRET]);

  // ---- real services + real app over the rpc() adapter ----
  var client = makeRpcClient(pool);
  var journeyService = createJourneyService({ repository: createJourneyRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }), tenantId: TENANT });
  var diagRepo = createDiagnosisRepository({ client: client, backendSecret: SECRET, tenantId: TENANT });
  var svc = createDiagnosisService({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService });
  var BUMP = "miplan-financial-classifier-shadow-03-test";
  var bumped = createDiagnosisService({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService,
    classifyFn: function (ei) { return Object.assign(classifier.classifyFinancialShadow(ei), { classifier_version: BUMP }); } });
  var ucService = createUserChoiceService({ repository: createUserChoiceRepository({ client: client, backendSecret: SECRET }) });
  var app = createApp(loadConfig({ NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "" }),
  { journeyService: journeyService, diagnosisService: svc, userChoiceService: ucService });
  var httpServer = http.createServer(app);
  await new Promise(function (r) { httpServer.listen(0, "127.0.0.1", r); });
  var PORT = httpServer.address().port;
  try {
    await scenarios();
  } finally {
    await new Promise(function (r) { httpServer.close(r); });
  }

  async function scenarios() {
    var JA = (await journeyService.createFromHandoffRedeem(ANON_A, "choice-a", clone(e2e.RAW_CONTEXTS.V2))).journey_id;
    var rawOther = clone(e2e.RAW_CONTEXTS.V2);
    rawOther.survey.respuestas = Object.assign({}, rawOther.survey.respuestas, { p1: "A", p2: "C", p9: "A" });
    var JA2 = (await journeyService.createFromHandoffRedeem(ANON_A, "choice-a2", rawOther)).journey_id;
    var JB = (await journeyService.createFromHandoffRedeem(ANON_B, "choice-b", clone(e2e.RAW_CONTEXTS.V2))).journey_id;

    var api = {
      diagnose: function (anon, journeyId, input) {
        return request(PORT, "POST", "/v1/diagnoses", Object.assign(clone(input), { journey_id: journeyId }), anon);
      },
      stateByDiagnosis: function (anon, diagnosisId) { return request(PORT, "GET", "/v1/diagnoses/" + diagnosisId + "/user-choices", undefined, anon); },
      state: function (anon, evaluationId) { return request(PORT, "GET", "/v1/evaluations/" + evaluationId + "/user-choices", undefined, anon); },
      choose: function (anon, evaluationId, body) { return request(PORT, "POST", "/v1/evaluations/" + evaluationId + "/user-choices", body, anon); },
      optIn: function (anon, evaluationId, body) { return request(PORT, "POST", "/v1/evaluations/" + evaluationId + "/debt-management-opt-in", body, anon); },
    };
    async function history(evaluationId, slot) {
      return q("SELECT * FROM public.financial_strategy_user_choice_events WHERE evaluation_id = $1 AND slot_key = $2 ORDER BY seq", [evaluationId, slot]);
    }
    async function optInHistory(journeyId) {
      return q("SELECT * FROM public.debt_management_opt_in_events WHERE journey_id = $1 ORDER BY seq", [journeyId]);
    }
    function chainValid(rows) {
      return rows.every(function (r, k) {
        return r.seq === k + 1 && (k === 0 ? r.supersedes_event_id === null && r.supersedes_seq === null
          : r.supersedes_event_id === rows[k - 1].event_id && r.supersedes_seq === k);
      });
    }
    async function counts() {
      return (await q("SELECT (SELECT count(*) FROM public.financial_strategy_user_choice_events)::int AS choices, " +
        "(SELECT count(*) FROM public.debt_management_opt_in_events)::int AS opt_ins, (SELECT count(*) FROM public.diagnoses)::int AS diagnoses, " +
        "(SELECT count(*) FROM public.financial_strategy_evaluations)::int AS evaluations, (SELECT count(*) FROM public.journeys)::int AS journeys, " +
        "(SELECT count(*) FROM public.diagnosis_strategy_evaluations)::int AS links, (SELECT count(*) FROM public.shadow_results)::int AS shadow, " +
        "(SELECT count(*) FROM public.financial_strategy_results)::int AS legacy_v2"))[0];
    }
    /** Owned evaluation of a fresh V2 diagnosis (diagnosis_id + evaluation_id + read state). */
    async function evaluationFor(anon, journeyId, input, label) {
      var d = await api.diagnose(anon, journeyId, input);
      if (d.status !== 200 || !d.body.v2_financial_strategy) throw new Error("fixture " + label + ": diagnosis failed " + d.raw.slice(0, 300));
      var s = await api.stateByDiagnosis(anon, d.body.diagnosis_id);
      if (s.status !== 200) throw new Error("fixture " + label + ": state failed " + s.raw.slice(0, 300));
      return { diagnosis: d.body, diagnosis_id: d.body.diagnosis_id, evaluation_id: s.body.evaluation_id, state: s.body };
    }
    async function pickEvaluation(label, predicate) {
      var inputs = sweep.sweepInputs();
      for (var k = 0; k < inputs.length; k++) {
        var r = classifier.classifyFinancialShadow(clone(inputs[k]));
        if (!predicate(r)) continue;
        var d = await api.diagnose(ANON_A, JA, inputs[k]);
        if (d.status !== 200 || !d.body.v2_financial_strategy) continue;
        var s = await api.stateByDiagnosis(ANON_A, d.body.diagnosis_id);
        return { input: inputs[k], result: r, diagnosis_id: d.body.diagnosis_id, evaluation_id: s.body.evaluation_id, state: s.body };
      }
      throw new Error("fixture " + label + ": no sweep input");
    }

    var debt = sweep.debt;
    var BASE_IN = sweep.input({ ingreso: 100000, gastos: { vivienda: 30000 }, deudas: [
      debt(100000, 10000, "pagando_normal"), debt(50000, 5000, "pagando_normal"), debt(80000, 8000, "pagando_normal"),
      debt(50000, 5000, "pagando_normal", { cancelada: true })] });
    function variantIn(ingreso) { return Object.assign(clone(BASE_IN), { ingreso: ingreso }); }
    // CONTENCION (flow unknown, negative bound): active 0/1/2 with known payments, 3 paid, 4 mora KNOWN_ZERO, 5 mora UNKNOWN.
    var CONT_IN = sweep.input({ ingreso: 100000, gastos: { vivienda: 90000 }, deudas: [
      debt(100000, 10000, "pagando_normal"), debt(50000, 5000, "pagando_normal"), debt(80000, 8000, "pagando_normal"),
      debt(50000, 5000, "pagando_normal", { cancelada: true }), debt(50000, null, "deje_pagar"), debt(40000, 4000, "atrasado_pagando")] });
    function contVariant(ingreso) { return Object.assign(clone(CONT_IN), { ingreso: ingreso }); }

    // ---- base fixture ----
    var base = await evaluationFor(ANON_A, JA, BASE_IN, "base");
    var EV = base.evaluation_id;
    var baseResult = classifier.classifyFinancialShadow(clone(BASE_IN));
    var leakKeys = ["result", "canonical_facts", "input_snapshot", "debts", "canonical_flow", "monthly_income", "anonymous_id", "journey_id",
      "seq", "event_id", "supersedes_event_id", "slot_key", "classifier_version", "financial_input_identity"];
    var baseKeys = walkKeys(base.state, []);
    check("fixture: base evaluation is CONSOLIDACION, monthly_surplus 47000, active debts 0/1/2 (3 is paid)",
      base.state.strategy === "CONSOLIDACION" && base.state.action_context.monthly_surplus.amount === 47000 &&
      eq(base.state.action_context.active_debts.map(function (d) { return d.debt_index; }), [0, 1, 2]), base.state);
    check("read: action_context equals buildActionContext(stored result); CONSOLIDACION lists no lower-payment debts, no allocation, opt-in none, " +
      "no third-party authorization",
      eq(base.state.action_context, buildActionContext(baseResult)) &&
      eq(base.state.choices.lower_payment_intent, []) &&
      base.state.choices.surplus_allocation === null &&
      eq(base.state.debt_management_opt_in, { scope: "debt_management_interest", state: "none", third_party_sharing_authorized: false, updated_at: null }),
    base.state);
    check("read: never exposes the stored result / canonical_facts / snapshot / internal ids (only evaluation_id as the write handle)",
      leakKeys.every(function (k) { return baseKeys.indexOf(k) === -1; }), baseKeys);
    check("contract: diagnosis response keeps v2_financial_strategy with exactly 7 keys and v2_action_context separate",
      Object.keys(base.diagnosis.v2_financial_strategy).length === 7 && eq(base.diagnosis.v2_action_context, base.state.action_context) &&
      !("user_choices" in base.diagnosis) && !("evaluation_id" in base.diagnosis), Object.keys(base.diagnosis));

    // ---- [A] lower_payment_intent (CONTENCION evaluation) ----
    var cont = await evaluationFor(ANON_A, JA, CONT_IN, "contencion");
    var EVL = cont.evaluation_id;
    check("fixture: CONTENCION evaluation exposes monthly_gap + active_debts [0,1,2,4,5]; eligible for lower payment = known payment > 0 [0,1,2]",
      cont.state.strategy === "CONTENCION" && eq(Object.keys(cont.state.action_context), ["monthly_gap", "active_debts"]) &&
      eq(cont.state.action_context.active_debts.map(function (d) { return [d.debt_index, d.monthly_debt_payment]; }),
        [[0, 10000], [1, 5000], [2, 8000], [4, 0], [5, null]]) &&
      eq(cont.state.choices.lower_payment_intent.map(function (x) { return [x.debt_index, x.state]; }), [[0, "unmarked"], [1, "unmarked"], [2, "unmarked"]]) &&
      eq(cont.diagnosis.v2_action_context, cont.state.action_context), cont.state);
    var optInsBeforeA = (await counts()).opt_ins;
    var a0 = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 0, diagnosis_id: cont.diagnosis_id });
    var a2 = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 2, state: "marked" });
    var sA1 = (await api.state(ANON_A, EVL)).body;
    check("[A] CONTENCION: mark debt 0 and debt 2 -> both current (default state marked); response is the minimal current choice",
      a0.status === 200 && a2.status === 200 && a0.body.appended === true &&
      eq(Object.keys(a0.body).sort(), ["appended", "choice_type", "current", "evaluation_id"]) &&
      a0.body.current.state === "marked" && a0.body.current.debt_index === 0 &&
      eq(sA1.choices.lower_payment_intent.map(function (x) { return [x.debt_index, x.state]; }), [[0, "marked"], [1, "unmarked"], [2, "marked"]]),
    { a0: a0.body, a2: a2.body, s: sA1.choices });
    var u0 = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 0, state: "unmarked" });
    var sA2 = (await api.state(ANON_A, EVL)).body;
    check("[A] CONTENCION: unmark debt 0 -> debt 0 unmarked, debt 2 still marked (independent slot per debt_index)",
      u0.status === 200 && u0.body.appended === true && u0.body.current.state === "unmarked" &&
      eq(sA2.choices.lower_payment_intent.map(function (x) { return [x.debt_index, x.state]; }), [[0, "unmarked"], [1, "unmarked"], [2, "marked"]]),
    sA2.choices);
    var h0 = await history(EVL, "lower_payment_intent:0");
    var h2 = await history(EVL, "lower_payment_intent:2");
    check("[A] history kept: debt 0 = [marked, unmarked] (seq 1 -> 2, superseded chain), debt 2 = [marked]; provenance diagnosis on the first event",
      eq(h0.map(function (r) { return r.lower_payment_state; }), ["marked", "unmarked"]) && chainValid(h0) &&
      eq(h2.map(function (r) { return r.lower_payment_state; }), ["marked"]) && h0[0].origin_diagnosis_id === cont.diagnosis_id &&
      h0.every(function (r) { return r.contract_version === "user_choice_v1" && r.anonymous_id === ANON_A && r.journey_id === JA; }), h0);
    var again = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 2 });
    var neverMarked = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 1, state: "unmarked" });
    check("[A] idempotent: re-marking a marked debt and unmarking a never-marked debt append nothing",
      again.status === 200 && again.body.appended === false && again.body.current.state === "marked" &&
      neverMarked.status === 200 && neverMarked.body.appended === false && neverMarked.body.current === null &&
      (await history(EVL, "lower_payment_intent:2")).length === 1 && (await history(EVL, "lower_payment_intent:1")).length === 0);
    var badIdx = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 9 });
    var paidIdx = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 3 });
    var zeroIdx = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 4 });
    var unknownIdx = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 5 });
    var negIdx = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: -1 });
    var fracIdx = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 1.5 });
    var badState = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 1, state: "maybe" });
    var withAmount = await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 1, amount: 100 });
    var rpcIdx = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: EVL, type: "lower_payment_intent", debt_index: 9, state: "marked" })));
    check("[A] CONTENCION: nonexistent index (9), paid debt (3), mora with payment 0 (4), unknown payment (5) -> 422 DEBT_NOT_ELIGIBLE " +
      "(also at the RPC without the service layer); nothing written",
      [badIdx, paidIdx, zeroIdx, unknownIdx].every(function (r) { return r.status === 422 && r.body.error === "DEBT_NOT_ELIGIBLE"; }) &&
      /DEBT_NOT_ELIGIBLE/.test(rpcIdx || "") &&
      (await q("SELECT count(*)::int AS n FROM public.financial_strategy_user_choice_events WHERE evaluation_id = $1 AND debt_index IN (3, 4, 5, 9)", [EVL]))[0].n === 0,
      { badIdx: badIdx.body, paidIdx: paidIdx.body, zeroIdx: zeroIdx.body, unknownIdx: unknownIdx.body, rpcIdx: rpcIdx });
    check("[A] malformed: negative / fractional index, unknown state, foreign field (amount) -> 400 INVALID_CHOICE_PAYLOAD",
      [negIdx, fracIdx, badState, withAmount].every(function (r) { return r.status === 400 && r.body.error === "INVALID_CHOICE_PAYLOAD"; }),
      [negIdx.body, fracIdx.body, badState.body, withAmount.body]);
    check("[A] lower_payment_intent never writes a debt management opt-in (Mi Deuda never contaminates the recommendation)",
      (await counts()).opt_ins === optInsBeforeA);

    // ---- [B] surplus_to_debt ----
    var bEq = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 1, amount: 47000, diagnosis_id: base.diagnosis_id });
    var bLt = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 0, amount: "12000.50" });
    check("[B] amount = surplus (47000) and amount < surplus (\"12000.50\") accepted; the second replaces the first",
      bEq.status === 200 && bEq.body.appended && bEq.body.current.amount === 47000 && bEq.body.current.debt_index === 1 &&
      bLt.status === 200 && bLt.body.appended && bLt.body.current.amount === 12000.5 && bLt.body.current.debt_index === 0,
    { bEq: bEq.body, bLt: bLt.body });
    var bOver = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 0, amount: 47000.01 });
    var bZero = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 0, amount: 0 });
    var bNeg = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 0, amount: -5 });
    check("[B] amount > surplus (47000.01), amount = 0, amount < 0 -> 422 AMOUNT_OUT_OF_RANGE",
      [bOver, bZero, bNeg].every(function (r) { return r.status === 422 && r.body.error === "AMOUNT_OUT_OF_RANGE"; }), [bOver.body, bZero.body, bNeg.body]);
    var bIdx = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 9, amount: 1000 });
    var bPaid = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 3, amount: 1000 });
    var bScale = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 0, amount: 1.234 });
    var bMissing = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 0 });
    var bNoIdx = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", amount: 1000 });
    check("[B] invalid debt_index (9) and paid debt (3) -> 422 DEBT_NOT_ELIGIBLE; 3 decimals / missing amount -> 400 INVALID_AMOUNT; " +
      "missing debt_index -> 400 INVALID_CHOICE_PAYLOAD",
      bIdx.status === 422 && bIdx.body.error === "DEBT_NOT_ELIGIBLE" && bPaid.status === 422 && bPaid.body.error === "DEBT_NOT_ELIGIBLE" &&
      bScale.status === 400 && bScale.body.error === "INVALID_AMOUNT" && bMissing.status === 400 && bMissing.body.error === "INVALID_AMOUNT" &&
      bNoIdx.status === 400 && bNoIdx.body.error === "INVALID_CHOICE_PAYLOAD", [bIdx.body, bPaid.body, bScale.body, bMissing.body, bNoIdx.body]);
    var rpcScale = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "surplus_to_debt", debt_index: 0, amount: "1.234" })));
    var rpcOver = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "surplus_to_debt", debt_index: 0, amount: "47000.01" })));
    check("[B] the RPC enforces the same rules without the service layer (INVALID_AMOUNT, AMOUNT_OUT_OF_RANGE)",
      /INVALID_AMOUNT/.test(rpcScale) && /AMOUNT_OUT_OF_RANGE/.test(rpcOver), { rpcScale: rpcScale, rpcOver: rpcOver });

    // ---- [C] surplus_reserve ----
    var cE = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 10000 });
    var cP = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "planned_goal", amount: 47000 });
    check("[C] emergency_fund (10000) and planned_goal (47000 = surplus) accepted; each replaces the current allocation",
      cE.status === 200 && cE.body.appended && cE.body.current.destination === "emergency_fund" && cE.body.current.amount === 10000 &&
      cP.status === 200 && cP.body.appended && cP.body.current.destination === "planned_goal" && !("debt_index" in cP.body.current),
    { cE: cE.body, cP: cP.body });
    var cInvest = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "invest", amount: 1000 });
    var cMargin = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "margin", amount: 1000 });
    var cNone = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", amount: 1000 });
    var cOver = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 47000.01 });
    var cWithIdx = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 1000, debt_index: 0 });
    var rpcInvest = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "surplus_reserve", destination: "invest", amount: 1000 })));
    check("[C] unknown destinations (invest, margin, missing) -> 400 INVALID_RESERVE_DESTINATION, also at the RPC; amount > surplus -> 422; " +
      "debt_index on a reserve -> 400 INVALID_CHOICE_PAYLOAD",
      [cInvest, cMargin, cNone].every(function (r) { return r.status === 400 && r.body.error === "INVALID_RESERVE_DESTINATION"; }) &&
      /INVALID_RESERVE_DESTINATION/.test(rpcInvest) && cOver.status === 422 && cOver.body.error === "AMOUNT_OUT_OF_RANGE" &&
      cWithIdx.status === 400 && cWithIdx.body.error === "INVALID_CHOICE_PAYLOAD", [cInvest.body, cMargin.body, cNone.body, cOver.body, cWithIdx.body, rpcInvest]);
    var cName = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "planned_goal", amount: 47000, name: "Viaje", target_amount: 1, date: "2027-01-01" });
    var cCols = (await q("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'financial_strategy_user_choice_events'"))
      .map(function (r) { return r.column_name; });
    check("[C] no goal name / target amount / date is stored (extra keys ignored, equal to the current choice -> nothing appended; no such columns)",
      cName.status === 200 && cName.body.appended === false && ["name", "target_amount", "date", "goal_name"].every(function (c) { return cCols.indexOf(c) === -1; }), cName.body);

    // ---- [D] single SURPLUS_ALLOCATION slot ----
    var evD = (await evaluationFor(ANON_A, JA, variantIn(100010), "slot")).evaluation_id;
    var d1 = await api.choose(ANON_A, evD, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 5000 });
    var sD1 = (await api.state(ANON_A, evD)).body.choices.surplus_allocation;
    var d2 = await api.choose(ANON_A, evD, { choice_type: "surplus_to_debt", debt_index: 2, amount: 7000 });
    var sD2 = (await api.state(ANON_A, evD)).body.choices.surplus_allocation;
    var d3 = await api.choose(ANON_A, evD, { choice_type: "surplus_reserve", destination: "planned_goal", amount: 3000 });
    var sD3 = (await api.state(ANON_A, evD)).body.choices.surplus_allocation;
    var hD = await history(evD, "surplus_allocation");
    check("[D] reserve -> debt: the debt allocation becomes the only current one", d2.status === 200 &&
      sD1.choice_type === "surplus_reserve" && sD2.choice_type === "surplus_to_debt" && sD2.debt_index === 2 && sD2.amount === 7000 && !("destination" in sD2), sD2);
    check("[D] debt -> reserve: the reserve allocation becomes the only current one", d3.status === 200 &&
      sD3.choice_type === "surplus_reserve" && sD3.destination === "planned_goal" && sD3.amount === 3000 && !("debt_index" in sD3), sD3);
    check("[D] history keeps every allocation as an explicit supersession chain (reserve -> debt -> reserve, seq 1..3)",
      d1.status === 200 && eq(hD.map(function (r) { return r.choice_type; }), ["surplus_reserve", "surplus_to_debt", "surplus_reserve"]) && chainValid(hD), hD);

    var evC = (await evaluationFor(ANON_A, JA, variantIn(100020), "concurrency")).evaluation_id;
    async function blockedChoice(first, second, finish) {
      var a = await pool.connect();
      var b = await pool.connect();
      try {
        var bPid = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p;
        await a.query("BEGIN");
        var ra = (await a.query(CHOICE_SQL, choiceArgs(first))).rows[0].v;
        var bPromise = b.query(CHOICE_SQL, choiceArgs(second));
        var waited = false;
        for (var t = 0; t < 100 && !waited; t++) {
          await new Promise(function (r) { setTimeout(r, 30); });
          var st = await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [bPid]);
          waited = st.rows[0] && st.rows[0].wait_event_type === "Lock";
        }
        await a.query(finish);
        var rb = (await bPromise).rows[0].v;
        return { ra: ra, rb: rb, waited: waited };
      } finally {
        a.release();
        b.release();
      }
    }
    var r1 = await blockedChoice({ evaluation_id: evC, type: "surplus_reserve", destination: "emergency_fund", amount: 1000 },
      { evaluation_id: evC, type: "surplus_to_debt", debt_index: 0, amount: 2000 }, "COMMIT");
    var hC1 = await history(evC, "surplus_allocation");
    check("[D-concurrency] two tabs, same evaluation: the second write blocks on the evaluation row lock (Lock wait observed), then supersedes the first",
      r1.waited && r1.ra.current.seq === 1 && r1.rb.current.seq === 2 && hC1.length === 2 && chainValid(hC1) &&
      hC1[1].supersedes_event_id === r1.ra.current.event_id, { waited: r1.waited, ra: r1.ra, rb: r1.rb });
    var r2 = await blockedChoice({ evaluation_id: evC, type: "surplus_reserve", destination: "planned_goal", amount: 3000 },
      { evaluation_id: evC, type: "surplus_reserve", destination: "emergency_fund", amount: 4000 }, "ROLLBACK");
    var hC2 = await history(evC, "surplus_allocation");
    check("[D-concurrency] the first writer rolls back while the second waits -> the waiter supersedes the previous committed head; no gap",
      r2.waited && r2.rb.current.seq === 3 && hC2.length === 3 && chainValid(hC2) && hC2[2].supersedes_event_id === hC1[1].event_id &&
      hC2.every(function (r) { return r.amount !== "3000"; }), { waited: r2.waited, rb: r2.rb });

    var evS = (await evaluationFor(ANON_A, JA, variantIn(100030), "storm")).evaluation_id;
    var STORM = 24;
    var stormReplies = await Promise.all(Array.from({ length: STORM }, function (_x, k) {
      var o = k % 2 === 0
        ? { evaluation_id: evS, type: "surplus_reserve", destination: k % 4 === 0 ? "emergency_fund" : "planned_goal", amount: 1000 + k }
        : { evaluation_id: evS, type: "surplus_to_debt", debt_index: k % 3, amount: 1000 + k };
      return pool.query(CHOICE_SQL, choiceArgs(o)).then(function (r) { return r.rows[0].v; });
    }));
    var hS = await history(evS, "surplus_allocation");
    var heads = (await q("SELECT count(*)::int AS n FROM public.financial_strategy_user_choice_events c WHERE c.evaluation_id = $1 AND " +
      "c.slot_key = 'surplus_allocation' AND NOT EXISTS (SELECT 1 FROM public.financial_strategy_user_choice_events s " +
      "WHERE s.supersedes_event_id = c.event_id)", [evS]))[0].n;
    var sS = (await api.state(ANON_A, evS)).body.choices.surplus_allocation;
    check("[D-concurrency] PG17 stress: " + STORM + " concurrent writers (debt + reserve) on one evaluation -> " + STORM +
      " appended, seq 1.." + STORM + " contiguous, linear chain, exactly 1 current allocation",
      stormReplies.every(function (r) { return r.appended; }) && hS.length === STORM && chainValid(hS) && heads === 1 &&
      Number(hS[STORM - 1].amount) === sS.amount && hS[STORM - 1].choice_type === sS.choice_type, { n: hS.length, heads: heads });

    var MARKS = 20;
    var evSL = (await evaluationFor(ANON_A, JA, contVariant(100030), "mark storm")).evaluation_id;
    var markReplies = await Promise.all(Array.from({ length: MARKS }, function (_x, k) {
      return pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: evSL, type: "lower_payment_intent", debt_index: 0, state: k % 2 ? "unmarked" : "marked" }))
        .then(function (r) { return r.rows[0].v; });
    }));
    var hM = await history(evSL, "lower_payment_intent:0");
    check("[D-concurrency] " + MARKS + " concurrent mark/unmark on one debt -> linear chain, never two equal consecutive states, first event is a mark, " +
      "appended count == history length",
      chainValid(hM) && hM.length >= 1 && hM[0].lower_payment_state === "marked" &&
      hM.every(function (r, k) { return k === 0 || r.lower_payment_state !== hM[k - 1].lower_payment_state; }) &&
      markReplies.filter(function (r) { return r.appended; }).length === hM.length, hM.map(function (r) { return r.lower_payment_state; }));

    var evT = (await evaluationFor(ANON_A, JA, variantIn(100040), "tabs")).evaluation_id;
    var tabs = await Promise.all([
      api.choose(ANON_A, evT, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 2500 }),
      api.choose(ANON_A, evT, { choice_type: "surplus_to_debt", debt_index: 1, amount: 2600 }),
    ]);
    var hT = await history(evT, "surplus_allocation");
    var sT = (await api.state(ANON_A, evT)).body.choices.surplus_allocation;
    check("[D-concurrency] two browser tabs through HTTP at once (reserve + debt) -> both 200, history 2, exactly one current = the later seq",
      tabs.every(function (t) { return t.status === 200 && t.body.appended; }) && hT.length === 2 && chainValid(hT) &&
      sT.choice_type === hT[1].choice_type && sT.amount === Number(hT[1].amount), { tabs: tabs.map(function (t) { return t.body; }), sT: sT });

    var lockHolder = await pool.connect();
    var reuseMs = null;
    try {
      await lockHolder.query("BEGIN");
      await lockHolder.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "surplus_reserve", destination: "emergency_fund", amount: 100 }));
      var t0 = Date.now();
      var reuse = await Promise.race([api.diagnose(ANON_A, JA, BASE_IN), new Promise(function (r) { setTimeout(function () { r(null); }, 8000); })]);
      reuseMs = reuse && reuse.status === 200 ? Date.now() - t0 : null;
      await lockHolder.query("ROLLBACK");
    } finally {
      lockHolder.release();
    }
    check("[D-concurrency] an open choice write on an evaluation does not block a new diagnosis reusing it (FOR NO KEY UPDATE vs KEY SHARE)",
      reuseMs !== null, reuseMs);

    // ---- constraint backstop (direct writes as the table owner; the RPC is the only granted path) ----
    var evK = (await evaluationFor(ANON_A, JA, variantIn(100050), "backstop")).evaluation_id;
    function ins(o) {
      var row = Object.assign({ evaluation_id: evK, journey_id: JA, anonymous_id: ANON_A, contract_version: "user_choice_v1", slot_key: "lower_payment_intent:0",
        choice_type: "lower_payment_intent", lower_payment_state: "marked", debt_index: 0, amount: null, reserve_destination: null,
        seq: 1, supersedes_event_id: null, supersedes_seq: null }, o);
      var cols = Object.keys(row);
      return pool.query("INSERT INTO public.financial_strategy_user_choice_events (" + cols.join(", ") + ") VALUES (" +
        cols.map(function (_c, k) { return "$" + (k + 1); }).join(", ") + ") RETURNING event_id", cols.map(function (c) { return row[c]; }));
    }
    var root = (await ins({})).rows[0].event_id;
    var twoRoots = await errorOf(ins({}));
    var succ = (await ins({ seq: 2, supersedes_event_id: root, supersedes_seq: 1, lower_payment_state: "unmarked" })).rows[0].event_id;
    var doubleSucc = await errorOf(ins({ seq: 2, supersedes_event_id: root, supersedes_seq: 1, lower_payment_state: "unmarked" }));
    var gap = await errorOf(ins({ seq: 4, supersedes_event_id: succ, supersedes_seq: 2 }));
    var crossSlot = await errorOf(ins({ slot_key: "lower_payment_intent:1", debt_index: 1, seq: 2, supersedes_event_id: root, supersedes_seq: 1 }));
    var fakeParent = await errorOf(ins({ seq: 3, supersedes_event_id: FAKE_UUID, supersedes_seq: 2 }));
    check("backstop: two roots / two successors in one slot -> unique violation; seq gap -> chain check; parent in another slot or missing -> FK",
      /fs_user_choice_events_slot_seq_key/.test(twoRoots) && /fs_user_choice_events_slot_seq_key/.test(doubleSucc) &&
      /fs_user_choice_events_chain_check/.test(gap) && /fs_user_choice_events_chain_fk/.test(crossSlot) && /fs_user_choice_events_chain_fk/.test(fakeParent),
    { twoRoots: twoRoots, doubleSucc: doubleSucc, gap: gap, crossSlot: crossSlot, fakeParent: fakeParent });
    var payloadErrs = await Promise.all([
      ins({ slot_key: "lower_payment_intent:5", debt_index: 5, amount: 10 }),
      ins({ slot_key: "lower_payment_intent:5", debt_index: 6 }),
      ins({ slot_key: "surplus_allocation", choice_type: "surplus_to_debt", lower_payment_state: null, amount: 1.234 }),
      ins({ slot_key: "surplus_allocation", choice_type: "surplus_reserve", lower_payment_state: null, debt_index: null, amount: 10, reserve_destination: "invest" }),
      ins({ slot_key: "surplus_allocation", choice_type: "surplus_to_debt", lower_payment_state: null, amount: 0 }),
      ins({ slot_key: "surplus_allocation", choice_type: "surplus_reserve", lower_payment_state: null, amount: 10, reserve_destination: "emergency_fund" }),
      ins({ contract_version: "user_choice_v2" }),
      ins({ slot_key: "commercial_offer", choice_type: "commercial_offer" }),
    ].map(errorOf));
    check("backstop: CHECKs reject foreign payload fields, slot/debt mismatch, 3-decimal or zero amounts, unknown destination, reserve with debt_index, " +
      "unknown contract or choice type",
      payloadErrs.every(function (e) { return /check constraint/.test(e || ""); }), payloadErrs);
    var upd = await errorOf(pool.query("UPDATE public.financial_strategy_user_choice_events SET lower_payment_state = 'unmarked' WHERE event_id = $1", [root]));
    var del = await errorOf(pool.query("DELETE FROM public.financial_strategy_user_choice_events WHERE event_id = $1", [succ]));
    var trn = await errorOf(pool.query("TRUNCATE public.financial_strategy_user_choice_events"));
    check("backstop: UPDATE / DELETE / TRUNCATE on choice events -> USER_CHOICE_APPEND_ONLY (even for the owner)",
      [upd, del, trn].every(function (e) { return /USER_CHOICE_APPEND_ONLY/.test(e || ""); }), [upd, del, trn]);

    // ---- [H] debt_management_opt_in ----
    var connects = [];
    var realConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function () {
      var a0 = arguments[0];
      if (Array.isArray(a0)) a0 = a0[0];
      connects.push(a0 && typeof a0 === "object" ? String(a0.host || "localhost") : typeof arguments[1] === "string" ? arguments[1] : "localhost");
      return realConnect.apply(this, arguments);
    };
    var tStart = (await q("SELECT clock_timestamp() AS t"))[0].t;
    var cBeforeOpt = await counts();
    var o1;
    try {
      o1 = await api.optIn(ANON_A, EV, { state: "opted_in", diagnosis_id: base.diagnosis_id, consent_text_version: "dm-optin-draft-1",
        scope: "third_party_sharing", source: "janus", third_party_sharing_authorized: true, created_at: "2000-01-01T00:00:00Z", evaluation_id: FAKE_UUID });
    } finally {
      net.Socket.prototype.connect = realConnect;
    }
    var cAfterOpt = await counts();
    var oh1 = await optInHistory(JA);
    check("[H] opt-in recorded: scope debt_management_interest, source miplan_v2, server timestamp; forged scope/source/created_at/authorization ignored",
      o1.status === 200 && o1.body.appended === true &&
      eq(o1.body.debt_management_opt_in, { scope: "debt_management_interest", state: "opted_in", third_party_sharing_authorized: false, updated_at: o1.body.debt_management_opt_in.updated_at }) &&
      oh1.length === 1 && oh1[0].scope === "debt_management_interest" && oh1[0].source === "miplan_v2" &&
      oh1[0].contract_version === "debt_management_opt_in_v1" && new Date(oh1[0].created_at) >= new Date(tStart), { body: o1.body, row: oh1[0] });
    check("[H] provenance: origin_evaluation_id = path evaluation (not the body's), origin_diagnosis_id, consent_text_version, journey + owner",
      oh1[0].origin_evaluation_id === EV && oh1[0].origin_diagnosis_id === base.diagnosis_id && oh1[0].consent_text_version === "dm-optin-draft-1" &&
      oh1[0].journey_id === JA && oh1[0].anonymous_id === ANON_A, oh1[0]);
    var deltas = {};
    Object.keys(cAfterOpt).forEach(function (k) { if (cAfterOpt[k] !== cBeforeOpt[k]) deltas[k] = cAfterOpt[k] - cBeforeOpt[k]; });
    check("[H] no external effect: only debt_management_opt_in_events changed (+1), no choice written, every socket opened was loopback (" +
      connects.length + ")", eq(deltas, { opt_ins: 1 }) && connects.every(function (h) { return ["127.0.0.1", "localhost", "::1"].indexOf(h) !== -1; }),
    { deltas: deltas, connects: connects });
    var oAgain = await api.optIn(ANON_A, EV, { state: "opted_in" });
    var oW = await api.optIn(ANON_A, EV, { state: "withdrawn" });
    var oBack = await api.optIn(ANON_A, EV, { state: "opted_in", diagnosis_id: base.diagnosis_id });
    var oh2 = await optInHistory(JA);
    var sH = (await api.state(ANON_A, EV)).body;
    check("[H] idempotent re-opt-in appends nothing; withdraw and opt back in -> history [opted_in, withdrawn, opted_in] as a chain; read shows current",
      oAgain.body.appended === false && oW.body.debt_management_opt_in.state === "withdrawn" && oBack.body.appended === true &&
      eq(oh2.map(function (r) { return r.state; }), ["opted_in", "withdrawn", "opted_in"]) && chainValid(oh2) &&
      sH.debt_management_opt_in.state === "opted_in" && sH.debt_management_opt_in.third_party_sharing_authorized === false, oh2);
    var oBad = await api.optIn(ANON_A, EV, { state: "yes" });
    var oMissing = await api.optIn(ANON_A, EV, {});
    var oVer = await api.optIn(ANON_A, EV, { state: "opted_in", consent_text_version: "Texto Legal V1" });
    var oForeign = await api.optIn(ANON_B, EV, { state: "opted_in" });
    check("[H] invalid / missing state -> 400 INVALID_OPT_IN_STATE; malformed text version -> 400; another owner -> 404 (ownership enforced)",
      oBad.status === 400 && oBad.body.error === "INVALID_OPT_IN_STATE" && oMissing.status === 400 && oVer.status === 400 &&
      oVer.body.error === "INVALID_CONSENT_TEXT_VERSION" && oForeign.status === 404 && oForeign.body.error === "EVALUATION_NOT_FOUND",
    [oBad.body, oMissing.body, oVer.body, oForeign.body]);
    var choicesBeforeMark = (await counts()).choices;
    var optBeforeMark = (await counts()).opt_ins;
    await api.choose(ANON_A, EVL, { choice_type: "lower_payment_intent", debt_index: 1 });
    var afterMark = await counts();
    await api.optIn(ANON_A, EV, { state: "withdrawn" });
    var afterOpt = await counts();
    await api.optIn(ANON_A, EV, { state: "opted_in" });
    check("[H] opt-in != lower_payment_intent: marking a debt writes only a choice, opting in writes only an opt-in (separate tables / RPCs)",
      afterMark.choices === choicesBeforeMark + 1 && afterMark.opt_ins === optBeforeMark &&
      afterOpt.choices === afterMark.choices && afterOpt.opt_ins === afterMark.opt_ins + 1, { choicesBeforeMark: choicesBeforeMark, afterMark: afterMark, afterOpt: afterOpt });
    var scopeCheck = await errorOf(pool.query("INSERT INTO public.debt_management_opt_in_events (journey_id, anonymous_id, scope, state, contract_version, " +
      "source, origin_evaluation_id, seq) VALUES ($1, $2, 'third_party_sharing', 'opted_in', 'debt_management_opt_in_v1', 'miplan_v2', $3, 1)", [JA, ANON_A, EV]));
    var sourceCheck = await errorOf(pool.query("INSERT INTO public.debt_management_opt_in_events (journey_id, anonymous_id, scope, state, contract_version, " +
      "source, origin_evaluation_id, seq) VALUES ($1, $2, 'debt_management_interest', 'opted_in', 'debt_management_opt_in_v1', 'janus', $3, 1)", [JA, ANON_A, EV]));
    var optUpd = await errorOf(pool.query("UPDATE public.debt_management_opt_in_events SET state = 'withdrawn'"));
    check("[H] backstop: a third-party-sharing scope or a non-MiPlan source cannot be stored; opt-in events are append-only",
      /dm_opt_in_events_scope_check/.test(scopeCheck) && /dm_opt_in_events_source_check/.test(sourceCheck) && /USER_CHOICE_APPEND_ONLY/.test(optUpd),
      [scopeCheck, sourceCheck, optUpd]);
    var OPTS = 16;
    var evJ2 = await evaluationFor(ANON_A, JA2, BASE_IN, "opt-in storm journey");
    var vigJA2Before = evJ2.state;
    var optReplies = await Promise.all(Array.from({ length: OPTS }, function (_x, k) {
      return pool.query(OPT_IN_SQL, [SECRET, ANON_A, evJ2.evaluation_id, null, k % 2 ? "withdrawn" : "opted_in", null]).then(function (r) { return r.rows[0].v; });
    }));
    var ohS = await optInHistory(JA2);
    check("[D-concurrency] " + OPTS + " concurrent opt-in / withdraw on one journey -> linear chain, never two equal consecutive states, first is opted_in",
      chainValid(ohS) && ohS.length >= 1 && ohS[0].state === "opted_in" &&
      ohS.every(function (r, k) { return k === 0 || r.state !== ohS[k - 1].state; }) &&
      optReplies.filter(function (r) { return r.appended; }).length === ohS.length, ohS.map(function (r) { return r.state; }));

    // ---- [E] vigency ----
    var sEV = (await api.state(ANON_A, EV)).body;
    var reuseD = await api.diagnose(ANON_A, JA, Object.assign(clone(BASE_IN), { tiene_encuesta: true,
      respuestas: { p1: "D", p2: "D", p3: "D", p4: "D", p5: "D", p6: "D", p7: "D", p8: "D", p9: "D", p10: "D" } }));
    var sReuse = (await api.stateByDiagnosis(ANON_A, reuseD.body.diagnosis_id)).body;
    check("[E] a new diagnosis reusing the same evaluation (same finances, other legacy survey) -> same evaluation_id, every choice still current",
      reuseD.status === 200 && reuseD.body.diagnosis_id !== base.diagnosis_id && sReuse.evaluation_id === EV && eq(sReuse.choices, sEV.choices) &&
      sEV.choices.surplus_allocation !== null, { sReuse: sReuse.choices, sEV: sEV.choices });
    var sEVL = (await api.state(ANON_A, EVL)).body;
    var reuseL = await api.diagnose(ANON_A, JA, Object.assign(clone(CONT_IN), { tiene_encuesta: true,
      respuestas: { p1: "D", p2: "D", p3: "D", p4: "D", p5: "D", p6: "D", p7: "D", p8: "D", p9: "D", p10: "D" } }));
    var sReuseL = (await api.stateByDiagnosis(ANON_A, reuseL.body.diagnosis_id)).body;
    var idL = await evaluationFor(ANON_A, JA, Object.assign(clone(CONT_IN), { deudas: [debt(100000, 11000, "pagando_normal")].concat(clone(CONT_IN.deudas.slice(1))) }), "contencion new identity");
    check("[E] CONTENCION: reuse keeps the marked debts current ([1, 2] marked); a new financial identity starts with every debt unmarked",
      sReuseL.evaluation_id === EVL && eq(sReuseL.choices, sEVL.choices) &&
      eq(sEVL.choices.lower_payment_intent.map(function (x) { return [x.debt_index, x.state]; }), [[0, "unmarked"], [1, "marked"], [2, "marked"]]) &&
      idL.evaluation_id !== EVL && idL.state.strategy === "CONTENCION" &&
      eq(idL.state.choices.lower_payment_intent.map(function (x) { return x.state; }), ["unmarked", "unmarked", "unmarked"]),
    { reuse: sReuseL.choices, before: sEVL.choices, idL: idL.state.choices });
    var idD = await evaluationFor(ANON_A, JA, Object.assign(clone(BASE_IN), { deudas: [debt(100000, 11000, "pagando_normal")].concat(clone(BASE_IN.deudas.slice(1))) }), "new identity");
    check("[E] new financial identity (debt payment changed) -> new evaluation, no choice inherited (journey-level opt-in stays current)",
      idD.evaluation_id !== EV && idD.state.choices.surplus_allocation === null &&
      idD.state.choices.lower_payment_intent.every(function (x) { return x.state === "unmarked"; }) && idD.state.debt_management_opt_in.state === "opted_in", idD.state);
    var bumpedDiag = await bumped.createDiagnosis({ anonymousId: ANON_A, body: Object.assign(clone(BASE_IN), { journey_id: JA }) });
    var sBump = (await api.stateByDiagnosis(ANON_A, bumpedDiag.diagnosis_id)).body;
    var bumpRow = (await q("SELECT classifier_version FROM public.financial_strategy_evaluations WHERE evaluation_id = $1", [sBump.evaluation_id]))[0];
    check("[E] classifier_version bump -> new evaluation, no choice inherited", sBump.evaluation_id !== EV && bumpRow.classifier_version === BUMP &&
      sBump.choices.surplus_allocation === null && sBump.choices.lower_payment_intent.every(function (x) { return x.state === "unmarked"; }), sBump);
    check("[E] other journey of the same owner -> new evaluation, no choice and no opt-in inherited",
      evJ2.evaluation_id !== EV && vigJA2Before.choices.surplus_allocation === null &&
      vigJA2Before.choices.lower_payment_intent.every(function (x) { return x.state === "unmarked"; }) && vigJA2Before.debt_management_opt_in.state === "none", vigJA2Before);
    check("[E] the original evaluations keep their choices after all of the above",
      eq((await api.state(ANON_A, EV)).body.choices, sEV.choices) && eq((await api.state(ANON_A, EVL)).body.choices, sEVL.choices));

    // ---- [F] ownership / IDOR ----
    var baseB = await evaluationFor(ANON_B, JB, BASE_IN, "owner B");
    var cBeforeIdor = await counts();
    var fRead = await api.state(ANON_B, EV);
    var fReadDiag = await api.stateByDiagnosis(ANON_B, base.diagnosis_id);
    var fWrite = await api.choose(ANON_B, EV, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 100 });
    var fWriteLow = await api.choose(ANON_B, EV, { choice_type: "lower_payment_intent", debt_index: 0, state: "unmarked" });
    var fFake = await api.state(ANON_A, FAKE_UUID);
    var fFakeWrite = await api.choose(ANON_A, FAKE_UUID, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 100 });
    var fFakeDiag = await api.stateByDiagnosis(ANON_A, FAKE_UUID);
    var fAonB = await api.state(ANON_A, baseB.evaluation_id);
    check("[F] B cannot read A's evaluation (by evaluation_id or by A's diagnosis_id) -> 404 EVALUATION_NOT_FOUND",
      fRead.status === 404 && fRead.body.error === "EVALUATION_NOT_FOUND" && fReadDiag.status === 404 && fReadDiag.body.error === "EVALUATION_NOT_FOUND",
      [fRead.body, fReadDiag.body]);
    check("[F] B cannot write choices on A's evaluation (surplus or lower payment) -> 404", fWrite.status === 404 && fWriteLow.status === 404 &&
      fWrite.body.error === "EVALUATION_NOT_FOUND", [fWrite.body, fWriteLow.body]);
    check("[F] A cannot read B's evaluation either -> 404", fAonB.status === 404, fAonB.body);
    check("[F] a fabricated evaluation_id / diagnosis_id -> 404, byte-identical to a foreign one (no existence oracle)",
      fFake.status === 404 && fFakeWrite.status === 404 && fFakeDiag.status === 404 && fFake.raw === fRead.raw && fFakeWrite.raw === fWrite.raw,
      [fFake.raw, fRead.raw]);
    check("[F] IDOR attempts wrote nothing", eq(await counts(), cBeforeIdor));
    var fHeaderWins = await api.choose(ANON_B, EV, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 100, anonymous_id: ANON_A });
    var fNoAnon = await api.state(null, EV);
    var fBadUuid = await api.state(ANON_A, "not-a-uuid");
    check("[F] owner comes from the header (a body anonymous_id cannot borrow A's identity); no owner -> 400; malformed id -> 400",
      fHeaderWins.status === 404 && fNoAnon.status === 400 && fNoAnon.body.error === "ANONYMOUS_ID_REQUIRED" &&
      fBadUuid.status === 400 && fBadUuid.body.error === "INVALID_EVALUATION_ID", [fHeaderWins.body, fNoAnon.body, fBadUuid.body]);
    var fProvB = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 100, diagnosis_id: baseB.diagnosis_id });
    var fProvOther = await api.choose(ANON_A, EV, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 100, diagnosis_id: idD.diagnosis_id });
    var fProvOpt = await api.optIn(ANON_A, EV, { state: "withdrawn", diagnosis_id: baseB.diagnosis_id });
    check("[F] provenance diagnosis_id must be linked to this evaluation and owned (B's diagnosis, or A's diagnosis of another evaluation) -> 404 DIAGNOSIS_NOT_LINKED",
      [fProvB, fProvOther, fProvOpt].every(function (r) { return r.status === 404 && r.body.error === "DIAGNOSIS_NOT_LINKED"; }),
      [fProvB.body, fProvOther.body, fProvOpt.body]);
    var wrongSecret = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ secret: "wrong", evaluation_id: EV, type: "lower_payment_intent", debt_index: 0, state: "marked" })));
    var nullSecret = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ secret: null, evaluation_id: EV, type: "lower_payment_intent", debt_index: 0, state: "marked" })));
    var readSecret = await errorOf(pool.query(STATE_SQL, ["wrong", ANON_A, EV]));
    var optSecret = await errorOf(pool.query(OPT_IN_SQL, ["wrong", ANON_A, EV, null, "withdrawn", null]));
    var rpcForeign = await errorOf(pool.query(STATE_SQL, [SECRET, ANON_B, EV]));
    check("[F] RPC level: wrong / missing secret -> MIPLAN_UNAUTHORIZED on all 3 RPCs; right secret, wrong owner -> EVALUATION_NOT_FOUND",
      [wrongSecret, nullSecret, readSecret, optSecret].every(function (e) { return /MIPLAN_UNAUTHORIZED/.test(e || ""); }) &&
      /EVALUATION_NOT_FOUND/.test(rpcForeign), [wrongSecret, nullSecret, readSecret, optSecret, rpcForeign]);
    var denied = [];
    for (var role of ["anon", "authenticated"]) {
      var c = await pool.connect();
      try {
        await c.query("SET ROLE " + role);
        for (var tbl of ["financial_strategy_user_choice_events", "debt_management_opt_in_events"]) {
          denied.push(/permission denied/.test(await errorOf(c.query("SELECT 1 FROM public." + tbl + " LIMIT 1"))));
          denied.push(/permission denied/.test(await errorOf(c.query("INSERT INTO public." + tbl + " DEFAULT VALUES"))));
        }
        denied.push(/permission denied/.test(await errorOf(c.query("SELECT miplan_private.v2_choice_authority('{}'::jsonb)"))));
        denied.push(/MIPLAN_UNAUTHORIZED/.test(await errorOf(c.query(STATE_SQL, ["guess", ANON_A, EV]))));
      } finally {
        await c.query("RESET ROLE");
        c.release();
      }
    }
    check("[F] anon / authenticated: no direct table read or write, no access to miplan_private, RPCs useless without the backend secret",
      denied.length === 12 && denied.every(Boolean), denied);

    // ---- [G] server authority ----
    var forged = await api.choose(ANON_A, EV, { choice_type: "surplus_to_debt", debt_index: 0, amount: 50000,
      strategy: "MANTENIMIENTO_OPTIMIZACION", monthly_surplus: 999999, action_context: { monthly_surplus: { amount: 999999 } },
      active_debts: [{ debt_index: 0 }], classification_status: "classified" });
    check("[G] forged strategy / monthly_surplus / action_context in the body are ignored: 50000 > stored surplus 47000 -> 422 AMOUNT_OUT_OF_RANGE",
      forged.status === 422 && forged.body.error === "AMOUNT_OUT_OF_RANGE", forged.body);
    var mant = await evaluationFor(ANON_A, JA, sweep.input({ ingreso: 100000, gastos: { vivienda: 40000 }, deudas: [], no_debts_declared: true }), "mantenimiento");
    var gMantDebt = await api.choose(ANON_A, mant.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 0, amount: 100, active_debts: [{ debt_index: 0, monthly_debt_payment: 1 }] });
    var gMantLow = await api.choose(ANON_A, mant.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var gMantRes = await api.choose(ANON_A, mant.evaluation_id, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 60000 });
    check("[G] MANTENIMIENTO (surplus 60000, no active debts): forged debts cannot authorize surplus_to_debt / lower payment (422); reserve <= surplus OK",
      mant.state.strategy === "MANTENIMIENTO_OPTIMIZACION" && mant.state.action_context.monthly_surplus.amount === 60000 &&
      gMantDebt.status === 422 && gMantDebt.body.error === "DEBT_NOT_ELIGIBLE" && gMantLow.status === 422 && gMantLow.body.error === "DEBT_NOT_ELIGIBLE" &&
      gMantRes.status === 200 && eq(mant.state.choices.lower_payment_intent, []), { state: mant.state, d: gMantDebt.body, l: gMantLow.body, r: gMantRes.body });
    var reg = await pickEvaluation("regularizacion", function (r) {
      var a = buildActionContext(r);
      return r.strategy === "REGULARIZACION" && a && a.mora_debts.length > 0;
    });
    var gRegRes = await api.choose(ANON_A, reg.evaluation_id, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 1, monthly_surplus: 5000 });
    var gRegLow = await api.choose(ANON_A, reg.evaluation_id, { choice_type: "lower_payment_intent", debt_index: buildActionContext(reg.result).mora_debts[0].debt_index });
    check("[G] REGULARIZACION: no surplus to allocate (422 SURPLUS_NOT_AVAILABLE even with a forged monthly_surplus); mora debt not eligible for lower payment",
      gRegRes.status === 422 && gRegRes.body.error === "SURPLUS_NOT_AVAILABLE" && gRegLow.status === 422 && gRegLow.body.error === "DEBT_NOT_ELIGIBLE",
      [gRegRes.body, gRegLow.body]);
    var regPaying = await pickEvaluation("regularizacion with a paying debt", function (r) {
      return r.strategy === "REGULARIZACION" && r.canonical_facts.debts.some(function (d) {
        return d.active_debt === true && d.monthly_debt_payment.status === "KNOWN_POSITIVE";
      });
    });
    var regPayIdx = regPaying.result.canonical_facts.debts.filter(function (d) {
      return d.active_debt === true && d.monthly_debt_payment.status === "KNOWN_POSITIVE";
    })[0].debt_index;
    var gRegPay = await api.choose(ANON_A, regPaying.evaluation_id, { choice_type: "lower_payment_intent", debt_index: regPayIdx,
      strategy: "REDUCCION_CARGA", action_context: { active_debts: [{ debt_index: regPayIdx, monthly_debt_payment: 1000 }] } });
    var gRegPayRpc = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: regPaying.evaluation_id, type: "lower_payment_intent", debt_index: regPayIdx, state: "marked" })));
    check("[G] REGULARIZACION rejects lower_payment_intent even on an active debt with a known payment > 0 (strategy gate, not only payment gate), " +
      "at service and RPC; the read lists nothing",
      gRegPay.status === 422 && gRegPay.body.error === "DEBT_NOT_ELIGIBLE" && /DEBT_NOT_ELIGIBLE/.test(gRegPayRpc || "") &&
      eq(regPaying.state.choices.lower_payment_intent, []), { body: gRegPay.body, rpc: gRegPayRpc, state: regPaying.state.choices });
    var gConsLow = await api.choose(ANON_A, EV, { choice_type: "lower_payment_intent", debt_index: 0 });
    var gConsForged = await api.choose(ANON_A, EV, { choice_type: "lower_payment_intent", debt_index: 0, strategy: "CONTENCION",
      classification_status: "classified", action_context: { monthly_gap: { amount: 1 }, active_debts: [{ debt_index: 0, monthly_debt_payment: 10000 }] },
      v2_financial_strategy: { strategy: "REDUCCION_CARGA" } });
    var gConsRpc = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "lower_payment_intent", debt_index: 0, state: "marked" })));
    check("[G] CONSOLIDACION rejects lower_payment_intent on its active debt 0 (known payment 10000) -> 422 DEBT_NOT_ELIGIBLE; a forged strategy / " +
      "action_context in the body changes nothing; the RPC rejects on its own; nothing written",
      gConsLow.status === 422 && gConsLow.body.error === "DEBT_NOT_ELIGIBLE" && gConsForged.status === 422 && gConsForged.body.error === "DEBT_NOT_ELIGIBLE" &&
      /DEBT_NOT_ELIGIBLE/.test(gConsRpc || "") &&
      (await q("SELECT count(*)::int AS n FROM public.financial_strategy_user_choice_events WHERE evaluation_id = $1 AND choice_type = 'lower_payment_intent'", [EV]))[0].n === 0,
      [gConsLow.body, gConsForged.body, gConsRpc]);
    var red = await pickEvaluation("reduccion", function (r) {
      var a = buildActionContext(r);
      return r.strategy === "REDUCCION_CARGA" && a && a.active_debts.some(function (d) { return d.monthly_debt_payment > 0; });
    });
    var redIdx = buildActionContext(red.result).active_debts.filter(function (d) { return d.monthly_debt_payment > 0; })[0].debt_index;
    var gRedLow = await api.choose(ANON_A, red.evaluation_id, { choice_type: "lower_payment_intent", debt_index: redIdx });
    var gRedSur = await api.choose(ANON_A, red.evaluation_id, { choice_type: "surplus_to_debt", debt_index: redIdx, amount: 1 });
    check("[G] REDUCCION_CARGA: lower payment on an active debt with a known payment OK; no surplus -> 422 SURPLUS_NOT_AVAILABLE",
      gRedLow.status === 200 && gRedLow.body.appended && gRedSur.status === 422 && gRedSur.body.error === "SURPLUS_NOT_AVAILABLE", [gRedLow.body, gRedSur.body]);
    var contG = await evaluationFor(ANON_A, JA, contVariant(100060), "contencion authority");
    var gContLow = await api.choose(ANON_A, contG.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 1,
      strategy: "CONSOLIDACION", classification_status: "incomplete", action_context: null });
    var gContForgedIdx = await api.choose(ANON_A, contG.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 4,
      active_debts: [{ debt_index: 4, monthly_debt_payment: 9999 }], action_context: { active_debts: [{ debt_index: 4, monthly_debt_payment: 9999 }] },
      monthly_debt_payment: 9999 });
    var gContRes = await api.choose(ANON_A, contG.evaluation_id, { choice_type: "surplus_reserve", destination: "planned_goal", amount: 1 });
    var gContSur = await api.choose(ANON_A, contG.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 0, amount: 1, monthly_surplus: 5000 });
    check("[G] CONTENCION: lower payment on debt 1 OK even with a hostile body (strategy CONSOLIDACION / incomplete / action_context null ignored); " +
      "forged eligibility for debt 4 (payment 0) -> 422 DEBT_NOT_ELIGIBLE; no surplus -> reserve and surplus_to_debt 422 SURPLUS_NOT_AVAILABLE",
      contG.state.strategy === "CONTENCION" && gContLow.status === 200 && gContLow.body.appended === true &&
      gContForgedIdx.status === 422 && gContForgedIdx.body.error === "DEBT_NOT_ELIGIBLE" &&
      gContRes.status === 422 && gContRes.body.error === "SURPLUS_NOT_AVAILABLE" && gContSur.status === 422 && gContSur.body.error === "SURPLUS_NOT_AVAILABLE",
      [gContLow.body, gContForgedIdx.body, gContRes.body, gContSur.body]);
    var inc = await pickEvaluation("incomplete", function (r) { return r.classification_status !== "classified"; });
    var gIncLow = await api.choose(ANON_A, inc.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var gIncRes = await api.choose(ANON_A, inc.evaluation_id, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 1 });
    check("[G] incomplete evaluation: action_context null, nothing eligible, writes rejected (422)",
      inc.state.action_context === null && eq(inc.state.choices.lower_payment_intent, []) && inc.state.strategy === null &&
      gIncLow.status === 422 && gIncRes.status === 422, { state: inc.state, l: gIncLow.body, r: gIncRes.body });
    var tamper = await pool.connect();
    var tLow, tHigh;
    try {
      await tamper.query("BEGIN");
      await tamper.query("UPDATE public.financial_strategy_evaluations SET result = jsonb_set(result, '{canonical_facts,canonical_flow}', '1000') WHERE evaluation_id = $1", [EV]);
      tLow = (await tamper.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "surplus_reserve", destination: "emergency_fund", amount: 1000 }))).rows[0].v;
      tHigh = await errorOf(tamper.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "surplus_reserve", destination: "emergency_fund", amount: 1000.01 })));
      await tamper.query("ROLLBACK");
    } finally {
      tamper.release();
    }
    check("[G] the cap is re-derived from the stored evaluation result at write time (stored flow 1000 -> 1000 OK, 1000.01 rejected; rolled back)",
      /AMOUNT_OUT_OF_RANGE/.test(tHigh || "") && tLow.appended === true, { tHigh: tHigh, tLow: tLow });
    var gType = await api.choose(ANON_A, EV, { choice_type: "commercial_offer", debt_index: 0 });
    var gTypeRpc = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: EV, type: "mi_deuda_referral", debt_index: 0 })));
    check("[G] unknown choice types (commercial_offer, mi_deuda_referral) -> INVALID_CHOICE_TYPE at service and RPC",
      gType.status === 400 && gType.body.error === "INVALID_CHOICE_TYPE" && /INVALID_CHOICE_TYPE/.test(gTypeRpc), [gType.body, gTypeRpc]);

    // ---- JS ↔ SQL parity of the choice authority ----
    var resultsSweep = sweep.sweepInputs().map(function (inp) { return classifier.classifyFinancialShadow(clone(inp)); });
    var cons = clone(baseResult);
    function mutate(fn) { var r = clone(cons); fn(r); return r; }
    var malformed = [
      mutate(function (r) { r.canonical_facts.debts[1].debt_index = 0; }),
      mutate(function (r) { r.canonical_facts.debts[1].debt_index = 1.5; }),
      mutate(function (r) { r.canonical_facts.debts[1].debt_index = -1; }),
      mutate(function (r) { r.canonical_facts.debts[1].debt_index = "1"; }),
      mutate(function (r) { r.canonical_facts.debts[1] = null; }),
      mutate(function (r) { r.canonical_facts.debts = {}; }),
      mutate(function (r) { delete r.canonical_facts; }),
      mutate(function (r) { r.strategy = "FOO"; }),
      mutate(function (r) { r.strategy = "toString"; }),
      mutate(function (r) { r.classification_status = "incomplete"; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = "unknown"; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 0; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = -5; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 0.004; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 0.005; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 1.005; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 2.675; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 123456.785; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 1e-7; }),
      mutate(function (r) { r.canonical_facts.canonical_flow = 39999.6; }),
      mutate(function (r) { r.canonical_facts.debts[0].monthly_debt_payment.value = -1; }),
      mutate(function (r) { r.canonical_facts.debts[0].monthly_debt_payment.value = 10.005; }),
      mutate(function (r) { r.canonical_facts.debts[0].monthly_debt_payment = { status: "UNKNOWN", value: 5 }; }),
      mutate(function (r) { r.canonical_facts.debts[0].monthly_debt_payment = { status: "KNOWN_ZERO", value: 0 }; }),
      mutate(function (r) { r.canonical_facts.debts[0].monthly_debt_payment = "10000"; }),
      mutate(function (r) { r.canonical_facts.debts[0].active_debt = "unknown"; }),
      mutate(function (r) { r.canonical_facts.debts.reverse(); }),
      mutate(function (r) { r.strategy = "MANTENIMIENTO_OPTIMIZACION"; }),
      mutate(function (r) { r.strategy = "REDUCCION_CARGA"; }),
      mutate(function (r) { r.strategy = "CONTENCION"; }),
      mutate(function (r) { r.strategy = "REGULARIZACION"; }),
    ];
    var contResult = classifier.classifyFinancialShadow(clone(CONT_IN));
    function mutateCont(fn) { var r = clone(contResult); fn(r); return r; }
    malformed = malformed.concat([
      contResult,
      mutateCont(function (r) { r.strategy = "CONSOLIDACION"; }),
      mutateCont(function (r) { r.strategy = "REGULARIZACION"; }),
      mutateCont(function (r) { r.strategy = "MANTENIMIENTO_OPTIMIZACION"; }),
      mutateCont(function (r) { r.strategy = "REDUCCION_CARGA"; }),
      mutateCont(function (r) { r.canonical_facts.debts[0].monthly_debt_payment = { status: "KNOWN_POSITIVE", value: 0.004 }; }),
      mutateCont(function (r) { r.canonical_facts.debts[0].monthly_debt_payment = { status: "KNOWN_POSITIVE", value: 0.005 }; }),
      mutateCont(function (r) { r.canonical_facts.debts[1].active_debt = "unknown"; }),
      mutateCont(function (r) { r.canonical_facts.debts.reverse(); }),
      mutateCont(function (r) { r.canonical_facts.debts[2].debt_index = 1; }),
    ]);
    var corpus = resultsSweep.concat(malformed);
    var sqlAuth = (await q("SELECT miplan_private.v2_choice_authority(t.r) AS a FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(r, o) ORDER BY t.o",
      [JSON.stringify(corpus)])).map(function (row) { return row.a; });
    var parityFail = [];
    var nonNull = 0;
    var lowerByStrategy = {};
    corpus.forEach(function (r, k) {
      var ac = buildActionContext(r);
      var expected = ac === null ? null : {
        strategy: r.strategy,
        monthly_surplus: Object.prototype.hasOwnProperty.call(ac, "monthly_surplus") ? ac.monthly_surplus : null,
        active_debts: Object.prototype.hasOwnProperty.call(ac, "active_debts") ? ac.active_debts : [],
        lower_payment_debts: lowerPaymentEligible(r),
      };
      if (expected && (expected.monthly_surplus || expected.active_debts.length)) nonNull += 1;
      if (expected && expected.lower_payment_debts.length) lowerByStrategy[r.strategy] = (lowerByStrategy[r.strategy] || 0) + 1;
      if (!eq(sqlAuth[k], expected)) parityFail.push({ k: k, sql: sqlAuth[k], js: expected });
    });
    check("parity: miplan_private.v2_choice_authority == buildActionContext (monthly_surplus, active_debts) + lowerPaymentEligible " +
      "(lower_payment_debts) on " + corpus.length + " results (" + resultsSweep.length + " sweep + " + malformed.length +
      " malformed / rounding / strategy edges; " + nonNull + " with something to authorize)",
      sqlAuth.length === corpus.length && parityFail.length === 0, parityFail.slice(0, 5));
    check("parity: lower-payment debts appear only under CONTENCION and REDUCCION_CARGA, and the corpus exercises both " + JSON.stringify(lowerByStrategy),
      eq(Object.keys(lowerByStrategy).sort(), ["CONTENCION", "REDUCCION_CARGA"]), lowerByStrategy);

    // ---- access model ----
    var rls = await q("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('financial_strategy_user_choice_events', 'debt_management_opt_in_events')");
    check("access: RLS enabled on both tables (no policies needed: no direct grants)", rls.length === 2 && rls.every(function (r) { return r.relrowsecurity; }));
    var fns = await q("SELECT p.proname, p.prosecdef, p.proconfig, p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'public' AND p.proname IN ('miplan_record_user_choice', 'miplan_get_user_choice_state', 'miplan_record_debt_management_opt_in')");
    check("access: the 3 RPCs are SECURITY DEFINER with explicit search_path, not executable by PUBLIC (secret-gated anon/authenticated/service_role)",
      fns.length === 3 && fns.every(function (f) {
        return f.prosecdef === true && eq(f.proconfig, ["search_path=public, miplan_private"]) && !/(^|[{,])=X\//.test(f.acl) && /anon=X/.test(f.acl);
      }), fns);
    var priv = await q("SELECT p.proname, p.proacl::text AS acl, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'miplan_private' AND p.proname IN ('v2_choice_authority', 'forbid_user_choice_mutation')");
    check("access: miplan_private helpers have a pinned search_path and no PUBLIC / anon / authenticated EXECUTE",
      priv.length === 2 && priv.every(function (f) {
        return !/(^|[{,])=X\//.test(f.acl || "") && !/anon=/.test(f.acl || "") && !/authenticated=/.test(f.acl || "") && eq(f.proconfig, ["search_path=pg_catalog"]);
      }), priv);
    var grants = await q("SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND " +
      "table_name IN ('financial_strategy_user_choice_events', 'debt_management_opt_in_events') AND grantee IN ('anon', 'authenticated', 'PUBLIC')");
    check("access: no table grants to anon / authenticated / PUBLIC", grants.length === 0, grants);
    check("legacy V2 table financial_strategy_results receives no writes", Number((await q("SELECT count(*) AS n FROM public.financial_strategy_results"))[0].n) === 0);

    // ---- rollback after apply, then clean re-apply ----
    var keep = await counts();
    await pool.query(ROLLBACK_SQL);
    var gone = (await q("SELECT to_regclass('public.financial_strategy_user_choice_events') AS a, to_regclass('public.debt_management_opt_in_events') AS b, " +
      "to_regprocedure('public.miplan_record_user_choice(text, text, uuid, uuid, text, integer, numeric, text, text)') AS f1, " +
      "to_regprocedure('public.miplan_get_user_choice_state(text, text, uuid, uuid)') AS f2, " +
      "to_regprocedure('public.miplan_record_debt_management_opt_in(text, text, uuid, uuid, text, text)') AS f3, " +
      "to_regprocedure('miplan_private.v2_choice_authority(jsonb)') AS f4, to_regprocedure('miplan_private.forbid_user_choice_mutation()') AS f5"))[0];
    var after = (await q("SELECT (SELECT count(*) FROM public.diagnoses)::int AS d, (SELECT count(*) FROM public.financial_strategy_evaluations)::int AS e, " +
      "(SELECT count(*) FROM public.diagnosis_strategy_evaluations)::int AS l, to_regprocedure('public.miplan_record_financial_strategy_evaluation(text, uuid, uuid, " +
      "text, text, text, smallint, text, text, text, text, text, jsonb)') AS f"))[0];
    check("rollback: dropping the 3 RPCs, 2 tables and 2 helpers restores the previous schema; diagnoses / evaluations / links untouched",
      Object.keys(gone).every(function (k) { return gone[k] === null; }) && after.d === keep.diagnoses && after.e === keep.evaluations &&
      after.l === keep.links && after.f !== null, { gone: gone, after: after });
    await pool.query(migrationSql);
    var reapplied = await errorOf(api.state(ANON_A, EV).then(function (r) { if (r.status !== 200) throw new Error(r.raw); return r; }));
    check("rollback: the migration re-applies cleanly afterwards (empty history, reads work)", reapplied === null, reapplied);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
