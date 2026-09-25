/**
 * server/http/routes/handoff.js
 * POST /v1/handoff/redeem — browser sends only opaque code; BE redeems with JANUS;
 * creates/resolves durable journey_id (MIPLAN-JOURNEY-01).
 */
"use strict";

var express = require("express");
var resolveAnonymousId = require("../../modules/identity/anonymousId").resolveAnonymousId;
var createJanusHandoffClient = require("../../modules/handoff/janusClient").createJanusHandoffClient;

/**
 * @param {{
 *   config: object,
 *   journeyService: {
 *     lookupByHandoffCode: Function,
 *     createFromHandoffRedeem: Function,
 *   }
 * }} deps
 */
function createHandoffRouter(deps) {
  var router = express.Router();
  var config = deps.config;
  var journeyService = deps.journeyService;
  var client = createJanusHandoffClient({
    janusHandoffRedeemUrl: config.janusHandoffBaseUrl,
    miplanHandoffRedeemSecret: config.miplanHandoffRedeemSecret,
  });

  router.post("/v1/handoff/redeem", function (req, res, next) {
    Promise.resolve()
      .then(function () {
        var anon = resolveAnonymousId(req);
        if (!anon.ok) {
          var err = new Error(anon.message);
          err.status = 400;
          err.code = anon.code;
          throw err;
        }

        if (!journeyService) {
          var noJ = new Error("JOURNEY_SERVICE_UNAVAILABLE");
          noJ.status = 503;
          noJ.code = "JOURNEY_SERVICE_UNAVAILABLE";
          throw noJ;
        }

        var body = req.body && typeof req.body === "object" ? req.body : {};
        // Reject LRW-based context requests — capability only.
        if (body.lrw || body.external_ref || body.ci) {
          var forbid = new Error("LRW_NOT_ALLOWED");
          forbid.status = 400;
          forbid.code = "LRW_NOT_ALLOWED";
          throw forbid;
        }

        var code =
          body.handoff_code != null
            ? String(body.handoff_code)
            : body.code != null
              ? String(body.code)
              : "";
        code = code.trim();
        if (!code) {
          var missing = new Error("missing_code");
          missing.status = 400;
          missing.code = "missing_code";
          throw missing;
        }

        // 1) Durable idempotency first (survives restart / multi-instance).
        return journeyService
          .lookupByHandoffCode(anon.anonymousId, code)
          .then(function (existing) {
            if (existing && existing.journey_id && existing.context) {
              return {
                ok: true,
                context: existing.context,
                anonymous_id: anon.anonymousId,
                journey_id: existing.journey_id,
                cached: true,
                durable: true,
              };
            }

            // 2) JANUS one-time redeem
            return client.redeem(code).then(function (result) {
              if (result.ok) {
                return journeyService
                  .createFromHandoffRedeem(
                    anon.anonymousId,
                    code,
                    result.context
                  )
                  .then(function (journey) {
                    return {
                      ok: true,
                      context: journey.context,
                      anonymous_id: anon.anonymousId,
                      journey_id: journey.journey_id,
                      cached: false,
                      durable: true,
                    };
                  });
              }

              // 3) JANUS already consumed — reconcile durable journey if we have it
              var reason = String(result.error || "");
              if (
                reason === "already_redeemed" ||
                result.status === 409
              ) {
                return journeyService
                  .lookupByHandoffCode(anon.anonymousId, code)
                  .then(function (again) {
                    if (again && again.journey_id && again.context) {
                      return {
                        ok: true,
                        context: again.context,
                        anonymous_id: anon.anonymousId,
                        journey_id: again.journey_id,
                        cached: true,
                        durable: true,
                      };
                    }
                    var e409 = new Error("already_redeemed");
                    e409.status = 409;
                    e409.code = "already_redeemed";
                    throw e409;
                  });
              }

              var e = new Error(result.error || "redeem_failed");
              e.status = result.status || 502;
              e.code = result.error || "redeem_failed";
              throw e;
            });
          });
      })
      .then(function (payload) {
        res.status(200).json(payload);
      })
      .catch(next);
  });

  return router;
}

module.exports = {
  createHandoffRouter: createHandoffRouter,
};
