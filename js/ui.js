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

    + renderMiPlanLegalCheckboxes({ idTc: "chk-miplan-tc", idPrivacy: "chk-miplan-privacy" })

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

function renderMiPlanLegalCheckboxes(opts) {
  opts = opts || {};
  var idTc = opts.idTc || "chk-miplan-tc";
  var idPp = opts.idPrivacy || "chk-miplan-privacy";
  return ''
    + '<label style="display:flex;align-items:flex-start;gap:14px;cursor:pointer;margin-bottom:18px;'
    + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:16px 18px;">'
    + '<input type="checkbox" id="' + idTc + '" style="width:22px;height:22px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">'
    + '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.55;">'
    + 'Leí y acepto los '
    + '<a href="/tyc.html" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Términos y Condiciones de Mi Plan</a>'
    + '</span>'
    + '</label>'
    + '<label style="display:flex;align-items:flex-start;gap:14px;cursor:pointer;margin-bottom:24px;'
    + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:16px 18px;">'
    + '<input type="checkbox" id="' + idPp + '" style="width:22px;height:22px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">'
    + '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.55;">'
    + 'Leí y acepto la '
    + '<a href="/privacidad.html" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Política de Privacidad de Mi Plan</a>'
    + '</span>'
    + '</label>';
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
function _ensureHeaderAiBadge() {
  if (document.getElementById("cz-ai-badge")) return;
  var brand = document.querySelector(".header .brand");
  if (!brand) return;
  var badge = document.createElement("div");
  badge.id = "cz-ai-badge";
  badge.className = "cz-ai-badge";
  badge.textContent = "🤖 Diagnóstico financiero con IA";
  brand.insertAdjacentElement("afterend", badge);
}

function updateHeader() {
  var st   = _st();
  var step = st.step || 0;
  var snap = st.snap;
  var day  = document.getElementById("header-day");
  var btnN = document.getElementById("btn-nuevo");
  if (!day || !btnN) return;

  if (step === 3) {
    _ensureHeaderAiBadge();
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
  trackEvent(CZ_EVENT_NAMES.VIEW_INITIAL_DIAGNOSIS, { source: "diag_inicial" });
}

// =============================================================================
// STEP 1 — GASTOS
// =============================================================================
function renderGastoCategoryInsight(catKey, amount) {
  var ingreso = PRE.ingreso || 0;
  var amt     = parseFloat(amount) || 0;
  if (ingreso <= 0 || amt <= 0) return "";

  var pct    = typeof getExpensePercent === "function"
    ? getExpensePercent(amt, ingreso)
    : Math.round((amt / ingreso) * 1000) / 10;
  var bench  = typeof EXPENSE_BENCHMARKS !== "undefined" ? EXPENSE_BENCHMARKS[catKey] : null;
  var status = typeof getExpenseBenchmarkStatus === "function"
    ? getExpenseBenchmarkStatus(pct, bench)
    : "Sin referencia disponible";

  var html = '<div style="margin-top:12px;font-size:14px;color:rgba(255,255,255,.78);line-height:1.5;">'
    + pct.toFixed(1) + "% de tus ingresos</div>";

  if (bench) {
    html += '<div style="margin-top:8px;font-size:12px;color:#8390b5;line-height:1.55;">Referencia orientativa:<br>'
      + bench.min + "% - " + bench.max + "%</div>";
  }

  html += '<div style="margin-top:6px;font-size:12px;color:#8390b5;line-height:1.5;">' + status + "</div>";
  return html;
}

function renderGastosEducacionBlock() {
  var ingreso = PRE.ingreso || 0;
  var total   = typeof getTotalMonthlyExpenses === "function"
    ? getTotalMonthlyExpenses()
    : Object.values(_st().gastos || {}).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0);
  var pctTotal = ingreso > 0 && typeof getExpensePercent === "function"
    ? getExpensePercent(total, ingreso)
    : 0;

  var html = '<div class="plan-card" style="margin-top:20px;border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.03);">'
    + '<div style="font-size:15px;font-weight:800;color:rgba(255,255,255,.88);margin-bottom:14px;">💸 Resumen de gastos</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:4px;">Total gastos</div>'
    + '<div style="font-size:32px;font-weight:900;color:rgba(255,255,255,.92);line-height:1;margin-bottom:14px;">' + fmt(Math.round(total)) + "</div>";

  if (ingreso > 0) {
    html += '<div style="font-size:14px;color:#8390b5;margin-bottom:4px;">Peso sobre ingresos</div>'
      + '<div style="font-size:22px;font-weight:800;color:rgba(255,255,255,.88);margin-bottom:18px;">'
      + pctTotal.toFixed(1) + "% de tus ingresos</div>";
  }

  var items = typeof collectPresentableExpenseItems === "function"
    ? collectPresentableExpenseItems()
    : [];
  var top   = typeof getTopExpenses === "function" ? getTopExpenses(items, 3) : [];

  if (top.length > 0 && ingreso > 0) {
    html += '<div style="font-size:14px;font-weight:800;color:rgba(255,255,255,.85);margin-bottom:10px;">¿Dónde se va tu dinero?</div>';
    html += top.map(function(item, idx) {
      var pct = getExpensePercent(item.amount, ingreso);
      var pctLabel = Math.round(pct);
      var icon = item.icon ? item.icon + " " : "";
      return '<div style="font-size:15px;color:rgba(255,255,255,.82);line-height:1.5;padding:6px 0;word-break:break-word;">'
        + (idx + 1) + ". " + icon + item.label + " — " + pctLabel + "% de tus ingresos</div>";
    }).join("");
    html += '<div style="margin-top:14px;font-size:13px;color:#8390b5;line-height:1.6;">'
      + "Los gastos más grandes suelen tener mayor impacto sobre tu situación financiera que los gastos pequeños."
      + "</div>";
  }

  return html + "</div>";
}

function updateGastosCategoryInsights() {
  var ingreso = PRE.ingreso || 0;
  var gastos  = _st().gastos || {};

  if (typeof EXPENSE_CATS !== "undefined") {
    EXPENSE_CATS.forEach(function(c) {
      var slot = document.querySelector('[data-gasto-insight="' + c.k + '"]');
      if (!slot) return;
      var amt = parseFloat(gastos[c.k]) || 0;
      slot.innerHTML = ingreso > 0 && amt > 0 ? renderGastoCategoryInsight(c.k, amt) : "";
    });
  }

  (_st().custom_expenses || []).forEach(function(exp, idx) {
    var slot = document.querySelector('[data-custom-expense-insight="' + idx + '"]');
    if (!slot) return;
    var amt = parseFloat(exp.amount) || 0;
    if (!isCustomExpenseIncluded(exp, idx)) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = ingreso > 0 && amt > 0 ? renderGastoCategoryInsight("otros", amt) : "";
  });

  var edu = document.getElementById("gastos-educacion-block");
  if (edu) edu.innerHTML = renderGastosEducacionBlock();
}

function updateGastosTotalDisplay() {
  var el = document.getElementById("total-gastos-val");
  if (el) {
    var total = typeof getTotalMonthlyExpenses === "function"
      ? getTotalMonthlyExpenses()
      : Object.values(_st().gastos || {}).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0);
    el.textContent = fmt(total);
    el.style.color = "rgba(255,255,255,.92)";
  }
  updateGastosCategoryInsights();
}

function renderCustomExpenseClassification(idx, exp) {
  var st = _st();
  var excluded = (st._custom_expense_debt_excluded || {})[String(idx)];
  var needsClassify = detectDebtKeywordsInDescription(exp.description)
    && !exp.classification_override
    && !excluded;

  if (excluded) {
    return '<div data-custom-expense-debt-msg="' + idx + '" style="margin-top:10px;background:rgba(255,196,0,.09);border:1px solid rgba(255,196,0,.28);border-radius:14px;padding:16px 18px;">'
      + '<div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.55;margin-bottom:14px;">'
      + 'Este concepto parece corresponder a una deuda financiera. Para que el diagnóstico sea más preciso, ingresalo en la sección Mis deudas.'
      + '</div>'
      + '<button type="button" class="btn btn-secondary" data-ir-mis-deudas style="height:48px;font-size:15px;color:#ffd447;border-color:rgba(255,196,0,.35);">Ir a Mis deudas</button>'
      + '</div>';
  }

  if (!needsClassify) return "";

  return '<div data-custom-expense-classify="' + idx + '" style="margin-top:10px;background:rgba(255,196,0,.09);border:1px solid rgba(255,196,0,.28);border-radius:14px;padding:16px 18px;">'
    + '<div style="font-size:14px;font-weight:800;color:#ffd447;margin-bottom:8px;">Antes de continuar, ayudanos a clasificar este concepto</div>'
    + '<div style="font-size:14px;color:rgba(255,255,255,.8);line-height:1.5;margin-bottom:14px;">¿Esto corresponde a un gasto mensual o a una deuda financiera?</div>'
    + '<label style="display:flex;align-items:center;gap:10px;font-size:15px;color:rgba(255,255,255,.9);margin-bottom:10px;cursor:pointer;">'
    + '<input type="radio" name="custom-expense-classify-' + idx + '" data-classify-expense-gasto data-custom-idx="' + idx + '" style="width:18px;height:18px;"/> Gasto mensual'
    + '</label>'
    + '<label style="display:flex;align-items:center;gap:10px;font-size:15px;color:rgba(255,255,255,.9);cursor:pointer;">'
    + '<input type="radio" name="custom-expense-classify-' + idx + '" data-classify-expense-deuda data-custom-idx="' + idx + '" style="width:18px;height:18px;"/> Deuda o préstamo'
    + '</label>'
    + '</div>';
}

function updateCustomExpenseClassificationUI(idx) {
  var slot = document.querySelector('[data-custom-expense-classify-slot="' + idx + '"]');
  if (!slot) return;
  var exp = (_st().custom_expenses || [])[idx];
  if (!exp) {
    slot.innerHTML = "";
    return;
  }
  slot.innerHTML = renderCustomExpenseClassification(idx, exp);
}

function renderCustomExpenseRow(exp, idx) {
  var desc = exp.description || "";
  var amt  = exp.amount ? String(exp.amount) : "";
  var icon = typeof EXPENSE_CAT_ICONS !== "undefined" ? EXPENSE_CAT_ICONS.otros : "📦";
  return '<div class="custom-expense-row" data-custom-expense-row="' + idx + '" style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
    + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.85);">' + icon + ' Otros gastos</div>'
    + '<button type="button" class="btn btn-secondary" data-custom-expense-remove="' + idx + '" style="height:40px;font-size:14px;padding:0 14px;">Eliminar</button>'
    + '</div>'
    + '<label style="font-size:13px;color:#8390b5;display:block;margin-bottom:6px;">Descripción</label>'
    + '<input type="text" data-custom-expense-field="description" data-custom-idx="' + idx + '" placeholder="Ej: medicamentos, club, etc." value="' + desc.replace(/"/g, "&quot;") + '" style="width:100%;max-width:100%;margin-bottom:12px;box-sizing:border-box;"/>'
    + '<div data-custom-expense-classify-slot="' + idx + '">' + renderCustomExpenseClassification(idx, exp) + '</div>'
    + '<label style="font-size:13px;color:#8390b5;display:block;margin-bottom:6px;">Monto mensual</label>'
    + '<div style="position:relative;max-width:100%;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;pointer-events:none;">$</span>'
    + '<input type="number" data-custom-expense-field="amount" data-custom-idx="' + idx + '" placeholder="0" value="' + amt + '" style="width:100%;max-width:100%;padding-left:36px;box-sizing:border-box;"/>'
    + '</div>'
    + '<div data-custom-expense-insight="' + idx + '">' + renderGastoCategoryInsight("otros", parseFloat(exp.amount) || 0) + '</div>'
    + '</div>';
}

