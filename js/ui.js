// =============================================================================
// ui.js — Funciones de renderizado
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js
// =============================================================================

// --- Accesores de estado ---
function _st()    { return window.CZState || {}; }
function _diag()  { return _st().diag; }
function _herr()  { return _st().herr || {}; }

// =============================================================================
// SPRINT 10 — Mi Plan in-app consent screen
// Shown before any diagnosis, dashboard, score, horizon, or recommendation.
// Separate from Credizona funnel consent (handled by consent.js / initConsent()).
// Uses existing dark visual style only — no new CSS classes.
// =============================================================================
function renderMiPlanConsentScreen() {
  return '<div style="padding:8px 0;">'
    + '<div style="font-size:26px;font-weight:900;line-height:1.2;margin-bottom:20px;">Antes de ver tu diagnóstico</div>'
    + '<div style="font-size:16px;color:rgba(255,255,255,.7);line-height:1.7;margin-bottom:28px;">'
    + 'Mi Plan es una herramienta de diagnóstico orientativo basada en la información que ingresás. '
    + 'No es una financiera, un banco ni un reporte oficial de Clearing, Equifax o BCU.'
    + '</div>'

    // Sprint 10.1 — free education banner (consent screen only)
    + '<div style="background:rgba(64,215,255,.07);border:1px solid rgba(64,215,255,.22);border-radius:16px;padding:18px 20px;margin-bottom:24px;">'
    + '<div style="font-size:16px;font-weight:800;color:#40d7ff;margin-bottom:10px;">🤝 "Mi Plan" es gratuito.</div>'
    + '<div style="font-size:15px;color:rgba(255,255,255,.75);line-height:1.65;">'
    + 'Lo creamos para ayudarte a entender tu situación financiera real y que veas un camino de salida. '
    + 'No tiene costo. Al final del diagnóstico nos gustaría saber qué te fue útil y qué te faltó.'
    + '</div>'
    + '</div>'

    // Checkbox 1 — T&C
    + '<label style="display:flex;align-items:flex-start;gap:14px;cursor:pointer;margin-bottom:18px;'
    + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:16px 18px;">'
    + '<input type="checkbox" id="chk-miplan-tc" style="width:22px;height:22px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">'
    + '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.55;">'
    + 'Leí y acepto los '
    + '<a href="/tyc.html" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Términos y Condiciones de Mi Plan</a>'
    + '</span>'
    + '</label>'

    // Checkbox 2 — Privacy
    + '<label style="display:flex;align-items:flex-start;gap:14px;cursor:pointer;margin-bottom:24px;'
    + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:16px 18px;">'
    + '<input type="checkbox" id="chk-miplan-privacy" style="width:22px;height:22px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">'
    + '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.55;">'
    + 'Leí y acepto la '
    + '<a href="/privacidad.html" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Política de Privacidad de Mi Plan</a>'
    + '</span>'
    + '</label>'

    // Disclaimer
    + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:24px;'
    + 'padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;">'
    + 'El diagnóstico, los scores y las proyecciones son orientativos. '
    + 'No garantizan aprobación de crédito ni modifican registros externos.'
    + '</div>'

    // Accept button — disabled until both boxes are checked
    + '<button class="btn btn-primary" id="btn-miplan-consent-accept" disabled '
    + 'style="width:100%;height:64px;font-size:19px;opacity:.45;transition:opacity .2s;" '
    + 'onclick="this.disabled&&event.preventDefault();">Ver mi diagnóstico</button>'
    + '</div>';
}

// =============================================================================
// STICKY BAR
// =============================================================================
function updateSticky() {
  var st   = _st();
  var step = st.step || 0;
  var diag = _diag();
  var lbl  = document.getElementById("sticky-lbl");
  var stEl = document.getElementById("sticky-step");
  var cta  = document.getElementById("sticky-cta");
  var bar  = document.getElementById("sticky-bar");
  if (!lbl || !stEl || !cta) return;

  // step 0: SEGMENTO 1 keeps its own sticky; diagnosis/bridge screens have inline CTAs
  if (step === 0 && SEGMENTO === 1) {
    if (bar) { bar.style.display = ""; bar.classList.remove("dashboard"); }
    lbl.textContent  = "Tu situacion inicial";
    stEl.textContent = "Analizamos las senales principales de tu perfil.";
    cta.textContent  = "Ver evaluacion";
    cta.className    = "sticky-btn";
    return;
  }

  if (step === 0) {
    if (bar) bar.style.display = "none";
    return;
  }

  if (bar) bar.style.display = "";

  if (step === 1) {
    // step 1 = deudas — primary recovery interpretation layer
    if (bar) bar.classList.remove("dashboard");
    lbl.textContent  = "Tus deudas actuales";
    stEl.textContent = "Identificamos donde esta hoy la mayor presion financiera.";
    cta.textContent  = "Continuar analisis";
    cta.className    = "sticky-btn";
  } else if (step === 2) {
    // step 2 = gastos — financial context
    if (bar) bar.classList.remove("dashboard");
    lbl.textContent  = "Tus gastos mensuales";
    stEl.textContent = "Completamos el contexto real de tu flujo.";
    cta.textContent  = "Ver diagnostico completo";
    cta.className    = "sticky-btn";
  } else {
    // step 3 = dashboard — sticky hidden entirely.
    // Dashboard has inline CTAs; sticky would overlap and duplicate them.
    if (bar) bar.style.display = "none";
    return;
  }
}

// =============================================================================
// HEADER
// =============================================================================
function updateHeader() {
  var st   = _st();
  var step = st.step || 0;
  var snap = st.snap;
  var day  = document.getElementById("header-day");
  var btnN = document.getElementById("btn-nuevo");
  if (!day || !btnN) return;

  if (step === 3) {
    if (snap) {
      var d = Math.floor((Date.now() - new Date(snap.fecha_inicio).getTime()) / 86400000);
      if (d > 0) { day.textContent = "Dia " + d; day.classList.remove("hidden"); }
    }
    btnN.classList.remove("hidden");
  } else {
    day.classList.add("hidden");
    btnN.classList.add("hidden");
  }
}

// =============================================================================
// STEP PILLS
// =============================================================================
function renderStepPills(cur, total) {
  // New flow: Situacion inicial → Deudas → Gastos → Diagnostico completo
  var labels = SEGMENTO === 1 ? ["Situacion inicial", "Deudas", "Gastos"] : ["Deudas", "Gastos"];
  var t = total || labels.length;
  var html = '<div class="step-pills">';
  labels.slice(0, t).forEach(function(l, i) {
    var done   = i < cur;
    var active = i === cur;
    html += '<div class="pill">'
      + '<div class="pill-num' + (done ? " done" : active ? " active" : "") + '">'
      + (done ? "✓" : (i + 1)) + '</div>'
      + '<span class="pill-label' + (active ? " active" : "") + '">' + l + '</span>'
      + '</div>';
    if (i < labels.slice(0, t).length - 1) html += '<div class="pill-div"></div>';
  });
  return html + '</div>';
}

// =============================================================================
// STEP 0 — DIAGNOSTICO INICIAL (Segmento 1)
// =============================================================================
function renderDiagInicial() {
  var r = PRE.respuestas;
  var signals = [], good = [];

  if (r.p1 === "C" || r.p1 === "D") signals.push({ i: "⚠️", t: "Sin claridad financiera",       d: "No tenes claro cuanto entra y sale cada mes. Eso hace casi imposible priorizar correctamente." });
  if (r.p6 === "D")                  signals.push({ i: "⚠️", t: "Prestamos informales detectados", d: "Los prestamos informales son los que mas rapido destruyen el flujo mensual." });
  if (r.p5 === "D")                  signals.push({ i: "⚠️", t: "Estres financiero maximo",        d: "Tu nivel de estres financiero es maximo. Eso afecta directamente las decisiones que tomas." });
  if (r.p7 === "C" || r.p7 === "D") signals.push({ i: "⚠️", t: "Deudas sin plan de salida",      d: "No sabes cuanto tiempo te llevaria salir de tus deudas. Esa falta de claridad es una senal importante." });
  if (r.p8 === "A")                  good.push({ i: "✅", t: "Ya tomaste acciones recientes",     d: "Eso es una ventaja real. El sistema valora que ya estes haciendo algo al respecto." });
  if (r.p3 === "A" || r.p3 === "B") good.push({ i: "✅", t: "Responsabilidad financiera alta",   d: "Tu nivel de responsabilidad es bueno. Con un plan claro, eso se traduce en resultados." });
  if (signals.length === 0)          signals.push({ i: "⚠️", t: "Posible carga mensual alta",     d: "Puede haber demasiados pagos compitiendo con tus ingresos. Necesitamos tus datos para confirmarlo." });

  return '<div class="badge"><div class="dot"></div>Tu evaluacion inicial esta lista</div>'
    + '<h1>Ya analizamos tus respuestas.<br><span class="gradient">Ahora veamos el plan.</span></h1>'
    + '<div class="lead">Encontramos factores que podrian estar afectando hoy tu perfil financiero y tus posibilidades de aprobacion.</div>'
    + '<div class="sub">La idea no es pedirte otro formulario de cero. Primero te mostramos una lectura inicial. Despues, si queres mas precision, completas gastos y deudas.</div>'
    + '<div class="btn-wrap" style="margin-bottom:20px;">'
    + '<button class="btn btn-primary" id="btn-ver-evaluacion">Ver mi evaluacion inicial</button>'
    + '<button class="btn btn-secondary" id="btn-analisis-profundo">Completar analisis profundo</button>'
    + '</div>'
    + '<div class="disclaimer">No afecta futuras solicitudes. No es un score crediticio oficial.</div>'
    + '<div id="eval-card" class="hidden" style="margin-top:26px;">'
    + '<div class="card">'
    + '<div class="card-top"><div class="card-label">Evaluacion inicial</div>'
    + (signals.length > 0 ? '<div class="alert-badge">ATENCION</div>' : '<div class="alert-badge" style="border-color:rgba(52,255,175,.35);color:#34ffaf;">TODO BIEN</div>')
    + '</div>'
    + '<div class="card-title">Perfil con senales de presion financiera</div>'
    + signals.map(function(s) {
        return '<div class="signal"><div class="signal-icon">' + s.i + '</div><div><div class="signal-title">' + s.t + '</div><div class="signal-text">' + s.d + '</div></div></div>';
      }).join("")
    + good.map(function(s) {
        return '<div class="signal" style="border-color:rgba(52,255,175,.2);background:rgba(52,255,175,.05);"><div class="signal-icon">' + s.i + '</div><div><div class="signal-title">' + s.t + '</div><div class="signal-text">' + s.d + '</div></div></div>';
      }).join("")
    + '<div class="good-news"><strong>La buena noticia:</strong> con algunos ajustes podes mejorar progresivamente tu situacion y aumentar tus posibilidades futuras de aprobacion.</div>'
    + '<div style="margin-top:26px;"><button class="btn btn-primary" id="btn-ver-plan-personalizado">Ver mi plan personalizado</button></div>'
    + '</div>'
    + '<div class="card">'
    + '<div class="section-title">Para darte un diagnostico mas preciso necesitamos 2 minutos mas.</div>'
    + '<div class="section-text">No necesitas montos exactos. Una estimacion alcanza para detectar que deuda te esta danando mas.</div>'
    + '<div class="steps">'
    + [["1","Deudas","Identificamos donde esta hoy la mayor presion financiera."],["2","Gastos","Completamos el contexto real de tu flujo."],["3","Diagnostico","Interpretacion completa de tu situacion financiera actual."]]
      .map(function(x) { return '<div class="step"><div class="step-num">' + x[0] + '</div><div class="step-title">' + x[1] + '</div><div class="step-text">' + x[2] + '</div></div>'; }).join("")
    + '</div></div></div>';
}

function mostrarEvaluacion() {
  var el = document.getElementById("eval-card");
  if (el) { el.classList.remove("hidden"); setTimeout(function() { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); }
  track("view_initial_diagnosis", { segmento: SEGMENTO });
}

// =============================================================================
// STEP 1 — GASTOS
// =============================================================================
function renderGastos() {
  var gastos = _st().gastos || {};
  var total  = Object.values(gastos).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0);
  var pct    = PRE.ingreso > 0 ? total / PRE.ingreso : 0;
  var pc     = pct > 0.9 ? "#ff4e72" : pct > 0.7 ? "#ffd36f" : "#34ffaf";

  // New flow: Gastos is step index 2 for SEGMENTO 1, index 1 for others
  var html = renderStepPills(SEGMENTO === 1 ? 2 : 1, SEGMENTO === 1 ? 3 : 2);

  html += '<div style="font-size:15px;color:#8390b5;line-height:1.6;margin-bottom:20px;padding:0 4px;">'
    + 'El banco ya tiene informacion sobre vos. Este diagnostico te ayuda a entenderla.'
    + '</div>';

  if (SEGMENTO <= 2) {
    html += '<div class="card"><div class="card-label" style="margin-bottom:18px;">Datos de tu solicitud</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;">'
      + [["Nombre", PRE.nombre], ["Email", PRE.email], ["Ingreso mensual", fmt(PRE.ingreso)], ["Situacion laboral", SITUACION_LABELS[PRE.laboral] || PRE.laboral]]
        .filter(function(x) { return x[1]; })
        .map(function(x) { return '<div><label>' + x[0] + '</label><div style="font-size:18px;font-weight:700;color:rgba(255,255,255,.9);">' + x[1] + '</div></div>'; }).join("")
      + '</div></div>';
  }

  html += '<div class="card">'
    + '<div class="section-title">Tus gastos mensuales</div>'
    + '<div class="section-text">Completamos el contexto real de tu flujo mensual. Una estimacion alcanza para ver el margen disponible.</div>'
    + EXPENSE_CATS.map(function(c, i) {
        var val    = parseFloat(gastos[c.k]) || 0;
        var isOpen = val > 0 || i === 0;
        return '<div class="accordion-item">'
          + '<button class="accordion-trigger' + (isOpen ? " open" : "") + '" data-accordion>'
          + '<span>' + c.l + (val > 0 ? ' <span style="color:#40d7ff;font-size:17px;">' + fmt(val) + '</span>' : "") + '</span>'
          + '<span class="chevron">&#9660;</span></button>'
          + '<div class="accordion-body' + (isOpen ? " open" : "") + '">'
          + '<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;pointer-events:none;">$</span>'
          + '<input type="number" style="padding-left:36px;" placeholder="0" value="' + (gastos[c.k] || "") + '" data-gasto="' + c.k + '"/>'
          + '</div></div></div>';
      }).join("")
    + (total > 0
        ? '<div style="margin-top:20px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.2);border-radius:18px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;">'
          + '<span style="font-size:19px;font-weight:700;color:rgba(255,255,255,.8);">Total gastos</span>'
          + '<span id="total-gastos-val" style="font-size:36px;font-weight:900;color:' + pc + ';">' + fmt(total) + '</span>'
          + '</div>'
        : "")
    + '</div>';

  // Sprint 9 — inline warning when user tries to continue with no gastos
  if (_st()._showGastosWarning) {
    html += '<div style="background:rgba(255,196,0,.09);border:1px solid rgba(255,196,0,.28);border-radius:18px;padding:22px 24px;margin-bottom:16px;">'
      + '<div style="font-size:16px;font-weight:800;color:#ffd447;margin-bottom:10px;">⚠️ No cargaste gastos mensuales</div>'
      + '<div style="font-size:16px;color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:6px;">Podemos mostrarte un diagnóstico inicial, pero algunas proyecciones pueden verse más optimistas de lo real.</div>'
      + '<div style="font-size:14px;color:#8390b5;line-height:1.5;margin-bottom:20px;">Agregar gastos mejora la precisión del análisis.</div>'
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
      + '<button class="btn btn-primary" id="btn-gastos-warn-back" style="flex:1;min-width:140px;height:52px;font-size:16px;">Agregar gastos</button>'
      + '<button class="btn btn-secondary" id="btn-gastos-warn-skip" style="flex:1;min-width:140px;height:52px;font-size:15px;color:#ffd447;border-color:rgba(255,196,0,.3);">Continuar igual</button>'
      + '</div>'
      + '</div>';
  }

  if (SEGMENTO === 1) {
    html += '<button class="nav-back" id="btn-back-diag">&#8592; Atras</button>';
  }
  return html;
}

