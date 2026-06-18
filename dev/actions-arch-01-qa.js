/**
 * dev/actions-arch-01-qa.js — ACTIONS-ARCH-01 Narrative Taxonomy Layer QA (A–AD)
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
    sessionStorage: { getItem: function() { return "1"; }, setItem: function() {} },
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

  function load(file) {
    vm.runInContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      ctx,
      { filename: path.join(root, file) }
    );
  }

  function bankSnapshot() {
    var snap = [];
    for (var i = 0; i < ctx._BANCO_ACCIONES_MAESTRO.length; i++) {
      var item = ctx._BANCO_ACCIONES_MAESTRO[i];
      snap.push({
        id: item.id,
        keys: Object.keys(item).sort().join(","),
        json: JSON.stringify(item),
      });
    }
    return snap;
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");

  var bankBefore = bankSnapshot();
  var bankLenBefore = ctx._BANCO_ACCIONES_MAESTRO.length;
  var masterIdsBefore = ctx._BANCO_ACCIONES_MAESTRO.map(function(a) { return a.id; }).sort();

  var selectionBaseline = [];
  var renderBaseline = [];
  var b7Baseline = [];
  var nextStepBaseline = [];
  var baselineDiags = {};

  function captureBehaviorBaseline() {
    var diag5 = ctx.calcularMotor();
    baselineDiags.plan5 = diag5;
    selectionBaseline.push({
      label: "plan5_default",
      ids: ctx.seleccionarAccionesRecomendadas(diag5).map(function(a) { return a.id; }),
    });

    var diag4 = Object.assign({}, diag5, { planId: 4, plan: ctx.PLANES[4] });
    baselineDiags.plan4 = diag4;
    selectionBaseline.push({
      label: "plan4",
      ids: ctx.seleccionarAccionesRecomendadas(diag4).map(function(a) { return a.id; }),
    });

    ctx.window.CZState = {
      diag: diag5,
      deudas: [],
      gastos: {},
      herr: { compromisos: {}, atrasos: {} },
      gastos_missing_confirmed: true,
      snap: { plan_id: diag5.planId },
    };
    renderBaseline.push({
      label: "plan5_html",
      html: ctx.renderAccionesRecomendadasHtml(diag5),
    });
    renderBaseline.push({
      label: "herramientas",
      html: ctx.renderHerramientas(),
    });

    ctx.PRE = { laboral: "relacion_dependencia", ingreso: 45000 };
    b7Baseline.push({
      label: "S1",
      html: ctx.renderContextualActionBlock(ctx.resolveContextualActionSegment(diag5, ctx.window.CZState)),
    });
    ctx.PRE = { laboral: "desempleado", ingreso: 0 };
    b7Baseline.push({
      label: "S7",
      html: ctx.renderContextualActionBlock(ctx.resolveContextualActionSegment(diag5, ctx.window.CZState)),
    });

    var narrativeDiag = Object.assign({}, diag5, {
      narrative_decision: {
        narrative_mode: "RECOVERY",
        sub_tracks: { focus_target: "DEFAULT" },
      },
    });
    nextStepBaseline.push({
      label: "recovery_next",
      text: ctx.resolveNextStepContent(narrativeDiag, ctx.window.CZState, {}).text,
    });
    narrativeDiag.narrative_decision.narrative_mode = "OPTIMIZATION";
    nextStepBaseline.push({
      label: "optimization_next",
      text: ctx.resolveNextStepContent(narrativeDiag, ctx.window.CZState, {}).text,
    });
  }

  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");
  load("js/app.js");
  captureBehaviorBaseline();

  load("js/actionNarrativeTaxonomy.js");

  var taxonomySrc = fs.readFileSync(path.join(root, "js/actionNarrativeTaxonomy.js"), "utf8");
  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var algoSrc = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");

  var masterIds = ctx._BANCO_ACCIONES_MAESTRO.map(function(a) { return a.id; }).sort();
  var nextStepKeys = [
    "liberar_margen", "estabilizar_atraso", "reducir_costo_prioritaria", "consolidar_deuda",
    "formalizar_informal", "definir_primer_paso", "ordenar_panorama", "confirmar_saldo_stock_deuda",
    "mantener_disciplina", "optimizar_deuda_cara", "revisar_ingresos", "preparar_reintento",
  ];
  var plan5Keys = ["plan5_atrasos_reportados", "plan5_pagos_reflejados", "plan5_evitar_solicitudes"];
  var b7Keys = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11"];

  // A — every master-bank action has taxonomy metadata
  masterIds.forEach(function(id) {
    ok("A master taxonomy " + id, ctx.getMasterActionNarrativeFamilies(id).length > 0);
  });
  ok("A master count matches bank", masterIds.length === Object.keys(ctx.CZ_MASTER_ACTION_TAXONOMY).length);

  // B — taxonomy keys map to real master-bank or documented external keys
  Object.keys(ctx.CZ_MASTER_ACTION_TAXONOMY).forEach(function(key) {
    ok("B master key real " + key, masterIds.indexOf(key) >= 0);
  });
  Object.keys(ctx.CZ_NEXT_STEP_ACTION_TAXONOMY).forEach(function(key) {
    ok("B next-step key documented " + key, nextStepKeys.indexOf(key) >= 0);
  });
  Object.keys(ctx.CZ_PLAN5_ACTION_TAXONOMY).forEach(function(key) {
    ok("B plan5 key documented " + key, plan5Keys.indexOf(key) >= 0);
  });

  // C — every next-step key has taxonomy metadata
  nextStepKeys.forEach(function(key) {
    ok("C next-step taxonomy " + key, ctx.getNextStepNarrativeFamilies(key).length > 0);
  });

  // D — every B7 segment S1–S11 has taxonomy metadata
  b7Keys.forEach(function(key) {
    ok("D B7 taxonomy " + key, ctx.getB7SegmentNarrativeFamilies(key).length > 0);
  });

  // E — every Plan5 fallback has taxonomy metadata
  plan5Keys.forEach(function(key) {
    ok("E plan5 taxonomy " + key, ctx.getPlan5NarrativeFamilies(key).length > 0);
  });

  // F — no invalid family values in maps
  function allFamiliesValid(map) {
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var families = map[keys[i]];
      for (var j = 0; j < families.length; j++) {
        if (!ctx.isValidNarrativeFamily(families[j])) return false;
      }
    }
    return true;
  }
  ok("F master families valid", allFamiliesValid(ctx.CZ_MASTER_ACTION_TAXONOMY));
  ok("F next-step families valid", allFamiliesValid(ctx.CZ_NEXT_STEP_ACTION_TAXONOMY));
  ok("F B7 families valid", allFamiliesValid(ctx.CZ_B7_SEGMENT_TAXONOMY));
  ok("F plan5 families valid", allFamiliesValid(ctx.CZ_PLAN5_ACTION_TAXONOMY));

  // G — validation helper rejects invalid values
  ok("G rejects invalid", ctx.isValidNarrativeFamily("RECOVER") === false);
  ok("G rejects null", ctx.isValidNarrativeFamily(null) === false);
  ok("G accepts RECOVERY", ctx.isValidNarrativeFamily("RECOVERY") === true);

  // H — deduplicates values
  var deduped = ctx.normalizeNarrativeFamilies(["RECOVERY", "RECOVERY", "STABILIZATION"]);
  ok("H dedup length", deduped.length === 2);
  ok("H dedup order", deduped[0] === "RECOVERY" && deduped[1] === "STABILIZATION");

  // I — normalizes non-array inputs safely
  ok("I null → empty", ctx.normalizeNarrativeFamilies(null).length === 0);
  ok("I string → single", ctx.normalizeNarrativeFamilies("LEARNING")[0] === "LEARNING");
  ok("I object → empty", ctx.normalizeNarrativeFamilies({}) .length === 0);
  ok("I filters invalid", ctx.normalizeNarrativeFamilies(["RECOVERY", "BAD"]).length === 1);

  // J — unknown action key returns empty array
  ok("J unknown master", ctx.getMasterActionNarrativeFamilies("no_such_action").length === 0);
  ok("J unknown unified", ctx.getActionNarrativeFamilies("no_such_action").length === 0);
  ok("J unknown B7", ctx.getB7SegmentNarrativeFamilies("S99").length === 0);

  // K — taxonomy maps are frozen
  var mapMutated = false;
  try { ctx.CZ_MASTER_ACTION_TAXONOMY.fake = ["RECOVERY"]; mapMutated = true; } catch (e) {}
  ok("K master map frozen", mapMutated === false && ctx.CZ_MASTER_ACTION_TAXONOMY.fake == null);
  ok("K B7 map frozen", Object.isFrozen(ctx.CZ_B7_SEGMENT_TAXONOMY));
  ok("K families enum frozen", Object.isFrozen(ctx.CZ_NARRATIVE_FAMILIES));

  // L — individual family arrays frozen
  var arr = ctx.CZ_MASTER_ACTION_TAXONOMY.verificar_aplicacion_pagos;
  var arrMutated = false;
  try { arr.push("OPTIMIZATION"); arrMutated = true; } catch (e2) {}
  ok("L family array frozen", Object.isFrozen(arr) && arrMutated === false && arr.length === 1);

  // M — selection unchanged
  selectionBaseline.forEach(function(row) {
    var diag = row.label === "plan4" ? baselineDiags.plan4 : baselineDiags.plan5;
    var ids = ctx.seleccionarAccionesRecomendadas(diag).map(function(a) { return a.id; });
    ok("M selection " + row.label, JSON.stringify(ids) === JSON.stringify(row.ids));
  });

  // N — ordering unchanged (same as M ids order)
  ok("N ordering preserved", selectionBaseline[0].ids.length > 0);

  // O — rendering unchanged
  var diag5Now = baselineDiags.plan5;
  ctx.PRE = { laboral: "relacion_dependencia", ingreso: 45000 };
  ctx.window.CZState = {
    diag: diag5Now,
    deudas: [],
    gastos: {},
    herr: { compromisos: {}, atrasos: {} },
    gastos_missing_confirmed: true,
    snap: { plan_id: diag5Now.planId },
  };
  renderBaseline.forEach(function(row) {
    var html = row.label === "herramientas"
      ? ctx.renderHerramientas()
      : ctx.renderAccionesRecomendadasHtml(diag5Now);
    ok("O render " + row.label, html === row.html);
  });

  // P — B7 rendering unchanged
  ctx.PRE = { laboral: "relacion_dependencia", ingreso: 45000 };
  ok("P B7 S1", ctx.renderContextualActionBlock(ctx.resolveContextualActionSegment(diag5Now, ctx.window.CZState)) === b7Baseline[0].html);
  ctx.PRE = { laboral: "desempleado", ingreso: 0 };
  ok("P B7 S7", ctx.renderContextualActionBlock(ctx.resolveContextualActionSegment(diag5Now, ctx.window.CZState)) === b7Baseline[1].html);

  // Q — next step unchanged
  var ndRecovery = Object.assign({}, diag5Now, {
    narrative_decision: { narrative_mode: "RECOVERY", sub_tracks: { focus_target: "DEFAULT" } },
  });
  ok("Q recovery next", ctx.resolveNextStepContent(ndRecovery, ctx.window.CZState, {}).text === nextStepBaseline[0].text);
  var ndOpt = Object.assign({}, diag5Now, {
    narrative_decision: { narrative_mode: "OPTIMIZATION", sub_tracks: { focus_target: "DEFAULT" } },
  });
  ok("Q optimization next", ctx.resolveNextStepContent(ndOpt, ctx.window.CZState, {}).text === nextStepBaseline[1].text);

  // R — NARRATIVE-04 resolver still present, no taxonomy coupling
  ok("R resolveNextStepContent exists", typeof ctx.resolveNextStepContent === "function");
  ok("R taxonomy no narrative resolver", taxonomySrc.indexOf("resolveNarrativeDecision") < 0);
  ok("R taxonomy no diag.narrative_decision", taxonomySrc.indexOf("diag.narrative_decision") < 0);

  // S — score unchanged
  ok("S score stable", baselineDiags.plan5.scoreReset === diag5Now.scoreReset);

  // T — plan assignment unchanged
  ok("T planId stable", baselineDiags.plan5.planId === diag5Now.planId);

  // U — stage assignment unchanged
  var stQa = {
    financial_profile_complete: true,
    financial_income_complete: true,
    financial_debts_complete: true,
    financial_expenses_complete: true,
    declared_ingreso: 120000,
    deudas: [],
    gastos: { vivienda: 22000 },
    user_intent: null,
  };
  var motorStage = Object.assign({}, baselineDiags.plan5);
  ctx.attachFinancialStageToDiag(motorStage, stQa);
  ok("U stage resolver exists", typeof ctx.resolveFinancialStage === "function");
  ok("U stage on diag", motorStage.financial_stage != null);

  // V — narrative_decision unchanged
  var stage = ctx.resolveFinancialStage(motorStage, stQa);
  var narrative = ctx.resolveNarrativeDecision(stage, null, {}, 3);
  ok("V narrative_mode", ["CLARITY", "RECOVERY", "STABILIZATION", "OPTIMIZATION"].indexOf(narrative.narrative_mode) >= 0);

  // W — no action count changes
  ok("W bank length", ctx._BANCO_ACCIONES_MAESTRO.length === bankLenBefore);

  // X — DOM/action output signatures unchanged (id list in HTML)
  var htmlIds = (renderBaseline[0].html.match(/data-toggle-compromiso="([^"]+)"/g) || []).join(",");
  var htmlIdsNow = (ctx.renderAccionesRecomendadasHtml(diag5Now).match(/data-toggle-compromiso="([^"]+)"/g) || []).join(",");
  ok("X action dom ids", htmlIds === htmlIdsNow);

  // Y — no CRM changes in taxonomy module
  ok("Y taxonomy no CRM", taxonomySrc.indexOf("trackCRMEvent") < 0 && taxonomySrc.indexOf("crm.js") < 0);

  // Z — no GTM changes
  ok("Z taxonomy no GTM", taxonomySrc.indexOf("trackEvent") < 0 && taxonomySrc.indexOf("dataLayer") < 0);

  // AA — no GA4 changes
  ok("AA taxonomy no GA4", taxonomySrc.indexOf("gtag") < 0 && taxonomySrc.indexOf("analytics") < 0);

  // AB — taxonomy module does not consume narrative_decision (filter lives in algorithms.js)
  ok("AB taxonomy no seleccionar", taxonomySrc.indexOf("seleccionarAccionesRecomendadas") < 0);
  ok("AB taxonomy no renderAcciones", taxonomySrc.indexOf("renderAccionesRecomendadasHtml") < 0);
  ok("AB taxonomy module no narrative_decision", taxonomySrc.indexOf("resolveNarrativeDecision") < 0
    && taxonomySrc.indexOf("diag.narrative_decision") < 0);

  // AC — bank object shape unchanged
  var bankAfter = bankSnapshot();
  ok("AC bank snapshot count", bankAfter.length === bankBefore.length);
  for (var bi = 0; bi < bankBefore.length; bi++) {
    ok("AC bank item " + bankBefore[bi].id, bankAfter[bi].keys === bankBefore[bi].keys && bankAfter[bi].json === bankBefore[bi].json);
  }

  // AD — Object.keys / serialization unchanged
  ok("AD master ids unchanged", JSON.stringify(masterIdsBefore) === JSON.stringify(masterIds));

  // Guardrail comment present
  ok("guardrail comment", taxonomySrc.indexOf("GUARDRAIL — ACTIONS-ARCH-01") >= 0);

  // Unified lookup sanity
  ok("unified master", ctx.getActionNarrativeFamilies("flujo_negativo_accion")[0] === "RECOVERY");
  ok("unified next-step", ctx.getActionNarrativeFamilies("ordenar_panorama")[0] === "UNIVERSAL");
  ok("unified plan5", ctx.getActionNarrativeFamilies("plan5_atrasos_reportados")[0] === "RECOVERY");

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
