/**
 * P7-SURVEY-V2-E2E-01 / P7-V2-UX-CONTINUATION-01 — survey V2 through the real Mi Plan
 * frontend (Playwright).
 *
 * Contexts are produced by the real JANUS builder (V2 flag ON only in this harness) and the
 * real Mi Plan server sanitizer, then served as the Mi Plan /v1/handoff/redeem response.
 *
 *   LEGACY    pre-versioning context (no source_survey_version)   → "before" reference
 *   V1        explicit source_survey_version 1                     → must equal LEGACY
 *   V2_E      V2, P7 = E (purchase_or_home_improvement)            → survey completed,
 *   V2_J      V2, P7 = J (other)                                     no legacy answers
 *   WITHHELD  JANUS flag OFF (survey_v2_handoff_disabled)
 *   REJECTED  unknown version rejected by the Mi Plan sanitizer    → no survey: bridge screen
 *   ABSENT    no survey in JANUS
 *
 * A valid V2 is a completed survey (no survey CTA, no bridge screen, normal financial flow)
 * but never feeds PRE.respuestas / calcularEncuesta: the legacy engine runs in its existing
 * "no survey" mode. loan_purpose has no authority on the legacy plan nor on the classifier.
 * All external requests are aborted.
 *
 * Usage: node dev/backend-arch/classifier-shadow/survey-v2-handoff-e2e.js [--json]
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var chromium = require("playwright").chromium;
var classify = require("../../../engine/classifier/financial-classifier").classifyFinancialShadow;
var sanitize = require("../../../server/modules/journey/sanitizeContext");
var surveyV2 = require("../../../server/modules/journey/surveyV2Signals");

var ROOT = path.join(__dirname, "..", "..", "..");
var JANUS_DIR = process.env.JANUS_REPO_DIR || path.join(ROOT, "..", "..", "Mie Backend", "mie-backend");
var MOCK_API = "http://miplan-mock.test";

[["SUPABASE_URL", "https://example.supabase.co"], ["SUPABASE_SERVICE_ROLE_KEY", "test"],
  ["APIFY_TOKEN", "test"], ["APIFY_ACTOR_ID", "test"]].forEach(function (kv) {
  if (!process.env[kv[0]]) process.env[kv[0]] = kv[1];
});
delete process.env.MIPLAN_HANDOFF_SURVEY_V2_ENABLED;
var janusTokens = require(path.join(JANUS_DIR, "src", "lib", "miplanHandoffTokens"));

var EPISODE = {
  cz_id: 9002, ci: 11111112, lrw_id: "LRW-000-000-002", email: "qa-v2-fe@example.test",
  nombre: "QA", apellido: "SurveyFE", salario: 50000, relacion_laboral: "EPR",
  solicitudes_estados_id: 3, synced_at: "2026-09-29T12:00:00.000Z",
};
var ANSWERS = { p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p8: "B", p9: "B", p10: "B" };
function surveyRow(version, p7) {
  return Object.assign({ cz_id: 78, ci: 11111112, completed_at: "2026-09-29T11:00:00.000Z",
    version_cuestionario: version, p7: p7 }, ANSWERS);
}
function janusContext(row, v2Enabled) {
  return JSON.parse(JSON.stringify(janusTokens.buildAllowlistedContext(EPISODE, row,
    "2026-09-29T12:00:00.000Z", { surveyV2Enabled: v2Enabled === true })));
}
function contextFor(version, p7, v2Enabled) {
  return sanitize.sanitizeHandoffContext(janusContext(surveyRow(version, p7), v2Enabled));
}
function legacyContext() {
  var ctx = contextFor(1, "B", false);
  delete ctx.survey.source_survey_version;
  return ctx;
}
function rejectedContext() {
  var raw = janusContext(surveyRow(1, "B"), false);
  raw.survey.source_survey_version = 3;
  return sanitize.sanitizeHandoffContext(raw);
}

var CASES = {
  LEGACY: legacyContext(),
  V1: contextFor(1, "B", false),
  V2_E: contextFor(2, "E", true),
  V2_J: contextFor(2, "J", true),
  WITHHELD: contextFor(2, "E", false),
  REJECTED: rejectedContext(),
  ABSENT: sanitize.sanitizeHandoffContext(janusContext(null, false)),
};
var FULL_FLOW = ["LEGACY", "V1", "V2_E", "V2_J"];
var NO_SURVEY = ["WITHHELD", "REJECTED", "ABSENT"];

function startStaticServer() {
  var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/" || /^\/e\//.test(urlPath)) urlPath = "/index.html";
    var file = path.join(ROOT, urlPath);
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    var ext = path.extname(file);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "text/html" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve({ server: server, origin: "http://127.0.0.1:" + server.address().port });
    });
  });
}

async function waitInit(page) {
  await page.waitForFunction(function () {
    return !!(window.CZState && window.CZState.temporal && window.CZState.temporal.session_count >= 1);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  if (await page.$("#btn-miplan-consent-accept")) {
    await page.check("#chk-miplan-tc");
    await page.check("#chk-miplan-privacy");
    await page.click("#btn-miplan-consent-accept");
    await page.waitForTimeout(300);
  }
}

async function openPage(browser, origin, handoffContext) {
  var context = await browser.newContext({ locale: "es-UY" });
  await context.route("**/*", function (route) {
    var url = route.request().url();
    if (url.indexOf(origin + "/js/config.local.js") === 0) {
      return route.fulfill({ status: 200, contentType: "application/javascript", body: "CZ_BACKEND_API_URL = " + JSON.stringify(MOCK_API) + "; CZ_SHADOW_MODE = false;" });
    }
    if (url.indexOf(origin) === 0) return route.continue();
    if (url.indexOf(MOCK_API + "/v1/handoff/redeem") === 0) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, journey_id: "jrn-survey-v2", cached: false, durable: true, context: handoffContext }),
      });
    }
    return route.abort();
  });
  var page = await context.newPage();
  var errors = [];
  page.on("pageerror", function (e) { errors.push(String(e && e.message)); });
  await page.goto(origin + "/e/survey-v2-e2e-code");
  await waitInit(page);
  return { context: context, page: page, errors: errors };
}