// =============================================================================
// STEP 2 — DEUDAS
// =============================================================================
function renderDeudas() {
  // New flow: Deudas is step index 1 for SEGMENTO 1, index 0 for others
  var html = renderStepPills(SEGMENTO === 1 ? 1 : 0, SEGMENTO === 1 ? 3 : 2);
  var deudas = _st().deudas || [];

  html += '<div class="card">'
    + '<div class="section-title">Tus deudas actuales</div>'
    + '<div class="section-text">Identificamos el acreedor, el monto y el comportamiento de pago para detectar donde esta hoy la mayor presion financiera.</div>'
    + '<div id="deudas-container">' + deudas.map(renderDeudaCard).join("") + '</div>'
    + '<button class="btn btn-secondary" style="height:68px;font-size:20px;margin-bottom:0;" id="btn-agregar-deuda">+ Agregar deuda</button>'
    + '<div class="metrics" id="metrics-live">' + renderMetricsLive() + '</div>'
    + '<div class="result" id="result-live"><h3 id="result-title">Todavia no analizamos tus deudas</h3>'
    + '<p id="result-text">Completa tus deudas para detectar que acreedor esta generando mas presion financiera.</p></div>'
    + '</div>'
    + '<button class="nav-back" id="btn-back-gastos">&#8592; Atras</button>';
  return html;
}

// =============================================================================
// STATUS-AWARE PAYMENT SECTION
// Renders different payment inputs based on the selected debt status.
// Conversational primary question — "¿Qué está pasando hoy con esta deuda?"
// Replaces the technical ESTADOS_DEUDA dropdown.
// Selection drives _renderPagoSection() follow-up questions.
// Internal estado is inferred by app.js — never shown as a raw technical value.
// =============================================================================
var _SITUACION_OPTS = [
  { v: "pagando_normal",   l: "La estoy pagando normalmente",     color: "#34ffaf", bg: "rgba(52,255,175,.1)"  },
  { v: "atrasado_pagando", l: "Me atrasé pero sigo pagando algo", color: "#ffd36f", bg: "rgba(255,211,111,.1)" },
  { v: "deje_pagar",       l: "Dejé de pagar",                   color: "#ff7538", bg: "rgba(255,117,56,.1)"  },
  { v: "mora_reclamo",     l: "Está en mora o reclamo",           color: "#ff4e72", bg: "rgba(255,78,114,.1)"  },
  { v: "no_seguro",        l: "No estoy seguro",                  color: "#8390b5", bg: "rgba(131,144,181,.1)" },
];

function _renderSituacionUI(d, i) {
  var sel = d.situacion_ui || "";
  return '<div style="margin-top:18px;">'
    + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:10px;">¿Qué está pasando hoy con esta deuda?</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px;">'
    + _SITUACION_OPTS.map(function(o) {
        var active = sel === o.v;
        return '<button type="button"'
          + ' data-deuda-situacion="' + o.v + '"'
          + ' data-deuda-idx="' + i + '"'
          + ' style="text-align:left;padding:12px 16px;border-radius:12px;border:1.5px solid '
          + (active ? o.color : "rgba(255,255,255,.1)") + ';background:'
          + (active ? o.bg : "transparent") + ';color:'
          + (active ? o.color : "rgba(255,255,255,.7)") + ';font-size:15px;font-weight:'
          + (active ? "800" : "600") + ';cursor:pointer;width:100%;line-height:1.4;">'
          + o.l + '</button>';
      }).join("")
    + '</div></div>';
}

// Renders a small inline button-group for option selection (atraso_tiempo, pago_clarificacion, etc.)
function _renderBtnGroup(opts, field, cur, idx) {
  return '<div style="display:flex;flex-direction:column;gap:6px;">'
    + opts.map(function(o) {
        var active = cur === o.v;
        return '<button type="button"'
          + ' data-deuda-field="' + field + '"'
          + ' data-deuda-val="' + o.v + '"'
          + ' data-deuda-idx="' + idx + '"'
          + ' style="text-align:left;padding:10px 14px;border-radius:10px;border:1.5px solid '
          + (active ? "rgba(64,215,255,.5)" : "rgba(255,255,255,.1)") + ';background:'
          + (active ? "rgba(64,215,255,.08)" : "transparent") + ';color:'
          + (active ? "#40d7ff" : "rgba(255,255,255,.65)") + ';font-size:14px;font-weight:'
          + (active ? "700" : "500") + ';cursor:pointer;width:100%;">'
          + o.l + '</button>';
      }).join("")
    + '</div>';
}

// =============================================================================
// CONDITIONAL FOLLOW-UP QUESTIONS
// Driven by d.situacion_ui (semantic user selection).
// Internal estado is inferred — never selected directly by user.
//
// Cases:
//   pagando_normal   → Case A: monthly payment input + clarification if 0
//   atrasado_pagando → Case B: delay range + last paid amount
//   deje_pagar       → Case C: delay range only (estado inferred from range)
//   mora_reclamo     → Case D: informational — no payment capture
//   no_seguro        → Case E: approximate timing question
// =============================================================================
function _renderPagoSection(d, i) {
  var situacion = d.situacion_ui || "";
  if (!situacion) return "";

  var pref  = '<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>';
  var numIn = function(field, val) {
    return pref + '<input type="number" style="padding-left:36px;" placeholder="0" value="'
      + (val != null && val !== "" ? val : "")
      + '" data-deuda-field="' + field + '" data-deuda-idx="' + i + '"/></div>';
  };

  // Case A — pagando normalmente
  if (situacion === "pagando_normal") {
    var showClarif = (!d.pago || parseFloat(d.pago) === 0);
    return '<div style="margin-top:16px;">'
      + '<div class="field"><label>¿Cuánto pagás por mes?</label>'
      + numIn("pago", d.pago)
      + '<div style="font-size:13px;color:#8390b5;margin-top:4px;">No tiene que ser exacto.</div>'
      + '</div>'
      + (showClarif
          ? '<div id="clarif-block-' + i + '" style="margin-top:12px;padding:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;">'
            + '<div style="font-size:14px;color:rgba(255,255,255,.75);margin-bottom:10px;">¿Esta deuda no tiene cuota este mes o preferís no declararlo?</div>'
            + _renderBtnGroup([
                { v: "sin_cuota",   l: "No tiene cuota este mes"  },
                { v: "no_recuerdo", l: "No recuerdo el monto"     },
                { v: "no_declaro",  l: "Prefiero no declararlo"   },
              ], "pago_clarificacion", d.pago_clarificacion || "", i)
            + '</div>'
          : '<div id="clarif-block-' + i + '" style="display:none;"></div>')
      + '</div>';
  }

  // Case B — atrasado pero sigue pagando algo
  if (situacion === "atrasado_pagando") {
    var optsB = [
      { v: "menos_30", l: "Menos de 30 días"   },
      { v: "30_90",    l: "Entre 30 y 90 días" },
    ];
    var ultimoVal = d.ultimo_pago_declarado != null && d.ultimo_pago_declarado !== "" ? d.ultimo_pago_declarado : d.pago;
    return '<div style="margin-top:16px;display:flex;flex-direction:column;gap:14px;">'
      + '<div class="field"><label>¿Hace cuánto no pagás completo?</label>'
      + _renderBtnGroup(optsB, "atraso_tiempo", d.atraso_tiempo || "", i)
      + '</div>'
      + '<div class="field"><label>¿Cuánto pagaste la última vez?</label>'
      + numIn("ultimo_pago_declarado", ultimoVal)
      + '<div style="font-size:13px;color:#8390b5;margin-top:4px;">Aunque haya sido parcial.</div>'
      + '</div></div>';
  }

  // Case C — dejó de pagar
  if (situacion === "deje_pagar") {
    var optsC = [
      { v: "menos_30", l: "Menos de 30 días"  },
      { v: "30_90",    l: "Entre 30 y 90 días" },
      { v: "mas_90",   l: "Más de 90 días"     },
    ];
    return '<div style="margin-top:16px;">'
      + '<div class="field"><label>¿Hace cuánto?</label>'
      + _renderBtnGroup(optsC, "atraso_tiempo", d.atraso_tiempo || "", i)
      + '</div></div>';
  }

  // Case D — mora o reclamo: no payment expected
  if (situacion === "mora_reclamo") {
    return '<div style="margin-top:14px;padding:10px 14px;background:rgba(255,78,114,.06);border:1px solid rgba(255,78,114,.15);border-radius:10px;">'
      + '<span style="font-size:13px;color:#8390b5;">Deuda en mora o reclamo — no hay pago mensual activo registrado.</span></div>';
  }

  // Case E — no está seguro
  if (situacion === "no_seguro") {
    var optsE = [
      { v: "poco_tiempo",  l: "Hace poco"           },
      { v: "varios_meses", l: "Hace varios meses"   },
      { v: "no_sabe",      l: "No lo sé"            },
    ];
    return '<div style="margin-top:16px;">'
      + '<div class="field"><label>¿Hace cuánto creés que empezó el problema?</label>'
      + _renderBtnGroup(optsE, "atraso_tiempo_aprox", d.atraso_tiempo_aprox || "", i)
      + '</div></div>';
  }

  return "";
}

// =============================================================================
// PESO-BASED FINANCIAL PRESSURE NOTE
// Contextual interpretation copy per situacion_ui (Sprint 6.5+).
// Legacy path retained for debts without situacion_ui (pre-Sprint 6.5).
// Internal TASAS and interesMostrado are used for enrichment only — not shown.
// =============================================================================
function _renderPresionNote(d) {
  var monto = parseFloat(d.monto) || 0;
  var pago  = parseFloat(d.pago)  || 0;
  if (!monto) return "";

  var sit  = d.situacion_ui || "";
  var wrap = function(txt) {
    return '<div style="font-size:14px;color:#8390b5;margin-top:8px;line-height:1.5;">' + txt + '</div>';
  };

  // ── Sprint 6.5+ path: contextual copy per semantic situacion ──────────────
  if (sit) {
    // Informal debt — flow pressure note overrides situacion copy
    if (d.tipo === "informal") {
      if (pago > 0) {
        return wrap('Este prestamo no siempre figura en Clearing o BCU, pero genera una presion de '
          + '<strong style="color:rgba(255,255,255,.8);">' + fmt(pago) + '</strong>/mes sobre tu flujo.');
      }
      return wrap('Este prestamo no siempre figura en Clearing o BCU, pero puede seguir generando presion sobre tu flujo real.');
    }

    if (sit === "pagando_normal") {
      if (pago <= 0) return ""; // clarification block handles the zero-pago state
      return wrap('Esta deuda representa una salida mensual aproximada de <strong style="color:rgba(255,255,255,.8);">' + fmt(pago) + '</strong>.');
    }

    if (sit === "atrasado_pagando") {
      return wrap('Aunque el pago sea parcial, esta deuda sigue generando presión mensual.');
    }

    if (sit === "deje_pagar") {
      return wrap('Aunque hoy no haya pagos activos, la deuda sigue impactando tu situación financiera.');
    }

    if (sit === "mora_reclamo") {
      return wrap('El impacto principal hoy parece venir del atraso acumulado.');
    }

    if (sit === "no_seguro") {
      return wrap('No hay suficiente información todavía para interpretar esta deuda con precisión.');
    }

    return "";
  }

  // ── Legacy path: pre-Sprint 6.5 debts without situacion_ui ───────────────
  if (d.tipo === "informal") {
    if (pago > 0) {
      return wrap('Este prestamo no siempre figura en Clearing o BCU, pero genera una presion de '
        + '<strong style="color:rgba(255,255,255,.8);">' + fmt(pago) + '</strong>/mes sobre tu flujo.');
    }
    return wrap('Este prestamo no siempre figura en Clearing o BCU, pero puede seguir generando presion sobre tu flujo real.');
  }

  var noPaySources = ["no_paga", "mora_sin_pago"];
  var isPagoInactivo = (pago === 0) || (d.pago_fuente && noPaySources.indexOf(d.pago_fuente) !== -1);
  if (isPagoInactivo) {
    return wrap('Hoy no hay un pago mensual activo registrado. El impacto puede estar en el atraso acumulado.');
  }

  // Active payment legacy fallback — interesMostrado computed internally, not shown as %
  var interesMostrado = d.interes_mostrado;
  if (!interesMostrado && monto > 0 && pago > 0) {
    var tasa = TASAS[d.tipo] || 62;
    var est  = monto * tasa / 100 / 12;
    var cap  = d.estado === "al_dia" ? pago * 0.80 : pago * 0.95;
    interesMostrado = Math.round(Math.min(est, cap));
  }
  if (!interesMostrado || interesMostrado <= 0) return "";

  return wrap('Esta deuda representa una salida mensual aproximada de <strong style="color:rgba(255,255,255,.8);">' + fmt(pago) + '</strong>.');
}

function renderDeudaCard(d, i) {
  var est         = getEstado(d.estado);  // reflects inferred internal estado
  var borderColor = est ? est.color : "rgba(61,220,255,.25)";
  var insight     = d.tipo ? getMicroInsight(d.tipo) : null;

  return '<div class="debt-card" id="debt-card-' + i + '" style="border-left:3px solid ' + borderColor + ';">'
    + '<div class="debt-top"><div class="debt-name">Deuda #' + (i + 1) + (d.acreedor ? " — " + d.acreedor : "") + '</div>'
    + '<button class="remove-btn" data-remove-deuda="' + i + '">&#215;</button></div>'
    + '<div class="grid">'

    // Tipo — TASAS remain internal; no rate labels shown
    + '<div class="field"><label>Tipo de deuda</label>'
    + '<select data-deuda-field="tipo" data-deuda-idx="' + i + '">'
    + '<option value="">Selecciona...</option>'
    + DEBT_TYPES.map(function(t) { return '<option value="' + t.v + '"' + (d.tipo === t.v ? " selected" : "") + '>' + t.l + '</option>'; }).join("")
    + '</select></div>'

    // Acreedor
    // TODO: Replace free-text creditor input with autocomplete
    // using the creditor dictionary in creditors.js.
    // Allow manual "otro" fallback only after no confident match.
    // Dictionary grows via CRM unknown creditor review process.
    + '<div class="field"><label>Acreedor</label>'
    + '<input type="text" placeholder="Ej: BROU, OCA..." value="' + (d.acreedor_raw != null ? d.acreedor_raw : (d.acreedor || "")) + '" data-deuda-field="acreedor" data-deuda-idx="' + i + '"/></div>'

    // Monto
    + '<div class="field"><label>Monto de la deuda</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="number" style="padding-left:36px;" placeholder="0" value="' + (d.monto || "") + '" data-deuda-field="monto" data-deuda-idx="' + i + '"/></div></div>'

    + '</div>'

    // Conversational primary question — replaces technical estado dropdown
    + _renderSituacionUI(d, i)

    // Conditional follow-up questions — driven by situacion_ui selection
    + _renderPagoSection(d, i)

    // Inferred estado indicator — visual diagnostic signal (non-technical copy)
    + (est
        ? '<div style="display:flex;align-items:center;gap:10px;margin-top:14px;padding:10px 14px;border-radius:10px;background:' + est.color + '15;border:1px solid ' + est.color + '30;">'
          + '<div style="width:10px;height:10px;border-radius:50%;background:' + est.color + ';flex-shrink:0;"></div>'
          + '<span style="font-size:13px;font-weight:700;color:' + est.color + ';">' + est.impact + '</span></div>'
        : "")

    // Peso-based pressure note (no TNA/%)
    + _renderPresionNote(d)

    + (insight ? '<div class="micro-insight micro-' + insight.cls + '">' + insight.txt + '</div>' : "")
    + '</div>';
}

function getMicroInsight(tipo) {
  var m = {
    tarjeta:    { cls: "warn",   txt: "⚠️ Las tarjetas de credito acumulan interes muy rapido. Son prioridad en cualquier plan de reduccion." },
    informal:   { cls: "warn",   txt: "Este tipo de deuda no siempre figura en el sistema financiero formal, pero puede generar presion significativa sobre el flujo mensual." },
    mora:       { cls: "danger", txt: "⚠️ Las deudas en mora tienen impacto directo y fuerte sobre el historial financiero. Son prioridad inmediata." },
    financiera: { cls: "warn",   txt: "⚠️ Las financieras suelen tener tasas elevadas. Puede valer la pena explorar opciones de refinanciacion." },
  };
  return m[tipo] || null;
}

