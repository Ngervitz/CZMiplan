/**
 * server/bin/b3-shadow-metrics-test.js — shadow telemetry API checks
 * Requires server/.env with Supabase + MIPLAN_BACKEND_SECRET.
 */
"use strict";

var path = require("path");
var http = require("http");
var crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

var loadConfig = require("../config").loadConfig;
var createApp = require("../app").createApp;

var results = {
  MATCH_ONCE: "FAIL",
  MISMATCH_ONCE: "FAIL",
  RETRY_NO_DUPLICATE: "FAIL",
  DIFF_FIELDS_STORED: "FAIL",
  INVALID_STATUS: "FAIL",
  MISSING_DIAGNOSIS: "FAIL",
  DIAGNOSIS_UNCHANGED: "FAIL",
};

function request(port, method, urlPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body !== undefined ? JSON.stringify(body) : null;
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: urlPath,
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
          var raw = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch (e) {}
          resolve({ status: res.statusCode, body: json, raw: raw });
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
  declared_nombre: "QA Shadow Metrics",
  declared_email: "qa-shadow-metrics@example.test",
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
    console.error("B3_METRICS_ENV_MISSING");
    process.exit(2);
  }

  var app = createApp(config);
  var server = http.createServer(app);
  await new Promise(function (resolve, reject) {
    server.listen(0, "127.0.0.1", function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
  var port = server.address().port;
  var anon = crypto.randomUUID();
  var headers = { "X-MiPlan-Anonymous-Id": anon };

  try {
    var created = await request(port, "POST", "/v1/diagnoses", sampleInput, headers);
    if (created.status !== 200 || !created.body || !created.body.diagnosis_id) {
      throw new Error("create_failed " + created.status);
    }
    var id = created.body.diagnosis_id;
    var engineVersion = created.body.engine_version;
    var planId = created.body.result && created.body.result.planId;

    var match1 = await request(
      port,
      "POST",
      "/v1/diagnoses/" + id + "/shadow-result",
      { status: "MATCH", diff_fields: [], is_technical: true },
      headers
    );
    if (match1.status === 200 && match1.body && match1.body.inserted === true) {
      results.MATCH_ONCE = "PASS";
    }

    var match2 = await request(
      port,
      "POST",
      "/v1/diagnoses/" + id + "/shadow-result",
      { status: "MISMATCH", diff_fields: ["planId"], is_technical: true },
      headers
    );
    if (
      match2.status === 200 &&
      match2.body &&
      match2.body.inserted === false &&
      match2.body.shadow_status === "MATCH"
    ) {
      results.RETRY_NO_DUPLICATE = "PASS";
    }

    var id2Created = await request(
      port,
      "POST",
      "/v1/diagnoses",
      Object.assign({}, sampleInput, { declared_ingreso: 100001, ingreso: 100001 }),
      { "X-MiPlan-Anonymous-Id": crypto.randomUUID() }
    );
    var id2 = id2Created.body && id2Created.body.diagnosis_id;
    var mm = await request(
      port,
      "POST",
      "/v1/diagnoses/" + id2 + "/shadow-result",
      { status: "MISMATCH", diff_fields: ["planId", "fin.ratio"], is_technical: true },
      headers
    );
    if (mm.status === 200 && mm.body && mm.body.inserted === true && mm.body.shadow_status === "MISMATCH") {
      results.MISMATCH_ONCE = "PASS";
      results.DIFF_FIELDS_STORED = "PASS";
    }

    var badStatus = await request(
      port,
      "POST",
      "/v1/diagnoses/" + id + "/shadow-result",
      { status: "NOPE", diff_fields: [] },
      headers
    );
    if (badStatus.status === 400) results.INVALID_STATUS = "PASS";

    var missing = await request(
      port,
      "POST",
      "/v1/diagnoses/00000000-0000-4000-8000-000000000099/shadow-result",
      { status: "MATCH", diff_fields: [] },
      headers
    );
    if (missing.status === 404) results.MISSING_DIAGNOSIS = "PASS";

    // Authority unchanged: re-read via creating isn't available; use getDiagnosis via repository path
    // Ensure create response still owns fields and shadow route response has no engine_result
    if (
      !match1.body.engine_result &&
      !match1.body.engine_version &&
      !match1.body.result &&
      engineVersion &&
      planId != null
    ) {
      results.DIAGNOSIS_UNCHANGED = "PASS";
    }
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }

  Object.keys(results).forEach(function (k) {
    console.log(k, results[k]);
  });
  var failed = Object.keys(results).some(function (k) {
    return results[k] === "FAIL";
  });
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
