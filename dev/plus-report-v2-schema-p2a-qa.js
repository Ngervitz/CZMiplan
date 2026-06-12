/**
 * dev/plus-report-v2-schema-p2a-qa.js — Sprint P2a Plus Report V2 schema contract QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "", href: "" };
  global.document = {
    getElementById: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.trackEvent = function() {};
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

  load("js/plusReportV2Schema.js");
  load("js/plusMock.js");

  var schemaSrc = fs.readFileSync(path.join(root, "js/plusReportV2Schema.js"), "utf8");
  var algoSrc = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
  var crmSrc = fs.readFileSync(path.join(root, "js/crm.js"), "utf8");
  var eventsSrc = fs.readFileSync(path.join(root, "js/events.js"), "utf8");

  ok("A schema module loaded", typeof validatePlusReportV2 === "function"
    && typeof PLUS_REPORT_V2_SCHEMA === "object");

  ok("A required top-level keys documented",
    PLUS_REPORT_V2_SCHEMA.structure
    && PLUS_REPORT_V2_SCHEMA.structure.metadata
    && PLUS_REPORT_V2_SCHEMA.structure.seccion_7_trazabilidad_fuentes);

  var sample = buildPlusReportV2FromMockScenario("similar", PLUS_MOCK_DATA);
  var validation = validatePlusReportV2(sample);

  ok("B sample validates for similar scenario", validation.valid === true);
  if (!validation.valid) console.log("  errors: " + validation.errors.join("; "));

  ok("C alignment labels allowed only",
    PLUS_REPORT_V2_ALIGNMENT_LABELS.indexOf(sample.reconciliation_summary.alignment_label) >= 0
    && PLUS_REPORT_V2_ALIGNMENT_LABELS.indexOf("72%") < 0);

  ok("D alignment directions allowed",
    PLUS_REPORT_V2_ALIGNMENT_DIRECTIONS.indexOf(sample.reconciliation_summary.alignment_direction) >= 0);

  ok("E user_plan_verificado plan value when match",
    sample.metadata.user_plan_verificado === "plan_3");

  var peor = buildPlusReportV2FromMockScenario("peor", PLUS_MOCK_DATA);
  ok("E user_plan_verificado plan_4 when differs",
    peor.metadata.user_plan_inicial === "plan_2"
    && peor.metadata.user_plan_verificado === "plan_4");

  ok("F seccion_7 generated_by reconciliation_engine",
    sample.seccion_7_trazabilidad_fuentes.generated_by === "reconciliation_engine");

  ok("G no alignment_score in sample", !containsAlignmentScore(sample));

  var bad = JSON.parse(JSON.stringify(sample));
  bad.reconciliation_summary.alignment_score = 72;
  ok("G validator rejects alignment_score", !validatePlusReportV2(bad).valid);

  ok("H schema source has no alignment_score key",
    !/alignment_score\s*:/.test(schemaSrc));

  ok("I motor unchanged", algoSrc.indexOf("function calcularMotor") >= 0
    && !/plus_report_v2/.test(algoSrc));

  ok("J CRM unchanged", !/plus_report_v2/.test(crmSrc));

  ok("K events unchanged", !/plus_report_v2/.test(eventsSrc));

  window.PLUS_MOCK_MODE = true;
  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");
  load("js/app.js");
  PlusMock._setModeForQA(true);
  PlusMock._resetSessionForQA();
  window.CZState = { tab: "plus", step: 4 };
  var mockHtml = renderTabPlus();
  ok("L existing mock Plus tab still renders", mockHtml.indexOf("plus-mock-review-bar") >= 0
    || mockHtml.indexOf("btn-plus-mock-blocked") >= 0);

  ["peor", "similar", "mejor"].forEach(function(sc) {
    var rep = buildPlusReportV2FromMockScenario(sc, PLUS_MOCK_DATA);
    var v = validatePlusReportV2(rep);
    ok("M validates " + sc + " mock sample", v.valid);
    if (!v.valid) console.log("  " + sc + " errors: " + v.errors.join("; "));
  });

  console.log("\nplus-report-v2-schema-p2a-qa — " + passed + " PASS, " + failed + " FAIL");
  if (failed > 0) process.exit(1);
})();
