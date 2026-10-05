/**
 * debtContract.js — explicit debt contract version of an EngineInput snapshot.
 *
 * The only reader of input.debt_contract_version. Selection between
 * financial_input_identity_v1 + classifier shadow-02 (contract "v1") and
 * financial_input_identity_v2 + classifier shadow-03 (contract "v2") is made from
 * this marker alone — never from the presence of pago_mensual_actual / mora / reclamo_disputa,
 * survey_version, JSON shape or any other field value.
 *
 * Compatibility rule: a snapshot without the key predates the marker and is legacy "v1".
 * Any present value other than "v1" / "v2" (null, "", "V2", 2, ...) is invalid: callers fail closed.
 */
(function (root, factory) {
  var node = typeof module === "object" && module.exports;
  var api = factory(
    node ? require("./financialInputIdentity") : root.CZFinancialInputIdentity,
    node ? require("./financialInputIdentityV2") : root.CZFinancialInputIdentityV2
  );
  if (node) module.exports = api;
  else root.CZDebtContract = api;
})(typeof self !== "undefined" ? self : this, function (identityV1, identityV2) {
  "use strict";

  var FIELD = "debt_contract_version";
  var V1 = "v1";
  var V2 = "v2";

  /** "v1" | "v2" | null (invalid marker). */
  function resolveDebtContractVersion(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    if (!Object.prototype.hasOwnProperty.call(input, FIELD)) return V1;
    var v = input[FIELD];
    return v === V1 || v === V2 ? v : null;
  }

  /** Canonical identity string of the snapshot under its own contract, or null. */
  function canonicalizeForContract(input) {
    var contract = resolveDebtContractVersion(input);
    if (contract === V1) return identityV1 ? identityV1.canonicalizeFinancialInput(input) : null;
    if (contract === V2) return identityV2 ? identityV2.canonicalizeFinancialInputV2(input) : null;
    return null;
  }

  /** Identity version the server derives for the snapshot, or null. */
  function identityVersionFor(input) {
    var contract = resolveDebtContractVersion(input);
    if (contract === V1) return identityV1 ? identityV1.FINANCIAL_INPUT_IDENTITY_VERSION : null;
    if (contract === V2) return identityV2 ? identityV2.FINANCIAL_INPUT_IDENTITY_VERSION : null;
    return null;
  }

  return {
    FIELD: FIELD,
    V1: V1,
    V2: V2,
    resolveDebtContractVersion: resolveDebtContractVersion,
    canonicalizeForContract: canonicalizeForContract,
    identityVersionFor: identityVersionFor,
  };
});
