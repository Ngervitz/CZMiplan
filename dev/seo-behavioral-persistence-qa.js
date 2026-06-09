/**
 * dev/seo-behavioral-persistence-qa.js — SEO behavioral survey persistence + CTA QA
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
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.localStorage = {
    _data: {},
    getItem: function(k) { return this._data[k] || null; },
    setItem: function(k, v) { this._data[k] = v; },
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

  function bootCore(search) {
    global.window.location = { search: search || "?source=seo_ia", href: "" };
    global.window.CZState = null;
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
    load("js/consent.js");
    load("js/app.js");
    if (!global.window.CZState) global.window.CZState = {};
    if (!global.window.CZState.temporal) global.window.CZState.temporal = {};
    global.window.CredizonaUI = { renderAll: function() {} };
  }

  function seoResp() {
    return { p1:"A",p2:"A",p3:"A",p4:"A",p5:"A",p6:"A",p7:"A",p8:"A",p9:"A",p10:"A" };
  }

  function simulateSeoDashboard(st, ingreso, gastos) {
    PRE.ingreso = ingreso;
    st.gastos = gastos;
    st.no_debts_declared = true;
    st.financial_debts_complete = true;
    st.financial_expenses_complete = true;
    st.gastos_missing_confirmed = true;
    syncPreRespuestasFromSeoIaSurvey(st);
    st.diag = calcularMotor();
    st.step = 3;
    return st;
  }

  // A — SEO incognito, p1-p10, no debts, default expenses
  bootCore("?source=seo_ia");
  global.window.CZState = { step: 1, deudas: [], gastos: {}, temporal: {} };
  var respA = seoResp();
  global.window.CZState.seo_ia_survey = Object.assign({}, calcularEncuestaSeoIa(respA), {
    respuestas: respA,
    completed_at: new Date().toISOString(),
    acquisition: { source: "seo_ia" },
  });
  for (var i = 1; i <= 10; i++) PRE.respuestas["p" + i] = null;
  simulateSeoDashboard(global.window.CZState, 65000, {});
  ok("A behavioral data detected", hasBehavioralSurveyData(global.window.CZState, global.window.CZState.diag));
  ok("A enc score populated", getBehavioralEncForDisplay(global.window.CZState, global.window.CZState.diag).score > 0);
  ok("A no behavioral CTA", !shouldShowBehavioralRefinementCta(global.window.CZState, global.window.CZState.diag));

  // B — SEO with debts + expenses
  bootCore("?source=seo_ia");
  global.window.CZState = { step: 2, deudas: [{
    tipo: "prestamo", acreedor: "BROU", monto: "80000", pago: "5000", situacion_ui: "pagando_normal",
  }], gastos: { vivienda: 12000 }, temporal: {} };
  global.window.CZState.seo_ia_survey = Object.assign({}, calcularEncuestaSeoIa(seoResp()), {
    respuestas: seoResp(),
    completed_at: new Date().toISOString(),
  });
  for (var j = 1; j <= 10; j++) PRE.respuestas["p" + j] = null;
  syncPreRespuestasFromSeoIaSurvey(global.window.CZState);
  global.window.CZState.diag = calcularMotor();
  global.window.CZState.step = 3;
  ok("B behavioral data with debts", hasBehavioralSurveyData(global.window.CZState, global.window.CZState.diag));
  ok("B no behavioral CTA", !shouldShowBehavioralRefinementCta(global.window.CZState, global.window.CZState.diag));

  // C — restore seo_ia_survey without PRE (other device / reload)
  bootCore("?source=seo_ia");
  for (var k = 1; k <= 10; k++) PRE.respuestas["p" + k] = null;
  global.window.CZState = {
    step: 3,
    deudas: [],
    gastos: {},
    gastos_missing_confirmed: true,
    seo_ia_survey: Object.assign({}, calcularEncuestaSeoIa(seoResp()), {
      respuestas: seoResp(),
      completed_at: new Date().toISOString(),
      acquisition: { source: "seo_ia", intent: "clearing" },
    }),
    diag: null,
    temporal: {},
  };
  syncPreRespuestasFromSeoIaSurvey(global.window.CZState);
  global.window.CZState.diag = calcularMotor();
  ok("C PRE restored from seo_ia_survey", surveyIsActive(PRE.respuestas));
  ok("C behavioral profile after restore", hasBehavioralSurveyData(global.window.CZState, global.window.CZState.diag));

  // D — returning user without p1-p10: CTA allowed with working flow
  bootCore("?ingreso=65000");
  global.window.CZState = { step: 3, diag: calcularMotor(), temporal: {} };
  ok("D no behavioral data", !hasBehavioralSurveyData(global.window.CZState, global.window.CZState.diag));
  ok("D CTA shown with SURVEY_URL flow", shouldShowBehavioralRefinementCta(global.window.CZState, global.window.CZState.diag));

  // E — CTA audit: completed SEO never shows CTA
  bootCore("?source=seo_ia");
  global.window.CZState.seo_ia_survey = {
    respuestas: seoResp(),
    completed_at: new Date().toISOString(),
  };
  ok("E completed SEO hides CTA", !shouldShowBehavioralRefinementCta(global.window.CZState, null));

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
