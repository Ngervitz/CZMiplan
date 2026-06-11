/**
 * dev/gastos-missing-confirmed-qa.js — Sprint B1.2 skip-flag clear (A–F)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
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

  function baseState(overrides) {
    var st = {
      step: 2,
      gastos: {},
      gastos_missing_confirmed: true,
      financial_expenses_complete: false,
      no_debts_declared: false,
      deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
      snap: { plan_id: 2, fecha_inicio: new Date().toISOString() },
      temporal: { dashboard_generated_at: new Date().toISOString() },
      user_recovery_state: "dashboard_generated",
      custom_expenses: [],
      diag: null,
    };
    if (overrides) {
      Object.keys(overrides).forEach(function(k) { st[k] = overrides[k]; });
    }
    return st;
  }

  boot();
  PRE.ingreso = 33333;

  // A — skip → add gastos > 0 clears flag
  window.CZState = baseState();
  ok("A flag true before sync", window.CZState.gastos_missing_confirmed === true);
  window.CZState.gastos = { vivienda: 8000, alimentacion: 5000, salud: 2049 };
  syncGastosMissingConfirmedAfterExpensesDeclared(window.CZState);
  ok("A gastos_missing_confirmed false after gastos > 0", window.CZState.gastos_missing_confirmed === false);
  ok("A financial_expenses_complete true", window.CZState.financial_expenses_complete === true);

  // B — with debts: profile no longer incomplete (expenses branch)
  window.CZState.diag = calcularMotor();
  ok("B isIncompleteFinancialProfile false", isIncompleteFinancialProfile(window.CZState.diag, window.CZState) === false);

  // C — Hero no Completar gastos from expenses
  var heroC = _renderDashboardHeroCard(window.CZState.diag, window.CZState);
  ok("C Hero no Completar gastos", heroC.indexOf("Completar gastos") < 0);
  ok("C Hero not incomplete title", heroC.indexOf("Tu diagnóstico todavía no está completo") < 0);

  // D — narrativa not Diagnóstico incompleto (expenses branch)
  var narrD = renderNarrativaInterpretacion(window.CZState.diag, window.CZState);
  ok("D no Diagnóstico incompleto narrative", narrD.indexOf("Diagnóstico incompleto") < 0);
  ok("D motor narrativa renders", narrD.indexOf("Qué está pasando") >= 0 || narrD.length > 0);

  // E — open editor path, total remains 0: flag stays true
  window.CZState = baseState({ step: 2, gastos: {} });
  window.CZState.step = 3;
  goToEditGastosFromDashboard();
  ok("E goToEditGastos sets step 2", window.CZState.step === 2);
  ok("E flag unchanged on editor open alone", window.CZState.gastos_missing_confirmed === true);
  syncGastosMissingConfirmedAfterExpensesDeclared(window.CZState);
  ok("E flag remains true when total 0", window.CZState.gastos_missing_confirmed === true);

  // F — normal flow without skip unchanged
  window.CZState = baseState({
    gastos_missing_confirmed: false,
    financial_expenses_complete: true,
    gastos: { vivienda: 12000, alimentacion: 6000 },
  });
  syncGastosMissingConfirmedAfterExpensesDeclared(window.CZState);
  ok("F flag stays false", window.CZState.gastos_missing_confirmed === false);
  window.CZState.diag = calcularMotor();
  ok("F complete profile", isIncompleteFinancialProfile(window.CZState.diag, window.CZState) === false);

  console.log("\nGastos missing confirmed QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
