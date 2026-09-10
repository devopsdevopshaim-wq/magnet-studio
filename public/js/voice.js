// דיבוב גלובלי — קול אנושי בכל עמוד ובכל לשונית.
// כפתור צף "הַקְרֵא לי", קיצור מקלדת (Alt+ק / Alt+R), ו-window.speak() לשאר הסקריפטים.
//
//   window.speak(text)          — מדובב טקסט חופשי (מנקה Markdown בשרת)
//   window.speak.page()         — מדובב את תוכן העמוד הראשי
//   window.speak.stop()         — עוצר
//   data-speak / .js-speak      — כל אלמנט עם המאפיין הזה מקבל כפתור הקראה משלו
//
// דורש /api/tts (Azure Neural אם מוגדר מפתח, אחרת Google, אחרת דיבור דפדפן).

(function () {
  if (window.__voice) return;
  window.__voice = true;

  // --- CSS ---
  var css = document.createElement("style");
  css.textContent = [
    ".voice-btn{position:fixed;right:16px;bottom:90px;z-index:9998;display:flex;align-items:center;gap:7px;",
    "padding:10px 15px;border-radius:999px;border:1px solid var(--line,rgba(198,154,99,.28));",
    "background:var(--surface-2,#2c231a);color:var(--cream,#f1e7d4);font:600 15px/1 var(--font-body,'Assistant',system-ui,sans-serif);",
    "cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.35);transition:transform .15s,background .15s,box-shadow .15s;min-height:44px}",
    ".voice-btn:hover{background:var(--brass,#c69a63);color:#1b1611;transform:translateY(-1px)}",
    ".voice-btn:focus-visible{outline:3px solid var(--ember,#db8b42);outline-offset:2px}",
    ".voice-btn[data-state='playing']{background:var(--ember,#db8b42);color:#1b1611}",
    ".voice-btn[data-state='loading']{opacity:.75;cursor:wait}",
    ".voice-btn .vc-ic{font-size:17px}",
    "@media(max-width:640px){.voice-btn{right:12px;bottom:84px;padding:11px 13px}.voice-btn .vc-tx{display:none}}",
    "body.dock-collapsed .voice-btn{bottom:52px}",
    ".vc-inline{margin-inline-start:8px;border:0;background:transparent;cursor:pointer;font-size:15px;opacity:.55;",
    "padding:3px 5px;border-radius:7px;vertical-align:middle;min-width:30px;min-height:30px;color:inherit}",
    ".vc-inline:hover{opacity:1;background:var(--line,rgba(198,154,99,.16))}",
    ".vc-inline:focus-visible{outline:2px solid var(--ember,#db8b42);opacity:1}",
    ".vc-inline[data-state='playing']{opacity:1;color:var(--ember,#db8b42)}",
    ".voice-toast{position:fixed;left:50%;bottom:150px;transform:translateX(-50%) translateY(10px);z-index:9999;",
    "background:var(--surface-2,#2c231a);color:var(--cream,#f1e7d4);border:1px solid var(--line,rgba(198,154,99,.28));",
    "padding:10px 16px;border-radius:12px;font:500 14px var(--font-body,'Assistant',sans-serif);opacity:0;transition:opacity .3s,transform .3s;pointer-events:none}",
    ".voice-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}",
    "@media(prefers-reduced-motion:reduce){.voice-btn,.voice-toast{transition:none}}",
    // --- פאנל נגישות ---
    ".a11y-fab{position:fixed;right:16px;bottom:142px;z-index:9998;width:44px;height:44px;border-radius:50%;",
    "border:1px solid var(--line,rgba(198,154,99,.28));background:var(--surface-2,#2c231a);color:var(--cream,#f1e7d4);",
    "font-size:19px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.35)}",
    ".a11y-fab:focus-visible{outline:3px solid var(--ember,#db8b42);outline-offset:2px}",
    "@media(max-width:640px){.a11y-fab{right:12px;bottom:136px}}",
    "body.dock-collapsed .a11y-fab{bottom:104px}",
    ".a11y-panel{position:fixed;right:16px;bottom:196px;z-index:9999;width:260px;padding:14px;border-radius:14px;",
    "background:var(--surface-2,#2c231a);color:var(--cream,#f1e7d4);border:1px solid var(--line,rgba(198,154,99,.3));",
    "box-shadow:0 12px 40px rgba(0,0,0,.5);font:500 14px var(--font-body,'Assistant',sans-serif)}",
    ".a11y-panel h4{margin:0 0 10px;font:700 15px var(--font-body,sans-serif)}",
    ".a11y-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:9px 0}",
    ".a11y-row .grp{display:flex;gap:4px}",
    ".a11y-panel button{min-height:38px;min-width:38px;padding:6px 10px;border-radius:9px;cursor:pointer;",
    "border:1px solid var(--line,rgba(198,154,99,.3));background:var(--surface,#241d16);color:var(--cream,#f1e7d4);font:600 14px var(--font-body,sans-serif)}",
    ".a11y-panel button.on{background:var(--brass,#c69a63);color:#1b1611}",
    ".a11y-panel button:focus-visible{outline:3px solid var(--ember,#db8b42);outline-offset:2px}",
    "@media(max-width:640px){.a11y-panel{right:12px;left:12px;width:auto}}",
    "html[data-a11y-contrast='1']{filter:contrast(1.18) saturate(1.12)}",
    "html[data-a11y-underline='1'] a{text-decoration:underline!important}"
  ].join("");
  document.head.appendChild(css);

  var LSK = "voiceAutoRead";
  var auto = false;
  try { auto = localStorage.getItem(LSK) === "1"; } catch (e) {}

  var audio = new Audio();
  audio.preload = "none";
  var busyBtn = null;
  var lastText = "";

  function setState(s) {
    if (btn) {
      btn.dataset.state = s;                 // idle | loading | playing
      btn.setAttribute("aria-pressed", s === "playing" ? "true" : "false");
      btn.title = s === "playing" ? "עצור הקראה (Alt+ק)"
        : s === "loading" ? "מכין הקראה…" : "הַקְרֵא לי את העמוד (Alt+ק)";
      var ic = btn.querySelector(".vc-ic");
      if (ic) ic.textContent = s === "playing" ? "⏹" : s === "loading" ? "…" : "🔊";
    }
    if (busyBtn && busyBtn !== btn) {
      busyBtn.dataset.state = s;
      var i2 = busyBtn.querySelector(".vc-ic");
      if (i2) i2.textContent = s === "playing" ? "⏹" : s === "loading" ? "…" : "🔈";
      if (s === "idle") { busyBtn = null; }
    }
  }

  function browserFallback(text) {
    try {
      if (!("speechSynthesis" in window)) return false;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text.slice(0, 4000));
      u.lang = "he-IL"; u.rate = 0.98; u.pitch = 1.02;
      var vs = speechSynthesis.getVoices();
      var he = vs.filter(function (v) { return /he-IL|Hebrew|iw/.test(v.lang + v.name); });
      if (he[0]) u.voice = he[0];
      u.onend = function () { setState("idle"); };
      u.onerror = function () { setState("idle"); };
      setState("playing");
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  function stop() {
    try { audio.pause(); audio.currentTime = 0; } catch (e) {}
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    setState("idle");
  }

  async function speak(text, opts) {
    opts = opts || {};
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    // אותו טקסט שכבר מתנגן → עצור (toggle)
    if (!audio.paused && text === lastText) { stop(); return; }
    stop();
    lastText = text;
    if (opts.srcBtn) busyBtn = opts.srcBtn;
    setState("loading");
    try {
      var r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 3200) })
      });
      if (!r.ok) throw new Error("tts " + r.status);
      var blob = await r.blob();
      if (!blob.size) throw new Error("empty");
      audio.src = URL.createObjectURL(blob);
      audio.onended = function () { setState("idle"); };
      audio.onerror = function () { if (!browserFallback(text)) setState("idle"); };
      await audio.play();
      setState("playing");
    } catch (e) {
      if (!browserFallback(text)) {
        setState("idle");
        toast("ההקראה לא זמינה כרגע");
      }
    }
  }

  // ------- חילוץ תוכן העמוד -------
  function pageText() {
    var sel = ["#daily", "#rd-body", "main .card", "main", "article", "#app", ".content"];
    var root = null;
    for (var i = 0; i < sel.length; i++) { root = document.querySelector(sel[i]); if (root) break; }
    root = root || document.body;
    var clone = root.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,svg,button,input,select,textarea,.dockbar,.voice-btn,#dock-yt,nav,.rd-toc,.tabbar,footer").forEach(function (n) { n.remove(); });
    var t = (clone.innerText || clone.textContent || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    // כותרת העמוד בהתחלה
    var h = document.querySelector("h1");
    if (h && t.indexOf(h.innerText.trim()) > 40) t = h.innerText.trim() + ". " + t;
    return t.slice(0, 6000);
  }
  speak.page = function () { speak(pageText()); };
  speak.stop = stop;

  // ------- כפתור צף -------
  var btn = null;
  function mkFloatBtn() {
    btn = document.createElement("button");
    btn.className = "voice-btn";
    btn.type = "button";
    btn.dataset.state = "idle";
    btn.setAttribute("aria-label", "הקרא לי את העמוד");
    btn.title = "הַקְרֵא לי את העמוד (Alt+ק)";
    btn.innerHTML = '<span class="vc-ic" aria-hidden="true">🔊</span><span class="vc-tx">הַקְרֵא</span>';
    btn.addEventListener("click", function () {
      if (btn.dataset.state === "playing" || btn.dataset.state === "loading") stop();
      else speak.page();
    });
    document.body.appendChild(btn);
  }

  function toast(msg) {
    var d = document.createElement("div");
    d.className = "voice-toast";
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add("show"); }, 10);
    setTimeout(function () { d.classList.remove("show"); setTimeout(function () { d.remove(); }, 300); }, 2600);
  }

  // ------- כפתורי הקראה נקודתיים -------
  function attachInline(el) {
    if (el.__vcBtn) return;
    el.__vcBtn = true;
    var b = document.createElement("button");
    b.className = "vc-inline";
    b.type = "button";
    b.setAttribute("aria-label", "הקרא קטע זה");
    b.innerHTML = '<span class="vc-ic" aria-hidden="true">🔈</span>';
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      var txt = el.getAttribute("data-speak") || el.innerText || el.textContent;
      speak(txt, { srcBtn: b });
    });
    el.appendChild(b);
  }
  function scanInline() {
    document.querySelectorAll("[data-speak],.js-speak").forEach(attachInline);
  }

  // ------- קיצור מקלדת -------
  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    var k = (e.key || "").toLowerCase();
    if (k === "r" || k === "ק" || e.code === "KeyR") {
      e.preventDefault();
      if (btn && (btn.dataset.state === "playing" || btn.dataset.state === "loading")) stop();
      else speak.page();
    }
  });

  // ------- פאנל נגישות -------
  var A11Y = { scale: 1, contrast: 0, underline: 0, auto: 0 };
  try { A11Y = Object.assign(A11Y, JSON.parse(localStorage.getItem("a11yPrefs") || "{}")); } catch (e) {}
  A11Y.auto = auto ? 1 : A11Y.auto;

  function applyA11y() {
    var root = document.documentElement;
    root.style.fontSize = A11Y.scale === 1 ? "" : (100 * A11Y.scale).toFixed(0) + "%";
    root.setAttribute("data-a11y-contrast", A11Y.contrast ? "1" : "0");
    root.setAttribute("data-a11y-underline", A11Y.underline ? "1" : "0");
    try { localStorage.setItem("a11yPrefs", JSON.stringify(A11Y)); } catch (e) {}
  }

  function mkA11y() {
    var fab = document.createElement("button");
    fab.className = "a11y-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "הגדרות נגישות");
    fab.setAttribute("aria-expanded", "false");
    fab.textContent = "♿";
    document.body.appendChild(fab);

    var panel = null;
    function close() { if (panel) { panel.remove(); panel = null; } fab.setAttribute("aria-expanded", "false"); }
    function open() {
      panel = document.createElement("div");
      panel.className = "a11y-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "הגדרות נגישות");
      panel.innerHTML =
        '<h4>נגישות</h4>' +
        '<div class="a11y-row"><span>גודל טקסט</span><span class="grp">' +
          '<button data-a="sm" aria-label="הקטן">א−</button>' +
          '<button data-a="rs" aria-label="איפוס">↺</button>' +
          '<button data-a="lg" aria-label="הגדל">א+</button></span></div>' +
        '<div class="a11y-row"><span>ניגודיות גבוהה</span><button data-a="contrast" class="' + (A11Y.contrast ? "on" : "") + '">' + (A11Y.contrast ? "פעיל" : "כבוי") + '</button></div>' +
        '<div class="a11y-row"><span>קו תחת לקישורים</span><button data-a="underline" class="' + (A11Y.underline ? "on" : "") + '">' + (A11Y.underline ? "פעיל" : "כבוי") + '</button></div>' +
        '<div class="a11y-row"><span>הקראה אוטומטית</span><button data-a="auto" class="' + (A11Y.auto ? "on" : "") + '">' + (A11Y.auto ? "פעיל" : "כבוי") + '</button></div>' +
        '<div class="a11y-row"><span>הקרא את העמוד</span><button data-a="read">▶ הקרא</button></div>';
      document.body.appendChild(panel);
      fab.setAttribute("aria-expanded", "true");
      panel.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        var a = b.dataset.a;
        if (a === "sm") A11Y.scale = Math.max(0.85, +(A11Y.scale - 0.1).toFixed(2));
        else if (a === "lg") A11Y.scale = Math.min(1.6, +(A11Y.scale + 0.1).toFixed(2));
        else if (a === "rs") A11Y.scale = 1;
        else if (a === "contrast") { A11Y.contrast ^= 1; b.classList.toggle("on"); b.textContent = A11Y.contrast ? "פעיל" : "כבוי"; }
        else if (a === "underline") { A11Y.underline ^= 1; b.classList.toggle("on"); b.textContent = A11Y.underline ? "פעיל" : "כבוי"; }
        else if (a === "auto") { A11Y.auto ^= 1; b.classList.toggle("on"); b.textContent = A11Y.auto ? "פעיל" : "כבוי"; window.voiceAutoRead.set(A11Y.auto); }
        else if (a === "read") { close(); speak.page(); return; }
        applyA11y();
      });
    }
    fab.addEventListener("click", function (e) { e.stopPropagation(); panel ? close() : open(); });
    document.addEventListener("click", function (e) {
      if (panel && !panel.contains(e.target) && e.target !== fab) close();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  // ------- הפעלה -------
  function boot() {
    applyA11y();
    mkFloatBtn();
    mkA11y();
    scanInline();
    new MutationObserver(scanInline).observe(document.body, { childList: true, subtree: true });
    if (auto || A11Y.auto) setTimeout(function () { speak.page(); }, 1400);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.speak = speak;
  window.voiceAutoRead = {
    get: function () { return auto; },
    set: function (v) { auto = !!v; try { localStorage.setItem(LSK, v ? "1" : "0"); } catch (e) {} }
  };
})();
