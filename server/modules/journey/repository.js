/**
 * server/modules/journey/repository.js
 * Supabase access for journeys (secret-gated RPCs).
 */
"use strict";

/**
 * @param {object} deps
 * @param {import('@supabase/supabase-js').SupabaseClient} deps.client
 * @param {string} deps.backendSecret
 * @param {string} deps.tenantId
 */
function createJourneyRepository(deps) {
  var client = deps.client;
  var backendSecret = deps.backendSecret;
  var tenantId = deps.tenantId;

  if (!backendSecret) {
    var cfgErr = new Error("SUPABASE_CONFIG_MISSING");
    cfgErr.status = 503;
    cfgErr.code = "SUPABASE_CONFIG_MISSING";
    throw cfgErr;
  }

  /**
   * Lookup or create journey by bootstrap_key.
   * If no row and bootstrapContext is null → returns null (not found).
   */
  async function resolveHandoffJourney(args) {
    var { data, error } = await client.rpc("miplan_resolve_handoff_journey", {
      p_secret: backendSecret,
      p_anonymous_id: args.anonymousId,
      p_tenant_id: args.tenantId || tenantId,
      p_bootstrap_key: args.bootstrapKey,
      p_entry_type: args.entryType || "janus_handoff",
      p_funnel: args.funnel || null,
      p_commercial_originator: args.commercialOriginator || null,
      p_source_system: args.sourceSystem || null,
      p_external_ref_type: args.externalRefType || null,
      p_external_ref: args.externalRef || null,
      p_bootstrap_context: args.bootstrapContext != null ? args.bootstrapContext : null,
    });

    if (error) {
      var msg = String((error && error.message) || "");
      var dbErr = new Error("DB_JOURNEY_RESOLVE_FAILED");
      dbErr.status = 500;
      dbErr.code = "DB_JOURNEY_RESOLVE_FAILED";
      if (/JOURNEY_OWNERSHIP_MISMATCH/i.test(msg) || /42501/.test(msg)) {
        dbErr.status = 403;
        dbErr.code = "JOURNEY_OWNERSHIP_MISMATCH";
      } else if (/INVALID_BOOTSTRAP_KEY|INVALID_ENTRY_TYPE|INVALID_ANONYMOUS_ID/i.test(msg)) {
        dbErr.status = 400;
        dbErr.code = "INVALID_JOURNEY_ARGS";
      } else if (/MIPLAN_UNAUTHORIZED/i.test(msg)) {
        dbErr.status = 503;
        dbErr.code = "SUPABASE_CONFIG_MISSING";
      }
      dbErr.cause = error;
      throw dbErr;
    }

    return data || null;
  }

  async function assertJourneyOwned(journeyId, anonymousId) {
    var { data, error } = await client.rpc("miplan_assert_journey_owned", {
      p_secret: backendSecret,
      p_journey_id: journeyId,
      p_anonymous_id: anonymousId,
    });

    if (error) {
      var msg = String((error && error.message) || "");
      var dbErr = new Error("JOURNEY_NOT_OWNED");
      dbErr.status = 403;
      dbErr.code = "JOURNEY_NOT_OWNED";
      if (/JOURNEY_NOT_FOUND|P0002/i.test(msg)) {
        dbErr.status = 404;
        dbErr.code = "JOURNEY_NOT_FOUND";
      } else if (/JOURNEY_OWNERSHIP_MISMATCH/i.test(msg)) {
        dbErr.status = 403;
        dbErr.code = "JOURNEY_OWNERSHIP_MISMATCH";
      } else if (/INVALID_JOURNEY_ID/i.test(msg)) {
        dbErr.status = 400;
        dbErr.code = "INVALID_JOURNEY_ID";
      }
      dbErr.cause = error;
      throw dbErr;
    }

    return !!data;
  }

  return {
    resolveHandoffJourney: resolveHandoffJourney,
    assertJourneyOwned: assertJourneyOwned,
  };
}

