/**
 * server/testing/actionContextSweep.js — generated grid of EngineInputs covering every strategy and
 * both monthly_gap certainties, plus the classifier fixtures. Shared by action-context-test and the
 * JS ↔ SQL parity check in v2-user-choice-db-test.
 */
"use strict";

var FIXTURES = require("../../dev/backend-arch/classifier-shadow/fixtures").FIXTURES;

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

var CONFIRMED = { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } };

function input(o) {
  return Object.assign({ ingreso: 100000, gastos: { vivienda: 40000 }, deudas: [], no_debts_declared: false,
    entry_context: clone(CONFIRMED) }, o);
}

function debt(monto, pago, sit, extra) {
  return Object.assign({ monto: String(monto), pago: pago, situacion_ui: sit }, extra || {});
}

function sweepInputs() {
  var incomes = [0, 30000, 100000];
  var expenses = [{}, { vivienda: 40000 }, { vivienda: 100000 }, { vivienda: "x" }];
  var templates = [
    null,
    debt(100000, 30000, "pagando_normal"), debt(300000, 60000, "pagando_normal"), debt(50000, null, "deje_pagar"),
    debt(50000, 5000, "atrasado_pagando"), debt(50000, null, "mora_reclamo"), debt(50000, 5000, "no_seguro"),
    debt(0, 5000, "pagando_normal"), debt("", 5000, "pagando_normal"), debt(50000, null, "pagando_normal"),
    debt(50000, 5000, "pagando_normal", { cancelada: true }),
  ];
  var inputs = [];
  incomes.forEach(function (inc) {
    expenses.forEach(function (g) {
      [false, true].forEach(function (nd) {
        templates.forEach(function (t1) {
          templates.forEach(function (t2) {
            var ds = [t1, t2].filter(function (t) { return t !== null; }).map(clone);
            inputs.push(input({ ingreso: inc, gastos: clone(g), no_debts_declared: nd, deudas: ds }));
          });
        });
      });
    });
  });
  FIXTURES.forEach(function (f) { inputs.push(clone(f.input)); });
  return inputs;
}

module.exports = { input: input, debt: debt, sweepInputs: sweepInputs };
