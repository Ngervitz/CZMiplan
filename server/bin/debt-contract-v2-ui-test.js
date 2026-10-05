/**
 * server/bin/debt-contract-v2-ui-test.js — DEBT-PAYMENT-CONTRACT-V2, client side (real js/ files in vm contexts).
 *
 *   [P] B1 / capture off: debt cards, debt tab, plan tab, legacy engine and debt-edit logic identical to the
 *       pre-change files (MIPLAN_DEBT_CONTRACT_BASELINE, default %TEMP%/miplan-debt-contract-pre).
 *   [L] legacy engine: mora / reclamo_disputa read exactly as mora_reclamo (legacy pago keeps its meaning).
 *   [C] capture v2: situation options, explicit current-payment control, 0 vs unknown, no generic pago.
 *   [A] app.js: parsing, save normalization, validation, situation change clears the current payment.
 *   [D] reclamo_disputa outcome: dispute hero / card, distinct from missing data, no CTA / legal / technical copy.
 *   [B] binding: real shadowDiagnosis.js -> in-process diagnosis service; marker, 0 vs null, identity version.
 *
 * node -r ./server/testing/networkTrap.js server/bin/debt-contract-v2-ui-test.js
 */
"use strict";

var fs = require("fs");
var os = require("os");
var vm = require("vm");
var path = require("path");

var ROOT = path.join(__dirname, "..", "..");
var BASE_DIR = process.env.MIPLAN_DEBT_CONTRACT_BASELINE || path.join(os.tmpdir(), "miplan-debt-contract-pre");
var classifier = require("../../engine/classifier/financial-classifier");
var v2ui = require("../../js/v2Interaction");
var createDiagnosisService = require("../modules/diagnosis/service").createDiagnosisService;
var createMemoryStrategyEvaluationStore = require("../testing/memoryStrategyEvaluations").createMemoryStrategyEvaluationStore;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
function text(html) {
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

var DIAG = "22222222-2222-4222-8222-222222222222";
var ANON = "33333333-3333-4333-8333-333333333333";
var JOURNEY = "55555555-5555-4555-8555-555555555555";
var DISPUTE_TEXT = "Mi Plan no asigna automáticamente una estrategia financiera sobre esa deuda mientras esté en reclamo o disputa";
var LEGAL_OR_TECH = /abogad|legal|demand|juicio|asesor|defensa|tribunal|error|DEBT_IN_DISPUTE|undefined|\bnull\b|\bNaN\b/i;

function makeContext(dir, opts) {
  opts = opts || {};
  var sandbox = {
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    URLSearchParams: URLSearchParams, URL: URL, TextEncoder: TextEncoder, crypto: globalThis.crypto,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.location = { search: opts.search || "", href: "http://localhost/", hostname: "localhost", pathname: "/" };
  sandbox.document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; }, querySelector: function () { return null; },
    addEventListener: function () {}, createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; },
    body: { appendChild: function () {} }, readyState: "loading" };
  var mem = {};
  sandbox.localStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } };
  var ses = {};
  sandbox.sessionStorage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(ses, k) ? ses[k] : null; }, setItem: function (k, v) { ses[k] = String(v); }, removeItem: function (k) { delete ses[k]; } };
  sandbox.trackEvent = function () {};
  sandbox.trackCRMEvent = function () {};
  sandbox.enviarCRM = function () {};
  sandbox.navigator = { userAgent: "node" };
  if (opts.fetch) sandbox.fetch = opts.fetch;
  vm.createContext(sandbox);
  function load(rel) {
    var file = path.join(dir, rel);
    vm.runInContext(fs.readFileSync(file, "utf8").replace(/\bconst /g, "var "), sandbox, { filename: file });
  }
  ["js/config.js", "js/creditors.js", "js/survey.js", "js/algorithms.js", "js/events.js"].forEach(load);
  if (opts.realShadow) {
    ["js/financialInputIdentity.js", "js/financialInputIdentityV2.js", "js/debtContract.js", "js/shadowDiagnosis.js"].forEach(load);
  }
  ["js/ui.js", "js/consent.js", "js/v2Interaction.js", "js/app.js"].forEach(load);
  var current = null;
  var capture = false;
  if (!opts.realShadow) {
    sandbox.CZShadowDiagnosis = {
      isV2StrategyStateEnabled: function () { return true; },
      isDebtContractV2Capture: function () { return capture; },
      getApiBaseUrl: function () { return "http://127.0.0.1:9"; },
      getCurrentV2Strategy: function () { return clone(current); },
    };
  }
  sandbox.CZ_V2_INTERACTION_ENABLED = false;
  return {
    sb: sandbox,
    setV2: function (v) { current = v; },
    setCapture: function (on) { capture = on === true; },
    setFlag: function (on) { sandbox.CZ_V2_INTERACTION_ENABLED = on === true; },
    state: function (f, extra) {
      sandbox.PRE.ingreso = f.ingreso;
      sandbox.CZState = Object.assign({ step: 3, tab: "plan", gastos: clone(f.gastos), custom_expenses: [], deudas: clone(f.deudas),
        no_debts_declared: f.noDebts === true, snap: { plan_id: 2 }, diag: null, herr: {}, temporal: {}, gastos_missing_confirmed: false }, extra || {});
      return sandbox.CZState;
    },
    motor: function (f) {
      this.state(f);
      return sandbox.calcularMotor();
    },
    render: function (f) {
      this.state(f);
      sandbox.CZState.diag = sandbox.calcularMotor();
      return sandbox.renderTabPlan();
    },
  };
}

