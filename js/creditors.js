// =============================================================================
// creditors.js — Acreedores, tipos de deuda, gastos, estados
// Depende de: config.js
// =============================================================================

// Tasas estimadas de mercado por tipo de deuda (TNA %)
const TASAS = {
  tarjeta:     95,
  prestamo:    62,
  financiera:  78,
  cooperativa: 54,
  servicios:   28,
  informal:    120,
  mora:        140,
};

// Tipos de deuda con label y tasa
const DEBT_TYPES = [
  { v: "tarjeta",     l: "Tarjeta de credito",   tasa: 95  },
  { v: "prestamo",    l: "Prestamo bancario",     tasa: 62  },
  { v: "financiera",  l: "Financiera",            tasa: 78  },
  { v: "cooperativa", l: "Cooperativa",           tasa: 54  },
  { v: "servicios",   l: "Servicios atrasados",   tasa: 28  },
  { v: "informal",    l: "Prestamo informal",     tasa: 120 },
  { v: "mora",        l: "Deuda en mora",         tasa: 140 },
];

// Categorias de gastos mensuales (Sprint 12)
const EXPENSE_CATS = [
  { k: "vivienda",      l: "Vivienda",                   h: "(Ej: alquiler, hipoteca, cooperativa, aporte familiar)" },
  { k: "alimentacion",  l: "Alimentación",               h: "(Ej: supermercado, feria, comida del trabajo)" },
  { k: "servicios",     l: "Servicios",                  h: "(Ej: UTE, OSE, ANTEL, internet, celular)" },
  { k: "transporte",    l: "Transporte",                 h: "(Ej: combustible, boleto, peaje, mantenimiento)" },
  { k: "salud",         l: "Salud",                      h: "(Ej: mutualista, medicamentos, consultas)" },
  { k: "educacion",     l: "Educación",                  h: "(Ej: colegio, facultad, cursos)" },
  { k: "hijos_familia", l: "Hijos y familia",            h: "(Ej: pensión, niñera, apoyo escolar)" },
  { k: "ocio",          l: "Ocio y entretenimiento",     h: "(Ej: gimnasio, salidas, streaming)" },
];

// Sprint 12.3 — iconografía Unicode (pantalla gastos; solo presentación)
var EXPENSE_CAT_ICONS = {
  vivienda:      "🏠",
  alimentacion:  "🍎",
  transporte:    "🚗",
  servicios:     "💡",
  salud:         "💊",
  educacion:     "📚",
  hijos_familia: "👨‍👩‍👧",
  ocio:          "🎬",
  otros:         "📦",
};

// Sprint 12.3 — benchmarks orientativos (% del ingreso); null = sin benchmark
var EXPENSE_BENCHMARKS = {
  vivienda:      { min: 25, max: 35 },
  alimentacion:  { min: 15, max: 25 },
  transporte:    { min: 5,  max: 15 },
  servicios:     { min: 5,  max: 10 },
  salud:         { min: 5,  max: 15 },
  ocio:          { min: 5,  max: 10 },
};

// Sprint 12 — gasto vs deuda keyword detection (custom expense descriptions)
var EXPENSE_DEBT_KEYWORDS = [
  "oca", "visa", "mastercard", "creditel", "pronto", "anda",
  "prestamo", "credito", "financiera", "cuota", "tarjeta", "banco",
  "brou", "itau", "santander", "scotiabank", "bbva", "cofac", "fucerep",
  "cooperativa", "deuda", "mora", "atraso", "refinanciacion",
];

function normalizeExpenseText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectDebtKeywordsInDescription(description) {
  var norm = normalizeExpenseText(description);
  if (!norm) return false;
  for (var i = 0; i < EXPENSE_DEBT_KEYWORDS.length; i++) {
    if (norm.indexOf(EXPENSE_DEBT_KEYWORDS[i]) !== -1) return true;
  }
  return false;
}

function migrateGastosKeys(gastos) {
  gastos = gastos || {};
  if (gastos.alquiler != null && gastos.vivienda == null) {
    gastos.vivienda = gastos.alquiler;
    delete gastos.alquiler;
  }
  if (gastos.otros != null) {
    var otrosVal = parseFloat(gastos.otros) || 0;
    if (otrosVal > 0) {
      gastos.ocio = (parseFloat(gastos.ocio) || 0) + otrosVal;
    }
    delete gastos.otros;
  }
  return gastos;
}

