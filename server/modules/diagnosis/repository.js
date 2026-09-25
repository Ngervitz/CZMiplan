/**
 * server/modules/diagnosis/repository.js
 * All Supabase access for diagnoses lives here (not in routes).
 */
"use strict";

/**
 * @param {object} deps
 * @param {import('@supabase/supabase-js').SupabaseClient} deps.client
 * @param {string} deps.backendSecret
 * @param {string} deps.tenantId
 */
function createDiagnosisRepository(deps) {
  var client = deps.client;
  var backendSecret = deps.backendSecret;
  var tenantId = deps.tenantId;

  if (!backendSecret) {
    var cfgErr = new Error("SUPABASE_CONFIG_MISSING");
    cfgErr.status = 503;
    cfgErr.code = "SUPABASE_CONFIG_MISSING";
    throw cfgErr;
  }

  /**
   * Append-only insert. Returns { diagnosis_id }.
   */
  async function insertDiagnosis(row) {
    var params = {
      p_secret: backendSecret,
      p_anonymous_id: row.anonymous_id,
      p_tenant_id: row.tenant_id || tenantId,
      p_now_ms: row.now_ms,
      p_engine_version: row.engine_version,
      p_input_snapshot: row.input_snapshot,
      p_engine_result: row.engine_result,
      p_completeness: row.completeness,
    };
    // Optional until migration applied; omit when null so 8-arg overload still works.
    if (row.journey_id) {
      params.p_journey_id = row.journey_id;
    }

    var { data, error } = await client.rpc("miplan_persist_diagnosis", params);

    if (error) {
      var msg = String((error && error.message) || "");
      var dbErr = new Error("DB_PERSIST_FAILED");
      dbErr.status = 500;
      dbErr.code = "DB_PERSIST_FAILED";
      if (/JOURNEY_OWNERSHIP_MISMATCH/i.test(msg)) {
        dbErr.status = 403;
        dbErr.code = "JOURNEY_OWNERSHIP_MISMATCH";
      } else if (/JOURNEY_NOT_FOUND|P0002/i.test(msg)) {
        dbErr.status = 404;
        dbErr.code = "JOURNEY_NOT_FOUND";
      }
      dbErr.cause = error;
      throw dbErr;
    }

    if (!data) {
      var empty = new Error("DB_PERSIST_FAILED");
      empty.status = 500;
      empty.code = "DB_PERSIST_FAILED";
      throw empty;
    }

    return { diagnosis_id: String(data) };
  }

  /** Internal/test read — not exposed as public HTTP in B2. */
  async function getDiagnosisById(diagnosisId) {
    var { data, error } = await client.rpc("miplan_get_diagnosis", {
      p_secret: backendSecret,
      p_diagnosis_id: diagnosisId,
    });
    if (error) {
      var dbErr = new Error("DB_READ_FAILED");
      dbErr.status = 500;
      dbErr.code = "DB_READ_FAILED";
      dbErr.cause = error;
      throw dbErr;
    }
    return data || null;
  }

  /**
   * Upsert shadow comparison telemetry for an existing diagnosis.
   * First write wins (unique diagnosis_id). Never mutates diagnoses.* authority fields.
   */
  async function upsertShadowResult(row) {
    var { data, error } = await client.rpc("miplan_upsert_shadow_result", {
      p_secret: backendSecret,
      p_diagnosis_id: row.diagnosis_id,
      p_shadow_status: row.shadow_status,
      p_diff_fields: row.diff_fields != null ? row.diff_fields : [],
      p_is_technical: !!row.is_technical,
    });

    if (error) {
      var msg = String((error && error.message) || "");
      var dbErr = new Error("DB_SHADOW_UPSERT_FAILED");
      dbErr.status = 500;
      dbErr.code = "DB_SHADOW_UPSERT_FAILED";
      if (/DIAGNOSIS_NOT_FOUND/i.test(msg) || /P0002/.test(msg)) {
        dbErr.status = 404;
        dbErr.code = "DIAGNOSIS_NOT_FOUND";
      } else if (/INVALID_SHADOW_STATUS/i.test(msg)) {
        dbErr.status = 400;
        dbErr.code = "INVALID_SHADOW_STATUS";
      } else if (/INVALID_DIFF_FIELDS|DIFF_FIELDS_TOO_LARGE/i.test(msg)) {
        dbErr.status = 400;
        dbErr.code = "INVALID_DIFF_FIELDS";
      } else if (/INVALID_DIAGNOSIS_ID/i.test(msg)) {
        dbErr.status = 400;
        dbErr.code = "INVALID_DIAGNOSIS_ID";
      } else if (/MIPLAN_UNAUTHORIZED|42501/i.test(msg)) {
        dbErr.status = 500;
        dbErr.code = "DB_SHADOW_UPSERT_FAILED";
      }
      dbErr.cause = error;
      throw dbErr;
    }

    return data || null;
  }

  return {
    insertDiagnosis: insertDiagnosis,
    getDiagnosisById: getDiagnosisById,
    upsertShadowResult: upsertShadowResult,
  };
}

module.exports = { createDiagnosisRepository: createDiagnosisRepository };
