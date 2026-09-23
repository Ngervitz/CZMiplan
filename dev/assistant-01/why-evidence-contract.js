/**
 * Canonical WHY_DIAGNOSIS evidence forms.
 *
 * Source: verification against js/algorithms.js _fsProvenance stamps
 * (2026-08-12). Re-check with why-evidence-drift-a.js before treating
 * this file as still true.
 *
 * TWO TABLES — do not collapse:
 *   STAMP_FORMS     = what the motor stamps (Layer A drift)
 *   SUFFICIENT_FORMS = what ASSISTANT-01 treats as enough to call the LLM
 *
 * Layer B (runtime winner vs stamp) and Layer C (gate vs contract):
 * DEFERRED / incremental. Drift A PASS does not imply sufficiency PASS.
 */
"use strict";

var STAMP_FORMS = {
  FS_INSUFF_INCOME: [["income"]],
  FS_INSUFF_INPUTS: [
    ["has_completed_financial_inputs"],
    ["financial_income_complete", "income"],
    [],
  ],
  FS_INSUFF_FLUJO: [["flujoLibre_missing"]],
  FS_REC_FLUJO_NEG: [["flujoLibre"]],
  FS_REC_CANT_MORAS: [["cantMoras"]],
  FS_REC_DIAG_MORA: [["mora_activa"]],
  FS_REC_IV2_MORA: [["has_mora_or_deje_pagar"]],
  FS_REC_BEHAV_MORA: [["tiene_mora_declarada"]],
  FS_REC_RATIO_ALTO: [["ratio", "threshold"]],
  FS_REC_SEV_CRIT: [["severity_level", "ratio", "totalPago", "threshold_opt_max"]],
  FS_REC_SEV_ALTO: [["severity_level", "ratio", "flujoLibre", "threshold_opt_max"]],
  FS_REC_LATENT: [["severe_latent_pressure", "flujoLibre"]],
  FS_CLARITY_LOW_MISS: [["confidence_level", "missing_payment_information", "flujoLibre"]],
  FS_CLARITY_LOW_PARCIAL: [
    ["confidence_level", "interpretacion_parcial", "no_debts_declared", "has_liabilities"],
    ["confidence_level"],
  ],
  FS_ESTAB_DEUDA: [["totalDeuda"]],
  FS_ESTAB_PAGO: [["totalPago"]],
  FS_ESTAB_DTI: [["dti_ratio", "threshold"]],
  FS_OPT_DEFAULT: [["flujoLibre", "totalDeuda", "totalPago", "dti_ratio"]],
};

var INSUFFICIENT_STAMP_FORMS = {
  FS_INSUFF_INPUTS: [[]],
  FS_CLARITY_LOW_PARCIAL: [["confidence_level"]],
};

var STAGE_LABEL_DEV = {
  CLARIDAD: "claridad",
  RECUPERACION: "recuperación",
  ESTABILIZACION: "estabilización",
  OPTIMIZACION: "optimización",
};

function sortedKeys(keys) {
  return (keys || []).slice().sort();
}

function formId(keys) {
  return sortedKeys(keys).join("\u0001");
}

function uniqueForms(forms) {
  var seen = {};
  var out = [];
  (forms || []).forEach(function (f) {
    var id = formId(f);
    if (seen[id]) return;
    seen[id] = true;
    out.push(sortedKeys(f));
  });
  out.sort(function (a, b) { return formId(a).localeCompare(formId(b)); });
  return out;
}

function sufficientFormsFor(code) {
  var stamps = STAMP_FORMS[code];
  if (!stamps) return [];
  var blocked = {};
  (INSUFFICIENT_STAMP_FORMS[code] || []).forEach(function (f) {
    blocked[formId(f)] = true;
  });
  return stamps.filter(function (f) { return !blocked[formId(f)]; });
}

function evidenceKeys(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [];
  return Object.keys(evidence);
}

function formSatisfied(form, keysPresent) {
  var have = {};
  keysPresent.forEach(function (k) { have[k] = true; });
  for (var i = 0; i < form.length; i++) {
    if (!have[form[i]]) return false;
  }
  return true;
}

/**
 * Sufficiency = at least one SUFFICIENT form's keys are all present.
 * Extra keys are allowed. Empty evidence is never sufficient.
 * Unknown reason_code is fail-closed (insufficient).
 */
function classifyWhyEvidence(reasonCode, evidence) {
  var keys = evidenceKeys(evidence);
  if (!reasonCode || !STAMP_FORMS[reasonCode]) {
    return {
      sufficient: false,
      reason: "UNKNOWN_REASON_CODE",
      reason_code: reasonCode || null,
      evidence_keys: keys,
    };
  }
  var sufficient = sufficientFormsFor(reasonCode);
  for (var i = 0; i < sufficient.length; i++) {
    if (formSatisfied(sufficient[i], keys)) {
      return {
        sufficient: true,
        reason: "SUFFICIENT_FORM",
        reason_code: reasonCode,
        evidence_keys: keys,
        matched_form: sufficient[i],
      };
    }
  }
  return {
    sufficient: false,
    reason: "INSUFFICIENT_FORM",
    reason_code: reasonCode,
    evidence_keys: keys,
  };
}

function whyFallbackCopy(financialStage) {
  var label = STAGE_LABEL_DEV[financialStage] || "tu etapa actual";
  return {
    copy:
      "Tu situación financiera está clasificada en " +
      label +
      ". Con la información disponible no hay detalle suficiente para explicar la causa con precisión.",
    provisional: true,
    copy_id: "WHY_INSUFFICIENT_DEV_V1",
    notes: "DEV provisional. Not closed UX copy.",
  };
}

function actionFallbackCopy(action) {
  var label = (action && (action.texto || action.action_label || action.id)) || "esta acción";
  var urg = action && action.urgencia;
  var copy = "La acción en tu plan es " + label + ".";
  if (urg != null && String(urg).trim() !== "") {
    copy += " Urgencia: " + String(urg).trim() + ".";
  }
  return {
    copy: copy,
    provisional: true,
    copy_id: "EXPLAIN_ACTION_DEV_V1_LABEL_URGENCIA",
    notes: "DEV provisional. No thematic group map. EXPLAIN_ACTION_SEMANTIC_TAXONOMY DEFERRED.",
  };
}

module.exports = {
  STAMP_FORMS: STAMP_FORMS,
  INSUFFICIENT_STAMP_FORMS: INSUFFICIENT_STAMP_FORMS,
  STAGE_LABEL_DEV: STAGE_LABEL_DEV,
  sortedKeys: sortedKeys,
  formId: formId,
  uniqueForms: uniqueForms,
  sufficientFormsFor: sufficientFormsFor,
  classifyWhyEvidence: classifyWhyEvidence,
  whyFallbackCopy: whyFallbackCopy,
  actionFallbackCopy: actionFallbackCopy,
};
