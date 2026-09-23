/**
 * Mi Plan SERVER ENGINE V1 (ENGINE-EXTRACTION-01)
 *
 * Public API: runEngine(input, opts?) → { engine_version, now_ms, engine_result }
 *
 * Rules live in js/* (loaded via adapters/product-vm). This package does not
 * fork thresholds. Browser production bundle is unchanged.
 */
"use strict";

var pipeline = require("./core/pipeline");

module.exports = {
  ENGINE_VERSION: pipeline.ENGINE_VERSION,
  runEngine: pipeline.runEngine,
};
