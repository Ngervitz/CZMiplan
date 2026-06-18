/**
 * dev/narrative-01-qa.js — NARRATIVE-01 Financial Narrative Orchestrator QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var ctx = vm.createContext({
    window: {},
    global: {},
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isFinite: isFinite,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    URLSearchParams: URLSearchParams,
    localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    trackEvent: function() {},
    trackCRMEvent: function() {},
    document: { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} },
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.location = { search: "", href: "" };

  function load(file) {
    vm.runInContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      ctx,
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");
  load("js/app.js");

  var GOOD_SURVEY = {
    p1: "A", p2: "A", p3: "A", p4: "A", p5: "A",
    p6: "A", p7: "A", p8: "A", p9: "A", p10: "A",
  };

  function completeSt(overrides) {
    return Object.assign({
      financial_profile_complete: true,
      financial_income_complete: true,
      financial_debts_complete: true,
      financial_expenses_complete: true,
      income_source: "user_input",
      declared_ingreso: 120000,
      declared_nombre: "Ana Test",
      declared_laboral: "relacion_dependencia",
      user_email: "ana@test.com",
      no_debts_declared: true,
      deudas: [],
      gastos: { vivienda: 22000, alimentacion: 16000 },
      user_intent: null,
    }, overrides || {});
  }

  function debtRow(opts) {
    opts = opts || {};
    return {
      acreedor: opts.acreedor || "Banco",
      acreedor_raw: opts.acreedor || "Banco",
      monto: String(opts.monto != null ? opts.monto : 0),
      pago: String(opts.pago != null ? opts.pago : 0),
      tipo: opts.tipo || "prestamo",
      situacion_ui: opts.situacion_ui || "pagando_normal",
      estado: opts.estado || "al_dia",
    };
  }

  function decide(stage, intent, entryCtx) {
    return ctx.resolveNarrativeDecision(stage, intent, entryCtx, 3);
  }

  // A–D — stage → narrative_mode
  ok("A CLARIDAD → CLARITY", decide("CLARIDAD", null, {}).narrative_mode === "CLARITY");
  ok("B RECUPERACION → RECOVERY", decide("RECUPERACION", null, {}).narrative_mode === "RECOVERY");
  ok("C ESTABILIZACION → STABILIZATION", decide("ESTABILIZACION", null, {}).narrative_mode === "STABILIZATION");
  ok("D OPTIMIZACION → OPTIMIZATION", decide("OPTIMIZACION", null, {}).narrative_mode === "OPTIMIZATION");

  // E — profile tier mapping
  ok("E tier CLARIDAD", decide("CLARIDAD", null, {}).profile_tier === "UNKNOWN");
  ok("E tier RECUPERACION", decide("RECUPERACION", null, {}).profile_tier === "AT_RISK");
  ok("E tier ESTABILIZACION", decide("ESTABILIZACION", null, {}).profile_tier === "IMPROVING");
  ok("E tier OPTIMIZACION", decide("OPTIMIZACION", null, {}).profile_tier === "HEALTHY");

  // F–I — intent cannot override mode
  ok("F RECUPERACION + OPTIMIZAR → RECOVERY", decide("RECUPERACION", "OPTIMIZAR", {}).narrative_mode === "RECOVERY");
  ok("G RECUPERACION + CREDITO → RECOVERY", decide("RECUPERACION", "CREDITO", {}).narrative_mode === "RECOVERY");
  ok("H OPTIMIZACION + RECUPERAR → OPTIMIZATION", decide("OPTIMIZACION", "RECUPERAR", {}).narrative_mode === "OPTIMIZATION");
  ok("I OPTIMIZACION + ORDENAR → OPTIMIZATION", decide("OPTIMIZACION", "ORDENAR", {}).narrative_mode === "OPTIMIZATION");

  // J–K — entry context modifier only
  var cdvCtx = { hasRejectionContext: true, entryContext: "cdv_rejected" };
  var j = decide("OPTIMIZACION", null, cdvCtx);
  ok("J CDV + OPTIMIZACION mode", j.narrative_mode === "OPTIMIZATION");
  ok("J CDV + REJECTED_EXTERNAL", j.sub_tracks.context_modifier === "REJECTED_EXTERNAL");
  ok("K CDV does not force RECOVERY", decide("OPTIMIZACION", null, cdvCtx).narrative_mode !== "RECOVERY");

  // L–O — fallbacks
  ok("L missing intent focus DEFAULT", decide("OPTIMIZACION", null, {}).sub_tracks.focus_target === "DEFAULT");
  ok("M invalid intent ignored", decide("OPTIMIZACION", "BOGUS", {}).sub_tracks.focus_target === "DEFAULT");
  ok("N missing entry DEFAULT modifier", decide("OPTIMIZACION", null, null).sub_tracks.context_modifier === "DEFAULT");
  ok("O invalid entry DEFAULT modifier", decide("OPTIMIZACION", null, { entryContext: "unknown" }).sub_tracks.context_modifier === "DEFAULT");

  // P — missing financial_stage
  var p = decide(null, "ORDENAR", cdvCtx);
  ok("P missing stage → CLARITY", p.narrative_mode === "CLARITY");
  ok("P missing stage → UNKNOWN", p.profile_tier === "UNKNOWN");

  // Q–T — intent/entry never change mode or tier
  var intents = ["RECUPERAR", "ORDENAR", "CREDITO", "OPTIMIZAR", null, "invalid"];
  intents.forEach(function(intent) {
    var dRec = decide("RECUPERACION", intent, cdvCtx);
    ok("Q intent " + intent + " keeps RECOVERY", dRec.narrative_mode === "RECOVERY");
    ok("R intent " + intent + " keeps AT_RISK", dRec.profile_tier === "AT_RISK");
    var dOpt = decide("OPTIMIZACION", intent, cdvCtx);
    ok("S entry CDV keeps OPTIMIZATION", dOpt.narrative_mode === "OPTIMIZATION");
    ok("T entry CDV keeps HEALTHY", dOpt.profile_tier === "HEALTHY");
  });

  // Focus target mappings
  ok("focus RECOVERY_URGENT", decide("RECUPERACION", "OPTIMIZAR", {}).sub_tracks.focus_target === "RECOVERY_URGENT");
  ok("focus BUDGET_STABILIZATION", decide("ESTABILIZACION", "CREDITO", {}).sub_tracks.focus_target === "BUDGET_STABILIZATION");
  ok("focus CREDIT_BUILDING", decide("OPTIMIZACION", "CREDITO", {}).sub_tracks.focus_target === "CREDIT_BUILDING");
  ok("focus LEARNING", decide("OPTIMIZACION", "ORDENAR", {}).sub_tracks.focus_target === "LEARNING");

  // U–X — immunity combinatorics
  var entryLabels = [
    { hasRejectionContext: true, entryContext: "cdv_rejected" },
    { entryContext: "organic" },
    { entryContext: "seo_organic" },
    { entryContext: "direct" },
  ];
  var intentList = ["RECUPERAR", "ORDENAR", "CREDITO", "OPTIMIZAR", null];
  entryLabels.forEach(function(ec, idx) {
    intentList.forEach(function(intent) {
      ok("U healthy intent=" + intent + " ctx=" + idx, decide("OPTIMIZACION", intent, ec).narrative_mode === "OPTIMIZATION");
      ok("V recovery intent=" + intent + " ctx=" + idx, decide("RECUPERACION", intent, ec).narrative_mode === "RECOVERY");
      ok("W healthy tier intent=" + intent + " ctx=" + idx, decide("OPTIMIZACION", intent, ec).profile_tier === "HEALTHY");
      ok("X recovery tier intent=" + intent + " ctx=" + idx, decide("RECUPERACION", intent, ec).profile_tier === "AT_RISK");
    });
  });

  // Integration — attach on motor path
  ctx.PRE = { ingreso: 120000, respuestas: GOOD_SURVEY, nombre: "Ana", email: "a@t.com", laboral: "relacion_dependencia" };
  ctx.CZState = completeSt({ user_intent: "ORDENAR" });
  var diagAttached = ctx.assignMotorDiagnosis(ctx.CZState);
  ok("attach narrative_decision present", diagAttached && diagAttached.narrative_decision != null);
  ok("attach narrative_mode set", diagAttached.narrative_decision.narrative_mode != null);

  // Y–AA — motor outputs unchanged by narrative attach
  var dBefore = ctx.calcularMotor();
  var stageBefore = ctx.resolveFinancialStage(dBefore, ctx.CZState);
  ctx.attachFinancialStageToDiag(dBefore, ctx.CZState);
  var scoreBefore = dBefore.scoreReset;
  var planBefore = dBefore.planId;
  var stageAfterAttach = dBefore.financial_stage;
  ok("Y score unchanged", dBefore.scoreReset === scoreBefore);
  ok("Z plan unchanged", dBefore.planId === planBefore);
  ok("AA financial_stage unchanged", stageAfterAttach === stageBefore);

  // AB — dashboard narrative unchanged
  var narrBase = ctx.renderNarrativaInterpretacion(dBefore, ctx.CZState);
  dBefore.narrative_decision = { narrative_mode: "RECOVERY", profile_tier: "AT_RISK", sub_tracks: { focus_target: "RECOVERY_URGENT", context_modifier: "REJECTED_EXTERNAL" } };
  var narrAfter = ctx.renderNarrativaInterpretacion(dBefore, ctx.CZState);
  ok("AB narrative unchanged", narrBase === narrAfter);

  // AC — recommendations unchanged
  var recBase = ctx.renderAccionesRecomendadasHtml(dBefore);
  var recAfter = ctx.renderAccionesRecomendadasHtml(dBefore);
  ok("AC recommendations unchanged", recBase === recAfter);

  // AD — only Hero may consume narrative_decision (NARRATIVE-02 onward)
  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var narrInterpBlock = uiSrc.slice(
    uiSrc.indexOf("function renderNarrativaInterpretacion"),
    uiSrc.indexOf("function _ensureFirstAssessmentAt")
  );
  ok("AD explanation does not consume narrative_decision", narrInterpBlock.indexOf("narrative_decision") < 0);

  // AE — CRM payload
  ctx.CZState.diag = dBefore;
  var crm = ctx.buildCRMData(dBefore);
  ok("AE CRM no narrative_decision", crm.narrative_decision == null && JSON.stringify(crm).indexOf("narrative_decision") < 0);

  // AF — GTM allowlist
  var eventsSrc = fs.readFileSync(path.join(root, "js/events.js"), "utf8");
  ok("AF GTM allowlist excludes narrative_decision", eventsSrc.indexOf("narrative_decision") < 0);

  // AG — GA4 via same trackEvent path
  ok("AG no narrative in safeGTMPayload fields", typeof ctx.safeGTMPayload === "function"
    && JSON.stringify(ctx.safeGTMPayload("miplan_started", { narrative_decision: "x" })).indexOf("narrative_decision") < 0);

  console.log("\nNARRATIVE-01 QA: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
})();
