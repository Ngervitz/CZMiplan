/**
 * engine/adapters/product-vm.js
 * Loads product rule source (js/*) into an isolated Node VM.
 * Single source of truth: does NOT fork thresholds/rules into a second copy.
 *
 * Browser stubs exist ONLY inside the sandbox so algorithms/ui/app can load.
 * Callers of runEngine never touch window/document/localStorage.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..", "..");

var PRODUCT_FILES = [
  "js/config.js",
  "js/creditors.js",
  "js/survey.js",
  "js/algorithms.js",
  "js/actionNarrativeTaxonomy.js",
  "js/events.js",
  "js/crm.js",
  "js/ui.js",
  "js/app.js",
];

function createSandbox(opts) {
  opts = opts || {};
  var ctx = vm.createContext({
    // Minimal host globals — not a browser; storage is inert no-ops.
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
    Boolean: Boolean,
    URLSearchParams: URLSearchParams,
    // Inert stubs so product scripts that reference these at load/run time do not throw.
    // Engine input never reads real browser persistence (MC-1).
    localStorage: {
      getItem: function() { return null; },
      setItem: function() {},
      removeItem: function() {},
    },
    sessionStorage: {
      getItem: function() { return null; },
      setItem: function() {},
      removeItem: function() {},
    },
    trackEvent: function() {},
    trackCRMEvent: function() {},
    document: {
      getElementById: function() { return null; },
      querySelectorAll: function() { return []; },
      querySelector: function() { return null; },
      addEventListener: function() {},
      createElement: function() {
        return {
          style: {},
          classList: { add: function() {}, remove: function() {}, contains: function() { return false; } },
          setAttribute: function() {},
          appendChild: function() {},
        };
      },
      body: { appendChild: function() {} },
    },
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  });
  // Product code expects window === globalThis-like
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.location = { search: "", href: "http://engine.local/" };
  ctx._wantDecisionProvenance = !!opts.decision_provenance;
  return ctx;
}

function loadFile(ctx, rel) {
  var abs = path.join(ROOT, rel);
  var src = fs.readFileSync(abs, "utf8").replace(/\bconst /g, "var ");
  vm.runInContext(src, ctx, { filename: abs });
}

function loadProductRules(ctx) {
  for (var i = 0; i < PRODUCT_FILES.length; i++) {
    loadFile(ctx, PRODUCT_FILES[i]);
  }
  if (ctx._wantDecisionProvenance) {
    ctx.CZ_DECISION_PROVENANCE = true;
    if (ctx.window) ctx.window.CZ_DECISION_PROVENANCE = true;
  }
}

function createProductContext(opts) {
  var ctx = createSandbox(opts);
  loadProductRules(ctx);
  return ctx;
}

module.exports = {
  ROOT: ROOT,
  PRODUCT_FILES: PRODUCT_FILES,
  createProductContext: createProductContext,
};
