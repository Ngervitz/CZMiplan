/**
 * P-05 — handoff rehydration precedence, real browser (Playwright).
 *
 * The handoff is the journey's initial bootstrap; later persisted user state for the
 * same journey must win over the cached handoff on every refresh.
 *
 * Serves the repo on localhost, points CZ_BACKEND_API_URL to a mock host, mocks
 * POST /v1/handoff/redeem (journey_id = "jrn-" + code) and ABORTS every other external
 * request. User actions go through the real DOM (typing, blur, clicks) except where
 * noted. EngineInput comes from the real CZShadowDiagnosis.buildEngineInput(CZState)
 * and is classified directly and through the server's extractEngineInput.
 *
 * Release boundary. The default run is the P-05 gate of the current release: it depends only
 * on the UI shipped with it (type=number expense inputs, digit amounts, no field_provenance,
 * profile submit -> income_source "user_input"). Assertions owned by fronts outside this
 * release are kept here and run only when that front is requested:
 *   --with-monetary  MONETARY-CONTRACT-01: debts / expenses typed in human format ("120.000",
 *                    "6.500,50", "20.000", "15.000,50") are stored canonical (monto "120000",
 *                    pago 6500.5, gastos 20000 / 15000.5) and survive refresh.
 *   --with-entry01   ENTRY-01: entry_context.field_provenance.ingreso matches the income
 *                    authority (handoff -> source "handoff", user_modified false; user change ->
 *                    user_modified true).
 *   --with-k6a4      K6/A4: an untouched handoff income keeps income_source "handoff" on profile
 *                    submit; re-typing it (even the same value) -> "user_update". With
 *                    --with-entry01 the provenance of both submits is asserted too.
 * All three together reproduce the original combined gate. A front flag on a tree that does not
 * contain that front fails by design; those runs are not gates of the current release.
 *
 * Usage: node dev/backend-arch/classifier-shadow/p05-handoff-rehydration-e2e.js
 *          [--with-monetary] [--with-entry01] [--with-k6a4] [--json]
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
var FRONTS = {
  monetary: process.argv.indexOf("--with-monetary") !== -1,
  entry01: process.argv.indexOf("--with-entry01") !== -1,
  k6a4: process.argv.indexOf("--with-k6a4") !== -1,
};
var TYPED = FRONTS.monetary
  ? { monto: "120.000", pago: "6.500,50", vivienda: "20.000", alimentacion: "15.000,50" }
  : { monto: "120000", pago: "6500", vivienda: "20000", alimentacion: "15000" };
var EXPECTED = FRONTS.monetary
  ? { monto: 120000, pago: 6500.5, vivienda: 20000, alimentacion: 15000.5, expenses: 35000.5 }
  : { monto: 120000, pago: 6500, vivienda: 20000, alimentacion: 15000, expenses: 35000 };
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

function handoffContext(income, withLaboral) {
  var ctx = {
    contract_version: 1,
    context: { funnel: "credizona_rejected" },
    provenance: { source_system: "janus" },
    person: { nombre: "QA P05", email: "qa-p05@example.test" },
    financial_prefill: { ingreso: income },
    survey: {
      selection_rule: "lifetime_ci",
      respuestas: { p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p7: "B", p8: "B", p9: "B", p10: "B" },
    },
  };
  if (withLaboral) ctx.financial_prefill.laboral = "relacion_dependencia";
  return ctx;
}

async function newContext(browser, origin, ctxByCode, blocked, apiCalls) {
  var context = await browser.newContext({ locale: "es-UY" });
  await context.route("**/*", function (route) {
    var req = route.request();
    var url = req.url();
    if (url.indexOf(MOCK_API) === 0) apiCalls.push(req.method() + " " + url.slice(MOCK_API.length).split("?")[0]);
    if (url.indexOf(origin + "/js/config.local.js") === 0) {
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "CZ_BACKEND_API_URL = " + JSON.stringify(MOCK_API) + "; CZ_SHADOW_MODE = false;",
      });
    }
    if (url.indexOf(origin) === 0) return route.continue();
    if (url.indexOf(MOCK_API + "/v1/handoff/redeem") === 0) {
      var code = "";
      try { code = JSON.parse(req.postData() || "{}").handoff_code || ""; } catch (e) {}
      var ctx = ctxByCode[code];
      if (!ctx) return route.fulfill({ status: 404, contentType: "application/json", body: '{"code":"not_found"}' });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, context: ctx, journey_id: "jrn-" + code, cached: false, durable: true }),
      });
    }
    blocked.push(url.split("?")[0]);
    return route.abort();
  });
  return context;
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

