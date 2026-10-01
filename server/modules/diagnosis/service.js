/**
 * server/modules/diagnosis/service.js
 * HTTP → service → engine → repository → Supabase
 */
"use strict";

var runEngine = require("../../../engine").runEngine;
var classifyFinancialShadow =
  require("../../../engine/classifier/financial-classifier").classifyFinancialShadow;
var deriveFinancialInputIdentity = require("./financialIdentity").deriveFinancialInputIdentity;
var buildActionContext = require("./actionContext").buildActionContext;

var SURVEY_VERSION_V2 = 2;

var V2_STRATEGY_WRITE_UNCONFIRMED = "V2_STRATEGY_WRITE_UNCONFIRMED";

function projectFactRef(item) {
  var out = { fact: item.fact, subject: item.subject };
  if (item.subject === "debt") out.debt_index = item.debt_index;
  return out;
}

/**
 * V2-STRATEGY-RUNTIME-WIRING-IMPLEMENT-01 — stable public projection of a persisted V2 classification.
 * Explicit allowlist: canonical_facts (amounts), per-fact provenance, compatible set, thresholds
 * and diagnostics stay server-side.
 */
function projectV2FinancialStrategy(r, surveyVersion, identity) {
  return {
    survey_version: surveyVersion,
    classification_status: r.classification_status,
    strategy: r.strategy,
    reasons: r.entry_reasons.slice(),
    verification: {
      required: r.verification_required === true,
      reasons: r.verification_reasons.map(function (v) {
        return Object.assign({ code: v.code }, projectFactRef(v));
      }),
      missing_facts: r.missing_required_facts.map(projectFactRef),
    },
    provenance: {
      classifier_version: r.classifier_version,
      contract: r.contract,
    },
    financial_input_identity: { version: identity.version, value: identity.value },
  };
}

/**
 * The RPC returns the evaluation this diagnosis is linked to (new or reused); exposure requires
 * it to be for this diagnosis, this identity, this classifier_version and this classification.
 */
function isConfirmedEvaluation(saved, diagnosisId, identity, r) {
  var stored = saved && saved.result;
  return !!saved && typeof saved === "object" &&
    typeof saved.evaluation_id === "string" && saved.evaluation_id !== "" &&
    String(saved.diagnosis_id) === String(diagnosisId) &&
    typeof saved.linked === "boolean" &&
    saved.financial_input_identity_version === identity.version &&
    saved.financial_input_identity === identity.value &&
    saved.classifier_version === r.classifier_version &&
    saved.classification_status === r.classification_status &&
    saved.strategy === r.strategy &&
    !!stored && typeof stored === "object" && !Array.isArray(stored) &&
    stored.classifier_version === r.classifier_version &&
    stored.classification_status === r.classification_status &&
    stored.strategy === r.strategy;
}

var ENTRY_CONTEXT_ALLOWED = {
  entryContext: true,
  trafficSource: true,
  hasRejectionContext: true,
  evidenceStrength: true,
  reasons: true,
  entry_source: true,
  traffic_source: true,
  has_rejection_context: true,
  evidence_strength: true,
  acquisition: true,
  attribution_policy: true,
  external_reference: true,
  captured_at: true,
  schema_version: true,
  field_provenance: true,
};

var ACQUISITION_ALLOWED = {
  source: true,
  intent: true,
  question: true,
  utm_source: true,
  utm_medium: true,
  utm_campaign: true,
  utm_content: true,
  utm_term: true,
};

var PROVENANCE_SOURCES = {
  user_entered: true,
  url_prefill: true,
  handoff: true,
  seo_survey: true,
  external_import: true,
  engine_input: true,
};

function clampStr(raw, maxLen) {
  if (raw == null) return null;
  var s = String(raw).trim();
  if (s === "") return null;
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function sanitizeAcquisition(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var out = {};
  var keys = Object.keys(ACQUISITION_ALLOWED);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    var v = clampStr(raw[k], 64);
    if (v != null) out[k] = v;
  }
  // Only allow known acquisition.source values (seo_ia). Docs acquisition=seo_ia param stays DESIGNED_ONLY.
  if (out.source && out.source !== "seo_ia") {
    delete out.source;
  }
  return out;
}