function renderMetricsLive() {
  var fin    = calcularFinanciero();
  var deudas = window.CZState ? (window.CZState.deudas || []) : [];

  // Estimated total monthly interest in pesos — replaces TNA% metric
  // Uses interes_mostrado per debt if enriched, otherwise inline fallback
  var interesTotalEst = deudas.reduce(function(s, d) {
    if (d.interes_mostrado > 0) return s + d.interes_mostrado;
    var m = parseFloat(d.monto) || 0;
    var p = parseFloat(d.pago)  || 0;
    if (!m || !p || d.tipo === "informal") return s;
    var tasa = TASAS[d.tipo] || 62;
    var est  = m * tasa / 100 / 12;
    var cap  = d.estado === "al_dia" ? p * 0.80 : p * 0.95;
    return s + Math.round(Math.min(est, cap));
  }, 0);

  return '<div class="metric"><small>Deuda total</small><strong style="color:#ff4e72;">' + fmt(fin.totalDeuda) + '</strong></div>'
    + '<div class="metric"><small>Pago mensual</small><strong style="color:#ffd36f;">' + fmt(fin.totalPago) + '</strong></div>'
    + '<div class="metric"><small>Interes mensual est.</small><strong style="color:' + colorRiesgo(fin.nivelRiesgo) + ';font-size:18px;">~' + fmt(interesTotalEst) + '</strong></div>'
    // SPRINT 7B.2 — V1 RISK BADGE HIDDEN (not deleted)
    // Reason: color-coded risk damages premium tone
    // v2 recuperabilidad badge (Sprint 7B) is the correct surface for this information
    // Scheduled removal: Sprint 1 of Backend Phase
    + '<div style="display:none;height:0;overflow:hidden;"><div class="metric"><small>Nivel de riesgo</small><strong style="color:' + colorRiesgo(fin.nivelRiesgo) + ';">' + fin.nivelRiesgo + '</strong></div></div>';
}

// =============================================================================
// SPRINT 7B.3 — SUSPENDED DEBT / SEVERITY UI HELPERS
// =============================================================================

function _severityFromDiag(diag) {
  if (diag && diag.interpretacion_v2) return diag.interpretacion_v2;
  var deudas = (_st().deudas || []);
  if (typeof calcularSeveridadFinanciera !== "function") return {};
  var fin = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
  return calcularSeveridadFinanciera(fin, deudas, PRE.ingreso);
}

function actualizarResultLive() {
  var fin    = calcularFinanciero();
  var prio   = deudaPrioritaria();
  var deudas = _st().deudas || [];
  var sev    = typeof calcularSeveridadFinanciera === "function"
    ? calcularSeveridadFinanciera(fin, deudas, PRE.ingreso)
    : {};
  var title = document.getElementById("result-title");
  var text  = document.getElementById("result-text");
  if (!title || !text) return;
  if (!prio) {
    title.textContent = "Todavia no analizamos tus deudas";
    text.textContent  = "Completa tus deudas para detectar que acreedor esta generando mas presion financiera.";
    return;
  }
  title.textContent = (prio.acreedor || prio.tipo || "Esta deuda") + " parece ser tu deuda mas sensible";
  if (sev.severity_level === "critico" || (sev.has_unpaid_debt && sev.severe_latent_pressure)) {
    text.textContent = "La situacion muestra deterioro financiero severo. Aunque hoy no haya pagos activos, el tamano de la deuda y el atraso acumulado requieren estabilizacion antes de pensar en recuperacion.";
  } else if (sev.severity_level === "alto" || sev.has_mora_or_deje_pagar) {
    text.textContent = "Hay deudas sin pago activo o en atraso prolongado. La prioridad es estabilizar la situacion y entender el saldo actualizado antes de reorganizar pagos.";
  } else if (fin.nivelRiesgo === "Critico") {
    text.textContent = "Detectamos una combinacion de pagos altos y deuda cara. La prioridad es recuperar flujo y evitar seguir acumulando intereses.";
  } else if (fin.nivelRiesgo === "Medio") {
    text.textContent = "Tu situacion parece ordenable, pero ya hay presion financiera. La prioridad deberia ser reorganizar y atacar primero la deuda de " + (prio.acreedor || prio.tipo) + ".";
  } else if (sev.has_unpaid_debt) {
    text.textContent = "Hay deudas sin pago activo registrado. Eso no significa que esten resueltas: conviene estabilizar y confirmar el saldo actual antes de planificar.";
  } else if (window.CZState && window.CZState.gastos_missing_confirmed) {
    // Sprint 9 — confidence degradation: avoid optimistic summary when gastos are missing
    text.textContent = "El analisis muestra baja presion desde las deudas registradas, pero sin gastos declarados la imagen puede ser incompleta.";
  } else {
    text.textContent = "No parece una situacion critica, pero hay oportunidades claras para mejorar tu perfil si priorizas correctamente.";
  }
}

function actualizarMetrics() {
  var m = document.getElementById("metrics-live");
  if (m) m.innerHTML = renderMetricsLive();
  actualizarResultLive();
}

// =============================================================================
// DASHBOARD
// =============================================================================
function renderDashboard() {
  var st     = _st();
  var tab    = st.tab || "plan";
  var plus   = st.plusEstado || "sin_pago";
  var locked = function(id) { return (id === "ia" || id === "plus") && plus === "sin_pago"; };

  var TABS = [
    { id: "plan",   l: "Mi plan",     icon: "🎯" },
    { id: "deudas", l: "Mis deudas",  icon: "✏️" },
    { id: "ia",     l: "Asistente IA", icon: "🤖", lock: true },
    { id: "plus",   l: "Mi Plan Plus",  icon: "⭐", lock: true },
  ];

  return '<div class="tabs">'
    + TABS.map(function(t) {
        var isLocked = t.lock && locked(t.id);
        return '<button class="tab-btn' + (tab === t.id ? " active" : "") + (isLocked ? " locked" : "") + '" data-tab="' + t.id + '">'
          + t.icon + " " + t.l + (isLocked ? " 🔒" : "") + '</button>';
      }).join("")
    + '</div><div id="tab-content"></div>';
}

function renderTab() {
  var el  = document.getElementById("tab-content");
  var tab = (_st().tab || "plan");
  if (!el) return;
  if (tab === "plan")   el.innerHTML = renderTabPlan();
  if (tab === "deudas") el.innerHTML = renderTabDeudas();
  if (tab === "ia")     el.innerHTML = renderTabIA();
  if (tab === "plus")   el.innerHTML = renderTabPlus();
  bindTabEvents();
}

// =============================================================================
// SPRINT 2 — HELPERS DE RECUPERACION
// =============================================================================

function renderBloqueadores(diag) {
  var bl  = diag.bloqueadores;
  var iv2 = diag.interpretacion_v2 || {};

  // Sprint 8.6 — critical coherence guard.
  // A green "no blockers" card must never appear alongside Plan #4 / nivelR C.
  // Compute severity the same way as renderHorizonteRecalificacion (stale-data safe).
  var _sevLevel = iv2.severity_level;
  if (_sevLevel == null && typeof calcularSeveridadFinanciera === "function") {
    var _f = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
    _sevLevel = calcularSeveridadFinanciera(_f, (_st().deudas || []), PRE.ingreso).severity_level;
  }
  var isCriticalRenderedState =
    diag.planId === 4
    || diag.nivelR === "C"
    || _sevLevel === "critico"
    || iv2.severity_level === "critico";

  if (isCriticalRenderedState) {
    return '<div class="plan-card" style="border-color:rgba(255,211,111,.22);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
      + '<div style="padding:14px 16px;background:rgba(255,211,111,.06);border:1px solid rgba(255,211,111,.18);border-radius:12px;">'
      + '<div style="font-size:15px;font-weight:700;color:#ffd36f;line-height:1.4;margin-bottom:6px;">Perfil en estabilización crítica</div>'
      + '<div style="font-size:14px;color:#8390b5;line-height:1.6;">Hoy existen señales de deterioro financiero o inestabilidad suficientes como para frenar una evaluación normal de crédito.</div>'
      + '</div></div>';
  }

  if (!bl || bl.length === 0) {
    return '<div class="plan-card" style="border-color:rgba(52,255,175,.2);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
      + '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(52,255,175,.06);border:1px solid rgba(52,255,175,.15);border-radius:12px;">'
      + '<div style="font-size:18px;color:#34ffaf;">✓</div>'
      + '<div style="font-size:15px;color:rgba(255,255,255,.8);line-height:1.5;">Sin factores criticos detectados en tu perfil actual. Puede haber condiciones para intentar una solicitud.</div>'
      + '</div></div>';
  }
  return '<div class="plan-card">'
    + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
    + bl.map(function(b) {
        var isAlto = b.impacto === "alto";
        var bc   = isAlto ? "rgba(255,78,114,.09)"  : "rgba(255,211,111,.07)";
        var bord = isAlto ? "rgba(255,78,114,.22)"  : "rgba(255,211,111,.18)";
        var col  = isAlto ? "#ff4e72"               : "#ffd36f";
        return '<div style="display:flex;align-items:flex-start;gap:12px;padding:13px 16px;background:' + bc + ';border:1px solid ' + bord + ';border-radius:12px;margin-bottom:8px;">'
          + '<div style="width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0;margin-top:6px;"></div>'
          + '<div>'
          + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.9);line-height:1.4;">' + b.etiqueta + '</div>'
          + '<div style="font-size:13px;color:#8390b5;margin-top:3px;">' + (b.tipo === "informal" ? 'Puede generar presion financiera aunque no aparezca directamente en Clearing o BCU.' : isAlto ? 'Dificulta directamente la aprobacion de credito.' : 'Puede dificultar la aprobacion segun el criterio del banco.') + '</div>'
          + '</div></div>';
      }).join("")
    + '</div>';
}

function renderHorizonteRecalificacion(diag) {
  var h   = diag.horizonte;
  var sev = _severityFromDiag(diag);
  var iv2 = diag.interpretacion_v2 || {};

  // ── HORIZON GUARDRAIL (render-layer only) ─────────────────────────────────
  // Raw diag.horizonte values are NEVER modified; snapshot + CRM keep them.
  // Priority: 1) critical rendered state  2) negative cashflow  3) normal render

  // Sprint 8.4 stale-data fix: recompute severity from live state if the stored
  // interpretacion_v2 predates Sprint 7B.3 and is missing severity_level.
  var severityLevel = sev.severity_level;
  if (severityLevel == null && typeof calcularSeveridadFinanciera === "function") {
    var _fin   = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
    var _fresh = calcularSeveridadFinanciera(_fin, (_st().deudas || []), PRE.ingreso);
    severityLevel = _fresh.severity_level;
  }

  // Sprint 8.5 — Hard kill switch.
  // planId 4 and nivelR "C" can be assigned by behavioural scoring alone, without
  // debt data meeting the financial severity thresholds. Covering all four signals
  // ensures no time-range horizon is ever shown in a critical rendered state.
  var isCriticalRenderedState =
    diag.planId === 4
    || diag.nivelR === "C"
    || severityLevel === "critico"
    || iv2.severity_level === "critico";

  // ── 1. CRITICAL STATE OVERRIDE ────────────────────────────────────────────
  if (isCriticalRenderedState) {
    return '<div class="plan-card" style="border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:22px;font-weight:900;color:#8390b5;line-height:1.3;margin-bottom:10px;">No estimable sin estabilización previa</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Cuando el perfil está en estabilización crítica, primero hay que ordenar la situación y confirmar el saldo actualizado. Recién después se puede estimar un horizonte de recalificación.</div>'
      + '<div style="font-size:12px;color:#8390b5;line-height:1.55;margin-bottom:14px;">⚠️ Este diagnóstico se basa exclusivamente en la información que declaraste.</div>'
      + '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
      + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye <button id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#a0b0ff;font-size:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
      + '</div></div>';
  }

  // ── 2. NEGATIVE CASHFLOW OVERRIDE ─────────────────────────────────────────
  // flujoLibreActivo excludes suspended payments — the correct signal.
  var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
  var flujoLibreActivo = rad.flujoLibreActivo != null
    ? rad.flujoLibreActivo
    : (diag.fin ? diag.fin.flujoLibre : 0);

  var blockerTipos = (diag.bloqueadores || []).map(function(b) { return b.tipo; });
  var hasNegativeCashflowBlocker = blockerTipos.indexOf("flujo_insuficiente") !== -1
    || blockerTipos.indexOf("flujo_mensual_negativo") !== -1;
  var hasNegativeCausaPrincipal  = iv2.causa_principal === "flujo_negativo";

  var negativeFlowOverride = flujoLibreActivo < 0
    || hasNegativeCashflowBlocker
    || hasNegativeCausaPrincipal;

  if (negativeFlowOverride) {
    return '<div class="plan-card" style="border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:22px;font-weight:900;color:#8390b5;line-height:1.3;margin-bottom:10px;">No estimable con flujo mensual negativo</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Antes de proyectar una recalificación, primero hay que recuperar margen mensual positivo. Con flujo negativo, el horizonte no puede calcularse de forma responsable.</div>'
      + '<div style="font-size:12px;color:#8390b5;line-height:1.55;margin-bottom:14px;">⚠️ Esta proyección se basa exclusivamente en la información que declaraste.</div>'
      + '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
      + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye <button id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#a0b0ff;font-size:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
      + '</div></div>';
  }

  // ── 3. NORMAL HORIZON ─────────────────────────────────────────────────────
  var col  = (h.banda === "inmediato" || h.banda === "corto") ? "#34ffaf" : h.banda === "medio" ? "#ffd36f" : "#8390b5";
  var bg   = (h.banda === "inmediato" || h.banda === "corto") ? "rgba(52,255,175,.06)"  : h.banda === "medio" ? "rgba(255,211,111,.06)"  : "rgba(255,255,255,.03)";
  var bord = (h.banda === "inmediato" || h.banda === "corto") ? "rgba(52,255,175,.2)"   : h.banda === "medio" ? "rgba(255,211,111,.18)"  : "rgba(255,255,255,.08)";
  return '<div class="plan-card" style="border-color:' + bord + ';background:' + bg + ';">'
    + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
    + '<div style="font-size:26px;font-weight:900;color:' + col + ';line-height:1.25;margin-bottom:10px;">' + h.label + '</div>'
    + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Basado en la informacion analizada, sin nuevas deudas, siguiendo el plan. El historial real del sistema financiero puede incluir otros elementos que modifiquen este calculo.</div>'
    + '<div style="font-size:12px;color:#8390b5;line-height:1.55;margin-bottom:14px;">⚠️ Esta proyección se basa exclusivamente en la información que declaraste.</div>'
    + '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
    + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye <button id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#a0b0ff;font-size:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
    + '</div></div>';
}

// @deprecated — hidden Sprint 7.1
// Scheduled for removal: Sprint 1 Backend Phase
// Do not re-activate without reviewing v2 architecture
function renderAccionPrioritaria(diag) {
  var pc   = diag.plan.color;
  var int_ = diag.interpretacion;
  return '<div class="plan-card" style="border-color:' + pc + '40;">'
    + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Accion prioritaria</div>'
    + '<div style="display:flex;align-items:flex-start;gap:14px;padding:16px;background:' + pc + '12;border:1px solid ' + pc + '30;border-radius:14px;margin-bottom:' + (int_.secundaria ? '12' : '16') + 'px;">'
    + '<div style="min-width:28px;height:28px;border-radius:50%;background:' + pc + '30;color:' + pc + ';font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;">1</div>'
    + '<div style="font-size:16px;color:rgba(255,255,255,.9);line-height:1.55;font-weight:600;">' + int_.principal + '</div>'
    + '</div>'
    + (int_.secundaria
        ? '<div style="font-size:14px;color:#8390b5;line-height:1.65;padding:0 4px;margin-bottom:16px;">' + int_.secundaria + '</div>'
        : "")
    + '<div style="font-size:13px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Acciones del plan</div>'
    + diag.plan.prioridades.map(function(p, i) {
        return '<div class="prioridad-item"><div class="prioridad-num" style="background:' + pc + '20;color:' + pc + ';">' + (i + 1) + '</div><div class="prioridad-text" style="font-size:14px;">' + p + '</div></div>';
      }).join("")
    + '</div>';
}

// =============================================================================
// SPRINT 7B — INTERPRETACION NARRATIVE HELPERS
// =============================================================================

// Neutral recuperabilidad badge — NO color variation between states.
// Same background and text color for all values; only text changes.
function renderRecuperabilidadBadge(iv2) {
  var BADGE_TEXT = {
    recuperable_rapido:      "Recuperación posible",
    recuperable_medio:       "Recuperación gradual",
    recuperable_largo:       "Requiere tiempo",
    requiere_estabilizacion: "Estabilización primero",
    no_accionable:           "Margen insuficiente",
  };
  var txt = BADGE_TEXT[iv2.recuperabilidad_class] || "";
  if (!txt) return "";
  return '<div style="display:inline-block;padding:5px 14px;border-radius:20px;'
    + 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);'
    + 'font-size:12px;font-weight:700;color:rgba(255,255,255,.65);'
    + 'letter-spacing:.04em;margin-bottom:16px;">' + txt + '</div>';
}

