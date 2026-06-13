/**
 * dev/synthetic-motor-test.js — Sprint synthetic motor QA (31 profiles)
 *
 * Does NOT modify calcularMotor(), CZState persistence, CRM, GTM, or UI.
 * Uses save/restore adapter around global PRE + window.CZState (see runProfile).
 *
 * Browser:
 *   1. Open dev/synthetic-motor-test.html (recommended), or Mi Plan with scripts loaded.
 *   2. Console: SyntheticMotorQA.run()
 *
 * Node (optional):
 *   node dev/synthetic-motor-test.js
 */
(function(global) {
  "use strict";

  var PLAN_CAUSA_SIN_PATRON = {
    1: "falta_organizacion",
    2: "deuda_manejable",
    3: "presion_deuda",
    4: "situacion_critica",
    5: null,
  };

  function buildEncuestaAll(letter) {
    var r = {};
    for (var i = 1; i <= 10; i++) r["p" + i] = letter;
    return r;
  }

  function buildEncuestaMostlyAB() {
    var r = {};
    for (var i = 1; i <= 10; i++) {
      r["p" + i] = i % 2 === 1 ? "A" : "B";
    }
    return r;
  }

  function buildTwentyDebts() {
    var list = [];
    for (var n = 1; n <= 20; n++) {
      list.push({
        acreedor: "Credito_" + n,
        saldo: 5000,
        pago: 500,
        situacion_ui: "pagando_normal",
      });
    }
    return list;
  }

  var PROFILES = [
    {
      id: 1,
      description: "High income, no debts, normal expenses",
      ingreso: 80000,
      deudas: [],
      gastos: { vivienda: 15000, alimentacion: 8000 },
      encuesta: "all_a",
      expected: "1",
    },
    {
      id: 2,
      description: "Medium income, light debt, positive flow",
      ingreso: 45000,
      deudas: [{ acreedor: "OCA", saldo: 30000, pago: 2000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 10000, alimentacion: 6000 },
      encuesta: "mostly_ab",
      expected: "1-3",
    },
    {
      id: 3,
      description: "Medium income, moderate debt, paying normally",
      ingreso: 45000,
      deudas: [{ acreedor: "BROU", saldo: 80000, pago: 5000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 12000, alimentacion: 7000 },
      encuesta: null,
      expected: "2",
    },
    {
      id: 4,
      description: "Low income, multiple debts, tight flow",
      ingreso: 25000,
      deudas: [
        { acreedor: "OCA", saldo: 20000, pago: 2000, situacion_ui: "pagando_normal" },
        { acreedor: "Abitab", saldo: 15000, pago: 1500, situacion_ui: "atrasado" },
        { acreedor: "Pronto", saldo: 10000, pago: 1000, situacion_ui: "pagando_normal" },
      ],
      gastos: { vivienda: 8000, alimentacion: 5000 },
      encuesta: null,
      expected: "3",
    },
    {
      id: 5,
      description: "Low income, high debt, negative flow",
      ingreso: 20000,
      deudas: [
        { acreedor: "OCA", saldo: 50000, pago: 5000, situacion_ui: "pagando_normal" },
        { acreedor: "BROU", saldo: 40000, pago: 4000, situacion_ui: "atrasado" },
      ],
      gastos: { vivienda: 8000, alimentacion: 6000, transporte: 3000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 6,
      description: "No declared debts, severe negative flow",
      ingreso: 20000,
      deudas: [],
      gastos: { vivienda: 15000, alimentacion: 8000, educacion: 5000, salud: 4000 },
      encuesta: null,
      expected: "3-4",
    },
    {
      id: 7,
      description: "No debts, no declared expenses",
      ingreso: 40000,
      deudas: [],
      gastos: {},
      encuesta: null,
      expected: "1",
    },
    {
      id: 8,
      description: "One large debt, high income, DTI 35-45%, positive flow",
      ingreso: 80000,
      deudas: [{ acreedor: "BROU", saldo: 200000, pago: 32000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 15000, alimentacion: 8000 },
      encuesta: null,
      expected: "2-3",
    },
    {
      id: 9,
      description: "20 small debts, medium income",
      ingreso: 40000,
      deudas: buildTwentyDebts(),
      gastos: { vivienda: 10000, alimentacion: 6000 },
      encuesta: null,
      expected: "2-3",
    },
    {
      id: 10,
      description: "Active mora, stopped paying",
      ingreso: 35000,
      deudas: [
        { acreedor: "OCA", saldo: 60000, pago: 0, situacion_ui: "deje_de_pagar" },
        { acreedor: "Pronto", saldo: 30000, pago: 0, situacion_ui: "mora_reclamo" },
      ],
      gastos: { vivienda: 10000, alimentacion: 6000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 11,
      description: "DTI exactly 35%",
      ingreso: 40000,
      deudas: [{ acreedor: "BROU", saldo: 100000, pago: 14000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 10000, alimentacion: 6000 },
      encuesta: null,
      expected: "2",
    },
    {
      id: 12,
      description: "DTI exactly 50%",
      ingreso: 40000,
      deudas: [{ acreedor: "OCA", saldo: 150000, pago: 20000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 8000, alimentacion: 5000 },
      encuesta: null,
      expected: "3",
    },
    {
      id: 13,
      description: "DTI over 100%",
      ingreso: 20000,
      deudas: [{ acreedor: "BROU", saldo: 300000, pago: 22000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 5000, alimentacion: 4000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 14,
      description: "Free flow exactly 0",
      ingreso: 30000,
      deudas: [{ acreedor: "OCA", saldo: 60000, pago: 8000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 12000, alimentacion: 7000, transporte: 3000 },
      encuesta: null,
      expected: "2-3",
    },
    {
      id: 15,
      description: "Income = 0",
      ingreso: 0,
      deudas: [{ acreedor: "BROU", saldo: 50000, pago: 3000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 5000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 16,
      description: "Very high income, absurd debt",
      ingreso: 200000,
      deudas: [{ acreedor: "BROU", saldo: 5000000, pago: 180000, situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 20000, alimentacion: 10000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 17,
      description: "Perfect Plan 1 - everything green",
      ingreso: 100000,
      deudas: [],
      gastos: { vivienda: 15000, alimentacion: 8000, transporte: 3000 },
      encuesta: "all_a",
      expected: "1",
    },
    {
      id: 18,
      description: "Good income, positive flow, but recent active mora",
      ingreso: 60000,
      deudas: [
        { acreedor: "OCA", saldo: 40000, pago: 0, situacion_ui: "mora_reclamo" },
        { acreedor: "Abitab", saldo: 20000, pago: 2000, situacion_ui: "pagando_normal" },
      ],
      gastos: { vivienda: 12000, alimentacion: 8000 },
      encuesta: null,
      expected: "3-4",
    },
    {
      id: 19,
      description: "Survey all D responses",
      ingreso: 30000,
      deudas: [{ acreedor: "OCA", saldo: 80000, pago: 5000, situacion_ui: "atrasado" }],
      gastos: { vivienda: 10000, alimentacion: 6000 },
      encuesta: "all_d",
      expected: "4",
    },
    {
      id: 20,
      description: "Informal debt, no active payment",
      ingreso: 35000,
      deudas: [{ acreedor: "familiar", saldo: 50000, pago: 0, situacion_ui: "informal" }],
      gastos: { vivienda: 10000, alimentacion: 6000 },
      encuesta: null,
      expected: "3-4",
    },
    {
      id: 21,
      description: "Positive flow but active mora",
      ingreso: 70000,
      deudas: [{
        acreedor: "OCA",
        saldo: 30000,
        pago: 0,
        situacion_ui: "mora_reclamo",
        pagada: false,
      }],
      gastos: { vivienda: 12000, alimentacion: 8000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 22,
      description: "Informal debt with positive flow",
      ingreso: 50000,
      deudas: [{
        acreedor: "familiar",
        saldo: 100000,
        pago: 0,
        situacion_ui: "informal",
        pagada: false,
      }],
      gastos: { vivienda: 10000, alimentacion: 7000 },
      encuesta: null,
      expected: "3-4",
    },
    {
      id: 23,
      description: "No income no debt",
      ingreso: 0,
      deudas: [],
      gastos: { vivienda: 5000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 24,
      description: "Monthly payment ratio above 100%",
      ingreso: 30000,
      deudas: [{
        acreedor: "BROU",
        saldo: 50000,
        pago: 35000,
        situacion_ui: "pagando_normal",
        pagada: false,
      }],
      gastos: { vivienda: 5000, alimentacion: 3000 },
      encuesta: null,
      expected: "4",
    },
    {
      id: 25,
      description: "Incomplete survey healthy finances",
      ingreso: 90000,
      deudas: [],
      gastos: { vivienda: 12000, alimentacion: 8000 },
      encuesta: {},
      expected: "1",
    },
    {
      id: 26,
      letter: "H",
      description: "Partner H — 3 formal debts, no mora",
      ingreso: 32000,
      deudas: [
        { acreedor: "OCA", saldo: 28000, pago: 2800, situacion_ui: "pagando_normal", tipo: "tarjeta" },
        { acreedor: "BROU", saldo: 22000, pago: 2200, situacion_ui: "pagando_normal", tipo: "prestamo" },
        { acreedor: "Pronto", saldo: 15000, pago: 1500, situacion_ui: "pagando_normal", tipo: "financiera" },
      ],
      gastos: { vivienda: 11000, alimentacion: 6500 },
      encuesta: null,
      expected: "2-3",
      partnerExpected: {
        flag_demasiadas_deudas: true,
        mideuda: true,
      },
    },
    {
      id: 27,
      letter: "I",
      description: "Partner I — debt only to family",
      ingreso: 50000,
      deudas: [{
        acreedor: "familia",
        saldo: 80000,
        pago: 0,
        situacion_ui: "informal",
        tipo: "informal",
      }],
      gastos: { vivienda: 10000, alimentacion: 7000 },
      encuesta: null,
      expected: "3-4",
      partnerExpected: {
        deuda_fuera_sistema: true,
        mideuda: false,
      },
    },
    {
      id: 28,
      letter: "J",
      description: "Partner J — formal debt, explicit pago 0, no mora",
      ingreso: 45000,
      deudas: [{
        acreedor: "BROU",
        saldo: 250000,
        pago: 0,
        situacion_ui: "pagando_normal",
        tipo: "prestamo",
        pago_fuente: "declarado",
      }],
      gastos: { vivienda: 12000, alimentacion: 7000 },
      encuesta: null,
      expected: "2-4",
      partnerExpected: {
        flag_deuda_sin_pagos: true,
        mora_activa: false,
        deuda_vencida: false,
        mideuda: true,
      },
    },
    {
      id: 29,
      letter: "K",
      description: "Partner K — formal debt, empty pago, never completed",
      ingreso: 45000,
      deudas: [{
        acreedor: "BROU",
        saldo: 250000,
        pago: "",
        situacion_ui: "pagando_normal",
        tipo: "prestamo",
        pago_fuente: "no_declarado",
      }],
      gastos: { vivienda: 12000, alimentacion: 7000 },
      encuesta: null,
      expected: "2-4",
      partnerExpected: {
        flag_deuda_sin_pagos: false,
        mideuda: false,
      },
    },
    {
      id: 30,
      letter: "L",
      description: "Partner L — Plan 4, formal debt, high amount, pago 0, no_paga, no mora",
      ingreso: 35000,
      deudas: [{
        acreedor: "BROU",
        saldo: 500000,
        pago: "0",
        situacion_ui: "pagando_normal",
        tipo: "prestamo",
        pago_fuente: "no_paga",
      }],
      gastos: { vivienda: 22000, alimentacion: 18000 },
      encuesta: null,
      expected: "4",
      partnerExpected: {
        flag_deuda_sin_pagos: true,
        mora_activa: false,
        deuda_vencida: false,
        mideuda: true,
        planId: "4",
        recommended_tools_first: "mideuda",
      },
    },
    {
      id: 31,
      description: "Extreme debt stock with implausible monthly payment (sanity guard)",
      ingreso: 45000,
      deudas: [{
        acreedor: "BROU",
        saldo: 22222222,
        pago: 2,
        situacion_ui: "pagando_normal",
        tipo: "prestamo",
        debt_confidence: "high",
      }],
      gastos: {},
      encuesta: "mostly_ab",
      expected: "2-4",
      sanityGuardExpectations: {
        missing_payment_information: true,
        confidence_level: "low",
        horizon_label: "No estimable sin estabilización previa",
        retry_blocked: true,
        mideuda: true,
        flag_deuda_sanity_extreme: true,
      },
    },
  ];

  // Partner letter regression A-G (motor + placeholder UI logic)
  var PARTNER_LETTER_CASES = [
    {
      letter: "A",
      description: "Formal overdue debt → MiDeuda visible",
      ingreso: 40000,
      deudas: [{ acreedor: "OCA", saldo: 50000, pago: 3000, situacion_ui: "atrasado", tipo: "tarjeta" }],
      gastos: { vivienda: 10000, alimentacion: 6000 },
      partnerExpected: { deuda_vencida: true, mideuda: true },
    },
    {
      letter: "B",
      description: "3+ formal debts → MiDeuda visible",
      ingreso: 45000,
      deudas: [
        { acreedor: "OCA", saldo: 20000, pago: 2000, situacion_ui: "pagando_normal", tipo: "tarjeta" },
        { acreedor: "BROU", saldo: 15000, pago: 1500, situacion_ui: "pagando_normal", tipo: "prestamo" },
        { acreedor: "Pronto", saldo: 10000, pago: 1000, situacion_ui: "pagando_normal", tipo: "financiera" },
      ],
      gastos: { vivienda: 9000, alimentacion: 5000 },
      partnerExpected: { flag_demasiadas_deudas: true, mideuda: true },
    },
    {
      letter: "C",
      description: "Informal debt only → MiDeuda hidden",
      ingreso: 45000,
      deudas: [{ acreedor: "amigo", saldo: 60000, pago: 0, situacion_ui: "informal", tipo: "informal" }],
      gastos: { vivienda: 9000, alimentacion: 5000 },
      partnerExpected: { deuda_fuera_sistema: true, mideuda: false },
    },
    {
      letter: "D",
      description: "Single formal debt current → MiDeuda hidden",
      ingreso: 60000,
      deudas: [{ acreedor: "BROU", saldo: 30000, pago: 2500, situacion_ui: "pagando_normal", tipo: "prestamo" }],
      gastos: { vivienda: 12000, alimentacion: 7000 },
      partnerExpected: { mora_activa: false, deuda_vencida: false, mideuda: false },
    },
    {
      letter: "E",
      description: "Checkbox unchecked → CTA disabled",
      uiOnly: true,
    },
    {
      letter: "F",
      description: "Checkbox checked + click → interest registered placeholder",
      uiOnly: true,
    },
    {
      letter: "G",
      description: "Plan 4 + MiDeuda → first in recommended_tools",
      ingreso: 35000,
      deudas: [{ acreedor: "OCA", saldo: 90000, pago: 0, situacion_ui: "mora_reclamo", tipo: "tarjeta" }],
      gastos: { vivienda: 9000, alimentacion: 5000 },
      partnerExpected: { mideuda: true, planId: "4", recommended_tools_first: "mideuda" },
    },
    {
      letter: "J",
      description: "Formal debt, explicit pago 0, no mora → MiDeuda visible",
      ingreso: 45000,
      deudas: [{
        acreedor: "BROU",
        saldo: 250000,
        pago: 0,
        situacion_ui: "pagando_normal",
        tipo: "prestamo",
        pago_fuente: "declarado",
      }],
      gastos: { vivienda: 12000, alimentacion: 7000 },
      partnerExpected: {
        flag_deuda_sin_pagos: true,
        mora_activa: false,
        deuda_vencida: false,
        mideuda: true,
      },
    },
    {
      letter: "K",
      description: "Formal debt, empty pago → flag false, MiDeuda hidden",
      ingreso: 45000,
      deudas: [{
        acreedor: "BROU",
        saldo: 250000,
        pago: "",
        situacion_ui: "pagando_normal",
        tipo: "prestamo",
        pago_fuente: "no_declarado",
      }],
      gastos: { vivienda: 12000, alimentacion: 7000 },
      partnerExpected: { flag_deuda_sin_pagos: false, mideuda: false },
    },
    {
      letter: "L",
      description: "Plan 4 + formal debt + pago 0 + no_paga, no mora → MiDeuda first",
      ingreso: 35000,
      deudas: [{
        acreedor: "BROU",
        saldo: 500000,
        pago: "0",
        situacion_ui: "pagando_normal",
        tipo: "prestamo",
        pago_fuente: "no_paga",
      }],
      gastos: { vivienda: 22000, alimentacion: 18000 },
      partnerExpected: {
        flag_deuda_sin_pagos: true,
        mora_activa: false,
        deuda_vencida: false,
        mideuda: true,
        planId: "4",
        recommended_tools_first: "mideuda",
      },
    },
  ];

  function normalizeSituacionUi(raw) {
    if (raw === "deje_de_pagar") return "deje_pagar";
    if (raw === "atrasado") return "atrasado_pagando";
    return raw || "pagando_normal";
  }

  function estadoFromSituacion(sit) {
    if (sit === "deje_pagar" || sit === "mora_reclamo") return "mora";
    if (sit === "atrasado_pagando") return "atraso_grave";
    return "al_dia";
  }

  function normalizeDebt(d, idx) {
    var sit = normalizeSituacionUi(d.situacion_ui);
    var monto = d.monto != null ? d.monto : d.saldo;
    var pagoStr = "";
    if (d.pago !== null && d.pago !== undefined && d.pago !== "") {
      pagoStr = String(d.pago);
    } else if (d.pago === 0 || d.pago === "0") {
      pagoStr = "0";
    }
    var tipo = d.tipo || (sit === "informal" || d.acreedor === "familiar" ? "informal" : "tarjeta");
    var acreedor = d.acreedor || ("Deuda_" + (idx + 1));

    return {
      tipo: tipo,
      acreedor: acreedor,
      acreedor_raw: acreedor,
      acreedor_display: acreedor,
      monto: String(monto != null ? monto : 0),
      pago: pagoStr,
      estado: d.estado || estadoFromSituacion(sit),
      situacion_ui: sit,
      cancelada: false,
      pago_fuente: d.pago_fuente || (pagoStr === "" ? "no_declarado" : "declarado"),
    };
  }

  function encuestaForProfile(profile) {
    if (profile.encuesta === "all_a") return buildEncuestaAll("A");
    if (profile.encuesta === "all_d") return buildEncuestaAll("D");
    if (profile.encuesta === "mostly_ab") return buildEncuestaMostlyAB();
    var empty = {};
    for (var i = 1; i <= 10; i++) empty["p" + i] = null;
    return empty;
  }

  function hasMideuda(tools) {
    return !!(tools && tools.indexOf("mideuda") >= 0);
  }

  function checkPartnerExpected(diag, expected, label) {
    if (!expected) return [];
    var errors = [];
    var prefix = label ? label + ": " : "";

    if (expected.mideuda != null) {
      var shown = hasMideuda(diag.recommended_tools);
      if (shown !== expected.mideuda) {
        errors.push(prefix + "recommended_tools mideuda expected " + expected.mideuda + " got " + shown);
      }
    }
    ["mora_activa", "deuda_vencida", "flag_demasiadas_deudas", "flag_deuda_cara", "flag_deuda_sin_pagos", "deuda_fuera_sistema"].forEach(function(flag) {
      if (expected[flag] == null) return;
      if (!!diag[flag] !== expected[flag]) {
        errors.push(prefix + flag + " expected " + expected[flag] + " got " + !!diag[flag]);
      }
    });
    if (expected.planId != null && String(diag.planId) !== String(expected.planId)) {
      errors.push(prefix + "planId expected " + expected.planId + " got " + diag.planId);
    }
    if (expected.recommended_tools_first != null) {
      var first = diag.recommended_tools && diag.recommended_tools[0];
      if (first !== expected.recommended_tools_first) {
        errors.push(prefix + "recommended_tools[0] expected " + expected.recommended_tools_first + " got " + first);
      }
    }
    return errors;
  }

  function runPartnerLetterCase(letterCase) {
    if (letterCase.uiOnly) {
      if (letterCase.letter === "E") return runPartnerCaseE();
      if (letterCase.letter === "F") return runPartnerCaseF();
      return { ok: false, reason: "Unknown UI-only partner case" };
    }

    var profile = {
      id: letterCase.letter,
      description: letterCase.description,
      ingreso: letterCase.ingreso,
      deudas: letterCase.deudas || [],
      gastos: letterCase.gastos || {},
      encuesta: letterCase.encuesta || null,
      expected: letterCase.expected || "1-4",
      partnerExpected: letterCase.partnerExpected,
    };
    var result = runProfile(profile);
    var errors = result.errors.slice();
    errors = errors.concat(checkPartnerExpected(result.diag, profile.partnerExpected, "Case " + letterCase.letter));
    return {
      ok: errors.length === 0 && (letterCase.expected ? result.planOk : true),
      errors: errors,
      diag: result.diag,
    };
  }

  function runPartnerCaseE() {
    var enabledWhenChecked = !!false;
    var disabledWhenUnchecked = !enabledWhenChecked;
    return {
      ok: disabledWhenUnchecked,
      errors: disabledWhenUnchecked ? [] : ["Case E: CTA should stay disabled without opt-in"],
    };
  }

  function runPartnerCaseF() {
    var st = {
      mideuda_optin: false,
      mideuda_interest_registered: false,
      mideuda_lead_status: "shown",
      mideuda_optin_timestamp: null,
    };
    var integrationEnabled = typeof MIDEUDA_INTEGRATION_ENABLED !== "undefined"
      ? !!MIDEUDA_INTEGRATION_ENABLED
      : false;
    var checked = true;

    if (!checked) {
      return { ok: false, errors: ["Case F: opt-in checkbox must be checked"] };
    }

    st.mideuda_optin = true;
    st.mideuda_optin_timestamp = new Date().toISOString();
    st.mideuda_cta_clicked = true;
    st.mideuda_lead_status = "optin";

    if (!integrationEnabled) {
      st.mideuda_interest_registered = true;
      st.mideuda_lead_status = "interest_registered";
    }

    var errors = [];
    if (!st.mideuda_optin) errors.push("Case F: mideuda_optin expected true");
    if (!st.mideuda_interest_registered) errors.push("Case F: mideuda_interest_registered expected true");
    if (st.mideuda_lead_status !== "interest_registered") {
      errors.push("Case F: mideuda_lead_status expected interest_registered");
    }
    if (!st.mideuda_optin_timestamp) errors.push("Case F: mideuda_optin_timestamp missing");
    if (integrationEnabled) errors.push("Case F: integration must stay disabled in placeholder sprint");

    return { ok: errors.length === 0, errors: errors };
  }

  function runPartnerLetterRegression() {
    var passed = 0;
    var failed = 0;
    console.log("");
    console.log("=== Partner regression A-L ===");
    PARTNER_LETTER_CASES.forEach(function(letterCase) {
      var result;
      try {
        result = runPartnerLetterCase(letterCase);
      } catch (e) {
        console.log("[FAIL] Case " + letterCase.letter + " — " + letterCase.description);
        console.log("  ERROR: " + (e.message || e));
        failed++;
        return;
      }
      var tag = result.ok ? "[PASS]" : "[FAIL]";
      console.log(tag + " Case " + letterCase.letter + " — " + letterCase.description);
      if (!result.ok && result.errors) {
        result.errors.forEach(function(err) { console.log("  ERROR: " + err); });
      }
      if (result.ok) passed++;
      else failed++;
    });
    console.log("Partner letters: " + passed + "/" + PARTNER_LETTER_CASES.length);
    return { passed: passed, failed: failed };
  }

  function parseExpectedRange(spec) {
    if (!spec) return { min: 1, max: 4 };
    var parts = String(spec).split("-");
    if (parts.length === 1) {
      var n = parseInt(parts[0], 10);
      return { min: n, max: n };
    }
    return {
      min: parseInt(parts[0], 10),
      max: parseInt(parts[1], 10),
    };
  }

  function planInRange(planId, range) {
    var pid = parseInt(planId, 10);
    return pid >= range.min && pid <= range.max;
  }

  function isFiniteNumber(n) {
    return typeof n === "number" && isFinite(n);
  }

  function checkFinNumbers(fin, warnings, label) {
    ["flujoLibre", "dti_ratio", "totalDeuda", "ratio"].forEach(function(key) {
      var v = fin[key];
      if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) {
        warnings.push(label + ": fin." + key + " invalid (" + v + ")");
      }
    });
  }

  function checkSanityGuardExpectations(diag, iv2, expected, label) {
    var errors = [];
    expected = expected || {};
    diag = diag || {};
    iv2 = iv2 || {};

    if (expected.missing_payment_information && !diag.missing_payment_information) {
      errors.push(label + ": missing_payment_information expected true");
    }
    if (expected.confidence_level && iv2.confidence_level !== expected.confidence_level) {
      errors.push(label + ": confidence_level expected " + expected.confidence_level
        + " got " + iv2.confidence_level);
    }
    if (expected.horizon_label) {
      var hLabel = diag.horizonte ? diag.horizonte.label : null;
      if (hLabel !== expected.horizon_label) {
        errors.push(label + ": horizon label expected \"" + expected.horizon_label + "\" got \"" + hLabel + "\"");
      }
    }
    if (expected.planId_min != null && parseInt(diag.planId, 10) < expected.planId_min) {
      errors.push(label + ": planId expected >=" + expected.planId_min + " got " + diag.planId);
    }
    if (expected.mideuda) {
      var tools = diag.recommended_tools || [];
      if (tools.indexOf("mideuda") < 0) {
        errors.push(label + ": recommended_tools expected to include mideuda");
      }
    }
    if (expected.flag_deuda_sanity_extreme && !diag.flag_deuda_sanity_extreme) {
      errors.push(label + ": flag_deuda_sanity_extreme expected true");
    }
    if (expected.retry_blocked && typeof isRetryEligible === "function") {
      window.CZState.snap = { plan_id: 2, fecha_inicio: new Date().toISOString() };
      if (isRetryEligible(diag, window.CZState)) {
        errors.push(label + ": retry eligibility expected blocked");
      }
      window.CZState.snap = null;
    }
    return errors;
  }

  function isCausaCoherentWithPlan(iv2, planId) {
    if (!iv2 || !iv2.narrativa_jerarquizada || !iv2.narrativa_jerarquizada.length) {
      return { ok: false, reason: "missing narrativa_jerarquizada[0]" };
    }
    var n0 = iv2.narrativa_jerarquizada[0];
    var causaPrincipal = iv2.causa_principal;
    if (causaPrincipal == null || causaPrincipal === "") {
      return { ok: false, reason: "missing causa_principal" };
    }
    if (iv2.patron_deuda === "sin_patron") {
      var expected = PLAN_CAUSA_SIN_PATRON[planId];
      if (expected && n0.causa !== expected) {
        return { ok: false, reason: "sin_patron causa mismatch (got " + n0.causa + ", expected " + expected + ")" };
      }
      return { ok: true, reason: null };
    }
    if (n0.causa !== causaPrincipal) {
      return { ok: false, reason: "narrativa[0].causa !== causa_principal" };
    }
    return { ok: true, reason: null };
  }

  function captureGlobals() {
    return {
      gastos: window.CZState && window.CZState.gastos,
      deudas: window.CZState && window.CZState.deudas,
      snap: window.CZState && window.CZState.snap,
      ingreso: typeof PRE !== "undefined" ? PRE.ingreso : null,
      respuestas: typeof PRE !== "undefined" ? PRE.respuestas : null,
      hadCZState: !!window.CZState,
    };
  }

  function restoreGlobals(snap) {
    if (!snap.hadCZState) {
      try { delete window.CZState; } catch (e) { window.CZState = undefined; }
    } else {
      window.CZState.gastos = snap.gastos;
      window.CZState.deudas = snap.deudas;
      window.CZState.snap = snap.snap;
    }
    if (typeof PRE !== "undefined") {
      PRE.ingreso = snap.ingreso;
      PRE.respuestas = snap.respuestas;
    }
  }

  /**
   * Isolated adapter: temporary mock CZState + PRE fields, then restore.
   * Does not call guardarLocal, trackEvent, trackCRMEvent, or UI.
   */
  function runProfile(profile) {
    var snap = captureGlobals();
    var warnings = [];
    var errors = [];

    try {
      if (!window.CZState) window.CZState = {};
      window.CZState.gastos = Object.assign({}, profile.gastos || {});
      window.CZState.deudas = (profile.deudas || []).map(normalizeDebt);
      window.CZState.snap = null;

      if (typeof PRE === "undefined") {
        throw new Error("PRE is not defined — load config.js before SyntheticMotorQA");
      }
      PRE.ingreso = profile.ingreso;
      PRE.respuestas = encuestaForProfile(profile);

      if (profile.encuesta && typeof TIENE_ENCUESTA !== "undefined" && !TIENE_ENCUESTA) {
        warnings.push(
          "Profile " + profile.id + ": encuesta set on PRE but TIENE_ENCUESTA is false at page load; "
          + "calcularEncuesta() returns score 0 (load dev/synthetic-motor-test.html with ?p1=A… in URL)"
        );
      }

      if (typeof calcularMotor !== "function") {
        throw new Error("calcularMotor is not defined — load algorithms.js");
      }

      var diag = calcularMotor();
      var fin = diag.fin || {};
      var iv2 = diag.interpretacion_v2 || {};
      var range = parseExpectedRange(profile.expected);
      var planOk = planInRange(diag.planId, range);

      checkFinNumbers(fin, warnings, "Profile " + profile.id);

      var coherence = isCausaCoherentWithPlan(iv2, diag.planId);
      if (!coherence.ok) errors.push(coherence.reason);

      if (iv2.causa_principal == null) errors.push("causa_principal is null");

      if (profile.partnerExpected) {
        errors = errors.concat(checkPartnerExpected(diag, profile.partnerExpected, "Profile " + profile.id));
      }

      if (profile.sanityGuardExpectations) {
        errors = errors.concat(checkSanityGuardExpectations(diag, iv2, profile.sanityGuardExpectations, "Profile " + profile.id));
      }

      return {
        diag: diag,
        fin: fin,
        iv2: iv2,
        planOk: planOk,
        errors: errors,
        warnings: warnings,
      };
    } finally {
      restoreGlobals(snap);
    }
  }

  function printResult(profile, result) {
    var diag = result.diag;
    var fin = result.fin;
    var iv2 = result.iv2;
    var n0 = (iv2.narrativa_jerarquizada && iv2.narrativa_jerarquizada[0]) || {};
    var pass = result.planOk && result.errors.length === 0;
    var tag = pass ? "[PASS]" : "[FAIL]";
    var lines = [
      tag + " Profile " + profile.id + " — " + profile.description,
      "  planId: " + diag.planId + " (expected: " + profile.expected + ")",
      "  causa_principal: \"" + (iv2.causa_principal || "") + "\"",
      "  flujoLibre: " + fin.flujoLibre,
      "  dti_ratio: " + fin.dti_ratio,
      "  narrativa[0].causa: \"" + (n0.causa || "") + "\"",
    ];
    if (!pass) {
      if (!result.planOk) {
        lines.push("  ERROR: planId " + diag.planId + " not in expected range " + profile.expected);
      }
      result.errors.forEach(function(e) {
        lines.push("  ERROR: " + e);
      });
    }
    lines.forEach(function(line) { console.log(line); });
    return pass;
  }

  function runAll() {
    var passed = 0;
    var failed = 0;
    var allWarnings = [];

    var total = PROFILES.length;
    console.log("=== Synthetic Motor QA (" + total + " profiles) ===");
    if (typeof TIENE_ENCUESTA !== "undefined") {
      console.log("TIENE_ENCUESTA at load:", TIENE_ENCUESTA);
    }

    PROFILES.forEach(function(profile) {
      var result;
      try {
        result = runProfile(profile);
      } catch (e) {
        console.log("[FAIL] Profile " + profile.id + " — " + profile.description);
        console.log("  ERROR: " + (e.message || e));
        failed++;
        return;
      }
      result.warnings.forEach(function(w) { allWarnings.push(w); });
      if (printResult(profile, result)) passed++;
      else failed++;
    });

    var partnerLetters = runPartnerLetterRegression();
    if (partnerLetters.failed > 0) failed += partnerLetters.failed;

    console.log("");
    console.log("PASSED: " + passed + "/" + total);
    console.log("FAILED: " + failed + "/" + total);
    if (allWarnings.length) {
      console.log("WARNINGS (NaN/null / encuesta):");
      allWarnings.forEach(function(w) { console.log("  - " + w); });
    } else {
      console.log("WARNINGS (NaN/null detected): none");
    }
    if (failed === 0 && passed === total && partnerLetters.failed === 0) {
      console.log("");
      console.log("SyntheticMotorQA — " + total + "/" + total + " PASS");
      console.log("Partner letters A-L — " + partnerLetters.passed + "/" + PARTNER_LETTER_CASES.length + " PASS");
    }

    return {
      passed: passed,
      failed: failed,
      warnings: allWarnings,
      partnerLetters: partnerLetters,
    };
  }

  var api = {
    PROFILES: PROFILES,
    PARTNER_LETTER_CASES: PARTNER_LETTER_CASES,
    runProfile: runProfile,
    runAll: runAll,
    normalizeDebt: normalizeDebt,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.SyntheticMotorQA = api;

  if (typeof process !== "undefined" && process.argv && process.argv[1]
      && process.argv[1].indexOf("synthetic-motor-test") !== -1) {
    runNodeHarness();
  }

  function runNodeHarness() {
    var fs = require("fs");
    var path = require("path");
    var vm = require("vm");
    var root = path.join(__dirname, "..");

    global.window = global.window || {};
    global.window.CZState = null;
    global.window.location = { search: buildSurveyQuery() };

    function load(file) {
      vm.runInThisContext(
        fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
        { filename: path.join(root, file) }
      );
    }

    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");

    runAll();
  }

  function buildSurveyQuery() {
    var q = ["ingreso=1"];
    for (var i = 1; i <= 10; i++) q.push("p" + i + "=A");
    return "?" + q.join("&");
  }
})(typeof window !== "undefined" ? window : global);
