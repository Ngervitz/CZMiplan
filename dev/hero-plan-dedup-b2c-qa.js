/**
 * dev/hero-plan-dedup-b2c-qa.js — Sprint B2c plan summary deduplication (A–J)
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
  }

  function countSubstr(hay, needle) {
    var n = 0;
    var i = 0;
    while ((i = hay.indexOf(needle, i)) >= 0) {
      n++;
      i += needle.length;
    }
    return n;
  }

  function zoneSlice(html, zoneKey) {
    var start = html.indexOf("dash-zone-" + zoneKey);
    if (start < 0) return "";
    var next = html.indexOf("dash-zone-", start + 12);
    return next >= 0 ? html.slice(start, next) : html.slice(start);
  }

  function renderComplete(st, ingreso) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    var diag = st.diag || calcularMotor();
    window.CZState.diag = diag;
    return {
      tab: renderTabPlan(),
      hero: _renderDashboardHeroCard(diag, window.CZState),
      diag: diag,
    };
  }

  boot();

  // A — Complete Plan 4
  var r4 = renderComplete({
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 8000, servicios: 3000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "500000",
      pago: "45000",
      situacion_ui: "pagando_normal",
    }],
    snap: { plan_id: 4 },
    diag: null,
  }, 50000);
  var diag4 = zoneSlice(r4.tab, "diagnostico");
  ok("A Plan 4 assigned", r4.diag.planId === 4);
  ok("A Hero shows plan title", r4.hero.indexOf("Estabilizacion Critica") >= 0);
  ok("A no plan-title-big in diagnostico", diag4.indexOf("plan-title-big") < 0);
  ok("A no duplicate large title in diagnostico", diag4.indexOf("Estabilizacion Critica") < 0);
  ok("A objetivo preserved", diag4.indexOf("Que busca este plan") >= 0
    && diag4.indexOf(r4.diag.plan.objetivo) >= 0);
  ok("A Plan 4 footnote preserved", diag4.indexOf("punto de partida sigue siendo tu evaluación original") >= 0);

  // B — Complete Plan 1 (requires declared debt for UI-complete profile)
  var r1 = renderComplete({
    step: 3,
    gastos: { vivienda: 15000, alimentacion: 8000, transporte: 3000 },
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [{ tipo: "tarjeta", acreedor: "Visa", monto: "10000", pago: "2000", situacion_ui: "pagando_normal" }],
    snap: { plan_id: 1 },
    diag: null,
  }, 100000);
  var diag1 = zoneSlice(r1.tab, "diagnostico");
  ok("B complete profile assigned", r1.diag.planId >= 1 && r1.diag.planId <= 2);
  ok("B Hero shows plan title", r1.hero.indexOf(r1.diag.plan.titulo) >= 0);
  ok("B no plan-title-big in diagnostico", diag1.indexOf("plan-title-big") < 0);
  ok("B no plan-desc in diagnostico", diag1.indexOf("plan-desc") < 0);
  ok("B objetivo preserved", diag1.indexOf("Que busca este plan") >= 0
    && diag1.indexOf(r1.diag.plan.objetivo) >= 0);

  // C — Plans 2, 3, 5 deduplication
  var profiles = [
    {
      label: "2",
      st: {
        step: 3,
        gastos: { vivienda: 15000, alimentacion: 8000 },
        gastos_missing_confirmed: false,
        no_debts_declared: false,
        deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "80000", pago: "5000", situacion_ui: "pagando_normal" }],
        snap: { plan_id: 2 },
        diag: null,
      },
      ingreso: 45000,
    },
    {
      label: "3",
      st: {
        step: 3,
        gastos: { vivienda: 12000, alimentacion: 7000 },
        gastos_missing_confirmed: false,
        no_debts_declared: false,
        deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "40000", pago: "3000", situacion_ui: "pagando_normal" }],
        snap: { plan_id: 3 },
        diag: null,
      },
      ingreso: 60000,
    },
    {
      label: "5",
      st: {
        step: 3,
        gastos: { vivienda: 14000, alimentacion: 8000 },
        gastos_missing_confirmed: false,
        no_debts_declared: false,
        deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "120000", pago: "8000", situacion_ui: "en_mora" }],
        snap: { plan_id: 5 },
        diag: null,
      },
      ingreso: 55000,
    },
  ];
  profiles.forEach(function(p) {
    var r = renderComplete(p.st, p.ingreso);
    var dz = zoneSlice(r.tab, "diagnostico");
    ok("C Plan " + p.label + " deduped title", dz.indexOf("plan-title-big") < 0);
    ok("C Plan " + p.label + " objetivo kept", dz.indexOf("Que busca este plan") >= 0);
  });

  // D — Status pill once on complete tab
  ok("D single Estado del plan on complete tab", countSubstr(r4.tab, "Estado del plan:") === 1);

  // E — Incomplete profile
  PRE.ingreso = 80000;
  window.CZState = {
    step: 3,
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagInc = calcularMotor();
  window.CZState.diag = diagInc;
  var tabInc = renderTabPlan();
  var heroInc = _renderDashboardHeroCard(diagInc, window.CZState);
  var diagIncZone = zoneSlice(tabInc, "diagnostico");
  ok("E hero operational incomplete", heroInc.indexOf("Tu diagnóstico todavía no está completo") >= 0);
  ok("E no plan-title-big in diagnostico", diagIncZone.indexOf("plan-title-big") < 0);
  ok("E no Estado del plan in diagnostico", diagIncZone.indexOf("Estado del plan:") < 0);
  ok("E no Que busca este plan when incomplete", diagIncZone.indexOf("Que busca este plan") < 0);
  ok("E incomplete narrative renders", diagIncZone.indexOf("Qué está pasando") >= 0
    || tabInc.indexOf("Información insuficiente") >= 0
    || tabInc.indexOf("Diagnóstico incompleto") >= 0);

  // F — renderNarrativaInterpretacion unchanged (function + complete narrative blocks)
  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  ok("F renderNarrativaInterpretacion function present", uiSrc.indexOf("function renderNarrativaInterpretacion") >= 0);
  ok("F complete narrative Qué está pasando", zoneSlice(r4.tab, "diagnostico").indexOf("Qué está pasando") >= 0);

  // G — Hero card QA module present
  ok("G hero-card QA module present", fs.existsSync(path.join(root, "dev/hero-card-qa.js")));

  // H — score-label QA updated
  ok("H score-label QA expects no plan-title-big in diagnostico",
    fs.readFileSync(path.join(root, "dev/score-label-qa.js"), "utf8").indexOf("no plan-title-big in diagnostico") >= 0);

  // I — SyntheticMotorQA module present
  ok("I synthetic motor QA module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  // J — No motor/CRM/GTM changes in ui.js sprint diff area
  ok("J renderTabPlan still uses calcularMotor path via _diag", uiSrc.indexOf("function renderTabPlan()") >= 0
    && uiSrc.indexOf("var diag   = _diag();") >= 0);
  ok("J no calcularMotor edits in ui", !/function calcularMotor/.test(uiSrc));

  console.log("\nHero plan dedup B2c QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);
})();
