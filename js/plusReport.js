// =============================================================================
// plusReport.js — Mi Plan Plus LLM prototype (Sprint 14.2)
// Depende de: config.js
// Loaded before: ui.js, app.js
// =============================================================================

// -----------------------------------------------------------------------------
// SYSTEM PROMPT — output schema is source of truth; do not shorten
// -----------------------------------------------------------------------------
var CZ_PLUS_SYSTEM_PROMPT = [
  "Sos el motor de redacción de informes de Credizona Mi Plan Plus para usuarios en Uruguay.",
  "Tu única salida debe ser UN objeto JSON válido, sin markdown, sin texto antes ni después.",
  "",
  "REGLAS OBLIGATORIAS:",
  "- Escribí en español rioplatense (vos), tono institucional, claro, sin alarmismo ni promesas de aprobación.",
  "- No inventes datos que no estén en el input.",
  "- JSON estricto: sin comas finales en arrays u objetos, sin comentarios, sin markdown.",
  "- Usá EXACTAMENTE los nombres de campo del schema.",
  "- El campo tiempo_estimado es obligatorio en seccion_6_horizonte (NUNCA tiempo_estimated).",
  "- fortalezas, riesgos, hallazgos, acciones, que_debe_cambiar, factores_bloqueantes y factores_favorables son arrays.",
  "- Cada acción debe incluir: titulo, descripcion, tipo (accion|habito|contacto), urgencia (alta|media|baja).",
  "- accion_inmediata es un objeto con la misma forma que un elemento de acciones.",
  "- Si hay diferencias entre declarado y registro, completá seccion_3_nota_diferencias (string). Si no hay, omití la clave o usá null.",
  "",
  "SCHEMA JSON (respeta tipos y nombres):",
  "{",
  '  "seccion_1_resumen_ejecutivo": {',
  '    "situacion_general": "string",',
  '    "fortalezas": ["string"],',
  '    "riesgos": ["string"],',
  '    "bloqueador_principal": "string",',
  '    "horizonte_resumen": "string",',
  '    "nota_disclaimer": "string"',
  "  },",
  '  "seccion_3_nota_diferencias": "string o null",',
  '  "seccion_4_hallazgos": {',
  '    "interpretacion_general": "string",',
  '    "hallazgos": [{ "titulo": "string", "descripcion": "string" }],',
  '    "patron_detectado": "string",',
  '    "perfil_riesgo_real": "string"',
  "  },",
  '  "seccion_5_acciones": {',
  '    "accion_inmediata": {',
  '      "titulo": "string",',
  '      "descripcion": "string",',
  '      "tipo": "accion|habito|contacto",',
  '      "urgencia": "alta|media|baja"',
  "    },",
  '    "acciones": [{',
  '      "titulo": "string",',
  '      "descripcion": "string",',
  '      "tipo": "accion|habito|contacto",',
  '      "urgencia": "alta|media|baja"',
  "    }]",
  "  },",
  '  "seccion_6_horizonte": {',
  '    "situacion_actual": "string",',
  '    "escenario_probable": { "descripcion": "string" },',
  '    "tiempo_estimado": "string",',
  '    "que_debe_cambiar": ["string"],',
  '    "estimacion": "string",',
  '    "factores_bloqueantes": ["string"],',
  '    "factores_favorables": ["string"]',
  "  }",
  "}",
].join("\n");

// -----------------------------------------------------------------------------
// MOCK INPUT — fixed prototype dataset (no randomization)
// -----------------------------------------------------------------------------
function getMockPlusInput() {
  return {
    meta: {
      fuente: "mock_sprint_14_2",
      version_input: "1.0",
      pais: "UY",
      moneda: "UYU",
      generado_en: "2025-05-28T12:00:00.000Z",
    },
    usuario: {
      nombre: PRE.nombre,
      cedula: PRE.cedula,
      email: PRE.email,
      telefono: PRE.telefono,
      ingreso_declarado: PRE.ingreso,
      situacion_laboral: PRE.laboral,
      segmento: SEGMENTO,
    },
    encuesta_riesgo: {
      completada: TIENE_ENCUESTA,
      respuestas: PRE.respuestas,
    },
    diagnostico_miplan_declarado: {
      plan_id: 4,
      plan_titulo: "Estabilizacion critica",
      score_reset: 9,
      nivel_reset: "C",
      nivel_riesgo_financiero: "Critico",
      total_deuda_declarada: 45000,
      pago_mensual_declarado: 8500,
      total_gastos_declarados: 52000,
      flujo_libre_estimado: -15500,
      dti_ratio: 0.65,
      dti_level: "alto",
      interes_promedio_estimado: 58,
      bloqueadores_declarados: [
        "Flujo mensual negativo",
        "Deuda con atraso en tarjeta",
        "Capacidad de pago comprometida",
      ],
      horizonte_miplan: {
        banda: "largo",
        label: "Mas de 18 meses",
        meses_estimados: 24,
      },
    },
    deudas_declaradas: [
      {
        acreedor: "OCA",
        acreedor_display: "OCA",
        tipo: "tarjeta",
        monto: 45000,
        pago_mensual: 5500,
        situacion_ui: "atrasado_pagando",
        estado: "atraso",
      },
    ],
    gastos_declarados_resumen: {
      total_mensual: 52000,
      categorias_principales: [
        { categoria: "vivienda", monto: 22000 },
        { categoria: "alimentacion", monto: 14000 },
        { categoria: "transporte", monto: 8000 },
        { categoria: "otros", monto: 8000 },
      ],
    },
    registro_bcu: {
      calificacion: "3",
      calificacion_label: "Regular",
      operaciones_vigentes: 2,
      observaciones: [
        "Historial con instabilidad en pagos",
        "Exposicion a tarjetas de credito",
      ],
    },
    registro_clearing_equifax: {
      proveedor: "Equifax",
      fecha_consulta_referencia: "2025-05-28",
      consultas_ultimos_6_meses: 2,
      deudas_registradas: [
        {
          acreedor: "OCA",
          producto: "tarjeta_credito",
          monto: 45000,
          estado: "vigente",
          situacion: "con_atraso",
        },
        {
          acreedor: "Financiera del Este",
          producto: "prestamo_personal",
          monto: 33000,
          estado: "vigente",
          situacion: "al_dia",
        },
      ],
      total_deuda_registrada: 78000,
    },
    diferencias_declarado_vs_registro: [
      {
        tipo: "deuda_no_declarada",
        severidad: "alta",
        acreedor: "Financiera del Este",
        producto: "prestamo_personal",
        monto_declarado: 0,
        monto_registrado: 33000,
        descripcion: "Prestamo personal vigente no declarado en Mi Plan",
      },
      {
        tipo: "total_deuda",
        severidad: "media",
        monto_declarado_total: 45000,
        monto_registrado_total: 78000,
        diferencia: 33000,
        descripcion: "El total registrado supera lo declarado",
      },
    ],
    contexto_producto: {
      producto: "mi_plan_plus",
      precio_uyu: 1290,
      incluye: ["BCU", "Clearing", "IA", "PDF"],
    },
  };
}

