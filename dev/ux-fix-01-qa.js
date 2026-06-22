/**
 * dev/ux-fix-01-qa.js — UX-FIX-01 Primary Action Card flex-order correction
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

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  function boot() {
    global.window = global;
    global.PRE = {
      ingreso: 120000,
      respuestas: {},
      nombre: "Ana",
      email: "a@test.com",
      laboral: "relacion_dependencia",
    };
    global.window.location = {
      search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
      href: "",
    };
    global.document = {
      getElementById: function() { return null; },
      querySelectorAll: function() { return []; },
      addEventListener: function() {},
    };
    global.trackEvent = function() {};
    global.trackCRMEvent = function() {};
    global.enviarCRM = function() {};
    global.localStorage = { getItem: function() { return null; }, setItem: function() {} };
    global.sessionStorage = { getItem: function() { return null; }, setItem: function() {} };
    load("js/config.js");
    load("js/creditors.js");
    load("js/survey.js");
    load("js/algorithms.js");
    load("js/events.js");
    load("js/crm.js");
    load("js/ui.js");
  }

  var css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");

  // A — primary card direct-child order rule
  ok("A primary card order:2 rule",
    /\.dash-hierarchy\s*>\s*\.cz-primary-action-card\s*\{[^}]*order\s*:\s*2\s*;?[^}]*\}/.test(css));

  // B — gap spacer direct-child order rule
  ok("B gap spacer order:2 rule",
    /\.dash-hierarchy\s*>\s*\.dash-zone-gap\s*\{[^}]*order\s*:\s*2\s*;?[^}]*\}/.test(css));

  // C — hero zone order unchanged
  ok("C hero zone order:1 preserved", /\.dash-zone-hero\s*\{\s*order\s*:\s*1\s*;?\s*\}/.test(css));

  // D — diagnostico zone order unchanged
  ok("D diagnostico zone order:2 preserved",
    /\.dash-zone-diagnostico\s*\{\s*order\s*:\s*2\s*;?\s*\}/.test(css));

  // E — child combinator (not descendant) for primary
  ok("E primary uses direct child combinator",
    css.indexOf(".dash-hierarchy > .cz-primary-action-card") >= 0);

  // F — child combinator for gap
  ok("F gap uses direct child combinator",
    css.indexOf(".dash-hierarchy > .dash-zone-gap") >= 0);

  boot();

  var P4_STATE = {
    id: "P4",
    ingreso: 120000,
    search: "?p1=A&p2=B&p3=A&p4=B&p5=A&p6=B&p7=A&p8=B&p9=A&p10=B",
    state: {
      financial_profile_complete: true,
      financial_income_complete: true,
      financial_debts_complete: true,
      financial_expenses_complete: true,
      income_source: "user_input",
      declared_ingreso: 120000,
      declared_nombre: "Ana",
      declared_laboral: "relacion_dependencia",
      user_email: "ana@test.com",
      gastos_missing_confirmed: false,
      no_debts_declared: false,
      gastos: { vivienda: 22000, alimentacion: 16000, servicios: 3000 },
      deudas: [{
        tipo: "prestamo",
        acreedor: "BROU",
        acreedor_raw: "BROU",
        monto: "80000",
        pago: "8000",
        situacion_ui: "pagando_normal",
        estado: "al_dia",
      }],
      snap: { plan_id: 2 },
      herr: { gestiones: {}, compromisos: {} },
      diag: null,
    },
  };

  PRE.ingreso = P4_STATE.ingreso;
  PRE.respuestas = {
    p1: "A", p2: "B", p3: "A", p4: "B", p5: "A",
    p6: "B", p7: "A", p8: "B", p9: "A", p10: "B",
  };
  window.CZState = P4_STATE.state;
  var diag = calcularMotor();
  window.CZState.diag = diag;
  var tab = renderTabPlan();

  // G — DOM source order unchanged (hero before primary in markup)
  var heroIdx = tab.indexOf('id="cz-dashboard-hero"');
  var primaryIdx = tab.indexOf("cz-primary-action-card");
  var diagIdx = tab.indexOf("dash-zone-diagnostico");
  ok("G DOM hero before primary", heroIdx >= 0 && primaryIdx > heroIdx);
  ok("G DOM primary before diagnostico", primaryIdx < diagIdx);

  // H — primary still renders for complete P4
  ok("H primary card in tab", primaryIdx >= 0);
  ok("H gap spacer in tab", tab.indexOf('class="dash-zone-gap"') >= 0);

  // I — Playwright flex visual order (hero → primary → diagnostico)
  var playwright;
  try {
    playwright = require("playwright");
  } catch (e) {
    ok("I playwright available", false);
    console.log("\nux-fix-01-qa — " + passed + "/" + (passed + failed)
      + " passed, " + failed + " failed"
      + (failed ? " — FIX BEFORE MERGE" : ""));
    process.exit(failed ? 1 : 0);
    return;
  }

  playwright.chromium.launch().then(function(browser) {
    return browser.newPage({ viewport: { width: 390, height: 844 } }).then(function(page) {
      var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/>'
        + '<style>' + css + "</style></head><body>"
        + '<div id="main-content" style="padding:16px;max-width:390px;box-sizing:border-box;">'
        + tab + "</div></body></html>";
      return page.setContent(html).then(function() {
        return page.evaluate(function() {
          var docTop = document.getElementById("main-content").getBoundingClientRect().top;
          function y0(sel) {
            var el = document.querySelector(sel);
            if (!el) return null;
            return Math.round(el.getBoundingClientRect().top - docTop);
          }
          return {
            hero: y0(".dash-zone-hero"),
            primary: y0(".cz-primary-action-card"),
            diagnostico: y0(".dash-zone-diagnostico"),
            gaps: Array.prototype.map.call(
              document.querySelectorAll(".dash-hierarchy > .dash-zone-gap"),
              function(el) {
                return Math.round(el.getBoundingClientRect().top - docTop);
              }
            ),
          };
        });
      }).then(function(pos) {
        ok("I hero y before primary", pos.hero != null && pos.primary != null && pos.hero < pos.primary);
        ok("I primary y before diagnostico",
          pos.primary != null && pos.diagnostico != null && pos.primary < pos.diagnostico);
        ok("I gap spacers not above hero",
          pos.gaps.length > 0 && pos.gaps.every(function(y) { return y > pos.hero; }));
        ok("I hero is first flex block",
          pos.hero != null && pos.hero <= (pos.gaps[0] || pos.primary || 9999));
        return browser.close();
      });
    });
  }).then(function() {
    console.log("\nux-fix-01-qa — " + passed + "/" + (passed + failed)
      + " passed, " + failed + " failed"
      + (failed ? " — FIX BEFORE MERGE" : ""));
    process.exit(failed ? 1 : 0);
  }).catch(function(err) {
    console.error(err);
    process.exit(1);
  });
})();
