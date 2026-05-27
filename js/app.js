// =============================================================================
// app.js — Inicializacion, estado global, navegacion y event listeners
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js, ui.js
// =============================================================================

// =============================================================================
// ESTADO GLOBAL
// =============================================================================
window.CZState = {
  step:          0,
  gastos:        {},
  deudas:        [],
  diag:          null,
  snap:          null,
  saldoIni:      0,
  tab:           "plan",
  plusEstado:    "sin_pago",
  iaRes:         null,
  miplan_started: false,

  // Business state — SEPARATE from UI step navigation
  // Only mutate via setRecoveryState(). Never set directly across files.
  user_recovery_state: null,

  // Temporal tracking — lightweight/local only, no backend yet
  temporal: {
    first_seen_at:           null,
    last_seen_at:            null,
    survey_completed_at:     null,
    miplan_started_at:       null,
    first_debt_added_at:     null,
    last_debt_update_at:     null,
    dashboard_generated_at:  null,
    premium_opened_at:       null,
    payment_completed_at:    null,
    session_count:           0,
    days_since_last_session: null,
    return_source:           null,
  },

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
      step:                st.step,
      gastos:              st.gastos,
      deudas:              st.deudas,
      diag:                st.diag,
      snap:                st.snap,
      saldoIni:            st.saldoIni,
      tab:                 st.tab,
      plusEstado:          st.plusEstado,
      iaRes:               st.iaRes,
      miplan_started:      st.miplan_started || false,
      user_recovery_state: st.user_recovery_state || null,
      temporal:            st.temporal || {},
      herr:                st.herr,
      fecha:               new Date().toISOString(),
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

  // SEGMENTO 1: diagInicial → step 1 (deudas)
  if (st.step === 0 && SEGMENTO === 1) {
    st.step = 1;
    setRecoveryState("debt_refinement_started");
    trackEvent("click_continue_analysis");
    window.CredizonaUI.renderAll();
    return;
  }

  // step 1 (deudas) → step 2 (gastos)
  if (st.step === 1) {
    if (st.deudas.length === 0) {
      trackEvent(CZ_EVENT_NAMES.INPUT_VALIDATION_FAILED, { step: 1, field: "deudas" });
      showToast("Agrega al menos una deuda para que podamos analizar tu perfil.");
      return;
    }
    setRecoveryState("debt_refinement_completed");
    setRecoveryState("expense_refinement_started");
    trackEvent(CZ_EVENT_NAMES.DEBT_REFINEMENT_COMPLETED);
    st.step = 2;
    window.CredizonaUI.renderAll();
    return;
  }

  // step 2 (gastos) → step 3 (dashboard)
  if (st.step === 2) {
    var total = Object.values(st.gastos).reduce(function(s, v) {
      return s + (parseFloat(v) || 0);
    }, 0);

    if (total === 0) {
      trackEvent(CZ_EVENT_NAMES.INPUT_VALIDATION_FAILED, { step: 2, field: "gastos" });
      showToast("Agrega aunque sea una estimacion de gastos para continuar.");
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

    // Temporal tracking
    st.temporal.dashboard_generated_at = new Date().toISOString();

    setRecoveryState("expense_refinement_completed");
    setRecoveryState("dashboard_generated");
    trackEvent(CZ_EVENT_NAMES.EXPENSE_REFINEMENT_COMPLETED);
    trackEvent(CZ_EVENT_NAMES.DASHBOARD_GENERATED, {
      score:   st.diag.scoreReset,
      nivel:   st.diag.nivelR,
      plan_id: st.diag.planId,
    });

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

  // Identity (cz_anonymous_id) intentionally preserved in localStorage across resets
  window.CZState = {
    step:                0,
    gastos:              {},
    deudas:              [],
    diag:                null,
    snap:                null,
    saldoIni:            0,
    tab:                 "plan",
    plusEstado:          "sin_pago",
    iaRes:               null,
    miplan_started:      false,
    user_recovery_state: null,
    temporal: {
      first_seen_at:           null,
      last_seen_at:            null,
      survey_completed_at:     null,
      miplan_started_at:       null,
      first_debt_added_at:     null,
      last_debt_update_at:     null,
      dashboard_generated_at:  null,
      premium_opened_at:       null,
      payment_completed_at:    null,
      session_count:           0,
      days_since_last_session: null,
      return_source:           null,
    },
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
// RECOVERY STATE MACHINE
// Centralizes all business-state transitions. Do NOT mutate user_recovery_state
// directly anywhere else — always call setRecoveryState(newState).
//
// Transition map:
//   lead_rejected           → on init() when czuid present but no data found
//   survey_offered          → on init() when no czuid and no data (bridge screen)
//   survey_started          → btn-bridge-survey click (before redirect)
//   survey_completed        → on init() when TIENE_ENCUESTA = true
//   miplan_offered          → on renderDiagnosisScreen() shown (Sprint 5B — see TODO)
//   miplan_started          → btn-diagnosis-start click
//   initial_diagnosis_viewed→ same trigger as miplan_offered (Sprint 5B)
//   debt_refinement_started → next() from step 0 or btn-diagnosis-start
//   debt_refinement_completed → next() from step 1 → step 2
//   expense_refinement_started → same transition as above
//   expense_refinement_completed → next() from step 2 → step 3
//   dashboard_generated     → next() completing step 2, calcularMotor run
//   premium_opened          → abrirModalPremium() called
//   checkout_started        → data-elegir-plan button clicked
//   payment_completed       → future payment confirmation callback
//   reactivation_candidate  → Sprint 5B: derivable from horizon_band
// =============================================================================
function setRecoveryState(newState) {
  var st   = window.CZState;
  var prev = st.user_recovery_state;
  st.user_recovery_state = newState;
  trackEvent(CZ_EVENT_NAMES.RECOVERY_STATE_CHANGED, { from: prev, to: newState });
}

// =============================================================================
// RETURN SOURCE DETECTION
// Determines how the user arrived at this session.
// =============================================================================
function detectReturnSource() {
  var search = (window.location.search || "").toLowerCase();
  var ref    = (document.referrer     || "").toLowerCase();

  if (/[?&]utm_source=whatsapp/.test(search) || ref.includes("whatsapp")) return "whatsapp";
  if (/[?&]utm_source=email/.test(search) || /[?&]utm_medium=email/.test(search)) return "email";
  if (/[?&]czuid=/.test(search)) return "crm_reactivation";
  if (ref) return "organic";
  return "direct";
}

// =============================================================================
// INIT
// DATA SOURCE PRIORITY:
//   1. CRM hydration via czuid (if present in URL)
//   2. localStorage (authoritative fallback — never overwritten by null CRM)
//   3. Bridge screen (step 0) — when neither source has valid behavioral data
// =============================================================================
async function init() {
  var czuid   = CZIdentity.czuid;  // identity layer owns czuid resolution
  var crmData = null;

  // Step 1 — attempt CRM hydration if czuid is present
  if (czuid) {
    trackEvent(CZ_EVENT_NAMES.CRM_HYDRATION_ATTEMPTED, { czuid: czuid });
    crmData = await loadBehavioralDataFromCRM(czuid);
  }

  // Step 2 — localStorage (always checked; authoritative when CRM returns null)
  var sesion = cargarLocal();

  // Resolve priority: CRM > localStorage > bridge
  // Rule: a null CRM response NEVER overwrites valid localStorage state
  var dataToUse = null;

  if (crmData && crmData.diag) {
    dataToUse = crmData;
    trackEvent(CZ_EVENT_NAMES.CRM_HYDRATION_APPLIED, { czuid: czuid });

  } else if (sesion && sesion.diag) {
    dataToUse = sesion;
    if (czuid) {
      trackEvent(CZ_EVENT_NAMES.CRM_HYDRATION_FALLBACK_TO_LOCAL, { czuid: czuid });
    }
  }

  var st  = window.CZState;
  var now = new Date().toISOString();

  // Restore saved state (including new infrastructure fields)
  if (dataToUse) {
    st.step               = 3;
    st.gastos             = dataToUse.gastos              || {};
    st.deudas             = dataToUse.deudas              || [];
    st.diag               = dataToUse.diag;
    st.snap               = dataToUse.snap                || null;
    st.saldoIni           = dataToUse.saldoIni            || 0;
    st.tab                = dataToUse.tab                 || "plan";
    st.plusEstado         = dataToUse.plusEstado          || "sin_pago";
    st.iaRes              = dataToUse.iaRes               || null;
    st.miplan_started     = dataToUse.miplan_started      || false;
    st.user_recovery_state = dataToUse.user_recovery_state || null;
    if (dataToUse.temporal) Object.assign(st.temporal, dataToUse.temporal);
    if (dataToUse.herr) st.herr = dataToUse.herr;
  }

  // Temporal tracking — update session fields
  var tmp = st.temporal;
  if (tmp.last_seen_at) {
    tmp.days_since_last_session = Math.floor(
      (Date.now() - new Date(tmp.last_seen_at).getTime()) / 86400000
    );
  }
  if (!tmp.first_seen_at) tmp.first_seen_at = now;
  tmp.last_seen_at  = now;
  tmp.session_count = (tmp.session_count || 0) + 1;
  tmp.return_source = detectReturnSource();

  // Set initial recovery state if not yet established
  if (!st.user_recovery_state) {
    if (dataToUse) {
      setRecoveryState("dashboard_generated");
    } else if (TIENE_ENCUESTA) {
      setRecoveryState("survey_completed");
    } else if (czuid) {
      setRecoveryState("lead_rejected");
    } else {
      setRecoveryState("survey_offered");
    }
  }

  if (window.CredizonaUI && typeof window.CredizonaUI.renderAll === "function") {
    window.CredizonaUI.renderAll();
  }

  trackEvent("reset_started", { segmento: SEGMENTO, czuid: czuid });
  window.guardarLocal();
}

// =============================================================================
// PREMIUM MODAL WRAPPER
// Centralizes premium_opened state + temporal tracking at all three call sites.
// =============================================================================
function _abrirPremium() {
  var st = window.CZState;
  st.temporal.premium_opened_at = new Date().toISOString();
  setRecoveryState("premium_opened");
  trackEvent(CZ_EVENT_NAMES.PREMIUM_OPENED, { step: st.step });
  window.guardarLocal();
  window.CredizonaUI.abrirModalPremium();
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
        _abrirPremium();
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
          var d = st.deudas[deudaIdx];
          d[deudaField] = e.target.value;

          // Normalize creditor data on every keystroke
          if (deudaField === "acreedor") {
            var norm = normalizarAcreedor(e.target.value);
            d.acreedor_raw         = norm.acreedor_raw;
            d.acreedor_key         = norm.acreedor_key;
            d.acreedor_normalizado = norm.acreedor_normalizado;
            d.acreedor_display     = norm.acreedor_display;
            d.acreedor             = norm.acreedor_display; // backward compat
          }

          // Track pago source; upgrade debt_confidence when amount is declared.
          // Also immediately show/hide the Case A clarification block via DOM
          // without a full card re-render (input fires on every character typed).
          if (deudaField === "pago") {
            d.pago_fuente = "declarado";
            var pagoNum = parseFloat(e.target.value) || 0;
            if (d.situacion_ui === "pagando_normal") {
              var clarifEl = document.getElementById("clarif-block-" + deudaIdx);
              if (clarifEl) clarifEl.style.display = pagoNum > 0 ? "none" : "";
              if (pagoNum > 0) {
                // Payment declared — clear clarification state and upgrade confidence
                d.pago_clarificacion = null;
                if (d.pago_fuente === "no_declarado") d.pago_fuente = "declarado";
                d.debt_confidence = "high";
              } else {
                // Payment cleared — reset confidence to medium until re-declared
                d.debt_confidence = "medium";
              }
            }
          }

          // Case B: mirror ultimo_pago to pago for scoring; upgrade confidence when > 0
          if (deudaField === "ultimo_pago_declarado") {
            d.pago        = e.target.value;
            d.pago_fuente = "ultimo_pago_declarado";
            if (parseFloat(e.target.value) > 0) {
              d.debt_confidence = "high";
            }
          }

          // Enrich computed fields after any change
          if (typeof enriquecerDeuda === "function") enriquecerDeuda(d);

          st.temporal.last_debt_update_at = new Date().toISOString();
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
          var dC = st.deudas[deudaIdx];
          dC[deudaField] = e.target.value;

          // Normalize creditor on change (catches paste / blur without input event)
          if (deudaField === "acreedor") {
            var normC = normalizarAcreedor(e.target.value);
            dC.acreedor_raw         = normC.acreedor_raw;
            dC.acreedor_key         = normC.acreedor_key;
            dC.acreedor_normalizado = normC.acreedor_normalizado;
            dC.acreedor_display     = normC.acreedor_display;
            dC.acreedor             = normC.acreedor_display;
          }

          // Legacy estado handler — dormant since Sprint 6.5 removed the estado dropdown.
          // Estado is now inferred programmatically by the situacion_ui click handler.
          // Kept for backward compatibility with any internal state writes.
          if (deudaField === "estado") {
            var nuevoEstado = e.target.value;
            if (nuevoEstado === "mora") {
              dC.pago        = 0;
              dC.pago_fuente = "mora_sin_pago";
            } else if (nuevoEstado === "atraso_grave") {
              dC.pago        = 0;
              dC.pago_fuente = "no_paga";
            } else if (nuevoEstado === "atraso_leve") {
              dC.pago_fuente = "ultimo_pago_declarado";
            } else if (nuevoEstado === "al_dia") {
              if (!dC.pago_fuente || dC.pago_fuente === "mora_sin_pago" || dC.pago_fuente === "no_paga") {
                dC.pago_fuente = "declarado";
              }
            }
            // Enrich + fire payment behavior classification event
            if (typeof enriquecerDeuda === "function") enriquecerDeuda(dC);
            trackEvent("cz_mp_payment_behavior_classified", {
              pago_fuente:              dC.pago_fuente,
              debt_status:              nuevoEstado,
              tipo:                     dC.tipo,
              monto:                    parseFloat(dC.monto) || 0,
              pago:                     parseFloat(dC.pago)  || 0,
              atraso_tiempo:            dC.atraso_tiempo             || null,
              presion_latente_estimada: dC.presion_latente_estimada  || 0,
            });
          }

          // atraso_tiempo change: fire classification update
          if (deudaField === "atraso_tiempo") {
            if (typeof enriquecerDeuda === "function") enriquecerDeuda(dC);
            trackEvent("cz_mp_payment_behavior_classified", {
              pago_fuente:              dC.pago_fuente,
              debt_status:              dC.estado,
              tipo:                     dC.tipo,
              monto:                    parseFloat(dC.monto) || 0,
              pago:                     parseFloat(dC.pago)  || 0,
              atraso_tiempo:            e.target.value,
              presion_latente_estimada: dC.presion_latente_estimada  || 0,
            });
          }

          // Enrich on tipo/monto change too (affects interest calculation)
          if (deudaField === "tipo" || deudaField === "monto") {
            if (typeof enriquecerDeuda === "function") enriquecerDeuda(dC);
          }

          st.temporal.last_debt_update_at = new Date().toISOString();
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
        if (acc.classList.contains("open")) {
          trackEvent(CZ_EVENT_NAMES.EXPENSE_ACCORDION_OPENED, {
            label: acc.textContent.trim().substring(0, 40),
          });
        }
        return;
      }

      // Diagnosis screen CTA — enter debt refinement flow
      if (e.target.id === "btn-diagnosis-start") {
        var st = window.CZState;
        st.miplan_started = true;
        st.step = 1;
        st.temporal.miplan_started_at = new Date().toISOString();
        setRecoveryState("miplan_started");
        setRecoveryState("debt_refinement_started");
        trackEvent(CZ_EVENT_NAMES.DEBT_REFINEMENT_STARTED, {
          nivel: st.diag ? st.diag.enc.nivel : (calcularEncuesta(PRE.respuestas).nivel),
        });
        window.guardarLocal();
        window.CredizonaUI.renderAll();
        return;
      }

      // Bridge screen — redirect to survey
      if (e.target.id === "btn-bridge-survey") {
        setRecoveryState("survey_started");
        trackEvent(CZ_EVENT_NAMES.SURVEY_STARTED, { source: "bridge_screen" });
        window.guardarLocal();
        window.location.href = SURVEY_URL;
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
          _abrirPremium();
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

      // ===========================================================
      // Sprint 6.5 — Conversational situacion_ui selection
      // Infers internal estado from semantic user-facing choice.
      // ===========================================================
      var situacionVal = e.target.getAttribute("data-deuda-situacion");
      var situacionIdx = e.target.getAttribute("data-deuda-idx");
      if (situacionVal && situacionIdx !== null) {
        situacionIdx = parseInt(situacionIdx, 10);
        var dSit = st.deudas[situacionIdx];
        if (dSit) {
          dSit.situacion_ui = situacionVal;
          // Reset payment fields on situacion change for clean capture
          dSit.pago                   = 0;
          dSit.pago_fuente            = null;
          dSit.atraso_tiempo          = null;
          dSit.atraso_tiempo_aprox    = null;
          dSit.pago_clarificacion     = null;
          dSit.ultimo_pago_declarado  = null;

          // Infer internal estado + set pago_fuente defaults
          if (situacionVal === "pagando_normal") {
            dSit.estado          = "al_dia";
            dSit.pago_fuente     = "declarado";
            dSit.debt_confidence = "medium"; // upgraded to high when pago > 0
          } else if (situacionVal === "atrasado_pagando") {
            dSit.estado          = "atraso_leve";
            dSit.pago_fuente     = "ultimo_pago_declarado";
            dSit.debt_confidence = "medium";
          } else if (situacionVal === "deje_pagar") {
            // estado depends on atraso_tiempo; default to atraso_grave until range is selected
            dSit.estado          = "atraso_grave";
            dSit.pago            = 0;
            dSit.pago_fuente     = "no_paga";
            dSit.debt_confidence = "medium";
          } else if (situacionVal === "mora_reclamo") {
            dSit.estado          = "mora";
            dSit.pago            = 0;
            dSit.pago_fuente     = "mora_sin_pago";
            dSit.debt_confidence = "high"; // unambiguous declaration
          } else if (situacionVal === "no_seguro") {
            dSit.estado          = "atraso_leve";
            dSit.pago_fuente     = "no_declarado";
            dSit.debt_confidence = "low";
          }

          if (typeof enriquecerDeuda === "function") enriquecerDeuda(dSit);
          trackEvent("cz_mp_payment_behavior_classified", {
            situacion_ui:             situacionVal,
            pago_fuente:              dSit.pago_fuente,
            debt_status:              dSit.estado,
            debt_confidence:          dSit.debt_confidence,
            tipo:                     dSit.tipo,
            monto:                    parseFloat(dSit.monto) || 0,
          });
          st.temporal.last_debt_update_at = new Date().toISOString();
          window.guardarLocal();
          var contSit = document.getElementById("deudas-container");
          if (contSit) contSit.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
          window.CredizonaUI.actualizarMetrics();
        }
        return;
      }

      // ===========================================================
      // Sprint 6.5 — Button-group field values
      // Handles atraso_tiempo, atraso_tiempo_aprox, pago_clarificacion
      // (button groups replacing select dropdowns).
      // ===========================================================
      var btnField = e.target.getAttribute("data-deuda-field");
      var btnVal   = e.target.getAttribute("data-deuda-val");
      var btnIdx   = e.target.getAttribute("data-deuda-idx");
      if (btnField && btnVal !== null && btnIdx !== null && e.target.tagName === "BUTTON") {
        btnIdx = parseInt(btnIdx, 10);
        var dBtn = st.deudas[btnIdx];
        if (dBtn) {
          dBtn[btnField] = btnVal;

          // pago_clarificacion: mark source as non-declared
          if (btnField === "pago_clarificacion") {
            dBtn.pago_fuente = "no_declarado";
          }

          // atraso_tiempo in "deje_pagar": re-infer estado from range
          if (btnField === "atraso_tiempo" && dBtn.situacion_ui === "deje_pagar") {
            dBtn.estado = (btnVal === "mas_90") ? "mora" : "atraso_grave";
          }

          // atraso_tiempo in any case: re-classify event
          if (btnField === "atraso_tiempo" || btnField === "atraso_tiempo_aprox") {
            if (typeof enriquecerDeuda === "function") enriquecerDeuda(dBtn);
            trackEvent("cz_mp_payment_behavior_classified", {
              situacion_ui:    dBtn.situacion_ui,
              pago_fuente:     dBtn.pago_fuente,
              debt_status:     dBtn.estado,
              debt_confidence: dBtn.debt_confidence,
              tipo:            dBtn.tipo,
              atraso_tiempo:   btnVal,
            });
          }

          if (typeof enriquecerDeuda === "function") enriquecerDeuda(dBtn);
          st.temporal.last_debt_update_at = new Date().toISOString();
          window.guardarLocal();
          var contBtn = document.getElementById("deudas-container");
          if (contBtn) contBtn.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
          window.CredizonaUI.actualizarMetrics();
        }
        return;
      }

      // Agregar deuda
      if (e.target.id === "btn-agregar-deuda") {
        st.deudas.push({
          tipo: "", acreedor: "", monto: "", pago: "", estado: "",
          acreedor_raw: "", acreedor_key: "", acreedor_normalizado: "otro", acreedor_display: "",
          _source: INPUT_SOURCES.DECLARED,
          // Sprint 6 — payment behavior fields
          pago_fuente:               null,
          atraso_tiempo:             null,
          ultimo_pago_declarado:     null,
          interes_mensual_estimado:  0,
          interes_mostrado:          0,
          capital_estimado:          0,
          presion_latente_estimada:  0,
          costo_financiero_estimado: false,
          // Sprint 6.5 — conversational intake fields
          situacion_ui:              null,
          debt_confidence:           null,
          pago_clarificacion:        null,
          atraso_tiempo_aprox:       null,
        });

        var now = new Date().toISOString();
        if (!st.temporal.first_debt_added_at) st.temporal.first_debt_added_at = now;
        st.temporal.last_debt_update_at = now;

        var cont = document.getElementById("deudas-container");
        if (cont) {
          cont.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
        }

        window.CredizonaUI.actualizarMetrics();
        window.guardarLocal();
        trackEvent(CZ_EVENT_NAMES.DEBT_ADDED, { total_debts: st.deudas.length });
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
        _abrirPremium();
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

  // Iniciar app — consent check runs first
  if (initConsent()) {
    init();
  }
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

// =============================================================================
// QA DEBUG HELPER — Sprint 7B.2
// For DevTools inspection only. Does not affect UI or calculations.
// Usage: CZDebugFinancial()
// =============================================================================
window.CZDebugFinancial = function() {
  var st    = window.CZState || {};
  var deudas = (st.deudas || []);
  var gastos = st.gastos || {};
  var ingreso = (window.PRE && PRE.ingreso) || 0;

  var totalGastos = Object.values(gastos).reduce(function(s, v) {
    return s + (parseFloat(v) || 0);
  }, 0);

  var deudaTotal = deudas.reduce(function(s, d) {
    return s + (parseFloat(d.monto) || 0);
  }, 0);

  var pagosMensualesActivos = deudas.reduce(function(s, d) {
    var sit = d.situacion_ui;
    if (sit === "deje_pagar" || sit === "mora_reclamo") return s;
    return s + (parseFloat(d.pago) || 0);
  }, 0);

  var presionLatenteTotalEstimada = deudas.reduce(function(s, d) {
    return s + (d.presion_latente_estimada || 0);
  }, 0);

  var flujoLibre = ingreso - totalGastos - pagosMensualesActivos;
  var ratioComprometido = ingreso > 0 ? Math.round(pagosMensualesActivos / ingreso * 100) : 0;

  var deudaTotalIngresoRatio = ingreso > 0 ? deudaTotal / ingreso : 0;
  var maxDeudaIngresoRatio = deudas.reduce(function(mx, d) {
    var m = parseFloat(d.monto) || 0;
    return ingreso > 0 ? Math.max(mx, m / ingreso) : mx;
  }, 0);

  var has_mora_or_deje_pagar = deudas.some(function(d) {
    return d.situacion_ui === "deje_pagar" || d.situacion_ui === "mora_reclamo";
  });
  var has_unpaid_debt = deudas.some(function(d) {
    var monto = parseFloat(d.monto) || 0;
    if (monto <= 0) return false;
    var sit = d.situacion_ui;
    if (sit === "deje_pagar" || sit === "mora_reclamo") return true;
    return (parseFloat(d.pago) || 0) === 0;
  });
  var severe_latent_pressure = has_unpaid_debt
    && ingreso > 0
    && (presionLatenteTotalEstimada / ingreso) >= 0.35;

  var sev = typeof calcularSeveridadFinanciera === "function"
    ? calcularSeveridadFinanciera(
        typeof calcularFinanciero === "function" ? calcularFinanciero() : {},
        deudas,
        ingreso
      )
    : {};

  var motor = typeof calcularMotor === "function" ? calcularMotor() : null;
  var iv2   = motor && motor.interpretacion_v2;

  return {
    ingreso:                       ingreso,
    total_gastos:                  totalGastos,
    deuda_total:                   deudaTotal,
    pagos_mensuales_activos:       pagosMensualesActivos,
    presion_latente_total_estimada:presionLatenteTotalEstimada,
    flujo_libre:                   flujoLibre,
    ratio_comprometido_pct:        ratioComprometido + "%",
    deuda_total_ingreso_ratio:     Math.round(deudaTotalIngresoRatio * 100) / 100,
    max_deuda_ingreso_ratio:       Math.round(maxDeudaIngresoRatio * 100) / 100,
    has_unpaid_debt:               has_unpaid_debt,
    has_mora_or_deje_pagar:        has_mora_or_deje_pagar,
    severe_latent_pressure:        severe_latent_pressure,
    severity_stock:                sev.severity_stock || (iv2 && iv2.severity_stock) || null,
    severity_behavioral:           sev.severity_behavioral || (iv2 && iv2.severity_behavioral) || null,
    severity_level:                sev.severity_level || (iv2 && iv2.severity_level) || null,
    recuperabilidad_class:         (iv2 && iv2.recuperabilidad_class) || null,
    // Sprint 8 — guardrail fields
    scoreFinancieroRaw:            motor ? motor.scoreFinancieroRaw : null,
    scoreResetRaw:                 motor ? motor.scoreResetRaw      : null,
    scoreFinancieroCapped:         motor && motor.fin ? motor.fin.scoreFinanciero : null,
    scoreResetCapped:              motor ? motor.scoreReset          : null,
    guardrail_applied:             motor ? motor.guardrail_applied   : null,
    guardrail_reason:              motor ? motor.guardrail_reason    : null,
    nivelR:                        motor ? motor.nivelR              : null,
    // Sprint 8.1 + 8.4 — horizon + copy override fields
    flujo_libre_activo: (function() {
      var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
      return rad.flujoLibreActivo != null ? rad.flujoLibreActivo : null;
    })(),
    horizonte_original:            motor && motor.horizonte ? motor.horizonte.label : null,
    horizonte_renderizado:         (function() {
      var sl = sev.severity_level || (iv2 && iv2.severity_level);
      if (sl === "critico") return "No estimable sin estabilización previa";
      var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
      var fla = rad.flujoLibreActivo != null ? rad.flujoLibreActivo : null;
      var blockerTipos = (motor && motor.bloqueadores || []).map(function(b) { return b.tipo; });
      var negFlow = (fla !== null && fla < 0)
        || blockerTipos.indexOf("flujo_insuficiente") !== -1
        || blockerTipos.indexOf("flujo_mensual_negativo") !== -1
        || (iv2 && iv2.causa_principal === "flujo_negativo");
      if (negFlow) return "No estimable con flujo mensual negativo";
      return motor && motor.horizonte ? motor.horizonte.label : null;
    })(),
    horizon_guardrail_applied:     !!(function() {
      var sl = sev.severity_level || (iv2 && iv2.severity_level);
      if (sl === "critico") return true;
      var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
      var fla = rad.flujoLibreActivo != null ? rad.flujoLibreActivo : null;
      var blockerTipos = (motor && motor.bloqueadores || []).map(function(b) { return b.tipo; });
      return (fla !== null && fla < 0)
        || blockerTipos.indexOf("flujo_insuficiente") !== -1
        || blockerTipos.indexOf("flujo_mensual_negativo") !== -1
        || (iv2 && iv2.causa_principal === "flujo_negativo");
    })(),
    negative_cashflow_horizon_guardrail_applied: (function() {
      var sl = sev.severity_level || (iv2 && iv2.severity_level);
      if (sl === "critico") return false; // critico takes priority; this flag is exclusive
      var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
      var fla = rad.flujoLibreActivo != null ? rad.flujoLibreActivo : null;
      var blockerTipos = (motor && motor.bloqueadores || []).map(function(b) { return b.tipo; });
      return !!(
        (fla !== null && fla < 0)
        || blockerTipos.indexOf("flujo_insuficiente") !== -1
        || blockerTipos.indexOf("flujo_mensual_negativo") !== -1
        || (iv2 && iv2.causa_principal === "flujo_negativo")
      );
    })(),
    horizon_guardrail_reason: (function() {
      var sl = sev.severity_level || (iv2 && iv2.severity_level);
      if (sl === "critico") return "severity_critico";
      var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
      var fla = rad.flujoLibreActivo != null ? rad.flujoLibreActivo : null;
      var blockerTipos = (motor && motor.bloqueadores || []).map(function(b) { return b.tipo; });
      var negFlow = (fla !== null && fla < 0)
        || blockerTipos.indexOf("flujo_insuficiente") !== -1
        || blockerTipos.indexOf("flujo_mensual_negativo") !== -1
        || (iv2 && iv2.causa_principal === "flujo_negativo");
      return negFlow ? "negative_cashflow" : null;
    })(),
    latent_pressure_label_mode:    (sev.has_unpaid_debt || (iv2 && iv2.has_unpaid_debt)) ? "presion_mensual_potencial" : "standard",
    critical_copy_override_applied:!!(sev.severity_level === "critico" || (iv2 && iv2.severity_level === "critico")),
    // Sprint 8.3 — latent pressure math integrity audit fields
    tasa_anual_base: (function() {
      return deudas.map(function(d) {
        return { acreedor: d.acreedor || d.tipo, tipo: d.tipo, tasa_tna: (typeof TASAS !== "undefined" ? TASAS[d.tipo] || 62 : 62) };
      });
    })(),
    tasa_mensual_equivalente: (function() {
      return deudas.map(function(d) {
        var tna = (typeof TASAS !== "undefined" ? TASAS[d.tipo] || 62 : 62);
        return { acreedor: d.acreedor || d.tipo, tasa_mensual_pct: Math.round(tna / 12 * 100) / 100 };
      });
    })(),
    latent_pressure_formula_mode:  "tna_div_12_simple",
    latent_pressure_before_guardrails: presionLatenteTotalEstimada,
    latent_pressure_after_guardrails:  (function() {
      var anyUnrealistic = deudas.some(function(d) { return d.presion_latente_unrealistic_flag; });
      return anyUnrealistic ? "display_replaced_by_qualitative_copy" : presionLatenteTotalEstimada;
    })(),
    latent_pressure_unrealistic_flag: deudas.some(function(d) { return d.presion_latente_unrealistic_flag; }),
    latent_pressure_per_debt: deudas.map(function(d, i) {
      return {
        idx:                  i,
        acreedor:             d.acreedor || d.tipo,
        monto:                parseFloat(d.monto) || 0,
        presion_estimada:     d.presion_latente_estimada || 0,
        unrealistic_flag:     !!d.presion_latente_unrealistic_flag,
      };
    }),
    deudas_detalle: deudas.map(function(d, i) {
      return {
        idx:           i,
        acreedor:      d.acreedor || d.tipo,
        situacion_ui:  d.situacion_ui,
        pago:          parseFloat(d.pago) || 0,
        pago_fuente:   d.pago_fuente,
        presion_lat:   d.presion_latente_estimada || 0,
        unrealistic:   !!d.presion_latente_unrealistic_flag,
      };
    }),
  };
};
