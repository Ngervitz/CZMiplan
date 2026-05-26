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

  // Assemble result before passing to interpretation engine (Sprint 7A).
  // interpretacion_v2 is additive — diag.interpretacion (v1) is unchanged.
  const result = {
    enc, fin, scoreReset, nivelR,
    planId, plan: PLANES[planId],
    prio: deudaPrioritaria(), diasRec,
    bloqueadores, horizonte, interpretacion,
  };
  result.interpretacion_v2 = interpretarDiagnostico(result);
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

  // Latent pressure: the estimated monthly financial cost this debt generates
  // regardless of whether the user is actively paying. Used by CRM/recovery.
  // When pago = 0 (stopped paying): debt still accrues interest cost.
  var presionLatente = interesMensualEst;

  d.interes_mensual_estimado  = interesMensualEst;
  d.interes_mostrado          = interesMostrado;
  d.capital_estimado          = capitalEstimado;
  d.presion_latente_estimada  = presionLatente;
  d.costo_financiero_estimado = costoFinEst;

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
      estres_alto:       "El nivel de presión financiera declarado es alto. Eso puede dificultar la toma de decisiones.",
      presion_informal:  "Parte de la presión financiera ocurre fuera del sistema formal, sin registro en Clearing o BCU.",
      deuda_cara:        "La deuda prioritaria tiene un costo financiero alto en relación al ingreso disponible.",
      demasiadas_deudas: "La cantidad de obligaciones simultáneas está fragmentando el margen mensual disponible.",
      sin_accion:        "No se registran acciones concretas recientes para ordenar la situación financiera.",
      falta_organizacion:"El panorama financiero no está completamente claro, lo que dificulta detectar por dónde empezar.",
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
      recuperable_rapido:      "El perfil muestra condiciones para una recuperación relativamente rápida si se actúa sobre la causa principal.",
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
    patron_deuda           = "sin_patron";  // insufficient data to assert pattern
    causas_secundarias     = [];            // secondary causes require reliable data
    interpretacion_parcial = true;
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
  };
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

    // Scores
    behavioral_score:  enc.score      != null ? enc.score          : null,
    behavioral_level:  enc.nivel       || null,
    financial_score:   motor.scoreReset != null ? motor.scoreReset  : null,
    debt_ratio:        fin.ratio        != null ? fin.ratio          : null,
    free_cash_flow:    fin.flujoLibre   != null ? fin.flujoLibre     : null,

    // Blockers and horizon
    blockers:          motor.bloqueadores || [],
    horizon_band:      hor.banda          || null,
    horizon_months:    hor.meses          != null ? hor.meses        : null,

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
  };
}
