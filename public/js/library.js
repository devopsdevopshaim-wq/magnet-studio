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
    const stories = data.stories || [];

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

    // סיפורי החגים — ברירת מחדל: החג הקרוב ביותר שיש לו סיפור
    let storiesHtml = "";
    if (stories.length) {
      const nearestTitle = (data.holidays || []).map((h) => h.desc || h.title).find((t) =>
        stories.some((s) => t && t.startsWith(s.occasion)));
      const nearest = stories.find((s) => nearestTitle && nearestTitle.startsWith(s.occasion));
      const defaultOcc = (nearest || stories[0]).occasion;
      storiesHtml = `<section class="lib-stories">
        <h2>סיפורי החג</h2>
        <div class="lib-story-chips">${stories.map((s) => `
          <button type="button" class="lib-story-chip${s.occasion === defaultOcc ? " on" : ""}" data-occ="${esc(s.occasion)}">${s.icon || ""} ${esc(s.title)}</button>`).join("")}</div>
        <div class="lib-story-body" id="lib-story-body"></div>
      </section>`;
    }

    if (!resources.length) {
      $("lib-main").innerHTML = boardHtml + storiesHtml + `<div class="lib-note">עדיין אין קבצים באוצר.</div>`;
      wireStories(stories);
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

    $("lib-main").innerHTML = boardHtml + storiesHtml + cats.map((cat) => `
      <section class="lib-cat">
        <h2>${esc(cat)}</h2>
        <div class="lib-grid">${byCat[cat].map(card).join("")}</div>
      </section>`).join("");
    wireStories(stories);
  }

  function wireStories(stories) {
    const chips = document.querySelectorAll(".lib-story-chip");
    if (!chips.length) return;
    const show = (occ) => {
      const s = stories.find((x) => x.occasion === occ);
      const body = $("lib-story-body");
      if (!s || !body) return;
      body.innerHTML = `<div class="lib-story-title">${s.icon || ""} ${esc(s.title)}</div>
        <div class="lib-story-sub">${esc(s.subtitle || "")}</div>
        ${(s.paragraphs || []).map((p) => `<p class="js-speak" data-speak="${esc(p)}">${esc(p)}</p>`).join("")}`;
      chips.forEach((c) => c.classList.toggle("on", c.dataset.occ === occ));
    };
    chips.forEach((c) => c.addEventListener("click", () => show(c.dataset.occ)));
    const initial = document.querySelector(".lib-story-chip.on");
    if (initial) show(initial.dataset.occ);
  }

  load();
})();
