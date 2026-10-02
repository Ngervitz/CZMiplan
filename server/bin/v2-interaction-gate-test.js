/**
 * server/bin/v2-interaction-gate-test.js — server-side gate of the CTA interaction choice types.
 *
 * MIPLAN_V2_INTERACTION_ENABLED controls the creation of expense_reduction_intent and
 * creditor_contact_step; only the exact value "true" enables it. The original choice types, the
 * opt-in and the reads are never gated.
 *
 * [1] config parsing; [2] service (fake repository); [3] HTTP through createApp built from the
 * config alone (no service override): the real repository talks to a loopback fake PostgREST that
 * records every RPC, so "blocked" means no RPC was issued at all.
 *
 * node -r ./server/testing/networkTrap.js server/bin/v2-interaction-gate-test.js
 */
"use strict";

var http = require("http");

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var userChoice = require("../modules/userChoice/service");

var EV = "11111111-1111-4111-8111-111111111111";
var ANON = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var NEW_BODIES = {
  expense_reduction_intent: { choice_type: "expense_reduction_intent", expense_ref: "vivienda", amount: 5000 },
  creditor_contact_step: { choice_type: "creditor_contact_step", debt_index: 0, state: "planned" },
};
var EXISTING_BODIES = {
  lower_payment_intent: { choice_type: "lower_payment_intent", debt_index: 0 },
  surplus_to_debt: { choice_type: "surplus_to_debt", debt_index: 0, amount: 1000 },
  surplus_reserve: { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 1000 },
};

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}

async function codeOf(promise) {
  try {
    await promise;
    return "OK";
  } catch (e) {
    return e.code || e.message;
  }
}

function fakeRepository() {
  var calls = [];
  return {
    calls: calls,
    recordUserChoice: async function (row) {
      calls.push(row);
      return { evaluation_id: row.evaluation_id, appended: true, current: null };
    },
    getUserChoiceState: async function () { throw new Error("unused"); },
    recordDebtManagementOptIn: async function (row) {
      calls.push(row);
      return { evaluation_id: row.evaluation_id, appended: true, current: null };
    },
  };
}

// ---------- loopback fake PostgREST ----------
function startFakePostgrest() {
  var rpcs = [];
  var server = http.createServer(function (req, res) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () {
      var name = req.url.split("?")[0].replace(/^\/rest\/v1\/rpc\//, "");
      var params = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      rpcs.push({ name: name, params: params });
      var reply = { evaluation_id: EV, appended: true, current: null };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port, rpcs: rpcs }); });
  });
}

function startApp(env) {
  var app = createApp(loadConfig(env));
  return new Promise(function (resolve) {
    var server = http.createServer(app);
    server.listen(0, "127.0.0.1", function () { resolve({ server: server, port: server.address().port }); });
  });
}

function post(port, path, body) {
  return new Promise(function (resolve, reject) {
    var raw = JSON.stringify(body);
    var req = http.request({ hostname: "127.0.0.1", port: port, path: path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw), "X-MiPlan-Anonymous-Id": ANON } }, function (res) {
      var chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () {
        var text = Buffer.concat(chunks).toString("utf8");
        var json = null;
        try { json = JSON.parse(text); } catch (_e) { json = null; }
        resolve({ status: res.statusCode, json: json });
      });
    });
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

