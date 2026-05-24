// =============================================================================
// czDebug.js — QA / calibration helpers for Credizona Mi Plan
//
// ACTIVATION: only runs when URL contains ?czdev=true
// NEVER loads in production (conditional script tag in index.html)
//
// Usage (browser console):
//   CZDebug.runTestReport()     — run all 7 scenarios and print QA report
//   CZDebug.getMetadata()       — passive metadata for current live session
//   CZDebug.CZ_EVENTS           — future event name reference
// =============================================================================

if (!location.search.includes("czdev=true")) {
  throw new Error("[czDebug] Not in dev mode. czDebug.js should not be loaded outside ?czdev=true.");
}

// =============================================================================
// FUTURE EVENT MAP — reference only, NOT fired anywhere
// These names are documented here for future CRM/analytics integration.
// =============================================================================
var CZ_EVENTS = Object.freeze({
  DIAGNOSIS_GENERATED:               "cz_mp_diagnosis_generated",
  BLOCKERS_DETECTED:                 "cz_mp_blockers_detected",
  REQUALIFICATION_HORIZON_ESTIMATED: "cz_mp_requalification_horizon_estimated",
  PRIORITY_DEBT_IDENTIFIED:          "cz_mp_priority_debt_identified",
  BEHAVIORAL_REFINEMENT_OFFERED:     "cz_mp_behavioral_refinement_offered",
  BEHAVIORAL_REFINEMENT_COMPLETED:   "cz_mp_behavioral_refinement_completed",
  CASHFLOW_SIMULATION_USED:          "cz_mp_cashflow_simulation_used",
  COMPLEMENTARY_INCOME_ENTERED:      "cz_mp_complementary_income_entered",
  PREMIUM_MODAL_OPENED:              "cz_mp_premium_modal_opened",
  PREMIUM_CHECKOUT_STARTED:          "cz_mp_premium_checkout_started",
  // TBD — requires real Equifax/BCU outcome data and reactivation feedback loop:
  // REACTIVATION_CANDIDATE_DETECTED: "cz_mp_reactivation_candidate_detected",
});

