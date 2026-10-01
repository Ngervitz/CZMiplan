/**
 * server/testing/memoryStrategyEvaluations.js — in-memory twin of
 * miplan_record_financial_strategy_evaluation (migration 20260930120000) for service-level tests.
 *
 * Same semantics as the RPC: one evaluation per (journey_id, identity_version, identity,
 * classifier_version); the first writer is the origin; later diagnoses link to it; a different
 * classification under the same key raises STRATEGY_EVALUATION_MISMATCH; a diagnosis links once.
 * Ownership/survey checks stay in the service + journey service (the RPC re-checks them in SQL).
 */
"use strict";

var crypto = require("crypto");

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function incomeProvenance(result) {
  return result && result.provenance && result.provenance.income !== undefined ? result.provenance.income : null;
}

/** RPC rule: equal except the provenance.income echo; its prefill_unconfirmed flag must match. */
function sameSemanticResult(a, b) {
  var x = clone(a);
  var y = clone(b);
  var px = incomeProvenance(x);
  var py = incomeProvenance(y);
  if ((px && px.prefill_unconfirmed) !== (py && py.prefill_unconfirmed)) return false;
  if (x && x.provenance) delete x.provenance.income;
  if (y && y.provenance) delete y.provenance.income;
  return sameJson(x, y);
}

function fail(code) {
  var e = new Error(code);
  e.code = code;
  return e;
}

function createMemoryStrategyEvaluationStore() {
  var evaluations = [];
  var links = [];

  function scopeKey(row) {
    return [row.journey_id, row.identity_version, row.identity, row.classifier_version].join("|");
  }

  function reply(ev, diagnosisId, created, linked) {
    return {
      evaluation_id: ev.evaluation_id,
      diagnosis_id: diagnosisId,
      origin_diagnosis_id: ev.origin_diagnosis_id,
      created: created,
      linked: linked,
      reused: ev.origin_diagnosis_id !== diagnosisId,
      financial_input_identity_version: ev.financial_input_identity_version,
      financial_input_identity: ev.financial_input_identity,
      classifier_version: ev.classifier_version,
      contract: ev.contract,
      threshold_version: ev.threshold_version,
      survey_version: ev.survey_version,
      classification_status: ev.classification_status,
      strategy: ev.strategy,
      result: clone(ev.result),
      computed_at: ev.computed_at,
    };
  }

  function record(row) {
    var key = scopeKey(row);
    var ev = evaluations.find(function (e) { return e._key === key; });
    var created = false;
    if (!ev) {
      ev = {
        _key: key,
        evaluation_id: crypto.randomUUID(),
        journey_id: row.journey_id,
        anonymous_id: row.anonymous_id,
        financial_input_identity_version: row.identity_version,
        financial_input_identity: row.identity,
        classifier_version: row.classifier_version,
        contract: row.contract,
        threshold_version: row.threshold_version,
        survey_version: row.survey_version,
        classification_status: row.classification_status,
        strategy: row.strategy,
        result: clone(row.result),
        origin_diagnosis_id: row.diagnosis_id,
        computed_at: new Date().toISOString(),
      };
      evaluations.push(ev);
      created = true;
    } else if (ev.contract !== row.contract || ev.threshold_version !== row.threshold_version ||
      ev.classification_status !== row.classification_status || ev.strategy !== row.strategy ||
      !sameSemanticResult(ev.result, row.result)) {
      throw fail("STRATEGY_EVALUATION_MISMATCH");
    }
    var link = links.find(function (l) { return l.diagnosis_id === row.diagnosis_id; });
    if (link && link.evaluation_id !== ev.evaluation_id) throw fail("DIAGNOSIS_ALREADY_LINKED");
    if (!link) {
      links.push({ diagnosis_id: row.diagnosis_id, evaluation_id: ev.evaluation_id,
        income_provenance: clone(incomeProvenance(row.result)) });
    }
    return reply(ev, row.diagnosis_id, created, !link);
  }

  return {
    record: record,
    evaluations: evaluations,
    links: links,
  };
}

module.exports = { createMemoryStrategyEvaluationStore: createMemoryStrategyEvaluationStore };
