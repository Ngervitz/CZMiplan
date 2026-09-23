/**
 * Layer A — static drift detection for FS evidence stamps.
 * Compares STAMP_FORMS in why-evidence-contract.js to _fsProvenance
 * object literals in js/algorithms.js.
 *
 * Does NOT classify sufficiency. Run why-sufficiency-qa.js separately.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var contract = require("./why-evidence-contract");

var ALGORITHMS = path.join(__dirname, "..", "..", "js", "algorithms.js");

function extractKeysFromObjectLiteral(obj) {
  var keys = [];
  var depth = 0;
  var inStr = false;
  var expectingKey = false;
  for (var i = 0; i < obj.length; i++) {
    var ch = obj.charAt(i);
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") {
      depth++;
      if (depth === 1) expectingKey = true;
      continue;
    }
    if (ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 1) continue;
    if (ch === ",") {
      expectingKey = true;
      continue;
    }
    if (expectingKey && /[A-Za-z_]/.test(ch)) {
      var start = i;
      i++;
      while (i < obj.length && /[A-Za-z0-9_]/.test(obj.charAt(i))) i++;
      var name = obj.slice(start, i);
      while (i < obj.length && /\s/.test(obj.charAt(i))) i++;
      if (obj.charAt(i) === ":") keys.push(name);
      expectingKey = false;
      i--;
    }
  }
  return keys;
}

function extractStampForms(src) {
  var formsByCode = {};
  var re = /_fsProvenance\(\s*"(FS_[A-Z0-9_]+)"\s*,\s*"[A-Z]+"\s*,\s*/g;
  var m;
  while ((m = re.exec(src))) {
    var code = m[1];
    var start = re.lastIndex;
    if (src.charAt(start) !== "{") {
      throw new Error("expected { after _fsProvenance for " + code + " at " + start);
    }
    var depth = 0;
    var i = start;
    var inStr = false;
    for (; i < src.length; i++) {
      var ch = src.charAt(i);
      if (inStr) {
        if (ch === "\\") { i++; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    var obj = src.slice(start, i);
    var keys = extractKeysFromObjectLiteral(obj);
    if (!formsByCode[code]) formsByCode[code] = [];
    formsByCode[code].push(contract.sortedKeys(keys));
  }
  var out = {};
  Object.keys(formsByCode).forEach(function (code) {
    out[code] = contract.uniqueForms(formsByCode[code]);
  });
  return out;
}

function formsEqual(a, b) {
  var ua = contract.uniqueForms(a);
  var ub = contract.uniqueForms(b);
  if (ua.length !== ub.length) return false;
  for (var i = 0; i < ua.length; i++) {
    if (contract.formId(ua[i]) !== contract.formId(ub[i])) return false;
  }
  return true;
}

function main() {
  var src = fs.readFileSync(ALGORITHMS, "utf8");
  var stamped = extractStampForms(src);
  var expected = {};
  Object.keys(contract.STAMP_FORMS).forEach(function (code) {
    expected[code] = contract.uniqueForms(contract.STAMP_FORMS[code]);
  });

  var issues = [];
  Object.keys(stamped).forEach(function (code) {
    if (!expected[code]) {
      issues.push("NEW_REASON_CODE " + code + " forms=" + JSON.stringify(stamped[code]));
    }
  });
  Object.keys(expected).forEach(function (code) {
    if (!stamped[code]) {
      issues.push("MISSING_REASON_CODE " + code);
      return;
    }
    if (!formsEqual(expected[code], stamped[code])) {
      issues.push(
        "FORM_DRIFT " + code +
        " expected=" + JSON.stringify(expected[code]) +
        " stamped=" + JSON.stringify(stamped[code])
      );
    }
  });

  if (issues.length) {
    console.error("WHY_EVIDENCE_DRIFT_A: FAIL");
    issues.forEach(function (x) { console.error("  " + x); });
    process.exit(1);
  }
  console.log("WHY_EVIDENCE_DRIFT_A: PASS");
  console.log("codes=" + Object.keys(expected).sort().length);
}

module.exports = { extractStampForms: extractStampForms, formsEqual: formsEqual };

if (require.main === module) main();
