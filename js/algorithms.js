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
// SPRINT 12.1 — STOCK DE DEUDA (DTI) — interpretation layer only
// Does NOT affect scoreFinanciero, scoreReset, guardrails, or plan assignment.
// =============================================================================
function evaluarStockDeuda(fin, ingreso) {
  var ing         = ingreso || 0;
  var deudaTotal  = fin.totalDeuda || 0;
  var dti_ratio   = ing > 0 ? deudaTotal / ing : (deudaTotal > 0 ? 999 : 0);

  var dti_level;
  if (dti_ratio < 0.5)       dti_level = "normal";
  else if (dti_ratio < 1)    dti_level = "moderado";
  else if (dti_ratio < 2)    dti_level = "elevado";
  else if (dti_ratio < 5)    dti_level = "alto";
  else                       dti_level = "critico";

  var confianzaMap = {
    normal:    100,
    moderado:  90,
    elevado:   80,
    alto:      70,
    critico:   50,
  };

  fin.dti_ratio             = Math.round(dti_ratio * 100) / 100;
  fin.dti_level             = dti_level;
  fin.confianza_diagnostico = confianzaMap[dti_level];
  return fin;
}

function etiquetaStockDeuda(dti_ratio) {
  if (dti_ratio >= 5) return "El nivel de deuda acumulada es muy elevado respecto al ingreso.";
  if (dti_ratio >= 2) return "El nivel total de deuda equivale a varios ingresos mensuales.";
  if (dti_ratio >= 1) return "El nivel total de deuda supera un ingreso mensual completo.";
  return null;
}

