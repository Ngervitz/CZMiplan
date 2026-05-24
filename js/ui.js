// =============================================================================
// ui.js — Funciones de renderizado
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js
// =============================================================================

// --- Accesores de estado ---
function _st()    { return window.CZState || {}; }
function _diag()  { return _st().diag; }
function _herr()  { return _st().herr || {}; }

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

  if (step === 0 && SEGMENTO === 1) {
    if (bar) bar.classList.remove("dashboard");
    lbl.textContent  = "Evaluacion inicial";
    stEl.textContent = "Ver mi evaluacion y continuar";
    cta.textContent  = "Ver evaluacion";
    cta.className    = "sticky-btn";
  } else if (step === 0 || step === 1) {
    if (bar) bar.classList.remove("dashboard");
    lbl.textContent  = "Paso " + (SEGMENTO === 1 ? 2 : 1) + " de " + (SEGMENTO === 1 ? 3 : 2);
    stEl.textContent = "Completa tus gastos mensuales";
    cta.textContent  = "Continuar";
    cta.className    = "sticky-btn";
  } else if (step === 2) {
    if (bar) bar.classList.remove("dashboard");
    lbl.textContent  = "Ultimo paso";
    stEl.textContent = "Genera tu diagnostico completo";
    cta.textContent  = "Ver mi plan";
    cta.className    = "sticky-btn";
  } else {
    if (bar) bar.classList.add("dashboard");
    lbl.textContent  = "Que esta frenando tu perfil?";
    stEl.textContent = "Entende mejor tu situacion financiera";
    cta.textContent  = "Ver diagnostico completo";
    cta.className    = "sticky-btn premium";
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
  var labels = SEGMENTO === 1 ? ["Evaluacion", "Gastos", "Deudas"] : ["Gastos", "Deudas"];
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
    + [["1","Gastos","Vemos cuanto margen mensual queda."],["2","Deudas","Identificamos acreedores y montos."],["3","Prioridad","Calculamos que deuda dana mas."],["4","Plan","Te mostramos que hacer primero."]]
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

  var html = renderStepPills(SEGMENTO === 1 ? 1 : 0, SEGMENTO === 1 ? 3 : 2);

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
    + '<div class="section-title">Gastos mensuales</div>'
    + '<div class="section-text">No necesitas montos exactos. Una estimacion ya nos permite detectar patrones financieros importantes.</div>'
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

  if (SEGMENTO === 1) {
    html += '<button class="nav-back" id="btn-back-diag">&#8592; Atras</button>';
  }
  return html;
}

// =============================================================================
// STEP 2 — DEUDAS
// =============================================================================
function renderDeudas() {
  var html = renderStepPills(SEGMENTO === 1 ? 2 : 1, SEGMENTO === 1 ? 3 : 2);
  var deudas = _st().deudas || [];

  html += '<div class="card">'
    + '<div class="section-title">Tus deudas</div>'
    + '<div class="section-text">El acreedor y el tipo de deuda son fundamentales para detectar que deuda te esta danando mas y por donde empezar.</div>'
    + '<div id="deudas-container">' + deudas.map(renderDeudaCard).join("") + '</div>'
    + '<button class="btn btn-secondary" style="height:68px;font-size:20px;margin-bottom:0;" id="btn-agregar-deuda">+ Agregar deuda</button>'
    + '<div class="metrics" id="metrics-live">' + renderMetricsLive() + '</div>'
    + '<div class="result" id="result-live"><h3 id="result-title">Todavia no analizamos tus deudas</h3>'
    + '<p id="result-text">Completa tus deudas para detectar que acreedor esta generando mas presion financiera.</p></div>'
    + '</div>'
    + '<button class="nav-back" id="btn-back-gastos">&#8592; Atras</button>';
  return html;
}

