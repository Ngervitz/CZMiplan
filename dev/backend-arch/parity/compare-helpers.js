/**
 * MOTOR-PARITY-00 — structural compare helpers for CURRENT_ORACLE vs SERVER_ENGINE.
 * No SERVER_ENGINE yet — this defines equality rules only.
 */
"use strict";

/** Fields under oracle.engine_result that must match exactly (JSON deep equal). */
var EXACT_EQUALITY_PATHS = [
  "planId",
  "nivelR",
  "scoreReset",
  "scoreFinancieroRaw",
  "scoreResetRaw",
  "guardrail_applied",
  "guardrail_reason",
  "assigned_plan_raw",
  "assigned_plan_final",
  "plan_guardrail_applied",
  "plan_guardrail_reason",
  "diasRec",
  "enc",
  "fin",
  "interpretacion",
  "interpretacion_v2",
  "horizonte",
  "bloqueadores",
  "prio",
  "financial_reality_warning",
  "financial_reality_warning_type",
  "missing_payment_information",
  "recommended_tools",
  "mora_activa",
  "deuda_vencida",
  "flag_demasiadas_deudas",
  "flag_deuda_cara",
  "deuda_fuera_sistema",
  "flag_deuda_sin_pagos",
  "flag_deuda_sanity_extreme",
  "financial_stage",
  "financial_stage_provenance",
  "narrative_decision",
  "coherence",
  "next_step",
  "next_step_provenance",
  "acciones",
  "completeness_recomputed",
  "plan",
];

/**
 * Paths compared only when decision_provenance was on in the fixture input.
 * (Still exact when present.)
 */
var PROVENANCE_PATHS = [
  "financial_stage_provenance",
  "next_step_provenance",
];

/**
 * Not part of ENGINE_CORE V1 equality (D2). Compare in a separate FE suite.
 */
var FE_PRESENTATION_ONLY = [
  "fe_presentation_layer.b7_segmentId",
  "fe_presentation_layer.b7_isInconsistency",
  "fe_presentation_layer.ux1d2_suppressFlujoNegativo",
  "fe_presentation_layer.acciones_canonical_visible",
];

/**
 * Legitimate normalization before compare (do not change business values).
 * - undefined ↔ null for missing keys
 * - stable sort of recommended_tools if order is documented as set-like (AS-IS: keep order; no sort)
 */
function normalizeForCompare(engineResult) {
  return JSON.parse(JSON.stringify(engineResult, function(k, v) {
    if (v === undefined) return null;
    return v;
  }));
}

function deepEqual(a, b) {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

function diffPaths(expected, actual, prefix, out) {
  prefix = prefix || "";
  out = out || [];
  if (typeof expected !== "object" || expected === null || typeof actual !== "object" || actual === null) {
    if (expected !== actual) out.push({ path: prefix || "(root)", expected: expected, actual: actual });
    return out;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      out.push({ path: prefix || "(root)", expected: expected, actual: actual });
    }
    return out;
  }
  var keys = {};
  Object.keys(expected).forEach(function(k) { keys[k] = true; });
  Object.keys(actual).forEach(function(k) { keys[k] = true; });
  Object.keys(keys).forEach(function(k) {
    var p = prefix ? prefix + "." + k : k;
    if (!(k in expected)) {
      out.push({ path: p, expected: undefined, actual: actual[k] });
    } else if (!(k in actual)) {
      out.push({ path: p, expected: expected[k], actual: undefined });
    } else if (typeof expected[k] === "object" && expected[k] !== null
        && typeof actual[k] === "object" && actual[k] !== null) {
      diffPaths(expected[k], actual[k], p, out);
    } else if (expected[k] !== actual[k]) {
      out.push({ path: p, expected: expected[k], actual: actual[k] });
    }
  });
  return out;
}

/**
 * Compare oracle engine_result vs candidate server engine_result.
 */
function compareEngineResults(expectedEngineResult, actualEngineResult) {
  var exp = normalizeForCompare(expectedEngineResult);
  var act = normalizeForCompare(actualEngineResult);
  var diffs = diffPaths(exp, act);
  return {
    ok: diffs.length === 0,
    diff_count: diffs.length,
    diffs: diffs.slice(0, 50),
  };
}

module.exports = {
  EXACT_EQUALITY_PATHS: EXACT_EQUALITY_PATHS,
  PROVENANCE_PATHS: PROVENANCE_PATHS,
  FE_PRESENTATION_ONLY: FE_PRESENTATION_ONLY,
  normalizeForCompare: normalizeForCompare,
  deepEqual: deepEqual,
  compareEngineResults: compareEngineResults,
};
