/**
 * dev/retry-cta-qa.js — retry CTA render + eligibility QA
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

  function mobileReproDiag(overrides) {
    var base = {
      planId: 1,
      nivelR: "A",
      fin: { flujoLibre: 64778, ratio: 0, dti_ratio: 0.2, totalPago: 0, totalDeuda: 0 },
      horizonte: {
        meses: 1,
        banda: "inmediato",
        label: "Ya hay condiciones para considerar una solicitud",
      },
      bloqueadores: [],
      interpretacion_v2: { confidence_level: "medium", severity_level: "bajo" },
      financial_reality_warning: false,
      missing_payment_information: false,
    };
    return Object.assign(base, overrides || {});
  }

  function mkSt(snapPlan) {
    return {
      snap: { plan_id: snapPlan, fecha_inicio: new Date().toISOString() },
      deudas: [],
      gastos: { vivienda: 12000, alimentacion: 8000 },
      gastos_missing_confirmed: false,
      no_debts_declared: true,
    };
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var diag = mobileReproDiag();
  var st = mkSt(4);
  st.diag = diag;
  global.window.CZState = st;

  ok("A mobile repro unlocked", getRetryCtaState(diag, st) === "unlocked");
  var htmlA = renderHorizonteRecalificacion(diag, st);
  ok("A button renders", htmlA.indexOf("btn-retry-application") >= 0);
  ok("A label branch", htmlA.indexOf("Ya hay condiciones") >= 0);

  ok("B desktop same", htmlA.indexOf("Solicitar préstamo nuevamente") >= 0);

  var locked = mobileReproDiag({ planId: 4, nivelR: "C", interpretacion_v2: { confidence_level: "medium", severity_level: "critico" } });
  ok("C locked no button", renderHorizonteRecalificacion(locked, mkSt(4)).indexOf("btn-retry-application") < 0);

  ok("D no horizon Plus promo (B3c)", htmlA.indexOf("btn-conocer-plus-tab") < 0);

  ok("E click handler exists", fs.readFileSync(path.join(root, "js/app.js"), "utf8").indexOf('e.target.id === "btn-retry-application"') >= 0);

  var dtiDiag = mobileReproDiag({
    fin: { flujoLibre: 64778, ratio: 0.025, dti_ratio: 0.8, totalPago: 2000, totalDeuda: 64000 },
  });
  var dtiSt = mkSt(4);
  dtiSt.diag = dtiDiag;
  global.window.CZState = dtiSt;
  var dtiHtml = renderHorizonteRecalificacion(dtiDiag, dtiSt);
  ok("DTI guard unlocked still gets button", getRetryCtaState(dtiDiag, dtiSt) === "unlocked"
    && dtiHtml.indexOf("btn-retry-application") >= 0);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
