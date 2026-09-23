/**
 * DEV-only mirror of production next-step copy constants.
 *
 * Source of truth remains js/ui.js. This file does NOT invent a catalog.
 * It copies the strings already used to STAMP text_ref (text → id).
 * There is no production function that resolves id → visible copy.
 *
 * Evidence (production, js/ui.js):
 *   CZ_DTI_ACCION_PRIORITARIA          ~1811
 *   _ZERO_ACTIVE_DEBT_NEXT_STEP        ~2116
 *   _REVISAR_INGRESOS_NEXT_STEP        ~2117
 *   L2 healthy_organized copy          ~2424-2429
 *   _NEXT_STEP_KNOWN_TEXTS             ~2475-2486
 *   _nsTextRefForEffectiveText         ~2621-2641  (text → id, not reverse)
 *   _nsTextRefFromCoherence            ~2643-2651
 *   tone re-stamp after swap           ~2841-2846
 *
 * Classification: TEXT_REF_RESOLUTION_GAP for integration readiness.
 */
"use strict";

var KNOWN = {
  liberar_margen: "Identificar qué cuota libera más margen mensual es el paso con mayor impacto inmediato.",
  estabilizar_atraso: "Antes de pensar en nueva financiación, el foco debería estar en estabilizar los atrasos activos.",
  reducir_costo_prioritaria: "Evaluar si hay forma de reducir el costo de la deuda prioritaria puede mejorar el margen disponible.",
  consolidar_deuda: "Consolidar o eliminar la deuda que menos beneficio genera puede simplificar el panorama mensual.",
  formalizar_informal: "Formalizar o reestructurar el compromiso informal reduce presión fuera del sistema y mejora el perfil.",
  definir_primer_paso: "Definir una acción concreta esta semana es más valioso que planificar sin ejecutar.",
  ordenar_panorama: "Ordenar el panorama completo de deudas y flujo es el punto de partida más útil ahora.",
  confirmar_saldo_stock_deuda: "Confirmar el saldo actualizado y definir si esta deuda debe estabilizarse, refinanciarse o atacarse primero.",
  mantener_disciplina: "Mantené el ritmo de pagos actual y utilizá el margen disponible para reducir deuda más rápido si te resulta conveniente.",
  optimizar_deuda_cara: "Priorizá la deuda de mayor costo para reducir intereses innecesarios.",
};

var CONST = {
  revisar_ingresos: "El primer paso es revisar tu situación de ingresos para confirmar si actualmente contás con una fuente de ingresos estable o si necesitás generar una nueva.",
  zero_active_debt: "Revisá periódicamente tus gastos y tu margen disponible para mantener una situación financiera saludable.",
  dti_accion_prioritaria: "Confirmar el saldo actualizado y definir si esta deuda debe estabilizarse, refinanciarse o atacarse primero.",
};

var COH = {
  healthy_alto: "Priorizá la deuda de mayor costo para reducir intereses innecesarios.",
  healthy_mantener: "Mantené el ritmo de pagos actual y utilizá el margen disponible para reducir deuda más rápido si te resulta conveniente.",
};

function resolveTextRefDevOnly(textRef) {
  if (textRef == null || String(textRef).trim() === "") {
    return { ok: false, reason: "empty", copy: null };
  }
  var ref = String(textRef);
  var parts = ref.split(":");
  if (parts.length < 2) {
    return { ok: false, reason: "unknown_format", copy: null };
  }
  var family = parts[0];
  var key = parts.slice(1).join(":");
  if (family === "known" && Object.prototype.hasOwnProperty.call(KNOWN, key)) {
    return { ok: true, reason: "known", copy: KNOWN[key], family: family, key: key };
  }
  if (family === "const" && Object.prototype.hasOwnProperty.call(CONST, key)) {
    return { ok: true, reason: "const", copy: CONST[key], family: family, key: key };
  }
  if (family === "coh" && Object.prototype.hasOwnProperty.call(COH, key)) {
    return { ok: true, reason: "coh", copy: COH[key], family: family, key: key };
  }
  return { ok: false, reason: "unmapped_id", copy: null, family: family, key: key };
}

module.exports = {
  KNOWN: KNOWN,
  CONST: CONST,
  COH: COH,
  resolveTextRefDevOnly: resolveTextRefDevOnly,
  INTEGRATION_READY: false,
  GAP_ID: "TEXT_REF_RESOLUTION_GAP",
  NOTES: [
    "Production stamps text_ref from effective POST-tone text (js/ui.js:2841-2846).",
    "No exported id→copy resolver exists in production.",
    "Fallback known:actionKey (js/ui.js:2639) can stamp a ref even if shown text is not that key's catalog copy.",
    "const:dti_accion_prioritaria and known:confirmar_saldo_stock_deuda share the same copy.",
    "coh:healthy_alto copy equals known:optimizar_deuda_cara; coh:healthy_mantener equals known:mantener_disciplina.",
    "Contract fixtures may include visible_copy already resolved; that does not prove the production pipeline.",
  ],
};
