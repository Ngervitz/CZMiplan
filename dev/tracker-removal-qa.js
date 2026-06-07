/**
 * dev/tracker-removal-qa.js — tracker/habit UI removal QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?ingreso=80000&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A" };
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.sessionStorage = { getItem: function() { return "1"; }, setItem: function() {} };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/ui.js");

  function mkDiag(planId) {
    var d = calcularMotor();
    d.planId = planId;
    d.plan = PLANES[planId];
    return d;
  }

  function mkSt(diag) {
    return {
      diag: diag,
      deudas: [{ tipo: "tarjeta", acreedor: "Test Bank", monto: "50000", pago: "5000" }],
      gastos: {},
      herr: { semaforo: {}, habitos: {}, atrasos: {}, compromisos: {} },
      gastos_missing_confirmed: true,
      snap: { plan_id: diag.planId },
    };
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var TRACKER = [
    "Semaforo de tu situacion",
    "Tu tracker de constancia",
    "Tu progreso a 90 dias",
    "data-toggle-habito",
    "data-sem-id",
    "dias de constancia",
    "Meta: 90 dias",
    "Primera revision",
    "Mitad del camino",
  ];

  function assertNoTrackers(html, label) {
    TRACKER.forEach(function(t) {
      ok(label + " no " + t, html.indexOf(t) < 0);
    });
  }

  var d4 = mkDiag(4);
  var st4 = mkSt(d4);
  global.window.CZState = st4;
  var html4 = renderHerramientasPlan4();
  assertNoTrackers(html4, "plan4");
  ok("E acciones plan4", html4.indexOf("Acciones recomendadas") >= 0);
  ok("F ingreso complementario plan4", html4.indexOf("Ingresos complementarios") >= 0);

  var d5 = mkDiag(5);
  var st5 = mkSt(d5);
  global.window.CZState = st5;
  var html5 = renderHerramientasPlan5();
  assertNoTrackers(html5, "plan5");
  ok("E atrasos plan5 preserved", html5.indexOf("Estado de tus atrasos reportados") >= 0);

  var d1 = mkDiag(1);
  var st1 = mkSt(d1);
  global.window.CZState = st1;
  var tab1 = renderTabPlan();
  assertNoTrackers(tab1, "tab plan1");
  ok("F add debt tab", tab1.indexOf("btn-add-debt") >= 0 || tab1.indexOf("Agregar deuda") >= 0);
  ok("G Plus CTA tab", tab1.indexOf("btn-conocer-plus") >= 0);

  var d1b = mobileReproDiag();
  function mobileReproDiag() {
    return {
      planId: 1, nivelR: "A", plan: PLANES[1],
      fin: { flujoLibre: 64778, ratio: 0, dti_ratio: 0.2, totalPago: 0, totalDeuda: 0 },
      horizonte: { banda: "inmediato", label: "Ya hay condiciones para considerar una solicitud" },
      bloqueadores: [], interpretacion_v2: { confidence_level: "medium", severity_level: "bajo" },
      financial_reality_warning: false, missing_payment_information: false,
      scoreReset: 25, enc: { score: 20 }, prio: null,
    };
  }
  var stRetry = { snap: { plan_id: 1 }, deudas: [], gastos: {}, gastos_missing_confirmed: true };
  stRetry.diag = d1b;
  global.window.CZState = stRetry;
  var tabRetry = renderTabPlan();
  ok("H retry CTA", getRetryCtaState(d1b, stRetry) === "unlocked" && tabRetry.indexOf("btn-retry-application") >= 0);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
