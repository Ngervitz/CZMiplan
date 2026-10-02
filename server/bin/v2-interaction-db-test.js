/**
 * server/bin/v2-interaction-db-test.js — V2-CTA-INTERACTION-01, isolated DB harness.
 *
 * Throwaway embedded PostgreSQL 17 (temp dir, loopback, deleted at the end) with every repo migration
 * applied, then 20261001180000_v2_cta_interaction_choices.sql (WRITTEN, NOT APPLIED anywhere else).
 * The real app (HTTP on loopback) runs the real diagnosis / journey / user choice services through an
 * rpc() adapter over node-postgres. Covers: migration safety + literal rollback, JS ↔ SQL parity of
 * expense_categories / mora_debts, RPC authority of the 2 new choice types, vigency, ownership, CHECK
 * backstop, and the HTTP flow of the 7 operative CTA cases (POST diagnosis -> GET state -> POST choices
 * -> GET state with financial_actions / registered progress).
 * Never reads .env / SUPABASE_*; no remote host is ever contacted.
 *
 * node -r ./server/testing/networkTrap.js server/bin/v2-interaction-db-test.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
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
var createUserChoiceService = require("../modules/userChoice/service").createUserChoiceService;
var actionContextModule = require("../modules/diagnosis/actionContext");
var buildActionContext = actionContextModule.buildActionContext;
var projectExpenseCategories = actionContextModule.projectExpenseCategories;
var classifier = require("../../engine/classifier/financial-classifier");
var sweep = require("../testing/actionContextSweep");
var CASES = require("../testing/v2InteractionCases").CASES;

var MIGRATION = "20261001180000_v2_cta_interaction_choices.sql";
var PREVIOUS = "20261001120000_v2_user_choices.sql";
var SECRET = crypto.randomBytes(24).toString("hex");
var TENANT = "miplan-default";
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var ANON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var FAKE_UUID = "12345678-1234-4234-8234-123456789abc";
var VERSION = "financial_action_v1";

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
    reset: function () { sigCache = {}; },
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

/** The deployed backend's call: nine named arguments. */
var CHOICE9_SQL = "SELECT public.miplan_record_user_choice(p_secret => $1, p_anonymous_id => $2, p_evaluation_id => $3::uuid, " +
  "p_diagnosis_id => $4::uuid, p_choice_type => $5, p_debt_index => $6::integer, p_amount => $7::numeric, " +
  "p_reserve_destination => $8, p_lower_payment_state => $9) AS v";
var CHOICE_SQL = "SELECT public.miplan_record_user_choice(p_secret => $1, p_anonymous_id => $2, p_evaluation_id => $3::uuid, " +
  "p_diagnosis_id => $4::uuid, p_choice_type => $5, p_debt_index => $6::integer, p_amount => $7::numeric, " +
  "p_reserve_destination => $8, p_lower_payment_state => $9, p_expense_ref => $10, p_choice_state => $11) AS v";
function opt(v) {
  return v === undefined ? null : v;
}
function choice9Args(o) {
  return [o.secret === undefined ? SECRET : o.secret, o.anon || ANON_A, o.evaluation_id, opt(o.diagnosis_id), o.type,
    opt(o.debt_index), opt(o.amount), opt(o.destination), opt(o.state)];
}
function choiceArgs(o) {
  return choice9Args(o).concat([opt(o.expense_ref), opt(o.choice_state)]);
}
var STATE_SQL = "SELECT public.miplan_get_user_choice_state(p_secret => $1, p_anonymous_id => $2, p_evaluation_id => $3::uuid) AS v";

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

