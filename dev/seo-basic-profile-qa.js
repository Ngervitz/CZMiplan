/**
 * dev/seo-basic-profile-qa.js — Basic Profile + Income step QA (cases A–H)
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
        if (id === "inp-ingreso-mensual") return { value: this._fields.ingreso || "" };
        if (id && id.indexOf("-error") > 0) {
          if (id === "profile-email-error") {
            return this._emailErr || (this._emailErr = { textContent: "", style: { display: "none" } });
          }
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

  function bootCore(search) {
    global.window.location = { search: search || "", href: "" };
    global.window.CZState = null;
    global.document = makeDocumentMock();
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

  function setProfileForm(fields) {
    global.document._fields = fields || {};
  }

  // A — virgin SEO user sees basic profile step
  bootCore("?source=seo_ia");
  global.window.CZState = { step: 0, miplan_started: true, temporal: {} };
  ok("A needs basic profile step", needsIncomeStep(global.window.CZState));
  ok("A profile incomplete without fields", !hasCompletedBasicProfileInputs(global.window.CZState));

  // B — missing required fields blocks continue
  bootCore("?source=seo_ia");
  global.window.CZState = { step: 0, miplan_started: true, temporal: {} };
  setProfileForm({ nombre: "", email: "", ingreso: "", laboral: "" });
  var blocked = collectBasicProfileForm();
  ok("B missing fields blocked", blocked === null);

  // C — invalid email blocked with inline message
  bootCore("?source=seo_ia");
  setProfileForm({
    nombre: "Nicolás",
    email: "correo-invalido",
    ingreso: "50000",
    laboral: "relacion_dependencia",
  });
  var invalidEmail = collectBasicProfileForm();
  ok("C invalid email blocked", invalidEmail === null);
  ok("C inline email error", global.document._emailErr.textContent === "Ingresá un email válido");

  // D — all fields complete → debts step
  bootCore("?source=seo_ia");
  global.window.CZState = { step: 0, miplan_started: true, temporal: {} };
  setProfileForm({
    nombre: "Nicolás Pérez",
    email: "nicolas@example.com",
    ingreso: "48000",
    laboral: "relacion_dependencia",
  });
  next();
  ok("D continues to debts", global.window.CZState.step === 1);
  ok("D name persisted", PRE.nombre === "Nicolás Pérez");
  ok("D email persisted", global.window.CZState.user_email === "nicolas@example.com");
  ok("D laboral persisted", PRE.laboral === "relacion_dependencia");
  ok("D income persisted", PRE.ingreso === 48000);

  // E — dashboard greeting uses first name
  bootCore("?source=seo_ia");
  global.window.CZState = {
    declared_nombre: "Nicolás Pérez",
    financial_profile_complete: true,
    financial_income_complete: true,
    income_source: "user_input",
    declared_ingreso: 48000,
    declared_laboral: "relacion_dependencia",
    user_email: "nicolas@example.com",
  };
  syncPreProfileFromState(global.window.CZState);
  ok("E greeting first name", getProfileFirstName(global.window.CZState) === "Nicolás");

  // F — CRM payload reuses existing user.* fields
  bootCore("?source=seo_ia");
  PRE.nombre = "Nicolás Pérez";
  PRE.email = "nicolas@example.com";
  PRE.laboral = "monotributista";
  PRE.ingreso = 48000;
  global.window.CZState = {
    user_email: "nicolas@example.com",
    diag: { fin: {}, planId: 2, enc: { score: 10 } },
  };
  var crm = buildCRMData(global.window.CZState.diag);
  ok("F CRM nombre reused", crm.user.nombre === "Nicolás Pérez");
  ok("F CRM email reused", crm.user.email === "nicolas@example.com");
  ok("F CRM situacion_laboral reused", crm.user.situacion_laboral === "monotributista");
  ok("F no duplicate lead_name field", crm.user.lead_name == null);

  // G — income flow regression
  bootCore("?source=seo_ia");
  global.window.CZState = { step: 0, miplan_started: true, temporal: {} };
  setProfileForm({
    nombre: "Ana",
    email: "ana@example.com",
    ingreso: "55000",
    laboral: "desempleado",
  });
  next();
  ok("G income required flag", global.window.CZState.financial_income_complete === true);
  ok("G income source user_input", global.window.CZState.income_source === "user_input");
  ok("G declared_ingreso", global.window.CZState.declared_ingreso === 55000);

  // H — calcularMotor smoke
  bootCore("");
  PRE.ingreso = 55000;
  PRE.respuestas = { p1: "A", p2: "A", p3: "A", p4: "A", p5: "A", p6: "A", p7: "A", p8: "A", p9: "A", p10: "A" };
  var diag = calcularMotor();
  ok("H calcularMotor unchanged smoke", !!(diag && diag.fin));

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
