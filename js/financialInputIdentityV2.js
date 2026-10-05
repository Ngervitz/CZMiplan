/**
 * financialInputIdentityV2.js — financial_input_identity_v2 canonicalization (debt contract v2).
 *
 * Sibling of the FROZEN financial_input_identity_v1 (js/financialInputIdentity.js), which is
 * reused only through its exported amount / creditor helpers and is never edited. v2 is the
 * canonical form of the EngineInput facts the shadow-03 classifier consumes, for
 * snapshots carrying debt_contract_version "v2". Same canonical string ⇔ same shadow-03 decision.
 * Pinned by golden vectors in server/bin/financial-identity-v2-golden-test.js; any change to
 * fields, canonicalization, serialization or hashing ships as financial_input_identity_v3.
 *
 * Person facts (income, prefill flag, expenses, custom expenses, no_debts_declared) follow the v1
 * rules exactly. Debts keep array order (index = debt_index); each debt is
 *   [tipo, acreedor, monto, situacion_ui, pago, pago_mensual_actual, pago_clarificacion]
 * - situacion_ui: exact non-empty string (shadow-03 copies it into provenance), else null.
 * - pago: only for situations whose payment shadow-03 reads from pago (pagando_normal, no_seguro,
 *   missing / unrecognized); null otherwise.
 * - pago_mensual_actual: only for atrasado_pagando / mora / reclamo_disputa. Canonical amount, so
 *   known zero is "0" and unknown is null — never collapsed.
 * - pago_clarificacion: only for pagando_normal.
 * estado and ultimo_pago_declarado are not read by shadow-03 and are not part of v2.
 */
(function (root, factory) {
  var v1 = typeof module === "object" && module.exports
    ? require("./financialInputIdentity")
    : root.CZFinancialInputIdentity;
  var api = factory(v1);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CZFinancialInputIdentityV2 = api;
})(typeof self !== "undefined" ? self : this, function (v1) {
  "use strict";

  var VERSION = "financial_input_identity_v2";
  var INVALID = "!invalid";
  var INVALID_ENTRY = "!invalid_entry";
  var PAID = "!paid_or_cancelled";

  var CURRENT_PAYMENT_SITUATIONS = { atrasado_pagando: true, mora: true, reclamo_disputa: true };
  var NO_PAGO_SITUATIONS = { atrasado_pagando: true, mora: true, reclamo_disputa: true, deje_pagar: true };

  var canonicalAmount = v1.canonicalAmount;
  var canonicalText = v1.canonicalText;

  function isPlainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function isBlankAmount(raw) {
    return raw == null || (typeof raw === "string" && raw.trim() === "");
  }

  function canonicalExpense(raw) {
    if (isBlankAmount(raw)) return null;
    var c = canonicalAmount(raw);
    if (c == null || c.charAt(0) === "-") return INVALID;
    return c === "0" ? null : c;
  }

  function incomePrefillUnconfirmed(entryContext) {
    if (!isPlainObject(entryContext) || !isPlainObject(entryContext.field_provenance)) return false;
    var fp = entryContext.field_provenance;
    var meta = isPlainObject(fp.ingreso) ? fp.ingreso : isPlainObject(fp.declared_ingreso) ? fp.declared_ingreso : null;
    if (!meta) return false;
    var source = typeof meta.source === "string" ? meta.source : null;
    var detail = typeof meta.detail === "string" ? meta.detail : null;
    var handoffDeclared = source === "handoff" && detail === "handoff";
    var isPrefill = !handoffDeclared && (source === "url_prefill" || source === "handoff" || detail === "handoff");
    return isPrefill && meta.user_modified !== true;
  }

  function canonicalDebt(d) {
    if (!isPlainObject(d)) return INVALID_ENTRY;
    if (d.cancelada === true || d.situacion_ui === "pagada") return PAID;
    var sit = typeof d.situacion_ui === "string" && d.situacion_ui !== "" ? d.situacion_ui : null;
    var kind = sit != null ? sit.trim() : "";
    return [
      typeof d.tipo === "string" ? d.tipo.trim() || null : null,
      canonicalText(d.acreedor_raw != null ? d.acreedor_raw : d.acreedor),
      canonicalAmount(d.monto),
      sit,
      NO_PAGO_SITUATIONS[kind] ? null : canonicalAmount(d.pago),
      CURRENT_PAYMENT_SITUATIONS[kind] ? canonicalAmount(d.pago_mensual_actual) : null,
      kind === "pagando_normal" && typeof d.pago_clarificacion === "string" && d.pago_clarificacion
        ? d.pago_clarificacion
        : null,
    ];
  }

  /** Canonical JSON string (fixed positions, no object key order involved). */
  function canonicalizeFinancialInputV2(input) {
    if (!isPlainObject(input)) return null;
    var gastos = isPlainObject(input.gastos) ? input.gastos : {};
    var expenses = [];
    Object.keys(gastos).sort().forEach(function (k) {
      var c = canonicalExpense(gastos[k]);
      if (c != null) expenses.push([k, c]);
    });
    var custom = [];
    (Array.isArray(input.custom_expenses) ? input.custom_expenses : []).forEach(function (c) {
      if (!isPlainObject(c) || c.included === false || c._included === false) return;
      var v = canonicalExpense(c.amount != null ? c.amount : c.monto);
      if (v != null) custom.push(v);
    });
    return JSON.stringify([
      VERSION,
      canonicalAmount(input.ingreso != null ? input.ingreso : input.declared_ingreso),
      incomePrefillUnconfirmed(input.entry_context),
      expenses,
      custom,
      input.no_debts_declared === true,
      (Array.isArray(input.deudas) ? input.deudas : []).map(canonicalDebt),
    ]);
  }

  return {
    FINANCIAL_INPUT_IDENTITY_VERSION: VERSION,
    canonicalizeFinancialInputV2: canonicalizeFinancialInputV2,
  };
});
