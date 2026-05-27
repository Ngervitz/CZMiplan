// =============================================================================
// consent.js — Legal consent gate for Credizona Mi Plan
// Depends on: config.js only
//
// ARCHITECTURE NOTE:
// Mi Plan has zero mandatory checkboxes of its own.
// All consent is collected in Credizona's rejection + survey funnel.
// This file validates that consent, persists it, and redirects
// users who arrive without going through the funnel.
//
// Consent persistence is local-only in this MVP version.
// Backend persistence occurs separately through CRM snapshot payloads.
// =============================================================================

// ---------------------------------------------------------------------------
// readConsentFromURL()
// Reads consent params appended by Credizona's bridge screen after user accepts.
// Expected params: cz_tc=1&cz_disc=1
// cz_op and cz_mkt are only present if user explicitly checked those options.
// They are never defaulted to any value silently.
// Returns null if required params are absent.
// ---------------------------------------------------------------------------
function readConsentFromURL() {
  var p = new URLSearchParams(window.location.search);
  if (p.get("cz_tc") !== "1" || p.get("cz_disc") !== "1") return null;

  var result = {
    tc_accepted:         true,
    disclaimer_accepted: true,
    consent_method:      "url_params",
    consent_origin:      "credizona_rejection_funnel",
  };

  // Only set if explicitly passed — never default silently
  if (p.get("cz_op")  === "1") result.operational_optin = true;
  if (p.get("cz_mkt") === "1") result.marketing_optin   = true;

  return result;
}

// ---------------------------------------------------------------------------
// loadStoredConsent()
// Reads prior consent record from localStorage.
// Returns null if absent, malformed, or version outdated.
// Version check ensures users re-consent via funnel when legal docs change.
// ---------------------------------------------------------------------------
function loadStoredConsent() {
  try {
    var raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);

    // Basic structure check
    if (!parsed.tc_accepted || !parsed.disclaimer_accepted) return null;

    // Version validation — if any legal doc changed, require re-consent via funnel
    if (parsed.tc_version         !== LEGAL_VERSION_TC)         return null;
    if (parsed.disclaimer_version !== LEGAL_VERSION_DISCLAIMER) return null;
    if (parsed.privacy_version    !== LEGAL_VERSION_PRIVACY)    return null;

    return parsed;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// saveConsent(consentObj)
// Persists consent record to localStorage with legal metadata.
// Stores separate version strings for tc, disclaimer and privacy.
// Does NOT store: cedula, nombre, ingreso, IP, or any financial data.
// ---------------------------------------------------------------------------
function saveConsent(consentObj) {
  try {
    var record = {
      tc_accepted:          consentObj.tc_accepted,
      disclaimer_accepted:  consentObj.disclaimer_accepted,
      operational_optin:    consentObj.operational_optin  || false,
      marketing_optin:      consentObj.marketing_optin    || false,
      tc_version:           LEGAL_VERSION_TC,
      disclaimer_version:   LEGAL_VERSION_DISCLAIMER,
      privacy_version:      LEGAL_VERSION_PRIVACY,
      consent_method:       consentObj.consent_method     || "url_params",
      consent_origin:       consentObj.consent_origin     || "credizona_rejection_funnel",
      timestamp:            new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    return record;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// hasValidConsent()
// Returns true if the user has a valid, current-version consent record.
// Returns false if consent is missing, malformed, or any version is outdated.
// ---------------------------------------------------------------------------
function hasValidConsent() {
  return loadStoredConsent() !== null;
}

// ---------------------------------------------------------------------------
// getLegalAcceptancePayload()
// Returns a structured legal_acceptance object for use in snapshots and CRM.
// Returns null if no valid consent is stored.
// ---------------------------------------------------------------------------
function getLegalAcceptancePayload() {
  var stored = loadStoredConsent();
  if (!stored) return null;
  return {
    tyc:                stored.tc_accepted          || false,
    disclaimer:         stored.disclaimer_accepted  || false,
    accepted_at:        stored.timestamp            || null,
    tc_version:         stored.tc_version           || LEGAL_VERSION_TC,
    disclaimer_version: stored.disclaimer_version   || LEGAL_VERSION_DISCLAIMER,
    privacy_version:    stored.privacy_version      || LEGAL_VERSION_PRIVACY,
    consent_method:     stored.consent_method       || null,
    consent_origin:     stored.consent_origin       || null,
  };
}

// ---------------------------------------------------------------------------
// initConsent()
// Entry point. Called once before init() in app.js.
// Returns true if app can proceed, false if redirecting.
//
// Priority:
//   1. URL params from Credizona (cz_tc=1&cz_disc=1) → save and proceed
//   2. Valid current-version consent in localStorage → proceed (returning user)
//   3. No valid consent → redirect to credizona.com.uy
// ---------------------------------------------------------------------------
function initConsent() {

  // QA / standalone guard — evaluated BEFORE any redirect logic.
  // If any Mi Plan data params are present, the app is being loaded directly
  // (QA testing, dev, or deep-link from Credizona with data but without the
  // consent bridge).  Never redirect externally in this case.
  var _p = new URLSearchParams(window.location.search);
  var skipExternalRedirect = _p.has("p1")
    || _p.has("nombre")
    || _p.has("ingreso")
    || _p.has("czuid");

  // Priority 1: URL params from Credizona rejection + survey funnel
  var urlConsent = readConsentFromURL();
  if (urlConsent) {
    saveConsent(urlConsent);
    if (typeof trackEvent === "function") {
      trackEvent(CZ_CONSENT_EVENTS.LEGAL_ACCEPTED, {
        tc_version:         LEGAL_VERSION_TC,
        disclaimer_version: LEGAL_VERSION_DISCLAIMER,
        privacy_version:    LEGAL_VERSION_PRIVACY,
        consent_method:     "url_params",
        consent_origin:     "credizona_rejection_funnel",
      });
    }
    return true;
  }

  // Priority 2: stored valid current-version consent (returning user)
  var stored = loadStoredConsent();
  if (stored) {
    if (typeof trackEvent === "function") {
      trackEvent(CZ_CONSENT_EVENTS.LEGAL_RESTORED, {
        tc_version:     stored.tc_version,
        consent_method: "returning_user",
        consent_origin: stored.consent_origin || null,
      });
    }
    return true;
  }

  // Priority 3: no valid consent — redirect to Credizona home.
  // Mi Plan operates within Credizona's recovery flow and requires
  // prior contextual information from the rejection funnel.
  // Redirect is suppressed when QA / data params are present (see guard above).
  if (skipExternalRedirect) {
    return true;
  }
  if (typeof trackEvent === "function") {
    trackEvent(CZ_CONSENT_EVENTS.OUTSIDE_FUNNEL, {
      destination: MIPLAN_UNAUTHORIZED_REDIRECT,
    });
  }
  window.location.href = MIPLAN_UNAUTHORIZED_REDIRECT;
  return false;
}
