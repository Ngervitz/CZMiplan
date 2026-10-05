/**
 * MONETARY-CONTRACT-01 — unit test of the shared monetary parser (js/config.js).
 * Loads the real config.js in a VM and checks, for every raw input:
 *   parseHumanAmount (human UI input), normalizeTechnicalAmount (state / APIs),
 *   formatAmountForInput (display) and the human round trip.
 *
 * Usage: node dev/backend-arch/classifier-shadow/monetary-contract-test.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..", "..", "..");
var sandbox = {
  console: console,
  URLSearchParams: URLSearchParams,
  location: { search: "", pathname: "/", hash: "" },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8"), sandbox, { filename: "config.js" });

var parseHumanAmount = sandbox.parseHumanAmount;
var normalizeTechnicalAmount = sandbox.normalizeTechnicalAmount;
var formatAmountForInput = sandbox.formatAmountForInput;

var pass = 0;
var fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log("FAIL " + name + (detail !== undefined ? " :: " + JSON.stringify(detail) : ""));
  }
}

// ---------------------------------------------------------------- human input
var HUMAN = [
  ["65000", "valid", 65000],
  ["65.000", "valid", 65000],
  ["65.000,50", "valid", 65000.5],
  ["65000,50", "valid", 65000.5],
  ["65.000,5", "valid", 65000.5],
  ["1.234.567,89", "valid", 1234567.89],
  ["0", "valid", 0],
  [" 65.000 ", "valid", 65000],
  ["$ 50.000", "valid", 50000],
  ["$50.000", "valid", 50000],
  ["UYU 50.000", "valid", 50000],
  ["uyu 50.000", "valid", 50000],
  ["", "empty", null],
  ["   ", "empty", null],
  [null, "empty", null],
  [undefined, "empty", null],
  ["65000.50", "invalid", null],
  ["65.5", "invalid", null],
  ["12.34", "invalid", null],
  ["1.2345", "invalid", null],
  ["50,000", "invalid", null],
  ["65.000,505", "invalid", null],
  ["65,", "invalid", null],
  [",50", "invalid", null],
  ["65.000,", "invalid", null],
  ["65 000", "invalid", null],
  ["65000abc", "invalid", null],
  ["$ 65000 basura", "invalid", null],
  ["65.000xyz", "invalid", null],
  ["abc", "invalid", null],
  ["$", "invalid", null],
  ["-5", "invalid", null],
  ["$ -5", "invalid", null],
  ["U$S 50.000", "invalid", null],
  ["US$ 50.000", "invalid", null],
  ["USD 50.000", "invalid", null],
  ["$U 50.000", "invalid", null],
  ["50.000 $", "invalid", null],
  ["1e5", "invalid", null],
  ["0x10", "invalid", null],
  ["Infinity", "invalid", null],
  [65000, "invalid", null],
];
HUMAN.forEach(function (c) {
  var r = parseHumanAmount(c[0]);
  check("human " + JSON.stringify(c[0]) + " => " + c[1] + " " + c[2],
    r.status === c[1] && r.value === c[2], r);
});
check("'65.000' is never 65", parseHumanAmount("65.000").value !== 65);
check("'65.000,50' is never 65.0005", parseHumanAmount("65.000,50").value === 65000.5);

// ---------------------------------------------------------------- technical (state / APIs)
var TECH = [
  [65000, 65000],
  [65000.5, 65000.5],
  ["65000", 65000],
  ["65000.50", 65000.5],
  [" 65000 ", 65000],
  ["65.000", 65],
  ["65,000", null],
  ["65.000,50", null],
  ["$ 65000", null],
  ["65000abc", null],
  ["", null],
  [null, null],
  [undefined, null],
  [NaN, null],
  [Infinity, null],
  [true, null],
];
TECH.forEach(function (c) {
  var v = normalizeTechnicalAmount(c[0]);
  check("technical " + String(c[0]) + " => " + c[1], v === c[1], v);
});

// ---------------------------------------------------------------- display + round trip
var FMT = [
  [65000, "65.000"],
  [65000.5, "65.000,50"],
  ["65000.5", "65.000,50"],
  [1234567.89, "1.234.567,89"],
  [0, "0"],
  [999, "999"],
  [1000, "1.000"],
  [0.05, "0,05"],
  ["", ""],
  [null, ""],
  ["abc", ""],
  [-5, ""],
];
FMT.forEach(function (c) {
  var s = formatAmountForInput(c[0]);
  check("format " + String(c[0]) + " => " + JSON.stringify(c[1]), s === c[1], s);
});
[0, 1, 999, 1000, 65000, 65000.5, 65000.05, 1234567.89, 100000000].forEach(function (n) {
  var back = parseHumanAmount(formatAmountForInput(n));
  check("round trip " + n, back.status === "valid" && back.value === n, back);
});

console.log("MONETARY_CONTRACT_TEST: " + pass + "/" + (pass + fail) + (fail ? " FAIL" : " PASS"));
if (fail) process.exitCode = 1;
