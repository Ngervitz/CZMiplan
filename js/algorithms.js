// =============================================================================
// algorithms.js — Motor de calculos financieros y asignacion de planes
// Depende de: config.js, survey.js, creditors.js
// =============================================================================

// --- Estado compartido (leido desde app.js via window) ---
function _gastos()  { return window.CZState ? window.CZState.gastos : {}; }
function _deudas()  { return window.CZState ? window.CZState.deudas : []; }
function _snap()    { return window.CZState ? window.CZState.snap   : null; }

// =============================================================================
// PLANES
// =============================================================================
const PLANES = {
  1: {
    id: 1, icon: "🗂️", titulo: "Orden Financiero", color: "#5b7cff",
    problema:  "No tenes claro cuanto entra, cuanto sale ni cuanto debes. Sin eso, cualquier plan es a ciegas.",
    objetivo:  "Entender exactamente tu situacion financiera antes de tomar cualquier decision.",
    prioridades: [
      "Anotar todo lo que entra y todo lo que sale este mes, sin excepcion.",
      "Separar lo que no podes dejar de pagar de lo que podes reducir.",
      "Calcular cuanta plata te queda libre cada mes despues de pagar todo.",
    ],
    cta: "Completar mapa financiero", reevaluacion: "30 dias",
  },
  2: {
    id: 2, icon: "📉", titulo: "Reduccion de Deuda", color: "#ff4e72",
    problema:  "Estas pagando demasiado en relacion a lo que ganas. Cada mes es un esfuerzo y no alcanzas a salir.",
    objetivo:  "Bajar lo que pagas por mes y atacar primero las deudas que mas te estan frenando.",
    prioridades: [
      "Atacar primero la deuda que mas dano te hace — la que esta en mora o la mas cara.",
      "No sacar ninguna deuda nueva por al menos 30 dias.",
      "Llamar al banco o financiera para negociar. Muchas veces aceptan planes que no publicitan.",
    ],
    cta: "Ver deuda prioritaria", reevaluacion: "60 a 90 dias",
  },
  3: {
    id: 3, icon: "🚀", titulo: "Recuperacion Rapida", color: "#34ffaf",
    problema:  "Tu situacion esta bien encaminada. Hay algunos detalles que corregir para que el banco te diga que si.",
    objetivo:  "Hacer los ajustes puntuales que faltan para que el banco te apruebe en la proxima solicitud.",
    prioridades: [
      "Pagar todo en fecha. Un solo atraso puede echarte atras meses de progreso.",
      "Bajar lo que pagas en deudas para que sea menos del 30% de lo que ganas.",
      "En 30-60 dias volver a evaluar el perfil para ver si ya podes aplicar.",
    ],
    cta: "Activar plan 30-60 dias", reevaluacion: "30 a 60 dias",
  },
  4: {
    id: 4, icon: "🚨", titulo: "Estabilizacion Critica", color: "#ff4e72",
    problema:  "Tu situacion esta en un punto critico. Antes de pedir otro credito, hay que estabilizar lo que tenes.",
    objetivo:  "Parar la caida primero. Estabilizarte. Despues, con la situacion ordenada, pensar en el credito.",
    prioridades: [
      "No tomar ninguna deuda nueva en este periodo.",
      "Ordenar las deudas informales y las que estan en mora. Son las que mas dano hacen.",
      "Lograr que cada mes te sobre aunque sea un poco. Eso es la base de todo.",
    ],
    cta: "Empezar primeros auxilios", reevaluacion: "90 a 120 dias",
  },
  5: {
    id: 5, icon: "🔄", titulo: "Reperfilamiento", color: "#a78bfa",
    problema:  "Tu historial financiero esta danado, pero tu actitud muestra que queres salir. Eso es recuperable.",
    objetivo:  "Reconstruir el perfil con habitos sostenidos, menor presion de deuda y seguimiento.",
    prioridades: [
      "Hacer lo mismo bien durante 60-90 dias seguidos. La constancia es lo que reconstruye el historial.",
      "Regularizar o negociar los atrasos que figuran reportados. Eso limpia el perfil.",
      "En 90 dias, volver a medir el avance antes de pedir el credito.",
    ],
    cta: "Iniciar seguimiento 90 dias", reevaluacion: "90 dias",
  },
};

