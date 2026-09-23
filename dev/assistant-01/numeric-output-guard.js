/**
 * DEV-portable POST-LLM numeric output guard.
 * Fail-closed: unauthorized quantity (value or sign) → REJECT.
 * Not production backend. Not a general finance parser.
 *
 * Canonical compare: JS number (value + sign). No %↔ratio conversion.
 * UY thousands: 4.200 → 4200 when the token is groups of 3 after dots.
 */
"use strict";

var TECHNICAL_KEYS = {
  schema_version: true,
  question_id: true,
  reason_code: true,
  text_ref: true,
  source_layer: true,
  decision: true,
  value: true,
  action_id: true,
  id: true,
  tone_code: true,
  visible_copy: true,
  action_label: true,
  causa_principal: true,
  patron_deuda: true,
  financial_stage: true,
  metric_links: true,
  bank: true,
};

var INTENT_NUMERIC_PATHS = {
  WHY_DIAGNOSIS: ["evidence"],
  MAIN_BLOCKER: ["metrics"],
  EXPLAIN_ACTION: ["selection_reason.evidence", "retention_reason.evidence"],
  EXPLAIN_NEXT_STEP: ["evidence"],
};

var MINUS_RE = /[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g;

function getPath(obj, path) {
  var cur = obj;
  var parts = path.split(".");
  for (var i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function collectNumbersFromNode(node, out) {
  if (node == null) return;
  if (typeof node === "number" && isFinite(node)) {
    out.push(node);
    return;
  }
  if (typeof node === "string" && /^-?\d+(?:\.\d+)?$/.test(node.trim())) {
    out.push(Number(node.trim()));
    return;
  }
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) collectNumbersFromNode(node[i], out);
    return;
  }
  if (typeof node === "object") {
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      if (TECHNICAL_KEYS[keys[k]]) continue;
      collectNumbersFromNode(node[keys[k]], out);
    }
  }
}

function authorizedNumbers(intent, ctx) {
  var paths = INTENT_NUMERIC_PATHS[intent];
  if (!paths || !ctx) return [];
  var out = [];
  for (var i = 0; i < paths.length; i++) {
    collectNumbersFromNode(getPath(ctx, paths[i]), out);
  }
  var uniq = [];
  for (var j = 0; j < out.length; j++) {
    if (uniq.indexOf(out[j]) === -1) uniq.push(out[j]);
  }
  return uniq;
}

function parseQuantityToken(raw) {
  if (raw == null) return null;
  var original = String(raw);
  var s = original.replace(MINUS_RE, "-").trim();
  var percent = /%\s*$/.test(s);
  s = s.replace(/%\s*$/, "").trim();
  s = s.replace(/[$€]/g, "");
  s = s.replace(/\s+/g, "");
  var sign = 1;
  if (s.charAt(0) === "+") {
    s = s.slice(1);
    sign = 1;
  } else if (s.charAt(0) === "-") {
    s = s.slice(1);
    sign = -1;
  }
  if (!/^\d/.test(s)) return null;

  var lastDot = s.lastIndexOf(".");
  var lastComma = s.lastIndexOf(",");
  var mag;
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) mag = Number(s.replace(/\./g, "").replace(",", "."));
    else mag = Number(s.replace(/,/g, ""));
  } else if (lastComma !== -1) {
    var fracC = s.length - lastComma - 1;
    if (fracC === 3 && /^\d{1,3}(,\d{3})+$/.test(s)) mag = Number(s.replace(/,/g, ""));
    else mag = Number(s.replace(",", "."));
  } else if (lastDot !== -1) {
    var fracD = s.length - lastDot - 1;
    if (fracD === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) mag = Number(s.replace(/\./g, ""));
    else mag = Number(s);
  } else {
    mag = Number(s);
  }
  if (!isFinite(mag)) return null;
  return { raw: original, value: sign * mag, percent: percent };
}

var TOKEN_RE = /(?:[$€]\s*)?(?:[+\-\u2212\u2012\u2013\u2014\uFE63\uFF0D]\s*)?(?:[$€]\s*)?(?:\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)%?/g;

function isIdentChar(ch) {
  return /[A-Za-z0-9_]/.test(ch);
}

function extractQuantities(text) {
  var s = String(text || "");
  var out = [];
  TOKEN_RE.lastIndex = 0;
  var m;
  while ((m = TOKEN_RE.exec(s)) !== null) {
    var idx = m.index;
    var prev = idx > 0 ? s.charAt(idx - 1) : "";
    if (prev && isIdentChar(prev)) continue;
    var parsed = parseQuantityToken(m[0]);
    if (parsed) out.push(parsed);
  }
  return out;
}

function isAuthorized(value, allow) {
  for (var i = 0; i < allow.length; i++) {
    if (allow[i] === value) return true;
  }
  return false;
}

/**
 * @returns {{ ok: boolean, decision: "PASS"|"REJECT", allow: number[], found: object[], rejected: object[] }}
 */
function checkNumericOutputGuard(intent, ctx, text) {
  var allow = authorizedNumbers(intent, ctx);
  var found = extractQuantities(text);
  var rejected = [];
  for (var i = 0; i < found.length; i++) {
    var q = found[i];
    if (!isAuthorized(q.value, allow)) {
      rejected.push({
        raw: q.raw,
        value: q.value,
        percent: q.percent,
        reason: "UNAUTHORIZED_QUANTITY",
      });
    }
  }
  var ok = rejected.length === 0;
  return {
    ok: ok,
    decision: ok ? "PASS" : "REJECT",
    allow: allow,
    found: found,
    rejected: rejected,
  };
}

module.exports = {
  TECHNICAL_KEYS: TECHNICAL_KEYS,
  INTENT_NUMERIC_PATHS: INTENT_NUMERIC_PATHS,
  authorizedNumbers: authorizedNumbers,
  parseQuantityToken: parseQuantityToken,
  extractQuantities: extractQuantities,
  checkNumericOutputGuard: checkNumericOutputGuard,
  FALLBACK_DECISION: "ASSISTANT_OUTPUT_GUARD_FALLBACK_COPY",
};
