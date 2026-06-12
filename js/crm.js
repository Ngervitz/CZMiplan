// =============================================================================
// crm.js — Construccion del payload CRM y envio al backend
// Depende de: config.js, events.js, creditors.js, algorithms.js
// =============================================================================

function buildSurveyRespuestasCrm(st) {
  st = st || {};
  var raw = (st.seo_ia_survey && st.seo_ia_survey.respuestas)
    || (typeof PRE !== "undefined" && PRE.respuestas)
    || null;
  if (!raw) return null;

  var out = {};
  var hasAny = false;
  var i;
  for (i = 1; i <= 10; i++) {
    var key = "p" + i;
    var val = raw[key] != null ? raw[key] : null;
    out[key] = val;
    if (val != null && val !== "") hasAny = true;
  }
  return hasAny ? out : null;
}

function buildAcquisitionCrm(st) {
  st = st || {};
  var fromState = st.seo_ia_survey && st.seo_ia_survey.acquisition;
  var fromUrl = (typeof getSeoIaAcquisitionPayload === "function")
    ? getSeoIaAcquisitionPayload()
    : null;

  if (fromState && fromState.source) {
    return Object.assign({}, fromUrl || {}, fromState);
  }
  if (fromUrl && fromUrl.source) return fromUrl;
  return null;
}

var CZ_FIRST_SEEN_AT_KEY = "cz_first_seen_at";

function getOrInitCrmFirstSeenAt() {
  try {
    if (typeof localStorage === "undefined" || !localStorage) {
      return new Date().toISOString();
    }
    var existing = localStorage.getItem(CZ_FIRST_SEEN_AT_KEY);
    if (existing) return existing;
    var now = new Date().toISOString();
    localStorage.setItem(CZ_FIRST_SEEN_AT_KEY, now);
    return now;
  } catch (e) {
    return new Date().toISOString();
  }
}

function buildFirstTouchCrm(st) {
  var acq = buildAcquisitionCrm(st) || {};
  return {
    source:        acq.source        || null,
    intent:        acq.intent        || null,
    question:      acq.question      || null,
    utm_source:    acq.utm_source    || null,
    utm_medium:    acq.utm_medium    || null,
    utm_campaign:  acq.utm_campaign  || null,
    utm_content:   acq.utm_content   || null,
    utm_term:      acq.utm_term      || null,
    vertical:      "miplan",
    first_seen_at: getOrInitCrmFirstSeenAt(),
  };
}

function buildLeadOutcomeCrm() {
  return {
    current:    "none",
    updated_at: new Date().toISOString(),
    history:    [],
  };
}

function buildMideudaCrmBlock(st, motor) {
  st = st || {};
  return {
    mideuda_cta_shown:            !!st.mideuda_cta_shown,
    mideuda_cta_clicked:          !!st.mideuda_cta_clicked,
    mideuda_optin:                !!st.mideuda_optin,
    mideuda_optin_timestamp:      st.mideuda_optin_timestamp || null,
    mideuda_optin_legal_text:     st.mideuda_optin_legal_text || null,
    mideuda_interest_registered:  !!st.mideuda_interest_registered,
    mideuda_lead_status:          st.mideuda_lead_status || "not_shown",
    mideuda_source:               "credizona_miplan",
  };
}

function buildPartnerSignalsCrm(motor) {
  if (!motor) return null;
  return {
    mora_activa:            !!motor.mora_activa,
    deuda_vencida:          !!motor.deuda_vencida,
    flag_demasiadas_deudas: !!motor.flag_demasiadas_deudas,
    flag_deuda_cara:        !!motor.flag_deuda_cara,
    deuda_fuera_sistema:    !!motor.deuda_fuera_sistema,
    flag_deuda_sin_pagos:   !!motor.flag_deuda_sin_pagos,
  };
}

function buildSeoIaSurveyCrm(st) {
  st = st || {};
  var s = st.seo_ia_survey;
  if (!s || !s.completed_at) return null;

  return {
    respuestas:           buildSurveyRespuestasCrm(st),
    score_v2:             s.score_v2 != null ? s.score_v2 : null,
    baseline_nivel:       s.baseline_nivel || null,
    nivel_final:          s.nivel_final || null,
    flags_riesgo:         s.flags_riesgo || [],
    b_plus:               !!s.b_plus,
    version_cuestionario: s.version_cuestionario || null,
    started_at:           s.started_at || null,
    completed_at:         s.completed_at || null,
  };
}

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
      completada: (function() {
        var resp = buildSurveyRespuestasCrm(st);
        if (typeof surveyIsActive === "function" && resp) return surveyIsActive(resp);
        return typeof TIENE_ENCUESTA !== "undefined" ? TIENE_ENCUESTA : false;
      })(),
      respuestas:        buildSurveyRespuestasCrm(st),
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

    // SEO IA — acquisition attribution (CRM only: source, intent, question, UTMs)
    acquisition: buildAcquisitionCrm(st),

    // Original attribution snapshot — mirrors acquisition; CRM enforces immutability server-side
    first_touch: buildFirstTouchCrm(st),

    // Lead lifecycle placeholder — initialized only; outcomes populated by CRM later
    lead_outcome: buildLeadOutcomeCrm(),

    // SEO IA — in-app survey block (CRM only: respuestas + score_v2 + clasificación)
    seo_ia_survey: buildSeoIaSurveyCrm(st),

    // Partner recommended tools (MiDeuda + future partners)
    recommended_tools: (motor && motor.recommended_tools)
      ? motor.recommended_tools.slice()
      : [],
    partner_signals: buildPartnerSignalsCrm(motor),
    mideuda: buildMideudaCrmBlock(st, motor),

    // Sprint C1 — vertical profiling (optional step-2 enrichment; no motor impact)
    vertical_housing_status: st.vertical_housing_status || null,
    vertical_has_vehicle: st.vertical_has_vehicle !== undefined
      ? st.vertical_has_vehicle
      : null,
    vertical_has_health_coverage: st.vertical_has_health_coverage !== undefined
      ? st.vertical_has_health_coverage
      : null,
    vertical_has_education_expenses: st.vertical_has_education_expenses !== undefined
      ? st.vertical_has_education_expenses
      : null,
    vertical_profiling_completion: (
      (st.vertical_housing_status != null ? 1 : 0)
      + (st.vertical_has_vehicle !== undefined && st.vertical_has_vehicle !== null ? 1 : 0)
      + (st.vertical_has_health_coverage !== undefined && st.vertical_has_health_coverage !== null ? 1 : 0)
      + (st.vertical_has_education_expenses !== undefined && st.vertical_has_education_expenses !== null ? 1 : 0)
    ),
    vertical_profiling_completed: (
      (st.vertical_housing_status != null ? 1 : 0)
      + (st.vertical_has_vehicle !== undefined && st.vertical_has_vehicle !== null ? 1 : 0)
      + (st.vertical_has_health_coverage !== undefined && st.vertical_has_health_coverage !== null ? 1 : 0)
      + (st.vertical_has_education_expenses !== undefined && st.vertical_has_education_expenses !== null ? 1 : 0)
    ) === 4,
    vertical_profiling_opened: st.vertical_profiling_opened || false,
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
