/**
 * server/modules/userChoice/service.js — V2 user choices (user_choice_v1) and the debt management
 * opt-in (debt_management_opt_in_v1) on an owned V2 strategy evaluation.
 *
 * The client sends only what the user chose (type, debt_index, amount, destination, state). Strategy,
 * monthly_surplus, debt state and ownership are never read from the request: the RPCs re-derive them
 * from the stored evaluation. This layer only rejects malformed shapes early.
 */
"use strict";

var buildActionContext = require("../diagnosis/actionContext").buildActionContext;

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var AMOUNT_RE = /^-?\d{1,12}(\.\d{1,2})?$/;
var VERSION_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var CHOICE_FIELDS = {
  lower_payment_intent: ["debt_index", "state"],
  surplus_to_debt: ["debt_index", "amount"],
  surplus_reserve: ["destination", "amount"],
};
var PAYLOAD_FIELDS = ["debt_index", "amount", "destination", "state"];
var RESERVE_DESTINATIONS = ["emergency_fund", "planned_goal"];
var LOWER_PAYMENT_STATES = ["marked", "unmarked"];
// Strategies whose actions include trying to lower a debt's monthly payment. Must equal the list in
// miplan_private.v2_choice_authority (lower_payment_debts); parity-tested in v2-user-choice-db-test.
var LOWER_PAYMENT_STRATEGIES = ["CONTENCION", "REDUCCION_CARGA"];
var OPT_IN_STATES = ["opted_in", "withdrawn"];
var OPT_IN_SCOPE = "debt_management_interest";

function fail(code, status) {
  var err = new Error(code);
  err.code = code;
  if (status) err.status = status;
  return err;
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function present(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined && body[key] !== null;
}

function uuidOrThrow(value, code) {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw fail(code);
  return value.toLowerCase();
}

function optionalDiagnosisId(body) {
  return present(body, "diagnosis_id") ? uuidOrThrow(body.diagnosis_id, "INVALID_DIAGNOSIS_ID") : null;
}

function debtIndexOrThrow(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw fail("INVALID_CHOICE_PAYLOAD");
  }
  return value;
}

/** Monetary amount, at most 2 decimals (number or technical decimal string). Range is the RPC's job. */
function amountOrThrow(value) {
  var text;
  if (typeof value === "number" && Number.isFinite(value)) text = String(value);
  else if (typeof value === "string") text = value.trim();
  else throw fail("INVALID_AMOUNT");
  if (!AMOUNT_RE.test(text)) throw fail("INVALID_AMOUNT");
  return Number(text);
}

function projectChoice(row) {
  if (!row) return null;
  if (row.choice_type === "lower_payment_intent") {
    return { choice_type: row.choice_type, debt_index: row.debt_index, state: row.lower_payment_state, updated_at: row.created_at };
  }
  var out = { choice_type: row.choice_type };
  if (row.choice_type === "surplus_to_debt") out.debt_index = row.debt_index;
  else out.destination = row.reserve_destination;
  out.amount = Number(row.amount);
  out.chosen_at = row.created_at;
  return out;
}

function projectOptIn(row) {
  return {
    scope: OPT_IN_SCOPE,
    state: row ? row.state : "none",
    third_party_sharing_authorized: false,
    updated_at: row ? row.created_at : null,
  };
}

/**
 * Debts on which lower_payment_intent is valid, derived only from the stored evaluation result: the
 * strategy is in LOWER_PAYMENT_STRATEGIES and the debt is an action_context active debt with a known
 * payment > 0 (there is a payment to lower).
 */
function lowerPaymentEligible(result) {
  var actionContext = buildActionContext(result);
  if (!actionContext || LOWER_PAYMENT_STRATEGIES.indexOf(result.strategy) === -1) return [];
  var debts = Array.isArray(actionContext.active_debts) ? actionContext.active_debts : [];
  return debts
    .filter(function (d) { return typeof d.monthly_debt_payment === "number" && d.monthly_debt_payment > 0; })
    .map(function (d) { return d.debt_index; });
}

