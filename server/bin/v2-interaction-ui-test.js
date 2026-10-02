/**
 * server/bin/v2-interaction-ui-test.js — V2-CTA-INTERACTION-01, frontend module (js/v2Interaction.js) in Node.
 *
 * Public states come from the real user choice service (fake repository returning RPC-shaped replies
 * built from the real classifier on the 7 case fixtures). Checks case resolution, which tools render,
 * copy rules (no achieved saving, no automatic potential, no offer), no default amounts, escaping,
 * request bodies and amount parsing with the app's parseHumanAmount (config.js).
 *
 * node -r ./server/testing/networkTrap.js server/bin/v2-interaction-ui-test.js
 */
"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var ROOT = path.join(__dirname, "..", "..");
var configSrc = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
var parserSrc = /var HUMAN_AMOUNT_RE[\s\S]*?\nfunction parseHumanAmount\(raw\) \{[\s\S]*?\n\}/.exec(configSrc)[0];
var sandbox = {};
vm.runInNewContext(parserSrc + "\nthis.parseHumanAmount = parseHumanAmount;", sandbox);
globalThis.parseHumanAmount = sandbox.parseHumanAmount;

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
function widgets(html) {
  return (html.match(/data-v2i-widget="[^"]+"/g) || []).map(function (s) { return s.slice(17, -1); });
}
function money(n) {
  return "$" + Number(n).toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

var EV = "11111111-1111-4111-8111-111111111111";
var ANON = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
var DIAG = "22222222-2222-4222-8222-222222222222";

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

async function main() {
  var FORBIDDEN = /ahorro conseguido|ahorro logrado|ahorraste|potencial|eliminar|elimin[aá]|resuelto|resuelve|soluci[oó]n|acuerdo|refinanc|copanel|oferta|pr[eé]stamo|ya recortaste/i;
  var all = [];

  // ---- [1] case resolution + which tools render ----
  var expected = {
    CONTENCION_NO_ELIGIBLE_DEBT: ["expense"],
    MANTENIMIENTO_FLOW_ZERO: ["expense"],
    CONTENCION_WITH_DEBT: ["lower", "expense"],
    REGULARIZACION: ["contact"],
    REDUCCION_CARGA: ["lower"],
    CONSOLIDACION: ["surplus"],
    MANTENIMIENTO_SURPLUS: ["surplus"],
  };
  var resolved = {};
  var rendered = {};
  for (var k = 0; k < CASES.length; k++) {
    var s = await stateFor(CASES[k].id);
    resolved[CASES[k].id] = ui.resolveInteractionCase(s);
    var html = ui.renderPanel(s, null, null);
    rendered[CASES[k].id] = widgets(html);
    all.push(html);
  }
  check("[1] resolveInteractionCase maps each of the 7 server states to its case",
    CASES.every(function (c) { return resolved[c.id] === c.id; }), resolved);
  check("[1] every case renders an actionable tool, exactly: CONTENCION expenses (+ lower payment when a debt is eligible), MANT flow 0 expenses, " +
    "REGULARIZACION contact, REDUCCION_CARGA lower payment, CONSOLIDACION / MANT surplus allocation",
    eq(rendered, expected), rendered);
  var incomplete = await stateFor("CONTENCION_NO_ELIGIBLE_DEBT", { classification_status: "incomplete", strategy: null });
  check("[1] incomplete / missing state -> no case, empty render",
    ui.resolveInteractionCase(incomplete) === null && ui.renderPanel(incomplete) === "" && ui.renderPanel(null) === "" && ui.resolveInteractionCase({}) === null);

  // ---- [2] expense widget ----
  var c1 = await stateFor("CONTENCION_NO_ELIGIBLE_DEBT");
  var h1 = ui.renderPanel(c1);
  var inputs = h1.match(/<input[^>]*data-v2i-input="amount"[^>]*>/g) || [];
  check("[2] one row per server category with catalog labels and 'Otro gasto 1' for custom:1; current expense shown; inputs empty (no default amount)",
    /Vivienda/.test(h1) && /Alimentación/.test(h1) && /Otro gasto 1/.test(h1) && h1.indexOf("Gym") === -1 &&
    h1.indexOf("Gasto actual: " + money(40000)) !== -1 && h1.indexOf("Gasto actual: " + money(3000)) !== -1 &&
    inputs.length === 3 && inputs.every(function (i) { return / value=""/.test(i); }), inputs);
  var c1m = await stateFor("CONTENCION_NO_ELIGIBLE_DEBT", { expense_reduction_intent: [
    { event_id: "e1", expense_ref: "vivienda", amount: 5000, seq: 1, created_at: "t1" },
    { event_id: "e2", expense_ref: "custom:1", amount: 3000, seq: 1, created_at: "t2" }] });
  var h1m = ui.renderPanel(c1m);
  all.push(h1m);
  check("[2] CONTENCION: marked intents show what the user thinks they could cut, a 'Quitar' to withdraw, and the declared total next to the " +
    "monthly gap without saying it is closed",
    h1m.indexOf("Pensás recortar " + money(5000)) !== -1 && (h1m.match(/data-v2i="expense-remove"/g) || []).length === 2 &&
    h1m.indexOf("Recorte que estimaste: " + money(8000)) !== -1 && h1m.indexOf("Diferencia actual entre ingresos y gastos: " + money(5000)) !== -1 &&
    !/cubr(e|ís|is|iste)|alcanza|cerr/i.test(h1m.slice(h1m.indexOf("data-v2i-summary"))), h1m.slice(h1m.indexOf("data-v2i-summary"), h1m.indexOf("data-v2i-summary") + 300));
  var c2 = await stateFor("MANTENIMIENTO_FLOW_ZERO");
  var h2 = ui.renderPanel(c2);
  check("[2] MANT flow 0: same expense primitive, 'generar margen' context, no gap line",
    widgets(h2).join() === "expense" && /Generar margen/.test(h2) && h2.indexOf("data-v2i-summary=\"gap\"") === -1);
  var c3 = await stateFor("CONTENCION_WITH_DEBT");
  var h3 = ui.renderPanel(c3);
  all.push(h3);
  check("[2] CONTENCION with eligible debt: both levers plus a note that neither one alone is guaranteed to close the gap",
    /data-v2i-note="two-levers"/.test(h3) && /ninguno por sí solo asegura/.test(h3) && h3.indexOf("Cuota actual: " + money(15000)) !== -1, h3.slice(0, 600));

  // ---- [3] REGULARIZACION contact step ----
  var r0 = ui.renderPanel(await stateFor("REGULARIZACION"));
  var rp = ui.renderPanel(await stateFor("REGULARIZACION", { creditor_contact_step: [{ event_id: "c", debt_index: 0, state: "planned", seq: 1, created_at: "t" }] }));
  var rc = ui.renderPanel(await stateFor("REGULARIZACION", { creditor_contact_step: [{ event_id: "c", debt_index: 0, state: "contacted", seq: 2, created_at: "t" }] }));
  all.push(r0, rp, rc);
  function btns(html) {
    return (html.match(/data-v2i="contact" data-index="0" data-state="[a-z]+"/g) || []).map(function (s) { return s.split('data-state="')[1].slice(0, -1); });
  }
  check("[3] REGULARIZACION: none -> 'Voy a contactar' + 'Ya lo contacté'; planned -> 'Ya lo contacté' + 'Deshacer'; contacted -> 'Voy a contactar' + " +
    "'Deshacer' + link to the existing debts tab; next steps list the registered step",
    eq(btns(r0), ["planned", "contacted"]) && eq(btns(rp), ["contacted", "none"]) && eq(btns(rc), ["planned", "none"]) &&
    /Voy a contactar al acreedor/.test(r0) && /Ya lo contacté/.test(r0) && r0.indexOf("data-v2i=\"open-debts\"") === -1 &&
    rc.indexOf("data-v2i=\"open-debts\"") !== -1 && /Contactar al acreedor de Deuda #1/.test(rp) && /Contactaste al acreedor de Deuda #1/.test(rc) &&
    r0.indexOf("data-v2i-widget=\"next-steps\"") === -1, { r0: btns(r0), rp: btns(rp), rc: btns(rc) });

  // ---- [4] next steps from the server's financial_actions ----
  var withActions = await stateFor("CONTENCION_WITH_DEBT", { lower_payment_intent: [{ event_id: "l", debt_index: 0, seq: 1, created_at: "t" }],
    expense_reduction_intent: [{ event_id: "e", expense_ref: "vivienda", amount: 4000, seq: 1, created_at: "t" }] });
  var hA = ui.renderPanel(withActions, { debtLabel: function () { return "Banco QA"; } });
  var cons = await stateFor("CONSOLIDACION", { surplus_allocation: { event_id: "s", choice_type: "surplus_to_debt", debt_index: 0, amount: 20000, seq: 1, created_at: "t" } });
  var hC = ui.renderPanel(cons, { debtLabel: function () { return "Banco QA"; } });
  var mant = await stateFor("MANTENIMIENTO_SURPLUS", { surplus_allocation: { event_id: "s", choice_type: "surplus_reserve", reserve_destination: "planned_goal", amount: 20000, seq: 1, created_at: "t" } });
  var hM = ui.renderPanel(mant);
  all.push(hA, hC, hM);
  check("[4] 'Tus próximos pasos' renders each server action: lower payment request, expense target (declared, with the current expense), " +
    "extra debt payment, monthly reserve",
    withActions.financial_actions.length === 2 &&
    hA.indexOf("Pedir una cuota más baja para Banco QA (hoy pagás " + money(15000) + " por mes).") !== -1 &&
    hA.indexOf("Intentar recortar " + money(4000) + " por mes en Vivienda (gasto actual " + money(40000) + ").") !== -1 &&
    hC.indexOf("Destinar " + money(20000) + " por mes a pagar más de Banco QA.") !== -1 &&
    hM.indexOf("Reservar " + money(20000) + " por mes para una meta planificada.") !== -1, { hA: hA.slice(hA.indexOf("next-steps")) });
  var hCsel = (hC.match(/<select[\s\S]*?<\/select>/) || [""])[0];
  var hMsel = (hM.match(/<select[\s\S]*?<\/select>/) || [""])[0];
  check("[4] surplus allocator: CONSOLIDACION offers its active debts + 2 reserves, MANT only the 2 reserves; the user's current choice is selected; " +
    "amount input empty, cap shown",
    /value="debt:0" selected/.test(hCsel) && /value="reserve:emergency_fund"/.test(hCsel) && hMsel.indexOf("debt:") === -1 &&
    /value="reserve:planned_goal" selected/.test(hMsel) && /placeholder="Monto por mes \(hasta /.test(hM) &&
    (hM.match(/<input[^>]*data-v2i-input="amount"[^>]*>/) || [""])[0].indexOf(' value=""') !== -1, { hCsel: hCsel, hMsel: hMsel });

  // ---- [5] copy rules + escaping ----
  var hostile = ui.renderPanel(withActions, { debtLabel: function () { return '<img src=x onerror="alert(1)">'; } });
  check("[5] no 'ahorro conseguido' / automatic potential / elimination / solved / agreement / refinancing / offer wording in any render (" + all.length + " renders)",
    all.every(function (h) { return !FORBIDDEN.test(h.replace(/<[^>]+>/g, " ")); }),
    all.map(function (h) { var m = FORBIDDEN.exec(h.replace(/<[^>]+>/g, " ")); return m && m[0]; }).filter(Boolean));
  check("[5] user-provided debt names are HTML-escaped", hostile.indexOf("<img") === -1 && hostile.indexOf("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;") !== -1);

  // ---- [6] request bodies ----
  check("[6] bodies: expense marked / unmarked (no amount), contact, lower, surplus to debt / reserve; unknown targets rejected; diagnosis_id as provenance",
    eq(ui.bodies.expense("custom:1", 3000, DIAG), { choice_type: "expense_reduction_intent", expense_ref: "custom:1", state: "marked", amount: 3000, diagnosis_id: DIAG }) &&
    eq(ui.bodies.expense("vivienda", null, null), { choice_type: "expense_reduction_intent", expense_ref: "vivienda", state: "unmarked" }) &&
    eq(ui.bodies.contact(0, "contacted", DIAG), { choice_type: "creditor_contact_step", debt_index: 0, state: "contacted", diagnosis_id: DIAG }) &&
    eq(ui.bodies.lower(2, "unmarked", null), { choice_type: "lower_payment_intent", debt_index: 2, state: "unmarked" }) &&
    eq(ui.bodies.surplus("debt:1", 100, null), { choice_type: "surplus_to_debt", debt_index: 1, amount: 100 }) &&
    eq(ui.bodies.surplus("reserve:emergency_fund", 100, null), { choice_type: "surplus_reserve", destination: "emergency_fund", amount: 100 }) &&
    ui.bodies.surplus("reserve:invest", 1, null) === null && ui.bodies.surplus("debt:-1", 1, null) === null && ui.bodies.surplus("", 1, null) === null);

  // ---- [7] amounts typed by people (config.js parseHumanAmount) ----
  check("[7] amounts: '5.000' / '5000' / '$ 5.000,5' accepted; '5000.50' and '5,000' rejected (Uruguay format); empty -> EMPTY; " +
    "0 or above the current expense -> AMOUNT_OUT_OF_RANGE; = current OK",
    ui.parseAmountInput("5.000").value === 5000 && ui.parseAmountInput("5000").value === 5000 && ui.parseAmountInput("$ 5.000,5").value === 5000.5 &&
    ui.parseAmountInput("5000.50").error === "INVALID_AMOUNT" && ui.parseAmountInput("5,000").error === "INVALID_AMOUNT" && ui.parseAmountInput(" ").error === "EMPTY" &&
    ui.validateAmount("0", 40000).error === "AMOUNT_OUT_OF_RANGE" && ui.validateAmount("40.000,01", 40000).error === "AMOUNT_OUT_OF_RANGE" &&
    ui.validateAmount("40.000", 40000).value === 40000);

  // ---- [8] off by default ----
  check("[8] without the flag (and outside a browser) the module is disabled and mount / refresh are no-ops",
    ui.isEnabled() === false && (function () { try { ui.mount(null); ui.refresh(); return true; } catch (_e) { return false; } })());
  var cfgFlag = /\nvar CZ_V2_INTERACTION_ENABLED = false;\r?\n/.test(configSrc);
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  check("[8] config.js ships CZ_V2_INTERACTION_ENABLED = false; index.html loads v2Interaction.js right after shadowDiagnosis.js and before app.js",
    cfgFlag && /shadowDiagnosis\.js"><\/script>\s*<script src="\/js\/v2Interaction\.js"><\/script>/.test(html) &&
    html.indexOf("v2Interaction.js") < html.indexOf("/js/app.js"));

  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log("V2_INTERACTION_UI_TEST: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
