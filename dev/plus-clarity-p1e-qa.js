/**
 * dev/plus-clarity-p1e-qa.js — Sprint P1e Plus tab lock + payment microcopy QA (A–N)
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
    querySelector: function(sel) { return sel === ".tabs" ? null : null; },
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

  function tabsHtml() {
    window.CZState = { step: 3, tab: "plus" };
    return renderDashboard();
  }

  boot();

  window.PLUS_MOCK_MODE = true;
  PlusMock._resetSessionForQA();
  var blockedTabs = tabsHtml();

  ok("A blocked tab shows lock", blockedTabs.indexOf("tab-btn-plus-locked") >= 0
    && blockedTabs.indexOf("🔒") >= 0
    && blockedTabs.indexOf("Mi Plan Plus") >= 0
    && blockedTabs.indexOf("Mi Plan Plus Activo") < 0);

  PlusMock.getSession().accessState = "unlocked";
  var unlockedTabs = tabsHtml();

  ok("B unlocked tab premium state", unlockedTabs.indexOf("tab-btn-plus-unlocked-state") >= 0
    && unlockedTabs.indexOf("Mi Plan Plus Activo") >= 0
    && unlockedTabs.indexOf("🔒") < 0);

  window.PLUS_MOCK_MODE = false;
  var prodTabs = tabsHtml();

  ok("C Mi Plan tab unchanged", prodTabs.indexOf("📋 Mi Plan") >= 0
    && prodTabs.indexOf("tab-btn-plus-locked") < 0);
  ok("D Tus deudas tab unchanged", prodTabs.indexOf("💳 Tus deudas") >= 0);

  window.PLUS_MOCK_MODE = true;
  PlusMock._resetSessionForQA();
  window.CZState = { tab: "plus" };
  var blocked = renderTabPlus();

  ok("E pricing uses CZ_PLUS_PRICE_DISPLAY", blocked.indexOf(window.CZ_PLUS_PRICE_DISPLAY) >= 0);
  ok("F Pago único visible", blocked.indexOf("Pago único") >= 0
    && blocked.indexOf("plus-mock-price-once") >= 0);
  ok("G Acceso completo al informe", blocked.indexOf("Acceso completo al informe") >= 0);
  ok("H main CTA unchanged", blocked.indexOf("🔒") >= 0
    && blocked.indexOf("Ver mi situación financiera real") >= 0);

  ok("I mock toggles preserved", blocked.indexOf("btn-plus-mock-blocked") >= 0
    && blocked.indexOf("btn-plus-mock-unlocked") >= 0);
  PlusMock.getSession().accessState = "unlocked";
  ok("I scenario toggles when unlocked", renderTabPlus().indexOf("btn-plus-mock-scenario-mejor") >= 0);
  ok("J scenarios unchanged", PlusMock.getData().peor.coincidence.pct === 72
    && PlusMock.getData().mejor.diagnosis.inicialPlan === 4);

  console.log("\n--- Regression suites ---");
  var p1b = require("child_process").execSync("node dev/plus-mock-p1b-qa.js", { cwd: root, encoding: "utf8" });
  ok("K plus-mock-p1b-qa PASS", /0 FAIL/.test(p1b));
  var p1c = require("child_process").execSync("node dev/plus-hierarchy-p1c-qa.js", { cwd: root, encoding: "utf8" });
  ok("L plus-hierarchy-p1c-qa PASS", /0 FAIL/.test(p1c));
  var p1d = require("child_process").execSync("node dev/plus-conversion-p1d-qa.js", { cwd: root, encoding: "utf8" });
  ok("M plus-conversion-p1d-qa PASS", /0 FAIL/.test(p1d));
  var motor = require("child_process").execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("N SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motor));

  console.log("\nplus-clarity-p1e-qa — " + passed + " PASS, " + failed + " FAIL");
  if (failed > 0) process.exit(1);
})();
