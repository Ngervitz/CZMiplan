/**
 * dev/debt-completeness-b2d-qa.js — Sprint B2d paid debts = debt dimension known (A–H)
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

  function paidDebt(overrides) {
    var d = {
      tipo: "prestamo",
      acreedor: "BROU",
      monto: 0,
      monto_original: 50000,
      pago: 0,
      pago_fuente: "pagada",
      situacion_ui: "pagada",
      cancelada: true,
      estado: "al_dia",
    };
    if (overrides) {
      for (var k in overrides) d[k] = overrides[k];
    }
    return d;
  }

  function activeDebt(overrides) {
    var d = {
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "40000",
      pago: "3000",
      situacion_ui: "pagando_normal",
      cancelada: false,
    };
    if (overrides) {
      for (var k in overrides) d[k] = overrides[k];
    }
    return d;
  }

  function heroHtml(st, ingreso) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    var diag = st.diag || calcularMotor();
    window.CZState.diag = diag;
    return _renderDashboardHeroCard(diag, window.CZState);
  }

  boot();

  var baseGastos = { vivienda: 12000, alimentacion: 8000, servicios: 2000 };

  // A — genuinely unknown debts
  ok("A _hasNoDeclaredDebts true when empty", _hasNoDeclaredDebts({
    deudas: [],
    no_debts_declared: false,
    financial_debts_complete: false,
  }) === true);
  var heroA = heroHtml({
    step: 3,
    gastos: baseGastos,
    gastos_missing_confirmed: false,
    deudas: [],
    no_debts_declared: false,
    financial_debts_complete: false,
    diag: null,
  }, 50000);
  ok("A Hero Confirmar mis deudas", heroA.indexOf("btn-hero-confirmar-deudas") >= 0);

  // B — no_debts_declared
  ok("B _hasNoDeclaredDebts false when no_debts_declared", _hasNoDeclaredDebts({
    deudas: [],
    no_debts_declared: true,
  }) === false);
  var heroB = heroHtml({
    step: 3,
    gastos: baseGastos,
    deudas: [],
    no_debts_declared: true,
    diag: null,
  }, 50000);
  ok("B no debt CTA", heroB.indexOf("btn-hero-confirmar-deudas") < 0);

  // C — 1 active debt
  ok("C _hasNoDeclaredDebts false with active debt", _hasNoDeclaredDebts({
    deudas: [activeDebt()],
    no_debts_declared: false,
  }) === false);
  var heroC = heroHtml({
    step: 3,
    gastos: baseGastos,
    deudas: [activeDebt()],
    no_debts_declared: false,
    diag: null,
  }, 50000);
  ok("C no debt CTA", heroC.indexOf("btn-hero-confirmar-deudas") < 0);

  // D — 1 paid debt
  var stD = {
    step: 3,
    gastos: baseGastos,
    gastos_missing_confirmed: false,
    deudas: [paidDebt()],
    no_debts_declared: false,
    financial_debts_complete: false,
    diag: null,
  };
  ok("D _hasNoDeclaredDebts false with paid debt", _hasNoDeclaredDebts(stD) === false);
  PRE.ingreso = 50000;
  window.CZState = stD;
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  ok("D isIncompleteFinancialProfile false", isIncompleteFinancialProfile(diagD, stD) === false);
  var heroD = _renderDashboardHeroCard(diagD, stD);
  ok("D Hero complete profile", heroD.indexOf("Tu panorama actual") >= 0);
  ok("D no Confirmar mis deudas", heroD.indexOf("btn-hero-confirmar-deudas") < 0);

  // E — 1 active + 1 paid
  ok("E _hasNoDeclaredDebts false mixed", _hasNoDeclaredDebts({
    deudas: [activeDebt(), paidDebt({ acreedor: "Visa" })],
  }) === false);

  // F — mark paid shape (app.js handler)
  var stF = {
    step: 3,
    gastos: baseGastos,
    deudas: [activeDebt({ monto: "60000", pago: "5000" })],
    no_debts_declared: false,
    diag: null,
  };
  PRE.ingreso = 55000;
  window.CZState = stF;
  var dF = stF.deudas[0];
  dF.monto_original = 60000;
  dF.situacion_ui = "pagada";
  dF.pago = 0;
  dF.pago_fuente = "pagada";
  dF.cancelada = true;
  dF.monto = 0;
  ok("F _hasNoDeclaredDebts false after mark paid", _hasNoDeclaredDebts(stF) === false);
  window.CZState.diag = calcularMotor();
  var heroF = _renderDashboardHeroCard(window.CZState.diag, stF);
  ok("F Hero no debt CTA after paid", heroF.indexOf("btn-hero-confirmar-deudas") < 0);

  // G — debt deleted
  ok("G _hasNoDeclaredDebts true after delete", _hasNoDeclaredDebts({
    deudas: [],
    no_debts_declared: false,
    financial_debts_complete: false,
  }) === true);
  var heroG = heroHtml({
    step: 3,
    gastos: baseGastos,
    deudas: [],
    no_debts_declared: false,
    diag: null,
  }, 50000);
  ok("G Hero Confirmar mis deudas after delete", heroG.indexOf("btn-hero-confirmar-deudas") >= 0);

  // H — 3 paid, 0 active, low expenses card eligible
  var stH = {
    step: 3,
    gastos: { vivienda: 2000 },
    gastos_missing_confirmed: false,
    deudas: [
      paidDebt({ acreedor: "A" }),
      paidDebt({ acreedor: "B" }),
      paidDebt({ acreedor: "C" }),
    ],
    no_debts_declared: false,
    low_expenses_confirmed: false,
    diag: null,
  };
  PRE.ingreso = 80000;
  window.CZState = stH;
  var diagH = calcularMotor();
  window.CZState.diag = diagH;
  ok("H _hasNoDeclaredDebts false with 3 paid", _hasNoDeclaredDebts(stH) === false);
  ok("H isIncompleteFinancialProfile false", isIncompleteFinancialProfile(diagH, stH) === false);
  var heroH = _renderDashboardHeroCard(diagH, stH);
  ok("H Hero complete no debt CTA", heroH.indexOf("btn-hero-confirmar-deudas") < 0
    && heroH.indexOf("Tu panorama actual") >= 0);
  ok("H low_expenses card eligible", typeof shouldShowLowExpensesConfirmCard === "function"
    && shouldShowLowExpensesConfirmCard(stH, diagH) === true);

  console.log("\nDebt completeness B2d QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
