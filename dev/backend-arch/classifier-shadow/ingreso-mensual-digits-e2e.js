/**
 * CZ-SALARIO-BOUNDARY-FIX-01 — ingreso mensual declared by hand in the profile form
 * (#inp-ingreso-mensual) is digits-only: "65000" = $65.000. Real browser (Playwright).
 *
 * Invalid input shows a visible error, does not advance and is never stored as 0, NaN,
 * 65 or 65000. Gastos/deudas/#ing-formal keep MONETARY-CONTRACT-01 (not exercised here).
 * Serves the repo on localhost and aborts every external request.
 *
 * Usage: node dev/backend-arch/classifier-shadow/ingreso-mensual-digits-e2e.js [--json]
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var chromium = require("playwright").chromium;
var classify = require("../../../engine/classifier/financial-classifier").classifyFinancialShadow;

var ROOT = path.join(__dirname, "..", "..", "..");
var MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
var SURVEY = "p1=B&p2=B&p3=B&p4=B&p5=B&p6=A&p7=B&p8=B&p9=B&p10=B";
var VIRGIN = "/?nombre=QA%20Virgen&email=qa-virgen%40example.test&" + SURVEY;
var FORMAT_ERROR = "Ingresá el monto solo con números, sin puntos ni comas.";

function startStaticServer() {
  var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
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

async function openPage(browser, origin, entryPath) {
  var context = await browser.newContext({ locale: "es-UY" });
  await context.route("**/*", function (route) {
    var url = route.request().url();
    if (url.indexOf(origin + "/js/config.local.js") === 0) {
      return route.fulfill({ status: 200, contentType: "application/javascript", body: "CZ_SHADOW_MODE = false;" });
    }
    if (url.indexOf(origin) === 0) return route.continue();
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
  await page.waitForSelector("#inp-ingreso-mensual");
  return { context: context, page: page, errors: errors };
}

function captureInPage() {
  var st = window.CZState;
  var ei = window.CZShadowDiagnosis.buildEngineInput(st);
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem("cr_v3") || "null"); } catch (e) {}
  var inp = document.getElementById("inp-ingreso-mensual");
  var err = document.getElementById("profile-ingreso-error");
  return {
    step: st.step,
    income_source: st.income_source || null,
    declared_ingreso: st.declared_ingreso,
    pre_ingreso: typeof PRE !== "undefined" ? PRE.ingreso : undefined,
    stored_declared_ingreso: stored && stored.declared_ingreso != null ? stored.declared_ingreso : null,
    engine_input: ei,
    field_present: !!inp,
    input_display: inp ? inp.value : null,
    error_text: err && err.style.display !== "none" ? err.textContent : "",
  };
}

async function snap(page) {
  var c = await page.evaluate(captureInPage);
  c.engine_input_ingreso = c.engine_input.ingreso;
  c.classifier_monthly_income = classify(JSON.parse(JSON.stringify(c.engine_input))).canonical_facts.monthly_income;
  delete c.engine_input;
  return c;
}

async function submit(page, typed) {
  if (typed != null) {
    await page.click("#inp-ingreso-mensual");
    await page.fill("#inp-ingreso-mensual", "");
    if (typed !== "") await page.type("#inp-ingreso-mensual", typed);
  }
  await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
  await page.click("#btn-continuar-ingreso");
  await page.waitForTimeout(300);
}

async function scenario(browser, origin, entryPath, typed) {
  var s = await openPage(browser, origin, entryPath);
  var before = await snap(s.page);
  var attrs = await s.page.evaluate(function () {
    var el = document.getElementById("inp-ingreso-mensual");
    return { inputmode: el.getAttribute("inputmode"), placeholder: el.getAttribute("placeholder") };
  });
  await submit(s.page, typed);
  var after = await snap(s.page);
  var out = { entry: entryPath, typed: typed, attrs: attrs, before: before, after: after, page_errors: s.errors };
  await s.context.close();
  return out;
}

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? "  -- " + JSON.stringify(detail) : ""));
}

function neverAmount(c, n) {
  return c.declared_ingreso !== n && c.pre_ingreso !== n && c.stored_declared_ingreso !== n &&
    c.engine_input_ingreso !== n && c.classifier_monthly_income !== n;
}

