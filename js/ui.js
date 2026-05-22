// =============================================================================
// ui.js — Funciones de renderizado estricto e inyección de vistas HTML
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js
// =============================================================================

function _st()    { return window.CZState || {}; }
function _diag()  { return _st().diag; }
function _herr()  { return _st().herr || {}; }

function updateHeader() {
  var st = _st();
  var btn = document.getElementById("btn-nuevo");
  if (btn) {
    if (st.step > 0) btn.classList.remove("hidden");
    else btn.classList.add("hidden");
  }
}

function updateSticky() {
  var st   = _st();
  var step = st.step || 0;
  var lbl  = document.getElementById("sticky-lbl");
  var stEl = document.getElementById("sticky-step");
  var cta  = document.getElementById("sticky-cta");
  var bar  = document.getElementById("sticky-cta-bar");
  if (!lbl || !stEl || !cta || !bar) return;

  bar.classList.remove("hidden");

  if (step === 0 && SEGMENTO === 1) {
    lbl.textContent  = "Diagnóstico inicial";
    stEl.textContent = "Entendé qué te frena";
    cta.textContent  = "Ver diagnóstico";
  } else if (step === 0 || step === 1) {
    lbl.textContent  = "Paso " + (SEGMENTO === 1 ? 2 : 1) + " de " + (SEGMENTO === 1 ? 3 : 2);
    stEl.textContent = "Agregá tus deudas pendientes";
    cta.textContent  = "Continuar";
  } else if (step === 2) {
    lbl.textContent  = "Paso " + (SEGMENTO === 1 ? 3 : 2) + " de " + (SEGMENTO === 1 ? 3 : 2);
    stEl.textContent = "Tus gastos fijos (opcional)";
    cta.textContent  = "Ver mi plan";
  } else {
    bar.classList.add("hidden");
  }
}

function renderModalPremium() {
  return ''
    + '<div class="modal-header-fixed">'
    + '  <div style="text-align: left;">'
    + '    <div class="premium-badge" style="color:#40d7ff; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.1em; margin-bottom:4px;">Opcional · Siguiente nivel</div>'
    + '    <h2 style="font-size:20px; font-weight:900; line-height:1.2; color:white; margin:0;">Entendé exactamente<br>qué ve el banco sobre vos.</h2>'
    + '  </div>'
    + '  <button id="btn-cerrar-premium" style="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.1); border-radius:12px; width:40px; height:40px; color:rgba(255,255,255,.7); font-size:22px; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center;">&times;</button>'
    + '</div>'
    + '<div class="modal-body-scroll" style="text-align: left;">'
    + '  <p style="color:#b4c0da; font-size:14px; line-height:1.5; margin-bottom:16px; margin-top:4px;">Tu diagnóstico actual está basado en lo que vos declaraste. Reset Plus accede a tu historial real en el sistema financiero y lo interpreta con inteligencia artificial.</p>'
    + '  <div style="background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:18px; padding:16px; margin-bottom:16px;">'
    + '    <div style="font-size:11px; color:#8390b5; font-weight:800; text-transform:uppercase; letter-spacing:.07em; margin-bottom:12px;">Lo que vas a recibir</div>'
    + '    <div style="display:flex; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.07);"><span style="font-size:20px; flex-shrink:0;">🔍</span><div><div style="font-size:15px; font-weight:700; color:white;">Tu historial financiero real</div><div style="font-size:13px; color:#8390b5; line-height:1.4;">Deudas, atrasos y consultas que las entidades ven sobre vos</div></div></div>'
    + '    <div style="display:flex; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.07);"><span style="font-size:20px; flex-shrink:0;">🤖</span><div><div style="font-size:15px; font-weight:700; color:white;">Análisis experto con IA</div><div style="font-size:13px; color:#8390b5; line-height:1.4;">La IA analiza el informe completo y te indica qué limpiar primero</div></div></div>'
    + '    <div style="display:flex; gap:12px; padding:10px 0;"><span style="font-size:20px; flex-shrink:0;">📋</span><div><div style="font-size:15px; font-weight:700; color:white;">Plan de rectificación real</div><div style="font-size:13px; color:#8390b5; line-height:1.4;">Basado en los datos vigentes en tu Clearing de Informes</div></div></div>'
    + '  </div>'
    + '  <div class="pricing-grid">'
    + '    <div class="pricing-card" data-elegir-plan="one_time"><div style="font-size:12px; color:#8390b5; font-weight:800; text-transform:uppercase;">Acceso único</div><div style="font-size:32px; font-weight:900; color:#40d7ff; margin:6px 0;">$990</div><div style="font-size:12px; color:#8390b5; margin-bottom:12px;">UYU · Pago único</div><button class="btn btn-secondary" style="height:40px; font-size:14px;" data-elegir-plan="one_time">Elegir plan</button></div>'
    + '    <div class="pricing-card featured" data-elegir-plan="trimestral"><div class="pricing-top-badge">Recomendado</div><div style="font-size:12px; color:#40d7ff; font-weight:800; text-transform:uppercase;">Monitoreo</div><div style="font-size:32px; font-weight:900; color:#40d7ff; margin:6px 0;">$1.290</div><div style="font-size:12px; color:#8390b5; margin-bottom:12px;">UYU · Trimestral</div><button class="btn btn-primary" style="height:40px; font-size:14px;" data-elegir-plan="trimestral">Elegir plan</button></div>'
    + '  </div>'
    + '  <div style="text-align:center; font-size:12px; color:#8390b5; margin-top:16px;">Garantía de reembolso total de 7 días si el informe no te aporta valor.</div>'
    + '</div>';
}

