/**
 * dev/intent-01a-qa.js — INTENT-01A P11 placement QA (SEO IA survey)
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
      style: { cssText: "" },
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

  function makeSandbox(search) {
    search = search || "";
    if (search && search.indexOf("?") !== 0) search = "?" + search;
    var sandbox = {
      window: null,
      document: createTestDocument(),
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

  function fillP1ToP10(ob) {
    var i;
    for (i = 1; i <= 10; i++) ob.respuestas["p" + i] = "B";
  }

  function seoSurveySt() {
    var resp = {};
    var i;
    for (i = 1; i <= 10; i++) resp["p" + i] = null;
    return {
      step: 0,
      user_intent: null,
      seo_ia_onboarding: {
        phase: "survey",
        surveyGroup: 5,
        respuestas: resp,
        started_at: "2026-01-01T00:00:00.000Z",
      },
    };
  }

  var seo = boot("?source=seo_ia");
  seo.window.CZState = seoSurveySt();
  fillP1ToP10(seo.window.CZState.seo_ia_onboarding);

  // A — intent not shown before survey starts
  var introHtml = seo.renderSeoIaIntroBlock();
  ok("A intro has no P11 title", introHtml.indexOf("¿Qué querés lograr con Mi Plan?") < 0);
  var group1Html = seo.renderSeoIaSurveyGroupScreen(1);
  ok("A group1 has no P11 title", group1Html.indexOf("¿Qué querés lograr con Mi Plan?") < 0);
  ok("A group1 is P1-P2", group1Html.indexOf("Pregunta 1 de 10") >= 0);

  // B — intent only as P11
  var p11Html = seo.renderSeoIaUserIntentP11();
  ok("B P11 title present", p11Html.indexOf("¿Qué querés lograr con Mi Plan?") >= 0);
  ok("B P11 marker", p11Html.indexOf("Pregunta 11 de 11") >= 0);
  ok("B P11 class", p11Html.indexOf("seo-ia-intent-p11") >= 0);

  // C — P11 after P10, before legals
  ok("C post-P10 phase intent", seo.resolveSeoIaPhaseAfterP10(seo.window.CZState) === "intent");
  seo.window.CZState.seo_ia_onboarding.phase = "intent";
  var onboardingIntent = seo.renderSeoIaOnboarding();
  ok("C onboarding intent phase", onboardingIntent.indexOf("seo-ia-intent-p11") >= 0);
  ok("C legals not yet", onboardingIntent.indexOf("Último paso antes de tu diagnóstico") < 0);
  seo.handleSeoIaUserIntentSelect("ORDENAR");
  seo.handleSeoIaUserIntentNext();
  ok("C after P11 goes legals", seo.window.CZState.seo_ia_onboarding.phase === "legals");
  var onboardingLegals = seo.renderSeoIaOnboarding();
  ok("C legals visible after P11", onboardingLegals.indexOf("Último paso antes de tu diagnóstico") >= 0);

  // D — cannot continue without valid intent
  seo.window.CZState = seoSurveySt();
  fillP1ToP10(seo.window.CZState.seo_ia_onboarding);
  seo.window.CZState.seo_ia_onboarding.phase = "intent";
  seo.window.CZState.user_intent = null;
  seo.window.CZState._user_intent_pending = null;
  var p11Disabled = seo.renderSeoIaUserIntentP11();
  ok("D CTA disabled without selection", p11Disabled.indexOf('id="btn-seo-ia-intent-next" disabled') >= 0);
  seo.handleSeoIaUserIntentNext();
  ok("D blocked without selection", seo.window.CZState.seo_ia_onboarding.phase === "intent");

  function persistIntent(label, value, expected) {
    seo.window.CZState = seoSurveySt();
    fillP1ToP10(seo.window.CZState.seo_ia_onboarding);
    seo.window.CZState.seo_ia_onboarding.phase = "intent";
    seo.window.CZState.user_intent = null;
    seo.handleSeoIaUserIntentSelect(value);
    seo.handleSeoIaUserIntentNext();
    ok(label + " persists " + expected, seo.window.CZState.user_intent === expected);
    ok(label + " advances to legals", seo.window.CZState.seo_ia_onboarding.phase === "legals");
  }

  // E–H — each valid intent persists
  persistIntent("E", "RECUPERAR", "RECUPERAR");
  persistIntent("F", "ORDENAR", "ORDENAR");
  persistIntent("G", "CREDITO", "CREDITO");
  persistIntent("H", "OPTIMIZAR", "OPTIMIZAR");

  // I — reload restores valid user_intent
  seo.window.CZState = { user_intent: "CREDITO", step: 0 };
  seo.guardarLocal();
  var saved = JSON.parse(_stored.val);
  ok("I saved CREDITO", saved.user_intent === "CREDITO");
  ok("I restore CREDITO", seo.normalizeUserIntent(saved.user_intent) === "CREDITO");

  // J — reset clears user_intent
  seo.window.CZState.user_intent = "OPTIMIZAR";
  seo.resetear();
  ok("J reset clears", seo.window.CZState.user_intent === null);

  // K — invalid/empty/whitespace rejected
  ok("K invalid BOGUS", seo.normalizeUserIntent("BOGUS") === null);
  ok("K empty string", seo.normalizeUserIntent("") === null);
  ok("K whitespace", seo.normalizeUserIntent("   ") === null);
  ok("K lowercase ordenar", seo.normalizeUserIntent("ordenar") === null);
  seo.window.CZState = seoSurveySt();
  seo.window.CZState.seo_ia_onboarding.phase = "intent";
  seo.handleSeoIaUserIntentSelect("  ");
  ok("K whitespace select blocked", !seo.isValidUserIntent(seo.window.CZState._user_intent_pending));

  // L–N — CDV skips P11
  var cdvSearch = "?ingreso=80000&laboral=relacion_dependencia"
    + "&p1=A&p2=B&p3=C&p4=D&p5=A&p6=B&p7=C&p8=D&p9=A&p10=B";
  var cdv = boot(cdvSearch);
  ok("L CDV hasRejectionContext", cdv.CZ_ENTRY_CONTEXT.hasRejectionContext === true);
  cdv.window.CZState = { user_intent: null };
  ok("L CDV skips P11", cdv.shouldSkipSeoIaUserIntentP11(cdv.window.CZState));
  ok("M CDV P10 to legals", cdv.resolveSeoIaPhaseAfterP10(cdv.window.CZState) === "legals");
  cdv.window.CZState.seo_ia_onboarding = {
    phase: "survey",
    surveyGroup: 5,
    respuestas: {},
  };
  fillP1ToP10(cdv.window.CZState.seo_ia_onboarding);
  cdv.handleSeoIaSurveyNext();
  ok("M CDV lands on legals", cdv.window.CZState.seo_ia_onboarding.phase === "legals");
  ok("N CDV no auto intent", cdv.window.CZState.user_intent == null);

  // O–Q — motor unchanged
  seo.PRE.ingreso = 80000;
  seo.PRE.respuestas = {
    p1: "B", p2: "B", p3: "B", p4: "B", p5: "B",
    p6: "B", p7: "B", p8: "B", p9: "B", p10: "B",
  };
  seo.window.CZState = { user_intent: null, deudas: [] };
  var d0 = seo.calcularMotor();
  seo.window.CZState.user_intent = "ORDENAR";
  var d1 = seo.calcularMotor();
  ok("O score unchanged", d0.scoreReset === d1.scoreReset);
  ok("P planId unchanged", d0.planId === d1.planId);
  ok("Q risk unchanged",
    (d0.interpretacion_v2 && d0.interpretacion_v2.nivel_riesgo) ===
    (d1.interpretacion_v2 && d1.interpretacion_v2.nivel_riesgo));

  // R — motor / stage resolver do not consume user_intent (narrative attach may read it)
  var algoSrc = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
  var motorBlock = algoSrc.split("function calcularMotor")[1];
  motorBlock = motorBlock ? motorBlock.split("function ")[0] : "";
  var stageBlock = algoSrc.split("function resolveFinancialStage")[1];
  stageBlock = stageBlock ? stageBlock.split("function ")[0] : "";
  ok("R motor has no user_intent", motorBlock.indexOf("user_intent") < 0);
  ok("R stage resolver has no user_intent", stageBlock.indexOf("user_intent") < 0);

  // Group 5 button label for non-CDV
  seo.window.CZState = seoSurveySt();
  var g5 = seo.renderSeoIaSurveyGroupScreen(5);
  ok("group5 non-CDV says Siguiente", g5.indexOf(">Siguiente</button>") >= 0);
  var g5cdv = cdv.renderSeoIaSurveyGroupScreen(5);
  ok("group5 CDV says Ver mis legales", g5cdv.indexOf(">Ver mis legales</button>") >= 0);

  console.log("\nINTENT-01A QA: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
})();
