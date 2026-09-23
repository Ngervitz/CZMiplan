/**
 * server/http/routes/health.js
 */
"use strict";

var express = require("express");

function createHealthRouter(config) {
  var router = express.Router();

  router.get("/health", function (req, res) {
    res.status(200).json({
      status: "ok",
      app: config.appName,
      version: config.appVersion,
      env: config.nodeEnv,
    });
  });

  return router;
}

module.exports = { createHealthRouter: createHealthRouter };
