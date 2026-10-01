/**
 * CLASSIFIER-SHADOW-01 — fixtures of the new financial classifier (shadow).
 * Normative source: dev/backend-arch/CLASSIFIER-CONTRACT-CONSOLIDATED-01.md (§23 cases).
 *
 * Inputs use the EngineInput shape (same object the server receives and stores as
 * input_snapshot), so the legacy engine can run on exactly the same input.
 *
 * Expectation notation:
 *   verification_codes: "CODE" (person) or "CODE@<debt_index>" — exact list, catalog order.
 *   missing:            "fact" (person) or "fact@<debt_index>" — exact list.
 *   facts:              partial match on canonical_facts.
 */
"use strict";

function debt(over) {
  return Object.assign(
    {
      id: "debt_fixture",
      acreedor: "Banco QA",
      acreedor_raw: "Banco QA",
      tipo: "prestamo",
      situacion_ui: "pagando_normal",
      estado: "al_dia",
      monto: 50000,
      pago: 10000,
      pago_fuente: "declarado",
      cancelada: false,
    },
    over || {}
  );
}

function input(over) {
  return Object.assign(
    {
      ingreso: 100000,
      declared_ingreso: 100000,
      gastos: { vivienda: 30000, alimentacion: 20000 },
      custom_expenses: [],
      deudas: [],
      no_debts_declared: false,
      entry_context: "DEFAULT",
    },
    over || {}
  );
}

var ALL = [
  "CONTENCION",
  "REGULARIZACION",
  "REDUCCION_CARGA",
  "CONSOLIDACION",
  "MANTENIMIENTO_OPTIMIZACION",
];

var ALL_BUT_REGULARIZACION = ["CONTENCION", "REDUCCION_CARGA", "CONSOLIDACION", "MANTENIMIENTO_OPTIMIZACION"];

