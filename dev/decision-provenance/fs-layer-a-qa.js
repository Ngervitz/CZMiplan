/**
 * DECISION-PROVENANCE-01 — PROV-FS Layer A QA + BUG-FS-CLARITY-LOW-MISS probe
 *
 * Usage: node dev/decision-provenance/fs-layer-a-qa.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var h = require("./harness");
var profiles = require("./profiles");

var passed = 0;
var failed = 0;
var findings = [];

function ok(label, cond, detail) {
  console.log((cond ? "[PASS] " : "[FAIL] ") + label + (detail ? " — " + detail : ""));
  if (cond) passed++;
  else failed++;
}

function loadBaseline() {
  var p = path.join(__dirname, "baseline-v1", "surfaces.jsonl");
  var map = {};
  fs.readFileSync(p, "utf8").trim().split(/\n/).forEach(function(line) {
    var row = JSON.parse(line);
    map[row.profile_id] = row;
  });
  return map;
}

function resolveProfile(ctx, profile) {
  if (profile.kind === "direct") {
    var diag = JSON.parse(JSON.stringify(profile.diag));
    var st = profile.st || h.completeSt();
    ctx.PRE = {
      ingreso: (diag.fin && diag.fin.ingreso) || 100000,
      respuestas: h.GOOD_SURVEY,
      nombre: "QA Synthetic",
      email: "qa@example.test",
      laboral: "relacion_dependencia",
    };
    if (profile.id === "FS_A_PREC_INSUFF_BEATS_REC" || profile.id === "FS_A_INSUFF_INCOME") {
      ctx.PRE.ingreso = 0;
    }
    ctx.TIENE_ENCUESTA = true;
    ctx.CZState = st;
    if (profile.expected_reason
        && profile.expected_reason.indexOf("FS_INSUFF") !== 0
        && profile.id.indexOf("PREC_INSUFF") < 0) {
      st.financial_profile_complete = true;
      st.financial_income_complete = true;
      st.financial_debts_complete = true;
      st.financial_expenses_complete = true;
      if (st.declared_ingreso == null || st.declared_ingreso <= 0) {
        st.declared_ingreso = (diag.fin && diag.fin.ingreso) || 100000;
      }
    }
    ctx.attachFinancialStageToDiag(diag, st);
    ctx.CZState.diag = diag;
    return { diag: diag, st: st };
  }
  var diagM = h.runMotor(ctx, profile.opts || {});
  return { diag: diagM, st: ctx.CZState };
}

function main() {
  var baseline = loadBaseline();

  // --- Flag OFF: no provenance, stages match baseline ---
  var ctxOff = h.createCtx({ CZ_DECISION_PROVENANCE: false });
  h.loadProduct(ctxOff);
  ok("flag default/off is falsy in product", !ctxOff.CZ_DECISION_PROVENANCE);

  var layerA = profiles.layerAFsProfiles();
  for (var i = 0; i < layerA.length; i++) {
    var p = layerA[i];
    var resolved = resolveProfile(ctxOff, p);
    var stage = resolved.diag.financial_stage;
    var base = baseline[p.id];
    ok(
      "flagOFF stage==baseline " + p.id,
      !!base && stage === base.financial_stage,
      "got=" + stage + " baseline=" + (base && base.financial_stage)
    );
    ok(
      "flagOFF no provenance " + p.id,
      resolved.diag.financial_stage_provenance == null
    );
  }

  // --- Flag ON: stages identical + reason_code matches expected ---
  var ctxOn = h.createCtx({ CZ_DECISION_PROVENANCE: true });
  h.loadProduct(ctxOn);
  ok("flag ON enabled in harness", !!ctxOn.CZ_DECISION_PROVENANCE);

  for (i = 0; i < layerA.length; i++) {
    p = layerA[i];
    resolved = resolveProfile(ctxOn, p);
    stage = resolved.diag.financial_stage;
    base = baseline[p.id];
    var prov = resolved.diag.financial_stage_provenance;
    ok(
      "flagON stage==baseline " + p.id,
      !!base && stage === base.financial_stage,
      "got=" + stage + " baseline=" + (base && base.financial_stage)
    );
    ok(
      "flagON provenance present " + p.id,
      !!(prov && prov.schema_version === 1 && prov.decision === "financial_stage")
    );
    ok(
      "flagON value mirrors stage " + p.id,
      !!(prov && prov.value === stage)
    );
    ok(
      "flagON source_layer " + p.id,
      !!(prov && prov.source_layer === "resolveFinancialStage")
    );
    ok(
      "flagON reason_code " + p.id,
      !!(prov && p.expected_reason && prov.reason_code === p.expected_reason),
      "got=" + (prov && prov.reason_code) + " expected=" + p.expected_reason
    );
    ok(
      "flagON evidence <=8 keys " + p.id,
      !!(prov && prov.evidence && Object.keys(prov.evidence).length <= 8)
    );
  }

  // --- BUG-FS-CLARITY-LOW-MISS investigation (document, do not fix) ---
  console.log("\n--- BUG-FS-CLARITY-LOW-MISS ---");
  var missDiag = {
    missing_payment_information: true,
    fin: {
      flujoLibre: -2500,
      ratio: 0.05,
      cantMoras: 0,
      totalDeuda: 0,
      totalPago: 0,
      dti_ratio: 0,
      ingreso: 100000,
      behavioral: {},
    },
    interpretacion_v2: {
      confidence_level: "low",
      missing_payment_information: true,
      interpretacion_parcial: true,
      severity_level: "medio",
    },
  };
  var missSt = h.completeSt({ no_debts_declared: true, declared_ingreso: 100000 });
  ctxOn.PRE = {
    ingreso: 100000,
    respuestas: h.GOOD_SURVEY,
    nombre: "QA Synthetic",
    email: "qa@example.test",
    laboral: "relacion_dependencia",
  };
  ctxOn.CZState = missSt;

  var helperWouldBlock = ctxOn._stageLowConfidenceBlocksStaging(
    missDiag,
    missSt,
    missDiag.fin,
    missDiag.interpretacion_v2
  );
  ok(
    "BUG helper alone CAN fire with flujoLibre<0",
    helperWouldBlock === true,
    "documents that FS_CLARITY_LOW_MISS condition is locally true"
  );

  var stageFull = ctxOn.resolveFinancialStage(missDiag, missSt);
  var provFull = ctxOn.resolveFinancialStage._lastProvenance;
  ok(
    "BUG full cascade → RECUPERACION (not CLARIDAD)",
    stageFull === "RECUPERACION",
    "got=" + stageFull
  );
  ok(
    "BUG provenance is FS_REC_FLUJO_NEG not FS_CLARITY_LOW_MISS",
    !!(provFull && provFull.reason_code === "FS_REC_FLUJO_NEG"),
    "got=" + (provFull && provFull.reason_code)
  );

  // Exhaustive: any flujoLibre<0 with low miss flags still recovery
  var unreachable = true;
  var samples = [-1, -0.01, -10000];
  for (var si = 0; si < samples.length; si++) {
    var d2 = JSON.parse(JSON.stringify(missDiag));
    d2.fin.flujoLibre = samples[si];
    var s2 = ctxOn.resolveFinancialStage(d2, missSt);
    var r2 = ctxOn.resolveFinancialStage._lastProvenance;
    if (s2 === "CLARIDAD" && r2 && r2.reason_code === "FS_CLARITY_LOW_MISS") {
      unreachable = false;
      findings.push("REACHABLE with flujoLibre=" + samples[si]);
    }
  }
  ok(
    "BUG-FS-CLARITY-LOW-MISS CONFIRMED_UNREACHABLE in resolveFinancialStage",
    unreachable === true
  );
  findings.push(
    unreachable
      ? "CONFIRMED_UNREACHABLE: FS_CLARITY_LOW_MISS requires flujoLibre<0 but FS_REC_FLUJO_NEG wins earlier in resolveFinancialStage"
      : "REACHABLE: see samples"
  );

  // Flag off regression on full baseline corpus stages
  console.log("\n--- Full baseline stage identity (flag OFF) ---");
  var all = profiles.allBaselineProfiles();
  var stageMismatches = 0;
  for (i = 0; i < all.length; i++) {
    p = all[i];
    resolved = resolveProfile(ctxOff, p);
    base = baseline[p.id];
    if (!base || resolved.diag.financial_stage !== base.financial_stage) {
      stageMismatches++;
      ok("corpus stage " + p.id, false,
        "got=" + resolved.diag.financial_stage + " base=" + (base && base.financial_stage));
    }
  }
  ok("full corpus financial_stage identical to baseline (flag OFF)", stageMismatches === 0,
    "mismatches=" + stageMismatches);

  console.log("\nFS Layer A QA: " + passed + " passed, " + failed + " failed");
  console.log("BUG finding: " + findings.join(" | "));
  if (failed) process.exit(1);
}

main();