// =============================================================================
// TEST SCENARIOS — 7 deterministic profiles reflecting Uruguay consumer reality
// Income range: UYU 25.000 – 80.000 | Debt range: UYU 20.000 – 300.000
// =============================================================================
var SCENARIOS = [

  // 1 — PERFIL CRITICO
  // Expected: flujoLibre < 0, plan 4, multiple blockers, case 1 interpretation
  {
    nombre:    "1. Perfil critico",
    ingreso:   35000,
    gastos:    { alquiler: 12000, alimentacion: 9000, transporte: 3000, servicios: 2500 },
    deudas:    [
      { tipo: "tarjeta",   acreedor: "OCA",               monto: "80000", pago: "4500", estado: "mora"         },
      { tipo: "financiera", acreedor: "Creditel",          monto: "50000", pago: "3500", estado: "atraso_grave" },
      { tipo: "informal",  acreedor: "Prestamo informal",  monto: "30000", pago: "3000", estado: "al_dia"       },
    ],
    respuestas: { p1:null, p2:null, p3:null, p4:null, p5:null, p6:null, p7:null, p8:null, p9:null, p10:null },
  },

  // 2 — FLUJO POSITIVO CON ATRASOS
  // Expected: flujoLibre > 0, cantMoras >= 1, case 2 interpretation
  {
    nombre:    "2. Flujo positivo con atrasos",
    ingreso:   55000,
    gastos:    { alquiler: 15000, alimentacion: 9000, servicios: 2000 },
    deudas:    [
      { tipo: "tarjeta",  acreedor: "BROU Tarjeta", monto: "45000", pago: "3500", estado: "atraso_grave" },
      { tipo: "prestamo", acreedor: "Itau",          monto: "80000", pago: "5000", estado: "al_dia"       },
    ],
    respuestas: { p1:null, p2:null, p3:null, p4:null, p5:null, p6:null, p7:null, p8:null, p9:null, p10:null },
  },

  // 3 — RATIO ALTO SIN ATRASOS
  // Expected: ratio > 0.35, cantMoras = 0, case 4 interpretation
  {
    nombre:    "3. Ratio alto sin atrasos",
    ingreso:   45000,
    gastos:    { alquiler: 10000, alimentacion: 7000, servicios: 1500 },
    deudas:    [
      { tipo: "financiera",  acreedor: "Creditel", monto: "80000", pago: "6500", estado: "al_dia" },
      { tipo: "tarjeta",     acreedor: "OCA",       monto: "60000", pago: "5000", estado: "al_dia" },
      { tipo: "cooperativa", acreedor: "ANDA",      monto: "40000", pago: "5000", estado: "al_dia" },
    ],
    respuestas: { p1:null, p2:null, p3:null, p4:null, p5:null, p6:null, p7:null, p8:null, p9:null, p10:null },
  },

  // 4 — DEUDA INFORMAL SOLAMENTE
  // Expected: cantInformales > 0, cantMoras = 0, case 3 interpretation
  {
    nombre:    "4. Deuda informal solamente",
    ingreso:   40000,
    gastos:    { alquiler: 10000, alimentacion: 8000, transporte: 2000 },
    deudas:    [
      { tipo: "informal", acreedor: "Prestamo informal", monto: "60000", pago: "5000", estado: "al_dia" },
    ],
    respuestas: { p1:null, p2:null, p3:null, p4:null, p5:null, p6:null, p7:null, p8:null, p9:null, p10:null },
  },

  // 5 — PERFIL LIMPIO / BAJO RIESGO
  // Expected: flujoLibre >> 0, ratio < 0.35, cantMoras = 0, case 5 (default)
  {
    nombre:    "5. Perfil limpio bajo riesgo",
    ingreso:   75000,
    gastos:    { alquiler: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 },
    deudas:    [
      { tipo: "prestamo", acreedor: "BROU", monto: "100000", pago: "7000", estado: "al_dia" },
    ],
    respuestas: { p1:null, p2:null, p3:null, p4:null, p5:null, p6:null, p7:null, p8:null, p9:null, p10:null },
  },

  // 6 — USUARIO VIRGEN (sin encuesta conductual, datos minimos)
  // Expected: hasBehavioral = false, refinement CTA should be offered
  {
    nombre:    "6. Usuario virgen sin encuesta",
    ingreso:   50000,
    gastos:    { alimentacion: 5000, servicios: 1500 },
    deudas:    [
      { tipo: "tarjeta", acreedor: "ABITAB", monto: "20000", pago: "2000", estado: "al_dia" },
    ],
    respuestas: { p1:null, p2:null, p3:null, p4:null, p5:null, p6:null, p7:null, p8:null, p9:null, p10:null },
  },

  // 7 — CASO BORDE (ingreso muy bajo, sin deudas)
  // Expected: no priority debt, should not crash, UI should degrade gracefully
  {
    nombre:    "7. Caso borde — ingreso bajo sin deudas",
    ingreso:   18000,
    gastos:    { alquiler: 7000, alimentacion: 8000 },
    deudas:    [],
    respuestas: { p1:null, p2:null, p3:null, p4:null, p5:null, p6:null, p7:null, p8:null, p9:null, p10:null },
  },
];

// =============================================================================
// STATE INJECTION HELPER
// Temporarily replaces global state, runs calcularMotor(), restores state.
// NOTE: TIENE_ENCUESTA is a global const evaluated at page load and cannot be
// overridden. All test enc.score values reflect URL survey params, not scenarios.
// =============================================================================
function _runScenario(scenario) {
  var origGastos  = window.CZState ? window.CZState.gastos  : {};
  var origDeudas  = window.CZState ? window.CZState.deudas  : [];
  var origSnap    = window.CZState ? window.CZState.snap    : null;
  var origIngreso = PRE.ingreso;
  var origResp    = PRE.respuestas;

  try {
    if (!window.CZState) window.CZState = {};
    window.CZState.gastos = scenario.gastos;
    window.CZState.deudas = scenario.deudas;
    window.CZState.snap   = null;
    PRE.ingreso    = scenario.ingreso;
    PRE.respuestas = scenario.respuestas;

    var result = calcularMotor();
    var hasBehavioral = Object.values(scenario.respuestas || {}).some(function(v) { return v !== null; });
    return { result: result, hasBehavioral: hasBehavioral, error: null };

  } catch (e) {
    return { result: null, hasBehavioral: false, error: e.message || String(e) };

  } finally {
    window.CZState.gastos = origGastos;
    window.CZState.deudas = origDeudas;
    window.CZState.snap   = origSnap;
    PRE.ingreso    = origIngreso;
    PRE.respuestas = origResp;
  }
}

