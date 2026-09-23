/**
 * engine/support/serialize-result.js — shape ENGINE RESULT for parity + FE consumers.
 */
"use strict";

function serializeEngineResult(diag, coherence, nextStep, accionesEngine, completeness) {
  var fin = diag.fin || {};
  var iv2 = diag.interpretacion_v2 || {};
  return {
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
    prio: diag.prio
      ? { tipo: diag.prio.tipo, monto: diag.prio.monto, situacion_ui: diag.prio.situacion_ui }
      : null,
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
}

module.exports = { serializeEngineResult: serializeEngineResult };
