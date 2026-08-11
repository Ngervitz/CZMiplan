/**
 * PROV-NS Etapa 1 — read-only next_step layer tracer (dev audit only).
 * Does not modify production behavior.
 *
 * Usage: node dev/decision-provenance/ns-etapa1-trace.js
 */
"use strict";

var h = require("./harness");
var profiles = require("./profiles");

function layerTrace(ctx, diag, st) {
  var iv2 = diag.interpretacion_v2 || {};
  var L0 = {
    next_best_action: iv2.next_best_action || null,
    causa_principal: iv2.causa_principal || null,
    severity_level: iv2.severity_level || null,
    dti_ratio: (diag.fin && diag.fin.dti_ratio) != null ? diag.fin.dti_ratio : null,
  };

  var L1 = {
    key: ctx._resolveNextStepKeyFromDiag(diag, st),
  };

  var coh = ctx.resolveDashboardCoherence(diag, st);
  var L2 = {
    profileTier: coh.profileTier,
    nextStepKey: coh.nextStepKey,
    nextStepText: coh.nextStepText,
    plan_guardrail_reason: diag.plan_guardrail_reason || null,
  };

  var L3 = ctx.resolveNextStepContent(diag, st, coh);
  var textBeforeTone = null;
  // Reconstruct pre-tone text by temporarily noting: tone only mutates text after branch pick.
  // We observe tone effect by comparing narrative base vs final when focus/coh path known.
  var narrMode = L3.narrativeMode;
  var focus = L3.focusTarget;
  var base = (narrMode && typeof ctx._nextStepNarrativeBase === "function")
    ? ctx._nextStepNarrativeBase(narrMode, focus, diag, st)
    : null;

  var primaryOwns = typeof ctx._willRenderPrimaryActionCard === "function"
    ? ctx._willRenderPrimaryActionCard(diag, st, coh)
    : !!(L3.text && String(L3.text).trim());
  var heroText = typeof ctx._resolveHeroNextActionText === "function"
    ? ctx._resolveHeroNextActionText(diag, st, coh)
    : coh.nextStepText;

  var finalVisible = primaryOwns
    ? { surface: "PrimaryActionCard", actionKey: L3.actionKey, text: L3.text, source: L3.source }
    : { surface: "HeroEmbedded_or_none", actionKey: coh.nextStepKey, text: heroText, source: "hero_coherence_or_resolve" };

  var overrideChain = [];
  if (L0.next_best_action && L1.key && L0.next_best_action !== L1.key) {
    overrideChain.push("L0→L1 key " + L0.next_best_action + "→" + L1.key);
  }
  if (L1.key && L2.nextStepKey && L1.key !== L2.nextStepKey) {
    overrideChain.push("L1→L2 key " + L1.key + "→" + L2.nextStepKey);
  }
  if (L2.nextStepKey && L3.actionKey && L2.nextStepKey !== L3.actionKey) {
    overrideChain.push("L2→L3 key " + L2.nextStepKey + "→" + L3.actionKey);
  }
  if (base && base.actionKey && L3.actionKey && base.actionKey === L3.actionKey
      && base.text && L3.text && base.text !== L3.text) {
    overrideChain.push("L3tone text_changed key_preserved");
  }
  if (base && base.text && L3.text && base.text !== L3.text
      && (!base.actionKey || base.actionKey === L3.actionKey)) {
    // tone or coherence path
  }

  return {
    L0: L0,
    L1: L1,
    L2: L2,
    L3: {
      actionKey: L3.actionKey,
      text: L3.text,
      source: L3.source,
      narrativeMode: L3.narrativeMode,
      focusTarget: L3.focusTarget,
      profileTier: L3.profileTier,
      narrativeBaseKey: base && base.actionKey,
      narrativeBaseText: base && base.text,
      textChangedVsBase: !!(base && base.text && L3.text && base.text !== L3.text),
      keyChangedVsL2: L2.nextStepKey !== L3.actionKey,
    },
    display: {
      primaryOwns: primaryOwns,
      heroText: heroText,
      finalVisible: finalVisible,
    },
    overrideChain: overrideChain,
    initial_vs_final_key: {
      initial: L0.next_best_action,
      final: finalVisible.actionKey,
      equal: L0.next_best_action === finalVisible.actionKey,
    },
  };
}

