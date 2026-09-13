/* טלוויזיה — ערוצי חדשות חינמיים דרך השידור הרשמי שלהם ביוטיוב (embed/live_stream?channel=). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };

  const LS_KEY = "tvLastChannel";
  let CHANNELS = [];

  function playChannel(ch) {
    // embed/live_stream?channel= לא אמין (יוטיוב לפעמים לא טוען דרכו) — לכן השרת כבר פתר
    // מראש את מזהה הסרטון החי בפועל (ch.videoId), ומטמיעים אותו ישירות: embed/<videoId>.
    // autoplay מושתק (mute=1) — כך הדפדפן תמיד מתחיל לנגן מיד; לביטול ההשתקה יש כפתור בנגן עצמו.
    document.querySelectorAll(".tv-ch").forEach((el) => el.classList.toggle("on", el.dataset.id === ch.id));
    try { localStorage.setItem(LS_KEY, ch.id); } catch {}

    if (!ch.videoId) {
      $("tv-frame").innerHTML = `<div class="tv-placeholder">אין כרגע שידור חי בערוץ "${esc(ch.he)}" · נסו ערוץ אחר מהרשימה</div>`;
      $("tv-now").textContent = "לא נמצא שידור חי כרגע: " + ch.he;
      return;
    }
    $("tv-frame").innerHTML = `<iframe id="tv-iframe" src="https://www.youtube.com/embed/${encodeURIComponent(ch.videoId)}?autoplay=1&mute=1&playsinline=1"
      title="${esc(ch.he)}" frameborder="0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen; web-share"
      allowfullscreen></iframe>`;
    $("tv-now").textContent = "צופה עכשיו: " + ch.he + " · אם המסך שחור — נסו ערוץ אחר";
  }

  function goFullscreen() {
    var box = document.getElementById("tv-frame");
    if (!box) return;
    if (box.requestFullscreen) box.requestFullscreen().catch(() => toast("המסך המלא לא נתמך כאן", true));
    else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
    else toast("המסך המלא לא נתמך בדפדפן הזה", true);
  }
  var fsBtn = $("tv-fullscreen");
  if (fsBtn) fsBtn.addEventListener("click", goFullscreen);

  function channelRow(ch) {
    return `<button type="button" class="tv-ch" data-id="${esc(ch.id)}">
      <span class="tv-ch-dot"></span><span class="tv-ch-name">${esc(ch.he)}</span></button>`;
  }

  async function loadChannels() {
    const box = $("tv-list");
    try {
      const { channels } = await fetch("/api/tv/channels").then((r) => r.json());
      CHANNELS = channels || [];
      if (!CHANNELS.length) { box.innerHTML = `<div class="rd-loading">אין ערוצים מוגדרים.</div>`; return; }
      const groups = {};
      CHANNELS.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
      box.innerHTML = Object.entries(groups).map(([g, list]) => `
        <div class="tv-group"><h3>${esc(g)}</h3>${list.map(channelRow).join("")}</div>`).join("");
      box.querySelectorAll(".tv-ch").forEach((btn) => btn.addEventListener("click", () => {
        const ch = CHANNELS.find((c) => c.id === btn.dataset.id);
        if (ch) playChannel(ch);
      }));

      let last = null;
      try { last = localStorage.getItem(LS_KEY); } catch {}
      const start = CHANNELS.find((c) => c.id === last) || CHANNELS[0];
      if (start) playChannel(start);
    } catch { box.innerHTML = `<div class="rd-loading">שגיאה בטעינת הערוצים.</div>`; }
  }

  let qTimer = null;
  $("tv-q").addEventListener("input", () => {
    clearTimeout(qTimer);
    const v = $("tv-q").value.trim();
    if (v.length < 2) { $("tv-search-results").innerHTML = ""; return; }
    qTimer = setTimeout(() => searchChannel(v), 500);
  });
  async function searchChannel(q) {
    const box = $("tv-search-results");
    box.innerHTML = `<div class="tv-search-msg">מחפש…</div>`;
    try {
      const { channels } = await fetch("/api/tv/search?q=" + encodeURIComponent(q)).then((r) => r.json());
      if (!channels || !channels.length) { box.innerHTML = `<div class="tv-search-msg">לא נמצא.</div>`; return; }
      box.innerHTML = channels.map((c) => `
        <div class="tv-search-row" data-cid="${esc(c.channelId)}" data-name="${esc(c.name)}">
          <span>${esc(c.name)}</span><button type="button" class="btn ghost tiny">+ הוסף</button>
        </div>`).join("");
      box.querySelectorAll(".tv-search-row").forEach((row) => row.querySelector("button").addEventListener("click", async () => {
        try {
          await fetch("/api/tv/add", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ he: row.dataset.name, channelId: row.dataset.cid }) });
          toast("הערוץ נוסף לרשימה");
          $("tv-q").value = ""; box.innerHTML = "";
          await loadChannels();
        } catch { toast("שגיאה בהוספה", true); }
      }));
    } catch { box.innerHTML = `<div class="tv-search-msg">שגיאת חיפוש.</div>`; }
  }

  loadChannels();
})();
