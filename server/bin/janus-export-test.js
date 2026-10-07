/**
 * server/bin/janus-export-test.js — MIPLAN-JANUS-EXPORT-01 HTTP contract (fake repository / fake
 * Supabase client, real Express app on loopback). No network, no Supabase.
 * node server/bin/janus-export-test.js
 */
"use strict";

var http = require("http");

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var exportService = require("../modules/janusExport/service");
var createJanusExportRepository = require("../modules/janusExport/repository").createJanusExportRepository;

var SECRET = "jx-test-export-secret-0123456789abcdef-XYZ";
var REDEEM = "test-redeem-secret-0123456789abcdef-redeem";
var ORIGIN = "http://127.0.0.1:5500";
var HASH = "ab".repeat(32);
var EV1 = "11111111-1111-4111-8111-111111111111";
var EV2 = "22222222-2222-4222-8222-222222222222";
var JR = "33333333-3333-4333-8333-333333333333";
var EVAL = "44444444-4444-4444-8444-444444444444";
var DIAG = "55555555-5555-4555-8555-555555555555";
var TS = "2026-10-06T12:00:00.123456+00:00";

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1200) : ""));
}

function request(port, method, urlPath, headers, body) {
  return new Promise(function (resolve, reject) {
    var h = Object.assign({}, headers || {});
    var payload = null;
    if (body !== undefined) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      h["Content-Type"] = "application/json";
      h["Content-Length"] = Buffer.byteLength(payload);
    }
    var req = http.request({ hostname: "127.0.0.1", port: port, path: urlPath, method: method, headers: h }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        var text = Buffer.concat(chunks).toString("utf8");
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (_e) { parsed = text; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers, raw: text });
      });
    });
    req.on("error", reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function listen(app) {
  var server = http.createServer(app);
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port }); });
  });
}

function config(extra) {
  return loadConfig(Object.assign({
    NODE_ENV: "test",
    PORT: "0",
    CORS_ALLOWED_ORIGINS: ORIGIN,
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    MIPLAN_BACKEND_SECRET: "",
    JANUS_HANDOFF_BASE_URL: "https://janus.test",
    MIPLAN_HANDOFF_REDEEM_SECRET: REDEEM,
    MIPLAN_JANUS_EXPORT_SECRET: SECRET,
  }, extra || {}));
}

// Rows as the RPC would return them, polluted with fields that must never leave Mi Plan.
function rpcRows() {
  return [
    {
      event_id: EV1, journey_id: JR, seq: 1, state: "opted_in", scope: "debt_management",
      contract_version: "debt_management_opt_in_v1", source: "miplan_v2_final_cta",
      consent_text_version: "DM_OPTIN_v1_202610", created_at: TS, origin_evaluation_id: EVAL,
      origin_diagnosis_id: DIAG, snapshot_diagnosis_id: DIAG, handoff_token_hash: HASH, excluded_count: 2,
      anonymous_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ci: 12345678, nombre: "Ada", email: "ada@x.uy",
      ingreso: 50000, strategy: { k: 1 }, user_choice: "LOWER_PAYMENT",
      debts: [{
        position: 0, client_debt_id: "d1", tipo: "tarjeta", acreedor_raw: "OCA", acreedor: "oca",
        acreedor_display: "OCA", acreedor_normalizado: "oca", monto: 1000, pago: 100, pago_mensual_actual: null,
        situacion_ui: "al_dia", estado: "al_dia", atraso_tiempo: null, atraso_tiempo_aprox: null,
        ultimo_pago_declarado: null, debt_confidence: "high",
        cancelada: false, _is_draft_add: false, telefono: "099000000", ingreso_estimado: 1,
      }],
    },
    {
      event_id: EV2, journey_id: JR, seq: 2, state: "withdrawn", scope: "debt_management",
      contract_version: "debt_management_opt_in_v1", source: "miplan_v2_final_cta",
      consent_text_version: "DM_OPTIN_v1_202610", created_at: TS, origin_evaluation_id: EVAL,
      origin_diagnosis_id: DIAG, snapshot_diagnosis_id: DIAG, handoff_token_hash: HASH,
      excluded_count: 7, debts: [{ position: 0 }],
    },
  ];
}

