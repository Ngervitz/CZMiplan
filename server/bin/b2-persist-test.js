/**
 * server/bin/b2-persist-test.js — B2 persistence validation against CZMiplan Supabase.
 *
 * Usage: node server/bin/b2-persist-test.js
 * Requires server/.env (gitignored): SUPABASE_URL, SUPABASE_ANON_KEY, MIPLAN_BACKEND_SECRET
 */
"use strict";

var path = require("path");
var http = require("http");
var crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

var loadConfig = require("../config").loadConfig;
var createApp = require("../app").createApp;
var createSupabaseClient = require("../modules/persistence/supabaseClient").createSupabaseClient;
var createDiagnosisRepository = require("../modules/diagnosis/repository").createDiagnosisRepository;
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;

var results = {
  INSERT_OK: "FAIL",
  DIAGNOSIS_ID_GENERATED: "FAIL",
  APPEND_ONLY_TWO_ROWS: "FAIL",
  FIRST_INTACT: "FAIL",
  ENGINE_VERSION_PERSISTED: "FAIL",
  NOW_MS_PERSISTED: "FAIL",
  INPUT_SNAPSHOT_PERSISTED: "FAIL",
  ENGINE_RESULT_PERSISTED: "FAIL",
  COMPLETENESS_SERVER: "FAIL",
  INVALID_PAYLOAD_REJECTED: "FAIL",
  INVALID_ANON_REJECTED: "FAIL",
  DB_FAILURE_NO_FALSE_SUCCESS: "FAIL",
  HEALTH: "FAIL",
};

function uuid() {
  return crypto.randomUUID();
}

