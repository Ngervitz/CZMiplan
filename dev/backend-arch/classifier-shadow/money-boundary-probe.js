/**
 * MONETARY-CONTRACT-01 — before/after of every journey monetary boundary, real browser.
 *
 * BEFORE (reference, not the current code):
 *   - type="number" inputs (profile income, income tool, gastos, custom expenses): the raw
 *     text is typed with the keyboard into an <input type="number"> under es-UY → .value →
 *     parseFloat (what those handlers did).
 *   - debt monto/pago text field: the sanitizer + state conversion extracted verbatim from
 *     `git show HEAD:js/app.js` → parseFloat.
 * AFTER (current code, real DOM): each raw text is typed into the real journey input,
 * blurred, and the resulting state / validation is read:
 *   profile income (#inp-ingreso-mensual → collectBasicProfileForm; digits-only since
 *   CZ-SALARIO-BOUNDARY-FIX-01), debt monto and pago,
 *   gastos category, custom expense amount, income tool (#ing-formal → syncIngresosFromDom;
 *   digits-only since INGRESO-FORMAL-DIGITS-01).
 * Also checks that an invalid amount blocks progress (gastos step, debt save).
 *
 * All external requests are aborted; POST /v1/handoff/redeem is mocked.
 * Usage: node dev/backend-arch/classifier-shadow/money-boundary-probe.js [--json]
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var childProcess = require("child_process");
var chromium = require("playwright").chromium;

var ROOT = path.join(__dirname, "..", "..", "..");
var MOCK_API = "http://miplan-mock.test";
var RAW = [
  "65000", "65.000", "65.000,50", "65000.50", "50,000", "$ 50.000", "$50.000", "UYU 50.000",
  "65000abc", "$ 65000 basura", "65.000xyz", "abc", "U$S 50.000", "65,5", "0", "",
];

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

function legacyDebtChain() {
  var src = childProcess.execSync("git show HEAD:js/app.js", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  function extract(name) {
    var start = src.indexOf("function " + name + "(");
    if (start < 0) throw new Error("HEAD:js/app.js has no " + name);
    var end = src.indexOf("\n}\n", start);
    return src.slice(start, end + 2);
  }
  var sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    extract("sanitizeDebtNumericInputString") + extract("debtNumericValueForState") + extract("parseDebtNumeric"),
    sandbox
  );
  return function (raw) {
    var display = sandbox.sanitizeDebtNumericInputString(raw);
    var state = sandbox.debtNumericValueForState(display);
    var n = sandbox.parseDebtNumeric(state);
    return { state: state, value: Number.isNaN(n) ? null : n };
  };
}

async function newJourneyPage(browser, origin) {
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
          ok: true,
          journey_id: "jrn-money-probe",
          cached: false,
          context: {
            contract_version: 1,
            context: { funnel: "credizona_rejected" },
            person: { nombre: "QA Money", email: "qa-money@example.test" },
            financial_prefill: { ingreso: 65000 },
            survey: { respuestas: { p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p7: "B", p8: "B", p9: "B", p10: "B" } },
          },
        }),
      });
    }
    return route.abort();
  });
  var page = await context.newPage();
  await page.goto(origin + "/e/money-probe");
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
  return page;
}

async function beforeNumberInput(page, raw) {
  await page.evaluate(function () {
    var old = document.getElementById("probe-num");
    if (old) old.remove();
    var el = document.createElement("input");
    el.type = "number";
    el.id = "probe-num";
    document.body.appendChild(el);
  });
  if (raw !== "") await page.type("#probe-num", raw);
  return page.evaluate(function () {
    var v = document.getElementById("probe-num").value;
    var n = parseFloat(v);
    return { value_attr: v, value: Number.isNaN(n) ? null : n };
  });
}

async function typeAndBlur(page, selector, raw) {
  await page.fill(selector, raw);
  await page.press(selector, "Tab");
  await page.waitForTimeout(30);
}

function errorVisible(key) {
  var el = document.querySelector('[data-money-error="' + key + '"]');
  return !!(el && el.style.display !== "none");
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var legacyDebt = legacyDebtChain();
  var srv = await startStaticServer();
  var browser = await chromium.launch();
  var rows = [];
  var checks = [];
  function check(name, cond) { checks.push({ name: name, ok: !!cond }); }

  try {
    var page = await newJourneyPage(browser, srv.origin);
    var i;
    for (i = 0; i < RAW.length; i++) rows.push({ raw: RAW[i], before_number_input: await beforeNumberInput(page, RAW[i]), before_debt: legacyDebt(RAW[i]) });

    // Profile income (step 0)
    await page.waitForSelector("#inp-ingreso-mensual");
    await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
    for (i = 0; i < RAW.length; i++) {
      await page.fill("#inp-ingreso-mensual", RAW[i]);
      rows[i].after_profile = await page.evaluate(function () {
        var data = collectBasicProfileForm();
        var err = document.getElementById("profile-ingreso-error");
        return { value: data ? data.incomeVal : null, error: err && err.style.display !== "none" ? err.textContent : null };
      });
    }
    await page.fill("#inp-ingreso-mensual", "65000");
    await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
    await page.click("#btn-continuar-ingreso");
    await page.waitForTimeout(300);

    // Debt monto / pago (step 1)
    await page.click("#btn-agregar-deuda");
    await page.waitForSelector('[data-deuda-field="monto"][data-deuda-idx="0"]');
    await page.selectOption('[data-deuda-field="tipo"][data-deuda-idx="0"]', "prestamo");
    await page.fill('[data-deuda-field="acreedor"][data-deuda-idx="0"]', "Banco QA");
    await page.click('[data-deuda-situacion="pagando_normal"][data-deuda-idx="0"]');
    for (i = 0; i < RAW.length; i++) {
      await typeAndBlur(page, '[data-deuda-field="monto"][data-deuda-idx="0"]', RAW[i]);
      rows[i].after_debt_monto = await page.evaluate(function (errFn) {
        var d = window.CZState.deudas[0];
        return { state: d.monto, error: new Function("return " + errFn)()("deuda:0:monto") };
      }, errorVisible.toString());
    }
    for (i = 0; i < RAW.length; i++) {
      await typeAndBlur(page, '[data-deuda-field="pago"][data-deuda-idx="0"]', RAW[i]);
      rows[i].after_debt_pago = await page.evaluate(function (errFn) {
        var d = window.CZState.deudas[0];
        return { state: d.pago, error: new Function("return " + errFn)()("deuda:0:pago") };
      }, errorVisible.toString());
    }
    // Invalid amount blocks the debt save
    await typeAndBlur(page, '[data-deuda-field="monto"][data-deuda-idx="0"]', "120.000");
    await typeAndBlur(page, '[data-deuda-field="pago"][data-deuda-idx="0"]', "6.500xyz");
    await page.click("#btn-guardar-deuda-edicion");
    await page.waitForTimeout(200);
    var blockedSave = await page.evaluate(function () {
      return { editing: window.CZState.editing_debt_index, error: window.CZState._deuda_validation_error };
    });
    check("invalid pago blocks debt save with correction message",
      blockedSave.editing === 0 && /punto para los miles/.test(blockedSave.error || ""));
    await typeAndBlur(page, '[data-deuda-field="pago"][data-deuda-idx="0"]', "6.500");
    await page.click("#btn-guardar-deuda-edicion");
    await page.waitForTimeout(200);
    var savedDebt = await page.evaluate(function () {
      var d = window.CZState.deudas[0];
      return { editing: window.CZState.editing_debt_index, monto: d.monto, pago: d.pago };
    });
    check("corrected debt saves canonical 120000 / 6500",
      savedDebt.editing == null && savedDebt.monto === "120000" && savedDebt.pago === 6500);

    // Gastos + custom expense (step 2)
    await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
    await page.waitForSelector('[data-gasto="vivienda"]');
    for (i = 0; i < RAW.length; i++) {
      await typeAndBlur(page, '[data-gasto="vivienda"]', RAW[i]);
      rows[i].after_gasto = await page.evaluate(function (errFn) {
        return { state: window.CZState.gastos.vivienda, error: new Function("return " + errFn)()("gasto:vivienda") };
      }, errorVisible.toString());
    }
    await page.click("#btn-agregar-gasto-custom");
    await page.waitForSelector('[data-custom-expense-field="amount"][data-custom-idx="0"]');
    for (i = 0; i < RAW.length; i++) {
      await typeAndBlur(page, '[data-custom-expense-field="amount"][data-custom-idx="0"]', RAW[i]);
      rows[i].after_custom = await page.evaluate(function (errFn) {
        return { state: window.CZState.custom_expenses[0].amount, error: new Function("return " + errFn)()("custom:0") };
      }, errorVisible.toString());
    }
    // Invalid expense blocks continuing to the dashboard
    await page.fill('[data-custom-expense-field="amount"][data-custom-idx="0"]', "");
    await typeAndBlur(page, '[data-gasto="vivienda"]', "20.000xyz");
    await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
    await page.waitForTimeout(300);
    var blockedStep = await page.evaluate(function () {
      var inp = document.querySelector('[data-gasto="vivienda"]');
      var err = document.querySelector('[data-money-error="gasto:vivienda"]');
      return { step: window.CZState.step, shown: inp ? inp.value : null, error_visible: !!(err && err.style.display !== "none") };
    });
    check("invalid expense blocks the step and keeps the raw text visible with error",
      blockedStep.step === 2 && blockedStep.shown === "20.000xyz" && blockedStep.error_visible);
    await typeAndBlur(page, '[data-gasto="vivienda"]', "20.000");
    await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
    await page.waitForTimeout(400);
    var advanced = await page.evaluate(function () { return { step: window.CZState.step, vivienda: window.CZState.gastos.vivienda }; });
    check("corrected expense advances with canonical 20000", advanced.step === 3 && advanced.vivienda === 20000);

    // Income tool (step 3)
    if (!(await page.$("#ing-formal"))) {
      await page.evaluate(function () {
        document.getElementById("main-content").insertAdjacentHTML("beforeend", renderHerramientasPlan1());
      });
    }
    for (i = 0; i < RAW.length; i++) {
      await typeAndBlur(page, "#ing-formal", RAW[i]);
      rows[i].after_income_tool = await page.evaluate(function () {
        var total = syncIngresosFromDom(window.CZState);
        var btn = document.getElementById("btn-guardar-ingreso-actualizado");
        updateIngresoSaveButtonState();
        return { total: Number.isFinite(total) ? total : "invalid", save_enabled: btn ? !btn.disabled : null };
      });
    }
    await page.context().close();
  } finally {
    await browser.close();
    srv.server.close();
  }

  var EXPECT = {
    "65000": 65000, "65.000": 65000, "65.000,50": 65000.5, "$ 50.000": 50000, "$50.000": 50000,
    "UYU 50.000": 50000, "65,5": 65.5, "0": 0,
  };
  rows.forEach(function (r) {
    var want = Object.prototype.hasOwnProperty.call(EXPECT, r.raw) ? EXPECT[r.raw] : null;
    var empty = r.raw === "";
    var invalid = want === null && !empty;
    // Profile income is digits-only (CZ-SALARIO-BOUNDARY-FIX-01): only "65000" is a valid format.
    var profileDigits = /^[0-9]+$/.test(r.raw);
    check("profile " + JSON.stringify(r.raw),
      !profileDigits && !empty ? r.after_profile.value === null && /solo con números/.test(r.after_profile.error || "")
        : empty ? r.after_profile.value === null
          : want === 0 ? r.after_profile.value === null : r.after_profile.value === want);
    // monto "0": the change handler re-renders the card, so the blur clean-up does not run
    // (same as before this change); a non-positive saldo is rejected at save.
    check("debt monto " + JSON.stringify(r.raw),
      invalid ? r.after_debt_monto.state === "" && r.after_debt_monto.error
        : empty ? r.after_debt_monto.state === "" && !r.after_debt_monto.error
          : want === 0 ? (r.after_debt_monto.state === "" || r.after_debt_monto.state === "0") && !r.after_debt_monto.error
          : r.after_debt_monto.state === String(want) && !r.after_debt_monto.error);
    check("debt pago " + JSON.stringify(r.raw),
      invalid ? r.after_debt_pago.state === "" && r.after_debt_pago.error
        : empty ? r.after_debt_pago.state === "" && !r.after_debt_pago.error
          : r.after_debt_pago.state === String(want) && !r.after_debt_pago.error);
    check("gasto " + JSON.stringify(r.raw),
      invalid ? r.after_gasto.state === "" && r.after_gasto.error
        : empty ? r.after_gasto.state === "" : r.after_gasto.state === want && !r.after_gasto.error);
    check("custom " + JSON.stringify(r.raw),
      invalid ? r.after_custom.state === 0 && r.after_custom.error
        : r.after_custom.state === (empty ? 0 : want) && !r.after_custom.error);
    // #ing-formal is digits-only too (INGRESO-FORMAL-DIGITS-01) and empty is invalid there.
    check("income tool " + JSON.stringify(r.raw),
      profileDigits ? r.after_income_tool.total === Number(r.raw)
        : r.after_income_tool.total === "invalid" && r.after_income_tool.save_enabled === false);
    [r.after_profile.value, r.after_debt_monto.state, r.after_debt_pago.state, r.after_gasto.state, r.after_custom.state, r.after_income_tool.total]
      .forEach(function (v) {
        if (r.raw === "65.000") check("'65.000' never becomes 65 (" + JSON.stringify(v) + ")", v !== 65 && v !== "65");
      });
  });

  var failed = checks.filter(function (c) { return !c.ok; });
  if (failed.length) process.exitCode = 1;
  if (asJson) {
    console.log(JSON.stringify({ rows: rows, checks: checks }, null, 2));
    return;
  }
  function v(x) { return x === null || x === undefined ? "∅" : JSON.stringify(x); }
  console.log("raw | BEFORE number-input(.value→parseFloat) | BEFORE debt(state→parseFloat) | AFTER profile | AFTER debt monto | AFTER debt pago | AFTER gasto | AFTER custom | AFTER income tool");
  rows.forEach(function (r) {
    console.log([
      JSON.stringify(r.raw),
      v(r.before_number_input.value_attr) + "→" + v(r.before_number_input.value),
      v(r.before_debt.state) + "→" + v(r.before_debt.value),
      r.after_profile.value !== null ? v(r.after_profile.value) : (r.after_profile.error ? "REJECTED" : "∅"),
      r.after_debt_monto.error ? "REJECTED" : v(r.after_debt_monto.state),
      r.after_debt_pago.error ? "REJECTED" : v(r.after_debt_pago.state),
      r.after_gasto.error ? "REJECTED" : v(r.after_gasto.state),
      r.after_custom.error ? "REJECTED" : v(r.after_custom.state),
      r.after_income_tool.total === "invalid" ? "REJECTED(save off)" : v(r.after_income_tool.total),
    ].join(" | "));
  });
  failed.forEach(function (c) { console.log("FAIL " + c.name); });
  console.log("MONEY_BOUNDARY_PROBE: " + (checks.length - failed.length) + "/" + checks.length + (failed.length ? " FAIL" : " PASS"));
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
