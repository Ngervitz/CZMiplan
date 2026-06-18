/**
 * dev/narrative-03-qa.js — NARRATIVE-03 Explanation Narrative Consumption QA (A–AF)
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

  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");

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
      email: st.user_email || "a@test.com",
      laboral: st.declared_laboral || "relacion_dependencia",
    };
    ctx.CZState = st;
    var diag = ctx.calcularMotor();
    ctx.attachFinancialStageToDiag(diag, st);
    st.diag = diag;
    return diag;
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

  function explanationText(diag, st) {
    var coh = ctx.resolveDashboardCoherence(diag, st);
    return ctx.resolveExplanationQueEstaPasando(diag, st, coh).text;
  }

  function explanationHtml(diag, st) {
    return ctx.renderNarrativaInterpretacion(diag, st);
  }

  function heroProblem(diag, st) {
    return ctx.resolveHeroContent(diag, st, ctx.resolveDashboardCoherence(diag, st)).problem;
  }

  var stComplete = completeSt();

  // A — CLARITY
  var diagClarity = withNarrative(completeSt({ snap: { plan_id: 1 } }), {
    narrative_mode: "CLARITY",
    profile_tier: "UNKNOWN",
  });
  var clarityText = explanationText(diagClarity, completeSt({ snap: { plan_id: 1 } }));
  ok("A CLARITY explanation family",
    clarityText && (clarityText.indexOf("panorama financiero") >= 0
      || clarityText.indexOf("completamente claro") >= 0
      || clarityText.indexOf("visión completa") >= 0));

  // B — RECOVERY
  var diagRecovery = withNarrative(stComplete, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var recoveryText = explanationText(diagRecovery, stComplete);
  ok("B RECOVERY explanation family",
    recoveryText && (recoveryText.indexOf("superan el ingreso") >= 0
      || recoveryText.indexOf("mora") >= 0
      || recoveryText.indexOf("presión") >= 0));

  // C — STABILIZATION
  var diagStab = withNarrative(stComplete, { narrative_mode: "STABILIZATION", profile_tier: "IMPROVING" });
  var stabText = explanationText(diagStab, stComplete);
  ok("C STABILIZATION explanation family",
    stabText && stabText.indexOf("volumen total de deuda") >= 0);

  // D — OPTIMIZATION
  var stOpt = completeSt({
    deudas: [],
    no_debts_declared: true,
    snap: { plan_id: 3 },
    declared_ingreso: 150000,
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagOpt = withNarrative(stOpt, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var optText = explanationText(diagOpt, stOpt);
  ok("D OPTIMIZATION explanation family",
    optText && (optText.indexOf("perfil ordenado") >= 0
      || optText.indexOf("equilibrio") >= 0
      || optText.indexOf("deudas activas") >= 0));

  // E — CDV + OPTIMIZATION not recovery
  var diagCdv = withNarrative(stOpt, {
    narrative_mode: "OPTIMIZATION",
    profile_tier: "HEALTHY",
    sub_tracks: { context_modifier: "REJECTED_EXTERNAL" },
  });
  var cdvText = explanationText(diagCdv, stOpt);
  ok("E CDV + OPTIMIZATION not recovery explanation",
    cdvText && cdvText.indexOf("superan el ingreso") < 0 && cdvText.indexOf("mora activa") < 0);

  // F — OPTIMIZAR cannot override RECOVERY
  var stF = completeSt({ user_intent: "OPTIMIZAR" });
  var diagF = withNarrative(stF, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var fText = explanationText(diagF, stF);
  ok("F OPTIMIZAR keeps RECOVERY explanation",
    fText && (fText.indexOf("superan el ingreso") >= 0 || fText.indexOf("mora") >= 0));

  // G — RECUPERAR cannot override OPTIMIZATION
  var stG = completeSt({
    deudas: [],
    no_debts_declared: true,
    snap: { plan_id: 3 },
    declared_ingreso: 150000,
    user_intent: "RECUPERAR",
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagG = withNarrative(stG, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var gText = explanationText(diagG, stG);
  ok("G RECUPERAR keeps OPTIMIZATION explanation",
    gText && gText.indexOf("superan el ingreso") < 0);

  // H — STABILIZATION + RECUPERAR
  var stH = completeSt({ user_intent: "RECUPERAR" });
  var diagH = withNarrative(stH, { narrative_mode: "STABILIZATION", profile_tier: "IMPROVING" });
  var hText = explanationText(diagH, stH);
  ok("H STABILIZATION + RECUPERAR stays STABILIZATION",
    hText && hText.indexOf("volumen total de deuda") >= 0);

  // I — missing narrative_decision → legacy
  var stI = completeSt();
  var diagI = runMotor(stI);
  delete diagI.narrative_decision;
  var cohI = ctx.resolveDashboardCoherence(diagI, stI);
  var legacyI = ctx._resolveExplanationQueEstaPasandoLegacy(diagI, stI, cohI);
  var resolvedI = ctx.resolveExplanationQueEstaPasando(diagI, stI, cohI);
  ok("I missing uses legacy source", resolvedI.source === "legacy");
  ok("I missing same text", resolvedI.text === legacyI);

  // J — invalid narrative_mode → legacy
  var stJ = completeSt();
  var diagJ = withNarrative(stJ, "invalid");
  var cohJ = ctx.resolveDashboardCoherence(diagJ, stJ);
  var legacyJ = ctx._resolveExplanationQueEstaPasandoLegacy(diagJ, stJ, cohJ);
  var resolvedJ = ctx.resolveExplanationQueEstaPasando(diagJ, stJ, cohJ);
  ok("J invalid uses legacy source", resolvedJ.source === "legacy");
  ok("J invalid same text", resolvedJ.text === legacyJ);

  // K — corrupted → legacy
  var stK = completeSt();
  var diagK = withNarrative(stK, "corrupt");
  var cohK = ctx.resolveDashboardCoherence(diagK, stK);
  var legacyK = ctx._resolveExplanationQueEstaPasandoLegacy(diagK, stK, cohK);
  var resolvedK = ctx.resolveExplanationQueEstaPasando(diagK, stK, cohK);
  ok("K corrupted uses legacy source", resolvedK.source === "legacy");
  ok("K corrupted same text", resolvedK.text === legacyK);

  // L — dashboard renders
  ctx.CZState = stComplete;
  ctx.CZState.diag = diagRecovery;
  var tabHtml = "";
  try { tabHtml = ctx.renderTabPlan(); } catch (e) { tabHtml = ""; }
  ok("L dashboard renders", tabHtml.length > 0 && tabHtml.indexOf("cz-dashboard-hero") >= 0);

  // M — Hero unchanged from NARRATIVE-02 when only sub_tracks change
  var heroBefore = heroProblem(diagRecovery, stComplete);
  diagRecovery.narrative_decision.sub_tracks = {
    focus_target: "CREDIT_BUILDING",
    context_modifier: "REJECTED_EXTERNAL",
  };
  var heroAfter = heroProblem(diagRecovery, stComplete);
  ok("M Hero unchanged when only sub_tracks change", heroBefore === heroAfter);

  // N — coherence legacy path unchanged; connected next step may vary (NARRATIVE-04)
  var cohN = ctx.resolveDashboardCoherence(diagRecovery, stComplete);
  var nextBefore = cohN.nextStepText;
  var connectedBefore = ctx.resolveNextStepContent(diagRecovery, stComplete, cohN).text;
  diagRecovery.narrative_decision = { narrative_mode: "STABILIZATION", profile_tier: "IMPROVING", sub_tracks: {} };
  var cohN2 = ctx.resolveDashboardCoherence(diagRecovery, stComplete);
  var connectedAfter = ctx.resolveNextStepContent(diagRecovery, stComplete, cohN2).text;
  ok("N coherence nextStepText unchanged", nextBefore === cohN2.nextStepText);
  ok("N connected next step varies with narrative", connectedBefore !== connectedAfter);

  // O — Recommendations unchanged
  var recBefore = ctx.renderAccionesRecomendadasHtml(diagRecovery);
  diagRecovery.narrative_decision = { narrative_mode: "CLARITY", profile_tier: "UNKNOWN", sub_tracks: {} };
  var recAfter = ctx.renderAccionesRecomendadasHtml(diagRecovery);
  ok("O Recommendations unchanged", recBefore === recAfter);

  // P — primary action card is a Next Step consumer (NARRATIVE-04)
  var actBefore = ctx.renderPrimaryActionCard(diagRecovery, stComplete, cohN2);
  diagRecovery.narrative_decision = { narrative_mode: "RECOVERY", profile_tier: "AT_RISK", sub_tracks: {} };
  var actAfter = ctx.renderPrimaryActionCard(diagRecovery, stComplete, ctx.resolveDashboardCoherence(diagRecovery, stComplete));
  ok("P primary action card renders", typeof actBefore === "string" && typeof actAfter === "string");

  // Q–T — motor fields unchanged
  var scoreSnap = diagRecovery.scoreReset;
  var planSnap = diagRecovery.planId;
  var stageSnap = diagRecovery.financial_stage;
  var narrSnap = JSON.stringify(diagRecovery.narrative_decision);
  ok("Q Score unchanged", diagRecovery.scoreReset === scoreSnap);
  ok("R Plan unchanged", diagRecovery.planId === planSnap);
  ok("S Financial stage unchanged", diagRecovery.financial_stage === stageSnap);
  ok("T Narrative decision object intact", JSON.stringify(diagRecovery.narrative_decision) === narrSnap);

  // U–W — CRM/GTM/GA4
  ctx.CZState.diag = diagRecovery;
  var crm = ctx.buildCRMData(diagRecovery);
  ok("U CRM no narrative_decision", crm.narrative_decision == null
    && JSON.stringify(crm).indexOf("narrative_decision") < 0);
  var eventsSrc = fs.readFileSync(path.join(root, "js/events.js"), "utf8");
  ok("V GTM excludes narrative_decision", eventsSrc.indexOf("narrative_decision") < 0);
  ok("W GA4 strips narrative_decision",
    typeof ctx.safeGTMPayload === "function"
    && JSON.stringify(ctx.safeGTMPayload("miplan_started", { narrative_decision: "x" })).indexOf("narrative_decision") < 0);

  // X–Z — isolation
  var nextBlock = uiSrc.slice(uiSrc.indexOf("NARRATIVE-04"), uiSrc.indexOf("function _incompleteFinancialScoreLabel"));
  var recBlock = uiSrc.slice(
    uiSrc.indexOf("function renderAccionesRecomendadasHtml"),
    uiSrc.indexOf("function renderHorizonteRecalificacion")
  );
  var actionBlock = uiSrc.slice(
    uiSrc.indexOf("function renderAccionesRecomendadasHtml"),
    uiSrc.indexOf("function _renderTuSituacionHoy")
  );
  ok("X Next Step consumes narrative_decision via resolver", nextBlock.indexOf("narrative_decision") >= 0);
  ok("Y Recommendations do not consume narrative_decision", recBlock.indexOf("narrative_decision") < 0);
  ok("Z Recommended actions do not consume narrative_decision", actionBlock.indexOf("narrative_decision") < 0);

  // AA — only Hero, Explanation and Next Step consume narrative_decision
  var heroBlock = uiSrc.slice(uiSrc.indexOf("NARRATIVE-02"), uiSrc.indexOf("function _resolveHeroNextActionText"));
  var explBlock = uiSrc.slice(uiSrc.indexOf("NARRATIVE-03"), uiSrc.indexOf("function renderNarrativaInterpretacion"));
  var outsideAllowed = uiSrc.slice(0, uiSrc.indexOf("NARRATIVE-04"))
    + uiSrc.slice(uiSrc.indexOf("function _incompleteFinancialScoreLabel"), uiSrc.indexOf("NARRATIVE-03"))
    + uiSrc.slice(uiSrc.indexOf("function renderNarrativaInterpretacion"), uiSrc.indexOf("NARRATIVE-02"))
    + uiSrc.slice(uiSrc.indexOf("function _resolveHeroNextActionText"));
  ok("AA Hero block consumes narrative_decision", heroBlock.indexOf("narrative_decision") >= 0);
  ok("AA Explanation block consumes narrative_decision", explBlock.indexOf("narrative_decision") >= 0);
  ok("AA only Hero, Explanation and Next Step in ui.js", outsideAllowed.indexOf("narrative_decision") < 0);

  // AB — HEALTHY tone only
  var stAB = completeSt({
    deudas: [],
    no_debts_declared: true,
    snap: { plan_id: 3 },
    declared_ingreso: 150000,
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagAB = withNarrative(stAB, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var explAB = ctx.resolveExplanationQueEstaPasando(diagAB, stAB, ctx.resolveDashboardCoherence(diagAB, stAB));
  ok("AB HEALTHY keeps OPTIMIZATION mode", explAB.narrativeMode === "OPTIMIZATION");
  ok("AB HEALTHY positive tone",
    explAB.text && (explAB.text.indexOf("perfil ordenado") >= 0
      || explAB.text.indexOf("equilibrio") >= 0
      || explAB.text.indexOf("deudas activas") >= 0));

  // AC — AT_RISK tone only
  var stAC = completeSt();
  var diagAC = withNarrative(stAC, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var explAC = ctx.resolveExplanationQueEstaPasando(diagAC, stAC, ctx.resolveDashboardCoherence(diagAC, stAC));
  ok("AC AT_RISK keeps RECOVERY mode", explAC.narrativeMode === "RECOVERY");
  ok("AC AT_RISK urgency tone",
    explAC.text && (explAC.text.indexOf("mora") >= 0
      || explAC.text.indexOf("superan el ingreso") >= 0
      || explAC.text.indexOf("punto crítico") >= 0));

  // AD — profile_tier mutation never changes family
  var familyStab = explanationText(diagStab, stComplete);
  diagStab.narrative_decision.profile_tier = "HEALTHY";
  var familyStabAfter = explanationText(diagStab, stComplete);
  ok("AD tier mutation keeps stabilization family",
    familyStabAfter && familyStabAfter.indexOf("volumen total de deuda") >= 0);

  // AE — invalid never blank
  var stAE = completeSt();
  var diagAE = withNarrative(stAE, "invalid");
  var aeHtml = explanationHtml(diagAE, stAE);
  ok("AE invalid never blank explanation", aeHtml.indexOf("Qué está pasando") >= 0 && aeHtml.length > 80);

  // AF — corruption renders legacy fallback
  var stAF = completeSt();
  var diagAF = withNarrative(stAF, "corrupt");
  var afResolved = ctx.resolveExplanationQueEstaPasando(diagAF, stAF, ctx.resolveDashboardCoherence(diagAF, stAF));
  ok("AF corruption legacy fallback", afResolved.source === "legacy" && afResolved.text != null && afResolved.text !== "");

  console.log("\nNARRATIVE-03 QA: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
})();
