/**
 * server/modules/journey/sanitizeContext.js
 * Allowlist JANUS handoff context before durable store / FE return.
 * Never persist raw handoff_code or CI.
 */
"use strict";

var surveyV2 = require("./surveyV2Signals");

function clampStr(raw, maxLen) {
  if (raw == null) return null;
  var s = String(raw).trim();
  if (s === "") return null;
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function sanitizePerson(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var out = {};
  var nombre = clampStr(raw.nombre, 128);
  var apellido = clampStr(raw.apellido, 128);
  var email = clampStr(raw.email, 128);
  var celular = clampStr(raw.celular, 32);
  var fecha = clampStr(raw.fecha_nacimiento, 32);
  if (nombre) out.nombre = nombre;
  if (apellido) out.apellido = apellido;
  if (email) out.email = email;
  if (celular) out.celular = celular;
  if (fecha) out.fecha_nacimiento = fecha;
  // Explicitly never copy ci / cedula
  return Object.keys(out).length ? out : null;
}

function sanitizeFinancial(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var out = {};
  if (raw.ingreso != null && Number.isFinite(Number(raw.ingreso))) {
    out.ingreso = Number(raw.ingreso);
  }
  var laboral = clampStr(raw.laboral, 64);
  if (laboral) out.laboral = laboral;
  var rawLab = clampStr(raw.laboral_source_raw, 64);
  if (rawLab) out.laboral_source_raw = rawLab;
  return Object.keys(out).length ? out : null;
}

// V1 keeps the pre-versioning allowlist (per-answer A–D filter) unchanged.
function sanitizeSurveyV1(raw) {
  var respuestasIn = raw.respuestas;
  if (!respuestasIn || typeof respuestasIn !== "object") return null;
  var keys = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"];
  var respuestas = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = clampStr(respuestasIn[k], 8);
    if (!v) continue;
    v = v.toUpperCase();
    if (v !== "A" && v !== "B" && v !== "C" && v !== "D") continue;
    respuestas[k] = v;
  }
  if (!Object.keys(respuestas).length) return null;
  var out = {
    selection_rule: clampStr(raw.selection_rule, 64) || "lifetime_ci",
    source_survey_version: 1,
    respuestas: respuestas,
  };
  var completed = clampStr(raw.completed_at, 64);
  if (completed) out.completed_at = completed;
  return out;
}

// V2: P7 travels only as loan_purpose; strict, no partial survey.
function sanitizeSurveyV2(raw) {
  var valid = surveyV2.validateSurveyV2(raw);
  if (!valid.ok) return { survey: null, reason: valid.reason };
  var respuestas = {};
  surveyV2.ORDINAL_KEYS.forEach(function (k) {
    respuestas[k] = raw.respuestas[k];
  });
  var out = {
    selection_rule: clampStr(raw.selection_rule, 64) || "lifetime_ci",
    source_survey_version: surveyV2.SURVEY_V2,
    respuestas: respuestas,
    loan_purpose: raw.loan_purpose,
    provenance: { source_survey_version: surveyV2.SURVEY_V2 },
  };
  var src = raw.provenance ? clampStr(raw.provenance.source_system, 64) : null;
  if (src) out.provenance.source_system = src;
  var completed = clampStr(raw.completed_at, 64);
  if (completed) out.completed_at = completed;
  return { survey: out, reason: null };
}

/**
 * Survey block selected only by the explicit source_survey_version (never by the answers).
 * Missing, unknown or invalid → no survey plus a PII-free reason; never a V1 fallback.
 */
function sanitizeSurvey(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { survey: null, rejected: null };
  }
  var version = raw.source_survey_version;
  if (version === 1) {
    var v1 = sanitizeSurveyV1(raw);
    return v1
      ? { survey: v1, rejected: null }
      : { survey: null, rejected: { reason: "survey_v1_invalid", source_survey_version: 1 } };
  }
  if (version === surveyV2.SURVEY_V2) {
    var v2 = sanitizeSurveyV2(raw);
    return v2.survey
      ? { survey: v2.survey, rejected: null }
      : { survey: null, rejected: { reason: v2.reason, source_survey_version: surveyV2.SURVEY_V2 } };
  }
  return {
    survey: null,
    rejected: {
      reason: version == null ? "survey_version_missing" : "survey_version_unknown",
      source_survey_version: null,
    },
  };
}

// JANUS explicit withheld outcome (e.g. survey_v2_handoff_disabled). PII-free.
function sanitizeSurveyHandoff(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.status !== "withheld") return null;
  var reason = clampStr(raw.reason, 64);
  if (!reason || !/^[a-z0-9_]+$/.test(reason)) return null;
  var v = raw.source_survey_version;
  return {
    status: "withheld",
    reason: reason,
    source_survey_version: v === 1 || v === 2 ? v : null,
  };
}

/**
 * @param {object} raw
 * @returns {object|null}
 */
function sanitizeHandoffContext(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  var ctxIn = raw.context && typeof raw.context === "object" ? raw.context : {};
  var provIn =
    raw.provenance && typeof raw.provenance === "object" ? raw.provenance : {};

  var out = {
    contract_version: 1,
    context: {
      funnel: clampStr(ctxIn.funnel, 64) || "credizona_rejected",
    },
    provenance: {},
  };

  var ert = clampStr(ctxIn.external_ref_type, 32);
  var er = clampStr(ctxIn.external_ref, 128);
  if (ert) out.context.external_ref_type = ert;
  if (er) out.context.external_ref = er;
  var issued = clampStr(ctxIn.issued_at, 64);
  if (issued) out.context.issued_at = issued;

  var src = clampStr(provIn.source_system, 64);
  if (src) out.provenance.source_system = src;
  var synced = clampStr(provIn.synced_at, 64);
  if (synced) out.provenance.synced_at = synced;
  if (!Object.keys(out.provenance).length) {
    out.provenance = { source_system: "janus" };
  }

  var person = sanitizePerson(raw.person);
  if (person) out.person = person;
  var financial = sanitizeFinancial(raw.financial_prefill);
  if (financial) out.financial_prefill = financial;
  var survey = sanitizeSurvey(raw.survey);
  if (survey.survey) out.survey = survey.survey;
  if (survey.rejected) out.survey_rejected = survey.rejected;
  var surveyHandoff = sanitizeSurveyHandoff(raw.survey_handoff);
  if (surveyHandoff) out.survey_handoff = surveyHandoff;

  return out;
}

/**
 * Map A3 funnel → commercial originator (ENTRY / INTEGRATION audit).
 */
function commercialOriginatorForFunnel(funnel) {
  if (funnel === "credizona_rejected") return "COPANEL_CREDIZONA";
  return null;
}

module.exports = {
  sanitizeHandoffContext: sanitizeHandoffContext,
  commercialOriginatorForFunnel: commercialOriginatorForFunnel,
};