function sanitizeFieldProvenance(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var out = {};
  var fields = Object.keys(raw);
  for (var i = 0; i < fields.length && i < 32; i++) {
    var field = String(fields[i]).slice(0, 64);
    var meta = raw[fields[i]];
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    var src = clampStr(meta.source, 32);
    if (!src || !PROVENANCE_SOURCES[src]) continue;
    var entry = { source: src, user_modified: !!meta.user_modified };
    if (meta.detail != null) {
      var d = clampStr(meta.detail, 64);
      if (d) entry.detail = d;
    }
    out[field] = entry;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * ENTRY-01 — allowlist + truncate entry_context. Never trust arbitrary client JSON.
 * Does not change financial scoring inputs.
 */
function sanitizeEntryContext(raw) {
  if (raw == null) return "DEFAULT";
  if (typeof raw === "string") {
    var s = clampStr(raw, 64);
    return s || "DEFAULT";
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return "DEFAULT";

  var out = {};
  var keys = Object.keys(raw);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!ENTRY_CONTEXT_ALLOWED[k]) continue;
    var v = raw[k];
    if (k === "reasons") {
      if (!Array.isArray(v)) continue;
      out.reasons = v
        .slice(0, 20)
        .map(function (r) {
          return clampStr(r, 64);
        })
        .filter(Boolean);
      continue;
    }
    if (k === "acquisition") {
      var acq = sanitizeAcquisition(v);
      if (acq) out.acquisition = acq;
      continue;
    }
    if (k === "field_provenance") {
      var fp = sanitizeFieldProvenance(v);
      if (fp) out.field_provenance = fp;
      continue;
    }
    if (k === "hasRejectionContext" || k === "has_rejection_context") {
      out[k] = !!v;
      continue;
    }
    if (k === "schema_version") {
      var n = parseInt(v, 10);
      if (Number.isFinite(n)) out.schema_version = n;
      continue;
    }
    if (typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    if (typeof v === "string" || typeof v === "number") {
      var cs = clampStr(v, 64);
      if (cs != null) out[k] = cs;
    }
  }

  if (!out.entryContext && out.entry_source) out.entryContext = out.entry_source;
  if (!out.trafficSource && out.traffic_source) out.trafficSource = out.traffic_source;
  if (out.hasRejectionContext == null && out.has_rejection_context != null) {
    out.hasRejectionContext = out.has_rejection_context;
  }
  if (!out.attribution_policy) out.attribution_policy = "CURRENT_ENTRY";

  return Object.keys(out).length ? out : "DEFAULT";
}

/**
 * Build engine input from request body (strip client authorities).
 */
function extractEngineInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  var source = body.input && typeof body.input === "object" && !Array.isArray(body.input)
    ? body.input
    : body;

  var input = Object.assign({}, source);
  delete input.anonymous_id;
  delete input.diagnosis_id;
  delete input.engine_result;
  delete input.engine_version;
  delete input.result;
  delete input.completeness;
  delete input.completeness_recomputed;
  delete input.client_completeness_flags;
  // D5: ignore client clock authority
  delete input.now_ms;
  // ENTRY-01 — contact/identification must not become engine financial input
  delete input.cedula;
  delete input.telefono;
  delete input.monto;
  delete input.phone;
  delete input.ci;
  // Journey identity is not engine input (MIPLAN-JOURNEY-01)
  delete input.journey_id;

  // Merge top-level acquisition into entry_context then keep sanitized copy
  var entry = input.entry_context;
  if (
    input.acquisition &&
    typeof input.acquisition === "object" &&
    !Array.isArray(input.acquisition)
  ) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      entry = {};
    } else {
      entry = Object.assign({}, entry);
    }
    if (!entry.acquisition) entry.acquisition = input.acquisition;
    input.entry_context = entry;
  }
  delete input.acquisition;

  input.entry_context = sanitizeEntryContext(input.entry_context);

  return input;
}

var JOURNEY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('./repository').createDiagnosisRepository>} deps.repository
 * @param {string} deps.tenantId
 * @param {{ assertOwned?: Function, surveyVersionOf?: Function }} [deps.journeyService]
 * @param {typeof runEngine} [deps.runEngineFn]
 * @param {typeof classifyFinancialShadow} [deps.classifyFn]
 */
