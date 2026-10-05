/**
 * server/bin/disputed-debt-targets-db-test.js — V2-DISPUTED-DEBT-TARGETS-01, isolated DB harness.
 *
 * Throwaway embedded PostgreSQL 17 (temp dir, loopback, deleted at the end) with every repo migration
 * applied, the last one being 20261004120000_v2_disputed_debt_action_targets.sql (WRITTEN, NOT APPLIED
 * anywhere else). The real app (HTTP on loopback) runs the real diagnosis / journey / user choice services
 * and repositories through an rpc() adapter over node-postgres. A second diagnosis service stores shadow-03
 * results with an injected DEBT_IN_DISPUTE reason (strategies the classifier never reaches with a disputed
 * active debt). Covers: lower_payment_intent / surplus_to_debt / creditor_contact_step rejected on disputed
 * debts through the API and the RPC, mixed debts, no FinancialAction, historical rows, vigency across a new
 * evaluation, V1 / regression, and JS ↔ SQL parity of every eligibility list.
 * Never reads .env / SUPABASE_*; no remote host is ever contacted. Prints isolation evidence first.
 *
 * node -r ./server/testing/networkTrap.js server/bin/disputed-debt-targets-db-test.js
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

var assertLiveWriteAllowed = require("../testing/liveWriteGuard").assertLiveWriteAllowed;
var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;
var createDiagnosisRepository = require("../modules/diagnosis/repository").createDiagnosisRepository;
var createJourneyRepository = require("../modules/journey/repository").createJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;
var createUserChoiceRepository = require("../modules/userChoice/repository").createUserChoiceRepository;
var userChoiceModule = require("../modules/userChoice/service");
var actionContextModule = require("../modules/diagnosis/actionContext");
var buildActionContext = actionContextModule.buildActionContext;
var classifier = require("../../engine/classifier/financial-classifier");
var sweep = require("../testing/actionContextSweep");

var MIGRATION = "20261004120000_v2_disputed_debt_action_targets.sql";
var PREVIOUS = "20261001180000_v2_cta_interaction_choices.sql";
var SECRET = crypto.randomBytes(24).toString("hex");
var TENANT = "miplan-default";
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var INJECT = "INJECT_DISPUTE";
// Synthetic survey-V2 handoff context, frozen from the JANUS builder (same as debt-contract-v2-db-test).
var V2_CONTEXT = {"contract_version":1,"context":{"funnel":"credizona_rejected","external_ref_type":"lrw","external_ref":"LRW-000-000-004",
  "issued_at":"2026-09-30T12:00:00.000Z"},"provenance":{"source_system":"credizona","synced_at":"2026-09-30T12:00:00.000Z"},
  "person":{"nombre":"QA","apellido":"Dispute","email":"qa-dispute@example.test"},"financial_prefill":{"ingreso":50000,"laboral":"relacion_dependencia",
  "laboral_source_raw":"EPR"},"survey":{"selection_rule":"lifetime_ci","completed_at":"2026-09-30T11:00:00.000Z","source_survey_version":2,
  "respuestas":{"p1":"B","p2":"B","p3":"B","p4":"B","p5":"B","p6":"A","p8":"B","p9":"B","p10":"B"},"loan_purpose":"purchase_or_home_improvement",
  "provenance":{"source_system":"credizona","source_survey_version":2}}};

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

// ---- isolation evidence (before any database exists) ----
function isolationEvidence() {
  return new Promise(function (resolve) {
    var patched = String(net.Socket.prototype.connect).indexOf("NETWORK_TRAP") !== -1;
    var s = new net.Socket();
    var done = false;
    function finish(trapped) {
      if (done) return;
      done = true;
      try { s.destroy(); } catch (_e) { /* ignore */ }
      var guardBlocked = null;
      try {
        assertLiveWriteAllowed({ env: process.env, harness: "disputed-debt-targets-db-test" });
        guardBlocked = false;
      } catch (e) {
        guardBlocked = e.code === "LIVE_WRITE_BLOCKED" ? e.reason : false;
      }
      var envLoaded = Object.keys(require.cache).some(function (p) {
        return /[\\/]dotenv[\\/]/.test(p) || path.resolve(p) === path.join(ROOT, "server", "index.js");
      }) || !!process.env.SUPABASE_SERVICE_ROLE_KEY || !!process.env.MIPLAN_BACKEND_SECRET;
      resolve({ trap: patched && trapped, guard: guardBlocked, envLoaded: envLoaded });
    }
    s.on("error", function (e) { finish(e && e.code === "NETWORK_TRAP"); });
    s.connect(443, "203.0.113.10");
    setTimeout(function () { finish(false); }, 2000);
  });
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

