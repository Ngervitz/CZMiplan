// =============================================================================
// config.js — Constantes globales del producto (deploy-safe, sin secretos)
// No depende de ningun otro archivo JS.
//
// Secretos (API tokens, Claude key) NO van aquí. Inyectar en deploy/CI si
// hace falta, o usar js/config.local.js en desarrollo (gitignored).
// =============================================================================

const ALGORITHM_VERSION = "reset_v3_dark";
const STORAGE_KEY       = "cr_v3";
const API_TOKEN         = "";

// DECISION-PROVENANCE-01 — additive explainability (default off; safe for production)
// When true, may set financial_stage_provenance / action selection+retention / next_step_provenance.
// Must not alter financial_stage / next_step / acciones functional values.
var CZ_DECISION_PROVENANCE = false;

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
  guardar:  "https://api.credizona.com.uy/api/reset/guardar",
  clearing: "https://api.credizona.com.uy/api/reset/clearing",
  pago:     "https://api.credizona.com.uy/api/reset/pago",
  ia:       "https://api.credizona.com.uy/api/reset/ia",
};

const SURVEY_URL = "https://credizona.com.uy/encuesta";

const SITUACION_LABELS = {
  relacion_dependencia:  "Relacion de dependencia",
  monotributista:        "Monotributista",
  responsable_inscripto: "Responsable inscripto",
  informal:              "Trabajo informal",
  desempleado:           "Sin ingreso fijo",
  jubilado:              "Jubilado / pensionista",
};

var BASIC_PROFILE_LABORAL_OPTIONS = [
  { v: "relacion_dependencia", l: "Empleado en relación de dependencia" },
  { v: "monotributista",       l: "Independiente / cuentapropista" },
  { v: "jubilado",             l: "Jubilado / pensionista" },
  { v: "desempleado",          l: "Sin ingresos fijos" },
];

var PROFILE_LABORAL_VALUES = BASIC_PROFILE_LABORAL_OPTIONS.map(function(o) { return o.v; });

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
function sanitizeUrlEmail(raw) {
  if (raw == null || raw === "") return null;
  var e = String(raw).trim().toLowerCase();
  if (e.indexOf("@") < 1 || e.indexOf(".") < 0) return null;
  return e;
}

function hasUrlIngresoParam() {
  var p = new URLSearchParams(window.location.search);
  return p.has("ingreso") && p.get("ingreso") !== "";
}

function parseUrlIngresoValue() {
  if (!hasUrlIngresoParam()) return 0;
  var n = parseFloat(new URLSearchParams(window.location.search).get("ingreso"));
  return isNaN(n) ? 0 : n;
}

function hasUrlNombreParam() {
  var n = new URLSearchParams(window.location.search).get("nombre");
  return n != null && String(n).trim() !== "";
}

function hasUrlEmailParam() {
  var raw = new URLSearchParams(window.location.search).get("email");
  return sanitizeUrlEmail(raw) != null;
}

function hasUrlLaboralParam() {
  var l = new URLSearchParams(window.location.search).get("laboral");
  return l != null && String(l).trim() !== "";
}

function hasUrlCedulaParam() {
  var c = new URLSearchParams(window.location.search).get("cedula");
  return c != null && String(c).trim() !== "";
}

function isDemoPreloadedName(name) {
  return String(name || "").trim() === "Martin Rodriguez"
    && typeof hasUrlNombreParam === "function"
    && !hasUrlNombreParam();
}

function isDemoPreloadedEmail(email) {
  return String(email || "").trim().toLowerCase() === "martin@email.com"
    && typeof hasUrlEmailParam === "function"
    && !hasUrlEmailParam();
}

function isDemoPreloadedCedula(cedula) {
  return String(cedula || "").trim() === "3.456.789-0"
    && typeof hasUrlCedulaParam === "function"
    && !hasUrlCedulaParam();
}

/**
 * ENTRY-01 — virgin / direct users must not inherit demo PII.
 * Prefill only from real URL params (or empty).
 * cedula/telefono/monto stay client-side PRE only — not EngineInput.
 */