function captureInPage() {
  var st = window.CZState;
  var ei = window.CZShadowDiagnosis.buildEngineInput(st);
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem("cr_v3") || "null"); } catch (e) {}
  return {
    step: st.step,
    journey_id: st._journeyId || null,
    income_source: st.income_source,
    declared_ingreso: st.declared_ingreso,
    pre_ingreso: typeof PRE !== "undefined" ? PRE.ingreso : undefined,
    deudas: (st.deudas || []).map(function (d) {
      return { acreedor: d.acreedor, monto: d.monto, pago: d.pago, situacion_ui: d.situacion_ui };
    }),
    gastos: st.gastos,
    engine_input: ei,
    stored_journey: stored ? stored.handoff_journey_id : null,
  };
}

function summarize(label, cap) {
  var r = classify(JSON.parse(JSON.stringify(cap.engine_input)));
  var viaServer = classify(extractEngineInput(JSON.parse(JSON.stringify(cap.engine_input))));
  var fp = cap.engine_input.entry_context && cap.engine_input.entry_context.field_provenance
    ? cap.engine_input.entry_context.field_provenance.ingreso
    : null;
  var reasons = r.verification_reasons.filter(function (v) { return v.fact === "monthly_income"; }).map(function (v) { return v.code; });
  return {
    case: label,
    step: cap.step,
    journey_id: cap.journey_id,
    stored_journey: cap.stored_journey,
    income_source: cap.income_source,
    declared_ingreso: cap.declared_ingreso,
    PRE_ingreso: cap.pre_ingreso,
    engine_input_ingreso: cap.engine_input.ingreso,
    field_provenance_ingreso: fp,
    classifier_monthly_income: r.canonical_facts.monthly_income,
    classifier_monthly_expenses: r.canonical_facts.monthly_expenses,
    classifier_income_reasons: reasons,
    server_path_same:
      JSON.stringify(viaServer.canonical_facts) === JSON.stringify(r.canonical_facts),
    deudas: cap.deudas,
    gastos: cap.gastos,
  };
}

function persistentView(c) {
  return JSON.stringify({
    income_source: c.income_source, declared_ingreso: c.declared_ingreso, PRE_ingreso: c.PRE_ingreso,
    fp: c.field_provenance_ingreso, income: c.classifier_monthly_income, expenses: c.classifier_monthly_expenses,
    deudas: c.deudas, gastos: c.gastos, step: c.step,
  });
}

async function clickContinue(page) {
  // #sticky-cta is the app's own "Continuar" (next()); the sticky bar is hidden on this
  // headless desktop viewport, so the click is dispatched on the element itself.
  await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
  await page.waitForTimeout(300);
}

async function snap(page, label) {
  return summarize(label, await page.evaluate(captureInPage));
}

async function reload(page) {
  await page.reload();
  await waitInit(page);
}

async function addDebtViaUi(page, monto, pago) {
  await page.click("#btn-agregar-deuda");
  await page.waitForSelector('[data-deuda-field="monto"]');
  var idx = await page.evaluate(function () { return window.CZState.editing_debt_index; });
  var sel = function (f) { return '[data-deuda-field="' + f + '"][data-deuda-idx="' + idx + '"]'; };
  await page.selectOption(sel("tipo"), "prestamo");
  await page.fill(sel("acreedor"), "Banco QA");
  await page.fill(sel("monto"), monto);
  await page.press(sel("monto"), "Tab");
  await page.click('[data-deuda-situacion="pagando_normal"][data-deuda-idx="' + idx + '"]');
  await page.fill(sel("pago"), pago);
  await page.press(sel("pago"), "Tab");
  await page.click("#btn-guardar-deuda-edicion");
  await page.waitForTimeout(200);
}

async function fillGastoViaUi(page, key, value) {
  var s = '[data-gasto="' + key + '"]';
  var visible = await page.isVisible(s);
  if (!visible) {
    await page.evaluate(function (k) {
      var inp = document.querySelector('[data-gasto="' + k + '"]');
      var item = inp && inp.closest(".accordion-item");
      var trig = item && item.querySelector("[data-accordion]");
      if (trig) trig.click();
    }, key);
  }
  await page.fill(s, value);
  await page.press(s, "Tab");
}

