/**
 * server/modules/identity/anonymousId.js — validate anonymous_id (no Auth).
 */
"use strict";

// UUID (any version) or UUID-like hex form used by product identity.js
var ANON_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 * @returns {{ ok: true, anonymousId: string } | { ok: false, code: string, message: string }}
 */
function validateAnonymousId(value) {
  if (value == null || value === "") {
    return {
      ok: false,
      code: "ANONYMOUS_ID_REQUIRED",
      message: "anonymous_id is required",
    };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      code: "ANONYMOUS_ID_INVALID",
      message: "anonymous_id must be a string",
    };
  }
  var id = value.trim();
  if (id.length < 36 || id.length > 64) {
    return {
      ok: false,
      code: "ANONYMOUS_ID_INVALID",
      message: "anonymous_id length invalid",
    };
  }
  if (!ANON_ID_RE.test(id)) {
    return {
      ok: false,
      code: "ANONYMOUS_ID_INVALID",
      message: "anonymous_id format invalid",
    };
  }
  return { ok: true, anonymousId: id };
}

/**
 * Resolve from header X-MiPlan-Anonymous-Id or body.anonymous_id.
 */
function resolveAnonymousId(req) {
  var header =
    req.headers["x-miplan-anonymous-id"] ||
    req.headers["X-MiPlan-Anonymous-Id"];
  if (header) return validateAnonymousId(header);
  var body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return validateAnonymousId(body.anonymous_id);
  }
  return validateAnonymousId(null);
}

module.exports = {
  validateAnonymousId: validateAnonymousId,
  resolveAnonymousId: resolveAnonymousId,
};
