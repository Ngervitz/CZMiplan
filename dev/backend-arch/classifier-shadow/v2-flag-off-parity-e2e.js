/**
 * V2 flags OFF -> legacy parity of the shadow POST cadence (HEAD frontend vs candidate frontend).
 *
 * The same user script runs on three frontends served from 127.0.0.1, all against the real Express app
 * (memory repositories, helpers from v2-wiring-e2e.js):
 *   BASELINE   committed HEAD frontend (git archive, or CZ_PARITY_BASELINE_ROOT)
 *   CANDIDATE  this tree (or CZ_PARITY_CANDIDATE_ROOT), V2 flags at their committed defaults (OFF)
 *   CONTROL    this tree with CZ_V2_STRATEGY_STATE_ENABLED = true
 *
 * Checkpoints (POST /v1/diagnoses counted after each one):
 *   [A] dashboard: first POST, held in flight; meanwhile a debt quick edit and a recalc save
 *   [B] release: in-flight edits are dropped by the legacy cadence (V2 on: one rerun with the latest input)
 *   [C] debt quick edit while idle: legacy never posts (V2 on: posts)
 *   [D] a failing POST opens the 15 s cooldown; a recalc save during the cooldown is dropped by the
 *       legacy cadence, also after the cooldown expires (V2 on: re-sent once it expires)
 *   [E] refresh: legacy never posts (V2 on: session restore posts)
 * CANDIDATE must equal BASELINE at every checkpoint (count and posted debt / expense values), with no
 * user-choice request, no V2 panel, no _v2FinancialStrategy key and 0 pageerror. CONTROL must differ
 * exactly where the V2 wiring needs it. Typed amounts are plain digits (same reading in every tree).
 *
 * Usage: node -r ./server/testing/networkTrap.js dev/backend-arch/classifier-shadow/v2-flag-off-parity-e2e.js
 */
"use strict";

var http = require("http");
var fs = require("fs");
var os = require("os");
var path = require("path");
var childProcess = require("child_process");
var chromium = require("playwright").chromium;

var h = require("./v2-wiring-e2e");
var sanitize = require("../../../server/modules/journey/sanitizeContext");

var ROOT = path.join(__dirname, "..", "..", "..");
var COOLDOWN_MS = 15000;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function baselineRoot() {
  if (process.env.CZ_PARITY_BASELINE_ROOT) return process.env.CZ_PARITY_BASELINE_ROOT;
  var sha = childProcess.execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]).toString().trim();
  var dir = path.join(os.tmpdir(), "cz-parity-head-" + sha);
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    fs.mkdirSync(dir, { recursive: true });
    var tar = path.join(os.tmpdir(), "cz-parity-head-" + sha + ".tar");
    childProcess.execFileSync("git", ["-C", ROOT, "archive", "--format=tar", "-o", tar, "HEAD", "index.html", "favicon.svg", "js", "css", "assets"]);
    childProcess.execFileSync("tar", ["-xf", tar, "-C", dir]);
    fs.unlinkSync(tar);
  }
  return dir;
}

function startStatic(root) {
  var server = http.createServer(function (req, res) {
    var urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/" || /^\/e\//.test(urlPath)) urlPath = "/index.html";
    var file = path.join(root, urlPath);
    if (file.indexOf(root) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    var ext = path.extname(file);
    res.writeHead(200, { "Content-Type": ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "text/html" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, origin: "http://127.0.0.1:" + server.address().port }); });
  });
}

