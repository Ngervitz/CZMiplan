// =============================================================================
// crm.js — Construccion del payload CRM y envio al backend
// Depende de: config.js, events.js, creditors.js, algorithms.js
// =============================================================================

function buildCRMData(motor) {
  const st = window.CZState || {};
  return {
    user: {
      nombre:           PRE.nombre,
      cedula:           PRE.cedula,
      email:            PRE.email,
      telefono:         PRE.telefono,
      ingreso_declarado: PRE.ingreso,
      situacion_laboral: PRE.laboral,
      monto_solicitado:  PRE.monto,
      segmento:          SEGMENTO,
    },
    survey: {
      completada:        TIENE_ENCUESTA,
      score:             motor && motor.enc ? motor.enc.score : null,
      nivel:             motor && motor.enc ? motor.enc.nivel : null,
      b_plus:            motor && motor.enc ? motor.enc.bPlus : null,
      flags:             motor && motor.enc ? motor.enc.flagsRiesgo : [],
      version_algoritmo: "reset_v2_simple",
    },
    expenses: st.gastos || {},
    debts: (st.deudas || []).map(function(d) {
      return Object.assign({}, d, {
        interes_estimado: TASAS[d.tipo] || 62,
        priority_score:   calcularPrioridad(d),
      });
    }),
    diagnosis: motor ? {
      deuda_total:     motor.fin.totalDeuda,
      pago_mensual:    motor.fin.totalPago,
      interes_prom:    motor.fin.interesProm,
      nivel_riesgo:    motor.fin.nivelRiesgo,
      score_reset:     motor.scoreReset,
      nivel_reset:     motor.nivelR,
      plan_id:         motor.planId,
    } : {},
    reset_plus: {
      estado: st.plusEstado || "sin_pago",
    },
    metadata: {
      algorithm_version: ALGORITHM_VERSION,
      timestamp:         new Date().toISOString(),
      segmento:          SEGMENTO,
    },
  };
}

async function enviarCRM(evento, motor) {
  var payload = Object.assign({ evento: evento }, buildCRMData(motor));
  track(evento, payload);
  // TODO IT: descomentar cuando el backend este listo
  // try {
  //   await fetch(API.guardar, {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       "X-Reset-Token": API_TOKEN,
  //     },
  //     body: JSON.stringify(payload),
  //   });
  // } catch (e) {
  //   console.warn("[CRM] Failed to fetch", e.message);
  // }
}
