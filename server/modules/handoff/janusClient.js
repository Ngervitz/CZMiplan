/**
 * server/modules/handoff/janusClient.js
 * Mi Plan BE → JANUS S2S redeem (Bearer). Never logs handoff_code.
 */
"use strict";

/**
 * @param {{ janusHandoffRedeemUrl: string, miplanHandoffRedeemSecret: string, timeoutMs?: number }} cfg
 */
function createJanusHandoffClient(cfg) {
  var baseUrl = String(cfg.janusHandoffRedeemUrl || "").replace(/\/$/, "");
  var secret = String(cfg.miplanHandoffRedeemSecret || "");
  var timeoutMs = cfg.timeoutMs || 10000;

  /**
   * @param {string} handoffCode
   * @returns {Promise<{ ok: boolean, status: number, context?: object, error?: string }>}
   */
  function redeem(handoffCode) {
    if (!baseUrl || !secret) {
      return Promise.resolve({
        ok: false,
        status: 503,
        error: "JANUS_HANDOFF_NOT_CONFIGURED",
      });
    }
    var code = String(handoffCode || "").trim();
    if (!code) {
      return Promise.resolve({ ok: false, status: 400, error: "missing_code" });
    }

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    return fetch(baseUrl + "/internal/miplan/v1/handoff/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + secret,
        Accept: "application/json",
      },
      body: JSON.stringify({ handoff_code: code }),
      signal: controller.signal,
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (_e) {
            json = null;
          }
          if (!res.ok) {
            return {
              ok: false,
              status: res.status,
              error:
                json && json.error
                  ? String(json.error)
                  : "redeem_http_" + res.status,
            };
          }
          if (!json || !json.context) {
            return { ok: false, status: 502, error: "invalid_janus_response" };
          }
          return { ok: true, status: 200, context: json.context };
        });
      })
      .catch(function (err) {
        var aborted =
          err &&
          (err.name === "AbortError" ||
            /aborted/i.test(String(err && err.message)));
        return {
          ok: false,
          status: 503,
          error: aborted ? "janus_timeout" : "janus_network_error",
        };
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  return { redeem: redeem };
}

module.exports = { createJanusHandoffClient: createJanusHandoffClient };
