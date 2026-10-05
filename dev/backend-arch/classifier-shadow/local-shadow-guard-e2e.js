/**
 * local-shadow-guard-e2e.js — V2-HARNESS-SAFETY-AND-STRATEGY-DEDUP-01.
 *
 * The committed js/config.js points CZ_BACKEND_API_URL at production with CZ_SHADOW_MODE on;
 * a page served from localhost must not auto-shadow into it. Every non-origin request is
 * aborted here, so nothing leaves the machine; /v1/* attempts are counted.
 *
 * node dev/backend-arch/classifier-shadow/local-shadow-guard-e2e.js
 */
"use strict";

var chromium = require("playwright").chromium;
var e2e = require("./v2-wiring-e2e");

var PROD_API = "https://backend-production-17f9.up.railway.app";

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 800) : ""));
}

async function open(browser, origin, localConfig, query) {
  var rec = { v1: [], external: {} };
  var context = await browser.newContext({ locale: "es-UY" });
  await context.route("**/*", async function (route) {
    var url = route.request().url();
    try {
      if (url.indexOf(origin + "/js/config.local.js") === 0) {
        if (localConfig == null) return await route.fulfill({ status: 404, body: "" });
        return await route.fulfill({ status: 200, contentType: "application/javascript", body: localConfig });
      }
      if (url.indexOf(origin) === 0) return await route.continue();
      if (/^https?:/.test(url)) {
        rec.external[new URL(url).host] = true;
        if (url.indexOf("/v1/") !== -1) rec.v1.push(route.request().method() + " " + url);
      }
      return await route.abort();
    } catch (_e) {
      /* context closed */
    }
  });
  var page = await context.newPage();
  await page.goto(origin + "/?ingreso=50000&p1=B&p2=B&p3=B&p4=B&p5=B&p6=A&p7=B&p8=B&p9=B&p10=B" + (query || ""));
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

function shadowInfo() {
  var s = window.CZShadowDiagnosis;
  return { enabled: s.isShadowEnabled(), api: s.getApiBaseUrl() };
}

async function driveToDashboard(page) {
  if (await page.isVisible("#inp-profile-nombre")) await page.fill("#inp-profile-nombre", "QA Local Guard");
  if (await page.isVisible("#inp-profile-email")) await page.fill("#inp-profile-email", "qa-local-guard@example.test");
  if (await page.isVisible("#inp-ingreso-mensual")) {
    await page.fill("#inp-ingreso-mensual", "50000");
    await page.press("#inp-ingreso-mensual", "Tab");
  }
  await e2e.toDashboard(page, "complete");
  await page.waitForTimeout(1500);
}

async function main() {
  var stat = await e2e.startStaticServer();
  var browser = await chromium.launch();
  try {
    // [A] committed config only (no config.local.js): the exact state of an ad-hoc local QA run.
    var a = await open(browser, stat.origin, null);
    var ai = await a.page.evaluate(shadowInfo);
    await driveToDashboard(a.page);
    var aStep = await a.page.evaluate(function () { return window.CZState.step; });
    check("[A] localhost + committed config (production API, CZ_SHADOW_MODE on) -> auto-shadow OFF",
      ai.api === PROD_API && ai.enabled === false, ai);
    check("[A] full flow to dashboard (step 3) sends 0 /v1 requests", aStep === 3 && a.rec.v1.length === 0, { step: aStep, v1: a.rec.v1 });
    await a.context.close();

    // [B] positive control: reserved mock host -> enabled, and the same flow does attempt /v1/diagnoses.
    var b = await open(browser, stat.origin, "CZ_BACKEND_API_URL = " + JSON.stringify(e2e.MOCK_API) + "; CZ_SHADOW_MODE = true;");
    var bi = await b.page.evaluate(shadowInfo);
    await driveToDashboard(b.page);
    check("[B] localhost + reserved .test API -> auto-shadow ON (dev/e2e keeps working)", bi.enabled === true, bi);
    check("[B] control: the same flow does attempt POST /v1/diagnoses (so [A]'s 0 is meaningful)",
      b.rec.v1.some(function (r) { return r.indexOf("POST " + e2e.MOCK_API + "/v1/diagnoses") === 0; }), b.rec.v1);
    await b.context.close();

    // [C] localhost + production API set explicitly in config.local.js -> still OFF.
    var c = await open(browser, stat.origin, "CZ_BACKEND_API_URL = " + JSON.stringify(PROD_API) + "; CZ_SHADOW_MODE = true;");
    var ci = await c.page.evaluate(shadowInfo);
    await driveToDashboard(c.page);
    check("[C] localhost + production API in config.local.js -> auto-shadow OFF, 0 /v1 requests",
      ci.enabled === false && c.rec.v1.length === 0, { info: ci, v1: c.rec.v1 });
    await c.context.close();

    // [D] other API hosts: only loopback / reserved names auto-enable on localhost.
    var hosts = [
      ["http://127.0.0.1:8787", true], ["http://localhost:8787", true], ["http://[::1]:8787", true],
      ["http://api.localhost", true], ["http://x.invalid", true],
      ["https://staging.example.com", false], ["https://miplan-mock.test.evil.com", false], ["https://127.0.0.1.nip.io", false],
    ];
    for (var i = 0; i < hosts.length; i++) {
      var d = await open(browser, stat.origin, "CZ_BACKEND_API_URL = " + JSON.stringify(hosts[i][0]) + "; CZ_SHADOW_MODE = true;");
      var di = await d.page.evaluate(shadowInfo);
      check("[D] localhost + API " + hosts[i][0] + " -> auto-shadow " + (hosts[i][1] ? "ON" : "OFF"), di.enabled === hosts[i][1], di);
      await d.context.close();
    }

    // [E] kill switch still wins for a non-production API.
    var e = await open(browser, stat.origin, "CZ_BACKEND_API_URL = " + JSON.stringify(e2e.MOCK_API) + "; CZ_SHADOW_MODE = false;");
    var ei = await e.page.evaluate(shadowInfo);
    check("[E] CZ_SHADOW_MODE=false -> OFF even with a mock API", ei.enabled === false, ei);
    await e.context.close();

    // [F] explicit ?cz_shadow=1 remains an operator override (documented residual, not auto).
    var f = await open(browser, stat.origin, null, "&cz_shadow=1");
    var fi = await f.page.evaluate(shadowInfo);
    check("[F] ?cz_shadow=1 is an explicit operator override (ON; requires the query, never implicit)", fi.enabled === true, fi);
    await f.context.close();
  } finally {
    await browser.close();
    stat.server.close();
  }
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("LOCAL_SHADOW_GUARD_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
