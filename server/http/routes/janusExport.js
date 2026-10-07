/**
 * server/http/routes/janusExport.js
 * GET  /internal/janus/v1/debt-optin-events      — JANUS (server-to-server) pulls the pending
 *      (unacked) debt-management opt-in events.
 * POST /internal/janus/v1/debt-optin-events/ack  — JANUS acknowledges events it durably ingested.
 * Auth (both): Authorization: Bearer <MIPLAN_JANUS_EXPORT_SECRET> (dedicated secret,
 * timing-safe). Browser requests (Origin header) are refused; the routes never add CORS headers
 * (the global CORS allowlist does not permit the Authorization header). Payloads are never logged.
 */
"use strict";

var crypto = require("crypto");
var express = require("express");

var RATE_WINDOW_MS = 60 * 1000;
var RATE_MAX = 30;
var MIN_SECRET_LENGTH = 32;
var EXPORT_PATH = "/internal/janus/v1/debt-optin-events";
var ACK_PATH = EXPORT_PATH + "/ack";

function httpError(status, code) {
  var err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

function createRateLimiter(windowMs, max) {
  var hits = new Map();
  return function allow(key) {
    var t = Date.now();
    var entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      if (hits.size > 10000) hits.clear();
      entry = { count: 0, reset: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest();
}

/** Usable only when long enough and not reused from another Mi Plan secret. */
function usableExportSecret(config) {
  var s = config.janusExportSecret;
  if (!s || s.length < MIN_SECRET_LENGTH) return null;
  if (s === config.miplanHandoffRedeemSecret || s === config.backendSecret) return null;
  return s;
}

function bearerMatches(header, secret) {
  if (typeof header !== "string") return false;
  var m = /^Bearer ([^\s]+)$/.exec(header);
  if (!m) return false;
  return crypto.timingSafeEqual(digest(m[1]), digest(secret));
}

/**
 * @param {{ config: object, janusExportService: { listEvents: Function, ackEvents: Function }|null }} deps
 */
function createJanusExportRouter(deps) {
  var router = express.Router();
  var secret = usableExportSecret(deps.config);
  var service = deps.janusExportService;
  var allow = createRateLimiter(RATE_WINDOW_MS, RATE_MAX);

  function guarded(handler) {
    return function (req, res, next) {
      res.set("Cache-Control", "no-store");
      Promise.resolve()
        .then(function () {
          if (!secret || !service) throw httpError(503, "JANUS_EXPORT_UNAVAILABLE");
          if (req.headers.origin) throw httpError(403, "JANUS_EXPORT_FORBIDDEN");
          if (!allow(String(req.ip || ""))) throw httpError(429, "RATE_LIMITED");
          if (!bearerMatches(req.headers.authorization, secret)) throw httpError(401, "UNAUTHORIZED");
          return handler(req);
        })
        .then(function (payload) {
          res.status(200).json(payload);
        })
        .catch(next);
    };
  }

  router.get(EXPORT_PATH, guarded(function (req) {
    return service.listEvents({ limit: req.query.limit });
  }));

  router.post(ACK_PATH, guarded(function (req) {
    return service.ackEvents(req.body);
  }));

  return router;
}

module.exports = {
  createJanusExportRouter: createJanusExportRouter,
  usableExportSecret: usableExportSecret,
  MIN_SECRET_LENGTH: MIN_SECRET_LENGTH,
};
