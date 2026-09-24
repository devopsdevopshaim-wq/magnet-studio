// public/js/astro-deep.js — פענוח אסטרולוגי מלא: מפת לידה, בתים, היבטים, נומרולוגיה, טרנזיטים.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, isError) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg; t.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => { t.className = "toast"; }, 3200);
  }

  const BODY_ORDER = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

  async function loadConfig() {
    const cfg = await fetch("/api/astro/deep/config").then((r) => r.json());
    const dl = $("ad-cities");
    dl.innerHTML = (cfg.cities || []).map((c) => `<option value="${esc(c)}">`).join("");
    if (cfg.configured) {
      $("ad-date").value = cfg.birthDate || "";
      $("ad-time").value = cfg.birthTime || "12:00";
      $("ad-place").value = cfg.birthPlace || "";
      loadReading();
    }
  }

  async function loadReading() {
    const resultBox = $("ad-result");
    resultBox.hidden = false;
    resultBox.innerHTML = `<div class="validate-result">מחשב מפת לידה…</div>`;
    try {
      const data = await fetch("/api/astro/deep/reading").then((r) => r.json());
      if (data.error) throw new Error(data.error);
      render(data);
      $("ad-form-wrap").hidden = true;
    } catch (err) {
      resultBox.innerHTML = `<div class="validate-result error">שגיאה: ${esc(err.message)}</div>`;
    }
  }

  function render(data) {
    const n = data.natal, tr = data.transits;
    const heroCard = (glyph, lbl, val, sub) => `
      <div class="ad-hero-card"><span class="glyph">${esc(glyph)}</span>
        <div class="lbl">${esc(lbl)}</div><div class="val">${esc(val)}</div><div class="sub">${esc(sub || "")}</div>
      </div>`;

    const planetsHtml = BODY_ORDER.map((k) => {
      const b = n.bodies[k];
      if (!b) return "";
      return `<div class="ad-planet-row">
        <span class="g">${esc(b.glyph)}</span>
        <div class="info">
          <div class="name">${esc(b.name)} ${b.retrograde ? '<span class="retro">R℞</span>' : ""}</div>
          <div class="detail">${esc(b.formatted)} · בית ${b.house}</div>
        </div>
      </div>`;
    }).join("");

    const aspectsHtml = (n.aspects || []).slice(0, 14).map((a) => {
      const toneClass = a.tone && a.tone.includes("הרמונ") ? "tone-harmon" : a.tone && a.tone.includes("מתח") ? "tone-metah" : "";
      return `<div class="ad-aspect-row ${toneClass}">
        <span class="glyph">${esc(a.glyph)}</span>
        <span>${esc(a.aName)} ${esc(a.aspect)} ${esc(a.bName)}</span>
        <span class="orb">אורב ${a.orb}°</span>
      </div>`;
    }).join("");

    const numCards = [
      { n: n.numerology?.lifePath, m: "מספר נתיב חיים · " + (n.numerology?.meaning || "") },
      { n: Math.round((n.moonPhase?.illumination || 0) * 100) + "%", m: "הארת ירח (עכשיו) · " + (n.moonPhase?.phase || "") },
      { n: tr?.summary?.totalHits ?? "—", m: "היבטי טרנזיט פעילים היום" }
    ];

    $("ad-result").innerHTML = `
      <div class="ad-actions">
        <button class="btn ghost" id="ad-edit">✎ עריכת פרטי לידה</button>
        <button class="btn ghost" id="ad-print">🖨️ הדפסה</button>
      </div>

      <div class="ad-hero">
        ${heroCard(n.sun.signGlyph, "שמש", n.sun.signName, n.sun.formatted)}
        ${heroCard(n.moon.signGlyph, "ירח", n.moon.signName, n.moon.formatted)}
        ${heroCard("Asc", "עולה (Ascendant)", n.ascendant.signName, n.ascendant.formatted)}
        ${heroCard("MC", "רום השמיים", n.midheaven.signName, n.midheaven.formatted)}
      </div>

      <div class="ad-section">
        <h3>כוכבי הלכת במפה</h3>
        <div class="ad-planets">${planetsHtml}</div>
      </div>

      <div class="ad-section">
        <h3>היבטים עיקריים</h3>
        <div class="ad-aspects">${aspectsHtml || '<div class="validate-result">אין היבטים משמעותיים</div>'}</div>
      </div>

      <div class="ad-section">
        <h3>נומרולוגיה וירח היום</h3>
        <div class="ad-num-grid">
          ${numCards.map((c) => `<div class="ad-num-card"><div class="n">${esc(c.n)}</div><div class="m">${esc(c.m)}</div></div>`).join("")}
        </div>
      </div>

      <div class="ad-section">
        <div class="ad-note" style="margin:0;">מבוסס על תאריך/שעת/מקום לידה: ${esc(data.birthDate)} ${esc(data.birthTime)}, ${esc(data.birthPlace)}.</div>
      </div>
    `;

    $("ad-edit").addEventListener("click", () => { $("ad-form-wrap").hidden = false; $("ad-result").hidden = true; });
    $("ad-print").addEventListener("click", () => window.print());
  }

  $("ad-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = $("ad-form-result");
    r.textContent = "שומר…"; r.className = "validate-result";
    try {
      const body = { birthDate: $("ad-date").value, birthTime: $("ad-time").value || "12:00", birthPlace: $("ad-place").value.trim() };
      const res = await fetch("/api/astro/deep/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "שגיאה");
      r.textContent = "";
      toast("נשמר — מחשב מפה…");
      await loadReading();
    } catch (err) { r.textContent = "שגיאה: " + err.message; r.className = "validate-result error"; }
  });

  loadConfig();
})();
