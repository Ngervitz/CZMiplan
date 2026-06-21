// =============================================================================
// ui.js — Funciones de renderizado
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js
// =============================================================================

// --- Accesores de estado ---
function _st()    { return window.CZState || {}; }
function _diag()  { return _st().diag; }
function _herr()  { return _st().herr || {}; }

function _rejectionCopy(rejectionVersion, neutralVersion) {
  return (window.CZ_ENTRY_CONTEXT &&
          window.CZ_ENTRY_CONTEXT.hasRejectionContext)
    ? rejectionVersion
    : neutralVersion;
}

function _feedbackCategoryLabel(cat) {
  if (cat === "Por qu\u00e9 me rechazaron") {
    return _rejectionCopy("Por qu\u00e9 me rechazaron", "Qu\u00e9 afecta mi perfil crediticio");
  }
  return cat;
}

// =============================================================================
// SPRINT 10 — Mi Plan in-app consent screen
// Shown before any diagnosis, dashboard, score, horizon, or recommendation.
// Separate from Credizona funnel consent (handled by consent.js / initConsent()).
// Uses existing dark visual style only — no new CSS classes.
// =============================================================================
function renderMiPlanConsentScreen() {
  document.body.style.backgroundImage = "url('assets/montevideo.jpg')";
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center center";
  document.body.style.backgroundAttachment = "scroll";

  if (!document.getElementById("miplan-legal-overlay")) {
    var legalOverlay = document.createElement("div");
    legalOverlay.id = "miplan-legal-overlay";
    legalOverlay.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none;will-change:transform,opacity;backface-visibility:hidden;background:linear-gradient(to bottom,rgba(10,20,40,0.90) 0%,rgba(10,20,40,0.62) 42%,rgba(10,20,40,0.94) 100%)";
    document.body.prepend(legalOverlay);
  }

  var legalCardStyle = "background:rgba(8,18,36,0.88);color:#ffffff;"
    + "border:1px solid rgba(255,255,255,0.16);border-radius:24px;"
    + "box-shadow:0 24px 80px rgba(0,0,0,0.32);backdrop-filter:blur(10px);"
    + "-webkit-backdrop-filter:blur(10px);padding:24px 20px;";

  return '<div style="position:relative;z-index:1;padding:8px 0;">'
    + '<div style="' + legalCardStyle + '">'
    + '<div style="font-size:26px;font-weight:900;line-height:1.2;margin-bottom:20px;">Antes de ver tu diagnóstico</div>'
    + '<div style="font-size:16px;color:rgba(255,255,255,.82);line-height:1.7;margin-bottom:28px;">'
    + 'Mi Plan es una herramienta de diagnóstico orientativo basada en la información que ingresás. '
    + 'No es una financiera, un banco ni un reporte oficial de Clearing, Equifax o BCU.'
    + '</div>'

    // Sprint 10.1 — free education banner (consent screen only)
    + '<div style="background:rgba(64,215,255,.12);border:1px solid rgba(64,215,255,.28);border-radius:16px;padding:18px 20px;margin-bottom:24px;">'
    + '<div style="font-size:16px;font-weight:800;color:#40d7ff;margin-bottom:10px;">🤝 "Mi Plan" es gratuito.</div>'
    + '<div style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.65;">'
    + 'Lo creamos para ayudarte a entender tu situación financiera real y que veas un camino de salida. '
    + 'No tiene costo. Al final del diagnóstico nos gustaría saber qué te fue útil y qué te faltó.'
    + '</div>'
    + '</div>'

    + renderMiPlanLegalCheckboxes({ idTc: "chk-miplan-tc", idPrivacy: "chk-miplan-privacy" })

    // Disclaimer
    + '<div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.65;margin-bottom:24px;'
    + 'padding:14px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;">'
    + 'El diagnóstico, los scores y las proyecciones son orientativos. '
    + 'No garantizan aprobación de crédito ni modifican registros externos.'
    + '</div>'

    // Accept button — disabled until both boxes are checked
    + '<button class="btn btn-primary" id="btn-miplan-consent-accept" disabled '
    + 'style="width:100%;height:64px;font-size:19px;opacity:.45;transition:opacity .2s;" '
    + 'onclick="this.disabled&&event.preventDefault();">Ver mi diagnóstico</button>'
    + '</div>'
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

  // step 0: basic profile + income (SEO virgin / missing profile)
  if (typeof needsIncomeStep === "function" && needsIncomeStep(st)) {
    if (bar) { bar.style.display = ""; bar.classList.remove("dashboard"); }
    lbl.textContent  = "Tu perfil básico";
    stEl.textContent = "Completá tus datos de contacto e ingreso para continuar.";
    cta.textContent  = "Continuar";
    cta.className    = "sticky-btn";
    return;
  }

  // step 0: SEGMENTO 1 keeps its own sticky; diagnosis/bridge screens have inline CTAs
  if (step === 0 && SEGMENTO === 1) {
    if (bar) { bar.style.display = ""; bar.classList.remove("dashboard"); }
    lbl.textContent  = "Tu situación inicial";
    stEl.textContent = "Analizamos las señales principales de tu perfil.";
    cta.textContent  = "Ver evaluación";
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
    stEl.textContent = "Identificamos dónde está hoy la mayor presión financiera.";
    cta.textContent  = "Continuar análisis";
    cta.className    = "sticky-btn";
  } else if (step === 2) {
    // step 2 = gastos — financial context
    if (bar) bar.classList.remove("dashboard");
    lbl.textContent  = "Tus gastos mensuales";
    stEl.textContent = "Completamos el contexto real de tu flujo.";
    cta.textContent  = "Ver diagnóstico completo";
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
function renderStepPills(cur, total, customLabels) {
  // Flow: Ingreso (seg 2/3) or Situacion inicial (seg 1) → Deudas → Gastos
  var labels = customLabels || (SEGMENTO === 1
    ? ["Situación inicial", "Deudas", "Gastos"]
    : ["Perfil", "Deudas", "Gastos"]);
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

  if (r.p1 === "C" || r.p1 === "D") signals.push({ i: "⚠️", t: "Sin claridad financiera",       d: "No tenés claro cuánto entra y sale cada mes. Eso hace casi imposible priorizar correctamente." });
  if (r.p6 === "D")                  signals.push({ i: "⚠️", t: "Préstamos informales detectados", d: "Los préstamos informales son los que más rápido destruyen el flujo mensual." });
  if (r.p5 === "D")                  signals.push({ i: "⚠️", t: "Estrés financiero máximo",        d: "Tu nivel de estrés financiero es máximo. Eso afecta directamente las decisiones que tomás." });
  if (r.p7 === "C" || r.p7 === "D") signals.push({ i: "⚠️", t: "Deudas sin plan de salida",      d: "No sabés cuánto tiempo te llevaría salir de tus deudas. Esa falta de claridad es una señal importante." });
  if (r.p8 === "A")                  good.push({ i: "✅", t: "Ya tomaste acciones recientes",     d: "Eso es una ventaja real. El sistema valora que ya estés haciendo algo al respecto." });
  if (r.p3 === "A" || r.p3 === "B") good.push({ i: "✅", t: "Responsabilidad financiera alta",   d: "Tu nivel de responsabilidad es bueno. Con un plan claro, eso se traduce en resultados." });
  if (signals.length === 0)          signals.push({ i: "⚠️", t: "Posible carga mensual alta",     d: "Puede haber demasiados pagos compitiendo con tus ingresos. Necesitamos tus datos para confirmarlo." });

  return '<div class="badge"><div class="dot"></div>Tu evaluación inicial está lista</div>'
    + '<h1>Ya analizamos tus respuestas.<br><span class="gradient">Ahora veamos el plan.</span></h1>'
    + '<div class="lead">Encontramos factores que podrían estar afectando hoy tu perfil financiero según la información declarada.</div>'
    + '<div class="sub">La idea no es pedirte otro formulario de cero. Primero te mostramos una lectura inicial. Después, si querés más precisión, completás gastos y deudas.</div>'
    + '<div class="btn-wrap" style="margin-bottom:20px;">'
    + '<button class="btn btn-primary" id="btn-ver-evaluacion">Ver mi evaluación inicial</button>'
    + '<button class="btn btn-secondary" id="btn-analisis-profundo">Completar análisis profundo</button>'
    + '</div>'
    + '<div class="disclaimer">No afecta futuras solicitudes. No es un score crediticio oficial.</div>'
    + '<div id="eval-card" class="hidden" style="margin-top:26px;">'
    + '<div class="card">'
    + '<div class="card-top"><div class="card-label">Evaluación inicial</div>'
    + (signals.length > 0 ? '<div class="alert-badge">ATENCION</div>' : '<div class="alert-badge" style="border-color:rgba(52,255,175,.35);color:#34ffaf;">TODO BIEN</div>')
    + '</div>'
    + '<div class="card-title">Perfil con señales de presión financiera</div>'
    + signals.map(function(s) {
        return '<div class="signal"><div class="signal-icon">' + s.i + '</div><div><div class="signal-title">' + s.t + '</div><div class="signal-text">' + s.d + '</div></div></div>';
      }).join("")
    + good.map(function(s) {
        return '<div class="signal" style="border-color:rgba(52,255,175,.2);background:rgba(52,255,175,.05);"><div class="signal-icon">' + s.i + '</div><div><div class="signal-title">' + s.t + '</div><div class="signal-text">' + s.d + '</div></div></div>';
      }).join("")
    + '<div class="good-news">Con algunos ajustes podés mejorar tu situación declarada antes de una nueva evaluación.</div>'
    + '<div style="margin-top:26px;"><button class="btn btn-primary" id="btn-ver-plan-personalizado">Ver mi plan personalizado</button></div>'
    + '</div>'
    + '<div class="card">'
    + '<div class="section-title">Para darte un diagnóstico más preciso necesitamos 2 minutos más.</div>'
    + '<div class="section-text">No necesitás montos exactos. Una estimación alcanza para detectar qué deuda te está dañando más.</div>'
    + '<div class="steps">'
    + [["1","Deudas","Identificamos dónde está hoy la mayor presión financiera."],["2","Gastos","Completamos el contexto real de tu flujo."],["3","Diagnóstico","Interpretación completa de tu situación financiera actual."]]
      .map(function(x) { return '<div class="step"><div class="step-num">' + x[0] + '</div><div class="step-title">' + x[1] + '</div><div class="step-text">' + x[2] + '</div></div>'; }).join("")
    + '</div></div></div>';
}

// =============================================================================
// STEP 0 — BASIC PROFILE + INCOME (required when not supplied via URL / restore)
// =============================================================================
function _profileFieldError(id) {
  return '<div id="' + id + '" style="display:none;margin-top:8px;font-size:13px;color:#ff4e72;line-height:1.5;"></div>';
}

function _profilePrefillName(st) {
  if (st.declared_nombre) return st.declared_nombre;
  if (typeof PRE !== "undefined" && PRE.nombre
      && !(typeof isDemoPreloadedName === "function" && isDemoPreloadedName(PRE.nombre))) {
    return PRE.nombre;
  }
  return "";
}

function _profilePrefillEmail(st) {
  if (st.user_email) return st.user_email;
  if (typeof PRE !== "undefined" && PRE.email
      && !(typeof isDemoPreloadedEmail === "function" && isDemoPreloadedEmail(PRE.email))) {
    return PRE.email;
  }
  return "";
}

function _profileFieldInput(type, id, attrs) {
  attrs = attrs || {};
  var extraStyle = attrs.style || "";
  var autocomplete = attrs.autocomplete ? (' autocomplete="' + attrs.autocomplete + '"') : "";
  var placeholder = attrs.placeholder ? (' placeholder="' + attrs.placeholder + '"') : "";
  var value = attrs.value != null ? (' value="' + attrs.value + '"') : "";
  return '<input type="' + type + '" id="' + id + '" class="profile-field-input"'
    + autocomplete + placeholder + value
    + (extraStyle ? (' style="' + extraStyle + '"') : "")
    + "/>";
}

function renderIngreso() {
  var st = _st();
  var incomeVal = st.declared_ingreso != null ? st.declared_ingreso : "";
  var nameVal = _profilePrefillName(st);
  var emailVal = _profilePrefillEmail(st);
  var laboralSel = st.declared_laboral || (typeof PRE !== "undefined" ? PRE.laboral : "") || "";
  var laboralOpts = typeof BASIC_PROFILE_LABORAL_OPTIONS !== "undefined"
    ? BASIC_PROFILE_LABORAL_OPTIONS
    : [
        { v: "relacion_dependencia", l: "Empleado en relación de dependencia" },
        { v: "monotributista", l: "Independiente / cuentapropista" },
        { v: "jubilado", l: "Jubilado / pensionista" },
        { v: "desempleado", l: "Sin ingresos fijos" },
      ];

  var html = renderStepPills(0, 3, ["Perfil", "Deudas", "Gastos"]);
  html += '<div class="card">'
    + '<div class="section-title">Contanos un poco sobre vos</div>'
    + '<div class="section-text">Con estos datos preparamos tu diagnóstico y te enviamos una copia por email.</div>'

    + '<div style="margin-top:20px;">'
    + '<label style="display:block;font-size:14px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:8px;">¿Cómo te llamás?</label>'
    + _profileFieldInput("text", "inp-profile-nombre", {
        autocomplete: "name",
        placeholder: "Ej: Nicolás",
        value: typeof _plusEsc === "function" ? _plusEsc(nameVal || "") : (nameVal || ""),
      })
    + _profileFieldError("profile-nombre-error")
    + '</div>'

    + '<div style="margin-top:18px;">'
    + '<label style="display:block;font-size:14px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:8px;">¿A qué email te enviamos tu diagnóstico?</label>'
    + _profileFieldInput("email", "inp-profile-email", {
        autocomplete: "email",
        placeholder: "Ej: tu@email.com",
        value: typeof _plusEsc === "function" ? _plusEsc(emailVal || "") : (emailVal || ""),
      })
    + '<div style="margin-top:8px;font-size:13px;color:#8390b5;line-height:1.55;">Te enviaremos una copia de tu diagnóstico y futuras actualizaciones.</div>'
    + _profileFieldError("profile-email-error")
    + '</div>'

    + '<div style="margin-top:18px;">'
    + '<label style="display:block;font-size:14px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:8px;">¿Cuánto dinero te entra aproximadamente por mes?</label>'
    + '<div style="position:relative;max-width:100%;">'
    + '<span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;pointer-events:none;">$</span>'
    + _profileFieldInput("number", "inp-ingreso-mensual", {
        placeholder: "Ej: 65.000",
        value: incomeVal,
        style: "padding-left:36px;",
      })
    + '</div>'
    + '<div style="margin-top:8px;font-size:13px;color:#8390b5;line-height:1.55;">Incluí sueldo, changas, comisiones, ventas, ayuda familiar u otras entradas de dinero. Si varía, usá un estimado promedio.</div>'
    + _profileFieldError("profile-ingreso-error")
    + '</div>'

    + '<div style="margin-top:18px;">'
    + '<label style="display:block;font-size:14px;font-weight:700;color:rgba(255,255,255,.85);margin-bottom:10px;">¿Cuál es tu situación laboral?</label>'
    + '<div style="display:flex;flex-direction:column;gap:8px;">'
    + laboralOpts.map(function(o) {
        var active = laboralSel === o.v;
        return '<label style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:12px;border:1.5px solid '
          + (active ? "#40d7ff" : "rgba(255,255,255,.1)") + ';background:'
          + (active ? "rgba(64,215,255,.08)" : "transparent") + ';cursor:pointer;width:100%;">'
          + '<input type="radio" name="profile-laboral" value="' + o.v + '"'
          + (active ? " checked" : "")
          + ' style="margin-top:3px;accent-color:#40d7ff;"/>'
          + '<span style="font-size:15px;font-weight:' + (active ? "800" : "600") + ';color:'
          + (active ? "#40d7ff" : "rgba(255,255,255,.78)") + ';line-height:1.45;">' + o.l + "</span>"
          + "</label>";
      }).join("")
    + '</div>'
    + _profileFieldError("profile-laboral-error")
    + '</div>'

    + '<button type="button" class="btn btn-primary" style="height:68px;font-size:20px;margin-top:24px;width:100%;" id="btn-continuar-ingreso">Continuar</button>'
    + '</div>';
  return html;
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

function _renderVerticalProfilingChipGroup(field, opts, curValue) {
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">'
    + opts.map(function(o) {
        var active = curValue === o.v;
        return '<button type="button"'
          + ' data-vertical-field="' + field + '"'
          + ' data-vertical-val="' + String(o.v) + '"'
          + ' style="padding:8px 14px;border-radius:999px;border:1.5px solid '
          + (active ? "rgba(64,215,255,.5)" : "rgba(255,255,255,.1)") + ";background:"
          + (active ? "rgba(64,215,255,.08)" : "transparent") + ";color:"
          + (active ? "#40d7ff" : "rgba(255,255,255,.65)") + ";font-size:13px;font-weight:"
          + (active ? "700" : "500") + ';cursor:pointer;">'
          + o.l + "</button>";
      }).join("")
    + "</div>";
}

function renderVerticalProfilingBlock() {
  var st = _st();
  var opened = !!st.vertical_profiling_opened;
  var html = '<div id="vertical-profiling-block" style="margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);">'
    + '<button type="button" id="btn-vertical-profiling-toggle" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;padding:0;cursor:pointer;text-align:left;">'
    + '<span style="font-size:12px;color:#8390b5;line-height:1;">' + (opened ? "▲" : "▼") + "</span>"
    + '<span style="font-size:14px;font-weight:700;color:rgba(255,255,255,.75);">Personalizá tus recomendaciones (opcional)</span>'
    + "</button>";

  if (opened) {
    html += '<div id="vertical-profiling-body" style="margin-top:14px;">'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.6;margin-bottom:18px;">'
      + "Ayudanos a entender mejor tu situación para mostrarte herramientas, beneficios y oportunidades relevantes."
      + "</div>"
      + '<div style="margin-bottom:16px;">'
      + '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.82);margin-bottom:4px;">¿Cómo es tu vivienda?</div>'
      + _renderVerticalProfilingChipGroup("vertical_housing_status", [
          { v: "rent", l: "Alquilo" },
          { v: "mortgage", l: "Hipoteca" },
          { v: "own_family", l: "Propia/Familiar" },
        ], st.vertical_housing_status || null)
      + "</div>"
      + '<div style="margin-bottom:16px;">'
      + '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.82);margin-bottom:4px;">¿Tenés vehículo propio?</div>'
      + _renderVerticalProfilingChipGroup("vertical_has_vehicle", [
          { v: true, l: "Sí" },
          { v: false, l: "No" },
        ], st.vertical_has_vehicle !== undefined ? st.vertical_has_vehicle : null)
      + "</div>"
      + '<div style="margin-bottom:16px;">'
      + '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.82);margin-bottom:4px;">¿Pagás mutualista o seguro médico?</div>'
      + _renderVerticalProfilingChipGroup("vertical_has_health_coverage", [
          { v: true, l: "Sí" },
          { v: false, l: "No" },
        ], st.vertical_has_health_coverage !== undefined ? st.vertical_has_health_coverage : null)
      + "</div>"
      + '<div style="margin-bottom:4px;">'
      + '<div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.82);margin-bottom:4px;">¿Pagás colegio privado o universidad?</div>'
      + _renderVerticalProfilingChipGroup("vertical_has_education_expenses", [
          { v: true, l: "Sí" },
          { v: false, l: "No" },
        ], st.vertical_has_education_expenses !== undefined ? st.vertical_has_education_expenses : null)
      + "</div>"
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

  var html = SEGMENTO === 1
    ? renderStepPills(2, 3)
    : renderStepPills(2, 3, ["Perfil", "Deudas", "Gastos"]);

  html += '<div style="font-size:15px;color:#8390b5;line-height:1.6;margin-bottom:20px;padding:0 4px;">'
    + 'El banco ya tiene información sobre vos. Este diagnóstico te ayuda a entenderla.'
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
    + renderVerticalProfilingBlock()
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
function _deudaSaveFeedbackMessage(feedback) {
  if (!feedback) return "";
  return feedback.mode === "edited"
    ? "Cambios guardados correctamente"
    : "Deuda agregada correctamente";
}

function _deudaSaveConfirmedLabel(feedback) {
  if (!feedback) return "";
  return feedback.mode === "edited"
    ? "Cambios guardados ✓"
    : "Deuda guardada ✓";
}

function renderDeudaSaveSuccessBanner(st) {
  var feedback = st && st._deuda_save_feedback;
  if (!feedback || st.editing_debt_index != null) return "";
  return '<div class="deuda-save-success-banner" role="status" aria-live="polite">'
    + '<span class="deuda-save-success-icon" aria-hidden="true">✓</span>'
    + '<span>' + _deudaSaveFeedbackMessage(feedback) + "</span>"
    + "</div>";
}

function _deudaActivasCount(st) {
  var deudas = (st && st.deudas) || [];
  var stats = _deudasResumenStats(deudas);
  return stats.activaCount;
}

function renderDeudaFlowActionBar(st, opts) {
  opts = opts || {};
  st = st || _st();
  var editing = st.editing_debt_index;
  var feedback = st._deuda_save_feedback;
  var addButtonId = opts.addButtonId || "btn-add-debt";
  var activaCount = _deudaActivasCount(st);
  var html = "";

  if (feedback && editing == null) {
    html += renderDeudaSaveSuccessBanner(st);
  }

  if (editing != null) {
    var saveLabel = st._deuda_is_new_add ? "Guardar deuda" : "Guardar cambios";
    html += '<div class="deuda-flow-actions deuda-flow-actions--edit">'
      + '<button type="button" class="btn btn-primary" id="btn-guardar-deuda-edicion">'
      + saveLabel + "</button>"
      + '<button type="button" class="btn btn-secondary" id="btn-cancelar-edicion-deuda">'
      + (opts.cancelLabel || "Cancelar edición") + "</button>"
      + "</div>";
    return html;
  }

  if (feedback) {
    html += '<div class="deuda-flow-actions deuda-flow-actions--saved">'
      + '<button type="button" class="btn btn-primary deuda-save-confirmed" disabled>'
      + _deudaSaveConfirmedLabel(feedback) + "</button>"
      + "</div>";
  }

  if (activaCount > 0 || feedback) {
    html += '<div class="deuda-flow-actions deuda-flow-actions--add">'
      + '<button type="button" class="btn btn-secondary" id="' + addButtonId + '">'
      + "+ Agregar otra deuda</button>"
      + "</div>";
  } else {
    html += '<div class="deuda-flow-actions deuda-flow-actions--add">'
      + '<button type="button" class="btn btn-secondary" id="' + addButtonId + '">'
      + "+ Agregar deuda</button>"
      + "</div>";
  }

  if (opts.showContinueHint) {
    html += '<div class="deuda-continue-hint">'
      + "Cuando termines de cargar tus deudas, usá <strong>Continuar análisis</strong> abajo para seguir."
      + "</div>";
  }

  return html;
}

function renderDeudas() {
  var html = SEGMENTO === 1
    ? renderStepPills(1, 3)
    : renderStepPills(1, 3, ["Perfil", "Deudas", "Gastos"]);
  var st     = _st();
  var deudas = st.deudas || [];
  var ingreso = PRE.ingreso || 0;
  var stats  = _deudasResumenStats(deudas);

  html += '<div class="card">'
    + '<div class="section-title">Tus deudas actuales</div>'
    + '<div class="section-text">Identificamos el acreedor, el monto y el comportamiento de pago para detectar dónde está hoy la mayor presión financiera.</div>'
    + '<div id="deudas-container">' + deudas.map(function(d, i) {
        var isDraft = typeof isDebtDraftAdd === "function"
          ? isDebtDraftAdd(d)
          : !!(d && d._is_draft_add);
        if (isDraft && st.editing_debt_index !== i) return "";
        if (st.editing_debt_index === i) {
          return '<div id="debt-card-wrap-' + i + '">' + renderDeudaCard(d, i) + "</div>";
        }
        return renderDeudaLive(d, i, stats.totalActiva, ingreso);
      }).join("") + '</div>'
    + renderDeudaFlowActionBar(st, {
        addButtonId: "btn-agregar-deuda",
        showContinueHint: true,
        cancelLabel: "Cancelar edición",
      })
    + '<div class="metrics" id="metrics-live">' + renderMetricsLive() + '</div>'
    + '<div class="result" id="result-live"><h3 id="result-title">Todavia no analizamos tus deudas</h3>'
    + '<p id="result-text">Completá tus deudas para detectar qué acreedor está generando más presión financiera.</p></div>'
    + '</div>';

  if (deudas.length === 0 && st.editing_debt_index == null) {
    html += '<div class="card no-debts-alt" style="margin-top:16px;border:1px dashed rgba(64,215,255,.22);'
      + 'background:rgba(64,215,255,.04);">'
      + '<div style="text-align:center;padding:4px 0 2px;">'
      + '<div style="font-size:14px;color:rgba(255,255,255,.55);margin-bottom:14px;line-height:1.5;">'
      + 'Si hoy no tenés deudas activas, podés continuar sin cargar ninguna.'
      + '</div>'
      + '<button type="button" class="btn btn-secondary" id="btn-no-deudas-activas" '
      + 'style="height:56px;font-size:17px;max-width:420px;margin:0 auto;'
      + 'border-color:rgba(64,215,255,.35);color:#40d7ff;">'
      + 'No tengo deudas activas &rarr; continuar'
      + '</button>'
      + '</div></div>';
  }

  html += '<button class="nav-back" id="btn-back-gastos">&#8592; Atras</button>';
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
        return wrap('Este préstamo no siempre figura en Clearing o BCU, pero genera una presión de '
          + '<strong style="color:rgba(255,255,255,.8);">' + fmt(pago) + '</strong>/mes sobre tu flujo.');
      }
      return wrap('Este préstamo no siempre figura en Clearing o BCU, pero puede seguir generando presión sobre tu flujo real.');
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
      editBanner = '<div style="margin-bottom:14px;padding:12px 16px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.22);border-radius:12px;font-size:15px;font-weight:700;color:#40d7ff;">Nueva deuda — completá los datos y tocá Guardar deuda</div>';
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

function _dashPlanColorStyle(planColor) {
  var c = planColor && String(planColor).trim ? String(planColor).trim() : "#5b7cff";
  return "--cz-plan-color:" + c + ";";
}

function _dashIaEmojiTierClass(sectionKey) {
  if (sectionKey === "situacion" || sectionKey === "accion") return "dash-ia-emoji--a";
  if (sectionKey === "frenando") return "dash-ia-emoji--b";
  return "dash-ia-emoji--c";
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

var CZ_DASH_ZONE_GAP =
  "margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);";

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
  return '<div class="dash-ia-section-label">'
    + '<span class="dash-ia-emoji ' + _dashIaEmojiTierClass(sectionKey) + '" aria-hidden="true">'
    + _dashIaIcon(sectionKey) + "</span>"
    + '<div class="dash-ia-label-text">' + text + "</div>"
    + "</div>";
}

function _dashIaSectionOpen(isFirst, sectionKey) {
  return '<div style="max-width:100%;box-sizing:border-box;' + (isFirst ? "" : CZ_DASH_IA_SECTION_GAP) + '">';
}

function _dashIaSectionClose() {
  return "</div>";
}

function _isValidUiScore(score) {
  return score != null && score !== "" && !isNaN(Number(score)) && isFinite(Number(score));
}

function _scoreFinancieroLabel(score) {
  if (!_isValidUiScore(score)) {
    return {
      valid: false,
      emoji: "",
      text: "Datos insuficientes para mostrar",
      color: "#8390b5",
      tooltip: null,
    };
  }
  var s = Math.round(Number(score));
  var tooltip = "Score financiero: " + s + "/30";
  if (s <= 8) {
    return { valid: true, emoji: "🔴", text: "Situación crítica", color: "#ff4e72", tooltip: tooltip };
  }
  if (s <= 15) {
    return { valid: true, emoji: "🟠", text: "Con presión financiera", color: "#ffd36f", tooltip: tooltip };
  }
  if (s <= 22) {
    return { valid: true, emoji: "🟡", text: "En recuperación", color: "#ffd36f", tooltip: tooltip };
  }
  return { valid: true, emoji: "🟢", text: "Estable", color: "#34ffaf", tooltip: tooltip };
}

function _scoreConductualLabel(score) {
  if (!_isValidUiScore(score)) {
    return {
      valid: false,
      emoji: "",
      text: "Datos insuficientes para mostrar",
      color: "#8390b5",
      tooltip: null,
    };
  }
  var s = Math.round(Number(score));
  var tooltip = "Score conductual: " + s + "/30";
  if (s <= 8) {
    return { valid: true, emoji: "🔴", text: "Necesita trabajo", color: "#ff4e72", tooltip: tooltip };
  }
  if (s <= 15) {
    return { valid: true, emoji: "🟠", text: "En desarrollo", color: "#ffd36f", tooltip: tooltip };
  }
  if (s <= 22) {
    return { valid: true, emoji: "🟡", text: "Consistente", color: "#ffd36f", tooltip: tooltip };
  }
  return { valid: true, emoji: "🟢", text: "Sólido", color: "#34ffaf", tooltip: tooltip };
}

function _severityTierForPlanLabel(severityLevel) {
  if (severityLevel === "critico") return 4;
  if (severityLevel === "alto") return 3;
  if (severityLevel === "medio") return 2;
  if (severityLevel === "bajo") return 1;
  return 0;
}

function _planIdTierForPlanLabel(planId) {
  var p = parseInt(planId, 10);
  if (isNaN(p)) return 0;
  if (p >= 4) return 4;
  if (p === 3) return 3;
  if (p === 2) return 2;
  if (p === 1) return 1;
  return 0;
}

function _planStatusLabelFromTier(tier) {
  if (tier >= 4) {
    return { emoji: "🔴", text: "Prioridad alta", color: "#ff4e72" };
  }
  if (tier === 3) {
    return { emoji: "🟠", text: "Requiere acción", color: "#ffd36f" };
  }
  if (tier === 2) {
    return { emoji: "🟡", text: "En proceso", color: "#ffd36f" };
  }
  if (tier === 1) {
    return { emoji: "🟢", text: "En buen camino", color: "#34ffaf" };
  }
  return { emoji: "", text: "Datos insuficientes para mostrar", color: "#8390b5" };
}

function resolvePlanStatusLabel(diag, st, coherence) {
  diag = diag || {};
  st = st || _st();
  if (isIncompleteFinancialProfile(diag, st)) {
    return _incompletePlanStatusLabel();
  }
  if (coherence && coherence.profileTier === "healthy_organized") {
    return { emoji: "🟢", text: "En buen camino", color: "#34ffaf" };
  }
  if (Number(diag.planId) === 1) {
    return { emoji: "🟡", text: "Pendiente de ordenar", color: "#ffd36f" };
  }
  var sev = typeof _severityFromDiag === "function" ? _severityFromDiag(diag) : {};
  var severityLevel = sev.severity_level
    || (diag.interpretacion_v2 && diag.interpretacion_v2.severity_level);
  var tier = Math.max(
    _planIdTierForPlanLabel(diag.planId),
    _severityTierForPlanLabel(severityLevel)
  );
  if (diag.nivelR === "C") tier = Math.max(tier, 4);
  return _planStatusLabelFromTier(tier);
}

function _renderProfileScoreLabelHtml(labelObj) {
  labelObj = labelObj || {};
  var html = '<div class="profile-composition-score">'
    + '<div class="profile-composition-score__text" style="color:' + (labelObj.color || "#8390b5") + ';">'
    + (labelObj.emoji ? labelObj.emoji + " " : "")
    + (labelObj.text || "")
    + "</div>";
  if (labelObj.tooltip) {
    html += '<span class="profile-composition-score__info" title="' + String(labelObj.tooltip).replace(/"/g, "&quot;") + '" '
      + 'role="img" aria-label="Información adicional">ⓘ</span>';
  }
  html += "</div>";
  return html;
}

function _planStatusPillStyles(color) {
  if (color === "#ff4e72") {
    return { bg: "rgba(255,78,114,.12)", border: "rgba(255,78,114,.28)" };
  }
  if (color === "#ffd36f") {
    return { bg: "rgba(255,211,111,.10)", border: "rgba(255,211,111,.24)" };
  }
  if (color === "#34ffaf") {
    return { bg: "rgba(52,255,175,.08)", border: "rgba(52,255,175,.22)" };
  }
  return { bg: "rgba(255,255,255,.04)", border: "rgba(255,255,255,.10)" };
}

function _renderPlanStatusLabelHtml(statusObj) {
  statusObj = statusObj || {};
  var styles = _planStatusPillStyles(statusObj.color || "#8390b5");
  var text = statusObj.text || "";
  if (!text) return "";
  return '<div style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;max-width:100%;'
    + "padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.4;"
    + "background:" + styles.bg + ";border:1px solid " + styles.border + ";"
    + "color:" + (statusObj.color || "#8390b5") + ';">'
    + '<span style="font-size:11px;font-weight:600;color:#8390b5;">Estado del plan:</span>'
    + "<span>" + text + "</span>"
    + "</div>";
}

// Sprint 12.5 — volver a gastos desde dashboard (solo UX; recálculo vía next() existente)
function renderDashboardEditGastosCta(diag, st) {
  diag = diag || _diag();
  st = st || _st();
  var hierarchy = resolveDashboardCtaHierarchy(diag, st);
  if (hierarchy.primary === "complete_expenses") return "";
  if (hierarchy.primary === "mideuda" && hierarchy.secondary === "complete_expenses") return "";

  return '<div style="margin-bottom:20px;max-width:100%;">'
    + '<p style="font-size:13px;color:#8390b5;line-height:1.55;margin-bottom:12px;">'
    + "Podés actualizar tus gastos y recalcular el diagnóstico cuando quieras."
    + "</p>"
    + '<button type="button" class="btn btn-secondary" id="btn-editar-gastos-dashboard" '
    + 'style="width:100%;max-width:100%;height:52px;font-size:16px;box-sizing:border-box;">'
    + "✏️ Editar gastos</button>"
    + "</div>";
}

function _renderSituacionHoyEditGastosCta() {
  return '<div style="margin-top:18px;max-width:100%;">'
    + '<button type="button" class="btn btn-secondary" id="btn-editar-gastos-situacion-hoy" '
    + 'style="width:100%;max-width:100%;height:52px;font-size:16px;box-sizing:border-box;">'
    + "Editar gastos</button>"
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

// Sprint B5a — active debt with zero declared monthly payments (presentation only)
var _ZERO_PAYMENT_DEBT_CLARIFICATION =
  "Tenés deuda declarada sin pagos mensuales informados. Este indicador puede verse mejor de lo que realmente refleja tu situación.";

function _shouldShowZeroPaymentDebtClarification(st) {
  st = st || _st();
  var stats = _deudasResumenStats(st.deudas || []);
  if (stats.activaCount <= 0) return false;
  if (stats.totalActiva <= 0) return false;
  if (stats.pagosMensuales > 0) return false;
  return true;
}

function _renderZeroPaymentDebtClarificationHtml() {
  return '<p class="profile-composition-card__clarification">'
    + _ZERO_PAYMENT_DEBT_CLARIFICATION
    + "</p>";
}

function renderProfileCompositionCard(title, valueHtml, desc, extraHtml) {
  return '<div class="profile-composition-card">'
    + '<div class="profile-composition-card__title">' + title + "</div>"
    + '<div class="profile-composition-card__body">'
    + '<div class="profile-composition-card__value">' + (valueHtml || "") + "</div>"
    + '<div class="profile-composition-card__desc">' + (desc || "") + "</div>"
    + "</div>"
    + (extraHtml
        ? '<div class="profile-composition-card__extra">' + extraHtml + "</div>"
        : "")
    + "</div>";
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

function _renderTabsNav(activeTab) {
  var tab = activeTab || "plan";
  if (tab === "ia") tab = "plan";

  var TABS = [
    { id: "plan",   l: "Mi Plan",      icon: "📋" },
    { id: "deudas", l: "Tus deudas",   icon: "💳" },
    { id: "plus",   l: "Mi Plan Plus", icon: "★" },
  ];

  var plusNav = (typeof getPlusTabNavDisplay === "function") ? getPlusTabNavDisplay() : null;

  return '<div class="tabs">'
    + TABS.map(function(t) {
        if (t.id !== "plus") {
          return '<button class="tab-btn tab-nav-item' + (tab === t.id ? " active" : "") + '" data-tab="' + t.id + '">'
            + t.icon + " " + t.l + "</button>";
        }
        var plusClass = " tab-btn-plus";
        if (plusNav && plusNav.locked) plusClass += " tab-btn-plus-locked";
        if (plusNav && plusNav.unlocked) plusClass += " tab-btn-plus-unlocked-state";
        if (plusNav && plusNav.secondaryLine) plusClass += " tab-btn-plus-premium";
        if (!plusNav) {
          return '<button class="tab-btn tab-nav-item' + plusClass + (tab === t.id ? " active" : "") + '" data-tab="' + t.id + '">'
            + t.icon + " " + t.l + "</button>";
        }
        return '<button class="tab-btn tab-nav-item' + plusClass + (tab === t.id ? " active" : "") + '" data-tab="' + t.id + '">'
          + '<span class="tab-plus-inner">'
          + '<span class="tab-plus-row-main">'
          + '<span class="tab-plus-icon" aria-hidden="true">' + plusNav.icon + "</span>"
          + '<span class="tab-plus-title">' + plusNav.label + "</span>"
          + (plusNav.badge ? '<span class="tab-plus-badge">' + plusNav.badge + "</span>" : "")
          + "</span>"
          + (plusNav.secondaryLine ? '<span class="tab-plus-secondary">' + plusNav.secondaryLine + "</span>" : "")
          + "</span></button>";
      }).join("")
    + "</div>";
}

function syncTabsNav() {
  var st = _st();
  if (st.step !== 3) return;
  var tabsEl = document.querySelector(".tabs");
  if (!tabsEl) return;
  tabsEl.outerHTML = _renderTabsNav(st.tab || "plan");
  bindTabEvents();
}

function renderDashboard() {
  var st  = _st();
  var tab = st.tab || "plan";
  if (tab === "ia") tab = "plan";

  return _renderTabsNav(tab) + '<div id="tab-content"></div>';
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
  var st = _st();
  var fin      = _finFromDiag(diag);
  var deudas   = (st.deudas || []);
  var totalDeuda = fin.totalDeuda != null ? fin.totalDeuda : 0;
  var dtiRatio   = fin.dti_ratio;

  var cardOpen = '<div class="plan-card dash-tier-b dash-relacion-card" style="border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.03);'
    + _dashSectionAccentCss("dti") + '">'
    + _dashCardTitle("⚖️", "Relación deuda / ingreso", "dti");

  if (isIncompleteFinancialProfile(diag, st) && _expensesMissing(st) && deudas.length > 0 && totalDeuda > 0) {
    return cardOpen
      + '<div style="font-size:17px;font-weight:700;color:rgba(255,255,255,.9);line-height:1.45;margin-bottom:10px;">Saldo a revisar</div>'
      + '<div style="font-size:15px;color:#8390b5;line-height:1.65;margin-bottom:14px;">'
      + "Registraste deuda, pero falta el panorama de gastos para interpretar esta relación con tu ingreso. "
      + "Este dato todavía no alcanza para decidir una estrategia de pago."
      + "</div>"
      + (dtiRatio != null ? _dashTechIndicator("Indicador técnico: " + _dtiRatioDisplay(dtiRatio)) : "")
      + "</div>";
  }

  var isZeroDebt = deudas.length === 0
    || totalDeuda <= 0
    || (dtiRatio != null && dtiRatio <= 0);

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
  var st = _st();
  if (isIncompleteFinancialProfile(diag, st) && _expensesMissing(st)) return "";

  var deudas = st.deudas || [];
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
  var st   = _st();
  var conf = fin.confianza_diagnostico;
  if (conf == null) return "";

  var nivelLabel;
  var explicacion;
  if (st.gastos_missing_confirmed) {
    nivelLabel  = "Información incompleta";
    explicacion = "El diagnóstico todavía puede mejorar cuando completes tus gastos mensuales.";
  } else if (conf >= 90) {
    nivelLabel  = "Alta";
    explicacion = "La información disponible permite construir una interpretación consistente de tu situación.";
  } else if (conf >= 70) {
    nivelLabel  = "Media";
    explicacion = "Hay suficiente información para orientarte, aunque algunos datos podrían mejorar la precisión.";
  } else {
    nivelLabel  = "Reducida";
    explicacion = "Faltan datos o existen señales que limitan la precisión de este diagnóstico.";
  }

  var missingPayMsg = (!st.gastos_missing_confirmed
      && (diag.missing_payment_information || iv2.missing_payment_information))
    ? '<div style="margin-top:12px;padding:12px 14px;background:rgba(255,196,0,.06);border:1px solid rgba(255,196,0,.2);border-radius:10px;font-size:14px;color:#ffd447;line-height:1.6;">'
      + "Registraste deuda activa pero no informaste pagos mensuales. Algunas estimaciones pueden ser menos precisas hasta completar esa información."
      + "</div>"
    : "";

  return '<div class="plan-card dash-tier-c dash-confianza-compact" style="' + _dashPlanColorStyle(null) + '">'
    + '<div class="dash-confianza-compact__head">'
    + '<span class="dash-confianza-compact__emoji" aria-hidden="true">🎯</span>'
    + '<div class="dash-confianza-compact__title-wrap">'
    + '<div class="dash-confianza-compact__title">Confianza del diagnóstico</div>'
    + "</div></div>"
    + '<div class="dash-confianza-compact__level">' + nivelLabel + "</div>"
    + '<div class="dash-confianza-compact__text">' + explicacion + "</div>"
    + missingPayMsg
    + "</div>";
}

function _hasRealBlockers(diag) {
  return Array.isArray(diag && diag.bloqueadores)
    && diag.bloqueadores.length > 0;
}

function _shouldHideBlockersContent(diag, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, _st());
  return coherence.profileTier === "healthy_organized" && !_hasRealBlockers(diag);
}

function _shouldShowRelacionDeudaIngresoSection(diag) {
  var ingreso = PRE.ingreso || 0;
  if (ingreso <= 0) return false;
  var st = _st();
  var deudas = st.deudas || [];
  if (typeof deudasActivasParaCalculo === "function") {
    return deudasActivasParaCalculo(deudas).length > 0;
  }
  var fin = _finFromDiag(diag);
  return (fin.totalDeuda || 0) > 0;
}

function _shouldRenderFrenandoSection(diag, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, _st());
  return !_shouldHideBlockersContent(diag, coherence)
    || _shouldShowRelacionDeudaIngresoSection(diag);
}

function renderBloqueadores(diag) {
  var st = _st();
  if (isIncompleteFinancialProfile(diag, st) && _expensesMissing(st) && !_hasNoDeclaredDebts(st)) {
    return '<div class="plan-card" style="border-color:rgba(255,255,255,.1);">'
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;">Lo que frena tu perfil hoy</div>'
      + '<div style="padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;">'
      + '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.88);line-height:1.45;margin-bottom:8px;">Estrategia pendiente</div>'
      + '<div style="font-size:14px;color:#8390b5;line-height:1.6;">'
      + "Necesitamos tus gastos mensuales para definir qué factores están limitando tu margen real y priorizar una estrategia de pago."
      + "</div></div></div>";
  }

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
      + '<div style="font-size:15px;color:rgba(255,255,255,.8);line-height:1.55;">Con la información declarada, no se detectan factores críticos adicionales en este diagnóstico. '
      + _rejectionCopy(
          "Eso no explica por sí solo una solicitud rechazada ni garantiza que una nueva evaluación sea viable.",
          "Eso no garantiza por sí solo que una evaluación crediticia sea favorable."
        )
      + '</div>'
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

function _hasMideudaRecommended(diag) {
  return !!(diag && diag.recommended_tools && diag.recommended_tools.indexOf("mideuda") >= 0);
}

function _totalMonthlyExpensesFromState(st) {
  st = st || window.CZState || {};
  var liveState = typeof window !== "undefined" ? window.CZState : null;
  if (st === liveState && typeof getTotalMonthlyExpensesSafe === "function") {
    return getTotalMonthlyExpensesSafe(st);
  }
  var base = typeof getCategoryGastosTotal === "function"
    ? getCategoryGastosTotal(st.gastos || {})
    : Object.keys(st.gastos || {}).reduce(function(sum, key) {
        return sum + (parseFloat(st.gastos[key]) || 0);
      }, 0);
  if (st === liveState && typeof getCustomExpensesIncludedTotal === "function") {
    return base + getCustomExpensesIncludedTotal();
  }
  return base;
}

function _expensesMissing(st) {
  st = st || {};
  if (st.gastos_missing_confirmed) return true;
  return _totalMonthlyExpensesFromState(st) <= 0;
}

function _hasDeclaredIncome(st) {
  st = st || {};
  var ing = (typeof PRE !== "undefined" && PRE.ingreso != null ? PRE.ingreso : null)
    || st.declared_ingreso
    || 0;
  return (parseFloat(ing) || 0) > 0;
}

function _hasNoDeclaredDebts(st) {
  st = st || {};
  if (st.no_debts_declared) return false;
  if (st.financial_debts_complete) return false;
  return (st.deudas || []).length === 0;
}

function isIncompleteFinancialProfile(diag, st) {
  st = st || {};
  if (!_hasDeclaredIncome(st)) return false;
  return _hasNoDeclaredDebts(st) || _expensesMissing(st);
}

// Sprint B2e — Plan 1 complete profile with debt history but zero active debts.
var _ZERO_ACTIVE_DEBT_HERO_PROBLEMA = "No registrás deudas activas actualmente. El objetivo es mantener un equilibrio saludable entre ingresos y gastos para conservar tu estabilidad financiera.";
var _ZERO_ACTIVE_DEBT_NEXT_STEP = "Revisá periódicamente tus gastos y tu margen disponible para mantener una situación financiera saludable.";
var _REVISAR_INGRESOS_NEXT_STEP =
  "El primer paso es revisar tu situación de ingresos para confirmar si actualmente contás con una fuente de ingresos estable o si necesitás generar una nueva.";

// Sprint B7b — contextual action layer (labor × income × active debt)
var _B7_SEGMENTS = Object.freeze({
  S0: Object.freeze({
    segmentId: "S0",
    title: null,
    actions: Object.freeze([]),
    isInconsistency: false,
  }),
  S1: Object.freeze({
    segmentId: "S1",
    title: "Tu ingreso es tu principal herramienta",
    actions: Object.freeze([
      "Priorizá pagar las deudas con mayor tasa de interés primero",
      "Destiná un porcentaje fijo del sueldo al pago de deuda cada mes",
      "Evitá usar crédito rotativo para gastos corrientes",
      "Evaluá consolidar varias deudas en una sola cuota",
      "Revisá si tu empresa o sindicato tiene convenios con BROU o cooperativas como ANDA o COFAC — suelen ofrecer tasas menores a las financieras",
    ]),
    isInconsistency: false,
  }),
  S2: Object.freeze({
    segmentId: "S2",
    title: "Tu situación es sólida — el foco es mantenerla",
    actions: Object.freeze([
      "Construí un fondo de emergencia equivalente a tres meses de gastos",
      "Evitá endeudarte para consumo",
      "Compará tasas antes de tomar crédito",
      "Documentá tus ingresos para mejorar tu perfil financiero",
      "Revisá tus gastos fijos periódicamente",
    ]),
    isInconsistency: false,
  }),
  S3: Object.freeze({
    segmentId: "S3",
    title: "Tu ingreso variable requiere una estrategia diferente",
    actions: Object.freeze([
      "Calculá tu ingreso promedio de los últimos meses",
      "Aprovechá los meses fuertes para acelerar pagos",
      "Evitá cuotas basadas en tu mejor mes",
      "Avisá al acreedor antes de caer en mora",
      "Separá una cuenta exclusiva para deuda",
    ]),
    isInconsistency: false,
  }),
  S4: Object.freeze({
    segmentId: "S4",
    title: "Sin deudas, pero tu ingreso variable es tu mayor riesgo",
    actions: Object.freeze([
      "Construí una reserva equivalente a cuatro o seis meses de gastos",
      "Evitá comprometerte con cuotas rígidas",
      "Documentá ingresos mediante transferencias o comprobantes",
      "Evaluá opciones de crédito flexibles",
      "Considerá coberturas de salud y accidentes",
    ]),
    isInconsistency: false,
  }),
  S5: Object.freeze({
    segmentId: "S5",
    title: "Tu ingreso es estable — el foco es no comprometer más de lo necesario",
    actions: Object.freeze([
      "Verificá que las cuotas no superen una parte razonable de tus ingresos",
      "Revisá descuentos automáticos vigentes",
      "Evitá actuar como garante para terceros",
      "Evaluá refinanciar deuda cara",
      "Consultá con alguien de confianza antes de firmar nuevos créditos",
    ]),
    isInconsistency: false,
  }),
  S6: Object.freeze({
    segmentId: "S6",
    title: "Estás en buena posición — protegé lo que construiste",
    actions: Object.freeze([
      "Evitá salir de garante para terceros",
      "Consultá antes de firmar créditos nuevos",
      "Revisá gastos fijos innecesarios",
      "Utilizá crédito solo cuando sea realmente necesario",
      "Organizá tu información financiera para tu familia",
    ]),
    isInconsistency: false,
  }),
  S7: Object.freeze({
    segmentId: "S7",
    title: "Tu prioridad ahora es generar ingresos",
    actions: Object.freeze([
      "Contactá ex empleadores o conocidos para trabajos temporales",
      "Registrate en BuscoJobs, LinkedIn o el portal Vía Trabajo del MTSS",
      "Considerá actividades de ingreso inmediato",
      "Informá tu situación a los acreedores antes de entrar en mora",
      "Evitá asumir nuevas deudas hasta recuperar ingresos",
    ]),
    isInconsistency: false,
  }),
  S8: Object.freeze({
    segmentId: "S8",
    title: "Estás sin deudas — aprovechá para construir una base sólida",
    actions: Object.freeze([
      "Abrí una cuenta bancaria si aún no tenés una",
      "Construí historial financiero gradualmente",
      "Registrate en BuscoJobs, LinkedIn o el portal Vía Trabajo del MTSS",
      "Documentá cualquier ingreso que generes",
      "Evitá endeudarte antes de estabilizar ingresos",
    ]),
    isInconsistency: false,
  }),
  S9: Object.freeze({
    segmentId: "S9",
    title: "Hay algo que no coincide en tu perfil",
    actions: Object.freeze([
      "Revisá si completaste correctamente tu ingreso",
      "Actualizá el monto si cambió recientemente",
      "Confirmá que seguís trabajando actualmente",
      "Revisá si tu situación laboral cambió",
      "Actualizá el dato para recibir recomendaciones más precisas",
    ]),
    isInconsistency: true,
  }),
  S10: Object.freeze({
    segmentId: "S10",
    title: "Tu ingreso independiente no está registrado",
    actions: Object.freeze([
      "Ingresá un promedio mensual estimado",
      "Indicá si actualmente no tenés actividad",
      "Utilizá el ingreso más representativo de los últimos meses",
      "Registrá el ingreso que realmente podés documentar",
      "Actualizá el dato para obtener un diagnóstico más preciso",
    ]),
    isInconsistency: true,
  }),
  S11: Object.freeze({
    segmentId: "S11",
    title: "Tu jubilación no está registrada",
    actions: Object.freeze([
      "Verificá si ingresaste correctamente el monto de tu jubilación o pensión",
      "Si todavía no estás cobrando, indicá el monto estimado que esperás recibir",
      "Si tenés más de una pasividad, sumá el total mensual",
      "Consultá en BPS si hay algún problema con el cobro de tu pasividad",
      "Actualizá el dato para recibir recomendaciones ajustadas a tu situación",
    ]),
    isInconsistency: true,
  }),
});

function resolveContextualActionSegment(diag, st) {
  st = st || _st();
  var laboral = (typeof PRE !== "undefined" && PRE.laboral != null ? PRE.laboral : "") || "";
  var ingreso = parseFloat((typeof PRE !== "undefined" && PRE.ingreso != null ? PRE.ingreso : 0) || 0);
  var hasActiveDebts = deudasActivasParaCalculo((st.deudas || [])).length > 0;

  if (laboral === "relacion_dependencia" && ingreso > 0 && hasActiveDebts) return _B7_SEGMENTS.S1;
  if (laboral === "relacion_dependencia" && ingreso > 0 && !hasActiveDebts) return _B7_SEGMENTS.S2;
  if (laboral === "monotributista" && ingreso > 0 && hasActiveDebts) return _B7_SEGMENTS.S3;
  if (laboral === "monotributista" && ingreso > 0 && !hasActiveDebts) return _B7_SEGMENTS.S4;
  if (laboral === "jubilado" && ingreso > 0 && hasActiveDebts) return _B7_SEGMENTS.S5;
  if (laboral === "jubilado" && ingreso > 0 && !hasActiveDebts) return _B7_SEGMENTS.S6;
  if (laboral === "desempleado" && ingreso <= 0 && hasActiveDebts) return _B7_SEGMENTS.S7;
  if (laboral === "desempleado" && ingreso <= 0 && !hasActiveDebts) return _B7_SEGMENTS.S8;
  if (laboral === "relacion_dependencia" && ingreso <= 0) return _B7_SEGMENTS.S9;
  if (laboral === "monotributista" && ingreso <= 0) return _B7_SEGMENTS.S10;
  if (laboral === "jubilado" && ingreso <= 0) return _B7_SEGMENTS.S11;

  return _B7_SEGMENTS.S0;
}

function renderContextualActionBlock(segment) {
  if (!segment || segment.segmentId === "S0" || !_B7_SEGMENTS[segment.segmentId]) return "";

  var esc = typeof _plusEsc === "function"
    ? _plusEsc
    : function(s) {
        if (s == null) return "";
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      };

  var sectionTitle = "💡 Recomendaciones para tu situación laboral";
  var title = esc(segment.title || "");
  var actionsHtml = (segment.actions || []).map(function(a) {
    return "<li>" + esc(a) + "</li>";
  }).join("");

  return [
    '<div class="cz-contextual-action-block dash-b7-tier-b" data-b7-segment="' + esc(segment.segmentId) + '" data-b7-inconsistency="' + (segment.isInconsistency ? "true" : "false") + '">',
    '<div class="cz-contextual-action-header">' + esc(sectionTitle) + "</div>",
    '<div class="cz-contextual-action-title">' + title + "</div>",
    '<ul class="cz-contextual-action-list">' + actionsHtml + "</ul>",
    "</div>",
  ].join("");
}

function _isZeroActiveDebtCompleteProfile(diag, st) {
  diag = diag || {};
  st = st || _st();
  if (parseInt(diag.planId, 10) !== 1) return false;
  if (isIncompleteFinancialProfile(diag, st)) return false;
  var deudas = st.deudas || [];
  if (deudas.length === 0) return false;
  if (typeof deudasActivasParaCalculo !== "function") return false;
  return deudasActivasParaCalculo(deudas).length === 0;
}

function _resolveZeroActiveDebtHeroProblema(diag, st, planProblema) {
  if (_isZeroActiveDebtCompleteProfile(diag, st)) return _ZERO_ACTIVE_DEBT_HERO_PROBLEMA;
  return planProblema || null;
}

var _RETRY_COMPATIBLE_NEXT_STEPS = {
  mantener_disciplina: true,
  optimizar_deuda_cara: true,
  preparar_reintento: true,
};

var _WHAT_IS_HAPPENING_HEALTHY_ALTO =
  "Tu situación declarada muestra un perfil ordenado y con margen disponible. "
  + "El principal ajuste no es ordenar más información, sino reducir el costo "
  + "de la deuda que ya estás pagando.";
var _WHAT_IS_HAPPENING_HEALTHY_MEDIO_BAJO =
  "Tu situación declarada muestra un perfil ordenado, con pagos controlados y margen disponible. "
  + "El foco ahora es mantener la disciplina y evitar que la deuda vuelva a crecer.";
var _WHAT_IS_HAPPENING_HEALTHY_ZERO_DEBT =
  "No registrás deudas activas actualmente. El foco es mantener el equilibrio entre ingresos "
  + "y gastos para sostener tu estabilidad financiera.";

function _hasActiveDebtsFromState(st) {
  st = st || _st();
  var deudas = st.deudas || [];
  if (typeof deudasActivasParaCalculo === "function") {
    return deudasActivasParaCalculo(deudas).length > 0;
  }
  return false;
}

function _resolveWhatIsHappeningText(profileTier, costoNivel, hasActiveDebts) {
  if (profileTier !== "healthy_organized") return null;
  if (!hasActiveDebts) return _WHAT_IS_HAPPENING_HEALTHY_ZERO_DEBT;
  if (costoNivel === "alto") return _WHAT_IS_HAPPENING_HEALTHY_ALTO;
  return _WHAT_IS_HAPPENING_HEALTHY_MEDIO_BAJO;
}

function _confidenceLevelFromDiag(diag) {
  if (!diag) return null;
  if (diag.confidence_level != null) return diag.confidence_level;
  var iv2 = diag.interpretacion_v2;
  if (iv2 && iv2.confidence_level != null) return iv2.confidence_level;
  return null;
}

function _resolveNextStepKeyFromDiag(diag, st) {
  diag = diag || {};
  st = st || _st();
  if (_isZeroActiveDebtCompleteProfile(diag, st)) return "mantener_disciplina";
  var finAccion = _finFromDiag(diag);
  if ((finAccion.dti_ratio || 0) >= 1) return "confirmar_saldo_stock_deuda";
  var iv2 = diag.interpretacion_v2;
  if (!iv2) return "ordenar_panorama";
  if (iv2.next_best_action) return iv2.next_best_action;
  var nPaso = iv2.narrativa_jerarquizada
    ? getNarrativaByTipo(iv2.narrativa_jerarquizada, "siguiente_paso")
    : null;
  if (nPaso && nPaso.accion) return nPaso.accion;
  return "ordenar_panorama";
}

function _isRetryCompatibleNextStep(nextStepKey) {
  return !!(_RETRY_COMPATIBLE_NEXT_STEPS[nextStepKey]);
}

function resolveDashboardCoherence(diag, st) {
  diag = diag || {};
  st = st || _st();
  var fin = diag.fin || {};
  var planId = parseInt(diag.planId, 10);
  if (isNaN(planId)) planId = 1;

  var ratio = fin.ratio != null ? fin.ratio : 1;
  var flujoLibre = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var cantMoras = fin.cantMoras != null ? fin.cantMoras : 0;
  var costoNivel = String(fin.costoDeudaNivel || "").toLowerCase();
  var confidenceLevel = _confidenceLevelFromDiag(diag);

  var profileTier = "standard";
  if (planId === 4 || planId === 5 || flujoLibre < 0 || cantMoras > 0) {
    profileTier = "critical";
  } else if (
    (planId === 1 || planId === 2 || planId === 3)
    && ratio <= 0.15
    && flujoLibre > 0
    && cantMoras === 0
    && !isIncompleteFinancialProfile(diag, st)
    && confidenceLevel !== "low"
  ) {
    profileTier = "healthy_organized";
  }

  var nextStepKey = null;
  var nextStepText = null;
  var heroProblemOverride = null;
  var suppressOrdenarPanorama = false;
  var hideAccionPrioritaria = true;

  if (profileTier === "healthy_organized") {
    if (costoNivel === "alto") {
      nextStepKey = "optimizar_deuda_cara";
      nextStepText = "Priorizá la deuda de mayor costo para reducir intereses innecesarios.";
      heroProblemOverride = "Tu perfil financiero está en orden. El próximo paso es optimizar el costo de tu deuda.";
    } else {
      nextStepKey = "mantener_disciplina";
      nextStepText = "Mantené el ritmo de pagos actual y utilizá el margen disponible para reducir deuda más rápido si te resulta conveniente.";
      heroProblemOverride = "Tu perfil financiero está en orden. El foco es sostener pagos en fecha y evitar nueva deuda.";
    }
    suppressOrdenarPanorama = true;
  } else if (diag.plan_guardrail_reason === "ingreso_cero") {
    nextStepKey = "revisar_ingresos";
    nextStepText = _REVISAR_INGRESOS_NEXT_STEP;
    heroProblemOverride = null;
    suppressOrdenarPanorama = false;
  } else {
    nextStepKey = _resolveNextStepKeyFromDiag(diag, st);
    nextStepText = _resolveDashboardNextStepTextLegacy(diag, st);
    heroProblemOverride = null;
    suppressOrdenarPanorama = false;
  }

  var retryCompatible = _isRetryCompatibleNextStep(nextStepKey);
  var eligible = typeof isRetryEligible === "function" && isRetryEligible(diag, st);
  var showRetry = eligible && retryCompatible;
  var hasActiveDebts = _hasActiveDebtsFromState(st);
  var whatIsHappeningText = _resolveWhatIsHappeningText(profileTier, costoNivel, hasActiveDebts);

  return {
    profileTier: profileTier,
    nextStepKey: nextStepKey,
    nextStepText: nextStepText,
    heroProblemOverride: heroProblemOverride,
    showRetry: showRetry,
    retryCompatible: retryCompatible,
    suppressOrdenarPanorama: suppressOrdenarPanorama,
    hideAccionPrioritaria: hideAccionPrioritaria,
    whatIsHappeningText: whatIsHappeningText,
  };
}

// =============================================================================
// NARRATIVE-04 — Next Step narrative consumption (content-selection layer only)
// GUARDRAIL:
// NARRATIVE-04 allows only Hero, Explanation and Next Step to consume narrative_decision.
// Recommendations must not consume narrative_decision.
// Recommended Actions must not consume narrative_decision.
// CRM must not consume narrative_decision.
// GTM/GA4 must not consume narrative_decision.
// Do not invent new action IDs or navigation routes.
// =============================================================================

var _NEXT_STEP_KNOWN_TEXTS = {
  liberar_margen: "Identificar qué cuota libera más margen mensual es el paso con mayor impacto inmediato.",
  estabilizar_atraso: "Antes de pensar en nueva financiación, el foco debería estar en estabilizar los atrasos activos.",
  reducir_costo_prioritaria: "Evaluar si hay forma de reducir el costo de la deuda prioritaria puede mejorar el margen disponible.",
  consolidar_deuda: "Consolidar o eliminar la deuda que menos beneficio genera puede simplificar el panorama mensual.",
  formalizar_informal: "Formalizar o reestructurar el compromiso informal reduce presión fuera del sistema y mejora el perfil.",
  definir_primer_paso: "Definir una acción concreta esta semana es más valioso que planificar sin ejecutar.",
  ordenar_panorama: "Ordenar el panorama completo de deudas y flujo es el punto de partida más útil ahora.",
  confirmar_saldo_stock_deuda: "Confirmar el saldo actualizado y definir si esta deuda debe estabilizarse, refinanciarse o atacarse primero.",
  mantener_disciplina: "Mantené el ritmo de pagos actual y utilizá el margen disponible para reducir deuda más rápido si te resulta conveniente.",
  optimizar_deuda_cara: "Priorizá la deuda de mayor costo para reducir intereses innecesarios.",
};

function _sanitizeNextStepFocusTarget(narrativeMode, focusTarget) {
  var focus = String(focusTarget || "DEFAULT").trim().toUpperCase();
  if (narrativeMode === "RECOVERY") {
    if (focus === "CREDIT_BUILDING" || focus === "LEARNING" || focus === "BUDGET_STABILIZATION") {
      return "RECOVERY_URGENT";
    }
    return focus === "RECOVERY_URGENT" ? "RECOVERY_URGENT" : "DEFAULT";
  }
  if (narrativeMode === "STABILIZATION") {
    if (focus === "CREDIT_BUILDING" || focus === "LEARNING" || focus === "RECOVERY_URGENT") {
      return "BUDGET_STABILIZATION";
    }
    return focus === "BUDGET_STABILIZATION" ? "BUDGET_STABILIZATION" : "DEFAULT";
  }
  if (narrativeMode === "OPTIMIZATION") {
    if (focus === "CREDIT_BUILDING" || focus === "LEARNING" || focus === "DEFAULT") return focus;
    return "DEFAULT";
  }
  return "DEFAULT";
}

function _nextStepActionKeyForNarrative(narrativeMode, focusTarget, diag, st) {
  diag = diag || {};
  st = st || _st();
  var fin = _finFromDiag(diag);
  var iv2 = diag.interpretacion_v2 || {};

  if (narrativeMode === "CLARITY") {
    return "ordenar_panorama";
  }
  if (narrativeMode === "RECOVERY") {
    if ((fin.dti_ratio || 0) >= 1) return "confirmar_saldo_stock_deuda";
    if (iv2.causa_principal === "mora_activa" || (fin.cantMoras || 0) > 0) return "estabilizar_atraso";
    if (focusTarget === "RECOVERY_URGENT") return "liberar_margen";
    return "liberar_margen";
  }
  if (narrativeMode === "STABILIZATION") {
    return "confirmar_saldo_stock_deuda";
  }
  if (narrativeMode === "OPTIMIZATION") {
    if (focusTarget === "CREDIT_BUILDING") return "reducir_costo_prioritaria";
    if (focusTarget === "LEARNING") return "ordenar_panorama";
    if (_isZeroActiveDebtCompleteProfile(diag, st)) return "mantener_disciplina";
    if (String(fin.costoDeudaNivel || "").toLowerCase() === "alto") return "optimizar_deuda_cara";
    return "mantener_disciplina";
  }
  return null;
}

function _nextStepTextForActionKey(diag, st, actionKey) {
  if (!actionKey) return null;
  diag = diag || {};
  st = st || _st();
  if (actionKey === "confirmar_saldo_stock_deuda") return CZ_DTI_ACCION_PRIORITARIA;
  var iv2 = diag.interpretacion_v2;
  if (iv2 && iv2.narrativa_jerarquizada) {
    var n = getNarrativaByTipo(iv2.narrativa_jerarquizada, "siguiente_paso");
    if (n && n.accion === actionKey) {
      if (n.texto) return n.texto;
      if (typeof textoParaNarrativa === "function") {
        var synthesized = textoParaNarrativa(n);
        if (synthesized) return synthesized;
      }
    }
  }
  return _NEXT_STEP_KNOWN_TEXTS[actionKey] || null;
}

function _nextStepNarrativeBase(narrativeMode, focusTarget, diag, st) {
  var actionKey = _nextStepActionKeyForNarrative(narrativeMode, focusTarget, diag, st);
  var text = _nextStepTextForActionKey(diag, st, actionKey);
  return { text: text, actionKey: actionKey };
}

function _applyNextStepNarrativeProfileTierTone(text, profileTier, narrativeMode, focusTarget) {
  if (!text || !profileTier || !narrativeMode) return text;
  var tier = String(profileTier).trim().toUpperCase();
  var focus = String(focusTarget || "DEFAULT").trim().toUpperCase();
  // Tone only — must never change actionKey / navigation family.
  if (tier === "AT_RISK" && narrativeMode === "RECOVERY") {
    if (text.indexOf("estabilizar") < 0 && text.indexOf("mora") < 0 && text.indexOf("margen") >= 0) {
      return _NEXT_STEP_KNOWN_TEXTS.estabilizar_atraso || text;
    }
  }
  if (tier === "HEALTHY" && narrativeMode === "OPTIMIZATION" && focus === "DEFAULT") {
    if (text.indexOf("disciplina") < 0 && text.indexOf("margen disponible") < 0) {
      return _NEXT_STEP_KNOWN_TEXTS.mantener_disciplina || text;
    }
  }
  return text;
}

function _resolveDashboardNextStepTextLegacy(diag, st) {
  diag = diag || {};
  st = st || _st();
  if (isIncompleteFinancialProfile(diag, st)) return null;
  if (_isZeroActiveDebtCompleteProfile(diag, st)) return _ZERO_ACTIVE_DEBT_NEXT_STEP;
  var iv2 = diag.interpretacion_v2;
  if (!iv2 || !iv2.narrativa_jerarquizada) return null;
  var nPaso = getNarrativaByTipo(iv2.narrativa_jerarquizada, "siguiente_paso");
  if (_shouldSuppressDebtOrderingCopy(diag, st, nPaso)) return null;
  var finAccion = _finFromDiag(diag);
  if ((finAccion.dti_ratio || 0) >= 1) return CZ_DTI_ACCION_PRIORITARIA;
  return nPaso && nPaso.texto ? nPaso.texto : null;
}

function _coherenceOverridesNextStep(coherence, narrativeMode, focusTarget) {
  if (!coherence || coherence.nextStepText == null) return false;
  if (coherence.nextStepKey === "revisar_ingresos") return true;
  if (coherence.profileTier === "healthy_organized" && narrativeMode === "OPTIMIZATION" && focusTarget === "DEFAULT") {
    return true;
  }
  return false;
}

function resolveNextStepContent(diag, st, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, st);
  diag = diag || _diag();
  st = st || _st();

  var narrativeMode = _normalizeHeroNarrativeMode(diag.narrative_decision);
  if (!narrativeMode) {
    var legacyText = coherence.nextStepText != null
      ? coherence.nextStepText
      : _resolveDashboardNextStepTextLegacy(diag, st);
    return {
      text: legacyText,
      actionKey: coherence.nextStepKey || _resolveNextStepKeyFromDiag(diag, st),
      source: "legacy",
      narrativeMode: null,
      profileTier: null,
    };
  }

  if (_isCzDevMode()) {
    try { console.log("[CZ Next Step] narrative_mode:", narrativeMode); } catch (e) {}
  }

  var profileTier = diag.narrative_decision && diag.narrative_decision.profile_tier
    ? String(diag.narrative_decision.profile_tier).trim().toUpperCase()
    : null;
  var rawFocus = diag.narrative_decision && diag.narrative_decision.sub_tracks
    ? diag.narrative_decision.sub_tracks.focus_target
    : "DEFAULT";
  var focusTarget = _sanitizeNextStepFocusTarget(narrativeMode, rawFocus);

  var base = _nextStepNarrativeBase(narrativeMode, focusTarget, diag, st);
  var text = null;
  var actionKey = null;

  if (focusTarget !== "DEFAULT" && base.text) {
    text = base.text;
    actionKey = base.actionKey;
  } else if (_coherenceOverridesNextStep(coherence, narrativeMode, focusTarget)) {
    text = coherence.nextStepText;
    actionKey = coherence.nextStepKey || base.actionKey;
  } else if (base.text) {
    text = base.text;
    actionKey = base.actionKey;
  } else {
    text = coherence.nextStepText != null
      ? coherence.nextStepText
      : _resolveDashboardNextStepTextLegacy(diag, st);
    actionKey = coherence.nextStepKey || _resolveNextStepKeyFromDiag(diag, st);
  }

  text = _applyNextStepNarrativeProfileTierTone(text, profileTier, narrativeMode, focusTarget);

  return {
    text: text,
    actionKey: actionKey,
    source: "narrative",
    narrativeMode: narrativeMode,
    profileTier: profileTier,
    focusTarget: focusTarget,
  };
}

function _resolveDashboardNextStepText(diag, st, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, st);
  return resolveNextStepContent(diag, st, coherence).text;
}

function _incompleteFinancialScoreLabel() {
  return {
    valid: true,
    emoji: "⚠️",
    text: "Pendiente de completar",
    color: "#ffd447",
    tooltip: null,
  };
}

function _incompletePlanStatusLabel() {
  return { emoji: "⚠️", text: "Diagnóstico incompleto", color: "#ffd447" };
}

var _FLOUJO_DEPENDENT_ACCION_IDS = {
  flujo_libre_positivo: true,
  flujo_negativo_accion: true,
  gasto_mayor_categoria: true,
};

function _isFlujoDependentAccionRecomendada(accion) {
  if (!accion) return false;
  if (_FLOUJO_DEPENDENT_ACCION_IDS[accion.id]) return true;
  var t = String(accion.texto || "").toLowerCase();
  if (t.indexOf("flujo libre") >= 0) return true;
  if (t.indexOf("flujo estimado") >= 0) return true;
  if (t.indexOf("flujo actual") >= 0) return true;
  if (t.indexOf("capacidad de pago") >= 0) return true;
  if (t.indexOf("plata sobrante") >= 0) return true;
  if (t.indexOf("[flujo_libre]") >= 0) return true;
  if (t.indexOf("destinarlo") >= 0 && t.indexOf("[acreedor]") >= 0) return true;
  return false;
}

function _filterAccionesForIncompleteProfile(acciones) {
  return (acciones || []).filter(function(a) {
    return !_isFlujoDependentAccionRecomendada(a);
  });
}

function _heroShowsExpensesCta(diag, st) {
  return isIncompleteFinancialProfile(diag, st) && _expensesMissing(st);
}

function _heroShowsDebtsCta(diag, st) {
  st = st || {};
  if (!isIncompleteFinancialProfile(diag, st)) return false;
  if (_expensesMissing(st)) return false;
  if (st.no_debts_declared) return false;
  return _hasNoDeclaredDebts(st);
}

function _renderHeroDebtsCtaHtml() {
  return '<div style="margin-top:0;">'
    + '<button type="button" class="btn btn-primary" id="btn-hero-confirmar-deudas" '
    + 'style="width:100%;height:52px;font-size:16px;box-sizing:border-box;">'
    + "Confirmar mis deudas"
    + "</button>"
    + "</div>";
}

function _shouldShowEarlyExpensesCta(diag, st) {
  if (_heroShowsExpensesCta(diag, st)) return false;
  if (!isIncompleteFinancialProfile(diag, st) || !_expensesMissing(st)) return false;
  return resolveDashboardCtaHierarchy(diag, st).primary === "complete_expenses";
}

function _shouldSuppressDebtOrderingCopy(diag, st, nPaso) {
  if (!_hasNoDeclaredDebts(st)) return false;
  if (nPaso && nPaso.accion === "ordenar_panorama") return true;
  if (nPaso && nPaso.texto && nPaso.texto.indexOf("panorama completo de deudas") >= 0) return true;
  return isIncompleteFinancialProfile(diag, st);
}

function _hasDebtForIncompleteNarrative(st) {
  st = st || {};
  if (st.no_debts_declared === true) {
    return false;
  }
  return !_hasNoDeclaredDebts(st);
}

function _renderIncompleteProfileNarrativeHtml(diag, st) {
  st = st || _st();
  var hasDebt = _hasDebtForIncompleteNarrative(st);
  var expensesMissing = _expensesMissing(st);
  var showCta = expensesMissing && !_heroShowsExpensesCta(diag, st);
  var ctaHtml = showCta
    ? _renderCompleteExpensesCtaHtml({ primary: true, marginTop: "14px", buttonLabel: "Completar gastos" })
    : "";
  var footnote = expensesMissing
    ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);'
      + 'font-size:13px;color:#8390b5;line-height:1.6;">'
      + 'Este diagnóstico todavía puede mejorar si completás la información de tus gastos mensuales.'
      + '</div>'
    : "";
  var title;
  var bodyHtml;
  if (hasDebt && expensesMissing) {
    title = "Diagnóstico incompleto";
    bodyHtml = '<div class="dash-narrativa-body dash-narrativa-body--lead" style="margin-bottom:12px;">'
      + "Registraste una deuda importante, pero todavía faltan tus gastos mensuales para entender tu capacidad real de pago."
      + "</div>"
      + '<div class="dash-narrativa-body" style="margin-bottom:12px;">'
      + "Antes de definir si conviene estabilizar, refinanciar o atacar una deuda primero, necesitamos saber cuánto dinero te queda realmente cada mes."
      + "</div>"
      + '<div style="padding:14px 16px;background:rgba(255,196,0,.08);border:1px solid rgba(255,196,0,.2);border-radius:12px;font-size:15px;color:#ffd447;font-weight:700;line-height:1.65;">'
      + "Completá tus gastos mensuales para ajustar el diagnóstico."
      + "</div>";
  } else {
    title = "Información insuficiente para completar el diagnóstico";
    bodyHtml = '<div class="dash-narrativa-body">'
      + "Todavía no registraste todos los datos necesarios para estimar tu situación financiera real."
      + "<br><br>Antes de tomar decisiones, necesitamos conocer mejor tus gastos mensuales."
      + "</div>";
  }
  return '<div class="plan-card dash-tier-a dash-narrativa-card" style="' + _dashPlanColorStyle(diag.plan && diag.plan.color) + '">'
    + '<div class="dash-narrativa-block">'
    + '<div class="dash-narrativa-block-label">Qué está pasando</div>'
    + '<div class="dash-narrativa-incomplete-title">'
    + title
    + "</div>"
    + bodyHtml
    + "</div>"
    + ctaHtml
    + footnote
    + "</div>";
}

function _renderIncompleteHorizonHtml(diag, st) {
  var gastosBtn = _heroShowsExpensesCta(diag, st)
    ? ""
    : _renderCompleteExpensesCtaHtml({
        primary: true,
        marginTop: "0",
        buttonLabel: "Completar gastos mensuales",
      });
  return _horizonPlanCardOpen(diag, st, "border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);")
    + '<div style="font-size:14px;font-weight:800;color:rgba(255,255,255,.9);line-height:1.55;margin-bottom:8px;">'
    + "Completar gastos mensuales"
    + "</div>"
    + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">'
    + "Antes de estimar un horizonte o definir una estrategia de pago, necesitamos conocer tus gastos mensuales."
    + "</div>"
    + gastosBtn
    + '<div style="margin-top:12px;font-size:12px;color:#8390b5;line-height:1.55;">'
    + "Después de completar tus gastos, Mi Plan podrá estimar mejor si conviene estabilizar, refinanciar o priorizar esta deuda."
    + "</div>"
    + "</div>";
}

function _renderDashboardPriorityCard(diag, st, prio) {
  st = st || _st();
  diag = diag || _diag();
  if (!prio) return "";

  var m = parseFloat(prio.monto) || 0;
  var p = parseFloat(prio.pago) || 0;
  var sevPrio = _severityFromDiag(diag);
  var intEst = prio.interes_mostrado || (function() {
    if (!m || !p || prio.tipo === "informal") return 0;
    var tasa = TASAS[prio.tipo] || 62;
    var est  = m * tasa / 100 / 12;
    var cap  = prio.estado === "al_dia" ? p * 0.80 : p * 0.95;
    return Math.round(Math.min(est, cap));
  })();
  var latentLabel = "Presión mensual potencial";
  var latentRaw   = prio.presion_latente_estimada || Math.round(m * (TASAS[prio.tipo] || 62) / 100 / 12);
  var latentUnrealistic = prio.presion_latente_unrealistic_flag
    || (m > 0 && latentRaw / m > 0.25)
    || (PRE.ingreso > 0 && latentRaw / PRE.ingreso > 1.5);
  var latentVal = latentUnrealistic ? null : fmt(latentRaw);
  var rows;
  if (p === 0 && sevPrio.severity_level === "critico") {
    rows = latentUnrealistic
      ? [["Monto", fmt(m), "#ff4e72"]]
      : [["Monto", fmt(m), "#ff4e72"], [latentLabel, latentVal, "#ffd447"]];
  } else {
    rows = [["Monto", fmt(m), "#ff4e72"], ["Pago mensual", fmt(p), "#ffd36f"]];
    if (!latentUnrealistic) {
      rows.push([latentLabel, latentVal, "#8390b5"]);
      rows.push(["Costo financiero est./mes", fmt(intEst), "#ffd36f"]);
    }
  }

  var advisoryHtml = "";
  if (isIncompleteFinancialProfile(diag, st) && _expensesMissing(st)) {
    advisoryHtml = '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
      + "Esta deuda debe revisarse, pero todavía falta conocer tus gastos mensuales para definir si conviene estabilizarla, refinanciarla o priorizar pagos."
      + "</div>";
  } else {
    if (prio.tipo === "informal") {
      advisoryHtml += '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,211,111,.06);border:1px solid rgba(255,211,111,.15);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">Este tipo de deuda no siempre figura en el historial financiero formal, pero puede generar presion significativa sobre el flujo mensual y dificultar la estabilidad general.</div>';
    }
    var sevP = _severityFromDiag(diag);
    var p0 = (parseFloat(prio.pago) || 0) === 0;
    var latentRawCheck = prio.presion_latente_estimada || 0;
    var unrealisticCheck = prio.presion_latente_unrealistic_flag
      || (parseFloat(prio.monto) > 0 && latentRawCheck / parseFloat(prio.monto) > 0.25)
      || (PRE.ingreso > 0 && latentRawCheck / PRE.ingreso > 1.5);
    if (unrealisticCheck) {
      advisoryHtml += '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">El deterioro potencial de esta deuda es muy alto y el saldo actualizado debe verificarse.</div>';
    } else if (p0) {
      advisoryHtml += '<div style="margin-top:10px;font-size:12px;color:#8390b5;line-height:1.55;">Estimación si la deuda siguiera acumulando costo. No es una cuota activa.</div>';
    }
    if (sevP.severity_level === "critico" || sevP.has_mora_or_deje_pagar) {
      advisoryHtml += '<div style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">Antes de acelerar pagos, conviene estabilizar el atraso, confirmar el saldo actualizado y frenar el deterioro. La prioridad no es pagar mas rapido sino recuperar control.</div>';
    }
  }

  return '<div class="priority-card">'
    + '<div style="font-size:13px;font-weight:800;color:#ffd36f;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Por donde empezar</div>'
    + '<div style="font-size:28px;font-weight:900;margin-bottom:14px;">'
    + (prio.acreedor || DEBT_TYPES.find(function(t) { return t.v === prio.tipo; })?.l || "Sin nombre")
    + "</div>"
    + '<div class="grid">'
    + rows.map(function(x) {
        return '<div><small style="color:#8390b5;display:block;margin-bottom:6px;">' + x[0]
          + '</small><strong style="font-size:' + (x[2] === "#8390b5" ? "20" : "32") + 'px;color:' + x[2] + ';">'
          + x[1] + "</strong></div>";
      }).join("")
    + "</div>"
    + advisoryHtml
    + "</div>";
}

function _isExtremeDebtProfile(diag, st) {
  diag = diag || {};
  st = st || {};
  if (diag.flag_deuda_sanity_extreme === true) return true;
  return diag.missing_payment_information === true
    && _hasMideudaRecommended(diag)
    && (st.deudas || []).length > 0;
}

function resolveDashboardCtaHierarchy(diag, st) {
  diag = diag || {};
  st = st || {};
  var deudas = st.deudas || [];
  var expensesMissing = _expensesMissing(st);
  var retryEligible = typeof isRetryEligible === "function" && isRetryEligible(diag, st);

  if (_isExtremeDebtProfile(diag, st)) {
    return {
      tier: "P1",
      primary: "mideuda",
      secondary: expensesMissing ? "complete_expenses" : null,
      tertiary: "plus",
    };
  }

  if (!retryEligible && deudas.length > 0 && !expensesMissing) {
    return {
      tier: "P2",
      primary: _hasMideudaRecommended(diag) ? "mideuda" : null,
      secondary: "plus",
      tertiary: null,
    };
  }

  if (expensesMissing) {
    return {
      tier: "P3",
      primary: "complete_expenses",
      secondary: "plus",
      tertiary: null,
    };
  }

  if (!retryEligible && deudas.length === 0) {
    return {
      tier: "P4",
      primary: "plus",
      secondary: null,
      tertiary: null,
    };
  }

  return {
    tier: null,
    primary: null,
    secondary: null,
    tertiary: null,
  };
}

function _horizonPlusPromoHtml(diag, st) {
  // Sprint B3c — not rendered in horizon zone; preserved for future non-horizon surfaces.
  var hierarchy = resolveDashboardCtaHierarchy(diag, st);
  if (hierarchy.primary === "mideuda") {
    return '<div style="margin-top:12px;font-size:12px;color:#8390b5;line-height:1.55;">'
      + 'También podés contrastar tu situación con '
      + '<button type="button" id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#8390b5;font-size:inherit;font-weight:600;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
      + '</div>';
  }
  return '<div style="padding:12px 14px;background:rgba(91,124,255,.07);border:1px solid rgba(91,124,255,.18);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
    + '<strong style="color:#a0b0ff;">Para confirmar este calculo</strong>, es necesario revisar lo que el banco ya tiene registrado sobre vos. Eso es lo que incluye <button type="button" id="btn-conocer-plus-tab" style="background:none;border:none;padding:0;cursor:pointer;color:#a0b0ff;font-size:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px;">Mi Plan Plus</button>.'
    + '</div>';
}

function _renderCompleteExpensesCtaHtml(opts) {
  opts = opts || {};
  var isPrimary = opts.primary !== false;
  var btnClass = isPrimary ? "btn btn-primary" : "btn btn-secondary";
  var btnId = opts.id || "btn-retry-fallback-gastos";
  var btnLabel = opts.buttonLabel || "Completar gastos para mejorar el diagnóstico";
  var marginTop = opts.marginTop != null ? opts.marginTop : (isPrimary ? "16px" : "10px");
  var subcopy = opts.subcopy
    ? '<div style="font-size:14px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:12px;">' + opts.subcopy + '</div>'
    : "";
  return '<div style="margin-top:' + marginTop + ';">'
    + subcopy
    + '<button type="button" class="' + btnClass + '" id="' + btnId + '" '
    + 'style="width:100%;height:52px;font-size:16px;box-sizing:border-box;">'
    + btnLabel + '</button>'
    + '</div>';
}

function _resolveDiagnosisInjectedCtaHtml(diag, st) {
  diag = diag || {};
  st = st || {};
  if (_heroShowsExpensesCta(diag, st)) return "";
  if (isIncompleteFinancialProfile(diag, st) && _hasNoDeclaredDebts(st)) return "";
  var hierarchy = resolveDashboardCtaHierarchy(diag, st);
  if (hierarchy.primary !== "complete_expenses") return "";
  return _renderCompleteExpensesCtaHtml({ primary: true, marginTop: "12px" });
}

function _renderMideudaFallbackCtaHtml(hierarchy) {
  var html = '<div style="margin-top:16px;">'
    + '<div style="font-size:14px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:12px;">'
    + 'Antes de volver a solicitar, conviene confirmar y ordenar tu deuda actual.'
    + '</div>'
    + '<button type="button" class="btn btn-primary" id="btn-retry-fallback-deuda" '
    + 'style="width:100%;height:52px;font-size:16px;background:#5b7cff;box-shadow:0 15px 50px rgba(91,124,255,.22);">'
    + 'Ordenar mi deuda con MiDeuda</button>'
    + '</div>';
  if (hierarchy && hierarchy.secondary === "complete_expenses") {
    html += _renderCompleteExpensesCtaHtml({ primary: false, marginTop: "10px" });
  }
  return html;
}

function _retryHorizonAddonHtml(diag, st, coherence) {
  diag = diag || {};
  st = st || (typeof window !== "undefined" ? window.CZState : null) || _st();
  coherence = coherence || resolveDashboardCoherence(diag, st);
  if (coherence.showRetry) {
    return renderRetryCtaHorizonAddon(diag, st);
  }
  return renderRetryBlockedFallbackCta(diag, st);
}

function renderRetryBlockedFallbackCta(diag, st) {
  st = st || _st();
  diag = diag || _diag();
  if (isIncompleteFinancialProfile(diag, st) && _expensesMissing(st)) {
    return "";
  }
  var hierarchy = resolveDashboardCtaHierarchy(diag, st);
  var deudas = st.deudas || [];

  if (hierarchy.primary === "mideuda") {
    return _renderMideudaFallbackCtaHtml(hierarchy);
  }

  if (hierarchy.primary === "complete_expenses") {
    return "";
  }

  if (hierarchy.primary === "plus") {
    return '<div style="margin-top:16px;">'
      + '<div style="font-size:14px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:12px;">'
      + 'Antes de volver a solicitar, conviene confirmar tu situación real con datos verificados.'
      + '</div>'
      + '<button type="button" class="btn btn-primary" id="btn-retry-fallback-plus" '
      + 'style="width:100%;height:52px;font-size:16px;">'
      + 'Confirmar mi situación antes de volver a solicitar</button>'
      + '</div>';
  }

  if (deudas.length > 0) {
    return '<div style="margin-top:16px;">'
      + '<div style="font-size:14px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:12px;">'
      + 'Antes de volver a solicitar, conviene ordenar y confirmar tu deuda actual.'
      + '</div>'
      + '<button type="button" class="btn btn-primary" id="btn-retry-fallback-deuda" '
      + 'style="width:100%;height:52px;font-size:16px;background:#5b7cff;box-shadow:0 15px 50px rgba(91,124,255,.22);">'
      + 'Ordenar mi deuda antes de volver a solicitar</button>'
      + '</div>';
  }

  return '<div style="margin-top:16px;">'
    + '<div style="font-size:14px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:12px;">'
    + 'Antes de volver a solicitar, conviene confirmar tu situación real con datos verificados.'
    + '</div>'
    + '<button type="button" class="btn btn-primary" id="btn-retry-fallback-plus" '
    + 'style="width:100%;height:52px;font-size:16px;">'
    + 'Confirmar mi situación antes de volver a solicitar</button>'
    + '</div>';
}

function renderHorizonteRecalificacion(diag, st, coherence) {
  st = st || (typeof window !== "undefined" ? window.CZState : null) || _st();
  coherence = coherence || resolveDashboardCoherence(diag, st);
  var incomplete = isIncompleteFinancialProfile(diag, st);
  if (incomplete && _expensesMissing(st)) {
    return _renderIncompleteHorizonHtml(diag, st);
  }
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
    return _horizonPlanCardOpen(diag, st, "border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);")
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:22px;font-weight:900;color:#8390b5;line-height:1.3;margin-bottom:10px;">No estimable sin estabilización previa</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">Cuando el perfil está en estabilización crítica, primero hay que ordenar la situación y confirmar el saldo actualizado. Recién después se puede estimar un horizonte de recalificación.</div>'
      + _retryHorizonAddonHtml(diag, st, coherence)
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
    return _horizonPlanCardOpen(diag, st, "border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);")
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:22px;font-weight:900;color:#8390b5;line-height:1.3;margin-bottom:10px;">No estimable con flujo mensual negativo</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">Antes de proyectar una recalificación, primero hay que recuperar margen mensual positivo. Con flujo negativo, el horizonte no puede calcularse de forma responsable.</div>'
      + _retryHorizonAddonHtml(diag, st, coherence)
      + '</div>';
  }

  // ── 3. NORMAL HORIZON ─────────────────────────────────────────────────────
  var finHorizon = _finFromDiag(diag);

  // Sprint 12.1.b — rejection-aware horizon when debt stock exceeds income
  if ((finHorizon.dti_ratio || 0) >= 1) {
    return _horizonPlanCardOpen(diag, st, "border-color:rgba(255,211,111,.22);background:rgba(255,211,111,.05);")
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:24px;font-weight:900;color:#ffd36f;line-height:1.3;margin-bottom:12px;">Tu deuda acumulada ya puede estar pesando en la evaluación</div>'
      + '<div style="font-size:13px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:10px;">El total de deuda que declaraste supera tu ingreso mensual. Aunque no tengas pagos activos registrados, este nivel de deuda puede influir en una futura evaluación.</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">'
      + _rejectionCopy(
          "Como este diagnóstico parte de una solicitud rechazada, conviene revisar si esta deuda tiene pagos, refinanciaciones o información adicional que todavía no fue incorporada.",
          "Con una relación deuda/ingreso elevada, conviene revisar si esta deuda tiene pagos, refinanciaciones o información adicional que todavía no fue incorporada."
        )
      + '</div>'
      + _retryHorizonAddonHtml(diag, st, coherence)
      + '</div>';
  }

  var horizonLabel = h.label;
  var isPositiveHorizon = h.banda === "inmediato" || h.banda === "corto";
  var isLowConfidencePositiveHorizon =
    iv2.confidence_level === "low"
    && isPositiveHorizon;

  if (isLowConfidencePositiveHorizon) {
    if (incomplete) {
      return _horizonPlanCardOpen(diag, st, "border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);")
        + '<div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.55;margin-bottom:8px;">'
        + "Completá la información pendiente para obtener una evaluación más precisa."
        + "</div>"
        + _retryHorizonAddonHtml(diag, st, coherence)
        + "</div>";
    }
    return _horizonPlanCardOpen(diag, st, "border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);")
      + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
      + '<div style="font-size:22px;font-weight:900;color:#8390b5;line-height:1.3;margin-bottom:10px;">Necesitamos completar tu diagnóstico</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:10px;">Hay señales positivas en la información que registraste, pero todavía faltan datos para estimar con confianza un horizonte de recalificación.</div>'
      + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">Completá la información pendiente para obtener una evaluación más precisa.</div>'
      + _retryHorizonAddonHtml(diag, st, coherence)
      + '</div>';
  }

  var col  = isPositiveHorizon ? "#34ffaf" : h.banda === "medio" ? "#ffd36f" : "#8390b5";
  var bg   = isPositiveHorizon ? "rgba(52,255,175,.06)"  : h.banda === "medio" ? "rgba(255,211,111,.06)"  : "rgba(255,255,255,.03)";
  var bord = isPositiveHorizon ? "rgba(52,255,175,.2)"   : h.banda === "medio" ? "rgba(255,211,111,.18)"  : "rgba(255,255,255,.08)";
  return _horizonPlanCardOpen(diag, st, "border-color:" + bord + ";background:" + bg + ";")
    + '<div style="font-size:13px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Horizonte estimado para recalificar</div>'
    + '<div style="font-size:26px;font-weight:900;color:' + col + ';line-height:1.25;margin-bottom:10px;">' + horizonLabel + '</div>'
    + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">Basado en la información declarada, sin nuevas deudas y siguiendo el plan. El historial del sistema financiero puede incluir elementos que esta simulación no alcanza a ver.</div>'
    + _retryHorizonAddonHtml(diag, st, coherence)
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
// Optional st — when hierarchy primary is complete_expenses, injects contextual CTA after primer paso.

// =============================================================================
// NARRATIVE-03 — Explanation / "Qué está pasando" narrative consumption
// GUARDRAIL:
// GUARDRAIL (NARRATIVE-04): Hero, Explanation and Next Step may consume narrative_decision.
// Recommendations, Actions, CRM, GTM/GA4 must not consume narrative_decision.
// =============================================================================

var _EXPLANATION_NARRATIVE_CAUSAS = {
  CLARITY: ["falta_organizacion", "sin_accion"],
  RECOVERY: ["flujo_negativo", "mora_activa", "estres_alto", "presion_informal", "deuda_cara", "demasiadas_deudas", "deterioro_estructural"],
  STABILIZATION: ["stock_deuda_alto"],
  OPTIMIZATION: ["sin_accion"],
};

var _EXPLANATION_CLARITY_TEXT =
  "El panorama financiero no está completamente claro, lo que dificulta detectar por dónde empezar.";
var _EXPLANATION_RECOVERY_FLUJO_TEXT =
  "Los pagos actuales superan el ingreso disponible. El margen mensual real es negativo.";
var _EXPLANATION_RECOVERY_MORA_TEXT =
  "Hay deudas en atraso o mora activa que están afectando el perfil financiero hoy.";
var _EXPLANATION_STABILIZATION_STOCK_TEXT =
  "El flujo mensual puede parecer manejable, pero el volumen total de deuda acumulada sigue siendo un factor importante.";

function _explanationNarrativaTextoForMode(diag, mode) {
  var iv2 = diag && diag.interpretacion_v2;
  if (!iv2 || !iv2.narrativa_jerarquizada) return null;
  var allowed = _EXPLANATION_NARRATIVE_CAUSAS[mode];
  if (!allowed) return null;
  var n = getNarrativaByTipo(iv2.narrativa_jerarquizada, "problema_principal");
  if (!n || !n.texto || allowed.indexOf(n.causa) < 0) return null;
  return n.texto;
}

function _resolveExplanationOptimizationText(diag, st) {
  var fin = (diag && diag.fin) || {};
  var costoNivel = String(fin.costoDeudaNivel || "").toLowerCase();
  var hasActiveDebts = _hasActiveDebtsFromState(st);
  if (!hasActiveDebts) return _WHAT_IS_HAPPENING_HEALTHY_ZERO_DEBT;
  if (costoNivel === "alto") return _WHAT_IS_HAPPENING_HEALTHY_ALTO;
  return _WHAT_IS_HAPPENING_HEALTHY_MEDIO_BAJO;
}

function _explanationNarrativeBaseTextForMode(mode, diag, st) {
  diag = diag || {};
  switch (mode) {
    case "CLARITY":
      return _explanationNarrativaTextoForMode(diag, mode)
        || _EXPLANATION_CLARITY_TEXT
        || _heroPlanProblema(1)
        || (diag.plan && diag.plan.problema);
    case "RECOVERY":
      return _explanationNarrativaTextoForMode(diag, mode)
        || _EXPLANATION_RECOVERY_FLUJO_TEXT
        || _EXPLANATION_RECOVERY_MORA_TEXT
        || _heroPlanProblema(2)
        || (diag.plan && diag.plan.problema);
    case "STABILIZATION":
      return _explanationNarrativaTextoForMode(diag, mode)
        || _EXPLANATION_STABILIZATION_STOCK_TEXT
        || _heroPlanProblema(4)
        || (diag.plan && diag.plan.problema);
    case "OPTIMIZATION":
      return _explanationNarrativaTextoForMode(diag, mode)
        || _resolveExplanationOptimizationText(diag, st)
        || _heroPlanProblema(3)
        || (diag.plan && diag.plan.problema);
    default:
      return null;
  }
}

function _applyExplanationNarrativeProfileTierTone(text, profileTier, narrativeMode) {
  if (!text || !profileTier || !narrativeMode) return text;
  var tier = String(profileTier).trim().toUpperCase();
  // Tone only — profile_tier must never change the selected explanation family.
  if (tier === "UNKNOWN" && narrativeMode === "CLARITY") {
    if (text.indexOf("estimad") < 0 && text.indexOf("completamente claro") >= 0) {
      return text + " Con la información actual, el diagnóstico todavía tiene margen de mejora.";
    }
  }
  if (tier === "AT_RISK" && narrativeMode === "RECOVERY") {
    if (text.indexOf("mora") < 0 && text.indexOf("superan el ingreso") < 0) {
      return _EXPLANATION_RECOVERY_MORA_TEXT;
    }
  }
  if (tier === "IMPROVING" && narrativeMode === "STABILIZATION") {
    if (text === _EXPLANATION_STABILIZATION_STOCK_TEXT) return text;
  }
  if (tier === "HEALTHY" && narrativeMode === "OPTIMIZATION") {
    if (text.indexOf("perfil ordenado") < 0 && text.indexOf("equilibrio") < 0) {
      return _WHAT_IS_HAPPENING_HEALTHY_MEDIO_BAJO;
    }
  }
  return text;
}

function _resolveExplanationQueEstaPasandoLegacy(diag, st, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, st);
  if (coherence.whatIsHappeningText != null) return coherence.whatIsHappeningText;
  var iv2 = diag && diag.interpretacion_v2;
  if (!iv2 || !iv2.narrativa_jerarquizada) return null;
  var nPrincipal = getNarrativaByTipo(iv2.narrativa_jerarquizada, "problema_principal");
  return nPrincipal && nPrincipal.texto ? nPrincipal.texto : null;
}

function resolveExplanationQueEstaPasando(diag, st, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, st);
  diag = diag || _diag();
  st = st || _st();

  var narrativeMode = _normalizeHeroNarrativeMode(diag.narrative_decision);
  if (!narrativeMode) {
    return {
      text: _resolveExplanationQueEstaPasandoLegacy(diag, st, coherence),
      source: "legacy",
      narrativeMode: null,
      profileTier: null,
    };
  }

  if (_isCzDevMode()) {
    try { console.log("[CZ Explanation] narrative_mode:", narrativeMode); } catch (e) {}
  }

  var profileTier = diag.narrative_decision && diag.narrative_decision.profile_tier
    ? String(diag.narrative_decision.profile_tier).trim().toUpperCase()
    : null;

  var text = null;
  if (coherence.whatIsHappeningText != null) {
    text = coherence.whatIsHappeningText;
  } else {
    text = _explanationNarrativeBaseTextForMode(narrativeMode, diag, st);
    if (!text) {
      text = _resolveExplanationQueEstaPasandoLegacy(diag, st, coherence);
    }
  }
  text = _applyExplanationNarrativeProfileTierTone(text, profileTier, narrativeMode);

  return {
    text: text,
    source: "narrative",
    narrativeMode: narrativeMode,
    profileTier: profileTier,
  };
}

function renderNarrativaInterpretacion(diag, st, coherence) {
  var iv2 = diag.interpretacion_v2;
  if (!iv2 || !iv2.narrativa_jerarquizada) return "";
  st = st || _st();
  coherence = coherence || resolveDashboardCoherence(diag, st);

  if (isIncompleteFinancialProfile(diag, st)) {
    return _renderIncompleteProfileNarrativeHtml(diag, st);
  }

  var nPresion   = getNarrativaByTipo(iv2.narrativa_jerarquizada, "presion_dominante");
  var nRecup     = getNarrativaByTipo(iv2.narrativa_jerarquizada, "recuperabilidad");
  var nextStepResolved = resolveNextStepContent(diag, st, coherence);
  var textoPaso = coherence.suppressOrdenarPanorama
    ? nextStepResolved.text
    : (nextStepResolved.text || null);
  var explanationContent = resolveExplanationQueEstaPasando(diag, st, coherence);
  var textoPrincipal = explanationContent.text;
  var injectedCtaHtml = _resolveDiagnosisInjectedCtaHtml(diag, st);

  var block = function(label, text, isLead) {
    if (!text) return "";
    var bodyClass = isLead
      ? "dash-narrativa-body dash-narrativa-body--lead"
      : "dash-narrativa-body";
    return '<div class="dash-narrativa-block">'
      + '<div class="dash-narrativa-block-label">' + label + "</div>"
      + '<div class="' + bodyClass + '">' + text + "</div>"
      + "</div>";
  };

  // Skip presion_dominante if patron is sin_patron AND confidence is not low.
  var showPresion = !(iv2.patron_deuda === "sin_patron" && iv2.confidence_level !== "low");

  var heroOwnsNextStep = !!(
    coherence &&
    coherence.nextStepText &&
    !isIncompleteFinancialProfile(diag, st)
  );

  var confidenceNote = "";
  if (injectedCtaHtml && st.gastos_missing_confirmed) {
    confidenceNote = '<div style="margin-top:14px;padding-top:14px;'
      + 'border-top:1px solid rgba(255,255,255,.07);'
      + 'font-size:13px;color:#8390b5;line-height:1.6;">'
      + 'Este diagnóstico todavía puede mejorar si completás la información de tus gastos mensuales.'
      + '</div>';
  } else if (iv2.confidence_level === "low") {
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

  return '<div class="plan-card dash-tier-a dash-narrativa-card" style="' + _dashPlanColorStyle(diag.plan && diag.plan.color) + '">'
    + renderRecuperabilidadBadge(iv2)
    + block("Qué está pasando",        textoPrincipal, true)
    + (showPresion ? block("Presión principal",          nPresion  ? nPresion.texto  : null) : "")
    + block("Capacidad de recuperación", nRecup     ? nRecup.texto    : null)
    + (heroOwnsNextStep ? "" : block("Primer paso recomendado", textoPaso))
    + injectedCtaHtml
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
  st = st || _st();
  diag = diag || _diag();

  if (isIncompleteFinancialProfile(diag, st)) {
    return '<div class="plan-card dash-situacion-hoy-card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);">'
      + '<div style="font-size:20px;font-weight:800;margin-bottom:14px;line-height:1.3;">📌 Tu situación hoy</div>'
      + '<div style="font-size:14px;color:#8390b5;margin-bottom:16px;line-height:1.5;">' + _lineaDiaEvaluacion(st) + "</div>"
      + '<p style="font-size:16px;color:rgba(255,255,255,.92);line-height:1.65;margin:0 0 12px;">'
      + "Todavía no tenemos información suficiente para evaluar con precisión tu situación financiera."
      + "</p>"
      + '<p style="font-size:15px;color:rgba(255,255,255,.75);line-height:1.65;margin:0 0 16px;">'
      + "Antes de estimar posibilidades de mejora o recuperación, necesitamos completar el panorama de gastos y obligaciones mensuales."
      + "</p>"
      + '<div style="padding:14px 16px;background:rgba(255,196,0,.08);border:1px solid rgba(255,196,0,.2);border-radius:12px;font-size:15px;color:#ffd447;font-weight:700;line-height:1.65;">'
      + "Próximo paso recomendado: completar tus gastos mensuales."
      + "</div>"
      + _renderSituacionHoyEditGastosCta()
      + "</div>";
  }

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

  return '<div class="plan-card dash-situacion-hoy-card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);">'
    + '<div style="font-size:20px;font-weight:800;margin-bottom:14px;line-height:1.3;">📌 Tu situación hoy</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:16px;line-height:1.5;">' + _lineaDiaEvaluacion(st) + "</div>"
    + '<p style="font-size:16px;color:rgba(255,255,255,.92);line-height:1.65;margin:0 0 12px;">' + primaryText + "</p>"
    + '<p style="font-size:15px;color:rgba(255,255,255,.75);line-height:1.65;margin:0;">' + consequenceText + "</p>"
    + secondaryHtml
    + _renderSituacionHoyEditGastosCta()
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

  if (!st.snap && (isNaN(diagPlan) || diagPlan >= 4)) return "hidden";

  if (typeof isRetryEligible === "function") {
    return isRetryEligible(diag, st) ? "unlocked" : "locked";
  }

  return "locked";
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
  return "Con los datos actuales, conviene revisar si cambió algo material en tu perfil declarado.";
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

function _dashZoneOpen(zoneKey, extraStyle, extraClass) {
  return '<div class="dash-zone dash-zone-' + zoneKey + (extraClass ? " " + extraClass : "")
    + '" style="max-width:100%;box-sizing:border-box;' + (extraStyle || "") + '">';
}

function _dashZoneClose() {
  return "</div>";
}

function _dashZoneGapSpacerHtml() {
  return '<div class="dash-zone-gap" aria-hidden="true" style="max-width:100%;box-sizing:border-box;'
    + CZ_DASH_ZONE_GAP + '"></div>';
}

function _horizonPlanCardOpen(diag, st, inlineStyle) {
  var compact = isIncompleteFinancialProfile(diag, st);
  return '<div class="plan-card dash-tier-b dash-horizon-card' + (compact ? " dash-horizon-compact" : "") + '" style="' + (inlineStyle || "") + '">';
}

function _renderNumerosAccordionShell(innerHtml) {
  return '<div class="accordion-item dash-numeros-accordion" id="cz-dash-numeros">'
    + '<button type="button" class="accordion-trigger dash-numeros-trigger" data-dash-accordion '
    + 'id="btn-dash-numeros-toggle" aria-expanded="false" aria-controls="cz-dash-numeros-body">'
    + '<div class="dash-numeros-trigger-label">'
    + '<span class="dash-numeros-trigger-icon" aria-hidden="true">' + _dashIaIcon("numeros") + "</span>"
    + '<span class="dash-numeros-trigger-title">Tus números</span>'
    + "</div>"
    + '<span class="dash-numeros-toggle-text">Ver detalles <span class="chevron" aria-hidden="true">▼</span></span>'
    + "</button>"
    + '<div class="accordion-body" id="cz-dash-numeros-body">'
    + innerHtml
    + "</div>"
    + "</div>";
}

// =============================================================================
// NARRATIVE-02 — Hero narrative consumption (content-selection layer only)
// GUARDRAIL (NARRATIVE-04): Hero, Explanation and Next Step may consume narrative_decision.
// Recommendations, Actions, CRM, GTM/GA4 must not consume narrative_decision.
// =============================================================================

var _HERO_NARRATIVE_MODES = ["CLARITY", "RECOVERY", "STABILIZATION", "OPTIMIZATION"];

var _HERO_NARRATIVE_STABILIZATION_PROBLEMA =
  "El flujo mensual puede parecer manejable, pero el volumen total de deuda acumulada sigue siendo un factor importante.";

function _isCzDevMode() {
  try {
    return typeof window !== "undefined" && window.location
      && String(window.location.search || "").indexOf("czdev=true") !== -1;
  } catch (e) {
    return false;
  }
}

function _normalizeHeroNarrativeMode(nd) {
  if (!nd || typeof nd !== "object" || Array.isArray(nd)) return null;
  if (nd.narrative_mode == null || nd.narrative_mode === "") return null;
  var s = String(nd.narrative_mode).trim().toUpperCase();
  return _HERO_NARRATIVE_MODES.indexOf(s) >= 0 ? s : null;
}

function _heroPlanProblema(planId) {
  if (typeof PLANES === "undefined" || !PLANES) return null;
  var p = PLANES[planId];
  return p && p.problema ? p.problema : null;
}

function _heroNarrativaProblemaForMode(diag, mode) {
  var iv2 = diag && diag.interpretacion_v2;
  if (!iv2 || !iv2.narrativa_jerarquizada) return null;
  var causasByMode = {
    CLARITY: { problema_principal: ["falta_organizacion", "sin_accion"] },
    RECOVERY: { problema_principal: ["flujo_negativo", "mora_activa", "estres_alto", "presion_informal", "deuda_cara", "demasiadas_deudas", "deterioro_estructural"] },
    STABILIZATION: { problema_principal: ["stock_deuda_alto"] },
    OPTIMIZATION: { problema_principal: ["sin_accion"] },
  };
  var allowed = causasByMode[mode];
  if (!allowed) return null;
  var ppCausas = allowed.problema_principal;
  if (ppCausas) {
    var n = getNarrativaByTipo(iv2.narrativa_jerarquizada, "problema_principal");
    if (n && n.texto && ppCausas.indexOf(n.causa) >= 0) return n.texto;
  }
  return null;
}

function _heroNarrativeBaseProblemForMode(mode, diag, st) {
  diag = diag || {};
  var plan = diag.plan || {};
  switch (mode) {
    case "CLARITY":
      return _heroNarrativaProblemaForMode(diag, mode)
        || _heroPlanProblema(1)
        || plan.problema;
    case "RECOVERY":
      return _heroNarrativaProblemaForMode(diag, mode)
        || _heroPlanProblema(2)
        || _heroPlanProblema(4)
        || plan.problema;
    case "STABILIZATION":
      return _heroNarrativaProblemaForMode(diag, mode)
        || _HERO_NARRATIVE_STABILIZATION_PROBLEMA
        || _heroPlanProblema(4)
        || plan.problema;
    case "OPTIMIZATION":
      if (_isZeroActiveDebtCompleteProfile(diag, st)) return _ZERO_ACTIVE_DEBT_HERO_PROBLEMA;
      return _heroNarrativaProblemaForMode(diag, mode)
        || _heroPlanProblema(3)
        || plan.problema;
    default:
      return null;
  }
}

function _applyHeroNarrativeProfileTierTone(problem, profileTier, narrativeMode) {
  if (!problem || !profileTier || !narrativeMode) return problem;
  var tier = String(profileTier).trim().toUpperCase();
  // Tone only — profile_tier must never change the selected Hero family.
  if (tier === "AT_RISK" && narrativeMode === "RECOVERY") {
    var criticalCopy = _heroPlanProblema(4);
    var pressureCopy = _heroPlanProblema(2);
    if (criticalCopy && problem === pressureCopy) return criticalCopy;
  }
  if (tier === "HEALTHY" && narrativeMode === "OPTIMIZATION") {
    var plan3Copy = _heroPlanProblema(3);
    var positiveTone =
      "Tu perfil financiero está en orden. El foco es sostener pagos en fecha y evitar nueva deuda.";
    if (plan3Copy && problem === plan3Copy) return positiveTone;
  }
  return problem;
}

function _resolveHeroContentLegacy(diag, st, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, st);
  diag = diag || {};
  st = st || _st();
  if (isIncompleteFinancialProfile(diag, st)) {
    return {
      incomplete: true,
      source: "legacy",
      narrativeMode: null,
      profileTier: null,
    };
  }
  var plan = diag.plan || {};
  var problem = coherence.heroProblemOverride != null
    ? coherence.heroProblemOverride
    : _resolveZeroActiveDebtHeroProblema(diag, st, plan.problema);
  return {
    incomplete: false,
    source: "legacy",
    narrativeMode: null,
    profileTier: null,
    problem: problem,
    nextAction: _resolveHeroNextActionText(diag, st, coherence),
    statusLabel: resolvePlanStatusLabel(diag, st, coherence),
    plan: plan,
  };
}

function resolveHeroContent(diag, st, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, st);
  diag = diag || _diag();
  st = st || _st();

  var narrativeMode = _normalizeHeroNarrativeMode(diag.narrative_decision);
  if (!narrativeMode) {
    return _resolveHeroContentLegacy(diag, st, coherence);
  }

  if (_isCzDevMode()) {
    try { console.log("[CZ Hero] narrative_mode:", narrativeMode); } catch (e) {}
  }

  var profileTier = diag.narrative_decision && diag.narrative_decision.profile_tier
    ? String(diag.narrative_decision.profile_tier).trim().toUpperCase()
    : null;

  if (isIncompleteFinancialProfile(diag, st)) {
    return {
      incomplete: true,
      source: "narrative",
      narrativeMode: narrativeMode,
      profileTier: profileTier,
    };
  }

  var problem = null;
  if (coherence.heroProblemOverride != null) {
    problem = coherence.heroProblemOverride;
  } else {
    problem = _heroNarrativeBaseProblemForMode(narrativeMode, diag, st);
    if (!problem) {
      problem = _resolveZeroActiveDebtHeroProblema(diag, st, (diag.plan || {}).problema);
    }
  }
  problem = _applyHeroNarrativeProfileTierTone(problem, profileTier, narrativeMode);

  return {
    incomplete: false,
    source: "narrative",
    narrativeMode: narrativeMode,
    profileTier: profileTier,
    problem: problem,
    nextAction: _resolveHeroNextActionText(diag, st, coherence),
    statusLabel: resolvePlanStatusLabel(diag, st, coherence),
    plan: diag.plan || {},
  };
}

function _resolveHeroNextActionText(diag, st, coherence) {
  coherence = coherence || resolveDashboardCoherence(diag, st);
  if (isIncompleteFinancialProfile(diag, st)) return null;
  if (coherence.nextStepText) return coherence.nextStepText;
  return _resolveDashboardNextStepText(diag, st);
}

// FIX-01B-2 — visible plan title alignment (display layer; motor PLANES.titulo unchanged)
var _FIX01B2_PLAN_TITLE_DISPLAY = Object.freeze({
  1: "Claridad Financiera",
  5: "Reconstrucción Crediticia",
});

function _visiblePlanTitle(plan) {
  plan = plan || {};
  var id = parseInt(plan.id, 10);
  if (!isNaN(id) && _FIX01B2_PLAN_TITLE_DISPLAY[id]) {
    return _FIX01B2_PLAN_TITLE_DISPLAY[id];
  }
  return plan.titulo || "Tu plan";
}

function _renderDashboardHeroCard(diag, st, coherence) {
  diag = diag || _diag();
  st = st || _st();
  coherence = coherence || resolveDashboardCoherence(diag, st);
  var pc = (diag.plan && diag.plan.color) ? diag.plan.color : "#40d7ff";
  var heroContent = resolveHeroContent(diag, st, coherence);

  if (heroContent.incomplete) {
    var showGastosCta = _heroShowsExpensesCta(diag, st);
    var showDebtsCta = _heroShowsDebtsCta(diag, st);
    var heroCtaHtml = showGastosCta
      ? _renderCompleteExpensesCtaHtml({
          primary: true,
          marginTop: "0",
          buttonLabel: "Completar gastos",
        })
      : (showDebtsCta ? _renderHeroDebtsCtaHtml() : "");
    return '<div class="cz-hero-card plan-card dash-tier-a" id="cz-dashboard-hero" style="border-color:rgba(255,211,111,.45);'
      + 'background:linear-gradient(165deg,rgba(255,211,111,.12) 0%,rgba(255,255,255,.04) 55%);'
      + 'padding:24px 22px;margin-bottom:4px;">'
      + '<div style="font-size:12px;font-weight:800;color:#ffd447;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">'
      + "Paso prioritario"
      + "</div>"
      + '<div style="font-size:26px;font-weight:900;color:rgba(255,255,255,.96);line-height:1.25;margin-bottom:12px;">'
      + "Tu diagnóstico todavía no está completo"
      + "</div>"
      + '<div style="font-size:16px;color:rgba(255,255,255,.82);line-height:1.65;margin-bottom:18px;">'
      + "Nos falta conocer algunos datos para estimar con mayor precisión tu situación financiera."
      + "</div>"
      + heroCtaHtml
      + '<div style="margin-top:14px;font-size:13px;color:#8390b5;line-height:1.6;">'
      + "Completá la información pendiente para mejorar la precisión de tu diagnóstico."
      + "</div>"
      + "</div>";
  }

  var plan = heroContent.plan || diag.plan || {};
  var heroProblema = heroContent.problem;
  var statusLabel = heroContent.statusLabel;
  var nextAction = heroContent.nextAction;

  return '<div class="cz-hero-card plan-card dash-tier-a" id="cz-dashboard-hero" style="border-color:' + pc + '55;'
    + 'background:linear-gradient(165deg,' + pc + '18 0%,rgba(255,255,255,.04) 58%);'
    + 'padding:24px 22px;margin-bottom:4px;">'
    + '<div style="font-size:12px;font-weight:800;color:' + pc + ';text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">'
    + "Tu panorama actual"
    + "</div>"
    + '<div style="font-size:26px;font-weight:900;color:rgba(255,255,255,.96);line-height:1.25;margin-bottom:10px;">'
    + (plan.icon || "") + " " + _visiblePlanTitle(plan)
    + "</div>"
    + '<div style="margin-bottom:14px;">'
    + _renderPlanStatusLabelHtml(statusLabel)
    + "</div>"
    + (heroProblema
        ? '<div style="font-size:15px;color:#8390b5;line-height:1.65;margin-bottom:14px;">' + heroProblema + "</div>"
        : "")
    + (nextAction
        ? '<div style="padding:14px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;">'
          + '<div style="font-size:12px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">'
          + "Próximo paso recomendado"
          + "</div>"
          + '<div style="font-size:15px;color:rgba(255,255,255,.9);line-height:1.65;">' + nextAction + "</div>"
          + "</div>"
        : "")
    + "</div>";
}

function renderPrimaryActionCard(diag, st, coherence) {
  diag = diag || _diag();
  st = st || _st();
  coherence = coherence || resolveDashboardCoherence(diag, st);

  if (isIncompleteFinancialProfile(diag, st)) {
    return "";
  }

  var nextStepResolved = resolveNextStepContent(diag, st, coherence);
  var nextStepText = (nextStepResolved.text || "").trim();
  if (!nextStepText) {
    return "";
  }

  var pc = (diag.plan && diag.plan.color) ? diag.plan.color : "#40d7ff";

  return '<div class="cz-primary-action-card" role="region" aria-label="Tu prioridad hoy" '
    + 'style="box-sizing:border-box;max-width:100%;padding:16px 20px;'
    + "background:rgba(255,255,255,.05);"
    + "border:1px solid rgba(255,255,255,.1);"
    + "border-left:4px solid " + pc + ";"
    + 'border-radius:12px;">'
    + '<div style="font-size:11px;font-weight:800;color:#8390b5;text-transform:uppercase;'
    + 'letter-spacing:.07em;margin-bottom:8px;line-height:1.4;">'
    + "Tu prioridad hoy"
    + "</div>"
    + '<div class="cz-primary-action-card-body" style="font-size:16px;color:rgba(255,255,255,.92);'
    + 'line-height:1.65;">'
    + nextStepText
    + "</div>"
    + "</div>";
}

// =============================================================================
// TAB: MI PLAN
// =============================================================================
function renderLowExpensesConfirmCard(diag, st) {
  diag = diag || _diag();
  st = st || _st();
  if (typeof shouldShowLowExpensesConfirmCard !== "function") return "";
  if (!shouldShowLowExpensesConfirmCard(st, diag)) return "";

  return '<div class="plan-card cz-low-expenses-confirm-card" id="cz-low-expenses-confirm" '
    + 'role="region" aria-label="Confirmación de gastos mensuales" '
    + 'style="border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.03);margin-bottom:4px;">'
    + '<div style="font-size:18px;font-weight:800;color:rgba(255,255,255,.92);line-height:1.35;margin-bottom:12px;">'
    + "¿Tus gastos mensuales están completos?"
    + "</div>"
    + '<div style="font-size:14px;color:#8390b5;line-height:1.65;margin-bottom:18px;">'
    + "Queremos asegurarnos de que tu diagnóstico refleje tu situación real.<br><br>"
    + "Si te faltó agregar algún costo fijo o gasto habitual, podés sumarlo ahora. "
    + "Si los datos son correctos, simplemente confirmalo."
    + "</div>"
    + '<button type="button" class="btn btn-primary" id="btn-low-expenses-add-gastos" '
    + 'style="width:100%;height:52px;font-size:16px;box-sizing:border-box;margin-bottom:10px;">'
    + "✏️ Agregar más gastos"
    + "</button>"
    + '<button type="button" class="btn btn-secondary" id="btn-low-expenses-confirm" '
    + 'style="width:100%;height:44px;font-size:15px;box-sizing:border-box;opacity:.88;">'
    + "✓ Mis gastos son correctos"
    + "</button>"
    + "</div>";
}

function renderTabPlan() {
  var diag   = _diag();
  var st     = _st();
  var coherence = resolveDashboardCoherence(diag, st);
  var fin    = diag.fin;
  var pc     = diag.plan.color;
  var prio   = diag.prio;
  var behEnc = (typeof getBehavioralEncForDisplay === "function")
    ? getBehavioralEncForDisplay(st, diag)
    : (diag && diag.enc ? diag.enc : null);
  var hasBehav = (typeof hasBehavioralSurveyData === "function")
    ? hasBehavioralSurveyData(st, diag)
    : !!TIENE_ENCUESTA;
  var showBehavCta = (typeof shouldShowBehavioralRefinementCta === "function")
    ? shouldShowBehavioralRefinementCta(st, diag)
    : false;
  var _finScoreLabel = isIncompleteFinancialProfile(diag, st)
    ? _incompleteFinancialScoreLabel()
    : _scoreFinancieroLabel(fin.scoreFinanciero);
  var _behScoreLabel = _scoreConductualLabel(hasBehav && behEnc ? behEnc.score : null);
  var _incompleteProfile = isIncompleteFinancialProfile(diag, st);
  var _zeroPaymentDebtClarification = _shouldShowZeroPaymentDebtClarification(st)
    ? _renderZeroPaymentDebtClarificationHtml()
    : "";

  // Sprint 9 — gastos missing warning card (suppressed when Hero Card covers incomplete state)
  var _gastosMissingCard = (st.gastos_missing_confirmed && !_incompleteProfile)
    ? '<div style="background:rgba(255,196,0,.08);border:1px solid rgba(255,196,0,.25);border-radius:14px;padding:14px 18px;margin-bottom:16px;font-size:14px;color:#ffd447;line-height:1.6;">'
      + '⚠️ Este diagnóstico no incluye tus gastos mensuales. Algunas proyecciones pueden ser menos precisas.'
      + '</div>'
    : '';
  var _earlyExpensesCta = _shouldShowEarlyExpensesCta(diag, st)
    ? '<div style="margin-bottom:16px;">'
      + _renderCompleteExpensesCtaHtml({ primary: true, marginTop: "0" })
      + '</div>'
    : '';

  var _profileFirstName = (typeof getProfileFirstName === "function") ? getProfileFirstName(st) : "";
  var _greetingHtml = _profileFirstName
    ? '<div style="font-size:28px;font-weight:900;color:rgba(255,255,255,.95);margin-bottom:18px;">Hola '
      + (typeof _plusEsc === "function" ? _plusEsc(_profileFirstName) : _profileFirstName)
      + "</div>"
    : "";

  return '<div class="fade">'
    + _greetingHtml
    + '<div class="dash-hierarchy">'

    // 1 — Hero Card
    + _dashZoneOpen("hero")
    + _renderDashboardHeroCard(diag, st, coherence)
    + _dashZoneClose()

    + (function() {
        var primaryHtml = renderPrimaryActionCard(diag, st, coherence);
        if (!primaryHtml) return "";
        return _dashZoneGapSpacerHtml() + primaryHtml + _dashZoneGapSpacerHtml();
      })()

    // 2 — Tu situación actual (primary diagnosis)
    + _dashZoneOpen("diagnostico", CZ_DASH_ZONE_GAP)
    + _gastosMissingCard
    + _earlyExpensesCta
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
    + (!_incompleteProfile
        ? '<div class="plan-card" style="border-color:' + pc + '33;">'
          + '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:18px;">'
          + '<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Que busca este plan</div>'
          + '<div style="font-size:19px;color:rgba(255,255,255,.9);line-height:1.6;">' + diag.plan.objetivo + '</div>'
          + '</div>'
          + ((diag.planId === 4 || diag.nivelR === "C")
              ? '<div style="margin-top:14px;font-size:12px;color:#8390b5;line-height:1.6;">ℹ️ Este plan se basa en tu situación al momento del diagnóstico. Los cambios que hacés en deudas o gastos actualizan la simulación, pero el punto de partida sigue siendo tu evaluación original.</div>'
              : '')
          + '</div>'
        : '')
    + renderNarrativaInterpretacion(diag, st, coherence)
    + _dashIaSectionClose()
    + _dashZoneClose()

    // 3 — Low-expenses confirmation (dashboard-only contextual card)
    + _dashZoneOpen("low-expenses-confirm", CZ_DASH_ZONE_GAP)
    + renderLowExpensesConfirmCard(diag, st)
    + _dashZoneClose()

    // 4 — Qué hacer ahora (+ horizonte, acciones)
    + _dashZoneOpen("accion", CZ_DASH_ZONE_GAP, _incompleteProfile ? "dash-accion-compact" : "")
    + _dashIaSectionOpen(true, "accion")
    + _dashIaLabel("Qué hacer ahora", "accion")
    + renderHorizonteRecalificacion(diag, st, coherence)
    // Sprint B3a — Hidden Factor inline card removed; dash-zone-plus is canonical Plus offer.
    // detectHiddenFactorOpportunity() preserved for future use outside this tab.
    + '<div style="display:none;height:0;overflow:hidden;">' + renderAccionPrioritaria(diag) + '</div>'
    + (function() {
        if (coherence.hideAccionPrioritaria) return "";
        var nextStepResolved = resolveNextStepContent(diag, st, coherence);
        var textoAccion = nextStepResolved.text;
        if (!textoAccion) return "";
        return '<div class="plan-card dash-tier-b dash-accion-prioritaria-card" style="border-color:rgba(255,255,255,.1);'
          + _dashSectionAccentCss("accion") + '">'
          + _dashCardTitle("📍", "Acción prioritaria", "accion")
          + '<div style="padding:14px 16px;background:rgba(255,255,255,.04);'
          + 'border:1px solid rgba(255,255,255,.09);border-radius:12px;">'
          + '<div style="font-size:15px;color:rgba(255,255,255,.9);line-height:1.65;">'
          + textoAccion
          + '</div></div></div>';
      })()
    + (prio ? _renderDashboardPriorityCard(diag, st, prio) : "")
    + _dashIaSectionClose()
    + _dashZoneClose()

    // 4 — Qué está frenando tu perfil (+ relación deuda/ingreso)
    + (_shouldRenderFrenandoSection(diag, coherence)
        ? _dashZoneOpen("frenando", CZ_DASH_ZONE_GAP, "dash-zone-density")
          + _dashIaSectionOpen(false, "frenando")
          + (!_shouldHideBlockersContent(diag, coherence)
              ? _dashIaLabel("Qué está frenando tu perfil", "frenando")
                + renderBloqueadores(diag)
                + renderPlan4SinDeudaActivaExplicacion(diag)
              : "")
          + (_shouldShowRelacionDeudaIngresoSection(diag)
              ? renderRelacionDeudaIngreso(diag)
              : "")
          + _dashIaSectionClose()
          + _dashZoneClose()
        : "")

    // 5 — Mi Plan Plus
    + _dashZoneOpen("plus", CZ_DASH_ZONE_GAP)
    + '<div class="plan-card dash-plus-lite" id="cz-plus-entry">'
    + '<div class="dash-plus-kicker">★ Mi Plan Plus</div>'
    + '<div class="dash-plus-body">Mi Plan Plus contrasta esta información con registros de BCU y Clearing para detectar diferencias, acreedores no declarados y otros factores que podrían estar afectando tu perfil financiero.</div>'
    + '<button class="btn btn-primary" id="btn-conocer-plus" style="width:100%;">Ver mi situación real</button>'
    + '</div>'
    + _dashZoneClose()

    // 6 — Acciones recomendadas (visible by default)
    + _dashZoneOpen("acciones-recom", CZ_DASH_ZONE_GAP)
    + renderHerramientas()
    + renderContextualActionBlock(resolveContextualActionSegment(diag, st))
    + _dashZoneClose()

    // 7 — Tu situación hoy
    + _dashZoneOpen("situacion-hoy", CZ_DASH_ZONE_GAP, "dash-zone-density")
    + _renderTuSituacionHoy(diag, st)
    + _dashZoneClose()

    // 8 — Tus números (collapsed accordion)
    + _dashZoneOpen("numeros", CZ_DASH_ZONE_GAP)
    + _renderNumerosAccordionShell(
        // Sprint B2f — Edit Expenses CTA lives only in Tu situación hoy (#btn-editar-gastos-situacion-hoy).
        renderRecommendedToolsSection(diag)
        + renderRadiografia()
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
        var flujoMetric = _incompleteProfile
          ? {
              l: "PLATA LIBRE REAL",
              v: "Pendiente de calcular",
              c: "#8390b5",
              s: "Completá tus gastos para ver este número.",
            }
          : {
              l: "Plata que te sobra/mes",
              v: fmt(fin.flujoLibre),
              c: flujoColor,
              s: flujoSub,
            };
        return '<div class="metrics">'
          + [
              flujoMetric,
              { l: "Total de deudas",           v: fmt(fin.totalDeuda),               c: "#ffd36f",  s: (_st().deudas||[]).length + " deuda" + ((_st().deudas||[]).length !== 1 ? "s" : "") },
              { l: "De tu sueldo va a deudas",  v: ratioPct + "%",                    c: ratioColor, s: ratioSub },
              { l: "Pagas en cuotas por mes",   v: fmt(fin.totalPago),                c: "rgba(255,255,255,.7)", s: "suma de minimos" },
            ].map(function(m) { return '<div class="metric"><small>' + m.l + '</small><strong style="color:' + m.c + ';">' + m.v + '</strong><div style="font-size:14px;color:#8390b5;margin-top:6px;">' + m.s + '</div></div>'; }).join("")
          + flujoNote
          + '</div>';
      })()

    // 11. Composicion del perfil + progreso (contexto analitico)
    + '<div class="plan-card profile-composition-section">'
    + '<div class="profile-composition-heading">Composicion de tu perfil</div>'
    + '<div class="profile-composition-grid">'
    + renderProfileCompositionCard(
        "Situacion financiera",
        _renderProfileScoreLabelHtml(_finScoreLabel),
        _incompleteProfile ? "faltan datos para estimarla" : "gastos y deudas",
        _zeroPaymentDebtClarification
      )
    + renderProfileCompositionCard(
        "Perfil conductual",
        _renderProfileScoreLabelHtml(_behScoreLabel),
        hasBehav && behEnc && _behScoreLabel.valid ? "analisis conductual" : "sin datos adicionales",
        ""
      )
    + "</div>"
    + '<div style="margin-top:14px;font-size:15px;color:#8390b5;text-align:center;">Revision sugerida en <strong style="color:rgba(255,255,255,.8);">' + diag.plan.reevaluacion + '</strong></div>'
    + (showBehavCta
        ? '<div style="margin-top:18px;padding:16px 18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;">'
          + '<div style="font-size:14px;font-weight:800;color:rgba(255,255,255,.7);margin-bottom:8px;">Refinar diagnostico financiero</div>'
          + '<div style="font-size:13px;color:#8390b5;line-height:1.65;margin-bottom:14px;">El analisis actual se basa en tus ingresos, gastos y deudas. Responder algunas preguntas adicionales puede mejorar la precision del diagnostico.</div>'
          + '<button class="btn btn-secondary" style="height:52px;font-size:15px;" id="btn-refinar-diagnostico">Completar analisis conductual</button>'
          + '</div>'
        : "")
    + '</div>'
      )
    + _dashZoneClose()

    // 8 — Confianza del diagnóstico
    + _dashZoneOpen("confianza", CZ_DASH_ZONE_GAP)
    + renderConfianzaDiagnostico(diag)
    + _dashZoneClose()

    // 9 — Sugerencias
    + _dashZoneOpen("sugerencias", CZ_DASH_ZONE_GAP)
    + renderMiPlanSuggestionBox()
    + _dashZoneClose()

    + '</div>'
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
    var label = _feedbackCategoryLabel(cat);
    return '<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer;margin-bottom:12px;">'
      + '<input type="checkbox" class="chk-fb-cat" data-cat="' + label + '" id="chk-fb-' + i + '" '
      + 'style="width:20px;height:20px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">'
      + '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.5;">' + label + '</span>'
      + '</label>';
  }).join("");

  return '<div class="plan-card dash-sugerencias-card dash-tier-c" id="cz-feedback-box" style="border-color:rgba(255,255,255,.1);'
    + _dashSectionAccentCss("sugerencias") + '">'
    + _dashCardTitle("💬", "Sugerencias", "sugerencias")
    + '<div style="font-size:15px;color:#8390b5;line-height:1.55;margin-bottom:14px;">'
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
    + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#8390b5;"><span>Pagos activos: ' + fmt(Math.round(r.comprometido)) + '</span><span>'
    + (isIncompleteFinancialProfile(diag, st)
        ? "Flujo libre: Pendiente de calcular"
        : ((st.gastos_missing_confirmed ? "Flujo libre est. (sin gastos)" : "Flujo libre") + ": " + fmt(Math.max(0, r.flujoLibreActivo))))
    + '</span></div>'
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
  return "";
}