/** Rollback statements of the migration header, executed literally. */
function rollbackSql(migrationSql, previousSql) {
  var lines = migrationSql.split(/\r?\n/);
  var start = lines.findIndex(function (l) { return /^-- ROLLBACK/.test(l); });
  var out = [];
  for (var k = start + 1; k < lines.length && !/^--\s+then re-run/.test(lines[k]); k++) out.push(lines[k].replace(/^--/, ""));
  function block(re) {
    var m = re.exec(previousSql);
    if (!m) throw new Error("rollback block not found: " + re);
    return m[0];
  }
  return [
    out.join("\n"),
    block(/COMMENT ON TABLE public\.financial_strategy_user_choice_events IS[\s\S]*?';/),
    block(/CREATE OR REPLACE FUNCTION public\.miplan_record_user_choice\([\s\S]*?\) TO anon, authenticated, service_role;/),
    block(/CREATE OR REPLACE FUNCTION public\.miplan_get_user_choice_state\([\s\S]*?TO anon, authenticated, service_role;/),
  ].join("\n\n");
}

async function main() {
  var EmbeddedPostgres = (await import(pathToFileURL(path.join(DEPS, "node_modules", "embedded-postgres", "dist", "index.js")).href)).default;
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-interaction-pg-"));
  var port = 54000 + Math.floor(Math.random() * 900);
  var password = crypto.randomBytes(12).toString("hex");
  var server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: password, port: port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: function () {}, onError: function () {} });
  await server.initialise();
  await server.start();
  await server.createDatabase("miplan_isolated");
  var pool = new pg.Pool({ host: "127.0.0.1", port: port, user: "postgres", password: password, database: "miplan_isolated", max: 20 });
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
  console.log("E2E_CASES: " + tagged("[CASE]") + "  PARITY: " + tagged("[parity]") + "  OWNERSHIP: " + tagged("[F]"));
  console.log("V2_INTERACTION_DB_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

async function run(pool) {
  var ver = (await pool.query("SHOW server_version")).rows[0].server_version;
  console.log("isolated PostgreSQL " + ver + " (throwaway cluster)");
  async function q(sql, args) {
    return (await pool.query(sql, args || [])).rows;
  }

  // ---- Supabase environment emulation, then every migration before this one ----
  await pool.query(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" +
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
  var files = fs.readdirSync(path.join(ROOT, "server", "migrations")).filter(function (f) { return /\.sql$/.test(f); }).sort();
  var sqlOf = function (f) { return fs.readFileSync(path.join(ROOT, "server", "migrations", f), "utf8"); };
  check("migration: " + MIGRATION + " is the last migration file and follows " + PREVIOUS,
    files[files.length - 1] === MIGRATION && files.indexOf(PREVIOUS) !== -1 && files.indexOf(PREVIOUS) < files.indexOf(MIGRATION), files.slice(-3));
  for (var i = 0; i < files.length - 1; i++) await pool.query(sqlOf(files[i]));
  await pool.query("INSERT INTO miplan_private.backend_secrets (name, secret) VALUES ('b2_persist', $1)", [SECRET]);

  async function schemaSnapshot() {
    return {
      cols: await q("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND " +
        "table_name = 'financial_strategy_user_choice_events' ORDER BY ordinal_position"),
      cons: await q("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = " +
        "'public.financial_strategy_user_choice_events'::regclass ORDER BY conname"),
      fns: await q("SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, md5(pg_get_functiondef(p.oid)) AS def, " +
        "p.prosecdef, p.proconfig, p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
        "WHERE n.nspname IN ('public', 'miplan_private') ORDER BY 1, 2, 3"),
      triggers: await q("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.financial_strategy_user_choice_events'::regclass AND NOT tgisinternal ORDER BY 1"),
      rls: (await q("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.financial_strategy_user_choice_events'::regclass"))[0].relrowsecurity,
      grants: await q("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND " +
        "table_name = 'financial_strategy_user_choice_events' ORDER BY 1, 2"),
      comment: (await q("SELECT obj_description('public.financial_strategy_user_choice_events'::regclass, 'pg_class') AS c"))[0].c,
    };
  }
  async function counts() {
    return (await q("SELECT (SELECT count(*) FROM public.financial_strategy_user_choice_events)::int AS choices, " +
      "(SELECT count(*) FROM public.debt_management_opt_in_events)::int AS opt_ins, (SELECT count(*) FROM public.diagnoses)::int AS diagnoses, " +
      "(SELECT count(*) FROM public.financial_strategy_evaluations)::int AS evaluations, (SELECT count(*) FROM public.journeys)::int AS journeys, " +
      "(SELECT count(*) FROM public.diagnosis_strategy_evaluations)::int AS links"))[0];
  }

  // ---- real services over the rpc() adapter (works before and after the migration) ----
  var client = makeRpcClient(pool);
  var journeyService = createJourneyService({ repository: createJourneyRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }), tenantId: TENANT });
  var diagRepo = createDiagnosisRepository({ client: client, backendSecret: SECRET, tenantId: TENANT });
  var svc = createDiagnosisService({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService });
  var BUMP = "miplan-financial-classifier-shadow-03-test";
  var bumped = createDiagnosisService({ repository: diagRepo, tenantId: TENANT, journeyService: journeyService,
    classifyFn: function (ei) { return Object.assign(classifier.classifyFinancialShadow(ei), { classifier_version: BUMP }); } });
  var ucService = createUserChoiceService({ repository: createUserChoiceRepository({ client: client, backendSecret: SECRET }), interactionEnabled: true });
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
      diagnose: function (anon, journeyId, input) {
        return request(PORT, "POST", "/v1/diagnoses", Object.assign(clone(input), { journey_id: journeyId }), anon);
      },
      stateByDiagnosis: function (anon, diagnosisId) { return request(PORT, "GET", "/v1/diagnoses/" + diagnosisId + "/user-choices", undefined, anon); },
      state: function (anon, evaluationId) { return request(PORT, "GET", "/v1/evaluations/" + evaluationId + "/user-choices", undefined, anon); },
      choose: function (anon, evaluationId, body) { return request(PORT, "POST", "/v1/evaluations/" + evaluationId + "/user-choices", body, anon); },
    };
    async function evaluationFor(anon, journeyId, input, label) {
      var d = await api.diagnose(anon, journeyId, input);
      if (d.status !== 200 || !d.body.v2_financial_strategy) throw new Error("fixture " + label + ": diagnosis failed " + d.raw.slice(0, 300));
      var s = await api.stateByDiagnosis(anon, d.body.diagnosis_id);
      if (s.status !== 200) throw new Error("fixture " + label + ": state failed " + s.raw.slice(0, 300));
      return { diagnosis: d.body, diagnosis_id: d.body.diagnosis_id, evaluation_id: s.body.evaluation_id, state: s.body };
    }
    async function history(evaluationId, slot) {
      return q("SELECT * FROM public.financial_strategy_user_choice_events WHERE evaluation_id = $1 AND slot_key = $2 ORDER BY seq", [evaluationId, slot]);
    }
    function chainValid(rows) {
      return rows.every(function (r, k) {
        return r.seq === k + 1 && (k === 0 ? r.supersedes_event_id === null && r.supersedes_seq === null
          : r.supersedes_event_id === rows[k - 1].event_id && r.supersedes_seq === k);
      });
    }
    function caseOf(id) {
      return CASES.filter(function (c) { return c.id === id; })[0];
    }
    function ert(strategy, ref, current, target) {
      return { action_type: "EXPENSE_REDUCTION_TARGET", action_version: VERSION, strategy: strategy, source_choice_type: "expense_reduction_intent",
        params: { expense_ref: ref, current_amount: current, target_reduction: target } };
    }
    var debt = sweep.debt;
    var JA = (await journeyService.createFromHandoffRedeem(ANON_A, "interaction-a", clone(e2e.RAW_CONTEXTS.V2))).journey_id;
    await journeyService.createFromHandoffRedeem(ANON_B, "interaction-b", clone(e2e.RAW_CONTEXTS.V2));

    // ---- [M] migration on a database that already holds original-type choices ----
    var legacy = await evaluationFor(ANON_A, JA, caseOf("CONTENCION_WITH_DEBT").input, "legacy before migration");
    var legacyCons = await evaluationFor(ANON_A, JA, caseOf("CONSOLIDACION").input, "legacy consolidacion before migration");
    await pool.query(CHOICE9_SQL, choice9Args({ evaluation_id: legacy.evaluation_id, type: "lower_payment_intent", debt_index: 0, state: "marked" }));
    await pool.query(CHOICE9_SQL, choice9Args({ evaluation_id: legacyCons.evaluation_id, type: "surplus_reserve", destination: "emergency_fund", amount: 1000 }));
    var preState = (await api.state(ANON_A, legacy.evaluation_id)).body;
    var before = await schemaSnapshot();
    var beforeCounts = await counts();

    var migrationSql = sqlOf(MIGRATION);
    var topLevelSql = migrationSql.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--[^\n]*/g, "");
    var drops = (topLevelSql.match(/DROP\s+\w+\s+(IF EXISTS\s+)?[\w.]+(\([^)]*\))?/g) || []).map(function (s) { return s.replace(/\s+/g, " "); });
    var alters = (topLevelSql.match(/ALTER TABLE\s+[\w.]+/g) || []).map(function (s) { return s.replace(/ALTER TABLE\s+/, ""); });
    check("[M] scope: ALTER TABLE only on financial_strategy_user_choice_events; top-level DROPs only the 3 widened CHECKs and the 9-argument " +
      "record RPC it replaces; no CREATE TABLE, no UPDATE / INSERT / DELETE",
      alters.every(function (t) { return t === "public.financial_strategy_user_choice_events"; }) && alters.length === 2 &&
      eq(drops.sort(), [
        "DROP CONSTRAINT IF EXISTS fs_user_choice_events_payload_check",
        "DROP CONSTRAINT IF EXISTS fs_user_choice_events_slot_check",
        "DROP CONSTRAINT IF EXISTS fs_user_choice_events_type_check",
        "DROP FUNCTION IF EXISTS public.miplan_record_user_choice(text, text, uuid, uuid, text, integer, numeric, text, text)",
      ]) && !/CREATE TABLE/i.test(topLevelSql) && !/^\s*(UPDATE|INSERT|DELETE\s+FROM)\b/im.test(topLevelSql), { drops: drops, alters: alters });

    var admin = await pool.connect();
    await admin.query("BEGIN");
    await admin.query(migrationSql);
    await admin.query("ROLLBACK");
    admin.release();
    check("[M] applies inside a transaction and ROLLBACK leaves the schema exactly as before", eq(await schemaSnapshot(), before));
    await pool.query(migrationSql);
    var afterFirst = await schemaSnapshot();
    await pool.query(migrationSql);
    client.reset();
    check("[M] re-applying is a no-op (same schema after the second run)", eq(await schemaSnapshot(), afterFirst));
    var overloads = await q("SELECT pg_get_function_identity_arguments(p.oid) AS args, p.pronargdefaults AS ndef, p.prosecdef, p.proconfig, " +
      "p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'miplan_record_user_choice'");
    check("[M] exactly one miplan_record_user_choice: 11 arguments, the 2 new ones DEFAULT NULL; SECURITY DEFINER, pinned search_path, no PUBLIC EXECUTE",
      overloads.length === 1 && /p_expense_ref text, p_choice_state text$/.test(overloads[0].args) && overloads[0].ndef === 2 &&
      overloads[0].prosecdef === true && eq(overloads[0].proconfig, ["search_path=public, miplan_private"]) &&
      !/(^|[{,])=X\//.test(overloads[0].acl) && /anon=X/.test(overloads[0].acl), overloads);
    var postState = (await api.state(ANON_A, legacy.evaluation_id)).body;
    var legacyRows = await q("SELECT choice_type, expense_ref, choice_state FROM public.financial_strategy_user_choice_events ORDER BY created_at");
    check("[M] existing rows are kept and satisfy the widened CHECKs (new columns NULL); their read state is unchanged plus the new fields",
      eq(await counts(), beforeCounts) && legacyRows.length === 2 &&
      legacyRows.every(function (r) { return r.expense_ref === null && r.choice_state === null; }) &&
      eq(postState.choices.lower_payment_intent, preState.choices.lower_payment_intent) &&
      eq(postState.choices.surplus_allocation, preState.choices.surplus_allocation) &&
      eq(preState.choices.expense_reduction_intent, []) && postState.choices.expense_reduction_intent.length === 1, { pre: preState, post: postState });
    var after = await schemaSnapshot();
    var newCons = after.cons.filter(function (c) { return /type_check|payload_check|slot_check/.test(c.conname); }).map(function (c) { return c.conname; });
    var CHANGED_FNS = ["miplan_record_user_choice", "miplan_get_user_choice_state", "v2_expense_value", "v2_expense_categories", "v2_interaction_authority"];
    var untouched = {
      triggers: eq(after.triggers, before.triggers),
      rls: after.rls === true,
      grants: eq(after.grants, before.grants) && after.grants.every(function (g) { return ["anon", "authenticated", "PUBLIC"].indexOf(g.grantee) === -1; }),
      cons: eq(after.cons.filter(function (c) { return newCons.indexOf(c.conname) === -1; }), before.cons.filter(function (c) { return newCons.indexOf(c.conname) === -1; })),
      fns: eq(after.fns.filter(function (f) { return CHANGED_FNS.indexOf(f.proname) === -1; }), before.fns.filter(function (f) { return CHANGED_FNS.indexOf(f.proname) === -1; })),
      getAcl: eq(after.fns.filter(function (f) { return f.proname === "miplan_get_user_choice_state"; }).map(function (f) { return [f.args, f.acl, f.prosecdef, f.proconfig]; }),
        before.fns.filter(function (f) { return f.proname === "miplan_get_user_choice_state"; }).map(function (f) { return [f.args, f.acl, f.prosecdef, f.proconfig]; })),
    };
    check("[M] append-only triggers, RLS, table grants, every untouched constraint / function, and the read RPC's signature / ACL are identical to before",
      Object.keys(untouched).every(function (k) { return untouched[k]; }), { untouched: untouched, before: before.triggers, after: after.triggers });

    // literal rollback (header), only valid while no new-type row exists, then clean re-apply
    var rollback = rollbackSql(migrationSql, sqlOf(PREVIOUS));
    await pool.query(rollback);
    client.reset();
    var rolledBack = await schemaSnapshot();
    var rbState = (await api.state(ANON_A, legacy.evaluation_id)).body;
    check("[M] the header ROLLBACK, executed literally, restores the exact previous schema (columns, constraints, functions, ACLs, comment) " +
      "and keeps every row; the previous read works", eq(rolledBack, before) && eq(await counts(), beforeCounts) &&
      eq(rbState.choices.lower_payment_intent, preState.choices.lower_payment_intent), { diffFns: rolledBack.fns.length + " vs " + before.fns.length });
    await pool.query(migrationSql);
    client.reset();
    check("[M] the migration re-applies cleanly after the rollback", eq(await schemaSnapshot(), afterFirst));

    var leakKeys = ["result", "canonical_facts", "input_snapshot", "debts", "canonical_flow", "monthly_income", "anonymous_id", "journey_id",
      "seq", "event_id", "supersedes_event_id", "slot_key", "classifier_version", "financial_input_identity", "origin_expense_input", "authority",
      "gastos", "custom_expenses", "description", "label"];

    // ---- [CASE] the 7 operative CTA cases over HTTP ----
    var progress = {};
    async function finalState(ev) {
      return (await api.state(ANON_A, ev.evaluation_id)).body;
    }
    function hasProgress(s) {
      return s.financial_actions.length > 0 || s.choices.creditor_contact_step.some(function (c) { return c.state !== "none"; });
    }

    // 1. CONTENCION without eligible debt
    var c1 = await evaluationFor(ANON_A, JA, caseOf("CONTENCION_NO_ELIGIBLE_DEBT").input, "case 1");
    var w1a = await api.choose(ANON_A, c1.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 5000, diagnosis_id: c1.diagnosis_id });
    var w1b = await api.choose(ANON_A, c1.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "custom:1", state: "marked", amount: "3000" });
    var s1a = await finalState(c1);
    check("[CASE] 1 CONTENCION without eligible debt: expense widget data (vivienda 40000, alimentacion 12000, custom:1 3000), no lower-payment debt; " +
      "two marked intents -> two EXPENSE_REDUCTION_TARGET (declared, never achieved)",
      c1.state.strategy === "CONTENCION" && eq(Object.keys(c1.state.action_context), ["monthly_gap", "active_debts", "expense_categories"]) &&
      eq(c1.state.action_context.expense_categories, [{ expense_ref: "vivienda", amount: 40000 }, { expense_ref: "alimentacion", amount: 12000 },
        { expense_ref: "custom:1", amount: 3000 }]) && eq(c1.state.choices.lower_payment_intent, []) && eq(c1.state.financial_actions, []) &&
      c1.state.choices.expense_reduction_intent.every(function (x) { return x.state === "unmarked" && x.amount === null; }) &&
      w1a.status === 200 && w1a.body.appended === true && w1a.body.current.state === "marked" && w1a.body.current.amount === 5000 &&
      w1b.status === 200 && w1b.body.current.expense_ref === "custom:1" &&
      eq(s1a.financial_actions, [ert("CONTENCION", "vivienda", 40000, 5000), ert("CONTENCION", "custom:1", 3000, 3000)]) &&
      eq(s1a.choices.expense_reduction_intent.map(function (x) { return [x.expense_ref, x.state, x.amount]; }),
        [["vivienda", "marked", 5000], ["alimentacion", "unmarked", null], ["custom:1", "marked", 3000]]),
    { state: c1.state, w1a: w1a.body, w1b: w1b.body, s1a: s1a });
    var w1c = await api.choose(ANON_A, c1.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "custom:1", state: "unmarked" });
    var s1 = await finalState(c1);
    var h1 = await history(c1.evaluation_id, "expense_reduction:custom:1");
    check("[CASE] 1 withdrawing an intent (unmarked) removes its action; history keeps [marked 3000, unmarked] as a chain",
      w1c.status === 200 && w1c.body.appended === true && w1c.body.current.state === "unmarked" && w1c.body.current.amount === null &&
      eq(s1.financial_actions, [ert("CONTENCION", "vivienda", 40000, 5000)]) &&
      eq(h1.map(function (r) { return [r.choice_state, r.amount === null ? null : Number(r.amount)]; }), [["marked", 3000], ["unmarked", null]]) && chainValid(h1) &&
      h1[0].origin_diagnosis_id === null && (await history(c1.evaluation_id, "expense_reduction:vivienda"))[0].origin_diagnosis_id === c1.diagnosis_id,
    { s1: s1, h1: h1 });
    progress.CONTENCION_NO_ELIGIBLE_DEBT = hasProgress(s1);

    // 2. MANTENIMIENTO, surplus = 0
    var c2 = await evaluationFor(ANON_A, JA, caseOf("MANTENIMIENTO_FLOW_ZERO").input, "case 2");
    var w2 = await api.choose(ANON_A, c2.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "alimentacion", amount: 2000 });
    var w2r = await api.choose(ANON_A, c2.evaluation_id, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 1 });
    var s2 = await finalState(c2);
    check("[CASE] 2 MANTENIMIENTO surplus 0: same expense widget (vivienda 30000, alimentacion 20000) -> EXPENSE_REDUCTION_TARGET; no surplus to reserve (422)",
      c2.state.strategy === "MANTENIMIENTO_OPTIMIZACION" && c2.state.action_context.monthly_surplus === null &&
      eq(c2.state.action_context.expense_categories, [{ expense_ref: "vivienda", amount: 30000 }, { expense_ref: "alimentacion", amount: 20000 }]) &&
      w2.status === 200 && w2.body.appended === true && w2r.status === 422 && w2r.body.error === "SURPLUS_NOT_AVAILABLE" &&
      eq(s2.financial_actions, [ert("MANTENIMIENTO_OPTIMIZACION", "alimentacion", 20000, 2000)]) && s2.choices.surplus_allocation === null,
    { state: c2.state, w2: w2.body, w2r: w2r.body, s2: s2 });
    progress.MANTENIMIENTO_FLOW_ZERO = hasProgress(s2);

    // 3. CONTENCION with eligible debt: two levers
    var c3 = await evaluationFor(ANON_A, JA, Object.assign(clone(caseOf("CONTENCION_WITH_DEBT").input), { ingreso: 50001 }), "case 3");
    var w3a = await api.choose(ANON_A, c3.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var w3b = await api.choose(ANON_A, c3.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 4000 });
    var s3 = await finalState(c3);
    check("[CASE] 3 CONTENCION with eligible debt: lower payment (debt 0, 15000) and expense widget (vivienda 40000) both offered; " +
      "both chosen -> LOWER_PAYMENT_REQUEST + EXPENSE_REDUCTION_TARGET",
      c3.state.strategy === "CONTENCION" && eq(c3.state.choices.lower_payment_intent.map(function (x) { return [x.debt_index, x.state]; }), [[0, "unmarked"]]) &&
      eq(c3.state.action_context.expense_categories, [{ expense_ref: "vivienda", amount: 40000 }]) &&
      w3a.status === 200 && w3b.status === 200 &&
      eq(s3.financial_actions, [
        { action_type: "LOWER_PAYMENT_REQUEST", action_version: VERSION, strategy: "CONTENCION", source_choice_type: "lower_payment_intent",
          params: { debt_index: 0, monthly_debt_payment: 15000 } },
        ert("CONTENCION", "vivienda", 40000, 4000)]), { state: c3.state, s3: s3 });
    progress.CONTENCION_WITH_DEBT = hasProgress(s3);

    // 4. REGULARIZACION: creditor contact step
    var c4 = await evaluationFor(ANON_A, JA, caseOf("REGULARIZACION").input, "case 4");
    var w4none = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "none" });
    var w4p = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned", diagnosis_id: c4.diagnosis_id });
    var s4p = await finalState(c4);
    var w4c = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "contacted" });
    var w4c2 = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "contacted" });
    var w4n = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "none" });
    var s4n = await finalState(c4);
    var w4back = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "contacted" });
    var s4 = await finalState(c4);
    var h4 = await history(c4.evaluation_id, "creditor_contact:0");
    check("[CASE] 4 REGULARIZACION: mora debt 0 listed (state none); none without a step appends nothing; planned -> contacted -> (same, no-op) -> " +
      "none (withdrawn) -> contacted, as a chain; registered progress, never a financial action",
      c4.state.strategy === "REGULARIZACION" && eq(c4.state.action_context, { mora_debts: [{ debt_index: 0 }] }) &&
      eq(c4.state.choices.creditor_contact_step, [{ debt_index: 0, state: "none", updated_at: null }]) &&
      eq(c4.state.choices.expense_reduction_intent, []) && eq(c4.state.choices.lower_payment_intent, []) &&
      w4none.status === 200 && w4none.body.appended === false && w4none.body.current === null &&
      w4p.status === 200 && w4p.body.appended === true && w4p.body.current.state === "planned" && s4p.choices.creditor_contact_step[0].state === "planned" &&
      w4c.body.appended === true && w4c2.body.appended === false && w4n.body.appended === true && s4n.choices.creditor_contact_step[0].state === "none" &&
      s4n.choices.creditor_contact_step[0].updated_at === null && w4back.body.appended === true &&
      s4.choices.creditor_contact_step[0].state === "contacted" && typeof s4.choices.creditor_contact_step[0].updated_at === "string" &&
      eq(h4.map(function (r) { return r.choice_state; }), ["planned", "contacted", "none", "contacted"]) && chainValid(h4) &&
      h4[0].origin_diagnosis_id === c4.diagnosis_id && [s4p, s4n, s4].every(function (s) { return eq(s.financial_actions, []); }),
    { state: c4.state, h4: h4.map(function (r) { return r.choice_state; }), s4: s4 });
    var w4exp = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 100 });
    var w4idx = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 1, state: "planned" });
    var w4bad = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "agreed" });
    var w4miss = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0 });
    var w4amt = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned", amount: 10 });
    check("[CASE] 4 REGULARIZACION: no expense widget (422 EXPENSE_NOT_ELIGIBLE); non-mora index -> 422 DEBT_NOT_ELIGIBLE; " +
      "states beyond planned / contacted / none ('agreed'), missing state or a foreign amount -> 400",
      w4exp.status === 422 && w4exp.body.error === "EXPENSE_NOT_ELIGIBLE" && w4idx.status === 422 && w4idx.body.error === "DEBT_NOT_ELIGIBLE" &&
      [w4bad, w4miss, w4amt].every(function (r) { return r.status === 400 && r.body.error === "INVALID_CHOICE_PAYLOAD"; }),
    [w4exp.body, w4idx.body, w4bad.body, w4miss.body, w4amt.body]);
    progress.REGULARIZACION = hasProgress(s4);

    // 5. REDUCCION_CARGA
    var c5 = await evaluationFor(ANON_A, JA, caseOf("REDUCCION_CARGA").input, "case 5");
    var w5 = await api.choose(ANON_A, c5.evaluation_id, { choice_type: "lower_payment_intent", debt_index: 0 });
    var w5e = await api.choose(ANON_A, c5.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 100 });
    var w5c = await api.choose(ANON_A, c5.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" });
    var s5 = await finalState(c5);
    check("[CASE] 5 REDUCCION_CARGA: lower_payment_intent on debt 0 -> LOWER_PAYMENT_REQUEST (60000); no expense widget, no contact step (422)",
      c5.state.strategy === "REDUCCION_CARGA" && !("expense_categories" in c5.state.action_context) && w5.status === 200 &&
      w5e.status === 422 && w5e.body.error === "EXPENSE_NOT_ELIGIBLE" && w5c.status === 422 && w5c.body.error === "DEBT_NOT_ELIGIBLE" &&
      eq(s5.financial_actions, [{ action_type: "LOWER_PAYMENT_REQUEST", action_version: VERSION, strategy: "REDUCCION_CARGA",
        source_choice_type: "lower_payment_intent", params: { debt_index: 0, monthly_debt_payment: 60000 } }]) &&
      eq(s5.choices.expense_reduction_intent, []) && eq(s5.choices.creditor_contact_step, []), { state: c5.state, s5: s5, w5e: w5e.body, w5c: w5c.body });
    progress.REDUCCION_CARGA = hasProgress(s5);

    // 6. CONSOLIDACION
    var c6 = await evaluationFor(ANON_A, JA, Object.assign(clone(caseOf("CONSOLIDACION").input), { ingreso: 100001 }), "case 6");
    var w6a = await api.choose(ANON_A, c6.evaluation_id, { choice_type: "surplus_to_debt", debt_index: 0, amount: 20000 });
    var s6a = await finalState(c6);
    var w6b = await api.choose(ANON_A, c6.evaluation_id, { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 60001 });
    var s6 = await finalState(c6);
    var w6e = await api.choose(ANON_A, c6.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 100 });
    check("[CASE] 6 CONSOLIDACION: surplus_to_debt -> EXTRA_DEBT_PAYMENT; a later surplus_reserve (= surplus) replaces it -> MONTHLY_RESERVE; no expense widget",
      c6.state.strategy === "CONSOLIDACION" && c6.state.action_context.monthly_surplus.amount === 60001 && w6a.status === 200 && w6b.status === 200 &&
      eq(s6a.financial_actions, [{ action_type: "EXTRA_DEBT_PAYMENT", action_version: VERSION, strategy: "CONSOLIDACION",
        source_choice_type: "surplus_to_debt", params: { debt_index: 0, amount: 20000 } }]) &&
      eq(s6.financial_actions, [{ action_type: "MONTHLY_RESERVE", action_version: VERSION, strategy: "CONSOLIDACION",
        source_choice_type: "surplus_reserve", params: { destination: "emergency_fund", amount: 60001 } }]) &&
      w6e.status === 422 && w6e.body.error === "EXPENSE_NOT_ELIGIBLE", { state: c6.state, s6a: s6a, s6: s6 });
    progress.CONSOLIDACION = hasProgress(s6);

    // 7. MANTENIMIENTO, surplus > 0
    var c7 = await evaluationFor(ANON_A, JA, caseOf("MANTENIMIENTO_SURPLUS").input, "case 7");
    var w7 = await api.choose(ANON_A, c7.evaluation_id, { choice_type: "surplus_reserve", destination: "planned_goal", amount: 20000 });
    var w7e = await api.choose(ANON_A, c7.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 100 });
    var s7 = await finalState(c7);
    check("[CASE] 7 MANTENIMIENTO surplus 60000: surplus_reserve -> MONTHLY_RESERVE; the expense widget is not offered (no expense_categories, 422)",
      c7.state.strategy === "MANTENIMIENTO_OPTIMIZACION" && c7.state.action_context.monthly_surplus.amount === 60000 &&
      !("expense_categories" in c7.state.action_context) && w7.status === 200 && w7e.status === 422 && w7e.body.error === "EXPENSE_NOT_ELIGIBLE" &&
      eq(s7.financial_actions, [{ action_type: "MONTHLY_RESERVE", action_version: VERSION, strategy: "MANTENIMIENTO_OPTIMIZACION",
        source_choice_type: "surplus_reserve", params: { destination: "planned_goal", amount: 20000 } }]), { state: c7.state, s7: s7 });
    progress.MANTENIMIENTO_SURPLUS = hasProgress(s7);

    check("[CASE] every case ends in a financial action or a registered step (no dead end) " + JSON.stringify(progress),
      CASES.every(function (c) { return progress[c.id] === true; }), progress);
    var publicKeys = walkKeys([s1, s2, s3, s4, s5, s6, s7], []);
    check("[CASE] public states never expose internal ids, the stored result, the snapshot, expense descriptions or the action authority",
      leakKeys.every(function (k) { return publicKeys.indexOf(k) === -1; }), publicKeys.filter(function (k) { return leakKeys.indexOf(k) !== -1; }));
    check("[CASE] POST /v1/diagnoses keeps v2_action_context result-only (no expense_categories) and 7 strategy keys",
      !("expense_categories" in c1.diagnosis.v2_action_context) && Object.keys(c1.diagnosis.v2_financial_strategy).length === 7 &&
      eq(c1.diagnosis.v2_action_context, buildActionContext(classifier.classifyFinancialShadow(clone(caseOf("CONTENCION_NO_ELIGIBLE_DEBT").input)))),
    c1.diagnosis.v2_action_context);

    // ---- [A] expense_reduction_intent authority ----
    var E1 = c1.evaluation_id;
    var aEq = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "alimentacion", amount: 12000 });
    var aOver = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "alimentacion", amount: 12000.01 });
    var aZero = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "alimentacion", amount: 0 });
    var aNeg = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "alimentacion", amount: -1 });
    var aScale = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "alimentacion", amount: 1.234 });
    var aMissing = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "alimentacion" });
    check("[A] amount = current expense (12000) accepted; > current (12000.01), 0 and negative -> 422 AMOUNT_OUT_OF_RANGE; " +
      "3 decimals / missing amount on a mark -> 400 INVALID_AMOUNT",
      aEq.status === 200 && aEq.body.current.amount === 12000 &&
      [aOver, aZero, aNeg].every(function (r) { return r.status === 422 && r.body.error === "AMOUNT_OUT_OF_RANGE"; }) &&
      [aScale, aMissing].every(function (r) { return r.status === 400 && r.body.error === "INVALID_AMOUNT"; }),
    [aEq.body, aOver.body, aZero.body, aNeg.body, aScale.body, aMissing.body]);
    var aUnknown = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "otros", amount: 1 });
    var aCustom0 = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "custom:0", amount: 1 });
    var aAbsent = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "salud", amount: 1 });
    var aAbsentCustom = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "custom:2", amount: 1 });
    var aForged = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "salud", amount: 1,
      expense_categories: [{ expense_ref: "salud", amount: 99999 }], current_amount: 99999, action_context: { expense_categories: [{ expense_ref: "salud", amount: 99999 }] } });
    var aUnmarkAmount = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", state: "unmarked", amount: 5 });
    var aDebtIdx = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 5, debt_index: 0 });
    var aState = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 5, state: "achieved" });
    check("[A] unknown refs ('otros', 'custom:0') -> 400 INVALID_EXPENSE_REF; well-formed refs absent from the authorized snapshot ('salud', 'custom:2') " +
      "-> 422 EXPENSE_NOT_ELIGIBLE, also with forged categories / current_amount in the body; unmarked + amount, debt_index, state 'achieved' -> 400",
      [aUnknown, aCustom0].every(function (r) { return r.status === 400 && r.body.error === "INVALID_EXPENSE_REF"; }) &&
      [aAbsent, aAbsentCustom, aForged].every(function (r) { return r.status === 422 && r.body.error === "EXPENSE_NOT_ELIGIBLE"; }) &&
      [aUnmarkAmount, aDebtIdx, aState].every(function (r) { return r.status === 400 && r.body.error === "INVALID_CHOICE_PAYLOAD"; }),
    [aUnknown.body, aCustom0.body, aAbsent.body, aAbsentCustom.body, aForged.body, aUnmarkAmount.body, aDebtIdx.body, aState.body]);
    var rpcNoAmount = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: E1, type: "expense_reduction_intent", expense_ref: "vivienda", choice_state: "marked" })));
    var rpcBadRef = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: E1, type: "expense_reduction_intent", expense_ref: "Vivienda", choice_state: "marked", amount: 1 })));
    var rpcOver = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: E1, type: "expense_reduction_intent", expense_ref: "vivienda", choice_state: "marked", amount: "40000.01" })));
    var rpcScale = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: E1, type: "expense_reduction_intent", expense_ref: "vivienda", choice_state: "marked", amount: "1.001" })));
    var rpcAbsent = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: E1, type: "expense_reduction_intent", expense_ref: "ocio", choice_state: "marked", amount: 1 })));
    var rpcLowerState = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: E1, type: "expense_reduction_intent", expense_ref: "vivienda", state: "marked", amount: 1 })));
    var rpcOldWithNew = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: c3.evaluation_id, type: "lower_payment_intent", debt_index: 0, state: "marked", choice_state: "marked" })));
    var rpcOldWithRef = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: c6.evaluation_id, type: "surplus_reserve", destination: "planned_goal", amount: 1, expense_ref: "vivienda" })));
    check("[A] the RPC enforces the same rules without the service layer (INVALID_CHOICE_PAYLOAD, INVALID_EXPENSE_REF, AMOUNT_OUT_OF_RANGE, " +
      "INVALID_AMOUNT, EXPENSE_NOT_ELIGIBLE); original types reject the new parameters",
      /INVALID_CHOICE_PAYLOAD/.test(rpcNoAmount || "") && /INVALID_EXPENSE_REF/.test(rpcBadRef || "") && /AMOUNT_OUT_OF_RANGE/.test(rpcOver || "") &&
      /INVALID_AMOUNT/.test(rpcScale || "") && /EXPENSE_NOT_ELIGIBLE/.test(rpcAbsent || "") && /INVALID_CHOICE_PAYLOAD/.test(rpcLowerState || "") &&
      /INVALID_CHOICE_PAYLOAD/.test(rpcOldWithNew || "") && /INVALID_CHOICE_PAYLOAD/.test(rpcOldWithRef || ""),
    [rpcNoAmount, rpcBadRef, rpcOver, rpcScale, rpcAbsent, rpcLowerState, rpcOldWithNew, rpcOldWithRef]);
    var aSame = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: "5000.00" });
    var aNever = await api.choose(ANON_A, c2.evaluation_id, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", state: "unmarked" });
    var aChange = await api.choose(ANON_A, E1, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 6000 });
    var hV = await history(E1, "expense_reduction:vivienda");
    check("[A] idempotent: re-marking the same amount and unmarking a never-marked expense append nothing; a new amount appends (seq 2)",
      aSame.status === 200 && aSame.body.appended === false && aNever.status === 200 && aNever.body.appended === false && aNever.body.current === null &&
      aChange.body.appended === true && eq(hV.map(function (r) { return Number(r.amount); }), [5000, 6000]) && chainValid(hV) &&
      (await history(c2.evaluation_id, "expense_reduction:vivienda")).length === 0, hV);
    var wrongState = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ evaluation_id: c7.evaluation_id, type: "expense_reduction_intent", expense_ref: "vivienda", choice_state: "marked", amount: 1 })));
    var cons9 = await pool.query(CHOICE9_SQL, choice9Args({ evaluation_id: c6.evaluation_id, type: "surplus_reserve", destination: "planned_goal", amount: 100 }));
    var low9 = await pool.query(CHOICE9_SQL, choice9Args({ evaluation_id: c5.evaluation_id, type: "lower_payment_intent", debt_index: 0, state: "unmarked" }));
    check("[A] MANTENIMIENTO with surplus rejects expenses at the RPC; the deployed backend's nine-argument named call still records the original types",
      /EXPENSE_NOT_ELIGIBLE/.test(wrongState || "") && cons9.rows[0].v.appended === true && cons9.rows[0].v.current.expense_ref === null &&
      low9.rows[0].v.appended === true, { wrongState: wrongState, cons9: cons9.rows[0].v });

    // ---- [E] vigency: reuse keeps choices, a new identity / classifier version starts empty, no remapping ----
    var reuseInput = clone(caseOf("CONTENCION_NO_ELIGIBLE_DEBT").input);
    reuseInput.custom_expenses = [{ id: "z9", label: "Otra descripcion", amount: "3000.00", included: true }, { id: "z0", label: "vacio", amount: "" }];
    reuseInput.gastos = { alimentacion: "12000", vivienda: 40000 };
    var sBeforeReuse = await finalState(c1);
    var reuseD = await api.diagnose(ANON_A, JA, reuseInput);
    var sReuse = (await api.stateByDiagnosis(ANON_A, reuseD.body.diagnosis_id)).body;
    check("[E] same financial identity written differently (custom label, '3000.00', blank custom, key order) -> same evaluation, same categories, " +
      "every intent and action still current",
      reuseD.status === 200 && reuseD.body.diagnosis_id !== c1.diagnosis_id && sReuse.evaluation_id === E1 &&
      eq(sReuse.action_context, sBeforeReuse.action_context) && eq(sReuse.choices, sBeforeReuse.choices) &&
      eq(sReuse.financial_actions, sBeforeReuse.financial_actions) && sReuse.financial_actions.length === 2, { sReuse: sReuse, before: sBeforeReuse });
    var shifted = clone(caseOf("CONTENCION_NO_ELIGIBLE_DEBT").input);
    shifted.custom_expenses = [{ amount: 700 }].concat(shifted.custom_expenses);
    var cShift = await evaluationFor(ANON_A, JA, shifted, "custom shift");
    check("[E] a new custom expense in front -> new identity -> new evaluation: custom:1 is now 700, custom:2 3000, and no intent is carried over or remapped",
      cShift.evaluation_id !== E1 && eq(cShift.state.action_context.expense_categories.slice(-2), [{ expense_ref: "custom:1", amount: 700 }, { expense_ref: "custom:2", amount: 3000 }]) &&
      cShift.state.choices.expense_reduction_intent.every(function (x) { return x.state === "unmarked"; }) && eq(cShift.state.financial_actions, []),
    cShift.state);
    var regNew = await evaluationFor(ANON_A, JA, Object.assign(clone(caseOf("REGULARIZACION").input), { ingreso: 100001 }), "regularizacion new identity");
    var bumpedDiag = await bumped.createDiagnosis({ anonymousId: ANON_A, body: Object.assign(clone(caseOf("REGULARIZACION").input), { journey_id: JA }) });
    var sBump = (await api.stateByDiagnosis(ANON_A, bumpedDiag.diagnosis_id)).body;
    check("[E] REGULARIZACION: a new identity or a classifier_version bump -> new evaluation with every contact step back to none; the original keeps 'contacted'",
      regNew.evaluation_id !== c4.evaluation_id && eq(regNew.state.choices.creditor_contact_step, [{ debt_index: 0, state: "none", updated_at: null }]) &&
      sBump.evaluation_id !== c4.evaluation_id && sBump.choices.creditor_contact_step.every(function (x) { return x.state === "none"; }) &&
      (await finalState(c4)).choices.creditor_contact_step[0].state === "contacted", { regNew: regNew.state.choices, sBump: sBump.choices });

    // ---- [F] ownership ----
    var cBefore = await counts();
    var fRead = await api.state(ANON_B, E1);
    var fExp = await api.choose(ANON_B, E1, { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 1 });
    var fCon = await api.choose(ANON_B, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "none" });
    var fFake = await api.choose(ANON_A, FAKE_UUID, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" });
    var fProv = await api.choose(ANON_A, c4.evaluation_id, { choice_type: "creditor_contact_step", debt_index: 0, state: "planned", diagnosis_id: c1.diagnosis_id });
    check("[F] another owner cannot read or write expense intents / contact steps; a fabricated evaluation -> same 404; a diagnosis of another evaluation " +
      "-> 404 DIAGNOSIS_NOT_LINKED; nothing written",
      fRead.status === 404 && fExp.status === 404 && fExp.body.error === "EVALUATION_NOT_FOUND" && fCon.status === 404 &&
      fFake.status === 404 && fFake.raw === fCon.raw && fProv.status === 404 && fProv.body.error === "DIAGNOSIS_NOT_LINKED" && eq(await counts(), cBefore),
    [fRead.body, fExp.body, fCon.body, fFake.body, fProv.body]);
    var fSecret = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ secret: "wrong", evaluation_id: E1, type: "expense_reduction_intent", expense_ref: "vivienda", choice_state: "marked", amount: 1 })));
    var fOwner = await errorOf(pool.query(CHOICE_SQL, choiceArgs({ anon: ANON_B, evaluation_id: c4.evaluation_id, type: "creditor_contact_step", debt_index: 0, choice_state: "planned" })));
    var fReadRpc = await errorOf(pool.query(STATE_SQL, [SECRET, ANON_B, E1]));
    check("[F] RPC level: wrong secret -> MIPLAN_UNAUTHORIZED; right secret, wrong owner -> EVALUATION_NOT_FOUND (write and read)",
      /MIPLAN_UNAUTHORIZED/.test(fSecret || "") && /EVALUATION_NOT_FOUND/.test(fOwner || "") && /EVALUATION_NOT_FOUND/.test(fReadRpc || ""), [fSecret, fOwner, fReadRpc]);
    var denied = [];
    for (var role of ["anon", "authenticated"]) {
      var c = await pool.connect();
      try {
        await c.query("SET ROLE " + role);
        denied.push(/permission denied/.test(await errorOf(c.query("SELECT expense_ref FROM public.financial_strategy_user_choice_events LIMIT 1"))));
        denied.push(/permission denied/.test(await errorOf(c.query("SELECT miplan_private.v2_expense_categories('{}'::jsonb)"))));
        denied.push(/permission denied/.test(await errorOf(c.query("SELECT miplan_private.v2_interaction_authority('{}'::jsonb, '{}'::jsonb)"))));
        denied.push(/permission denied/.test(await errorOf(c.query("SELECT miplan_private.v2_expense_value('1'::jsonb)"))));
        denied.push(/MIPLAN_UNAUTHORIZED/.test(await errorOf(c.query(CHOICE_SQL, choiceArgs({ secret: "guess", evaluation_id: E1, type: "creditor_contact_step", debt_index: 0, choice_state: "planned" })))));
      } finally {
        await c.query("RESET ROLE");
        c.release();
      }
    }
    var priv = await q("SELECT p.proname, p.proacl::text AS acl, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'miplan_private' AND p.proname IN ('v2_expense_value', 'v2_expense_categories', 'v2_interaction_authority')");
    check("[F] anon / authenticated: no table access, no miplan_private helper; the 3 new helpers have a pinned search_path and no PUBLIC / anon / authenticated EXECUTE",
      denied.length === 10 && denied.every(Boolean) && priv.length === 3 && priv.every(function (f) {
        return !/(^|[{,])=X\//.test(f.acl || "") && !/anon=/.test(f.acl || "") && !/authenticated=/.test(f.acl || "") && /^search_path=pg_catalog/.test(f.proconfig[0]);
      }), { denied: denied, priv: priv });

    // ---- backstop: CHECKs on direct writes as the table owner ----
    var EK = (await evaluationFor(ANON_A, JA, Object.assign(clone(caseOf("CONTENCION_NO_ELIGIBLE_DEBT").input), { ingreso: 50002 }), "backstop")).evaluation_id;
    function ins(o) {
      var row = Object.assign({ evaluation_id: EK, journey_id: JA, anonymous_id: ANON_A, contract_version: "user_choice_v1", slot_key: "expense_reduction:vivienda",
        choice_type: "expense_reduction_intent", choice_state: "marked", expense_ref: "vivienda", amount: 10, debt_index: null, lower_payment_state: null,
        reserve_destination: null, seq: 1, supersedes_event_id: null, supersedes_seq: null }, o);
      var cols = Object.keys(row);
      return pool.query("INSERT INTO public.financial_strategy_user_choice_events (" + cols.join(", ") + ") VALUES (" +
        cols.map(function (_c, k) { return "$" + (k + 1); }).join(", ") + ") RETURNING event_id", cols.map(function (col) { return row[col]; }));
    }
    var okExp = (await ins({})).rows[0].event_id;
    var okCon = (await ins({ slot_key: "creditor_contact:0", choice_type: "creditor_contact_step", choice_state: "planned", expense_ref: null, amount: null, debt_index: 0 })).rows[0].event_id;
    var bad = await Promise.all([
      ins({ slot_key: "expense_reduction:otros", expense_ref: "otros" }),
      ins({ slot_key: "expense_reduction:custom:0", expense_ref: "custom:0" }),
      ins({ slot_key: "expense_reduction:ocio", expense_ref: "ocio", amount: null }),
      ins({ slot_key: "expense_reduction:ocio", expense_ref: "ocio", choice_state: "unmarked" }),
      ins({ slot_key: "expense_reduction:ocio", expense_ref: "ocio", amount: 1.234 }),
      ins({ slot_key: "expense_reduction:ocio", expense_ref: "ocio", choice_state: "achieved" }),
      ins({ slot_key: "expense_reduction:salud", expense_ref: "ocio" }),
      ins({ slot_key: "expense_reduction:ocio", expense_ref: "ocio", debt_index: 0 }),
      ins({ slot_key: "creditor_contact:1", choice_type: "creditor_contact_step", choice_state: "agreed", expense_ref: null, amount: null, debt_index: 1 }),
      ins({ slot_key: "creditor_contact:1", choice_type: "creditor_contact_step", choice_state: "planned", expense_ref: null, amount: 5, debt_index: 1 }),
      ins({ slot_key: "creditor_contact:2", choice_type: "creditor_contact_step", choice_state: "planned", expense_ref: null, amount: null, debt_index: 1 }),
      ins({ slot_key: "lower_payment_intent:3", choice_type: "lower_payment_intent", lower_payment_state: "marked", debt_index: 3, amount: null, choice_state: "marked", expense_ref: null }),
      ins({ slot_key: "surplus_allocation", choice_type: "surplus_reserve", reserve_destination: "planned_goal", choice_state: null, expense_ref: "vivienda" }),
    ].map(errorOf));
    var upd = await errorOf(pool.query("UPDATE public.financial_strategy_user_choice_events SET choice_state = 'contacted' WHERE event_id = $1", [okCon]));
    var del = await errorOf(pool.query("DELETE FROM public.financial_strategy_user_choice_events WHERE event_id = $1", [okExp]));
    check("backstop: CHECKs reject unknown / custom:0 refs, marked without amount, unmarked with amount, 3 decimals, unknown states, slot mismatch, " +
      "foreign fields, new columns on original types; UPDATE / DELETE stay USER_CHOICE_APPEND_ONLY",
      bad.every(function (e) { return /check constraint/.test(e || ""); }) && /USER_CHOICE_APPEND_ONLY/.test(upd || "") && /USER_CHOICE_APPEND_ONLY/.test(del || ""),
    { bad: bad, upd: upd, del: del });

    // ---- [parity] JS ↔ SQL ----
    var RAW = [null, "", "  ", 0, "0", "-0", "0.00", 1500, "1500", " 1500.5 ", "\u00a01200\u3000", "\ufeff99", "\u2007 5", "1.005", "2.675", "0.001",
      "0.005", "0.004", "-5", -5, "abc", "1,500", "3.000", true, false, {}, [], 1e-7, 1e21, 123456789012.345, "999999999999.995", "999999999999.99",
      "1000000000000", 0.30000000000000004, "007", "1e3", "+5", ".5", "5.", "1500.5549999999999999", 12345.678, "\t\n300\r"];
    var seed = 20261001;
    function rnd(n) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor(seed / 65536) % n;
    }
    var KEYS = ["vivienda", "alimentacion", "servicios", "transporte", "salud", "educacion", "hijos_familia", "ocio", "otros", "Vivienda", "__proto__"];
    function fuzzSnapshot() {
      var s = {};
      if (rnd(10)) {
        s.gastos = {};
        KEYS.forEach(function (k) { if (rnd(3) === 0) Object.defineProperty(s.gastos, k, { value: RAW[rnd(RAW.length)], enumerable: true, writable: true }); });
      } else {
        s.gastos = [null, "x", 5][rnd(3)];
      }
      if (rnd(8)) {
        s.custom_expenses = Array.from({ length: rnd(6) }, function () {
          var v = RAW[rnd(RAW.length)];
          switch (rnd(9)) {
            case 0: return { monto: v };
            case 1: return { amount: null, monto: v };
            case 2: return { amount: v, included: false };
            case 3: return { amount: v, _included: false };
            case 4: return { amount: v, included: "false", label: "x" };
            case 5: return [null, "str", 5, []][rnd(4)];
            default: return { amount: v, description: "Nombre" };
          }
        });
      } else {
        s.custom_expenses = { amount: 5 };
      }
      return JSON.parse(JSON.stringify(s));
    }
    var snapshots = sweep.sweepInputs().map(function (inp) { return clone({ gastos: inp.gastos, custom_expenses: inp.custom_expenses }); });
    for (var f = 0; f < 1500; f++) snapshots.push(fuzzSnapshot());
    CASES.forEach(function (cs) { snapshots.push(clone({ gastos: cs.input.gastos, custom_expenses: cs.input.custom_expenses })); });
    var sqlCats = (await q("SELECT miplan_private.v2_expense_categories(t.s) AS c FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(s, o) ORDER BY t.o",
      [JSON.stringify(snapshots)])).map(function (r) { return r.c; });
    var catFail = [];
    var nonEmpty = 0;
    var withCustom = 0;
    snapshots.forEach(function (s, k) {
      var js = projectExpenseCategories(s);
      if (js.length) nonEmpty += 1;
      if (js.some(function (x) { return /^custom:/.test(x.expense_ref); })) withCustom += 1;
      if (!eq(sqlCats[k], js)) catFail.push({ k: k, snapshot: s, sql: sqlCats[k], js: js });
    });
    check("[parity] miplan_private.v2_expense_categories == projectExpenseCategories on " + snapshots.length + " snapshots (sweep + 1500 fuzz + cases; " +
      nonEmpty + " non-empty, " + withCustom + " with custom refs)", catFail.length === 0 && nonEmpty > 500 && withCustom > 200, catFail.slice(0, 3));

    var pairs = [];
    sweep.sweepInputs().forEach(function (inp) {
      pairs.push({ r: classifier.classifyFinancialShadow(clone(inp)), s: clone({ gastos: inp.gastos, custom_expenses: inp.custom_expenses }) });
    });
    var anchors = CASES.map(function (cs) { return classifier.classifyFinancialShadow(clone(cs.input)); });
    var contAnchor = anchors[0];
    anchors = anchors.concat([
      Object.assign(clone(contAnchor), { strategy: "MANTENIMIENTO_OPTIMIZACION" }),
      Object.assign(clone(contAnchor), { strategy: "REGULARIZACION" }),
      Object.assign(clone(contAnchor), { classification_status: "incomplete" }),
      Object.assign(clone(contAnchor), { strategy: "FOO" }),
    ]);
    for (var p = 0; p < 300; p++) pairs.push({ r: anchors[p % anchors.length], s: fuzzSnapshot() });
    var sqlAuth = (await q("SELECT miplan_private.v2_interaction_authority(t.p -> 'r', t.p -> 's') AS a FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(p, o) ORDER BY t.o",
      [JSON.stringify(pairs)])).map(function (r) { return r.a; });
    var authFail = [];
    var byStrategy = {};
    pairs.forEach(function (pr, k) {
      var ac = buildActionContext(pr.r, pr.s);
      var js = ac === null ? null : {
        strategy: pr.r.strategy,
        expense_categories: Array.isArray(ac.expense_categories) ? ac.expense_categories : [],
        mora_debts: (ac.mora_debts || []).map(function (d) { return d.debt_index; }),
      };
      if (js && (js.expense_categories.length || js.mora_debts.length)) byStrategy[js.strategy] = (byStrategy[js.strategy] || 0) + 1;
      if (!eq(sqlAuth[k], js)) authFail.push({ k: k, sql: sqlAuth[k], js: js });
    });
    check("[parity] miplan_private.v2_interaction_authority == buildActionContext(result, snapshot) (expense_categories, mora_debts) on " + pairs.length +
      " pairs; authorizing strategies " + JSON.stringify(byStrategy),
      authFail.length === 0 && eq(Object.keys(byStrategy).sort(), ["CONTENCION", "MANTENIMIENTO_OPTIMIZACION", "REGULARIZACION"]), authFail.slice(0, 3));
    var stored = await q("SELECT e.evaluation_id, e.result, d.input_snapshot FROM public.financial_strategy_evaluations e " +
      "JOIN public.diagnoses d ON d.diagnosis_id = e.origin_diagnosis_id");
    var storedFail = [];
    for (var sIdx = 0; sIdx < stored.length; sIdx++) {
      var row = stored[sIdx];
      var st = (await api.state(ANON_A, row.evaluation_id));
      if (st.status !== 200) continue;
      var sqlA = (await q("SELECT miplan_private.v2_interaction_authority($1::jsonb, $2::jsonb) AS a", [JSON.stringify(row.result), JSON.stringify(row.input_snapshot)]))[0].a;
      var readCats = st.body.action_context && st.body.action_context.expense_categories ? st.body.action_context.expense_categories : [];
      if (!eq(readCats, sqlA ? sqlA.expense_categories : [])) storedFail.push({ ev: row.evaluation_id, read: readCats, sql: sqlA });
    }
    check("[parity] every stored evaluation: the categories the read exposes == the categories the record RPC authorizes (" + stored.length + " evaluations)",
      storedFail.length === 0 && stored.length >= 12, storedFail.slice(0, 3));

    // ---- rollback is refused once a new-type row exists ----
    var guard = await pool.connect();
    var refused;
    try {
      await guard.query("BEGIN");
      refused = await errorOf(guard.query(rollback));
      await guard.query("ROLLBACK");
    } finally {
      guard.release();
    }
    check("[M] with expense / contact rows stored, the header ROLLBACK fails (constraint check) and changes nothing",
      /check constraint/.test(refused || "") && eq(await schemaSnapshot(), afterFirst), refused);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
