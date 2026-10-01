/**
 * server/bin/entry-01-test.js
 * ENTRY-01 — entry context, virgin defaults, UTM bridge, persistence provenance.
 */
"use strict";

var path = require("path");
var fs = require("fs");
var vm = require("vm");
var http = require("http");
var crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
var requireLiveWriteAllowedOrExit = require("../testing/liveWriteGuard").requireLiveWriteAllowedOrExit;

var loadConfig = require("../config").loadConfig;
var createApp = require("../app").createApp;
var createSupabaseClient = require("../modules/persistence/supabaseClient").createSupabaseClient;
var extractEngineInput = require("../modules/diagnosis/service").extractEngineInput;
var sanitizeEntryContext = require("../modules/diagnosis/service").sanitizeEntryContext;

var results = {};

function mark(k, ok) {
  results[k] = ok ? "PASS" : "FAIL";
  console.log(k, results[k]);
}

function bootConfig(search) {
  var normalized = search
    ? search.indexOf("?") === 0
      ? search
      : "?" + search
    : "";
  var src = fs
    .readFileSync(path.join(__dirname, "..", "..", "js", "config.js"), "utf8")
    .replace(/\bconst /g, "var ");
  var sandbox = {
    window: null,
    document: {
      getElementById: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
      addEventListener: function () {},
    },
    console: console,
    parseFloat: parseFloat,
    isFinite: isFinite,
    isNaN: isNaN,
    Object: Object,
    Array: Array,
    String: String,
    Date: Date,
    URLSearchParams: URLSearchParams,
    Math: Math,
    JSON: JSON,
  };
  sandbox.window = sandbox;
  sandbox.location = {
    search: normalized,
    href: "http://localhost/" + normalized,
  };
  vm.runInNewContext(src, sandbox, { filename: "config.js" });
  return sandbox;
}

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
      declared_nombre: "QA Entry-01",
      declared_email: "qa-entry-01@example.test",
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
      gastos: { vivienda: 15000 },
      custom_expenses: [],
      deudas: [],
      no_debts_declared: true,
      bcu_clearing_live: false,
      decision_provenance: false,
      entry_context: {
        entryContext: "organic",
        trafficSource: "paid",
        hasRejectionContext: false,
        evidenceStrength: "moderate",
        reasons: ["has_utm"],
        entry_source: "organic",
        acquisition: {
          utm_source: "meta",
          utm_medium: "cpc",
          utm_campaign: "entry01",
        },
        attribution_policy: "CURRENT_ENTRY",
        field_provenance: {
          ingreso: { source: "url_prefill", user_modified: false },
        },
        schema_version: 1,
      },
    },
    overrides || {}
  );
}