function getPreLoaded() {
  const p = new URLSearchParams(window.location.search);
  const resp = {};
  for (let i = 1; i <= 10; i++) {
    var raw = p.get("p" + i);
    if (raw == null || String(raw).trim() === "") {
      resp["p" + i] = null;
      continue;
    }
    var up = String(raw).trim().toUpperCase();
    resp["p" + i] = (up === "A" || up === "B" || up === "C" || up === "D") ? up : null;
  }
  var emailParam = p.get("email");
  var emailFromUrl = sanitizeUrlEmail(emailParam);
  var nombreRaw = p.get("nombre");
  var laboralRaw = p.get("laboral");
  var cedulaRaw = p.get("cedula");
  var telefonoRaw = p.get("telefono");
  var montoN = parseFloat(p.get("monto"));
  return {
    nombre:   (nombreRaw != null && String(nombreRaw).trim() !== "") ? String(nombreRaw).trim() : "",
    cedula:   (cedulaRaw != null && String(cedulaRaw).trim() !== "") ? String(cedulaRaw).trim() : "",
    email:    emailFromUrl != null ? emailFromUrl : "",
    telefono: (telefonoRaw != null && String(telefonoRaw).trim() !== "") ? String(telefonoRaw).trim() : "",
    ingreso:  parseUrlIngresoValue(),
    laboral:  (laboralRaw != null && String(laboralRaw).trim() !== "") ? String(laboralRaw).trim() : "",
    monto:    (!isNaN(montoN) && montoN > 0) ? montoN : 0,
    respuestas: resp,
  };
}

const PRE = getPreLoaded();

// Mutable: URL snapshot at load; refreshed after A3/SEO canonical hydrate.
var TIENE_ENCUESTA = Object.values(PRE.respuestas).some(v => v !== null);

var SEGMENTO = (function () {
  var tieneIngreso = !!new URLSearchParams(window.location.search).get("ingreso");
  if (tieneIngreso && TIENE_ENCUESTA) return 1;
  if (tieneIngreso && !TIENE_ENCUESTA) return 2;
  return 3;
})();

/**
 * Recompute TIENE_ENCUESTA + SEGMENTO from canonical PRE (URL or A3 hydrate).
 * Does not invent legal consent. Safe to call after handoff apply.
 */
function refreshCanonicalEntryFlags() {
  if (typeof PRE === "undefined" || !PRE) return;
  var completeLetters = false;
  if (PRE.respuestas) {
    completeLetters = true;
    for (var i = 1; i <= 10; i++) {
      var v = PRE.respuestas["p" + i];
      if (v !== "A" && v !== "B" && v !== "C" && v !== "D") {
        completeLetters = false;
        break;
      }
    }
  }
  var anyUrlSurvey = Object.values(PRE.respuestas || {}).some(function (x) {
    return x !== null && x !== undefined && x !== "";
  });
  // Keep legacy: URL-carried survey still marks TIENE_ENCUESTA; A3 needs full A–D.
  TIENE_ENCUESTA = completeLetters || anyUrlSurvey;

  var tieneIngreso = false;
  if (PRE.ingreso != null && Number(PRE.ingreso) > 0) tieneIngreso = true;
  if (typeof hasUrlIngresoParam === "function" && hasUrlIngresoParam()) {
    tieneIngreso = true;
  }
  if (tieneIngreso && TIENE_ENCUESTA) SEGMENTO = 1;
  else if (tieneIngreso) SEGMENTO = 2;
  else SEGMENTO = 3;
}

// =============================================================================
// SEO IA — virgin entry detection (no legal consent side effects)
// =============================================================================
function isSeoIaEntry() {
  var p = new URLSearchParams(window.location.search);
  return p.get("source") === "seo_ia";
}

// =============================================================================
// FIX-01A — Entry Context Layer (read-only dependencies: hasUrlLaboralParam,
// hasUrlIngresoParam, TIENE_ENCUESTA, isSeoIaEntry, PRE, SEGMENTO, URLSearchParams)
// =============================================================================

function _entryCtxStrongLaboralParam(params) {
  var raw = params.get("laboral");
  if (raw == null) return false;
  var s = String(raw).trim();
  if (s === "") return false;
  return PROFILE_LABORAL_VALUES.indexOf(s) >= 0;
}

