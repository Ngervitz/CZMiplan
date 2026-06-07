/**
 * dev/fresh-url-qa.js — fresh URL diagnosis init QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  function hasSurveyParams(PRE) {
    return PRE && PRE.respuestas && ["p1","p2","p3","p4","p5","p6","p7","p8","p9","p10"].every(function(k) {
      var v = PRE.respuestas[k];
      return v !== null && v !== undefined && v !== "";
    });
  }

  function freshPathMotor(PRE) {
    global.window = global;
    global.window.CZState = { deudas: [], gastos: {}, snap: null };
    global.window.location = { search: PRE._search };
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    return calcularMotor();
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var fullSearch = "?nombre=Normal&ingreso=45000&p1=B&p2=B&p3=B&p4=B&p5=B&p6=A&p7=B&p8=B&p9=B&p10=B";
  global.window = global;
  global.window.location = { search: fullSearch };
  load("js/config.js");
  ok("A hasSurveyParams true", hasSurveyParams(PRE));
  var mA = freshPathMotor({ _search: fullSearch });
  ok("A planId 5", mA.planId === 5);
  ok("A scoreReset 26", mA.scoreReset === 26);

  var noSurveySearch = "?nombre=Normal&ingreso=45000";
  global.window.location = { search: noSurveySearch };
  load("js/config.js");
  ok("B no survey params", !hasSurveyParams(PRE));

  var partialSearch = "?ingreso=45000&p1=B&p2=B&p3=B";
  global.window.location = { search: partialSearch };
  load("js/config.js");
  ok("E partial survey false", !hasSurveyParams(PRE));

  var stored = { diag: { planId: 1, scoreReset: 25 }, deudas: [{ monto: "99999" }], gastos: { vivienda: "20000" } };
  ok("D ignores stored when fresh", hasSurveyParams({ respuestas: {
    p1:"B",p2:"B",p3:"B",p4:"B",p5:"B",p6:"A",p7:"B",p8:"B",p9:"B",p10:"B"
  } }) && stored.diag.planId === 1);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
