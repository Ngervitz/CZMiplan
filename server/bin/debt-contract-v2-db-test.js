/**
 * server/bin/debt-contract-v2-db-test.js â€” DEBT-PAYMENT-CONTRACT-V2, isolated DB harness.
 *
 * Throwaway embedded PostgreSQL 17 (temp dir, loopback, deleted at the end) with every repo migration
 * applied (including 20261004120000_v2_disputed_debt_action_targets.sql). The real app (HTTP on loopback) runs the real diagnosis /
 * journey / user choice services and repositories through an rpc() adapter over node-postgres.
 * Covers: USER_CHOICE vigency across the debt contract switch (v1/shadow-02 -> v2/shadow-03, same journey),
 * dedup non-collision in SQL, the SQL choice / interaction authorities on shadow-03 results (JS parity),
 * historical snapshots, input_snapshot / debt_captures storage.
 * Never reads .env / SUPABASE_*; no remote host is ever contacted. Prints isolation evidence first.
 *
 * node -r ./server/testing/networkTrap.js server/bin/debt-contract-v2-db-test.js
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
var BASE_DIR = process.env.MIPLAN_DEBT_CONTRACT_BASELINE || path.join(os.tmpdir(), "miplan-debt-contract-pre");
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
var buildActionContext = require("../modules/diagnosis/actionContext").buildActionContext;
var classifier = require("../../engine/classifier/financial-classifier");
var sweep = require("../testing/actionContextSweep");

var SECRET = crypto.randomBytes(24).toString("hex");
var TENANT = "miplan-default";
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// Synthetic survey-V2 handoff context, frozen from the JANUS builder (same inputs as v2-wiring-e2e RAW_CONTEXTS.V2).
// Literal on purpose: loading the JANUS module would run its dotenv.config().
var V2_CONTEXT = {"contract_version":1,"context":{"funnel":"credizona_rejected","external_ref_type":"lrw","external_ref":"LRW-000-000-003",
  "issued_at":"2026-09-30T12:00:00.000Z"},"provenance":{"source_system":"credizona","synced_at":"2026-09-30T12:00:00.000Z"},
  "person":{"nombre":"QA","apellido":"Wiring","email":"qa-wiring@example.test"},"financial_prefill":{"ingreso":50000,"laboral":"relacion_dependencia",
  "laboral_source_raw":"EPR"},"survey":{"selection_rule":"lifetime_ci","completed_at":"2026-09-30T11:00:00.000Z","source_survey_version":2,
  "respuestas":{"p1":"B","p2":"B","p3":"B","p4":"B","p5":"B","p6":"A","p8":"B","p9":"B","p10":"B"},"loan_purpose":"purchase_or_home_improvement",
  "provenance":{"source_system":"credizona","source_survey_version":2}}};
var SHADOW_02 = "miplan-financial-classifier-shadow-02";
var SHADOW_03 = "miplan-financial-classifier-shadow-03";
var ID_V1 = "financial_input_identity_v1";
var ID_V2 = "financial_input_identity_v2";

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
        assertLiveWriteAllowed({ env: process.env, harness: "debt-contract-v2-db-test" });
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
  var x = Object.assign({ ingreso: 60000, gastos: { vivienda: 30000 }, custom_expenses: [], deudas: [], no_debts_declared: false,
    entry_context: clone(CONFIRMED) }, clone(o));
  if (marker !== undefined) x.debt_contract_version = marker;
  return x;
}
function debt(sit, extra) {
  return Object.assign({ tipo: "prestamo", acreedor: "Banco QA", monto: "100000", situacion_ui: sit }, extra || {});
}
var MR = { pago: 0, estado: "mora", pago_fuente: "mora_sin_pago", debt_confidence: "high" };

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
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-debt-contract-pg-"));
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
  console.log("DEBT_CONTRACT_V2_DB_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

async function run(pool, dataDir) {
  async function q(sql, args) {
    return (await pool.query(sql, args || [])).rows;
  }
  var info = (await q("SELECT version() AS v, inet_server_addr()::text AS addr, current_setting('data_directory') AS dir"))[0];
  var localOnly = info.addr === "127.0.0.1/32" || info.addr === "127.0.0.1" || info.addr === "::1/128";
  var dirOk = path.resolve(info.dir).toLowerCase() === path.resolve(dataDir).toLowerCase() || path.resolve(info.dir).toLowerCase().indexOf(os.tmpdir().toLowerCase()) === 0;
  console.log("LOCAL_PG_ONLY = " + (localOnly && dirOk ? "YES" : "NO") + " (" + info.v.split(",")[0] + " @ " + info.addr + ", throwaway data dir under " + os.tmpdir() + ")");
  check("[ISO] PostgreSQL is the throwaway local cluster (loopback address, temp data directory)", localOnly && dirOk, info);
  if (!localOnly || !dirOk) return;

  // ---- migrations: all existing plus the disputed-debt forward migration ----
  await pool.query(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" +
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
  var migDir = path.join(ROOT, "server", "migrations");
  var files = fs.readdirSync(migDir).filter(function (f) { return /\.sql$/.test(f); }).sort();
  var baseMig = path.join(BASE_DIR, "server", "migrations");
  var sha = function (p) { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); };
  var DISPUTE_MIGRATION = "20261004120000_v2_disputed_debt_action_targets.sql";
  var preExisting = files.filter(function (f) { return f !== DISPUTE_MIGRATION; });
  var sameMigrations = fs.existsSync(baseMig) && files.indexOf(DISPUTE_MIGRATION) === files.length - 1 &&
    eq(preExisting, fs.readdirSync(baseMig).filter(function (f) { return /\.sql$/.test(f); }).sort()) &&
    preExisting.every(function (f) { return sha(path.join(migDir, f)) === sha(path.join(baseMig, f)); });
  check("[MIG] no modified migration: every pre-change migration identical (names + sha256); the only new one is the last, " + DISPUTE_MIGRATION +
    " (" + files.length + " files)", sameMigrations);
  for (var i = 0; i < files.length; i++) await pool.query(fs.readFileSync(path.join(migDir, files[i]), "utf8"));
  await pool.query("INSERT INTO miplan_private.backend_secrets (name, secret) VALUES ('b2_persist', $1)", [SECRET]);
  var identityCheck = (await q("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.financial_strategy_evaluations'::regclass " +
    "AND pg_get_constraintdef(oid) LIKE '%financial_input_identity_v%'"));
  var otherChecks = await q("SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint " +
    "WHERE contype = 'c' AND pg_get_constraintdef(oid) ~ '(situacion_ui|classifier_version)'");
  var enumLike = otherChecks.filter(function (c) { return /shadow-0|mora_reclamo|pagando_normal|= ANY|IN \(/i.test(c.def); });
  check("[MIG] existing identity_version CHECK already admits financial_input_identity_v2; no enum-like CHECK on classifier_version / situacion_ui",
    identityCheck.some(function (c) { return /v\[1-9\]\[0-9\]\*/.test(c.def); }) && enumLike.length === 0, { identityCheck: identityCheck, otherChecks: otherChecks });
  console.log("INFO non-enum CHECKs touching classifier_version / situacion_ui: " + JSON.stringify(otherChecks));

  // ---- real services over the rpc() adapter ----
  var client = makeRpcClient(pool);
  var journeyService = createJourneyService({ repository: createJourneyRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }), tenantId: TENANT });
  var diagRepo = createDiagnosisRepository({ client: client, backendSecret: SECRET, tenantId: TENANT });
  var svc = createDiagnosisService({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService });
  var ucService = userChoiceModule.createUserChoiceService({ repository: createUserChoiceRepository({ client: client, backendSecret: SECRET }), interactionEnabled: true });
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
    var api = {
      diagnose: function (journeyId, body) { return request(PORT, "POST", "/v1/diagnoses", Object.assign(clone(body), { journey_id: journeyId }), ANON_A); },
      stateByDiagnosis: function (diagnosisId) { return request(PORT, "GET", "/v1/diagnoses/" + diagnosisId + "/user-choices", undefined, ANON_A); },
      state: function (evaluationId) { return request(PORT, "GET", "/v1/evaluations/" + evaluationId + "/user-choices", undefined, ANON_A); },
      choose: function (evaluationId, body) { return request(PORT, "POST", "/v1/evaluations/" + evaluationId + "/user-choices", body, ANON_A); },
    };
    async function evaluationFor(journeyId, body, label) {
      var d = await api.diagnose(journeyId, body);
      if (d.status !== 200 || !d.body.v2_financial_strategy) throw new Error("fixture " + label + ": diagnosis failed " + d.raw.slice(0, 300));
      var s = await api.stateByDiagnosis(d.body.diagnosis_id);
      if (s.status !== 200) throw new Error("fixture " + label + ": state failed " + s.raw.slice(0, 300));
      var row = (await q("SELECT financial_input_identity_version AS idv, classifier_version AS cv FROM public.financial_strategy_evaluations WHERE evaluation_id = $1",
        [s.body.evaluation_id]))[0];
      return { diagnosis: d.body, diagnosis_id: d.body.diagnosis_id, evaluation_id: s.body.evaluation_id, state: s.body, idv: row.idv, cv: row.cv };
    }
    async function choiceRows(evaluationId) {
      return q("SELECT * FROM public.financial_strategy_user_choice_events WHERE evaluation_id = $1 ORDER BY slot_key, seq", [evaluationId]);
    }
    function activeChoices(state) {
      var out = [];
      Object.keys(state.choices || {}).forEach(function (type) {
        var v = state.choices[type];
        (Array.isArray(v) ? v : [v]).forEach(function (c) {
          if (c && c.state && c.state !== "none" && c.state !== "unmarked") out.push(type + ":" + c.state);
          else if (c && !c.state && c.amount != null) out.push(type + ":" + c.amount);
        });
      });
      return out;
    }
    var JA = (await journeyService.createFromHandoffRedeem(ANON_A, "debt-contract-a", clone(V2_CONTEXT))).journey_id;
    var JB = (await journeyService.createFromHandoffRedeem(ANON_A, "debt-contract-b", clone(V2_CONTEXT))).journey_id;

    // ---- [VIG-FA] FinancialAction-producing choice (lower_payment_intent, CONTENCION) ----
    var CONT = { ingreso: 50000, gastos: { vivienda: 40000 }, deudas: [debt("pagando_normal", { pago: "15000", estado: "al_dia", pago_fuente: "declarado" })] };
    var e1 = await evaluationFor(JA, input(CONT), "v1 contencion");
    var w1 = await api.choose(e1.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0, diagnosis_id: e1.diagnosis_id });
    var e1Before = (await api.state(e1.evaluation_id)).body;
    var e1RowsBefore = await choiceRows(e1.evaluation_id);
    check("[VIG-FA] v1 snapshot (no marker): shadow-02 / identity v1 CONTENCION; lower_payment_intent recorded and produces a FinancialAction",
      e1.cv === SHADOW_02 && e1.idv === ID_V1 && e1.state.strategy === "CONTENCION" && w1.status === 200 && w1.body.appended === true &&
      e1Before.financial_actions.length >= 1 && activeChoices(e1Before).length === 1, { e1: e1.state, w1: w1.body, after: e1Before });
    var e2 = await evaluationFor(JA, input(CONT, "v2"), "v2 contencion");
    var e1After = (await api.state(e1.evaluation_id)).body;
    check("[VIG-FA] same journey + same facts under marker v2: new evaluation (shadow-03 / identity v2, same strategy) with no active choice and no FinancialAction",
      e2.evaluation_id !== e1.evaluation_id && e2.cv === SHADOW_03 && e2.idv === ID_V2 && e2.state.strategy === "CONTENCION" &&
      activeChoices(e2.state).length === 0 && eq(e2.state.financial_actions, []) && (await choiceRows(e2.evaluation_id)).length === 0,
    { e2: e2.state });
    check("[VIG-FA] history append-only: the v1 evaluation keeps its choice row, choice state and FinancialAction unchanged (nothing copied, moved or deleted)",
      eq(await choiceRows(e1.evaluation_id), e1RowsBefore) && eq(e1After.choices, e1Before.choices) && eq(e1After.financial_actions, e1Before.financial_actions));

    // ---- [VIG-OP] operational choice (creditor_contact_step, REGULARIZACION) ----
    var REG = { ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [debt("deje_pagar", { pago: 0, atraso_tiempo: "mas_90", estado: "mora", pago_fuente: "no_paga" })] };
    var e3 = await evaluationFor(JA, input(REG), "v1 regularizacion");
    var w3 = await api.choose(e3.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "contacted", diagnosis_id: e3.diagnosis_id });
    var e3Before = (await api.state(e3.evaluation_id)).body;
    var e3RowsBefore = await choiceRows(e3.evaluation_id);
    var e4 = await evaluationFor(JA, input(REG, "v2"), "v2 regularizacion");
    var e3After = (await api.state(e3.evaluation_id)).body;
    check("[VIG-OP] v1 REGULARIZACION: creditor_contact_step 'contacted' recorded (shadow-02 / identity v1)",
      e3.cv === SHADOW_02 && e3.idv === ID_V1 && e3.state.strategy === "REGULARIZACION" && w3.status === 200 &&
      e3Before.choices.creditor_contact_step[0].state === "contacted", { w3: w3.body, st: e3Before.choices });
    check("[VIG-OP] same facts under marker v2: new evaluation (shadow-03 / identity v2) with every contact step back to 'none'; v1 history untouched",
      e4.evaluation_id !== e3.evaluation_id && e4.cv === SHADOW_03 && e4.idv === ID_V2 && e4.state.strategy === "REGULARIZACION" &&
      e4.state.choices.creditor_contact_step.every(function (c) { return c.state === "none"; }) && activeChoices(e4.state).length === 0 &&
      eq(await choiceRows(e3.evaluation_id), e3RowsBefore) && eq(e3After.choices, e3Before.choices), { e4: e4.state.choices });
    var reuse = await evaluationFor(JA, input(CONT, "v2"), "v2 contencion again");
    check("[VIG] repeating the v2 snapshot reuses the v2 evaluation (still no active choice): SHADOW02_CHOICES_REMAIN_ACTIVE_IN_SHADOW03 = NO",
      reuse.evaluation_id === e2.evaluation_id && activeChoices(reuse.state).length === 0 && eq(reuse.state.financial_actions, []));

    // ---- [AUTH] the SQL authorities accept / reject on shadow-03 results ----
    var moraZero = await evaluationFor(JB, input({ deudas: [debt("mora", Object.assign({}, MR, { pago_mensual_actual: 0 }))] }, "v2"), "v2 mora 0");
    var wMora = await api.choose(moraZero.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" });
    var wMoraSurplus = await api.choose(moraZero.evaluation_id, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 1000 });
    var wMoraExtra = await api.choose(moraZero.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 0, amount: 1000 });
    check("[AUTH] v2 mora, current payment 0 (flow 30000): REGULARIZACION, action_context only mora_debts [0]; contact step accepted; surplus reserve / " +
      "extra debt payment rejected (no surplus exposed)",
      moraZero.state.strategy === "REGULARIZACION" && eq(Object.keys(moraZero.state.action_context), ["mora_debts"]) &&
      eq(moraZero.state.action_context.mora_debts, [{ debt_index: 0 }]) && wMora.status === 200 && wMora.body.appended === true &&
      wMoraSurplus.status >= 400 && wMoraExtra.status >= 400 && !/surplus|reserve/i.test(JSON.stringify(moraZero.state.action_context)),
    { st: moraZero.state, wMora: wMora.body, s: [wMoraSurplus.status, wMoraSurplus.body], x: [wMoraExtra.status, wMoraExtra.body] });
    var atr35 = await evaluationFor(JB, input({ deudas: [debt("atrasado_pagando", { pago_mensual_actual: 35000, pago: 0, estado: "atraso_leve" })] }, "v2"), "v2 atrasado 35000");
    var wLow = await api.choose(atr35.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var atr35State = (await api.state(atr35.evaluation_id)).body;
    check("[AUTH] v2 atrasado, current payment 35000 (flow -5000): CONTENCION; the SQL authority accepts lower_payment_intent on the current payment " +
      "and a FinancialAction is produced",
      atr35.state.strategy === "CONTENCION" && wLow.status === 200 && wLow.body.appended === true && atr35State.financial_actions.length >= 1,
      { st: atr35.state, w: wLow.body });
    var atr10 = await evaluationFor(JB, input({ deudas: [debt("atrasado_pagando", { pago_mensual_actual: 10000, ultimo_pago_declarado: 2000, pago: 2000 })] }, "v2"), "v2 atrasado 10000");
    check("[AUTH] v2 atrasado, current payment 10000 (ultimo 2000 ignored): REGULARIZACION, only mora_debts",
      atr10.state.strategy === "REGULARIZACION" && eq(Object.keys(atr10.state.action_context), ["mora_debts"]), atr10.state);
    var disputeD = await api.diagnose(JB, input({ deudas: [debt("reclamo_disputa", Object.assign({}, MR, { pago_mensual_actual: 0 }))] }, "v2"));
    var disputeS = await api.stateByDiagnosis(disputeD.body.diagnosis_id);
    var wDispute = disputeS.status === 200 && disputeS.body.evaluation_id
      ? await api.choose(disputeS.body.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" }) : { status: 0 };
    check("[AUTH] v2 reclamo_disputa alone: incomplete (DEBT_IN_DISPUTE), no action_context; no operational / financial choice accepted on it",
      disputeD.body.v2_financial_strategy.classification_status === "incomplete" && disputeD.body.v2_action_context === null &&
      eq(disputeD.body.v2_financial_strategy.verification.reasons.map(function (r) { return r.code; }), ["DEBT_IN_DISPUTE"]) &&
      (wDispute.status === 0 || wDispute.status >= 400), { d: disputeD.body.v2_financial_strategy, s: disputeS.status, w: [wDispute.status, wDispute.body] });

    // ---- [DEDUP] SQL keys never collide ----
    var shape = { deudas: [debt("mora", Object.assign({}, MR, { pago_mensual_actual: 0 }))] };
    var JC = (await journeyService.createFromHandoffRedeem(ANON_A, "debt-contract-c", clone(V2_CONTEXT))).journey_id;
    var bodies = [input(shape), input(shape, "v2"), input({ deudas: [debt("mora", Object.assign({}, MR, { pago_mensual_actual: null }))] }, "v2"),
      input({ deudas: [debt("reclamo_disputa", Object.assign({}, MR, { pago_mensual_actual: 0 }))] }, "v2"), input(shape, "v2")];
    var diagIds = [];
    for (var b = 0; b < bodies.length; b++) diagIds.push((await api.diagnose(JC, bodies[b])).body.diagnosis_id);
    var evs = await q("SELECT financial_input_identity_version AS idv, financial_input_identity AS id, classifier_version AS cv, classification_status AS cs " +
      "FROM public.financial_strategy_evaluations WHERE journey_id = $1 ORDER BY computed_at, evaluation_id", [JC]);
    var links = await q("SELECT l.diagnosis_id, l.evaluation_id FROM public.diagnosis_strategy_evaluations l JOIN public.diagnoses d ON d.diagnosis_id = l.diagnosis_id " +
      "WHERE d.journey_id = $1", [JC]);
    var linkOf = {};
    links.forEach(function (l) { linkOf[l.diagnosis_id] = l.evaluation_id; });
    check("[DEDUP] SQL: v1/shadow-02 vs v2/shadow-03 (same shape), 0 vs null, mora vs reclamo -> 4 evaluations with distinct keys; the repeated v2 " +
      "snapshot links to the existing one (5 diagnoses, 5 links)",
      evs.length === 4 && new Set(evs.map(function (e) { return e.idv + "|" + e.id + "|" + e.cv; })).size === 4 &&
      evs.filter(function (e) { return e.idv === ID_V1 && e.cv === SHADOW_02; }).length === 1 &&
      evs.filter(function (e) { return e.idv === ID_V2 && e.cv === SHADOW_03; }).length === 3 && links.length === 5 &&
      linkOf[diagIds[4]] === linkOf[diagIds[1]] && linkOf[diagIds[1]] !== linkOf[diagIds[0]], { evs: evs, links: links.length });

    // ---- [STORE] snapshots and captures ----
    var snaps = await q("SELECT diagnosis_id, input_snapshot->>'debt_contract_version' AS marker, jsonb_typeof(input_snapshot->'deudas'->0->'pago_mensual_actual') AS t, " +
      "input_snapshot->'deudas'->0->'pago_mensual_actual' AS v, input_snapshot ? 'debt_contract_version' AS has_marker FROM public.diagnoses WHERE diagnosis_id = ANY($1::uuid[])", [diagIds]);
    var byId = {};
    snaps.forEach(function (s) { byId[s.diagnosis_id] = s; });
    check("[STORE] input_snapshot keeps the marker and the explicit value: v1 snapshot has no marker key; v2 0 stays number 0, v2 null stays JSON null",
      byId[diagIds[0]].has_marker === false && byId[diagIds[1]].marker === "v2" && byId[diagIds[1]].t === "number" && byId[diagIds[1]].v === 0 &&
      byId[diagIds[2]].t === "null", snaps);
    var capCols = (await q("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'debt_captures'")).map(function (r) { return r.column_name; });
    var caps = await q("SELECT diagnosis_id, situacion_ui, pago FROM public.debt_captures WHERE diagnosis_id = ANY($1::uuid[]) ORDER BY captured_at", [diagIds]);
    check("[STORE] debt_captures unchanged: no pago_mensual_actual column; v2 rows store situacion_ui mora / reclamo_disputa and legacy pago 0 as before",
      capCols.indexOf("pago_mensual_actual") === -1 && caps.length === 5 && caps.some(function (c) { return c.situacion_ui === "reclamo_disputa"; }) &&
      caps.every(function (c) { return Number(c.pago) === 0; }), caps);

    // ---- [HIST] historical snapshot ----
    var histIn = input({ deudas: [debt("mora_reclamo", MR)] });
    var hist = await evaluationFor(JB, histIn, "historical mora_reclamo");
    var direct = classifier.classifyFinancialShadow(clone(histIn));
    check("[HIST] historical mora_reclamo snapshot (no marker) -> shadow-02 / identity v1, same classification as the direct shadow-02 call; not reinterpreted",
      hist.cv === SHADOW_02 && hist.idv === ID_V1 && hist.state.classification_status === direct.classification_status && hist.state.strategy === direct.strategy,
      { st: hist.state, direct: { s: direct.classification_status, st: direct.strategy } });

    // ---- [PARITY] SQL authorities == JS on shadow-03 results ----
    var corpus = [];
    sweep.sweepInputs().forEach(function (inp) {
      var x = clone(inp);
      x.debt_contract_version = "v2";
      (x.deudas || []).forEach(function (d, k) {
        if (d && d.situacion_ui === "atrasado_pagando") d.pago_mensual_actual = [0, null, 5000, 40000][k % 4];
        if (d && d.situacion_ui === "mora_reclamo") d.situacion_ui = k % 2 ? "mora" : "reclamo_disputa";
      });
      corpus.push({ r: classifier.classifyFinancialShadowV3(x), s: { gastos: x.gastos, custom_expenses: x.custom_expenses } });
    });
    var seed = 20261003;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var SITS = ["pagando_normal", "atrasado_pagando", "deje_pagar", "mora", "reclamo_disputa", "no_seguro"];
    var PAYS = [0, null, 1500, 9000, 30000, 70000, undefined, "x"];
    for (var f = 0; f < 600; f++) {
      var n = 1 + Math.floor(rnd() * 3);
      var ds = [];
      for (var k = 0; k < n; k++) {
        var sit = SITS[Math.floor(rnd() * SITS.length)];
        var dd = { tipo: "prestamo", monto: String(10000 + Math.floor(rnd() * 300000)), situacion_ui: sit, pago: String(Math.floor(rnd() * 20000)) };
        var pay = PAYS[Math.floor(rnd() * PAYS.length)];
        if (pay !== undefined) dd.pago_mensual_actual = pay;
        if (sit === "deje_pagar") dd.atraso_tiempo = "mas_90";
        ds.push(dd);
      }
      var fx = input({ ingreso: 20000 + Math.floor(rnd() * 100000), gastos: { vivienda: Math.floor(rnd() * 60000), alimentacion: String(Math.floor(rnd() * 20000)) },
        deudas: ds }, "v2");
      corpus.push({ r: classifier.classifyFinancialShadowV3(fx), s: { gastos: fx.gastos, custom_expenses: fx.custom_expenses } });
    }
    var sqlChoice = (await q("SELECT miplan_private.v2_choice_authority(t.p -> 'r') AS a FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(p, o) ORDER BY t.o",
      [JSON.stringify(corpus)])).map(function (r) { return r.a; });
    var sqlInter = (await q("SELECT miplan_private.v2_interaction_authority(t.p -> 'r', t.p -> 's') AS a FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(p, o) ORDER BY t.o",
      [JSON.stringify(corpus)])).map(function (r) { return r.a; });
    var choiceFail = [];
    var interFail = [];
    var byStrategy = {};
    var disputeLower = 0;
    corpus.forEach(function (pr, idx) {
      var ac = buildActionContext(pr.r);
      var expected = ac === null ? null : {
        strategy: pr.r.strategy,
        monthly_surplus: Object.prototype.hasOwnProperty.call(ac, "monthly_surplus") ? ac.monthly_surplus : null,
        active_debts: Object.prototype.hasOwnProperty.call(ac, "active_debts") ? ac.active_debts : [],
        lower_payment_debts: userChoiceModule.lowerPaymentEligible(pr.r),
        surplus_debts: userChoiceModule.surplusToDebtEligible(pr.r),
      };
      if (!eq(sqlChoice[idx], expected)) choiceFail.push({ k: idx, sql: sqlChoice[idx], js: expected });
      var ac2 = buildActionContext(pr.r, pr.s);
      var expected2 = ac2 === null ? null : {
        strategy: pr.r.strategy,
        expense_categories: Array.isArray(ac2.expense_categories) ? ac2.expense_categories : [],
        mora_debts: (ac2.mora_debts || []).map(function (d) { return d.debt_index; }),
        contact_debts: userChoiceModule.creditorContactEligible(pr.r),
      };
      if (!eq(sqlInter[idx], expected2)) interFail.push({ k: idx, sql: sqlInter[idx], js: expected2 });
      if (pr.r.classification_status === "classified") byStrategy[pr.r.strategy] = (byStrategy[pr.r.strategy] || 0) + 1;
      if (expected && expected.lower_payment_debts.some(function (i) {
        return pr.r.verification_reasons.some(function (v) { return v.code === "DEBT_IN_DISPUTE" && v.debt_index === i; });
      })) disputeLower += 1;
    });
    check("[PARITY] miplan_private.v2_choice_authority == JS (monthly_surplus, active_debts, lower_payment_debts, surplus_debts) on " + corpus.length +
      " shadow-03 results " + JSON.stringify(byStrategy), choiceFail.length === 0 && Object.keys(byStrategy).length === 5, choiceFail.slice(0, 3));
    check("[PARITY] miplan_private.v2_interaction_authority == JS (expense_categories, mora_debts, contact_debts) on the same shadow-03 results",
      interFail.length === 0, interFail.slice(0, 3));
    check("[PARITY] no disputed debt is eligible for lower_payment_intent in any corpus result (JS == SQL)", disputeLower === 0, disputeLower);
  }
}

main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
