/**
 * server/bin/journey-01-test.js — MIPLAN-JOURNEY-01 unit tests (in-memory journeys).
 * node server/bin/journey-01-test.js
 */
"use strict";

var assert = require("assert");
var http = require("http");
var path = require("path");
var crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

var createApp = require("../app").createApp;
var loadConfig = require("../config").loadConfig;
var createMemoryJourneyRepository =
  require("../modules/journey/repository").createMemoryJourneyRepository;
var createJourneyService = require("../modules/journey/service").createJourneyService;
var bootstrapKeyFromHandoffCode =
  require("../modules/journey/service").bootstrapKeyFromHandoffCode;
var sanitizeHandoffContext =
  require("../modules/journey/sanitizeContext").sanitizeHandoffContext;

var ANON = "11111111-1111-4111-8111-111111111111";
var ANON2 = "22222222-2222-4222-8222-222222222222";
var CODE = "unit-test-handoff-code-opaque-value";
var CODE2 = "unit-test-handoff-code-second-episode";
var janusCalls = 0;
var janusByCode = Object.create(null);

function makeContext(lrw) {
  return {
    contract_version: 1,
    context: {
      funnel: "credizona_rejected",
      external_ref_type: "lrw",
      external_ref: lrw,
      issued_at: "2026-09-25T12:00:00.000Z",
    },
    person: { nombre: "Ada", ci: "SHOULD_NEVER_PERSIST" },
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
  };
}

function mockFetch(url, init) {
  janusCalls += 1;
  var body = JSON.parse(init.body);
  assert.ok(body.handoff_code);
  assert.ok(!JSON.stringify(body).includes("LRW-"));
  var code = body.handoff_code;
  if (!janusByCode[code]) {
    janusByCode[code] = 1;
    var lrw =
      code === CODE2 ? "LRW-EPISODE-TWO" : "LRW-EPISODE-ONE";
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return Promise.resolve(
          JSON.stringify({ ok: true, context: makeContext(lrw) })
        );
      },
    });
  }
  janusByCode[code] += 1;
  return Promise.resolve({
    ok: false,
    status: 409,
    text: function () {
      return Promise.resolve(JSON.stringify({ error: "already_redeemed" }));
    },
  });
}

global.fetch = mockFetch;

