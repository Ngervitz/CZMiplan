/**
 * engine/support/completeness.js — D4: derive completeness from raw inputs.
 * Ignores client_completeness_flags.
 */
"use strict";

function recomputeCompleteness(ctx, st) {
  var ing = typeof ctx.PRE !== "undefined" ? parseFloat(ctx.PRE.ingreso) : NaN;
  if (!isNaN(ing) && ing > 0) {
    st.financial_income_complete = true;
    if (!st.income_source) st.income_source = "user_input";
  } else {
    st.financial_income_complete = false;
  }

  var nameOk = typeof ctx.hasValidDeclaredName === "function" && ctx.hasValidDeclaredName(st);
  var emailOk = typeof ctx.hasValidDeclaredEmail === "function" && ctx.hasValidDeclaredEmail(st);
  var laboralOk = typeof ctx.hasValidDeclaredLaboral === "function" && ctx.hasValidDeclaredLaboral(st);
  var incomeOk = typeof ctx.hasCompletedIncomeInputs === "function" && ctx.hasCompletedIncomeInputs(st);
  st.financial_profile_complete = !!(incomeOk && nameOk && emailOk && laboralOk);

  if (st.no_debts_declared) {
    st.financial_debts_complete = true;
  } else if (st.deudas && st.deudas.length > 0) {
    st.financial_debts_complete = true;
  } else {
    st.financial_debts_complete = false;
  }

  var expTotal = typeof ctx.getTotalMonthlyExpensesSafe === "function"
    ? ctx.getTotalMonthlyExpensesSafe(st)
    : 0;
  st.financial_expenses_complete = !!(expTotal > 0);

  return {
    financial_income_complete: !!st.financial_income_complete,
    financial_profile_complete: !!st.financial_profile_complete,
    financial_debts_complete: !!st.financial_debts_complete,
    financial_expenses_complete: !!st.financial_expenses_complete,
    hasCompletedFinancialInputs: typeof ctx.hasCompletedFinancialInputs === "function"
      ? !!ctx.hasCompletedFinancialInputs(st)
      : false,
    derived_checks: {
      nameOk: !!nameOk,
      emailOk: !!emailOk,
      laboralOk: !!laboralOk,
      incomeOk: !!incomeOk,
      expTotal: expTotal,
    },
  };
}

module.exports = { recomputeCompleteness: recomputeCompleteness };
