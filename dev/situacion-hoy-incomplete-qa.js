/**
 * dev/situacion-hoy-incomplete-qa.js — "Tu situación hoy" incomplete override (A–I)
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

  boot();

  function situacionHtml(stOverrides) {
    PRE.ingreso = stOverrides.ingreso != null ? stOverrides.ingreso : PRE.ingreso;
    window.CZState = Object.assign({
      gastos: {},
      gastos_missing_confirmed: false,
      no_debts_declared: false,
      deudas: [],
      snap: { plan_id: 1 },
      diag: null,
    }, stOverrides);
    delete window.CZState.diag;
    var d = calcularMotor();
    window.CZState.diag = d;
    return _renderTuSituacionHoy(d, window.CZState);
  }

  // A — Income yes, expenses missing
  var htmlA = situacionHtml({
    ingreso: 80000,
    gastos_missing_confirmed: true,
    no_debts_declared: true,
  });
  ok("A incomplete block shown", htmlA.indexOf("información suficiente para evaluar con precisión") >= 0);
  ok("A no manageable copy", htmlA.indexOf("margen para mejorar con algunos cambios") < 0);
  ok("A proximo paso line", htmlA.indexOf("Próximo paso recomendado: completar tus gastos mensuales") >= 0);

  // B — Income yes, debt missing (expenses complete)
  var htmlB = situacionHtml({
    ingreso: 80000,
    gastos: { vivienda: 15000, alimentacion: 8000 },
    gastos_missing_confirmed: false,
    no_debts_declared: true,
    deudas: [],
  });
  ok("B debt missing incomplete block", htmlB.indexOf("información suficiente para evaluar con precisión") >= 0);
  ok("B no recovery claims", htmlB.indexOf("volver a intentar más adelante") < 0);

  // C — Income yes, debt + expenses missing
  var htmlC = situacionHtml({
    ingreso: 80000,
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
  });
  ok("C both missing incomplete block", htmlC.indexOf("panorama de gastos y obligaciones mensuales") >= 0);

  // D — Complete profile unchanged
  PRE.ingreso = 75000;
  window.CZState = {
    gastos: { alquiler: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "100000",
      pago: "7000",
      situacion_ui: "pagando_normal",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  var htmlD = _renderTuSituacionHoy(diagD, window.CZState);
  ok("D complete profile not incomplete helper", isIncompleteFinancialProfile(diagD, window.CZState) === false);
  ok("D standard copy preserved", htmlD.indexOf("principal desafío") >= 0
    || htmlD.indexOf("margen para mejorar") >= 0
    || htmlD.indexOf("comprometido") >= 0);
  ok("D no incomplete override copy", htmlD.indexOf("información suficiente para evaluar con precisión") < 0);

  // E — MiDeuda profile (debts + complete gastos)
  PRE.ingreso = 40000;
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
  var diagE = calcularMotor();
  window.CZState.diag = diagE;
  var htmlE = _renderTuSituacionHoy(diagE, window.CZState);
  ok("E MiDeuda recommended", (diagE.recommended_tools || []).indexOf("mideuda") >= 0);
  ok("E not incomplete profile", isIncompleteFinancialProfile(diagE, window.CZState) === false);
  ok("E standard situacion copy", htmlE.indexOf("información suficiente para evaluar con precisión") < 0);

  // F — Retry eligible profile
  PRE.ingreso = 80000;
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
  var htmlF = _renderTuSituacionHoy(diagF, window.CZState);
  ok("F standard situacion unchanged", htmlF.indexOf("información suficiente para evaluar con precisión") < 0);

  // G — Confidence card still Información incompleta
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagG = calcularMotor();
  window.CZState.diag = diagG;
  var confG = renderConfianzaDiagnostico(diagG);
  ok("G confidence Información incompleta", confG.indexOf("Información incompleta") >= 0);

  // H — Early expenses CTA still appears
  var tabG = renderTabPlan();
  ok("H early expenses CTA", tabG.indexOf("btn-retry-fallback-gastos") >= 0);

  // I — SyntheticMotorQA module
  ok("I synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  console.log("\nSituacion hoy incomplete QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
