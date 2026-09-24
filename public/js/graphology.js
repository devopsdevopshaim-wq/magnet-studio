// public/js/graphology.js — שאלון גרפולוגיה מובנה + דו"ח מלא, פר-חשבון.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, isError) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg; t.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => { t.className = "toast"; }, 3200);
  }

  // ---------- טאבים ----------
  const tabbar = $("gr-tabbar");
  const panels = Array.from(document.querySelectorAll(".gr-panel"));
  function showPanel(name) {
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    tabbar.querySelectorAll(".biz-tab").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    $("gr-report").hidden = true;
    if (name === "history") loadHistory();
  }
  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest(".biz-tab");
    if (b) showPanel(b.dataset.panel);
  });

  // ---------- שאלון ----------
  let schema = null;
  const answers = {};

  async function loadQuiz() {
    schema = await fetch("/api/graphology/questionnaire").then((r) => r.json());
    const paramById = Object.fromEntries(schema.parameters.map((p) => [p.id, p]));
    const body = schema.groups.map((g) => `
      <div class="gr-group">
        <h3>${esc(g.label)}</h3>
        <div class="hint">${esc(g.hint)}</div>
        ${g.params.map((pid) => {
          const p = paramById[pid];
          if (!p) return "";
          return `<div class="gr-q" data-id="${esc(p.id)}">
            <div class="qlabel">${esc(p.label)}</div>
            <div class="qhelp">${esc(p.help)}</div>
            <div class="gr-opts">${p.options.map((o) => `<button type="button" class="gr-opt" data-opt="${esc(o.id)}">${esc(o.label)}</button>`).join("")}</div>
          </div>`;
        }).join("")}
      </div>`).join("");
    $("gr-quiz-body").innerHTML = body;

    $("gr-quiz-body").querySelectorAll(".gr-q").forEach((qEl) => {
      const pid = qEl.dataset.id;
      qEl.querySelectorAll(".gr-opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          answers[pid] = btn.dataset.opt;
          qEl.querySelectorAll(".gr-opt").forEach((b) => b.classList.toggle("picked", b === btn));
        });
      });
    });
  }

  $("gr-submit").addEventListener("click", async () => {
    const r = $("gr-submit-result");
    const answered = Object.keys(answers).length;
    if (answered < 4) { r.textContent = `יש לענות על לפחות 4 שאלות (ענית על ${answered})`; r.className = "validate-result error"; return; }
    r.textContent = "מנתח…"; r.className = "validate-result";
    try {
      const res = await fetch("/api/graphology/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, lang: "he", subjectLabel: $("gr-subject").value.trim() })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "שגיאה");
      r.textContent = "";
      renderReport(j.report);
      toast("הדו\"ח מוכן!");
    } catch (err) { r.textContent = "שגיאה: " + err.message; r.className = "validate-result error"; }
  });

  function renderReport(report) {
    const dimsHtml = (report.dimensions || []).map((d) => `
      <div class="gr-dim">
        <div class="lbl"><span>${esc(d.label)}</span><span class="score">${d.score}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${d.score}%"></div></div>
        <div class="short">${esc(d.short)}</div>
      </div>`).join("");

    const sectionsHtml = Object.values(report.sections || {}).map((s) => `
      <div class="gr-section"><h4>${esc(s.title)}</h4><p>${esc(s.body)}</p></div>`).join("");

    $("gr-report").innerHTML = `
      <div class="gr-disclaimer">⚠️ ${esc(report.disclaimer)}</div>
      <div class="gr-archetype">
        <div class="name">${esc(report.archetype?.name || "")}</div>
        <div class="blurb">${esc(report.archetype?.blurb || "")}</div>
      </div>
      <div class="gr-headline">${esc(report.headline)}</div>
      <div class="gr-actions">
        <button class="btn ghost" id="gr-print">🖨️ הדפסה</button>
      </div>
      <div class="gr-dims">${dimsHtml}</div>
      <div class="gr-sections">${sectionsHtml}</div>
    `;
    $("gr-report").hidden = false;
    $("gr-report").scrollIntoView({ behavior: "smooth", block: "start" });
    $("gr-print").addEventListener("click", () => window.print());
  }

  // ---------- היסטוריה ----------
  async function loadHistory() {
    const el = $("gr-history-list");
    try {
      const { history } = await fetch("/api/graphology/history").then((r) => r.json());
      if (!history || !history.length) { el.innerHTML = `<div class="validate-result">אין עדיין דוחות שמורים</div>`; return; }
      el.innerHTML = history.map((h) => `
        <div class="gr-hist-row" data-id="${esc(h.id)}">
          <div><div class="t">${esc(h.subjectLabel || "ללא שם")}</div><div class="d">${esc(h.headline || "")}</div></div>
          <div class="d">${esc((h.createdAt || "").slice(0, 10))}</div>
        </div>`).join("");
      el.querySelectorAll(".gr-hist-row").forEach((row) => {
        row.addEventListener("click", async () => {
          const entry = await fetch(`/api/graphology/history/${row.dataset.id}`).then((r) => r.json());
          if (entry.report) { showPanel("quiz"); renderReport(entry.report); }
        });
      });
    } catch { el.innerHTML = `<div class="validate-result error">שגיאה בטעינה</div>`; }
  }

  loadQuiz();
})();
