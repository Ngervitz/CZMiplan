// =============================================================================
// consentComms.js — Optional communications opt-in
// Shown once at the top of step 2 (gastos), after step 1 (deudas) is completed.
// This is the ONLY user-facing interaction in Mi Plan related to consent.
// It is never blocking — user can skip it and continue normally.
// Depends on: config.js, consent.js
// =============================================================================

var COMMS_SHOWN_KEY = "cz_comms_shown_v1";

function commsAlreadyShown() {
  try {
    return localStorage.getItem(COMMS_SHOWN_KEY) === "true";
  } catch (e) {
    return true;
  }
}

function markCommsShown() {
  try {
    localStorage.setItem(COMMS_SHOWN_KEY, "true");
  } catch (e) {}
}

function saveCommsConsent(operational, marketing) {
  try {
    var stored = loadStoredConsent();
    if (!stored) return;
    stored.operational_optin = operational;
    stored.marketing_optin   = marketing;
    stored.comms_timestamp   = new Date().toISOString();
    stored.comms_source      = "mi_plan_step_2";
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// renderCommsOptIn(containerId)
// Injects the optional comms opt-in block at the TOP of the given container.
// Only renders if comms have not been shown before.
// Never blocks navigation — always shows "Ahora no" option.
// ---------------------------------------------------------------------------
function renderCommsOptIn(containerId) {
  if (commsAlreadyShown()) return;

  var container = document.getElementById(containerId);
  if (!container) return;

  var block = document.createElement("div");
  block.id = "cz-comms-optin";
  block.style.cssText = [
    "padding:20px",
    "background:rgba(64,215,255,.06)",
    "border:1px solid rgba(64,215,255,.15)",
    "border-radius:16px",
    "margin-bottom:24px",
  ].join(";");

  block.innerHTML = [
    '<div style="font-size:15px;font-weight:700;color:#c8d0e7;margin-bottom:6px;">',
      '¿Querés recibir actualizaciones de Mi Plan?',
    '</div>',
    '<p style="font-size:13px;color:#8390b5;line-height:1.5;margin:0 0 16px;">',
      'Podemos enviarte actualizaciones operativas de Mi Plan por email o WhatsApp. ',
      'Es opcional y podés darte de baja cuando quieras.',
    '</p>',

    '<label style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;cursor:pointer;">',
      '<input type="checkbox" id="cc-op" style="width:18px;height:18px;flex-shrink:0;margin-top:2px;accent-color:#40d7ff;cursor:pointer;">',
      '<span style="font-size:13px;color:#c8d0e7;line-height:1.5;">',
        'Avisos operativos: recordatorios de Mi Plan, informe listo y actualización de datos.',
      '</span>',
    '</label>',

    '<label style="display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;cursor:pointer;">',
      '<input type="checkbox" id="cc-mkt" style="width:18px;height:18px;flex-shrink:0;margin-top:2px;accent-color:#40d7ff;cursor:pointer;">',
      '<span style="font-size:13px;color:#c8d0e7;line-height:1.5;">',
        'Comunicaciones comerciales de Credizona.',
      '</span>',
    '</label>',

    '<div style="display:flex;gap:10px;">',
      '<button id="cc-save" style="',
        'flex:1;height:48px;border-radius:12px;border:none;',
        'background:#40d7ff;color:#0a0f2e;',
        'font-size:15px;font-weight:800;cursor:pointer;',
      '">Guardar preferencias</button>',
      '<button id="cc-skip" style="',
        'height:48px;padding:0 20px;border-radius:12px;',
        'border:1px solid rgba(255,255,255,.1);background:transparent;',
        'color:#8390b5;font-size:14px;cursor:pointer;',
      '">Ahora no</button>',
    '</div>',
  ].join("");

  container.insertBefore(block, container.firstChild);

  document.getElementById("cc-save").addEventListener("click", function() {
    var op  = document.getElementById("cc-op");
    var mkt = document.getElementById("cc-mkt");
    saveCommsConsent(op ? op.checked : false, mkt ? mkt.checked : false);
    markCommsShown();
    block.remove();
  });

  document.getElementById("cc-skip").addEventListener("click", function() {
    saveCommsConsent(false, false);
    markCommsShown();
    block.remove();
  });
}
