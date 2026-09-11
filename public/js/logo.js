/* סטודיו לוגו — יוצר 6 קונספטים וקטוריים + פרומפטים חיצוניים. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };

  let LAST = null;

  function svgDownloadUrl(svg) {
    return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  }

  function renderResult(d) {
    LAST = d;
    $("lg-result").hidden = false;
    $("lg-concept").innerHTML = d.concept
      ? `<div class="lg-note js-speak" data-speak="${esc(d.concept)}"><b>רציונל המותג</b>${d.source ? ` <span class="lg-src">· ${esc(d.source)}</span>` : ""}<p>${esc(d.concept)}</p></div>`
      : "";

    $("lg-marks").innerHTML = d.marks.map((m, i) => `
      <div class="lg-card">
        <div class="lg-mark">${m.svg}</div>
        <div class="lg-card-foot">
          <span>${esc(m.label)}</span>
          <a class="btn ghost tiny" download="${esc(d.name)}-${esc(m.id)}.svg" data-svg-idx="${i}">⤓ SVG</a>
        </div>
      </div>`).join("");
    $("lg-marks").querySelectorAll("[data-svg-idx]").forEach((a) => {
      const m = d.marks[+a.dataset.svgIdx];
      a.href = svgDownloadUrl(m.svg);
    });

    $("lg-palettes").innerHTML = d.palettes.map((p) => `
      <div class="lg-pal">
        <div class="lg-pal-swatches">${p.colors.map((c) => `<span style="background:${esc(c)}" title="${esc(c)}"></span>`).join("")}</div>
        <span class="lg-pal-name">${esc(p.he)}</span>
      </div>`).join("");

    $("lg-prompts").innerHTML = d.externalPrompts.map((p) => `
      <div class="lg-prompt">
        <div class="lg-prompt-eng">${esc(p.engine)}</div>
        <div class="lg-prompt-txt" dir="ltr">${esc(p.prompt)}</div>
        <button type="button" class="btn ghost tiny" data-copy="${esc(p.prompt)}">העתק</button>
      </div>`).join("");
    $("lg-prompts").querySelectorAll("[data-copy]").forEach((b) =>
      b.addEventListener("click", () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast("הועתק"))));

    $("lg-result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("lg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "יוצר…";
    try {
      const body = {
        name: $("lg-name").value.trim(),
        industry: $("lg-industry").value.trim(),
        style: $("lg-style").value.trim(),
        notes: $("lg-notes").value.trim()
      };
      const r = await fetch("/api/logo/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "שגיאה");
      renderResult(j);
    } catch (err) { toast("שגיאה: " + err.message, true); }
    btn.disabled = false; btn.textContent = "✨ צור קונספטים";
  });
})();
