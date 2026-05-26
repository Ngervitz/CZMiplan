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
      var isUnknown = d.acreedor_normalizado === "otro";
      // Ensure enrichment is current (handles legacy debts without Sprint 6 fields)
      if (typeof enriquecerDeuda === "function") enriquecerDeuda(d);
      return Object.assign({}, d, {
        priority_score:            calcularPrioridad(d),

        // Normalized creditor fields — populated by normalizarAcreedor() in app.js
        acreedor_raw:               d.acreedor_raw               || null,
        acreedor_key:               d.acreedor_key               || null,
        acreedor_normalizado:       d.acreedor_normalizado        || null,
        acreedor_display:           d.acreedor_display            || null,

        // Unknown creditor signal — enables CRM team to grow CREDITOR_DICT
        acreedor_desconocido:       isUnknown ? true              : undefined,
        acreedor_raw_para_revision: isUnknown ? (d.acreedor_raw || null) : undefined,

        // Sprint 6 — payment behavior intelligence
        pago_fuente:               d.pago_fuente               || null,
        atraso_tiempo:             d.atraso_tiempo             || null,
        ultimo_pago_declarado:     d.ultimo_pago_declarado     || null,
        interes_mensual_estimado:  d.interes_mensual_estimado  || 0,
        interes_mostrado:          d.interes_mostrado          || 0,
        capital_estimado:          d.capital_estimado          || 0,
        presion_latente_estimada:  d.presion_latente_estimada  || 0,
        costo_financiero_estimado: d.costo_financiero_estimado || false,

        // Sprint 6.5 — conversational intake fields + confidence layer
        situacion_ui:              d.situacion_ui              || null,
        atraso_tiempo_aprox:       d.atraso_tiempo_aprox       || null,
        pago_clarificacion:        d.pago_clarificacion        || null,
        debt_confidence:           d.debt_confidence           || null,
      });
    }),
    diagnosis: motor ? {
      deuda_total:       motor.fin.totalDeuda,
      pago_mensual:      motor.fin.totalPago,
      interes_prom:      motor.fin.interesProm,
      nivel_riesgo:      motor.fin.nivelRiesgo,
      score_reset:       motor.scoreReset,
      nivel_reset:       motor.nivelR,
      plan_id:           motor.planId,
      // Sprint 6.5 — data quality signal for underwriting/recovery intelligence
      debt_data_quality: (typeof calcularDebtDataQuality === "function")
        ? calcularDebtDataQuality(st.deudas || [])
        : null,
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

// =============================================================================
// CRM HYDRATION — reads persisted behavioral state for a known czuid
// Returns a session object compatible with cargarLocal(), or null if unavailable.
// Currently a stub — backend not connected yet.
// TODO IT: activate when CRM API endpoint is ready.
// =============================================================================
async function loadBehavioralDataFromCRM(czuid) {
  if (!czuid) return null;
  track("crm_hydration_attempted", { czuid: czuid });
  // TODO IT: uncomment and adapt when backend is ready
  // try {
  //   var res = await fetch(API.guardar + "?czuid=" + encodeURIComponent(czuid), {
  //     method: "GET",
  //     headers: { "X-Reset-Token": API_TOKEN },
  //   });
  //   if (!res.ok) return null;
  //   var data = await res.json();
  //   return (data && data.diag) ? data : null;
  // } catch (e) {
  //   console.warn("[CRM] Hydration failed:", e.message);
  //   return null;
  // }
  return null;
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
