/**
 * dev/zero-payment-debt-clarification-b5a-qa.js — Sprint B5a QA (A–J)
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

  var MSG = _ZERO_PAYMENT_DEBT_CLARIFICATION;
  var fullG = { vivienda: 12000, alimentacion: 8000, transporte: 2000, salud: 3000, educacion: 1000, otros: 1000 };

  function composicionSlice(html) {
    var start = html.indexOf("Composicion de tu perfil");
    var end = html.indexOf("Perfil conductual", start);
    return start >= 0 ? html.slice(start, end) : "";
  }

  function run(st, ing) {
    PRE.ingreso = ing || 80000;
    window.CZState = st;
    var d = st.diag || calcularMotor();
    window.CZState.diag = d;
    return {
      diag: d,
      tab: renderTabPlan(),
      hero: _renderDashboardHeroCard(d, window.CZState),
      show: _shouldShowZeroPaymentDebtClarification(st),
    };
  }

  function hasMsg(tab) {
    return tab.indexOf(MSG) >= 0;
  }

  function composicionHasMsg(tab) {
    return composicionSlice(tab).indexOf(MSG) >= 0;
  }

  // A — Active debt + payment = 0
  var caseA = run({
    deudas: [{ tipo: "prestamo", monto: "100000", pago: "0", situacion_ui: "pagando_normal" }],
    gastos: fullG,
  });
  ok("A helper true", caseA.show === true);
  ok("A message in composicion", composicionHasMsg(caseA.tab));
  ok("A not in hero", caseA.hero.indexOf(MSG) < 0);

  // B — Active debt + payment > 0
  var caseB = run({
    deudas: [{ tipo: "prestamo", monto: "80000", pago: "8000", situacion_ui: "pagando_normal" }],
    gastos: fullG,
  });
  ok("B helper false", caseB.show === false);
  ok("B message absent", !hasMsg(caseB.tab));

  // C — Cancelled debt only
  var caseC = run({
    deudas: [{ tipo: "prestamo", monto: "50000", pago: "5000", cancelada: true }],
    gastos: fullG,
  });
  ok("C helper false", caseC.show === false);
  ok("C message absent", !hasMsg(caseC.tab));

  // D — No debt
  var caseD = run({
    deudas: [],
    gastos: fullG,
    no_debts_declared: true,
  });
  ok("D helper false", caseD.show === false);
  ok("D message absent", !hasMsg(caseD.tab));

  // E — Plan 4 + debt + payment = 0
  var caseE = run({
    deudas: [{ tipo: "prestamo", monto: "200000", pago: "0", situacion_ui: "deje_pagar", atraso_tiempo: "mas_90" }],
    gastos: { vivienda: 15000 },
  });
  ok("E plan 4", caseE.diag.planId === 4);
  ok("E message renders", composicionHasMsg(caseE.tab));

  // F — Plan 1 + debt + payment = 0
  PRE.respuestas = { p1: "B", p2: "B", p3: "C", p4: "B", p5: "C", p6: "B", p7: "C", p8: "B", p9: "C", p10: "B" };
  var caseF = run({
    deudas: [{ tipo: "prestamo", monto: "10000", pago: "0", situacion_ui: "pagando_normal" }],
    gastos: fullG,
  });
  ok("F plan 1", caseF.diag.planId === 1);
  ok("F message renders", composicionHasMsg(caseF.tab));

  // G — scoreFinanciero unchanged
  var beforeScore = caseA.diag.fin.scoreFinanciero;
  var rerun = calcularMotor();
  ok("G scoreFinanciero unchanged", rerun.fin.scoreFinanciero === beforeScore);

  // H — _scoreFinancieroLabel unchanged
  var labelFn = _scoreFinancieroLabel.toString();
  ok("H label thresholds intact", labelFn.indexOf("Situación crítica") >= 0 && labelFn.indexOf("Estable") >= 0);
  ok("H stable mapping", _scoreFinancieroLabel(28).text === "Estable");

  // I — Hero unchanged (no B5a message)
  ok("I hero no clarification", caseE.hero.indexOf(MSG) < 0);
  ok("I hero still has plan title", caseE.hero.indexOf("Tu panorama actual") >= 0);

  // J — SyntheticMotorQA module present
  ok("J synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  // Presentation — neutral copy, not warning banner
  ok("K no warning role in composicion", composicionSlice(caseA.tab).indexOf('role="alert"') < 0);
  ok("K no CTA in clarification block", composicionSlice(caseA.tab).indexOf("<button") < 0
    || composicionSlice(caseA.tab).indexOf(MSG) < composicionSlice(caseA.tab).indexOf("<button"));

  console.log("\nZero payment debt clarification B5a QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
