// =============================================================================
// plusReport.js — Mi Plan Plus LLM prototype (Sprint 14.2)
// Depende de: config.js
// Loaded before: ui.js, app.js
// =============================================================================

// -----------------------------------------------------------------------------
// SYSTEM PROMPT — Mi Plan Plus Plus Report V2 IA (Sprint P2b)
// Source: js/plusReportV2IaPrompt.js → CZ_PLUS_IA_SYSTEM_PROMPT
// -----------------------------------------------------------------------------
var CZ_PLUS_SYSTEM_PROMPT = typeof CZ_PLUS_IA_SYSTEM_PROMPT !== "undefined"
  ? CZ_PLUS_IA_SYSTEM_PROMPT
  : "Plus IA prompt not loaded.";
// -----------------------------------------------------------------------------
// IA OUTPUT — Plus Report V2 sections 1–6 only (Sprint P2b)
// -----------------------------------------------------------------------------
var CZ_PLUS_IA_OUTPUT_KEYS = [
  "seccion_1_resumen_ejecutivo",
  "seccion_2_reconciliacion_declarado_vs_verificado",
  "seccion_3_hallazgos_interpretados",
  "seccion_4_riesgos_y_oportunidades",
  "seccion_5_plan_de_accion",
  "seccion_6_horizonte",
];

var CZ_PLUS_IA_FORBIDDEN_OUTPUT_KEYS = [
  "seccion_7_trazabilidad_fuentes",
  "metadata",
  "reconciliation_summary",
  "version",
  "alignment_score",
];

function validatePlusInformeIaOutput(informe) {
  var errors = [];
  if (!informe || typeof informe !== "object" || Array.isArray(informe)) {
    return { valid: false, errors: ["IA output must be a plain object"] };
  }
  CZ_PLUS_IA_FORBIDDEN_OUTPUT_KEYS.forEach(function(k) {
    if (Object.prototype.hasOwnProperty.call(informe, k)) {
      errors.push("forbidden key in IA output: " + k);
    }
  });
  if (typeof containsAlignmentScore === "function" && containsAlignmentScore(informe)) {
    errors.push("alignment_score must not exist");
  }
  CZ_PLUS_IA_OUTPUT_KEYS.forEach(function(k) {
    if (!Object.prototype.hasOwnProperty.call(informe, k)) {
      errors.push("missing IA section: " + k);
    } else if (typeof informe[k] !== "object" || informe[k] === null) {
      errors.push(k + " must be an object");
    }
  });
  var sec4 = informe.seccion_4_riesgos_y_oportunidades;
  if (sec4) {
    if (!Array.isArray(sec4.riesgos)) errors.push("seccion_4.riesgos must be an array");
    if (!Array.isArray(sec4.oportunidades)) errors.push("seccion_4.oportunidades must be an array");
  }
  return { valid: errors.length === 0, errors: errors };
}

function isPlusInformeIaV2Shape(informe) {
  return !!(informe
    && informe.seccion_2_reconciliacion_declarado_vs_verificado
    && !informe.seccion_4_hallazgos);
}

