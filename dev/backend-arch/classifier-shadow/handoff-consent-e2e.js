/**
 * MIPLAN-HANDOFF-CONSENT-01 — Credizona thank-you → Mi Plan consent bridge, end to end (Playwright).
 *
 * Browser side: the staged Credizona thank-you page (template + deploy/thank-you-handoff-wiring
 * solicitudes.js + clone assets) on http://cz.test and the real Mi Plan frontend served as
 * https://cz-miplan2.vercel.app. Backend side: the real Mi Plan Express app (default wiring:
 * in-memory journey + consent repositories) on loopback; requests to the production backend URL
 * are forwarded to it, so both sites call the URLs they ship with. JANUS is mocked in-process with
 * the real JANUS context builder (Survey V2, P7 = E). Every other request is aborted.
 *
 * Usage: node dev/backend-arch/classifier-shadow/handoff-consent-e2e.js
 */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var chromium = require("playwright").chromium;

var ROOT = path.join(__dirname, "..", "..", "..");
var JANUS_DIR = process.env.JANUS_REPO_DIR || path.join(ROOT, "..", "..", "Mie Backend", "mie-backend");
var CZ_DIR = process.env.CZ_CLONE_DIR ||
  path.join("C:", "Users", "Admin", "Desktop", "CZ CLON CPANEL 2026-08-27", "CZ CLON CPANEL 2026-08-27");
var CZ_STAGE = path.join(CZ_DIR, "deploy", "thank-you-handoff-wiring");
var CZ_ORIGIN = "http://cz.test";
var MIPLAN_ORIGIN = "https://cz-miplan2.vercel.app";
var PROD_API = "https://backend-production-17f9.up.railway.app";
var CZ_KEY = "cz.miplan.handoff.sinoferta.v1";
var TC = "TC_v2.0_202605";
var PP = "PP_v2.0_202605";

[["SUPABASE_URL", "https://example.supabase.co"], ["SUPABASE_SERVICE_ROLE_KEY", "test"],
  ["APIFY_TOKEN", "test"], ["APIFY_ACTOR_ID", "test"]].forEach(function (kv) {
  if (!process.env[kv[0]]) process.env[kv[0]] = kv[1];
});
var janusTokens = require(path.join(JANUS_DIR, "src", "lib", "miplanHandoffTokens"));
var createApp = require("../../../server/app").createApp;
var loadConfig = require("../../../server/config").loadConfig;

var EPISODE = {
  cz_id: 9003, ci: 11111113, lrw_id: "LRW-000-000-003", email: "qa-consent@example.test",
  nombre: "QA", apellido: "Consent", salario: 50000, relacion_laboral: "EPR",
  solicitudes_estados_id: 3, synced_at: "2026-10-05T12:00:00.000Z",
};
var SURVEY_V2 = { cz_id: 79, ci: 11111113, completed_at: "2026-10-05T11:00:00.000Z", version_cuestionario: 2, p7: "E",
  p1: "B", p2: "B", p3: "B", p4: "B", p5: "B", p6: "A", p8: "B", p9: "B", p10: "B" };

// ---- JANUS mock (server process only): one-time redeem ----
var janusIssued = new Set();
var janusRedeemed = new Set();
global.fetch = function (_url, init) {
  var code = JSON.parse(init.body).handoff_code;
  function reply(status, body) {
    return Promise.resolve({ ok: status === 200, status: status, text: function () { return Promise.resolve(JSON.stringify(body)); } });
  }
  if (!janusIssued.has(code)) return reply(404, { error: "not_found" });
  if (janusRedeemed.has(code)) return reply(409, { error: "already_redeemed" });
  janusRedeemed.add(code);
  return reply(200, { ok: true, context: janusTokens.buildAllowlistedContext(EPISODE, SURVEY_V2, new Date().toISOString(), { surveyV2Enabled: true }) });
};
function issueCode() {
  var code = crypto.randomBytes(32).toString("base64url");
  janusIssued.add(code);
  return code;
}

