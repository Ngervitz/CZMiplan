/**
 * engine/core/pipeline.js — D1 ENGINE_CORE orchestration.
 * Uses product functions loaded in VM (single rule source).
 */
"use strict";

var freezeNow = require("../support/clock").freezeNow;
var recomputeCompleteness = require("../support/completeness").recomputeCompleteness;
var serializeEngineResult = require("../support/serialize-result").serializeEngineResult;
var createProductContext = require("../adapters/product-vm").createProductContext;

var ENGINE_VERSION = "miplan-engine-v1-extract-01";

function applyCustomExpenses(ctx, custom) {
  if (!custom || !custom.length) {
    ctx.CZState.custom_expenses = [];
    return;
  }
  ctx.CZState.custom_expenses = custom.map(function(c) {
    return {
      id: c.id,
      label: c.label || c.id,
      amount: c.amount,
      monto: c.amount,
      included: c.included !== false,
      _included: c.included !== false,
    };
  });
}

/**
 * @param {object} input EngineInput (see MOTOR-EXTRACTION-01 / parity fixtures)
 * @param {object} [opts]
 * @param {number} [opts.now_ms] Override clock; default Date.now() (prod) or input.now_ms for tests
 */
function runEngine(input, opts) {
  opts = opts || {};
  if (!input || typeof input !== "object") {
    throw new Error("ENGINE_INPUT_REQUIRED");
  }

  // D5: server owns clock for valid diagnosis; tests may pass opts.now_ms or input.now_ms
  var nowMs = opts.now_ms != null
    ? Number(opts.now_ms)
    : (input.now_ms != null ? Number(input.now_ms) : Date.now());

  var ctx = createProductContext({
    decision_provenance: !!input.decision_provenance,
  });
  freezeNow(ctx, nowMs);

  // MC-10: BCU live flag is server/config owned via input (for parity fixtures) —
  // never from browser secret stores.
  ctx.CZ_PLUS_BCU_CLEARING_LIVE = !!input.bcu_clearing_live;
  if (ctx.window) ctx.window.CZ_PLUS_BCU_CLEARING_LIVE = !!input.bcu_clearing_live;

  // MC-2: explicit PRE from input (no browser preload)
  ctx.TIENE_ENCUESTA = !!input.tiene_encuesta;
  ctx.CZ_ENTRY_CONTEXT = input.entry_context || "DEFAULT";
  if (ctx.window) ctx.window.CZ_ENTRY_CONTEXT = ctx.CZ_ENTRY_CONTEXT;

  // Match oracle capture-oracle.js PRE assembly (AS-IS parity).
  ctx.PRE = {
    ingreso: input.ingreso != null ? input.ingreso : 0,
    respuestas: input.respuestas || {},
    nombre: input.declared_nombre || "QA Synthetic",
    email: input.declared_email || "qa@example.test",
    laboral: input.laboral || input.declared_laboral || "",
  };

  // MC-1: explicit state bag (no real localStorage)
  ctx.CZState = {
    step: 3,
    gastos: input.gastos || {},
    deudas: input.deudas || [],
    snap: input.snap || null,
    user_intent: input.user_intent != null ? input.user_intent : null,
    declared_nombre: input.declared_nombre || "",
    declared_email: input.declared_email || "",
    declared_laboral: input.declared_laboral || input.laboral || "",
    declared_ingreso: input.declared_ingreso != null ? input.declared_ingreso : input.ingreso,
    no_debts_declared: !!input.no_debts_declared,
    income_source: "user_input",
    user_email: input.declared_email || "qa@example.test",
    herr: { compromisos: {} },
    temporal: {},
  };
  applyCustomExpenses(ctx, input.custom_expenses);

  // D4 / MC-5 — ignore client_completeness_flags
  var completeness = recomputeCompleteness(ctx, ctx.CZState);

  // Core motor
  var diag = ctx.calcularMotor();
  // Stage + narrative
  ctx.attachFinancialStageToDiag(diag, ctx.CZState);
  ctx.CZState.diag = diag;

  // Coherence + next_step (D1)
  var coherence = ctx.resolveDashboardCoherence(diag, ctx.CZState);
  if (typeof ctx.attachNextStepProvenance === "function") {
    ctx.attachNextStepProvenance(diag, ctx.CZState, coherence);
  }
  var nextStep = ctx.resolveNextStepContent(diag, ctx.CZState, coherence);

  // Acciones (D1) — motor selection + post-motor transforms that are part of decision list
  // UX1D2 suppress is FE (D2) and NOT applied here.
  var accionesMotor = typeof ctx.seleccionarAccionesRecomendadas === "function"
    ? ctx.seleccionarAccionesRecomendadas(diag)
    : [];
  var accionesPost = typeof ctx.applyAccionesPostMotorTransforms === "function"
    ? ctx.applyAccionesPostMotorTransforms(diag, ctx.CZState, accionesMotor)
    : accionesMotor.slice();

  var accionesEngine = (accionesPost || []).map(function(a) {
    return {
      id: a.id,
      texto: a.texto || null,
      tipo: a.tipo || null,
      urgencia: a.urgencia || null,
      selection_reason: a.selection_reason || null,
      retention_reason: a.retention_reason || null,
    };
  });

  var engineResult = serializeEngineResult(
    diag, coherence, nextStep, accionesEngine, completeness
  );

  return {
    engine_version: ENGINE_VERSION,
    now_ms: nowMs,
    engine_result: engineResult,
  };
}

module.exports = {
  ENGINE_VERSION: ENGINE_VERSION,
  runEngine: runEngine,
};
