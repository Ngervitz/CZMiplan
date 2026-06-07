// =============================================================================
// app.js — Inicializacion, estado global, navegacion y event listeners
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js, ui.js
// =============================================================================

// =============================================================================
// ESTADO GLOBAL
// =============================================================================
window.CZState = {
  step:          0,
  gastos:          {},
  custom_expenses: [],
  deudas:          [],
  editing_debt_index:       null,
  _deuda_delete_confirm_index: null,
  _deuda_quick_edit_index:      null,
  _deuda_quick_edit_prev_monto: null,
  _deuda_is_new_add:            false,
  _deuda_validation_error:      null,
  diag:          null,
  snap:          null,
  saldoIni:      0,
  tab:           "plan",
  plusEstado:    "sin_pago",
  plus_purchased:     false,
  plus_status:        null,
  plus_report_id:     null,
  plus_purchased_at:  null,
  plus_informe:       null,
  _plusDevCtaClicked: false,
  user_email:              null,
  plus_pdf_downloaded:     false,
  plus_email_requested:    false,
  plus_feedback_score:     null,
  plus_feedback_clarity:   null,
  plus_feedback_value:     null,
  plus_feedback_comment:   "",
  plus_feedback_submitted: false,
  iaRes:         null,
  miplan_started: false,

  // Sprint 9 — incomplete data flags
  gastos_missing_confirmed:  false,
  _showGastosWarning:        false,
  _hfCtaShown:               false,
  _gastosWarningTracked:     false,

  // Sprint 10 — Mi Plan in-app legal consent (separate from Credizona funnel consent)
  consent:                   null,
  _consentScreenTracked:     false,

  // SEO IA — in-app virgin onboarding (survey + integrated legals)
  seo_ia_onboarding:         null,
  seo_ia_survey:             null,

  // Sprint 10.1 — user feedback suggestions (Mi Plan tab)
  feedback_suggestions:      [],
  _lastFeedbackFingerprint:  null,

  // Mi Plan dashboard — anchor for "Día X desde tu primera evaluación"
  first_assessment_at:       null,

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
// Sprint 15.celebration — sober milestone overlays (no-op if script missing)
// =============================================================================
function _safeCelebration(opts) {
  if (typeof window.triggerCelebration === "function") {
    window.triggerCelebration(opts);
  }
}

function _maybeCelebratePositiveFlow(st, prevFlujo) {
  if (!st || st._celebratedPositiveFlow) return;
  if (prevFlujo == null || prevFlujo > 0) return;
  var fin = st.diag && st.diag.fin;
  if (!fin || fin.flujoLibre == null || fin.flujoLibre <= 0) return;
  st._celebratedPositiveFlow = true;
  _safeCelebration({
    emoji: "💚",
    title: "¡Tu flujo es positivo!",
    subtitle: "Tus números empiezan a cerrar. Ahora hay que sostenerlo.",
  });
}

// =============================================================================
// Sprint 12.2 — debt edit / delete / paid helpers
// =============================================================================
function recalcDiagYGuardar() {
  var st = window.CZState;
  var prevFlujo = null;
  if (st.diag && st.diag.fin && st.diag.fin.flujoLibre != null) {
    prevFlujo = st.diag.fin.flujoLibre;
  }
  if (typeof calcularMotor === "function") {
    st.diag = calcularMotor();
    st._diagSource = "live_calc";
  }
  window.guardarLocal();
  _maybeCelebratePositiveFlow(st, prevFlujo);
}

function isDebtDraftAdd(d) {
  return !!(d && d._is_draft_add);
}

function deudasParaPersistir(deudas) {
  if (!deudas || !deudas.length) return deudas || [];
  return deudas.filter(function(d) { return !isDebtDraftAdd(d); });
}

function isOrphanedDraftDebtFromStorage(d) {
  if (!d) return false;
  if (d._is_draft_add === true) return true;
  var hasSource = d._source != null && d._source !== "";
  if (!hasSource) return false;
  var acreedor = String(d.acreedor_raw != null ? d.acreedor_raw : (d.acreedor || "")).trim();
  var monto = parseFloat(d.monto);
  if (!d.created_at) return false;
  if (d._saved === true || d._finalized === true) return false;
  return !acreedor && (isNaN(monto) || monto <= 0);
}

function sanitizeLoadedDeudas(deudas) {
  if (!deudas || !deudas.length) return deudas || [];
  return deudas.filter(function(d) { return !isOrphanedDraftDebtFromStorage(d); });
}

function createEmptyDebtObject() {
  var now = new Date().toISOString();
  return {
    id:                        "deuda_" + Date.now(),
    _is_draft_add:             true,
    tipo:                      "",
    acreedor:                  "",
    monto:                     "",
    pago:                      "",
    estado:                    "",
    acreedor_raw:              "",
    acreedor_key:              "",
    acreedor_normalizado:      "otro",
    acreedor_display:          "",
    _source:                   INPUT_SOURCES.DECLARED,
    cancelada:                 false,
    situacion_ui:              "pagando_normal",
    pago_fuente:               null,
    atraso_tiempo:             null,
    ultimo_pago_declarado:     null,
    interes_mensual_estimado:  0,
    interes_mostrado:          0,
    capital_estimado:          0,
    presion_latente_estimada:  0,
    costo_financiero_estimado: false,
    debt_confidence:           null,
    pago_clarificacion:        null,
    atraso_tiempo_aprox:       null,
    created_at:                now,
    updated_at:                now,
  };
}

function sanitizeDebtNumericInputString(raw) {
  if (raw == null) return "";
  var s = String(raw);
  var out = "";
  var sepUsed = false;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c >= "0" && c <= "9") {
      out += c;
    } else if ((c === "." || c === ",") && !sepUsed) {
      out += c;
      sepUsed = true;
    }
  }
  return out;
}

function debtNumericValueForState(sanitized) {
  if (sanitized === "") return "";
  return String(sanitized).replace(",", ".");
}

function parseDebtNumeric(val) {
  if (val == null) return NaN;
  var s = String(val).trim();
  if (s === "") return NaN;
  return parseFloat(s.replace(",", "."));
}

function applyDebtNumericInputSanitize(inputEl) {
  if (!inputEl) return;
  var sanitized = sanitizeDebtNumericInputString(inputEl.value);
  if (inputEl.value !== sanitized) inputEl.value = sanitized;
}

function syncDebtNumericFieldFromInput(inputEl, field, deudaIdx) {
  var st = window.CZState;
  if (!inputEl || !st.deudas[deudaIdx]) return;
  applyDebtNumericInputSanitize(inputEl);
  st.deudas[deudaIdx][field] = debtNumericValueForState(inputEl.value);
}

function applyDebtNumericFieldBlur(inputEl, field, deudaIdx) {
  var st = window.CZState;
  var d = st.deudas[deudaIdx];
  if (!d || !inputEl) return;
  applyDebtNumericInputSanitize(inputEl);
  var display = inputEl.value;
  var stored = debtNumericValueForState(display);

  if (display === "") {
    var pre = inputEl.dataset.prefocusValue;
    if (pre != null && String(pre).trim() !== "") {
      var preStored = debtNumericValueForState(String(pre).trim());
      var preNum = parseDebtNumeric(preStored);
      if (!Number.isNaN(preNum) && preNum > 0) {
        inputEl.value = String(pre).trim();
        d[field] = preStored;
        delete inputEl.dataset.prefocusValue;
        return;
      }
    }
    inputEl.value = "";
    d[field] = "";
    delete inputEl.dataset.prefocusValue;
    return;
  }

  if (field === "monto") {
    var n = parseDebtNumeric(stored);
    if (Number.isNaN(n) || n <= 0) {
      inputEl.value = "";
      d.monto = "";
      delete inputEl.dataset.prefocusValue;
      return;
    }
    inputEl.value = display;
    d.monto = stored;
    delete inputEl.dataset.prefocusValue;
    return;
  }
  if (field === "pago") {
    if (Number.isNaN(parseDebtNumeric(stored))) {
      inputEl.value = "";
      d.pago = "";
      delete inputEl.dataset.prefocusValue;
      return;
    }
    inputEl.value = display;
    d.pago = stored;
    delete inputEl.dataset.prefocusValue;
  }
}

function normalizeDebtPagoForSave(d) {
  if (!d) return;
  var pagoStr = d.pago == null ? "" : String(d.pago).trim();
  var pagoMensual = parseDebtNumeric(pagoStr);
  if (pagoStr === "" || Number.isNaN(pagoMensual)) {
    d.pago = 0;
  } else {
    d.pago = pagoMensual;
  }
}

var DEBT_MSG_PAGO_ACTIVO_REQUERIDO = "Para indicar que la deuda está siendo pagada necesitás ingresar un pago mensual mayor a $0.";
var DEBT_MSG_PAGO_EXCEDE_SALDO = "El pago mensual no puede ser mayor al saldo total de la deuda.";

function debtActivePagoAmount(d) {
  if (!d) return NaN;
  var sit = d.situacion_ui || "";
  if (sit === "atrasado_pagando") {
    var ultStr = d.ultimo_pago_declarado == null ? "" : String(d.ultimo_pago_declarado).trim();
    if (ultStr !== "") return parseDebtNumeric(ultStr);
    var pagoStr = d.pago == null ? "" : String(d.pago).trim();
    if (pagoStr !== "") return parseDebtNumeric(pagoStr);
    return NaN;
  }
  if (sit === "pagando_normal") {
    var ps = d.pago == null ? "" : String(d.pago).trim();
    if (ps === "") return NaN;
    return parseDebtNumeric(ps);
  }
  return NaN;
}

function debtDeclaredPagoAmount(d) {
  if (!d) return NaN;
  var sit = d.situacion_ui || "";
  if (sit === "atrasado_pagando") return debtActivePagoAmount(d);
  var pagoStr = d.pago == null ? "" : String(d.pago).trim();
  if (pagoStr === "") return NaN;
  return parseDebtNumeric(pagoStr);
}

function validateDebtForSave(d) {
  if (!d) {
    return { ok: false, msg: "Completá los datos de la deuda para continuar." };
  }
  var acreedor = String(d.acreedor_raw != null ? d.acreedor_raw : (d.acreedor || "")).trim();
  if (!acreedor) {
    return { ok: false, msg: "Ingresá el acreedor para continuar." };
  }
  var saldo = parseDebtNumeric(d.monto);
  if (isNaN(saldo) || saldo <= 0) {
    return { ok: false, msg: "El saldo debe ser mayor a 0." };
  }
  if (!d.situacion_ui) {
    return { ok: false, msg: "Seleccioná qué está pasando con esta deuda." };
  }

  var sit = d.situacion_ui || "";
  if (sit === "pagando_normal" || sit === "atrasado_pagando") {
    if (sit === "pagando_normal") {
      var pagoRaw = d.pago == null ? "" : String(d.pago).trim();
      var pagoValue = parseFloat(pagoRaw);
      var pagoInvalid = pagoRaw === "" || Number.isNaN(pagoValue) || pagoValue <= 0;
      if (pagoInvalid) {
        return { ok: false, msg: DEBT_MSG_PAGO_ACTIVO_REQUERIDO };
      }
    } else {
      var pagoActivo = debtActivePagoAmount(d);
      if (Number.isNaN(pagoActivo) || pagoActivo <= 0) {
        return { ok: false, msg: DEBT_MSG_PAGO_ACTIVO_REQUERIDO };
      }
    }
  }

  var pagoStr = d.pago == null ? "" : String(d.pago).trim();
  if (pagoStr !== "") {
    var pagoMensual = parseDebtNumeric(pagoStr);
    if (!Number.isNaN(pagoMensual) && pagoMensual < 0) {
      return { ok: false, msg: "El pago mensual no puede ser negativo." };
    }
  }

  var pagoDeclarado = debtDeclaredPagoAmount(d);
  if (!Number.isNaN(pagoDeclarado) && pagoDeclarado > saldo) {
    return { ok: false, msg: DEBT_MSG_PAGO_EXCEDE_SALDO };
  }

  return { ok: true, msg: "" };
}

