/**
 * dev/plus-proxy-qa.js — Plus Claude proxy QA (static + handler smoke)
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var plusSrc = fs.readFileSync(path.join(root, "js/plusReport.js"), "utf8");
  var cfgSrc = fs.readFileSync(path.join(root, "js/config.js"), "utf8");
  var apiSrc = fs.readFileSync(path.join(root, "api/plus/generate.js"), "utf8");

  ok("A proxy path avoids direct anthropic when enabled",
    plusSrc.indexOf('fetch("/api/plus/generate"') >= 0
    && plusSrc.indexOf("if (proxyEnabled)") >= 0);

  ok("B calls /api/plus/generate", plusSrc.indexOf('fetch("/api/plus/generate"') >= 0);

  ok("config proxy enabled", cfgSrc.indexOf("CZ_PLUS_PROXY_ENABLED = true") >= 0);
  ok("config browser key off", cfgSrc.indexOf("CZ_CLAUDE_ALLOW_BROWSER_KEY = false") >= 0);
  ok("config empty browser key", /CZ_CLAUDE_API_KEY = ""/.test(cfgSrc));

  ok("api POST only", apiSrc.indexOf('req.method !== "POST"') >= 0 && apiSrc.indexOf("405") >= 0);
  ok("api missing key check", apiSrc.indexOf("missing_api_key") >= 0);
  ok("api uses env key", apiSrc.indexOf("process.env.CZ_CLAUDE_API_KEY") >= 0);
  ok("api no key logging", apiSrc.indexOf("console.log") < 0 && apiSrc.indexOf("console.error") < 0);

  // Deployable files only (git-tracked + untracked-not-ignored); gitignored local env files never deploy.
  var skHits = require("child_process").execSync("git ls-files -co --exclude-standard", { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(function(f) {
      return f && f.indexOf("node_modules/") !== 0 && f.indexOf("dev/") !== 0 && /\.(js|json|html|env|md)$/.test(f);
    })
    .filter(function(f) {
      try { return fs.readFileSync(path.join(root, f), "utf8").indexOf("sk-ant") >= 0; } catch (e) { return false; }
    });
  ok("E sk-ant only example", skHits.length === 1 && skHits[0] === "js/config.example.js");

  (async function() {
    var { pathToFileURL } = require("url");
    var handlerMod = await import(pathToFileURL(path.join(root, "api/plus/generate.js")).href);
    var handler = handlerMod.default;
    var calls = [];

    function mockRes() {
      return {
        _status: 200,
        _headers: {},
        setHeader: function(k, v) { this._headers[k] = v; },
        status: function(code) { this._status = code; return this; },
        json: function(body) { calls.push({ status: this._status, body: body }); return this; },
      };
    }

    var r405 = mockRes();
    await handler({ method: "GET" }, r405);
    ok("C GET returns 405", calls[0] && calls[0].status === 405);

    var oldKey = process.env.CZ_CLAUDE_API_KEY;
    delete process.env.CZ_CLAUDE_API_KEY;
    process.env.CZ_PLUS_GENERATE_LOCAL = "1";
    var r500 = mockRes();
    await handler({ method: "POST", headers: {}, body: { report_type: "plus", context: {} } }, r500);
    ok("C missing key returns missing_api_key",
      calls[1] && calls[1].status === 500 && calls[1].body.error === "missing_api_key");
    if (oldKey) process.env.CZ_CLAUDE_API_KEY = oldKey;

    console.log("");
    console.log("PASSED: " + passed + "/" + (passed + failed));
    console.log("(D) With Vercel CZ_CLAUDE_API_KEY set — verify Plus report on deployed preview)");
    process.exit(failed > 0 ? 1 : 0);
  })().catch(function(e) {
    console.error(e);
    process.exit(1);
  });
})();
