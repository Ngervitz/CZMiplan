/**
 * dev/narrative-alignment-b6f-qa.js — Sprint B6f healthy-profile narrativa alignment (A–J)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var execSync = require("child_process").execSync;
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = {
    search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
    href: "",
  };
  global.document = {
    getElementById: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.enviarCRM = function() {};
  global.localStorage = { getItem: function() { return null; }, setItem: function() {} };
  global.sessionStorage = { getItem: function() { return null; }, setItem: function() {} };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  function boot() {
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
  }

  var CASE1 = "Tu situación declarada muestra un perfil ordenado y con margen disponible";
  var CASE2 = "Tu situación declarada muestra un perfil ordenado, con pagos controlados y margen disponible";
  var CASE3 = "No registrás deudas activas actualmente. El foco es mantener el equilibrio";
  var MOTOR_CONFLICT_A = "Todavía no tenés una visión completa";
  var MOTOR_CONFLICT_B = "Tu situación muestra presión de deuda";

  function motorProblemaTexto(diag) {
    var iv2 = diag.interpretacion_v2;
    if (!iv2 || !iv2.narrativa_jerarquizada) return "";
    var n = getNarrativaByTipo(iv2.narrativa_jerarquizada, "problema_principal");
    return n && n.texto ? n.texto : "";
  }

  function healthyAltoDiag() {
    PRE.ingreso = 65300;
    window.CZState = {
      gastos: { vivienda: 18000, alimentacion: 9000, servicios: 3000, transporte: 2000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "tarjeta",
        acreedor: "OCA",
        monto: "27000",
        pago: "700",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      snap: { plan_id: 1 },
      diag: null,
    };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return diag;
  }

  function healthyBajoDiag() {
    PRE.ingreso = 75000;
    window.CZState = {
      gastos: { alquiler: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "100000",
        pago: "7000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      snap: { plan_id: 2 },
      diag: null,
    };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return diag;
  }

  function healthyZeroDebtDiag() {
    PRE.ingreso = 80000;
    window.CZState = {
      step: 3,
      gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000, transporte: 2000 },
      gastos_missing_confirmed: false,
      no_debts_declared: false,
      deudas: [{
        tipo: "prestamo",
        monto: "50000",
        pago: "5000",
        cancelada: true,
      }],
      snap: { plan_id: 1 },
      diag: null,
    };
    var diag = calcularMotor();
    window.CZState.diag = diag;
    return diag;
  }

  boot();

  // A — healthy_organized + active debt + costoDeudaNivel Alto
  var diagA = healthyAltoDiag();
  var cohA = resolveDashboardCoherence(diagA, window.CZState);
  var narrA = renderNarrativaInterpretacion(diagA, window.CZState, cohA);
  ok("A profileTier healthy_organized", cohA.profileTier === "healthy_organized");
  ok("A whatIsHappeningText CASE 1", cohA.whatIsHappeningText === _WHAT_IS_HAPPENING_HEALTHY_ALTO);
  ok("A narrativa shows CASE 1", narrA.indexOf(CASE1) >= 0);
  ok("A narrativa no motor conflict", narrA.indexOf(MOTOR_CONFLICT_A) < 0 && narrA.indexOf(MOTOR_CONFLICT_B) < 0);

  // B — healthy_organized + active debt + costoDeudaNivel Bajo
  boot();
  var diagB = healthyBajoDiag();
  var cohB = resolveDashboardCoherence(diagB, window.CZState);
  var narrB = renderNarrativaInterpretacion(diagB, window.CZState, cohB);
  ok("B profileTier healthy_organized", cohB.profileTier === "healthy_organized");
  ok("B whatIsHappeningText CASE 2", cohB.whatIsHappeningText === _WHAT_IS_HAPPENING_HEALTHY_MEDIO_BAJO);
  ok("B narrativa shows CASE 2", narrB.indexOf(CASE2) >= 0);
  ok("B narrativa no presion de deuda conflict", narrB.indexOf(MOTOR_CONFLICT_B) < 0);

  // C — healthy_organized + no active debt
  boot();
  var diagC = healthyZeroDebtDiag();
  var cohC = resolveDashboardCoherence(diagC, window.CZState);
  var narrC = renderNarrativaInterpretacion(diagC, window.CZState, cohC);
  ok("C profileTier healthy_organized", cohC.profileTier === "healthy_organized");
  ok("C whatIsHappeningText CASE 3", cohC.whatIsHappeningText === _WHAT_IS_HAPPENING_HEALTHY_ZERO_DEBT);
  ok("C narrativa shows CASE 3", narrC.indexOf(CASE3) >= 0);
  ok("C zero active debt helper true", _isZeroActiveDebtCompleteProfile(diagC, window.CZState) === true);
  var heroC = _renderDashboardHeroCard(diagC, window.CZState, cohC);
  ok("C hero owns next step", heroC.indexOf("Próximo paso recomendado") >= 0
    && cohC.nextStepText && heroC.indexOf(cohC.nextStepText) >= 0);
  ok("C narrativa no duplicate primer paso", narrC.indexOf("Primer paso recomendado") < 0);

  // C2 — low-confidence zero-active-debt keeps motor copy (B2e path, standard tier)
  boot();
  PRE.ingreso = 80000;
  window.CZState = {
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000, transporte: 2000 },
    gastos_missing_confirmed: false,
    financial_expenses_complete: true,
    no_debts_declared: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "50000",
      pago: "5000",
      cancelada: true,
      situacion_ui: "pagando_normal",
    }],
    snap: { plan_id: 1 },
    diag: null,
  };
  var diagC2 = calcularMotor();
  window.CZState.diag = diagC2;
  var cohC2 = resolveDashboardCoherence(diagC2, window.CZState);
  ok("C2 low-confidence tier standard", cohC2.profileTier === "standard");
  ok("C2 whatIsHappeningText null", cohC2.whatIsHappeningText === null);

  // D — standard profile: motor copy unchanged
  boot();
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: { vivienda: 20000, alimentacion: 10000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "50000",
      pago: "15000",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagD = calcularMotor();
  window.CZState.diag = diagD;
  var cohD = resolveDashboardCoherence(diagD, window.CZState);
  var motorD = motorProblemaTexto(diagD);
  var narrD = renderNarrativaInterpretacion(diagD, window.CZState, cohD);
  ok("D profileTier standard", cohD.profileTier === "standard");
  ok("D whatIsHappeningText null", cohD.whatIsHappeningText === null);
  ok("D motor copy preserved", motorD.length > 0 && narrD.indexOf(motorD) >= 0);
  ok("D no CASE override", narrD.indexOf(CASE1) < 0 && narrD.indexOf(CASE2) < 0 && narrD.indexOf(CASE3) < 0);

  // E — critical profile / Plan 4: motor copy unchanged
  boot();
  PRE.ingreso = 35000;
  window.CZState = {
    gastos: { vivienda: 12000, alimentacion: 7000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "tarjeta",
      acreedor: "OCA",
      monto: "90000",
      pago: "0",
      situacion_ui: "mora_reclamo",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diagE = calcularMotor();
  window.CZState.diag = diagE;
  var cohE = resolveDashboardCoherence(diagE, window.CZState);
  var motorE = motorProblemaTexto(diagE);
  var narrE = renderNarrativaInterpretacion(diagE, window.CZState, cohE);
  ok("E planId is 4", diagE.planId === 4);
  ok("E profileTier critical", cohE.profileTier === "critical");
  ok("E whatIsHappeningText null", cohE.whatIsHappeningText === null);
  ok("E motor copy preserved", motorE.length > 0 && narrE.indexOf(motorE) >= 0);

  // F — incomplete profile: existing incomplete narrative unchanged
  boot();
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: false,
    no_debts_declared: false,
    deudas: [],
    diag: null,
  };
  var diagF = calcularMotor();
  window.CZState.diag = diagF;
  var cohF = resolveDashboardCoherence(diagF, window.CZState);
  var narrF = renderNarrativaInterpretacion(diagF, window.CZState, cohF);
  ok("F incomplete path used", narrF.indexOf("Qué está pasando") < 0 || narrF.indexOf("diagnóstico todavía no está completo") >= 0
    || narrF.indexOf("información") >= 0);
  ok("F no CASE override in incomplete", narrF.indexOf(CASE1) < 0 && narrF.indexOf(CASE2) < 0 && narrF.indexOf(CASE3) < 0);

  // G — resolveDashboardCoherence returns whatIsHappeningText
  boot();
  var diagG = healthyAltoDiag();
  var cohG = resolveDashboardCoherence(diagG, window.CZState);
  ok("G returns whatIsHappeningText key", cohG.hasOwnProperty("whatIsHappeningText"));
  ok("G healthy value non-null string", typeof cohG.whatIsHappeningText === "string" && cohG.whatIsHappeningText.length > 0);

  // H — SyntheticMotorQA
  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = execSync("node dev/synthetic-motor-test.js", { cwd: root, encoding: "utf8" });
  ok("H SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  // I — dashboard-coherence-b6b-qa
  console.log("\n--- dashboard-coherence-b6b-qa ---");
  var b6bOut = execSync("node dev/dashboard-coherence-b6b-qa.js", { cwd: root, encoding: "utf8" });
  ok("I dashboard-coherence-b6b-qa 24/24", /Dashboard coherence B6b QA: 24\/24 PASS/.test(b6bOut));

  // J — zero-active-debt-b2e-qa
  console.log("\n--- zero-active-debt-b2e-qa ---");
  var b2eOut = execSync("node dev/zero-active-debt-b2e-qa.js", { cwd: root, encoding: "utf8" });
  ok("J zero-active-debt-b2e-qa 28/28", /zero-active-debt-b2e-qa — 28\/28 PASS/.test(b2eOut));

  // K — UX-1d duplicate cleanup (presentation-only)
  console.log("\n--- UX-1d duplicate cleanup ---");
  var DISCLAIMER_PHRASE = "se basa exclusivamente en la información que declaraste";
  var INNER_ACCIONES_HEADER = "Acciones recomendadas para tu situación";

  boot();
  var diagK1 = healthyAltoDiag();
  var cohK1 = resolveDashboardCoherence(diagK1, window.CZState);
  var narrK1 = renderNarrativaInterpretacion(diagK1, window.CZState, cohK1);
  var heroK1 = _renderDashboardHeroCard(diagK1, window.CZState, cohK1);
  ok("K complete A narr no primer paso when hero owns",
    heroK1.indexOf("Próximo paso recomendado") >= 0 && narrK1.indexOf("Primer paso recomendado") < 0);

  boot();
  var diagK2 = healthyBajoDiag();
  var cohK2 = resolveDashboardCoherence(diagK2, window.CZState);
  var narrK2 = renderNarrativaInterpretacion(diagK2, window.CZState, cohK2);
  ok("K complete B narr no primer paso when hero owns", narrK2.indexOf("Primer paso recomendado") < 0);

  boot();
  PRE.ingreso = 80000;
  window.CZState = {
    gastos: {},
    gastos_missing_confirmed: false,
    deudas: [],
    diag: null,
  };
  var diagKF = calcularMotor();
  window.CZState.diag = diagKF;
  var narrKF = renderNarrativaInterpretacion(diagKF, window.CZState);
  ok("K incomplete narr guidance not suppressed",
    narrKF.length > 0 && (narrKF.indexOf("Información insuficiente") >= 0
      || narrKF.indexOf("Diagnóstico incompleto") >= 0
      || narrKF.indexOf("datos necesarios") >= 0));

  boot();
  var diagKD = healthyAltoDiag();
  window.CZState.diag = diagKD;
  var tabKD = renderTabPlan();
  var disclaimerMatches = tabKD.match(new RegExp(
    DISCLAIMER_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
  ok("K disclaimer at most once in dashboard", (disclaimerMatches || []).length <= 1);

  boot();
  window.CZState.diag = diagKD;
  var accionesKD = typeof renderAccionesRecomendadasHtml === "function"
    ? renderAccionesRecomendadasHtml(diagKD) : "";
  ok("K no inner acciones duplicate header", accionesKD.indexOf(INNER_ACCIONES_HEADER) < 0);

  console.log("\nnarrative-alignment-b6f-qa — " + passed + "/" + (passed + failed)
    + (failed ? " (" + failed + " FAIL)" : " PASS"));
  if (failed) process.exit(1);
})();