function _entryCtxStrongIngresoParam(params) {
  var raw = params.get("ingreso");
  if (raw == null) return false;
  var s = String(raw).trim();
  if (s === "") return false;
  if (!/^\d+(\.\d+)?$/.test(s)) return false;
  var n = parseFloat(s);
  return n > 0 && isFinite(n);
}

function _entryCtxHasUtm(params) {
  var keys = ["utm_source", "utm_medium", "utm_campaign"];
  for (var i = 0; i < keys.length; i++) {
    var val = params.get(keys[i]);
    if (val != null && String(val).trim() !== "") return true;
  }
  return false;
}

/** ENTRY-01 — truncate attribution / external refs (no unbounded query garbage). */
function _entryClampStr(raw, maxLen) {
  if (raw == null) return null;
  var s = String(raw).trim();
  if (s === "") return null;
  var max = maxLen != null ? maxLen : 64;
  if (s.length > max) s = s.slice(0, max);
  return s;
}

/**
 * ENTRY-01 attribution policy V1: CURRENT_ENTRY
 * Persist the attribution present on this page load with the diagnosis.
 * (No cross-session first-touch platform.)
 */
var CZ_ATTRIBUTION_POLICY = "CURRENT_ENTRY";

var ENTRY_ALLOWED_SOURCES = Object.freeze({
  seo_ia: true,
});

/**
 * ENTRY-01 — single normalization point.
 * raw URL / search → canonical entry context (entry source ≠ acquisition ≠ field provenance).
 *
 * Pure when called with an explicit search string (tests).
 * When search omitted, reads window.location.search (same as resolveEntryContext).
 *
 * Does NOT accept acquisition=seo_ia (docs-only / DESIGNED_ONLY).
 * Does NOT put cedula/telefono/monto/financial JSON into the canonical object.
 */
function normalizeEntryContext(search) {
  var params;
  if (search != null && search !== "") {
    var s = String(search);
    if (s.charAt(0) === "?") s = s.slice(1);
    params = new URLSearchParams(s);
  } else {
    params = new URLSearchParams(
      typeof window !== "undefined" && window.location
        ? window.location.search
        : ""
    );
  }

  var reasons = [];
  var hasLaboral = _entryCtxStrongLaboralParam(params) || (function () {
    var raw = params.get("laboral");
    return raw != null && String(raw).trim() !== "";
  })();
  var hasIngreso = _entryCtxStrongIngresoParam(params) || (function () {
    var raw = params.get("ingreso");
    return raw != null && String(raw).trim() !== "";
  })();
  var hasEncuesta = false;
  for (var pi = 1; pi <= 10; pi++) {
    var pv = params.get("p" + pi);
    if (pv != null && String(pv).trim() !== "") {
      hasEncuesta = true;
      break;
    }
  }
  var seoIa = params.get("source") === "seo_ia";
  var hasUtm = _entryCtxHasUtm(params);

  if (hasLaboral) reasons.push("has_url_laboral");
  if (hasIngreso) reasons.push("has_url_ingreso");
  if (hasEncuesta) reasons.push("has_encuesta");
  if (hasUtm) reasons.push("has_utm");
  if (seoIa) reasons.push("has_seo_ia_flag");

  var cdvStrong =
    _entryCtxStrongLaboralParam(params)
    && _entryCtxStrongIngresoParam(params)
    && hasEncuesta;

  var entryContext;
  var evidenceStrength;
  if (cdvStrong) {
    entryContext = "cdv_rejected";
    evidenceStrength = "strong";
  } else if (seoIa) {
    entryContext = "seo_organic";
    evidenceStrength = "strong";
  } else {
    entryContext = "organic";
    evidenceStrength = (hasUtm || reasons.length > 0) ? "moderate" : "weak";
  }

  var trafficSource;
  if (hasUtm) trafficSource = "paid";
  else if (seoIa) trafficSource = "seo";
  else trafficSource = "direct";

  var rawSource = _entryClampStr(params.get("source"), 32);
  var acquisitionSource =
    rawSource && ENTRY_ALLOWED_SOURCES[rawSource] ? rawSource : null;

  var acquisition = {
    source: acquisitionSource,
    intent: _entryClampStr(params.get("intent"), 64),
    question: _entryClampStr(params.get("question"), 64),
    utm_source: _entryClampStr(params.get("utm_source"), 64),
    utm_medium: _entryClampStr(params.get("utm_medium"), 64),
    utm_campaign: _entryClampStr(params.get("utm_campaign"), 64),
    utm_content: _entryClampStr(params.get("utm_content"), 64),
    utm_term: _entryClampStr(params.get("utm_term"), 64),
  };

  // CRM pointer only — not identity; capped; never CI/email
  var externalReference = _entryClampStr(params.get("czuid"), 64);

  var capturedAt = new Date().toISOString();

  return {
    // Legacy FIX-01A fields (copy gating)
    entryContext: entryContext,
    trafficSource: trafficSource,
    hasRejectionContext: entryContext === "cdv_rejected",
    evidenceStrength: evidenceStrength,
    reasons: reasons,
    // Canonical ENTRY-01 aliases
    entry_source: entryContext,
    traffic_source: trafficSource,
    has_rejection_context: entryContext === "cdv_rejected",
    evidence_strength: evidenceStrength,
    // Acquisition attribution (≠ entry source ≠ field provenance)
    acquisition: acquisition,
    attribution_policy: CZ_ATTRIBUTION_POLICY,
    external_reference: externalReference,
    captured_at: capturedAt,
    schema_version: 1,
  };
}

