/**
 * server/bin/financial-identity-golden-test.js — financial_input_identity_v1 freeze (golden vectors).
 *
 * input -> canonical string -> sha256, all hardcoded. If any vector or source pin fails, v1 changed:
 * revert, and ship the new rules as financial_input_identity_v2 instead.
 *
 * node server/bin/financial-identity-golden-test.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var identity = require("../modules/diagnosis/financialIdentity");

var ROOT = path.join(__dirname, "..", "..");

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail !== undefined ? "  -- " + JSON.stringify(detail) : ""));
}

var D1 = { tipo: "prestamo", acreedor: "Banco QA", monto: 120000, pago: 6500, situacion_ui: "pagando_normal" };
var D2 = { tipo: "tarjeta", acreedor_raw: "OCA", monto: "35000.00", pago: "2100", situacion_ui: "atrasado_pagando", ultimo_pago_declarado: 1500 };

var GOLDEN = [
  ["G01 minimal",
    { ingreso: 50000, gastos: { vivienda: 20000 }, deudas: [D1] },
    '["financial_input_identity_v1","50000",false,[["vivienda","20000"]],[],false,[["prestamo","banco qa","120000","6500","pagando_normal",null,null,null]]]',
    "2224cbdf0f67a2e5824abd9773e77b14d7c86539bebd418603ee319db62ff124"],
  ["G02 empty object",
    {},
    '["financial_input_identity_v1",null,false,[],[],false,[]]',
    "c7c0e8275684a74e5d16fe4b459fb81c5691b617b7feb741806c8242f6c30397"],
  ["G03 amount forms (padding, exponents, invalid, negative, blank, zero)",
    { ingreso: "0065000.50", gastos: { a: "1e3", b: 1e21, c: 1.5e-7, d: -5, e: "", f: 0, g: "  250.0 " }, deudas: [] },
    '["financial_input_identity_v1","65000.5",false,[["a","!invalid"],["b","1000000000000000000000"],["c","0.00000015"],["d","!invalid"],["g","250"]],[],false,[]]',
    "e85cad4953989dcf87b332fe3bcebc0890d59febae625914d3328a21a44f40c7"],
  ["G04 income prefill unconfirmed",
    { ingreso: 42000, entry_context: { field_provenance: { ingreso: { source: "url_prefill", user_modified: false } } }, deudas: [] },
    '["financial_input_identity_v1","42000",true,[],[],false,[]]',
    "72e41f61aeb948bc23db0fc9fcb5aedfe3bc5e86da1d5e067fff73cf187a0983"],
  ["G05 handoff-declared income is not a prefill",
    { ingreso: 42000, entry_context: { field_provenance: { ingreso: { source: "handoff", detail: "handoff", user_modified: false } } }, deudas: [] },
    '["financial_input_identity_v1","42000",false,[],[],false,[]]',
    "d70d9c53b17947c760a6123a8bab612c2b484b548e452501d89ff6bfce91d4f4"],
  ["G06 debt states (paid, invalid entry, atrasado_pagando, legacy estado, pagando_normal)",
    { declared_ingreso: 30000, deudas: [
      { tipo: "prestamo", acreedor: "A", monto: 1000, pago: 100, cancelada: true },
      "not-an-object",
      D2,
      { tipo: " ", acreedor: "  ", monto: 5000, estado: "al_dia" },
      { tipo: "prestamo", acreedor: "B", monto: 9000, pago: 900, situacion_ui: "pagando_normal", pago_clarificacion: "cuota_fija", ultimo_pago_declarado: 1 },
    ] },
    '["financial_input_identity_v1","30000",false,[],[],false,["!paid_or_cancelled","!invalid_entry",["tarjeta","oca","35000","2100","atrasado_pagando",null,"1500",null],[null,null,"5000",null,null,"al_dia",null,null],["prestamo","b","9000","900","pagando_normal",null,null,"cuota_fija"]]]',
    "d0bd427d96f7bfeaaee46fcb49ed16e92dabd75f89930ec7f531a73b76e202c8"],
  ["G07 no_debts_declared + custom expenses (excluded, monto alias, zero, invalid)",
    { ingreso: 25000, no_debts_declared: true, gastos: { luz: 0, agua: "", vivienda: 9000 },
      custom_expenses: [{ amount: 300, included: false }, { monto: "450" }, { amount: 0 }, { amount: "x" }, { _included: false, amount: 1 }], deudas: [] },
    '["financial_input_identity_v1","25000",false,[["vivienda","9000"]],["450","!invalid"],true,[]]',
    "11a3f6dd5a37811ac4647eb2f96960c204401fbc18c736a268150373ad37886e"],
  ["G08 creditor text NFKC + whitespace + lowercase (fullwidth, NBSP, ideographic space, ligature)",
    { ingreso: 60000, deudas: [{ tipo: "prestamo", acreedor: "  \uFF22\uFF21\uFF2E\uFF23\uFF2F\u00A0 Rep\u00FAblica\u3000\uFB01n  ", monto: 1, pago: 1, situacion_ui: "pagando_normal" }] },
    '["financial_input_identity_v1","60000",false,[],[],false,[["prestamo","banco rep\u00fablica fin","1","1","pagando_normal",null,null,null]]]',
    "f77806bd4492a4be87342be6dacc1813d75b71e3f6ec22b03d151db73219cd64"],
  ["G09 two debts",
    { ingreso: 50000, gastos: { vivienda: 20000 }, deudas: [D1, D2] },
    '["financial_input_identity_v1","50000",false,[["vivienda","20000"]],[],false,[["prestamo","banco qa","120000","6500","pagando_normal",null,null,null],["tarjeta","oca","35000","2100","atrasado_pagando",null,"1500",null]]]',
    "46bc1d762bbdbffe917eba5365f02627229e479b9b97d6f20618032af3055e70"],
  ["G10 same two debts reversed (debt order is identity)",
    { ingreso: 50000, gastos: { vivienda: 20000 }, deudas: [D2, D1] },
    '["financial_input_identity_v1","50000",false,[["vivienda","20000"]],[],false,[["tarjeta","oca","35000","2100","atrasado_pagando",null,"1500",null],["prestamo","banco qa","120000","6500","pagando_normal",null,null,null]]]',
    "2d61b42278bb46942f0b252e7a71b6ea4225d2636dcc99861078da85c2b8e5e0"],
];

var SOURCE_PINS = [
  ["js/financialInputIdentity.js", "deea53f15bf60890b811c4046940d93f334da20779ef615c74a6ef06942e01c4"],
  ["server/modules/diagnosis/financialIdentity.js", "5e3bba0f1ca412ef548d58a72a464df13135df9b9da0455cb933cc5f01fa99b3"],
];

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

module.exports = { GOLDEN: GOLDEN };
if (require.main === module) main();

function main() {
check("version constant is financial_input_identity_v1", identity.FINANCIAL_INPUT_IDENTITY_VERSION === "financial_input_identity_v1");

GOLDEN.forEach(function (g) {
  var input = JSON.parse(JSON.stringify(g[1]));
  var canonical = identity.canonicalizeFinancialInput(input);
  var derived = identity.deriveFinancialInputIdentity(input);
  check("[11] " + g[0] + ": canonical string", canonical === g[2], { got: canonical });
  check("[11] " + g[0] + ": hash == sha256(utf8(golden canonical)) == derived identity",
    sha256(g[2]) === g[3] && derived && derived.version === "financial_input_identity_v1" && derived.value === g[3], { got: derived });
});

var hashes = GOLDEN.map(function (g) { return g[3]; });
check("[11] golden hashes are pairwise distinct", new Set(hashes).size === hashes.length);

var nonObjects = [null, undefined, 5, "x", []];
check("non-object input has no identity (null), never a hash of garbage",
  nonObjects.every(function (v) { return identity.canonicalizeFinancialInput(v) === null && identity.deriveFinancialInputIdentity(v) === null; }));

var repeat = GOLDEN.every(function (g) {
  var a = identity.deriveFinancialInputIdentity(g[1]).value;
  for (var i = 0; i < 25; i++) if (identity.deriveFinancialInputIdentity(JSON.parse(JSON.stringify(g[1]))).value !== a) return false;
  return true;
});
check("[11] stable across repeated derivations and JSON round-trips", repeat);

SOURCE_PINS.forEach(function (p) {
  var src = fs.readFileSync(path.join(ROOT, p[0]), "utf8").replace(/\r\n/g, "\n");
  check("freeze pin: " + p[0] + " unchanged (edits ship as financial_input_identity_v2)", sha256(src) === p[1], { got: sha256(src) });
});

var failed = results.filter(function (r) { return !r.ok; }).length;
console.log("FINANCIAL_IDENTITY_GOLDEN: " + (results.length - failed) + "/" + results.length + (failed ? " FAIL" : " PASS"));
if (failed) process.exitCode = 1;
}
