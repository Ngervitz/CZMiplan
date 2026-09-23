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
    var { data, error } = await client.rpc("miplan_persist_diagnosis", {
      p_secret: backendSecret,
      p_anonymous_id: row.anonymous_id,
      p_tenant_id: row.tenant_id || tenantId,
      p_now_ms: row.now_ms,
      p_engine_version: row.engine_version,
      p_input_snapshot: row.input_snapshot,
      p_engine_result: row.engine_result,
      p_completeness: row.completeness,
    });

    if (error) {
      var dbErr = new Error("DB_PERSIST_FAILED");
      dbErr.status = 500;
      dbErr.code = "DB_PERSIST_FAILED";
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

  return {
    insertDiagnosis: insertDiagnosis,
    getDiagnosisById: getDiagnosisById,
  };
}

module.exports = { createDiagnosisRepository: createDiagnosisRepository };
