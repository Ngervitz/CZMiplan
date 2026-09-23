/**
 * LAYER 1 — PRE_LLM_GUARDS (DEV-only).
 * Deterministic availability, ranking, EXPLAIN_ACTION disambiguation,
 * and assistant_context allowlist validation.
 *
 * Does not call an LLM. Does not change production behavior.
 */
"use strict";

var whyContract = require("./why-evidence-contract");

var CATALOG = [
  { id: "Q_WHY_STAGE", intent: "WHY_DIAGNOSIS", rank: 1, label: "¿Por qué estoy en esta etapa?" },
  { id: "Q_MAIN_BLOCKER", intent: "MAIN_BLOCKER", rank: 2, label: "¿Qué es lo que más me está frenando?" },
  { id: "Q_EXPLAIN_NEXT_STEP", intent: "EXPLAIN_NEXT_STEP", rank: 3, label: "¿Por qué este es mi próximo paso?" },
  { id: "Q_EXPLAIN_ACTION", intent: "EXPLAIN_ACTION", rank: 4, label: "¿Por qué me recomendás esta acción?" },
];

var ALLOWLIST = {
  WHY_DIAGNOSIS: ["financial_stage", "reason_code", "evidence"],
  MAIN_BLOCKER: ["causa_principal", "patron_deuda", "metrics", "metric_links"],
  EXPLAIN_ACTION: ["action_id", "action_label", "selection_reason", "retention_reason"],
  EXPLAIN_NEXT_STEP: ["value", "text_ref", "visible_copy", "reason_code", "evidence", "tone_code"],
};

var REQUIRED = {
  WHY_DIAGNOSIS: ["financial_stage", "reason_code"],
  MAIN_BLOCKER: ["causa_principal"],
  EXPLAIN_ACTION: ["action_id", "selection_reason"],
  EXPLAIN_NEXT_STEP: ["value", "text_ref", "reason_code"],
};

function _nonEmpty(v) {
  return v != null && String(v).trim() !== "";
}

function isWhyAvailable(snap) {
  return !!(snap && snap.financial_stage_provenance && typeof snap.financial_stage_provenance === "object");
}

function isMainBlockerAvailable(snap) {
  return !!(snap && _nonEmpty(snap.iv2_causa_principal));
}

function isExplainNextStepAvailable(snap) {
  return !!(snap && snap.next_step && snap.next_step.display && snap.next_step.display.status === "visible");
}

function qualifiedActions(snap) {
  var list = (snap && snap.canonical_visible_actions) || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a) continue;
    if (a.ux1d2_suppressed) continue;
    if (!a.selection_reason) continue;
    out.push(a);
  }
  return out;
}

function isExplainActionAvailable(snap) {
  return qualifiedActions(snap).length >= 1;
}

function availabilityMap(snap) {
  return {
    Q_WHY_STAGE: isWhyAvailable(snap),
    Q_MAIN_BLOCKER: isMainBlockerAvailable(snap),
    Q_EXPLAIN_NEXT_STEP: isExplainNextStepAvailable(snap),
    Q_EXPLAIN_ACTION: isExplainActionAvailable(snap),
  };
}

function availableQuestions(snap) {
  var avail = availabilityMap(snap);
  return CATALOG.filter(function(q) { return avail[q.id]; });
}

function rankTop3(snap) {
  return availableQuestions(snap).slice(0, 3);
}

function disambiguationChips(snap) {
  return qualifiedActions(snap).map(function(a) {
    return {
      action_id: a.id,
      label: a.texto || a.id,
      collapsed_ver_mas: !!a.collapsed_ver_mas,
    };
  });
}

function explainActionFallback(selected) {
  return {
    allowed: false,
    reason: "EXPLAIN_ACTION_DETERMINISTIC_FALLBACK",
    selected: selected,
    question_available: true,
    llm_call: false,
    fallback: whyContract.actionFallbackCopy(selected),
  };
}

/**
 * Decide whether an LLM call may be built.
 * selected_action_id is required when multiple EXPLAIN_ACTION candidates exist.
 */
function evaluateLlmCall(intent, snap, opts) {
  opts = opts || {};
  if (intent === "WHY_DIAGNOSIS") {
    if (!isWhyAvailable(snap)) {
      return { allowed: false, reason: "WHY_DIAGNOSIS_UNAVAILABLE" };
    }
    var fs = snap.financial_stage_provenance;
    var whyCls = whyContract.classifyWhyEvidence(fs.reason_code, fs.evidence);
    if (!whyCls.sufficient) {
      var whyFb = whyContract.whyFallbackCopy(fs.value);
      return {
        allowed: false,
        reason: "WHY_DIAGNOSIS_EVIDENCE_INSUFFICIENT",
        question_available: true,
        llm_call: false,
        fallback: whyFb,
        sufficiency: whyCls,
      };
    }
    return { allowed: true, sufficiency: whyCls };
  }
  if (intent === "MAIN_BLOCKER") {
    if (!isMainBlockerAvailable(snap)) {
      return { allowed: false, reason: "MAIN_BLOCKER_UNAVAILABLE" };
    }
    return { allowed: true };
  }
  if (intent === "EXPLAIN_NEXT_STEP") {
    if (!isExplainNextStepAvailable(snap)) {
      return { allowed: false, reason: "EXPLAIN_NEXT_STEP_NOT_VISIBLE" };
    }
    var ref = snap.next_step.text_ref;
    if (!_nonEmpty(ref)) {
      return { allowed: false, reason: "EXPLAIN_NEXT_STEP_TEXT_REF_MISSING" };
    }
    return { allowed: true };
  }
  if (intent === "EXPLAIN_ACTION") {
    var q = qualifiedActions(snap);
    if (q.length === 0) {
      return { allowed: false, reason: "EXPLAIN_ACTION_NO_QUALIFIED" };
    }
    if (q.length > 1 && !_nonEmpty(opts.selected_action_id)) {
      return {
        allowed: false,
        reason: "EXPLAIN_ACTION_NEEDS_DISAMBIGUATION",
        chips: disambiguationChips(snap),
        question_available: true,
      };
    }
    if (_nonEmpty(opts.selected_action_id)) {
      var found = null;
      for (var i = 0; i < q.length; i++) {
        if (q[i].id === opts.selected_action_id) found = q[i];
      }
      if (!found) {
        return { allowed: false, reason: "EXPLAIN_ACTION_SELECTED_NOT_QUALIFIED" };
      }
      return explainActionFallback(found);
    }
    return explainActionFallback(q[0]);
  }
  return { allowed: false, reason: "UNKNOWN_INTENT" };
}

