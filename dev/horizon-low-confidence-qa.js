/**
 * dev/horizon-low-confidence-qa.js — low-confidence positive horizon QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "" };
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

  function mkDiag(overrides) {
    return Object.assign({
      planId: 1,
      nivelR: "A",
      fin: { flujoLibre: 50000, ratio: 0.1, dti_ratio: 0.2 },
      horizonte: { banda: "inmediato", label: "Ya hay condiciones para considerar una solicitud" },
      bloqueadores: [],
      interpretacion_v2: { confidence_level: "medium", severity_level: "bajo" },
      financial_reality_warning: false,
      missing_payment_information: false,
    }, overrides || {});
  }

  function mkSt() {
    return { snap: { plan_id: 1 }, deudas: [], gastos: {} };
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var st = mkSt();

  var a = mkDiag({ interpretacion_v2: { confidence_level: "low", severity_level: "bajo" } });
  var htmlA = renderHorizonteRecalificacion(a, st);
  ok("A replacement block", htmlA.indexOf("Necesitamos completar tu diagnóstico") >= 0);
  ok("A no optimistic label", htmlA.indexOf("Ya hay condiciones") < 0);
  ok("A no retry button", htmlA.indexOf("btn-retry-application") < 0);
  ok("A Plus link", htmlA.indexOf("btn-conocer-plus-tab") >= 0);

  var b = mkDiag({ interpretacion_v2: { confidence_level: "medium", severity_level: "bajo" } });
  var htmlB = renderHorizonteRecalificacion(b, st);
  ok("B positive block", htmlB.indexOf("Ya hay condiciones") >= 0);
  ok("B retry when eligible", getRetryCtaState(b, st) === "unlocked" && htmlB.indexOf("btn-retry-application") >= 0);

  var c = mkDiag({
    horizonte: { banda: "corto", label: "Podrías recalificar en el corto plazo" },
    interpretacion_v2: { confidence_level: "low", severity_level: "bajo" },
  });
  var htmlC = renderHorizonteRecalificacion(c, st);
  ok("C replacement corto", htmlC.indexOf("Necesitamos completar tu diagnóstico") >= 0);
  ok("C no retry", htmlC.indexOf("btn-retry-application") < 0);
  ok("C Plus link", htmlC.indexOf("btn-conocer-plus-tab") >= 0);

  var d = mkDiag({
    horizonte: { banda: "largo", label: "Horizonte largo" },
    interpretacion_v2: { confidence_level: "low", severity_level: "bajo" },
  });
  var htmlD = renderHorizonteRecalificacion(d, st);
  ok("D largo unchanged", htmlD.indexOf("Necesitamos completar tu diagnóstico") < 0);
  ok("D largo label", htmlD.indexOf("Horizonte largo") >= 0);

  var dCrit = mkDiag({
    planId: 4,
    horizonte: { banda: "inmediato", label: "Ya hay condiciones para considerar una solicitud" },
    interpretacion_v2: { confidence_level: "low", severity_level: "critico" },
  });
  var htmlDCrit = renderHorizonteRecalificacion(dCrit, st);
  ok("D critical override", htmlDCrit.indexOf("No estimable sin estabilización previa") >= 0);
  ok("D critical not replacement", htmlDCrit.indexOf("Necesitamos completar tu diagnóstico") < 0);

  var e = mkDiag({
    horizonte: { banda: "largo", label: "Horizonte largo" },
    interpretacion_v2: { confidence_level: "medium", severity_level: "bajo" },
  });
  var htmlE = renderHorizonteRecalificacion(e, st);
  ok("E medio largo unchanged", htmlE.indexOf("Horizonte largo") >= 0);
  ok("E no replacement", htmlE.indexOf("Necesitamos completar tu diagnóstico") < 0);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