function debt(sit, extra) {
  return Object.assign({ tipo: "prestamo", acreedor: "Banco QA", monto: "200000", situacion_ui: sit }, extra || {});
}
// legacy fields exactly as the app stores them (applySituacionUiChange)
var MR = { pago: 0, estado: "mora", pago_fuente: "mora_sin_pago", debt_confidence: "high" };
var LEGACY_DEBTS = {
  pagando: debt("pagando_normal", { pago: "8000", estado: "al_dia", pago_fuente: "declarado" }),
  pagando_cero: debt("pagando_normal", { pago: "", estado: "al_dia", pago_clarificacion: "sin_cuota" }),
  atrasado: debt("atrasado_pagando", { pago: "4000", ultimo_pago_declarado: "4000", atraso_tiempo: "30_90", estado: "atraso_leve" }),
  deje: debt("deje_pagar", { pago: 0, atraso_tiempo: "mas_90", estado: "mora", pago_fuente: "no_paga" }),
  mora_reclamo: debt("mora_reclamo", MR),
  no_seguro: debt("no_seguro", { pago: "", atraso_tiempo_aprox: "varios_meses", estado: "atraso_leve" }),
  sin_situacion: debt("", {}),
};
var PLAN_PROFILES = {
  MORA_RECLAMO_ONLY: { ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [LEGACY_DEBTS.mora_reclamo] },
  MORA_RECLAMO_MIX: { ingreso: 60000, gastos: { vivienda: 20000 }, deudas: [LEGACY_DEBTS.mora_reclamo, LEGACY_DEBTS.pagando] },
  ATRASADO: { ingreso: 50000, gastos: { vivienda: 20000 }, deudas: [LEGACY_DEBTS.atrasado] },
  DEJE: { ingreso: 50000, gastos: { vivienda: 20000 }, deudas: [LEGACY_DEBTS.deje] },
  CONTENCION: { ingreso: 50000, gastos: { vivienda: 40000 }, deudas: [LEGACY_DEBTS.pagando] },
  ALL: { ingreso: 90000, gastos: { vivienda: 25000 }, deudas: Object.keys(LEGACY_DEBTS).filter(function (k) { return k !== "sin_situacion"; })
    .map(function (k) { return LEGACY_DEBTS[k]; }) },
  NO_DEBTS: { ingreso: 60000, gastos: { vivienda: 20000 }, deudas: [], noDebts: true },
};

function project(r) {
  function ref(x) {
    var o = { fact: x.fact, subject: x.subject };
    if (x.subject === "debt") o.debt_index = x.debt_index;
    return o;
  }
  return {
    survey_version: 2, classification_status: r.classification_status, strategy: r.strategy, reasons: r.entry_reasons,
    verification: { required: r.verification_required,
      reasons: r.verification_reasons.map(function (x) { return Object.assign({ code: x.code }, ref(x)); }),
      missing_facts: r.missing_required_facts.map(ref) },
    provenance: { classifier_version: r.classifier_version, contract: r.contract },
  };
}
function v3(f) {
  return classifier.classifyFinancialShadowV3({ ingreso: f.ingreso, gastos: f.gastos, custom_expenses: [], deudas: clone(f.deudas),
    no_debts_declared: f.noDebts === true, entry_context: { field_provenance: { ingreso: { source: "user_entered", user_modified: true } } },
    debt_contract_version: "v2" });
}

