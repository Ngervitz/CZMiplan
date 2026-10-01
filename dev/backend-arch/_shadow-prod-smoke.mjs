/**
 * One-shot B3-SHADOW-PROD smoke against live Vercel (no query params).
 * Not part of npm scripts; run after deploy confirmation.
 * Writes through the remote backend: SUPABASE_URL must name the database that backend
 * writes to, and it must be allowlisted (server/testing/liveWriteGuard.js).
 */
import { createRequire } from "module";
import { chromium } from "playwright";

createRequire(import.meta.url)("../../server/testing/liveWriteGuard.js")
  .requireLiveWriteAllowedOrExit("_shadow-prod-smoke");

const FRONTEND = "https://cz-miplan2.vercel.app/";
const BACKEND = "https://backend-production-17f9.up.railway.app";
const SMOKE_NAME = "QA B3-SHADOW-PROD-01";
const SMOKE_EMAIL = "qa-b3-shadow-prod@example.test";

const out = {
  enabled: false,
  api: null,
  shadow_request: false,
  http_status: null,
  diagnosis_id: null,
  parity: null,
  duplicate_second: null,
  failure_non_blocking: null,
  ux_authority: null,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => {
  const t = msg.text();
  if (!t.includes("[CZ_SHADOW]")) return;
  try {
    const json = JSON.parse(t.replace(/^\[CZ_SHADOW\]\s*/, ""));
    if (!out._firstParity && (json.status === "MATCH" || json.status === "MISMATCH")) {
      out._firstParity = json.status;
      out.parity = json.status;
      if (json.diagnosis_id) out.diagnosis_id = json.diagnosis_id;
      if (json.diff_paths) out.diff_paths = json.diff_paths;
    }
    if (json.status === "SHADOW_ERROR" && json.reason === "failure_test") {
      out.failure_console = "SHADOW_ERROR";
    }
  } catch (_) {}
});

const shadowResponse = page.waitForResponse(
  (r) => r.url().includes("/v1/diagnoses") && r.request().method() === "POST" && !r.url().includes("shadow-result"),
  { timeout: 30000 }
);
const telemetryResponse = page.waitForResponse(
  (r) => r.url().includes("/shadow-result") && r.request().method() === "POST",
  { timeout: 30000 }
);

await page.goto(
  FRONTEND +
    "?ingreso=100000&laboral=relacion_dependencia&nombre=" +
    encodeURIComponent(SMOKE_NAME) +
    "&email=" +
    encodeURIComponent(SMOKE_EMAIL) +
    "&p1=A&p2=A&p3=A&p4=A&p5=A&p6=A&p7=A&p8=A&p9=A&p10=A",
  { waitUntil: "domcontentloaded", timeout: 60000 }
);

const meta = await page.evaluate(() => {
  return {
    enabled: !!(window.CZShadowDiagnosis && window.CZShadowDiagnosis.isShadowEnabled()),
    api: window.CZShadowDiagnosis ? window.CZShadowDiagnosis.getApiBaseUrl() : null,
    mode: typeof CZ_SHADOW_MODE !== "undefined" ? CZ_SHADOW_MODE : null,
    host: location.hostname,
    search: location.search,
  };
});
out.enabled = meta.enabled;
out.api = meta.api;

if (!meta.enabled) {
  console.log(JSON.stringify({ ...out, meta, error: "shadow_not_enabled" }, null, 2));
  await browser.close();
  process.exit(2);
}

