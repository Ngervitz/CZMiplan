// =============================================================================
// app.js — Inicializacion, estado global, navegacion y event listeners
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js, ui.js
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
  } catch (e) {
    return null;
  }
}

// =============================================================================
// NAVEGACION
// =============================================================================
function next() {
  var st = window.CZState;

  if (st.step === 0 && SEGMENTO === 1) {
    st.step = 1;
    track("click_continue_analysis");
    window.CredizonaUI.renderAll();
    return;
  }

  if (st.step === 0 || st.step === 1) {
    var total = Object.values(st.gastos).reduce(function(s, v) {
      return s + (parseFloat(v) || 0);
    }, 0);

    if (total === 0) {
      showToast("Agrega aunque sea una estimacion de gastos para continuar.");
      return;
    }

    st.step = 2;
    window.CredizonaUI.renderAll();
    return;
  }

  if (st.step === 2) {
    if (st.deudas.length === 0) {
      showToast("Agrega al menos una deuda para que podamos analizar tu perfil.");
      return;
    }

    st.diag = calcularMotor();

    st.saldoIni = st.deudas.reduce(function(s, d) {
      return s + (parseFloat(d.monto) || 0);
    }, 0);

    st.snap = {
      fecha_inicio:  new Date().toISOString(),
      score_reset:   st.diag.scoreReset,
      nivel:         st.diag.nivelR,
      plan_id:       st.diag.planId,
      saldo_inicial: st.saldoIni,
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

  if (st.step > 0 && st.step < 3) {
    st.step--;
    window.CredizonaUI.renderAll();
  }
}

function resetear() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}

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

  var modalNuevo = document.getElementById("modal-nuevo");
  if (modalNuevo) modalNuevo.classList.add("hidden");

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

  if (window.CredizonaUI && typeof window.CredizonaUI.renderAll === "function") {
    window.CredizonaUI.renderAll();
  }

  track("reset_started", { segmento: SEGMENTO });
}

