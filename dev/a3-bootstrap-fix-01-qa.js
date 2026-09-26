/**
 * dev/a3-bootstrap-fix-01-qa.js — A3 bootstrap fix QA (no network, no PII).
 * node dev/a3-bootstrap-fix-01-qa.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var root = path.join(__dirname, "..");
var passed = 0;
var failed = 0;

function ok(label, cond) {
  console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
  if (cond) passed++;
  else failed++;
}

function loadSanitize() {
  return require(path.join(root, "server/modules/journey/sanitizeContext.js"));
}

function bootBrowser(opts) {
  opts = opts || {};
  var pathname = opts.pathname || "/";
  var search = opts.search || "";
  if (search && search.charAt(0) !== "?") search = "?" + search;

  var sessionStore = Object.create(null);
  var localStore = Object.create(null);

  var sandbox = {
    console: console,
    parseFloat: parseFloat,
    isFinite: isFinite,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Math: Math,
    JSON: JSON,
    Date: Date,
    URLSearchParams: URLSearchParams,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    fetch: function () {
      return Promise.reject(new Error("fetch disabled in unit qa"));
    },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    getElementById: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    addEventListener: function () {},
    referrer: "",
  };
  sandbox.location = {
    pathname: pathname,
    search: search,
    hash: "",
    href: "https://cz-miplan2.vercel.app" + pathname + search,
  };
  sandbox.history = {
    replaceState: function (_s, _t, url) {
      var u = String(url || "");
      var q = u.indexOf("?");
      var h = u.indexOf("#");
      var pathPart = u;
      if (h >= 0) pathPart = u.slice(0, h);
      if (q >= 0) {
        sandbox.location.pathname = pathPart.slice(0, q) || "/";
        sandbox.location.search = pathPart.slice(q);
      } else {
        sandbox.location.pathname = pathPart || "/";
        sandbox.location.search = "";
      }
      sandbox.location.href = "https://cz-miplan2.vercel.app" + sandbox.location.pathname + sandbox.location.search;
    },
  };
  sandbox.sessionStorage = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(sessionStore, k) ? sessionStore[k] : null;
    },
    setItem: function (k, v) {
      sessionStore[k] = String(v);
    },
    removeItem: function (k) {
      delete sessionStore[k];
    },
  };
  sandbox.localStorage = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null;
    },
    setItem: function (k, v) {
      localStore[k] = String(v);
    },
    removeItem: function (k) {
      delete localStore[k];
    },
  };

  function runFile(rel) {
    var src = fs.readFileSync(path.join(root, rel), "utf8").replace(/\bconst /g, "var ");
    vm.runInNewContext(src, sandbox, { filename: rel });
  }

  runFile("js/config.js");
  runFile("js/consent.js");
  runFile("js/handoffEntry.js");

  sandbox.CZIdentity = { anonymous_id: "11111111-1111-4111-8111-111111111111" };
  sandbox.CZState = {
    declared_ingreso: null,
    declared_nombre: null,
    declared_laboral: null,
    user_email: null,
    financial_income_complete: false,
    financial_profile_complete: false,
    income_source: null,
    temporal: {},
  };
  sandbox.window.CZState = sandbox.CZState;
  sandbox.window.CZIdentity = sandbox.CZIdentity;
  sandbox.window.CZHandoffEntry = sandbox.CZHandoffEntry;
  sandbox.window.PRE = sandbox.PRE;
  sandbox.window.PROFILE_LABORAL_VALUES = sandbox.PROFILE_LABORAL_VALUES;
  sandbox.window.refreshCanonicalEntryFlags = sandbox.refreshCanonicalEntryFlags;
  sandbox.window.loadStoredConsent = sandbox.loadStoredConsent;
  sandbox.window.initConsent = sandbox.initConsent;
  sandbox.window.MIPLAN_UNAUTHORIZED_REDIRECT = sandbox.MIPLAN_UNAUTHORIZED_REDIRECT;

  return { sandbox: sandbox, sessionStore: sessionStore, localStore: localStore };
}

// --- A. Entry A3 without prior consent: no redirect ---
(function () {
  var boot = bootBrowser({ pathname: "/e/opaque-test-code-abc" });
  var redirected = false;
  var loc = boot.sandbox.location;
  Object.defineProperty(loc, "href", {
    configurable: true,
    enumerable: true,
    get: function () {
      return "https://cz-miplan2.vercel.app" + loc.pathname + (loc.search || "");
    },
    set: function (v) {
      if (String(v).indexOf("credizona.com.uy") >= 0) redirected = true;
    },
  });
  boot.sandbox.window.location = loc;
  boot.sandbox.window.CZHandoffEntry = boot.sandbox.CZHandoffEntry;

  var canProceed = boot.sandbox.initConsent();
  ok("A entry authorized without cz_consent", canProceed === true && !redirected);
  ok("A no false consent written", boot.localStore.cz_consent_v1 == null);
})();

// Bare / without A3 still redirects when no consent
(function () {
  var boot = bootBrowser({ pathname: "/" });
  var redirected = false;
  var loc = boot.sandbox.location;
  Object.defineProperty(loc, "href", {
    configurable: true,
    enumerable: true,
    get: function () {
      return "https://cz-miplan2.vercel.app" + loc.pathname + (loc.search || "");
    },
    set: function (v) {
      if (String(v).indexOf("credizona.com.uy") >= 0) redirected = true;
    },
  });
  boot.sandbox.window.location = loc;
  boot.sandbox.window.CZHandoffEntry = boot.sandbox.CZHandoffEntry;
  var canProceed = boot.sandbox.initConsent();
  ok("A virgin bare redirects", canProceed === false && redirected === true);
})();

// --- B/C/D/E apply handoff context (real case shape, masked identity) ---
(function () {
  var boot = bootBrowser({ pathname: "/e/opaque-code" });
  var sb = boot.sandbox;
  var ctx = {
    contract_version: 1,
    context: {
      funnel: "credizona_rejected",
      external_ref_type: "lrw",
      external_ref: "LRW-714-733-355",
    },
    person: {
      nombre: "TestUser",
      email: "test@example.com",
      celular: "099000000",
      fecha_nacimiento: "1970-12-15",
    },
    financial_prefill: {
      ingreso: 42000,
      laboral: "jubilado",
      laboral_source_raw: "JUB",
    },
    survey: {
      selection_rule: "lifetime_ci",
      respuestas: {
        p1: "d",
        p2: "a",
        p3: "c",
        p4: "c",
        p5: "b",
        p6: "d",
        p7: "b",
        p8: "b",
        p9: "d",
        p10: "a",
      },
    },
    provenance: { source_system: "credizona" },
  };

  var applied = sb.CZHandoffEntry.applyHandoffContextToPrefill(ctx);
  ok("B apply returns true", applied === true);
  ok("B p1 uppercase", sb.PRE.respuestas.p1 === "D");
  ok("B p10 uppercase", sb.PRE.respuestas.p10 === "A");
  ok(
    "B all ten present",
    ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"].every(function (k) {
      return sb.PRE.respuestas[k];
    })
  );
  ok("B TIENE_ENCUESTA after refresh", sb.TIENE_ENCUESTA === true);
  ok("B SEGMENTO after refresh", sb.SEGMENTO === 1);
  ok("D ingreso PRE", sb.PRE.ingreso === 42000);
  ok("D declared_ingreso", sb.CZState.declared_ingreso === 42000);
  ok("D income_source handoff", sb.CZState.income_source === "handoff");
  ok("D financial_income_complete", sb.CZState.financial_income_complete === true);
  ok("E laboral", sb.PRE.laboral === "jubilado" && sb.CZState.declared_laboral === "jubilado");
  ok("E laboral_source_raw", sb.PRE.laboral_source_raw === "JUB");
  ok("E DOB", sb.PRE.fecha_nacimiento === "1970-12-15");
  ok("E nombre preserved", sb.PRE.nombre === "TestUser");
  ok("F no consent fabricated", boot.localStore.cz_consent_v1 == null);

  // Simulate legacy wipe risk: without _handoffPrefill guard, values must still be present
  ok("E handoff flag set", sb.CZState._handoffPrefill === true);

  // Invalid letter rejected
  var bad = JSON.parse(JSON.stringify(ctx));
  bad.survey.respuestas.p1 = "Z";
  sb.PRE.respuestas.p1 = null;
  sb.CZHandoffEntry.applyHandoffContextToPrefill(bad);
  ok("C invalid letter not accepted", sb.PRE.respuestas.p1 !== "Z");
})();

// --- Sanitize server-side uppercase ---
(function () {
  var sanitize = loadSanitize().sanitizeHandoffContext;
  var out = sanitize({
    context: { funnel: "credizona_rejected", external_ref: "LRW-X" },
    survey: {
      respuestas: {
        p1: "d",
        p2: "a",
        p3: "c",
        p4: "c",
        p5: "b",
        p6: "d",
        p7: "b",
        p8: "b",
        p9: "d",
        p10: "a",
      },
    },
    financial_prefill: { ingreso: 42000, laboral: "jubilado", laboral_source_raw: "JUB" },
    person: { nombre: "X", fecha_nacimiento: "1970-12-15", ci: "SHOULD_STRIP" },
  });
  ok("sanitize uppercase p1", out.survey.respuestas.p1 === "D");
  ok("sanitize strips ci", !out.person.ci);
  ok("sanitize ingreso", out.financial_prefill.ingreso === 42000);
  var bad = sanitize({
    context: { funnel: "credizona_rejected" },
    survey: { respuestas: { p1: "ZZ" } },
  });
  ok("sanitize rejects invalid letter", !bad || !bad.survey || !bad.survey.respuestas.p1);
})();

console.log("\nA3 bootstrap fix-01 QA: " + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
