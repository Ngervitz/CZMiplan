/**
 * dev/plus-deploy-smoke.js — PRE-DEPLOY-GATE-01 smoke for a live Vercel deployment.
 *
 * Run ONLY right after a deploy, never as part of the local QA batch:
 *   node dev/plus-deploy-smoke.js --mode=production --base=https://cz-miplan2.vercel.app --confirm
 *   node dev/plus-deploy-smoke.js --mode=preview --base=https://<preview-host> --confirm
 *     PLUS_SMOKE_SECRET=<new preview proxy secret>   optional; enables the zero-cost gate probe
 *     PLUS_SMOKE_ALLOW_PROVIDER_CALL=1               optional (preview only): one synthetic paid call
 *   --skip-browser      API + public-asset checks only
 *   --local-rehearsal   abort every third-party request (for rehearsing against a loopback server)
 *
 * Synthetic data only. Secrets are read from env / git history and never printed. In the browser,
 * the Railway backend is aborted (no production DB writes) and GA4 / Meta hits are captured then
 * aborted (no analytics pollution).
 */
"use strict";
var cp = require("child_process");
var path = require("path");

var args = {};
process.argv.slice(2).forEach(function(a) {
  var m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
});
var mode = args.mode;
var base = String(args.base || "").replace(/\/+$/, "");
if ((mode !== "production" && mode !== "preview") || !/^https?:\/\//.test(base) || !args.confirm) {
  console.error("usage: node dev/plus-deploy-smoke.js --mode=production|preview --base=<url> --confirm [--skip-browser]");
  process.exit(2);
}

var root = path.join(__dirname, "..");
var passed = 0;
var failed = 0;
function ok(label, cond) {
  console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
  if (cond) passed++; else failed++;
}

function legacySecret() {
  try {
    var cfg = cp.execSync("git show f2f169e:js/config.js", { cwd: root, encoding: "utf8" });
    var m = /CZ_PLUS_PROXY_CLIENT_SECRET\s*=\s*"([^"]*)"/.exec(cfg);
    return m ? m[1] : "";
  } catch (e) { return ""; }
}

var SYNTHETIC_CONTEXT = { meta: { fuente: "deploy_smoke", synthetic: true }, usuario: { ingreso_declarado: 1 } };

async function postGenerate(body, headers) {
  var res = await fetch(base + "/api/plus/generate", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
    body: JSON.stringify(body),
  });
  var json = await res.json().catch(function() { return null; });
  return { status: res.status, body: json };
}

async function apiChecks() {
  var get = await fetch(base + "/api/plus/generate", { method: "GET" });
  ok("API GET is not served as a generator (405)", get.status === 405);

  if (mode === "production") {
    var r = await postGenerate({ report_type: "plus", context: SYNTHETIC_CONTEXT },
      { "x-cz-plus-secret": "deploy-smoke-not-a-secret" });
    ok("TEST 1 production POST → 403 plus_generate_disabled",
      r.status === 403 && r.body && r.body.ok === false && r.body.error === "plus_generate_disabled");
    ok("TEST 1 no provider output in response",
      !!r.body && r.body.text === undefined && r.body.usage === undefined);
    return;
  }

  var noHeader = await postGenerate({ report_type: "plus", context: SYNTHETIC_CONTEXT });
  ok("PREVIEW without secret header is denied (401/500, no provider output)",
    (noHeader.status === 401 || noHeader.status === 500) && !!noHeader.body && noHeader.body.text === undefined);
  var wrong = await postGenerate({ report_type: "plus", context: SYNTHETIC_CONTEXT },
    { "x-cz-plus-secret": "deploy-smoke-wrong-secret" });
  ok("PREVIEW with wrong secret is denied", wrong.status === 401 || wrong.status === 500);

  var smokeSecret = process.env.PLUS_SMOKE_SECRET || "";
  var legacy = legacySecret();
  if (legacy) {
    var old = await postGenerate({ report_type: "smoke_gate_probe", context: {} }, { "x-cz-plus-secret": legacy });
    ok("PREVIEW rejects the legacy (public) secret", old.status === 401);
  }
  if (!smokeSecret) {
    console.log("[SKIP] PLUS_SMOKE_SECRET not set: gate probe with the new secret not run");
    return;
  }
  var probe = await postGenerate({ report_type: "smoke_gate_probe", context: {} }, { "x-cz-plus-secret": smokeSecret });
  ok("PREVIEW new secret passes env + secret gates (400 invalid_report_type, zero provider cost)",
    probe.status === 400 && probe.body && probe.body.error === "invalid_report_type");
  if (process.env.PLUS_SMOKE_ALLOW_PROVIDER_CALL === "1") {
    var paid = await postGenerate({ report_type: "plus", context: SYNTHETIC_CONTEXT }, { "x-cz-plus-secret": smokeSecret });
    ok("PREVIEW synthetic provider call succeeds (paid)", paid.status === 200 && paid.body && paid.body.ok === true);
  }
}