function fakeRepository(state) {
  state.ackCalls = state.ackCalls || [];
  return {
    exportEvents: function (args) {
      state.calls.push(args);
      if (state.fail) return Promise.reject(Object.assign(new Error("DB_EXPORT_FAILED"), { status: 500, code: "DB_EXPORT_FAILED" }));
      return Promise.resolve({ events: state.rows || [], has_more: !!state.hasMore });
    },
    ackEvents: function (acks) {
      state.ackCalls.push(acks);
      if (state.ackError) return Promise.reject(state.ackError);
      return Promise.resolve({ acked: acks.length, already_acked: 0 });
    },
  };
}

function ackBody(acks) {
  return { contract_version: "miplan_debt_optin_export_v1", acks: acks };
}

async function main() {
  var logged = [];
  ["log", "error", "warn", "info"].forEach(function (k) {
    var orig = console[k];
    console[k] = function () {
      var line = Array.prototype.map.call(arguments, String).join(" ");
      if (!/^(PASS|FAIL) {2}/.test(line) && !/^JANUS_EXPORT_TEST/.test(line)) logged.push(line);
      orig.apply(console, arguments);
    };
  });

  var state = { calls: [], rows: rpcRows() };
  var app = createApp(config(), { janusExportService: exportService.createJanusExportService({ repository: fakeRepository(state) }) });
  var srv = await listen(app);
  var P = srv.port;
  var PATH = "/internal/janus/v1/debt-optin-events";
  var AUTH = { Authorization: "Bearer " + SECRET };

  try {
    check("config: MIPLAN_JANUS_EXPORT_SECRET loaded into janusExportSecret", config().janusExportSecret === SECRET);

    // ---- auth ----
    var r = await request(P, "GET", PATH);
    check("auth: missing Authorization -> 401", r.status === 401 && r.body.error === "UNAUTHORIZED", r.body);
    r = await request(P, "GET", PATH, { Authorization: "Bearer wrong-secret-of-whatever-length-xxxxxxxx" });
    check("auth: wrong Bearer -> 401", r.status === 401, r.body);
    r = await request(P, "GET", PATH, { Authorization: "Basic " + Buffer.from("janus:" + SECRET).toString("base64") });
    check("auth: non-Bearer scheme -> 401", r.status === 401, r.body);
    r = await request(P, "GET", PATH, { Authorization: "Bearer " + REDEEM });
    check("auth: handoff redeem secret is not accepted", r.status === 401, r.body);
    check("auth: failures never reached the repository", state.calls.length === 0, state.calls);

    r = await request(P, "GET", PATH, AUTH);
    check("auth: correct Bearer -> 200 with contract envelope",
      r.status === 200 && r.body.contract_version === "miplan_debt_optin_export_v1" && Array.isArray(r.body.events) &&
      typeof r.body.has_more === "boolean", r.body);
    check("envelope: no cursor (delivery = pending/unacked, not a temporal cursor)",
      JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(["contract_version", "events", "has_more"]), Object.keys(r.body));
    check("response: Cache-Control no-store", /no-store/.test(String(r.headers["cache-control"])), r.headers);
    check("response: no CORS allow-origin header on S2S call", !("access-control-allow-origin" in r.headers), r.headers);
    check("default limit 100 reaches the repository (only the limit)",
      state.calls[0] && JSON.stringify(state.calls[0]) === JSON.stringify({ limit: 100 }), state.calls);

    // ---- allowlist / no leakage ----
    var ev1 = r.body.events[0];
    var ev2 = r.body.events[1];
    var evKeys = exportService.EVENT_FIELDS.concat(["debts"]).sort();
    check("allowlist: opted_in event has exactly the contract fields", JSON.stringify(Object.keys(ev1).sort()) === JSON.stringify(evKeys), Object.keys(ev1));
    check("allowlist: debt has exactly the contract fields",
      JSON.stringify(Object.keys(ev1.debts[0]).sort()) === JSON.stringify(exportService.DEBT_FIELDS.slice().sort()), Object.keys(ev1.debts[0]));
    check("allowlist: withdrawn event has no debts and excluded_count null",
      !("debts" in ev2) && ev2.excluded_count === null, ev2);
    ["anonymous_id", "aaaaaaaa-aaaa", "12345678", "Ada", "ada@x.uy", "50000", "strategy", "user_choice", "LOWER_PAYMENT",
      "telefono", "099000000", "ingreso", "cancelada", "_is_draft_add"].forEach(function (needle) {
      check("no leakage: '" + needle + "' absent from payload", r.raw.indexOf(needle) === -1);
    });
    check("handoff_token_hash is the bootstrap hash only", ev1.handoff_token_hash === HASH);

    // ---- pending page ----
    state.calls.length = 0;
    state.hasMore = true;
    r = await request(P, "GET", PATH + "?limit=2&cursor=ignored", AUTH);
    check("limit passed; a legacy cursor param is ignored (never reaches the repository)",
      r.status === 200 && JSON.stringify(state.calls[0]) === JSON.stringify({ limit: 2 }) && r.body.has_more === true, { calls: state.calls, body: r.body });
    state.hasMore = false;
    state.rows = [];
    r = await request(P, "GET", PATH, AUTH);
    check("nothing pending -> empty page, has_more false", r.status === 200 && r.body.events.length === 0 && r.body.has_more === false, r.body);
    state.rows = rpcRows();

    // ---- ACK (own app instance: separate in-memory rate-limit budget) ----
    var ACK = PATH + "/ack";
    var ackSrv = await listen(createApp(config(), { janusExportService: exportService.createJanusExportService({ repository: fakeRepository(state) }) }));
    var PA = ackSrv.port;
    r = await request(PA, "POST", ACK, {}, ackBody([{ event_id: EV1, janus_status: "inserted" }]));
    check("ack: missing Authorization -> 401, repository untouched", r.status === 401 && state.ackCalls.length === 0, r.body);
    r = await request(PA, "POST", ACK, { Authorization: "Bearer " + REDEEM }, ackBody([{ event_id: EV1, janus_status: "inserted" }]));
    check("ack: redeem secret not accepted", r.status === 401 && state.ackCalls.length === 0, r.body);
    r = await request(PA, "POST", ACK, Object.assign({ Origin: ORIGIN }, AUTH), ackBody([{ event_id: EV1, janus_status: "inserted" }]));
    check("ack: browser request refused 403", r.status === 403 && state.ackCalls.length === 0, r.body);
    r = await request(PA, "POST", ACK, AUTH, ackBody([{ event_id: EV1, janus_status: "inserted" }, { event_id: EV2, janus_status: "already_ingested" }]));
    check("ack: valid batch -> 200 {acked, already_acked} and exact acks reach the repository",
      r.status === 200 && r.body.contract_version === "miplan_debt_optin_export_v1" && r.body.acked === 2 && r.body.already_acked === 0 &&
      JSON.stringify(state.ackCalls[0]) === JSON.stringify([{ event_id: EV1, janus_status: "inserted" }, { event_id: EV2, janus_status: "already_ingested" }]),
      { body: r.body, calls: state.ackCalls });
    check("ack: Cache-Control no-store", /no-store/.test(String(r.headers["cache-control"])), r.headers);
    var many = [];
    for (var m = 0; m < 201; m++) many.push({ event_id: "00000000-0000-4000-8000-" + String(m).padStart(12, "0"), janus_status: "inserted" });
    var badAcks = [
      ["empty acks", ackBody([])],
      ["201 acks", ackBody(many)],
      ["wrong contract_version", { contract_version: "v0", acks: [{ event_id: EV1, janus_status: "inserted" }] }],
      ["extra top-level key", Object.assign(ackBody([{ event_id: EV1, janus_status: "inserted" }]), { cursor: "x" })],
      ["unknown janus_status", ackBody([{ event_id: EV1, janus_status: "processed" }])],
      ["status 'failed' cannot be acked", ackBody([{ event_id: EV1, janus_status: "failed" }])],
      ["non-uuid event_id", ackBody([{ event_id: "nope", janus_status: "inserted" }])],
      ["uppercase uuid", ackBody([{ event_id: "ABCDEF12-3456-4789-8ABC-DEF123456789", janus_status: "inserted" }])],
      ["duplicate event_id", ackBody([{ event_id: EV1, janus_status: "inserted" }, { event_id: EV1, janus_status: "inserted" }])],
      ["extra ack key", ackBody([{ event_id: EV1, janus_status: "inserted", ci: 12345678 }])],
      ["array body", [{ event_id: EV1, janus_status: "inserted" }]],
    ];
    var before = state.ackCalls.length;
    for (var b = 0; b < badAcks.length; b++) {
      r = await request(PA, "POST", ACK, AUTH, badAcks[b][1]);
      check("ack: " + badAcks[b][0] + " -> 400 INVALID_ACK_REQUEST", r.status === 400 && r.body.error === "INVALID_ACK_REQUEST", r.body);
    }
    check("ack: invalid bodies never reach the repository (fail closed)", state.ackCalls.length === before, state.ackCalls.length);
    state.ackError = Object.assign(new Error("ACK_EVENT_NOT_EXPORTABLE"), { status: 422, code: "ACK_EVENT_NOT_EXPORTABLE" });
    r = await request(PA, "POST", ACK, AUTH, ackBody([{ event_id: EV1, janus_status: "inserted" }]));
    check("[E] ack of unknown / non-exportable event -> 422 ACK_EVENT_NOT_EXPORTABLE", r.status === 422 && r.body.error === "ACK_EVENT_NOT_EXPORTABLE", r.body);
    state.ackError = Object.assign(new Error("DB_ACK_FAILED"), { status: 500, code: "DB_ACK_FAILED" });
    r = await request(PA, "POST", ACK, AUTH, ackBody([{ event_id: EV1, janus_status: "inserted" }]));
    check("ack: DB failure -> 500 generic (JANUS will replay)", r.status === 500 && r.body.message === "Internal server error", r.body);
    state.ackError = null;
    r = await request(PA, "GET", ACK, AUTH);
    check("ack: GET not routed (404)", r.status === 404, r.body);
    ackSrv.server.close();

    // ---- limit ----
    var badLimits = ["0", "201", "abc", "1.5", "-1", "1000"];
    for (var j = 0; j < badLimits.length; j++) {
      r = await request(P, "GET", PATH + "?limit=" + encodeURIComponent(badLimits[j]), AUTH);
      check("invalid limit '" + badLimits[j] + "' -> 400 INVALID_EXPORT_LIMIT", r.status === 400 && r.body.error === "INVALID_EXPORT_LIMIT", r.body);
    }
    r = await request(P, "GET", PATH + "?limit=1&limit=2", AUTH);
    check("repeated limit param -> 400", r.status === 400, r.body);
    state.calls.length = 0;
    r = await request(P, "GET", PATH + "?limit=200", AUTH);
    check("limit 200 accepted", r.status === 200 && state.calls[0].limit === 200, state.calls);

    // ---- browser / CORS ----
    r = await request(P, "GET", PATH, Object.assign({ Origin: ORIGIN }, AUTH));
    check("browser request (allowed Origin) refused 403 even with valid Bearer", r.status === 403 && r.body.error === "JANUS_EXPORT_FORBIDDEN", r.body);
    r = await request(P, "GET", PATH, Object.assign({ Origin: "https://evil.example" }, AUTH));
    check("foreign Origin refused 403", r.status === 403, r.body);
    r = await request(P, "OPTIONS", PATH, { Origin: ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" });
    check("preflight does not allow the Authorization header",
      !/authorization/i.test(String(r.headers["access-control-allow-headers"] || "")), r.headers);
    r = await request(P, "POST", PATH, AUTH);
    check("POST on the export path not routed (404)", r.status === 404, r.body);

    // ---- repository failure ----
    state.fail = true;
    r = await request(P, "GET", PATH, AUTH);
    check("repository failure -> 500 generic message", r.status === 500 && r.body.message === "Internal server error", r.body);
    state.fail = false;
  } finally {
    srv.server.close();
  }

  // ---- secret configuration fail-closed ----
  var variants = [
    { name: "absent", env: { MIPLAN_JANUS_EXPORT_SECRET: "" } },
    { name: "too short", env: { MIPLAN_JANUS_EXPORT_SECRET: "short-secret" } },
    { name: "reused redeem secret", env: { MIPLAN_JANUS_EXPORT_SECRET: REDEEM } },
  ];
  for (var v = 0; v < variants.length; v++) {
    var st = { calls: [], rows: rpcRows() };
    var a = await listen(createApp(config(variants[v].env), { janusExportService: exportService.createJanusExportService({ repository: fakeRepository(st) }) }));
    var rr = await request(a.port, "GET", "/internal/janus/v1/debt-optin-events", { Authorization: "Bearer " + (variants[v].env.MIPLAN_JANUS_EXPORT_SECRET || SECRET) });
    check("secret " + variants[v].name + " -> 503 JANUS_EXPORT_UNAVAILABLE, repository untouched",
      rr.status === 503 && rr.body.error === "JANUS_EXPORT_UNAVAILABLE" && st.calls.length === 0, rr.body);
    a.server.close();
  }
  var noPersist = await listen(createApp(config()));
  var np = await request(noPersist.port, "GET", "/internal/janus/v1/debt-optin-events", { Authorization: "Bearer " + SECRET });
  check("no Supabase persistence configured -> 503", np.status === 503, np.body);
  noPersist.server.close();

  // ---- rate limit ----
  var rl = await listen(createApp(config(), { janusExportService: exportService.createJanusExportService({ repository: fakeRepository({ calls: [], rows: [] }) }) }));
  var statuses = [];
  for (var k = 0; k < 32; k++) {
    var x = await request(rl.port, "GET", "/internal/janus/v1/debt-optin-events", { Authorization: "Bearer nope" });
    statuses.push(x.status);
  }
  check("rate limit: failed attempts are throttled (429 after 30/min)", statuses.slice(0, 30).every(function (s) { return s === 401; }) && statuses[30] === 429 && statuses[31] === 429, statuses);
  rl.server.close();

  // ---- repository: RPC parameters and error mapping ----
  var rpcCalls = [];
  var repo = createJanusExportRepository({
    backendSecret: "b2-secret",
    client: { rpc: function (name, params) { rpcCalls.push({ name: name, params: params }); return Promise.resolve({ data: { events: [], has_more: false }, error: null }); } },
  });
  await repo.exportEvents({ limit: 5 });
  check("repository: RPC name and params (p_secret = backend secret, not the export secret)",
    rpcCalls[0].name === "miplan_export_debt_optin_events" && rpcCalls[0].params.p_secret === "b2-secret" &&
    JSON.stringify(Object.keys(rpcCalls[0].params).sort()) === JSON.stringify(["p_limit", "p_secret"]) && rpcCalls[0].params.p_limit === 5, rpcCalls);
  async function mapped(error, data) {
    var rp = createJanusExportRepository({ backendSecret: "b2", client: { rpc: function () { return Promise.resolve({ data: data || null, error: error }); } } });
    try { await rp.exportEvents({ limit: 1 }); return null; } catch (e) { return e; }
  }
  var e1 = await mapped({ message: "permission denied: MIPLAN_UNAUTHORIZED detail secret=xyz" });
  check("repository: DB error -> DB_EXPORT_FAILED 500 without the DB message", e1 && e1.code === "DB_EXPORT_FAILED" && e1.status === 500 && !/xyz/.test(e1.message), e1 && e1.message);
  var e2 = await mapped({ message: "INVALID_EXPORT_LIMIT" });
  check("repository: INVALID_EXPORT_LIMIT -> 400", e2 && e2.code === "INVALID_EXPORT_LIMIT" && e2.status === 400);
  var e3 = await mapped(null, { nope: true });
  check("repository: malformed RPC result -> DB_EXPORT_FAILED", e3 && e3.code === "DB_EXPORT_FAILED");

  var ackRpc = [];
  var repoAck = createJanusExportRepository({
    backendSecret: "b2-secret",
    client: { rpc: function (name, params) { ackRpc.push({ name: name, params: params }); return Promise.resolve({ data: { acked: 1, already_acked: 0 }, error: null }); } },
  });
  await repoAck.ackEvents([{ event_id: EV1, janus_status: "inserted" }]);
  check("repository: ack RPC name and params",
    ackRpc[0].name === "miplan_ack_debt_optin_events" && ackRpc[0].params.p_secret === "b2-secret" &&
    JSON.stringify(ackRpc[0].params.p_acks) === JSON.stringify([{ event_id: EV1, janus_status: "inserted" }]), ackRpc);
  async function ackMapped(error, data) {
    var rp = createJanusExportRepository({ backendSecret: "b2", client: { rpc: function () { return Promise.resolve({ data: data || null, error: error }); } } });
    try { await rp.ackEvents([{ event_id: EV1, janus_status: "inserted" }]); return null; } catch (e) { return e; }
  }
  var a1 = await ackMapped({ message: "ACK_EVENT_NOT_EXPORTABLE" });
  check("repository: ACK_EVENT_NOT_EXPORTABLE -> 422", a1 && a1.code === "ACK_EVENT_NOT_EXPORTABLE" && a1.status === 422);
  var a2 = await ackMapped({ message: "INVALID_ACK_REQUEST" });
  check("repository: INVALID_ACK_REQUEST -> 400", a2 && a2.code === "INVALID_ACK_REQUEST" && a2.status === 400);
  var a3 = await ackMapped({ message: "boom secret=xyz" });
  check("repository: other ack DB error -> DB_ACK_FAILED 500 without the DB message", a3 && a3.code === "DB_ACK_FAILED" && a3.status === 500 && !/xyz/.test(a3.message));
  var a4 = await ackMapped(null, { acked: "1" });
  check("repository: malformed ack result -> DB_ACK_FAILED", a4 && a4.code === "DB_ACK_FAILED");
  var threw = null;
  try { createJanusExportRepository({ client: {}, backendSecret: "" }); } catch (e) { threw = e; }
  check("repository: missing backend secret -> SUPABASE_CONFIG_MISSING", threw && threw.code === "SUPABASE_CONFIG_MISSING");

  // ---- logs ----
  var all = logged.join("\n");
  [SECRET, REDEEM, HASH, "Bearer", "12345678", "acreedor", "OCA", "ada@x.uy", "xyz"].forEach(function (needle) {
    check("logs: '" + (needle === SECRET || needle === REDEEM ? "<secret>" : needle === HASH ? "<hash>" : needle) + "' never logged", all.indexOf(needle) === -1);
  });

  var failed = results.filter(function (x) { return !x.ok; }).length;
  console.log("JANUS_EXPORT_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error("JANUS_EXPORT_TEST crashed: " + (e && e.message));
  process.exitCode = 1;
});