// ------------------------------------------------------------------ [P] B1 parity
function partParity() {
  if (!fs.existsSync(path.join(BASE_DIR, "js", "ui.js"))) {
    check("[P] pre-change baseline available (MIPLAN_DEBT_CONTRACT_BASELINE)", false, BASE_DIR);
    return;
  }
  var cur = makeContext(ROOT);
  var base = makeContext(BASE_DIR);
  cur.setCapture(false);

  var cards = {};
  Object.keys(LEGACY_DEBTS).forEach(function (k) {
    [null, 0].forEach(function (editing) {
      var f = { ingreso: 60000, gastos: { vivienda: 20000 }, deudas: [LEGACY_DEBTS[k]] };
      cur.state(f, { step: 1, editing_debt_index: editing });
      base.state(f, { step: 1, editing_debt_index: editing });
      cards[k + (editing === 0 ? ":editing" : "")] = cur.sb.renderDeudaCard(cur.sb.CZState.deudas[0], 0) ===
        base.sb.renderDeudaCard(base.sb.CZState.deudas[0], 0);
    });
  });
  check("[P] capture off: renderDeudaCard byte-identical to pre-change ui.js for every legacy situation (incl. mora_reclamo), editing and not " +
    JSON.stringify(cards), Object.keys(cards).every(function (k) { return cards[k]; }), cards);

  var plan = {};
  var motor = {};
  var tabDeudas = {};
  Object.keys(PLAN_PROFILES).forEach(function (k) {
    var f = PLAN_PROFILES[k];
    plan[k] = cur.render(f) === base.render(f);
    motor[k] = JSON.stringify(cur.motor(f)) === JSON.stringify(base.motor(f));
    cur.render(f);
    base.render(f);
    cur.sb.CZState.tab = "deudas";
    base.sb.CZState.tab = "deudas";
    tabDeudas[k] = cur.sb.renderTabDeudas() === base.sb.renderTabDeudas();
  });
  check("[P] capture off, V2 flags off: plan tab byte-identical " + JSON.stringify(plan), Object.keys(plan).every(function (k) { return plan[k]; }), plan);
  check("[P] capture off: legacy engine (calcularMotor) JSON-identical " + JSON.stringify(motor), Object.keys(motor).every(function (k) { return motor[k]; }), motor);
  check("[P] capture off: debt tab byte-identical " + JSON.stringify(tabDeudas), Object.keys(tabDeudas).every(function (k) { return tabDeudas[k]; }), tabDeudas);

  var LEGACY_SITS = ["pagando_normal", "atrasado_pagando", "deje_pagar", "mora_reclamo", "no_seguro"];
  var transitions = 0;
  var bad = [];
  Object.keys(LEGACY_DEBTS).forEach(function (k) {
    LEGACY_SITS.forEach(function (to) {
      var a = clone(LEGACY_DEBTS[k]);
      var b = clone(LEGACY_DEBTS[k]);
      cur.state({ ingreso: 1, gastos: {}, deudas: [a] });
      base.state({ ingreso: 1, gastos: {}, deudas: [b] });
      var ra = cur.sb.applySituacionUiChange(cur.sb.CZState.deudas[0], to);
      var rb = base.sb.applySituacionUiChange(base.sb.CZState.deudas[0], to);
      cur.sb.sanitizeDebtFieldsForSituacion(cur.sb.CZState.deudas[0]);
      base.sb.sanitizeDebtFieldsForSituacion(base.sb.CZState.deudas[0]);
      var va = cur.sb.validateDebtForSave(cur.sb.CZState.deudas[0]);
      var vb = base.sb.validateDebtForSave(base.sb.CZState.deudas[0]);
      transitions++;
      if (ra !== rb || JSON.stringify(cur.sb.CZState.deudas[0]) !== JSON.stringify(base.sb.CZState.deudas[0]) ||
          JSON.stringify(va) !== JSON.stringify(vb) || "pago_mensual_actual" in cur.sb.CZState.deudas[0]) {
        bad.push(k + "->" + to);
      }
    });
  });
  check("[P] capture off: applySituacionUiChange + sanitizeDebtFieldsForSituacion + validateDebtForSave identical to pre-change app.js over " +
    transitions + " transitions; pago_mensual_actual never added", bad.length === 0, bad);

  var cp = makeContext(ROOT);
  cp.state({ ingreso: 1, gastos: {}, deudas: [debt("mora_reclamo", Object.assign({ pago_mensual_actual: 5000 }, MR))] });
  cp.sb.normalizeDebtCurrentPaymentForSave(cp.sb.CZState.deudas[0]);
  check("[P] capture off: normalizeDebtCurrentPaymentForSave is a no-op", cp.sb.CZState.deudas[0].pago_mensual_actual === 5000);
}