// =============================================================================
// MOTOR FINANCIERO
// =============================================================================
function calcularFinanciero() {
  const gastos = _gastos();
  const deudas = _deudas();

  const totalGastos = typeof getTotalMonthlyExpenses === "function"
    ? getTotalMonthlyExpenses()
    : Object.values(gastos).reduce((s, v) => s + (parseFloat(v) || 0), 0);
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

  var fin = {
    totalGastos, totalDeuda, totalPago, flujoLibre, ratio,
    interesProm, scoreFinanciero: score, nivelRiesgo,
    cantMoras: moras, cantInformales: informales,
  };

  evaluarStockDeuda(fin, ingreso);
  return fin;
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
// @deprecated — v1 interpretation, output stored as diag.interpretacion (v1)
// v2 output is diag.interpretacion_v2 via interpretarDiagnostico() (Sprint 7A+)
// Scheduled for removal: Sprint 1 Backend Phase
// Do not use for new UI surfaces without reviewing v2 architecture
function interpretarSituacion(fin) {
  // Caso 1 — flujo negativo o cero (dominante)
  if (fin.flujoLibre <= 0) {
    return {
      principal:  "Con los numeros que ingresaste, hoy no hay margen para asumir otra cuota.",
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
// TODO: Unify with interpretacion_v2.bloqueadores
// when dashboard is rewritten. See Sprint 7B decision.
// Field mapping needed:
// etiqueta → descripcion
// impacto → severidad (+ gender: alto→alta, medio→media)
// Types to reconcile: flujo_negativo↔flujo_insuficiente,
// mora/mora_multiple↔mora_prolongada, informal↔presion_informal
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
  var stockEtiqueta = etiquetaStockDeuda(fin.dti_ratio || 0);
  if (stockEtiqueta) {
    bl.push({
      tipo:     "stock_deuda_alto",
      etiqueta: stockEtiqueta,
      impacto:  (fin.dti_ratio || 0) >= 2 ? "alto" : "medio",
    });
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
// =============================================================================
// GUARDRAIL DE SEVERIDAD — Sprint 8
//
// Post-processing cap applied AFTER raw score calculation AND AFTER
// interpretarDiagnostico() resolves severity_level.
// Raw scores are NEVER overwritten — preserved as *Raw fields.
// Only references SEVERITY_CRITICO_SCORE_FIN_MAX and
// SEVERITY_CRITICO_SCORE_RESET_MAX from config.js.
// =============================================================================
function aplicarGuardrailSeveridad(scores, severityLevel) {
  var finRaw   = scores.scoreFinanciero;
  var resetRaw = scores.scoreReset;

  if (severityLevel === "critico") {
    return {
      scoreFinanciero:    Math.min(finRaw,   SEVERITY_CRITICO_SCORE_FIN_MAX),
      scoreReset:         Math.min(resetRaw, SEVERITY_CRITICO_SCORE_RESET_MAX),
      scoreFinancieroRaw: finRaw,
      scoreResetRaw:      resetRaw,
      guardrail_applied:  true,
      guardrail_reason:   "severity_critico",
    };
  }

  return {
    scoreFinanciero:    finRaw,
    scoreReset:         resetRaw,
    scoreFinancieroRaw: finRaw,
    scoreResetRaw:      resetRaw,
    guardrail_applied:  false,
    guardrail_reason:   null,
  };
}

function calcularMotor() {
  const enc = calcularEncuesta(PRE.respuestas);
  const fin = calcularFinanciero();

  // ── Raw scores — unchanged formulas ────────────────────────────────────────
  const scoreFinancieroRaw = fin.scoreFinanciero;
  const scoreResetRaw      = clamp(Math.round(fin.scoreFinanciero * 0.55 + enc.score * 0.45), 0, 30);

  // nivelR / planId derived from raw first so interpretarDiagnostico() gets a
  // consistent diag object. Both will be recomputed after guardrail below.
  let nivelR = scoreResetRaw >= 21 ? "A" : scoreResetRaw >= 13 ? "B" : "C";
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

  // ── Behavioral aggregate signals — Sprint 6.5 bridge ──────────────────────
  // Surfaces per-debt behavioral fields into the diag object so the
  // interpretation engine can read them without touching CZState.deudas directly.
  const deudas = _deudas();
  const situCounts = deudas.reduce(function(acc, d) {
    var s = d.situacion_ui || null;
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  var dominantSituacion = null;
  var dominantCount = 0;
  Object.keys(situCounts).forEach(function(k) {
    if (situCounts[k] > dominantCount) { dominantSituacion = k; dominantCount = situCounts[k]; }
  });
  fin.behavioral = {
    debt_data_quality:     calcularDebtDataQuality(deudas),
    debts_con_situacion:   deudas.filter(function(d) { return d.situacion_ui != null; }).length,
    debts_sin_situacion:   deudas.filter(function(d) { return d.situacion_ui == null; }).length,
    dominant_situacion:    dominantSituacion,
    tiene_mora_declarada:  deudas.some(function(d)  { return d.situacion_ui === "mora_reclamo"; }),
    tiene_informal:        deudas.some(function(d)  { return d.tipo === "informal"; }),
    tiene_pago_parcial:    deudas.some(function(d)  { return d.pago_fuente === "ultimo_pago_declarado"; }),
    tiene_no_declarado:    deudas.some(function(d)  { return d.pago_fuente === "no_declarado"; }),
    confidence_breakdown: {
      high:   deudas.filter(function(d) { return d.debt_confidence === "high";   }).length,
      medium: deudas.filter(function(d) { return d.debt_confidence === "medium"; }).length,
      low:    deudas.filter(function(d) { return d.debt_confidence === "low";    }).length,
    },
  };
  // ── end behavioral ─────────────────────────────────────────────────────────

  // Assemble result with raw scores before passing to interpretation engine.
  // interpretacion_v2 is additive — diag.interpretacion (v1) is unchanged.
  const result = {
    enc, fin,
    scoreReset: scoreResetRaw,       // raw — will be replaced by capped below
    scoreFinancieroRaw, scoreResetRaw,
    nivelR,
    planId, plan: PLANES[planId],
    prio: deudaPrioritaria(), diasRec,
    bloqueadores, horizonte, interpretacion,
  };

  // Run interpretation engine (needs raw scores + behavioral signals).
  result.interpretacion_v2 = interpretarDiagnostico(result);

  // ── Sprint 8 guardrail — post-processing cap ───────────────────────────────
  const guardrail = aplicarGuardrailSeveridad(
    { scoreFinanciero: scoreFinancieroRaw, scoreReset: scoreResetRaw },
    result.interpretacion_v2.severity_level
  );

  // Replace visible scores with capped values.
  fin.scoreFinanciero   = guardrail.scoreFinanciero;
  result.scoreReset     = guardrail.scoreReset;

  // Re-derive nivelR from capped scoreReset so all UI stays coherent.
  result.nivelR = guardrail.scoreReset >= 21 ? "A"
                : guardrail.scoreReset >= 13 ? "B"
                : "C";
  if (planId === 4) result.nivelR = "C";
  if (planId === 2 && result.nivelR === "A") result.nivelR = "B";

  // Persist raw + guardrail metadata on result.
  result.scoreFinancieroRaw = guardrail.scoreFinancieroRaw;
  result.scoreResetRaw      = guardrail.scoreResetRaw;
  result.guardrail_applied  = guardrail.guardrail_applied;
  result.guardrail_reason   = guardrail.guardrail_reason;

  // Mirror into interpretacion_v2 for downstream consumers.
  result.interpretacion_v2.scoreFinancieroRaw = guardrail.scoreFinancieroRaw;
  result.interpretacion_v2.scoreResetRaw      = guardrail.scoreResetRaw;
  result.interpretacion_v2.guardrail_applied  = guardrail.guardrail_applied;
  result.interpretacion_v2.guardrail_reason   = guardrail.guardrail_reason;

  return result;
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

  // 4. % del sueldo comprometido — active debt payments only.
  // Root-cause fix (Sprint 7B.2): the old formula used totalGastos + totalPago,
  // which made "cuanto ya esta comprometido" spike to ~98% even when monthly
  // debt payments were small. Gastos are already reflected in flujoLibre.
  // presion_latente_estimada and deuda_total are NOT included here.
  var pagosMensualesActivos = deudas.reduce(function(s, d) {
    var sit = d.situacion_ui;
    // Explicitly stopped or in mora: payment is 0 (guard against legacy stale values)
    if (sit === "deje_pagar" || sit === "mora_reclamo") return s;
    return s + (parseFloat(d.pago) || 0);
  }, 0);
  const comprometido    = pagosMensualesActivos;
  const pctComprometido = ing > 0 ? Math.min(Math.round(pagosMensualesActivos / ing * 100), 100) : 0;
  const flujoLibreActivo = ing - fin.totalGastos - pagosMensualesActivos;

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
    pctComprometido, comprometido, pagosMensualesActivos, flujoLibreActivo,
    mesesParaCalificar, mesCalifica,
    fin, prio,
  };
}

// =============================================================================
// DEBT PAYMENT ENRICHMENT
// Computes derived financial pressure fields per debt object.
// Called whenever a debt is created or modified (via app.js handlers).
// Results are stored on the debt object and used by CRM payload + snapshots.
// Internal TASAS are used for estimation only — never exposed as % labels.
//
// pago_fuente values:
//   "declarado"             — exact monthly payment declared by user
//   "ultimo_pago_declarado" — user behind but still paid something recently
//   "no_paga"               — user explicitly states they stopped paying
//   "mora_sin_pago"         — severe arrears / collection state
//   "estimado_sistema"      — legacy/internal fallback for pre-Sprint 6 debts
// =============================================================================
function enriquecerDeuda(d) {
  var monto  = parseFloat(d.monto) || 0;
  var pago   = parseFloat(d.pago)  || 0;
  var tasa   = TASAS[d.tipo]       || 62;
  var estado = d.estado            || "";

  // Raw monthly interest — TNA/12, internal only, never shown as %
  var interesMensualEst = monto > 0 ? Math.round(monto * tasa / 100 / 12) : 0;

  var interesMostrado = 0;
  var capitalEstimado = 0;
  var costoFinEst     = false;

  if (monto > 0 && pago > 0 && d.tipo !== "informal") {
    // Cap prevents over-stating interest when user is paying well
    var cap = null;
    if (estado === "al_dia") {
      cap = pago * 0.80;
    } else if (estado === "atraso_leve" || d.tipo === "tarjeta") {
      cap = pago * 0.95;
    }
    interesMostrado = (cap !== null && interesMensualEst >= cap)
      ? Math.round(cap)
      : interesMensualEst;
    capitalEstimado = Math.max(0, Math.round(pago - interesMostrado));
    costoFinEst     = true;
  }

  // Latent pressure: estimated monthly financial cost regardless of payment.
  // Formula: monto × TNA / 100 / 12  — simple monthly approximation, NOT compound.
  // This is contextual framing only, never a contractual or legal figure.
  var presionLatente = interesMensualEst;

  // Sprint 8.3 — display unrealism guard.
  // The formula is mathematically correct. But for extreme debt-to-income ratios
  // (e.g., 121M debt / 65K income at 95% TNA → ~9.6M/month interest), showing the
  // exact figure is psychologically cartoonish and not useful for recovery framing.
  //
  // Flags trigger if either threshold is met:
  //   A. presion > 25% of the debt's own monto per month (implies TNA > 300%)
  //   B. presion > 1.5× monthly income (debt interest alone drowns the income)
  //
  // The flag gates the UI display only — raw value is kept for CRM/analytics.
  var ingreso = PRE.ingreso || 1;
  var unrealisticByDebt   = monto > 0 && presionLatente / monto > 0.25;
  var unrealisticByIncome = presionLatente / ingreso > 1.5;
  var presionLatenteUnrealistic = unrealisticByDebt || unrealisticByIncome;

  d.interes_mensual_estimado          = interesMensualEst;
  d.interes_mostrado                  = interesMostrado;
  d.capital_estimado                  = capitalEstimado;
  d.presion_latente_estimada          = presionLatente;
  d.presion_latente_unrealistic_flag  = presionLatenteUnrealistic;
  d.costo_financiero_estimado         = costoFinEst;

  // Backward compat: ensure pago_fuente has a value on legacy debts
  if (!d.pago_fuente) {
    d.pago_fuente = pago > 0 ? "estimado_sistema" : null;
  }

  // Debt confidence — computed if not already set by the UI interaction layer.
  // The UI sets debt_confidence explicitly on situacion_ui selection and on
  // payment amount declaration. Here we only fill in the fallback for legacy debts.
  if (!d.debt_confidence) {
    var sit = d.situacion_ui || "";
    if (sit === "mora_reclamo") {
      d.debt_confidence = "high";
    } else if (sit === "no_seguro" || !sit) {
      d.debt_confidence = "low";
    } else if ((sit === "pagando_normal" && pago > 0) || (sit === "atrasado_pagando" && d.ultimo_pago_declarado > 0)) {
      d.debt_confidence = "high";
    } else {
      d.debt_confidence = "medium";
    }
  }

  return d;
}

// =============================================================================
// DEBT DATA QUALITY
// Aggregates per-debt confidence into a global signal for CRM/underwriting.
//
// Rules:
//   high   — ≥ 75% of debts have debt_confidence = "high"
//   medium — ≥ 50% of debts have debt_confidence = "high" or "medium"
//   low    — otherwise (including no debts)
// =============================================================================
function calcularDebtDataQuality(deudas) {
  if (!deudas || !deudas.length) return "low";
  var total  = deudas.length;
  var high   = deudas.filter(function(d) { return d.debt_confidence === "high"; }).length;
  var medium = deudas.filter(function(d) { return d.debt_confidence === "medium"; }).length;
  if (high / total >= 0.75) return "high";
  if ((high + medium) / total >= 0.50) return "medium";
  return "low";
}

// =============================================================================
// SEVERITY ENGINE — Sprint 7B.3
// Separates structural debt burden (stock) from operational deterioration (behavioral).
// Does NOT change active payment ratio or scoring formulas.
// =============================================================================
function calcularSeveridadFinanciera(fin, deudas, ingreso) {
  fin    = fin    || {};
  deudas = deudas || [];
  ingreso = ingreso || PRE.ingreso || 1;

  var deudaTotal = fin.totalDeuda || deudas.reduce(function(s, d) {
    return s + (parseFloat(d.monto) || 0);
  }, 0);

  var deudaTotalIngresoRatio = ingreso > 0 ? deudaTotal / ingreso : 0;
  var maxDeudaIngresoRatio   = deudas.reduce(function(mx, d) {
    var m = parseFloat(d.monto) || 0;
    return ingreso > 0 ? Math.max(mx, m / ingreso) : mx;
  }, 0);

  var has_mora_or_deje_pagar = deudas.some(function(d) {
    return d.situacion_ui === "deje_pagar" || d.situacion_ui === "mora_reclamo";
  });

  var has_unpaid_debt = deudas.some(function(d) {
    var monto = parseFloat(d.monto) || 0;
    if (monto <= 0) return false;
    var sit = d.situacion_ui;
    if (sit === "deje_pagar" || sit === "mora_reclamo") return true;
    return (parseFloat(d.pago) || 0) === 0;
  });

  var presionLatenteTotal = deudas.reduce(function(s, d) {
    return s + (d.presion_latente_estimada || 0);
  }, 0);

  var presionLatenteRatio = ingreso > 0 ? presionLatenteTotal / ingreso : 0;
  var severe_latent_pressure = has_unpaid_debt && presionLatenteRatio >= 0.35;

  // A) Stock severity — structural debt burden
  var severity_stock = null;
  if (deudaTotalIngresoRatio >= 24) {
    severity_stock = "critico";
  } else if (deudaTotalIngresoRatio >= 12) {
    severity_stock = "alto";
  }

  // B) Behavioral severity — operational deterioration
  var severity_behavioral = null;
  deudas.forEach(function(d) {
    var monto = parseFloat(d.monto) || 0;
    var montoIngresoRatio = ingreso > 0 ? monto / ingreso : 0;
    if (d.situacion_ui === "deje_pagar"
        && d.atraso_tiempo === "mas_90"
        && montoIngresoRatio >= 12) {
      severity_behavioral = "critico";
    } else if (d.situacion_ui === "mora_reclamo" && montoIngresoRatio >= 6) {
      if (severity_behavioral !== "critico") severity_behavioral = "alto";
    }
  });

  // Latent pressure severity — recovery signal, not active cashflow
  var severity_latent = null;
  if (has_unpaid_debt && presionLatenteRatio >= 1.0) {
    severity_latent = "critico";
  } else if (severe_latent_pressure) {
    severity_latent = "alto";
  }

  // Global resolution — any critico wins; otherwise any alto wins
  var severity_level = null;
  if (severity_stock === "critico"
      || severity_behavioral === "critico"
      || severity_latent === "critico") {
    severity_level = "critico";
  } else if (severity_stock === "alto"
      || severity_behavioral === "alto"
      || severity_latent === "alto") {
    severity_level = "alto";
  }

  return {
    severity_stock,
    severity_behavioral,
    severity_level,
    deuda_total_ingreso_ratio: deudaTotalIngresoRatio,
    max_deuda_ingreso_ratio:   maxDeudaIngresoRatio,
    has_unpaid_debt,
    has_mora_or_deje_pagar,
    severe_latent_pressure,
    presion_latente_total:     presionLatenteTotal,
    presion_latente_ratio:     presionLatenteRatio,
  };
}

// =============================================================================
// INTERPRETATION ENGINE v1 — Sprint 7A
//
// Converts calcularMotor() output into a structured semantic interpretation.
// Pure function — reads diag + _deudas() + PRE.respuestas, writes nothing.
//
// Output contract:
//   causa_principal        — primary financial pressure cause (string enum)
//   causas_secundarias[]   — up to 2 additional contributing causes
//   patron_deuda           — dominant debt structural pattern (string enum)
//   recuperabilidad        — recoverability label ("alta" .. "muy_baja")
//   recuperabilidad_class  — machine-readable class string
//   bloqueadores[]         — typed severity-ranked blocker objects
//   next_best_action       — action key for next step (see NBA_MAP / textoParaNarrativa)
//   contradiccion_conductual — mismatch between declared behavior and signals
//   narrativa_jerarquizada[] — ordered array for Sprint 7B copy mapping
//   confidence_level       — interpretation confidence ("high"|"medium"|"low")
//   interpretacion_parcial — true when confidence forced overrides
//   interpretation_version — "miplan_v1"
// =============================================================================

// =============================================================================
// SPRINT 7B — NARRATIVE HELPERS
// =============================================================================

// Safe lookup — never use array indices on narrativa_jerarquizada.
function getNarrativaByTipo(narrativa, tipo) {
  return narrativa.find(function(e) { return e.tipo === tipo; }) || null;
}

// Fills narrativa_jerarquizada[].texto with display-ready Spanish strings.
// confidence_level is intentionally NOT handled here; confidence display
// is rendered separately in ui.js.
function textoParaNarrativa(entry) {
  if (!entry) return null;

  if (entry.tipo === "problema_principal") {
    var cp = {
      flujo_negativo:    "Los pagos actuales superan el ingreso disponible. El margen mensual real es negativo.",
      mora_activa:       "Hay deudas en atraso o mora activa que están afectando el perfil financiero hoy.",
      stock_deuda_alto:  "El flujo mensual puede parecer manejable, pero el volumen total de deuda acumulada sigue siendo un factor importante.",
      estres_alto:       "El nivel de presión financiera declarado es alto. Eso puede dificultar la toma de decisiones.",
      presion_informal:  "Parte de la presión financiera ocurre fuera del sistema formal, sin registro en Clearing o BCU.",
      deuda_cara:        "La deuda prioritaria tiene un costo financiero alto en relación al ingreso disponible.",
      demasiadas_deudas: "La cantidad de obligaciones simultáneas está fragmentando el margen mensual disponible.",
      sin_accion:        "No se registran acciones concretas recientes para ordenar la situación financiera.",
      falta_organizacion:"El panorama financiero no está completamente claro, lo que dificulta detectar por dónde empezar.",
      deterioro_estructural: "La situación muestra deterioro financiero severo. Aunque hoy no haya pagos activos, el tamaño de la deuda y el atraso acumulado requieren estabilización antes de pensar en recuperación.",
    };
    return cp[entry.causa] || null;
  }

  if (entry.tipo === "presion_dominante") {
    var pd = {
      deuda_rotativa:       "Gran parte del flujo mensual se consume manteniendo deuda rotativa sin bajar capital.",
      mora_congelada:       "Hay mora activa que no genera pagos pero sigue afectando el perfil crediticio.",
      fragmentacion_cuotas: "Muchas cuotas pequeñas están fragmentando el margen disponible mes a mes.",
      presion_informal:     "La presión principal no viene del sistema financiero formal sino de compromisos informales.",
      sin_patron:           "No se detecta un patrón de deuda dominante.",
    };
    return pd[entry.patron] || null;
  }

  if (entry.tipo === "recuperabilidad") {
    var rc = {
      recuperable_rapido:      "El perfil muestra margen para trabajar la recuperación con un plan sostenido, si se actúa sobre la causa principal.",
      recuperable_medio:       "La recuperación es posible pero requiere un plan sostenido en el tiempo.",
      recuperable_largo:       "La situación requiere estabilización antes de poder pensar en recalificación.",
      requiere_estabilizacion: "Antes de recuperar el perfil, el objetivo es estabilizar la presión financiera actual.",
      no_accionable:           "En este momento no hay margen suficiente para iniciar un proceso de recuperación sin primero reducir la presión mensual.",
    };
    return rc[entry.clase] || null;
  }

  if (entry.tipo === "siguiente_paso") {
    var sp = {
      liberar_margen:            "Identificar qué cuota libera más margen mensual es el paso con mayor impacto inmediato.",
      estabilizar_atraso:        "Antes de pensar en nueva financiación, el foco debería estar en estabilizar los atrasos activos.",
      reducir_costo_prioritaria: "Evaluar si hay forma de reducir el costo de la deuda prioritaria puede mejorar el margen disponible.",
      consolidar_deuda:          "Consolidar o eliminar la deuda que menos beneficio genera puede simplificar el panorama mensual.",
      formalizar_informal:       "Formalizar o reestructurar el compromiso informal reduce presión fuera del sistema y mejora el perfil.",
      definir_primer_paso:       "Definir una acción concreta esta semana es más valioso que planificar sin ejecutar.",
      ordenar_panorama:          "Ordenar el panorama completo de deudas y flujo es el punto de partida más útil ahora.",
      confirmar_saldo_stock_deuda: "Confirmar el saldo actualizado y definir si esta deuda debe estabilizarse, refinanciarse o atacarse primero.",
    };
    return sp[entry.accion] || null;
  }

  return null;
}

function interpretarDiagnostico(diag) {
  var fin    = diag.fin   || {};
  var enc    = diag.enc   || {};
  var prio   = diag.prio  || null;
  var behav  = fin.behavioral || {
    debt_data_quality:    "low",
    debts_con_situacion:  0,
    debts_sin_situacion:  0,
    dominant_situacion:   null,
    tiene_mora_declarada: false,
    tiene_informal:       false,
    tiene_pago_parcial:   false,
    tiene_no_declarado:   false,
    confidence_breakdown: { high: 0, medium: 0, low: 0 },
  };

  var deudas      = _deudas();
  var totalDeudas = deudas.length;
  var totalPago   = fin.totalPago  || 0;   // totalCuotas alias
  var flujoLibre  = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var ingreso     = PRE.ingreso    || 1;
  var ratio       = fin.ratio      || 0;
  var cantMoras   = fin.cantMoras  || 0;
  var nivelR      = diag.nivelR    || "C";

  // ── 0. SEVERITY ENGINE (Sprint 7B.3) ─────────────────────────────────────
  var sev = calcularSeveridadFinanciera(fin, deudas, ingreso);

  // Granular survey scores not on enc — derived from PRE.respuestas via p2n().
  // P5 = financial stress (A=3 no stress, D=0 max stress).
  // P8 = recent action taken (A=3 active, D=0 no action).
  var r            = PRE.respuestas || {};
  var estres_score = p2n(r.p5) != null ? p2n(r.p5) : 2;
  var accion_score = p2n(r.p8) != null ? p2n(r.p8) : 2;

  // ── 1. CAUSA PRINCIPAL ENGINE ─────────────────────────────────────────────
  // Evaluated in priority order. First match wins causa_principal.
  // All other matches populate causas_secundarias (max 2).
  var REGLAS_CAUSA = [
    {
      id:    "flujo_negativo",
      match: function() { return flujoLibre < 0; },
    },
    {
      id:    "mora_activa",
      match: function() { return cantMoras > 0 || behav.tiene_mora_declarada; },
    },
    {
      id:    "stock_deuda_alto",
      match: function() { return (fin.dti_ratio || 0) >= 1; },
    },
    {
      id:    "estres_alto",
      match: function() { return estres_score <= 1; },
    },
    {
      id:    "presion_informal",
      match: function() { return behav.tiene_informal && fin.cantInformales >= 1; },
    },
    {
      id:    "deuda_cara",
      match: function() {
        return prio != null
          && ["tarjeta", "financiera", "informal"].indexOf(prio.tipo) !== -1
          && ratio > 0.4;
      },
    },
    {
      id:    "demasiadas_deudas",
      match: function() { return totalDeudas > 4 && ratio > 0.35; },
    },
    {
      id:    "sin_accion",
      match: function() { return accion_score <= 1; },
    },
    {
      id:    "falta_organizacion",
      match: function() { return true; }, // default — always matches last
    },
  ];

  var causa_principal    = "falta_organizacion";
  var causas_secundarias = [];
  var firstFound         = false;

  REGLAS_CAUSA.forEach(function(regla) {
    if (regla.match()) {
      if (!firstFound) {
        causa_principal = regla.id;
        firstFound      = true;
      } else if (causas_secundarias.length < 2 && regla.id !== causa_principal) {
        causas_secundarias.push(regla.id);
      }
    }
  });

  // ── 2. DEBT PATTERN DETECTION ─────────────────────────────────────────────
  var patron_deuda = "sin_patron";

  // Largest single-debt share of total monthly payments (for fragmentation check)
  var maxPagoShare = totalPago > 0
    ? deudas.reduce(function(mx, d) {
        return Math.max(mx, (parseFloat(d.pago) || 0) / totalPago);
      }, 0)
    : 0;

  // Average pago/monto ratio across credit cards (low = revolving)
  var tarjetas = deudas.filter(function(d) { return d.tipo === "tarjeta"; });
  var avgPagoMontoTarjeta = tarjetas.length > 0
    ? tarjetas.reduce(function(s, d) {
        var m = parseFloat(d.monto) || 0;
        var p = parseFloat(d.pago)  || 0;
        return s + (m > 0 ? p / m : 0);
      }, 0) / tarjetas.length
    : 1;

  if (tarjetas.length >= 2 && avgPagoMontoTarjeta < 0.05) {
    patron_deuda = "deuda_rotativa";
  } else if (behav.tiene_mora_declarada && cantMoras >= 1 && flujoLibre >= 0) {
    patron_deuda = "mora_congelada";
  } else if (totalDeudas >= 4 && totalPago > ingreso * 0.5 && maxPagoShare < 0.4) {
    patron_deuda = "fragmentacion_cuotas";
  } else if (behav.tiene_informal && fin.cantInformales >= 1) {
    patron_deuda = "presion_informal";
  }

  // ── 3. RECOVERY BLOCKERS ENGINE ───────────────────────────────────────────
  var bloqueadores = [];

  if (flujoLibre < 0) {
    bloqueadores.push({
      tipo:        "flujo_insuficiente",
      severidad:   "alta",
      descripcion: "El flujo mensual es negativo — los pagos superan los ingresos disponibles.",
    });
  }

  var hayMoraReclamo = deudas.some(function(d) { return d.situacion_ui === "mora_reclamo"; });
  if (cantMoras > 0 && hayMoraReclamo) {
    bloqueadores.push({
      tipo:        "mora_prolongada",
      severidad:   "alta",
      descripcion: "Hay deudas en mora o reclamo activo. Impacto directo sobre el perfil crediticio.",
    });
  }

  if (behav.tiene_informal) {
    bloqueadores.push({
      tipo:        "presion_informal",
      severidad:   "media",
      descripcion: "Hay compromisos informales activos que no siempre se reflejan en el sistema financiero.",
    });
  }

  if (totalDeudas >= 4 && totalPago > ingreso * 0.4) {
    bloqueadores.push({
      tipo:        "fragmentacion_cuotas",
      severidad:   "media",
      descripcion: "Muchas deudas fragmentan el flujo mensual y dificultan la priorizacion.",
    });
  }

  var stockDesc = etiquetaStockDeuda(fin.dti_ratio || 0);
  if (stockDesc) {
    bloqueadores.push({
      tipo:        "stock_deuda_alto",
      severidad:   (fin.dti_ratio || 0) >= 2 ? "alta" : "media",
      descripcion: stockDesc,
    });
  }

  if (behav.debt_data_quality === "low") {
    bloqueadores.push({
      tipo:        "datos_insuficientes",
      severidad:   "baja",
      descripcion: "La informacion declarada sobre las deudas es parcial. El diagnostico puede ser impreciso.",
    });
  }

  if (accion_score <= 1) {
    bloqueadores.push({
      tipo:        "sin_accion_declarada",
      severidad:   "media",
      descripcion: "No hay acciones recientes registradas. La disposicion al cambio es baja.",
    });
  }

  // ── 4. RECUPERABILIDAD ────────────────────────────────────────────────────
  var recuperabilidad       = "media";
  var recuperabilidad_class = "recuperable_medio";
  var isAOrBPlus = nivelR === "A" || (nivelR === "B" && enc.bPlus === true);

  if (isAOrBPlus && cantMoras === 0 && flujoLibre >= 0) {
    recuperabilidad       = "alta";
    recuperabilidad_class = "recuperable_rapido";
  } else if (nivelR === "B" && cantMoras <= 1 && flujoLibre > -(ingreso * 0.1)) {
    recuperabilidad       = "media";
    recuperabilidad_class = "recuperable_medio";
  } else if (nivelR === "C" && !behav.tiene_mora_declarada && estres_score > 1) {
    recuperabilidad       = "media_baja";
    recuperabilidad_class = "recuperable_largo";
  } else if (nivelR === "C" && (cantMoras > 0 || behav.tiene_informal)) {
    recuperabilidad       = "baja";
    recuperabilidad_class = "requiere_estabilizacion";
  } else if (nivelR === "C" && accion_score <= 1 && flujoLibre < 0) {
    recuperabilidad       = "muy_baja";
    recuperabilidad_class = "no_accionable";
  } else if (sev.severity_level === "alto") {
    if (recuperabilidad_class === "recuperable_rapido") {
      recuperabilidad       = "media_baja";
      recuperabilidad_class = "recuperable_largo";
    }
    if (causa_principal === "falta_organizacion") {
      causa_principal = "mora_activa";
    }
  }

  // ── 5. NEXT BEST ACTION ───────────────────────────────────────────────────
  // Values are action keys — display copy is resolved by textoParaNarrativa().
  var NBA_MAP = {
    flujo_negativo:     "liberar_margen",
    mora_activa:        "estabilizar_atraso",
    deuda_cara:         "reducir_costo_prioritaria",
    demasiadas_deudas:  "consolidar_deuda",
    presion_informal:   "formalizar_informal",
    sin_accion:         "definir_primer_paso",
    falta_organizacion: "ordenar_panorama",
  };
  var next_best_action = NBA_MAP[causa_principal] || "ordenar_panorama";
  if (sev.severity_level === "critico") {
    next_best_action = "estabilizar_atraso";
  }
  // Sprint 12.1.b — debt stock priority (interpretation only; no score/plan change)
  if ((fin.dti_ratio || 0) >= 1) {
    next_best_action = "confirmar_saldo_stock_deuda";
  }

  // ── 6. BEHAVIORAL CONTRADICTION DETECTION ────────────────────────────────
  // Flags a mismatch between declared payment behavior and calculated signals.
  var contradiccion_conductual = false;
  // "Paying normally" declared, but calculated flow is negative
  if (causa_principal === "flujo_negativo" && behav.dominant_situacion === "pagando_normal") {
    contradiccion_conductual = true;
  }
  // Mora declared, but flow is very healthy (>20% of income free)
  if (behav.tiene_mora_declarada && flujoLibre > ingreso * 0.2) {
    contradiccion_conductual = true;
  }

  // ── 7. CONFIDENCE-AWARE ADJUSTMENT ───────────────────────────────────────
  var confidence_level;
  if (behav.debt_data_quality === "high" && behav.debts_sin_situacion === 0) {
    confidence_level = "high";
  } else if (behav.debt_data_quality === "medium" || behav.debts_sin_situacion > 0) {
    confidence_level = "medium";
  } else {
    confidence_level = "low";
  }

  var interpretacion_parcial = false;
  if (confidence_level === "low") {
    if (sev.severity_level !== "critico" && sev.severity_level !== "alto") {
      patron_deuda = "sin_patron";
    }
    causas_secundarias     = [];
    interpretacion_parcial = true;
  }

  // Sprint 7B.3 — re-apply severity framing after confidence adjustments
  if (sev.severity_level === "critico") {
    if (causa_principal === "falta_organizacion" || causa_principal === "sin_accion") {
      causa_principal = "deterioro_estructural";
    }
    if (sev.has_mora_or_deje_pagar || sev.severity_behavioral) {
      patron_deuda = "mora_congelada";
    }
    recuperabilidad       = "baja";
    recuperabilidad_class = "requiere_estabilizacion";
    if (flujoLibre < 0 && accion_score <= 1) {
      recuperabilidad       = "muy_baja";
      recuperabilidad_class = "no_accionable";
    }
    next_best_action = "estabilizar_atraso";
  }

  // ── 8. NARRATIVA JERARQUIZADA ─────────────────────────────────────────────
  // Ordered structure for display. texto is filled by textoParaNarrativa().
  var narrativa_jerarquizada = [
    {
      prioridad: 1,
      tipo:      "problema_principal",
      causa:     causa_principal,
      texto:     null,
    },
    {
      prioridad: 2,
      tipo:      "presion_dominante",
      patron:    patron_deuda,
      texto:     null,
    },
    {
      prioridad: 3,
      tipo:      "recuperabilidad",
      clase:     recuperabilidad_class,
      texto:     null,
    },
    {
      prioridad: 4,
      tipo:      "siguiente_paso",
      accion:    next_best_action,
      texto:     null,
    },
  ];

  // Rebuild narrativa entries that severity overrides may have changed
  narrativa_jerarquizada[0].causa  = causa_principal;
  narrativa_jerarquizada[1].patron = patron_deuda;
  narrativa_jerarquizada[2].clase  = recuperabilidad_class;
  narrativa_jerarquizada[3].accion = next_best_action;

  narrativa_jerarquizada = narrativa_jerarquizada.map(function(e) {
    e.texto = textoParaNarrativa(e);
    return e;
  });

  return {
    causa_principal,
    causas_secundarias,
    patron_deuda,
    recuperabilidad,
    recuperabilidad_class,
    bloqueadores,
    next_best_action,
    contradiccion_conductual,
    narrativa_jerarquizada,
    confidence_level,
    interpretacion_parcial,
    interpretation_version: "miplan_v1",
    severity_stock:           sev.severity_stock,
    severity_behavioral:      sev.severity_behavioral,
    severity_level:           sev.severity_level,
    deuda_total_ingreso_ratio:sev.deuda_total_ingreso_ratio,
    max_deuda_ingreso_ratio:  sev.max_deuda_ingreso_ratio,
    has_unpaid_debt:          sev.has_unpaid_debt,
    has_mora_or_deje_pagar:   sev.has_mora_or_deje_pagar,
    severe_latent_pressure:   sev.severe_latent_pressure,
    dti_ratio:                fin.dti_ratio             != null ? fin.dti_ratio             : null,
    dti_level:                fin.dti_level             || null,
    confianza_diagnostico:    fin.confianza_diagnostico != null ? fin.confianza_diagnostico : null,
  };
}

// =============================================================================
// SPRINT 9 — HIDDEN FACTOR DETECTION ENGINE
//
// Returns true ONLY when the user appears financially healthy in declared data
// but came from a rejection — suggesting external/invisible factors may explain
// the rejection. Used to gate the Mi Plan Plus "hidden factor" CTA.
//
// Detection is purely local/contextual. This function makes NO claims about
// actual credit bureau status, eligibility, or approval likelihood.
// =============================================================================
function detectHiddenFactorOpportunity(diag) {
  if (!diag) return false;

  // Rejection origin: arrived via survey funnel or with survey URL params
  var vinoDeRechazo = (typeof TIENE_ENCUESTA !== "undefined" && TIENE_ENCUESTA === true)
    || (typeof PRE !== "undefined"
        && PRE.respuestas
        && Object.keys(PRE.respuestas).filter(function(k) { return PRE.respuestas[k] !== null; }).length > 0);
  if (!vinoDeRechazo) return false;

  var fin = diag.fin || {};
  // Sprint 12.1.b — visible debt stock is not a "hidden factor"
  if ((fin.dti_ratio || 0) >= 1) return false;
  var dtiLevel = fin.dti_level || "";
  if (dtiLevel === "elevado" || dtiLevel === "alto" || dtiLevel === "critico") return false;

  // Exclude all critical or compromised rendered states
  if (diag.planId === 4)  return false;
  if (diag.nivelR === "C") return false;

  var iv2 = diag.interpretacion_v2 || {};
  if (iv2.severity_level === "critico") return false;

  // Incomplete data degrades confidence — don't promote CTA on noisy data
  if (diag.gastos_missing_confirmed) return false;

  // Must have positive cashflow (both measures)
  if ((fin.flujoLibre != null ? fin.flujoLibre : 0) < 0) return false;
  var rad = typeof calcularRadiografia === "function" ? calcularRadiografia() : {};
  var fla = rad.flujoLibreActivo != null ? rad.flujoLibreActivo : (fin.flujoLibre != null ? fin.flujoLibre : 0);
  if (fla < 0) return false;

  // No suspended or collection-state debts
  var deudas = (window.CZState && window.CZState.deudas) || [];
  var hasBadDebt = deudas.some(function(d) {
    return d.situacion_ui === "deje_pagar"
      || d.situacion_ui === "mora_reclamo"
      || d.pago_fuente  === "mora_sin_pago";
  });
  if (hasBadDebt) return false;

  // Only A or B reset levels qualify (B+ excluded — already has clear trajectory)
  if (diag.nivelR !== "A" && diag.nivelR !== "B") return false;

  return true;
}

// =============================================================================
// DIAGNOSIS SNAPSHOT SYSTEM
// Captures a consolidated point-in-time view of the diagnosis state.
//
// IMPORTANT — When to call:
//   A. Consolidated snapshot (call buildDiagnosisSnapshot):
//      - step transition (next())
//      - dashboard generation
//      - checkout start
//      - payment completion
//   B. Transitional state (do NOT call):
//      - slider movement
//      - temporary simulation
//      - individual keystrokes
//
// This is NOT event-sourcing. It is simple snapshot persistence preparation.
// =============================================================================
function buildDiagnosisSnapshot() {
  var st       = window.CZState  || {};
  var identity = window.CZIdentity || {};

  // Always run calcularMotor() for a fresh, consistent diagnosis
  var motor;
  try {
    motor = calcularMotor();
  } catch (e) {
    motor = {};
  }

  var enc = motor.enc       || {};
  var fin = motor.fin       || {};
  var hor = motor.horizonte || {};

  return {
    snapshot_id:                   generateUUID(),
    timestamp:                     new Date().toISOString(),
    user_recovery_state:           st.user_recovery_state || null,

    // Algorithm version stamps — enables debugging when logic changes
    behavioral_algorithm_version:  BEHAVIORAL_ALGORITHM_VERSION,
    financial_algorithm_version:   FINANCIAL_ALGORITHM_VERSION,
    horizon_algorithm_version:     HORIZON_ALGORITHM_VERSION,
    interpretation_engine_version: INTERPRETATION_ENGINE_VERSION,

    // Scores — capped (visible) and raw (for analytics/ML)
    behavioral_score:       enc.score           != null ? enc.score              : null,
    behavioral_level:       enc.nivel            || null,
    financial_score:        motor.scoreReset     != null ? motor.scoreReset      : null,
    financial_score_raw:    motor.scoreResetRaw  != null ? motor.scoreResetRaw   : null,
    score_financiero_raw:   motor.scoreFinancieroRaw != null ? motor.scoreFinancieroRaw : null,
    guardrail_applied:      motor.guardrail_applied  != null ? motor.guardrail_applied  : false,
    guardrail_reason:       motor.guardrail_reason    || null,
    debt_ratio:             fin.ratio            != null ? fin.ratio              : null,
    free_cash_flow:         fin.flujoLibre       != null ? fin.flujoLibre         : null,
    dti_ratio:              fin.dti_ratio        != null ? fin.dti_ratio          : null,
    dti_level:              fin.dti_level        || null,
    confianza_diagnostico:  fin.confianza_diagnostico != null ? fin.confianza_diagnostico : null,

    // Blockers and horizon
    blockers:          motor.bloqueadores || [],
    horizon_band:      hor.banda          || null,
    horizon_months:    hor.meses          != null ? hor.meses        : null,

    // Sprint 7B.3 — severity signals from interpretacion_v2
    severity_stock:           (motor.interpretacion_v2 && motor.interpretacion_v2.severity_stock)           || null,
    severity_behavioral:      (motor.interpretacion_v2 && motor.interpretacion_v2.severity_behavioral)      || null,
    severity_level:           (motor.interpretacion_v2 && motor.interpretacion_v2.severity_level)           || null,
    has_unpaid_debt:          (motor.interpretacion_v2 && motor.interpretacion_v2.has_unpaid_debt)          || false,
    severe_latent_pressure:   (motor.interpretacion_v2 && motor.interpretacion_v2.severe_latent_pressure)   || false,
    deuda_total_ingreso_ratio:(motor.interpretacion_v2 && motor.interpretacion_v2.deuda_total_ingreso_ratio) || null,
    recuperabilidad_class:    (motor.interpretacion_v2 && motor.interpretacion_v2.recuperabilidad_class)    || null,

    // Input snapshots — source-tagged per input taxonomy
    debt_data_quality: calcularDebtDataQuality(st.deudas || []),

    debt_snapshot: (st.deudas || []).map(function(d) {
      return {
        tipo:                       d.tipo                       || null,
        monto:                      parseFloat(d.monto)          || 0,
        pago:                       parseFloat(d.pago)           || 0,
        estado:                     d.estado                     || null,
        situacion_ui:               d.situacion_ui               || null,
        pago_fuente:                d.pago_fuente                || null,
        atraso_tiempo:              d.atraso_tiempo              || null,
        atraso_tiempo_aprox:        d.atraso_tiempo_aprox        || null,
        ultimo_pago_declarado:      d.ultimo_pago_declarado      || null,
        pago_clarificacion:         d.pago_clarificacion         || null,
        debt_confidence:            d.debt_confidence            || null,
        interes_mensual_estimado:   d.interes_mensual_estimado   || 0,
        interes_mostrado:           d.interes_mostrado           || 0,
        capital_estimado:           d.capital_estimado           || 0,
        presion_latente_estimada:   d.presion_latente_estimada   || 0,
        costo_financiero_estimado:  d.costo_financiero_estimado  || false,
        acreedor_key:               d.acreedor_key               || null,
        acreedor_normalizado:       d.acreedor_normalizado       || null,
        _source:                    d._source                    || INPUT_SOURCES.DECLARED,
      };
    }),

    expense_snapshot: Object.keys(st.gastos || {}).reduce(function(acc, k) {
      acc[k] = {
        value:   parseFloat(st.gastos[k]) || 0,
        _source: INPUT_SOURCES.DECLARED,
      };
      return acc;
    }, {}),

    // Simulation flags — tracks active simulations at snapshot time
    // TODO Sprint 5B: wire liberador_activo to herr.simulador state
    simulation_flags: {
      liberador_activo:         false,
      ingresos_extra_activos:   !!(st.herr && st.herr.ingresos && st.herr.ingresos.extras && st.herr.ingresos.extras.length > 0),
    },

    // Legal acceptance — sourced from consent.js
    legal_acceptance: (typeof getLegalAcceptancePayload === "function")
      ? getLegalAcceptancePayload()
      : null,

    // Sprint 9 — incomplete data flag
    gastos_missing_confirmed: !!(window.CZState && window.CZState.gastos_missing_confirmed),

    // Sprint 10 — Mi Plan in-app consent (key fields for underwriting audit trail)
    miplan_consent: (function() {
      var c = window.CZState && window.CZState.consent;
      if (!c) return null;
      return {
        miplan_tc_accepted:       c.miplan_tc_accepted       || false,
        miplan_tc_version:        c.miplan_tc_version        || null,
        miplan_privacy_version:   c.miplan_privacy_version   || null,
        miplan_consent_timestamp: c.miplan_consent_timestamp || null,
      };
    })(),
  };
}
