/**
 * ?cz_api= override: honored only on a loopback page (local development); ignored on every other host.
 *
 * The frontend of this tree is served by Playwright route interception under the production origin
 * (https://cz-miplan2.vercel.app, committed CZ_SHADOW_PROD_HOSTS) and a preview-like origin, and by a
 * local static server on 127.0.0.1. The committed API origin (CZ_BACKEND_API_URL in js/config.js) is
 * intercepted too and answered by the real Express app (memory diagnosis repository, user choice
 * service with a fake repository). Every other request is recorded and aborted: nothing leaves the
 * machine.
 *
 * [1] getApiBaseUrl() matrix per page origin and cz_api value.
 * [2] production origin + ?cz_api=https://evil.example, V2 flags OFF (today's production config):
 *     the shadow POST goes to the committed API, nothing reaches evil.example.
 * [3] same with V2 state + interaction ON (future flag-ON deploy): shadow POST, GET user-choices and a
 *     real user choice POST all go to the committed API; the anonymous id is never sent elsewhere.
 *
 * Usage: node -r ./server/testing/networkTrap.js dev/backend-arch/classifier-shadow/cz-api-override-e2e.js
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var chromium = require("playwright").chromium;

var h = require("./v2-wiring-e2e");
var createApp = require("../../../server/app").createApp;
var loadConfig = require("../../../server/config").loadConfig;
var createDiagnosisService = require("../../../server/modules/diagnosis/service").createDiagnosisService;
var extractEngineInput = require("../../../server/modules/diagnosis/service").extractEngineInput;
var createUserChoiceService = require("../../../server/modules/userChoice/service").createUserChoiceService;
var sanitize = require("../../../server/modules/journey/sanitizeContext");
var classifier = require("../../../engine/classifier/financial-classifier");

var ROOT = path.join(__dirname, "..", "..", "..");
var PROD_ORIGIN = "https://cz-miplan2.vercel.app";
var PREVIEW_ORIGIN = "https://cz-miplan2-git-feature-x.vercel.app";
var EVIL = "https://evil.example";
var CONFIG_SRC = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
var OFFICIAL_API = /var CZ_BACKEND_API_URL = "([^"]+)";/.exec(CONFIG_SRC)[1];
var EV = "11111111-1111-4111-8111-111111111111";
var FACTS = { gastos: { vivienda: 15000 }, deudas: [{ monto: "300000", pago: 30000, situacion_ui: "pagando_normal" }] };

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

// ---------- API: real app, fake user choice repository bound to the last posted input ----------
function startApi() {
  var shared = { lastBody: null, marks: [], recorded: [] };
  var ucRepo = {
    getUserChoiceState: async function () {
      var input = extractEngineInput(clone(shared.lastBody));
      var r = classifier.classifyFinancialShadow(input);
      return { evaluation_id: EV, classification_status: r.classification_status, strategy: r.strategy, classifier_version: r.classifier_version,
        financial_input_identity_version: "financial_input_identity_v1", financial_input_identity: "a".repeat(64), result: r,
        origin_expense_input: { gastos: input.gastos, custom_expenses: input.custom_expenses },
        lower_payment_intent: shared.marks.slice(), surplus_allocation: null, expense_reduction_intent: [], creditor_contact_step: [],
        debt_management_opt_in: null };
    },
    recordUserChoice: async function (row) {
      shared.recorded.push(row);
      if (row.choice_type === "lower_payment_intent" && row.lower_payment_state === "marked") {
        shared.marks.push({ event_id: "e" + shared.recorded.length, debt_index: row.debt_index, seq: shared.recorded.length, created_at: new Date().toISOString() });
      }
      return { evaluation_id: EV, appended: true, current: { choice_type: row.choice_type, debt_index: row.debt_index, lower_payment_state: row.lower_payment_state, created_at: new Date().toISOString() } };
    },
    recordDebtManagementOptIn: async function () { throw new Error("unused"); },
  };
  var diagnosisService = createDiagnosisService({ repository: h.memoryDiagnosisRepository(), tenantId: "miplan-default", journeyService: h.journeyService });
  var app = createApp(loadConfig({ NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "" }),
  { journeyService: h.journeyService, diagnosisService: diagnosisService,
    userChoiceService: createUserChoiceService({ repository: ucRepo, interactionEnabled: true }) });
  return new Promise(function (resolve) {
    var server = http.createServer(app);
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port, shared: shared }); });
  });
}

function staticFile(urlPath) {
  if (urlPath === "/" || /^\/e\//.test(urlPath)) urlPath = "/index.html";
  var file = path.join(ROOT, urlPath);
  if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  return file;
}

/**
 * @param {object} opts { origin, served: "route" | "local", configLocal: string|null, journey: bool }
 */
