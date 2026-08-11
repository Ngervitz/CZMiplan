/**
 * Shared VM harness for DECISION-PROVENANCE baseline + QA.
 * Loads product JS the same way as other dev/*-qa.js scripts.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var { execSync } = require("child_process");

var ROOT = path.join(__dirname, "..", "..");

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (e) {
    return "UNKNOWN";
  }
}

function createCtx(opts) {
  opts = opts || {};
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
    Boolean: Boolean,
    URLSearchParams: URLSearchParams,
    localStorage: {
      getItem: function() { return null; },
      setItem: function() {},
      removeItem: function() {},
    },
    sessionStorage: {
      getItem: function() { return null; },
      setItem: function() {},
      removeItem: function() {},
    },
    trackEvent: function() {},
    trackCRMEvent: function() {},
    document: {
      getElementById: function() { return null; },
      querySelectorAll: function() { return []; },
      querySelector: function() { return null; },
      addEventListener: function() {},
      createElement: function() {
        return {
          style: {},
          classList: { add: function() {}, remove: function() {}, contains: function() { return false; } },
          setAttribute: function() {},
          appendChild: function() {},
        };
      },
      body: { appendChild: function() {} },
    },
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.location = { search: "", href: "http://localhost/" };
  ctx._wantDecisionProvenance = !!opts.CZ_DECISION_PROVENANCE;
  return ctx;
}

function load(ctx, file) {
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\bconst /g, "var "),
    ctx,
    { filename: path.join(ROOT, file) }
  );
}

function loadProduct(ctx) {
  load(ctx, "js/config.js");
  load(ctx, "js/creditors.js");
  load(ctx, "js/survey.js");
  load(ctx, "js/algorithms.js");
  load(ctx, "js/actionNarrativeTaxonomy.js");
  load(ctx, "js/events.js");
  load(ctx, "js/crm.js");
  load(ctx, "js/ui.js");
  load(ctx, "js/app.js");
  // config.js defaults the flag to false; re-apply harness override after load.
  if (ctx._wantDecisionProvenance) {
    ctx.CZ_DECISION_PROVENANCE = true;
    if (ctx.window) ctx.window.CZ_DECISION_PROVENANCE = true;
  }
}

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
    declared_nombre: "QA Synthetic",
    declared_laboral: "relacion_dependencia",
    user_email: "qa@example.test",
    no_debts_declared: false,
    deudas: [],
    gastos: { vivienda: 20000, alimentacion: 15000 },
    user_intent: null,
    step: 3,
  }, overrides || {});
}

function debtRow(opts) {
  opts = opts || {};
  return {
    acreedor: opts.acreedor || "Banco QA",
    acreedor_raw: opts.acreedor || "Banco QA",
    monto: String(opts.monto != null ? opts.monto : 0),
    pago: String(opts.pago != null ? opts.pago : 0),
    tipo: opts.tipo || "prestamo",
    situacion_ui: opts.situacion_ui || "pagando_normal",
    estado: opts.estado || "al_dia",
    pago_fuente: opts.pago_fuente || "declarado",
  };
}

function runMotor(ctx, opts) {
  opts = opts || {};
  ctx.PRE = {
    ingreso: opts.ingreso != null ? opts.ingreso : 100000,
    respuestas: opts.respuestas || GOOD_SURVEY,
    nombre: "QA Synthetic",
    email: "qa@example.test",
    laboral: "relacion_dependencia",
  };
  ctx.TIENE_ENCUESTA = true;
  ctx.CZState = completeSt(opts.st);
  if (opts.gastos) ctx.CZState.gastos = opts.gastos;
  if (opts.deudas) ctx.CZState.deudas = opts.deudas;
  if (opts.declared_ingreso != null) ctx.CZState.declared_ingreso = opts.declared_ingreso;
  var diag = ctx.calcularMotor();
  ctx.attachFinancialStageToDiag(diag, ctx.CZState);
  ctx.CZState.diag = diag;
  return diag;
}

/**
 * Acciones finales visibles post-filtros UI (DEC-PROV-01).
 * Prefer product helper when available; fallback mirrors prior harness logic.
 */
function captureVisibleAcciones(ctx, diag, st) {
  if (typeof ctx.resolveCanonicalVisibleAcciones === "function") {
    var canonical = ctx.resolveCanonicalVisibleAcciones(diag, st);
    return (canonical || []).map(function(a) {
      return {
        id: a.id,
        urgencia: a.urgencia || null,
        tipo: a.tipo || null,
      };
    });
  }
  var acciones = typeof ctx.seleccionarAccionesRecomendadas === "function"
    ? ctx.seleccionarAccionesRecomendadas(diag)
    : [];
  if (typeof ctx.applyAccionesPostMotorTransforms === "function") {
    acciones = ctx.applyAccionesPostMotorTransforms(diag, st, acciones);
  } else {
    if (typeof ctx.isIncompleteFinancialProfile === "function"
        && ctx.isIncompleteFinancialProfile(diag, st)) {
      acciones = ctx._filterAccionesForIncompleteProfile(acciones);
    }
    if (diag && diag.planId === 5 && acciones.length < 3
        && typeof ctx._fallbackAccionesPlan5 === "function") {
      var fb5 = ctx._fallbackAccionesPlan5();
      for (var fi = 0; fi < fb5.length && acciones.length < 3; fi++) {
        if (!acciones.some(function(a) { return a.id === fb5[fi].id; })) {
          acciones.push(fb5[fi]);
        }
      }
    }
    if (acciones.length > 5) acciones = acciones.slice(0, 5);
  }
  var suppressFlujo = false;
  if (typeof ctx._ux1d2ShouldSuppressFlujoNegativoAccion === "function") {
    var ux = ctx._ux1d2ShouldSuppressFlujoNegativoAccion(diag, acciones, st);
    suppressFlujo = !!(ux && ux.suppressFlujoNegativo);
  }
  var visible = [];
  for (var i = 0; i < acciones.length; i++) {
    var a = acciones[i];
    if (suppressFlujo && a && a.id === "flujo_negativo_accion") continue;
    visible.push({
      id: a.id,
      urgencia: a.urgencia || null,
      tipo: a.tipo || null,
    });
  }
  return visible;
}

function captureNextStep(ctx, diag, st) {
  var coherence = ctx.resolveDashboardCoherence(diag, st);
  var ns = ctx.resolveNextStepContent(diag, st, coherence);
  var primaryWould = typeof ctx._willRenderPrimaryActionCard === "function"
    ? ctx._willRenderPrimaryActionCard(diag, st, coherence)
    : !!(ns && ns.text);
  return {
    actionKey: ns && ns.actionKey != null ? ns.actionKey : null,
    text: ns && ns.text != null ? String(ns.text) : null,
    source: ns && ns.source != null ? ns.source : null,
    primary_owns_display: !!primaryWould,
  };
}

function captureSurfaces(ctx, diag, st) {
  return {
    financial_stage: diag.financial_stage || null,
    financial_stage_provenance: diag.financial_stage_provenance || null,
    next_step: captureNextStep(ctx, diag, st),
    acciones_visibles: captureVisibleAcciones(ctx, diag, st),
  };
}

module.exports = {
  ROOT: ROOT,
  gitHead: gitHead,
  createCtx: createCtx,
  loadProduct: loadProduct,
  GOOD_SURVEY: GOOD_SURVEY,
  completeSt: completeSt,
  debtRow: debtRow,
  runMotor: runMotor,
  captureVisibleAcciones: captureVisibleAcciones,
  captureNextStep: captureNextStep,
  captureSurfaces: captureSurfaces,
};
