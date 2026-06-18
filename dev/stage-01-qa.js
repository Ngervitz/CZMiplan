/**
 * dev/stage-01-qa.js — STAGE-01 Financial Stage Resolver QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var ctx = vm.createContext({
    window: {},
    global: {},
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isFinite: isFinite,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    URLSearchParams: URLSearchParams,
    localStorage: {
      getItem: function() { return null; },
      setItem: function() {},
      removeItem: function() {},
    },
    trackEvent: function() {},
    trackCRMEvent: function() {},
    document: {
      getElementById: function() { return null; },
      querySelectorAll: function() { return []; },
      addEventListener: function() {},
    },
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.location = { search: "", href: "" };

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
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");
  load("js/app.js");

  var GOOD_SURVEY = {
    p1: "A", p2: "A", p3: "A", p4: "A", p5: "A",
    p6: "A", p7: "A", p8: "A", p9: "A", p10: "A",
  };

  function completeSt(overrides) {
    return Object.assign({
      financial_profile_complete: true,
      financial_income_complete: true,
      financial_debts_complete: true,
      financial_expenses_complete: true,
      income_source: "user_input",
      declared_ingreso: 100000,
      declared_nombre: "Ana Test",
      declared_laboral: "relacion_dependencia",
      user_email: "ana@test.com",
      no_debts_declared: false,
      deudas: [],
      gastos: { vivienda: 20000, alimentacion: 15000 },
      user_intent: null,
    }, overrides || {});
  }

  function debtRow(opts) {
    opts = opts || {};
    return {
      acreedor: opts.acreedor || "Banco",
      acreedor_raw: opts.acreedor || "Banco",
      monto: String(opts.monto != null ? opts.monto : 0),
      pago: String(opts.pago != null ? opts.pago : 0),
      tipo: opts.tipo || "prestamo",
      situacion_ui: opts.situacion_ui || "pagando_normal",
      estado: opts.estado || "al_dia",
      pago_fuente: opts.pago_fuente || "declarado",
    };
  }

  function runMotor(opts) {
    opts = opts || {};
    ctx.PRE = {
      ingreso: opts.ingreso != null ? opts.ingreso : 100000,
      respuestas: opts.respuestas || GOOD_SURVEY,
      nombre: "Ana Test",
      email: "ana@test.com",
      laboral: "relacion_dependencia",
    };
    ctx.TIENE_ENCUESTA = true;
    ctx.CZState = completeSt(opts.st);
    if (opts.gastos) ctx.CZState.gastos = opts.gastos;
    if (opts.deudas) ctx.CZState.deudas = opts.deudas;
    var diag = ctx.calcularMotor();
    ctx.attachFinancialStageToDiag(diag, ctx.CZState);
    return diag;
  }

  function stageOf(opts) {
    return runMotor(opts).financial_stage;
  }

  // A — missing income
  ok("A missing income → CLARIDAD", stageOf({
    ingreso: 0,
    st: { financial_income_complete: false, declared_ingreso: null },
  }) === "CLARIDAD");

  // B — incomplete profile
  ok("B incomplete profile → CLARIDAD", stageOf({
    st: {
      financial_profile_complete: false,
      financial_income_complete: false,
      financial_debts_complete: false,
      financial_expenses_complete: false,
    },
  }) === "CLARIDAD");

  // C — low confidence with unsafe cashflow estimate
  ok("C low confidence unsafe flow → CLARIDAD",
    ctx.resolveFinancialStage({
      fin: { flujoLibre: null, ratio: 0, totalDeuda: 0, totalPago: 0, dti_ratio: 0 },
      interpretacion_v2: { confidence_level: "low" },
    }, completeSt()) === "CLARIDAD");

  // D — positive flow + no debt
  ok("D no debt → OPTIMIZACION", stageOf({
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [],
    st: { no_debts_declared: true },
  }) === "OPTIMIZACION");

  // E — positive flow + low debt (threshold: any declared liability → ESTABILIZACION)
  ok("E low debt → ESTABILIZACION", stageOf({
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [debtRow({ monto: 80000, pago: 8000 })],
  }) === "ESTABILIZACION");

  // F — positive flow + large stock + no active payments
  ok("F large stock no payments → ESTABILIZACION", stageOf({
    ingreso: 80000,
    gastos: { vivienda: 15000, alimentacion: 10000 },
    deudas: [debtRow({ monto: 2400000, pago: 0, pago_fuente: "no_declarado" })],
  }) === "ESTABILIZACION");

  // G — positive flow + large stock + manageable payments
  ok("G large stock manageable payments → ESTABILIZACION", stageOf({
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [debtRow({ monto: 1500000, pago: 12000 })],
  }) === "ESTABILIZACION");

  // H — negative flow + active payments
  ok("H negative flow + payments → RECUPERACION", stageOf({
    ingreso: 80000,
    gastos: { vivienda: 35000, alimentacion: 20000 },
    deudas: [debtRow({ monto: 300000, pago: 30000 })],
  }) === "RECUPERACION");

  // I — near-zero positive flow does not force RECUPERACION
  var nearZero = stageOf({
    ingreso: 80000,
    gastos: { vivienda: 31901, alimentacion: 20000 },
    deudas: [debtRow({ monto: 50000, pago: 27999 })],
    st: { no_debts_declared: false },
  });
  ok("I near-zero positive not RECUPERACION", nearZero !== "RECUPERACION");

  // J — high debt-payment ratio
  ok("J ratio >= 0.35 → RECUPERACION", stageOf({
    ingreso: 80000,
    gastos: { vivienda: 10000, alimentacion: 8000 },
    deudas: [debtRow({ monto: 400000, pago: 30000 })],
  }) === "RECUPERACION");

  // K — moras
  ok("K moras → RECUPERACION", stageOf({
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [debtRow({
      monto: 200000,
      pago: 5000,
      situacion_ui: "mora_reclamo",
      estado: "mora",
    })],
  }) === "RECUPERACION");

  function healthyStageWithMutations() {
    return stageOf({
      ingreso: 120000,
      gastos: { vivienda: 22000, alimentacion: 16000 },
      deudas: [],
      st: { no_debts_declared: true },
    });
  }

  function pressureStageWithMutations() {
    return stageOf({
      ingreso: 70000,
      gastos: { vivienda: 32000, alimentacion: 18000 },
      deudas: [debtRow({ monto: 350000, pago: 28000 })],
    });
  }

  // L — CDV + healthy → OPTIMIZACION
  ok("L CDV healthy → OPTIMIZACION", healthyStageWithMutations() === "OPTIMIZACION");

  // M — CDV + pressure → RECUPERACION
  ok("M CDV pressure → RECUPERACION", pressureStageWithMutations() === "RECUPERACION");

  // N — CDV does not auto-set intent (stage only)
  var cdvPressure = runMotor({
    ingreso: 70000,
    gastos: { vivienda: 32000, alimentacion: 18000 },
    deudas: [debtRow({ monto: 350000, pago: 28000 })],
    st: { user_intent: null },
  });
  ok("N no auto intent on stage attach", ctx.CZState.user_intent == null);

  // O–Q + R–U — user_intent does not affect stage
  var intents = ["RECUPERAR", "ORDENAR", "CREDITO", "OPTIMIZAR"];
  intents.forEach(function(intent) {
    ok("O–Q healthy + " + intent + " → OPTIMIZACION", stageOf({
      ingreso: 120000,
      gastos: { vivienda: 22000, alimentacion: 16000 },
      deudas: [],
      st: { no_debts_declared: true, user_intent: intent },
    }) === "OPTIMIZACION");
    ok("R–U pressure + " + intent + " → RECUPERACION", stageOf({
      ingreso: 70000,
      gastos: { vivienda: 32000, alimentacion: 18000 },
      deudas: [debtRow({ monto: 350000, pago: 28000 })],
      st: { user_intent: intent },
    }) === "RECUPERACION");
  });

  // V — entry_context mutations do not change stage
  var baseHealthy = runMotor({
    ingreso: 120000,
    gastos: { vivienda: 22000, alimentacion: 16000 },
    deudas: [],
    st: { no_debts_declared: true },
  });
  var mutatedSt = completeSt({
    no_debts_declared: true,
    _entry_context_probe: "cdv_rejected",
    _traffic_source_probe: "paid",
  });
  var stageMutated = ctx.resolveFinancialStage(baseHealthy, mutatedSt);
  ok("V entry_context mutation unchanged", stageMutated === baseHealthy.financial_stage);

  // W — invalid user_intent
  ok("W invalid intent ignored", stageOf({
    ingreso: 120000,
    gastos: { vivienda: 22000, alimentacion: 16000 },
    deudas: [],
    st: { no_debts_declared: true, user_intent: "BOGUS" },
  }) === "OPTIMIZACION");

  // X–Z — score / plan / risk unchanged by user_intent
  ctx.CZState = completeSt({ no_debts_declared: true });
  var d0 = runMotor({
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [],
    st: { no_debts_declared: true, user_intent: null },
  });
  var d1 = runMotor({
    ingreso: 100000,
    gastos: { vivienda: 20000, alimentacion: 15000 },
    deudas: [],
    st: { no_debts_declared: true, user_intent: "RECUPERAR" },
  });
  ok("X score unchanged", d0.scoreReset === d1.scoreReset);
  ok("Y plan unchanged", d0.planId === d1.planId);
  ok("Z risk unchanged",
    (d0.interpretacion_v2 && d0.interpretacion_v2.nivel_riesgo) ===
    (d1.interpretacion_v2 && d1.interpretacion_v2.nivel_riesgo));

  // AA — dashboard narrative unchanged
  var narr0 = ctx.renderNarrativaInterpretacion(d0, ctx.CZState);
  ctx.attachFinancialStageToDiag(d1, ctx.CZState);
  d1.financial_stage = "RECUPERACION";
  var narr1 = ctx.renderNarrativaInterpretacion(d1, ctx.CZState);
  ok("AA narrative unchanged", narr0 === narr1);

  // AB — recommendations unchanged
  var rec0 = ctx.renderAccionesRecomendadasHtml(d0);
  var rec1 = ctx.renderAccionesRecomendadasHtml(d1);
  ok("AB recommendations unchanged", rec0 === rec1);

  // Immunity — healthy always OPTIMIZACION
  var entryLabels = ["RECHAZO_CDV", "ORGANICO", "SEO", "DIRECTO"];
  entryLabels.forEach(function(label) {
    intents.concat([null]).forEach(function(intent) {
      var s = stageOf({
        ingreso: 120000,
        gastos: { vivienda: 22000, alimentacion: 16000 },
        deudas: [],
        st: {
          no_debts_declared: true,
          user_intent: intent,
          _probe_entry: label,
        },
      });
      ok("IMM healthy " + label + " intent=" + intent + " → OPTIMIZACION", s === "OPTIMIZACION");
    });
  });

  // Immunity — pressure always RECUPERACION
  entryLabels.forEach(function(label) {
    intents.concat([null]).forEach(function(intent) {
      var s = stageOf({
        ingreso: 70000,
        gastos: { vivienda: 32000, alimentacion: 18000 },
        deudas: [debtRow({ monto: 350000, pago: 28000 })],
        st: { user_intent: intent, _probe_entry: label },
      });
      ok("IMM pressure " + label + " intent=" + intent + " → RECUPERACION", s === "RECUPERACION");
    });
  });

  console.log("\nSTAGE-01 QA: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
})();
