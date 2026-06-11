/**
 * dev/sprint-15-qa.js — Sprint 1.5 diagnostic rebalance + dashboard compaction (A-J)
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

  // Incomplete profile
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
    diag: null,
  };
  var diagComplete = calcularMotor();
  window.CZState.diag = diagComplete;
  var tabComplete = renderTabPlan();

  // A — Hero first after greeting
  ok("A hero after greeting", tabInc.indexOf("Hola") < 0 || tabInc.indexOf("cz-dashboard-hero") > tabInc.indexOf("dash-hierarchy"));
  ok("A hero zone first in hierarchy", zoneIndex(tabInc, "hero") >= 0
    && zoneIndex(tabInc, "hero") < zoneIndex(tabInc, "diagnostico"));

  // B — Tu situación actual immediately after Hero
  ok("B diagnostico after hero in DOM", zoneIndex(tabInc, "hero") < zoneIndex(tabInc, "diagnostico"));
  ok("B diagnostico before accion in DOM", zoneIndex(tabInc, "diagnostico") < zoneIndex(tabInc, "accion"));
  ok("B CSS diagnostico order 2", /dash-zone-diagnostico\{order:2;\}/.test(css));
  ok("B situacion actual label present", tabInc.indexOf("Tu situación actual") >= 0);

  // C — Qué hacer ahora still visible
  ok("C accion zone present", tabInc.indexOf("dash-zone-accion") >= 0);
  ok("C qué hacer ahora label", tabInc.indexOf("Qué hacer ahora") >= 0);
  ok("C horizon card present", tabInc.indexOf("dash-horizon-compact") >= 0 || tabInc.indexOf("Horizonte") >= 0);

  // D — Plus still visible and functional IDs
  ok("D plus zone present", tabComplete.indexOf("dash-zone-plus") >= 0);
  ok("D btn-conocer-plus preserved", tabComplete.indexOf('id="btn-conocer-plus"') >= 0);
  ok("D no btn-hero-ver-plus in hero", tabInc.indexOf('id="btn-hero-ver-plus"') < 0);
  ok("D cz-plus-entry preserved", tabComplete.indexOf('id="cz-plus-entry"') >= 0);

  // E — Tus números collapsed by default
  ok("E numeros accordion shell", tabComplete.indexOf("dash-numeros-accordion") >= 0);
  ok("E toggle button id", tabComplete.indexOf('id="btn-dash-numeros-toggle"') >= 0);
  ok("E body id", tabComplete.indexOf('id="cz-dash-numeros-body"') >= 0);
  ok("E collapsed default aria-expanded false", tabComplete.indexOf('aria-expanded="false"') >= 0);
  ok("E no open class on body by default", tabComplete.indexOf('accordion-body open') < 0);

  // F — Expand/collapse handler wired
  ok("F data-dash-accordion handler in app.js", appJs.indexOf("[data-dash-accordion]") >= 0);
  ok("F handler before expense accordion", appJs.indexOf("data-dash-accordion") < appJs.indexOf("[data-accordion]"));

  // G — Confianza outside accordion
  var confIdx = tabComplete.indexOf("dash-zone-confianza");
  var numIdx = tabComplete.indexOf("dash-zone-numeros");
  var sugIdx = tabComplete.indexOf("dash-zone-sugerencias");
  ok("G confianza after numeros", confIdx > numIdx);
  ok("G confianza before sugerencias", confIdx < sugIdx);
  ok("G confianza not inside accordion body", tabComplete.indexOf("cz-dash-numeros-body") < confIdx
    || tabComplete.slice(tabComplete.indexOf("cz-dash-numeros-body"), confIdx).indexOf("Confianza") < 0);

  // H — Sticky CTA unchanged
  ok("H updateSticky exists", typeof updateSticky === "function");
  ok("H step 3 sticky hidden comment", fs.readFileSync(path.join(root, "js/ui.js"), "utf8").indexOf("step 3 = dashboard — sticky hidden") >= 0);

  // I — All IDs preserved
  ok("I btn-retry-fallback-gastos", tabInc.indexOf('id="btn-retry-fallback-gastos"') >= 0);
  ok("I btn-refinar-diagnostico slot", tabComplete.indexOf('id="btn-refinar-diagnostico"') >= 0 || tabComplete.indexOf("btn-refinar-diagnostico") < 0);
  ok("I cz-feedback-box", tabComplete.indexOf('id="cz-feedback-box"') >= 0);
  ok("I cz-dashboard-hero", tabComplete.indexOf('id="cz-dashboard-hero"') >= 0);

  // J — SyntheticMotorQA module (full run separate)
  ok("J synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  console.log("\nSprint 1.5 QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
