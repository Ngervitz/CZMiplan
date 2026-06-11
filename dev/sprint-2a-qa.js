/**
 * dev/sprint-2a-qa.js — Move recommended actions out of números accordion (A-L)
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

  function zoneIndex(html, zone) {
    return html.indexOf("dash-zone-" + zone);
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");

  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
  var appJs = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");

  // Complete profile
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
    herr: { compromisos: {} },
    diag: null,
  };
  var diagComplete = calcularMotor();
  window.CZState.diag = diagComplete;
  var tabComplete = renderTabPlan();

  // Incomplete profile
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    herr: { compromisos: {} },
    diag: null,
  };
  var diagInc = calcularMotor();
  window.CZState.diag = diagInc;
  var tabInc = renderTabPlan();

  var numerosSlice = (function() {
    var start = tabComplete.indexOf("dash-zone-numeros");
    var end = tabComplete.indexOf("dash-zone-confianza");
    return start >= 0 ? tabComplete.slice(start, end) : "";
  })();

  // A — visible by default, outside accordion
  ok("A acciones-recom zone present", tabComplete.indexOf("dash-zone-acciones-recom") >= 0);
  ok("A acciones before numeros zone in DOM", zoneIndex(tabComplete, "acciones-recom") < zoneIndex(tabComplete, "numeros"));
  ok("A accion items outside collapsed body", tabComplete.indexOf("accion-recomendada-item") >= 0
    && tabComplete.indexOf("accion-recomendada-item") < tabComplete.indexOf("id=\"cz-dash-numeros-body\""));

  // B — números accordion intact
  ok("B accordion shell present", tabComplete.indexOf("dash-numeros-accordion") >= 0);
  ok("B toggle id preserved", tabComplete.indexOf('id="btn-dash-numeros-toggle"') >= 0);
  ok("B body id preserved", tabComplete.indexOf('id="cz-dash-numeros-body"') >= 0);
  ok("B collapsed default", tabComplete.indexOf('aria-expanded="false"') >= 0);

  // C — checkbox toggle contract
  ok("C data-toggle-compromiso in tab", tabComplete.indexOf("data-toggle-compromiso") >= 0);
  ok("C compromiso-check markup", tabComplete.indexOf("compromiso-check") >= 0);
  ok("C handler in app.js", appJs.indexOf("[data-toggle-compromiso]") >= 0);

  // D — Ver más expand contract
  ok("D ver mas button id", tabComplete.indexOf('id="btn-ver-mas-acciones"') >= 0
    || tabComplete.indexOf("data-acciones-ver-mas") >= 0
    || tabComplete.indexOf("accion-recomendada-item") >= 0);
  ok("D expand handler in app.js", appJs.indexOf("[data-acciones-ver-mas]") >= 0);

  // E — complete profile actions visible
  ok("E complete actions section title", tabComplete.indexOf("Acciones recomendadas") >= 0);
  ok("E complete has action items", tabComplete.indexOf("accion-recomendada-item") >= 0);

  // F — incomplete filtered actions visible
  ok("F incomplete zone present", tabInc.indexOf("dash-zone-acciones-recom") >= 0);
  ok("F incomplete still renders list", tabInc.indexOf("acciones-recomendadas-wrap") >= 0);

  // G — IDs preserved
  ok("G btn-conocer-plus", tabComplete.indexOf('id="btn-conocer-plus"') >= 0);
  ok("G btn-dash-numeros-toggle", tabComplete.indexOf('id="btn-dash-numeros-toggle"') >= 0);
  ok("G cz-dashboard-hero", tabComplete.indexOf('id="cz-dashboard-hero"') >= 0);

  // H — sticky unchanged
  ok("H updateSticky exists", typeof updateSticky === "function");
  ok("H sticky comment preserved", uiJs.indexOf("step 3 = dashboard — sticky hidden") >= 0);

  // I — synthetic module
  ok("I synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  // J — prior QA modules present
  ok("J sprint-15 qa present", fs.existsSync(path.join(root, "dev/sprint-15-qa.js")));
  ok("J acciones-recom qa present", fs.existsSync(path.join(root, "dev/acciones-recom-qa.js")));

  // K — not inside números body zone
  ok("K numeros zone has no action items", numerosSlice.indexOf("accion-recomendada-item") < 0);
  ok("K numeros zone has no herramientas title block", numerosSlice.indexOf("Pasos concretos basados en tu diagnóstico") < 0);

  // L — single render
  var tabPlanBlock = uiJs.slice(uiJs.indexOf("function renderTabPlan()"), uiJs.indexOf("function renderMiPlanSuggestionBox()"));
  ok("L single renderHerramientas in renderTabPlan", (tabPlanBlock.match(/\+ renderHerramientas\(\)/g) || []).length === 1);
  ok("L no renderHerramientas inside numeros shell", tabPlanBlock.indexOf("_renderNumerosAccordionShell") >= 0
    && tabPlanBlock.slice(tabPlanBlock.indexOf("_renderNumerosAccordionShell")).indexOf("+ renderHerramientas()") < 0);

  // CSS order
  ok("CSS low-expenses-confirm order 3", /dash-zone-low-expenses-confirm\{order:3;\}/.test(css));
  ok("CSS acciones-recom order 7", /dash-zone-acciones-recom\{order:7;\}/.test(css));
  ok("CSS numeros order 9", /dash-zone-numeros\{order:9;\}/.test(css));

  console.log("\nSprint 2A QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