function trackCRMDebtEvent(eventName, payload) {
  if (typeof trackCRMEvent !== "function") return;
  var p = { debt_index: payload.debt_index };
  if (payload.fields_changed_count != null) {
    p.fields_changed_count = payload.fields_changed_count;
  }
  trackCRMEvent(eventName, p);
}

function scrollDeudaCardIntoView(idx) {
  setTimeout(function() {
    var el = document.getElementById("debt-card-" + idx)
      || document.getElementById("dlive-" + idx);
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, 80);
}

// Sprint 12.4d — quick edit monto: commit on blur/Enter (presentación; misma ruta de cálculo)
function commitDeudaQuickMontoFromInput(inputEl) {
  var st = window.CZState;
  if (!inputEl || st._deuda_quick_edit_committing) return;

  var idx = parseInt(inputEl.getAttribute("data-editar-deuda"), 10);
  if (isNaN(idx) || st._deuda_quick_edit_index !== idx) return;

  st._deuda_quick_edit_committing = true;

  var d = st.deudas[idx];
  var prev = st._deuda_quick_edit_prev_monto;
  var rawStr = String(inputEl.value).trim();
  var num = parseFloat(rawStr);
  var valid = rawStr !== "" && !isNaN(num) && num >= 0;

  st._deuda_quick_edit_index = null;
  st._deuda_quick_edit_prev_monto = null;

  if (d) {
    if (valid) {
      d.monto = inputEl.value;
      d.cancelada = false;
      if (typeof enriquecerDeuda === "function") enriquecerDeuda(d);
      if (typeof calcularMotor === "function") {
        st.diag = calcularMotor();
      }
      st.temporal.last_debt_update_at = new Date().toISOString();
      window.guardarLocal();
    } else if (prev !== undefined && prev !== null) {
      d.monto = prev;
    }
  }

  st._deuda_quick_edit_committing = false;

  if (st.step === 3 && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
    window.CredizonaUI.renderTab();
  } else if (window.CredizonaUI && typeof window.CredizonaUI.renderAll === "function") {
    window.CredizonaUI.renderAll();
  }
}

// Sprint 12.2 Fix — refresh debt cards on step 2 (deudas-container) or step 3 (tab)
function refreshDebtCardsUI() {
  var st = window.CZState;
  if (!window.CredizonaUI) return;
  if (st.step === 3 && typeof window.CredizonaUI.renderTab === "function") {
    window.CredizonaUI.renderTab();
    return;
  }
  var cont = document.getElementById("deudas-container");
  if (cont && typeof window.CredizonaUI.renderDeudaCard === "function") {
    cont.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
  }
}

// Clear only fields incompatible with current situacion_ui (preserve when still valid)
function sanitizeDebtFieldsForSituacion(d) {
  if (!d) return;
  var sit = d.situacion_ui || "";

  if (sit === "pagando_normal") {
    d.atraso_tiempo         = null;
    d.atraso_tiempo_aprox   = null;
    d.ultimo_pago_declarado = null;
    d.estado                = "al_dia";
    if (d.pago_fuente === "mora_sin_pago" || d.pago_fuente === "no_paga"
        || d.pago_fuente === "ultimo_pago_declarado") {
      d.pago_fuente = parseFloat(d.pago) > 0 ? "declarado"
        : (d.pago_clarificacion ? "no_declarado" : "declarado");
    }
  } else if (sit === "atrasado_pagando") {
    d.pago_clarificacion  = null;
    d.atraso_tiempo_aprox  = null;
    d.estado               = "atraso_leve";
    if (!d.pago_fuente || d.pago_fuente === "declarado"
        || d.pago_fuente === "mora_sin_pago" || d.pago_fuente === "no_paga") {
      d.pago_fuente = "ultimo_pago_declarado";
    }
    if (d.ultimo_pago_declarado != null && d.ultimo_pago_declarado !== "") {
      d.pago = d.ultimo_pago_declarado;
    }
  } else if (sit === "deje_pagar") {
    d.pago                  = 0;
    d.ultimo_pago_declarado = null;
    d.pago_clarificacion    = null;
    d.atraso_tiempo_aprox   = null;
    d.pago_fuente           = "no_paga";
    d.estado                = (d.atraso_tiempo === "mas_90") ? "mora" : "atraso_grave";
  } else if (sit === "mora_reclamo") {
    d.pago                  = 0;
    d.atraso_tiempo         = null;
    d.atraso_tiempo_aprox   = null;
    d.ultimo_pago_declarado = null;
    d.pago_clarificacion    = null;
    d.pago_fuente           = "mora_sin_pago";
    d.estado                = "mora";
  } else if (sit === "no_seguro") {
    d.pago_clarificacion  = null;
    d.atraso_tiempo       = null;
    d.ultimo_pago_declarado = null;
    d.estado              = "atraso_leve";
    if (!d.pago_fuente || d.pago_fuente === "declarado"
        || d.pago_fuente === "mora_sin_pago" || d.pago_fuente === "no_paga") {
      d.pago_fuente = "no_declarado";
    }
  }
}

function applySituacionUiChange(d, newSit) {
  var prev = d.situacion_ui || null;
  if (newSit === prev) return false;

  d.situacion_ui = newSit;

  if (newSit === "pagando_normal") {
    d.atraso_tiempo         = null;
    d.atraso_tiempo_aprox   = null;
    d.ultimo_pago_declarado = null;
    if (prev === "deje_pagar" || prev === "mora_reclamo") {
      d.pago               = 0;
      d.pago_clarificacion = null;
    }
    d.estado          = "al_dia";
    d.pago_fuente     = "declarado";
    d.debt_confidence = (parseFloat(d.pago) > 0) ? "high" : "medium";
  } else if (newSit === "atrasado_pagando") {
    d.pago_clarificacion = null;
    d.atraso_tiempo_aprox = null;
    if (prev === "deje_pagar" || prev === "mora_reclamo" || prev === "no_seguro") {
      d.pago          = 0;
      d.atraso_tiempo = null;
    }
    d.estado          = "atraso_leve";
    d.pago_fuente     = "ultimo_pago_declarado";
    d.debt_confidence = (parseFloat(d.ultimo_pago_declarado) > 0 || parseFloat(d.pago) > 0)
      ? "high" : "medium";
  } else if (newSit === "deje_pagar") {
    d.pago                  = 0;
    d.ultimo_pago_declarado = null;
    d.pago_clarificacion    = null;
    if (prev !== "deje_pagar") d.atraso_tiempo = null;
    d.estado          = "atraso_grave";
    d.pago_fuente     = "no_paga";
    d.debt_confidence = "medium";
  } else if (newSit === "mora_reclamo") {
    d.pago                  = 0;
    d.atraso_tiempo         = null;
    d.atraso_tiempo_aprox   = null;
    d.ultimo_pago_declarado = null;
    d.pago_clarificacion    = null;
    d.estado                = "mora";
    d.pago_fuente           = "mora_sin_pago";
    d.debt_confidence       = "high";
  } else if (newSit === "no_seguro") {
    d.pago_clarificacion  = null;
    d.atraso_tiempo       = null;
    d.ultimo_pago_declarado = null;
    d.estado              = "atraso_leve";
    d.pago_fuente         = "no_declarado";
    d.debt_confidence     = "low";
  }

  return true;
}

function normalizeDebtCreditorFields(d) {
  if (!d) return;
  var raw = d.acreedor_raw != null ? d.acreedor_raw : (d.acreedor || "");
  if (typeof normalizarAcreedor === "function") {
    var norm = normalizarAcreedor(raw);
    d.acreedor_raw         = norm.acreedor_raw;
    d.acreedor_key         = norm.acreedor_key;
    d.acreedor_normalizado = norm.acreedor_normalizado;
    d.acreedor_display     = norm.acreedor_display;
    d.acreedor             = norm.acreedor_display;
  }
}

function countDebtFieldsChanged(before, after) {
  if (!before || !after) return 1;
  var keys = [
    "tipo", "acreedor", "acreedor_raw", "acreedor_display", "acreedor_key",
    "acreedor_normalizado", "monto", "situacion_ui", "pago", "pago_fuente",
    "atraso_tiempo", "ultimo_pago_declarado", "debt_confidence", "estado",
    "pago_clarificacion", "atraso_tiempo_aprox",
  ];
  var n = 0;
  keys.forEach(function(k) {
    if (String(before[k] != null ? before[k] : "") !== String(after[k] != null ? after[k] : "")) {
      n += 1;
    }
  });
  return n || 1;
}

function finalizeDebtEdit(saveIdx) {
  var st = window.CZState;
  var d  = st.deudas[saveIdx];
  if (!d) return;

  var validation = validateDebtForSave(d);
  if (!validation.ok) {
    st._deuda_validation_error = validation.msg;
    if (st.step === 3 && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
      window.CredizonaUI.renderTab();
    } else if (window.CredizonaUI && typeof window.CredizonaUI.renderAll === "function") {
      window.CredizonaUI.renderAll();
    }
    return;
  }

  st._deuda_validation_error = null;

  normalizeDebtPagoForSave(d);
  normalizeDebtCreditorFields(d);
  sanitizeDebtFieldsForSituacion(d);
  if (typeof enriquecerDeuda === "function") enriquecerDeuda(d);

  d.updated_at = new Date().toISOString();
  if (!d.created_at) d.created_at = d.updated_at;
  delete d._is_draft_add;
  st.temporal.last_debt_update_at = d.updated_at;

  var wasNewAdd = !!st._deuda_is_new_add;
  var changed = countDebtFieldsChanged(st._deuda_edit_snapshot, d);
  st.editing_debt_index = null;
  st._deuda_edit_snapshot = null;
  st._deuda_delete_confirm_index = null;
  st._deuda_is_new_add = false;

  if (wasNewAdd) {
    if (!st.temporal.first_debt_added_at) {
      st.temporal.first_debt_added_at = d.created_at;
    }
    trackEvent(CZ_EVENT_NAMES.DEBT_ADDED, { total_debts: st.deudas.length, source: "deudas_tab" });
  } else {
    trackCRMDebtEvent("debt_edited", {
      debt_index: saveIdx,
      fields_changed_count: changed,
    });
  }

  recalcDiagYGuardar();
  if (st.step === 3) {
    st.tab = "deudas";
    if (window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
      window.CredizonaUI.renderTab();
    } else if (typeof window.CredizonaUI.renderAll === "function") {
      window.CredizonaUI.renderAll();
    }
    if (wasNewAdd && typeof showToast === "function") {
      showToast("Deuda agregada. Tu diagnóstico se actualizó.", 3200);
    }
  } else {
    refreshDebtCardsUI();
    if (typeof window.CredizonaUI.actualizarMetrics === "function") {
      window.CredizonaUI.actualizarMetrics();
    }
  }
}

// =============================================================================
// Sprint 14.0 — Mi Plan Plus state & payment helpers
// =============================================================================
function _plusTrackingIds() {
  var id = window.CZIdentity || {};
  return {
    czuid:   id.crm_contact_id || id.anonymous_id || null,
    plan_id: (window.CZState && window.CZState.diag)
      ? window.CZState.diag.planId
      : null,
  };
}

function _plusIsValidEmail(email) {
  return typeof sanitizeUrlEmail === "function"
    ? sanitizeUrlEmail(email) != null
    : (typeof email === "string" && email.trim().indexOf("@") > 0 && email.indexOf(".") > 0);
}

function preloadUserEmailFromUrl() {
  /* MIGRATION NOTE: Future CRM endpoint can hydrate user_email by czuid using this same field. */
  var st = window.CZState;
  try {
    var p = new URLSearchParams(window.location.search);
    var email = typeof sanitizeUrlEmail === "function"
      ? sanitizeUrlEmail(p.get("email"))
      : null;
    if (!email) return;
    st.user_email = email;
    window.guardarLocal();
  } catch (e) {}
}

function onPlusPdfDownload() {
  var st = window.CZState;
  if (st.plus_status !== "PLUS_READY" || !st.plus_informe) return;
  if (typeof downloadPlusReportPdf === "function") {
    downloadPlusReportPdf();
  }
}

async function onPlusEmailRequest() {
  var st = window.CZState;
  if (st.plus_status !== "PLUS_READY" || !st.plus_informe || st.plus_email_requested) return;

  var input = document.getElementById("plus-email-input");
  var email = st.user_email;
  if (st._plus_email_edit_mode && input) {
    email = typeof sanitizeUrlEmail === "function"
      ? sanitizeUrlEmail(input.value)
      : String(input.value || "").trim().toLowerCase();
    if (!email) {
      input.focus();
      return;
    }
    st.user_email = email;
    st._plus_email_edit_mode = false;
    window.guardarLocal();
  } else if (!_plusIsValidEmail(email)) {
    email = typeof sanitizeUrlEmail === "function"
      ? sanitizeUrlEmail(input ? input.value : "")
      : (input ? String(input.value || "").trim() : "");
    if (!_plusIsValidEmail(email)) {
      if (input) input.focus();
      return;
    }
    st.user_email = email;
    window.guardarLocal();
  }

  var ids = _plusTrackingIds();
  var payload = {
    czuid:          ids.czuid,
    email:          email,
    plus_report_id: st.plus_report_id,
    sent_at:        new Date().toISOString(),
  };

  try {
    await sendPlusReportEmail(payload);
    st.plus_email_requested = true;
    window.guardarLocal();

    if (typeof trackEvent === "function") {
      trackEvent("plus_report_email_requested", {
        czuid:          ids.czuid,
        plan_id:        ids.plan_id,
        plus_report_id: st.plus_report_id,
      });
    }
    if (typeof trackCRMEvent === "function") {
      trackCRMEvent("plus_report_email_requested", {
        czuid:          ids.czuid,
        email:          email,
        plus_report_id: st.plus_report_id,
        requested_at:   new Date().toISOString(),
      });
    }

    if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
      window.CredizonaUI.renderTab();
    }
  } catch (err) {
    console.error(err);
  }
}