function getCategoryGastosTotal(gastos) {
  gastos = gastos || {};
  return Object.keys(gastos).reduce(function(s, k) {
    return s + (parseFloat(gastos[k]) || 0);
  }, 0);
}

function isCustomExpenseIncluded(exp, idx) {
  var st = window.CZState || {};
  var excluded = st._custom_expense_debt_excluded || {};
  if (excluded[String(idx)]) return false;
  if (detectDebtKeywordsInDescription(exp.description) && !exp.classification_override) {
    return false;
  }
  return true;
}

function getCustomExpensesIncludedTotal() {
  var arr = (window.CZState && window.CZState.custom_expenses) || [];
  return arr.reduce(function(s, exp, i) {
    if (!isCustomExpenseIncluded(exp, i)) return s;
    return s + (parseFloat(exp.amount) || 0);
  }, 0);
}

function getTotalMonthlyExpenses() {
  var st = window.CZState || {};
  return getCategoryGastosTotal(st.gastos) + getCustomExpensesIncludedTotal();
}

// =============================================================================
// Sprint 12.3 — Gastos vs ingreso (presentación / radiografía; no scoring)
// =============================================================================
function getExpensePercent(amount, income) {
  var amt = parseFloat(amount) || 0;
  var ing = parseFloat(income) || 0;
  if (ing <= 0) return 0;
  return Math.round((amt / ing) * 1000) / 10;
}

function collectPresentableExpenseItems() {
  var st     = window.CZState || {};
  var gastos = typeof migrateGastosKeys === "function"
    ? migrateGastosKeys(Object.assign({}, st.gastos || {}))
    : (st.gastos || {});
  var items  = [];

  EXPENSE_CATS.forEach(function(c) {
    var amount = parseFloat(gastos[c.k]) || 0;
    if (amount > 0) {
      items.push({
        key:    c.k,
        label:  c.l,
        amount: amount,
        icon:   EXPENSE_CAT_ICONS[c.k] || "",
      });
    }
  });

  (st.custom_expenses || []).forEach(function(exp, i) {
    if (!isCustomExpenseIncluded(exp, i)) return;
    var amount = parseFloat(exp.amount) || 0;
    if (amount > 0) {
      var desc = String(exp.description || "").trim();
      items.push({
        key:    "custom_" + i,
        label:  desc || "Otros gastos",
        amount: amount,
        icon:   EXPENSE_CAT_ICONS.otros,
      });
    }
  });

  return items;
}

function getTopExpenses(expenses, limit) {
  var list = (expenses || []).slice();
  list.sort(function(a, b) {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return String(a.label).localeCompare(String(b.label), "es");
  });
  return list.slice(0, limit || 3);
}

function getExpenseBenchmarkStatus(pct, benchmark) {
  if (!benchmark) return "Sin referencia disponible";
  if (pct > benchmark.max) return "Por encima de la referencia orientativa";
  return "Dentro de la referencia orientativa";
}

function sanitizeCustomExpensesForSave(arr) {
  return (arr || []).map(function(e) {
    return {
      description:             String(e.description || ""),
      amount:                  parseFloat(e.amount) || 0,
      classification_override: !!e.classification_override,
    };
  });
}

// Estados de atraso con semaforo
const ESTADOS_DEUDA = [
  {
    v: "al_dia",
    l: "🟢 Al dia",
    color: "#34ffaf",
    impact: "Sin impacto en tu perfil",
    puntaje: 0,
  },
  {
    v: "atraso_leve",
    l: "🟡 Atraso leve (1-30 dias)",
    color: "#ffd447",
    impact: "Empieza a afectar tu historial",
    puntaje: 1,
  },
  {
    v: "atraso_grave",
    l: "🔴 Atraso grave (31-90 dias)",
    color: "#ff7538",
    impact: "Impacto fuerte — el banco ya lo ve",
    puntaje: 2,
  },
  {
    v: "mora",
    l: "⛔ En mora (+90 dias)",
    color: "#ff4e72",
    impact: "Impacto critico — prioridad maxima",
    puntaje: 3,
  },
];

// Busca un estado por valor
function getEstado(v) {
  return ESTADOS_DEUDA.find(e => e.v === v) || null;
}

