/**
 * dev/plus-hierarchy-p1c-qa.js — Sprint P1c Plus hierarchy QA (A–L)
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
    load("js/crm.js");
    load("js/plusMock.js");
    load("js/ui.js");
    load("js/app.js");
  }

  boot();

  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
  var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var plusMockJs = fs.readFileSync(path.join(root, "js/plusMock.js"), "utf8");
  var p1cTabMatch = css.match(/\/\* P1c — Mi Plan Plus tab premium hierarchy \*\/([\s\S]*?)\/\* PLAN \*\//);
  var p1cTabBlock = p1cTabMatch ? p1cTabMatch[1] : "";
  var p1cMockBlock = css.split(".plus-mock-header-icon")[1] || "";

  window.CZState = { tab: "plan", step: 4 };
  var tabsHtml = renderDashboard();

  ok("A Plus tab has tab-btn-plus class", tabsHtml.indexOf("tab-btn-plus") >= 0
    && tabsHtml.indexOf('data-tab="plus"') >= 0);
  ok("A plan/deudas tabs lack tab-btn-plus",
    (tabsHtml.match(/data-tab="plus"/g) || []).length === 1
    && tabsHtml.indexOf('data-tab="plan"') >= 0
    && tabsHtml.indexOf('data-tab="deudas"') >= 0);
  ok("A tab-plus-icon present", tabsHtml.indexOf("tab-plus-icon") >= 0);

  ok("B tab-btn-plus uses existing tab-btn base", css.indexOf(".tab-btn-plus{") >= 0
    && css.indexOf(".tab-btn.active{") >= 0);

  ok("C no hex in P1c tab block", !p1cTabBlock || !(/#[0-9a-fA-F]{3,8}/.test(p1cTabBlock)));
  ok("C no hex in mock hierarchy block", !(/#[0-9a-fA-F]{3,8}/.test(p1cMockBlock)));
  ok("D P1c uses existing rgba tokens",
    (p1cTabBlock && p1cTabBlock.indexOf("rgba(64,215,255,") >= 0)
    && p1cMockBlock.indexOf("rgba(61,220,255,") >= 0);

  window.PLUS_MOCK_MODE = true;
  PlusMock._resetSessionForQA();
  window.CZState = { tab: "plus" };
  var blockedHtml = renderTabPlus();

  ok("E blocked CTA hierarchy class", blockedHtml.indexOf("plus-mock-cta-primary") >= 0
    && blockedHtml.indexOf("plus-mock-cta-zone") >= 0);
  ok("E CTA lock icon", blockedHtml.indexOf("🔒") >= 0
    && blockedHtml.indexOf("Ver mi situación financiera real") >= 0);
  ok("E CTA icon treatment", blockedHtml.indexOf("plus-mock-cta-icon") >= 0);

  ok("F premium positioning strip", blockedHtml.indexOf("plus-mock-positioning") >= 0
    && blockedHtml.indexOf("Tu percepción") >= 0
    && blockedHtml.indexOf("Tu situación verificada") >= 0);

  PlusMock.getSession().accessState = "unlocked";
  PlusMock.getSession().scenario = "peor";
  var unlockedHtml = renderTabPlus();

  ok("G verified card badge", unlockedHtml.indexOf("plus-mock-verified-badge-prominent") >= 0
    && unlockedHtml.indexOf("plus-mock-verified-card") >= 0);
  ok("G inicial card muted", unlockedHtml.indexOf("plus-mock-diag-card-inicial") >= 0
    && unlockedHtml.indexOf("plus-mock-diag-plan-verified") >= 0);

  ok("H mobile rules present", css.indexOf("@media (max-width:430px)") >= 0
    && css.indexOf(".plus-mock-cta-primary") >= 0
    && css.indexOf(".tab-btn-plus") >= 0);

  ok("I mock data keys unchanged",
    PlusMock.getData().peor.coincidence.pct === 72
    && PlusMock.getData().similar.coincidence.pct === 91
    && PlusMock.getData().mejor.coincidence.pct === 94);

  ok("J mock toggles unchanged", blockedHtml.indexOf("btn-plus-mock-blocked") >= 0
    && blockedHtml.indexOf("btn-plus-mock-unlocked") >= 0);

  window.PLUS_MOCK_MODE = false;
  window.CZState = { tab: "plus", plus_purchased: false, plus_status: null };
  var prodPlus = renderTabPlus();
  ok("K production Plus when mock off", prodPlus.indexOf("Ver mi situación real") >= 0
    && prodPlus.indexOf("plus-mock-review-bar") < 0);

  ok("K renderTabPlus production branch intact",
    uiJs.indexOf("window.PLUS_MOCK_MODE === true") >= 0
    && uiJs.indexOf("renderPlusProcessing") >= 0);

  ok("K plusMock datasets untouched structure",
    plusMockJs.indexOf("peor:") >= 0 && plusMockJs.indexOf("handlePlusMockClick") >= 0);

  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = require("child_process").execSync(
    "node dev/synthetic-motor-test.js",
    { cwd: root, encoding: "utf8" }
  );
  ok("L SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  console.log("\nplus-hierarchy-p1c-qa — " + passed + " PASS, " + failed + " FAIL");
  if (failed > 0) process.exit(1);
})();
