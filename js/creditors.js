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

// Categorias de gastos mensuales
const EXPENSE_CATS = [
  { k: "alquiler",     l: "Alquiler / Vivienda"          },
  { k: "servicios",    l: "Servicios (UTE, OSE, ANTEL)"  },
  { k: "alimentacion", l: "Alimentacion"                 },
  { k: "transporte",   l: "Transporte"                   },
  { k: "salud",        l: "Salud / mutualista"           },
  { k: "otros",        l: "Otros gastos"                 },
];

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
