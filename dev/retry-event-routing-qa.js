/**
 * dev/retry-event-routing-qa.js — GTM/CRM channel routing QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var root = path.join(__dirname, "..");

  global.window = global;
  global.window.dataLayer = [];
  global.window.location = { search: "" };
  global.window.CZIdentity = { anonymous_id: "anon", session_id: "sess" };
  global.window.CZState = { step: 3 };
  global.enviarCRM = function(name, p) { global._lastCRM = { n: name, p: p }; };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/events.js");
  load("js/analytics.js");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  ok("registry shown CRM only",
    CZ_CRM_ONLY_EVENTS.indexOf("retry_cta_shown") >= 0
    && CZ_GTM_EVENTS.indexOf("retry_cta_shown") < 0);
  ok("registry clicked GTM not CRM-only",
    CZ_GTM_EVENTS.indexOf("retry_cta_clicked") >= 0
    && CZ_CRM_ONLY_EVENTS.indexOf("retry_cta_clicked") < 0);
  ok("source in safe fields", CZ_GTM_SAFE_FIELDS.indexOf("source") >= 0);

  global.window.dataLayer = [];
  global._lastCRM = null;
  trackEvent("retry_cta_shown", { state: "unlocked", plan_id: 2, score: 10 });
  trackCRMEvent("retry_cta_shown", { state: "unlocked", plan_id: 2, snap_plan_id: 4 });
  ok("A shown GTM blocked", global.window.dataLayer.length === 0);
  ok("A shown CRM fires", global._lastCRM && global._lastCRM.n === "retry_cta_shown");

  global.window.dataLayer = [];
  global._lastCRM = null;
  trackEvent("retry_cta_clicked", {
    source: "miplan_tab",
    state: "unlocked",
    plan_id: 2,
    snap_plan_id: 4,
    score: 10,
  });
  trackCRMEvent("retry_cta_clicked", {
    state: "unlocked",
    plan_id: 2,
    snap_plan_id: 4,
  });
  ok("B clicked GTM fires", global.window.dataLayer.length === 1);
  ok("B clicked CRM fires", global._lastCRM && global._lastCRM.n === "retry_cta_clicked");

  var gtm = global.window.dataLayer[0];
  ok("C GTM payload source", gtm.source === "miplan_tab");
  ok("C GTM no plan_id", gtm.plan_id === undefined);
  ok("C GTM no snap_plan_id", gtm.snap_plan_id === undefined);
  ok("C GTM no score", gtm.score === undefined);
  ok("C GTM no state", gtm.state === undefined);

  var stripped = safeGTMPayload("retry_cta_clicked", {
    source: "miplan_tab",
    plan_id: 2,
    snap_plan_id: 4,
    score: 10,
    flujoLibre: 5000,
    confidence_level: "low",
  });
  ok("D strips plan_id", stripped.plan_id === undefined);
  ok("D strips snap_plan_id", stripped.snap_plan_id === undefined);
  ok("D strips score", stripped.score === undefined);
  ok("D strips flujoLibre", stripped.flujoLibre === undefined);
  ok("D keeps source", stripped.source === "miplan_tab");

  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})();