// ------------------------------------------------------------------ [L] legacy engine equivalence
function partLegacy() {
  var cur = makeContext(ROOT);
  var report = {};
  [["mora", "mora_reclamo"], ["reclamo_disputa", "mora_reclamo"]].forEach(function (pair) {
    Object.keys(PLAN_PROFILES).forEach(function (k) {
      var f = PLAN_PROFILES[k];
      if (!f.deudas.some(function (d) { return d.situacion_ui === "mora_reclamo"; })) return;
      var split = clone(f);
      split.deudas.forEach(function (d) {
        if (d.situacion_ui === "mora_reclamo") {
          d.situacion_ui = pair[0];
          d.pago_mensual_actual = 7000;
        }
      });
      // diag.prio echoes the debt object itself, new field included: not a reading of it.
      var noEcho = function (key, val) { return key === "pago_mensual_actual" ? undefined : val; };
      var a = JSON.stringify(cur.motor(split), noEcho).split('"situacion_ui":"' + pair[0] + '"').join('"situacion_ui":"mora_reclamo"');
      var b = JSON.stringify(cur.motor(f), noEcho);
      report[pair[0] + ":" + k] = a === b;
    });
  });
  check("[L] legacy engine: mora / reclamo_disputa (with any pago_mensual_actual) give the same diagnosis as mora_reclamo " + JSON.stringify(report),
    Object.keys(report).length >= 4 && Object.keys(report).every(function (k) { return report[k]; }), report);
  var algo = fs.readFileSync(path.join(ROOT, "js", "algorithms.js"), "utf8");
  check("[L] js/algorithms.js never reads pago_mensual_actual (legacy metrics keep reading legacy pago)", algo.indexOf("pago_mensual_actual") === -1);
}

