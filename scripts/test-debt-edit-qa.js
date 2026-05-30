/* One-off QA for Sprint 12.2 — run: node scripts/test-debt-edit-qa.js */
global.window = { location: { search: "" }, CZState: { step: 2, deudas: [], gastos: {} } };
global.PRE = { ingreso: 80000, respuestas: {} };
global.TIENE_ENCUESTA = true;
global.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
global.TASAS = { tarjeta: 62 };
global.INPUT_SOURCES = { DECLARED: "DECLARED" };
global.getTotalMonthlyExpenses = () => 0;
global.trackCRMDebtEvent = () => {};
global.window.CredizonaUI = { renderTab: () => {}, renderDeudaCard: () => "", renderAll: () => {}, actualizarMetrics: () => {} };

const fs = require("fs");
const root = require("path").join(__dirname, "..");
function load(p) {
  eval(fs.readFileSync(require("path").join(root, p), "utf8").replace(/const /g, "var "));
}
load("js/config.js");
load("js/creditors.js");
load("js/survey.js");
load("js/algorithms.js");
// Load helpers from app.js (functions only)
const appSrc = fs.readFileSync(require("path").join(root, "js/app.js"), "utf8");
const start = appSrc.indexOf("function refreshDebtCardsUI");
const end = appSrc.indexOf("// =============================================================================\n// STORAGE");
eval(appSrc.slice(start, end));
global.recalcDiagYGuardar = function () {
  if (typeof calcularMotor === "function") window.CZState.diag = calcularMotor();
};

function debt(o) {
  return Object.assign({
    tipo: "tarjeta", acreedor: "OCA", acreedor_raw: "OCA", acreedor_display: "OCA",
    monto: "", pago: "", estado: "al_dia", situacion_ui: null, pago_fuente: null,
    atraso_tiempo: null, ultimo_pago_declarado: null, debt_confidence: null, _source: "DECLARED",
  }, o);
}

const st = window.CZState;

// A
st.deudas = [debt({ monto: 90000, pago: 5000, situacion_ui: "pagando_normal", pago_fuente: "declarado", debt_confidence: "high" })];
st._deuda_edit_snapshot = JSON.parse(JSON.stringify(st.deudas[0]));
st.editing_debt_index = 0;
st.deudas[0].pago = 9000;
finalizeDebtEdit(0);
console.log("A", { count: st.deudas.length, pago: st.deudas[0].pago, editing: st.editing_debt_index, totalPago: calcularFinanciero().totalPago });

// B
st.deudas = [debt({ monto: 50000, pago: 5000, situacion_ui: "pagando_normal", pago_fuente: "declarado", debt_confidence: "high" })];
applySituacionUiChange(st.deudas[0], "deje_pagar");
st.deudas[0].atraso_tiempo = "mas_90";
sanitizeDebtFieldsForSituacion(st.deudas[0]);
enriquecerDeuda(st.deudas[0]);
console.log("B", { pago: st.deudas[0].pago, atraso: st.deudas[0].atraso_tiempo, estado: st.deudas[0].estado, pf: st.deudas[0].pago_fuente });

// C
st.deudas = [debt({ monto: 50000, pago: 0, situacion_ui: "mora_reclamo", pago_fuente: "mora_sin_pago", atraso_tiempo: "menos_30", estado: "mora", debt_confidence: "high" })];
applySituacionUiChange(st.deudas[0], "pagando_normal");
st.deudas[0].pago = 4000;
sanitizeDebtFieldsForSituacion(st.deudas[0]);
enriquecerDeuda(st.deudas[0]);
console.log("C", { pago: st.deudas[0].pago, atraso: st.deudas[0].atraso_tiempo, situacion: st.deudas[0].situacion_ui });

// D
st.deudas = [debt({ monto: 120000, pago: 3000, situacion_ui: "pagando_normal", pago_fuente: "declarado", debt_confidence: "high" })];
st._deuda_edit_snapshot = JSON.parse(JSON.stringify(st.deudas[0]));
st.deudas[0].monto = 200000;
finalizeDebtEdit(0);
console.log("D", { count: st.deudas.length, monto: st.deudas[0].monto, conf: st.deudas[0].debt_confidence, deuda: calcularFinanciero().totalDeuda });
