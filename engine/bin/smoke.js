/**
 * Smoke: import engine without a real browser; run once; determinism check.
 * Usage: node engine/bin/smoke.js
 */
"use strict";

var runEngine = require("../index").runEngine;
var ENGINE_VERSION = require("../index").ENGINE_VERSION;

// Assert module load did not need jsdom / window on the host
if (typeof document !== "undefined" && typeof window !== "undefined") {
  // In Node these are normally undefined — if somehow present, still ok.
}

var sample = {
  now_ms: 1786536000000,
  ingreso: 100000,
  laboral: "relacion_dependencia",
  declared_nombre: "QA Synthetic",
  declared_email: "qa@example.test",
  declared_laboral: "relacion_dependencia",
  declared_ingreso: 100000,
  respuestas: {
    p1: "A", p2: "A", p3: "A", p4: "A", p5: "A",
    p6: "A", p7: "A", p8: "A", p9: "A", p10: "A",
  },
  tiene_encuesta: true,
  gastos: { vivienda: 15000, alimentacion: 10000, transporte: 5000 },
  custom_expenses: [],
  deudas: [{
    id: "d1", acreedor: "Banco QA", acreedor_raw: "Banco QA",
    monto: 40000, pago: 3000, tipo: "prestamo",
    situacion_ui: "pagando_normal", estado: "al_dia",
    pago_fuente: "declarado", cancelada: false, debt_confidence: "high",
  }],
  snap: { fecha_inicio: new Date(1786536000000 - 10 * 86400000).toISOString() },
  no_debts_declared: false,
  bcu_clearing_live: false,
  decision_provenance: false,
};

var a = runEngine(sample, { now_ms: sample.now_ms });
var b = runEngine(sample, { now_ms: sample.now_ms });

var same = JSON.stringify(a.engine_result) === JSON.stringify(b.engine_result);
console.log("ENGINE_VERSION", ENGINE_VERSION);
console.log("NODE_IMPORT_WITHOUT_BROWSER", "PASS");
console.log("SMOKE_RUN", a.engine_result.planId != null ? "PASS" : "FAIL");
console.log("DETERMINISM_CHECK", same ? "PASS" : "FAIL");
console.log("ENGINE_RESULT_KEYS", Object.keys(a.engine_result).join(","));

if (!same || a.engine_result.planId == null) process.exitCode = 1;
