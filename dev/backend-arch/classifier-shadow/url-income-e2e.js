/**
 * URL-INCOME-01 — ?ingreso= prefill: fail-closed grammar, provenance, touched signal and
 * journey precedence, real browser (Playwright).
 *
 * Grammar is PENDING CONTRACT: provisional strict technical ("65000", "65000.50"); any
 * form that also reads as Uruguayan thousands or is otherwise ambiguous is ignored.
 * Journey precedence uses the existing journey_id (A3 handoff); URL-only entries have no
 * journey_id, so their refresh precedence is reported as PENDING (observed, not asserted).
 *
 * Serves the repo on localhost, mocks POST /v1/handoff/redeem (journey_id = "jrn-" + code)
 * and aborts every other external request. User actions go through the real DOM.
 *
 * Usage: node dev/backend-arch/classifier-shadow/url-income-e2e.js [--json]
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
var MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
var SURVEY = "p1=B&p2=B&p3=B&p4=B&p5=B&p6=A&p7=B&p8=B&p9=B&p10=B";
var PROFILE = "nombre=QA%20URL&email=qa-url%40example.test&laboral=relacion_dependencia";

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

/** Handoff context without income: the URL is the only income prefill. */
function handoffContextNoIncome(withLaboral) {
  var ctx = {
    contract_version: 1,
    context: { funnel: "credizona_rejected" },
    provenance: { source_system: "janus" },
    person: { nombre: "QA URL", email: "qa-url@example.test" },
    financial_prefill: {},
    survey: {
      selection_rule: "lifetime_ci",
      respuestas: { p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p7: "B", p8: "B", p9: "B", p10: "B" },
    },
  };
  if (withLaboral) ctx.financial_prefill.laboral = "relacion_dependencia";
  return ctx;
}