// =============================================================================
// MOTOR FINANCIERO
// =============================================================================
function calcularFinanciero() {
  const gastos = _gastos();
  const deudas = _deudas();

  const totalGastos = Object.values(gastos).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const totalDeuda  = deudas.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
  const totalPago   = deudas.reduce((s, d) => s + (parseFloat(d.pago)  || 0), 0);
  const ingreso     = PRE.ingreso;
  const flujoLibre  = ingreso - totalGastos - totalPago;
  const ratio       = ingreso > 0 ? totalPago / ingreso : 0;

  let interesProm = 0;
  if (totalDeuda > 0) {
    interesProm = Math.round(
      deudas.reduce((s, d) => {
        const m = parseFloat(d.monto) || 0;
        return s + (m / totalDeuda) * (TASAS[d.tipo] || 62);
      }, 0)
    );
  }

  let score = 100;
  if (ratio > 0.50)      score -= 38;
  else if (ratio > 0.35) score -= 24;
  else if (ratio > 0.20) score -= 10;
  if (flujoLibre < 0)               score -= 32;
  else if (flujoLibre < ingreso * 0.10) score -= 14;

  const moras     = deudas.filter(d => d.estado === "mora" || d.estado === "atraso_grave").length;
  const informales = deudas.filter(d => d.tipo === "informal").length;
  score -= Math.min(moras * 12, 25);
  if (informales > 0)       score -= 16;
  if (deudas.length >= 5)  score -= 10;
  if (totalGastos > ingreso * 0.85) score -= 10;

  // Escala 0-30 para unificar con encuesta
  score = clamp(Math.round(score / 100 * 30), 0, 30);

  let nivelRiesgo = "Bajo";
  if (totalPago > 50000 || interesProm > 90) nivelRiesgo = "Critico";
  else if (totalPago > 25000 || interesProm > 60) nivelRiesgo = "Medio";

  return {
    totalGastos, totalDeuda, totalPago, flujoLibre, ratio,
    interesProm, scoreFinanciero: score, nivelRiesgo,
    cantMoras: moras, cantInformales: informales,
  };
}

// =============================================================================
// PRIORIDAD DE DEUDA
// El estado de la deuda actua como multiplicador dominante, no como factor aditivo.
// Una deuda en mora de monto moderado supera a una deuda grande al dia.
// =============================================================================
function calcularPrioridad(d) {
  const monto = parseFloat(d.monto) || 0;
  const pago  = parseFloat(d.pago)  || 0;
  const tasa  = TASAS[d.tipo] || 62;
  const ing   = PRE.ingreso || 1;

  // Presion sobre el flujo mensual (relativa al ingreso)
  const presionFlujo = (pago / ing) * 100;

  // Costo financiero mensual como numero normalizado
  const interesMensual = monto * (tasa / 100 / 12);

  // Presion informal: no siempre visible en Clearing, pero real sobre el flujo
  const presionInformal = d.tipo === "informal" ? 20 : 0;

  // Score base: flujo + interes relativo + presion de tipo
  const base = presionFlujo + (interesMensual / 200) + presionInformal;

  // Estado como multiplicador — factor dominante de severidad
  const MULT = { al_dia: 1, atraso_leve: 3, atraso_grave: 6, mora: 12 };
  const mult = MULT[d.estado] || 1;

  return base * mult;
}

function deudaPrioritaria() {
  const deudas = _deudas();
  if (!deudas.length) return null;
  return [...deudas].sort((a, b) => calcularPrioridad(b) - calcularPrioridad(a))[0];
}

// =============================================================================
// ASIGNACION DE PLAN
// =============================================================================
function asignarPlan(enc, fin) {
  const r = PRE.respuestas;
  if (enc.nivel === "C" || fin.flujoLibre < 0 || fin.cantInformales > 0 || fin.cantMoras >= 2) return 4;
  if (fin.ratio > 0.35 || fin.cantMoras > 0 || fin.nivelRiesgo === "Critico") return 2;
  if (fin.nivelRiesgo === "Medio" && (r.p1 === "C" || r.p1 === "D" || r.p7 === "C" || r.p7 === "D")) return 1;
  if ((enc.nivel === "A" || enc.nivel === "B+") && fin.ratio < 0.35 && fin.cantMoras === 0 && fin.flujoLibre > 0) return 3;
  if ((r.p3 === "A" || r.p3 === "B") && (r.p8 === "A" || r.p8 === "B") && (r.p9 === "A" || r.p9 === "B")) return 5;
  return 1;
}

