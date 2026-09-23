/**
 * Directed ACCEPT/REJECT tests for the numeric output guard.
 * Usage: node dev/assistant-01/numeric-output-guard-qa.js
 */
"use strict";

var g = require("./numeric-output-guard");

var passed = 0;
var failed = 0;

function ok(label, cond) {
  console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
  if (cond) passed++;
  else failed++;
}

var whyNeg = { financial_stage: "RECUPERACION", reason_code: "FS_REC_FLUJO_NEG", evidence: { flujoLibre: -4200 } };
var whyRatio = { financial_stage: "RECUPERACION", reason_code: "FS_REC_RATIO_ALTO", evidence: { ratio: 0.42, threshold: 0.35 } };
var whyPos = { financial_stage: "ESTABILIZACION", reason_code: "FS_ESTAB_DEUDA", evidence: { totalDeuda: 4200 } };
var whyTech = {
  financial_stage: "RECUPERACION",
  reason_code: "FS_REC_FLUJO_NEG",
  evidence: { flujoLibre: -4200, schema_version: 1 },
};

ok("allowlist WHY uses evidence only, not reason_code digits",
  JSON.stringify(g.authorizedNumbers("WHY_DIAGNOSIS", whyNeg)) === JSON.stringify([-4200]));

ok("schema_version skipped even if nested in evidence",
  g.authorizedNumbers("WHY_DIAGNOSIS", whyTech).indexOf(1) === -1);

ok("REJECT 4200 vs authorized -4200",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyNeg, "flujo de 4200").decision === "REJECT");

ok("REJECT $4.200 vs authorized -4200",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyNeg, "flujo de $4.200").decision === "REJECT");

ok("REJECT +4200 vs authorized -4200",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyNeg, "flujo de +4200").decision === "REJECT");

ok("ACCEPT -4200",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyNeg, "flujo de -4200").decision === "PASS");

ok("ACCEPT -4.200 (UY thousands)",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyNeg, "flujo de -4.200").decision === "PASS");

ok("ACCEPT -$4.200",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyNeg, "flujo de -$4.200").decision === "PASS");

ok("ACCEPT unicode minus U+2212",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyNeg, "flujo de \u22124200").decision === "PASS");

ok("REJECT 42% vs authorized 0.42 (no conversion)",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyRatio, "el ratio es 42%").decision === "REJECT");

ok("ACCEPT 0.42 and 0.35",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyRatio, "ratio 0.42 umbral 0.35").decision === "PASS");

ok("REJECT extra 5000",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyPos, "4200 y 5000").decision === "REJECT");

ok("ACCEPT lone authorized 4200",
  g.checkNumericOutputGuard("WHY_DIAGNOSIS", whyPos, "deuda de 4200").decision === "PASS");

var actionCtx = {
  action_id: "ordenar_gastos",
  action_label: "Ordenar 3 gastos",
  selection_reason: {
    schema_version: 1,
    reason_code: "ACT_PICK_C1",
    evidence: { bank: "primary" },
  },
  retention_reason: null,
};
ok("technical IDs / schema_version / C1 not in allowlist",
  g.authorizedNumbers("EXPLAIN_ACTION", actionCtx).length === 0);

ok("output without quantities PASS even if allowlist empty",
  g.checkNumericOutputGuard("EXPLAIN_ACTION", actionCtx, "Ordenar tus gastos mensuales fue seleccionada.").decision === "PASS");

ok("ACT_PICK_C1 in output does not extract 1",
  g.extractQuantities("Se eligió por ACT_PICK_C1").length === 0);

ok("parse -4.200 === -4200", g.parseQuantityToken("-4.200").value === -4200);
ok("parse 4.200 === 4200 (unsigned UY)", g.parseQuantityToken("4.200").value === 4200);
ok("parse 0.42 === 0.42", g.parseQuantityToken("0.42").value === 0.42);

console.log("numeric-guard pass=" + passed + " fail=" + failed);
if (failed) process.exit(1);
