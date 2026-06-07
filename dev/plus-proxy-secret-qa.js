/**
 * dev/plus-proxy-secret-qa.js — shared-secret beta gate QA
 */
(function() {
  "use strict";
  var fs = require("fs");
  var path = require("path");
  var { pathToFileURL } = require("url");
  var root = path.join(__dirname, "..");

  var passed = 0;
  var failed = 0;
  function ok(label, cond) {
    console.log((cond ? "[PASS]" : "[FAIL]") + " " + label);
    if (cond) passed++; else failed++;
  }

  var plusSrc = fs.readFileSync(path.join(root, "js/plusReport.js"), "utf8");
  var exampleSrc = fs.readFileSync(path.join(root, "js/config.example.js"), "utf8");

  ok("G browser contract unchanged",
    plusSrc.indexOf('_buildPlusProxyRequest') >= 0
    && plusSrc.indexOf('report_type: "plus"') >= 0
    && plusSrc.indexOf("context: inputData") >= 0
    && plusSrc.indexOf("model:") < 0 || plusSrc.indexOf("_buildAnthropicPlusPayload") >= 0);

  ok("G frontend header support",
    plusSrc.indexOf("x-cz-plus-secret") >= 0
    && plusSrc.indexOf("CZ_PLUS_PROXY_CLIENT_SECRET") >= 0);

  ok("F config.example empty secret",
    /var CZ_PLUS_PROXY_CLIENT_SECRET = "";/.test(exampleSrc));

  (async function() {
    var handlerMod = await import(pathToFileURL(path.join(root, "api/plus/generate.js")).href);
    var handler = handlerMod.default;
    var calls = [];

    function mockRes() {
      return {
        _status: 200,
        setHeader: function() {},
        status: function(code) { this._status = code; return this; },
        json: function(body) { calls.push({ status: this._status, body: body }); return this; },
      };
    }

    global.fetch = async function() {
      return {
        ok: true,
        status: 200,
        json: async function() {
          return {
            content: [{ type: "text", text: '{"seccion_1_resumen_ejecutivo":{}}' }],
            usage: {},
          };
        },
      };
    };

    var baseBody = { report_type: "plus", context: {} };
    var prodEnv = { VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" };

    function withEnv(env, fn) {
      var saved = {};
      Object.keys(env).forEach(function(k) {
        saved[k] = process.env[k];
        if (env[k] == null) delete process.env[k];
        else process.env[k] = env[k];
      });
      return fn().finally(function() {
        Object.keys(saved).forEach(function(k) {
          if (saved[k] == null) delete process.env[k];
          else process.env[k] = saved[k];
        });
      });
    }

    await withEnv(Object.assign({}, prodEnv, { CZ_PLUS_PROXY_SECRET: null, CZ_CLAUDE_API_KEY: null }), async function() {
      delete process.env.CZ_PLUS_PROXY_SECRET;
      var rA = mockRes();
      await handler({ method: "POST", headers: {}, body: baseBody }, rA);
      ok("A missing secret production", calls[calls.length - 1].status === 500
        && calls[calls.length - 1].body.error === "missing_proxy_secret");
    });

    await withEnv(Object.assign({}, prodEnv, { CZ_PLUS_PROXY_SECRET: "beta-secret", CZ_CLAUDE_API_KEY: "k" }), async function() {
      var rB = mockRes();
      await handler({
        method: "POST",
        headers: { "x-cz-plus-secret": "wrong" },
        body: baseBody,
      }, rB);
      ok("B wrong secret", calls[calls.length - 1].status === 401
        && calls[calls.length - 1].body.error === "unauthorized");

      var rC = mockRes();
      await handler({ method: "POST", headers: {}, body: baseBody }, rC);
      ok("C missing header", calls[calls.length - 1].status === 401
        && calls[calls.length - 1].body.error === "unauthorized");

      var rD = mockRes();
      await handler({
        method: "POST",
        headers: { "x-cz-plus-secret": "beta-secret" },
        body: baseBody,
      }, rD);
      ok("D correct secret", calls[calls.length - 1].status === 200
        && calls[calls.length - 1].body.ok === true);
    });

    await withEnv({ VERCEL: null, VERCEL_ENV: null, NODE_ENV: "development", CZ_PLUS_PROXY_SECRET: null, CZ_CLAUDE_API_KEY: "k" }, async function() {
      delete process.env.VERCEL;
      delete process.env.CZ_PLUS_PROXY_SECRET;
      var rE = mockRes();
      await handler({ method: "POST", headers: {}, body: baseBody }, rE);
      ok("E local without secret allowed", calls[calls.length - 1].status === 200
        && calls[calls.length - 1].body.ok === true);
    });

    var tracked = require("child_process").execSync("git ls-files", { cwd: root, encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean);
    var secretLeak = false;
    tracked.forEach(function(f) {
      if (f.indexOf("node_modules") >= 0) return;
      try {
        var txt = fs.readFileSync(path.join(root, f), "utf8");
        if (/CZ_PLUS_PROXY_CLIENT_SECRET\s*=\s*"[^"]{8,}"/.test(txt)) secretLeak = true;
        if (/CZ_PLUS_PROXY_SECRET\s*=\s*"[^"]{8,}"/.test(txt)) secretLeak = true;
      } catch (e) { /* skip */ }
    });
    ok("F no real secret in tracked files", !secretLeak);

    console.log("");
    console.log("PASSED: " + passed + "/" + (passed + failed));
    process.exit(failed > 0 ? 1 : 0);
  })().catch(function(e) {
    console.error(e);
    process.exit(1);
  });
})();
