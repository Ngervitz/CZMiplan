/**
 * V2-CTA-INTERACTION-01 — the 7 operative CTA cases in the real Mi Plan frontend (Playwright) against the
 * real Express app, real services and real RPCs on a throwaway embedded PostgreSQL 17 with every repo
 * migration (including 20261001180000_v2_cta_interaction_choices.sql) applied.
 *
 * Per case: the real UI reaches the dashboard (handoff journey V2), the case's financial facts are set in
 * CZState and the real shadow POST /v1/diagnoses runs; with CZ_V2_INTERACTION_ENABLED the plan tab mounts
 * the tools from GET /v1/diagnoses/:id/user-choices; the test types / clicks like a user and checks the
 * panel and the server state (financial_actions or registered contact step). Also: flag off -> no panel
 * and no user-choice request; client-side amount validation blocks the request.
 *
 * Deps: playwright (repo devDependency), MIPLAN_ISOLATED_DEPS (embedded-postgres + pg), JANUS repo
 * (JANUS_REPO_DIR) for the handoff context builder. No remote host is contacted.
 *
 * Usage: node -r ./server/testing/networkTrap.js dev/backend-arch/classifier-shadow/v2-interaction-e2e.js
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

function debt(monto, pago, sit) {
  return { monto: String(monto), pago: pago, situacion_ui: sit };
}
var FACTS = {
  CONTENCION_NO_ELIGIBLE_DEBT: { gastos: { vivienda: 40000, alimentacion: 12000 }, custom: [{ id: "c1", description: "Gym", amount: 3000 }], deudas: [], noDebts: true },
  MANTENIMIENTO_FLOW_ZERO: { gastos: { vivienda: 30000, alimentacion: 20000 }, custom: [], deudas: [], noDebts: true },
  CONTENCION_WITH_DEBT: { gastos: { vivienda: 40000 }, custom: [], deudas: [debt(100000, 15000, "pagando_normal")], noDebts: false },
  REGULARIZACION: { gastos: { vivienda: 20000 }, custom: [], deudas: [debt(50000, null, "deje_pagar")], noDebts: false },
  REDUCCION_CARGA: { gastos: { vivienda: 15000 }, custom: [], deudas: [debt(300000, 30000, "pagando_normal")], noDebts: false },
  CONSOLIDACION: { gastos: { vivienda: 15000 }, custom: [], deudas: [debt(100000, 5000, "pagando_normal")], noDebts: false },
  MANTENIMIENTO_SURPLUS: { gastos: { vivienda: 20000 }, custom: [], deudas: [], noDebts: true },
};

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function money(n) {
  return "$" + Number(n).toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  var dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "miplan-interaction-e2e-pg-"));
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

  async function openPage(name, interactionFlag) {
    var journey = await journeyService.createFromHandoffRedeem(ANON, "v2-interaction-" + name, JSON.parse(JSON.stringify(wiring.RAW_CONTEXTS.V2)));
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
              (interactionFlag ? " CZ_V2_INTERACTION_ENABLED = true;" : "") });
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
    await page.goto(srv.origin + "/e/v2-interaction-" + name);
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

  async function setFacts(page, facts) {
    var rec = current.rec;
    var start = rec.calls.length;
    var interactionOn = await page.evaluate(function () { return window.CZ_V2_INTERACTION_ENABLED === true; });
    await page.evaluate(function (f) {
      var st = window.CZState;
      st.deudas = f.deudas.map(function (d, i) {
        return Object.assign({ id: "deuda_e2e_" + i, tipo: "prestamo", acreedor: "Banco E2E " + (i + 1), acreedor_display: "Banco E2E " + (i + 1) }, d);
      });
      st.gastos = f.gastos;
      st.custom_expenses = f.custom;
      st.no_debts_declared = f.noDebts;
      window.CZShadowDiagnosis._resetDedupeForTests();
      window.CZShadowDiagnosis.maybeShadowDiagnosis(st, "v2_interaction_e2e");
    }, facts);
    // The panel of the previous diagnosis may already show the same case: wait until the new
    // diagnosis exists and (flag on) its user-choice state has been requested.
    var deadline = Date.now() + 15000;
    for (;;) {
      var fresh = rec.calls.slice(start);
      var post = fresh.filter(function (c) { return c.method === "POST" && c.path === "/v1/diagnoses"; }).pop();
      var done = !!post && (!interactionOn || fresh.some(function (c) {
        return c.method === "GET" && /\/user-choices$/.test(c.path) && fresh.indexOf(c) > fresh.indexOf(post);
      }));
      if (done) {
        current.iso = { diagnoses: diagnosisPosts(rec), legacy: await legacySnapshot(page) };
        return;
      }
      if (Date.now() > deadline) throw new Error("setFacts: new diagnosis not observed");
      await new Promise(function (r) { setTimeout(r, 50); });
    }
  }

  function diagnosisPosts(rec) {
    return rec.calls.filter(function (c) { return c.method === "POST" && c.path === "/v1/diagnoses"; }).length;
  }
  function legacySnapshot(page) {
    return page.evaluate(function () {
      var st = window.CZState;
      return JSON.stringify({ deudas: st.deudas, gastos: st.gastos, custom: st.custom_expenses, noDebts: st.no_debts_declared, diag: st.diag });
    });
  }
  async function isolationOf(handle) {
    var after = { diagnoses: diagnosisPosts(handle.rec), legacy: await legacySnapshot(handle.page) };
    return after.diagnoses === handle.iso.diagnoses && after.legacy === handle.iso.legacy;
  }

  function panelText(page) {
    return page.evaluate(function () {
      var p = document.getElementById("cz-v2-interaction");
      return p ? p.innerText : null;
    });
  }
  var current = null;
  async function waitPanel(page, predicateSrc, arg) {
    try {
      await page.waitForFunction(new Function("arg", "var p = document.getElementById('cz-v2-interaction'); if (!p) return false; " + predicateSrc), arg, { timeout: 15000 });
    } catch (e) {
      console.log("WAIT FAILED for " + JSON.stringify(arg) + "\npanel: " + JSON.stringify(await panelText(page)) +
        "\ncalls: " + JSON.stringify(current ? current.rec.calls.map(function (c) {
          return c.method + " " + c.path + " " + c.status + (c.body && c.body.choice_type ? " " + JSON.stringify(c.body) : "");
        }) : null));
      throw e;
    }
  }
  async function waitCase(page, kase) {
    await waitPanel(page, "var c = p.querySelector('[data-v2i-case]'); return !!c && c.getAttribute('data-v2i-case') === arg;", kase);
  }
  async function waitText(page, text) {
    await waitPanel(page, "return p.innerText.indexOf(arg) !== -1;", text);
  }
  async function waitNoText(page, text) {
    await waitPanel(page, "return p.innerText.indexOf(arg) === -1;", text);
  }
  async function serverState(rec) {
    var diag = rec.calls.filter(function (c) { return c.method === "GET" && /\/user-choices$/.test(c.path); }).pop();
    var r = await wiring.forward(apiPort, "GET", diag.path, { "x-miplan-anonymous-id": ANON }, null);
    return r.json;
  }
  function stepCount(page) {
    return page.evaluate(function () { return document.querySelectorAll("#cz-v2-interaction [data-v2i-step]").length; });
  }
  async function typeAmount(page, rowSelector, value, buttonAttr) {
    await page.fill("#cz-v2-interaction " + rowSelector + " input[data-v2i-input=\"amount\"]", value);
    await page.click("#cz-v2-interaction " + rowSelector + " [data-v2i=\"" + buttonAttr + "\"]");
  }
  function hasProgress(s) {
    return s.financial_actions.length > 0 || s.choices.creditor_contact_step.some(function (c) { return c.state !== "none"; });
  }

  var progress = {};
  var finals = {};
  var pageErrors = {};
  var isolation = {};
  try {
    // ---- flag off: nothing mounted, no user-choice request ----
    var off = await openPage("FLAG_OFF", false);
    await setFacts(off.page, FACTS.CONTENCION_NO_ELIGIBLE_DEBT);
    await off.page.waitForFunction(function () {
      var s = window.CZShadowDiagnosis.getStats();
      return s.match + s.mismatch + s.error >= 2;
    }, null, { timeout: 15000 });
    await off.page.waitForTimeout(800);
    var offState = await off.page.evaluate(function () {
      return { panel: !!document.getElementById("cz-v2-interaction"), v2: !!(window.CZShadowDiagnosis.getCurrentV2Strategy()), enabled: window.CZV2Interaction.isEnabled() };
    });
    check("flag off (V2 state on): V2 strategy stored but no panel, no GET/POST user-choices, 0 pageerror",
      offState.v2 === true && offState.panel === false && offState.enabled === false &&
      off.rec.calls.every(function (c) { return !/user-choices/.test(c.path); }) && off.rec.errors.length === 0, { offState: offState, errors: off.rec.errors });
    await off.context.close();

    // ---- 1. CONTENCION without eligible debt ----
    var o1 = await openPage("CONTENCION_NO_ELIGIBLE_DEBT", true);
    await setFacts(o1.page, FACTS.CONTENCION_NO_ELIGIBLE_DEBT);
    await waitCase(o1.page, "CONTENCION_NO_ELIGIBLE_DEBT");
    var t1 = await panelText(o1.page);
    var postsBefore = o1.rec.calls.filter(function (c) { return c.method === "POST" && /user-choices/.test(c.path); }).length;
    await typeAmount(o1.page, '[data-v2i-row="expense"][data-ref="alimentacion"]', "50.000", "expense-save");
    await o1.page.waitForSelector('#cz-v2-interaction [data-v2i-error="expense:alimentacion"]');
    var postsAfterInvalid = o1.rec.calls.filter(function (c) { return c.method === "POST" && /user-choices/.test(c.path); }).length;
    await typeAmount(o1.page, '[data-v2i-row="expense"][data-ref="vivienda"]', "5.000", "expense-save");
    await waitText(o1.page, "Pensás recortar " + money(5000));
    await typeAmount(o1.page, '[data-v2i-row="expense"][data-ref="custom:1"]', "3.000", "expense-save");
    await waitText(o1.page, "Recorte que estimaste: " + money(8000));
    var steps1 = await stepCount(o1.page);
    await o1.page.click('#cz-v2-interaction [data-v2i="expense-remove"][data-ref="custom:1"]');
    await waitText(o1.page, "Recorte que estimaste: " + money(5000));
    var s1 = await serverState(o1.rec);
    check("[CASE] 1 CONTENCION without eligible debt: the widget lists Vivienda / Alimentación / Otro gasto 1 with current amounts and the gap; " +
      "an amount above the expense is blocked client-side (no request); two intents -> 2 next steps; withdrawing one leaves 1 EXPENSE_REDUCTION_TARGET",
      /Vivienda/.test(t1) && /Alimentación/.test(t1) && /Otro gasto 1/.test(t1) && t1.indexOf("Gym") === -1 && /Diferencia actual/.test(t1) &&
      postsAfterInvalid === postsBefore && steps1 === 2 && s1.financial_actions.length === 1 &&
      s1.financial_actions[0].action_type === "EXPENSE_REDUCTION_TARGET" && s1.financial_actions[0].params.expense_ref === "vivienda" &&
      s1.financial_actions[0].params.target_reduction === 5000 && s1.financial_actions[0].params.current_amount === 40000,
    { t1: t1, steps1: steps1, s1: s1 && s1.financial_actions, posts: [postsBefore, postsAfterInvalid] });
    progress.CONTENCION_NO_ELIGIBLE_DEBT = hasProgress(s1);
    finals.CONTENCION_NO_ELIGIBLE_DEBT = s1.financial_actions;
    pageErrors.CONTENCION_NO_ELIGIBLE_DEBT = o1.rec.errors.slice(); isolation.CONTENCION_NO_ELIGIBLE_DEBT = await isolationOf(o1);
    await o1.context.close();

    // ---- 2. MANTENIMIENTO surplus 0 ----
    var o2 = await openPage("MANTENIMIENTO_FLOW_ZERO", true);
    await setFacts(o2.page, FACTS.MANTENIMIENTO_FLOW_ZERO);
    await waitCase(o2.page, "MANTENIMIENTO_FLOW_ZERO");
    await typeAmount(o2.page, '[data-v2i-row="expense"][data-ref="alimentacion"]', "2.000", "expense-save");
    await waitText(o2.page, "Pensás recortar " + money(2000));
    var t2 = await panelText(o2.page);
    var s2 = await serverState(o2.rec);
    check("[CASE] 2 MANTENIMIENTO surplus 0: 'Generar margen' expense widget; intent on Alimentación -> EXPENSE_REDUCTION_TARGET and a next step",
      /Generar margen/.test(t2) && /Intentar recortar/.test(t2) && s2.financial_actions.length === 1 &&
      s2.financial_actions[0].action_type === "EXPENSE_REDUCTION_TARGET" && s2.financial_actions[0].strategy === "MANTENIMIENTO_OPTIMIZACION", { t2: t2, s2: s2.financial_actions });
    progress.MANTENIMIENTO_FLOW_ZERO = hasProgress(s2);
    finals.MANTENIMIENTO_FLOW_ZERO = s2.financial_actions;
    pageErrors.MANTENIMIENTO_FLOW_ZERO = o2.rec.errors.slice(); isolation.MANTENIMIENTO_FLOW_ZERO = await isolationOf(o2);
    await o2.context.close();

    // ---- 3. CONTENCION with eligible debt ----
    var o3 = await openPage("CONTENCION_WITH_DEBT", true);
    await setFacts(o3.page, FACTS.CONTENCION_WITH_DEBT);
    await waitCase(o3.page, "CONTENCION_WITH_DEBT");
    var t3 = await panelText(o3.page);
    await o3.page.click('#cz-v2-interaction [data-v2i="lower"][data-index="0"]');
    await waitText(o3.page, "Vas a pedir una cuota más baja.");
    await typeAmount(o3.page, '[data-v2i-row="expense"][data-ref="vivienda"]', "4.000", "expense-save");
    await waitText(o3.page, "Pensás recortar " + money(4000));
    var s3 = await serverState(o3.rec);
    check("[CASE] 3 CONTENCION with eligible debt: both levers (Banco E2E 1 with its payment + expense widget) and the 'neither alone' note; " +
      "both chosen -> LOWER_PAYMENT_REQUEST + EXPENSE_REDUCTION_TARGET",
      /Banco E2E 1/.test(t3) && t3.indexOf("Cuota actual: " + money(15000)) !== -1 && /ninguno por sí solo asegura/.test(t3) &&
      s3.financial_actions.map(function (a) { return a.action_type; }).join() === "LOWER_PAYMENT_REQUEST,EXPENSE_REDUCTION_TARGET", { t3: t3, s3: s3.financial_actions });
    progress.CONTENCION_WITH_DEBT = hasProgress(s3);
    finals.CONTENCION_WITH_DEBT = s3.financial_actions;
    pageErrors.CONTENCION_WITH_DEBT = o3.rec.errors.slice(); isolation.CONTENCION_WITH_DEBT = await isolationOf(o3);
    await o3.context.close();

    // ---- 4. REGULARIZACION ----
    var o4 = await openPage("REGULARIZACION", true);
    await setFacts(o4.page, FACTS.REGULARIZACION);
    await waitCase(o4.page, "REGULARIZACION");
    var t4 = await panelText(o4.page);
    await o4.page.click('#cz-v2-interaction [data-v2i="contact"][data-index="0"][data-state="planned"]');
    await waitText(o4.page, "Vas a contactar al acreedor.");
    await o4.page.click('#cz-v2-interaction [data-v2i="contact"][data-index="0"][data-state="contacted"]');
    await waitText(o4.page, "Ya contactaste al acreedor.");
    var s4 = await serverState(o4.rec);
    await o4.page.click('#cz-v2-interaction [data-v2i="open-debts"]');
    await o4.page.waitForFunction(function () { return window.CZState.tab === "deudas" && !document.getElementById("cz-v2-interaction"); }, null, { timeout: 5000 });
    var debtsTab = await o4.page.evaluate(function () { return !!document.getElementById("btn-agregar-deuda") || !!document.querySelector(".debt-card"); });
    await o4.page.evaluate(function () { window.switchTab("plan"); });
    await waitText(o4.page, "Ya contactaste al acreedor.");
    check("[CASE] 4 REGULARIZACION: the mora debt is listed with 'Voy a contactar al acreedor' / 'Ya lo contacté'; planned -> contacted is registered " +
      "(no financial action, no offer); the link opens the existing debts tab and the step survives the tab round trip",
      /Banco E2E 1/.test(t4) && /Voy a contactar al acreedor/.test(t4) && /Ya lo contacté/.test(t4) &&
      s4.choices.creditor_contact_step.length === 1 && s4.choices.creditor_contact_step[0].state === "contacted" && s4.financial_actions.length === 0 && debtsTab,
    { t4: t4, s4: s4 && s4.choices, debtsTab: debtsTab });
    progress.REGULARIZACION = hasProgress(s4);
    finals.REGULARIZACION = s4.choices.creditor_contact_step;
    pageErrors.REGULARIZACION = o4.rec.errors.slice(); isolation.REGULARIZACION = await isolationOf(o4);
    await o4.context.close();

    // ---- 5. REDUCCION_CARGA ----
    var o5 = await openPage("REDUCCION_CARGA", true);
    await setFacts(o5.page, FACTS.REDUCCION_CARGA);
    await waitCase(o5.page, "REDUCCION_CARGA");
    await o5.page.click('#cz-v2-interaction [data-v2i="lower"][data-index="0"]');
    await waitText(o5.page, "Pedir una cuota más baja para Banco E2E 1");
    var s5 = await serverState(o5.rec);
    check("[CASE] 5 REDUCCION_CARGA: 'Quiero pedir una cuota más baja' -> LOWER_PAYMENT_REQUEST (30000) shown as a next step",
      s5.financial_actions.length === 1 && s5.financial_actions[0].action_type === "LOWER_PAYMENT_REQUEST" &&
      s5.financial_actions[0].params.monthly_debt_payment === 30000, s5.financial_actions);
    progress.REDUCCION_CARGA = hasProgress(s5);
    finals.REDUCCION_CARGA = s5.financial_actions;
    pageErrors.REDUCCION_CARGA = o5.rec.errors.slice(); isolation.REDUCCION_CARGA = await isolationOf(o5);
    await o5.context.close();

    // ---- 6. CONSOLIDACION ----
    var o6 = await openPage("CONSOLIDACION", true);
    await setFacts(o6.page, FACTS.CONSOLIDACION);
    await waitCase(o6.page, "CONSOLIDACION");
    await o6.page.selectOption('#cz-v2-interaction [data-v2i-input="target"]', "debt:0");
    await typeAmount(o6.page, '[data-v2i-row="surplus"]', "10.000", "surplus-save");
    await waitText(o6.page, "Destinar " + money(10000) + " por mes a pagar más de Banco E2E 1.");
    var s6a = await serverState(o6.rec);
    await o6.page.selectOption('#cz-v2-interaction [data-v2i-input="target"]', "reserve:emergency_fund");
    await typeAmount(o6.page, '[data-v2i-row="surplus"]', "30.000", "surplus-save");
    await waitText(o6.page, "Reservar " + money(30000) + " por mes para un fondo de emergencia.");
    var s6 = await serverState(o6.rec);
    check("[CASE] 6 CONSOLIDACION: surplus to Banco E2E 1 -> EXTRA_DEBT_PAYMENT; then the whole surplus to an emergency fund -> MONTHLY_RESERVE replaces it",
      s6a.financial_actions.length === 1 && s6a.financial_actions[0].action_type === "EXTRA_DEBT_PAYMENT" &&
      s6.financial_actions.length === 1 && s6.financial_actions[0].action_type === "MONTHLY_RESERVE" && s6.financial_actions[0].params.amount === 30000,
    { a: s6a.financial_actions, b: s6.financial_actions });
    progress.CONSOLIDACION = hasProgress(s6);
    finals.CONSOLIDACION = s6.financial_actions;
    pageErrors.CONSOLIDACION = o6.rec.errors.slice(); isolation.CONSOLIDACION = await isolationOf(o6);
    await o6.context.close();

    // ---- 7. MANTENIMIENTO surplus > 0 ----
    var o7 = await openPage("MANTENIMIENTO_SURPLUS", true);
    await setFacts(o7.page, FACTS.MANTENIMIENTO_SURPLUS);
    await waitCase(o7.page, "MANTENIMIENTO_SURPLUS");
    var t7 = await panelText(o7.page);
    await o7.page.selectOption('#cz-v2-interaction [data-v2i-input="target"]', "reserve:planned_goal");
    await typeAmount(o7.page, '[data-v2i-row="surplus"]', "10.000", "surplus-save");
    await waitText(o7.page, "Reservar " + money(10000) + " por mes para una meta planificada.");
    var s7 = await serverState(o7.rec);
    check("[CASE] 7 MANTENIMIENTO surplus 30000: no expense widget; reserve for a planned goal -> MONTHLY_RESERVE",
      t7.indexOf("Recortar gastos") === -1 && t7.indexOf("Generar margen") === -1 && t7.indexOf(money(30000)) !== -1 &&
      s7.financial_actions.length === 1 && s7.financial_actions[0].action_type === "MONTHLY_RESERVE" && s7.financial_actions[0].params.destination === "planned_goal",
    { t7: t7, s7: s7.financial_actions });
    progress.MANTENIMIENTO_SURPLUS = hasProgress(s7);
    finals.MANTENIMIENTO_SURPLUS = s7.financial_actions;
    pageErrors.MANTENIMIENTO_SURPLUS = o7.rec.errors.slice(); isolation.MANTENIMIENTO_SURPLUS = await isolationOf(o7);
    await o7.context.close();
  } finally {
    await browser.close();
    srv.server.close();
    await new Promise(function (r) { apiServer.close(r); });
    await db.stop();
  }

  var ids = Object.keys(FACTS);
  check("[CASE] all 7 cases end in a financial action or a registered step through the real UI " + JSON.stringify(progress),
    ids.every(function (id) { return progress[id] === true; }), progress);
  check("no pageerror in any case", ids.every(function (id) { return pageErrors[id] && pageErrors[id].length === 0; }), pageErrors);
  check("panel interaction is isolated from the legacy dashboard: no new POST /v1/diagnoses and identical CZState (deudas, gastos, custom, diag) in every case",
    ids.every(function (id) { return isolation[id] === true; }), isolation);
  console.log("summary: " + ids.map(function (id) {
    var f = finals[id] || [];
    return id + "=" + f.map(function (a) { return a.action_type || ("contact:" + a.state); }).join("+");
  }).join(" | "));
  var cases = results.filter(function (r) { return r.name.indexOf("[CASE] ") === 0 && /^\[CASE\] \d/.test(r.name); });
  console.log("E2E_UI_CASES: " + cases.filter(function (r) { return r.ok; }).length + "/" + cases.length);
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_INTERACTION_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