// =============================================================================
// INTERPRETACION CONTEXTUAL — reglas deterministas sobre datos declarados
// Retorna { principal, secundaria } — maximo 1+1 mensajes.
// Prioridad fija: flujo <= 0 > moras > informal > ratio alto > default
// =============================================================================
function interpretarSituacion(fin) {
  // Caso 1 — flujo negativo o cero (dominante)
  if (fin.flujoLibre <= 0) {
    return {
      principal:  "Con los numeros que declaraste, hoy no hay margen para asumir otra cuota.",
      secundaria: "Pedir mas plata puede dar alivio corto, pero aumenta el riesgo de atrasarte mas.",
    };
  }
  // Caso 2 — flujo positivo pero con atrasos activos
  if (fin.cantMoras > 0) {
    return {
      principal:  "Tus ingresos todavia dejan algo de margen, pero los atrasos actuales ya estan afectando tu perfil.",
      secundaria: "Antes de pedir mas credito, conviene regularizar lo que ya figura atrasado.",
    };
  }
  // Caso 3 — deuda informal presente (sin caso 1 ni 2)
  if (fin.cantInformales > 0) {
    return {
      principal:  "Tenes deuda informal activa que puede estar presionando tu flujo mensual.",
      secundaria: "No siempre figura en Clearing o BCU, pero puede complicar el resto de tus pagos.",
    };
  }
  // Caso 4 — ratio alto sin atrasos
  if (fin.ratio > 0.35) {
    return {
      principal:  "Hoy venis cumpliendo, pero una parte alta de tus ingresos ya esta comprometida en cuotas.",
      secundaria: "Una cuota nueva puede dejarte sin margen ante cualquier imprevisto.",
    };
  }
  // Caso 5 — default
  return {
    principal:  "Tu situacion necesita orden, pero todavia hay margen para corregir sin tomar decisiones apuradas.",
    secundaria: null,
  };
}

// =============================================================================
// BLOQUEADORES ACTIVOS — derivados de calcularFinanciero()
// =============================================================================
function calcularBloqueadores(fin) {
  const bl = [];
  if (fin.cantMoras >= 2) {
    bl.push({ tipo: "mora_multiple", etiqueta: fin.cantMoras + " deudas en mora o atraso registradas", impacto: "alto" });
  } else if (fin.cantMoras === 1) {
    bl.push({ tipo: "mora", etiqueta: "Deuda en mora o atraso registrado", impacto: "alto" });
  }
  if (fin.cantInformales > 0) {
    bl.push({ tipo: "informal", etiqueta: "Prestamo informal activo", impacto: "alto" });
  }
  if (fin.flujoLibre < 0) {
    bl.push({ tipo: "flujo_negativo", etiqueta: "Flujo mensual negativo", impacto: "alto" });
  }
  if (fin.ratio > 0.5) {
    bl.push({ tipo: "ratio_critico", etiqueta: "Carga de pagos sobre el 50% del ingreso", impacto: "alto" });
  } else if (fin.ratio > 0.35) {
    bl.push({ tipo: "ratio_alto", etiqueta: "Carga de pagos entre el 35% y 50% del ingreso", impacto: "medio" });
  }
  return bl;
}

// =============================================================================
// HORIZONTE DE RECALIFICACION — derivado de calculos existentes
// =============================================================================
function calcularHorizonte(fin, ing) {
  let meses = 0;
  if (fin.cantMoras === 0 && fin.ratio <= 0.30 && fin.flujoLibre > (ing || 1) * 0.15) {
    meses = 1;
  } else {
    if (fin.cantMoras > 0)                         meses += fin.cantMoras * 3;
    if (fin.ratio > 0.5)                           meses += 9;
    else if (fin.ratio > 0.35)                     meses += 4;
    if (fin.flujoLibre < 0)                        meses += 6;
    else if (fin.flujoLibre < (ing || 1) * 0.15)   meses += 2;
    meses = Math.max(1, meses);
  }
  let banda, label;
  if (meses <= 1)       { banda = "inmediato"; label = "Ya hay condiciones para considerar una solicitud"; }
  else if (meses <= 3)  { banda = "corto";     label = "Proximos 2 a 3 meses"; }
  else if (meses <= 6)  { banda = "corto";     label = "Proximos 4 a 6 meses"; }
  else if (meses <= 12) { banda = "medio";     label = "Dentro de 6 a 12 meses"; }
  else if (meses <= 24) { banda = "medio";     label = "Dentro de 1 a 2 anos"; }
  else                  { banda = "largo";     label = "Mas de 2 anos"; }
  return { meses, banda, label };
}

