/**
 * server/http/routes/userChoices.js — V2 user choices and debt management opt-in.
 * Owner = X-MiPlan-Anonymous-Id; the RPCs verify it against the stored evaluation.
 */
"use strict";

var express = require("express");
var resolveAnonymousId = require("../../modules/identity/anonymousId").resolveAnonymousId;

function anonymousIdOrThrow(req) {
  var anon = resolveAnonymousId(req);
  if (!anon.ok) {
    var err = new Error(anon.message);
    err.status = 400;
    err.code = anon.code;
    throw err;
  }
  return anon.anonymousId;
}

/**
 * @param {{ userChoiceService: ReturnType<typeof import('../../modules/userChoice/service').createUserChoiceService> }} deps
 */
function createUserChoicesRouter(deps) {
  var router = express.Router();
  var service = deps.userChoiceService;

  function handle(work) {
    return function (req, res, next) {
      Promise.resolve()
        .then(function () {
          return work(req, anonymousIdOrThrow(req));
        })
        .then(function (payload) {
          res.status(200).json(payload);
        })
        .catch(next);
    };
  }

  router.get("/v1/evaluations/:evaluationId/user-choices", handle(function (req, anonymousId) {
    return service.getState({ anonymousId: anonymousId, evaluationId: req.params.evaluationId });
  }));

  router.get("/v1/diagnoses/:diagnosisId/user-choices", handle(function (req, anonymousId) {
    return service.getState({ anonymousId: anonymousId, diagnosisId: req.params.diagnosisId });
  }));

  router.post("/v1/evaluations/:evaluationId/user-choices", handle(function (req, anonymousId) {
    return service.recordChoice({ anonymousId: anonymousId, evaluationId: req.params.evaluationId, body: req.body });
  }));

  router.post("/v1/evaluations/:evaluationId/debt-management-opt-in", handle(function (req, anonymousId) {
    return service.recordOptIn({ anonymousId: anonymousId, evaluationId: req.params.evaluationId, body: req.body });
  }));

  return router;
}

module.exports = { createUserChoicesRouter: createUserChoicesRouter };
