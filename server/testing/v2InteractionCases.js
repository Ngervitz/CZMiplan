/**
 * server/testing/v2InteractionCases.js — one EngineInput per operative CTA case (V2-CTA-INTERACTION-01),
 * shared by v2-interaction-test (unit) and v2-interaction-db-test (PG17 + HTTP E2E).
 * Flags: expected widget levers on the stored evaluation (expenses, lower payment, surplus, mora list).
 */
"use strict";

var sweep = require("./actionContextSweep");
var input = sweep.input;
var debt = sweep.debt;

var CASES = [
  { id: "CONTENCION_NO_ELIGIBLE_DEBT", strategy: "CONTENCION", expenses: true, lowerPayment: false, surplus: false, mora: false,
    input: input({ ingreso: 50000, gastos: { vivienda: 40000, alimentacion: 12000 }, no_debts_declared: true,
      custom_expenses: [{ id: "c1", label: "Gym", amount: 3000, included: true }] }) },
  { id: "MANTENIMIENTO_FLOW_ZERO", strategy: "MANTENIMIENTO_OPTIMIZACION", expenses: true, lowerPayment: false, surplus: false, mora: false,
    input: input({ ingreso: 50000, gastos: { vivienda: 30000, alimentacion: 20000 }, no_debts_declared: true }) },
  { id: "CONTENCION_WITH_DEBT", strategy: "CONTENCION", expenses: true, lowerPayment: true, surplus: false, mora: false,
    input: input({ ingreso: 50000, gastos: { vivienda: 40000 }, deudas: [debt(100000, 15000, "pagando_normal")] }) },
  { id: "REGULARIZACION", strategy: "REGULARIZACION", expenses: false, lowerPayment: false, surplus: false, mora: true,
    input: input({ ingreso: 100000, gastos: { vivienda: 40000 }, deudas: [debt(50000, null, "deje_pagar")] }) },
  { id: "REDUCCION_CARGA", strategy: "REDUCCION_CARGA", expenses: false, lowerPayment: true, surplus: false, mora: false,
    input: input({ ingreso: 100000, gastos: { vivienda: 30000 }, deudas: [debt(300000, 60000, "pagando_normal")] }) },
  { id: "CONSOLIDACION", strategy: "CONSOLIDACION", expenses: false, lowerPayment: false, surplus: true, mora: false,
    input: input({ ingreso: 100000, gastos: { vivienda: 30000 }, deudas: [debt(100000, 10000, "pagando_normal")] }) },
  { id: "MANTENIMIENTO_SURPLUS", strategy: "MANTENIMIENTO_OPTIMIZACION", expenses: false, lowerPayment: false, surplus: true, mora: false,
    input: input({ ingreso: 100000, gastos: { vivienda: 40000 }, no_debts_declared: true }) },
];

module.exports = { CASES: CASES };
