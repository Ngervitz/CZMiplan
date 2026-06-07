/* Punto 4 — persistence round-trip QA. Run: node scripts/test-persistence-qa.js */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const storage = new Map();

global.localStorage = {
  setItem(k, v) { storage.set(k, v); },
  getItem(k) { return storage.has(k) ? storage.get(k) : null; },
  removeItem(k) { storage.delete(k); },
};

global.window = {
  CZState: null,
  location: { search: "" },
  CredizonaUI: { renderAll: () => {}, renderTab: () => {} },
};
global.location = global.window.location;
global.document = { addEventListener: () => {} };
global.PRE = { ingreso: 55000, respuestas: {} };
global.TIENE_ENCUESTA = true;
global.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
global.INPUT_SOURCES = { DECLARED: "DECLARED", SIMULATED: "SIMULATED", VERIFIED: "VERIFIED" };
global.getTotalMonthlyExpenses = () => 26000;
global.getCustomExpensesIncludedTotal = () => 0;
global.sanitizeCustomExpensesForSave = (x) => x || [];
global.trackEvent = () => {};
global.trackCRMEvent = () => {};
global.enviarCRM = () => {};
global.loadBehavioralDataFromCRM = async () => null;
global.handlePlusPaymentReturn = () => {};
global.preloadUserEmailFromUrl = () => {};
global.detectReturnSource = () => "direct";
global.setRecoveryState = () => {};
global.migrateGastosKeys = (g) => g || {};

function load(file) {
  try {
    vm.runInThisContext(
      fs.readFileSync(path.join(root, file), "utf8").replace(/\bconst /g, "var "),
      { filename: path.join(root, file) }
    );
  } catch (e) {
    throw new Error(file + ": " + e.message);
  }
}

["js/config.js", "js/creditors.js", "js/survey.js", "js/algorithms.js"].forEach(load);
if (typeof calcularMotor !== "function") {
  throw new Error("calcularMotor missing after algorithms load");
}

const appSrc = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
vm.runInThisContext(
  appSrc.slice(appSrc.indexOf("function isDebtDraftAdd"), appSrc.indexOf("function createEmptyDebtObject")),
  { filename: "app-debt-persist.js" }
);
const navMarker = "// =============================================================================\r\n// NAVEGACION";
const navIdx = appSrc.indexOf(navMarker);
if (navIdx === -1) throw new Error("NAVEGACION marker not found");
vm.runInThisContext(
  appSrc.slice(appSrc.indexOf("window.guardarLocal = function"), navIdx),
  { filename: "app-guardarLocal.js" }
);

function debt(o) {
  return Object.assign({
    tipo: "tarjeta",
    acreedor: "OCA",
    acreedor_raw: "OCA",
    acreedor_display: "OCA",
    monto: 45000,
    pago: 3500,
    estado: "al_dia",
    situacion_ui: "pagando_normal",
    pago_fuente: "declarado",
    atraso_tiempo: null,
    debt_confidence: "high",
    _source: "DECLARED",
    _saved: true,
  }, o);
}

function buildTestState() {
  window.CZState = JSON.parse(JSON.stringify({
    step: 3,
    gastos: { alquiler: 15000, alimentacion: 9000, servicios: 2000 },
    custom_expenses: [],
    deudas: [debt()],
    editing_debt_index: null,
    diag: null,
    snap: { fecha_inicio: "2026-01-01T00:00:00.000Z", score_reset: 10, nivel: "R2", plan_id: 4 },
    saldoIni: 45000,
    tab: "herramientas",
    plus_purchased: true,
    plus_status: "PLUS_READY",
    plus_report_id: "plus_test_1",
    plus_purchased_at: "2026-05-01T00:00:00.000Z",
    plus_informe: { seccion_1_resumen_ejecutivo: { situacion_general: "Test" } },
    user_email: "test@example.com",
    herr: {
      ingresos: { formal: 55000, extras: [{ tipo: "Changa", monto: 8000 }], total: 63000 },
      gastos_cls: { alquiler: "fijo", alimentacion: "ajustable" },
      gestiones: { OCA: { resultado: "sin_acuerdo" } },
      compromisos: { acc_1: true },
      semaforo: { nueva_deuda: false, pago_minimos: true, flujo_positivo: true },
      habitos: { "2026-05-20": true },
      atrasos: { OCA: "menos_30" },
      vencimientos: {},
    },
    gastos_missing_confirmed: false,
    consent: { accepted: true, version: "v1" },
    feedback_suggestions: ["test"],
    first_assessment_at: "2026-05-01T00:00:00.000Z",
    temporal: { session_count: 2 },
  }));
  window.CZState.diag = calcularMotor();
  window.CZState.snap.plan_id = window.CZState.diag.planId;
  return window.CZState;
}

function restoreFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function simulateInitRestore(saved) {
  const st = JSON.parse(JSON.stringify({
    step: 0,
    gastos: {},
    deudas: [],
    herr: {
      ingresos: { formal: 0, extras: [], total: 0 },
      gastos_cls: {},
      gestiones: {},
      compromisos: {},
      semaforo: {},
      habitos: {},
      atrasos: {},
      vencimientos: {},
    },
  }));
  if (!saved || !saved.diag) return st;

  st.step = 3;
  st.gastos = saved.gastos || {};
  st.deudas = saved.deudas || [];
  st.diag = saved.diag;
  st.snap = saved.snap || null;
  st.saldoIni = saved.saldoIni || 0;
  st.tab = saved.tab || "plan";
  st.plus_purchased = !!saved.plus_purchased;
  st.plus_status = saved.plus_status;
  st.plus_report_id = saved.plus_report_id;
  st.plus_purchased_at = saved.plus_purchased_at;
  st.plus_informe = saved.plus_informe;
  st.user_email = saved.user_email;
  if (saved.herr) st.herr = saved.herr;
  st.gastos_missing_confirmed = !!saved.gastos_missing_confirmed;
  if (saved.consent) st.consent = saved.consent;
  if (saved.feedback_suggestions) st.feedback_suggestions = saved.feedback_suggestions;
  return st;
}

const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? " (" + detail + ")" : ""));
}

buildTestState();
window.guardarLocal();
const saved = restoreFromStorage();
const restored = simulateInitRestore(saved);

check("localStorage cr_v3 written", !!saved, STORAGE_KEY);
check("diag persists", !!saved.diag && saved.diag.planId === window.CZState.diag.planId, "planId=" + (saved.diag && saved.diag.planId));
check("deudas persist", saved.deudas.length === 1 && saved.deudas[0].monto === 45000);
check("gastos persist", saved.gastos.alquiler === 15000);
check("tab persists", saved.tab === "herramientas");
check("herr.ingresos.extras persist", saved.herr.ingresos.extras[0].monto === 8000);
check("herr.gastos_cls persist", saved.herr.gastos_cls.alimentacion === "ajustable");
check("herr.semaforo persist", saved.herr.semaforo.flujo_positivo === true);
check("herr.gestiones persist", saved.herr.gestiones.OCA.resultado === "sin_acuerdo");
check("plus_informe persists", saved.plus_informe.seccion_1_resumen_ejecutivo.situacion_general === "Test");
check("plus_status persists", saved.plus_status === "PLUS_READY");
check("restore → herr round-trip", restored.herr.ingresos.total === 63000);
check("restore → diag intact", restored.diag.planId === saved.diag.planId);

// Plan 4 sim UI: actualizarSimuladorFlujo() does not write st.herr nor guardarLocal
check(
  "Plan 4 slider/comp not in herr schema (UI-only sim)",
  saved.herr.liberar_monto === undefined && saved.herr.ingreso_comp === undefined,
  "expected until wired to st.herr + guardarLocal"
);

// Draft debt excluded
const st2 = buildTestState();
st2.deudas.push(debt({ monto: "", _is_draft_add: true }));
window.guardarLocal();
const saved2 = restoreFromStorage();
check("draft debt NOT persisted", saved2.deudas.length === 1);

const failed = checks.filter((c) => !c.ok);
console.log("\n---");
console.log("Total:", checks.length, "| Failed:", failed.length);
if (failed.length) process.exit(1);