function renderGastos() {
  var gastos = _st().gastos || {};
  var custom = _st().custom_expenses || [];
  var icons  = typeof EXPENSE_CAT_ICONS !== "undefined" ? EXPENSE_CAT_ICONS : {};

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
        var icon   = icons[c.k] ? icons[c.k] + " " : "";
        return '<div class="accordion-item">'
          + '<button class="accordion-trigger' + (isOpen ? " open" : "") + '" data-accordion>'
          + '<div style="flex:1;text-align:left;min-width:0;">'
          + '<div style="word-break:break-word;">' + icon + c.l + (val > 0 ? ' <span style="color:#40d7ff;font-size:17px;">' + fmt(val) + '</span>' : "") + '</div>'
          + (c.h ? '<div style="font-size:12px;color:#8390b5;font-weight:400;line-height:1.4;margin-top:4px;">' + c.h + '</div>' : "")
          + '</div>'
          + '<span class="chevron">&#9660;</span></button>'
          + '<div class="accordion-body' + (isOpen ? " open" : "") + '">'
          + '<div style="position:relative;max-width:100%;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;pointer-events:none;">$</span>'
          + '<input type="number" style="padding-left:36px;width:100%;max-width:100%;box-sizing:border-box;" placeholder="0" value="' + (gastos[c.k] || "") + '" data-gasto="' + c.k + '"/>'
          + '</div>'
          + '<div data-gasto-insight="' + c.k + '">' + renderGastoCategoryInsight(c.k, val) + '</div>'
          + '</div></div>';
      }).join("")
    + '<div id="custom-expenses-block" style="margin-top:8px;">'
    + custom.map(function(exp, idx) { return renderCustomExpenseRow(exp, idx); }).join("")
    + '<button type="button" class="btn btn-secondary" id="btn-agregar-gasto-custom" style="width:100%;height:60px;font-size:17px;margin-top:18px;">Agregar otro gasto</button>'
    + '</div>'
    + '<div id="gastos-educacion-block">' + renderGastosEducacionBlock() + '</div>'
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
  var st     = _st();
  var deudas = st.deudas || [];
  var editing = st.editing_debt_index;
  var btnPrimaryId    = editing != null ? "btn-guardar-deuda-edicion" : "btn-agregar-deuda";
  var btnPrimaryLabel = editing != null ? "Guardar cambios" : "+ Agregar deuda";

  html += '<div class="card">'
    + '<div class="section-title">Tus deudas actuales</div>'
    + '<div class="section-text">Identificamos el acreedor, el monto y el comportamiento de pago para detectar donde esta hoy la mayor presion financiera.</div>'
    + '<div id="deudas-container">' + deudas.map(renderDeudaCard).join("") + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">'
    + '<button class="btn btn-secondary" style="height:68px;font-size:20px;margin-bottom:0;" id="' + btnPrimaryId + '">' + btnPrimaryLabel + '</button>'
    + (editing != null
        ? '<button type="button" class="btn btn-secondary" id="btn-cancelar-edicion-deuda" style="height:52px;font-size:17px;">Cancelar edición</button>'
        : "")
    + '</div>'
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

  // Case A — pagando normalmente (pago capturado en la tarjeta; solo aclaración si quedó en 0)
  if (situacion === "pagando_normal") {
    var showClarif = (!d.pago || parseFloat(d.pago) === 0);
    return '<div style="margin-top:16px;">'
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

function _deudaDisplayName(d, i) {
  return d.acreedor_display || d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || ("Deuda #" + (i + 1));
}

// Sprint 12.4d — título y badge en tarjetas del tab Tus deudas (solo presentación)
function _deudaLiveTitle(d) {
  var name = String(d.acreedor_display || "").trim();
  return name || "Otro acreedor";
}

function _deudaStatusBadgeMeta(d) {
  var sit = d.situacion_ui;
  if (d.cancelada || sit === "cancelada" || sit === "pagada") {
    return {
      label: "Pagada",
      bg:    "rgba(100,116,139,.15)",
      color: "rgba(148,163,184,.9)",
    };
  }
  var labels = {
    pagando_normal:    "Al día",
    atrasado_pagando:  "Pago atrasado",
    mora_30_60:        "En mora",
    mora_60_90:        "En mora",
    mora_reclamo:      "En mora",
    deje_pagar:        "Sin pagos",
  };
  var label = labels[sit] || "Sin pagos";
  if (sit === "pagando_normal") {
    return { label: label, bg: "rgba(96,165,250,.15)", color: "rgba(96,165,250,.9)" };
  }
  return { label: label, bg: "rgba(245,158,11,.15)", color: "rgba(245,158,11,.9)" };
}

function _deudaLiveCardStyle() {
  return "padding:16px;margin-bottom:12px;border:1px solid rgba(255,255,255,.08);"
    + "border-radius:22px;background:rgba(255,255,255,.04);max-width:100%;box-sizing:border-box;";
}

function _isDeudaPagadaUI(d) {
  return typeof isDeudaPagada === "function"
    ? isDeudaPagada(d)
    : !!(d.cancelada || d.situacion_ui === "pagada" || parseFloat(d.monto) === 0);
}

function renderDeudaDeleteConfirm(i) {
  return '<div data-deuda-delete-confirm="' + i + '" style="margin-top:14px;padding:16px 18px;background:rgba(255,78,114,.08);border:1px solid rgba(255,78,114,.25);border-radius:14px;">'
    + '<div style="font-size:15px;color:rgba(255,255,255,.88);line-height:1.55;margin-bottom:14px;">¿Seguro que querés eliminar esta deuda? Esta acción no se puede deshacer.</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
    + '<button type="button" class="btn btn-secondary" data-deuda-delete-volver="' + i + '" style="flex:1;min-width:120px;height:48px;font-size:15px;">Volver</button>'
    + '<button type="button" class="btn" data-deuda-delete-confirmar="' + i + '" style="flex:1;min-width:120px;height:48px;font-size:15px;background:rgba(255,78,114,.2);border:1px solid rgba(255,78,114,.35);color:#ff4e72;">Sí, eliminar</button>'
    + '</div></div>';
}

function renderDeudaActionButtons(i, d) {
  var st = _st();
  if (st._deuda_delete_confirm_index === i) {
    return renderDeudaDeleteConfirm(i);
  }
  if (_isDeudaPagadaUI(d)) return "";

  return '<div class="debt-live-actions">'
    + '<button type="button" class="btn btn-secondary" data-deuda-editar="' + i + '">Editar</button>'
    + '<button type="button" class="btn btn-secondary" data-deuda-eliminar="' + i + '">Eliminar</button>'
    + '<button type="button" class="btn btn-secondary btn-deuda-pagada" data-deuda-pagada="' + i + '">Ya la pagué</button>'
    + '</div>';
}

function renderDeudaCard(d, i) {
  var est         = getEstado(d.estado);  // reflects inferred internal estado
  var borderColor = est ? est.color : "rgba(61,220,255,.25)";
  var insight     = d.tipo ? getMicroInsight(d.tipo) : null;
  var pagada      = _isDeudaPagadaUI(d);
  var st          = _st();
  var editBanner  = "";
  if (st.editing_debt_index === i) {
    if (st._deuda_is_new_add) {
      editBanner = '<div style="margin-bottom:14px;padding:12px 16px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.22);border-radius:12px;font-size:15px;font-weight:700;color:#40d7ff;">Nueva deuda — completá los datos y guardá los cambios</div>';
    } else {
      editBanner = '<div style="margin-bottom:14px;padding:12px 16px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.22);border-radius:12px;font-size:15px;font-weight:700;color:#40d7ff;">Editando deuda: ' + _deudaDisplayName(d, i) + '</div>';
    }
  }
  var validationErr = (st.editing_debt_index === i && st._deuda_validation_error)
    ? '<div id="deuda-validation-msg" class="deuda-validation-msg" role="alert">' + st._deuda_validation_error + '</div>'
    : "";

  var isDraftAdd = !!(d._is_draft_add || (st.editing_debt_index === i && st._deuda_is_new_add));
  var debtNameLabel = isDraftAdd
    ? "Nueva deuda"
    : "Deuda #" + (i + 1) + (d.acreedor ? " — " + d.acreedor : "") + (pagada ? " — Pagada" : "");

  return '<div class="debt-card" id="debt-card-' + i + '" style="border-left:3px solid ' + borderColor + ';opacity:' + (pagada ? "0.7" : "1") + ';">'
    + editBanner
    + validationErr
    + '<div class="debt-top"><div class="debt-name">' + (pagada ? "✅ " : "") + debtNameLabel + '</div></div>'
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
    + '<input type="text" inputmode="decimal" autocomplete="off" style="padding-left:36px;" placeholder="0" value="' + (d.monto || "") + '" data-deuda-field="monto" data-deuda-idx="' + i + '"/></div></div>'

    // Pago mensual — opcional (CSS label → PAGO MENSUAL (SI LO SABÉS))
    + '<div class="field"><label>Pago mensual (si lo sabés)</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="text" inputmode="decimal" autocomplete="off" style="padding-left:36px;" placeholder="0" value="'
    + (d.pago != null && d.pago !== "" ? d.pago : "")
    + '" data-deuda-field="pago" data-deuda-idx="' + i + '"/></div></div>'

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
    + (st.editing_debt_index === i ? "" : renderDeudaActionButtons(i, d))
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
// DASHBOARD — Sprint 12.4a/12.4b (iconografía, jerarquía, acentos; solo presentación)
// =============================================================================
var CZ_DASH_ACCENTS = {
  confianza:   { border: "rgba(91,124,255,.52)",  title: "#aec8ff", iconBg: "rgba(91,124,255,.14)" },
  dti:         { border: "rgba(167,139,250,.52)", title: "#c9baff", iconBg: "rgba(167,139,250,.14)" },
  accion:      { border: "rgba(210,180,110,.5)",  title: "#e8d8b0", iconBg: "rgba(210,180,110,.12)" },
  miplan:      { border: "rgba(100,190,150,.48)", title: "#aee8cc", iconBg: "rgba(100,190,150,.12)" },
  sugerencias: { border: "rgba(131,144,181,.42)", title: "#b4bfd4", iconBg: "rgba(131,144,181,.1)" },
  radiografia: { border: "rgba(64,215,255,.48)",  title: "#9ee4f4", iconBg: "rgba(64,215,255,.12)" },
  deudas:      { border: "rgba(108,138,168,.52)", title: "#a8c0d8", iconBg: "rgba(108,138,168,.14)" },
};

function _dashAccent(key) {
  return CZ_DASH_ACCENTS[key] || CZ_DASH_ACCENTS.sugerencias;
}

function _dashSectionAccentCss(key) {
  var a = _dashAccent(key);
  return "border-left:3px solid " + a.border + ";padding-left:14px;max-width:100%;box-sizing:border-box;";
}

function _dashCardTitle(icon, label, accentKey) {
  var a = _dashAccent(accentKey);
  return '<div style="font-size:14px;font-weight:900;color:' + a.title + ";"
    + 'letter-spacing:.03em;margin-bottom:12px;line-height:1.35;max-width:100%;">'
    + '<span style="display:inline-flex;align-items:flex-start;gap:0.4em;flex-wrap:wrap;max-width:100%;">'
    + '<span style="flex-shrink:0;line-height:1.2;display:inline-flex;align-items:center;'
    + "background:" + a.iconBg + ';border-radius:8px;padding:2px 6px;" aria-hidden="true">' + icon + "</span>"
    + '<span style="min-width:0;word-break:break-word;">' + label + "</span>"
    + "</span></div>";
}

function _dashTechIndicator(text) {
  return '<div style="font-size:11px;font-weight:500;color:rgba(131,144,181,.75);line-height:1.5;">'
    + text + "</div>";
}

// Sprint 12.4b — arquitectura de información; 12.4c — iconos de identidad por bloque
var CZ_DASH_IA_SECTION_GAP =
  "margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);";

var CZ_DASH_IA_ICONS = {
  situacion: "🎯",
  frenando:  "⚠️",
  accion:    "📍",
  numeros:   "📊",
  deudas:    "💳",
};

var CZ_DASH_IA_LABEL_STYLE =
  "font-size:11px;font-weight:700;letter-spacing:.08em;color:rgba(255,255,255,.35);"
  + "text-transform:uppercase;margin-bottom:12px;max-width:100%;line-height:1.4;";

function _dashIaIcon(key) {
  return CZ_DASH_IA_ICONS[key] || "";
}

function _dashIaLabel(text, sectionKey) {
  return '<span style="font-size:24px;line-height:1;display:block;margin-bottom:8px;opacity:.95;max-width:100%;" aria-hidden="true">'
    + _dashIaIcon(sectionKey) + "</span>"
    + '<div style="' + CZ_DASH_IA_LABEL_STYLE + '">' + text + "</div>";
}

function _dashIaSectionOpen(isFirst, sectionKey) {
  return '<div style="max-width:100%;box-sizing:border-box;' + (isFirst ? "" : CZ_DASH_IA_SECTION_GAP) + '">';
}

function _dashIaSectionClose() {
  return "</div>";
}

// Sprint 12.5 — volver a gastos desde dashboard (solo UX; recálculo vía next() existente)
function renderDashboardEditGastosCta() {
  return '<div style="margin-bottom:20px;max-width:100%;">'
    + '<p style="font-size:13px;color:#8390b5;line-height:1.55;margin-bottom:12px;">'
    + "Podés actualizar tus gastos y recalcular el diagnóstico cuando quieras."
    + "</p>"
    + '<button type="button" class="btn btn-secondary" id="btn-editar-gastos-dashboard" '
    + 'style="width:100%;max-width:100%;height:52px;font-size:16px;box-sizing:border-box;">'
    + "✏️ Editar gastos</button>"
    + "</div>";
}

// Sprint 13.2 — resumen alineado con motor (deudasActivasParaCalculo)
function _isDeudaPagadaParaConteo(d) {
  return typeof isDeudaPagada === "function"
    ? isDeudaPagada(d)
    : _isDeudaPagadaUI(d);
}

function _deudasResumenStats(deudas) {
  deudas = deudas || [];
  var activas = typeof deudasActivasParaCalculo === "function"
    ? deudasActivasParaCalculo(deudas)
    : deudas.filter(function(d) { return !_isDeudaPagadaParaConteo(d); });
  var activaCount = activas.length;
  var pagadaCount = 0;
  for (var i = 0; i < deudas.length; i++) {
    if (_isDeudaPagadaParaConteo(deudas[i])) pagadaCount++;
  }
  var totalActiva = activas.reduce(function(s, d) {
    return s + (parseFloat(d.monto) || 0);
  }, 0);
  var pagosMensuales = activas.reduce(function(s, d) {
    return s + (parseFloat(d.pago) || 0);
  }, 0);
  return {
    activaCount:    activaCount,
    pagadaCount:    pagadaCount,
    totalActiva:    totalActiva,
    pagosMensuales: pagosMensuales,
  };
}

function _deudasSubtitleCounter(activaCount, pagadaCount) {
  var actTxt = activaCount === 1 ? "1 activa" : activaCount + " activas";
  var pagTxt = pagadaCount === 1 ? "1 pagada" : pagadaCount + " pagadas";
  return '<div class="deudas-resumen-counter">' + actTxt + " · " + pagTxt + "</div>";
}

function _deudasActivasConIndice(deudas) {
  deudas = deudas || [];
  var activas = typeof deudasActivasParaCalculo === "function"
    ? deudasActivasParaCalculo(deudas)
    : [];
  var activasSet = {};
  for (var a = 0; a < activas.length; a++) activasSet[activas[a]] = true;
  var out = [];
  for (var i = 0; i < deudas.length; i++) {
    if (activasSet[deudas[i]]) out.push({ d: deudas[i], i: i });
  }
  return out;
}

function _deudasPagadasConIndice(deudas) {
  deudas = deudas || [];
  var out = [];
  for (var i = 0; i < deudas.length; i++) {
    if (_isDeudaPagadaParaConteo(deudas[i])) out.push({ d: deudas[i], i: i });
  }
  return out;
}

function renderDeudasResumen(deudas) {
  var stats = _deudasResumenStats(deudas);
  var a     = _dashAccent("deudas");

  return '<div class="plan-card" style="border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.03);'
    + _dashSectionAccentCss("deudas") + 'margin-bottom:20px;">'
    + '<div style="display:flex;flex-direction:column;gap:14px;max-width:100%;">'
    + '<div><div style="font-size:13px;color:#8390b5;margin-bottom:6px;">Total deuda activa</div>'
    + '<div style="font-size:28px;font-weight:900;color:rgba(255,255,255,.92);line-height:1;letter-spacing:-.5px;word-break:break-word;">'
    + fmt(Math.round(stats.totalActiva)) + "</div></div>"
    + '<div><div style="font-size:13px;color:#8390b5;margin-bottom:6px;">Pagos mensuales</div>'
    + '<div style="font-size:22px;font-weight:800;color:' + a.title + ';line-height:1.3;word-break:break-word;">'
    + fmt(Math.round(stats.pagosMensuales)) + "</div></div>"
    + "</div></div>";
}

function renderDashboard() {
  var st  = _st();
  var tab = st.tab || "plan";
  if (tab === "ia") tab = "plan";

  var TABS = [
    { id: "plan",   l: "Mi Plan",      icon: "📋" },
    { id: "deudas", l: "Tus deudas",   icon: "💳" },
    { id: "plus",   l: "Mi Plan Plus", icon: "★" },
  ];

  return '<div class="tabs">'
    + TABS.map(function(t) {
        return '<button class="tab-btn tab-nav-item' + (tab === t.id ? " active" : "") + '" data-tab="' + t.id + '">'
          + t.icon + " " + t.l + '</button>';
      }).join("")
    + '</div><div id="tab-content"></div>';
}

function renderTab() {
  var el  = document.getElementById("tab-content");
  var tab = (_st().tab || "plan");
  if (tab === "ia") {
    tab = "plan";
    _st().tab = "plan";
  }
  if (_accionesRecomTab !== tab) {
    _accionesRecomExpand = false;
    _accionesRecomTab = tab;
  }
  if (_deudasHistorialTab !== tab) {
    _deudasHistorialExpand = false;
    _deudasHistorialTab = tab;
  }
  if (!el) return;
  if (tab === "plan")   el.innerHTML = renderTabPlan();
  if (tab === "deudas") el.innerHTML = renderTabDeudas();
  if (tab === "plus")   el.innerHTML = renderTabPlus();
  bindTabEvents();
  var qIdx = _st()._deuda_quick_edit_index;
  if (qIdx != null) focusDeudaQuickEditInput(qIdx);
}

// =============================================================================
// SPRINT 2 — HELPERS DE RECUPERACION
// =============================================================================

function _finFromDiag(diag) {
  var fin = (diag && diag.fin) ? diag.fin : {};
  if (fin.dti_ratio == null && typeof calcularFinanciero === "function") {
    fin = calcularFinanciero();
  }
  return fin;
}

function _dtiRatioDisplay(ratio) {
  if (ratio == null || isNaN(ratio)) return "—";
  return Number(ratio).toFixed(1) + "x";
}

function buildDebtIncomeNarrative(dtiRatio) {
  var r = parseFloat(dtiRatio) || 0;
  if (r < 0.5) {
    return {
      primary:   "Tu deuda equivale a menos de medio mes de ingresos.",
      secondary: "Esto suele dejar margen para ahorrar o enfrentar imprevistos.",
    };
  }
  if (r < 1) {
    return {
      primary:   "Tu deuda equivale aproximadamente a un mes de ingresos.",
      secondary: "Es una situación generalmente manejable si mantenés estabilidad en tus ingresos.",
    };
  }
  if (r < 3) {
    return {
      primary:   "Tu deuda equivale a varios meses de ingresos.",
      secondary: "En este nivel, cada nueva deuda reduce el margen financiero disponible.",
    };
  }
  if (r < 12) {
    return {
      primary:   "Tu deuda representa un compromiso importante respecto a tu nivel actual de ingresos.",
      secondary: "Una parte significativa de tu capacidad financiera puede estar comprometida por deuda acumulada.",
    };
  }
  return {
    primary:   "Tu deuda acumulada supera ampliamente tu capacidad mensual de generación de ingresos.",
    secondary: "En estos casos suele ser útil revisar alternativas como refinanciaciones, acuerdos de pago o reestructuración de deuda.",
  };
}

function _dtiLevelLabel(level) {
  var labels = {
    normal:    "Normal",
    moderado:  "Moderada",
    elevado:   "Elevada",
    alto:      "Alta",
    critico:   "Crítica",
  };
  return labels[level] || level || "—";
}

var CZ_DTI_ACCION_PRIORITARIA =
  "Confirmar el saldo actualizado y definir si esta deuda debe estabilizarse, refinanciarse o atacarse primero.";

function renderRelacionDeudaIngreso(diag) {
  var fin      = _finFromDiag(diag);
  var deudas   = (_st().deudas || []);
  var totalDeuda = fin.totalDeuda != null ? fin.totalDeuda : 0;
  var dtiRatio   = fin.dti_ratio;

  var isZeroDebt = deudas.length === 0
    || totalDeuda <= 0
    || (dtiRatio != null && dtiRatio <= 0);

  var cardOpen = '<div class="plan-card" style="border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.03);'
    + _dashSectionAccentCss("dti") + '">'
    + _dashCardTitle("⚖️", "Relación deuda / ingreso", "dti");

  if (isZeroDebt) {
    return cardOpen
      + '<div style="font-size:17px;font-weight:700;color:rgba(255,255,255,.9);line-height:1.45;margin-bottom:10px;">Sin deuda declarada</div>'
      + '<div style="font-size:15px;color:#8390b5;line-height:1.65;">No registramos deuda activa en la información que ingresaste.</div>'
      + '</div>';
  }

  if (dtiRatio == null) return "";

  var narr = buildDebtIncomeNarrative(dtiRatio);
  return cardOpen
    + '<div style="font-size:17px;font-weight:700;color:rgba(255,255,255,.9);line-height:1.45;margin-bottom:10px;">' + narr.primary + '</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.65;margin-bottom:14px;">' + narr.secondary + '</div>'
    + _dashTechIndicator("Indicador técnico: " + _dtiRatioDisplay(dtiRatio))
    + '</div>';
}

function renderFinancialRealityWarning(diag) {
  if (!diag || !diag.financial_reality_warning) return "";

  var msg = "";
  if (diag.financial_reality_warning_type === "high_payment_pressure") {
    msg = "⚠️ Tus pagos de deuda consumen casi todo tu ingreso mensual. Tu margen para afrontar imprevistos es muy reducido.";
  } else if (diag.financial_reality_warning_type === "payments_exceed_income") {
    msg = "🚨 Los pagos de deuda que registraste superan tu ingreso mensual. Con estos datos, tu situación financiera no parece sostenible en el tiempo.";
  }
  if (!msg) return "";

  var isCritical = diag.financial_reality_warning_type === "payments_exceed_income";
  return '<div class="financial-reality-warning" role="alert" style="'
    + (isCritical
        ? "background:rgba(255,78,114,.08);border:1px solid rgba(255,78,114,.28);"
        : "background:rgba(255,196,0,.08);border:1px solid rgba(255,196,0,.25);")
    + 'border-radius:14px;padding:14px 18px;margin-bottom:16px;font-size:14px;line-height:1.6;color:'
    + (isCritical ? "#ff8fa8" : "#ffd447")
    + ';">' + msg + "</div>";
}

function renderPlan4SinDeudaActivaExplicacion(diag) {
  if (!diag || diag.planId !== 4) return "";

  var deudas = _st().deudas || [];
  var activeDebtCount = typeof deudasActivasParaCalculo === "function"
    ? deudasActivasParaCalculo(deudas).length
    : 0;

  if (activeDebtCount > 0) return "";

  var fin = _finFromDiag(diag);
  var flujoLibreActual = fin.flujoLibre != null ? fin.flujoLibre : 0;
  if (flujoLibreActual >= 0) return "";

  return '<div style="margin-bottom:16px;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;">'
    + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.88);line-height:1.45;margin-bottom:10px;">'
    + "&#9888;&#65039; El problema ya no es la deuda</div>"
    + '<div style="font-size:14px;color:#8390b5;line-height:1.65;">'
    + "No registramos deuda activa en la información actual.<br><br>"
    + "Sin embargo, tus gastos mensuales siguen superando tus ingresos, lo que mantiene tu situación en una zona de inestabilidad financiera.<br><br>"
    + "Por eso el diagnóstico continúa priorizando la estabilización."
    + "</div></div>";
}

function renderDtiStockBlockerCard() {
  return '<div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:rgba(255,211,111,.07);border:1px solid rgba(255,211,111,.2);border-radius:12px;">'
    + '<div style="width:8px;height:8px;border-radius:50%;background:#ffd36f;flex-shrink:0;margin-top:6px;"></div>'
    + '<div>'
    + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.9);line-height:1.4;">Deuda acumulada relevante</div>'
    + '<div style="font-size:13px;color:#8390b5;margin-top:6px;line-height:1.55;">El total de deuda declarado supera un ingreso mensual completo. Aunque el pago mensual informado sea bajo o cero, este nivel de deuda puede seguir influyendo en una evaluación crediticia.</div>'
    + '</div></div>';
}