async function main() {
  // ---- [1] config ----
  var parsed = {
    absent: loadConfig({}).v2InteractionEnabled,
    empty: loadConfig({ MIPLAN_V2_INTERACTION_ENABLED: "" }).v2InteractionEnabled,
    false: loadConfig({ MIPLAN_V2_INTERACTION_ENABLED: "false" }).v2InteractionEnabled,
    one: loadConfig({ MIPLAN_V2_INTERACTION_ENABLED: "1" }).v2InteractionEnabled,
    upper: loadConfig({ MIPLAN_V2_INTERACTION_ENABLED: "TRUE" }).v2InteractionEnabled,
    yes: loadConfig({ MIPLAN_V2_INTERACTION_ENABLED: "yes" }).v2InteractionEnabled,
    true: loadConfig({ MIPLAN_V2_INTERACTION_ENABLED: "true" }).v2InteractionEnabled,
    padded: loadConfig({ MIPLAN_V2_INTERACTION_ENABLED: " true " }).v2InteractionEnabled,
  };
  check("[1] config: absent / empty / false / 1 / TRUE / yes -> off; only \"true\" -> on",
    parsed.absent === false && parsed.empty === false && parsed.false === false && parsed.one === false &&
    parsed.upper === false && parsed.yes === false && parsed.true === true && parsed.padded === true, parsed);

  // ---- [2] service ----
  var variants = [
    { label: "flag absent", deps: {} },
    { label: "flag false", deps: { interactionEnabled: false } },
    { label: "flag \"true\" (string, not boolean)", deps: { interactionEnabled: "true" } },
  ];
  for (var v = 0; v < variants.length; v++) {
    var repo = fakeRepository();
    var svc = userChoice.createUserChoiceService(Object.assign({ repository: repo }, variants[v].deps));
    var codes = {};
    for (var t in NEW_BODIES) codes[t] = await codeOf(svc.recordChoice({ anonymousId: ANON, evaluationId: EV, body: NEW_BODIES[t] }));
    var malformed = await codeOf(svc.recordChoice({ anonymousId: ANON, evaluationId: EV,
      body: { choice_type: "creditor_contact_step", debt_index: 0, state: "agreed" } }));
    check("[2] " + variants[v].label + ": expense_reduction_intent / creditor_contact_step -> V2_INTERACTION_DISABLED, repository never called (even for a malformed body)",
      codes.expense_reduction_intent === "V2_INTERACTION_DISABLED" && codes.creditor_contact_step === "V2_INTERACTION_DISABLED" &&
      malformed === "V2_INTERACTION_DISABLED" && repo.calls.length === 0, { codes: codes, malformed: malformed, calls: repo.calls.length });
    var existing = {};
    for (var e in EXISTING_BODIES) existing[e] = await codeOf(svc.recordChoice({ anonymousId: ANON, evaluationId: EV, body: EXISTING_BODIES[e] }));
    var optIn = await codeOf(svc.recordOptIn({ anonymousId: ANON, evaluationId: EV, body: { state: "opted_in" } }));
    check("[2] " + variants[v].label + ": original choice types and the opt-in still reach the repository",
      existing.lower_payment_intent === "OK" && existing.surplus_to_debt === "OK" && existing.surplus_reserve === "OK" && optIn === "OK" &&
      repo.calls.length === 4, { existing: existing, optIn: optIn, calls: repo.calls.length });
  }
  var repoOn = fakeRepository();
  var svcOn = userChoice.createUserChoiceService({ repository: repoOn, interactionEnabled: true });
  var on = {};
  for (var n in NEW_BODIES) on[n] = await codeOf(svcOn.recordChoice({ anonymousId: ANON, evaluationId: EV, body: NEW_BODIES[n] }));
  var unknownOn = await codeOf(svcOn.recordChoice({ anonymousId: ANON, evaluationId: EV, body: { choice_type: "nope" } }));
  check("[2] flag true: both new types reach the repository; unknown types still INVALID_CHOICE_TYPE",
    on.expense_reduction_intent === "OK" && on.creditor_contact_step === "OK" && repoOn.calls.length === 2 &&
    repoOn.calls[0].expense_ref === "vivienda" && repoOn.calls[1].choice_state === "planned" && unknownOn === "INVALID_CHOICE_TYPE",
    { on: on, unknownOn: unknownOn, calls: repoOn.calls });
  var unknownOff = await codeOf(userChoice.createUserChoiceService({ repository: fakeRepository() })
    .recordChoice({ anonymousId: ANON, evaluationId: EV, body: { choice_type: "nope" } }));
  check("[2] flag off: unknown types keep INVALID_CHOICE_TYPE (gate does not change the existing error contract)",
    unknownOff === "INVALID_CHOICE_TYPE", unknownOff);
  check("[2] gated list is exactly the two CTA interaction types",
    JSON.stringify(userChoice.INTERACTION_CHOICE_TYPES) === JSON.stringify(["expense_reduction_intent", "creditor_contact_step"]),
    userChoice.INTERACTION_CHOICE_TYPES);

  // ---- [3] HTTP through createApp(config) ----
  var pgrst = await startFakePostgrest();
  var base = { NODE_ENV: "test", PORT: "0", CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
    SUPABASE_URL: "http://127.0.0.1:" + pgrst.port, SUPABASE_ANON_KEY: "test-anon-key", MIPLAN_BACKEND_SECRET: "test-secret" };
  var envs = [
    { label: "MIPLAN_V2_INTERACTION_ENABLED absent", env: base, enabled: false },
    { label: "MIPLAN_V2_INTERACTION_ENABLED=false", env: Object.assign({ MIPLAN_V2_INTERACTION_ENABLED: "false" }, base), enabled: false },
    { label: "MIPLAN_V2_INTERACTION_ENABLED=true", env: Object.assign({ MIPLAN_V2_INTERACTION_ENABLED: "true" }, base), enabled: true },
  ];
  var choicePath = "/v1/evaluations/" + EV + "/user-choices";
  try {
    for (var i = 0; i < envs.length; i++) {
      var app = await startApp(envs[i].env);
      try {
        var before = pgrst.rpcs.length;
        var replies = {};
        for (var k in NEW_BODIES) replies[k] = await post(app.port, choicePath, NEW_BODIES[k]);
        var newRpcs = pgrst.rpcs.slice(before);
        if (envs[i].enabled) {
          check("[3] " + envs[i].label + ": both new types -> 200, one miplan_record_user_choice RPC each with p_expense_ref / p_choice_state",
            replies.expense_reduction_intent.status === 200 && replies.creditor_contact_step.status === 200 &&
            newRpcs.length === 2 && newRpcs.every(function (r) { return r.name === "miplan_record_user_choice"; }) &&
            newRpcs[0].params.p_expense_ref === "vivienda" && newRpcs[1].params.p_choice_state === "planned",
            { replies: replies, rpcs: newRpcs.map(function (r) { return r.name; }) });
        } else {
          check("[3] " + envs[i].label + ": both new types -> 403 V2_INTERACTION_DISABLED, no RPC issued",
            replies.expense_reduction_intent.status === 403 && replies.creditor_contact_step.status === 403 &&
            replies.expense_reduction_intent.json.error === "V2_INTERACTION_DISABLED" &&
            replies.creditor_contact_step.json.error === "V2_INTERACTION_DISABLED" && newRpcs.length === 0,
            { replies: replies, rpcs: newRpcs.length });
        }
        var beforeExisting = pgrst.rpcs.length;
        var existingReplies = {};
        for (var x in EXISTING_BODIES) existingReplies[x] = await post(app.port, choicePath, EXISTING_BODIES[x]);
        var optInReply = await post(app.port, "/v1/evaluations/" + EV + "/debt-management-opt-in", { state: "opted_in" });
        var existingRpcs = pgrst.rpcs.slice(beforeExisting);
        check("[3] " + envs[i].label + ": original types -> 200 with the nine-argument call; opt-in -> 200 (no regression)",
          Object.keys(existingReplies).every(function (key) { return existingReplies[key].status === 200; }) && optInReply.status === 200 &&
          existingRpcs.length === 4 && existingRpcs.slice(0, 3).every(function (r) {
            return r.name === "miplan_record_user_choice" && Object.keys(r.params).length === 9;
          }) && existingRpcs[3].name === "miplan_record_debt_management_opt_in",
          { replies: existingReplies, optIn: optInReply.status, rpcs: existingRpcs.map(function (r) { return r.name + "/" + Object.keys(r.params || {}).length; }) });
      } finally {
        app.server.close();
      }
    }
  } finally {
    pgrst.server.close();
  }

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_INTERACTION_GATE_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
