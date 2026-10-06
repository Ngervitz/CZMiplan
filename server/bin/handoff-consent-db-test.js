/**
 * server/bin/handoff-consent-db-test.js — MIPLAN-HANDOFF-CONSENT-01, isolated DB harness.
 *
 * Throwaway embedded PostgreSQL (temp dir, loopback, deleted at the end) with every repo migration
 * applied, ending with 20261005120000_miplan_handoff_consents.sql (WRITTEN, NOT APPLIED anywhere
 * else). The real app runs the real journey + handoff consent Supabase repositories through an
 * rpc() adapter over node-postgres; JANUS is mocked in-process. Never reads .env / SUPABASE_*.
 *
 * Deps (outside the repo): MIPLAN_ISOLATED_DEPS dir with embedded-postgres + pg installed
 * (default %TEMP%/miplan-v2-isolated-pg17).
 *
 * node -r ./server/testing/networkTrap.js server/bin/handoff-consent-db-test.js
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

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createJourneyRepository = require("../modules/journey/repository").createJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;
var bootstrapKeyFromHandoffCode = require("../modules/journey/service").bootstrapKeyFromHandoffCode;
var createHandoffConsentRepository = require("../modules/handoffConsent/repository").createHandoffConsentRepository;
var createHandoffConsentService = require("../modules/handoffConsent/service").createHandoffConsentService;

var MIGRATION = "20261005120000_miplan_handoff_consents.sql";
var SECRET = crypto.randomBytes(24).toString("hex");
var TENANT = "miplan-default";
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var ANON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var TC = "TC_v2.0_202605";
var PP = "PP_v2.0_202605";

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function newCode() {
  return crypto.randomBytes(32).toString("base64url");
}

// ---- Supabase-style rpc() over node-postgres (named arguments, like PostgREST) ----
function makeRpcClient(pool) {
  var sigCache = {};
  async function types(name) {
    if (!sigCache[name]) {
      var r = await pool.query(
        "SELECT p.proargnames AS names, oidvectortypes(p.proargtypes) AS types FROM pg_proc p " +
        "JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1", [name]);
      if (r.rows.length !== 1) throw new Error("RPC_SIGNATURE_UNRESOLVED " + name);
      var row = r.rows[0];
      var t = row.types.split(", ");
      sigCache[name] = {};
      row.names.forEach(function (n, i) { sigCache[name][n] = t[i]; });
    }
    return sigCache[name];
  }
  return {
    rpc: async function (name, params) {
      try {
        var sig = await types(name);
        var keys = Object.keys(params);
        var values = [];
        var args = keys.map(function (k, i) {
          var v = params[k];
          values.push(v == null ? null : sig[k] === "jsonb" ? JSON.stringify(v) : v);
          return k + " => $" + (i + 1) + "::" + sig[k];
        });
        var r = await pool.query("SELECT public." + name + "(" + args.join(", ") + ") AS v", values);
        return { data: r.rows[0].v, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e.message), code: e.code } };
      }
    },
  };
}

// ---- JANUS mock ----
var janusRedeemed = new Set();
global.fetch = function (_url, init) {
  var code = JSON.parse(init.body).handoff_code;
  function reply(status, body) {
    return Promise.resolve({ ok: status === 200, status: status, text: function () { return Promise.resolve(JSON.stringify(body)); } });
  }
  if (janusRedeemed.has(code)) return reply(409, { error: "already_redeemed" });
  janusRedeemed.add(code);
  return reply(200, {
    ok: true,
    context: {
      contract_version: 1,
      context: { funnel: "credizona_rejected", external_ref_type: "lrw", external_ref: "LRW-1", issued_at: new Date().toISOString() },
      person: { nombre: "Ada" },
      provenance: { source_system: "credizona" },
    },
  });
};

function request(port, method, urlPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var raw = body === undefined ? null : JSON.stringify(body);
    var h = Object.assign({ "Content-Type": "application/json" }, headers || {});
    if (raw !== null) h["Content-Length"] = Buffer.byteLength(raw);
    var req = http.request({ hostname: "127.0.0.1", port: port, path: urlPath, method: method, headers: h }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        var text = Buffer.concat(chunks).toString("utf8");
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (raw !== null) req.write(raw);
    req.end();
  });
}

async function main() {
  var EmbeddedPostgres = (await import(pathToFileURL(path.join(DEPS, "node_modules", "embedded-postgres", "dist", "index.js")).href)).default;
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-consent-pg-"));
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
  console.log("HANDOFF_CONSENT_DB_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

async function errorOf(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return String(e.message);
  }
}

async function run(pool) {
  async function q(sql, args) {
    return (await pool.query(sql, args || [])).rows;
  }
  console.log("isolated PostgreSQL " + (await q("SHOW server_version"))[0].server_version + " (throwaway cluster)");

  await pool.query(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" +
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
  var dir = path.join(ROOT, "server", "migrations");
  var files = fs.readdirSync(dir).filter(function (f) { return /\.sql$/.test(f); }).sort();
  check("migration: " + MIGRATION + " is the latest migration", files[files.length - 1] === MIGRATION, files.slice(-2));
  for (var i = 0; i < files.length; i++) {
    if (files[i] === MIGRATION) continue;
    await pool.query(fs.readFileSync(path.join(dir, files[i]), "utf8"));
  }
  var sql = fs.readFileSync(path.join(dir, MIGRATION), "utf8");
  var topLevel = sql.replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/--[^\n]*/g, "");
  check("migration: additive only (no top-level DROP / UPDATE / INSERT / DELETE / ALTER of existing tables)",
    !/\bDROP\b/i.test(topLevel) && !/^\s*(UPDATE|INSERT|DELETE\s+FROM)\b/im.test(topLevel) &&
    (topLevel.match(/ALTER TABLE\s+[\w.]+/g) || []).every(function (s) { return /public\.handoff_consents$/.test(s); }));

  var admin = await pool.connect();
  await admin.query("BEGIN");
  await admin.query(sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, ""));
  await admin.query("ROLLBACK");
  admin.release();
  var gone = (await q("SELECT to_regclass('public.handoff_consents') AS t, " +
    "to_regprocedure('public.miplan_record_handoff_consent(text,text,text,text)') AS f"))[0];
  check("migration: applies inside a transaction; ROLLBACK leaves no trace", gone.t === null && gone.f === null);
  await pool.query(sql);
  await pool.query(sql);
  check("migration: re-applying is a no-op", true);
  await pool.query("INSERT INTO miplan_private.backend_secrets (name, secret) VALUES ('b2_persist', $1)", [SECRET]);

  var rls = (await q("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.handoff_consents'::regclass"))[0];
  var anonSelect = await errorOf(pool.query("SET ROLE anon; SELECT * FROM public.handoff_consents; RESET ROLE;"));
  await pool.query("RESET ROLE");
  check("table: RLS enabled and no direct access for anon", rls.relrowsecurity === true && /permission denied/i.test(String(anonSelect)), anonSelect);

  var key = bootstrapKeyFromHandoffCode(newCode());
  var wrongSecret = await errorOf(pool.query("SELECT public.miplan_record_handoff_consent('nope', $1, $2, $3)", [key, TC, PP]));
  var wrongSecretAttach = await errorOf(pool.query("SELECT public.miplan_attach_handoff_consent('nope', $1, gen_random_uuid())", [key]));
  check("RPCs: wrong secret -> MIPLAN_UNAUTHORIZED", /MIPLAN_UNAUTHORIZED/.test(wrongSecret) && /MIPLAN_UNAUTHORIZED/.test(wrongSecretAttach));
  var rawKey = await errorOf(pool.query("SELECT public.miplan_record_handoff_consent($1, 'raw-code-not-a-key-xxxxxx', $2, $3)", [SECRET, TC, PP]));
  check("RPC record: key without handoff: prefix refused", /INVALID_BOOTSTRAP_KEY/.test(rawKey), rawKey);

  var client = makeRpcClient(pool);
  var journeyService = createJourneyService({ repository: createJourneyRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }), tenantId: TENANT });
  var consentService = createHandoffConsentService({ repository: createHandoffConsentRepository({ client: client, backendSecret: SECRET }) });
  var app = createApp(loadConfig({ NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "", JANUS_HANDOFF_BASE_URL: "https://janus.test",
    MIPLAN_HANDOFF_REDEEM_SECRET: "test-redeem-secret" }), { journeyService: journeyService, handoffConsentService: consentService });
  var httpServer = http.createServer(app);
  await new Promise(function (r) { httpServer.listen(0, "127.0.0.1", r); });
  var P = httpServer.address().port;
  function consent(code, tc, pp) {
    return request(P, "POST", "/v1/handoff/consent", { handoff_code: code, tc_version: tc || TC, privacy_version: pp || PP });
  }
  function redeem(code, anon) {
    return request(P, "POST", "/v1/handoff/redeem", { handoff_code: code }, { "X-MiPlan-Anonymous-Id": anon || ANON_A });
  }
  async function rowOf(code) {
    return (await q("SELECT * FROM public.handoff_consents WHERE bootstrap_key = $1", [bootstrapKeyFromHandoffCode(code)]))[0] || null;
  }

  try {
    var c1 = newCode();
    var r1 = await consent(c1);
    var row1 = await rowOf(c1);
    var dbNow = (await q("SELECT now() AS n"))[0].n;
    check("record: 200; row has exact versions, DB-clock accepted_at, 15 min expiry, unbound",
      r1.status === 200 && row1 && row1.tc_version === TC && row1.privacy_version === PP && row1.journey_id === null &&
      Math.abs(row1.expires_at - row1.accepted_at - 15 * 60 * 1000) < 5 && Math.abs(dbNow - row1.accepted_at) < 60000, row1);
    check("record: raw code never stored", JSON.stringify(await q("SELECT * FROM public.handoff_consents")).indexOf(c1) === -1);
    await consent(c1);
    check("record: retry keeps the original accepted_at", +(await rowOf(c1)).accepted_at === +row1.accepted_at);

    var red = await redeem(c1);
    var row1b = await rowOf(c1);
    check("redeem: consent bound to the new journey and returned",
      red.status === 200 && red.body.miplan_consent && red.body.miplan_consent.journey_id === red.body.journey_id &&
      row1b.journey_id === red.body.journey_id && row1b.consumed_at !== null &&
      red.body.miplan_consent.tc_version === TC && red.body.miplan_consent.privacy_version === PP, red.body);
    var late = await consent(c1);
    check("record after redeem -> 409 HANDOFF_ALREADY_REDEEMED", late.status === 409 && late.body.error === "HANDOFF_ALREADY_REDEEMED", late.body);
    var again = await redeem(c1);
    check("same-owner retry returns the same bound consent",
      again.status === 200 && JSON.stringify(again.body.miplan_consent) === JSON.stringify(red.body.miplan_consent), again.body);
    var other = await redeem(c1, ANON_B);
    check("other browser -> 403, no consent", other.status === 403 && !other.body.miplan_consent, other.body);

    var c2 = newCode();
    var red2 = await redeem(c2);
    check("redeem without a click -> miplan_consent null", red2.status === 200 && red2.body.miplan_consent === null, red2.body);
    var attachWrong = (await q("SELECT public.miplan_attach_handoff_consent($1, $2, $3::uuid) AS v",
      [SECRET, bootstrapKeyFromHandoffCode(c1), red2.body.journey_id]))[0].v;
    check("attach: consent of code A is never returned for journey B", attachWrong === null, attachWrong);

    var c3 = newCode();
    await consent(c3);
    await q("UPDATE public.handoff_consents SET accepted_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes' WHERE bootstrap_key = $1",
      [bootstrapKeyFromHandoffCode(c3)]);
    var red3 = await redeem(c3);
    var row3 = await rowOf(c3);
    check("expired pending is not bound; redeem without consent", red3.status === 200 && red3.body.miplan_consent === null && row3.journey_id === null, red3.body);

    var c4 = newCode();
    var v999 = await consent(c4, "TC_v999");
    check("authority: TC_v999 -> 422, nothing stored", v999.status === 422 && (await rowOf(c4)) === null, v999.body);

    var c5 = newCode();
    var both = await Promise.all([consent(c5), consent(c5), consent(c5)]);
    var red5 = await Promise.all([redeem(c5), redeem(c5)]);
    var row5 = await rowOf(c5);
    check("concurrency: parallel clicks + parallel redeem -> one row, bound once, same consent in every 200",
      both.every(function (b) { return b.status === 200; }) &&
      red5.filter(function (x) { return x.status === 200; }).every(function (x) {
        return x.body.miplan_consent && x.body.miplan_consent.journey_id === row5.journey_id;
      }) && row5.journey_id !== null, red5.map(function (x) { return [x.status, x.body.miplan_consent]; }));
    var unique = await errorOf(pool.query("UPDATE public.handoff_consents SET journey_id = $1, consumed_at = now() WHERE bootstrap_key = $2",
      [row5.journey_id, bootstrapKeyFromHandoffCode(c3)]));
    check("constraint: one consent per journey", /duplicate key|unique/i.test(String(unique)), unique);
  } finally {
    await new Promise(function (r) { httpServer.close(r); });
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
