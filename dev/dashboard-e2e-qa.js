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

  function createMockClassList(initial) {
    var classes = (initial || "").split(/\s+/).filter(Boolean);
    return {
      add: function(name) {
        if (name && classes.indexOf(name) < 0) classes.push(name);
      },
      remove: function(name) {
        classes = classes.filter(function(c) { return c !== name; });
      },
      toggle: function(name, force) {
        var has = classes.indexOf(name) >= 0;
        if (force === true) {
          if (!has) classes.push(name);
          return true;
        }
        if (force === false) {
          classes = classes.filter(function(c) { return c !== name; });
          return false;
        }
        if (has) {
          classes = classes.filter(function(c) { return c !== name; });
          return false;
        }
        classes.push(name);
        return true;
      },
      contains: function(name) {
        return classes.indexOf(name) >= 0;
      },
    };
  }

  function createMockElement() {
    return {
      id: "",
      style: {},
      classList: createMockClassList(),
      remove: function() {},
      prepend: function() {},
    };
  }

  function createTestDocument() {
    var created = [];
    var body = createMockElement();
    body.prepend = function(node) {
      body._prepended = node;
    };
    return {
      body: body,
      getElementById: function(id) {
        for (var i = 0; i < created.length; i++) {
          if (created[i].id === id) return created[i];
        }
        return null;
      },
      querySelector: function(sel) {
        if (sel === ".header") return createMockElement();
        return null;
      },
      querySelectorAll: function() { return []; },
      addEventListener: function() {},
      createElement: function() {
        var el = createMockElement();
        created.push(el);
        return el;
      },
    };
  }

  function boot(search) {
    global.window = global;
    global.window.location = {
      search: search || "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      href: "",
    };
    global.document = createTestDocument();
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
    "Tu perfil financiero está en orden. El foco es sostener pagos en fecha y evitar nueva deuda.";

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
    } else if (diag.planId === 1) {
      ok(label + " statusLabel Pendiente de ordenar",
        resolvePlanStatusLabel(diag, window.CZState, coh).text === "Pendiente de ordenar");
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
      var primaryRenders = typeof _willRenderPrimaryActionCard === "function"
        ? _willRenderPrimaryActionCard(diag, st, coh)
        : (!incomplete
            && typeof resolveNextStepContent === "function"
            && (resolveNextStepContent(diag, st, coh).text || "").trim().length > 0);
      var heroOwns = !!(coh && coh.nextStepText && !incomplete && !primaryRenders);

      if (primaryRenders) {
        var primaryUx1d = renderPrimaryActionCard(diag, st, coh);
        var primaryNextText = typeof resolveNextStepContent === "function"
          ? (resolveNextStepContent(diag, st, coh).text || "").trim()
          : "";
        ok(pid + " UX-1d primary renders", primaryUx1d.length > 0);
        ok(pid + " UX-1d hero no Próximo paso", hero.indexOf("Próximo paso recomendado") < 0);
        ok(pid + " UX-1d hero no legacy nextStepText",
          !coh.nextStepText || hero.indexOf(coh.nextStepText) < 0);
        ok(pid + " UX-1d primary owns next step",
          primaryNextText && primaryUx1d.indexOf(primaryNextText) >= 0);
        ok(pid + " UX-1d narr no Primer paso", narr.indexOf("Primer paso recomendado") < 0);
      } else if (heroOwns) {
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

  (function assertFix01bRejectionCopyGating() {
    function assertOrganicContext() {
      ok("FIX-01B organic hasRejectionContext false",
        window.CZ_ENTRY_CONTEXT && window.CZ_ENTRY_CONTEXT.hasRejectionContext === false);
    }

    // Organic — horizon DTI branch + feedback (no CDV URL params)
    boot("?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
    assertOrganicContext();
    PRE.ingreso = 50000;
    window.CZState = {
      gastos: { vivienda: 12000, alimentacion: 8000, transporte: 2000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "60000",
        pago: "5000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      snap: { plan_id: 2 },
      diag: null,
    };
    var diagDti = calcularMotor();
    window.CZState.diag = diagDti;
    var cohDti = resolveDashboardCoherence(diagDti, window.CZState);
    var horizonHtml = renderHorizonteRecalificacion(diagDti, window.CZState, cohDti);
    ok("FIX-01B organic horizon no solicitud rechazada",
      horizonHtml.indexOf("solicitud rechazada") < 0);
    ok("FIX-01B organic horizon neutral DTI copy",
      horizonHtml.indexOf("Con una relaci\u00f3n deuda/ingreso elevada") >= 0);

    var feedbackHtml = renderMiPlanSuggestionBox();
    ok("FIX-01B organic feedback neutral label",
      feedbackHtml.indexOf("Qu\u00e9 afecta mi perfil crediticio") >= 0);
    ok("FIX-01B organic feedback no rechazaron label",
      feedbackHtml.indexOf("Por qu\u00e9 me rechazaron") < 0);

    // Organic — bloqueadores empty state (P3-like zero active debt, complete)
    boot("?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
    assertOrganicContext();
    PRE.ingreso = 80000;
    window.CZState = {
      step: 3,
      gastos: { vivienda: 12000, alimentacion: 8000, salud: 3000, transporte: 2000 },
      gastos_missing_confirmed: false,
      deudas: [{ tipo: "prestamo", monto: "50000", pago: "5000", cancelada: true }],
      snap: { plan_id: 1 },
      diag: null,
    };
    var diagBlock = calcularMotor();
    window.CZState.diag = diagBlock;
    var blockHtml = renderBloqueadores(diagBlock);
    ok("FIX-01B organic bloqueadores no solicitud rechazada",
      blockHtml.indexOf("solicitud rechazada") < 0);
    ok("FIX-01B organic bloqueadores neutral copy",
      blockHtml.indexOf("Eso no garantiza por s\u00ed solo que una evaluaci\u00f3n crediticia sea favorable") >= 0);

    // CDV — rejection context (horizon DTI + feedback)
    boot("?laboral=relacion_dependencia&ingreso=45000&p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
    ok("FIX-01B CDV hasRejectionContext true",
      window.CZ_ENTRY_CONTEXT && window.CZ_ENTRY_CONTEXT.hasRejectionContext === true);
    window.CZState = {
      gastos: { vivienda: 12000, alimentacion: 8000, transporte: 2000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "60000",
        pago: "5000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      snap: { plan_id: 2 },
      diag: null,
    };
    var diagCdv = calcularMotor();
    window.CZState.diag = diagCdv;
    var cohCdv = resolveDashboardCoherence(diagCdv, window.CZState);
    var horizonCdv = renderHorizonteRecalificacion(diagCdv, window.CZState, cohCdv);
    ok("FIX-01B CDV horizon solicitud rechazada",
      horizonCdv.indexOf("solicitud rechazada") >= 0);

    var feedbackCdv = renderMiPlanSuggestionBox();
    ok("FIX-01B CDV feedback rechazaron label",
      feedbackCdv.indexOf("Por qu\u00e9 me rechazaron") >= 0);

    // Bridge + diagnosis screen (render paths)
    boot("");
    window.CZ_ENTRY_CONTEXT = { hasRejectionContext: false };
    var bridgeNeutral = renderBridgeScreen();
    ok("FIX-01B bridge neutral copy",
      bridgeNeutral.indexOf("Conoc\u00e9 d\u00f3nde est\u00e1s parado en menos de 4 minutos") >= 0);
    ok("FIX-01B bridge no rechazo financiero",
      bridgeNeutral.indexOf("El rechazo financiero no siempre depende") < 0);

    boot("?laboral=relacion_dependencia&ingreso=45000&p1=A&p2=B&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A");
    window.CZState = { diag: null };
    var diagScreen = renderDiagnosisScreen();
    ok("FIX-01B CDV diagnosis level A rejection copy",
      diagScreen.indexOf("El rechazo puede estar relacionado") >= 0);

    boot("");
    window.CZ_ENTRY_CONTEXT = { hasRejectionContext: false };
    window.CZState = { diag: { enc: { nivel: "A", flagsRiesgo: [] } } };
    PRE.respuestas = { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" };
    var diagScreenNeutral = renderDiagnosisScreen();
    ok("FIX-01B diagnosis level A neutral copy",
      diagScreenNeutral.indexOf("Tu perfil puede verse afectado por la estructura de tus deudas") >= 0);
    ok("FIX-01B diagnosis level A no rechazo copy",
      diagScreenNeutral.indexOf("El rechazo puede estar relacionado") < 0);
  })();

  (function assertFix01B2PlanTitleAlignment() {
    var p11 = PROFILES.filter(function(p) { return p.id === "P11"; })[0];
    var r11 = runPipeline(p11);
    var heroP11 = _renderDashboardHeroCard(r11.diag, window.CZState, r11.coherence);
    ok("FIX-01B-2 T1 planId 1", r11.diag.planId === 1);
    ok("FIX-01B-2 T1 Claridad Financiera appears", heroP11.indexOf("Claridad Financiera") >= 0);
    ok("FIX-01B-2 T1 Orden Financiero absent", heroP11.indexOf("Orden Financiero") < 0);

    var p3 = PROFILES.filter(function(p) { return p.id === "P3"; })[0];
    var r3 = runPipeline(p3);
    var heroP3 = _renderDashboardHeroCard(r3.diag, window.CZState, r3.coherence);
    ok("FIX-01B-2 T2 healthy planId 1", r3.diag.planId === 1);
    ok("FIX-01B-2 T2 healthy_organized tier", r3.coherence.profileTier === "healthy_organized");
    ok("FIX-01B-2 T2 Claridad Financiera appears", heroP3.indexOf("Claridad Financiera") >= 0);
    ok("FIX-01B-2 T2 Orden Financiero absent", heroP3.indexOf("Orden Financiero") < 0);

    var p8 = PROFILES.filter(function(p) { return p.id === "P8"; })[0];
    var r8 = runPipeline(p8);
    ok("FIX-01B-2 T3 P8 assigned_plan_raw 5 path",
      r8.diag.assigned_plan_raw === 5 || r8.diag.planId === 5);

    boot("?p1=B&p2=B&p3=B&p4=B&p5=B&p6=B&p7=B&p8=B&p9=B&p10=B");
    PRE.ingreso = 55000;
    window.CZState = {
      gastos: { vivienda: 12000, alimentacion: 8000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "30000",
        pago: "5000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      diag: null,
    };
    var diagP5 = calcularMotor();
    window.CZState.diag = diagP5;
    var cohP5 = resolveDashboardCoherence(diagP5, window.CZState);
    var heroP5Plan = _renderDashboardHeroCard(diagP5, window.CZState, cohP5);
    ok("FIX-01B-2 T3 planId 5", diagP5.planId === 5);
    ok("FIX-01B-2 T3 Reconstrucción Crediticia appears",
      heroP5Plan.indexOf("Reconstrucción Crediticia") >= 0);
    ok("FIX-01B-2 T3 Reperfilamiento absent", heroP5Plan.indexOf("Reperfilamiento") < 0);

    var p4 = PROFILES.filter(function(p) { return p.id === "P4"; })[0];
    var r4 = runPipeline(p4);
    var heroP4 = _renderDashboardHeroCard(r4.diag, window.CZState, r4.coherence);
    ok("FIX-01B-2 T4 Reducción de Deuda unchanged", heroP4.indexOf("Reducción de Deuda") >= 0);

    var p5 = PROFILES.filter(function(p) { return p.id === "P5"; })[0];
    var r5 = runPipeline(p5);
    var heroP5 = _renderDashboardHeroCard(r5.diag, window.CZState, r5.coherence);
    ok("FIX-01B-2 T4 Recuperación Rápida unchanged", heroP5.indexOf("Recuperación Rápida") >= 0);

    var p6 = PROFILES.filter(function(p) { return p.id === "P6"; })[0];
    var r6 = runPipeline(p6);
    var heroP6 = _renderDashboardHeroCard(r6.diag, window.CZState, r6.coherence);
    ok("FIX-01B-2 T4 Estabilización Crítica unchanged", heroP6.indexOf("Estabilización Crítica") >= 0);

    PROFILES.forEach(function(profile) {
      if (!profile.expected || profile.expected.planId == null) return;
      var result = runPipeline(profile);
      ok("FIX-01B-2 T5 " + profile.id + " planId unchanged",
        result.diag.planId === profile.expected.planId);
    });
    ok("FIX-01B-2 T5 P8 planId unchanged", r8.diag.planId === 4);
    ok("FIX-01B-2 T5 motor titulo unchanged plan 1",
      r11.diag.plan && r11.diag.plan.titulo === "Orden Financiero");
    ok("FIX-01B-2 T5 motor titulo unchanged plan 5",
      diagP5.plan && diagP5.plan.titulo === "Reperfilamiento");
  })();

  (function assertUx1d2B7ContradictionSuppression() {
    var SURVEY = "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B";
    var crmPayload = null;
    var prevTrackCRM = trackCRMEvent;

    function uxBoot(laboral, ingreso, state) {
      boot(SURVEY);
      PRE.laboral = laboral;
      PRE.ingreso = ingreso;
      window.CZState = state || { diag: null };
      window.CZState.gastos = window.CZState.gastos || {};
      window.CZState.gastos_missing_confirmed = window.CZState.gastos_missing_confirmed != null
        ? window.CZState.gastos_missing_confirmed
        : false;
      window.CZState.deudas = window.CZState.deudas || [];
      window.CZState.herr = window.CZState.herr || { compromisos: {} };
      var diag = calcularMotor();
      window.CZState.diag = diag;
      return diag;
    }

    function uxItemHtml(html, actionId) {
      var re = new RegExp(
        '<div class="compromiso-item[^>]*data-toggle-compromiso="' + actionId + '"[^>]*>[\\s\\S]*?</div>\\s*</div>\\s*</div>'
      );
      var m = html.match(re);
      return m ? m[0] : "";
    }

    function uxOpeningTag(chunk) {
      var end = chunk.indexOf(">");
      return end >= 0 ? chunk.slice(0, end + 1) : chunk;
    }

    function assertFlujoNegativoSuppressed(label, html, diag) {
      var chunk = uxItemHtml(html, "flujo_negativo_accion");
      var openTag = uxOpeningTag(chunk);
      ok(label + " flujo_negativo in DOM", chunk.indexOf("data-toggle-compromiso=\"flujo_negativo_accion\"") >= 0);
      ok(label + " keeps accion-recomendada-item", chunk.indexOf("accion-recomendada-item") >= 0);
      ok(label + " keeps data-accion-index", chunk.indexOf("data-accion-index=") >= 0);
      ok(label + " display none", openTag.indexOf("display:none") >= 0);
      ok(label + " aria-hidden true", openTag.indexOf('aria-hidden="true"') >= 0);
      ok(label + " tabindex -1", openTag.indexOf('tabindex="-1"') >= 0);
      ok(label + " passive class", openTag.indexOf("cz-ux1d2-suppressed-action") >= 0);
      var meta = _ux1d2ShouldSuppressFlujoNegativoAccion(
        diag,
        seleccionarAccionesRecomendadas(diag),
        window.CZState
      );
      ok(label + " visible accessible >= 3", meta.visibleAccessibleCount >= 3);
    }

    function assertFlujoNegativoVisible(label, html) {
      var chunk = uxItemHtml(html, "flujo_negativo_accion");
      if (chunk.indexOf("flujo_negativo_accion") < 0) {
        ok(label + " flujo_negativo present when applicable", false);
        return;
      }
      var openTag = uxOpeningTag(chunk);
      ok(label + " no display none", openTag.indexOf("display:none") < 0);
      ok(label + " no suppression aria-hidden", openTag.indexOf('aria-hidden="true"') < 0);
      ok(label + " no tabindex -1", openTag.indexOf('tabindex="-1"') < 0);
      ok(label + " no passive class", openTag.indexOf("cz-ux1d2-suppressed-action") < 0);
    }

    var diagS1 = uxBoot("relacion_dependencia", 40000, {
      gastos: { vivienda: 25000, alimentacion: 10000, servicios: 5000 },
      deudas: [{
        tipo: "prestamo",
        monto: "50000",
        pago: "8000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      diag: null,
    });
    trackCRMEvent = function(name, payload) {
      if (payload && payload.action_ids) crmPayload = payload;
    };
    global.sessionStorage = {
      getItem: function() { return null; },
      setItem: function() {},
    };
    ok("T-UX1D2-1 segment S1", resolveContextualActionSegment(diagS1, window.CZState).segmentId === "S1");
    ok("T-UX1D2-1 selects flujo_negativo",
      seleccionarAccionesRecomendadas(diagS1).some(function(a) { return a.id === "flujo_negativo_accion"; }));
    var htmlS1 = renderAccionesRecomendadasHtml(diagS1);
    assertFlujoNegativoSuppressed("T-UX1D2-1", htmlS1, diagS1);
    ok("T-UX1D2-1 action_ids includes flujo_negativo",
      crmPayload && crmPayload.action_ids && crmPayload.action_ids.indexOf("flujo_negativo_accion") >= 0);

    // T-UX1D2-2 — S3
    crmPayload = null;
    _accionesRecomExpand = false;
    var diagS3 = uxBoot("monotributista", 40000, {
      gastos: { vivienda: 25000, alimentacion: 10000, servicios: 5000 },
      deudas: [{
        tipo: "prestamo",
        monto: "50000",
        pago: "8000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      diag: null,
    });
    ok("T-UX1D2-2 segment S3", resolveContextualActionSegment(diagS3, window.CZState).segmentId === "S3");
    var htmlS3 = renderAccionesRecomendadasHtml(diagS3);
    assertFlujoNegativoSuppressed("T-UX1D2-2", htmlS3, diagS3);

    // T-UX1D2-3 — S7 no suppression
    _accionesRecomExpand = false;
    var diagS7 = uxBoot("desempleado", 0, {
      gastos: { vivienda: 10000 },
      deudas: [{
        tipo: "prestamo",
        monto: "50000",
        pago: "5000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      diag: null,
    });
    ok("T-UX1D2-3 segment S7", resolveContextualActionSegment(diagS7, window.CZState).segmentId === "S7");
    var htmlS7 = renderAccionesRecomendadasHtml(diagS7);
    assertFlujoNegativoVisible("T-UX1D2-3", htmlS7);

    // T-UX1D2-4 — S0 / no B7 block
    _accionesRecomExpand = false;
    boot(SURVEY);
    PRE.laboral = "";
    PRE.ingreso = 40000;
    window.CZState = {
      gastos: { vivienda: 25000, alimentacion: 10000, servicios: 5000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        monto: "50000",
        pago: "8000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      herr: { compromisos: {} },
      diag: null,
    };
    var diagS0 = calcularMotor();
    window.CZState.diag = diagS0;
    ok("T-UX1D2-4 segment S0", resolveContextualActionSegment(diagS0, window.CZState).segmentId === "S0");
    var htmlS0 = renderAccionesRecomendadasHtml(diagS0);
    assertFlujoNegativoVisible("T-UX1D2-4", htmlS0);

    // T-UX1D2-5 — Ver Más threshold (4 visible accessible when 5 selected, 1 suppressed)
    _accionesRecomExpand = false;
    var diagS1VerMas = uxBoot("relacion_dependencia", 40000, {
      gastos: { vivienda: 25000, alimentacion: 10000, servicios: 5000 },
      deudas: [{
        tipo: "prestamo",
        monto: "50000",
        pago: "8000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      diag: null,
    });
    var htmlS1VerMas = renderAccionesRecomendadasHtml(diagS1VerMas);
    var metaS1 = _ux1d2ShouldSuppressFlujoNegativoAccion(
      diagS1VerMas,
      seleccionarAccionesRecomendadas(diagS1VerMas),
      window.CZState
    );
    ok("T-UX1D2-5 S1 suppress active", metaS1.suppressFlujoNegativo === true);
    ok("T-UX1D2-5 visible accessible count 4", metaS1.visibleAccessibleCount === 4);
    ok("T-UX1D2-5 ver mas button present", htmlS1VerMas.indexOf("btn-ver-mas-acciones") >= 0);
    ok("T-UX1D2-5 suppressed excluded from visible count",
      htmlS1VerMas.indexOf("cz-ux1d2-suppressed-action") >= 0
      && htmlS1VerMas.indexOf("btn-ver-mas-acciones") >= 0);
    if (window.CredizonaUI && typeof window.CredizonaUI.expandAccionesRecomendadas === "function") {
      window.CredizonaUI.expandAccionesRecomendadas();
    }
    ok("T-UX1D2-5 expand flag set", _accionesRecomExpand === true);
    var htmlS1Expanded = renderAccionesRecomendadasHtml(diagS1VerMas);
    ok("T-UX1D2-5 suppressed stays hidden after expand",
      uxOpeningTag(uxItemHtml(htmlS1Expanded, "flujo_negativo_accion")).indexOf("display:none") >= 0);

    // T-UX1D2-6 — Floor guardrail (synthetic 3-action array)
    _accionesRecomExpand = false;
    var floorAcciones = [
      { id: "flujo_negativo_accion", texto: "x", tipo: "accion", urgencia: "alta" },
      { id: "bcu_clearing_distintos", texto: "y", tipo: "accion", urgencia: "media" },
      { id: "historial_6_meses", texto: "z", tipo: "habito", urgencia: "media" },
    ];
    var floorMeta = _ux1d2ShouldSuppressFlujoNegativoAccion(diagS1, floorAcciones, window.CZState);
    ok("T-UX1D2-6 floor aborts suppression", floorMeta.suppressFlujoNegativo === false);
    ok("T-UX1D2-6 floor visible count 3", floorMeta.visibleAccessibleCount === 3);

    // T-UX1D2-7 — Other segments untouched
    var otherSegments = [
      { id: "S2", laboral: "relacion_dependencia", ingreso: 80000, deudas: [] },
      { id: "S4", laboral: "monotributista", ingreso: 80000, deudas: [] },
      { id: "S5", laboral: "jubilado", ingreso: 50000, deudas: [{
        tipo: "prestamo", monto: "30000", pago: "5000",
        situacion_ui: "pagando_normal", debt_confidence: "high",
      }] },
      { id: "S6", laboral: "jubilado", ingreso: 80000, deudas: [] },
      { id: "S8", laboral: "desempleado", ingreso: 0, deudas: [] },
      { id: "S9", laboral: "relacion_dependencia", ingreso: 0, deudas: [{
        tipo: "prestamo", monto: "30000", pago: "5000",
        situacion_ui: "pagando_normal", debt_confidence: "high",
      }] },
      { id: "S10", laboral: "monotributista", ingreso: 0, deudas: [] },
      { id: "S11", laboral: "jubilado", ingreso: 0, deudas: [] },
    ];
    otherSegments.forEach(function(cfg) {
      _accionesRecomExpand = false;
      var dOther = uxBoot(cfg.laboral, cfg.ingreso, {
        gastos: cfg.ingreso > 0 ? { vivienda: 12000, alimentacion: 8000 } : {},
        deudas: cfg.deudas,
        diag: null,
      });
      ok("T-UX1D2-7 " + cfg.id + " segment",
        resolveContextualActionSegment(dOther, window.CZState).segmentId === cfg.id);
      var htmlOther = renderAccionesRecomendadasHtml(dOther);
      if (htmlOther.indexOf("flujo_negativo_accion") >= 0) {
        assertFlujoNegativoVisible("T-UX1D2-7 " + cfg.id, htmlOther);
      } else {
        ok("T-UX1D2-7 " + cfg.id + " no suppression class",
          (htmlOther.match(/cz-ux1d2-suppressed-action/g) || []).length === 0);
      }
    });

    trackCRMEvent = prevTrackCRM;
  })();

  (function assertCopy2bRealisticOptimism() {
    var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
    var algorithmsJs = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
    var appJs = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
    var FORBIDDEN = [
      "vas a poder",
      "te aprueban",
      "garantizado",
      "seguro",
      "todo mejora",
    ];
    var REPLACEMENTS = {
      completion: "Acciones registradas.",
      diagInicial: "Con algunos ajustes podés mejorar tu situación declarada antes de una nueva evaluación.",
      heroMantener: "Tu perfil financiero está en orden. El foco es sostener pagos en fecha y evitar nueva deuda.",
      plan3Problema: "Tu situación está bien encaminada. Hay algunos detalles que corregir antes de una nueva evaluación.",
      plan5Problema: "Tu historial declarado muestra atrasos o mora. Regularizar pagos y sostenerlos en fecha ayuda a mejorar el perfil.",
    };
    var replacementBlob = Object.keys(REPLACEMENTS).map(function(k) {
      return REPLACEMENTS[k];
    }).join("\n");

    // T-COPY2B-1 — completion confirmation
    ok("T-COPY2B-1 no marca la diferencia",
      uiJs.indexOf("Eso marca la diferencia") < 0);
    ok("T-COPY2B-1 Acciones registradas present",
      uiJs.indexOf(REPLACEMENTS.completion) >= 0);

    // T-COPY2B-2 — diagnosis initial framing
    ok("T-COPY2B-2 no La buena noticia",
      uiJs.indexOf("La buena noticia") < 0);

    // T-COPY2B-3 — healthy hero override
    ok("T-COPY2B-3 no consolida la recuperación",
      uiJs.indexOf("consolida la recuperación") < 0);
    ok("T-COPY2B-3 hero mantener replacement present",
      uiJs.indexOf(REPLACEMENTS.heroMantener) >= 0);

    // T-COPY2B-4 — Plan 3 approval implication (motor source)
    ok("T-COPY2B-4 no banco te diga que sí",
      algorithmsJs.indexOf("para que el banco te diga que sí") < 0);
    ok("T-COPY2B-4 plan3 problema replacement present",
      PLANES[3].problema === REPLACEMENTS.plan3Problema);

    // T-COPY2B-5 — Plan 5 moral judgment (motor source)
    ok("T-COPY2B-5 no actitud muestra",
      algorithmsJs.indexOf("tu actitud muestra que querés salir") < 0);
    ok("T-COPY2B-5 no querés salir in plan5 problema",
      PLANES[5].problema.indexOf("querés salir") < 0);
    ok("T-COPY2B-5 no actitud in plan5 problema",
      PLANES[5].problema.indexOf("actitud") < 0);
    ok("T-COPY2B-5 plan5 problema replacement present",
      PLANES[5].problema === REPLACEMENTS.plan5Problema);

    // T-COPY2B-6 — all replacements present
    ok("T-COPY2B-6 diag inicial replacement present",
      uiJs.indexOf(REPLACEMENTS.diagInicial) >= 0);

    // T-COPY2B-7 — plan IDs unchanged
    [1, 2, 3, 4, 5].forEach(function(id) {
      ok("T-COPY2B-7 planId " + id + " unchanged", PLANES[id].id === id);
    });

    // T-COPY2B-8 — status labels unchanged (source strings)
    ok("T-COPY2B-8 En buen camino present",
      uiJs.indexOf('"En buen camino"') >= 0 || uiJs.indexOf("En buen camino") >= 0);

    // T-COPY2B-9 — no forbidden phrases in COPY-2B replacement strings
    FORBIDDEN.forEach(function(phrase) {
      ok("T-COPY2B-9 replacements no " + phrase, replacementBlob.indexOf(phrase) < 0);
    });

    // T-COPY2B-10 — tracking / commitment attributes unchanged
    ok("T-COPY2B-10 data-toggle-compromiso present",
      uiJs.indexOf("data-toggle-compromiso") >= 0);
    ok("T-COPY2B-10 flujo_negativo_accion id present",
      algorithmsJs.indexOf('"flujo_negativo_accion"') >= 0);
    ok("T-COPY2B-10 commitment handler in app.js",
      appJs.indexOf("[data-toggle-compromiso]") >= 0);

    // Runtime: healthy hero uses replacement copy
    boot("?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
    PRE.laboral = "relacion_dependencia";
    PRE.ingreso = 75000;
    window.CZState = {
      gastos: { vivienda: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "100000",
        pago: "7000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      diag: null,
    };
    var diagHealthy = calcularMotor();
    window.CZState.diag = diagHealthy;
    var cohHealthy = resolveDashboardCoherence(diagHealthy, window.CZState);
    ok("T-COPY2B-3 runtime hero override replacement",
      cohHealthy.heroProblemOverride === REPLACEMENTS.heroMantener);
    var heroHtml = _renderDashboardHeroCard(diagHealthy, window.CZState, cohHealthy);
    ok("T-COPY2B-3 runtime hero html has replacement",
      heroHtml.indexOf(REPLACEMENTS.heroMantener) >= 0);

    // Runtime: plan motor problema strings (P1 → plan 3)
    var p1Profile = PROFILES.filter(function(p) { return p.id === "P1"; })[0];
    var rP1 = runPipeline(p1Profile);
    ok("T-COPY2B-4 runtime plan3 planId", rP1.diag.planId === 3);
    ok("T-COPY2B-4 runtime plan3 problema",
      rP1.diag.plan && rP1.diag.plan.problema === REPLACEMENTS.plan3Problema);

    boot("?p1=B&p2=B&p3=B&p4=B&p5=B&p6=B&p7=B&p8=B&p9=B&p10=B");
    PRE.ingreso = 55000;
    window.CZState = {
      gastos: { vivienda: 12000, alimentacion: 8000 },
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        monto: "30000",
        pago: "5000",
        situacion_ui: "pagando_normal",
        debt_confidence: "high",
      }],
      diag: null,
    };
    var diagP5 = calcularMotor();
    ok("T-COPY2B-5 runtime plan5 problema",
      diagP5.plan && diagP5.plan.problema === REPLACEMENTS.plan5Problema);
  })();

  (function assertUx2aPrimaryActionCard() {
    var PRIMARY_LABEL = "Tu prioridad hoy";
    var PRIMARY_CLASS = "cz-primary-action-card";
    var BODY_CLASS = "cz-primary-action-card-body";

    function topLevelKeys(obj) {
      return obj ? Object.keys(obj).slice().sort() : [];
    }

    function extractPrimaryCardChunk(html) {
      var classIdx = html.indexOf('class="' + PRIMARY_CLASS + '"');
      if (classIdx < 0) return "";
      var openIdx = html.lastIndexOf("<div", classIdx);
      if (openIdx < 0) return "";
      var slice = html.slice(openIdx);
      var depth = 0;
      for (var j = 0; j < slice.length; j++) {
        if (slice.slice(j, j + 4) === "<div") depth++;
        if (slice.slice(j, j + 6) === "</div>") {
          depth--;
          if (depth === 0) {
            return slice.slice(0, j + 6);
          }
        }
      }
      return "";
    }

    function extractPrimaryBodyText(html) {
      var re = new RegExp(
        'class="' + BODY_CLASS + '"[^>]*>([\\s\\S]*?)<\\/div>'
      );
      var m = html.match(re);
      return m ? m[1] : null;
    }

    function assertPrimaryCardComplete(label, profileId) {
      var profile = PROFILES.filter(function(p) { return p.id === profileId; })[0];
      ok(label + " profile exists", !!profile);
      if (!profile) return;
      var result = runPipeline(profile);
      var diag = result.diag;
      var st = window.CZState;
      var coh = result.coherence;
      var cardHtml = renderPrimaryActionCard(diag, st, coh);
      var tab = renderTabPlan();
      var hero = _renderDashboardHeroCard(diag, st, coh);
      var bodyFromCard = extractPrimaryBodyText(cardHtml);
      var bodyFromTab = extractPrimaryBodyText(tab);

      ok(label + " card renders", cardHtml.length > 0);
      ok(label + " tab has class", tab.indexOf(PRIMARY_CLASS) >= 0);
      ok(label + " section label", cardHtml.indexOf(PRIMARY_LABEL) >= 0);
      ok(label + " body equals coherence.nextStepText",
        bodyFromCard === coh.nextStepText);
      ok(label + " tab body equals coherence.nextStepText",
        bodyFromTab === coh.nextStepText);
      ok(label + " nextStepText non-empty", !!(coh.nextStepText && coh.nextStepText.trim()));

      var heroIdx = tab.indexOf('id="cz-dashboard-hero"');
      var primaryIdx = tab.indexOf(PRIMARY_CLASS);
      var narrIdx = tab.indexOf("Qué está pasando");
      var diagZoneIdx = tab.indexOf("dash-zone-diagnostico");
      ok(label + " after hero", primaryIdx > heroIdx);
      ok(label + " before Qué está pasando", primaryIdx < narrIdx);
      ok(label + " before diagnostico zone", primaryIdx < diagZoneIdx);

      var chunk = extractPrimaryCardChunk(tab);
      ok(label + " no button", chunk.indexOf("<button") < 0);
      ok(label + " no onclick", chunk.indexOf("onclick") < 0);
      ok(label + " no CTA class", chunk.indexOf("btn btn-") < 0);
      ok(label + " no compromiso toggle", chunk.indexOf("data-toggle-compromiso") < 0);

      ok(label + " hero still renders", hero.indexOf("cz-hero-card") >= 0);
      ok(label + " narrative still renders",
        renderNarrativaInterpretacion(diag, st, coh).indexOf("Qué está pasando") >= 0);
      ok(label + " hero nextStep surface preserved",
        !coh.nextStepText || hero.indexOf(coh.nextStepText) >= 0
          || tab.indexOf(coh.nextStepText) >= 0);
    }

    assertPrimaryCardComplete("T-UX2A-1", "P1");
    assertPrimaryCardComplete("T-UX2A-2", "P4");
    assertPrimaryCardComplete("T-UX2A-3", "P6");
    assertPrimaryCardComplete("T-UX2A-5", "P3");

    // T-UX2A-4 — incomplete profile
    (function() {
      var profile = PROFILES.filter(function(p) { return p.id === "P7"; })[0];
      var result = runPipeline(profile);
      var diag = result.diag;
      var st = window.CZState;
      var coh = result.coherence;
      var cardHtml = renderPrimaryActionCard(diag, st, coh);
      var tab = renderTabPlan();
      ok("T-UX2A-4 render returns empty", cardHtml === "");
      ok("T-UX2A-4 no class in tab", tab.indexOf(PRIMARY_CLASS) < 0);
      ok("T-UX2A-4 no label in tab", tab.indexOf(PRIMARY_LABEL) < 0);
      ok("T-UX2A-4 incomplete profile", isIncompleteFinancialProfile(diag, st) === true);
      var heroCloseIdx = tab.indexOf('id="cz-dashboard-hero"');
      var diagOpenIdx = tab.indexOf("dash-zone-diagnostico");
      var between = tab.slice(heroCloseIdx, diagOpenIdx);
      ok("T-UX2A-4 no orphan primary card between hero and diagnostico",
        between.indexOf(PRIMARY_CLASS) < 0 && between.indexOf(PRIMARY_LABEL) < 0);
    })();

    // T-UX2A-6 — exact coherence source (3 complete profiles)
    ["P1", "P4", "P6"].forEach(function(pid) {
      var result = runPipeline(PROFILES.filter(function(p) { return p.id === pid; })[0]);
      var coh = result.coherence;
      var body = extractPrimaryBodyText(renderPrimaryActionCard(result.diag, window.CZState, coh));
      ok("T-UX2A-6 " + pid + " body from coherence.nextStepText",
        body === coh.nextStepText);
      ok("T-UX2A-6 " + pid + " not plan problema",
        body !== (result.diag.plan && result.diag.plan.problema));
    });

    // T-UX2A-7 — zone order unchanged
    (function() {
      var result = runPipeline(PROFILES.filter(function(p) { return p.id === "P1"; })[0]);
      var tab = renderTabPlan();
      var zones = [
        "dash-zone-hero",
        "dash-zone-diagnostico",
        "dash-zone-accion",
        "dash-zone-acciones-recom",
      ];
      var lastIdx = -1;
      zones.forEach(function(z) {
        var idx = tab.indexOf(z);
        ok("T-UX2A-7 zone " + z + " present", idx >= 0);
        ok("T-UX2A-7 zone " + z + " order", idx > lastIdx);
        lastIdx = idx;
      });
      ok("T-UX2A-7 accion prioritaria surface preserved",
        tab.indexOf("Acción prioritaria") >= 0 || tab.indexOf(result.coherence.nextStepText) >= 0);
    })();

    // T-UX2A-8 — empty nextStepText escape (direct render)
    (function() {
      var result = runPipeline(PROFILES.filter(function(p) { return p.id === "P1"; })[0]);
      var cohEmpty = Object.assign({}, result.coherence, { nextStepText: "" });
      var cohSpace = Object.assign({}, result.coherence, { nextStepText: "   " });
      var cohNl = Object.assign({}, result.coherence, { nextStepText: "\n" });
      ok("T-UX2A-8 empty string", renderPrimaryActionCard(result.diag, window.CZState, cohEmpty) === "");
      ok("T-UX2A-8 whitespace", renderPrimaryActionCard(result.diag, window.CZState, cohSpace) === "");
      ok("T-UX2A-8 newline", renderPrimaryActionCard(result.diag, window.CZState, cohNl) === "");
    })();

    // T-UX2A-9 — read-only render (no new top-level keys)
    (function() {
      var result = runPipeline(PROFILES.filter(function(p) { return p.id === "P1"; })[0]);
      var diag = result.diag;
      var st = window.CZState;
      var coh = Object.assign({}, result.coherence);
      var diagKeys = topLevelKeys(diag);
      var stKeys = topLevelKeys(st);
      var cohKeys = topLevelKeys(coh);
      var czKeys = topLevelKeys(window.CZState);
      renderPrimaryActionCard(diag, st, coh);
      ok("T-UX2A-9 diag keys unchanged", topLevelKeys(diag).join("|") === diagKeys.join("|"));
      ok("T-UX2A-9 st keys unchanged", topLevelKeys(st).join("|") === stKeys.join("|"));
      ok("T-UX2A-9 coherence keys unchanged", topLevelKeys(coh).join("|") === cohKeys.join("|"));
      ok("T-UX2A-9 CZState keys unchanged",
        topLevelKeys(window.CZState).join("|") === czKeys.join("|"));
    })();

    // T-UX2A-10 — whitespace-only full render escape
    function assertWhitespaceFullRender(label, whitespaceValue) {
      var result = runPipeline(PROFILES.filter(function(p) { return p.id === "P1"; })[0]);
      var origResolve = resolveDashboardCoherence;
      resolveDashboardCoherence = function(d, s) {
        var base = origResolve(d, s);
        return Object.assign({}, base, { nextStepText: whitespaceValue });
      };
      var tab = renderTabPlan();
      resolveDashboardCoherence = origResolve;
      ok(label + " no primary class", tab.indexOf(PRIMARY_CLASS) < 0);
      ok(label + " no label", tab.indexOf(PRIMARY_LABEL) < 0);
      var heroIdx = tab.indexOf('id="cz-dashboard-hero"');
      var diagIdx = tab.indexOf("dash-zone-diagnostico");
      var between = tab.slice(heroIdx, diagIdx);
      ok(label + " no ghost card between hero and diagnostico",
        between.indexOf(PRIMARY_CLASS) < 0 && between.indexOf(PRIMARY_LABEL) < 0);
    }
    assertWhitespaceFullRender("T-UX2A-10 spaces", "     ");
    assertWhitespaceFullRender("T-UX2A-10 double newline", "\n\n");
    assertWhitespaceFullRender("T-UX2A-10 mixed whitespace", " \n ");

    // T-UX2A-11 — acciones / Ver Más untouched
    (function() {
      boot("?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B");
      PRE.laboral = "relacion_dependencia";
      PRE.ingreso = 40000;
      window.CZState = {
        gastos: { vivienda: 25000, alimentacion: 10000, servicios: 5000 },
        gastos_missing_confirmed: false,
        deudas: [{
          tipo: "prestamo",
          monto: "50000",
          pago: "8000",
          situacion_ui: "pagando_normal",
          debt_confidence: "high",
        }],
        herr: { compromisos: {} },
        diag: null,
      };
      var diag = calcularMotor();
      window.CZState.diag = diag;
      _accionesRecomExpand = false;
      var acciones = seleccionarAccionesRecomendadas(diag);
      var html = renderAccionesRecomendadasHtml(diag);
      var meta = _ux1d2ShouldSuppressFlujoNegativoAccion(
        diag, acciones, window.CZState
      );
      ok("T-UX2A-11 acciones count unchanged", acciones.length >= 3);
      ok("T-UX2A-11 flujo_negativo selected",
        acciones.some(function(a) { return a.id === "flujo_negativo_accion"; }));
      ok("T-UX2A-11 visible accessible count", meta.visibleAccessibleCount >= 3);
      ok("T-UX2A-11 suppression active",
        html.indexOf("cz-ux1d2-suppressed-action") >= 0);
      ok("T-UX2A-11 Ver Más threshold",
        html.indexOf("data-acciones-ver-mas") >= 0 || acciones.length <= 3);
      var crmPayload = null;
      var prevTrack = trackCRMEvent;
      trackCRMEvent = function(name, payload) {
        if (payload && payload.action_ids) crmPayload = payload;
      };
      renderAccionesRecomendadasHtml(diag);
      trackCRMEvent = prevTrack;
      ok("T-UX2A-11 action_ids includes flujo_negativo",
        crmPayload && crmPayload.action_ids
          && crmPayload.action_ids.indexOf("flujo_negativo_accion") >= 0);
    })();
  })();

  (function assertCopy2cExplicitCreditExpectations() {
    var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
    var algorithmsJs = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
    var REPLACEMENTS = {
      plan3Objetivo: "Hacer los ajustes puntuales que faltan antes de una nueva evaluación del perfil declarado.",
      plan3Prioridad: "En 30-60 días volver a evaluar el perfil declarado y revisar qué cambió.",
      horizonteInmediato: "Revisión posible en el corto plazo",
      diagLead: "Encontramos factores que podrían estar afectando hoy tu perfil financiero según la información declarada.",
      horizonLowConf: "todavía faltan datos para estimar con confianza un horizonte de recalificación.",
      retryUnlocked: "Con los datos actuales, conviene revisar si cambió algo material en tu perfil declarado.",
      plusLocked: "la IA señala diferencias entre lo declarado y lo registrado",
      microRegularizada: "Estado registrado como regularizada. Conviene verificar que el acreedor lo refleje.",
      diagScreenC: "complicando una evaluación crediticia hoy",
      diagModifier: "afectando tu perfil financiero hoy",
      seoIntro: "Pasos concretos seg\u00fan tu situaci\u00f3n declarada",
    };
    var FORBIDDEN = [
      "para que el banco te apruebe",
      "ya podés aplicar",
      "Ya hay condiciones para considerar una solicitud",
      "posibilidades de aprobación",
      "condiciones de presentar una nueva solicitud",
      "condiciones de revisar una nueva solicitud",
      "bloqueando tu aprobacion",
      "Excelente! Eso mejora directamente tu perfil crediticio",
      "complicando las aprobaciones hoy",
      "afectando tus aprobaciones hoy",
      "chances de acceder a financiamiento",
    ];

    ok("T-COPY2C-1 plan3 objetivo", PLANES[3].objetivo === REPLACEMENTS.plan3Objetivo);
    ok("T-COPY2C-1 plan3 prioridad", PLANES[3].prioridades[2] === REPLACEMENTS.plan3Prioridad);

    var h = calcularHorizonte({ cantMoras: 0, ratio: 0.2, flujoLibre: 10000 }, 50000);
    ok("T-COPY2C-2 horizonte banda inmediato", h.banda === "inmediato");
    ok("T-COPY2C-2 horizonte label", h.label === REPLACEMENTS.horizonteInmediato);

    ok("T-COPY2C-2 retry unlocked copy", uiJs.indexOf(REPLACEMENTS.retryUnlocked) >= 0);
    ok("T-COPY2C-2 horizon low conf", uiJs.indexOf(REPLACEMENTS.horizonLowConf) >= 0);

    ok("T-COPY2C-3 diag inicial lead", uiJs.indexOf(REPLACEMENTS.diagLead) >= 0);
    ok("T-COPY2C-3 diagnosis screen C", uiJs.indexOf(REPLACEMENTS.diagScreenC) >= 0);
    ok("T-COPY2C-3 diagnosis modifier", uiJs.indexOf(REPLACEMENTS.diagModifier) >= 0);

    ok("T-COPY2C-4 plus locked", uiJs.indexOf(REPLACEMENTS.plusLocked) >= 0);
    ok("T-COPY2C-4 micro regularizada", uiJs.indexOf(REPLACEMENTS.microRegularizada) >= 0);
    ok("T-COPY2C-4 seo intro source", uiJs.indexOf(REPLACEMENTS.seoIntro) >= 0);
    ok("T-COPY2C-4 seo intro runtime",
      typeof renderSeoIaIntroBlock === "function"
        && renderSeoIaIntroBlock().indexOf(REPLACEMENTS.seoIntro) >= 0);

    FORBIDDEN.forEach(function(phrase) {
      ok("T-COPY2C-F no " + phrase.slice(0, 28),
        uiJs.indexOf(phrase) < 0 && algorithmsJs.indexOf(phrase) < 0);
    });

    var p1 = PROFILES.filter(function(p) { return p.id === "P1"; })[0];
    runPipeline(p1);
    var tab = renderTabPlan();
    ok("T-COPY2C-5 hero intact", tab.indexOf("cz-hero-card") >= 0);
    ok("T-COPY2C-5 primary action intact", tab.indexOf("cz-primary-action-card") >= 0);
    ok("T-COPY2C-5 plan3 objetivo in tab",
      tab.indexOf(REPLACEMENTS.plan3Objetivo) >= 0);
  })();

  (function assertFix03aCssLeak() {
    var LEAK = "margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);";
    var p1 = PROFILES.filter(function(p) { return p.id === "P1"; })[0];
    runPipeline(p1);
    var tab = renderTabPlan();
    ok("FIX-03A no bare css after tag close", tab.indexOf("</div>" + LEAK) < 0);
    ok("FIX-03A no bare css before card", tab.indexOf(LEAK + '<div class="cz-primary-action-card"') < 0);
    ok("FIX-03A gap spacer present", tab.indexOf('class="dash-zone-gap"') >= 0);
    ok("FIX-03A primary card present", tab.indexOf("cz-primary-action-card") >= 0);
    ok("FIX-03A Tu prioridad hoy present", tab.indexOf("Tu prioridad hoy") >= 0);
    var heroIdx = tab.indexOf('id="cz-dashboard-hero"');
    var primaryIdx = tab.indexOf("cz-primary-action-card");
    var diagIdx = tab.indexOf("dash-zone-diagnostico");
    ok("FIX-03A order hero before primary", heroIdx >= 0 && primaryIdx > heroIdx);
    ok("FIX-03A order primary before diagnostico", primaryIdx < diagIdx);
    ok("FIX-03A gap css only in style attr", (function() {
      var idx = 0;
      while ((idx = tab.indexOf(LEAK, idx)) >= 0) {
        var styleStart = tab.lastIndexOf('style="', idx);
        if (styleStart < 0) return false;
        var styleEnd = tab.indexOf('"', styleStart + 7);
        if (styleEnd < 0 || idx > styleEnd) return false;
        idx += LEAK.length;
      }
      return true;
    })());
  })();

  (function assertFix03bPlanStatusLabelCoherence() {
    var p7 = PROFILES.filter(function(p) { return p.id === "P7"; })[0];
    var r7 = runPipeline(p7);
    ok("FIX-03B-A Diagnóstico incompleto",
      resolvePlanStatusLabel(r7.diag, window.CZState, r7.coherence).text === "Diagnóstico incompleto");

    ["P1", "P2", "P3"].forEach(function(pid) {
      var r = runPipeline(PROFILES.filter(function(p) { return p.id === pid; })[0]);
      ok("FIX-03B-B " + pid + " En buen camino",
        resolvePlanStatusLabel(r.diag, window.CZState, r.coherence).text === "En buen camino");
    });

    var diagPlan1Std = {
      planId: 1,
      plan: PLANES[1],
      fin: {
        ratio: 0.22,
        flujoLibre: 8000,
        cantMoras: 0,
        costoDeudaNivel: "Medio",
      },
      interpretacion_v2: { confidence_level: "high" },
    };
    var stPlan1Std = {
      gastos: { vivienda: 15000, alimentacion: 10000, transporte: 5000 },
      gastos_missing_confirmed: false,
      deudas: [{
        monto: "15000",
        pago: "5000",
        cancelada: false,
        situacion_ui: "pagando_normal",
      }],
      diag: diagPlan1Std,
    };
    var cohPlan1Std = resolveDashboardCoherence(diagPlan1Std, stPlan1Std);
    ok("FIX-03B-C planId 1", diagPlan1Std.planId === 1);
    ok("FIX-03B-C not healthy_organized", cohPlan1Std.profileTier !== "healthy_organized");
    ok("FIX-03B-C profileTier standard", cohPlan1Std.profileTier === "standard");
    ok("FIX-03B-C Pendiente de ordenar",
      resolvePlanStatusLabel(diagPlan1Std, stPlan1Std, cohPlan1Std).text === "Pendiente de ordenar");

    var r4 = runPipeline(PROFILES.filter(function(p) { return p.id === "P4"; })[0]);
    ok("FIX-03B-D P4 En proceso",
      resolvePlanStatusLabel(r4.diag, window.CZState, r4.coherence).text === "En proceso");
    var r6 = runPipeline(PROFILES.filter(function(p) { return p.id === "P6"; })[0]);
    ok("FIX-03B-D P6 Prioridad alta",
      resolvePlanStatusLabel(r6.diag, window.CZState, r6.coherence).text === "Prioridad alta");

    var heroPlan1 = _renderDashboardHeroCard(diagPlan1Std, stPlan1Std, cohPlan1Std);
    ok("FIX-03B-E hero Pendiente de ordenar", heroPlan1.indexOf("Pendiente de ordenar") >= 0);
    ok("FIX-03B-E hero Claridad Financiera", heroPlan1.indexOf("Claridad Financiera") >= 0);
    ok("FIX-03B-E hero plan problema",
      heroPlan1.indexOf("No tenés claro cuánto entra") >= 0);
    ok("FIX-03B-E hero no En buen camino", heroPlan1.indexOf("En buen camino") < 0);
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