// =============================================================================
// MOTOR COMPLETO
// =============================================================================
function calcularMotor() {
  const enc = calcularEncuesta(PRE.respuestas);
  const fin = calcularFinanciero();
  const scoreReset = clamp(Math.round(fin.scoreFinanciero * 0.55 + enc.score * 0.45), 0, 30);
  let nivelR = scoreReset >= 21 ? "A" : scoreReset >= 13 ? "B" : "C";
  const planId = asignarPlan(enc, fin);
  if (planId === 4) nivelR = "C";
  if (planId === 2 && nivelR === "A") nivelR = "B";
  const snap = _snap();
  const diasRec = snap
    ? Math.floor((Date.now() - new Date(snap.fecha_inicio).getTime()) / 86400000)
    : 0;
  const bloqueadores   = calcularBloqueadores(fin);
  const horizonte      = calcularHorizonte(fin, PRE.ingreso);
  const interpretacion = interpretarSituacion(fin);
  return {
    enc, fin, scoreReset, nivelR,
    planId, plan: PLANES[planId],
    prio: deudaPrioritaria(), diasRec,
    bloqueadores, horizonte, interpretacion,
  };
}

// =============================================================================
// RADIOGRAFIA FINANCIERA — 5 indicadores
// =============================================================================
function calcularRadiografia() {
  const fin  = calcularFinanciero();
  const deudas = _deudas();
  const ing  = PRE.ingreso;

  // 1. Interes puro mensual
  const interesMensualTotal = deudas.reduce((s, d) => {
    const monto = parseFloat(d.monto) || 0;
    const tasa  = TASAS[d.tipo] || 62;
    return s + monto * (tasa / 100 / 12);
  }, 0);

  // 2. Meses para cancelar cada deuda
  const mesesPorDeuda = deudas.map(d => {
    const monto = parseFloat(d.monto) || 0;
    const pago  = parseFloat(d.pago)  || 0;
    const tasa  = (TASAS[d.tipo] || 62) / 100 / 12;
    if (pago <= 0 || monto <= 0) return null;
    if (pago <= monto * tasa) return 999;
    const meses = Math.ceil(-Math.log(1 - monto * tasa / pago) / Math.log(1 + tasa));
    return isFinite(meses) ? meses : 999;
  });

  // 3. Ahorro pagando extra en deuda prioritaria
  const prio = deudaPrioritaria();
  let ahorroPagandoExtra = null;
  if (prio) {
    const monto = parseFloat(prio.monto) || 0;
    const pago  = parseFloat(prio.pago)  || 0;
    const extra = Math.round(ing * 0.05);
    const tasa  = (TASAS[prio.tipo] || 62) / 100 / 12;
    if (pago > monto * tasa && (pago + extra) > monto * tasa) {
      const mesesSin = Math.ceil(-Math.log(1 - monto * tasa / pago) / Math.log(1 + tasa));
      const mesesCon = Math.ceil(-Math.log(1 - monto * tasa / (pago + extra)) / Math.log(1 + tasa));
      const ahorro   = Math.max(0, (pago * mesesSin - monto) - ((pago + extra) * mesesCon - monto));
      ahorroPagandoExtra = {
        extra, mesesSin, mesesCon,
        ahorro, mesesMenos: Math.max(0, mesesSin - mesesCon),
      };
    }
  }

  // 4. % del sueldo comprometido
  const comprometido    = fin.totalGastos + fin.totalPago;
  const pctComprometido = ing > 0 ? Math.min(Math.round(comprometido / ing * 100), 100) : 0;

  // 5. Estimacion de cuando podria calificar
  let mesesParaCalificar = 0;
  if (fin.cantMoras === 0 && fin.ratio <= 0.30 && fin.flujoLibre > ing * 0.15) {
    mesesParaCalificar = 1;
  } else {
    if (fin.cantMoras > 0)              mesesParaCalificar += fin.cantMoras * 3;
    if (fin.ratio > 0.5)                mesesParaCalificar += 9;
    else if (fin.ratio > 0.35)          mesesParaCalificar += 4;
    if (fin.flujoLibre < 0)             mesesParaCalificar += 6;
    else if (fin.flujoLibre < ing * 0.15) mesesParaCalificar += 2;
    mesesParaCalificar = Math.max(1, mesesParaCalificar);
  }
  const fechaCalificar = new Date();
  fechaCalificar.setMonth(fechaCalificar.getMonth() + mesesParaCalificar);
  const mesCalifica = fechaCalificar.toLocaleDateString("es-UY", { month: "long", year: "numeric" });

  return {
    interesMensualTotal, mesesPorDeuda, ahorroPagandoExtra,
    pctComprometido, comprometido, mesesParaCalificar, mesCalifica,
    fin, prio,
  };
}
