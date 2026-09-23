/**
 * engine/bin/check-parity.js — compare SERVER ENGINE vs frozen oracle (18 fixtures).
 * Usage: node engine/bin/check-parity.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var runEngine = require("../index").runEngine;
var compare = require("../../dev/backend-arch/parity/compare-helpers");

var ORACLE_PATH = path.join(__dirname, "..", "..", "dev", "backend-arch", "parity", "oracle-results.json");

function main() {
  var oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, "utf8"));
  var cases = oracle.cases || [];
  var pass = 0;
  var fail = 0;
  var failures = [];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var out = runEngine(c.input, { now_ms: c.input.now_ms });
    var result = compare.compareEngineResults(
      c.oracle.engine_result,
      out.engine_result
    );
    if (result.ok) {
      pass++;
      console.log("PASS", c.id);
    } else {
      fail++;
      console.log("FAIL", c.id, "diffs=", result.diff_count);
      if (result.diffs && result.diffs[0]) {
        console.log("  first:", JSON.stringify(result.diffs[0]));
      }
      failures.push({ id: c.id, diff_count: result.diff_count, first: result.diffs[0] });
    }
  }

  console.log("PARITY_CORPUS:", pass + "/" + cases.length, "PASS");
  if (fail) {
    process.exitCode = 1;
  }
}

main();
