/**
 * dev/acciones-recom-qa.js — recommended actions section QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.sessionStorage = { getItem: function() { return "1"; }, setItem: function() {} };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  var CAMPAIGN = "?nombre=Normal&ingreso=45000&p1=B&p2=B&p3=B&p4=B&p5=B&p6=A&p7=B&p8=B&p9=B&p10=B";
  global.window.location = { search: CAMPAIGN };
  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/ui.js");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var diag5 = calcularMotor();
  global.window.CZState = {
    diag: diag5,
    deudas: [],
    gastos: {},
    herr: { compromisos: {}, atrasos: {} },
    gastos_missing_confirmed: true,
    snap: { plan_id: diag5.planId },
  };

  var section = renderHerramientas();
  var plan5 = renderHerramientasPlan5();
  var plan4diag = Object.assign({}, diag5, { planId: 4, plan: PLANES[4] });
  global.window.CZState.diag = plan4diag;
  var plan4 = renderHerramientasPlan4();

  ok("A section title", section.indexOf("Acciones recomendadas") >= 0);
  ok("A no old title", section.indexOf("Herramientas recomendadas") < 0);
  ok("B no X/Y counter", section.indexOf("completadas") < 0 && section.indexOf("/") < 0 || section.indexOf("1/") < 0);
  ok("B no progress bar", section.indexOf("progress-wrap") < 0);

  global.window.CZState.diag = diag5;
  ok("C plan5 at least 3 actions", (seleccionarAccionesRecomendadas(diag5).length >= 3));
  ok("C plan5 renders actions", plan5.indexOf("accion-recomendada-item") >= 0);
  ok("C plan5 min 3 items", (plan5.match(/accion-recomendada-item/g) || []).length >= 3);

  ok("D plan4 acciones", plan4.indexOf("Acciones recomendadas") >= 0);
  ok("D plan4 ingreso complementario", plan4.indexOf("Ingresos complementarios") >= 0);
  ok("D plan4 liberar slider", plan4.indexOf("data-liberar-monto") >= 0);

  var TRACKER = ["Semaforo de tu situacion", "tracker de constancia", "progreso a 90 dias", "data-toggle-habito", "data-sem-id"];
  TRACKER.forEach(function(t) {
    ok("E no " + t, section.indexOf(t) < 0 && plan5.indexOf(t) < 0);
  });

  ok("F edit gastos fn exists", typeof renderDashboardEditGastosCta === "function");
  ok("F add debt fn exists", fs.readFileSync(path.join(root, "js/ui.js"), "utf8").indexOf("btn-add-debt") >= 0);

  var retryDiag = {
    planId: 1, nivelR: "A", plan: PLANES[1],
    fin: { flujoLibre: 64778, ratio: 0, dti_ratio: 0.2 },
    horizonte: { banda: "inmediato", label: "Ya hay condiciones" },
    interpretacion_v2: { confidence_level: "medium", severity_level: "bajo" },
    bloqueadores: [], financial_reality_warning: false, missing_payment_information: false,
    scoreReset: 25,
  };
  ok("G retry unchanged", getRetryCtaState(retryDiag, { snap: { plan_id: 1 }, deudas: [], gastos: {} }) === "unlocked");

  ok("H plus CTA in tab fn", fs.readFileSync(path.join(root, "js/ui.js"), "utf8").indexOf("btn-conocer-plus") >= 0);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