// Renders the 4-block interpretacion_v2 narrative section.
// Uses getNarrativaByTipo() — never accesses array by index.
// Confidence note is rendered AFTER all four blocks, separate from card content.
function renderNarrativaInterpretacion(diag) {
  var iv2 = diag.interpretacion_v2;
  if (!iv2 || !iv2.narrativa_jerarquizada) return "";

  var nPrincipal = getNarrativaByTipo(iv2.narrativa_jerarquizada, "problema_principal");
  var nPresion   = getNarrativaByTipo(iv2.narrativa_jerarquizada, "presion_dominante");
  var nRecup     = getNarrativaByTipo(iv2.narrativa_jerarquizada, "recuperabilidad");
  var nPaso      = getNarrativaByTipo(iv2.narrativa_jerarquizada, "siguiente_paso");

  var block = function(label, text) {
    if (!text) return "";
    return '<div style="margin-bottom:16px;">'
      + '<div style="font-size:11px;font-weight:800;color:#8390b5;'
      + 'text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">' + label + '</div>'
      + '<div style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.65;">' + text + '</div>'
      + '</div>';
  };

  // Skip presion_dominante if patron is sin_patron AND confidence is not low.
  var showPresion = !(iv2.patron_deuda === "sin_patron" && iv2.confidence_level !== "low");

  var confidenceNote = "";
  if (iv2.confidence_level === "low") {
    confidenceNote = '<div style="margin-top:16px;padding-top:14px;'
      + 'border-top:1px solid rgba(255,255,255,.07);'
      + 'font-size:13px;color:#8390b5;line-height:1.6;">'
      + 'Este diagnóstico todavía puede mejorar si completás la información de tus deudas.'
      + '</div>';
  } else if (iv2.confidence_level === "medium") {
    confidenceNote = '<div style="margin-top:16px;padding-top:14px;'
      + 'border-top:1px solid rgba(255,255,255,.07);'
      + 'font-size:13px;color:#8390b5;line-height:1.6;">'
      + 'Algunos datos son estimados. El diagnóstico mejora con más información.'
      + '</div>';
  }

  return '<div class="plan-card">'
    + renderRecuperabilidadBadge(iv2)
    + block("Qué está pasando",        nPrincipal ? nPrincipal.texto : null)
    + (showPresion ? block("Presión principal",          nPresion  ? nPresion.texto  : null) : "")
    + block("Capacidad de recuperación", nRecup     ? nRecup.texto    : null)
    + block("Primer paso recomendado",   nPaso      ? nPaso.texto     : null)
    + confidenceNote
    + '</div>';
}

// =============================================================================
// TAB: MI PLAN
// =============================================================================
function renderTabPlan() {
  var diag   = _diag();
  var st     = _st();
  var fin    = diag.fin;
  var pc     = diag.plan.color;
  var prio   = diag.prio;
  var prog   = st.saldoIni > 0 ? Math.max(0, (st.saldoIni - fin.totalDeuda) / st.saldoIni * 100) : 0;

  // Sprint 9 — gastos missing warning card (near top of plan tab)
  var _gastosMissingCard = (st.gastos_missing_confirmed)
    ? '<div style="background:rgba(255,196,0,.08);border:1px solid rgba(255,196,0,.25);border-radius:14px;padding:14px 18px;margin-bottom:16px;font-size:14px;color:#ffd447;line-height:1.6;">'
      + '⚠️ Este diagnóstico no incluye tus gastos mensuales. Algunas proyecciones pueden ser menos precisas.'
      + '</div>'
    : '';

  return '<div class="fade">'
    + _gastosMissingCard
    + '<div style="margin-bottom:20px;padding:14px 18px;'
    + 'background:rgba(255,255,255,.03);'
    + 'border:1px solid rgba(255,255,255,.07);'
    + 'border-radius:12px;font-size:13px;'
    + 'color:#8390b5;line-height:1.6;">'
    + 'Este análisis se basa exclusivamente en la información que declaraste.'
    + '</div>'

    // 1. Plan card — situacion actual
    + '<div class="plan-card" style="border-color:' + pc + '33;">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px;">'
    + '<div><div class="plan-badge" style="background:' + pc + '20;color:' + pc + ';">Plan #' + diag.planId + ' · ' + diag.plan.titulo + '</div>'
    + '<div class="plan-title-big">' + diag.plan.icon + ' ' + diag.plan.titulo + '</div>'
    + '<div class="plan-desc">' + diag.plan.problema + '</div></div>'
    + '<div style="text-align:right;flex-shrink:0;">'
    + '<div class="score-big" style="color:' + colorScore(diag.scoreReset) + ';">' + diag.scoreReset + '</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-top:4px;">de 30</div>'
    + '<div style="font-size:14px;font-weight:800;color:' + colorNivel(diag.nivelR) + ';margin-top:6px;">' + nivelTexto(diag.nivelR) + '</div>'
    + '</div></div>'
    + '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:18px;">'
    + '<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Que busca este plan</div>'
    + '<div style="font-size:19px;color:rgba(255,255,255,.9);line-height:1.6;">' + diag.plan.objetivo + '</div>'
    + '</div>'
    + ((diag.planId === 4 || diag.nivelR === "C")
        ? '<div style="margin-top:14px;font-size:12px;color:#8390b5;line-height:1.6;">ℹ️ Este plan se basa en tu situación al momento del diagnóstico. Los cambios que hacés en deudas o gastos actualizan la simulación, pero el punto de partida sigue siendo tu evaluación original.</div>'
        : '')
    + '</div>'

    // 2. Interpretacion v2 — narrative blocks (Sprint 7B)
    + renderNarrativaInterpretacion(diag)

    // 3. Bloqueadores activos
    + renderBloqueadores(diag)

    // 4. Horizonte estimado para recalificar
    + renderHorizonteRecalificacion(diag)

    // Sprint 9 — Hidden Factor CTA
    // Rendered only when user appears financially healthy but came from a rejection.
    // Reuses existing Mi Plan Plus flow. No new checkout or route created.
    + (typeof detectHiddenFactorOpportunity === "function" && detectHiddenFactorOpportunity(diag)
        ? '<div class="plan-card" id="cz-hf-cta" style="background:rgba(64,215,255,.05);border-color:rgba(64,215,255,.2);">'
          + '<div style="font-size:13px;font-weight:800;color:#40d7ff;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">🔍 Tu perfil declarado no muestra un bloqueo evidente</div>'
          + '<div style="font-size:16px;color:rgba(255,255,255,.8);line-height:1.65;margin-bottom:12px;">Con la información que ingresaste, no aparece una causa clara para el rechazo. Puede haber factores externos que esta simulación no puede ver.</div>'
          + '<div style="font-size:14px;color:#8390b5;line-height:1.6;margin-bottom:20px;">Mi Plan Plus puede ayudarte a revisar información externa y entender mejor qué puede estar frenando la solicitud.</div>'
          + '<button class="btn btn-primary" id="btn-hf-cta" style="width:100%;height:60px;font-size:18px;">Ver mi informe completo</button>'
          + '</div>'
        : '')

    // 5. Accion prioritaria v1 (direccion estrategica — legacy)
    // SPRINT 7.1 — V1 ACTION HIDDEN (not deleted)
    // Reason: v2 narrative (Sprint 7B) is now the
    //   primary action surface.
    // V1 kept active internally for:
    //   - fallback safety on edge cases
    //   - CRM snapshot cross-calibration during
    //     first traffic phase
    // Scheduled removal: Sprint 1 of Backend Phase
    // Condition for removal: v2 validated with real
    //   user data, no edge-case failures detected
    //   in production.
    + '<div style="display:none;height:0;overflow:hidden;">' + renderAccionPrioritaria(diag) + '</div>'

    // 6. Accion prioritaria v2 — next_best_action via action_key (Sprint 7B)
    + (function() {
        var iv2 = diag.interpretacion_v2;
        if (!iv2 || !iv2.narrativa_jerarquizada) return "";
        var nPaso = getNarrativaByTipo(iv2.narrativa_jerarquizada, "siguiente_paso");
        if (!nPaso || !nPaso.texto) return "";
        return '<div class="plan-card" style="border-color:rgba(255,255,255,.1);">'
          + '<div style="font-size:13px;font-weight:800;color:#8390b5;'
          + 'text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Acción prioritaria</div>'
          + '<div style="padding:14px 16px;background:rgba(255,255,255,.04);'
          + 'border:1px solid rgba(255,255,255,.09);border-radius:12px;">'
          + '<div style="font-size:15px;color:rgba(255,255,255,.9);line-height:1.65;">'
          + nPaso.texto
          + '</div></div></div>';
      })()

    // 7. Por donde empezar (deuda especifica — ejecucion tactica)
    + (prio
        ? '<div class="priority-card">'
          + '<div style="font-size:13px;font-weight:800;color:#ffd36f;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Por donde empezar</div>'
          + '<div style="font-size:28px;font-weight:900;margin-bottom:14px;">' + (prio.acreedor || DEBT_TYPES.find(function(t) { return t.v === prio.tipo; })?.l || "Sin nombre") + '</div>'
          + '<div class="grid">'
          + (function() {
              var m = parseFloat(prio.monto) || 0;
              var p = parseFloat(prio.pago)  || 0;
              var sevPrio = _severityFromDiag(diag);
              // Peso-based pressure — no TNA/TEA% exposed
              var intEst = prio.interes_mostrado || (function() {
                if (!m || !p || prio.tipo === "informal") return 0;
                var tasa = TASAS[prio.tipo] || 62;
                var est  = m * tasa / 100 / 12;
                var cap  = prio.estado === "al_dia" ? p * 0.80 : p * 0.95;
                return Math.round(Math.min(est, cap));
              })();
              // Sprint 8.1: rename latent pressure row for clarity;
              // when pago=0 + severity critico, only show the potencial row.
              // Sprint 8.3: guard against displaying unrealistically large figures.
              var latentLabel = "Presión mensual potencial";
              var latentRaw   = prio.presion_latente_estimada || Math.round(m * (TASAS[prio.tipo]||62) / 100 / 12);
              var latentUnrealistic = prio.presion_latente_unrealistic_flag
                || (m > 0 && latentRaw / m > 0.25)
                || (PRE.ingreso > 0 && latentRaw / PRE.ingreso > 1.5);
              var latentVal = latentUnrealistic
                ? null   // null → qualitative copy rendered below
                : fmt(latentRaw);
              var rows;
              if (p === 0 && sevPrio.severity_level === "critico") {
                rows = latentUnrealistic
                  ? [["Monto", fmt(m), "#ff4e72"]]
                  : [
                      ["Monto",         fmt(m),     "#ff4e72"],
                      [latentLabel,     latentVal,  "#ffd447"],
                    ];
              } else {
                rows = [
                  ["Monto",                       fmt(m),       "#ff4e72"],
                  ["Pago mensual",                fmt(p),       "#ffd36f"],
                ];
                if (!latentUnrealistic) {
                  rows.push([latentLabel,                 latentVal,    "#8390b5"]);
                  rows.push(["Costo financiero est./mes", fmt(intEst),  "#ffd36f"]);
                }
              }
              return rows;
            })()
            .map(function(x) { return '<div><small style="color:#8390b5;display:block;margin-bottom:6px;">' + x[0] + '</small><strong style="font-size:' + (x[2] === "#8390b5" ? "20" : "32") + 'px;color:' + x[2] + ';">' + x[1] + '</strong></div>'; }).join("")
          + '</div>'
          + (prio.tipo === "informal"
              ? '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,211,111,.06);border:1px solid rgba(255,211,111,.15);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">Este tipo de deuda no siempre figura en el historial financiero formal, pero puede generar presion significativa sobre el flujo mensual y dificultar la estabilidad general.</div>'
              : "")
          + (function() {
              var sevP = _severityFromDiag(diag);
              var p0 = (parseFloat(prio.pago) || 0) === 0;
              var latentRawCheck = prio.presion_latente_estimada || 0;
              var unrealisticCheck = prio.presion_latente_unrealistic_flag
                || (parseFloat(prio.monto) > 0 && latentRawCheck / parseFloat(prio.monto) > 0.25)
                || (PRE.ingreso > 0 && latentRawCheck / PRE.ingreso > 1.5);
              var out = "";
              if (unrealisticCheck) {
                out += '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">El deterioro potencial de esta deuda es muy alto y el saldo actualizado debe verificarse.</div>';
              } else if (p0) {
                out += '<div style="margin-top:10px;font-size:12px;color:#8390b5;line-height:1.55;">Estimación si la deuda siguiera acumulando costo. No es una cuota activa.</div>';
              }
              if (sevP.severity_level === "critico" || sevP.has_mora_or_deje_pagar) {
                out += '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">Antes de acelerar pagos, conviene estabilizar el atraso, confirmar el saldo actualizado y frenar el deterioro. La prioridad no es pagar mas rapido sino recuperar control.</div>';
              }
              return out;
            })()
          + '</div>'
        : "")

    // 8. Herramientas del plan
    + renderHerramientas()

    // 9. Metricas de apoyo
    + (function() {
        var sev = _severityFromDiag(diag);
        var flujoNote = "";
        if (sev.severity_level === "critico" && sev.has_unpaid_debt) {
          flujoNote = '<div style="margin-top:12px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
            + 'El flujo actual puede verse artificialmente liberado por pagos suspendidos. Hay presión financiera estructural fuera del flujo mensual activo.'
            + '</div>';
        } else if (sev.has_unpaid_debt) {
          flujoNote = '<div style="margin-top:12px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">El flujo actual puede verse artificialmente liberado por pagos suspendidos.</div>';
        }
        var ratioPct = Math.round(fin.ratio * 100);
        var ratioColor = ratioPct > 50 ? "#ff4e72" : ratioPct > 35 ? "#ffd447" : "#34ffaf";
        var ratioSub   = "meta: menos del 30%";
        if (ratioPct === 0 && sev.has_unpaid_debt) {
          ratioColor = "#ffd447";
          ratioSub   = sev.severity_level === "critico"
            ? "presión mensual potencial fuera del flujo"
            : "sin pagos activos registrados";
        }
        var flujoColor = fin.flujoLibre < 0 ? "#ff4e72" : "#34ffaf";
        var flujoSub   = fin.flujoLibre < 0 ? "deficit" : "disponible";
        if (fin.flujoLibre >= 0 && sev.has_unpaid_debt) {
          flujoColor = "#ffd447";
          flujoSub   = "puede incluir alivio por pagos suspendidos";
        }
        // Sprint 9 — confidence degradation: flag incomplete gastos in flujo label
        if (st.gastos_missing_confirmed && fin.flujoLibre >= 0 && !sev.has_unpaid_debt) {
          flujoSub = "estimado — gastos no declarados";
        }
        return '<div class="metrics">'
          + [
              { l: "Plata que te sobra/mes",   v: fmt(fin.flujoLibre),               c: flujoColor, s: flujoSub },
              { l: "Total de deudas",           v: fmt(fin.totalDeuda),               c: "#ffd36f",  s: (_st().deudas||[]).length + " deuda" + ((_st().deudas||[]).length !== 1 ? "s" : "") },
              { l: "De tu sueldo va a deudas",  v: ratioPct + "%",                    c: ratioColor, s: ratioSub },
              { l: "Pagas en cuotas por mes",   v: fmt(fin.totalPago),                c: "rgba(255,255,255,.7)", s: "suma de minimos" },
            ].map(function(m) { return '<div class="metric"><small>' + m.l + '</small><strong style="color:' + m.c + ';">' + m.v + '</strong><div style="font-size:14px;color:#8390b5;margin-top:6px;">' + m.s + '</div></div>'; }).join("")
          + flujoNote
          + '</div>';
      })()

    // 10. Analisis financiero detallado (radiografia — bloques 1 a 4)
    + renderRadiografia()

    // 11. Composicion del perfil + progreso (contexto analitico)
    + '<div class="plan-card">'
    + '<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Composicion de tu perfil</div>'
    + '<div class="grid">'
    + '<div style="text-align:center;padding:18px;background:rgba(255,255,255,.04);border-radius:16px;">'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Situacion financiera</div>'
    + '<div style="font-size:52px;font-weight:900;color:' + colorScore(fin.scoreFinanciero) + ';line-height:1;letter-spacing:-2px;">' + fin.scoreFinanciero + '</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-top:6px;">gastos y deudas · max 30</div></div>'
    + '<div style="text-align:center;padding:18px;background:rgba(255,255,255,.04);border-radius:16px;">'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Perfil conductual</div>'
    + '<div style="font-size:52px;font-weight:900;color:' + (TIENE_ENCUESTA ? colorScore(diag.enc.score) : "#8390b5") + ';line-height:1;letter-spacing:-2px;">' + (TIENE_ENCUESTA ? diag.enc.score : "—") + '</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-top:6px;">' + (TIENE_ENCUESTA ? "analisis conductual · max 30" : "sin datos adicionales") + '</div></div>'
    + '</div>'
    + '<div style="margin-top:14px;font-size:15px;color:#8390b5;text-align:center;">Revision sugerida en <strong style="color:rgba(255,255,255,.8);">' + diag.plan.reevaluacion + '</strong></div>'
    + (!TIENE_ENCUESTA
        ? '<div style="margin-top:18px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;">'
          + '<div style="font-size:14px;font-weight:800;color:rgba(255,255,255,.7);margin-bottom:8px;">Refinar diagnostico financiero</div>'
          + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">El analisis actual se basa en tus ingresos, gastos y deudas. Responder algunas preguntas adicionales puede mejorar la precision del diagnostico.</div>'
          + '<button class="btn btn-secondary" style="height:52px;font-size:15px;" id="btn-refinar-diagnostico">Completar analisis conductual</button>'
          + '</div>'
        : "")
    + '</div>'

    + (st.saldoIni > 0
        ? '<div class="plan-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div><div style="font-size:20px;font-weight:800;">Tu progreso</div><div style="font-size:15px;color:#8390b5;margin-top:4px;">Dia ' + diag.diasRec + ' de recuperacion</div></div>'
          + '<div style="text-align:right;"><div style="font-size:52px;font-weight:900;color:' + (prog > 0 ? "#34ffaf" : "#8390b5") + ';line-height:1;letter-spacing:-2px;">' + Math.round(prog) + '%</div><div style="font-size:14px;color:#8390b5;">reducido</div></div></div>'
          + '<div class="progress-wrap"><div class="progress-bar" style="width:' + prog + '%;background:' + (prog > 50 ? "#34ffaf" : prog > 20 ? "#ffd36f" : "#ff4e72") + ';"></div></div>'
          + '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:15px;color:#8390b5;"><span>Inicio: ' + fmt(st.saldoIni) + '</span><span>Hoy: ' + fmt(fin.totalDeuda) + '</span></div>'
          + (prog > 0 ? '<div style="margin-top:12px;font-size:12px;color:#8390b5;line-height:1.6;">ℹ️ Esta mejora muestra el impacto de los cambios que hiciste sobre tus deudas. El diagnóstico de base no cambia hasta que se actualice tu evaluación.</div>' : '')
          + '</div>'
        : "")

    // 12. Premium
    + '<div class="premium-card">'
    + '<div class="premium-badge">Recomendado para tu caso</div>'
    + '<div class="premium-title">Mi Plan Plus</div>'
    + '<div class="premium-text">Tu diagnostico parte de lo que analizamos juntos. El informe Clearing muestra lo que el banco ya tiene sobre vos — y la IA te dice que cambiar primero.</div>'
    + '<button class="btn btn-secondary" style="height:68px;font-size:20px;" id="btn-conocer-plus">Ver que incluye para mi caso</button>'
    + '</div>'

    // Sprint 10.1 — suggestion box (last element in Mi Plan tab)
    + renderMiPlanSuggestionBox()

    + '</div>';
}

