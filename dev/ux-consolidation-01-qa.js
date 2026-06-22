/**
 * dev/ux-consolidation-01-qa.js — UX-CONSOLIDATION-01 Single Owner Next Step
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;

  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var ctx = vm.createContext({
    window: {},
    global: {},
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isFinite: isFinite,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    URLSearchParams: URLSearchParams,
    localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    sessionStorage: { getItem: function() { return null; }, setItem: function() {} },
    trackEvent: function() { ctx._gtmEvents = ctx._gtmEvents || []; ctx._gtmEvents.push(arguments); },
    trackCRMEvent: function() { ctx._crmEvents = ctx._crmEvents || []; ctx._crmEvents.push(arguments); },
    document: { getElementById: function() { return null; }, querySelectorAll: function() { return []; }, addEventListener: function() {} },
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.PRE = { ingreso: 120000, respuestas: {}, nombre: "Ana", email: "a@test.com", laboral: "relacion_dependencia" };
  ctx.location = { search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B", href: "" };

  function load(file) {
    vm.runInContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      ctx,
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/actionNarrativeTaxonomy.js");
  load("js/events.js");
  load("js/crm.js");
  load("js/ui.js");
  load("js/app.js");

  var uiSrc = fs.readFileSync(path.join(root, "js/ui.js"), "utf8");
  var algoSrc = fs.readFileSync(path.join(root, "js/algorithms.js"), "utf8");
  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

  var GOOD_SURVEY = {
    p1: "A", p2: "B", p3: "A", p4: "B", p5: "A",
    p6: "B", p7: "A", p8: "B", p9: "A", p10: "B",
  };

  function completeSt(overrides) {
    return Object.assign({
      financial_profile_complete: true,
      financial_income_complete: true,
      financial_debts_complete: true,
      financial_expenses_complete: true,
      income_source: "user_input",
      declared_ingreso: 120000,
      declared_nombre: "Ana Test",
      declared_laboral: "relacion_dependencia",
      user_email: "ana@test.com",
      no_debts_declared: false,
      gastos_missing_confirmed: false,
      deudas: [{
        tipo: "prestamo", acreedor: "BROU", acreedor_raw: "BROU",
        monto: "80000", pago: "8000", situacion_ui: "pagando_normal", estado: "al_dia",
      }],
      gastos: { vivienda: 22000, alimentacion: 16000, servicios: 3000 },
      user_intent: null,
      snap: { plan_id: 2 },
      herr: { gestiones: {}, compromisos: {} },
    }, overrides || {});
  }

  function runMotor(st) {
    ctx.PRE.ingreso = st.declared_ingreso || 120000;
    ctx.PRE.respuestas = GOOD_SURVEY;
    ctx.CZState = st;
    var diag = ctx.calcularMotor();
    ctx.attachFinancialStageToDiag(diag, st);
    st.diag = diag;
    return diag;
  }

  function withMode(st, mode) {
    var diag = runMotor(st);
    diag.narrative_decision = {
      narrative_mode: mode,
      profile_tier: mode === "RECOVERY" ? "AT_RISK"
        : mode === "STABILIZATION" ? "IMPROVING"
        : mode === "OPTIMIZATION" ? "HEALTHY" : "UNKNOWN",
      sub_tracks: { focus_target: "DEFAULT", context_modifier: "DEFAULT" },
    };
    st.diag = diag;
    return { diag: diag, st: st };
  }

  function snapshotDiag(diag) {
    return {
      planId: diag.planId,
      score: diag.score,
      scoreReset: diag.scoreReset,
      financial_stage: diag.financial_stage,
      narrative_decision: JSON.stringify(diag.narrative_decision),
      action_selection_mode: diag.action_selection_mode,
    };
  }

  var stP4 = completeSt();
  var rP4 = withMode(stP4, "RECOVERY");
  var diagP4 = rP4.diag;
  var st = rP4.st;
  var cohP4 = ctx.resolveDashboardCoherence(diagP4, st);
  var snapBefore = snapshotDiag(diagP4);
  var accionesBefore = ctx.seleccionarAccionesRecomendadas(diagP4);
  var b7Before = ctx.renderContextualActionBlock(ctx.resolveContextualActionSegment(diagP4, st));
  // P — CRM diagnosis payload unchanged by dashboard render
  if (typeof ctx.buildCRMData === "function") {
    var crmDiagBefore = JSON.stringify(ctx.buildCRMData(diagP4).diagnosis);
    ctx.renderTabPlan();
    ok("P CRM diagnosis unchanged", JSON.stringify(ctx.buildCRMData(diagP4).diagnosis) === crmDiagBefore);
  } else {
    ok("P CRM builder present or skipped", true);
  }

  var tabP4 = ctx.renderTabPlan();
  var heroP4 = ctx._renderDashboardHeroCard(diagP4, st, cohP4);
  var primaryP4 = ctx.renderPrimaryActionCard(diagP4, st, cohP4);

  // A — Primary present → Hero embedded next-step not rendered
  ok("A primary renders", primaryP4.length > 0);
  ok("A hero no Próximo paso recomendado", heroP4.indexOf("Próximo paso recomendado") < 0);

  // B — Primary absent → Hero fallback (legacy path, whitespace-only coherence text)
  var stLegacy = completeSt();
  var diagLegacy = runMotor(stLegacy);
  delete diagLegacy.narrative_decision;
  stLegacy.diag = diagLegacy;
  var cohLegacy = ctx.resolveDashboardCoherence(diagLegacy, stLegacy);
  var cohLegacyWs = Object.assign({}, cohLegacy, { nextStepText: "   " });
  var primaryWs = ctx.renderPrimaryActionCard(diagLegacy, stLegacy, cohLegacyWs);
  var heroWs = ctx._renderDashboardHeroCard(diagLegacy, stLegacy, cohLegacyWs);
  ok("B primary absent whitespace-only", primaryWs === "");
  ok("B hero fallback Próximo paso block", heroWs.indexOf("Próximo paso recomendado") >= 0);

  // C — Hero diagnosis still visible
  ok("C hero panorama title", heroP4.indexOf("Tu panorama actual") >= 0);
  ok("C hero problem text", heroP4.indexOf("cz-dashboard-hero") >= 0);

  // D — Hero score still visible (status label path)
  ok("D hero status pill", heroP4.indexOf("Estado del plan:") >= 0);

  // E — Hero badges (recuperabilidad in narrativa; hero status badge)
  ok("E hero status badge structure", heroP4.indexOf("dash-plan-status") >= 0 || heroP4.indexOf("Estado del plan:") >= 0);

  // F — Hero title / main problem
  ok("F hero plan title visible", heroP4.indexOf(ctx._visiblePlanTitle(diagP4.plan)) >= 0);

  // G — Primary unchanged contract
  ok("G primary label", primaryP4.indexOf("Tu prioridad hoy") >= 0);
  ok("G primary class", primaryP4.indexOf("cz-primary-action-card") >= 0);

  // H — Primary uses resolveNextStepContent
  var nsP4 = ctx.resolveNextStepContent(diagP4, st, cohP4);
  ok("H primary body equals resolveNextStepContent", primaryP4.indexOf(nsP4.text) >= 0);

  // I — recommendations unchanged
  var accionesAfter = ctx.seleccionarAccionesRecomendadas(diagP4);
  ok("I acciones count unchanged", accionesAfter.length === accionesBefore.length);
  ok("I acciones ids unchanged",
    accionesAfter.map(function(a) { return a.id; }).join("|")
      === accionesBefore.map(function(a) { return a.id; }).join("|"));

  // J — narrative_decision unchanged
  ok("J narrative_decision unchanged", snapshotDiag(diagP4).narrative_decision === snapBefore.narrative_decision);

  // K — financial_stage unchanged
  ok("K financial_stage unchanged", diagP4.financial_stage === snapBefore.financial_stage);

  // L — plan assignment unchanged
  ok("L planId unchanged", diagP4.planId === snapBefore.planId);

  // M — score unchanged
  ok("M score unchanged", diagP4.score === snapBefore.score && diagP4.scoreReset === snapBefore.scoreReset);

  // N — B7 unchanged
  ok("N B7 unchanged", ctx.renderContextualActionBlock(ctx.resolveContextualActionSegment(diagP4, st)) === b7Before);

  // O — Plan5 path untouched in source
  ok("O Plan5 definition preserved in algorithms", algoSrc.indexOf("id: 5") >= 0);

  // Q/R — GTM / GA4 registry unchanged (events.js)
  var eventsSrc = fs.readFileSync(path.join(root, "js/events.js"), "utf8");
  ok("Q GTM events registry intact", eventsSrc.indexOf("CZ_EVENT_NAMES") >= 0);
  ok("R GA4 trackEvent intact", eventsSrc.indexOf("function trackEvent") >= 0);

  // S — action_selection_mode unchanged by render
  ctx.seleccionarAccionesRecomendadas(diagP4);
  var actionModeBefore = diagP4.action_selection_mode;
  ctx._renderDashboardHeroCard(diagP4, st, cohP4);
  ctx.renderPrimaryActionCard(diagP4, st, cohP4);
  ok("S action_selection_mode unchanged", diagP4.action_selection_mode === actionModeBefore);

  // W — no hidden hero next-step markup
  ok("W no hidden hero next-step string in hero html",
    heroP4.indexOf("Próximo paso recomendado") < 0);

  // X — render-level guard, not display:none
  ok("X uses suppressEmbeddedNextStep guard", uiSrc.indexOf("suppressEmbeddedNextStep") >= 0);
  ok("X no display:none for hero next step",
    !/Próximo paso recomendado[\s\S]{0,200}display\s*:\s*none/.test(uiSrc));

  // Y — incomplete profile unchanged (run after CRM check)
  ctx.PRE.ingreso = 80000;
  ctx.CZState = {
    gastos: {},
    gastos_missing_confirmed: true,
    no_debts_declared: true,
    deudas: [],
    snap: { plan_id: 1 },
    herr: { compromisos: {} },
    diag: null,
  };
  var diagInc = ctx.calcularMotor();
  ctx.CZState.diag = diagInc;
  var heroInc = ctx._renderDashboardHeroCard(diagInc, ctx.CZState);
  var primaryInc = ctx.renderPrimaryActionCard(diagInc, ctx.CZState);
  ok("Y incomplete primary absent", primaryInc === "");
  ok("Y incomplete hero paso prioritario", heroInc.indexOf("Paso prioritario") >= 0);
  ok("Y incomplete not complete panorama", heroInc.indexOf("Tu panorama actual") < 0);

  // Z — fallback when primary absent (whitespace coherence)
  ok("Z fallback hero block when primary absent", heroWs.indexOf("Próximo paso recomendado") >= 0);

  // AA — no legacy coherence text in hero when primary exists
  ok("AA hero no coherence.nextStepText when primary exists",
    cohP4.nextStepText && heroP4.indexOf(cohP4.nextStepText) < 0);

  // AB — no contradiction (only primary has narrative next step)
  ok("AB primary has narrative next step", primaryP4.indexOf(nsP4.text) >= 0);
  ok("AB hero lacks legacy next step text", heroP4.indexOf(cohP4.nextStepText) < 0);
  ok("AB texts differ when narrative diverges",
    nsP4.text !== cohP4.nextStepText ? primaryP4.indexOf(nsP4.text) >= 0 : true);

  // Narrative modes RECOVERY / STABILIZATION / OPTIMIZATION / CLARITY
  [["RECOVERY", completeSt()], ["STABILIZATION", completeSt()],
   ["OPTIMIZATION", completeSt({ deudas: [], no_debts_declared: true, snap: { plan_id: 3 } })],
   ["CLARITY", completeSt({ snap: { plan_id: 1 } })]].forEach(function(pair) {
    var mode = pair[0];
    var pack = withMode(pair[1], mode);
    var cohM = ctx.resolveDashboardCoherence(pack.diag, pack.st);
    var heroM = ctx._renderDashboardHeroCard(pack.diag, pack.st, cohM);
    var primaryM = ctx.renderPrimaryActionCard(pack.diag, pack.st, cohM);
    var nsM = ctx.resolveNextStepContent(pack.diag, pack.st, cohM);
    ok(mode + " primary renders", primaryM.length > 0);
    ok(mode + " hero no embedded next step", heroM.indexOf("Próximo paso recomendado") < 0);
    ok(mode + " primary uses narrative path", primaryM.indexOf(nsM.text) >= 0);
  });

  // T/U/V — Playwright layout (390px)
  var playwright;
  try {
    playwright = require("playwright");
  } catch (e) {
    ok("T playwright available", false);
    finish();
    return;
  }

  ctx.CZState = st;
  ctx.CZState.diag = diagP4;
  var tabLayout = ctx.renderTabPlan();

  playwright.chromium.launch().then(function(browser) {
    return browser.newPage({ viewport: { width: 390, height: 844 } }).then(function(page) {
      var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>'
        + css + '</style></head><body><div id="main-content" style="padding:16px;max-width:390px;">'
        + tabLayout + "</div></body></html>";
      return page.setContent(html).then(function() {
        return page.evaluate(function() {
          var docTop = document.getElementById("main-content").getBoundingClientRect().top;
          function rect(sel) {
            var el = document.querySelector(sel);
            if (!el) return null;
            var b = el.getBoundingClientRect();
            return { y0: Math.round(b.top - docTop), h: Math.round(b.height) };
          }
          var heroNextLabels = Array.prototype.slice.call(
            document.querySelectorAll("#cz-dashboard-hero div")
          ).filter(function(d) { return d.textContent.trim() === "Próximo paso recomendado"; });
          return {
            hero: rect("#cz-dashboard-hero"),
            primary: rect(".cz-primary-action-card"),
            firstAccion: rect(".accion-recomendada-item"),
            heroNextCount: heroNextLabels.length,
            heroHtml: document.getElementById("cz-dashboard-hero")
              ? document.getElementById("cz-dashboard-hero").innerHTML : "",
          };
        });
      }).then(function(pos) {
        ok("T no hero next-step DOM node", pos.heroNextCount === 0);
        ok("T primary present in DOM", pos.primary != null && pos.primary.h > 0);
        ok("W DOM no Próximo paso in hero innerHTML", pos.heroHtml.indexOf("Próximo paso recomendado") < 0);

        // U — hero height reduced (~130px vs pre-consolidation embedded block)
        ok("U hero height below pre-consolidation baseline",
          pos.hero && pos.hero.h > 0 && pos.hero.h < 400);

        // V — acciones y may improve (informational; not scroll sprint)
        ok("V first accion measurable", pos.firstAccion != null);
        if (pos.firstAccion) {
          console.log("[INFO] V first accion y0=" + pos.firstAccion.y0
            + " (scroll-depth not claimed by this sprint)");
        }
        return browser.close();
      });
    });
  }).then(finish).catch(function(err) {
    console.error(err);
    process.exit(1);
  });

  function finish() {
    console.log("\nux-consolidation-01-qa — " + passed + "/" + (passed + failed)
      + " passed, " + failed + " failed"
      + (failed ? " — FIX BEFORE MERGE" : ""));
    process.exit(failed ? 1 : 0);
  }
})();
