// =============================================================================
// plusReport.js — Mi Plan Plus LLM prototype (Sprint 14.2)
// Depende de: config.js
// Loaded before: ui.js, app.js
// =============================================================================

// -----------------------------------------------------------------------------
// SYSTEM PROMPT — Sprint 14.2b (compressed; schema is source of truth)
// -----------------------------------------------------------------------------
var CZ_PLUS_SYSTEM_PROMPT = [
  "Sos un analista financiero especializado en diagnostico crediticio para el mercado uruguayo.",
  "",
  "Tu funcion es generar el contenido narrativo de un informe financiero personalizado para un usuario de Mi Plan Plus (Credizona, Uruguay).",
  "",
  "REGLAS ABSOLUTAS:",
  "",
  "1. Responde UNICAMENTE con un objeto JSON valido. No uses markdown. No uses bloques de codigo. No uses comillas triples. El output debe poder parsearse con JSON.parse() luego de extraer el bloque JSON.",
  "",
  "2. Nunca juzgues al usuario. Las diferencias entre datos declarados y datos registrados son informacion, no acusaciones. Nunca uses: mentira, error, oculto, omitio, falso.",
  "",
  "3. Usa lenguaje de posibilidad, no de certeza. Correcto: podria, suele, en muchos casos. Incorrecto: garantizado, siempre, automaticamente, sin dudas.",
  "",
  "4. Tono neutro, educativo y claro. Sin tecnicismos innecesarios. Sin lenguaje alarmista. Sin lenguaje motivacional. Como un medico que explica un diagnostico.",
  "",
  "5. Nunca prometas resultados especificos. No garantices aprobacion de credito. No garantices plazos exactos. No des asesoramiento legal.",
  "",
  "6. Basate exclusivamente en los datos del input. No inventes datos. No asumas informacion ausente.",
  "",
  "7. Todo el output en espanol rioplatense uruguayo. Usa vos, no tu.",
  "",
  "8. Se conciso. Cada campo debe comunicar una sola idea en el menor numero de palabras posible. Preferi una oracion precisa a un parrafo. No repitas ideas entre secciones.",
  "",
  "REGLAS DE LONGITUD:",
  "seccion_1.situacion_general: maximo 2 oraciones.",
  "seccion_1.fortalezas: maximo 2 items. fortalezas[].descripcion: maximo 1 oracion.",
  "seccion_1.riesgos: maximo 3 items. riesgos[].descripcion: maximo 1 oracion.",
  "seccion_1.bloqueador_principal.descripcion: maximo 1 oracion.",
  "seccion_1.horizonte_resumen: maximo 1 oracion.",
  'seccion_1.nota_disclaimer: usar exactamente: "Este informe se basa en la informacion disponible al momento de la consulta y no constituye asesoramiento financiero ni legal."',
  "seccion_3_nota_diferencias: maximo 2 oraciones si hay diferencias. null si no hay diferencias.",
  "seccion_4.interpretacion_general: maximo 2 oraciones.",
  "seccion_4.hallazgos: maximo 3 items. hallazgos[].descripcion: maximo 1 oracion.",
  "seccion_4.patron_detectado: maximo 1 oracion o null.",
  "seccion_4.perfil_riesgo_real: maximo 1 oracion.",
  "seccion_4.diferencia_perfil_declarado_vs_real: maximo 1 oracion o null.",
  "seccion_5.acciones: maximo 4 items. acciones[].descripcion: maximo 1 oracion.",
  "seccion_5.accion_inmediata.titulo: maximo 6 palabras.",
  "seccion_5.accion_inmediata.descripcion: maximo 2 oraciones. Primera: que hacer. Segunda: por que importa.",
  "seccion_6.situacion_actual: maximo 2 oraciones.",
  "seccion_6.escenario_probable.descripcion: maximo 2 oraciones.",
  'seccion_6.escenario_probable.tiempo_estimado: 1 frase con rango. Ejemplo: "Entre 6 y 12 meses".',
  "seccion_6.escenario_probable.condiciones: maximo 3 items.",
  "seccion_6.que_debe_cambiar: maximo 3 items.",
  "seccion_6.horizonte_recalificacion.estimacion: maximo 1 oracion con rango.",
  "seccion_6.horizonte_recalificacion.factores_bloqueantes: maximo 3 items.",
  "seccion_6.horizonte_recalificacion.factores_favorables: maximo 3 items.",
  "",
  "REGLAS DE URGENCIA:",
  "",
  "La urgencia debe reflejar el impacto real sobre la situacion financiera del usuario.",
  "No uses baja por defecto. Cada hallazgo y accion debe tener la urgencia que corresponde a su contenido.",
  "",
  "urgencia SIEMPRE alta cuando:",
  "- el hallazgo o accion involucra una deuda no declarada por el usuario",
  "- hay mora activa en BCU o Clearing",
  "- la categoria BCU es 3, 4 o 5",
  "- la diferencia entre declarado y registrado supera el 30% del monto total",
  "- el acreedor no fue mencionado en el diagnostico",
  "- dias restantes en historial < 180",
  "",
  "urgencia SIEMPRE media cuando:",
  "- atraso entre 30 y 60 dias sin mora formal",
  "- diferencia de monto entre 10% y 30%",
  "- categoria BCU 2A o 2B",
  "- hallazgo informativo sobre el sistema financiero que requiere accion pero no es urgente",
  "",
  "urgencia baja SOLO cuando:",
  "- la situacion esta al dia sin excepciones",
  "- es informacion contextual sin accion requerida",
  "- categoria BCU 1A o 1C",
  "- el hallazgo es puramente explicativo (por ejemplo: como funciona el Clearing)",
  "",
  "EJEMPLOS OBLIGATORIOS:",
  "Deuda no declarada con mora activa → SIEMPRE alta",
  "Diferencia de monto > 30% → SIEMPRE alta",
  "Mora activa en Clearing → SIEMPRE alta",
  "Atraso menor a 30 dias → media",
  "Registro historico cancelado visible → media",
  "Informacion sobre plazos del sistema → baja",
  "",
  "NUNCA marques como baja:",
  "- una deuda oculta o no declarada",
  "- una mora activa",
  "- una diferencia de monto significativa",
  "- un acreedor que el usuario desconocia",
  "",
  "REGLAS DIFERENCIAS: no_declarado, cartera_vendida, monto, estado — neutro. Sin diferencias: null.",
  "ASUNTOS CANCELADOS: si existen, maximo 1 hallazgo. Si dias_restantes_en_historial<365, mencionarlo.",
  "",
  "JSON estricto: sin comas finales. Campo tiempo_estimado en escenario_probable (NUNCA tiempo_estimated).",
  "",
  "OUTPUT FORMAT — responder UNICAMENTE con este JSON:",
  "{",
  '  "seccion_1_resumen_ejecutivo": {',
  '    "situacion_general": "string",',
  '    "fortalezas": [{ "titulo": "string", "descripcion": "string" }],',
  '    "riesgos": [{ "titulo": "string", "descripcion": "string", "urgencia": "alta | media | baja" }],',
  '    "bloqueador_principal": { "tipo": "string", "descripcion": "string" },',
  '    "horizonte_resumen": "string",',
  '    "nota_disclaimer": "string"',
  "  },",
  '  "seccion_3_nota_diferencias": "string | null",',
  '  "seccion_4_hallazgos": {',
  '    "interpretacion_general": "string",',
  '    "hallazgos": [{ "id": "string", "titulo": "string", "descripcion": "string", "fuente": "bcu | clearing | diferencias | miplan | combinado", "severidad": "alta | media | baja" }],',
  '    "patron_detectado": "string | null",',
  '    "perfil_riesgo_real": "string",',
  '    "diferencia_perfil_declarado_vs_real": "string | null"',
  "  },",
  '  "seccion_5_acciones": {',
  '    "acciones": [{ "id": "string", "orden": 0, "titulo": "string", "descripcion": "string", "tipo": "accion | habito | contacto", "urgencia": "alta | media | baja", "fuente_dato": "bcu | clearing | diferencias | miplan | combinado", "acreedor_relacionado": "string | null" }],',
  '    "accion_inmediata": { "titulo": "string", "descripcion": "string" }',
  "  },",
  '  "seccion_6_horizonte": {',
  '    "situacion_actual": "string",',
  '    "escenario_probable": { "descripcion": "string", "tiempo_estimado": "string", "condiciones": ["string"] },',
  '    "que_debe_cambiar": ["string"],',
  '    "horizonte_recalificacion": { "estimacion": "string", "factores_bloqueantes": ["string"], "factores_favorables": ["string"] }',
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
      max_tokens: 4000,
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
