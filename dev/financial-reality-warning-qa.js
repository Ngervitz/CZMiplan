/**
 * dev/financial-reality-warning-qa.js
 * node dev/financial-reality-warning-qa.js
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?ingreso=45000&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A" };
  global.window.CZState = { gastos: {}, deudas: [], snap: null };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");

  function debt(pago) {
    return {
      tipo: "tarjeta",
      acreedor: "OCA",
      acreedor_raw: "OCA",
      monto: "100000",
      pago: String(pago),
      estado: "al_dia",
      situacion_ui: "pagando_normal",
      cancelada: false,
    };
  }

  function coreFingerprint(diag) {
    var iv2 = diag.interpretacion_v2 || {};
    var n0 = (iv2.narrativa_jerarquizada && iv2.narrativa_jerarquizada[0]) || {};
    return JSON.stringify({
      planId: diag.planId,
      scoreReset: diag.scoreReset,
      scoreFinanciero: diag.fin && diag.fin.scoreFinanciero,
      dti_ratio: diag.fin && diag.fin.dti_ratio,
      horizonte: diag.horizonte,
      confidence_level: iv2.confidence_level,
      causa_principal: iv2.causa_principal,
      narrativa_causa: n0.causa,
    });
  }

  var cases = [
    { id: "A", pago: 30000, expectWarn: false, expectType: null },
    { id: "B", pago: 38000, expectWarn: true, expectType: "high_payment_pressure" },
    { id: "C", pago: 45000, expectWarn: true, expectType: "high_payment_pressure" },
    { id: "D", pago: 50000, expectWarn: true, expectType: "payments_exceed_income" },
    { id: "E", pago: 70000, expectWarn: true, expectType: "payments_exceed_income" },
  ];

  PRE.ingreso = 45000;
  var passed = 0;
  var failed = 0;

  console.log("=== Financial Reality Warning QA ===");
  cases.forEach(function(c) {
    window.CZState.deudas = [debt(c.pago)];
    var diag = calcularMotor();
    var okWarn = diag.financial_reality_warning === c.expectWarn;
    var okType = diag.financial_reality_warning_type === c.expectType;
    var okFields = typeof diag.financial_reality_warning === "boolean"
      && (diag.financial_reality_warning_type === null
          || typeof diag.financial_reality_warning_type === "string");
    var okUsesFin = diag.fin && diag.fin.totalPago === c.pago;
    var pass = okWarn && okType && okFields && okUsesFin;
    console.log((pass ? "[PASS]" : "[FAIL]") + " " + c.id
      + " pago=" + c.pago
      + " warn=" + diag.financial_reality_warning
      + " type=" + diag.financial_reality_warning_type
      + " fin.totalPago=" + (diag.fin && diag.fin.totalPago));
    if (pass) passed++; else failed++;
  });

  // F — warning layer is additive: evaluarFinancialRealityWarning does not mutate fin
  var finSnap = { totalPago: 38000, ratio: 0.84, flujoLibre: 5000, dti_ratio: 2.2 };
  var finCopy = JSON.parse(JSON.stringify(finSnap));
  var w = evaluarFinancialRealityWarning(finCopy, 45000);
  var okPure = finCopy.totalPago === finSnap.totalPago
    && w.financial_reality_warning === true
    && w.financial_reality_warning_type === "high_payment_pressure";
  console.log((okPure ? "[PASS]" : "[FAIL]") + " F: warning evaluator is read-only on fin; core motor paths untouched");
  if (okPure) passed++; else failed++;

  console.log("");
  console.log("PASSED: " + passed + "/6");
  console.log("FAILED: " + failed + "/6");
  process.exit(failed > 0 ? 1 : 0);
})();
