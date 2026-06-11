/**
 * dev/score-label-qa.js — Dashboard score label QA (A-J)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.location = { search: "", href: "" };
  global.document = { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} };
  global.trackEvent = function() {};
  global.trackCRMEvent = function() {};

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

  function htmlHasVisibleScore(html) {
    if (!html) return false;
    if (/score-big/.test(html)) return true;
    if (/de 30/.test(html)) return true;
    if (/max 30/.test(html)) return true;
    if (/>\s*\d+\s*<\/div>\s*\n?\s*\+\s*'<div[^>]*>de 30/.test(html)) return true;
    if (/font-size:52px[^>]*>\s*\d+/.test(html)) return true;
    return false;
  }

  // A — score_financiero = 8
  var labelA = _scoreFinancieroLabel(8);
  ok("A critical label", labelA.text === "Situación crítica" && labelA.emoji === "🔴");
  var htmlA = _renderProfileScoreLabelHtml(labelA);
  ok("A no visible numeric", htmlA.indexOf(">8<") < 0 && htmlA.indexOf("/30") < 0 || htmlA.indexOf('title="Score financiero: 8/30"') >= 0);

  // B — score_financiero = 22
  var labelB = _scoreFinancieroLabel(22);
  ok("B recovery label", labelB.text === "En recuperación" && labelB.emoji === "🟡");
  ok("B no visible numeric", _renderProfileScoreLabelHtml(labelB).indexOf(">22<") < 0);

  // C — score_financiero = 28
  var labelC = _scoreFinancieroLabel(28);
  ok("C stable label", labelC.text === "Estable" && labelC.emoji === "🟢");
  ok("C no visible numeric", _renderProfileScoreLabelHtml(labelC).indexOf(">28<") < 0);

  // D — Plan 4
  var planD = resolvePlanStatusLabel({ planId: 4, interpretacion_v2: { severity_level: "bajo" } });
  ok("D plan 4 priority", planD.text === "Prioridad alta" && planD.emoji === "🔴");

  // E — Plan 2
  var planE = resolvePlanStatusLabel({ planId: 2, interpretacion_v2: { severity_level: "bajo" } });
  ok("E plan 2 in process", planE.text === "En proceso" && planE.emoji === "🟡");

  // F — Conservative override
  var planF = resolvePlanStatusLabel({ planId: 2, interpretacion_v2: { severity_level: "alto" } });
  ok("F severity overrides plan", planF.text === "Requiere acción" && planF.emoji === "🟠");

  // G — Null score
  var labelG = _scoreFinancieroLabel(null);
  ok("G insufficient data", labelG.text === "Datos insuficientes para mostrar");
  ok("G no tooltip", labelG.tooltip == null);

  // H — CRM payload unchanged
  PRE.ingreso = 45000;
  window.CZState = {
    deudas: [{ tipo: "prestamo", acreedor: "BROU", monto: "100000", pago: "5000", situacion_ui: "pagando_normal" }],
    gastos: { vivienda: 10000 },
    gastos_missing_confirmed: false,
  };
  var motor = calcularMotor();
  var crm = typeof buildCRMData === "function" ? buildCRMData(motor) : null;
  ok("H CRM score_reset", crm && crm.diagnosis && crm.diagnosis.score_reset != null);
  ok("H CRM score_financiero_raw", crm && crm.diagnosis && crm.diagnosis.score_financiero_raw != null);
  ok("H motor scoreReset internal", motor.scoreReset != null);
  ok("H survey score internal", crm && crm.survey && crm.survey.score != null);

  // I — SyntheticMotorQA run separately (verified in suite)

  // J — Tooltip behavior
  var htmlJ = _renderProfileScoreLabelHtml(_scoreFinancieroLabel(28));
  ok("J tooltip in title only", htmlJ.indexOf('title="Score financiero: 28/30"') >= 0);
  ok("J no visible score text", htmlJ.indexOf("28/30") >= 0 ? htmlJ.indexOf('title="Score financiero: 28/30"') >= 0 && htmlJ.indexOf(">28/30<") < 0 : true);
  ok("J info icon present", htmlJ.indexOf("ⓘ") >= 0);

  // Dashboard render integration — no visible scores in plan tab HTML
  window.CZState.diag = motor;
  window.CZState.snap = { plan_id: motor.planId };
  window.CZState.tab = "plan";
  var tabHtml = renderTabPlan();
  ok("J dashboard no score-big", tabHtml.indexOf("score-big") < 0);
  ok("J dashboard no de 30", tabHtml.indexOf("de 30") < 0);
  ok("J dashboard no max 30", tabHtml.indexOf("max 30") < 0);
  ok("J dashboard has status label", tabHtml.indexOf("En buen camino") >= 0 || tabHtml.indexOf("Requiere acción") >= 0 || tabHtml.indexOf("Prioridad alta") >= 0 || tabHtml.indexOf("En proceso") >= 0);

  // Layout — status pill only in Hero; diagnostico keeps objetivo without duplicated plan header
  var heroZoneEnd = tabHtml.indexOf("dash-zone-diagnostico");
  var heroHtml = heroZoneEnd >= 0 ? tabHtml.slice(0, heroZoneEnd) : tabHtml;
  var diagZoneStart = tabHtml.indexOf("dash-zone-diagnostico");
  var diagHtml = diagZoneStart >= 0 ? tabHtml.slice(diagZoneStart) : "";
  ok("A no plan-title-big in diagnostico", diagHtml.indexOf('class="plan-title-big"') < 0);
  ok("A no plan-desc in diagnostico", diagHtml.indexOf('class="plan-desc"') < 0);
  ok("A status only in hero", heroHtml.indexOf("Estado del plan:") >= 0
    && diagHtml.indexOf("Estado del plan:") < 0);
  ok("A objetivo preserved in diagnostico", diagHtml.indexOf("Que busca este plan") >= 0);
  ok("A no inline status column", tabHtml.indexOf("text-align:right;flex-shrink:0") < 0);
  ok("B status pill subtle in hero", heroHtml.indexOf("border-radius:999px") >= 0
    && heroHtml.indexOf("Estado del plan:") >= 0);
  ok("B no giant emoji in plan pill", !/font-size:20px[^>]*>[\s\S]{0,40}🔴/.test(tabHtml));
  ok("C no numeric score in plan card header", tabHtml.indexOf("score-big") < 0);

  // B4b — Hero no longer shows Situación financiera; composicion unchanged
  ok("B4b hero no Situación financiera label", heroHtml.indexOf("Situación financiera:") < 0);
  ok("B4b composicion Situacion financiera preserved", tabHtml.indexOf("Situacion financiera") >= 0);
  ok("B4b _scoreFinancieroLabel still defined", typeof _scoreFinancieroLabel === "function");
  ok("B4b helper stable label", _scoreFinancieroLabel(28).text === "Estable");

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