/**
 * In-memory journey store for unit tests (no Supabase).
 */
function createMemoryJourneyRepository() {
  var byKey = new Map();
  var byId = new Map();

  async function resolveHandoffJourney(args) {
    var existing = byKey.get(args.bootstrapKey);
    if (existing) {
      if (existing.anonymous_id !== args.anonymousId) {
        var own = new Error("JOURNEY_OWNERSHIP_MISMATCH");
        own.status = 403;
        own.code = "JOURNEY_OWNERSHIP_MISMATCH";
        throw own;
      }
      return {
        journey_id: existing.journey_id,
        created: false,
        anonymous_id: existing.anonymous_id,
        entry_type: existing.entry_type,
        funnel: existing.funnel,
        commercial_originator: existing.commercial_originator,
        source_system: existing.source_system,
        external_ref_type: existing.external_ref_type,
        external_ref: existing.external_ref,
        bootstrap_context: existing.bootstrap_context,
        created_at: existing.created_at,
      };
    }

    if (!args.bootstrapContext) {
      return null;
    }

    var crypto = require("crypto");
    var id = crypto.randomUUID();
    var row = {
      journey_id: id,
      anonymous_id: args.anonymousId,
      entry_type: args.entryType || "janus_handoff",
      funnel: args.funnel || null,
      commercial_originator: args.commercialOriginator || null,
      source_system: args.sourceSystem || null,
      external_ref_type: args.externalRefType || null,
      external_ref: args.externalRef || null,
      bootstrap_key: args.bootstrapKey,
      bootstrap_context: args.bootstrapContext,
      created_at: new Date().toISOString(),
    };
    // Concurrent-safe within single process: check-again after build
    var raced = byKey.get(args.bootstrapKey);
    if (raced) {
      if (raced.anonymous_id !== args.anonymousId) {
        var own2 = new Error("JOURNEY_OWNERSHIP_MISMATCH");
        own2.status = 403;
        own2.code = "JOURNEY_OWNERSHIP_MISMATCH";
        throw own2;
      }
      return {
        journey_id: raced.journey_id,
        created: false,
        anonymous_id: raced.anonymous_id,
        entry_type: raced.entry_type,
        funnel: raced.funnel,
        commercial_originator: raced.commercial_originator,
        source_system: raced.source_system,
        external_ref_type: raced.external_ref_type,
        external_ref: raced.external_ref,
        bootstrap_context: raced.bootstrap_context,
        created_at: raced.created_at,
      };
    }
    byKey.set(args.bootstrapKey, row);
    byId.set(id, row);
    return {
      journey_id: id,
      created: true,
      anonymous_id: row.anonymous_id,
      entry_type: row.entry_type,
      funnel: row.funnel,
      commercial_originator: row.commercial_originator,
      source_system: row.source_system,
      external_ref_type: row.external_ref_type,
      external_ref: row.external_ref,
      bootstrap_context: row.bootstrap_context,
      created_at: row.created_at,
    };
  }

  async function assertJourneyOwned(journeyId, anonymousId) {
    var row = byId.get(String(journeyId));
    if (!row) {
      var nf = new Error("JOURNEY_NOT_FOUND");
      nf.status = 404;
      nf.code = "JOURNEY_NOT_FOUND";
      throw nf;
    }
    if (row.anonymous_id !== anonymousId) {
      var own = new Error("JOURNEY_OWNERSHIP_MISMATCH");
      own.status = 403;
      own.code = "JOURNEY_OWNERSHIP_MISMATCH";
      throw own;
    }
    return true;
  }

  return {
    resolveHandoffJourney: resolveHandoffJourney,
    assertJourneyOwned: assertJourneyOwned,
    _test: { byKey: byKey, byId: byId },
  };
}

module.exports = {
  createJourneyRepository: createJourneyRepository,
  createMemoryJourneyRepository: createMemoryJourneyRepository,
};
