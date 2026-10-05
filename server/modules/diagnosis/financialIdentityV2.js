/**
 * server/modules/diagnosis/financialIdentityV2.js — server-owned financial_input_identity_v2.
 *
 * Same derivation rules as v1 (server/modules/diagnosis/financialIdentity.js, FROZEN): derived only
 * from the sanitized EngineInput persisted as diagnoses.input_snapshot, lowercase hex sha256 of the
 * UTF-8 canonical string of js/financialInputIdentityV2.js. Used only for snapshots whose
 * debt_contract_version is "v2" (js/debtContract.js decides).
 */
"use strict";

var crypto = require("crypto");
var shared = require("../../../js/financialInputIdentityV2");

var VERSION = shared.FINANCIAL_INPUT_IDENTITY_VERSION;

/** @returns {{version: string, value: string} | null} */
function deriveFinancialInputIdentityV2(engineInput) {
  var canonical = shared.canonicalizeFinancialInputV2(engineInput);
  if (canonical == null) return null;
  return {
    version: VERSION,
    value: crypto.createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
}

module.exports = {
  FINANCIAL_INPUT_IDENTITY_VERSION: VERSION,
  canonicalizeFinancialInputV2: shared.canonicalizeFinancialInputV2,
  deriveFinancialInputIdentityV2: deriveFinancialInputIdentityV2,
};