function createDiagnosisService(deps) {
  var repository = deps.repository;
  var tenantId = deps.tenantId;
  var journeyService = deps.journeyService || null;
  var engineFn = deps.runEngineFn || runEngine;
  var classifyFn = deps.classifyFn || classifyFinancialShadow;

  /**
   * V2-NEW-STRATEGY-INTEGRATION-01 — compute-only: V2 journeys get the new financial
   * strategy persisted apart from the legacy result. Survey version comes from the
   * server-side journey bootstrap, never from the client. V1/unversioned journeys are
   * not classified. Never alters or fails the legacy diagnosis.
   * The legacy diagnosis is never deduplicated; only the V2 result is: one evaluation per
   * (journey, financial_input_identity, classifier_version), linked from every diagnosis using it.
   * Returns the public projection and the action_context of the stored evaluation when
   * confirmed; otherwise null.
   */
  async function recordV2Strategy(args) {
    if (!args.journeyId || !journeyService || typeof journeyService.surveyVersionOf !== "function") {
      return null;
    }
    if (typeof repository.recordFinancialStrategyEvaluation !== "function") return null;
    try {
      var version = await journeyService.surveyVersionOf(args.journeyId, args.anonymousId);
      if (version !== SURVEY_VERSION_V2) return null;
      var identity = deriveFinancialInputIdentity(args.engineInput);
      if (!identity) return null;
      var r = classifyFn(args.engineInput);
      var saved = await repository.recordFinancialStrategyEvaluation({
        diagnosis_id: args.diagnosisId,
        journey_id: args.journeyId,
        anonymous_id: args.anonymousId,
        identity_version: identity.version,
        identity: identity.value,
        survey_version: SURVEY_VERSION_V2,
        classifier_version: r.classifier_version,
        contract: r.contract,
        threshold_version: r.threshold_version,
        classification_status: r.classification_status,
        strategy: r.strategy,
        result: r,
      });
      if (!isConfirmedEvaluation(saved, args.diagnosisId, identity, r)) {
        console.warn("[v2-strategy] not recorded: " + V2_STRATEGY_WRITE_UNCONFIRMED);
        return null;
      }
      return {
        strategy: projectV2FinancialStrategy(saved.result, version, identity),
        actionContext: buildActionContext(saved.result),
      };
    } catch (e) {
      console.warn("[v2-strategy] not recorded: " + String((e && e.code) || (e && e.name) || "ERROR"));
      return null;
    }
  }

  /**
   * Optional journey_id on body — must belong to anonymous_id. Never authorizes alone.
   */
  async function resolveOptionalJourneyId(anonymousId, body) {
    if (!body || typeof body !== "object" || body.journey_id == null || body.journey_id === "") {
      return null;
    }
    var jid = String(body.journey_id).trim();
    if (!JOURNEY_ID_RE.test(jid)) {
      var badJ = new Error("INVALID_JOURNEY_ID");
      badJ.status = 400;
      badJ.code = "INVALID_JOURNEY_ID";
      throw badJ;
    }
    if (!journeyService || typeof journeyService.assertOwned !== "function") {
      var unavail = new Error("JOURNEY_SERVICE_UNAVAILABLE");
      unavail.status = 503;
      unavail.code = "JOURNEY_SERVICE_UNAVAILABLE";
      throw unavail;
    }
    await journeyService.assertOwned(jid, anonymousId);
    return jid;
  }

  /**
   * @param {{ anonymousId: string, body: object }} args
   */
  async function createDiagnosis(args) {
    var engineInput = extractEngineInput(args.body);
    if (!engineInput) {
      var bad = new Error("ENGINE_INPUT_REQUIRED");
      bad.status = 400;
      bad.code = "ENGINE_INPUT_REQUIRED";
      throw bad;
    }

    var journeyId = await resolveOptionalJourneyId(args.anonymousId, args.body);
    var classifierInput = journeyId ? JSON.parse(JSON.stringify(engineInput)) : null;

    var nowMs = Date.now();
    var out;
    try {
      out = engineFn(engineInput, { now_ms: nowMs });
    } catch (e) {
      var engErr = new Error("ENGINE_FAILURE");
      engErr.status = 500;
      engErr.code = "ENGINE_FAILURE";
      engErr.cause = e;
      throw engErr;
    }

    if (!out || !out.engine_result) {
      var empty = new Error("ENGINE_FAILURE");
      empty.status = 500;
      empty.code = "ENGINE_FAILURE";
      throw empty;
    }

    var completeness =
      out.engine_result.completeness_recomputed != null
        ? out.engine_result.completeness_recomputed
        : {};

    var inputSnapshot = Object.assign({}, engineInput);

    var inserted = await repository.insertDiagnosis({
      anonymous_id: args.anonymousId,
      tenant_id: tenantId,
      now_ms: out.now_ms,
      engine_version: out.engine_version,
      input_snapshot: inputSnapshot,
      engine_result: out.engine_result,
      completeness: completeness,
      journey_id: journeyId,
    });

    var v2Strategy = await recordV2Strategy({
      diagnosisId: inserted.diagnosis_id,
      journeyId: journeyId,
      anonymousId: args.anonymousId,
      engineInput: classifierInput,
    });

    var created = {
      diagnosis_id: inserted.diagnosis_id,
      engine_version: out.engine_version,
      result: out.engine_result,
      now_ms: out.now_ms,
      journey_id: journeyId,
    };
    if (v2Strategy) {
      created.v2_financial_strategy = v2Strategy.strategy;
      created.v2_action_context = v2Strategy.actionContext;
    }
    return created;
  }

  /**
   * Persist client-reported shadow comparison telemetry (not business authority).
   * @param {{ diagnosisId: string, body: object }} args
   */
  async function recordShadowResult(args) {
    var diagnosisId = String(args.diagnosisId || "").trim();
    var uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(diagnosisId)) {
      var badId = new Error("INVALID_DIAGNOSIS_ID");
      badId.status = 400;
      badId.code = "INVALID_DIAGNOSIS_ID";
      throw badId;
    }

    var body = args.body && typeof args.body === "object" && !Array.isArray(args.body)
      ? args.body
      : null;
    if (!body) {
      var badBody = new Error("SHADOW_RESULT_REQUIRED");
      badBody.status = 400;
      badBody.code = "SHADOW_RESULT_REQUIRED";
      throw badBody;
    }

    var status = String(body.status || body.shadow_status || "").trim().toUpperCase();
    if (status !== "MATCH" && status !== "MISMATCH" && status !== "SHADOW_ERROR") {
      var badStatus = new Error("INVALID_SHADOW_STATUS");
      badStatus.status = 400;
      badStatus.code = "INVALID_SHADOW_STATUS";
      throw badStatus;
    }

    var rawDiff = body.diff_fields != null ? body.diff_fields : body.diff_paths;
    if (rawDiff == null) rawDiff = [];
    if (!Array.isArray(rawDiff)) {
      var badDiff = new Error("INVALID_DIFF_FIELDS");
      badDiff.status = 400;
      badDiff.code = "INVALID_DIFF_FIELDS";
      throw badDiff;
    }
    if (rawDiff.length > 40) {
      var tooMany = new Error("INVALID_DIFF_FIELDS");
      tooMany.status = 400;
      tooMany.code = "INVALID_DIFF_FIELDS";
      throw tooMany;
    }
    var diffFields = [];
    for (var i = 0; i < rawDiff.length; i++) {
      var item = rawDiff[i];
      var path = typeof item === "string" ? item : item && item.path != null ? String(item.path) : null;
      if (!path) continue;
      path = path.slice(0, 200);
      diffFields.push(path);
    }

    var isTechnical = !!(body.is_technical === true || body.is_technical === "true");

    var saved = await repository.upsertShadowResult({
      diagnosis_id: diagnosisId,
      shadow_status: status,
      diff_fields: diffFields,
      is_technical: isTechnical,
    });

    return {
      diagnosis_id: saved && saved.diagnosis_id ? String(saved.diagnosis_id) : diagnosisId,
      shadow_status: saved && saved.shadow_status ? String(saved.shadow_status) : status,
      inserted: !!(saved && saved.inserted),
      compared_at: saved && saved.compared_at ? saved.compared_at : null,
    };
  }

  return {
    createDiagnosis: createDiagnosis,
    recordShadowResult: recordShadowResult,
    extractEngineInput: extractEngineInput,
  };
}

module.exports = {
  createDiagnosisService: createDiagnosisService,
  extractEngineInput: extractEngineInput,
  sanitizeEntryContext: sanitizeEntryContext,
  projectV2FinancialStrategy: projectV2FinancialStrategy,
};