async function typeAndBlur(page, selector, raw) {
  await page.fill(selector, raw);
  await page.press(selector, "Tab");
  await page.waitForTimeout(40);
}

function bootstrapInPage() {
  var st = window.CZState;
  var cached = null;
  try { cached = JSON.parse(sessionStorage.getItem("cz_handoff_context_v1")); } catch (_e) { cached = null; }
  var resp = typeof PRE !== "undefined" && PRE.respuestas ? PRE.respuestas : {};
  var letters = {};
  Object.keys(resp).forEach(function (k) { if (resp[k] != null) letters[k] = resp[k]; });
  return {
    pre_respuestas: letters,
    tiene_encuesta: typeof TIENE_ENCUESTA !== "undefined" ? TIENE_ENCUESTA : null,
    segmento: typeof SEGMENTO !== "undefined" ? SEGMENTO : null,
    diag_source: st._diagSource || null,
    pre_ingreso: typeof PRE !== "undefined" ? PRE.ingreso : null,
    income_source: st.income_source || null,
    step: st.step,
    miplan_started: !!st.miplan_started,
    survey_v2_completed: st._handoffSurveyV2Completed === true,
    recovery_state: st.user_recovery_state || null,
    survey_completed_at: st.temporal ? st.temporal.survey_completed_at || null : null,
    bridge_screen: !!document.getElementById("btn-bridge-survey"),
    debts_screen: !!document.getElementById("btn-agregar-deuda"),
    session_survey: cached && cached.survey ? cached.survey : null,
    session_survey_handoff: cached && cached.survey_handoff ? cached.survey_handoff : null,
    session_survey_rejected: cached && cached.survey_rejected ? cached.survey_rejected : null,
  };
}

async function clickContinue(page) {
  await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
  await page.waitForTimeout(300);
}

async function toDashboard(page) {
  var trail = [];
  trail.push(await page.evaluate(function () { return window.CZState.step; }));
  if (await page.isVisible("#inp-ingreso-mensual")) {
    await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
    await page.click("#btn-continuar-ingreso");
    await page.waitForTimeout(300);
  }
  try {
    await page.waitForSelector("#btn-agregar-deuda", { timeout: 15000 });
  } catch (e) {
    var where = await page.evaluate(function () {
      var ids = Array.prototype.map.call(document.querySelectorAll("#main-content [id]"), function (n) { return n.id; });
      return { step: window.CZState.step, ids: ids.slice(0, 40) };
    });
    throw new Error("debt step not reached: " + JSON.stringify(where));
  }
  await page.click("#btn-agregar-deuda");
  await page.waitForSelector('[data-deuda-field="monto"]');
  var idx = await page.evaluate(function () { return window.CZState.editing_debt_index; });
  var sel = function (f) { return '[data-deuda-field="' + f + '"][data-deuda-idx="' + idx + '"]'; };
  await page.selectOption(sel("tipo"), "prestamo");
  await page.fill(sel("acreedor"), "Banco QA");
  await typeAndBlur(page, sel("monto"), "120.000");
  await page.click('[data-deuda-situacion="pagando_normal"][data-deuda-idx="' + idx + '"]');
  await typeAndBlur(page, sel("pago"), "6.500");
  await page.click("#btn-guardar-deuda-edicion");
  await page.waitForTimeout(200);
  await clickContinue(page);
  await page.waitForSelector('[data-gasto="vivienda"]');
  await typeAndBlur(page, '[data-gasto="vivienda"]', "20.000");
  trail.push(await page.evaluate(function () { return window.CZState.step; }));
  await clickContinue(page);
  await page.waitForTimeout(300);
  trail.push(await page.evaluate(function () { return window.CZState.step; }));
  return trail;
}