function onPlusFeedbackSubmit() {
  var st = window.CZState;
  if (st.plus_feedback_submitted || st.plus_feedback_score == null) return;

  var ta = document.getElementById("plus-fb-comment");
  st.plus_feedback_comment = ta ? String(ta.value || "").trim() : (st.plus_feedback_comment || "");

  st.plus_feedback_submitted = true;
  window.guardarLocal();

  var ids = _plusTrackingIds();
  if (typeof trackEvent === "function") {
    trackEvent("plus_feedback_submitted", {
      czuid:          ids.czuid,
      plan_id:        ids.plan_id,
      plus_report_id: st.plus_report_id,
      score:          st.plus_feedback_score,
      clarity:        st.plus_feedback_clarity,
      value:          st.plus_feedback_value,
    });
  }
  if (typeof trackCRMEvent === "function") {
    trackCRMEvent("plus_feedback_submitted", {
      czuid:            ids.czuid,
      plus_report_id:   st.plus_report_id,
      score:            st.plus_feedback_score,
      clarity:          st.plus_feedback_clarity,
      value:            st.plus_feedback_value,
      comment:          st.plus_feedback_comment,
      feedback_version: "v1",
      submitted_at:     new Date().toISOString(),
    });
  }

  if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
    window.CredizonaUI.renderTab();
  }
}

function setPlusStatus(status, opts) {
  opts = opts || {};
  var st = window.CZState;
  var prev = st.plus_status;
  st.plus_status = status;

  if (status === "PLUS_READY" && prev !== "PLUS_READY") {
    if (opts.report_id) st.plus_report_id = opts.report_id;
    if (typeof trackCRMEvent === "function") {
      var ids = _plusTrackingIds();
      trackCRMEvent(CZ_EVENT_NAMES.PLUS_REPORT_READY, {
        czuid:          ids.czuid,
        plus_report_id: st.plus_report_id || null,
      });
    }
  }

  window.guardarLocal();
}

function completarCompraPlus() {
  var st = window.CZState;
  var now = new Date().toISOString();
  st.plus_purchased = true;
  st.plus_purchased_at = now;
  setPlusStatus("PLUS_PROCESSING");
  if (st.temporal) st.temporal.payment_completed_at = now;

  if (typeof trackCRMEvent === "function") {
    var ids = _plusTrackingIds();
    trackCRMEvent(CZ_EVENT_NAMES.PLUS_PURCHASED, {
      czuid:            ids.czuid,
      plus_purchased_at: now,
      plan_id:          ids.plan_id,
      score_reset:      st.diag ? st.diag.scoreReset : null,
    });
  }

  if (typeof trackEvent === "function") {
    trackEvent(CZ_EVENT_NAMES.PLUS_PURCHASED, {
      value:    1290,
      currency: "UYU",
    });
  }

  if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
    window.CredizonaUI.renderTab();
  }
}

function iniciarPagoHandy() {
  var endpoint = (typeof CZ_HANDY_ENDPOINT !== "undefined" && CZ_HANDY_ENDPOINT)
    ? String(CZ_HANDY_ENDPOINT).trim()
    : "";
  if (!endpoint) return false;

  try {
    var base = window.location.href.split("#")[0].split("?")[0];
    var sep = endpoint.indexOf("?") >= 0 ? "&" : "?";
    var returnUrl = encodeURIComponent(base + "?plus_payment=success");
    window.location.href = endpoint + sep + "return_url=" + returnUrl;
    return true;
  } catch (e) {
    return false;
  }
}

function resetPlusPurchaseError() {
  var st = window.CZState;
  st.plus_status = null;
  st.plus_purchased = false;
  st.plus_purchased_at = null;
  st.plus_report_id = null;
  st.plus_informe = null;
  window.guardarLocal();
  if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
    window.CredizonaUI.renderTab();
  }
}

function handlePlusPaymentReturn() {
  try {
    var p = new URLSearchParams(window.location.search);
    if (p.get("plus_payment") !== "success") return;
    completarCompraPlus();
    p.delete("plus_payment");
    var qs = p.toString();
    var clean = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
    window.history.replaceState({}, "", clean);
  } catch (e) {}
}

function onPlusCtaClick() {
  var st = window.CZState;
  var paymentLive = typeof CZ_PLUS_PAYMENT_LIVE !== "undefined" && CZ_PLUS_PAYMENT_LIVE;

  if (typeof trackEvent === "function") {
    trackEvent(CZ_EVENT_NAMES.PLUS_CTA_CLICKED, {
      payment_live: paymentLive,
      cta_source:   "plus_tab",
    });
  }

  if (!paymentLive) {
    var msg = document.getElementById("plus-cta-inline-msg");
    if (msg) {
      msg.textContent = "Estamos activando este servicio. Te avisamos cuando esté disponible.";
      msg.style.display = "block";
    }
    st._plusDevCtaClicked = true;
    if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
      window.CredizonaUI.renderTab();
    }
    return;
  }

  if (!iniciarPagoHandy()) {
    completarCompraPlus();
  }
}

// =============================================================================
// STORAGE
// =============================================================================
window.guardarLocal = function(extra) {
  extra = extra || {};
  try {
    var st = window.CZState;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({
      step:                    st.step,
      gastos:                  st.gastos,
      custom_expenses:         sanitizeCustomExpensesForSave(st.custom_expenses || []),
      deudas:                  deudasParaPersistir(st.deudas),
      diag:                    st.diag,
      snap:                    st.snap,
      saldoIni:                st.saldoIni,
      tab:                     st.tab,
      plusEstado:              st.plusEstado,
      plus_purchased:          !!st.plus_purchased,
      plus_status:             st.plus_status != null ? st.plus_status : null,
      plus_report_id:          st.plus_report_id || null,
      plus_purchased_at:       st.plus_purchased_at || null,
      plus_informe:            st.plus_informe || null,
      user_email:              st.user_email || null,
      plus_pdf_downloaded:     !!st.plus_pdf_downloaded,
      plus_email_requested:    !!st.plus_email_requested,
      plus_feedback_score:     st.plus_feedback_score != null ? st.plus_feedback_score : null,
      plus_feedback_clarity:   st.plus_feedback_clarity || null,
      plus_feedback_value:     st.plus_feedback_value || null,
      plus_feedback_comment:   st.plus_feedback_comment || "",
      plus_feedback_submitted: !!st.plus_feedback_submitted,
      iaRes:                   st.iaRes,
      miplan_started:          st.miplan_started          || false,
      user_recovery_state:     st.user_recovery_state     || null,
      temporal:                st.temporal                || {},
      herr:                    st.herr,
      // Sprint 9 — persist incomplete-data flag across sessions
      gastos_missing_confirmed: !!st.gastos_missing_confirmed,
      // Sprint 10 — persist Mi Plan in-app consent record
      consent:                  st.consent || null,
      seo_ia_onboarding:        st.seo_ia_onboarding || null,
      seo_ia_survey:            st.seo_ia_survey || null,
      // Sprint 10.1 — persist feedback suggestions
      feedback_suggestions:     st.feedback_suggestions || [],
      first_assessment_at:      st.first_assessment_at || null,
      fecha:                   new Date().toISOString(),
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
    trackEvent(CZ_EVENT_NAMES.CLICK_CONTINUE_ANALYSIS);
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
    var total = typeof getTotalMonthlyExpenses === "function"
      ? getTotalMonthlyExpenses()
      : Object.values(st.gastos).reduce(function(s, v) {
          return s + (parseFloat(v) || 0);
        }, 0);

    // Sprint 9 — Show inline warning when gastos are empty and user hasn't confirmed skip
    if (total === 0 && !st.gastos_missing_confirmed) {
      st._showGastosWarning = true;
      window.CredizonaUI.renderAll();
      return;
    }

    st.diag = calcularMotor();
    st._diagSource = "live_calc";

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
      has_gastos: !st.gastos_missing_confirmed,
    });

    var isFirstDiagnosis = !st.first_assessment_at;
    if (isFirstDiagnosis) {
      st.first_assessment_at = new Date().toISOString();
    }

    window.guardarLocal();
    enviarCRM("reset_plan_generated", st.diag);

    st.step         = 3;
    st.tab          = "plan";
    st._toastPending = true;   // Sprint 10 — dashboard confirmation toast (first arrival only)

    window.CredizonaUI.renderAll();

    if (isFirstDiagnosis) {
      _safeCelebration({
        emoji: "📊",
        title: "¡Diagnóstico completo!",
        subtitle: "Ya sabés dónde estás parado. Ese es el primer paso real.",
      });
    }
  }
}

function prev() {
  var st = window.CZState;

  if (st.step > 0 && st.step < 3) {
    st.step--;
    window.CredizonaUI.renderAll();
  }
}

