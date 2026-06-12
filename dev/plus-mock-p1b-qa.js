/**
 * dev/plus-mock-p1b-qa.js — Sprint P1b Mi Plan Plus V2 visual mock QA (A–R)
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
  var _stored = null;
  global.localStorage = {
    getItem: function(k) { return _stored && _stored.key === k ? _stored.val : null; },
    setItem: function(k, v) { _stored = { key: k, val: v }; },
    removeItem: function() { _stored = null; },
  };

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

  function plusHtml(st, mockOn) {
    window.CZState = st || { tab: "plus", step: 4, diag: { plan: 3 } };
    if (mockOn) {
      PlusMock._setModeForQA(true);
      PlusMock._resetSessionForQA();
    } else {
      PlusMock._setModeForQA(false);
    }
    return renderTabPlus();
  }

  function scenarioHtml(scenario) {
    PlusMock._setModeForQA(true);
    PlusMock.getSession().accessState = "unlocked";
    PlusMock.getSession().scenario = scenario;
    window.CZState = { tab: "plus", step: 4, plus_status: null, plus_purchased: false };
    return renderTabPlus();
  }

  boot();

  // Default: mock on for review build (toggle off for production path test)
  ok("O mock globals exposed", typeof window.PLUS_MOCK_MODE !== "undefined"
    && typeof window.PLUS_MOCK_DATA === "object"
    && typeof window.renderPlusMockTab === "function"
    && typeof window.handlePlusMockClick === "function");

  window.PLUS_MOCK_MODE = false;
  var prodHtml = plusHtml({ tab: "plus", plus_purchased: false, plus_status: null }, false);
  ok("O production when mock off", window.PLUS_MOCK_MODE === false);
  ok("O production presentation", prodHtml.indexOf("Ver mi situación real") >= 0);
  ok("O no mock review bar in prod", prodHtml.indexOf("plus-mock-review-bar") < 0);
  ok("P robot in prod", prodHtml.indexOf("plus-ai-highlight-icon") >= 0 && prodHtml.indexOf("🤖") >= 0);
  ok("Q branding in prod", prodHtml.indexOf("plus-header-icon") >= 0 && prodHtml.indexOf("Mi Plan Plus") >= 0);

  // Blocked mock
  var blockedHtml = plusHtml({ tab: "plus" }, true);
  ok("A blocked hero title", blockedHtml.indexOf("Desbloqueá tu diagnóstico verificado") >= 0);
  ok("A blocked subtitle", blockedHtml.indexOf("Comparamos lo que declaraste con registros consultados") >= 0);
  ok("A blocked CTA disabled", blockedHtml.indexOf("Desbloquear diagnóstico verificado") >= 0
    && blockedHtml.indexOf("disabled") >= 0);
  ok("L blocked toggle active", blockedHtml.indexOf("btn-plus-mock-blocked") >= 0);
  ok("P robot in blocked", blockedHtml.indexOf("🤖") >= 0);
  ok("Q branding star in blocked", blockedHtml.indexOf("plus-header-icon") >= 0);

  // Unlocked peor
  PlusMock._setModeForQA(true);
  PlusMock._resetSessionForQA();
  PlusMock.getSession().accessState = "unlocked";
  PlusMock.getSession().scenario = "peor";
  var peorHtml = renderTabPlus();

  ok("B unlocked renders blocks", peorHtml.indexOf("plus-mock-unlocked") >= 0);
  ok("D peor verification", peorHtml.indexOf("Requiere atención adicional") >= 0);
  ok("E peor coincidence 72%", peorHtml.indexOf("Coincidencia parcial") >= 0 && peorHtml.indexOf("72") >= 0);
  ok("F peor plans 2 vs 4", peorHtml.indexOf("Plan 2") >= 0 && peorHtml.indexOf("Plan 4") >= 0);
  ok("G peor finding mora", peorHtml.indexOf("registros de mora") >= 0);
  ok("H peor table $890.000", peorHtml.indexOf("$890.000") >= 0);
  ok("I peor priority mora", peorHtml.indexOf("Regularizar mora") >= 0);
  ok("J IA preview peor", peorHtml.indexOf("Análisis IA") >= 0 && peorHtml.indexOf("Ver informe completo") >= 0);
  ok("K docs center peor", peorHtml.indexOf("Centro de documentos") >= 0
    && peorHtml.indexOf("Registros consultados") >= 0);

  // Similar
  var similarHtml = scenarioHtml("similar");
  ok("C similar scenario", similarHtml.indexOf("Coincide con lo estimado") >= 0);
  ok("E similar 91%", similarHtml.indexOf("91") >= 0);
  ok("F similar plan 3", similarHtml.indexOf("Plan 3") >= 0);
  ok("H similar table", similarHtml.indexOf("$470.000") >= 0);

  // Mejor
  var mejorHtml = scenarioHtml("mejor");
  ok("C mejor scenario", mejorHtml.indexOf("Mejor de lo esperado") >= 0);
  ok("E mejor 94%", mejorHtml.indexOf("94") >= 0);
  ok("F mejor plans 4 vs 2", mejorHtml.indexOf("Plan 4") >= 0 && mejorHtml.indexOf("Plan 2") >= 0);
  ok("H mejor table $280.000", mejorHtml.indexOf("$280.000") >= 0);

  // Verified premium card
  ok("F verified premium class", peorHtml.indexOf("plus-mock-verified-card") >= 0);

  // Toggle handlers (session only, no CZState)
  var stBefore = { tab: "plus", plus_purchased: true, plus_status: "PLUS_READY", foo: 1 };
  window.CZState = stBefore;
  PlusMock._setModeForQA(true);
  PlusMock._resetSessionForQA();
  PlusMock.handleControlClick("btn-plus-mock-unlocked");
  ok("L unlock toggle session", PlusMock.getSession().accessState === "unlocked");
  ok("N CZState untouched unlock", stBefore.foo === 1 && stBefore.plus_status === "PLUS_READY");
  PlusMock.handleControlClick("btn-plus-mock-scenario-mejor");
  ok("L scenario toggle", PlusMock.getSession().scenario === "mejor");
  ok("N CZState untouched scenario", stBefore.foo === 1);

  // Dashboard / other tabs untouched
  PlusMock._setModeForQA(false);
  PRE.ingreso = 80000;
  window.CZState = {
    tab: "plan",
    step: 4,
    gastos: { alquiler: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "prestamo", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    snap: { plan_id: 2 },
    diag: null,
  };
  window.CZState.diag = calcularMotor();
  var planHtml = renderTabPlan();
  ok("M dashboard plan tab untouched", planHtml.indexOf("plus-mock-review-bar") < 0);
  window.CZState.tab = "deudas";
  var deudasHtml = renderTabDeudas();
  ok("N deudas tab untouched", deudasHtml.indexOf("plus-mock") < 0);

  // Mock data isolation
  ok("Data isolation peor/mejor differ",
    PlusMock.getData().peor.coincidence.pct !== PlusMock.getData().mejor.coincidence.pct);

  // SyntheticMotorQA
  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = require("child_process").execSync(
    "node dev/synthetic-motor-test.js",
    { cwd: root, encoding: "utf8" }
  );
  ok("R SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  console.log("\nplus-mock-p1b-qa — " + passed + " PASS, " + failed + " FAIL");
  if (failed > 0) process.exit(1);
})();
