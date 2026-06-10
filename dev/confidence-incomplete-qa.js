/**
 * dev/confidence-incomplete-qa.js — Confidence UI override for missing expenses (A-G)
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
    load("js/crm.js");
  }

  boot();

  // A/B — Income yes, expenses missing
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagIncomplete = calcularMotor();
  window.CZState.diag = diagIncomplete;
  var htmlIncomplete = renderConfianzaDiagnostico(diagIncomplete);

  ok("A shows Información incompleta", htmlIncomplete.indexOf("Información incompleta") >= 0);
  ok("B no Confianza alta", htmlIncomplete.indexOf(">Alta<") < 0 && htmlIncomplete.indexOf("Confianza alta") < 0);
  ok("A/B gastos explanation copy", htmlIncomplete.indexOf("completes tus gastos mensuales") >= 0);
  ok("A/B card title unchanged", htmlIncomplete.indexOf("Confianza del diagnóstico") >= 0);
  ok("A/B motor confianza unchanged internally", diagIncomplete.fin.confianza_diagnostico >= 90);
  ok("A/B motor confidence_level unchanged", diagIncomplete.interpretacion_v2.confidence_level === "low");

  // C — Complete profile unchanged
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: { vivienda: 15000, alimentacion: 8000 },
    gastos_missing_confirmed: false,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagComplete = calcularMotor();
  window.CZState.diag = diagComplete;
  var htmlComplete = renderConfianzaDiagnostico(diagComplete);
  ok("C complete profile shows Alta", htmlComplete.indexOf(">Alta<") >= 0);
  ok("C no incomplete override", htmlComplete.indexOf("Información incompleta") < 0);
  ok("C standard explanation", htmlComplete.indexOf("interpretación consistente") >= 0);

  // D — MiDeuda profile no regression
  PRE.ingreso = 45000;
  PRE.vinoDeRechazo = true;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "22222222",
      pago: "2",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagMideuda = calcularMotor();
  window.CZState.diag = diagMideuda;
  var htmlMideuda = renderConfianzaDiagnostico(diagMideuda);
  var hM = resolveDashboardCtaHierarchy(diagMideuda, window.CZState);
  ok("D MiDeuda P1 unchanged", hM.tier === "P1" && hM.primary === "mideuda");
  ok("D missing gastos still incomplete label", htmlMideuda.indexOf("Información incompleta") >= 0);

  // E — Retry profile no regression
  PRE.ingreso = 80000;
  PRE.vinoDeRechazo = false;
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
  ok("E retry eligible", isRetryEligible(diagRetry, window.CZState));
  var htmlRetry = renderConfianzaDiagnostico(diagRetry);
  ok("E complete gastos shows Alta not incomplete", htmlRetry.indexOf(">Alta<") >= 0
    && htmlRetry.indexOf("Información incompleta") < 0);

  // F — CRM payload unchanged (numeric motor field)
  var crm = buildCRMData(diagRetry);
  ok("F CRM confianza_diagnostico numeric", crm.diagnosis.confianza_diagnostico === diagRetry.fin.confianza_diagnostico);
  ok("F CRM no UI label field added", crm.diagnosis.confianza_label == null);

  // G — SyntheticMotorQA smoke
  ok("G synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  console.log("\nConfidence incomplete QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