function outcomeInPage() {
  var st = window.CZState;
  var d = st.diag || {};
  var ei = window.CZShadowDiagnosis.buildEngineInput(st);
  var resp = typeof PRE !== "undefined" && PRE.respuestas ? PRE.respuestas : {};
  return {
    step: st.step,
    plan_id: d.planId != null ? d.planId : null,
    enc: d.enc ? { score: d.enc.score, nivel: d.enc.nivel, flags: d.enc.flagsRiesgo } : null,
    enc_without_survey: (function () {
      var e = calcularEncuesta(null);
      return { score: e.score, nivel: e.nivel, flags: e.flagsRiesgo };
    })(),
    score_reset: d.scoreReset != null ? d.scoreReset : null,
    nivel_r: d.nivelR || null,
    pre_letters: Object.keys(resp).filter(function (k) { return resp[k] != null; }).length,
    tiene_encuesta: typeof TIENE_ENCUESTA !== "undefined" ? TIENE_ENCUESTA : null,
    refine_survey_cta: !!document.getElementById("btn-refinar-diagnostico"),
    bridge_screen: !!document.getElementById("btn-bridge-survey"),
    deudas: st.deudas,
    gastos: st.gastos,
    engine_input: ei,
  };
}

function strategyView(engineInput) {
  var r = classify(JSON.parse(JSON.stringify(engineInput)));
  return {
    strategy: r.strategy,
    classification_status: r.classification_status,
    entry_reasons: r.entry_reasons,
    verification_required: r.verification_required,
    verification_reasons: r.verification_reasons,
    missing_required_facts: r.missing_required_facts,
    canonical_facts: r.canonical_facts,
  };
}

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail) : ""));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function legacyView(b) {
  return { pre_respuestas: b.pre_respuestas, tiene_encuesta: b.tiene_encuesta, segmento: b.segmento,
    diag_source: b.diag_source, pre_ingreso: b.pre_ingreso, income_source: b.income_source, step: b.step,
    miplan_started: b.miplan_started, bridge_screen: b.bridge_screen, recovery_state: b.recovery_state,
    survey_completed: !!b.survey_completed_at, survey_v2_completed: b.survey_v2_completed };
}
var ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function stable(x) {
  return JSON.parse(JSON.stringify(x), function (_k, v) {
    if (typeof v !== "string") return v;
    if (ISO_TS.test(v)) return "<ts>";
    if (/^deuda_\d+$/.test(v)) return "<debt_id>";
    return v;
  });
}
function diffPaths(a, b, prefix, acc) {
  acc = acc || [];
  prefix = prefix || "";
  if (a && b && typeof a === "object" && typeof b === "object") {
    Object.keys(Object.assign({}, a, b)).forEach(function (k) { diffPaths(a[k], b[k], prefix + "." + k, acc); });
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    acc.push(prefix + ": " + JSON.stringify(a) + " vs " + JSON.stringify(b));
  }
  return acc;
}
function engineView(o) {
  var ei = stable(o.engine_input);
  return { plan_id: o.plan_id, enc: o.enc, score_reset: o.score_reset, nivel_r: o.nivel_r, engine_input: ei, strategy: strategyView(ei) };
}

