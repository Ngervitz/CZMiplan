/**
 * dev/income-copy-b5b-qa.js — Sprint B5b income field copy QA (A–H)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  function makeDocumentMock() {
    return {
      _fields: {},
      getElementById: function(id) {
        if (id === "inp-profile-nombre") return { value: this._fields.nombre || "" };
        if (id === "inp-profile-email") return { value: this._fields.email || "" };
        if (id === "inp-ingreso-mensual") return { value: this._fields.ingreso != null ? this._fields.ingreso : "" };
        if (id === "profile-ingreso-error") {
          return this._ingresoErr || (this._ingresoErr = { textContent: "", style: { display: "none" } });
        }
        if (id && id.indexOf("-error") > 0) {
          return { textContent: "", style: { display: "none" } };
        }
        return null;
      },
      querySelector: function(sel) {
        if (sel === 'input[name="profile-laboral"]:checked') {
          return this._fields.laboral ? { value: this._fields.laboral } : null;
        }
        return null;
      },
      querySelectorAll: function() { return []; },
      addEventListener: function() {},
    };
  }
  global.document = makeDocumentMock();
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

  function boot() {
    global.window.location = { search: "?source=seo_ia", href: "" };
    global.document = makeDocumentMock();
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
    load("js/app.js");
    global.window.CZState = { step: 0, miplan_started: true, temporal: {} };
  }

  var uiJs = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var appJs = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  var crmJs = fs.readFileSync(path.join(root, "js/crm.js"), "utf8");
  var algoJs = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");

  boot();
  var incomeHtml = renderIngreso();
  var newLabel = "¿Cuánto dinero te entra aproximadamente por mes?";
  var helperText = "Incluí sueldo, changas, comisiones, ventas, ayuda familiar u otras entradas de dinero. Si varía, usá un estimado promedio.";
  var newError = "Ingresá un monto estimado, aunque tus ingresos varíen. Cualquier entrada de dinero cuenta.";

  ok("A field label updated", incomeHtml.indexOf(newLabel) >= 0
    && incomeHtml.indexOf("ingreso líquido mensual") < 0);

  ok("B helper text visible below input", incomeHtml.indexOf(helperText) >= 0
    && incomeHtml.indexOf("inp-ingreso-mensual") >= 0
    && incomeHtml.indexOf(helperText) > incomeHtml.indexOf("inp-ingreso-mensual"));

  global.document._fields = {
    nombre: "Ana",
    email: "ana@example.com",
    ingreso: "0",
    laboral: "monotributista",
  };
  var zeroResult = collectBasicProfileForm();
  ok("C error message updated when value = 0", zeroResult === null
    && global.document._ingresoErr.textContent === newError);

  global.document._ingresoErr = { textContent: "", style: { display: "none" } };
  global.document._fields.ingreso = "";
  var emptyResult = collectBasicProfileForm();
  ok("D error message updated when value is empty", emptyResult === null
    && global.document._ingresoErr.textContent === newError);

  global.document._ingresoErr = { textContent: "", style: { display: "none" } };
  global.document._fields.ingreso = "-100";
  ok("E validation still blocks <= 0", collectBasicProfileForm() === null);

  global.document._fields.ingreso = "48000";
  ok("E positive income still accepted", collectBasicProfileForm() !== null);

  ok("F motor function body unchanged", algoJs.indexOf("function calcularMotor") >= 0
    && !/function calcularMotor[\s\S]{0,200}Cuánto dinero/.test(algoJs));

  boot();
  PRE.nombre = "Ana";
  PRE.email = "ana@example.com";
  PRE.laboral = "monotributista";
  PRE.ingreso = 48000;
  global.window.CZState = {
    user_email: "ana@example.com",
    diag: { fin: {}, planId: 2, enc: { score: 10 } },
  };
  var crm = buildCRMData(global.window.CZState.diag);
  ok("G CRM payload unchanged", crm.user.nombre === "Ana"
    && crm.user.email === "ana@example.com"
    && crm.user.situacion_laboral === "monotributista"
    && crm.user.ingreso_declarado === 48000);

  ok("G CRM file has no B5b copy", crmJs.indexOf("changas") < 0 && crmJs.indexOf("monto estimado") < 0);

  console.log("\n--- SyntheticMotorQA ---");
  var motorOut = require("child_process").execSync(
    "node dev/synthetic-motor-test.js",
    { cwd: root, encoding: "utf8" }
  );
  ok("H SyntheticMotorQA 31/31", /SyntheticMotorQA — 31\/31 PASS/.test(motorOut));

  console.log("\nincome-copy-b5b-qa — " + passed + " PASS, " + failed + " FAIL");
  if (failed > 0) process.exit(1);
})();