function renderConfianzaDiagnostico(diag) {
  var fin  = (diag && diag.fin) ? diag.fin : {};
  var iv2  = (diag && diag.interpretacion_v2) || {};
  var conf = fin.confianza_diagnostico;
  if (conf == null) return "";

  var nivelLabel;
  var explicacion;
  if (conf >= 90) {
    nivelLabel  = "Alta";
    explicacion = "La información disponible permite construir una interpretación consistente de tu situación.";
  } else if (conf >= 70) {
    nivelLabel  = "Media";
    explicacion = "Hay suficiente información para orientarte, aunque algunos datos podrían mejorar la precisión.";
  } else {
    nivelLabel  = "Reducida";
    explicacion = "Faltan datos o existen señales que limitan la precisión de este diagnóstico.";
  }

  var missingPayMsg = (diag.missing_payment_information || iv2.missing_payment_information)
    ? '<div style="margin-top:12px;padding:12px 14px;background:rgba(255,196,0,.06);border:1px solid rgba(255,196,0,.2);border-radius:10px;font-size:14px;color:#ffd447;line-height:1.6;">'
      + "Registraste deuda activa pero no informaste pagos mensuales. Algunas estimaciones pueden ser menos precisas hasta completar esa información."
      + "</div>"
    : "";

  return '<div class="plan-card" style="border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.03);'
    + _dashSectionAccentCss("confianza") + '">'
    + _dashCardTitle("🎯", "Confianza del diagnóstico", "confianza")
    + '<div style="font-size:20px;font-weight:800;color:rgba(255,255,255,.92);margin-bottom:10px;">' + nivelLabel + '</div>'
    + '<div style="font-size:15px;color:#8390b5;line-height:1.65;">' + explicacion + '</div>'
    + missingPayMsg
    + '</div>';
}

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

  var finBl = _finFromDiag(diag);
  var hasElevatedDti = (finBl.dti_ratio || 0) >= 1;

  if (!bl || bl.length === 0) {
    if (hasElevatedDti) {
      return '<div class="plan-card" style="border-color:rgba(255,211,111,.22);">'
        + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
        + renderDtiStockBlockerCard()
        + '</div>';
    }
    return '<div class="plan-card" style="border-color:rgba(255,255,255,.1);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
      + '<div style="padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;">'
      + '<div style="font-size:15px;color:rgba(255,255,255,.8);line-height:1.55;">Con la información declarada, no se detectan factores críticos adicionales en este diagnóstico. Eso no explica por sí solo una solicitud rechazada ni garantiza que una nueva evaluación sea viable.</div>'
      + '</div></div>';
  }
  return '<div class="plan-card">'
    + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
    + bl.map(function(b) {
        if (b.tipo === "stock_deuda_alto") {
          return renderDtiStockBlockerCard();
        }
        var isAlto = b.impacto === "alto";
        var bc   = isAlto ? "rgba(255,78,114,.09)"  : "rgba(255,211,111,.07)";
        var bord = isAlto ? "rgba(255,78,114,.22)"  : "rgba(255,211,111,.18)";
        var col  = isAlto ? "#ff4e72"               : "#ffd36f";
        return '<div style="display:flex;align-items:flex-start;gap:12px;padding:13px 16px;background:' + bc + ';border:1px solid ' + bord + ';border-radius:12px;margin-bottom:8px;">'
          + '<div style="width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0;margin-top:6px;"></div>'
          + '<div>'
          + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.9);line-height:1.4;">' + b.etiqueta + '</div>'
          + '<div style="font-size:13px;color:#8390b5;margin-top:3px;">' + (b.tipo === "informal"
              ? 'Puede generar presión financiera aunque no aparezca directamente en Clearing o BCU.'
              : isAlto
              ? 'Este factor puede influir en cómo se interpreta tu situación en una evaluación crediticia.'
              : 'Este factor puede sumar presión al interpretar tu situación financiera declarada.') + '</div>'
          + '</div></div>';
      }).join("")
    + '</div>';
}

function _retryHorizonAddonHtml(diag, st) {
  diag = diag || {};
  st = st || (typeof window !== "undefined" ? window.CZState : null) || _st();
  var h = diag.horizonte || {};
  var isPositiveHorizon = h.banda === "inmediato" || h.banda === "corto";
  if (!isPositiveHorizon || getRetryCtaState(diag, st) !== "unlocked") return "";
  return renderRetryCtaHorizonAddon(diag, st);
}

function renderHorizonteRecalificacion(diag, st) {
  st = st || (typeof window !== "undefined" ? window.CZState : null) || _st();
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
      + '</div>'
      + _retryHorizonAddonHtml(diag, st)
      + '</div>';
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
      + '</div>'
      + _retryHorizonAddonHtml(diag, st)
      + '</div>';
  }

  // ── 3. NORMAL HORIZON ─────────────────────────────────────────────────────
  var finHorizon = _finFromDiag(diag);

  // Sprint 12.1.b — rejection-aware horizon when debt stock exceeds income
  if ((finHorizon.dti_ratio || 0) >= 1) {
    return '<div class="plan-card" style="border-color:rgba(255,211,111,.22);background:rgba(255,211,111,.05);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:24px;font-weight:900;color:#ffd36f;line-height:1.3;margin-bottom:12px;">Tu deuda acumulada ya puede estar pesando en la evaluación</div>'
      + '<div style="font-size:13px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:10px;">El total de deuda que declaraste supera tu ingreso mensual. Aunque no tengas pagos activos registrados, este nivel de deuda puede influir en una futura evaluación.</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Como este diagnóstico parte de una solicitud rechazada, conviene revisar si esta deuda tiene pagos, refinanciaciones o información adicional que todavía no fue incorporada.</div>'
      + '<div style="font-size:12px;color:#8390b5;line-height:1.55;margin-bottom:14px;">⚠️ Esta proyección se basa exclusivamente en la información que declaraste.</div>'
      + '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
      + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye <button id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#a0b0ff;font-size:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
      + '</div>'
      + _retryHorizonAddonHtml(diag, st)
      + '</div>';
  }

  var horizonLabel = h.label;
  var isPositiveHorizon = h.banda === "inmediato" || h.banda === "corto";
  var isLowConfidencePositiveHorizon =
    iv2.confidence_level === "low"
    && isPositiveHorizon;

  if (isLowConfidencePositiveHorizon) {
    return '<div class="plan-card" style="border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:22px;font-weight:900;color:#8390b5;line-height:1.3;margin-bottom:10px;">Necesitamos completar tu diagnóstico</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Hay señales positivas en la información que registraste, pero todavía faltan datos para estimar con confianza si estás en condiciones de presentar una nueva solicitud.</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Completá la información pendiente para obtener una evaluación más precisa.</div>'
      + '<div style="font-size:12px;color:#8390b5;line-height:1.55;margin-bottom:14px;">⚠️ Esta proyección se basa exclusivamente en la información que declaraste.</div>'
      + '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
      + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye <button id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#a0b0ff;font-size:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
      + '</div>'
      + '</div>';
  }

  var col  = isPositiveHorizon ? "#34ffaf" : h.banda === "medio" ? "#ffd36f" : "#8390b5";
  var bg   = isPositiveHorizon ? "rgba(52,255,175,.06)"  : h.banda === "medio" ? "rgba(255,211,111,.06)"  : "rgba(255,255,255,.03)";
  var bord = isPositiveHorizon ? "rgba(52,255,175,.2)"   : h.banda === "medio" ? "rgba(255,211,111,.18)"  : "rgba(255,255,255,.08)";
  return '<div class="plan-card" style="border-color:' + bord + ';background:' + bg + ';">'
    + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
    + '<div style="font-size:26px;font-weight:900;color:' + col + ';line-height:1.25;margin-bottom:10px;">' + horizonLabel + '</div>'
    + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Basado en la información declarada, sin nuevas deudas y siguiendo el plan. El historial del sistema financiero puede incluir elementos que esta simulación no alcanza a ver.</div>'
    + '<div style="font-size:12px;color:#8390b5;line-height:1.55;margin-bottom:14px;">⚠️ Esta proyección se basa exclusivamente en la información que declaraste.</div>'
    + '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
    + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye <button id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#a0b0ff;font-size:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
    + '</div>'
    + _retryHorizonAddonHtml(diag, st)
    + '</div>';
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
  var finNar     = _finFromDiag(diag);
  var textoPaso  = ((finNar.dti_ratio || 0) >= 1)
    ? CZ_DTI_ACCION_PRIORITARIA
    : (nPaso ? nPaso.texto : null);

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
    + block("Primer paso recomendado",   textoPaso)
    + confidenceNote
    + '</div>';
}

// =============================================================================
// TAB: MI PLAN — "Tu situación hoy" (interpretive snapshot)
// =============================================================================
function _ensureFirstAssessmentAt(st) {
  if (st.first_assessment_at) return st.first_assessment_at;
  var fallback = null;
  if (st.temporal && st.temporal.first_seen_at) {
    fallback = st.temporal.first_seen_at;
  } else if (window.CZIdentity && window.CZIdentity.created_at) {
    fallback = window.CZIdentity.created_at;
  } else if (st.snap && st.snap.fecha_inicio) {
    fallback = st.snap.fecha_inicio;
  }
  st.first_assessment_at = fallback || new Date().toISOString();
  if (typeof window.guardarLocal === "function") {
    window.guardarLocal();
  }
  return st.first_assessment_at;
}

