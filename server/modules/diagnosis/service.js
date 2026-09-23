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

  return input;
}

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('./repository').createDiagnosisRepository>} deps.repository
 * @param {string} deps.tenantId
 * @param {typeof runEngine} [deps.runEngineFn]
 */
function createDiagnosisService(deps) {
  var repository = deps.repository;
  var tenantId = deps.tenantId;
  var engineFn = deps.runEngineFn || runEngine;

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
    });

    return {
      diagnosis_id: inserted.diagnosis_id,
      engine_version: out.engine_version,
      result: out.engine_result,
      now_ms: out.now_ms,
    };
  }

  return { createDiagnosis: createDiagnosis, extractEngineInput: extractEngineInput };
}

module.exports = {
  createDiagnosisService: createDiagnosisService,
  extractEngineInput: extractEngineInput,
};
