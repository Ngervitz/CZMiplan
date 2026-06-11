/**
 * dev/low-expenses-confirm-qa.js — Sprint B1 low_expenses_confirmed (A–L)
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
  global.localStorage = { _data: {}, getItem: function(k) { return this._data[k] || null; }, setItem: function(k, v) { this._data[k] = v; } };

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

  function baseSt(overrides) {
    var st = Object.assign({
      step: 3,
      tab: "plan",
      deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "80000", pago: "5000" }],
      gastos: { vivienda: 5000 },
      no_debts_declared: false,
      gastos_missing_confirmed: false,
      financial_expenses_complete: true,
      low_expenses_confirmed: false,
      low_expenses_confirmed_at: null,
      low_expenses_confirmed_snapshot: null,
      diag: { planId: 2, fin: { flujoLibre: 50000 } },
    }, overrides || {});
    window.CZState = st;
    return st;
  }

  boot();

  // A — 5% / 100k, not confirmed → card visible
  PRE.ingreso = 100000;
  var stA = baseSt({ gastos: { vivienda: 5000 } });
  ok("A card visible 5% 100k", shouldShowLowExpensesConfirmCard(stA, stA.diag) === true);
  ok("A card html rendered", renderLowExpensesConfirmCard(stA.diag, stA).indexOf("cz-low-expenses-confirm") >= 0);

  // B — confirmed → hidden
  PRE.ingreso = 100000;
  var stB = baseSt({ gastos: { vivienda: 5000 }, low_expenses_confirmed: true,
    low_expenses_confirmed_snapshot: { ingreso: 100000, gastos_total: 5000 } });
  ok("B card hidden when confirmed", shouldShowLowExpensesConfirmCard(stB, stB.diag) === false);

  // C — 5% / 25k income → hidden (below min ingreso)
  PRE.ingreso = 25000;
  var stC = baseSt({ gastos: { vivienda: 1250 } });
  ok("C card hidden income 25k", shouldShowLowExpensesConfirmCard(stC, stC.diag) === false);

  // D — 12% coverage → hidden
  PRE.ingreso = 100000;
  var stD = baseSt({ gastos: { vivienda: 12000 } });
  ok("D card hidden at 12%", shouldShowLowExpensesConfirmCard(stD, stD.diag) === false);

  // E — zero gastos → suppressed (incomplete path)
  PRE.ingreso = 100000;
  var stE = baseSt({ gastos: {}, financial_expenses_complete: false });
  ok("E zero gastos suppressed", shouldShowLowExpensesConfirmCard(stE, stE.diag) === false);
  ok("E incomplete suppression helper", isLowExpensesConfirmSuppressed(stE, stE.diag) === true);

  // F — missing debts → suppressed
  PRE.ingreso = 100000;
  var stF = baseSt({ deudas: [], no_debts_declared: false, gastos: { vivienda: 5000 } });
  ok("F missing debts suppressed", shouldShowLowExpensesConfirmCard(stF, stF.diag) === false);
  ok("F incomplete profile suppressed", isIncompleteFinancialProfile(stF.diag, stF) === true);

  // G — confirm then change income → invalidated
  PRE.ingreso = 100000;
  var stG = baseSt({ gastos: { vivienda: 5000 } });
  confirmLowExpenses(stG);
  ok("G confirmed true", stG.low_expenses_confirmed === true);
  PRE.ingreso = 90000;
  ok("G invalidated on income change", invalidateLowExpensesConfirmedIfStale(stG) === true);
  ok("G flag cleared", stG.low_expenses_confirmed === false);

  // H — confirm then change total expenses → invalidated
  PRE.ingreso = 100000;
  var stH = baseSt({ gastos: { vivienda: 5000 } });
  confirmLowExpenses(stH);
  window.CZState.gastos = { vivienda: 6000 };
  ok("H invalidated on gastos change", invalidateLowExpensesConfirmedIfStale(stH) === true);

  // I — confirm then change debt amount → preserved
  PRE.ingreso = 100000;
  var stI = baseSt({ gastos: { vivienda: 5000 } });
  confirmLowExpenses(stI);
  stI.deudas[0].monto = "95000";
  ok("I debt amount change preserves flag", invalidateLowExpensesConfirmedIfStale(stI) === false);
  ok("I flag still true", stI.low_expenses_confirmed === true);

  // J — confirm then change debt count → preserved (same gastos total)
  PRE.ingreso = 100000;
  var stJ = baseSt({ gastos: { vivienda: 5000 } });
  confirmLowExpenses(stJ);
  stJ.deudas.push({ tipo: "tarjeta", acreedor: "OCA", monto: "20000", pago: "1500" });
  ok("J debt count change preserves flag", invalidateLowExpensesConfirmedIfStale(stJ) === false);

  // K — persistence across refresh (localStorage round-trip)
  boot();
  PRE.ingreso = 100000;
  var stK = baseSt({ gastos: { vivienda: 5000 } });
  confirmLowExpenses(stK);
  window.guardarLocal();
  var rawSaved = localStorage.getItem(STORAGE_KEY);
  ok("K guardarLocal wrote snapshot", !!rawSaved && rawSaved.indexOf("low_expenses_confirmed") >= 0);
  var parsedSaved = JSON.parse(rawSaved);
  clearLowExpensesConfirmed(window.CZState);
  window.CZState.gastos = { vivienda: 5000 };
  window.CZState.low_expenses_confirmed = !!parsedSaved.low_expenses_confirmed;
  window.CZState.low_expenses_confirmed_at = parsedSaved.low_expenses_confirmed_at || null;
  window.CZState.low_expenses_confirmed_snapshot = parsedSaved.low_expenses_confirmed_snapshot || null;
  invalidateLowExpensesConfirmedIfStale(window.CZState);
  ok("K persistence low_expenses_confirmed", window.CZState.low_expenses_confirmed === true);
  ok("K card hidden after restore", shouldShowLowExpensesConfirmCard(window.CZState, window.CZState.diag) === false);

  // L — SyntheticMotorQA (subprocess)
  console.log("\n--- SyntheticMotorQA ---");
  var execSync = require("child_process").execSync;
  var motorOut = execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("L SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  console.log("\nLow expenses confirm QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
