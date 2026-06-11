/**
 * dev/hero-expenses-cta-qa.js — Sprint B1.1 Hero gastos CTA (A–E)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "", href: "" };
  global.document = {
    getElementById: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.enviarCRM = function() {};
  global.localStorage = { getItem: function() { return null; }, setItem: function() {} };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  function boot() {
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/ui.js");
    load("js/app.js");
  }

  function heroHtml(st, ingreso) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    var diag = st.diag || calcularMotor();
    window.CZState.diag = diag;
    return _renderDashboardHeroCard(diag, window.CZState);
  }

  boot();

  // A — empty gastos, flag false → Completar gastos in hero
  var htmlA = heroHtml({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  }, 80000);
  ok("A Completar gastos in hero", htmlA.indexOf("Completar gastos") >= 0);
  ok("A btn-retry-fallback-gastos present", htmlA.indexOf("btn-retry-fallback-gastos") >= 0);

  // B — gastos primary, no Plus in hero
  ok("B no Plus in hero", htmlA.indexOf("btn-hero-ver-plus") < 0);
  ok("B gastos uses primary btn class", htmlA.indexOf('btn btn-primary" id="btn-retry-fallback-gastos"') >= 0);

  // C — gastos_missing_confirmed true
  var htmlC = heroHtml({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  }, 80000);
  ok("C flag true still shows Completar gastos", htmlC.indexOf("Completar gastos") >= 0);

  // D — gastos total > 0, complete debts → no gastos-only incomplete hero CTA path
  var htmlD = heroHtml({
    step: 3,
    gastos: { vivienda: 15000, alimentacion: 8000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    snap: { plan_id: 2 },
    diag: null,
  }, 75000);
  ok("D complete profile not incomplete hero title", htmlD.indexOf("Tu diagnóstico todavía no está completo") < 0);
  ok("D no Completar gastos in complete hero", htmlD.indexOf("btn-retry-fallback-gastos") < 0);

  // E — low_expenses card unchanged (coverage < 8%, gastos > 0, debts declared)
  PRE.ingreso = 100000;
  window.CZState = {
    step: 3,
    tab: "plan",
    gastos: { vivienda: 5000 },
    gastos_missing_confirmed: false,
    financial_expenses_complete: true,
    no_debts_declared: false,
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "80000", pago: "5000" }],
    low_expenses_confirmed: false,
    snap: { plan_id: 2 },
    diag: null,
  };
  window.CZState.diag = calcularMotor();
  ok("E low expenses card visible", shouldShowLowExpensesConfirmCard(window.CZState, window.CZState.diag) === true);
  ok("E low expenses card html", renderLowExpensesConfirmCard(window.CZState.diag, window.CZState).indexOf("cz-low-expenses-confirm") >= 0);

  // F — missing debts suppress low expenses card
  PRE.ingreso = 100000;
  window.CZState = {
    step: 3,
    gastos: { vivienda: 5000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    low_expenses_confirmed: false,
    snap: { plan_id: 1 },
    diag: null,
  };
  ok("F missing debts suppresses low expenses card", shouldShowLowExpensesConfirmCard(window.CZState, window.CZState.diag) === false);

  console.log("\nHero expenses CTA QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
