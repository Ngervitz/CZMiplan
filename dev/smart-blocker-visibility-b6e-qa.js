/**
 * dev/smart-blocker-visibility-b6e-qa.js — Sprint B6e smart blocker visibility QA (A-I)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var cp = require("child_process");
  var root = path.join(__dirname, "..");

  function boot(search) {
    global.window = global;
    global.window.location = { search: search || "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };
    global.document = { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} };
    global.trackEvent = function() {};
    global.trackCRMEvent = function() {};
    global.enviarCRM = function() {};
    global.localStorage = { getItem: function() { return null; }, setItem: function() {} };
    global.guardarLocal = function() {};
    ["config.js", "creditors.js", "survey.js", "algorithms.js", "events.js", "crm.js", "ui.js", "app.js"].forEach(function(f) {
      vm.runInThisContext(
        fs.readFileSync(path.join(root, "js", f), "utf8").replace(/\bconst /g, "var "),
        { filename: path.join(root, "js", f) }
      );
    });
  }

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  function zoneIndex(html, zone) {
    return html.indexOf("dash-zone-" + zone);
  }

  function tabFor(st, ingreso, search) {
    PRE.ingreso = ingreso;
    window.CZState = st;
    window.CZState.diag = calcularMotor();
    return renderTabPlan();
  }

  boot();

  // A — healthy_organized + no real blockers → hidden
  var tabA = tabFor({
    step: 3,
    gastos: { vivienda: 12000, alimentacion: 10000, servicios: 5000, transporte: 5000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "tarjeta", acreedor: "VISA Uruguay", monto: "17000", pago: "1400", situacion_ui: "pagando_normal", debt_confidence: "high" }],
    snap: { plan_id: 2 },
    temporal: {},
    diag: null,
  }, 65000, "?p1=A&p2=B&p3=A&p4=B&p5=D&p6=B&p7=B&p8=C&p9=B&p10=B");
  var cohA = resolveDashboardCoherence(window.CZState.diag, window.CZState);
  ok("A healthy_organized tier", cohA.profileTier === "healthy_organized");
  ok("A no real blockers", !_hasRealBlockers(window.CZState.diag));
  ok("A blockers content hidden", tabA.indexOf("Lo que frena tu perfil hoy") < 0);
  ok("A neutral copy absent", tabA.indexOf("no se detectan factores críticos") < 0);
  ok("A Relación deuda/ingreso visible", tabA.indexOf("Relación deuda / ingreso") >= 0);

  // B — healthy_organized + real blockers → visible
  boot();
  var stB = {
    step: 3,
    gastos: { vivienda: 10000, alimentacion: 8000, servicios: 4000, transporte: 3000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "120000", pago: "6000", situacion_ui: "pagando_normal", debt_confidence: "high" }],
    snap: { plan_id: 2 },
    temporal: {},
    diag: null,
  };
  var tabB = tabFor(stB, 60000, "?p1=A&p2=A&p3=A&p4=A&p5=B&p6=B&p7=A&p8=A&p9=A&p10=B");
  var cohB = resolveDashboardCoherence(window.CZState.diag, window.CZState);
  ok("B healthy_organized tier", cohB.profileTier === "healthy_organized");
  ok("B has real blockers", _hasRealBlockers(window.CZState.diag));
  ok("B frenando zone visible", zoneIndex(tabB, "frenando") >= 0);
  ok("B blocker content rendered", tabB.indexOf("Lo que frena tu perfil hoy") >= 0);

  // C — standard + real blockers
  boot();
  var tabC = tabFor({
    step: 3,
    gastos: { vivienda: 8000, alimentacion: 7000, servicios: 3000, transporte: 2000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "80000", pago: "18000", situacion_ui: "pagando_normal", debt_confidence: "high" }],
    snap: { plan_id: 2 },
    temporal: {},
    diag: null,
  }, 50000, "?p1=B&p2=B&p3=B&p4=B&p5=B&p6=B&p7=B&p8=B&p9=B&p10=B");
  var cohC = resolveDashboardCoherence(window.CZState.diag, window.CZState);
  ok("C standard tier", cohC.profileTier === "standard");
  ok("C blockers visible", zoneIndex(tabC, "frenando") >= 0);
  ok("C ratio blocker copy", tabC.indexOf("Carga de pagos") >= 0);

  // D — critical profile
  boot();
  var tabD = tabFor({
    step: 3,
    gastos: { vivienda: 10000, alimentacion: 8000, servicios: 4000, transporte: 3000 },
    gastos_missing_confirmed: false,
    deudas: [{ tipo: "financiera", acreedor: "Pronto", monto: "120000", pago: "0", situacion_ui: "mora_reclamo", debt_confidence: "high" }],
    snap: { plan_id: 2 },
    temporal: {},
    diag: null,
  }, 30000, "?p1=C&p2=C&p3=C&p4=C&p5=D&p6=D&p7=C&p8=C&p9=C&p10=C");
  var cohD = resolveDashboardCoherence(window.CZState.diag, window.CZState);
  ok("D critical tier", cohD.profileTier === "critical");
  ok("D blockers visible", zoneIndex(tabD, "frenando") >= 0);
  ok("D critical copy", tabD.indexOf("estabilización crítica") >= 0);

  // E — incomplete profile
  boot();
  var tabE = tabFor({
    step: 3,
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    temporal: {},
    diag: null,
  }, 50000, "?p1=B&p2=B&p3=B&p4=B&p5=B&p6=B&p7=B&p8=B&p9=B&p10=B");
  ok("E incomplete not healthy_organized", resolveDashboardCoherence(window.CZState.diag, window.CZState).profileTier !== "healthy_organized");
  ok("E frenando visible", zoneIndex(tabE, "frenando") >= 0);
  ok("E pending copy preserved", tabE.indexOf("Estrategia pendiente") >= 0);

  // F — resolveDashboardCoherence unchanged (signature + healthy branch intact)
  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  ok("F resolveDashboardCoherence function present", uiSrc.indexOf("function resolveDashboardCoherence(diag, st)") >= 0);
  ok("F healthy_organized branch intact", uiSrc.indexOf('profileTier === "healthy_organized"') >= 0
    && uiSrc.indexOf("optimizar_deuda_cara") >= 0);
  ok("F no changes inside resolver for blockers", uiSrc.indexOf("_hasRealBlockers") < uiSrc.indexOf("function resolveDashboardCoherence")
    || uiSrc.slice(uiSrc.indexOf("function resolveDashboardCoherence"), uiSrc.indexOf("function _resolveDashboardNextStepText")).indexOf("_hasRealBlockers") < 0);

  console.log("\nSmart blocker visibility B6e QA: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) process.exit(1);

  function runSuite(label, file, pattern) {
    var r = cp.spawnSync(process.execPath, [path.join(root, file)], { encoding: "utf8", cwd: root });
    var out = (r.stdout || "") + (r.stderr || "");
    var pass = r.status === 0 && (!pattern || out.indexOf(pattern) >= 0);
    console.log((pass ? "[PASS]" : "[FAIL]") + " " + label);
    if (!pass) {
      console.log(out.slice(-600));
      process.exit(1);
    }
  }

  runSuite("G SyntheticMotorQA 31/31", "dev/synthetic-motor-test.js", "31/31 PASS");
  runSuite("H dashboard-coherence-b6b-qa 24/24", "dev/dashboard-coherence-b6b-qa.js", "24/24 PASS");
  runSuite("I hero-card-qa", "dev/hero-card-qa.js", "30/30 PASS");
  runSuite("I edit-gastos-b2b-qa", "dev/edit-gastos-b2b-qa.js", "PASS");

  console.log("\nAll B6e checks passed.");
})();