function request(port, method, pathName, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body !== undefined ? JSON.stringify(body) : null;
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: pathName,
        method: method,
        headers: Object.assign(
          {
            Accept: "application/json",
            ...(payload != null
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload),
                }
              : {}),
          },
          headers || {}
        ),
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
          } catch (e) {
            json = null;
          }
          resolve({ status: res.statusCode, body: json, raw: text });
        });
      }
    );
    req.on("error", reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

var sampleInput = {
  ingreso: 100000,
  laboral: "relacion_dependencia",
  declared_nombre: "QA B2",
  declared_email: "qa-b2@example.test",
  declared_laboral: "relacion_dependencia",
  declared_ingreso: 100000,
  respuestas: {
    p1: "A",
    p2: "A",
    p3: "A",
    p4: "A",
    p5: "A",
    p6: "A",
    p7: "A",
    p8: "A",
    p9: "A",
    p10: "A",
  },
  tiene_encuesta: true,
  gastos: { vivienda: 15000, alimentacion: 10000, transporte: 5000 },
  custom_expenses: [],
  deudas: [
    {
      id: "d1",
      acreedor: "Banco QA",
      acreedor_raw: "Banco QA",
      monto: 40000,
      pago: 3000,
      tipo: "prestamo",
      situacion_ui: "pagando_normal",
      estado: "al_dia",
      pago_fuente: "declarado",
      cancelada: false,
      debt_confidence: "high",
    },
  ],
  snap: { fecha_inicio: "2026-08-02T12:00:00.000Z" },
  no_debts_declared: false,
  bcu_clearing_live: false,
  decision_provenance: false,
};

async function main() {
  var config = loadConfig(process.env);
  if (!config.persistenceConfigured) {
    console.error("B2_ENV_MISSING: set SUPABASE_URL, SUPABASE_ANON_KEY, MIPLAN_BACKEND_SECRET in server/.env");
    process.exitCode = 1;
    return;
  }

  var client = createSupabaseClient(config);
  var repository = createDiagnosisRepository({
    client: client,
    backendSecret: config.backendSecret,
    tenantId: config.defaultTenantId,
  });
  var service = createDiagnosisService({
    repository: repository,
    tenantId: config.defaultTenantId,
  });

  var app = createApp(config, { diagnosisService: service });
  var server = http.createServer(app);
  await new Promise(function (resolve, reject) {
    server.listen(0, "127.0.0.1", function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
  var port = server.address().port;

  try {
    var health = await request(port, "GET", "/health");
    if (health.status === 200 && health.body && health.body.status === "ok") {
      results.HEALTH = "PASS";
    }

    var anonId = uuid();
    var headers = { "X-MiPlan-Anonymous-Id": anonId };

    var badPayload = await request(port, "POST", "/v1/diagnoses", [], headers);
    if (
      badPayload.status === 400 &&
      badPayload.body &&
      badPayload.body.error === "ENGINE_INPUT_REQUIRED"
    ) {
      results.INVALID_PAYLOAD_REJECTED = "PASS";
    }

    var badAnon = await request(port, "POST", "/v1/diagnoses", sampleInput, {
      "X-MiPlan-Anonymous-Id": "not-a-uuid",
    });
    if (
      badAnon.status === 400 &&
      badAnon.body &&
      badAnon.body.error === "ANONYMOUS_ID_INVALID"
    ) {
      results.INVALID_ANON_REJECTED = "PASS";
    }

    // DB failure: wrong secret → must not return 200 with diagnosis_id
    var badRepo = createDiagnosisRepository({
      client: client,
      backendSecret: "wrong-secret-should-fail-persist-xxxxxxxxxxxx",
      tenantId: config.defaultTenantId,
    });
    var badService = createDiagnosisService({
      repository: badRepo,
      tenantId: config.defaultTenantId,
    });
    var failApp = createApp(config, { diagnosisService: badService });
    var failServer = http.createServer(failApp);
    await new Promise(function (resolve, reject) {
      failServer.listen(0, "127.0.0.1", function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    var failPort = failServer.address().port;
    try {
      var failRes = await request(failPort, "POST", "/v1/diagnoses", sampleInput, {
        "X-MiPlan-Anonymous-Id": uuid(),
      });
      if (failRes.status >= 500 && !(failRes.body && failRes.body.diagnosis_id)) {
        results.DB_FAILURE_NO_FALSE_SUCCESS = "PASS";
      }
    } finally {
      await new Promise(function (resolve) {
        failServer.close(function () {
          resolve();
        });
      });
    }

    var r1 = await request(port, "POST", "/v1/diagnoses", sampleInput, headers);
    if (r1.status === 200 && r1.body && r1.body.diagnosis_id && r1.body.result) {
      results.INSERT_OK = "PASS";
      results.DIAGNOSIS_ID_GENERATED = "PASS";
    }

    var id1 = r1.body && r1.body.diagnosis_id;
    var row1 = id1 ? await repository.getDiagnosisById(id1) : null;
    var snapshot1 = row1 ? JSON.stringify(row1) : null;

    var r2 = await request(
      port,
      "POST",
      "/v1/diagnoses",
      Object.assign({}, sampleInput, { ingreso: 110000, declared_ingreso: 110000 }),
      headers
    );
    var id2 = r2.body && r2.body.diagnosis_id;

    if (r2.status === 200 && id2 && id1 && id1 !== id2) {
      results.APPEND_ONLY_TWO_ROWS = "PASS";
    }

    var row1After = id1 ? await repository.getDiagnosisById(id1) : null;
    if (snapshot1 && row1After && JSON.stringify(row1After) === snapshot1) {
      results.FIRST_INTACT = "PASS";
    }

    if (row1 && row1.engine_version && row1.engine_version === r1.body.engine_version) {
      results.ENGINE_VERSION_PERSISTED = "PASS";
    }
    if (row1 && row1.now_ms != null && typeof row1.now_ms === "number") {
      results.NOW_MS_PERSISTED = "PASS";
    }
    if (row1 && row1.input_snapshot && row1.input_snapshot.ingreso === 100000) {
      results.INPUT_SNAPSHOT_PERSISTED = "PASS";
    }
    if (
      row1 &&
      row1.engine_result &&
      row1.engine_result.planId != null &&
      r1.body.result &&
      r1.body.result.planId === row1.engine_result.planId
    ) {
      results.ENGINE_RESULT_PERSISTED = "PASS";
    }
    if (
      row1 &&
      row1.completeness &&
      r1.body.result &&
      r1.body.result.completeness_recomputed &&
      row1.completeness.hasCompletedFinancialInputs ===
        r1.body.result.completeness_recomputed.hasCompletedFinancialInputs &&
      row1.completeness.financial_profile_complete ===
        r1.body.result.completeness_recomputed.financial_profile_complete
    ) {
      results.COMPLETENESS_SERVER = "PASS";
    }
  } finally {
    await new Promise(function (resolve) {
      server.close(function () {
        resolve();
      });
    });
  }

  Object.keys(results).forEach(function (k) {
    console.log(k, results[k]);
  });

  var failed = Object.keys(results).some(function (k) {
    return results[k] !== "PASS";
  });
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error("B2_TEST_ERROR", err && err.message ? err.message : err);
  process.exitCode = 1;
});