var CONFIRMED = { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } };
function input(o, marker) {
  var x = Object.assign({ ingreso: 50000, gastos: { vivienda: 40000 }, custom_expenses: [], deudas: [], no_debts_declared: false,
    entry_context: clone(CONFIRMED) }, clone(o));
  if (marker !== undefined) x.debt_contract_version = marker;
  return x;
}
function debt(sit, extra) {
  return Object.assign({ tipo: "prestamo", acreedor: "Banco QA", monto: "100000", situacion_ui: sit }, extra || {});
}
function normal(pago, acreedor) { return debt("pagando_normal", { pago: String(pago), acreedor: acreedor || "Banco QA" }); }
function dispute(current, acreedor) { return debt("reclamo_disputa", { pago_mensual_actual: current, acreedor: acreedor || "Financiera D" }); }
function mora(current, acreedor) { return debt("mora", { pago_mensual_actual: current, acreedor: acreedor || "Banco M" }); }

/** shadow-03 plus a DEBT_IN_DISPUTE reason on every debt whose acreedor starts with INJECT_DISPUTE. */
function classifyInjected(ei) {
  var r = classifier.classifyFinancialShadowV3(ei);
  (Array.isArray(ei.deudas) ? ei.deudas : []).forEach(function (d, i) {
    if (d && typeof d.acreedor === "string" && d.acreedor.indexOf(INJECT) === 0) {
      r.verification_reasons.push({ code: "DEBT_IN_DISPUTE", fact: "active_mora", subject: "debt", debt_index: i });
    }
  });
  return r;
}

function functionBody(sql, name) {
  var start = sql.indexOf("CREATE OR REPLACE FUNCTION " + name + "(");
  var open = sql.indexOf("$function$", start);
  var close = sql.indexOf("$function$", open + 10);
  return sql.slice(open + 10, close);
}

