/**
 * server/bin/survey-v2-boundary-test.js — P7-SURVEY-V2-E2E-01, Mi Plan side of the survey boundary.
 *
 * Real JANUS builder (mie-backend src/lib/miplanHandoffTokens.buildAllowlistedContext) → Mi Plan
 * sanitizeHandoffContext → durable journey (memory repo, same route/service as production) →
 * isolated V2 signal extraction. V1 output is compared with the HEAD sanitizer.
 * No network, no DB. JANUS repo path: JANUS_REPO_DIR or ../../Mie Backend/mie-backend.
 *
 * node server/bin/survey-v2-boundary-test.js
 */
"use strict";

var assert = require("assert");
var fs = require("fs");
var http = require("http");
var path = require("path");
var vm = require("vm");
var childProcess = require("child_process");

var ROOT = path.join(__dirname, "..", "..");
var JANUS_DIR = process.env.JANUS_REPO_DIR || path.join(ROOT, "..", "..", "Mie Backend", "mie-backend");

var sanitize = require("../modules/journey/sanitizeContext");
var surveyV2 = require("../modules/journey/surveyV2Signals");

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

// ---------- JANUS (real code, same env preset as its own unit tests) ----------
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
var janusVersion = require(path.join(JANUS_DIR, "src", "lib", "czSurveyVersion"));
var janusEnv = require(path.join(JANUS_DIR, "src", "config", "env"));

// Synthetic episode (no real person).
var EPISODE = {
  cz_id: 9001, ci: 11111111, lrw_id: "LRW-000-000-001", email: "qa-v2@example.test",
  nombre: "QA", apellido: "Survey", salario: 50000, relacion_laboral: "EPR",
  solicitudes_estados_id: 3, synced_at: "2026-09-29T12:00:00.000Z",
};
var ISSUED = "2026-09-29T12:00:00.000Z";
var BASE = { p1: "A", p2: "B", p3: "C", p4: "B", p5: "A", p6: "B", p8: "C", p9: "A", p10: "B" };
var BASE_RAW = 3 + 2 + 1 + 2 + 3 + 2 + 1 + 2; // P1–P6 + P8 + P10
function row(version, p7, over) {
  return Object.assign({ cz_id: 77, ci: 11111111, completed_at: "2026-09-29T11:00:00.000Z",
    version_cuestionario: version, p7: p7 }, BASE, over || {});
}
function janus(surveyRow, v2Enabled) {
  return janusTokens.buildAllowlistedContext(EPISODE, surveyRow, ISSUED, { surveyV2Enabled: v2Enabled === true });
}
function miplan(janusCtx) {
  return sanitize.sanitizeHandoffContext(JSON.parse(JSON.stringify(janusCtx)));
}

// ---------- HEAD sanitizer (V1 before) ----------
function loadHeadSanitizer() {
  var src = childProcess.execSync("git show HEAD:server/modules/journey/sanitizeContext.js",
    { cwd: ROOT, encoding: "utf8" });
  var mod = { exports: {} };
  vm.runInNewContext(src, { module: mod, exports: mod.exports, require: require });
  // vm objects belong to another realm; compare plain JSON.
  return function (raw) {
    return JSON.parse(JSON.stringify(mod.exports.sanitizeHandoffContext(raw)));
  };
}
var headSanitize = loadHeadSanitizer();

