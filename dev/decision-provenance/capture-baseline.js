/**
 * PASO A — Capture global baseline v1 for DECISION-PROVENANCE-01.
 * Run BEFORE financial_stage provenance instrumentation.
 *
 * Usage: node dev/decision-provenance/capture-baseline.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var h = require("./harness");
var profiles = require("./profiles");

var OUT_DIR = path.join(__dirname, "baseline-v1");
var OUT_JSONL = path.join(OUT_DIR, "surfaces.jsonl");
var OUT_MANIFEST = path.join(OUT_DIR, "MANIFEST.json");

function resolveProfile(ctx, profile) {
  if (profile.kind === "direct") {
    var diag = JSON.parse(JSON.stringify(profile.diag));
    var st = profile.st || h.completeSt();
    // Ensure income path for insufficient checks when ingreso on fin
    if (diag.fin && diag.fin.ingreso > 0 && (st.declared_ingreso == null || st.declared_ingreso <= 0)) {
      if (!st.financial_income_complete === false) {
        /* keep */
      }
    }
    ctx.PRE = {
      ingreso: (diag.fin && diag.fin.ingreso) || 100000,
      respuestas: h.GOOD_SURVEY,
      nombre: "QA Synthetic",
      email: "qa@example.test",
      laboral: "relacion_dependencia",
    };
    ctx.TIENE_ENCUESTA = true;
    ctx.CZState = st;
    if (typeof ctx.hasCompletedFinancialInputs === "function"
        && !ctx.hasCompletedFinancialInputs(st)
        && profile.expected_reason
        && profile.expected_reason.indexOf("FS_INSUFF") !== 0
        && profile.id.indexOf("INSUFF") < 0
        && profile.id.indexOf("PREC_INSUFF") < 0) {
      // For direct non-insuff cases, force complete flags
      st.financial_profile_complete = true;
      st.financial_income_complete = true;
      st.financial_debts_complete = true;
      st.financial_expenses_complete = true;
      if (st.declared_ingreso == null || st.declared_ingreso <= 0) {
        st.declared_ingreso = (diag.fin && diag.fin.ingreso) || 100000;
      }
    }
    diag.financial_stage = ctx.resolveFinancialStage(diag, st);
    if (typeof ctx.attachNarrativeDecisionToDiag === "function") {
      ctx.attachNarrativeDecisionToDiag(diag, st);
    }
    ctx.CZState.diag = diag;
    return { diag: diag, st: st };
  }
  var diagM = h.runMotor(ctx, profile.opts || {});
  return { diag: diagM, st: ctx.CZState };
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  var ctx = h.createCtx();
  h.loadProduct(ctx);

  var commit = h.gitHead();
  var all = profiles.allBaselineProfiles();
  var lines = [];
  var summary = { stages: {}, profile_count: 0 };

  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    var resolved = resolveProfile(ctx, p);
    var surfaces = h.captureSurfaces(ctx, resolved.diag, resolved.st);
    var row = {
      profile_id: p.id,
      kind: p.kind,
      expected_stage: p.expected_stage || null,
      expected_reason: p.expected_reason || null,
      financial_stage: surfaces.financial_stage,
      next_step: surfaces.next_step,
      acciones_visibles: surfaces.acciones_visibles,
      meta: {
        planId: resolved.diag.planId != null ? resolved.diag.planId : null,
        narrative_mode: resolved.diag.narrative_decision
          ? resolved.diag.narrative_decision.narrative_mode
          : null,
      },
    };
    lines.push(JSON.stringify(row));
    summary.profile_count++;
    summary.stages[row.financial_stage] = (summary.stages[row.financial_stage] || 0) + 1;
  }

  fs.writeFileSync(OUT_JSONL, lines.join("\n") + "\n", "utf8");
  var manifest = {
    schema_version: 1,
    initiative: "DECISION-PROVENANCE-01",
    phase: "Etapa2-Fase1-PASO-A",
    captured_at: new Date().toISOString(),
    commit: commit,
    surfaces: [
      "financial_stage",
      "next_step.actionKey",
      "next_step.text",
      "acciones_visibles",
    ],
    canonical_acciones: "post_ui_filters_visible_only",
    profile_count: summary.profile_count,
    stage_histogram: summary.stages,
    files: {
      surfaces: "surfaces.jsonl",
    },
  };
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log("Baseline v1 written to", OUT_DIR);
  console.log("commit:", commit);
  console.log("profiles:", summary.profile_count);
  console.log("stages:", JSON.stringify(summary.stages));
}

main();
