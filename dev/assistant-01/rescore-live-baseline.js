/**
 * Re-score LIVE_MODEL_BASELINE_V1 outputs with the current oracle.
 * Does not call the model. Does not overwrite baseline-live-v1/results.json.
 *
 * Usage: node dev/assistant-01/rescore-live-baseline.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var evaluate = require("./evaluate");
var fixtures = require("./fixtures");

var RAW_PATH = path.join(__dirname, "baseline-live-v1", "results.json");
var OUT_DIR = path.join(__dirname, "baseline-live-v1", "rescored-word-boundary");

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function sha256Text(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function classify(fixture, ev) {
  if (!fixture.pre_llm_valid) return { status: "FAIL", taxonomy: "PRE_LLM_GUARD_GAP" };
  if (ev.overall === "PASS" || (ev.fail_parts && ev.fail_parts.length === 0)) {
    return { status: "PASS", taxonomy: null };
  }
  return { status: "FAIL", taxonomy: "PROMPT_GAP" };
}

function tally(rows) {
  var out = { total: rows.length, PASS: 0, FAIL: 0, PRE_LLM_GUARD_GAP: 0, PROMPT_GAP: 0, other: 0 };
  rows.forEach(function(r) {
    if (r.status === "PASS") out.PASS++;
    else out.FAIL++;
    if (r.taxonomy === "PRE_LLM_GUARD_GAP") out.PRE_LLM_GUARD_GAP++;
    else if (r.taxonomy === "PROMPT_GAP") out.PROMPT_GAP++;
    else if (r.status === "FAIL") out.other++;
  });
  return out;
}

function main() {
  var raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  var cases = fixtures.buildLlmCases();
  var byId = {};
  cases.forEach(function(c) { byId[c.id] = c; });

  var llm = (raw.llm_results || []).map(function(row) {
    var fx = byId[row.id];
    if (!fx) {
      return {
        id: row.id,
        original_status: row.status,
        original_taxonomy: row.taxonomy,
        original_fail_parts: row.eval && row.eval.fail_parts,
        error: "FIXTURE_NOT_FOUND",
      };
    }
    var text = row.output;
    var ev = text == null ? { overall: "FAIL", fail_parts: ["empty"], checks: {} } : evaluate.evaluateResponse(fx, text);
    var cls = classify(fx, ev);
    return {
      id: row.id,
      intent: fx.intent,
      pre_llm_valid: fx.pre_llm_valid,
      force_invalid_call: fx.force_invalid_call,
      original_status: row.status,
      original_taxonomy: row.taxonomy,
      original_fail_parts: (row.eval && row.eval.fail_parts) || [],
      rescored_status: cls.status,
      rescored_taxonomy: cls.taxonomy,
      rescored_fail_parts: ev.fail_parts || [],
      rescored_eval: ev,
      output_unchanged: true,
      output_sha256: text == null ? null : sha256Text(text),
    };
  });

  var variance = {};
  Object.keys(raw.variance || {}).forEach(function(vid) {
    var fx = byId[vid];
    var src = raw.variance[vid];
    variance[vid] = { original_pass: src.pass, original_fail: src.fail, runs: [] };
    (src.runs || []).forEach(function(run, i) {
      var ev = run.output == null
        ? { overall: "FAIL", fail_parts: ["empty"], checks: {} }
        : evaluate.evaluateResponse(fx, run.output);
      var cls = classify(fx, ev);
      variance[vid].runs.push({
        index: i + 1,
        original_status: run.status,
        original_fail_parts: (run.eval && run.eval.fail_parts) || [],
        rescored_status: cls.status,
        rescored_taxonomy: cls.taxonomy,
        rescored_fail_parts: ev.fail_parts || [],
        output_sha256: run.output == null ? null : sha256Text(run.output),
      });
    });
    variance[vid].rescored_pass = variance[vid].runs.filter(function(x) { return x.rescored_status === "PASS"; }).length;
    variance[vid].rescored_fail = variance[vid].runs.filter(function(x) { return x.rescored_status === "FAIL"; }).length;
  });

  var originalRows = (raw.llm_results || []).map(function(r) {
    return { status: r.status, taxonomy: r.taxonomy };
  });
  var rescoredRows = llm.map(function(r) {
    return { status: r.rescored_status, taxonomy: r.rescored_taxonomy };
  });

  var report = {
    artifact: "LIVE_MODEL_BASELINE_V1_RESCORE_WORD_BOUNDARY",
    raw_baseline: "dev/assistant-01/baseline-live-v1/results.json",
    raw_baseline_sha256: sha256File(RAW_PATH),
    oracle_original: "findTerms used word-boundary OR n.indexOf(term)",
    oracle_corrected: "findTerms uses word-boundary regex only; term escaped",
    evaluate_js_sha256: sha256File(path.join(__dirname, "evaluate.js")),
    prompt_sha256: raw.system_prompt && raw.system_prompt.sha256,
    model: raw.live && raw.live.model,
    live_model_api_calls: 0,
    original_counts: tally(originalRows),
    rescored_counts: tally(rescoredRows),
    llm_results: llm,
    variance: variance,
  };

  report.delta = {
    PASS: report.rescored_counts.PASS - report.original_counts.PASS,
    FAIL: report.rescored_counts.FAIL - report.original_counts.FAIL,
    PRE_LLM_GUARD_GAP: report.rescored_counts.PRE_LLM_GUARD_GAP - report.original_counts.PRE_LLM_GUARD_GAP,
    PROMPT_GAP: report.rescored_counts.PROMPT_GAP - report.original_counts.PROMPT_GAP,
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  var outPath = path.join(OUT_DIR, "results.json");
  if (fs.existsSync(outPath)) {
    console.error("REFUSING to overwrite existing rescore at " + outPath);
    process.exit(2);
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, "MANIFEST.json"),
    JSON.stringify({
      artifact: report.artifact,
      raw_baseline_sha256: report.raw_baseline_sha256,
      evaluate_js_sha256: report.evaluate_js_sha256,
      original_counts: report.original_counts,
      rescored_counts: report.rescored_counts,
      delta: report.delta,
    }, null, 2),
    "utf8"
  );
  console.log(report.artifact);
  console.log("original " + JSON.stringify(report.original_counts));
  console.log("rescored " + JSON.stringify(report.rescored_counts));
  console.log("delta " + JSON.stringify(report.delta));
  console.log("wrote " + outPath);
}

main();
