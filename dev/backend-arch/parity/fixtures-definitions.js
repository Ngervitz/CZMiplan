/**
 * MOTOR-PARITY-00 — fixture input definitions (synthetic only).
 * No expected outputs here; capture-oracle.js freezes them from CURRENT engine.
 */
"use strict";

var FIXED_NOW_MS = Date.parse("2026-08-12T12:00:00.000Z");
var SNAP_START_MS = FIXED_NOW_MS - (10 * 86400000); // diasRec = 10

var GOOD_SURVEY = {
  p1: "A", p2: "A", p3: "A", p4: "A", p5: "A",
  p6: "A", p7: "A", p8: "A", p9: "A", p10: "A",
};

var HARD_C_SURVEY = Object.assign({}, GOOD_SURVEY, { p6: "D", p8: "D", p10: "D" });

function debt(opts) {
  opts = opts || {};
  return {
    id: opts.id || ("deuda_" + (opts.monto || 0)),
    acreedor: opts.acreedor || "Banco QA",
    acreedor_raw: opts.acreedor || "Banco QA",
    monto: Number(opts.monto != null ? opts.monto : 0),
    pago: Number(opts.pago != null ? opts.pago : 0),
    tipo: opts.tipo || "prestamo",
    situacion_ui: opts.situacion_ui || "pagando_normal",
    estado: opts.estado || "al_dia",
    pago_fuente: opts.pago_fuente || "declarado",
    cancelada: !!opts.cancelada,
    debt_confidence: opts.debt_confidence || "high",
  };
}

function basePerson(over) {
  return Object.assign({
    declared_nombre: "QA Synthetic",
    declared_email: "qa@example.test",
    declared_laboral: "relacion_dependencia",
    declared_ingreso: 100000,
    user_intent: null,
    entry_context: "DEFAULT",
  }, over || {});
}

