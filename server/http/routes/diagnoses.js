/**
 * server/http/routes/diagnoses.js
 * B2: validate → runEngine → persist append-only → respond with diagnosis_id
 */
"use strict";

var express = require("express");
var resolveAnonymousId = require("../../modules/identity/anonymousId").resolveAnonymousId;

/**
 * @param {{ diagnosisService: { createDiagnosis: Function } }} deps
 */
function createDiagnosesRouter(deps) {
  var router = express.Router();
  var diagnosisService = deps.diagnosisService;

  router.post("/v1/diagnoses", function (req, res, next) {
    Promise.resolve()
      .then(function () {
        var anon = resolveAnonymousId(req);
        if (!anon.ok) {
          var err = new Error(anon.message);
          err.status = 400;
          err.code = anon.code;
          throw err;
        }
        return diagnosisService.createDiagnosis({
          anonymousId: anon.anonymousId,
          body: req.body,
        });
      })
      .then(function (result) {
        res.status(200).json({
          diagnosis_id: result.diagnosis_id,
          engine_version: result.engine_version,
          result: result.result,
        });
      })
      .catch(next);
  });

  return router;
}

module.exports = { createDiagnosesRouter: createDiagnosesRouter };