async function openPage(browser, api, opts, query) {
  var rec = { requests: [], errors: [], journeyId: null };
  if (opts.journey) {
    var journey = await h.journeyService.createFromHandoffRedeem(h.ANON, "cz-api-" + opts.label, clone(h.RAW_CONTEXTS.V2));
    rec.journeyId = journey.journey_id;
  }
  var context = await browser.newContext({ locale: "es-UY" });
  await context.addInitScript(function (anon) {
    try { if (!localStorage.getItem("cz_anonymous_id")) localStorage.setItem("cz_anonymous_id", anon); } catch (_e) { /* ignore */ }
  }, h.ANON);
  await context.route("**/*", async function (route) {
    var req = route.request();
    var url = req.url();
    var headers = req.headers();
    try {
      if (url.indexOf(opts.origin + "/") === 0) {
        var urlPath = decodeURIComponent(url.slice(opts.origin.length).split("?")[0]);
        if (urlPath === "/js/config.local.js") {
          if (opts.configLocal == null) return await route.fulfill({ status: 404, body: "" });
          return await route.fulfill({ status: 200, contentType: "application/javascript", body: opts.configLocal });
        }
        if (opts.served === "local") return await route.continue();
        var file = staticFile(urlPath);
        if (!file) return await route.fulfill({ status: 404, body: "" });
        return await route.fulfill({ status: 200, path: file });
      }
      var origin = new URL(url).origin;
      rec.requests.push({ origin: origin, method: req.method(), path: new URL(url).pathname, anon: !!headers["x-miplan-anonymous-id"] });
      if (url.indexOf(opts.api + "/") === 0) {
        if (req.method() === "OPTIONS") return await route.fulfill({ status: 204, headers: h.CORS });
        var p = url.slice(opts.api.length);
        if (p.indexOf("/v1/handoff/redeem") === 0) {
          return await route.fulfill({ status: 200, headers: h.CORS, contentType: "application/json",
            body: JSON.stringify({ ok: true, journey_id: rec.journeyId, cached: false, durable: true,
              context: sanitize.sanitizeHandoffContext(clone(h.RAW_CONTEXTS.V2)) }) });
        }
        if (req.method() === "POST" && p.split("?")[0] === "/v1/diagnoses") api.shared.lastBody = JSON.parse(req.postData());
        var fwd = await h.forward(api.port, req.method(), p, headers, req.postData());
        return await route.fulfill({ status: fwd.status, headers: h.CORS, contentType: "application/json", body: fwd.raw });
      }
      return await route.abort();
    } catch (_e) {
      if (process.env.CZ_API_E2E_DEBUG) console.log("ROUTE ERR " + url + " " + String(_e && _e.message));
    }
  });
  var page = await context.newPage();
  page.on("pageerror", function (e) { rec.errors.push(String(e && e.message)); });
  var entry = opts.journey ? "/e/cz-api-" + opts.label : "/";
  var served = [];
  page.on("requestfinished", async function (r) {
    try { var resp = await r.response(); served.push((resp ? resp.status() : "?") + " " + r.url()); } catch (_e) { /* ignore */ }
  });
  page.on("requestfailed", function (r) { served.push("FAILED " + r.url() + " " + (r.failure() && r.failure().errorText)); });
  await page.goto(opts.origin + entry + (query || ""));
  try {
    await page.waitForFunction(function (journey) {
      if (!window.CZShadowDiagnosis) return false;
      return !journey || !!(window.CZState && window.CZState.temporal && window.CZState.temporal.session_count >= 1);
    }, !!opts.journey, { timeout: 20000 });
  } catch (e) {
    console.log("BOOT TIMEOUT " + opts.label + " " + JSON.stringify({ errors: rec.errors, served: served.slice(0, 40), url: page.url(),
      html: (await page.content()).slice(0, 600), reqs: rec.requests.slice(0, 20) }));
    throw e;
  }
  await page.waitForTimeout(300);
  return { context: context, page: page, rec: rec };
}

async function acceptConsent(page) {
  if (await page.$("#btn-miplan-consent-accept")) {
    await page.check("#chk-miplan-tc");
    await page.check("#chk-miplan-privacy");
    await page.click("#btn-miplan-consent-accept");
    await page.waitForTimeout(300);
  }
}

async function apiBaseOf(browser, api, opts, query) {
  var o = await openPage(browser, api, opts, query);
  try {
    return await o.page.evaluate(function () {
      return { base: window.CZShadowDiagnosis.getApiBaseUrl(), shadow: window.CZShadowDiagnosis.isShadowEnabled() };
    });
  } finally {
    await o.context.close();
  }
}