function renderDeudaCard(d, i) {
  var est         = getEstado(d.estado);
  var borderColor = est ? est.color : "rgba(61,220,255,.25)";
  var tasa        = d.tipo ? TASAS[d.tipo] : null;
  var insight     = d.tipo ? getMicroInsight(d.tipo) : null;

  return '<div class="debt-card" id="debt-card-' + i + '" style="border-left:3px solid ' + borderColor + ';">'
    + '<div class="debt-top"><div class="debt-name">Deuda #' + (i + 1) + (d.acreedor ? " — " + d.acreedor : "") + '</div>'
    + '<button class="remove-btn" data-remove-deuda="' + i + '">&#215;</button></div>'
    + '<div class="grid">'
    + '<div class="field"><label>Tipo de deuda</label>'
    + '<select data-deuda-field="tipo" data-deuda-idx="' + i + '">'
    + '<option value="">Selecciona...</option>'
    + DEBT_TYPES.map(function(t) { return '<option value="' + t.v + '"' + (d.tipo === t.v ? " selected" : "") + '>' + t.l + ' (~' + t.tasa + '% TNA)</option>'; }).join("")
    + '</select></div>'
    + '<div class="field"><label>Acreedor</label><input type="text" placeholder="Ej: BROU, OCA..." value="' + (d.acreedor || "") + '" data-deuda-field="acreedor" data-deuda-idx="' + i + '"/></div>'
    + '<div class="field"><label>Monto de la deuda</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="number" style="padding-left:36px;" placeholder="0" value="' + (d.monto || "") + '" data-deuda-field="monto" data-deuda-idx="' + i + '"/></div></div>'
    + '<div class="field"><label>Pago mensual</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="number" style="padding-left:36px;" placeholder="0" value="' + (d.pago || "") + '" data-deuda-field="pago" data-deuda-idx="' + i + '"/></div></div>'
    + '</div>'
    + '<div class="field" style="margin-top:12px;"><label>Estado de la deuda</label>'
    + '<select data-deuda-field="estado" data-deuda-idx="' + i + '">'
    + '<option value="">Selecciona el estado...</option>'
    + ESTADOS_DEUDA.map(function(e) { return '<option value="' + e.v + '"' + (d.estado === e.v ? " selected" : "") + '>' + e.l + '</option>'; }).join("")
    + '</select></div>'
    + (est
        ? '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 14px;border-radius:10px;background:' + est.color + '15;border:1px solid ' + est.color + '30;">'
          + '<div style="width:12px;height:12px;border-radius:50%;background:' + est.color + ';flex-shrink:0;"></div>'
          + '<span style="font-size:14px;font-weight:700;color:' + est.color + ';">' + est.impact + '</span></div>'
        : "")
    + (tasa ? '<div style="font-size:14px;color:#8390b5;margin-top:8px;">Tasa estimada: ~' + tasa + '% TNA · intereses aprox. ' + fmt(Math.round((parseFloat(d.monto) || 0) * tasa / 100 / 12)) + '/mes</div>' : "")
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
  var fin = calcularFinanciero();
  return '<div class="metric"><small>Deuda total</small><strong style="color:#ff4e72;">' + fmt(fin.totalDeuda) + '</strong></div>'
    + '<div class="metric"><small>Pago mensual</small><strong style="color:#ffd36f;">' + fmt(fin.totalPago) + '</strong></div>'
    + '<div class="metric"><small>Costo financiero est.</small><strong style="color:' + colorRiesgo(fin.nivelRiesgo) + ';font-size:18px;">~' + fin.interesProm + '% TEA</strong></div>'
    + '<div class="metric"><small>Nivel de riesgo</small><strong style="color:' + colorRiesgo(fin.nivelRiesgo) + ';">' + fin.nivelRiesgo + '</strong></div>';
}