function abrirModalPremium() {
  var diag    = _diag();
  var content = document.getElementById("modal-premium-content");
  var overlay = document.getElementById("modal-premium");

  if (content) content.innerHTML = renderModalPremium();

  if (overlay) {
    var scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = "-" + scrollY + "px";
    document.body.classList.add("modal-open");
    
    overlay.classList.remove("hidden");

    function cerrarModal() {
      overlay.classList.add("hidden");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.classList.remove("modal-open");
      window.scrollTo(0, scrollY);
    }

    var closeBtn = document.getElementById("btn-cerrar-premium");
    if (closeBtn) closeBtn.onclick = cerrarModal;

    overlay.querySelectorAll("[data-elegir-plan]").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var tipo = btn.getAttribute("data-elegir-plan");
        track(typeof EVENTOS !== 'undefined' ? EVENTOS.COMPLETE_REPORT_CHECKOUT_STARTED : "checkout_started", { tipo: tipo, plan: diag && diag.planId });
        cerrarModal();
        alert("Redirigiendo a pasarela segura de pago...");
      };
    });

    overlay.onclick = function(e) { if (e.target === overlay) cerrarModal(); };
  }
}

function renderDiagInicial() {
  return '<div class="score-box">'
    + '  <h2 style="font-size:24px; font-weight:900; margin-bottom:8px;">Hola, ' + PRE.nombre + '</h2>'
    + '  <p style="color:#8390b5; font-size:15px; line-height:1.6; margin-bottom:20px;">Evaluamos tu perfil conductual en base a los datos cargados en el formulario previo.</p>'
    + '  <div class="score-circle" style="border-color:' + colorScore(ENC_RESULT.score) + ';">'
    + '    <span style="font-size:12px; font-weight:800; color:#8390b5; text-transform:uppercase;">Score Inicial</span>'
    + '    <span style="font-size:42px; font-weight:900; color:' + colorScore(ENC_RESULT.score) + ';">' + ENC_RESULT.score + '</span>'
    + '    <span style="font-size:12px; color:#8390b5;">/ 30</span>'
    + '  </div>'
    + '  <div style="background:rgba(255,255,255,.04); border-radius:14px; padding:14px; margin-bottom:20px; text-align:left;">'
    + '    <div style="font-size:13px; font-weight:800; color:#8390b5; text-transform:uppercase; margin-bottom:4px;">Perfil Financiero</div>'
    + '    <div style="font-size:18px; font-weight:900; color:' + colorNivel(ENC_RESULT.nivel) + ';">Nivel ' + ENC_RESULT.nivel + ' (' + nivelTexto(ENC_RESULT.nivel) + ')</div>'
    + '  </div>'
    + '  <button class="btn btn-primary" id="btn-ver-evaluacion">Continuar a tus deudas</button>'
    + '</div>';
}

