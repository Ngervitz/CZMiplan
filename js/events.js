// =============================================================================
// events.js — Event names, GTM-safe public analytics routing
// Depende de: config.js, identity.js (must load before this file)
// Loaded before: analytics.js, ui.js, app.js
//
// Channel architecture (Sprint 11 / 11.5):
//   GTM      — allowlisted fields only, dataLayer.push() via trackEvent()
//   INTERNAL — enriched console log in czdev mode only via trackEvent()
//   CRM_ONLY — trackCRMEvent() in analytics.js ONLY (hard bypass in trackEvent)
// =============================================================================

// Defensive init — no-op if GTM already initialized dataLayer on host page
window.dataLayer = window.dataLayer || [];

// =============================================================================
// EVENT CHANNEL REGISTRY
// =============================================================================
var CZ_GTM_EVENTS = [
  "survey_started",
  "debt_refinement_started",
  "debt_refinement_completed",
  "expense_refinement_completed",
  "dashboard_generated",
  "premium_opened",
  "checkout_started",
  "miplan_consent_screen_viewed",
  "miplan_consent_accepted",
  "hidden_factor_cta_shown",
  "hidden_factor_cta_clicked",
  "gastos_missing_warning_shown",
  "gastos_missing_confirmed",
  "miplan_suggestion_submitted",
  "dashboard_toast_shown",
  "plus_cta_viewed",
  "plus_cta_clicked",
  "miplan_session_started",
  "debt_marked_paid",
  "plus_error",
  "plus_purchased",
  "retry_cta_clicked",
  "miplan_virgin_landing_view",
  "miplan_virgin_start",
  "miplan_virgin_survey_completed",
  "mideuda_cta_shown",
  "mideuda_optin_checked",
  "mideuda_cta_clicked",
  "mideuda_interest_registered",
  "mideuda_redirect_started",
  "mideuda_redirect_completed",
  "mideuda_error",
];

var CZ_INTERNAL_EVENTS = [
  "recovery_state_changed",
  "legal_restored_session",
  "crm_hydration_attempted",
  "crm_hydration_applied",
  "crm_hydration_fallback_to_local",
  "reset_started",
  "click_continue_analysis",
  "view_initial_diagnosis",
  "expense_accordion_opened",
  "input_validation_failed",
  "step_skipped",
  "diagnosis_generated",
  "payment_completed",
  "survey_completed",
  "simulation_used",
  "expense_refinement_started",
];

var CZ_CRM_ONLY_EVENTS = [
  "reset_plan_generated",
  "cz_mp_payment_behavior_classified",
  "deuda_gestion",
  "atraso_actualizado",
  "ingreso_real_declarado",
  "gasto_clasificado",
  "compromisos_actualizados",
  "semaforo_actualizado",
  "habito_marcado",
  "acciones_mostradas",
  "accion_comprometida",
  "plus_report_ready",
  "plus_pdf_downloaded",
  "plus_report_email_requested",
  "plus_feedback_submitted",
  "retry_cta_shown",
  "miplan_virgin_survey_completed",
  "no_debts_declared",
];

// =============================================================================
// GTM PAYLOAD ALLOWLIST — build from this list only (never denylist-delete)
// =============================================================================
var CZ_GTM_SAFE_FIELDS = [
  "event",
  "event_version",
  "timestamp",
  "session_id",
  "anonymous_id",
  "step",
  "payment_live",
  "has_gastos",
  "entry_channel",
  "consent_source",
  "source",
  "intent",
  "question",
  "cta_source",
  "currency",
  "has_consent_params",
  "action",
  "error_source",
  "plus_status",
  "state",
  "tool",
  "plan_id",
  "recommended_tools",
  "mideuda_lead_status",
  "mora_activa",
  "deuda_vencida",
  "flag_demasiadas_deudas",
  "flag_deuda_cara",
  "deuda_fuera_sistema",
  "flag_deuda_sin_pagos",
];

// Sprint 11.8 — neutral GTM acquisition buckets (no CRM cohort signals)
function gtmEntryChannel(raw) {
  var ch = raw;
  if (ch == null && typeof detectEntryChannel === "function") {
    ch = detectEntryChannel();
  }
  if (ch === "crm_link") return "partner";
  if (ch === "email" || ch === "whatsapp") return "paid";
  if (ch === "direct") return "direct";
  return "organic";
}

function gtmSource(raw) {
  if (!raw) return "system";
  if (raw === "crm_reactivation" || raw === "crm_link") return "system";
  if (raw === "miplan_tab") return "miplan_tab";
  if (
    raw === "dashboard"
    || raw === "dashboard_first_view"
    || raw === "funnel"
    || raw === "deudas_tab"
  ) {
    return "dashboard";
  }
  if (raw === "plus_tab" || raw === "hidden_factor") return "premium";
  if (
    raw === "bridge_screen"
    || raw === "diagnosis_screen"
    || raw === "diag_inicial"
    || raw === "miplan_tab"
  ) {
    return "onboarding";
  }
  return "system";
}

