/**
 * server/testing/liveWriteGuard.js — fail-closed guard for harnesses that can write to Supabase.
 *
 * Every script that can reach a real database (live/integration mode) must call
 * assertLiveWriteAllowed() before creating a client, starting a server with persistence,
 * POSTing /v1/diagnoses or calling any RPC. Purely in-memory harnesses do not need it.
 *
 * Rule: the project ref parsed from SUPABASE_URL must be in TEST_PROJECT_REF_ALLOWLIST.
 * Missing env, unparseable URL, unknown project and production all fail: production is
 * rejected because it is not allowlisted, never by a denylist. There is no fallback.
 * The allowlist is code-only (reviewed in the repo); it cannot be extended from env.
 * Errors carry a code and the project ref only; secrets are never read into messages.
 */
"use strict";

/** Supabase project refs authorized for write-capable tests. Empty: no test project exists yet. */
var TEST_PROJECT_REF_ALLOWLIST = Object.freeze([]);

var PROJECT_REF_RE = /^[a-z0-9]{20}$/;
var SUPABASE_HOST_SUFFIX = ".supabase.co";

function blocked(code, detail) {
  var e = new Error("LIVE_WRITE_BLOCKED: " + code + (detail ? " (" + detail + ")" : ""));
  e.code = "LIVE_WRITE_BLOCKED";
  e.reason = code;
  return e;
}

/**
 * Strict: https://<20 lowercase alnum>.supabase.co with no credentials, port, path, query
 * or fragment. Anything else (custom domains, local stacks, look-alike hosts) → null.
 */
function parseSupabaseProjectRef(raw) {
  if (typeof raw !== "string") return null;
  var s = raw.trim();
  if (!s) return null;
  var u;
  try {
    u = new URL(s);
  } catch (_e) {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return null;
  var host = u.hostname;
  if (host.length !== 20 + SUPABASE_HOST_SUFFIX.length || host.slice(-SUPABASE_HOST_SUFFIX.length) !== SUPABASE_HOST_SUFFIX) {
    return null;
  }
  var ref = host.slice(0, 20);
  return PROJECT_REF_RE.test(ref) ? ref : null;
}

/**
 * @param {{ env?: object, harness: string, allowlist?: string[] }} opts
 * @returns {{ project_ref: string }}
 */
function assertLiveWriteAllowed(opts) {
  opts = opts || {};
  var env = opts.env || process.env;
  var allowlist = Array.isArray(opts.allowlist) ? opts.allowlist : TEST_PROJECT_REF_ALLOWLIST;
  var harness = String(opts.harness || "unknown-harness");
  var url = env && typeof env.SUPABASE_URL === "string" ? env.SUPABASE_URL.trim() : "";
  if (!url) throw blocked("SUPABASE_URL_MISSING", harness);
  var ref = parseSupabaseProjectRef(url);
  if (!ref) throw blocked("PROJECT_REF_UNPARSEABLE", harness);
  if (allowlist.indexOf(ref) === -1) throw blocked("PROJECT_REF_NOT_ALLOWLISTED", harness + ": " + ref);
  return { project_ref: ref };
}

/** CLI helper: print the reason and exit non-zero; never returns on failure. */
function requireLiveWriteAllowedOrExit(harness) {
  try {
    return assertLiveWriteAllowed({ harness: harness });
  } catch (e) {
    console.error(e.message);
    process.exit(3);
  }
}

module.exports = {
  TEST_PROJECT_REF_ALLOWLIST: TEST_PROJECT_REF_ALLOWLIST,
  parseSupabaseProjectRef: parseSupabaseProjectRef,
  assertLiveWriteAllowed: assertLiveWriteAllowed,
  requireLiveWriteAllowedOrExit: requireLiveWriteAllowedOrExit,
};
