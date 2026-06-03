// =============================================================================
// celebrations.js — Sprint 15.celebration (sober milestones, canvas confetti)
// No dependencies. Safe if called before DOM ready (no-op until body exists).
// =============================================================================

(function() {
  var COLORS = ["#40d7ff", "#ffffff", "#a78bfa", "#34d399", "#fbbf24"];
  var PARTICLE_COUNT = 135;
  var CONFETTI_MS = 2800;
  var OVERLAY_MS = 3000;
  var activeCleanup = null;

  function clearActive() {
    if (typeof activeCleanup === "function") {
      activeCleanup();
      activeCleanup = null;
    }
  }

  function runConfetti() {
    var canvas = document.createElement("canvas");
    canvas.className = "cz-celebration-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);

    var particles = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.4,
        w: 4 + Math.random() * 6,
        h: 6 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 2.2 + Math.random() * 3.2,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.12,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 0.85 + Math.random() * 0.15,
      });
    }

    var start = performance.now();
    var rafId = 0;
    var running = true;

    function frame(now) {
      if (!running) return;
      var elapsed = now - start;
      var fade = elapsed > CONFETTI_MS - 500
        ? Math.max(0, 1 - (elapsed - (CONFETTI_MS - 500)) / 500)
        : 1;

      ctx.clearRect(0, 0, w, h);
      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > h + 30) {
          p.y = -10;
          p.x = Math.random() * w;
        }
        ctx.save();
        ctx.globalAlpha = p.alpha * fade;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (elapsed < CONFETTI_MS) {
        rafId = requestAnimationFrame(frame);
      } else {
        running = false;
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    rafId = requestAnimationFrame(frame);

    return function() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }

  function triggerCelebration(opts) {
    opts = opts || {};
    if (!document.body) return;

    clearActive();

    var emoji = opts.emoji || "✨";
    var title = opts.title || "";
    var subtitle = opts.subtitle || "";

    var root = document.createElement("div");
    root.className = "cz-celebration-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-live", "polite");

    var backdrop = document.createElement("div");
    backdrop.className = "cz-celebration-backdrop";

    var card = document.createElement("div");
    card.className = "cz-celebration-card";
    card.innerHTML =
      '<div class="cz-celebration-emoji">' + emoji + "</div>"
      + '<div class="cz-celebration-title">' + escapeHtml(title) + "</div>"
      + (subtitle
        ? '<div class="cz-celebration-subtitle">' + escapeHtml(subtitle) + "</div>"
        : "");

    root.appendChild(backdrop);
    root.appendChild(card);
    document.body.appendChild(root);

    var confettiCleanup = runConfetti();
    var dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(autoTimer);
      confettiCleanup();
      if (root.parentNode) root.parentNode.removeChild(root);
      activeCleanup = null;
    }

    root.addEventListener("click", dismiss);

    var autoTimer = setTimeout(dismiss, OVERLAY_MS);
    activeCleanup = dismiss;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.triggerCelebration = triggerCelebration;
})();