// =============================================================================
// EVENT LISTENERS ESTATICOS
// =============================================================================
document.addEventListener("DOMContentLoaded", function() {
  var stickyCta   = document.getElementById("sticky-cta");
  var btnNuevo    = document.getElementById("btn-nuevo");
  var btnCancelar = document.getElementById("btn-cancelar-nuevo");
  var btnConfirm  = document.getElementById("btn-confirmar-nuevo");
  var main        = document.getElementById("main-content");

  // Sticky CTA
  if (stickyCta) {
    stickyCta.addEventListener("click", function() {
      var step = window.CZState.step;

      if (step === 3) {
        window.CredizonaUI.abrirModalPremium();
      } else {
        next();
      }
    });
  }

  // Boton Nuevo
  if (btnNuevo) {
    btnNuevo.addEventListener("click", function() {
      var modalNuevo = document.getElementById("modal-nuevo");
      if (modalNuevo) modalNuevo.classList.remove("hidden");
    });
  }

  // Modal Nuevo — Cancelar
  if (btnCancelar) {
    btnCancelar.addEventListener("click", function() {
      var modalNuevo = document.getElementById("modal-nuevo");
      if (modalNuevo) modalNuevo.classList.add("hidden");
    });
  }

  // Modal Nuevo — Confirmar
  if (btnConfirm) {
    btnConfirm.addEventListener("click", resetear);
  }

  if (main) {
    // Inputs generados dinámicamente
    main.addEventListener("input", function(e) {
      var st = window.CZState;

      // Gastos
      var gastoKey = e.target.getAttribute("data-gasto");
      if (gastoKey) {
        st.gastos[gastoKey] = e.target.value;
        window.guardarLocal();
        return;
      }

      // Deudas
      var deudaField = e.target.getAttribute("data-deuda-field");
      var deudaIdx   = e.target.getAttribute("data-deuda-idx");

      if (deudaField !== null && deudaIdx !== null) {
        deudaIdx = parseInt(deudaIdx, 10);

        if (st.deudas[deudaIdx]) {
          st.deudas[deudaIdx][deudaField] = e.target.value;
          window.guardarLocal();

          if (window.CredizonaUI && typeof window.CredizonaUI.actualizarMetrics === "function") {
            window.CredizonaUI.actualizarMetrics();
          }
        }

        return;
      }

      // Editar deuda viva en dashboard
      var editarIdx = e.target.getAttribute("data-editar-deuda");
      if (editarIdx !== null) {
        editarIdx = parseInt(editarIdx, 10);

        if (st.deudas[editarIdx]) {
          st.deudas[editarIdx].monto = e.target.value;
          st.deudas[editarIdx].cancelada = false;

          if (typeof calcularMotor === "function") {
            st.diag = calcularMotor();
          }

          window.guardarLocal();
        }

        return;
      }

      // Ingreso formal
      if (e.target.id === "ing-formal") {
        st.herr.ingresos.formal = parseFloat(e.target.value) || 0;
        recalcularIngresosLocal();
        return;
      }

      // Ingresos extra
      var ingIdx   = e.target.getAttribute("data-ing-extra-idx");
      var ingField = e.target.getAttribute("data-ing-extra-field");

      if (ingIdx !== null && ingField) {
        ingIdx = parseInt(ingIdx, 10);

        if (!st.herr.ingresos.extras) st.herr.ingresos.extras = [];
        if (!st.herr.ingresos.extras[ingIdx]) st.herr.ingresos.extras[ingIdx] = {};

        st.herr.ingresos.extras[ingIdx][ingField] =
          ingField === "monto" ? (parseFloat(e.target.value) || 0) : e.target.value;

        recalcularIngresosLocal();
        return;
      }

      // Simulador de flujo libre (slider general + ingreso complementario)
      if (e.target.hasAttribute("data-liberar-monto") || e.target.hasAttribute("data-ingreso-comp")) {
        actualizarSimuladorFlujo();
        return;
      }
    });

    // Changes generados dinámicamente
    main.addEventListener("change", function(e) {
      var st = window.CZState;

      // Selects de deuda
      var deudaField = e.target.getAttribute("data-deuda-field");
      var deudaIdx   = e.target.getAttribute("data-deuda-idx");

      if (deudaField !== null && deudaIdx !== null) {
        deudaIdx = parseInt(deudaIdx, 10);

        if (st.deudas[deudaIdx]) {
          st.deudas[deudaIdx][deudaField] = e.target.value;
          window.guardarLocal();

          var cont = document.getElementById("deudas-container");
          if (cont) {
            cont.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
          }

          window.CredizonaUI.actualizarMetrics();
        }

        return;
      }

      // Gestión acreedores
      var gestionKey = e.target.getAttribute("data-gestion-key");
      if (gestionKey) {
        if (!st.herr.gestiones) st.herr.gestiones = {};
        st.herr.gestiones[gestionKey] = {
          resultado: e.target.value,
          fecha: new Date().toISOString(),
        };

        track("deuda_gestion", { acreedor: gestionKey, resultado: e.target.value });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Vencimientos
      var vencKey = e.target.getAttribute("data-venc-key");
      if (vencKey) {
        if (!st.herr.vencimientos) st.herr.vencimientos = {};
        st.herr.vencimientos[vencKey] = e.target.value;

        track("vencimiento_cargado", { acreedor: vencKey, fecha: e.target.value });
        window.guardarLocal();
        return;
      }

      // Atrasos
      var atrasoKey = e.target.getAttribute("data-atraso-key");
      if (atrasoKey) {
        if (!st.herr.atrasos) st.herr.atrasos = {};
        st.herr.atrasos[atrasoKey] = e.target.value;

        track("atraso_actualizado", { acreedor: atrasoKey, estado: e.target.value });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Ingresos extra por select
      var ingIdx   = e.target.getAttribute("data-ing-extra-idx");
      var ingField = e.target.getAttribute("data-ing-extra-field");

      if (ingIdx !== null && ingField) {
        ingIdx = parseInt(ingIdx, 10);

        if (!st.herr.ingresos.extras) st.herr.ingresos.extras = [];
        if (!st.herr.ingresos.extras[ingIdx]) st.herr.ingresos.extras[ingIdx] = {};

        st.herr.ingresos.extras[ingIdx][ingField] =
          ingField === "monto" ? (parseFloat(e.target.value) || 0) : e.target.value;

        recalcularIngresosLocal();
        return;
      }
    });

    // Clicks generados dinámicamente
    main.addEventListener("click", function(e) {
      var st = window.CZState;

      // Acordeones
      var acc = e.target.closest("[data-accordion]");
      if (acc) {
        acc.classList.toggle("open");
        var body = acc.nextElementSibling;
        if (body) body.classList.toggle("open");
        return;
      }

      // Diagnóstico inicial
      if (e.target.id === "btn-ver-evaluacion") {
        window.CredizonaUI.mostrarEvaluacion();
        return;
      }

      if (e.target.id === "btn-analisis-profundo" || e.target.id === "btn-ver-plan-personalizado") {
        st.step = 1;
        window.CredizonaUI.renderAll();
        return;
      }

      // Tabs
      var tabBtn = e.target.closest(".tab-btn");
      if (tabBtn) {
        var id     = tabBtn.getAttribute("data-tab");
        var locked = tabBtn.classList.contains("locked");

        if (locked) {
          window.CredizonaUI.abrirModalPremium();
          return;
        }

        if (id) switchTab(id);
        return;
      }

      // Back buttons
      if (e.target.id === "btn-back-diag") {
        st.step = 0;
        window.CredizonaUI.renderAll();
        return;
      }

      if (e.target.id === "btn-back-gastos") {
        prev();
        return;
      }

      // Agregar deuda
      if (e.target.id === "btn-agregar-deuda") {
        st.deudas.push({ tipo: "", acreedor: "", monto: "", pago: "", estado: "" });

        var cont = document.getElementById("deudas-container");
        if (cont) {
          cont.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
        }

        window.CredizonaUI.actualizarMetrics();
        window.guardarLocal();
        track("add_debt");
        return;
      }

      // Eliminar deuda
      var removeIdx = e.target.getAttribute("data-remove-deuda");
      if (removeIdx !== null) {
        removeIdx = parseInt(removeIdx, 10);

        st.deudas.splice(removeIdx, 1);

        var cont2 = document.getElementById("deudas-container");
        if (cont2) {
          cont2.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
        }

        window.CredizonaUI.actualizarMetrics();
        window.guardarLocal();
        return;
      }

      // Botones Reset Plus
      if (
        e.target.id === "btn-conocer-plus" ||
        e.target.id === "btn-conocer-plus-ia" ||
        e.target.id === "btn-conocer-plus-tab"
      ) {
        window.CredizonaUI.abrirModalPremium();
        return;
      }

      // Cancelar deuda dashboard
      var cancelarIdx = e.target.getAttribute("data-cancelar-deuda");
      if (cancelarIdx !== null) {
        cancelarIdx = parseInt(cancelarIdx, 10);

        if (st.deudas[cancelarIdx]) {
          st.deudas[cancelarIdx].monto = "0";
          st.deudas[cancelarIdx].cancelada = true;

          if (typeof calcularMotor === "function") {
            st.diag = calcularMotor();
          }

          window.guardarLocal();
          window.CredizonaUI.renderTab();
        }

        return;
      }

      // Agregar ingreso extra
      if (e.target.id === "btn-agregar-ing-extra") {
        if (!st.herr.ingresos.extras) st.herr.ingresos.extras = [];
        st.herr.ingresos.extras.push({ tipo: "", monto: 0 });

        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Quitar ingreso extra
      var quitarIng = e.target.getAttribute("data-quitar-ing-extra");
      if (quitarIng !== null) {
        quitarIng = parseInt(quitarIng, 10);

        if (!st.herr.ingresos.extras) st.herr.ingresos.extras = [];
        st.herr.ingresos.extras.splice(quitarIng, 1);

        recalcularIngresosLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Clasificar gasto
      var clsGasto = e.target.getAttribute("data-cls-gasto");
      var clsTipo  = e.target.getAttribute("data-cls-tipo");

      if (clsGasto && clsTipo) {
        if (!st.herr.gastos_cls) st.herr.gastos_cls = {};
        st.herr.gastos_cls[clsGasto] = clsTipo;

        track("gasto_clasificado", { categoria: clsGasto, tipo: clsTipo });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Toggle compromiso
      var compId = e.target.closest("[data-toggle-compromiso]");
      if (compId) {
        var idComp = compId.getAttribute("data-toggle-compromiso");

        if (!st.herr.compromisos) st.herr.compromisos = {};
        st.herr.compromisos[idComp] = !st.herr.compromisos[idComp];

        track("compromisos_actualizados", { id: idComp, valor: st.herr.compromisos[idComp] });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Semáforo
      var semId  = e.target.getAttribute("data-sem-id");
      var semVal = e.target.getAttribute("data-sem-val");

      if (semId && semVal !== null) {
        if (!st.herr.semaforo) st.herr.semaforo = {};
        st.herr.semaforo[semId] = semVal === "true";

        track("semaforo_actualizado", { pregunta: semId, respuesta: st.herr.semaforo[semId] });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Habitos
      var habito = e.target.closest("[data-toggle-habito]");
      if (habito) {
        var fecha = habito.getAttribute("data-toggle-habito");

        if (!st.herr.habitos) st.herr.habitos = {};
        st.herr.habitos[fecha] = !st.herr.habitos[fecha];

        track("habito_marcado", { fecha: fecha, cumplido: st.herr.habitos[fecha] });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }
    });
  }

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

  // Iniciar app
  init();
});

// =============================================================================
// TOAST NOTIFICATION
// =============================================================================
function showToast(msg) {
  var existing = document.getElementById("cz-toast");
  if (existing) existing.remove();

  var el = document.createElement("div");
  el.id = "cz-toast";
  el.style.cssText = [
    "position:fixed",
    "bottom:90px",
    "left:50%",
    "transform:translateX(-50%)",
    "background:rgba(15,23,56,.97)",
    "border:1px solid rgba(255,211,111,.3)",
    "color:#ffd36f",
    "padding:14px 22px",
    "border-radius:14px",
    "font-size:16px",
    "font-weight:700",
    "z-index:9999",
    "text-align:center",
    "max-width:320px",
    "width:calc(100% - 48px)",
    "line-height:1.4",
    "box-shadow:0 8px 24px rgba(0,0,0,.4)",
    "animation:fadeUp .2s ease both",
    "pointer-events:none",
  ].join(";");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 3000);
}

// =============================================================================
// HELPERS LOCALES
// =============================================================================
function recalcularIngresosLocal() {
  var st = window.CZState;

  if (!st.herr.ingresos) {
    st.herr.ingresos = { formal: 0, extras: [], total: 0 };
  }

  var formal = st.herr.ingresos.formal || PRE.ingreso;
  var extra  = (st.herr.ingresos.extras || []).reduce(function(s, e) {
    return s + (parseFloat(e.monto) || 0);
  }, 0);

  st.herr.ingresos.total = formal + extra;

  track("ingreso_real_declarado", {
    ingreso_formal: formal,
    ingreso_extra:  extra,
    total_real:     st.herr.ingresos.total,
  });

  window.guardarLocal();
}

function actualizarSimuladorFlujo() {
  var diag = window.CZState ? window.CZState.diag : null;
  if (!diag) return;

  var slider   = document.querySelector("input[data-liberar-monto]");
  var ingComp  = document.getElementById("ing-complementario");
  var montoLib = slider   ? (parseFloat(slider.value)   || 0) : 0;
  var montoComp = ingComp ? (parseFloat(ingComp.value)  || 0) : 0;

  // Update slider label
  var lvEl = document.getElementById("lv-liberar");
  if (lvEl) lvEl.textContent = fmt(montoLib);

  // Simulate projected cash flow — does NOT modify score, risk, horizon or blockers
  var flujoBase = diag.fin.flujoLibre;
  var flujoSim  = flujoBase + montoLib + montoComp;
  var flujoEl   = document.getElementById("flujo-simulado");
  if (flujoEl) {
    flujoEl.textContent = fmt(flujoSim);
    flujoEl.style.color = flujoSim >= 0 ? "#34ffaf" : "#ff4e72";
  }
}
