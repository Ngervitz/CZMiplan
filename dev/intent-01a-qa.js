/**
 * dev/intent-01a-qa.js — INTENT-01A user intent capture QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var _stored = null;

  function makeSandbox(search) {
    search = search || "";
    if (search && search.indexOf("?") !== 0) search = "?" + search;
    var sandbox = {
      window: null,
      document: {
        getElementById: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
      },
      console: console,
      parseFloat: parseFloat,
      isFinite: isFinite,
      Object: Object,
      Array: Array,
      String: String,
      URLSearchParams: URLSearchParams,
      Math: Math,
      JSON: JSON,
      localStorage: {
        getItem: function(k) { return _stored && _stored.key === k ? _stored.val : null; },
        setItem: function(k, v) { _stored = { key: k, val: v }; },
        removeItem: function() { _stored = null; },
      },
      trackEvent: function() {},
      trackCRMEvent: function() {},
      enviarCRM: function() {},
    };
    sandbox.window = sandbox;
    sandbox.location = { search: search, href: "http://localhost/" + search.replace(/^\?/, "") };
    return sandbox;
  }

  function loadInto(sandbox, file) {
    var src = fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var ");
    vm.runInNewContext(src, sandbox, { filename: path.join(root, file) });
  }

  function boot(search) {
    _stored = null;
    var sandbox = makeSandbox(search);
    loadInto(sandbox, "js/config.js");
    loadInto(sandbox, "js/creditors.js");
    loadInto(sandbox, "js/survey.js");
    loadInto(sandbox, "js/algorithms.js");
    loadInto(sandbox, "js/events.js");
    loadInto(sandbox, "js/crm.js");
    loadInto(sandbox, "js/ui.js");
    loadInto(sandbox, "js/app.js");
    return sandbox;
  }

  function organicSt() {
    return {
      step: 0,
      user_intent: null,
      consent: { accepted_at: "2026-01-01T00:00:00.000Z" },
      miplan_started: false,
    };
  }

  function dashboardSt() {
    return {
      step: 3,
      user_intent: null,
      user_email: "ana@example.com",
      financial_profile_complete: true,
      financial_income_complete: true,
      financial_debts_complete: true,
      financial_expenses_complete: true,
      income_source: "localStorage_restore",
      declared_ingreso: 80000,
      declared_nombre: "Ana Perez",
      declared_laboral: "relacion_dependencia",
      deudas: [{ tipo: "prestamo", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
      gastos: { vivienda: 12000, alimentacion: 8000 },
      temporal: { dashboard_generated_at: "2026-01-01T00:00:00.000Z" },
      snap: { fecha_inicio: "2026-01-01T00:00:00.000Z" },
      diag: { planId: 2, scoreReset: 18 },
    };
  }

  // --- boot organic (no CDV params) ---
  var org = boot("");
  var st = organicSt();
  org.window.CZState = st;

  // 1 — organic user sees intent question
  ok("1 organic gate shows", org.shouldShowUserIntentCapture(st));
  var intentHtml = org.renderUserIntentCapture();
  ok("1 title present", intentHtml.indexOf("¿Qué querés lograr con Mi Plan?") >= 0);
  ok("1 subtitle present", intentHtml.indexOf("Elegí la opción que mejor describe tu objetivo principal hoy.") >= 0);
  ok("1 mobile wrap styles", intentHtml.indexOf("white-space:normal") >= 0
    && intentHtml.indexOf("word-wrap:break-word") >= 0);
  ok("1 CTA disabled initially", intentHtml.indexOf('id="btn-user-intent-continue" disabled') >= 0);

  // 2 — CDV rejection user skips intent question
  var cdvSearch = "?ingreso=80000&laboral=relacion_dependencia"
    + "&p1=A&p2=B&p3=C&p4=D&p5=A&p6=B&p7=C&p8=D&p9=A&p10=B";
  var cdv = boot(cdvSearch);
  ok("2 CDV hasRejectionContext", cdv.CZ_ENTRY_CONTEXT.hasRejectionContext === true);
  cdv.window.CZState = organicSt();
  ok("2 CDV skips gate", !cdv.shouldShowUserIntentCapture(cdv.window.CZState));

  // 3 — valid selection stores user_intent
  st._user_intent_pending = "ORDENAR";
  ok("3 pending valid", org.isValidUserIntent(st._user_intent_pending));
  st.user_intent = org.normalizeUserIntent(st._user_intent_pending);
  st._user_intent_pending = null;
  ok("3 stored ORDENAR", org.window.CZState.user_intent === "ORDENAR");

  // 4 — selection survives save/restore
  org.window.CZState = { user_intent: "CREDITO", step: 0 };
  org.guardarLocal();
  var saved = JSON.parse(_stored.val);
  ok("4 saved CREDITO", saved.user_intent === "CREDITO");
  var restored = org.normalizeUserIntent(saved.user_intent);
  ok("4 restore CREDITO", restored === "CREDITO");

  // 5 — old localStorage without user_intent restores as null
  ok("5 missing field null", org.normalizeUserIntent(undefined) === null);

  // 6 — reset clears user_intent
  org.window.CZState.user_intent = "OPTIMIZAR";
  org.resetear();
  ok("6 reset clears", org.window.CZState.user_intent === null);

  // 7–9 — motor outputs unchanged with/without user_intent
  org.PRE.ingreso = 80000;
  org.PRE.respuestas = {
    p1: "B", p2: "B", p3: "B", p4: "B", p5: "B",
    p6: "B", p7: "B", p8: "B", p9: "B", p10: "B",
  };
  org.window.CZState = { user_intent: null, deudas: [] };
  var d0 = org.calcularMotor();
  org.window.CZState.user_intent = "RECUPERAR";
  var d1 = org.calcularMotor();
  ok("7 score unchanged", d0.scoreReset === d1.scoreReset);
  ok("8 planId unchanged", d0.planId === d1.planId);
  ok("9 nivelR unchanged", d0.nivelR === d1.nivelR);
  ok("9 interpretacion_v2 risk unchanged",
    (d0.interpretacion_v2 && d0.interpretacion_v2.nivel_riesgo) ===
    (d1.interpretacion_v2 && d1.interpretacion_v2.nivel_riesgo));

  // 10 — returning dashboard users not blocked
  var dash = dashboardSt();
  org.PRE.ingreso = 80000;
  org.window.CZState = dash;
  ok("10 dashboard not gated", !org.shouldShowUserIntentCapture(dash));

  // 11 — invalid stored value normalizes to null
  ok("11 invalid BOGUS", org.normalizeUserIntent("BOGUS") === null);
  ok("11 invalid empty", org.normalizeUserIntent("") === null);
  ok("11 invalid lowercase", org.normalizeUserIntent("ordenar") === null);

  // 12 — SEO intent URL param does not affect user_intent
  var seo = boot("?source=seo_ia&intent=clearing&question=como-salir-del-clearing");
  seo.window.CZState = organicSt();
  ok("12 seo acq intent set", seo.getSeoIaAcquisitionPayload().intent === "clearing");
  ok("12 user_intent stays null", seo.window.CZState.user_intent == null);
  ok("12 seo intent not valid user_intent", seo.normalizeUserIntent("clearing") === null);

  console.log("\nINTENT-01A QA: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
})();
