/**
 * engine/bin/classifier-harness.js — readable CLASSIFIER-SHADOW-01 output per fixture.
 * Usage: node engine/bin/classifier-harness.js [FIXTURE_ID ...]
 */
"use strict";

var classify = require("../classifier/financial-classifier").classifyFinancialShadow;
var FIXTURES = require("../../dev/backend-arch/classifier-shadow/fixtures").FIXTURES;

function fmt(v) {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function summarizeInput(input) {
  var lines = [];
  lines.push("  ingreso=" + fmt(input.ingreso) + " gastos=" + fmt(input.gastos) +
    " no_debts_declared=" + fmt(input.no_debts_declared === true));
  if (input.entry_context && typeof input.entry_context === "object") {
    lines.push("  entry_context=" + fmt(input.entry_context));
  }
  (input.deudas || []).forEach(function (d, i) {
    var parts = ["situacion_ui=" + fmt(d.situacion_ui), "estado=" + fmt(d.estado), "monto=" + fmt(d.monto), "pago=" + fmt(d.pago)];
    if (d.ultimo_pago_declarado != null) parts.push("ultimo_pago_declarado=" + fmt(d.ultimo_pago_declarado));
    if (d.cancelada) parts.push("cancelada=true");
    lines.push("  deuda[" + i + "] " + parts.join(" "));
  });
  var extra = ["tiene_encuesta", "respuestas", "user_intent"].filter(function (k) { return input[k] !== undefined; });
  if (extra.length) lines.push("  (ignored by classifier) " + extra.map(function (k) { return k + "=" + fmt(input[k]); }).join(" "));
  return lines.join("\n");
}

function render(fx) {
  var r = classify(JSON.parse(JSON.stringify(fx.input)));
  var cf = r.canonical_facts;
  var out = [];
  out.push("=".repeat(78));
  out.push(fx.id + " — " + fx.description);
  out.push("INPUT");
  out.push(summarizeInput(fx.input));
  out.push("CANONICAL FACTS");
  out.push("  monthly_income=" + fmt(cf.monthly_income) + " monthly_expenses=" + fmt(cf.monthly_expenses) +
    " monthly_debt_payments=" + fmt(cf.monthly_debt_payments));
  out.push("  canonical_flow=" + fmt(cf.canonical_flow) + " flow_sign=" + fmt(cf.flow_sign) +
    " active_debt=" + fmt(cf.active_debt) + " active_mora=" + fmt(cf.active_mora));
  out.push("  debt_burden_ratio=" + fmt(cf.debt_burden_ratio) + " burden_status=" + fmt(cf.burden_status) +
    " (T=" + r.debt_burden_threshold + " " + r.threshold_version + ") debt_set_complete=" + fmt(cf.debt_set_complete));
  cf.debts.forEach(function (d) {
    var p = d.monthly_debt_payment;
    var extras = [];
    if (d.last_payment_amount != null) extras.push("last_payment_amount=" + d.last_payment_amount);
    if (d.declared_payment_amount != null) extras.push("declared_payment_amount=" + d.declared_payment_amount);
    if (d.declared_debt_problem) extras.push("declared_debt_problem=true");
    out.push("  debt[" + d.debt_index + "] active_debt=" + fmt(d.active_debt) + " active_mora=" + fmt(d.active_mora) +
      " payment=" + p.status + (p.status === "UNKNOWN" ? "" : ":" + p.value) +
      " balance=" + d.provenance.balance_status + " situation=" + d.provenance.situation_source +
      (extras.length ? " " + extras.join(" ") : ""));
  });
  if (r.provenance.excluded_debts.length) out.push("  excluded=" + fmt(r.provenance.excluded_debts));
  out.push("S");
  out.push("  " + fmt(r.compatible_strategies));
  out.push("STATUS");
  out.push("  " + r.classification_status);
  out.push("STRATEGY");
  out.push("  " + fmt(r.strategy));
  out.push("ENTRY REASONS");
  out.push("  " + fmt(r.entry_reasons));
  out.push("MISSING FACTS");
  out.push("  " + (r.missing_required_facts.length
    ? r.missing_required_facts.map(function (m) { return m.fact + "@" + (m.subject === "debt" ? "debt[" + m.debt_index + "]" : "person"); }).join(", ")
    : "[]"));
  out.push("VERIFICATION");
  out.push("  required=" + r.verification_required + " reasons=" + (r.verification_reasons.length
    ? r.verification_reasons.map(function (v) { return v.code + "(" + v.fact + "@" + (v.subject === "debt" ? "debt[" + v.debt_index + "]" : "person") + ")"; }).join(", ")
    : "[]"));
  if (r.invariant_violations.length) out.push("INVARIANT VIOLATIONS " + fmt(r.invariant_violations));
  return out.join("\n");
}

var wanted = process.argv.slice(2);
FIXTURES.filter(function (fx) { return !wanted.length || wanted.indexOf(fx.id) !== -1; })
  .forEach(function (fx) { console.log(render(fx)); });