function _diasDesdePrimeraEvaluacion(iso) {
  var t = Date.parse(iso);
  if (!iso || isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000) + 1;
}

function _lineaDiaEvaluacion(st) {
  var iso  = _ensureFirstAssessmentAt(st);
  var dias = _diasDesdePrimeraEvaluacion(iso);
  if (dias == null || dias < 1) {
    return "Primera evaluación registrada hoy.";
  }
  return "Día " + dias + " desde tu primera evaluación.";
}

function _renderTuSituacionHoy(diag, st) {
  var fin         = (diag && diag.fin) ? diag.fin : {};
  var flujoLibre  = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var ratioPagos  = fin.ratio != null ? fin.ratio : 0;
  var planId      = diag ? diag.planId : null;
  var debtStats   = _deudasResumenStats(st.deudas || []);
  var activaCount = debtStats.activaCount;
  var totalActiva = debtStats.totalActiva;

  var primaryType;
  var primaryText;
  var consequenceText;

  if (flujoLibre < 0) {
    primaryType = "negative_flow";
    primaryText = "Tu principal desafío es que tus gastos superan lo que entra cada mes.";
    consequenceText = "Mientras esa diferencia siga siendo negativa, va a ser difícil mejorar tu perfil ante cualquier institución financiera.";
  } else if (ratioPagos > 0.35) {
    primaryType = "high_dti";
    primaryText = "Tu principal desafío es que gran parte de tu ingreso ya está comprometido con pagos.";
    consequenceText = "Cuando muchos ingresos ya están comprometidos, las financieras ven menos margen para asumir una nueva cuota.";
  } else if (planId === 4) {
    primaryType = "plan4_hidden";
    if (totalActiva <= 0) {
      primaryText = "Tu principal desafío puede estar en tu historial crediticio, no en las deudas que declaraste.";
      consequenceText = "Aunque hoy no tengas pagos activos declarados, una institución puede ver antecedentes que todavía afectan tu perfil.";
    } else {
      primaryText = "Tu principal desafío puede estar en factores que no se ven solo mirando los números declarados.";
      consequenceText = "Puede haber información en tu historial crediticio que esté pesando más que los datos que declaraste.";
    }
  } else {
    primaryType = "manageable";
    primaryText = "Tu situación tiene margen para mejorar con algunos cambios concretos.";
    consequenceText = "Con algunos ajustes, tu perfil puede quedar más ordenado para volver a intentar más adelante.";
  }

  var secondary = [];
  if (ratioPagos > 0.35 && primaryType !== "high_dti") {
    secondary.push("Gran parte de tu ingreso ya está comprometido.");
  }
  if (activaCount > 3) {
    secondary.push("Tenés varias obligaciones activas al mismo tiempo.");
  }
  if (planId === 4 && totalActiva <= 0 && primaryType !== "plan4_hidden") {
    secondary.push("Puede haber información en BCU, Clearing u otros registros que no estás viendo.");
  }
  secondary = secondary.slice(0, 2);

  var secondaryHtml = "";
  if (secondary.length > 0) {
    secondaryHtml = '<div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);">'
      + '<div style="font-size:14px;color:#8390b5;font-weight:700;margin-bottom:10px;">También influye:</div>'
      + secondary.map(function(s) {
          return '<div style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.55;margin-bottom:8px;padding-left:14px;position:relative;">'
            + '<span style="position:absolute;left:0;">•</span>' + s + "</div>";
        }).join("")
      + "</div>";
  }

  return '<div class="plan-card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);">'
    + '<div style="font-size:20px;font-weight:800;margin-bottom:14px;line-height:1.3;">📌 Tu situación hoy</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:16px;line-height:1.5;">' + _lineaDiaEvaluacion(st) + "</div>"
    + '<p style="font-size:16px;color:rgba(255,255,255,.92);line-height:1.65;margin:0 0 12px;">' + primaryText + "</p>"
    + '<p style="font-size:15px;color:rgba(255,255,255,.75);line-height:1.65;margin:0;">' + consequenceText + "</p>"
    + secondaryHtml
    + "</div>";
}

// =============================================================================
// RETRY APPLICATION CTA — Mi Plan dashboard (locked / unlocked / hidden)
// Not preapproval. snap is used for contextual copy only, not eligibility.
// =============================================================================
function getRetryCtaState(diag, st) {
  diag = diag || {};
  st = st || {};
  var diagPlan = parseInt(diag.planId, 10);

  if (!st.snap && (isNaN(diagPlan) || diagPlan > 2)) return "hidden";

  var fin = diag.fin || {};
  var iv2 = diag.interpretacion_v2 || {};
  var h = diag.horizonte || {};
  var flujo = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var ratio = fin.ratio != null ? fin.ratio : 0;
  var isPositiveHorizon = h.banda === "inmediato" || h.banda === "corto";

  var unlocked = !isNaN(diagPlan)
    && diagPlan <= 2
    && flujo > 0
    && iv2.confidence_level !== "low"
    && diag.financial_reality_warning !== true
    && diag.missing_payment_information !== true
    && ratio <= 0.35
    && isPositiveHorizon;

  return unlocked ? "unlocked" : "locked";
}

function _retryCtaUnlockedCopy(diag, st) {
  st = st || {};
  if (st.snap) {
    var snapPlan = parseInt(st.snap.plan_id, 10);
    var diagPlan = parseInt(diag.planId, 10);
    if (!isNaN(snapPlan) && !isNaN(diagPlan) && snapPlan > diagPlan) {
      return "Tu situación mejoró desde tu evaluación inicial.";
    }
  }
  return "Con los datos actuales, tu perfil parece estar en condiciones de revisar una nueva solicitud.";
}

function _trackRetryCtaShown(state, diag, st) {
  if (state === "hidden") return;
  st = st || _st();
  if (st._retryCtaLastTrackedState === state) return;
  st._retryCtaLastTrackedState = state;
  if (typeof trackEvent === "function") {
    trackEvent(CZ_EVENT_NAMES.RETRY_CTA_SHOWN, { state: state });
  }
  if (typeof trackCRMEvent === "function") {
    var snapPlan = st.snap ? parseInt(st.snap.plan_id, 10) : null;
    trackCRMEvent(CZ_EVENT_NAMES.RETRY_CTA_SHOWN, {
      state: state,
      plan_id: diag ? diag.planId : null,
      snap_plan_id: isNaN(snapPlan) ? null : snapPlan,
    });
  }
}

function renderRetryCtaHorizonAddon(diag, st) {
  if (getRetryCtaState(diag, st) !== "unlocked") return "";
  _trackRetryCtaShown("unlocked", diag, st);

  var retryUrl = typeof buildRetryApplicationUrl === "function" ? buildRetryApplicationUrl() : null;
  var btnDisabled = !retryUrl;
  var btnGreen = "background:#34d399;box-shadow:0 15px 50px rgba(52,211,153,.25);";
  var btnStyle = btnDisabled
    ? "width:100%;height:52px;font-size:16px;opacity:.9;cursor:not-allowed;margin-top:16px;" + btnGreen
    : "width:100%;height:52px;font-size:16px;margin-top:16px;" + btnGreen;

  var introCopy = _retryCtaUnlockedCopy(diag, st);

  return '<div style="margin-top:16px;">'
    + '<div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.65;margin-bottom:14px;">'
    + introCopy
    + "</div>"
    + '<button type="button" class="btn btn-primary" id="btn-retry-application"'
    + (btnDisabled ? " disabled" : "")
    + ' style="' + btnStyle + '">Solicitar préstamo nuevamente</button>'
    + '<div style="font-size:12px;color:#8390b5;line-height:1.6;margin-top:12px;">'
    + "Esto no garantiza aprobación.<br>"
    + "La decisión final depende de la financiera y sus políticas vigentes."
    + "</div>"
    + (btnDisabled
        ? '<div style="margin-top:10px;font-size:13px;color:#8390b5;">Próximamente disponible</div>'
        : "")
    + "</div>";
}

