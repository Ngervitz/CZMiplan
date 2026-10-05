/**
 * MVP wiring blockers — real Mi Plan frontend (Playwright) against the real Express app, real services and
 * real RPCs on a throwaway embedded PostgreSQL 17 with every repo migration applied (same harness as
 * v2-interaction-e2e.js).
 *
 * 1. INCOMPLETE: V2 incomplete -> missing-data card after the hero; the reason opens the existing debt editor;
 *    saving through the existing editor re-evaluates (recalcDiagYGuardar -> shadow POST) and the V2 strategy
 *    appears. atrasado_pagando without a current payment (debt contract v2) points to the existing editor, no inline input.
 * 2. MI DEUDA V2: no legacy MiDeuda CTA / card; separate opt-in (checkbox enables the button), POST
 *    debt-management-opt-in with a non-null consent_text_version, opted_in and withdrawn persisted; strategy,
 *    choices and FinancialActions identical before / after; no new diagnosis, legacy CZState untouched.
 * 3. PANORAMA: hero from the V2 strategy; flag off -> no panel, no slot, no user-choice request (B1).
 *
 * The opt-in copy is a test copy injected through config.local.js (the shipped config has none).
 *
 * Usage: node -r ./server/testing/networkTrap.js dev/backend-arch/classifier-shadow/v2-wiring-blockers-e2e.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
var http = require("http");
var path = require("path");
var crypto = require("crypto");
var pathToFileURL = require("url").pathToFileURL;
var createRequire = require("module").createRequire;
var chromium = require("playwright").chromium;

var wiring = require("./v2-wiring-e2e");
var ROOT = path.join(__dirname, "..", "..", "..");
var DEPS = process.env.MIPLAN_ISOLATED_DEPS || path.join(os.tmpdir(), "miplan-v2-isolated-pg17");
var pg = createRequire(path.join(DEPS, "package.json"))("pg");

var createApp = require("../../../server/app").createApp;
var loadConfig = require("../../../server/config").loadConfig;
var createDiagnosisService = require("../../../server/modules/diagnosis/service").createDiagnosisService;
var createDiagnosisRepository = require("../../../server/modules/diagnosis/repository").createDiagnosisRepository;
var createJourneyRepository = require("../../../server/modules/journey/repository").createJourneyRepository;
var createJourneyService = require("../../../server/modules/journey/service").createJourneyService;
var createUserChoiceRepository = require("../../../server/modules/userChoice/repository").createUserChoiceRepository;
var createUserChoiceService = require("../../../server/modules/userChoice/service").createUserChoiceService;
var sanitize = require("../../../server/modules/journey/sanitizeContext");

var SECRET = crypto.randomBytes(24).toString("hex");
var TENANT = "miplan-default";
var ANON = wiring.ANON;
var MOCK_API = wiring.MOCK_API;
var CORS = wiring.CORS;
var COPY = { text_version: "debt-mgmt-optin-e2e.v1", title: "Título E2E", body: "Texto E2E del interés en gestión de deudas.", consent_label: "Acepto (texto E2E)" };

function debt(monto, pago, sit) {
  return { monto: String(monto), pago: pago, situacion_ui: sit };
}
var FACTS = {
  INCOMPLETE_UNSURE: { gastos: { vivienda: 15000 }, custom: [], deudas: [debt(100000, "5000", "no_seguro")], noDebts: false },
  PENDING_LAST_KNOWN: { gastos: { vivienda: 15000 }, custom: [], deudas: [debt(100000, "5000", "atrasado_pagando")], noDebts: false },
  // Card debt in mora 90+ days: legacy recommends MiDeuda and V2 classifies REGULARIZACION.
  REGULARIZACION: { gastos: { vivienda: 20000 }, custom: [],
    deudas: [Object.assign(debt(50000, null, "deje_pagar"), { tipo: "tarjeta", atraso_tiempo: "mas_90" })], noDebts: false },
  REDUCCION_CARGA: { gastos: { vivienda: 15000 }, custom: [], deudas: [debt(300000, 30000, "pagando_normal")], noDebts: false },
};
var LEGACY_MIDEUDA = /Ordenar mi deuda|mideuda-partner-card|chk-mideuda-optin|btn-mideuda-continue|btn-retry-fallback-deuda/;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeRpcClient(pool) {
  var sigCache = {};
  async function signature(name, keys) {
    if (!sigCache[name]) {
      var r = await pool.query(
        "SELECT p.proargnames AS names, p.pronargs AS nargs, p.pronargdefaults AS ndef, oidvectortypes(p.proargtypes) AS types " +
        "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1", [name]);
      sigCache[name] = r.rows.map(function (row) {
        return { names: row.names, types: row.types.split(", "), required: row.names.slice(0, row.nargs - row.ndef) };
      });
    }
    var sigs = sigCache[name];
    var exact = sigs.filter(function (s) { return s.names.length === keys.length && keys.every(function (k) { return s.names.indexOf(k) !== -1; }); });
    if (exact.length === 1) return exact[0];
    var fit = sigs.filter(function (s) {
      return keys.every(function (k) { return s.names.indexOf(k) !== -1; }) && s.required.every(function (k) { return keys.indexOf(k) !== -1; });
    });
    if (fit.length === 1) return fit[0];
    throw new Error("RPC_SIGNATURE_UNRESOLVED " + name);
  }
  return {
    rpc: async function (name, params) {
      try {
        var keys = Object.keys(params);
        var sig = await signature(name, keys);
        var values = [];
        var args = keys.map(function (k, i) {
          var type = sig.types[sig.names.indexOf(k)];
          var v = params[k];
          values.push(v == null ? null : type === "jsonb" ? JSON.stringify(v) : v);
          return k + " => $" + (i + 1) + "::" + type;
        });
        var r = await pool.query("SELECT public." + name + "(" + args.join(", ") + ") AS v", values);
        return { data: r.rows[0].v, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e.message), code: e.code } };
      }
    },
  };
}

async function startDatabase() {
  var EmbeddedPostgres = (await import(pathToFileURL(path.join(DEPS, "node_modules", "embedded-postgres", "dist", "index.js")).href)).default;
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-wiring-blockers-pg-"));
  var port = 54000 + Math.floor(Math.random() * 900);
  var password = crypto.randomBytes(12).toString("hex");
  var server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: password, port: port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: function () {}, onError: function () {} });
  await server.initialise();
  await server.start();
  await server.createDatabase("miplan_isolated");
  var pool = new pg.Pool({ host: "127.0.0.1", port: port, user: "postgres", password: password, database: "miplan_isolated", max: 10 });
  await pool.query(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" +
    "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;" +
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
  var dir = path.join(ROOT, "server", "migrations");
  var files = fs.readdirSync(dir).filter(function (f) { return /\.sql$/.test(f); }).sort();
  for (var i = 0; i < files.length; i++) await pool.query(fs.readFileSync(path.join(dir, files[i]), "utf8"));
  await pool.query("INSERT INTO miplan_private.backend_secrets (name, secret) VALUES ('b2_persist', $1)", [SECRET]);
  return {
    pool: pool,
    lastMigration: files[files.length - 1],
    stop: async function () {
      await pool.end();
      await server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function main() {
  var db = await startDatabase();
  var client = makeRpcClient(db.pool);
  var journeyService = createJourneyService({ repository: createJourneyRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }), tenantId: TENANT });
  var svc = createDiagnosisService({ repository: createDiagnosisRepository({ client: client, backendSecret: SECRET, tenantId: TENANT }),
    tenantId: TENANT, journeyService: journeyService });
  var ucService = createUserChoiceService({ repository: createUserChoiceRepository({ client: client, backendSecret: SECRET }), interactionEnabled: true });
  var app = createApp(loadConfig({ NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "", MIPLAN_BACKEND_SECRET: "" }),
  { journeyService: journeyService, diagnosisService: svc, userChoiceService: ucService });
  var apiServer = http.createServer(app);
  await new Promise(function (r) { apiServer.listen(0, "127.0.0.1", r); });
  var apiPort = apiServer.address().port;
  var srv = await wiring.startStaticServer();
  var browser = await chromium.launch();
  console.log("isolated PostgreSQL + real app; last migration applied: " + db.lastMigration);
  var current = null;

  async function openPage(name, interactionFlag) {
    var journey = await journeyService.createFromHandoffRedeem(ANON, "v2-wiring-" + name, JSON.parse(JSON.stringify(wiring.RAW_CONTEXTS.V2)));
    var rec = { journeyId: journey.journey_id, calls: [], errors: [] };
    var context = await browser.newContext({ locale: "es-UY" });
    await context.addInitScript(function (anon) {
      try { if (!localStorage.getItem("cz_anonymous_id")) localStorage.setItem("cz_anonymous_id", anon); } catch (_e) { /* ignore */ }
    }, ANON);
    await context.route("**/*", async function (route) {
      var req = route.request();
      var url = req.url();
      try {
        if (url.indexOf(srv.origin + "/js/config.local.js") === 0) {
          return await route.fulfill({ status: 200, contentType: "application/javascript",
            body: "CZ_BACKEND_API_URL = " + JSON.stringify(MOCK_API) + "; CZ_SHADOW_MODE = true; CZ_V2_STRATEGY_STATE_ENABLED = true;" +
              (interactionFlag ? " CZ_V2_INTERACTION_ENABLED = true; CZ_V2_DEBT_MANAGEMENT_OPTIN_COPY = " + JSON.stringify(COPY) + ";" : "") });
        }
        if (url.indexOf(srv.origin) === 0) return await route.continue();
        if (url.indexOf(MOCK_API) === 0) {
          if (req.method() === "OPTIONS") return await route.fulfill({ status: 204, headers: CORS });
          var p = url.slice(MOCK_API.length);
          if (p.indexOf("/v1/handoff/redeem") === 0) {
            return await route.fulfill({ status: 200, headers: CORS, contentType: "application/json",
              body: JSON.stringify({ ok: true, journey_id: rec.journeyId, cached: false, durable: true,
                context: sanitize.sanitizeHandoffContext(JSON.parse(JSON.stringify(wiring.RAW_CONTEXTS.V2))) }) });
          }
          var fwd = await wiring.forward(apiPort, req.method(), p, req.headers(), req.postData());
          rec.calls.push({ method: req.method(), path: p.split("?")[0], status: fwd.status, body: req.postData() ? JSON.parse(req.postData()) : null });
          return await route.fulfill({ status: fwd.status, headers: CORS, contentType: "application/json", body: fwd.raw });
        }
        return await route.abort();
      } catch (_e) {
        /* context closed */
      }
    });
    var page = await context.newPage();
    page.on("pageerror", function (e) { rec.errors.push(String(e && e.message)); });
    await page.goto(srv.origin + "/e/v2-wiring-" + name);
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
    await wiring.toDashboard(page, "complete");
    await page.waitForFunction(function () {
      var s = window.CZShadowDiagnosis.getStats();
      return s.match + s.mismatch + s.error >= 1;
    }, null, { timeout: 15000 });
    await page.waitForFunction(function () { return !document.querySelector(".cz-celebration-root"); }, null, { timeout: 10000 });
    current = { context: context, page: page, rec: rec };
    return current;
  }

  function diagnosisPosts(rec) {
    return rec.calls.filter(function (c) { return c.method === "POST" && c.path === "/v1/diagnoses"; }).length;
  }
  async function waitNewDiagnosis(rec, start, needUserChoices) {
    var deadline = Date.now() + 15000;
    for (;;) {
      var fresh = rec.calls.slice(start);
      var post = fresh.filter(function (c) { return c.method === "POST" && c.path === "/v1/diagnoses"; }).pop();
      var done = !!post && (!needUserChoices || fresh.some(function (c) {
        return c.method === "GET" && /\/user-choices$/.test(c.path) && fresh.indexOf(c) > fresh.indexOf(post);
      }));
      if (done) return;
      if (Date.now() > deadline) throw new Error("new diagnosis not observed");
      await new Promise(function (r) { setTimeout(r, 50); });
    }
  }
  // recalc: the app's own path (recalcDiagYGuardar: legacy engine + shadow POST), so the legacy diag
  // (recommended_tools) matches the facts; otherwise only the shadow POST runs.
  async function setFacts(page, facts, needUserChoices, recalc) {
    var start = current.rec.calls.length;
    await page.evaluate(function (args) {
      var f = args.f;
      var st = window.CZState;
      st.deudas = f.deudas.map(function (d, i) {
        return Object.assign({ id: "deuda_e2e_" + i, tipo: "prestamo", acreedor: "Banco E2E " + (i + 1), acreedor_display: "Banco E2E " + (i + 1) }, d);
      });
      st.gastos = f.gastos;
      st.custom_expenses = f.custom;
      st.no_debts_declared = f.noDebts;
      window.CZShadowDiagnosis._resetDedupeForTests();
      if (args.recalc) {
        window.recalcDiagYGuardar();
        window.CredizonaUI.renderTab();
      } else {
        window.CZShadowDiagnosis.maybeShadowDiagnosis(st, "v2_wiring_e2e");
      }
    }, { f: facts, recalc: !!recalc });
    await waitNewDiagnosis(current.rec, start, needUserChoices);
    await page.waitForFunction(function () { return !document.querySelector(".cz-celebration-root"); }, null, { timeout: 10000 });
  }
  function legacySnapshot(page) {
    return page.evaluate(function () {
      var st = window.CZState;
      return JSON.stringify({ deudas: st.deudas, gastos: st.gastos, custom: st.custom_expenses, noDebts: st.no_debts_declared, diag: st.diag });
    });
  }
  async function waitPanel(page, predicateSrc, arg) {
    try {
      await page.waitForFunction(new Function("arg", "var p = document.getElementById('cz-v2-interaction'); if (!p) return false; " + predicateSrc), arg, { timeout: 15000 });
    } catch (e) {
      console.log("WAIT FAILED for " + JSON.stringify(arg) + "\npanel: " + JSON.stringify(await page.evaluate(function () {
        var p = document.getElementById("cz-v2-interaction");
        return p ? p.innerText : null;
      })));
      throw e;
    }
  }
  async function serverState(rec) {
    var diag = rec.calls.filter(function (c) { return c.method === "GET" && /\/user-choices$/.test(c.path); }).pop();
    var r = await wiring.forward(apiPort, "GET", diag.path, { "x-miplan-anonymous-id": ANON }, null);
    return r.json;
  }
  function financial(s) {
    return { strategy: s.strategy, status: s.classification_status, choices: s.choices, fa: s.financial_actions };
  }
  function domSummary(page) {
    return page.evaluate(function () {
      var tab = document.getElementById("tab-content");
      var hero = document.getElementById("cz-dashboard-hero");
      var panel = document.getElementById("cz-v2-interaction");
      return {
        tabHtml: tab ? tab.innerHTML : "",
        heroText: hero ? hero.innerText : "",
        heroStrategy: hero ? hero.getAttribute("data-v2-strategy") : null,
        panelInSlot: !!(panel && panel.parentNode && panel.parentNode.hasAttribute("data-v2i-slot")),
        panelHtml: panel ? panel.innerHTML : null,
        recommendedTools: (window.CZState.diag && window.CZState.diag.recommended_tools) || [],
      };
    });
  }

  var pageErrors = {};
  try {
    // ---- 1. INCOMPLETE -> existing editor -> re-evaluation -> strategy ----
    var o1 = await openPage("INCOMPLETE", true);
    var startInc = o1.rec.calls.length;
    await setFacts(o1.page, FACTS.INCOMPLETE_UNSURE, false);
    await waitPanel(o1.page, "return !!p.querySelector('[data-v2i-widget=\"verification\"]');", "verification");
    var d1 = await domSummary(o1.page);
    check("[INCOMPLETE] V2 incomplete: hero shows the incomplete state without a strategy; missing-data card in the slot after the hero names " +
      "Banco E2E 1, the missing situation and 'Editar esta deuda'; no input in the card; no user-choice request for the incomplete diagnosis",
      /Tu diagnóstico todavía no está completo/.test(d1.heroText) && d1.heroStrategy === null && d1.panelInSlot &&
      /Banco E2E 1/.test(d1.panelHtml) && /Falta indicar si está al día o atrasada/.test(d1.panelHtml) &&
      /data-deuda-editar="0"/.test(d1.panelHtml) && !/<input|<select/.test(d1.panelHtml) &&
      o1.rec.calls.slice(startInc).every(function (c) { return !/user-choices/.test(c.path); }), { hero: d1.heroText, panel: d1.panelHtml, inSlot: d1.panelInSlot });

    await o1.page.click('#cz-v2-interaction [data-deuda-editar="0"]');
    await o1.page.waitForFunction(function () { return window.CZState.tab === "deudas" && window.CZState.editing_debt_index === 0; }, null, { timeout: 5000 });
    check("[INCOMPLETE] the reason opens the existing debt editor for that debt (tab deudas, editing_debt_index 0)", true);

    var startFix = o1.rec.calls.length;
    await o1.page.click('[data-deuda-situacion="pagando_normal"][data-deuda-idx="0"]');
    await o1.page.click("#btn-guardar-deuda-edicion");
    await waitNewDiagnosis(o1.rec, startFix, false);
    await o1.page.evaluate(function () { window.switchTab("plan"); });
    await o1.page.waitForFunction(function () {
      var h = document.getElementById("cz-dashboard-hero");
      return !!h && !!h.getAttribute("data-v2-strategy");
    }, null, { timeout: 15000 });
    await waitPanel(o1.page, "var c = p.querySelector('[data-v2i-case]'); return !!c;", "case");
    var d1b = await domSummary(o1.page);
    var v2b = await o1.page.evaluate(function () { var v = window.CZShadowDiagnosis.getCurrentV2Strategy(); return v && v.result; });
    check("[INCOMPLETE] saving the existing editor re-evaluates (new POST /v1/diagnoses) and the V2 strategy appears: classified hero (" +
      (d1b.heroStrategy || "none") + ") and the strategy tools replace the missing-data card",
      v2b && v2b.classification_status === "classified" && d1b.heroStrategy === v2b.strategy &&
      !/data-v2i-widget="verification"/.test(d1b.panelHtml) && /data-v2i-case=/.test(d1b.panelHtml) && d1b.panelInSlot,
    { v2: v2b && { s: v2b.classification_status, st: v2b.strategy, r: v2b.verification.reasons }, hero: d1b.heroText });
    pageErrors.INCOMPLETE = o1.rec.errors.slice();
    await o1.context.close();

    // ---- 1b. atrasado_pagando without a current payment (debt contract v2): editable, no inline input ----
    var o1b = await openPage("PENDING", true);
    await setFacts(o1b.page, FACTS.PENDING_LAST_KNOWN, false);
    await waitPanel(o1b.page, "return !!p.querySelector('[data-v2i-widget=\"verification\"]');", "verification");
    var d1p = await domSummary(o1b.page);
    var p1b = o1b.rec.calls.filter(function (c) { return c.method === "POST" && c.path === "/v1/diagnoses"; }).pop();
    var in1b = p1b && (p1b.body.input || p1b.body);
    check("[INCOMPLETE] atrasado_pagando under debt contract v2 without pago_mensual_actual: 'Falta la cuota mensual.' + the existing " +
      "debt editor (where the current payment is captured); no 'solo tenemos el último pago', no pending note, no inline input",
      !!in1b && in1b.debt_contract_version === "v2" && !Object.prototype.hasOwnProperty.call(in1b.deudas[0], "pago_mensual_actual") &&
      /Falta la cuota mensual\./.test(d1p.panelHtml) && /data-deuda-editar="0"/.test(d1p.panelHtml) &&
      !/solo tenemos el último pago/.test(d1p.panelHtml) && !/data-v2i-pending="1"/.test(d1p.panelHtml) &&
      !/<input|<select/.test(d1p.panelHtml), { marker: in1b && in1b.debt_contract_version, html: d1p.panelHtml });
    pageErrors.PENDING = o1b.rec.errors.slice();
    await o1b.context.close();

    // ---- 2. MI DEUDA V2 opt-in (REGULARIZACION) ----
    var o2 = await openPage("OPTIN_REG", true);
    await setFacts(o2.page, FACTS.REGULARIZACION, true, true);
    await waitPanel(o2.page, "return !!p.querySelector('[data-v2i-widget=\"debt-optin\"]');", "debt-optin");
    var d2 = await domSummary(o2.page);
    var btnState = await o2.page.evaluate(function () {
      var b = document.querySelector('#cz-v2-interaction [data-v2i="optin"][data-state="opted_in"]');
      return b ? b.disabled : null;
    });
    await o2.page.check('#cz-v2-interaction [data-v2i-input="optin-consent"]');
    var btnAfterCheck = await o2.page.evaluate(function () {
      return document.querySelector('#cz-v2-interaction [data-v2i="optin"][data-state="opted_in"]').disabled;
    });
    check("[MI DEUDA V2] REGULARIZACION: no legacy MiDeuda CTA / card / fallback; separate opt-in card with the checkbox unchecked and the button " +
      "disabled until checked; the opt-in is not a next step (recommended_tools=" + JSON.stringify(d2.recommendedTools) + ")",
      d2.heroStrategy === "REGULARIZACION" && d2.recommendedTools.indexOf("mideuda") !== -1 && !LEGACY_MIDEUDA.test(d2.tabHtml) &&
      btnState === true && btnAfterCheck === false &&
      !/data-v2i-widget="next-steps"[\s\S]*data-v2i-widget="debt-optin"[\s\S]*<\/ul>/.test(d2.panelHtml),
    { legacy: (d2.tabHtml.match(LEGACY_MIDEUDA) || [])[0], btnState: btnState, btnAfterCheck: btnAfterCheck });

    var before2 = financial(await serverState(o2.rec));
    var iso2 = { diagnoses: diagnosisPosts(o2.rec), legacy: await legacySnapshot(o2.page) };
    await o2.page.click('#cz-v2-interaction [data-v2i="optin"][data-state="opted_in"]');
    await waitPanel(o2.page, "return !!p.querySelector('[data-v2i-optin-state=\"opted_in\"]');", "opted_in");
    var afterIn2 = await serverState(o2.rec);
    var rowsIn = (await db.pool.query("SELECT state, consent_text_version FROM public.debt_management_opt_in_events ORDER BY created_at, state")).rows;
    var optPosts = o2.rec.calls.filter(function (c) { return c.method === "POST" && /debt-management-opt-in$/.test(c.path); });
    await o2.page.click('#cz-v2-interaction [data-v2i="optin"][data-state="withdrawn"]');
    await waitPanel(o2.page, "return !!p.querySelector('[data-v2i-optin-state=\"withdrawn\"]');", "withdrawn");
    var afterOut2 = await serverState(o2.rec);
    var rowsOut = (await db.pool.query("SELECT state, consent_text_version FROM public.debt_management_opt_in_events ORDER BY created_at")).rows;
    optPosts = o2.rec.calls.filter(function (c) { return c.method === "POST" && /debt-management-opt-in$/.test(c.path); });
    check("[MI DEUDA V2] POST debt-management-opt-in bodies carry consent_text_version '" + COPY.text_version + "' (non-null) and diagnosis_id",
      optPosts.length === 2 && optPosts.every(function (c) { return c.body.consent_text_version === COPY.text_version && !!c.body.diagnosis_id; }) &&
      optPosts[0].body.state === "opted_in" && optPosts[1].body.state === "withdrawn", optPosts.map(function (c) { return c.body; }));
    check("[MI DEUDA V2] opted_in then withdrawn persisted in PostgreSQL with the copy version and read back by GET user-choices; " +
      "third_party_sharing_authorized false",
      rowsIn.length === 1 && rowsIn[0].state === "opted_in" && rowsIn[0].consent_text_version === COPY.text_version &&
      rowsOut.length === 2 && rowsOut[1].state === "withdrawn" && rowsOut[1].consent_text_version === COPY.text_version &&
      afterIn2.debt_management_opt_in.state === "opted_in" && afterOut2.debt_management_opt_in.state === "withdrawn" &&
      afterOut2.debt_management_opt_in.third_party_sharing_authorized === false, { rowsIn: rowsIn, rowsOut: rowsOut });
    var iso2After = { diagnoses: diagnosisPosts(o2.rec), legacy: await legacySnapshot(o2.page) };
    check("[MI DEUDA V2] strategy / choices / FinancialActions identical before, after opt-in and after withdrawal; no new diagnosis, legacy CZState unchanged",
      same(before2, financial(afterIn2)) && same(before2, financial(afterOut2)) && same(iso2, iso2After), { before: before2, after: financial(afterOut2) });
    pageErrors.OPTIN_REG = o2.rec.errors.slice();
    await o2.context.close();

    // ---- 2b. opt-in leaves an existing FinancialAction untouched (REDUCCION_CARGA) ----
    var o3 = await openPage("OPTIN_RC", true);
    await setFacts(o3.page, FACTS.REDUCCION_CARGA, true);
    await waitPanel(o3.page, "var c = p.querySelector('[data-v2i-case]'); return !!c && c.getAttribute('data-v2i-case') === arg;", "REDUCCION_CARGA");
    await o3.page.click('#cz-v2-interaction [data-v2i="lower"][data-index="0"]');
    await waitPanel(o3.page, "return p.innerText.indexOf(arg) !== -1;", "Pedir una cuota más baja para Banco E2E 1");
    var before3 = financial(await serverState(o3.rec));
    await o3.page.check('#cz-v2-interaction [data-v2i-input="optin-consent"]');
    await o3.page.click('#cz-v2-interaction [data-v2i="optin"][data-state="opted_in"]');
    await waitPanel(o3.page, "return !!p.querySelector('[data-v2i-optin-state=\"opted_in\"]');", "opted_in");
    var mid3 = financial(await serverState(o3.rec));
    await o3.page.click('#cz-v2-interaction [data-v2i="optin"][data-state="withdrawn"]');
    await waitPanel(o3.page, "return !!p.querySelector('[data-v2i-optin-state=\"withdrawn\"]');", "withdrawn");
    var after3 = financial(await serverState(o3.rec));
    var steps3 = await o3.page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll("#cz-v2-interaction [data-v2i-step]"), function (li) { return li.innerText; });
    });
    check("[MI DEUDA V2] REDUCCION_CARGA with a LOWER_PAYMENT_REQUEST: opt-in and withdrawal keep the same single FinancialAction; " +
      "'Tus próximos pasos' never lists the opt-in",
      before3.fa.length === 1 && before3.fa[0].action_type === "LOWER_PAYMENT_REQUEST" && same(before3, mid3) && same(before3, after3) &&
      steps3.length === 1 && !/inter[eé]s/i.test(steps3.join(" ")), { before: before3.fa, steps: steps3 });
    pageErrors.OPTIN_RC = o3.rec.errors.slice();
    await o3.context.close();

    // ---- 3. flag off (B1) ----
    var off = await openPage("FLAG_OFF", false);
    await setFacts(off.page, FACTS.REGULARIZACION, false, true);
    await off.page.waitForTimeout(800);
    var dOff = await domSummary(off.page);
    var mideudaRecommended = dOff.recommendedTools.indexOf("mideuda") !== -1;
    check("[B1] flag off: no V2 panel, no slot, no V2 hero, no user-choice / opt-in request; legacy MiDeuda card rendered when recommended (" +
      mideudaRecommended + ")",
      dOff.panelHtml === null && !/data-v2i-slot/.test(dOff.tabHtml) && dOff.heroStrategy === null &&
      off.rec.calls.every(function (c) { return !/user-choices|debt-management-opt-in/.test(c.path); }) &&
      mideudaRecommended && /id="mideuda-partner-card"/.test(dOff.tabHtml) && /id="chk-mideuda-optin"/.test(dOff.tabHtml), { tools: dOff.recommendedTools });
    pageErrors.FLAG_OFF = off.rec.errors.slice();
    await off.context.close();
  } finally {
    await browser.close();
    srv.server.close();
    await new Promise(function (r) { apiServer.close(r); });
    await db.stop();
  }

  check("no pageerror in any scenario", Object.keys(pageErrors).every(function (k) { return pageErrors[k].length === 0; }), pageErrors);
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_WIRING_BLOCKERS_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
