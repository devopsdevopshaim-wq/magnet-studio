// דמות הצ'אט — פנים מצוירות ב-SVG שמדברות, ממצמצות, מקשיבות וחושבות.
// window.JarvisAvatar.create(el, {size}) -> { setState, attachAudio, flapWhile, destroy }

(function () {
  if (window.JarvisAvatar) return;

  // הזרקת ה-CSS פעם אחת
  if (!document.querySelector('link[href="/css/avatar.css"]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/css/avatar.css";
    document.head.appendChild(l);
  }

  const SVG = `
<svg class="jarvis-face" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="הדמות של הצ'אט">
  <defs>
    <radialGradient id="jf-bg" cx="50%" cy="38%" r="68%">
      <stop offset="0" stop-color="#0e1c30"/><stop offset="1" stop-color="#060a14"/>
    </radialGradient>
    <linearGradient id="jf-skin" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#f3dcc2"/><stop offset="0.45" stop-color="#e8c8a4"/><stop offset="1" stop-color="#c99f78"/>
    </linearGradient>
    <radialGradient id="jf-cheek-glow" cx="50%" cy="30%" r="70%">
      <stop offset="0" stop-color="#fff6e8" stop-opacity="0.55"/><stop offset="1" stop-color="#fff6e8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="jf-hair" x1="0.1" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#241a10"/><stop offset="0.5" stop-color="#4a3420"/><stop offset="1" stop-color="#6b4c2c"/>
    </linearGradient>
    <linearGradient id="jf-iris" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6a4a30"/><stop offset="1" stop-color="#2c1c10"/>
    </linearGradient>
    <linearGradient id="jf-lip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d97b6e"/><stop offset="1" stop-color="#a8493f"/>
    </linearGradient>
    <linearGradient id="jf-neck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9b48c"/><stop offset="1" stop-color="#b98f66"/>
    </linearGradient>
    <linearGradient id="jf-shirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c2b40"/><stop offset="1" stop-color="#101a2a"/>
    </linearGradient>
  </defs>

  <circle cx="100" cy="108" r="104" fill="url(#jf-bg)"/>
  <circle class="aura" cx="100" cy="112" r="70" fill="none" stroke="var(--ember, #2fe3ff)" stroke-width="1.5"/>

  <g class="fx-breathe">
   <!-- כתפיים / חולצה -->
   <path d="M28 220c4-30 30-46 72-46s68 16 72 46z" fill="url(#jf-shirt)"/>
   <path d="M28 220c4-30 30-46 72-46s68 16 72 46" fill="none" stroke="var(--brass, #3ec6ff)" stroke-width="1" opacity="0.35"/>

   <g class="fx-head">
    <!-- צוואר -->
    <path d="M84 150v22c5 6 11 9 16 9s11-3 16-9v-22z" fill="url(#jf-neck)"/>
    <path d="M84 156c8 6 24 6 32 0" stroke="#a67c52" stroke-width="1.2" opacity="0.4" fill="none"/>

    <!-- שיער אחורי -->
    <path d="M42 98c0-42 25-68 58-68s58 26 58 68c0 32-7 56-16 74-6-32-4-68-4-68s-15 13-38 13-38-13-38-13 2 36-4 68c-9-18-16-42-16-74z" fill="url(#jf-hair)"/>

    <!-- פנים -->
    <path d="M58 96c0-30 18-50 42-50s42 20 42 50c0 20-4 34-10 44-4 12-13 22-32 22s-28-10-32-22c-6-10-10-24-10-44z" fill="url(#jf-skin)"/>
    <path d="M58 96c0-30 18-50 42-50s42 20 42 50c0 20-4 34-10 44-4 12-13 22-32 22s-28-10-32-22c-6-10-10-24-10-44z" fill="url(#jf-cheek-glow)"/>

    <!-- צללית לחיים ולסת -->
    <ellipse cx="74" cy="118" rx="9" ry="6" fill="#c47a4a" opacity="0.14"/>
    <ellipse cx="126" cy="118" rx="9" ry="6" fill="#c47a4a" opacity="0.14"/>
    <path d="M64 100c-2 10-1 20 3 28" stroke="#b98a5c" stroke-width="1" opacity="0.25" fill="none" stroke-linecap="round"/>
    <path d="M136 100c2 10 1 20-3 28" stroke="#b98a5c" stroke-width="1" opacity="0.25" fill="none" stroke-linecap="round"/>

    <!-- גבות -->
    <path d="M70 82c6-4 16-4.5 21-1.5" stroke="#3a2a18" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M109 80.5c5-3 15-2.5 21 1.5" stroke="#3a2a18" stroke-width="2.6" fill="none" stroke-linecap="round"/>

    <!-- עיניים -->
    <g>
      <ellipse cx="80" cy="94" rx="10.5" ry="7" fill="#fff" opacity="0.92"/>
      <ellipse cx="80" cy="94" rx="10.5" ry="7" fill="none" stroke="#8a6a48" stroke-width="0.6" opacity="0.5"/>
      <circle class="pupil" cx="80" cy="94.5" r="4.6" fill="url(#jf-iris)"/>
      <circle cx="80" cy="94.5" r="2" fill="#0c0804"/>
      <circle cx="82" cy="92.5" r="1.3" fill="#fff" opacity="0.9"/>
      <circle cx="78.5" cy="96.5" r="0.6" fill="#fff" opacity="0.5"/>
      <path d="M69.5 87c4-3.5 17-3.5 21 0" stroke="#3a2a18" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.7"/>
      <rect class="lid" x="68.5" y="86" width="23" height="14" rx="7" fill="url(#jf-skin)"/>
    </g>
    <g>
      <ellipse cx="120" cy="94" rx="10.5" ry="7" fill="#fff" opacity="0.92"/>
      <ellipse cx="120" cy="94" rx="10.5" ry="7" fill="none" stroke="#8a6a48" stroke-width="0.6" opacity="0.5"/>
      <circle class="pupil" cx="120" cy="94.5" r="4.6" fill="url(#jf-iris)"/>
      <circle cx="120" cy="94.5" r="2" fill="#0c0804"/>
      <circle cx="122" cy="92.5" r="1.3" fill="#fff" opacity="0.9"/>
      <circle cx="118.5" cy="96.5" r="0.6" fill="#fff" opacity="0.5"/>
      <path d="M109.5 87c4-3.5 17-3.5 21 0" stroke="#3a2a18" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.7"/>
      <rect class="lid" x="108.5" y="86" width="23" height="14" rx="7" fill="url(#jf-skin)"/>
    </g>

    <!-- אף -->
    <path d="M100 92c-2.5 8-5.5 13-5.5 16 0 3.5 2.5 5.5 5.5 5.5s5.5-2 5.5-5.5c0-3-3-8-5.5-16z" fill="#d1a778" opacity="0.55"/>
    <ellipse cx="96.5" cy="113" rx="1.6" ry="1" fill="#a87c52" opacity="0.5"/>
    <ellipse cx="103.5" cy="113" rx="1.6" ry="1" fill="#a87c52" opacity="0.5"/>
    <path d="M92 112c1.5 2 5 3 8 3s6.5-1 8-3" stroke="#b98a5c" stroke-width="0.8" opacity="0.3" fill="none"/>

    <!-- פה -->
    <g>
      <ellipse class="mouth-open" cx="100" cy="133" rx="11" ry="6.5" fill="#5c2a24"/>
      <path class="lips" d="M86 132c3-2 8-3 14-3s11 1 14 3c-5 6-9 8-14 8s-9-2-14-8z" fill="url(#jf-lip)"/>
      <path d="M91 130c4-2 14-2 18 0" stroke="#f0b8a8" stroke-width="1" opacity="0.5" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M84 128c3-1.5 6.5-2 8-1.6M108 126.4c1.5-.4 5 .1 8 1.6" stroke="#c99f78" stroke-width="0.8" opacity="0.35" fill="none" stroke-linecap="round"/>

    <!-- שיער קדמי + פרידה -->
    <path d="M58 96c-2-32 15-56 42-56s44 24 42 56c-4-18-11-27-11-27s-11 11-31 11-31-11-31-11-7 9-11 27z" fill="url(#jf-hair)"/>
    <path d="M100 42c-3 6-4 14-3 22" stroke="#241a10" stroke-width="1.2" opacity="0.5" fill="none" stroke-linecap="round"/>
   </g>
  </g>
</svg>`;

  function create(el, opts = {}) {
    const size = opts.size === "sm" ? "sm" : "lg";
    const wrap = document.createElement("div");
    wrap.className = "jarvis-face-wrap " + size;
    wrap.innerHTML = SVG;
    el.appendChild(wrap);
    const face = wrap.querySelector(".jarvis-face");

    let state = "idle";
    let blinkTimer = null;
    let rafId = null;
    let flapId = null;
    let audioCtx = null;
    let analyser = null;

    function scheduleBlink() {
      clearTimeout(blinkTimer);
      blinkTimer = setTimeout(() => {
        face.classList.add("blink");
        setTimeout(() => face.classList.remove("blink"), 120);
        scheduleBlink();
      }, 2600 + Math.random() * 4200);
    }
    scheduleBlink();

    function setMouth(v) {
      face.style.setProperty("--mouth", Math.max(0, Math.min(1, v)).toFixed(2));
    }

    function setState(s) {
      state = s;
      face.classList.remove("state-idle", "state-listening", "state-thinking", "state-speaking");
      face.classList.add("state-" + s);
      const cap = wrap.parentElement && wrap.parentElement.querySelector(".jarvis-face-caption .state");
      if (cap) cap.textContent = { idle: "כאן", listening: "מקשיבה", thinking: "חושבת", speaking: "מדברת" }[s] || "";
      if (s === "listening") face.style.setProperty("--tilt", "-4deg");
      else if (s === "thinking") face.style.setProperty("--tilt", "3deg");
      else face.style.setProperty("--tilt", "0deg");
      if (s !== "speaking") { stopFlap(); stopAnalyser(); setMouth(0.1); }
    }

    // ---- lip-sync מ-<audio> ----
    function attachAudio(audioEl) {
      stopFlap();
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(audioEl);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        let smooth = 0;
        const loop = () => {
          if (!analyser) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
          const rms = Math.sqrt(sum / buf.length);
          smooth = smooth * 0.6 + Math.min(1, rms * 3.2) * 0.4;
          setMouth(smooth);
          rafId = requestAnimationFrame(loop);
        };
        loop();
        audioEl.addEventListener("ended", () => { stopAnalyser(); setMouth(0.1); }, { once: true });
      } catch {
        // דפדפן חוסם / כבר מחובר — נופלים ל-flap
        flapWhile(() => !audioEl.paused && !audioEl.ended);
      }
    }
    function stopAnalyser() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      analyser = null;
    }

    // ---- flap אקראי (ל-speechSynthesis בלי audio element) ----
    function flapWhile(cond) {
      stopFlap();
      const step = () => {
        if (!cond()) { stopFlap(); setMouth(0.1); return; }
        setMouth(0.15 + Math.random() * 0.7);
        flapId = setTimeout(step, 90 + Math.random() * 90);
      };
      step();
    }
    function stopFlap() { if (flapId) clearTimeout(flapId); flapId = null; }

    function destroy() {
      clearTimeout(blinkTimer); stopFlap(); stopAnalyser();
      wrap.remove();
    }

    setState("idle");
    return { setState, attachAudio, flapWhile, setMouth, destroy, el: wrap };
  }

  window.JarvisAvatar = { create };
})();