// Sprint 12.5 — editar gastos desde dashboard sin perder estado
function goToEditGastosFromDashboard() {
  var st = window.CZState;
  if (!st || st.step !== 3) return;
  st.step = 2;
  st._showGastosWarning = false;
  window.guardarLocal();
  if (window.CredizonaUI && typeof window.CredizonaUI.renderAll === "function") {
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
    custom_expenses:     [],
    deudas:              [],
    editing_debt_index:       null,
    _deuda_delete_confirm_index: null,
    diag:                null,
    snap:                null,
    saldoIni:            0,
    tab:                 "plan",
    plusEstado:          "sin_pago",
    plus_purchased:      false,
    plus_status:         null,
    plus_report_id:      null,
    plus_purchased_at:   null,
    plus_informe:        null,
    user_email:              null,
    plus_pdf_downloaded:     false,
    plus_email_requested:    false,
    plus_feedback_score:     null,
    plus_feedback_clarity:   null,
    plus_feedback_value:     null,
    plus_feedback_comment:   "",
    plus_feedback_submitted: false,
    iaRes:               null,
    miplan_started:      false,
    user_recovery_state: null,

    // Sprint 9 — incomplete data flags
    gastos_missing_confirmed:  false,
    _showGastosWarning:        false,
    _hfCtaShown:               false,
    _gastosWarningTracked:     false,

    // Sprint 10 — Mi Plan in-app legal consent
    consent:               null,
    _consentScreenTracked: false,

    // Sprint 10.1 — user feedback suggestions
    feedback_suggestions:      [],
    _lastFeedbackFingerprint:  null,

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

var CZ_MIPLAN_SESSION_STARTED_KEY = "cz_miplan_session_started";

function trackMiplanSessionStartedOnce() {
  try {
    if (sessionStorage.getItem(CZ_MIPLAN_SESSION_STARTED_KEY) === "1") return;
    sessionStorage.setItem(CZ_MIPLAN_SESSION_STARTED_KEY, "1");
  } catch (e) {
    return;
  }

  var urlConsent = typeof readConsentFromURL === "function" ? readConsentFromURL() : null;
  var storedConsent = typeof loadStoredConsent === "function" ? loadStoredConsent() : null;
  var entryChannel = typeof detectEntryChannel === "function"
    ? detectEntryChannel()
    : detectReturnSource();

  if (typeof trackEvent === "function") {
    trackEvent(CZ_EVENT_NAMES.MIPLAN_SESSION_STARTED, {
      source: document.referrer ? detectReturnSource() : "direct",
      has_consent_params: !!(urlConsent || storedConsent),
      entry_channel: entryChannel,
    });
  }
}

// =============================================================================
// INIT
// DATA SOURCE PRIORITY:
//   0. Complete survey URL (p1–p10) — fresh evaluation (ignores stored diag/debts/gastos)
//   1. CRM hydration via czuid (if present in URL)
//   2. localStorage (authoritative fallback — never overwritten by null CRM)
//   3. Bridge screen (step 0) — when neither source has valid behavioral data
// =============================================================================
function _hasCompleteSurveyParams() {
  return PRE
    && PRE.respuestas
    && ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"].every(function(k) {
      var v = PRE.respuestas[k];
      return v !== null && v !== undefined && v !== "";
    });
}

async function init() {
  trackMiplanSessionStartedOnce();

  var crmContactId = CZIdentity.crm_contact_id;
  var crmData = null;

  // Step 1 — attempt CRM hydration if czuid is present
  if (crmContactId) {
    trackEvent(CZ_EVENT_NAMES.CRM_HYDRATION_ATTEMPTED, { source: "crm_link" });
    crmData = await loadBehavioralDataFromCRM(crmContactId);
  }

  // Step 2 — localStorage (always checked; authoritative when CRM returns null)
  var sesion = cargarLocal();
  var hasSurveyParams = _hasCompleteSurveyParams();

  // Resolve priority: complete survey URL > CRM > localStorage > bridge
  // Rule: a null CRM response NEVER overwrites valid localStorage state
  var dataToUse = null;

  if (!hasSurveyParams && crmData && crmData.diag) {
    dataToUse = crmData;
    trackEvent(CZ_EVENT_NAMES.CRM_HYDRATION_APPLIED, { source: "crm_link" });

  } else if (!hasSurveyParams && sesion && sesion.diag) {
    dataToUse = sesion;
    if (crmContactId) {
      trackEvent(CZ_EVENT_NAMES.CRM_HYDRATION_FALLBACK_TO_LOCAL, { source: "crm_link" });
    }
  }

  var st  = window.CZState;
  var now = new Date().toISOString();

  st._localStoragePresent = !!(sesion && sesion.diag);
  st._crmHydrated = !!(crmData && crmData.diag);

  if (hasSurveyParams) {
    st._diagSource = "fresh_url";
    st.diag = null;
    st.snap = null;
    st.deudas = [];
    st.gastos = {};
    st.custom_expenses = [];
    st.saldoIni = 0;
    st.step = 3;
    st.tab = "plan";
    st.gastos_missing_confirmed = true;

    if (typeof calcularMotor === "function") {
      st.diag = calcularMotor();
    }

    st.snap = {
      fecha_inicio:  now,
      score_reset:   st.diag ? st.diag.scoreReset : null,
      nivel:         st.diag ? st.diag.nivelR : null,
      plan_id:       st.diag ? st.diag.planId : null,
      saldo_inicial: 0,
    };
    st.first_assessment_at = now;
    st.temporal.dashboard_generated_at = now;
    setRecoveryState("dashboard_generated");

  // Restore saved state (including new infrastructure fields)
  } else if (dataToUse) {
    st._diagSource = st._crmHydrated ? "crm" : "localStorage";
    st.step               = 3;
    st.gastos             = typeof migrateGastosKeys === "function"
      ? migrateGastosKeys(dataToUse.gastos || {})
      : (dataToUse.gastos || {});
    st.custom_expenses    = dataToUse.custom_expenses || [];
    st.deudas             = sanitizeLoadedDeudas(dataToUse.deudas || []);
    st.editing_debt_index = null;
    st._deuda_is_new_add = false;
    st._deuda_validation_error = null;
    st._deuda_edit_snapshot = null;
    st.diag               = dataToUse.diag;
    st.snap               = dataToUse.snap                || null;
    st.saldoIni           = dataToUse.saldoIni            || 0;
    st.tab                = dataToUse.tab                 || "plan";
    st.plusEstado         = dataToUse.plusEstado          || "sin_pago";
    st.plus_purchased     = !!dataToUse.plus_purchased;
    st.plus_status        = dataToUse.plus_status != null ? dataToUse.plus_status : null;
    st.plus_report_id     = dataToUse.plus_report_id || null;
    st.plus_purchased_at  = dataToUse.plus_purchased_at || null;
    st.plus_informe       = dataToUse.plus_informe || null;
    st.user_email         = dataToUse.user_email || st.user_email || null;
    st.plus_pdf_downloaded     = !!dataToUse.plus_pdf_downloaded;
    st.plus_email_requested    = !!dataToUse.plus_email_requested;
    st.plus_feedback_score     = dataToUse.plus_feedback_score != null
      ? dataToUse.plus_feedback_score
      : null;
    st.plus_feedback_clarity   = dataToUse.plus_feedback_clarity || null;
    st.plus_feedback_value     = dataToUse.plus_feedback_value || null;
    st.plus_feedback_comment   = dataToUse.plus_feedback_comment || "";
    st.plus_feedback_submitted = !!dataToUse.plus_feedback_submitted;
    st.iaRes              = dataToUse.iaRes               || null;
    st.miplan_started     = dataToUse.miplan_started      || false;
    st.user_recovery_state = dataToUse.user_recovery_state || null;
    if (dataToUse.temporal) Object.assign(st.temporal, dataToUse.temporal);
    if (dataToUse.herr) st.herr = dataToUse.herr;
    // Sprint 9 — restore incomplete-data flag
    st.gastos_missing_confirmed = !!dataToUse.gastos_missing_confirmed;
    // Sprint 10 — restore Mi Plan in-app consent record
    if (dataToUse.consent) st.consent = dataToUse.consent;
    if (dataToUse.seo_ia_onboarding) st.seo_ia_onboarding = dataToUse.seo_ia_onboarding;
    if (dataToUse.seo_ia_survey) st.seo_ia_survey = dataToUse.seo_ia_survey;
    // Sprint 10.1 — restore feedback suggestions
    if (dataToUse.feedback_suggestions) st.feedback_suggestions = dataToUse.feedback_suggestions;
    if (dataToUse.first_assessment_at) st.first_assessment_at = dataToUse.first_assessment_at;
  } else {
    st._diagSource = "url_pending";
  }

  if (
    st.diag
    && st.diag.interpretacion_v2
    && typeof alignInterpretacionV2ConPlan === "function"
  ) {
    alignInterpretacionV2ConPlan(st.diag.interpretacion_v2, st.diag.planId);
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
    if (hasSurveyParams) {
      // set in fresh URL path above
    } else if (dataToUse) {
      setRecoveryState("dashboard_generated");
    } else if (TIENE_ENCUESTA) {
      setRecoveryState("survey_completed");
    } else if (crmContactId) {
      setRecoveryState("lead_rejected");
    } else {
      setRecoveryState("survey_offered");
    }
  }

  handlePlusPaymentReturn();
  preloadUserEmailFromUrl();

  if (window.CredizonaUI && typeof window.CredizonaUI.renderAll === "function") {
    window.CredizonaUI.renderAll();
  }

  trackEvent(CZ_EVENT_NAMES.RESET_STARTED, { source: "init" });
  window.guardarLocal();
}

// =============================================================================
// SPRINT 10 — Mi Plan in-app consent acceptance handler
// =============================================================================
function handleMiPlanConsentAccepted() {
  var st    = window.CZState;
  var crmContactId = (window.CZIdentity && window.CZIdentity.crm_contact_id) || null;

  // Build and persist the consent record
  st.consent = (typeof buildMiPlanConsentRecord === "function")
    ? buildMiPlanConsentRecord()
    : null;

  if (st.consent) {
    trackEvent(CZ_EVENT_NAMES.MIPLAN_CONSENT_ACCEPTED, {
      entry_channel:  st.consent.entry_channel,
      consent_source: st.consent.consent_source,
    });
  }

  window.guardarLocal();
  window.CredizonaUI.renderAll();
}

// =============================================================================
// SEO IA — in-app onboarding completion (survey → motor, no external redirect)
// =============================================================================
function updateSeoIaDiagnosisCtaState() {
  var btn = document.getElementById("btn-seo-ia-diagnosis");
  if (!btn) return;
  var st = window.CZState;
  var ob = st.seo_ia_onboarding;
  var tc = document.getElementById("chk-seo-ia-tc");
  var pp = document.getElementById("chk-seo-ia-privacy");
  var surveyOk = typeof seoIaSurveyIsComplete === "function"
    ? seoIaSurveyIsComplete(ob)
    : false;
  var legalsOk = !!(tc && tc.checked && pp && pp.checked);
  var enabled = surveyOk && legalsOk;
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1" : ".45";
}

function updateSeoIaSurveyNextState() {
  var btn = document.getElementById("btn-seo-ia-survey-next");
  if (!btn) return;
  var st = window.CZState;
  var ob = st.seo_ia_onboarding;
  var group = ob && ob.surveyGroup ? ob.surveyGroup : 1;
  var enabled = typeof seoIaSurveyGroupIsComplete === "function"
    && seoIaSurveyGroupIsComplete(ob, group);
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? "1" : ".45";
}

function handleSeoIaSurveyAnswer(qIndex, letter) {
  var st = window.CZState;
  if (typeof ensureSeoIaOnboardingState === "function") ensureSeoIaOnboardingState();
  var ob = st.seo_ia_onboarding;
  if (!ob || !ob.respuestas) return;

  ob.respuestas["p" + qIndex] = letter;

  window.guardarLocal();
  window.CredizonaUI.renderAll();
  if (ob.phase === "survey") {
    updateSeoIaSurveyNextState();
  } else if (ob.phase === "legals") {
    updateSeoIaDiagnosisCtaState();
  }
}

