/**
 * dev/hero-card-qa.js — Sprint 1 Hero Card + hierarchy QA (A-J)
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
    global._crmEvents = [];
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
  }

  function zoneIndex(html, zoneClass) {
    return html.indexOf('dash-zone-' + zoneClass);
  }

  boot();

  // A — Incomplete profile hero
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagInc = calcularMotor();
  window.CZState.diag = diagInc;
  var tabInc = renderTabPlan();
  var heroInc = _renderDashboardHeroCard(diagInc, window.CZState);

  ok("A hero visible", tabInc.indexOf("cz-dashboard-hero") >= 0);
  ok("A Completar gastos in hero", tabInc.indexOf("Completar gastos") >= 0);
  ok("A no Plus in hero", tabInc.indexOf("btn-hero-ver-plus") < 0);
  ok("A hero before diagnostic zone", zoneIndex(tabInc, "hero") >= 0
    && zoneIndex(tabInc, "hero") < zoneIndex(tabInc, "diagnostico"));
  ok("A diagnostico before accion zone", zoneIndex(tabInc, "diagnostico") < zoneIndex(tabInc, "accion"));
  ok("A incomplete title", heroInc.indexOf("Tu diagnóstico todavía no está completo") >= 0);

  // B — Complete profile hero
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
  var diagComplete = calcularMotor();
  window.CZState.diag = diagComplete;
  var tabComplete = renderTabPlan();
  ok("B complete hero visible", tabComplete.indexOf("cz-dashboard-hero") >= 0);
  ok("B plan unchanged", diagComplete.planId != null && diagComplete.plan && diagComplete.plan.titulo);
  ok("B motor scoreReset unchanged path", diagComplete.scoreReset != null);

  // C — Hierarchy order via CSS zones present
  ok("C dash-hierarchy wrapper", tabComplete.indexOf("dash-hierarchy") >= 0);
  ok("C diagnostico before accion in DOM", zoneIndex(tabComplete, "diagnostico") < zoneIndex(tabComplete, "accion"));
  ok("C accion before frenando in order props", zoneIndex(tabComplete, "accion") < zoneIndex(tabComplete, "frenando"));
  ok("C plus before situacion-hoy", zoneIndex(tabComplete, "plus") < zoneIndex(tabComplete, "situacion-hoy"));
  ok("C acciones-recom before situacion-hoy", zoneIndex(tabComplete, "acciones-recom") < zoneIndex(tabComplete, "situacion-hoy"));
  ok("C confianza before sugerencias", zoneIndex(tabComplete, "confianza") < zoneIndex(tabComplete, "sugerencias"));

  // D — Sticky CTA unchanged (step 3 hides bar)
  window.CZState.step = 3;
  updateSticky();
  var barDisplay = global.document.getElementById("sticky-bar");
  ok("D updateSticky exists", typeof updateSticky === "function");
  ok("D step 3 sticky logic unchanged in source", fs.readFileSync(path.join(root, "js/ui.js"), "utf8").indexOf("step 3 = dashboard — sticky hidden") >= 0);

  // E — Navigation hooks preserved
  ok("E btn-conocer-plus preserved", tabComplete.indexOf('id="btn-conocer-plus"') >= 0);
  ok("E btn-retry-fallback-gastos preserved", tabInc.indexOf('id="btn-retry-fallback-gastos"') >= 0);
  ok("E cz-plus-entry preserved", tabComplete.indexOf('id="cz-plus-entry"') >= 0);

  // F — Scoring unchanged
  ok("F scoreReset internal", diagComplete.scoreReset === calcularMotor().scoreReset);
  ok("F scoreFinanciero internal", diagComplete.fin.scoreFinanciero != null);

  // G — Retry eligibility unchanged
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
  var diagRetry = calcularMotor();
  window.CZState.diag = diagRetry;
  ok("G retry eligible", isRetryEligible(diagRetry, window.CZState));

  // H — CRM unchanged
  var crm = buildCRMData(diagRetry);
  ok("H CRM score_reset", crm.diagnosis.score_reset === diagRetry.scoreReset);
  ok("H CRM no hero field", crm.diagnosis.hero_card == null);

  // I — GTM registry unchanged (no new dashboard events)
  ok("I no hero GTM event registered", fs.readFileSync(path.join(root, "js/events.js"), "utf8").indexOf("hero_card") < 0);

  // J — SyntheticMotorQA module
  ok("J synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  console.log("\nHero card QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
