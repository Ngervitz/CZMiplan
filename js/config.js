// =============================================================================
// config.js — Constantes globales del producto
// No depende de ningun otro archivo JS.
// =============================================================================

const ALGORITHM_VERSION = "reset_v3_dark";
const STORAGE_KEY       = "cr_v3";
const API_TOKEN         = "REEMPLAZAR_CON_TOKEN_REAL"; // TODO IT

const API = {
  guardar:  "https://api.credizona.com.uy/api/reset/guardar",   // TODO IT
  clearing: "https://api.credizona.com.uy/api/reset/clearing",  // TODO IT
  pago:     "https://api.credizona.com.uy/api/reset/pago",      // TODO IT
  ia:       "https://api.credizona.com.uy/api/reset/ia",        // TODO IT
};

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
