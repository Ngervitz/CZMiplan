/**
 * server/bin/handoff-consent-test.js — MIPLAN-HANDOFF-CONSENT-01 contract (memory repositories,
 * mocked JANUS, real Express app on loopback). No network, no Supabase.
 * node server/bin/handoff-consent-test.js
 */
"use strict";

var fs = require("fs");
var http = require("http");
var path = require("path");
var crypto = require("crypto");

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createMemoryJourneyRepository = require("../modules/journey/repository").createMemoryJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;
var bootstrapKeyFromHandoffCode = require("../modules/journey/service").bootstrapKeyFromHandoffCode;
var consentRepoModule = require("../modules/handoffConsent/repository");
var consentServiceModule = require("../modules/handoffConsent/service");

var ROOT = path.join(__dirname, "..", "..");
var CZ_STAGING_JS = path.join("C:", "Users", "Admin", "Desktop", "CZ CLON CPANEL 2026-08-27", "CZ CLON CPANEL 2026-08-27",
  "deploy", "thank-you-handoff-wiring", "public_html", "solicitudes.js");
var ANON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var ANON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
var CZ_ORIGIN = "https://www.credizona.com.uy";
var TC = "TC_v2.0_202605";
var PP = "PP_v2.0_202605";

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail) : ""));
}
function newCode() {
  return crypto.randomBytes(32).toString("base64url");
}

// ---- JANUS mock: one-time redeem; unknown / expired codes fail like JANUS ----
var janus = { issued: new Map(), redeemed: new Set(), calls: 0 };
function issue(code, opts) {
  janus.issued.set(code, opts || {});
  return code;
}
global.fetch = function (url, init) {
  janus.calls += 1;
  var code = JSON.parse(init.body).handoff_code;
  function reply(status, body) {
    return Promise.resolve({ ok: status === 200, status: status, text: function () { return Promise.resolve(JSON.stringify(body)); } });
  }
  var meta = janus.issued.get(code);
  if (!meta) return reply(404, { error: "not_found" });
  if (meta.expired) return reply(410, { error: "expired" });
  if (janus.redeemed.has(code)) return reply(409, { error: "already_redeemed" });
  janus.redeemed.add(code);
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
    var raw = body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body);
    var h = Object.assign({ "Content-Type": "application/json" }, headers || {});
    if (raw !== null) h["Content-Length"] = Buffer.byteLength(raw);
    var req = http.request({ hostname: "127.0.0.1", port: port, path: urlPath, method: method, headers: h }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        var text = Buffer.concat(chunks).toString("utf8");
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers, raw: text });
      });
    });
    req.on("error", reject);
    if (raw !== null) req.write(raw);
    req.end();
  });
}

function listen(app) {
  var server = http.createServer(app);
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port }); });
  });
}

function baseConfig() {
  return loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    CORS_ALLOWED_ORIGINS: "http://127.0.0.1," + CZ_ORIGIN,
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    MIPLAN_BACKEND_SECRET: "",
    JANUS_HANDOFF_BASE_URL: "https://janus.test",
    MIPLAN_HANDOFF_REDEEM_SECRET: "test-redeem-secret",
  });
}

