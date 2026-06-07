/**
 * dev/seo-ia-virgin-qa.js — SEO IA virgin onboarding QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.document = {
    getElementById: function() { return null; },
  };
  global.trackEvent = function() {};

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

  function withSearch(search, fn) {
    global.window.location = { search: search, href: "" };
    load("js/config.js");
    load("js/survey.js");
    return fn();
  }

  ok("1 seo only entry", withSearch("?source=seo_ia", function() {
    return isSeoIaEntry() && !hasResultParams();
  }));

  ok("2 seo with intent preserved in acquisition", withSearch("?source=seo_ia&intent=clearing&question=como-salir-del-clearing", function() {
    var acq = getSeoIaAcquisitionPayload();
    return acq.intent === "clearing" && acq.question === "como-salir-del-clearing";
  }));

  ok("3 ingreso no onboarding", withSearch("?ingreso=65000", function() {
    return hasResultParams();
  }));

  ok("4 partial survey no onboarding", withSearch("?p1=A&p2=B&p3=C", function() {
    return hasResultParams();
  }));

  ok("5 seo + survey result mode", withSearch("?source=seo_ia&p1=A&p2=B&p3=C", function() {
    return isSeoIaEntry() && hasResultParams();
  }));

  ok("6 SEO_IA_QUESTIONS count", withSearch("?source=seo_ia", function() {
    return SEO_IA_QUESTIONS.length === 10;
  }));

  ok("7 calcularEncuestaSeoIa weighted", withSearch("?source=seo_ia", function() {
    var resp = { p1:"A",p2:"A",p3:"A",p4:"A",p5:"A",p6:"A",p7:"A",p8:"A",p9:"A",p10:"A" };
    var r = calcularEncuestaSeoIa(resp);
    return r.score_v2 === 100 && r.nivel_final === "A";
  }));

  ok("8 surveyIsActive in-app complete", withSearch("?source=seo_ia", function() {
    var resp = { p1:"A",p2:"B",p3:"C",p4:"D",p5:"A",p6:"B",p7:"C",p8:"D",p9:"A",p10:"B" };
    return surveyIsActive(resp) && calcularEncuesta(resp).score > 0;
  }));

  load("js/events.js");
  load("js/ui.js");
  global.window.CZState = { step: 0 };

  ok("9 onboarding html intro", withSearch("?source=seo_ia", function() {
    var h = renderSeoIaOnboarding();
    return h.indexOf("Descubrí qué te está frenando para acceder a crédito") >= 0
      && h.indexOf("btn-seo-ia-intro-start") >= 0
      && h.indexOf("🎯") >= 0
      && h.indexOf("🤝") >= 0
      && h.indexOf("ℹ️") >= 0
      && h.indexOf("✅") >= 0;
  }));

  ok("10 should show onboarding", withSearch("?source=seo_ia", function() {
    return shouldShowSeoIaOnboarding();
  }));

  ok("11 should not show with ingreso", withSearch("?source=seo_ia&ingreso=65000", function() {
    return !shouldShowSeoIaOnboarding();
  }));

  ok("12 bypass consent gate", withSearch("?source=seo_ia", function() {
    return shouldBypassMiPlanConsentForSeoIa();
  }));

  ok("13 two questions per group screen", withSearch("?source=seo_ia", function() {
    window.CZState.seo_ia_onboarding = { phase: "survey", surveyGroup: 1, respuestas: {} };
    var h = renderSeoIaSurveyGroupScreen(1);
    return h.indexOf("Pregunta 1 de 10") >= 0
      && h.indexOf("Pregunta 2 de 10") >= 0
      && h.indexOf("Pregunta 3 de 10") < 0
      && h.indexOf("btn-seo-ia-survey-next") >= 0
      && h.indexOf("Siguiente") >= 0;
  }));

  ok("14 progress bar + last group label", withSearch("?source=seo_ia", function() {
    var h = renderSeoIaSurveyGroupScreen(5);
    return h.indexOf("Bloque 5 de 5") >= 0
      && h.indexOf("seo-ia-survey-progress") >= 0
      && h.indexOf("Ver mis legales") >= 0;
  }));

  ok("15 legals phase separate", withSearch("?source=seo_ia", function() {
    window.CZState.seo_ia_onboarding = { phase: "legals", surveyGroup: 5, respuestas: {} };
    var h = renderSeoIaOnboarding();
    return h.indexOf("chk-seo-ia-tc") >= 0
      && h.indexOf("btn-seo-ia-diagnosis") >= 0
      && h.indexOf("Ver mi diagnóstico") >= 0;
  }));

  ok("16 group complete detection", withSearch("?source=seo_ia", function() {
    var ob = { respuestas: { p1: "A", p2: "B" } };
    return seoIaSurveyGroupIsComplete(ob, 1) && !seoIaSurveyGroupIsComplete(ob, 2);
  }));

  ok("17 events registered", CZ_GTM_EVENTS.indexOf("miplan_virgin_survey_completed") >= 0);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
