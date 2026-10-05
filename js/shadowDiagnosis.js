/**
 * shadowDiagnosis.js — B3 frontend → backend SHADOW integration.
 *
 * Client motor remains UX authority. After a valid client diagnosis, fire-and-forget
 * POST /v1/diagnoses with EngineInput only; compare server result vs client snapshot.
 *
 * Depends on: config.js, identity.js, algorithms.js, ui.js (coherence/acciones), app state
 * Must load BEFORE app.js.
 */
(function () {
  "use strict";

  var CLOCK_EXCLUDED_PATHS = { diasRec: true };

  var _lastFingerprint = null;
  var _inFlight = false;
  var _cooldownUntil = 0;
  var _rerunPending = false;
  var _rerunTimer = null;
  var _stats = {
    attempts: 0,
    match: 0,
    mismatch: 0,
    error: 0,
    last_status: null,
    last_diagnosis_id: null,
    last_diff_paths: null,
  };

  function _readFlag(name, fallback) {
    if (typeof window[name] !== "undefined") return window[name];
    if (typeof globalThis !== "undefined" && typeof globalThis[name] !== "undefined") {
      return globalThis[name];
    }
    return fallback;
  }

  function isLoopbackPage() {
    try {
      var h = String(window.location.hostname || "");
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  /** ?cz_api= is a local-development override only; on any other page host it is ignored. */
  function apiOverrideFromQuery() {
    try {
      if (!isLoopbackPage()) return null;
      var raw = new URLSearchParams(window.location.search).get("cz_api");
      if (!raw) return null;
      var u = new URL(String(raw).trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.origin + u.pathname;
    } catch (e) {
      return null;
    }
  }

  function getApiBaseUrl() {
    var fromQuery = apiOverrideFromQuery();
    var raw =
      fromQuery ||
      _readFlag("CZ_BACKEND_API_URL", typeof CZ_BACKEND_API_URL !== "undefined" ? CZ_BACKEND_API_URL : "") ||
      "";
    return String(raw).replace(/\/+$/, "");
  }

  function getProdHosts() {
    var hosts = _readFlag(
      "CZ_SHADOW_PROD_HOSTS",
      typeof CZ_SHADOW_PROD_HOSTS !== "undefined" ? CZ_SHADOW_PROD_HOSTS : []
    );
    return Array.isArray(hosts) ? hosts : [];
  }

  function isAllowlistedHost() {
    try {
      var h = String(window.location.hostname || "");
      if (getProdHosts().indexOf(h) !== -1) return true;
      // Local/dev auto-shadow only against a non-production API (config.local.js); the
      // committed default API is production and must never receive local traffic implicitly.
      if (h === "localhost" || h === "127.0.0.1") return isNonProductionApi(getApiBaseUrl());
      return false;
    } catch (e) {
      return false;
    }
  }

  /** Loopback or reserved non-resolvable names (RFC 6761): .test, .localhost, .invalid. */
  function isNonProductionApi(url) {
    try {
      var host = new URL(url).hostname;
      return host === "localhost" || host === "127.0.0.1" || host === "[::1]" ||
        /\.(test|localhost|invalid)$/.test(host);
    } catch (e) {
      return false;
    }
  }

  /**
   * Enabled when:
   * - ?cz_shadow=1 (+ API via CZ_BACKEND_API_URL, or ?cz_api on a loopback page), OR
   * - CZ_SHADOW_MODE kill-switch ON and host is prod allowlist (or localhost for config.local)
   * Kill switch: CZ_SHADOW_MODE=false disables auto-shadow (query still works for ops tests).
   */
  function isShadowEnabled() {
    var q = false;
    try {
      q = new URLSearchParams(window.location.search).get("cz_shadow") === "1";
    } catch (e) {}
    var flag = _readFlag(
      "CZ_SHADOW_MODE",
      typeof CZ_SHADOW_MODE !== "undefined" ? CZ_SHADOW_MODE : false
    );
    if (!getApiBaseUrl()) return false;
    if (q) return true;
    return !!(flag && isAllowlistedHost());
  }

  // ---- V2-END-TO-END-WIRING-01: server-confirmed V2 strategy kept in CZState, never rendered ----
  var V2_STATE_KEY = "_v2FinancialStrategy";
  var V2_STRATEGIES = {
    CONTENCION: true,
    REGULARIZACION: true,
    REDUCCION_CARGA: true,
    CONSOLIDACION: true,
    MANTENIMIENTO_OPTIMIZACION: true,
  };

  function isV2StrategyStateEnabled() {
    return (
      _readFlag(
        "CZ_V2_STRATEGY_STATE_ENABLED",
        typeof CZ_V2_STRATEGY_STATE_ENABLED !== "undefined" ? CZ_V2_STRATEGY_STATE_ENABLED : false
      ) === true
    );
  }

  function getActiveJourneyId() {
    try {
      var jid =
        (window.CZHandoffEntry &&
          typeof window.CZHandoffEntry.getCurrentJourneyId === "function" &&
          window.CZHandoffEntry.getCurrentJourneyId()) ||
        (window.CZIdentity && window.CZIdentity.journey_id) ||
        (window.CZState && window.CZState._journeyId) ||
        "";
      return jid ? String(jid) : "";
    } catch (_e) {
      return "";
    }
  }

  function _isV2Strategy(s) {
    return typeof s === "string" && Object.prototype.hasOwnProperty.call(V2_STRATEGIES, s);
  }

  // Closed catalog (classifier contract §19.2).
  var V2_ENTRY_REASONS = {
    FLOW_NEGATIVE: true,
    ACTIVE_MORA: true,
    HIGH_DEBT_BURDEN: true,
    FLOW_ZERO: true,
    SUSTAINABLE_DEBT_BURDEN: true,
    NO_ACTIVE_DEBT: true,
  };
  var V2_CODE_RE = /^[A-Z][A-Z0-9_]*$/;
  var V2_IDENTITY_VERSIONS = {
    financial_input_identity_v1: true,
    financial_input_identity_v2: true,
  };
  var V2_IDENTITY_VALUE_RE = /^[0-9a-f]{64}$/;

  function _isPlainObject(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  function _isEntryReason(r) {
    return typeof r === "string" && Object.prototype.hasOwnProperty.call(V2_ENTRY_REASONS, r);
  }

  function _isFactRef(x) {
    if (!_isPlainObject(x) || typeof x.fact !== "string" || !x.fact) return false;
    if (x.subject === "person") return true;
    return x.subject === "debt" && typeof x.debt_index === "number" && x.debt_index >= 0 && x.debt_index % 1 === 0;
  }

  function _copyFactRef(x) {
    var o = { fact: x.fact, subject: x.subject };
    if (x.subject === "debt") o.debt_index = x.debt_index;
    return o;
  }

  /** Strict validation of the public contract; returns a detached allowlisted copy or null. strategy may be null. */
  function validateV2FinancialStrategy(v) {
    if (!_isPlainObject(v)) return null;
    if (v.survey_version !== 2) return null;
    if (!Object.prototype.hasOwnProperty.call(v, "strategy")) return null;
    if (!Array.isArray(v.reasons) || !v.reasons.every(_isEntryReason)) return null;
    var ver = v.verification;
    if (!_isPlainObject(ver) || typeof ver.required !== "boolean") return null;
    if (!Array.isArray(ver.reasons) || !ver.reasons.every(function (r) {
      return _isFactRef(r) && typeof r.code === "string" && V2_CODE_RE.test(r.code);
    })) {
      return null;
    }
    if (ver.required !== ver.reasons.length > 0) return null;
    if (!Array.isArray(ver.missing_facts) || !ver.missing_facts.every(_isFactRef)) return null;
    if (v.classification_status === "classified") {
      if (!_isV2Strategy(v.strategy) || ver.missing_facts.length !== 0) return null;
    } else if (v.classification_status === "incomplete") {
      if (v.strategy !== null || v.reasons.length !== 0) return null;
    } else {
      return null;
    }
    var prov = v.provenance;
    if (!_isPlainObject(prov)) return null;
    if (typeof prov.classifier_version !== "string" || !prov.classifier_version) return null;
    if (typeof prov.contract !== "string" || !prov.contract) return null;
    var fid = v.financial_input_identity;
    if (!_isPlainObject(fid) || typeof fid.version !== "string" ||
        !Object.prototype.hasOwnProperty.call(V2_IDENTITY_VERSIONS, fid.version)) {
      return null;
    }
    if (typeof fid.value !== "string" || !V2_IDENTITY_VALUE_RE.test(fid.value)) return null;
    return {
      survey_version: 2,
      classification_status: v.classification_status,
      strategy: v.strategy,
      reasons: v.reasons.slice(),
      verification: {
        required: ver.required,
        reasons: ver.reasons.map(function (r) {
          return Object.assign({ code: r.code }, _copyFactRef(r));
        }),
        missing_facts: ver.missing_facts.map(_copyFactRef),
      },
      provenance: {
        classifier_version: prov.classifier_version,
        contract: prov.contract,
      },
      financial_input_identity: { version: fid.version, value: fid.value },
    };
  }

  /** A stored V2 strategy never outlives its journey. */
  function dropStaleV2Strategy(st) {
    try {
      st = st || window.CZState;
      if (!st || !st[V2_STATE_KEY]) return;
      if (st[V2_STATE_KEY].journey_id !== getActiveJourneyId()) st[V2_STATE_KEY] = null;
    } catch (_e) {
      /* ignore */
    }
  }

  /**
   * Client-side canonical financial input under the snapshot's own debt contract (binding only;
   * the server owns the identity). Invalid marker or missing modules → null (never binds).
   */
  function _canonicalInput(input) {
    try {
      var m = window.CZDebtContract;
      if (!input || !m || typeof m.canonicalizeForContract !== "function") return null;
      return m.canonicalizeForContract(input);
    } catch (_e) {
      return null;
    }
  }

  function _identityVersionFor(input) {
    try {
      var m = window.CZDebtContract;
      return input && m && typeof m.identityVersionFor === "function" ? m.identityVersionFor(input) : null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Debt contract v2 (explicit pago_mensual_actual, mora / reclamo_disputa) is captured only while
   * the V2 strategy state is on; otherwise the UI and the snapshot stay on the legacy v1 contract.
   */
  function isDebtContractV2Capture() {
    return isV2StrategyStateEnabled();
  }

  function _currentCanonical(st) {
    try {
      return _canonicalInput(buildEngineInput(st));
    } catch (_e) {
      return null;
    }
  }

  function applyV2StrategyResponse(req, res) {
    try {
      if (!req.enabled) return;
      var st = req.state;
      // CZState replaced (reset) or journey changed while in flight: late response, discard.
      if (!st || st !== window.CZState) return;
      if (!req.journeyId || req.journeyId !== getActiveJourneyId()) {
        dropStaleV2Strategy(st);
        return;
      }
      var current = _currentCanonical(st);
      var prev = st[V2_STATE_KEY];
      // Financial input changed while in flight: the response describes an older identity.
      if (!req.canonical || current !== req.canonical) {
        if (prev && prev.input_canonical !== current) st[V2_STATE_KEY] = null;
        return;
      }
      var json = res && res.ok && res.json && typeof res.json === "object" ? res.json : null;
      var v2 =
        json &&
        json.diagnosis_id &&
        String(json.journey_id || "") === req.journeyId &&
        Object.prototype.hasOwnProperty.call(json, "v2_financial_strategy")
          ? validateV2FinancialStrategy(json.v2_financial_strategy)
          : null;
      // A result computed under another debt contract does not describe this snapshot.
      if (v2 && (!req.identityVersion || v2.financial_input_identity.version !== req.identityVersion)) v2 = null;
      if (v2) {
        st[V2_STATE_KEY] = {
          journey_id: req.journeyId,
          diagnosis_id: String(json.diagnosis_id),
          classifier_version: v2.provenance.classifier_version,
          financial_input_identity: v2.financial_input_identity,
          input_canonical: req.canonical,
          result: v2,
        };
      } else if (!prev || prev.journey_id !== req.journeyId || prev.input_canonical !== req.canonical) {
        // Semantic duplicate without a V2 result keeps the state computed for the same input.
        st[V2_STATE_KEY] = null;
      }
    } catch (_e) {
      /* ignore */
    } finally {
      try {
        if (window.CZV2Interaction) window.CZV2Interaction.refresh();
      } catch (_e2) {
        /* ignore */
      }
    }
  }

  /** V2 state only while it still describes the active journey and the current financial input. */
  function getCurrentV2Strategy(st) {
    try {
      st = st || window.CZState;
      var s = st && st[V2_STATE_KEY];
      if (!s || s.journey_id !== getActiveJourneyId()) return null;
      if (!s.input_canonical || s.input_canonical !== _currentCanonical(st)) return null;
      return JSON.parse(JSON.stringify(s));
    } catch (_e) {
      return null;
    }
  }

  function getTimeoutMs() {
    var t = _readFlag(
      "CZ_SHADOW_TIMEOUT_MS",
      typeof CZ_SHADOW_TIMEOUT_MS !== "undefined" ? CZ_SHADOW_TIMEOUT_MS : 8000
    );
    t = parseInt(t, 10);
    return Number.isFinite(t) && t > 0 ? t : 8000;
  }

  function getAnonymousId() {
    var id =
      (window.CZIdentity && window.CZIdentity.anonymous_id) ||
      null;
    if (id) return String(id);
    try {
      id = localStorage.getItem("cz_anonymous_id");
    } catch (e) {}
    return id ? String(id) : null;
  }

  /**
   * ENTRY-01 — map income_source → field provenance semantics.
   * Prefill is not automatic truth; user_update marks modification after prefill.
   */
  function mapIncomeFieldProvenance(incomeSource) {
    switch (incomeSource) {
      case "url_param":
        return { source: "url_prefill", user_modified: false };
      case "handoff":
        return { source: "handoff", user_modified: false, detail: "handoff" };
      case "user_update":
        return { source: "user_entered", user_modified: true };
      case "user_input":
        return { source: "user_entered", user_modified: false };
      case "localStorage_restore":
        return { source: "user_entered", user_modified: false, detail: "session_restore" };
      case "crm_restore":
        return { source: "external_import", user_modified: false, detail: "crm_stub" };
      case "backend":
        return { source: "external_import", user_modified: false, detail: "backend" };
      default:
        return incomeSource
          ? { source: "user_entered", user_modified: false, detail: String(incomeSource) }
          : null;
    }
  }

  function buildFieldProvenance(st) {
    st = st || {};
    var fp = {};
    var ing = mapIncomeFieldProvenance(st.income_source);
    if (ing) {
      fp.ingreso = ing;
      fp.declared_ingreso = ing;
    }
    if (typeof hasUrlNombreParam === "function" && hasUrlNombreParam()) {
      fp.declared_nombre = { source: "url_prefill", user_modified: false };
    } else if (st.declared_nombre) {
      fp.declared_nombre = { source: "user_entered", user_modified: false };
    }
    if (typeof hasUrlEmailParam === "function" && hasUrlEmailParam()) {
      fp.declared_email = { source: "url_prefill", user_modified: false };
    } else if (st.declared_email || st.user_email) {
      fp.declared_email = { source: "user_entered", user_modified: false };
    }
    if (typeof hasUrlLaboralParam === "function" && hasUrlLaboralParam()) {
      fp.declared_laboral = { source: "url_prefill", user_modified: false };
    } else if (st.declared_laboral) {
      fp.declared_laboral = { source: "user_entered", user_modified: false };
    }
    var tiene =
      typeof TIENE_ENCUESTA !== "undefined" ? !!TIENE_ENCUESTA : false;
    if (tiene) {
      fp.respuestas = {
        source:
          typeof isSeoIaEntry === "function" && isSeoIaEntry()
            ? "seo_survey"
            : "url_prefill",
        user_modified: false,
      };
    }
    return fp;
  }

  /**
   * Canonical entry_context for persistence (ENTRY-01).
   * Merges frozen CZ_ENTRY_CONTEXT with live field_provenance.
   */
  function buildPersistableEntryContext(st) {
    var base =
      typeof normalizeEntryContext === "function"
        ? normalizeEntryContext()
        : typeof CZ_ENTRY_CONTEXT !== "undefined" && CZ_ENTRY_CONTEXT
          ? CZ_ENTRY_CONTEXT
          : null;
    if (!base || typeof base !== "object") {
      return {
        entryContext: "organic",
        trafficSource: "direct",
        hasRejectionContext: false,
        evidenceStrength: "weak",
        reasons: [],
        attribution_policy:
          typeof CZ_ATTRIBUTION_POLICY !== "undefined"
            ? CZ_ATTRIBUTION_POLICY
            : "CURRENT_ENTRY",
        field_provenance: buildFieldProvenance(st),
        schema_version: 1,
      };
    }
    var out = {};
    var keys = Object.keys(base);
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = base[keys[i]];
    }
    out.field_provenance = buildFieldProvenance(st);
    return out;
  }

  /**
   * Build EngineInput for backend. Strips client authorities.
   */
  function buildEngineInput(st) {
    st = st || window.CZState;
    if (!st) return null;
    var pre = typeof PRE !== "undefined" ? PRE : {};
    var custom = Array.isArray(st.custom_expenses)
      ? st.custom_expenses.map(function (c) {
          return {
            id: c.id,
            label: c.label || c.id,
            amount: c.amount != null ? c.amount : c.monto,
            included: c.included !== false && c._included !== false,
          };
        })
      : [];

    var tiene =
      typeof TIENE_ENCUESTA !== "undefined"
        ? !!TIENE_ENCUESTA
        : !!(pre.respuestas && Object.keys(pre.respuestas).length);

    var input = {
      ingreso: pre.ingreso != null ? pre.ingreso : st.declared_ingreso,
      laboral: st.declared_laboral || pre.laboral || "",
      declared_nombre: st.declared_nombre || pre.nombre || "",
      declared_email: st.declared_email || pre.email || "",
      declared_laboral: st.declared_laboral || pre.laboral || "",
      declared_ingreso:
        st.declared_ingreso != null
          ? st.declared_ingreso
          : pre.ingreso != null
            ? pre.ingreso
            : null,
      respuestas: pre.respuestas ? Object.assign({}, pre.respuestas) : {},
      tiene_encuesta: tiene,
      gastos: st.gastos ? Object.assign({}, st.gastos) : {},
      custom_expenses: custom,
      deudas: Array.isArray(st.deudas)
        ? st.deudas.map(function (d) {
            return Object.assign({}, d);
          })
        : [],
      snap: st.snap
        ? {
            fecha_inicio: st.snap.fecha_inicio || null,
          }
        : null,
      no_debts_declared: !!st.no_debts_declared,
      bcu_clearing_live:
        typeof CZ_PLUS_BCU_CLEARING_LIVE !== "undefined"
          ? !!CZ_PLUS_BCU_CLEARING_LIVE
          : false,
      decision_provenance:
        typeof CZ_DECISION_PROVENANCE !== "undefined"
          ? !!CZ_DECISION_PROVENANCE
          : false,
      user_intent: st.user_intent != null ? st.user_intent : null,
      entry_context: buildPersistableEntryContext(st),
      // Explicit acquisition mirror for servers that prefer top-level (also inside entry_context)
      acquisition:
        (typeof CZ_ENTRY_CONTEXT !== "undefined" &&
          CZ_ENTRY_CONTEXT &&
          CZ_ENTRY_CONTEXT.acquisition) ||
        (typeof getSeoIaAcquisitionPayload === "function"
          ? getSeoIaAcquisitionPayload()
          : null),
    };
    if (isDebtContractV2Capture()) input.debt_contract_version = "v2";

    // Never send client authorities / contact-only PII as engine financial input
    delete input.now_ms;
    delete input.engine_result;
    delete input.engine_version;
    delete input.diagnosis_id;
    delete input.completeness;
    delete input.completeness_recomputed;
    delete input.result;
    delete input.cedula;
    delete input.telefono;
    delete input.monto;

    return input;
  }

  function fingerprintInput(input) {
    try {
      return JSON.stringify(input);
    } catch (e) {
      return String(Date.now());
    }
  }

  function serializeClientEngineResult(st, diag) {
    st = st || window.CZState;
    diag = diag || (st && st.diag);
    if (!diag) return null;

    var coherence =
      typeof resolveDashboardCoherence === "function"
        ? resolveDashboardCoherence(diag, st)
        : {};
    if (typeof attachNextStepProvenance === "function") {
      try {
        attachNextStepProvenance(diag, st, coherence);
      } catch (e) {}
    }
    var nextStep =
      typeof resolveNextStepContent === "function"
        ? resolveNextStepContent(diag, st, coherence)
        : null;

    var accionesMotor =
      typeof seleccionarAccionesRecomendadas === "function"
        ? seleccionarAccionesRecomendadas(diag)
        : [];
    var accionesPost =
      typeof applyAccionesPostMotorTransforms === "function"
        ? applyAccionesPostMotorTransforms(diag, st, accionesMotor)
        : accionesMotor.slice();
    var acciones = (accionesPost || []).map(function (a) {
      return {
        id: a.id,
        texto: a.texto || null,
        tipo: a.tipo || null,
        urgencia: a.urgencia || null,
        selection_reason: a.selection_reason || null,
        retention_reason: a.retention_reason || null,
      };
    });

    var fin = diag.fin || {};
    var nameOk =
      typeof hasValidDeclaredName === "function" ? !!hasValidDeclaredName(st) : false;
    var emailOk =
      typeof hasValidDeclaredEmail === "function" ? !!hasValidDeclaredEmail(st) : false;
    var laboralOk =
      typeof hasValidDeclaredLaboral === "function" ? !!hasValidDeclaredLaboral(st) : false;
    var incomeOk =
      typeof hasCompletedIncomeInputs === "function" ? !!hasCompletedIncomeInputs(st) : false;
    var expTotal =
      typeof getTotalMonthlyExpensesSafe === "function"
        ? getTotalMonthlyExpensesSafe(st)
        : 0;
    var completeness = {
      financial_income_complete: !!st.financial_income_complete,
      financial_profile_complete: !!st.financial_profile_complete,
      financial_debts_complete: !!st.financial_debts_complete,
      financial_expenses_complete: !!st.financial_expenses_complete,
      hasCompletedFinancialInputs:
        typeof hasCompletedFinancialInputs === "function"
          ? !!hasCompletedFinancialInputs(st)
          : !!(
              st.financial_income_complete &&
              st.financial_profile_complete &&
              st.financial_debts_complete &&
              st.financial_expenses_complete
            ),
      // Align with engine/support/completeness.js derived_checks (parity shape)
      derived_checks: {
        nameOk: !!nameOk,
        emailOk: !!emailOk,
        laboralOk: !!laboralOk,
        incomeOk: !!incomeOk,
        expTotal: expTotal,
      },
    };

    return {
      planId: diag.planId,
      plan: diag.plan || null,
      nivelR: diag.nivelR,
      scoreReset: diag.scoreReset,
      scoreFinancieroRaw: diag.scoreFinancieroRaw,
      scoreResetRaw: diag.scoreResetRaw,
      guardrail_applied: diag.guardrail_applied,
      guardrail_reason: diag.guardrail_reason || null,
      assigned_plan_raw: diag.assigned_plan_raw,
      assigned_plan_final: diag.assigned_plan_final,
      plan_guardrail_applied: diag.plan_guardrail_applied,
      plan_guardrail_reason: diag.plan_guardrail_reason || null,
      diasRec: diag.diasRec,
      enc: diag.enc || null,
      fin: {
        ingreso: fin.ingreso != null ? fin.ingreso : null,
        totalGastos: fin.totalGastos != null ? fin.totalGastos : null,
        totalDeuda: fin.totalDeuda != null ? fin.totalDeuda : null,
        totalPago: fin.totalPago != null ? fin.totalPago : null,
        flujoLibre: fin.flujoLibre != null ? fin.flujoLibre : null,
        ratio: fin.ratio != null ? fin.ratio : null,
        cantMoras: fin.cantMoras != null ? fin.cantMoras : null,
        dti_ratio: fin.dti_ratio != null ? fin.dti_ratio : null,
        dti_level: fin.dti_level != null ? fin.dti_level : null,
        scoreFinanciero: fin.scoreFinanciero != null ? fin.scoreFinanciero : null,
        costoDeudaNivel: fin.costoDeudaNivel || null,
        interesProm: fin.interesProm != null ? fin.interesProm : null,
        behavioral: fin.behavioral || null,
      },
      interpretacion: diag.interpretacion || null,
      interpretacion_v2: diag.interpretacion_v2 || {},
      horizonte: diag.horizonte || null,
      bloqueadores: diag.bloqueadores || null,
      prio: diag.prio
        ? {
            tipo: diag.prio.tipo,
            monto: diag.prio.monto,
            situacion_ui: diag.prio.situacion_ui,
          }
        : null,
      financial_reality_warning: diag.financial_reality_warning,
      financial_reality_warning_type: diag.financial_reality_warning_type || null,
      missing_payment_information: diag.missing_payment_information,
      recommended_tools: diag.recommended_tools || [],
      mora_activa: diag.mora_activa,
      deuda_vencida: diag.deuda_vencida,
      flag_demasiadas_deudas: diag.flag_demasiadas_deudas,
      flag_deuda_cara: diag.flag_deuda_cara,
      deuda_fuera_sistema: diag.deuda_fuera_sistema,
      flag_deuda_sin_pagos: diag.flag_deuda_sin_pagos,
      flag_deuda_sanity_extreme: diag.flag_deuda_sanity_extreme,
      financial_stage: diag.financial_stage || null,
      financial_stage_provenance: diag.financial_stage_provenance || null,
      narrative_decision: diag.narrative_decision || null,
      coherence: {
        profileTier: coherence.profileTier,
        nextStepKey: coherence.nextStepKey,
        nextStepText: coherence.nextStepText,
        heroProblemOverride: coherence.heroProblemOverride,
        suppressOrdenarPanorama: coherence.suppressOrdenarPanorama,
        hideAccionPrioritaria: coherence.hideAccionPrioritaria,
      },
      next_step: {
        actionKey: nextStep && nextStep.actionKey != null ? nextStep.actionKey : null,
        text: nextStep && nextStep.text != null ? String(nextStep.text) : null,
        source: nextStep && nextStep.source != null ? nextStep.source : null,
      },
      next_step_provenance: diag.next_step_provenance || null,
      acciones: acciones,
      completeness_recomputed: completeness,
    };
  }

  function normalizeForCompare(engineResult) {
    return JSON.parse(
      JSON.stringify(engineResult, function (k, v) {
        if (v === undefined) return null;
        return v;
      })
    );
  }

  function diffPaths(expected, actual, prefix, out) {
    prefix = prefix || "";
    out = out || [];
    if (
      typeof expected !== "object" ||
      expected === null ||
      typeof actual !== "object" ||
      actual === null
    ) {
      if (expected !== actual) {
        out.push({ path: prefix || "(root)", expected: expected, actual: actual });
      }
      return out;
    }
    if (Array.isArray(expected) || Array.isArray(actual)) {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        out.push({ path: prefix || "(root)", expected: expected, actual: actual });
      }
      return out;
    }
    var keys = {};
    Object.keys(expected).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(actual).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(keys).forEach(function (k) {
      var p = prefix ? prefix + "." + k : k;
      if (!(k in expected)) {
        out.push({ path: p, expected: undefined, actual: actual[k] });
      } else if (!(k in actual)) {
        out.push({ path: p, expected: expected[k], actual: undefined });
      } else if (
        typeof expected[k] === "object" &&
        expected[k] !== null &&
        typeof actual[k] === "object" &&
        actual[k] !== null
      ) {
        diffPaths(expected[k], actual[k], p, out);
      } else if (expected[k] !== actual[k]) {
        out.push({ path: p, expected: expected[k], actual: actual[k] });
      }
    });
    return out;
  }

  /**
   * Live shadow compare: MOTOR-PARITY deep equality with diasRec excluded
   * (D5: server owns now_ms → diasRec often differs in live traffic).
   */
  function compareShadowResults(clientResult, serverResult) {
    var exp = normalizeForCompare(clientResult || {});
    var act = normalizeForCompare(serverResult || {});
    delete exp.diasRec;
    delete act.diasRec;
    var diffs = diffPaths(exp, act).filter(function (d) {
      return d.path !== "diasRec" && !(d.path && d.path.indexOf("diasRec") === 0);
    });
    return {
      ok: diffs.length === 0,
      diff_count: diffs.length,
      diffs: diffs.slice(0, 40),
      excluded_paths: ["diasRec"],
    };
  }

  function logShadow(payload) {
    try {
      console.info("[CZ_SHADOW]", JSON.stringify(payload));
    } catch (e) {}
    try {
      if (typeof trackEvent === "function") {
        // Internal-only style: do not push PII. Use a non-GTM name if registry blocks.
        if (window.location.search.indexOf("czdev=true") !== -1) {
          trackEvent("shadow_diagnosis_result", {
            shadow_status: payload.status,
            shadow_diff_count: payload.diff_count || 0,
            has_diagnosis_id: !!payload.diagnosis_id,
          });
        }
      }
    } catch (e2) {}
  }

  function record(status, extra) {
    _stats.attempts += 1;
    _stats.last_status = status;
    if (status === "MATCH") _stats.match += 1;
    else if (status === "MISMATCH") _stats.mismatch += 1;
    else _stats.error += 1;
    if (extra && extra.diagnosis_id) _stats.last_diagnosis_id = extra.diagnosis_id;
    if (extra && extra.diff_paths) _stats.last_diff_paths = extra.diff_paths;
    logShadow(
      Object.assign(
        {
          status: status,
          attempts: _stats.attempts,
          match: _stats.match,
          mismatch: _stats.mismatch,
          error: _stats.error,
        },
        extra || {}
      )
    );
    // Central metrics telemetry (best-effort; never blocks UX).
    try {
      reportShadowTelemetry(status, extra || {});
    } catch (eTel) {}
  }

  function isTechnicalShadow(st, extra) {
    try {
      if (new URLSearchParams(window.location.search).get("cz_shadow_tech") === "1") {
        return true;
      }
    } catch (e) {}
    if (_readFlag("CZ_SHADOW_TECHNICAL", typeof CZ_SHADOW_TECHNICAL !== "undefined" ? CZ_SHADOW_TECHNICAL : false)) {
      return true;
    }
    var name =
      (extra && extra.declared_nombre) ||
      (st && st.declared_nombre) ||
      (typeof PRE !== "undefined" && PRE && PRE.nombre) ||
      "";
    var email =
      (extra && extra.declared_email) ||
      (st && st.declared_email) ||
      (typeof PRE !== "undefined" && PRE && PRE.email) ||
      "";
    name = String(name || "");
    email = String(email || "").toLowerCase();
    if (/^QA\b/i.test(name.trim()) || /shadow.?prod|shadow.?metrics/i.test(name)) return true;
    if (/@example\.test$/i.test(email) || /@example\.com$/i.test(email)) return true;
    return false;
  }

  /**
   * POST /v1/diagnoses/:id/shadow-result — telemetry only.
   * Requires diagnosis_id (SHADOW_ERROR without id is not centralized).
   */
  function reportShadowTelemetry(status, extra) {
    var diagnosisId = extra && extra.diagnosis_id ? String(extra.diagnosis_id) : "";
    if (!diagnosisId) return;
    if (status !== "MATCH" && status !== "MISMATCH" && status !== "SHADOW_ERROR") return;
    var api = getApiBaseUrl();
    if (!api) return;
    var st = window.CZState || null;
    var payload = {
      status: status,
      diff_fields: Array.isArray(extra.diff_paths) ? extra.diff_paths.slice(0, 40) : [],
      is_technical: isTechnicalShadow(st, extra),
    };
    var url = api + "/v1/diagnoses/" + encodeURIComponent(diagnosisId) + "/shadow-result";
    try {
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (e) {}
  }

  /**
   * Non-blocking shadow attempt.
   * Unique attempt = unique EngineInput fingerprint (session memory) + not in-flight.
   */
  function _scheduleRerun(delayMs) {
    if (_rerunTimer) return;
    _rerunTimer = setTimeout(function () {
      _rerunTimer = null;
      maybeShadowDiagnosis(window.CZState, "rerun_latest");
    }, Math.max(0, delayMs) + 1);
  }

  /** Refresh recovery: V2 state is memory-only, so a restored dashboard asks the server again. */
  function restoreV2Strategy(st) {
    try {
      st = st || window.CZState;
      if (!isV2StrategyStateEnabled() || !st || st[V2_STATE_KEY]) return;
      maybeShadowDiagnosis(st, "session_restore");
    } catch (_e) {
      /* ignore */
    }
  }

  function maybeShadowDiagnosis(st, reason) {
    try {
      dropStaleV2Strategy(st);
      if (!isShadowEnabled()) return;
      st = st || window.CZState;
      if (!st || !st.diag) return;
      if (st.step != null && Number(st.step) < 3) return;

      var now = Date.now();
      // V2 state on: edits while busy are not dropped, the latest input is re-evaluated afterwards.
      // Off: legacy cadence (dropped).
      if (_inFlight) {
        if (isV2StrategyStateEnabled()) _rerunPending = true;
        return;
      }
      if (now < _cooldownUntil) {
        if (isV2StrategyStateEnabled()) _scheduleRerun(_cooldownUntil - now);
        return;
      }

      var anonId = getAnonymousId();
      if (!anonId) {
        record("SHADOW_ERROR", { reason: reason || null, error: "anonymous_id_missing" });
        return;
      }

      var input = buildEngineInput(st);
      if (!input) return;
      var fp = fingerprintInput(input);
      if (fp === _lastFingerprint) return;

      var clientResult = serializeClientEngineResult(st, st.diag);
      if (!clientResult) return;

      var api = getApiBaseUrl();
      var url = api + "/v1/diagnoses";
      var timeoutMs = getTimeoutMs();

      _inFlight = true;
      _lastFingerprint = fp;

      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = null;
      if (controller) {
        timer = setTimeout(function () {
          try {
            controller.abort();
          } catch (e) {}
        }, timeoutMs);
      }

      var payload = Object.assign({}, input);
      var jid = getActiveJourneyId();
      if (jid) payload.journey_id = jid;
      var v2Req = {
        enabled: isV2StrategyStateEnabled(),
        state: st,
        journeyId: jid,
        canonical: _canonicalInput(input),
        identityVersion: _identityVersionFor(input),
      };
      // New financial identity: the previous V2 result no longer describes it.
      // Semantic duplicates (same canonical input) keep it.
      if (v2Req.enabled && st === window.CZState) {
        var prevV2 = st[V2_STATE_KEY];
        if (!prevV2 || !v2Req.canonical || prevV2.input_canonical !== v2Req.canonical) {
          st[V2_STATE_KEY] = null;
        }
      }
      var body = JSON.stringify(payload);
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-MiPlan-Anonymous-Id": anonId,
        },
        body: body,
        signal: controller ? controller.signal : undefined,
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return null;
            })
            .then(function (json) {
              return { ok: res.ok, status: res.status, json: json };
            });
        })
        .then(function (res) {
          applyV2StrategyResponse(v2Req, res);
          if (!res.ok || !res.json || !res.json.result) {
            record("SHADOW_ERROR", {
              reason: reason || null,
              http_status: res.status,
              error: (res.json && res.json.error) || "bad_response",
            });
            _cooldownUntil = Date.now() + 15000;
            return;
          }
          var cmp = compareShadowResults(clientResult, res.json.result);
          if (cmp.ok) {
            record("MATCH", {
              reason: reason || null,
              diagnosis_id: res.json.diagnosis_id || null,
              engine_version: res.json.engine_version || null,
              diff_count: 0,
            });
          } else {
            record("MISMATCH", {
              reason: reason || null,
              diagnosis_id: res.json.diagnosis_id || null,
              engine_version: res.json.engine_version || null,
              diff_count: cmp.diff_count,
              diff_paths: cmp.diffs.map(function (d) {
                return d.path;
              }),
            });
          }
        })
        .catch(function (err) {
          record("SHADOW_ERROR", {
            reason: reason || null,
            error:
              err && err.name === "AbortError"
                ? "timeout"
                : "network_or_parse",
          });
          _cooldownUntil = Date.now() + 15000;
        })
        .then(function () {
          _inFlight = false;
          if (timer) clearTimeout(timer);
          if (_rerunPending) {
            _rerunPending = false;
            _scheduleRerun(0);
          }
        });
    } catch (e) {
      _inFlight = false;
      try {
        record("SHADOW_ERROR", { error: "client_exception" });
      } catch (e2) {}
    }
  }

  window.CZShadowDiagnosis = {
    maybeShadowDiagnosis: maybeShadowDiagnosis,
    buildEngineInput: buildEngineInput,
    serializeClientEngineResult: serializeClientEngineResult,
    compareShadowResults: compareShadowResults,
    getStats: function () {
      return Object.assign({}, _stats);
    },
    isShadowEnabled: isShadowEnabled,
    getApiBaseUrl: getApiBaseUrl,
    isV2StrategyStateEnabled: isV2StrategyStateEnabled,
    isDebtContractV2Capture: isDebtContractV2Capture,
    validateV2FinancialStrategy: validateV2FinancialStrategy,
    dropStaleV2Strategy: dropStaleV2Strategy,
    getCurrentV2Strategy: getCurrentV2Strategy,
    restoreV2Strategy: restoreV2Strategy,
    // test helpers
    _resetDedupeForTests: function () {
      _lastFingerprint = null;
      _inFlight = false;
      _cooldownUntil = 0;
      _rerunPending = false;
      if (_rerunTimer) clearTimeout(_rerunTimer);
      _rerunTimer = null;
    },
  };
})();
