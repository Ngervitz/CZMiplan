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
  "plus_purchased",
  "plus_report_ready",
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
  "funnel_stage",
  "plan_id",
  "czuid",
  "payment_live",
  "has_gastos",
  "entry_channel",
  "consent_source",
  "source",
  "cta_source",
  "currency",
];

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
  PLUS_PURCHASED:                  "plus_purchased",
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

  // transactional value only
  if (
    (eventName === "checkout_started" ||
     eventName === "payment_completed") &&
    isGTMPrimitive(payload.value)
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

      var gtmPayload =
        safeGTMPayload(eventName, enriched);

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
