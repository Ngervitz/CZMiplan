/**
 * dev/hero-cta-b2a-qa.js — Sprint B2a Hero operational CTA (A–J)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
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

  function hero(st, ingreso) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    var diag = st.diag || calcularMotor();
    window.CZState.diag = diag;
    return {
      html: _renderDashboardHeroCard(diag, window.CZState),
      tab: renderTabPlan(),
      diag: diag,
    };
  }

  boot();
  var appJs = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

  // A — Expenses missing
  var rA = hero({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  }, 80000);
  ok("A Completar gastos in hero", rA.html.indexOf("Completar gastos") >= 0);
  ok("A no Plus in hero", rA.html.indexOf("btn-hero-ver-plus") < 0
    && rA.html.indexOf("Ver Mi Plan Plus") < 0);

  // B — Debts missing, gastos complete
  var rB = hero({
    step: 3,
    gastos: { vivienda: 8000, alimentacion: 5000, salud: 2049 },
    gastos_missing_confirmed: false,
    financial_expenses_complete: true,
    no_debts_declared: false,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  }, 33333);
  ok("B Confirmar mis deudas in hero", rB.html.indexOf("Confirmar mis deudas") >= 0
    && rB.html.indexOf("btn-hero-confirmar-deudas") >= 0);
  ok("B no Plus in hero", rB.html.indexOf("btn-hero-ver-plus") < 0);
  ok("B no Completar gastos", rB.html.indexOf("btn-retry-fallback-gastos") < 0);

  // C — Both missing: gastos wins
  var rC = hero({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  }, 80000);
  ok("C Completar gastos primary", rC.html.indexOf("btn-retry-fallback-gastos") >= 0);
  ok("C no Confirmar mis deudas", rC.html.indexOf("btn-hero-confirmar-deudas") < 0);
  ok("C no Plus", rC.html.indexOf("btn-hero-ver-plus") < 0);

  // D — no_debts_declared true, gastos complete
  var rD = hero({
    step: 3,
    gastos: { vivienda: 12000 },
    gastos_missing_confirmed: false,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  }, 50000);
  ok("D no Confirmar mis deudas when no_debts_declared", rD.html.indexOf("btn-hero-confirmar-deudas") < 0);
  ok("D no Plus", rD.html.indexOf("btn-hero-ver-plus") < 0);

  // E — Profile complete
  var rE = hero({
    step: 3,
    gastos: { vivienda: 15000, alimentacion: 8000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    snap: { plan_id: 2 },
    diag: null,
  }, 75000);
  ok("E complete hero diagnosis", rE.html.indexOf("Tu panorama actual") >= 0);
  ok("E no Plus in hero", rE.html.indexOf("btn-hero-ver-plus") < 0);
  ok("E no operational CTAs", rE.html.indexOf("btn-retry-fallback-gastos") < 0
    && rE.html.indexOf("btn-hero-confirmar-deudas") < 0);

  // F — Plus block unchanged
  ok("F plus zone present", rE.tab.indexOf("dash-zone-plus") >= 0);
  ok("F btn-conocer-plus present", rE.tab.indexOf('id="btn-conocer-plus"') >= 0);
  ok("F cz-plus-entry present", rE.tab.indexOf('id="cz-plus-entry"') >= 0);

  // G — Qué hacer ahora unchanged
  ok("G accion zone present", rE.tab.indexOf("dash-zone-accion") >= 0);
  ok("G qué hacer ahora label", rE.tab.indexOf("Qué hacer ahora") >= 0);
  ok("G horizon render", rE.tab.indexOf("Horizonte") >= 0 || rE.tab.indexOf("dash-horizon-compact") >= 0);

  // H — switchTab deudas wired, not st.step = 1
  ok("H btn-hero-confirmar-deudas handler uses switchTab", appJs.indexOf('e.target.id === "btn-hero-confirmar-deudas"') >= 0
    && appJs.indexOf('switchTab("deudas")') >= 0);
  ok("H hero debt handler not st.step = 1", !/btn-hero-confirmar-deudas[\s\S]{0,120}st\.step\s*=\s*1/.test(appJs));

  console.log("\nHero CTA B2a QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
