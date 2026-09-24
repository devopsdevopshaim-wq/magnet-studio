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
<svg class="jarvis-face" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="הדמות של הצ'אט">
  <defs>
    <linearGradient id="jf-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ecd8b8"/><stop offset="1" stop-color="#dcc09a"/>
    </linearGradient>
    <linearGradient id="jf-hair" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5a4028"/><stop offset="0.6" stop-color="#7c5836"/><stop offset="1" stop-color="#c69a63"/>
    </linearGradient>
    <radialGradient id="jf-bg" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="#241d16"/><stop offset="1" stop-color="#17120d"/>
    </radialGradient>
  </defs>

  <circle cx="100" cy="100" r="96" fill="url(#jf-bg)"/>
  <circle class="aura" cx="100" cy="104" r="62" fill="none" stroke="#db8b42" stroke-width="1.5"/>

  <g class="fx-breathe">
   <g class="fx-head">
    <!-- שיער אחורי -->
    <path d="M46 96c0-40 24-64 54-64s54 24 54 64c0 30-6 52-14 70-6-30-4-64-4-64s-14 12-36 12-36-12-36-12 2 34-4 64c-8-18-14-40-14-70z" fill="url(#jf-hair)"/>
    <!-- פנים -->
    <path d="M62 92c0-28 17-46 38-46s38 18 38 46c0 30-17 54-38 54S62 122 62 92z" fill="url(#jf-skin)"/>
    <!-- לחיים -->
    <ellipse cx="78" cy="112" rx="7" ry="4.5" fill="#e0a34a" opacity="0.22"/>
    <ellipse cx="122" cy="112" rx="7" ry="4.5" fill="#e0a34a" opacity="0.22"/>

    <!-- גבות -->
    <path d="M74 84c5-3 13-3 18 0" stroke="#5a4028" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M108 84c5-3 13-3 18 0" stroke="#5a4028" stroke-width="2.4" fill="none" stroke-linecap="round"/>

    <!-- עיניים -->
    <g>
      <ellipse cx="83" cy="94" rx="9" ry="6" fill="#f4ecda"/>
      <circle class="pupil" cx="83" cy="94" r="3.6" fill="#2a2018"/>
      <circle cx="84.6" cy="92.6" r="1.1" fill="#fff" opacity="0.85"/>
      <rect class="lid" x="73" y="88" width="20" height="12" rx="6" fill="url(#jf-skin)"/>
    </g>
    <g>
      <ellipse cx="117" cy="94" rx="9" ry="6" fill="#f4ecda"/>
      <circle class="pupil" cx="117" cy="94" r="3.6" fill="#2a2018"/>
      <circle cx="118.6" cy="92.6" r="1.1" fill="#fff" opacity="0.85"/>
      <rect class="lid" x="107" y="88" width="20" height="12" rx="6" fill="url(#jf-skin)"/>
    </g>

    <!-- אף -->
    <path d="M100 100c-2 6-4 9-4 11 0 3 3 4 4 4s4-1 4-4c0-2-2-5-4-11z" fill="#cbaa82" opacity="0.6"/>

    <!-- פה -->
    <g>
      <ellipse class="mouth-open" cx="100" cy="126" rx="10" ry="6" fill="#5c2a24"/>
      <path class="lips" d="M87 125c6 5 20 5 26 0-4 8-22 8-26 0z" fill="#c9564c"/>
    </g>

    <!-- שיער קדמי -->
    <path d="M62 92c-2-30 14-52 38-52s40 22 38 52c-4-16-10-24-10-24s-10 10-28 10-28-10-28-10-6 8-10 24z" fill="url(#jf-hair)"/>
    <!-- עגילים -->
    <circle cx="63" cy="118" r="2.4" fill="#c69a63"/>
    <circle cx="137" cy="118" r="2.4" fill="#c69a63"/>
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