async function newContext(browser, origin, ctxByCode, blocked) {
  var context = await browser.newContext({ locale: "es-UY" });
  await context.route("**/*", function (route) {
    var req = route.request();
    var url = req.url();
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
  var inp = document.getElementById("inp-ingreso-mensual");
  return {
    search: window.location.search,
    step: st.step,
    journey_id: st._journeyId || null,
    income_source: st.income_source,
    declared_ingreso: st.declared_ingreso,
    pre_ingreso: typeof PRE !== "undefined" ? PRE.ingreso : undefined,
    url_marker: st.url_income_consumed_by_journey_id || null,
    stored_url_marker: stored ? stored.url_income_consumed_by_journey_id || null : null,
    stored_journey: stored ? stored.handoff_journey_id : null,
    stored_declared_ingreso: stored ? stored.declared_ingreso : null,
    input_display: inp ? inp.value : null,
    deudas: (st.deudas || []).map(function (d) {
      return { acreedor: d.acreedor, monto: d.monto, pago: d.pago, situacion_ui: d.situacion_ui };
    }),
    gastos: st.gastos,
    engine_input: ei,
  };
}

function summarize(label, cap) {
  var r = classify(JSON.parse(JSON.stringify(cap.engine_input)));
  var viaServer = classify(extractEngineInput(JSON.parse(JSON.stringify(cap.engine_input))));
  var fp = cap.engine_input.entry_context && cap.engine_input.entry_context.field_provenance
    ? cap.engine_input.entry_context.field_provenance.ingreso || null
    : null;
  var reasons = r.verification_reasons.filter(function (v) { return v.fact === "monthly_income"; }).map(function (v) { return v.code; });
  return {
    case: label,
    search: cap.search,
    step: cap.step,
    journey_id: cap.journey_id,
    stored_journey: cap.stored_journey,
    url_marker: cap.url_marker,
    stored_url_marker: cap.stored_url_marker,
    income_source: cap.income_source,
    declared_ingreso: cap.declared_ingreso,
    stored_declared_ingreso: cap.stored_declared_ingreso,
    PRE_ingreso: cap.pre_ingreso,
    input_display: cap.input_display,
    engine_input_ingreso: cap.engine_input.ingreso,
    engine_input_declared_ingreso: cap.engine_input.declared_ingreso,
    field_provenance_ingreso: fp,
    classifier_monthly_income: r.canonical_facts.monthly_income,
    classifier_income_reasons: reasons,
    server_path_same: JSON.stringify(viaServer.canonical_facts) === JSON.stringify(r.canonical_facts),
    deudas: cap.deudas,
    gastos: cap.gastos,
  };
}

async function snap(page, label) {
  return summarize(label, await page.evaluate(captureInPage));
}

async function reload(page) {
  await page.reload();
  await waitInit(page);
}

async function clickContinue(page) {
  // #sticky-cta is the app's own "Continuar" (next()); hidden on this headless viewport.
  await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
  await page.waitForTimeout(300);
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
  if (!(await page.isVisible(s))) {
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

async function reachDashboard(page) {
  await addDebtViaUi(page, "120.000", "6.500");
  await clickContinue(page);
  await page.waitForSelector('[data-gasto="vivienda"]');
  await fillGastoViaUi(page, "vivienda", "20.000");
  await clickContinue(page);
}

async function changeIncomeWithTool(page, text) {
  if (!(await page.$("#ing-formal"))) {
    // Income tool lives in Plan 1 herramientas; mount the real renderer (same delegated handlers).
    await page.evaluate(function () {
      document.getElementById("main-content").insertAdjacentHTML("beforeend", renderHerramientasPlan1());
    });
  }
  await page.fill("#ing-formal", text);
  await page.click("#btn-guardar-ingreso-actualizado");
  await page.waitForTimeout(300);
}

async function submitProfileForm(page, typeValue) {
  await page.waitForSelector("#inp-ingreso-mensual");
  if (typeValue != null) {
    await page.click("#inp-ingreso-mensual");
    await page.fill("#inp-ingreso-mensual", "");
    await page.type("#inp-ingreso-mensual", typeValue);
  }
  var touched = await page.evaluate(function () { return !!window.CZState._incomeFieldTouched; });
  await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
  await page.click("#btn-continuar-ingreso");
  await page.waitForTimeout(300);
  return touched;
}

function track(context, page, errors, blocked, out) {
  page.on("pageerror", function (e) { errors.push(String(e && e.message)); });
  return async function done() {
    out.page_errors = errors;
    out.blocked_external_requests = blocked.filter(function (u, i, a) { return a.indexOf(u) === i; });
    await context.close();
    return out;
  };
}

// URL-2 — invalid / ambiguous values are ignored (fresh URL entry, CDV-style link).
async function scenarioGrammar(browser, origin, raw) {
  var blocked = [];
  var errors = [];
  var context = await newContext(browser, origin, {}, blocked);
  var page = await context.newPage();
  var out = { scenario: "URL2_grammar_" + raw, raw: raw, cases: [] };
  var done = track(context, page, errors, blocked, out);
  await page.goto(origin + "/?ingreso=" + encodeURIComponent(raw) + "&nombre=QA&email=qa%40example.test&" + SURVEY);
  await waitInit(page);
  out.cases.push(await snap(page, "entry"));
  return done();
}

// URL-2 on persisted state + URL-only refresh precedence (no journey_id).
async function scenarioUrlOnly(browser, origin) {
  var blocked = [];
  var errors = [];
  var context = await newContext(browser, origin, {}, blocked);
  var page = await context.newPage();
  var out = { scenario: "U_url_only_no_journey_id", cases: [] };
  var done = track(context, page, errors, blocked, out);

  await page.goto(origin + "/?ingreso=50000&" + PROFILE + "&" + SURVEY);
  await waitInit(page);
  out.cases.push(await snap(page, "URL-1_first_entry"));

  await reachDashboard(page);
  await changeIncomeWithTool(page, "60000");
  out.cases.push(await snap(page, "URL-3_user_changes_60000_dashboard"));

  // Persisted state is restored when the URL carries no complete survey (restore branch).
  await page.goto(origin + "/?ingreso=65.000&" + PROFILE);
  await waitInit(page);
  out.cases.push(await snap(page, "URL-2_invalid_param_over_persisted_60000"));

  await page.goto(origin + "/?ingreso=65.000%2C50&" + PROFILE);
  await waitInit(page);
  out.cases.push(await snap(page, "URL-2_invalid_65.000,50_over_persisted"));

  // PENDING observation: a valid URL value on a URL-only entry has no journey to bind to.
  await page.goto(origin + "/?ingreso=50000&" + PROFILE);
  await waitInit(page);
  out.cases.push(await snap(page, "PENDING_url_only_valid_param_refresh"));
  return done();
}

// URL-1/3/4/6/7 with journey_id (A3 handoff journey whose income comes only from ?ingreso=).
async function scenarioJourney(browser, origin) {
  var blocked = [];
  var errors = [];
  var ctxByCode = { "u-a": handoffContextNoIncome(true), "u-b": handoffContextNoIncome(true) };
  var context = await newContext(browser, origin, ctxByCode, blocked);
  var page = await context.newPage();
  var out = { scenario: "J_journey_id", cases: [] };
  var done = track(context, page, errors, blocked, out);

  await page.goto(origin + "/e/u-a?ingreso=50000");
  await waitInit(page);
  out.cases.push(await snap(page, "URL-1_bootstrap_journey_A"));

  await reload(page);
  out.cases.push(await snap(page, "URL-1_untouched_refresh"));

  await reachDashboard(page);
  out.cases.push(await snap(page, "J_dashboard_prefill_untouched"));
  await changeIncomeWithTool(page, "60000");
  out.cases.push(await snap(page, "URL-3_user_changes_60000"));

  await reload(page);
  out.cases.push(await snap(page, "URL-4_refresh_same_journey"));
  for (var i = 1; i <= 3; i++) {
    await reload(page);
    out.cases.push(await snap(page, "URL-6_refresh_" + i));
  }

  // Real "Nuevo diagnóstico" lifecycle: resetear() drops the persisted journey state.
  await page.evaluate(function () { resetear(); });
  await reload(page);
  out.cases.push(await snap(page, "URL-7a_after_resetear_same_url"));

  // A different handoff creates a different journey_id; same ?ingreso= may bootstrap it.
  await page.goto(origin + "/e/u-b?ingreso=50000");
  await waitInit(page);
  out.cases.push(await snap(page, "URL-7b_new_journey_B_same_url"));
  return done();
}

// URL-5 / URL-3 through the profile form (touched signal).
async function scenarioForm(browser, origin, label, entryPath, ctxByCode, typeValue, refresh) {
  var blocked = [];
  var errors = [];
  var context = await newContext(browser, origin, ctxByCode || {}, blocked);
  var page = await context.newPage();
  var out = { scenario: label, cases: [] };
  var done = track(context, page, errors, blocked, out);
  await page.goto(origin + entryPath);
  await waitInit(page);
  out.cases.push(await snap(page, "form_prefilled"));
  var touched = await submitProfileForm(page, typeValue);
  var s = await snap(page, "submitted");
  s.income_field_touched_flag = touched;
  out.cases.push(s);
  if (refresh) {
    await reload(page);
    out.cases.push(await snap(page, "after_refresh"));
  }
  return done();
}

function byCase(s, name) {
  return s.cases.filter(function (c) { return c.case === name; })[0];
}

function persistentView(c) {
  return JSON.stringify({
    income_source: c.income_source, declared_ingreso: c.declared_ingreso, PRE_ingreso: c.PRE_ingreso,
    fp: c.field_provenance_ingreso, income: c.classifier_monthly_income, marker: c.stored_url_marker,
    deudas: c.deudas, gastos: c.gastos, step: c.step,
  });
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var srv = await startStaticServer();
  var browser = await chromium.launch();
  var invalid = ["65.000", "65.000,50", "50,000", "$65000", "$ 65.000", "UYU 65000", "1.234.567", "65000abc", "-5000", "1e5"];
  var valid = [["65000", 65000], ["65000.50", 65000.5]];
  var grammar = [];
  var results = {};
  try {
    for (var i = 0; i < invalid.length; i++) grammar.push(await scenarioGrammar(browser, srv.origin, invalid[i]));
    for (var v = 0; v < valid.length; v++) grammar.push(await scenarioGrammar(browser, srv.origin, valid[v][0]));
    results.U = await scenarioUrlOnly(browser, srv.origin);
    results.J = await scenarioJourney(browser, srv.origin);
    var cdvForm = "/?ingreso=65000&nombre=QA&email=qa%40example.test&" + SURVEY;
    results.F_untouched = await scenarioForm(browser, srv.origin, "URL5_form_untouched", cdvForm, null, null, false);
    results.F_same = await scenarioForm(browser, srv.origin, "URL5_form_retyped_same_65000", cdvForm, null, "65000", false);
    results.F_diff = await scenarioForm(browser, srv.origin, "URL3_form_typed_60000", cdvForm, null, "60000", false);
    results.JF_same = await scenarioForm(browser, srv.origin, "URL5_journey_form_retyped_same_65000",
      "/e/u-f?ingreso=65000", { "u-f": handoffContextNoIncome(false) }, "65000", true);
    results.JF_untouched = await scenarioForm(browser, srv.origin, "URL5_journey_form_untouched",
      "/e/u-g?ingreso=65000", { "u-g": handoffContextNoIncome(false) }, null, true);
  } finally {
    await browser.close();
    srv.server.close();
  }

  var checks = [];
  var pending = [];
  function check(name, cond) { checks.push({ name: name, ok: !!cond }); }
  function unconfirmedUrl(c) {
    return c && c.income_source === "url_param" &&
      c.field_provenance_ingreso && c.field_provenance_ingreso.source === "url_prefill" &&
      c.field_provenance_ingreso.user_modified === false &&
      c.classifier_monthly_income === "unknown" &&
      c.classifier_income_reasons.join() === "INCOME_PREFILL_UNCONFIRMED";
  }
  function userAuthority(c, value) {
    return c && c.income_source === "user_update" && c.declared_ingreso === value && c.PRE_ingreso === value &&
      c.engine_input_ingreso === value && c.classifier_monthly_income === value &&
      c.field_provenance_ingreso && c.field_provenance_ingreso.source === "user_entered" &&
      c.field_provenance_ingreso.user_modified === true && c.classifier_income_reasons.length === 0;
  }
  function never(c, n) {
    return c.declared_ingreso !== n && c.PRE_ingreso !== n && c.stored_declared_ingreso !== n &&
      c.engine_input_ingreso !== n && c.engine_input_declared_ingreso !== n &&
      c.classifier_monthly_income !== n && c.input_display !== String(n);
  }

  // URL-2 grammar
  grammar.forEach(function (g) {
    var c = g.cases[0];
    var validPair = valid.filter(function (p) { return p[0] === g.raw; })[0];
    if (validPair) {
      check("URL-2 valid technical " + JSON.stringify(g.raw) + " -> " + validPair[1] + " as unconfirmed url_prefill",
        c.declared_ingreso === validPair[1] && c.engine_input_ingreso === validPair[1] && unconfirmedUrl(c));
      return;
    }
    check("URL-2 " + JSON.stringify(g.raw) + " ignored: no income in state/PRE/EngineInput, classifier INCOME_UNKNOWN",
      c.declared_ingreso == null && !c.income_source && c.PRE_ingreso === 0 && !(Number(c.engine_input_ingreso) > 0) &&
      c.classifier_monthly_income === "unknown" && c.classifier_income_reasons.join() === "INCOME_UNKNOWN");
    check("URL-2 " + JSON.stringify(g.raw) + " profile step asks for income (empty field)", c.step === 0 && c.input_display === "");
  });
  var g65 = grammar.filter(function (g) { return g.raw === "65.000"; })[0].cases[0];
  check("URL-2 ?ingreso=65.000 never produces 65 (state, persisted, EngineInput, classifier, field)", never(g65, 65));
  check("URL-2 ?ingreso=65.000 never guessed as 65000", never(g65, 65000));

  var U = results.U;
  var u1 = byCase(U, "URL-1_first_entry");
  var u3 = byCase(U, "URL-3_user_changes_60000_dashboard");
  var u2p = byCase(U, "URL-2_invalid_param_over_persisted_60000");
  var u2q = byCase(U, "URL-2_invalid_65.000,50_over_persisted");
  var upend = byCase(U, "PENDING_url_only_valid_param_refresh");
  check("URL-1 (URL-only) first entry: unconfirmed url_prefill, never user_entered", unconfirmedUrl(u1) && u1.declared_ingreso === 50000);
  check("URL-1 (URL-only) no journey_id, marker null", u1.journey_id === null && u1.stored_url_marker === null);
  check("URL-3 (URL-only) user change 60000 has user authority", userAuthority(u3, 60000));
  check("URL-2 invalid ?ingreso=65.000 does not overwrite persisted user income 60000", userAuthority(u2p, 60000) && never(u2p, 65));
  check("URL-2 invalid ?ingreso=65.000,50 does not overwrite persisted user income", userAuthority(u2q, 60000) && never(u2q, 65));
  pending.push("URL-only valid ?ingreso=50000 after user set 60000 (no journey_id): income_source=" + upend.income_source +
    " declared=" + upend.declared_ingreso);

  var J = results.J;
  var j0 = byCase(J, "URL-1_bootstrap_journey_A");
  var j0r = byCase(J, "URL-1_untouched_refresh");
  var jd = byCase(J, "J_dashboard_prefill_untouched");
  var j3 = byCase(J, "URL-3_user_changes_60000");
  var j4 = byCase(J, "URL-4_refresh_same_journey");
  var j7a = byCase(J, "URL-7a_after_resetear_same_url");
  var j7b = byCase(J, "URL-7b_new_journey_B_same_url");
  check("URL-1 journey A: URL income is url_prefill (not handoff, not user_entered)", unconfirmedUrl(j0) && j0.declared_ingreso === 50000);
  check("URL-1 journey A: prefill consumed by jrn-u-a and persisted", j0.journey_id === "jrn-u-a" &&
    j0.url_marker === "jrn-u-a" && j0.stored_url_marker === "jrn-u-a" && j0.stored_journey === "jrn-u-a");
  check("URL-1 journey A: URL stays in the address bar after redeem", /ingreso=50000/.test(j0.search));
  check("URL-1 untouched refresh keeps unconfirmed url_prefill and marker", unconfirmedUrl(j0r) && j0r.stored_url_marker === "jrn-u-a");
  check("J dashboard reached with prefill untouched (still unconfirmed)", jd.step === 3 && unconfirmedUrl(jd));
  check("URL-3 journey A: user change 60000 has user authority", userAuthority(j3, 60000));
  check("URL-4 refresh with ?ingreso=50000 still present keeps 60000 user authority", userAuthority(j4, 60000) &&
    /ingreso=50000/.test(j4.search) && j4.stored_url_marker === "jrn-u-a");
  check("URL-4 refresh keeps debts/expenses/step", JSON.stringify(j4.deudas) === JSON.stringify(j3.deudas) &&
    JSON.stringify(j4.gastos) === JSON.stringify(j3.gastos) && j4.step === 3);
  var after = J.cases.filter(function (c) { return /^URL-4|^URL-6/.test(c.case); });
  check("URL-4/6 prefill 50000 never reappears in the same journey",
    after.every(function (c) { return never(c, 50000); }));
  check("URL-6 three refreshes are non-destructive (value, provenance, authority, marker, rest of journey)",
    after.length === 4 && after.every(function (c) { return persistentView(c) === persistentView(j4); }));
  check("URL-7a resetear() + refresh: same journey_id (real lifecycle), state dropped, URL bootstraps again",
    j7a.journey_id === "jrn-u-a" && unconfirmedUrl(j7a) && j7a.declared_ingreso === 50000 &&
    j7a.deudas.length === 0 && j7a.stored_url_marker === "jrn-u-a");
  check("URL-7b new journey B: same ?ingreso= consumed by jrn-u-b as bootstrap",
    j7b.journey_id === "jrn-u-b" && unconfirmedUrl(j7b) && j7b.declared_ingreso === 50000 &&
    j7b.deudas.length === 0 && j7b.stored_url_marker === "jrn-u-b" && j7b.stored_journey === "jrn-u-b");

  var fu = byCase(results.F_untouched, "submitted");
  var fs1 = byCase(results.F_same, "submitted");
  var fd = byCase(results.F_diff, "submitted");
  check("URL-5 form shows URL income as digits (CZ-SALARIO-BOUNDARY-FIX-01)", byCase(results.F_untouched, "form_prefilled").input_display === "65000");
  check("URL-5 untouched submit keeps url_param unconfirmed (flag false)", unconfirmedUrl(fu) && fu.declared_ingreso === 65000 &&
    fu.income_field_touched_flag === false);
  check("URL-5 retyping the same 65000 sets _incomeFieldTouched (input event) => user_update, user_modified=true",
    fs1.income_field_touched_flag === true && userAuthority(fs1, 65000));
  check("URL-5 same-value confirmation distinguishable from untouched prefill",
    fs1.income_source !== fu.income_source && fs1.classifier_monthly_income !== fu.classifier_monthly_income);
  check("URL-3 form typed 60000 => 60000 with user authority", userAuthority(fd, 60000));

  var jfs = results.JF_same;
  var jfu = results.JF_untouched;
  check("URL-5 journey: retyped same value => user authority, survives refresh",
    userAuthority(byCase(jfs, "submitted"), 65000) && userAuthority(byCase(jfs, "after_refresh"), 65000));
  check("URL-5 journey: untouched submit stays unconfirmed url_prefill across refresh",
    unconfirmedUrl(byCase(jfu, "submitted")) && unconfirmedUrl(byCase(jfu, "after_refresh")));

  var all = grammar.concat([U, J, results.F_untouched, results.F_same, results.F_diff, jfs, jfu]);
  all.forEach(function (s) {
    s.cases.forEach(function (c) {
      check(s.scenario + " " + c.case + " server extractEngineInput same facts", c.server_path_same);
    });
    check(s.scenario + " no page errors", !s.page_errors.length);
  });

  var failed = checks.filter(function (c) { return !c.ok; });
  if (failed.length) process.exitCode = 1;
  if (asJson) {
    console.log(JSON.stringify({ results: all, checks: checks, pending: pending }, null, 2));
    return;
  }
  all.forEach(function (s) {
    console.log("=".repeat(78));
    console.log(s.scenario);
    s.cases.forEach(function (c) {
      console.log("  " + c.case + " step=" + c.step + " journey=" + c.journey_id + " marker=" + c.stored_url_marker +
        " search=" + c.search + (c.income_field_touched_flag != null ? " touched=" + c.income_field_touched_flag : ""));
      console.log("    income_source=" + c.income_source + " declared=" + c.declared_ingreso + " PRE=" + c.PRE_ingreso +
        " input=" + JSON.stringify(c.input_display) + " EngineInput.ingreso=" + c.engine_input_ingreso +
        " fp=" + JSON.stringify(c.field_provenance_ingreso) + " => income=" + c.classifier_monthly_income +
        " " + JSON.stringify(c.classifier_income_reasons));
    });
    if (s.page_errors.length) console.log("  page_errors: " + JSON.stringify(s.page_errors));
  });
  console.log("=".repeat(78));
  pending.forEach(function (p) { console.log("PENDING (observed, not asserted): " + p); });
  checks.forEach(function (c) { console.log((c.ok ? "PASS " : "FAIL ") + c.name); });
  console.log("URL_INCOME_E2E: " + (checks.length - failed.length) + "/" + checks.length + (failed.length ? " FAIL" : " PASS"));
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
