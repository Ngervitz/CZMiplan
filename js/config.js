// =============================================================================
// config.js — Constantes globales del producto
// No depende de ningun otro archivo JS.
// =============================================================================

const ALGORITHM_VERSION = "reset_v3_dark";
const STORAGE_KEY       = "cr_v3";
const API_TOKEN         = "REEMPLAZAR_CON_TOKEN_REAL"; // TODO IT

// Per-module algorithm version constants — used by buildDiagnosisSnapshot()
const BEHAVIORAL_ALGORITHM_VERSION  = "survey_v2_simple";
const FINANCIAL_ALGORITHM_VERSION   = "financial_v3_dark";
const HORIZON_ALGORITHM_VERSION     = "horizon_v1";
const INTERPRETATION_ENGINE_VERSION = "interpretation_v1";

// =============================================================================
// Sprint 8 — Score guardrail constants
// Applied post-calculation as a final output cap only.
// Raw scores are always preserved alongside capped values.
// Configurable here; DO NOT hardcode these thresholds elsewhere.
// Values are starting points — will be tuned after first traffic phase.
// =============================================================================
var SEVERITY_CRITICO_SCORE_FIN_MAX   = 8;
var SEVERITY_CRITICO_SCORE_RESET_MAX = 11;

// Input source taxonomy — classifies where each data point came from
// DECLARED:  user-entered directly
// SIMULATED: slider / temporary simulation (does NOT affect score/risk)
// VERIFIED:  future Equifax-confirmed data (not yet implemented)
const INPUT_SOURCES = Object.freeze({
  DECLARED:  "DECLARED",
  SIMULATED: "SIMULATED",
  VERIFIED:  "VERIFIED",
});

// UUID v4 generator — used by identity layer and snapshot system
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const API = {
  guardar:  "https://api.credizona.com.uy/api/reset/guardar",   // TODO IT
  clearing: "https://api.credizona.com.uy/api/reset/clearing",  // TODO IT
  pago:     "https://api.credizona.com.uy/api/reset/pago",      // TODO IT
  ia:       "https://api.credizona.com.uy/api/reset/ia",        // TODO IT
};

const SURVEY_URL = "https://credizona.com.uy/encuesta"; // TODO IT: reemplazar con URL real de encuesta

const SITUACION_LABELS = {
  relacion_dependencia:  "Relacion de dependencia",
  monotributista:        "Monotributista",
  responsable_inscripto: "Responsable inscripto",
  informal:              "Trabajo informal",
  desempleado:           "Sin ingreso fijo",
};

// --- Helpers de formato ---
function fmt(n) {
  return "$" + Number(n || 0).toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// --- Helpers de color ---
function colorScore(s)  { return s >= 21 ? "#34ffaf" : s >= 13 ? "#ffd36f" : "#ff4e72"; }
function colorNivel(n)  { return n === "A" ? "#34ffaf" : n === "B+" ? "#a78bfa" : n === "B" ? "#ffd36f" : "#ff4e72"; }
function colorRiesgo(r) { return r === "Critico" ? "#ff4e72" : r === "Medio" ? "#ffd36f" : "#34ffaf"; }
function nivelTexto(n)  { return n === "A" ? "Manejable" : n === "B+" ? "Muy bueno" : n === "B" ? "En proceso" : "Requiere accion"; }

// --- Pre-loaded data desde URL params ---
function getPreLoaded() {
  const p = new URLSearchParams(window.location.search);
  const resp = {};
  for (let i = 1; i <= 10; i++) resp["p" + i] = p.get("p" + i) || null;
  return {
    nombre:   p.get("nombre")   || "Martin Rodriguez",
    cedula:   p.get("cedula")   || "3.456.789-0",
    email:    p.get("email")    || "martin@email.com",
    telefono: p.get("telefono") || "",
    ingreso:  parseFloat(p.get("ingreso")) || 65000,
    laboral:  p.get("laboral")  || "relacion_dependencia",
    monto:    parseFloat(p.get("monto"))   || 0,
    respuestas: resp,
  };
}

const PRE = getPreLoaded();

const TIENE_ENCUESTA = Object.values(PRE.respuestas).some(v => v !== null);

const SEGMENTO = (() => {
  const tieneIngreso = !!new URLSearchParams(window.location.search).get("ingreso");
  if (tieneIngreso && TIENE_ENCUESTA) return 1;
  if (tieneIngreso && !TIENE_ENCUESTA) return 2;
  return 3;
})();

// =============================================================================
// Legal consent constants
// =============================================================================
const LEGAL_VERSION_TC             = "TC_v2.0_202605";
const LEGAL_VERSION_DISCLAIMER     = "DISC_v2.0_202605";
const LEGAL_VERSION_PRIVACY        = "PP_v2.0_202605";
const CONSENT_STORAGE_KEY          = "cz_consent_v1";
const MIPLAN_UNAUTHORIZED_REDIRECT = "https://credizona.com.uy";

// Sprint 14.0 — Mi Plan Plus feature flags (IT flips when Handy / Equifax ready)
var CZ_PLUS_PAYMENT_LIVE = false;
var CZ_PLUS_BCU_CLEARING_LIVE = false;
var CZ_HANDY_ENDPOINT = "";

// Consent event names
const CZ_CONSENT_EVENTS = Object.freeze({
  LEGAL_ACCEPTED:    "legal_accepted",
  LEGAL_RESTORED:    "legal_restored_session",
  OUTSIDE_FUNNEL:    "outside_funnel_redirect",
  // Reserved for future implementation — do not implement now
  CONSENT_REVOKED:   "consent_revoked",
  MARKETING_OPTOUT:  "marketing_optout",
  OPERATIONAL_OPTOUT:"operational_optout",
});