async function dashboardWithFacts(o) {
  await acceptConsent(o.page);
  await h.toDashboard(o.page, "classified");
  await o.page.waitForFunction(function () {
    var s = window.CZShadowDiagnosis.getStats();
    return s.match + s.mismatch + s.error >= 1;
  }, null, { timeout: 20000 });
  await o.page.evaluate(function (f) {
    var st = window.CZState;
    st.deudas = f.deudas.map(function (d, i) {
      return Object.assign({ id: "deuda_e2e_" + i, tipo: "prestamo", acreedor: "Banco E2E " + (i + 1), acreedor_display: "Banco E2E " + (i + 1) }, d);
    });
    st.gastos = f.gastos;
    st.custom_expenses = [];
    st.no_debts_declared = false;
    window.CZShadowDiagnosis._resetDedupeForTests();
    window.CZShadowDiagnosis.maybeShadowDiagnosis(st, "cz_api_e2e");
  }, FACTS);
  await o.page.waitForFunction(function () {
    var s = window.CZShadowDiagnosis.getStats();
    return s.match + s.mismatch + s.error >= 2;
  }, null, { timeout: 20000 });
}

async function main() {
  var api = await startApi();
  var local = await h.startStaticServer();
  var browser = await chromium.launch();
  var out = {};
  var warn = console.warn;
  console.warn = function () {};
  // Every page enters through /e/<token> (handoff): the production host redirects direct visits away.
  var prod = function (label, configLocal) {
    return { label: label, origin: PROD_ORIGIN, served: "route", configLocal: configLocal, journey: true, api: OFFICIAL_API };
  };
  try {
    // ---- [1] matrix ----
    var LOCAL_API = "http://config-api.test";
    var localOpts = function (label) {
      return { label: label, origin: local.origin, served: "local", journey: true,
        configLocal: "CZ_BACKEND_API_URL = " + JSON.stringify(LOCAL_API) + ";", api: LOCAL_API };
    };
    out.matrix = {
      prodEvil: await apiBaseOf(browser, api, prod("m1", null), "?cz_api=" + encodeURIComponent(EVIL)),
      prodEvilShadow: await apiBaseOf(browser, api, prod("m2", null), "?cz_shadow=1&cz_api=" + encodeURIComponent(EVIL + "/x")),
      prodLocalhost: await apiBaseOf(browser, api, prod("m3", null), "?cz_api=" + encodeURIComponent("http://localhost:3000")),
      prodOfficial: await apiBaseOf(browser, api, prod("m4", null), "?cz_api=" + encodeURIComponent(OFFICIAL_API)),
      prodNone: await apiBaseOf(browser, api, prod("m5", null), ""),
      preview: await apiBaseOf(browser, api, { label: "m6", origin: PREVIEW_ORIGIN, served: "route", configLocal: null, journey: true, api: OFFICIAL_API },
        "?cz_api=" + encodeURIComponent(EVIL)),
      localOverride: await apiBaseOf(browser, api, localOpts("l1"), "?cz_api=" + encodeURIComponent("http://localhost:3000/")),
      localJs: await apiBaseOf(browser, api, localOpts("l2"), "?cz_api=" + encodeURIComponent("javascript:alert(1)")),
      localCreds: await apiBaseOf(browser, api, localOpts("l3"), "?cz_api=" + encodeURIComponent("http://u:p@127.0.0.1:3000/api/?q=1#h")),
      localNone: await apiBaseOf(browser, api, localOpts("l4"), ""),
    };

    // ---- [2] production, flags OFF, manipulated query ----
    var o2 = await openPage(browser, api, prod("off", null), "?cz_api=" + encodeURIComponent(EVIL));
    try {
      await acceptConsent(o2.page);
      await h.toDashboard(o2.page, "classified");
      await o2.page.waitForFunction(function () {
        var s = window.CZShadowDiagnosis.getStats();
        return s.match + s.mismatch + s.error >= 1;
      }, null, { timeout: 20000 });
      await o2.page.waitForTimeout(1000);
      out.off = { rec: o2.rec, base: await o2.page.evaluate(function () { return window.CZShadowDiagnosis.getApiBaseUrl(); }) };
    } finally {
      await o2.context.close();
    }

    // ---- [3] production, V2 state + interaction ON (simulated flag-ON deploy), manipulated query ----
    var flagsOn = "CZ_V2_STRATEGY_STATE_ENABLED = true; CZ_V2_INTERACTION_ENABLED = true;";
    var o3 = await openPage(browser, api, prod("on", flagsOn, true), "?cz_api=" + encodeURIComponent(EVIL));
    try {
      await dashboardWithFacts(o3);
      await o3.page.waitForSelector('#cz-v2-interaction [data-v2i="lower"][data-index="0"]', { timeout: 20000 });
      var before = api.shared.recorded.length;
      await o3.page.click('#cz-v2-interaction [data-v2i="lower"][data-index="0"]');
      await o3.page.waitForFunction(function () {
        var p = document.getElementById("cz-v2-interaction");
        return !!p && p.innerText.indexOf("Pedir una cuota más baja para Banco E2E 1") !== -1;
      }, null, { timeout: 20000 });
      out.on = { rec: o3.rec, recordedDelta: api.shared.recorded.length - before,
        base: await o3.page.evaluate(function () { return window.CZShadowDiagnosis.getApiBaseUrl(); }) };
    } finally {
      await o3.context.close();
    }
  } finally {
    console.warn = warn;
    await browser.close();
    local.server.close();
    api.server.close();
  }

  var m = out.matrix;
  check("[1] production origin: ?cz_api=evil ignored -> committed API (" + OFFICIAL_API + ")", m.prodEvil.base === OFFICIAL_API, m.prodEvil);
  check("[1] production origin: ?cz_shadow=1&cz_api=evil -> committed API (operator shadow switch kept, destination not overridable)",
    m.prodEvilShadow.base === OFFICIAL_API && m.prodEvilShadow.shadow === true, m.prodEvilShadow);
  check("[1] production origin: ?cz_api=http://localhost:3000 ignored too (no local override on a public host)", m.prodLocalhost.base === OFFICIAL_API, m.prodLocalhost);
  check("[1] production origin: ?cz_api=<committed API> and no query -> committed API", m.prodOfficial.base === OFFICIAL_API && m.prodNone.base === OFFICIAL_API,
    { official: m.prodOfficial, none: m.prodNone });
  check("[1] preview-like *.vercel.app origin: ?cz_api=evil ignored", m.preview.base === OFFICIAL_API, m.preview);
  check("[1] loopback page: ?cz_api=http://localhost:3000/ honored (local development contract)", m.localOverride.base === "http://localhost:3000", m.localOverride);
  check("[1] loopback page: non-http(s) cz_api ignored -> config API", m.localJs.base === "http://config-api.test", m.localJs);
  check("[1] loopback page: credentials, query and fragment stripped from the override", m.localCreds.base === "http://127.0.0.1:3000/api", m.localCreds);
  check("[1] loopback page without query -> config API", m.localNone.base === "http://config-api.test", m.localNone);

  var offEvil = out.off.rec.requests.filter(function (r) { return r.origin === EVIL; });
  var offDiag = out.off.rec.requests.filter(function (r) { return r.origin === OFFICIAL_API && r.method === "POST" && r.path === "/v1/diagnoses"; });
  check("[2] production + ?cz_api=evil, flags OFF: shadow POST /v1/diagnoses sent to the committed API, 0 requests to evil.example",
    out.off.base === OFFICIAL_API && offDiag.length >= 1 && offEvil.length === 0, { base: out.off.base, evil: offEvil, diag: offDiag.length });
  var offAnonElsewhere = out.off.rec.requests.filter(function (r) { return r.anon && r.origin !== OFFICIAL_API; });
  check("[2] anonymous id sent only to the committed API; no user-choice request with flags OFF; 0 pageerror",
    offAnonElsewhere.length === 0 && out.off.rec.requests.every(function (r) { return !/user-choices/.test(r.path); }) && out.off.rec.errors.length === 0,
    { anonElsewhere: offAnonElsewhere, errors: out.off.rec.errors });

  var on = out.on.rec.requests;
  var onEvil = on.filter(function (r) { return r.origin === EVIL; });
  var ucGet = on.filter(function (r) { return r.method === "GET" && /\/user-choices$/.test(r.path); });
  var ucPost = on.filter(function (r) { return r.method === "POST" && /\/user-choices$/.test(r.path); });
  check("[3] production + ?cz_api=evil, interaction ON: GET and POST user-choices (with the anonymous id) only to the committed API; 0 requests to evil.example",
    out.on.base === OFFICIAL_API && onEvil.length === 0 && ucGet.length >= 1 && ucPost.length === 1 &&
    ucGet.concat(ucPost).every(function (r) { return r.origin === OFFICIAL_API && r.anon; }) && out.on.recordedDelta === 1,
    { base: out.on.base, evil: onEvil, get: ucGet, post: ucPost, recorded: out.on.recordedDelta });
  var onAnonElsewhere = on.filter(function (r) { return r.anon && r.origin !== OFFICIAL_API; });
  check("[3] anonymous id never sent to any other origin; 0 pageerror", onAnonElsewhere.length === 0 && out.on.rec.errors.length === 0,
    { anonElsewhere: onAnonElsewhere, errors: out.on.rec.errors });
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("CZ_API_OVERRIDE_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
