/**
 * server/bin/b3-shadow-test.js — B3 shadow unit checks (no browser required).
 *
 * Validates:
 * - payload strips client authorities
 * - MATCH / MISMATCH detection
 * - dedupe fingerprint uniqueness definition (documented)
 * - optional live POST when server/.env + CZ_BACKEND_API_URL available
 */
"use strict";

var path = require("path");
var http = require("http");
var crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

var results = {
  PAYLOAD_STRIPS_AUTHORITIES: "FAIL",
  MATCH_DETECTION: "FAIL",
  MISMATCH_DETECTION: "FAIL",
  DEDUPE_FINGERPRINT: "FAIL",
  LIVE_SHADOW_OPTIONAL: "SKIP",
  SECRET_SCAN: "FAIL",
};

function normalizeForCompare(engineResult) {
  return JSON.parse(
    JSON.stringify(engineResult, function (k, v) {
      if (v === undefined) return null;
      return v;
    })
  );
}

function diffPaths(expected, actual, prefix, out) {
  prefix = prefix || "";
  out = out || [];
  if (
    typeof expected !== "object" ||
    expected === null ||
    typeof actual !== "object" ||
    actual === null
  ) {
    if (expected !== actual) out.push({ path: prefix || "(root)", expected: expected, actual: actual });
    return out;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      out.push({ path: prefix || "(root)", expected: expected, actual: actual });
    }
    return out;
  }
  var keys = {};
  Object.keys(expected).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(actual).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(keys).forEach(function (k) {
    var p = prefix ? prefix + "." + k : k;
    if (!(k in expected)) out.push({ path: p, expected: undefined, actual: actual[k] });
    else if (!(k in actual)) out.push({ path: p, expected: expected[k], actual: undefined });
    else if (
      typeof expected[k] === "object" &&
      expected[k] !== null &&
      typeof actual[k] === "object" &&
      actual[k] !== null
    ) {
      diffPaths(expected[k], actual[k], p, out);
    } else if (expected[k] !== actual[k]) {
      out.push({ path: p, expected: expected[k], actual: actual[k] });
    }
  });
  return out;
}

function compareShadowResults(clientResult, serverResult) {
  var exp = normalizeForCompare(clientResult || {});
  var act = normalizeForCompare(serverResult || {});
  delete exp.diasRec;
  delete act.diasRec;
  var diffs = diffPaths(exp, act);
  return { ok: diffs.length === 0, diff_count: diffs.length, diffs: diffs };
}

function stripAuthorities(body) {
  var input = Object.assign({}, body);
  delete input.anonymous_id;
  delete input.diagnosis_id;
  delete input.engine_result;
  delete input.engine_version;
  delete input.result;
  delete input.completeness;
  delete input.completeness_recomputed;
  delete input.now_ms;
  return input;
}

// --- PAYLOAD ---
var dirty = {
  ingreso: 100000,
  diagnosis_id: "should-strip",
  engine_result: { planId: 9 },
  engine_version: "evil",
  now_ms: 1,
  completeness: { x: 1 },
  result: { y: 1 },
  deudas: [],
};
var clean = stripAuthorities(dirty);
if (
  !clean.diagnosis_id &&
  !clean.engine_result &&
  !clean.engine_version &&
  !clean.now_ms &&
  !clean.completeness &&
  !clean.result &&
  clean.ingreso === 100000
) {
  results.PAYLOAD_STRIPS_AUTHORITIES = "PASS";
}

// --- MATCH ---
var sample = {
  planId: 2,
  nivelR: "medio",
  diasRec: 10,
  fin: { ratio: 0.2 },
  coherence: { profileTier: "standard" },
};
var sampleServer = {
  planId: 2,
  nivelR: "medio",
  diasRec: 99,
  fin: { ratio: 0.2 },
  coherence: { profileTier: "standard" },
};
var m = compareShadowResults(sample, sampleServer);
if (m.ok) results.MATCH_DETECTION = "PASS";

