/**
 * PANORAMA INICIAL — user-facing signal catalog v3 (DEV, PANORAMA-INICIAL-03-E).
 *
 * Data only. `concept` is an internal QA description, never user-facing text.
 * This catalog holds ONLY user-facing namespaces (POS_/ATT_/MID_/DEF_/NEU_).
 * Internal signals (ISIG_) live in internal-signal-catalog.js and must never
 * be required from here.
 *
 * Model: "perfil de hábitos y disposición financiera autodeclarados".
 * Not financial situation, credit risk, capacity, stability or financial_stage.
 */
"use strict";

var CATALOG_VERSION = "psc-dev-v3";
var BEHAVIORAL_MODEL_VERSION = "bhv-raw27-v1";

// Same mapping as p2n() in js/survey.js (parity asserted by harness).
var LETTER_POINTS = Object.freeze({ A: 3, B: 2, C: 1, D: 0 });
var LETTERS = Object.freeze(["A", "B", "C", "D"]);

var SURVEY_QUESTIONS = Object.freeze(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
// P9 excluded (help_receptivity). P7 included in raw only.
var RAW_QUESTIONS = Object.freeze(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p10"]);
var RAW_MAX = 27;

var HELP_RECEPTIVITY = Object.freeze({ A: "open", B: "selective", C: "limited", D: "autonomous" });
var WORRY_LEVEL = Object.freeze({ A: "low", B: "moderate", C: "high", D: "very_high" });
var ATTRIBUTION = Object.freeze({ A: "internal", B: "mostly_internal", C: "mostly_external", D: "external" });

var INDEPENDENT_FLAGS = Object.freeze([
  Object.freeze({ flag: "informal_borrowing_recent", question: "p6", answer: "D" }),
  Object.freeze({ flag: "no_action_after_setback", question: "p8", answer: "D" }),
  Object.freeze({ flag: "low_habit_consistency", question: "p10", answer: "D" }),
]);

// Questions that never produce a behavioral signal.
var ROLE_ONLY_QUESTIONS = Object.freeze({
  p3: "tone.attribution",
  p5: "tone.worry_level",
  p9: "tone.help_receptivity",
});

var USER_NAMESPACES = Object.freeze(["POS_", "ATT_", "MID_", "DEF_", "NEU_"]);
var CLASS_PREFIX = Object.freeze({ strength: "POS_", attention: "ATT_", intermediate: "MID_", deferred: "DEF_", neutral: "NEU_" });

// Attention level is a class rule: flags first, "moderate" never reads as alarm.
var ATTENTION_LEVEL_RANK = Object.freeze({ flag: 0, clear: 1, moderate: 2 });

// Complementarity dimension, by question. Used only for diversity between
// selected signals; it never expresses a relation between them.
var DIMENSION_BY_QUESTION = Object.freeze({
  p1: "day_to_day_management",
  p10: "day_to_day_management",
  p2: "saving_and_buffer",
  p4: "saving_and_buffer",
  p6: "facing_difficulties",
  p8: "facing_difficulties",
  p7: "deferred",
});

// Panorama rules: YES | NO | CONDITIONAL | DEFERRED.
// CONDITIONAL is resolved in Layer 2 against confirmed context only.
var PANORAMA_CONDITIONS = Object.freeze({
  rejection_context: Object.freeze({
    context_key: "rejection_context",
    reason_code: "CONDITION_REJECTION_CONTEXT",
  }),
});

// Only surfaced if already shown in Panorama or brought up by the person.
var SENSITIVE_SIGNALS = Object.freeze(["MID_INFORMAL_BORROWING_ONCE", "ATT_INFORMAL_BORROWING_RECENT"]);

function sig(id, question, answer, cls, level, priority, group, panorama, condition, concept) {
  return Object.freeze({
    signal_id: id,
    question: question,
    answer: answer,
    class: cls,
    attention_level: level,
    priority: priority,
    semantic_group: group,
    dimension: DIMENSION_BY_QUESTION[question],
    panorama: panorama,
    panorama_condition: condition,
    user_facing: cls !== "deferred",
    assistant: cls === "deferred" ? "DEFERRED" : cls === "neutral" ? "CONDITIONAL_LITERAL_KNOWN" : "CONDITIONAL_HABITS_INTENT",
    analytics: true,
    sensitive: SENSITIVE_SIGNALS.indexOf(id) >= 0,
    concept: concept,
  });
}

// priority: fixed final tie-break only (lower first), scoped per class.
// semantic_group: at most one selected signal per group (dedup).
var SIGNALS = Object.freeze([
  sig("POS_CASHFLOW_CLEAR", "p1", "A", "strength", null, 1, "cashflow_awareness", "YES", null, "p1=A declara controlar y revisar entradas/salidas"),
  sig("MID_CASHFLOW_MOSTLY_CLEAR", "p1", "B", "intermediate", null, 7, "cashflow_awareness", "NO", null, "p1=B idea bastante clara, con imprecisión reconocida"),
  sig("MID_CASHFLOW_GENERAL_ONLY", "p1", "C", "intermediate", null, 7, "cashflow_awareness", "NO", null, "p1=C idea general de entradas/salidas"),
  sig("ATT_CASHFLOW_UNTRACKED", "p1", "D", "attention", "clear", 5, "cashflow_awareness", "YES", null, "p1=D casi nunca lleva registro"),

  sig("POS_EMERGENCY_SAVINGS", "p2", "A", "strength", null, 3, "emergency_buffer", "YES", null, "p2=A cubriría un imprevisto con ahorros de emergencia"),
  sig("MID_EMERGENCY_SAVINGS_WITH_ADJUSTMENT", "p2", "B", "intermediate", null, 8, "emergency_buffer", "NO", null, "p2=B cubriría con ahorros ajustando gastos"),
  sig("ATT_EMERGENCY_HARD", "p2", "C", "attention", "moderate", 8, "emergency_buffer", "YES", null, "p2=C baja preparación declarada ante un imprevisto"),
  sig("ATT_EMERGENCY_WOULD_BORROW", "p2", "D", "attention", "clear", 4, "borrowing", "YES", null, "p2=D ante un imprevisto tendría que pedir prestado (hipotético)"),

  sig("POS_EXTRA_INCOME_SAVED", "p4", "A", "strength", null, 4, "extra_income_use", "YES", null, "p4=A intención de destinar extra a ahorro/compromisos"),
  sig("MID_EXTRA_INCOME_SPLIT", "p4", "B", "intermediate", null, 9, "extra_income_use", "NO", null, "p4=B repartiría extra entre ahorro y gasto"),
  sig("ATT_EXTRA_INCOME_UNPLANNED", "p4", "D", "attention", "clear", 6, "extra_income_use", "YES", null, "p4=D el ingreso extra se va sin plan"),

  sig("POS_NO_INFORMAL_BORROWING", "p6", "A", "strength", null, 6, "informal_borrowing", "NO", null, "p6=A no pidió prestado informalmente en el último año (favorable, débil para Panorama)"),
  sig("MID_INFORMAL_BORROWING_ONCE", "p6", "C", "intermediate", null, 11, "borrowing", "NO", null, "p6=C pidió una vez en el último año (sensible)"),
  sig("ATT_INFORMAL_BORROWING_RECENT", "p6", "D", "attention", "flag", 2, "borrowing", "YES", null, "p6=D pidió varias veces en el último año (flag)"),

  sig("DEF_DEBT_HORIZON_CLEAR", "p7", "A", "deferred", null, null, "debt_horizon", "DEFERRED", null, "p7=A retenida; presupone deudas"),
  sig("DEF_DEBT_HORIZON_PARTIAL", "p7", "B", "deferred", null, null, "debt_horizon", "DEFERRED", null, "p7=B retenida; presupone deudas"),
  sig("DEF_DEBT_HORIZON_OVER", "p7", "C", "deferred", null, null, "debt_horizon", "DEFERRED", null, "p7=C retenida; presupone deudas"),
  sig("DEF_DEBT_HORIZON_UNKNOWN", "p7", "D", "deferred", null, null, "debt_horizon", "DEFERRED", null, "p7=D retenida; presupone deudas"),

  // P8 presupposes a rejection or difficulty; only rejection entries confirm one exists.
  sig("NEU_ACTED_AFTER_SETBACK", "p8", "A", "neutral", null, null, "action_after_setback", "NO", null, "p8=A declaró haber tomado alguna acción ante el escenario planteado; no se sabe qué hizo, si fue buena o mala decisión ni si resolvió algo. Nunca strength ni attention"),
  sig("MID_SOUGHT_INFORMATION", "p8", "B", "intermediate", null, 10, "action_after_setback", "NO", null, "p8=B averiguó, sin avanzar mucho"),
  sig("ATT_ACTION_CONSIDERED_NOT_TAKEN", "p8", "C", "attention", "moderate", 10, "action_after_setback", "CONDITIONAL", "rejection_context", "p8=C pensó hacerlo, no lo hizo"),
  sig("ATT_NO_ACTION_AFTER_SETBACK", "p8", "D", "attention", "flag", 1, "action_after_setback", "CONDITIONAL", "rejection_context", "p8=D declaró no haber tomado acción ante el escenario planteado (flag). En rechazo: hubo rechazo y la persona declaró no actuar; no se sabe por qué, si debía actuar ni si actuar habría sido mejor"),

  sig("POS_HABIT_CONSISTENCY", "p10", "A", "strength", null, 2, "habit_consistency", "YES", null, "p10=A constancia declarada en hábitos"),
  sig("ATT_HABIT_CONSISTENCY_HARD", "p10", "C", "attention", "moderate", 9, "habit_consistency", "YES", null, "p10=C dificultad declarada para sostener hábitos"),
  sig("ATT_LOW_HABIT_CONSISTENCY", "p10", "D", "attention", "flag", 3, "habit_consistency", "YES", null, "p10=D casi nunca sostiene hábitos (flag)"),
]);

// Answers that intentionally produce no signal.
var NO_SIGNAL_ANSWERS = Object.freeze([
  Object.freeze({ question: "p4", answer: "C", why: "gustos o pendientes: elección legítima, no informativa" }),
  Object.freeze({ question: "p6", answer: "B", why: "consideración hipotética, no hecho" }),
  Object.freeze({ question: "p10", answer: "B", why: "punto medio típico" }),
]);

// Authorized contextual relevance rules (change order, never facts). None since
// 03-E: the only rule boosted POS_TOOK_ACTION, which no longer exists.
var CONTEXT_RELEVANCE = Object.freeze([]);

var SELECTION_LIMITS = Object.freeze({
  max_total: 3,
  max_attention: 2,
  max_strength_with_attention: 1,
  max_strength_without_attention: 2,
});

// Reserved for a future presentation layer. Never a signal, never selected.
var NEUTRAL_TRANSITION_ID = "NEU_NEUTRAL_TRANSITION";

// Mi Plan profile values (js/config.js BASIC_PROFILE_LABORAL_OPTIONS) → context.
var PROFILE_EMPLOYMENT = Object.freeze({
  relacion_dependencia: "employee",
  monotributista: "self_employed",
  jubilado: "retired",
  desempleado: "no_fixed_income",
});
// Credizona relacion_laboral codes (CreditovalorConstantes::RelacionesLaborales).
var SOURCE_EMPLOYMENT = Object.freeze({
  EPR: "employee",
  EPU: "employee",
  JUB: "retired",
  ISL: "self_employed",
  ICL: "self_employed",
  OTR: "other",
});
var LEGACY_PROFILE_VALUES = Object.freeze(["responsable_inscripto", "informal"]);
var EMPLOYMENT_CONTEXTS = Object.freeze(["employee", "retired", "self_employed", "no_fixed_income", "other", "unknown"]);
// Vocabulary-only personalization is allowed for these, with confirmed origin.
var EMPLOYMENT_VOCABULARY_ALLOWED = Object.freeze(["employee", "retired", "self_employed"]);

// Real entry sources in Mi Plan (js/config.js normalizeEntryContext, journey credizona_rejected).
var ENTRY_KINDS = Object.freeze({
  credizona_rejected: Object.freeze({ rejection_context: true }),
  cdv_rejected: Object.freeze({ rejection_context: true }),
  seo_organic: Object.freeze({ rejection_context: false }),
  organic: Object.freeze({ rejection_context: false }),
});

var USER_INTENTS = Object.freeze(["RECUPERAR", "ORDENAR", "CREDITO", "OPTIMIZAR"]);

// Observed context, not a signal: never enters the selector, never fills a slot.
// Mi Plan steps that prove the person continued in the flow (caller-asserted).
var ENGAGEMENT_STEPS = Object.freeze(["panorama_inicial"]);
var ENGAGEMENT_CONTEXT = Object.freeze({
  context_id: "ENGAGEMENT_CONTINUED_IN_MIPLAN",
  known: Object.freeze([
    "decided_to_continue_with_miplan",
    "actively_participating_in_this_flow",
    "rejection_handoff_completed_steps_to_reach_miplan_and_continued",
  ]),
  not_authorized: Object.freeze([
    "committed_to_change", "has_discipline", "good_financial_behavior", "wants_to_order_finances",
    "will_make_good_decisions", "will_improve", "higher_payment_capacity", "lower_risk",
    "needs_loan", "does_not_need_loan", "more_committed_than_others", "comparison_with_people_who_left",
    "reinterprets_p8",
  ]),
});
// entry.rejection_context → provenance of the observed path. Never a ranking.
var ENGAGEMENT_PATHS = Object.freeze({ "true": "rejection_handoff", "false": "virgin_entry", unknown: "unknown_entry" });

var _byId = {};
var _byQA = {};
SIGNALS.forEach(function(s) {
  _byId[s.signal_id] = s;
  _byQA[s.question + ":" + s.answer] = s;
});

function getSignal(id) {
  return Object.prototype.hasOwnProperty.call(_byId, id) ? _byId[id] : null;
}

function signalFor(question, answer) {
  var k = question + ":" + answer;
  return Object.prototype.hasOwnProperty.call(_byQA, k) ? _byQA[k] : null;
}

// Resolves Panorama eligibility for one catalog entry against confirmed context.
function resolvePanorama(def, context) {
  if (def.panorama === "YES") return { eligible: true, reason_code: "PANORAMA_YES", condition_met: null };
  if (def.panorama === "CONDITIONAL") {
    var cond = PANORAMA_CONDITIONS[def.panorama_condition];
    var met = !!(cond && context && context[cond.context_key] === true);
    return { eligible: met, reason_code: met ? cond.reason_code + "_MET" : cond.reason_code + "_NOT_MET", condition_met: met };
  }
  if (def.panorama === "DEFERRED") return { eligible: false, reason_code: "PANORAMA_DEFERRED", condition_met: null };
  return { eligible: false, reason_code: "PANORAMA_NO", condition_met: null };
}

module.exports = {
  CATALOG_VERSION: CATALOG_VERSION,
  BEHAVIORAL_MODEL_VERSION: BEHAVIORAL_MODEL_VERSION,
  LETTER_POINTS: LETTER_POINTS,
  LETTERS: LETTERS,
  SURVEY_QUESTIONS: SURVEY_QUESTIONS,
  RAW_QUESTIONS: RAW_QUESTIONS,
  RAW_MAX: RAW_MAX,
  HELP_RECEPTIVITY: HELP_RECEPTIVITY,
  WORRY_LEVEL: WORRY_LEVEL,
  ATTRIBUTION: ATTRIBUTION,
  INDEPENDENT_FLAGS: INDEPENDENT_FLAGS,
  ROLE_ONLY_QUESTIONS: ROLE_ONLY_QUESTIONS,
  USER_NAMESPACES: USER_NAMESPACES,
  CLASS_PREFIX: CLASS_PREFIX,
  ATTENTION_LEVEL_RANK: ATTENTION_LEVEL_RANK,
  DIMENSION_BY_QUESTION: DIMENSION_BY_QUESTION,
  PANORAMA_CONDITIONS: PANORAMA_CONDITIONS,
  SIGNALS: SIGNALS,
  NO_SIGNAL_ANSWERS: NO_SIGNAL_ANSWERS,
  CONTEXT_RELEVANCE: CONTEXT_RELEVANCE,
  SELECTION_LIMITS: SELECTION_LIMITS,
  NEUTRAL_TRANSITION_ID: NEUTRAL_TRANSITION_ID,
  PROFILE_EMPLOYMENT: PROFILE_EMPLOYMENT,
  SOURCE_EMPLOYMENT: SOURCE_EMPLOYMENT,
  LEGACY_PROFILE_VALUES: LEGACY_PROFILE_VALUES,
  EMPLOYMENT_CONTEXTS: EMPLOYMENT_CONTEXTS,
  EMPLOYMENT_VOCABULARY_ALLOWED: EMPLOYMENT_VOCABULARY_ALLOWED,
  ENTRY_KINDS: ENTRY_KINDS,
  USER_INTENTS: USER_INTENTS,
  ENGAGEMENT_STEPS: ENGAGEMENT_STEPS,
  ENGAGEMENT_CONTEXT: ENGAGEMENT_CONTEXT,
  ENGAGEMENT_PATHS: ENGAGEMENT_PATHS,
  getSignal: getSignal,
  signalFor: signalFor,
  resolvePanorama: resolvePanorama,
};
