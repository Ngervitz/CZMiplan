// =============================================================================
// analytics.js — CRM-only telemetry channel (Sprint 11.5)
// Depende de: config.js, identity.js, events.js, crm.js
// Must load AFTER events.js and crm.js
// =============================================================================

// =============================================================================
// trackCRMEvent — internal financial / CRM telemetry only
// Never routes to dataLayer, GTM, Meta, or GA4.
// =============================================================================
function trackCRMEvent(eventName, payload) {

  payload = payload || {};

  var enriched = Object.assign({}, payload, {
    event:           eventName,
    event_version:   "v1",
    timestamp:       new Date().toISOString(),
    anonymous_id:    (window.CZIdentity && window.CZIdentity.anonymous_id)     || null,
    session_id:      (window.CZIdentity && window.CZIdentity.session_id)       || null,
    crm_contact_id:  (window.CZIdentity && window.CZIdentity.crm_contact_id)   || null,
  });

  var CZ_DEBUG = (
    typeof window !== "undefined" &&
    window.location &&
    window.location.search.indexOf("czdev=true") !== -1
  );

  if (CZ_DEBUG) {
    console.log("[CZ CRM ONLY]", eventName, enriched);
  }

  if (typeof enviarCRM === "function") {
    try {
      enviarCRM(eventName, enriched);
    } catch (e) {
      if (CZ_DEBUG) {
        console.warn("[CZ CRM ERROR]", eventName, e);
      }
    }
  }

  return enriched;
}

// =============================================================================
// DEBUG — analytics + identity inspection (?czdev=true)
// =============================================================================
window.CZDebugAnalytics = function() {

  var lastSeen = parseFloat(
    sessionStorage.getItem("cz_session_last_seen")
  ) || Date.now();

  return {
    identity: window.CZIdentity,

    session_ttl_remaining_ms: Math.max(
      0,
      1800000 - (Date.now() - lastSeen)
    ),

    dataLayer_snapshot: window.dataLayer || [],

    gtm_events: typeof CZ_GTM_EVENTS !== "undefined"
      ? CZ_GTM_EVENTS
      : [],

    internal_events: typeof CZ_INTERNAL_EVENTS !== "undefined"
      ? CZ_INTERNAL_EVENTS
      : [],

    crm_only_events: typeof CZ_CRM_ONLY_EVENTS !== "undefined"
      ? CZ_CRM_ONLY_EVENTS
      : [],

    crm_hardening_enabled: true,
  };
};
