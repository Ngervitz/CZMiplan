/**
 * dev/retry-cta-qa.js — retry CTA eligibility + horizon integration QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?ingreso=65000&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A" };
  global.window.CZState = { gastos: {}, deudas: [], snap: null };
  global.trackEvent = function(n, p) { global._lastGTM = { n: n, p: p }; };
  global.trackCRMEvent = function(n, p) { global._lastCRM = { n: n, p: p }; };

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
  global.trackEvent = function(n, p) { global._lastGTM = { n: n, p: p }; };
  global.trackCRMEvent = function(n, p) { global._lastCRM = { n: n, p: p }; };

  function healthyDiag(overrides) {
    var base = {
      planId: 1,
      nivelR: "A",
      fin: { flujoLibre: 50000, ratio: 0.1, dti_ratio: 0.2 },
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
    var o = { deudas: [], _retryCtaLastTrackedState: null };
    if (snapPlan == null) {
      o.snap = null;
    } else {
      o.snap = { plan_id: snapPlan, fecha_inicio: new Date().toISOString() };
    }
    return o;
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var d = healthyDiag({ planId: 1 });
  global.window.CZState = mkSt(null);
  ok("A unlocked no snap", getRetryCtaState(d, mkSt(null)) === "unlocked");
  ok("A button in horizon", renderHorizonteRecalificacion(d).indexOf("btn-retry-application") >= 0);

  var dB = healthyDiag({ planId: 1 });
  ok("B unlocked snap improved", getRetryCtaState(dB, mkSt(4)) === "unlocked");
  ok("B copy improved", _retryCtaUnlockedCopy(dB, mkSt(4)).indexOf("evaluaci") >= 0
    && renderRetryCtaHorizonAddon(dB, mkSt(4)).indexOf("btn-retry-application") >= 0);

  var dC = healthyDiag({ planId: 1 });
  ok("C unlocked same snap", getRetryCtaState(dC, mkSt(1)) === "unlocked");
  ok("C copy current data", _retryCtaUnlockedCopy(dC, mkSt(1)).indexOf("Con los datos actuales") >= 0);

  ok("D locked plan 3", getRetryCtaState(healthyDiag({ planId: 3 }), mkSt(4)) === "locked");

  ok("E locked non-positive horizon", getRetryCtaState(
    healthyDiag({ horizonte: { meses: 8, banda: "medio", label: "Dentro de 6 a 12 meses" } }),
    mkSt(1)
  ) === "locked");

  ok("F hidden no snap plan 3", getRetryCtaState(healthyDiag({ planId: 3 }), mkSt(null)) === "hidden");

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