var memoryRepo = createMemoryJourneyRepository();
var journeyService = createJourneyService({
  repository: memoryRepo,
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

function request(port, method, urlPath, body, anonId) {
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
          "X-MiPlan-Anonymous-Id": anonId || ANON,
        },
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          var text = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (_e) {
            json = null;
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

function uuidRe(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

server.listen(0, "127.0.0.1", function () {
  var port = server.address().port;
  var journeyA = null;
  var journeyB = null;

  Promise.resolve()
    .then(function () {
      // sanitize strips CI
      var cleaned = sanitizeHandoffContext(makeContext("LRW-X"));
      assert.ok(cleaned.person);
      assert.strictEqual(cleaned.person.ci, undefined);
      assert.strictEqual(cleaned.context.funnel, "credizona_rejected");
      var key = bootstrapKeyFromHandoffCode(CODE);
      assert.ok(key.indexOf("handoff:") === 0);
      assert.ok(!key.includes(CODE));
    })
    .then(function () {
      return request(port, "POST", "/v1/handoff/redeem", { handoff_code: CODE });
    })
    .then(function (r1) {
      assert.strictEqual(r1.status, 200, "valid handoff creates journey");
      assert.ok(r1.body.context);
      assert.ok(uuidRe(r1.body.journey_id), "journey_id is UUID");
      assert.strictEqual(r1.body.anonymous_id, ANON);
      assert.strictEqual(r1.body.context.context.external_ref, "LRW-EPISODE-ONE");
      assert.strictEqual(r1.body.context.person.ci, undefined);
      // raw code must not be persisted in memory store
      var stored = memoryRepo._test.byId.get(r1.body.journey_id);
      assert.ok(stored);
      assert.ok(!JSON.stringify(stored).includes(CODE));
      assert.ok(stored.bootstrap_key.indexOf("handoff:") === 0);
      assert.strictEqual(stored.commercial_originator, "COPANEL_CREDIZONA");
      assert.strictEqual(stored.funnel, "credizona_rejected");
      journeyA = r1.body.journey_id;
      assert.strictEqual(janusCalls, 1);
    })
    .then(function () {
      // retry / double click → same journey, no second JANUS success path needed
      return request(port, "POST", "/v1/handoff/redeem", { handoff_code: CODE });
    })
    .then(function (r2) {
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(r2.body.journey_id, journeyA);
      assert.strictEqual(r2.body.cached, true);
      assert.strictEqual(r2.body.durable, true);
      // durable lookup should not call JANUS again
      assert.strictEqual(janusCalls, 1);
    })
    .then(function () {
      // concurrent double redeem after clearing janus map state already consumed —
      // simulate two parallel lookups that both hit create (second loses UNIQUE)
      return Promise.all([
        request(port, "POST", "/v1/handoff/redeem", { handoff_code: CODE }),
        request(port, "POST", "/v1/handoff/redeem", { handoff_code: CODE }),
      ]);
    })
    .then(function (pair) {
      assert.strictEqual(pair[0].body.journey_id, journeyA);
      assert.strictEqual(pair[1].body.journey_id, journeyA);
    })
    .then(function () {
      // different handoff → different journey, same anonymous_id
      return request(port, "POST", "/v1/handoff/redeem", {
        handoff_code: CODE2,
      });
    })
    .then(function (r3) {
      assert.strictEqual(r3.status, 200);
      journeyB = r3.body.journey_id;
      assert.ok(uuidRe(journeyB));
      assert.notStrictEqual(journeyB, journeyA);
      assert.strictEqual(r3.body.anonymous_id, ANON);
      assert.strictEqual(
        r3.body.context.context.external_ref,
        "LRW-EPISODE-TWO"
      );
      assert.strictEqual(memoryRepo._test.byId.size, 2);
    })
    .then(function () {
      // ownership: other anonymous_id cannot claim same bootstrap
      return request(
        port,
        "POST",
        "/v1/handoff/redeem",
        { handoff_code: CODE },
        ANON2
      );
    })
    .then(function (r4) {
      assert.strictEqual(r4.status, 403);
      assert.strictEqual(r4.body.error, "JOURNEY_OWNERSHIP_MISMATCH");
    })
    .then(function () {
      // LRW not allowed
      return request(port, "POST", "/v1/handoff/redeem", {
        lrw: "LRW-111-222-333",
      });
    })
    .then(function (r5) {
      assert.strictEqual(r5.status, 400);
      assert.strictEqual(r5.body.error, "LRW_NOT_ALLOWED");
    })
    .then(function () {
      // assertOwned for diagnosis association
      return journeyService.assertOwned(journeyA, ANON).then(function (ok) {
        assert.strictEqual(ok, true);
      });
    })
    .then(function () {
      return journeyService.assertOwned(journeyA, ANON2).then(
        function () {
          throw new Error("expected ownership mismatch");
        },
        function (err) {
          assert.strictEqual(err.code, "JOURNEY_OWNERSHIP_MISMATCH");
        }
      );
    })
    .then(function () {
      // diagnosis service strips journey_id from engine input
      var extract =
        require("../modules/diagnosis/service").extractEngineInput;
      var eng = extract({
        ingreso: 50000,
        journey_id: journeyA,
        deudas: [],
        no_debts_declared: true,
        gastos: {},
        tiene_encuesta: false,
        respuestas: {},
      });
      assert.ok(eng);
      assert.strictEqual(eng.journey_id, undefined);
      assert.strictEqual(eng.ingreso, 50000);
    })
    .then(function () {
      console.log("journey-01-test: PASS");
      server.close();
    })
    .catch(function (err) {
      console.error(err);
      server.close();
      process.exit(1);
    });
});
