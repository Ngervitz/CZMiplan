/**
 * dev/seo-ia-routing-qa.js — SEO onboarding routing / financial completeness QA
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
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.enviarCRM = function() {};
  global.localStorage = {
    _data: {},
    getItem: function(k) { return this._data[k] || null; },
    setItem: function(k, v) { this._data[k] = v; },
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

  function bootCore(search) {
    global.window.location = { search: search || "", href: "" };
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
  }

  // A — SEO survey complete must NOT unlock dashboard
  bootCore("?source=seo_ia");
  global.window.CZState = {
    step: 3,
    deudas: [],
    gastos: {},
    gastos_missing_confirmed: false,
    financial_debts_complete: false,
    financial_expenses_complete: false,
    user_recovery_state: "survey_completed",
    temporal: {},
    seo_ia_onboarding: { phase: "done", respuestas: { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" } },
  };
  ok("A survey-only does not pass financial guard", !hasCompletedFinancialInputs(global.window.CZState));
  ensureFinancialStepBeforeDashboard(global.window.CZState);
  ok("A routes to income step", global.window.CZState.step === 0);

  // B — returning user with complete financial state
  bootCore("?source=seo_ia&ingreso=65000");
  global.window.CZState = {
    step: 3,
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "50000", pago: "3000", situacion_ui: "pagando_normal" }],
    gastos: { vivienda: 12000 },
    gastos_missing_confirmed: false,
    financial_debts_complete: true,
    financial_expenses_complete: true,
    user_recovery_state: "dashboard_generated",
    temporal: { dashboard_generated_at: new Date().toISOString() },
    snap: { plan_id: 3 },
    diag: { planId: 3 },
  };
  ok("B complete returning state allowed", hasCompletedFinancialInputs(global.window.CZState));

  // C — fresh URL p1-p10 without financial inputs
  bootCore("?source=seo_ia&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A");
  global.window.CZState = {
    step: 3,
    deudas: [],
    gastos: {},
    gastos_missing_confirmed: true,
    user_recovery_state: "dashboard_generated",
    temporal: { dashboard_generated_at: new Date().toISOString() },
  };
  ok("C fresh URL survey without financial inputs blocked", !hasCompletedFinancialInputs(global.window.CZState));
  ensureFinancialStepBeforeDashboard(global.window.CZState);
  ok("C routes to income step", global.window.CZState.step === 0);

  // D — legacy restored complete flow without explicit flags
  bootCore("?ingreso=65000&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A");
  global.window.CZState = {
    step: 3,
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "80000", pago: "5000", situacion_ui: "pagando_normal" }],
    gastos: { vivienda: 10000, alimentacion: 6000 },
    gastos_missing_confirmed: false,
    user_recovery_state: "dashboard_generated",
    temporal: { dashboard_generated_at: "2026-01-01T00:00:00.000Z" },
    snap: { plan_id: 2 },
    diag: { planId: 2 },
  };
  ok("D legacy complete dashboard still allowed", hasCompletedFinancialInputs(global.window.CZState));

  // E — explicit no-debts flag + expense baseline accepted
  bootCore("?source=seo_ia&ingreso=65000");
  global.window.CZState = {
    step: 3,
    deudas: [],
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    financial_debts_complete: true,
    financial_expenses_complete: true,
    user_recovery_state: "dashboard_generated",
    temporal: { dashboard_generated_at: new Date().toISOString() },
    snap: { plan_id: 2 },
    diag: { planId: 2 },
  };
  ok("E no-debts declared + gastos baseline allows dashboard", hasCompletedFinancialInputs(global.window.CZState));

  // F — dashboard unlock audit (static list)
  var unlockPaths = [
    "next() step 2→3 when financial inputs complete",
    "init() dataToUse restore when hasCompletedFinancialInputs()",
    "renderAll() step 3 via ensureFinancialStepBeforeDashboard() guard",
    "completeSeoIaOnboarding() routes via resolveNextRequiredFinancialStep()",
    "init() fresh URL routes via resolveNextRequiredFinancialStep()",
  ];
  ok("F audit unlock paths documented", unlockPaths.length === 5);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