var FIXTURES = [
  // ---------------------------------------------------------------- classified
  {
    id: "C01_FLOW_NEGATIVE",
    group: "classified",
    description: "flujo negativo → Contención",
    input: input({ gastos: { vivienda: 60000, alimentacion: 30000 }, deudas: [debt({ pago: 20000 })] }),
    expect: {
      status: "classified", strategy: "CONTENCION", compatible: ["CONTENCION"],
      entry_reasons: ["FLOW_NEGATIVE"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: -10000, flow_sign: "negative", active_debt: true, active_mora: false, burden_status: "sustainable" },
    },
  },
  {
    id: "C02_FLOW_NEGATIVE_MORA_UNKNOWN",
    group: "classified",
    description: "flujo negativo (exacto) + mora unknown (no_seguro) → classified Contención + verificación",
    input: input({
      gastos: { vivienda: 60000, alimentacion: 30000 },
      deudas: [debt({ situacion_ui: "no_seguro", estado: "atraso_leve", pago: 20000 })],
    }),
    expect: {
      status: "classified", strategy: "CONTENCION", compatible: ["CONTENCION"],
      entry_reasons: ["FLOW_NEGATIVE"], verification_required: true,
      verification_codes: ["DEBT_SITUATION_UNSURE@0"], missing: [],
      facts: { canonical_flow: -10000, flow_sign: "negative", active_mora: "unknown" },
    },
  },
  {
    id: "PREC_FLOW_NEGATIVE_BOUND_MORA_UNKNOWN",
    group: "classified",
    description: "PRECEDENCIA: flow < 0 demostrado por cota + active_mora unknown → classified CONTENCION, strategy != null",
    input: input({
      gastos: { vivienda: 80000, alimentacion: 40000 },
      deudas: [debt({ situacion_ui: "mora_reclamo", estado: "mora", pago: 0, pago_fuente: "mora_sin_pago" })],
    }),
    expect: {
      status: "classified", strategy: "CONTENCION", compatible: ["CONTENCION"],
      entry_reasons: ["FLOW_NEGATIVE"], verification_required: true,
      verification_codes: ["DEBT_PAYMENT_UNKNOWN@0", "DEBT_PROBLEM_DECLARED_MORA_UNKNOWN@0"], missing: [],
      facts: { canonical_flow: "unknown", flow_sign: "negative", active_mora: "unknown", burden_status: "unknown" },
    },
  },
  {
    id: "C03_FLOW_ZERO_MORA_TRUE",
    group: "classified",
    description: "flujo cero + mora true (deje_pagar activa, pago KNOWN_ZERO) → Regularización",
    input: input({
      gastos: { vivienda: 60000, alimentacion: 40000 },
      deudas: [debt({ situacion_ui: "deje_pagar", estado: "atraso_grave", pago: 0, pago_fuente: "no_paga" })],
    }),
    expect: {
      status: "classified", strategy: "REGULARIZACION", compatible: ["REGULARIZACION"],
      entry_reasons: ["ACTIVE_MORA"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 0, flow_sign: "zero", active_mora: true, monthly_debt_payments: 0 },
    },
  },
  {
    id: "C04_FLOW_POSITIVE_MORA_TRUE",
    group: "classified",
    description: "flujo positivo + mora true → Regularización",
    input: input({
      deudas: [debt({ situacion_ui: "deje_pagar", estado: "atraso_grave", pago: 0, pago_fuente: "no_paga" })],
    }),
    expect: {
      status: "classified", strategy: "REGULARIZACION", compatible: ["REGULARIZACION"],
      entry_reasons: ["ACTIVE_MORA"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 50000, flow_sign: "positive", active_mora: true },
    },
  },
  {
    id: "C05_HIGH_BURDEN",
    group: "classified",
    description: "sin mora + deuda + burden 40% (> 30%) → Reducción de carga [HIGH_DEBT_BURDEN]",
    input: input({ gastos: { vivienda: 30000 }, deudas: [debt({ pago: 40000 })] }),
    expect: {
      status: "classified", strategy: "REDUCCION_CARGA", compatible: ["REDUCCION_CARGA"],
      entry_reasons: ["HIGH_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 30000, debt_burden_ratio: 0.4, burden_status: "high" },
    },
  },
  {
    id: "C06_FLOW_ZERO",
    group: "classified",
    description: "sin mora + deuda + flow = 0 (burden 20%) → Reducción de carga [FLOW_ZERO]",
    input: input({ gastos: { vivienda: 50000, alimentacion: 30000 }, deudas: [debt({ pago: 20000 })] }),
    expect: {
      status: "classified", strategy: "REDUCCION_CARGA", compatible: ["REDUCCION_CARGA"],
      entry_reasons: ["FLOW_ZERO"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 0, flow_sign: "zero", burden_status: "sustainable" },
    },
  },
  {
    id: "C06B_FLOW_ZERO_HIGH_BURDEN",
    group: "classified",
    description: "sin mora + deuda + flow = 0 + burden 40% → Reducción de carga [HIGH_DEBT_BURDEN, FLOW_ZERO]",
    input: input({ gastos: { vivienda: 40000, alimentacion: 20000 }, deudas: [debt({ pago: 40000 })] }),
    expect: {
      status: "classified", strategy: "REDUCCION_CARGA", compatible: ["REDUCCION_CARGA"],
      entry_reasons: ["HIGH_DEBT_BURDEN", "FLOW_ZERO"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 0, burden_status: "high" },
    },
  },
  {
    id: "C07_BURDEN_EXACTLY_30",
    group: "classified",
    description: "burden exactamente 30% + flow > 0 → sustainable → Consolidación",
    input: input({ gastos: { vivienda: 20000 }, deudas: [debt({ pago: 30000 })] }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
      facts: { debt_burden_ratio: 0.3, burden_status: "sustainable", canonical_flow: 50000 },
    },
  },
  {
    id: "C07B_BURDEN_EXACTLY_30_NON_ROUND",
    group: "classified",
    description: "burden 21000 / 70000 = 30% exacto → sustainable → Consolidación",
    input: input({ ingreso: 70000, declared_ingreso: 70000, gastos: { vivienda: 20000 }, deudas: [debt({ pago: 21000 })] }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
      facts: { debt_burden_ratio: 0.3, burden_status: "sustainable" },
    },
  },
  {
    id: "C07C_BURDEN_JUST_ABOVE_30",
    group: "classified",
    description: "burden 30.001% → high → Reducción de carga (sin redondeo ni epsilon)",
    input: input({ gastos: { vivienda: 20000 }, deudas: [debt({ pago: 30001 })] }),
    expect: {
      status: "classified", strategy: "REDUCCION_CARGA", compatible: ["REDUCCION_CARGA"],
      entry_reasons: ["HIGH_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
      facts: { debt_burden_ratio: 0.30001, burden_status: "high" },
    },
  },
  {
    id: "C08_SUSTAINABLE_BURDEN",
    group: "classified",
    description: "sin mora + deuda + burden 10% → Consolidación",
    input: input({ deudas: [debt()] }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 40000, debt_burden_ratio: 0.1, burden_status: "sustainable", active_debt: true, active_mora: false },
    },
  },
  {
    id: "C09_NO_DEBT_FLOW_ZERO",
    group: "classified",
    description: "sin deuda + flow = 0 → Mantenimiento / Optimización",
    input: input({ gastos: { vivienda: 60000, alimentacion: 40000 }, no_debts_declared: true }),
    expect: {
      status: "classified", strategy: "MANTENIMIENTO_OPTIMIZACION", compatible: ["MANTENIMIENTO_OPTIMIZACION"],
      entry_reasons: ["NO_ACTIVE_DEBT"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 0, flow_sign: "zero", active_debt: false, active_mora: false, debt_burden_ratio: "N/A", burden_status: "N/A" },
    },
  },
  {
    id: "C10_NO_DEBT_FLOW_POSITIVE",
    group: "classified",
    description: "sin deuda + flow > 0 → Mantenimiento / Optimización",
    input: input({ no_debts_declared: true }),
    expect: {
      status: "classified", strategy: "MANTENIMIENTO_OPTIMIZACION", compatible: ["MANTENIMIENTO_OPTIMIZACION"],
      entry_reasons: ["NO_ACTIVE_DEBT"], verification_required: false, verification_codes: [], missing: [],
      facts: { canonical_flow: 50000, flow_sign: "positive", active_debt: false, burden_status: "N/A" },
    },
  },

  // ---------------------------------------------------------------- incomplete
  {
    id: "I11_FLOW_NONNEG_MORA_UNKNOWN",
    group: "incomplete",
    description: "flow >= 0 exacto + active_mora unknown (no_seguro con pago) → incomplete",
    input: input({ deudas: [debt({ situacion_ui: "no_seguro", estado: "atraso_leve", pago_fuente: "no_declarado" })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["REGULARIZACION", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_SITUATION_UNSURE@0"], missing: ["active_mora@0"],
      facts: { canonical_flow: 40000, active_mora: "unknown", active_debt: true },
    },
  },
  {
    id: "I12_NO_MORA_ACTIVE_DEBT_UNKNOWN",
    group: "incomplete",
    description: "sin mora + active_debt unknown (saldo faltante, pagando_normal con pago declarado) → incomplete",
    input: input({ deudas: [debt({ monto: "", pago: 5000 })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ALL_BUT_REGULARIZACION,
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_BALANCE_UNKNOWN@0", "DEBT_PAYMENT_DECLARED_BALANCE_UNKNOWN@0"],
      missing: ["active_debt@0", "monthly_debt_payment@0"],
      facts: { active_debt: "unknown", active_mora: false, monthly_debt_payments: "unknown", flow_sign: "unknown", burden_status: "unknown" },
    },
  },
  {
    id: "I13_MORA_RECLAMO",
    group: "incomplete",
    description: "mora_reclamo con saldo > 0 → mora unknown + pago unknown → incomplete",
    input: input({ deudas: [debt({ situacion_ui: "mora_reclamo", estado: "mora", pago: 0, pago_fuente: "mora_sin_pago" })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["CONTENCION", "REGULARIZACION", "REDUCCION_CARGA", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_PAYMENT_UNKNOWN@0", "DEBT_PROBLEM_DECLARED_MORA_UNKNOWN@0"],
      missing: ["active_mora@0", "monthly_debt_payment@0"],
      facts: { active_mora: "unknown", active_debt: true },
    },
  },
  {
    id: "I14_NO_SEGURO_WITHOUT_PAYMENT",
    group: "incomplete",
    description: "no_seguro sin pago declarado → mora unknown + pago unknown → incomplete",
    input: input({ deudas: [debt({ situacion_ui: "no_seguro", estado: "atraso_leve", pago: "", pago_fuente: "no_declarado" })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["CONTENCION", "REGULARIZACION", "REDUCCION_CARGA", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_PAYMENT_UNKNOWN@0", "DEBT_SITUATION_UNSURE@0"],
      missing: ["active_mora@0", "monthly_debt_payment@0"],
    },
  },
  {
    id: "I15_EXPENSES_UNKNOWN_DISCRIMINATES",
    group: "incomplete",
    description: "gastos unknown (total 0) que discriminan → incomplete",
    input: input({ gastos: {}, deudas: [debt()] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["CONTENCION", "REDUCCION_CARGA", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["EXPENSES_UNKNOWN"], missing: ["monthly_expenses"],
      facts: { monthly_expenses: "unknown", canonical_flow: "unknown", burden_status: "sustainable" },
    },
  },
  {
    id: "I15B_EXPENSES_UNKNOWN_NOT_DISCRIMINATING",
    group: "classified",
    description: "gastos unknown pero la cota ya demuestra flow < 0 → classified Contención + verificación",
    input: input({ gastos: {}, deudas: [debt({ pago: 120000 })] }),
    expect: {
      status: "classified", strategy: "CONTENCION", compatible: ["CONTENCION"],
      entry_reasons: ["FLOW_NEGATIVE"], verification_required: true,
      verification_codes: ["EXPENSES_UNKNOWN"], missing: [],
      facts: { flow_sign: "negative", canonical_flow: "unknown" },
    },
  },
  {
    id: "I16_INCOME_UNKNOWN",
    group: "incomplete",
    description: "ingreso 0 (unknown, K10) → incomplete",
    input: input({ ingreso: 0, declared_ingreso: 0, deudas: [debt()] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["CONTENCION", "REDUCCION_CARGA", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["INCOME_UNKNOWN"], missing: ["monthly_income"],
      facts: { monthly_income: "unknown", debt_burden_ratio: "unknown", flow_sign: "unknown" },
    },
  },
  {
    id: "I16B_INCOME_PREFILL_UNCONFIRMED",
    group: "incomplete",
    description: "ingreso por URL sin modificar (K6) → unknown → incomplete",
    input: input({
      deudas: [debt()],
      entry_context: { field_provenance: { ingreso: { source: "url_prefill", user_modified: false } } },
    }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["CONTENCION", "REDUCCION_CARGA", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["INCOME_PREFILL_UNCONFIRMED"], missing: ["monthly_income"],
      facts: { monthly_income: "unknown" },
    },
  },
  {
    id: "I16C_INCOME_PREFILL_MODIFIED",
    group: "classified",
    description: "ingreso prefilled y modificado por el usuario → conocido → Consolidación",
    input: input({
      deudas: [debt()],
      entry_context: { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } },
    }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
      facts: { monthly_income: 100000 },
    },
  },
  {
    id: "I17_ATRASADO_PAGANDO",
    group: "incomplete",
    description: "atrasado_pagando: mora true, pago mensual unknown (solo último pago) → incomplete",
    input: input({
      deudas: [debt({ situacion_ui: "atrasado_pagando", estado: "atraso_leve", pago: 5000, ultimo_pago_declarado: 5000, atraso_tiempo: "menos_30" })],
    }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["CONTENCION", "REGULARIZACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_PAYMENT_ONLY_LAST_KNOWN@0"], missing: ["monthly_debt_payment@0"],
      facts: { active_mora: true, monthly_debt_payments: "unknown" },
      debt0: { last_payment_amount: 5000, payment_status: "UNKNOWN" },
    },
  },
  {
    id: "I18_BALANCE_ZERO_NOT_SETTLED",
    group: "incomplete",
    description: "saldo 0 no saldado + pago declarado → active_debt unknown, pago unknown",
    input: input({ deudas: [debt({ monto: 0, pago: 5000 })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ALL_BUT_REGULARIZACION,
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_BALANCE_ZERO_NOT_SETTLED@0", "DEBT_PAYMENT_DECLARED_BALANCE_ZERO@0"],
      missing: ["active_debt@0", "monthly_debt_payment@0"],
      facts: { active_debt: "unknown", active_mora: false },
      debt0: { declared_payment_amount: 5000, payment_status: "UNKNOWN" },
    },
  },
  {
    id: "I18B_BALANCE_ZERO_DEJE_PAGAR",
    group: "incomplete",
    description: "deje_pagar con saldo 0 no saldado (CONTRACT-03 §3.2, §4)",
    input: input({ deudas: [debt({ monto: 0, situacion_ui: "deje_pagar", estado: "atraso_grave", pago: 0, pago_fuente: "no_paga" })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ALL,
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_BALANCE_ZERO_NOT_SETTLED@0", "DEBT_MORA_STATE_BALANCE_ZERO@0", "DEBT_PAYMENT_DECLARED_BALANCE_ZERO@0"],
      missing: ["active_debt@0", "active_mora@0", "monthly_debt_payment@0"],
      facts: { active_debt: "unknown", active_mora: "unknown" },
      debt0: { payment_status: "UNKNOWN" },
    },
  },
  {
    id: "I19_BALANCE_MISSING_ATRASADO",
    group: "incomplete",
    description: "P-01: saldo faltante + atrasado_pagando → active_debt unknown, active_mora unknown",
    input: input({
      deudas: [debt({ monto: null, situacion_ui: "atrasado_pagando", estado: "atraso_leve", pago: 5000, ultimo_pago_declarado: 5000 })],
    }),
    expect: {
      status: "incomplete", strategy: null, compatible: ALL,
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_PAYMENT_ONLY_LAST_KNOWN@0", "DEBT_BALANCE_UNKNOWN@0", "DEBT_MORA_STATE_BALANCE_UNKNOWN@0"],
      missing: ["active_debt@0", "active_mora@0", "monthly_debt_payment@0"],
      facts: { active_debt: "unknown", active_mora: "unknown" },
      debt0: { last_payment_amount: 5000, payment_status: "UNKNOWN", declared_situation: "atrasado_pagando" },
    },
  },
  {
    id: "I20_BALANCE_MISSING_DEJE_PAGAR",
    group: "incomplete",
    description: "P-01: saldo faltante + deje_pagar → active_debt, active_mora y pago unknown (nunca 0)",
    input: input({
      deudas: [debt({ monto: "", situacion_ui: "deje_pagar", estado: "atraso_grave", pago: 0, pago_fuente: "no_paga" })],
    }),
    expect: {
      status: "incomplete", strategy: null, compatible: ALL,
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_BALANCE_UNKNOWN@0", "DEBT_PAYMENT_DECLARED_BALANCE_UNKNOWN@0", "DEBT_MORA_STATE_BALANCE_UNKNOWN@0"],
      missing: ["active_debt@0", "active_mora@0", "monthly_debt_payment@0"],
      facts: { active_debt: "unknown", active_mora: "unknown", monthly_debt_payments: "unknown" },
      debt0: { payment_status: "UNKNOWN", declared_situation: "deje_pagar" },
    },
  },

  // ---------------------------------------------------------------- multi-debt
  {
    id: "M1_ACTIVE_DEBT_FALSE_PLUS_UNKNOWN",
    group: "multi_debt",
    description: "active_debt: pagada (false) + saldo 0 no saldado (unknown) → unknown",
    input: input({ deudas: [debt({ cancelada: true }), debt({ monto: 0, pago: 5000 })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ALL_BUT_REGULARIZACION,
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_BALANCE_ZERO_NOT_SETTLED@1", "DEBT_PAYMENT_DECLARED_BALANCE_ZERO@1"],
      missing: ["active_debt@1", "monthly_debt_payment@1"],
      facts: { active_debt: "unknown" },
    },
  },
  {
    id: "M2_ACTIVE_DEBT_TRUE_PLUS_UNKNOWN",
    group: "multi_debt",
    description: "active_debt: activa (true) + saldo 0 no saldado (unknown) → true",
    input: input({ deudas: [debt(), debt({ monto: 0, pago: 5000 })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["CONTENCION", "REDUCCION_CARGA", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_BALANCE_ZERO_NOT_SETTLED@1", "DEBT_PAYMENT_DECLARED_BALANCE_ZERO@1"],
      missing: ["active_debt@1", "monthly_debt_payment@1"],
      facts: { active_debt: true, burden_status: "unknown" },
    },
  },
  {
    id: "M3_ACTIVE_MORA_FALSE_PLUS_UNKNOWN",
    group: "multi_debt",
    description: "active_mora: pagando_normal (false) + no_seguro (unknown) → unknown",
    input: input({ deudas: [debt(), debt({ situacion_ui: "no_seguro", estado: "atraso_leve", monto: 30000, pago: 5000 })] }),
    expect: {
      status: "incomplete", strategy: null, compatible: ["REGULARIZACION", "CONSOLIDACION"],
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_SITUATION_UNSURE@1"], missing: ["active_mora@1"],
      facts: { active_mora: "unknown", canonical_flow: 35000 },
    },
  },
  {
    id: "M4_ACTIVE_MORA_TRUE_PLUS_UNKNOWN",
    group: "multi_debt",
    description: "active_mora: deje_pagar activa (true) + no_seguro (unknown) → true; incertidumbre eclipsada conservada",
    input: input({
      deudas: [
        debt({ situacion_ui: "deje_pagar", estado: "atraso_grave", pago: 0, pago_fuente: "no_paga" }),
        debt({ situacion_ui: "no_seguro", estado: "atraso_leve", monto: 30000, pago: 5000 }),
      ],
    }),
    expect: {
      status: "classified", strategy: "REGULARIZACION", compatible: ["REGULARIZACION"],
      entry_reasons: ["ACTIVE_MORA"], verification_required: true,
      verification_codes: ["DEBT_SITUATION_UNSURE@1"], missing: [],
      facts: { active_mora: true },
    },
  },

  // ---------------------------------------------------------------- debt set
  {
    id: "S1_DEBT_SET_INCOMPLETE",
    group: "debt_set",
    description: "paso de deudas no completado (sin deudas, sin no_debts_declared) → incomplete",
    input: input({ deudas: [], no_debts_declared: false }),
    expect: {
      status: "incomplete", strategy: null, compatible: ALL,
      entry_reasons: [], verification_required: true,
      verification_codes: ["DEBT_SET_INCOMPLETE"], missing: ["debt_set_complete"],
      facts: { active_debt: "unknown", active_mora: "unknown", debt_set_complete: false },
    },
  },
  {
    id: "S2_NO_DEBTS_DECLARED_WITH_DEBTS",
    group: "debt_set",
    description: "no_debts_declared + deuda activa → active_debt true + NO_DEBTS_DECLARED_WITH_DEBTS",
    input: input({ no_debts_declared: true, deudas: [debt()] }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: true,
      verification_codes: ["NO_DEBTS_DECLARED_WITH_DEBTS"], missing: [],
      facts: { active_debt: true },
    },
  },

  // ---------------------------------------------------------------- no authority (§12–§14, §16.2)
  {
    id: "N1_INFORMAL_DEBT",
    group: "no_authority",
    sameAs: "C08_SUSTAINABLE_BURDEN",
    description: "deuda informal, resto idéntico a C08 → misma salida",
    input: input({ deudas: [debt({ tipo: "informal", acreedor: "Familiar", acreedor_raw: "prestamo de mi familiar" })] }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
    },
  },
  {
    id: "N2_EXTREME_STOCK",
    group: "no_authority",
    sameAs: "C08_SUSTAINABLE_BURDEN",
    description: "saldo 24× el ingreso, resto idéntico a C08 → misma salida, sin verificación",
    input: input({ deudas: [debt({ monto: 2400000 })] }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
    },
  },
  {
    id: "N3_SURVEY_P6_P7_P9",
    group: "no_authority",
    sameAs: "C08_SUSTAINABLE_BURDEN",
    description: "encuesta con P6/P7/P9 = D, intent crédito, resto idéntico a C08 → misma salida",
    input: input({
      deudas: [debt()],
      tiene_encuesta: true,
      respuestas: { p1: "D", p2: "D", p3: "D", p4: "D", p5: "D", p6: "D", p7: "D", p8: "D", p9: "D", p10: "D" },
      user_intent: "credito",
    }),
    expect: {
      status: "classified", strategy: "CONSOLIDACION", compatible: ["CONSOLIDACION"],
      entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"], verification_required: false, verification_codes: [], missing: [],
    },
  },

  // ---------------------------------------------------------------- legacy mapping (P-18 observability)
  {
    id: "L1_LEGACY_ESTADO_WITHOUT_SITUACION_UI",
    group: "legacy",
    description: "deuda sin situacion_ui con estado atraso_leve → mapeo legacy cerrado (mora true), registrado en provenance",
    input: input({ deudas: [debt({ situacion_ui: undefined, estado: "atraso_leve", pago: 5000 })] }),
    expect: {
      status: "classified", strategy: "REGULARIZACION", compatible: ["REGULARIZACION"],
      entry_reasons: ["ACTIVE_MORA"], verification_required: false, verification_codes: [], missing: [],
      facts: { active_mora: true },
      legacy_mapped: [0],
    },
  },
];

module.exports = { FIXTURES: FIXTURES, input: input, debt: debt };