// Frontend isValidSurveyV2 vs server validateSurveyV2 on the same inputs.
function validatorMatrix() {
  var base = CASES.V2_E.survey;
  function mut(fn) { var s = JSON.parse(JSON.stringify(base)); fn(s); return s; }
  return [
    base,
    CASES.V2_J.survey,
    CASES.V1.survey,
    CASES.LEGACY.survey,
    null,
    [],
    mut(function (s) { s.source_survey_version = "2"; }),
    mut(function (s) { s.source_survey_version = 3; }),
    mut(function (s) { delete s.source_survey_version; }),
    mut(function (s) { s.respuestas.p7 = "E"; }),
    mut(function (s) { delete s.respuestas.p9; }),
    mut(function (s) { s.respuestas.p1 = "E"; }),
    mut(function (s) { s.respuestas.p1 = "a"; }),
    mut(function (s) { s.respuestas = []; }),
    mut(function (s) { s.loan_purpose = "E"; }),
    mut(function (s) { delete s.loan_purpose; }),
    mut(function (s) { delete s.provenance; }),
    mut(function (s) { s.provenance = { source_survey_version: 1 }; }),
    mut(function (s) { s.provenance = "credizona"; }),
    mut(function (s) { s.provenance = {}; }),
  ];
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var srv = await startStaticServer();
  var browser = await chromium.launch();
  var out = {};
  var refreshV2 = null;
  var matrix = validatorMatrix();
  var fe = null;
  try {
    for (var name of FULL_FLOW) {
      var p = await openPage(browser, srv.origin, CASES[name]);
      var boot = await p.page.evaluate(bootstrapInPage);
      var trail = await toDashboard(p.page);
      out[name] = { boot: boot, trail: trail, outcome: await p.page.evaluate(outcomeInPage), errors: p.errors };
      if (name === "V2_E") {
        await p.page.reload();
        await waitInit(p.page);
        refreshV2 = { boot: await p.page.evaluate(bootstrapInPage), outcome: await p.page.evaluate(outcomeInPage) };
        fe = await p.page.evaluate(function (list) {
          return list.map(function (s) { return window.CZHandoffEntry.isValidSurveyV2(s); });
        }, matrix);
      }
      await p.context.close();
    }
    for (var n2 of NO_SURVEY) {
      var q = await openPage(browser, srv.origin, CASES[n2]);
      out[n2] = { boot: await q.page.evaluate(bootstrapInPage), errors: q.errors };
      await q.context.close();
    }
  } finally {
    await browser.close();
    srv.server.close();
  }

  var L = out.LEGACY, V1 = out.V1, E = out.V2_E, J = out.V2_J;
  FULL_FLOW.forEach(function (n) {
    check(n + ": real UI journey reached the dashboard with a legacy plan, no page errors",
      out[n].outcome.step === 3 && out[n].outcome.plan_id != null && !out[n].errors.length,
      { trail: out[n].trail, plan: out[n].outcome.plan_id, errors: out[n].errors });
  });

  // V1 unchanged
  check("V1 explicit bootstrap == pre-versioning (10 answers, TIENE_ENCUESTA, not V2)",
    same(legacyView(V1.boot), legacyView(L.boot)) && Object.keys(V1.boot.pre_respuestas).length === 10 &&
    V1.boot.tiene_encuesta === true && V1.boot.survey_v2_completed === false,
    diffPaths(legacyView(V1.boot), legacyView(L.boot)));
  check("V1 explicit: legacy plan, calcularEncuesta, scoreReset/nivelR, EngineInput and classifier == pre-versioning",
    same(engineView(V1.outcome), engineView(L.outcome)), diffPaths(engineView(V1.outcome), engineView(L.outcome)));
  check("V1 dashboard survey CTA / bridge == pre-versioning",
    V1.outcome.refine_survey_cta === L.outcome.refine_survey_cta && V1.outcome.bridge_screen === L.outcome.bridge_screen);
  check("V1 session cache carries source_survey_version 1",
    V1.boot.session_survey && V1.boot.session_survey.source_survey_version === 1);

  // V2 valid = survey completed, no legacy survey
  [["V2_E", E], ["V2_J", J]].forEach(function (pair) {
    var b = pair[1].boot, o = pair[1].outcome;
    check(pair[0] + ": survey recognised as completed (survey_completed recovery state + timestamp)",
      b.survey_v2_completed === true && b.recovery_state === "survey_completed" && !!b.survey_completed_at, legacyView(b));
    check(pair[0] + ": no bridge screen, flow starts at the financial steps (debts screen)",
      !b.bridge_screen && b.miplan_started && b.step === 1 && b.debts_screen, legacyView(b));
    check(pair[0] + ": no survey CTA on the dashboard", !o.refine_survey_cta && !o.bridge_screen);
    check(pair[0] + ": legacy survey unavailable — PRE.respuestas empty, TIENE_ENCUESTA false (bootstrap and dashboard)",
      Object.keys(b.pre_respuestas).length === 0 && b.tiene_encuesta === false && o.pre_letters === 0 && o.tiene_encuesta === false,
      { boot: b.pre_respuestas, dashLetters: o.pre_letters });
    check(pair[0] + ": calcularEncuesta did not consume V2 (diag.enc == legacy no-survey output)",
      same(o.enc, o.enc_without_survey), { enc: o.enc, noSurvey: o.enc_without_survey });
  });
  check("V2 session context keeps source_survey_version 2 + loan_purpose + provenance",
    E.boot.session_survey && E.boot.session_survey.source_survey_version === 2 &&
    E.boot.session_survey.loan_purpose === "purchase_or_home_improvement" &&
    J.boot.session_survey && J.boot.session_survey.loan_purpose === "other" &&
    E.boot.session_survey.provenance && E.boot.session_survey.provenance.source_system === "credizona", E.boot.session_survey);
  check("V2-10 same facts, P7 E vs J: legacy plan/enc/scoreReset/nivelR, EngineInput and shadow strategy identical",
    same(engineView(E.outcome), engineView(J.outcome)), diffPaths(engineView(E.outcome), engineView(J.outcome)));
  check("V2-10 loan_purpose never reaches EngineInput",
    JSON.stringify(E.outcome.engine_input).indexOf("loan_purpose") === -1 &&
    JSON.stringify(E.outcome.engine_input).indexOf("purchase_or_home_improvement") === -1 &&
    E.outcome.engine_input.tiene_encuesta === false);
  check("V2 and V1 differ only in legacy-survey inputs (same financial facts in the classifier)",
    same(strategyView(stable(E.outcome.engine_input)).canonical_facts, strategyView(stable(V1.outcome.engine_input)).canonical_facts));
  check("V2 refresh: stays on the dashboard, still completed, no bridge / survey CTA",
    refreshV2 && refreshV2.outcome.step === 3 && refreshV2.boot.survey_v2_completed === true &&
    !refreshV2.outcome.bridge_screen && !refreshV2.outcome.refine_survey_cta &&
    refreshV2.outcome.pre_letters === 0 && same(refreshV2.outcome.enc, E.outcome.enc),
    refreshV2 && legacyView(refreshV2.boot));

  // withheld / rejected / absent: never survey_completed
  NO_SURVEY.forEach(function (n) {
    var b = out[n].boot;
    check(n + ": not a completed survey — bridge screen at step 0, no survey_completed state, no page errors",
      b.survey_v2_completed === false && b.bridge_screen && b.step === 0 && !b.miplan_started &&
      b.recovery_state !== "survey_completed" && !b.survey_completed_at &&
      Object.keys(b.pre_respuestas).length === 0 && b.tiene_encuesta === false && !out[n].errors.length,
      { boot: legacyView(b), errors: out[n].errors });
  });
  check("WITHHELD: withheld reason kept, no survey block",
    !out.WITHHELD.boot.session_survey && out.WITHHELD.boot.session_survey_handoff &&
    out.WITHHELD.boot.session_survey_handoff.reason === "survey_v2_handoff_disabled");
  check("REJECTED: sanitizer rejection kept, no survey block",
    !out.REJECTED.boot.session_survey && out.REJECTED.boot.session_survey_rejected &&
    out.REJECTED.boot.session_survey_rejected.reason === "survey_version_unknown", out.REJECTED.boot);
  check("ABSENT: no survey, no withheld, no rejection",
    !out.ABSENT.boot.session_survey && !out.ABSENT.boot.session_survey_handoff && !out.ABSENT.boot.session_survey_rejected);
  check("WITHHELD / REJECTED / ABSENT land on the same legacy state",
    same(legacyView(out.WITHHELD.boot), legacyView(out.REJECTED.boot)) &&
    same(legacyView(out.WITHHELD.boot), legacyView(out.ABSENT.boot)));

  var be = matrix.map(function (s) { return surveyV2.validateSurveyV2(s).ok; });
  check("frontend isValidSurveyV2 == server validateSurveyV2 (" + matrix.length + " inputs, " +
    be.filter(Boolean).length + " valid)", same(fe, be) && be[0] === true && be[1] === true, { fe: fe, be: be });

  var failed = results.filter(function (r) { return !r.ok; }).length;
  if (asJson) console.log(JSON.stringify(out, null, 2));
  console.log("summary: " + FULL_FLOW.map(function (n) {
    var o = out[n].outcome;
    return n + " steps=" + out[n].trail.join(">") + " plan=" + o.plan_id + " enc=" + (o.enc ? o.enc.score + "/" + o.enc.nivel : "none") +
      " scoreReset=" + o.score_reset + "/" + o.nivel_r + " strategy=" + strategyView(o.engine_input).classification_status;
  }).join(" | "));
  console.log("SURVEY_V2_HANDOFF_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
