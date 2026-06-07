/**
 * dev/crm-seo-ia-payload-qa.js — Verifies SEO IA fields in buildCRMData()
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.document = { getElementById: function() { return null; } };
  global.trackEvent = function() {};
  global.window.location = { search: "?source=seo_ia&intent=clearing&question=como-salir-del-clearing&utm_source=google&utm_medium=cpc&utm_campaign=clearing_q1&utm_content=ad1&utm_term=clearing" };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/survey.js");
  load("js/creditors.js");
  load("js/algorithms.js");
  load("js/crm.js");

  var resp = {
    p1:"A",p2:"B",p3:"A",p4:"B",p5:"C",p6:"A",p7:"B",p8:"A",p9:"B",p10:"A",
  };
  var seoMeta = calcularEncuestaSeoIa(resp);

  global.window.CZState = {
    seo_ia_survey: Object.assign({}, seoMeta, {
      respuestas: resp,
      acquisition: getSeoIaAcquisitionPayload(),
      started_at: "2026-05-28T10:00:00.000Z",
      completed_at: "2026-05-28T10:05:00.000Z",
    }),
    gastos: {},
    custom_expenses: [],
    deudas: [],
    consent: { miplan_tc_accepted: true, consent_source: "seo_ia_onboarding" },
  };

  for (var i = 1; i <= 10; i++) PRE.respuestas["p" + i] = resp["p" + i];

  var motor = calcularMotor();
  var payload = buildCRMData(motor);

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  ok("survey.respuestas.p1", payload.survey.respuestas && payload.survey.respuestas.p1 === "A");
  ok("survey.respuestas.p10", payload.survey.respuestas && payload.survey.respuestas.p10 === "A");
  ok("seo_ia_survey.respuestas", payload.seo_ia_survey && payload.seo_ia_survey.respuestas.p6 === "A");
  ok("score_v2", payload.seo_ia_survey && payload.seo_ia_survey.score_v2 != null);
  ok("baseline_nivel", payload.seo_ia_survey && payload.seo_ia_survey.baseline_nivel);
  ok("nivel_final", payload.seo_ia_survey && payload.seo_ia_survey.nivel_final);
  ok("flags_riesgo array", payload.seo_ia_survey && Array.isArray(payload.seo_ia_survey.flags_riesgo));
  ok("version_cuestionario", payload.seo_ia_survey && payload.seo_ia_survey.version_cuestionario === "seo_ia_v1_weighted");
  ok("acquisition.source", payload.acquisition && payload.acquisition.source === "seo_ia");
  ok("acquisition.intent", payload.acquisition && payload.acquisition.intent === "clearing");
  ok("acquisition.question", payload.acquisition && payload.acquisition.question === "como-salir-del-clearing");
  ok("utm_source", payload.acquisition && payload.acquisition.utm_source === "google");
  ok("utm_medium", payload.acquisition && payload.acquisition.utm_medium === "cpc");
  ok("utm_campaign", payload.acquisition && payload.acquisition.utm_campaign === "clearing_q1");

  console.log("");
  console.log("--- buildCRMData() ejemplo (campos SEO IA) ---");
  console.log(JSON.stringify({
    evento: "miplan_virgin_survey_completed",
    acquisition: payload.acquisition,
    survey: {
      completada: payload.survey.completada,
      respuestas: payload.survey.respuestas,
      score: payload.survey.score,
      nivel: payload.survey.nivel,
    },
    seo_ia_survey: payload.seo_ia_survey,
    diagnosis: {
      score_reset: payload.diagnosis.score_reset,
      nivel_reset: payload.diagnosis.nivel_reset,
      plan_id: payload.diagnosis.plan_id,
    },
  }, null, 2));

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
