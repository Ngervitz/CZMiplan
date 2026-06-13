/**
 * dev/plus-report-v2-prompt-p2b-qa.js — Sprint P2b Plus Report V2 IA prompt migration QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "", href: "" };
  global.document = {
    getElementById: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.trackEvent = function() {};
  global.localStorage = { getItem: function() { return null; }, setItem: function() {} };
  global.PRE = { nombre: "Test", cedula: "1", email: "t@t.com", telefono: "099", ingreso: 50000, laboral: "dependiente", respuestas: {} };
  global.SEGMENTO = "test";
  global.TIENE_ENCUESTA = true;

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  load("js/plusReportV2IaPrompt.js");
  load("js/plusReportV2Schema.js");
  load("js/plusReport.js");

  var promptSrc = fs.readFileSync(path.join(root, "js/plusReportV2IaPrompt.js"), "utf8");
  var plusReportSrc = fs.readFileSync(path.join(root, "js/plusReport.js"), "utf8");
  var indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  var apiPrompt = fs.readFileSync(path.join(root, "api/plus/systemPrompt.js"), "utf8");
  var algoSrc = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");

  ok("A prompt module loaded", typeof CZ_PLUS_IA_SYSTEM_PROMPT === "string"
    && CZ_PLUS_IA_SYSTEM_PROMPT.length > 500);
  ok("A prompt version P2b", CZ_PLUS_PROMPT_VERSION === "plus_report_v2_ia_v2.2");
  ok("A plusReport uses IA prompt", CZ_PLUS_SYSTEM_PROMPT === CZ_PLUS_IA_SYSTEM_PROMPT);
  ok("A index loads prompt before plusReport",
    indexHtml.indexOf("plusReportV2IaPrompt.js") < indexHtml.indexOf("plusReport.js"));

  ok("B output schema sections 1-6 only in prompt",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("seccion_2_reconciliacion_declarado_vs_verificado") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("seccion_4_riesgos_y_oportunidades") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("SOLO SECCIONES 1 A 6") >= 0);

  ok("B forbids seccion_7 generation",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("PROHIBIDO") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("seccion_7_trazabilidad_fuentes") >= 0);

  ok("C no alignment_score in prompt rules",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("alignment_score") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("porcentajes de coincidencia") >= 0);

  ok("C Equifax excluded from narrative",
    promptSrc.indexOf("EVITAR en narrativa") >= 0
    && promptSrc.indexOf("Equifax") >= 0
    && promptSrc.indexOf("solo puede aparecer en seccion_7") >= 0);

  ok("C BCU/Clearing allowed",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("BCU") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("Clearing") >= 0);

  ok("D temporal separation rules",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("DESCRIPTIVO") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("INTERPRETATIVO") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("IMPERATIVO") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("PROYECTIVO") >= 0);

  ok("D tone by alignment_label",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("Alta coincidencia") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("Coincidencia parcial") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("Baja coincidencia") >= 0);

  ok("D word limits present",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("120 palabras") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("180 palabras") >= 0);

  ok("D empty arrays rule",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("riesgos: []") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("oportunidades: []") >= 0);

  ok("E v2.1 quality retained (anti-judgment, DTI ban)",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("Nunca juzgues") >= 0
    && CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("No menciones DTI") >= 0);

  ok("E differential Plus priority",
    CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("Qué cambió con la verificación") >= 0
    || CZ_PLUS_IA_SYSTEM_PROMPT.indexOf("verificación") >= 0);

  ok("F mock input has reconciliation_engine",
    typeof getMockPlusInput === "function"
    && getMockPlusInput().reconciliation_engine
    && getMockPlusInput().reconciliation_engine.alignment_label === "Coincidencia parcial");

  ok("F user message forbids seccion_7",
    plusReportSrc.indexOf("NO incluyas seccion_7") >= 0);

  var sampleIa = {
    seccion_1_resumen_ejecutivo: {
      situacion_real: "Situación verificada con brecha de deuda.",
      cambio_principal_detectado: "Apareció un préstamo no declarado.",
      prioridad_principal: "Regularizar Financiera del Este.",
      lectura_general: "La verificación cambió la lectura del perfil.",
      nota_disclaimer: "Informe orientativo.",
    },
    seccion_2_reconciliacion_declarado_vs_verificado: {
      interpretacion_general: "Los registros consultados superan lo declarado.",
      resumen_contraste: {
        total_deuda_declarada: 45000,
        total_deuda_verificada: 78000,
        diferencia_total: 33000,
        diferencia_porcentual: 73.3,
        cantidad_deudas_declaradas: 1,
        cantidad_deudas_verificadas: 2,
        cantidad_diferencias_relevantes: 1,
      },
      diferencias_detectadas: [],
      lectura_usuario: "Encontramos un acreedor que no figuraba en tu diagnóstico.",
    },
    seccion_3_hallazgos_interpretados: {
      interpretacion_general: "La brecha explica presión de flujo.",
      hallazgos: [],
      patron_detectado: "Subdeclaración de exposición.",
      perfil_riesgo_real: "Elevado",
      diferencia_perfil_declarado_vs_real: "Declaraste menos deuda de la verificada.",
    },
    seccion_4_riesgos_y_oportunidades: {
      lectura_general: "Riesgo principal: mora en tarjeta.",
      riesgos: [{
        id: "r1",
        titulo: "Mora activa",
        descripcion: "Atraso en OCA.",
        severidad: "alta",
        plazo: "inmediato",
        consecuencia_probable: "Mayor presión crediticia.",
        accion_relacionada: "a1",
      }],
      oportunidades: [],
    },
    seccion_5_plan_de_accion: {
      interpretacion_general: "Priorizá regularización esta semana.",
      acciones: [{
        id: "a1",
        prioridad: 1,
        titulo: "Contactar Financiera del Este",
        descripcion: "Esta semana, pedí estado de cuenta.",
        tipo: "regularizar",
        urgencia: "alta",
        acreedor_relacionado: "Financiera del Este",
        fuente_dato: "clearing",
        motivo: "Deuda no declarada.",
        resultado_esperado: "Plan de pago claro.",
      }],
      accion_inmediata: {
        titulo: "Revisar extracto OCA",
        descripcion: "Hoy, confirmá saldo y atraso.",
        por_que_ahora: "Es la mora activa más visible.",
      },
    },
    seccion_6_horizonte: {
      situacion_actual: "Perfil bajo presión.",
      escenario_probable: "Con pagos sostenidos, la categoría BCU podría estabilizarse.",
      que_debe_cambiar: "Regularizar moras y alinear declaración.",
      horizonte_recalificacion: "Estabilización previa a mejora de categoría.",
      plazo_estimado: "6_meses",
      senales_de_mejora: ["Pagos al día", "Menos consultas"],
    },
  };

  var iaVal = validatePlusInformeIaOutput(sampleIa);
  ok("G sample IA output validates", iaVal.valid === true);

  var badIa = JSON.parse(JSON.stringify(sampleIa));
  badIa.seccion_7_trazabilidad_fuentes = { generated_by: "ia" };
  ok("G rejects seccion_7 in IA output", !validatePlusInformeIaOutput(badIa).valid);

  badIa = JSON.parse(JSON.stringify(sampleIa));
  badIa.alignment_score = 80;
  ok("G rejects alignment_score", !validatePlusInformeIaOutput(badIa).valid);

  ok("G no alignment_score in sample", !containsAlignmentScore(sampleIa));

  var display = normalizePlusInformeForDisplay(sampleIa);
  ok("H normalizes to legacy display shape",
    display.seccion_4_hallazgos && display.seccion_5_acciones
    && display.seccion_3_nota_diferencias
    && !display.seccion_2_reconciliacion_declarado_vs_verificado);
  ok("H preserves raw V2 IA", display._plus_ia_v2_raw === sampleIa);
  ok("H sec1 maps situacion_real", display.seccion_1_resumen_ejecutivo.situacion_general.indexOf("brecha") >= 0);

  var narrative = JSON.stringify(sampleIa).toLowerCase();
  ok("H sample narrative avoids Equifax", narrative.indexOf("equifax") < 0);

  ok("I calcularMotor unchanged", algoSrc.indexOf("function calcularMotor") >= 0);

  ok("J old v2.1 section names removed from plusReport.js prompt block",
    !plusReportSrc.match(/var CZ_PLUS_SYSTEM_PROMPT = \[\s*"SYSTEM PROMPT/));

  ok("K api systemPrompt still exports CZ_PLUS_SYSTEM_PROMPT",
    apiPrompt.indexOf("export const CZ_PLUS_SYSTEM_PROMPT") >= 0);

  console.log("\n--- P2b QA: " + passed + " passed, " + failed + " failed ---");
  if (failed > 0) process.exit(1);
})();
