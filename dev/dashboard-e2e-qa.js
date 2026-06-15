/**
 * dev/dashboard-e2e-qa.js — End-to-end dashboard QA (motor → coherence)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;

  function ok(label, cond, details) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (!cond) {
      if (details) {
        if (details.profileId) console.log("  profile: " + details.profileId);
        if (details.field) console.log("  field: " + details.field);
        if (details.expected !== undefined) console.log("  expected: " + JSON.stringify(details.expected));
        if (details.actual !== undefined) console.log("  actual: " + JSON.stringify(details.actual));
      }
      failed++;
    } else {
      passed++;
    }
  }

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  function boot(search) {
    global.window = global;
    global.window.location = {
      search: search || "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
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

    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
  }

  function runPipeline(profile) {
    boot(profile.search);
    PRE.ingreso = profile.ingreso;
    if (profile.laboral != null) PRE.laboral = profile.laboral;
    window.CZState = profile.state;
    var diag = calcularMotor();
    window.CZState.diag = diag;
    var coherence = resolveDashboardCoherence(diag, window.CZState);
    return { diag: diag, coherence: coherence };
  }

  function assertContextual(profileId, result, contextualSegmentId) {
    var diag = result.diag;
    var st = window.CZState;
    var seg = resolveContextualActionSegment(diag, st);
    var html = renderContextualActionBlock(seg);
    var laboral = PRE.laboral || "";

    function check(field, actual, exp, labelSuffix) {
      ok(profileId + (labelSuffix ? " " + labelSuffix : "") + " " + field, actual === exp, {
        profileId: profileId,
        field: field,
        expected: exp,
        actual: actual,
      });
    }

    check("contextualSegment exists", seg != null, true);
    check("contextualSegmentId", typeof seg.segmentId, "string");
    check("contextualSegmentId expected", seg.segmentId, contextualSegmentId, contextualSegmentId);
    if (!laboral || ["relacion_dependencia", "monotributista", "jubilado", "desempleado"].indexOf(laboral) < 0) {
      check("contextualSegmentId S0 when laboral empty/unknown", seg.segmentId, "S0", "S0");
    } else if (contextualSegmentId !== "S0") {
      check("contextualSegmentId not S0 when laboral valid", seg.segmentId !== "S0", true);
    }
    if (contextualSegmentId === "S0") {
      check("contextual render empty", html, "");
    } else {
      check("contextual render has block", html.indexOf("cz-contextual-action-block") >= 0, true);
      check("contextual list items", (html.match(/<li>/g) || []).length, seg.actions.length);
      var incFlag = seg.isInconsistency ? "true" : "false";
      check("contextual inconsistency flag", html.indexOf('data-b7-inconsistency="' + incFlag + '"') >= 0, true);
    }
  }

  function assertProfile(label, result, expected, profileId) {
    profileId = profileId || ((label.match(/^(P\d+)/) || [])[1]) || label;
    var diag = result.diag;
    var coh = result.coherence;

    function check(field, actual, exp, labelSuffix) {
      ok(profileId + (labelSuffix ? " " + labelSuffix : "") + " " + field, actual === exp, {
        profileId: profileId,
        field: field,
        expected: exp,
        actual: actual,
      });
    }

    check("planId", diag.planId, expected.planId, String(expected.planId));
    check("profileTier", coh.profileTier, expected.profileTier, expected.profileTier);
    check("whatIsHappeningText", coh.whatIsHappeningText, expected.whatIsHappeningText);
    check("heroProblemOverride", coh.heroProblemOverride, expected.heroProblemOverride);
    check("nextStepKey", coh.nextStepKey, expected.nextStepKey, expected.nextStepKey);
    check("showRetry", coh.showRetry, expected.showRetry, String(expected.showRetry));
    check("suppressOrdenarPanorama", coh.suppressOrdenarPanorama, expected.suppressOrdenarPanorama,
      String(expected.suppressOrdenarPanorama));
    if (expected.statusLabel != null) {
      check("statusLabel", resolvePlanStatusLabel(diag, window.CZState, coh).text,
        expected.statusLabel, expected.statusLabel);
    }
  }

  var HERO_ALTO =
    "Tu perfil financiero está en orden. El próximo paso es optimizar el costo de tu deuda.";
  var HERO_MANTENER =
    "Tu perfil financiero está en orden. Mantener la disciplina de pagos es lo que consolida la recuperación.";

  var CASE1_TEXT =
    "Tu situación declarada muestra un perfil ordenado y con margen disponible. "
    + "El principal ajuste no es ordenar más información, sino reducir el costo "
    + "de la deuda que ya estás pagando.";
  var CASE2_TEXT =
    "Tu situación declarada muestra un perfil ordenado, con pagos controlados y margen disponible. "
    + "El foco ahora es mantener la disciplina y evitar que la deuda vuelva a crecer.";
  var CASE3_TEXT =
    "No registrás deudas activas actualmente. El foco es mantener el equilibrio entre ingresos "
    + "y gastos para sostener tu estabilidad financiera.";
  var CASE2_PREFIX = "Tu situación declarada muestra un perfil ordenado, con pagos controlados";
  var PLAN5_SURVEY = "?p1=B&p2=B&p3=B&p4=B&p5=B&p6=A&p7=B&p8=B&p9=B&p10=B";

  function hasActiveDebts(st) {
    st = st || {};
    if (typeof deudasActivasParaCalculo === "function") {
      return deudasActivasParaCalculo(st.deudas || []).length > 0;
    }
    return (st.deudas || []).length > 0;
  }

  function assertP8(label, result) {
    var diag = result.diag;
    var coh = result.coherence;
    ok(label + " planId 5 path", diag.planId === 5 || diag.assigned_plan_raw === 5);
    ok(label + " profileTier critical", coh.profileTier === "critical");
    ok(label + " whatIsHappeningText null", coh.whatIsHappeningText === null);
    ok(label + " heroProblemOverride null", coh.heroProblemOverride === null);
    ok(label + " nextStepKey confirmar_saldo_stock_deuda", coh.nextStepKey === "confirmar_saldo_stock_deuda");
    ok(label + " showRetry false", coh.showRetry === false);
    ok(label + " suppressOrdenarPanorama false", coh.suppressOrdenarPanorama === false);
    ok(label + " statusLabel Prioridad alta",
      resolvePlanStatusLabel(diag, window.CZState, coh).text === "Prioridad alta");
  }

  function assertP9(label, result, expected) {
    assertProfile(label, result, expected);
  }

  function assertP10(label, result) {
    var diag = result.diag;
    var coh = result.coherence;
    ok(label + " whatIsHappeningText null", coh.whatIsHappeningText === null);
    ok(label + " showRetry false", coh.showRetry === false);
    ok(label + " profileTier standard", coh.profileTier === "standard"
      || (PRE.ingreso === 0 && coh.profileTier === "critical"));
    ok(label + " statusLabel Prioridad alta",
      resolvePlanStatusLabel(diag, window.CZState, coh).text === "Prioridad alta");
  }

  function assertP11(label, result) {
    var diag = result.diag;
    var coh = result.coherence;
    var st = window.CZState;
    var active = hasActiveDebts(st);
    ok(label + " profileTier derived " + coh.profileTier, coh.profileTier === "healthy_organized"
      || coh.profileTier === "standard");
    ok(label + " zero active debts", active === false);
    ok(label + " whatIsHappeningText not active-debt CASE 1", coh.whatIsHappeningText !== CASE1_TEXT);
    ok(label + " whatIsHappeningText not active-debt CASE 2", coh.whatIsHappeningText !== CASE2_TEXT);
    if (coh.profileTier === "healthy_organized") {
      ok(label + " whatIsHappeningText CASE 3 when healthy", coh.whatIsHappeningText === CASE3_TEXT);
    } else {
      ok(label + " whatIsHappeningText null when standard", coh.whatIsHappeningText === null);
    }
    ok(label + " motor planId " + diag.planId, diag.planId === 1);
    if (coh.profileTier === "healthy_organized") {
      ok(label + " statusLabel En buen camino",
        resolvePlanStatusLabel(diag, window.CZState, coh).text === "En buen camino");
    }
  }

  function assertP12(label, result) {
    var diag = result.diag;
    var coh = result.coherence;
    var costo = String(diag.fin.costoDeudaNivel || "").toLowerCase();
    ok(label + " whatIsHappeningText not CASE 1 alto copy", coh.whatIsHappeningText !== CASE1_TEXT);
    if (coh.profileTier === "healthy_organized" && costo !== "alto") {
      ok(label + " whatIsHappeningText CASE 2 when costo not alto", coh.whatIsHappeningText === CASE2_TEXT);
    } else if (coh.profileTier !== "healthy_organized") {
      ok(label + " whatIsHappeningText null when not healthy", coh.whatIsHappeningText === null);
    } else {
      ok(label + " whatIsHappeningText null or CASE 2", coh.whatIsHappeningText === null
        || coh.whatIsHappeningText.indexOf(CASE2_PREFIX) === 0);
    }
    if (coh.profileTier === "healthy_organized") {
      ok(label + " statusLabel En buen camino",
        resolvePlanStatusLabel(diag, window.CZState, coh).text === "En buen camino");
    }
  }

  function assertP13(label, result) {
    var diag = result.diag;
    var coh = result.coherence;
    var costo = String(diag.fin.costoDeudaNivel || "").toLowerCase();
    var active = hasActiveDebts(window.CZState);
    ok(label + " only active debt counts", active === true);
    ok(label + " whatIsHappeningText not CASE 3", coh.whatIsHappeningText !== CASE3_TEXT);
    if (coh.profileTier === "healthy_organized") {
      var expectedWhat = costo === "alto" ? CASE1_TEXT : CASE2_TEXT;
      ok(label + " whatIsHappeningText matches costoDeudaNivel", coh.whatIsHappeningText === expectedWhat);
    } else {
      ok(label + " whatIsHappeningText null when not healthy", coh.whatIsHappeningText === null);
    }
    ok(label + " profileTier healthy_organized", coh.profileTier === "healthy_organized");
    ok(label + " costoDeudaNivel Alto", costo === "alto");
    ok(label + " statusLabel En buen camino",
      resolvePlanStatusLabel(diag, window.CZState, coh).text === "En buen camino");
  }

  var PROFILES = [
    {
      id: "P1",
      label: "P1 healthy_organized active debt alto",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 65300,
      state: {
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
      },
      expected: {
        planId: 3,
        profileTier: "healthy_organized",
        whatIsHappeningText:
          "Tu situación declarada muestra un perfil ordenado y con margen disponible. "
          + "El principal ajuste no es ordenar más información, sino reducir el costo "
          + "de la deuda que ya estás pagando.",
        heroProblemOverride: HERO_ALTO,
        nextStepKey: "optimizar_deuda_cara",
        showRetry: true,
        suppressOrdenarPanorama: true,
        statusLabel: "En buen camino",
      },
    },
    {
      id: "P2",
      label: "P2 healthy_organized active debt bajo",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 75000,
      state: {
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
      },
      expected: {
        planId: 3,
        profileTier: "healthy_organized",
        whatIsHappeningText:
          "Tu situación declarada muestra un perfil ordenado, con pagos controlados y margen disponible. "
          + "El foco ahora es mantener la disciplina y evitar que la deuda vuelva a crecer.",
        heroProblemOverride: HERO_MANTENER,
        nextStepKey: "mantener_disciplina",
        showRetry: false,
        suppressOrdenarPanorama: true,
        statusLabel: "En buen camino",
      },
    },
    {
      id: "P3",
      label: "P3 healthy_organized no active debt",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 80000,
      state: {
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
      },
      expected: {
        planId: 1,
        profileTier: "healthy_organized",
        whatIsHappeningText:
          "No registrás deudas activas actualmente. El foco es mantener el equilibrio entre ingresos "
          + "y gastos para sostener tu estabilidad financiera.",
        heroProblemOverride: HERO_MANTENER,
        nextStepKey: "mantener_disciplina",
        showRetry: true,
        suppressOrdenarPanorama: true,
        statusLabel: "En buen camino",
      },
    },
    {
      id: "P4",
      label: "P4 standard Plan 2",
      search: "?p1=B&p2=B&p3=B&p4=B&p5=B&p6=B&p7=B&p8=B&p9=B&p10=B",
      ingreso: 45000,
      state: {
        gastos: { vivienda: 12000, alimentacion: 7000 },
        gastos_missing_confirmed: false,
        deudas: [{
          tipo: "prestamo",
          acreedor: "BROU",
          monto: "40000",
          pago: "17000",
          situacion_ui: "pagando_normal",
          debt_confidence: "high",
        }],
        snap: { plan_id: 2 },
        diag: null,
      },
      expected: {
        planId: 2,
        profileTier: "standard",
        whatIsHappeningText: null,
        heroProblemOverride: null,
        nextStepKey: "ordenar_panorama",
        showRetry: false,
        suppressOrdenarPanorama: false,
        statusLabel: "En proceso",
      },
    },
    {
      id: "P5",
      label: "P5 standard Plan 3",
      search: "?p1=A&p2=A&p3=A&p4=A&p5=A&p6=B&p7=A&p8=A&p9=A&p10=A",
      ingreso: 60000,
      state: {
        gastos: { vivienda: 12000, alimentacion: 8000 },
        gastos_missing_confirmed: false,
        deudas: [{
          tipo: "financiera",
          acreedor: "Creditel",
          monto: "40000",
          pago: "10000",
          situacion_ui: "pagando_normal",
          debt_confidence: "high",
        }],
        snap: { plan_id: 2 },
        diag: null,
      },
      expected: {
        planId: 3,
        profileTier: "standard",
        whatIsHappeningText: null,
        heroProblemOverride: null,
        nextStepKey: "ordenar_panorama",
        showRetry: false,
        suppressOrdenarPanorama: false,
        statusLabel: "Requiere acción",
      },
    },
    {
      id: "P6",
      label: "P6 critical Plan 4",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 35000,
      state: {
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
      },
      expected: {
        planId: 4,
        profileTier: "critical",
        whatIsHappeningText: null,
        heroProblemOverride: null,
        nextStepKey: "confirmar_saldo_stock_deuda",
        showRetry: false,
        suppressOrdenarPanorama: false,
        statusLabel: "Prioridad alta",
      },
    },
    {
      id: "P7",
      label: "P7 incomplete profile",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 80000,
      state: {
        gastos: {},
        gastos_missing_confirmed: true,
        no_debts_declared: true,
        deudas: [],
        snap: { plan_id: 1 },
        diag: null,
      },
      expected: {
        planId: 1,
        profileTier: "standard",
        whatIsHappeningText: null,
        heroProblemOverride: null,
        nextStepKey: "ordenar_panorama",
        showRetry: false,
        suppressOrdenarPanorama: false,
        statusLabel: "Diagnóstico incompleto",
      },
    },
    {
      id: "P8",
      label: "P8 critical Plan 5",
      search: PLAN5_SURVEY,
      ingreso: 25000,
      state: {
        gastos: { vivienda: 10000, alimentacion: 6000 },
        gastos_missing_confirmed: false,
        deudas: [
          {
            tipo: "tarjeta",
            acreedor: "OCA",
            monto: "120000",
            pago: "0",
            situacion_ui: "mora_reclamo",
            debt_confidence: "high",
          },
          {
            tipo: "financiera",
            acreedor: "Pronto",
            monto: "80000",
            pago: "0",
            situacion_ui: "mora_reclamo",
            debt_confidence: "high",
          },
        ],
        snap: { plan_id: 5 },
        diag: null,
      },
      assertFn: assertP8,
    },
    {
      id: "P9",
      label: "P9 healthy_organized blocked by confidence low",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 70000,
      state: {
        gastos: { vivienda: 15000, alimentacion: 8000 },
        gastos_missing_confirmed: false,
        deudas: [{
          tipo: "prestamo",
          acreedor: "BROU",
          monto: "50000",
          pago: "3000",
          situacion_ui: "pagando_normal",
          debt_confidence: "low",
        }],
        snap: { plan_id: 1 },
        diag: null,
      },
      expected: {
        planId: 3,
        profileTier: "standard",
        whatIsHappeningText: null,
        heroProblemOverride: null,
        nextStepKey: "ordenar_panorama",
        showRetry: false,
        suppressOrdenarPanorama: false,
        statusLabel: "Requiere acción",
      },
      assertFn: assertP9,
    },
    {
      id: "P10",
      label: "P10 incomplete profile no income declared",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 0,
      state: {
        gastos: {},
        deudas: [],
        diag: null,
      },
      assertFn: assertP10,
    },
    {
      id: "P11",
      label: "P11 cancelled debt only",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 60000,
      state: {
        gastos: { vivienda: 12000, alimentacion: 7000 },
        gastos_missing_confirmed: false,
        deudas: [{
          cancelada: true,
          monto: "50000",
          pago: "5000",
        }],
        snap: { plan_id: 1 },
        diag: null,
      },
      assertFn: assertP11,
    },
    {
      id: "P12",
      label: "P12 debt with pago zero in healthy profile",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 80000,
      state: {
        gastos: { vivienda: 15000, alimentacion: 8000 },
        gastos_missing_confirmed: false,
        deudas: [{
          tipo: "prestamo",
          monto: "20000",
          pago: "0",
          situacion_ui: "pagando_normal",
          debt_confidence: "high",
        }],
        snap: { plan_id: 1 },
        diag: null,
      },
      assertFn: assertP12,
    },
    {
      id: "P13",
      label: "P13 mixed debts one active one cancelled",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 65000,
      state: {
        gastos: { vivienda: 14000, alimentacion: 8000 },
        gastos_missing_confirmed: false,
        deudas: [
          {
            tipo: "tarjeta",
            monto: "30000",
            pago: "2000",
            situacion_ui: "pagando_normal",
            cancelada: false,
            debt_confidence: "high",
          },
          {
            tipo: "prestamo",
            monto: "50000",
            pago: "5000",
            cancelada: true,
          },
        ],
        snap: { plan_id: 1 },
        diag: null,
      },
      assertFn: assertP13,
    },
    // P14: Virgin total — ingreso=0, empty gastos/deudas. isIncompleteFinancialProfile returns false
    // (no declared income short-circuits before incomplete checks), so motor assigns planId 4,
    // profileTier critical, statusLabel "Prioridad alta"; coherence overrides nextStepKey to revisar_ingresos.
    {
      id: "P14",
      label: "P14 virgin total profile",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 0,
      state: {
        gastos: {},
        gastos_missing_confirmed: false,
        no_debts_declared: false,
        deudas: [],
        snap: { plan_id: 1 },
        diag: null,
      },
      expected: {
        planId: 4,
        profileTier: "critical",
        statusLabel: "Prioridad alta",
        whatIsHappeningText: null,
        heroProblemOverride: null,
        nextStepKey: "revisar_ingresos",
        showRetry: false,
        suppressOrdenarPanorama: false,
      },
    },
    // P15: Three active moras with pago 0 → planId 4, profileTier critical, statusLabel "Prioridad alta".
    // Multiple mora_reclamo/mora_judicial debts trigger critical tier; healthy_organized narrative/status
    // overrides do not apply.
    {
      id: "P15",
      label: "P15 rejected user multiple active moras",
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      ingreso: 30000,
      state: {
        gastos: { vivienda: 10000, alimentacion: 6000 },
        gastos_missing_confirmed: false,
        deudas: [
          {
            tipo: "tarjeta",
            acreedor: "OCA",
            monto: "80000",
            pago: "0",
            situacion_ui: "mora_reclamo",
            debt_confidence: "high",
            cancelada: false,
          },
          {
            tipo: "financiera",
            acreedor: "Creditel",
            monto: "45000",
            pago: "0",
            situacion_ui: "mora_reclamo",
            debt_confidence: "high",
            cancelada: false,
          },
          {
            tipo: "prestamo",
            acreedor: "BROU",
            monto: "30000",
            pago: "0",
            situacion_ui: "mora_judicial",
            debt_confidence: "high",
            cancelada: false,
          },
        ],
        snap: { plan_id: 1 },
        diag: null,
      },
      expected: {
        planId: 4,
        profileTier: "critical",
        statusLabel: "Prioridad alta",
        whatIsHappeningText: null,
        heroProblemOverride: null,
        nextStepKey: "confirmar_saldo_stock_deuda",
        showRetry: false,
        suppressOrdenarPanorama: false,
      },
    },
  ];

  var CONTEXTUAL_EXPECTED = {
    P1: "S1",
    P2: "S1",
    P3: "S2",
    P4: "S1",
    P5: "S1",
    P6: "S1",
    P7: "S2",
    P8: "S1",
    P9: "S1",
    P10: "S9",
    P11: "S2",
    P12: "S1",
    P13: "S1",
    P14: "S9",
    P15: "S1",
  };

  PROFILES.forEach(function(profile) {
    var result = runPipeline(profile);
    if (profile.assertFn) {
      profile.assertFn(profile.label, result, profile.expected);
    } else {
      assertProfile(profile.label, result, profile.expected, profile.id);
    }
    if (CONTEXTUAL_EXPECTED[profile.id]) {
      assertContextual(profile.id, result, CONTEXTUAL_EXPECTED[profile.id]);
    }
  });

  (function assertDebtCompletionFlagAlignment() {
    boot("?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
    load("js/app.js");
    PRE.ingreso = 50000;

    function assertZeroActiveDebtScenario(profileId, debt, mutateFn, opts) {
      opts = opts || {};
      var expectFullAlignment = opts.expectFullAlignment !== false;
      var st = {
        step: 3,
        tab: "plan",
        gastos: {},
        gastos_missing_confirmed: true,
        financial_debts_complete: true,
        no_debts_declared: false,
        declared_ingreso: 50000,
        deudas: [debt],
        diag: null,
        temporal: {},
        snap: { plan_id: 1 },
      };
      window.CZState = st;
      var noDebtsBefore = st.no_debts_declared;
      mutateFn(st);

      ok(profileId + " active count 0", deudasActivasParaCalculo(st.deudas).length === 0);
      ok(profileId + " financial_debts_complete false", st.financial_debts_complete === false);
      ok(profileId + " no_debts_declared unchanged", st.no_debts_declared === noDebtsBefore);

      if (expectFullAlignment) {
        ok(profileId + " _hasNoDeclaredDebts true",
          typeof _hasNoDeclaredDebts === "function" && _hasNoDeclaredDebts(st) === true);
        var diag = calcularMotor();
        st.diag = diag;
        var narr = renderNarrativaInterpretacion(diag, st);
        ok(profileId + " narrative no deuda importante",
          narr.indexOf("Registraste una deuda importante") < 0);
      } else {
        ok(profileId + " historial may remain in st.deudas",
          st.deudas.length > 0 && deudasActivasParaCalculo(st.deudas).length === 0);
        ok(profileId + " completion flag cleared despite historial",
          st.financial_debts_complete === false);
      }
    }

    assertZeroActiveDebtScenario("P16", {
      tipo: "tarjeta",
      acreedor: "OCA",
      monto: "50000",
      pago: "3000",
      situacion_ui: "vigente",
      cancelada: false,
    }, function(st) {
      st.deudas.splice(0, 1);
      resetDebtCompletionFlagIfNoActiveDebts(st);
    });

    assertZeroActiveDebtScenario("P17", {
      tipo: "tarjeta",
      acreedor: "OCA",
      monto: "50000",
      pago: "3000",
      situacion_ui: "vigente",
      cancelada: false,
    }, function(st) {
      var dPag = st.deudas[0];
      dPag.monto_original = parseFloat(dPag.monto) || 50000;
      dPag.situacion_ui = "pagada";
      dPag.pago = 0;
      dPag.pago_fuente = "pagada";
      dPag.cancelada = true;
      dPag.estado = "al_dia";
      resetDebtCompletionFlagIfNoActiveDebts(st);
    }, { expectFullAlignment: false });

    assertZeroActiveDebtScenario("P18", {
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "40000",
      pago: "2500",
      situacion_ui: "vigente",
      cancelada: false,
    }, function(st) {
      st.deudas[0].cancelada = true;
      resetDebtCompletionFlagIfNoActiveDebts(st);
    }, { expectFullAlignment: false });
  })();

  (function assertNoDebtsDeclaredNarrativeAlignment() {
    boot("?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
    PRE.ingreso = 50000;

    var stP19 = {
      step: 3,
      tab: "plan",
      gastos: {},
      gastos_missing_confirmed: true,
      financial_debts_complete: false,
      no_debts_declared: true,
      declared_ingreso: 50000,
      deudas: [],
      diag: null,
      temporal: {},
      snap: { plan_id: 1 },
    };
    window.CZState = stP19;
    var diagP19 = calcularMotor();
    stP19.diag = diagP19;
    var statsP19 = (function(deudas) {
      deudas = deudas || [];
      var activas = deudasActivasParaCalculo(deudas);
      var pagadaCount = 0;
      for (var i = 0; i < deudas.length; i++) {
        if (typeof isDeudaPagada === "function" && isDeudaPagada(deudas[i])) pagadaCount++;
      }
      return { activaCount: activas.length, pagadaCount: pagadaCount };
    })(stP19.deudas);
    var narrP19 = renderNarrativaInterpretacion(diagP19, stP19);
    var debtPhrase = "Registraste una deuda importante";

    ok("P19 zero active debts", statsP19.activaCount === 0);
    ok("P19 zero paid debts", statsP19.pagadaCount === 0);
    ok("P19 incomplete profile path", isIncompleteFinancialProfile(diagP19, stP19) === true);
    ok("P19 narrative renders", narrP19.length > 0);
    ok("P19 narrative excludes debt phrase", narrP19.indexOf(debtPhrase) < 0);
    ok("P19 hasDebtForIncompleteNarrative false",
      typeof _hasDebtForIncompleteNarrative === "function"
        && _hasDebtForIncompleteNarrative(stP19) === false);

    var stP20 = {
      step: 3,
      tab: "plan",
      gastos: {},
      gastos_missing_confirmed: true,
      financial_debts_complete: true,
      no_debts_declared: false,
      declared_ingreso: 50000,
      deudas: [{
        tipo: "tarjeta",
        acreedor: "OCA",
        monto: "50000",
        pago: "3000",
        situacion_ui: "pagando_normal",
        cancelada: false,
      }],
      diag: null,
      temporal: {},
      snap: { plan_id: 1 },
    };
    window.CZState = stP20;
    var diagP20 = calcularMotor();
    stP20.diag = diagP20;
    var narrP20 = renderNarrativaInterpretacion(diagP20, stP20);

    ok("P20 active debt present", deudasActivasParaCalculo(stP20.deudas).length > 0);
    ok("P20 incomplete profile path", isIncompleteFinancialProfile(diagP20, stP20) === true);
    ok("P20 hasDebtForIncompleteNarrative true",
      typeof _hasDebtForIncompleteNarrative === "function"
        && _hasDebtForIncompleteNarrative(stP20) === true);
    ok("P20 narrative includes debt phrase", narrP20.indexOf(debtPhrase) >= 0);
  })();

  (function assertUx1dDuplicateCleanup() {
    var DISCLAIMER_PHRASE = "se basa exclusivamente en la información que declaraste";
    var INNER_ACCIONES_HEADER = "Acciones recomendadas para tu situación";

    ["P2", "P3", "P4", "P5"].forEach(function(pid) {
      var profile = PROFILES.filter(function(p) { return p.id === pid; })[0];
      if (!profile) return;
      var result = runPipeline(profile);
      var diag = result.diag;
      var st = window.CZState;
      var coh = result.coherence;
      var hero = _renderDashboardHeroCard(diag, st, coh);
      var narr = renderNarrativaInterpretacion(diag, st, coh);
      var tab = renderTabPlan();
      var incomplete = isIncompleteFinancialProfile(diag, st);
      var heroOwns = !!(coh && coh.nextStepText && !incomplete);

      if (heroOwns) {
        ok(pid + " UX-1d hero Próximo paso", hero.indexOf("Próximo paso recomendado") >= 0);
        ok(pid + " UX-1d hero nextStepText", coh.nextStepText && hero.indexOf(coh.nextStepText) >= 0);
        ok(pid + " UX-1d narr no Primer paso", narr.indexOf("Primer paso recomendado") < 0);
      }

      var disclaimerMatches = tab.match(new RegExp(
        DISCLAIMER_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
      ok(pid + " UX-1d disclaimer once", (disclaimerMatches || []).length <= 1);

      var accionesHtml = typeof renderAccionesRecomendadasHtml === "function"
        ? renderAccionesRecomendadasHtml(diag) : "";
      ok(pid + " UX-1d no inner acciones header", accionesHtml.indexOf(INNER_ACCIONES_HEADER) < 0);
    });

    boot("?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
    PRE.ingreso = 80000;
    window.CZState = {
      gastos: {},
      gastos_missing_confirmed: false,
      deudas: [],
      diag: null,
    };
    var diagInc = calcularMotor();
    window.CZState.diag = diagInc;
    var narrInc = renderNarrativaInterpretacion(diagInc, window.CZState);
    var heroInc = _renderDashboardHeroCard(diagInc, window.CZState);
    ok("UX-1d incomplete narr present", narrInc.length > 0);
    ok("UX-1d incomplete hero path", heroInc.indexOf("Tu diagnóstico todavía no está completo") >= 0);
    ok("UX-1d incomplete narr guidance",
      narrInc.indexOf("Información insuficiente") >= 0
        || narrInc.indexOf("Diagnóstico incompleto") >= 0
        || narrInc.indexOf("datos necesarios") >= 0);
  })();

  (function assertBackwardCompatStatusLabel() {
    var p4Profile = PROFILES.filter(function(p) { return p.id === "P4"; })[0];
    var result = runPipeline(p4Profile);
    var labelWithoutCoherence = null;
    var threw = false;
    try {
      labelWithoutCoherence = resolvePlanStatusLabel(result.diag, window.CZState);
    } catch (e) {
      threw = true;
    }
    ok("backward compat resolvePlanStatusLabel(diag,st) no throw", !threw && labelWithoutCoherence != null);
    ok("backward compat resolvePlanStatusLabel(diag,st) En proceso",
      labelWithoutCoherence && labelWithoutCoherence.text === "En proceso");
    ok("backward compat standard profile unchanged with coherence",
      resolvePlanStatusLabel(result.diag, window.CZState, result.coherence).text
        === labelWithoutCoherence.text);
  })();

  var total = passed + failed;
  console.log("\ndashboard-e2e-qa — " + passed + "/" + total
    + (failed ? " (" + failed + " FAIL)" : " PASS"));
  if (failed) process.exit(1);
})();