// =============================================================================
// SPRINT 10.1 — Mi Plan tab suggestion box
// =============================================================================
var MIPLAN_FEEDBACK_CATEGORIES = [
  "Por qué me rechazaron",
  "Cómo mejorar mi situación en Clearing o BCU",
  "Qué deuda conviene pagar primero",
  "Cómo negociar con mis acreedores",
  "Cuándo podría volver a pedir un crédito",
  "Cómo organizar mejor mis gastos",
  "Otro",
];

function renderMiPlanSuggestionBox() {
  var checks = MIPLAN_FEEDBACK_CATEGORIES.map(function(cat, i) {
    return '<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer;margin-bottom:12px;">'
      + '<input type="checkbox" class="chk-fb-cat" data-cat="' + cat + '" id="chk-fb-' + i + '" '
      + 'style="width:20px;height:20px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">'
      + '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.5;">' + cat + '</span>'
      + '</label>';
  }).join("");

  return '<div class="plan-card" id="cz-feedback-box" style="margin-top:28px;border-color:rgba(255,255,255,.1);">'
    + '<div style="font-size:18px;font-weight:800;margin-bottom:10px;">💬 ¿Qué te gustaría entender mejor?</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.65;margin-bottom:20px;">'
    + 'Contanos qué información te faltó o qué te gustaría que Mi Plan pueda ayudarte a entender.'
    + '</div>'
    + checks
    + '<div id="fb-otro-wrap" style="display:none;margin-top:8px;margin-bottom:16px;">'
    + '<textarea id="fb-otro-text" maxlength="500" placeholder="Contanos qué necesitás entender..." '
    + 'style="width:100%;min-height:96px;padding:14px 16px;background:rgba(255,255,255,.04);'
    + 'border:1px solid rgba(255,255,255,.12);border-radius:12px;color:rgba(255,255,255,.9);'
    + 'font-size:15px;line-height:1.5;resize:vertical;box-sizing:border-box;"></textarea>'
    + '<div id="fb-char-count" style="font-size:12px;color:#8390b5;margin-top:6px;text-align:right;">0 / 500 caracteres</div>'
    + '</div>'
    + '<div id="fb-feedback-msg" style="display:none;font-size:14px;line-height:1.5;margin-bottom:12px;padding:10px 14px;border-radius:10px;"></div>'
    + '<button class="btn btn-secondary" id="btn-feedback-submit" disabled '
    + 'style="width:100%;height:52px;font-size:16px;opacity:.45;transition:opacity .2s;">Enviar sugerencia</button>'
    + '</div>';
}

// =============================================================================
// RADIOGRAFIA FINANCIERA
// =============================================================================
function renderRadiografia() {
  var st   = _st();
  var diag = _diag();
  if (!diag || !st.deudas || st.deudas.length === 0) return "";
  var r    = calcularRadiografia();
  var sev  = _severityFromDiag(diag);
  var hasSuspendedDebt = sev.has_mora_or_deje_pagar || st.deudas.some(function(d) {
    return d.situacion_ui === "deje_pagar" || d.situacion_ui === "mora_reclamo";
  });
  var DISC = '<div style="font-size:12px;color:#8390b5;margin-top:6px;">* Basado en tasas estimadas de mercado. Tu tasa real puede variar.</div>';
  var SUSPENDED_DISC = '<div style="font-size:12px;color:#8390b5;margin-top:6px;">Estimacion orientativa. No representa una cuota ni un pago activo.</div>';
  var CRITICAL_DISC  = '<div style="font-size:12px;color:#8390b5;margin-top:6px;">Estimación orientativa basada en tasas internas. En deudas críticas, el saldo real debe verificarse.</div>';

  var isCritical = sev.severity_level === "critico"
    || (sev.deuda_total_ingreso_ratio != null && sev.deuda_total_ingreso_ratio >= 24);

  var interesTitle = hasSuspendedDebt
    ? "LO QUE PODRIA ACUMULARSE SOBRE LA DEUDA"
    : "Lo que pagas sin reducir deuda";
  var interesLabelMes = hasSuspendedDebt ? "Costo estimado por mes" : "Solo intereses por mes";
  var interesLabelAno = hasSuspendedDebt ? "Costo estimado en un ano" : "Solo en un ano";
  var interesDisclaimer = isCritical ? CRITICAL_DISC : hasSuspendedDebt ? SUSPENDED_DISC : DISC;

  var ratioPct = r.pctComprometido;
  var ratioColor = ratioPct > 50 ? "#ff4e72" : ratioPct > 35 ? "#ffd447" : "#34ffaf";
  var ratioCopy  = ratioPct > 50
    ? "Mas de la mitad del ingreso va a servicios de deuda."
    : ratioPct > 35
      ? "Una parte importante del ingreso ya esta comprometida en deudas."
      : "La carga de pagos activos es manejable en relacion al ingreso.";
  if (r.comprometido === 0 && sev.has_unpaid_debt) {
    ratioColor = "#ffd447";
    ratioCopy  = "No hay pagos activos registrados, pero eso no significa que la deuda este resuelta.";
    if (sev.severe_latent_pressure) {
      ratioCopy += " Hay presion financiera latente fuera del flujo mensual actual.";
    }
  }

  // Sprint 9 — confidence degradation: downgrade optimistic ratioCopy when gastos are missing
  if (st.gastos_missing_confirmed && ratioPct <= 35) {
    ratioCopy = "La carga de pagos sobre el ingreso parece limitada, pero sin gastos declarados el margen real puede ser menor.";
  }

  // Sprint 8.3 — guard aggregate interest display
  var interesUnrealistic = PRE.ingreso > 0 && r.interesMensualTotal / PRE.ingreso > 1.5;

  return '<div style="margin-bottom:20px;">'
    + '<div style="font-size:11px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">Tu radiografia financiera</div>'

    // 1. Interes puro / costo latente
    + '<div style="background:rgba(255,78,114,.07);border:1px solid rgba(255,78,114,.2);border-radius:18px;padding:20px;margin-bottom:12px;">'
    + '<div style="font-size:13px;font-weight:800;color:#ff4e72;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">💸 ' + interesTitle + '</div>'
    + (interesUnrealistic
        ? '<div style="font-size:15px;color:#8390b5;line-height:1.65;">El deterioro potencial de esta deuda es muy alto y el saldo actualizado debe verificarse.</div>'
        : '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
          + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">' + interesLabelMes + '</div><div style="font-size:34px;font-weight:900;color:#ff4e72;line-height:1;letter-spacing:-1px;">' + fmt(Math.round(r.interesMensualTotal)) + '</div></div>'
          + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">' + interesLabelAno + '</div><div style="font-size:34px;font-weight:900;color:#ffd447;line-height:1;letter-spacing:-1px;">' + fmt(Math.round(r.interesMensualTotal * 12)) + '</div></div>'
          + '</div>')
    + interesDisclaimer + '</div>'

    // 2. Meses por deuda
    + (st.deudas.some(function(_, i) { return r.mesesPorDeuda[i] !== null; })
        ? '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;margin-bottom:12px;">'
          + '<div style="font-size:13px;font-weight:800;color:#ffd447;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">📅 Cuando cancelarias cada deuda</div>'
          + st.deudas.map(function(d, i) {
              var meses  = r.mesesPorDeuda[i];
              if (meses === null) return "";
              var nombre = d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1);
              var color  = meses >= 60 ? "#ff4e72" : meses >= 24 ? "#ffd447" : "#34ffaf";
              var txt    = meses >= 999 ? "Nunca con el pago actual" : meses + " meses";
              return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);"><div style="font-size:15px;font-weight:700;">' + nombre + '</div><div style="font-size:20px;font-weight:900;color:' + color + ';">' + txt + '</div></div>';
            }).join("")
          + DISC + '</div>'
        : "")

    // 3. Ahorro extra
    + (r.ahorroPagandoExtra
        ? '<div style="background:rgba(52,255,175,.07);border:1px solid rgba(52,255,175,.2);border-radius:18px;padding:20px;margin-bottom:12px;">'
          + '<div style="font-size:13px;font-weight:800;color:#34ffaf;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">⚡ Si pagas ' + fmt(r.ahorroPagandoExtra.extra) + ' extra por mes</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
          + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Te ahorras en intereses</div><div style="font-size:34px;font-weight:900;color:#34ffaf;line-height:1;">' + fmt(Math.round(r.ahorroPagandoExtra.ahorro)) + '</div></div>'
          + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Cancelas ' + r.ahorroPagandoExtra.mesesMenos + ' meses antes</div><div style="font-size:34px;font-weight:900;color:#34ffaf;line-height:1;">' + r.ahorroPagandoExtra.mesesCon + ' meses</div>'
          + '<div style="font-size:12px;color:#8390b5;margin-top:4px;">vs ' + r.ahorroPagandoExtra.mesesSin + ' sin el extra</div></div>'
          + '</div>'
          + '<div style="margin-top:12px;font-size:14px;color:#8390b5;">Aplicado a tu deuda prioritaria: <strong style="color:rgba(255,255,255,.8);">' + (r.prio ? (r.prio.acreedor || (DEBT_TYPES.find(function(t) { return t.v === r.prio.tipo; }) || {}).l || "deuda principal") : "deuda principal") + '</strong></div>'
          + DISC + '</div>'
        : "")

    // 4. % comprometido — active payments only (Sprint 7B.2); framing fix (Sprint 7B.3)
    + '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;margin-bottom:12px;">'
    + '<div style="font-size:13px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">📊 De tu sueldo, cuanto va a pagos de deudas</div>'
    + '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">'
    + '<div style="font-size:52px;font-weight:900;color:' + ratioColor + ';line-height:1;letter-spacing:-2px;">' + ratioPct + '%</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.5;">' + ratioCopy + '</div>'
    + '</div>'
    + '<div style="height:14px;background:rgba(255,255,255,.08);border-radius:7px;overflow:hidden;margin-bottom:8px;">'
    + '<div style="height:100%;border-radius:7px;width:' + ratioPct + '%;background:' + ratioColor + ';"></div></div>'
    + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#8390b5;"><span>Pagos activos: ' + fmt(Math.round(r.comprometido)) + '</span><span>' + (st.gastos_missing_confirmed ? 'Flujo libre est. (sin gastos)' : 'Flujo libre') + ': ' + fmt(Math.max(0, r.flujoLibreActivo)) + '</span></div>'
    + '</div>'

    + '</div>';
}

// =============================================================================
// TAB: MIS DEUDAS
// =============================================================================
function renderTabDeudas() {
  var st     = _st();
  var diag   = _diag();
  var deudas = st.deudas || [];
  var total  = deudas.reduce(function(s, d) { return s + (parseFloat(d.monto) || 0); }, 0);
  var canc   = deudas.filter(function(d) { return parseFloat(d.monto) === 0 || d.cancelada; }).length;

  return '<div class="fade">'
    + '<div class="section-text">Actualiza tus saldos a medida que vas pagando. El plan y el puntaje se recalculan solos.</div>'
    + '<div class="metrics" style="margin-bottom:22px;">'
    + '<div class="metric"><small>Deuda total</small><strong style="color:#ff4e72;">' + fmt(total) + '</strong></div>'
    + '<div class="metric"><small>Canceladas</small><strong style="color:#34ffaf;">' + canc + '/' + deudas.length + '</strong></div>'
    + '<div class="metric"><small>Puntaje actual</small><strong style="color:' + colorScore(diag.scoreReset) + ';">' + diag.scoreReset + '</strong></div>'
    // SPRINT 7B.2 — V1 RISK BADGE HIDDEN (not deleted)
    // Reason: color-coded risk damages premium tone
    // v2 recuperabilidad badge (Sprint 7B) is the correct surface for this information
    // Scheduled removal: Sprint 1 of Backend Phase
    + '<div style="display:none;height:0;overflow:hidden;"><div class="metric"><small>Nivel</small><strong style="color:' + colorNivel(diag.nivelR) + ';font-size:24px;">' + nivelTexto(diag.nivelR) + '</strong></div></div>'
    + '</div>'
    + deudas.map(renderDeudaLive).join("")
    + '<div style="text-align:center;margin-top:14px;font-size:16px;color:#8390b5;">Los cambios se guardan automaticamente.</div>'
    + '</div>';
}

function renderDeudaLive(d, i) {
  var canc = parseFloat(d.monto) === 0 || d.cancelada;
  return '<div class="debt-card" id="dlive-' + i + '" style="border-color:' + (canc ? "rgba(52,255,175,.3)" : "rgba(255,255,255,.1)") + ';opacity:' + (canc ? 0.65 : 1) + ';">'
    + '<div class="debt-top">'
    + '<div class="debt-name">' + (canc ? "✅ " : "") + (d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1)) + (canc ? " — Cancelada!" : "") + '</div>'
    + (!canc ? '<button class="btn btn-secondary" style="height:44px;font-size:14px;padding:0 16px;color:#34ffaf;border-color:rgba(52,255,175,.3);" data-cancelar-deuda="' + i + '">&#10003; Cancelar</button>' : "")
    + '</div>'
    + (!canc ? '<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span><input type="number" style="padding-left:36px;" value="' + (d.monto || "") + '" placeholder="0" data-editar-deuda="' + i + '"/></div>' : "")
    + '</div>';
}

