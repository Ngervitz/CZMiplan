/**
 * server/modules/userChoice/repository.js
 * Supabase access for V2 user choices and the debt management opt-in (migration 20261001120000).
 * Every call goes through a secret-gated SECURITY DEFINER RPC that re-checks ownership.
 */
"use strict";

var KNOWN_ERRORS = [
  "EVALUATION_NOT_FOUND",
  "DIAGNOSIS_NOT_LINKED",
  "DEBT_NOT_ELIGIBLE",
  "SURPLUS_NOT_AVAILABLE",
  "AMOUNT_OUT_OF_RANGE",
  "INVALID_AMOUNT",
  "INVALID_RESERVE_DESTINATION",
  "INVALID_CHOICE_PAYLOAD",
  "INVALID_CHOICE_TYPE",
  "INVALID_EVALUATION_ID",
  "INVALID_LOOKUP",
  "INVALID_OPT_IN_STATE",
  "INVALID_CONSENT_TEXT_VERSION",
];
var KNOWN_RE = new RegExp("\\b(" + KNOWN_ERRORS.join("|") + ")\\b");

function dbError(fallback, error) {
  var msg = String((error && error.message) || "");
  var err = new Error(fallback);
  err.status = 500;
  err.code = fallback;
  var known = KNOWN_RE.exec(msg);
  if (known) {
    err.code = known[1];
    err.message = known[1];
    delete err.status;
  } else if (/fs_user_choice_events_slot_seq_key|dm_opt_in_events_slot_seq_key|chain_fk|23505/.test(msg + " " + String(error && error.code))) {
    err.code = "USER_CHOICE_CONFLICT";
    err.message = "USER_CHOICE_CONFLICT";
    err.status = 409;
  }
  err.cause = error;
  return err;
}

/**
 * @param {object} deps
 * @param {{ rpc: Function }} deps.client
 * @param {string} deps.backendSecret
 */
function createUserChoiceRepository(deps) {
  var client = deps.client;
  var backendSecret = deps.backendSecret;

  if (!backendSecret) {
    var cfgErr = new Error("SUPABASE_CONFIG_MISSING");
    cfgErr.status = 503;
    cfgErr.code = "SUPABASE_CONFIG_MISSING";
    throw cfgErr;
  }

  async function recordUserChoice(row) {
    var { data, error } = await client.rpc("miplan_record_user_choice", {
      p_secret: backendSecret,
      p_anonymous_id: row.anonymous_id,
      p_evaluation_id: row.evaluation_id,
      p_diagnosis_id: row.diagnosis_id,
      p_choice_type: row.choice_type,
      p_debt_index: row.debt_index,
      p_amount: row.amount,
      p_reserve_destination: row.reserve_destination,
      p_lower_payment_state: row.lower_payment_state,
    });
    if (error) throw dbError("DB_USER_CHOICE_FAILED", error);
    if (!data) throw dbError("DB_USER_CHOICE_FAILED", null);
    return data;
  }

  async function getUserChoiceState(lookup) {
    var params = { p_secret: backendSecret, p_anonymous_id: lookup.anonymous_id };
    if (lookup.evaluation_id) params.p_evaluation_id = lookup.evaluation_id;
    if (lookup.diagnosis_id) params.p_diagnosis_id = lookup.diagnosis_id;
    var { data, error } = await client.rpc("miplan_get_user_choice_state", params);
    if (error) throw dbError("DB_USER_CHOICE_FAILED", error);
    if (!data) throw dbError("DB_USER_CHOICE_FAILED", null);
    return data;
  }

  async function recordDebtManagementOptIn(row) {
    var { data, error } = await client.rpc("miplan_record_debt_management_opt_in", {
      p_secret: backendSecret,
      p_anonymous_id: row.anonymous_id,
      p_evaluation_id: row.evaluation_id,
      p_diagnosis_id: row.diagnosis_id,
      p_state: row.state,
      p_consent_text_version: row.consent_text_version,
    });
    if (error) throw dbError("DB_USER_CHOICE_FAILED", error);
    if (!data) throw dbError("DB_USER_CHOICE_FAILED", null);
    return data;
  }

  return {
    recordUserChoice: recordUserChoice,
    getUserChoiceState: getUserChoiceState,
    recordDebtManagementOptIn: recordDebtManagementOptIn,
  };
}

module.exports = { createUserChoiceRepository: createUserChoiceRepository };
