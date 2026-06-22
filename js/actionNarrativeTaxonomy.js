/**
 * actionNarrativeTaxonomy.js — ACTIONS-ARCH-01 narrative taxonomy metadata
 *
 * External immutable taxonomy maps for master-bank actions, next-step keys,
 * B7 contextual segments, and Plan 5 fallback actions.
 */
(function(global) {
  "use strict";

  // GUARDRAIL — ACTIONS-ARCH-01
  // This module provides taxonomy metadata only.
  // It must not intercept, filter, reorder, suppress,
  // prioritize or render actions.
  // It must not consume narrative_decision.
  // It must not alter recommendation behavior.
  // It must not alter CRM, GTM or GA4 payloads.

  var CZ_NARRATIVE_FAMILIES = Object.freeze({
    RECOVERY: "RECOVERY",
    STABILIZATION: "STABILIZATION",
    OPTIMIZATION: "OPTIMIZATION",
    LEARNING: "LEARNING",
    UNIVERSAL: "UNIVERSAL",
    CLARITY: "CLARITY",
  });

  var CZ_NARRATIVE_FAMILY_LIST = Object.freeze([
    CZ_NARRATIVE_FAMILIES.RECOVERY,
    CZ_NARRATIVE_FAMILIES.STABILIZATION,
    CZ_NARRATIVE_FAMILIES.OPTIMIZATION,
    CZ_NARRATIVE_FAMILIES.LEARNING,
    CZ_NARRATIVE_FAMILIES.UNIVERSAL,
    CZ_NARRATIVE_FAMILIES.CLARITY,
  ]);

  function _freezeFamilyArray(families) {
    return Object.freeze(families.slice());
  }

  function _buildFrozenTaxonomyMap(entries) {
    var map = {};
    var key;
    for (key in entries) {
      if (Object.prototype.hasOwnProperty.call(entries, key)) {
        map[key] = _freezeFamilyArray(entries[key]);
      }
    }
    return Object.freeze(map);
  }

  var CZ_MASTER_ACTION_TAXONOMY = _buildFrozenTaxonomyMap({
    verificar_aplicacion_pagos: ["RECOVERY"],
    refinanciacion_temprana: ["RECOVERY"],
    convenio_mora_temprana: ["RECOVERY"],
    negociar_mora_60: ["RECOVERY"],
    verificar_intimacion: ["RECOVERY"],
    contactar_antes_intimacion: ["RECOVERY"],
    bcu_clearing_distintos: ["UNIVERSAL", "LEARNING"],
    bcu_categoria_real: ["LEARNING"],
    bcu_actualizacion_mensual: ["STABILIZATION", "LEARNING"],
    bcu_post_regularizacion: ["STABILIZATION"],
    flujo_libre_positivo: ["STABILIZATION"],
    flujo_negativo_accion: ["RECOVERY"],
    gasto_mayor_categoria: ["RECOVERY"],
    ingresos_extra_consistencia: ["RECOVERY", "LEARNING"],
    historial_6_meses: ["OPTIMIZATION"],
    verificar_antes_solicitar: ["OPTIMIZATION", "LEARNING"],
    bcu_post_regularizacion_recal: ["STABILIZATION"],
    revisar_costos_tarjetas: ["OPTIMIZATION"],
    consolidar_informacion_tarjetas: ["CLARITY", "STABILIZATION"],
    priorizar_deuda_mas_cara: ["STABILIZATION"],
    revisar_conveniencia_refinanciacion: ["STABILIZATION"],
    ordenar_deudas_por_impacto: ["STABILIZATION"],
    comparar_costo_creditos: ["OPTIMIZATION", "STABILIZATION"],
    verificar_actualizacion_historial: ["STABILIZATION", "LEARNING"],
    documentar_regularizaciones: ["STABILIZATION"],
    revisar_historial_antes_credito: ["OPTIMIZATION", "LEARNING"],
    definir_meta_reserva: ["OPTIMIZATION"],
    reservar_parte_flujo: ["OPTIMIZATION"],
    revisar_capacidad_ahorro: ["OPTIMIZATION"],
  });

  var CZ_NEXT_STEP_ACTION_TAXONOMY = _buildFrozenTaxonomyMap({
    liberar_margen: ["RECOVERY"],
    estabilizar_atraso: ["RECOVERY"],
    reducir_costo_prioritaria: ["STABILIZATION"],
    consolidar_deuda: ["STABILIZATION"],
    formalizar_informal: ["STABILIZATION", "LEARNING"],
    definir_primer_paso: ["UNIVERSAL", "LEARNING"],
    ordenar_panorama: ["UNIVERSAL", "LEARNING"],
    confirmar_saldo_stock_deuda: ["STABILIZATION", "LEARNING"],
    mantener_disciplina: ["OPTIMIZATION", "UNIVERSAL"],
    optimizar_deuda_cara: ["OPTIMIZATION"],
    revisar_ingresos: ["RECOVERY"],
    preparar_reintento: ["OPTIMIZATION", "LEARNING"],
  });

  var CZ_B7_SEGMENT_TAXONOMY = _buildFrozenTaxonomyMap({
    S1: ["STABILIZATION", "OPTIMIZATION"],
    S2: ["OPTIMIZATION", "UNIVERSAL"],
    S3: ["STABILIZATION", "LEARNING"],
    S4: ["STABILIZATION", "LEARNING"],
    S5: ["STABILIZATION"],
    S6: ["STABILIZATION", "LEARNING"],
    S7: ["RECOVERY"],
    S8: ["RECOVERY", "LEARNING"],
    S9: ["RECOVERY", "STABILIZATION", "LEARNING"],
    S10: ["RECOVERY", "LEARNING"],
    S11: ["UNIVERSAL", "LEARNING"],
  });

  var CZ_PLAN5_ACTION_TAXONOMY = _buildFrozenTaxonomyMap({
    plan5_atrasos_reportados: ["RECOVERY"],
    plan5_pagos_reflejados: ["STABILIZATION", "LEARNING"],
    plan5_evitar_solicitudes: ["RECOVERY", "STABILIZATION"],
  });

  var CZ_NEXT_STEP_ACTION_KEYS = Object.freeze(Object.keys(CZ_NEXT_STEP_ACTION_TAXONOMY).sort());
  var CZ_PLAN5_ACTION_KEYS = Object.freeze(Object.keys(CZ_PLAN5_ACTION_TAXONOMY).sort());
  var CZ_B7_SEGMENT_KEYS = Object.freeze(Object.keys(CZ_B7_SEGMENT_TAXONOMY).sort());

  var _EMPTY_FAMILIES = Object.freeze([]);

  function isValidNarrativeFamily(family) {
    if (family == null) return false;
    for (var i = 0; i < CZ_NARRATIVE_FAMILY_LIST.length; i++) {
      if (CZ_NARRATIVE_FAMILY_LIST[i] === family) return true;
    }
    return false;
  }

  function normalizeNarrativeFamilies(families) {
    var input = families;
    if (input == null) return _EMPTY_FAMILIES;
    if (typeof input === "string") input = [input];
    if (!Array.isArray(input)) return _EMPTY_FAMILIES;

    var seen = {};
    var out = [];
    for (var i = 0; i < input.length; i++) {
      var family = input[i];
      if (!isValidNarrativeFamily(family)) continue;
      if (seen[family]) continue;
      seen[family] = true;
      out.push(family);
    }
    return out.length ? Object.freeze(out.slice()) : _EMPTY_FAMILIES;
  }

  function _lookupFamilies(map, key) {
    if (!key || !map || !Object.prototype.hasOwnProperty.call(map, key)) {
      return _EMPTY_FAMILIES;
    }
    return map[key];
  }

  function getMasterActionNarrativeFamilies(actionKey) {
    return _lookupFamilies(CZ_MASTER_ACTION_TAXONOMY, actionKey);
  }

  function getNextStepNarrativeFamilies(actionKey) {
    return _lookupFamilies(CZ_NEXT_STEP_ACTION_TAXONOMY, actionKey);
  }

  function getPlan5NarrativeFamilies(actionKey) {
    return _lookupFamilies(CZ_PLAN5_ACTION_TAXONOMY, actionKey);
  }

  /**
   * Resolves taxonomy families for a known action key across master bank,
   * next-step keys, and Plan 5 fallbacks. Unknown keys return [].
   */
  function getActionNarrativeFamilies(actionKey) {
    var master = getMasterActionNarrativeFamilies(actionKey);
    if (master.length) return master;
    var nextStep = getNextStepNarrativeFamilies(actionKey);
    if (nextStep.length) return nextStep;
    return getPlan5NarrativeFamilies(actionKey);
  }

  function getB7SegmentNarrativeFamilies(segmentKey) {
    if (segmentKey == null) return _EMPTY_FAMILIES;
    var normalized = String(segmentKey).trim().toUpperCase();
    return _lookupFamilies(CZ_B7_SEGMENT_TAXONOMY, normalized);
  }

  global.CZ_NARRATIVE_FAMILIES = CZ_NARRATIVE_FAMILIES;
  global.CZ_NARRATIVE_FAMILY_LIST = CZ_NARRATIVE_FAMILY_LIST;
  global.CZ_MASTER_ACTION_TAXONOMY = CZ_MASTER_ACTION_TAXONOMY;
  global.CZ_NEXT_STEP_ACTION_TAXONOMY = CZ_NEXT_STEP_ACTION_TAXONOMY;
  global.CZ_B7_SEGMENT_TAXONOMY = CZ_B7_SEGMENT_TAXONOMY;
  global.CZ_PLAN5_ACTION_TAXONOMY = CZ_PLAN5_ACTION_TAXONOMY;
  global.CZ_NEXT_STEP_ACTION_KEYS = CZ_NEXT_STEP_ACTION_KEYS;
  global.CZ_PLAN5_ACTION_KEYS = CZ_PLAN5_ACTION_KEYS;
  global.CZ_B7_SEGMENT_KEYS = CZ_B7_SEGMENT_KEYS;

  global.isValidNarrativeFamily = isValidNarrativeFamily;
  global.normalizeNarrativeFamilies = normalizeNarrativeFamilies;
  global.getMasterActionNarrativeFamilies = getMasterActionNarrativeFamilies;
  global.getNextStepNarrativeFamilies = getNextStepNarrativeFamilies;
  global.getPlan5NarrativeFamilies = getPlan5NarrativeFamilies;
  global.getActionNarrativeFamilies = getActionNarrativeFamilies;
  global.getB7SegmentNarrativeFamilies = getB7SegmentNarrativeFamilies;

  global.ActionNarrativeTaxonomy = Object.freeze({
    FAMILIES: CZ_NARRATIVE_FAMILIES,
    FAMILY_LIST: CZ_NARRATIVE_FAMILY_LIST,
    MASTER: CZ_MASTER_ACTION_TAXONOMY,
    NEXT_STEP: CZ_NEXT_STEP_ACTION_TAXONOMY,
    B7_SEGMENT: CZ_B7_SEGMENT_TAXONOMY,
    PLAN5: CZ_PLAN5_ACTION_TAXONOMY,
    isValidNarrativeFamily: isValidNarrativeFamily,
    normalizeNarrativeFamilies: normalizeNarrativeFamilies,
    getMasterActionNarrativeFamilies: getMasterActionNarrativeFamilies,
    getNextStepNarrativeFamilies: getNextStepNarrativeFamilies,
    getPlan5NarrativeFamilies: getPlan5NarrativeFamilies,
    getActionNarrativeFamilies: getActionNarrativeFamilies,
    getB7SegmentNarrativeFamilies: getB7SegmentNarrativeFamilies,
  });
})(typeof window !== "undefined" ? window : global);
