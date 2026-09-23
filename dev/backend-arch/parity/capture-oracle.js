/**
 * MOTOR-PARITY-00 — capture CURRENT product engine as oracle.
 * Does not modify production code. DEV-only.
 *
 * Usage: node dev/backend-arch/parity/capture-oracle.js
 *
 * Semantics locked by MOTOR-EXTRACTION-01 closed decisions:
 * - D4: completeness recomputed via product hasCompleted* (ignore client flags)
 * - D5: Date.now frozen to input.now_ms for the run
 * - D1: capture core+stage+narrative+acciones+coherence+next_step (+copy AS-IS)
 * - D2: also record FE-layer B7/UX1D2 observables (not ENGINE_CORE)
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var { execSync } = require("child_process");

var defs = require("./fixtures-definitions");
var h = require("../../decision-provenance/harness");

var OUT_DIR = __dirname;
var RESULTS_PATH = path.join(OUT_DIR, "oracle-results.json");
var MANIFEST_PATH = path.join(OUT_DIR, "MANIFEST.json");

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: h.ROOT, encoding: utf8Safe() }).trim();
  } catch (e) {
    return "UNKNOWN";
  }
}

function utf8Safe() {
  return "utf8";
}

function sha256Json(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function applyFrozenNow(ctx, nowMs) {
  var RealDate = ctx.Date;
  var frozen = Number(nowMs);
  ctx.Date = function DateProxy() {
    if (arguments.length === 0) {
      return new RealDate(frozen);
    }
    var args = Array.prototype.slice.call(arguments);
    if (args.length === 1) return new RealDate(args[0]);
    if (args.length === 2) return new RealDate(args[0], args[1]);
    if (args.length === 3) return new RealDate(args[0], args[1], args[2]);
    return new RealDate(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
  };
  ctx.Date.now = function() { return frozen; };
  ctx.Date.parse = RealDate.parse;
  ctx.Date.UTC = RealDate.UTC;
  ctx.Date.prototype = RealDate.prototype;
}

function recomputeCompleteness(ctx, st) {
  // D4 — do not trust client_completeness_flags.
  // Product hasCompleted* mostly *reads* flags set by the funnel. Server-side
  // ownership derives those flags from raw EngineInput the same way a completed
  // funnel would leave them, then evaluates the product predicates.
  var ing = typeof ctx.PRE !== "undefined" ? parseFloat(ctx.PRE.ingreso) : NaN;
  if (!isNaN(ing) && ing > 0) {
    st.financial_income_complete = true;
    if (!st.income_source) st.income_source = "user_input";
  } else {
    st.financial_income_complete = false;
  }

  var nameOk = typeof ctx.hasValidDeclaredName === "function" && ctx.hasValidDeclaredName(st);
  var emailOk = typeof ctx.hasValidDeclaredEmail === "function" && ctx.hasValidDeclaredEmail(st);
  var laboralOk = typeof ctx.hasValidDeclaredLaboral === "function" && ctx.hasValidDeclaredLaboral(st);
  var incomeOk = typeof ctx.hasCompletedIncomeInputs === "function" && ctx.hasCompletedIncomeInputs(st);
  st.financial_profile_complete = !!(incomeOk && nameOk && emailOk && laboralOk);

  if (st.no_debts_declared) {
    st.financial_debts_complete = true;
  } else if (st.deudas && st.deudas.length > 0) {
    st.financial_debts_complete = true;
  } else {
    st.financial_debts_complete = false;
  }

  // Expense completeness: product accepts total>0 without the flag
  // (hasCompletedExpenseInputs). Keep explicit flag only when total>0.
  var expTotal = typeof ctx.getTotalMonthlyExpensesSafe === "function"
    ? ctx.getTotalMonthlyExpensesSafe(st)
    : 0;
  st.financial_expenses_complete = !!(expTotal > 0);

  return {
    financial_income_complete: !!st.financial_income_complete,
    financial_profile_complete: !!st.financial_profile_complete,
    financial_debts_complete: !!st.financial_debts_complete,
    financial_expenses_complete: !!st.financial_expenses_complete,
    hasCompletedFinancialInputs: typeof ctx.hasCompletedFinancialInputs === "function"
      ? !!ctx.hasCompletedFinancialInputs(st)
      : false,
    derived_checks: {
      nameOk: !!nameOk,
      emailOk: !!emailOk,
      laboralOk: !!laboralOk,
      incomeOk: !!incomeOk,
      expTotal: expTotal,
    },
  };
}

function applyCustomExpenses(ctx, custom) {
  if (!custom || !custom.length) {
    ctx.CZState.custom_expenses = [];
    return;
  }
  // Best-effort shape compatible with creditors helpers
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

function runFixture(fx) {
  var input = fx.input;
  var ctx = h.createCtx({ CZ_DECISION_PROVENANCE: !!input.decision_provenance });
  h.loadProduct(ctx);
  applyFrozenNow(ctx, input.now_ms);

  ctx.CZ_PLUS_BCU_CLEARING_LIVE = !!input.bcu_clearing_live;
  if (ctx.window) ctx.window.CZ_PLUS_BCU_CLEARING_LIVE = !!input.bcu_clearing_live;

  ctx.TIENE_ENCUESTA = !!input.tiene_encuesta;
  ctx.CZ_ENTRY_CONTEXT = input.entry_context || "DEFAULT";
  if (ctx.window) ctx.window.CZ_ENTRY_CONTEXT = ctx.CZ_ENTRY_CONTEXT;

  ctx.PRE = {
    ingreso: input.ingreso != null ? input.ingreso : 0,
    respuestas: input.respuestas || {},
    nombre: input.declared_nombre || "QA Synthetic",
    email: input.declared_email || "qa@example.test",
    laboral: input.laboral || input.declared_laboral || "",
  };

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

  // Intentionally ignore misleading client flags (D4)
  var completeness = recomputeCompleteness(ctx, ctx.CZState);

  var diag = ctx.calcularMotor();
  ctx.attachFinancialStageToDiag(diag, ctx.CZState);
  ctx.CZState.diag = diag;

  var coherence = ctx.resolveDashboardCoherence(diag, ctx.CZState);
  if (typeof ctx.attachNextStepProvenance === "function") {
    ctx.attachNextStepProvenance(diag, ctx.CZState, coherence);
  }
  var nextStep = ctx.resolveNextStepContent(diag, ctx.CZState, coherence);

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

  // D2 — FE layer observables (not ENGINE_CORE equality for V1 engine compare,
  // but frozen for full-product UX parity later)
  var b7 = typeof ctx.resolveContextualActionSegment === "function"
    ? ctx.resolveContextualActionSegment(diag, ctx.CZState)
    : null;
  var ux1d2 = typeof ctx._ux1d2ShouldSuppressFlujoNegativoAccion === "function"
    ? ctx._ux1d2ShouldSuppressFlujoNegativoAccion(diag, accionesPost, ctx.CZState)
    : null;
  var accionesCanonical = typeof ctx.resolveCanonicalVisibleAcciones === "function"
    ? ctx.resolveCanonicalVisibleAcciones(diag, ctx.CZState, accionesPost).map(function(a) {
      return { id: a.id, texto: a.texto || null, urgencia: a.urgencia || null, tipo: a.tipo || null };
    })
    : [];

  var fin = diag.fin || {};
  var iv2 = diag.interpretacion_v2 || {};

  var engineResult = {
    planId: diag.planId,
    plan: diag.plan || null,
    nivelR: diag.nivelR,
    scoreReset: diag.scoreReset,
    scoreFinancieroRaw: diag.scoreFinancieroRaw,
    scoreResetRaw: diag.scoreResetRaw,
    guardrail_applied: diag.guardrail_applied,
    guardrail_reason: diag.guardrail_reason || null,
    assigned_plan_raw: diag.assigned_plan_raw,
    assigned_plan_final: diag.assigned_plan_final,
    plan_guardrail_applied: diag.plan_guardrail_applied,
    plan_guardrail_reason: diag.plan_guardrail_reason || null,
    diasRec: diag.diasRec,
    enc: diag.enc || null,
    fin: {
      ingreso: fin.ingreso != null ? fin.ingreso : null,
      totalGastos: fin.totalGastos != null ? fin.totalGastos : null,
      totalDeuda: fin.totalDeuda != null ? fin.totalDeuda : null,
      totalPago: fin.totalPago != null ? fin.totalPago : null,
      flujoLibre: fin.flujoLibre != null ? fin.flujoLibre : null,
      ratio: fin.ratio != null ? fin.ratio : null,
      cantMoras: fin.cantMoras != null ? fin.cantMoras : null,
      dti_ratio: fin.dti_ratio != null ? fin.dti_ratio : null,
      dti_level: fin.dti_level != null ? fin.dti_level : null,
      scoreFinanciero: fin.scoreFinanciero != null ? fin.scoreFinanciero : null,
      costoDeudaNivel: fin.costoDeudaNivel != null ? fin.costoDeudaNivel : null,
      interesProm: fin.interesProm != null ? fin.interesProm : null,
      behavioral: fin.behavioral || null,
    },
    interpretacion: diag.interpretacion || null,
    interpretacion_v2: iv2,
    horizonte: diag.horizonte || null,
    bloqueadores: diag.bloqueadores || null,
    prio: diag.prio ? { tipo: diag.prio.tipo, monto: diag.prio.monto, situacion_ui: diag.prio.situacion_ui } : null,
    financial_reality_warning: diag.financial_reality_warning,
    financial_reality_warning_type: diag.financial_reality_warning_type || null,
    missing_payment_information: diag.missing_payment_information,
    recommended_tools: diag.recommended_tools || [],
    mora_activa: diag.mora_activa,
    deuda_vencida: diag.deuda_vencida,
    flag_demasiadas_deudas: diag.flag_demasiadas_deudas,
    flag_deuda_cara: diag.flag_deuda_cara,
    deuda_fuera_sistema: diag.deuda_fuera_sistema,
    flag_deuda_sin_pagos: diag.flag_deuda_sin_pagos,
    flag_deuda_sanity_extreme: diag.flag_deuda_sanity_extreme,
    financial_stage: diag.financial_stage || null,
    financial_stage_provenance: diag.financial_stage_provenance || null,
    narrative_decision: diag.narrative_decision || null,
    coherence: {
      profileTier: coherence.profileTier,
      nextStepKey: coherence.nextStepKey,
      nextStepText: coherence.nextStepText,
      heroProblemOverride: coherence.heroProblemOverride,
      suppressOrdenarPanorama: coherence.suppressOrdenarPanorama,
      hideAccionPrioritaria: coherence.hideAccionPrioritaria,
    },
    next_step: {
      actionKey: nextStep && nextStep.actionKey != null ? nextStep.actionKey : null,
      text: nextStep && nextStep.text != null ? String(nextStep.text) : null,
      source: nextStep && nextStep.source != null ? nextStep.source : null,
    },
    next_step_provenance: diag.next_step_provenance || null,
    acciones: accionesEngine,
    completeness_recomputed: completeness,
  };

  var feLayer = {
    b7_segmentId: b7 && b7.segmentId ? b7.segmentId : null,
    b7_isInconsistency: !!(b7 && b7.isInconsistency),
    ux1d2_suppressFlujoNegativo: !!(ux1d2 && ux1d2.suppressFlujoNegativo),
    acciones_canonical_visible: accionesCanonical,
  };

  return {
    id: fx.id,
    tags: fx.tags || [],
    notes: fx.notes || null,
    input: input,
    oracle: {
      engine_result: engineResult,
      fe_presentation_layer: feLayer,
    },
  };
}

function main() {
  var fixtures = defs.allParityFixtures();
  var cases = [];
  var errors = [];

  for (var i = 0; i < fixtures.length; i++) {
    try {
      cases.push(runFixture(fixtures[i]));
      process.stdout.write("CAPTURED " + fixtures[i].id + "\n");
    } catch (e) {
      errors.push({ id: fixtures[i].id, message: String(e && e.message ? e.message : e), stack: e && e.stack });
      process.stderr.write("FAIL " + fixtures[i].id + ": " + e + "\n");
    }
  }

  var payload = {
    corpus_id: "MOTOR_PARITY_00",
    oracle: "CURRENT_PRODUCT_ENGINE",
    captured_at: new Date().toISOString(),
    git_head: gitHead(),
    fixed_now_ms: defs.FIXED_NOW_MS,
    decisions: {
      D1_scope: "ENGINE_CORE includes motor+stage+narrative+acciones+coherence+next_step",
      D2_b7: "FRONTEND_PRESENTATION; UX1D2 preserved in fe_presentation_layer",
      D3_copy: "AS-IS copy included in engine_result",
      D4_completeness: "recomputed via product hasCompleted*; client flags ignored",
      D5_clock: "Date.now frozen to input.now_ms (= FIXED_NOW_MS)",
      D6_divergences: "preserved AS-IS",
      D7_parity: "this corpus is the official oracle",
    },
    case_count: cases.length,
    error_count: errors.length,
    cases: cases,
    errors: errors,
  };

  var digest = sha256Json({
    fixed_now_ms: payload.fixed_now_ms,
    cases: cases.map(function(c) {
      return { id: c.id, engine_result: c.oracle.engine_result };
    }),
  });
  payload.corpus_sha256 = digest;

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    corpus_id: payload.corpus_id,
    captured_at: payload.captured_at,
    git_head: payload.git_head,
    fixed_now_ms: payload.fixed_now_ms,
    case_count: payload.case_count,
    error_count: payload.error_count,
    corpus_sha256: payload.corpus_sha256,
    results_file: "oracle-results.json",
    write_once_note: "Re-run capture-oracle.js only when intentionally refreshing oracle after approved engine changes.",
  }, null, 2), "utf8");

  console.log("Wrote", RESULTS_PATH);
  console.log("cases=", cases.length, "errors=", errors.length, "sha256=", digest);
  if (errors.length) process.exit(1);
}

main();
