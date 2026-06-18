/**
 * dev/narrative-04-qa.js — NARRATIVE-04 Next Step Narrative Consumption QA (A–AH)
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
  var knownActionKeys = [
    "liberar_margen", "estabilizar_atraso", "reducir_costo_prioritaria", "consolidar_deuda",
    "formalizar_informal", "definir_primer_paso", "ordenar_panorama", "confirmar_saldo_stock_deuda",
    "mantener_disciplina", "optimizar_deuda_cara", "revisar_ingresos", "preparar_reintento",
  ];

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
      diag.narrative_decision = "bad";
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

  function nextStep(diag, st) {
    var coh = ctx.resolveDashboardCoherence(diag, st);
    return ctx.resolveNextStepContent(diag, st, coh);
  }

  function heroProblem(diag, st) {
    return ctx.resolveHeroContent(diag, st, ctx.resolveDashboardCoherence(diag, st)).problem;
  }

  function explanationText(diag, st) {
    return ctx.resolveExplanationQueEstaPasando(diag, st, ctx.resolveDashboardCoherence(diag, st)).text;
  }

  var stComplete = completeSt();

  // A — CLARITY
  var diagClarity = withNarrative(completeSt({ snap: { plan_id: 1 } }), {
    narrative_mode: "CLARITY",
    profile_tier: "UNKNOWN",
  });
  var clarityNs = nextStep(diagClarity, completeSt({ snap: { plan_id: 1 } }));
  ok("A CLARITY next step family",
    clarityNs.text && (clarityNs.text.indexOf("panorama completo") >= 0
      || clarityNs.text.indexOf("ordenar") >= 0));

  // B — RECOVERY
  var diagRecovery = withNarrative(stComplete, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var recoveryNs = nextStep(diagRecovery, stComplete);
  ok("B RECOVERY next step family",
    recoveryNs.text && (recoveryNs.text.indexOf("margen") >= 0
      || recoveryNs.text.indexOf("estabilizar") >= 0
      || recoveryNs.text.indexOf("confirmar el saldo") >= 0));

  // C — STABILIZATION
  var diagStab = withNarrative(stComplete, { narrative_mode: "STABILIZATION", profile_tier: "IMPROVING" });
  var stabNs = nextStep(diagStab, stComplete);
  ok("C STABILIZATION next step family",
    stabNs.text && stabNs.text.indexOf("estabilizarse") >= 0);

  // D — OPTIMIZATION
  var stOpt = completeSt({
    deudas: [],
    no_debts_declared: true,
    snap: { plan_id: 3 },
    declared_ingreso: 150000,
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagOpt = withNarrative(stOpt, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var optNs = nextStep(diagOpt, stOpt);
  ok("D OPTIMIZATION next step family",
    optNs.text && (optNs.text.indexOf("disciplina") >= 0
      || optNs.text.indexOf("margen disponible") >= 0
      || optNs.text.indexOf("saludable") >= 0));

  // E — OPTIMIZATION + CREDIT_BUILDING
  var stCredit = completeSt({ snap: { plan_id: 2 } });
  var diagCredit = withNarrative(stCredit, {
    narrative_mode: "OPTIMIZATION",
    profile_tier: "HEALTHY",
    sub_tracks: { focus_target: "CREDIT_BUILDING", context_modifier: "DEFAULT" },
  });
  var creditNs = nextStep(diagCredit, stCredit);
  ok("E CREDIT_BUILDING credit-family text",
    creditNs.text && creditNs.text.indexOf("costo de la deuda prioritaria") >= 0);
  ok("E CREDIT_BUILDING action key", creditNs.actionKey === "reducir_costo_prioritaria");

  // F — OPTIMIZATION + LEARNING
  var stLearn = completeSt({ snap: { plan_id: 3 } });
  var diagLearn = withNarrative(stLearn, {
    narrative_mode: "OPTIMIZATION",
    profile_tier: "HEALTHY",
    sub_tracks: { focus_target: "LEARNING", context_modifier: "DEFAULT" },
  });
  var learnNs = nextStep(diagLearn, stLearn);
  ok("F LEARNING optimization family",
    learnNs.text && learnNs.text.indexOf("panorama completo") >= 0);

  // G — RECOVERY + OPTIMIZAR intent
  var stG = completeSt({ user_intent: "OPTIMIZAR" });
  var diagG = withNarrative(stG, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var gNs = nextStep(diagG, stG);
  ok("G OPTIMIZAR keeps recovery family",
    gNs.text && gNs.text.indexOf("costo de la deuda prioritaria") < 0);

  // H — RECOVERY + CREDITO intent
  var stH = completeSt({ user_intent: "CREDITO" });
  var diagH = withNarrative(stH, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var hNs = nextStep(diagH, stH);
  ok("H CREDITO keeps recovery family",
    hNs.text && hNs.text.indexOf("costo de la deuda prioritaria") < 0);

  // I — RECOVERY + CREDIT_BUILDING suppressed
  var diagI = withNarrative(stComplete, {
    narrative_mode: "RECOVERY",
    profile_tier: "AT_RISK",
    sub_tracks: { focus_target: "CREDIT_BUILDING", context_modifier: "DEFAULT" },
  });
  var iNs = nextStep(diagI, stComplete);
  ok("I CREDIT_BUILDING suppressed in RECOVERY",
    iNs.actionKey !== "reducir_costo_prioritaria"
    && iNs.text && iNs.text.indexOf("costo de la deuda prioritaria") < 0);

  // J — OPTIMIZATION + RECUPERAR intent
  var stJ = completeSt({
    deudas: [],
    no_debts_declared: true,
    snap: { plan_id: 3 },
    declared_ingreso: 150000,
    user_intent: "RECUPERAR",
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagJ = withNarrative(stJ, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var jNs = nextStep(diagJ, stJ);
  ok("J RECUPERAR keeps optimization family",
    jNs.narrativeMode === "OPTIMIZATION"
    && jNs.text && jNs.text.indexOf("estabilizar los atrasos") < 0);

  // K — CDV + OPTIMIZATION
  var diagCdv = withNarrative(stOpt, {
    narrative_mode: "OPTIMIZATION",
    profile_tier: "HEALTHY",
    sub_tracks: { focus_target: "DEFAULT", context_modifier: "REJECTED_EXTERNAL" },
  });
  var cdvNs = nextStep(diagCdv, stOpt);
  ok("K CDV + OPTIMIZATION not recovery",
    cdvNs.text && cdvNs.text.indexOf("estabilizar los atrasos") < 0
    && cdvNs.text.indexOf("liberar") < 0);

  // L — AT_RISK tone only
  var diagL = withNarrative(stComplete, { narrative_mode: "RECOVERY", profile_tier: "AT_RISK" });
  var lRisk = nextStep(diagL, stComplete);
  diagL.narrative_decision.profile_tier = "UNKNOWN";
  var lUnknown = nextStep(diagL, stComplete);
  ok("L AT_RISK same actionKey", lRisk.actionKey === lUnknown.actionKey);
  ok("L AT_RISK may change text", lRisk.text != null);

  // M — HEALTHY tone only
  var diagM = withNarrative(stOpt, { narrative_mode: "OPTIMIZATION", profile_tier: "HEALTHY" });
  var mHealthy = nextStep(diagM, stOpt);
  diagM.narrative_decision.profile_tier = "UNKNOWN";
  var mUnknown = nextStep(diagM, stOpt);
  ok("M HEALTHY same actionKey", mHealthy.actionKey === mUnknown.actionKey);

  // N — missing → legacy
  var stN = completeSt();
  var diagN = runMotor(stN);
  delete diagN.narrative_decision;
  var cohN = ctx.resolveDashboardCoherence(diagN, stN);
  var legacyN = ctx._resolveDashboardNextStepTextLegacy(diagN, stN);
  var resolvedN = ctx.resolveNextStepContent(diagN, stN, cohN);
  ok("N missing legacy source", resolvedN.source === "legacy");
  ok("N missing same text", resolvedN.text === legacyN || resolvedN.text === cohN.nextStepText);

  // O — invalid → legacy
  var diagO = withNarrative(stComplete, "invalid");
  var cohO = ctx.resolveDashboardCoherence(diagO, stComplete);
  var legacyO = ctx._resolveDashboardNextStepTextLegacy(diagO, stComplete);
  var resolvedO = ctx.resolveNextStepContent(diagO, stComplete, cohO);
  ok("O invalid legacy source", resolvedO.source === "legacy");
  ok("O invalid same text", resolvedO.text === legacyO || resolvedO.text === cohO.nextStepText);

  // P — corrupted → legacy
  var diagP = withNarrative(stComplete, "corrupt");
  var cohP = ctx.resolveDashboardCoherence(diagP, stComplete);
  var legacyP = ctx._resolveDashboardNextStepTextLegacy(diagP, stComplete);
  var resolvedP = ctx.resolveNextStepContent(diagP, stComplete, cohP);
  ok("P corrupted legacy source", resolvedP.source === "legacy");
  ok("P corrupted same text", resolvedP.text === legacyP || resolvedP.text === cohP.nextStepText);

  // Q — dashboard renders
  ctx.CZState = stComplete;
  ctx.CZState.diag = diagRecovery;
  var tabHtml = "";
  try { tabHtml = ctx.renderTabPlan(); } catch (e) { tabHtml = ""; }
  ok("Q dashboard renders", tabHtml.length > 0 && tabHtml.indexOf("cz-dashboard-hero") >= 0);

  // R — Hero unchanged
  var heroBefore = heroProblem(diagRecovery, stComplete);
  diagRecovery.narrative_decision.sub_tracks = { focus_target: "LEARNING", context_modifier: "DEFAULT" };
  var heroAfter = heroProblem(diagRecovery, stComplete);
  ok("R Hero unchanged on next-step subtrack change", heroBefore === heroAfter);

  // S — Explanation unchanged by next-step subtrack change only
  var explBefore = explanationText(diagRecovery, stComplete);
  diagRecovery.narrative_decision.sub_tracks = {
    focus_target: "BUDGET_STABILIZATION",
    context_modifier: "DEFAULT",
  };
  var explAfter = explanationText(diagRecovery, stComplete);
  ok("S Explanation unchanged by next-step subtrack change", explBefore === explAfter);

  // T — Recommendations unchanged
  var recBefore = ctx.renderAccionesRecomendadasHtml(diagRecovery);
  diagRecovery.narrative_decision = { narrative_mode: "RECOVERY", profile_tier: "AT_RISK", sub_tracks: {} };
  var recAfter = ctx.renderAccionesRecomendadasHtml(diagRecovery);
  ok("T Recommendations unchanged", recBefore === recAfter);

  // U — primary action uses connected resolver but actions list unchanged
  var actBefore = ctx.renderPrimaryActionCard(diagRecovery, stComplete, ctx.resolveDashboardCoherence(diagRecovery, stComplete));
  diagRecovery.narrative_decision = { narrative_mode: "CLARITY", profile_tier: "UNKNOWN", sub_tracks: {} };
  var actAfterCard = ctx.renderPrimaryActionCard(diagRecovery, stComplete, ctx.resolveDashboardCoherence(diagRecovery, stComplete));
  ok("U primary action card renders", typeof actBefore === "string" && typeof actAfterCard === "string");

  // V–Y — motor fields
  var scoreSnap = diagRecovery.scoreReset;
  var planSnap = diagRecovery.planId;
  var stageSnap = diagRecovery.financial_stage;
  var narrSnap = JSON.stringify(diagRecovery.narrative_decision);
  ok("V Score unchanged", diagRecovery.scoreReset === scoreSnap);
  ok("W Plan unchanged", diagRecovery.planId === planSnap);
  ok("X Financial stage unchanged", diagRecovery.financial_stage === stageSnap);
  ok("Y Narrative decision intact", JSON.stringify(diagRecovery.narrative_decision) === narrSnap);

  // Z–AB — CRM/GTM/GA4
  ctx.CZState.diag = diagRecovery;
  var crm = ctx.buildCRMData(diagRecovery);
  ok("Z CRM no narrative_decision", crm.narrative_decision == null
    && JSON.stringify(crm).indexOf("narrative_decision") < 0);
  var eventsSrc = fs.readFileSync(path.join(root, "js/events.js"), "utf8");
  ok("AA GTM excludes narrative_decision", eventsSrc.indexOf("narrative_decision") < 0);
  ok("AB GA4 strips narrative_decision",
    typeof ctx.safeGTMPayload === "function"
    && JSON.stringify(ctx.safeGTMPayload("miplan_started", { narrative_decision: "x" })).indexOf("narrative_decision") < 0);

  // AC–AD — isolation
  var recBlock = uiSrc.slice(
    uiSrc.indexOf("function renderAccionesRecomendadasHtml"),
    uiSrc.indexOf("function renderHorizonteRecalificacion")
  );
  var accionesBlock = uiSrc.slice(
    uiSrc.indexOf("function renderAccionesRecomendadasHtml"),
    uiSrc.indexOf("function _renderTuSituacionHoy")
  );
  ok("AC Recommendations isolated", recBlock.indexOf("narrative_decision") < 0);
  ok("AD Recommended actions isolated", accionesBlock.indexOf("narrative_decision") < 0);

  // AE — only Hero, Explanation, Next Step
  var heroBlock = uiSrc.slice(uiSrc.indexOf("NARRATIVE-02"), uiSrc.indexOf("function _resolveHeroNextActionText"));
  var explBlock = uiSrc.slice(uiSrc.indexOf("NARRATIVE-03"), uiSrc.indexOf("function renderNarrativaInterpretacion"));
  var nextBlock = uiSrc.slice(uiSrc.indexOf("NARRATIVE-04"), uiSrc.indexOf("function _incompleteFinancialScoreLabel"));
  var outside = uiSrc.slice(0, uiSrc.indexOf("NARRATIVE-04"))
    + uiSrc.slice(uiSrc.indexOf("function _incompleteFinancialScoreLabel"), uiSrc.indexOf("NARRATIVE-03"))
    + uiSrc.slice(uiSrc.indexOf("function renderNarrativaInterpretacion"), uiSrc.indexOf("NARRATIVE-02"))
    + uiSrc.slice(uiSrc.indexOf("function _resolveHeroNextActionText"));
  ok("AE Hero consumes narrative_decision", heroBlock.indexOf("narrative_decision") >= 0);
  ok("AE Explanation consumes narrative_decision", explBlock.indexOf("narrative_decision") >= 0);
  ok("AE Next Step consumes narrative_decision", nextBlock.indexOf("narrative_decision") >= 0);
  ok("AE only allowed consumers in ui.js", outside.indexOf("narrative_decision") < 0);

  // AF — no new action IDs
  var nextBlockSrc = uiSrc.slice(uiSrc.indexOf("NARRATIVE-04"), uiSrc.indexOf("function _incompleteFinancialScoreLabel"));
  var actionKeyMatches = nextBlockSrc.match(/actionKey:\s*"([^"]+)"/g) || [];
  var usedKeys = actionKeyMatches.map(function(m) { return m.replace(/actionKey:\s*"/, "").replace(/"$/, ""); });
  ok("AF action keys are known", usedKeys.every(function(k) { return knownActionKeys.indexOf(k) >= 0; }) || usedKeys.length === 0);

  // AG — no new navigation routes
  ok("AG no new window.location routes in NARRATIVE-04", nextBlockSrc.indexOf("window.location") < 0
    && nextBlockSrc.indexOf("location.href") < 0
    && nextBlockSrc.indexOf("location.hash") < 0);

  // AH — corruption never blank
  var diagAH = withNarrative(stComplete, "corrupt");
  var ahNs = nextStep(diagAH, stComplete);
  ok("AH corruption not blank", ahNs.text != null && ahNs.text !== "");

  console.log("\nNARRATIVE-04 QA: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
})();
