// =============================================================================
// config.example.js — Plantilla de referencia (no se carga en index.html)
//
// Producción usa js/config.js (trackeado, sin secretos).
// Desarrollo local: copiá este archivo a js/config.local.js (gitignored) y
// sobrescribí solo las variables que necesites, por ejemplo:
//   CZ_CLAUDE_API_KEY = "sk-ant-...";
//   CZ_CLAUDE_ALLOW_BROWSER_KEY = true;
//   CZ_PLUS_PROXY_ENABLED = false;
//   CZ_CLAUDE_MODEL = "claude-sonnet-4-5";
// Producción Vercel: CZ_CLAUDE_API_KEY en Environment Variables (no en el repo).
// (Opcional) CZ_PLUS_USE_MOCK = true; — solo afecta getPlusReportInput() sin useTestInput
// Luego cargá config.local.js después de config.js en un entorno local.
// =============================================================================

// Ver js/config.js para la lista completa de constantes deploy-safe.

// Beta friction only — NOT real authentication. Set matching value in Vercel
// env CZ_PLUS_PROXY_SECRET; never commit the real secret.
var CZ_PLUS_PROXY_CLIENT_SECRET = "";
