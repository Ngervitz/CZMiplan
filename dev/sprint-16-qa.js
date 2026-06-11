/**
 * dev/sprint-16-qa.js — Sprint 1.6 incomplete profile with debt present (A-L)
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

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");

  // Profile X — income + large debt + expenses missing
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
  var diagX = calcularMotor();
  window.CZState.diag = diagX;
  var stX = window.CZState;
  var tabX = renderTabPlan();
  var narrX = renderNarrativaInterpretacion(diagX, stX);
  var heroX = _renderDashboardHeroCard(diagX, stX);
  var horizonX = renderHorizonteRecalificacion(diagX, stX);

  ok("A isIncompleteFinancialProfile true", isIncompleteFinancialProfile(diagX, stX) === true);
  ok("B hero primary Completar gastos", heroX.indexOf("Completar gastos") >= 0
    && heroX.indexOf("btn-retry-fallback-gastos") >= 0);
  ok("C hero no Plus CTA", heroX.indexOf("btn-hero-ver-plus") < 0
    && heroX.indexOf("Ver Mi Plan Plus") < 0);
  ok("D hero not Plus-only", heroX.indexOf("btn-retry-fallback-gastos") >= 0);
  ok("E no manejo posible copy", narrX.indexOf("manejo posible") < 0
    && narrX.indexOf("sostener decisiones simples") < 0
    && tabX.indexOf("Capacidad de recuperación") < 0);
  ok("F gastos missing before strategy", narrX.indexOf("gastos mensuales") >= 0
    && narrX.indexOf("capacidad real de pago") >= 0);
  ok("G debt amount visible", tabX.indexOf("Por donde empezar") >= 0
    && tabX.indexOf("BROU") >= 0);
  ok("H provisional debt strategy", narrX.indexOf("Diagnóstico incompleto") >= 0
    && (tabX.indexOf("Estrategia pendiente") >= 0 || tabX.indexOf("Saldo a revisar") >= 0));
  ok("I no firm estabilizar/refinanciar/atacar", tabX.indexOf("Acción prioritaria") < 0
    && tabX.indexOf("debe estabilizarse") < 0
    && tabX.indexOf("atacarse primero") < 0
    && horizonX.indexOf("Ordenar mi deuda con MiDeuda") < 0);
  ok("J horizon gastos-first", horizonX.indexOf("Completar gastos mensuales") >= 0);

  // J — Complete profile unchanged
  PRE.ingreso = 50000;
  PRE.vinoDeRechazo = false;
  window.CZState = {
    gastos: { vivienda: 10000, alimentacion: 8000 },
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
  var diagComplete = calcularMotor();
  window.CZState.diag = diagComplete;
  var narrComplete = renderNarrativaInterpretacion(diagComplete, window.CZState);
  ok("J complete profile not incomplete override", isIncompleteFinancialProfile(diagComplete, window.CZState) === false);
  ok("J complete narrativa not incomplete title", narrComplete.indexOf("Diagnóstico incompleto") < 0);
  ok("J complete has qué está pasando block", narrComplete.indexOf("Qué está pasando") >= 0);

  ok("K synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  console.log("\nSprint 1.6 QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