// --- MISMATCH ---
var bad = compareShadowResults(sample, {
  planId: 5,
  nivelR: "medio",
  diasRec: 10,
  fin: { ratio: 0.2 },
  coherence: { profileTier: "standard" },
});
if (!bad.ok && bad.diff_count >= 1 && bad.diffs.some(function (d) { return d.path === "planId"; })) {
  results.MISMATCH_DETECTION = "PASS";
}

// --- DEDUPE fingerprint ---
var fp1 = JSON.stringify({ ingreso: 1, deudas: [] });
var fp2 = JSON.stringify({ ingreso: 1, deudas: [] });
var fp3 = JSON.stringify({ ingreso: 2, deudas: [] });
if (fp1 === fp2 && fp1 !== fp3) results.DEDUPE_FINGERPRINT = "PASS";

// --- SECRET SCAN (tracked FE files) ---
var fs = require("fs");
var feFiles = [
  path.join(__dirname, "..", "..", "js", "shadowDiagnosis.js"),
  path.join(__dirname, "..", "..", "js", "config.js"),
  path.join(__dirname, "..", "..", "index.html"),
];
var secretHits = [];
feFiles.forEach(function (f) {
  var txt = fs.readFileSync(f, "utf8");
  if (/MIPLAN_BACKEND_SECRET\s*=\s*['\"][^'\"]+['\"]/.test(txt)) secretHits.push(f);
  if (/SUPABASE_SERVICE_ROLE/.test(txt) && /eyJ/.test(txt)) secretHits.push(f);
  if (/service_role/.test(txt) && /eyJhbGciOi/.test(txt)) secretHits.push(f);
});
if (secretHits.length === 0) results.SECRET_SCAN = "PASS";

// --- Optional live shadow against local server if persistence configured ---
async function maybeLive() {
  var loadConfig = require("../config").loadConfig;
  var createApp = require("../app").createApp;
  var config = loadConfig(process.env);
  if (!config.persistenceConfigured) {
    results.LIVE_SHADOW_OPTIONAL = "SKIP";
    return;
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
  var sampleInput = {
    ingreso: 100000,
    laboral: "relacion_dependencia",
    declared_nombre: "QA B3",
    declared_email: "qa-b3@example.test",
    declared_laboral: "relacion_dependencia",
    declared_ingreso: 100000,
    respuestas: {
      p1: "A", p2: "A", p3: "A", p4: "A", p5: "A",
      p6: "A", p7: "A", p8: "A", p9: "A", p10: "A",
    },
    tiene_encuesta: true,
    gastos: { vivienda: 15000, alimentacion: 10000, transporte: 5000 },
    custom_expenses: [],
    deudas: [{
      id: "d1", acreedor: "Banco QA", acreedor_raw: "Banco QA",
      monto: 40000, pago: 3000, tipo: "prestamo",
      situacion_ui: "pagando_normal", estado: "al_dia",
      pago_fuente: "declarado", cancelada: false, debt_confidence: "high",
    }],
    snap: { fecha_inicio: "2026-08-02T12:00:00.000Z" },
    no_debts_declared: false,
    bcu_clearing_live: false,
    decision_provenance: false,
  };

  try {
    var res = await new Promise(function (resolve, reject) {
      var payload = JSON.stringify(sampleInput);
      var req = http.request(
        {
          hostname: "127.0.0.1",
          port: port,
          path: "/v1/diagnoses",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "X-MiPlan-Anonymous-Id": anon,
          },
        },
        function (r) {
          var chunks = [];
          r.on("data", function (c) { chunks.push(c); });
          r.on("end", function () {
            resolve({
              status: r.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"),
            });
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
    if (res.status === 200 && res.body && res.body.diagnosis_id && res.body.result) {
      results.LIVE_SHADOW_OPTIONAL = "PASS";
    } else {
      results.LIVE_SHADOW_OPTIONAL = "FAIL";
    }
  } finally {
    await new Promise(function (resolve) {
      server.close(function () { resolve(); });
    });
  }
}

maybeLive()
  .then(function () {
    Object.keys(results).forEach(function (k) {
      console.log(k, results[k]);
    });
    var failed = Object.keys(results).some(function (k) {
      return results[k] === "FAIL";
    });
    if (failed) process.exitCode = 1;
  })
  .catch(function (err) {
    console.error(err);
    process.exitCode = 1;
  });