// ------------------------------------------------------------------ [C] capture rendering
function partCapture() {
  var cur = makeContext(ROOT);
  cur.setCapture(true);
  function card(d) {
    cur.state({ ingreso: 60000, gastos: {}, deudas: [d] }, { step: 1, editing_debt_index: 0 });
    return cur.sb.renderDeudaCard(cur.sb.CZState.deudas[0], 0);
  }
  var html = card(debt("mora", Object.assign({ pago_mensual_actual: null }, MR)));
  var sits = (html.match(/data-deuda-situacion="([a-z_]+)"/g) || []).map(function (m) { return m.replace(/.*="|"/g, ""); });
  check("[C] options: pagando_normal, atrasado_pagando, deje_pagar, mora, reclamo_disputa, no_seguro; never mora_reclamo; labels 'En mora' / " +
    "'En reclamo o disputa' / 'Me atrasé con los pagos'",
    JSON.stringify(sits) === JSON.stringify(["pagando_normal", "atrasado_pagando", "deje_pagar", "mora", "reclamo_disputa", "no_seguro"]) &&
    />En mora</.test(html) && />En reclamo o disputa</.test(html) && />Me atrasé con los pagos</.test(html) && !/mora_reclamo/.test(html), sits);

  var rows = {};
  [["atrasado_pagando", /¿Cuánto estás pagando por mes actualmente\?/], ["mora", /¿Estás haciendo pagos actualmente\? Si pagás algo, ¿cuánto por mes\?/],
    ["reclamo_disputa", /¿Estás pagando algo por esta deuda actualmente\? ¿Cuánto por mes\?/]].forEach(function (x) {
    var h = card(debt(x[0], { pago_mensual_actual: null }));
    rows[x[0]] = {
      question: x[1].test(h),
      input: /<input[^>]*data-deuda-field="pago_mensual_actual"/.test(h),
      zeroButton: /data-deuda-field="pago_mensual_actual" data-deuda-val="0"[^>]*>No estoy pagando nada</.test(h),
      hint: /Si no sabés el monto, dejalo vacío\./.test(h),
      noGenericPago: !/data-deuda-field="pago"/.test(h) && !/Pago mensual \(si lo sabés\)/.test(h),
    };
  });
  check("[C] atrasado / mora / reclamo: explicit current-payment question + input + 'No estoy pagando nada' + blank-is-unknown hint; " +
    "no generic 'Pago mensual (si lo sabés)'", Object.keys(rows).every(function (k) {
    var r = rows[k];
    return r.question && r.input && r.zeroButton && r.hint && r.noGenericPago;
  }), rows);
  var atr = card(debt("atrasado_pagando", { pago_mensual_actual: null, ultimo_pago_declarado: "4000" }));
  check("[C] atrasado: last payment is optional and separate ('¿Cuánto pagaste la última vez? (opcional)', ultimo_pago_declarado field)",
    /¿Cuánto pagaste la última vez\? \(opcional\)/.test(atr) && /data-deuda-field="ultimo_pago_declarado"/.test(atr));
  var rec = card(debt("reclamo_disputa", { pago_mensual_actual: null }));
  check("[C] reclamo_disputa: dispute note (no strategy assigned automatically), no legal advice",
    /Mi Plan no asigna automáticamente una estrategia financiera sobre esta deuda mientras esté en reclamo o disputa\./.test(rec) &&
    !/abogad|legal|demand|juicio/i.test(text(rec)));

  var zero = card(debt("mora", Object.assign({}, MR, { pago_mensual_actual: 0 })));
  var unknown = card(debt("mora", Object.assign({}, MR, { pago_mensual_actual: null })));
  var positive = card(debt("mora", Object.assign({}, MR, { pago_mensual_actual: 7000 })));
  function zeroActive(h) {
    return /data-deuda-field="pago_mensual_actual" data-deuda-val="0" data-deuda-idx="0" style="[^"]*rgba\(64,215,255,\.5\)/.test(h);
  }
  function inputValue(h) {
    var m = h.match(/value="([^"]*)" data-deuda-field="pago_mensual_actual"/);
    return m ? m[1] : null;
  }
  check("[C] 0 vs unknown render differently: 0 -> 'No estoy pagando nada' active; null -> empty input, nothing active; 7000 -> amount, zero inactive",
    zeroActive(zero) && !zeroActive(unknown) && !zeroActive(positive) && inputValue(unknown) === "" && inputValue(positive) !== "" &&
    inputValue(positive) !== "0", { zero: inputValue(zero), unknown: inputValue(unknown), positive: inputValue(positive) });
  var pn = card(debt("pagando_normal", { pago: "8000" }));
  check("[C] pagando_normal under capture v2 keeps the legacy 'Pago mensual (si lo sabés)' field and no current-payment control",
    /data-deuda-field="pago"/.test(pn) && !/pago_mensual_actual/.test(pn));
  var hist = card(debt("mora_reclamo", MR));
  check("[C] a stored historical mora_reclamo debt still renders under capture v2 (legacy note), without being rewritten",
    /Deuda en mora o reclamo/.test(hist) && cur.sb.CZState.deudas[0].situacion_ui === "mora_reclamo" &&
    !("pago_mensual_actual" in cur.sb.CZState.deudas[0]));
  cur.state({ ingreso: 60000, gastos: {}, deudas: [debt("mora", Object.assign({}, MR, { pago_mensual_actual: 0 })),
    debt("reclamo_disputa", Object.assign({}, MR, { pago_mensual_actual: null }))] }, { step: 1 });
  var badges = cur.sb.renderDeudaCard(cur.sb.CZState.deudas[0], 0) + cur.sb.renderDeudaCard(cur.sb.CZState.deudas[1], 1);
  check("[C] saved cards render (no crash) for mora / reclamo_disputa", badges.indexOf('id="debt-card-0"') !== -1 && badges.indexOf('id="debt-card-1"') !== -1);
}