// =============================================================================
// TAB: IA
// =============================================================================
function renderTabIA() {
  var st  = _st();
  var ia  = st.iaRes;
  var plus = st.plusEstado || "sin_pago";
  if (plus === "sin_pago") {
    return '<div class="fade"><div class="locked-overlay">'
      + '<div class="locked-blur" style="height:280px;background:rgba(255,255,255,.03);border-radius:22px;"></div>'
      + '<div class="locked-gate"><div class="locked-icon">🤖</div><div class="locked-title">Tu analisis esta casi listo</div>'
      + '<div class="locked-text">En cuanto tengamos tu informe Clearing real, la IA te dice exactamente que esta bloqueando tu aprobacion y cual es el primer paso concreto para tu caso.</div>'
      + '<button class="btn btn-primary" style="height:68px;font-size:20px;" id="btn-conocer-plus-ia">Ver que incluye para mi caso</button>'
      + '</div></div></div>';
  }
  if (!ia) return '<div class="fade"><div class="result"><h3>Generando tu analisis...</h3><p>El asistente esta procesando tu informe Clearing.</p></div></div>';
  return '<div class="fade"><div class="result"><h3 style="color:#40d7ff;">"' + ia.mensaje + '"</h3></div>'
    + '<div class="plan-card"><div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">🔍 Diagnostico</div><div style="font-size:19px;color:rgba(255,255,255,.8);line-height:1.65;">' + ia.diagnostico + '</div></div>'
    + (ia.primerPaso ? '<div class="plan-card" style="background:rgba(52,255,175,.07);border-color:rgba(52,255,175,.2);"><div style="font-size:13px;color:#34ffaf;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;">Hace esto esta semana</div><div style="font-size:22px;font-weight:800;line-height:1.5;">' + ia.primerPaso + '</div></div>' : "")
    + '</div>';
}

// =============================================================================
// TAB: Mi Plan PLUS
// =============================================================================
function renderTabPlus() {
  var plus = (_st().plusEstado || "sin_pago");
  if (plus === "sin_pago") {
    return '<div class="fade"><div class="locked-overlay">'
      + '<div class="locked-blur" style="height:260px;background:rgba(255,255,255,.03);border-radius:22px;"></div>'
      + '<div class="locked-gate"><div class="locked-icon">📊</div><div class="locked-title">Tu historial en el sistema</div>'
      + '<div class="locked-text">Hasta ahora solo el banco lo veia. Aca te lo mostramos a vos — y te decimos exactamente que significa para tu caso.</div>'
      + '<button class="btn btn-primary" style="height:68px;font-size:20px;" id="btn-conocer-plus-tab">Ver que incluye para mi caso</button>'
      + '<div style="margin-top:12px;font-size:16px;color:#8390b5;">Desde UYU 990 · Devolucion garantizada 7 dias</div>'
      + '</div></div></div>';
  }
  return '<div class="fade"><div class="result"><h3>Informe disponible</h3><p>Tu informe Clearing esta listo.</p></div></div>';
}

// =============================================================================
// HERRAMIENTAS POR PLAN
// =============================================================================
function renderHerramientas() {
  var diag = _diag();
  if (!diag) return "";
  var herr = _herr();
  var pid  = diag.planId;
  var pc   = diag.plan.color;
  var comp = contarCompletadas();

  var html = '<div style="margin-top:4px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
    + '<div><div style="font-size:20px;font-weight:900;">Herramientas del plan</div>'
    + '<div style="font-size:15px;color:#8390b5;margin-top:2px;">Cada paso que completas nos ayuda a ayudarte mejor</div></div>'
    + '<div style="text-align:right;"><div style="font-size:44px;font-weight:900;color:' + (comp === 3 ? pc : "#8390b5") + ';line-height:1;letter-spacing:-2px;">' + comp + '/3</div>'
    + '<div style="font-size:14px;color:#8390b5;">completadas</div></div></div>'
    + '<div class="progress-wrap" style="margin-bottom:18px;"><div class="progress-bar" style="width:' + Math.round(comp / 3 * 100) + '%;background:' + pc + ';"></div></div>';

  if      (pid === 1) html += renderHerramientasPlan1();
  else if (pid === 2) html += renderHerramientasPlan2();
  else if (pid === 3) html += renderHerramientasPlan3();
  else if (pid === 4) html += renderHerramientasPlan4();
  else                html += renderHerramientasPlan5();

  return html + '</div>';
}

function contarCompletadas() {
  var herr = _herr();
  var pid  = (_diag() || {}).planId;
  if (pid === 1) return [herr.ingresos && herr.ingresos.total > 0, Object.keys(herr.gastos_cls||{}).length > 0, herr.ingresos && herr.ingresos.total > 0 && Object.keys(herr.gastos_cls||{}).length > 0].filter(Boolean).length;
  if (pid === 2) return [Object.keys(herr.gestiones||{}).length > 0, Object.values(herr.compromisos||{}).some(Boolean), true].filter(Boolean).length;
  // Plan 3 h1 is now a derived pressure diagnostic (always complete — no date inputs required)
  if (pid === 3) return [true, Object.values(herr.compromisos||{}).some(Boolean), true].filter(Boolean).length;
  if (pid === 4) return [Object.keys(herr.semaforo||{}).length === 3, Object.values(herr.compromisos||{}).some(Boolean), true].filter(Boolean).length;
  if (pid === 5) return [Object.keys(herr.habitos||{}).length > 0, Object.keys(herr.atrasos||{}).length > 0, true].filter(Boolean).length;
  return 0;
}

function renderToolCard(num, titulo, desc, contenido, done) {
  var pc = (_diag() || {plan:{color:"#40d7ff"}}).plan.color;
  return '<div class="tool-card">'
    + '<div class="tool-header"><div class="tool-num' + (done ? " done" : "") + '"><span>' + (done ? "&#10003;" : num) + '</span></div>'
    + '<div><div class="tool-title">' + titulo + '</div><div class="tool-desc">' + desc + '</div></div></div>'
    + (contenido || "")
    + '</div>';
}

function renderCompItem(id, label) {
  var done = (_herr().compromisos || {})[id];
  return '<div class="compromiso-item" data-toggle-compromiso="' + id + '">'
    + '<div class="compromiso-check' + (done ? " checked" : "") + '">' + (done ? "&#10003;" : "") + '</div>'
    + '<div class="compromiso-text">' + label + '</div></div>';
}

// ---- Plan 1 ----
function renderHerramientasPlan1() {
  var herr = _herr();
  var ing  = herr.ingresos || { formal: 0, extras: [], total: 0 };
  var gc   = herr.gastos_cls || {};
  var gastos = _st().gastos || {};
  var totalA = EXPENSE_CATS.filter(function(c) { return gc[c.k] === "ajustable"; }).reduce(function(s, c) { return s + (parseFloat(gastos[c.k]) || 0); }, 0);
  var flujoR = (ing.total || PRE.ingreso) - Object.values(gastos).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0) - (_diag() ? _diag().fin.totalPago : 0);
  var c1 = ing.total > 0;
  var c2 = Object.keys(gc).length > 0;
  var gCV = EXPENSE_CATS.filter(function(c) { return parseFloat(gastos[c.k]) > 0; });

  var h1 = renderToolCard(1, "Cuanto te entra realmente por mes?",
    "El ingreso registrado en tu solicitud es " + fmt(PRE.ingreso) + ". Suma cualquier otro ingreso que no figure ahi.",
    '<div style="margin-top:4px;">'
    + '<div style="position:relative;margin-bottom:12px;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="number" style="padding-left:36px;" id="ing-formal" value="' + (ing.formal || PRE.ingreso) + '"/></div>'
    + '<div id="ingresos-extras">'
    + (ing.extras || []).map(function(e, i) {
        return '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:flex-end;margin-bottom:12px;">'
          + '<div><label>Tipo</label><select data-ing-extra-idx="' + i + '" data-ing-extra-field="tipo"><option value="">Selecciona...</option>'
          + ["Changa","Alquiler que cobro","Ayuda familiar","Comision","Horas extra","Otro"].map(function(t) { return '<option value="' + t + '"' + (e.tipo === t ? " selected" : "") + '>' + t + '</option>'; }).join("")
          + '</select></div>'
          + '<div><label>Monto mensual</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
          + '<input type="number" style="padding-left:36px;" value="' + (e.monto || "") + '" data-ing-extra-idx="' + i + '" data-ing-extra-field="monto"/></div></div>'
          + '<button class="remove-btn" data-quitar-ing-extra="' + i + '" style="margin-bottom:0;">&#215;</button></div>';
      }).join("")
    + '</div>'
    + '<button class="btn btn-secondary" style="height:56px;font-size:17px;margin-bottom:14px;" id="btn-agregar-ing-extra">+ Agregar otro ingreso</button>'
    + (ing.total > 0
        ? '<div style="background:rgba(64,215,255,.1);border:1px solid rgba(64,215,255,.3);border-radius:16px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;">'
          + '<span style="font-size:18px;font-weight:700;color:rgba(255,255,255,.8);">Total real que te entra</span>'
          + '<span style="font-size:40px;font-weight:900;color:#40d7ff;letter-spacing:-2px;">' + fmt(ing.total) + '</span></div>'
        : "")
    + '</div>', c1);

  var h2 = renderToolCard(2, "Separa lo que no podes reducir de lo que si podes",
    "Para cada gasto marca si es fijo o si podes reducirlo.",
    gCV.length === 0
      ? '<div style="font-size:17px;color:#8390b5;margin-top:8px;">Todavia no hay gastos en tu diagnostico.</div>'
      : '<div style="margin-top:8px;">'
        + gCV.map(function(c) {
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
              + '<div><div style="font-size:18px;font-weight:700;">' + c.l + '</div><div style="font-size:15px;color:#8390b5;">' + fmt(parseFloat(gastos[c.k]) || 0) + '/mes</div></div>'
              + '<div style="display:flex;gap:8px;">'
              + '<button data-cls-gasto="' + c.k + '" data-cls-tipo="fijo" style="padding:8px 16px;border-radius:12px;border:1.5px solid ' + (gc[c.k] === "fijo" ? "#ff4e72" : "rgba(255,255,255,.15)") + ';background:' + (gc[c.k] === "fijo" ? "rgba(255,78,114,.15)" : "transparent") + ';color:' + (gc[c.k] === "fijo" ? "#ff4e72" : "rgba(255,255,255,.6)") + ';font-size:15px;font-weight:800;cursor:pointer;">Fijo</button>'
              + '<button data-cls-gasto="' + c.k + '" data-cls-tipo="ajustable" style="padding:8px 16px;border-radius:12px;border:1.5px solid ' + (gc[c.k] === "ajustable" ? "#34ffaf" : "rgba(255,255,255,.15)") + ';background:' + (gc[c.k] === "ajustable" ? "rgba(52,255,175,.1)" : "transparent") + ';color:' + (gc[c.k] === "ajustable" ? "#34ffaf" : "rgba(255,255,255,.6)") + ';font-size:15px;font-weight:800;cursor:pointer;">Puedo reducirlo</button>'
              + '</div></div>';
          }).join("")
        + (totalA > 0
            ? '<div style="margin-top:14px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);border-radius:14px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;"><div style="font-size:17px;color:rgba(255,255,255,.8);">Potencial de ahorro mensual</div><div style="font-size:36px;font-weight:900;color:#34ffaf;letter-spacing:-1px;">' + fmt(totalA) + '</div></div>'
            : "")
        + '</div>', c2);

  var h3 = renderToolCard(3, "Tu plata libre real cada mes", "Con todo lo que entra y todo lo que sale, esto es lo que te queda.",
    (c1 && c2)
      ? '<div style="text-align:center;padding:24px;background:' + (flujoR >= 0 ? "rgba(52,255,175,.08)" : "rgba(255,78,114,.08)") + ';border:1px solid ' + (flujoR >= 0 ? "rgba(52,255,175,.25)" : "rgba(255,78,114,.25)") + ';border-radius:16px;margin-top:8px;">'
        + '<div style="font-size:16px;color:#8390b5;margin-bottom:8px;">Te queda libre cada mes</div>'
        + '<div style="font-size:64px;font-weight:900;color:' + (flujoR >= 0 ? "#34ffaf" : "#ff4e72") + ';line-height:1;letter-spacing:-3px;">' + fmt(Math.abs(flujoR)) + '</div>'
        + '<div style="font-size:18px;color:' + (flujoR >= 0 ? "#34ffaf" : "#ff4e72") + ';font-weight:700;margin-top:8px;">' + (flujoR >= 0 ? "despues de pagar todo" : "EN DEFICIT") + '</div></div>'
        + (flujoR < 0 ? '<div class="micro-insight micro-danger" style="margin-top:12px;">Cada mes gastar mas de lo que entra acelera el deterioro del perfil.</div>' : "")
      : '<div style="font-size:17px;color:#8390b5;margin-top:8px;">Completa las herramientas 1 y 2 primero para ver este resultado.</div>',
    c1 && c2);

  return h1 + h2 + h3;
}

// ---- Plan 2 ----
function renderHerramientasPlan2() {
  var herr  = _herr();
  var gest  = herr.gestiones || {};
  var comp_ = herr.compromisos || {};
  var diag  = _diag();
  var c1 = Object.keys(gest).length > 0;
  var c2 = Object.values(comp_).some(Boolean);
  var intMes = diag.fin.totalDeuda * (diag.fin.interesProm / 100 / 12);
  var RESS = [
    { v: "no_intentado",    l: "Todavia no lo intente" },
    { v: "sin_respuesta",   l: "Llame pero no pude hablar" },
    { v: "ofrecieron_plan", l: "Me ofrecieron un plan de pagos" },
    { v: "sin_acuerdo",     l: "No llegamos a un acuerdo" },
    { v: "negociado",       l: "Ya negocie algo" },
  ];

  var h1 = renderToolCard(1, "Pudiste contactar a tus acreedores?", "Para cada deuda contanos como esta la gestion.",
    '<div style="margin-top:8px;">'
    + (_st().deudas || []).map(function(d, i) {
        var key = d.acreedor || d.tipo || "d" + (i + 1);
        var g   = gest[key] || {};
        return '<div style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
          + '<div style="font-size:18px;font-weight:800;margin-bottom:10px;">' + (d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1)) + '</div>'
          + '<select data-gestion-key="' + key + '">' + RESS.map(function(r) { return '<option value="' + r.v + '"' + (g.resultado === r.v ? " selected" : "") + '>' + r.l + '</option>'; }).join("") + '</select>'
          + (g.resultado === "sin_respuesta" ? '<div class="micro-insight micro-warn" style="margin-top:8px;">Vamos a ayudarte a intentarlo de nuevo. Anotamos que no pudiste contactarlos.</div>' : "")
          + (g.resultado === "ofrecieron_plan" ? '<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Excelente! Queres que te ayudemos a evaluar si el plan conviene? Eso lo podes hacer con Mi Plan Plus.</div>' : "")
          + (g.resultado === "negociado" ? '<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Muy bien! Eso mejora tu perfil directamente.</div>' : "")
          + '</div>';
      }).join("")
    + '</div>', c1);

  var h2 = renderToolCard(2, "Las acciones prioritarias de recuperacion", "Tres acciones que hoy impactan directamente tu margen y tu perfil.",
    '<div style="margin-top:8px;">'
    + renderCompItem("no_deuda_nueva", "No voy a sacar ninguna deuda nueva este mes")
    + renderCompItem("pagar_minimos",  "Voy a pagar los minimos en fecha")
    + renderCompItem("contactar",      "Voy a intentar contactar a mi acreedor principal esta semana")
    + (Object.values(comp_).filter(Boolean).length === 3 ? '<div style="margin-top:14px;padding:14px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);border-radius:14px;text-align:center;font-size:18px;font-weight:800;color:#34ffaf;">Comprometiste los 3 puntos. Eso marca la diferencia.</div>' : "")
    + '</div>', c2);

  var h3 = renderToolCard(3, "Cuanto te cuesta no hacer nada", "Cada mes que pasa sin atacar la deuda, los intereses siguen corriendo.",
    '<div style="margin-top:8px;"><div class="grid">'
    + '<div style="text-align:center;padding:18px;background:rgba(255,78,114,.08);border:1px solid rgba(255,78,114,.2);border-radius:16px;"><div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Pagas de interes POR MES</div><div style="font-size:44px;font-weight:900;color:#ff4e72;line-height:1;letter-spacing:-2px;">' + fmt(Math.round(intMes)) + '</div></div>'
    + '<div style="text-align:center;padding:18px;background:rgba(255,211,111,.08);border:1px solid rgba(255,211,111,.2);border-radius:16px;"><div style="font-size:14px;color:#8390b5;margin-bottom:8px;">En UN ANO si no actuas</div><div style="font-size:44px;font-weight:900;color:#ffd36f;line-height:1;letter-spacing:-2px;">' + fmt(Math.round(intMes * 12)) + '</div></div>'
    + '</div></div>', true);

  return h1 + h2 + h3;
}