// Invalid submit: visible error, same step, and no income field changes from the pre-submit state.
function blocked(r, message) {
  var a = r.after;
  var b = r.before;
  return a.step === b.step && a.field_present && a.error_text === message &&
    a.declared_ingreso === b.declared_ingreso && a.pre_ingreso === b.pre_ingreso &&
    a.stored_declared_ingreso === b.stored_declared_ingreso && a.engine_input_ingreso === b.engine_input_ingreso &&
    a.income_source === b.income_source && a.classifier_monthly_income === b.classifier_monthly_income &&
    r.page_errors.length === 0;
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var srv = await startStaticServer();
  var browser = await chromium.launch();
  var dump = [];
  try {
    var ok = await scenario(browser, srv.origin, VIRGIN, "65000");
    dump.push(ok);
    check("I field: inputmode=numeric, placeholder \"Ej: 65000\", empty for virgin",
      ok.attrs.inputmode === "numeric" && ok.attrs.placeholder === "Ej: 65000" && ok.before.input_display === "", ok.attrs);
    check("I \"65000\" -> accepted, advances, state/EngineInput/classifier = 65000 (number), user_input",
      ok.after.step !== ok.before.step && ok.after.declared_ingreso === 65000 && ok.after.pre_ingreso === 65000 &&
      ok.after.stored_declared_ingreso === 65000 && ok.after.engine_input_ingreso === 65000 &&
      ok.after.classifier_monthly_income === 65000 && ok.after.income_source === "user_input" &&
      ok.after.error_text === "" && ok.page_errors.length === 0, ok.after);

    var invalid = ["65.000", "65,000", "65.000,50", "65000,50", "65000.50", "$65000", "$ 65.000", "UYU 65000",
      "1e5", "-65000", "65000abc", "texto", " 65000", "65 000"];
    for (var i = 0; i < invalid.length; i++) {
      var r = await scenario(browser, srv.origin, VIRGIN, invalid[i]);
      dump.push(r);
      check("I " + JSON.stringify(invalid[i]) + " -> visible error, not advanced, not stored, field not rewritten",
        blocked(r, FORMAT_ERROR) && r.after.input_display === invalid[i] &&
        neverAmount(r.after, 65) && neverAmount(r.after, 65000) && r.after.classifier_monthly_income === "unknown", r.after);
    }

    var empty = await scenario(browser, srv.origin, VIRGIN, "");
    dump.push(empty);
    check("I empty -> visible error, not advanced", blocked(empty, empty.after.error_text) && empty.after.error_text !== "", empty.after);
    var zero = await scenario(browser, srv.origin, VIRGIN, "0");
    dump.push(zero);
    check("I \"0\" -> visible error (existing > 0 rule), not advanced, never stored as 0",
      blocked(zero, zero.after.error_text) && zero.after.error_text !== "" && zero.after.error_text !== FORMAT_ERROR &&
      zero.after.declared_ingreso !== 0, zero.after);

    // URL-INCOME-01 keeps its own provisional grammar (accepts 65000.50); the digits-only field
    // shows it unrounded and blocks the submit until the user corrects it.
    var dec = await scenario(browser, srv.origin, VIRGIN + "&ingreso=65000.50", null);
    dump.push(dec);
    check("Edge ?ingreso=65000.50 prefill shown unrounded, untouched submit blocked with format error (prefill stays unconfirmed url_param)",
      dec.before.input_display === "65000.5" && blocked(dec, FORMAT_ERROR) && dec.after.income_source === "url_param" &&
      neverAmount(dec.after, 65000) && neverAmount(dec.after, 65001), dec.after);
    var decFixed = await scenario(browser, srv.origin, VIRGIN + "&ingreso=65000.50", "65000");
    dump.push(decFixed);
    check("Edge ?ingreso=65000.50 then user types 65000 -> accepted as user_update 65000",
      decFixed.after.step !== decFixed.before.step && decFixed.after.declared_ingreso === 65000 &&
      decFixed.after.income_source === "user_update" && decFixed.after.engine_input_ingreso === 65000, decFixed.after);

    var urlInt = await scenario(browser, srv.origin, VIRGIN + "&ingreso=65000", null);
    dump.push(urlInt);
    check("?ingreso=65000 prefill shown as \"65000\"; untouched submit keeps url_param",
      urlInt.before.input_display === "65000" && urlInt.after.declared_ingreso === 65000 &&
      urlInt.after.income_source === "url_param", urlInt.after);
  } finally {
    await browser.close();
    srv.server.close();
  }
  if (asJson) console.log(JSON.stringify(dump, null, 2));
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed");
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
