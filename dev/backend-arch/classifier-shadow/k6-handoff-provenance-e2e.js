/**
 * CLASSIFIER-INPUT-BOUNDARY-01 — K6 handoff income provenance, real browser (Playwright).
 *
 * Serves the repo on localhost, overrides config.local.js so the backend API points to a
 * mock host, mocks POST /v1/handoff/redeem, and ABORTS every other non-localhost request
 * (production Railway backend, GTM, CRM). No real data is read or written.
 *
 * For each case it captures the EngineInput built by the real
 * CZShadowDiagnosis.buildEngineInput(CZState) and runs the shadow classifier on it.
 *
 * Usage: node dev/backend-arch/classifier-shadow/k6-handoff-provenance-e2e.js [--json]
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var chromium = require("playwright").chromium;
var classify = require("../../../engine/classifier/financial-classifier").classifyFinancialShadow;
var extractEngineInput = require("../../../server/modules/diagnosis/service").extractEngineInput;

var ROOT = path.join(__dirname, "..", "..", "..");
var MOCK_API = "http://miplan-mock.test";
var HANDOFF_INCOME = 50000;
var USER_INCOME = 60000;

var MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

function startStaticServer() {
  var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/" || /^\/e\//.test(urlPath)) urlPath = "/index.html";
    var file = path.join(ROOT, urlPath);
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve({ server: server, origin: "http://127.0.0.1:" + server.address().port });
    });
  });
}

function handoffContext(withSurvey, withLaboral) {
  var ctx = {
    contract_version: 1,
    context: { funnel: "credizona_rejected" },
    provenance: { source_system: "janus" },
    person: { nombre: "QA K6", email: "qa-k6@example.test" },
    financial_prefill: { ingreso: HANDOFF_INCOME },
  };
  if (withLaboral) ctx.financial_prefill.laboral = "relacion_dependencia";
  if (withSurvey) {
    ctx.survey = {
      selection_rule: "lifetime_ci",
      respuestas: { p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p7: "B", p8: "B", p9: "B", p10: "B" },
    };
  }
  return ctx;
}

async function newPage(browser, origin, ctx, blocked) {
  var context = await browser.newContext();
  var page = await context.newPage();
  await page.route("**/*", function (route) {
    var url = route.request().url();
    if (url.indexOf(origin + "/js/config.local.js") === 0) {
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "CZ_BACKEND_API_URL = " + JSON.stringify(MOCK_API) + "; CZ_SHADOW_MODE = false;",
      });
    }
    if (url.indexOf(origin) === 0) return route.continue();
    if (url.indexOf(MOCK_API + "/v1/handoff/redeem") === 0) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, context: ctx, journey_id: "jrn-qa-k6", cached: false, durable: true }),
      });
    }
    blocked.push(url.split("?")[0]);
    return route.abort();
  });
  return page;
}

