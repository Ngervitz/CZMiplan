/**
 * dev/incomplete-profile-qa.js — Incomplete profile dashboard QA (A-G)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
  global.document = { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} };
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
  }

  function runIncompleteNoDebt(gastosMissing) {
    PRE.ingreso = 80000;
    window.CZState = {
      gastos: {},
      gastos_missing_confirmed: !!gastosMissing,
      no_debts_declared: true,
      deudas: [],
      snap: { plan_id: 1 },
      diag: null,
    };
    var d = calcularMotor();
    window.CZState.diag = d;
    return d;
  }

  boot();

  // A — Income yes, debt no, expenses no: no debt-ordering narrative
  var diagA = runIncompleteNoDebt(true);
  var stA = window.CZState;
  var narrA = renderNarrativaInterpretacion(diagA, stA);
  var tabA = renderTabPlan();
  ok("A isIncompleteFinancialProfile", isIncompleteFinancialProfile(diagA, stA) === true);
  ok("A no debt-ordering copy in narrativa", narrA.indexOf("panorama completo de deudas") < 0);
  ok("A no ordenar_panorama accion in tab", tabA.indexOf("Ordenar el panorama completo de deudas") < 0);

  // B — Incomplete profile: contextual missing-information narrative
  ok("B incomplete title present", narrA.indexOf("Información insuficiente para completar el diagnóstico") >= 0);
  ok("B body mentions gastos mensuales", narrA.indexOf("necesitamos conocer mejor tus gastos mensuales") >= 0);
  ok("B no generic debt flow copy", narrA.indexOf("punto de partida más útil") < 0);

  // C — Complete expenses CTA is primary (early in tab)
  var hC = resolveDashboardCtaHierarchy(diagA, stA);
  ok("C hierarchy P3 complete_expenses", hC.tier === "P3" && hC.primary === "complete_expenses");
  ok("C early CTA in tab plan", tabA.indexOf("btn-retry-fallback-gastos") >= 0);
  ok("C warning before CTA", tabA.indexOf("no incluye tus gastos mensuales") >= 0
    && tabA.indexOf("no incluye tus gastos mensuales") < tabA.indexOf("btn-retry-fallback-gastos"));
  ok("C no duplicate CTA in narrativa", narrA.indexOf("btn-retry-fallback-gastos") < 0);
  ok("C no accion prioritaria block", tabA.indexOf("Acción prioritaria") < 0);

  // D — Profile with debts: existing debt narrative unchanged
  PRE.ingreso = 50000;
  window.CZState = {
    gastos: { vivienda: 10000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "tarjeta",
      acreedor: "OCA",
      monto: "50000",
      pago: "3000",
      situacion_ui: "atrasado_pagando",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  var narrD = renderNarrativaInterpretacion(diagD, window.CZState);
  ok("D not incomplete helper", isIncompleteFinancialProfile(diagD, window.CZState) === false);
  ok("D no incomplete title", narrD.indexOf("Información insuficiente para completar el diagnóstico") < 0);
  ok("D motor narrativa preserved", narrD.indexOf("Qué está pasando") >= 0 || narrD.indexOf("problema") >= 0 || narrD.length > 100);

  // E — MiDeuda profile: no regression
  PRE.ingreso = 45000;
  PRE.vinoDeRechazo = true;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "22222222",
      pago: "2",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagE = calcularMotor();
  window.CZState.diag = diagE;
  var hE = resolveDashboardCtaHierarchy(diagE, window.CZState);
  var htmlE = renderHorizonteRecalificacion(diagE, window.CZState);
  ok("E MiDeuda P1 primary", hE.tier === "P1" && hE.primary === "mideuda");
  ok("E MiDeuda branded CTA", htmlE.indexOf("Ordenar mi deuda con MiDeuda") >= 0);
  ok("E sanity flag", diagE.flag_deuda_sanity_extreme === true);

  // F — Retry-eligible profile: no regression
  PRE.ingreso = 80000;
  PRE.vinoDeRechazo = false;
  window.CZState = {
    gastos: { vivienda: 20000, alimentacion: 10000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "75000",
      pago: "6000",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2, fecha_inicio: new Date().toISOString() },
    diag: null,
  };
  var diagF = calcularMotor();
  window.CZState.diag = diagF;
  ok("F retry eligible", isRetryEligible(diagF, window.CZState));
  var htmlF = renderHorizonteRecalificacion(diagF, window.CZState);
  ok("F retry button present", htmlF.indexOf("btn-retry-application") >= 0);

  // G — SyntheticMotorQA hook (smoke: module loads; full suite run separately)
  ok("G synthetic QA module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  console.log("\nIncomplete profile QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
