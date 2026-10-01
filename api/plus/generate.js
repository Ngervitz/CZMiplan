/*
TODO:
Replace shared-secret beta gate with real backend authentication,
session validation, per-user authorization and rate limiting
before public launch.
*/
/**
 * Vercel serverless proxy — hardened Mi Plan Plus Claude generation.
 * Browser sends only { report_type, context }. Anthropic payload built server-side.
 */
import { CZ_PLUS_SYSTEM_PROMPT } from "./systemPrompt.js";

var MAX_PAYLOAD_BYTES = 50 * 1024;

function isOutsideVercel() {
  return !process.env.VERCEL && process.env.VERCEL_ENV == null;
}

function isLocalOrDev() {
  return isOutsideVercel() || process.env.VERCEL_ENV === "development";
}

// No authenticated, entitled consumer exists yet. Only explicitly authorised environments may
// generate: Vercel preview, Vercel development (vercel dev), or a run outside Vercel that opts in
// with CZ_PLUS_GENERATE_LOCAL=1. Everything else (production, missing or unrecognised VERCEL_ENV,
// a deployment whose system variables are not exposed) is refused before the body is read or the
// provider is called.
function isGenerationAllowedEnv() {
  var vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "preview" || vercelEnv === "development") return true;
  if (isOutsideVercel()) return process.env.CZ_PLUS_GENERATE_LOCAL === "1";
  return false;
}

var DIRECT_IDENTIFIER_KEYS = {
  nombre: true, nombre_completo: true, apellido: true,
  cedula: true, ci: true, documento: true,
  email: true, telefono: true, celular: true, phone: true,
  anonymous_id: true, session_id: true, crm_contact_id: true, czuid: true,
  journey_id: true, diagnosis_id: true,
};

function stripDirectIdentifiers(value) {
  if (Array.isArray(value)) return value.map(stripDirectIdentifiers);
  if (!value || typeof value !== "object") return value;
  var out = {};
  Object.keys(value).forEach(function(k) {
    if (DIRECT_IDENTIFIER_KEYS[k.toLowerCase()]) return;
    out[k] = stripDirectIdentifiers(value[k]);
  });
  return out;
}

function getClientProxySecret(req) {
  var h = req.headers["x-cz-plus-secret"];
  if (h == null) return "";
  return Array.isArray(h) ? String(h[0] || "") : String(h);
}

function enforceProxySecret(req, res) {
  var expected = process.env.CZ_PLUS_PROXY_SECRET;
  var configured = expected != null && String(expected).trim() !== "";

  if (!configured) {
    if (!isLocalOrDev()) {
      return res.status(500).json({ ok: false, error: "missing_proxy_secret" });
    }
    return null;
  }

  var provided = getClientProxySecret(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  return null;
}
function payloadTooLarge(res) {
  return res.status(413).json({ ok: false, error: "payload_too_large" });
}

function getSerializedBodySize(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch (e) {
    return Infinity;
  }
}

function parseClientRequest(rawBody) {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { error: "invalid_body" };
  }

  var reportType = rawBody.report_type;
  if (reportType !== "plus") {
    return { error: "invalid_report_type" };
  }

  var context = rawBody.context;
  if (context == null) {
    context = {};
  }
  if (typeof context !== "object" || Array.isArray(context)) {
    return { error: "invalid_context" };
  }

  return { reportType: reportType, context: context };
}

function buildAnthropicPayload(context) {
  return {
    model: process.env.CZ_CLAUDE_MODEL || "claude-sonnet-4-5",
    max_tokens: 4000,
    system: CZ_PLUS_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: "Generá SOLO las secciones 1 a 6 del informe Mi Plan Plus según el schema IA V2. "
        + "NO incluyas seccion_7, metadata, reconciliation_summary, alignment_label "
        + "ni porcentajes de coincidencia del perfil.\n"
        + "Usá reconciliation_engine del input (solo lectura) para alinear tono y hechos.\n"
        + "Datos de entrada:\n"
        + JSON.stringify(stripDirectIdentifiers(context), null, 2),
    }],
  };
}

function extractAnthropicText(data) {
  var blocks = data && data.content;
  if (!blocks || !blocks.length) return "";
  var text = "";
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].type === "text" && blocks[i].text) {
      text += blocks[i].text;
    }
  }
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isGenerationAllowedEnv()) {
    return res.status(403).json({ ok: false, error: "plus_generate_disabled" });
  }

  var secretBlock = enforceProxySecret(req, res);
  if (secretBlock) return secretBlock;

  var contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return payloadTooLarge(res);
  }

  var bodySize = getSerializedBodySize(req.body);
  if (bodySize > MAX_PAYLOAD_BYTES) {
    return payloadTooLarge(res);
  }

  var parsed = parseClientRequest(req.body);
  if (parsed.error) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }

  var apiKey = process.env.CZ_CLAUDE_API_KEY;
  if (!apiKey || String(apiKey).trim() === "") {
    return res.status(500).json({ ok: false, error: "missing_api_key" });
  }

  try {
    var anthropicPayload = buildAnthropicPayload(parsed.context);

    var upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicPayload),
    });

    var data = await upstream.json().catch(function() { return {}; });

    if (!upstream.ok) {
      var detail = (data && data.error && data.error.type)
        ? String(data.error.type)
        : "status_" + upstream.status;
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
        ok: false,
        error: "provider_error",
        detail: detail,
      });
    }

    var text = extractAnthropicText(data);
    if (!text) {
      return res.status(502).json({
        ok: false,
        error: "provider_error",
        detail: "empty_response",
      });
    }

    return res.status(200).json({
      ok: true,
      text: text,
      usage: data.usage || {},
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "proxy_error",
      detail: "internal",
    });
  }
}