function renderRetryCta(diag, st) {
  return "";
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

  // Sprint 9 — gastos missing warning card (near top of plan tab)
  var _gastosMissingCard = (st.gastos_missing_confirmed)
    ? '<div style="background:rgba(255,196,0,.08);border:1px solid rgba(255,196,0,.25);border-radius:14px;padding:14px 18px;margin-bottom:16px;font-size:14px;color:#ffd447;line-height:1.6;">'
      + '⚠️ Este diagnóstico no incluye tus gastos mensuales. Algunas proyecciones pueden ser menos precisas.'
      + '</div>'
    : '';

  return '<div class="fade">'
    + _gastosMissingCard
    + renderFinancialRealityWarning(diag)
    + _dashIaSectionOpen(true, "situacion")
    + _dashIaLabel("Tu situación actual", "situacion")
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
    + '<div><div class="plan-title-big">' + diag.plan.icon + ' ' + diag.plan.titulo + '</div>'
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
    + _dashIaSectionClose()

    + _dashIaSectionOpen(false, "frenando")
    + _dashIaLabel("Qué está frenando tu perfil", "frenando")

    // 3. Bloqueadores activos
    + renderBloqueadores(diag)
    + renderPlan4SinDeudaActivaExplicacion(diag)

    // Sprint 12.1.b — relación deuda / ingreso (educational)
    + renderRelacionDeudaIngreso(diag)
    + _dashIaSectionClose()

    + _dashIaSectionOpen(false, "accion")
    + _dashIaLabel("Qué hacer ahora", "accion")

    // 4. Horizonte estimado para recalificar
    + renderHorizonteRecalificacion(diag, st)

    // Sprint 9 / 14.0c — Hidden Factor entry → ★ Mi Plan Plus tab
    + (typeof detectHiddenFactorOpportunity === "function" && detectHiddenFactorOpportunity(diag)
        ? '<div class="plan-card" id="cz-hf-cta" style="background:rgba(64,215,255,.05);border-color:rgba(64,215,255,.2);">'
          + '<div style="font-size:13px;font-weight:800;color:#40d7ff;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">⚠️ Este diagnóstico se basa únicamente en la información que declaraste</div>'
          + '<div style="font-size:16px;color:rgba(255,255,255,.8);line-height:1.65;margin-bottom:20px;">Mi Plan Plus contrasta esta información con registros de BCU y Clearing para detectar diferencias, acreedores no declarados y otros factores que podrían estar afectando tu perfil financiero.</div>'
          + '<button class="btn btn-primary" id="btn-hf-cta" style="width:100%;height:60px;font-size:18px;">Ver mi situación real</button>'
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
        var finAccion = _finFromDiag(diag);
        var textoAccion = ((finAccion.dti_ratio || 0) >= 1)
          ? CZ_DTI_ACCION_PRIORITARIA
          : (nPaso && nPaso.texto ? nPaso.texto : null);
        if (!textoAccion) return "";
        return '<div class="plan-card" style="border-color:rgba(255,255,255,.1);'
          + _dashSectionAccentCss("accion") + '">'
          + _dashCardTitle("📍", "Acción prioritaria", "accion")
          + '<div style="padding:14px 16px;background:rgba(255,255,255,.04);'
          + 'border:1px solid rgba(255,255,255,.09);border-radius:12px;">'
          + '<div style="font-size:15px;color:rgba(255,255,255,.9);line-height:1.65;">'
          + textoAccion
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
    + _dashIaSectionClose()

    + _dashIaSectionOpen(false, "numeros")
    + _dashIaLabel("Tus números", "numeros")
    + renderDashboardEditGastosCta()

    // Sprint 12.1 — confianza del diagnóstico (DTI / stock de deuda)
    + renderConfianzaDiagnostico(diag)

    // 10. Analisis financiero detallado (radiografia — bloques 1 a 4)
    + renderRadiografia()

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

    + _renderTuSituacionHoy(diag, st)
    + _dashIaSectionClose()

    // 12. Mi Plan Plus entry (Sprint 14.0c — routes to ★ Mi Plan Plus tab)
    + '<div class="plan-card" id="cz-plus-entry" style="background:rgba(64,215,255,.05);border-color:rgba(64,215,255,.2);">'
    + '<div style="font-size:13px;font-weight:800;color:#40d7ff;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">★ Mi Plan Plus</div>'
    + '<div style="font-size:16px;color:rgba(255,255,255,.8);line-height:1.65;margin-bottom:20px;">Mi Plan Plus contrasta esta información con registros de BCU y Clearing para detectar diferencias, acreedores no declarados y otros factores que podrían estar afectando tu perfil financiero.</div>'
    + '<button class="btn btn-primary" id="btn-conocer-plus" style="width:100%;height:60px;font-size:18px;">Ver mi situación real</button>'
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

  return '<div class="plan-card" id="cz-feedback-box" style="margin-top:28px;border-color:rgba(255,255,255,.1);'
    + _dashSectionAccentCss("sugerencias") + '">'
    + _dashCardTitle("💬", "Sugerencias", "sugerencias")
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
// RADIOGRAFIA FINANCIERA — Sprint 12.3 gastos vs ingreso (solo diagnóstico)
// =============================================================================
function renderRadiografiaGastosInsights() {
  var st = _st();
  if (st.step !== 3) return "";
  var ingreso = PRE.ingreso || 0;
  if (ingreso <= 0) return "";

  var items = typeof collectPresentableExpenseItems === "function"
    ? collectPresentableExpenseItems()
    : [];
  if (!items.length) return "";

  var totalGastos = typeof getTotalMonthlyExpenses === "function"
    ? getTotalMonthlyExpenses()
    : items.reduce(function(s, x) { return s + x.amount; }, 0);
  if (totalGastos <= 0) return "";

  var pctTotal = getExpensePercent(totalGastos, ingreso);
  var top      = getTopExpenses(items, 3);
  var card     = "background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;margin-bottom:12px;";

  var edu = '<div style="font-size:12px;color:#8390b5;line-height:1.55;margin-bottom:12px;">'
    + "Estos porcentajes muestran cuánto representa cada gasto respecto a tu ingreso mensual."
    + "</div>";

  var totalCard = '<div style="' + card + '">'
    + '<div style="font-size:13px;font-weight:800;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Total de gastos</div>'
    + '<div style="font-size:34px;font-weight:900;color:rgba(255,255,255,.9);line-height:1;letter-spacing:-1px;margin-bottom:6px;">' + fmt(Math.round(totalGastos)) + "</div>"
    + '<div style="font-size:15px;color:#8390b5;">' + pctTotal.toFixed(1) + "% de tus ingresos</div>"
    + "</div>";

  var topRows = top.map(function(item, idx) {
    var pct = getExpensePercent(item.amount, ingreso);
    return '<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06);">'
      + '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:6px;">' + (idx + 1) + ". " + item.label + "</div>"
      + '<div style="font-size:22px;font-weight:900;color:rgba(255,255,255,.9);line-height:1;margin-bottom:4px;">' + fmt(Math.round(item.amount)) + "</div>"
      + '<div style="font-size:14px;color:#8390b5;">' + pct.toFixed(1) + "% de tus ingresos</div>"
      + "</div>";
  }).join("");

  var topCard = '<div style="' + card + '">'
    + '<div style="font-size:13px;font-weight:800;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">¿Dónde se va tu dinero?</div>'
    + topRows
    + "</div>";

  return edu + totalCard + topCard;
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

  return '<div style="margin-bottom:20px;max-width:100%;' + _dashSectionAccentCss("radiografia") + '">'
    + _dashCardTitle("📊", "Radiografía financiera", "radiografia")

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

    // Sprint 12.3 — contexto de gastos vs ingreso (solo step 3, ingreso > 0, gastos > 0)
    + renderRadiografiaGastosInsights()

    + '</div>';
}

// =============================================================================
// TAB: MIS DEUDAS
// =============================================================================
function renderDeudasEmptyActivas() {
  return '<div class="deudas-empty-activas">'
    + '<div class="deudas-empty-activas-title">No tenés deudas activas registradas.</div>'
    + '<div class="deudas-empty-activas-text">Si asumiste una nueva obligación o te faltó cargar '
    + "una, agregala para actualizar tu diagnóstico.</div>"
    + "</div>";
}

function renderDeudaTabAddBar(st) {
  var busy = st.editing_debt_index != null;
  return '<div class="deuda-tab-add-bar">'
    + '<button type="button" class="btn btn-secondary" id="btn-add-debt"'
    + (busy ? ' disabled style="opacity:.45;cursor:not-allowed;"' : "")
    + ">➕ Agregar deuda</button>"
    + "</div>";
}

function renderDeudaTabEditActions(st) {
  if (st.editing_debt_index == null) return "";
  return '<div class="deuda-tab-edit-actions">'
    + '<button type="button" class="btn btn-secondary" id="btn-guardar-deuda-edicion">'
    + (st._deuda_is_new_add ? "Guardar deuda" : "Guardar cambios") + "</button>"
    + '<button type="button" class="btn btn-secondary" id="btn-cancelar-edicion-deuda">Cancelar</button>'
    + "</div>";
}

function renderDeudasHistorialToggle(pagadaCount) {
  if (pagadaCount <= 0) return "";
  var expanded = _deudasHistorialExpand;
  var label = expanded
    ? "▲ Ocultar historial"
    : "▼ Ver historial (" + pagadaCount + ")";
  return '<button type="button" class="deudas-historial-toggle" data-deudas-historial-toggle="1">'
    + label + "</button>";
}

function renderDeudaHistorica(d, i) {
  var monto = parseFloat(d.monto_original != null ? d.monto_original : d.monto) || 0;
  var badge = _deudaStatusBadgeMeta(d);
  var title = String(d.acreedor_display || d.acreedor || "").trim() || "Deuda histórica";

  return '<div class="debt-card debt-card-historica" id="dhist-' + i + '" style="'
    + _deudaLiveCardStyle()
    + "opacity:0.62;border-color:rgba(255,255,255,.05);background:rgba(255,255,255,.02);"
    + '">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px;max-width:100%;">'
    + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.72);flex:1;min-width:0;word-break:break-word;line-height:1.35;">'
    + title + "</div>"
    + '<span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:12px;white-space:nowrap;'
    + "background:" + badge.bg + ";color:" + badge.color + ';">' + badge.label + "</span>"
    + "</div>"
    + '<div style="font-size:22px;font-weight:800;color:rgba(255,255,255,.78);margin:2px 0 8px;line-height:1.2;word-break:break-word;">'
    + fmt(Math.round(monto)) + "</div>"
    + '<div style="font-size:12px;color:rgba(255,255,255,.35);line-height:1.45;">Deuda histórica</div>'
    + "</div>";
}

function renderTabDeudas() {
  var st     = _st();
  var deudas = st.deudas || [];
  var stats  = _deudasResumenStats(deudas);
  var ingreso = PRE.ingreso || 0;
  var activasList = _deudasActivasConIndice(deudas);
  var pagadasList = _deudasPagadasConIndice(deudas);
  var totalDeudaActiva = stats.totalActiva;

  var activasHtml = "";
  if (stats.activaCount === 0) {
    if (st.editing_debt_index != null && st._deuda_is_new_add && st.deudas[st.editing_debt_index]) {
      activasHtml = renderDeudaLive(
        st.deudas[st.editing_debt_index],
        st.editing_debt_index,
        totalDeudaActiva,
        ingreso
      );
    } else {
      activasHtml = renderDeudasEmptyActivas();
    }
  } else {
    activasHtml = activasList.map(function(item) {
      return renderDeudaLive(item.d, item.i, totalDeudaActiva, ingreso);
    }).join("");
  }

  var historialHtml = "";
  if (stats.pagadaCount > 0 && _deudasHistorialExpand) {
    historialHtml = '<div id="deudas-historial-panel" class="deudas-historial-panel">'
      + pagadasList.map(function(item) {
          return renderDeudaHistorica(item.d, item.i);
        }).join("")
      + "</div>";
  }

  return '<div class="fade">'
    + _dashIaSectionOpen(true, "deudas")
    + _dashIaLabel("Tus deudas", "deudas")
    + _deudasSubtitleCounter(stats.activaCount, stats.pagadaCount)
    + '<div class="section-text">Actualiza tus saldos a medida que vas pagando. El plan y el puntaje se recalculan solos.</div>'
    + renderDeudasResumen(deudas)
    + renderDeudaTabAddBar(st)
    + activasHtml
    + renderDeudaTabEditActions(st)
    + renderDeudasHistorialToggle(stats.pagadaCount)
    + historialHtml
    + _dashIaSectionClose()
    + '<div style="text-align:center;margin-top:14px;font-size:16px;color:#8390b5;">Los cambios se guardan automaticamente.</div>'
    + '</div>';
}

function renderDeudaLive(d, i, totalDeuda, ingreso) {
  var pagada     = _isDeudaPagadaUI(d);
  var st         = _st();
  var montoMostrar = parseFloat(pagada && d.monto_original != null ? d.monto_original : d.monto) || 0;
  var pago       = parseFloat(d.pago) || 0;
  var badge      = _deudaStatusBadgeMeta(d);
  var quickOpen  = !pagada && st._deuda_quick_edit_index === i;
  var editBanner = (st.editing_debt_index === i)
    ? '<div style="margin-bottom:14px;padding:12px 16px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.22);border-radius:12px;font-size:15px;font-weight:700;color:#40d7ff;">Editando deuda: ' + _deudaDisplayName(d, i) + '</div>'
    : "";

  if (st.editing_debt_index === i) {
    return '<div id="dlive-' + i + '">' + editBanner + renderDeudaCard(d, i) + '</div>';
  }

  var pctDeuda = totalDeuda > 0
    ? ((montoMostrar / totalDeuda) * 100).toFixed(1)
    : null;
  var pctIngreso = pago > 0 && ingreso > 0
    ? ((pago / ingreso) * 100).toFixed(1)
    : null;

  var amountBlock = "";
  if (pagada) {
    amountBlock = '<div style="font-size:24px;font-weight:900;color:rgba(255,255,255,.92);margin:4px 0 8px;line-height:1.2;word-break:break-word;">'
      + fmt(Math.round(montoMostrar)) + "</div>";
  } else if (quickOpen) {
    amountBlock = '<div style="margin:4px 0 8px;max-width:100%;">'
      + '<div style="position:relative;max-width:100%;">'
      + '<span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:16px;pointer-events:none;">$</span>'
      + '<input type="number" data-editar-deuda="' + i + '" value="' + (d.monto != null ? d.monto : "") + '" placeholder="0" '
      + 'style="padding-left:34px;width:100%;max-width:100%;box-sizing:border-box;"/>'
      + "</div></div>";
  } else {
    amountBlock = '<div style="font-size:24px;font-weight:900;color:rgba(255,255,255,.92);margin:4px 0 6px;line-height:1.2;word-break:break-word;">'
      + fmt(Math.round(montoMostrar)) + "</div>"
      + '<span role="button" tabindex="0" data-deuda-quick-edit-trigger="' + i + '" '
      + 'style="font-size:12px;color:rgba(255,255,255,.4);cursor:pointer;display:inline-block;margin-bottom:8px;">'
      + "✏️ Editar monto</span>";
  }

  var contextLines = "";
  if (!pagada && pctDeuda != null) {
    contextLines += '<div style="font-size:12px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:6px;">'
      + "Representa " + pctDeuda + "% de tu deuda activa</div>";
  }
  if (pago > 0) {
    contextLines += '<div style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.5;margin-bottom:6px;">'
      + fmt(Math.round(pago)) + " por mes</div>";
  }
  if (pctIngreso != null) {
    contextLines += '<div style="font-size:12px;color:rgba(255,255,255,.4);line-height:1.5;">'
      + "Representa " + pctIngreso + "% de tus ingresos</div>";
  }

  return '<div class="debt-card" id="dlive-' + i + '" style="' + _deudaLiveCardStyle()
    + "opacity:" + (pagada ? "0.75" : "1") + ';">'
    + editBanner
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:12px;max-width:100%;">'
    + '<div style="font-size:16px;font-weight:700;color:rgba(255,255,255,.92);flex:1;min-width:0;word-break:break-word;line-height:1.35;">'
    + _deudaLiveTitle(d) + "</div>"
    + '<span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:12px;white-space:nowrap;'
    + "background:" + badge.bg + ";color:" + badge.color + ';">' + badge.label + "</span>"
    + "</div>"
    + amountBlock
    + (contextLines ? '<div style="margin-bottom:12px;">' + contextLines + "</div>" : "")
    + renderDeudaActionButtons(i, d)
    + "</div>";
}

function focusDeudaQuickEditInput(idx) {
  setTimeout(function() {
    var inp = document.querySelector('[data-editar-deuda="' + idx + '"]');
    if (inp) {
      inp.focus();
      if (typeof inp.select === "function") inp.select();
    }
  }, 0);
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
      + '<button class="btn btn-primary" style="height:68px;font-size:20px;" id="btn-conocer-plus-ia">Ver mi situación real</button>'
      + '</div></div></div>';
  }
  if (!ia) return '<div class="fade"><div class="result"><h3>Generando tu analisis...</h3><p>El asistente esta procesando tu informe Clearing.</p></div></div>';
  return '<div class="fade"><div class="result"><h3 style="color:#40d7ff;">"' + ia.mensaje + '"</h3></div>'
    + '<div class="plan-card"><div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">🔍 Diagnostico</div><div style="font-size:19px;color:rgba(255,255,255,.8);line-height:1.65;">' + ia.diagnostico + '</div></div>'
    + (ia.primerPaso ? '<div class="plan-card" style="background:rgba(52,255,175,.07);border-color:rgba(52,255,175,.2);"><div style="font-size:13px;color:#34ffaf;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;">Hace esto esta semana</div><div style="font-size:22px;font-weight:800;line-height:1.5;">' + ia.primerPaso + '</div></div>' : "")
    + '</div>';
}

// =============================================================================
// TAB: Mi Plan PLUS — Sprint 14.0
// =============================================================================
function _trackPlusCtaViewed() {
  if (typeof trackEvent !== "function") return;
  trackEvent(CZ_EVENT_NAMES.PLUS_CTA_VIEWED, {
    cta_source: "plus_tab",
  });
}

function _plusCheckItem(text) {
  return '<li class="plus-check-item"><span class="plus-check-mark" aria-hidden="true">✓</span>'
    + '<span>' + text + "</span></li>";
}

function _plusScreenWrap(inner) {
  return '<div class="fade plus-tab-wrap">' + inner + "</div>";
}

function _plusCard(inner) {
  return '<div class="plan-card plus-screen-card">' + inner + "</div>";
}

function _plusAiHighlightBlock() {
  return '<div class="plus-ai-highlight">'
    + '<div class="plus-ai-highlight-icon" aria-hidden="true">🤖</div>'
    + '<div class="plus-ai-highlight-content">'
    + "<strong>Análisis con Inteligencia Artificial</strong>"
    + "<p>Tu información se cruza con datos reales de BCU y Clearing. "
    + "La IA detecta diferencias, patrones y oportunidades de mejora específicas para tu caso.</p>"
    + "</div></div>";
}

function _plusComingSoonBlock() {
  return '<div class="plus-coming-soon">'
    + '<div class="plus-coming-soon-head">'
    + '<span class="plus-coming-soon-icon">💬</span>'
    + '<span class="plus-coming-soon-badge">Próximamente</span>'
    + "</div>"
    + "<strong>Asistente financiero IA</strong>"
    + "<p>Consultá dudas sobre deudas, Clearing, BCU y recuperación financiera "
    + "con un asistente especializado en el mercado uruguayo.</p>"
    + "</div>";
}

function _plusAiSignature() {
  return '<div class="plus-ai-signature">'
    + "🧠 Análisis automatizado por IA · Credizona Mi Plan Plus"
    + "</div>";
}

function _plusHasValidEmail(email) {
  return typeof sanitizeUrlEmail === "function"
    ? sanitizeUrlEmail(email) != null
    : (typeof email === "string" && email.trim().indexOf("@") > 0 && email.indexOf(".") > 0);
}

function renderPlusActionsBlock(st) {
  st = st || _st();
  var html = '<div class="plus-section-card plus-report-actions">'
    + '<div class="plus-report-sub">Descargá y compartí tu informe</div>'
    + '<button type="button" class="btn btn-primary plus-cta-btn" id="btn-plus-descargar-pdf">'
    + "Descargar PDF</button>"
    + '<div class="plus-email-action">';

  if (st.plus_email_requested) {
    html += '<p class="plus-inline-msg plus-email-success">Te enviamos una copia del informe. '
      + "Solicitud registrada. El envío real se conectará cuando el backend esté disponible.</p>";
  } else if (st._plus_email_edit_mode) {
    var prefill = _plusHasValidEmail(st.user_email) ? _plusEsc(st.user_email.trim()) : "";
    html += '<label class="plus-email-label" for="plus-email-input">Enviarme copia por email</label>'
      + '<input type="email" class="plus-email-input" id="plus-email-input" placeholder="Ingresá tu email" '
      + 'autocomplete="email" value="' + prefill + '"/>'
      + '<button type="button" class="btn btn-secondary plus-cta-btn plus-cta-secondary" id="btn-plus-enviar-email">'
      + "Enviar informe</button>";
  } else if (_plusHasValidEmail(st.user_email)) {
    html += '<p class="plus-email-preload-msg">Enviamos el informe a '
      + '<strong>' + _plusEsc(st.user_email.trim()) + "</strong></p>"
      + '<p class="plus-email-change-wrap">'
      + '<button type="button" class="plus-email-change-link" id="btn-plus-email-cambiar">'
      + "¿No es tu email? Cambiar</button></p>"
      + '<button type="button" class="btn btn-secondary plus-cta-btn plus-cta-secondary" id="btn-plus-enviar-email">'
      + "Enviar informe</button>";
  } else {
    html += '<label class="plus-email-label" for="plus-email-input">Enviarme copia por email</label>'
      + '<input type="email" class="plus-email-input" id="plus-email-input" placeholder="Ingresá tu email" autocomplete="email"/>'
      + '<button type="button" class="btn btn-secondary plus-cta-btn plus-cta-secondary" id="btn-plus-enviar-email">'
      + "Enviar informe</button>";
  }

  html += "</div></div>";
  return html;
}

