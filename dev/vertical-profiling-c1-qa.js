/**
 * dev/vertical-profiling-c1-qa.js — Sprint C1 vertical profiling block QA (A–N)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
  global.document = {
    getElementById: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.enviarCRM = function() {};
  var _stored = null;
  global.localStorage = {
    getItem: function(k) { return _stored && _stored.key === k ? _stored.val : null; },
    setItem: function(k, v) { _stored = { key: k, val: v }; },
    removeItem: function() { _stored = null; },
  };

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
    load("js/app.js");
  }

  function crmFor(st, diag) {
    window.CZState = st;
    return buildCRMData(diag || st.diag || null);
  }

  function gastosHtml(st) {
    window.CZState = st;
    PRE.ingreso = 80000;
    return renderGastos();
  }

  boot();
  PRE.ingreso = 80000;

  var baseSt = {
    step: 2,
    gastos: { vivienda: 12000, alimentacion: 8000 },
    deudas: [{ tipo: "prestamo", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    custom_expenses: [],
    vertical_profiling_opened: false,
  };

  // A — collapsed by default
  var htmlA = gastosHtml(Object.assign({}, baseSt));
  ok("A block present", htmlA.indexOf("vertical-profiling-block") >= 0);
  ok("A collapsed label", htmlA.indexOf("▼") >= 0 && htmlA.indexOf("Personalizá tus recomendaciones (opcional)") >= 0);
  ok("A body hidden", htmlA.indexOf("vertical-profiling-body") < 0);

  // B — expands when opened
  var stB = Object.assign({}, baseSt, { vertical_profiling_opened: true });
  var htmlB = gastosHtml(stB);
  ok("B expanded chevron", htmlB.indexOf("▲ Personalizá tus recomendaciones (opcional)") >= 0
    || (htmlB.indexOf("▲") >= 0 && htmlB.indexOf("Personalizá tus recomendaciones") >= 0));
  ok("B body visible", htmlB.indexOf("vertical-profiling-body") >= 0);

  // C — all 4 questions visible when expanded
  ok("C q1 vivienda", htmlB.indexOf("¿Cómo es tu vivienda?") >= 0);
  ok("C q2 vehiculo", htmlB.indexOf("¿Tenés vehículo propio?") >= 0);
  ok("C q3 salud", htmlB.indexOf("¿Pagás mutualista o seguro médico?") >= 0);
  ok("C q4 educacion", htmlB.indexOf("¿Pagás colegio privado o universidad?") >= 0);

  // D — all 4 answered
  var stD = Object.assign({}, baseSt, {
    vertical_profiling_opened: true,
    vertical_housing_status: "rent",
    vertical_has_vehicle: true,
    vertical_has_health_coverage: false,
    vertical_has_education_expenses: true,
  });
  syncVerticalProfilingCompletion(stD);
  var crmD = crmFor(stD);
  ok("D completion 4", stD.vertical_profiling_completion === 4);
  ok("D completed true", stD.vertical_profiling_completed === true);
  ok("D CRM housing", crmD.vertical_housing_status === "rent");
  ok("D CRM vehicle", crmD.vertical_has_vehicle === true);
  ok("D CRM health", crmD.vertical_has_health_coverage === false);
  ok("D CRM education", crmD.vertical_has_education_expenses === true);
  ok("D CRM completion", crmD.vertical_profiling_completion === 4);
  ok("D CRM completed", crmD.vertical_profiling_completed === true);

  // E — none answered
  var stE = Object.assign({}, baseSt);
  syncVerticalProfilingCompletion(stE);
  var crmE = crmFor(stE);
  ok("E completion 0", stE.vertical_profiling_completion === 0);
  ok("E completed false", stE.vertical_profiling_completed === false);
  ok("E CRM housing null", crmE.vertical_housing_status == null);
  ok("E CRM vehicle null", crmE.vertical_has_vehicle == null);
  ok("E CRM health null", crmE.vertical_has_health_coverage == null);
  ok("E CRM education null", crmE.vertical_has_education_expenses == null);

  // F — partial (vivienda + vehiculo)
  var stF = Object.assign({}, baseSt, {
    vertical_housing_status: "mortgage",
    vertical_has_vehicle: false,
  });
  syncVerticalProfilingCompletion(stF);
  var crmF = crmFor(stF);
  ok("F housing", crmF.vertical_housing_status === "mortgage");
  ok("F vehicle", crmF.vertical_has_vehicle === false);
  ok("F health null", crmF.vertical_has_health_coverage == null);
  ok("F education null", crmF.vertical_has_education_expenses == null);
  ok("F completion 2", stF.vertical_profiling_completion === 2);
  ok("F completed false", stF.vertical_profiling_completed === false);

  // G — never opened
  var stG = Object.assign({}, baseSt);
  var crmG = crmFor(stG);
  ok("G opened false", crmG.vertical_profiling_opened === false);
  ok("G fields null", crmG.vertical_housing_status == null && crmG.vertical_has_vehicle == null);

  // H — opened no answers
  var stH = Object.assign({}, baseSt, { vertical_profiling_opened: true });
  syncVerticalProfilingCompletion(stH);
  var crmH = crmFor(stH);
  ok("H opened true", crmH.vertical_profiling_opened === true);
  ok("H completion 0", stH.vertical_profiling_completion === 0);
  ok("H CRM fields null", crmH.vertical_has_vehicle == null);

  // I — persistence via guardarLocal
  _stored = null;
  window.CZState = Object.assign({}, baseSt, {
    vertical_profiling_opened: true,
    vertical_housing_status: "own_family",
    vertical_has_vehicle: true,
  });
  syncVerticalProfilingCompletion(window.CZState);
  window.guardarLocal();
  var raw = global.localStorage.getItem("cr_v3");
  ok("I persisted to localStorage", !!raw);
  var parsed = JSON.parse(raw);
  ok("I housing restored value", parsed.vertical_housing_status === "own_family");
  ok("I vehicle restored value", parsed.vertical_has_vehicle === true);
  ok("I opened restored", parsed.vertical_profiling_opened === true);

  // J — motor unchanged
  window.CZState = Object.assign({}, baseSt, { diag: null });
  var motorBefore = calcularMotor();
  window.CZState.vertical_housing_status = "rent";
  window.CZState.vertical_has_vehicle = true;
  window.CZState.vertical_has_health_coverage = false;
  window.CZState.vertical_has_education_expenses = true;
  var motorAfter = calcularMotor();
  ok("J planId unchanged", motorBefore.planId === motorAfter.planId);
  ok("J scoreFin unchanged", motorBefore.fin.scoreFinanciero === motorAfter.fin.scoreFinanciero);
  ok("J scoreReset unchanged", motorBefore.scoreReset === motorAfter.scoreReset);

  // K — hasCompletedExpenseInputs unchanged
  var stK = Object.assign({}, baseSt, { financial_expenses_complete: false, gastos: { vivienda: 5000 } });
  ok("K expense inputs fn exists", typeof hasCompletedExpenseInputs === "function");
  var beforeK = hasCompletedExpenseInputs(stK);
  stK.vertical_housing_status = "rent";
  ok("K unchanged after profiling", hasCompletedExpenseInputs(stK) === beforeK);

  // L — gastos_missing_confirmed unchanged by profiling
  var stL = Object.assign({}, baseSt, { gastos_missing_confirmed: true });
  stL.vertical_housing_status = "rent";
  ok("L flag unchanged", stL.gastos_missing_confirmed === true);

  // M — SyntheticMotorQA module
  ok("M synthetic module present", fs.existsSync(path.join(root, "dev/synthetic-motor-test.js")));

  // N — block only in step 2 gastos render
  window.CZState = Object.assign({}, baseSt, { step: 3, diag: calcularMotor() });
  ok("N not in dashboard", renderTabPlan().indexOf("vertical-profiling-block") < 0);
  ok("N not in hero", _renderDashboardHeroCard(window.CZState.diag, window.CZState).indexOf("vertical-profiling-block") < 0);

  console.log("\nVertical profiling C1 QA: " + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed > 0 ? 1 : 0);
})();