// =============================================================================
// QA CHECKS — deterministic assertions for each scenario
// =============================================================================
function _runChecks(scenario, result, hasBehavioral) {
  var r    = result;
  var fin  = r.fin;
  var prio = r.prio;
  var ok   = [];
  var warn = [];

  // Flujo negativo → case 1 interpretation
  if (fin.flujoLibre <= 0) {
    if (r.interpretacion.principal.indexOf("no hay margen") !== -1) {
      ok.push("interpretacion matches case 1 (flujo <= 0)");
    } else {
      warn.push("flujoLibre <= 0 but interpretation does not match expected case 1 copy");
    }
  }

  // Active arrears → case 2 (only if flujoLibre > 0)
  if (fin.flujoLibre > 0 && fin.cantMoras > 0) {
    if (r.interpretacion.principal.indexOf("atrasos actuales") !== -1) {
      ok.push("interpretacion matches case 2 (moras with positive flow)");
    } else {
      warn.push("cantMoras > 0 with positive flujo but interpretation does not match case 2");
    }
  }

  // Priority debt should not be al_dia if active arrears exist
  if (prio && fin.cantMoras > 0 && prio.estado === "al_dia") {
    warn.push("PRIORITY DEBT IS al_dia but cantMoras > 0 — algo deberia estar en mora/atraso_grave");
  } else if (prio && fin.cantMoras > 0) {
    ok.push("priority debt has active arrears status (correct — not al_dia over mora)");
  }

  // Informal debt blocker should not be described as direct Clearing blocker
  var infBl = r.bloqueadores.find(function(b) { return b.tipo === "informal"; });
  if (infBl) {
    ok.push("informal blocker present — verify UI shows cash-flow framing, not Clearing-blocker framing");
  }

  // No behavioral survey → refinement CTA should be shown (UI check, not algorithmic)
  if (!hasBehavioral) {
    ok.push("no behavioral data — UI refinement CTA should appear in 'Composicion de tu perfil'");
  }

  // No debts edge case
  if (scenario.deudas.length === 0) {
    if (!prio) {
      ok.push("no debts → no priority debt (correct — UI should degrade gracefully)");
    } else {
      warn.push("no debts declared but a priority debt was returned — unexpected");
    }
  }

  // Plan 4 should be assigned for critical profile (scenario 1)
  if (scenario.nombre.indexOf("1.") === 0 && r.planId !== 4) {
    warn.push("expected Plan 4 for critical profile but got Plan " + r.planId);
  }

  // Creditor names should not be empty or generic fallback
  scenario.deudas.forEach(function(d, i) {
    if (!d.acreedor || d.acreedor.trim() === "") {
      warn.push("deuda #" + (i + 1) + " has no acreedor name — UI will fall back to type label");
    }
  });

  return { ok: ok, warn: warn };
}

// =============================================================================
// PASSIVE METADATA — derivable from current live CZState (read-only)
// For future CRM/event use. Does not alter UI or scoring.
// =============================================================================
function _getMetadata() {
  var diag = window.CZState ? window.CZState.diag : null;
  if (!diag) return { error: "No active diagnosis in CZState" };
  return {
    horizon_band:           diag.horizonte ? diag.horizonte.banda : null,
    horizon_months:         diag.horizonte ? diag.horizonte.meses : null,
    blockers_count:         diag.bloqueadores ? diag.bloqueadores.length : 0,
    blocker_types:          diag.bloqueadores ? diag.bloqueadores.map(function(b) { return b.tipo; }) : [],
    has_arrears:            diag.fin ? diag.fin.cantMoras > 0 : false,
    has_informal_debt:      diag.fin ? diag.fin.cantInformales > 0 : false,
    cashflow_status:        diag.fin ? (diag.fin.flujoLibre > 0 ? "positive" : "negative_or_zero") : null,
    behavioral_data_status: Object.values(PRE.respuestas || {}).some(function(v) { return v !== null; }) ? "complete" : "absent",
    plan_id:                diag.planId,
    score:                  diag.scoreReset,
    nivel:                  diag.nivelR,
  };
}

