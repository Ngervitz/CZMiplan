/**
 * server/bin/v2-wiring-blockers-test.js — the 3 MVP wiring blockers (incomplete card, V2 debt-management
 * opt-in replacing the legacy MiDeuda path, V2 as the panorama authority) in Node.
 *
 * Part A: js/v2Interaction.js pure functions on real classifier results and real user-choice states
 * (fake repository). Part B: the real js/ui.js plan tab rendered in isolated vm contexts with the real
 * legacy engine (calcularMotor) for the 5 strategies + incomplete; V2 flags off must render exactly what
 * the pre-change ui.js renders (B1 parity; MIPLAN_UI_BASELINE = path of the pre-change ui.js, optional).
 *
 * node -r ./server/testing/networkTrap.js server/bin/v2-wiring-blockers-test.js
 */
"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var ROOT = path.join(__dirname, "..", "..");
var ui = require("../../js/v2Interaction");
var userChoice = require("../modules/userChoice/service");
var classifier = require("../../engine/classifier/financial-classifier");
var CASES = require("../testing/v2InteractionCases").CASES;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail).slice(0, 1500) : ""));
}
function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
function eq(a, b) {
  try {
    require("assert").deepStrictEqual(a, b);
    return true;
  } catch (_e) {
    return false;
  }
}
function text(html) {
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

var EV = "11111111-1111-4111-8111-111111111111";
var ANON = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var DIAG = "22222222-2222-4222-8222-222222222222";
var COPY = { text_version: "debt-mgmt-optin-test.v1", title: "Título de prueba", body: "Texto de prueba.", consent_label: "Acepto <prueba> & más" };

/** Public V2 projection the client stores (same mapping as POST /v1/diagnoses, v2-strategy-test.js). */
function project(r) {
  function ref(x) {
    var o = { fact: x.fact, subject: x.subject };
    if (x.subject === "debt") o.debt_index = x.debt_index;
    return o;
  }
  return {
    survey_version: 2,
    classification_status: r.classification_status,
    strategy: r.strategy,
    reasons: r.entry_reasons,
    verification: {
      required: r.verification_required,
      reasons: r.verification_reasons.map(function (x) { return Object.assign({ code: x.code }, ref(x)); }),
      missing_facts: r.missing_required_facts.map(ref),
    },
    provenance: { classifier_version: r.classifier_version, contract: r.contract },
  };
}
function classifyInput(f) {
  return classifier.classifyFinancialShadow({ ingreso: f.ingreso, gastos: f.gastos, custom_expenses: [], deudas: clone(f.deudas),
    no_debts_declared: f.noDebts === true, entry_context: f.entry_context || null });
}
function debt(monto, pago, sit) {
  return { tipo: "prestamo", acreedor: "Banco QA", monto: String(monto), pago: pago == null ? "" : String(pago), situacion_ui: sit };
}

// Facts per strategy (asserted against the real classifier below).
var PROFILES = {
  CONTENCION: { ingreso: 50000, gastos: { vivienda: 40000 }, deudas: [debt(100000, 15000, "pagando_normal")] },
  REGULARIZACION: { ingreso: 50000, gastos: { vivienda: 20000 }, deudas: [debt(50000, null, "deje_pagar")] },
  REDUCCION_CARGA: { ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [debt(300000, 30000, "pagando_normal")] },
  CONSOLIDACION: { ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [debt(100000, 5000, "pagando_normal")] },
  MANTENIMIENTO_OPTIMIZACION: { ingreso: 60000, gastos: { vivienda: 20000 }, deudas: [], noDebts: true },
};
var INCOMPLETE = { ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [debt(100000, 5000, "no_seguro")] };
// REGULARIZACION with a positive flow (suspended payments), across legacy severities / plans.
function regDebt(o) {
  return Object.assign({ tipo: "prestamo", acreedor: "Banco QA", monto: "200000" }, o);
}
var REG_FLOW = {
  REG_DEJE_MAS90: { ingreso: 60000, gastos: { vivienda: 30000 }, deudas: [regDebt({ situacion_ui: "deje_pagar", pago: 0, atraso_tiempo: "mas_90" })] },
  REG_DEJE_SMALL: { ingreso: 120000, gastos: { vivienda: 30000 },
    deudas: [regDebt({ tipo: "tarjeta", monto: "20000", situacion_ui: "deje_pagar", pago: 0, atraso_tiempo: "menos_30" })] },
  REG_DEJE_PLUS_NORMAL: { ingreso: 150000, gastos: { vivienda: 30000 }, deudas: [
    regDebt({ monto: "40000", situacion_ui: "deje_pagar", pago: 0, atraso_tiempo: "menos_30" }),
    regDebt({ acreedor: "B2", monto: "100000", situacion_ui: "pagando_normal", pago: 8000 })] },
  REG_LEGACY_MORA_PAYING: { ingreso: 90000, gastos: { vivienda: 30000 }, deudas: [regDebt({ estado: "mora", pago: 5000 })] },
};
var FREE_FLOW_COPY = [
  ["Plata que te sobra", /Plata que te sobra/i],
  ["Flujo libre", /Flujo libre/i],
  ["plata libre / sobrante / excedente", /plata libre|sobrante|excedente/i],
  ["margen para ahorrar", /margen para ahorrar/i],
  ["pagar extra por mes / te ahorrás", /extra por mes|Te ahorr/i],
  ["situación manejable", /manejable/i],
  ["metric 'disponible'", /<div class="metric"><small>[^<]*<\/small><strong[^>]*>[^<]*<\/strong><div[^>]*>disponible</i],
];
var STRATEGY_TITLE = {
  CONTENCION: "Contención",
  REGULARIZACION: "Regularización",
  REDUCCION_CARGA: "Reducción de carga",
  CONSOLIDACION: "Consolidación",
  MANTENIMIENTO_OPTIMIZACION: "Mantenimiento/Optimización",
};

async function stateFor(caseId, heads) {
  var cs = CASES.filter(function (c) { return c.id === caseId; })[0];
  var r = classifier.classifyFinancialShadow(clone(cs.input));
  var raw = Object.assign({ evaluation_id: EV, classification_status: r.classification_status, strategy: r.strategy, classifier_version: r.classifier_version,
    financial_input_identity_version: "financial_input_identity_v1", financial_input_identity: "a".repeat(64), result: r,
    origin_expense_input: { gastos: cs.input.gastos, custom_expenses: cs.input.custom_expenses },
    lower_payment_intent: [], surplus_allocation: null, expense_reduction_intent: [], creditor_contact_step: [], debt_management_opt_in: null }, heads || {});
  var svc = userChoice.createUserChoiceService({ repository: { getUserChoiceState: async function () { return clone(raw); } } });
  return svc.getState({ anonymousId: ANON, evaluationId: EV });
}

// ---------------------------------------------------------------- Part A

async function partA() {
  // ---- [A1] INCOMPLETE: verification card ----
  function card(f) {
    var r = classifyInput(f);
    return { r: r, html: ui.renderVerificationCard(project(r), { debtLabel: function (i) { return "Banco QA " + (i + 1); } }) };
  }
  var noInputs = function (h) { return !/<input|<select|<textarea/i.test(h); };

  var unsure = card(INCOMPLETE);
  check("[A1] no_seguro -> incomplete; the card names the debt, says the situation is missing and opens the existing editor of that debt " +
    "(data-deuda-editar=0, app.js 'Editar' handler)",
    unsure.r.classification_status === "incomplete" && /data-v2i-widget="verification"/.test(unsure.html) && /Banco QA 1/.test(unsure.html) &&
    /Falta indicar si está al día o atrasada\./.test(unsure.html) && /data-deuda-editar="0"/.test(unsure.html) && noInputs(unsure.html), unsure.html);

  var noExp = card({ ingreso: 60000, gastos: {}, deudas: [debt(100000, 5000, "pagando_normal")] });
  check("[A1] EXPENSES_UNKNOWN -> 'Completar gastos' wired to the existing goToEditGastosFromDashboard (data-v2i=open-expenses)",
    noExp.r.verification_reasons.some(function (x) { return x.code === "EXPENSES_UNKNOWN"; }) &&
    /data-v2i-verify="EXPENSES_UNKNOWN"/.test(noExp.html) && /data-v2i="open-expenses"[^>]*>Completar gastos</.test(noExp.html), noExp.html);

  var noDebtSet = card({ ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [] });
  check("[A1] DEBT_SET_INCOMPLETE -> 'Confirmar mis deudas' wired to the existing debts tab (data-v2i=open-debts, same as btn-hero-confirmar-deudas)",
    noDebtSet.r.verification_reasons.some(function (x) { return x.code === "DEBT_SET_INCOMPLETE"; }) &&
    /data-v2i="open-debts"[^>]*>Confirmar mis deudas</.test(noDebtSet.html), noDebtSet.html);

  var lastKnown = card({ ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [debt(100000, 5000, "atrasado_pagando")] });
  var lkCodes = lastKnown.r.verification_reasons.map(function (x) { return x.code; });
  check("[A1] atrasado_pagando (DEBT_PAYMENT_ONLY_LAST_KNOWN): shown as missing information, marked as not completable yet; no editor button, no input",
    lkCodes.indexOf("DEBT_PAYMENT_ONLY_LAST_KNOWN") !== -1 && /solo tenemos el último pago/.test(lastKnown.html) &&
    /data-v2i-pending="1"/.test(lastKnown.html) && !/data-deuda-editar/.test(lastKnown.html) && noInputs(lastKnown.html), { codes: lkCodes, html: lastKnown.html });

  var mora = card({ ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [debt(50000, null, "mora_reclamo")] });
  var moraCodes = mora.r.verification_reasons.map(function (x) { return x.code; });
  check("[A1] mora_reclamo (DEBT_PAYMENT_UNKNOWN + DEBT_PROBLEM_DECLARED_MORA_UNKNOWN): missing information only, no 'Falta la cuota mensual' prompt, " +
    "no editor button, no input",
    moraCodes.indexOf("DEBT_PAYMENT_UNKNOWN") !== -1 && moraCodes.indexOf("DEBT_PROBLEM_DECLARED_MORA_UNKNOWN") !== -1 &&
    /Falta información sobre su situación de pago\./.test(mora.html) && !/Falta la cuota mensual\./.test(mora.html) &&
    /data-v2i-pending="1"/.test(mora.html) && !/data-deuda-editar/.test(mora.html) && noInputs(mora.html), { codes: moraCodes, html: mora.html });

  var moraZero = card({ ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [debt(50000, null, "mora_reclamo"), debt(0, 2000, "pagando_normal")] });
  check("[A1] per debt: the mora_reclamo debt stays pending while a zero-balance debt opens its editor (data-deuda-editar=1 only)",
    /data-v2i-verify="debt" data-index="0"[\s\S]*data-v2i-pending="1"/.test(moraZero.html) &&
    /El saldo figura en 0/.test(moraZero.html) && (moraZero.html.match(/data-deuda-editar="(\d+)"/g) || []).join() === 'data-deuda-editar="1"', moraZero.html);

  var prefill = card({ ingreso: 60000, gastos: { vivienda: 15000 }, deudas: [debt(100000, 5000, "pagando_normal")],
    entry_context: { field_provenance: { ingreso: { source: "url_prefill", user_modified: false } } } });
  check("[A1] INCOME_PREFILL_UNCONFIRMED: no existing dashboard mechanism confirms an unchanged income -> listed as missing, no button, no input",
    prefill.r.verification_reasons.some(function (x) { return x.code === "INCOME_PREFILL_UNCONFIRMED"; }) &&
    /data-v2i-verify="INCOME_PREFILL_UNCONFIRMED"/.test(prefill.html) && /vino precargado/.test(prefill.html) &&
    !/data-v2i="open-|data-deuda-editar/.test(prefill.html) && noInputs(prefill.html), prefill.html);

  var synthetic = ui.renderVerificationCard({ classification_status: "incomplete", verification: { required: true, reasons: [
    { code: "ACTIVE_MORA_EXTERNAL_CONTRADICTION", fact: "active_mora", subject: "person" }, { code: "SOMETHING_NEW", fact: "x", subject: "debt", debt_index: 2 }] } });
  check("[A1] reasons without a mechanism (unknown / never-emitted codes) -> generic missing information, no invented input or button",
    /Falta información para completar tu diagnóstico\./.test(synthetic) && !/data-v2i="|data-deuda-editar/.test(synthetic) && noInputs(synthetic), synthetic);

  var classifiedCard = ui.renderVerificationCard(project(classifyInput(PROFILES.CONSOLIDACION)));
  check("[A1] classified result / null -> no card", classifiedCard === "" && ui.renderVerificationCard(null) === "");

  var hostile = ui.renderVerificationCard(project(unsure.r), { debtLabel: function () { return '<img src=x onerror="alert(1)">'; } });
  check("[A1] debt names are HTML-escaped in the card", hostile.indexOf("<img") === -1 && hostile.indexOf("&lt;img") !== -1);

  // ---- [A2] panorama view ----
  var views = {};
  Object.keys(PROFILES).forEach(function (s) {
    var r = classifyInput(PROFILES[s]);
    views[s] = { status: r.classification_status, strategy: r.strategy, view: ui.panoramaViewOf({ diagnosis_id: DIAG, result: project(r) }) };
  });
  check("[A2] the 5 fixture profiles classify to their strategy and panoramaViewOf -> classified view with strategy + entry_reasons",
    Object.keys(PROFILES).every(function (s) {
      var v = views[s];
      return v.status === "classified" && v.strategy === s && v.view && v.view.kind === "classified" && v.view.strategy === s &&
        v.view.entry_reasons.length > 0 && v.view.key === "classified:" + DIAG + ":" + s;
    }), views);
  var incView = ui.panoramaViewOf({ diagnosis_id: DIAG, result: project(unsure.r) });
  check("[A2] incomplete -> incomplete view with the verification reasons; no strategy",
    incView && incView.kind === "incomplete" && !incView.strategy && incView.verification_reasons.length === unsure.r.verification_reasons.length);
  var p = project(classifyInput(PROFILES.CONSOLIDACION));
  check("[A2] no view without diagnosis_id, with survey_version != 2 or an unknown strategy",
    ui.panoramaViewOf({ result: p }) === null && ui.panoramaViewOf({ diagnosis_id: DIAG, result: Object.assign({}, p, { survey_version: 1 }) }) === null &&
    ui.panoramaViewOf({ diagnosis_id: DIAG, result: Object.assign({}, p, { strategy: "PLAN_4" }) }) === null && ui.panoramaViewOf(null) === null);

  // ---- [A3] MI DEUDA V2 opt-in ----
  var cfg = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
  check("[A3] config.js ships CZ_V2_DEBT_MANAGEMENT_OPTIN_COPY = null (copy not approved -> card hidden, nothing sent)",
    /\nvar CZ_V2_DEBT_MANAGEMENT_OPTIN_COPY = null;\r?\n/.test(cfg));
  check("[A3] optInCopyOf: only a complete copy with a valid text_version is usable",
    ui.optInCopyOf(null) === null && ui.optInCopyOf(Object.assign({}, COPY, { text_version: null })) === null &&
    ui.optInCopyOf(Object.assign({}, COPY, { text_version: "Bad Version" })) === null && ui.optInCopyOf(Object.assign({}, COPY, { title: " " })) === null &&
    eq(ui.optInCopyOf(COPY), COPY));
  check("[A3] bodies.optIn: explicit non-null consent_text_version; never built without a valid version or with an unknown state",
    eq(ui.bodies.optIn("opted_in", COPY.text_version, DIAG), { state: "opted_in", consent_text_version: COPY.text_version, diagnosis_id: DIAG }) &&
    eq(ui.bodies.optIn("withdrawn", COPY.text_version, null), { state: "withdrawn", consent_text_version: COPY.text_version }) &&
    ui.bodies.optIn("opted_in", null, DIAG) === null && ui.bodies.optIn("opted_in", "", DIAG) === null && ui.bodies.optIn("none", COPY.text_version, DIAG) === null);

  var reg = await stateFor("REGULARIZACION");
  var hNoCopy = ui.renderPanel(reg, {});
  var hNone = ui.renderPanel(reg, { optInCopy: ui.optInCopyOf(COPY) });
  var regIn = await stateFor("REGULARIZACION", { debt_management_opt_in: { state: "opted_in", created_at: "t1" } });
  var regOut = await stateFor("REGULARIZACION", { debt_management_opt_in: { state: "withdrawn", created_at: "t2" } });
  var hIn = ui.renderPanel(regIn, { optInCopy: ui.optInCopyOf(COPY) });
  var hOut = ui.renderPanel(regOut, { optInCopy: ui.optInCopyOf(COPY) });
  var optSection = function (h) { var i = h.indexOf('data-v2i-widget="debt-optin"'); return i === -1 ? "" : h.slice(i); };
  check("[A3] without approved copy the opt-in is not rendered", !/debt-optin/.test(hNoCopy));
  check("[A3] none: separate card after the plan tools (not a next step), unchecked checkbox, 'Registrar mi interés' disabled, copy escaped",
    /debt-optin/.test(hNone) && /<input type="checkbox" data-v2i-input="optin-consent"(?![^>]*checked)/.test(optSection(hNone)) &&
    /data-v2i="optin" data-state="opted_in" disabled>Registrar mi interés</.test(hNone) &&
    optSection(hNone).indexOf("Acepto &lt;prueba&gt; &amp; más") !== -1 && !/data-v2i-step/.test(optSection(hNone)) &&
    hNone.indexOf('data-v2i-widget="debt-optin"') > hNone.indexOf('data-v2i-widget="contact"'), optSection(hNone));
  check("[A3] opted_in -> 'Registraste tu interés.' + 'Retirar mi interés' (withdrawn); withdrawn -> 'Retiraste tu interés.' + checkbox again",
    /data-v2i-optin-state="opted_in"/.test(hIn) && /data-v2i="optin" data-state="withdrawn"/.test(hIn) && !/optin-consent/.test(hIn) &&
    /data-v2i-optin-state="withdrawn"/.test(hOut) && /optin-consent/.test(hOut) && /data-state="opted_in" disabled/.test(hOut));
  var noDebt = await stateFor("CONTENCION_NO_ELIGIBLE_DEBT");
  var noDebtIn = await stateFor("CONTENCION_NO_ELIGIBLE_DEBT", { debt_management_opt_in: { state: "opted_in", created_at: "t" } });
  check("[A3] no debts in the evaluation -> not offered; an existing opt-in stays visible so it can be withdrawn",
    !/debt-optin/.test(ui.renderPanel(noDebt, { optInCopy: ui.optInCopyOf(COPY) })) &&
    /data-v2i="optin" data-state="withdrawn"/.test(ui.renderPanel(noDebtIn, { optInCopy: ui.optInCopyOf(COPY) })));
  var fixed = text(optSection(hNone).replace(COPY.title, "").replace(COPY.body, "").replace("Acepto &lt;prueba&gt; &amp; más", ""));
  check("[A3] the fixed opt-in wording names no third party and asks for no data sharing (MiDeuda / compartir / terceros)",
    !/mideuda|compart|tercer/i.test(fixed), fixed);

  // Real service: opt-in / withdrawal leave strategy, choices and FinancialActions untouched; the stored version is the copy's.
  var cs = CASES.filter(function (c) { return c.id === "CONTENCION_WITH_DEBT"; })[0];
  var r = classifier.classifyFinancialShadow(clone(cs.input));
  var raw = { evaluation_id: EV, classification_status: r.classification_status, strategy: r.strategy, classifier_version: r.classifier_version,
    financial_input_identity_version: "financial_input_identity_v1", financial_input_identity: "a".repeat(64), result: r,
    origin_expense_input: { gastos: cs.input.gastos, custom_expenses: cs.input.custom_expenses },
    lower_payment_intent: [{ event_id: "l", debt_index: 0, seq: 1, created_at: "t" }], surplus_allocation: null,
    expense_reduction_intent: [{ event_id: "e", expense_ref: "vivienda", amount: 4000, seq: 1, created_at: "t" }], creditor_contact_step: [],
    debt_management_opt_in: null };
  var stored = [];
  var svc = userChoice.createUserChoiceService({ repository: {
    getUserChoiceState: async function () { return clone(raw); },
    recordDebtManagementOptIn: async function (row) {
      stored.push(clone(row));
      raw.debt_management_opt_in = { state: row.state, created_at: "t" + stored.length };
      return { evaluation_id: row.evaluation_id, appended: true, current: raw.debt_management_opt_in };
    },
  } });
  var before = await svc.getState({ anonymousId: ANON, evaluationId: EV });
  await svc.recordOptIn({ anonymousId: ANON, evaluationId: EV, body: ui.bodies.optIn("opted_in", COPY.text_version, DIAG) });
  var afterIn = await svc.getState({ anonymousId: ANON, evaluationId: EV });
  await svc.recordOptIn({ anonymousId: ANON, evaluationId: EV, body: ui.bodies.optIn("withdrawn", COPY.text_version, DIAG) });
  var afterOut = await svc.getState({ anonymousId: ANON, evaluationId: EV });
  function financial(s) {
    return { strategy: s.strategy, status: s.classification_status, ac: s.action_context, choices: s.choices, fa: s.financial_actions };
  }
  check("[A3] real service: opted_in then withdrawn are stored with the copy's consent_text_version (never null) and read back; " +
    "third_party_sharing_authorized stays false",
    stored.length === 2 && stored.every(function (x) { return x.consent_text_version === COPY.text_version; }) &&
    stored[0].state === "opted_in" && stored[1].state === "withdrawn" &&
    afterIn.debt_management_opt_in.state === "opted_in" && afterOut.debt_management_opt_in.state === "withdrawn" &&
    afterIn.debt_management_opt_in.third_party_sharing_authorized === false, stored);
  check("[A3] strategy, action_context, choices and FinancialActions identical before / after opt-in and after withdrawal (" +
    before.financial_actions.length + " actions)",
    before.financial_actions.length === 2 && eq(financial(before), financial(afterIn)) && eq(financial(before), financial(afterOut)));
}

// ---------------------------------------------------------------- Part B (real ui.js in vm contexts)

function makeContext(uiFile) {
  var sandbox = {
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {} },
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    URLSearchParams: URLSearchParams, URL: URL, TextEncoder: TextEncoder, crypto: globalThis.crypto,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.location = { search: "", href: "http://localhost/", hostname: "localhost", pathname: "/" };
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
  vm.createContext(sandbox);
  function load(file) {
    vm.runInContext(fs.readFileSync(file, "utf8").replace(/\bconst /g, "var "), sandbox, { filename: file });
  }
  ["js/config.js", "js/creditors.js", "js/survey.js", "js/algorithms.js", "js/events.js"].forEach(function (f) { load(path.join(ROOT, f)); });
  load(uiFile);
  load(path.join(ROOT, "js", "consent.js"));
  load(path.join(ROOT, "js", "v2Interaction.js"));
  load(path.join(ROOT, "js", "app.js"));
  var current = null;
  sandbox.CZShadowDiagnosis = {
    isV2StrategyStateEnabled: function () { return true; },
    getApiBaseUrl: function () { return "http://127.0.0.1:9"; },
    getCurrentV2Strategy: function () { return clone(current); },
  };
  return {
    sb: sandbox,
    setV2: function (v) { current = v; },
    setFlag: function (on) { sandbox.CZ_V2_INTERACTION_ENABLED = on === true; },
    /** Legacy diag from the real engine on the same facts; returns the rendered plan tab. */
    render: function (f, mutate) {
      sandbox.PRE.ingreso = f.ingreso;
      sandbox.CZState = { step: 3, tab: "plan", gastos: clone(f.gastos), custom_expenses: [], deudas: clone(f.deudas), no_debts_declared: f.noDebts === true,
        snap: { plan_id: 2 }, diag: null, herr: {}, temporal: {}, gastos_missing_confirmed: false };
      var d = sandbox.calcularMotor();
      sandbox.CZState.diag = d;
      if (mutate) mutate(sandbox.CZState, sandbox);
      return sandbox.renderTabPlan();
    },
  };
}

function heroOf(html) {
  var a = html.indexOf('id="cz-dashboard-hero"');
  var b = html.indexOf("data-v2i-slot");
  return a === -1 ? "" : html.slice(a, b === -1 ? a + 3000 : b);
}

var LEGACY_ADVICE = [
  ["Que busca este plan", /Que busca este plan/],
  ["Acción prioritaria", /Acci[oó]n prioritaria/],
  ["Primer paso recomendado", /Primer paso recomendado/],
  ["Tu prioridad hoy", /Tu prioridad hoy/],
  ["Próximo paso recomendado", /Pr[oó]ximo paso recomendado/],
  ["Acciones recomendadas", /Acciones recomendadas/],
  ["Acciones del plan", /Acciones del plan/],
  ["Ordenar mi deuda (legacy)", /Ordenar mi deuda/],
  ["MiDeuda partner card", /mideuda-partner-card|Continuar en MiDeuda/],
  ["btn-retry-fallback-deuda", /btn-retry-fallback-deuda/],
];

function partB() {
  var cur = makeContext(path.join(ROOT, "js", "ui.js"));
  var baselineFile = process.env.MIPLAN_UI_BASELINE;
  var base = baselineFile && fs.existsSync(baselineFile) ? makeContext(baselineFile) : null;

  var all = Object.assign({ INCOMPLETE: INCOMPLETE, MIDEUDA_LEGACY: { ingreso: 40000, gastos: { vivienda: 10000 },
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "50000", pago: "3000", situacion_ui: "atrasado_pagando" }] },
  MIDEUDA_CLASSIFIED: { ingreso: 50000, gastos: { vivienda: 20000 },
    deudas: [{ tipo: "tarjeta", acreedor: "OCA", monto: "50000", pago: "", situacion_ui: "deje_pagar", atraso_tiempo: "mas_90" }] } }, PROFILES, REG_FLOW);

  // ---- [B1] B1 / flags off: byte-identical to the pre-change ui.js; V2 state alone changes nothing ----
  if (base) {
    var parity = {};
    Object.keys(all).forEach(function (k) {
      cur.setFlag(false); base.setFlag(false);
      cur.setV2({ diagnosis_id: DIAG, result: project(classifyInput(all[k])) });
      base.setV2(null);
      var a = cur.render(all[k]);
      var b = base.render(all[k]);
      cur.setFlag(true); cur.setV2(null);
      var c = cur.render(all[k]);
      parity[k] = a === b && c === b;
    });
    check("[B1] V2 flags off (even with a stored V2 result) and flag on without a current V2 result: the plan tab is byte-identical to the " +
      "pre-change ui.js for the 5 strategies, incomplete and a MiDeuda-recommended profile " + JSON.stringify(parity),
      Object.keys(parity).every(function (k) { return parity[k]; }), parity);
  } else {
    check("[B1] pre-change ui.js baseline available (MIPLAN_UI_BASELINE)", false, "set MIPLAN_UI_BASELINE to the pre-change js/ui.js");
  }
  cur.setFlag(false); cur.setV2(null);
  var legacyMideuda = cur.render(all.MIDEUDA_LEGACY);
  check("[B1] MiDeuda legacy unchanged in B1: recommended profile still renders the partner card (checkbox + 'Continuar en MiDeuda') and the " +
    "legacy CTA path; no V2 opt-in / slot",
    cur.sb.CZState.diag.recommended_tools.indexOf("mideuda") !== -1 && /id="mideuda-partner-card"/.test(legacyMideuda) &&
    /id="chk-mideuda-optin"/.test(legacyMideuda) && /btn-mideuda-continue/.test(legacyMideuda) &&
    !/data-v2i-slot|debt-optin/.test(legacyMideuda));

  // ---- [B2] PANORAMA: V2 classified is the financial authority for the 5 strategies ----
  cur.setFlag(true);
  var report = {};
  Object.keys(PROFILES).forEach(function (s) {
    var f = PROFILES[s];
    var res = classifyInput(f);
    cur.setV2({ diagnosis_id: DIAG, result: project(res) });
    var html = cur.render(f);
    var diag = cur.sb.CZState.diag;
    var legacyTitle = cur.sb._visiblePlanTitle(diag.plan);
    var hero = heroOf(html);
    // Same V2 result with every legacy plan: the hero must not move.
    var heroes = [1, 2, 3, 4, 5].map(function (pid) {
      return heroOf(cur.render(f, function (st, sb) { st.diag.planId = pid; st.diag.plan = sb.PLANES[pid] || st.diag.plan; }));
    });
    var reasonsText = res.entry_reasons.map(function (r) { return cur.sb._v2EntryReasonText(r); });
    var advice = LEGACY_ADVICE.filter(function (x) { return x[1].test(html); }).map(function (x) { return x[0]; });
    cur.setFlag(false); cur.setV2(null);
    var legacyHtml = cur.render(f);
    cur.setFlag(true); cur.setV2({ diagnosis_id: DIAG, result: project(res) });
    report[s] = {
      title: hero.indexOf(">" + STRATEGY_TITLE[s] + "<") !== -1 && hero.indexOf('data-v2-strategy="' + s + '"') !== -1,
      noLegacyTitle: hero.indexOf(legacyTitle) === -1,
      planIndependent: heroes.every(function (h) { return h === hero; }),
      problem: reasonsText.length > 0 && reasonsText.every(function (t) { return t && hero.indexOf(t) !== -1; }),
      noHeroNextStep: !/Pr[oó]ximo paso recomendado/.test(hero),
      advice: advice,
      legacyHadAdvice: LEGACY_ADVICE.some(function (x) { return x[1].test(legacyHtml); }),
      slotAfterHero: html.indexOf("data-v2i-slot") > html.indexOf('id="cz-dashboard-hero"') && html.indexOf("data-v2i-slot") < html.indexOf("Tu situación actual"),
      explanatory: /Tu situación actual/.test(html) && /dash-zone-situacion-hoy|data-dash-zone="situacion-hoy"|situacion-hoy/.test(html) &&
        /numeros/.test(html) && html.indexOf(cur.sb.renderRadiografia()) !== -1,
      plusIntact: /id="cz-plus-entry"/.test(html) && /id="btn-conocer-plus"/.test(html),
    };
  });
  function all5(key) {
    return Object.keys(report).every(function (s) { return report[s][key] === true; });
  }
  check("[B2] hero title = V2 strategy name (docs/DECISIONS.md) with data-v2-strategy, never the legacy plan title", all5("title") && all5("noLegacyTitle"), report);
  check("[B2] hero does not depend on planId: identical hero with legacy planId 1..5 under the same V2 result", all5("planIndependent"), report);
  check("[B2] hero state / problem come from the V2 entry_reasons; no embedded legacy next step", all5("problem") && all5("noHeroNextStep"), report);
  check("[B2] no legacy planId advice (Que busca este plan / Acción prioritaria / Primer paso recomendado / Tu prioridad hoy / Acciones recomendadas / " +
    "MiDeuda paths) while the same profile shows some of it without V2",
    Object.keys(report).every(function (s) { return report[s].advice.length === 0; }) &&
    Object.keys(report).some(function (s) { return report[s].legacyHadAdvice; }), report);
  check("[B2] 'Tus próximos pasos' slot right after the hero (the V2 panel mounts there and is the only next-step owner)", all5("slotAfterHero"), report);
  check("[B2] explanatory blocks stay (Tu situación actual, Tu situación hoy, Tus números + radiografía) and the Plus entry is intact",
    all5("explanatory") && all5("plusIntact"), report);

  // ---- [B3] PANORAMA incomplete: no invented strategy ----
  var incRes = classifyInput(INCOMPLETE);
  cur.setV2({ diagnosis_id: DIAG, result: project(incRes) });
  var incHtml = cur.render(INCOMPLETE);
  var incHero = heroOf(incHtml);
  var incLegacyTitle = cur.sb._visiblePlanTitle(cur.sb.CZState.diag.plan);
  check("[B3] V2 incomplete: hero shows the incomplete state, no strategy name, no legacy plan title, no data-v2-strategy; slot for the " +
    "missing-data card; no legacy advice",
    incRes.classification_status === "incomplete" && /Tu diagnóstico todavía no está completo/.test(incHero) &&
    Object.keys(STRATEGY_TITLE).every(function (s) { return incHero.indexOf(">" + STRATEGY_TITLE[s] + "<") === -1; }) &&
    incHero.indexOf(incLegacyTitle) === -1 && !/data-v2-strategy/.test(incHero) && /data-v2i-slot/.test(incHtml) &&
    LEGACY_ADVICE.every(function (x) { return !x[1].test(incHtml); }),
    { hero: text(incHero).slice(0, 400), advice: LEGACY_ADVICE.filter(function (x) { return x[1].test(incHtml); }).map(function (x) { return x[0]; }) });

  // ---- [B4] MI DEUDA V2: legacy path absent on MiDeuda-recommended profiles (classified and incomplete) ----
  var md = {};
  ["MIDEUDA_CLASSIFIED", "MIDEUDA_LEGACY"].forEach(function (k) {
    var mdRes = classifyInput(all[k]);
    cur.setFlag(false); cur.setV2(null);
    var legacyHtml = cur.render(all[k]);
    cur.setFlag(true); cur.setV2({ diagnosis_id: DIAG, result: project(mdRes) });
    var mdHtml = cur.render(all[k]);
    var mdView = cur.sb.CZV2Interaction.currentPanoramaView();
    md[k] = {
      view: mdView && mdView.kind,
      strategy: mdRes.strategy,
      recommended: cur.sb.CZState.diag.recommended_tools.indexOf("mideuda") !== -1,
      legacyShown: /mideuda-partner-card/.test(legacyHtml),
      v2Legacy: (mdHtml.match(/Ordenar mi deuda|mideuda-partner-card|chk-mideuda-optin|btn-mideuda-continue|btn-retry-fallback-deuda/) || [null])[0],
      untracked: cur.sb.CZState.mideuda_cta_shown !== true && cur.sb.CZState._mideudaCtaShownTracked !== true,
    };
  });
  check("[B4] V2 mode on MiDeuda-recommended profiles (REGULARIZACION classified + incomplete): the legacy card shows without V2 but with V2 there is no " +
    "'Ordenar mi deuda con MiDeuda', partner card / checkbox / 'Continuar en MiDeuda' or btn-retry-fallback-deuda; recommended_tools untouched",
    md.MIDEUDA_CLASSIFIED.view === "classified" && md.MIDEUDA_CLASSIFIED.strategy === "REGULARIZACION" && md.MIDEUDA_LEGACY.view === "incomplete" &&
    Object.keys(md).every(function (k) { return md[k].recommended && md[k].legacyShown && md[k].v2Legacy === null; }), md);
  check("[B4] V2 rendering does not touch the legacy MiDeuda state (no mideuda_cta_shown / lead status change)",
    Object.keys(md).every(function (k) { return md[k].untracked; }), md);

  // ---- [B5] V2 REGULARIZACION: a positive flow from suspended payments is never shown as money left over ----
  function freeFlowHits(html) {
    return FREE_FLOW_COPY.filter(function (x) { return x[1].test(html); }).map(function (x) { return x[0]; });
  }
  var reg = {};
  Object.keys(REG_FLOW).forEach(function (k) {
    var f = REG_FLOW[k];
    var res = classifyInput(f);
    cur.setFlag(false); cur.setV2(null);
    var legacyHtml = cur.render(f);
    cur.setFlag(true); cur.setV2({ diagnosis_id: DIAG, result: project(res) });
    var html = cur.render(f);
    reg[k] = {
      strategy: res.strategy,
      flow: res.canonical_facts.canonical_flow,
      v2Hits: freeFlowHits(html),
      legacyHits: freeFlowHits(legacyHtml),
      descriptive: /Total de deudas/.test(html) && /Pagas en cuotas por mes/.test(html) && /Pagos activos: /.test(html) &&
        /De tu sueldo va a deudas/.test(html),
    };
  });
  check("[B5] V2 REGULARIZACION with flow > 0 (4 profiles): no 'Plata que te sobra', 'Flujo libre', 'disponible' metric, savings margin, " +
    "extra-payment what-if or 'manejable' copy; the descriptive numbers (debt total, active payments, debt share of income) stay",
    Object.keys(reg).every(function (k) {
      return reg[k].strategy === "REGULARIZACION" && reg[k].flow > 0 && reg[k].v2Hits.length === 0 && reg[k].descriptive;
    }), reg);
  check("[B5] B1 / flags off on the same profiles still renders the legacy free-flow copy (Plata que te sobra + Flujo libre)",
    Object.keys(reg).every(function (k) {
      return reg[k].legacyHits.indexOf("Plata que te sobra") !== -1 && reg[k].legacyHits.indexOf("Flujo libre") !== -1;
    }), reg);

  var other = {};
  ["CONSOLIDACION", "MANTENIMIENTO_OPTIMIZACION", "CONTENCION", "REDUCCION_CARGA"].forEach(function (s) {
    var f = PROFILES[s];
    cur.setFlag(true); cur.setV2({ diagnosis_id: DIAG, result: project(classifyInput(f)) });
    var html = cur.render(f);
    other[s] = { sobra: /Plata que te sobra\/mes/.test(html), flujoLibre: /Flujo libre/.test(html) || !(f.deudas && f.deudas.length) };
  });
  check("[B5] other V2 strategies keep the legitimate flow copy (Plata que te sobra/mes; Flujo libre wherever the radiografía renders)",
    Object.keys(other).every(function (s) { return other[s].sobra && other[s].flujoLibre; }), other);
}

async function main() {
  await partA();
  partB();
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_WIRING_BLOCKERS_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
