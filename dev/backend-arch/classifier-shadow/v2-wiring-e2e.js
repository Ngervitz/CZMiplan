/**
 * V2-END-TO-END-WIRING-01 — classifier V2 → confirmed persistence → API → CZState, no visual change.
 *
 * Real Mi Plan frontend (Playwright) against the real Express app (createApp + diagnosis/journey
 * services, memory repositories that mirror the RPC replies). Journeys are created server-side from
 * contexts built by the real JANUS builder; /v1/handoff/redeem is answered with that journey.
 * Every other /v1/* call is forwarded to the real app; the first POST /v1/diagnoses can be held to
 * observe the page exactly before and after the response lands.
 *
 * Matrix: flag OFF + shadow ON (V2 classified / V2 incomplete / V1), flag ON + classified,
 * incomplete, persistence failure, V1, shadow OFF, journey A → B while A is in flight, reset while
 * A is in flight, and journey change after A was stored.
 *
 * Per scenario: DOM (body.outerHTML) identical right before vs after the response, 0 mutations
 * (MutationObserver), 0 render calls (spy on every window/CredizonaUI render* function), 0
 * pageerror, and the normalized dashboard DOM equal to the flag-OFF run with the same facts.
 * Non-deterministic DOM parts normalized across runs: debt ids (deuda_<ts>), 13-digit
 * timestamps and UUIDs. Legacy timer-driven chrome (first-diagnosis celebration, 3000 ms; the
 * first-dashboard toast, 5000 ms; the toast after reset) is awaited out before any measurement.
 * Typed amounts are plain digits, read the same by every amount parser of the app.
 *
 * Usage: node dev/backend-arch/classifier-shadow/v2-wiring-e2e.js
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var chromium = require("playwright").chromium;

var ROOT = path.join(__dirname, "..", "..", "..");
var JANUS_DIR = process.env.JANUS_REPO_DIR || path.join(ROOT, "..", "..", "Mie Backend", "mie-backend");
var MOCK_API = "http://miplan-mock.test";

[["SUPABASE_URL", "https://example.supabase.co"], ["SUPABASE_SERVICE_ROLE_KEY", "test"],
  ["APIFY_TOKEN", "test"], ["APIFY_ACTOR_ID", "test"]].forEach(function (kv) {
  if (!process.env[kv[0]]) process.env[kv[0]] = kv[1];
});
delete process.env.MIPLAN_HANDOFF_SURVEY_V2_ENABLED;
var janusTokens = require(path.join(JANUS_DIR, "src", "lib", "miplanHandoffTokens"));

var createApp = require("../../../server/app").createApp;
var loadConfig = require("../../../server/config").loadConfig;
var createMemoryJourneyRepository = require("../../../server/modules/journey/repository").createMemoryJourneyRepository;
var createJourneyService = require("../../../server/modules/journey/service").createJourneyService;
var diagnosisServiceModule = require("../../../server/modules/diagnosis/service");
var financialIdentity = require("../../../server/modules/diagnosis/financialIdentity");
var createMemoryStrategyEvaluationStore =
  require("../../../server/testing/memoryStrategyEvaluations").createMemoryStrategyEvaluationStore;
var sanitize = require("../../../server/modules/journey/sanitizeContext");
var classify = require("../../../engine/classifier/financial-classifier").classifyFinancialShadow;

var ANON = "55555555-5555-4555-8555-555555555555";
var EPISODE = {
  cz_id: 9003, ci: 11111113, lrw_id: "LRW-000-000-003", email: "qa-wiring@example.test",
  nombre: "QA", apellido: "Wiring", salario: 50000, relacion_laboral: "EPR",
  solicitudes_estados_id: 3, synced_at: "2026-09-30T12:00:00.000Z",
};
var ANSWERS = { p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p8: "B", p9: "B", p10: "B" };
function janusContext(version, p7, v2Enabled) {
  var row = Object.assign({ cz_id: 79, ci: 11111113, completed_at: "2026-09-30T11:00:00.000Z",
    version_cuestionario: version, p7: p7 }, ANSWERS);
  return JSON.parse(JSON.stringify(janusTokens.buildAllowlistedContext(EPISODE, row,
    "2026-09-30T12:00:00.000Z", { surveyV2Enabled: v2Enabled === true })));
}
var RAW_CONTEXTS = { V2: janusContext(2, "E", true), V1: janusContext(1, "B", false) };

// ---------- real API (memory repositories mirroring the RPC replies) ----------
var journeyRepo = createMemoryJourneyRepository();
var journeyService = createJourneyService({ repository: journeyRepo, tenantId: "miplan-default" });

function memoryDiagnosisRepository(opts) {
  opts = opts || {};
  var strategies = [];
  var store = createMemoryStrategyEvaluationStore();
  return {
    insertDiagnosis: async function () {
      return { diagnosis_id: crypto.randomUUID() };
    },
    recordFinancialStrategyEvaluation: async function (row) {
      if (opts.failStrategyInsert) {
        var e = new Error("DB_STRATEGY_EVALUATION_FAILED");
        e.code = "DB_STRATEGY_EVALUATION_FAILED";
        throw e;
      }
      strategies.push(row);
      return store.record(JSON.parse(JSON.stringify(row)));
    },
    upsertShadowResult: async function (row) {
      return { diagnosis_id: row.diagnosis_id, shadow_status: row.shadow_status, inserted: true, compared_at: new Date().toISOString() };
    },
    _test: { strategies: strategies },
  };
}

function startApi(diagRepo, serviceOverrides) {
  var service = diagnosisServiceModule.createDiagnosisService(Object.assign({
    repository: diagRepo, tenantId: "miplan-default", journeyService: journeyService,
  }, serviceOverrides || {}));
  var app = createApp(loadConfig({
    NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "",
  }), { journeyService: journeyService, diagnosisService: service });
  return new Promise(function (resolve) {
    var server = http.createServer(app);
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port, repo: diagRepo }); });
  });
}

function forward(port, method, urlPath, headers, body) {
  return new Promise(function (resolve, reject) {
    var h = { Accept: "application/json" };
    if (headers["content-type"]) h["Content-Type"] = headers["content-type"];
    if (headers["x-miplan-anonymous-id"]) h["X-MiPlan-Anonymous-Id"] = headers["x-miplan-anonymous-id"];
    if (body) h["Content-Length"] = Buffer.byteLength(body);
    var req = http.request({ hostname: "127.0.0.1", port: port, path: urlPath, method: method, headers: h }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        var raw = Buffer.concat(chunks).toString("utf8");
        var json = null;
        try { json = JSON.parse(raw); } catch (_e) { json = null; }
        resolve({ status: res.statusCode, raw: raw, json: json });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------- static frontend ----------
function startStaticServer() {
  var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/" || /^\/e\//.test(urlPath)) urlPath = "/index.html";
    var file = path.join(ROOT, urlPath);
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    var ext = path.extname(file);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "text/html" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve({ server: server, origin: "http://127.0.0.1:" + server.address().port });
    });
  });
}

var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-MiPlan-Anonymous-Id, Accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

async function openScenario(browser, origin, sc, apis) {
  var journey = await journeyService.createFromHandoffRedeem(ANON, "v2-wiring-" + sc.name, JSON.parse(JSON.stringify(RAW_CONTEXTS[sc.journey])));
  var rec = { journeyId: journey.journey_id, posts: [], pending: [], errors: [], held: 0 };
  var api = apis[sc.api || "ok"];
  var context = await browser.newContext({ locale: "es-UY" });
  await context.addInitScript(function (anon) {
    try { if (!localStorage.getItem("cz_anonymous_id")) localStorage.setItem("cz_anonymous_id", anon); } catch (_e) { /* ignore */ }
  }, ANON);
  await context.route("**/*", async function (route) {
    var req = route.request();
    var url = req.url();
    try {
      if (url.indexOf(origin + "/js/config.local.js") === 0) {
        return await route.fulfill({ status: 200, contentType: "application/javascript",
          body: "CZ_BACKEND_API_URL = " + JSON.stringify(MOCK_API) + "; CZ_SHADOW_MODE = " + sc.shadow +
            "; CZ_V2_STRATEGY_STATE_ENABLED = " + sc.flag + ";" });
      }
      if (url.indexOf(origin) === 0) return await route.continue();
      if (url.indexOf(MOCK_API) === 0) {
        if (req.method() === "OPTIONS") return await route.fulfill({ status: 204, headers: CORS });
        var p = url.slice(MOCK_API.length);
        if (p.indexOf("/v1/handoff/redeem") === 0) {
          return await route.fulfill({ status: 200, headers: CORS, contentType: "application/json",
            body: JSON.stringify({ ok: true, journey_id: rec.journeyId, cached: false, durable: true,
              context: sanitize.sanitizeHandoffContext(JSON.parse(JSON.stringify(RAW_CONTEXTS[sc.journey]))) }) });
        }
        var isDiag = req.method() === "POST" && p.split("?")[0] === "/v1/diagnoses";
        var fwd = await forward(api.port, req.method(), p, req.headers(), req.postData());
        if (isDiag) {
          rec.posts.push({ body: JSON.parse(req.postData()), status: fwd.status, response: fwd.json });
          if (sc.hold && rec.held === 0) {
            rec.held += 1;
            await new Promise(function (resolve) { rec.pending.push(resolve); });
          }
        }
        return await route.fulfill({ status: fwd.status, headers: CORS, contentType: "application/json", body: fwd.raw });
      }
      return await route.abort();
    } catch (_e) {
      /* context closed */
    }
  });
  var page = await context.newPage();
  page.on("pageerror", function (e) { rec.errors.push(String(e && e.message)); });
  await page.goto(origin + "/e/v2-wiring-" + sc.name);
  await page.waitForFunction(function () {
    return !!(window.CZState && window.CZState.temporal && window.CZState.temporal.session_count >= 1);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  if (await page.$("#btn-miplan-consent-accept")) {
    await page.check("#chk-miplan-tc");
    await page.check("#chk-miplan-privacy");
    await page.click("#btn-miplan-consent-accept");
    await page.waitForTimeout(300);
  }
  return { context: context, page: page, rec: rec };
}

async function typeAndBlur(page, selector, raw) {
  await page.fill(selector, raw);
  await page.press(selector, "Tab");
  await page.waitForTimeout(40);
}

async function clickContinue(page) {
  await page.evaluate(function () { document.getElementById("sticky-cta").click(); });
  await page.waitForTimeout(300);
}

async function toDashboard(page, facts) {
  if (await page.isVisible("#inp-ingreso-mensual")) {
    await page.check('input[name="profile-laboral"][value="relacion_dependencia"]');
    await page.click("#btn-continuar-ingreso");
    await page.waitForTimeout(300);
  }
  if (await page.$("#btn-bridge-survey")) {
    throw new Error("bridge screen reached (unexpected for this journey)");
  }
  await page.waitForSelector("#btn-agregar-deuda", { timeout: 15000 });
  await page.click("#btn-agregar-deuda");
  await page.waitForSelector('[data-deuda-field="monto"]');
  var idx = await page.evaluate(function () { return window.CZState.editing_debt_index; });
  var sel = function (f) { return '[data-deuda-field="' + f + '"][data-deuda-idx="' + idx + '"]'; };
  await page.selectOption(sel("tipo"), "prestamo");
  await page.fill(sel("acreedor"), "Banco QA");
  await typeAndBlur(page, sel("monto"), "120000");
  if (facts === "incomplete") {
    await page.click('[data-deuda-situacion="no_seguro"][data-deuda-idx="' + idx + '"]');
    var ns = '[data-deuda-field="atraso_tiempo_aprox"][data-deuda-val="no_sabe"][data-deuda-idx="' + idx + '"]';
    if (await page.$(ns)) await page.click(ns);
  } else {
    await page.click('[data-deuda-situacion="pagando_normal"][data-deuda-idx="' + idx + '"]');
    await typeAndBlur(page, sel("pago"), "6500");
  }
  await page.click("#btn-guardar-deuda-edicion");
  await page.waitForTimeout(200);
  await clickContinue(page);
  await page.waitForSelector('[data-gasto="vivienda"]');
  await typeAndBlur(page, '[data-gasto="vivienda"]', "20000");
  await clickContinue(page);
  await page.waitForFunction(function () { return window.CZState.step === 3; }, null, { timeout: 15000 });
}

// ---------- in-page probes ----------
function pageWaitQuiet(args) {
  return new Promise(function (resolve) {
    var last = Date.now();
    var started = Date.now();
    var obs = new MutationObserver(function () { last = Date.now(); });
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    (function tick() {
      if (Date.now() - last >= args.quietMs || Date.now() - started >= args.maxMs) {
        obs.disconnect();
        resolve(Date.now() - last >= args.quietMs);
        return;
      }
      setTimeout(tick, 50);
    })();
  });
}

function pageInstallProbes() {
  var probe = window.__v2WiringProbe;
  if (probe) {
    probe.observer.disconnect();
    probe.mutations = 0;
    probe.samples.length = 0;
    Object.keys(probe.renders).forEach(function (k) { delete probe.renders[k]; });
  } else {
    probe = { mutations: 0, samples: [], renders: {} };
    window.__v2WiringProbe = probe;
  }
  probe.observer = new MutationObserver(function (list) {
    list.forEach(function (m) {
      probe.mutations += 1;
      if (probe.samples.length < 5) {
        probe.samples.push(m.type + ":" + (m.target && (m.target.id || m.target.nodeName)) + (m.attributeName ? "@" + m.attributeName : ""));
      }
    });
  });
  probe.observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  function wrap(owner, key, label) {
    var fn = owner[key];
    if (typeof fn !== "function" || fn.__v2WiringSpy) return;
    var spy = function () {
      probe.renders[label] = (probe.renders[label] || 0) + 1;
      return fn.apply(this, arguments);
    };
    spy.__v2WiringSpy = true;
    owner[key] = spy;
  }
  var n = 0;
  Object.getOwnPropertyNames(window).forEach(function (k) {
    if (/^render/.test(k) && typeof window[k] === "function") { try { wrap(window, k, "window." + k); n += 1; } catch (_e) { /* ignore */ } }
  });
  if (window.CredizonaUI) {
    Object.keys(window.CredizonaUI).forEach(function (k) {
      if (/^render/.test(k) && typeof window.CredizonaUI[k] === "function") { wrap(window.CredizonaUI, k, "CredizonaUI." + k); n += 1; }
    });
  }
  return { wrapped: n, dom: document.body.outerHTML };
}

function pageReadProbes() {
  var probe = window.__v2WiringProbe;
  probe.observer.takeRecords().forEach(function () { probe.mutations += 1; });
  var renders = Object.keys(probe.renders).reduce(function (s, k) { return s + probe.renders[k]; }, 0);
  return { mutations: probe.mutations, samples: probe.samples, renderCalls: renders, renders: probe.renders, dom: document.body.outerHTML };
}

function pageState() {
  var st = window.CZState;
  var storage = "";
  try {
    for (var i = 0; i < localStorage.length; i++) storage += localStorage.key(i) + "=" + localStorage.getItem(localStorage.key(i)) + "\n";
    for (var j = 0; j < sessionStorage.length; j++) storage += sessionStorage.key(j) + "=" + sessionStorage.getItem(sessionStorage.key(j)) + "\n";
  } catch (_e) { /* ignore */ }
  var has = Object.prototype.hasOwnProperty.call(st, "_v2FinancialStrategy");
  return {
    step: st.step,
    plan_id: st.diag && st.diag.planId != null ? st.diag.planId : null,
    has_key: has,
    value: has ? JSON.parse(JSON.stringify(st._v2FinancialStrategy)) : "<absent>",
    in_diag: JSON.stringify(st.diag || {}).indexOf("v2_financial") !== -1 || JSON.stringify(st.diag || {}).indexOf("classifier_version") !== -1,
    in_storage: /_v2FinancialStrategy|v2_financial_strategy|classifier_version|CLASSIFIER-CONTRACT/.test(storage),
    active_journey: window.CZHandoffEntry.getCurrentJourneyId(),
    stats: window.CZShadowDiagnosis.getStats(),
    v2_globals: Object.getOwnPropertyNames(window).filter(function (k) { return /v2strateg|v2financial|v2_fin/i.test(k); }),
    window_keys: Object.getOwnPropertyNames(window).sort(),
  };
}

async function waitResponsesProcessed(page, n) {
  await page.waitForFunction(function (count) {
    var s = window.CZShadowDiagnosis.getStats();
    return s.match + s.mismatch + s.error >= count;
  }, n, { timeout: 15000 });
  await page.waitForTimeout(400);
}

function normalizeDom(html) {
  return String(html)
    .replace(/deuda_\d+/g, "deuda_<id>")
    .replace(/\b\d{13}\b/g, "<ts>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>");
}

// ---------- scenarios ----------
var SCENARIOS = [
  { name: "OFF_SHADOW_ON", flag: false, shadow: true, journey: "V2", facts: "classified", hold: true },
  { name: "OFF_INCOMPLETE", flag: false, shadow: true, journey: "V2", facts: "incomplete", hold: true },
  { name: "OFF_V1", flag: false, shadow: true, journey: "V1", facts: "classified", hold: true },
  { name: "ON_CLASSIFIED", flag: true, shadow: true, journey: "V2", facts: "classified", hold: true, switchAfter: true },
  { name: "ON_INCOMPLETE", flag: true, shadow: true, journey: "V2", facts: "incomplete", hold: true },
  { name: "ON_PERSIST_FAIL", flag: true, shadow: true, journey: "V2", facts: "classified", hold: true, api: "persistFail" },
  { name: "ON_V1", flag: true, shadow: true, journey: "V1", facts: "classified", hold: true },
  { name: "ON_SHADOW_OFF", flag: true, shadow: false, journey: "V2", facts: "classified", hold: false },
  { name: "ON_AB_LATE", flag: true, shadow: true, journey: "V2", facts: "classified", hold: true, midFlight: "journey" },
  { name: "ON_RESET_LATE", flag: true, shadow: true, journey: "V2", facts: "classified", hold: true, midFlight: "reset" },
];
var BASELINE = {
  ON_CLASSIFIED: "OFF_SHADOW_ON", ON_PERSIST_FAIL: "OFF_SHADOW_ON", ON_SHADOW_OFF: "OFF_SHADOW_ON", ON_AB_LATE: "OFF_SHADOW_ON",
  ON_INCOMPLETE: "OFF_INCOMPLETE", ON_V1: "OFF_V1",
};
var JOURNEY_B = "66666666-6666-4666-8666-666666666666";

async function runScenario(browser, origin, sc, apis) {
  var o = await openScenario(browser, origin, sc, apis);
  var page = o.page;
  var out = { sc: sc, rec: o.rec };
  try {
    await toDashboard(page, sc.facts);
    if (sc.shadow) {
      var t0 = Date.now();
      while (o.rec.pending.length === 0 && Date.now() - t0 < 15000) await page.waitForTimeout(50);
    } else {
      await page.waitForTimeout(1500);
    }
    // Legacy first-diagnosis celebration auto-dismisses after 3000 ms (celebrations.js OVERLAY_MS).
    await page.waitForFunction(function () { return !document.querySelector(".cz-celebration-root"); }, null, { timeout: 10000 });
    // Legacy first-dashboard toast (ui.js, "Diagnóstico guardado", 5000 ms) removes itself on a timer:
    // it must have been shown and be gone, otherwise its removal lands inside a measurement window.
    await page.waitForFunction(function () {
      return sessionStorage.getItem("cz_toast_dashboard_shown") === "1" && !document.getElementById("cz-toast");
    }, null, { timeout: 15000 });
    out.quiet = await page.evaluate(pageWaitQuiet, { quietMs: 800, maxMs: 10000 });
    var before = await page.evaluate(pageInstallProbes);
    out.wrapped = before.wrapped;
    out.domBefore = before.dom;
    out.stateBefore = await page.evaluate(pageState);
    if (sc.midFlight === "journey") {
      out.midFlight = await page.evaluate(function (b) {
        var st = window.CZState;
        var pre = Object.prototype.hasOwnProperty.call(st, "_v2FinancialStrategy") ? st._v2FinancialStrategy : "<absent>";
        window.CZHandoffEntry.persistJourneyId(b);
        return { before: pre, after: st._v2FinancialStrategy === undefined ? "<absent>" : st._v2FinancialStrategy,
          active: window.CZHandoffEntry.getCurrentJourneyId() };
      }, JOURNEY_B);
    }
    if (sc.midFlight === "reset") {
      out.oldStateRef = await page.evaluate(function () { window.__v2WiringOldState = window.CZState; return true; });
      await page.evaluate(function () { window.resetear(); });
      await page.waitForTimeout(300);
      // Legacy toast shown after reset removes itself on a timer.
      await page.waitForFunction(function () { return !document.getElementById("cz-toast"); }, null, { timeout: 15000 });
      await page.evaluate(pageWaitQuiet, { quietMs: 800, maxMs: 8000 });
      var afterReset = await page.evaluate(pageInstallProbes);
      out.domBefore = afterReset.dom;
    }
    o.rec.pending.forEach(function (release) { release(); });
    if (sc.shadow) await waitResponsesProcessed(page, 1);
    else await page.waitForTimeout(800);
    var probes = await page.evaluate(pageReadProbes);
    out.probes = probes;
    out.state = await page.evaluate(pageState);
    if (sc.midFlight === "reset") {
      out.oldState = await page.evaluate(function () {
        var s = window.__v2WiringOldState;
        return { replaced: s !== window.CZState, old_value: s._v2FinancialStrategy === undefined ? "<absent>" : s._v2FinancialStrategy };
      });
    }
    out.dashDom = normalizeDom(probes.dom);
    out.postsAtResponse = o.rec.posts.length;
    if (sc.switchAfter) {
      out.switch = await page.evaluate(function (b) {
        var st = window.CZState;
        var pre = JSON.parse(JSON.stringify(st._v2FinancialStrategy));
        window.CZHandoffEntry.persistJourneyId(b);
        var post = st._v2FinancialStrategy;
        return { before: pre, immediately_after: post === undefined ? "<absent>" : post, active: window.CZHandoffEntry.getCurrentJourneyId() };
      }, JOURNEY_B);
      await page.evaluate(function () {
        window.CZShadowDiagnosis._resetDedupeForTests();
        window.CZShadowDiagnosis.maybeShadowDiagnosis(window.CZState, "v2_wiring_journey_b");
      });
      await waitResponsesProcessed(page, 2);
      out.afterB = await page.evaluate(pageState);
    }
    out.errors = o.rec.errors.slice();
  } finally {
    o.rec.pending.forEach(function (release) { release(); });
    await o.context.close();
  }
  return out;
}

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function hasV2(body) { return !!body && Object.prototype.hasOwnProperty.call(body, "v2_financial_strategy"); }
function firstDiff(a, b) {
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { at: i, a: a.slice(Math.max(0, i - 80), i + 80), b: b.slice(Math.max(0, i - 80), i + 80) };
  }
  return null;
}