/*
 * ARCHITECTURE RULE — Entry Context Layer
 *
 * reasons[] and evidenceStrength are for debugging
 * and observability only.
 *
 * All copy gating and UI decisions must depend
 * exclusively on entryContext and its derivations
 * (hasRejectionContext, etc.).
 *
 * Never gate copy on evidenceStrength.
 * Never gate copy on reasons[].
 *
 * resolveEntryContext() must be a pure, side-effect-free
 * evaluator. It must not write storage, mutate cookies,
 * dispatch GTM/CRM events, call network services, or alter
 * any existing app state. It only profiles the incoming
 * session context.
 *
 * ENTRY-01: resolveEntryContext delegates to normalizeEntryContext
 * and returns the FIX-01A subset (plus acquisition for persistence).
 */
function resolveEntryContext() {
  var full = normalizeEntryContext();
  return {
    entryContext: full.entryContext,
    trafficSource: full.trafficSource,
    hasRejectionContext: full.hasRejectionContext,
    evidenceStrength: full.evidenceStrength,
    reasons: full.reasons,
    acquisition: full.acquisition,
    attribution_policy: full.attribution_policy,
    external_reference: full.external_reference,
    captured_at: full.captured_at,
    schema_version: full.schema_version,
    entry_source: full.entry_source,
    traffic_source: full.traffic_source,
  };
}

const CZ_ENTRY_CONTEXT = Object.freeze(resolveEntryContext());
window.CZ_ENTRY_CONTEXT = CZ_ENTRY_CONTEXT;

function hasResultParams() {
  var p = new URLSearchParams(window.location.search);
  var hasIncome = p.has("ingreso");
  var hasCrmId = p.has("czuid");
  var hasAnySurvey = false;

  for (var i = 1; i <= 10; i++) {
    if (p.has("p" + i)) {
      hasAnySurvey = true;
      break;
    }
  }

  return hasIncome || hasCrmId || hasAnySurvey;
}

function getSeoIaTrackingPayload() {
  var p = new URLSearchParams(window.location.search);
  return {
    source: p.get("source") || null,
    intent: p.get("intent") || null,
    question: p.get("question") || null,
  };
}

var SEO_IA_PRESERVED_PARAMS = [
  "source", "intent", "question",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
];

function buildSeoSurveyRedirectUrl() {
  var p = new URLSearchParams(window.location.search);
  var out = new URLSearchParams();
  var i;
  for (i = 0; i < SEO_IA_PRESERVED_PARAMS.length; i++) {
    var key = SEO_IA_PRESERVED_PARAMS[i];
    var val = _entryClampStr(p.get(key), 64);
    if (val != null) out.set(key, val);
  }
  var qs = out.toString();
  if (!qs) return SURVEY_URL;
  return SURVEY_URL + (SURVEY_URL.indexOf("?") >= 0 ? "&" : "?") + qs;
}

