/**
 * server/modules/journey/service.js
 * Resolve/create journeys for A3 handoff bootstrap.
 */
"use strict";

var crypto = require("crypto");
var sanitize = require("./sanitizeContext");

function bootstrapKeyFromHandoffCode(code) {
  var hash = crypto.createHash("sha256").update(String(code), "utf8").digest("hex");
  return "handoff:" + hash;
}

/**
 * @param {object} deps
 * @param {{ resolveHandoffJourney: Function, assertJourneyOwned: Function }} deps.repository
 * @param {string} deps.tenantId
 */
function createJourneyService(deps) {
  var repository = deps.repository;
  var tenantId = deps.tenantId;

  /**
   * Durable lookup by handoff code hash (no JANUS). Returns null if absent.
   */
  async function lookupByHandoffCode(anonymousId, handoffCode) {
    var key = bootstrapKeyFromHandoffCode(handoffCode);
    var row = await repository.resolveHandoffJourney({
      anonymousId: anonymousId,
      tenantId: tenantId,
      bootstrapKey: key,
      bootstrapContext: null,
    });
    if (!row || !row.journey_id) return null;
    return {
      journey_id: String(row.journey_id),
      created: false,
      context: row.bootstrap_context || null,
      funnel: row.funnel || null,
      commercial_originator: row.commercial_originator || null,
      external_ref: row.external_ref || null,
      external_ref_type: row.external_ref_type || null,
      bootstrap_key: key,
    };
  }

  /**
   * After JANUS redeem success: create or reconcile journey; persist allowlisted context.
   */
  async function createFromHandoffRedeem(anonymousId, handoffCode, rawContext) {
    var context = sanitize.sanitizeHandoffContext(rawContext);
    if (!context) {
      var bad = new Error("INVALID_HANDOFF_CONTEXT");
      bad.status = 502;
      bad.code = "INVALID_HANDOFF_CONTEXT";
      throw bad;
    }

    var funnel =
      (context.context && context.context.funnel) || "credizona_rejected";
    var commercial = sanitize.commercialOriginatorForFunnel(funnel);
    var key = bootstrapKeyFromHandoffCode(handoffCode);

    var row = await repository.resolveHandoffJourney({
      anonymousId: anonymousId,
      tenantId: tenantId,
      bootstrapKey: key,
      entryType: "janus_handoff",
      funnel: funnel,
      commercialOriginator: commercial,
      sourceSystem:
        (context.provenance && context.provenance.source_system) || "janus",
      externalRefType:
        (context.context && context.context.external_ref_type) || "lrw",
      externalRef: (context.context && context.context.external_ref) || null,
      bootstrapContext: context,
    });

    if (!row || !row.journey_id) {
      var fail = new Error("JOURNEY_CREATE_FAILED");
      fail.status = 500;
      fail.code = "JOURNEY_CREATE_FAILED";
      throw fail;
    }

    return {
      journey_id: String(row.journey_id),
      created: !!row.created,
      context: row.bootstrap_context || context,
      funnel: row.funnel || funnel,
      commercial_originator: row.commercial_originator || commercial,
      external_ref: row.external_ref || null,
      external_ref_type: row.external_ref_type || null,
      bootstrap_key: key,
    };
  }

  async function assertOwned(journeyId, anonymousId) {
    return repository.assertJourneyOwned(journeyId, anonymousId);
  }

  return {
    lookupByHandoffCode: lookupByHandoffCode,
    createFromHandoffRedeem: createFromHandoffRedeem,
    assertOwned: assertOwned,
    bootstrapKeyFromHandoffCode: bootstrapKeyFromHandoffCode,
  };
}

module.exports = {
  createJourneyService: createJourneyService,
  bootstrapKeyFromHandoffCode: bootstrapKeyFromHandoffCode,
};