function validatorMatrixInPage() {
  var V = window.CZShadowDiagnosis.validateV2FinancialStrategy;
  var prov = { classifier_version: "c", contract: "k" };
  var fid = { version: "financial_input_identity_v1", value: new Array(65).join("a") };
  var ok = { survey_version: 2, classification_status: "classified", strategy: "CONSOLIDACION", reasons: ["SUSTAINABLE_DEBT_BURDEN"],
    verification: { required: false, reasons: [], missing_facts: [] }, provenance: prov, financial_input_identity: fid };
  var inc = { survey_version: 2, classification_status: "incomplete", strategy: null, reasons: [],
    verification: { required: true,
      reasons: [{ code: "DEBT_PAYMENT_UNKNOWN", fact: "monthly_debt_payment", subject: "debt", debt_index: 0 }],
      missing_facts: [{ fact: "monthly_debt_payment", subject: "debt", debt_index: 0 }] },
    provenance: prov, financial_input_identity: fid };
  function mut(base, fn) { var c = JSON.parse(JSON.stringify(base)); fn(c); return c; }
  var versionString2 = V(mut(ok, function (c) { c.survey_version = "2"; })) === null;
  var versionOthers = {
    null: V(mut(ok, function (c) { c.survey_version = null; })) === null,
    absent: V(mut(ok, function (c) { delete c.survey_version; })) === null,
    one: V(mut(ok, function (c) { c.survey_version = 1; })) === null,
    three: V(mut(ok, function (c) { c.survey_version = 3; })) === null,
    two_point_five: V(mut(ok, function (c) { c.survey_version = 2.5; })) === null,
  };
  var previousContractShape = { survey_version: 2, classifier_version: "c", contract: "k", classification_status: "classified",
    strategy: "CONSOLIDACION", compatible_strategies: ["CONSOLIDACION"], entry_reasons: ["SUSTAINABLE_DEBT_BURDEN"],
    missing_required_facts: [], verification_reasons: [] };
  var rejected = [
    null, [], "x", {}, previousContractShape,
    mut(ok, function (c) { c.strategy = null; }),
    mut(ok, function (c) { c.strategy = "PLAN_3"; }),
    mut(ok, function (c) { c.strategy = "constructor"; }),
    mut(ok, function (c) { c.classification_status = "unknown"; }),
    mut(inc, function (c) { c.strategy = "CONTENCION"; }),
    mut(inc, function (c) { delete c.strategy; }),
    mut(ok, function (c) { c.reasons = "SUSTAINABLE_DEBT_BURDEN"; }),
    mut(ok, function (c) { c.reasons = ["X"]; }),
    mut(inc, function (c) { c.reasons = ["FLOW_NEGATIVE"]; }),
    mut(ok, function (c) { delete c.verification; }),
    mut(ok, function (c) { c.verification.required = "false"; }),
    mut(ok, function (c) { c.verification.required = true; }),
    mut(inc, function (c) { c.verification.required = false; }),
    mut(inc, function (c) { c.verification.reasons = [{ code: "DEBT_PAYMENT_UNKNOWN", fact: "monthly_debt_payment", subject: "debt" }]; }),
    mut(inc, function (c) { c.verification.reasons[0].code = "lower_case"; }),
    mut(inc, function (c) { c.verification.reasons[0].subject = "company"; }),
    mut(inc, function (c) { c.verification.missing_facts = [{ fact: "monthly_debt_payment", subject: "debt" }]; }),
    mut(ok, function (c) { c.verification.missing_facts = [{ fact: "monthly_income", subject: "person" }]; }),
    mut(ok, function (c) { delete c.provenance; }),
    mut(ok, function (c) { c.provenance.classifier_version = ""; }),
    mut(ok, function (c) { delete c.provenance.contract; }),
    mut(ok, function (c) { delete c.financial_input_identity; }),
    mut(ok, function (c) { c.financial_input_identity.version = "financial_input_identity_v2"; }),
    mut(ok, function (c) { c.financial_input_identity.value = c.financial_input_identity.value.toUpperCase(); }),
    mut(ok, function (c) { c.financial_input_identity.value = "abc"; }),
  ].map(function (v) { return V(v) === null; });
  var extra = mut(ok, function (c) {
    c.canonical_facts = { monthly_income: 1 }; c.debug = 1; c.threshold_version = "T-v1";
    c.verification.debug = 1; c.provenance.income = { source: "handoff" }; c.financial_input_identity.canonical = "[]";
  });
  var accepted = [V(ok), V(inc), V(extra)];
  return {
    version_string_2_rejected: versionString2,
    version_others_rejected: versionOthers,
    rejected_all: rejected.every(Boolean), rejected: rejected,
    accepts_classified: !!accepted[0] && accepted[0].strategy === "CONSOLIDACION",
    accepts_incomplete_null_strategy: !!accepted[1] && accepted[1].strategy === null,
    copy_is_allowlisted: !!accepted[2] &&
      JSON.stringify(Object.keys(accepted[2])) === JSON.stringify(["survey_version", "classification_status", "strategy", "reasons", "verification", "provenance", "financial_input_identity"]) &&
      JSON.stringify(Object.keys(accepted[2].verification)) === JSON.stringify(["required", "reasons", "missing_facts"]) &&
      JSON.stringify(Object.keys(accepted[2].provenance)) === JSON.stringify(["classifier_version", "contract"]) &&
      JSON.stringify(Object.keys(accepted[2].financial_input_identity)) === JSON.stringify(["version", "value"]),
    detached: accepted[0] !== ok && accepted[0].reasons !== ok.reasons && accepted[0].verification !== ok.verification &&
      accepted[0].provenance !== ok.provenance,
  };
}

