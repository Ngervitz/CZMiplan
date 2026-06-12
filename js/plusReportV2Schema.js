/**
 * plusReportV2Schema.js — Mi Plan Plus Report V2 JSON contract (Sprint P2a)
 *
 * Contract-only module for future real reconciliation data.
 * Does not integrate Equifax/BCU or replace current plusReport.js rendering.
 *
 * Architecture:
 *   - reconciliation_engine → metadata, reconciliation_summary, seccion_7
 *   - IA → secciones 1–6 only (must not modify seccion_7)
 *
 * Product rules:
 *   - No alignment_score anywhere
 *   - Qualitative alignment_label only (no percentage alignment)
 */
(function(global) {
  "use strict";

  var PLUS_REPORT_V2_VERSION = "plus_report_v2";

  var PLUS_REPORT_V2_ALIGNMENT_LABELS = [
    "Alta coincidencia",
    "Coincidencia parcial",
    "Baja coincidencia",
  ];

  var PLUS_REPORT_V2_ALIGNMENT_DIRECTIONS = [
    "mejor",
    "similar",
    "peor",
    "mixto",
  ];

  var PLUS_REPORT_V2_PLAN_IDS = [
    "plan_1",
    "plan_2",
    "plan_3",
    "plan_4",
    "plan_5",
  ];

  var PLUS_REPORT_V2_TOP_LEVEL_KEYS = [
    "version",
    "metadata",
    "reconciliation_summary",
    "seccion_1_resumen_ejecutivo",
    "seccion_2_reconciliacion_declarado_vs_verificado",
    "seccion_3_hallazgos_interpretados",
    "seccion_4_riesgos_y_oportunidades",
    "seccion_5_plan_de_accion",
    "seccion_6_horizonte",
    "seccion_7_trazabilidad_fuentes",
  ];

  var PLUS_REPORT_V2_FORBIDDEN_KEYS = ["alignment_score"];

  var PLUS_REPORT_V2_DEFAULT_DISCLAIMER =
    "Este informe se basa en la información declarada y en registros consultados. "
    + "No constituye asesoramiento legal ni garantiza resultados crediticios.";

  /** Machine-readable contract reference (documentation + validation source of truth). */
  var PLUS_REPORT_V2_SCHEMA = {
    version: PLUS_REPORT_V2_VERSION,
    description: "Mi Plan Plus V2 report — declared vs verified reconciliation",
    rules: [
      "alignment_score must not exist anywhere in the payload",
      "reconciliation_engine owns reconciliation_summary and seccion_7_trazabilidad_fuentes",
      "IA generates secciones 1-6 only and must not rewrite seccion_7",
      "user_plan_verificado is null only when verified data is insufficient",
      "If verified plan matches initial plan, use the actual plan value, not null",
      "No raw Equifax/BCU documents in this schema",
    ],
    allowed: {
      alignment_label: PLUS_REPORT_V2_ALIGNMENT_LABELS.slice(),
      alignment_direction: PLUS_REPORT_V2_ALIGNMENT_DIRECTIONS.slice(),
      user_plan: PLUS_REPORT_V2_PLAN_IDS.slice(),
      user_plan_verificado: PLUS_REPORT_V2_PLAN_IDS.concat([null]),
      data_mode: ["mock", "verified"],
      currency: ["UYU"],
      seccion_7_generated_by: ["reconciliation_engine"],
    },
    structure: {
      version: "plus_report_v2",
      metadata: {
        report_id: "string",
        generated_at: "ISO_DATE",
        user_plan_inicial: "plan_1|plan_2|plan_3|plan_4|plan_5",
        user_plan_verificado: "plan_1|plan_2|plan_3|plan_4|plan_5|null",
        data_mode: "mock|verified",
        currency: "UYU",
        disclaimer: "string",
      },
      reconciliation_summary: {
        alignment_label: "Alta coincidencia|Coincidencia parcial|Baja coincidencia",
        alignment_direction: "mejor|similar|peor|mixto",
        headline: "string",
        explanation: "string",
      },
      seccion_1_resumen_ejecutivo: {
        situacion_real: "string",
        cambio_principal_detectado: "string",
        prioridad_principal: "string",
        lectura_general: "string",
        nota_disclaimer: "string",
      },
      seccion_2_reconciliacion_declarado_vs_verificado: {
        interpretacion_general: "string",
        resumen_contraste: {
          total_deuda_declarada: "number",
          total_deuda_verificada: "number",
          diferencia_total: "number",
          diferencia_porcentual: "number",
          cantidad_deudas_declaradas: "number",
          cantidad_deudas_verificadas: "number",
          cantidad_diferencias_relevantes: "number",
        },
        diferencias_detectadas: ["PlusReportV2Diferencia"],
        lectura_usuario: "string",
      },
      seccion_3_hallazgos_interpretados: {
        interpretacion_general: "string",
        hallazgos: ["PlusReportV2Hallazgo"],
        patron_detectado: "string",
        perfil_riesgo_real: "string",
        diferencia_perfil_declarado_vs_real: "string",
      },
      seccion_4_riesgos_y_oportunidades: {
        lectura_general: "string",
        riesgos: ["PlusReportV2Riesgo"],
        oportunidades: ["PlusReportV2Oportunidad"],
      },
      seccion_5_plan_de_accion: {
        interpretacion_general: "string",
        acciones: ["PlusReportV2Accion"],
        accion_inmediata: {
          titulo: "string",
          descripcion: "string",
          por_que_ahora: "string",
        },
      },
      seccion_6_horizonte: {
        situacion_actual: "string",
        escenario_probable: "string",
        que_debe_cambiar: "string",
        horizonte_recalificacion: "string",
        plazo_estimado: "30_dias|90_dias|6_meses|12_meses|indeterminado",
        senales_de_mejora: ["string"],
      },
      seccion_7_trazabilidad_fuentes: {
        generated_by: "reconciliation_engine",
        fuentes_consultadas: ["PlusReportV2FuenteConsultada"],
        registros_utilizados: ["PlusReportV2RegistroUtilizado"],
        limitaciones: ["string"],
      },
    },
  };

  function planIdFromNumber(n) {
    var id = parseInt(n, 10);
    if (isNaN(id) || id < 1 || id > 5) return null;
    return "plan_" + id;
  }

  function isIsoDateString(s) {
    if (typeof s !== "string" || !s) return false;
    var t = Date.parse(s);
    return !isNaN(t);
  }

  function isPlainObject(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
  }

  function findForbiddenKeys(obj, forbidden, path, hits) {
    path = path || "";
    hits = hits || [];
    if (obj == null || typeof obj !== "object") return hits;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        findForbiddenKeys(obj[i], forbidden, path + "[" + i + "]", hits);
      }
      return hits;
    }
    Object.keys(obj).forEach(function(key) {
      var full = path ? path + "." + key : key;
      if (forbidden.indexOf(key) >= 0) hits.push(full);
      findForbiddenKeys(obj[key], forbidden, full, hits);
    });
    return hits;
  }

  function containsAlignmentScore(obj) {
    return findForbiddenKeys(obj, PLUS_REPORT_V2_FORBIDDEN_KEYS).length > 0;
  }

  function assertString(val, field, errors, opts) {
    opts = opts || {};
    if (typeof val !== "string" || (!opts.allowEmpty && val.trim() === "")) {
      errors.push(field + " must be a non-empty string");
    }
  }

  function assertNumber(val, field, errors) {
    if (typeof val !== "number" || isNaN(val)) {
      errors.push(field + " must be a number");
    }
  }

  function assertEnum(val, allowed, field, errors, allowNull) {
    if (allowNull && val === null) return;
    if (allowed.indexOf(val) < 0) {
      errors.push(field + " must be one of: " + allowed.join(", ")
        + (allowNull ? ", null" : ""));
    }
  }

  function validatePlusReportV2(report) {
    var errors = [];

    if (!isPlainObject(report)) {
      return { valid: false, errors: ["report must be a plain object"] };
    }

    if (report.version !== PLUS_REPORT_V2_VERSION) {
      errors.push("version must be \"" + PLUS_REPORT_V2_VERSION + "\"");
    }

    PLUS_REPORT_V2_TOP_LEVEL_KEYS.forEach(function(key) {
      if (!(key in report)) errors.push("missing top-level key: " + key);
    });

    var forbidden = findForbiddenKeys(report, PLUS_REPORT_V2_FORBIDDEN_KEYS);
    if (forbidden.length) {
      errors.push("forbidden key(s) present: " + forbidden.join(", "));
    }

    var meta = report.metadata;
    if (isPlainObject(meta)) {
      assertString(meta.report_id, "metadata.report_id", errors);
      if (meta.generated_at != null && !isIsoDateString(meta.generated_at)) {
        errors.push("metadata.generated_at must be ISO date string");
      }
      assertEnum(meta.user_plan_inicial, PLUS_REPORT_V2_PLAN_IDS, "metadata.user_plan_inicial", errors);
      assertEnum(meta.user_plan_verificado, PLUS_REPORT_V2_PLAN_IDS, "metadata.user_plan_verificado", errors, true);
      assertEnum(meta.data_mode, ["mock", "verified"], "metadata.data_mode", errors);
      assertEnum(meta.currency, ["UYU"], "metadata.currency", errors);
      assertString(meta.disclaimer, "metadata.disclaimer", errors);
    } else {
      errors.push("metadata must be an object");
    }

    var recon = report.reconciliation_summary;
    if (isPlainObject(recon)) {
      assertEnum(recon.alignment_label, PLUS_REPORT_V2_ALIGNMENT_LABELS,
        "reconciliation_summary.alignment_label", errors);
      assertEnum(recon.alignment_direction, PLUS_REPORT_V2_ALIGNMENT_DIRECTIONS,
        "reconciliation_summary.alignment_direction", errors);
      assertString(recon.headline, "reconciliation_summary.headline", errors);
      assertString(recon.explanation, "reconciliation_summary.explanation", errors);
    } else {
      errors.push("reconciliation_summary must be an object");
    }

    var sec7 = report.seccion_7_trazabilidad_fuentes;
    if (isPlainObject(sec7)) {
      if (sec7.generated_by !== "reconciliation_engine") {
        errors.push("seccion_7_trazabilidad_fuentes.generated_by must be \"reconciliation_engine\"");
      }
      if (!Array.isArray(sec7.fuentes_consultadas)) {
        errors.push("seccion_7_trazabilidad_fuentes.fuentes_consultadas must be an array");
      }
      if (!Array.isArray(sec7.registros_utilizados)) {
        errors.push("seccion_7_trazabilidad_fuentes.registros_utilizados must be an array");
      }
      if (!Array.isArray(sec7.limitaciones)) {
        errors.push("seccion_7_trazabilidad_fuentes.limitaciones must be an array");
      }
    } else {
      errors.push("seccion_7_trazabilidad_fuentes must be an object");
    }

    var sec1 = report.seccion_1_resumen_ejecutivo;
    if (isPlainObject(sec1)) {
      ["situacion_real", "cambio_principal_detectado", "prioridad_principal",
        "lectura_general", "nota_disclaimer"].forEach(function(k) {
        assertString(sec1[k], "seccion_1_resumen_ejecutivo." + k, errors);
      });
    } else {
      errors.push("seccion_1_resumen_ejecutivo must be an object");
    }

    var sec2 = report.seccion_2_reconciliacion_declarado_vs_verificado;
    if (isPlainObject(sec2)) {
      assertString(sec2.interpretacion_general,
        "seccion_2_reconciliacion_declarado_vs_verificado.interpretacion_general", errors);
      assertString(sec2.lectura_usuario,
        "seccion_2_reconciliacion_declarado_vs_verificado.lectura_usuario", errors);
      var rc = sec2.resumen_contraste;
      if (isPlainObject(rc)) {
        ["total_deuda_declarada", "total_deuda_verificada", "diferencia_total",
          "diferencia_porcentual", "cantidad_deudas_declaradas",
          "cantidad_deudas_verificadas", "cantidad_diferencias_relevantes"].forEach(function(k) {
          assertNumber(rc[k], "seccion_2.resumen_contraste." + k, errors);
        });
      } else {
        errors.push("seccion_2.resumen_contraste must be an object");
      }
      if (!Array.isArray(sec2.diferencias_detectadas)) {
        errors.push("seccion_2.diferencias_detectadas must be an array");
      }
    } else {
      errors.push("seccion_2_reconciliacion_declarado_vs_verificado must be an object");
    }

    ["seccion_3_hallazgos_interpretados", "seccion_4_riesgos_y_oportunidades",
      "seccion_5_plan_de_accion", "seccion_6_horizonte"].forEach(function(sk) {
      if (!isPlainObject(report[sk])) errors.push(sk + " must be an object");
    });

    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * Builds a contract-valid sample from existing P1b mock scenario data.
   * Does not mutate PLUS_MOCK_DATA. For dev/QA and future reconciliation stubs.
   */
  function buildPlusReportV2FromMockScenario(scenarioKey, mockData) {
    mockData = mockData || (global.PLUS_MOCK_DATA || {});
    var data = mockData[scenarioKey] || mockData.peor;
    if (!data) return null;

    var directionMap = { peor: "peor", similar: "similar", mejor: "mejor" };
    var alignmentDirection = directionMap[scenarioKey] || "mixto";
    var coin = data.coincidence || {};
    var diag = data.diagnosis || {};
    var planInicial = planIdFromNumber(diag.inicialPlan);
    var planVerificado = planIdFromNumber(diag.verificadoPlan);

    var declaradoDeuda = 0;
    var verificadoDeuda = 0;
    (data.diferencias || []).forEach(function(row) {
      if (row.concepto === "Deuda total") {
        declaradoDeuda = parseInt(String(row.declarado).replace(/\D/g, ""), 10) || 0;
        verificadoDeuda = parseInt(String(row.verificado).replace(/\D/g, ""), 10) || 0;
      }
    });
    var diffTotal = verificadoDeuda - declaradoDeuda;
    var diffPct = declaradoDeuda > 0
      ? Math.round((diffTotal / declaradoDeuda) * 1000) / 10
      : 0;

    var acreedoresRow = (data.diferencias || []).find(function(r) {
      return r.concepto === "Acreedores";
    });
    var cantDeclaradas = acreedoresRow ? parseInt(acreedoresRow.declarado, 10) || 0 : 0;
    var cantVerificadas = acreedoresRow ? parseInt(acreedoresRow.verificado, 10) || 0 : 0;

    var now = new Date().toISOString();
    var reportId = "plus_v2_mock_" + scenarioKey + "_" + Date.now();

    var diferencias = (data.diferencias || []).map(function(row, idx) {
      var tipo = "sin_diferencia_relevante";
      if (row.concepto === "Mora" && row.declarado !== row.verificado) tipo = "mora_no_declarada";
      else if (row.concepto === "Deuda total" && row.declarado !== row.verificado) tipo = "monto_distinto";
      else if (row.concepto === "Plan" && row.declarado !== row.verificado) tipo = "estado_distinto";
      else if (row.concepto === "Acreedores" && row.declarado !== row.verificado) tipo = "deuda_no_declarada";
      return {
        id: "diff_" + (idx + 1),
        tipo_diferencia: tipo,
        acreedor: null,
        monto_declarado: row.concepto === "Deuda total" ? declaradoDeuda : 0,
        monto_verificado: row.concepto === "Deuda total" ? verificadoDeuda : 0,
        diferencia_monto: row.concepto === "Deuda total" ? diffTotal : 0,
        estado_declarado: row.concepto === "Mora" ? row.declarado : null,
        estado_verificado: row.concepto === "Mora" ? row.verificado : null,
        fuente_verificada: row.declarado !== row.verificado ? "equifax" : null,
        impacto: row.declarado !== row.verificado ? "alto" : "informativo",
        confianza: "media",
        interpretacion: row.concepto + ": declarado " + row.declarado + ", verificado " + row.verificado,
      };
    });

    var hallazgos = (data.hallazgos || []).map(function(text, idx) {
      return {
        id: "hall_" + (idx + 1),
        titulo: "Hallazgo " + (idx + 1),
        descripcion: text,
        fuente_base: "reconciliacion",
        fuentes_especificas: ["equifax"],
        impacto: idx === 0 ? "alto" : "medio",
        badge: idx === 0 ? "⚠️ alto" : "📋 medio",
        por_que_importa: "Afecta la lectura verificada de tu situación financiera.",
      };
    });

    var acciones = (data.prioridades || []).map(function(text, idx) {
      return {
        id: "acc_" + (idx + 1),
        prioridad: idx + 1,
        titulo: text,
        descripcion: text,
        tipo: idx === 0 ? "regularizar" : "ordenar",
        urgencia: idx === 0 ? "alta" : "media",
        acreedor_relacionado: null,
        fuente_dato: "reconciliacion",
        motivo: "Derivado del cruce declarado vs verificado.",
        resultado_esperado: "Reducir la brecha entre lo declarado y lo verificado.",
      };
    });

    return {
      version: PLUS_REPORT_V2_VERSION,
      metadata: {
        report_id: reportId,
        generated_at: now,
        user_plan_inicial: planInicial || "plan_1",
        user_plan_verificado: planVerificado,
        data_mode: "mock",
        currency: "UYU",
        disclaimer: PLUS_REPORT_V2_DEFAULT_DISCLAIMER,
      },
      reconciliation_summary: {
        alignment_label: coin.label || "Coincidencia parcial",
        alignment_direction: alignmentDirection,
        headline: (data.verificationResult && data.verificationResult.status) || "Diagnóstico verificado",
        explanation: coin.message || "",
      },
      seccion_1_resumen_ejecutivo: {
        situacion_real: (data.verificationResult && data.verificationResult.message) || "",
        cambio_principal_detectado: diag.message || "",
        prioridad_principal: (data.prioridades && data.prioridades[0]) || "",
        lectura_general: (data.iaPreview && data.iaPreview[0]) || "",
        nota_disclaimer: PLUS_REPORT_V2_DEFAULT_DISCLAIMER,
      },
      seccion_2_reconciliacion_declarado_vs_verificado: {
        interpretacion_general: coin.message || "",
        resumen_contraste: {
          total_deuda_declarada: declaradoDeuda,
          total_deuda_verificada: verificadoDeuda,
          diferencia_total: diffTotal,
          diferencia_porcentual: diffPct,
          cantidad_deudas_declaradas: cantDeclaradas,
          cantidad_deudas_verificadas: cantVerificadas,
          cantidad_diferencias_relevantes: diferencias.filter(function(d) {
            return d.tipo_diferencia !== "sin_diferencia_relevante";
          }).length,
        },
        diferencias_detectadas: diferencias,
        lectura_usuario: coin.message || "",
      },
      seccion_3_hallazgos_interpretados: {
        interpretacion_general: (data.iaPreview && data.iaPreview[0]) || "",
        hallazgos: hallazgos,
        patron_detectado: scenarioKey === "peor"
          ? "Dispersión de deuda y mora no declarada"
          : "Perfil consistente con registros consultados",
        perfil_riesgo_real: scenarioKey === "peor" ? "Elevado" : "Moderado",
        diferencia_perfil_declarado_vs_real: diag.message || "",
      },
      seccion_4_riesgos_y_oportunidades: {
        lectura_general: "Riesgos y oportunidades según el cruce verificado.",
        riesgos: scenarioKey === "peor" ? [{
          id: "riesgo_1",
          titulo: "Mora activa no declarada",
          descripcion: "Registros muestran mora en acreedores no reflejados en la declaración.",
          severidad: "alta",
          plazo: "inmediato",
          consecuencia_probable: "Mayor presión crediticia y deterioro del perfil.",
          accion_relacionada: "acc_1",
        }] : [],
        oportunidades: scenarioKey === "mejor" ? [{
          id: "opp_1",
          titulo: "Endeudamiento inferior al estimado",
          descripcion: "Los registros verificados muestran menos exposición que la declarada.",
          impacto_potencial: "alto",
          condicion_para_aprovecharla: "Mantener pagos al día y evitar nuevas obligaciones.",
          accion_relacionada: "acc_1",
        }] : [],
      },
      seccion_5_plan_de_accion: {
        interpretacion_general: "Acciones priorizadas según reconciliación verificada.",
        acciones: acciones,
        accion_inmediata: {
          titulo: (data.prioridades && data.prioridades[0]) || "Revisar diferencias detectadas",
          descripcion: (data.prioridades && data.prioridades[0]) || "",
          por_que_ahora: "El cruce verificado muestra brechas que conviene atender primero.",
        },
      },
      seccion_6_horizonte: {
        situacion_actual: (data.verificationResult && data.verificationResult.message) || "",
        escenario_probable: (data.iaPreview && data.iaPreview[1]) || "",
        que_debe_cambiar: (data.iaPreview && data.iaPreview[2]) || "",
        horizonte_recalificacion: scenarioKey === "mejor"
          ? "Mejora posible con sostenimiento de pagos"
          : "Estabilización previa a recalificación",
        plazo_estimado: scenarioKey === "mejor" ? "90_dias" : "6_meses",
        senales_de_mejora: [
          "Regularización de moras",
          "Alineación declarado vs verificado",
        ],
      },
      seccion_7_trazabilidad_fuentes: {
        generated_by: "reconciliation_engine",
        fuentes_consultadas: [
          {
            fuente: "equifax",
            estado: "consultado",
            fecha_consulta: now,
            referencia: "mock_" + scenarioKey,
            resumen: "Consulta simulada — sin integración real en P2a.",
          },
          {
            fuente: "motor_miplan",
            estado: "consultado",
            fecha_consulta: now,
            referencia: "declared_profile",
            resumen: "Perfil declarado en Mi Plan.",
          },
        ],
        registros_utilizados: [
          {
            id: "reg_1",
            fuente: "usuario",
            tipo_registro: "dato_usuario",
            acreedor: null,
            monto: declaradoDeuda,
            estado: null,
            fecha_referencia: now,
            usado_en_secciones: ["seccion_2", "seccion_3"],
          },
          {
            id: "reg_2",
            fuente: "equifax",
            tipo_registro: "deuda",
            acreedor: null,
            monto: verificadoDeuda,
            estado: null,
            fecha_referencia: now,
            usado_en_secciones: ["seccion_2", "seccion_5"],
          },
        ],
        limitaciones: [
          "Modo mock — sin consulta real a Equifax/BCU/Clearing.",
          "No incluye documentos fuente en bruto.",
        ],
      },
    };
  }

  global.PLUS_REPORT_V2_VERSION = PLUS_REPORT_V2_VERSION;
  global.PLUS_REPORT_V2_SCHEMA = PLUS_REPORT_V2_SCHEMA;
  global.PLUS_REPORT_V2_ALIGNMENT_LABELS = PLUS_REPORT_V2_ALIGNMENT_LABELS;
  global.PLUS_REPORT_V2_ALIGNMENT_DIRECTIONS = PLUS_REPORT_V2_ALIGNMENT_DIRECTIONS;
  global.PLUS_REPORT_V2_PLAN_IDS = PLUS_REPORT_V2_PLAN_IDS;
  global.validatePlusReportV2 = validatePlusReportV2;
  global.containsAlignmentScore = containsAlignmentScore;
  global.planIdFromNumber = planIdFromNumber;
  global.buildPlusReportV2FromMockScenario = buildPlusReportV2FromMockScenario;

  global.PlusReportV2Schema = {
    VERSION: PLUS_REPORT_V2_VERSION,
    SCHEMA: PLUS_REPORT_V2_SCHEMA,
    ALIGNMENT_LABELS: PLUS_REPORT_V2_ALIGNMENT_LABELS,
    ALIGNMENT_DIRECTIONS: PLUS_REPORT_V2_ALIGNMENT_DIRECTIONS,
    PLAN_IDS: PLUS_REPORT_V2_PLAN_IDS,
    validate: validatePlusReportV2,
    containsAlignmentScore: containsAlignmentScore,
    buildFromMockScenario: buildPlusReportV2FromMockScenario,
    planIdFromNumber: planIdFromNumber,
  };
})(typeof window !== "undefined" ? window : global);
