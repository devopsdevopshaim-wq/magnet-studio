/* מצפן פיננסי — בדיקת מצב, תוכנית התנהלות, מבט שוק. הכל מול השרת המקומי. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3000); };
  const nis = (n) => (Math.round(n) || 0).toLocaleString("he-IL") + " ₪";
  const fmtMd = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");

  const FIELDS = ["netIncome", "fixedExpenses", "variableExpenses", "monthlySavings", "cashSavings", "investments", "pension", "expensiveDebt", "expensiveDebtRate", "mortgage", "mortgagePayment", "otherDebtPayment", "dependents", "employment", "goals"];
  const LS = "financeInputs";

  function collect() {
    const d = {};
    FIELDS.forEach((f) => { const el = $(f); if (el && el.value !== "") d[f] = el.value.trim(); });
    return d;
  }
  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(LS) || "{}");
      FIELDS.forEach((f) => { if (d[f] != null && $(f)) $(f).value = d[f]; });
    } catch {}
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(collect())); } catch {} }

  // ---------- טאבים ----------
  document.querySelectorAll(".fin-tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".fin-tab").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll(".fin-panel").forEach((p) => (p.hidden = p.id !== "panel-" + t.dataset.panel));
    if (t.dataset.panel === "market") loadMarket();
  }));

  // ---------- מדדים חיים ----------
  let debounce;
  document.querySelectorAll("#fin-form input, #fin-form select, #fin-form textarea").forEach((el) => {
    el.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => { save(); refreshMetrics(); }, 350); });
  });

  async function refreshMetrics() {
    const d = collect();
    if (!d.netIncome && !d.fixedExpenses) { $("fin-metrics").innerHTML = ""; return; }
    try {
      const { metrics: m } = await fetch("/api/finance/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then((r) => r.json());
      renderMetrics(m);
    } catch {
      // אין שרת — מחשבים את המדדים מקומית בדפדפן
      if (window.PNKS && PNKS.compute && PNKS.compute.financeMetrics) {
        renderMetrics(PNKS.compute.financeMetrics(d));
      }
    }
  }

  function tile(label, value, cls, sub) {
    return `<div class="fin-tile ${cls || ""}"><span class="v">${esc(value)}</span><span class="k">${esc(label)}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ""}</div>`;
  }
  function renderMetrics(m) {
    const cls = (ok, warn) => ok ? "good" : warn ? "warn" : "bad";
    const tiles = [];
    tiles.push(tile("עודף/גירעון חודשי", nis(m.surplus), m.surplus >= 500 ? "good" : m.surplus >= 0 ? "warn" : "bad"));
    if (m.savingsRate != null) tiles.push(tile("שיעור חיסכון", m.savingsRate + "%", cls(m.savingsRate >= 15, m.savingsRate >= 8), "יעד 15–20%"));
    if (m.emergencyMonths != null) tiles.push(tile("קרן חירום", m.emergencyMonths + " חודשים", cls(m.emergencyMonths >= 3, m.emergencyMonths >= 1), "יעד 3–6"));
    if (m.dti != null) tiles.push(tile("חוב מול הכנסה", m.dti + "%", cls(m.dti <= 36, m.dti <= 43)));
    tiles.push(tile("שווי נקי משוער", nis(m.netWorth), m.netWorth >= 0 ? "good" : "warn"));
    if (m.split) tiles.push(tile("50/30/20 בפועל", `${m.split.needs}/${m.split.wants}/${m.split.save}`, "", "צרכים/רצונות/חיסכון"));

    let html = `<h2>המצב במספרים</h2><div class="fin-tiles">${tiles.join("")}</div>`;
    if (m.flags && m.flags.length) {
      html += `<div class="fin-flags">${m.flags.map((f) => `<div class="fin-flag ${esc(f.level)}">${esc(f.text)}</div>`).join("")}</div>`;
    }
    if (m.emergencyTarget) html += `<div class="fin-note">יעד קרן חירום (4 חודשים): ~${nis(m.emergencyTarget)}</div>`;
    $("fin-metrics").innerHTML = html;
  }

  // ---------- תוכנית AI ----------
  $("fin-analyze").addEventListener("click", async () => {
    const d = collect();
    if (!d.netIncome) { toast("מלא לפחות הכנסה נטו", true); return; }
    const btn = $("fin-analyze");
    btn.disabled = true;
    $("fin-plan").className = "fin-plan loading";
    $("fin-plan").innerHTML = '<span class="spin">✦</span> בונה תוכנית לפי המדדים והעקרונות… (עד דקה)';
    try {
      const r = await fetch("/api/finance/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then((x) => x.json());
      if (!r.ok || !r.plan) throw new Error(r.error || "לא התקבלה תוכנית — ודא ש-Ollama פועל או שמוגדר מפתח ספק ענן.");
      renderMetrics(r.metrics);
      $("fin-plan").className = "fin-plan";
      $("fin-plan").innerHTML = `<p>${fmtMd(r.plan)}</p>${r.source ? `<div class="fin-src">נכתב ע"י ${esc(r.source)}</div>` : ""}
        <button class="btn ghost" id="fin-dl">⤓ שמור כטקסט</button>`;
      $("fin-dl").addEventListener("click", () => {
        const blob = new Blob(["תוכנית התנהלות פיננסית\n\n" + r.plan], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "תוכנית-פיננסית.txt"; a.click();
      });
    } catch (e) {
      $("fin-plan").className = "fin-plan bad";
      $("fin-plan").textContent = "שגיאה: " + e.message;
    } finally { btn.disabled = false; }
  });

  // ---------- שוק ההון ----------
  let mktLoaded = false;
  async function loadMarket(force) {
    if (mktLoaded && !force) return;
    try {
      let m, note = "";
      if (window.PNKS && PNKS.get) {
        const r = await PNKS.get("/api/market", { timeout: 12000 });
        if (!r.ok) throw new Error(r.error || "no data");
        m = r.data;
        if (r.stale || r.offline) note = " · " + (r.cachedAt ? PNKS.cachedAtLabel(r.cachedAt) : "עותק שמור, לא מקוון");
      } else {
        m = await fetch("/api/market").then((r) => r.json());
      }
      if (m.error) throw new Error(m.error);
      mktLoaded = true;
      const s = m.summary;
      $("mkt-summary").innerHTML = `
        <div class="fin-mkt-mood ${s.mood === "חיובי" ? "up" : s.mood === "שלילי" ? "down" : ""}">
          <span>מצב שוק: <b>${esc(s.mood)}</b></span>
          <span>מגמה חודשית: <b>${esc(s.trend)}</b></span>
          <span>ממוצע מדדים היום: <b>${s.avgDayPct > 0 ? "+" : ""}${s.avgDayPct}%</b></span>
        </div>
        <div class="fin-note">עודכן ${new Date(m.updatedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}${note}</div>`;

      $("mkt-groups").innerHTML = Object.entries(m.groups).map(([grp, qs]) => `
        <div class="fin-card">
          <h3>${esc(grp)}</h3>
          <div class="fin-quotes">${qs.map(quoteRow).join("")}</div>
        </div>`).join("");
    } catch (e) {
      $("mkt-summary").innerHTML = `<div class="fin-plan bad">שגיאה בטעינת נתוני שוק: ${esc(e.message)}</div>`;
    }
    loadMarketNews();
    loadOutlook();
  }

  async function loadOutlook() {
    const el = $("mkt-outlook");
    if (!el) return;
    try {
      const o = await fetch("/api/market/outlook").then((r) => r.json());
      if (o.error) throw new Error(o.error);
      const rows = (o.board || []).map((b) => {
        const sg = b.signals || {};
        return `<div class="fin-quote">
          <span class="nm">${esc(b.he)}</span>
          <span class="mo">${esc(sg.read || "")}</span>
          <span class="ch ${sg.vsAvgPct >= 0 ? "up" : "down"}">מול ממוצע: ${sg.vsAvgPct > 0 ? "+" : ""}${sg.vsAvgPct}%</span>
          <span class="mo">מיקום בטווח: ${sg.rangePos}%</span>
        </div>`;
      }).join("");
      el.innerHTML =
        (o.commentary ? `<p class="fin-plan js-speak">${esc(o.commentary)}</p>` : "") +
        `<div class="fin-quotes">${rows}</div>` +
        `<p class="fin-note">${esc(o.disclaimer || "")}</p>`;
    } catch (e) {
      el.innerHTML = `<div class="fin-note">קריאת השוק לא זמינה כרגע (${esc(e.message)}).</div>`;
    }
  }

  async function lookupSymbol() {
    const out = $("mkt-sym-out");
    const sym = $("mkt-sym").value.trim();
    if (!sym) return;
    out.innerHTML = `<div class="fin-note">בודק…</div>`;
    try {
      const d = await fetch("/api/market/lookup?symbol=" + encodeURIComponent(sym)).then((r) => r.json());
      if (d.error) throw new Error(d.error);
      const q = d.quote, sg = d.signals || {}, c = d.consensus;
      const up = q.changePct >= 0;
      let cons = `<p class="fin-note">אין קונצנזוס אנליסטים זמין לנייר הזה (שכיח במדדים וקריפטו).</p>`;
      if (c) {
        const b = c.breakdown || {};
        const keyHe = { strong_buy: "קנייה חזקה", buy: "קנייה", hold: "החזקה", sell: "מכירה", strong_sell: "מכירה חזקה", underperform: "תת-ביצוע", outperform: "עודף-ביצוע" }[c.key] || c.key || "—";
        const tgt = c.targetMean ? `<div>יעד מחיר ממוצע של אנליסטים: <b>${Math.round(c.targetMean).toLocaleString("he-IL")}</b> ${esc(q.currency || "")}` +
          (c.current && c.targetMean ? ` (${c.targetMean > c.current ? "+" : ""}${(((c.targetMean / c.current) - 1) * 100).toFixed(0)}% מהמחיר הנוכחי)` : "") + `</div>` : "";
        cons = `<div class="fin-consensus">
          <div>דירוג קונצנזוס מדווח: <b>${esc(keyHe)}</b>${c.analysts ? ` · ${c.analysts} אנליסטים` : ""}</div>
          <div class="fin-cons-bar">
            <span style="flex:${b.strongBuy}" title="קנייה חזקה ${b.strongBuy}"></span>
            <span style="flex:${b.buy}" title="קנייה ${b.buy}"></span>
            <span style="flex:${b.hold}" title="החזקה ${b.hold}"></span>
            <span style="flex:${b.sell}" title="מכירה ${b.sell}"></span>
            <span style="flex:${b.strongSell}" title="מכירה חזקה ${b.strongSell}"></span>
          </div>
          ${tgt}
          <div class="fin-note">${esc(c.source)}</div>
        </div>`;
      }
      out.innerHTML = `
        <div class="fin-card" style="margin-top:10px">
          <div class="fin-quote">
            <span class="nm">${esc(d.symbol)}</span>
            <span class="spk">${sparkline(q.spark, up)}</span>
            <span class="pr">${esc(q.price >= 100 ? Math.round(q.price).toLocaleString("he-IL") : (q.price || 0).toFixed(2))} <small>${esc(q.currency || "")}</small></span>
            <span class="ch ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(q.changePct)}%</span>
          </div>
          <p class="fin-plan">${esc(sg.read || "")} · מול ממוצע חודשי: ${sg.vsAvgPct > 0 ? "+" : ""}${sg.vsAvgPct}% · מיקום בטווח: ${sg.rangePos}%</p>
          ${cons}
          <p class="fin-note">${esc(d.disclaimer)}</p>
        </div>`;
    } catch (e) {
      out.innerHTML = `<div class="fin-note">${esc(e.message)}</div>`;
    }
  }

  function quoteRow(q) {
    const up = q.changePct >= 0;
    const spark = sparkline(q.spark, up);
    const price = q.price >= 100 ? Math.round(q.price).toLocaleString("he-IL") : q.price?.toFixed(2);
    return `<div class="fin-quote">
      <span class="nm">${esc(q.he)}</span>
      <span class="spk">${spark}</span>
      <span class="pr">${esc(price)} <small>${esc(q.currency || "")}</small></span>
      <span class="ch ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(q.changePct)}%</span>
      <span class="mo">חודש: ${q.changeMonthPct > 0 ? "+" : ""}${q.changeMonthPct}%</span>
    </div>`;
  }
  function sparkline(vals, up) {
    if (!vals || vals.length < 2) return "";
    const w = 68, h = 20, mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - (v - mn) / rng * h).toFixed(1)}`).join(" ");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${up ? "var(--sage)" : "var(--danger)"}" stroke-width="1.5"/></svg>`;
  }

  async function loadMarketNews() {
    try {
      const { items } = await fetch("/api/market/news").then((r) => r.json());
      $("mkt-news").innerHTML = (items || []).map((n) => `
        <a class="fin-news-item" ${n.link ? `href="${esc(n.link)}" target="_blank" rel="noopener"` : ""}>
          <span class="src">${esc(n.source)}</span>${esc(n.title)}
        </a>`).join("") || `<div class="fin-note">אין כותרות כרגע.</div>`;
    } catch { $("mkt-news").innerHTML = `<div class="fin-note">כותרות לא זמינות.</div>`; }
  }

  const symGo = $("mkt-sym-go");
  if (symGo) {
    symGo.addEventListener("click", lookupSymbol);
    $("mkt-sym").addEventListener("keydown", (e) => { if (e.key === "Enter") lookupSymbol(); });
  }

  restore();
  refreshMetrics();
})();