async function main() {
  var srv = await startStaticServer();
  var apis = {
    ok: await startApi(memoryDiagnosisRepository()),
    persistFail: await startApi(memoryDiagnosisRepository({ failStrategyInsert: true })),
  };
  var browser = await chromium.launch();
  var out = {};
  var matrix = null;
  var warn = console.warn;
  var serverWarnings = [];
  console.warn = function (m) { serverWarnings.push(String(m)); };
  try {
    for (var i = 0; i < SCENARIOS.length; i++) {
      out[SCENARIOS[i].name] = await runScenario(browser, srv.origin, SCENARIOS[i], apis);
    }
    var mp = await openScenario(browser, srv.origin, { name: "VALIDATOR", flag: true, shadow: false, journey: "V2" }, apis);
    matrix = await mp.page.evaluate(validatorMatrixInPage);
    await mp.context.close();
  } finally {
    console.warn = warn;
    await browser.close();
    srv.server.close();
    apis.ok.server.close();
    apis.persistFail.server.close();
  }

  // ---- every scenario: no visual change ----
  SCENARIOS.forEach(function (sc) {
    var r = out[sc.name];
    check(sc.name + ": real UI reached the dashboard (step 3, legacy plan " + r.state.plan_id + "), 0 pageerror",
      r.stateBefore.step === 3 && r.stateBefore.plan_id != null && r.errors.length === 0, { errors: r.errors, step: r.stateBefore.step });
    check(sc.name + ": POST /v1/diagnoses count = " + (sc.shadow ? 1 : 0) + " (timing unchanged)",
      r.postsAtResponse === (sc.shadow ? 1 : 0), r.postsAtResponse);
    check(sc.name + ": DOM identical right before vs after the response (body.outerHTML), 0 mutations, 0 render calls (" +
      r.wrapped + " render fns spied)",
      r.probes.dom === r.domBefore && r.probes.mutations === 0 && r.probes.renderCalls === 0 && r.wrapped > 0,
      { mutations: r.probes.mutations, samples: r.probes.samples, renders: r.probes.renders, diff: firstDiff(r.domBefore, r.probes.dom) });
    if (sc.shadow) {
      check(sc.name + ": legacy shadow comparison unchanged (MATCH)", r.state.stats.match === 1 && r.state.stats.error === 0, r.state.stats);
    }
    check(sc.name + ": no V2 in st.diag, localStorage/sessionStorage or new window globals",
      !r.state.in_diag && !r.state.in_storage && r.state.v2_globals.length === 0, { diag: r.state.in_diag, storage: r.state.in_storage, g: r.state.v2_globals });
    if (BASELINE[sc.name]) {
      var b = out[BASELINE[sc.name]];
      check(sc.name + ": normalized dashboard DOM == flag OFF run (" + BASELINE[sc.name] + ")",
        r.dashDom === b.dashDom, firstDiff(r.dashDom, b.dashDom));
      check(sc.name + ": window globals == flag OFF run",
        same(r.state.window_keys, b.state.window_keys),
        { added: r.state.window_keys.filter(function (k) { return b.state.window_keys.indexOf(k) === -1; }),
          removed: b.state.window_keys.filter(function (k) { return r.state.window_keys.indexOf(k) === -1; }) });
    }
  });

  // ---- flag OFF: V2 ignored although the server sends it ----
  var off = out.OFF_SHADOW_ON;
  check("flag OFF + shadow ON: server response carries v2_financial_strategy (backend contract is flag-independent)",
    hasV2(off.rec.posts[0].response) && off.rec.posts[0].response.v2_financial_strategy.survey_version === 2);
  check("[T11] flag OFF + shadow ON: frontend ignores it — CZState has no _v2FinancialStrategy key",
    off.state.has_key === false && off.state.value === "<absent>", off.state.value);
  check("flag OFF incomplete / V1: no _v2FinancialStrategy key",
    out.OFF_INCOMPLETE.state.has_key === false && out.OFF_V1.state.has_key === false);

  // ---- flag ON + classified ----
  var on = out.ON_CLASSIFIED;
  var onResp = on.rec.posts[0].response;
  var expected = classify(diagnosisServiceModule.extractEngineInput(JSON.parse(JSON.stringify(on.rec.posts[0].body))));
  check("ON + classified: response = projection of the classifier on the posted EngineInput (" + expected.strategy + ")",
    hasV2(onResp) && same(onResp.v2_financial_strategy, diagnosisServiceModule.projectV2FinancialStrategy(expected, 2,
      financialIdentity.deriveFinancialInputIdentity(diagnosisServiceModule.extractEngineInput(JSON.parse(JSON.stringify(on.rec.posts[0].body)))))) &&
    expected.classification_status === "classified", onResp && onResp.v2_financial_strategy);
  check("[T12] ON + classified: CZState._v2FinancialStrategy bound to journey, diagnosis, classifier_version, identity and input",
    on.state.has_key && same(Object.keys(on.state.value),
      ["journey_id", "diagnosis_id", "classifier_version", "financial_input_identity", "input_canonical", "result"]) &&
    on.state.value.classifier_version === onResp.v2_financial_strategy.provenance.classifier_version &&
    same(on.state.value.financial_input_identity, onResp.v2_financial_strategy.financial_input_identity) &&
    on.state.value.input_canonical === financialIdentity.canonicalizeFinancialInput(on.rec.posts[0].body) &&
    on.state.value.journey_id === on.rec.journeyId && on.state.active_journey === on.rec.journeyId &&
    on.state.value.diagnosis_id === onResp.diagnosis_id && same(on.state.value.result, onResp.v2_financial_strategy) &&
    on.state.value.result.survey_version === 2 && on.state.value.result.strategy === expected.strategy, on.state.value);
  check("ON: state is null while the diagnosis is in flight (set at attempt start)",
    on.stateBefore.has_key && on.stateBefore.value === null, on.stateBefore.value);
  check("[T16] journey change after A stored: cleared immediately (same tick as persistJourneyId)",
    on.switch.before && on.switch.before.journey_id === on.rec.journeyId && on.switch.immediately_after === null &&
    on.switch.active === JOURNEY_B, on.switch);
  check("[T18] journey B diagnosis fails (journey unknown to the server): state stays null, A never repopulated",
    on.afterB.value === null && on.afterB.stats.error === 1 && on.rec.posts.length === 2 && on.rec.posts[1].body.journey_id === JOURNEY_B &&
    on.rec.posts[1].status !== 200, { value: on.afterB.value, stats: on.afterB.stats, status: on.rec.posts[1] && on.rec.posts[1].status });

  // ---- flag ON + incomplete ----
  var inc = out.ON_INCOMPLETE;
  var incResp = inc.rec.posts[0].response;
  check("ON + incomplete: HTTP 200, v2_financial_strategy {survey_version 2, incomplete, strategy null}",
    inc.rec.posts[0].status === 200 && hasV2(incResp) && incResp.v2_financial_strategy.survey_version === 2 &&
    incResp.v2_financial_strategy.classification_status === "incomplete" && incResp.v2_financial_strategy.strategy === null,
    incResp && incResp.v2_financial_strategy);
  check("ON + incomplete: stored with strategy null, same legacy plan as flag OFF",
    inc.state.value && inc.state.value.journey_id === inc.rec.journeyId && inc.state.value.result.strategy === null &&
    inc.state.value.result.classification_status === "incomplete" && same(inc.state.value.result, incResp.v2_financial_strategy) &&
    inc.state.plan_id === out.OFF_INCOMPLETE.state.plan_id, inc.state.value);

  // ---- flag ON + persistence failure ----
  var pf = out.ON_PERSIST_FAIL;
  check("ON + persistence failure: HTTP 200, legacy result present, property absent",
    pf.rec.posts[0].status === 200 && pf.rec.posts[0].response.result && !hasV2(pf.rec.posts[0].response),
    Object.keys(pf.rec.posts[0].response || {}));
  check("[T15] ON + persistence failure: state null (nothing stored), legacy plan == flag OFF",
    pf.state.has_key && pf.state.value === null && pf.state.plan_id === off.state.plan_id, pf.state.value);
  check("server: persistence failure logged once as a structured code",
    serverWarnings.filter(function (w) { return w === "[v2-strategy] not recorded: DB_STRATEGY_EVALUATION_FAILED"; }).length === 1 &&
    serverWarnings.every(function (w) { return /^\[v2-strategy\] not recorded: [A-Z_]+$/.test(w); }), serverWarnings);

  // ---- flag ON + V1 ----
  var v1 = out.ON_V1;
  check("[T15] ON + V1: response without v2_financial_strategy, state null",
    !hasV2(v1.rec.posts[0].response) && v1.state.value === null, { keys: Object.keys(v1.rec.posts[0].response || {}), v: v1.state.value });

  // ---- flag ON + shadow OFF (known transitional limitation) ----
  var so = out.ON_SHADOW_OFF;
  check("[T19] ON + shadow OFF: no POST, no _v2FinancialStrategy key, DOM == flag OFF, 0 pageerror",
    so.rec.posts.length === 0 && so.state.has_key === false && so.errors.length === 0 && so.dashDom === off.dashDom,
    { posts: so.rec.posts.length, key: so.state.has_key });
  console.log("LIMITATION (documented, transitional): CZ_V2_STRATEGY_STATE_ENABLED=true + shadow OFF -> no POST /v1/diagnoses -> " +
    "no v2_financial_strategy -> CZState._v2FinancialStrategy never filled (observed: posts=" + so.rec.posts.length +
    ", has_key=" + so.state.has_key + ", pageerrors=" + so.errors.length + ", DOM equal to flag OFF=" + (so.dashDom === off.dashDom) + ")");

  // ---- journey A -> B while A is in flight ----
  var ab = out.ON_AB_LATE;
  check("[T16] A -> B mid-flight: state cleared/null the moment the journey changes",
    ab.midFlight.before === null && ab.midFlight.after === null && ab.midFlight.active === JOURNEY_B, ab.midFlight);
  check("[T17] A -> B mid-flight: A's late response (with V2) is discarded, B stays clean",
    hasV2(ab.rec.posts[0].response) && ab.rec.posts[0].body.journey_id === ab.rec.journeyId &&
    ab.state.value === null && ab.state.active_journey === JOURNEY_B && ab.state.stats.match === 1,
    { value: ab.state.value, active: ab.state.active_journey });

  // ---- reset while A is in flight ----
  var rs = out.ON_RESET_LATE;
  check("reset mid-flight: CZState replaced, A's late response written nowhere (new state has no key, old state null)",
    rs.oldState.replaced && rs.state.has_key === false && rs.oldState.old_value === null && hasV2(rs.rec.posts[0].response),
    { newKey: rs.state.has_key, old: rs.oldState });

  // ---- frontend validator (real code) ----
  check("[T13] frontend validator: survey_version \"2\" (string) rejected", matrix.version_string_2_rejected === true);
  check("[T14] frontend validator: survey_version null / absent / 1 / 3 / 2.5 rejected",
    Object.keys(matrix.version_others_rejected).every(function (k) { return matrix.version_others_rejected[k] === true; }),
    matrix.version_others_rejected);
  check("frontend validator: status/strategy coherence, closed reasons catalog, verification/provenance shape, previous contract shape rejected (" +
    matrix.rejected.length + " invalid inputs)", matrix.rejected_all, matrix.rejected);
  check("frontend validator: accepts classified and incomplete (strategy null); returns a detached allowlisted copy",
    matrix.accepts_classified && matrix.accepts_incomplete_null_strategy && matrix.copy_is_allowlisted && matrix.detached, matrix);

  // ---- static: no legacy reconstruction / no render in the V2 frontend code ----
  var src = fs.readFileSync(path.join(ROOT, "js", "shadowDiagnosis.js"), "utf8");
  var v2Block = src.slice(src.indexOf("V2-END-TO-END-WIRING-01"), src.indexOf("function getTimeoutMs"));
  check("frontend V2 code: no planId/scoreReset/nivelR/flow/mora/burden reads, no render/DOM calls",
    v2Block.length > 500 &&
      !/\b(planId|scoreReset|nivelR|flujoLibre|flujo|diag|deudas|gastos|ingreso)\b|renderAll|CredizonaUI|document\.|innerHTML|guardarLocal|localStorage/.test(v2Block));
  var appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  check("guardarLocal does not persist _v2FinancialStrategy (explicit key list)", appSrc.indexOf("_v2FinancialStrategy") === -1);

  console.log("summary: " + SCENARIOS.map(function (sc) {
    var r = out[sc.name];
    var v = r.state.value;
    return sc.name + " posts=" + r.rec.posts.length + " state=" + (v === "<absent>" ? "absent" : v === null ? "null" :
      v.result.classification_status + "/" + v.result.strategy) + " mut=" + r.probes.mutations + " renders=" + r.probes.renderCalls +
      " errors=" + r.errors.length;
  }).join(" | "));
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_WIRING_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  ANON: ANON,
  MOCK_API: MOCK_API,
  CORS: CORS,
  RAW_CONTEXTS: RAW_CONTEXTS,
  journeyService: journeyService,
  memoryDiagnosisRepository: memoryDiagnosisRepository,
  startApi: startApi,
  forward: forward,
  startStaticServer: startStaticServer,
  toDashboard: toDashboard,
  pageState: pageState,
};
