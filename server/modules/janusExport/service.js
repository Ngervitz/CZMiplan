/**
 * server/modules/janusExport/service.js — JANUS pull of debt-management opt-in events.
 *
 * Mi Plan stays the source of truth of the opt-in. The export carries only the authorized
 * snapshot D (selected in SQL) and re-applies a field allowlist here as defense in depth:
 * nothing outside EVENT_FIELDS / DEBT_FIELDS can leave Mi Plan through this contract.
 *
 * Delivery: at-least-once. listEvents returns pending (unacked) events; JANUS acks each event
 * only after durable ingest (ackEvents). Unacked events are re-exported on every pull.
 */
"use strict";

var CONTRACT_VERSION = "miplan_debt_optin_export_v1";
var DEFAULT_LIMIT = 100;
var MAX_LIMIT = 200;
var MAX_ACKS = 200;
var ACK_STATUSES = Object.freeze(["inserted", "already_ingested"]);
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

var EVENT_FIELDS = Object.freeze([
  "event_id", "journey_id", "seq", "state", "scope", "contract_version", "source",
  "consent_text_version", "created_at", "origin_evaluation_id", "origin_diagnosis_id",
  "snapshot_diagnosis_id", "handoff_token_hash", "excluded_count",
]);

var DEBT_FIELDS = Object.freeze([
  "position", "client_debt_id", "tipo", "acreedor_raw", "acreedor", "acreedor_display",
  "acreedor_normalizado", "monto", "pago", "pago_mensual_actual", "situacion_ui", "estado",
  "atraso_tiempo", "atraso_tiempo_aprox", "ultimo_pago_declarado", "debt_confidence",
]);

function clientError(code) {
  var err = new Error(code);
  err.status = 400;
  err.code = code;
  return err;
}

function parseLimit(raw) {
  if (raw == null || raw === "") return DEFAULT_LIMIT;
  if (typeof raw !== "string" || !/^\d{1,3}$/.test(raw)) throw clientError("INVALID_EXPORT_LIMIT");
  var n = Number(raw);
  if (n < 1 || n > MAX_LIMIT) throw clientError("INVALID_EXPORT_LIMIT");
  return n;
}

/** Strict ACK body: exact keys, 1..200 distinct lowercase uuids, known statuses. */
function parseAcks(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw clientError("INVALID_ACK_REQUEST");
  var keys = Object.keys(body).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["acks", "contract_version"])) throw clientError("INVALID_ACK_REQUEST");
  if (body.contract_version !== CONTRACT_VERSION) throw clientError("INVALID_ACK_REQUEST");
  if (!Array.isArray(body.acks) || body.acks.length < 1 || body.acks.length > MAX_ACKS) {
    throw clientError("INVALID_ACK_REQUEST");
  }
  var seen = new Set();
  return body.acks.map(function (a) {
    if (!a || typeof a !== "object" || Array.isArray(a)) throw clientError("INVALID_ACK_REQUEST");
    if (JSON.stringify(Object.keys(a).sort()) !== JSON.stringify(["event_id", "janus_status"])) {
      throw clientError("INVALID_ACK_REQUEST");
    }
    if (typeof a.event_id !== "string" || !UUID_RE.test(a.event_id)) throw clientError("INVALID_ACK_REQUEST");
    if (ACK_STATUSES.indexOf(a.janus_status) === -1) throw clientError("INVALID_ACK_REQUEST");
    if (seen.has(a.event_id)) throw clientError("INVALID_ACK_REQUEST");
    seen.add(a.event_id);
    return { event_id: a.event_id, janus_status: a.janus_status };
  });
}

function pick(src, fields) {
  var out = {};
  fields.forEach(function (f) {
    out[f] = src[f] === undefined ? null : src[f];
  });
  return out;
}

function shapeEvent(row) {
  var ev = pick(row, EVENT_FIELDS);
  if (row.state === "opted_in") {
    ev.debts = (Array.isArray(row.debts) ? row.debts : []).map(function (d) {
      return pick(d || {}, DEBT_FIELDS);
    });
  } else {
    ev.excluded_count = null;
  }
  return ev;
}

/**
 * @param {{ repository: { exportEvents: Function, ackEvents: Function } }} deps
 */
function createJanusExportService(deps) {
  var repository = deps.repository;

  async function listEvents(query) {
    var limit = parseLimit(query && query.limit);
    var data = await repository.exportEvents({ limit: limit });
    return {
      contract_version: CONTRACT_VERSION,
      events: data.events.map(shapeEvent),
      has_more: data.has_more === true,
    };
  }

  async function ackEvents(body) {
    var acks = parseAcks(body);
    var data = await repository.ackEvents(acks);
    return {
      contract_version: CONTRACT_VERSION,
      acked: data.acked,
      already_acked: data.already_acked,
    };
  }

  return { listEvents: listEvents, ackEvents: ackEvents };
}

module.exports = {
  CONTRACT_VERSION: CONTRACT_VERSION,
  EVENT_FIELDS: EVENT_FIELDS,
  DEBT_FIELDS: DEBT_FIELDS,
  MAX_ACKS: MAX_ACKS,
  createJanusExportService: createJanusExportService,
};