function extraKeys(intent, ctx) {
  var allow = ALLOWLIST[intent] || [];
  var extras = [];
  var keys = Object.keys(ctx || {});
  for (var i = 0; i < keys.length; i++) {
    if (allow.indexOf(keys[i]) === -1) extras.push(keys[i]);
  }
  return extras;
}

function missingRequired(intent, ctx) {
  var req = REQUIRED[intent] || [];
  var miss = [];
  for (var i = 0; i < req.length; i++) {
    var k = req[i];
    var v = ctx && ctx[k];
    if (k === "evidence" || k === "metrics" || k === "selection_reason") {
      if (v == null) miss.push(k);
    } else if (k === "text_ref") {
      if (v == null || String(v).trim() === "") miss.push(k);
    } else if (!_nonEmpty(v) && typeof v !== "object") {
      miss.push(k);
    } else if (v == null) {
      miss.push(k);
    }
  }
  return miss;
}

function validateAssistantContext(intent, ctx) {
  if (!ALLOWLIST[intent]) {
    return { ok: false, reason: "UNKNOWN_INTENT", extras: [], missing: [] };
  }
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) {
    return { ok: false, reason: "INVALID_DTO", extras: [], missing: REQUIRED[intent].slice() };
  }
  var extras = extraKeys(intent, ctx);
  var missing = missingRequired(intent, ctx);
  if (extras.length) {
    return { ok: false, reason: "CONTEXT_BUILDER_GAP_EXTRA_FIELDS", extras: extras, missing: missing };
  }
  if (missing.length) {
    return { ok: false, reason: "CONTEXT_BUILDER_GAP_MISSING_REQUIRED", extras: extras, missing: missing };
  }
  return { ok: true, extras: [], missing: [] };
}

function buildAssistantContext(intent, snap, opts) {
  opts = opts || {};
  var call = evaluateLlmCall(intent, snap, opts);
  if (!call.allowed) {
    return { ok: false, pre_llm: call, context: null };
  }
  var ctx = null;
  if (intent === "WHY_DIAGNOSIS") {
    var fs = snap.financial_stage_provenance;
    ctx = {
      financial_stage: fs.value,
      reason_code: fs.reason_code,
      evidence: fs.evidence || {},
    };
  } else if (intent === "MAIN_BLOCKER") {
    ctx = {
      causa_principal: snap.iv2_causa_principal,
      patron_deuda: snap.patron_deuda != null ? snap.patron_deuda : null,
      metrics: {},
      metric_links: [],
    };
  } else if (intent === "EXPLAIN_ACTION") {
    var act = call.selected;
    ctx = {
      action_id: act.id,
      action_label: act.texto || act.id,
      selection_reason: act.selection_reason,
      retention_reason: act.retention_reason != null ? act.retention_reason : null,
    };
  } else if (intent === "EXPLAIN_NEXT_STEP") {
    var ns = snap.next_step;
    ctx = {
      value: ns.value,
      text_ref: ns.text_ref,
      visible_copy: ns.visible_copy != null ? ns.visible_copy : null,
      reason_code: ns.reason_code,
      evidence: ns.evidence || {},
      tone_code: ns.tone_code != null ? ns.tone_code : null,
    };
  }
  var val = validateAssistantContext(intent, ctx);
  if (!val.ok) {
    return { ok: false, pre_llm: call, context: ctx, validation: val };
  }
  return { ok: true, pre_llm: call, context: ctx, validation: val };
}

module.exports = {
  CATALOG: CATALOG,
  ALLOWLIST: ALLOWLIST,
  REQUIRED: REQUIRED,
  isWhyAvailable: isWhyAvailable,
  isMainBlockerAvailable: isMainBlockerAvailable,
  isExplainNextStepAvailable: isExplainNextStepAvailable,
  isExplainActionAvailable: isExplainActionAvailable,
  qualifiedActions: qualifiedActions,
  availabilityMap: availabilityMap,
  availableQuestions: availableQuestions,
  rankTop3: rankTop3,
  disambiguationChips: disambiguationChips,
  evaluateLlmCall: evaluateLlmCall,
  validateAssistantContext: validateAssistantContext,
  buildAssistantContext: buildAssistantContext,
  classifyWhyEvidence: whyContract.classifyWhyEvidence,
  whyFallbackCopy: whyContract.whyFallbackCopy,
  actionFallbackCopy: whyContract.actionFallbackCopy,
};
