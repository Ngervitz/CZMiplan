/**
 * server/bin/live-write-guard-test.js — V2-HARNESS-SAFETY-AND-STRATEGY-DEDUP-01, harness safety tests 1–6.
 *
 * Unit checks of server/testing/liveWriteGuard.js, then every live-capable harness is spawned
 * against production / unknown / invalid / absent targets with fake credentials and the
 * network trap preloaded: each must stop before any outbound connection.
 *
 * node server/bin/live-write-guard-test.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var spawnSync = require("child_process").spawnSync;

var guard = require("../testing/liveWriteGuard");

var ROOT = path.join(__dirname, "..", "..");
var TRAP = path.join(ROOT, "server", "testing", "networkTrap.js");
var PROD_REF = "hvrrywlddxpywuvqclyq";
var TEST_REF = "abcdefghij0123456789";
var FAKE_KEY = "guard-test-fake-anon-key-7f3a";
var FAKE_SECRET = "guard-test-fake-secret-91c2";

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1200) : ""));
}
function blockedReason(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e && e.code === "LIVE_WRITE_BLOCKED" ? e.reason : "OTHER:" + (e && e.message);
  }
}
function url(ref) {
  return "https://" + ref + ".supabase.co";
}

// ---- [1] allowlisted ----
var okRes = guard.assertLiveWriteAllowed({ env: { SUPABASE_URL: url(TEST_REF) }, harness: "t", allowlist: [TEST_REF] });
check("[1] allowlisted project ref -> harness may continue (returns the ref)", okRes.project_ref === TEST_REF, okRes);
check("[1] trailing slash / surrounding spaces accepted for an allowlisted ref",
  guard.assertLiveWriteAllowed({ env: { SUPABASE_URL: " " + url(TEST_REF) + "/ " }, harness: "t", allowlist: [TEST_REF] }).project_ref === TEST_REF);

// ---- [2] unknown ----
check("[2] unknown project ref -> HARD FAIL (PROJECT_REF_NOT_ALLOWLISTED)",
  blockedReason(function () { guard.assertLiveWriteAllowed({ env: { SUPABASE_URL: url("zzzzzzzzzzzzzzzzzzzz") }, harness: "t", allowlist: [TEST_REF] }); }) ===
  "PROJECT_REF_NOT_ALLOWLISTED");

// ---- [3] production ----
check("[3] current production ref -> HARD FAIL with the committed allowlist (not allowlisted; no denylist involved)",
  blockedReason(function () { guard.assertLiveWriteAllowed({ env: { SUPABASE_URL: url(PROD_REF) }, harness: "t" }); }) ===
  "PROJECT_REF_NOT_ALLOWLISTED" && guard.TEST_PROJECT_REF_ALLOWLIST.indexOf(PROD_REF) === -1);
check("committed allowlist is frozen (cannot be extended at runtime) and not read from env",
  Object.isFrozen(guard.TEST_PROJECT_REF_ALLOWLIST) &&
  blockedReason(function () {
    guard.assertLiveWriteAllowed({ env: { SUPABASE_URL: url(TEST_REF), TEST_PROJECT_REF_ALLOWLIST: TEST_REF }, harness: "t" });
  }) === "PROJECT_REF_NOT_ALLOWLISTED");

// ---- [4] invalid URL ----
var invalid = [
  "not a url", "hvrrywlddxpywuvqclyq", "http://" + TEST_REF + ".supabase.co", "https://" + TEST_REF + ".supabase.co.evil.com",
  "https://evil.com/" + TEST_REF + ".supabase.co", "https://user:pw@" + TEST_REF + ".supabase.co", "https://" + TEST_REF + ".supabase.co:8443",
  "https://" + TEST_REF + ".supabase.co/rest/v1", "https://" + TEST_REF + ".supabase.co/?x=1", "https://short.supabase.co",
  "https://" + TEST_REF + "x.supabase.co", "https://abc_defghij0123456789.supabase.co", "https://db." + TEST_REF + ".supabase.co",
  "http://127.0.0.1:54321", "postgres://postgres:pw@db." + TEST_REF + ".supabase.co:5432/postgres", "https://" + TEST_REF + ".supabase.in",
];
var invalidBad = invalid.filter(function (u) {
  return guard.parseSupabaseProjectRef(u) !== null ||
    blockedReason(function () { guard.assertLiveWriteAllowed({ env: { SUPABASE_URL: u }, harness: "t", allowlist: [TEST_REF] }); }) !==
    "PROJECT_REF_UNPARSEABLE";
});
check("[4] invalid / look-alike / non-https / credentialed / ported / pathful URLs -> HARD FAIL (PROJECT_REF_UNPARSEABLE), " +
  invalid.length + " cases, even with the ref allowlisted", invalidBad.length === 0, invalidBad);
check("[4] uppercase host is normalized by URL parsing (same ref), not a bypass",
  guard.parseSupabaseProjectRef("https://" + TEST_REF.toUpperCase() + ".SUPABASE.CO") === TEST_REF);

// ---- [5] env absent ----
var absentBad = [{}, { SUPABASE_URL: "" }, { SUPABASE_URL: "   " }, { SUPABASE_URL: null }, { SUPABASE_URL: 42 }].filter(function (env) {
  return blockedReason(function () { guard.assertLiveWriteAllowed({ env: env, harness: "t", allowlist: [TEST_REF] }); }) !== "SUPABASE_URL_MISSING";
});
check("[5] SUPABASE_URL absent / empty / non-string -> HARD FAIL (SUPABASE_URL_MISSING)", absentBad.length === 0, absentBad);
check("[5] error messages carry code + ref only, never credentials",
  (function () {
    try {
      guard.assertLiveWriteAllowed({ env: { SUPABASE_URL: url(PROD_REF), SUPABASE_ANON_KEY: FAKE_KEY, MIPLAN_BACKEND_SECRET: FAKE_SECRET }, harness: "t" });
    } catch (e) {
      return e.message.indexOf(FAKE_KEY) === -1 && e.message.indexOf(FAKE_SECRET) === -1;
    }
    return false;
  })());

// ---- [6] live harnesses: no negative case writes (network trap) ----
var HARNESSES = [
  { file: "server/bin/b2-persist-test.js", live: "always" },
  { file: "server/bin/data-01-structured-test.js", live: "always" },
  { file: "server/bin/b3-shadow-metrics-test.js", live: "always" },
  { file: "server/bin/b3-shadow-test.js", live: "optional" },
  { file: "server/bin/entry-01-test.js", live: "optional" },
  { file: "server/bin/smoke.js", live: "optional" },
  { file: "dev/backend-arch/_shadow-prod-smoke.mjs", live: "always" },
];
var TARGETS = [
  { name: "production", url: url(PROD_REF), reason: "PROJECT_REF_NOT_ALLOWLISTED" },
  { name: "unknown", url: url("zzzzzzzzzzzzzzzzzzzz"), reason: "PROJECT_REF_NOT_ALLOWLISTED" },
  { name: "invalid", url: "https://" + PROD_REF + ".supabase.co.evil.com", reason: "PROJECT_REF_UNPARSEABLE" },
  { name: "absent", url: "", reason: "SUPABASE_URL_MISSING" },
];
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "live-guard-"));

var controlLog = path.join(tmp, "control.log");
var controlSrc =
  "var done=0,ok=0;function fin(){if(++done===3)console.log('REFUSED='+ok)}" +
  "fetch('https://" + PROD_REF + ".supabase.co/rest/v1/').then(fin,function(){ok++;fin()});" +
  "require('https').get('https://example.com/',fin).on('error',function(){ok++;fin()});" +
  "require('tls').connect(443,'example.org').on('error',function(){ok++;fin()}).on('secureConnect',fin);";
var control = spawnSync(process.execPath, ["-r", TRAP, "-e", controlSrc], {
  cwd: ROOT, env: Object.assign({}, process.env, { NETWORK_TRAP_LOG: controlLog }), encoding: "utf8", timeout: 60000,
});
var controlHits = fs.existsSync(controlLog) ? fs.readFileSync(controlLog, "utf8").split("\n").filter(Boolean) : [];
check("[6] trap positive control: fetch, https.get and tls.connect to external hosts are all recorded and refused",
  /REFUSED=3/.test(control.stdout || "") && controlHits.length === 3, { stdout: control.stdout, stderr: control.stderr, hits: controlHits });

var totalOutbound = 0;
HARNESSES.forEach(function (h) {
  TARGETS.forEach(function (t) {
    var log = path.join(tmp, path.basename(h.file) + "." + t.name + ".log");
    var env = Object.assign({}, process.env, {
      SUPABASE_URL: t.url, SUPABASE_ANON_KEY: FAKE_KEY, MIPLAN_BACKEND_SECRET: FAKE_SECRET, NETWORK_TRAP_LOG: log,
    });
    var r = spawnSync(process.execPath, ["-r", TRAP, path.join(ROOT, h.file)], { cwd: ROOT, env: env, encoding: "utf8", timeout: 120000 });
    var out = (r.stdout || "") + (r.stderr || "");
    var outbound = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
    totalOutbound += outbound.length;
    var offlineAllowed = h.live === "optional" && t.name === "absent";
    var blockedOk = offlineAllowed || (r.status !== 0 && out.indexOf("LIVE_WRITE_BLOCKED: " + t.reason) !== -1);
    var noLeak = out.indexOf(FAKE_KEY) === -1 && out.indexOf(FAKE_SECRET) === -1;
    check("[6] " + h.file + " vs " + t.name + " target -> " + (offlineAllowed ? "offline only (live not attempted)" : "HARD FAIL " + t.reason) +
      ", 0 outbound connections, no credential echoed",
      blockedOk && outbound.length === 0 && noLeak,
      { status: r.status, signal: r.signal, outbound: outbound, tail: out.slice(-400) });
  });
});
check("[6] total outbound connection attempts across all negative runs = 0", totalOutbound === 0, totalOutbound);

var failed = results.filter(function (r) { return !r.ok; }).length;
console.log("LIVE_WRITE_GUARD_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
if (failed) process.exitCode = 1;
