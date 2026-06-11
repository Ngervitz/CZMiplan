/**
 * dev/zero-active-debt-b2e-qa.js — Sprint B2e zero-active debt contextual copy (A–I)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var execSync = require("child_process").execSync;
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = {
    search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
    href: "",
  };
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

  var APPROVED_PROBLEMA = "No registrás deudas activas actualmente";
  var APPROVED_NEXT = "Revisá periódicamente tus gastos y tu margen disponible";
  var OLD_PROBLEMA = "No tenes claro cuanto entra";
  var OLD_NEXT = "Ordenar el panorama completo de deudas";

  function runProfile(st, ingreso) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    var diag = st.diag || calcularMotor();
    window.CZState.diag = diag;
    return {
      diag: diag,
      hero: _renderDashboardHeroCard(diag, window.CZState),
      tab: renderTabPlan(),
      narr: renderNarrativaInterpretacion(diag, window.CZState),
    };
  }

  boot();

  // A — 1 cancelled debt, complete gastos, planId 1
  var rA = runProfile({
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000, transporte: 2000 },
    gastos_missing_confirmed: false,
    financial_expenses_complete: true,
    no_debts_declared: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "50000",
      pago: "5000",
      cancelada: true,
      situacion_ui: "pagando_normal",
    }],
    snap: { plan_id: 1 },
    diag: null,
  }, 80000);
  ok("A helper true", _isZeroActiveDebtCompleteProfile(rA.diag, window.CZState) === true);
  ok("A planId 1", rA.diag.planId === 1);
  ok("A hero approved problema", rA.hero.indexOf(APPROVED_PROBLEMA) >= 0);
  ok("A hero approved next step", rA.hero.indexOf(APPROVED_NEXT) >= 0);
  ok("A hero no old problema", rA.hero.indexOf(OLD_PROBLEMA) < 0);
  ok("A hero no ordenar panorama", rA.hero.indexOf(OLD_NEXT) < 0);

  // B — 1 active debt, Plan 2
  boot();
  var rB = runProfile({
    step: 3,
    gastos: { vivienda: 10000, alimentacion: 5000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "80000",
      pago: "35000",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  }, 80000);
  ok("B helper false", _isZeroActiveDebtCompleteProfile(rB.diag, window.CZState) === false);
  ok("B planId 2", rB.diag.planId === 2);
  ok("B hero keeps plan problema", rB.hero.indexOf("Estas pagando demasiado") >= 0);
  ok("B no approved override", rB.hero.indexOf(APPROVED_PROBLEMA) < 0);

  // C — no_debts_declared = true (complete gastos; not zero-active-debt profile)
  boot();
  var rC = runProfile({
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000 },
    gastos_missing_confirmed: false,
    financial_expenses_complete: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  }, 80000);
  ok("C helper false", _isZeroActiveDebtCompleteProfile(rC.diag, window.CZState) === false);
  ok("C complete hero not incomplete card", rC.hero.indexOf("Tu diagnóstico todavía no está completo") < 0);
  ok("C no approved override", rC.hero.indexOf(APPROVED_PROBLEMA) < 0);
  ok("C keeps plan1 default problema", rC.hero.indexOf(OLD_PROBLEMA) >= 0);

  // D — no debt ever declared (empty array, not no_debts_declared)
  boot();
  PRE.ingreso = 80000;
  window.CZState = {
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    diag: null,
  };
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  ok("D helper false", _isZeroActiveDebtCompleteProfile(diagD, window.CZState) === false);
  var heroD = _renderDashboardHeroCard(diagD, window.CZState);
  ok("D incomplete hero path", heroD.indexOf("Tu diagnóstico todavía no está completo") >= 0
    || heroD.indexOf(OLD_PROBLEMA) >= 0);
  ok("D no approved override", heroD.indexOf(APPROVED_PROBLEMA) < 0);

  // E — 1 cancelled + 1 active
  boot();
  var rE = runProfile({
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [
      { tipo: "prestamo", acreedor: "BROU", monto: "50000", pago: "5000", cancelada: true },
      { tipo: "prestamo", acreedor: "Santander", monto: "80000", pago: "8000", situacion_ui: "pagando_normal" },
    ],
    snap: { plan_id: 2 },
    diag: null,
  }, 80000);
  ok("E helper false", _isZeroActiveDebtCompleteProfile(rE.diag, window.CZState) === false);
  ok("E no approved hero override", rE.hero.indexOf(APPROVED_PROBLEMA) < 0);

  // F — Acción prioritaria (reuse A)
  boot();
  rA = runProfile({
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000, transporte: 2000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [{ tipo: "prestamo", monto: "50000", pago: "5000", cancelada: true }],
    snap: { plan_id: 1 },
    diag: null,
  }, 80000);
  ok("F accion block approved copy", rA.tab.indexOf("Acción prioritaria") >= 0
    && rA.tab.indexOf(APPROVED_NEXT) >= 0);
  ok("F accion no ordenar panorama", rA.tab.indexOf(OLD_NEXT) < 0);

  // G — Narrativa primer paso
  ok("G narrativa approved next step", rA.narr.indexOf(APPROVED_NEXT) >= 0);
  ok("G narrativa no ordenar panorama", rA.narr.indexOf(OLD_NEXT) < 0);

  // H — SyntheticMotorQA
  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("H SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  // I — Regression suites
  console.log("\n--- Regression suites ---");
  [
    ["hero-card-qa", "dev/hero-card-qa.js"],
    ["incomplete-profile-qa", "dev/incomplete-profile-qa.js"],
    ["debt-completeness-b2d-qa", "dev/debt-completeness-b2d-qa.js"],
    ["cta-hierarchy-qa", "dev/cta-hierarchy-qa.js"],
  ].forEach(function(s) {
    var out = execSync("node " + s[1], { cwd: root, encoding: "utf8" });
    ok("I " + s[0] + " PASS", out.indexOf("[FAIL]") < 0);
  });

  console.log("\nzero-active-debt-b2e-qa — " + passed + "/" + (passed + failed)
    + (failed ? " (" + failed + " FAIL)" : " PASS"));
  if (failed) process.exit(1);
})();
