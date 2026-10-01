/**
 * server/bin/data-01-structured-test.js
 * Validates structured financial captures persist atomically with diagnoses.
 */
"use strict";

var path = require("path");
var http = require("http");
var crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
var requireLiveWriteAllowedOrExit = require("../testing/liveWriteGuard").requireLiveWriteAllowedOrExit;

var loadConfig = require("../config").loadConfig;
var createApp = require("../app").createApp;
var createSupabaseClient = require("../modules/persistence/supabaseClient").createSupabaseClient;

var results = {
  DIAGNOSIS_PERSIST: "FAIL",
  FINANCIAL_CAPTURE: "FAIL",
  EXPENSE_CAPTURE: "FAIL",
  DEBT_CAPTURE: "FAIL",
  HISTORY_SECOND_DIAGNOSIS: "FAIL",
  FIRST_UNCHANGED: "FAIL",
  SNAPSHOT_PRESERVED: "FAIL",
  CREDITOR_FIELDS: "FAIL",
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
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

function sample(overrides) {
  return Object.assign(
    {
      ingreso: 100000,
      laboral: "relacion_dependencia",
      declared_nombre: "QA Data-01",
      declared_email: "qa-data-01@example.test",
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
      custom_expenses: [{ id: "c1", label: "Gym", amount: 2000, included: true }],
      deudas: [
        {
          id: "debt_stable_1",
          acreedor: "Banco QA",
          acreedor_raw: "Banco QA",
          acreedor_key: "banco qa",
          acreedor_normalizado: "otro",
          acreedor_display: "Banco QA",
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
    },
    overrides || {}
  );
}

async function getCapture(client, secret, diagnosisId) {
  var { data, error } = await client.rpc("miplan_get_financial_capture", {
    p_secret: secret,
    p_diagnosis_id: diagnosisId,
  });
  if (error) throw error;
  return data;
}

async function main() {
  requireLiveWriteAllowedOrExit("data-01-structured-test");
  var config = loadConfig(process.env);
  if (!config.persistenceConfigured) {
    console.error("DATA01_ENV_MISSING");
    process.exit(2);
  }

  var client = createSupabaseClient(config);
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
    var r1 = await request(port, "POST", "/v1/diagnoses", sample(), headers);
    if (r1.status !== 200 || !r1.body || !r1.body.diagnosis_id) {
      throw new Error("create1 failed " + r1.status + " " + JSON.stringify(r1.body));
    }
    var id1 = r1.body.diagnosis_id;
    results.DIAGNOSIS_PERSIST = "PASS";

    var { data: diag1 } = await client.rpc("miplan_get_diagnosis", {
      p_secret: config.backendSecret,
      p_diagnosis_id: id1,
    });
    if (diag1 && diag1.input_snapshot && Number(diag1.input_snapshot.ingreso) === 100000) {
      results.SNAPSHOT_PRESERVED = "PASS";
    }

    var cap1 = await getCapture(client, config.backendSecret, id1);
    if (cap1 && cap1.financial && Number(cap1.financial.ingreso) === 100000) {
      results.FINANCIAL_CAPTURE = "PASS";
    }
    if (cap1 && Array.isArray(cap1.expenses) && cap1.expenses.length >= 4) {
      // 3 category + 1 custom
      results.EXPENSE_CAPTURE = "PASS";
    }
    if (
      cap1 &&
      Array.isArray(cap1.debts) &&
      cap1.debts.length === 1 &&
      cap1.debts[0].client_debt_id === "debt_stable_1" &&
      Number(cap1.debts[0].monto) === 40000
    ) {
      results.DEBT_CAPTURE = "PASS";
    }
    if (cap1 && cap1.debts && cap1.debts[0] && cap1.debts[0].acreedor_raw === "Banco QA") {
      results.CREDITOR_FIELDS = "PASS";
    }

    var r2 = await request(
      port,
      "POST",
      "/v1/diagnoses",
      sample({
        ingreso: 120000,
        declared_ingreso: 120000,
        deudas: [
          {
            id: "debt_stable_1",
            acreedor: "Banco QA",
            acreedor_raw: "Banco QA",
            acreedor_key: "banco qa",
            acreedor_normalizado: "otro",
            acreedor_display: "Banco QA",
            monto: 30000,
            pago: 3000,
            tipo: "prestamo",
            situacion_ui: "pagando_normal",
            estado: "al_dia",
            pago_fuente: "declarado",
            cancelada: false,
            debt_confidence: "high",
          },
          {
            id: "debt_new_2",
            acreedor: "Financiera X",
            acreedor_raw: "Financiera X",
            monto: 10000,
            pago: 1000,
            tipo: "prestamo",
            situacion_ui: "pagando_normal",
            estado: "al_dia",
            pago_fuente: "declarado",
            cancelada: false,
            debt_confidence: "medium",
          },
        ],
      }),
      headers
    );
    if (r2.status !== 200 || !r2.body.diagnosis_id) {
      throw new Error("create2 failed " + r2.status);
    }
    var id2 = r2.body.diagnosis_id;
    var cap2 = await getCapture(client, config.backendSecret, id2);
    var cap1b = await getCapture(client, config.backendSecret, id1);

    if (
      cap2 &&
      Number(cap2.financial.ingreso) === 120000 &&
      Array.isArray(cap2.debts) &&
      cap2.debts.length === 2
    ) {
      results.HISTORY_SECOND_DIAGNOSIS = "PASS";
    }
    if (
      cap1b &&
      Number(cap1b.financial.ingreso) === 100000 &&
      Array.isArray(cap1b.debts) &&
      cap1b.debts.length === 1 &&
      Number(cap1b.debts[0].monto) === 40000
    ) {
      results.FIRST_UNCHANGED = "PASS";
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