function handleSeoIaSurveyNext() {
  var st = window.CZState;
  var ob = st.seo_ia_onboarding;
  if (!ob || ob.phase !== "survey") return;

  var group = ob.surveyGroup || 1;
  if (typeof seoIaSurveyGroupIsComplete === "function"
    && !seoIaSurveyGroupIsComplete(ob, group)) {
    return;
  }

  if (group >= 5) {
    ob.phase = "legals";
  } else {
    ob.surveyGroup = group + 1;
  }

  window.guardarLocal();
  window.CredizonaUI.renderAll();
}

function handleSeoIaIntroStart() {
  var st = window.CZState;
  if (typeof ensureSeoIaOnboardingState === "function") ensureSeoIaOnboardingState();
  st.seo_ia_onboarding.phase = "survey";
  st.seo_ia_onboarding.surveyGroup = 1;
  if (!st.seo_ia_onboarding.started_at) {
    st.seo_ia_onboarding.started_at = new Date().toISOString();
  }

  if (typeof trackEvent === "function" && typeof CZ_EVENT_NAMES !== "undefined") {
    trackEvent(
      CZ_EVENT_NAMES.MIPLAN_VIRGIN_START,
      typeof getSeoIaTrackingPayload === "function" ? getSeoIaTrackingPayload() : {}
    );
  }

  window.guardarLocal();
  window.CredizonaUI.renderAll();
}

function completeSeoIaOnboarding() {
  var st = window.CZState;
  var ob = st.seo_ia_onboarding;
  if (!ob || !ob.respuestas) return;

  var tc = document.getElementById("chk-seo-ia-tc");
  var pp = document.getElementById("chk-seo-ia-privacy");
  if (!(tc && tc.checked && pp && pp.checked)) return;
  if (typeof seoIaSurveyIsComplete === "function" && !seoIaSurveyIsComplete(ob)) return;

  var i;
  for (i = 1; i <= 10; i++) {
    PRE.respuestas["p" + i] = ob.respuestas["p" + i];
  }

  st.consent = (typeof buildMiPlanConsentRecord === "function")
    ? buildMiPlanConsentRecord()
    : null;
  if (st.consent) st.consent.consent_source = "seo_ia_onboarding";

  var seoMeta = (typeof calcularEncuestaSeoIa === "function")
    ? calcularEncuestaSeoIa(ob.respuestas)
    : {};
  var now = new Date().toISOString();
  st.seo_ia_survey = Object.assign({}, seoMeta, {
    respuestas: ob.respuestas,
    acquisition: typeof getSeoIaAcquisitionPayload === "function"
      ? getSeoIaAcquisitionPayload()
      : null,
    started_at: ob.started_at || now,
    completed_at: now,
  });
  ob.phase = "done";

  if (typeof trackEvent === "function" && typeof CZ_EVENT_NAMES !== "undefined") {
    trackEvent(
      CZ_EVENT_NAMES.MIPLAN_VIRGIN_SURVEY_COMPLETED,
      typeof getSeoIaTrackingPayload === "function" ? getSeoIaTrackingPayload() : {}
    );
    trackEvent(CZ_EVENT_NAMES.SURVEY_COMPLETED, { source: "seo_ia_onboarding" });
    if (st.consent) {
      trackEvent(CZ_EVENT_NAMES.MIPLAN_CONSENT_ACCEPTED, {
        entry_channel:  st.consent.entry_channel,
        consent_source: st.consent.consent_source,
      });
    }
  }

  st.diag = null;
  st.snap = null;
  st.deudas = [];
  st.gastos = {};
  st.custom_expenses = [];
  st.saldoIni = 0;
  st.gastos_missing_confirmed = true;

  if (typeof calcularMotor === "function") {
    st.diag = calcularMotor();
  }

  st.snap = {
    fecha_inicio:  now,
    score_reset:   st.diag ? st.diag.scoreReset : null,
    nivel:         st.diag ? st.diag.nivelR : null,
    plan_id:       st.diag ? st.diag.planId : null,
    saldo_inicial: 0,
  };
  st.step = 3;
  st.tab = "plan";
  st.first_assessment_at = now;
  st.temporal.dashboard_generated_at = now;
  st.temporal.survey_completed_at = now;
  st._diagSource = "seo_ia_onboarding";
  st.miplan_started = true;
  setRecoveryState("dashboard_generated");

  window.guardarLocal();

  // CRM — full buildCRMData() payload (respuestas, score_v2, acquisition, motor diag)
  if (typeof enviarCRM === "function" && st.diag) {
    enviarCRM("miplan_virgin_survey_completed", st.diag);
    enviarCRM("reset_plan_generated", st.diag);
  }

  window.CredizonaUI.renderAll();
}

// =============================================================================
// SPRINT 10.1 — Mi Plan tab feedback / suggestions
// =============================================================================
function getSelectedFeedbackCategories() {
  var selected = [];
  document.querySelectorAll(".chk-fb-cat:checked").forEach(function(el) {
    var cat = el.getAttribute("data-cat");
    if (cat) selected.push(cat);
  });
  return selected;
}

function buildFeedbackFingerprint(categories, freeText) {
  var sorted = categories.slice().sort();
  return JSON.stringify({ categories: sorted, free_text: (freeText || "").trim() });
}

function buildFeedbackCategoriesSummary() {
  var arr = (window.CZState && window.CZState.feedback_suggestions) || [];
  var summary = {};
  arr.forEach(function(entry) {
    (entry.categories || []).forEach(function(cat) {
      summary[cat] = (summary[cat] || 0) + 1;
    });
  });
  return summary;
}

function showFeedbackMessage(msg, isSuccess) {
  var el = document.getElementById("fb-feedback-msg");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = isSuccess ? "#34ffaf" : "#ffd447";
  el.style.background = isSuccess ? "rgba(52,255,175,.08)" : "rgba(255,196,0,.08)";
  el.style.border = isSuccess ? "1px solid rgba(52,255,175,.2)" : "1px solid rgba(255,196,0,.25)";
}

function hideFeedbackMessage() {
  var el = document.getElementById("fb-feedback-msg");
  if (el) el.style.display = "none";
}

function updateFeedbackFormUI() {
  var categories = getSelectedFeedbackCategories();
  var hasOtro    = categories.indexOf("Otro") >= 0;
  var otroWrap   = document.getElementById("fb-otro-wrap");
  var otroText   = document.getElementById("fb-otro-text");
  var btn        = document.getElementById("btn-feedback-submit");
  var charCount  = document.getElementById("fb-char-count");

  if (otroWrap) otroWrap.style.display = hasOtro ? "block" : "none";

  if (otroText && charCount) {
    var len = (otroText.value || "").length;
    charCount.textContent = len + " / 500 caracteres";
  }

  if (!btn) return;

  var canSubmit = categories.length > 0;
  if (hasOtro && otroText && !(otroText.value || "").trim()) {
    canSubmit = false;
  }

  btn.disabled      = !canSubmit;
  btn.style.opacity = canSubmit ? "1" : ".45";
}

function clearFeedbackForm() {
  document.querySelectorAll(".chk-fb-cat").forEach(function(el) { el.checked = false; });
  var otroText = document.getElementById("fb-otro-text");
  if (otroText) otroText.value = "";
  var otroWrap = document.getElementById("fb-otro-wrap");
  if (otroWrap) otroWrap.style.display = "none";
  updateFeedbackFormUI();
}

function handleMiPlanSuggestionSubmit() {
  var st         = window.CZState;
  var categories = getSelectedFeedbackCategories();
  var otroText   = document.getElementById("fb-otro-text");
  var freeText   = (otroText && otroText.value) ? otroText.value.trim() : null;
  var hasOtro    = categories.indexOf("Otro") >= 0;

  if (categories.length === 0) {
    showFeedbackMessage("Seleccioná al menos una opción antes de enviar.", false);
    return;
  }

  if (hasOtro && !freeText) {
    showFeedbackMessage("Escribí tu sugerencia antes de enviarla.", false);
    return;
  }

  var fingerprint = buildFeedbackFingerprint(categories, hasOtro ? freeText : "");
  if (st._lastFeedbackFingerprint === fingerprint) {
    showFeedbackMessage("Ya enviaste esta sugerencia.", false);
    return;
  }

  var crmContactId = (window.CZIdentity && window.CZIdentity.crm_contact_id) || null;
  var entryChannel = (typeof detectEntryChannel === "function") ? detectEntryChannel() : "direct";

  if (!st.feedback_suggestions) st.feedback_suggestions = [];

  st.feedback_suggestions.push({
    categories:    categories,
    free_text:     hasOtro ? freeText : null,
    timestamp:     new Date().toISOString(),
    source:        "miplan_tab",
    entry_channel: entryChannel,
    crm_contact_id: crmContactId,
  });

  st._lastFeedbackFingerprint = fingerprint;

  trackEvent(CZ_EVENT_NAMES.MIPLAN_SUGGESTION_SUBMITTED, {
    entry_channel: entryChannel,
    source:        "miplan_tab",
  });

  window.guardarLocal();
  clearFeedbackForm();
  showFeedbackMessage("Gracias. Tu sugerencia nos ayuda a mejorar Mi Plan.", true);
}