async function ensureIncomeTool(page) {
  var present = await page.$("#ing-formal");
  if (present) return "rendered_by_app";
  // Income tool lives in Plan 1 herramientas; the plan depends on the diagnosis, so the
  // real renderer is mounted directly (same handlers via #main-content delegation).
  await page.evaluate(function () {
    document.getElementById("main-content").insertAdjacentHTML("beforeend", renderHerramientasPlan1());
  });
  return "mounted_renderHerramientasPlan1";
}

async function scenarioIncomeTool(browser, origin) {
  var blocked = [];
  var apiCalls = [];
  var code = "p05-a";
  var ctxByCode = {};
  ctxByCode[code] = handoffContext(50000, true);
  ctxByCode["p05-c"] = handoffContext(70000, true);
  var context = await newContext(browser, origin, ctxByCode, blocked, apiCalls);
  var page = await context.newPage();
  var errors = [];
  page.on("pageerror", function (e) { errors.push(String(e && e.message)); });
  var out = { scenario: "A_income_tool", cases: [] };

  await page.goto(origin + "/e/" + code);
  await waitInit(page);
  out.cases.push(await snap(page, "A0_bootstrap"));

  await reload(page);
  out.cases.push(await snap(page, "P05-1_untouched_refresh"));

  await addDebtViaUi(page, TYPED.monto, TYPED.pago);
  await clickContinue(page);
  await page.waitForSelector('[data-gasto="vivienda"]');
  await fillGastoViaUi(page, "vivienda", TYPED.vivienda);
  await fillGastoViaUi(page, "alimentacion", TYPED.alimentacion);
  out.cases.push(await snap(page, "P05-5a_debt_and_expenses_entered"));
  await reload(page);
  out.cases.push(await snap(page, "P05-5b_after_refresh"));

  await clickContinue(page);
  var toolMount = await ensureIncomeTool(page);
  await page.fill("#ing-formal", "60000");
  await page.click("#btn-guardar-ingreso-actualizado");
  await page.waitForTimeout(300);
  var c2 = await snap(page, "P05-2_user_changes_income_60000");
  c2.income_tool = toolMount;
  out.cases.push(c2);

  await reload(page);
  out.cases.push(await snap(page, "P05-3_after_refresh"));
  for (var i = 1; i <= 3; i++) {
    await reload(page);
    out.cases.push(await snap(page, "P05-6_refresh_" + i));
  }

  // Control: a NEW handoff (different journey) still bootstraps from its own context.
  await page.goto(origin + "/e/p05-c");
  await waitInit(page);
  out.cases.push(await snap(page, "CTRL_new_journey_bootstraps"));

  out.page_errors = errors;
  out.blocked_external_requests = blocked.filter(function (u, i, a) { return a.indexOf(u) === i; });
  out.api_calls = apiCalls;
  await context.close();
  return out;
}

async function scenarioProfileForm(browser, origin, code, typeValue) {
  var blocked = [];
  var apiCalls = [];
  var ctxByCode = {};
  ctxByCode[code] = handoffContext(65000, false);
  var context = await newContext(browser, origin, ctxByCode, blocked, apiCalls);
  var page = await context.newPage();
  var errors = [];
  page.on("pageerror", function (e) { errors.push(String(e && e.message)); });
  var out = { scenario: "B_profile_form_" + (typeValue == null ? "untouched" : "typed_" + typeValue), cases: [] };

  await page.goto(origin + "/e/" + code);
  await waitInit(page);
  await page.waitForSelector("#inp-ingreso-mensual");
  var shown = await page.inputValue("#inp-ingreso-mensual");
  var c0 = await snap(page, "B0_form_prefilled");
  c0.input_display = shown;
  out.cases.push(c0);

  if (typeValue != null) {
    await page.click("#inp-ingreso-mensual");
    await page.fill("#inp-ingreso-mensual", "");
    await page.type("#inp-ingreso-mensual", typeValue);
  }
  await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
  await page.click("#btn-continuar-ingreso");
  await page.waitForTimeout(300);
  out.cases.push(await snap(page, "B1_submitted"));
  await reload(page);
  out.cases.push(await snap(page, "B2_after_refresh"));

  out.page_errors = errors;
  out.blocked_external_requests = blocked.filter(function (u, i, a) { return a.indexOf(u) === i; });
  out.api_calls = apiCalls;
  await context.close();
  return out;
}

