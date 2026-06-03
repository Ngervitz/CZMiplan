// =============================================================================
// crm.js — Construccion del payload CRM y envio al backend
// Depende de: config.js, events.js, creditors.js, algorithms.js
// =============================================================================

function buildCRMData(motor) {
  var fin = (motor && motor.fin) || {};
  var iv2 = (motor && motor.interpretacion_v2) || null;
  var enc = (motor && motor.enc) || null;
  const st = window.CZState || {};
  var crmEmail = PRE.email;
  if (typeof sanitizeUrlEmail === "function" && sanitizeUrlEmail(st.user_email)) {
    crmEmail = sanitizeUrlEmail(st.user_email);
  }
  return {
    crm_contact_id: (window.CZIdentity && window.CZIdentity.crm_contact_id) || null,
    user: {
      nombre:           PRE.nombre,
      cedula:           PRE.cedula,
      email:            crmEmail,
      telefono:         PRE.telefono,
      ingreso_declarado: PRE.ingreso,
      situacion_laboral: PRE.laboral,
      monto_solicitado:  PRE.monto,
      segmento:          SEGMENTO,
    },
    survey: {
      completada:        TIENE_ENCUESTA,
      score:             enc ? enc.score : null,
      nivel:             enc ? enc.nivel : null,
      b_plus:            enc ? enc.bPlus : null,
      flags:             enc ? enc.flagsRiesgo : [],
      version_algoritmo: "reset_v2_simple",
    },
    expenses: st.gastos || {},
    custom_expenses: sanitizeCustomExpensesForSave(st.custom_expenses || []),
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
      deuda_total:          fin.totalDeuda || 0,
      pago_mensual:         fin.totalPago || 0,
      interes_prom:         fin.interesProm != null ? fin.interesProm : null,
      nivel_riesgo:         fin.nivelRiesgo || null,
      score_reset:          motor.scoreReset,
      score_reset_raw:      motor.scoreResetRaw      != null ? motor.scoreResetRaw      : motor.scoreReset,
      score_financiero_raw: motor.scoreFinancieroRaw != null ? motor.scoreFinancieroRaw : null,
      guardrail_applied:    motor.guardrail_applied   != null ? motor.guardrail_applied  : false,
      guardrail_reason:     motor.guardrail_reason     || null,
      nivel_reset:          motor.nivelR,
      plan_id:              motor.planId,
      // Sprint 6.5 — data quality signal for underwriting/recovery intelligence
      debt_data_quality: (typeof calcularDebtDataQuality === "function")
        ? calcularDebtDataQuality(st.deudas || [])
        : null,
      // Sprint 7B.3 — severity + recovery signals
      severity_stock:            iv2 ? iv2.severity_stock            : null,
      severity_behavioral:       iv2 ? iv2.severity_behavioral       : null,
      severity_level:            iv2 ? iv2.severity_level            : null,
      has_unpaid_debt:           iv2 ? iv2.has_unpaid_debt           : null,
      severe_latent_pressure:    iv2 ? iv2.severe_latent_pressure    : null,
      deuda_total_ingreso_ratio: iv2 ? iv2.deuda_total_ingreso_ratio : null,
      recuperabilidad_class:     iv2 ? iv2.recuperabilidad_class     : null,
      dti_ratio:                 fin.dti_ratio != null ? fin.dti_ratio : null,
      dti_level:                 fin.dti_level || null,
      confianza_diagnostico:     fin.confianza_diagnostico != null ? fin.confianza_diagnostico : null,
    } : {},
    reset_plus: {
      estado: st.plusEstado || "sin_pago",
    },
    plus: {
      purchased:    !!st.plus_purchased,
      status:       st.plus_status != null ? st.plus_status : null,
      purchased_at: st.plus_purchased_at || null,
      report_id:    st.plus_report_id || null,
      pdf_downloaded:    !!st.plus_pdf_downloaded,
      email_requested:   !!st.plus_email_requested,
      feedback: {
        score:            st.plus_feedback_score != null ? st.plus_feedback_score : null,
        clarity:          st.plus_feedback_clarity || null,
        value:            st.plus_feedback_value || null,
        comment:          st.plus_feedback_comment || "",
        feedback_version: "v1",
        submitted:        !!st.plus_feedback_submitted,
      },
    },
    metadata: {
      algorithm_version: ALGORITHM_VERSION,
      timestamp:         new Date().toISOString(),
      segmento:          SEGMENTO,
    },
    // Legal acceptance — sourced from consent.js
    legal_acceptance: (typeof getLegalAcceptancePayload === "function")
      ? getLegalAcceptancePayload()
      : null,

    // Sprint 9 — incomplete data flag
    gastos_missing_confirmed: !!(window.CZState && window.CZState.gastos_missing_confirmed),

    // Sprint 10 — Mi Plan in-app consent record
    miplan_consent: (function() {
      var c = window.CZState && window.CZState.consent;
      if (!c) return null;
      return {
        miplan_tc_accepted:       c.miplan_tc_accepted       || false,
        miplan_privacy_accepted:  c.miplan_privacy_accepted  || false,
        miplan_tc_version:        c.miplan_tc_version        || null,
        miplan_privacy_version:   c.miplan_privacy_version   || null,
        miplan_consent_timestamp: c.miplan_consent_timestamp || null,
        consent_source:           c.consent_source           || null,
        entry_channel:            c.entry_channel            || null,
        // login_user_id is null until future login implementation
        login_user_id:            c.login_user_id            || null,
        consent_crm_synced:       c.consent_crm_synced       || false,
      };
    })(),

    // Sprint 10.1 — user feedback suggestions (CRM only)
    feedback_suggestions: (window.CZState && window.CZState.feedback_suggestions)
      ? window.CZState.feedback_suggestions
      : [],
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
  // Hydration attempt tracked from app.js via CZ_EVENT_NAMES.CRM_HYDRATION_ATTEMPTED
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

async function enviarCRM(evento, motorOrTelemetry) {
  // CRM data is backend-only.
  // Never route through trackEvent() or dataLayer.
  // Backend handles CRM persistence and CAPI dispatch.

  var isDiagMotor = motorOrTelemetry && (
    motorOrTelemetry.fin != null ||
    motorOrTelemetry.planId != null ||
    motorOrTelemetry.enc != null
  );

  var payload;
  if (isDiagMotor) {
    payload = Object.assign({ evento: evento }, buildCRMData(motorOrTelemetry));
  } else {
    payload = Object.assign(
      { evento: evento },
      buildCRMData((window.CZState && window.CZState.diag) || null),
      { crm_telemetry: motorOrTelemetry || {} }
    );
  }

  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.search.indexOf("czdev=true") !== -1
  ) {
    console.log("[CZ CRM]", evento, payload);
  }
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
