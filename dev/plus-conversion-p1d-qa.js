/**
 * dev/plus-conversion-p1d-qa.js — Sprint P1d Plus conversion QA (A–Q)
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

  function boot() {
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/plusMock.js");
    load("js/ui.js");
    load("js/app.js");
  }

  boot();

  var plusMockSrc = fs.readFileSync(path.join(root, "js/plusMock.js"), "utf8");
  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
  var p1dBlock = css.split(".plus-mock-outcome-block")[1] || "";

  ok("A mock toggles preserved", plusMockSrc.indexOf("btn-plus-mock-blocked") >= 0
    && plusMockSrc.indexOf("btn-plus-mock-scenario-mejor") >= 0);
  ok("A renderPlusMockTab preserved", typeof window.renderPlusMockTab === "function");
  ok("B review toggles in blocked", (function() {
    window.PLUS_MOCK_MODE = true;
    PlusMock._resetSessionForQA();
    window.CZState = { tab: "plus" };
    return renderTabPlus();
  })().indexOf("btn-plus-mock-unlocked") >= 0);

  ok("C scenarios unchanged", PlusMock.getData().peor.coincidence.pct === 72
    && PlusMock.getData().mejor.diagnosis.verificadoPlan === 2);

  window.PLUS_MOCK_MODE = true;
  PlusMock._resetSessionForQA();
  window.CZState = { tab: "plus" };
  var blocked = renderTabPlus();

  ok("D CTA lock + copy", blocked.indexOf("🔒") >= 0
    && blocked.indexOf("Ver mi situación financiera real") >= 0
    && blocked.indexOf("plus-mock-cta-primary") >= 0);
  ok("E price via CZ_PLUS_PRICE_DISPLAY", window.CZ_PLUS_PRICE_DISPLAY === "UYU 1.290 IVA incluido"
    && blocked.indexOf("UYU 1.290 IVA incluido") >= 0
    && (plusMockSrc.match(/UYU 1\.290/g) || []).length === 1);
  ok("E no Pago único", blocked.indexOf("Pago único") < 0);
  ok("E acceso completo", blocked.indexOf("Acceso completo al informe") >= 0);

  ok("F hero copy", blocked.indexOf("¿Tu situación financiera real coincide con lo que recordás?") >= 0
    && blocked.indexOf("Descubrí diferencias, riesgos y oportunidades") >= 0);

  ok("G outcome benefits", blocked.indexOf("Podrías estar peor de lo que creés") >= 0
    && blocked.indexOf("Podrías estar mejor de lo que creés") >= 0
    && blocked.indexOf("Recibí un plan basado en información verificada") >= 0);

  ok("H comparison positioning", blocked.indexOf("Tu percepción") >= 0
    && blocked.indexOf("Lo que recordás o declaraste") >= 0
    && blocked.indexOf("Tu situación verificada") >= 0
    && blocked.indexOf("plus-mock-positioning-vs") >= 0);

  PlusMock.getSession().accessState = "unlocked";
  PlusMock.getSession().scenario = "peor";
  var unlocked = renderTabPlus();

  ok("I diagnosis transition", unlocked.indexOf("plus-mock-plan-transition") >= 0
    && unlocked.indexOf("plus-mock-diag-shift-card") >= 0
    && unlocked.indexOf("Tu diagnóstico podría cambiar") >= 0);

  ok("J verified card premium", unlocked.indexOf("plus-mock-verified-badge-prominent") >= 0
    && unlocked.indexOf("plus-badge-alta") >= 0);

  ok("K document center included label", unlocked.indexOf("Incluido con Mi Plan Plus") >= 0);

  ok("L no hex in P1d css block", !(/#[0-9a-fA-F]{3,8}/.test(p1dBlock)));
  ok("M no new gradients in P1d block", p1dBlock.indexOf("linear-gradient") < 0);

  window.PLUS_MOCK_MODE = false;
  window.CZState = { tab: "plus", plus_purchased: false };
  ok("N production Plus intact", renderTabPlus().indexOf("Ver mi situación real") >= 0);

  console.log("\n--- Regression suites ---");
  var p1b = require("child_process").execSync("node dev/plus-mock-p1b-qa.js", { cwd: root, encoding: "utf8" });
  ok("O plus-mock-p1b-qa PASS", /0 FAIL/.test(p1b));
  var p1c = require("child_process").execSync("node dev/plus-hierarchy-p1c-qa.js", { cwd: root, encoding: "utf8" });
  ok("P plus-hierarchy-p1c-qa PASS", /0 FAIL/.test(p1c));
  var motor = require("child_process").execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("Q SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motor));

  console.log("\nplus-conversion-p1d-qa — " + passed + " PASS, " + failed + " FAIL");
  if (failed > 0) process.exit(1);
})();