async function scenarioLegacyStoredState(browser, origin) {
  var blocked = [];
  var apiCalls = [];
  var code = "p05-legacy";
  var ctxByCode = {};
  ctxByCode[code] = handoffContext(50000, true);
  var context = await newContext(browser, origin, ctxByCode, blocked, apiCalls);
  var page = await context.newPage();
  var out = { scenario: "D_state_saved_before_fix", cases: [] };
  await page.goto(origin + "/e/" + code);
  await waitInit(page);
  await addDebtViaUi(page, FRONTS.monetary ? "80.000" : "80000", FRONTS.monetary ? "4.000" : "4000");
  // Simulates state persisted by the previous build (no handoff_journey_id field).
  await page.evaluate(function () {
    var s = JSON.parse(localStorage.getItem("cr_v3"));
    delete s.handoff_journey_id;
    localStorage.setItem("cr_v3", JSON.stringify(s));
  });
  await reload(page);
  out.cases.push(await snap(page, "D1_refresh_without_journey_marker"));
  out.page_errors = [];
  out.blocked_external_requests = blocked.filter(function (u, i, a) { return a.indexOf(u) === i; });
  out.api_calls = apiCalls;
  await context.close();
  return out;
}

function byCase(s, name) {
  return s.cases.filter(function (c) { return c.case === name; })[0];
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var srv = await startStaticServer();
  var browser = await chromium.launch();
  var results = [];
  try {
    results.push(await scenarioIncomeTool(browser, srv.origin));
    results.push(await scenarioProfileForm(browser, srv.origin, "p05-b1", null));
    results.push(await scenarioProfileForm(browser, srv.origin, "p05-b2", "65000"));
    results.push(await scenarioProfileForm(browser, srv.origin, "p05-b3", "60000"));
    results.push(await scenarioLegacyStoredState(browser, srv.origin));
  } finally {
    await browser.close();
    srv.server.close();
  }

  var checks = [];
  function check(name, cond) { checks.push({ name: name, ok: !!cond }); }
  // Front-owned assertions are tagged with their front and only exist when it is requested.
  var FP = FRONTS.entry01 ? " [+ENTRY-01 field_provenance]" : "";
  // V2-HANDOFF-INCOME-AUTHORITY-01: handoff income is user-declared in Credizona (no reconfirmation).
  function declaredHandoff(c) {
    return c && c.income_source === "handoff" &&
      (!FRONTS.entry01 || (c.field_provenance_ingreso && c.field_provenance_ingreso.source === "handoff" &&
        c.field_provenance_ingreso.user_modified === false)) &&
      c.classifier_monthly_income === c.declared_ingreso &&
      c.classifier_income_reasons.length === 0;
  }
  function userAuthority(c) {
    return c && c.income_source === "user_update" &&
      (!FRONTS.entry01 || (c.field_provenance_ingreso && c.field_provenance_ingreso.user_modified === true));
  }
  function onlyOneRedeemPerJourney(s, journeys) {
    return JSON.stringify(s.api_calls) === JSON.stringify(journeys.map(function () { return "POST /v1/handoff/redeem"; }));
  }

  var A = results[0];
  var a0 = byCase(A, "A0_bootstrap");
  var p1 = byCase(A, "P05-1_untouched_refresh");
  var p5a = byCase(A, "P05-5a_debt_and_expenses_entered");
  var p5b = byCase(A, "P05-5b_after_refresh");
  var p2 = byCase(A, "P05-2_user_changes_income_60000");
  var p3 = byCase(A, "P05-3_after_refresh");
  var ctrl = byCase(A, "CTRL_new_journey_bootstraps");

  check("A0 bootstrap: handoff income declared (known), source=handoff (never user_entered)" + FP, declaredHandoff(a0));
  check("A0 journey persisted with state", a0.stored_journey === "jrn-p05-a");
  check("P05-1 untouched + refresh: still declared handoff income" + FP, declaredHandoff(p1) && p1.declared_ingreso === 50000);
  check("P05-5 debt typed '" + TYPED.monto + "'/'" + TYPED.pago + "' stored",
    p5a.deudas.length === 1 && Number(p5a.deudas[0].monto) === EXPECTED.monto && Number(p5a.deudas[0].pago) === EXPECTED.pago);
  check("P05-5 expenses typed '" + TYPED.vivienda + "'/'" + TYPED.alimentacion + "' stored",
    Number(p5a.gastos.vivienda) === EXPECTED.vivienda && Number(p5a.gastos.alimentacion) === EXPECTED.alimentacion &&
    p5a.classifier_monthly_expenses === EXPECTED.expenses);
  if (FRONTS.monetary) {
    check("[MONETARY-CONTRACT-01] P05-5 human-format amounts stored canonical (monto \"120000\", pago 6500.5, gastos 20000 / 15000.5)",
      p5a.deudas[0].monto === "120000" && p5a.deudas[0].pago === 6500.5 &&
      p5a.gastos.vivienda === 20000 && p5a.gastos.alimentacion === 15000.5);
  }
  check("P05-5 refresh keeps debts and expenses identical",
    JSON.stringify(p5b.deudas) === JSON.stringify(p5a.deudas) && JSON.stringify(p5b.gastos) === JSON.stringify(p5a.gastos));
  check("P05-5 refresh keeps step", p5b.step === p5a.step);
  check("P05-2 classifier uses 60000 with user authority" + FP,
    p2.engine_input_ingreso === 60000 && p2.classifier_monthly_income === 60000 && userAuthority(p2) &&
    p2.classifier_income_reasons.length === 0);
  check("P05-3 refresh keeps 60000 and user authority" + FP,
    p3.declared_ingreso === 60000 && p3.PRE_ingreso === 60000 && p3.classifier_monthly_income === 60000 && userAuthority(p3));
  check("P05-3 refresh keeps debts/expenses and step", JSON.stringify(p3.deudas) === JSON.stringify(p5a.deudas) &&
    JSON.stringify(p3.gastos) === JSON.stringify(p5a.gastos) && p3.step === p2.step);
  var after = A.cases.filter(function (c) { return /^P05-3|^P05-6/.test(c.case); });
  check("P05-3/6 handoff 50000 never reappears after the user change",
    after.every(function (c) { return c.declared_ingreso !== 50000 && c.PRE_ingreso !== 50000 && c.engine_input_ingreso !== 50000; }));
  check("P05-6 multiple refreshes are non-destructive (identical state)",
    after.every(function (c) { return persistentView(c) === persistentView(p3); }));
  check("CTRL new journey bootstraps from its own handoff (no state from the previous journey)" + FP,
    ctrl.journey_id === "jrn-p05-c" && ctrl.stored_journey === "jrn-p05-c" && ctrl.declared_ingreso === 70000 &&
    ctrl.deudas.length === 0 && Object.keys(ctrl.gastos || {}).length === 0 && declaredHandoff(ctrl));
  check("A refreshes never re-redeem the handoff and send no other backend request (one redeem per journey)",
    onlyOneRedeemPerJourney(A, ["p05-a", "p05-c"]));

  var B1 = results[1];
  var b0 = byCase(B1, "B0_form_prefilled");
  var b1s = byCase(B1, "B1_submitted");
  var b1r = byCase(B1, "B2_after_refresh");
  check("B form shows handoff income as digits", b0.input_display === "65000");
  check("B untouched submit: income 65000, profile step completed",
    b1s.declared_ingreso === 65000 && b1s.classifier_monthly_income === 65000 && b1s.step > b0.step);
  check("B untouched submit survives refresh (income, income_source, step)",
    b1r.declared_ingreso === 65000 && b1r.classifier_monthly_income === 65000 &&
    b1r.income_source === b1s.income_source && b1r.step === b1s.step);

  var B2 = results[2];
  var b2s = byCase(B2, "B1_submitted");
  var b2r = byCase(B2, "B2_after_refresh");
  check("P05-4 re-typing the same 65000 => income 65000, no income reasons",
    b2s.classifier_monthly_income === 65000 && b2s.classifier_income_reasons.length === 0);
  check("P05-4 re-typed submit survives refresh (income, income_source, step)",
    b2r.classifier_monthly_income === 65000 && b2r.income_source === b2s.income_source && b2r.step === b2s.step);

  var B3 = results[3];
  var b3s = byCase(B3, "B1_submitted");
  var b3r = byCase(B3, "B2_after_refresh");
  check("B typed 60000 => 60000", b3s.declared_ingreso === 60000 && b3s.classifier_monthly_income === 60000);
  check("B typed 60000 survives refresh (no 65000 back, step kept)",
    b3r.declared_ingreso === 60000 && b3r.PRE_ingreso === 60000 && b3r.classifier_monthly_income === 60000 && b3r.step === b3s.step);

  if (FRONTS.k6a4) {
    check("[K6-A4] B untouched submit keeps declared handoff income" + FP, declaredHandoff(b1s) && b1s.declared_ingreso === 65000);
    check("[K6-A4] B untouched submit survives refresh as declared handoff income" + FP, declaredHandoff(b1r));
    check("[K6-A4] P05-4 re-typing the same 65000 => user authority" + FP, userAuthority(b2s));
    check("[K6-A4] P05-4 re-typed vs untouched: authority distinguishable, same financial income" + FP,
      b2s.income_source !== b1s.income_source &&
      (!FRONTS.entry01 || b2s.field_provenance_ingreso.user_modified !== b1s.field_provenance_ingreso.user_modified) &&
      b2s.classifier_monthly_income === b1s.classifier_monthly_income);
    check("[K6-A4] P05-4 confirmation survives refresh" + FP, userAuthority(b2r) && b2r.classifier_monthly_income === 65000);
  }
  [B1, B2, B3].forEach(function (s) {
    check(s.scenario + " refresh never re-redeems the handoff (one redeem, no other backend request)", onlyOneRedeemPerJourney(s, [1]));
  });

  var D = results[4];
  var d1 = byCase(D, "D1_refresh_without_journey_marker");
  check("D state saved before this fix (no marker): one-time bootstrap from the handoff, then the journey marker is written",
    d1.journey_id === "jrn-p05-legacy" && d1.stored_journey === "jrn-p05-legacy" && declaredHandoff(d1));

  results.forEach(function (s) {
    s.cases.forEach(function (c) {
      check(s.scenario + " " + c.case + " server extractEngineInput same facts", c.server_path_same);
    });
    check(s.scenario + " no page errors", !s.page_errors.length);
  });

  var failed = checks.filter(function (c) { return !c.ok; });
  if (failed.length) process.exitCode = 1;
  if (asJson) {
    console.log(JSON.stringify({ results: results, checks: checks }, null, 2));
    return;
  }
  results.forEach(function (s) {
    console.log("=".repeat(78));
    console.log(s.scenario);
    s.cases.forEach(function (c) {
      console.log("  " + c.case + " step=" + c.step + " journey=" + c.journey_id + (c.input_display != null ? " input_display=" + JSON.stringify(c.input_display) : "") +
        (c.income_tool ? " income_tool=" + c.income_tool : ""));
      console.log("    income_source=" + c.income_source + " declared=" + c.declared_ingreso + " PRE=" + c.PRE_ingreso +
        " fp=" + JSON.stringify(c.field_provenance_ingreso) + " => income=" + c.classifier_monthly_income +
        " " + JSON.stringify(c.classifier_income_reasons));
      console.log("    deudas=" + JSON.stringify(c.deudas) + " gastos=" + JSON.stringify(c.gastos) + " expenses=" + c.classifier_monthly_expenses);
    });
    if (s.page_errors.length) console.log("  page_errors: " + JSON.stringify(s.page_errors));
    console.log("  blocked external requests: " + s.blocked_external_requests.length + "; mock backend calls: " + JSON.stringify(s.api_calls));
  });
  console.log("=".repeat(78));
  console.log("INFO D (state saved before this fix, no journey marker): deudas=" + d1.deudas.length +
    " income_source=" + d1.income_source + " — one-time bootstrap, then marker is written");
  checks.forEach(function (c) { console.log((c.ok ? "PASS " : "FAIL ") + c.name); });
  var mode = Object.keys(FRONTS).filter(function (k) { return FRONTS[k]; });
  console.log("P05_E2E[" + (mode.length ? "with " + mode.join("+") : "release-current") + "]: " +
    (checks.length - failed.length) + "/" + checks.length + (failed.length ? " FAIL" : " PASS"));
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
