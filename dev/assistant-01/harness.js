/**
 * ASSISTANT HARNESS v1 — first baseline capture.
 *
 * LAYER 1: PRE_LLM_GUARDS (always executed)
 * LAYER 2: LLM_RESPONSE_CONTRACT (live only if CZ_CLAUDE_API_KEY / ANTHROPIC_API_KEY)
 *
 * Does not modify production code or the frozen System Prompt v1.
 *
 * Usage:
 *   node dev/assistant-01/harness.js
 *   node dev/assistant-01/harness.js --live
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var { execSync } = require("child_process");

var guards = require("./guards");
var fixtures = require("./fixtures");
var evaluate = require("./evaluate");
var textRef = require("./text-ref-catalog");

var ROOT = path.join(__dirname, "..", "..");
var PROMPT_PATH = path.join(__dirname, "system-prompt-v1.txt");
var BASELINE_DIR = path.join(__dirname, "baseline-v1");
var LIVE = process.argv.indexOf("--live") !== -1;
var VARIANCE_RUNS = 3;
var VARIANCE_IDS = [
  "H_gravity_no_literal",
  "I_ratio_threshold_no_diff",
  "K_recommendation_tempt",
  "L_credit_prediction",
  "O_ns_value_textref_diverge",
  "G_ns_missing_evidence",
];

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (e) {
    return "UNKNOWN";
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fail(id, msg, extra) {
  return { id: id, status: "FAIL", message: msg, extra: extra || null };
}

function pass(id, extra) {
  return { id: id, status: "PASS", extra: extra || null };
}

function runPreLlmCase(c) {
  var snap = c.snap;
  var exp = c.expect || {};
  var avail = guards.availabilityMap(snap);
  var top3 = guards.rankTop3(snap).map(function(q) { return q.id; });
  var issues = [];

  if (exp.why === true && !avail.Q_WHY_STAGE) issues.push("expected WHY available");
  if (exp.why === false && avail.Q_WHY_STAGE) issues.push("expected WHY unavailable");
  if (exp.blocker === true && !avail.Q_MAIN_BLOCKER) issues.push("expected MAIN_BLOCKER available");
  if (exp.blocker === false && avail.Q_MAIN_BLOCKER) issues.push("expected MAIN_BLOCKER unavailable");
  if (exp.next_step === true && !avail.Q_EXPLAIN_NEXT_STEP) issues.push("expected NEXT_STEP available");
  if (exp.next_step === false && avail.Q_EXPLAIN_NEXT_STEP) issues.push("expected NEXT_STEP unavailable");
  if (exp.action === true && !avail.Q_EXPLAIN_ACTION) issues.push("expected ACTION available");
  if (exp.action === false && avail.Q_EXPLAIN_ACTION) issues.push("expected ACTION unavailable");
  if (exp.action_available === true && !avail.Q_EXPLAIN_ACTION) issues.push("EXPLAIN_ACTION should remain conceptually available");
  if (exp.next_step_question === true && !avail.Q_EXPLAIN_NEXT_STEP) issues.push("question available when display.visible");

  if (exp.catalog_excludes) {
    var ids = guards.availableQuestions(snap).map(function(q) { return q.id; });
    if (ids.indexOf(exp.catalog_excludes) !== -1) {
      issues.push("catalog should exclude " + exp.catalog_excludes);
    }
  }

  if (exp.top3) {
    if (!deepEqual(top3, exp.top3)) {
      issues.push("top3 expected " + JSON.stringify(exp.top3) + " got " + JSON.stringify(top3));
    }
  }

  if (exp.qualified_count != null) {
    var qc = guards.qualifiedActions(snap).length;
    if (qc !== exp.qualified_count) issues.push("qualified_count expected " + exp.qualified_count + " got " + qc);
  }

  if (exp.allow_call) {
    var ac = exp.allow_call;
    var got = guards.evaluateLlmCall(ac.intent, snap, {
      selected_action_id: ac.selected_action_id,
    });
    if (got.allowed !== ac.allowed) {
      issues.push("allow_call expected " + ac.allowed + " got " + got.allowed + " (" + got.reason + ")");
    }
    if (ac.reason && got.reason !== ac.reason) {
      issues.push("allow_call reason expected " + ac.reason + " got " + got.reason);
    }
    if (exp.chips_count != null) {
      var chips = got.chips || [];
      if (chips.length !== exp.chips_count) {
        issues.push("chips_count expected " + exp.chips_count + " got " + chips.length);
      }
    }
    if (ac.selected_action_id && got.allowed && got.selected && got.selected.id !== ac.selected_action_id) {
      issues.push("selected action mismatch");
    }
  }

  if (issues.length) return fail(c.id, issues.join("; "), { avail: avail, top3: top3 });
  return pass(c.id, { avail: avail, top3: top3 });
}

function runBuilderMismatchCases() {
  var cases = [
    {
      id: "Q_builder_why_has_action",
      intent: "WHY_DIAGNOSIS",
      ctx: { action_id: "ordenar_gastos", selection_reason: { reason_code: "ACT_PICK_C1" } },
    },
    {
      id: "Q_builder_action_has_fs",
      intent: "EXPLAIN_ACTION",
      ctx: { financial_stage: "RECUPERACION", reason_code: "FS_REC_FLUJO_NEG", evidence: {} },
    },
    {
      id: "Q_builder_blocker_has_ns",
      intent: "MAIN_BLOCKER",
      ctx: { value: "liberar_margen", text_ref: "known:liberar_margen", reason_code: "NS_NARR_RECOVERY_LIBERAR" },
    },
  ];
  return cases.map(function(c) {
    var v = guards.validateAssistantContext(c.intent, c.ctx);
    if (v.ok) return fail(c.id, "builder should reject mismatched DTO", v);
    return pass(c.id, { reason: v.reason, extras: v.extras, missing: v.missing });
  });
}

function runTextRefAudit() {
  var checks = [];
  var samples = [
    ["known:liberar_margen", true],
    ["known:estabilizar_atraso", true],
    ["const:revisar_ingresos", true],
    ["const:zero_active_debt", true],
    ["const:dti_accion_prioritaria", true],
    ["coh:healthy_alto", true],
    ["coh:healthy_mantener", true],
    ["known:does_not_exist", false],
    ["raw-unprefixed", false],
    [null, false],
  ];
  samples.forEach(function(pair) {
    var r = textRef.resolveTextRefDevOnly(pair[0]);
    var ok = r.ok === pair[1];
    checks.push({
      id: "text_ref_dev_" + String(pair[0]),
      status: ok ? "PASS" : "FAIL",
      resolved: r,
    });
  });
  return {
    gap_id: textRef.GAP_ID,
    integration_ready: textRef.INTEGRATION_READY,
    notes: textRef.NOTES,
    checks: checks,
  };
}

function getApiKey() {
  return process.env.CZ_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

function getModel() {
  return process.env.CZ_CLAUDE_MODEL || "claude-haiku-4-5-20251001";
}

function userMessage(intent, ctx) {
  return "intent: " + intent + "\nassistant_context:\n" + JSON.stringify(ctx, null, 2);
}

async function callModel(prompt, intent, ctx) {
  var key = getApiKey();
  if (!key) throw new Error("NO_API_KEY");
  var model = getModel();
  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 400,
      temperature: 0,
      system: prompt,
      messages: [{ role: "user", content: userMessage(intent, ctx) }],
    }),
  });
  var data = await res.json();
  if (!res.ok) {
    var err = new Error("ANTHROPIC_HTTP_" + res.status);
    err.body = data;
    throw err;
  }
  var text = "";
  var blocks = data.content || [];
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].type === "text") text += blocks[i].text || "";
  }
  return { text: text, raw: data, model: model };
}

function classifyLlmFail(fixture, evalResult) {
  if (!fixture.pre_llm_valid) return "PRE_LLM_GUARD_GAP";
  if (evalResult.fail_parts.indexOf("tone") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("gravity") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("numbers") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("recommend") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("credit") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("tech") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("causality") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("defense") !== -1) return "PROMPT_GAP";
  if (evalResult.fail_parts.indexOf("format") !== -1) return "PROMPT_GAP";
  return "PROMPT_GAP";
}

async function runLiveLlm(prompt, llmCases) {
  var results = [];
  var variance = {};
  for (var i = 0; i < llmCases.length; i++) {
    var c = llmCases[i];
    var builder = guards.validateAssistantContext(c.intent, c.assistant_context);
    if (!c.force_invalid_call && !builder.ok) {
      results.push({
        id: c.id,
        status: "FAIL",
        taxonomy: "CONTEXT_BUILDER_GAP",
        builder: builder,
        output: null,
      });
      continue;
    }
    if (!c.pre_llm_valid && !c.force_invalid_call) {
      results.push({
        id: c.id,
        status: "FAIL",
        taxonomy: "PRE_LLM_GUARD_GAP",
        output: null,
      });
      continue;
    }
    try {
      var call = await callModel(prompt, c.intent, c.assistant_context);
      var ev = evaluate.evaluateResponse(c, call.text);
      var status;
      var taxonomy = null;
      if (!c.pre_llm_valid) {
        status = "FAIL";
        taxonomy = "PRE_LLM_GUARD_GAP";
      } else if (ev.overall === "PASS") {
        status = "PASS";
      } else {
        status = "FAIL";
        taxonomy = classifyLlmFail(c, ev);
      }
      results.push({
        id: c.id,
        status: status,
        taxonomy: taxonomy,
        output: call.text,
        eval: ev,
        model: call.model,
      });
    } catch (e) {
      results.push({
        id: c.id,
        status: "FAIL",
        taxonomy: "TEST_GAP",
        error: String(e.message || e),
        output: null,
      });
    }
  }

  for (var v = 0; v < VARIANCE_IDS.length; v++) {
    var vid = VARIANCE_IDS[v];
    var fx = llmCases.filter(function(x) { return x.id === vid; })[0];
    if (!fx || !fx.pre_llm_valid) continue;
    variance[vid] = { runs: [], pass: 0, fail: 0 };
    for (var r = 0; r < VARIANCE_RUNS; r++) {
      try {
        var vc = await callModel(prompt, fx.intent, fx.assistant_context);
        var ve = evaluate.evaluateResponse(fx, vc.text);
        var ok = ve.overall === "PASS";
        variance[vid].runs.push({ status: ok ? "PASS" : "FAIL", output: vc.text, eval: ve });
        if (ok) variance[vid].pass++;
        else variance[vid].fail++;
      } catch (e2) {
        variance[vid].runs.push({ status: "FAIL", error: String(e2.message || e2) });
        variance[vid].fail++;
      }
    }
    variance[vid].failure_rate = variance[vid].fail / VARIANCE_RUNS;
  }

  return { results: results, variance: variance };
}

function summarize(pre, builder, llmMeta) {
  var prePass = pre.filter(function(r) { return r.status === "PASS"; }).length;
  var preFail = pre.filter(function(r) { return r.status === "FAIL"; }).length;
  var bPass = builder.filter(function(r) { return r.status === "PASS"; }).length;
  var bFail = builder.filter(function(r) { return r.status === "FAIL"; }).length;
  return {
    pre_llm: { pass: prePass, fail: preFail, total: pre.length },
    builder: { pass: bPass, fail: bFail, total: builder.length },
    llm: llmMeta,
  };
}

async function main() {
  var prompt = fs.readFileSync(PROMPT_PATH, "utf8");
  var promptHash = sha256(prompt);
  var all = fixtures.allFixtures();
  var preResults = all.pre_llm.map(runPreLlmCase);
  var builderResults = runBuilderMismatchCases();
  var audit = runTextRefAudit();

  var live = {
    exercised: false,
    reason: "LIVE_MODEL_QA_NOT_EXERCISED",
    model: null,
    temperature: 0,
    results: [],
    variance: {},
  };

  var key = getApiKey();
  if (LIVE && key) {
    var llmRun = await runLiveLlm(prompt, all.llm);
    live.exercised = true;
    live.reason = null;
    live.model = getModel();
    live.results = llmRun.results;
    live.variance = llmRun.variance;
  } else if (LIVE && !key) {
    live.reason = "LIVE_MODEL_QA_NOT_EXERCISED";
    live.detail = "--live requested but CZ_CLAUDE_API_KEY / ANTHROPIC_API_KEY unset";
  }

  var llmMeta = live.exercised
    ? {
        exercised: true,
        pass: live.results.filter(function(r) { return r.status === "PASS"; }).length,
        fail: live.results.filter(function(r) { return r.status === "FAIL"; }).length,
        total: live.results.length,
        model: live.model,
        temperature: 0,
      }
    : {
        exercised: false,
        status: "LIVE_MODEL_QA_NOT_EXERCISED",
        fixture_count: all.llm.length,
        model: null,
      };

  var report = {
    baseline_id: "ASSISTANT_HARNESS_BASELINE_V1",
    captured_at: nowIso(),
    git_head: gitHead(),
    system_prompt: {
      path: "dev/assistant-01/system-prompt-v1.txt",
      version: "v1",
      sha256: promptHash,
      bytes: Buffer.byteLength(prompt, "utf8"),
    },
    layers: {
      PRE_LLM_GUARDS: "executed",
      LLM_RESPONSE_CONTRACT: live.exercised ? "executed" : "LIVE_MODEL_QA_NOT_EXERCISED",
    },
    text_ref_audit: audit,
    totals: summarize(preResults, builderResults, llmMeta),
    pre_llm_results: preResults,
    builder_results: builderResults,
    llm_results: live.results,
    variance: live.variance,
    live: {
      exercised: live.exercised,
      reason: live.reason,
      detail: live.detail || null,
      model: live.model,
      temperature: live.exercised ? 0 : null,
      max_tokens: live.exercised ? 400 : null,
    },
    coverage: {
      FREE_TEXT_ASSISTANT_INPUT: "DEFERRED_TO_V1.1",
      INTENT_ROUTER: "DEFERRED_TO_V1.1",
      OUT_OF_SCOPE: "DEFERRED_TO_V1.1",
      AMBIGUOUS: "DEFERRED_TO_V1.1",
      PRODUCTION_ENDPOINT: "NOT_PRESENT",
      ASSISTANT_CONTEXT_BUILDER_PRODUCTION: "NOT_PRESENT",
      TEXT_REF_PRODUCTION_RESOLVER: "NOT_PRESENT",
      LIVE_MODEL_QA: live.exercised ? "EXERCISED" : "LIVE_MODEL_QA_NOT_EXERCISED",
    },
    freeze: {
      PRODUCTION_CODE_CHANGES: "NONE",
      SYSTEM_PROMPT_MUTATED: false,
      BUG_NS_GUARD_REASON: "NOT_FIXED",
      BUG_FS_CLARITY_LOW_MISS: "UNCHANGED",
      PROVENANCE_SOURCE_LAYER_DEBT: "UNCHANGED",
    },
  };

  if (!fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true });
  var resultsPath = path.join(BASELINE_DIR, "results.json");
  if (fs.existsSync(resultsPath)) {
    console.error("REFUSING to overwrite existing baseline at " + resultsPath);
    process.exit(2);
  }
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    path.join(BASELINE_DIR, "MANIFEST.json"),
    JSON.stringify({
      baseline_id: report.baseline_id,
      captured_at: report.captured_at,
      git_head: report.git_head,
      prompt_sha256: promptHash,
      live_model: report.live,
    }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(BASELINE_DIR, "system-prompt-v1.sha256"), promptHash + "\n", "utf8");

  var fails = preResults.concat(builderResults).filter(function(r) { return r.status === "FAIL"; });
  console.log("ASSISTANT_HARNESS_BASELINE_V1");
  console.log("prompt_sha256=" + promptHash);
  console.log("git_head=" + report.git_head);
  console.log("PRE_LLM pass=" + report.totals.pre_llm.pass + " fail=" + report.totals.pre_llm.fail);
  console.log("BUILDER pass=" + report.totals.builder.pass + " fail=" + report.totals.builder.fail);
  console.log("LLM " + (live.exercised ? ("pass=" + llmMeta.pass + " fail=" + llmMeta.fail) : "LIVE_MODEL_QA_NOT_EXERCISED"));
  if (fails.length) {
    fails.forEach(function(f) {
      console.log("FAIL " + f.id + " :: " + f.message);
    });
  }
  console.log("wrote " + resultsPath);
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
