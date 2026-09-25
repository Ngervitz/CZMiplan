/**
 * server/modules/diagnosis/service.js
 * HTTP → service → engine → repository → Supabase
 */
"use strict";

var runEngine = require("../../../engine").runEngine;

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
  // Journey identity is not engine input (MIPLAN-JOURNEY-01)
  delete input.journey_id;

  return input;
}

var JOURNEY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('./repository').createDiagnosisRepository>} deps.repository
 * @param {string} deps.tenantId
 * @param {{ assertOwned?: Function }} [deps.journeyService]
 * @param {typeof runEngine} [deps.runEngineFn]
 */
function createDiagnosisService(deps) {
  var repository = deps.repository;
  var tenantId = deps.tenantId;
  var journeyService = deps.journeyService || null;
  var engineFn = deps.runEngineFn || runEngine;

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

    return {
      diagnosis_id: inserted.diagnosis_id,
      engine_version: out.engine_version,
      result: out.engine_result,
      now_ms: out.now_ms,
      journey_id: journeyId,
    };
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
};