async function main() {
  var ev = await isolationEvidence();
  console.log("NETWORK_TRAP_ACTIVE = " + (ev.trap ? "YES" : "NO"));
  console.log("LIVE_WRITE_GUARD_ACTIVE = " + (ev.guard ? "YES (" + ev.guard + ")" : "NO"));
  console.log("SERVER_ENV_LOADED = " + (ev.envLoaded ? "YES" : "NO"));
  if (!ev.trap || !ev.guard || ev.envLoaded) {
    console.log("NOT RUN: isolation could not be demonstrated (guardrail)");
    process.exitCode = 2;
    return;
  }
  var EmbeddedPostgres = (await import(pathToFileURL(path.join(DEPS, "node_modules", "embedded-postgres", "dist", "index.js")).href)).default;
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-dispute-pg-"));
  var port = 54000 + Math.floor(Math.random() * 900);
  var password = crypto.randomBytes(12).toString("hex");
  var server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: password, port: port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: function () {}, onError: function () {} });
  await server.initialise();
  await server.start();
  await server.createDatabase("miplan_isolated");
  var pool = new pg.Pool({ host: "127.0.0.1", port: port, user: "postgres", password: password, database: "miplan_isolated", max: 20 });
  try {
    await run(pool, dataDir);
  } finally {
    await pool.end();
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("DISPUTED_DEBT_TARGETS_DB_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

async function run(pool, dataDir) {
  async function q(sql, args) {
    return (await pool.query(sql, args || [])).rows;
  }
  async function errorOf(promise) {
    try {
      await promise;
      return null;
    } catch (e) {
      return String(e.message);
    }
  }
  var info = (await q("SELECT version() AS v, inet_server_addr()::text AS addr, current_setting('data_directory') AS dir"))[0];
  var localOnly = info.addr === "127.0.0.1/32" || info.addr === "127.0.0.1" || info.addr === "::1/128";
  var dirOk = path.resolve(info.dir).toLowerCase() === path.resolve(dataDir).toLowerCase() || path.resolve(info.dir).toLowerCase().indexOf(os.tmpdir().toLowerCase()) === 0;
  console.log("LOCAL_PG_ONLY = " + (localOnly && dirOk ? "YES" : "NO") + " (" + info.v.split(",")[0] + " @ " + info.addr + ", throwaway data dir under " + os.tmpdir() + ")");
  check("[ISO] PostgreSQL is the throwaway local cluster (loopback address, temp data directory)", localOnly && dirOk, info);
  if (!localOnly || !dirOk) return;

  // ---- migrations ----
  await pool.query(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" +
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
  var migDir = path.join(ROOT, "server", "migrations");
  var files = fs.readdirSync(migDir).filter(function (f) { return /\.sql$/.test(f); }).sort();
  var sqlOf = function (f) { return fs.readFileSync(path.join(migDir, f), "utf8"); };
  check("[MIG] " + MIGRATION + " is the last migration, right after " + PREVIOUS,
    files[files.length - 1] === MIGRATION && files[files.length - 2] === PREVIOUS, files.slice(-3));
  for (var i = 0; i < files.length - 1; i++) await pool.query(sqlOf(files[i]));
  var migrationSql = sqlOf(MIGRATION);
  var topLevel = migrationSql.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--[^\n]*/g, "");
  check("[MIG] functions only: no top-level CREATE TABLE / ALTER / DROP / UPDATE / INSERT / DELETE",
    !/\b(CREATE\s+TABLE|ALTER|DROP|UPDATE|INSERT|DELETE)\b/i.test(topLevel), topLevel.match(/\b(CREATE\s+TABLE|ALTER|DROP|UPDATE|INSERT|DELETE)\b/gi));
  var oldBody = functionBody(sqlOf(PREVIOUS), "public.miplan_record_user_choice").split("\n");
  var newBody = functionBody(migrationSql, "public.miplan_record_user_choice").split("\n");
  var bodyDiff = [];
  for (var li = 0; li < Math.max(oldBody.length, newBody.length); li++) {
    if (oldBody[li] !== newBody[li]) bodyDiff.push({ old: oldBody[li], new: newBody[li] });
  }
  check("[MIG] miplan_record_user_choice body == " + PREVIOUS + " except the 3 target-list lines (surplus_debts, its index test, contact_debts)",
    oldBody.length === newBody.length && bodyDiff.length === 3 &&
    /surplus_debts/.test(bodyDiff[0].new) && /i::numeric = p_debt_index/.test(bodyDiff[1].new) && /contact_debts/.test(bodyDiff[2].new), bodyDiff);
  var admin = await pool.connect();
  await admin.query("BEGIN");
  await admin.query(migrationSql);
  await admin.query("ROLLBACK");
  admin.release();
  var afterRollback = (await q("SELECT to_regprocedure('miplan_private.v2_disputed_debts(jsonb)') AS f, " +
    "miplan_private.v2_choice_authority('{\"classification_status\":\"classified\",\"strategy\":\"CONTENCION\",\"canonical_facts\":{\"debts\":[]}}'::jsonb) AS a"))[0];
  check("[MIG] applies inside a transaction; ROLLBACK leaves the previous authority (no v2_disputed_debts, no surplus_debts)",
    afterRollback.f === null && afterRollback.a && !Object.prototype.hasOwnProperty.call(afterRollback.a, "surplus_debts"), afterRollback);
  await pool.query(migrationSql);
  await pool.query(migrationSql);
  var sigs = (await q("SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
    "WHERE p.proname IN ('miplan_record_user_choice', 'v2_choice_authority', 'v2_interaction_authority', 'v2_disputed_debts') ORDER BY 1, 2"));
  check("[MIG] re-apply is a no-op; one overload each, same signatures (record_user_choice keeps its 11 args)",
    sigs.length === 4 && sigs.filter(function (s) { return s.proname === "miplan_record_user_choice"; })[0].args.split(",").length === 11, sigs);
  var priv = (await q("SELECT has_function_privilege('anon', 'miplan_private.v2_disputed_debts(jsonb)', 'EXECUTE') AS a, " +
    "has_function_privilege('authenticated', 'miplan_private.v2_disputed_debts(jsonb)', 'EXECUTE') AS b, " +
    "has_function_privilege('anon', 'miplan_private.v2_choice_authority(jsonb)', 'EXECUTE') AS c, " +
    "has_function_privilege('anon', 'miplan_private.v2_interaction_authority(jsonb, jsonb)', 'EXECUTE') AS d"))[0];
  check("[MIG] private authorities stay non-executable by anon / authenticated", !priv.a && !priv.b && !priv.c && !priv.d, priv);
  await pool.query("INSERT INTO miplan_private.backend_secrets (name, secret) VALUES ('b2_persist', $1)", [SECRET]);

  // ---- real services over the rpc() adapter; second diagnosis service with injected dispute reasons ----
  var client = makeRpcClient(pool);
  var journeyService = createJourneyService({ repository: createJourneyRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }), tenantId: TENANT });
  var diagRepo = createDiagnosisRepository({ client: client, backendSecret: SECRET, tenantId: TENANT });
  var ucService = userChoiceModule.createUserChoiceService({ repository: createUserChoiceRepository({ client: client, backendSecret: SECRET }), interactionEnabled: true });
  var cfg = loadConfig({ NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1", SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "" });
  async function listen(diagnosisService) {
    var srv = http.createServer(createApp(cfg, { journeyService: journeyService, diagnosisService: diagnosisService, userChoiceService: ucService }));
    await new Promise(function (r) { srv.listen(0, "127.0.0.1", r); });
    return srv;
  }
  var real = await listen(createDiagnosisService({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService }));
  var injected = await listen(createDiagnosisService({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService, classifyV3Fn: classifyInjected }));
  try {
    await scenarios(real.address().port, injected.address().port);
  } finally {
    await new Promise(function (r) { real.close(r); });
    await new Promise(function (r) { injected.close(r); });
  }

  async function scenarios(PORT, PORT_INJ) {
    var journeySeq = 0;
    async function journey() {
      journeySeq += 1;
      return (await journeyService.createFromHandoffRedeem(ANON_A, "dispute-" + journeySeq, clone(V2_CONTEXT))).journey_id;
    }
    var state = function (evaluationId) { return request(PORT, "GET", "/v1/evaluations/" + evaluationId + "/user-choices", undefined, ANON_A); };
    var choose = function (evaluationId, body) { return request(PORT, "POST", "/v1/evaluations/" + evaluationId + "/user-choices", body, ANON_A); };
    async function evaluationFor(body, opts) {
      var o = opts || {};
      var jid = o.journeyId || await journey();
      var d = await request(o.injected ? PORT_INJ : PORT, "POST", "/v1/diagnoses", Object.assign(clone(body), { journey_id: jid }), ANON_A);
      if (d.status !== 200 || !d.body.v2_financial_strategy) throw new Error("fixture diagnosis failed " + d.raw.slice(0, 300));
      var s = await request(PORT, "GET", "/v1/diagnoses/" + d.body.diagnosis_id + "/user-choices", undefined, ANON_A);
      if (s.status !== 200) throw new Error("fixture state failed " + s.raw.slice(0, 300));
      var row = (await q("SELECT classifier_version AS cv, journey_id FROM public.financial_strategy_evaluations WHERE evaluation_id = $1", [s.body.evaluation_id]))[0];
      return { journey_id: jid, diagnosis_id: d.body.diagnosis_id, evaluation_id: s.body.evaluation_id, state: s.body, cv: row.cv };
    }
    async function rpcChoice(evaluationId, type, debtIndex, o) {
      var x = o || {};
      return errorOf(pool.query("SELECT public.miplan_record_user_choice(p_secret => $1, p_anonymous_id => $2, p_evaluation_id => $3::uuid, " +
        "p_diagnosis_id => NULL, p_choice_type => $4, p_debt_index => $5::integer, p_amount => $6::numeric, p_reserve_destination => NULL, " +
        "p_lower_payment_state => $7, p_expense_ref => NULL, p_choice_state => $8) AS v",
      [SECRET, ANON_A, evaluationId, type, debtIndex, x.amount == null ? null : x.amount, x.lower || null, x.state || null]));
    }
    async function rowCount(evaluationId) {
      return Number((await q("SELECT count(*) AS n FROM public.financial_strategy_user_choice_events WHERE evaluation_id = $1", [evaluationId]))[0].n);
    }
    function lowerIdx(s) { return s.choices.lower_payment_intent.map(function (c) { return c.debt_index; }); }
    function surplusIdx(s) { return s.choices.surplus_to_debt_targets.map(function (c) { return c.debt_index; }); }
    function contactIdx(s) { return s.choices.creditor_contact_step.map(function (c) { return c.debt_index; }); }
    function actions(s) { return s.financial_actions.map(function (a) { return a.action_type + ":" + a.params.debt_index; }); }
    function rejected(r) { return r.status === 422 && r.body.error === "DEBT_NOT_ELIGIBLE"; }
    var NOT_ELIGIBLE = /DEBT_NOT_ELIGIBLE/;

    // ---- LOWER PAYMENT ----
    var lp1 = await evaluationFor(input({ deudas: [normal(15000)] }, "v2"));
    var lp1w = await choose(lp1.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var lp1s = (await state(lp1.evaluation_id)).body;
    check("[LP-1] CONTENCION + normal debt: eligible [0]; marked -> 200 and LOWER_PAYMENT_REQUEST",
      lp1.cv === classifier.CLASSIFIER_VERSION_V3 && lp1.state.strategy === "CONTENCION" && eq(lowerIdx(lp1.state), [0]) &&
      lp1w.status === 200 && eq(actions(lp1s), ["LOWER_PAYMENT_REQUEST:0"]), { s: lp1.state, w: lp1w.body });

    var lp2 = await evaluationFor(input({ deudas: [dispute(15000)] }, "v2"));
    var lp2m = await choose(lp2.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var lp2u = await choose(lp2.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0, state: "unmarked" });
    var lp2r = await rpcChoice(lp2.evaluation_id, "lower_payment_intent", 0, { lower: "marked" });
    var lp2s = (await state(lp2.evaluation_id)).body;
    check("[LP-2/4/5] CONTENCION + disputed debt (current 15000): not listed; API marked / unmarked -> 422 DEBT_NOT_ELIGIBLE; direct RPC -> " +
      "DEBT_NOT_ELIGIBLE; no row; no LOWER_PAYMENT_REQUEST; still an active debt",
      lp2.state.strategy === "CONTENCION" && eq(lowerIdx(lp2.state), []) && rejected(lp2m) && rejected(lp2u) && NOT_ELIGIBLE.test(lp2r) &&
      await rowCount(lp2.evaluation_id) === 0 && eq(lp2s.financial_actions, []) &&
      eq(lp2s.action_context.active_debts, [{ debt_index: 0, monthly_debt_payment: 15000 }]), { s: lp2.state, m: lp2m.body, r: lp2r });

    var lp3 = await evaluationFor(input({ deudas: [normal(8000), dispute(7000)] }, "v2"));
    var lp3d = await choose(lp3.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 1 });
    var lp3n = await choose(lp3.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var lp3s = (await state(lp3.evaluation_id)).body;
    check("[LP-3] CONTENCION + normal (0) + disputed (1): only [0] listed; 1 -> 422; 0 -> 200; actions only debt 0",
      lp3.state.strategy === "CONTENCION" && eq(lowerIdx(lp3.state), [0]) && rejected(lp3d) && lp3n.status === 200 &&
      eq(actions(lp3s), ["LOWER_PAYMENT_REQUEST:0"]), { s: lp3.state.strategy, d: lp3d.body });

    // ---- SURPLUS TO DEBT ----
    var CONSOL = function (second) { return input({ ingreso: 100000, gastos: { vivienda: 30000 }, deudas: [normal(10000), second] }, "v2"); };
    var sd6 = await evaluationFor(CONSOL(normal(5000, "Banco B")));
    var sd6w = await choose(sd6.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 1, amount: 1000 });
    var sd6s = (await state(sd6.evaluation_id)).body;
    check("[SD-6] CONSOLIDACION + normal debts: targets [0, 1]; surplus_to_debt 1 -> 200 and EXTRA_DEBT_PAYMENT",
      sd6.state.strategy === "CONSOLIDACION" && eq(surplusIdx(sd6.state), [0, 1]) && sd6w.status === 200 && eq(actions(sd6s), ["EXTRA_DEBT_PAYMENT:1"]),
      { s: sd6.state.strategy, w: sd6w.body });

    var sd8 = await evaluationFor(CONSOL(normal(5000, INJECT + " B")), { injected: true });
    var sd8d = await choose(sd8.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 1, amount: 1000 });
    var sd8r = await rpcChoice(sd8.evaluation_id, "surplus_to_debt", 1, { amount: 1000 });
    var sd8rows = await rowCount(sd8.evaluation_id);
    var sd8n = await choose(sd8.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 0, amount: 1000 });
    var sd8s = (await state(sd8.evaluation_id)).body;
    check("[SD-8/9/10] CONSOLIDACION normal (0) + disputed (1, injected stored reason): targets [0]; 1 via API / RPC -> DEBT_NOT_ELIGIBLE, no row; " +
      "0 -> 200 and EXTRA_DEBT_PAYMENT only for debt 0",
      sd8.state.strategy === "CONSOLIDACION" && eq(surplusIdx(sd8.state), [0]) && rejected(sd8d) && NOT_ELIGIBLE.test(sd8r) && sd8rows === 0 &&
      sd8n.status === 200 && eq(actions(sd8s), ["EXTRA_DEBT_PAYMENT:0"]), { s: sd8.state, d: sd8d.body, r: sd8r });

    var sd7 = await evaluationFor(input({ ingreso: 100000, gastos: { vivienda: 30000 }, deudas: [normal(10000, INJECT + " A"), normal(5000, INJECT + " B")] }, "v2"),
      { injected: true });
    var sd7a = await choose(sd7.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 0, amount: 1000 });
    var sd7b = await choose(sd7.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 1, amount: 1000 });
    var sd7res = await choose(sd7.evaluation_id, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 1000 });
    var sd7s = (await state(sd7.evaluation_id)).body;
    check("[SD-7] CONSOLIDACION with every debt disputed (injected): no target; both indexes -> 422; surplus_reserve (not debt-targeted) still 200 / MONTHLY_RESERVE",
      sd7.state.strategy === "CONSOLIDACION" && eq(surplusIdx(sd7.state), []) && rejected(sd7a) && rejected(sd7b) && sd7res.status === 200 &&
      eq(sd7s.financial_actions.map(function (a) { return a.action_type; }), ["MONTHLY_RESERVE"]), { s: sd7.state.strategy, r: sd7res.body });

    // ---- CREDITOR CONTACT ----
    var REG = function (deudas) { return input({ ingreso: 60000, gastos: { vivienda: 30000 }, deudas: deudas }, "v2"); };
    var cc11 = await evaluationFor(REG([mora(0)]));
    var cc11p = await choose(cc11.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" });
    var cc11c = await choose(cc11.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "contacted" });
    check("[CC-11] REGULARIZACION + mora: target [0]; planned -> 200; contacted -> 200",
      cc11.state.strategy === "REGULARIZACION" && eq(contactIdx(cc11.state), [0]) && cc11p.status === 200 && cc11c.status === 200);

    var cc12 = await evaluationFor(REG([mora(0), dispute(0)]));
    var cc12p = await choose(cc12.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 1, state: "planned" });
    var cc12c = await choose(cc12.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 1, state: "contacted" });
    var cc12n = await choose(cc12.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 1, state: "none" });
    var cc12r = await rpcChoice(cc12.evaluation_id, "creditor_contact_step", 1, { state: "planned" });
    var cc12rows = await rowCount(cc12.evaluation_id);
    var cc12ok = await choose(cc12.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" });
    check("[CC-12/13/14] REGULARIZACION mora (0) + disputed (1): only [0] listed; disputed planned / contacted / none via API and RPC -> DEBT_NOT_ELIGIBLE, " +
      "no row; mora debt planned -> 200",
      cc12.state.strategy === "REGULARIZACION" && eq(contactIdx(cc12.state), [0]) && rejected(cc12p) && rejected(cc12c) && rejected(cc12n) &&
      NOT_ELIGIBLE.test(cc12r) && cc12rows === 0 && cc12ok.status === 200, { s: cc12.state, p: cc12p.body });

    var cc14 = await evaluationFor(REG([mora(0), mora(0, INJECT + " M")]), { injected: true });
    var cc14p = await choose(cc14.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 1, state: "planned" });
    var cc14c = await choose(cc14.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 1, state: "contacted" });
    var cc14ok = await choose(cc14.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "contacted" });
    check("[CC-14] two mora debts, the second disputed (injected, active_mora true): mora_debts [0, 1], contact targets [0]; 1 -> 422; 0 -> 200",
      cc14.state.strategy === "REGULARIZACION" && eq(cc14.state.action_context.mora_debts, [{ debt_index: 0 }, { debt_index: 1 }]) &&
      eq(contactIdx(cc14.state), [0]) && rejected(cc14p) && rejected(cc14c) && cc14ok.status === 200, { s: cc14.state });

    // ---- HISTORY / VIGENCY ----
    var JH = await journey();
    var h1 = await evaluationFor(input({ deudas: [normal(15000, "Banco H")] }, "v2"), { journeyId: JH });
    await choose(h1.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var h1Rows = await rowCount(h1.evaluation_id);
    var h2 = await evaluationFor(input({ deudas: [dispute(15000, "Banco H")] }, "v2"), { journeyId: JH });
    var h2w = await choose(h2.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var h2s = (await state(h2.evaluation_id)).body;
    var h1s = (await state(h1.evaluation_id)).body;
    check("[HIST-16] same debt re-declared reclamo_disputa -> new evaluation: no carried choice, nothing eligible, no action, manual mark -> 422; " +
      "the previous evaluation keeps its own history untouched",
      h2.evaluation_id !== h1.evaluation_id && eq(lowerIdx(h2.state), []) && eq(h2s.financial_actions, []) && rejected(h2w) &&
      await rowCount(h2.evaluation_id) === 0 && await rowCount(h1.evaluation_id) === h1Rows && eq(actions(h1s), ["LOWER_PAYMENT_REQUEST:0"]),
      { h2: h2.state, h2w: h2w.body });

    // rows written before this migration (inserted directly: the RPC no longer accepts them)
    async function legacyRow(e, slot, type, debtIndex, extra) {
      var x = extra || {};
      var head = (await q("SELECT event_id, seq FROM public.financial_strategy_user_choice_events WHERE evaluation_id = $1 AND slot_key = $2 " +
        "ORDER BY seq DESC LIMIT 1", [e.evaluation_id, slot]))[0];
      await q("INSERT INTO public.financial_strategy_user_choice_events (evaluation_id, journey_id, anonymous_id, contract_version, slot_key, choice_type, " +
        "lower_payment_state, debt_index, amount, choice_state, seq, supersedes_event_id, supersedes_seq) " +
        "VALUES ($1, $2, $3, 'user_choice_v1', $4, $5, $6, $7, $8, $9, $10, $11, $12)",
      [e.evaluation_id, e.journey_id, ANON_A, slot, type, x.lower || null, debtIndex, x.amount == null ? null : x.amount, x.state || null,
        head ? head.seq + 1 : 1, head ? head.event_id : null, head ? head.seq : null]);
    }
    await legacyRow(lp2, "lower_payment_intent:0", "lower_payment_intent", 0, { lower: "marked" });
    await legacyRow(sd7, "surplus_allocation", "surplus_to_debt", 1, { amount: 2000 });
    await legacyRow(cc12, "creditor_contact:1", "creditor_contact_step", 1, { state: "contacted" });
    var hl = (await state(lp2.evaluation_id)).body;
    var hs = (await state(sd7.evaluation_id)).body;
    var hc = (await state(cc12.evaluation_id)).body;
    var hlUnmark = await choose(lp2.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0, state: "unmarked" });
    check("[HIST] pre-existing heads on disputed debts (lower marked, surplus_to_debt, contact contacted) are not presented and derive nothing; " +
      "the RPC still rejects the disputed slot",
      eq(lowerIdx(hl), []) && eq(hl.financial_actions, []) && hs.choices.surplus_allocation === null && eq(hs.financial_actions, []) &&
      eq(contactIdx(hc), [0]) && hc.choices.creditor_contact_step[0].state === "planned" && rejected(hlUnmark),
      { hl: hl.choices, hs: hs.choices, hc: hc.choices });

    // ---- REGRESSION ----
    var r17 = await evaluationFor(input({ deudas: [mora(15000)] }, "v2"));
    var r17w = await choose(r17.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var r18 = await evaluationFor(input({ deudas: [debt("atrasado_pagando", { pago_mensual_actual: 15000 })] }, "v2"));
    var r18w = await choose(r18.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var r18reg = await evaluationFor(REG([debt("atrasado_pagando", { pago_mensual_actual: 10000 })]));
    var r18c = await choose(r18reg.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" });
    check("[REG-17/18] mora / atrasado_pagando with a known current payment under CONTENCION: lower payment 200; atrasado under REGULARIZACION: contact 200",
      r17.state.strategy === "CONTENCION" && r17w.status === 200 && r18.state.strategy === "CONTENCION" && r18w.status === 200 &&
      r18reg.state.strategy === "REGULARIZACION" && r18c.status === 200);
    var v1 = await evaluationFor(input({ deudas: [debt("pagando_normal", { pago: "15000", estado: "al_dia", pago_fuente: "declarado", acreedor: "Banco V1" })] }));
    var v1w = await choose(v1.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var v1s = (await state(v1.evaluation_id)).body;
    check("[REG-20] V1 snapshot (no marker): shadow-02 CONTENCION, lower payment 200 and LOWER_PAYMENT_REQUEST (unchanged)",
      v1.cv === classifier.CLASSIFIER_VERSION && v1.state.strategy === "CONTENCION" && v1w.status === 200 && eq(actions(v1s), ["LOWER_PAYMENT_REQUEST:0"]));

    // ---- JS ↔ SQL PARITY ----
    var corpus = [];
    var seed = 20261004;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var SITS = ["pagando_normal", "atrasado_pagando", "deje_pagar", "mora", "reclamo_disputa", "no_seguro"];
    var PAYS = [0, null, 1500, 9000, 30000, undefined];
    for (var f = 0; f < 600; f++) {
      var ds = [];
      var n = 1 + Math.floor(rnd() * 3);
      for (var k = 0; k < n; k++) {
        var sit = SITS[Math.floor(rnd() * SITS.length)];
        var dd = { tipo: "prestamo", monto: String(10000 + Math.floor(rnd() * 300000)), situacion_ui: sit, pago: String(Math.floor(rnd() * 20000)) };
        var pay = PAYS[Math.floor(rnd() * PAYS.length)];
        if (pay !== undefined) dd.pago_mensual_actual = pay;
        ds.push(dd);
      }
      var r3 = classifier.classifyFinancialShadowV3(input({ ingreso: 20000 + Math.floor(rnd() * 100000), gastos: { vivienda: Math.floor(rnd() * 60000) }, deudas: ds }, "v2"));
      corpus.push(r3);
      var inj = clone(r3);
      inj.canonical_facts.debts.forEach(function (d) {
        if (rnd() < 0.5) inj.verification_reasons.push({ code: "DEBT_IN_DISPUTE", fact: "active_mora", subject: "debt", debt_index: d.debt_index });
      });
      if (rnd() < 0.3) inj.verification_reasons.push([{ code: "DEBT_IN_DISPUTE", subject: "person" }, { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: -1 },
        { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: 0.5 }, { code: "DEBT_IN_DISPUTE", subject: "debt", debt_index: "0" },
        { code: "OTHER", subject: "debt", debt_index: 0 }, null][Math.floor(rnd() * 6)]);
      corpus.push(inj);
    }
    sweep.sweepInputs().forEach(function (x) { corpus.push(classifier.classifyFinancialShadow(x)); });
    var sqlRows = await q("SELECT miplan_private.v2_choice_authority(t.r) AS c, miplan_private.v2_interaction_authority(t.r, NULL) AS i, " +
      "miplan_private.v2_disputed_debts(t.r) AS d FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(r, o) ORDER BY t.o", [JSON.stringify(corpus)]);
    var fails = [];
    var byStrategy = {};
    var disputedSeen = { lower: 0, surplus: 0, contact: 0 };
    corpus.forEach(function (r, idx) {
      var ac = buildActionContext(r);
      var row = sqlRows[idx];
      var jsChoice = ac === null ? null : {
        strategy: r.strategy,
        monthly_surplus: Object.prototype.hasOwnProperty.call(ac, "monthly_surplus") ? ac.monthly_surplus : null,
        active_debts: Object.prototype.hasOwnProperty.call(ac, "active_debts") ? ac.active_debts : [],
        lower_payment_debts: userChoiceModule.lowerPaymentEligible(r),
        surplus_debts: userChoiceModule.surplusToDebtEligible(r),
      };
      var sqlChoice = row.c;
      var jsContact = ac === null ? null : userChoiceModule.creditorContactEligible(r);
      var sqlContact = row.i === null ? null : row.i.contact_debts;
      var disputed = actionContextModule.disputedDebtIndices(r);
      if (!eq(sqlChoice, jsChoice) || !eq(sqlContact, jsContact) || !eq(row.d, disputed)) fails.push({ k: idx, sql: row, js: { c: jsChoice, contact: jsContact, d: disputed } });
      if (ac) {
        byStrategy[r.strategy] = (byStrategy[r.strategy] || 0) + 1;
        (ac.active_debts || []).forEach(function (d) {
          if (disputed.indexOf(d.debt_index) === -1) return;
          if (userChoiceModule.LOWER_PAYMENT_STRATEGIES.indexOf(r.strategy) !== -1) disputedSeen.lower += 1;
          if (ac.monthly_surplus) disputedSeen.surplus += 1;
        });
        (ac.mora_debts || []).forEach(function (d) { if (disputed.indexOf(d.debt_index) !== -1) disputedSeen.contact += 1; });
      }
    });
    check("[PARITY-15] v2_choice_authority (monthly_surplus, active_debts, lower_payment_debts, surplus_debts), v2_interaction_authority contact_debts and " +
      "v2_disputed_debts == JS on " + corpus.length + " results (shadow-03, shadow-03 with injected / malformed reasons, shadow-02 sweep) " + JSON.stringify(byStrategy) +
      "; disputed candidates exercised " + JSON.stringify(disputedSeen),
      fails.length === 0 && Object.keys(byStrategy).length === 5 && disputedSeen.lower > 0 && disputedSeen.surplus > 0 && disputedSeen.contact > 0, fails.slice(0, 2));
  }
}

main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
