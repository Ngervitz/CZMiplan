/**
 * dev/plus-prod-hardening-qa.js — PROD-SECURITY-HARDENING-01
 *
 * PLUS: ?plus_payment=success and client state never grant Plus (no server payment authority).
 * IA:   test report UI hidden by default; /api/plus/generate fail-closed on Vercel production;
 *       provider payload carries no direct identifiers; test input is fully synthetic.
 *
 * Fictitious data only. Provider fetch is mocked; run with node -r ./server/testing/networkTrap.js.
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var vm = require("vm");
  var { pathToFileURL } = require("url");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  // ---- browser-like harness -------------------------------------------------
  var storage = {};
  var replaced = [];
  var elements = {};
  var domReady = [];
  var gtmEvents = [];
  var crmEvents = [];

  global.window = global;
  global.window.location = {
    search: "?plus_payment=success&utm_source=qa",
    pathname: "/",
    hash: "",
    href: "https://qa.invalid/?plus_payment=success&utm_source=qa",
  };
  global.history = { replaceState: function(_s, _t, url) { replaced.push(url); } };
  global.document = {
    getElementById: function(id) { return elements[id] || null; },
    querySelectorAll: function() { return []; },
    querySelector: function() { return null; },
    addEventListener: function(type, fn) { if (type === "DOMContentLoaded") domReady.push(fn); },
    body: { classList: { add: function() {}, remove: function() {} } },
  };
  global.localStorage = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
    setItem: function(k, v) { storage[k] = String(v); },
    removeItem: function(k) { delete storage[k]; },
  };

  function load(file) {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  }

  load("js/config.js");
  load("js/creditors.js");
  load("js/survey.js");
  load("js/algorithms.js");
  load("js/events.js");
  load("js/ui.js");
  load("js/consent.js");
  load("js/plusReport.js");
  load("js/app.js");

  var realTrackEvent = global.trackEvent;
  global.trackEvent = function(name, payload) { gtmEvents.push({ name: name, payload: payload }); };
  global.trackCRMEvent = function(name, payload) { crmEvents.push({ name: name, payload: payload }); };
  global.enviarCRM = function() {};

  function plusGrantEvents() {
    return gtmEvents.concat(crmEvents).filter(function(e) { return e.name === "plus_purchased"; });
  }

  var cfgSrc = fs.readFileSync(path.join(root, "js/config.js"), "utf8");

  // ---- PUBLIC ARTIFACT ------------------------------------------------------
  // Vercel deploys main with no build step: every tracked file is served as-is. Scan the candidate
  // artifact (tracked + untracked-not-ignored, working-tree contents) for the legacy client secret,
  // read from the commit that introduced it. The value is never printed.
  var cp = require("child_process");
  var legacySecret = "";
  try {
    var legacyCfg = cp.execSync("git show f2f169e:js/config.js", { cwd: root, encoding: "utf8" });
    var lm = /CZ_PLUS_PROXY_CLIENT_SECRET\s*=\s*"([^"]*)"/.exec(legacyCfg);
    legacySecret = lm ? lm[1] : "";
  } catch (e) { legacySecret = ""; }
  ok("A0 legacy secret recoverable from history for the scan", legacySecret.length >= 8);

  var artifactFiles = cp.execSync("git ls-files -co --exclude-standard", { cwd: root, encoding: "utf8" })
    .split(/\r?\n/).filter(function(f) { return f && f.indexOf("node_modules/") !== 0; });
  var legacyHits = 0;
  var clientSecretAssigned = 0;
  artifactFiles.forEach(function(f) {
    var txt;
    try { txt = fs.readFileSync(path.join(root, f), "utf8"); } catch (e) { return; }
    if (legacySecret && txt.indexOf(legacySecret) !== -1) legacyHits++;
    if (/CZ_PLUS_PROXY_CLIENT_SECRET\s*=\s*"[^"]+"/.test(txt)) clientSecretAssigned++;
  });
  ok("A0 legacy secret absent from public artifact (" + artifactFiles.length + " files)",
    artifactFiles.length > 50 && legacyHits === 0);
  ok("A0 no non-empty client secret assignment in public artifact", clientSecretAssigned === 0);
  ok("A0 no build step rewrites config (no build script)",
    !/"(build|vercel-build|prebuild)"\s*:/.test(fs.readFileSync(path.join(root, "package.json"), "utf8")));

  // ---- PLUS -----------------------------------------------------------------
  var st = window.CZState;
  st.tab = "plan";
  handlePlusPaymentReturn();

  ok("P1 ?plus_payment=success does not set plus_purchased", st.plus_purchased === false);
  ok("P1 ?plus_payment=success does not set plus_status / plus_purchased_at",
    st.plus_status === null && st.plus_purchased_at === null);
  ok("P1 no plus_purchased analytics/CRM event on return", plusGrantEvents().length === 0);
  ok("P1 return only raises transient pending flag", st._plusPaymentPendingConfirmation === true);
  ok("P1 plus_payment removed from URL, other params kept",
    replaced.length === 1 && replaced[0].indexOf("plus_payment") < 0 && replaced[0].indexOf("utm_source=qa") >= 0);

  var pendingHtml = renderTabPlus();
  ok("P1 Plus tab shows pending confirmation, not processing/report",
    pendingHtml.indexOf("Pago pendiente de confirmación") >= 0
    && pendingHtml.indexOf("Estamos generando tu informe") < 0);

  window.guardarLocal();
  var saved = JSON.parse(storage[STORAGE_KEY] || "{}");
  ok("P2 persisted state carries no Plus grant",
    saved.plus_purchased === false && saved.plus_status === null && saved.plus_purchased_at === null);
  ok("P2 pending flag is not persisted (gone after refresh)",
    !Object.prototype.hasOwnProperty.call(saved, "_plusPaymentPendingConfirmation"));

  // Refresh where replaceState did not take effect: the param is still there.
  handlePlusPaymentReturn();
  ok("P2 repeated return (refresh) still grants nothing",
    st.plus_purchased === false && st.plus_status === null && plusGrantEvents().length === 0);

  ok("P3 no client-side purchase completer remains", typeof completarCompraPlus === "undefined");

  elements["plus-cta-inline-msg"] = { textContent: "", style: {} };
  var savedLive = CZ_PLUS_PAYMENT_LIVE;
  var savedEndpoint = CZ_HANDY_ENDPOINT;
  CZ_PLUS_PAYMENT_LIVE = true;
  CZ_HANDY_ENDPOINT = "";
  onPlusCtaClick();
  ok("P3 payment live + no provider endpoint: CTA fails closed",
    st.plus_purchased === false && st.plus_status === null && plusGrantEvents().length === 0
    && elements["plus-cta-inline-msg"].textContent.indexOf("No pudimos iniciar el pago") >= 0);
  CZ_PLUS_PAYMENT_LIVE = false;
  onPlusCtaClick();
  ok("P3 payment not live: CTA keeps 'Estamos activando' and grants nothing",
    st.plus_purchased === false
    && elements["plus-cta-inline-msg"].textContent.indexOf("Estamos activando") >= 0);
  CZ_PLUS_PAYMENT_LIVE = savedLive;
  CZ_HANDY_ENDPOINT = savedEndpoint;

  var savedHref = window.location.href;
  CZ_HANDY_ENDPOINT = "https://pay.qa.invalid/checkout";
  var started = iniciarPagoHandy();
  ok("P4 provider redirect (when configured) still sends the return_url",
    started === true && window.location.href.indexOf("https://pay.qa.invalid/checkout?return_url=") === 0);
  CZ_HANDY_ENDPOINT = savedEndpoint;
  window.location.href = savedHref;
  ok("P4 repo config: payment not live, no provider endpoint",
    /var CZ_PLUS_PAYMENT_LIVE = false;/.test(cfgSrc) && /var CZ_HANDY_ENDPOINT = "";/.test(cfgSrc));

  st._plusPaymentPendingConfirmation = false;
  st.plus_purchased = true;
  st.plus_status = "PLUS_PROCESSING";
  ok("P4 legacy persisted PLUS_PROCESSING state renders as before",
    renderTabPlus().indexOf("Estamos generando tu informe") >= 0);
  st.plus_purchased = false;
  st.plus_status = null;

  // Real trackEvent → real dataLayer: a fresh return must push nothing commercial.
  global.trackEvent = realTrackEvent;
  window.dataLayer = [];
  st._plusPaymentPendingConfirmation = false;
  st.tab = "plus";
  window.location.search = "?plus_payment=success";
  handlePlusPaymentReturn();
  renderTabPlus();
  window.guardarLocal();
  var commercial = window.dataLayer.filter(function(e) {
    var name = String((e && e.event) || "");
    return /purchase|conversion|revenue|payment_success|checkout/i.test(name)
      || (e && (e.value !== undefined || e.currency !== undefined || e.transaction_id !== undefined));
  });
  ok("D real dataLayer: no purchase / conversion / revenue push on return",
    commercial.length === 0 && st.plus_purchased === false && st.plus_status === null);
  ok("D no code path emits plus_purchased (event name unused outside events.js)",
    ["js/app.js", "js/ui.js", "js/plusReport.js", "js/crm.js", "js/analytics.js"].every(function(f) {
      return fs.readFileSync(path.join(root, f), "utf8").indexOf("PLUS_PURCHASED") < 0;
    }));
  global.trackEvent = function(name, payload) { gtmEvents.push({ name: name, payload: payload }); };
  st.tab = "plan";
  st._plusPaymentPendingConfirmation = false;

  // ---- IA UI ----------------------------------------------------------------
  ok("A5 repo config: test UI flag off, no client secret",
    /var CZ_PLUS_TEST_UI_ENABLED = false;/.test(cfgSrc) && /var CZ_PLUS_PROXY_CLIENT_SECRET = "";/.test(cfgSrc));

  var presentation = renderTabPlus();
  st.plus_status = "PLUS_ERROR";
  var errorScreen = renderTabPlus();
  st.plus_status = null;
  ok("A5 production config: no test button on presentation or error screen",
    presentation.indexOf("btn-plus-test-generar") < 0 && presentation.indexOf("Generar informe de prueba") < 0
    && errorScreen.indexOf("btn-plus-test-generar") < 0);

  var genCalls = [];
  global.generarInformePlus = function(opts) { genCalls.push(opts); };
  global.initConsent = function() { return false; };
  var clickHandler = null;
  elements["main-content"] = {
    addEventListener: function(type, fn) { if (type === "click") clickHandler = fn; },
  };
  domReady.forEach(function(fn) { fn(); });
  function clickTestButton() {
    clickHandler({
      target: {
        id: "btn-plus-test-generar",
        closest: function() { return null; },
        getAttribute: function() { return null; },
        classList: { contains: function() { return false; } },
        dataset: {},
      },
      preventDefault: function() {},
    });
  }
  clickTestButton();
  ok("A5 forced click on test button is ignored when flag is off",
    typeof clickHandler === "function" && genCalls.length === 0 && st.plus_status === null);

  CZ_PLUS_TEST_UI_ENABLED = true;
  var devPresentation = renderTabPlus();
  clickTestButton();
  ok("A7 dev flag on: test button rendered and generates with synthetic input",
    devPresentation.indexOf("btn-plus-test-generar") >= 0
    && genCalls.length === 1 && genCalls[0].useTestInput === true);
  CZ_PLUS_TEST_UI_ENABLED = false;
  st.plus_status = null;

  PRE.nombre = "Nombre Ficticio QA";
  PRE.cedula = "0000000-0";
  PRE.email = "ficticio.qa@example.invalid";
  PRE.telefono = "000000000";
  var mockJson = JSON.stringify(getMockPlusInput());
  ok("A8 test input ignores PRE identifiers",
    mockJson.indexOf("Nombre Ficticio QA") < 0 && mockJson.indexOf("0000000-0") < 0
    && mockJson.indexOf("example.invalid") < 0 && mockJson.indexOf("000000000") < 0);
  ok("A8 test input has no direct identifier keys",
    !/"(nombre|cedula|email|telefono|celular|anonymous_id|crm_contact_id)"\s*:/.test(mockJson));

  // ---- /api/plus/generate ---------------------------------------------------
  (async function() {
    var handler = (await import(pathToFileURL(path.join(root, "api/plus/generate.js")).href)).default;
    var providerBodies = [];
    global.fetch = async function(_url, opts) {
      providerBodies.push(JSON.parse(opts.body));
      return {
        ok: true,
        status: 200,
        json: async function() {
          return { content: [{ type: "text", text: '{"seccion_1_resumen_ejecutivo":{}}' }], usage: {} };
        },
      };
    };

    function mockRes() {
      return {
        _status: 200,
        body: null,
        setHeader: function() {},
        status: function(code) { this._status = code; return this; },
        json: function(b) { this.body = b; return this; },
      };
    }

    function withEnv(env, fn) {
      var savedEnv = {};
      Object.keys(env).forEach(function(k) {
        savedEnv[k] = process.env[k];
        if (env[k] == null) delete process.env[k];
        else process.env[k] = env[k];
      });
      return fn().finally(function() {
        Object.keys(savedEnv).forEach(function(k) {
          if (savedEnv[k] == null) delete process.env[k];
          else process.env[k] = savedEnv[k];
        });
      });
    }

    var fictitiousContext = {
      usuario: {
        nombre: "Nombre Ficticio QA",
        cedula: "0000000-0",
        email: "ficticio.qa@example.invalid",
        telefono: "000000000",
        ingreso_declarado: 37000,
      },
      anonymous_id: "anon-qa-fictitious",
      deudas_declaradas: [{ acreedor: "Acreedor QA", monto: 1000, Email: "otro.qa@example.invalid" }],
    };
    var body = { report_type: "plus", context: fictitiousContext };
    var secretHeader = { "x-cz-plus-secret": "qa-only-secret", "content-length": "400" };

    await withEnv({ VERCEL: "1", VERCEL_ENV: "production", CZ_PLUS_PROXY_SECRET: "qa-only-secret",
      CZ_CLAUDE_API_KEY: "qa-fake-key" }, async function() {
      var r = mockRes();
      await handler({ method: "POST", headers: secretHeader, body: body }, r);
      ok("A6 production: direct call refused even with valid secret + key",
        r._status === 403 && r.body.ok === false && r.body.error === "plus_generate_disabled");
    });

    await withEnv({ VERCEL: "1", VERCEL_ENV: null, CZ_PLUS_PROXY_SECRET: "qa-only-secret",
      CZ_CLAUDE_API_KEY: "qa-fake-key" }, async function() {
      var r = mockRes();
      await handler({ method: "POST", headers: secretHeader, body: body }, r);
      ok("A6 Vercel without recognised VERCEL_ENV: refused", r._status === 403);
    });
    ok("A6 provider never called in production", providerBodies.length === 0);

    await withEnv({ VERCEL: "1", VERCEL_ENV: "preview", CZ_PLUS_PROXY_SECRET: "qa-only-secret",
      CZ_CLAUDE_API_KEY: "qa-fake-key" }, async function() {
      var rNo = mockRes();
      await handler({ method: "POST", headers: { "content-length": "400" }, body: body }, rNo);
      ok("A7 preview keeps the secret gate", rNo._status === 401 && providerBodies.length === 0);
      var r = mockRes();
      await handler({ method: "POST", headers: secretHeader, body: body }, r);
      ok("A7 preview with secret generates", r._status === 200 && r.body.ok === true && providerBodies.length === 1);
    });

    await withEnv({ VERCEL: null, VERCEL_ENV: null, CZ_PLUS_PROXY_SECRET: null,
      CZ_CLAUDE_API_KEY: "qa-fake-key", CZ_PLUS_GENERATE_LOCAL: "1" }, async function() {
      var r = mockRes();
      await handler({ method: "POST", headers: { "content-length": "400" }, body: body }, r);
      ok("A7 local dev with explicit opt-in generates", r._status === 200 && providerBodies.length === 2);
    });

    // ---- env matrix: anything not explicitly authorised is denied before the provider ----
    var beforeMatrix = providerBodies.length;
    async function statusFor(env, headers) {
      var r = mockRes();
      await withEnv(Object.assign({ CZ_CLAUDE_API_KEY: "qa-fake-key", CZ_PLUS_GENERATE_LOCAL: null,
        CZ_PLUS_PROXY_SECRET: null, NODE_ENV: null }, env), async function() {
        await handler({ method: "POST", headers: headers || { "content-length": "400" }, body: body }, r);
      });
      return r;
    }
    var rLocalNoOptIn = await statusFor({ VERCEL: null, VERCEL_ENV: null });
    ok("C local without opt-in: DENY 403", rLocalNoOptIn._status === 403
      && rLocalNoOptIn.body.error === "plus_generate_disabled");
    var rSysVarsHidden = await statusFor({ VERCEL: null, VERCEL_ENV: null, NODE_ENV: "production" });
    ok("C deployment with system vars not exposed (indistinguishable from local): DENY 403",
      rSysVarsHidden._status === 403);
    var rProdNoVercelFlag = await statusFor({ VERCEL: null, VERCEL_ENV: "production",
      CZ_PLUS_GENERATE_LOCAL: "1" });
    ok("C VERCEL_ENV=production (even with local opt-in set): DENY 403", rProdNoVercelFlag._status === 403);
    var rUnknown = await statusFor({ VERCEL: "1", VERCEL_ENV: "staging" });
    ok("C VERCEL_ENV unknown: DENY 403", rUnknown._status === 403);
    var rEmpty = await statusFor({ VERCEL: "1", VERCEL_ENV: "" });
    ok("C VERCEL_ENV empty: DENY 403", rEmpty._status === 403);
    var rMissing = await statusFor({ VERCEL: "1", VERCEL_ENV: null, CZ_PLUS_GENERATE_LOCAL: "1" });
    ok("C VERCEL set, VERCEL_ENV missing (even with local opt-in): DENY 403", rMissing._status === 403);
    var rPreviewNoSecret = await statusFor({ VERCEL: "1", VERCEL_ENV: "preview" });
    ok("C preview without server secret: DENY (missing_proxy_secret)",
      rPreviewNoSecret._status === 500 && rPreviewNoSecret.body.error === "missing_proxy_secret");
    var rPreviewDevNode = await statusFor({ VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "development" });
    ok("C preview with NODE_ENV=development still requires the secret", rPreviewDevNode._status === 500);
    ok("C provider never called for denied environments", providerBodies.length === beforeMatrix);
    var rVercelDev = await statusFor({ VERCEL: "1", VERCEL_ENV: "development" });
    ok("C vercel dev (VERCEL_ENV=development): ALLOW", rVercelDev._status === 200
      && providerBodies.length === beforeMatrix + 1);

    var sent = providerBodies.map(function(b) { return b.messages[0].content; }).join("\n");
    ok("A11 provider payload drops direct identifiers",
      sent.indexOf("Nombre Ficticio QA") < 0 && sent.indexOf("0000000-0") < 0
      && sent.indexOf("example.invalid") < 0 && sent.indexOf("000000000") < 0
      && sent.indexOf("anon-qa-fictitious") < 0);
    ok("A11 provider payload keeps non-identifying financial context",
      sent.indexOf("37000") >= 0 && sent.indexOf("Acreedor QA") >= 0);

    console.log("");
    console.log("PASSED: " + passed + "/" + (passed + failed));
    process.exit(failed > 0 ? 1 : 0);
  })().catch(function(e) {
    console.error(e);
    process.exit(1);
  });
})();
