/**
 * server/testing/networkTrap.js — preload (node -r) that refuses every non-loopback socket.
 *
 * Used by live-write-guard-test to prove that blocked harnesses never reach the network.
 * Each refused attempt is appended to NETWORK_TRAP_LOG as one JSON line (host/port only).
 * Covers fetch (undici), http(s), tls and raw net: all of them end in Socket#connect.
 */
"use strict";

var fs = require("fs");
var net = require("net");

var LOOPBACK = { "127.0.0.1": true, localhost: true, "::1": true, "::ffff:127.0.0.1": true };
var logFile = process.env.NETWORK_TRAP_LOG || "";

function targetOf(args) {
  var a0 = args[0];
  if (Array.isArray(a0)) a0 = a0[0];
  if (a0 && typeof a0 === "object") {
    if (a0.path) return { host: "unix:" + a0.path, port: null };
    return { host: String(a0.host || "localhost"), port: a0.port != null ? String(a0.port) : null };
  }
  if (typeof a0 === "string" && !/^\d+$/.test(a0)) return { host: "unix:" + a0, port: null };
  return { host: typeof args[1] === "string" ? args[1] : "localhost", port: a0 != null ? String(a0) : null };
}

var originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function () {
  var t = targetOf(arguments);
  if (LOOPBACK[t.host] || t.host.indexOf("unix:") === 0) return originalConnect.apply(this, arguments);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, JSON.stringify({ host: t.host, port: t.port }) + "\n");
    } catch (_e) {
      /* ignore */
    }
  }
  var err = new Error("NETWORK_TRAP: outbound connection refused to " + t.host);
  err.code = "NETWORK_TRAP";
  var self = this;
  process.nextTick(function () {
    self.destroy(err);
  });
  return this;
};