async function waitInit(page) {
  await page.waitForFunction(function () {
    return !!(window.CZState && window.CZState.temporal && window.CZState.temporal.session_count >= 1);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
}

function captureInPage() {
  var st = window.CZState;
  var ei = window.CZShadowDiagnosis.buildEngineInput(st);
  var stored = null;
  try {
    stored = JSON.parse(localStorage.getItem("cr_v3") || "null");
  } catch (e) {}
  return {
    url_path: location.pathname + location.search,
    income_source: st.income_source,
    declared_ingreso: st.declared_ingreso,
    pre_ingreso: typeof PRE !== "undefined" ? PRE.ingreso : undefined,
    diag_source: st._diagSource,
    deudas_count: (st.deudas || []).length,
    gastos: st.gastos,
    engine_input: ei,
    stored_income_source: stored ? stored.income_source : null,
    stored_declared_ingreso: stored ? stored.declared_ingreso : null,
    stored_deudas_count: stored && stored.deudas ? stored.deudas.length : null,
  };
}

function seedUserFinancialsInPage() {
  var st = window.CZState;
  st.deudas = [{ id: "d_qa", acreedor: "Banco QA", tipo: "prestamo", situacion_ui: "pagando_normal", estado: "al_dia", monto: 100000, pago: 5000 }];
  st.gastos = { vivienda: 20000 };
  st.financial_debts_complete = true;
  st.financial_expenses_complete = true;
  window.guardarLocal();
}

function userUpdateViaIncomeToolInPage(value) {
  var st = window.CZState;
  st.step = 3;
  var el = document.getElementById("ing-formal");
  if (!el) {
    el = document.createElement("input");
    el.id = "ing-formal";
    document.body.appendChild(el);
  }
  el.value = String(value);
  return window.guardarIngresoActualizado();
}

function userSubmitProfileFormInPage(value) {
  var st = window.CZState;
  applyBasicProfileSubmission(st, { name: "QA K6", email: "qa-k6@example.test", incomeVal: value, laboral: "relacion_dependencia" });
  window.guardarLocal();
  return true;
}

function incomeReasonsOf(r) {
  return r.verification_reasons
    .filter(function (v) { return v.fact === "monthly_income"; })
    .map(function (v) { return v.code; });
}

function summarize(label, cap) {
  var r = classify(JSON.parse(JSON.stringify(cap.engine_input)));
  var incomeReasons = incomeReasonsOf(r);
  var viaServer = classify(extractEngineInput(JSON.parse(JSON.stringify(cap.engine_input))));
  var fp = cap.engine_input.entry_context && cap.engine_input.entry_context.field_provenance
    ? cap.engine_input.entry_context.field_provenance.ingreso
    : null;
  return {
    case: label,
    url_path: cap.url_path,
    state_income_source: cap.income_source,
    state_declared_ingreso: cap.declared_ingreso,
    PRE_ingreso: cap.pre_ingreso,
    engine_input_ingreso: cap.engine_input.ingreso,
    engine_input_declared_ingreso: cap.engine_input.declared_ingreso,
    field_provenance_ingreso: fp,
    classifier_monthly_income: r.canonical_facts.monthly_income,
    classifier_income_reasons: incomeReasons,
    classifier_income_provenance: r.provenance.income,
    server_path_same_income:
      JSON.stringify(viaServer.canonical_facts.monthly_income) === JSON.stringify(r.canonical_facts.monthly_income) &&
      JSON.stringify(incomeReasonsOf(viaServer)) === JSON.stringify(incomeReasons),
    diag_source: cap.diag_source,
    deudas_count: cap.deudas_count,
    gastos: cap.gastos,
    localStorage: { income_source: cap.stored_income_source, declared_ingreso: cap.stored_declared_ingreso, deudas: cap.stored_deudas_count },
  };
}

async function runScenario(browser, origin, opts) {
  var blocked = [];
  var ctx = handoffContext(opts.withSurvey, opts.withLaboral);
  var page = await newPage(browser, origin, ctx, blocked);
  var errors = [];
  page.on("pageerror", function (e) { errors.push(String(e && e.message)); });
  var out = { scenario: opts.name, cases: [] };

  await page.goto(origin + "/e/k6-qa-code-" + opts.name);
  await waitInit(page);
  out.cases.push(summarize("1_handoff_unconfirmed", await page.evaluate(captureInPage)));

  await page.evaluate(seedUserFinancialsInPage);
  var updated = opts.updatePath === "profile_form"
    ? await page.evaluate(userSubmitProfileFormInPage, USER_INCOME)
    : await page.evaluate(userUpdateViaIncomeToolInPage, USER_INCOME);
  var c2 = summarize("2_user_update_no_refresh(" + opts.updatePath + ")", await page.evaluate(captureInPage));
  c2.update_handler_returned = updated;
  out.cases.push(c2);

  await page.reload();
  await waitInit(page);
  out.cases.push(summarize("3_after_refresh", await page.evaluate(captureInPage)));

  out.page_errors = errors;
  out.blocked_external_requests = blocked.filter(function (u, i, a) { return a.indexOf(u) === i; });
  await page.context().close();
  return out;
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var srv = await startStaticServer();
  var browser = await chromium.launch();
  var scenarios = [
    { name: "S1_survey_income_tool", withSurvey: true, withLaboral: true, updatePath: "income_tool" },
    { name: "S2_nosurvey_income_tool", withSurvey: false, withLaboral: true, updatePath: "income_tool" },
    { name: "S3_survey_profile_form", withSurvey: true, withLaboral: false, updatePath: "profile_form" },
  ];
  var results = [];
  try {
    for (var i = 0; i < scenarios.length; i++) {
      results.push(await runScenario(browser, srv.origin, scenarios[i]));
    }
  } finally {
    await browser.close();
    srv.server.close();
  }

  // K6 safety properties (must hold) vs. refresh findings (reported, not asserted).
  var checks = [];
  function check(name, cond) { checks.push({ name: name, ok: !!cond }); }
  results.forEach(function (s) {
    var c1 = s.cases[0];
    var c2 = s.cases[1];
    var c3 = s.cases[2];
    // V2-HANDOFF-INCOME-AUTHORITY-01: handoff income is user-declared in Credizona (no reconfirmation).
    check(s.scenario + " case1 handoff income is declared income (known, provenance handoff)",
      c1.classifier_monthly_income === HANDOFF_INCOME && c1.classifier_income_reasons.length === 0 &&
      c1.classifier_income_provenance.source === "handoff" && c1.classifier_income_provenance.nature === "user_declared");
    check(s.scenario + " case2 update handler ran", c2.update_handler_returned === true);
    check(s.scenario + " case2 classifier uses user value " + USER_INCOME,
      c2.engine_input_ingreso === USER_INCOME && c2.classifier_monthly_income === USER_INCOME && c2.classifier_income_reasons.length === 0);
    check(s.scenario + " case3 income after refresh is the user correction or the declared handoff value, never a mix",
      (c3.classifier_monthly_income === USER_INCOME && c3.state_income_source !== "handoff") ||
      (c3.classifier_monthly_income === HANDOFF_INCOME && c3.state_income_source === "handoff"));
    s.cases.forEach(function (c) {
      check(s.scenario + " " + c.case + " server extractEngineInput preserves income provenance", c.server_path_same_income);
    });
    s.refresh_finding = c3.engine_input_ingreso === USER_INCOME && c3.state_income_source === c2.state_income_source
      ? "USER_CORRECTION_PRESERVED"
      : "USER_CORRECTION_LOST (income=" + c3.engine_input_ingreso + " source=" + c3.state_income_source +
        " deudas " + c2.deudas_count + "->" + c3.deudas_count + ")";
  });
  var failedChecks = checks.filter(function (c) { return !c.ok; });
  if (failedChecks.length) process.exitCode = 1;

  if (asJson) {
    console.log(JSON.stringify({ results: results, checks: checks }, null, 2));
    return;
  }
  results.forEach(function (s) {
    console.log("=".repeat(78));
    console.log(s.scenario);
    s.cases.forEach(function (c) {
      console.log("  " + c.case + "  [" + c.url_path + "]");
      console.log("    state: income_source=" + c.state_income_source + " declared_ingreso=" + c.state_declared_ingreso + " PRE.ingreso=" + c.PRE_ingreso +
        (c.update_handler_returned !== undefined ? " handler_returned=" + c.update_handler_returned : ""));
      console.log("    EngineInput: ingreso=" + c.engine_input_ingreso + " declared_ingreso=" + c.engine_input_declared_ingreso +
        " field_provenance.ingreso=" + JSON.stringify(c.field_provenance_ingreso));
      console.log("    classifier: monthly_income=" + c.classifier_monthly_income + " income_reasons=" + JSON.stringify(c.classifier_income_reasons));
      console.log("    other: diag_source=" + c.diag_source + " deudas=" + c.deudas_count + " gastos=" + JSON.stringify(c.gastos) +
        " localStorage=" + JSON.stringify(c.localStorage));
    });
    if (s.page_errors.length) console.log("  page_errors: " + JSON.stringify(s.page_errors));
    console.log("  blocked external requests: " + JSON.stringify(s.blocked_external_requests));
    console.log("  REFRESH FINDING: " + s.refresh_finding);
  });
  console.log("=".repeat(78));
  checks.forEach(function (c) { if (!c.ok) console.log("FAIL " + c.name); });
  console.log("K6_SAFETY_CHECKS: " + (checks.length - failedChecks.length) + "/" + checks.length + (failedChecks.length ? " FAIL" : " PASS"));
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
