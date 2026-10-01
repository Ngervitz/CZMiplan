/**
 * engine/bin/classifier-compare-legacy.js — legacy engine vs shadow classifier on the
 * same EngineInput (parity corpus + classifier fixtures). Observational only:
 * no Plan→Strategy mapping, no agreement metric, legacy untouched.
 *
 * Also asserts that running the classifier does not change the legacy result
 * (legacy run before and after the classifier must serialize identically).
 *
 * Usage: node engine/bin/classifier-compare-legacy.js [--json]
 */
"use strict";

var fs = require("fs");
var path = require("path");
var runEngine = require("../index").runEngine;
var classify = require("../classifier/financial-classifier").classifyFinancialShadow;
var FIXTURES = require("../../dev/backend-arch/classifier-shadow/fixtures").FIXTURES;

var ORACLE_PATH = path.join(__dirname, "..", "..", "dev", "backend-arch", "parity", "oracle-results.json");
var FIXED_NOW_MS = Date.UTC(2026, 8, 29, 12, 0, 0);

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function stage(er) {
  var s = er.financial_stage;
  if (s == null) return null;
  if (typeof s === "string") return s;
  return s.stage || s.key || s.id || JSON.stringify(s);
}

function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, "utf8"));
  var cases = (oracle.cases || []).map(function (c) {
    return { id: "parity:" + c.id, input: c.input };
  }).concat(FIXTURES.map(function (fx) {
    return { id: "fixture:" + fx.id, input: fx.input };
  }));

  var rows = [];
  var legacyDrift = [];
  var legacyErrors = [];

  cases.forEach(function (c) {
    var nowMs = c.input.now_ms != null ? c.input.now_ms : FIXED_NOW_MS;
    var inputSnapshot = JSON.stringify(c.input);
    var before;
    try {
      before = runEngine(clone(c.input), { now_ms: nowMs });
    } catch (err) {
      legacyErrors.push({ id: c.id, error: String(err && err.message) });
    }
    var shadow = classify(clone(c.input));
    var after = before ? runEngine(clone(c.input), { now_ms: nowMs }) : null;
    if (before && JSON.stringify(before) !== JSON.stringify(after)) legacyDrift.push(c.id);
    if (JSON.stringify(c.input) !== inputSnapshot) legacyDrift.push(c.id + " (input mutated)");

    var er = before ? before.engine_result : {};
    rows.push({
      id: c.id,
      legacy_planId: before ? er.planId : "ERROR",
      legacy_scoreReset: before ? er.scoreReset : "ERROR",
      legacy_financial_stage: before ? stage(er) : "ERROR",
      shadow_status: shadow.classification_status,
      shadow_strategy: shadow.strategy,
      shadow_entry_reasons: shadow.entry_reasons,
      shadow_verification_required: shadow.verification_required,
      shadow_verification_codes: shadow.verification_reasons.map(function (r) {
        return r.subject === "debt" ? r.code + "@" + r.debt_index : r.code;
      }),
    });
  });

  if (asJson) {
    console.log(JSON.stringify({ rows: rows, legacy_drift: legacyDrift, legacy_errors: legacyErrors }, null, 2));
  } else {
    rows.forEach(function (r) {
      console.log([
        r.id,
        "legacy{planId=" + r.legacy_planId + " scoreReset=" + r.legacy_scoreReset + " stage=" + r.legacy_financial_stage + "}",
        "shadow{" + r.shadow_status + " " + r.shadow_strategy + " entry=" + JSON.stringify(r.shadow_entry_reasons) +
          " verify=" + r.shadow_verification_required +
          (r.shadow_verification_codes.length ? " " + JSON.stringify(r.shadow_verification_codes) : "") + "}",
      ].join(" | "));
    });
  }
  console.log("CASES:", rows.length, "LEGACY_DRIFT:", legacyDrift.length, "LEGACY_ERRORS:", legacyErrors.length);
  if (legacyErrors.length) console.log("legacy errors:", JSON.stringify(legacyErrors));
  if (legacyDrift.length) {
    console.log("legacy drift:", JSON.stringify(legacyDrift));
    process.exitCode = 1;
  }
}

main();