function normalizePlusInformeForDisplay(informe) {
  if (!isPlusInformeIaV2Shape(informe)) return informe;
  var s1 = informe.seccion_1_resumen_ejecutivo || {};
  var s2 = informe.seccion_2_reconciliacion_declarado_vs_verificado || {};
  var s3 = informe.seccion_3_hallazgos_interpretados || {};
  var s4 = informe.seccion_4_riesgos_y_oportunidades || {};
  var s5 = informe.seccion_5_plan_de_accion || {};
  var s6 = informe.seccion_6_horizonte || {};
  var queDebeCambiar = s6.que_debe_cambiar;
  if (typeof queDebeCambiar === "string") queDebeCambiar = [queDebeCambiar];
  if (!Array.isArray(queDebeCambiar)) queDebeCambiar = [];
  var plazoLabel = {
    "30_dias": "30 días",
    "90_dias": "90 días",
    "6_meses": "6 meses",
    "12_meses": "12 meses",
    indeterminado: "Indeterminado",
  };
  return {
    seccion_1_resumen_ejecutivo: {
      situacion_general: [s1.situacion_real, s1.cambio_principal_detectado].filter(Boolean).join(" "),
      fortalezas: [],
      riesgos: (s4.riesgos || []).slice(0, 3).map(function(r) {
        return { titulo: r.titulo || "", descripcion: r.descripcion || "" };
      }),
      bloqueador_principal: s1.prioridad_principal || "",
      horizonte_resumen: s1.lectura_general || "",
      nota_disclaimer: s1.nota_disclaimer || "",
    },
    seccion_3_nota_diferencias: s2.lectura_usuario || s2.interpretacion_general || "",
    seccion_4_hallazgos: {
      interpretacion_general: s3.interpretacion_general || "",
      hallazgos: s3.hallazgos || [],
      patron_detectado: s3.patron_detectado || "",
      perfil_riesgo_real: s3.perfil_riesgo_real || "",
      diferencia_perfil_declarado_vs_real: s3.diferencia_perfil_declarado_vs_real || "",
    },
    seccion_5_acciones: {
      acciones: (s5.acciones || []).map(function(a) {
        return {
          orden: a.prioridad != null ? a.prioridad : null,
          titulo: a.titulo || "",
          descripcion: a.descripcion || "",
          urgencia: a.urgencia || "",
        };
      }),
      accion_inmediata: s5.accion_inmediata || {},
    },
    seccion_6_horizonte: {
      situacion_actual: s6.situacion_actual || "",
      escenario_probable: {
        descripcion: typeof s6.escenario_probable === "string"
          ? s6.escenario_probable
          : (s6.escenario_probable && s6.escenario_probable.descripcion) || "",
        tiempo_estimado: plazoLabel[s6.plazo_estimado] || s6.plazo_estimado || "",
        condiciones: s6.senales_de_mejora || [],
      },
      que_debe_cambiar: queDebeCambiar,
      horizonte_recalificacion: {
        estimacion: typeof s6.horizonte_recalificacion === "string"
          ? s6.horizonte_recalificacion
          : (s6.horizonte_recalificacion && s6.horizonte_recalificacion.estimacion) || "",
        factores_bloqueantes: [],
        factores_favorables: s6.senales_de_mejora || [],
      },
    },
    _plus_ia_v2_raw: informe,
  };
}

