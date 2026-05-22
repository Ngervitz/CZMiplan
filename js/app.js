// =============================================================================
// app.js — Inicialización, estado global, navegación y controladores dinámicos
// Depende de: todos los archivos anteriores del ecosistema
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
  tab:        "situacion",
  plusEstado: "sin_pago",
  iaRes:      null,
  herr: {
    ingresos:     { formal: 0, extras: [], total: 0 },
    gastos_cls:   {},
    gestiones:    {},
    compromisos:  {},
    semaforo:     {},
    habitos:      {},
    atrasos:      {},
    vencimientos: {},
  },
};

// =============================================================================
// STORAGE INTERNO
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
// FLUJO DE NAVEGACIÓN CONTINUA
// =============================================================================
function next() {
  var st = window.CZState;

  // Step 0 inicial (solo segmento 1 con encuesta conductual)
  if (st.step === 0 && SEGMENTO === 1) {
    st.step = 1;
    track(typeof EVENTOS !== 'undefined' ? EVENTOS.DEBT_STARTED : "debt_started");
    window.CredizonaUI.renderAll();
    return;
  }

  // Validación obligatoria de deudas para continuar
  if (st.step === 0 || st.step === 1) {
    if (st.deudas.length === 0) {
      alert("Por favor, agregá al menos una deuda para continuar.");
      return;
    }
    
    // Validar que los campos críticos no estén vacíos antes de saltar
    var tieneCamposVacios = st.deudas.some(function(d) { return !d.tipo || !d.monto; });
    if (tieneCamposVacios) {
      alert("Por favor completá el Tipo y Monto de las deudas agregadas.");
      return;
    }

    if (st.deudas.length === 1) {
      track(typeof EVENTOS !== 'undefined' ? EVENTOS.FIRST_DEBT_ADDED : "first_debt_added", { acreedor: st.deudas[0].acreedor });
    }
    st.step = 2;
    track(typeof EVENTOS !== 'undefined' ? EVENTOS.EXPENSES_STARTED : "expenses_started");
    window.CredizonaUI.renderAll();
    return;
  }

  // Step 2 final: Procesamiento matemático y despacho al Dashboard
  if (st.step === 2) {
    st.diag     = calcularMotor();
    st.saldoIni = st.deudas.reduce(function(s, d) { return s + (parseFloat(d.monto) || 0); }, 0);
    st.snap     = {
      fecha_inicio:  new Date().toISOString(),
      score_miplan:  st.diag.scoreReset,
      nivel:         st.diag.nivelR,
      plan_titulo:   st.diag.plan.titulo,
      saldo_inicial: st.saldoIni,
    };
    window.guardarLocal();
    enviarCRM(typeof EVENTOS !== 'undefined' ? EVENTOS.FINAL_DIAGNOSIS_GENERATED : "final_diagnosis_generated", st.diag);
    st.step = 3;
    st.tab  = "situacion";
    track(typeof EVENTOS !== 'undefined' ? EVENTOS.PLAN_VIEWED : "plan_viewed", { plan: st.diag.planId, nivel: st.diag.nivelR });
    window.CredizonaUI.renderAll();
  }
}

function prev() {
  var st = window.CZState;
  if (st.step > 0 && st.step < 3) { st.step--; window.CredizonaUI.renderAll(); }
}

function saltarGastos() {
  var st = window.CZState;
  if (st.step !== 2) return;
  track(typeof EVENTOS !== 'undefined' ? EVENTOS.EXPENSES_COMPLETED : "expenses_completed", { saltado: true });
  st.diag     = calcularMotor();
  st.saldoIni = st.deudas.reduce(function(s, d) { return s + (parseFloat(d.monto) || 0); }, 0);
  st.snap     = {
    fecha_inicio:  new Date().toISOString(),
    score_miplan:  st.diag.scoreReset,
    nivel:         st.diag.nivelR,
    plan_titulo:   st.diag.plan.titulo,
    saldo_inicial: st.saldoIni,
  };
  window.guardarLocal();
  enviarCRM(typeof EVENTOS !== 'undefined' ? EVENTOS.FINAL_DIAGNOSIS_GENERATED : "final_diagnosis_generated", st.diag);
  st.step = 3;
  st