function allParityFixtures() {
  var snap = {
    fecha_inicio: new Date(SNAP_START_MS).toISOString(),
    score_reset: null,
    nivel: null,
    plan_id: null,
    saldo_inicial: null,
  };

  var list = [];

  list.push({
    id: "P_HEALTHY_LOW_RATIO",
    tags: ["plan", "stage", "coherence", "ratio_0_15", "acciones", "next_step", "narrative", "MC-1", "MC-2", "MC-3", "MC-4"],
    notes: "Low payment ratio; coherence healthy 0.15 vs stage 0.20 divergence zone neighbor.",
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 15000, alimentacion: 10000, transporte: 5000 },
      custom_expenses: [],
      deudas: [debt({ monto: 40000, pago: 3000, tipo: "prestamo" })],
      snap: snap,
      no_debts_declared: false,
      user_intent: null,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_RATIO_BETWEEN_15_20",
    tags: ["DUP-15-20", "coherence", "stage", "threshold"],
    notes: "Target payment ratio in (0.15, 0.20] if motor produces it.",
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      custom_expenses: [],
      deudas: [debt({ monto: 80000, pago: 18000, tipo: "prestamo" })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_RATIO_AROUND_35",
    tags: ["DUP-35", "threshold", "plan", "scoring"],
    notes: "Payment ratio near 0.35 plan/scoring band.",
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      custom_expenses: [],
      deudas: [debt({ monto: 200000, pago: 35000, tipo: "tarjeta" })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_FLUJO_NEGATIVO",
    tags: ["flujo", "stage", "acciones", "next_step", "UX1D2", "B7_S1"],
    notes: "Negative free cash; UX1D2/B7 recorded as FE post-layer, not ENGINE_CORE.",
    input: Object.assign(basePerson({ declared_ingreso: 40000 }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 40000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 25000, alimentacion: 15000, otros: 10000 },
      custom_expenses: [],
      deudas: [
        debt({ monto: 150000, pago: 20000, tipo: "tarjeta", situacion_ui: "pagando_normal" }),
      ],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_MORA_ACTIVA",
    tags: ["mora", "stage", "plan", "acciones"],
    input: Object.assign(basePerson({ declared_ingreso: 80000 }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 80000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 12000 },
      custom_expenses: [],
      deudas: [
        debt({
          monto: 120000, pago: 0, tipo: "mora",
          situacion_ui: "mora_reclamo", estado: "mora",
        }),
      ],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_DTI_ALTO",
    tags: ["dti", "stage", "next_step", "threshold"],
    input: Object.assign(basePerson({ declared_ingreso: 50000 }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 50000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 10000, alimentacion: 8000 },
      custom_expenses: [],
      deudas: [debt({ monto: 400000, pago: 8000, tipo: "prestamo" })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_SIN_DEUDAS",
    tags: ["plan", "stage", "coherence", "next_step"],
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      custom_expenses: [],
      deudas: [],
      snap: snap,
      no_debts_declared: true,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_INCOMPLETE_PROFILE",
    tags: ["completeness", "MC-5", "stage", "CLARIDAD"],
    notes: "D4: recompute completeness from raw fields; ignore client_completeness_flags.",
    input: Object.assign(basePerson({
      declared_nombre: "",
      declared_email: "",
      declared_laboral: "",
      declared_ingreso: null,
    }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 0,
      laboral: "",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: {},
      custom_expenses: [],
      deudas: [],
      snap: snap,
      no_debts_declared: false,
      client_completeness_flags: {
        financial_profile_complete: true,
        financial_income_complete: true,
        financial_debts_complete: true,
        financial_expenses_complete: true,
      },
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_ENCUESTA_HARD_C",
    tags: ["scoring", "encuesta", "bands_21_13"],
    input: Object.assign(basePerson({ declared_ingreso: 90000 }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 90000,
      laboral: "relacion_dependencia",
      respuestas: HARD_C_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 12000 },
      custom_expenses: [],
      deudas: [debt({ monto: 50000, pago: 4000 })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_SIN_ENCUESTA",
    tags: ["MC-2", "encuesta", "TIENE_ENCUESTA"],
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: {},
      tiene_encuesta: false,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      custom_expenses: [],
      deudas: [debt({ monto: 60000, pago: 5000 })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_CUSTOM_EXPENSES",
    tags: ["MC-3", "gastos", "scoring"],
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 10000 },
      custom_expenses: [
        { id: "cx1", label: "QA Gym", amount: 5000, included: true },
      ],
      deudas: [debt({ monto: 70000, pago: 6000 })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_INTENT_CREDITO",
    tags: ["narrative", "user_intent"],
    input: Object.assign(basePerson({
      user_intent: "CREDITO",
      declared_ingreso: 110000,
    }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 110000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 14000 },
      custom_expenses: [],
      deudas: [debt({ monto: 60000, pago: 5000 })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_PROVENANCE_ON",
    tags: ["MC-9", "provenance", "FS", "NS", "ACT"],
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      custom_expenses: [],
      deudas: [debt({ monto: 90000, pago: 7000 })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: true,
    }),
  });

  list.push({
    id: "P_BCU_LIVE_OFF",
    tags: ["MC-10", "bcu"],
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      custom_expenses: [],
      deudas: [debt({ monto: 80000, pago: 6000 })],
      snap: Object.assign({}, snap, { bcu_clearing_status: null }),
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_BCU_LIVE_ON_NO_CRITICO",
    tags: ["MC-10", "bcu"],
    notes: "Server-owned live flag true without critico signal — AS-IS guardrail path.",
    input: Object.assign(basePerson(), {
      now_ms: FIXED_NOW_MS,
      ingreso: 100000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      custom_expenses: [],
      deudas: [debt({ monto: 80000, pago: 6000 })],
      snap: Object.assign({}, snap, { bcu_clearing_status: "ok" }),
      no_debts_declared: false,
      bcu_clearing_live: true,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_MONOTRIBUTISTA_DEUDAS",
    tags: ["B7_S3", "UX1D2", "acciones", "laboral"],
    input: Object.assign(basePerson({
      declared_laboral: "monotributista",
      declared_ingreso: 70000,
    }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 70000,
      laboral: "monotributista",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 22000, alimentacion: 18000, otros: 15000 },
      custom_expenses: [],
      deudas: [debt({ monto: 100000, pago: 15000, tipo: "financiera" })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_MUCHAS_DEUDAS",
    tags: ["partner", "acciones", "scoring"],
    input: Object.assign(basePerson({ declared_ingreso: 120000 }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 120000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 25000, alimentacion: 20000 },
      custom_expenses: [],
      deudas: [
        debt({ id: "d1", monto: 50000, pago: 4000, tipo: "tarjeta" }),
        debt({ id: "d2", monto: 40000, pago: 3000, tipo: "financiera" }),
        debt({ id: "d3", monto: 30000, pago: 2500, tipo: "prestamo" }),
        debt({ id: "d4", monto: 20000, pago: 2000, tipo: "cooperativa" }),
      ],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  list.push({
    id: "P_SCORE_BAND_MILD",
    tags: ["bands_21_13", "scoring"],
    input: Object.assign(basePerson({ declared_ingreso: 150000 }), {
      now_ms: FIXED_NOW_MS,
      ingreso: 150000,
      laboral: "relacion_dependencia",
      respuestas: GOOD_SURVEY,
      tiene_encuesta: true,
      gastos: { vivienda: 25000, alimentacion: 20000, transporte: 10000 },
      custom_expenses: [],
      deudas: [debt({ monto: 30000, pago: 2000, tipo: "prestamo" })],
      snap: snap,
      no_debts_declared: false,
      bcu_clearing_live: false,
      decision_provenance: false,
    }),
  });

  return list;
}

module.exports = {
  FIXED_NOW_MS: FIXED_NOW_MS,
  SNAP_START_MS: SNAP_START_MS,
  GOOD_SURVEY: GOOD_SURVEY,
  allParityFixtures: allParityFixtures,
};
