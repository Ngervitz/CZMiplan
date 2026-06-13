/**
 * dev/debt-form-ux-b6c-qa.js — Sprint B6c debt form save confirmation UX QA (A-I)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
  global.document = { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} };
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};
  global.enviarCRM = function() {};
  global.localStorage = { getItem: function() { return null; }, setItem: function() {} };
  global.sessionStorage = { getItem: function() { return null; }, setItem: function() {} };
  global.showToast = function() {};
  global.guardarLocal = function() {};

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

  function debtBase(o) {
    return Object.assign({
      id: "deuda_qa",
      tipo: "prestamo",
      acreedor: "BROU",
      acreedor_raw: "BROU",
      acreedor_display: "BROU",
      monto: "50000",
      pago: "5000",
      estado: "al_dia",
      situacion_ui: "pagando_normal",
      pago_fuente: "declarado",
      debt_confidence: "high",
      _source: "DECLARED",
      cancelada: false,
    }, o || {});
  }

  boot();

  // A — success message after save
  PRE.ingreso = 80000;
  window.CZState = {
    step: 3,
    tab: "deudas",
    gastos: { vivienda: 20000 },
    deudas: [debtBase()],
    editing_debt_index: null,
    _deuda_save_feedback: { mode: "added", at: Date.now() },
    diag: null,
  };
  window.CZState.diag = calcularMotor();
  var tabSaved = renderTabDeudas();
  ok("A success banner visible", tabSaved.indexOf("deuda-save-success-banner") >= 0);
  ok("A success copy", tabSaved.indexOf("Deuda agregada correctamente") >= 0);

  // B — button saved state
  ok("B Deuda guardada button", tabSaved.indexOf("Deuda guardada ✓") >= 0);

  // C — debt in list with acreedor/monto/pago/situacion
  ok("C acreedor in list", tabSaved.indexOf("BROU") >= 0);
  ok("C monto in list", tabSaved.indexOf("$50.000") >= 0 || tabSaved.indexOf("$50000") >= 0);
  ok("C pago mensual in list", tabSaved.indexOf("por mes") >= 0);
  ok("C situacion badge", tabSaved.indexOf("Al día") >= 0);

  // D — add another visible
  ok("D Agregar otra deuda", tabSaved.indexOf("+ Agregar otra deuda") >= 0);

  // E — add another opens clean form
  window.CZState._deuda_save_feedback = null;
  window.CZState.deudas.push(createEmptyDebtObject());
  window.CZState.editing_debt_index = window.CZState.deudas.length - 1;
  window.CZState._deuda_is_new_add = true;
  var tabNewForm = renderTabDeudas();
  ok("E Guardar deuda on new form", tabNewForm.indexOf("Guardar deuda") >= 0);
  ok("E no saved state while editing", tabNewForm.indexOf("Deuda guardada ✓") < 0);
  ok("E no duplicate save buttons", (tabNewForm.match(/btn-guardar-deuda-edicion/g) || []).length === 1);

  // F — edit flow labels
  window.CZState.deudas = [debtBase()];
  window.CZState.editing_debt_index = 0;
  window.CZState._deuda_is_new_add = false;
  window.CZState._deuda_save_feedback = null;
  var tabEdit = renderTabDeudas();
  ok("F Guardar cambios while editing", tabEdit.indexOf("Guardar cambios") >= 0);
  window.CZState.editing_debt_index = null;
  window.CZState._deuda_save_feedback = { mode: "edited", at: Date.now() };
  var tabEdited = renderTabDeudas();
  ok("F Cambios guardados after edit save", tabEdited.indexOf("Cambios guardados ✓") >= 0);

  // G — no duplicate save buttons when saved
  ok("G single save id when saved", (tabEdited.match(/btn-guardar-deuda-edicion/g) || []).length === 0);

  // Step 2 onboarding flow
  window.CZState.step = 1;
  window.CZState.deudas = [debtBase()];
  window.CZState.editing_debt_index = null;
  window.CZState._deuda_save_feedback = { mode: "added", at: Date.now() };
  var stepDeudas = renderDeudas();
  ok("G step2 continue hint", stepDeudas.indexOf("Continuar análisis") >= 0);

  // H — finalizeDebtEdit still works (calculation path)
  window.CZState.step = 2;
  window.CZState.temporal = window.CZState.temporal || {};
  window.CZState.deudas = [debtBase({ monto: "90000", pago: "5000" })];
  window.CZState.editing_debt_index = 0;
  window.CZState._deuda_edit_snapshot = JSON.parse(JSON.stringify(window.CZState.deudas[0]));
  window.CZState.deudas[0].pago = "9000";
  finalizeDebtEdit(0);
  ok("H finalizeDebtEdit closes edit", window.CZState.editing_debt_index === null);
  ok("H pago persisted", parseFloat(window.CZState.deudas[0].pago) === 9000);
  ok("H feedback set", window.CZState._deuda_save_feedback && window.CZState._deuda_save_feedback.mode === "edited");
  ok("H totalPago updated", calcularFinanciero().totalPago === 9000);

  console.log("\nDebt form UX B6c QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) {
    process.exit(1);
  }

  // I — SyntheticMotorQA (subprocess)
  var cp = require("child_process");
  var syn = cp.spawnSync(process.execPath, [path.join(root, "dev/synthetic-motor-test.js")], {
    encoding: "utf8",
    cwd: root,
  });
  var synOut = (syn.stdout || "") + (syn.stderr || "");
  var synPass = syn.status === 0 && synOut.indexOf("31/31 PASS") >= 0;
  console.log((synPass ? "[PASS]" : "[FAIL]") + " I SyntheticMotorQA 31/31");
  if (!synPass) {
    console.log(synOut.slice(-800));
    process.exit(1);
  }

  console.log("\nAll B6c checks passed.");
  process.exit(0);
})();
