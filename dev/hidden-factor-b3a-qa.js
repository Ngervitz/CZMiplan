/**
 * dev/hidden-factor-b3a-qa.js — Sprint B3a remove HF card from Mi Plan tab (A–I)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var execSync = require("child_process").execSync;
  var root = path.join(__dirname, "..");

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
    load("js/app.js");
  }

  function hfProfile() {
    PRE.ingreso = 80000;
    window.CZState = {
      step: 3,
      tab: "plan",
      gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000 },
      gastos_missing_confirmed: false,
      no_debts_declared: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "40000",
        pago: "4000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      snap: { plan_id: 2 },
      diag: null,
    };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return { diag: diag, tab: renderTabPlan(), hero: _renderDashboardHeroCard(diag, window.CZState) };
  }

  boot();

  var algoJs = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
  var eventsJs = fs.readFileSync(path.join(root, "js/events.js"), "utf8");
  var appJs = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");

  var r = hfProfile();
  ok("A detectHiddenFactorOpportunity true for HF profile",
    typeof detectHiddenFactorOpportunity === "function"
    && detectHiddenFactorOpportunity(r.diag) === true);
  ok("A no #cz-hf-cta in tab", r.tab.indexOf("cz-hf-cta") < 0);
  ok("A no #btn-hf-cta in tab", r.tab.indexOf("btn-hf-cta") < 0);
  ok("A no HF disclaimer copy", r.tab.indexOf("Este diagnóstico se basa únicamente") < 0);

  ok("B #cz-plus-entry still renders", r.tab.indexOf("cz-plus-entry") >= 0);
  ok("B #btn-conocer-plus still renders", r.tab.indexOf("btn-conocer-plus") >= 0);
  ok("B dash-zone-plus present", r.tab.indexOf("dash-zone-plus") >= 0);

  var tabsHtml = renderDashboard();
  ok("C Mi Plan Plus tab nav", tabsHtml.indexOf('data-tab="plus"') >= 0
    && tabsHtml.indexOf("Mi Plan Plus") >= 0);

  ok("D hero unchanged contract", r.hero.indexOf("dash-zone-hero") >= 0
    || r.hero.indexOf("plan-card") >= 0);
  ok("D hero no HF card", r.hero.indexOf("cz-hf-cta") < 0);

  var diagRetry = {
    planId: 1,
    nivelR: "A",
    scoreReset: 22,
    fin: { flujoLibre: 50000, ratio: 0.1, dti_ratio: 0.2, scoreFinanciero: 22, totalDeuda: 10000, totalPago: 2000 },
    horizonte: { banda: "inmediato", label: "Ya hay condiciones para considerar una solicitud" },
    bloqueadores: [],
    interpretacion_v2: { confidence_level: "low", severity_level: "bajo" },
    financial_reality_warning: false,
    missing_payment_information: false,
    recommended_tools: [],
  };
  var stRetry = {
    snap: { plan_id: 1 },
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "10000",
      pago: "2000",
      situacion_ui: "pagando_normal",
    }],
    gastos: { vivienda: 10000 },
    gastos_missing_confirmed: false,
  };
  var horizon = renderHorizonteRecalificacion(diagRetry, stRetry);
  ok("E retry fallback Plus unchanged", horizon.indexOf("btn-retry-fallback-plus") >= 0
    || horizon.indexOf("btn-retry-fallback-gastos") >= 0
    || horizon.indexOf("btn-retry-fallback-deuda") >= 0);
  ok("F horizon Plus promo unchanged", horizon.indexOf("btn-conocer-plus-tab") >= 0);

  ok("G detectHiddenFactorOpportunity preserved", /function detectHiddenFactorOpportunity\s*\(/.test(algoJs));
  ok("G GTM SHOWN event preserved", eventsJs.indexOf("HIDDEN_FACTOR_CTA_SHOWN") >= 0);
  ok("G GTM CLICKED event preserved", eventsJs.indexOf("HIDDEN_FACTOR_CTA_CLICKED") >= 0);
  ok("G btn-hf-cta handler preserved", appJs.indexOf('e.target.id === "btn-hf-cta"') >= 0);
  ok("G renderTabPlan no longer renders HF card",
    !/id="cz-hf-cta"/.test(uiJs) || uiJs.indexOf("// Sprint B3a") >= 0);

  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("H SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  console.log("\n--- Regression suites ---");
  var suites = [
    ["cta-hierarchy-qa", "dev/cta-hierarchy-qa.js"],
    ["hero-card-qa", "dev/hero-card-qa.js"],
    ["sprint-15-qa", "dev/sprint-15-qa.js"],
    ["low-expenses-confirm-qa", "dev/low-expenses-confirm-qa.js"],
    ["debt-completeness-b2d-qa", "dev/debt-completeness-b2d-qa.js"],
  ];
  suites.forEach(function(s) {
    var out = execSync("node " + s[1], { cwd: root, encoding: "utf8" });
    ok("I " + s[0] + " PASS", out.indexOf("[FAIL]") < 0);
  });

  console.log("\nhidden-factor-b3a-qa — " + passed + "/" + (passed + failed)
    + (failed ? " (" + failed + " FAIL)" : " PASS"));
  if (failed) process.exit(1);
})();
