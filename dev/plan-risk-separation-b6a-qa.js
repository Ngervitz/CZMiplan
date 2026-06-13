/**
 * dev/plan-risk-separation-b6a-qa.js — Sprint B6a debt cost vs financial risk QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var ctx = vm.createContext({
    window: {},
    global: {},
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    URLSearchParams: URLSearchParams,
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.window.location = { search: "?ingreso=1&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A" };

  function load(file) {
    vm.runInContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      ctx,
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var AUDIT_SURVEY = {
    p1: "A", p2: "B", p3: "A", p4: "B", p5: "D",
    p6: "B", p7: "B", p8: "C", p9: "B", p10: "B",
  };

  var AUDIT_SURVEY_BPLUS = Object.assign({}, AUDIT_SURVEY, { p8: "A" });

  function runMotor(opts) {
    opts = opts || {};
    ctx.PRE = {
      ingreso: opts.ingreso != null ? opts.ingreso : 65300,
      respuestas: opts.respuestas || AUDIT_SURVEY,
    };
    ctx.TIENE_ENCUESTA = opts.tieneEncuesta !== false;
    ctx.SEVERITY_CRITICO_SCORE_FIN_MAX = 8;
    ctx.SEVERITY_CRITICO_SCORE_RESET_MAX = 8;
    ctx.CZ_PLUS_BCU_CLEARING_LIVE = false;
    ctx.CZState = {
      gastos: opts.gastos || { vivienda: 15000, alimentacion: 10000, transporte: 7300 },
      deudas: (opts.deudas || []).map(function(d, i) {
        return {
          acreedor: d.acreedor || ("Deuda_" + i),
          acreedor_raw: d.acreedor || ("Deuda_" + i),
          monto: String(d.monto != null ? d.monto : 0),
          pago: String(d.pago != null ? d.pago : 0),
          tipo: d.tipo || "tarjeta",
          situacion_ui: d.situacion_ui || "pagando_normal",
          estado: d.estado || (d.situacion_ui === "mora_reclamo" ? "mora"
            : d.situacion_ui === "deje_pagar" ? "atraso_grave" : "al_dia"),
          cancelada: false,
          pago_fuente: "declarado",
        };
      }),
      snap: null,
    };
    return ctx.calcularMotor();
  }

  var auditDebts = [
    { acreedor: "VISA Uruguay", monto: 17580, pago: 1500, tipo: "tarjeta" },
    { acreedor: "Cofac", monto: 2000, pago: 200, tipo: "financiera" },
  ];

  // Case A — audited profile → Plan 1
  var caseA = runMotor({ deudas: auditDebts });
  ok("A audited profile → Plan 1", caseA.planId === 1);
  ok("A not Plan 2", caseA.planId !== 2);
  ok("A costoDeudaNivel Alto (expensive debt preserved)", caseA.fin.costoDeudaNivel === "Alto");
  ok("A nivelRiesgo not driven by interesProm", caseA.fin.nivelRiesgo === "Bajo");
  ok("A interesProm still computed", caseA.fin.interesProm >= 90);

  // Case B — B+ survey → Plan 3
  var caseB = runMotor({ deudas: auditDebts, respuestas: AUDIT_SURVEY_BPLUS });
  ok("B B+ survey → Plan 3", caseB.planId === 3);
  ok("B enc nivel B+", caseB.enc.nivel === "B+");

  // Case C — high interest + high payment burden → Plan 2 (raw; guardrail may bump by DTI)
  var caseC = runMotor({
    ingreso: 45000,
    gastos: { vivienda: 10000, alimentacion: 6000 },
    deudas: [
      { acreedor: "OCA", monto: 120000, pago: 18000, tipo: "tarjeta" },
    ],
  });
  ok("C high cost + high burden → raw Plan 2", caseC.assigned_plan_raw === 2);
  ok("C final plan debt-reduction tier (2 or 3)", caseC.planId === 2 || caseC.planId === 3);
  ok("C ratio elevated", caseC.fin.ratio > 0.35);

  // Case D — high interest + mora → Plan 2 (legacy estado mora, no mora_reclamo guardrail)
  var caseD = runMotor({
    deudas: [
      {
        acreedor: "VISA",
        monto: 50000,
        pago: 2000,
        tipo: "tarjeta",
        situacion_ui: "pagando_normal",
        estado: "mora",
      },
    ],
  });
  ok("D mora → Plan 2", caseD.planId === 2);
  ok("D assigned_plan_raw Plan 2", caseD.assigned_plan_raw === 2);
  ok("D cantMoras > 0", caseD.fin.cantMoras > 0);

  // Case E — negative cash flow → Plan 4
  var caseE = runMotor({
    ingreso: 30000,
    gastos: { vivienda: 25000, alimentacion: 8000 },
    deudas: [{ acreedor: "OCA", monto: 10000, pago: 1000, tipo: "prestamo" }],
  });
  ok("E negative flow → Plan 4", caseE.planId === 4);
  ok("E flujoLibre < 0", caseE.fin.flujoLibre < 0);

  // Case F — informal debt → Plan 4
  var caseF = runMotor({
    deudas: [{ acreedor: "familiar", monto: 15000, pago: 1000, tipo: "informal", situacion_ui: "pagando_normal" }],
  });
  ok("F informal debt → Plan 4", caseF.planId === 4);
  ok("F cantInformales > 0", caseF.fin.cantInformales > 0);

  // Case G — extreme: multiple moras + enc C
  var caseG = runMotor({
    ingreso: 25000,
    gastos: { vivienda: 12000 },
    respuestas: {
      p1: "D", p2: "D", p3: "D", p4: "D", p5: "D",
      p6: "D", p7: "D", p8: "D", p9: "D", p10: "D",
    },
    deudas: [
      { acreedor: "A", monto: 40000, pago: 3000, tipo: "tarjeta", situacion_ui: "mora_reclamo", estado: "mora" },
      { acreedor: "B", monto: 30000, pago: 2500, tipo: "financiera", situacion_ui: "deje_pagar", estado: "atraso_grave" },
    ],
  });
  ok("G multiple moras → Plan 4", caseG.planId === 4);
  ok("G enc nivel C", caseG.enc.nivel === "C");

  // Case H — absolute high payments still Critico nivelRiesgo
  ctx.PRE = { ingreso: 200000, respuestas: AUDIT_SURVEY };
  ctx.CZState = {
    gastos: { vivienda: 40000 },
    deudas: [{
      acreedor: "X",
      monto: "500000",
      pago: "55000",
      tipo: "prestamo",
      situacion_ui: "pagando_normal",
      estado: "al_dia",
      cancelada: false,
      pago_fuente: "declarado",
    }],
  };
  var finHighPay = ctx.calcularFinanciero();
  ok("H totalPago > 50000 → nivelRiesgo Critico", finHighPay.nivelRiesgo === "Critico");

  var algoSrc = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
  ok("I interesProm removed from nivelRiesgo assignment",
    !algoSrc.match(/nivelRiesgo = "Critico";\s*\n\s*else if \(totalPago > 25000 \|\| interesProm/)
    && algoSrc.indexOf("evaluarCostoDeuda") >= 0
    && algoSrc.indexOf("costoDeudaNivel") >= 0);

  console.log("\n--- B6a QA: " + passed + " passed, " + failed + " failed ---");
  if (failed > 0) process.exit(1);
})();