function renderDeudaCard(d, idx) {
  var st = window.CZState;
  var deudas = st.deudas || [];
  
  var tipoOptions = '<option value="" disabled ' + (!d.tipo ? 'selected' : '') + '>Seleccioná tipo</option>'
    + DEBT_TYPES.map(function(t) { return '<option value="' + t.v + '" ' + (d.tipo === t.v ? 'selected' : '') + '>' + t.l + '</option>'; }).join('');

  var estadoOptions = '<option value="" disabled ' + (!d.estado ? 'selected' : '') + '>Seleccioná estado</option>'
    + ESTADOS_DEUDA.map(function(e) { return '<option value="' + e.v + '" ' + (d.estado === e.v ? 'selected' : '') + '>' + e.l + '</option>'; }).join('');

  return '<div class="card fade" data-idx="' + idx + '" style="position:relative; text-align:left;">'
    + '  <button class="btn-eliminar-deuda" data-idx="' + idx + '" style="position:absolute; top:16px; right:16px; background:transparent; border:none; color:#ff4e72; font-size:20px; cursor:pointer;">&times;</button>'
    + '  <div style="font-size:14px; font-weight:800; color:#5b7cff; margin-bottom:16px; text-transform:uppercase;">Deuda #' + (idx + 1) + '</div>'
    + '  <div class="form-group"><label>Tipo de Deuda</label><select class="form-control debt-field" data-field="tipo">' + tipoOptions + '</select></div>'
    + '  <div class="form-group"><label>Acreedor (¿A quién le debés?)</label><input type="text" class="form-control debt-field" data-field="acreedor" value="' + (d.acreedor || '') + '" placeholder="Ej. Banco República, Itaú, Anda, etc."></div>'
    + '  <div class="form-group"><label>Monto total adeudado (estimado)</label><input type="number" class="form-control debt-field" data-field="monto" value="' + (d.monto || '') + '" placeholder="Ej. 45000"></div>'
    + '  <div class="form-group"><label>Pago mensual actual</label><input type="number" class="form-control debt-field" data-field="pago" value="' + (d.pago || '') + '" placeholder="Ej. 3500 (Si no pagás nada, poné 0)"></div>'
    + '  <div class="form-group"><label>Estado de situación</label><select class="form-control debt-field" data-field="estado">' + estadoOptions + '</select></div>'
    + '</div>';
}

function renderDeudas() {
  var deudas = window.CZState.deudas;
  var cards = deudas.map(renderDeudaCard).join('');
  
  return '<div style="text-align:left;">'
    + '  <h2 style="font-size:24px; font-weight:900; margin-bottom:6px;">Declaración de Deudas</h2>'
    + '  <p style="color:#8390b5; font-size:14px; line-height:1.5; margin-bottom:24px;">Ingresá tus deudas actuales. El motor calculará automáticamente las tasas de interés promedio del mercado financiero uruguayo si no las tenés claras.</p>'
    + '  <div id="deudas-container">' + cards + '</div>'
    + '  <button class="btn btn-secondary" id="btn-agregar-deuda" style="margin-bottom:20px;">+ Agregar otra deuda</button>'
    + '  <div id="metrics-resumen" style="margin-bottom:24px;"></div>'
    + '</div>';
}

function actualizarMetrics() {
  var deudas = window.CZState.deudas;
  var el = document.getElementById("metrics-resumen");
  if (!el) return;

  if (deudas.length === 0) { el.innerHTML = ''; return; }

  var totalMonto = deudas.reduce(function(s, d) { return s + (parseFloat(d.monto) || 0); }, 0);
  var totalPago  = deudas.reduce(function(s, d) { return s + (parseFloat(d.pago) || 0); }, 0);

  el.innerHTML = '<div style="background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06); padding:16px; border-radius:16px; display:flex; justify-content:space-between; gap:12px;">'
    + '  <div><div style="font-size:11px; color:#8390b5; font-weight:800; text-transform:uppercase;">Total Deuda</div><div style="font-size:18px; font-weight:900; color:white;">' + fmt(totalMonto) + '</div></div>'
    + '  <div style="text-align:right;"><div style="font-size:11px; color:#8390b5; font-weight:800; text-transform:uppercase;">Pago Mensual</div><div style="font-size:18px; font-weight:900; color:#40d7ff;">' + fmt(totalPago) + '</div></div>'
    + '</div>';
}

function renderGastos() {
  var st = window.CZState;
  var htmlInputs = EXPENSE_CATS.map(function(c) {
    var val = st.gastos[c.k] || '';
    return '<div class="form-group" style="text-align:left;"><label>' + c.l + '</label><input type="number" class="form-control gasto-input" data-cat="' + c.k + '" value="' + val + '" placeholder="Ej. 12000"></div>';
  }).join('');

  return '<div style="text-align:left;">'
    + '  <h2 style="font-size:24px; font-weight:900; margin-bottom:6px;">Gastos Mensuales</h2>'
    + '  <p style="color:#8390b5; font-size:14px; line-height:1.5; margin-bottom:24px;">Contanos tus costos fijos estimados para calcular tu capacidad real de pago
