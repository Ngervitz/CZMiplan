/**
 * Apply numeric output guard to captured LIVE_MODEL_BASELINE_V1 texts.
 * Does not call the model. Does not overwrite raw results.json.
 *
 * Usage: node dev/assistant-01/apply-numeric-guard-live.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var fixtures = require("./fixtures");
var guard = require("./numeric-output-guard");

var RAW_PATH = path.join(__dirname, "baseline-live-v1", "results.json");
var OUT_DIR = path.join(__dirname, "baseline-live-v1", "numeric-guard-v1");
var KNOWN = ["F_why_normal", "F_mb_linked_metric", "K_recommendation_tempt", "L_credit_prediction"];

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function main() {
  var raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  var byId = {};
  fixtures.buildLlmCases().forEach(function(c) { byId[c.id] = c; });

  var rows = [];
  (raw.llm_results || []).forEach(function(row) {
    var fx = byId[row.id];
    if (!fx || row.output == null) return;
    var result = guard.checkNumericOutputGuard(fx.intent, fx.assistant_context, row.output);
    rows.push({
      id: row.id,
      intent: fx.intent,
      pre_llm_valid: fx.pre_llm_valid,
      force_invalid_call: fx.force_invalid_call,
      decision: result.decision,
      allow: result.allow,
      found: result.found,
      rejected: result.rejected,
    });
  });

  var valid = rows.filter(function(r) { return r.pre_llm_valid; });
  var known = rows.filter(function(r) { return KNOWN.indexOf(r.id) !== -1; });

  var report = {
    artifact: "LIVE_MODEL_BASELINE_V1_NUMERIC_GUARD",
    raw_baseline: "dev/assistant-01/baseline-live-v1/results.json",
    raw_baseline_sha256: sha256File(RAW_PATH),
    live_model_api_calls: 0,
    fallback_copy: "ASSISTANT_OUTPUT_GUARD_FALLBACK_COPY",
    known_four: known,
    valid_calls: {
      total: valid.length,
      PASS: valid.filter(function(r) { return r.decision === "PASS"; }).length,
      REJECT: valid.filter(function(r) { return r.decision === "REJECT"; }).length,
    },
    valid_rejects: valid.filter(function(r) { return r.decision === "REJECT"; }),
    all_rows: rows,
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  var outPath = path.join(OUT_DIR, "results.json");
  if (fs.existsSync(outPath)) {
    console.error("REFUSING to overwrite " + outPath);
    process.exit(2);
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, "MANIFEST.json"),
    JSON.stringify({
      artifact: report.artifact,
      raw_baseline_sha256: report.raw_baseline_sha256,
      valid_calls: report.valid_calls,
    }, null, 2),
    "utf8"
  );
  console.log(report.artifact);
  console.log("known_four " + JSON.stringify(known.map(function(k) {
    return { id: k.id, decision: k.decision, rejected: k.rejected };
  })));
  console.log("valid " + JSON.stringify(report.valid_calls));
  console.log("rejects " + JSON.stringify(report.valid_rejects.map(function(r) {
    return { id: r.id, rejected: r.rejected };
  })));
  console.log("wrote " + outPath);
}

main();