async function main() {
  // --- Client normalization / virgin ---
  var virgin = bootConfig("");
  mark(
    "VIRGIN_NO_DEMO_CEDULA",
    virgin.PRE.cedula === "" && virgin.PRE.nombre === "" && virgin.PRE.email === ""
  );
  mark("VIRGIN_ENTRY_ORGANIC", virgin.resolveEntryContext().entryContext === "organic");
  mark(
    "NORMALIZE_EXISTS",
    typeof virgin.normalizeEntryContext === "function"
  );

  var utm = bootConfig("?utm_source=meta&utm_campaign=x");
  var utmCtx = utm.normalizeEntryContext("?utm_source=meta&utm_campaign=x");
  mark(
    "UTM_ACQUISITION",
    utmCtx.acquisition &&
      utmCtx.acquisition.utm_source === "meta" &&
      utmCtx.trafficSource === "paid" &&
      utmCtx.attribution_policy === "CURRENT_ENTRY"
  );

  var cdv = bootConfig(
    "?laboral=relacion_dependencia&ingreso=45000&p1=A&utm_source=meta"
  );
  mark(
    "CDV_REJECTED",
    cdv.resolveEntryContext().entryContext === "cdv_rejected" &&
      cdv.resolveEntryContext().hasRejectionContext === true
  );

  var seo = bootConfig("?source=seo_ia");
  mark("SEO_IA_SOURCE", seo.resolveEntryContext().entryContext === "seo_organic");

  var junk = bootConfig("?acquisition=seo_ia&evil=1&utm_source=" + "z".repeat(200));
  var junkN = junk.normalizeEntryContext(
    "?acquisition=seo_ia&evil=1&utm_source=" + "z".repeat(200)
  );
  mark(
    "MALFORMED_IGNORED",
    junkN.entryContext === "organic" &&
      junkN.acquisition.utm_source.length === 64 &&
      junkN.acquisition.source == null
  );

  var bridge = bootConfig("?utm_source=meta&source=seo_ia&intent=credito");
  var redirect = bridge.buildSeoSurveyRedirectUrl();
  mark(
    "SURVEY_BRIDGE_PRESERVES_UTM",
    redirect.indexOf("utm_source=meta") >= 0 &&
      redirect.indexOf("source=seo_ia") >= 0 &&
      redirect.indexOf("cedula") < 0 &&
      redirect.indexOf("ingreso") < 0
  );

  // --- Server sanitize ---
  var cleaned = sanitizeEntryContext({
    entryContext: "cdv_rejected",
    hasRejectionContext: true,
    evil_field: "nope",
    acquisition: { utm_source: "meta", password: "x" },
    field_provenance: {
      ingreso: { source: "url_prefill", user_modified: false },
      bad: { source: "hacked" },
    },
  });
  mark(
    "SANITIZE_ENTRY",
    cleaned.entryContext === "cdv_rejected" &&
      cleaned.evil_field == null &&
      cleaned.acquisition.utm_source === "meta" &&
      cleaned.acquisition.password == null &&
      cleaned.field_provenance.ingreso.source === "url_prefill" &&
      cleaned.field_provenance.bad == null
  );

  var extracted = extractEngineInput({
    ingreso: 100000,
    cedula: "3.456.789-0",
    telefono: "099",
    monto: 50000,
    acquisition: { utm_source: "meta" },
    entry_context: { entryContext: "organic", trafficSource: "paid" },
    engine_result: { hack: true },
  });
  mark(
    "STRIP_PII_AND_AUTHORITY",
    extracted.cedula == null &&
      extracted.telefono == null &&
      extracted.monto == null &&
      extracted.engine_result == null &&
      extracted.entry_context.acquisition.utm_source === "meta"
  );

  // --- Live persist ---
  var config = loadConfig(process.env);
  if (!config.persistenceConfigured) {
    mark("ENTRY_PERSIST", false);
    mark("PROVENANCE_PERSIST", false);
  } else {
    requireLiveWriteAllowedOrExit("entry-01-test");
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
    try {
      var r = await request(port, "POST", "/v1/diagnoses", sample(), {
        "X-MiPlan-Anonymous-Id": anon,
      });
      mark("ENTRY_PERSIST", r.status === 200 && !!(r.body && r.body.diagnosis_id));
      if (r.body && r.body.diagnosis_id) {
        var { data: diag } = await client.rpc("miplan_get_diagnosis", {
          p_secret: config.backendSecret,
          p_diagnosis_id: r.body.diagnosis_id,
        });
        var { data: cap } = await client.rpc("miplan_get_financial_capture", {
          p_secret: config.backendSecret,
          p_diagnosis_id: r.body.diagnosis_id,
        });
        var snapOk =
          diag &&
          diag.input_snapshot &&
          diag.input_snapshot.entry_context &&
          diag.input_snapshot.entry_context.acquisition &&
          diag.input_snapshot.entry_context.acquisition.utm_source === "meta" &&
          diag.input_snapshot.entry_context.field_provenance &&
          diag.input_snapshot.entry_context.field_provenance.ingreso.source ===
            "url_prefill";
        var capOk =
          cap &&
          cap.financial &&
          cap.financial.entry_context &&
          (cap.financial.source_reference === "organic" ||
            (cap.financial.entry_context.entry_source ||
              cap.financial.entry_context.entryContext) === "organic");
        mark("PROVENANCE_PERSIST", !!(snapOk && capOk));
      } else {
        mark("PROVENANCE_PERSIST", false);
      }

      // second diagnosis same anon — history
      var r2 = await request(
        port,
        "POST",
        "/v1/diagnoses",
        sample({
          ingreso: 110000,
          declared_ingreso: 110000,
          entry_context: {
            entryContext: "seo_organic",
            trafficSource: "seo",
            hasRejectionContext: false,
            entry_source: "seo_organic",
            acquisition: { source: "seo_ia" },
            attribution_policy: "CURRENT_ENTRY",
            field_provenance: {
              ingreso: { source: "user_entered", user_modified: true },
            },
            schema_version: 1,
          },
        }),
        { "X-MiPlan-Anonymous-Id": anon }
      );
      mark(
        "SECOND_DIAGNOSIS_SAME_ANON",
        r2.status === 200 &&
          r2.body &&
          r2.body.diagnosis_id &&
          r2.body.diagnosis_id !== (r.body && r.body.diagnosis_id)
      );
    } finally {
      await new Promise(function (resolve) {
        server.close(resolve);
      });
    }
  }

  var failed = Object.keys(results).some(function (k) {
    return results[k] === "FAIL";
  });
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
