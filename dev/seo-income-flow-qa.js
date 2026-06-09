/**
 * dev/seo-income-flow-qa.js — SEO virgin income requirement QA (cases A–F)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.document = {
    getElementById: function(id) {
      if (id === "inp-ingreso-mensual") return { value: "48000" };
      if (id === "inp-profile-nombre") return { value: "Ana Test" };
      if (id === "inp-profile-email") return { value: "ana@example.com" };
      if (id && id.indexOf("-error") > 0) return { textContent: "", style: { display: "none" } };
      return null;
    },
    querySelector: function(sel) {
      if (sel === 'input[name="profile-laboral"]:checked') return { value: "relacion_dependencia" };
      return null;
    },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
  };
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.enviarCRM = function() {};
  global.showToast = function() {};
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

  function configHasDefault65000() {
    var src = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
    return /\|\|\s*65000/.test(src) || /ingreso:\s*65000/.test(src);
  }

  // A — SEO virgin, no income → income step, dashboard blocked
  bootCore("?source=seo_ia");
  ok("A PRE.ingreso is zero without URL param", (parseFloat(PRE.ingreso) || 0) === 0);
  global.window.CZState = {
    step: 3,
    miplan_started: true,
    deudas: [],
    gastos: {},
    gastos_missing_confirmed: true,
    financial_debts_complete: true,
    financial_expenses_complete: true,
    user_recovery_state: "dashboard_generated",
    temporal: { dashboard_generated_at: new Date().toISOString() },
  };
  ok("A dashboard blocked without income", !hasCompletedFinancialInputs(global.window.CZState));
  ensureFinancialStepBeforeDashboard(global.window.CZState);
  ok("A routes to income step", global.window.CZState.step === 0);
  ok("A needs income step UI", needsIncomeStep(global.window.CZState));

  // B — enter income → dashboard allowed with matching value
  bootCore("?source=seo_ia");
  global.window.CZState = {
    step: 0,
    miplan_started: true,
    deudas: [],
    gastos: {},
    temporal: {},
  };
  next();
  ok("B income persisted on PRE", PRE.ingreso === 48000);
  ok("B income source user_input", global.window.CZState.income_source === "user_input");
  ok("B routes to debts after income", global.window.CZState.step === 1);
  global.window.CZState.financial_debts_complete = true;
  global.window.CZState.no_debts_declared = true;
  global.window.CZState.financial_expenses_complete = true;
  ok("B financial complete after income+debts+expenses", hasCompletedFinancialInputs(global.window.CZState));

  // C — no production default-income path
  ok("C no hardcoded 65000 default in config.js", !configHasDefault65000());

  // D — URL ?ingreso=65000 accepted as url_param only
  bootCore("?source=seo_ia&ingreso=65000");
  applyUrlIngresoSource(global.window.CZState);
  ok("D URL income accepted", hasCompletedIncomeInputs(global.window.CZState));
  ok("D income_source url_param", global.window.CZState.income_source === "url_param");
  ok("D PRE.ingreso from URL", PRE.ingreso === 65000);

  // E — returning user with persisted declared_ingreso (no URL param)
  bootCore("?source=seo_ia");
  global.window.CZState = {
    step: 3,
    declared_ingreso: 72000,
    declared_nombre: "María López",
    declared_laboral: "relacion_dependencia",
    income_source: "localStorage_restore",
    financial_income_complete: true,
    financial_profile_complete: true,
    user_email: "maria@example.com",
    financial_debts_complete: true,
    financial_expenses_complete: true,
    no_debts_declared: true,
    gastos_missing_confirmed: true,
    deudas: [],
    gastos: {},
    user_recovery_state: "dashboard_generated",
    temporal: { dashboard_generated_at: new Date().toISOString() },
    diag: { planId: 2 },
    snap: { plan_id: 2 },
  };
  syncPreIngresoFromState(global.window.CZState);
  ok("E returning user dashboard allowed", hasCompletedFinancialInputs(global.window.CZState));
  ok("E restored income on PRE", PRE.ingreso === 72000);

  // F — SyntheticMotorQA unchanged (smoke: calcularMotor still runs with explicit PRE.ingreso)
  bootCore("");
  PRE.ingreso = 55000;
  PRE.respuestas = { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" };
  var diag = calcularMotor();
  ok("F calcularMotor runs with explicit income", !!(diag && diag.fin));

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
