/**
 * server/modules/journey/surveyV2Signals.js
 * Credizona survey V2 as received through the JANUS handoff (source_survey_version = 2).
 *
 * V2: P1–P6 + P8 + P10 ordinal A–D (behavioral raw 0–24), P9 = help_receptivity,
 * P7 = loan_purpose (categorical, never scored). Selected only by the explicit version;
 * V1 keeps the legacy engine (calcularEncuesta) and never passes through here.
 * No A/B/C level is derived from the 0–24 raw.
 */
"use strict";

var SURVEY_V2 = 2;
var BEHAVIORAL_KEYS = Object.freeze(["p1", "p2", "p3", "p4", "p5", "p6", "p8", "p10"]);
var ORDINAL_KEYS = Object.freeze(BEHAVIORAL_KEYS.concat(["p9"]));
var BEHAVIORAL_RAW_MAX = 24;
var ORDINAL_POINTS = Object.freeze({ A: 3, B: 2, C: 1, D: 0 });

// Same values as JANUS czSurveyVersion.V2_LOAN_PURPOSE_BY_CODE (E–J), semantic side only.
var LOAN_PURPOSE_VALUES = Object.freeze([
  "purchase_or_home_improvement",
  "unexpected_one_off_expense",
  "debt_management",
  "recurring_expense_shortfall",
  "work_or_business_investment",
  "other",
]);

// Same values as dev/panorama-inicial/signal-catalog.js HELP_RECEPTIVITY.
var HELP_RECEPTIVITY = Object.freeze({ A: "open", B: "selective", C: "limited", D: "autonomous" });

function isOrdinal(v) {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ORDINAL_POINTS, v);
}

/**
 * Strict V2 validation of a survey block (JANUS shape or the sanitized copy).
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateSurveyV2(survey) {
  if (!survey || typeof survey !== "object" || Array.isArray(survey)) {
    return { ok: false, reason: "survey_v2_invalid" };
  }
  if (survey.source_survey_version !== SURVEY_V2) {
    return { ok: false, reason: "not_survey_v2" };
  }
  var respuestas = survey.respuestas;
  if (!respuestas || typeof respuestas !== "object" || Array.isArray(respuestas)) {
    return { ok: false, reason: "survey_v2_incomplete" };
  }
  if (respuestas.p7 != null) {
    return { ok: false, reason: "survey_v2_p7_in_respuestas" };
  }
  for (var i = 0; i < ORDINAL_KEYS.length; i++) {
    var v = respuestas[ORDINAL_KEYS[i]];
    if (v == null) return { ok: false, reason: "survey_v2_incomplete" };
    if (!isOrdinal(v)) return { ok: false, reason: "survey_v2_invalid_answer" };
  }
  if (LOAN_PURPOSE_VALUES.indexOf(survey.loan_purpose) === -1) {
    return { ok: false, reason: "survey_v2_loan_purpose_invalid" };
  }
  var prov = survey.provenance;
  if (prov != null && (typeof prov !== "object" || Array.isArray(prov))) {
    return { ok: false, reason: "survey_v2_provenance_invalid" };
  }
  if (prov && prov.source_survey_version != null && prov.source_survey_version !== SURVEY_V2) {
    return { ok: false, reason: "survey_v2_provenance_mismatch" };
  }
  return { ok: true };
}

/**
 * Structured V2 signals. Not an input of the legacy engine nor of the financial classifier.
 * @returns {{ ok: false, reason: string } | {
 *   ok: true,
 *   survey_version: 2,
 *   behavioral: { questions: string[], answers: object, raw: number, raw_max: number },
 *   help_receptivity: string,
 *   loan_purpose: string,
 *   provenance: object|null,
 * }}
 */
function extractSurveyV2Signals(survey) {
  var valid = validateSurveyV2(survey);
  if (!valid.ok) return valid;
  var answers = {};
  var raw = 0;
  for (var i = 0; i < BEHAVIORAL_KEYS.length; i++) {
    var k = BEHAVIORAL_KEYS[i];
    answers[k] = survey.respuestas[k];
    raw += ORDINAL_POINTS[answers[k]];
  }
  return {
    ok: true,
    survey_version: SURVEY_V2,
    behavioral: {
      questions: BEHAVIORAL_KEYS.slice(),
      answers: answers,
      raw: raw,
      raw_max: BEHAVIORAL_RAW_MAX,
    },
    help_receptivity: HELP_RECEPTIVITY[survey.respuestas.p9],
    loan_purpose: survey.loan_purpose,
    provenance: survey.provenance || null,
  };
}

module.exports = {
  SURVEY_V2: SURVEY_V2,
  BEHAVIORAL_KEYS: BEHAVIORAL_KEYS,
  ORDINAL_KEYS: ORDINAL_KEYS,
  BEHAVIORAL_RAW_MAX: BEHAVIORAL_RAW_MAX,
  LOAN_PURPOSE_VALUES: LOAN_PURPOSE_VALUES,
  HELP_RECEPTIVITY: HELP_RECEPTIVITY,
  validateSurveyV2: validateSurveyV2,
  extractSurveyV2Signals: extractSurveyV2Signals,
};