// -----------------------------------------------------------------------------
// MOCK INPUT — fixed prototype dataset (no randomization)
// -----------------------------------------------------------------------------
function getMockPlusInput() {
  return {
    meta: {
      fuente: "mock_sprint_p2b",
      version_input: "plus_report_v2_ia",
      pais: "UY",
      moneda: "UYU",
      generado_en: "2025-05-28T12:00:00.000Z",
    },
    reconciliation_engine: {
      alignment_label: "Coincidencia parcial",
      alignment_direction: "peor",
      user_plan_inicial: "plan_4",
      user_plan_verificado: "plan_4",
      limitaciones: [
        "Consulta simulada — datos de prueba Sprint P2b.",
        "No incluye documentos fuente en bruto.",
      ],
      reconciliation_summary: {
        alignment_label: "Coincidencia parcial",
        alignment_direction: "peor",
        headline: "Brecha entre lo declarado y lo verificado",
        explanation: "Los registros consultados muestran más exposición y un acreedor no declarado.",
      },
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
    registro_clearing: {
      fuente_narrativa: "Clearing",
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

function _buildAnthropicPlusPayload(inputData) {
  return {
    model: typeof CZ_CLAUDE_MODEL !== "undefined"
      ? CZ_CLAUDE_MODEL
      : "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: CZ_PLUS_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: "Generá SOLO las secciones 1 a 6 del informe Mi Plan Plus según el schema IA V2. "
        + "NO incluyas seccion_7, metadata, reconciliation_summary, alignment_label "
        + "ni porcentajes de coincidencia del perfil.\n"
        + "Usá reconciliation_engine del input (solo lectura) para alinear tono y hechos.\n"
        + "Datos de entrada:\n"
        + JSON.stringify(inputData, null, 2),
    }],
  };
}

function _buildPlusProxyRequest(inputData) {
  return {
    report_type: "plus",
    context: inputData || {},
  };
}

function _parsePlusProxyResponse(proxyData) {
  if (!proxyData || proxyData.ok !== true) {
    var errMsg = (proxyData && proxyData.detail)
      ? String(proxyData.detail)
      : ((proxyData && proxyData.error) ? String(proxyData.error) : "plus_proxy_error");
    throw new Error(errMsg);
  }
  if (!proxyData.text) {
    throw new Error("empty_proxy_response");
  }
  return { text: proxyData.text, usage: proxyData.usage || {} };
}

async function _fetchPlusReportProvider(inputData) {
  var proxyEnabled = typeof CZ_PLUS_PROXY_ENABLED !== "undefined" && !!CZ_PLUS_PROXY_ENABLED;
  var allowBrowser = typeof CZ_CLAUDE_ALLOW_BROWSER_KEY !== "undefined" && !!CZ_CLAUDE_ALLOW_BROWSER_KEY;

  if (proxyEnabled) {
    var proxyHeaders = { "Content-Type": "application/json" };
    var clientSecret = typeof CZ_PLUS_PROXY_CLIENT_SECRET !== "undefined"
      ? String(CZ_PLUS_PROXY_CLIENT_SECRET).trim()
      : "";
    if (clientSecret) {
      proxyHeaders["x-cz-plus-secret"] = clientSecret;
    }

    var proxyResponse = await fetch("/api/plus/generate", {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify(_buildPlusProxyRequest(inputData)),
    });

    var proxyData = await proxyResponse.json().catch(function() { return {}; });
    if (!proxyResponse.ok && proxyData && proxyData.ok !== true) {
      var errMsg = proxyData.detail || proxyData.error || ("Plus proxy error: " + proxyResponse.status);
      throw new Error(errMsg);
    }
    return _parsePlusProxyResponse(proxyData);
  }

  if (!allowBrowser) {
    throw new Error("CZ_CLAUDE_API_KEY not configured");
  }

  var apiKey = typeof CZ_CLAUDE_API_KEY !== "undefined" ? CZ_CLAUDE_API_KEY : "";
  if (!apiKey) {
    throw new Error("CZ_CLAUDE_API_KEY not configured");
  }

  var payload = _buildAnthropicPlusPayload(inputData);
  var headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };

  var response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Anthropic API Error: " + response.status);
  }

  var apiResponse = await response.json();
  return { raw: apiResponse, text: extractAnthropicMessageText(apiResponse) };
}

function _plusErrorSourceFromErr(err) {
  if (!err) return "unknown";
  var msg = String(err.message || err).toLowerCase();
  if (msg.indexOf("timeout") !== -1 || msg.indexOf("timed out") !== -1) return "timeout";
  if (msg.indexOf("anthropic") !== -1 || msg.indexOf("api error") !== -1) return "claude_api";
  return "unknown";
}