// ---- Plan 3 ----
function renderHerramientasPlan3() {
  var herr  = _herr();
  var comp_ = herr.compromisos  || {};
  var diag  = _diag();
  // c1 is always true: pressure diagnostic is derived from debt data, no user action required
  var c1 = true;
  var c2 = Object.values(comp_).some(Boolean);
  var rA = diag.fin.ratio;
  var dif = Math.max(0, (rA - 0.30) * PRE.ingreso);

  // Vencimiento date inputs removed — replaced with per-debt financial pressure summary
  var ESTADO_LABELS = {
    "al_dia":        { l: "Al dia",          color: "#34ffaf" },
    "atraso_leve":   { l: "Atraso leve",     color: "#ffd36f" },
    "atraso_grave":  { l: "Atraso grave",     color: "#ff4e72" },
    "mora":          { l: "En mora",          color: "#ff4e72" },
    "informal":      { l: "Deuda informal",   color: "#ff4e72" },
    "negociando":    { l: "En negociacion",   color: "#40d7ff" },
    "refinanciado":  { l: "Refinanciado",     color: "#40d7ff" },
  };
  var h1 = renderToolCard(1, "Donde esta hoy tu mayor presion financiera", "Las deudas que hoy generan mas presion sobre tu margen mensual.",
    '<div style="margin-top:8px;">'
    + (function() {
        var deudas = _st().deudas || [];
        if (!deudas.length) return '<div style="font-size:16px;color:#8390b5;">No hay deudas registradas todavia.</div>';
        return deudas.map(function(d, i) {
          var nombre   = d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1);
          var eInfo    = ESTADO_LABELS[d.estado] || { l: "Sin estado", color: "#8390b5" };
          var presion  = d.presion_latente_estimada || 0;
          var presColor = presion > 5000 ? "#ff4e72" : presion > 2000 ? "#ffd36f" : "#40d7ff";
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
            + '<div style="flex:1;">'
              + '<div style="font-size:17px;font-weight:700;">' + nombre + '</div>'
              + '<div style="margin-top:4px;display:inline-block;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:700;background:rgba(255,255,255,.05);border:1px solid ' + eInfo.color + ';color:' + eInfo.color + ';">' + eInfo.l + '</div>'
            + '</div>'
            + (presion > 0
                ? '<div style="text-align:right;"><div style="font-size:20px;font-weight:900;color:' + presColor + ';letter-spacing:-1px;">' + fmt(Math.round(presion)) + '</div><div style="font-size:12px;color:#8390b5;">presion/mes</div></div>'
                : '<div style="font-size:14px;color:#8390b5;">Sin datos</div>')
            + '</div>';
        }).join("");
      })()
    + '</div>', c1);

  var h2 = renderToolCard(2, "Las obligaciones que hoy mas afectan tu margen", "Estos tres habitos marcan la diferencia en el proceso de recuperacion.",
    '<div style="margin-top:8px;">'
    + renderCompItem("pagar_fecha",    "Voy a pagar todo en fecha este mes")
    + renderCompItem("no_gasto_extra", "No voy a hacer gastos que no tenia planeados")
    + renderCompItem("revisar_ratio",  "En 30 dias voy a revisar mi ratio de deuda")
    + '</div>', c2);

  var h3 = renderToolCard(3, "Tu progreso hacia el objetivo", "Tu meta es bajar el ratio de deuda por debajo del 30% de tu ingreso.",
    '<div style="margin-top:8px;">'
    + '<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:17px;font-weight:700;"><span>Ratio actual: <span style="color:' + (rA > 0.35 ? "#ff4e72" : "#ffd447") + ';">' + Math.round(rA * 100) + '%</span></span><span>Meta: <span style="color:#34ffaf;">30%</span></span></div>'
    + '<div class="progress-wrap" style="height:14px;margin-bottom:10px;"><div class="progress-bar" style="width:' + Math.min(rA / 0.30 * 100, 100) + '%;background:' + (rA <= 0.30 ? "#34ffaf" : "#ff4e72") + ';height:14px;"></div></div>'
    + (dif > 0 ? '<div style="font-size:17px;color:#8390b5;">Para llegar al 30% necesitas reducir tus pagos en <strong style="color:#40d7ff;">' + fmt(Math.round(dif)) + '</strong> por mes.</div>' : '<div style="font-size:17px;color:#34ffaf;font-weight:800;">Ya estas dentro del objetivo! Mantenerlo es la clave.</div>')
    + '</div>', true);

  return h1 + h2 + h3;
}

// ---- Plan 4 ----
function renderHerramientasPlan4() {
  var herr  = _herr();
  var sem   = herr.semaforo   || {};
  var comp_ = herr.compromisos || {};
  var c1 = Object.keys(sem).length === 3;
  var c2 = Object.values(comp_).some(Boolean);
  var semOk = sem.nueva_deuda === false && sem.pago_minimos === true && sem.flujo_positivo === true;
  var PREGS = [
    { id: "nueva_deuda",    l: "Tomaste alguna deuda nueva este mes?" },
    { id: "pago_minimos",   l: "Pudiste pagar todos los minimos?" },
    { id: "flujo_positivo", l: "Tu flujo este mes fue positivo?" },
  ];
  var gastos     = _st().gastos || {};
  var diag       = _diag();
  var flujoBase  = diag ? diag.fin.flujoLibre : 0;
  var maxSlider  = Math.max(2000, Object.values(gastos).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0));
  var flujoColor = flujoBase >= 0 ? "#34ffaf" : "#ff4e72";

  var h1 = renderToolCard(1, "Semaforo de tu situacion", "Tres preguntas para saber como estas esta semana.",
    '<div style="margin-top:8px;">'
    + PREGS.map(function(p) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
          + '<span style="font-size:17px;font-weight:700;flex:1;">' + p.l + '</span>'
          + '<div style="display:flex;gap:8px;">'
          + '<button data-sem-id="' + p.id + '" data-sem-val="true" style="padding:8px 18px;border-radius:12px;border:1.5px solid ' + (sem[p.id] === true ? "#34ffaf" : "rgba(255,255,255,.15)") + ';background:' + (sem[p.id] === true ? "rgba(52,255,175,.1)" : "transparent") + ';color:' + (sem[p.id] === true ? "#34ffaf" : "rgba(255,255,255,.6)") + ';font-size:16px;font-weight:800;cursor:pointer;">Si</button>'
          + '<button data-sem-id="' + p.id + '" data-sem-val="false" style="padding:8px 18px;border-radius:12px;border:1.5px solid ' + (sem[p.id] === false ? "#ff4e72" : "rgba(255,255,255,.15)") + ';background:' + (sem[p.id] === false ? "rgba(255,78,114,.1)" : "transparent") + ';color:' + (sem[p.id] === false ? "#ff4e72" : "rgba(255,255,255,.6)") + ';font-size:16px;font-weight:800;cursor:pointer;">No</button>'
          + '</div></div>';
      }).join("")
    + (c1 ? '<div style="margin-top:14px;padding:16px;border-radius:14px;background:' + (semOk ? "rgba(52,255,175,.1)" : "rgba(255,78,114,.1)") + ';border:1px solid ' + (semOk ? "rgba(52,255,175,.25)" : "rgba(255,78,114,.25)") + ';text-align:center;font-size:18px;font-weight:800;color:' + (semOk ? "#34ffaf" : "#ff4e72") + ';"><span style="font-size:28px;">' + (semOk ? "✅" : "⚠️") + '</span><br>' + (semOk ? "Bien encaminado — seguila" : "Hay senales de alerta") + '</div>' : "")
    + '</div>', c1);

  var h2 = renderToolCard(2, "Compromisos de emergencia", "Estos tres son innegociables en tu situacion actual.",
    '<div style="margin-top:8px;">'
    + renderCompItem("no_deuda",    "No voy a tomar ninguna deuda nueva")
    + renderCompItem("ord_informal","Voy a ordenar mis deudas informales primero")
    + renderCompItem("ingreso_extra","Voy a buscar aunque sea una fuente de ingreso extra")
    + '</div>', c2);

  var h3 = renderToolCard(3, "Cuanto podrias liberar por mes",
    "Indica un monto mensual posible. No importa de que gasto venga.",
    '<div style="margin-top:8px;">'

    // Slider general de reduccion
    + '<div style="margin-bottom:22px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
    + '<span style="font-size:15px;font-weight:700;color:rgba(255,255,255,.8);">Monto mensual a liberar</span>'
    + '<span style="font-size:15px;font-weight:800;color:#40d7ff;" id="lv-liberar">' + fmt(0) + '</span>'
    + '</div>'
    + '<input type="range" min="0" max="' + maxSlider + '" step="500" value="0" data-liberar-monto style="width:100%;accent-color:#40d7ff;"/>'
    + '</div>'

    // Ingresos complementarios
    + '<div style="margin-bottom:22px;padding:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;">'
    + '<div style="font-size:14px;font-weight:800;color:rgba(255,255,255,.7);margin-bottom:6px;">Ingresos complementarios</div>'
    + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:12px;">Si tenes ingresos variables, changas, horas extra o apoyo puntual, podes incluirlos para ver tu margen mensual potencial.</div>'
    + '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.6);margin-bottom:6px;">Monto mensual adicional</div>'
    + '<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="number" style="padding-left:36px;" placeholder="0" id="ing-complementario" data-ingreso-comp/></div>'
    + '<div style="margin-top:10px;font-size:12px;color:#8390b5;line-height:1.6;">Puede mejorar tu margen real, pero no siempre cuenta como ingreso formal para bancos o financieras.</div>'
    + '</div>'

    // Flujo simulado
    + '<div style="background:rgba(64,215,255,.06);border:1px solid rgba(64,215,255,.18);border-radius:14px;padding:18px 20px;text-align:center;">'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Plata disponible por mes</div>'
    + '<div style="font-size:44px;font-weight:900;color:' + flujoColor + ';letter-spacing:-2px;" id="flujo-simulado">' + fmt(flujoBase) + '</div>'
    + '<div style="font-size:13px;color:#8390b5;margin-top:10px;line-height:1.6;">Estos ajustes muestran como podria cambiar tu margen mensual disponible. El diagnostico financiero no cambia hasta que esos cambios sean reales.</div>'
    + '</div>'

    + '</div>', true);

  return h1 + h2 + h3;
}

// ---- Plan 5 ----
function renderHerramientasPlan5() {
  var herr = _herr();
  var hab  = herr.habitos  || {};
  var atr  = herr.atrasos  || {};
  var diag = _diag();
  var c1 = Object.keys(hab).length > 0;
  var c2 = Object.keys(atr).length > 0;
  var diasR = diag.diasRec || 0;
  var pct90 = Math.min(Math.round(diasR / 90 * 100), 100);
  var hoy = new Date();
  var dias7 = [];
  for (var i = 6; i >= 0; i--) { var d = new Date(hoy); d.setDate(hoy.getDate() - i); dias7.push(d.toISOString().slice(0, 10)); }
  var EATR = [
    { v: "sin_gestionar", l: "Sin gestionar" },
    { v: "en_negociacion",l: "En proceso de negociacion" },
    { v: "plan_pagos",    l: "Acorde un plan de pagos" },
    { v: "regularizada",  l: "Regularizada" },
  ];

  var h1 = renderToolCard(1, "Tu tracker de constancia", "Marca los dias en que mantuviste tus habitos positivos.",
    '<div style="margin-top:10px;"><div style="display:flex;gap:8px;justify-content:space-between;margin-bottom:14px;">'
    + dias7.map(function(f) {
        var dd = new Date(f);
        var lbl = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"][dd.getDay()];
        var num = dd.getDate();
        var m   = hab[f];
        return '<div style="text-align:center;cursor:pointer;" data-toggle-habito="' + f + '">'
          + '<div style="font-size:13px;color:#8390b5;margin-bottom:6px;">' + lbl + '</div>'
          + '<div style="width:40px;height:40px;border-radius:50%;border:2px solid ' + (m ? "#34ffaf" : "rgba(255,255,255,.2)") + ';background:' + (m ? "rgba(52,255,175,.2)" : "transparent") + ';display:flex;align-items:center;justify-content:center;font-size:' + (m ? "18" : "16") + 'px;font-weight:900;color:' + (m ? "#34ffaf" : "rgba(255,255,255,.4)") + ';margin:0 auto;">' + (m ? "&#10003;" : num) + '</div></div>';
      }).join("")
    + '</div>'
    + (diasR > 0 ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.2);border-radius:12px;"><span style="font-size:17px;font-weight:700;color:#40d7ff;">' + diasR + ' dias de constancia</span><span style="font-size:15px;color:#8390b5;">Meta: 90 dias</span></div>' : "")
    + '</div>', c1);

  var h2 = renderToolCard(2, "Estado de tus atrasos reportados", "Actualiza el estado de cada deuda a medida que avanzas.",
    '<div style="margin-top:8px;">'
    + (_st().deudas || []).map(function(d, i) {
        var key = d.acreedor || d.tipo || "d" + (i + 1);
        var est = atr[key] || "sin_gestionar";
        return '<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
          + '<div style="font-size:17px;font-weight:800;margin-bottom:8px;">' + (d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1)) + '</div>'
          + '<select data-atraso-key="' + key + '">' + EATR.map(function(e) { return '<option value="' + e.v + '"' + (est === e.v ? " selected" : "") + '>' + e.l + '</option>'; }).join("") + '</select>'
          + (est === "regularizada" ? '<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Excelente! Eso mejora directamente tu perfil crediticio.</div>' : "")
          + '</div>';
      }).join("")
    + '</div>', c2);

  var h3 = renderToolCard(3, "Tu progreso a 90 dias", "La meta es 90 dias de habitos sostenidos.",
    '<div style="margin-top:8px;">'
    + '<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:17px;font-weight:700;"><span>Dia ' + diasR + ' de 90</span><span style="color:#40d7ff;">' + pct90 + '%</span></div>'
    + '<div class="progress-wrap" style="height:14px;margin-bottom:14px;"><div class="progress-bar" style="width:' + pct90 + '%;background:#40d7ff;height:14px;"></div></div>'
    + '<div class="grid">'
    + [{d:30,l:"Primera revision"},{d:60,l:"Mitad del camino"},{d:90,l:"Meta final"}].map(function(m) {
        var ok = diasR >= m.d;
        return '<div style="text-align:center;padding:14px;background:' + (ok ? "rgba(52,255,175,.1)" : "rgba(255,255,255,.03)") + ';border:1px solid ' + (ok ? "rgba(52,255,175,.25)" : "rgba(255,255,255,.08)") + ';border-radius:14px;"><div style="font-size:13px;font-weight:800;color:' + (ok ? "#34ffaf" : "#8390b5") + ';margin-bottom:4px;">' + (ok ? "&#10003; " : "") + 'Dia ' + m.d + '</div><div style="font-size:13px;color:#8390b5;">' + m.l + '</div></div>';
      }).join("")
    + '</div></div>', true);

  return h1 + h2 + h3;
}