// =============================================================================
// PREMIUM MODAL WRAPPER
// Centralizes premium_opened state + temporal tracking at all three call sites.
// =============================================================================
function _abrirPremium() {
  switchTab("plus");
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

      // Sprint 10.1 — feedback "Otro" textarea + character counter
      if (e.target.id === "fb-otro-text") {
        hideFeedbackMessage();
        updateFeedbackFormUI();
        return;
      }

      // Gastos — categorías
      var gastoKey = e.target.getAttribute("data-gasto");
      if (gastoKey) {
        st.gastos[gastoKey] = e.target.value;
        window.guardarLocal();
        if (window.CredizonaUI && typeof window.CredizonaUI.updateGastosTotalDisplay === "function") {
          window.CredizonaUI.updateGastosTotalDisplay();
        }
        return;
      }

      // Sprint 12 — gastos personalizados
      var customField = e.target.getAttribute("data-custom-expense-field");
      var customIdx   = e.target.getAttribute("data-custom-idx");
      if (customField && customIdx !== null) {
        customIdx = parseInt(customIdx, 10);
        if (!st.custom_expenses) st.custom_expenses = [];
        if (!st.custom_expenses[customIdx]) {
          st.custom_expenses[customIdx] = {
            description: "",
            amount: 0,
            classification_override: false,
          };
        }
        var cexp = st.custom_expenses[customIdx];
        if (customField === "amount") {
          cexp.amount = parseFloat(e.target.value) || 0;
        } else {
          cexp.description = e.target.value;
          if (!detectDebtKeywordsInDescription(cexp.description)) {
            if (!st._custom_expense_debt_excluded) st._custom_expense_debt_excluded = {};
            delete st._custom_expense_debt_excluded[String(customIdx)];
          }
        }
        window.guardarLocal();
        if (customField === "description" && window.CredizonaUI
            && typeof window.CredizonaUI.updateCustomExpenseClassificationUI === "function") {
          window.CredizonaUI.updateCustomExpenseClassificationUI(customIdx);
        }
        if (window.CredizonaUI && typeof window.CredizonaUI.updateGastosTotalDisplay === "function") {
          window.CredizonaUI.updateGastosTotalDisplay();
        }
        return;
      }

      // Deudas
      var deudaField = e.target.getAttribute("data-deuda-field");
      var deudaIdx   = e.target.getAttribute("data-deuda-idx");

      if (deudaField !== null && deudaIdx !== null) {
        deudaIdx = parseInt(deudaIdx, 10);

        if (st.deudas[deudaIdx]) {
          var d = st.deudas[deudaIdx];
          if (deudaField === "monto" || deudaField === "pago") {
            syncDebtNumericFieldFromInput(e.target, deudaField, deudaIdx);
          } else {
            d[deudaField] = e.target.value;
          }

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
            var pagoNum = parseDebtNumeric(d.pago) || 0;
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
          if (!isDebtDraftAdd(d)) {
            window.guardarLocal();
          }

          if (window.CredizonaUI && typeof window.CredizonaUI.actualizarMetrics === "function") {
            window.CredizonaUI.actualizarMetrics();
          }
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

    // Clear default "0" on monto/pago focus so typing does not prepend (new + edit debt forms)
    main.addEventListener("focusin", function(e) {
      var focusField = e.target.getAttribute("data-deuda-field");
      if (focusField !== "monto" && focusField !== "pago") return;
      var focusIdx = parseInt(e.target.getAttribute("data-deuda-idx"), 10);
      if (isNaN(focusIdx) || !st.deudas[focusIdx]) return;
      e.target.dataset.prefocusValue = e.target.value;
      if (String(e.target.value).trim() === "0") {
        e.target.value = "";
        st.deudas[focusIdx][focusField] = "";
      }
    });

    // Sprint 12.4d — quick edit monto: commit al salir del campo o Enter
    main.addEventListener("focusout", function(e) {
      if (e.target.getAttribute("data-editar-deuda") !== null) {
        commitDeudaQuickMontoFromInput(e.target);
        return;
      }
      var blurField = e.target.getAttribute("data-deuda-field");
      var blurIdx   = e.target.getAttribute("data-deuda-idx");
      if (blurField === "monto" || blurField === "pago") {
        blurIdx = parseInt(blurIdx, 10);
        if (!isNaN(blurIdx)) {
          applyDebtNumericFieldBlur(e.target, blurField, blurIdx);
        }
      }
    });

    main.addEventListener("keydown", function(e) {
      if (e.key !== "Enter" || e.target.getAttribute("data-editar-deuda") === null) return;
      e.preventDefault();
      commitDeudaQuickMontoFromInput(e.target);
    });

    // Changes generados dinámicamente
    main.addEventListener("change", function(e) {
      var st = window.CZState;

      // Sprint 10.1 — feedback category checkboxes
      if (e.target.classList && e.target.classList.contains("chk-fb-cat")) {
        hideFeedbackMessage();
        updateFeedbackFormUI();
        return;
      }

      // Selects de deuda
      var deudaField = e.target.getAttribute("data-deuda-field");
      var deudaIdx   = e.target.getAttribute("data-deuda-idx");

      if (deudaField !== null && deudaIdx !== null) {
        deudaIdx = parseInt(deudaIdx, 10);

        if (st.deudas[deudaIdx]) {
          var dC = st.deudas[deudaIdx];
          if (deudaField === "monto" || deudaField === "pago") {
            syncDebtNumericFieldFromInput(e.target, deudaField, deudaIdx);
          } else {
            dC[deudaField] = e.target.value;
          }

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
            // CRM_ONLY — backend handles this
            trackCRMEvent(CZ_EVENT_NAMES.PAYMENT_BEHAVIOR_CLASSIFIED, {
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
            // CRM_ONLY — backend handles this
            trackCRMEvent(CZ_EVENT_NAMES.PAYMENT_BEHAVIOR_CLASSIFIED, {
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
          if (!isDebtDraftAdd(dC)) {
            window.guardarLocal();
          }

          if (deudaField === "tipo" || deudaField === "monto") {
            refreshDebtCardsUI();
          }

          if (typeof window.CredizonaUI.actualizarMetrics === "function") {
            window.CredizonaUI.actualizarMetrics();
          }
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

        // CRM_ONLY — backend handles this
        trackCRMEvent(CZ_EVENT_NAMES.DEUDA_GESTION, { acreedor: gestionKey, resultado: e.target.value });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Atrasos
      var atrasoKey = e.target.getAttribute("data-atraso-key");
      if (atrasoKey) {
        if (!st.herr.atrasos) st.herr.atrasos = {};
        st.herr.atrasos[atrasoKey] = e.target.value;

        // CRM_ONLY — backend handles this
        trackCRMEvent(CZ_EVENT_NAMES.ATRASO_ACTUALIZADO, { acreedor: atrasoKey, estado: e.target.value });
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
          source: "diagnosis_screen",
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

      // SEO IA onboarding — intro, survey options, legals, diagnosis CTA
      if (e.target.id === "btn-seo-ia-intro-start") {
        handleSeoIaIntroStart();
        return;
      }

      var _seoOpt = e.target.closest("[data-seo-survey-opt]");
      if (_seoOpt) {
        var _q = parseInt(_seoOpt.getAttribute("data-seo-q"), 10);
        var _letter = _seoOpt.getAttribute("data-seo-survey-opt");
        if (_q && _letter) handleSeoIaSurveyAnswer(_q, _letter);
        return;
      }

      if (e.target.id === "btn-seo-ia-survey-next") {
        handleSeoIaSurveyNext();
        return;
      }

      if (e.target.id === "btn-seo-ia-diagnosis") {
        completeSeoIaOnboarding();
        return;
      }

      if (e.target.id === "chk-seo-ia-tc" || e.target.id === "chk-seo-ia-privacy") {
        updateSeoIaDiagnosisCtaState();
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

      // Sprint 10.1 — Mi Plan tab feedback submit
      if (e.target.id === "btn-feedback-submit") {
        handleMiPlanSuggestionSubmit();
        return;
      }

      // Sprint 10 — Mi Plan consent screen: accept button
      if (e.target.id === "btn-miplan-consent-accept") {
        handleMiPlanConsentAccepted();
        return;
      }

      // Sprint 10 — Mi Plan consent checkboxes: enable/disable accept button
      if (e.target.id === "chk-miplan-tc" || e.target.id === "chk-miplan-privacy") {
        var _btnC = document.getElementById("btn-miplan-consent-accept");
        if (_btnC) {
          var _tcEl = document.getElementById("chk-miplan-tc");
          var _ppEl = document.getElementById("chk-miplan-privacy");
          var _both = !!((_tcEl && _tcEl.checked) && (_ppEl && _ppEl.checked));
          _btnC.disabled       = !_both;
          _btnC.style.opacity  = _both ? "1" : ".45";
        }
        return;
      }

      // Sprint 12.5 — editar gastos desde dashboard
      if (e.target.id === "btn-editar-gastos-dashboard") {
        goToEditGastosFromDashboard();
        return;
      }

      // Sprint 9 — Gastos missing warning: "Agregar gastos" keeps user on step 2
      if (e.target.id === "btn-gastos-warn-back") {
        st._showGastosWarning = false;
        window.CredizonaUI.renderAll();
        return;
      }

      // Sprint 9 — Gastos missing warning: "Continuar igual" proceeds with flag
      if (e.target.id === "btn-gastos-warn-skip") {
        st.gastos_missing_confirmed = true;
        st._showGastosWarning       = false;
        var _diagForTrack = st.diag;
        trackEvent(CZ_EVENT_NAMES.GASTOS_MISSING_CONFIRMED, {
          has_gastos: false,
        });
        next();
        return;
      }

      // Sprint 9 / 14.0c — Hidden factor CTA → Mi Plan Plus tab
      if (e.target.id === "btn-hf-cta") {
        trackEvent(CZ_EVENT_NAMES.HIDDEN_FACTOR_CTA_CLICKED, {
          cta_source: "hidden_factor",
        });
        switchTab("plus");
        return;
      }

      // Mi Plan — retry application CTA (no financial data in redirect URL)
      if (e.target.id === "btn-retry-application") {
        var retryUrl = typeof buildRetryApplicationUrl === "function"
          ? buildRetryApplicationUrl()
          : null;
        if (!retryUrl) return;
        var retryState = (window.CredizonaUI && typeof window.CredizonaUI.getRetryCtaState === "function")
          ? window.CredizonaUI.getRetryCtaState(st.diag, st)
          : "locked";
        trackEvent(CZ_EVENT_NAMES.RETRY_CTA_CLICKED, { source: "miplan_tab" });
        if (typeof trackCRMEvent === "function") {
          trackCRMEvent(CZ_EVENT_NAMES.RETRY_CTA_CLICKED, {
            state: retryState,
            plan_id: st.diag ? st.diag.planId : null,
            snap_plan_id: st.snap ? st.snap.plan_id : null,
          });
        }
        window.location.href = retryUrl;
        return;
      }

      // Sprint 12 — agregar gasto personalizado
      if (e.target.id === "btn-agregar-gasto-custom") {
        if (!st.custom_expenses) st.custom_expenses = [];
        st.custom_expenses.push({
          description: "",
          amount: 0,
          classification_override: false,
        });
        window.guardarLocal();
        window.CredizonaUI.renderAll();
        return;
      }

      var customRemoveIdx = e.target.getAttribute("data-custom-expense-remove");
      if (customRemoveIdx !== null) {
        customRemoveIdx = parseInt(customRemoveIdx, 10);
        if (st.custom_expenses && st.custom_expenses[customRemoveIdx] !== undefined) {
          st.custom_expenses.splice(customRemoveIdx, 1);
          if (st._custom_expense_debt_excluded) {
            st._custom_expense_debt_excluded = {};
          }
          window.guardarLocal();
          window.CredizonaUI.renderAll();
        }
        return;
      }

      var classifyGastoEl = e.target.closest
        ? e.target.closest("[data-classify-expense-gasto]")
        : null;
      if (classifyGastoEl) {
        var idxG = parseInt(classifyGastoEl.getAttribute("data-custom-idx"), 10);
        if (st.custom_expenses && st.custom_expenses[idxG]) {
          st.custom_expenses[idxG].classification_override = true;
          if (st._custom_expense_debt_excluded) {
            delete st._custom_expense_debt_excluded[String(idxG)];
          }
          window.guardarLocal();
          if (window.CredizonaUI && typeof window.CredizonaUI.updateCustomExpenseClassificationUI === "function") {
            window.CredizonaUI.updateCustomExpenseClassificationUI(idxG);
          }
          if (window.CredizonaUI && typeof window.CredizonaUI.updateGastosTotalDisplay === "function") {
            window.CredizonaUI.updateGastosTotalDisplay();
          }
        }
        return;
      }

      var classifyDeudaEl = e.target.closest
        ? e.target.closest("[data-classify-expense-deuda]")
        : null;
      if (classifyDeudaEl) {
        var idxD = parseInt(classifyDeudaEl.getAttribute("data-custom-idx"), 10);
        if (st.custom_expenses && st.custom_expenses[idxD]) {
          if (!st._custom_expense_debt_excluded) st._custom_expense_debt_excluded = {};
          st._custom_expense_debt_excluded[String(idxD)] = true;
          st.custom_expenses[idxD].classification_override = false;
          window.guardarLocal();
          if (window.CredizonaUI && typeof window.CredizonaUI.updateCustomExpenseClassificationUI === "function") {
            window.CredizonaUI.updateCustomExpenseClassificationUI(idxD);
          }
          if (window.CredizonaUI && typeof window.CredizonaUI.updateGastosTotalDisplay === "function") {
            window.CredizonaUI.updateGastosTotalDisplay();
          }
        }
        return;
      }

      var irDeudasEl = e.target.closest
        ? e.target.closest("[data-ir-mis-deudas]")
        : null;
      if (irDeudasEl) {
        st.step = 1;
        window.CredizonaUI.renderAll();
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
        if (dSit && applySituacionUiChange(dSit, situacionVal)) {
          if (typeof enriquecerDeuda === "function") enriquecerDeuda(dSit);
          // CRM_ONLY — backend handles this
          trackCRMEvent(CZ_EVENT_NAMES.PAYMENT_BEHAVIOR_CLASSIFIED, {
            situacion_ui:             situacionVal,
            pago_fuente:              dSit.pago_fuente,
            debt_status:              dSit.estado,
            debt_confidence:          dSit.debt_confidence,
            tipo:                     dSit.tipo,
            monto:                    parseFloat(dSit.monto) || 0,
          });
          st.temporal.last_debt_update_at = new Date().toISOString();
          if (!isDebtDraftAdd(dSit)) {
            window.guardarLocal();
          }
          refreshDebtCardsUI();
          if (typeof window.CredizonaUI.actualizarMetrics === "function") {
            window.CredizonaUI.actualizarMetrics();
          }
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
            // CRM_ONLY — backend handles this
            trackCRMEvent(CZ_EVENT_NAMES.PAYMENT_BEHAVIOR_CLASSIFIED, {
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
          if (!isDebtDraftAdd(dBtn)) {
            window.guardarLocal();
          }
          refreshDebtCardsUI();
          if (typeof window.CredizonaUI.actualizarMetrics === "function") {
            window.CredizonaUI.actualizarMetrics();
          }
        }
        return;
      }

      // Sprint 12.2 Fix — guardar edición de deuda (no push; full field persist)
      if (e.target.id === "btn-guardar-deuda-edicion") {
        var saveIdx = st.editing_debt_index;
        if (saveIdx !== null && saveIdx !== undefined && st.deudas[saveIdx]) {
          finalizeDebtEdit(saveIdx);
        }
        return;
      }

      // Sprint 12.2 — cancelar edición (restaura snapshot o descarta alta nueva)
      if (e.target.id === "btn-cancelar-edicion-deuda") {
        var cancelEditIdx = st.editing_debt_index;
        if (st._deuda_is_new_add && cancelEditIdx !== null) {
          st.deudas.splice(cancelEditIdx, 1);
        } else if (cancelEditIdx !== null && st._deuda_edit_snapshot) {
          st.deudas[cancelEditIdx] = st._deuda_edit_snapshot;
        }
        st.editing_debt_index = null;
        st._deuda_edit_snapshot = null;
        st._deuda_delete_confirm_index = null;
        st._deuda_is_new_add = false;
        st._deuda_validation_error = null;
        window.guardarLocal();
        if (st.step === 3) {
          window.CredizonaUI.renderTab();
        } else {
          window.CredizonaUI.renderAll();
        }
        return;
      }

      // Sprint 14.8 — agregar deuda desde tab Tus deudas (dashboard)
      if (e.target.id === "btn-add-debt") {
        if (st.step !== 3 || st.editing_debt_index != null) return;
        st.deudas.push(createEmptyDebtObject());
        var newIdx = st.deudas.length - 1;
        st.editing_debt_index = newIdx;
        st._deuda_is_new_add = true;
        st._deuda_edit_snapshot = null;
        st._deuda_validation_error = null;
        st._deuda_delete_confirm_index = null;
        st._deuda_quick_edit_index = null;
        st._deuda_quick_edit_prev_monto = null;
        st.tab = "deudas";
        window.CredizonaUI.renderTab();
        scrollDeudaCardIntoView(newIdx);
        return;
      }

      // Agregar deuda (flujo inicial — step deudas)
      if (e.target.id === "btn-agregar-deuda") {
        if (st.editing_debt_index != null) return;
        st.deudas.push(createEmptyDebtObject());
        st.editing_debt_index = st.deudas.length - 1;
        st._deuda_is_new_add = true;
        st._deuda_edit_snapshot = null;
        st._deuda_validation_error = null;

        var cont = document.getElementById("deudas-container");
        if (cont) {
          cont.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
        }

        window.CredizonaUI.actualizarMetrics();
        return;
      }

      // Sprint 12.2 — solicitar eliminar deuda (confirmación inline)
      var eliminarIdx = e.target.getAttribute("data-deuda-eliminar");
      if (eliminarIdx !== null) {
        st._deuda_delete_confirm_index = parseInt(eliminarIdx, 10);
        if (st.step === 3) {
          window.CredizonaUI.renderTab();
        } else {
          window.CredizonaUI.renderAll();
        }
        return;
      }

      var deleteVolverIdx = e.target.getAttribute("data-deuda-delete-volver");
      if (deleteVolverIdx !== null) {
        st._deuda_delete_confirm_index = null;
        if (st.step === 3) {
          window.CredizonaUI.renderTab();
        } else {
          window.CredizonaUI.renderAll();
        }
        return;
      }

      var deleteConfirmIdx = e.target.getAttribute("data-deuda-delete-confirmar");
      if (deleteConfirmIdx !== null) {
        deleteConfirmIdx = parseInt(deleteConfirmIdx, 10);
        if (st.deudas[deleteConfirmIdx] !== undefined) {
          st.deudas.splice(deleteConfirmIdx, 1);
          if (st.editing_debt_index === deleteConfirmIdx) {
            st.editing_debt_index = null;
            st._deuda_edit_snapshot = null;
          } else if (st.editing_debt_index != null && st.editing_debt_index > deleteConfirmIdx) {
            st.editing_debt_index -= 1;
          }
          st._deuda_delete_confirm_index = null;
          st.temporal.last_debt_update_at = new Date().toISOString();
          trackCRMDebtEvent("debt_deleted", { debt_index: deleteConfirmIdx });
          recalcDiagYGuardar();
          if (st.step === 3) {
            window.CredizonaUI.renderTab();
          } else {
            var contDel = document.getElementById("deudas-container");
            if (contDel) {
              contDel.innerHTML = st.deudas.map(window.CredizonaUI.renderDeudaCard).join("");
            }
            window.CredizonaUI.actualizarMetrics();
          }
        }
        return;
      }

      // Sprint 12.4d — abrir quick edit de monto en tarjeta viva
      var quickTrigEl = e.target.closest
        ? e.target.closest("[data-deuda-quick-edit-trigger]")
        : null;
      if (quickTrigEl) {
        var quickIdx = parseInt(quickTrigEl.getAttribute("data-deuda-quick-edit-trigger"), 10);
        if (!isNaN(quickIdx) && st.deudas[quickIdx]) {
          st._deuda_quick_edit_index = quickIdx;
          st._deuda_quick_edit_prev_monto = st.deudas[quickIdx].monto;
          if (st.step === 3) {
            window.CredizonaUI.renderTab();
          } else {
            window.CredizonaUI.renderAll();
          }
        }
        return;
      }

      // Sprint 12.2 — editar deuda (modo edición por índice)
      var editarDeudaIdx = e.target.getAttribute("data-deuda-editar");
      if (editarDeudaIdx !== null) {
        editarDeudaIdx = parseInt(editarDeudaIdx, 10);
        if (st.deudas[editarDeudaIdx]) {
          st._deuda_quick_edit_index = null;
          st._deuda_quick_edit_prev_monto = null;
          st._deuda_edit_snapshot = JSON.parse(JSON.stringify(st.deudas[editarDeudaIdx]));
          st.editing_debt_index = editarDeudaIdx;
          st._deuda_is_new_add = false;
          st._deuda_validation_error = null;
          st._deuda_delete_confirm_index = null;
          if (st.step === 3) {
            st.tab = "deudas";
            window.CredizonaUI.renderAll();
          } else {
            window.CredizonaUI.renderAll();
          }
          scrollDeudaCardIntoView(editarDeudaIdx);
        }
        return;
      }

      // Sprint 14.0 — Mi Plan Plus tab CTA
      if (e.target.id === "btn-plus-obtener-informe") {
        onPlusCtaClick();
        return;
      }

      // Sprint 14.2 — local Claude test report (browser key + test input; not production)
      if (e.target.id === "btn-plus-test-generar") {
        var paymentLive = typeof CZ_PLUS_PAYMENT_LIVE !== "undefined" && !!CZ_PLUS_PAYMENT_LIVE;
        var proxyEnabled = typeof CZ_PLUS_PROXY_ENABLED !== "undefined" && !!CZ_PLUS_PROXY_ENABLED;
        var allowBrowser = typeof CZ_CLAUDE_ALLOW_BROWSER_KEY !== "undefined" && !!CZ_CLAUDE_ALLOW_BROWSER_KEY;
        var hasKey = typeof CZ_CLAUDE_API_KEY !== "undefined" && String(CZ_CLAUDE_API_KEY).trim() !== "";
        if (paymentLive || (!proxyEnabled && (!allowBrowser || !hasKey))) return;

        st._plusInformeTestError = false;
        if (typeof setPlusStatus === "function") {
          setPlusStatus("PLUS_PROCESSING");
        }
        if (window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
          window.CredizonaUI.renderTab();
        }
        if (typeof generarInformePlus === "function") {
          generarInformePlus({ useTestInput: true });
        }
        return;
      }
      if (e.target.id === "btn-plus-reintentar") {
        resetPlusPurchaseError();
        return;
      }

      if (e.target.id === "btn-plus-descargar-pdf") {
        onPlusPdfDownload();
        return;
      }

      if (e.target.id === "btn-plus-enviar-email") {
        onPlusEmailRequest();
        return;
      }

      if (e.target.id === "btn-plus-email-cambiar") {
        st._plus_email_edit_mode = true;
        if (window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
          window.CredizonaUI.renderTab();
        }
        return;
      }

      var plusFbScore = e.target.getAttribute("data-plus-fb-score");
      if (plusFbScore !== null) {
        st.plus_feedback_score = parseInt(plusFbScore, 10);
        window.guardarLocal();
        if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
          window.CredizonaUI.renderTab();
        }
        return;
      }

      var plusFbClarity = e.target.getAttribute("data-plus-fb-clarity");
      if (plusFbClarity !== null) {
        st.plus_feedback_clarity = plusFbClarity;
        window.guardarLocal();
        if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
          window.CredizonaUI.renderTab();
        }
        return;
      }

      var plusFbValue = e.target.getAttribute("data-plus-fb-value");
      if (plusFbValue !== null) {
        st.plus_feedback_value = plusFbValue;
        window.guardarLocal();
        if (st.tab === "plus" && window.CredizonaUI && typeof window.CredizonaUI.renderTab === "function") {
          window.CredizonaUI.renderTab();
        }
        return;
      }

      if (e.target.id === "btn-plus-feedback-submit") {
        onPlusFeedbackSubmit();
        return;
      }

      // Botones Reset Plus (modal legacy — plan / IA)
      if (
        e.target.id === "btn-conocer-plus" ||
        e.target.id === "btn-conocer-plus-ia"
      ) {
        switchTab("plus");
        return;
      }
      if (e.target.id === "btn-conocer-plus-tab") {
        switchTab("plus");
        return;
      }

      // Sprint 12.2 — marcar deuda como pagada (antes "Cancelar")
      var pagadaIdx = e.target.getAttribute("data-deuda-pagada")
        || e.target.getAttribute("data-cancelar-deuda");
      if (pagadaIdx !== null) {
        pagadaIdx = parseInt(pagadaIdx, 10);

        if (st.deudas[pagadaIdx]) {
          var dPag = st.deudas[pagadaIdx];
          var montoPrev = parseFloat(dPag.monto) || 0;
          if (dPag.monto_original == null && montoPrev > 0) {
            dPag.monto_original = montoPrev;
          }
          dPag.situacion_ui = "pagada";
          dPag.pago         = 0;
          dPag.pago_fuente  = "pagada";
          dPag.cancelada    = true;
          dPag.estado       = "al_dia";
          if (typeof enriquecerDeuda === "function") enriquecerDeuda(dPag);

          st.editing_debt_index = null;
          st._deuda_edit_snapshot = null;
          st._deuda_delete_confirm_index = null;
          st._deuda_quick_edit_index = null;
          st._deuda_quick_edit_prev_monto = null;
          st.temporal.last_debt_update_at = new Date().toISOString();
          trackCRMDebtEvent("debt_marked_paid", { debt_index: pagadaIdx });
          if (typeof trackEvent === "function") {
            trackEvent(CZ_EVENT_NAMES.DEBT_MARKED_PAID, {
              source: st.step === 3 ? "dashboard" : "funnel",
              action: "mark_paid",
            });
          }
          recalcDiagYGuardar();

          _safeCelebration({
            emoji: "🎯",
            title: "¡Deuda cancelada!",
            subtitle: "Cada deuda que cerrás es un peso menos sobre tus hombros.",
          });

          if (st.step === 3) {
            window.CredizonaUI.renderTab();
          } else {
            window.CredizonaUI.renderAll();
          }
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

        // CRM_ONLY — backend handles this
        trackCRMEvent(CZ_EVENT_NAMES.GASTO_CLASIFICADO, { categoria: clsGasto, tipo: clsTipo });
        window.guardarLocal();
        window.CredizonaUI.renderTab();
        return;
      }

      // Sprint 13.2 — expandir/colapsar historial de deudas pagadas
      var histToggle = e.target.closest("[data-deudas-historial-toggle]");
      if (histToggle) {
        if (window.CredizonaUI && typeof window.CredizonaUI.toggleDeudasHistorial === "function") {
          window.CredizonaUI.toggleDeudasHistorial();
        }
        return;
      }

      // Sprint 13.1 — expandir acciones recomendadas sin re-render completo
      var verMasAcc = e.target.closest("[data-acciones-ver-mas]");
      if (verMasAcc) {
        if (window.CredizonaUI && typeof window.CredizonaUI.expandAccionesRecomendadas === "function") {
          window.CredizonaUI.expandAccionesRecomendadas();
        }
        var extrasAcc = document.querySelectorAll(".accion-recom-extra");
        for (var ex = 0; ex < extrasAcc.length; ex++) {
          extrasAcc[ex].classList.remove("accion-recom-extra");
        }
        var btnMas = document.getElementById("btn-ver-mas-acciones");
        if (btnMas) btnMas.remove();
        return;
      }

      // Toggle compromiso / acción recomendada (Sprint 13 / 13.1)
      var compId = e.target.closest("[data-toggle-compromiso]");
      if (compId) {
        var idComp = compId.getAttribute("data-toggle-compromiso");

        if (!st.herr.compromisos) st.herr.compromisos = {};
        var wasChecked = !!st.herr.compromisos[idComp];
        st.herr.compromisos[idComp] = !wasChecked;

        if (st.herr.compromisos[idComp] && typeof trackCRMEvent === "function") {
          trackCRMEvent(CZ_EVENT_NAMES.ACCION_COMPROMETIDA, {
            czuid: (window.CZIdentity && (window.CZIdentity.crm_contact_id || window.CZIdentity.anonymous_id)) || null,
            planId: st.diag ? st.diag.planId : null,
            action_id: idComp,
            action_tipo: compId.getAttribute("data-accion-tipo") || null,
            action_urgencia: compId.getAttribute("data-accion-urgencia") || null,
          });
        }

        var checkEl = compId.querySelector(".compromiso-check");
        if (checkEl) {
          if (st.herr.compromisos[idComp]) {
            checkEl.classList.add("checked");
            checkEl.innerHTML = "&#10003;";
          } else {
            checkEl.classList.remove("checked");
            checkEl.innerHTML = "";
          }
        }

        window.guardarLocal();
        return;
      }

      // Semáforo
      var semId  = e.target.getAttribute("data-sem-id");
      var semVal = e.target.getAttribute("data-sem-val");

      if (semId && semVal !== null) {
        if (!st.herr.semaforo) st.herr.semaforo = {};
        st.herr.semaforo[semId] = semVal === "true";

        // CRM_ONLY — backend handles this
        trackCRMEvent(CZ_EVENT_NAMES.SEMAFORO_ACTUALIZADO, { pregunta: semId, respuesta: st.herr.semaforo[semId] });
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

        // CRM_ONLY — backend handles this
        trackCRMEvent(CZ_EVENT_NAMES.HABITO_MARCADO, { fecha: fecha, cumplido: st.herr.habitos[fecha] });
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
function showToast(msg, ms) {
  var existing = document.getElementById("cz-toast");
  if (existing) existing.remove();

  var el = document.createElement("div");
  el.id = "cz-toast";
  el.style.cssText = [
    "position:fixed",
    "top:calc(env(safe-area-inset-top, 0px) + 72px)",
    "bottom:auto",
    "left:50%",
    "transform:translateX(-50%)",
    "background:rgba(15,23,56,.97)",
    "border:1px solid rgba(255,211,111,.3)",
    "color:#ffd36f",
    "padding:14px 18px",
    "border-radius:14px",
    "font-size:15px",
    "font-weight:700",
    "z-index:9999",
    "text-align:center",
    "max-width:90vw",
    "width:auto",
    "min-width:0",
    "box-sizing:border-box",
    "white-space:normal",
    "overflow-wrap:anywhere",
    "word-break:break-word",
    "line-height:1.45",
    "box-shadow:0 8px 24px rgba(0,0,0,.4)",
    "animation:fadeUp .2s ease both",
    "pointer-events:none",
  ].join(";");
  el.innerHTML = msg;
  document.body.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, ms || 3000);
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

  // CRM_ONLY — backend handles this
  trackCRMEvent(CZ_EVENT_NAMES.INGRESO_REAL_DECLARADO, {
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

  var totalGastos = typeof getTotalMonthlyExpenses === "function"
    ? getTotalMonthlyExpenses()
    : Object.values(gastos).reduce(function(s, v) {
        return s + (parseFloat(v) || 0);
      }, 0);

  var customArr = st.custom_expenses || [];
  var customTotal = typeof getCustomExpensesIncludedTotal === "function"
    ? getCustomExpensesIncludedTotal()
    : 0;
  var customOverrideCount = customArr.filter(function(e) {
    return !!e.classification_override;
  }).length;

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
    dti_ratio:                     (motor && motor.fin) ? motor.fin.dti_ratio             : null,
    dti_level:                     (motor && motor.fin) ? motor.fin.dti_level             : null,
    confianza_diagnostico:         (motor && motor.fin) ? motor.fin.confianza_diagnostico : null,
    custom_expenses_count:         customArr.length,
    custom_expenses_total:         customTotal,
    custom_expenses_with_override: customOverrideCount,
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
    plan_id:                       motor ? motor.planId              : null,
    assigned_plan_raw:             motor ? motor.assigned_plan_raw   : null,
    assigned_plan_final:           motor ? motor.assigned_plan_final : null,
    plan_guardrail_applied:        motor ? motor.plan_guardrail_applied : null,
    plan_guardrail_reason:         motor ? motor.plan_guardrail_reason  : null,
    nivelR:                        motor ? motor.nivelR              : null,
    // Sprint 12.2 Fix — debt edit debug
    editing_debt_index:            st.editing_debt_index,
    debt_count:                    deudas.length,
    last_edited_debt_summary:      (function() {
      var idx = st.editing_debt_index;
      if (idx == null || !deudas[idx]) return null;
      var dd = deudas[idx];
      return {
        index:           idx,
        tipo:            dd.tipo,
        situacion_ui:    dd.situacion_ui,
        monto:           parseFloat(dd.monto) || 0,
        pago:            parseFloat(dd.pago) || 0,
        pago_fuente:     dd.pago_fuente,
        atraso_tiempo:   dd.atraso_tiempo,
        debt_confidence: dd.debt_confidence,
      };
    })(),
    // Sprint 8.1 + 8.4 + 8.5 — horizon + copy override fields
    flujo_libre_activo: (function() {
      var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
      return rad.flujoLibreActivo != null ? rad.flujoLibreActivo : null;
    })(),
    is_critical_rendered_state: (function() {
      var sl = sev.severity_level || (iv2 && iv2.severity_level);
      // Sprint 8.4: recompute if stale
      if (sl == null && typeof calcularSeveridadFinanciera === "function") {
        var _f = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
        sl = calcularSeveridadFinanciera(_f, deudas, ingreso).severity_level;
      }
      return !!(
        (motor && motor.planId === 4)
        || (motor && motor.nivelR === "C")
        || sl === "critico"
        || (iv2 && iv2.severity_level === "critico")
      );
    })(),
    horizonte_original:            motor && motor.horizonte ? motor.horizonte.label : null,
    horizonte_renderizado:         (function() {
      var sl = sev.severity_level || (iv2 && iv2.severity_level);
      if (sl == null && typeof calcularSeveridadFinanciera === "function") {
        var _f = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
        sl = calcularSeveridadFinanciera(_f, deudas, ingreso).severity_level;
      }
      var isCrit = !!(
        (motor && motor.planId === 4)
        || (motor && motor.nivelR === "C")
        || sl === "critico"
        || (iv2 && iv2.severity_level === "critico")
      );
      if (isCrit) return "No estimable sin estabilización previa";
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
      if (sl == null && typeof calcularSeveridadFinanciera === "function") {
        var _f = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
        sl = calcularSeveridadFinanciera(_f, deudas, ingreso).severity_level;
      }
      if ((motor && motor.planId === 4) || (motor && motor.nivelR === "C") || sl === "critico" || (iv2 && iv2.severity_level === "critico")) return true;
      var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
      var fla = rad.flujoLibreActivo != null ? rad.flujoLibreActivo : null;
      var blockerTipos = (motor && motor.bloqueadores || []).map(function(b) { return b.tipo; });
      return (fla !== null && fla < 0)
        || blockerTipos.indexOf("flujo_insuficiente") !== -1
        || blockerTipos.indexOf("flujo_mensual_negativo") !== -1
        || (iv2 && iv2.causa_principal === "flujo_negativo");
    })(),
    negative_cashflow_horizon_guardrail_applied: (function() {
      // Only true when critical state did NOT already take priority
      var sl = sev.severity_level || (iv2 && iv2.severity_level);
      if (sl == null && typeof calcularSeveridadFinanciera === "function") {
        var _f = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
        sl = calcularSeveridadFinanciera(_f, deudas, ingreso).severity_level;
      }
      if ((motor && motor.planId === 4) || (motor && motor.nivelR === "C") || sl === "critico" || (iv2 && iv2.severity_level === "critico")) return false;
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
      if (sl == null && typeof calcularSeveridadFinanciera === "function") {
        var _f = typeof calcularFinanciero === "function" ? calcularFinanciero() : {};
        sl = calcularSeveridadFinanciera(_f, deudas, ingreso).severity_level;
      }
      if ((motor && motor.planId === 4) || (motor && motor.nivelR === "C") || sl === "critico" || (iv2 && iv2.severity_level === "critico")) return "critical_rendered_state";
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
    // Sprint 8.7 — diagnosis mode clarity
    diagnosis_mode: {
      initial_plan_locked:       true,
      live_financial_simulation: true,
    },
    // Sprint 9 — incomplete data flags
    gastos_missing_confirmed:   !!(window.CZState && window.CZState.gastos_missing_confirmed),
    hidden_factor_cta_shown:    !!(window.CZState && window.CZState._hfCtaShown),
    hidden_factor_opportunity:  (typeof detectHiddenFactorOpportunity === "function" && diag) ? detectHiddenFactorOpportunity(diag) : false,
    // Sprint 10 — Mi Plan in-app consent
    miplan_consent: (window.CZState && window.CZState.consent) || null,
    miplan_consent_required: (typeof shouldShowMiPlanConsent === "function") ? shouldShowMiPlanConsent() : "fn_unavailable",
    // Sprint 10.1 — feedback suggestions (counts only — no free text in debug)
    feedback_suggestions_count: (window.CZState && window.CZState.feedback_suggestions)
      ? window.CZState.feedback_suggestions.length : 0,
    feedback_categories_summary: buildFeedbackCategoriesSummary(),
  };
};
