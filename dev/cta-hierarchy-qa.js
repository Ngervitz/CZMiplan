/**
 * dev/cta-hierarchy-qa.js — CTA hierarchy + profile_extreme_debt CRM QA (A-H)
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
  global.trackCRMEvent = function() { global._crmEvents = global._crmEvents || []; global._crmEvents.push(arguments); };
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
    global._gtmEvents = [];
    global._crmEvents = [];
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
  load("js/events.js");
  load("js/ui.js");
  load("js/consent.js");
  load("js/app.js");
  }

  function profile31Deuda() {
    return [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "22222222",
      pago: "2",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }];
  }

  function runProfile31(gastosMissing) {
    PRE.ingreso = 45000;
    PRE.vinoDeRechazo = true;
    window.CZState = {
      gastos: {},
      gastos_missing_confirmed: !!gastosMissing,
      deudas: profile31Deuda(),
      snap: { plan_id: 2 },
      diag: null,
      _profileExtremeDebtCrmKey: null,
    };
    var d = calcularMotor();
    window.CZState.diag = d;
    return d;
  }

  boot();

  // A — Profile 31, expenses missing
  var diagA = runProfile31(true);
  var stA = window.CZState;
  var hA = resolveDashboardCtaHierarchy(diagA, stA);
  var htmlA = renderHorizonteRecalificacion(diagA, stA);
  ok("A flag on diag", diagA.flag_deuda_sanity_extreme === true);
  ok("A hierarchy P1 mideuda", hA.tier === "P1" && hA.primary === "mideuda");
  ok("A secondary complete_expenses", hA.secondary === "complete_expenses");
  ok("A MiDeuda branded primary", htmlA.indexOf("Ordenar mi deuda con MiDeuda") >= 0);
  ok("A complete expenses secondary", htmlA.indexOf("btn-retry-fallback-gastos") >= 0);
  ok("A Plus demoted", htmlA.indexOf("También podés contrastar tu situación") >= 0);
  ok("A no retry CTA", htmlA.indexOf("btn-retry-application") < 0);
  ok("A no unlocked retry copy", htmlA.indexOf("Solicitar préstamo nuevamente") < 0
    && htmlA.indexOf("condiciones de revisar una nueva solicitud") < 0);

  // B — Profile 31, expenses complete
  var diagB = runProfile31(false);
  var stB = window.CZState;
  var hB = resolveDashboardCtaHierarchy(diagB, stB);
  var htmlB = renderHorizonteRecalificacion(diagB, stB);
  ok("B MiDeuda primary", hB.primary === "mideuda");
  ok("B no complete expenses secondary", hB.secondary == null);
  ok("B no gastos fallback button", htmlB.indexOf("btn-retry-fallback-gastos") < 0);
  ok("B no retry CTA", htmlB.indexOf("btn-retry-application") < 0);

  // C — Debt, retry blocked, MiDeuda recommended, no sanity guard
  PRE.ingreso = 40000;
  window.CZState = {
    gastos: { vivienda: 10000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "50000", pago: "3000", situacion_ui: "atrasado_pagando" }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagC = calcularMotor();
  window.CZState.diag = diagC;
  ok("C no sanity flag", !diagC.flag_deuda_sanity_extreme);
  ok("C mideuda recommended", (diagC.recommended_tools || []).indexOf("mideuda") >= 0);
  ok("C retry blocked", !isRetryEligible(diagC, window.CZState));
  var hC = resolveDashboardCtaHierarchy(diagC, window.CZState);
  var htmlC = renderRetryBlockedFallbackCta(diagC, window.CZState);
  ok("C P2 mideuda primary", hC.tier === "P2" && hC.primary === "mideuda");
  ok("C branded MiDeuda fallback", htmlC.indexOf("Ordenar mi deuda con MiDeuda") >= 0);
  ok("C no retry button in fallback", htmlC.indexOf("btn-retry-application") < 0);

  // D — Expenses missing, no debt / no extreme debt
  PRE.ingreso = 50000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  ok("D no extreme debt", !diagD.flag_deuda_sanity_extreme);
  var hD = resolveDashboardCtaHierarchy(diagD, window.CZState);
  var htmlD = renderRetryBlockedFallbackCta(diagD, window.CZState);
  ok("D P3 complete_expenses primary", hD.tier === "P3" && hD.primary === "complete_expenses");
  ok("D no MiDeuda fallback", htmlD.indexOf("MiDeuda") < 0);
  ok("D gastos CTA present", htmlD.indexOf("btn-retry-fallback-gastos") >= 0);

  // E — Healthy retry unchanged
  boot();
  PRE.ingreso = 80000;
  window.CZState.deudas = [{
    tipo: "prestamo",
    acreedor: "BROU",
    monto: "75000",
    pago: "6000",
    situacion_ui: "pagando_normal",
    debt_confidence: "high",
  }];
  window.CZState.gastos = { vivienda: 20000, alimentacion: 10000 };
  window.CZState.gastos_missing_confirmed = false;
  window.CZState.snap = { plan_id: 2, fecha_inicio: new Date().toISOString() };
  var diagE = calcularMotor();
  window.CZState.diag = diagE;
  ok("E retry eligible", isRetryEligible(diagE, window.CZState));
  ok("E retry state unlocked", getRetryCtaState(diagE, window.CZState) === "unlocked");
  var htmlE = renderHorizonteRecalificacion(diagE, window.CZState);
  ok("E retry button present", htmlE.indexOf("btn-retry-application") >= 0);

  // F — Low confidence + positive horizon, retry blocked → fallback present
  var diagF = {
    planId: 1,
    nivelR: "A",
    scoreReset: 22,
    fin: { flujoLibre: 50000, ratio: 0.1, dti_ratio: 0.2, scoreFinanciero: 22, totalDeuda: 10000, totalPago: 2000 },
    horizonte: { banda: "inmediato", label: "Ya hay condiciones para considerar una solicitud" },
    bloqueadores: [],
    interpretacion_v2: { confidence_level: "low", severity_level: "bajo" },
    financial_reality_warning: false,
    missing_payment_information: false,
    recommended_tools: [],
  };
  var stF = { snap: { plan_id: 1 }, deudas: [], gastos: { vivienda: 10000 }, gastos_missing_confirmed: false };
  ok("F retry blocked by low confidence", !isRetryEligible(diagF, stF));
  var htmlF = renderHorizonteRecalificacion(diagF, stF);
  ok("F low-confidence replacement block", htmlF.indexOf("Necesitamos completar tu diagnóstico") >= 0);
  ok("F fallback addon present", htmlF.indexOf("btn-retry-fallback-plus") >= 0
    || htmlF.indexOf("btn-retry-fallback-gastos") >= 0
    || htmlF.indexOf("btn-retry-fallback-deuda") >= 0);
  ok("F no retry button", htmlF.indexOf("btn-retry-application") < 0);

  // G — CRM event once per diagnostic state, CRM-only
  boot();
  window.CZState = {
    diag: null,
    _profileExtremeDebtCrmKey: null,
  };
  PRE.ingreso = 45000;
  window.CZState.deudas = profile31Deuda();
  window.CZState.diag = calcularMotor();
  maybeTrackProfileExtremeDebt(window.CZState);
  maybeTrackProfileExtremeDebt(window.CZState);
  ok("G CRM emitted once", global._crmEvents.length === 1);
  ok("G event name", global._crmEvents[0][0] === "profile_extreme_debt");
  ok("G payload flag", global._crmEvents[0][1].flag_deuda_sanity_extreme === true);
  ok("G payload plan_id", global._crmEvents[0][1].plan_id != null);
  ok("G no GTM events", global._gtmEvents.length === 0);
  ok("G key persisted", window.CZState._profileExtremeDebtCrmKey != null);

  // H — SyntheticMotorQA count (run subprocess)
  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