async function generarInformePlus(opts) {
  opts = opts || {};
  var st = window.CZState;
  var useTestInput = !!opts.useTestInput;

  try {
    if (useTestInput) {
      st._plusInformeTestError = false;
    }
    var inputData = useTestInput ? getMockPlusInput() : getPlusReportInput();
    var providerResult = await _fetchPlusReportProvider(inputData);
    var rawText = providerResult.text
      || extractAnthropicMessageText(providerResult.raw || {});
    var parsed = parsePlusInformeFromLlmText(rawText);
    if (isPlusInformeIaV2Shape(parsed)) {
      var iaValidation = validatePlusInformeIaOutput(parsed);
      if (!iaValidation.valid) {
        console.warn("Plus IA V2 validation:", iaValidation.errors);
      }
    }
    var informe = normalizePlusInformeForDisplay(parsed);

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

    if (useTestInput) {
      st._plusInformeTestError = true;
    }

    if (typeof trackEvent === "function" && typeof CZ_EVENT_NAMES !== "undefined") {
      trackEvent(CZ_EVENT_NAMES.PLUS_ERROR, {
        error_source: _plusErrorSourceFromErr(err),
        plus_status: "PLUS_ERROR",
      });
    }

    if (typeof setPlusStatus === "function") {
      setPlusStatus("PLUS_ERROR");
    } else {
      st.plus_status = "PLUS_ERROR";
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

// =============================================================================
// Sprint 14.4 — Plus PDF export (html2pdf > jsPDF > print fallback)
// =============================================================================
function _plusPdfEsc(s) {
  if (s == null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _plusPdfDateFormatted() {
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, "0");
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  return dd + "/" + mm + "/" + d.getFullYear();
}

function _plusPdfFilename() {
  return "credizona-mi-plan-plus-" + new Date().toISOString().slice(0, 10) + ".pdf";
}

function _plusPdfLogoSrc() {
  var b64 = typeof CZ_CREDIZONA_LOGO_BASE64 !== "undefined" ? CZ_CREDIZONA_LOGO_BASE64 : "";
  if (!b64) return "";
  return "data:image/svg+xml;base64," + b64;
}

function _plusPdfBloqueadorTexto(b) {
  if (!b) return "";
  if (typeof b === "string") return b;
  return b.descripcion || b.tipo || "";
}

function _plusPdfList(items, mapper) {
  if (!items || !items.length) return "<p>—</p>";
  return "<ul>" + items.map(mapper).join("") + "</ul>";
}

function buildPlusPdfHtml(informe) {
  informe = informe || {};
  var sec1 = informe.seccion_1_resumen_ejecutivo || {};
  var sec4 = informe.seccion_4_hallazgos || {};
  var sec5 = informe.seccion_5_acciones || {};
  var sec6 = informe.seccion_6_horizonte || {};
  var escProb = sec6.escenario_probable || {};
  var horizRec = sec6.horizonte_recalificacion || {};
  var accionInmediata = sec5.accion_inmediata || {};
  var logoSrc = _plusPdfLogoSrc();
  var footerText = "Generado por Credizona Mi Plan Plus. Este informe se basa en la información "
    + "disponible al momento de la consulta y no constituye asesoramiento financiero ni legal.";
  var coverFirstName = "";
  if (typeof getProfileFirstName === "function") {
    coverFirstName = getProfileFirstName(window.CZState || {});
  } else if (typeof PRE !== "undefined" && PRE.nombre) {
    coverFirstName = String(PRE.nombre).trim().split(/\s+/)[0];
  }
  var coverSub = coverFirstName
    ? ("Informe personalizado para " + _plusPdfEsc(coverFirstName))
    : "Informe Financiero Personalizado";

  var body = "";

  body += '<div class="cover">'
    + (logoSrc
      ? '<img src="' + logoSrc + '" alt="Credizona" class="cover-logo"/>'
      : '<div class="cover-logo-fallback">Credizona</div>')
    + "<h1>Credizona Mi Plan Plus</h1>"
    + "<p class=\"cover-sub\">" + coverSub + "</p>"
    + "<p class=\"cover-date\">Fecha: " + _plusPdfEsc(_plusPdfDateFormatted()) + "</p>"
    + "</div>";

  body += '<div class="section"><h2>Tu situación financiera hoy</h2>'
    + "<p>" + _plusPdfEsc(sec1.situacion_general) + "</p>"
    + "<h3>Fortalezas</h3>"
    + _plusPdfList(sec1.fortalezas || [], function(item) {
        return "<li><strong>" + _plusPdfEsc(item.titulo) + "</strong> — "
          + _plusPdfEsc(item.descripcion) + "</li>";
      })
    + "<h3>Riesgos</h3>"
    + _plusPdfList(sec1.riesgos || [], function(item) {
        return "<li><strong>" + _plusPdfEsc(item.titulo) + "</strong> — "
          + _plusPdfEsc(item.descripcion) + "</li>";
      })
    + "<h3>Bloqueador principal</h3>"
    + "<p>" + _plusPdfEsc(_plusPdfBloqueadorTexto(sec1.bloqueador_principal)) + "</p>"
    + "<h3>Horizonte</h3>"
    + "<p>" + _plusPdfEsc(sec1.horizonte_resumen) + "</p>"
    + "</div>";

  if (informe.seccion_3_nota_diferencias) {
    body += '<div class="section"><h2>Diferencias detectadas</h2>'
      + "<p>" + _plusPdfEsc(informe.seccion_3_nota_diferencias) + "</p></div>";
  }

  body += '<div class="section"><h2>Qué significa esto</h2>'
    + "<p>" + _plusPdfEsc(sec4.interpretacion_general) + "</p>";

  (sec4.hallazgos || []).forEach(function(h) {
    body += "<h3>" + _plusPdfEsc(h.titulo) + "</h3>"
      + "<p>" + _plusPdfEsc(h.descripcion) + "</p>";
  });

  if (sec4.patron_detectado) {
    body += "<h3>Patrón detectado</h3><p>" + _plusPdfEsc(sec4.patron_detectado) + "</p>";
  }

  body += "<h3>Perfil de riesgo real</h3>"
    + "<p>" + _plusPdfEsc(sec4.perfil_riesgo_real) + "</p>";

  if (sec4.diferencia_perfil_declarado_vs_real) {
    body += "<h3>Diferencia declarado vs real</h3><p>"
      + _plusPdfEsc(sec4.diferencia_perfil_declarado_vs_real) + "</p>";
  }

  body += "</div>";

  body += '<div class="section"><h2>Qué hacer ahora</h2>'
    + "<h3>" + _plusPdfEsc(accionInmediata.titulo) + "</h3>"
    + "<p>" + _plusPdfEsc(accionInmediata.descripcion) + "</p>";

  (sec5.acciones || []).forEach(function(act, idx) {
    body += "<h3>" + _plusPdfEsc(act.titulo || ("Acción " + (idx + 1))) + "</h3>"
      + "<p>" + _plusPdfEsc(act.descripcion) + "</p>";
  });

  body += "</div>";

  body += '<div class="section"><h2>Tu horizonte</h2>'
    + "<p>" + _plusPdfEsc(sec6.situacion_actual) + "</p>"
    + "<h3>Escenario probable</h3>"
    + "<p>" + _plusPdfEsc(escProb.descripcion) + "</p>"
    + "<h3>Tiempo estimado</h3>"
    + "<p>" + _plusPdfEsc(escProb.tiempo_estimado || sec6.tiempo_estimado || "") + "</p>"
    + "<h3>Condiciones</h3>"
    + _plusPdfList(escProb.condiciones || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "<h3>Qué debe cambiar</h3>"
    + _plusPdfList(sec6.que_debe_cambiar || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "<h3>Estimación de recalificación</h3>"
    + "<p>" + _plusPdfEsc(horizRec.estimacion || sec6.estimacion || "") + "</p>"
    + "<h3>Factores bloqueantes</h3>"
    + _plusPdfList(horizRec.factores_bloqueantes || sec6.factores_bloqueantes || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "<h3>Factores favorables</h3>"
    + _plusPdfList(horizRec.factores_favorables || sec6.factores_favorables || [], function(item) {
        return "<li>" + _plusPdfEsc(item) + "</li>";
      })
    + "</div>";

  body += '<div class="pdf-footer">' + _plusPdfEsc(footerText) + "</div>";

  return "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"UTF-8\"/>"
    + "<title>Credizona Mi Plan Plus</title>"
    + "<style>"
    + "body{margin:0;padding:24px;font-family:Inter,Arial,sans-serif;background:#fff;color:#1a1f36;line-height:1.5;}"
    + ".cover{text-align:center;padding:48px 16px 56px;page-break-after:always;border-bottom:1px solid #e5e7ef;}"
    + ".cover-logo{max-width:220px;height:auto;margin:0 auto 24px;display:block;}"
    + ".cover-logo-fallback{font-size:28px;font-weight:800;color:#2563eb;margin-bottom:24px;}"
    + ".cover h1{font-size:24px;margin:0 0 8px;}"
    + ".cover-sub{font-size:16px;color:#4b5563;margin:0 0 12px;}"
    + ".cover-date{font-size:14px;color:#6b7280;margin:0;}"
    + ".section{margin-bottom:28px;page-break-inside:avoid;}"
    + ".section h2{font-size:18px;border-bottom:1px solid #e5e7ef;padding-bottom:8px;margin:0 0 12px;}"
    + ".section h3{font-size:14px;margin:16px 0 6px;color:#374151;}"
    + ".section p,.section li{font-size:13px;}"
    + ".section ul{margin:0;padding-left:18px;}"
    + ".pdf-footer{margin-top:36px;padding-top:16px;border-top:1px solid #e5e7ef;font-size:11px;color:#6b7280;}"
    + "@media print{body{padding:12mm;}}"
    + "</style></head><body>" + body + "</body></html>";
}

function _plusPdfPrintFallback(htmlContent, filename) {
  var win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    alert("Permití ventanas emergentes para descargar el PDF.");
    return;
  }
  win.document.open();
  win.document.write(htmlContent);
  win.document.close();
  win.document.title = filename.replace(/\.pdf$/i, "");
  setTimeout(function() {
    win.focus();
    win.print();
  }, 450);
}

async function sendPlusReportEmail(payload) {
  /* MIGRATION NOTE:
     Replace with:
     await fetch("/api/plus/email-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
     });
  */
  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve({ ok: true });
    }, 800);
  });
}

async function downloadPlusReportPdf() {
  var st = window.CZState;
  if (!st || st.plus_status !== "PLUS_READY" || !st.plus_informe) return;

  var html = buildPlusPdfHtml(st.plus_informe);
  var filename = _plusPdfFilename();

  try {
    if (typeof html2pdf !== "undefined") {
      var container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "210mm";
      container.innerHTML = html;
      document.body.appendChild(container);
      await html2pdf()
        .set({
          filename: filename,
          margin: 12,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(container)
        .save();
      document.body.removeChild(container);
    } else if (
      (typeof jspdf !== "undefined" || (window.jspdf && window.jspdf.jsPDF))
      && typeof html2canvas !== "undefined"
    ) {
      _plusPdfPrintFallback(html, filename);
    } else {
      _plusPdfPrintFallback(html, filename);
    }
  } catch (err) {
    console.error(err);
    _plusPdfPrintFallback(html, filename);
  }

  var id = window.CZIdentity || {};
  var czuid = id.crm_contact_id || id.anonymous_id || null;
  var planId = st.diag ? st.diag.planId : null;

  if (typeof trackEvent === "function") {
    trackEvent("plus_pdf_downloaded", {
      czuid:          czuid,
      plan_id:        planId,
      plus_report_id: st.plus_report_id,
    });
  }
  if (typeof trackCRMEvent === "function") {
    trackCRMEvent("plus_pdf_downloaded", {
      czuid:          czuid,
      plus_report_id: st.plus_report_id,
      downloaded_at:  new Date().toISOString(),
    });
  }

  st.plus_pdf_downloaded = true;
  if (typeof window.guardarLocal === "function") window.guardarLocal();
}

window.generarInformePlus = generarInformePlus;
window.validatePlusInformeIaOutput = validatePlusInformeIaOutput;
window.normalizePlusInformeForDisplay = normalizePlusInformeForDisplay;
window.isPlusInformeIaV2Shape = isPlusInformeIaV2Shape;
window.getMockPlusInput = getMockPlusInput;
window.buildPlusInput = buildPlusInput;
window.downloadPlusReportPdf = downloadPlusReportPdf;
window.sendPlusReportEmail = sendPlusReportEmail;
