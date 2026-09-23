/**
 * DEV matcher tests for evaluate.findTerms word-boundary (no substring fallback).
 * Usage: node dev/assistant-01/evaluate-matcher-qa.js
 */
"use strict";

var evaluate = require("./evaluate");
var findTerms = evaluate.findTerms;

var passed = 0;
var failed = 0;

function ok(label, cond) {
  console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
  if (cond) passed++;
  else failed++;
}

function hits(text, term) {
  return findTerms(text, [term]).indexOf(term) !== -1;
}

ok('"trabajar" → NO match "baja"', !hits("trabajar", "baja"));
ok('"rebajar" → NO match "baja"', !hits("rebajar", "baja"));
ok('"debajo" → NO match "baja"', !hits("debajo", "baja"));
ok('"baja" → SÍ match "baja"', hits("baja", "baja"));
ok('"diagnóstico" → NO match "ia"', !hits("diagnóstico", "ia"));
ok('"inmediato" → NO match "ia"', !hits("inmediato", "ia"));
ok('"hacia" → NO match "ia"', !hits("hacia", "ia"));
ok('"prioritaria" → NO match "ia"', !hits("prioritaria", "ia"));
ok('"IA" → SÍ match "ia"', hits("IA", "ia"));

console.log("matcher pass=" + passed + " fail=" + failed);
if (failed) process.exit(1);
