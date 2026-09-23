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

  function getApiBaseUrl() {
    var fromQuery = null;
    try {
      var sp = new URLSearchParams(window.location.search);
      if (sp.get("cz_api")) fromQuery = String(sp.get("cz_api") || "").trim();
    } catch (e) {}
    var raw =
      fromQuery ||
      _readFlag("CZ_BACKEND_API_URL", typeof CZ_BACKEND_API_URL !== "undefined" ? CZ_BACKEND_API_URL : "") ||
      "";
    return String(raw).replace(/\/+$/, "");
  }

  function isShadowEnabled() {
    var q = false;
    try {
      q = new URLSearchParams(window.location.search).get("cz_shadow") === "1";
    } catch (e) {}
    var flag = _readFlag(
      "CZ_SHADOW_MODE",
      typeof CZ_SHADOW_MODE !== "undefined" ? CZ_SHADOW_MODE : false
    );
    return !!(q || flag) && !!getApiBaseUrl();
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
      entry_context:
        typeof CZ_ENTRY_CONTEXT !== "undefined" && CZ_ENTRY_CONTEXT
          ? CZ_ENTRY_CONTEXT
          : "DEFAULT",
    };

    // Never send client authorities
    delete input.now_ms;
    delete input.engine_result;
    delete input.engine_version;
    delete input.diagnosis_id;
    delete input.completeness;
    delete input.completeness_recomputed;
    delete input.result;

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
  }

  /**
   * Non-blocking shadow attempt.
   * Unique attempt = unique EngineInput fingerprint (session memory) + not in-flight.
   */
  function maybeShadowDiagnosis(st, reason) {
    try {
      if (!isShadowEnabled()) return;
      st = st || window.CZState;
      if (!st || !st.diag) return;
      if (st.step != null && Number(st.step) < 3) return;

      var now = Date.now();
      if (_inFlight) return;
      if (now < _cooldownUntil) return;

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

      var body = JSON.stringify(input);
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
    // test helpers
    _resetDedupeForTests: function () {
      _lastFingerprint = null;
      _inFlight = false;
      _cooldownUntil = 0;
    },
  };
})();