function buildPlusInput() {
  throw new Error("Plus real pipeline not implemented");
}

function getPlusReportInput() {
  if (typeof CZ_PLUS_USE_MOCK !== "undefined" && CZ_PLUS_USE_MOCK) {
    return getMockPlusInput();
  }
  return buildPlusInput();
}

function _extractOutermostJsonObject(rawText) {
  var startIdx = rawText.indexOf("{");
  if (startIdx === -1) {
    throw new Error("No JSON block found in LLM output");
  }

  var depth = 0;
  var inString = false;
  var escaped = false;

  for (var i = startIdx; i < rawText.length; i++) {
    var ch = rawText[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return rawText.substring(startIdx, i + 1);
      }
    }
  }

  throw new Error("Incomplete JSON object in LLM output");
}

function _sanitizePlusInformeJsonString(jsonStr) {
  var s = jsonStr.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  // Trailing commas before ] or } (common LLM mistake)
  s = s.replace(/,(\s*[\]}])/g, "$1");
  return s;
}

function parsePlusInformeFromLlmText(rawText) {
  var cleanJson = _extractOutermostJsonObject(rawText);
  cleanJson = _sanitizePlusInformeJsonString(cleanJson);

  try {
    return JSON.parse(cleanJson);
  } catch (parseErr) {
    var retry = cleanJson.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(retry);
  }
}

function extractAnthropicMessageText(apiResponse) {
  var blocks = apiResponse && apiResponse.content;
  if (!blocks || !blocks.length) {
    throw new Error("Empty Anthropic response content");
  }
  var text = "";
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].type === "text" && blocks[i].text) {
      text += blocks[i].text;
    }
  }
  if (!text) {
    throw new Error("No text block in Anthropic response");
  }
  return text;
}

/* MIGRATION NOTE:

To move to backend:

var response = await fetch("/api/plus/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(inputData)
});

Everything else in generarInformePlus()
stays unchanged.

*/
async function _fetchPlusReportProvider(inputData) {
  var apiKey = typeof CZ_CLAUDE_API_KEY !== "undefined" ? CZ_CLAUDE_API_KEY : "";
  if (!apiKey) {
    throw new Error("CZ_CLAUDE_API_KEY not configured");
  }

  var headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  // Enable only if Anthropic browser restrictions block localhost testing.
  if (typeof CZ_CLAUDE_ALLOW_BROWSER_KEY !== "undefined" && CZ_CLAUDE_ALLOW_BROWSER_KEY) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  var response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: typeof CZ_CLAUDE_MODEL !== "undefined"
        ? CZ_CLAUDE_MODEL
        : "claude-sonnet-4-20250514",
      max_tokens: 6000,
      system: CZ_PLUS_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: "Generá el informe Mi Plan Plus completo según el schema JSON. "
          + "Datos de entrada:\n"
          + JSON.stringify(inputData, null, 2),
      }],
    }),
  });

  if (!response.ok) {
    throw new Error("Anthropic API Error: " + response.status);
  }

  return response.json();
}

async function generarInformePlus() {
  try {
    var inputData = getPlusReportInput();
    var apiResponse = await _fetchPlusReportProvider(inputData);
    var rawText = extractAnthropicMessageText(apiResponse);
    var informe = parsePlusInformeFromLlmText(rawText);

    var st = window.CZState;
    st.plus_informe = informe;
    st.plus_report_id = "plus_" + Date.now();

    if (typeof setPlusStatus === "function") {
      setPlusStatus("PLUS_READY", { report_id: st.plus_report_id });
    } else {
      st.plus_status = "PLUS_READY";
      window.guardarLocal();
    }

    if (
      st.tab === "plus"
      && window.CredizonaUI
      && typeof window.CredizonaUI.renderTab === "function"
    ) {
      window.CredizonaUI.renderTab();
    }
  } catch (err) {
    console.error(err);

    if (typeof setPlusStatus === "function") {
      setPlusStatus("PLUS_ERROR");
    } else {
      window.CZState.plus_status = "PLUS_ERROR";
      window.guardarLocal();
    }

    if (
      window.CZState.tab === "plus"
      && window.CredizonaUI
      && typeof window.CredizonaUI.renderTab === "function"
    ) {
      window.CredizonaUI.renderTab();
    }
  }
}

window.generarInformePlus = generarInformePlus;
window.getMockPlusInput = getMockPlusInput;
window.buildPlusInput = buildPlusInput;
