/**
 * dev/coverage-calibration-audit.js — Sprint B coverage threshold calibration (audit only)
 *
 * Does NOT modify production behavior, getFinancialProfileCompleteness(), UI, motor, retry, CRM.
 * Reads stub helper + synthetic/QA profile definitions; prints calibration tables.
 *
 * Run: node dev/coverage-calibration-audit.js
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "", href: "" };
  global.document = {
    getElementById: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.trackEvent = function() {};
  global.localStorage = { getItem: function() { return null; }, setItem: function() {} };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/app.js");

  var THRESHOLDS = [
    { key: "8/25", a: 0.08, b: 0.25 },
    { key: "5/18", a: 0.05, b: 0.18 },
    { key: "8/22", a: 0.08, b: 0.22 },
    { key: "12/30", a: 0.12, b: 0.30 },
  ];

  function sumGastos(gastos) {
    gastos = gastos || {};
    return Object.keys(gastos).reduce(function(s, k) {
      return s + (parseFloat(gastos[k]) || 0);
    }, 0);
  }

  function buildState(profile) {
    var st = {
      deudas: profile.deudas || [],
      gastos: profile.gastos || {},
      no_debts_declared: !!profile.no_debts_declared,
      gastos_missing_confirmed: !!profile.gastos_missing_confirmed,
      financial_expenses_complete: profile.financial_expenses_complete != null
        ? !!profile.financial_expenses_complete
        : sumGastos(profile.gastos) > 0,
    };
    PRE.ingreso = profile.ingreso != null ? profile.ingreso : 0;
    window.CZState = st;
    return st;
  }

  function classifyExpenses(coverage, gastosTotal, gastosMissing, a, b) {
    if (gastosTotal <= 0) return gastosMissing ? "missing" : "missing";
    if (coverage == null || isNaN(coverage)) return "missing";
    if (coverage < a) return "incomplete";
    if (coverage < b) return "preliminary";
    return "complete";
  }

  function classifyOverall(income, debts, expenses) {
    if (income === "missing") return "incomplete";
    if (debts === "missing") return "incomplete";
    if (expenses === "missing" || expenses === "incomplete") return "incomplete";
    if (expenses === "preliminary") return "preliminary";
    return "complete";
  }

  function analyzeProfile(profile) {
    var st = buildState(profile);
    var current = getFinancialProfileCompleteness(st);
    var gastosTotal = sumGastos(st.gastos);
    var coverage = current.coverage_ratio;
    var coveragePct = coverage != null ? Math.round(coverage * 1000) / 10 : null;

    var hypo = {};
    THRESHOLDS.forEach(function(t) {
      var exp = classifyExpenses(coverage, gastosTotal, st.gastos_missing_confirmed, t.a, t.b);
      hypo[t.key] = {
        expenses: exp,
        overall: classifyOverall(current.income, current.debts, exp),
      };
    });

    var qaExpectsComplete = profile.qaExpectsComplete === true;
    var qaFlip = {};
    THRESHOLDS.forEach(function(t) {
      qaFlip[t.key] = qaExpectsComplete && hypo[t.key].overall !== "complete";
    });

    return {
      id: profile.id,
      source: profile.source,
      label: profile.label || profile.description || profile.id,
      ingreso: PRE.ingreso,
      gastosTotal: gastosTotal,
      coveragePct: coveragePct,
      debts: current.debts,
      current: {
        expenses: current.expenses,
        overall: current.overall,
      },
      hypo: hypo,
      qaExpectsComplete: qaExpectsComplete,
      qaFlip: qaFlip,
    };
  }

  var SCENARIOS = [
    { id: "A", source: "scenario", label: "$500 / $100,000", ingreso: 100000, gastos: { vivienda: 500 },
      deudas: [{ monto: "80000", pago: "5000" }] },
    { id: "B", source: "scenario", label: "$5,000 / $100,000", ingreso: 100000, gastos: { vivienda: 5000 },
      deudas: [{ monto: "80000", pago: "5000" }] },
    { id: "C", source: "scenario", label: "$10,000 / $50,000", ingreso: 50000, gastos: { vivienda: 10000 },
      deudas: [{ monto: "50000", pago: "3000" }], qaExpectsComplete: true },
    { id: "D", source: "scenario", label: "$10,000 / $75,000", ingreso: 75000, gastos: { vivienda: 10000 },
      deudas: [{ monto: "75000", pago: "5000" }] },
    { id: "E", source: "scenario", label: "$18,000 / $50,000", ingreso: 50000,
      gastos: { vivienda: 10000, alimentacion: 8000 }, deudas: [{ monto: "50000", pago: "3000" }],
      qaExpectsComplete: true },
    { id: "F", source: "scenario", label: "$25,000 / $100,000", ingreso: 100000,
      gastos: { vivienda: 15000, alimentacion: 10000 }, deudas: [{ monto: "80000", pago: "5000" }] },
    { id: "G", source: "scenario", label: "$30,000 / $80,000", ingreso: 80000,
      gastos: { vivienda: 20000, alimentacion: 10000 }, deudas: [{ monto: "100000", pago: "5000" }],
      qaExpectsComplete: true },
    { id: "H", source: "scenario", label: "$0 gastos / $50,000", ingreso: 50000, gastos: {},
      deudas: [{ monto: "50000", pago: "3000" }] },
    { id: "I", source: "scenario", label: "no_debts_confirmed + gastos complete", ingreso: 75000,
      gastos: { vivienda: 15000, alimentacion: 8000 }, deudas: [], no_debts_declared: true,
      qaExpectsComplete: true },
    { id: "J", source: "scenario", label: "debt declared + gastos low ($10k/50k)", ingreso: 50000,
      gastos: { vivienda: 10000 }, deudas: [{ monto: "50000", pago: "3000" }], qaExpectsComplete: true },
    { id: "K", source: "scenario", label: "debt declared + gastos high ($30k/80k)", ingreso: 80000,
      gastos: { vivienda: 20000, alimentacion: 10000 }, deudas: [{ monto: "100000", pago: "5000" }],
      qaExpectsComplete: true },
    { id: "L", source: "scenario", label: "legitimate low-expense (family, no rent)", ingreso: 60000,
      gastos: { alimentacion: 8000, transporte: 3500, servicios: 1500 }, deudas: [{ monto: "40000", pago: "2500" }] },
  ];

  var SYNTHETIC = [
    { id: "SM-1", source: "synthetic", description: "High income, no debts", ingreso: 80000, deudas: [], gastos: { vivienda: 15000, alimentacion: 8000 } },
    { id: "SM-2", source: "synthetic", description: "Medium income, light debt", ingreso: 45000, deudas: [{}], gastos: { vivienda: 10000, alimentacion: 6000 } },
    { id: "SM-4", source: "synthetic", description: "Low income, multiple debts", ingreso: 25000, deudas: [{}, {}, {}], gastos: { vivienda: 8000, alimentacion: 5000 } },
    { id: "SM-6", source: "synthetic", description: "No debts, severe negative flow", ingreso: 20000, deudas: [], gastos: { vivienda: 15000, alimentacion: 8000, educacion: 5000, salud: 4000 } },
    { id: "SM-7", source: "synthetic", description: "No debts, no expenses", ingreso: 40000, deudas: [], gastos: {} },
    { id: "SM-13", source: "synthetic", description: "DTI over 100%", ingreso: 20000, deudas: [{}], gastos: { vivienda: 5000, alimentacion: 4000 } },
    { id: "SM-17", source: "synthetic", description: "Perfect Plan 1", ingreso: 100000, deudas: [], gastos: { vivienda: 15000, alimentacion: 8000, transporte: 3000 } },
    { id: "SM-31", source: "synthetic", description: "Extreme debt, empty gastos", ingreso: 45000, deudas: [{}], gastos: {} },
  ];

  var QA_FIXTURES = [
    { id: "QA-incomplete-D", source: "incomplete-profile-qa", label: "D complete debt profile", ingreso: 50000, gastos: { vivienda: 10000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-incomplete-F", source: "incomplete-profile-qa", label: "F retry-eligible complete", ingreso: 80000, gastos: { vivienda: 20000, alimentacion: 10000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-situacion-E", source: "situacion-hoy-incomplete-qa", label: "E single category 10k/40k", ingreso: 40000, gastos: { vivienda: 10000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-situacion-D", source: "situacion-hoy-incomplete-qa", label: "D multi 29k/75k", ingreso: 75000, gastos: { alquiler: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-cta-B", source: "cta-hierarchy-qa", label: "B 10k/40k", ingreso: 40000, gastos: { vivienda: 10000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-cta-F", source: "cta-hierarchy-qa", label: "F 10k/45k", ingreso: 45000, gastos: { vivienda: 10000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-score-label", source: "score-label-qa", label: "10k/45k", ingreso: 45000, gastos: { vivienda: 10000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-income-update", source: "income-update-qa", label: "1.5k/8888", ingreso: 8888, gastos: { vivienda: 1000, alimentacion: 500 }, deudas: [{}] },
    { id: "QA-sprint16-J", source: "sprint-16-qa", label: "18k/50k complete", ingreso: 50000, gastos: { vivienda: 10000, alimentacion: 8000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-completeness-H", source: "completeness-model-qa", label: "500/100k stub", ingreso: 100000, gastos: { vivienda: 500 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-hero-complete", source: "hero-card-qa", label: "29k/75k", ingreso: 75000, gastos: { alquiler: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 }, deudas: [{}], qaExpectsComplete: true },
    { id: "QA-seo-routing", source: "seo-ia-routing-qa", label: "16k/65k", ingreso: 65000, gastos: { vivienda: 10000, alimentacion: 6000 }, deudas: [{}], qaExpectsComplete: true },
  ];

  var ALL = SCENARIOS.concat(SYNTHETIC).concat(QA_FIXTURES);
  var rows = ALL.map(analyzeProfile);

  function pad(s, n) {
    s = String(s == null ? "" : s);
    while (s.length < n) s += " ";
    return s;
  }

  console.log("=== SPRINT B — Coverage Calibration Audit ===\n");
  console.log("Threshold models: 8/25, 5/18, 8/22, 12/30 (A = incomplete below, B = complete at/above)\n");

  console.log("--- TABLE: Key scenarios A–L ---");
  rows.filter(function(r) { return r.source === "scenario"; }).forEach(function(r) {
    console.log(
      r.id + " | " + pad(r.label, 42) +
      " | ing=" + pad(r.ingreso, 7) +
      " | gastos=" + pad(r.gastosTotal, 6) +
      " | cov=" + pad(r.coveragePct != null ? r.coveragePct + "%" : "n/a", 7) +
      " | debts=" + pad(r.debts, 18) +
      " | now=" + pad(r.current.overall + "/" + r.current.expenses, 20) +
      " | 8/25=" + pad(r.hypo["8/25"].overall + "/" + r.hypo["8/25"].expenses, 22) +
      " | 5/18=" + pad(r.hypo["5/18"].overall + "/" + r.hypo["5/18"].expenses, 22) +
      " | 8/22=" + pad(r.hypo["8/22"].overall + "/" + r.hypo["8/22"].expenses, 22) +
      " | 12/30=" + pad(r.hypo["12/30"].overall + "/" + r.hypo["12/30"].expenses, 22)
    );
  });

  console.log("\n--- TABLE: Synthetic + QA fixtures (sample) ---");
  rows.filter(function(r) { return r.source !== "scenario"; }).forEach(function(r) {
    console.log(
      pad(r.id, 22) + " | cov=" + pad(r.coveragePct != null ? r.coveragePct + "%" : "n/a", 7) +
      " | now=" + pad(r.current.overall, 12) +
      " | 8/25=" + pad(r.hypo["8/25"].overall, 12) +
      " | 5/18=" + pad(r.hypo["5/18"].overall, 12) +
      " | 8/22=" + pad(r.hypo["8/22"].overall, 12) +
      " | 12/30=" + pad(r.hypo["12/30"].overall, 12) +
      (r.qaExpectsComplete ? " | QA expects complete" : "")
    );
  });

  console.log("\n--- QA fixtures that would FLIP (expects complete today) ---");
  var flips = rows.filter(function(r) { return r.qaExpectsComplete; });
  THRESHOLDS.forEach(function(t) {
    var flipped = flips.filter(function(r) { return r.qaFlip[t.key]; });
    console.log(t.key + ": " + flipped.length + "/" + flips.length + " QA-complete fixtures flip");
    flipped.forEach(function(r) {
      console.log("  - " + r.id + " (" + r.label + ") " + r.coveragePct + "% -> " + r.hypo[t.key].overall);
    });
  });

  console.log("\n--- Distribution counts (all " + rows.length + " profiles) ---");
  THRESHOLDS.forEach(function(t) {
    var counts = { incomplete: 0, preliminary: 0, complete: 0 };
    rows.forEach(function(r) {
      counts[r.hypo[t.key].overall]++;
    });
    console.log(t.key + ": incomplete=" + counts.incomplete + " preliminary=" + counts.preliminary + " complete=" + counts.complete);
  });

  console.log("\n--- Expense-state distribution (profiles with gastos > 0 only) ---");
  var withGastos = rows.filter(function(r) { return r.gastosTotal > 0; });
  THRESHOLDS.forEach(function(t) {
    var counts = { incomplete: 0, preliminary: 0, complete: 0 };
    withGastos.forEach(function(r) {
      var e = r.hypo[t.key].expenses;
      if (e === "incomplete" || e === "missing") counts.incomplete++;
      else if (e === "preliminary") counts.preliminary++;
      else counts.complete++;
    });
    console.log(t.key + " expenses: incomplete/missing=" + counts.incomplete + " preliminary=" + counts.preliminary + " complete=" + counts.complete + " (n=" + withGastos.length + ")");
  });

  console.log("\n--- Current stub vs coverage: expense reclassification ---");
  rows.filter(function(r) {
    return r.gastosTotal > 0 && r.current.expenses === "complete";
  }).forEach(function(r) {
    var changes = THRESHOLDS.filter(function(t) {
      return r.hypo[t.key].expenses !== "complete";
    }).map(function(t) { return t.key + "->" + r.hypo[t.key].expenses; });
    if (changes.length) {
      console.log(r.id + " (" + r.coveragePct + "%): " + changes.join(", "));
    }
  });

  console.log("\nAudit complete. No production code modified.");
})();