// ------------------------------------------------------------------ [A] app.js logic
function partApp() {
  var cur = makeContext(ROOT);
  cur.setCapture(true);
  var sb = cur.sb;
  var d = debt("atrasado_pagando", { pago_mensual_actual: 9000, pago: "4000", ultimo_pago_declarado: "4000" });
  cur.state({ ingreso: 1, gastos: {}, deudas: [d] });
  sb.applySituacionUiChange(sb.CZState.deudas[0], "mora");
  var m = sb.CZState.deudas[0];
  check("[A] situation change -> mora: current payment reset to null (never carried over); legacy fields as mora_reclamo (pago 0, estado mora)",
    m.pago_mensual_actual === null && m.pago === 0 && m.estado === "mora" && m.pago_fuente === "mora_sin_pago", m);
  m.pago_mensual_actual = 0;
  sb.applySituacionUiChange(m, "reclamo_disputa");
  check("[A] mora -> reclamo_disputa: current payment reset to null again", m.pago_mensual_actual === null && m.situacion_ui === "reclamo_disputa");
  check("[A] same situation clicked again: no change (value kept)", (function () {
    m.pago_mensual_actual = 0;
    return sb.applySituacionUiChange(m, "reclamo_disputa") === false && m.pago_mensual_actual === 0;
  })());

  var parsed = {};
  [["", null], ["0", 0], ["10.000", 10000], ["7500", 7500], ["abc", null], ["-5", null]].forEach(function (x) {
    cur.state({ ingreso: 1, gastos: {}, deudas: [debt("mora", { pago_mensual_actual: 123 })] });
    sb.readDebtCurrentPaymentInput({ value: x[0] }, 0, true);
    var v = sb.CZState.deudas[0].pago_mensual_actual;
    parsed[JSON.stringify(x[0])] = { value: v, ok: v === x[1], invalidFlag: sb.hasMoneyInvalidWithPrefix("deuda:0:") };
  });
  check("[A] readDebtCurrentPaymentInput: '' -> null (unknown), '0' -> 0, '10.000' -> 10000, '7500' -> 7500, invalid -> null + blocking money error",
    Object.keys(parsed).every(function (k) { return parsed[k].ok; }) && parsed['"abc"'].invalidFlag === true && parsed['""'].invalidFlag === false &&
    parsed['"0"'].invalidFlag === false, parsed);

  var norm = {};
  [["mora", 0, 0], ["mora", null, null], ["reclamo_disputa", 4000, 4000], ["atrasado_pagando", "4000", null], ["pagando_normal", 5000, null],
    ["deje_pagar", 0, null], ["no_seguro", 10, null], ["mora", undefined, null], ["mora", -1, null]].forEach(function (x, i) {
    var dd = debt(x[0], {});
    if (x[1] !== undefined) dd.pago_mensual_actual = x[1];
    sb.normalizeDebtCurrentPaymentForSave(dd);
    norm[i + ":" + x[0] + ":" + JSON.stringify(x[1])] = dd.pago_mensual_actual === x[2];
  });
  check("[A] normalizeDebtCurrentPaymentForSave: numbers >= 0 kept only for atrasado / mora / reclamo; everything else -> null (never undefined / '')",
    Object.keys(norm).every(function (k) { return norm[k]; }), norm);

  var v = {
    atrasadoUnknown: sb.validateDebtForSave(debt("atrasado_pagando", { pago_mensual_actual: null, pago: 0 })).ok === true,
    atrasadoZero: sb.validateDebtForSave(debt("atrasado_pagando", { pago_mensual_actual: 0, pago: 0 })).ok === true,
    moraExceeds: sb.validateDebtForSave(debt("mora", { pago_mensual_actual: 300000, pago: 0 })).msg === "El pago mensual no puede ser mayor al saldo total de la deuda.",
    reclamoOk: sb.validateDebtForSave(debt("reclamo_disputa", { pago_mensual_actual: 1000, pago: 0 })).ok === true,
    pagandoStillRequired: sb.validateDebtForSave(debt("pagando_normal", { pago: "" })).ok === false,
  };
  cur.setCapture(false);
  v.v1AtrasadoStillRequired = sb.validateDebtForSave(debt("atrasado_pagando", { pago_mensual_actual: 0, pago: 0 })).ok === false;
  check("[A] validation: v2 atrasado accepts unknown / 0 current payment; current payment > balance rejected; pagando_normal rule unchanged; " +
    "v1 capture keeps the atrasado 'pago activo requerido' rule", Object.keys(v).every(function (k) { return v[k]; }), v);
}