async function publicAssetChecks() {
  var legacy = legacySecret();
  var smokeSecret = process.env.PLUS_SMOKE_SECRET || "";
  ok("legacy secret available for the scan", legacy.length >= 8);

  var html = await (await fetch(base + "/")).text();
  var srcs = ["/js/config.js"];
  var re = /<script[^>]+src="([^"]+)"/g;
  var m;
  while ((m = re.exec(html))) {
    if (/^https?:\/\//.test(m[1])) continue;
    srcs.push(m[1].charAt(0) === "/" ? m[1] : "/" + m[1]);
  }
  var bodies = [{ path: "/", text: html }];
  for (var i = 0; i < srcs.length; i++) {
    var res = await fetch(base + srcs[i]);
    bodies.push({ path: srcs[i], text: res.ok ? await res.text() : "" });
  }
  var cfg = bodies.filter(function(b) { return b.path === "/js/config.js"; })[0].text;
  ok("public config.js served", cfg.length > 1000);
  ok("public config.js: empty client secret", /var CZ_PLUS_PROXY_CLIENT_SECRET = "";/.test(cfg));
  ok("public config.js: test UI flag off", /var CZ_PLUS_TEST_UI_ENABLED = false;/.test(cfg));
  ok("public config.js: payment not live", /var CZ_PLUS_PAYMENT_LIVE = false;/.test(cfg));
  var leak = bodies.filter(function(b) {
    return (legacy && b.text.indexOf(legacy) !== -1) || (smokeSecret && b.text.indexOf(smokeSecret) !== -1);
  }).length;
  ok("no proxy secret (legacy or new) in " + bodies.length + " public HTML/JS assets", leak === 0);
}

async function browserChecks() {
  var playwright;
  try { playwright = require("playwright"); } catch (e) {
    ok("playwright available for TEST 2/3", false);
    return;
  }
  var browser = await playwright.chromium.launch();
  var context = await browser.newContext();
  var page = await context.newPage();
  var analyticsHits = [];
  var backendBlocked = 0;
  var baseOrigin = new URL(base).origin;
  await context.route("**/*", function(route) {
    var url = route.request().url();
    var req = route.request();
    if (new URL(url).origin === baseOrigin) return route.continue();
    if (args["local-rehearsal"]) return route.abort();
    if (/\.railway\.app\//.test(url)) { backendBlocked++; return route.abort(); }
    var staticGet = req.method() === "GET" && ["script", "stylesheet", "font", "image"].indexOf(req.resourceType()) !== -1;
    if (!staticGet || /\/collect\b|facebook\.com\/tr/.test(url)) {
      analyticsHits.push(url + "\n" + (req.postData() || ""));
      return route.abort();
    }
    return route.continue();
  });

  async function snapshot() {
    return page.evaluate(function() {
      var st = window.CZState || {};
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem("cr_v3") || "null"); } catch (e) { saved = "unparseable"; }
      return {
        search: location.search,
        plus_purchased: st.plus_purchased,
        plus_status: st.plus_status,
        plus_purchased_at: st.plus_purchased_at,
        pending: st._plusPaymentPendingConfirmation === true,
        completer: typeof window.completarCompraPlus,
        saved_plus_purchased: saved && saved.plus_purchased,
        saved_plus_status: saved && saved.plus_status,
        testUiFlag: typeof CZ_PLUS_TEST_UI_ENABLED === "undefined" ? "undefined" : CZ_PLUS_TEST_UI_ENABLED,
        dataLayer: (window.dataLayer || []).map(function(e) {
          return { event: e && e.event, value: e && e.value, currency: e && e.currency };
        }),
      };
    });
  }

  await page.goto(base + "/?source=seo_ia&plus_payment=success", { waitUntil: "load" });
  await page.waitForTimeout(4000);
  var s1 = await snapshot();
  ok("TEST 2 query param cleaned from URL", s1.search.indexOf("plus_payment") === -1);
  ok("TEST 2 no Plus grant in state (plus_purchased false, no PLUS_PROCESSING)",
    s1.plus_purchased === false && s1.plus_status === null && s1.plus_purchased_at === null);
  ok("TEST 2 no purchase persisted", s1.saved_plus_purchased !== true && s1.saved_plus_status !== "PLUS_PROCESSING");
  ok("TEST 2 at most a transient pending flag; no client completer", s1.completer === "undefined");
  ok("TEST 2 test UI flag off in the live bundle", s1.testUiFlag === false);

  var tabText = await page.evaluate(function() {
    try { if (typeof switchTab === "function") switchTab("plus"); } catch (e) { /* onboarding view */ }
    return {
      testButton: !!document.getElementById("btn-plus-test-generar"),
      text: document.body ? document.body.innerText : "",
    };
  });
  ok("TEST 2 no AI test button rendered", tabText.testButton === false);
  console.log("[INFO] Plus tab shows pending notice: "
    + (tabText.text.indexOf("Pago pendiente de confirmación") !== -1 ? "yes" : "not visible in this view"));

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(3000);
  var s2 = await snapshot();
  ok("TEST 2 refresh: still no grant, pending flag gone",
    s2.plus_purchased === false && s2.plus_status === null && s2.pending === false);

  var commercial = s1.dataLayer.concat(s2.dataLayer).filter(function(e) {
    return /purchase|conversion|revenue|payment_success|checkout/i.test(String(e.event || ""))
      || e.value !== undefined || e.currency !== undefined;
  });
  ok("TEST 3 dataLayer: no plus_purchased / purchase / revenue event", commercial.length === 0);
  var purchaseHits = analyticsHits.filter(function(h) {
    return /en=purchase\b|"en":"purchase"|ev=Purchase\b|ep\.value=|[?&]cu=|plus_purchased|transaction_id|revenue/i.test(h);
  });
  ok("TEST 3 no GA4 / Meta / CRM purchase hit (" + analyticsHits.length + " third-party beacons captured and aborted)",
    purchaseHits.length === 0);
  console.log("[INFO] Railway backend requests aborted: " + backendBlocked);

  await browser.close();
}

(async function() {
  console.log("plus-deploy-smoke mode=" + mode + " base=" + base);
  await apiChecks();
  await publicAssetChecks();
  if (!args["skip-browser"]) await browserChecks();
  console.log("");
  console.log("PASSED: " + passed + "/" + (passed + failed));
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(e) {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
