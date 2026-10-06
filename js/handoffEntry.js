/**
 * js/handoffEntry.js — A3 Credizona → Mi Plan opaque handoff entry.
 * Browser never talks to JANUS; never sends LRW for context.
 * After redeem: persists journey_id locally; strips code from URL.
 * Entry authorization ≠ legal consent (never fabricates cz_tc/cz_disc).
 */
(function (global) {
  "use strict";

  var STORAGE_CTX = "cz_handoff_context_v1";
  var STORAGE_CODE_HASH = "cz_handoff_code_hash_v1";
  var STORAGE_JOURNEY = "cz_journey_id_v1";
  var STORAGE_CONSENT = "cz_handoff_consent_v1";
  var SURVEY_V2_ANSWER_KEYS = ["p1", "p2", "p3", "p4", "p5", "p6", "p8", "p9", "p10"];
  var SURVEY_V2_LOAN_PURPOSES = [
    "purchase_or_home_improvement",
    "unexpected_one_off_expense",
    "debt_management",
    "recurring_expense_shortfall",
    "work_or_business_investment",
    "other",
  ];

  // Same contract as server/modules/journey/surveyV2Signals.js#validateSurveyV2.
  function isValidSurveyV2(survey) {
    if (!survey || typeof survey !== "object" || Array.isArray(survey)) return false;
    if (survey.source_survey_version !== 2) return false;
    var r = survey.respuestas;
    if (!r || typeof r !== "object" || Array.isArray(r) || r.p7 != null) return false;
    for (var i = 0; i < SURVEY_V2_ANSWER_KEYS.length; i++) {
      var v = r[SURVEY_V2_ANSWER_KEYS[i]];
      if (v !== "A" && v !== "B" && v !== "C" && v !== "D") return false;
    }
    if (SURVEY_V2_LOAN_PURPOSES.indexOf(survey.loan_purpose) < 0) return false;
    var prov = survey.provenance;
    if (prov == null) return true;
    if (typeof prov !== "object" || Array.isArray(prov)) return false;
    return prov.source_survey_version == null || prov.source_survey_version === 2;
  }

  function readHandoffCodeFromLocation() {
    try {
      var path = String(global.location.pathname || "");
      var m = path.match(/\/e\/([^\/\?#]+)/);
      if (m && m[1]) {
        return decodeURIComponent(m[1]);
      }
      var q = new URLSearchParams(global.location.search || "");
      var e = q.get("e");
      if (e) return String(e).trim();
    } catch (_err) {
      /* ignore */
    }
    return "";
  }

  /**
   * Entry authorization only (not legal consent).
   * True when structural /e/{code} is present OR recoverable A3 session bootstrap.
   */
  function isEntryAuthorized() {
    if (readHandoffCodeFromLocation()) return true;
    try {
      var ctx = sessionStorage.getItem(STORAGE_CTX);
      var jid = sessionStorage.getItem(STORAGE_JOURNEY);
      if (ctx && jid) return true;
    } catch (_e) {
      /* ignore */
    }
    return false;
  }

  function stripHandoffFromUrl() {
    try {
      var path = String(global.location.pathname || "");
      var cleanPath = path.replace(/\/e\/[^\/\?#]+/, "/") || "/";
      if (cleanPath.length > 1 && cleanPath.endsWith("/")) {
        cleanPath = cleanPath.slice(0, -1) || "/";
      }
      var q = new URLSearchParams(global.location.search || "");
      q.delete("e");
      var qs = q.toString();
      var next = cleanPath + (qs ? "?" + qs : "") + (global.location.hash || "");
      global.history.replaceState({}, "", next);
    } catch (_err) {
      /* ignore */
    }
  }

  function simpleHash(str) {
    var h = 0;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  }

  function getBackendApi() {
    if (typeof CZ_BACKEND_API_URL === "string" && CZ_BACKEND_API_URL) {
      return CZ_BACKEND_API_URL.replace(/\/$/, "");
    }
    return "";
  }

  function getAnonymousId() {
    try {
      if (global.CZIdentity && global.CZIdentity.anonymous_id) {
        return String(global.CZIdentity.anonymous_id);
      }
    } catch (_e) {
      /* ignore */
    }
    return "";
  }

  function persistJourneyId(journeyId) {
    if (!journeyId) return;
    try {
      sessionStorage.setItem(STORAGE_JOURNEY, String(journeyId));
    } catch (_e) {
      /* ignore */
    }
    try {
      if (global.CZIdentity) {
        global.CZIdentity.journey_id = String(journeyId);
      }
    } catch (_e2) {
      /* ignore */
    }
    try {
      if (global.CZShadowDiagnosis && typeof global.CZShadowDiagnosis.dropStaleV2Strategy === "function") {
        global.CZShadowDiagnosis.dropStaleV2Strategy();
      }
    } catch (_e3) {
      /* ignore */
    }
  }

  function getCurrentJourneyId() {
    try {
      if (global.CZIdentity && global.CZIdentity.journey_id) {
        return String(global.CZIdentity.journey_id);
      }
    } catch (_e) {
      /* ignore */
    }
    try {
      var fromSession = sessionStorage.getItem(STORAGE_JOURNEY);
      if (fromSession) return String(fromSession);
    } catch (_e2) {
      /* ignore */
    }
    return "";
  }

  /** Canonical survey letter A–D; invalid → null. */
  function normalizeSurveyLetter(raw) {
    if (raw == null || raw === "") return null;
    var v = String(raw).trim().toUpperCase();
    if (v !== "A" && v !== "B" && v !== "C" && v !== "D") return null;
    return v;
  }

  /**
   * P-05 — the handoff is the journey's initial bootstrap, not a permanent authority.
   * True when localStorage already holds state persisted for this same journey.
   */
  function hasPersistedStateForJourney(journeyId) {
    if (!journeyId || typeof STORAGE_KEY === "undefined") return false;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      return !!(saved && saved.handoff_journey_id && String(saved.handoff_journey_id) === String(journeyId));
    } catch (_e) {
      return false;
    }
  }

  /**
   * Map JANUS allowlisted context into PRE / CZState canonical fields.
   * Does not invent monto_solicitado / motivo_rechazo / legal consent.
   * When this journey already has persisted state, declared fields (nombre, email,
   * ingreso, laboral) are left to init()'s local restore; only survey, handoff-only
   * PRE fields and journey metadata are applied.
   */
  function applyHandoffContextToPrefill(context) {
    if (!context || typeof context !== "object") return false;
    if (typeof PRE === "undefined" || !PRE) return false;

    var person = context.person || {};
    var financial = context.financial_prefill || {};
    var survey = context.survey || {};
    // Survey V2 (P7 = loan_purpose) and unknown versions never feed the legacy survey engine.
    var legacySurvey =
      survey.source_survey_version == null || survey.source_survey_version === 1;
    var respuestas = legacySurvey ? survey.respuestas || {} : {};
    var st =
      typeof window !== "undefined" && window.CZState && typeof window.CZState === "object"
        ? window.CZState
        : null;
    var jid = getCurrentJourneyId();
    var journeyRestore = hasPersistedStateForJourney(jid);

    if (person.nombre && !journeyRestore) {
      PRE.nombre = String(person.nombre);
      if (st) st.declared_nombre = PRE.nombre;
    }
    if (person.email && !journeyRestore) {
      PRE.email = String(person.email);
      if (st) st.user_email = PRE.email;
    }
    if (person.celular) PRE.telefono = String(person.celular);
    if (person.fecha_nacimiento) {
      PRE.fecha_nacimiento = String(person.fecha_nacimiento);
    }

    if (!journeyRestore && financial.ingreso != null && Number(financial.ingreso) > 0) {
      PRE.ingreso = Number(financial.ingreso);
      if (st) {
        st.declared_ingreso = PRE.ingreso;
        st.income_source = "handoff";
        st.financial_income_complete = true;
      }
    }
    if (!journeyRestore && financial.laboral && typeof PROFILE_LABORAL_VALUES !== "undefined") {
      if (PROFILE_LABORAL_VALUES.indexOf(financial.laboral) >= 0) {
        PRE.laboral = financial.laboral;
        if (st) st.declared_laboral = PRE.laboral;
      }
    }
    if (financial.laboral_source_raw) {
      PRE.laboral_source_raw = String(financial.laboral_source_raw);
    }

    var keys = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"];
    var hasSurvey = false;
    var complete = true;
    PRE.respuestas = PRE.respuestas || {};
    keys.forEach(function (k) {
      var letter = normalizeSurveyLetter(respuestas[k]);
      if (letter) {
        PRE.respuestas[k] = letter;
        hasSurvey = true;
      } else {
        complete = false;
      }
    });
    if (!hasSurvey) complete = false;

    if (st) {
      st._handoffPrefill = true;
      // Completed survey without legacy answers: skips the survey screens, never feeds PRE.respuestas.
      st._handoffSurveyV2Completed = isValidSurveyV2(survey);
      st._entryFunnel =
        (context.context && context.context.funnel) || "credizona_rejected";
      if (hasSurvey) {
        st._diagSource = "janus_handoff";
      }
      if (jid) st._journeyId = jid;
      st._handoffJourneyRestore = journeyRestore;
      if (
        !journeyRestore &&
        st.declared_nombre &&
        st.user_email &&
        st.declared_laboral &&
        st.financial_income_complete
      ) {
        st.financial_profile_complete = true;
      }
    }

    if (typeof refreshCanonicalEntryFlags === "function") {
      refreshCanonicalEntryFlags();
    }

    return true;
  }

  /**
   * Mi Plan T&C/Privacy accepted on the Credizona thank-you page, as returned by the backend redeem.
   * Valid only for this exact journey and Mi Plan's current legal versions.
   */
  function verifyGraciasConsent(raw, journeyId) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !journeyId) return null;
    if (raw.source !== "credizona_gracias") return null;
    if (typeof LEGAL_VERSION_TC === "undefined" || typeof LEGAL_VERSION_PRIVACY === "undefined") return null;
    if (raw.tc_version !== LEGAL_VERSION_TC || raw.privacy_version !== LEGAL_VERSION_PRIVACY) return null;
    if (String(raw.journey_id || "") !== String(journeyId)) return null;
    var acceptedMs = typeof raw.accepted_at === "string" ? Date.parse(raw.accepted_at) : NaN;
    if (!isFinite(acceptedMs)) return null;
    return {
      source: "credizona_gracias",
      tc_version: raw.tc_version,
      privacy_version: raw.privacy_version,
      accepted_at: new Date(acceptedMs).toISOString(),
      journey_id: String(journeyId),
    };
  }

  function persistGraciasConsent(consent) {
    try {
      if (consent) sessionStorage.setItem(STORAGE_CONSENT, JSON.stringify(consent));
      else sessionStorage.removeItem(STORAGE_CONSENT);
    } catch (_e) {
      /* ignore */
    }
  }

  function applyGraciasConsent(journeyId) {
    var consent = null;
    try {
      consent = verifyGraciasConsent(JSON.parse(sessionStorage.getItem(STORAGE_CONSENT) || "null"), journeyId);
    } catch (_e) {
      consent = null;
    }
    var st = global.CZState && typeof global.CZState === "object" ? global.CZState : null;
    if (st) st._handoffConsent = consent;
    return consent;
  }

  function restoreCachedBootstrap() {
    try {
      var prevCtx = sessionStorage.getItem(STORAGE_CTX);
      var jid = getCurrentJourneyId();
      if (!prevCtx) return { applied: false, reason: "no_session_cache" };
      var cached = JSON.parse(prevCtx);
      if (jid) persistJourneyId(jid);
      applyHandoffContextToPrefill(cached);
      applyGraciasConsent(jid);
      return { applied: true, reason: "session_cache", journey_id: jid || null };
    } catch (_c) {
      return { applied: false, reason: "cache_error" };
    }
  }

  /**
   * @returns {Promise<{ applied: boolean, reason?: string, journey_id?: string }>}
   */
  function maybeRedeemHandoffOnEntry() {
    var code = readHandoffCodeFromLocation();
    if (!code) {
      return Promise.resolve(restoreCachedBootstrap());
    }

    var api = getBackendApi();
    var anon = getAnonymousId();
    if (!api || !anon) {
      return Promise.resolve({ applied: false, reason: "not_ready" });
    }

    var hash = simpleHash(code);
    try {
      var prevHash = sessionStorage.getItem(STORAGE_CODE_HASH);
      var prevCtx = sessionStorage.getItem(STORAGE_CTX);
      var prevJourney = getCurrentJourneyId();
      if (prevHash === hash && prevCtx && prevJourney) {
        var cached = JSON.parse(prevCtx);
        applyHandoffContextToPrefill(cached);
        applyGraciasConsent(prevJourney);
        stripHandoffFromUrl();
        return Promise.resolve({
          applied: true,
          reason: "session_cache",
          journey_id: prevJourney,
        });
      }
    } catch (_c) {
      /* ignore */
    }

    return fetch(api + "/v1/handoff/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MiPlan-Anonymous-Id": anon,
        Accept: "application/json",
      },
      body: JSON.stringify({ handoff_code: code }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        stripHandoffFromUrl();
        if (!pack.res.ok || !pack.body || !pack.body.context) {
          return {
            applied: false,
            reason: (pack.body && pack.body.code) || "redeem_failed",
          };
        }
        var journeyId = pack.body.journey_id ? String(pack.body.journey_id) : "";
        try {
          sessionStorage.setItem(STORAGE_CTX, JSON.stringify(pack.body.context));
          sessionStorage.setItem(STORAGE_CODE_HASH, hash);
        } catch (_s) {
          /* ignore */
        }
        if (journeyId) persistJourneyId(journeyId);
        persistGraciasConsent(verifyGraciasConsent(pack.body.miplan_consent, journeyId));
        applyHandoffContextToPrefill(pack.body.context);
        applyGraciasConsent(journeyId);
        return {
          applied: true,
          reason: pack.body.cached ? "durable_cache" : "redeemed",
          journey_id: journeyId || null,
        };
      })
      .catch(function () {
        stripHandoffFromUrl();
        return { applied: false, reason: "network" };
      });
  }

  global.CZHandoffEntry = {
    readHandoffCodeFromLocation: readHandoffCodeFromLocation,
    isEntryAuthorized: isEntryAuthorized,
    maybeRedeemHandoffOnEntry: maybeRedeemHandoffOnEntry,
    applyHandoffContextToPrefill: applyHandoffContextToPrefill,
    isValidSurveyV2: isValidSurveyV2,
    verifyGraciasConsent: verifyGraciasConsent,
    normalizeSurveyLetter: normalizeSurveyLetter,
    stripHandoffFromUrl: stripHandoffFromUrl,
    getCurrentJourneyId: getCurrentJourneyId,
    persistJourneyId: persistJourneyId,
    hasPersistedStateForJourney: hasPersistedStateForJourney,
  };
})(typeof window !== "undefined" ? window : globalThis);
