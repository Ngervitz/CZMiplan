/**
 * server/modules/diagnosis/financialIdentity.js — server-owned financial_input_identity_v1.
 *
 * Derived only from the sanitized EngineInput the server persists as diagnoses.input_snapshot,
 * so it is reproducible from the stored snapshot. Client-sent hashes/fingerprints are never read.
 * Excludes classifier_version by contract: validity = owner scope + identity + classifier_version.
 * FROZEN with js/financialInputIdentity.js: v1 = lowercase hex sha256 of the UTF-8 canonical
 * string. A different hash or encoding is financial_input_identity_v2, never an edit here.
 */
"use strict";

var crypto = require("crypto");
var shared = require("../../../js/financialInputIdentity");

var VERSION = shared.FINANCIAL_INPUT_IDENTITY_VERSION;

/** @returns {{version: string, value: string} | null} */
function deriveFinancialInputIdentity(engineInput) {
  var canonical = shared.canonicalizeFinancialInput(engineInput);
  if (canonical == null) return null;
  return {
    version: VERSION,
    value: crypto.createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
}

module.exports = {
  FINANCIAL_INPUT_IDENTITY_VERSION: VERSION,
  canonicalizeFinancialInput: shared.canonicalizeFinancialInput,
  deriveFinancialInputIdentity: deriveFinancialInputIdentity,
};