async function main() {
  var clock = { now: Date.now() };
  var journeyRepo = createMemoryJourneyRepository();
  var consentRepo = consentRepoModule.createMemoryHandoffConsentRepository(journeyRepo, { now: function () { return clock.now; } });
  var app = createApp(baseConfig(), {
    journeyService: createJourneyService({ repository: journeyRepo, tenantId: "miplan-default" }),
    handoffConsentService: consentServiceModule.createHandoffConsentService({ repository: consentRepo }),
  });
  var srv = await listen(app);
  var P = srv.port;
  function consent(body, headers) { return request(P, "POST", "/v1/handoff/consent", body, Object.assign({ Origin: CZ_ORIGIN }, headers || {})); }
  function redeem(code, anon, extraPath) {
    return request(P, "POST", "/v1/handoff/redeem" + (extraPath || ""), { handoff_code: code }, { "X-MiPlan-Anonymous-Id": anon || ANON_A });
  }
  function valid(code) { return { handoff_code: code, tc_version: TC, privacy_version: PP }; }
  function pending(code) { return consentRepo._test.byKey.get(bootstrapKeyFromHandoffCode(code)) || null; }

  try {
    // Parity: Mi Plan versions are the authority; CZ staging sends the same values.
    var cfg = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
    var feTc = (cfg.match(/LEGAL_VERSION_TC\s*=\s*"([^"]+)"/) || [])[1];
    var fePp = (cfg.match(/LEGAL_VERSION_PRIVACY\s*=\s*"([^"]+)"/) || [])[1];
    check("[parity] server MIPLAN_LEGAL_VERSIONS == js/config.js LEGAL_VERSION_TC / LEGAL_VERSION_PRIVACY",
      consentServiceModule.MIPLAN_LEGAL_VERSIONS.tc === feTc && consentServiceModule.MIPLAN_LEGAL_VERSIONS.privacy === fePp &&
      feTc === TC && fePp === PP, { feTc: feTc, fePp: fePp });
    if (fs.existsSync(CZ_STAGING_JS)) {
      var cz = fs.readFileSync(CZ_STAGING_JS, "utf8");
      check("[parity] CZ staging solicitudes.js sends the same versions",
        cz.indexOf("tc: '" + TC + "'") !== -1 && cz.indexOf("privacy: '" + PP + "'") !== -1);
    }

    // T2 / T3 — click + valid handoff -> recorded with exact versions, server clock.
    var c1 = issue(newCode());
    var before = clock.now;
    var r = await consent(Object.assign(valid(c1), { accepted_at: "2000-01-01T00:00:00.000Z", consent_source: "x" }));
    var row = pending(c1);
    check("T2 click + valid code -> 200 {ok, recorded} and nothing else in the response",
      r.status === 200 && JSON.stringify(r.body) === JSON.stringify({ ok: true, recorded: true }), r.body);
    check("T3 stored versions are exactly " + TC + " / " + PP, row && row.tc_version === TC && row.privacy_version === PP, row);
    check("T3 accepted_at is the server clock (client accepted_at / consent_source ignored)",
      row && row.accepted_at === before && row.consent_source === "credizona_gracias", row);
    check("T2 pending row is keyed by the hash, never the raw code",
      !consentRepo._test.byKey.has(c1) && JSON.stringify(Array.from(consentRepo._test.byKey.keys())).indexOf(c1) === -1);
    check("CORS: Credizona origin allowed on the consent route", r.headers["access-control-allow-origin"] === CZ_ORIGIN, r.headers);

    var dbl = await consent(valid(c1));
    check("double click keeps the first accepted_at", dbl.status === 200 && pending(c1).accepted_at === before);

    clock.now += 1000;
    var red = await redeem(c1);
    var mc = red.body && red.body.miplan_consent;
    check("T9 redeem returns the consent bound to this journey",
      red.status === 200 && mc && mc.source === "credizona_gracias" && mc.tc_version === TC && mc.privacy_version === PP &&
      mc.journey_id === red.body.journey_id && mc.accepted_at === new Date(before).toISOString(), red.body);

    // T6 — consumed code / replay.
    var late = await consent(valid(c1));
    check("T6 consent after redeem -> 409 HANDOFF_ALREADY_REDEEMED", late.status === 409 && late.body.error === "HANDOFF_ALREADY_REDEEMED", late.body);
    var again = await redeem(c1);
    check("T6 same-owner retry (durable cache) returns the SAME consent, not a new acceptance",
      again.status === 200 && again.body.cached === true && JSON.stringify(again.body.miplan_consent) === JSON.stringify(mc), again.body);
    var other = await redeem(c1, ANON_B);
    check("T6 replay by another browser -> 403, no consent", other.status === 403 && !other.body.miplan_consent, other.body);

    // T8 — valid handoff without click evidence.
    var c2 = issue(newCode());
    var noClick = await redeem(c2);
    check("T8 handoff without a click record -> redeem OK, miplan_consent null",
      noClick.status === 200 && noClick.body.journey_id && noClick.body.miplan_consent === null, noClick.body);
    var lateNoClick = await consent(valid(c2));
    var noClickAgain = await redeem(c2);
    check("T6 code redeemed without consent cannot gain one later",
      lateNoClick.status === 409 && noClickAgain.status === 200 && noClickAgain.body.miplan_consent === null);

    // T7 — consent=true anywhere does nothing.
    var c3 = issue(newCode());
    var flagOnly = await consent({ consent: true, handoff_code: c3 });
    var redeemFlag = await request(P, "POST", "/v1/handoff/redeem?consent=true&miplan_consent=1",
      { handoff_code: c3, consent: true, miplan_consent: { tc_version: TC, privacy_version: PP, accepted_at: new Date().toISOString() } },
      { "X-MiPlan-Anonymous-Id": ANON_A });
    check("T7 {consent:true} without versions -> 422, nothing stored", flagOnly.status === 422 && pending(c3) === null, flagOnly.body);
    check("T7 consent=true in query / client miplan_consent in body -> redeem without consent",
      redeemFlag.status === 200 && redeemFlag.body.miplan_consent === null, redeemFlag.body);

    // Authority — Credizona cannot choose versions.
    var c4 = issue(newCode());
    var v999 = await consent({ handoff_code: c4, tc_version: "TC_v999", privacy_version: PP });
    var ppOld = await consent({ handoff_code: c4, tc_version: TC, privacy_version: "PP_v1.0" });
    check("authority: TC_v999 / stale privacy version -> 422 CONSENT_VERSION_NOT_CURRENT, nothing stored",
      v999.status === 422 && v999.body.error === "CONSENT_VERSION_NOT_CURRENT" && ppOld.status === 422 && pending(c4) === null);

    // T4 — invalid code.
    var sizeBefore = consentRepo._test.byKey.size;
    var bad = await Promise.all([
      consent({ handoff_code: "short", tc_version: TC, privacy_version: PP }),
      consent({ handoff_code: "x".repeat(20) + "/../e?a=1", tc_version: TC, privacy_version: PP }),
      consent({ handoff_code: { a: 1 }, tc_version: TC, privacy_version: PP }),
      consent({ tc_version: TC, privacy_version: PP }),
      consent("[]"),
      consent("{not json"),
    ]);
    check("T4 malformed / missing code -> 400, nothing stored",
      bad.every(function (b) { return b.status === 400; }) && consentRepo._test.byKey.size === sizeBefore, bad.map(function (b) { return b.status; }));
    var unknown = newCode();
    var unk = await consent(valid(unknown));
    var unkRedeem = await redeem(unknown);
    check("T4 unknown code: click recorded only as unbound pending; redeem fails -> no consent anywhere",
      unk.status === 200 && unkRedeem.status === 404 && !unkRedeem.body.miplan_consent && pending(unknown).journey_id === null, unkRedeem.body);

    // T5 — expired.
    var c5 = issue(newCode());
    await consent(valid(c5));
    clock.now += 15 * 60 * 1000 + 1;
    var exp = await redeem(c5);
    check("T5 pending acceptance older than 15 min is not bound (T&C shown again)",
      exp.status === 200 && exp.body.miplan_consent === null && pending(c5).journey_id === null, exp.body);
    var c6 = issue(newCode(), { expired: true });
    await consent(valid(c6));
    var exp2 = await redeem(c6);
    check("T5 expired handoff code -> redeem error, no consent", exp2.status >= 400 && !exp2.body.miplan_consent, exp2.body);
    var c7 = issue(newCode());
    await consent(valid(c7));
    var t7a = pending(c7).accepted_at;
    clock.now += 16 * 60 * 1000;
    await consent(valid(c7));
    check("expired unbound pending can be re-accepted by a new explicit click (new accepted_at)", pending(c7).accepted_at > t7a);

    // T18 — a new handoff never inherits a previous acceptance.
    var c8 = issue(newCode());
    var newHandoff = await redeem(c8);
    check("T18 new handoff for the same browser -> no consent inherited from the previous journey",
      newHandoff.status === 200 && newHandoff.body.journey_id !== red.body.journey_id && newHandoff.body.miplan_consent === null);

    // CORS — unknown origin refused.
    var evil = await consent(valid(issue(newCode())), { Origin: "https://evil.example" });
    check("CORS: non-allowlisted origin -> 403", evil.status === 403, evil.body);
    var pre = await request(P, "OPTIONS", "/v1/handoff/consent", undefined,
      { Origin: CZ_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" });
    check("CORS preflight from Credizona -> 204 with allow-origin", pre.status === 204 && pre.headers["access-control-allow-origin"] === CZ_ORIGIN, pre.status);

    // Rate limit (last: shares the loopback IP).
    var statuses = [];
    for (var i = 0; i < 25; i++) statuses.push((await consent({ handoff_code: "short" })).status);
    check("rate limit: /v1/handoff/consent answers 429 after the per-IP budget", statuses.indexOf(429) !== -1, statuses);
  } finally {
    srv.server.close();
  }

  // Fail-closed wiring.
  var failingApp = createApp(baseConfig(), {
    journeyService: createJourneyService({ repository: createMemoryJourneyRepository(), tenantId: "miplan-default" }),
    handoffConsentService: consentServiceModule.createHandoffConsentService({
      repository: {
        recordPending: function () { return Promise.reject(Object.assign(new Error("DB_HANDOFF_CONSENT_FAILED"), { code: "DB_HANDOFF_CONSENT_FAILED" })); },
        attachToJourney: function () { return Promise.reject(new Error("relation does not exist")); },
      },
    }),
  });
  var f = await listen(failingApp);
  var fc = issue(newCode());
  var fRec = await request(f.port, "POST", "/v1/handoff/consent", { handoff_code: fc, tc_version: TC, privacy_version: PP });
  var fRed = await request(f.port, "POST", "/v1/handoff/redeem", { handoff_code: fc }, { "X-MiPlan-Anonymous-Id": ANON_A });
  check("fail-closed: consent store down -> 500 to Credizona (it still navigates), redeem unaffected with miplan_consent null",
    fRec.status === 500 && fRed.status === 200 && fRed.body.journey_id && fRed.body.miplan_consent === null, { rec: fRec.body, red: fRed.body });
  f.server.close();

  var bareApp = createApp(baseConfig(), {
    journeyService: createJourneyService({ repository: createMemoryJourneyRepository(), tenantId: "miplan-default" }),
  });
  var b = await listen(bareApp);
  var bc = issue(newCode());
  var bRec = await request(b.port, "POST", "/v1/handoff/consent", { handoff_code: bc, tc_version: TC, privacy_version: PP });
  var bRed = await request(b.port, "POST", "/v1/handoff/redeem", { handoff_code: bc }, { "X-MiPlan-Anonymous-Id": ANON_A });
  check("no consent service (injected journey service only): /consent 503, redeem response shape unchanged",
    bRec.status === 503 && bRed.status === 200 && !("miplan_consent" in bRed.body), bRed.body);
  b.server.close();

  var failed = results.filter(function (x) { return !x.ok; }).length;
  console.log("HANDOFF_CONSENT_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
