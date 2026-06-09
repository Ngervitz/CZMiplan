/**
 * dev/no-debts-flow-qa.js — explicit "no debts" step 1 flow + CRM event QA
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

  var crmEnviarCalls = [];
  var trackEventCalls = [];

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
    crmEnviarCalls.length = 0;
    trackEventCalls.length = 0;
    global.window.dataLayer = [];
    global.window.location = { search: search || "?ingreso=65000", href: "" };
    global.window.CZState = null;
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/analytics.js");
    load("js/ui.js");
    load("js/consent.js");
    load("js/app.js");
    global.enviarCRM = function(evento, telemetry) {
      crmEnviarCalls.push({ evento: evento, telemetry: telemetry });
    };
    if (!global.window.CZState) global.window.CZState = {};
    if (!global.window.CZState.temporal) global.window.CZState.temporal = {};
    global.window.CredizonaUI = { renderAll: function() {} };

    var origTrackEvent = trackEvent;
    global.trackEvent = function(name, payload) {
      trackEventCalls.push({ name: name, payload: payload || {} });
      return origTrackEvent(name, payload);
    };
  }

  function lastNoDebtsCrmCall() {
    for (var i = crmEnviarCalls.length - 1; i >= 0; i--) {
      if (crmEnviarCalls[i].evento === "no_debts_declared") return crmEnviarCalls[i];
    }
    return null;
  }

  function countNoDebtsCrmCalls() {
    return crmEnviarCalls.filter(function(c) { return c.evento === "no_debts_declared"; }).length;
  }

  // Flow A — click "No tengo deudas activas"
  bootCore("?ingreso=65000");
  global.window.CZState = {
    step: 1,
    deudas: [],
    gastos: {},
    no_debts_declared: false,
    financial_debts_complete: false,
    financial_expenses_complete: false,
    temporal: {},
  };
  handleNoDebtsDeclared();
  ok("A no_debts_declared true", global.window.CZState.no_debts_declared === true);
  ok("A advances to step 2", global.window.CZState.step === 2);
  ok("A dashboard not shown yet", global.window.CZState.step !== 3);

  // CRM A — single event with expected fields
  bootCore("?source=seo_ia&intent=clearing&ingreso=65000&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A");
  global.window.CZState = {
    step: 1,
    deudas: [],
    no_debts_declared: false,
    temporal: {},
    seo_ia_survey: {
      acquisition: { source: "seo_ia", intent: "clearing" },
      respuestas: { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" },
    },
    _preliminary_diag: { planId: 3, scoreReset: 58 },
  };
  handleNoDebtsDeclared();
  ok("CRM A emitted once", countNoDebtsCrmCalls() === 1);
  var crmA = lastNoDebtsCrmCall();
  ok("CRM A evento no_debts_declared", crmA && crmA.evento === "no_debts_declared");
  var telA = crmA && crmA.telemetry ? crmA.telemetry : {};
  ok("CRM A income present", telA.income === 65000);
  ok("CRM A plan_id from preliminary diag", telA.plan_id === 3);
  ok("CRM A score_reset from preliminary diag", telA.score_reset === 58);
  ok("CRM A source from acquisition", telA.source === "seo_ia");
  ok("CRM A intent from acquisition", telA.intent === "clearing");
  ok("CRM A timestamp present", !!(telA.timestamp));

  // CRM B — rapid double execution
  bootCore("?ingreso=65000");
  global.window.CZState = { step: 1, deudas: [], no_debts_declared: false, temporal: {} };
  global.window.CZState._noDebtsDeclaredHandlerBusy = true;
  handleNoDebtsDeclared();
  ok("CRM B busy guard blocks duplicate handler", countNoDebtsCrmCalls() === 0);
  global.window.CZState._noDebtsDeclaredHandlerBusy = false;
  handleNoDebtsDeclared();
  handleNoDebtsDeclared();
  ok("CRM B second click blocked by step change", countNoDebtsCrmCalls() === 1);

  // CRM C — declare → add debt → declare again
  bootCore("?ingreso=65000");
  global.window.CZState = { step: 1, deudas: [], no_debts_declared: false, temporal: {} };
  handleNoDebtsDeclared();
  ok("CRM C first declaration emits", countNoDebtsCrmCalls() === 1);
  clearNoDebtsDeclaredState(global.window.CZState);
  global.window.CZState.step = 1;
  global.window.CZState.deudas = [{ acreedor: "OCA", monto: "1000", pago: "100", situacion_ui: "pagando_normal" }];
  ok("CRM C cleared no_debts_declared", global.window.CZState.no_debts_declared === false);
  global.window.CZState.deudas = [];
  handleNoDebtsDeclared();
  ok("CRM C second declaration emits new event", countNoDebtsCrmCalls() === 2);

  // CRM D — no GTM / dataLayer for CRM event name
  bootCore("?ingreso=65000");
  var dlBefore = (global.window.dataLayer || []).length;
  var blocked = trackEvent("no_debts_declared", { income: 65000 });
  ok("CRM D trackEvent blocked for CRM-only name", blocked === null);
  ok("CRM D no dataLayer push", (global.window.dataLayer || []).length === dlBefore);
  ok("CRM D no_debts_declared not in trackEventCalls as GTM path", trackEventCalls.filter(function(c) {
    return c.name === "no_debts_declared";
  }).length === 0 || blocked === null);
  ok("CRM D handleNoDebts uses trackCRM not trackEvent for no_debts_declared", (function() {
    global.window.CZState = { step: 1, deudas: [], no_debts_declared: false, temporal: {} };
    var before = trackEventCalls.length;
    handleNoDebtsDeclared();
    var added = trackEventCalls.slice(before);
    return added.every(function(c) { return c.name !== "no_debts_declared"; });
  })());

  // Flow B/C unchanged
  bootCore("?ingreso=65000");
  global.window.CZState = {
    step: 2,
    deudas: [],
    gastos: { vivienda: 12000 },
    no_debts_declared: true,
    financial_debts_complete: true,
    financial_expenses_complete: true,
    temporal: { dashboard_generated_at: new Date().toISOString() },
    snap: { plan_id: 1 },
    diag: { planId: 1 },
  };
  ok("Flow B dashboard allowed after expenses", hasCompletedFinancialInputs(global.window.CZState));

  bootCore("?ingreso=65000");
  global.window.CZState = {
    step: 1,
    deudas: [{ acreedor: "OCA", monto: "30000", pago: "2000", situacion_ui: "pagando_normal" }],
    temporal: {},
  };
  handleNoDebtsDeclared();
  ok("Flow C blocked when deudas exist", global.window.CZState.step === 1);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