function tplBody(file) {
  var parts = fs.readFileSync(file, "utf8").split("<!-- TPL -->");
  if (parts.length !== 3) throw new Error("TPL markers missing in " + file);
  return parts[1];
}
function czThanksPage() {
  return '<!doctype html><html><head><meta charset="utf-8"><title>Gracias</title></head><body>' +
    tplBody(path.join(CZ_STAGE, "public_html", "solicitudes.encuesta_sinoferta_gracias.html")) +
    '<script src="/includes/js/3Party/jQuery-3.4.1/jquery.min.js"></script>' +
    '<script src="/includes/js/3Party/jQuery-3.4.1/jquery-migrate.min.js"></script>' +
    "<script>window.alertify={defaults:{theme:{}},alert:function(){}};window.gtag=function(a,b,c,cb){if(typeof cb==='function')cb('-');};window.dataLayer=[];</script>" +
    '<script src="/solicitudes.js"></script><script src="/Chukupax.js"></script>' +
    "<script>const chukupax = new Chukupax(JSON.stringify({baseFolder:'/',mid:'solicitudes',func:'encuesta_sinoferta_gracias'}));chukupax.init();</script>" +
    "</body></html>";
}

var CT = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".ico": "image/x-icon" };

async function newBrowserContext(browser, backendBase, opts) {
  opts = opts || {};
  var context = await browser.newContext({ locale: "es-UY" });
  var s = { context: context, backend: [], consentBodies: [], external: [], errors: [] };
  await context.route("**/*", async function (route) {
    var req = route.request();
    var url = new URL(req.url());
    if (url.origin === PROD_API) {
      s.backend.push(req.method() + " " + url.pathname);
      if (url.pathname === "/v1/handoff/consent" && req.method() === "POST") {
        s.consentBodies.push(JSON.parse(req.postData() || "null"));
        if (opts.failConsent) return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"x"}' });
      }
      var resp = await route.fetch({ url: backendBase + url.pathname + url.search });
      return route.fulfill({ response: resp });
    }
    if (url.origin === CZ_ORIGIN) {
      if (url.pathname === "/solicitudes/encuesta_sinoferta_gracias") {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: czThanksPage() });
      }
      var czFile = url.pathname === "/solicitudes.js"
        ? path.join(CZ_STAGE, "public_html", "solicitudes.js")
        : path.join(CZ_DIR, "public_html", url.pathname.replace(/^\//, ""));
      if (!fs.existsSync(czFile) || fs.statSync(czFile).isDirectory()) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: CT[path.extname(czFile)] || "text/plain", body: fs.readFileSync(czFile) });
    }
    if (url.origin === MIPLAN_ORIGIN) {
      if (url.pathname === "/js/config.local.js") {
        return route.fulfill({ contentType: "application/javascript",
          body: "CZ_BACKEND_API_URL = " + JSON.stringify(PROD_API) + "; CZ_SHADOW_MODE = false;" });
      }
      var p = url.pathname === "/" || /^\/e\//.test(url.pathname) ? "/index.html" : decodeURIComponent(url.pathname);
      var file = path.join(ROOT, p);
      if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ contentType: CT[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
    }
    s.external.push(req.method() + " " + url.origin);
    return route.abort();
  });
  s.page = await context.newPage();
  s.page.on("pageerror", function (e) { s.errors.push(String(e && e.message)); });
  return s;
}

async function waitMiplan(page) {
  await page.waitForURL(function (u) { return String(u).indexOf(MIPLAN_ORIGIN) === 0; }, { timeout: 15000 });
  await page.waitForFunction(function () {
    return !!(window.CZState && window.CZState.temporal && window.CZState.temporal.session_count >= 1);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
}

function miplanState() {
  var st = window.CZState;
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_e) { saved = null; }
  var resp = typeof PRE !== "undefined" && PRE.respuestas ? PRE.respuestas : {};
  var ls = {};
  for (var i = 0; i < localStorage.length; i++) ls[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
  return {
    url: location.href,
    tc_screen: !!document.getElementById("btn-miplan-consent-accept"),
    bridge: !!document.getElementById("btn-bridge-survey"),
    debts: !!document.getElementById("btn-agregar-deuda"),
    step: st.step,
    miplan_started: !!st.miplan_started,
    consent: st.consent || null,
    saved_consent: saved ? saved.consent || null : null,
    journey: window.CZHandoffEntry.getCurrentJourneyId(),
    pre_letters: Object.keys(resp).filter(function (k) { return resp[k] != null; }).length,
    tiene_encuesta: typeof TIENE_ENCUESTA !== "undefined" ? TIENE_ENCUESTA : null,
    segmento: typeof SEGMENTO !== "undefined" ? SEGMENTO : null,
    survey_v2_completed: st._handoffSurveyV2Completed === true,
    cz_consent_v1: ls.cz_consent_v1 || null,
    storage_dump: JSON.stringify(ls) + JSON.stringify(sessionStorage),
    state_dump: JSON.stringify(st),
  };
}

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1200) : ""));
}

