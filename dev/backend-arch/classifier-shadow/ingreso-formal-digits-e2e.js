/**
 * INGRESO-FORMAL-DIGITS-01 — the income tool field #ing-formal ("Cuanto te entra realmente por mes?")
 * is the principal monthly income: digits-only, same contract as the profile #inp-ingreso-mensual.
 * Extra incomes (K5), debts and expenses keep MONETARY-CONTRACT-01. Real browser (Playwright).
 *
 * Journey: handoff (mocked /v1/handoff/redeem) → untouched profile → debt → expenses → dashboard.
 * #ing-formal only renders on Plan 1 tools; if the diagnosis lands on another plan the harness
 * sets diag.planId = 1 and re-renders the tab (state is read, not the plan).
 * All external requests are aborted.
 *
 * Usage: node dev/backend-arch/classifier-shadow/ingreso-formal-digits-e2e.js [--json]
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var chromium = require("playwright").chromium;
var classify = require("../../../engine/classifier/financial-classifier").classifyFinancialShadow;

var ROOT = path.join(__dirname, "..", "..", "..");
var MOCK_API = "http://miplan-mock.test";
var SURVEY = { p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p7: "B", p8: "B", p9: "B", p10: "B" };
var DIGITS_ERROR = "Ingresá el monto solo con números, sin puntos ni comas.";
var HUMAN_ERROR_RE = /punto para los miles/;

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

async function openPage(browser, origin, entryPath, handoffIngreso) {
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
        body: JSON.stringify({
          ok: true, journey_id: "jrn-ing-formal", cached: false, durable: true,
          context: {
            contract_version: 1,
            context: { funnel: "credizona_rejected" },
            person: { nombre: "QA Formal", email: "qa-formal@example.test" },
            financial_prefill: { ingreso: handoffIngreso },
            survey: { respuestas: SURVEY },
          },
        }),
      });
    }
    return route.abort();
  });
  var page = await context.newPage();
  var errors = [];
  page.on("pageerror", function (e) { errors.push(String(e && e.message)); });
  await page.goto(origin + entryPath);
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
  return { context: context, page: page, errors: errors };
}

async function typeAndBlur(page, selector, raw) {
  await page.fill(selector, raw);
  await page.press(selector, "Tab");
  await page.waitForTimeout(40);
}

async function toDashboard(page) {
  await page.waitForSelector("#inp-ingreso-mensual");
  await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
  await page.click("#btn-continuar-ingreso");
  await page.waitForTimeout(300);

  await page.click("#btn-agregar-deuda");
  await page.waitForSelector('[data-deuda-field="monto"][data-deuda-idx="0"]');
  await page.selectOption('[data-deuda-field="tipo"][data-deuda-idx="0"]', "prestamo");
  await page.fill('[data-deuda-field="acreedor"][data-deuda-idx="0"]', "Banco QA");
  await typeAndBlur(page, '[data-deuda-field="monto"][data-deuda-idx="0"]', "120.000");
  await page.click('[data-deuda-situacion="pagando_normal"][data-deuda-idx="0"]');
  await typeAndBlur(page, '[data-deuda-field="pago"][data-deuda-idx="0"]', "6.500");
  await page.click("#btn-guardar-deuda-edicion");
  await page.waitForTimeout(200);

  await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
  await page.waitForSelector('[data-gasto="vivienda"]');
  await typeAndBlur(page, '[data-gasto="vivienda"]', "20.000");
  await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
  await page.waitForTimeout(400);

  var forced = await page.evaluate(function () {
    if (document.getElementById("ing-formal")) return false;
    window.CZState.diag.planId = 1;
    window.CredizonaUI.renderTab();
    return true;
  });
  await page.waitForSelector("#ing-formal");
  return forced;
}

function captureInPage() {
  var st = window.CZState;
  var ei = window.CZShadowDiagnosis.buildEngineInput(st);
  var fp = ei.entry_context && ei.entry_context.field_provenance ? ei.entry_context.field_provenance.ingreso || null : null;
  var formalEl = document.getElementById("ing-formal");
  var err = document.querySelector('[data-money-error="ing:formal"]');
  var extraEl = document.querySelector('[data-ing-extra-field="monto"][data-ing-extra-idx="0"]');
  var extraErr = document.querySelector('[data-money-error="ing:extra:0"]');
  var btn = document.getElementById("btn-guardar-ingreso-actualizado");
  var total = formalEl ? syncIngresosFromDom(st) : null;
  if (formalEl) updateIngresoSaveButtonState();
  var ing = st.herr && st.herr.ingresos ? st.herr.ingresos : {};
  return {
    step: st.step,
    pre_ingreso: typeof PRE !== "undefined" ? PRE.ingreso : undefined,
    declared_ingreso: st.declared_ingreso,
    income_source: st.income_source || null,
    fp_source: fp ? fp.source : null,
    fp_user_modified: fp ? fp.user_modified : null,
    engine_input: ei,
    engine_input_ingreso: ei.ingreso,
    formal_state: ing.formal,
    extra_state: ing.extras && ing.extras[0] ? ing.extras[0].monto : undefined,
    total: typeof total === "number" && !isFinite(total) ? "invalid" : total,
    save_enabled: btn ? !btn.disabled : null,
    formal_display: formalEl ? formalEl.value : null,
    formal_attrs: formalEl ? { inputmode: formalEl.getAttribute("inputmode"), placeholder: formalEl.getAttribute("placeholder") } : null,
    formal_error: err && err.style.display !== "none" ? err.textContent : "",
    extra_display: extraEl ? extraEl.value : null,
    extra_error: extraErr && extraErr.style.display !== "none" ? extraErr.textContent : "",
    debt: st.deudas && st.deudas[0] ? { monto: st.deudas[0].monto, pago: st.deudas[0].pago } : null,
    gasto_vivienda: st.gastos ? st.gastos.vivienda : undefined,
  };
}

async function snap(page) {
  var c = await page.evaluate(captureInPage);
  c.classifier_monthly_income = classify(JSON.parse(JSON.stringify(c.engine_input))).canonical_facts.monthly_income;
  delete c.engine_input;
  return c;
}

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail) : ""));
}

function canonicalUnchanged(a, b) {
  return a.pre_ingreso === b.pre_ingreso && a.declared_ingreso === b.declared_ingreso &&
    a.income_source === b.income_source && a.fp_user_modified === b.fp_user_modified &&
    a.engine_input_ingreso === b.engine_input_ingreso && a.step === b.step;
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var srv = await startStaticServer();
  var browser = await chromium.launch();
  var dump = {};
  try {
    // ---- Scenario A: handoff 50000 → #ing-formal grammar, IF-DIGITS-2, IF-DIGITS-1, IF-DIGITS-5 ----
    var a = await openPage(browser, srv.origin, "/e/if-a", 50000);
    dump.a_plan_forced = await toDashboard(a.page);
    var base = await snap(a.page);
    dump.a_base = base;
    check("setup: dashboard reached with handoff 50000 untouched (source handoff, user_modified=false)",
      base.step === 3 && base.pre_ingreso === 50000 && base.income_source === "handoff" &&
      base.fp_source === "handoff" && base.fp_user_modified === false, base);
    check("#ing-formal: inputmode=numeric, placeholder \"Ej: 65000\", prefill shown as digits \"50000\"",
      base.formal_attrs.inputmode === "numeric" && base.formal_attrs.placeholder === "Ej: 65000" &&
      base.formal_display === "50000" && base.formal_error === "", base);
    check("IF-DIGITS-5 debt typed \"120.000\"/\"6.500\" still stored canonical 120000/6500 (MONETARY-CONTRACT-01)",
      base.debt && base.debt.monto === "120000" && base.debt.pago === 6500, base.debt);
    check("IF-DIGITS-5 expense typed \"20.000\" still stored canonical 20000 (MONETARY-CONTRACT-01)",
      base.gasto_vivienda === 20000, base.gasto_vivienda);

    var valid = { "65000": 65000, "100000": 100000, "1234567": 1234567 };
    var invalid = ["65.000", "65,000", "65.000,50", "65000.50", "$65000", "UYU 65000", "1e5", "-65000",
      "texto", "", " 65000", "65000abc"];
    dump.a_grammar = [];
    var raws = Object.keys(valid);
    for (var i = 0; i < raws.length; i++) {
      await typeAndBlur(a.page, "#ing-formal", raws[i]);
      var v = await snap(a.page);
      dump.a_grammar.push({ raw: raws[i], snap: v });
      check("#ing-formal " + JSON.stringify(raws[i]) + " -> " + valid[raws[i]] + " (draft state + total), not reformatted",
        v.formal_state === valid[raws[i]] && v.total === valid[raws[i]] && v.formal_display === raws[i] &&
        v.formal_error === "" && canonicalUnchanged(v, base), v);
    }
    for (var j = 0; j < invalid.length; j++) {
      await typeAndBlur(a.page, "#ing-formal", "50000");
      await typeAndBlur(a.page, "#ing-formal", invalid[j]);
      var q = await snap(a.page);
      dump.a_grammar.push({ raw: invalid[j], snap: q });
      check("#ing-formal " + JSON.stringify(invalid[j]) + " -> INVALID: error visible, save off, draft/canonical state intact",
        q.formal_error === DIGITS_ERROR && q.total === "invalid" && q.save_enabled === false &&
        q.formal_state === 50000 && q.formal_display === invalid[j] && canonicalUnchanged(q, base), q);
    }

    // IF-DIGITS-2 — "65.000" + click save: error, nothing changes, no advance.
    await typeAndBlur(a.page, "#ing-formal", "65.000");
    await a.page.evaluate(function () {
      var b = document.getElementById("btn-guardar-ingreso-actualizado");
      b.disabled = false;
      b.click();
    });
    await a.page.waitForTimeout(300);
    var s2 = await snap(a.page);
    dump.a_if2 = s2;
    check("IF-DIGITS-2 \"65.000\" + Guardar -> error, PRE/declared/EngineInput stay 50000, still handoff unconfirmed, same step",
      s2.formal_error === DIGITS_ERROR && canonicalUnchanged(s2, base) && s2.pre_ingreso === 50000 &&
      s2.income_source === "handoff" && s2.fp_user_modified === false &&
      [65000, 65, 0].indexOf(s2.declared_ingreso) === -1 && [65000, 65, 0].indexOf(s2.engine_input_ingreso) === -1 &&
      a.errors.length === 0, s2);

    // IF-DIGITS-1 — "65000" + save: canonical 65000 (number) in state and EngineInput, user_update.
    await typeAndBlur(a.page, "#ing-formal", "65000");
    await a.page.click("#btn-guardar-ingreso-actualizado");
    await a.page.waitForTimeout(400);
    var s1 = await snap(a.page);
    dump.a_if1 = s1;
    check("IF-DIGITS-1 \"65000\" + Guardar -> PRE.ingreso/declared_ingreso/EngineInput.ingreso = 65000 (number)",
      s1.pre_ingreso === 65000 && s1.declared_ingreso === 65000 && s1.engine_input_ingreso === 65000 &&
      typeof s1.engine_input_ingreso === "number", s1);
    check("IF-DIGITS-1 provenance: user_update, field_provenance user_modified=true, classifier income 65000",
      s1.income_source === "user_update" && s1.fp_user_modified === true && s1.classifier_monthly_income === 65000 &&
      a.errors.length === 0, s1);
    await a.context.close();

    // ---- Scenario B: IF-DIGITS-4 — extra income (K5) keeps the human grammar ----
    var b = await openPage(browser, srv.origin, "/e/if-b", 50000);
    dump.b_plan_forced = await toDashboard(b.page);
    var bBase = await snap(b.page);
    await b.page.click("#btn-agregar-ing-extra");
    await b.page.waitForSelector('[data-ing-extra-field="monto"][data-ing-extra-idx="0"]');
    await typeAndBlur(b.page, '[data-ing-extra-field="monto"][data-ing-extra-idx="0"]', "5.000");
    var e1 = await snap(b.page);
    check("IF-DIGITS-4 extra \"5.000\" -> 5000 and redisplayed \"5.000\" (human grammar), total 55000",
      e1.extra_state === 5000 && e1.extra_display === "5.000" && e1.extra_error === "" && e1.total === 55000, e1);
    await typeAndBlur(b.page, '[data-ing-extra-field="monto"][data-ing-extra-idx="0"]', "5.000,50");
    var e2 = await snap(b.page);
    check("IF-DIGITS-4 extra \"5.000,50\" -> 5000.5 (human grammar unchanged)", e2.extra_state === 5000.5 && e2.extra_error === "", e2);
    await typeAndBlur(b.page, '[data-ing-extra-field="monto"][data-ing-extra-idx="0"]', "5.000xyz");
    var e3 = await snap(b.page);
    check("IF-DIGITS-4 extra \"5.000xyz\" -> human-format error (not the digits message), save off",
      HUMAN_ERROR_RE.test(e3.extra_error) && e3.extra_error !== DIGITS_ERROR && e3.total === "invalid" &&
      e3.save_enabled === false && e3.extra_state === 5000.5, e3);
    await typeAndBlur(b.page, '[data-ing-extra-field="monto"][data-ing-extra-idx="0"]', "5.000");
    await b.page.click("#btn-guardar-ingreso-actualizado");
    await b.page.waitForTimeout(400);
    var e4 = await snap(b.page);
    dump.b = { base: bBase, e1: e1, e2: e2, e3: e3, e4: e4 };
    check("IF-DIGITS-4 save formal 50000 + extra 5.000 -> canonical 55000, user_update (unchanged behaviour)",
      e4.declared_ingreso === 55000 && e4.pre_ingreso === 55000 && e4.engine_input_ingreso === 55000 &&
      e4.income_source === "user_update" && b.errors.length === 0, e4);
    await b.context.close();

    // ---- Scenario C: IF-DIGITS-3 — profile #inp-ingreso-mensual keeps the same digits-only contract ----
    var virgin = "/?nombre=QA%20Formal&email=qa-formal%40example.test&" +
      Object.keys(SURVEY).map(function (k) { return k + "=" + SURVEY[k]; }).join("&");
    var c = await openPage(browser, srv.origin, virgin, null);
    await c.page.waitForSelector("#inp-ingreso-mensual");
    await c.page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
    await c.page.fill("#inp-ingreso-mensual", "65.000");
    await c.page.click("#btn-continuar-ingreso");
    await c.page.waitForTimeout(300);
    var p1 = await c.page.evaluate(function () {
      var err = document.getElementById("profile-ingreso-error");
      return { step: window.CZState.step, declared: window.CZState.declared_ingreso,
        error: err && err.style.display !== "none" ? err.textContent : "" };
    });
    check("IF-DIGITS-3 profile \"65.000\" -> same digits error, not advanced, nothing declared",
      p1.step === 0 && p1.error === DIGITS_ERROR && !(Number(p1.declared) > 0), p1);
    await c.page.fill("#inp-ingreso-mensual", "65000");
    await c.page.click("#btn-continuar-ingreso");
    await c.page.waitForTimeout(300);
    var p2 = await c.page.evaluate(function () {
      return { step: window.CZState.step, declared: window.CZState.declared_ingreso,
        ei: window.CZShadowDiagnosis.buildEngineInput(window.CZState).ingreso };
    });
    check("IF-DIGITS-3 profile \"65000\" -> 65000 in state and EngineInput", p2.step !== 0 && p2.declared === 65000 && p2.ei === 65000, p2);
    dump.c = { p1: p1, p2: p2 };
    await c.context.close();
  } finally {
    await browser.close();
    srv.server.close();
  }
  if (asJson) console.log(JSON.stringify(dump, null, 2));
  console.log("plan forced to 1 for #ing-formal: A=" + dump.a_plan_forced + " B=" + dump.b_plan_forced);
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("\nINGRESO_FORMAL_DIGITS_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
