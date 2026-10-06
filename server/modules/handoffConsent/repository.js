/**
 * server/modules/handoffConsent/repository.js
 * Supabase access for Credizona thank-you consents (secret-gated RPCs).
 */
"use strict";

function dbError(error, fallbackCode) {
  var msg = String((error && error.message) || "");
  var err = new Error(fallbackCode);
  err.status = 500;
  err.code = fallbackCode;
  if (/HANDOFF_ALREADY_REDEEMED/i.test(msg)) {
    err.status = 409;
    err.code = "HANDOFF_ALREADY_REDEEMED";
  } else if (/INVALID_BOOTSTRAP_KEY|INVALID_CONSENT_VERSION/i.test(msg)) {
    err.status = 400;
    err.code = "INVALID_CONSENT_REQUEST";
  } else if (/MIPLAN_UNAUTHORIZED/i.test(msg)) {
    err.status = 503;
    err.code = "SUPABASE_CONFIG_MISSING";
  }
  err.cause = error;
  return err;
}

/**
 * @param {object} deps
 * @param {import('@supabase/supabase-js').SupabaseClient} deps.client
 * @param {string} deps.backendSecret
 */
function createHandoffConsentRepository(deps) {
  var client = deps.client;
  var backendSecret = deps.backendSecret;

  if (!backendSecret) {
    var cfgErr = new Error("SUPABASE_CONFIG_MISSING");
    cfgErr.status = 503;
    cfgErr.code = "SUPABASE_CONFIG_MISSING";
    throw cfgErr;
  }

  async function recordPending(args) {
    var { data, error } = await client.rpc("miplan_record_handoff_consent", {
      p_secret: backendSecret,
      p_bootstrap_key: args.bootstrapKey,
      p_tc_version: args.tcVersion,
      p_privacy_version: args.privacyVersion,
    });
    if (error) throw dbError(error, "DB_HANDOFF_CONSENT_FAILED");
    return data || null;
  }

  async function attachToJourney(args) {
    var { data, error } = await client.rpc("miplan_attach_handoff_consent", {
      p_secret: backendSecret,
      p_bootstrap_key: args.bootstrapKey,
      p_journey_id: args.journeyId,
    });
    if (error) throw dbError(error, "DB_HANDOFF_CONSENT_FAILED");
    return data || null;
  }

  return { recordPending: recordPending, attachToJourney: attachToJourney };
}

/**
 * Same semantics as the RPCs, for local/unit runs without Supabase.
 * @param {{ _test: { byKey: Map, byId: Map } }} journeyRepository memory journey repository
 * @param {{ ttlMs?: number, now?: () => number }} [opts]
 */
function createMemoryHandoffConsentRepository(journeyRepository, opts) {
  opts = opts || {};
  var ttlMs = opts.ttlMs || 15 * 60 * 1000;
  var now = opts.now || Date.now;
  var byKey = new Map();
  var journeys = journeyRepository && journeyRepository._test ? journeyRepository._test : { byKey: new Map(), byId: new Map() };

  async function recordPending(args) {
    if (journeys.byKey.has(args.bootstrapKey)) {
      var redeemed = new Error("HANDOFF_ALREADY_REDEEMED");
      redeemed.status = 409;
      redeemed.code = "HANDOFF_ALREADY_REDEEMED";
      throw redeemed;
    }
    var t = now();
    var row = byKey.get(args.bootstrapKey);
    if (!row || (!row.consumed_at && row.expires_at <= t)) {
      row = {
        tc_version: args.tcVersion,
        privacy_version: args.privacyVersion,
        consent_source: "credizona_gracias",
        accepted_at: t,
        expires_at: t + ttlMs,
        journey_id: null,
        consumed_at: null,
      };
      byKey.set(args.bootstrapKey, row);
    }
    if (row.consumed_at) {
      var used = new Error("HANDOFF_ALREADY_REDEEMED");
      used.status = 409;
      used.code = "HANDOFF_ALREADY_REDEEMED";
      throw used;
    }
    return { recorded: true, accepted_at: new Date(row.accepted_at).toISOString() };
  }

  async function attachToJourney(args) {
    var journey = journeys.byId.get(String(args.journeyId));
    if (!journey || journey.bootstrap_key !== args.bootstrapKey) return null;
    var row = byKey.get(args.bootstrapKey);
    if (!row) return null;
    var t = now();
    if (!row.consumed_at && row.expires_at > t) {
      row.journey_id = String(args.journeyId);
      row.consumed_at = t;
    }
    if (row.journey_id !== String(args.journeyId)) return null;
    return {
      tc_version: row.tc_version,
      privacy_version: row.privacy_version,
      consent_source: row.consent_source,
      accepted_at: new Date(row.accepted_at).toISOString(),
      journey_id: row.journey_id,
    };
  }

  return { recordPending: recordPending, attachToJourney: attachToJourney, _test: { byKey: byKey } };
}

module.exports = {
  createHandoffConsentRepository: createHandoffConsentRepository,
  createMemoryHandoffConsentRepository: createMemoryHandoffConsentRepository,
};
