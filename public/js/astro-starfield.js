// astro-starfield.js — רקע כוכבים מנצנצים (לא רשת מחוברת כמו fx-neural.js) — ייעודי לעמוד
// האסטרולוגיה, מעל רשת הנקודות הרגילה של האתר, בגוונים חמים (זהב/סגול קוסמי).
(function () {
  "use strict";
  if (window.__astroStarfield) return;
  window.__astroStarfield = true;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function boot() {
    const canvas = document.createElement("canvas");
    canvas.id = "astro-stars";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:0.9;";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COLORS = ["255,215,140", "200,170,255", "255,255,255"]; // זהב, סגול-קוסמי, לבן

    let W = 0, H = 0, DPR = 1;
    let stars = [];
    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.ceil(innerWidth * DPR);
      H = canvas.height = Math.ceil(innerHeight * DPR);
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      seed();
    }
    function seed() {
      const count = Math.min(140, Math.floor((innerWidth * innerHeight) / 9000));
      stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: (Math.random() * 1.3 + 0.4) * DPR,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          phase: Math.random() * Math.PI * 2,
          speed: 0.015 + Math.random() * 0.02
        });
      }
    }

    let running = !document.hidden;
    document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) requestAnimationFrame(step); });

    let t = 0;
    function step() {
      if (!running) return;
      t += 1;
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(s.phase + t * s.speed));
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + s.color + "," + twinkle.toFixed(3) + ")";
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
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
