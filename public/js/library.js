/* אוצר לחג — רשימת כל הקבצים לפי קטגוריה, עם סימון מה רלוונטי כרגע. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sizeStr = (kb) => !kb ? "" : kb > 1024 ? (kb / 1024).toFixed(1) + "MB" : kb + "KB";

  const OCC_HE = {
    Pesach: "פסח", "Rosh Hashana": "ראש השנה", "Yom Kippur": "יום כיפור", Sukkot: "סוכות",
    Chanukah: "חנוכה", Purim: "פורים", Shavuot: "שבועות", "Tu BiShvat": "ט״ו בשבט",
    "Lag BaOmer": "ל״ג בעומר", "Tish'a B'Av": "תשעה באב", always: "כל השנה", shabbat: "שבת"
  };

  async function load() {
    let data;
    try {
      data = await fetch("/api/library").then((r) => r.json());
    } catch {
      $("lib-main").innerHTML = `<div class="lib-note">השרת לא זמין.</div>`;
      return;
    }
    const activeIds = new Set((data.active || []).map((a) => a.id));
    const activeById = Object.fromEntries((data.active || []).map((a) => [a.id, a]));
    const resources = data.resources || [];

    // לוח חגים קרובים
    let boardHtml = "";
    if ((data.holidays || []).length) {
      boardHtml = `<section class="lib-board">
        <h2>חגים קרובים</h2>
        <div class="lib-board-grid">${data.holidays.map((h) => `
          <div class="lib-hol${h.daysAway <= 21 ? " near" : ""}">
            <div class="lib-hol-name">${esc(h.title)}</div>
            <div class="lib-hol-date">${esc(h.dateHe)}</div>
            <div class="lib-hol-count">${h.daysAway === 0 ? "היום!" : h.daysAway === 1 ? "מחר" : "בעוד " + h.daysAway + " ימים"}</div>
          </div>`).join("")}</div>
      </section>`;
    }

    if (!resources.length) {
      $("lib-main").innerHTML = boardHtml + `<div class="lib-note">עדיין אין קבצים באוצר.</div>`;
      return;
    }

    // קבוצות לפי קטגוריה
    const byCat = {};
    resources.forEach((r) => { (byCat[r.category || "כללי"] = byCat[r.category || "כללי"] || []).push(r); });

    const card = (r) => {
      const act = activeById[r.id];
      const missing = r.exists === false;
      return `
        <div class="lib-card${act ? " active" : ""}${missing ? " missing" : ""}">
          <div class="lib-card-top">
            <span class="lib-card-title">${esc(r.title)}</span>
            <span class="lib-occ">${esc(OCC_HE[r.occasion] || r.occasion)}</span>
          </div>
          ${r.desc ? `<div class="lib-card-desc">${esc(r.desc)}</div>` : ""}
          ${act ? `<div class="lib-badge">רלוונטי עכשיו${act.label ? " · " + esc(act.label) : ""}</div>` : ""}
          ${missing ? `<div class="lib-badge miss">הקובץ חסר בתיקייה</div>` : `
          <div class="lib-card-actions">
            <a class="btn ghost" href="${esc(r.file)}" target="_blank" rel="noopener">פתח</a>
            <a class="btn ghost" href="${esc(r.file)}" download>הורד${r.sizeKB ? " · " + sizeStr(r.sizeKB) : ""}</a>
          </div>`}
        </div>`;
    };

    // סדר קטגוריות: חג, שבת, ברכות, כללי
    const order = ["חג", "שבת", "ברכות", "כללי"];
    const cats = Object.keys(byCat).sort((a, b) => (order.indexOf(a) + 99) % 100 - (order.indexOf(b) + 99) % 100 || a.localeCompare(b));

    $("lib-main").innerHTML = boardHtml + cats.map((cat) => `
      <section class="lib-cat">
        <h2>${esc(cat)}</h2>
        <div class="lib-grid">${byCat[cat].map(card).join("")}</div>
      </section>`).join("");
  }

  load();
})();
