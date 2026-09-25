/**
 * server/config.js — centralized configuration (no secrets logged).
 */
"use strict";

var DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadConfig(env) {
  env = env || process.env;
  var nodeEnv = env.NODE_ENV || "development";
  var port = parseInt(env.PORT, 10);
  if (!Number.isFinite(port) || port <= 0) {
    port = 3000;
  }

  var corsAllowedOrigins = String(env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);

  if (corsAllowedOrigins.length === 0 && nodeEnv !== "production") {
    corsAllowedOrigins = DEFAULT_DEV_ORIGINS.slice();
  }

  var supabaseUrl = String(env.SUPABASE_URL || "").trim();
  var supabaseAnonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  var backendSecret = String(env.MIPLAN_BACKEND_SECRET || "").trim();
  var defaultTenantId = String(env.DEFAULT_TENANT_ID || "miplan-default").trim();
  var janusHandoffBaseUrl = String(env.JANUS_HANDOFF_BASE_URL || "").trim();
  var miplanHandoffRedeemSecret = String(
    env.MIPLAN_HANDOFF_REDEEM_SECRET || ""
  ).trim();

  return {
    appName: "miplan-backend",
    appVersion: "b2",
    nodeEnv: nodeEnv,
    port: port,
    host: "0.0.0.0",
    corsAllowedOrigins: corsAllowedOrigins,
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey,
    backendSecret: backendSecret,
    defaultTenantId: defaultTenantId,
    persistenceConfigured: !!(supabaseUrl && supabaseAnonKey && backendSecret),
    janusHandoffBaseUrl: janusHandoffBaseUrl,
    miplanHandoffRedeemSecret: miplanHandoffRedeemSecret,
    handoffConfigured: !!(janusHandoffBaseUrl && miplanHandoffRedeemSecret),
  };
}

module.exports = {
  loadConfig: loadConfig,
  DEFAULT_DEV_ORIGINS: DEFAULT_DEV_ORIGINS,
};
