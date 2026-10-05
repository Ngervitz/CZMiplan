/**
 * server/modules/financialAction/derive.js — financial_action_v1, derived server-side on read.
 *
 * Pure: (stored evaluation + its action_context + current head of each user choice slot +
 * ACTION_VERSION) -> actions. Same evaluation (financial_input_identity + classifier_version), same
 * heads and same version -> same actions. Nothing is persisted and nothing is read from the client.
 * Every head is re-validated against the action_context: a head that no longer fits produces nothing.
 * Actions never move between evaluations (an evaluation_id is one identity + classifier_version).
 *
 *   LOWER_PAYMENT_REQUEST     lower_payment_intent marked       { debt_index, monthly_debt_payment }
 *   EXPENSE_REDUCTION_TARGET  expense_reduction_intent marked   { expense_ref, current_amount, target_reduction }
 *   EXTRA_DEBT_PAYMENT        surplus_to_debt                   { debt_index, amount }
 *   MONTHLY_RESERVE           surplus_reserve                   { destination, amount }
 * target_reduction is what the user declared they could cut, never a reduction achieved.
 * creditor_contact_step produces registered progress, not a financial action.
 * A disputed debt (actionContext.disputedDebtIndices) is never a debt_index target.
 */
"use strict";

var disputedDebtIndices = require("../diagnosis/actionContext").disputedDebtIndices;

var ACTION_VERSION = "financial_action_v1";
var LOWER_PAYMENT_STRATEGIES = { CONTENCION: true, REDUCCION_CARGA: true };

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function sourceOf(choiceType, head) {
  return { choice_type: choiceType, event_id: head.event_id || null, seq: head.seq == null ? null : head.seq };
}

/**
 * @param {object} state raw miplan_get_user_choice_state reply
 * @param {object|null} actionContext buildActionContext(state.result[, origin expense input])
 * @returns {Array<object>} internal actions (authority + source event included)
 */
function deriveFinancialActions(state, actionContext) {
  if (!isPlainObject(state) || state.classification_status !== "classified" || !isPlainObject(actionContext)) return [];
  var authority = {
    evaluation_id: state.evaluation_id,
    strategy: state.strategy,
    classifier_version: state.classifier_version || null,
    financial_input_identity: state.financial_input_identity
      ? { version: state.financial_input_identity_version || null, value: state.financial_input_identity }
      : null,
  };
  function action(type, choiceType, head, params) {
    return { action_type: type, action_version: ACTION_VERSION, authority: authority, source_choice: sourceOf(choiceType, head), params: params };
  }
  var out = [];

  var disputed = {};
  disputedDebtIndices(state.result).forEach(function (i) { disputed[i] = true; });
  var activeByIndex = {};
  asArray(actionContext.active_debts).forEach(function (d) {
    if (disputed[d.debt_index] !== true) activeByIndex[d.debt_index] = d;
  });

  if (LOWER_PAYMENT_STRATEGIES[state.strategy] === true) {
    asArray(state.lower_payment_intent)
      .slice()
      .sort(function (a, b) { return a.debt_index - b.debt_index; })
      .forEach(function (h) {
        var d = activeByIndex[h.debt_index];
        if (!d || typeof d.monthly_debt_payment !== "number" || !(d.monthly_debt_payment > 0)) return;
        out.push(action("LOWER_PAYMENT_REQUEST", "lower_payment_intent", h,
          { debt_index: h.debt_index, monthly_debt_payment: d.monthly_debt_payment }));
      });
  }

  if (Array.isArray(actionContext.expense_categories)) {
    var heads = {};
    asArray(state.expense_reduction_intent).forEach(function (h) { heads[h.expense_ref] = h; });
    actionContext.expense_categories.forEach(function (c) {
      var h = heads[c.expense_ref];
      if (!h) return;
      var target = Number(h.amount);
      if (!(target > 0) || target > c.amount) return;
      out.push(action("EXPENSE_REDUCTION_TARGET", "expense_reduction_intent", h,
        { expense_ref: c.expense_ref, current_amount: c.amount, target_reduction: target }));
    });
  }

  var alloc = state.surplus_allocation;
  var surplus = isPlainObject(actionContext.monthly_surplus) ? actionContext.monthly_surplus.amount : null;
  if (isPlainObject(alloc) && typeof surplus === "number") {
    var amount = Number(alloc.amount);
    if (amount > 0 && amount <= surplus) {
      if (alloc.choice_type === "surplus_to_debt" && activeByIndex[alloc.debt_index]) {
        out.push(action("EXTRA_DEBT_PAYMENT", "surplus_to_debt", alloc, { debt_index: alloc.debt_index, amount: amount }));
      } else if (alloc.choice_type === "surplus_reserve" && typeof alloc.reserve_destination === "string") {
        out.push(action("MONTHLY_RESERVE", "surplus_reserve", alloc, { destination: alloc.reserve_destination, amount: amount }));
      }
    }
  }
  return out;
}

/** Public projection: no internal ids (event_id / seq / classifier_version / identity stay server-side). */
function projectFinancialAction(a) {
  return {
    action_type: a.action_type,
    action_version: a.action_version,
    strategy: a.authority.strategy,
    source_choice_type: a.source_choice.choice_type,
    params: Object.assign({}, a.params),
  };
}

module.exports = {
  ACTION_VERSION: ACTION_VERSION,
  deriveFinancialActions: deriveFinancialActions,
  projectFinancialAction: projectFinancialAction,
};
