// =============================================================================
// algorithms.js — Motor de calculos financieros y asignacion de planes
// Depende de: config.js, survey.js, creditors.js
// =============================================================================

// --- Estado compartido (leido desde app.js via window) ---
function _gastos()  { return window.CZState ? window.CZState.gastos : {}; }
function _deudas()  { return window.CZState ? window.CZState.deudas : []; }
function _snap()    { return window.CZState ? window.CZState.snap   : null; }

// Sprint 12.2 — paid/settled debts stay in array but skip active calculations
function deudasActivasParaCalculo(deudas) {
  return (deudas || []).filter(function(d) {
    return !d.cancelada && d.situacion_ui !== "pagada";
  });
}

function isDeudaPagada(d) {
  return !!(d && (d.cancelada || d.situacion_ui === "pagada"));
}

// =============================================================================
// PLANES
// =============================================================================
const PLANES = {
  1: {
    id: 1, icon: "🗂️", titulo: "Orden Financiero", color: "#5b7cff",
    problema:  "No tenés claro cuánto entra, cuánto sale ni cuánto debés. Sin eso, cualquier plan es a ciegas.",
    objetivo:  "Entender exactamente tu situación financiera antes de tomar cualquier decisión.",
    prioridades: [
      "Anotar todo lo que entra y todo lo que sale este mes, sin excepción.",
      "Separar lo que no podés dejar de pagar de lo que podés reducir.",
      "Calcular cuánta plata te queda libre cada mes después de pagar todo.",
    ],
    cta: "Completar mapa financiero", reevaluacion: "30 días",
  },
  2: {
    id: 2, icon: "📉", titulo: "Reducción de Deuda", color: "#ff4e72",
    problema:  "Estás pagando demasiado en relación a lo que ganás. Cada mes es un esfuerzo y no alcanzás a salir.",
    objetivo:  "Bajar lo que pagás por mes y atacar primero las deudas que más te están frenando.",
    prioridades: [
      "Atacar primero la deuda que más daño te hace — la que está en mora o la más cara.",
      "No sacar ninguna deuda nueva por al menos 30 días.",
      "Llamar al banco o financiera para negociar. Muchas veces aceptan planes que no publicitan.",
    ],
    cta: "Ver deuda prioritaria", reevaluacion: "60 a 90 días",
  },
  3: {
    id: 3, icon: "🚀", titulo: "Recuperación Rápida", color: "#34ffaf",
    problema:  "Tu situación está bien encaminada. Hay algunos detalles que corregir antes de una nueva evaluación.",
    objetivo:  "Hacer los ajustes puntuales que faltan antes de una nueva evaluación del perfil declarado.",
    prioridades: [
      "Pagar todo en fecha. Un solo atraso puede echarte atrás meses de progreso.",
      "Bajar lo que pagás en deudas para que sea menos del 30% de lo que ganás.",
      "En 30-60 días volver a evaluar el perfil declarado y revisar qué cambió.",
    ],
    cta: "Activar plan 30-60 dias", reevaluacion: "30 a 60 días",
  },
  4: {
    id: 4, icon: "🚨", titulo: "Estabilización Crítica", color: "#ff4e72",
    problema:  "Tu situación está en un punto crítico. Antes de pedir otro crédito, hay que estabilizar lo que tenés.",
    objetivo:  "Parar la caída primero. Estabilizarte. Después, con la situación ordenada, pensar en el crédito.",
    prioridades: [
      "No tomar ninguna deuda nueva en este periodo.",
      "Ordenar las deudas informales y las que están en mora. Son las que más daño hacen.",
      "Lograr que cada mes te sobre aunque sea un poco. Eso es la base de todo.",
    ],
    cta: "Empezar primeros auxilios", reevaluacion: "90 a 120 días",
  },
  5: {
    id: 5, icon: "🔄", titulo: "Reperfilamiento", color: "#a78bfa",
    problema:  "Tu historial declarado muestra atrasos o mora. Regularizar pagos y sostenerlos en fecha ayuda a mejorar el perfil.",
    objetivo:  "Reconstruir el perfil con hábitos sostenidos, menor presión de deuda y seguimiento.",
    prioridades: [
      "Hacer lo mismo bien durante 60-90 días seguidos. La constancia es lo que reconstruye el historial.",
      "Regularizar o negociar los atrasos que figuran reportados. Eso limpia el perfil.",
      "En 90 días, volver a medir el avance antes de pedir el crédito.",
    ],
    cta: "Iniciar seguimiento 90 dias", reevaluacion: "90 días",
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
// Sprint B6a — debt cost (interesProm) vs financial stress (nivelRiesgo) are separate.
// costoDeudaNivel feeds recommendations/prioritization; nivelRiesgo feeds plan stress gates.
function evaluarCostoDeuda(interesProm) {
  if (interesProm > 90) return "Alto";
  if (interesProm > 60) return "Medio";
  return "Bajo";
}

function calcularFinanciero() {
  const gastos = _gastos();
  const deudas = deudasActivasParaCalculo(_deudas());

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

  // Affordability / payment-burden only — NOT debt cost (see costoDeudaNivel).
  let nivelRiesgo = "Bajo";
  if (totalPago > 50000) nivelRiesgo = "Critico";
  else if (totalPago > 25000) nivelRiesgo = "Medio";

  var costoDeudaNivel = evaluarCostoDeuda(interesProm);

  var fin = {
    totalGastos, totalDeuda, totalPago, flujoLibre, ratio,
    interesProm, costoDeudaNivel, scoreFinanciero: score, nivelRiesgo,
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
  const deudas = deudasActivasParaCalculo(_deudas());
  if (!deudas.length) return null;
  return [...deudas].sort((a, b) => calcularPrioridad(b) - calcularPrioridad(a))[0];
}

// =============================================================================
// ASIGNACION DE PLAN
// fin.nivelRiesgo = affordability stress (pagos absolutos), not debt cost.
// fin.costoDeudaNivel = weighted rate tier — recommendations only (Sprint B6a).
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
      principal:  "Con los números que ingresaste, hoy no hay margen para asumir otra cuota.",
      secundaria: "Pedir más plata puede dar alivio corto, pero aumenta el riesgo de atrasarte más.",
    };
  }
  // Caso 2 — flujo positivo pero con atrasos activos
  if (fin.cantMoras > 0) {
    return {
      principal:  "Tus ingresos todavía dejan algo de margen, pero los atrasos actuales ya están afectando tu perfil.",
      secundaria: "Antes de pedir más crédito, conviene regularizar lo que ya figura atrasado.",
    };
  }
  // Caso 3 — deuda informal presente (sin caso 1 ni 2)
  if (fin.cantInformales > 0) {
    return {
      principal:  "Tenés deuda informal activa que puede estar presionando tu flujo mensual.",
      secundaria: "No siempre figura en Clearing o BCU, pero puede complicar el resto de tus pagos.",
    };
  }
  // Caso 4 — ratio alto sin atrasos
  if (fin.ratio > 0.35) {
    return {
      principal:  "Hoy venís cumpliendo, pero una parte alta de tus ingresos ya está comprometida en cuotas.",
      secundaria: "Una cuota nueva puede dejarte sin margen ante cualquier imprevisto.",
    };
  }
  // Caso 5 — default
  return {
    principal:  "Tu situación necesita orden, pero todavía hay margen para corregir sin tomar decisiones apuradas.",
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
  if (meses <= 1)       { banda = "inmediato"; label = "Revisión posible en el corto plazo"; }
  else if (meses <= 3)  { banda = "corto";     label = "Próximos 2 a 3 meses"; }
  else if (meses <= 6)  { banda = "corto";     label = "Próximos 4 a 6 meses"; }
  else if (meses <= 12) { banda = "medio";     label = "Dentro de 6 a 12 meses"; }
  else if (meses <= 24) { banda = "medio";     label = "Dentro de 1 a 2 años"; }
  else                  { banda = "largo";     label = "Más de 2 años"; }
  return { meses, banda, label };
}

// =============================================================================
// DEBT SANITY GUARD — implausible payment vs debt stock (pre-plan / pre-retry)
// Known limitation: may false-positive on genuine minimum-payment / mora cases
// (e.g. income 45k, debt 200k, payment 400). Goal: block obviously invalid retry paths.
// =============================================================================
function evaluarDebtSanityGuard(fin, ingreso) {
  fin = fin || {};
  ingreso = ingreso != null ? ingreso : 0;
  var totalDeuda = fin.totalDeuda != null ? fin.totalDeuda : 0;
  var totalPago = fin.totalPago != null ? fin.totalPago : 0;
  if (ingreso <= 0 || totalDeuda <= 0) return { triggered: false };
  // Require a declared payment > 0: empty/no_declarado pago is a separate signal (Partner K).
  if (totalDeuda > ingreso * 3 && totalPago > 0 && totalPago <= ingreso * 0.01) {
    return { triggered: true };
  }
  return { triggered: false };
}

function buildHorizonteEstabilizacionRequerida() {
  return {
    meses: null,
    banda: "no_estimable",
    label: "No estimable sin estabilización previa",
    requires_stabilization: true,
  };
}

function isHorizonPositiveForRetry(diag) {
  var h = (diag && diag.horizonte) || {};
  if (h.requires_stabilization || h.banda === "no_estimable") return false;
  return h.banda === "inmediato" || h.banda === "corto";
}

function isRetryHorizonBlocked(diag) {
  var h = (diag && diag.horizonte) || {};
  if (h.requires_stabilization || h.banda === "no_estimable") return true;
  var iv2 = (diag && diag.interpretacion_v2) || {};
  if (iv2.recuperabilidad_class === "requiere_estabilizacion"
      || iv2.recuperabilidad_class === "no_accionable") {
    return true;
  }
  return !isHorizonPositiveForRetry(diag);
}

function isRetryEligible(diag, st) {
  diag = diag || {};
  st = st || {};
  var fin = diag.fin || {};
  var iv2 = diag.interpretacion_v2 || {};
  var diagPlan = parseInt(diag.planId, 10);
  var flujo = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var ratio = fin.ratio != null ? fin.ratio : 0;
  var ingreso = (typeof PRE !== "undefined" && PRE.ingreso) || 0;
  var dti = fin.dti_ratio != null ? fin.dti_ratio : 0;
  var scoreReset = diag.scoreReset != null ? diag.scoreReset : 30;
  var scoreFin = fin.scoreFinanciero != null ? fin.scoreFinanciero : 30;

  if (isNaN(diagPlan) || diagPlan >= 4) return false;
  if (diag.nivelR === "C") return false;
  if (iv2.severity_level === "critico" || iv2.severity_level === "alto") return false;
  if (typeof SEVERITY_CRITICO_SCORE_RESET_MAX !== "undefined"
      && scoreReset <= SEVERITY_CRITICO_SCORE_RESET_MAX) {
    return false;
  }
  if (typeof SEVERITY_CRITICO_SCORE_FIN_MAX !== "undefined"
      && scoreFin <= SEVERITY_CRITICO_SCORE_FIN_MAX) {
    return false;
  }
  if (isRetryHorizonBlocked(diag)) return false;
  if (iv2.confidence_level === "low") return false;
  if (diag.financial_reality_warning === true) return false;
  if (diag.missing_payment_information === true || iv2.missing_payment_information === true) {
    return false;
  }
  if (flujo <= 0) return false;
  if (ratio > 0.35) return false;
  if (ingreso > 0 && dti >= 1) return false;
  if (evaluarDebtSanityGuard(fin, ingreso).triggered) return false;
  if (!isHorizonPositiveForRetry(diag)) return false;
  return true;
}

// =============================================================================
// FINANCIAL REALITY WARNING — additive presentation layer
// Uses fin.totalPago and PRE.ingreso from calcularFinanciero(); does not alter
// scoring, plan assignment, guardrails, DTI, horizonte, or interpretation.
// =============================================================================
function evaluarFinancialRealityWarning(fin, ingreso) {
  fin = fin || {};
  var totalPagosDeuda = fin.totalPago != null ? fin.totalPago : 0;
  ingreso = ingreso != null ? ingreso : 0;

  if (ingreso <= 0) {
    return {
      financial_reality_warning: false,
      financial_reality_warning_type: null,
    };
  }

  if (totalPagosDeuda > ingreso) {
    return {
      financial_reality_warning: true,
      financial_reality_warning_type: "payments_exceed_income",
    };
  }

  if (totalPagosDeuda >= ingreso * 0.8 && totalPagosDeuda <= ingreso) {
    return {
      financial_reality_warning: true,
      financial_reality_warning_type: "high_payment_pressure",
    };
  }

  return {
    financial_reality_warning: false,
    financial_reality_warning_type: null,
  };
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

// =============================================================================
// PLAN GUARDRAIL — Sprint 12.1.c (conservative affordability revision)
//
// Post-processes planId after interpretarDiagnostico().
// fin.ratio (monthly payments / income) is the primary affordability pressure metric.
// fin.dti_ratio remains structural stock load — may raise plan by at most +1, never
// force Plan 4 alone when flow is positive, monthly ratio is manageable, and there is
// no mora / real survey or external critical risk.
// =============================================================================
function _guardrailEncuestaIncompleta(resp) {
  if (!TIENE_ENCUESTA) return true;
  resp = resp || {};
  var answered = 0;
  for (var i = 1; i <= 10; i++) {
    var v = resp["p" + i];
    if (v === "A" || v === "B" || v === "C" || v === "D") answered++;
  }
  return answered === 0;
}

function _guardrailEncuestaCriticaReal(enc, resp) {
  if (_guardrailEncuestaIncompleta(resp)) return false;
  enc = enc || {};
  return enc.nivel === "C" || (enc.flagsRiesgo && enc.flagsRiesgo.length > 0);
}

function _guardrailHasActiveMora(fin, iv2, behav) {
  behav = behav || (fin && fin.behavioral) || {};
  iv2   = iv2   || {};
  fin   = fin   || {};
  return (fin.cantMoras || 0) >= 2
    || !!iv2.has_mora_or_deje_pagar
    || !!behav.tiene_mora_declarada
    || behav.dominant_situacion === "deje_pagar"
    || behav.dominant_situacion === "mora_reclamo"
    || iv2.severity_behavioral === "critico";
}

function _guardrailExternalBcuCritico(diag) {
  var live = typeof CZ_PLUS_BCU_CLEARING_LIVE !== "undefined" && CZ_PLUS_BCU_CLEARING_LIVE;
  if (!live || !diag) return false;
  var snap = _snap();
  if (snap && (snap.bcu_risk_critico || snap.clearing_risk_critico)) return true;
  var iv2 = diag.interpretacion_v2 || {};
  return !!(iv2.bcu_risk_critico || iv2.clearing_risk_critico);
}

function _guardrailAffordabilityPlan(enc, fin) {
  var r = PRE.respuestas || {};
  var ratio = fin.ratio != null ? fin.ratio : 0;
  var RATIO_ALTO = 0.35;
  var RATIO_CRITICO = 1.0;

  if (fin.flujoLibre < 0 || fin.cantInformales > 0 || fin.cantMoras >= 2) return 4;
  if (ratio >= RATIO_CRITICO) return 4;
  if (ratio >= RATIO_ALTO || fin.cantMoras > 0 || fin.nivelRiesgo === "Critico") return 2;
  if (fin.nivelRiesgo === "Medio"
      && (r.p1 === "C" || r.p1 === "D" || r.p7 === "C" || r.p7 === "D")) return 1;
  if ((enc.nivel === "A" || enc.nivel === "B+")
      && ratio < RATIO_ALTO && fin.cantMoras === 0 && fin.flujoLibre > 0) return 3;
  if ((r.p3 === "A" || r.p3 === "B")
      && (r.p8 === "A" || r.p8 === "B")
      && (r.p9 === "A" || r.p9 === "B")) return 5;
  return 1;
}

function applyPlanGuardrail(planIdRaw, diag) {
  var iv2      = diag.interpretacion_v2 || {};
  var fin      = diag.fin || {};
  var enc      = diag.enc || {};
  var behav    = fin.behavioral || {};
  var resp     = PRE.respuestas || {};
  var ingreso  = PRE.ingreso || 0;
  var ratio    = fin.ratio != null ? fin.ratio : 0;
  var dti      = fin.dti_ratio != null ? fin.dti_ratio : 0;
  var flujoLibre = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var RATIO_ALTO     = 0.35;
  var RATIO_CRITICO  = 1.0;
  var DTI_STOCK_BUMP = 1.5;
  var finalId  = planIdRaw;
  var reason   = null;

  var encCriticaReal = _guardrailEncuestaCriticaReal(enc, resp);
  var hasMora        = _guardrailHasActiveMora(fin, iv2, behav);
  var bcuCritico     = _guardrailExternalBcuCritico(diag);

  var forcePlan4 = null;
  if (ingreso <= 0) {
    forcePlan4 = "ingreso_cero";
  } else if (hasMora) {
    forcePlan4 = "mora_activa";
  } else if (fin.cantInformales > 0) {
    forcePlan4 = "deuda_informal";
  } else if (bcuCritico) {
    forcePlan4 = "bcu_clearing_critico";
  } else if (encCriticaReal) {
    forcePlan4 = "encuesta_critica";
  } else if (ratio >= RATIO_CRITICO) {
    forcePlan4 = "ratio_mensual_critico";
  } else if (flujoLibre < 0 && (ratio >= RATIO_ALTO || (fin.totalPago || 0) > 0 || dti >= 1)) {
    forcePlan4 = "flujo_negativo_presion";
  } else if (iv2.severe_latent_pressure && flujoLibre <= 0) {
    forcePlan4 = "presion_latente_severa";
  } else if (iv2.severity_stock === "critico"
      && (flujoLibre < 0 || ratio >= RATIO_ALTO)) {
    forcePlan4 = "stock_critico_con_presion";
  }

  if (forcePlan4) {
    finalId = 4;
    reason  = forcePlan4;
  } else if (planIdRaw === 4
      && flujoLibre >= 0
      && ratio < RATIO_CRITICO
      && !hasMora
      && ingreso > 0) {
    finalId = _guardrailAffordabilityPlan(enc, fin);
    reason  = "relax_plan_4_sin_presion";
  } else if (planIdRaw === 3
      && (fin.totalDeuda || 0) === 0
      && ratio < RATIO_ALTO
      && flujoLibre > 0
      && !hasMora) {
    finalId = 1;
    reason  = "sin_deuda_cap_plan_1";
  }

  if (!forcePlan4 && dti >= DTI_STOCK_BUMP && finalId < 3) {
    if (finalId === 1) {
      finalId = 2;
      reason  = reason || "dti_stock_bump_plus_1";
    } else if (finalId === 2 && ratio > RATIO_ALTO && ratio < RATIO_CRITICO) {
      finalId = 3;
      reason  = reason || "dti_stock_bump_plus_1";
    } else if (finalId === 2 && ratio <= RATIO_ALTO && dti >= DTI_STOCK_BUMP) {
      var nDeudasActivas = deudasActivasParaCalculo(_deudas()).length;
      if ((fin.cantMoras || 0) > 0 || nDeudasActivas >= 5) {
        finalId = 3;
        reason  = reason || "dti_stock_bump_plus_1";
      }
    }
  }

  if (!forcePlan4 && dti >= 10 && finalId >= 3) {
    finalId = 2;
    reason  = reason || "dti_stock_extremo_cap";
  }

  var applied = finalId !== planIdRaw;
  if (!applied) reason = null;

  return {
    planId:                 finalId,
    assigned_plan_raw:      planIdRaw,
    assigned_plan_final:    finalId,
    plan_guardrail_applied: applied,
    plan_guardrail_reason:  reason,
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
  const planIdRaw = asignarPlan(enc, fin);
  if (planIdRaw === 4) nivelR = "C";
  if (planIdRaw === 2 && nivelR === "A") nivelR = "B";
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
    planId: planIdRaw, plan: PLANES[planIdRaw],
    prio: deudaPrioritaria(), diasRec,
    bloqueadores, horizonte, interpretacion,
  };

  // Run interpretation engine (needs raw scores + behavioral signals).
  result.interpretacion_v2 = interpretarDiagnostico(result);

  // ── Sprint 12.1.c plan guardrail — after severity, before score cap ────────
  var planGuardrail = applyPlanGuardrail(planIdRaw, result);
  result.planId                    = planGuardrail.planId;
  result.plan                      = PLANES[planGuardrail.planId];
  result.assigned_plan_raw         = planGuardrail.assigned_plan_raw;
  result.assigned_plan_final       = planGuardrail.assigned_plan_final;
  result.plan_guardrail_applied    = planGuardrail.plan_guardrail_applied;
  result.plan_guardrail_reason     = planGuardrail.plan_guardrail_reason;

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
  if (result.planId === 4) result.nivelR = "C";
  if (result.planId === 2 && result.nivelR === "A") result.nivelR = "B";

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

  alignInterpretacionV2ConPlan(result.interpretacion_v2, result.planId);

  var frWarning = evaluarFinancialRealityWarning(fin, PRE.ingreso);
  result.financial_reality_warning      = frWarning.financial_reality_warning;
  result.financial_reality_warning_type = frWarning.financial_reality_warning_type;

  var debtSanity = evaluarDebtSanityGuard(fin, PRE.ingreso);
  if (debtSanity.triggered && result.interpretacion_v2) {
    result.interpretacion_v2.missing_payment_information = true;
    result.interpretacion_v2.confidence_level = "low";
    result.horizonte = buildHorizonteEstabilizacionRequerida();
  }

  result.missing_payment_information    = !!(result.interpretacion_v2
    && result.interpretacion_v2.missing_payment_information);

  // Partner recommended_tools — extensible list (MiDeuda, Equifax, Sura, etc.)
  // Current contract: string ids e.g. ["mideuda"].
  // Future evolution: [{ id, priority }] without changing motor entry point.
  var partnerSignals = calcularPartnerSignals(deudas, fin);
  result.recommended_tools         = calcularRecommendedTools(partnerSignals);
  result.mora_activa             = partnerSignals.mora_activa;
  result.deuda_vencida           = partnerSignals.deuda_vencida;
  result.flag_demasiadas_deudas  = partnerSignals.flag_demasiadas_deudas;
  result.flag_deuda_cara         = partnerSignals.flag_deuda_cara;
  result.deuda_fuera_sistema     = partnerSignals.deuda_fuera_sistema;
  result.flag_deuda_sin_pagos    = partnerSignals.flag_deuda_sin_pagos;
  result.flag_deuda_sanity_extreme = partnerSignals.flag_deuda_sanity_extreme;

  return result;
}

// =============================================================================
// PARTNER RECOMMENDED TOOLS — MiDeuda + future partners (Equifax, Sura, etc.)
// recommended_tools[] is rendered by UI; rules live here, not hardcoded per plan.
// =============================================================================
var PARTNER_CARO_TIPOS = [
  "tarjeta", "financiera", "prestamo_consumo", "credito_al_consumo",
];

function isDeudaTasaEstimadaAlta(d) {
  if (!d) return false;
  var tasa = typeof TASAS !== "undefined" ? (TASAS[d.tipo] || 0) : 0;
  return tasa >= 78;
}

function isDeudaCategoriaCara(d) {
  if (!d || !d.tipo) return false;
  return PARTNER_CARO_TIPOS.indexOf(d.tipo) >= 0;
}

function isDeudaFueraSistema(d) {
  if (!d || (typeof isDeudaPagada === "function" && isDeudaPagada(d))) return false;
  if (d.tipo === "informal") return true;
  var raw = String(d.acreedor_raw || d.acreedor || "").toLowerCase();
  if (/famil|familiar|amig|amigo|prestamist|informal/.test(raw)) return true;
  return false;
}

// Partner MiDeuda — formal active debt with monto > 0, not outside system.
function isDeudaFormalActivaPartner(d) {
  if (!d || (typeof isDeudaPagada === "function" && isDeudaPagada(d))) return false;
  if (d.tipo === "informal") return false;
  if (isDeudaFueraSistema(d)) return false;
  return (parseFloat(d.monto) || 0) > 0;
}

// Explicit zero-payment signal for MiDeuda partner eligibility.
// true when formal active debt with monto > 0 AND:
//   - pago explicitly entered as 0, OR
//   - pago_fuente is no_paga / mora_sin_pago (user declared stopped/no payment)
// false when pago is empty/null or pago_fuente is no_declarado.
function isDeudaSinPagosExplicita(d) {
  if (!isDeudaFormalActivaPartner(d)) return false;
  if (d.pago_fuente === "no_declarado") return false;
  if (d.pago_fuente === "no_paga" || d.pago_fuente === "mora_sin_pago") return true;
  var pagoStr = d.pago == null ? "" : String(d.pago).trim();
  if (pagoStr === "") return false;
  var parsed = parseFloat(pagoStr.replace(",", "."));
  if (Number.isNaN(parsed)) return false;
  return parsed === 0;
}

// Backward-compatible alias used by QA/debug harnesses.
function isPagoMensualExplicitoCero(d) {
  return isDeudaSinPagosExplicita(d);
}

function calcularPartnerSignals(deudas, fin) {
  deudas = deudasActivasParaCalculo(deudas || []);
  fin = fin || {};
  var mora_activa = deudas.some(function(d) {
    return d.situacion_ui === "mora_reclamo" || d.situacion_ui === "deje_pagar";
  }) || (fin.cantMoras || 0) > 0;
  var deuda_vencida = deudas.some(function(d) {
    var sit = d.situacion_ui || "";
    return sit === "atrasado_pagando" || sit === "deje_pagar" || sit === "mora_reclamo";
  });
  var flag_demasiadas_deudas = deudas.length >= 3;
  var flag_deuda_cara = deudas.some(function(d) {
    return isDeudaTasaEstimadaAlta(d) || isDeudaCategoriaCara(d);
  });
  var deuda_fuera_sistema = deudas.some(isDeudaFueraSistema);
  var flag_deuda_sin_pagos = deudas.some(isDeudaSinPagosExplicita);
  var ingreso = (typeof PRE !== "undefined" && PRE.ingreso) || 0;
  var flag_deuda_sanity_extreme = evaluarDebtSanityGuard(fin, ingreso).triggered;

  return {
    mora_activa: mora_activa,
    deuda_vencida: deuda_vencida,
    flag_demasiadas_deudas: flag_demasiadas_deudas,
    flag_deuda_cara: flag_deuda_cara,
    deuda_fuera_sistema: deuda_fuera_sistema,
    flag_deuda_sin_pagos: flag_deuda_sin_pagos,
    flag_deuda_sanity_extreme: flag_deuda_sanity_extreme,
  };
}

function calcularRecommendedTools(signals) {
  signals = signals || {};
  var tools = [];
  if (
    (signals.mora_activa
      || signals.deuda_vencida
      || signals.flag_demasiadas_deudas
      || signals.flag_deuda_cara
      || signals.flag_deuda_sin_pagos
      || signals.flag_deuda_sanity_extreme)
    && !signals.deuda_fuera_sistema
  ) {
    tools.push("mideuda");
  }
  return tools;
}

// =============================================================================
// RADIOGRAFIA FINANCIERA — 5 indicadores
// =============================================================================
function calcularRadiografia() {
  const fin  = calcularFinanciero();
  const deudas = _deudas();
  const ing  = PRE.ingreso;

  // 1. Interes puro mensual — active debts only (excludes cancelada / pagada)
  const interesMensualTotal = deudasActivasParaCalculo(deudas).reduce((s, d) => {
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
    if (isDeudaPagada(d)) return s;
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
  deudas = deudasActivasParaCalculo(deudas || []);
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
// STAGE-01 — Financial stage resolver (pure; no narrative consumption yet)
// =============================================================================
// GUARDRAIL:
// Financial stage must not read or depend on entry_context.
// Financial stage must not read or depend on declared user goals (P11 intent).
// RECHAZO_CDV does not imply debt.
// RECHAZO_CDV does not imply mora.
// RECHAZO_CDV does not imply financial pressure.
// Declared goals do not alter financial stage.

var STAGE_RATIO_ALTO = 0.35;
var STAGE_RATIO_OPTIMIZACION_MAX = 0.20;
var STAGE_DTI_RELEVANT_LIABILITY = 0.5;

function _stageIncome(st, fin) {
  if (st && st.declared_ingreso != null) {
    var declared = parseFloat(st.declared_ingreso);
    if (isFinite(declared) && declared > 0) return declared;
  }
  if (typeof PRE !== "undefined" && PRE.ingreso > 0) return PRE.ingreso;
  if (fin && fin.ingreso > 0) return fin.ingreso;
  return 0;
}

function _stageHasInsufficientData(diag, st, fin, iv2) {
  if (_stageIncome(st, fin) <= 0) return true;

  if (typeof hasCompletedFinancialInputs === "function") {
    if (!hasCompletedFinancialInputs(st || {})) return true;
  } else if (st && !st.financial_income_complete && _stageIncome(st, fin) <= 0) {
    return true;
  }

  if (!fin || fin.flujoLibre == null || !isFinite(fin.flujoLibre)) return true;

  return false;
}

function _stageLowConfidenceBlocksStaging(diag, st, fin, iv2) {
  if (!iv2 || iv2.confidence_level !== "low") return false;

  if (diag && diag.missing_payment_information && fin.flujoLibre < 0) return true;
  if (iv2.missing_payment_information && fin.flujoLibre < 0) return true;

  if (iv2.interpretacion_parcial) {
    var noDebtDeclared = !!(st && st.no_debts_declared);
    var hasLiabilities = _stageHasRelevantLiabilities(fin);
    if (!hasLiabilities && !noDebtDeclared) return true;
  }

  return false;
}

function _stageHasRecoveryPressure(diag, fin, iv2) {
  fin = fin || {};
  iv2 = iv2 || {};
  var flujoLibre = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var ratio = fin.ratio != null ? fin.ratio : 0;
  var cantMoras = fin.cantMoras || 0;
  var behav = fin.behavioral || {};

  if (flujoLibre < 0) return true;
  if (cantMoras > 0) return true;
  if (diag && diag.mora_activa) return true;
  if (iv2.has_mora_or_deje_pagar) return true;
  if (behav.tiene_mora_declarada) return true;
  if (ratio >= STAGE_RATIO_ALTO) return true;
  if (iv2.severity_level === "critico") {
    if (flujoLibre < 0 || ratio >= STAGE_RATIO_OPTIMIZACION_MAX || cantMoras > 0) return true;
    if (iv2.has_mora_or_deje_pagar || behav.tiene_mora_declarada) return true;
    if ((fin.totalPago || 0) > 0 && ratio >= STAGE_RATIO_OPTIMIZACION_MAX) return true;
    return false;
  }
  if (iv2.severity_level === "alto" && (flujoLibre < 0 || ratio >= STAGE_RATIO_OPTIMIZACION_MAX)) {
    return true;
  }
  if (iv2.severe_latent_pressure && flujoLibre < 0) return true;

  return false;
}

function _stageHasRelevantLiabilities(fin) {
  fin = fin || {};
  var totalDeuda = fin.totalDeuda || 0;
  var totalPago = fin.totalPago || 0;
  var dti = fin.dti_ratio != null ? fin.dti_ratio : 0;
  return totalDeuda > 0 || totalPago > 0 || dti >= STAGE_DTI_RELEVANT_LIABILITY;
}

function resolveFinancialStage(diag, st) {
  diag = diag || {};
  st = st || {};
  var fin = diag.fin || {};
  var iv2 = diag.interpretacion_v2 || {};

  if (_stageHasInsufficientData(diag, st, fin, iv2)) return "CLARIDAD";
  if (_stageHasRecoveryPressure(diag, fin, iv2)) return "RECUPERACION";
  if (_stageLowConfidenceBlocksStaging(diag, st, fin, iv2)) return "CLARIDAD";
  if (_stageHasRelevantLiabilities(fin)) return "ESTABILIZACION";
  return "OPTIMIZACION";
}

function attachFinancialStageToDiag(diag, st) {
  if (!diag) return diag;
  diag.financial_stage = resolveFinancialStage(diag, st);
  if (typeof attachNarrativeDecisionToDiag === "function") {
    attachNarrativeDecisionToDiag(diag, st);
  }
  return diag;
}

// =============================================================================
// NARRATIVE-01 — Financial narrative orchestrator (decisions only; no copy)
// =============================================================================
// GUARDRAIL:
// narrative_mode is driven by financial_stage.
// Declared user goals (P11 intent) cannot override financial reality.
// entry_context cannot override financial reality.
// RECHAZO_CDV does not imply debt.
// RECHAZO_CDV does not imply recovery.
// NARRATIVE-01 must not generate copy.
// NARRATIVE-01 must not alter rendering.

var NARRATIVE_STAGE_TO_MODE = {
  CLARIDAD:      "CLARITY",
  RECUPERACION:  "RECOVERY",
  ESTABILIZACION:"STABILIZATION",
  OPTIMIZACION:  "OPTIMIZATION",
};

var NARRATIVE_STAGE_TO_TIER = {
  CLARIDAD:      "UNKNOWN",
  RECUPERACION:  "AT_RISK",
  ESTABILIZACION:"IMPROVING",
  OPTIMIZACION:  "HEALTHY",
};

var NARRATIVE_VALID_STAGES = ["CLARIDAD", "RECUPERACION", "ESTABILIZACION", "OPTIMIZACION"];
var NARRATIVE_VALID_INTENTS = ["RECUPERAR", "ORDENAR", "CREDITO", "OPTIMIZAR"];

function _normalizeNarrativeFinancialStage(value) {
  if (value == null) return null;
  var s = String(value).trim();
  return NARRATIVE_VALID_STAGES.indexOf(s) >= 0 ? s : null;
}

function _normalizeNarrativeUserIntent(value) {
  if (typeof normalizeUserIntent === "function") {
    return normalizeUserIntent(value);
  }
  if (value == null) return null;
  var s = String(value).trim();
  if (s === "") return null;
  return NARRATIVE_VALID_INTENTS.indexOf(s) >= 0 ? s : null;
}

function _narrativeContextModifier(entryContext) {
  entryContext = entryContext || {};
  if (entryContext.hasRejectionContext === true) return "REJECTED_EXTERNAL";
  if (entryContext.entryContext === "cdv_rejected") return "REJECTED_EXTERNAL";
  return "DEFAULT";
}

function _resolveNarrativeFocusTarget(narrativeMode, userIntent) {
  if (narrativeMode === "RECOVERY") return "RECOVERY_URGENT";
  if (narrativeMode === "STABILIZATION") return "BUDGET_STABILIZATION";
  if (narrativeMode === "OPTIMIZATION") {
    if (userIntent === "CREDITO") return "CREDIT_BUILDING";
    if (userIntent === "ORDENAR") return "LEARNING";
  }
  return "DEFAULT";
}

function resolveNarrativeDecision(financialStage, userIntent, entryContext, planId) {
  // planId reserved for future narrative phases — not consumed in NARRATIVE-01.
  void planId;

  var stage = _normalizeNarrativeFinancialStage(financialStage);
  if (!stage) {
    return {
      narrative_mode: "CLARITY",
      profile_tier: "UNKNOWN",
      sub_tracks: {
        focus_target: "DEFAULT",
        context_modifier: _narrativeContextModifier(entryContext),
      },
    };
  }

  var narrativeMode = NARRATIVE_STAGE_TO_MODE[stage] || "CLARITY";
  var profileTier = NARRATIVE_STAGE_TO_TIER[stage] || "UNKNOWN";
  var intent = _normalizeNarrativeUserIntent(userIntent);

  return {
    narrative_mode: narrativeMode,
    profile_tier: profileTier,
    sub_tracks: {
      focus_target: _resolveNarrativeFocusTarget(narrativeMode, intent),
      context_modifier: _narrativeContextModifier(entryContext),
    },
  };
}

function attachNarrativeDecisionToDiag(diag, st, entryContext) {
  if (!diag) return diag;
  var ctx = entryContext;
  if (!ctx && typeof CZ_ENTRY_CONTEXT !== "undefined") {
    ctx = CZ_ENTRY_CONTEXT;
  }
  diag.narrative_decision = resolveNarrativeDecision(
    diag.financial_stage,
    st && st.user_intent,
    ctx,
    diag.planId
  );
  return diag;
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

// Sprint 15 — align "Qué está pasando" with assigned plan when no debt pattern detected.
function _getProblemaPrincipalSinPatron(planId) {
  var id = parseInt(planId, 10);
  if (id === 1) {
    return {
      causa: "falta_organizacion",
      texto: "Todavía no tenés una visión completa de ingresos, gastos y deudas. Sin ese mapa es difícil tomar decisiones.",
    };
  }
  if (id === 2) {
    return {
      causa: "deuda_manejable",
      texto: "Tu situación muestra señales de manejo posible. El foco ahora es ordenar prioridades y sostener decisiones simples.",
    };
  }
  if (id === 3) {
    return {
      causa: "presion_deuda",
      texto: "Tu situación muestra presión de deuda. El foco principal es identificar qué pagos pesan más y evitar que el problema siga creciendo.",
    };
  }
  if (id === 4) {
    return {
      causa: "situacion_critica",
      texto: "Tu situación muestra presión financiera alta. El objetivo inmediato es estabilizar el flujo y evitar nuevas decisiones que agraven el problema.",
    };
  }
  return null;
}

function _applyProblemaPrincipalSinPatron(narrativa, planId) {
  var pp = _getProblemaPrincipalSinPatron(planId);
  if (!pp || !narrativa) return null;
  var entry = getNarrativaByTipo(narrativa, "problema_principal");
  if (!entry) return null;
  entry.causa = pp.causa;
  entry.texto = pp.texto;
  return pp.causa;
}

// Sprint 15 — single post-plan alignment (final planId required).
function alignInterpretacionV2ConPlan(iv2, planId) {
  if (!iv2 || iv2.patron_deuda !== "sin_patron") return false;
  var narr = iv2.narrativa_jerarquizada;
  if (!narr || !narr.length) return false;
  var pp = _getProblemaPrincipalSinPatron(planId);
  if (!pp) return false;

  var entry = getNarrativaByTipo(narr, "problema_principal") || narr[0];
  if (!entry) return false;
  entry.causa = pp.causa;
  entry.texto = pp.texto;
  if (narr[0]) {
    narr[0].causa = pp.causa;
    narr[0].texto = pp.texto;
  }
  iv2.causa_principal = pp.causa;
  return true;
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
      descripcion: "Muchas deudas fragmentan el flujo mensual y dificultan la priorización.",
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
      descripcion: "La información declarada sobre las deudas es parcial. El diagnóstico puede ser impreciso.",
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

  var missing_payment_information = false;
  var deudasActivasConf = deudasActivasParaCalculo(deudas);
  if (deudasActivasConf.length > 0) {
    var todasLegitimasSinPago = deudasActivasConf.every(function(d) {
      var sit = d.situacion_ui || "";
      return sit === "deje_pagar" || sit === "mora_reclamo" || sit === "informal"
        || d.tipo === "informal";
    });
    var totalPagosActivos = deudasActivasConf.reduce(function(s, d) {
      var sit = d.situacion_ui || "";
      if (sit === "pagando_normal" || sit === "atrasado_pagando") {
        return s + (parseFloat(d.pago) || 0);
      }
      return s;
    }, 0);
    var totalDeudaConf = fin.totalDeuda != null ? fin.totalDeuda : deudasActivasConf.reduce(function(s, d) {
      return s + (parseFloat(d.monto) || 0);
    }, 0);
    if (!todasLegitimasSinPago
        && totalDeudaConf >= ingreso * 3
        && totalPagosActivos === 0) {
      confidence_level = "low";
      missing_payment_information = true;
    }
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
    missing_payment_information,
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
// SPRINT 13 / 13.1 — BANCO DE ACCIONES RECOMENDADAS (presentation only)
// =============================================================================

var _CAT2_ACCION_PRIORITY = [
  "bcu_clearing_distintos",
  "bcu_categoria_real",
  "bcu_actualizacion_mensual",
  "bcu_post_regularizacion",
];

function _esAccionCat2Id(id) {
  return _CAT2_ACCION_PRIORITY.indexOf(id) !== -1;
}

function _dedupCat2Acciones(lista) {
  if (!lista || !lista.length) return lista || [];

  var cat2Kept = [];
  var used = {};
  var pi;
  for (pi = 0; pi < _CAT2_ACCION_PRIORITY.length && cat2Kept.length < 2; pi++) {
    var wantId = _CAT2_ACCION_PRIORITY[pi];
    var li;
    for (li = 0; li < lista.length; li++) {
      if (lista[li].id === wantId && !used[wantId]) {
        used[wantId] = true;
        cat2Kept.push(lista[li]);
        break;
      }
    }
  }

  var out = [];
  var cat2Inserted = false;
  for (var i = 0; i < lista.length; i++) {
    if (_esAccionCat2Id(lista[i].id)) {
      if (!cat2Inserted) {
        for (var k = 0; k < cat2Kept.length; k++) out.push(cat2Kept[k]);
        cat2Inserted = true;
      }
    } else {
      out.push(lista[i]);
    }
  }
  if (!cat2Inserted && cat2Kept.length) {
    for (k = 0; k < cat2Kept.length; k++) out.push(cat2Kept[k]);
  }
  return out;
}

function _pesoIdAccion(id, planId) {
  if (planId >= 2) {
    if (id === "flujo_libre_positivo" || id === "flujo_negativo_accion") return 0;
    if (id === "gasto_mayor_categoria") return 1;
  } else {
    if (id === "gasto_mayor_categoria") return 0;
    if (id === "flujo_libre_positivo") return 1;
  }
  if (id === "ingresos_extra_consistencia") return 2;
  return 5;
}

function _pesoCategoriaAccion(categoria, planId) {
  if (categoria === 1) return 0;
  if (planId >= 2) {
    if (categoria === 3) return 1;
    if (categoria === 2) return 2;
    if (categoria === 4) return 3;
  } else {
    if (categoria === 2) return 1;
    if (categoria === 3) return 2;
    if (categoria === 4) return 3;
  }
  return 9;
}

var _BANCO_ACCIONES_MAESTRO = [
  { id: "verificar_aplicacion_pagos", categoria: 1, situacion: "pagando_normal",
    texto: "Preguntále a [acreedor] cómo se están aplicando tus pagos — si van a intereses primero y no a capital, la deuda no baja aunque pagues.",
    tipo: "accion", urgencia: "media" },
  { id: "refinanciacion_temprana", categoria: 1, situacion: "atrasado_pagando",
    texto: "Contactá a [acreedor] y consultá opciones de refinanciación temprana — los intereses corren igual, pero restructurar antes suele evitar que la situación escale.",
    tipo: "contacto", urgencia: "alta" },
  { id: "convenio_mora_temprana", categoria: 1, situacion: "mora_30_60",
    texto: "Con 30 a 60 días de mora [acreedor] suele tener más flexibilidad para ofrecer un convenio de pago. Llamá y pedí hablar con el área de refinanciaciones.",
    tipo: "contacto", urgencia: "alta" },
  { id: "negociar_mora_60", categoria: 1, situacion: "mora_60_90",
    texto: "En muchos casos negociar antes de los 90 días suele dar mejores condiciones que hacerlo después, cuando el proceso puede haber escalado internamente en [acreedor].",
    tipo: "contacto", urgencia: "alta" },
  { id: "verificar_intimacion", categoria: 1, situacion: "mora_reclamo",
    texto: "Tu deuda con [acreedor] puede estar en etapa de reclamo jurídico. Verificá si recibiste alguna intimación judicial — si no recibiste ninguna, todavía podés intentar negociar directamente.",
    tipo: "accion", urgencia: "alta" },
  { id: "contactar_antes_intimacion", categoria: 1, situacion: "deje_pagar",
    texto: "Contactá a [acreedor] antes de recibir una intimación judicial — en general es el momento donde todavía podés intentar negociar condiciones.",
    tipo: "contacto", urgencia: "alta" },
  { id: "bcu_clearing_distintos", categoria: 2, siempre: true,
    texto: "El BCU y el Clearing son dos registros distintos. Podés estar limpio en uno y con problemas en el otro. Con Mi Plan Plus podés verlos directamente desde acá.",
    tipo: "accion", urgencia: "media" },
  { id: "bcu_categoria_real", categoria: 2,
    texto: "Tu calificación en el BCU influye en si los bancos te aprueban o rechazan. Con Mi Plan Plus podés verla directamente desde acá.",
    tipo: "accion", urgencia: "media" },
  { id: "bcu_actualizacion_mensual", categoria: 2, requiereMora: true,
    texto: "El BCU recibe actualizaciones mensuales de los acreedores, pero los cambios pueden demorar hasta 60 días en reflejarse completamente en tu historial.",
    tipo: "habito", urgencia: "media" },
  { id: "bcu_post_regularizacion", categoria: 2, requiereMoraSolo: true,
    texto: "Si ya regularizaste una deuda que estaba en mora, verificá que el acreedor haya actualizado su reporte en el BCU — a veces el acreedor no actualiza el reporte de inmediato.",
    tipo: "accion", urgencia: "media" },
  { id: "flujo_libre_positivo", categoria: 3, requiereFlujoPositivo: true, requierePrio: true,
    texto: "Tenés $[flujo_libre] de flujo libre estimado este mes. Destinarlo consistentemente a [acreedor] suele acelerar la salida de la deuda.",
    tipo: "habito", urgencia: "media" },
  { id: "flujo_negativo_accion", categoria: 3, requiereFlujoNegativo: true,
    texto: "Tu flujo actual es negativo. El primer paso es identificar qué gasto podés eliminar antes de pensar en pagar más deuda.",
    tipo: "accion", urgencia: "alta" },
  { id: "gasto_mayor_categoria", categoria: 3, requiereGastos: true,
    texto: "Tu gasto más alto es [categoria_mayor] y representa [porcentaje]% de tu ingreso. Es el área donde suele haber más margen para actuar si necesitás liberar flujo.",
    tipo: "habito", urgencia: "media" },
  { id: "ingresos_extra_consistencia", categoria: 3, requiereIngresosExtra: true,
    texto: "Registraste aproximadamente $[ingresos_extra] en ingresos adicionales este mes. Mantenerlos de forma consistente suele mejorar tu margen financiero más que hacer pagos extra esporádicos.",
    tipo: "habito", urgencia: "media" },
  { id: "historial_6_meses", categoria: 4, planMin: 2,
    texto: "Para volver a calificar para crédito el sistema financiero suele mirar los últimos 6 meses de comportamiento. Cada pago en fecha desde hoy cuenta.",
    tipo: "habito", urgencia: "media" },
  { id: "verificar_antes_solicitar", categoria: 4, planMax: 3,
    texto: "Antes de volver a solicitar crédito verificá tu situación en BCU y Clearing. Saber exactamente dónde estás te ahorra rechazos innecesarios que también pueden afectar tu historial.",
    tipo: "accion", urgencia: "media" },
  { id: "bcu_post_regularizacion_recal", categoria: 4, planMin: 2, sinMora: true,
    texto: "Si regularizaste alguna deuda recientemente, verificá que el acreedor haya actualizado el reporte en el BCU. Ese paso es necesario para que el cambio se refleje en tu historial.",
    tipo: "accion", urgencia: "media" },
];

function tieneBloqueo(tipo, bloqueadores) {
  if (!tipo || !bloqueadores || !bloqueadores.length) return false;
  for (var i = 0; i < bloqueadores.length; i++) {
    if (bloqueadores[i] && bloqueadores[i].tipo === tipo) return true;
  }
  return false;
}

function _evalCtxAcciones(diag) {
  var st = typeof window !== "undefined" ? (window.CZState || {}) : {};
  var herr = st.herr || {};
  var ingHerr = herr.ingresos || {};
  var fin = (diag && diag.fin) || {};
  var bl = (diag && diag.bloqueadores) || [];
  var prio = (diag && diag.prio) || null;
  var planId = (diag && diag.planId) || 1;
  var flujo = fin.flujoLibre != null ? fin.flujoLibre : 0;
  var ingreso = (typeof PRE !== "undefined" && PRE.ingreso) ? PRE.ingreso : 0;

  var totalGastos = typeof getTotalMonthlyExpenses === "function"
    ? getTotalMonthlyExpenses() : 0;
  if (isNaN(totalGastos)) totalGastos = 0;

  var items = typeof collectPresentableExpenseItems === "function"
    ? collectPresentableExpenseItems() : [];
  var top = typeof getTopExpenses === "function" ? getTopExpenses(items, 1)[0] : null;
  var pctTop = 0;
  if (top && ingreso > 0 && typeof getExpensePercent === "function") {
    pctTop = getExpensePercent(top.amount, ingreso);
  }

  var extras = ingHerr.extras || [];
  var totalIngresosExtra = 0;
  for (var ei = 0; ei < extras.length; ei++) {
    totalIngresosExtra += parseFloat(extras[ei].monto) || 0;
  }
  var ingresosTotal = ingHerr.total != null ? ingHerr.total : 0;

  return {
    prio: prio,
    planId: planId,
    bl: bl,
    flujo: flujo,
    ingreso: ingreso,
    totalGastos: totalGastos,
    situacion: prio ? (prio.situacion_ui || null) : null,
    topExpense: top,
    pctTop: pctTop,
    totalIngresosExtra: totalIngresosExtra,
    ingresosTotal: ingresosTotal,
    extrasLen: extras.length,
    tieneMora: tieneBloqueo("mora", bl) || tieneBloqueo("mora_multiple", bl),
  };
}

function _cumpleCondicionAccionMaestro(tpl, ctx) {
  if (tpl.siempre) return true;
  if (tpl.situacion) return !!ctx.prio && ctx.situacion === tpl.situacion;
  if (tpl.id === "bcu_categoria_real") {
    return ctx.planId >= 2 || ctx.tieneMora;
  }
  if (tpl.requiereMora) return ctx.tieneMora;
  if (tpl.requiereMoraSolo) return tieneBloqueo("mora", ctx.bl);
  if (tpl.requiereFlujoPositivo) return ctx.flujo > 0;
  if (tpl.requiereFlujoNegativo) return ctx.flujo < 0;
  if (tpl.requierePrio) return ctx.prio !== null;
  if (tpl.requiereGastos) {
    return ctx.totalGastos > 0 && ctx.ingreso > 0 && !!ctx.topExpense;
  }
  if (tpl.requiereIngresosExtra) {
    if (ctx.totalIngresosExtra <= 0) return false;
    return ctx.extrasLen > 0 || ctx.ingresosTotal > ctx.ingreso;
  }
  if (tpl.sinMora) {
    return ctx.planId >= (tpl.planMin || 2) && !tieneBloqueo("mora", ctx.bl);
  }
  if (tpl.planMin != null) return ctx.planId >= tpl.planMin;
  if (tpl.planMax != null) return ctx.planId <= tpl.planMax;
  return false;
}

function _urgenciaAccionMaestro(tpl, ctx) {
  if (tpl.id === "gasto_mayor_categoria" && ctx.pctTop > 30) return "alta";
  return tpl.urgencia || "media";
}

function _ordenarPorUrgenciaEnCategoria(lista) {
  var orden = { alta: 0, media: 1, baja: 2 };
  var conIdx = lista.map(function(a, idx) {
    var copy = Object.assign({}, a);
    copy._idx = idx;
    return copy;
  });
  conIdx.sort(function(a, b) {
    var da = orden[a.urgencia] != null ? orden[a.urgencia] : 99;
    var db = orden[b.urgencia] != null ? orden[b.urgencia] : 99;
    if (da !== db) return da - db;
    return a._idx - b._idx;
  });
  return conIdx.map(function(a) {
    delete a._idx;
    return a;
  });
}

function _ordenarAccionesRecomendadasFinal(candidatos, planId) {
  var orden = { alta: 0, media: 1, baja: 2 };
  var pid = planId || 1;
  var conIdx = candidatos.map(function(a, idx) {
    var copy = Object.assign({}, a);
    copy._idx = idx;
    return copy;
  });
  conIdx.sort(function(a, b) {
    var da = orden[a.urgencia] != null ? orden[a.urgencia] : 99;
    var db = orden[b.urgencia] != null ? orden[b.urgencia] : 99;
    if (da !== db) return da - db;
    var ca = _pesoCategoriaAccion(a.categoria, pid);
    var cb = _pesoCategoriaAccion(b.categoria, pid);
    if (ca !== cb) return ca - cb;
    var ia = _pesoIdAccion(a.id, pid);
    var ib = _pesoIdAccion(b.id, pid);
    if (ia !== ib) return ia - ib;
    return a._idx - b._idx;
  });
  return conIdx.map(function(a) {
    delete a._idx;
    delete a.categoria;
    delete a.situacion;
    delete a.siempre;
    delete a.requiereMora;
    delete a.requiereMoraSolo;
    delete a.requiereFlujoPositivo;
    delete a.requiereFlujoNegativo;
    delete a.requierePrio;
    delete a.requiereGastos;
    delete a.requiereIngresosExtra;
    delete a.planMin;
    delete a.planMax;
    delete a.sinMora;
    return a;
  });
}

function _accionYaSeleccionada(selected, id) {
  for (var i = 0; i < selected.length; i++) {
    if (selected[i].id === id) return true;
  }
  return false;
}

function _stripPlusCtaInactivo(texto) {
  var live = typeof CZ_PLUS_BCU_CLEARING_LIVE !== "undefined" && CZ_PLUS_BCU_CLEARING_LIVE;
  if (live) return texto;
  return String(texto || "")
    .replace(/\s*Con Mi Plan Plus podés verlo directamente desde acá\.?/gi, "")
    .replace(/\s*Con Mi Plan Plus podés verla directamente desde acá\.?/gi, "");
}

function _personalizarAccionRecomendada(template, ctx) {
  var accion = Object.assign({}, template);
  var prio = ctx.prio || null;
  var acreedor = (prio && prio.acreedor_display && String(prio.acreedor_display).trim())
    ? String(prio.acreedor_display).trim()
    : "tu acreedor principal";
  accion.texto = String(accion.texto || "")
    .replace(/\[acreedor\]/g, acreedor)
    .replace(/\[acreedor_display\]/g, acreedor);

  var montoNum = prio ? parseFloat(prio.monto) : NaN;
  if (prio && !isNaN(montoNum) && montoNum > 0) {
    var montoFmt = typeof fmt === "function" ? fmt(Math.round(montoNum)) : String(montoNum);
    accion.texto = accion.texto.replace(/\$\[monto\]/g, montoFmt).replace(/\[monto\]/g, montoFmt);
  } else {
    accion.texto = accion.texto
      .replace(/\s*\(\$\[monto\]\)/g, "")
      .replace(/\s*\(\[monto\]\)/g, "")
      .replace(/\$\[monto\]/g, "")
      .replace(/\[monto\]/g, "");
  }

  var flujoFmt = typeof fmt === "function"
    ? fmt(Math.round(Math.abs(ctx.flujo || 0)))
    : String(Math.abs(ctx.flujo || 0));
  accion.texto = accion.texto.replace(/\[flujo_libre\]/g, flujoFmt);

  if (ctx.topExpense) {
    accion.texto = accion.texto
      .replace(/\[categoria_mayor\]/g, ctx.topExpense.label || "tu mayor gasto")
      .replace(/\[porcentaje\]/g, String(ctx.pctTop || 0));
  } else {
    accion.texto = accion.texto
      .replace(/\[categoria_mayor\]/g, "tu mayor gasto")
      .replace(/\[porcentaje\]/g, "0");
  }

  if (ctx.totalIngresosExtra > 0) {
    var extraFmt = typeof fmt === "function"
      ? fmt(Math.round(ctx.totalIngresosExtra))
      : String(ctx.totalIngresosExtra);
    accion.texto = accion.texto.replace(/\[ingresos_extra\]/g, extraFmt);
  } else {
    accion.texto = accion.texto.replace(/\[ingresos_extra\]/g, "");
  }

  accion.texto = _stripPlusCtaInactivo(accion.texto);
  accion.texto = accion.texto.replace(/\s+/g, " ").trim();
  return accion;
}

// =============================================================================
// ACTIONS-ARCH-02 — Narrative taxonomy filter (master bank only)
// GUARDRAIL:
// Filter runs inside seleccionarAccionesRecomendadas() after legacy selection.
// Does not alter B7, Plan5 fallback, Next Step, rendering, CRM, GTM or GA4.
// =============================================================================

var CZ_TAXONOMY_FILTER_MIN_ACTIONS = 3;

var CZ_CLARITY_DIAGNOSTIC_STABILIZATION_ACTIONS = Object.freeze({
  confirmar_saldo_stock_deuda: true,
  ordenar_panorama: true,
});

var CZ_NARRATIVE_MODE_ALLOWED_FAMILIES = Object.freeze({
  RECOVERY: Object.freeze(["RECOVERY", "UNIVERSAL"]),
  STABILIZATION: Object.freeze(["STABILIZATION", "LEARNING", "UNIVERSAL"]),
  OPTIMIZATION: Object.freeze(["OPTIMIZATION", "LEARNING", "UNIVERSAL"]),
  CLARITY: Object.freeze(["LEARNING", "UNIVERSAL"]),
});

function _isValidNarrativeModeForTaxonomyFilter(mode) {
  return mode === "RECOVERY"
    || mode === "STABILIZATION"
    || mode === "OPTIMIZATION"
    || mode === "CLARITY";
}

function _getActionNarrativeTaxonomyModule() {
  if (typeof ActionNarrativeTaxonomy !== "undefined" && ActionNarrativeTaxonomy
      && typeof ActionNarrativeTaxonomy.getMasterActionNarrativeFamilies === "function") {
    return ActionNarrativeTaxonomy;
  }
  if (typeof getMasterActionNarrativeFamilies === "function") {
    return { getMasterActionNarrativeFamilies: getMasterActionNarrativeFamilies };
  }
  return null;
}

function _actionFamiliesIntersectAllowed(actionFamilies, allowedFamilies) {
  if (!actionFamilies || !actionFamilies.length || !allowedFamilies || !allowedFamilies.length) {
    return false;
  }
  for (var i = 0; i < actionFamilies.length; i++) {
    for (var j = 0; j < allowedFamilies.length; j++) {
      if (actionFamilies[i] === allowedFamilies[j]) return true;
    }
  }
  return false;
}

function _isClarityDiagnosticStabilizationAction(actionKey) {
  return !!(actionKey && CZ_CLARITY_DIAGNOSTIC_STABILIZATION_ACTIONS[actionKey]);
}

function _actionPassesNarrativeTaxonomyFilter(action, narrativeMode, taxonomy) {
  if (!action || typeof action !== "object") return false;
  var actionKey = action.id;
  if (!actionKey) return false;

  if (narrativeMode === "CLARITY" && _isClarityDiagnosticStabilizationAction(actionKey)) {
    return true;
  }

  var families = taxonomy.getMasterActionNarrativeFamilies(actionKey);
  if (!families || !families.length) return false;

  var allowedFamilies = CZ_NARRATIVE_MODE_ALLOWED_FAMILIES[narrativeMode];
  if (!allowedFamilies) return false;

  return _actionFamiliesIntersectAllowed(families, allowedFamilies);
}

function _setTaxonomySelectionMeta(diag, mode, discardCount) {
  if (!diag) return;
  diag.action_selection_mode = mode;
  diag.taxonomy_discard_count = discardCount != null ? discardCount : 0;
}

function applyNarrativeTaxonomyFilterToSelected(diag, candidateActions) {
  var candidates = candidateActions || [];

  if (!diag) {
    return candidates;
  }

  var taxonomy = _getActionNarrativeTaxonomyModule();
  var narrativeDecision = diag.narrative_decision;
  var narrativeMode = narrativeDecision && narrativeDecision.narrative_mode;

  if (!taxonomy || !narrativeDecision || !_isValidNarrativeModeForTaxonomyFilter(narrativeMode)) {
    _setTaxonomySelectionMeta(diag, "legacy_fallback", 0);
    return candidates;
  }

  var filtered = [];
  for (var i = 0; i < candidates.length; i++) {
    if (_actionPassesNarrativeTaxonomyFilter(candidates[i], narrativeMode, taxonomy)) {
      filtered.push(candidates[i]);
    }
  }

  var discardCount = candidates.length - filtered.length;

  if (filtered.length >= CZ_TAXONOMY_FILTER_MIN_ACTIONS) {
    _setTaxonomySelectionMeta(diag, "taxonomy", discardCount);
    return filtered;
  }

  _setTaxonomySelectionMeta(diag, "legacy_fallback", discardCount);
  return candidates;
}

function _fallbackAccionesRecomendadas() {
  var diag = typeof calcularMotor === "function" ? calcularMotor() : null;
  var ctx = _evalCtxAcciones(diag || { planId: 1, bloqueadores: [], fin: {}, prio: null });
  var ids = [
    "bcu_clearing_distintos",
    "verificar_antes_solicitar",
    "historial_6_meses",
    "gasto_mayor_categoria",
    "flujo_negativo_accion",
  ];
  var out = [];
  for (var i = 0; i < _BANCO_ACCIONES_MAESTRO.length && out.length < 5; i++) {
    var tpl = _BANCO_ACCIONES_MAESTRO[i];
    if (ids.indexOf(tpl.id) === -1) continue;
    if (!_cumpleCondicionAccionMaestro(tpl, ctx) && tpl.id !== "bcu_clearing_distintos") continue;
    var item = Object.assign({}, tpl, { urgencia: _urgenciaAccionMaestro(tpl, ctx) });
    out.push(_personalizarAccionRecomendada(item, ctx));
  }
  while (out.length < 5) {
    var fb = _BANCO_ACCIONES_MAESTRO[6];
    if (!_accionYaSeleccionada(out, fb.id)) {
      out.push(_personalizarAccionRecomendada(Object.assign({}, fb), ctx));
    } else {
      break;
    }
  }
  out = _dedupCat2Acciones(out);
  return out.length ? out : [{
    id: "bcu_clearing_distintos",
    texto: "El BCU y el Clearing son dos registros distintos. Podés estar limpio en uno y con problemas en el otro.",
    tipo: "accion",
    urgencia: "media",
  }];
}

function seleccionarAccionesRecomendadas(diag) {
  try {
    if (!diag) return _fallbackAccionesRecomendadas();

    var ctx = _evalCtxAcciones(diag);
    var qualified = { 1: [], 2: [], 3: [], 4: [] };

    for (var bi = 0; bi < _BANCO_ACCIONES_MAESTRO.length; bi++) {
      var tpl = _BANCO_ACCIONES_MAESTRO[bi];
      if (!_cumpleCondicionAccionMaestro(tpl, ctx)) continue;
      var item = Object.assign({}, tpl, { urgencia: _urgenciaAccionMaestro(tpl, ctx) });
      qualified[tpl.categoria].push(item);
    }

    qualified[2] = _dedupCat2Acciones(qualified[2]);

    qualified[1] = _ordenarPorUrgenciaEnCategoria(qualified[1]);
    qualified[2] = _ordenarPorUrgenciaEnCategoria(qualified[2]);
    qualified[3] = _ordenarPorUrgenciaEnCategoria(qualified[3]);
    qualified[4] = _ordenarPorUrgenciaEnCategoria(qualified[4]);

    var selected = [];
    var ci;
    var cat1added = 0;
    for (ci = 0; ci < qualified[1].length && cat1added < 3; ci++) {
      selected.push(qualified[1][ci]);
      cat1added++;
    }
    var cat2added = 0;
    for (ci = 0; ci < qualified[2].length && cat2added < 2; ci++) {
      if (!_accionYaSeleccionada(selected, qualified[2][ci].id)) {
        selected.push(qualified[2][ci]);
        cat2added++;
      }
    }

    var cat34 = qualified[3].concat(qualified[4]);
    cat34 = _ordenarPorUrgenciaEnCategoria(cat34);
    for (ci = 0; ci < cat34.length && selected.length < 5; ci++) {
      if (!_accionYaSeleccionada(selected, cat34[ci].id)) {
        selected.push(cat34[ci]);
      }
    }

    var allRemain = [];
    var cat;
    for (cat = 1; cat <= 4; cat++) {
      for (ci = 0; ci < qualified[cat].length; ci++) {
        if (!_accionYaSeleccionada(selected, qualified[cat][ci].id)) {
          allRemain.push(qualified[cat][ci]);
        }
      }
    }
    allRemain = _ordenarAccionesRecomendadasFinal(allRemain, ctx.planId);
    while (selected.length < 5 && allRemain.length) {
      selected.push(allRemain.shift());
    }

    // STEP 3 — BCU Cat 2 dedup (max 2, priority order) before final sort/slice
    selected = _dedupCat2Acciones(selected);
    // STEP 4
    selected = _ordenarAccionesRecomendadasFinal(selected, ctx.planId);
    // STEP 5
    if (selected.length > 5) selected = selected.slice(0, 5);

    // ACTIONS-ARCH-02 — taxonomy filter (master bank candidates only)
    selected = applyNarrativeTaxonomyFilterToSelected(diag, selected);

    if (selected.length < 3) {
      return _fallbackAccionesRecomendadas();
    }

    var acciones = selected.map(function(tpl) {
      return _personalizarAccionRecomendada(tpl, ctx);
    });
    return _dedupCat2Acciones(acciones);
  } catch (e) {
    return _fallbackAccionesRecomendadas();
  }
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
    attachFinancialStageToDiag(motor, st);
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

window.alignInterpretacionV2ConPlan = alignInterpretacionV2ConPlan;
