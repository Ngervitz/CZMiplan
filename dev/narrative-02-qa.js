/**
 * dev/narrative-02-qa.js — NARRATIVE-02 Hero Narrative Consumption QA (A–AA)
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
    sessionStorage: { getItem: function() { return null; }, setItem: function() {} },
    trackEvent: function() { ctx._gtmEvents = ctx._gtmEvents || []; ctx._gtmEvents.push(arguments); },
    trackCRMEvent: function() { ctx._crmEvents = ctx._crmEvents || []; ctx._crmEvents.push(arguments); },
    document: { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} },
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.location = { search: "", href: "" };
  ctx._gtmEvents = [];
  ctx._crmEvents = [];

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
      no_debts_declared: false,
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        acreedor_raw: "BROU",
        monto: "80000",
        pago: "8000",
        situacion_ui: "pagando_normal",
        estado: "al_dia",
      }],
      gastos: { vivienda: 22000, alimentacion: 16000, servicios: 3000 },
      user_intent: null,
      snap: { plan_id: 2 },
    }, overrides || {});
  }

  function runMotor(st) {
    ctx.PRE = {
      ingreso: st.declared_ingreso || 120000,
      respuestas: GOOD_SURVEY,
      nombre: st.declared_nombre || "Ana",
      email: st.user_email || "ana@test.com",
      laboral: st.declared_laboral || "relacion_dependencia",
    };
    ctx.CZState = st;
    var diag = ctx.calcularMotor();
    ctx.attachFinancialStageToDiag(diag, st);
    st.diag = diag;
    return diag;
  }

  function heroProblem(diag, st) {
    var coh = ctx.resolveDashboardCoherence(diag, st);
    return ctx.resolveHeroContent(diag, st, coh).problem;
  }

  function heroHtml(diag, st) {
    return ctx._renderDashboardHeroCard(diag, st);
  }

  function withNarrative(st, narrativePatch) {
    var diag = runMotor(st);
    if (narrativePatch === null) {
      delete diag.narrative_decision;
    } else if (narrativePatch === "corrupt") {
      diag.narrative_decision = "not-an-object";
    } else if (narrativePatch === "invalid") {
      diag.narrative_decision = { narrative_mode: "BOGUS", profile_tier: "UNKNOWN", sub_tracks: {} };
    } else {
      diag.narrative_decision = Object.assign({
        narrative_mode: "RECOVERY",
        profile_tier: "AT_RISK",
        sub_tracks: { focus_target: "DEFAULT", context_modifier: "DEFAULT" },
      }, narrativePatch || {});
    }
    st.diag = diag;
    return diag;
  }

  var stComplete = completeSt();
  var diagBase = withNarrative(stComplete, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });

  // A — CLARITY narrative_mode
  var stClarity = completeSt({ no_debts_declared: true, deudas: [], snap: { plan_id: 1 } });
  var diagClarity = withNarrative(stClarity, { narrative_mode: "CLARITY", profile_tier: "UNKNOWN" });
  var clarityProblem = heroProblem(diagClarity, stClarity);
  ok("A CLARITY produces clarity Hero family",
    clarityProblem && (clarityProblem.indexOf("No tenés claro") >= 0
      || clarityProblem.indexOf("panorama financiero") >= 0
      || clarityProblem.indexOf("visión completa") >= 0));

  // B — RECOVERY narrative_mode
  var diagRecovery = withNarrative(completeSt(), { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var recoveryProblem = heroProblem(diagRecovery, stComplete);
  ok("B RECOVERY produces recovery Hero family",
    recoveryProblem && (recoveryProblem.indexOf("pagando demasiado") >= 0
      || recoveryProblem.indexOf("presión") >= 0
      || recoveryProblem.indexOf("punto crítico") >= 0));

  // C — STABILIZATION narrative_mode
  var diagStab = withNarrative(completeSt(), { narrative_mode: "STABILIZATION", profile_tier: "IMPROVING" });
  var stabProblem = heroProblem(diagStab, stComplete);
  ok("C STABILIZATION produces stabilization Hero family",
    stabProblem && stabProblem.indexOf("volumen total de deuda") >= 0);

  // D — OPTIMIZATION narrative_mode
  var stOpt = completeSt({
    deudas: [],
    no_debts_declared: true,
    snap: { plan_id: 3 },
    declared_ingreso: 150000,
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagOpt = withNarrative(stOpt, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var optProblem = heroProblem(diagOpt, stOpt);
  ok("D OPTIMIZATION produces optimization Hero family",
    optProblem && (optProblem.indexOf("bien encaminada") >= 0
      || optProblem.indexOf("en orden") >= 0
      || optProblem.indexOf("equilibrio") >= 0));

  // E — RECHAZO_CDV + OPTIMIZATION does not produce recovery Hero
  var diagCdv = withNarrative(stOpt, {
    narrative_mode: "OPTIMIZATION",
    profile_tier: "HEALTHY",
    sub_tracks: { focus_target: "DEFAULT", context_modifier: "REJECTED_EXTERNAL" },
  });
  var cdvProblem = heroProblem(diagCdv, stOpt);
  ok("E CDV + OPTIMIZATION not recovery Hero",
    cdvProblem && cdvProblem.indexOf("pagando demasiado") < 0 && cdvProblem.indexOf("punto crítico") < 0);

  // F — OPTIMIZAR intent cannot override RECOVERY Hero
  var stF = completeSt({ user_intent: "OPTIMIZAR" });
  var diagF = withNarrative(stF, {
    narrative_mode: "RECOVERY",
    profile_tier: "AT_RISK",
  });
  var fProblem = heroProblem(diagF, stF);
  ok("F OPTIMIZAR intent keeps RECOVERY Hero",
    fProblem && (fProblem.indexOf("pagando demasiado") >= 0 || fProblem.indexOf("punto crítico") >= 0));

  // G — RECUPERAR intent cannot override OPTIMIZATION Hero
  var diagG = withNarrative(stOpt, {
    narrative_mode: "OPTIMIZATION",
    profile_tier: "HEALTHY",
    sub_tracks: { focus_target: "RECOVERY_URGENT", context_modifier: "DEFAULT" },
  });
  ctx.CZState = stOpt;
  stOpt.user_intent = "RECUPERAR";
  var gProblem = heroProblem(diagG, stOpt);
  ok("G RECUPERAR intent keeps OPTIMIZATION Hero",
    gProblem && gProblem.indexOf("pagando demasiado") < 0 && gProblem.indexOf("punto crítico") < 0);

  // H — missing narrative_decision falls back to legacy
  var stH = completeSt();
  var diagH = runMotor(stH);
  delete diagH.narrative_decision;
  var cohH = ctx.resolveDashboardCoherence(diagH, stH);
  var legacyH = ctx._resolveHeroContentLegacy(diagH, stH, cohH);
  var resolvedH = ctx.resolveHeroContent(diagH, stH, cohH);
  ok("H missing narrative_decision uses legacy source", resolvedH.source === "legacy");
  ok("H missing narrative_decision same problem", resolvedH.problem === legacyH.problem);

  // I — invalid narrative_mode falls back to legacy
  var stI = completeSt();
  var diagI = withNarrative(stI, "invalid");
  var cohI = ctx.resolveDashboardCoherence(diagI, stI);
  var legacyI = ctx._resolveHeroContentLegacy(diagI, stI, cohI);
  var resolvedI = ctx.resolveHeroContent(diagI, stI, cohI);
  ok("I invalid narrative_mode uses legacy source", resolvedI.source === "legacy");
  ok("I invalid narrative_mode same problem", resolvedI.problem === legacyI.problem);

  // J — corrupted narrative_decision falls back to legacy
  var stJ = completeSt();
  var diagJ = withNarrative(stJ, "corrupt");
  var cohJ = ctx.resolveDashboardCoherence(diagJ, stJ);
  var legacyJ = ctx._resolveHeroContentLegacy(diagJ, stJ, cohJ);
  var resolvedJ = ctx.resolveHeroContent(diagJ, stJ, cohJ);
  ok("J corrupted narrative_decision uses legacy source", resolvedJ.source === "legacy");
  ok("J corrupted narrative_decision same problem", resolvedJ.problem === legacyJ.problem);

  // K — dashboard renders successfully
  ctx.CZState = stComplete;
  ctx.CZState.diag = diagBase;
  var tabHtml = "";
  try { tabHtml = ctx.renderTabPlan(); } catch (e) { tabHtml = ""; }
  ok("K dashboard renders", tabHtml.length > 0 && tabHtml.indexOf("cz-dashboard-hero") >= 0);

  // L — What Is Happening unchanged
  var explBefore = ctx.renderNarrativaInterpretacion(diagBase, stComplete);
  diagBase.narrative_decision = { narrative_mode: "STABILIZATION", profile_tier: "IMPROVING", sub_tracks: {} };
  var explAfter = ctx.renderNarrativaInterpretacion(diagBase, stComplete);
  ok("L What Is Happening unchanged", explBefore === explAfter);

  // M — Next Step unchanged (coherence nextStepText)
  var cohBase = ctx.resolveDashboardCoherence(diagBase, stComplete);
  var nextBefore = cohBase.nextStepText;
  diagBase.narrative_decision = { narrative_mode: "RECOVERY", profile_tier: "AT_RISK", sub_tracks: {} };
  var cohAfter = ctx.resolveDashboardCoherence(diagBase, stComplete);
  ok("M Next Step unchanged", cohBase.nextStepText === cohAfter.nextStepText && nextBefore === cohAfter.nextStepText);

  // N — Recommendations unchanged
  var recBefore = ctx.renderAccionesRecomendadasHtml(diagBase);
  diagBase.narrative_decision = { narrative_mode: "CLARITY", profile_tier: "UNKNOWN", sub_tracks: {} };
  var recAfter = ctx.renderAccionesRecomendadasHtml(diagBase);
  ok("N Recommendations unchanged", recBefore === recAfter);

  // O — Score unchanged
  var scoreSnap = diagBase.scoreReset;
  diagBase.narrative_decision = { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY", sub_tracks: {} };
  ok("O Score unchanged", diagBase.scoreReset === scoreSnap);

  // P — Plan unchanged
  var planSnap = diagBase.planId;
  ok("P Plan unchanged", diagBase.planId === planSnap);

  // Q — Financial stage unchanged
  var stageSnap = diagBase.financial_stage;
  ok("Q Financial stage unchanged", diagBase.financial_stage === stageSnap);

  // R — Narrative decision object not mutated by Hero render
  var narrSnap = JSON.stringify(diagBase.narrative_decision);
  ctx._renderDashboardHeroCard(diagBase, stComplete);
  ok("R Narrative decision unchanged", JSON.stringify(diagBase.narrative_decision) === narrSnap);

  // S — CRM payload unchanged by Hero consumption
  ctx.CZState.diag = diagBase;
  var crm = ctx.buildCRMData(diagBase);
  ok("S CRM no narrative_decision field", crm.narrative_decision == null
    && JSON.stringify(crm).indexOf("narrative_decision") < 0);

  // T — GTM payload unchanged
  var eventsSrc = fs.readFileSync(path.join(root, "js/events.js"), "utf8");
  ok("T GTM allowlist excludes narrative_decision", eventsSrc.indexOf("narrative_decision") < 0);

  // U — GA4 path unchanged
  ok("U GA4 safeGTMPayload strips narrative_decision",
    typeof ctx.safeGTMPayload === "function"
    && JSON.stringify(ctx.safeGTMPayload("miplan_started", { narrative_decision: "x" })).indexOf("narrative_decision") < 0);

  // V — Explanation does not consume narrative_decision
  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var explBlock = uiSrc.slice(
    uiSrc.indexOf("function renderNarrativaInterpretacion"),
    uiSrc.indexOf("function _ensureFirstAssessmentAt")
  );
  ok("V Explanation does not consume narrative_decision", explBlock.indexOf("narrative_decision") < 0);

  // W — Next Step resolver does not consume narrative_decision
  var nextStepBlock = uiSrc.slice(
    uiSrc.indexOf("function _resolveDashboardNextStepText"),
    uiSrc.indexOf("function _incompleteFinancialScoreLabel")
  );
  ok("W Next Step does not consume narrative_decision", nextStepBlock.indexOf("narrative_decision") < 0);

  // X — Recommendations do not consume narrative_decision
  var recBlock = uiSrc.slice(
    uiSrc.indexOf("function renderAccionesRecomendadasHtml"),
    uiSrc.indexOf("function renderHorizonteRecalificacion")
  );
  ok("X Recommendations do not consume narrative_decision", recBlock.indexOf("narrative_decision") < 0);

  // Y — Only Hero consumes narrative_decision in ui.js
  var heroBlock = uiSrc.slice(
    uiSrc.indexOf("NARRATIVE-02"),
    uiSrc.indexOf("function _renderDashboardHeroCard")
  );
  var uiOutsideHero = uiSrc.slice(0, uiSrc.indexOf("NARRATIVE-02"))
    + uiSrc.slice(uiSrc.indexOf("function renderPrimaryActionCard"));
  ok("Y Hero block references narrative_decision", heroBlock.indexOf("narrative_decision") >= 0);
  ok("Y only Hero consumes narrative_decision in ui.js", uiOutsideHero.indexOf("narrative_decision") < 0);

  // Z — HEALTHY tier keeps OPTIMIZATION dominant, tone only
  var stZ = completeSt({
    deudas: [],
    no_debts_declared: true,
    snap: { plan_id: 3 },
    declared_ingreso: 150000,
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagZ = withNarrative(stZ, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var cohZ = ctx.resolveDashboardCoherence(diagZ, stZ);
  var heroZ = ctx.resolveHeroContent(diagZ, stZ, cohZ);
  ok("Z HEALTHY keeps OPTIMIZATION mode", heroZ.narrativeMode === "OPTIMIZATION");
  ok("Z HEALTHY positive tone not recovery family",
    heroZ.problem && heroZ.problem.indexOf("pagando demasiado") < 0);
  ok("Z HEALTHY tone adjustment",
    heroZ.problem && heroZ.problem.indexOf("en orden") >= 0);

  // AA — AT_RISK tier keeps RECOVERY dominant, urgency tone only
  var stAA = completeSt();
  var diagAA = withNarrative(stAA, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var cohAA = ctx.resolveDashboardCoherence(diagAA, stAA);
  var heroAA = ctx.resolveHeroContent(diagAA, stAA, cohAA);
  ok("AA AT_RISK keeps RECOVERY mode", heroAA.narrativeMode === "RECOVERY");
  ok("AA AT_RISK urgency tone",
    heroAA.problem && heroAA.problem.indexOf("punto crítico") >= 0);

  console.log("\nNARRATIVE-02 QA: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
})();
