/**
 * server/bin/smoke.js — Express + engine + (if configured) B2 persist path.
 */
"use strict";

var path = require("path");
var http = require("http");
var crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

var loadConfig = require("../config").loadConfig;
var createApp = require("../app").createApp;
var runEngine = require("../../engine").runEngine;
var ENGINE_VERSION = require("../../engine").ENGINE_VERSION;

var results = {
  EXPRESS_SERVER: "FAIL",
  HEALTH_ENDPOINT: "FAIL",
  NOT_FOUND: "FAIL",
  ERROR_HANDLING: "FAIL",
  ENGINE_RUNTIME_SMOKE: "FAIL",
  DIAGNOSES_ENDPOINT: "FAIL",
};

function request(port, method, pathName, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body != null ? JSON.stringify(body) : null;
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: pathName,
        method: method,
        headers: Object.assign(
          {
            Accept: "application/json",
            ...(payload
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
    if (payload) req.write(payload);
    req.end();
  });
}

var sampleInput = {
  ingreso: 100000,
  laboral: "relacion_dependencia",
  declared_nombre: "QA Synthetic",
  declared_email: "qa@example.test",
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
  var engineOut = runEngine(sampleInput, { now_ms: 1786536000000 });
  if (engineOut && engineOut.engine_result && engineOut.engine_result.planId != null) {
    results.ENGINE_RUNTIME_SMOKE = "PASS";
  }

  var config = loadConfig(process.env);
  var app = createApp(config);
  var server = http.createServer(app);

  await new Promise(function (resolve, reject) {
    server.listen(0, "127.0.0.1", function (err) {
      if (err) reject(err);
      else resolve();
    });
  });

  var port = server.address().port;
  results.EXPRESS_SERVER = "PASS";

  try {
    var health = await request(port, "GET", "/health");
    if (health.status === 200 && health.body && health.body.status === "ok") {
      results.HEALTH_ENDPOINT = "PASS";
    }

    var missing = await request(port, "GET", "/definitely-not-a-route");
    if (missing.status === 404 && missing.body && missing.body.error === "NOT_FOUND") {
      results.NOT_FOUND = "PASS";
    }

    var badArr = await request(port, "POST", "/v1/diagnoses", [], {
      "X-MiPlan-Anonymous-Id": crypto.randomUUID(),
    });
    if (
      badArr.status === 400 &&
      badArr.body &&
      (badArr.body.error === "ENGINE_INPUT_REQUIRED" ||
        badArr.body.error === "ANONYMOUS_ID_INVALID")
    ) {
      results.ERROR_HANDLING = "PASS";
    }
    // array body with valid anon → ENGINE_INPUT_REQUIRED
    if (badArr.status === 400 && badArr.body && badArr.body.error === "ENGINE_INPUT_REQUIRED") {
      results.ERROR_HANDLING = "PASS";
    }

    var diag = await request(port, "POST", "/v1/diagnoses", sampleInput, {
      "X-MiPlan-Anonymous-Id": crypto.randomUUID(),
    });
    if (config.persistenceConfigured) {
      if (
        diag.status === 200 &&
        diag.body &&
        diag.body.diagnosis_id &&
        diag.body.result &&
        diag.body.engine_version
      ) {
        results.DIAGNOSES_ENDPOINT = "PASS";
      }
    } else if (diag.status === 503 && diag.body && diag.body.error === "SUPABASE_CONFIG_MISSING") {
      results.DIAGNOSES_ENDPOINT = "PASS";
      console.log("NOTE: persistence env not configured; diagnoses returns 503 as expected");
    }
  } finally {
    await new Promise(function (resolve) {
      server.close(function () {
        resolve();
      });
    });
  }

  console.log("ENGINE_VERSION", ENGINE_VERSION);
  Object.keys(results).forEach(function (k) {
    console.log(k, results[k]);
  });

  var failed = Object.keys(results).some(function (k) {
    return results[k] !== "PASS";
  });
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
