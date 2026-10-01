/**
 * server/bin/financial-identity-test.js — V2-FINANCIAL-IDENTITY-AND-WIRING-01, identity tests 1–10.
 *
 * financial_input_identity_v1 against the real classifier and the real diagnosis service
 * (memory repositories, journeys built from the real JANUS context). No network, no DB.
 *
 * node server/bin/financial-identity-test.js
 */
"use strict";

var assert = require("assert");

var shared = require("../../js/financialInputIdentity");
var identity = require("../modules/diagnosis/financialIdentity");
var classifier = require("../../engine/classifier/financial-classifier");
var FIXTURES = require("../../dev/backend-arch/classifier-shadow/fixtures").FIXTURES;
var e2e = require("../../dev/backend-arch/classifier-shadow/v2-wiring-e2e");
var diagnosisServiceModule = require("../modules/diagnosis/service");
var createMemoryStrategyEvaluationStore = require("../testing/memoryStrategyEvaluations").createMemoryStrategyEvaluationStore;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail) : ""));
}
function eq(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch (_e) {
    return false;
  }
}
function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
function reverseKeys(x) {
  if (Array.isArray(x)) return x.map(reverseKeys);
  if (!x || typeof x !== "object") return x;
  var o = {};
  Object.keys(x).reverse().forEach(function (k) { o[k] = reverseKeys(x[k]); });
  return o;
}
function id(input) {
  return identity.deriveFinancialInputIdentity(input).value;
}
function classify(input) {
  return classifier.classifyFinancialShadow(clone(input));
}

function debt(over) {
  return Object.assign({
    id: "d1", acreedor: "Creditel", acreedor_raw: "Creditel", tipo: "prestamo",
    situacion_ui: "pagando_normal", estado: "al_dia", monto: 120000, pago: 6500, cancelada: false,
  }, over || {});
}
function base(over) {
  return Object.assign({
    ingreso: 50000, declared_ingreso: 50000, gastos: { vivienda: 20000, alimentacion: 8000 }, custom_expenses: [],
    deudas: [debt(), debt({ id: "d2", acreedor: "OCA", acreedor_raw: "OCA", tipo: "tarjeta", monto: 30000, pago: 3000 })],
    no_debts_declared: false,
    entry_context: { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } },
  }, over || {});
}
function withDebt(i, over) {
  var b = base();
  Object.assign(b.deudas[i], over);
  return b;
}