async function storeCzCode(page, code) {
  await page.goto(CZ_ORIGIN + "/solicitudes/encuesta_sinoferta_gracias");
  await page.evaluate(function (a) {
    sessionStorage.setItem(a.key, JSON.stringify({ v: 1, code: a.code, exp: Date.now() + 900e3 }));
  }, { key: CZ_KEY, code: code });
  await page.reload();
  await page.waitForLoadState("load");
}

function onlyHandoffBackendCalls(s) {
  return s.backend.every(function (b) { return /^(POST|OPTIONS) \/v1\/handoff\/(consent|redeem)$/.test(b); });
}

async function main() {
  var backendServer = http.createServer(createApp(loadConfig({
    NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: CZ_ORIGIN + "," + MIPLAN_ORIGIN,
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "",
    JANUS_HANDOFF_BASE_URL: "https://janus.test", MIPLAN_HANDOFF_REDEEM_SECRET: "test-redeem-secret",
  })));
  await new Promise(function (r) { backendServer.listen(0, "127.0.0.1", r); });
  var backendBase = "http://127.0.0.1:" + backendServer.address().port;
  var browser = await chromium.launch();
  try {
    // ---- 1 / 8: Gracias without click; then the handoff URL without click evidence ----
    var codeA = issueCode();
    var s1 = await newBrowserContext(browser, backendBase);
    await storeCzCode(s1.page, codeA);
    var cta = await s1.page.evaluate(function () {
      var box = document.getElementById("miplanGraciasCta");
      var links = box ? Array.prototype.map.call(box.querySelectorAll("a"), function (a) {
        return { text: a.textContent, href: a.getAttribute("href"), target: a.getAttribute("target") };
      }) : [];
      var btn = document.getElementById("btnMiplanCrear");
      return { text: box ? box.textContent.replace(/\s+/g, " ") : "", links: links, btn: btn ? btn.textContent : null };
    });
    check("Gracias with a code shows the Mi Plan block: consent text, T&C + Privacy links, CTA 'Crear mi plan gratis'",
      cta.text.indexOf("Al continuar, aceptás los Términos y Condiciones de Mi Plan y la Política de Privacidad.") !== -1 &&
      cta.btn === "Crear mi plan gratis" && cta.links.length === 2 &&
      cta.links[0].href === MIPLAN_ORIGIN + "/tyc.html" && cta.links[1].href === MIPLAN_ORIGIN + "/privacidad.html", cta);
    await s1.page.waitForTimeout(1200);
    check("T1 Gracias loaded without click -> no consent request, no navigation",
      s1.backend.length === 0 && new URL(s1.page.url()).pathname === "/solicitudes/encuesta_sinoferta_gracias", s1.backend);
    await s1.page.goto(MIPLAN_ORIGIN + "/e/" + codeA);
    await waitMiplan(s1.page);
    var m1 = await s1.page.evaluate(miplanState);
    check("T8 valid handoff without click evidence -> Mi Plan T&C screen shown, no consent",
      m1.tc_screen && !m1.consent && m1.journey, m1);
    await s1.page.check("#chk-miplan-tc");
    await s1.page.check("#chk-miplan-privacy");
    await s1.page.click("#btn-miplan-consent-accept");
    await s1.page.waitForTimeout(400);
    var m1b = await s1.page.evaluate(miplanState);
    check("T8 after in-app acceptance: miplan_gate consent, handoff skips the bridge (debts step)",
      m1b.consent && m1b.consent.consent_source === "miplan_gate" && !m1b.bridge && m1b.debts && m1b.step === 1, m1b);
    await s1.context.close();

    // ---- 2 / 3 / 9 / 10 / 12-17: click on Gracias -> Mi Plan without T&C nor bridge ----
    var codeB = issueCode();
    var s2 = await newBrowserContext(browser, backendBase);
    await storeCzCode(s2.page, codeB);
    var clickedAt = Date.now();
    await s2.page.click("#btnMiplanCrear");
    await waitMiplan(s2.page);
    var m2 = await s2.page.evaluate(miplanState);
    var body = s2.consentBodies[0] || {};
    check("T2 click POSTs the consent to the Mi Plan backend before navigating",
      s2.consentBodies.length === 1 && s2.backend.indexOf("POST /v1/handoff/consent") < s2.backend.indexOf("POST /v1/handoff/redeem"), s2.backend);
    check("T3 Credizona sends exactly {handoff_code, tc_version, privacy_version} with " + TC + " / " + PP,
      JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["handoff_code", "privacy_version", "tc_version"]) &&
      body.handoff_code === codeB && body.tc_version === TC && body.privacy_version === PP, body);
    check("handoff URL stripped; code not in query; CZ stored code cleared on click",
      m2.url === MIPLAN_ORIGIN + "/" && m2.storage_dump.indexOf(codeB) === -1, m2.url);
    check("T9 handoff with valid click evidence -> no Mi Plan T&C screen", !m2.tc_screen, m2);
    check("T3 consent record: credizona_gracias, Mi Plan versions, server timestamp, bound to this journey",
      m2.consent && m2.consent.consent_source === "credizona_gracias" && m2.consent.miplan_tc_accepted === true &&
      m2.consent.miplan_privacy_accepted === true && m2.consent.miplan_tc_version === TC && m2.consent.miplan_privacy_version === PP &&
      m2.consent.journey_id === m2.journey && Math.abs(Date.parse(m2.consent.miplan_consent_timestamp) - clickedAt) < 10000, m2.consent);
    check("T10 handoff with valid consent -> no bridge, Mi Plan starts at the debts step",
      !m2.bridge && m2.debts && m2.step === 1 && m2.miplan_started, m2);
    check("T12 / T13 Survey V2 (P7 = E) still isolated: completed, PRE.respuestas empty, TIENE_ENCUESTA false, SEGMENTO != 1",
      m2.survey_v2_completed && m2.pre_letters === 0 && m2.tiene_encuesta === false && m2.segmento !== 1, m2);
    check("consent kept apart from the Credizona funnel consent (cz_consent_v1 untouched)", m2.cz_consent_v1 === null, m2.cz_consent_v1);
    check("T14 / T15 / T16 no debt_management_opt_in, USER_CHOICE or FinancialAction: only handoff endpoints called, none in state",
      onlyHandoffBackendCalls(s2) && !/debt_management_opt_in|user_choice|financial_action/i.test(m2.state_dump + m2.storage_dump), s2.backend);
    check("T17 consent persisted in cr_v3", JSON.stringify(m2.saved_consent) === JSON.stringify(m2.consent), m2.saved_consent);
    await s2.page.reload();
    await waitMiplan(s2.page);
    var m2r = await s2.page.evaluate(miplanState);
    check("T17 reload keeps the valid consent: no T&C, no bridge, same record",
      !m2r.tc_screen && !m2r.bridge && JSON.stringify(m2r.consent) === JSON.stringify(m2.consent), m2r);

    // ---- 18: a new handoff in the same browser does not inherit ----
    var codeC = issueCode();
    await s2.page.goto(MIPLAN_ORIGIN + "/e/" + codeC);
    await waitMiplan(s2.page);
    var m3 = await s2.page.evaluate(miplanState);
    check("T18 new handoff (no click) in the same browser -> T&C shown again, previous consent not inherited",
      m3.tc_screen && m3.journey && m3.journey !== m2.journey, { journey: m3.journey, prev: m2.journey, consent: m3.consent });
    check("no page errors (click flow)", s2.errors.length === 0, s2.errors);
    await s2.context.close();

    // ---- 6: replay of a consumed code from another browser ----
    var s6 = await newBrowserContext(browser, backendBase);
    await s6.page.goto(MIPLAN_ORIGIN + "/e/" + codeB);
    await waitMiplan(s6.page);
    var m6 = await s6.page.evaluate(miplanState);
    check("T6 consumed code replayed in another browser -> no consent, T&C shown", m6.tc_screen && !m6.consent, m6);
    await s6.context.close();

    // ---- 7: consent=true / cz_tc in the URL does nothing ----
    var codeD = issueCode();
    var s7 = await newBrowserContext(browser, backendBase);
    await s7.page.goto(MIPLAN_ORIGIN + "/e/" + codeD + "?consent=true&miplan_consent=1&cz_tc=1&cz_disc=1");
    await waitMiplan(s7.page);
    var m7 = await s7.page.evaluate(miplanState);
    check("T7 consent=true / cz_tc=1 in the URL -> Mi Plan T&C still shown", m7.tc_screen && !m7.consent, m7);
    await s7.context.close();

    // ---- consent POST failure: Credizona still navigates, Mi Plan asks for T&C ----
    var codeE = issueCode();
    var s8 = await newBrowserContext(browser, backendBase, { failConsent: true });
    await storeCzCode(s8.page, codeE);
    await s8.page.click("#btnMiplanCrear");
    await waitMiplan(s8.page);
    var m8 = await s8.page.evaluate(miplanState);
    check("consent store failure -> navigation continues, T&C shown (fail closed)", m8.tc_screen && !m8.consent && m8.journey, m8);
    await s8.context.close();

    // ---- 5 (client side): expired stored code -> no CTA ----
    var s9 = await newBrowserContext(browser, backendBase);
    await s9.page.goto(CZ_ORIGIN + "/solicitudes/encuesta_sinoferta_gracias");
    await s9.page.evaluate(function (a) {
      sessionStorage.setItem(a.key, JSON.stringify({ v: 1, code: a.code, exp: Date.now() - 1 }));
    }, { key: CZ_KEY, code: issueCode() });
    await s9.page.reload();
    await s9.page.waitForLoadState("load");
    var noCta = await s9.page.evaluate(function () { return !document.getElementById("btnMiplanCrear"); });
    check("T5 expired stored code -> no CTA, no request", noCta && s9.backend.length === 0);
    await s9.page.goto(CZ_ORIGIN + "/solicitudes/encuesta_sinoferta_gracias");
    await s9.page.evaluate(function (key) { sessionStorage.removeItem(key); }, CZ_KEY);
    await s9.page.reload();
    var noCode = await s9.page.evaluate(function () { return !document.getElementById("miplanGraciasCta"); });
    check("Gracias without a code -> no Mi Plan block", noCode && s9.errors.length === 0, s9.errors);
    await s9.context.close();

    // ---- 11: non-handoff entry unchanged ----
    var s10 = await newBrowserContext(browser, backendBase);
    await s10.page.goto(MIPLAN_ORIGIN + "/?cz_tc=1&cz_disc=1");
    await waitMiplan(s10.page);
    var m10 = await s10.page.evaluate(miplanState);
    check("T11 non-handoff entry -> Mi Plan T&C screen", m10.tc_screen && !m10.consent, m10);
    await s10.page.check("#chk-miplan-tc");
    await s10.page.check("#chk-miplan-privacy");
    await s10.page.click("#btn-miplan-consent-accept");
    await s10.page.waitForTimeout(400);
    var m10b = await s10.page.evaluate(miplanState);
    check("T11 non-handoff entry -> bridge still shown at step 0", m10b.bridge && m10b.step === 0 && !m10b.miplan_started, m10b);
    check("T11 no backend handoff calls for a non-handoff entry", s10.backend.length === 0, s10.backend);
    await s10.context.close();
  } finally {
    await browser.close();
    backendServer.close();
  }
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("HANDOFF_CONSENT_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