async function main() {
  check("JANUS production flag default is OFF (env unset)", janusEnv.miplanHandoffSurveyV2Enabled === false);

  // V2-13 / V2-08: JANUS JSON (flag ON in harness only) → Mi Plan mapping, every E–J.
  var CODES = ["E", "F", "G", "H", "I", "J"];
  var raws = [];
  CODES.forEach(function (code) {
    var j = janus(row(2, code), true);
    var m = miplan(j);
    var wantPurpose = janusVersion.V2_LOAN_PURPOSE_BY_CODE[code];
    check("V2-13 " + code + ": JANUS JSON survey = {source_survey_version 2, 9 ordinal answers without p7, loan_purpose, provenance}",
      j.survey && j.survey.source_survey_version === 2 && j.survey.loan_purpose === wantPurpose &&
      !("p7" in j.survey.respuestas) && Object.keys(j.survey.respuestas).length === 9 &&
      j.survey.provenance && j.survey.provenance.source_system === "credizona", j.survey);
    check("V2-13 " + code + ": Mi Plan keeps source_survey_version, answers, loan_purpose " + wantPurpose + " and provenance",
      m.survey && m.survey.source_survey_version === 2 && eq(m.survey.respuestas, j.survey.respuestas) &&
      m.survey.loan_purpose === wantPurpose && m.survey.completed_at === j.survey.completed_at &&
      eq(m.survey.provenance, { source_survey_version: 2, source_system: "credizona" }) &&
      m.provenance.source_system === "credizona" && !m.survey_rejected, m.survey);
    var sig = surveyV2.extractSurveyV2Signals(m.survey);
    raws.push(sig.ok ? sig.behavioral.raw : null);
    check("V2-02 " + code + ": loan_purpose " + wantPurpose + " is context only (not in behavioral questions/raw)",
      sig.ok && sig.loan_purpose === wantPurpose && sig.behavioral.questions.indexOf("p7") === -1 &&
      sig.behavioral.raw === BASE_RAW, sig);
  });
  check("V2-02 changing only P7 E→J keeps the same behavioral raw", raws.every(function (r) { return r === BASE_RAW; }), raws);

  // V2-07: flag OFF → withheld, no survey, no V1 fallback, no partial survey; Mi Plan keeps the reason.
  var off = janus(row(2, "G"), false);
  var offM = miplan(off);
  check("V2-07 JANUS flag OFF: V2 withheld (survey_v2_handoff_disabled), no survey block",
    !off.survey && off.survey_handoff && off.survey_handoff.status === "withheld" &&
    off.survey_handoff.reason === "survey_v2_handoff_disabled" && off.survey_handoff.source_survey_version === 2, off);
  check("V2-07 Mi Plan: no survey, keeps withheld reason, nothing rejected",
    !offM.survey && !offM.survey_rejected &&
    eq(offM.survey_handoff, { status: "withheld", reason: "survey_v2_handoff_disabled", source_survey_version: 2 }), offM);
  check("V2-07 rest of the context still delivered (person, financial_prefill)",
    offM.person && offM.person.nombre === "QA" && offM.financial_prefill && offM.financial_prefill.ingreso === 50000);

  // V2-01 / V2-06: version is explicit; content never selects it.
  var v1WithEj = miplan(janus(row(1, "G"), true));
  var v2WithAd = miplan(janus(row(2, "A"), true));
  var unknownV = miplan(janus(row(3, "B"), true));
  var nullV = miplan(janus(row(null, "B"), true));
  check("V2-01 version_cuestionario=1 with P7=G is not read as V2 (withheld survey_v1_p7_not_ordinal)",
    !v1WithEj.survey && v1WithEj.survey_handoff && v1WithEj.survey_handoff.reason === "survey_v1_p7_not_ordinal", v1WithEj);
  check("V2-01 version_cuestionario=2 with P7=A is not read as V1 (withheld survey_v2_p7_invalid)",
    !v2WithAd.survey && v2WithAd.survey_handoff && v2WithAd.survey_handoff.reason === "survey_v2_p7_invalid", v2WithAd);
  check("V2-06 unknown version 3 → fail closed (no survey)",
    !unknownV.survey && unknownV.survey_handoff && unknownV.survey_handoff.reason === "survey_version_unknown", unknownV);
  check("V2-06 null version → fail closed (no survey)",
    !nullV.survey && nullV.survey_handoff && nullV.survey_handoff.reason === "survey_version_unknown", nullV);

  // Mi Plan boundary itself (inputs JANUS never emits): explicit version or nothing.
  var full10 = Object.assign({ p7: "B" }, BASE);
  function mp(survey) { return sanitize.sanitizeHandoffContext({ context: { funnel: "credizona_rejected" }, survey: survey }); }
  var cases = [
    ["missing version with a full A–D survey is not assumed V1", { respuestas: full10 }, "survey_version_missing"],
    ["string version \"2\" is not V2", { source_survey_version: "2", respuestas: BASE, loan_purpose: "other" }, "survey_version_unknown"],
    ["V2 with p7 inside respuestas", { source_survey_version: 2, respuestas: Object.assign({ p7: "G" }, BASE), loan_purpose: "other" }, "survey_v2_p7_in_respuestas"],
    ["V2 with the physical letter as loan_purpose", { source_survey_version: 2, respuestas: BASE, loan_purpose: "G" }, "survey_v2_loan_purpose_invalid"],
    ["V2 without loan_purpose", { source_survey_version: 2, respuestas: BASE }, "survey_v2_loan_purpose_invalid"],
    ["V2 missing P9", { source_survey_version: 2, respuestas: Object.assign({}, BASE, { p9: null }), loan_purpose: "other" }, "survey_v2_incomplete"],
    ["V2 lower-case answer", { source_survey_version: 2, respuestas: Object.assign({}, BASE, { p3: "c" }), loan_purpose: "other" }, "survey_v2_invalid_answer"],
    ["V2 provenance says version 1", { source_survey_version: 2, respuestas: BASE, loan_purpose: "other", provenance: { source_survey_version: 1 } }, "survey_v2_provenance_mismatch"],
  ];
  cases.forEach(function (c) {
    var out = mp(c[1]);
    check("V2-06 Mi Plan: " + c[0] + " → no survey, reason " + c[2],
      !out.survey && out.survey_rejected && out.survey_rejected.reason === c[2], out);
  });

  // V2-04 (Mi Plan): P9 = help_receptivity, outside the 0–24 raw.
  var p9 = ["A", "B", "C", "D"].map(function (l) {
    return surveyV2.extractSurveyV2Signals({ source_survey_version: 2, respuestas: Object.assign({}, BASE, { p9: l }), loan_purpose: "other" });
  });
  check("V2-04 changing only P9 A→D keeps behavioral raw and maps help_receptivity open/selective/limited/autonomous",
    p9.every(function (s) { return s.ok && s.behavioral.raw === BASE_RAW; }) &&
    eq(p9.map(function (s) { return s.help_receptivity; }), ["open", "selective", "limited", "autonomous"]),
    p9.map(function (s) { return s.ok ? [s.behavioral.raw, s.help_receptivity] : s; }));
  var allA = surveyV2.extractSurveyV2Signals({ source_survey_version: 2, loan_purpose: "other",
    respuestas: { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p8: "A", p9: "D", p10: "A" } });
  var allD = surveyV2.extractSurveyV2Signals({ source_survey_version: 2, loan_purpose: "other",
    respuestas: { p1: "D", p2: "D", p3: "D", p4: "D", p5: "D", p6: "D", p8: "D", p9: "A", p10: "D" } });
  check("V2-12 V2 behavioral raw range 0..24 (P1–P6 + P8 + P10), no A/B/C level",
    allA.behavioral.raw === 24 && allD.behavioral.raw === 0 && allA.behavioral.raw_max === 24 &&
    !("nivel" in allA) && !("level" in allA) && !("segmentacion" in allA) &&
    eq(allA.behavioral.questions, ["p1", "p2", "p3", "p4", "p5", "p6", "p8", "p10"]));
  check("V2-12 extractor refuses V1 and unversioned surveys (V1 stays on calcularEncuesta)",
    surveyV2.extractSurveyV2Signals({ source_survey_version: 1, respuestas: full10 }).reason === "not_survey_v2" &&
    surveyV2.extractSurveyV2Signals({ respuestas: full10 }).reason === "not_survey_v2");

  // Contract constants aligned with JANUS and Panorama.
  check("loan_purpose values == JANUS V2_LOAN_PURPOSE_BY_CODE (E–J)",
    eq(surveyV2.LOAN_PURPOSE_VALUES.slice(), CODES.map(function (c) { return janusVersion.V2_LOAN_PURPOSE_BY_CODE[c]; })));
  var panorama = require("../../dev/panorama-inicial/signal-catalog");
  check("help_receptivity values == Panorama signal-catalog HELP_RECEPTIVITY",
    eq(Object.assign({}, surveyV2.HELP_RECEPTIVITY), Object.assign({}, panorama.HELP_RECEPTIVITY)));

  // V2-05: V1 before = after (HEAD sanitizer) except the explicit source_survey_version.
  var v1Janus = janus(row(1, "B"), false);
  var v1Now = miplan(v1Janus);
  var v1Head = headSanitize(JSON.parse(JSON.stringify(v1Janus)));
  var v1NowNoVersion = JSON.parse(JSON.stringify(v1Now));
  delete v1NowNoVersion.survey.source_survey_version;
  check("V2-05 V1 via JANUS: same sanitized context as HEAD + survey.source_survey_version = 1",
    v1Now.survey.source_survey_version === 1 && eq(v1NowNoVersion, v1Head), { now: v1Now, head: v1Head });
  var v1Partial = { source_survey_version: 1, respuestas: Object.assign({}, full10, { p4: "x", p9: null }) };
  var partialNow = mp(v1Partial).survey;
  var partialHead = headSanitize({ context: { funnel: "credizona_rejected" }, survey: v1Partial }).survey;
  delete partialNow.source_survey_version;
  check("V2-05 V1 per-answer filter unchanged (same answers kept as HEAD)", eq(partialNow, partialHead), { now: partialNow, head: partialHead });

  // V2-12: legacy calcularEncuesta (V1, 0..30, 24/15) untouched.
  check("V2-12 js/survey.js (calcularEncuesta) has no diff vs HEAD",
    childProcess.spawnSync("git", ["diff", "--quiet", "HEAD", "--", "js/survey.js"], { cwd: ROOT }).status === 0);
  var surveyCtx = { TIENE_ENCUESTA: true, console: console };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js", "survey.js"), "utf8"), surveyCtx);
  var allAv1 = surveyCtx.calcularEncuesta({ p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" });
  var midV1 = surveyCtx.calcularEncuesta(full10);
  check("V2-12 V1 calcularEncuesta: all A → 30/A; P1–P10 fixture keeps its 0..30 score with P7 and P9",
    allAv1.score === 30 && allAv1.nivel === "A" && midV1.score === BASE_RAW + 2 + 3 && midV1.nivel === "B",
    { allA: allAv1, mid: midV1 });

  // V2-09: redeem through the real route/service, durable journey keeps the V2 semantics.
  await redeemScenario();

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("SURVEY_V2_BOUNDARY_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

function redeemScenario() {
  var createApp = require("../app").createApp;
  var loadConfig = require("../config").loadConfig;
  var createMemoryJourneyRepository = require("../modules/journey/repository").createMemoryJourneyRepository;
  var createJourneyService = require("../modules/journey/service").createJourneyService;
  var janusCtx = janus(row(2, "H"), true);
  var calls = 0;
  global.fetch = function () {
    calls += 1;
    return Promise.resolve({
      ok: true, status: 200,
      text: function () { return Promise.resolve(JSON.stringify({ ok: true, context: janusCtx })); },
    });
  };
  var repo = createMemoryJourneyRepository();
  var app = createApp(loadConfig({
    NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "",
    JANUS_HANDOFF_BASE_URL: "https://janus.test", MIPLAN_HANDOFF_REDEEM_SECRET: "test-redeem-secret",
  }), { journeyService: createJourneyService({ repository: repo, tenantId: "miplan-default" }) });
  var server = http.createServer(app);
  function post(port) {
    return new Promise(function (resolve, reject) {
      var raw = JSON.stringify({ handoff_code: "survey-v2-boundary-code" });
      var req = http.request({ hostname: "127.0.0.1", port: port, path: "/v1/handoff/redeem", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw),
          "X-MiPlan-Anonymous-Id": "22222222-2222-4222-8222-222222222222" } }, function (res) {
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); });
      });
      req.on("error", reject);
      req.write(raw);
      req.end();
    });
  }
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", async function () {
      var port = server.address().port;
      try {
        var r1 = await post(port);
        var r2 = await post(port);
        var stored = Array.from(repo._test.byId.values())[0];
        var s = stored && stored.bootstrap_context && stored.bootstrap_context.survey;
        var sig = surveyV2.extractSurveyV2Signals(s);
        check("V2-09 redeem returns the V2 survey (source_survey_version 2, loan_purpose)",
          r1.status === 200 && r1.body.context.survey && r1.body.context.survey.source_survey_version === 2 &&
          r1.body.context.survey.loan_purpose === "recurring_expense_shortfall", r1.body);
        check("V2-09 journey bootstrap_context persists survey_version 2 + loan_purpose + provenance (credizona → JANUS → handoff)",
          s && s.source_survey_version === 2 && s.loan_purpose === "recurring_expense_shortfall" &&
          eq(s.provenance, { source_survey_version: 2, source_system: "credizona" }) &&
          stored.entry_type === "janus_handoff" && stored.source_system === "credizona" &&
          stored.bootstrap_context.provenance.source_system === "credizona", stored);
        check("V2-09 persisted survey → P9 help_receptivity 'open', behavioral raw " + BASE_RAW + "/24, no P7/P9 in raw",
          sig.ok && sig.help_receptivity === "open" && sig.behavioral.raw === BASE_RAW &&
          sig.behavioral.questions.indexOf("p9") === -1 && sig.behavioral.questions.indexOf("p7") === -1, sig);
        check("V2-09 second redeem served from the durable journey (no second JANUS call), same survey",
          r2.status === 200 && r2.body.cached === true && calls === 1 && eq(r2.body.context.survey, r1.body.context.survey), r2.body);
      } catch (err) {
        check("V2-09 redeem scenario ran", false, String(err && err.stack));
      }
      server.close();
      resolve();
    });
  });
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
