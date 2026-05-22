// =============================================================================
// app.js — Inicializacion, estado global, navegacion y event listeners
// Depende de: todos los archivos anteriores
// =============================================================================

// =============================================================================
// ESTADO GLOBAL
// =============================================================================
window.CZState = {
  step:       0,
  gastos:     {},
  deudas:     [],
  diag:       null,
  snap:       null,
  saldoIni:   0,
  tab:        "plan",
  plusEstado: "sin_pago",
  iaRes:      null,
  herr: {
    ingresos:    { formal: 0, extras: [], total: 0 },
    gastos_cls:  {},
    gestiones:   {},
    compromisos: {},
    semaforo:    {},
    habitos:     {},
    atrasos:     {},
    vencimientos:{},
  },
};

// =============================================================================
// STORAGE
// =============================================================================
window.guardarLocal = function(extra) {
  extra = extra || {};
  try {
    var st = window.CZState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({
      step:       st.step,
      gastos:     st.gastos,
      deudas:     st.deudas,
      diag:       st.diag,
      snap:       st.snap,
      saldoIni:   st.saldoIni,
      tab:        st.tab,
      plusEstado: st.plusEstado,
      iaRes:      st.iaRes,
      herr:       st.herr,
      fecha:      new Date().toISOString(),
    }, extra)));
  } catch (e) {}
};

function cargarLocal() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// =============================================================================
// NAVEGACION
// =============================================================================
function next() {
  var st = window.CZState;
  if (st.step === 0 && SEGMENTO === 1) {
    st.step = 1;
    track("click_continue_analysis");
    renderAll();
    return;
  }
  if (st.step === 0 || st.step === 1) {
    var total = Object.values(st.gastos).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0);
    if (total === 0) { alert("Completa al menos un gasto para continuar."); return; }
    st.step = 2;
    window.CredizonaUI.renderAll();
    return;
  }
  if (st.step === 2) {
    if (st.deudas.length === 0) { alert("Agrega al menos una deuda para continuar."); return; }
    st.diag      = calcularMotor();
    st.saldoIni  = st.deudas.reduce(function(s, d) { return s + (parseFloat(d.monto) || 0); }, 0);
    st.snap      = {
      fecha_inicio: new Date().toISOString(),
      score_reset:  st.diag.scoreReset,
      nivel:        st.diag.nivelR,
      plan_id:      st.diag.planId,
      saldo_inicial:st.saldoIni,
    };
    window.guardarLocal();
    enviarCRM("reset_plan_generated", st.diag);
    st.step = 3;
    st.tab  = "plan";
    window.CredizonaUI.renderAll();
  }
}

function prev() {
  var st = window.CZState;
  if (st.step > 0 && st.step < 3) { st.step--; window.CredizonaUI.renderAll(); }
}

function resetear() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  window.CZState = {
    step: 0, gastos: {}, deudas: [], diag: null, snap: null,
    saldoIni: 0, tab: "plan", plusEstado: "sin_pago", iaRes: null,
    herr: { ingresos: { formal: 0, extras: [], total: 0 }, gastos_cls: {}, gestiones: {}, compromisos: {}, semaforo: {}, habitos: {}, atrasos: {}, vencimientos: {} },
  };
  document.getElementById("modal-nuevo").classList.add("hidden");
  window.CredizonaUI.renderAll();
}

// =============================================================================
// TABS
// =============================================================================
function switchTab(id) {
  window.CZState.tab = id;
  document.querySelectorAll(".tab-btn").forEach(function(b) {
    b.classList.toggle("active", b.getAttribute("data-tab") === id);
  });
  window.CredizonaUI.renderTab();
  window.guardarLocal();
}

// =============================================================================
// INIT
// =============================================================================
function init() {
  var sesion = cargarLocal();
  if (sesion && sesion.diag) {
    var st = window.CZState;
    st.step       = 3;
    st.gastos     = sesion.gastos     || {};
    st.deudas     = sesion.deudas     || [];
    st.diag       = sesion.diag;
    st.snap       = sesion.snap       || null;
    st.saldoIni   = sesion.saldoIni   || 0;
    st.tab        = sesion.tab        || "plan";
    st.plusEstado = sesion.plusEstado || "sin_pago";
    st.iaRes      = sesion.iaRes      || null;
    if (sesion.herr) st.herr = sesion.herr;
  }
  if (typeof render === "function") {
  render();
}
}
  track("reset_started", { segmento: SEGMENTO });
}

// =============================================================================
// EVENT LISTENERS ESTATICOS
// (elementos que existen en el DOM desde el inicio, no generados por JS)
// =============================================================================
document.addEventListener("DOMContentLoaded", function() {

  // Sticky CTA
  document.getElementById("sticky-cta").addEventListener("click", function() {
    var step = window.CZState.step;
    if (step === 3) { window.CredizonaUI.abrirModalPremium(); } else { next(); }
  });

  // Boton Nuevo (header)
  document.getElementById("btn-nuevo").addEventListener("click", function() {
    document.getElementById("modal-nuevo").classList.remove("hidden");
  });

  // Modal Nuevo — Cancelar
  document.getElementById("btn-cancelar-nuevo").addEventListener("click", function() {
    document.getElementById("modal-nuevo").classList.add("hidden");
  });

  // Modal Nuevo — Confirmar
  document.getElementById("btn-confirmar-nuevo").addEventListener("click", resetear);

  // Tabs (delegacion sobre el contenedor de tabs)
  document.getElementById("main-content").addEventListener("click", function(e) {
    // Tabs
    var tabBtn = e.target.closest(".tab-btn");
    if (tabBtn) {
      var id     = tabBtn.getAttribute("data-tab");
      var locked = tabBtn.classList.contains("locked");
      if (locked) { window.CredizonaUI.abrirModalPremium(); return; }
      if (id) switchTab(id);
    }

    // Back buttons
    if (e.target.id === "btn-back-diag")   { window.CZState.step = 0; window.CredizonaUI.renderAll(); return; }
    if (e.target.id === "btn-back-gastos") { prev(); return; }

    // Agregar deuda
    if (e.target.id === "btn-agregar-deuda") {
      window.CZState.deudas.push({ tipo: "", acreedor: "", monto: "", pago: "" });
      var cont = document.getElementById("deudas-container");
      if (cont) cont.innerHTML = window.CZState.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
      window.CredizonaUI.actualizarMetrics();
      window.CredizonaUI.bindTabEvents();
      track("add_debt");
      return;
    }
  });

  // Cerrar premium con Escape
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
      var premium = document.getElementById("modal-premium");
      if (premium && !premium.classList.contains("hidden")) {
        premium.classList.add("hidden");
        document.body.classList.remove("modal-open");
      }
    }
  });

  // Iniciar la app
  init();
});
