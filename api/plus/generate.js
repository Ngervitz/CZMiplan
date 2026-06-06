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

function isLocalOrDev() {
  if (!process.env.VERCEL) return true;
  if (process.env.VERCEL_ENV === "development") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
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
      content: "Generá el informe Mi Plan Plus completo según el schema JSON. "
        + "Datos de entrada:\n"
        + JSON.stringify(context, null, 2),
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
