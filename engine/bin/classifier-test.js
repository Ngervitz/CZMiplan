/**
 * engine/bin/classifier-test.js — CLASSIFIER-SHADOW-01 fixtures + properties.
 * Usage: node engine/bin/classifier-test.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var classifier = require("../classifier/financial-classifier");
var FIXTURES = require("../../dev/backend-arch/classifier-shadow/fixtures").FIXTURES;

var classify = classifier.classifyFinancialShadow;
var ROOT = path.join(__dirname, "..", "..");

var pass = 0;
var fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log("FAIL", name, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
  }
  return o;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function codeList(result) {
  return result.verification_reasons.map(function (r) {
    return r.subject === "debt" ? r.code + "@" + r.debt_index : r.code;
  });
}

function missingList(result) {
  return result.missing_required_facts.map(function (m) {
    return m.subject === "debt" ? m.fact + "@" + m.debt_index : m.fact;
  });
}

function comparable(result) {
  var c = clone(result);
  delete c.provenance;
  return c;
}

// ---------------------------------------------------------------- fixtures
var byId = {};
FIXTURES.forEach(function (fx) {
  var frozen = deepFreeze(clone(fx.input));
  var before = JSON.stringify(frozen);
  var r;
  try {
    r = classify(frozen);
  } catch (err) {
    check(fx.id + " runs", false, String(err && err.message));
    return;
  }
  byId[fx.id] = r;
  var e = fx.expect;
  check(fx.id + " input not mutated", JSON.stringify(frozen) === before);
  check(fx.id + " status", r.classification_status === e.status, r.classification_status);
  check(fx.id + " strategy", r.strategy === e.strategy, r.strategy);
  check(fx.id + " compatible_strategies", same(r.compatible_strategies, e.compatible), r.compatible_strategies);
  check(fx.id + " entry_reasons", same(r.entry_reasons, e.entry_reasons), r.entry_reasons);
  check(fx.id + " verification_required", r.verification_required === e.verification_required, r.verification_required);
  check(fx.id + " verification_reasons", same(codeList(r), e.verification_codes), codeList(r));
  check(fx.id + " missing_required_facts", same(missingList(r), e.missing), missingList(r));
  check(fx.id + " invariant_violations empty", r.invariant_violations.length === 0, r.invariant_violations);
  Object.keys(e.facts || {}).forEach(function (k) {
    check(fx.id + " canonical_facts." + k, same(r.canonical_facts[k], e.facts[k]), r.canonical_facts[k]);
  });
  if (e.debt0) {
    var d0 = r.canonical_facts.debts[0] || {};
    var got = {
      payment_status: d0.monthly_debt_payment && d0.monthly_debt_payment.status,
      last_payment_amount: d0.last_payment_amount,
      declared_payment_amount: d0.declared_payment_amount,
      declared_situation: d0.provenance && d0.provenance.declared_situation,
    };
    Object.keys(e.debt0).forEach(function (k) {
      check(fx.id + " debts[0]." + k, got[k] === e.debt0[k], got[k]);
    });
  }
  if (e.legacy_mapped) {
    check(fx.id + " legacy mapping recorded",
      same(r.provenance.legacy_situation_mapping_debt_indices, e.legacy_mapped),
      r.provenance.legacy_situation_mapping_debt_indices);
  }

  // Structural contract invariants
  check(fx.id + " |S|=1 <=> classified", (r.compatible_strategies.length === 1) === (r.classification_status === "classified"));
  check(fx.id + " incomplete => strategy null", r.classification_status === "classified" || r.strategy === null);
  check(fx.id + " incomplete => verification", r.classification_status === "classified" || r.verification_required === true);
  check(fx.id + " incomplete => entry_reasons empty", r.classification_status === "classified" || r.entry_reasons.length === 0);
  check(fx.id + " classified => missing empty", r.classification_status === "incomplete" || r.missing_required_facts.length === 0);
  check(fx.id + " verification_required <=> reasons", r.verification_required === r.verification_reasons.length > 0);
  check(fx.id + " threshold constant", r.debt_burden_threshold === 0.3 && r.threshold_version === "T-v1");
  check(fx.id + " classifier_version", r.classifier_version === classifier.CLASSIFIER_VERSION);
});

FIXTURES.forEach(function (fx) {
  if (!fx.sameAs || !byId[fx.id] || !byId[fx.sameAs]) return;
  check(fx.id + " identical output to " + fx.sameAs,
    same(comparable(byId[fx.id]), comparable(byId[fx.sameAs])));
});

// ---------------------------------------------------------------- determinism
FIXTURES.forEach(function (fx) {
  var first = JSON.stringify(classify(clone(fx.input)));
  var stable = true;
  for (var i = 0; i < 20; i++) {
    if (JSON.stringify(classify(clone(fx.input))) !== first) stable = false;
  }
  check(fx.id + " deterministic x20", stable);

  var permuted = clone(fx.input);
  if (permuted.gastos && typeof permuted.gastos === "object") {
    var reordered = {};
    Object.keys(permuted.gastos).reverse().forEach(function (k) { reordered[k] = permuted.gastos[k]; });
    permuted.gastos = reordered;
  }
  var inputKeysReversed = {};
  Object.keys(permuted).reverse().forEach(function (k) { inputKeysReversed[k] = permuted[k]; });
  check(fx.id + " key-order independent", JSON.stringify(classify(inputKeysReversed)) === first);
});

// ---------------------------------------------------------------- survey / score / segmentation decoupling
var SURVEY_NOISE = [
  { tiene_encuesta: true, respuestas: { p6: "A", p7: "A", p9: "A" } },
  { tiene_encuesta: true, respuestas: { p6: "D", p7: "D", p9: "D", p1: "C", p2: "B" } },
  { tiene_encuesta: false, respuestas: {} },
  { user_intent: "credito", segmento: "S3", scoreReset: 12, planId: 1, nivelR: 5, financial_stage: "estres" },
  { user_intent: "ordenar", segmento: "S1", scoreReset: 95, planId: 4, nivelR: 1, financial_stage: "estable" },
];
FIXTURES.forEach(function (fx) {
  var base = JSON.stringify(classify(clone(fx.input)));
  SURVEY_NOISE.forEach(function (noise, i) {
    var noisy = Object.assign(clone(fx.input), clone(noise));
    check(fx.id + " survey/score noise #" + i + " invariant", JSON.stringify(classify(noisy)) === base);
  });
});

// ---------------------------------------------------------------- stock / type / creditor invariance (§12–§14)
FIXTURES.forEach(function (fx) {
  var base = JSON.stringify(classify(clone(fx.input)));
  var mutated = clone(fx.input);
  (mutated.deudas || []).forEach(function (d) {
    var n = typeof d.monto === "number" ? d.monto : null;
    if (n != null && n > 0) d.monto = n * 37;
    d.tipo = "informal";
    d.acreedor = "Otro";
    d.acreedor_raw = "otro acreedor";
  });
  check(fx.id + " stock/type/creditor invariant", JSON.stringify(classify(mutated)) === base);
});

// ---------------------------------------------------------------- unknown is never 0
(function () {
  var fx = require("../../dev/backend-arch/classifier-shadow/fixtures");
  [null, "", "abc", NaN, undefined, "  "].forEach(function (raw, i) {
    var r = classify(fx.input({ deudas: [fx.debt({ pago: raw })] }));
    var d0 = r.canonical_facts.debts[0];
    check("unknown payment #" + i + " not zero",
      d0.monthly_debt_payment.status === "UNKNOWN" && r.canonical_facts.monthly_debt_payments === "unknown");
    var ri = classify(fx.input({ ingreso: raw, declared_ingreso: raw, deudas: [fx.debt()] }));
    check("unknown income #" + i + " not zero", ri.canonical_facts.monthly_income === "unknown");
  });
})();

// ---------------------------------------------------------------- K6 handoff provenance (P-05 / A3)
(function () {
  var fx = require("../../dev/backend-arch/classifier-shadow/fixtures");
  function withProv(meta) {
    return classify(fx.input({ deudas: [fx.debt()], entry_context: { field_provenance: { ingreso: meta } } }));
  }
  // V2-HANDOFF-INCOME-AUTHORITY-01: handoff income is user-declared in Credizona, no reconfirmation.
  var untouched = withProv({ source: "handoff", user_modified: false, detail: "handoff" });
  check("handoff declared income => known without reconfirmation", untouched.canonical_facts.monthly_income === 100000);
  check("handoff declared income => no INCOME_PREFILL_UNCONFIRMED",
    codeList(untouched).indexOf("INCOME_PREFILL_UNCONFIRMED") === -1, codeList(untouched));
  check("handoff declared income => provenance source handoff, nature user_declared",
    untouched.provenance.income.source === "handoff" && untouched.provenance.income.nature === "user_declared" &&
    untouched.provenance.income.prefill_unconfirmed === false, untouched.provenance.income);
  var bareSource = withProv({ source: "handoff", user_modified: false });
  check("source=handoff without the handoff detail is insufficient provenance (still prefill)",
    bareSource.canonical_facts.monthly_income === "unknown" &&
    codeList(bareSource).indexOf("INCOME_PREFILL_UNCONFIRMED") >= 0 && bareSource.provenance.income.nature === null);
  var otherDetail = withProv({ source: "handoff", user_modified: false, detail: "backend" });
  check("source=handoff with a foreign detail is insufficient provenance", otherDetail.canonical_facts.monthly_income === "unknown");
  var detailOnly = withProv({ source: "url_prefill", user_modified: false, detail: "handoff" });
  check("url_prefill claiming detail=handoff stays prefill", detailOnly.canonical_facts.monthly_income === "unknown");
  var urlPrefill = withProv({ source: "url_prefill", user_modified: false });
  check("url_prefill untouched still unconfirmed (URL-INCOME-01 unchanged)",
    urlPrefill.canonical_facts.monthly_income === "unknown" && codeList(urlPrefill).indexOf("INCOME_PREFILL_UNCONFIRMED") >= 0);
  var confirmed = withProv({ source: "user_entered", user_modified: true });
  check("user_modified after handoff => income known", confirmed.canonical_facts.monthly_income === 100000);
  function financial(r) {
    var o = JSON.parse(JSON.stringify(r));
    delete o.provenance.income;
    return o;
  }
  check("same income user_entered vs handoff => identical classification (only income provenance differs)",
    JSON.stringify(financial(untouched)) === JSON.stringify(financial(confirmed)));
  ["0", "", null, "abc", "65,000", -5000].forEach(function (raw, i) {
    var r = classify(fx.input({ ingreso: raw, declared_ingreso: raw, deudas: [fx.debt()],
      entry_context: { field_provenance: { ingreso: { source: "handoff", user_modified: false, detail: "handoff" } } } }));
    check("handoff with missing/invalid income #" + i + " => unknown (never 0)",
      r.canonical_facts.monthly_income === "unknown" && codeList(r).indexOf("INCOME_UNKNOWN") >= 0, codeList(r));
  });
})();

// ---------------------------------------------------------------- MONETARY-CONTRACT-01 (canonical input only)
(function () {
  var fx = require("../../dev/backend-arch/classifier-shadow/fixtures");
  function income(raw) {
    return classify(fx.input({ ingreso: raw, declared_ingreso: raw, deudas: [fx.debt()] })).canonical_facts.monthly_income;
  }
  check("canonical 65000 => 65000", income(65000) === 65000);
  check("canonical '65000.50' => 65000.5", income("65000.50") === 65000.5);
  check("comma string not reinterpreted ('65000,50' => unknown)", income("65000,50") === "unknown");
  check("ambiguous '50,000' => unknown", income("50,000") === "unknown");
  check("'65000abc' => unknown", income("65000abc") === "unknown");
  check("'$ 65000' => unknown", income("$ 65000") === "unknown");
  var pay = classify(fx.input({ deudas: [fx.debt({ pago: "10000,5" })] }));
  check("comma payment => unknown", pay.canonical_facts.debts[0].monthly_debt_payment.status === "UNKNOWN");
})();

// ---------------------------------------------------------------- expenses: declared-but-unknown is never a partial sum
(function () {
  var fx = require("../../dev/backend-arch/classifier-shadow/fixtures");
  function expenses(over) {
    return classify(fx.input(Object.assign({ deudas: [fx.debt()] }, over))).canonical_facts.monthly_expenses;
  }
  check("A 10000 + B invalid + C 5000 => unknown (not 15000)",
    expenses({ gastos: { a: 10000, b: "abc", c: 5000 } }) === "unknown");
  check("blank category is not a declared expense",
    expenses({ gastos: { a: 10000, b: "", c: 5000, d: null } }) === 15000);
  check("zero category is not a declared expense", expenses({ gastos: { a: 10000, b: 0 } }) === 10000);
  check("negative amount => unknown", expenses({ gastos: { a: 10000, b: -5 } }) === "unknown");
  check("custom expense invalid amount => unknown",
    expenses({ custom_expenses: [{ description: "club", amount: "1.500,00" }] }) === "unknown");
  check("custom expense excluded is ignored even if invalid",
    expenses({ custom_expenses: [{ description: "x", amount: "abc", included: false }] }) === 50000);
})();

// ---------------------------------------------------------------- T boundary (exact comparison)
(function () {
  var fx = require("../../dev/backend-arch/classifier-shadow/fixtures");
  var cases = [
    { ingreso: 100000, pago: 30000, expect: "sustainable" },
    { ingreso: 70000, pago: 21000, expect: "sustainable" },
    { ingreso: 1000, pago: 300, expect: "sustainable" },
    { ingreso: 100000, pago: 30000.01, expect: "high" },
    { ingreso: 100000, pago: 29999.99, expect: "sustainable" },
    { ingreso: 100000, pago: 35000, expect: "high" },
  ];
  cases.forEach(function (c) {
    var r = classify(fx.input({
      ingreso: c.ingreso, declared_ingreso: c.ingreso, gastos: { vivienda: 1 }, deudas: [fx.debt({ pago: c.pago })],
    }));
    check("T boundary " + c.pago + "/" + c.ingreso, r.canonical_facts.burden_status === c.expect, r.canonical_facts.burden_status);
  });
  check("T is 0.30 T-v1", classifier.DEBT_BURDEN_THRESHOLD === 0.3 && classifier.DEBT_BURDEN_THRESHOLD_VERSION === "T-v1");
  var withThresholdInInput = classify(fx.input({ deudas: [fx.debt({ pago: 32000 })], debt_burden_threshold: 0.5, threshold: 0.35 }));
  check("T not read from input", withThresholdInInput.canonical_facts.burden_status === "high" && withThresholdInInput.debt_burden_threshold === 0.3);
})();

// ---------------------------------------------------------------- isolation: no runtime consumer
(function () {
  var hits = [];
  function scan(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
      var p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") return;
        scan(p);
      } else if (/\.(js|html)$/.test(ent.name)) {
        var txt = fs.readFileSync(p, "utf8");
        if (txt.indexOf("financial-classifier") !== -1 || txt.indexOf("classifyFinancialShadow") !== -1) {
          hits.push(path.relative(ROOT, p).replace(/\\/g, "/"));
        }
      }
    });
  }
  ["js", "server", "engine/core", "engine/support", "engine/vm"].forEach(function (d) {
    var abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) scan(abs);
  });
  ["engine/index.js", "index.html"].forEach(function (f) {
    var abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) {
      var txt = fs.readFileSync(abs, "utf8");
      if (txt.indexOf("financial-classifier") !== -1 || txt.indexOf("classifyFinancialShadow") !== -1) hits.push(f);
    }
  });
  // V2-NEW-STRATEGY-INTEGRATION-01: the only runtime consumer is the server-side V2 compute-only path.
  var allowed = ["server/modules/diagnosis/service.js"];
  hits = hits.filter(function (h) { return allowed.indexOf(h) === -1 && h.indexOf("server/bin/") !== 0; });
  check("classifier not referenced by runtime except server V2 compute-only (js/, server/, engine core, index)", hits.length === 0, hits);
})();

console.log("CLASSIFIER_SHADOW_TEST:", pass + "/" + (pass + fail), fail ? "FAIL" : "PASS",
  "(fixtures=" + FIXTURES.length + ")");
if (fail) process.exitCode = 1;
