/* נתוני שימוש — כניסות/מבקרים/הורדות. פרטי, מאחורי שער ההתחברות של האתר. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const main = $("#an-main");

  function stat(label, value, sub) {
    return `<div class="an-stat"><div class="an-v">${esc(value)}</div><div class="an-l">${esc(label)}</div>${sub ? `<div class="an-sub">${esc(sub)}</div>` : ""}</div>`;
  }

  function render(d) {
    const dailyRows = (d.daily || []).slice().reverse().map((r) => `
      <tr><td>${esc(r.date)}</td><td>${r.views}</td><td>${r.visitors}</td></tr>`).join("");

    const topRows = (d.topPages || []).map((p) => `
      <tr><td>${esc(p.page)}</td><td>${p.views}</td></tr>`).join("") ||
      `<tr><td colspan="2" class="an-empty">עדיין אין מספיק נתונים</td></tr>`;

    main.innerHTML = `
      <section class="an-section">
        <h2>כניסות לאתר</h2>
        <div class="an-grid">
          ${stat("היום", d.today.views, d.today.visitors + " מבקרים ייחודיים")}
          ${stat("7 ימים אחרונים", d.last7.views, d.last7.visitors + " מבקרים ייחודיים")}
          ${stat("30 יום אחרונים", d.last30.views, d.last30.visitors + " מבקרים ייחודיים")}
          ${stat("מאז ההתחלה", d.allTime.views, "החל מ־" + esc(d.allTime.sinceDay || "—"))}
        </div>
      </section>

      <section class="an-section">
        <h2>הורדות אפליקציית האנדרואיד</h2>
        <div class="an-grid">
          ${stat("סה״כ הורדות", d.appDownloads.total)}
          ${stat("היום", d.appDownloads.today)}
          ${stat("7 ימים אחרונים", d.appDownloads.last7)}
        </div>
        <p class="an-note">קישור להורדה ציבורי: <code class="mono">/app/download</code> — כל הורדה משם נספרת כאן אוטומטית.</p>
      </section>

      <section class="an-section">
        <h2>עמודים פופולריים <span class="an-hint">(30 יום אחרונים)</span></h2>
        <table class="an-table">
          <thead><tr><th>עמוד</th><th>צפיות</th></tr></thead>
          <tbody>${topRows}</tbody>
        </table>
      </section>

      <section class="an-section">
        <h2>לפי יום <span class="an-hint">(30 יום אחרונים)</span></h2>
        <table class="an-table">
          <thead><tr><th>תאריך</th><th>כניסות</th><th>מבקרים ייחודיים</th></tr></thead>
          <tbody>${dailyRows || `<tr><td colspan="3" class="an-empty">עדיין אין נתונים</td></tr>`}</tbody>
        </table>
      </section>`;
  }

  fetch("/api/analytics/stats")
    .then((r) => r.json())
    .then(render)
    .catch(() => { main.innerHTML = `<div class="rd-loading">שגיאה בטעינת הנתונים.</div>`; });
})();
