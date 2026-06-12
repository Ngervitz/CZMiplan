/**
 * dev/plus-tab-premium-p1f-qa.js — Sprint P1f Plus tab premium visual hierarchy QA
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
    querySelector: function() { return null; },
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
  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

  window.PLUS_MOCK_MODE = true;
  PlusMock._resetSessionForQA();
  var blockedTabs = tabsHtml();

  ok("1 locked shows lock + Mi Plan Plus", blockedTabs.indexOf("🔒") >= 0
    && blockedTabs.indexOf("tab-plus-title\">Mi Plan Plus") >= 0);
  ok("2 locked secondary line", blockedTabs.indexOf("Situación financiera real") >= 0
    && blockedTabs.indexOf("tab-plus-secondary") >= 0);
  ok("3 locked VERIFICADO badge", blockedTabs.indexOf("VERIFICADO") >= 0
    && blockedTabs.indexOf("tab-plus-badge") >= 0);
  ok("4 locked premium classes", blockedTabs.indexOf("tab-btn-plus-locked") >= 0
    && blockedTabs.indexOf("tab-btn-plus-premium") >= 0);

  PlusMock.getSession().accessState = "unlocked";
  var unlockedTabs = tabsHtml();

  ok("5 unlocked star + Mi Plan Plus", unlockedTabs.indexOf("⭐") >= 0
    && unlockedTabs.indexOf("tab-plus-title\">Mi Plan Plus") >= 0);
  ok("6 unlocked secondary line", unlockedTabs.indexOf("Situación financiera real") >= 0);
  ok("7 unlocked ACTIVO badge", unlockedTabs.indexOf("ACTIVO") >= 0);
  ok("8 unlocked premium classes", unlockedTabs.indexOf("tab-btn-plus-unlocked-state") >= 0
    && unlockedTabs.indexOf("tab-btn-plus-premium") >= 0);

  ok("9 plus remains data-tab plus", blockedTabs.indexOf('data-tab="plus"') >= 0
    && unlockedTabs.indexOf('data-tab="plus"') >= 0);
  ok("10 plan/deudas lack premium markup", !/data-tab="plan"[^>]*tab-plus-secondary/.test(blockedTabs)
    && !/data-tab="deudas"[^>]*tab-plus-secondary/.test(blockedTabs));

  window.PLUS_MOCK_MODE = false;
  var prodTabs = tabsHtml();
  ok("11 production tab simple", prodTabs.indexOf("★ Mi Plan Plus") >= 0
    && prodTabs.indexOf("tab-plus-secondary") < 0
    && prodTabs.indexOf("tab-btn-plus-locked") < 0);

  ok("12 cyan gradient locked CSS", /tab-btn-plus-locked[\s\S]*linear-gradient\(135deg,rgba\(64,215,255/.test(css));
  ok("13 cyan gradient unlocked CSS", /tab-btn-plus-unlocked-state[\s\S]*linear-gradient\(135deg,rgba\(64,215,255/.test(css));
  ok("14 desktop 30/30/40 flex", css.indexOf("flex:3 1 0") >= 0 && css.indexOf("flex:4 1 0") >= 0);
  ok("15 mobile badge hidden", css.indexOf(".tab-plus-badge{") >= 0
    && /@media \(max-width:430px\)[\s\S]*\.tab-plus-badge[\s\S]*display:none/.test(css));

  window.PLUS_MOCK_MODE = true;
  PlusMock._resetSessionForQA();
  ok("16 mock toggles still work", renderTabPlus().indexOf("btn-plus-mock-blocked") >= 0);

  console.log("\n--- Regression suites ---");
  var p1e = require("child_process").execSync("node dev/plus-clarity-p1e-qa.js", { cwd: root, encoding: "utf8" });
  ok("17 plus-clarity-p1e-qa PASS", /0 FAIL/.test(p1e));
  var motor = require("child_process").execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("18 SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motor));

  console.log("\nplus-tab-premium-p1f-qa — " + passed + " PASS, " + failed + " FAIL");
  if (failed > 0) process.exit(1);
})();