// =============================================================================
// CREDITOR DICTIONARY — canonical name lookup by normalized alias
// Aliases are lowercase, accent-free, trimmed keys.
// Grows organically via CRM unknown-creditor review process.
// =============================================================================
const CREDITOR_DICT = {
  // Banks
  "brou": "BROU",  "banco republica": "BROU",  "republica": "BROU",
  "banco de la republica": "BROU",  "banco de la republica oriental del uruguay": "BROU",
  "itau": "Itaú",  "banco itau": "Itaú",  "itau banco": "Itaú",
  "santander": "Santander",  "banco santander": "Santander",
  "hsbc": "HSBC",
  "scotiabank": "Scotiabank",  "scotia": "Scotiabank",
  "bbva": "BBVA",
  "bhu": "BHU",  "banco hipotecario": "BHU",

  // Cards / financial companies
  "oca": "OCA",  "tarjeta oca": "OCA",  "oca tarjeta": "OCA",
  "creditel": "Creditel",
  "visa": "VISA Uruguay",  "visa uruguay": "VISA Uruguay",
  "mastercard": "Mastercard",  "master": "Mastercard",
  "anda": "ANDA",  "anda prestamo": "ANDA",
  "prex": "Prex",
  "pronto": "Pronto",
  "pass card": "Pass Card",  "passcard": "Pass Card",  "pass": "Pass Card",
  "cash": "Cash",

  // Cooperatives
  "cofac": "Cofac",
  "fucerep": "Fucerep",
  "la uruguaya": "La Uruguaya",  "uruguaya": "La Uruguaya",
  "fucac": "FUCAC",
  "acac": "ACAC",
  "coopace": "Coopace",

  // Services
  "ute": "UTE",
  "ose": "OSE",
  "antel": "ANTEL",
  "movistar": "Movistar",
  "claro": "Claro",

  // Informal
  "familiar": "Familiar",  "familia": "Familiar",
  "madre": "Familiar",  "padre": "Familiar",
  "hermano": "Familiar",  "hermana": "Familiar",
  "tio": "Familiar",  "tia": "Familiar",
  "abuelo": "Familiar",  "abuela": "Familiar",
  "primo": "Familiar",  "prima": "Familiar",
  "amigo": "Amigo",  "amiga": "Amigo",
  "prestamista": "Prestamista particular",
  "particular": "Prestamista particular",
  "persona": "Prestamista particular",
  "privado": "Prestamista particular",

  // Other
  "abitab": "Abitab",
  "redpagos": "Redpagos",  "red pagos": "Redpagos",
  "midinero": "MiDinero",  "mi dinero": "MiDinero",
  "alfabrou": "AlfaBROU",  "alfa brou": "AlfaBROU",  "alfa": "AlfaBROU",
  "caja notarial": "Caja Notarial",  "notarial": "Caja Notarial",
  "bse": "BSE",
  "disse": "DISSE",
  "divino": "Divino",
  "motociclo": "Motociclo",
  "multi ahorro": "Multi Ahorro",  "multiahorro": "Multi Ahorro",
};

// Internal: decide if a raw string is safe to show as-is in the UI
function _esMostrable(raw) {
  var t = (raw || "").trim();
  if (t.length < 3) return false;
  if (/^\d+$/.test(t)) return false;                        // only numbers
  var letras = t.replace(/[^a-zA-Z\u00C0-\u024F]/g, "");
  if (letras.length < 3) return false;                      // fewer than 3 letter chars
  if (/^(.)\1{2,}$/.test(t.toLowerCase())) return false;   // repetition (jjjj, aaa)
  return true;
}

// =============================================================================
// normalizarAcreedor(rawText)
// Returns { acreedor_raw, acreedor_key, acreedor_normalizado, acreedor_display }
// acreedor_raw   — exact input, never modified
// acreedor_key   — lowercase, accent-free, collapsed key for dictionary lookup
// acreedor_normalizado — matched canonical name, or "otro"
// acreedor_display     — safe display value for UI
// =============================================================================
function normalizarAcreedor(rawText) {
  var raw = rawText != null ? String(rawText) : "";

  var key = raw
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove combining diacriticals (á→a etc.)
    .replace(/[^a-z0-9\s]/g, " ")      // remove punctuation
    .replace(/\s+/g, " ")
    .trim();

  var normalizado = CREDITOR_DICT[key] || "otro";

  var display;
  if (normalizado !== "otro") {
    display = normalizado;
  } else if (_esMostrable(raw)) {
    display = raw.trim();
  } else {
    display = "Una de tus deudas";
  }

  return {
    acreedor_raw:         raw,
    acreedor_key:         key,
    acreedor_normalizado: normalizado,
    acreedor_display:     display,
  };
}