async function main() {
  var ref = base();
  var refId = id(ref);

  // ---- shape / determinism ----
  var fid = identity.deriveFinancialInputIdentity(ref);
  check("identity = {version financial_input_identity_v1, value sha256 hex}; deterministic across calls and key order",
    fid.version === "financial_input_identity_v1" && /^[0-9a-f]{64}$/.test(fid.value) && id(clone(ref)) === refId &&
    id(reverseKeys(ref)) === refId, fid);
  check("identity excludes classifier_version by construction (canonical string never contains it)",
    shared.canonicalizeFinancialInput(ref).indexOf(classifier.CLASSIFIER_VERSION) === -1 &&
    shared.canonicalizeFinancialInput(ref).indexOf("classifier") === -1);

  // ---- [1] amounts ----
  var forms = [5000, "5000", 5000.0, "5000.00"];
  var amountIds = forms.map(function (v) { return id(base({ ingreso: v, declared_ingreso: v })); });
  check("[1] ingreso 5000 / \"5000\" / 5000.0 / \"5000.00\" -> same identity",
    amountIds.every(function (x) { return x === amountIds[0]; }), amountIds);
  var debtAmountIds = forms.map(function (v) { return id(withDebt(0, { monto: v, pago: v })); });
  var gastoIds = forms.map(function (v) { return id(base({ gastos: { vivienda: v, alimentacion: 8000 } })); });
  check("[1] debt saldo/cuota and gastos 5000 / \"5000\" / 5000.0 / \"5000.00\" -> same identity",
    debtAmountIds.every(function (x) { return x === debtAmountIds[0]; }) && gastoIds.every(function (x) { return x === gastoIds[0]; }));
  var A = shared.canonicalAmount;
  var table = [
    [5000, "5000"], ["5000", "5000"], [5000.0, "5000"], ["5000.00", "5000"], [" 5000 ", "5000"], ["0005000.50", "5000.5"],
    ["5000.", null], [".5", null], ["5,000", null], ["5.000,00", null], ["$5000", null], ["5e3", null], ["", null], ["   ", null],
    [null, null], [undefined, null], [NaN, null], [Infinity, null], [-Infinity, null], [true, null], [{}, null],
    [0, "0"], [-0, "0"], ["-0", "0"], ["-0.00", "0"], ["0.000", "0"], [-5, "-5"], ["-5.10", "-5.1"],
    [0.1 + 0.2, "0.30000000000000004"], ["0.30000000000000004", "0.30000000000000004"], [1e21, "1000000000000000000000"],
    [1e-7, "0.0000001"], [123.456, "123.456"], ["123.4560", "123.456"],
  ];
  var bad = table.filter(function (t) { return A(t[0]) !== t[1]; }).map(function (t) { return [String(t[0]), A(t[0]), t[1]]; });
  check("[1] amount canonicalization table (dot decimal only, full precision, trailing zeros, -0, null, \"\", invalid) — " +
    table.length + " cases", bad.length === 0, bad);
  var parity = table.filter(function (t) { return typeof t[0] === "number" || typeof t[0] === "string"; }).every(function (t) {
    var c = A(t[0]);
    var p = classify(base({ ingreso: t[0], declared_ingreso: t[0] })).canonical_facts.monthly_income;
    var n = c == null ? null : Number(c);
    return c == null ? (p === classifier.UNKNOWN) : (n > 0 ? p === n : p === classifier.UNKNOWN);
  });
  check("[1] canonical amount agrees with the classifier parse (null <-> UNKNOWN, value <-> same number)", parity);
  check("[1] blank vs invalid expense: blank/0 omitted (same identity as absent), invalid/negative distinct",
    id(base({ gastos: { vivienda: 20000, alimentacion: 8000, ocio: "" } })) === refId &&
    id(base({ gastos: { vivienda: 20000, alimentacion: 8000, ocio: 0 } })) === refId &&
    id(base({ gastos: { vivienda: 20000, alimentacion: 8000, ocio: "abc" } })) !== refId &&
    id(base({ gastos: { vivienda: 20000, alimentacion: 8000, ocio: -1 } })) !== refId);
  check("[1] blank ingreso: null / \"\" / \"  \" / invalid all canonicalize to null (same identity)",
    [null, "", "  ", "abc", "5,000"].map(function (v) { return id(base({ ingreso: v, declared_ingreso: null })); })
      .every(function (x, _i, arr) { return x === arr[0]; }));

  // ---- [2] creditor text ----
  var credIds = ["Creditel", " creditel ", "CREDITEL", "creditel", "\tCreditel\n"].map(function (v) {
    return id(withDebt(0, { acreedor: v, acreedor_raw: v }));
  });
  check("[2] \"Creditel\" / \" creditel \" / \"CREDITEL\" -> same identity", credIds.every(function (x) { return x === credIds[0]; }), credIds);
  var T = shared.canonicalText;
  check("[2] text rules: internal spaces collapsed, NFKC (fullwidth/nbsp), accents kept, empty/null -> null",
    T("Banco   República") === "banco república" && T("ＣＲＥＤＩＴＥＬ") === "creditel" && T("Banco\u00a0QA") === "banco qa" &&
    T("Banco República") !== T("Banco Republica") && T("") === null && T("   ") === null && T(null) === null &&
    T("e\u0301") === T("\u00e9"));
  check("[2] acreedor_raw has precedence over acreedor (same rule as app.js); display-only changes do not alter identity",
    id(withDebt(0, { acreedor: "Creditel S.A. (display)" })) === refId &&
    id(withDebt(0, { acreedor_raw: "OCA" })) !== refId &&
    id(withDebt(0, { acreedor_raw: null, acreedor: "creditel" })) === refId);
  check("[2] different creditor -> different identity (debt_index meaning changes)", id(withDebt(0, { acreedor_raw: "Anda" })) !== refId);

  // ---- [3] timestamps ----
  var ts = base({ snap: { fecha_inicio: "2026-01-01T00:00:00.000Z" } });
  ts.deudas.forEach(function (d, i) {
    d.updated_at = "2026-09-30T10:0" + i + ":00.000Z";
    d.created_at = "2026-09-01T00:00:00.000Z";
    d.fecha_actualizacion = "2026-09-30";
  });
  var ts2 = clone(ts);
  ts2.snap.fecha_inicio = "2026-05-05T00:00:00.000Z";
  ts2.deudas.forEach(function (d) { d.updated_at = "2027-01-01T00:00:00.000Z"; d.created_at = "2027-01-01T00:00:00.000Z"; });
  check("[3] same facts, different timestamps (debt updated_at/created_at, snap.fecha_inicio) -> same identity",
    id(ts) === refId && id(ts2) === refId && eq(classify(ts2), classify(ref)));

  // ---- [4] enrichment ----
  var en = base();
  en.deudas.forEach(function (d) {
    Object.assign(d, { pago_fuente: "estimado", debt_confidence: "low", interes: 0.62, tasa_estimada: 0.9, tna_ref: 1.1,
      acreedor_key: "creditel", acreedor_display: "Creditel", monto_original: 999999, dias_mora: 3, cuotas_restantes: 12 });
  });
  check("[4] same facts, different enrichment (pago_fuente, confidence, TASAS/interest, keys/display) -> same identity",
    id(en) === refId && eq(classify(en), classify(ref)));

  // ---- [5] income ----
  check("[5] real income change -> different identity", id(base({ ingreso: 50001, declared_ingreso: 50001 })) !== refId);
  check("[5] income provenance that changes the classification (unconfirmed URL prefill) -> different identity",
    id(base({ entry_context: { field_provenance: { ingreso: { source: "url_prefill", user_modified: false } } } })) !== refId);
  check("[5] provenance detail that does not change the classification (session restore) -> same identity",
    id(base({ entry_context: { field_provenance: { ingreso: { source: "user_entered", user_modified: false, detail: "session_restore" } } } })) === refId);

  // ---- [6] expenses ----
  check("[6] real expense change -> different identity", id(base({ gastos: { vivienda: 20001, alimentacion: 8000 } })) !== refId);
  check("[6] custom expense added / excluded toggle -> different / same identity",
    id(base({ custom_expenses: [{ id: "c1", label: "Gym", amount: 1500, included: true }] })) !== refId &&
    id(base({ custom_expenses: [{ id: "c1", label: "Gym", amount: 1500, included: false }] })) === refId);

  // ---- [7] debt fields ----
  var rel = [
    ["saldo", { monto: 120001 }], ["cuota", { pago: 6501 }], ["situacion_ui", { situacion_ui: "atrasado_pagando" }],
    ["tipo", { tipo: "tarjeta" }], ["cancelada", { cancelada: true }], ["pagada", { situacion_ui: "pagada" }],
  ];
  var relBad = rel.filter(function (r) { return id(withDebt(0, r[1])) === refId; }).map(function (r) { return r[0]; });
  check("[7] saldo / cuota / situacion / tipo / cancelled -> different identity", relBad.length === 0, relBad);
  var irrelevant = [
    ["estado when situacion_ui is set", { estado: "mora" }],
    ["ultimo_pago_declarado when pagando_normal", { ultimo_pago_declarado: 999 }],
    ["pago_clarificacion when not pagando_normal", { situacion_ui: "deje_pagar", pago_clarificacion: "x" }, { situacion_ui: "deje_pagar" }],
  ];
  var irrBad = irrelevant.filter(function (r) {
    var a = withDebt(0, r[1]);
    var b = r[2] ? withDebt(0, r[2]) : ref;
    return id(a) !== id(b) || !eq(classify(a), classify(b));
  }).map(function (r) { return r[0]; });
  check("[7] fields the classifier ignores in that situation -> same identity and same classifier output", irrBad.length === 0, irrBad);
  check("[7] legacy estado counts when situacion_ui is blank; ultimo_pago_declarado counts when atrasado_pagando",
    id(withDebt(0, { situacion_ui: "", estado: "al_dia" })) !== id(withDebt(0, { situacion_ui: "", estado: "mora" })) &&
    id(withDebt(0, { situacion_ui: "atrasado_pagando", ultimo_pago_declarado: 1 })) !==
      id(withDebt(0, { situacion_ui: "atrasado_pagando", ultimo_pago_declarado: 2 })));

  // ---- [8] order ----
  var swapped = base();
  swapped.deudas.reverse();
  check("[8] same debts in a different order -> different identity (order defines debt_index)",
    id(swapped) !== refId && classify(swapped).classification_status === classify(ref).classification_status);

  // ---- [9] survey / marketing / non-financial context ----
  var noise = base({
    respuestas: { p1: "A", p2: "B" }, tiene_encuesta: true, survey_version: 2, loan_purpose: "other", help_receptivity: "autonomous",
    laboral: "independiente", declared_laboral: "independiente", declared_nombre: "Ana", declared_email: "ana@example.test",
    user_intent: "ordenar", bcu_clearing_live: true, decision_provenance: true,
    acquisition: { utm_source: "google", utm_campaign: "x" },
    entry_context: { entryContext: "seo", trafficSource: "google", hasRejectionContext: true, acquisition: { utm_source: "fb" },
      field_provenance: { ingreso: { source: "user_entered", user_modified: true }, declared_nombre: { source: "handoff" } } },
    herr: { ingresos: [{ monto: 9999 }] },
  });
  check("[9] same financial input with different survey / marketing / contact / UI data -> same identity and classification",
    id(noise) === refId && eq(classify(noise), classify(ref)));

  // ---- parity sweep: identity-equal => classifier-equal; classifier-different => identity-different ----
  var cosmetic = [
    function (x) { (x.deudas || []).forEach(function (d) { if (d && typeof d === "object" && typeof d.monto === "number") d.monto = d.monto.toFixed(2); }); },
    function (x) { (x.deudas || []).forEach(function (d) { if (d && typeof d === "object" && typeof d.acreedor_raw === "string") d.acreedor_raw = "  " + d.acreedor_raw.toUpperCase() + " "; }); },
    function (x) { (x.deudas || []).forEach(function (d) { if (d && typeof d === "object") { d.updated_at = "2030-01-01"; d.pago_fuente = "x"; } }); },
    function (x) { x.respuestas = { p1: "C" }; x.tiene_encuesta = true; x.acquisition = { utm_source: "q" }; },
    function (x) { if (typeof x.ingreso === "number") x.ingreso = String(x.ingreso) + ".000"; },
  ];
  var relevant = [
    function (x) { x.ingreso = 12345; x.declared_ingreso = 12345; },
    function (x) { x.gastos = Object.assign({}, x.gastos, { vivienda: 1 }); },
    function (x) { if (x.deudas && x.deudas[0] && typeof x.deudas[0] === "object") x.deudas[0].pago = 99999; },
    function (x) { if (x.deudas && x.deudas[0] && typeof x.deudas[0] === "object") x.deudas[0].situacion_ui = "deje_pagar"; },
    function (x) { if (x.deudas && x.deudas[0] && typeof x.deudas[0] === "object") x.deudas[0].monto = 0; },
    function (x) { x.no_debts_declared = !x.no_debts_declared; },
    function (x) { if (Array.isArray(x.deudas)) x.deudas = x.deudas.slice().reverse(); },
    function (x) { x.entry_context = { field_provenance: { ingreso: { source: "url_prefill", user_modified: false } } }; },
  ];
  var cosFail = [];
  var relFail = [];
  var pairs = 0;
  FIXTURES.forEach(function (f) {
    var r0 = classify(f.input);
    var i0 = id(f.input);
    cosmetic.forEach(function (m, k) {
      var x = clone(f.input);
      m(x);
      pairs += 1;
      if (id(x) === i0 && !eq(classify(x), r0)) cosFail.push(f.name + "#c" + k);
    });
    relevant.forEach(function (m, k) {
      var x = clone(f.input);
      m(x);
      pairs += 1;
      var rx = classify(x);
      var sameResult = eq(rx, r0);
      if (!sameResult && id(x) === i0) relFail.push(f.name + "#r" + k);
    });
  });
  check("parity sweep over " + FIXTURES.length + " classifier fixtures (" + pairs + " variants): equal identity never yields a " +
    "different classifier output, and a different classifier output always yields a different identity",
    cosFail.length === 0 && relFail.length === 0, { cosmetic: cosFail, relevant: relFail });

  // ---- real service: server-derived, reproducible from input_snapshot, client claims ignored ----
  var snapshots = [];
  var strategies = [];
  var store = createMemoryStrategyEvaluationStore();
  var repo = {
    insertDiagnosis: async function (row) {
      snapshots.push(clone(row.input_snapshot));
      return { diagnosis_id: "dg-" + snapshots.length };
    },
    recordFinancialStrategyEvaluation: async function (row) {
      strategies.push(row);
      return store.record(clone(row));
    },
  };
  var js = e2e.journeyService;
  var ANON = "77777777-7777-4777-8777-777777777777";
  var journey = await js.createFromHandoffRedeem(ANON, "identity-test-v2", clone(e2e.RAW_CONTEXTS.V2));
  var svc = diagnosisServiceModule.createDiagnosisService({ repository: repo, tenantId: "miplan-default", journeyService: js });
  var claimBody = Object.assign(clone(ref), {
    journey_id: journey.journey_id,
    financial_input_identity: { version: "financial_input_identity_v1", value: new Array(65).join("f") },
    input_fingerprint: "client", identity: "client", canonical_facts: { monthly_income: 1 }, strategy: "CONTENCION",
  });
  var out = await svc.createDiagnosis({ anonymousId: ANON, body: claimBody });
  var v2 = out.v2_financial_strategy;
  check("server: identity derived from the sanitized input; client hash / fingerprint / strategy / canonical facts ignored",
    v2 && v2.financial_input_identity.value === refId && v2.financial_input_identity.value !== new Array(65).join("f") &&
    v2.strategy === classify(ref).strategy, v2);
  check("server: identity reproducible from diagnoses.input_snapshot (after the legacy engine ran)",
    snapshots.length === 1 && id(snapshots[0]) === v2.financial_input_identity.value);
  var fxOk = true;
  for (var fi = 0; fi < FIXTURES.length; fi++) {
    var o2 = await svc.createDiagnosis({ anonymousId: ANON, body: Object.assign(clone(FIXTURES[fi].input), { journey_id: journey.journey_id }) });
    var snap = snapshots[snapshots.length - 1];
    if (!o2.v2_financial_strategy || id(snap) !== o2.v2_financial_strategy.financial_input_identity.value ||
        id(FIXTURES[fi].input) !== o2.v2_financial_strategy.financial_input_identity.value) fxOk = false;
  }
  check("server: for all " + FIXTURES.length + " fixtures, identity(input_snapshot) == identity(request) == projected identity", fxOk);
  var dupe = await svc.createDiagnosis({ anonymousId: ANON, body: Object.assign(clone(ts2), { journey_id: journey.journey_id }) });
  check("server: semantic duplicate -> new diagnosis_id (append-only), same identity",
    dupe.diagnosis_id !== out.diagnosis_id && dupe.v2_financial_strategy.financial_input_identity.value === refId);

  // ---- [10] same identity + different classifier_version -> different validity ----
  var nextSvc = diagnosisServiceModule.createDiagnosisService({
    repository: repo, tenantId: "miplan-default", journeyService: js,
    classifyFn: function (input) {
      var r = classifier.classifyFinancialShadow(input);
      r.classifier_version = "miplan-financial-classifier-next-test";
      return r;
    },
  });
  var nx = await nextSvc.createDiagnosis({ anonymousId: ANON, body: Object.assign(clone(ref), { journey_id: journey.journey_id }) });
  function validityKey(j, p) {
    return [j, p.financial_input_identity.version, p.financial_input_identity.value, p.provenance.classifier_version].join("|");
  }
  check("[10] same identity + different classifier_version -> identity equal, validity key (journey, identity, classifier_version) differs",
    nx.v2_financial_strategy.financial_input_identity.value === refId &&
    nx.v2_financial_strategy.provenance.classifier_version !== v2.provenance.classifier_version &&
    validityKey(journey.journey_id, nx.v2_financial_strategy) !== validityKey(journey.journey_id, v2), nx.v2_financial_strategy.provenance);
  var journey2 = await js.createFromHandoffRedeem("88888888-8888-4888-8888-888888888888", "identity-test-v2-other", clone(e2e.RAW_CONTEXTS.V2));
  var other = await svc.createDiagnosis({ anonymousId: "88888888-8888-4888-8888-888888888888",
    body: Object.assign(clone(ref), { journey_id: journey2.journey_id }) });
  check("owner scope: identical finances in another owner's journey -> same identity but a different validity key (never global)",
    other.v2_financial_strategy.financial_input_identity.value === refId &&
    validityKey(journey2.journey_id, other.v2_financial_strategy) !== validityKey(journey.journey_id, v2));
  var stolen = await svc.createDiagnosis({ anonymousId: "88888888-8888-4888-8888-888888888888",
    body: Object.assign(clone(ref), { journey_id: journey.journey_id }) }).then(function () { return "accepted"; }, function (e) {
    return e && (e.code || e.status);
  });
  check("owner scope: another anonymous_id cannot bind a diagnosis to a journey it does not own (assertOwned)", stolen !== "accepted", stolen);

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("FINANCIAL_IDENTITY_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
