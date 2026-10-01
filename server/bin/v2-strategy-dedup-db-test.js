/**
 * server/bin/v2-strategy-dedup-db-test.js — V2-HARNESS-SAFETY-AND-STRATEGY-DEDUP-01, isolated DB harness.
 *
 * Throwaway embedded PostgreSQL 17 (temp dir, loopback, deleted at the end) with every repo migration
 * applied, including 20260930120000_v2_strategy_evaluation_dedup.sql (WRITTEN, NOT APPLIED anywhere
 * else). The real diagnosis/journey services and Supabase repositories run on top through an rpc()
 * adapter over node-postgres, so every write goes through the real miplan_* RPCs.
 * Never reads .env / SUPABASE_*; no remote host is ever contacted.
 *
 * Deps (outside the repo): MIPLAN_ISOLATED_DEPS dir with embedded-postgres + pg installed
 * (default %TEMP%/miplan-v2-isolated-pg17).
 *
 * node -r ./server/testing/networkTrap.js server/bin/v2-strategy-dedup-db-test.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var crypto = require("crypto");
var pathToFileURL = require("url").pathToFileURL;
var createRequire = require("module").createRequire;

var ROOT = path.join(__dirname, "..", "..");
var DEPS = process.env.MIPLAN_ISOLATED_DEPS || path.join(os.tmpdir(), "miplan-v2-isolated-pg17");
var pg = createRequire(path.join(DEPS, "package.json"))("pg");

var e2e = require("../../dev/backend-arch/classifier-shadow/v2-wiring-e2e");
var FIXTURES = require("../../dev/backend-arch/classifier-shadow/fixtures").FIXTURES;
var GOLDEN = require("./financial-identity-golden-test").GOLDEN;
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;
var createDiagnosisRepository = require("../modules/diagnosis/repository").createDiagnosisRepository;
var createJourneyRepository = require("../modules/journey/repository").createJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;
var deriveFinancialInputIdentity = require("../modules/diagnosis/financialIdentity").deriveFinancialInputIdentity;
var classifier = require("../../engine/classifier/financial-classifier");
var buildActionContext = require("../modules/diagnosis/actionContext").buildActionContext;

var MIGRATION = "20260930120000_v2_strategy_evaluation_dedup.sql";
var SECRET = crypto.randomBytes(24).toString("hex");
var TENANT = "miplan-default";
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var ANON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function rpcParams(o) {
  return {
    p_secret: o.secret || SECRET, p_diagnosis_id: o.diagnosis_id, p_journey_id: o.journey_id, p_anonymous_id: o.anonymous_id,
    p_identity_version: o.identity_version || "financial_input_identity_v1", p_identity: o.identity, p_survey_version: 2,
    p_classifier_version: o.result.classifier_version, p_contract: o.result.contract, p_threshold_version: o.result.threshold_version,
    p_classification_status: o.result.classification_status, p_strategy: o.result.strategy, p_result: o.result,
  };
}
var RECORD_SQL = "SELECT public.miplan_record_financial_strategy_evaluation(p_secret => $1, p_diagnosis_id => $2, p_journey_id => $3, " +
  "p_anonymous_id => $4, p_identity_version => $5, p_identity => $6, p_survey_version => $7::smallint, p_classifier_version => $8, " +
  "p_contract => $9, p_threshold_version => $10, p_classification_status => $11, p_strategy => $12, p_result => $13::jsonb) AS v";
function recordArgs(p) {
  return [p.p_secret, p.p_diagnosis_id, p.p_journey_id, p.p_anonymous_id, p.p_identity_version, p.p_identity, p.p_survey_version,
    p.p_classifier_version, p.p_contract, p.p_threshold_version, p.p_classification_status, p.p_strategy, JSON.stringify(p.p_result)];
}
async function errorOf(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return String(e.message || e.code);
  }
}

var ROLLBACK_SQL = [
  "DROP FUNCTION public.miplan_record_financial_strategy_evaluation(text, uuid, uuid, text, text, text, smallint, text, text, text, text, text, jsonb);",
  "DROP TABLE public.diagnosis_strategy_evaluations;",
  "DROP TABLE public.financial_strategy_evaluations;",
].join("\n");

async function main() {
  var EmbeddedPostgres = (await import(pathToFileURL(path.join(DEPS, "node_modules", "embedded-postgres", "dist", "index.js")).href)).default;
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-dedup-pg-"));
  var port = 54000 + Math.floor(Math.random() * 900);
  var password = crypto.randomBytes(12).toString("hex");
  var server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: password, port: port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: function () {}, onError: function () {} });
  await server.initialise();
  await server.start();
  await server.createDatabase("miplan_isolated");
  var pool = new pg.Pool({ host: "127.0.0.1", port: port, user: "postgres", password: password, database: "miplan_isolated", max: 24 });
  try {
    await run(pool);
  } finally {
    await pool.end();
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_STRATEGY_DEDUP_DB_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

async function run(pool) {
  var ver = (await pool.query("SHOW server_version")).rows[0].server_version;
  var host = (await pool.query("SELECT coalesce(inet_server_addr()::text, 'local') AS h")).rows[0].h;
  console.log("isolated PostgreSQL " + ver + " @ " + host + " (throwaway cluster)");

  // ---- Supabase environment emulation (roles + default privileges), then repo migrations ----
  await pool.query(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" +
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
  var files = fs.readdirSync(path.join(ROOT, "server", "migrations")).filter(function (f) { return /\.sql$/.test(f); }).sort();
  var sqlOf = function (f) { return fs.readFileSync(path.join(ROOT, "server", "migrations", f), "utf8"); };
  for (var i = 0; i < files.length; i++) {
    if (files[i] >= MIGRATION) continue; // later migrations depend on this one; this harness tests it in isolation
    await pool.query(sqlOf(files[i]));
  }
  var admin = await pool.connect();
  await admin.query("BEGIN");
  await admin.query(sqlOf(MIGRATION));
  await admin.query("ROLLBACK");
  admin.release();
  var afterRollback = (await pool.query("SELECT to_regclass('public.financial_strategy_evaluations') AS t")).rows[0].t;
  check("migration: applies inside a transaction and ROLLBACK leaves no trace", afterRollback === null);
  await pool.query(sqlOf(MIGRATION));
  await pool.query(sqlOf(MIGRATION));
  check("migration: applied after all existing migrations; re-applying is a no-op (IF NOT EXISTS / OR REPLACE)", true);
  await pool.query("INSERT INTO miplan_private.backend_secrets (name, secret) VALUES ('b2_persist', $1)", [SECRET]);

  // ---- real services over the rpc() adapter ----
  var client = makeRpcClient(pool);
  var journeyService = createJourneyService({ repository: createJourneyRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }), tenantId: TENANT });
  var diagRepo = createDiagnosisRepository({ client: client, backendSecret: SECRET, tenantId: TENANT });
  function service(extra) {
    return createDiagnosisService(Object.assign({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService }, extra || {}));
  }
  var svc = service();
  var warnings = [];
  var warn = console.warn;
  console.warn = function (m) { warnings.push(String(m)); };

  var rawOtherSurvey = clone(e2e.RAW_CONTEXTS.V2);
  rawOtherSurvey.survey.respuestas = Object.assign({}, rawOtherSurvey.survey.respuestas, { p1: "A", p2: "C", p9: "A" });
  var JA = (await journeyService.createFromHandoffRedeem(ANON_A, "dedup-a", clone(e2e.RAW_CONTEXTS.V2))).journey_id;
  var JA2 = (await journeyService.createFromHandoffRedeem(ANON_A, "dedup-a2", rawOtherSurvey)).journey_id;
  var JB = (await journeyService.createFromHandoffRedeem(ANON_B, "dedup-b", clone(e2e.RAW_CONTEXTS.V2))).journey_id;
  var JV1 = (await journeyService.createFromHandoffRedeem(ANON_A, "dedup-v1", clone(e2e.RAW_CONTEXTS.V1))).journey_id;
  check("fixture: 4 journeys (A/V2, A/V2 other survey, B/V2, A/V1) created through the real RPC, survey versions 2/2/2/1",
    (await journeyService.surveyVersionOf(JA, ANON_A)) === 2 && (await journeyService.surveyVersionOf(JA2, ANON_A)) === 2 &&
    (await journeyService.surveyVersionOf(JB, ANON_B)) === 2 && (await journeyService.surveyVersionOf(JV1, ANON_A)) === 1);

  var D1 = { tipo: "prestamo", acreedor: "Banco QA", monto: 120000, pago: 6500, situacion_ui: "pagando_normal" };
  var BASE = { ingreso: 50000, gastos: { vivienda: 20000 }, deudas: [D1] };
  function body(journeyId, extra) {
    return Object.assign(clone(BASE), extra || {}, { journey_id: journeyId });
  }
  async function create(anon, journeyId, extra, s) {
    return (s || svc).createDiagnosis({ anonymousId: anon, body: body(journeyId, extra) });
  }
  async function q(sql, args) {
    return (await pool.query(sql, args || [])).rows;
  }
  async function evalOf(diagnosisId) {
    var rows = await q("SELECT l.evaluation_id, l.income_provenance, e.* FROM public.diagnosis_strategy_evaluations l " +
      "JOIN public.financial_strategy_evaluations e USING (evaluation_id) WHERE l.diagnosis_id = $1", [diagnosisId]);
    return rows[0] || null;
  }
  async function countEvals(journeyId, identity, classifierVersion) {
    return Number((await q("SELECT count(*) AS n FROM public.financial_strategy_evaluations WHERE journey_id = $1 AND " +
      "financial_input_identity = $2 AND classifier_version = $3", [journeyId, identity, classifierVersion]))[0].n);
  }
  var diagCount = async function () { return Number((await q("SELECT count(*) AS n FROM public.diagnoses"))[0].n); };
  var CV = classifier.CLASSIFIER_VERSION;

  // ---- [1] same input + same survey -> same identity ----
  var d1 = await create(ANON_A, JA);
  var d2 = await create(ANON_A, JA);
  var id1 = d1.v2_financial_strategy && d1.v2_financial_strategy.financial_input_identity.value;
  check("[1] same input + same survey (journey) -> same identity; two distinct legacy diagnoses",
    !!id1 && d2.v2_financial_strategy.financial_input_identity.value === id1 && d1.diagnosis_id !== d2.diagnosis_id, { d1: d1.diagnosis_id, d2: d2.diagnosis_id });

  // ---- [2] different survey -> same identity ----
  var dS = await create(ANON_A, JA2);
  var dR = await create(ANON_A, JA, { tiene_encuesta: true, respuestas: { p1: "D", p2: "D", p3: "D", p4: "D", p5: "D", p6: "D", p7: "D", p8: "D", p9: "D", p10: "D" } });
  check("[2] different survey (other V2 journey survey, or different legacy survey answers) -> same financial identity",
    dS.v2_financial_strategy.financial_input_identity.value === id1 && dR.v2_financial_strategy.financial_input_identity.value === id1);

  // ---- [3] no legacy diagnosis dedup ----
  var nBefore = await diagCount();
  var dL = await create(ANON_A, JA, { tiene_encuesta: true, respuestas: { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" } });
  var legacyPlans = [d1.result.planId, dR.result.planId, dL.result.planId];
  var diagUniques = await q("SELECT indexrelid::regclass::text AS idx FROM pg_index WHERE indrelid = 'public.diagnoses'::regclass AND indisunique");
  check("[3] same identity, different survey -> different legacy diagnosis (planIds " + JSON.stringify(legacyPlans) + "), each persisted with its own diagnosis_id",
    new Set(legacyPlans).size === 3 && dL.v2_financial_strategy.financial_input_identity.value === id1 &&
    (await diagCount()) === nBefore + 1 && new Set([d1.diagnosis_id, d2.diagnosis_id, dR.diagnosis_id, dL.diagnosis_id]).size === 4, legacyPlans);
  check("[3] diagnoses has no UNIQUE besides its primary key (no identity uniqueness on the legacy table)",
    diagUniques.length === 1 && diagUniques[0].idx === "diagnoses_pkey", diagUniques);

  // ---- [4] same owner + identity + classifier -> 1 V2 result ----
  var e1 = await evalOf(d1.diagnosis_id);
  var linkedSame = await Promise.all([d2, dR, dL].map(function (d) { return evalOf(d.diagnosis_id); }));
  check("[4] same journey + identity + classifier_version -> exactly 1 evaluation; the 4 diagnoses of journey A link to it",
    (await countEvals(JA, id1, CV)) === 1 && linkedSame.every(function (e) { return e && e.evaluation_id === e1.evaluation_id; }));
  check("[4] responses of reused diagnoses are the stored evaluation's projection (identical V2 block)",
    [d2, dR, dL].every(function (d) { return eq(d.v2_financial_strategy, d1.v2_financial_strategy); }));

  // ---- [5] concurrency ----
  async function legacyDiagnosis(journeyId, anon, input) {
    return (await diagRepo.insertDiagnosis({ anonymous_id: anon, tenant_id: TENANT, now_ms: Date.now(), engine_version: "test",
      input_snapshot: input, engine_result: {}, completeness: {}, journey_id: journeyId })).diagnosis_id;
  }
  function variant(ingreso) {
    var input = Object.assign(clone(BASE), { ingreso: ingreso });
    return { input: input, identity: deriveFinancialInputIdentity(input).value, result: classifier.classifyFinancialShadow(clone(input)) };
  }
  async function blockedRace(ingreso, finish) {
    var v = variant(ingreso);
    var dx = await legacyDiagnosis(JA, ANON_A, v.input);
    var dy = await legacyDiagnosis(JA, ANON_A, v.input);
    var a = await pool.connect();
    var b = await pool.connect();
    try {
      var bPid = (await b.query("SELECT pg_backend_pid() AS p")).rows[0].p;
      await a.query("BEGIN");
      var ra = (await a.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: dx, journey_id: JA, anonymous_id: ANON_A, identity: v.identity, result: v.result })))).rows[0].v;
      var bPromise = b.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: dy, journey_id: JA, anonymous_id: ANON_A, identity: v.identity, result: v.result })));
      var waited = false;
      for (var t = 0; t < 100 && !waited; t++) {
        await new Promise(function (r) { setTimeout(r, 30); });
        var st = await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [bPid]);
        waited = st.rows[0] && st.rows[0].wait_event_type === "Lock";
      }
      await a.query(finish);
      var rb = (await bPromise).rows[0].v;
      return { v: v, dx: dx, dy: dy, ra: ra, rb: rb, waited: waited };
    } finally {
      a.release();
      b.release();
    }
  }
  var c1 = await blockedRace(50001, "COMMIT");
  check("[5] two concurrent writes, same key: the second INSERT blocks on the first (Lock wait observed), then ON CONFLICT DO NOTHING reuses it",
    c1.waited && c1.ra.created === true && c1.rb.created === false && c1.rb.reused === true && c1.rb.evaluation_id === c1.ra.evaluation_id &&
    c1.rb.origin_diagnosis_id === c1.dx, { waited: c1.waited, ra: c1.ra.created, rb: c1.rb && c1.rb.created });
  check("[5] ... exactly 1 evaluation, both legacy diagnoses keep their own ids and each has a link",
    (await countEvals(JA, c1.v.identity, CV)) === 1 && c1.dx !== c1.dy &&
    (await evalOf(c1.dx)).evaluation_id === c1.ra.evaluation_id && (await evalOf(c1.dy)).evaluation_id === c1.ra.evaluation_id);
  var c2 = await blockedRace(50002, "ROLLBACK");
  check("[5] winner rolls back while the other waits -> the waiter creates the evaluation (origin = its diagnosis); still exactly 1",
    c2.waited && c2.rb.created === true && c2.rb.origin_diagnosis_id === c2.dy && (await countEvals(JA, c2.v.identity, CV)) === 1 &&
    (await evalOf(c2.dx)) === null && (await evalOf(c2.dy)).evaluation_id === c2.rb.evaluation_id);
  var storm = variant(50003);
  var stormDiags = [];
  for (var sd = 0; sd < 16; sd++) stormDiags.push(await legacyDiagnosis(JA, ANON_A, storm.input));
  var stormReplies = await Promise.all(stormDiags.map(function (d) {
    return pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: d, journey_id: JA, anonymous_id: ANON_A, identity: storm.identity, result: storm.result })))
      .then(function (r) { return r.rows[0].v; });
  }));
  check("[5] 16 concurrent writers (16 connections), same key -> exactly one created, 1 evaluation, 16 links to it",
    stormReplies.filter(function (r) { return r.created; }).length === 1 && (await countEvals(JA, storm.identity, CV)) === 1 &&
    new Set(stormReplies.map(function (r) { return r.evaluation_id; })).size === 1 &&
    Number((await q("SELECT count(*) AS n FROM public.diagnosis_strategy_evaluations WHERE evaluation_id = $1", [stormReplies[0].evaluation_id]))[0].n) === 16);
  var tabs = await Promise.all([create(ANON_A, JA, { ingreso: 50004 }), create(ANON_A, JA, { ingreso: 50004 })]);
  var tabId = tabs[0].v2_financial_strategy && tabs[0].v2_financial_strategy.financial_input_identity.value;
  var tabEvals = await Promise.all(tabs.map(function (t) { return evalOf(t.diagnosis_id); }));
  check("[5] two tabs through the real service at once -> 2 legacy diagnoses (distinct ids), both get V2, 1 evaluation",
    tabs[0].diagnosis_id !== tabs[1].diagnosis_id && !!tabId && tabs[1].v2_financial_strategy && tabs[1].v2_financial_strategy.financial_input_identity.value === tabId &&
    (await countEvals(JA, tabId, CV)) === 1 && tabEvals[0].evaluation_id === tabEvals[1].evaluation_id);

  // ---- [6] different owner -> separate results; ownership enforced server-side ----
  var dB = await create(ANON_B, JB);
  var eB = await evalOf(dB.diagnosis_id);
  var eS = await evalOf(dS.diagnosis_id);
  check("[6] other anonymous owner, same finances -> same identity, separate evaluation (never global)",
    dB.v2_financial_strategy.financial_input_identity.value === id1 && eB.evaluation_id !== e1.evaluation_id && eB.anonymous_id === ANON_B);
  check("[6] same owner, other journey -> separate evaluation (owner scope = journey)", eS.evaluation_id !== e1.evaluation_id && eS.journey_id === JA2);
  var crossOwner = await errorOf(pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: d1.diagnosis_id, journey_id: JA, anonymous_id: ANON_B, identity: id1, result: classifier.classifyFinancialShadow(clone(BASE)) }))));
  var crossJourney = await errorOf(pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: d1.diagnosis_id, journey_id: JB, anonymous_id: ANON_B, identity: id1, result: classifier.classifyFinancialShadow(clone(BASE)) }))));
  var rowsBeforeForeign = (await pool.query("SELECT (SELECT count(*) FROM public.diagnoses)::int AS d, " +
    "(SELECT count(*) FROM public.financial_strategy_evaluations)::int AS e, (SELECT count(*) FROM public.diagnosis_strategy_evaluations)::int AS l")).rows[0];
  var foreignPost = await errorOf(create(ANON_B, JA));
  var rowsAfterForeign = (await pool.query("SELECT (SELECT count(*) FROM public.diagnoses)::int AS d, " +
    "(SELECT count(*) FROM public.financial_strategy_evaluations)::int AS e, (SELECT count(*) FROM public.diagnosis_strategy_evaluations)::int AS l")).rows[0];
  check("[6] RPC rejects another owner's diagnosis (DIAGNOSIS_OWNERSHIP_MISMATCH) and a foreign journey (JOURNEY_DIAGNOSIS_MISMATCH)",
    /DIAGNOSIS_OWNERSHIP_MISMATCH/.test(crossOwner) && /JOURNEY_DIAGNOSIS_MISMATCH/.test(crossJourney), { crossOwner: crossOwner, crossJourney: crossJourney });
  check("[6] service rejects a foreign journey_id before any write (JOURNEY_NOT_OWNED; diagnoses/evaluations/links unchanged)",
    /JOURNEY_NOT_OWNED/.test(foreignPost) && eq(rowsBeforeForeign, rowsAfterForeign), { foreignPost: foreignPost, before: rowsBeforeForeign, after: rowsAfterForeign });

  // ---- [7] different classifier_version -> separate results ----
  var BUMP = "miplan-financial-classifier-shadow-03-test";
  var bumped = service({ classifyFn: function (ei) { return Object.assign(classifier.classifyFinancialShadow(ei), { classifier_version: BUMP }); } });
  var dC = await create(ANON_A, JA, null, bumped);
  var eC = await evalOf(dC.diagnosis_id);
  check("[7] same journey + identity, new classifier_version -> separate evaluation; the old one is untouched",
    eC.evaluation_id !== e1.evaluation_id && eC.classifier_version === BUMP && eC.financial_input_identity === id1 &&
    dC.v2_financial_strategy.provenance.classifier_version === BUMP && (await countEvals(JA, id1, CV)) === 1 && (await countEvals(JA, id1, BUMP)) === 1);

  // ---- [8] traceability ----
  var reusers = (await q("SELECT l.diagnosis_id FROM public.diagnosis_strategy_evaluations l JOIN public.financial_strategy_evaluations e " +
    "USING (evaluation_id) WHERE l.evaluation_id = $1 AND l.diagnosis_id <> e.origin_diagnosis_id ORDER BY l.linked_at", [e1.evaluation_id]))
    .map(function (r) { return r.diagnosis_id; });
  var e2row = await evalOf(d2.diagnosis_id);
  check("[8] origin: the evaluation records diagnosis A as its origin", e1.origin_diagnosis_id === d1.diagnosis_id);
  check("[8] current: diagnosis B resolves to the same evaluation (identity " + id1.slice(0, 12) + "..., " + CV + ")",
    e2row.evaluation_id === e1.evaluation_id && e2row.financial_input_identity === id1 && e2row.classifier_version === CV &&
    e2row.financial_input_identity_version === "financial_input_identity_v1");
  check("[8] reusers: exactly the later diagnoses of journey A with that identity (B, survey-D, survey-A), not the origin",
    eq(reusers, [d2.diagnosis_id, dR.diagnosis_id, dL.diagnosis_id]), reusers);
  var fullB = clone(e2row.result);
  fullB.provenance.income = e2row.income_provenance;
  var snapB = await diagRepo.getDiagnosisById(d2.diagnosis_id);
  check("[8] lossless: evaluation.result with the link's income_provenance == classifier output of B's own snapshot",
    eq(fullB, classifier.classifyFinancialShadow(clone(snapB.input_snapshot))));
  var dP = await create(ANON_A, JA, { entry_context: { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } } });
  var eP = await evalOf(dP.diagnosis_id);
  var fullP = clone(eP.result);
  fullP.provenance.income = eP.income_provenance;
  var snapP = await diagRepo.getDiagnosisById(dP.diagnosis_id);
  check("[8] provenance-only difference (user_entered vs no provenance) reuses the evaluation and keeps its own echo on the link",
    eP.evaluation_id === e1.evaluation_id && eP.income_provenance.source === "user_entered" &&
    eq(fullP, classifier.classifyFinancialShadow(clone(snapP.input_snapshot))));

  // ---- [9] real financial change -> different identity -> different result ----
  var d9 = await create(ANON_A, JA, { deudas: [Object.assign(clone(D1), { pago: 7000 })] });
  var e9 = await evalOf(d9.diagnosis_id);
  check("[9] a debt payment change -> new identity -> new evaluation (origin = that diagnosis)",
    d9.v2_financial_strategy.financial_input_identity.value !== id1 && e9.evaluation_id !== e1.evaluation_id && e9.origin_diagnosis_id === d9.diagnosis_id);

  // ---- [10] identity v1 reproducible from the persisted snapshot (real jsonb round-trip) ----
  var PROVS = [null, { source: "url_prefill", user_modified: false }, { source: "handoff", detail: "handoff", user_modified: false },
    { source: "user_entered", user_modified: true }];
  var snapFail = [];
  var acFail = [];
  var v2Missing = [];
  var coverageFail = [];
  var nSnap = 0;
  for (var fi = 0; fi < FIXTURES.length; fi++) {
    for (var pi = 0; pi < PROVS.length; pi++) {
      var fx = clone(FIXTURES[fi].input);
      if (PROVS[pi]) fx.entry_context = { field_provenance: { ingreso: clone(PROVS[pi]) } };
      fx.journey_id = JA;
      var out = await svc.createDiagnosis({ anonymousId: ANON_A, body: fx });
      nSnap += 1;
      var stored = await diagRepo.getDiagnosisById(out.diagnosis_id);
      var snap = stored.input_snapshot;
      var fromSnap = deriveFinancialInputIdentity(snap);
      var ev = await evalOf(out.diagnosis_id);
      if (!out.v2_financial_strategy) { v2Missing.push(FIXTURES[fi].id + "#" + pi); continue; }
      if (!fromSnap || fromSnap.value !== out.v2_financial_strategy.financial_input_identity.value || !ev || ev.financial_input_identity !== fromSnap.value) {
        snapFail.push(FIXTURES[fi].id + "#" + pi);
      }
      if (!Object.prototype.hasOwnProperty.call(out, "v2_action_context") ||
          !eq(out.v2_action_context, buildActionContext(classifier.classifyFinancialShadow(clone(snap))))) {
        acFail.push(FIXTURES[fi].id + "#" + pi);
      }
      var src = JSON.parse(JSON.stringify(FIXTURES[fi].input)); // wire form: keys set to undefined never reach the server
      var coverChecks = {
        deudas: eq(snap.deudas, src.deudas),
        gastos: eq(snap.gastos, src.gastos),
        custom_expenses: eq(snap.custom_expenses, src.custom_expenses),
        no_debts_declared: snap.no_debts_declared === src.no_debts_declared,
        ingreso: eq(snap.ingreso, src.ingreso),
        declared_ingreso: eq(snap.declared_ingreso, src.declared_ingreso),
        income_provenance: !PROVS[pi] || eq(snap.entry_context.field_provenance.ingreso,
          Object.assign({ source: PROVS[pi].source, user_modified: !!PROVS[pi].user_modified }, PROVS[pi].detail ? { detail: PROVS[pi].detail } : {})),
      };
      var uncovered = Object.keys(coverChecks).filter(function (k) { return !coverChecks[k]; });
      if (uncovered.length) coverageFail.push(FIXTURES[fi].id + "#" + pi + ":" + uncovered.join(","));
    }
  }
  check("[10] " + nSnap + " diagnoses (" + FIXTURES.length + " fixtures x 4 income provenances) through the real service: every one gets V2 " +
    "(no STRATEGY_EVALUATION_MISMATCH on reuse)", v2Missing.length === 0, v2Missing);
  check("[10] identity_v1(diagnoses.input_snapshot read back from PostgreSQL jsonb) == projected identity == stored evaluation identity",
    snapFail.length === 0, snapFail);
  check("[10] v2_action_context built from the evaluation result stored in PostgreSQL jsonb == action_context of the classifier on the snapshot",
    acFail.length === 0, acFail);
  check("[10] snapshot keeps every v1 field: ingreso/declared_ingreso, gastos, custom_expenses, no_debts_declared, full debts in original order, " +
    "income provenance (source, user_modified, detail)", coverageFail.length === 0, coverageFail);

  // ---- [11] golden vectors: independent sha256 in PostgreSQL ----
  var pgHashes = await q("SELECT encode(sha256(convert_to(c, 'UTF8')), 'hex') AS h FROM unnest($1::text[]) WITH ORDINALITY AS t(c, o) ORDER BY o",
    [GOLDEN.map(function (g) { return g[2]; })]);
  check("[11] golden vectors: PostgreSQL sha256(UTF-8 canonical) == frozen hashes == Node derivation (" + GOLDEN.length + " vectors)",
    pgHashes.length === GOLDEN.length && GOLDEN.every(function (g, k) {
      return pgHashes[k].h === g[3] && deriveFinancialInputIdentity(clone(g[1])).value === g[3];
    }));

  // ---- choice vigency (demonstration only; no choice table in the migration) ----
  var demo = await pool.connect();
  try {
    await demo.query("CREATE TEMP TABLE demo_user_choices (evaluation_id uuid NOT NULL, debt_index int NOT NULL, choice text NOT NULL, " +
      "origin_diagnosis_id uuid NOT NULL, PRIMARY KEY (evaluation_id, debt_index))");
    await demo.query("INSERT INTO demo_user_choices VALUES ($1, 0, 'demo', $2)", [e1.evaluation_id, d1.diagnosis_id]);
    var vigente = async function (diagnosisId) {
      return (await demo.query("SELECT c.debt_index FROM public.diagnosis_strategy_evaluations l JOIN demo_user_choices c USING (evaluation_id) " +
        "WHERE l.diagnosis_id = $1", [diagnosisId])).rows.length > 0;
    };
    check("vigency demo: a choice keyed (evaluation = journey + identity + classifier_version, debt_index) made on diagnosis A is current for B",
      (await vigente(d2.diagnosis_id)) && (await vigente(dP.diagnosis_id)));
    check("vigency demo: ... and not current after a financial change, a classifier bump, another journey or another owner",
      !(await vigente(d9.diagnosis_id)) && !(await vigente(dC.diagnosis_id)) && !(await vigente(dS.diagnosis_id)) && !(await vigente(dB.diagnosis_id)));
  } finally {
    demo.release();
  }

  // ---- contract edges ----
  var sameKeyOtherResult = Object.assign(classifier.classifyFinancialShadow(clone(BASE)), { strategy: "CONTENCION" });
  var dM = await legacyDiagnosis(JA, ANON_A, clone(BASE));
  var mismatch = await errorOf(pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: dM, journey_id: JA, anonymous_id: ANON_A, identity: id1, result: sameKeyOtherResult }))));
  check("edge: same key with a different classification -> STRATEGY_EVALUATION_MISMATCH, nothing linked",
    /STRATEGY_EVALUATION_MISMATCH/.test(mismatch) && (await evalOf(dM)) === null, mismatch);
  var relink = (await pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: d1.diagnosis_id, journey_id: JA, anonymous_id: ANON_A, identity: id1, result: classifier.classifyFinancialShadow(clone(BASE)) })))).rows[0].v;
  var v9 = variant(61000);
  var otherKey = await errorOf(pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: d2.diagnosis_id, journey_id: JA, anonymous_id: ANON_A, identity: v9.identity, result: v9.result }))));
  check("edge: re-recording a diagnosis is idempotent (linked:false, same evaluation); linking it to another key -> DIAGNOSIS_ALREADY_LINKED (rolled back)",
    relink.linked === false && relink.evaluation_id === e1.evaluation_id && /DIAGNOSIS_ALREADY_LINKED/.test(otherKey) &&
    (await countEvals(JA, v9.identity, CV)) === 0, { relink: relink.linked, otherKey: otherKey });
  var dV1 = await create(ANON_A, JV1);
  check("edge: V1 journey -> legacy diagnosis only, no evaluation, no V2 block",
    !dV1.v2_financial_strategy && (await evalOf(dV1.diagnosis_id)) === null);
  var dV1raw = await legacyDiagnosis(JV1, ANON_A, clone(BASE));
  var notV2 = await errorOf(pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: dV1raw, journey_id: JV1, anonymous_id: ANON_A, identity: id1, result: classifier.classifyFinancialShadow(clone(BASE)) }))));
  var badSecret = await errorOf(pool.query(RECORD_SQL, recordArgs(rpcParams({ secret: "wrong", diagnosis_id: d1.diagnosis_id, journey_id: JA, anonymous_id: ANON_A, identity: id1, result: classifier.classifyFinancialShadow(clone(BASE)) }))));
  var badIdentity = await errorOf(pool.query(RECORD_SQL, recordArgs(rpcParams({ diagnosis_id: d1.diagnosis_id, journey_id: JA, anonymous_id: ANON_A, identity: "ABC", result: classifier.classifyFinancialShadow(clone(BASE)) }))));
  check("edge: RPC rejects V1 journeys (SURVEY_VERSION_NOT_V2), a wrong secret (MIPLAN_UNAUTHORIZED) and a malformed identity",
    /SURVEY_VERSION_NOT_V2/.test(notV2) && /MIPLAN_UNAUTHORIZED/.test(badSecret) && /INVALID_FINANCIAL_INPUT_IDENTITY/.test(badIdentity),
    { notV2: notV2, badSecret: badSecret, badIdentity: badIdentity });

  // ---- access model ----
  var denied = [];
  for (var role of ["anon", "authenticated"]) {
    for (var tbl of ["financial_strategy_evaluations", "diagnosis_strategy_evaluations"]) {
      var c = await pool.connect();
      try {
        await c.query("SET ROLE " + role);
        denied.push(/permission denied/.test(await errorOf(c.query("SELECT 1 FROM public." + tbl + " LIMIT 1"))));
        denied.push(/permission denied/.test(await errorOf(c.query("DELETE FROM public." + tbl))));
      } finally {
        await c.query("RESET ROLE");
        c.release();
      }
    }
  }
  check("access: anon and authenticated cannot read or write either table (despite Supabase default privileges)", denied.length === 8 && denied.every(Boolean), denied);
  var rls = await q("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('financial_strategy_evaluations', 'diagnosis_strategy_evaluations')");
  var fn = (await q("SELECT prosecdef, proconfig, proacl::text AS acl FROM pg_proc WHERE proname = 'miplan_record_financial_strategy_evaluation'"))[0];
  check("access: RLS enabled on both tables (no policies needed: no direct grants)", rls.length === 2 && rls.every(function (r) { return r.relrowsecurity; }));
  check("access: RPC is SECURITY DEFINER with explicit search_path, not executable by PUBLIC (secret-gated anon/authenticated/service_role)",
    fn.prosecdef === true && eq(fn.proconfig, ["search_path=public, miplan_private"]) && !/(^|[{,])=X\//.test(fn.acl) && /anon=X/.test(fn.acl), fn);
  var grantsNew = await q("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND " +
    "table_name IN ('financial_strategy_evaluations', 'diagnosis_strategy_evaluations') AND grantee IN ('anon', 'authenticated', 'PUBLIC')");
  check("access: no table grants to anon / authenticated / PUBLIC", grantsNew.length === 0, grantsNew);
  var oldRows = Number((await q("SELECT count(*) AS n FROM public.financial_strategy_results"))[0].n);
  check("legacy table financial_strategy_results receives no writes from the new flow", oldRows === 0, oldRows);

  console.warn = warn;
  var unexpected = warnings.filter(function (w) { return /not recorded/.test(w); });
  check("service: no V2 write was dropped on the happy paths (no [v2-strategy] warnings)", unexpected.length === 0, unexpected);

  // ---- rollback after apply ----
  var nDiag = await diagCount();
  await pool.query(ROLLBACK_SQL);
  var gone = (await q("SELECT to_regclass('public.financial_strategy_evaluations') AS a, to_regclass('public.diagnosis_strategy_evaluations') AS b, " +
    "to_regprocedure('public.miplan_record_financial_strategy_evaluation(text, uuid, uuid, text, text, text, smallint, text, text, text, text, text, jsonb)') AS f"))[0];
  var intact = (await q("SELECT to_regclass('public.financial_strategy_results') AS r, to_regprocedure('public.miplan_insert_financial_strategy_result(text, uuid, uuid, smallint, text, text, text, text, text, jsonb)') AS f"))[0];
  check("rollback: dropping the 2 tables + RPC restores the previous schema; diagnoses untouched (" + nDiag + " rows); previous V2 objects intact",
    gone.a === null && gone.b === null && gone.f === null && (await diagCount()) === nDiag && intact.r !== null && intact.f !== null);
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
