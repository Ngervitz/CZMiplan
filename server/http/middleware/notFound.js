/**
 * server/http/middleware/notFound.js
 */
"use strict";

function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "Route not found",
    path: req.path,
  });
}

module.exports = { notFoundHandler: notFoundHandler };
