// =============================================================================
// events.js — Tracking y nombres de eventos
// Depende de: config.js
// =============================================================================

function track(evento, datos) {
  datos = datos || {};
  console.log("[RESET]", evento, datos);
  // TODO IT: conectar a analytics/CRM real
}