// =============================================================================
// STANDARDIZED EVENT NAMES
// All events fired by the application should reference these constants.
// =============================================================================
var CZ_EVENT_NAMES = Object.freeze({
  // Survey funnel
  SURVEY_STARTED:                  "survey_started",
  // TODO: wire this event or remove in cleanup sprint
  SURVEY_COMPLETED:                "survey_completed",

  // Diagnosis funnel
  // TODO: wire this event or remove in cleanup sprint
  DIAGNOSIS_GENERATED:             "diagnosis_generated",
  DEBT_REFINEMENT_STARTED:         "debt_refinement_started",
  DEBT_ADDED:                      "debt_added",
  DEBT_REFINEMENT_COMPLETED:       "debt_refinement_completed",
  DEBT_MARKED_PAID:                "debt_marked_paid",
  // TODO: wire this event or remove in cleanup sprint
  EXPENSE_REFINEMENT_STARTED:      "expense_refinement_started",
  EXPENSE_REFINEMENT_COMPLETED:    "expense_refinement_completed",
  DASHBOARD_GENERATED:             "dashboard_generated",

  // Simulation
  // TODO: wire this event or remove in cleanup sprint
  SIMULATION_USED:                 "simulation_used",

  // Premium funnel
  PREMIUM_OPENED:                  "premium_opened",
  CHECKOUT_STARTED:                "checkout_started",
  // TODO: wire this event or remove in cleanup sprint
  PAYMENT_COMPLETED:               "payment_completed",

  // CRM hydration
  CRM_HYDRATION_ATTEMPTED:         "crm_hydration_attempted",
  CRM_HYDRATION_APPLIED:           "crm_hydration_applied",
  CRM_HYDRATION_FALLBACK_TO_LOCAL: "crm_hydration_fallback_to_local",

  // UX instrumentation
  // TODO: wire this event or remove in cleanup sprint
  STEP_SKIPPED:                    "step_skipped",
  EXPENSE_ACCORDION_OPENED:        "expense_accordion_opened",
  INPUT_VALIDATION_FAILED:         "input_validation_failed",

  // State machine
  RECOVERY_STATE_CHANGED:          "recovery_state_changed",

  // Sprint 10 / 10.1 — Mi Plan consent + feedback (GTM channel)
  CLICK_CONTINUE_ANALYSIS:         "click_continue_analysis",
  RESET_STARTED:                   "reset_started",
  MIPLAN_CONSENT_ACCEPTED:         "miplan_consent_accepted",
  MIPLAN_CONSENT_SCREEN_VIEWED:    "miplan_consent_screen_viewed",
  MIPLAN_SUGGESTION_SUBMITTED:     "miplan_suggestion_submitted",
  MIPLAN_SESSION_STARTED:          "miplan_session_started",
  MIPLAN_VIRGIN_LANDING_VIEW:      "miplan_virgin_landing_view",
  MIPLAN_VIRGIN_START:             "miplan_virgin_start",
  MIPLAN_VIRGIN_SURVEY_COMPLETED:  "miplan_virgin_survey_completed",

  // Partner tools — MiDeuda (GTM-safe payloads only)
  MIDEUDA_CTA_SHOWN:               "mideuda_cta_shown",
  MIDEUDA_OPTIN_CHECKED:           "mideuda_optin_checked",
  MIDEUDA_CTA_CLICKED:             "mideuda_cta_clicked",
  MIDEUDA_INTEREST_REGISTERED:     "mideuda_interest_registered",
  MIDEUDA_REDIRECT_STARTED:        "mideuda_redirect_started",
  MIDEUDA_REDIRECT_COMPLETED:      "mideuda_redirect_completed",
  MIDEUDA_ERROR:                   "mideuda_error",
  GASTOS_MISSING_WARNING_SHOWN:    "gastos_missing_warning_shown",
  GASTOS_MISSING_CONFIRMED:        "gastos_missing_confirmed",
  HIDDEN_FACTOR_CTA_SHOWN:         "hidden_factor_cta_shown",
  HIDDEN_FACTOR_CTA_CLICKED:       "hidden_factor_cta_clicked",
  DASHBOARD_TOAST_SHOWN:           "dashboard_toast_shown",

  // Internal UX
  VIEW_INITIAL_DIAGNOSIS:          "view_initial_diagnosis",
  CLICK_RESET_PLUS:                  "click_reset_plus",

  // Sprint 14.0 — Mi Plan Plus (GTM)
  PLUS_CTA_VIEWED:                   "plus_cta_viewed",
  PLUS_CTA_CLICKED:                  "plus_cta_clicked",
  PLUS_ERROR:                        "plus_error",
  PLUS_PURCHASED:                    "plus_purchased",

  // Mi Plan — retry application CTA (GTM: state only)
  RETRY_CTA_SHOWN:                   "retry_cta_shown",
  RETRY_CTA_CLICKED:                 "retry_cta_clicked",

  // CRM_ONLY — backend handles this; never route to GTM/dataLayer
  RESET_PLAN_GENERATED:              "reset_plan_generated",
  PAYMENT_BEHAVIOR_CLASSIFIED:     "cz_mp_payment_behavior_classified",
  DEUDA_GESTION:                   "deuda_gestion",
  ATRASO_ACTUALIZADO:              "atraso_actualizado",
  INGRESO_REAL_DECLARADO:          "ingreso_real_declarado",
  GASTO_CLASIFICADO:               "gasto_clasificado",
  COMPROMISOS_ACTUALIZADOS:        "compromisos_actualizados",
  SEMAFORO_ACTUALIZADO:            "semaforo_actualizado",
  HABITO_MARCADO:                  "habito_marcado",
  ACCIONES_MOSTRADAS:              "acciones_mostradas",
  ACCION_COMPROMETIDA:             "accion_comprometida",
  PLUS_REPORT_READY:               "plus_report_ready",
});

