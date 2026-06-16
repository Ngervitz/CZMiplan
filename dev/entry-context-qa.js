/**
 * dev/entry-context-qa.js — FIX-01A Entry Context Layer QA
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

  function includesAll(arr, expected) {
    if (!arr || !expected) return false;
    for (var i = 0; i < expected.length; i++) {
      if (arr.indexOf(expected[i]) < 0) return false;
    }
    return true;
  }

  function boot(search) {
    search = search || "";
    var normalized = search.indexOf("?") === 0 ? search : (search ? "?" + search : "");
    var src = fs.readFileSync(path.join(root, "js/config.js"), "utf8")
      .replace(/\bconst /g, "var ");
    var sandbox = {
      window: null,
      document: {
        getElementById: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
      },
      console: console,
      parseFloat: parseFloat,
      isFinite: isFinite,
      Object: Object,
      Array: Array,
      String: String,
      URLSearchParams: URLSearchParams,
      Math: Math,
      JSON: JSON,
    };
    sandbox.window = sandbox;
    sandbox.location = {
      search: normalized,
      href: "http://localhost/" + (normalized ? normalized.replace(/^\?/, "?") : ""),
    };
    vm.runInNewContext(src, sandbox, { filename: path.join(root, "js/config.js") });
    return sandbox;
  }

  function ctxFromSearch(search) {
    var sandbox = boot(search);
    return {
      resolve: sandbox.resolveEntryContext,
      global: sandbox.CZ_ENTRY_CONTEXT,
      windowCtx: sandbox.window.CZ_ENTRY_CONTEXT,
    };
  }

  function assertScenario(id, search, expected) {
    var pack = ctxFromSearch(search);
    var ctx = pack.resolve();

    ok(id + " entryContext", ctx.entryContext === expected.entryContext);
    ok(id + " trafficSource", ctx.trafficSource === expected.trafficSource);
    ok(id + " hasRejectionContext", ctx.hasRejectionContext === expected.hasRejectionContext);
    ok(id + " evidenceStrength", ctx.evidenceStrength === expected.evidenceStrength);

    if (expected.reasonsExact != null) {
      ok(id + " reasons exact", JSON.stringify(ctx.reasons) === JSON.stringify(expected.reasonsExact));
    } else if (expected.reasonsIncludes) {
      ok(id + " reasons includes", includesAll(ctx.reasons, expected.reasonsIncludes));
    }

    if (expected.mustNotBe) {
      ok(id + " must not be " + expected.mustNotBe, ctx.entryContext !== expected.mustNotBe);
    }
  }

  // T1 — CDV full preload
  assertScenario("T1", "?laboral=relacion_dependencia&ingreso=45000&p1=A&p2=B", {
    entryContext: "cdv_rejected",
    trafficSource: "direct",
    hasRejectionContext: true,
    evidenceStrength: "strong",
    reasonsIncludes: ["has_url_laboral", "has_url_ingreso", "has_encuesta"],
  });

  // T2 — CDV + Meta paid (trafficSource independence)
  assertScenario("T2", "?laboral=relacion_dependencia&ingreso=45000&p1=A&utm_source=meta", {
    entryContext: "cdv_rejected",
    trafficSource: "paid",
    hasRejectionContext: true,
    evidenceStrength: "strong",
    reasonsIncludes: ["has_url_laboral", "has_url_ingreso", "has_encuesta", "has_utm"],
  });
  (function() {
    var pack = ctxFromSearch("?laboral=relacion_dependencia&ingreso=45000&p1=A&utm_source=meta");
    var ctx = pack.resolve();
    ok("T2 independence entryContext cdv_rejected", ctx.entryContext === "cdv_rejected");
    ok("T2 independence trafficSource paid", ctx.trafficSource === "paid");
  })();

  // T3 — SEO organic
  assertScenario("T3", "?source=seo_ia", {
    entryContext: "seo_organic",
    trafficSource: "seo",
    hasRejectionContext: false,
    evidenceStrength: "strong",
    reasonsIncludes: ["has_seo_ia_flag"],
  });

  // T4 — Meta paid, no CDV
  assertScenario("T4", "?utm_source=meta&utm_campaign=rechazados", {
    entryContext: "organic",
    trafficSource: "paid",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    reasonsIncludes: ["has_utm"],
  });

  // T5 — Direct organic
  assertScenario("T5", "", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "weak",
    reasonsExact: [],
  });

  // T6 — CDV partial signal
  assertScenario("T6", "?laboral=monotributista&p1=A", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    reasonsIncludes: ["has_url_laboral", "has_encuesta"],
    mustNotBe: "cdv_rejected",
  });

  // T8 — Empty laboral
  assertScenario("T8", "?laboral=&ingreso=45000&p1=A", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    mustNotBe: "cdv_rejected",
  });

  // T9 — Empty ingreso
  assertScenario("T9", "?laboral=relacion_dependencia&ingreso=&p1=A", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    mustNotBe: "cdv_rejected",
  });

  // T10 — Invalid ingreso
  assertScenario("T10", "?laboral=relacion_dependencia&ingreso=abc&p1=A", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    mustNotBe: "cdv_rejected",
  });

  // T11 — Negative ingreso
  assertScenario("T11", "?laboral=relacion_dependencia&ingreso=-5000&p1=A", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    mustNotBe: "cdv_rejected",
  });

  // T12 — Comma ingreso
  assertScenario("T12", "?laboral=relacion_dependencia&ingreso=45,000&p1=A", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    mustNotBe: "cdv_rejected",
  });

  // T13 — Invalid laboral
  assertScenario("T13", "?laboral=@@@&ingreso=45000&p1=A", {
    entryContext: "organic",
    trafficSource: "direct",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    mustNotBe: "cdv_rejected",
  });

  // T14 — Reserved value must not resolve in v1
  assertScenario("T14", "?source=ecommerce&utm_source=meta", {
    entryContext: "organic",
    trafficSource: "paid",
    hasRejectionContext: false,
    evidenceStrength: "moderate",
    mustNotBe: "ecommerce",
  });

  // T15 — Global exposure
  (function() {
    var pack = ctxFromSearch("?laboral=relacion_dependencia&ingreso=45000&p1=A");
    ok("T15 typeof CZ_ENTRY_CONTEXT object", typeof pack.global === "object");
    ok("T15 entryContext string", typeof pack.global.entryContext === "string");
    ok("T15 hasRejectionContext boolean", typeof pack.global.hasRejectionContext === "boolean");
    ok("T15 window.CZ_ENTRY_CONTEXT object", typeof pack.windowCtx === "object");
    ok("T15 Object.isFrozen", Object.isFrozen(pack.global) === true);
  })();

  // Rejection Copy Gating Helper
  console.log("\n--- Rejection Copy Gating Helper ---");
  (function testRejectionCopyHelper() {
    function load(file, sandbox) {
      var src = fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var ");
      vm.runInNewContext(src, sandbox, { filename: path.join(root, file) });
    }

    function bootUiWithContext(search, ctxOverride) {
      search = search || "";
      var normalized = search.indexOf("?") === 0 ? search : (search ? "?" + search : "");
      var sandbox = {
        window: null,
        document: {
          getElementById: function() { return null; },
          querySelectorAll: function() { return []; },
          addEventListener: function() {},
        },
        console: console,
        parseFloat: parseFloat,
        isFinite: isFinite,
        Object: Object,
        Array: Array,
        String: String,
        URLSearchParams: URLSearchParams,
        Math: Math,
        JSON: JSON,
        trackEvent: function() {},
        trackCRMEvent: function() {},
        enviarCRM: function() {},
        localStorage: { getItem: function() { return null; }, setItem: function() {} },
        sessionStorage: { getItem: function() { return null; }, setItem: function() {} },
      };
      sandbox.window = sandbox;
      sandbox.location = {
        search: normalized,
        href: "http://localhost/" + (normalized ? normalized.replace(/^\?/, "?") : ""),
      };
      load("js/config.js", sandbox);
      if (ctxOverride !== undefined) {
        sandbox.window.CZ_ENTRY_CONTEXT = ctxOverride;
        sandbox.CZ_ENTRY_CONTEXT = ctxOverride;
      }
      load("js/creditors.js", sandbox);
      load("js/survey.js", sandbox);
      load("js/algorithms.js", sandbox);
      load("js/events.js", sandbox);
      load("js/crm.js", sandbox);
      load("js/ui.js", sandbox);
      return sandbox;
    }

    var sbTrue = bootUiWithContext("", { hasRejectionContext: true });
    ok("RC helper true returns REJECTION",
      sbTrue._rejectionCopy("REJECTION", "NEUTRAL") === "REJECTION");

    var sbFalse = bootUiWithContext("", { hasRejectionContext: false });
    ok("RC helper false returns NEUTRAL",
      sbFalse._rejectionCopy("REJECTION", "NEUTRAL") === "NEUTRAL");

    var sbMissing = bootUiWithContext("", null);
    delete sbMissing.window.CZ_ENTRY_CONTEXT;
    delete sbMissing.CZ_ENTRY_CONTEXT;
    ok("RC helper missing context returns NEUTRAL",
      sbMissing._rejectionCopy("REJECTION", "NEUTRAL") === "NEUTRAL");
  })();

  var total = passed + failed;
  console.log("\nentry-context-qa — " + passed + "/" + total
    + (failed ? " (" + failed + " FAIL)" : " PASS"));
  if (failed) process.exit(1);
})();