// ------------------------------------------------------------------ [D] dispute outcome
function partDispute() {
  var DISPUTE_ONLY = { ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [debt("reclamo_disputa", Object.assign({}, MR, { pago_mensual_actual: 0 }))] };
  var MIXED = { ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [debt("reclamo_disputa", Object.assign({}, MR, { pago_mensual_actual: 0 })),
    debt("mora", Object.assign({}, MR, { pago_mensual_actual: null }))] };
  var rOnly = v3(DISPUTE_ONLY);
  var rMixed = v3(MIXED);
  var viewOnly = v2ui.panoramaViewOf({ diagnosis_id: DIAG, result: project(rOnly) });
  var viewMixed = v2ui.panoramaViewOf({ diagnosis_id: DIAG, result: project(rMixed) });
  check("[D] panoramaViewOf: dispute-only incomplete -> dispute_only true; dispute + missing payment -> dispute_only false",
    viewOnly.kind === "incomplete" && viewOnly.dispute_only === true && viewMixed.kind === "incomplete" && viewMixed.dispute_only === false,
    { only: viewOnly, mixed: viewMixed });

  var cardOnly = v2ui.renderVerificationCard(project(rOnly));
  check("[D] dispute-only card: outcome section 'Deuda en reclamo o disputa' + message; no 'Qué datos faltan' / 'Completá', no edit button, " +
    "no pending note, no legal / technical copy",
    /data-v2i-outcome="dispute"/.test(cardOnly) && /Deuda en reclamo o disputa/.test(cardOnly) && cardOnly.indexOf(DISPUTE_TEXT) !== -1 &&
    !/Qué datos faltan|Complet/.test(cardOnly) && !/data-deuda-editar|data-v2i="|<button/.test(cardOnly) && !/data-v2i-pending/.test(cardOnly) &&
    !LEGAL_OR_TECH.test(text(cardOnly)), text(cardOnly));
  var cardMixed = v2ui.renderVerificationCard(project(rMixed));
  check("[D] mixed card: normal missing-data card; the disputed debt carries the dispute line only (no edit / pending), the other debt keeps its action",
    /Qué datos faltan/.test(cardMixed) && !/data-v2i-outcome/.test(cardMixed) &&
    /data-index="0">[\s\S]*?data-v2i-dispute="1"[\s\S]*?<\/div><\/div>/.test(cardMixed) &&
    !/data-deuda-editar="0"/.test(cardMixed) && /data-deuda-editar="1"/.test(cardMixed) &&
    (cardMixed.split('data-v2i-dispute="1"').length - 1) === 1, text(cardMixed));

  var cur = makeContext(ROOT);
  cur.setCapture(true);
  cur.setFlag(true);
  cur.setV2({ diagnosis_id: DIAG, result: project(rOnly) });
  var html = cur.render(DISPUTE_ONLY);
  var a = html.indexOf('id="cz-dashboard-hero"');
  var hero = html.slice(html.lastIndexOf("<div", a), html.indexOf("data-v2i-slot") === -1 ? a + 2000 : html.indexOf("data-v2i-slot"));
  check("[D] plan tab, dispute-only: dispute hero (title + message), not the missing-data hero; no CTA, no strategy, no legal / technical copy",
    /data-v2-hero="dispute"/.test(hero) && /Tenés una deuda en reclamo o disputa/.test(hero) && hero.indexOf(DISPUTE_TEXT) !== -1 &&
    !/Tu diagnóstico todavía no está completo|Complet/.test(hero) && !/<button/.test(hero) && !/data-v2-strategy/.test(hero) &&
    !LEGAL_OR_TECH.test(text(hero)), text(hero).slice(0, 400));
  cur.setV2({ diagnosis_id: DIAG, result: project(rMixed) });
  var mixedHero = cur.render(MIXED);
  check("[D] plan tab, dispute + missing data: the regular missing-data hero (data still needed elsewhere)",
    /Tu diagnóstico todavía no está completo/.test(mixedHero) && !/data-v2-hero="dispute"/.test(mixedHero));
  cur.setFlag(false);
  cur.setV2(null);
  check("[D] V2 interaction flag off: no dispute hero (legacy plan tab)", !/data-v2-hero="dispute"/.test(cur.render(DISPUTE_ONLY)));
}

