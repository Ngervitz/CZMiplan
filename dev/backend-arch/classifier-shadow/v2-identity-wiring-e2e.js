/**
 * V2-FINANCIAL-IDENTITY-AND-WIRING-01 — wiring tests 11–17 (+ classifier_version binding).
 *
 * Real Mi Plan frontend (Playwright) against the real Express app with memory repositories
 * (helpers from v2-wiring-e2e.js). One V2 journey session drives real UI paths: dashboard,
 * debt quick edit, recalc save, refresh. POST /v1/diagnoses responses can be held to create
 * in-flight edits and late responses. No network beyond 127.0.0.1, no DB. Typed amounts are plain
 * digits, read the same by every amount parser of the app.
 *
 * Usage: node dev/backend-arch/classifier-shadow/v2-identity-wiring-e2e.js
 */
"use strict";

var path = require("path");
var fs = require("fs");
var chromium = require("playwright").chromium;

var h = require("./v2-wiring-e2e");
var sanitize = require("../../../server/modules/journey/sanitizeContext");
var financialIdentity = require("../../../server/modules/diagnosis/financialIdentity");
var classifier = require("../../../engine/classifier/financial-classifier");

var ROOT = path.join(__dirname, "..", "..", "..");
var NEXT_CLASSIFIER = "miplan-financial-classifier-next-test";

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}

async function openSession(browser, origin, name, flag, apis) {
  var journey = await h.journeyService.createFromHandoffRedeem(h.ANON, "v2-identity-" + name, JSON.parse(JSON.stringify(h.RAW_CONTEXTS.V2)));
  var rec = { journeyId: journey.journey_id, posts: [], pending: [], errors: [], holdNext: 0, api: apis.ok };
  var context = await browser.newContext({ locale: "es-UY" });
  await context.addInitScript(function (anon) {
    try { if (!localStorage.getItem("cz_anonymous_id")) localStorage.setItem("cz_anonymous_id", anon); } catch (_e) { /* ignore */ }
  }, h.ANON);
  await context.route("**/*", async function (route) {
    var req = route.request();
    var url = req.url();
    try {
      if (url.indexOf(origin + "/js/config.local.js") === 0) {
        return await route.fulfill({ status: 200, contentType: "application/javascript",
          body: "CZ_BACKEND_API_URL = " + JSON.stringify(h.MOCK_API) + "; CZ_SHADOW_MODE = true; CZ_V2_STRATEGY_STATE_ENABLED = " + flag + ";" });
      }
      if (url.indexOf(origin) === 0) return await route.continue();
      if (url.indexOf(h.MOCK_API) === 0) {
        if (req.method() === "OPTIONS") return await route.fulfill({ status: 204, headers: h.CORS });
        var p = url.slice(h.MOCK_API.length);
        if (p.indexOf("/v1/handoff/redeem") === 0) {
          return await route.fulfill({ status: 200, headers: h.CORS, contentType: "application/json",
            body: JSON.stringify({ ok: true, journey_id: rec.journeyId, cached: false, durable: true,
              context: sanitize.sanitizeHandoffContext(JSON.parse(JSON.stringify(h.RAW_CONTEXTS.V2))) }) });
        }
        var isDiag = req.method() === "POST" && p.split("?")[0] === "/v1/diagnoses";
        var fwd = await h.forward(rec.api.port, req.method(), p, req.headers(), req.postData());
        if (isDiag) {
          rec.posts.push({ body: JSON.parse(req.postData()), status: fwd.status, response: fwd.json });
          if (rec.holdNext > 0) {
            rec.holdNext -= 1;
            await new Promise(function (resolve) { rec.pending.push(resolve); });
          }
        }
        return await route.fulfill({ status: fwd.status, headers: h.CORS, contentType: "application/json", body: fwd.raw });
      }
      return await route.abort();
    } catch (_e) {
      /* context closed */
    }
  });
  var page = await context.newPage();
  page.on("pageerror", function (e) { rec.errors.push(String(e && e.message)); });
  await page.goto(origin + "/e/v2-identity-" + name);
  await waitBooted(page);
  if (await page.$("#btn-miplan-consent-accept")) {
    await page.check("#chk-miplan-tc");
    await page.check("#chk-miplan-privacy");
    await page.click("#btn-miplan-consent-accept");
    await page.waitForTimeout(300);
  }
  return { context: context, page: page, rec: rec };
}

