// public/js/holidays.js — הלכות חגים: כרטיסים מאוירים, פאנל פירוט, סנכרון יומן, הדפסה.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, isError) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => { t.className = "toast"; }, 3200);
  }

  const SRC_LABEL = { torah: "תורה שבכתב", halacha: "הלכה", kabbalah: "קבלה", minhag: "מנהג" };

  let upcomingById = {};

  async function loadGrid() {
    const grid = $("hol-grid");
    try {
      const [{ holidays }, { upcoming }] = await Promise.all([
        fetch("/api/holidays").then((r) => r.json()),
        fetch("/api/holidays/upcoming").then((r) => r.json())
      ]);
      upcomingById = Object.fromEntries((upcoming || []).map((u) => [u.id, u]));

      // שבת מוצגת תמיד ראשונה (חוזרת כל שבוע, לא ב"upcoming")
      const shabbatCard = holidays.find((h) => h.id === "shabbat");
      const rest = holidays.filter((h) => h.id !== "shabbat")
        .map((h) => ({ h, u: upcomingById[h.id] }))
        .sort((a, b) => (a.u ? a.u.daysAway : 999) - (b.u ? b.u.daysAway : 999));

      const cardHtml = (h, u) => {
        const soon = u && u.daysAway <= 14;
        return `
        <div class="hol-card${soon ? " soon" : ""}" data-id="${esc(h.id)}">
          ${u && u.daysAway <= 30 ? `<span class="hol-badge">${u.daysAway <= 0 ? "עכשיו" : "בעוד " + u.daysAway + " ימים"}</span>` : ""}
          <div class="hol-card-art"><div class="hol-card-icon">${esc(h.icon)}</div></div>
          <div class="hol-card-body">
            <h3>${esc(h.name)}</h3>
            <div class="hol-card-tag">${esc(h.tagline)}</div>
            ${u && u.candleLighting ? `<div class="hol-card-times">
              <span>🕯️ ${esc(u.candleLighting.time)}</span>
              ${u.havdalah ? `<span>✨ ${esc(u.havdalah.time)}</span>` : ""}
            </div>` : ""}
          </div>
        </div>`;
      };

      const cards = [];
      if (shabbatCard) cards.push(cardHtml(shabbatCard, null));
      rest.forEach(({ h, u }) => cards.push(cardHtml(h, u)));
      grid.innerHTML = cards.join("");

      grid.querySelectorAll(".hol-card").forEach((el) => {
        el.addEventListener("click", () => openDetail(el.dataset.id));
      });

      // אם יש חג קרוב מאוד (7 ימים) — פותחים אותו אוטומטית בפעם הראשונה שנטען העמוד
      const soonest = rest.find(({ u }) => u && u.daysAway >= 0 && u.daysAway <= 7);
      if (soonest && !location.hash) openDetail(soonest.h.id, true);
      else if (location.hash) openDetail(location.hash.slice(1));
    } catch (err) {
      grid.innerHTML = `<div class="hol-loading">שגיאה בטעינה: ${esc(err.message)}</div>`;
    }
  }

  async function openDetail(id, quiet) {
    const detail = $("hol-detail");
    detail.hidden = false;
    detail.innerHTML = `<div class="hol-loading">טוען…</div>`;
    if (!quiet) detail.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", "#" + id);

    try {
      let content, times;
      if (id === "shabbat") {
        [content] = await Promise.all([fetch(`/api/holidays/${id}`).then((r) => r.json())]);
        const s = await fetch("/api/shabbat").then((r) => r.json());
        times = s.available ? {
          candleLighting: s.candleLighting ? { time: s.candleLighting.timeStr } : null,
          havdalah: s.havdalah ? { time: s.havdalah.timeStr } : null
        } : null;
      } else {
        content = await fetch(`/api/holidays/${id}`).then((r) => r.json());
        times = upcomingById[id];
      }
      if (content.error) throw new Error(content.error);
      renderDetail(content, times);
    } catch (err) {
      detail.innerHTML = `<div class="hol-loading">שגיאה: ${esc(err.message)}</div>`;
    }
  }

  function renderDetail(h, times) {
    const detail = $("hol-detail");
    const sectionsHtml = (h.sections || []).map((s, i) => `
      <div class="hol-section src-${esc(s.source)}" style="animation-delay:${0.05 * i}s">
        <span class="hol-src-label">${esc(SRC_LABEL[s.source] || s.source)}</span>
        <h4>${esc(s.title)}</h4>
        <p>${esc(s.content)}</p>
      </div>`).join("");

    const blessingsHtml = (h.blessings || []).length ? `
      <div class="hol-blessings">
        <h3>ברכות</h3>
        ${h.blessings.map((b) => `
          <div class="hol-blessing-card">
            <div class="hol-blessing-when">${esc(b.when)}</div>
            <div class="hol-blessing-he">${esc(b.he)}</div>
            ${b.translit ? `<div class="hol-blessing-translit">${esc(b.translit)}</div>` : ""}
            ${b.note ? `<div class="hol-blessing-note">${esc(b.note)}</div>` : ""}
          </div>`).join("")}
      </div>` : "";

    const timesHtml = times && (times.candleLighting || times.havdalah) ? `
      <div class="hol-times-row">
        ${times.candleLighting ? `<div class="hol-time-pill"><span class="lbl">🕯️ כניסה</span><span class="val">${esc(times.candleLighting.time)}</span></div>` : ""}
        ${times.havdalah ? `<div class="hol-time-pill"><span class="lbl">✨ יציאה</span><span class="val">${esc(times.havdalah.time)}</span></div>` : ""}
      </div>` : "";

    detail.innerHTML = `
      <div class="hol-detail-hero">
        <button class="hol-close" id="hol-close" title="סגור">✕</button>
        <span class="hol-detail-icon">${esc(h.icon)}</span>
        <h2>${esc(h.name)}</h2>
        <div class="hol-tag">${esc(h.tagline)}</div>
        <p class="hol-intro">${esc(h.intro)}</p>
        ${timesHtml}
        <div class="hol-actions">
          <button class="btn primary" id="hol-print">🖨️ הדפסה</button>
          <button class="btn ghost" id="hol-cal">📅 הוסף ליומן</button>
        </div>
      </div>
      <div class="hol-sections">${sectionsHtml}</div>
      ${blessingsHtml}
      ${h.printExtra ? `<div class="hol-extra">💡 ${esc(h.printExtra)}</div>` : ""}
    `;

    $("hol-close").addEventListener("click", () => { detail.hidden = true; history.replaceState(null, "", location.pathname); });
    $("hol-print").addEventListener("click", () => window.print());
    $("hol-cal").addEventListener("click", syncCalendar);
  }

  async function syncCalendar() {
    const btn = $("hol-sync") || $("hol-cal");
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "מסנכרן…";
    try {
      const r = await fetch("/api/holidays/sync-calendar", { method: "POST" }).then((r) => r.json());
      toast(r.added > 0 ? `נוספו ${r.added} אירועי חג ליומן העסקי` : "היומן כבר מעודכן");
    } catch { toast("שגיאה בסנכרון", true); }
    btn.disabled = false; btn.textContent = label;
  }

  $("hol-sync").addEventListener("click", syncCalendar);
  loadGrid();
})();
