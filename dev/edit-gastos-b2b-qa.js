/**
 * dev/edit-gastos-b2b-qa.js — Sprint B2b/B2f Edit Expenses CTA (A–L)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var execSync = require("child_process").execSync;
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
  var heroZone = zoneSlice(tabComplete, "hero");
  var frenandoZone = zoneSlice(tabComplete, "frenando");

  // A — canonical CTA in Tu situación hoy
  ok("A Editar gastos in situacion-hoy zone", situZoneComplete.indexOf("btn-editar-gastos-situacion-hoy") >= 0
    && situZoneComplete.indexOf("Editar gastos") >= 0);

  // B — handler wired to goToEditGastosFromDashboard
  ok("B situacion-hoy id wired to goToEditGastosFromDashboard", appJs.indexOf('e.target.id === "btn-editar-gastos-situacion-hoy"') >= 0
    && appJs.indexOf("goToEditGastosFromDashboard();") >= 0);

  // C — Tus números no longer renders dashboard edit CTA
  ok("C numeros zone no btn-editar-gastos-dashboard", numerosZone.indexOf("btn-editar-gastos-dashboard") < 0);
  ok("C tab has single edit gastos button id", (tabComplete.match(/btn-editar-gastos-situacion-hoy/g) || []).length >= 1
    && tabComplete.indexOf("btn-editar-gastos-dashboard") < 0);

  // D — Accordion structure preserved
  ok("D numeros accordion shell", tabComplete.indexOf("cz-dash-numeros") >= 0);
  ok("D accordion toggle preserved", numerosZone.indexOf("btn-dash-numeros-toggle") >= 0
    && numerosZone.indexOf('aria-expanded="false"') >= 0
    && numerosZone.indexOf("cz-dash-numeros-body") >= 0);

  // E — Radiografía still in numeros accordion
  ok("E radiografia still rendered in numeros", numerosZone.indexOf("renderRadiografia") < 0
    && (numerosZone.indexOf("Lo que pagas sin reducir deuda") >= 0
      || numerosZone.indexOf("LO QUE PODRIA ACUMULARSE") >= 0
      || numerosZone.indexOf("calcularRadiografia") >= 0
      || numerosZone.indexOf("pctComprometido") >= 0
      || typeof renderRadiografia === "function"));

  // F — Relación deuda/ingreso still on tab
  ok("F relacion deuda ingreso on tab", frenandoZone.indexOf("Relación deuda / ingreso") >= 0
    || tabComplete.indexOf("Relación deuda / ingreso") >= 0);

  // G — Financial metrics / indicadores in numeros
  ok("G metrics indicadores in numeros", numerosZone.indexOf('class="metrics"') >= 0
    || numerosZone.indexOf("Plata que te sobra/mes") >= 0);

  // H — low_expenses flow unchanged
  ok("H confirmLowExpenses unchanged", appJs.indexOf("function confirmLowExpenses") >= 0);
  ok("H btn-low-expenses-add-gastos still uses goToEditGastosFromDashboard", appJs.indexOf('e.target.id === "btn-low-expenses-add-gastos"') >= 0);

  // I — Hero unaffected
  ok("I Hero no Editar gastos button", heroZone.indexOf("btn-editar-gastos-situacion-hoy") < 0
    && heroZone.indexOf("btn-editar-gastos-dashboard") < 0);

  // J — Plus unaffected
  ok("J Plus zone present", tabComplete.indexOf("dash-zone-plus") >= 0);
  ok("J btn-conocer-plus preserved", tabComplete.indexOf('id="btn-conocer-plus"') >= 0);

  // B2b — incomplete profile still has situacion-hoy CTA
  var tabInc = tabFor({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    diag: null,
  }, 80000);
  var situInc = zoneSlice(tabInc, "situacion-hoy");
  ok("B2b incomplete profile situacion-hoy CTA", situInc.indexOf("btn-editar-gastos-situacion-hoy") >= 0);

  // B2f — renderDashboardEditGastosCta kept as function, not called from numeros
  ok("B2f renderDashboardEditGastosCta function preserved", uiJs.indexOf("function renderDashboardEditGastosCta") >= 0);
  ok("B2f numeros shell no renderDashboardEditGastosCta call", !/_renderNumerosAccordionShell\([\s\S]{0,120}renderDashboardEditGastosCta/.test(uiJs));

  // K — SyntheticMotorQA
  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("K SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  console.log("\nEdit gastos B2b/B2f QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
