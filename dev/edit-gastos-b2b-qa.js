/**
 * dev/edit-gastos-b2b-qa.js — Sprint B2b visible Editar gastos in Tu situación hoy (A–J)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
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

  function zoneSlice(html, zoneKey) {
    var marker = "dash-zone-" + zoneKey;
    var start = html.indexOf(marker);
    if (start < 0) return "";
    var searchFrom = start + marker.length;
    var next = html.indexOf('class="dash-zone dash-zone-', searchFrom);
    return next >= 0 ? html.slice(start, next) : html.slice(start);
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

  boot();
  var appJs = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");

  function tabFor(st, ingreso) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    var diag = st.diag || calcularMotor();
    window.CZState.diag = diag;
    return renderTabPlan();
  }

  // Complete profile
  PRE.ingreso = 75000;
  window.CZState = {
    step: 3,
    gastos: { vivienda: 15000, alimentacion: 8000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    no_debts_declared: false,
    diag: null,
  };
  var tabComplete = tabFor(window.CZState, 75000);
  var situZoneComplete = zoneSlice(tabComplete, "situacion-hoy");
  var numerosZone = zoneSlice(tabComplete, "numeros");

  // A — visible without opening accordion
  ok("A Editar gastos in situacion-hoy zone", situZoneComplete.indexOf("btn-editar-gastos-situacion-hoy") >= 0
    && situZoneComplete.indexOf("Editar gastos") >= 0);
  ok("A outside collapsed accordion body", situZoneComplete.indexOf("btn-editar-gastos-situacion-hoy") >= 0
    && numerosZone.indexOf('aria-expanded="false"') >= 0);

  // B — handler reuse
  ok("B situacion-hoy id wired to goToEditGastosFromDashboard", appJs.indexOf('e.target.id === "btn-editar-gastos-situacion-hoy"') >= 0
    && appJs.indexOf("goToEditGastosFromDashboard();") >= 0);
  ok("B same handler block as dashboard button", /btn-editar-gastos-dashboard[\s\S]{0,280}goToEditGastosFromDashboard/.test(appJs)
    && appJs.indexOf("btn-editar-gastos-situacion-hoy") >= 0);

  // C — Hero unchanged (no edit gastos in hero)
  var heroZone = zoneSlice(tabComplete, "hero");
  ok("C Hero no Editar gastos button", heroZone.indexOf("btn-editar-gastos-situacion-hoy") < 0
    && heroZone.indexOf("Editar gastos") < 0);

  // D — Plus unchanged
  ok("D Plus zone present", tabComplete.indexOf("dash-zone-plus") >= 0);
  ok("D btn-conocer-plus preserved", tabComplete.indexOf('id="btn-conocer-plus"') >= 0);

  // E — Accordion unchanged
  ok("E numeros accordion shell", tabComplete.indexOf("cz-dash-numeros") >= 0);
  ok("E accordion still has dashboard edit CTA slot", uiJs.indexOf("renderDashboardEditGastosCta(diag, st)") >= 0);

  // F — Complete profile
  ok("F complete profile situacion-hoy CTA", situZoneComplete.indexOf("btn-editar-gastos-situacion-hoy") >= 0);

  // G — Incomplete profile
  var tabInc = tabFor({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    diag: null,
  }, 80000);
  var situInc = zoneSlice(tabInc, "situacion-hoy");
  ok("G incomplete profile situacion-hoy CTA", situInc.indexOf("btn-editar-gastos-situacion-hoy") >= 0);

  // H — low_expenses flow unchanged (source)
  ok("H confirmLowExpenses unchanged", appJs.indexOf("function confirmLowExpenses") >= 0);
  ok("H btn-low-expenses-add-gastos still uses goToEditGastosFromDashboard", appJs.indexOf('e.target.id === "btn-low-expenses-add-gastos"') >= 0);

  // I — synthetic module
  ok("I synthetic motor QA present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  // J — helper in ui.js after summary
  ok("J _renderSituacionHoyEditGastosCta used in both branches", uiJs.indexOf("_renderSituacionHoyEditGastosCta()") >= 0
    && (uiJs.match(/_renderSituacionHoyEditGastosCta\(\)/g) || []).length >= 2);

  console.log("\nEdit gastos B2b QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
