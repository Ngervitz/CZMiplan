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
   * Map JANUS allowlisted context into PRE / CZState canonical fields.
   * Does not invent monto_solicitado / motivo_rechazo / legal consent.
   */
  function applyHandoffContextToPrefill(context) {
    if (!context || typeof context !== "object") return false;
    if (typeof PRE === "undefined" || !PRE) return false;

    var person = context.person || {};
    var financial = context.financial_prefill || {};
    var survey = context.survey || {};
    var respuestas = survey.respuestas || {};
    var st =
      typeof window !== "undefined" && window.CZState && typeof window.CZState === "object"
        ? window.CZState
        : null;

    if (person.nombre) {
      PRE.nombre = String(person.nombre);
      if (st) st.declared_nombre = PRE.nombre;
    }
    if (person.email) {
      PRE.email = String(person.email);
      if (st) st.user_email = PRE.email;
    }
    if (person.celular) PRE.telefono = String(person.celular);
    if (person.fecha_nacimiento) {
      PRE.fecha_nacimiento = String(person.fecha_nacimiento);
    }

    if (financial.ingreso != null && Number(financial.ingreso) > 0) {
      PRE.ingreso = Number(financial.ingreso);
      if (st) {
        st.declared_ingreso = PRE.ingreso;
        st.income_source = "handoff";
        st.financial_income_complete = true;
      }
    }
    if (financial.laboral && typeof PROFILE_LABORAL_VALUES !== "undefined") {
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
      st._entryFunnel =
        (context.context && context.context.funnel) || "credizona_rejected";
      if (hasSurvey) {
        st._diagSource = "janus_handoff";
      }
      var jid = getCurrentJourneyId();
      if (jid) st._journeyId = jid;
      if (
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

  function restoreCachedBootstrap() {
    try {
      var prevCtx = sessionStorage.getItem(STORAGE_CTX);
      var jid = getCurrentJourneyId();
      if (!prevCtx) return { applied: false, reason: "no_session_cache" };
      var cached = JSON.parse(prevCtx);
      if (jid) persistJourneyId(jid);
      applyHandoffContextToPrefill(cached);
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
        applyHandoffContextToPrefill(pack.body.context);
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
    normalizeSurveyLetter: normalizeSurveyLetter,
    stripHandoffFromUrl: stripHandoffFromUrl,
    getCurrentJourneyId: getCurrentJourneyId,
    persistJourneyId: persistJourneyId,
  };
})(typeof window !== "undefined" ? window : globalThis);