async function waitBooted(page) {
  await page.waitForFunction(function () {
    return !!(window.CZState && window.CZState.temporal && window.CZState.temporal.session_count >= 1);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
}

function processed(page) {
  return page.evaluate(function () {
    var s = window.CZShadowDiagnosis.getStats();
    return s.match + s.mismatch + s.error;
  });
}

async function waitProcessed(page, n) {
  await page.waitForFunction(function (count) {
    var s = window.CZShadowDiagnosis.getStats();
    return s.match + s.mismatch + s.error >= count;
  }, n, { timeout: 15000 });
  await page.waitForTimeout(150);
}

async function waitPosts(rec, n, page) {
  var t0 = Date.now();
  while (rec.posts.length < n && Date.now() - t0 < 15000) await page.waitForTimeout(40);
  return rec.posts.length >= n;
}

async function waitPending(rec, n, page) {
  var t0 = Date.now();
  while (rec.pending.length < n && Date.now() - t0 < 15000) await page.waitForTimeout(40);
  return rec.pending.length >= n;
}

function release(rec) {
  var fns = rec.pending.splice(0);
  fns.forEach(function (f) { f(); });
}

function v2(page) {
  return page.evaluate(function () {
    var st = window.CZState;
    var raw = Object.prototype.hasOwnProperty.call(st, "_v2FinancialStrategy") ? st._v2FinancialStrategy : "<absent>";
    return {
      raw: raw === undefined ? "<absent>" : JSON.parse(JSON.stringify(raw)),
      current: window.CZShadowDiagnosis.getCurrentV2Strategy(),
      canonical: window.CZFinancialInputIdentity.canonicalizeFinancialInput(window.CZShadowDiagnosis.buildEngineInput(st)),
      journey: window.CZHandoffEntry.getCurrentJourneyId(),
      stats: window.CZShadowDiagnosis.getStats(),
      step: st.step,
    };
  });
}

async function quickEditMonto(page, raw) {
  if (!(await page.$('[data-deuda-quick-edit-trigger="0"]'))) {
    await page.click('[data-tab="deudas"]');
    await page.waitForSelector('[data-deuda-quick-edit-trigger="0"]', { timeout: 10000 });
  }
  await page.click('[data-deuda-quick-edit-trigger="0"]');
  await page.waitForSelector('[data-editar-deuda="0"]', { timeout: 10000 });
  await page.fill('[data-editar-deuda="0"]', raw);
  await page.press('[data-editar-deuda="0"]', "Enter");
  await page.waitForTimeout(60);
}

function diffKeys(a, b, prefix, out) {
  out = out || [];
  prefix = prefix || "";
  if (a && b && typeof a === "object" && typeof b === "object") {
    Object.keys(Object.assign({}, a, b)).forEach(function (k) { diffKeys(a[k], b[k], prefix ? prefix + "." + k : k, out); });
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(prefix);
  }
  return out;
}

function lastResp(rec) {
  return rec.posts[rec.posts.length - 1].response;
}
function serverIdentity(post) {
  return financialIdentity.deriveFinancialInputIdentity(
    require("../../../server/modules/diagnosis/service").extractEngineInput(JSON.parse(JSON.stringify(post.body)))).value;
}

async function main() {
  var srv = await h.startStaticServer();
  var apis = {
    ok: await h.startApi(h.memoryDiagnosisRepository()),
    persistFail: await h.startApi(h.memoryDiagnosisRepository({ failStrategyInsert: true })),
    next: await h.startApi(h.memoryDiagnosisRepository(), {
      classifyFn: function (input) {
        var r = classifier.classifyFinancialShadow(input);
        r.classifier_version = NEXT_CLASSIFIER;
        return r;
      },
    }),
  };
  var browser = await chromium.launch();
  var warn = console.warn;
  console.warn = function () {};
  try {
    // ================= flag ON session =================
    var o = await openSession(browser, srv.origin, "on", true, apis);
    var page = o.page;
    var rec = o.rec;
    await h.toDashboard(page, "classified");
    await waitPosts(rec, 1, page);
    await waitProcessed(page, 1);
    await page.waitForFunction(function () { return !document.querySelector(".cz-celebration-root"); }, null, { timeout: 10000 });
    var s1 = await v2(page);
    var r1 = lastResp(rec);
    check("setup: dashboard -> 1 POST, V2 state bound to journey / diagnosis / classifier_version / identity / current input",
      rec.posts.length === 1 && s1.raw && s1.raw.diagnosis_id === r1.diagnosis_id && s1.raw.journey_id === rec.journeyId &&
      s1.raw.classifier_version === classifier.CLASSIFIER_VERSION &&
      s1.raw.financial_input_identity.value === serverIdentity(rec.posts[0]) &&
      s1.raw.input_canonical === s1.canonical && s1.current && s1.current.diagnosis_id === r1.diagnosis_id,
      { raw: s1.raw, posts: rec.posts.length });

    // ---- [11] identical save ----
    rec.holdNext = 1;
    var before11 = rec.posts.length;
    var done11 = await processed(page);
    await page.evaluate(function () { window.recalcDiagYGuardar(); });
    var sent11 = await waitPending(rec, 1, page);
    rec.holdNext = 0;
    var s11mid = await v2(page);
    release(rec);
    if (sent11) await waitProcessed(page, done11 + 1);
    var s11a = await v2(page);
    var changedKeys = sent11 ? diffKeys(rec.posts[before11 - 1].body, rec.posts[before11].body) : [];
    console.log("INFO  identical save: legacy fingerprint " + (sent11 ? "changed -> POST sent; EngineInput paths that differed: " +
      JSON.stringify(changedKeys) : "unchanged -> no POST"));
    check("[11] identical save -> no semantic invalidation (state kept while in flight and after; same identity)",
      s11mid.raw && s11mid.raw.financial_input_identity.value === s1.raw.financial_input_identity.value && s11mid.current !== null &&
      s11a.raw && s11a.raw.financial_input_identity.value === s1.raw.financial_input_identity.value && s11a.current !== null &&
      (!sent11 || s11a.raw.diagnosis_id === lastResp(rec).diagnosis_id), { mid: s11mid.raw, after: s11a.raw, sent: sent11 });

    // ---- [11]+[16] semantic duplicate: cosmetic-only change posts a new diagnosis ----
    rec.holdNext = 1;
    var before11b = rec.posts.length;
    var done11b = await processed(page);
    await page.evaluate(function () {
      var d = window.CZState.deudas[0];
      d.acreedor_raw = "  BANCO   qa ";
      d.updated_at = new Date(Date.now() + 86400000).toISOString();
      window.recalcDiagYGuardar();
    });
    await waitPending(rec, 1, page);
    var s11b = await v2(page);
    check("[11] cosmetic-only save (creditor case/spaces, timestamp) -> POST sent, state NOT invalidated while in flight",
      rec.posts.length === before11b + 1 && s11b.raw && s11b.raw.diagnosis_id === s11a.raw.diagnosis_id && s11b.current !== null &&
      s11b.canonical === s1.canonical, { raw: s11b.raw, posts: rec.posts.length - before11b });
    release(rec);
    await waitProcessed(page, done11b + 1);
    var s16 = await v2(page);
    var r2 = lastResp(rec);
    check("[16] duplicate diagnosis for the same input -> state follows the new diagnosis_id, same identity, still current",
      r2.diagnosis_id !== r1.diagnosis_id && s16.raw.diagnosis_id === r2.diagnosis_id &&
      s16.raw.financial_input_identity.value === s1.raw.financial_input_identity.value && s16.current !== null,
      { raw: s16.raw });
    rec.api = apis.persistFail;
    var before16 = rec.posts.length;
    var done16 = await processed(page);
    await page.evaluate(function () {
      window.CZShadowDiagnosis._resetDedupeForTests();
      window.CZShadowDiagnosis.maybeShadowDiagnosis(window.CZState, "dup_without_v2");
    });
    await waitPosts(rec, before16 + 1, page);
    await waitProcessed(page, done16 + 1);
    var s16b = await v2(page);
    check("[16] duplicate diagnosis whose response has no V2 (write unconfirmed) -> state for the same input kept",
      rec.posts.length === before16 + 1 && !Object.prototype.hasOwnProperty.call(lastResp(rec), "v2_financial_strategy") &&
      s16b.raw && s16b.raw.diagnosis_id === r2.diagnosis_id && s16b.current !== null, { raw: s16b.raw });
    rec.api = apis.ok;

    // ---- [10 wiring] same identity, different classifier_version ----
    rec.api = apis.next;
    var before10 = rec.posts.length;
    var done10 = await processed(page);
    await page.evaluate(function () {
      window.CZShadowDiagnosis._resetDedupeForTests();
      window.CZShadowDiagnosis.maybeShadowDiagnosis(window.CZState, "classifier_bump");
    });
    await waitPosts(rec, before10 + 1, page);
    await waitProcessed(page, done10 + 1);
    var s10 = await v2(page);
    check("[10] same identity, new classifier_version -> state rebound to the new classifier_version (old one no longer held)",
      s10.raw.classifier_version === NEXT_CLASSIFIER && s10.raw.financial_input_identity.value === s1.raw.financial_input_identity.value &&
      s10.raw.diagnosis_id === lastResp(rec).diagnosis_id, { raw: s10.raw });
    rec.api = apis.ok;

    // ---- [13] quick edit ----
    var before13 = rec.posts.length;
    var done13 = await processed(page);
    await quickEditMonto(page, "90000");
    await waitPosts(rec, before13 + 1, page);
    await waitProcessed(page, done13 + 1);
    var s13 = await v2(page);
    var p13 = rec.posts[rec.posts.length - 1];
    check("[13] quick edit of a debt balance -> POST /v1/diagnoses with the new balance, state bound to the new identity",
      rec.posts.length === before13 + 1 && String(p13.body.deudas[0].monto) === "90000" &&
      s13.raw && s13.raw.diagnosis_id === p13.response.diagnosis_id &&
      s13.raw.financial_input_identity.value === serverIdentity(p13) &&
      s13.raw.financial_input_identity.value !== s1.raw.financial_input_identity.value &&
      s13.raw.input_canonical === s13.canonical && s13.current !== null && o.rec.errors.length === 0,
      { posts: rec.posts.length - before13, monto: p13 && p13.body.deudas[0].monto, raw: s13.raw, errors: rec.errors });

    // ---- [17] real identity change ----
    var stale = await page.evaluate(function () {
      window.CZState.gastos.vivienda = "21000";
      return window.CZShadowDiagnosis.getCurrentV2Strategy();
    });
    rec.holdNext = 1;
    var done17 = await processed(page);
    await page.evaluate(function () { window.recalcDiagYGuardar(); });
    await waitPending(rec, 1, page);
    var s17mid = await v2(page);
    release(rec);
    await waitProcessed(page, done17 + 1);
    var s17 = await v2(page);
    check("[17] real identity change -> previous state stops being current at once (accessor null before any request)",
      stale === null, stale);
    check("[17] ... cleared when the request for the new identity starts, then replaced by the new identity",
      s17mid.raw === null && s17.raw && s17.raw.financial_input_identity.value === serverIdentity(rec.posts[rec.posts.length - 1]) &&
      s17.raw.financial_input_identity.value !== s13.raw.financial_input_identity.value && s17.current !== null,
      { mid: s17mid.raw, after: s17.raw });

    // ---- [14] + [15] edit while in flight, late response of the previous input ----
    rec.holdNext = 2;
    var before14 = rec.posts.length;
    var done14 = await processed(page);
    await quickEditMonto(page, "80000");
    await waitPending(rec, 1, page);
    await quickEditMonto(page, "70000");
    await page.waitForTimeout(500);
    var s14mid = await v2(page);
    check("[14] edit while a request is in flight -> not sent concurrently (single flight), not lost (pending rerun)",
      rec.posts.length === before14 + 1 && String(rec.posts[before14].body.deudas[0].monto) === "80000" && s14mid.raw === null,
      { posts: rec.posts.length - before14 });
    release(rec);
    await waitPosts(rec, before14 + 2, page);
    await waitPending(rec, 1, page);
    var s15mid = await v2(page);
    var respA = rec.posts[before14].response;
    check("[15] late response for the previous input (80.000, with a valid V2) -> discarded, never stored",
      respA && respA.v2_financial_strategy && s15mid.raw === null && s15mid.stats.match + s15mid.stats.error >= done14 + 1,
      { raw: s15mid.raw });
    release(rec);
    await waitProcessed(page, done14 + 2);
    var s14 = await v2(page);
    var pB = rec.posts[before14 + 1];
    check("[14] the latest input (70.000) is re-diagnosed after the in-flight request and becomes the V2 state",
      String(pB.body.deudas[0].monto) === "70000" && s14.raw && s14.raw.diagnosis_id === pB.response.diagnosis_id &&
      s14.raw.financial_input_identity.value === serverIdentity(pB) &&
      s14.raw.financial_input_identity.value !== serverIdentity(rec.posts[before14]) &&
      s14.raw.input_canonical === s14.canonical && s14.current !== null,
      { raw: s14.raw, monto: pB && pB.body.deudas[0].monto });

    // ---- [12] refresh + same input ----
    var beforeRefresh = rec.posts.length;
    await page.reload();
    await waitBooted(page);
    await waitPosts(rec, beforeRefresh + 1, page);
    await waitProcessed(page, 1);
    var s12 = await v2(page);
    var pR = rec.posts[rec.posts.length - 1];
    check("[12] refresh with the same input -> state recovered for the same journey and identity (new diagnosis_id)",
      s12.step === 3 && rec.posts.length === beforeRefresh + 1 && pR.body.journey_id === rec.journeyId &&
      s12.raw && s12.raw.financial_input_identity.value === s14.raw.financial_input_identity.value &&
      s12.raw.diagnosis_id === pR.response.diagnosis_id && s12.raw.diagnosis_id !== s14.raw.diagnosis_id &&
      s12.raw.journey_id === rec.journeyId && s12.current !== null,
      { step: s12.step, posts: rec.posts.length - beforeRefresh, raw: s12.raw, journey: s12.journey });
    check("session: 0 pageerror, legacy shadow comparisons all MATCH (no SHADOW_ERROR)",
      rec.errors.length === 0 && s12.stats.error === 0 && s12.stats.mismatch === 0, { errors: rec.errors, stats: s12.stats });
    release(rec);
    await o.context.close();

    // ================= flag OFF session: refresh recovery stays off =================
    var off = await openSession(browser, srv.origin, "off", false, apis);
    await h.toDashboard(off.page, "classified");
    await waitPosts(off.rec, 1, off.page);
    await waitProcessed(off.page, 1);
    await off.page.reload();
    await waitBooted(off.page);
    await off.page.waitForTimeout(1500);
    var sOff = await v2(off.page);
    check("flag OFF: refresh does not POST (restore gated by CZ_V2_STRATEGY_STATE_ENABLED), no V2 key in CZState",
      off.rec.posts.length === 1 && sOff.raw === "<absent>" && off.rec.errors.length === 0, { posts: off.rec.posts.length, raw: sOff.raw });
    release(off.rec);
    await off.context.close();
  } finally {
    console.warn = warn;
    await browser.close();
    srv.server.close();
    Object.keys(apis).forEach(function (k) { apis[k].server.close(); });
  }

  var appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  var qStart = appSrc.indexOf("function commitDeudaQuickMontoFromInput");
  var qBody = appSrc.slice(qStart, appSrc.indexOf("\nfunction ", qStart + 10));
  check("static: quick edit commit calls maybeShadowDiagnosis(st, \"quick_edit\"); boot calls restoreV2Strategy",
    qStart !== -1 && qBody.indexOf('maybeShadowDiagnosis(st, "quick_edit")') !== -1 &&
    appSrc.indexOf("CZShadowDiagnosis.restoreV2Strategy(st)") !== -1);
  var idxHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  check("static: index.html loads financialInputIdentity.js before shadowDiagnosis.js",
    idxHtml.indexOf("/js/financialInputIdentity.js") !== -1 &&
    idxHtml.indexOf("/js/financialInputIdentity.js") < idxHtml.indexOf("/js/shadowDiagnosis.js"));
  var shadowSrc = fs.readFileSync(path.join(ROOT, "js", "shadowDiagnosis.js"), "utf8");
  check("static: frontend never sends identity/canonical to the server (payload built from EngineInput only)",
    !/payload\.(financial_input_identity|input_canonical|canonical)/.test(shadowSrc));

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_IDENTITY_WIRING_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
