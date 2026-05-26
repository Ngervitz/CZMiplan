// =============================================================================
// events.js — Identity layer, event names, centralized tracking
// Depende de: config.js (generateUUID must be defined before this file loads)
// Loaded before: ui.js, app.js
// =============================================================================

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
    // czuid is the authoritative identity when present
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
    session_id:   generateUUID(),   // fresh per page load, never persisted
    czuid:        czuid,
  };
})();

// =============================================================================
// STANDARDIZED EVENT NAMES
// All events fired by the application should reference these constants.
// Scattered track("string") calls are a known source of naming drift.
// =============================================================================
var CZ_EVENT_NAMES = Object.freeze({
  // Survey funnel
  SURVEY_STARTED:                  "survey_started",
  SURVEY_COMPLETED:                "survey_completed",

  // Diagnosis funnel
  DIAGNOSIS_GENERATED:             "diagnosis_generated",
  DEBT_REFINEMENT_STARTED:         "debt_refinement_started",
  DEBT_ADDED:                      "debt_added",
  DEBT_REFINEMENT_COMPLETED:       "debt_refinement_completed",
  EXPENSE_REFINEMENT_STARTED:      "expense_refinement_started",
  EXPENSE_REFINEMENT_COMPLETED:    "expense_refinement_completed",
  DASHBOARD_GENERATED:             "dashboard_generated",

  // Simulation
  SIMULATION_USED:                 "simulation_used",

  // Premium funnel
  PREMIUM_OPENED:                  "premium_opened",
  CHECKOUT_STARTED:                "checkout_started",
  PAYMENT_COMPLETED:               "payment_completed",

  // CRM hydration
  CRM_HYDRATION_ATTEMPTED:         "crm_hydration_attempted",
  CRM_HYDRATION_APPLIED:           "crm_hydration_applied",
  CRM_HYDRATION_FALLBACK_TO_LOCAL: "crm_hydration_fallback_to_local",

  // UX instrumentation
  STEP_SKIPPED:                    "step_skipped",
  EXPENSE_ACCORDION_OPENED:        "expense_accordion_opened",
  INPUT_VALIDATION_FAILED:         "input_validation_failed",

  // State machine
  RECOVERY_STATE_CHANGED:          "recovery_state_changed",
});

// =============================================================================
// CENTRALIZED TRACK FUNCTION
// Auto-enriches every event payload with:
//   - identity (anonymous_id, session_id, czuid)
//   - current user_recovery_state
//   - current UI step
//   - timestamp
// No Meta/GA4 integration yet — internal standardization only.
// TODO IT: connect to analytics/CRM real
// =============================================================================
function trackEvent(eventName, payload) {
  payload = payload || {};
  var st  = window.CZState || {};

  var enriched = Object.assign({}, payload, {
    event:               eventName,
    timestamp:           new Date().toISOString(),
    anonymous_id:        CZIdentity.anonymous_id  || null,
    session_id:          CZIdentity.session_id    || null,
    czuid:               CZIdentity.czuid          || null,
    user_recovery_state: st.user_recovery_state   || null,
    step:                st.step != null ? st.step : null,
  });

  console.log("[CZ]", eventName, enriched);
  // TODO IT: forward to analytics/CRM endpoint when ready
}

// Backward-compatible alias — all existing track() calls route through trackEvent()
function track(evento, datos) {
  trackEvent(evento, datos);
}
