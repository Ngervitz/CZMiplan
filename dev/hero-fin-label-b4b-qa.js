/**
 * dev/hero-fin-label-b4b-qa.js — Sprint B4b: remove Situación financiera from Hero
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
  global.document = { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} };
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

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/ui.js");

  var fullG = {
    vivienda: 12000,
    alimentacion: 8000,
    transporte: 2000,
    salud: 3000,
    educacion: 1000,
    otros: 1000,
  };

  function heroZoneHtml(tabHtml) {
    var end = tabHtml.indexOf("dash-zone-diagnostico");
    return end >= 0 ? tabHtml.slice(0, end) : tabHtml;
  }

  function assertCompleteHeroFourFields(heroHtml, label) {
    ok(label + " has plan title area", heroHtml.indexOf("Tu panorama actual") >= 0);
    ok(label + " has status pill", heroHtml.indexOf("Estado del plan:") >= 0);
    ok(label + " has next step block", heroHtml.indexOf("Próximo paso recomendado") >= 0);
    ok(label + " no Situación financiera in Hero", heroHtml.indexOf("Situación financiera:") < 0);
  }

  function runCase(st, ing, qs) {
    if (qs) global.window.location = { search: qs };
    PRE.ingreso = ing || 80000;
    window.CZState = st;
    var d = st.diag || calcularMotor();
    window.CZState.diag = d;
    return {
      diag: d,
      hero: _renderDashboardHeroCard(d, window.CZState),
      tab: renderTabPlan(),
    };
  }

  // A — Plan 4 mora / zero payment
  var caseA = runCase({
    deudas: [{ tipo: "prestamo", monto: "200000", pago: "0", situacion_ui: "deje_pagar", atraso_tiempo: "mas_90" }],
    gastos: { vivienda: 15000 },
  }, 80000);
  var heroA = heroZoneHtml(caseA.tab);
  ok("A plan 4 assigned", caseA.diag.planId === 4);
  ok("A no Situación financiera in Hero", caseA.hero.indexOf("Situación financiera:") < 0);
  ok("A no green Estable in Hero", !/🟢[^<]{0,40}Estable/.test(caseA.hero));
  ok("A critical problem preserved", caseA.hero.indexOf("punto critico") >= 0);

  // B — Plan 1 complete
  var caseB = runCase({
    deudas: [],
    gastos: fullG,
    no_debts_declared: true,
  }, 80000);
  ok("B plan 1", caseB.diag.planId === 1);
  ok("B no fin label in Hero", caseB.hero.indexOf("Situación financiera:") < 0);

  // C — Plan 2 active debt
  var caseC = runCase({
    deudas: [{ tipo: "prestamo", monto: "80000", pago: "35000", situacion_ui: "pagando_normal" }],
    gastos: { vivienda: 10000 },
  }, 80000);
  ok("C plan 2", caseC.diag.planId === 2);
  ok("C no fin label in Hero", caseC.hero.indexOf("Situación financiera:") < 0);

  // D — Plans 1–5 complete Hero contract
  var planCases = [
    { id: 1, st: { deudas: [], gastos: fullG, no_debts_declared: true }, ing: 80000 },
    { id: 2, st: { deudas: [{ tipo: "prestamo", monto: "80000", pago: "35000", situacion_ui: "pagando_normal" }], gastos: { vivienda: 10000 } }, ing: 80000 },
    { id: 3, st: { deudas: [{ tipo: "prestamo", monto: "40000", pago: "4000", situacion_ui: "pagando_normal" }], gastos: fullG }, ing: 80000 },
    { id: 4, st: { deudas: [{ tipo: "prestamo", monto: "100000", pago: "25000", situacion_ui: "pagando_normal" }], gastos: { vivienda: 20000 } }, ing: 40000 },
    { id: 5, st: { deudas: [], gastos: fullG, financial_debts_complete: true }, ing: 80000, survey: { p1: "C", p2: "C", p3: "A", p4: "C", p5: "C", p6: "C", p7: "C", p8: "A", p9: "A", p10: "C" } },
  ];
  planCases.forEach(function(pc) {
    if (pc.survey) PRE.respuestas = pc.survey;
    var r = runCase(pc.st, pc.ing);
    ok("D plan " + pc.id + " assigned", r.diag.planId === pc.id);
    assertCompleteHeroFourFields(heroZoneHtml(r.tab), "D plan " + pc.id);
  });

  // E — Composición de tu perfil unchanged
  var caseE = runCase({
    deudas: [{ tipo: "prestamo", monto: "80000", pago: "35000", situacion_ui: "pagando_normal" }],
    gastos: { vivienda: 10000 },
  }, 80000);
  ok("E composicion section present", caseE.tab.indexOf("Composicion de tu perfil") >= 0);
  ok("E Situacion financiera in Tus numeros", caseE.tab.indexOf("Situacion financiera") >= 0);
  ok("E score label rendered in composicion", caseE.tab.indexOf("Estable") >= 0 || caseE.tab.indexOf("presión") >= 0 || caseE.tab.indexOf("recuperación") >= 0 || caseE.tab.indexOf("crítica") >= 0);

  // F — _scoreFinancieroLabel preserved
  ok("F helper defined", typeof _scoreFinancieroLabel === "function");
  var labelF = _scoreFinancieroLabel(28);
  ok("F stable mapping", labelF.text === "Estable" && labelF.emoji === "🟢");
  ok("F not removed from ui exports", fs.readFileSync(path.join(root, "js/ui.js"), "utf8").indexOf("function _scoreFinancieroLabel") >= 0);

  // G — Incomplete Hero unchanged
  var caseG = runCase({
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
  }, 80000);
  ok("G incomplete title", caseG.hero.indexOf("Tu diagnóstico todavía no está completo") >= 0);
  ok("G paso prioritario", caseG.hero.indexOf("Paso prioritario") >= 0);
  ok("G no complete hero panorama", caseG.hero.indexOf("Tu panorama actual") < 0);
  ok("G no fin label in incomplete hero", caseG.hero.indexOf("Situación financiera:") < 0);

  // H — SyntheticMotorQA module (run separately)
  ok("H synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  // I — source: Hero renderer no longer calls fin label
  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var heroFn = uiSrc.slice(uiSrc.indexOf("function _renderDashboardHeroCard"), uiSrc.indexOf("// TAB: MI PLAN"));
  ok("I Hero fn has no Situación financiera string", heroFn.indexOf("Situación financiera:") < 0);
  ok("I Hero fn has no finLabel variable", !/\bfinLabel\b/.test(heroFn));
  ok("I composicion still uses _finScoreLabel", uiSrc.indexOf("Situacion financiera</div>") >= 0 && uiSrc.indexOf("_renderProfileScoreLabelHtml(_finScoreLabel)") >= 0);

  console.log("\nHero fin label B4b QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