function renderDeudaTabEditActions(st) {
  return renderDeudaFlowActionBar(st, {
    addButtonId: "btn-add-debt",
    cancelLabel: "Cancelar",
  });
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
      + '<div class="locked-text">En cuanto tengamos tu informe Clearing real, la IA señala diferencias entre lo declarado y lo registrado y cuál es el primer paso concreto para tu caso.</div>'
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
  if (typeof window !== "undefined"
    && window.PLUS_MOCK_MODE === true
    && typeof window.renderPlusMockTab === "function") {
    return window.renderPlusMockTab(st);
  }
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
// PARTNER RECOMMENDED TOOLS — MiDeuda + future partners (Equifax, Sura, etc.)
// recommended_tools[] drives rendering; no plan-specific hardcoding.
// Contract today: ["mideuda"]. Future: [{ id, priority }].
// =============================================================================
function buildMideudaGtmPayload(diag, extra) {
  var st = _st();
  var base = {
    tool:                   "mideuda",
    source:                 "credizona_miplan",
    plan_id:                diag ? diag.planId : null,
    recommended_tools:      (diag && diag.recommended_tools) ? diag.recommended_tools.slice() : [],
    mideuda_lead_status:    st.mideuda_lead_status || "not_shown",
    mora_activa:            diag ? !!diag.mora_activa : false,
    deuda_vencida:          diag ? !!diag.deuda_vencida : false,
    flag_demasiadas_deudas: diag ? !!diag.flag_demasiadas_deudas : false,
    flag_deuda_cara:        diag ? !!diag.flag_deuda_cara : false,
    deuda_fuera_sistema:    diag ? !!diag.deuda_fuera_sistema : false,
    flag_deuda_sin_pagos:   diag ? !!diag.flag_deuda_sin_pagos : false,
  };
  if (extra) {
    Object.keys(extra).forEach(function(k) { base[k] = extra[k]; });
  }
  return base;
}

function _trackMideudaShownOnce(diag) {
  var st = _st();
  if (!diag || !diag.recommended_tools || diag.recommended_tools.indexOf("mideuda") < 0) return;
  if (st._mideudaCtaShownTracked) return;
  st._mideudaCtaShownTracked = true;
  if (st.mideuda_lead_status === "not_shown") st.mideuda_lead_status = "shown";
  st.mideuda_cta_shown = true;
  if (typeof trackEvent === "function" && typeof CZ_EVENT_NAMES !== "undefined") {
    trackEvent(CZ_EVENT_NAMES.MIDEUDA_CTA_SHOWN, buildMideudaGtmPayload(diag));
  }
  if (typeof trackCRMEvent === "function") {
    trackCRMEvent("mideuda_cta_shown", buildMideudaGtmPayload(diag));
  }
  if (typeof window.guardarLocal === "function") window.guardarLocal();
}

function renderMideudaPartnerCard(diag) {
  var logoPath = typeof MIDEUDA_LOGO_PATH !== "undefined"
    ? MIDEUDA_LOGO_PATH
    : "assets/img/partners/mideuda-logo.svg";
  var legalText = typeof MIDEUDA_OPTIN_LEGAL_TEXT !== "undefined"
    ? MIDEUDA_OPTIN_LEGAL_TEXT
    : "Acepto compartir mis datos con MiDeuda para continuar el proceso de revisión y negociación de mis deudas.";
  var st = _st();
  var feedback = st._mideudaFeedbackMsg || "";
  var optinChecked = !!st.mideuda_optin;
  var btnDisabled = !optinChecked;

  return [
    '<div class="partner-tool-card" id="mideuda-partner-card" style="',
      "background:rgba(255,255,255,.06);border:1px solid rgba(91,124,255,.22);border-radius:14px;",
      "padding:12px 14px;margin-bottom:10px;box-shadow:0 2px 14px rgba(0,0,0,.18);",
    '">',
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">',
        '<div style="display:flex;align-items:center;gap:8px;min-width:0;">',
          '<img src="' + logoPath + '" alt="MiDeuda" style="height:20px;max-width:72px;object-fit:contain;" ',
            'onerror="this.style.display=\'none\';var b=this.nextElementSibling;if(b)b.style.display=\'inline-flex\';">',
          '<span style="display:none;align-items:center;padding:3px 8px;border-radius:999px;',
            'background:rgba(91,124,255,.18);color:#40d7ff;font-size:11px;font-weight:700;">MiDeuda</span>',
        '</div>',
        '<span style="flex-shrink:0;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;',
          'color:#40d7ff;background:rgba(64,215,255,.14);border:1px solid rgba(64,215,255,.35);',
          'padding:4px 10px;border-radius:999px;">',
          'Herramienta externa',
        '</span>',
      '</div>',
      '<div style="font-size:15px;font-weight:800;color:#fff;margin:0 0 4px;line-height:1.35;">',
        'Negociar tus deudas con MiDeuda',
      '</div>',
      '<p style="font-size:13px;color:#b8c2d9;line-height:1.5;margin:0 0 10px;">',
        'Según tu diagnóstico, antes de volver a pedir crédito puede convenirte revisar opciones ',
        'para negociar o regularizar deudas formales. MiDeuda es una plataforma externa adherida.',
      '</p>',
      '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin:0 0 10px;">',
        '<input type="checkbox" id="chk-mideuda-optin"',
          (optinChecked ? " checked" : ""),
          ' style="width:16px;height:16px;margin-top:1px;flex-shrink:0;accent-color:#40d7ff;cursor:pointer;">',
        '<span style="font-size:12px;color:#c5cde0;line-height:1.45;">' + legalText + "</span>",
      "</label>",
      [
        '<button type="button" id="btn-mideuda-continue"',
        (btnDisabled ? " disabled" : ""),
        ' style="display:inline-block;max-width:300px;width:auto;border:none;border-radius:12px;',
        "padding:10px 18px;font-size:14px;font-weight:700;",
        "color:#fff;cursor:pointer;background:linear-gradient(135deg,#5b7cff 0%,#40d7ff 100%);",
        "box-shadow:0 2px 12px rgba(91,124,255,.22);opacity:",
        (btnDisabled ? ".45" : "1"),
        ';">Continuar en MiDeuda</button>',
      ].join(""),
      (feedback
        ? [
            '<div id="mideuda-feedback-msg" style="margin-top:10px;padding:10px 12px;border-radius:10px;',
            "background:rgba(52,255,175,.08);border:1px solid rgba(52,255,175,.2);",
            'font-size:12px;line-height:1.5;color:#34ffaf;">' + feedback + "</div>",
          ].join("")
        : '<div id="mideuda-feedback-msg" style="display:none;margin-top:8px;"></div>'),
    "</div>",
  ].join("");
}

function renderRecommendedToolsSection(diag) {
  if (!diag || !diag.recommended_tools || !diag.recommended_tools.length) return "";

  _trackMideudaShownOnce(diag);

  var cards = diag.recommended_tools.map(function(toolId) {
    if (toolId === "mideuda") return renderMideudaPartnerCard(diag);
    return "";
  }).join("");

  if (!cards) return "";

  return [
    '<div class="recommended-tools-wrap" style="margin-top:16px;margin-bottom:4px;">',
      '<div style="margin-bottom:8px;">',
        '<div style="font-size:16px;font-weight:800;color:rgba(255,255,255,.88);">Herramientas recomendadas</div>',
        '<div style="font-size:12px;color:#8390b5;margin-top:2px;line-height:1.35;">',
          "Sugerencias externas según tu diagnóstico.",
        "</div>",
      "</div>",
      cards,
    "</div>",
  ].join("");
}

// =============================================================================
// HERRAMIENTAS POR PLAN
// =============================================================================
function renderHerramientas() {
  var diag = _diag();
  if (!diag) return "";
  var pid  = diag.planId;

  var html = '<div style="margin-top:4px;">'
    + '<div class="dash-herramientas-header">'
    + '<div class="dash-herramientas-title">Acciones recomendadas</div>'
    + '<div class="dash-herramientas-sub">Pasos concretos basados en tu diagnóstico actual.</div>'
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

function _ux1d2ShouldSuppressFlujoNegativoAccion(diag, acciones, st) {
  acciones = acciones || [];
  st = st || _st();
  var b7Segment = resolveContextualActionSegment(diag, st);
  var segmentId = b7Segment && b7Segment.segmentId;
  var suppressCandidate = segmentId === "S1" || segmentId === "S3";
  var hasFlujoNegativo = acciones.some(function(a) {
    return a && a.id === "flujo_negativo_accion";
  });
  var visibleCountAfterSuppression = acciones.length
    - (suppressCandidate && hasFlujoNegativo ? 1 : 0);
  var suppressFlujoNegativo = suppressCandidate
    && hasFlujoNegativo
    && visibleCountAfterSuppression >= 3;
  return {
    suppressFlujoNegativo: suppressFlujoNegativo,
    visibleAccessibleCount: suppressFlujoNegativo
      ? visibleCountAfterSuppression
      : acciones.length,
    segmentId: segmentId || "S0",
  };
}

function renderAccionRecomendadaItem(accion, index, opts) {
  opts = opts || {};
  var uxSuppressed = !!opts.uxSuppressed;
  var visibleIndex = opts.visibleIndex != null ? opts.visibleIndex : index;
  var done = !!((_herr().compromisos || {})[accion.id]);
  var urgColor = accion.urgencia === "alta" ? "#ff4e72"
    : accion.urgencia === "media" ? "#ffd36f" : "#8390b5";
  var hiddenCls = (!uxSuppressed && visibleIndex >= 3 && !_accionesRecomExpand)
    ? " accion-recom-extra"
    : "";
  var modifierCls = uxSuppressed ? " cz-ux1d2-suppressed-action" : "";
  var a11yAttrs = uxSuppressed
    ? ' style="display:none" aria-hidden="true" tabindex="-1"'
    : "";
  return '<div class="compromiso-item accion-recomendada-item' + hiddenCls + modifierCls + '"'
    + ' data-toggle-compromiso="' + accion.id + '"'
    + ' data-accion-index="' + index + '"'
    + a11yAttrs
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
  var st = _st();
  var acciones = typeof seleccionarAccionesRecomendadas === "function"
    ? seleccionarAccionesRecomendadas(diag)
    : [];
  if (isIncompleteFinancialProfile(diag, st)) {
    acciones = _filterAccionesForIncompleteProfile(acciones);
  }
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

  var ux1d2 = _ux1d2ShouldSuppressFlujoNegativoAccion(diag, acciones, st);
  var suppressFlujoNegativo = ux1d2.suppressFlujoNegativo;
  var visibleAccessibleCount = ux1d2.visibleAccessibleCount;

  var comp_ = _herr().compromisos || {};
  var allDone = acciones.length > 0;
  for (var ai = 0; ai < acciones.length; ai++) {
    if (!comp_[acciones[ai].id]) { allDone = false; break; }
  }

  var verMasBtn = (visibleAccessibleCount > 3 && !_accionesRecomExpand)
    ? '<button type="button" id="btn-ver-mas-acciones" class="acciones-recom-ver-mas-btn" data-acciones-ver-mas="1">Ver más recomendaciones</button>'
    : "";

  var visibleIndex = 0;
  return '<div class="acciones-recomendadas-wrap" style="margin-top:8px;">'
    + acciones.map(function(a, idx) {
        var isSuppressed = suppressFlujoNegativo && a.id === "flujo_negativo_accion";
        return renderAccionRecomendadaItem(a, idx, {
          uxSuppressed: isSuppressed,
          visibleIndex: isSuppressed ? -1 : visibleIndex++,
        });
      }).join("")
    + verMasBtn
    + (allDone
        ? '<div style="margin-top:14px;padding:14px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);border-radius:14px;text-align:center;font-size:18px;font-weight:800;color:#34ffaf;">Acciones registradas.</div>'
        : "")
    + '</div>';
}

function accionesRecomendadasCompletadas(diag) {
  var st = _st();
  var acciones = typeof seleccionarAccionesRecomendadas === "function"
    ? seleccionarAccionesRecomendadas(diag)
    : [];
  if (isIncompleteFinancialProfile(diag, st)) {
    acciones = _filterAccionesForIncompleteProfile(acciones);
  }
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
  var canonicalIng = PRE.ingreso || 0;
  var draftIng = ing.total > 0 ? ing.total : (parseFloat(ing.formal) || canonicalIng);
  var ingresoSaveDisabled = !(draftIng > 0 && Math.abs(draftIng - canonicalIng) >= 0.01);

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
    + '<div id="ingreso-total-wrap" style="background:rgba(64,215,255,.1);border:1px solid rgba(64,215,255,.3);border-radius:16px;padding:18px 22px;display:' + (draftIng > 0 ? "flex" : "none") + ';justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '<span style="font-size:18px;font-weight:700;color:rgba(255,255,255,.8);">Total real que te entra</span>'
      + '<span id="ingreso-total-valor" style="font-size:40px;font-weight:900;color:#40d7ff;letter-spacing:-2px;">' + fmt(draftIng) + '</span></div>'
    + '<button type="button" class="btn btn-primary" id="btn-guardar-ingreso-actualizado"'
    + (ingresoSaveDisabled ? " disabled" : "")
    + ' style="width:100%;height:52px;font-size:16px;margin-top:4px;'
    + (ingresoSaveDisabled ? "opacity:.45;cursor:not-allowed;" : "")
    + '">Guardar ingreso actualizado</button>'
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
        + '<div style="font-size:64px;font-weight:900;color:' + (flujoR >= 0 ? "#34ffaf" : "#ff4e72") + ';line-height:1;letter-spacing:-3px;" id="ingreso-flujo-preview-valor">' + fmt(Math.abs(flujoR)) + '</div>'
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
          + (est === "regularizada" ? '<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Estado registrado como regularizada. Conviene verificar que el acreedor lo refleje.</div>' : "")
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
      line2:      _rejectionCopy(
        "El rechazo puede estar relacionado con la estructura de tus deudas o el ratio de pagos mensual.",
        "Tu perfil puede verse afectado por la estructura de tus deudas o el ratio de pagos mensual."
      ),
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
      line1:      "Hay mas de un factor que puede estar complicando una evaluación crediticia hoy.",
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
      + 'Algunas respuestas muestran senales de presion financiera que pueden estar afectando tu perfil financiero hoy.'
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
  var st = _st();
  if (ob.phase === "legals"
    && !shouldSkipSeoIaUserIntentP11(st)
    && !isValidUserIntent(st.user_intent)) {
    ob.phase = "intent";
  }
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

// INTENT-01A — P11 user intent (SEO IA survey only; no motor impact)
var USER_INTENT_VALUES = ["RECUPERAR", "ORDENAR", "CREDITO", "OPTIMIZAR"];

var USER_INTENT_OPTIONS = [
  { v: "RECUPERAR", l: "Salir de una deuda o situación difícil" },
  { v: "ORDENAR", l: "Ordenar mis finanzas y entender mejor mis números" },
  { v: "CREDITO", l: "Mejorar mi perfil para acceder a crédito" },
  { v: "OPTIMIZAR", l: "Hacer rendir mejor lo que tengo" },
];

function normalizeUserIntent(value) {
  if (value == null) return null;
  var s = String(value).trim();
  if (s === "") return null;
  return USER_INTENT_VALUES.indexOf(s) >= 0 ? s : null;
}

function isValidUserIntent(value) {
  return normalizeUserIntent(value) != null;
}

function shouldSkipSeoIaUserIntentP11(st) {
  var entryCtx = typeof CZ_ENTRY_CONTEXT !== "undefined" ? CZ_ENTRY_CONTEXT : {};
  return !!entryCtx.hasRejectionContext;
}

function resolveSeoIaPhaseAfterP10(st) {
  st = st || _st();
  if (shouldSkipSeoIaUserIntentP11(st)) return "legals";
  if (isValidUserIntent(st.user_intent)) return "legals";
  return "intent";
}

function renderSeoIaUserIntentP11() {
  var st = _st();
  var pending = st._user_intent_pending;
  var canContinue = isValidUserIntent(pending);
  var optsHtml = USER_INTENT_OPTIONS.map(function(opt) {
    var isSel = pending === opt.v;
    return [
      '<button type="button" data-seo-intent-opt="' + opt.v + '" style="',
        "display:block;width:100%;max-width:100%;box-sizing:border-box;text-align:left;",
        "border-radius:14px;padding:16px 18px;margin-bottom:10px;cursor:pointer;",
        "white-space:normal;word-wrap:break-word;overflow-wrap:break-word;",
        "border:1px solid " + (isSel ? "rgba(64,215,255,.55)" : "rgba(255,255,255,.09)") + ";",
        "background:" + (isSel ? "rgba(64,215,255,.12)" : "rgba(255,255,255,.04)") + ";",
        "color:rgba(255,255,255,.9);font-size:15px;line-height:1.5;",
      '">',
        opt.l,
      "</button>",
    ].join("");
  }).join("");

  return [
    '<div id="seo-ia-survey-progress" style="margin-bottom:28px;">',
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
        '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#40d7ff;">',
          "Pregunta 11 de 11",
        "</div>",
        '<div style="font-size:12px;color:#8390b5;">100%</div>',
      "</div>",
      '<div style="height:8px;background:rgba(255,255,255,.1);border-radius:999px;overflow:hidden;">',
        '<div style="height:100%;width:100%;background:linear-gradient(90deg,#5b7cff 0%,#40d7ff 100%);',
          'border-radius:999px;"></div>',
      "</div>",
    "</div>",
    '<div class="seo-ia-q-card seo-ia-intent-p11" data-seo-q-card="11" style="',
      "background:rgba(91,124,255,.06);border:1px solid rgba(91,124,255,.18);",
      "border-radius:16px;padding:20px 18px;margin-bottom:20px;",
    '">',
      '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#40d7ff;margin-bottom:8px;">',
        "Tu objetivo",
      "</div>",
      '<h2 style="font-size:20px;font-weight:800;line-height:1.35;color:#fff;margin:0 0 8px;',
        'white-space:normal;word-wrap:break-word;">¿Qué querés lograr con Mi Plan?</h2>',
      '<p style="font-size:15px;color:rgba(255,255,255,.7);line-height:1.65;margin:0 0 18px;',
        'white-space:normal;word-wrap:break-word;">',
        "Elegí la opción que mejor describe tu objetivo principal hoy.",
      "</p>",
      '<div class="seo-ia-survey-options">' + optsHtml + "</div>",
    "</div>",
    '<button type="button" id="btn-seo-ia-intent-next" ' + (canContinue ? "" : "disabled ") + 'style="',
      "width:100%;border:none;border-radius:16px;padding:18px 24px;margin-top:8px;",
      "font-size:17px;font-weight:800;color:#fff;cursor:pointer;",
      "background:linear-gradient(135deg,#5b7cff 0%,#40d7ff 100%);",
      "box-shadow:0 4px 24px rgba(64,215,255,.35);line-height:1.3;",
      (canContinue ? "" : "opacity:.45;"),
    '">Ver mis legales</button>',
  ].join("");
}

function updateSeoIaIntentP11State() {
  var st = _st();
  var pending = st._user_intent_pending;
  var valid = isValidUserIntent(pending);
  var btn = document.getElementById("btn-seo-ia-intent-next");
  if (btn) {
    btn.disabled = !valid;
    btn.style.opacity = valid ? "1" : ".45";
  }
  var opts = document.querySelectorAll("[data-seo-intent-opt]");
  for (var i = 0; i < opts.length; i++) {
    var el = opts[i];
    var val = el.getAttribute("data-seo-intent-opt");
    var selected = val === pending && valid;
    el.style.border = "1px solid " + (selected ? "rgba(64,215,255,.55)" : "rgba(255,255,255,.09)");
    el.style.background = selected ? "rgba(64,215,255,.12)" : "rgba(255,255,255,.04)";
  }
}

function shouldShowSeoIaOnboarding() {
  var st = _st();
  if (st && st.seo_ia_onboarding && st.seo_ia_onboarding.phase === "done") return false;
  if (st && typeof hasCompletedFinancialInputs === "function" && hasCompletedFinancialInputs(st)) {
    return false;
  }
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
    '<div id="seo-ia-onboarding-header" style="text-align:center;margin-bottom:28px;">',
      '<div style="font-size:13px;font-weight:700;letter-spacing:.12em;color:#5b7cff;text-transform:uppercase;margin-bottom:8px;">',
        'Credizona · Mi Plan',
      '</div>',
      '<div style="font-size:12px;color:#8390b5;">Diagnóstico financiero orientativo</div>',
    '</div>',
  ].join("");
}

function _applyUnifiedLandingHeroBackground() {
  document.body.style.backgroundImage = "url('assets/hero.jpg')";
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center 78%";
  document.body.style.backgroundAttachment = "scroll";

  if (!document.getElementById("miplan-hero-overlay")) {
    var overlay = document.createElement("div");
    overlay.id = "miplan-hero-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none;will-change:transform,opacity;backface-visibility:hidden;background:linear-gradient(to bottom,rgba(10,20,40,0.92) 0%,rgba(10,20,40,0.25) 22%,rgba(10,20,40,0.32) 55%,rgba(10,20,40,0.88) 80%,rgba(10,20,40,0.97) 100%)";
    document.body.prepend(overlay);
  }
}

function _enterFullscreenMode() {
  document.body.classList.add('cz-fullscreen-mode');
}

function renderSeoIaIntroBlock() {
  _enterFullscreenMode();
  _applyUnifiedLandingHeroBackground();
  return renderUnifiedLandingScreen({
    containerId: "seo-ia-landing-container",
    ctaId: "btn-seo-ia-intro-start",
  });
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
  var skipIntent = shouldSkipSeoIaUserIntentP11();
  var btnLabel = isLast ? (skipIntent ? "Ver mis legales" : "Siguiente") : "Siguiente";

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
  var seoLegalLabelStyle = "display:flex;align-items:flex-start;gap:14px;cursor:pointer;"
    + "background:rgba(8,18,36,0.82);border:1px solid rgba(255,255,255,0.16);border-radius:14px;"
    + "padding:16px 18px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);";
  var seoLegalDisclaimerStyle = "font-size:13px;color:rgba(255,255,255,.78);line-height:1.65;margin-bottom:24px;"
    + "padding:14px 16px;background:rgba(8,18,36,0.78);border:1px solid rgba(255,255,255,0.14);"
    + "border-radius:12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);";

  return [
    '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);">',
      '<h2 style="font-size:20px;font-weight:800;line-height:1.35;color:#fff;margin:0 0 12px;">',
        'Último paso antes de tu diagnóstico',
      '</h2>',
      '<p style="font-size:15px;color:rgba(255,255,255,.75);line-height:1.65;margin:0 0 24px;">',
        'Aceptá los términos para ver tu resultado orientativo.',
      '</p>',
      '<label style="' + seoLegalLabelStyle + 'margin-bottom:18px;">',
        '<input type="checkbox" id="chk-seo-ia-tc" style="width:22px;height:22px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">',
        '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.55;">',
          'Leí y acepto los ',
          '<a href="/tyc.html" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Términos y Condiciones de Mi Plan</a>',
        '</span>',
      '</label>',
      '<label style="' + seoLegalLabelStyle + 'margin-bottom:24px;">',
        '<input type="checkbox" id="chk-seo-ia-privacy" style="width:22px;height:22px;margin-top:2px;flex-shrink:0;accent-color:#a78bfa;cursor:pointer;">',
        '<span style="font-size:15px;color:rgba(255,255,255,.85);line-height:1.55;">',
          'Leí y acepto la ',
          '<a href="/privacidad.html" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Política de Privacidad de Mi Plan</a>',
        '</span>',
      '</label>',
      '<div style="' + seoLegalDisclaimerStyle + '">',
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
  } else if (ob.phase === "intent") {
    body = renderSeoIaUserIntentP11();
  } else if (ob.phase === "legals") {
    var appHeader = document.querySelector('.header');
    if (appHeader) appHeader.style.display = 'none';

    document.body.style.backgroundImage = "url('assets/montevideo.jpg')";
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center center";
    document.body.style.backgroundAttachment = "scroll";

    if (!document.getElementById("miplan-legal-overlay")) {
      var legalOverlay = document.createElement("div");
      legalOverlay.id = "miplan-legal-overlay";
      legalOverlay.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none;will-change:transform,opacity;backface-visibility:hidden;background:linear-gradient(to bottom,rgba(10,20,40,0.90) 0%,rgba(10,20,40,0.62) 42%,rgba(10,20,40,0.94) 100%)";
      document.body.prepend(legalOverlay);
    }

    body = renderSeoIaSurveyLegalsAndCta();
  }

  var onboardingContainerStyle = ob.phase === "intro"
    ? "min-height:0;padding:0;max-width:100%;margin:0;"
    : "min-height:60vh;padding:16px 8px calc(80px + env(safe-area-inset-bottom));max-width:420px;margin:0 auto;";

  return [
    '<div id="cz-seo-ia-onboarding" style="',
      onboardingContainerStyle,
    '">',
    (ob.phase !== "intro" ? renderSeoIaOnboardingHeader() : ""),
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
function renderUnifiedLandingScreen(options) {
  options = options || {};
  var containerId = options.containerId || "bridge-landing-container";
  var ctaId = options.ctaId || "btn-bridge-survey";
  var scope = "#" + containerId;

  var landingCss = [
    "#bridge-landing-container *,#bridge-landing-container *::before,#bridge-landing-container *::after{box-sizing:border-box;margin:0;padding:0;}",
    "#bridge-landing-container{",
    "--bg:transparent;--card:transparent;--cyan:#4dd9f0;--btn:#2a6bc7;--btn2:#3d80e0;",
    "--text:#ffffff;--dim:#8facc8;--border:rgba(255,255,255,0.08);--glass:rgba(15,30,53,0.26);",
    'font-family:"DM Sans",sans-serif;color:var(--text);overflow-x:hidden;width:100%;',
    "}",
    "#bridge-landing-container .page{position:relative;z-index:1;width:100%;min-height:72vh;display:flex;flex-direction:column;padding:0 20px 36px;box-sizing:border-box;background:transparent;border:none;box-shadow:none;}",
    "#bridge-landing-container header{display:flex;align-items:center;gap:12px;padding:18px 0 0;flex-shrink:0;}",
    "#bridge-landing-container .logo-icon{width:46px;height:46px;background:linear-gradient(145deg,#2a6bc7,#1a4fa0);border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 3px 14px rgba(42,107,199,0.45);overflow:hidden;position:relative;}",
    '#bridge-landing-container .logo-icon::after{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.12),transparent);}',
    '#bridge-landing-container .logo-icon-text{font-family:"Sora",sans-serif;font-size:6.5px;font-weight:800;color:rgba(255,255,255,0.9);line-height:1.25;text-align:center;letter-spacing:0.3px;position:relative;z-index:1;}',
    '#bridge-landing-container .logo-wordmark{font-family:"Sora",sans-serif;font-size:24px;font-weight:800;letter-spacing:-0.5px;text-shadow:0 2px 14px rgba(0,0,0,0.72);line-height:1;}',
    "#bridge-landing-container .logo-wordmark span{color:var(--cyan);}",
    "#bridge-landing-container .hero{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:22px 0 0;background:transparent;border:none;box-shadow:none;}",
    "#bridge-landing-container .hero-top{background:transparent;border:none;box-shadow:none;}",
    "#bridge-landing-container .hero-label{display:inline-flex;align-items:center;gap:6px;font-family:\"Sora\",sans-serif;font-size:11px;font-weight:700;color:var(--cyan);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;text-shadow:0 1px 8px rgba(0,0,0,0.5);}",
    '#bridge-landing-container h1{font-family:"Sora",sans-serif;font-size:30px;font-weight:900;line-height:1.08;letter-spacing:-1px;margin-bottom:14px;text-shadow:0 2px 14px rgba(0,0,0,0.72);}',
    "#bridge-landing-container h1 em{font-style:italic;color:var(--cyan);}",
    "#bridge-landing-container .hero-desc{font-size:15px;line-height:1.65;color:rgba(255,255,255,0.75);margin-bottom:24px;text-shadow:0 2px 14px rgba(0,0,0,0.72);}",
    "#bridge-landing-container .steps-row{display:flex;align-items:flex-start;margin-bottom:20px;}",
    "#bridge-landing-container .step{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;}",
    "#bridge-landing-container .step-arrow{display:flex;align-items:center;padding-bottom:32px;flex-shrink:0;}",
    "#bridge-landing-container .step-emoji{font-size:36px;line-height:1;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6));margin-bottom:2px;}",
    "#bridge-landing-container .step-emoji.s2{filter:drop-shadow(0 0 10px rgba(77,217,240,0.5)) drop-shadow(0 2px 8px rgba(0,0,0,0.6));}",
    "#bridge-landing-container .step-emoji.s3{filter:drop-shadow(0 0 10px rgba(17,168,125,0.45)) drop-shadow(0 2px 8px rgba(0,0,0,0.6));}",
    "#bridge-landing-container .step-lbl{font-size:9.5px;font-weight:700;color:rgba(255,255,255,0.92);text-align:center;line-height:1.3;text-shadow:0 2px 14px rgba(0,0,0,0.72);}",
    "#bridge-landing-container .step-lbl.on{color:var(--cyan);font-weight:700;}",
    "#bridge-landing-container .bottom-block{background:transparent;border:none;border-radius:18px;padding:18px 16px 16px;box-shadow:none;}",
    "#bridge-landing-container .section-label{font-family:\"Sora\",sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--cyan);opacity:0.85;margin-bottom:12px;}",
    "#bridge-landing-container .features{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;}",
    "#bridge-landing-container .feat-card{background:rgba(15,30,53,0.34);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 11px;display:flex;flex-direction:column;gap:5px;box-shadow:0 16px 50px rgba(0,0,0,0.22);backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%);}",
    "#bridge-landing-container .feat-icon{font-size:18px;}",
    "#bridge-landing-container .feat-icon-wrap{width:36px;height:36px;border-radius:10px;border:1px solid;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}",
    '#bridge-landing-container .feat-title{font-family:"Sora",sans-serif;font-size:11.5px;font-weight:700;line-height:1.3;text-shadow:0 2px 14px rgba(0,0,0,0.72);}',
    "#bridge-landing-container .feat-desc{font-size:10.5px;line-height:1.4;color:var(--dim);text-shadow:0 2px 14px rgba(0,0,0,0.72);}",
    "#bridge-landing-container .divider{height:1px;background:var(--border);margin:12px 0;}",
    "#bridge-landing-container .free-line{display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:12px 14px;background:linear-gradient(135deg,rgba(17,168,125,0.24),rgba(15,30,53,0.26));border:1.5px solid rgba(17,168,125,0.48);border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,0.24),0 0 22px rgba(17,168,125,0.14),inset 0 1px 0 rgba(255,255,255,0.08);backdrop-filter:blur(14px) saturate(125%);-webkit-backdrop-filter:blur(14px) saturate(125%);}",
    "#bridge-landing-container .free-line p{font-size:13px;line-height:1.4;color:rgba(255,255,255,0.85);}",
    "#bridge-landing-container .free-line strong{color:#ffffff;font-weight:800;font-size:13.5px;}",
    "#bridge-landing-container .cta{display:block;width:100%;padding:15px;background:linear-gradient(135deg,var(--btn),var(--btn2));border:none;border-radius:12px;color:#fff;font-family:\"Sora\",sans-serif;font-size:15.5px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;box-shadow:0 6px 26px rgba(42,107,199,0.5);margin-bottom:8px;transition:transform 0.15s;}",
    "#bridge-landing-container .cta:active{transform:scale(0.98);}",
    "#bridge-landing-container .cta-hint{text-align:center;font-size:11px;color:var(--dim);margin-bottom:12px;}",
    "#bridge-landing-container .disclaimer{text-align:center;font-size:10px;line-height:1.6;color:rgba(143,172,200,0.5);text-shadow:0 2px 14px rgba(0,0,0,0.72);}",
    "@keyframes bridgeLandingFadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}",
    "#bridge-landing-container .au{opacity:0;animation:bridgeLandingFadeUp 0.48s ease forwards;}",
    "#bridge-landing-container .d1{animation-delay:0.04s;}#bridge-landing-container .d2{animation-delay:0.10s;}",
    "#bridge-landing-container .d3{animation-delay:0.17s;}#bridge-landing-container .d4{animation-delay:0.24s;}",
    "#bridge-landing-container .d5{animation-delay:0.31s;}#bridge-landing-container .d6{animation-delay:0.38s;}",
    "#bridge-landing-container .d7{animation-delay:0.44s;}",
    "#bridge-landing-container .privacy-line{display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:10px 12px;background:rgba(15,30,53,0.30);border:1px solid rgba(77,217,240,0.28);border-radius:10px;box-shadow:0 14px 44px rgba(0,0,0,0.20);backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%);}",
    "#bridge-landing-container .privacy-line p{font-size:12.5px;line-height:1.4;color:var(--dim);}",
    "#bridge-landing-container .privacy-line strong{color:var(--text);font-weight:700;}",
    "#bridge-landing-container .perks{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:22px;}",
    "#bridge-landing-container .perk-pill{display:inline-flex;align-items:center;gap:5px;background:rgba(77,217,240,0.12);border:1px solid rgba(77,217,240,0.35);border-radius:100px;padding:6px 13px;font-size:12px;font-weight:600;color:var(--cyan);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);text-shadow:0 1px 6px rgba(0,0,0,0.5);}",
    "#bridge-landing-container .d4b{animation-delay:0.27s;}",
    "#bridge-landing-container .step-tag{display:inline-block;margin-top:4px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:0.3px;}",
    "#bridge-landing-container .step-tag.on{color:var(--cyan);opacity:0.85;}",
    "#bridge-landing-container .gratis-word{color:#4dd9f0;font-style:italic;text-shadow:0 0 12px rgba(77,217,240,0.55),0 0 24px rgba(77,217,240,0.18),0 2px 6px rgba(0,0,0,0.95);-webkit-text-stroke:0.3px rgba(77,217,240,0.2);}",
  ].join("").split("#bridge-landing-container").join(scope);

  var landingBody = [
    '<div class="page">',
    '<header class="au d1">',
    '<div class="logo-icon">',
    '<div class="logo-icon-text">CREDI<br>ZONA</div>',
    '</div>',
    '<div class="logo-wordmark">Credizona <span>Mi Plan</span></div>',
    '</header>',
    '<div class="hero">',
    '<div class="hero-top">',
    '<h1 class="au d2">',
    'Diagnóstico financiero<br>',
    '<em class="gratis-word">gratis</em>',
    '</h1>',
    '<p class="hero-desc au d3">',
    'Conocé dónde estás parado en menos de 4 minutos y tomá el control.',
    'Sin tecnicismos, sin vueltas.',
    '</p>',
    '<div class="steps-row au d4">',
    '<div class="step">',
    '<div class="step-emoji">📋</div>',
    '<div class="step-lbl">Completás el<br>diagnóstico<br><span class="step-tag">⏱️ 4 min</span></div>',
    '</div>',
    '<div class="step-arrow">',
    '<svg width="28" height="16" viewBox="0 0 28 16" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '<line x1="0" y1="8" x2="20" y2="8" stroke="url(#arr1)" stroke-width="1.5" stroke-dasharray="3 2"/>',
    '<polygon points="20,4 28,8 20,12" fill="#4dd9f0" opacity="0.7"/>',
    '<defs>',
    '<linearGradient id="arr1" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="#2a6bc7" stop-opacity="0.4"/>',
    '<stop offset="100%" stop-color="#4dd9f0" stop-opacity="0.9"/>',
    '</linearGradient>',
    '</defs>',
    '</svg>',
    '</div>',
    '<div class="step">',
    '<div class="step-emoji s2">🔍</div>',
    '<div class="step-lbl on">Analizamos<br>tu perfil<br><span class="step-tag on">🔒 100% Seguro</span></div>',
    '</div>',
    '<div class="step-arrow">',
    '<svg width="28" height="16" viewBox="0 0 28 16" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '<line x1="0" y1="8" x2="20" y2="8" stroke="url(#arr2)" stroke-width="1.5" stroke-dasharray="3 2"/>',
    '<polygon points="20,4 28,8 20,12" fill="#11a87d" opacity="0.7"/>',
    '<defs>',
    '<linearGradient id="arr2" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="#4dd9f0" stop-opacity="0.4"/>',
    '<stop offset="100%" stop-color="#11a87d" stop-opacity="0.9"/>',
    '</linearGradient>',
    '</defs>',
    '</svg>',
    '</div>',
    '<div class="step">',
    '<div class="step-emoji s3">🎯</div>',
    '<div class="step-lbl">Tu panel<br>personalizado</div>',
    '</div>',
    '</div>',
    '</div>',
    '<div class="bottom-block au d6">',
    '<div class="privacy-line">',
    '<span>🔐</span>',
    '<p>Tu información es <strong>privada y confidencial.</strong></p>',
    '</div>',
    '<p class="section-label">¿Qué incluye?</p>',
    '<div class="features">',
    '<div class="feat-card">',
    '<div class="feat-icon-wrap" style="background:rgba(42,107,199,0.18);border-color:rgba(42,107,199,0.35);">📊</div>',
    '<div class="feat-title">Tu perfil financiero</div>',
    '<div class="feat-desc">Entendés exactamente dónde estás parado hoy.</div>',
    '</div>',
    '<div class="feat-card">',
    '<div class="feat-icon-wrap" style="background:rgba(77,217,240,0.14);border-color:rgba(77,217,240,0.32);">🗺️</div>',
    '<div class="feat-title">Tu plan de acción</div>',
    '<div class="feat-desc">Pasos concretos según tu situación declarada.</div>',
    '</div>',
    '<div class="feat-card">',
    '<div class="feat-icon-wrap" style="background:rgba(234,179,8,0.14);border-color:rgba(234,179,8,0.28);">⚡</div>',
    '<div class="feat-title">Resultado al instante</div>',
    '<div class="feat-desc">Lo ves en pantalla ni bien terminás. Sin esperas.</div>',
    '</div>',
    '<div class="feat-card">',
    '<div class="feat-icon-wrap" style="background:rgba(17,168,125,0.14);border-color:rgba(17,168,125,0.32);">🔒</div>',
    '<div class="feat-title">No afecta tu historial</div>',
    '<div class="feat-desc">No es solicitud de crédito.</div>',
    '</div>',
    '</div>',
    '<div class="divider"></div>',
    '<div class="free-line">',
    '<span>🤝</span>',
    '<p><strong>Completamente gratuito.</strong> Sin costo, sin compromiso.</p>',
    '</div>',
    '<button id="' + ctaId + '" class="cta au d7" type="button">Quiero mi plan gratuito →</button>',
    '<div class="disclaimer">',
    'Herramienta de diagnóstico orientativo basada en la información que ingresás.',
    'No es una financiera, banco ni reporte oficial de Clearing, Equifax o BCU.',
    '</div>',
    '</div>',
    '</div>',
    '</div>',
  ].join("");

  return [
    '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800;900&display=swap" rel="stylesheet">',
    "<style>",
    landingCss,
    "</style>",
    '<div id="' + containerId + '" style="position:relative;z-index:1;width:100%;">',
    landingBody,
    "</div>",
  ].join("");
}

function renderBridgeScreen() {
  var appHeader = document.querySelector('.header');
  if (appHeader) appHeader.style.display = 'none';
  _applyUnifiedLandingHeroBackground();
  return renderUnifiedLandingScreen({
    containerId: "bridge-landing-container",
    ctaId: "btn-bridge-survey",
  });
}

function renderAll() {
  var st = _st();
  var main = document.getElementById("main-content");
  if (!main) return;

  document.body.style.backgroundImage = "";
  document.body.style.backgroundSize = "";
  document.body.style.backgroundPosition = "";
  document.body.style.backgroundAttachment = "";
  document.body.style.filter = "";

  var _landingOverlayIds = ["miplan-hero-overlay", "miplan-legal-overlay"];
  for (var _oi = 0; _oi < _landingOverlayIds.length; _oi++) {
    var _ov = document.getElementById(_landingOverlayIds[_oi]);
    if (_ov) _ov.remove();
  }

  var appHeader = document.querySelector('.header');
  if (appHeader) appHeader.style.display = '';

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
      } else if (st.seo_ia_onboarding.phase === "intent"
        && typeof updateSeoIaIntentP11State === "function") {
        updateSeoIaIntentP11State();
      } else if (st.seo_ia_onboarding.phase === "legals"
        && typeof updateSeoIaDiagnosisCtaState === "function") {
        updateSeoIaDiagnosisCtaState();
      }
    }
    return;
  }

  var html = "";

  if (typeof ensureFinancialStepBeforeDashboard === "function") {
    ensureFinancialStepBeforeDashboard(st);
  }

  if (typeof needsIncomeStep === "function" && needsIncomeStep(st)) {
    st.step = 0;
    html = renderIngreso();
  } else if (st.step === 0 && SEGMENTO === 1) {
    html = renderDiagInicial();
  } else if (st.step === 0) {
    var hasBehavioral = (typeof hasBehavioralSurveyData === "function")
      ? hasBehavioralSurveyData(st, st.diag)
      : (TIENE_ENCUESTA || (st.diag && st.diag.enc));
    if (st.miplan_started) {
      st.step = resolveNextRequiredFinancialStep(st);
      if (st.step === 1) html = renderDeudas();
      else if (st.step === 2) html = renderGastos();
      else if (st.step === 3) html = renderDashboard();
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

    // Sprint B3a — Hidden Factor dashboard card removed; do not fire SHOWN without visible CTA.
    // detectHiddenFactorOpportunity() + HIDDEN_FACTOR_CTA_* events preserved for future surfaces.
  }

  if (st.step === 3 && typeof window.updateIngresoSaveButtonState === "function") {
    window.updateIngresoSaveButtonState();
  }

  updateSticky();
}

window.CredizonaUI = {
  renderAll: renderAll,
  renderTab: renderTab,
  syncTabsNav: syncTabsNav,
  expandAccionesRecomendadas: function() { _accionesRecomExpand = true; },
  toggleDeudasHistorial: function() {
    _deudasHistorialExpand = !_deudasHistorialExpand;
    renderTab();
  },
  focusDeudaQuickEditInput: focusDeudaQuickEditInput,
  renderDeudaFlowActionBar: renderDeudaFlowActionBar,
  renderDeudaSaveSuccessBanner: renderDeudaSaveSuccessBanner,
  renderDeudaCard: renderDeudaCard,
  actualizarMetrics: actualizarMetrics,
  bindTabEvents: bindTabEvents,
  abrirModalPremium: abrirModalPremium,
  abrirModalInformeCompleto: abrirModalPremium,
  mostrarEvaluacion: mostrarEvaluacion,
  updateGastosTotalDisplay: updateGastosTotalDisplay,
  updateCustomExpenseClassificationUI: updateCustomExpenseClassificationUI,
  resolveDashboardCoherence: resolveDashboardCoherence,
  _hasRealBlockers: _hasRealBlockers,
  _shouldHideBlockersContent: _shouldHideBlockersContent,
  _shouldShowRelacionDeudaIngresoSection: _shouldShowRelacionDeudaIngresoSection,
  _shouldRenderFrenandoSection: _shouldRenderFrenandoSection,
  _resolveNextStepKeyFromDiag: _resolveNextStepKeyFromDiag,
  _isRetryCompatibleNextStep: _isRetryCompatibleNextStep,
  getRetryCtaState: getRetryCtaState,
  renderRetryCta: renderRetryCta,
  resolveDashboardCtaHierarchy: resolveDashboardCtaHierarchy,
  _scoreFinancieroLabel: _scoreFinancieroLabel,
  _scoreConductualLabel: _scoreConductualLabel,
  resolvePlanStatusLabel: resolvePlanStatusLabel,
  renderProfileCompositionCard: renderProfileCompositionCard,
  _renderProfileScoreLabelHtml: _renderProfileScoreLabelHtml,
  renderNarrativaInterpretacion: renderNarrativaInterpretacion,
  isIncompleteFinancialProfile: isIncompleteFinancialProfile,
  _isZeroActiveDebtCompleteProfile: _isZeroActiveDebtCompleteProfile,
  _resolveDashboardNextStepText: _resolveDashboardNextStepText,
  _resolveDashboardNextStepTextLegacy: _resolveDashboardNextStepTextLegacy,
  resolveNextStepContent: resolveNextStepContent,
  resolveContextualActionSegment: resolveContextualActionSegment,
  renderContextualActionBlock: renderContextualActionBlock,
  _B7_SEGMENTS: _B7_SEGMENTS,
  _resolveZeroActiveDebtHeroProblema: _resolveZeroActiveDebtHeroProblema,
  resolveHeroContent: resolveHeroContent,
  _resolveHeroContentLegacy: _resolveHeroContentLegacy,
  resolveExplanationQueEstaPasando: resolveExplanationQueEstaPasando,
  _resolveExplanationQueEstaPasandoLegacy: _resolveExplanationQueEstaPasandoLegacy,
  _renderDashboardHeroCard: _renderDashboardHeroCard,
  renderPrimaryActionCard: renderPrimaryActionCard,
  renderTabPlan: renderTabPlan,
  _visiblePlanTitle: _visiblePlanTitle,
  renderVerticalProfilingBlock: renderVerticalProfilingBlock,
  _shouldShowZeroPaymentDebtClarification: _shouldShowZeroPaymentDebtClarification,
  _ZERO_PAYMENT_DEBT_CLARIFICATION: _ZERO_PAYMENT_DEBT_CLARIFICATION,
  _filterAccionesForIncompleteProfile: _filterAccionesForIncompleteProfile,
  _ux1d2ShouldSuppressFlujoNegativoAccion: _ux1d2ShouldSuppressFlujoNegativoAccion,
  renderAccionesRecomendadasHtml: renderAccionesRecomendadasHtml,
  _renderTuSituacionHoy: _renderTuSituacionHoy,
  renderConfianzaDiagnostico: renderConfianzaDiagnostico,
  renderLowExpensesConfirmCard: renderLowExpensesConfirmCard,
  isRetryEligible: typeof isRetryEligible === "function" ? isRetryEligible : null,
  _rejectionCopy: _rejectionCopy,
  normalizeUserIntent: normalizeUserIntent,
  isValidUserIntent: isValidUserIntent,
  shouldSkipSeoIaUserIntentP11: shouldSkipSeoIaUserIntentP11,
  resolveSeoIaPhaseAfterP10: resolveSeoIaPhaseAfterP10,
  renderSeoIaUserIntentP11: renderSeoIaUserIntentP11,
  updateSeoIaIntentP11State: updateSeoIaIntentP11State,
};

window.normalizeUserIntent = normalizeUserIntent;
window.isValidUserIntent = isValidUserIntent;
window.shouldSkipSeoIaUserIntentP11 = shouldSkipSeoIaUserIntentP11;
window.resolveSeoIaPhaseAfterP10 = resolveSeoIaPhaseAfterP10;
window.updateSeoIaIntentP11State = updateSeoIaIntentP11State;

window.renderAll = renderAll;
