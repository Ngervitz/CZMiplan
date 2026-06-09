/**

 * dev/retry-eligibility-qa.js — Retry CTA / Plan 3 eligibility QA (cases A-G)

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

  global.trackEvent = function() { global._retryEvents = global._retryEvents || []; global._retryEvents.push(arguments); };

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

    global._retryEvents = [];

    load("js/config.js");

    load("js/creditors.js");

    load("js/survey.js");

    load("js/algorithms.js");

    load("js/events.js");

    load("js/crm.js");

    load("js/ui.js");

    load("js/consent.js");

    load("js/app.js");

    global.trackEvent = function(eventName, payload) {
      global._retryEvents = global._retryEvents || [];
      global._retryEvents.push([eventName, payload]);
    };

    if (!global.window.CZState) global.window.CZState = {};

  }



  function healthyPlan3Diag() {

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

    window.CZState.snap = { plan_id: 2, fecha_inicio: new Date().toISOString() };

    return calcularMotor();

  }



  function criticalDebtDiag() {

    PRE.ingreso = 45000;

    window.CZState.deudas = [{

      tipo: "prestamo",

      acreedor: "BROU",

      monto: "22222222",

      pago: "2",

      situacion_ui: "pagando_normal",

      debt_confidence: "high",

    }];

    window.CZState.gastos = {};

    window.CZState.snap = { plan_id: 2, fecha_inicio: new Date().toISOString() };

    return calcularMotor();

  }



  // A — Healthy Plan 3 (dti < 1 so other guards pass)

  boot();

  var diagA = healthyPlan3Diag();

  ok("A planId is 3", diagA.planId === 3);

  ok("A isRetryEligible true", isRetryEligible(diagA, window.CZState) === true);

  ok("A retry CTA unlocked", getRetryCtaState(diagA, window.CZState) === "unlocked");

  ok("A retry button rendered", renderRetryCtaHorizonAddon(diagA, window.CZState).indexOf("btn-retry-application") >= 0);



  // B — Plan 3 with secondary blocker (not planId)

  boot();

  var diagB = healthyPlan3Diag();

  ok("B base planId is 3", diagB.planId === 3);

  diagB.fin.flujoLibre = -1;

  ok("B plan 3 negative flujo blocked", !isRetryEligible(diagB, window.CZState));

  diagB = healthyPlan3Diag();

  diagB.interpretacion_v2.confidence_level = "low";

  ok("B plan 3 low confidence blocked", !isRetryEligible(diagB, window.CZState));



  // C — Plan 4 always blocked

  boot();

  PRE.ingreso = 35000;

  window.CZState.deudas = [{ tipo: "tarjeta", acreedor: "OCA", monto: "90000", pago: "0", situacion_ui: "mora_reclamo", debt_confidence: "high" }];

  window.CZState.gastos = { vivienda: 12000, alimentacion: 7000 };

  window.CZState.snap = { plan_id: 2 };

  var diagC = calcularMotor();

  ok("C planId is 4", diagC.planId === 4);

  ok("C isRetryEligible false", isRetryEligible(diagC, window.CZState) === false);

  ok("C retry not unlocked", getRetryCtaState(diagC, window.CZState) !== "unlocked");



  // D — Plan 2 healthy profile

  boot();

  PRE.ingreso = 45000;

  window.CZState.deudas = [{

    tipo: "tarjeta",

    acreedor: "OCA",

    monto: "30000",

    pago: "2000",

    situacion_ui: "pagando_normal",

    debt_confidence: "high",

  }];

  window.CZState.gastos = { vivienda: 10000, alimentacion: 6000 };

  window.CZState.snap = { plan_id: 1 };

  var diagD = calcularMotor();

  ok("D planId is 1 or 2", diagD.planId === 1 || diagD.planId === 2);

  ok("D retry unlocked", getRetryCtaState(diagD, window.CZState) === "unlocked");



  // E — Profile 31 sanity guard still blocks

  boot();

  var diagE = criticalDebtDiag();

  ok("E missing_payment_information", !!diagE.missing_payment_information);

  ok("E confidence low", diagE.interpretacion_v2.confidence_level === "low");

  ok("E retry blocked", !isRetryEligible(diagE, window.CZState));



  // F — Events only when eligible

  boot();

  global._retryEvents = [];

  var diagFBlocked = criticalDebtDiag();

  renderRetryCtaHorizonAddon(diagFBlocked, window.CZState);

  var blockedEvent = (global._retryEvents || []).some(function(args) {

    return args[0] === CZ_EVENT_NAMES.RETRY_CTA_SHOWN;

  });

  ok("F retry_cta_shown not emitted when blocked", !blockedEvent);



  boot();

  global._retryEvents = [];

  var diagFEligible = healthyPlan3Diag();

  window.CZState._retryCtaLastTrackedState = null;

  renderRetryCtaHorizonAddon(diagFEligible, window.CZState);

  var eligibleEvent = (global._retryEvents || []).some(function(args) {

    return args[0] === CZ_EVENT_NAMES.RETRY_CTA_SHOWN;

  });

  ok("F retry_cta_shown emitted when eligible", eligibleEvent);



  console.log("");

  console.log("PASSED: " + passed + "/" + (passed + failed));

  process.exit(failed > 0 ? 1 : 0);

})();


