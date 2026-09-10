/* מציג טקסט מעוצב (הגדה / מגילה) מקובץ JSON. RTL, ניווט, גודל גופן, הדפסה. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  const FKEY = "rdFontStep";
  let fontStep = 0;
  try { fontStep = parseInt(localStorage.getItem(FKEY) || "0", 10) || 0; } catch {}
  const applyFont = () => {
    document.documentElement.style.setProperty("--rd-scale", String(1 + fontStep * 0.12));
    try { localStorage.setItem(FKEY, String(fontStep)); } catch {}
  };
  applyFont();
  $("#rd-font-sm").addEventListener("click", () => { fontStep = Math.max(-2, fontStep - 1); applyFont(); });
  $("#rd-font-lg").addEventListener("click", () => { fontStep = Math.min(5, fontStep + 1); applyFont(); });
  $("#rd-print").addEventListener("click", () => window.print());

  const fab = $("#rd-fab");
  fab.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", () => { fab.classList.toggle("show", window.scrollY > 500); });

  const blockHtml = (b) => {
    if (b.type === "verse") {
      return `<span class="rd-verse"><sup>${b.n}</sup> ${esc(b.he)}</span> `;
    }
    const cls = { instruction: "rd-inst", bracha: "rd-bracha", shabbat: "rd-shabbat", text: "rd-text" }[b.type] || "rd-text";
    const label = b.label ? `<div class="rd-label">${esc(b.label)}</div>` : "";
    const body = esc(b.he).replace(/\n/g, "<br>");
    return `<div class="${cls}">${label}<p>${body}</p></div>`;
  };
  const sectionBody = (items) => {
    if (items[0] && items[0].type === "verse") return `<p class="rd-verses">${items.map(blockHtml).join("")}</p>`;
    return items.map(blockHtml).join("");
  };

  async function load() {
    let data, note = "";
    try {
      if (window.PNKS && PNKS.get && /^\/api\//.test(window.RD_SOURCE)) {
        const r = await PNKS.get(window.RD_SOURCE, { timeout: 12000 });
        if (!r.ok) throw new Error(r.error || "no data");
        data = r.data;
        if (r.stale || r.computed || r.offline) {
          note = r.computed ? "מחושב במכשיר (לא מקוון)"
            : "מוצג מהעותק השמור" + (r.cachedAt ? " · " + PNKS.cachedAtLabel(r.cachedAt) : "");
        }
      } else {
        data = await fetch(window.RD_SOURCE).then((r) => r.json());
      }
    }
    catch { $("#rd-body").innerHTML = `<div class="rd-loading">לא הצלחתי לטעון את הטקסט.</div>`; return; }
    window.__rdNote = note;

    // תהילים: {sections:[{n,name,range,verses}]} · הגדה: {steps} · מגילה: {chapters}
    const isTehillim = window.RD_KIND === "tehillim";
    const title = isTehillim ? `תהילים ליום · ${data.hebrewDate || ""}` : data.title;
    const subtitle = isTehillim ? `פרקים ${(data.chapters || []).join(", ")}` : data.subtitle;
    document.title = (data.title || "תהילים") + " · חיים קריספין";
    $("#rd-hero").innerHTML = `
      <h1>${esc(isTehillim ? "תְּהִלִּים לַיּוֹם" : title)}</h1>
      ${subtitle ? `<div class="rd-sub">${esc(subtitle)}</div>` : ""}
      ${data.epigraph ? `<div class="rd-epi">${esc(data.epigraph)}</div>` : isTehillim ? `<div class="rd-epi">לפי החלוקה המסורתית לימי החודש — יום ${data.dayOfMonth || ""} ${esc(data.monthName || "")}</div>` : ""}
      ${window.__rdNote ? `<div class="rd-epi" style="opacity:.7;font-size:.85em">${esc(window.__rdNote)}</div>` : ""}`;

    const sections = isTehillim ? (data.sections || [])
      : (data.steps || data.chapters || data.sections || []);
    const idOf = (s, i) => "sec-" + (s.key || s.n || i);
    const secTitle = (s) => isTehillim ? `פרק ${s.name || s.n}${s.range ? " · " + s.range : ""}` : s.title;

    $("#rd-toc").innerHTML = sections.map((s, i) =>
      `<a href="#${idOf(s, i)}">${isTehillim ? esc(s.name || s.n) : (s.n != null ? `<span class="rd-toc-n">${s.n}</span>` : "") + esc(s.title)}</a>`).join("");

    $("#rd-body").innerHTML = sections.map((s, i) => `
      <section class="rd-section" id="${idOf(s, i)}">
        <div class="rd-step-head">
          ${!isTehillim && s.n != null ? `<span class="rd-step-n">${s.n}</span>` : ""}
          <h2>${esc(secTitle(s))}</h2>
        </div>
        ${sectionBody((s.blocks || s.verses || []).map((b) => b.he != null && b.type == null ? { ...b, type: "verse" } : b))}
      </section>`).join("");

    // הדגשת מקטע פעיל בתוכן העניינים
    const links = [...document.querySelectorAll(".rd-toc a")];
    const obs = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    document.querySelectorAll(".rd-section").forEach((s) => obs.observe(s));
  }
  load();
})();