function getSeoIaAcquisitionPayload() {
  var p = new URLSearchParams(window.location.search);
  var rawSource = _entryClampStr(p.get("source"), 32);
  return {
    source:       (rawSource && ENTRY_ALLOWED_SOURCES[rawSource]) ? rawSource : null,
    intent:       _entryClampStr(p.get("intent"), 64),
    question:     _entryClampStr(p.get("question"), 64),
    utm_source:   _entryClampStr(p.get("utm_source"), 64),
    utm_medium:   _entryClampStr(p.get("utm_medium"), 64),
    utm_campaign: _entryClampStr(p.get("utm_campaign"), 64),
    utm_content:  _entryClampStr(p.get("utm_content"), 64),
    utm_term:     _entryClampStr(p.get("utm_term"), 64),
  };
}

var SEO_IA_QUESTIONS = [
  {
    id: 1, theme: "Organización",
    text: "¿Tenés claro cuánto dinero entra y sale cada mes?",
    options: {
      A: "Sí, lo controlo y lo reviso seguido",
      B: "Bastante claro, aunque no perfecto",
      C: "Más o menos, de forma general",
      D: "No, casi nunca lo llevo",
    },
  },
  {
    id: 2, theme: "Emergencias",
    text: "Si hoy tuvieras un gasto imprevisto grande, ¿cómo lo cubrirías?",
    options: {
      A: "Con ahorros para emergencias",
      B: "Con ahorros, ajustando gastos",
      C: "Con mucha dificultad",
      D: "Tendría que pedir prestado",
    },
  },
  {
    id: 3, theme: "Responsabilidad",
    text: "¿Cómo ves el origen de tu situación financiera actual?",
    options: {
      A: "Principalmente por decisiones mías",
      B: "Más por decisiones mías que por factores externos",
      C: "Más por factores externos que por mí",
      D: "Casi totalmente por factores externos",
    },
  },
  {
    id: 4, theme: "Ingresos extra",
    text: "Cuando recibís un ingreso extra, ¿qué solés hacer?",
    options: {
      A: "Ahorrar o pagar deudas",
      B: "Ahorrar una parte y gastar otra",
      C: "Gastarlo en gustos o pendientes",
      D: "Gastarlo sin planear",
    },
  },
  {
    id: 5, theme: "Estrés",
    text: "¿Qué nivel de preocupación te genera hoy tu situación financiera?",
    options: {
      A: "Bajo",
      B: "Moderado",
      C: "Alto",
      D: "Muy alto",
    },
  },
  {
    id: 6, theme: "Préstamos informales",
    text: "En el último año, ¿pediste dinero a familiares, amigos o prestamistas no formales?",
    options: {
      A: "No, nunca",
      B: "No, pero lo consideraría",
      C: "Sí, una vez",
      D: "Sí, varias veces",
    },
  },
  {
    id: 7, theme: "Deudas",
    text: "¿Tenés claro cuánto tiempo te llevaría salir de tus deudas pagando lo mínimo?",
    options: {
      A: "Sí, lo tengo claro",
      B: "Más o menos",
      C: "Muy por arriba",
      D: "No tengo idea",
    },
  },
  {
    id: 8, theme: "Acción post rechazo",
    text: "Después de un rechazo o una dificultad financiera, ¿hiciste algo para solucionarlo?",
    options: {
      A: "Sí, tomé acciones concretas",
      B: "Averigüé, pero no avancé mucho",
      C: "Pensé en hacerlo, pero no lo hice",
      D: "No hice nada",
    },
  },
  {
    id: 9, theme: "Ayuda",
    text: "Si Credizona te ofreciera ayuda gratuita para ordenar tus finanzas, ¿la aceptarías?",
    options: {
      A: "Sí, sin problema",
      B: "Depende del tema",
      C: "Solo algo puntual",
      D: "No, prefiero solo",
    },
  },
  {
    id: 10, theme: "Constancia",
    text: "¿Qué tan constante sos con hábitos financieros positivos por más de 3 meses?",
    options: {
      A: "Bastante constante",
      B: "A veces lo logro",
      C: "Me cuesta mucho",
      D: "Casi nunca",
    },
  },
];