function main() {
  var ctx = h.createCtx({ CZ_DECISION_PROVENANCE: false });
  h.loadProduct(ctx);

  var cases = profiles.layerBSampleProfiles().concat(
    profiles.layerAFsProfiles().filter(function(p) { return p.kind === "motor"; })
  );

  var matrix = [];
  var historySignals = 0;
  var toneTextChanges = 0;
  var keyOverrides = 0;

  console.log("PROV-NS Etapa1 traces (" + cases.length + " motor profiles)\n");

  for (var i = 0; i < cases.length; i++) {
    var p = cases[i];
    var diag = h.runMotor(ctx, p.opts || {});
    var st = ctx.CZState;
    var t = layerTrace(ctx, diag, st);
    matrix.push({
      id: p.id,
      L0: t.L0.next_best_action,
      L1: t.L1.key,
      L2: t.L2.nextStepKey,
      L3: t.L3.actionKey,
      final: t.display.finalVisible.actionKey,
      surface: t.display.finalVisible.surface,
      overrides: t.overrideChain.join(" | ") || "(none)",
      initial_eq_final: t.initial_vs_final_key.equal,
      L3_source: t.L3.source,
      text_vs_base: t.L3.textChangedVsBase,
    });
    if (t.overrideChain.length) historySignals++;
    if (t.L3.textChangedVsBase) toneTextChanges++;
    if (t.L3.keyChangedVsL2) keyOverrides++;

    if (
      p.id === "B_HEALTHY_NO_DEBT"
      || p.id === "B_NEG_FLOW"
      || p.id === "B_MORA"
      || p.id === "B_LARGE_STOCK"
      || p.id === "B_INCOMPLETE_EXPENSES"
      || p.id === "FS_A_INSUFF_ESCAPE_TO_OPT"
      || t.overrideChain.length > 0
    ) {
      console.log("CASE", p.id);
      console.log("  stage", diag.financial_stage, "narr",
        diag.narrative_decision && diag.narrative_decision.narrative_mode);
      console.log("  L0", JSON.stringify(t.L0));
      console.log("  L1", JSON.stringify(t.L1));
      console.log("  L2", t.L2.nextStepKey, "tier=" + t.L2.profileTier);
      console.log("  L3", t.L3.actionKey, "source=" + t.L3.source,
        "focus=" + t.L3.focusTarget, "textΔbase=" + t.L3.textChangedVsBase);
      console.log("  FINAL", t.display.finalVisible.surface, t.display.finalVisible.actionKey);
      console.log("  chain", t.overrideChain.join(" | ") || "(preserve)");
      console.log("");
    }
  }

  var unequal = matrix.filter(function(r) { return !r.initial_eq_final; });
  console.log("--- summary ---");
  console.log("profiles", matrix.length);
  console.log("initial!=final key", unequal.length);
  console.log("any L-chain override note", historySignals);
  console.log("L3 key!=L2 key", keyOverrides);
  console.log("tone/base text change", toneTextChanges);
  console.log("unequal ids:", unequal.map(function(r) { return r.id; }).join(", "));

  // Directed: healthy_organized vs narrative precedence (force confidence)
  var survey = { p1: "A", p2: "B", p3: "A", p4: "B", p5: "A", p6: "B", p7: "A", p8: "B", p9: "A", p10: "B" };
  var healthy = h.runMotor(ctx, {
    ingreso: 65300,
    respuestas: survey,
    gastos: { vivienda: 18000, alimentacion: 9000, servicios: 3000, transporte: 2000 },
    deudas: [{
      tipo: "tarjeta", acreedor: "OCA", acreedor_raw: "OCA",
      monto: "27000", pago: "700", situacion_ui: "pagando_normal",
      estado: "al_dia", pago_fuente: "declarado",
    }],
  });
  healthy.interpretacion_v2.confidence_level = "high";
  healthy.confidence_level = "high";
  var th = layerTrace(ctx, healthy, ctx.CZState);
  console.log("\nDIRECTED healthy_organized (forced high conf)", {
    stage: healthy.financial_stage,
    L0: th.L0.next_best_action,
    L2: th.L2.nextStepKey,
    L2tier: th.L2.profileTier,
    L3: th.L3.actionKey,
    L3focus: th.L3.focusTarget,
    final: th.display.finalVisible.actionKey,
    chain: th.overrideChain,
    L2_ne_L3: th.L2.nextStepKey !== th.L3.actionKey,
  });

  // Directed: OPTIMIZATION + healthy → coherence override wins
  healthy.financial_stage = "OPTIMIZACION";
  ctx.attachNarrativeDecisionToDiag(healthy, ctx.CZState);
  healthy.interpretacion_v2.confidence_level = "high";
  var thOpt = layerTrace(ctx, healthy, ctx.CZState);
  console.log("DIRECTED OPT+healthy coherence override", {
    L2: thOpt.L2.nextStepKey,
    L3: thOpt.L3.actionKey,
    equal: thOpt.L2.nextStepKey === thOpt.L3.actionKey,
    source: thOpt.L3.source,
  });

  // Directed: tone text swap without key change
  var toneDiag = h.runMotor(ctx, {
    ingreso: 80000,
    gastos: { vivienda: 35000, alimentacion: 20000 },
    deudas: [h.debtRow({ monto: 300000, pago: 30000 })],
  });
  toneDiag.fin.dti_ratio = 0.5;
  toneDiag.fin.cantMoras = 0;
  toneDiag.interpretacion_v2 = Object.assign({}, toneDiag.interpretacion_v2, {
    causa_principal: "flujo_negativo",
    next_best_action: "liberar_margen",
  });
  toneDiag.narrative_decision = {
    narrative_mode: "RECOVERY",
    profile_tier: "AT_RISK",
    sub_tracks: { focus_target: "DEFAULT", context_modifier: "DEFAULT" },
  };
  var base = ctx._nextStepNarrativeBase("RECOVERY", "DEFAULT", toneDiag, ctx.CZState);
  var nsTone = ctx.resolveNextStepContent(toneDiag, ctx.CZState);
  console.log("DIRECTED tone text≠base key preserved", {
    baseKey: base.actionKey,
    finalKey: nsTone.actionKey,
    textChanged: base.text !== nsTone.text,
    finalTextHead: (nsTone.text || "").slice(0, 70),
  });

  // Directed: ingreso_cero reason cleared when planIdRaw already 4
  ctx.PRE = {
    ingreso: 0, respuestas: h.GOOD_SURVEY, nombre: "QA", email: "qa@t", laboral: "relacion_dependencia",
  };
  ctx.TIENE_ENCUESTA = true;
  ctx.CZState = h.completeSt({ declared_ingreso: 0, no_debts_declared: true, deudas: [], gastos: { vivienda: 1000 } });
  var d0 = ctx.calcularMotor();
  console.log("DIRECTED ingreso_cero stamp loss", {
    planId: d0.planId,
    applied: d0.plan_guardrail_applied,
    reason: d0.plan_guardrail_reason,
    note: "reason null when raw already 4 — coherence revisar_ingresos not activated",
  });
  d0.plan_guardrail_reason = "ingreso_cero";
  var c0 = ctx.resolveDashboardCoherence(d0, ctx.CZState);
  console.log("DIRECTED ingreso_cero when reason forced", {
    L2: c0.nextStepKey,
    L3: ctx.resolveNextStepContent(d0, ctx.CZState, c0).actionKey,
  });
}

main();
