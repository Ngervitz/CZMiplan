/**
 * dev/actions-arch-02-qa.js — ACTIONS-ARCH-02 Narrative Taxonomy Filter QA (A–AF)
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
    localStorage: {
      getItem: function() { return null; },
      setItem: function() { ctx._localStorageWrites = ctx._localStorageWrites || []; ctx._localStorageWrites.push(arguments); },
      removeItem: function() {},
    },
    sessionStorage: { getItem: function() { return null; }, setItem: function() {} },
    trackEvent: function() { ctx._gtmEvents = ctx._gtmEvents || []; ctx._gtmEvents.push(arguments); },
    trackCRMEvent: function() { ctx._crmEvents = ctx._crmEvents || []; ctx._crmEvents.push(arguments); },
    document: { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} },
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.location = {
    search: "?nombre=QA&ingreso=45000&p1=B&p2=B&p3=B&p4=B&p5=B&p6=A&p7=B&p8=B&p9=B&p10=B",
    href: "",
  };
  ctx._localStorageWrites = [];
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
  load("js/actionNarrativeTaxonomy.js");
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");
  load("js/app.js");

  var algoSrc = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var crmSrc = fs.readFileSync(path.join(root, "js/crm.js"), "utf8");

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
      deudas: [{
        acreedor: "Banco",
        monto: "80000",
        pago: "12000",
        tipo: "prestamo",
        situacion_ui: "mora_30_60",
        estado: "en_mora",
      }],
      gastos: { vivienda: 22000, alimentacion: 16000 },
      user_intent: null,
    }, overrides || {});
  }

  function bootMotor(st) {
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

  function withMode(diag, mode) {
    diag.narrative_decision = {
      narrative_mode: mode,
      profile_tier: mode === "RECOVERY" ? "AT_RISK"
        : mode === "STABILIZATION" ? "IMPROVING"
        : mode === "OPTIMIZATION" ? "HEALTHY" : "UNKNOWN",
      sub_tracks: { focus_target: "DEFAULT", context_modifier: "DEFAULT" },
    };
    return diag;
  }

  function allowedFamiliesForMode(mode) {
    if (mode === "RECOVERY") return ["RECOVERY", "UNIVERSAL"];
    if (mode === "STABILIZATION") return ["STABILIZATION", "LEARNING", "UNIVERSAL"];
    if (mode === "OPTIMIZATION") return ["OPTIMIZATION", "LEARNING", "UNIVERSAL"];
    if (mode === "CLARITY") return ["LEARNING", "UNIVERSAL"];
    return [];
  }

  function actionAllowedForMode(actionId, mode) {
    if (mode === "CLARITY") {
      if (actionId === "confirmar_saldo_stock_deuda" || actionId === "ordenar_panorama") return true;
    }
    var families = ctx.getMasterActionNarrativeFamilies(actionId);
    if (!families.length) return false;
    var allowed = allowedFamiliesForMode(mode);
    for (var i = 0; i < families.length; i++) {
      if (allowed.indexOf(families[i]) >= 0) return true;
    }
    return false;
  }

  function allActionsAllowed(actions, mode) {
    for (var i = 0; i < actions.length; i++) {
      if (!actionAllowedForMode(actions[i].id, mode)) return false;
    }
    return actions.length > 0;
  }

  // A — RECOVERY
  var stRecovery = completeSt();
  var diagRecovery = withMode(bootMotor(stRecovery), "RECOVERY");
  var recActions = ctx.seleccionarAccionesRecomendadas(diagRecovery);
  ok("A RECOVERY actions allowed", allActionsAllowed(recActions, "RECOVERY"));
  ok("A RECOVERY selection_mode taxonomy", diagRecovery.action_selection_mode === "taxonomy");

  // B — STABILIZATION
  var stStab = completeSt({
    deudas: [{
      acreedor: "Banco",
      monto: "40000",
      pago: "8000",
      tipo: "prestamo",
      situacion_ui: "pagando_normal",
      estado: "al_dia",
    }],
    gastos: { vivienda: 18000, alimentacion: 12000 },
  });
  var diagStab = withMode(bootMotor(stStab), "STABILIZATION");
  var stabActions = ctx.seleccionarAccionesRecomendadas(diagStab);
  ok("B STABILIZATION actions allowed", allActionsAllowed(stabActions, "STABILIZATION"));
  ok("B STABILIZATION selection_mode taxonomy", diagStab.action_selection_mode === "taxonomy");

  // C — OPTIMIZATION
  var diagC = { narrative_decision: { narrative_mode: "OPTIMIZATION" } };
  var filteredC = ctx.applyNarrativeTaxonomyFilterToSelected(diagC, [
    { id: "historial_6_meses" },
    { id: "bcu_clearing_distintos" },
    { id: "verificar_antes_solicitar" },
    { id: "gasto_mayor_categoria" },
    { id: "convenio_mora_temprana" },
  ]);
  ok("C OPTIMIZATION actions allowed", allActionsAllowed(filteredC, "OPTIMIZATION"));
  ok("C OPTIMIZATION selection_mode taxonomy", diagC.action_selection_mode === "taxonomy");
  ok("C OPTIMIZATION excludes recovery-only", filteredC.every(function(a) {
    return a.id !== "gasto_mayor_categoria" && a.id !== "convenio_mora_temprana";
  }));

  // D — CLARITY
  var diagD = { narrative_decision: { narrative_mode: "CLARITY" } };
  var filteredD = ctx.applyNarrativeTaxonomyFilterToSelected(diagD, [
    { id: "bcu_clearing_distintos" },
    { id: "bcu_categoria_real" },
    { id: "verificar_antes_solicitar" },
    { id: "flujo_libre_positivo" },
    { id: "historial_6_meses" },
    { id: "ordenar_panorama" },
  ]);
  ok("D CLARITY actions allowed", allActionsAllowed(filteredD, "CLARITY"));
  ok("D CLARITY selection_mode taxonomy", diagD.action_selection_mode === "taxonomy");
  ok("D CLARITY allows diagnostic stabilization key", filteredD.some(function(a) {
    return a.id === "ordenar_panorama";
  }));
  ok("D CLARITY excludes broad stabilization", filteredD.every(function(a) {
    return a.id !== "flujo_libre_positivo" && a.id !== "historial_6_meses";
  }));

  // E — filtered >= 3 uses taxonomy
  var diagE = { narrative_decision: { narrative_mode: "RECOVERY" } };
  var candidatesE = [
    { id: "bcu_clearing_distintos" },
    { id: "gasto_mayor_categoria" },
    { id: "convenio_mora_temprana" },
    { id: "historial_6_meses" },
    { id: "flujo_libre_positivo" },
  ];
  var filteredE = ctx.applyNarrativeTaxonomyFilterToSelected(diagE, candidatesE.slice());
  ok("E filtered >= 3", filteredE.length >= 3);
  ok("E selection_mode taxonomy", diagE.action_selection_mode === "taxonomy");
  ok("E excludes optimization-only", filteredE.every(function(a) { return a.id !== "historial_6_meses"; }));

  // F — filtered < 3 legacy fallback
  var diagF = { narrative_decision: { narrative_mode: "RECOVERY" } };
  var candidatesF = [
    { id: "historial_6_meses" },
    { id: "flujo_libre_positivo" },
    { id: "bcu_post_regularizacion" },
    { id: "verificar_antes_solicitar" },
    { id: "bcu_categoria_real" },
  ];
  var filteredF = ctx.applyNarrativeTaxonomyFilterToSelected(diagF, candidatesF.slice());
  ok("F legacy fallback mode", diagF.action_selection_mode === "legacy_fallback");
  ok("F legacy restores candidates", filteredF.length === candidatesF.length);
  ok("F action count >= 3", filteredF.length >= 3);
  ok("F discard count set", typeof diagF.taxonomy_discard_count === "number" && diagF.taxonomy_discard_count > 0);

  // G — missing narrative_decision
  var diagG = bootMotor(completeSt());
  delete diagG.narrative_decision;
  var actionsG = ctx.seleccionarAccionesRecomendadas(diagG);
  ok("G missing narrative no crash", Array.isArray(actionsG) && actionsG.length >= 3);
  ok("G legacy fallback", diagG.action_selection_mode === "legacy_fallback");

  // H — invalid narrative_mode
  var diagH = bootMotor(completeSt());
  diagH.narrative_decision = { narrative_mode: "BOGUS", profile_tier: "UNKNOWN", sub_tracks: {} };
  var actionsH = ctx.seleccionarAccionesRecomendadas(diagH);
  ok("H invalid mode no crash", Array.isArray(actionsH) && actionsH.length >= 3);
  ok("H legacy fallback", diagH.action_selection_mode === "legacy_fallback");

  // I — missing ActionNarrativeTaxonomy
  var savedTaxonomy = ctx.ActionNarrativeTaxonomy;
  var savedGetter = ctx.getMasterActionNarrativeFamilies;
  ctx.ActionNarrativeTaxonomy = undefined;
  ctx.getMasterActionNarrativeFamilies = undefined;
  var diagI = withMode(bootMotor(completeSt()), "RECOVERY");
  var actionsI = ctx.seleccionarAccionesRecomendadas(diagI);
  ok("I missing taxonomy no crash", Array.isArray(actionsI) && actionsI.length >= 3);
  ok("I legacy fallback", diagI.action_selection_mode === "legacy_fallback");
  ctx.ActionNarrativeTaxonomy = savedTaxonomy;
  ctx.getMasterActionNarrativeFamilies = savedGetter;

  // J — unknown taxonomy action excluded during filtering
  var diagJ = { narrative_decision: { narrative_mode: "RECOVERY" } };
  var candidatesJ = [
    { id: "bcu_clearing_distintos" },
    { id: "totally_unknown_action_key" },
    { id: "gasto_mayor_categoria" },
    { id: "contactar_antes_intimacion" },
  ];
  var filteredJ = ctx.applyNarrativeTaxonomyFilterToSelected(diagJ, candidatesJ.slice());
  ok("J excludes unknown key", filteredJ.every(function(a) { return a.id !== "totally_unknown_action_key"; }));

  // K — malformed candidate entries
  var diagK = { narrative_decision: { narrative_mode: "RECOVERY" } };
  var crashed = false;
  var filteredK = [];
  try {
    filteredK = ctx.applyNarrativeTaxonomyFilterToSelected(diagK, [
      { id: "bcu_clearing_distintos" },
      null,
      undefined,
      "bad-entry",
      { id: "gasto_mayor_categoria" },
      { id: "contactar_antes_intimacion" },
    ]);
  } catch (e) {
    crashed = true;
  }
  ok("K malformed no crash", crashed === false);
  ok("K malformed filtered safely", filteredK.length === 3 && diagK.action_selection_mode === "taxonomy");
  ok("K malformed excluded from output", filteredK.every(function(a) {
    return a && typeof a === "object" && a.id;
  }));

  // L — still returns array
  var actionsL = ctx.seleccionarAccionesRecomendadas(withMode(bootMotor(completeSt()), "STABILIZATION"));
  ok("L returns array", Array.isArray(actionsL));

  // M — no public shape change
  ok("M plain array items", actionsL.length > 0 && typeof actionsL[0].id === "string" && actionsL[0].actions == null);

  // N — not in CRM payload
  var diagN = withMode(bootMotor(completeSt()), "RECOVERY");
  ctx.seleccionarAccionesRecomendadas(diagN);
  var crmPayload = ctx.buildCRMData(diagN);
  ok("N CRM no action_selection_mode", crmPayload.action_selection_mode == null);
  ok("N CRM no taxonomy_discard_count", crmPayload.taxonomy_discard_count == null);

  // O — not in GTM payload (trackEvent args)
  ctx._gtmEvents = [];
  ctx.CZState = completeSt();
  ctx.CZState.diag = diagN;
  ctx.renderAccionesRecomendadasHtml(diagN);
  var gtmHasMeta = ctx._gtmEvents.some(function(args) {
    return JSON.stringify(args).indexOf("action_selection_mode") >= 0
      || JSON.stringify(args).indexOf("taxonomy_discard_count") >= 0;
  });
  ok("O GTM no selection meta", gtmHasMeta === false);

  // P — GA4 / analytics source unchanged
  ok("P analytics no selection meta in algo filter", algoSrc.indexOf("gtag") < 0 || algoSrc.indexOf("action_selection_mode") < 0);

  // Q — not in localStorage
  ctx._localStorageWrites = [];
  ctx.seleccionarAccionesRecomendadas(withMode(bootMotor(completeSt()), "OPTIMIZATION"));
  var lsHasMeta = (ctx._localStorageWrites || []).some(function(args) {
    return String(args[0] || "").indexOf("action_selection_mode") >= 0
      || String(args[1] || "").indexOf("action_selection_mode") >= 0;
  });
  ok("Q localStorage no selection meta", lsHasMeta === false);

  // R — not in URL params
  ok("R algo no URL param writes", algoSrc.indexOf("URLSearchParams") < 0 || algoSrc.indexOf("action_selection_mode") < 0);

  // S — taxonomy_discard_count internal only
  ok("S CRM build excludes discard count", crmSrc.indexOf("taxonomy_discard_count") < 0);

  // T — score unchanged
  var stT = completeSt();
  var diagT = bootMotor(stT);
  var scoreBefore = diagT.scoreReset;
  withMode(diagT, "RECOVERY");
  ctx.seleccionarAccionesRecomendadas(diagT);
  ok("T score unchanged", diagT.scoreReset === scoreBefore);

  // U — plan unchanged
  var planBefore = diagT.planId;
  ctx.seleccionarAccionesRecomendadas(diagT);
  ok("U plan unchanged", diagT.planId === planBefore);

  // V — financial stage unchanged
  var stageBefore = diagT.financial_stage;
  ctx.seleccionarAccionesRecomendadas(diagT);
  ok("V financial_stage unchanged", diagT.financial_stage === stageBefore);

  // W — narrative_decision unchanged (except intentional test overrides)
  var narrativeBefore = JSON.stringify(diagT.narrative_decision);
  ctx.seleccionarAccionesRecomendadas(diagT);
  ok("W narrative_decision unchanged", JSON.stringify(diagT.narrative_decision) === narrativeBefore);

  // X — B7 rendering unchanged
  ctx.PRE = { laboral: "relacion_dependencia", ingreso: 45000, respuestas: GOOD_SURVEY };
  ctx.CZState = completeSt();
  var b7Html = ctx.renderContextualActionBlock(ctx.resolveContextualActionSegment(diagT, ctx.CZState));
  ok("X B7 renders", b7Html.indexOf("cz-contextual-action-block") >= 0);
  ok("X B7 algo untouched", uiSrc.indexOf("resolveContextualActionSegment") >= 0);

  // Y — Plan5 fallback path still in ui (unchanged renderer)
  ok("Y Plan5 fallback fn exists", uiSrc.indexOf("_fallbackAccionesPlan5") >= 0);

  // Z — Next Step resolver unchanged
  ok("Z resolveNextStepContent exists", typeof ctx.resolveNextStepContent === "function");
  var ns = ctx.resolveNextStepContent(diagT, ctx.CZState, ctx.resolveDashboardCoherence(diagT, ctx.CZState));
  ok("Z next step text present", ns && typeof ns.text === "string" && ns.text.length > 0);

  // AA — Ver Más threshold (>=3 visible contract)
  var diagAa = withMode(bootMotor(completeSt()), "RECOVERY");
  var htmlAa = ctx.renderAccionesRecomendadasHtml(diagAa);
  ok("AA at least 3 action items", (htmlAa.match(/accion-recomendada-item/g) || []).length >= 3);

  // AB — render function unchanged signature
  ok("AB renderAcciones fn exists", typeof ctx.renderAccionesRecomendadasHtml === "function");

  // AC — acciones-recom patterns preserved
  ok("AC acciones title in render", htmlAa.indexOf("accion-recomendada-item") >= 0);

  // AD — no direct user_intent in filter block
  var filterBlock = algoSrc.split("ACTIONS-ARCH-02")[1].split("function _fallbackAccionesRecomendadas")[0];
  ok("AD filter no user_intent", filterBlock.indexOf("user_intent") < 0);

  // AE — no direct entry_context in filter block
  ok("AE filter no entry_context", filterBlock.indexOf("entry_context") < 0);

  // AF — no CDV-specific branches in filter block
  ok("AF filter no CDV branches", filterBlock.indexOf("cdv") < 0 && filterBlock.indexOf("CDV") < 0 && filterBlock.indexOf("rejection") < 0);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
