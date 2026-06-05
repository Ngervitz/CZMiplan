/**
 * dev/synthetic-motor-test.js — Sprint synthetic motor QA (20 profiles)
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
      expected: "1-2",
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
      expected: "3-4",
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
    var pago = d.pago != null ? d.pago : 0;
    var tipo = d.tipo || (sit === "informal" || d.acreedor === "familiar" ? "informal" : "tarjeta");
    var acreedor = d.acreedor || ("Deuda_" + (idx + 1));

    return {
      tipo: tipo,
      acreedor: acreedor,
      acreedor_raw: acreedor,
      acreedor_display: acreedor,
      monto: String(monto != null ? monto : 0),
      pago: String(pago),
      estado: d.estado || estadoFromSituacion(sit),
      situacion_ui: sit,
      cancelada: false,
      pago_fuente: parseFloat(pago) > 0 ? "declarado" : "no_declarado",
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

    console.log("");
    console.log("PASSED: " + passed + "/" + total);
    console.log("FAILED: " + failed + "/" + total);
    if (allWarnings.length) {
      console.log("WARNINGS (NaN/null / encuesta):");
      allWarnings.forEach(function(w) { console.log("  - " + w); });
    } else {
      console.log("WARNINGS (NaN/null detected): none");
    }
    if (failed === 0 && passed === total) {
      console.log("");
      console.log("Motor Regression Suite v1 — " + total + " profiles");
    }

    return { passed: passed, failed: failed, warnings: allWarnings };
  }

  var api = {
    PROFILES: PROFILES,
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
