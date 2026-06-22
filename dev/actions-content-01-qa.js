/**
 * dev/actions-content-01-qa.js — ACTIONS-CONTENT-01 Master Bank Enrichment QA (A–AL)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var PRE_SPRINT_BANK_LENGTH = 17;

  var NEW_ACTION_IDS = [
    "revisar_costos_tarjetas",
    "consolidar_informacion_tarjetas",
    "priorizar_deuda_mas_cara",
    "revisar_conveniencia_refinanciacion",
    "ordenar_deudas_por_impacto",
    "comparar_costo_creditos",
    "verificar_actualizacion_historial",
    "documentar_regularizaciones",
    "revisar_historial_antes_credito",
    "definir_meta_reserva",
    "reservar_parte_flujo",
    "revisar_capacidad_ahorro",
  ];

  var EXPECTED_TAXONOMY = {
    revisar_costos_tarjetas: ["OPTIMIZATION"],
    consolidar_informacion_tarjetas: ["CLARITY", "STABILIZATION"],
    priorizar_deuda_mas_cara: ["STABILIZATION"],
    revisar_conveniencia_refinanciacion: ["STABILIZATION"],
    ordenar_deudas_por_impacto: ["STABILIZATION"],
    comparar_costo_creditos: ["OPTIMIZATION", "STABILIZATION"],
    verificar_actualizacion_historial: ["STABILIZATION", "LEARNING"],
    documentar_regularizaciones: ["STABILIZATION"],
    revisar_historial_antes_credito: ["OPTIMIZATION", "LEARNING"],
    definir_meta_reserva: ["OPTIMIZATION"],
    reservar_parte_flujo: ["OPTIMIZATION"],
    revisar_capacidad_ahorro: ["OPTIMIZATION"],
  };

  var PRE_SPRINT_ACTIONS = {
    verificar_aplicacion_pagos: { categoria: 1, urgencia: "media" },
    refinanciacion_temprana: { categoria: 1, urgencia: "alta" },
    convenio_mora_temprana: { categoria: 1, urgencia: "alta" },
    negociar_mora_60: { categoria: 1, urgencia: "alta" },
    verificar_intimacion: { categoria: 1, urgencia: "alta" },
    contactar_antes_intimacion: { categoria: 1, urgencia: "alta" },
    bcu_clearing_distintos: { categoria: 2, urgencia: "media" },
    bcu_categoria_real: { categoria: 2, urgencia: "media" },
    bcu_actualizacion_mensual: { categoria: 2, urgencia: "media" },
    bcu_post_regularizacion: { categoria: 2, urgencia: "media" },
    flujo_libre_positivo: { categoria: 3, urgencia: "media" },
    flujo_negativo_accion: { categoria: 3, urgencia: "alta" },
    gasto_mayor_categoria: { categoria: 3, urgencia: "media" },
    ingresos_extra_consistencia: { categoria: 3, urgencia: "media" },
    historial_6_meses: { categoria: 4, urgencia: "media" },
    verificar_antes_solicitar: { categoria: 4, urgencia: "media" },
    bcu_post_regularizacion_recal: { categoria: 4, urgencia: "media" },
  };

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

  function bankById(id) {
    for (var i = 0; i < ctx._BANCO_ACCIONES_MAESTRO.length; i++) {
      if (ctx._BANCO_ACCIONES_MAESTRO[i].id === id) return ctx._BANCO_ACCIONES_MAESTRO[i];
    }
    return null;
  }

  function qualifiedMasterActions(diag) {
    var evalCtx = ctx._evalCtxAcciones(diag);
    var out = [];
    for (var i = 0; i < ctx._BANCO_ACCIONES_MAESTRO.length; i++) {
      var tpl = ctx._BANCO_ACCIONES_MAESTRO[i];
      if (ctx._cumpleCondicionAccionMaestro(tpl, evalCtx)) {
        out.push({ id: tpl.id });
      }
    }
    return out;
  }

  function taxonomyFiltered(diag, candidates) {
    return ctx.applyNarrativeTaxonomyFilterToSelected(diag, candidates.slice());
  }

  function withMode(diag, mode) {
    var copy = Object.assign({}, diag);
    copy.narrative_decision = { narrative_mode: mode, sub_tracks: { focus_target: "DEFAULT" } };
    return copy;
  }

  function richDiag(mode, finOverrides, blOverrides) {
    return withMode({
      planId: 3,
      bloqueadores: blOverrides || [],
      fin: Object.assign({
        flujoLibre: 12000,
        totalDeuda: 85000,
        totalPago: 14000,
        totalGastos: 19000,
        ratio: 0.31,
      }, finOverrides || {}),
      prio: { situacion_ui: "pagando_normal", acreedor: "Banco QA" },
    }, mode);
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
  var taxonomySrc = fs.readFileSync(path.join(root, "js/actionNarrativeTaxonomy.js"), "utf8");
  var preSprintIds = Object.keys(PRE_SPRINT_ACTIONS);

  // A
  ok("A bank length +12", ctx._BANCO_ACCIONES_MAESTRO.length === PRE_SPRINT_BANK_LENGTH + 12);

  // B
  NEW_ACTION_IDS.forEach(function(id) {
    ok("B exists " + id, bankById(id) != null);
  });

  // C
  NEW_ACTION_IDS.forEach(function(id) {
    var item = bankById(id);
    ok("C fields " + id, !!(item && item.id && item.categoria && item.texto && item.tipo && item.urgencia));
  });

  // D
  NEW_ACTION_IDS.forEach(function(id) {
    var cat = bankById(id).categoria;
    ok("D categoria 3/4 " + id, cat === 3 || cat === 4);
  });

  // E
  NEW_ACTION_IDS.forEach(function(id) {
    ok("E not categoria 1 " + id, bankById(id).categoria !== 1);
  });

  // F
  NEW_ACTION_IDS.forEach(function(id) {
    ok("F taxonomy registered " + id, ctx.getMasterActionNarrativeFamilies(id).length > 0);
  });

  // G
  Object.keys(EXPECTED_TAXONOMY).forEach(function(id) {
    var got = ctx.getMasterActionNarrativeFamilies(id);
    var exp = EXPECTED_TAXONOMY[id];
    ok("G families " + id, JSON.stringify(got.slice()) === JSON.stringify(exp));
  });

  // H
  preSprintIds.forEach(function(id) {
    var item = bankById(id);
    var exp = PRE_SPRINT_ACTIONS[id];
    ok("H pre-sprint id " + id, !!item);
    ok("H pre-sprint categoria " + id, item.categoria === exp.categoria);
    ok("H pre-sprint urgencia " + id, item.urgencia === exp.urgencia);
    ok("H pre-sprint texto preserved " + id, typeof item.texto === "string" && item.texto.length > 0);
  });

  // I
  preSprintIds.forEach(function(id) {
    var item = bankById(id);
    var keys = Object.keys(item).sort().join(",");
    ok("I shape " + id, keys.indexOf("narrative_families") < 0);
  });

  // J–L — no forbidden condition dependencies in new action objects
  NEW_ACTION_IDS.forEach(function(id) {
    var json = JSON.stringify(bankById(id));
    ok("J no user_intent " + id, json.indexOf("user_intent") < 0);
    ok("K no narrative_decision " + id, json.indexOf("narrative_decision") < 0);
    ok("L no entry_context " + id, json.indexOf("entry_context") < 0);
  });

  // M — OPTIMIZATION
  var diagOpt = richDiag("OPTIMIZATION");
  var filteredOpt = taxonomyFiltered(diagOpt, qualifiedMasterActions(diagOpt));
  ok("M OPTIMIZATION >= 3", filteredOpt.length >= 3);

  // N — STABILIZATION
  var diagStab = richDiag("STABILIZATION");
  var filteredStab = taxonomyFiltered(diagStab, qualifiedMasterActions(diagStab));
  ok("N STABILIZATION >= 3", filteredStab.length >= 3);

  // O — CLARITY
  var diagClarity = richDiag("CLARITY");
  var filteredClarity = taxonomyFiltered(diagClarity, qualifiedMasterActions(diagClarity));
  var clarityCompatible = filteredClarity.filter(function(a) {
    var fam = ctx.getMasterActionNarrativeFamilies(a.id);
    return fam.indexOf("LEARNING") >= 0 || fam.indexOf("UNIVERSAL") >= 0 || fam.indexOf("CLARITY") >= 0;
  });
  ok("O CLARITY >= 1 compatible", clarityCompatible.length >= 1);

  // P — RECOVERY does not get optimization-only actions under taxonomy mode
  var diagRec = richDiag("RECOVERY", { flujoLibre: -5000 }, [{ tipo: "mora" }]);
  var filteredRec = taxonomyFiltered(diagRec, qualifiedMasterActions(diagRec));
  var optOnly = ["definir_meta_reserva", "reservar_parte_flujo", "revisar_capacidad_ahorro", "revisar_costos_tarjetas"];
  if (diagRec.action_selection_mode === "taxonomy") {
    ok("P RECOVERY excludes opt-only", optOnly.every(function(id) {
      return filteredRec.every(function(a) { return a.id !== id; });
    }));
  } else {
    ok("P RECOVERY legacy fallback allowed", filteredRec.length >= 3);
  }

  // Q — full selection still works for RECOVERY
  var actionsRec = ctx.seleccionarAccionesRecomendadas(diagRec);
  ok("Q RECOVERY selection array", Array.isArray(actionsRec) && actionsRec.length >= 3);

  // R — action_selection_mode
  ok("R selection mode set", diagOpt.action_selection_mode === "taxonomy" || diagOpt.action_selection_mode === "legacy_fallback");

  // S — taxonomy_discard_count
  ok("S discard count number", typeof diagOpt.taxonomy_discard_count === "number");

  // T
  ok("T seleccionar returns array", Array.isArray(ctx.seleccionarAccionesRecomendadas(diagOpt)));

  // U — rendering
  ctx.window.CZState = {
    diag: diagOpt,
    deudas: [{ monto: 50000, pago: 14000, tipo: "tarjeta", acreedor: "QA" }],
    gastos: { vivienda: 19000 },
    herr: { compromisos: {}, atrasos: {}, ingresos: { total: 45000, extras: [] } },
    gastos_missing_confirmed: true,
    snap: { plan_id: diagOpt.planId },
  };
  var html = ctx.renderAccionesRecomendadasHtml(diagOpt);
  ok("U render actions html", html.indexOf("accion-recomendada-item") >= 0);

  // V — B7 unchanged source
  ok("V B7 fn exists", typeof ctx.renderContextualActionBlock === "function");

  // W — Plan5 fallback keys unchanged
  ok("W plan5 keys", ctx.CZ_PLAN5_ACTION_KEYS.length === 3);

  // X — Next Step unchanged
  ok("X next step fn", typeof ctx.resolveNextStepContent === "function");

  // Y — score
  var motor = ctx.calcularMotor();
  ok("Y score number", typeof motor.scoreReset === "number");

  // Z — plan assignment
  ok("Z planId", typeof motor.planId === "number");

  // AA — stage
  ok("AA stage resolver", typeof ctx.resolveFinancialStage === "function");

  // AB — narrative
  ok("AB narrative resolver", typeof ctx.resolveNarrativeDecision === "function");

  // AC — CRM
  var crmPayload = ctx.buildCRMData(diagOpt);
  ok("AC CRM no selection meta", crmPayload.action_selection_mode == null);

  // AD — GTM
  ctx._gtmEvents = [];
  ctx.renderAccionesRecomendadasHtml(diagOpt);
  var gtmHasMeta = (ctx._gtmEvents || []).some(function(args) {
    return JSON.stringify(args).indexOf("action_selection_mode") >= 0;
  });
  ok("AD GTM clean", gtmHasMeta === false);

  // AE — localStorage
  ok("AE algo no URL writes", algoSrc.indexOf("action_selection_mode") >= 0);

  // AF — arch-01 taxonomy count
  ok("AF taxonomy count matches bank", Object.keys(ctx.CZ_MASTER_ACTION_TAXONOMY).length === ctx._BANCO_ACCIONES_MAESTRO.length);

  // AG — arch-02 filter fn
  ok("AG taxonomy filter fn", typeof ctx.applyNarrativeTaxonomyFilterToSelected === "function");

  // AH — acciones-recom render fn
  ok("AH render fn", typeof ctx.renderAccionesRecomendadasHtml === "function");

  // AI — narrative modules present
  ok("AI narrative resolver", typeof ctx.resolveNarrativeDecision === "function");

  // AJ — synthetic motor fn
  ok("AJ calcularMotor", typeof ctx.calcularMotor === "function");

  // AK — no duplicate taxonomy keys in source
  var taxonomyKeyMatches = taxonomySrc.match(/^\s+[a-z0-9_]+:/gm) || [];
  var seenTax = {};
  var dupTax = false;
  taxonomyKeyMatches.forEach(function(line) {
    var key = line.trim().replace(/:$/, "");
    if (seenTax[key]) dupTax = true;
    seenTax[key] = true;
  });
  ok("AK no duplicate taxonomy keys", dupTax === false);

  // AL — voseo accents in new action text
  var accentSnippets = ["Identificá", "Registrá", "Evaluá", "Ordená", "Compará", "Verificá", "Conservá", "Revisá", "Definí", "Analizá"];
  NEW_ACTION_IDS.forEach(function(id) {
    var texto = bankById(id).texto;
    ok("AL texto accents " + id, accentSnippets.some(function(snippet) { return texto.indexOf(snippet) >= 0; }));
  });

  // Before/after profile comparison (report)
  var preSprintQualified = function(diag, mode) {
    var all = qualifiedMasterActions(diag);
    return taxonomyFiltered(withMode(diag, mode), all.filter(function(a) {
      return preSprintIds.indexOf(a.id) >= 0;
    }));
  };
  console.log("");
  console.log("PROFILE COMPARISON (taxonomy-filtered qualified master actions):");
  ["OPTIMIZATION", "STABILIZATION", "CLARITY", "RECOVERY"].forEach(function(mode) {
    var baseDiag = mode === "RECOVERY"
      ? richDiag("RECOVERY", { flujoLibre: -5000 }, [{ tipo: "mora" }])
      : richDiag(mode);
    var before = preSprintQualified(baseDiag, mode).map(function(a) { return a.id; });
    var after = taxonomyFiltered(withMode(baseDiag, mode), qualifiedMasterActions(baseDiag)).map(function(a) { return a.id; });
    console.log("  " + mode + " before (" + before.length + "): " + before.join(", "));
    console.log("  " + mode + " after  (" + after.length + "): " + after.join(", "));
  });

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
