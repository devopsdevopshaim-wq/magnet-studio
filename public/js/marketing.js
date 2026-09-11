/* פרסום ושיווק — בונה קמפיין מלא מבריף קצר. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };

  const copyBtn = (t) => `<button type="button" class="btn ghost tiny" data-copy="${esc(t).replace(/"/g, "&quot;")}">העתק</button>`;
  function wireCopy(root) {
    root.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () =>
      navigator.clipboard.writeText(b.dataset.copy).then(() => toast("הועתק"))));
  }
  const block = (title, bodyHtml) => `<div class="mk-block"><h3>${esc(title)}</h3>${bodyHtml}</div>`;

  function renderCampaign(c) {
    const out = $("mk-result");
    out.hidden = false;

    const parts = [];
    parts.push(`<div class="mk-headline">
      <b>${esc(c.business)}</b> · ${esc(c.platform || "")}${c.source ? ` · נכתב ע"י ${esc(c.source)}` : ""}
    </div>`);

    if (c.headlines?.length) parts.push(block("כותרות (בחרו את המתאימה)",
      `<ul class="mk-list">${c.headlines.map((h) => `<li class="js-speak" data-speak="${esc(h)}"><span>${esc(h)}</span>${copyBtn(h)}</li>`).join("")}</ul>`));

    const bodyRow = (label, txt) => txt ? `<div class="mk-copy-item">
        <div class="mk-copy-label">${esc(label)}</div>
        <p class="js-speak" data-speak="${esc(txt)}">${esc(txt)}</p>
        ${copyBtn(txt)}
      </div>` : "";
    parts.push(block("טקסטים", bodyRow("קצר (סטורי/וואטסאפ)", c.bodyShort) + bodyRow("בינוני (פוסט)", c.bodyMedium) + bodyRow("ארוך (מייל/פלייר)", c.bodyLong)));

    if (c.cta?.length) parts.push(block("קריאה לפעולה",
      `<div class="mk-chips">${c.cta.map((x) => `<span class="mk-chip">${esc(x)}</span>`).join("")}</div>`));

    if (c.hashtags) parts.push(block("האשטגים", `<p class="mk-hashtags" dir="ltr">${esc(c.hashtags)}</p>${copyBtn(c.hashtags)}`));

    if (c.audience) parts.push(block("קהל יעד", `<p>${esc(c.audience)}</p>`));

    if (c.imageBrief || c.imagePrompt) parts.push(block("בריף חזותי",
      (c.imageBrief ? `<p>${esc(c.imageBrief)}</p>` : "") +
      (c.imagePrompt ? `<div class="mk-prompt" dir="ltr">${esc(c.imagePrompt)}${copyBtn(c.imagePrompt)}</div><p class="mk-note">הדביקו את הפרומפט הזה במחולל תמונה, או פתחו את <a href="/aia.html">עיצוב AIA</a> להפקת התמונה/סרטון בפועל.</p>` : "")));

    out.innerHTML = parts.join("");
    wireCopy(out);
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("mk-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "בונה קמפיין…";
    try {
      const body = {
        business: $("mk-business").value.trim(),
        industry: $("mk-industry").value.trim(),
        offer: $("mk-offer").value.trim(),
        goal: $("mk-goal").value,
        platform: $("mk-platform").value,
        tone: $("mk-tone").value.trim(),
        audience: $("mk-audience").value.trim(),
        notes: $("mk-notes").value.trim()
      };
      const r = await fetch("/api/marketing/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.status === 428 || j.needAI) { toast(j.error || "צריך מנוע AI פעיל", true); return; }
      if (!r.ok) throw new Error(j.error || "שגיאה");
      renderCampaign(j);
    } catch (err) { toast("שגיאה: " + err.message, true); }
    btn.disabled = false; btn.textContent = "✨ בנה קמפיין";
  });
})();