// ------------------------------------------------------------------ [B] client binding through the real service
async function partBinding() {
  var store = createMemoryStrategyEvaluationStore();
  var n = 0;
  var posted = [];
  var tamper = null;
  var service = createDiagnosisService({
    tenantId: "miplan-default",
    repository: {
      insertDiagnosis: async function () {
        n += 1;
        return { diagnosis_id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0") };
      },
      recordFinancialStrategyEvaluation: async function (row) { return store.record(clone(row)); },
      upsertShadowResult: async function () { return null; },
    },
    journeyService: { assertOwned: async function () { return true; }, surveyVersionOf: async function () { return 2; } },
  });
  var fetchStub = function (url, opts) {
    if (!/\/v1\/diagnoses$/.test(String(url))) {
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
    }
    var body = JSON.parse(opts.body);
    posted.push(body);
    return service.createDiagnosis({ anonymousId: ANON, body: clone(body) }).then(function (json) {
      if (tamper) json = tamper(clone(json));
      return { ok: true, status: 201, json: function () { return Promise.resolve(json); } };
    });
  };
  async function flush() {
    for (var i = 0; i < 50; i++) await new Promise(function (r) { setImmediate(r); });
  }
  var ctx = makeContext(ROOT, { realShadow: true, fetch: fetchStub, search: "?cz_shadow=1" });
  var sb = ctx.sb;
  sb.CZ_BACKEND_API_URL = "http://127.0.0.1:9";
  sb.CZIdentity = { anonymous_id: ANON, journey_id: JOURNEY };
  var F = { ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [debt("mora", Object.assign({}, MR, { pago_mensual_actual: 0 }))] };

  async function run(flag) {
    sb.CZ_V2_STRATEGY_STATE_ENABLED = flag;
    sb.CZShadowDiagnosis._resetDedupeForTests();
    ctx.state(F, { income_source: "user_update" });
    sb.CZState.diag = sb.calcularMotor();
    sb.CZShadowDiagnosis.maybeShadowDiagnosis(sb.CZState, "test");
    await flush();
    return posted[posted.length - 1];
  }

  var offBody = await run(false);
  check("[B] V2 state flag off: capture v1 (isDebtContractV2Capture false), posted snapshot has no debt_contract_version -> server v1 / shadow-02",
    sb.CZShadowDiagnosis.isDebtContractV2Capture() === false && !!offBody && !("debt_contract_version" in offBody) &&
    store.evaluations.length === 1 && store.evaluations[0].classifier_version === "miplan-financial-classifier-shadow-02" &&
    store.evaluations[0].financial_input_identity_version === "financial_input_identity_v1", offBody && Object.keys(offBody));

  var onBody = await run(true);
  var st = sb.CZShadowDiagnosis.getCurrentV2Strategy(sb.CZState);
  check("[B] V2 state flag on: posted snapshot carries debt_contract_version 'v2' and pago_mensual_actual 0 (number); bound state is identity v2 / shadow-03 REGULARIZACION",
    sb.CZShadowDiagnosis.isDebtContractV2Capture() === true && onBody.debt_contract_version === "v2" && onBody.deudas[0].pago_mensual_actual === 0 &&
    !!st && st.financial_input_identity.version === "financial_input_identity_v2" && st.classifier_version === "miplan-financial-classifier-shadow-03" &&
    st.result.strategy === "REGULARIZACION", st);

  sb.CZState.deudas[0].pago_mensual_actual = null;
  var staleOnUnknown = sb.CZShadowDiagnosis.getCurrentV2Strategy(sb.CZState);
  sb.CZState.deudas[0].pago_mensual_actual = 0;
  var backOnZero = sb.CZShadowDiagnosis.getCurrentV2Strategy(sb.CZState);
  sb.CZState.deudas[0].ultimo_pago_declarado = 999;
  sb.CZState.deudas[0].estado = "atraso_leve";
  var sameOnNoise = sb.CZShadowDiagnosis.getCurrentV2Strategy(sb.CZState);
  check("[B] binding distinguishes 0 vs unknown: switching 0 -> null hides the result (different identity); back to 0 shows it; " +
    "estado / ultimo_pago_declarado changes keep it (not identity)", staleOnUnknown === null && !!backOnZero && !!sameOnNoise);

  sb.CZState.deudas[0].situacion_ui = "reclamo_disputa";
  check("[B] mora -> reclamo_disputa with the same payment: different identity, result hidden", sb.CZShadowDiagnosis.getCurrentV2Strategy(sb.CZState) === null);

  tamper = function (json) {
    if (json.v2_financial_strategy) json.v2_financial_strategy.financial_input_identity.version = "financial_input_identity_v1";
    return json;
  };
  F = { ingreso: 61000, gastos: { vivienda: 30000 }, deudas: [debt("mora", Object.assign({}, MR, { pago_mensual_actual: 0 }))] };
  await run(true);
  check("[B] a response whose identity version differs from the snapshot's contract is never bound", sb.CZShadowDiagnosis.getCurrentV2Strategy(sb.CZState) === null);
  tamper = null;

  var hist = { ingreso: 62000, gastos: { vivienda: 30000 }, deudas: [debt("mora_reclamo", MR)] };
  F = hist;
  sb.CZ_V2_STRATEGY_STATE_ENABLED = false;
  var histBody = await run(false);
  check("[B] restored historical mora_reclamo state with capture off: posted unchanged (situacion_ui mora_reclamo, no pago_mensual_actual, no marker)",
    histBody.deudas[0].situacion_ui === "mora_reclamo" && !("pago_mensual_actual" in histBody.deudas[0]) && !("debt_contract_version" in histBody));
}

async function main() {
  partParity();
  partLegacy();
  partCapture();
  partApp();
  partDispute();
  await partBinding();
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("DEBT_CONTRACT_V2_UI_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error(e);
  process.exitCode = 1;
});
