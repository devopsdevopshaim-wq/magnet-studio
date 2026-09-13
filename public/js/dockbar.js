// פס תחתון גלובלי: חדשות רצות + נגן מוזיקת רקע מיוטיוב.
// מזריק בעצמו את ה-CSS ואת ה-DOM — כל עמוד צריך רק <script src="/js/dockbar.js" defer>.

(function () {
  if (window.__dockbar) return;
  window.__dockbar = true;

  // --- CSS ---
  if (!document.querySelector('link[href="/css/dockbar.css"]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/css/dockbar.css";
    document.head.appendChild(l);
  }

  // --- מודולים גלובליים: התקנה כאפליקציה + דיבוב קולי בכל עמוד ---
  ["/js/pwa.js", "/js/voice.js", "/js/fx-neural.js"].forEach((src) => {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    document.head.appendChild(s);
  });

  // --- כפתור יציאה: מופיע רק כשהמערכת מוגנת בסיסמה (פריסה ציבורית) ---
  fetch("/api/auth/status").then((r) => r.json()).then((a) => {
    if (!a || !a.enabled) return;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "יציאה";
    b.setAttribute("aria-label", "התנתקות מהמערכת");
    b.style.cssText = "position:fixed;top:8px;inset-inline-start:8px;z-index:9998;font:600 12px var(--font-body,sans-serif);" +
      "background:var(--surface-2,#2c231a);color:var(--cream-dim,#a3927a);border:1px solid var(--line,rgba(198,154,99,.28));" +
      "border-radius:8px;padding:5px 12px;cursor:pointer";
    b.addEventListener("click", () => {
      fetch("/api/auth/logout", { method: "POST" }).finally(() => { location.href = "/login"; });
    });
    document.body.appendChild(b);
  }).catch(() => {});

  // --- שם תצוגה נייד: אם הפרופיל שונה מברירת המחדל, מחליף בכותרת ובלשונית ---
  fetch("/api/profile").then((r) => r.json()).then((p) => {
    if (p && p.displayName && p.displayName !== "חיים קריספין") {
      try { document.title = document.title.replace(/חיים קריספין/g, p.displayName); } catch {}
    }
  }).catch(() => {});

  const LS = {
    get on() { try { return localStorage.getItem("dockMusicOn") === "1"; } catch { return false; } },
    set on(v) { try { localStorage.setItem("dockMusicOn", v ? "1" : "0"); } catch {} },
    get vol() { try { return Math.max(0, Math.min(100, parseInt(localStorage.getItem("dockVol") || "35", 10))); } catch { return 35; } },
    set vol(v) { try { localStorage.setItem("dockVol", String(v)); } catch {} },
    get collapsed() { try { return localStorage.getItem("dockCollapsed") === "1"; } catch { return false; } },
    set collapsed(v) { try { localStorage.setItem("dockCollapsed", v ? "1" : "0"); } catch {} },
    get mood() { try { return localStorage.getItem("dockMood") || "all"; } catch { return "all"; } },
    set mood(v) { try { localStorage.setItem("dockMood", v || "all"); } catch {} }
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function ago(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return "עכשיו";
    if (min < 60) return `לפני ${min} ד'`;
    const h = Math.round(min / 60);
    return `לפני ${h} ש'`;
  }

  // --- DOM ---
  const bar = document.createElement("div");
  bar.className = "dockbar";
  bar.innerHTML = `
    <div class="dock-label">חדשות</div>
    <div class="dock-ticker" id="dock-ticker"><span class="empty">טוען חדשות…</span></div>
    <div class="dock-player">
      <button class="dock-play" id="dock-play" title="נגן/עצור">▶</button>
      <span class="dock-name" id="dock-name">מוזיקת רקע</span>
      <button class="dock-mood" id="dock-mood" title="מצב רוח מוזיקלי">🎵</button>
      <button class="dock-next" id="dock-next" title="טראק אחר">⏭</button>
      <input type="range" class="dock-vol" id="dock-vol" min="0" max="100" step="1" title="עוצמה">
    </div>
    <button class="dock-collapse" id="dock-collapse" title="הסתר/הצג">▾</button>
    <div class="dock-moodmenu" id="dock-moodmenu" hidden></div>`;
  const yt = document.createElement("div");
  yt.id = "dock-yt";
  document.body.appendChild(bar);
  document.body.appendChild(yt);

  if (LS.collapsed) document.body.classList.add("dock-collapsed");

  const $ = (id) => document.getElementById(id);

  // ---------- חדשות ----------

  async function loadNews() {
    const el = $("dock-ticker");
    let items = [];
    try {
      const r = await fetch("/api/news");
      if (r.ok) items = (await r.json()).items || [];
    } catch {
      /* השרת לא זמין */
    }
    if (!items.length) {
      el.innerHTML = `<span class="empty">חדשות לא זמינות כרגע</span>`;
      return;
    }
    items = items.slice(0, 16);
    if (!items.length) {
      el.innerHTML = `<span class="empty">אין חדשות זמינות כרגע</span>`;
      return;
    }
    const one = (it) =>
      `<a class="dock-item" ${it.link ? `href="${esc(it.link)}" target="_blank" rel="noopener"` : ""}>` +
      `<span class="src">${esc(it.source)}</span>${esc(it.title)}<span class="age">${esc(ago(it.ts))}</span></a>` +
      `<span class="dock-sep">◆</span>`;
    const seq = items.map(one).join("");
    // מכפילים לרצף חלק
    el.innerHTML = `<div class="dock-track" id="dock-track">${seq}${seq}</div>`;
    // קצב לפי רוחב התוכן: ~22px לשנייה — תנועה נינוחה וקריאה
    const setSpeed = (tries) => {
      const track = $("dock-track");
      if (!track) return;
      const halfW = track.scrollWidth / 2;
      if (halfW < 40 && tries > 0) { setTimeout(() => setSpeed(tries - 1), 250); return; }
      track.style.animationDuration = Math.max(50, Math.round(halfW / 22)) + "s";
    };
    requestAnimationFrame(() => setSpeed(8));
    setTimeout(() => setSpeed(8), 300); // גיבוי לטאב לא-פעיל (rAF לא רץ ברקע)
  }

  // ---------- נגן ----------

  let player = null;
  let ready = false;
  let current = null; // {id,title,genre}
  let wantPlay = LS.on;

  // המשכיות בין עמודים: שומרים id + מיקום + חותמת זמן ב-sessionStorage
  function saveResume() {
    try {
      if (player && ready && current) {
        sessionStorage.setItem("dockResume", JSON.stringify({ id: current.id, t: player.getCurrentTime() || 0, at: Date.now(), on: wantPlay }));
      }
    } catch { /* ignore */ }
  }
  function readResume() {
    try {
      const r = JSON.parse(sessionStorage.getItem("dockResume") || "null");
      if (r && Date.now() - r.at < 10000) return r; // רק אם המעבר טרי (עד 10ש')
    } catch { /* ignore */ }
    return null;
  }
  window.addEventListener("pagehide", saveResume);
  window.addEventListener("beforeunload", saveResume);

  let MOODS = []; // [{key,he,emoji,count}]

  function moodOf(key) { return MOODS.find((m) => m.key === key) || null; }

  async function fetchToday() {
    try {
      // אם המשתמש בחר מצב-רוח — מכבדים אותו במקום טראק היום
      if (LS.mood && LS.mood !== "all") {
        const d = await fetch("/api/ambient/next?mood=" + encodeURIComponent(LS.mood)).then((r) => r.json());
        return d.ambient || null;
      }
      const d = await fetch("/api/dockbar").then((r) => r.json());
      return d.ambient || null;
    } catch {
      return null;
    }
  }
  const deadIds = new Set(); // שידורים שנפלו בסשן הזה — לא ננסה שוב
  async function fetchNext() {
    try {
      const ex = [current?.id, ...deadIds].filter(Boolean).join(",");
      const q = "?exclude=" + encodeURIComponent(ex) +
        (LS.mood && LS.mood !== "all" ? "&mood=" + encodeURIComponent(LS.mood) : "");
      const d = await fetch("/api/ambient/next" + q).then((r) => r.json());
      return d.ambient || null;
    } catch {
      return null;
    }
  }

  // מחליף לטראק ומנגן. מנסה עד 4 שידורים אחרים אם הנוכחי נופל.
  async function playTrack(t, { autoplay = false } = {}) {
    if (!t) return;
    current = t;
    setName(t);
    if (autoplay) { wantPlay = true; LS.on = true; }
    if (player && ready) {
      player.loadVideoById(t.id);
      if (wantPlay) tryPlay();
    }
  }
  async function skipDead(badId, tries = 4) {
    if (badId) deadIds.add(badId);
    for (let i = 0; i < tries; i++) {
      const nxt = await fetchNext();
      if (!nxt) break;
      current = nxt; setName(nxt);
      if (player && ready) { player.loadVideoById(nxt.id); if (wantPlay) tryPlay(); }
      return nxt;
    }
    setName(current);
    return null;
  }

  function setName(t) {
    const m = moodOf(LS.mood);
    const tag = m ? m.emoji + " " + m.he : "";
    $("dock-name").innerHTML = t
      ? `<span class="genre">${esc(tag)}</span>${esc(t.title || "")}`
      : "מוזיקת רקע לא זמינה";
    const mb = $("dock-mood");
    if (mb) { mb.textContent = m ? m.emoji : "🎵"; mb.classList.toggle("on", !!m); }
  }

  async function loadMoods() {
    try {
      const d = await fetch("/api/ambient/moods").then((r) => r.json());
      MOODS = d.moods || [];
    } catch { MOODS = []; }
  }

  // --- חיפוש חופשי ביוטיוב (לא רק הרשימה המתוקתקת) ---
  async function ytSearch(q) {
    const box = $("dock-ytresults");
    if (!box) return;
    box.innerHTML = `<div class="dock-yt-msg">מחפש…</div>`;
    try {
      const { items } = await fetch("/api/youtube/search?q=" + encodeURIComponent(q)).then((r) => r.json());
      if (!items || !items.length) { box.innerHTML = `<div class="dock-yt-msg">לא נמצא כלום. נסה חיפוש אחר.</div>`; return; }
      box.innerHTML = items.map((it) =>
        `<div class="dock-yt-item" data-id="${esc(it.id)}" data-title="${esc(it.title)}">` +
        `<span class="t">${esc(it.title)}</span><span class="c">${esc(it.channel)}${it.duration ? " · " + esc(it.duration) : ""}</span>` +
        `<button type="button" class="play" title="נגן עכשיו">▶</button>` +
        `<button type="button" class="save" title="הוסף לתחנה שלי לתמיד">⭐</button></div>`
      ).join("");
      box.querySelectorAll(".dock-yt-item").forEach((row) => {
        const id = row.dataset.id, title = row.dataset.title;
        row.querySelector(".play").addEventListener("click", () => {
          playTrack({ id, title, mood: "custom" }, { autoplay: true });
          $("dock-moodmenu").hidden = true;
        });
        row.querySelector(".save").addEventListener("click", async (e) => {
          e.target.textContent = "…";
          try {
            await fetch("/api/ambient/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, title }) });
            e.target.textContent = "✓"; e.target.disabled = true;
            await loadMoods();
          } catch { e.target.textContent = "⚠"; }
        });
      });
    } catch { box.innerHTML = `<div class="dock-yt-msg">החיפוש נכשל — בדוק חיבור לרשת.</div>`; }
  }

  function buildMoodMenu() {
    const menu = $("dock-moodmenu");
    if (!menu) return;
    const item = (key, emoji, he, count) =>
      `<button class="dock-moodchip${LS.mood === key ? " on" : ""}" data-mood="${esc(key)}">` +
      `<span class="e">${esc(emoji)}</span><span class="l">${esc(he)}</span>` +
      (count != null ? `<span class="c">${count}</span>` : "") + `</button>`;
    menu.innerHTML =
      `<div class="dock-ytsearch"><input type="text" id="dock-ytq" placeholder="🔍 כל שיר, אמן או ז'אנר ביוטיוט…" autocomplete="off"></div>` +
      `<div class="dock-ytresults" id="dock-ytresults"></div>` +
      `<div class="dock-moodchips">` +
      item("all", "🎲", "הכל / יומי", null) +
      MOODS.map((m) => item(m.key, m.emoji, m.he, m.count)).join("") +
      `</div>`;
    const q = $("dock-ytq");
    let qTimer = null;
    q.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      clearTimeout(qTimer);
      if (q.value.trim()) ytSearch(q.value.trim());
    });
    q.addEventListener("input", () => {
      clearTimeout(qTimer);
      const v = q.value.trim();
      if (v.length < 2) { $("dock-ytresults").innerHTML = ""; return; }
      qTimer = setTimeout(() => ytSearch(v), 500);
    });
    menu.querySelectorAll(".dock-moodchip").forEach((btn) => {
      btn.addEventListener("click", async () => {
        LS.mood = btn.dataset.mood;
        menu.hidden = true;
        buildMoodMenu();
        const nxt = await fetchNext();
        // בחירת מצב-רוח = כוונה להאזין → מנגנים מיד
        if (nxt) playTrack(nxt, { autoplay: true });
        else setName(current);
      });
    });
  }
  function setPlayIcon(playing) {
    const b = $("dock-play");
    b.textContent = playing ? "⏸" : "▶";
    b.classList.toggle("on", playing);
  }

  function loadYouTubeApi() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") try { prev(); } catch {}
        resolve();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        s.async = true;
        document.head.appendChild(s);
      }
      setTimeout(resolve, 6000); // אם לא נטען (חסום) — נמשיך, הכפתורים פשוט לא יעשו כלום
    });
  }

  async function initPlayer() {
    const resume = readResume();
    const today = await fetchToday();
    if (resume) {
      // מעבר עמוד טרי — ממשיכים את הטראק שהיה
      current = today && today.id === resume.id ? today : { id: resume.id, title: "מוזיקת רקע", genre: "" };
      wantPlay = resume.on;
    } else {
      current = today;
    }
    setName(current);
    if (!current) return;
    await loadYouTubeApi();
    if (!(window.YT && window.YT.Player)) return;

    const startAt = resume && resume.id === current.id ? Math.max(0, resume.t + (Date.now() - resume.at) / 1000) : 0;

    player = new YT.Player("dock-yt", {
      videoId: current.id,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1, rel: 0, start: Math.floor(startAt) },
      events: {
        onReady: () => {
          ready = true;
          player.setVolume(LS.vol);
          $("dock-vol").value = LS.vol;
          if (wantPlay) tryPlay();
        },
        onStateChange: (e) => {
          setPlayIcon(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING);
        },
        onError: (e) => {
          // 150/151/101 = הטמעה חסומה, 100 = הוסר, 2 = מזהה שגוי — מדלגים ולא מנסים שוב
          skipDead(current && current.id);
        }
      }
    });
  }

  function tryPlay() {
    if (ready && player) {
      player.playVideo();
      // אם הדפדפן חסם autoplay, ה-state לא ישתנה ל-PLAYING — נשקף את הכוונה בכל זאת
    }
  }

  $("dock-play").addEventListener("click", () => {
    if (!ready || !player) return;
    const st = player.getPlayerState();
    if (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING) {
      player.pauseVideo();
      wantPlay = false;
      LS.on = false;
    } else {
      player.playVideo();
      wantPlay = true;
      LS.on = true;
    }
  });

  $("dock-next").addEventListener("click", async () => {
    const nxt = await fetchNext();
    if (nxt) playTrack(nxt, { autoplay: true });
  });

  $("dock-mood").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = $("dock-moodmenu");
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", (e) => {
    const menu = $("dock-moodmenu");
    if (menu && !menu.hidden && !menu.contains(e.target) && e.target.id !== "dock-mood") menu.hidden = true;
  });

  $("dock-vol").addEventListener("input", (e) => {
    const v = parseInt(e.target.value, 10);
    LS.vol = v;
    if (ready && player) player.setVolume(v);
  });

  $("dock-collapse").addEventListener("click", () => {
    const c = !document.body.classList.contains("dock-collapsed");
    document.body.classList.toggle("dock-collapsed", c);
    $("dock-collapse").textContent = c ? "▴" : "▾";
    LS.collapsed = c;
  });
  $("dock-collapse").textContent = LS.collapsed ? "▴" : "▾";

  // ---------- הפעלה ----------
  loadNews();
  setInterval(loadNews, 10 * 60 * 1000);
  loadMoods().then(() => { buildMoodMenu(); initPlayer(); });
})();