async function openSession(browser, origin, label, v2On, api) {
  var journey = await h.journeyService.createFromHandoffRedeem(h.ANON, "v2-parity-" + label, JSON.parse(JSON.stringify(h.RAW_CONTEXTS.V1)));
  var rec = { journeyId: journey.journey_id, posts: [], other: [], pending: [], errors: [], holdNext: 0, failDiagnoses: false };
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
          body: "CZ_BACKEND_API_URL = " + JSON.stringify(h.MOCK_API) + "; CZ_SHADOW_MODE = true;" +
            (v2On ? " CZ_V2_STRATEGY_STATE_ENABLED = true;" : "") });
      }
      if (url.indexOf(origin) === 0) return await route.continue();
      if (url.indexOf(h.MOCK_API) === 0) {
        if (req.method() === "OPTIONS") return await route.fulfill({ status: 204, headers: h.CORS });
        var p = url.slice(h.MOCK_API.length);
        if (p.indexOf("/v1/handoff/redeem") === 0) {
          return await route.fulfill({ status: 200, headers: h.CORS, contentType: "application/json",
            body: JSON.stringify({ ok: true, journey_id: rec.journeyId, cached: false, durable: true,
              context: sanitize.sanitizeHandoffContext(JSON.parse(JSON.stringify(h.RAW_CONTEXTS.V1))) }) });
        }
        if (req.method() === "POST" && p.split("?")[0] === "/v1/diagnoses") {
          var body = JSON.parse(req.postData());
          var entry = { monto: body.deudas && body.deudas[0] ? String(body.deudas[0].monto) : null,
            vivienda: body.gastos ? String(body.gastos.vivienda) : null, failed: rec.failDiagnoses };
          rec.posts.push(entry);
          if (rec.failDiagnoses) {
            return await route.fulfill({ status: 503, headers: h.CORS, contentType: "application/json",
              body: JSON.stringify({ error: "SUPABASE_CONFIG_MISSING", message: "parity test" }) });
          }
          var fwd = await h.forward(api.port, req.method(), p, req.headers(), req.postData());
          if (rec.holdNext > 0) {
            rec.holdNext -= 1;
            await new Promise(function (resolve) { rec.pending.push(resolve); });
          }
          return await route.fulfill({ status: fwd.status, headers: h.CORS, contentType: "application/json", body: fwd.raw });
        }
        rec.other.push(req.method() + " " + p.split("?")[0]);
        var other = await h.forward(api.port, req.method(), p, req.headers(), req.postData());
        return await route.fulfill({ status: other.status, headers: h.CORS, contentType: "application/json", body: other.raw });
      }
      return await route.abort();
    } catch (_e) {
      /* context closed */
    }
  });
  var page = await context.newPage();
  page.on("pageerror", function (e) { rec.errors.push(String(e && e.message)); });
  await page.goto(origin + "/e/v2-parity-" + label);
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
  }, n, { timeout: 30000 });
}

