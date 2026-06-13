/**
 * dev/profile-composition-b6d-qa.js — Sprint B6d profile composition alignment QA
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

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");

  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

  PRE.ingreso = 75000;
  window.CZState = {
    step: 3,
    tab: "plan",
    gastos: { alquiler: 18000, alimentacion: 9000, servicios: 2000, transporte: 2000 },
    gastos_missing_confirmed: false,
    deudas: [{
      tipo: "prestamo",
      acreedor: "BROU",
      monto: "100000",
      pago: "7000",
      situacion_ui: "pagando_normal",
      debt_confidence: "high",
    }],
    snap: { plan_id: 2 },
    diag: null,
  };
  var diag = calcularMotor();
  window.CZState.diag = diag;
  var tab = renderTabPlan();

  function composicionSlice(html) {
    var start = html.indexOf("profile-composition-section");
    if (start < 0) return "";
    var end = html.indexOf("Revision sugerida", start);
    return end > start ? html.slice(start, end) : html.slice(start, start + 2500);
  }

  var slice = composicionSlice(tab);

  ok("A composicion section present", tab.indexOf("Composicion de tu perfil") >= 0);
  ok("A profile-composition-grid", slice.indexOf("profile-composition-grid") >= 0);
  ok("A two composition cards", (slice.match(/class="profile-composition-card"/g) || []).length === 2);
  ok("A situacion financiera card", slice.indexOf("Situacion financiera") >= 0);
  ok("A perfil conductual card", slice.indexOf("Perfil conductual") >= 0);
  ok("B grid uses stretch alignment", css.indexOf("align-items:stretch") >= 0 && css.indexOf(".profile-composition-grid") >= 0);
  ok("B cards use flex column", css.indexOf(".profile-composition-card{") >= 0 && css.indexOf("flex-direction:column") >= 0);
  ok("C title/desc/body classes", slice.indexOf("profile-composition-card__title") >= 0
    && slice.indexOf("profile-composition-card__desc") >= 0
    && slice.indexOf("profile-composition-card__body") >= 0);
  ok("C score label class", slice.indexOf("profile-composition-score") >= 0);
  ok("D mobile single column", css.indexOf(".profile-composition-grid{grid-template-columns:1fr") >= 0);
  ok("E no broken double-close grid bug", slice.indexOf('</div></div><div style="text-align:center') < 0);
  ok("F content preserved financiera desc", slice.indexOf("gastos y deudas") >= 0);
  ok("F content preserved conductual desc", slice.indexOf("analisis conductual") >= 0 || slice.indexOf("sin datos adicionales") >= 0);

  // Zero-payment clarification profile
  window.CZState.deudas[0].pago = "0";
  window.CZState.diag = calcularMotor();
  var tabZero = renderTabPlan();
  var sliceZero = composicionSlice(tabZero);
  ok("G clarification in extra block", sliceZero.indexOf("profile-composition-card__extra") >= 0);
  ok("G clarification text preserved", sliceZero.indexOf("sin pagos mensuales informados") >= 0);
  ok("G still two cards in grid", (sliceZero.match(/class="profile-composition-card"/g) || []).length === 2);

  console.log("\nProfile composition B6d QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);

  var cp = require("child_process");
  var coh = cp.spawnSync(process.execPath, [path.join(root, "dev/dashboard-coherence-b6b-qa.js")], { encoding: "utf8", cwd: root });
  var cohPass = coh.status === 0;
  console.log((cohPass ? "[PASS]" : "[FAIL]") + " dashboard-coherence-b6b-qa");
  if (!cohPass) process.exit(1);

  var syn = cp.spawnSync(process.execPath, [path.join(root, "dev/synthetic-motor-test.js")], { encoding: "utf8", cwd: root });
  var synPass = syn.status === 0 && ((syn.stdout || "") + (syn.stderr || "")).indexOf("31/31 PASS") >= 0;
  console.log((synPass ? "[PASS]" : "[FAIL]") + " SyntheticMotorQA 31/31");
  process.exit(synPass ? 0 : 1);
})();
