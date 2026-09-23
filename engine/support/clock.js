/**
 * engine/support/clock.js — D5: freeze Date.now for one engine run.
 */
"use strict";

function freezeNow(ctx, nowMs) {
  var RealDate = ctx.Date;
  var frozen = Number(nowMs);
  if (!isFinite(frozen)) {
    throw new Error("ENGINE_CLOCK_INVALID_NOW_MS");
  }
  ctx.Date = function DateProxy() {
    if (arguments.length === 0) return new RealDate(frozen);
    var args = Array.prototype.slice.call(arguments);
    if (args.length === 1) return new RealDate(args[0]);
    if (args.length === 2) return new RealDate(args[0], args[1]);
    if (args.length === 3) return new RealDate(args[0], args[1], args[2]);
    return new RealDate(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
  };
  ctx.Date.now = function() { return frozen; };
  ctx.Date.parse = RealDate.parse;
  ctx.Date.UTC = RealDate.UTC;
  ctx.Date.prototype = RealDate.prototype;
  return frozen;
}

module.exports = { freezeNow: freezeNow };
