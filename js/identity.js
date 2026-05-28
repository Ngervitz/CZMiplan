// =============================================================================
// identity.js — Device, session, and CRM contact identity (Sprint 11.5)
// Depende de: config.js (generateUUID)
// Must load BEFORE events.js and analytics.js
// =============================================================================

(function() {

  var ANON_KEY     = "cz_anonymous_id";
  var CRM_KEY      = "cz_crm_contact_id";
  var SESSION_KEY  = "cz_session_id";
  var LAST_SEEN_KEY = "cz_session_last_seen";
  var SESSION_TTL_MS = 1800000; // 30 minutes

  // ---------------------------------------------------------------------------
  // A) anonymous_id — permanent device identifier (localStorage)
  // Never overwritten by URL czuid.
  // ---------------------------------------------------------------------------
  function resolveAnonymousId() {
    var anonId = null;
    try {
      anonId = localStorage.getItem(ANON_KEY);
    } catch (e) {}

    if (!anonId) {
      anonId = generateUUID();
      try {
        localStorage.setItem(ANON_KEY, anonId);
      } catch (e) {}
    }

    return anonId;
  }

  // ---------------------------------------------------------------------------
  // B) crm_contact_id — CRM identifier from ?czuid= (localStorage)
  // Separate from anonymous_id. Never sent to GTM.
  // ---------------------------------------------------------------------------
  function resolveCrmContactId() {
    var urlCzuid = new URLSearchParams(window.location.search).get("czuid") || null;
    var stored   = null;

    try {
      stored = localStorage.getItem(CRM_KEY);
    } catch (e) {}

    if (urlCzuid) {
      try {
        localStorage.setItem(CRM_KEY, urlCzuid);
      } catch (e) {}
      return urlCzuid;
    }

    return stored;
  }

  // ---------------------------------------------------------------------------
  // C + D) session_id — sessionStorage with 30min inactivity TTL
  // ---------------------------------------------------------------------------
  function resolveSessionId() {
    var now      = Date.now();
    var lastSeen = 0;
    var sessId   = null;

    try {
      lastSeen = parseFloat(sessionStorage.getItem(LAST_SEEN_KEY)) || 0;
      sessId   = sessionStorage.getItem(SESSION_KEY);
    } catch (e) {}

    if (!sessId || (lastSeen && (now - lastSeen) > SESSION_TTL_MS)) {
      sessId = generateUUID();
      try {
        sessionStorage.setItem(SESSION_KEY, sessId);
      } catch (e) {}
    }

    return sessId;
  }

  // ---------------------------------------------------------------------------
  // Activity heartbeat — resets TTL clock (not anonymous_id)
  // ---------------------------------------------------------------------------
  function updateSessionActivity() {
    try {
      sessionStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
    } catch (e) {}
  }

  var anonId        = resolveAnonymousId();
  var crmContactId = resolveCrmContactId();
  var sessId        = resolveSessionId();

  updateSessionActivity();

  window.updateSessionActivity = updateSessionActivity;

  window.CZIdentity = {
    anonymous_id:     anonId,
    session_id:       sessId,
    crm_contact_id:   crmContactId,
    created_at:       new Date().toISOString(),
    version:          "1.1",
  };

  document.addEventListener("click", updateSessionActivity);
  document.addEventListener("keypress", updateSessionActivity);
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") {
      updateSessionActivity();
    }
  });

})();
