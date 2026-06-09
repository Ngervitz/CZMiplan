/**
 * dev/income-update-qa.js — Income refinement save/recalc QA (A-F)
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
    getElementById: function(id) {
      return global._dom[id] || null;
    },
    createElement: function() {
      return { style: {}, innerHTML: "", setAttribute: function() {}, appendChild: function() {} };
    },
    querySelectorAll: function() { return []; },
    addEventListener: function() {},
    body: { appendChild: function() {} },
  };
  global._dom = {};
  global._crmEvents = [];
  global.trackEvent = function() {};
  global.trackCRMEvent = function(name, payload) {
    global._crmEvents.push({ name: name, payload: payload });
  };
  global.showToast = function() {};
  global.CredizonaUI = { renderAll: function() {} };
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

  function boot() {
    global._dom = {};
    global._crmEvents = [];
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
    load("js/app.js");
    window.CZState = window.CZState || {};
  }

  function setupDashboard(income) {
    PRE.ingreso = income;
    window.CZState = {
      step: 3,
      tab: "acciones",
      gastos: { vivienda: 1000, alimentacion: 500 },
      deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "10000", pago: "1000", situacion_ui: "pagando_normal", debt_confidence: "high" }],
      declared_ingreso: income,
      income_source: "user_input",
      financial_income_complete: true,
      herr: { ingresos: { formal: income, extras: [], total: income }, gastos_cls: {}, compromisos: {} },
      snap: { plan_id: 1, score_reset: 20, nivel: "B", fecha_inicio: new Date().toISOString() },
    };
    window.CZState.diag = calcularMotor();
    global._dom["ing-formal"] = { value: String(income) };
  }

  boot();
  setupDashboard(8888);
  var flujoBeforeEdit = window.CZState.diag.fin.flujoLibre;
  global._dom["ing-formal"].value = "88888";
  syncIngresosFromDom(window.CZState);
  ok("A draft total reflects edited input", window.CZState.herr.ingresos.total === 88888);
  ok("A PRE.ingreso unchanged before save", PRE.ingreso === 8888);
  ok("A diag unchanged before save", window.CZState.diag.fin.flujoLibre === flujoBeforeEdit);

  boot();
  setupDashboard(8888);
  global._dom["ing-formal"] = { value: "88888" };
  var saved = guardarIngresoActualizado();
  ok("B save returns true", saved === true);
  ok("B PRE.ingreso updated", PRE.ingreso === 88888);
  ok("B declared_ingreso updated", window.CZState.declared_ingreso === 88888);
  ok("B income_source user_update", window.CZState.income_source === "user_update");
  ok("B diag recalculated with new income", window.CZState.diag.fin.flujoLibre > 80000);

  boot();
  setupDashboard(88888);
  guardarIngresoActualizado();
  window.guardarLocal();
  var raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  ok("C localStorage persists income", raw.declared_ingreso === 88888);

  boot();
  setupDashboard(8888);
  global._dom["ing-formal"] = { value: "0" };
  ok("D invalid income blocked", guardarIngresoActualizado() === false);
  global._dom["ing-formal"] = { value: "-100" };
  ok("D negative income blocked", guardarIngresoActualizado() === false);

  boot();
  PRE.ingreso = 45000;
  window.CZState = {
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 7000 },
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "22222222", pago: "2", situacion_ui: "pagando_normal", debt_confidence: "high" }],
    declared_ingreso: 45000,
    income_source: "user_input",
    financial_income_complete: true,
    herr: { ingresos: { formal: 45000, extras: [], total: 45000 }, gastos_cls: {}, compromisos: {} },
    snap: { plan_id: 2, fecha_inicio: new Date().toISOString() },
  };
  window.CZState.diag = calcularMotor();
  var blockedBefore = !isRetryEligible(window.CZState.diag, window.CZState);
  global._dom["ing-formal"] = { value: "45000" };
  guardarIngresoActualizado();
  ok("E retry still blocked after same income save", !isRetryEligible(window.CZState.diag, window.CZState) || blockedBefore);
  global._dom["ing-formal"] = { value: "200000" };
  guardarIngresoActualizado();
  ok("E horizon/diag recalculated on high income", window.CZState.diag.fin.flujoLibre > 150000);

  boot();
  setupDashboard(8888);
  global._dom["ing-formal"] = { value: "88888" };
  guardarIngresoActualizado();
  var crm = global._crmEvents.filter(function(e) { return e.name === CZ_EVENT_NAMES.INCOME_UPDATED; });
  ok("F income_updated CRM event emitted", crm.length === 1);
  ok("F CRM payload has delta", crm[0].payload.delta_income === 80000);

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