function renderPlusFeedbackBlock(st) {
  st = st || _st();
  var html = '<div class="plus-section-card plus-feedback-block">'
    + '<h3 class="plus-section-title">Ayudanos a mejorar este informe</h3>';

  if (st.plus_feedback_submitted) {
    html += '<p class="plus-feedback-thanks">Gracias. Tu respuesta nos ayuda a mejorar Mi Plan Plus.</p>';
  } else {
    html += '<div class="plus-feedback-step" id="plus-fb-step-score">'
      + '<div class="plus-feedback-label">¿Qué tan útil te resultó este informe?</div>'
      + '<div class="plus-feedback-score-row">';

    for (var i = 1; i <= 5; i++) {
      var scoreActive = st.plus_feedback_score === i ? " active" : "";
      html += '<button type="button" class="plus-feedback-score-btn' + scoreActive
        + '" data-plus-fb-score="' + i + '">' + i + "</button>";
    }

    html += "</div></div>";

    var cascadeHidden = st.plus_feedback_score == null ? " hidden" : "";
    html += '<div class="plus-feedback-cascade' + cascadeHidden + '" id="plus-fb-cascade">'
      + '<div class="plus-feedback-label">Claridad respecto a tu situación</div>'
      + '<div class="plus-feedback-chips">';

    ["Mucho mejor", "Mejor", "Igual", "Peor"].forEach(function(opt) {
      var clarityActive = st.plus_feedback_clarity === opt ? " active" : "";
      html += '<button type="button" class="plus-feedback-chip' + clarityActive
        + '" data-plus-fb-clarity="' + _plusEsc(opt) + '">' + _plusEsc(opt) + "</button>";
    });

    html += '</div><div class="plus-feedback-label">¿Qué valor te aportó más?</div>'
      + '<div class="plus-feedback-chips plus-feedback-chips-wrap">';

    [
      "Diferencias detectadas",
      "Información BCU",
      "Información Clearing",
      "Acciones recomendadas",
      "Horizonte de recuperación",
      "Otra cosa",
    ].forEach(function(opt) {
      var valueActive = st.plus_feedback_value === opt ? " active" : "";
      html += '<button type="button" class="plus-feedback-chip' + valueActive
        + '" data-plus-fb-value="' + _plusEsc(opt) + '">' + _plusEsc(opt) + "</button>";
    });

    html += '</div>'
      + '<label class="plus-feedback-label" for="plus-fb-comment">Comentarios (opcional)</label>'
      + '<textarea class="plus-feedback-textarea" id="plus-fb-comment" rows="3" maxlength="500" '
      + 'placeholder="Contanos qué te gustaría ver distinto...">'
      + _plusEsc(st.plus_feedback_comment || "")
      + "</textarea>"
      + '<button type="button" class="btn btn-secondary plus-cta-btn plus-feedback-submit" id="btn-plus-feedback-submit">'
      + "Enviar opinión</button>"
      + "</div>";
  }

  html += "</div>";
  return html;
}

function renderPlusPresentation() {
  _trackPlusCtaViewed();

  var incluye = [
    "Verificación de datos en BCU",
    "Verificación de registros en Clearing (Equifax)",
    "Informe financiero personalizado",
    "PDF descargable",
  ];

  return _plusScreenWrap(
    _plusCard(
      '<div class="plus-header-icon" aria-hidden="true">★</div>'
      + '<h2 class="plus-header-title">Mi Plan Plus</h2>'
      + '<p class="plus-header-subtitle">Tu situación financiera real,<br/>no solo la que declaraste.</p>'
      + _plusAiHighlightBlock()
      + '<div class="plus-block">'
      + '<h3 class="plus-block-title">¿Qué incluye tu informe?</h3>'
      + '<ul class="plus-check-list">' + incluye.map(_plusCheckItem).join("") + "</ul>"
      + "</div>"
      + '<div class="plus-block plus-block-muted">'
      + '<h3 class="plus-block-title">¿Por qué es diferente?</h3>'
      + '<p class="plus-diff-text">Mi Plan utiliza únicamente la información que declaraste.</p>'
      + '<p class="plus-diff-text">Mi Plan Plus combina datos reales de BCU y Clearing con Inteligencia Artificial '
      + "para generar un diagnóstico que va más allá de lo que recordás o declaraste.</p>"
      + "</div>"
      + '<div class="plus-example-card">'
      + '<h4 class="plus-example-title">Ejemplo</h4>'
      + '<div class="plus-example-stack">'
      + '<div class="plus-example-row">'
      + '<div class="plus-example-label">Declarado por vos</div>'
      + '<div class="plus-example-value">OCA — $45.000</div>'
      + "</div>"
      + '<div class="plus-example-row">'
      + '<div class="plus-example-label">Registrado en el sistema financiero</div>'
      + '<div class="plus-example-value">OCA — $45.000</div>'
      + '<div class="plus-example-value">Préstamo personal — $33.000</div>'
      + "</div>"
      + "</div>"
      + '<p class="plus-example-note">⚠ Existe una diferencia entre la información declarada y la registrada.</p>'
      + "</div>"
      + '<div class="plus-price-context">Informe financiero completo</div>'
      + '<div class="plus-price-block">'
      + '<div class="plus-price-amount">$1.290</div>'
      + '<div class="plus-price-note">IVA incluido · Pago único</div>'
      + "</div>"
      + '<button type="button" class="btn btn-primary plus-cta-btn" id="btn-plus-obtener-informe">'
      + "Ver mi situación real</button>"
      + '<p id="plus-cta-inline-msg" class="plus-cta-inline-msg" style="display:none;"></p>'
      + _renderPlusClaudeTestBlock()
      + '<p class="plus-disclaimer">El informe se genera en base a los datos disponibles en BCU '
      + "y Clearing al momento de la consulta.</p>"
      + _plusComingSoonBlock()
    )
  );
}

function _plusClaudeTestConfig() {
  var paymentLive = typeof CZ_PLUS_PAYMENT_LIVE !== "undefined" && !!CZ_PLUS_PAYMENT_LIVE;
  var proxyEnabled = typeof CZ_PLUS_PROXY_ENABLED !== "undefined" && !!CZ_PLUS_PROXY_ENABLED;
  var allowBrowser = typeof CZ_CLAUDE_ALLOW_BROWSER_KEY !== "undefined" && !!CZ_CLAUDE_ALLOW_BROWSER_KEY;
  var hasKey = typeof CZ_CLAUDE_API_KEY !== "undefined" && String(CZ_CLAUDE_API_KEY).trim() !== "";
  var canGenerate = !paymentLive && (proxyEnabled || (allowBrowser && hasKey));
  return {
    paymentLive: paymentLive,
    proxyEnabled: proxyEnabled,
    allowBrowser: allowBrowser,
    hasKey: hasKey,
    showBlock: canGenerate,
    canGenerate: canGenerate,
  };
}

function _renderPlusClaudeTestBlock() {
  var cfg = _plusClaudeTestConfig();
  if (!cfg.showBlock) return "";

  var html = '<div class="plus-test-block">'
    + '<p class="plus-test-helper">Uso interno: genera un informe Plus usando datos de prueba y Claude.</p>';

  if (cfg.canGenerate) {
    html += '<button type="button" class="btn btn-secondary plus-test-btn" id="btn-plus-test-generar">'
      + "Generar informe de prueba con IA</button>";
  } else {
    html += '<p class="plus-test-missing-key">Falta configurar el proxy de Claude o la API key local.</p>';
  }

  html += "</div>";
  return html;
}

function _plusEsc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _plusBadgeClass(nivel) {
  var n = (nivel || "").toLowerCase().trim();
  if (n === "alta") return "plus-badge plus-badge-alta";
  if (n === "media") return "plus-badge plus-badge-media";
  return "plus-badge plus-badge-baja";
}

function _plusBadgeLabel(nivel) {
  var n = (nivel || "").toLowerCase().trim();
  if (n === "alta") return "⚠️ Impacto alto";
  if (n === "media") return "📋 Impacto medio";
  return "💡 Para tu info";
}

function _plusBadgeHtml(nivel) {
  var n = (nivel || "baja").toLowerCase().trim();
  return '<span class="' + _plusBadgeClass(n) + '">' + _plusEsc(_plusBadgeLabel(n)) + "</span>";
}

function _plusListHtml(items, itemRenderer) {
  var arr = items || [];
  if (!arr.length) return "";
  return '<ul class="plus-report-list">'
    + arr.map(itemRenderer).join("")
    + "</ul>";
}

function _plusSectionTitle(text) {
  return '<h3 class="plus-section-title">' + _plusEsc(text) + "</h3>";
}

function _plusBloqueadorTexto(bp) {
  if (!bp) return "";
  if (typeof bp === "string") return bp;
  return bp.descripcion || bp.tipo || "";
}

function _plusFortalezaItem(item) {
  if (typeof item === "string") {
    return "<li>" + _plusEsc(item) + "</li>";
  }
  return "<li><strong>" + _plusEsc(item.titulo) + "</strong> — " + _plusEsc(item.descripcion) + "</li>";
}

function _plusRiesgoItem(item) {
  if (typeof item === "string") {
    return "<li>" + _plusEsc(item) + "</li>";
  }
  return '<li class="plus-riesgo-item">'
    + '<div class="plus-card-head">'
    + "<strong>" + _plusEsc(item.titulo) + "</strong>"
    + _plusBadgeHtml(item.urgencia)
    + "</div>"
    + '<span class="plus-finding-desc">' + _plusEsc(item.descripcion) + "</span>"
    + "</li>";
}

function _plusRenderHallazgo(h) {
  if (!h) return "";
  return '<div class="plus-finding-card">'
    + '<div class="plus-card-head">'
    + "<strong>" + _plusEsc(h.titulo) + "</strong>"
    + _plusBadgeHtml(h.severidad)
    + "</div>"
    + '<div class="plus-finding-desc">' + _plusEsc(h.descripcion) + "</div>"
    + '<div class="plus-source">Fuente: ' + _plusEsc(h.fuente || "combinado") + "</div>"
    + "</div>";
}

function _plusRenderAccionInmediata(act) {
  var urgBadge = act.urgencia ? _plusBadgeHtml(act.urgencia) : "";
  return '<div class="plus-report-sub">Acción inmediata</div>'
    + '<div class="plus-action-card plus-action-card-inmediata">'
    + '<div class="plus-card-head">'
    + "<strong>" + _plusEsc(act.titulo) + "</strong>"
    + urgBadge
    + "</div>"
    + '<div class="plus-action-desc">' + _plusEsc(act.descripcion) + "</div>"
    + "</div>";
}

function _plusRenderAccionCard(act) {
  if (!act) return "";
  var orden = act.orden != null ? act.orden : "";
  return '<div class="plus-action-card">'
    + '<div class="plus-card-head">'
    + "<div>"
    + '<span class="plus-action-number">' + _plusEsc(orden) + "</span>"
    + '<span class="plus-action-title">' + _plusEsc(act.titulo) + "</span>"
    + "</div>"
    + _plusBadgeHtml(act.urgencia)
    + "</div>"
    + '<div class="plus-action-desc">' + _plusEsc(act.descripcion) + "</div>"
    + "</div>";
}

function renderPlusInforme(informe) {
  informe = informe || {};
  var sec1 = informe.seccion_1_resumen_ejecutivo || {};
  var sec4 = informe.seccion_4_hallazgos || {};
  var sec5 = informe.seccion_5_acciones || {};
  var sec6 = informe.seccion_6_horizonte || {};
  var escProb = sec6.escenario_probable || {};
  var horizRec = sec6.horizonte_recalificacion || {};
  var accionInmediata = sec5.accion_inmediata || {
    titulo: "Acción recomendada",
    descripcion: "Revisá tus prioridades financieras.",
  };
  var tiempoEst = escProb.tiempo_estimado || sec6.tiempo_estimado || "";

  var html = '<div class="plus-report">'
    + '<div class="plus-report-header">'
    + '<div class="plus-header-icon" aria-hidden="true">★</div>'
    + '<h2 class="plus-header-title">Tu informe Mi Plan Plus</h2>'
    + "</div>";

  html += '<div class="plus-section-card">'
    + _plusSectionTitle("📌 Tu situación financiera hoy")
    + '<p class="plus-report-p">' + _plusEsc(sec1.situacion_general) + "</p>"
    + '<div class="plus-report-sub">Fortalezas</div>'
    + _plusListHtml(sec1.fortalezas || [], _plusFortalezaItem)
    + '<div class="plus-report-sub">Riesgos</div>'
    + '<ul class="plus-report-list plus-riesgos-list">'
    + (sec1.riesgos || []).map(_plusRiesgoItem).join("")
    + "</ul>"
    + '<div class="plus-report-sub">Bloqueador principal</div>'
    + '<p class="plus-report-p">' + _plusEsc(_plusBloqueadorTexto(sec1.bloqueador_principal)) + "</p>"
    + '<div class="plus-report-sub">Horizonte</div>'
    + '<p class="plus-report-p">' + _plusEsc(sec1.horizonte_resumen) + "</p>"
    + '<p class="plus-report-disclaimer">' + _plusEsc(sec1.nota_disclaimer) + "</p>"
    + "</div>";

  if (informe.seccion_3_nota_diferencias) {
    html += '<div class="plus-section-card plus-section-card-diferencias">'
      + _plusSectionTitle("🔎 Diferencias detectadas")
      + '<p class="plus-report-p">' + _plusEsc(informe.seccion_3_nota_diferencias) + "</p>"
      + "</div>";
  }

  html += '<div class="plus-section-card">'
    + _plusSectionTitle("🧠 Qué significa esto")
    + '<p class="plus-report-p">' + _plusEsc(sec4.interpretacion_general) + "</p>"
    + (sec4.hallazgos || []).map(_plusRenderHallazgo).join("")
    + (sec4.patron_detectado
      ? '<div class="plus-report-sub">Patrón detectado</div>'
        + '<p class="plus-report-p">' + _plusEsc(sec4.patron_detectado) + "</p>"
      : "")
    + '<div class="plus-report-sub">Perfil de riesgo real</div>'
    + '<p class="plus-report-p">' + _plusEsc(sec4.perfil_riesgo_real) + "</p>"
    + (sec4.diferencia_perfil_declarado_vs_real
      ? '<div class="plus-report-sub">Diferencia declarado vs real</div>'
        + '<p class="plus-report-p">' + _plusEsc(sec4.diferencia_perfil_declarado_vs_real) + "</p>"
      : "")
    + "</div>";

  html += '<div class="plus-section-card">'
    + _plusSectionTitle("✅ Qué hacer ahora")
    + _plusRenderAccionInmediata(accionInmediata)
    + (sec5.acciones || []).map(_plusRenderAccionCard).join("")
    + _plusAiSignature()
    + "</div>";

  html += '<div class="plus-section-card">'
    + _plusSectionTitle("⏳ Tu horizonte")
    + '<p class="plus-report-p">' + _plusEsc(sec6.situacion_actual) + "</p>"
    + '<div class="plus-report-sub">Escenario probable</div>'
    + '<p class="plus-report-p">' + _plusEsc(escProb.descripcion) + "</p>"
    + '<div class="plus-report-sub">Tiempo estimado</div>'
    + '<p class="plus-report-p plus-report-emphasis">' + _plusEsc(tiempoEst) + "</p>"
    + '<div class="plus-report-sub">Condiciones</div>'
    + _plusListHtml(escProb.condiciones || [], function(item) {
        return "<li>" + _plusEsc(item) + "</li>";
      })
    + '<div class="plus-report-sub">Qué debe cambiar</div>'
    + _plusListHtml(sec6.que_debe_cambiar || [], function(item) {
        return "<li>" + _plusEsc(item) + "</li>";
      })
    + '<div class="plus-report-sub">Estimación de recalificación</div>'
    + '<p class="plus-report-p">' + _plusEsc(horizRec.estimacion || sec6.estimacion) + "</p>"
    + '<div class="plus-report-sub">Factores bloqueantes</div>'
    + _plusListHtml(horizRec.factores_bloqueantes || sec6.factores_bloqueantes || [], function(item) {
        return "<li>" + _plusEsc(item) + "</li>";
      })
    + '<div class="plus-report-sub">Factores favorables</div>'
    + _plusListHtml(horizRec.factores_favorables || sec6.factores_favorables || [], function(item) {
        return "<li>" + _plusEsc(item) + "</li>";
      })
    + "</div>";

  html += renderPlusActionsBlock(_st());
  html += renderPlusFeedbackBlock(_st());
  html += '<p class="plus-report-disclaimer plus-report-closure">Este informe es orientativo y se basa en los registros '
    + "disponibles al momento de la consulta. No constituye asesoramiento legal ni garantía de aprobación.</p>"
    + "</div>";

  return _plusScreenWrap(_plusCard(html));
}

