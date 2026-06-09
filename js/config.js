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
function sanitizeUrlEmail(raw) {
  if (raw == null || raw === "") return null;
  var e = String(raw).trim().toLowerCase();
  if (e.indexOf("@") < 1 || e.indexOf(".") < 0) return null;
  return e;
}

function getPreLoaded() {
  const p = new URLSearchParams(window.location.search);
  const resp = {};
  for (let i = 1; i <= 10; i++) resp["p" + i] = p.get("p" + i) || null;
  var emailParam = p.get("email");
  var emailFromUrl = sanitizeUrlEmail(emailParam);
  return {
    nombre:   p.get("nombre")   || "Martin Rodriguez",
    cedula:   p.get("cedula")   || "3.456.789-0",
    email:    emailFromUrl != null
      ? emailFromUrl
      : (emailParam ? "" : "martin@email.com"),
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
// SEO IA — virgin entry detection (no legal consent side effects)
// =============================================================================
function isSeoIaEntry() {
  var p = new URLSearchParams(window.location.search);
  return p.get("source") === "seo_ia";
}

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
    var val = p.get(key);
    if (val != null && val !== "") out.set(key, val);
  }
  var qs = out.toString();
  if (!qs) return SURVEY_URL;
  return SURVEY_URL + (SURVEY_URL.indexOf("?") >= 0 ? "&" : "?") + qs;
}

function getSeoIaAcquisitionPayload() {
  var p = new URLSearchParams(window.location.search);
  return {
    source:       p.get("source")       || null,
    intent:       p.get("intent")       || null,
    question:     p.get("question")     || null,
    utm_source:   p.get("utm_source")   || null,
    utm_medium:   p.get("utm_medium")   || null,
    utm_campaign: p.get("utm_campaign") || null,
    utm_content:  p.get("utm_content")  || null,
    utm_term:     p.get("utm_term")     || null,
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
