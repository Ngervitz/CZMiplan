/**
 * CZ-JANUS-INCOME-BOUNDARY-01 — read-only probe of the Credizona salario input.
 *
 * Replicates the markup of Credizona `solicitudes.init.html` (#salario:
 * type="number" min="10000" step="1", validationEngine "validate[required]") and its
 * submit path (`callSolicitar` → `AjaxCallWithFormData` → `new FormData(form)`, no
 * native form submit, so HTML constraint validation is not enforced). Types real text
 * in Chromium and reports what `$_POST['salario']` would receive.
 * Does not contact Credizona, JANUS or any network host.
 *
 * Usage: node dev/backend-arch/classifier-shadow/cz-salario-input-probe.js [--json]
 */
"use strict";

var path = require("path");
var fs = require("fs");
var chromium = require("playwright").chromium;

// Credizona's own vendored jQuery + validationEngine (read from the local clone, if present).
var CZ_PUBLIC = process.env.CZ_PUBLIC_HTML ||
  path.join("C:", "Users", "Admin", "Desktop", "CZ CLON CPANEL 2026-08-27", "CZ CLON CPANEL 2026-08-27", "public_html");
var CZ_SCRIPTS = [
  "includes/js/3Party/jQuery-3.4.1/jquery.min.js",
  "includes/js/3Party/validationEngine-2.6.2/js/languages/jquery.validationEngine-es.js",
  "includes/js/3Party/validationEngine-2.6.2/js/jquery.validationEngine.js",
].map(function (p) { return path.join(CZ_PUBLIC, p); });
var HAS_CZ_SCRIPTS = CZ_SCRIPTS.every(function (p) { return fs.existsSync(p); });

var HTML =
  '<form id="FormSolicitud"><input class="form-control" data-validation-engine="validate[required]"' +
  ' id="salario" min="10000" name="salario" step="1" type="number"/></form>';

var INPUTS = ["65000", "65.000", "65.000,50", "65,000", "65000.50", "1.234.567", "$ 65.000"];
var LOCALES = ["es-UY", "es-ES", "en-US"];

async function probe(browser, locale, text) {
  var context = await browser.newContext({ locale: locale });
  var page = await context.newPage();
  await page.setContent(HTML);
  if (HAS_CZ_SCRIPTS) {
    for (var s = 0; s < CZ_SCRIPTS.length; s++) await page.addScriptTag({ path: CZ_SCRIPTS[s] });
  }
  await page.click("#salario");
  await page.keyboard.type(text);
  var out = await page.evaluate(function () {
    var el = document.getElementById("salario");
    var fd = new FormData(document.getElementById("FormSolicitud"));
    var ve = null;
    if (window.jQuery && jQuery.fn.validationEngine) {
      // Same options as Chukupax.setValidationEngine; callSolicitar aborts only when this is false.
      var $f = jQuery("#FormSolicitud").validationEngine({ scroll: false, promptPosition: "inline" });
      ve = $f.validationEngine("validate");
    }
    return {
      validation_engine_pass: ve,
      value: el.value,
      formdata: fd.get("salario"),
      valid: el.validity.valid,
      rangeUnderflow: el.validity.rangeUnderflow,
      badInput: el.validity.badInput,
      number_value: el.valueAsNumber,
    };
  });
  await context.close();
  out.locale = locale;
  out.typed = text;
  return out;
}

async function main() {
  var asJson = process.argv.indexOf("--json") !== -1;
  var browser = await chromium.launch();
  var rows = [];
  try {
    for (var l = 0; l < LOCALES.length; l++) {
      for (var i = 0; i < INPUTS.length; i++) {
        rows.push(await probe(browser, LOCALES[l], INPUTS[i]));
      }
    }
  } finally {
    await browser.close();
  }
  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  rows.forEach(function (r) {
    console.log(
      r.locale + " typed=" + JSON.stringify(r.typed) + " -> value=" + JSON.stringify(r.value) +
      " formdata=" + JSON.stringify(r.formdata) + " valueAsNumber=" + r.number_value +
      " valid=" + r.valid + " rangeUnderflow=" + r.rangeUnderflow + " badInput=" + r.badInput +
      " validationEngine=" + r.validation_engine_pass
    );
  });
  if (!HAS_CZ_SCRIPTS) console.log("NOTE: Credizona vendored scripts not found; validationEngine not evaluated.");
}

main().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