function renderPlusProcessing() {
  return _plusScreenWrap(
    _plusCard(
      '<div class="plus-status-icon" aria-hidden="true">⏳</div>'
      + '<h2 class="plus-status-title">Estamos generando tu informe</h2>'
      + '<p class="plus-status-body">Estamos consultando BCU y Clearing y preparando tu análisis personalizado. '
      + "Esto puede tomar unos minutos.</p>"
      + '<p class="plus-status-body">Te enviaremos un email cuando tu informe esté listo.</p>'
    )
  );
}

function renderPlusReady() {
  var st = _st();
  if (st.plus_status === "PLUS_READY" && st.plus_informe) {
    return renderPlusInforme(st.plus_informe);
  }

  return _plusScreenWrap(
    _plusCard(
      '<div class="plus-status-icon" aria-hidden="true">✅</div>'
      + '<h2 class="plus-status-title">Tu informe está listo</h2>'
      + '<p class="plus-status-body">Tu análisis financiero personalizado está disponible.</p>'
      + '<button type="button" class="btn btn-primary plus-cta-btn" id="btn-plus-ver-informe">'
      + "Ver mi informe</button>"
      + '<button type="button" class="btn btn-secondary plus-cta-btn plus-cta-secondary" id="btn-plus-descargar-pdf">'
      + "Descargar PDF</button>"
    )
  );
}

function renderPlusError() {
  var st = _st();
  var errBody = st._plusInformeTestError
    ? "No se pudo generar el informe de prueba. Revisá API key, modelo o consola."
    : "Hubo un problema al consultar los registros financieros. No se realizó ningún cobro.";

  return _plusScreenWrap(
    _plusCard(
      '<div class="plus-status-icon" aria-hidden="true">⚠️</div>'
      + '<h2 class="plus-status-title">No pudimos generar tu informe</h2>'
      + '<p class="plus-status-body">' + _plusEsc(errBody) + "</p>"
      + '<button type="button" class="btn btn-primary plus-cta-btn" id="btn-plus-reintentar">'
      + "Intentar nuevamente</button>"
      + _renderPlusClaudeTestBlock()
      + '<p class="plus-support-line">Si el problema persiste contactá a soporte en '
      + '<a href="mailto:credizonauy@gmail.com" class="plus-support-link">credizonauy@gmail.com</a></p>'
    )
  );
}

function renderTabPlus() {
  var st = _st();
  var status = st.plus_status;

  if (status === "PLUS_PROCESSING") return renderPlusProcessing();
  if (status === "PLUS_READY" && st.plus_informe) return renderPlusInforme(st.plus_informe);
  if (status === "PLUS_READY") return renderPlusReady();
  if (status === "PLUS_ERROR") return renderPlusError();

  if (!st.plus_purchased || status == null) {
    return renderPlusPresentation();
  }

  return renderPlusPresentation();
}

// =============================================================================
// HERRAMIENTAS POR PLAN
// =============================================================================
function renderHerramientas() {
  var diag = _diag();
  if (!diag) return "";
  var pid  = diag.planId;

  var html = '<div style="margin-top:4px;">'
    + '<div style="margin-bottom:18px;">'
    + '<div style="font-size:20px;font-weight:900;">Acciones recomendadas</div>'
    + '<div style="font-size:15px;color:#8390b5;margin-top:2px;">Pasos concretos basados en tu diagnóstico actual.</div>'
    + '</div>';

  if      (pid === 1) html += renderHerramientasPlan1();
  else if (pid === 2) html += renderHerramientasPlan2();
  else if (pid === 3) html += renderHerramientasPlan3();
  else if (pid === 4) html += renderHerramientasPlan4();
  else                html += renderHerramientasPlan5();

  return html + '</div>';
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

// Sprint 13.1 — expansión de acciones recomendadas (persiste hasta cambio de tab)
var _accionesRecomExpand = false;
var _accionesRecomTab = null;

// Sprint 13.2 — historial de deudas pagadas (colapsado al cambiar de tab)
var _deudasHistorialExpand = false;
var _deudasHistorialTab = null;

function _iconoAccionRecomendada(tipo) {
  if (tipo === "accion") return "&#128203;";
  if (tipo === "habito") return "&#128260;";
  if (tipo === "contacto") return "&#128222;";
  return "&#128221;";
}

function _trackAccionesMostradasOnce(diag, acciones) {
  try {
    if (sessionStorage.getItem("cz_acciones_mostradas_fired")) return;
    sessionStorage.setItem("cz_acciones_mostradas_fired", "1");
    if (typeof trackCRMEvent !== "function") return;
    var iv2 = (diag && diag.interpretacion_v2) || {};
    trackCRMEvent(
      typeof CZ_EVENT_NAMES !== "undefined" ? CZ_EVENT_NAMES.ACCIONES_MOSTRADAS : "acciones_mostradas",
      {
        czuid: (window.CZIdentity && (window.CZIdentity.crm_contact_id || window.CZIdentity.anonymous_id)) || null,
        planId: diag ? diag.planId : null,
        causa_principal: iv2.causa_principal || null,
        action_ids: (acciones || []).map(function(a) { return a.id; }),
      }
    );
  } catch (e) { /* never throw */ }
}

function renderAccionRecomendadaItem(accion, index) {
  var done = !!((_herr().compromisos || {})[accion.id]);
  var urgColor = accion.urgencia === "alta" ? "#ff4e72"
    : accion.urgencia === "media" ? "#ffd36f" : "#8390b5";
  var hiddenCls = (index >= 3 && !_accionesRecomExpand) ? " accion-recom-extra" : "";
  return '<div class="compromiso-item accion-recomendada-item' + hiddenCls + '" data-toggle-compromiso="' + accion.id + '"'
    + ' data-accion-index="' + index + '"'
    + ' data-accion-tipo="' + (accion.tipo || "") + '" data-accion-urgencia="' + (accion.urgencia || "") + '">'
    + '<div class="compromiso-check' + (done ? " checked" : "") + '">' + (done ? "&#10003;" : "") + '</div>'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
    + '<span style="font-size:18px;line-height:1;" aria-hidden="true">' + _iconoAccionRecomendada(accion.tipo) + '</span>'
    + '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:' + urgColor + ';">'
    + (accion.urgencia || "media") + '</span></div>'
    + '<div class="compromiso-text">' + accion.texto + '</div></div></div>';
}

function _fallbackAccionesPlan5() {
  return [
    { id: "plan5_atrasos_reportados", texto: "Revisar si tus atrasos siguen reportados", tipo: "accion", urgencia: "alta" },
    { id: "plan5_pagos_reflejados", texto: "Confirmar que tus pagos recientes estén reflejados", tipo: "accion", urgencia: "media" },
    { id: "plan5_evitar_solicitudes", texto: "Evitar nuevas solicitudes hasta ordenar el estado reportado", tipo: "accion", urgencia: "media" },
  ];
}

function renderAccionesRecomendadasHtml(diag) {
  var acciones = typeof seleccionarAccionesRecomendadas === "function"
    ? seleccionarAccionesRecomendadas(diag)
    : [];
  if (diag && diag.planId === 5 && acciones.length < 3) {
    var fb5 = _fallbackAccionesPlan5();
    for (var fi = 0; fi < fb5.length && acciones.length < 3; fi++) {
      if (!acciones.some(function(a) { return a.id === fb5[fi].id; })) {
        acciones.push(fb5[fi]);
      }
    }
  }
  if (acciones.length > 5) acciones = acciones.slice(0, 5);
  _trackAccionesMostradasOnce(diag, acciones);

  var comp_ = _herr().compromisos || {};
  var allDone = acciones.length > 0;
  for (var ai = 0; ai < acciones.length; ai++) {
    if (!comp_[acciones[ai].id]) { allDone = false; break; }
  }

  var verMasBtn = (acciones.length > 3 && !_accionesRecomExpand)
    ? '<button type="button" id="btn-ver-mas-acciones" class="acciones-recom-ver-mas-btn" data-acciones-ver-mas="1">Ver más recomendaciones</button>'
    : "";

  return '<div class="acciones-recomendadas-wrap" style="margin-top:8px;">'
    + '<div style="margin-bottom:12px;">'
    + '<div style="font-size:17px;font-weight:800;color:rgba(255,255,255,.9);">Acciones recomendadas para tu situación</div>'
    + '<div style="font-size:15px;color:#8390b5;margin-top:4px;line-height:1.4;">Basadas en tu diagnóstico actual.</div>'
    + '</div>'
    + acciones.map(function(a, idx) { return renderAccionRecomendadaItem(a, idx); }).join("")
    + verMasBtn
    + (allDone
        ? '<div style="margin-top:14px;padding:14px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);border-radius:14px;text-align:center;font-size:18px;font-weight:800;color:#34ffaf;">Comprometiste las acciones recomendadas. Eso marca la diferencia.</div>'
        : "")
    + '</div>';
}

function accionesRecomendadasCompletadas(diag) {
  var acciones = typeof seleccionarAccionesRecomendadas === "function"
    ? seleccionarAccionesRecomendadas(diag)
    : [];
  var comp_ = _herr().compromisos || {};
  return acciones.length > 0 && acciones.some(function(a) { return comp_[a.id]; });
}

// ---- Plan 1 ----
function renderHerramientasPlan1() {
  var herr = _herr();
  var ing  = herr.ingresos || { formal: 0, extras: [], total: 0 };
  var gc   = herr.gastos_cls || {};
  var gastos = _st().gastos || {};
  var totalA = EXPENSE_CATS.filter(function(c) { return gc[c.k] === "ajustable"; }).reduce(function(s, c) { return s + (parseFloat(gastos[c.k]) || 0); }, 0);
  var flujoR = (ing.total || PRE.ingreso)
    - (typeof getTotalMonthlyExpenses === "function" ? getTotalMonthlyExpenses() : Object.values(gastos).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0))
    - (_diag() ? _diag().fin.totalPago : 0);
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

  var diag = _diag();
  var h4 = renderToolCard(4, "Acciones recomendadas para tu situación",
    "Basadas en tu diagnóstico actual.",
    renderAccionesRecomendadasHtml(diag),
    accionesRecomendadasCompletadas(diag));

  return h1 + h2 + h3 + h4;
}

// ---- Plan 2 ----
function renderHerramientasPlan2() {
  var herr  = _herr();
  var gest  = herr.gestiones || {};
  var diag  = _diag();
  var c1 = Object.keys(gest).length > 0;
  var c2 = accionesRecomendadasCompletadas(diag);
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

  var h2 = renderToolCard(2, "Acciones recomendadas para tu situación", "Basadas en tu diagnóstico actual.",
    renderAccionesRecomendadasHtml(diag), c2);

  var h3 = renderToolCard(3, "Cuanto te cuesta no hacer nada", "Cada mes que pasa sin atacar la deuda, los intereses siguen corriendo.",
    '<div style="margin-top:8px;"><div class="grid">'
    + '<div style="text-align:center;padding:18px;background:rgba(255,78,114,.08);border:1px solid rgba(255,78,114,.2);border-radius:16px;"><div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Pagas de interes POR MES</div><div style="font-size:44px;font-weight:900;color:#ff4e72;line-height:1;letter-spacing:-2px;">' + fmt(Math.round(intMes)) + '</div></div>'
    + '<div style="text-align:center;padding:18px;background:rgba(255,211,111,.08);border:1px solid rgba(255,211,111,.2);border-radius:16px;"><div style="font-size:14px;color:#8390b5;margin-bottom:8px;">En UN ANO si no actuas</div><div style="font-size:44px;font-weight:900;color:#ffd36f;line-height:1;letter-spacing:-2px;">' + fmt(Math.round(intMes * 12)) + '</div></div>'
    + '</div></div>', true);

  return h1 + h2 + h3;
}

// ---- Plan 3 ----
function renderHerramientasPlan3() {
  var diag  = _diag();
  // c1 is always true: pressure diagnostic is derived from debt data, no user action required
  var c1 = true;
  var c2 = accionesRecomendadasCompletadas(diag);
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

  var h2 = renderToolCard(2, "Acciones recomendadas para tu situación", "Basadas en tu diagnóstico actual.",
    renderAccionesRecomendadasHtml(diag), c2);

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
  var diag  = _diag();
  var c1 = accionesRecomendadasCompletadas(diag);
  var gastos     = _st().gastos || {};
  var flujoBase  = diag ? diag.fin.flujoLibre : 0;
  var maxSlider  = Math.max(2000, typeof getTotalMonthlyExpenses === "function"
    ? getTotalMonthlyExpenses()
    : Object.values(gastos).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0));
  var flujoColor = flujoBase >= 0 ? "#34ffaf" : "#ff4e72";

  var h1 = renderToolCard(1, "Acciones recomendadas para tu situación", "Basadas en tu diagnóstico actual.",
    renderAccionesRecomendadasHtml(diag), c1);

  var h2 = renderToolCard(2, "Cuanto podrias liberar por mes",
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

  return h1 + h2;
}

// ---- Plan 5 ----
function renderHerramientasPlan5() {
  var diag  = _diag();
  var herr  = _herr();
  var atr   = herr.atrasos || {};
  var deudas = _st().deudas || [];
  var EATR = [
    { v: "sin_gestionar", l: "Sin gestionar" },
    { v: "en_negociacion",l: "En proceso de negociacion" },
    { v: "plan_pagos",    l: "Acorde un plan de pagos" },
    { v: "regularizada",  l: "Regularizada" },
  ];

  var h1 = renderToolCard(1, "Acciones recomendadas para tu situación", "Basadas en tu diagnóstico actual.",
    renderAccionesRecomendadasHtml(diag),
    accionesRecomendadasCompletadas(diag));

  if (!deudas.length) return h1;

  var h2 = renderToolCard(2, "Estado de tus atrasos reportados", "Actualiza el estado de cada deuda a medida que avanzas.",
    '<div style="margin-top:8px;">'
    + deudas.map(function(d, i) {
        var key = d.acreedor || d.tipo || "d" + (i + 1);
        var est = atr[key] || "sin_gestionar";
        return '<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
          + '<div style="font-size:17px;font-weight:800;margin-bottom:8px;">' + (d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1)) + '</div>'
          + '<select data-atraso-key="' + key + '">' + EATR.map(function(e) { return '<option value="' + e.v + '"' + (est === e.v ? " selected" : "") + '>' + e.l + '</option>'; }).join("") + '</select>'
          + (est === "regularizada" ? '<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Excelente! Eso mejora directamente tu perfil crediticio.</div>' : "")
          + '</div>';
      }).join("")
    + '</div>', Object.keys(atr).length > 0);

  return h1 + h2;
}

