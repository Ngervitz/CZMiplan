/**
 * server/modules/janusExport/repository.js
 * Supabase access for the JANUS opt-in export (migration 20261006120000).
 * Two secret-gated SECURITY DEFINER RPCs: pending export (read-only) and delivery ACK
 * (append-only janus_debt_optin_delivery_acks; consent events are never touched).
 */
"use strict";

var KNOWN_DB_CODES = /\b(INVALID_EXPORT_LIMIT|INVALID_ACK_REQUEST|ACK_EVENT_NOT_EXPORTABLE)\b/;
var CLIENT_STATUS = { INVALID_EXPORT_LIMIT: 400, INVALID_ACK_REQUEST: 400, ACK_EVENT_NOT_EXPORTABLE: 422 };

function dbError(error, fallback) {
  var msg = String((error && error.message) || "");
  var known = KNOWN_DB_CODES.exec(msg);
  var code = known ? known[1] : fallback;
  var err = new Error(code);
  err.code = code;
  err.status = known ? CLIENT_STATUS[code] : 500;
  return err;
}

/**
 * @param {{ client: { rpc: Function }, backendSecret: string }} deps
 */
function createJanusExportRepository(deps) {
  var client = deps.client;
  var backendSecret = deps.backendSecret;
  if (!backendSecret) {
    var cfgErr = new Error("SUPABASE_CONFIG_MISSING");
    cfgErr.status = 503;
    cfgErr.code = "SUPABASE_CONFIG_MISSING";
    throw cfgErr;
  }

  async function exportEvents(args) {
    var { data, error } = await client.rpc("miplan_export_debt_optin_events", {
      p_secret: backendSecret,
      p_limit: args.limit,
    });
    if (error) throw dbError(error, "DB_EXPORT_FAILED");
    if (!data || typeof data !== "object" || !Array.isArray(data.events)) throw dbError(null, "DB_EXPORT_FAILED");
    return data;
  }

  /** @param {{ event_id: string, janus_status: string }[]} acks */
  async function ackEvents(acks) {
    var { data, error } = await client.rpc("miplan_ack_debt_optin_events", {
      p_secret: backendSecret,
      p_acks: acks,
    });
    if (error) throw dbError(error, "DB_ACK_FAILED");
    if (!data || !Number.isInteger(data.acked) || !Number.isInteger(data.already_acked)) {
      throw dbError(null, "DB_ACK_FAILED");
    }
    return data;
  }

  return { exportEvents: exportEvents, ackEvents: ackEvents };
}

module.exports = { createJanusExportRepository: createJanusExportRepository };