async function waitFor(fn, page, ms) {
  var t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await page.waitForTimeout(40);
  return fn();
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

function recalcWithVivienda(page, value) {
  return page.evaluate(function (v) {
    window.CZState.gastos.vivienda = v;
    window.recalcDiagYGuardar();
  }, value);
}

function v2Footprint(page) {
  return page.evaluate(function () {
    return {
      has_key: Object.prototype.hasOwnProperty.call(window.CZState, "_v2FinancialStrategy"),
      panel: !!document.getElementById("cz-v2-interaction"),
      step: window.CZState.step,
      diag: !!window.CZState.diag,
    };
  });
}

// Settle window after each checkpoint: long enough for a rerun (0 ms after the response) or a
// quick-edit / restore POST to have been issued; the counts are then compared, not timed.
var SETTLE_MS = 2500;

async function runScript(browser, origin, label, v2On, api) {
  var o = await openSession(browser, origin, label, v2On, api);
  var page = o.page;
  var rec = o.rec;
  var cp = {};
  try {
    // [A] dashboard, first POST held; edits while it is in flight
    rec.holdNext = 1;
    await h.toDashboard(page, "classified");
    if (!(await waitFor(function () { return rec.pending.length >= 1; }, page, 20000))) throw new Error(label + ": first POST not observed");
    await quickEditMonto(page, "90000");
    await recalcWithVivienda(page, "21000");
    await page.waitForTimeout(300);
    cp.A = rec.posts.length;

    // [B] release; the in-flight edits are either dropped (legacy) or re-run once (V2)
    rec.pending.splice(0).forEach(function (f) { f(); });
    await waitProcessed(page, 1);
    await page.waitForTimeout(SETTLE_MS);
    await waitProcessed(page, rec.posts.filter(function (p) { return !p.failed; }).length);
    cp.B = rec.posts.length;

    // [C] quick edit while idle
    await quickEditMonto(page, "80000");
    await page.waitForTimeout(SETTLE_MS);
    if (rec.posts.length > cp.B) await waitProcessed(page, rec.posts.length);
    cp.C = rec.posts.length;

    // [D] failing POST -> cooldown; recalc during the cooldown; wait past its expiry
    rec.failDiagnoses = true;
    var doneD = await processed(page);
    await recalcWithVivienda(page, "22000");
    if (!(await waitFor(function () { return rec.posts.length > cp.C; }, page, 15000))) throw new Error(label + ": failing POST not observed");
    await waitProcessed(page, doneD + 1);
    rec.failDiagnoses = false;
    cp.D_fail = rec.posts.length;
    await recalcWithVivienda(page, "23000");
    await page.waitForTimeout(500);
    cp.D_during = rec.posts.length;
    await page.waitForTimeout(COOLDOWN_MS + SETTLE_MS);
    if (rec.posts.length > cp.D_during) await waitProcessed(page, doneD + 1 + (rec.posts.length - cp.D_during));
    cp.D_after = rec.posts.length;

    // [E] refresh
    cp.footprint = await v2Footprint(page);
    await page.reload();
    await waitBooted(page);
    await page.waitForTimeout(SETTLE_MS);
    cp.E = rec.posts.length;
    cp.footprintAfterReload = await v2Footprint(page);
  } finally {
    rec.pending.splice(0).forEach(function (f) { f(); });
    await o.context.close();
  }
  return { cp: cp, posts: rec.posts.slice(), other: rec.other.slice(), errors: rec.errors.slice() };
}

async function main() {
  var baseDir = baselineRoot();
  var candDir = process.env.CZ_PARITY_CANDIDATE_ROOT || ROOT;
  var base = await startStatic(baseDir);
  var cand = await startStatic(candDir);
  var api = await h.startApi(h.memoryDiagnosisRepository());
  var browser = await chromium.launch();
  var warn = console.warn;
  console.warn = function () {};
  var out = {};
  try {
    out.BASELINE = await runScript(browser, base.origin, "baseline", false, api);
    out.CANDIDATE = await runScript(browser, cand.origin, "candidate", false, api);
    out.CONTROL = await runScript(browser, cand.origin, "control", true, api);
  } finally {
    console.warn = warn;
    await browser.close();
    base.server.close();
    cand.server.close();
    api.server.close();
  }
  console.log("baseline root: " + baseDir + "\ncandidate root: " + candDir);
  Object.keys(out).forEach(function (k) {
    console.log("INFO  " + k + " checkpoints " + JSON.stringify(out[k].cp) + " posts " + JSON.stringify(out[k].posts));
  });

  var b = out.BASELINE;
  var c = out.CANDIDATE;
  var k = out.CONTROL;
  check("baseline (HEAD) legacy cadence as documented: 1 POST, in-flight edits dropped, quick edit silent, cooldown edit dropped, refresh silent",
    b.cp.A === 1 && b.cp.B === 1 && b.cp.C === 1 && b.cp.D_fail === 2 && b.cp.D_during === 2 && b.cp.D_after === 2 && b.cp.E === 2, b.cp);
  ["A", "B", "C", "D_fail", "D_during", "D_after", "E"].forEach(function (key) {
    check("flags OFF: POST /v1/diagnoses count at checkpoint " + key + " == HEAD (" + b.cp[key] + ")", c.cp[key] === b.cp[key],
      { candidate: c.cp[key], baseline: b.cp[key] });
  });
  check("flags OFF: posted debt / expense values identical to HEAD, POST by POST", same(c.posts, b.posts), { candidate: c.posts, baseline: b.posts });
  function idless(list) { return list.map(function (r) { return r.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id"); }); }
  check("flags OFF: no user-choice request; other API requests identical to HEAD (ids normalized)",
    c.other.every(function (r) { return !/user-choices|opt-in/.test(r); }) && same(idless(c.other), idless(b.other)), { candidate: c.other, baseline: b.other });
  check("flags OFF: no V2 panel, no _v2FinancialStrategy key (before and after refresh), 0 pageerror (HEAD too)",
    !c.cp.footprint.has_key && !c.cp.footprint.panel && !c.cp.footprintAfterReload.has_key && !c.cp.footprintAfterReload.panel &&
    c.errors.length === 0 && b.errors.length === 0, { footprint: c.cp.footprint, reload: c.cp.footprintAfterReload, errors: c.errors, baseErrors: b.errors });

  check("control (V2 state ON) [B]: the edit made while the first POST was in flight is re-diagnosed once, with the latest input",
    k.cp.A === 1 && k.cp.B === 2 && k.posts[1].monto === "90000" && k.posts[1].vivienda === "21000", { cp: k.cp, posts: k.posts });
  check("control (V2 state ON) [C]: idle debt quick edit posts the new balance",
    k.cp.C === k.cp.B + 1 && k.posts[k.cp.C - 1].monto === "80000", { cp: k.cp, posts: k.posts });
  check("control (V2 state ON) [D]: the edit made during the cooldown is sent once the cooldown expires (not before)",
    k.cp.D_during === k.cp.D_fail && k.cp.D_after === k.cp.D_during + 1 && k.posts[k.cp.D_after - 1].vivienda === "23000", { cp: k.cp, posts: k.posts });
  check("control (V2 state ON) [E]: refresh restores the V2 state with one POST", k.cp.E === k.cp.D_after + 1, k.cp);
  check("control: 0 pageerror", k.errors.length === 0, k.errors);

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_FLAG_OFF_PARITY_E2E: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
