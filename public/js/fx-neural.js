/* fx-neural.js — רקע "רשת עצבים" חי מאחורי כל עמוד: נקודות מחוברות בקווי אור, שנעות לאט
 * ומגיבות לתנועת העכבר — כמו מסך שקולט אותך (בהשראת Lucy / רקעי shader). קנבס 2D קליל,
 * לא WebGL, נטען פעם אחת דרך dockbar.js. מכבד prefers-reduced-motion ומצטמצם במסכים קטנים.
 */
(function () {
  "use strict";
  if (window.__fxNeural) return;
  window.__fxNeural = true;

  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function boot() {
    var canvas = document.createElement("canvas");
    canvas.id = "fx-neural";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:0.75;";
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var TECH = "47,227,255";   // var(--tech) — אקצנט ציאן טכנולוגי
    var BRASS = "198,154,99";  // var(--brass) — נקודה חמה מדי פעם

    var W = 0, H = 0, DPR = 1;
    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.ceil(innerWidth * DPR);
      H = canvas.height = Math.ceil(innerHeight * DPR);
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      seed();
    }

    var isTouch = matchMedia("(pointer: coarse)").matches;
    var mouse = { x: 0, y: 0, active: false };
    document.addEventListener("mousemove", function (e) {
      mouse.x = e.clientX * DPR; mouse.y = e.clientY * DPR; mouse.active = true;
    }, { passive: true });
    document.addEventListener("mouseleave", function () { mouse.active = false; });

    var pts = [];
    function seed() {
      var area = innerWidth * innerHeight;
      var count = isTouch ? Math.min(34, Math.floor(area / 30000)) : Math.min(80, Math.floor(area / 16000));
      pts = [];
      for (var i = 0; i < count; i++) {
        pts.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22 * DPR,
          vy: (Math.random() - 0.5) * 0.22 * DPR,
          r: (Math.random() * 1.4 + 0.6) * DPR,
          warm: Math.random() < 0.08
        });
      }
    }

    var running = !document.hidden;
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(step);
    });

    var MAXD = 125;
    function step() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);

      if (mouse.active) {
        var glow = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 150 * DPR);
        glow.addColorStop(0, "rgba(" + TECH + ",0.09)");
        glow.addColorStop(1, "rgba(" + TECH + ",0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 150 * DPR, 0, Math.PI * 2); ctx.fill();
      }

      var maxD = MAXD * DPR;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        if (mouse.active) {
          var dx = mouse.x - p.x, dy = mouse.y - p.y;
          var d2 = dx * dx + dy * dy, R = 220 * DPR;
          if (d2 < R * R) { p.x += dx * 0.004; p.y += dy * 0.004; }
        }
      }

      for (var a = 0; a < pts.length; a++) {
        for (var b = a + 1; b < pts.length; b++) {
          var pa = pts[a], pb = pts[b];
          var ddx = pa.x - pb.x, ddy = pa.y - pb.y;
          var dist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dist < maxD) {
            var op = (1 - dist / maxD) * 0.32;
            ctx.strokeStyle = "rgba(" + TECH + "," + op.toFixed(3) + ")";
            ctx.lineWidth = DPR;
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          }
        }
      }
      for (var k = 0; k < pts.length; k++) {
        var pt = pts[k];
        ctx.fillStyle = "rgba(" + (pt.warm ? BRASS : TECH) + ",0.85)";
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
      }

      requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(step);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
