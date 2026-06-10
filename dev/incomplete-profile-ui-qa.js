/**
 * dev/incomplete-profile-ui-qa.js — Incomplete profile UI consistency (A-H)
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

  function boot() {
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/ui.js");
  }

  function runIncomplete(overrides) {
    PRE.ingreso = overrides.ingreso != null ? overrides.ingreso : 80000;
    window.CZState = Object.assign({
      gastos: {},
      gastos_missing_confirmed: true,
      no_debts_declared: true,
      deudas: [],
      snap: { plan_id: 1 },
      diag: null,
    }, overrides);
    var d = calcularMotor();
    window.CZState.diag = d;
    return { diag: d, st: window.CZState, tab: renderTabPlan() };
  }

  boot();

  // A — No numeric flujo in metrics
  var incA = runIncomplete({});
  var flujoNum = typeof fmt === "function" ? fmt(incA.diag.fin.flujoLibre) : String(incA.diag.fin.flujoLibre);
  ok("A pending flujo label", incA.tab.indexOf("Pendiente de calcular") >= 0);
  ok("A PLATA LIBRE REAL title", incA.tab.indexOf("PLATA LIBRE REAL") >= 0);
  ok("A no numeric flujo in tab metrics", incA.tab.indexOf("Plata que te sobra/mes") < 0);
  ok("A helper copy", incA.tab.indexOf("Completá tus gastos para ver este número") >= 0);

  // B — Composición financial label
  ok("B Pendiente de completar", incA.tab.indexOf("Pendiente de completar") >= 0);
  ok("B no Estable label", incA.tab.indexOf(">Estable<") < 0 && incA.tab.indexOf("🟢 Estable") < 0);

  // C — Subtitle
  ok("C faltan datos subtitle", incA.tab.indexOf("faltan datos para estimarla") >= 0);
  ok("C no gastos y deudas subtitle", incA.tab.indexOf(">gastos y deudas<") < 0);

  // D — Plan badge
  ok("D Diagnóstico pendiente badge", incA.tab.indexOf("Diagnóstico pendiente") >= 0);
  ok("D no En buen camino", incA.tab.indexOf("En buen camino") < 0);

  // E — No flujo-dependent recommended actions
  var accHtml = renderAccionesRecomendadasHtml(incA.diag);
  ok("E no flujo libre action text", accHtml.toLowerCase().indexOf("flujo libre") < 0);
  ok("E no flujo_libre placeholder", accHtml.indexOf("[flujo_libre]") < 0);

  // F — BCU / Plus actions remain when applicable
  ok("F BCU action available", accHtml.indexOf("BCU") >= 0 || accHtml.indexOf("Clearing") >= 0
    || accHtml.indexOf("Mi Plan Plus") >= 0);

  // G — Complete profile unchanged
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
  var diagG = calcularMotor();
  window.CZState.diag = diagG;
  var tabG = renderTabPlan();
  ok("G complete not incomplete helper", isIncompleteFinancialProfile(diagG, window.CZState) === false);
  ok("G shows Plata que te sobra", tabG.indexOf("Plata que te sobra/mes") >= 0);
  ok("G no pending flujo primary", tabG.indexOf("PLATA LIBRE REAL") < 0);
  ok("G plan status not pending", tabG.indexOf("Diagnóstico pendiente") < 0);

  // H — SyntheticMotorQA smoke
  ok("H synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  console.log("\nIncomplete profile UI QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
