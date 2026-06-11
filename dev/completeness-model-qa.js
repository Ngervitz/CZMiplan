/**
 * dev/completeness-model-qa.js — getFinancialProfileCompleteness Phase 1 stub (A–I)
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
    load("js/app.js");
  }

  function fn() {
    return typeof getFinancialProfileCompleteness === "function"
      ? getFinancialProfileCompleteness
      : window._getFinancialProfileCompleteness;
  }

  boot();

  // A — Income missing
  PRE.ingreso = 0;
  window.CZState = { deudas: [], gastos: {} };
  var rA = fn()(window.CZState);
  ok("A overall incomplete", rA.overall === "incomplete");
  ok("A income missing", rA.income === "missing");

  // B — Income present, no debts declared, no expenses
  PRE.ingreso = 50000;
  window.CZState = { deudas: [], gastos: {}, no_debts_declared: false };
  var rB = fn()(window.CZState);
  ok("B overall incomplete", rB.overall === "incomplete");

  // C — Income present, debts declared, no expenses
  PRE.ingreso = 50000;
  window.CZState = {
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "50000", pago: "3000" }],
    gastos: {},
    no_debts_declared: false,
  };
  var rC = fn()(window.CZState);
  ok("C overall incomplete", rC.overall === "incomplete");
  ok("C expenses missing", rC.expenses === "missing");

  // D — Income present, no_debts_confirmed, expenses complete
  PRE.ingreso = 75000;
  window.CZState = {
    deudas: [],
    gastos: { vivienda: 15000, alimentacion: 8000 },
    no_debts_declared: true,
    financial_expenses_complete: true,
  };
  var rD = fn()(window.CZState);
  ok("D overall complete", rD.overall === "complete");
  ok("D debts no_debts_confirmed", rD.debts === "no_debts_confirmed");

  // E — Income present, debts declared, expenses complete
  PRE.ingreso = 50000;
  window.CZState = {
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "50000", pago: "3000" }],
    gastos: { vivienda: 10000 },
    financial_expenses_complete: true,
    no_debts_declared: false,
  };
  var rE = fn()(window.CZState);
  ok("E overall complete", rE.overall === "complete");

  // F — coverage_ratio present when income > 0
  PRE.ingreso = 40000;
  window.CZState = { deudas: [], gastos: { vivienda: 10000 }, no_debts_declared: true };
  var rF = fn()(window.CZState);
  ok("F coverage_ratio is number", typeof rF.coverage_ratio === "number");
  ok("F coverage_ratio equals gastos/ingreso", Math.abs(rF.coverage_ratio - 0.25) < 0.0001);

  // G — low_expenses_confirmed always false in stub
  PRE.ingreso = 80000;
  window.CZState = {
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "100000", pago: "5000" }],
    gastos: { vivienda: 20000, alimentacion: 10000 },
    financial_expenses_complete: true,
  };
  var rG = fn()(window.CZState);
  ok("G low_expenses_confirmed false", rG.low_expenses_confirmed === false);

  // H — $500 gastos on $100.000 income (known permissive limitation)
  PRE.ingreso = 100000;
  window.CZState = {
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "80000", pago: "5000" }],
    gastos: { vivienda: 500 },
    financial_expenses_complete: true,
    no_debts_declared: false,
  };
  var rH = fn()(window.CZState);
  ok("H expenses complete stub limitation", rH.expenses === "complete");
  ok("H coverage_ratio 0.005", Math.abs(rH.coverage_ratio - 0.005) < 0.0001);

  // I — gastos_missing_confirmed = true
  PRE.ingreso = 45000;
  window.CZState = {
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "50000", pago: "3000" }],
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: false,
  };
  var rI = fn()(window.CZState);
  ok("I expenses missing when gastos_missing_confirmed", rI.expenses === "missing");

  console.log("\nCompleteness model QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