function projectState(state) {
  var actionContext = buildActionContext(state.result);
  var marked = {};
  (state.lower_payment_intent || []).forEach(function (m) { marked[m.debt_index] = m.created_at; });
  return {
    evaluation_id: state.evaluation_id,
    classification_status: state.classification_status,
    strategy: state.strategy,
    action_context: actionContext,
    choices: {
      lower_payment_intent: lowerPaymentEligible(state.result).map(function (i) {
        return { debt_index: i, state: marked[i] ? "marked" : "unmarked", updated_at: marked[i] || null };
      }),
      surplus_allocation: projectChoice(state.surplus_allocation),
    },
    debt_management_opt_in: projectOptIn(state.debt_management_opt_in),
  };
}

/**
 * @param {{ repository: ReturnType<typeof import('./repository').createUserChoiceRepository> }} deps
 */
function createUserChoiceService(deps) {
  var repository = deps.repository;

  async function getState(args) {
    var lookup = { anonymous_id: args.anonymousId };
    if (args.evaluationId !== undefined) lookup.evaluation_id = uuidOrThrow(args.evaluationId, "INVALID_EVALUATION_ID");
    else lookup.diagnosis_id = uuidOrThrow(args.diagnosisId, "INVALID_DIAGNOSIS_ID");
    return projectState(await repository.getUserChoiceState(lookup));
  }

  async function recordChoice(args) {
    var evaluationId = uuidOrThrow(args.evaluationId, "INVALID_EVALUATION_ID");
    var body = isPlainObject(args.body) ? args.body : {};
    var type = body.choice_type;
    if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(CHOICE_FIELDS, type)) {
      throw fail("INVALID_CHOICE_TYPE");
    }
    var allowed = CHOICE_FIELDS[type];
    PAYLOAD_FIELDS.forEach(function (k) {
      if (allowed.indexOf(k) === -1 && present(body, k)) throw fail("INVALID_CHOICE_PAYLOAD");
    });

    var row = {
      anonymous_id: args.anonymousId,
      evaluation_id: evaluationId,
      diagnosis_id: optionalDiagnosisId(body),
      choice_type: type,
      debt_index: null,
      amount: null,
      reserve_destination: null,
      lower_payment_state: null,
    };
    if (type === "lower_payment_intent") {
      row.debt_index = debtIndexOrThrow(body.debt_index);
      var st = present(body, "state") ? body.state : "marked";
      if (LOWER_PAYMENT_STATES.indexOf(st) === -1) throw fail("INVALID_CHOICE_PAYLOAD");
      row.lower_payment_state = st;
    } else {
      row.amount = amountOrThrow(body.amount);
      if (type === "surplus_to_debt") {
        row.debt_index = debtIndexOrThrow(body.debt_index);
      } else {
        if (typeof body.destination !== "string" || RESERVE_DESTINATIONS.indexOf(body.destination) === -1) {
          throw fail("INVALID_RESERVE_DESTINATION");
        }
        row.reserve_destination = body.destination;
      }
    }

    var saved = await repository.recordUserChoice(row);
    return {
      evaluation_id: saved.evaluation_id,
      choice_type: type,
      appended: saved.appended === true,
      current: projectChoice(saved.current),
    };
  }

  async function recordOptIn(args) {
    var evaluationId = uuidOrThrow(args.evaluationId, "INVALID_EVALUATION_ID");
    var body = isPlainObject(args.body) ? args.body : {};
    if (OPT_IN_STATES.indexOf(body.state) === -1) throw fail("INVALID_OPT_IN_STATE");
    var textVersion = null;
    if (present(body, "consent_text_version")) {
      if (typeof body.consent_text_version !== "string" || !VERSION_RE.test(body.consent_text_version)) {
        throw fail("INVALID_CONSENT_TEXT_VERSION");
      }
      textVersion = body.consent_text_version;
    }
    var saved = await repository.recordDebtManagementOptIn({
      anonymous_id: args.anonymousId,
      evaluation_id: evaluationId,
      diagnosis_id: optionalDiagnosisId(body),
      state: body.state,
      consent_text_version: textVersion,
    });
    return {
      evaluation_id: saved.evaluation_id,
      appended: saved.appended === true,
      debt_management_opt_in: projectOptIn(saved.current),
    };
  }

  return { getState: getState, recordChoice: recordChoice, recordOptIn: recordOptIn };
}

module.exports = {
  createUserChoiceService: createUserChoiceService,
  RESERVE_DESTINATIONS: RESERVE_DESTINATIONS,
  LOWER_PAYMENT_STRATEGIES: LOWER_PAYMENT_STRATEGIES,
  lowerPaymentEligible: lowerPaymentEligible,
};
