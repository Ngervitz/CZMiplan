/**
 * server/index.js — Railway-ready entrypoint.
 */
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

var loadConfig = require("./config").loadConfig;
var createApp = require("./app").createApp;

var config = loadConfig(process.env);
var app = createApp(config);

var server = app.listen(config.port, config.host, function () {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "server_listen",
      app: config.appName,
      version: config.appVersion,
      env: config.nodeEnv,
      host: config.host,
      port: config.port,
      persistence: config.persistenceConfigured ? "configured" : "missing",
    })
  );
});

function shutdown(signal) {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "server_shutdown",
      signal: signal,
    })
  );
  server.close(function (err) {
    if (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "server_close_error",
          error: String(err.message || err),
        })
      );
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(function () {
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", function () {
  shutdown("SIGTERM");
});
process.on("SIGINT", function () {
  shutdown("SIGINT");
});

module.exports = { app: app, server: server, config: config };