// =============================================================================
// MODAL PREMIUM — legacy redirect (Sprint 14.0c)
// Opens ★ Mi Plan Plus tab instead of legacy premium modal.
// =============================================================================
function abrirModalPremium() {
  if (typeof switchTab === "function") {
    switchTab("plus");
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
// SEO IA — virgin onboarding (source=seo_ia, no result params)
// =============================================================================
function ensureSeoIaOnboardingState() {
  var st = _st();
  if (st.seo_ia_onboarding) return st.seo_ia_onboarding;
  var resp = {};
  var i;
  for (i = 1; i <= 10; i++) resp["p" + i] = null;
  st.seo_ia_onboarding = {
    phase: "intro",
    surveyGroup: 1,
    respuestas: resp,
    started_at: new Date().toISOString(),
  };
  return st.seo_ia_onboarding;
}

function seoIaNormalizeOnboardingPhase(ob) {
  if (!ob) return;
  if (ob.phase === "finish") ob.phase = "legals";
  if (ob.phase === "survey" && !ob.surveyGroup) ob.surveyGroup = 1;
}

function seoIaSurveyGroupQuestions(group) {
  var start = ((group || 1) - 1) * 2 + 1;
  return [start, start + 1];
}

function seoIaSurveyGroupIsComplete(ob, group) {
  if (!ob || !ob.respuestas) return false;
  var qs = seoIaSurveyGroupQuestions(group);
  var i;
  for (i = 0; i < qs.length; i++) {
    var v = ob.respuestas["p" + qs[i]];
    if (v !== "A" && v !== "B" && v !== "C" && v !== "D") return false;
  }
  return true;
}

function seoIaSurveyIsComplete(ob) {
  if (!ob || !ob.respuestas) return false;
  var i;
  for (i = 1; i <= 10; i++) {
    var v = ob.respuestas["p" + i];
    if (v !== "A" && v !== "B" && v !== "C" && v !== "D") return false;
  }
  return true;
}

function shouldShowSeoIaOnboarding() {
  var st = _st();
  if (st && st.diag && st.step === 3) return false;
  return typeof isSeoIaEntry === "function"
    && isSeoIaEntry()
    && typeof hasResultParams === "function"
    && !hasResultParams();
}

function shouldShowSeoIaVirginLanding() {
  return shouldShowSeoIaOnboarding();
}

function shouldBypassMiPlanConsentForSeoIa() {
  return typeof shouldShowSeoIaOnboarding === "function" && shouldShowSeoIaOnboarding();
}

function renderSeoIaOnboardingHeader() {
  return [
    '<div style="text-align:center;margin-bottom:28px;">',
      '<div style="font-size:13px;font-weight:700;letter-spacing:.12em;color:#5b7cff;text-transform:uppercase;margin-bottom:8px;">',
        'Credizona · Mi Plan',
      '</div>',
      '<div style="font-size:12px;color:#8390b5;">Diagnóstico financiero orientativo</div>',
    '</div>',
  ].join("");
}

function renderSeoIaIntroBlock() {
  return [
    '<div style="margin-bottom:28px;">',
      '<div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#40d7ff;">',
        '🎯 DIAGNÓSTICO FINANCIERO GRATIS',
      '</div>',
    '</div>',

    '<h1 class="seo-ia-h1" style="font-size:26px;font-weight:900;line-height:1.2;letter-spacing:normal;',
      'word-break:normal;overflow-wrap:break-word;color:#fff;margin:0 0 28px;">',
      'Descubrí qué te está frenando para acceder a crédito',
    '</h1>',

    '<div style="font-size:15px;color:rgba(255,255,255,.7);line-height:1.7;margin-bottom:28px;',
      'padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;">',
      '<span style="margin-right:8px;">ℹ️</span>',
      'Mi Plan es una herramienta de diagnóstico orientativo basada en la información que ingresás. ',
      'No es una financiera, un banco ni un reporte oficial de Clearing, Equifax o BCU.',
    '</div>',

    '<p style="font-size:16px;line-height:1.65;color:rgba(255,255,255,.78);margin:0 0 28px;">',
      'Respondé unas preguntas simples sobre tu situación financiera actual. En base a tus respuestas, ',
      'Mi Plan analiza tu perfil y te muestra un camino concreto para mejorar tus chances de acceder a financiamiento.',
    '</p>',

    '<div style="background:rgba(91,124,255,.08);border:1px solid rgba(91,124,255,.22);',
      'border-radius:16px;padding:20px 18px;margin-bottom:28px;">',
      '<div style="font-size:15px;line-height:1.8;color:rgba(255,255,255,.88);">',
        '✅ Resultado inmediato<br>',
        '✅ Sin compromiso<br>',
        '✅ No implica aprobación de crédito<br>',
        '✅ Pensado para personas que quieren ordenar su situación antes de volver a pedir un préstamo',
      '</div>',
    '</div>',

    '<div style="background:rgba(64,215,255,.07);border:1px solid rgba(64,215,255,.22);border-radius:16px;',
      'padding:20px 20px;margin-bottom:32px;">',
      '<div style="font-size:16px;font-weight:800;color:#40d7ff;margin-bottom:12px;">🤝 "Mi Plan" es gratuito.</div>',
      '<div style="font-size:15px;color:rgba(255,255,255,.75);line-height:1.65;">',
        'Lo creamos para ayudarte a entender tu situación financiera real y que veas un camino de salida. No tiene costo.',
      '</div>',
    '</div>',

    '<button type="button" id="btn-seo-ia-intro-start" style="',
      'width:100%;border:none;border-radius:16px;padding:18px 24px;',
      'font-size:17px;font-weight:800;color:#fff;cursor:pointer;',
      'background:linear-gradient(135deg,#5b7cff 0%,#40d7ff 100%);',
      'box-shadow:0 4px 24px rgba(64,215,255,.35);line-height:1.3;',
    '">Comenzar diagnóstico</button>',
  ].join("");
}

function renderSeoIaSurveyQuestionCard(qIndex) {
  var questions = typeof SEO_IA_QUESTIONS !== "undefined" ? SEO_IA_QUESTIONS : [];
  var q = questions[qIndex - 1];
  if (!q) return "";

  var st = _st();
  var ob = st.seo_ia_onboarding || {};
  var selected = ob.respuestas ? ob.respuestas["p" + qIndex] : null;
  var letters = ["A", "B", "C", "D"];
  var optsHtml = letters.map(function(letter) {
    var isSel = selected === letter;
    return [
      '<button type="button" data-seo-survey-opt="' + letter + '" data-seo-q="' + qIndex + '" style="',
        'display:block;width:100%;text-align:left;border-radius:14px;padding:16px 18px;margin-bottom:10px;cursor:pointer;',
        'border:1px solid ' + (isSel ? 'rgba(64,215,255,.55)' : 'rgba(255,255,255,.09)') + ';',
        'background:' + (isSel ? 'rgba(64,215,255,.12)' : 'rgba(255,255,255,.04)') + ';',
        'color:rgba(255,255,255,.9);font-size:15px;line-height:1.5;',
      '">',
        '<span style="display:inline-block;font-weight:800;color:#40d7ff;margin-right:10px;">' + letter + '.</span>',
        q.options[letter],
      '</button>',
    ].join("");
  }).join("");

  return [
    '<div class="seo-ia-q-card" data-seo-q-card="' + qIndex + '" style="',
      'background:rgba(91,124,255,.06);border:1px solid rgba(91,124,255,.18);',
      'border-radius:16px;padding:20px 18px;margin-bottom:20px;',
    '">',
      '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#40d7ff;margin-bottom:8px;">',
        'Pregunta ' + qIndex + ' de 10',
      '</div>',
      '<div style="font-size:13px;color:#8390b5;margin-bottom:8px;">' + q.theme + '</div>',
      '<h2 style="font-size:20px;font-weight:800;line-height:1.35;color:#fff;margin:0 0 18px;">' + q.text + '</h2>',
      '<div class="seo-ia-survey-options">' + optsHtml + '</div>',
    '</div>',
  ].join("");
}

function renderSeoIaSurveyProgressBar(group) {
  var g = group || 1;
  var pct = Math.round((g / 5) * 100);
  return [
    '<div id="seo-ia-survey-progress" style="margin-bottom:28px;">',
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
        '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#40d7ff;">',
          'Bloque ' + g + ' de 5',
        '</div>',
        '<div style="font-size:12px;color:#8390b5;">' + pct + '%</div>',
      '</div>',
      '<div style="height:8px;background:rgba(255,255,255,.1);border-radius:999px;overflow:hidden;">',
        '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#5b7cff 0%,#40d7ff 100%);',
          'border-radius:999px;box-shadow:0 0 12px rgba(64,215,255,.35);transition:width .25s ease;"></div>',
      '</div>',
    '</div>',
  ].join("");
}

function renderSeoIaSurveyGroupScreen(group) {
  var g = group || 1;
  var qs = seoIaSurveyGroupQuestions(g);
  var isLast = g === 5;
  var btnLabel = isLast ? "Ver mis legales" : "Siguiente";

  return [
    renderSeoIaSurveyProgressBar(g),
    renderSeoIaSurveyQuestionCard(qs[0]),
    renderSeoIaSurveyQuestionCard(qs[1]),
    '<button type="button" id="btn-seo-ia-survey-next" disabled style="',
      'width:100%;border:none;border-radius:16px;padding:18px 24px;margin-top:8px;',
      'font-size:17px;font-weight:800;color:#fff;cursor:pointer;',
      'background:linear-gradient(135deg,#5b7cff 0%,#40d7ff 100%);',
      'box-shadow:0 4px 24px rgba(64,215,255,.35);line-height:1.3;opacity:.45;',
    '">' + btnLabel + '</button>',
  ].join("");
}

function renderSeoIaSurveyQuestion(qIndex) {
  if (qIndex != null && qIndex >= 1 && qIndex <= 10) {
    return renderSeoIaSurveyQuestionCard(qIndex);
  }
  var ob = _st().seo_ia_onboarding || {};
  return renderSeoIaSurveyGroupScreen(ob.surveyGroup || 1);
}

function renderSeoIaSurveyLegalsAndCta() {
  return [
    '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);">',
      '<h2 style="font-size:20px;font-weight:800;line-height:1.35;color:#fff;margin:0 0 12px;">',
        'Último paso antes de tu diagnóstico',
      '</h2>',
      '<p style="font-size:15px;color:rgba(255,255,255,.75);line-height:1.65;margin:0 0 24px;">',
        'Aceptá los términos para ver tu resultado orientativo.',
      '</p>',
      renderMiPlanLegalCheckboxes({ idTc: "chk-seo-ia-tc", idPrivacy: "chk-seo-ia-privacy" }),
      '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:24px;',
        'padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;">',
        'El diagnóstico, los scores y las proyecciones son orientativos. ',
        'No garantizan aprobación de crédito ni modifican registros externos.',
      '</div>',
      '<button type="button" id="btn-seo-ia-diagnosis" disabled style="',
        'width:100%;border:none;border-radius:16px;padding:18px 24px;',
        'font-size:17px;font-weight:800;color:#fff;cursor:pointer;',
        'background:linear-gradient(135deg,#5b7cff 0%,#40d7ff 100%);',
        'box-shadow:0 4px 24px rgba(64,215,255,.35);line-height:1.3;opacity:.45;',
      '">Ver mi diagnóstico</button>',
    '</div>',
  ].join("");
}

function renderSeoIaOnboarding() {
  ensureSeoIaOnboardingState();
  var st = _st();
  var ob = st.seo_ia_onboarding;
  var body = "";

  seoIaNormalizeOnboardingPhase(ob);

  if (ob.phase === "intro") {
    body = renderSeoIaIntroBlock();
  } else if (ob.phase === "survey") {
    body = renderSeoIaSurveyGroupScreen(ob.surveyGroup || 1);
  } else if (ob.phase === "legals") {
    body = renderSeoIaSurveyLegalsAndCta();
  }

  return [
    '<div id="cz-seo-ia-onboarding" style="',
      'min-height:60vh;padding:16px 8px calc(80px + env(safe-area-inset-bottom));',
      'max-width:420px;margin:0 auto;',
    '">',
    renderSeoIaOnboardingHeader(),
    body,
    '</div>',
  ].join("");
}

function renderSeoIaVirginLanding() {
  return renderSeoIaOnboarding();
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
  // SEO IA onboarding integrates legals inline — skip separate gate for that path.
  if (typeof shouldShowMiPlanConsent === "function"
    && shouldShowMiPlanConsent()
    && !(typeof shouldBypassMiPlanConsentForSeoIa === "function" && shouldBypassMiPlanConsentForSeoIa())) {
    main.innerHTML = '<div class="fade">' + renderMiPlanConsentScreen() + '</div>';
    // Fire tracking event only once per consent screen view in this session
    if (!st._consentScreenTracked) {
      st._consentScreenTracked = true;
      trackEvent(CZ_EVENT_NAMES.MIPLAN_CONSENT_SCREEN_VIEWED, {
        entry_channel: (typeof detectEntryChannel === "function") ? detectEntryChannel() : "direct",
      });
    }
    return;
  }

  // SEO IA virgin onboarding — after external consent, before step routing
  if (typeof shouldShowSeoIaOnboarding === "function" && shouldShowSeoIaOnboarding()) {
    main.innerHTML = '<div class="fade">' + renderSeoIaOnboarding() + '</div>';
    if (!st._seoVirginLandingTracked) {
      st._seoVirginLandingTracked = true;
      if (typeof trackEvent === "function" && typeof CZ_EVENT_NAMES !== "undefined") {
        trackEvent(
          CZ_EVENT_NAMES.MIPLAN_VIRGIN_LANDING_VIEW,
          typeof getSeoIaTrackingPayload === "function" ? getSeoIaTrackingPayload() : {}
        );
      }
    }
    var _seoBar = document.getElementById("sticky-bar");
    if (_seoBar) _seoBar.style.display = "none";
    if (st.seo_ia_onboarding) {
      if (st.seo_ia_onboarding.phase === "survey"
        && typeof updateSeoIaSurveyNextState === "function") {
        updateSeoIaSurveyNextState();
      } else if (st.seo_ia_onboarding.phase === "legals"
        && typeof updateSeoIaDiagnosisCtaState === "function") {
        updateSeoIaDiagnosisCtaState();
      }
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
      trackEvent(CZ_EVENT_NAMES.GASTOS_MISSING_WARNING_SHOWN, {
        has_gastos: false,
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
      if (typeof showToast === "function") {
        showToast("✓ Diagnóstico guardado<br>Podés volver cuando quieras.", 5000);
      }
      trackEvent(CZ_EVENT_NAMES.DASHBOARD_TOAST_SHOWN, {
        source: "dashboard_first_view",
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
      trackEvent(CZ_EVENT_NAMES.HIDDEN_FACTOR_CTA_SHOWN, {
        cta_source: "hidden_factor",
      });
    }
  }

  updateSticky();
}

window.CredizonaUI = {
  renderAll: renderAll,
  renderTab: renderTab,
  expandAccionesRecomendadas: function() { _accionesRecomExpand = true; },
  toggleDeudasHistorial: function() {
    _deudasHistorialExpand = !_deudasHistorialExpand;
    renderTab();
  },
  focusDeudaQuickEditInput: focusDeudaQuickEditInput,
  renderDeudaCard: renderDeudaCard,
  actualizarMetrics: actualizarMetrics,
  bindTabEvents: bindTabEvents,
  abrirModalPremium: abrirModalPremium,
  abrirModalInformeCompleto: abrirModalPremium,
  mostrarEvaluacion: mostrarEvaluacion,
  updateGastosTotalDisplay: updateGastosTotalDisplay,
  updateCustomExpenseClassificationUI: updateCustomExpenseClassificationUI,
  getRetryCtaState: getRetryCtaState,
  renderRetryCta: renderRetryCta,
};

window.renderAll = renderAll;