// =============================================================================
// MAIN REPORT FUNCTION
// window.CZDebug.runTestReport() — prints QA report to console only
// =============================================================================
function _runTestReport() {
  var STYLE_HEADER  = "color:#40d7ff;font-weight:bold;font-size:13px;";
  var STYLE_SECTION = "color:#a0b0ff;font-weight:bold;";
  var STYLE_OK      = "color:#34ffaf;";
  var STYLE_WARN    = "color:#ffd36f;font-weight:bold;";
  var STYLE_ERR     = "color:#ff4e72;font-weight:bold;";
  var STYLE_DONE    = "color:#34ffaf;font-size:12px;";

  console.log("%c╔══════════════════════════════════════════╗", STYLE_HEADER);
  console.log("%c  CZDebug — QA Test Report                 ", STYLE_HEADER);
  console.log("%c  Credizona Mi Plan · czdev=true            ", STYLE_HEADER);
  console.log("%c╚══════════════════════════════════════════╝", STYLE_HEADER);
  console.log("%cNOTE: enc.score is always 0 in debug mode (TIENE_ENCUESTA = URL-param const)", "color:#8390b5;font-style:italic;");
  console.log("");

  SCENARIOS.forEach(function(scenario) {
    var run = _runScenario(scenario);

    if (run.error) {
      console.group("%c" + scenario.nombre + " — ERROR", STYLE_ERR);
      console.error("Engine threw:", run.error);
      console.groupEnd();
      return;
    }

    var r    = run.result;
    var fin  = r.fin;
    var prio = r.prio;
    var qa   = _runChecks(scenario, r, run.hasBehavioral);

    console.group("%c" + scenario.nombre, STYLE_SECTION);

    // Core metrics
    console.log("Score:         " + r.scoreReset + " / 30  |  Level: " + r.nivelR + " — " + nivelTexto(r.nivelR));
    console.log("Plan:          " + r.planId + " — " + r.plan.titulo);
    console.log("Cash flow:     " + fmt(fin.flujoLibre) + (fin.flujoLibre <= 0 ? "  ⚠ NEGATIVE/ZERO" : "  ✓ positive"));
    console.log("Ratio:         " + Math.round(fin.ratio * 100) + "%  |  Moras: " + fin.cantMoras + "  |  Informales: " + fin.cantInformales);

    // Blockers
    if (r.bloqueadores.length > 0) {
      console.log("Blockers:      [" + r.bloqueadores.map(function(b) { return b.tipo + "(" + b.impacto + ")"; }).join(", ") + "]");
    } else {
      console.log("Blockers:      (none)");
    }

    // Priority debt
    if (prio) {
      var prioName = prio.acreedor || (DEBT_TYPES.find(function(t) { return t.v === prio.tipo; }) || {}).l || prio.tipo;
      console.log("Priority debt: " + prioName + " | " + prio.tipo + " | " + prio.estado + " | " + fmt(parseFloat(prio.monto) || 0));
    } else {
      console.log("Priority debt: (none)");
    }

    // Horizon
    console.log("Horizon:       " + r.horizonte.label + "  [" + r.horizonte.banda + "]  (" + r.horizonte.meses + " meses estimados)");

    // Interpretation
    console.log("Interpretation:");
    console.log("  P: " + r.interpretacion.principal);
    if (r.interpretacion.secundaria) {
      console.log("  S: " + r.interpretacion.secundaria);
    } else {
      console.log("  S: (null)");
    }

    // Behavioral
    console.log("Behavioral:    " + (run.hasBehavioral ? "complete" : "absent (refinement CTA expected in UI)"));

    // QA results
    if (qa.ok.length > 0) {
      qa.ok.forEach(function(c) { console.log("%c  ✓ " + c, STYLE_OK); });
    }
    if (qa.warn.length > 0) {
      qa.warn.forEach(function(w) { console.warn("%c  ⚠ " + w, STYLE_WARN); });
    }

    console.groupEnd();
    console.log("");
  });

  console.log("%c═══════════════════════════════════════════", STYLE_DONE);
  console.log("%c  Report complete. " + SCENARIOS.length + " scenarios tested.", STYLE_DONE);
  console.log("%c  To inspect live session: CZDebug.getMetadata()", STYLE_DONE);
  console.log("%c  Future event names: CZDebug.CZ_EVENTS", STYLE_DONE);
  console.log("%c═══════════════════════════════════════════", STYLE_DONE);
}

// =============================================================================
// PUBLIC API — exposed only in czdev=true context
// =============================================================================
window.CZDebug = {
  runTestReport: _runTestReport,
  getMetadata:   _getMetadata,
  CZ_EVENTS:     CZ_EVENTS,
  scenarios:     SCENARIOS,
};

console.log("%c[CZDebug] Loaded. Run CZDebug.runTestReport() to start QA.", "color:#40d7ff;font-style:italic;");
