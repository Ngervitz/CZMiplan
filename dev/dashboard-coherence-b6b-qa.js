/**
 * dev/dashboard-coherence-b6b-qa.js — Sprint B6b dashboard coherence resolver QA (A-F)
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
  global.trackEvent = function() { global._gtmEvents = global._gtmEvents || []; global._gtmEvents.push(arguments); };
  global.trackCRMEvent = function() {};
  global.enviarCRM = function() {};
  global.localStorage = { getItem: function() { return null; }, setItem: function() {} };
  global.sessionStorage = { getItem: function() { return null; }, setItem: function() {} };

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
    global._gtmEvents = [];
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
  }

  function healthyAltoDiag() {
    PRE.ingreso = 65300;
    window.CZState = {
      gastos: { vivienda: 18000, alimentacion: 9000, servicios: 3000, transporte: 2000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "tarjeta",
        acreedor: "OCA",
        monto: "27000",
        pago: "700",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      snap: { plan_id: 1 },
      diag: null,
    };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return diag;
  }

  function healthyBajoDiag() {
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
        debt_confidence: "high",
      }],
      snap: { plan_id: 2 },
      diag: null,
    };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return diag;
  }

  function ordenarPanoramaEligibleDiag() {
    PRE.ingreso = 80000;
    window.CZState = {
      gastos: { vivienda: 20000, alimentacion: 10000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "50000",
        pago: "15000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      snap: { plan_id: 2 },
      diag: null,
    };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return diag;
  }

  boot();

  // A — healthy_organized + costoDeudaNivel Alto
  var diagA = healthyAltoDiag();
  var cohA = resolveDashboardCoherence(diagA, window.CZState);
  ok("A profileTier healthy_organized", cohA.profileTier === "healthy_organized");
  ok("A nextStepKey optimizar_deuda_cara", cohA.nextStepKey === "optimizar_deuda_cara");
  ok("A suppressOrdenarPanorama true", cohA.suppressOrdenarPanorama === true);
  ok("A hideAccionPrioritaria true", cohA.hideAccionPrioritaria === true);
  ok("A heroProblemOverride set", cohA.heroProblemOverride != null);
  ok("A no ordenar panorama in hero", _renderDashboardHeroCard(diagA, window.CZState, cohA).indexOf("panorama completo") < 0);
  if (isRetryEligible(diagA, window.CZState)) {
    ok("A showRetry true when eligible", cohA.showRetry === true);
  } else {
    ok("A showRetry false when not eligible", cohA.showRetry === false);
  }

  // B — healthy_organized + costoDeudaNivel Bajo
  boot();
  var diagB = healthyBajoDiag();
  var cohB = resolveDashboardCoherence(diagB, window.CZState);
  ok("B nextStepKey mantener_disciplina", cohB.nextStepKey === "mantener_disciplina");
  ok("B suppressOrdenarPanorama true", cohB.suppressOrdenarPanorama === true);
  if (isRetryEligible(diagB, window.CZState)) {
    ok("B showRetry true when eligible", cohB.showRetry === true);
  } else {
    ok("B showRetry false when not eligible", cohB.showRetry === false);
  }

  // C — ordenar_panorama profile blocks retry UI even if eligible
  boot();
  var diagC = ordenarPanoramaEligibleDiag();
  var cohC = resolveDashboardCoherence(diagC, window.CZState);
  ok("C nextStepKey ordenar_panorama", cohC.nextStepKey === "ordenar_panorama");
  ok("C isRetryEligible true", isRetryEligible(diagC, window.CZState) === true);
  ok("C showRetry false", cohC.showRetry === false);
  ok("C retryCompatible false", cohC.retryCompatible === false);
  var tabC = renderTabPlan();
  ok("C no retry button in tab", tabC.indexOf("btn-retry-application") < 0);

  // D — critical profile preserves existing behavior
  boot();
  PRE.ingreso = 35000;
  window.CZState = {
    gastos: { vivienda: 12000, alimentacion: 7000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "tarjeta",
      acreedor: "OCA",
      monto: "90000",
      pago: "0",
      situacion_ui: "mora_reclamo",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  var cohD = resolveDashboardCoherence(diagD, window.CZState);
  ok("D profileTier critical", cohD.profileTier === "critical");
  ok("D heroProblemOverride null", cohD.heroProblemOverride === null);
  ok("D suppressOrdenarPanorama false", cohD.suppressOrdenarPanorama === false);
  ok("D nextStepText from motor path", cohD.nextStepText === _resolveDashboardNextStepText(diagD, window.CZState));

  // E — Plan 4 showRetry false
  boot();
  PRE.ingreso = 35000;
  window.CZState = {
    gastos: { vivienda: 12000, alimentacion: 7000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "tarjeta",
      acreedor: "OCA",
      monto: "90000",
      pago: "0",
      situacion_ui: "mora_reclamo",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagE = calcularMotor();
  window.CZState.diag = diagE;
  var cohE = resolveDashboardCoherence(diagE, window.CZState);
  ok("E planId is 4", diagE.planId === 4);
  ok("E showRetry false", cohE.showRetry === false);
  ok("E heroProblemOverride null", cohE.heroProblemOverride === null);

  // F — incomplete profile not healthy_organized
  boot();
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagF = calcularMotor();
  window.CZState.diag = diagF;
  var cohF = resolveDashboardCoherence(diagF, window.CZState);
  ok("F NOT healthy_organized", cohF.profileTier !== "healthy_organized");
  ok("F incomplete hero preserved", renderTabPlan().indexOf("Tu diagnóstico todavía no está completo") >= 0);

  console.log("\nDashboard coherence B6b QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
