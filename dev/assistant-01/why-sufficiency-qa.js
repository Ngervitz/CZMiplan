/**
 * Sufficiency classification tests — independent of Layer A drift.
 * Drift A PASS must not substitute for this file PASS.
 */
"use strict";

var c = require("./why-evidence-contract");

var pass = 0;
var fail = 0;

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("PASS " + name);
  } else {
    fail++;
    console.log("FAIL " + name + (extra ? " :: " + extra : ""));
  }
}

function cls(code, ev) {
  return c.classifyWhyEvidence(code, ev);
}

ok("empty object INSUFFICIENT for FLUJO_NEG", !cls("FS_REC_FLUJO_NEG", {}).sufficient);
ok("INSUFF_INPUTS {} INSUFFICIENT", !cls("FS_INSUFF_INPUTS", {}).sufficient);
ok(
  "LOW_PARCIAL {confidence_level} INSUFFICIENT",
  !cls("FS_CLARITY_LOW_PARCIAL", { confidence_level: "low" }).sufficient
);
ok(
  "SEV_ALTO {severity_level} INSUFFICIENT (partial)",
  !cls("FS_REC_SEV_ALTO", { severity_level: "alto" }).sufficient
);
ok(
  "SEV_ALTO {severity_level,ratio} INSUFFICIENT (still partial)",
  !cls("FS_REC_SEV_ALTO", { severity_level: "alto", ratio: 0.42 }).sufficient
);
ok(
  "INSUFF_INCOME {income:0} SUFFICIENT (one-field form)",
  cls("FS_INSUFF_INCOME", { income: 0 }).sufficient
);
ok(
  "FLUJO_NEG {flujoLibre} SUFFICIENT",
  cls("FS_REC_FLUJO_NEG", { flujoLibre: -4200 }).sufficient
);
ok(
  "ESTAB_DEUDA {totalDeuda} SUFFICIENT",
  cls("FS_ESTAB_DEUDA", { totalDeuda: 180000 }).sufficient
);
ok(
  "INSUFF_INPUTS has_completed form SUFFICIENT",
  cls("FS_INSUFF_INPUTS", { has_completed_financial_inputs: false }).sufficient
);
ok(
  "LOW_PARCIAL full form SUFFICIENT",
  cls("FS_CLARITY_LOW_PARCIAL", {
    confidence_level: "low",
    interpretacion_parcial: true,
    no_debts_declared: false,
    has_liabilities: false,
  }).sufficient
);
ok(
  "SEV_ALTO full form SUFFICIENT",
  cls("FS_REC_SEV_ALTO", {
    severity_level: "alto",
    ratio: 0.42,
    flujoLibre: 100,
    threshold_opt_max: 0.35,
  }).sufficient
);
ok("unknown code fail-closed", !cls("FS_NOT_A_REAL_CODE", { income: 1 }).sufficient);
ok("null code fail-closed", !cls(null, { income: 1 }).sufficient);
ok(
  "keys.length>0 is NOT the rule (LOW_PARCIAL)",
  Object.keys({ confidence_level: "low" }).length > 0 &&
    !cls("FS_CLARITY_LOW_PARCIAL", { confidence_level: "low" }).sufficient
);

var extra = cls("FS_REC_FLUJO_NEG", { flujoLibre: -1, extra_noise: true });
ok("superset of sufficient form still SUFFICIENT", extra.sufficient);

console.log("sufficiency pass=" + pass + " fail=" + fail);
if (fail) process.exit(1);
console.log("WHY_SUFFICIENCY_QA: PASS");