// =============================================================================
// safeGTMPayload — allowlist-only GTM object (primitives via field pick)
// =============================================================================
function safeGTMPayload(eventName, payload) {
  var safe = {
    event: eventName,
  };

  function isGTMPrimitive(v) {
    if (v === null) return true;
    var t = typeof v;
    return t === "string" || t === "number" || t === "boolean";
  }

  CZ_GTM_SAFE_FIELDS.forEach(function(field) {
    var val = payload[field];
    if (val !== undefined && isGTMPrimitive(val)) {
      safe[field] = val;
    }
  });

  // Privacy exception:
  // `value` is allowed only for `plus_purchased` real transaction events.
  // Do not use `value` for diagnosis, score, debt, income, loan amount, or financial profiling.
  if (
    (eventName === "plus_purchased"
      || (typeof CZ_EVENT_NAMES !== "undefined"
        && CZ_EVENT_NAMES.PLUS_PURCHASED === eventName))
    && typeof payload.value === "number"
    && isFinite(payload.value)
    && payload.value > 0
  ) {
    safe.value = payload.value;
  }

  return safe;
}

// =============================================================================
// CENTRALIZED TRACK FUNCTION — neutral internal event layer
// =============================================================================
function trackEvent(eventName, payload) {

  var CZ_DEBUG = (
    typeof window !== "undefined" &&
    window.location &&
    window.location.search.indexOf("czdev=true") !== -1
  );

  // Sprint 11.5 — CRM_ONLY hard bypass: never enter analytics pipeline
  if (CZ_CRM_ONLY_EVENTS.indexOf(eventName) !== -1) {
    if (CZ_DEBUG) {
      console.warn(
        "[CZ] CRM_ONLY event must use trackCRMEvent(), not trackEvent():",
        eventName
      );
    }
    return null;
  }

  payload = payload || {};

  var enriched = Object.assign({}, payload, {
    event: eventName,
    event_version: "v1",
    timestamp: new Date().toISOString(),

    anonymous_id:
      ((window.CZIdentity || {}).anonymous_id || null),

    session_id:
      ((window.CZIdentity || {}).session_id || null),

    user_recovery_state:
      ((window.CZState || {}).user_recovery_state || null),

    step:
      ((window.CZState || {}).step != null ? window.CZState.step : null),
  });

  if (CZ_DEBUG) {
    console.log("[CZ]", eventName, enriched);
  }

  // GTM SAFE EVENTS
  if (CZ_GTM_EVENTS.indexOf(eventName) !== -1) {

    try {

      var gtmEnriched = Object.assign({}, enriched);
      if (gtmEnriched.entry_channel !== undefined) {
        gtmEnriched.entry_channel = gtmEntryChannel(gtmEnriched.entry_channel);
      }
      if (gtmEnriched.source !== undefined) {
        gtmEnriched.source = gtmSource(gtmEnriched.source);
      }

      var gtmPayload =
        safeGTMPayload(eventName, gtmEnriched);

      window.dataLayer =
        window.dataLayer || [];

      window.dataLayer.push(gtmPayload);

    } catch (e) {

      console.warn(
        "[CZ] dataLayer push failed:",
        e
      );
    }
  }

  return enriched;
}

// Backward-compatible alias — routes through trackEvent()
function track(evento, datos) {
  trackEvent(evento, datos);
}

// CZDebugAnalytics() — defined in analytics.js (loads after this file)
