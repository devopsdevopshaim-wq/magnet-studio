/* ספריית קודש — תנ"ך, סידור תפילה וחגים, רמב"ם, תלמוד בבלי. הכל חי מ-Sefaria. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const main = $("#tr-main");
  const toast = (m, bad) => { const t = $("#toast"); if (!t) return; t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };

  let CATALOG = null;
  let MODE = "tanakh";

  async function getJSON(url) {
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || "שגיאה");
    return j;
  }

  function verseBlock(ref, heRef, verses) {
    if (!verses || !verses.length) return `<div class="rd-loading">לא נמצא טקסט עבור ${esc(ref)}.</div>`;
    return `<div class="rd-hero"><div class="sub">${esc(heRef || ref)}</div></div>
      <p class="rd-verses">${verses.map((v, i) => `<span class="rd-verse js-speak" data-speak="${esc(v)}"><sup>${i + 1}</sup> ${esc(v)}</span> `).join("")}</p>`;
  }

  // ---------- תנ״ך ----------
  function renderTanakh() {
    const groups = {};
    CATALOG.books.forEach((b) => { (groups[b.group] = groups[b.group] || []).push(b); });
    const order = ["תורה", "נביאים", "תרי עשר", "כתובים"];
    const MEGILLOT = [
      ["Song of Songs", "שיר השירים", "פסח"], ["Ruth", "רות", "שבועות"],
      ["Ecclesiastes", "קהלת", "סוכות"], ["Lamentations", "איכה", "תשעה באב"], ["Esther", "אסתר", "פורים"]
    ];
    main.innerHTML = `
      <div class="tr-panel">
        <div class="tr-grp tr-megillot"><span class="tr-grp-l">חמש מגילות</span>
          <div class="tr-chips">${MEGILLOT.map((m) => `<button class="tr-chip tr-meg-chip" data-book="${esc(m[0])}">${esc(m[1])} <small>· ${esc(m[2])}</small></button>`).join("")}</div>
        </div>
        <div class="tr-picker">
          ${order.map((g) => `<div class="tr-grp"><span class="tr-grp-l">${esc(g)}</span>
            <div class="tr-chips">${groups[g].map((b) => `<button class="tr-chip" data-book="${esc(b.en)}">${esc(b.he)}</button>`).join("")}</div></div>`).join("")}
        </div>
        <div class="tr-controls">
          <label>פרק <input type="number" id="tr-ch" min="1" value="1" style="width:4.5em"></label>
          <div class="tr-comm" id="tr-comm">
            ${CATALOG.commentaries.map((c) => `<label class="tr-check"><input type="checkbox" value="${esc(c.id)}"> ${esc(c.he)}</label>`).join("")}
          </div>
          <button class="btn primary" id="tr-go">קרא</button>
        </div>
        <div id="tr-out" class="rd-body"></div>
      </div>`;
    let book = groups[order[0]][0].en, bookHe = groups[order[0]][0].he;
    main.querySelectorAll(".tr-chip").forEach((b) => b.addEventListener("click", () => {
      main.querySelectorAll(".tr-chip").forEach((x) => x.classList.remove("on"));
      b.classList.add("on"); book = b.dataset.book; bookHe = b.textContent;
    }));
    main.querySelector(".tr-chip").classList.add("on");
    $("#tr-go").addEventListener("click", async () => {
      const ch = parseInt($("#tr-ch").value, 10) || 1;
      const out = $("#tr-out");
      out.innerHTML = `<div class="rd-loading">טוען…</div>`;
      try {
        const base = await getJSON(`/api/torah/text?ref=${encodeURIComponent(book + "." + ch)}`);
        let html = verseBlock(base.ref, `${bookHe} פרק ${ch}`, base.he);
        const wanted = [...main.querySelectorAll("#tr-comm input:checked")].map((i) => i.value);
        for (const cid of wanted) {
          const c = CATALOG.commentaries.find((x) => x.id === cid);
          try {
            const cm = await getJSON(`/api/torah/text?ref=${encodeURIComponent(c.prefix + book + "." + ch)}`);
            html += `<div class="tr-comm-block"><div class="rd-label">${esc(c.he)}</div>` +
              cm.he.map((v) => `<p class="js-speak" data-speak="${esc(v)}">${esc(v)}</p>`).join("") + `</div>`;
          } catch { /* אין פרשנות לפרק הזה */ }
        }
        out.innerHTML = html;
      } catch (e) { out.innerHTML = `<div class="rd-loading">שגיאה: ${esc(e.message)}</div>`; }
    });
  }

  // ---------- סידור תפילה וחגים ----------
  async function renderSiddur() {
    main.innerHTML = `<div class="tr-panel tr-siddur">
      <nav class="tr-tree" id="tr-tree"><div class="rd-loading">טוען עץ הסידור…</div></nav>
      <div id="tr-sidout" class="rd-body"><div class="rd-loading">בחרו תפילה מהרשימה מימין.</div></div>
    </div>`;
    try {
      const { tree } = await getJSON("/api/torah/siddur-tree");
      $("#tr-tree").innerHTML = tree.map(nodeHtml).join("");
      wireTree();
    } catch (e) { $("#tr-tree").innerHTML = `<div class="rd-loading">שגיאה בטעינת הסידור.</div>`; }
  }
  function nodeHtml(n) {
    if (!n.children) return `<button class="tr-leaf" data-ref="${esc(n.ref)}">${esc(n.he)}</button>`;
    return `<details class="tr-node"><summary>${esc(n.he)}</summary>${n.children.map(nodeHtml).join("")}</details>`;
  }
  function wireTree() {
    main.querySelectorAll(".tr-leaf").forEach((b) => b.addEventListener("click", async () => {
      main.querySelectorAll(".tr-leaf").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      const out = $("#tr-sidout");
      out.innerHTML = `<div class="rd-loading">טוען…</div>`;
      try {
        const d = await getJSON(`/api/torah/text?ref=${encodeURIComponent(b.dataset.ref)}`);
        out.innerHTML = verseBlock(d.ref, b.textContent, d.he);
      } catch (e) { out.innerHTML = `<div class="rd-loading">שגיאה: ${esc(e.message)}</div>`; }
    }));
  }

  // ---------- רמב״ם ----------
  function renderRambam() {
    main.innerHTML = `<div class="tr-panel">
      <div class="tr-controls">
        <label>חלק <select id="tr-rsec">${CATALOG.rambam.map((s) => `<option value="${esc(s.en)}">${esc(s.he)}</option>`).join("")}</select></label>
        <label>פרק <input type="number" id="tr-rch" min="1" value="1" style="width:4.5em"></label>
        <button class="btn primary" id="tr-rgo">קרא</button>
      </div>
      <div id="tr-rout" class="rd-body"></div>
    </div>`;
    $("#tr-rgo").addEventListener("click", async () => {
      const sec = $("#tr-rsec").value; const secHe = $("#tr-rsec").selectedOptions[0].textContent;
      const ch = parseInt($("#tr-rch").value, 10) || 1;
      const out = $("#tr-rout");
      out.innerHTML = `<div class="rd-loading">טוען…</div>`;
      try {
        const d = await getJSON(`/api/torah/text?ref=${encodeURIComponent(sec + "." + ch)}`);
        out.innerHTML = verseBlock(d.ref, `רמב״ם, ${secHe} פרק ${ch}`, d.he);
      } catch (e) { out.innerHTML = `<div class="rd-loading">שגיאה: ${esc(e.message)}</div>`; }
    });
  }

  // ---------- תלמוד בבלי ----------
  function renderTalmud() {
    main.innerHTML = `<div class="tr-panel">
      <div class="tr-controls">
        <label>מסכת <select id="tr-tmasechet">${CATALOG.talmud.map((s) => `<option value="${esc(s.en)}">${esc(s.he)}</option>`).join("")}</select></label>
        <label>דף <input type="text" id="tr-tdaf" value="2a" placeholder="2a" style="width:4.5em"></label>
        <button class="btn primary" id="tr-tgo">קרא</button>
      </div>
      <p class="muted tiny" style="color:var(--cream-dim)">כתבו את מספר הדף עם a (עמוד א) או b (עמוד ב) — למשל 2a, 15b.</p>
      <div id="tr-tout" class="rd-body"></div>
    </div>`;
    $("#tr-tgo").addEventListener("click", async () => {
      const trc = $("#tr-tmasechet").value; const trcHe = $("#tr-tmasechet").selectedOptions[0].textContent;
      const daf = $("#tr-tdaf").value.trim() || "2a";
      const out = $("#tr-tout");
      out.innerHTML = `<div class="rd-loading">טוען…</div>`;
      try {
        const d = await getJSON(`/api/torah/text?ref=${encodeURIComponent(trc + "." + daf)}`);
        out.innerHTML = verseBlock(d.ref, `${trcHe} דף ${daf}`, d.he);
      } catch (e) { out.innerHTML = `<div class="rd-loading">שגיאה: ${esc(e.message)}</div>`; }
    });
  }

  function paint() {
    main.innerHTML = `<div class="rd-loading">טוען…</div>`;
    if (MODE === "tanakh") renderTanakh();
    else if (MODE === "siddur") renderSiddur();
    else if (MODE === "rambam") renderRambam();
    else if (MODE === "talmud") renderTalmud();
  }

  $("#tr-tabbar").addEventListener("click", (e) => {
    const b = e.target.closest(".tr-tab");
    if (!b) return;
    main.querySelectorAll ? null : null;
    document.querySelectorAll(".tr-tab").forEach((x) => x.classList.toggle("active", x === b));
    MODE = b.dataset.mode;
    paint();
  });

  (async () => {
    try { CATALOG = await getJSON("/api/torah/catalog"); paint(); }
    catch { main.innerHTML = `<div class="rd-loading">לא הצלחתי לטעון את הספרייה. ודא שהשרת פועל.</div>`; }
  })();
})();