function actualizarResultLive() {
  var fin   = calcularFinanciero();
  var prio  = deudaPrioritaria();
  var title = document.getElementById("result-title");
  var text  = document.getElementById("result-text");
  if (!title || !text) return;
  if (!prio) {
    title.textContent = "Todavia no analizamos tus deudas";
    text.textContent  = "Completa tus deudas para detectar que acreedor esta generando mas presion financiera.";
    return;
  }
  title.textContent = (prio.acreedor || prio.tipo || "Esta deuda") + " parece ser tu deuda mas sensible";
  if (fin.nivelRiesgo === "Critico") text.textContent = "Detectamos una combinacion de pagos altos y deuda cara. La prioridad es recuperar flujo y evitar seguir acumulando intereses.";
  else if (fin.nivelRiesgo === "Medio") text.textContent = "Tu situacion parece ordenable, pero ya hay presion financiera. La prioridad deberia ser reorganizar y atacar primero la deuda de " + (prio.acreedor || prio.tipo) + ".";
  else text.textContent = "No parece una situacion critica, pero hay oportunidades claras para mejorar tu perfil si priorizas correctamente.";
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
  var bl = diag.bloqueadores;
  if (!bl || bl.length === 0) {
    return '<div class="plan-card" style="border-color:rgba(52,255,175,.2);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
      + '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(52,255,175,.06);border:1px solid rgba(52,255,175,.15);border-radius:12px;">'
      + '<div style="font-size:18px;color:#34ffaf;">✓</div>'
      + '<div style="font-size:15px;color:rgba(255,255,255,.8);line-height:1.5;">Sin factores criticos detectados en los datos declarados. Puede haber condiciones para intentar una solicitud.</div>'
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
  var h = diag.horizonte;
  var col  = (h.banda === "inmediato" || h.banda === "corto") ? "#34ffaf" : h.banda === "medio" ? "#ffd36f" : "#8390b5";
  var bg   = (h.banda === "inmediato" || h.banda === "corto") ? "rgba(52,255,175,.06)"  : h.banda === "medio" ? "rgba(255,211,111,.06)"  : "rgba(255,255,255,.03)";
  var bord = (h.banda === "inmediato" || h.banda === "corto") ? "rgba(52,255,175,.2)"   : h.banda === "medio" ? "rgba(255,211,111,.18)"  : "rgba(255,255,255,.08)";
  return '<div class="plan-card" style="border-color:' + bord + ';background:' + bg + ';">'
    + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
    + '<div style="font-size:26px;font-weight:900;color:' + col + ';line-height:1.25;margin-bottom:10px;">' + h.label + '</div>'
    + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">Basado en los datos declarados, sin nuevas deudas, siguiendo el plan. El historial real del sistema financiero puede incluir otros elementos que modifiquen este calculo.</div>'
    + '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
    + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye Mi Plan Plus.'
    + '</div></div>';
}

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
// TAB: MI PLAN
// =============================================================================
function renderTabPlan() {
  var diag   = _diag();
  var st     = _st();
  var fin    = diag.fin;
  var pc     = diag.plan.color;
  var prio   = diag.prio;
  var prog   = st.saldoIni > 0 ? Math.max(0, (st.saldoIni - fin.totalDeuda) / st.saldoIni * 100) : 0;

  return '<div class="fade">'

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
    + '</div></div>'

    // 2. Bloqueadores activos
    + renderBloqueadores(diag)

    // 3. Horizonte estimado para recalificar
    + renderHorizonteRecalificacion(diag)

    // 4. Accion prioritaria (direccion estrategica)
    + renderAccionPrioritaria(diag)

    // 5. Por donde empezar (deuda especifica — ejecucion tactica)
    + (prio
        ? '<div class="priority-card">'
          + '<div style="font-size:13px;font-weight:800;color:#ffd36f;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Por donde empezar</div>'
          + '<div style="font-size:28px;font-weight:900;margin-bottom:14px;">' + (prio.acreedor || DEBT_TYPES.find(function(t) { return t.v === prio.tipo; })?.l || "Sin nombre") + '</div>'
          + '<div class="grid">'
          + [["Monto", fmt(parseFloat(prio.monto)||0), "#ff4e72"], ["Pago mensual", fmt(parseFloat(prio.pago)||0), "#ffd36f"], ["Costo estimado", "~" + (TASAS[prio.tipo]||62) + "% TEA", "#8390b5"], ["Interes/mes", fmt(Math.round((parseFloat(prio.monto)||0)*(TASAS[prio.tipo]||62)/100/12)), "#ffd36f"]]
            .map(function(x) { return '<div><small style="color:#8390b5;display:block;margin-bottom:6px;">' + x[0] + '</small><strong style="font-size:' + (x[2] === "#8390b5" ? "20" : "32") + 'px;color:' + x[2] + ';">' + x[1] + '</strong></div>'; }).join("")
          + '</div>'
          + (prio.tipo === "informal"
              ? '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,211,111,.06);border:1px solid rgba(255,211,111,.15);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">Este tipo de deuda no siempre figura en el historial financiero formal, pero puede generar presion significativa sobre el flujo mensual y dificultar la estabilidad general.</div>'
              : "")
          + '</div>'
        : "")

    // 6. Herramientas del plan
    + renderHerramientas()

    // 7. Metricas de apoyo
    + '<div class="metrics">'
    + [
        { l: "Plata que te sobra/mes",   v: fmt(fin.flujoLibre),               c: fin.flujoLibre < 0 ? "#ff4e72" : "#34ffaf", s: fin.flujoLibre < 0 ? "deficit" : "disponible" },
        { l: "Total de deudas",           v: fmt(fin.totalDeuda),               c: "#ffd36f",                                   s: (_st().deudas||[]).length + " deuda" + ((_st().deudas||[]).length !== 1 ? "s" : "") },
        { l: "De tu sueldo va a deudas",  v: Math.round(fin.ratio * 100) + "%", c: fin.ratio > 0.5 ? "#ff4e72" : fin.ratio > 0.35 ? "#ffd36f" : "#34ffaf", s: "meta: menos del 30%" },
        { l: "Pagas en cuotas por mes",   v: fmt(fin.totalPago),                c: "rgba(255,255,255,.7)",                      s: "suma de minimos" },
      ].map(function(m) { return '<div class="metric"><small>' + m.l + '</small><strong style="color:' + m.c + ';">' + m.v + '</strong><div style="font-size:14px;color:#8390b5;margin-top:6px;">' + m.s + '</div></div>'; }).join("")
    + '</div>'

    // 8. Analisis financiero detallado (radiografia — bloques 1 a 4)
    + renderRadiografia()

    // 9. Composicion del perfil + progreso (contexto analitico)
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
          + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">El analisis actual esta basado en ingresos, gastos y deudas declaradas. Responder algunas preguntas adicionales puede mejorar la precision del diagnostico.</div>'
          + '<button class="btn btn-secondary" style="height:52px;font-size:15px;" id="btn-refinar-diagnostico">Completar analisis conductual</button>'
          + '</div>'
        : "")
    + '</div>'

    + (st.saldoIni > 0
        ? '<div class="plan-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div><div style="font-size:20px;font-weight:800;">Tu progreso</div><div style="font-size:15px;color:#8390b5;margin-top:4px;">Dia ' + diag.diasRec + ' de recuperacion</div></div>'
          + '<div style="text-align:right;"><div style="font-size:52px;font-weight:900;color:' + (prog > 0 ? "#34ffaf" : "#8390b5") + ';line-height:1;letter-spacing:-2px;">' + Math.round(prog) + '%</div><div style="font-size:14px;color:#8390b5;">reducido</div></div></div>'
          + '<div class="progress-wrap"><div class="progress-bar" style="width:' + prog + '%;background:' + (prog > 50 ? "#34ffaf" : prog > 20 ? "#ffd36f" : "#ff4e72") + ';"></div></div>'
          + '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:15px;color:#8390b5;"><span>Inicio: ' + fmt(st.saldoIni) + '</span><span>Hoy: ' + fmt(fin.totalDeuda) + '</span></div></div>'
        : "")

    // 10. Premium
    + '<div class="premium-card">'
    + '<div class="premium-badge">Recomendado para tu caso</div>'
    + '<div class="premium-title">Mi Plan Plus</div>'
    + '<div class="premium-text">Tu diagnostico usa los datos que declaraste. El informe Clearing muestra lo que el banco ya tiene registrado sobre vos — y la IA te dice que cambiar primero.</div>'
    + '<button class="btn btn-secondary" style="height:68px;font-size:20px;" id="btn-conocer-plus">Ver que incluye para mi caso</button>'
    + '</div></div>';
}

