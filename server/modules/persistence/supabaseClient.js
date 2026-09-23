/**
 * server/modules/persistence/supabaseClient.js
 */
"use strict";

var createClient = require("@supabase/supabase-js").createClient;

/**
 * @param {{ supabaseUrl: string, supabaseAnonKey: string }} config
 */
function createSupabaseClient(config) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    var err = new Error("SUPABASE_CONFIG_MISSING");
    err.status = 503;
    err.code = "SUPABASE_CONFIG_MISSING";
    throw err;
  }
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

module.exports = { createSupabaseClient: createSupabaseClient };
