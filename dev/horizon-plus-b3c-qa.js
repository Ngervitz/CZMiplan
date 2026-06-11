/**
 * dev/horizon-plus-b3c-qa.js — Sprint B3c remove Plus promo from horizon (A–J)
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

  function zoneSlice(html, zoneKey) {
    var marker = "dash-zone-" + zoneKey;
    var start = html.indexOf(marker);
    if (start < 0) return "";
    var searchFrom = start + marker.length;
    var next = html.indexOf('class="dash-zone dash-zone-', searchFrom);
    return next >= 0 ? html.slice(start, next) : html.slice(start);
  }

  function noPlusInHorizon(html) {
    return html.indexOf("btn-conocer-plus-tab") < 0
      && html.indexOf("Para confirmar este calculo") < 0
      && html.indexOf("También podés contrastar tu situación") < 0;
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

  boot();
  var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");

  function tabFor(st, ingreso) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    var diag = st.diag || calcularMotor();
    window.CZState.diag = diag;
    return renderTabPlan();
  }

  // A — Complete profile
  var tabComplete = tabFor({
    step: 3,
    gastos: { vivienda: 15000, alimentacion: 8000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    no_debts_declared: false,
    diag: null,
  }, 75000);
  var accionComplete = zoneSlice(tabComplete, "accion");
  ok("A no Plus in accion zone", noPlusInHorizon(accionComplete));
  ok("A horizon still renders", accionComplete.indexOf("Horizonte estimado") >= 0
    || accionComplete.indexOf("recalificar") >= 0);

  // B — Incomplete gastos
  boot();
  var tabInc = tabFor({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    diag: null,
  }, 80000);
  var accionInc = zoneSlice(tabInc, "accion");
  ok("B incomplete no Plus in accion", noPlusInHorizon(accionInc));
  ok("B incomplete gastos copy present", accionInc.indexOf("Completar gastos") >= 0
    || accionInc.indexOf("gastos mensuales") >= 0);

  // C — MiDeuda recommended (extreme debt profile)
  boot();
  PRE.ingreso = 45000;
  window.CZState = {
    step: 3,
    gastos: { vivienda: 8000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "500000",
      pago: "100",
      situacion_ui: "pagando_normal",
    }],
    diag: null,
  };
  var diagC = calcularMotor();
  window.CZState.diag = diagC;
  var htmlC = renderHorizonteRecalificacion(diagC, window.CZState);
  var fallbackC = renderRetryBlockedFallbackCta(diagC, window.CZState);
  ok("C horizon no Plus promo", noPlusInHorizon(htmlC));
  ok("C MiDeuda fallback unchanged", fallbackC.indexOf("btn-retry-fallback-deuda") >= 0
    || fallbackC.indexOf("MiDeuda") >= 0
    || fallbackC.indexOf("Ordenar mi deuda") >= 0);

  // D — Retry eligible
  boot();
  PRE.ingreso = 80000;
  window.CZState = {
    step: 3,
    gastos: { vivienda: 20000, alimentacion: 10000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "75000",
      pago: "6000",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2, fecha_inicio: new Date().toISOString() },
    diag: null,
  };
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  var htmlD = renderHorizonteRecalificacion(diagD, window.CZState);
  ok("D no Plus in horizon", noPlusInHorizon(htmlD));
  ok("D retry eligible button", isRetryEligible(diagD, window.CZState)
    && htmlD.indexOf("btn-retry-application") >= 0);

  // E — Retry blocked + fallback plus
  boot();
  var diagE = {
    planId: 1,
    nivelR: "A",
    fin: { flujoLibre: 50000, ratio: 0.1, dti_ratio: 0.2 },
    horizonte: { banda: "inmediato", label: "Ya hay condiciones para considerar una solicitud" },
    bloqueadores: [],
    interpretacion_v2: { confidence_level: "low", severity_level: "bajo" },
    financial_reality_warning: false,
    missing_payment_information: false,
  };
  var stE = { snap: { plan_id: 1 }, deudas: [], gastos: { vivienda: 10000 }, gastos_missing_confirmed: false };
  var htmlE = renderHorizonteRecalificacion(diagE, stE);
  var fallbackE = renderRetryBlockedFallbackCta(diagE, stE);
  ok("E no horizon Plus promo", noPlusInHorizon(htmlE));
  ok("E retry-fallback-plus unchanged", fallbackE.indexOf("btn-retry-fallback-plus") >= 0
    || fallbackE.indexOf("btn-retry-fallback-gastos") >= 0
    || fallbackE.indexOf("btn-retry-fallback-deuda") >= 0);

  // F — dash-zone-plus
  boot();
  tabComplete = tabFor({
    step: 3,
    gastos: { vivienda: 15000, alimentacion: 8000 },
    deudas: [{ tipo: "prestamo", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    diag: null,
  }, 75000);
  ok("F cz-plus-entry", tabComplete.indexOf("cz-plus-entry") >= 0);
  ok("F btn-conocer-plus", tabComplete.indexOf("btn-conocer-plus") >= 0);

  // G — Tab nav
  ok("G plus tab nav", renderDashboard().indexOf('data-tab="plus"') >= 0);

  // H — function preserved, no render calls in horizon paths
  ok("H _horizonPlusPromoHtml defined", typeof _horizonPlusPromoHtml === "function");
  ok("H no calls in renderHorizonteRecalificacion", !/function renderHorizonteRecalificacion[\s\S]*?_horizonPlusPromoHtml/.test(uiJs));
  ok("H no calls in incomplete horizon", uiJs.indexOf("_renderIncompleteHorizonHtml") >= 0
    && !/_renderIncompleteHorizonHtml[\s\S]{0,800}_horizonPlusPromoHtml/.test(uiJs));

  // I — SyntheticMotorQA
  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("I SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  // J — Prior QA suites
  console.log("\n--- Regression suites ---");
  [
    ["hidden-factor-b3a-qa", "dev/hidden-factor-b3a-qa.js"],
    ["horizon-low-confidence-qa", "dev/horizon-low-confidence-qa.js"],
    ["retry-cta-qa", "dev/retry-cta-qa.js"],
    ["cta-hierarchy-qa", "dev/cta-hierarchy-qa.js"],
    ["hero-card-qa", "dev/hero-card-qa.js"],
    ["edit-gastos-b2b-qa", "dev/edit-gastos-b2b-qa.js"],
    ["zero-active-debt-b2e-qa", "dev/zero-active-debt-b2e-qa.js"],
  ].forEach(function(s) {
    var out = execSync("node " + s[1], { cwd: root, encoding: "utf8" });
    ok("J " + s[0] + " PASS", out.indexOf("[FAIL]") < 0);
  });

  console.log("\nhorizon-plus-b3c-qa — " + passed + "/" + (passed + failed)
    + (failed ? " (" + failed + " FAIL)" : " PASS"));
  if (failed) process.exit(1);
})();
