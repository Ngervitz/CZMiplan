/**
 * server/http/middleware/errorHandler.js
 */
"use strict";

var CLIENT_CODES = {
  ENGINE_INPUT_REQUIRED: 400,
  ANONYMOUS_ID_REQUIRED: 400,
  ANONYMOUS_ID_INVALID: 400,
  CORS_NOT_ALLOWED: 403,
  SUPABASE_CONFIG_MISSING: 503,
  ENGINE_FAILURE: 500,
  DB_PERSIST_FAILED: 500,
  DB_READ_FAILED: 500,
};

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  var code = err.code || err.message || "INTERNAL_ERROR";
  if (typeof code !== "string") code = "INTERNAL_ERROR";

  var status = err.status || err.statusCode || CLIENT_CODES[code] || 500;
  if (CLIENT_CODES[code]) {
    status = CLIENT_CODES[code];
  }

  if (code === "CORS_NOT_ALLOWED" || err.message === "CORS_NOT_ALLOWED") {
    status = 403;
    code = "CORS_NOT_ALLOWED";
  }

  if (status >= 500) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "request_error",
        path: req.path,
        status: status,
        code: code,
      })
    );
  }

  var message;
  if (status >= 500) {
    message = "Internal server error";
  } else {
    message = String(err.message || code);
  }

  res.status(status).json({
    error: code,
    message: message,
  });
}

module.exports = { errorHandler: errorHandler };