// =============================================================================
// RADIOGRAFIA FINANCIERA
// =============================================================================
function renderRadiografia() {
  var st = _st();
  if (!_diag() || !st.deudas || st.deudas.length === 0) return "";
  var r = calcularRadiografia();
  var DISC = '<div style="font-size:12px;color:#8390b5;margin-top:6px;">* Basado en tasas estimadas de mercado. Tu tasa real puede variar.</div>';

  return '<div style="margin-bottom:20px;">'
    + '<div style="font-size:11px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">Tu radiografia financiera</div>'

    // 1. Interes puro
    + '<div style="background:rgba(255,78,114,.07);border:1px solid rgba(255,78,114,.2);border-radius:18px;padding:20px;margin-bottom:12px;">'
    + '<div style="font-size:13px;font-weight:800;color:#ff4e72;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">💸 Lo que pagas sin reducir deuda</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
    + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Solo intereses por mes</div><div style="font-size:34px;font-weight:900;color:#ff4e72;line-height:1;letter-spacing:-1px;">' + fmt(Math.round(r.interesMensualTotal)) + '</div></div>'
    + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Solo en un ano</div><div style="font-size:34px;font-weight:900;color:#ffd447;line-height:1;letter-spacing:-1px;">' + fmt(Math.round(r.interesMensualTotal * 12)) + '</div></div>'
    + '</div>' + DISC + '</div>'

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

    // 4. % comprometido
    + '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;margin-bottom:12px;">'
    + '<div style="font-size:13px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">📊 De tu sueldo, cuanto ya esta comprometido</div>'
    + '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">'
    + '<div style="font-size:52px;font-weight:900;color:' + (r.pctComprometido > 85 ? "#ff4e72" : r.pctComprometido > 70 ? "#ffd447" : "#34ffaf") + ';line-height:1;letter-spacing:-2px;">' + r.pctComprometido + '%</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.5;">' + (r.pctComprometido > 85 ? "Casi todo tu sueldo ya esta gastado antes de que llegue." : r.pctComprometido > 70 ? "La mayoria de tu sueldo ya tiene destino fijo." : "Tenes un margen razonable para maniobrar.") + '</div>'
    + '</div>'
    + '<div style="height:14px;background:rgba(255,255,255,.08);border-radius:7px;overflow:hidden;margin-bottom:8px;">'
    + '<div style="height:100%;border-radius:7px;width:' + r.pctComprometido + '%;background:' + (r.pctComprometido > 85 ? "#ff4e72" : r.pctComprometido > 70 ? "#ffd447" : "#34ffaf") + ';"></div></div>'
    + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#8390b5;"><span>Comprometido: ' + fmt(Math.round(r.comprometido)) + '</span><span>Libre: ' + fmt(Math.max(0, PRE.ingreso - r.comprometido)) + '</span></div>'
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
    + '<div class="metric"><small>Nivel</small><strong style="color:' + colorNivel(diag.nivelR) + ';font-size:24px;">' + nivelTexto(diag.nivelR) + '</strong></div>'
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
  if (pid === 3) return [Object.keys(herr.vencimientos||{}).length > 0, Object.values(herr.compromisos||{}).some(Boolean), true].filter(Boolean).length;
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
    "Tu sueldo declarado es " + fmt(PRE.ingreso) + ". Suma cualquier otro ingreso que no figure en la solicitud.",
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
      ? '<div style="font-size:17px;color:#8390b5;margin-top:8px;">No cargaste gastos aun.</div>'
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

  var h2 = renderToolCard(2, "Tus compromisos de este mes", "Tres cosas concretas. Sin estas, cualquier plan es solo papel.",
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
  var venc  = herr.vencimientos || {};
  var comp_ = herr.compromisos  || {};
  var diag  = _diag();
  var c1 = Object.keys(venc).length > 0;
  var c2 = Object.values(comp_).some(Boolean);
  var rA = diag.fin.ratio;
  var dif = Math.max(0, (rA - 0.30) * PRE.ingreso);

  var h1 = renderToolCard(1, "Tus vencimientos este mes", "Un solo atraso puede echarte atras meses de progreso.",
    '<div style="margin-top:8px;">'
    + (_st().deudas || []).map(function(d, i) {
        var key = d.acreedor || d.tipo || "d" + (i + 1);
        return '<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
          + '<div style="flex:1;font-size:17px;font-weight:700;">' + (d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1)) + '</div>'
          + '<input type="date" style="width:180px;" value="' + (venc[key] || "") + '" data-venc-key="' + key + '"/></div>';
      }).join("")
    + '</div>', c1);

  var h2 = renderToolCard(2, "Tus compromisos de recuperacion", "Estos tres habitos marcan la diferencia.",
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

  track("view_reset_plus", { plan: diag && diag.planId, score: diag && diag.scoreReset });

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

function renderAll() {
  var st = _st();
  var main = document.getElementById("main-content");
  if (!main) return;

  updateHeader();

  var html = "";

  if (st.step === 0 && SEGMENTO === 1) {
    html = renderDiagInicial();
  } else if (st.step === 0 || st.step === 1) {
    html = renderGastos();
  } else if (st.step === 2) {
    html = renderDeudas();
  } else if (st.step === 3) {
    html = renderDashboard();
  }

  main.innerHTML = '<div class="fade">' + html + '</div>';

  if (st.step === 3) {
    renderTab();
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
