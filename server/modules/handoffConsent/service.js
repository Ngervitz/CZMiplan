/**
 * server/modules/handoffConsent/service.js
 * Mi Plan T&C / Privacy accepted on the Credizona thank-you page, bound to the handoff journey.
 */
"use strict";

var bootstrapKeyFromHandoffCode = require("../journey/service").bootstrapKeyFromHandoffCode;

// Must equal LEGAL_VERSION_TC / LEGAL_VERSION_PRIVACY in js/config.js (parity-tested).
var MIPLAN_LEGAL_VERSIONS = Object.freeze({
  tc: "TC_v2.0_202605",
  privacy: "PP_v2.0_202605",
});

var HANDOFF_CODE_RE = /^[A-Za-z0-9_-]{20,128}$/;

function clientError(code, status) {
  var err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * @param {{ repository: { recordPending: Function, attachToJourney: Function } }} deps
 */
function createHandoffConsentService(deps) {
  var repository = deps.repository;

  async function recordFromCredizona(body) {
    body = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    var code = typeof body.handoff_code === "string" ? body.handoff_code.trim() : "";
    if (!HANDOFF_CODE_RE.test(code)) throw clientError("INVALID_CONSENT_REQUEST", 400);
    if (body.tc_version !== MIPLAN_LEGAL_VERSIONS.tc || body.privacy_version !== MIPLAN_LEGAL_VERSIONS.privacy) {
      throw clientError("CONSENT_VERSION_NOT_CURRENT", 422);
    }
    await repository.recordPending({
      bootstrapKey: bootstrapKeyFromHandoffCode(code),
      tcVersion: MIPLAN_LEGAL_VERSIONS.tc,
      privacyVersion: MIPLAN_LEGAL_VERSIONS.privacy,
    });
    return { ok: true, recorded: true };
  }

  /**
   * Only call after the journey was resolved for its owner. Never throws: no consent on failure.
   */
  async function consentForJourney(handoffCode, journeyId) {
    try {
      var row = await repository.attachToJourney({
        bootstrapKey: bootstrapKeyFromHandoffCode(handoffCode),
        journeyId: String(journeyId),
      });
      if (!row || String(row.journey_id) !== String(journeyId)) return null;
      return {
        source: "credizona_gracias",
        tc_version: row.tc_version,
        privacy_version: row.privacy_version,
        accepted_at: new Date(row.accepted_at).toISOString(),
        journey_id: String(row.journey_id),
      };
    } catch (err) {
      console.warn(JSON.stringify({ level: "warn", msg: "handoff_consent_attach_failed", code: (err && err.code) || "UNKNOWN" }));
      return null;
    }
  }

  return { recordFromCredizona: recordFromCredizona, consentForJourney: consentForJourney };
}

module.exports = {
  createHandoffConsentService: createHandoffConsentService,
  MIPLAN_LEGAL_VERSIONS: MIPLAN_LEGAL_VERSIONS,
};
