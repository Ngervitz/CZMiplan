/**
 * server/bin/handoff-redeem-test.js — local unit test for handoff route (mocked JANUS).
 * node server/bin/handoff-redeem-test.js
 */
"use strict";

var assert = require("assert");
var http = require("http");
var path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createMemoryJourneyRepository =
  require("../modules/journey/repository").createMemoryJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;

var ANON = "11111111-1111-4111-8111-111111111111";
var CODE = "unit-test-handoff-code-opaque-value";
var callCount = 0;

function mockFetch(url, init) {
  callCount += 1;
  var body = JSON.parse(init.body);
  assert.ok(body.handoff_code);
  assert.ok(!JSON.stringify(body).includes("LRW-"));
  if (callCount === 1) {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return Promise.resolve(
          JSON.stringify({
            ok: true,
            context: {
              contract_version: 1,
              context: {
                funnel: "credizona_rejected",
                external_ref_type: "lrw",
                external_ref: "LRW-HIDDEN-FROM-FE-LOGS",
                issued_at: "2026-09-25T12:00:00.000Z",
              },
              person: { nombre: "Ada" },
              survey: {
                selection_rule: "lifetime_ci",
                respuestas: {
                  p1: "A",
                  p2: "B",
                  p3: "A",
                  p4: "C",
                  p5: "B",
                  p6: "A",
                  p7: "B",
                  p8: "A",
                  p9: "A",
                  p10: "B",
                },
              },
              provenance: { source_system: "credizona" },
            },
          })
        );
      },
    });
  }
  return Promise.resolve({
    ok: false,
    status: 409,
    text: function () {
      return Promise.resolve(JSON.stringify({ error: "already_redeemed" }));
    },
  });
}

global.fetch = mockFetch;

var journeyService = createJourneyService({
  repository: createMemoryJourneyRepository(),
  tenantId: "miplan-default",
});

var config = loadConfig({
  NODE_ENV: "test",
  PORT: "0",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  MIPLAN_BACKEND_SECRET: "",
  JANUS_HANDOFF_BASE_URL: "https://janus.test",
  MIPLAN_HANDOFF_REDEEM_SECRET: "test-redeem-secret",
});

var app = createApp(config, { journeyService: journeyService });
var server = http.createServer(app);

function request(port, method, urlPath, body) {
  return new Promise(function (resolve, reject) {
    var raw = JSON.stringify(body || {});
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: urlPath,
        method: method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(raw),
          "X-MiPlan-Anonymous-Id": ANON,
        },
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          });
        });
      }
    );
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

server.listen(0, "127.0.0.1", function () {
  var port = server.address().port;
  var journeyId = null;
  Promise.resolve()
    .then(function () {
      return request(port, "POST", "/v1/handoff/redeem", { handoff_code: CODE });
    })
    .then(function (r1) {
      assert.strictEqual(r1.status, 200);
      assert.ok(r1.body.context);
      assert.strictEqual(r1.body.context.person.nombre, "Ada");
      assert.ok(r1.body.journey_id);
      journeyId = r1.body.journey_id;
      assert.strictEqual(callCount, 1);
      // Double-click / retry: durable journey — no second JANUS call
      return request(port, "POST", "/v1/handoff/redeem", { handoff_code: CODE });
    })
    .then(function (r2) {
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(r2.body.cached, true);
      assert.strictEqual(r2.body.durable, true);
      assert.strictEqual(r2.body.journey_id, journeyId);
      assert.strictEqual(callCount, 1);
      // LRW must be rejected
      return request(port, "POST", "/v1/handoff/redeem", {
        lrw: "LRW-111-222-333",
      });
    })
    .then(function (r3) {
      assert.strictEqual(r3.status, 400);
      console.log("handoff-redeem-test: PASS");
      server.close();
    })
    .catch(function (err) {
      console.error(err);
      server.close();
      process.exit(1);
    });
});
