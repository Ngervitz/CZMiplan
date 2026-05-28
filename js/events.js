// =============================================================================
// events.js — Identity layer, event names, centralized tracking
// Depende de: config.js (generateUUID must be defined before this file loads)
// Loaded before: ui.js, app.js
//
// Channel architecture (Sprint 11):
//   GTM      — allowlisted fields only, dataLayer.push()
//   INTERNAL — enriched console log in czdev mode only
//   CRM_ONLY — must never use trackEvent for dispatch; warn if misrouted
// =============================================================================

// Defensive init — no-op if GTM already initialized dataLayer on host page
window.dataLayer = window.dataLayer || [];

// =============================================================================
// IDENTITY LAYER
// anonymous_id — stable identifier across sessions
//   Rule: czuid (if in URL) takes precedence over stored UUID
//   Rule: generated UUID is persisted as cz_anonymous_id in localStorage
//   Rule: never overwrite a valid anonymous_id with null
// session_id — per page lifecycle only, not persisted
// =============================================================================
var CZIdentity = (function() {
  var czuid = new URLSearchParams(window.location.search).get("czuid") || null;

  var anonId = null;
  if (czuid) {
    anonId = czuid;
    try { localStorage.setItem("cz_anonymous_id", czuid); } catch (e) {}
  } else {
    try { anonId = localStorage.getItem("cz_anonymous_id"); } catch (e) {}
    if (!anonId) {
      anonId = generateUUID();
      try { localStorage.setItem("cz_anonymous_id", anonId); } catch (e) {}
    }
  }

  return {
    anonymous_id: anonId,
    session_id:   generateUUID(),
    czuid:        czuid,
  };
})();

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
});

// =============================================================================
// safeGTMPayload — allowlist-only GTM object (primitives via field pick)
// =============================================================================
function safeGTMPayload(eventName, payload) {
  var safe = {
    event: eventName,
  };

  CZ_GTM_SAFE_FIELDS.forEach(function(field) {
    if (payload[field] !== undefined) {
      safe[field] = payload[field];
    }
  });

  // transactional value only
  if (
    (eventName === "checkout_started" ||
     eventName === "payment_completed") &&
    typeof payload.value !== "undefined"
  ) {
    safe.value = payload.value;
  }

  return safe;
}

// =============================================================================
// CENTRALIZED TRACK FUNCTION — neutral internal event layer
// =============================================================================
function trackEvent(eventName, payload) {

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

  var CZ_DEBUG = (
    typeof window !== "undefined" &&
    window.location &&
    window.location.search.indexOf("czdev=true") !== -1
  );

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

  // CRM_ONLY should never route through GTM
  if (
    CZ_CRM_ONLY_EVENTS.indexOf(eventName) !== -1
  ) {

    console.warn(
      "[CZ] CRITICAL SECURITY WARNING: CRM_ONLY event fired through trackEvent():",
      eventName
    );
  }

  return enriched;
}

// Backward-compatible alias — routes through trackEvent()
function track(evento, datos) {
  trackEvent(evento, datos);
}

// =============================================================================
// DEBUG — analytics channel inspection (?czdev=true)
// =============================================================================
window.CZDebugAnalytics = function() {
  return {
    gtm_events:        CZ_GTM_EVENTS,
    internal_events:   CZ_INTERNAL_EVENTS,
    crm_only_events:   CZ_CRM_ONLY_EVENTS,
    gtm_safe_fields:   CZ_GTM_SAFE_FIELDS,
    dataLayer:         window.dataLayer || [],
  };
};
