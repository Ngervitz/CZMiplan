/**
 * dev/contextual-action-b7b-qa.js — Sprint B7b contextual action layer QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;

  function ok(qaId, field, expected, actual) {
    var cond = expected === actual;
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + qaId + " " + field);
    if (!cond) {
      console.log("  profile: " + qaId);
      console.log("  field: " + field);
      console.log("  expected: " + JSON.stringify(expected));
      console.log("  actual: " + JSON.stringify(actual));
      failed++;
    } else {
      passed++;
    }
  }

  function okTruthy(qaId, field, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + qaId + " " + field);
    if (!cond) {
      console.log("  profile: " + qaId);
      console.log("  field: " + field);
      console.log("  expected: true");
      console.log("  actual: false");
      failed++;
    } else {
      passed++;
    }
  }

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  function boot() {
    global.window = global;
    global.window.location = {
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      href: "",
    };
    global.document = {
      getElementById: function() { return null; },
      querySelectorAll: function() { return []; },
      addEventListener: function() {},
    };
    global.trackEvent = function() {};
    global.trackCRMEvent = function() {};
    global.enviarCRM = function() {};
    global.localStorage = { getItem: function() { return null; }, setItem: function() {} };
    global.sessionStorage = { getItem: function() { return null; }, setItem: function() {} };
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
  }

  function activeDebt() {
    return { tipo: "tarjeta", monto: "10000", pago: "500", situacion_ui: "pagando_normal", debt_confidence: "high" };
  }

  function runCase(qaId, laboral, ingreso, deudas) {
    boot();
    PRE.laboral = laboral;
    PRE.ingreso = ingreso;
    window.CZState = { deudas: deudas || [], diag: null };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return resolveContextualActionSegment(diag, window.CZState);
  }

  function assertSegment(qaId, laboral, ingreso, deudas, expectedId, expectedInconsistency) {
    var seg = runCase(qaId, laboral, ingreso, deudas);
    ok(qaId, "segmentId", expectedId, seg.segmentId);
    ok(qaId, "isInconsistency", expectedInconsistency, seg.isInconsistency);
    ok(qaId, "actions.length", 5, (seg.actions || []).length);
    return seg;
  }

  boot();

  // QA-S0
  var s0 = runCase("QA-S0", "", 35000, [activeDebt()]);
  ok("QA-S0", "segmentId", "S0", s0.segmentId);
  ok("QA-S0", "render empty", "", renderContextualActionBlock(s0));

  // QA-S1 through S11
  var s1 = assertSegment("QA-S1", "relacion_dependencia", 35000, [activeDebt()], "S1", false);
  okTruthy("QA-S1", "actions[4] includes ANDA", s1.actions[4].indexOf("ANDA") >= 0);
  okTruthy("QA-S1", "actions[4] includes COFAC", s1.actions[4].indexOf("COFAC") >= 0);

  assertSegment("QA-S2", "relacion_dependencia", 35000, [], "S2", false);
  assertSegment("QA-S3", "monotributista", 60000, [activeDebt()], "S3", false);
  assertSegment("QA-S4", "monotributista", 60000, [], "S4", false);
  assertSegment("QA-S5", "jubilado", 25000, [activeDebt()], "S5", false);
  assertSegment("QA-S6", "jubilado", 25000, [], "S6", false);

  var s7 = assertSegment("QA-S7", "desempleado", 0, [activeDebt()], "S7", false);
  okTruthy("QA-S7", "actions[1] includes BuscoJobs", s7.actions[1].indexOf("BuscoJobs") >= 0);

  var s8 = assertSegment("QA-S8", "desempleado", 0, [], "S8", false);
  okTruthy("QA-S8", "actions[2] includes BuscoJobs", s8.actions[2].indexOf("BuscoJobs") >= 0);

  assertSegment("QA-S9", "relacion_dependencia", 0, [activeDebt()], "S9", true);
  assertSegment("QA-S10", "monotributista", 0, [], "S10", true);

  var s11 = assertSegment("QA-S11", "jubilado", 0, [], "S11", true);
  okTruthy("QA-S11", "actions include BPS", s11.actions.some(function(a) { return a.indexOf("BPS") >= 0; }));

  // Render assertions
  ok("QA-RENDER", "null segment render empty", "", renderContextualActionBlock(null));
  ok("QA-RENDER", "unknown segment render empty", "", renderContextualActionBlock({ segmentId: "S99", title: "x", actions: [] }));

  var sectionTitle = "💡 Recomendaciones para tu situación laboral";
  ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11"].forEach(function(id) {
    var seg = _B7_SEGMENTS[id];
    var html = renderContextualActionBlock(seg);
    okTruthy("QA-RENDER-" + id, "includes cz-contextual-action-block", html.indexOf("cz-contextual-action-block") >= 0);
    okTruthy("QA-RENDER-" + id, "includes section title", html.indexOf(sectionTitle) >= 0);
    ok("QA-RENDER-" + id, "list items count", seg.actions.length, (html.match(/<li>/g) || []).length);
    var expectedInc = seg.isInconsistency ? "true" : "false";
    okTruthy("QA-RENDER-" + id, "data-b7-inconsistency", html.indexOf('data-b7-inconsistency="' + expectedInc + '"') >= 0);
  });

  var total = passed + failed;
  console.log("\ncontextual-action-b7b-qa — " + passed + "/" + total
    + (failed ? " (" + failed + " FAIL)" : " PASS"));
  if (failed) process.exit(1);
})();