// =============================================================================
// Legal consent constants
// =============================================================================
const LEGAL_VERSION_TC             = "TC_v2.0_202605";
const LEGAL_VERSION_DISCLAIMER     = "DISC_v2.0_202605";
const LEGAL_VERSION_PRIVACY        = "PP_v2.0_202605";
const CONSENT_STORAGE_KEY          = "cz_consent_v1";
const MIPLAN_UNAUTHORIZED_REDIRECT = "https://credizona.com.uy";

// Sprint — retry application CTA (Mi Plan dashboard). Empty = button disabled.
var CZ_RETRY_APPLICATION_URL = "";

function buildRetryApplicationUrl() {
  var base = typeof CZ_RETRY_APPLICATION_URL !== "undefined"
    ? String(CZ_RETRY_APPLICATION_URL).trim()
    : "";
  if (!base) return null;
  return base + (base.indexOf("?") >= 0 ? "&" : "?") + "source=miplan_retry&cl=2";
}

// Sprint 14.0 — Mi Plan Plus feature flags (IT flips when Handy / Equifax ready)
var CZ_PLUS_PAYMENT_LIVE = false;
var CZ_PLUS_BCU_CLEARING_LIVE = false;
var CZ_HANDY_ENDPOINT = "";

// B3 — Shadow integration (client remains UX authority; backend compare only)
// Kill switch: set CZ_SHADOW_MODE = false and redeploy to disable prod auto-shadow.
// Auto-enable only on CZ_SHADOW_PROD_HOSTS. Dev: ?cz_shadow=1&cz_api=... or config.local.js.
// Never put MIPLAN_BACKEND_SECRET / Supabase keys here.
var CZ_SHADOW_MODE = true;
var CZ_BACKEND_API_URL = "https://backend-production-17f9.up.railway.app";
var CZ_SHADOW_PROD_HOSTS = ["cz-miplan2.vercel.app"];
var CZ_SHADOW_TIMEOUT_MS = 8000;

// Mi Plan Plus — precio único (UYU). Usar esta constante; no hardcodear 1290 en UI/tracking.
const CZ_PLUS_PRICE_UYU = 1290;

// Sprint 14.2 — Claude LLM (key solo en Vercel env; nunca en el browser en producción)
var CZ_CLAUDE_API_KEY = "";
var CZ_CLAUDE_MODEL = "claude-sonnet-4-5";
var CZ_PLUS_USE_MOCK = false;
var CZ_CLAUDE_ALLOW_BROWSER_KEY = false;
var CZ_PLUS_PROXY_ENABLED = true;
var CZ_PLUS_PROXY_CLIENT_SECRET = "123456789987654321";

// Sprint MiDeuda — partner placeholder (CRM + future redirect)
var MIDEUDA_INTEGRATION_ENABLED = false;
var MIDEUDA_ONBOARDING_URL = "";
var MIDEUDA_USE_TOKEN = true;
var MIDEUDA_OPTIN_LEGAL_TEXT = "Acepto compartir mis datos con MiDeuda para continuar el proceso de revisión y negociación de mis deudas.";
var MIDEUDA_LOGO_PATH = "assets/img/partners/mideuda-logo.svg";

function buildMideudaRedirectUrl(user, resultado) {
  if (typeof MIDEUDA_INTEGRATION_ENABLED === "undefined" || !MIDEUDA_INTEGRATION_ENABLED) {
    return null;
  }
  var base = String(MIDEUDA_ONBOARDING_URL || "").trim();
  if (!base) return null;
  return base;
}

// Consent event names
const CZ_CONSENT_EVENTS = Object.freeze({
  LEGAL_ACCEPTED:    "legal_accepted",
  LEGAL_RESTORED:    "legal_restored_session",
  OUTSIDE_FUNNEL:    "outside_funnel_redirect",
  CONSENT_REVOKED:   "consent_revoked",
  MARKETING_OPTOUT:  "marketing_optout",
  OPERATIONAL_OPTOUT:"operational_optout",
});
