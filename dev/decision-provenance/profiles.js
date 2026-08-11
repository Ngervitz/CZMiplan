/**
 * Synthetic profile corpus for DECISION-PROVENANCE baseline + Layer A FS.
 * No real PII — qa@example.test / QA Synthetic only.
 */
"use strict";

var h = require("./harness");
var debtRow = h.debtRow;

/**
 * Layer A FS cases — mix of motor-backed and direct-diag for isolation.
 * kind: "motor" | "direct"
 */
function layerAFsProfiles() {
  var list = [];

  // --- Insufficient (4) ---
  list.push({
    id: "FS_A_INSUFF_INCOME",
    kind: "motor",
    expected_stage: "CLARIDAD",
    expected_reason: "FS_INSUFF_INCOME",
    opts: {
      ingreso: 0,
      declared_ingreso: 0,
      st: { financial_income_complete: false, declared_ingreso: null },
    },
  });
  list.push({
    id: "FS_A_INSUFF_INPUTS",
    kind: "motor",
    expected_stage: "CLARIDAD",
    expected_reason: "FS_INSUFF_INPUTS",
    opts: {
      st: {
        financial_profile_complete: false,
        financial_income_complete: false,
        financial_debts_complete: false,
        financial_expenses_complete: false,
      },
    },
  });
  list.push({
    id: "FS_A_INSUFF_FLUJO",
    kind: "direct",
    expected_stage: "CLARIDAD",
    expected_reason: "FS_INSUFF_FLUJO",
    diag: {
      fin: { flujoLibre: null, ratio: 0, totalDeuda: 0, totalPago: 0, dti_ratio: 0, ingreso: 100000 },
      interpretacion_v2: { confidence_level: "high" },
    },
    st: h.completeSt({ no_debts_declared: true }),
  });
  list.push({
    id: "FS_A_INSUFF_ESCAPE_TO_OPT",
    kind: "motor",
    expected_stage: "OPTIMIZACION",
    expected_reason: "FS_OPT_DEFAULT",
    opts: {
      ingreso: 100000,
      gastos: { vivienda: 20000, alimentacion: 15000 },
      deudas: [],
      st: { no_debts_declared: true },
    },
  });

  // --- Recovery first-match 2a–2h (8) ---
  list.push({
    id: "FS_A_REC_FLUJO_NEG",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_FLUJO_NEG",
    diag: {
      fin: {
        flujoLibre: -5000, ratio: 0.1, cantMoras: 0, totalDeuda: 0, totalPago: 0,
        dti_ratio: 0, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "medio" },
    },
    st: h.completeSt({ no_debts_declared: true }),
  });
  list.push({
    id: "FS_A_REC_CANT_MORAS",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_CANT_MORAS",
    diag: {
      fin: {
        flujoLibre: 10000, ratio: 0.1, cantMoras: 2, totalDeuda: 100000, totalPago: 5000,
        dti_ratio: 1, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "medio" },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_REC_DIAG_MORA",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_DIAG_MORA",
    diag: {
      mora_activa: true,
      fin: {
        flujoLibre: 10000, ratio: 0.1, cantMoras: 0, totalDeuda: 50000, totalPago: 3000,
        dti_ratio: 0.5, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "medio" },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_REC_IV2_MORA",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_IV2_MORA",
    diag: {
      fin: {
        flujoLibre: 10000, ratio: 0.1, cantMoras: 0, totalDeuda: 50000, totalPago: 3000,
        dti_ratio: 0.5, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: {
        confidence_level: "high",
        severity_level: "medio",
        has_mora_or_deje_pagar: true,
      },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_REC_BEHAV_MORA",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_BEHAV_MORA",
    diag: {
      fin: {
        flujoLibre: 10000, ratio: 0.1, cantMoras: 0, totalDeuda: 50000, totalPago: 3000,
        dti_ratio: 0.5, ingreso: 100000,
        behavioral: { tiene_mora_declarada: true },
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "medio" },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_REC_RATIO_ALTO",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_RATIO_ALTO",
    diag: {
      fin: {
        flujoLibre: 10000, ratio: 0.35, cantMoras: 0, totalDeuda: 200000, totalPago: 35000,
        dti_ratio: 2, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "medio" },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_REC_SEV_CRIT",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_SEV_CRIT",
    diag: {
      fin: {
        flujoLibre: 20000, ratio: 0.22, cantMoras: 0, totalDeuda: 100000, totalPago: 22000,
        dti_ratio: 1, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "critico" },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_REC_SEV_ALTO",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_SEV_ALTO",
    diag: {
      fin: {
        flujoLibre: 20000, ratio: 0.22, cantMoras: 0, totalDeuda: 100000, totalPago: 22000,
        dti_ratio: 1, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "alto" },
    },
    st: h.completeSt(),
  });

  // --- Threshold ratio 0.35 (3) ---
  [0.349, 0.35, 0.351].forEach(function(r) {
    list.push({
      id: "FS_A_THR_RATIO_035_" + String(r).replace(".", "_"),
      kind: "direct",
      expected_stage: r >= 0.35 ? "RECUPERACION" : "ESTABILIZACION",
      expected_reason: r >= 0.35 ? "FS_REC_RATIO_ALTO" : "FS_ESTAB_DEUDA",
      diag: {
        fin: {
          flujoLibre: 15000, ratio: r, cantMoras: 0, totalDeuda: 100000, totalPago: Math.round(100000 * r),
          dti_ratio: 1, ingreso: 100000, behavioral: {},
        },
        interpretacion_v2: { confidence_level: "high", severity_level: "medio" },
      },
      st: h.completeSt(),
    });
  });

  // --- Threshold ratio 0.20 under severity alto (3) ---
  [0.19, 0.20, 0.21].forEach(function(r) {
    list.push({
      id: "FS_A_THR_SEV_ALTO_020_" + String(r).replace(".", "_"),
      kind: "direct",
      expected_stage: r >= 0.20 ? "RECUPERACION" : "ESTABILIZACION",
      expected_reason: r >= 0.20 ? "FS_REC_SEV_ALTO" : "FS_ESTAB_DEUDA",
      diag: {
        fin: {
          flujoLibre: 20000, ratio: r, cantMoras: 0, totalDeuda: 80000, totalPago: Math.round(100000 * r),
          dti_ratio: 0.8, ingreso: 100000, behavioral: {},
        },
        interpretacion_v2: { confidence_level: "high", severity_level: "alto" },
      },
      st: h.completeSt(),
    });
  });

  // --- Threshold dti 0.5 (3) — no recovery pressure ---
  [0.49, 0.5, 0.51].forEach(function(dti) {
    list.push({
      id: "FS_A_THR_DTI_05_" + String(dti).replace(".", "_"),
      kind: "direct",
      expected_stage: dti >= 0.5 ? "ESTABILIZACION" : "OPTIMIZACION",
      expected_reason: dti >= 0.5 ? "FS_ESTAB_DTI" : "FS_OPT_DEFAULT",
      diag: {
        fin: {
          flujoLibre: 40000, ratio: 0.05, cantMoras: 0, totalDeuda: 0, totalPago: 0,
          dti_ratio: dti, ingreso: 100000, behavioral: {},
        },
        interpretacion_v2: { confidence_level: "high", severity_level: "bajo" },
      },
      st: h.completeSt({ no_debts_declared: true }),
    });
  });

  // --- Precedence multi-true (5) ---
  list.push({
    id: "FS_A_PREC_FLUJO_AND_MORA",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_FLUJO_NEG",
    diag: {
      fin: {
        flujoLibre: -1000, ratio: 0.4, cantMoras: 3, totalDeuda: 200000, totalPago: 40000,
        dti_ratio: 2, ingreso: 100000, behavioral: { tiene_mora_declarada: true },
      },
      interpretacion_v2: {
        confidence_level: "high",
        severity_level: "critico",
        has_mora_or_deje_pagar: true,
      },
      mora_activa: true,
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_PREC_REC_BEATS_LIAB",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_RATIO_ALTO",
    diag: {
      fin: {
        flujoLibre: 5000, ratio: 0.4, cantMoras: 0, totalDeuda: 300000, totalPago: 40000,
        dti_ratio: 3, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "medio" },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_PREC_INSUFF_BEATS_REC",
    kind: "direct",
    expected_stage: "CLARIDAD",
    expected_reason: "FS_INSUFF_INCOME",
    diag: {
      fin: {
        flujoLibre: -5000, ratio: 0.5, cantMoras: 2, totalDeuda: 100000, totalPago: 20000,
        dti_ratio: 1, ingreso: 0, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "critico" },
    },
    st: h.completeSt({ declared_ingreso: null, financial_income_complete: false }),
  });
  list.push({
    id: "FS_A_PREC_REC_BEATS_LOW_CONF",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_FLUJO_NEG",
    note: "BUG-FS-CLARITY-LOW-MISS probe: low conf + missing_payment + flujo<0 → REC not CLARIDAD",
    diag: {
      missing_payment_information: true,
      fin: {
        flujoLibre: -2000, ratio: 0.1, cantMoras: 0, totalDeuda: 0, totalPago: 0,
        dti_ratio: 0, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: {
        confidence_level: "low",
        missing_payment_information: true,
        interpretacion_parcial: true,
        severity_level: "medio",
      },
    },
    st: h.completeSt({ no_debts_declared: true }),
  });
  list.push({
    id: "FS_A_PREC_MORA_BEATS_RATIO",
    kind: "direct",
    expected_stage: "RECUPERACION",
    expected_reason: "FS_REC_CANT_MORAS",
    diag: {
      fin: {
        flujoLibre: 10000, ratio: 0.5, cantMoras: 1, totalDeuda: 200000, totalPago: 50000,
        dti_ratio: 2, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "alto" },
    },
    st: h.completeSt(),
  });

  // --- Estab / Opt (3) ---
  list.push({
    id: "FS_A_ESTAB_DEUDA",
    kind: "direct",
    expected_stage: "ESTABILIZACION",
    expected_reason: "FS_ESTAB_DEUDA",
    diag: {
      fin: {
        flujoLibre: 30000, ratio: 0.1, cantMoras: 0, totalDeuda: 80000, totalPago: 0,
        dti_ratio: 0.8, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "bajo" },
    },
    st: h.completeSt(),
  });
  list.push({
    id: "FS_A_ESTAB_PAGO",
    kind: "direct",
    expected_stage: "ESTABILIZACION",
    expected_reason: "FS_ESTAB_PAGO",
    diag: {
      fin: {
        flujoLibre: 30000, ratio: 0.08, cantMoras: 0, totalDeuda: 0, totalPago: 5000,
        dti_ratio: 0, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "bajo" },
    },
    st: h.completeSt({ no_debts_declared: true }),
  });
  list.push({
    id: "FS_A_OPT_CLEAN",
    kind: "direct",
    expected_stage: "OPTIMIZACION",
    expected_reason: "FS_OPT_DEFAULT",
    diag: {
      fin: {
        flujoLibre: 50000, ratio: 0, cantMoras: 0, totalDeuda: 0, totalPago: 0,
        dti_ratio: 0, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: { confidence_level: "high", severity_level: "bajo" },
    },
    st: h.completeSt({ no_debts_declared: true }),
  });

  // --- Clarity low parcial (2) ---
  list.push({
    id: "FS_A_CLARITY_LOW_PARCIAL",
    kind: "direct",
    expected_stage: "CLARIDAD",
    expected_reason: "FS_CLARITY_LOW_PARCIAL",
    diag: {
      fin: {
        flujoLibre: 20000, ratio: 0.05, cantMoras: 0, totalDeuda: 0, totalPago: 0,
        dti_ratio: 0, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: {
        confidence_level: "low",
        interpretacion_parcial: true,
        severity_level: "bajo",
      },
    },
    st: h.completeSt({ no_debts_declared: false, deudas: [] }),
  });
  list.push({
    id: "FS_A_CLARITY_LOW_PARCIAL_NODEBTS_ESCAPE",
    kind: "direct",
    expected_stage: "OPTIMIZACION",
    expected_reason: "FS_OPT_DEFAULT",
    diag: {
      fin: {
        flujoLibre: 20000, ratio: 0.05, cantMoras: 0, totalDeuda: 0, totalPago: 0,
        dti_ratio: 0, ingreso: 100000, behavioral: {},
      },
      interpretacion_v2: {
        confidence_level: "low",
        interpretacion_parcial: true,
        severity_level: "bajo",
      },
    },
    st: h.completeSt({ no_debts_declared: true }),
  });

  return list;
}

/** Broader corpus for global 3-surface photo (Layer B sample). */
function layerBSampleProfiles() {
  return [
    {
      id: "B_HEALTHY_NO_DEBT",
      kind: "motor",
      opts: {
        ingreso: 120000,
        gastos: { vivienda: 22000, alimentacion: 16000 },
        deudas: [],
        st: { no_debts_declared: true },
      },
    },
    {
      id: "B_LOW_DEBT_STABLE",
      kind: "motor",
      opts: {
        ingreso: 100000,
        gastos: { vivienda: 20000, alimentacion: 15000 },
        deudas: [debtRow({ monto: 80000, pago: 8000 })],
      },
    },
    {
      id: "B_NEG_FLOW",
      kind: "motor",
      opts: {
        ingreso: 80000,
        gastos: { vivienda: 35000, alimentacion: 20000 },
        deudas: [debtRow({ monto: 300000, pago: 30000 })],
      },
    },
    {
      id: "B_HIGH_RATIO",
      kind: "motor",
      opts: {
        ingreso: 80000,
        gastos: { vivienda: 10000, alimentacion: 8000 },
        deudas: [debtRow({ monto: 400000, pago: 30000 })],
      },
    },
    {
      id: "B_MORA",
      kind: "motor",
      opts: {
        ingreso: 100000,
        gastos: { vivienda: 20000, alimentacion: 15000 },
        deudas: [debtRow({
          monto: 200000,
          pago: 5000,
          situacion_ui: "mora_reclamo",
          estado: "mora",
        })],
      },
    },
    {
      id: "B_LARGE_STOCK",
      kind: "motor",
      opts: {
        ingreso: 100000,
        gastos: { vivienda: 20000, alimentacion: 15000 },
        deudas: [debtRow({ monto: 1500000, pago: 12000 })],
      },
    },
    {
      id: "B_INCOMPLETE_EXPENSES",
      kind: "motor",
      opts: {
        ingreso: 90000,
        gastos: {},
        deudas: [debtRow({ monto: 100000, pago: 10000 })],
        st: { financial_expenses_complete: false, gastos: {} },
      },
    },
    {
      id: "B_MULTI_DEBT",
      kind: "motor",
      opts: {
        ingreso: 95000,
        gastos: { vivienda: 18000, alimentacion: 12000, transporte: 8000 },
        deudas: [
          debtRow({ monto: 150000, pago: 12000, acreedor: "Banco A" }),
          debtRow({
            monto: 80000, pago: 9000, acreedor: "Tarjeta B", tipo: "tarjeta",
            situacion_ui: "atrasado_pagando",
          }),
          debtRow({
            monto: 40000, pago: 5000, acreedor: "Financiera C", tipo: "financiera",
          }),
        ],
      },
    },
    {
      id: "B_INTENT_CREDITO",
      kind: "motor",
      opts: {
        ingreso: 110000,
        gastos: { vivienda: 20000, alimentacion: 14000 },
        deudas: [debtRow({ monto: 60000, pago: 5000 })],
        st: { user_intent: "CREDITO" },
      },
    },
    {
      id: "B_ZERO_ACTIVE_HISTORY",
      kind: "motor",
      opts: {
        ingreso: 100000,
        gastos: { vivienda: 20000, alimentacion: 15000 },
        deudas: [debtRow({
          monto: 0, pago: 0, situacion_ui: "pagando_normal", estado: "cancelada",
        })],
        st: { no_debts_declared: false },
      },
    },
  ];
}

function allBaselineProfiles() {
  return layerAFsProfiles().concat(layerBSampleProfiles());
}

module.exports = {
  layerAFsProfiles: layerAFsProfiles,
  layerBSampleProfiles: layerBSampleProfiles,
  allBaselineProfiles: allBaselineProfiles,
};