// Build a dashboard-ready state and fire shadow without relying on full UI funnel timing.
await page.evaluate(
  ({ name, email }) => {
    const st = window.CZState || {};
    st.step = 3;
    st.declared_nombre = name;
    st.declared_email = email;
    st.declared_laboral = "relacion_dependencia";
    st.declared_ingreso = 100000;
    st.gastos = { vivienda: 15000, alimentacion: 10000, transporte: 5000 };
    st.custom_expenses = [];
    st.deudas = [
      {
        id: "d1",
        acreedor: "Banco QA",
        acreedor_raw: "Banco QA",
        monto: 40000,
        pago: 3000,
        tipo: "prestamo",
        situacion_ui: "pagando_normal",
        estado: "al_dia",
        pago_fuente: "declarado",
        cancelada: false,
        debt_confidence: "high",
      },
    ];
    st.snap = { fecha_inicio: "2026-08-02T12:00:00.000Z" };
    st.no_debts_declared = false;
    st.financial_income_complete = true;
    st.financial_profile_complete = true;
    st.financial_debts_complete = true;
    st.financial_expenses_complete = true;
    if (typeof assignMotorDiagnosis === "function") {
      assignMotorDiagnosis(st);
    } else if (typeof calcularMotor === "function") {
      st.diag = calcularMotor();
    }
    window.CZState = st;
    if (window.CZShadowDiagnosis && window.CZShadowDiagnosis._resetDedupeForTests) {
      window.CZShadowDiagnosis._resetDedupeForTests();
    }
    window.CZShadowDiagnosis.maybeShadowDiagnosis(st, "dashboard_generated");
  },
  { name: SMOKE_NAME, email: SMOKE_EMAIL }
);

const res = await shadowResponse;
out.shadow_request = true;
out.http_status = res.status();
let body = null;
try {
  body = await res.json();
} catch (_) {}
if (body && body.diagnosis_id) out.diagnosis_id = body.diagnosis_id;

let tel = null;
try {
  tel = await telemetryResponse;
  out.telemetry_status = tel.status();
  out.telemetry_body = await tel.json().catch(() => null);
} catch (e) {
  out.telemetry_status = "TIMEOUT";
}

await page.waitForTimeout(1500);
const statsAfterFirst = await page.evaluate(() =>
  window.CZShadowDiagnosis ? window.CZShadowDiagnosis.getStats() : null
);
if (statsAfterFirst && statsAfterFirst.last_status) {
  out.parity = statsAfterFirst.last_status;
  out.diagnosis_id = statsAfterFirst.last_diagnosis_id || out.diagnosis_id;
  out.diff_paths = statsAfterFirst.last_diff_paths || null;
}
out.ux_authority = await page.evaluate(() => {
  const st = window.CZState;
  return !!(st && st.diag && st.diag.planId != null);
});

// Dedupe: second call same fingerprint must not POST again
let secondHit = false;
const onReq = (req) => {
  if (req.url().includes("/v1/diagnoses") && req.method() === "POST") secondHit = true;
};
page.on("request", onReq);
await page.evaluate(() => {
  window.CZShadowDiagnosis.maybeShadowDiagnosis(window.CZState, "recalc");
});
await page.waitForTimeout(800);
page.off("request", onReq);
out.duplicate_second = secondHit ? "FAIL" : "PASS";

// Failure non-blocking: dead API must not wipe client diag
await page.evaluate(() => {
  if (window.CZShadowDiagnosis && window.CZShadowDiagnosis._resetDedupeForTests) {
    window.CZShadowDiagnosis._resetDedupeForTests();
  }
  window.CZ_BACKEND_API_URL = "https://127.0.0.1:9";
  window.CZState.gastos = Object.assign({}, window.CZState.gastos, {
    otros_smoke_fail: Date.now(),
  });
  window.CZShadowDiagnosis.maybeShadowDiagnosis(window.CZState, "failure_test");
});
await page.waitForTimeout(2500);
out.failure_non_blocking = await page.evaluate(() => {
  const st = window.CZState;
  return st && st.diag && st.diag.planId != null ? "PASS" : "FAIL";
});

const ok =
  out.shadow_request &&
  out.http_status === 200 &&
  out.parity === "MATCH" &&
  out.duplicate_second === "PASS" &&
  out.failure_non_blocking === "PASS";
console.log(JSON.stringify({ ...out, backend_expected: BACKEND, ok }, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