// =============================================================================
// MODAL PREMIUM
// =============================================================================
function renderModalPremium() {
  return '<div class="premium-modal-content">'

    // Header: badge + headline + close
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">'
    + '<div>'
    + '<div class="premium-badge">El siguiente paso</div>'
    + '<div style="font-size:30px;font-weight:900;line-height:1.15;margin-top:8px;">Tu perfil financiero real.</div>'
    + '<div style="font-size:16px;color:#8390b5;margin-top:8px;line-height:1.5;">Interpretado con IA. Con un plan concreto para volver a calificar.</div>'
    + '</div>'
    + '<button id="btn-cerrar-premium" class="modal-close-btn" type="button">&#215;</button>'
    + '</div>'

    // Guarantee — moved to top, visually prominent
    + '<div style="background:rgba(52,255,175,.07);border:1px solid rgba(52,255,175,.22);border-radius:16px;padding:16px 18px;margin-bottom:18px;display:flex;align-items:center;gap:14px;">'
    + '<div style="font-size:28px;flex-shrink:0;">🛡</div>'
    + '<div>'
    + '<div style="font-size:15px;font-weight:800;color:#34ffaf;margin-bottom:3px;">Garantia de devolucion — 7 dias</div>'
    + '<div style="font-size:14px;color:#8390b5;line-height:1.5;">Si en 7 dias no te sirve, te devolvemos el dinero. Sin preguntas. El informe es provisto por <strong style="color:rgba(255,255,255,.7);">Clearing de Informes Uruguay</strong>.</div>'
    + '</div>'
    + '</div>'

    // Intro — BCU + Clearing + AI positioning
    + '<div class="premium-text" style="margin-bottom:18px;">Tu diagnostico actual usa estimaciones. Mi Plan Plus analiza tu historial real del sistema financiero uruguayo — Clearing, BCU y mas — y te dice exactamente que esta frenando tu aprobacion y como resolverlo.</div>'

    // Feature list — errores first (highest emotional impact)
    + '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:22px;margin-bottom:18px;">'
    + '<div style="font-size:13px;color:#8390b5;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:16px;">Que incluye</div>'

    + '<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
    + '<span style="font-size:22px;flex-shrink:0;">✓</span>'
    + '<div><div style="font-size:18px;font-weight:700;margin-bottom:3px;">Deteccion de errores en tu historial</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.5;">Si hay algo mal registrado que te esta bloqueando, te lo mostramos. Eso solo puede cambiar el resultado.</div></div></div>'

    + '<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
    + '<span style="font-size:22px;flex-shrink:0;">🔍</span>'
    + '<div><div style="font-size:18px;font-weight:700;margin-bottom:3px;">Datos reales del sistema financiero</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.5;">Historial de Clearing, informacion del BCU y consultas activas sobre tu perfil</div></div></div>'

    + '<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
    + '<span style="font-size:22px;flex-shrink:0;">🤖</span>'
    + '<div><div style="font-size:18px;font-weight:700;margin-bottom:3px;">Analisis con IA</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.5;">La IA lee tu informe y te dice que corregir primero, en base a tu caso</div></div></div>'

    + '<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
    + '<span style="font-size:22px;flex-shrink:0;">📋</span>'
    + '<div><div style="font-size:18px;font-weight:700;margin-bottom:3px;">Plan recalculado con datos reales</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.5;">Tu plan se actualiza con lo que realmente figura — no con lo que estimaste</div></div></div>'

    + '<div style="display:flex;gap:14px;padding:12px 0;">'
    + '<span style="font-size:22px;flex-shrink:0;">✉️</span>'
    + '<div><div style="font-size:18px;font-weight:700;margin-bottom:3px;">Todo en tu correo en menos de 24hs</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.5;">Recibis el informe y el analisis directamente</div></div></div>'

    + '</div>'

    // Single pricing card
    + '<div style="background:rgba(64,215,255,.06);border:2px solid rgba(64,215,255,.3);border-radius:22px;padding:24px;margin-bottom:18px;" data-elegir-plan="one_time">'
    + '<div style="font-size:13px;color:#40d7ff;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Diagnostico completo</div>'
    + '<div class="price-amount">990</div>'
    + '<div class="price-label">UYU · pago unico</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.6;margin-top:10px;">Informe financiero real + analisis IA + plan de accion. Pago unico. Sin suscripcion.</div>'
    + '<button class="btn btn-primary" style="width:100%;height:56px;font-size:18px;margin-top:16px;" data-elegir-plan="one_time">Acceder al diagnostico completo</button>'
    + '</div>'

    + '</div>';
}

function abrirModalPremium() {
  var diag    = _diag();
  var content = document.getElementById("modal-premium-content");
  var overlay = document.getElementById("modal-premium");

  trackEvent(CZ_EVENT_NAMES.PREMIUM_OPENED, { plan: diag && diag.planId, score: diag && diag.scoreReset });

  if (content) content.innerHTML = renderModalPremium();

  if (overlay) {
    overlay.classList.remove("hidden");
    document.body.classList.add("modal-open");
    overlay.scrollTop = 0;

    var closeBtn = document.getElementById("btn-cerrar-premium");

    function cerrarPremium() {
      overlay.classList.add("hidden");
      document.body.classList.remove("modal-open");
    }

    if (closeBtn) closeBtn.onclick = cerrarPremium;

    overlay.onclick = function(e) {
      if (e.target === overlay) cerrarPremium();
    };

    overlay.querySelectorAll("[data-elegir-plan]").forEach(function(btn) {
      btn.onclick = function() {
        var tipo = btn.getAttribute("data-elegir-plan");
        // Checkout started — recovery state + temporal tracking
        if (window.CZState) {
          window.CZState.temporal.payment_completed_at = null; // reset in case of re-entry
          setRecoveryState("checkout_started");
          trackEvent(CZ_EVENT_NAMES.CHECKOUT_STARTED, {
            tipo: tipo, plan: diag && diag.planId,
          });
        }
        track("click_reset_plus", { tipo: tipo, plan: diag && diag.planId });

        if (content) {
          content.innerHTML = '<div style="padding:48px 28px;text-align:center;">'
            + '<div style="font-size:44px;margin-bottom:22px;">📩</div>'
            + '<div style="font-size:24px;font-weight:900;margin-bottom:12px;line-height:1.2;">Recibimos tu pedido</div>'
            + '<div style="font-size:17px;color:#8390b5;line-height:1.7;margin-bottom:24px;">'
            + 'En breve te vamos a contactar para completar el proceso y enviarte tu informe Clearing.'
            + '</div>'
            + '<div style="padding:14px 18px;background:rgba(64,215,255,.07);border:1px solid rgba(64,215,255,.15);border-radius:14px;font-size:15px;color:#8390b5;line-height:1.6;">'
            + 'Cualquier consulta: <strong style="color:#40d7ff;">info@credizona.com.uy</strong>'
            + '</div>'
            + '</div>';
        }
      };
    });
  }
}
function bindTabEvents() {
  // No-op por ahora. Los eventos principales están delegados desde app.js.
}

// =============================================================================
// DIAGNOSIS SCREEN — step 0, behavioral data available (survey or CRM/localStorage)
// Replaces renderGastos() as the step 0 screen for users who have completed the survey.
// Does NOT run calcularMotor() — enc is derived from existing URL params or loaded diag.
// =============================================================================
function renderDiagnosisScreen() {
  var diag  = _diag();
  // Prefer enc from loaded diag (CRM / localStorage); fallback to live URL-param calculation
  var enc   = (diag && diag.enc) ? diag.enc : calcularEncuesta(PRE.respuestas);
  var nivel = enc ? enc.nivel : "B";

  var LEVELS = {
    "A": {
      labelText:  "Perfil conductual sin alertas criticas",
      labelColor: "#34ffaf",
      line1:      "Tus respuestas no muestran factores de riesgo conductual importantes.",
      line2:      "El rechazo puede estar relacionado con la estructura de tus deudas o el ratio de pagos mensual.",
      accion:     "Para completar el diagnostico, vemos el panorama de tus deudas.",
    },
    "B+": {
      labelText:  "Perfil con disposicion al cambio",
      labelColor: "#a78bfa",
      line1:      "Tus habitos financieros muestran capacidad de mejora.",
      line2:      "Hay factores por corregir, pero el punto de partida es recuperable con orden.",
      accion:     "Para afinar el diagnostico, analizamos tus deudas actuales.",
    },
    "B": {
      labelText:  "Perfil con aspectos a revisar",
      labelColor: "#ffd36f",
      line1:      "Tu situacion muestra puntos de riesgo que vale ordenar.",
      line2:      "Con el detalle de tus deudas podemos identificar cuales son los mas relevantes.",
      accion:     "Completamos el analisis con tus deudas actuales.",
    },
    "C": {
      labelText:  "Perfil con factores de riesgo activos",
      labelColor: "#ff4e72",
      line1:      "Hay mas de un factor que puede estar complicando las aprobaciones hoy.",
      line2:      "Para entender exactamente que esta pasando, necesitamos el detalle de tus deudas.",
      accion:     "Ahora vamos a ordenar el panorama de tus deudas. Con eso podemos detectar que esta generando mas presion hoy.",
    },
  };

  var lv = LEVELS[nivel] || LEVELS["B"];

  // Contextual modifier — shown when flagsRiesgo contain specific signals
  var modifier = "";
  if (enc && enc.flagsRiesgo && enc.flagsRiesgo.length > 0) {
    modifier = '<p style="font-size:13px;color:#8390b5;margin:14px 0 0;padding:12px 14px;'
      + 'background:rgba(255,255,255,.04);border-radius:10px;line-height:1.55;">'
      + 'Algunas respuestas muestran senales de presion financiera que pueden estar afectando tus aprobaciones hoy.'
      + '</p>';
  }

  // Horizon — only show precise label when a prior diag (with real financial data) exists.
  // Without financial data there is no credible basis for a time estimate.
  var horizHtml;
  if (diag && diag.horizonte) {
    var hColor = diag.horizonte.banda === "inmediato" ? "#34ffaf"
               : diag.horizonte.banda === "corto"    ? "#ffd36f" : "#8390b5";
    horizHtml = '<div style="font-size:13px;color:' + hColor + ';font-weight:600;margin-bottom:24px;">'
      + 'Horizonte estimado: ' + diag.horizonte.label + '</div>';
  } else {
    horizHtml = '<div style="font-size:13px;color:#5a6480;margin-bottom:24px;line-height:1.5;">'
      + 'El horizonte depende del peso real de tus deudas. Lo calculamos en el siguiente paso.'
      + '</div>';
  }

  return '<div class="card">'
    // Profile status label
    + '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;'
    +   'color:' + lv.labelColor + ';text-transform:uppercase;margin-bottom:16px;">'
    + lv.labelText + '</div>'

    // Main interpretation — 2 lines
    + '<p style="font-size:16px;color:rgba(255,255,255,.85);line-height:1.55;margin:0 0 8px;">'
    + lv.line1 + '</p>'
    + '<p style="font-size:15px;color:#8390b5;line-height:1.55;margin:0;">'
    + lv.line2 + '</p>'

    // Contextual modifier (conditional)
    + modifier

    // Divider
    + '<div style="height:1px;background:rgba(255,255,255,.07);margin:20px 0;"></div>'

    // Main action + horizon
    + '<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.5);'
    +   'text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Proximo paso</div>'
    + '<p style="font-size:15px;color:rgba(255,255,255,.85);margin:0 0 10px;">'
    + lv.accion + '</p>'
    + horizHtml

    // CTA
    + '<button id="btn-diagnosis-start" style="'
    +   'width:100%;padding:18px;background:#5b7cff;color:#fff;border:none;'
    +   'border-radius:16px;font-size:17px;font-weight:800;cursor:pointer;'
    +   'box-shadow:0 4px 20px rgba(91,124,255,.3);line-height:1.3;">'
    + 'Ver que deuda pesa mas'
    + '</button>'
    + '</div>';
}

// =============================================================================
// BRIDGE SCREEN — step 0, no behavioral data from any source
// Shown when czuid was present but CRM returned null AND localStorage is empty.
// Does NOT show financial cards, scores, or any diagnostic data.
// =============================================================================
function renderBridgeScreen() {
  return [
    '<div style="',
      'display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;min-height:60vh;',
      'padding:32px 8px calc(80px + env(safe-area-inset-bottom));text-align:center;',
    '">',

    // Wordmark / brand anchor
    '<div style="',
      'font-size:13px;font-weight:700;letter-spacing:.12em;',
      'color:#5b7cff;text-transform:uppercase;margin-bottom:36px;',
    '">Credizona · Mi Plan</div>',

    // Title
    '<h2 style="',
      'font-size:22px;font-weight:800;color:rgba(255,255,255,.95);',
      'line-height:1.35;margin:0 0 20px;max-width:340px;',
    '">Todavia no pudimos interpretar que esta frenando tu perfil.</h2>',

    // Subtext
    '<p style="',
      'font-size:15px;color:#8390b5;line-height:1.65;',
      'max-width:340px;margin:0 0 40px;',
    '">',
      'El rechazo financiero no siempre depende solo de ingresos o Clearing. ',
      'Mi Plan analiza organizacion financiera, presion mensual y habitos ',
      'para detectar que puede estar afectando tu situacion hoy.',
    '</p>',

    // CTA
    '<button id="btn-bridge-survey" style="',
      'background:#5b7cff;color:#fff;border:none;',
      'border-radius:16px;padding:18px 32px;',
      'font-size:17px;font-weight:800;cursor:pointer;',
      'width:100%;max-width:340px;line-height:1.3;',
      'box-shadow:0 4px 20px rgba(91,124,255,.35);',
    '">Completar diagnostico inicial</button>',

    // Helper text
    '<p style="',
      'font-size:13px;color:#5a6480;margin:14px 0 0;',
    '">Te lleva menos de 2 minutos.</p>',

    '</div>',
  ].join("");
}

function renderAll() {
  var st = _st();
  var main = document.getElementById("main-content");
  if (!main) return;

  updateHeader();

  // Sprint 10 — Mi Plan in-app consent gate.
  // Intercepts ALL render paths until the user has accepted the current legal versions.
  // This fires BEFORE any step routing, ensuring no diagnosis/dashboard content is visible.
  if (typeof shouldShowMiPlanConsent === "function" && shouldShowMiPlanConsent()) {
    main.innerHTML = '<div class="fade">' + renderMiPlanConsentScreen() + '</div>';
    // Fire tracking event only once per consent screen view in this session
    if (!st._consentScreenTracked) {
      st._consentScreenTracked = true;
      var _czuidCS = (window.CZIdentity && window.CZIdentity.czuid) || null;
      trackEvent("miplan_consent_screen_viewed", {
        czuid:                  _czuidCS,
        entry_channel:          (typeof detectEntryChannel === "function") ? detectEntryChannel() : "direct",
        miplan_tc_version:      (typeof LEGAL_VERSION_TC      !== "undefined") ? LEGAL_VERSION_TC      : null,
        miplan_privacy_version: (typeof LEGAL_VERSION_PRIVACY !== "undefined") ? LEGAL_VERSION_PRIVACY : null,
      });
    }
    return;
  }

  var html = "";

  if (st.step === 0 && SEGMENTO === 1) {
    html = renderDiagInicial();
  } else if (st.step === 0) {
    var hasBehavioral = TIENE_ENCUESTA || (st.diag && st.diag.enc);
    if (st.miplan_started) {
      // User already entered the flow — correct state and advance to debt entry
      st.step = 1;
      html = renderDeudas();
    } else if (hasBehavioral) {
      html = renderDiagnosisScreen();
    } else {
      html = renderBridgeScreen();
    }
  } else if (st.step === 1) {
    html = renderDeudas();
  } else if (st.step === 2) {
    html = renderGastos();
  } else if (st.step === 3) {
    html = renderDashboard();
  }

  main.innerHTML = '<div class="fade">' + html + '</div>';

  if (st.step === 2) {
    if (typeof renderCommsOptIn === "function") renderCommsOptIn("main-content");
  }

  if (st.step === 2) {
    // Sprint 9 — fire gastos_missing_warning_shown once, right when warning first appears
    if (st._showGastosWarning && !st._gastosWarningTracked) {
      st._gastosWarningTracked = true;
      trackEvent("gastos_missing_warning_shown", {
        scoreReset:              null,
        nivelR:                  null,
        severity_level:          null,
        gastos_missing_confirmed: false,
      });
    }
  }

  if (st.step === 3) {
    renderTab();

    // Sprint 10 — Dashboard confirmation toast.
    // Shows only on first arrival (st._toastPending set by next()), never on reload/return.
    // sessionStorage key dedupes across rerenders within the same page session.
    if (st._toastPending && !sessionStorage.getItem("cz_toast_dashboard_shown")) {
      st._toastPending = false;
      sessionStorage.setItem("cz_toast_dashboard_shown", "1");
      var _toastDiag = st.diag;
      var _toastIv2  = _toastDiag && _toastDiag.interpretacion_v2 ? _toastDiag.interpretacion_v2 : {};
      var _czuidT    = (window.CZIdentity && window.CZIdentity.czuid) || null;
      if (typeof showToast === "function") {
        showToast("✓ Tu diagnóstico quedó guardado. Podés volver a consultarlo cuando quieras.", 5000);
      }
      trackEvent("dashboard_toast_shown", {
        czuid:         _czuidT,
        scoreReset:    _toastDiag ? _toastDiag.scoreReset : null,
        nivelR:        _toastDiag ? _toastDiag.nivelR : null,
        severity_level: _toastIv2.severity_level || null,
      });
    }

    // Sprint 9 — fire hidden_factor_cta_shown exactly once per diagnosis session
    var _diag3 = st.diag;
    if (!st._hfCtaShown
        && _diag3
        && typeof detectHiddenFactorOpportunity === "function"
        && detectHiddenFactorOpportunity(_diag3)) {
      st._hfCtaShown = true;
      var _iv2CtaShown = _diag3.interpretacion_v2 || {};
      trackEvent("hidden_factor_cta_shown", {
        scoreReset:              _diag3.scoreReset,
        nivelR:                  _diag3.nivelR,
        severity_level:          _iv2CtaShown.severity_level || null,
        gastos_missing_confirmed: !!st.gastos_missing_confirmed,
      });
    }
  }

  updateSticky();
}

window.CredizonaUI = {
  renderAll: renderAll,
  renderTab: renderTab,
  renderDeudaCard: renderDeudaCard,
  actualizarMetrics: actualizarMetrics,
  bindTabEvents: bindTabEvents,
  abrirModalPremium: abrirModalPremium,
  abrirModalInformeCompleto: abrirModalPremium,
  mostrarEvaluacion: mostrarEvaluacion
};

window.renderAll = renderAll;
