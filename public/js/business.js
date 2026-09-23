/* ניהול עסק — יומן עסקי, חשבוניות, הנהלת חשבונות, לקוחות. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };
  const nis = (n) => (Number(n) || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " ₪";
  const main = $("biz-main");
  let PANEL = "calendar";
  let CLIENTS = [];

  async function api(url, opts) {
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "שגיאה");
    return j;
  }
  async function loadClients() { CLIENTS = (await api("/api/business/clients")).clients || []; return CLIENTS; }
  const clientOptions = (sel) => `<option value="">— לקוח חדש / בלי לקוח קבוע —</option>` +
    CLIENTS.map((c) => `<option value="${esc(c.id)}"${sel === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("");

  // ================= יומן עסקי =================
  let calMonth = new Date().toISOString().slice(0, 7);
  async function renderCalendar() {
    main.innerHTML = `<div class="biz-panel">
      <div class="biz-cal-head">
        <button class="btn ghost" id="cal-prev">‹ קודם</button>
        <b id="cal-title"></b>
        <button class="btn ghost" id="cal-next">הבא ›</button>
      </div>
      <div class="biz-cal-grid" id="cal-grid"></div>
      <div class="biz-cols">
        <div>
          <h3 class="biz-h">קרוב</h3>
          <div id="cal-upcoming" class="biz-list"></div>
        </div>
        <div>
          <h3 class="biz-h">הוספת אירוע</h3>
          <form class="biz-form" id="cal-form">
            <div class="biz-row2">
              <label>תאריך <input type="date" id="cal-date" required></label>
              <label>שעה <input type="time" id="cal-time"></label>
            </div>
            <label>כותרת <input type="text" id="cal-etitle" required placeholder="פגישה עם לקוח, משלוח, דדליין…"></label>
            <div class="biz-row2">
              <label>סוג <select id="cal-type">
                <option value="meeting">פגישה</option><option value="delivery">משלוח</option>
                <option value="deadline">דדליין</option><option value="holiday">חג/שבת</option><option value="other">אחר</option>
              </select></label>
              <label>לקוח <select id="cal-client">${clientOptions()}</select></label>
            </div>
            <label>הערות <textarea id="cal-notes" rows="2"></textarea></label>
            <button class="btn primary" type="submit">הוסף ליומן</button>
          </form>
        </div>
      </div>
    </div>`;
    $("cal-date").value = new Date().toISOString().slice(0, 10);

    await paintMonth();
    $("cal-prev").addEventListener("click", () => { calMonth = shiftMonth(calMonth, -1); paintMonth(); });
    $("cal-next").addEventListener("click", () => { calMonth = shiftMonth(calMonth, 1); paintMonth(); });
    $("cal-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/api/business/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          date: $("cal-date").value, time: $("cal-time").value, title: $("cal-etitle").value.trim(),
          type: $("cal-type").value, clientId: $("cal-client").value || null, notes: $("cal-notes").value.trim()
        }) });
        toast("נוסף ליומן"); $("cal-etitle").value = ""; $("cal-notes").value = "";
        await paintMonth();
      } catch (err) { toast("שגיאה: " + err.message, true); }
    });
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.toISOString().slice(0, 7);
  }
  async function paintMonth() {
    const [y, m] = calMonth.split("-").map(Number);
    $("cal-title").textContent = new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
    let entries = [], upcoming = [];
    try {
      const r = await api(`/api/business/calendar?month=${calMonth}&upcoming=14`);
      entries = r.entries || []; upcoming = r.upcoming || [];
    } catch { /* אין נתונים */ }
    const byDay = {};
    entries.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });

    const firstDow = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    let cells = "";
    for (let i = 0; i < firstDow; i++) cells += `<div class="biz-cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${calMonth}-${String(d).padStart(2, "0")}`;
      const list = byDay[ds] || [];
      cells += `<div class="biz-cal-cell${ds === todayStr ? " today" : ""}${list.length ? " has" : ""}" data-date="${ds}">
        <span class="dn">${d}</span>${list.length ? `<span class="dot">${list.length}</span>` : ""}
      </div>`;
    }
    $("cal-grid").innerHTML = `<div class="biz-cal-dow">${["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="biz-cal-days">${cells}</div>`;
    $("cal-grid").querySelectorAll(".biz-cal-cell[data-date]").forEach((c) => c.addEventListener("click", () => showDay(c.dataset.date, byDay[c.dataset.date] || [])));

    $("cal-upcoming").innerHTML = upcoming.length ? upcoming.map(upcomingRow).join("") : `<div class="biz-empty">אין אירועים קרובים.</div>`;
    wireDelete($("cal-upcoming"), "/api/business/calendar/", paintMonth);
  }
  const TYPE_HE = { meeting: "פגישה", delivery: "משלוח", deadline: "דדליין", holiday: "חג/שבת", other: "אחר" };
  const upcomingRow = (e) => `<div class="biz-row" data-id="${esc(e.id)}">
    <span class="biz-row-date">${esc(fmtDate(e.date))}${e.time ? " " + esc(e.time) : ""}</span>
    <span class="biz-row-main">${esc(e.title)} <small>· ${esc(TYPE_HE[e.type] || e.type)}</small></span>
    <button class="biz-del" title="מחק">✕</button></div>`;
  function fmtDate(d) { try { return new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short" }); } catch { return d; } }
  function showDay(date, list) {
    const html = list.length ? list.map(upcomingRow).join("") : `<div class="biz-empty">אין אירועים ב-${esc(fmtDate(date))}.</div>`;
    const box = document.createElement("div");
    box.className = "biz-daypop";
    box.innerHTML = `<div class="biz-daypop-inner"><button class="biz-daypop-x">✕</button><h3>${esc(fmtDate(date))}</h3>${html}</div>`;
    document.body.appendChild(box);
    box.querySelector(".biz-daypop-x").addEventListener("click", () => box.remove());
    box.addEventListener("click", (e) => { if (e.target === box) box.remove(); });
    wireDelete(box, "/api/business/calendar/", () => { box.remove(); paintMonth(); });
  }
  function wireDelete(root, base, after) {
    root.querySelectorAll(".biz-del").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest("[data-id]").dataset.id;
      if (!confirm("למחוק?")) return;
      try { await api(base + id, { method: "DELETE" }); toast("נמחק"); after && after(); } catch (e) { toast("שגיאה: " + e.message, true); }
    }));
  }

  // ================= חשבוניות =================
  async function renderInvoices() {
    main.innerHTML = `<div class="biz-panel">
      <div class="biz-cols">
        <div>
          <h3 class="biz-h">חשבוניות</h3>
          <div id="inv-list" class="biz-list"></div>
        </div>
        <div>
          <h3 class="biz-h">חשבונית חדשה</h3>
          <form class="biz-form" id="inv-form">
            <div class="biz-row2">
              <label>לקוח <select id="inv-client">${clientOptions()}</select></label>
              <label>שם לקוח חדש <input type="text" id="inv-clientname" placeholder="אם אין ברשימה"></label>
            </div>
            <div class="biz-row2">
              <label>תאריך <input type="date" id="inv-date"></label>
              <label>לתשלום עד <input type="date" id="inv-due"></label>
            </div>
            <div id="inv-items"></div>
            <button type="button" class="btn ghost tiny" id="inv-additem">+ הוסף פריט</button>
            <label>הנחה % <input type="number" id="inv-discount" min="0" max="100" value="0" style="width:5em"></label>
            <label>הערות <textarea id="inv-notes" rows="2"></textarea></label>
            <div class="biz-total" id="inv-total">סה"כ: 0 ₪</div>
            <button class="btn primary" type="submit">צור חשבונית</button>
          </form>
        </div>
      </div>
    </div>`;
    $("inv-date").value = new Date().toISOString().slice(0, 10);
    addItemRow(); addItemRow();

    $("inv-additem").addEventListener("click", () => addItemRow());
    $("inv-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const items = [...document.querySelectorAll("#inv-items .biz-item-row")].map((r) => ({
        desc: r.querySelector(".it-desc").value.trim(),
        qty: parseFloat(r.querySelector(".it-qty").value) || 1,
        price: parseFloat(r.querySelector(".it-price").value) || 0
      })).filter((it) => it.desc);
      if (!items.length) return toast("הוסף לפחות פריט אחד", true);
      try {
        await api("/api/business/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          clientId: $("inv-client").value || null, clientName: $("inv-clientname").value.trim(),
          date: $("inv-date").value, dueDate: $("inv-due").value, items,
          discount: parseFloat($("inv-discount").value) || 0, notes: $("inv-notes").value.trim()
        }) });
        toast("החשבונית נוצרה");
        await renderInvoices();
      } catch (err) { toast("שגיאה: " + err.message, true); }
    });
    document.getElementById("inv-items").addEventListener("input", updateInvTotal);
    $("inv-discount").addEventListener("input", updateInvTotal);
    await loadInvoiceList();
  }
  function addItemRow() {
    const row = document.createElement("div");
    row.className = "biz-item-row";
    row.innerHTML = `<input class="it-desc" type="text" placeholder="תיאור הפריט">
      <input class="it-qty" type="number" min="0" step="1" value="1" placeholder="כמות">
      <input class="it-price" type="number" min="0" step="0.5" value="0" placeholder="מחיר יח'">
      <button type="button" class="biz-del">✕</button>`;
    row.querySelector(".biz-del").addEventListener("click", () => { row.remove(); updateInvTotal(); });
    $("inv-items").appendChild(row);
  }
  function updateInvTotal() {
    const items = [...document.querySelectorAll("#inv-items .biz-item-row")];
    const sub = items.reduce((s, r) => s + (parseFloat(r.querySelector(".it-qty").value) || 0) * (parseFloat(r.querySelector(".it-price").value) || 0), 0);
    const disc = Math.max(0, Math.min(100, parseFloat($("inv-discount")?.value) || 0));
    $("inv-total").textContent = `סה"כ: ${nis(sub * (1 - disc / 100))}`;
  }
  async function loadInvoiceList() {
    const box = $("inv-list");
    try {
      const { invoices } = await api("/api/business/invoices");
      box.innerHTML = invoices.length ? invoices.map((i) => `
        <div class="biz-inv-card" data-id="${esc(i.id)}">
          <div class="biz-inv-top">
            <b>#${esc(i.number)}</b>
            <span class="biz-status ${esc(i.status)}">${i.status === "paid" ? "שולם" : i.status === "sent" ? "נשלח" : "טיוטה"}</span>
          </div>
          <div class="biz-inv-mid">${esc(i.clientName)} · ${esc(fmtDate(i.date))}</div>
          <div class="biz-inv-total">${nis(i.total)}</div>
          <div class="biz-inv-actions">
            <a class="btn ghost tiny" href="/business/invoice/${esc(i.id)}/print" target="_blank">הדפס</a>
            ${i.status !== "paid" ? `<button class="btn ghost tiny biz-pay">סמן שולם</button>` : ""}
            <button class="biz-del" title="מחק">✕</button>
          </div>
        </div>`).join("") : `<div class="biz-empty">אין עדיין חשבוניות.</div>`;
      box.querySelectorAll(".biz-pay").forEach((b) => b.addEventListener("click", async () => {
        const id = b.closest("[data-id]").dataset.id;
        try { await api(`/api/business/invoices/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) }); toast("סומן כשולם ונרשם בהנהלת החשבונות"); loadInvoiceList(); }
        catch (e) { toast("שגיאה: " + e.message, true); }
      }));
      wireDelete(box, "/api/business/invoices/", loadInvoiceList);
    } catch { box.innerHTML = `<div class="biz-empty">שגיאה בטעינה.</div>`; }
  }

  // ================= הנהלת חשבונות =================
  let ledgerMonth = new Date().toISOString().slice(0, 7);
  async function renderLedger() {
    main.innerHTML = `<div class="biz-panel">
      <div class="biz-cal-head">
        <button class="btn ghost" id="led-prev">‹ קודם</button>
        <b id="led-title"></b>
        <button class="btn ghost" id="led-next">הבא ›</button>
      </div>
      <div class="biz-tiles" id="led-tiles"></div>
      <div class="biz-cols">
        <div>
          <h3 class="biz-h">תנועות</h3>
          <div id="led-list" class="biz-list"></div>
        </div>
        <div>
          <h3 class="biz-h">רישום תנועה</h3>
          <form class="biz-form" id="led-form">
            <div class="biz-row2">
              <label>סוג <select id="led-type"><option value="income">הכנסה</option><option value="expense">הוצאה</option></select></label>
              <label>סכום ₪ <input type="number" id="led-amount" min="0" step="0.5" required></label>
            </div>
            <div class="biz-row2">
              <label>תאריך <input type="date" id="led-date"></label>
              <label>קטגוריה <input type="text" id="led-category" placeholder="מכירות, חומרי גלם, שיווק…"></label>
            </div>
            <label>הערה <input type="text" id="led-note"></label>
            <button class="btn primary" type="submit">הוסף</button>
          </form>
        </div>
      </div>
    </div>`;
    $("led-date").value = new Date().toISOString().slice(0, 10);
    await paintLedger();
    $("led-prev").addEventListener("click", () => { ledgerMonth = shiftMonth(ledgerMonth, -1); paintLedger(); });
    $("led-next").addEventListener("click", () => { ledgerMonth = shiftMonth(ledgerMonth, 1); paintLedger(); });
    $("led-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/api/business/ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          type: $("led-type").value, amount: parseFloat($("led-amount").value), date: $("led-date").value,
          category: $("led-category").value.trim(), note: $("led-note").value.trim()
        }) });
        toast("נרשם"); $("led-amount").value = ""; $("led-category").value = ""; $("led-note").value = "";
        await paintLedger();
      } catch (err) { toast("שגיאה: " + err.message, true); }
    });
  }
  async function paintLedger() {
    const [y, m] = ledgerMonth.split("-").map(Number);
    $("led-title").textContent = new Date(y, m - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
    try {
      const { entries, summary } = await api(`/api/business/ledger?month=${ledgerMonth}`);
      $("led-tiles").innerHTML = `
        <div class="biz-tile good"><span class="v">${nis(summary.income)}</span><span class="k">הכנסות</span></div>
        <div class="biz-tile bad"><span class="v">${nis(summary.expense)}</span><span class="k">הוצאות</span></div>
        <div class="biz-tile ${summary.net >= 0 ? "good" : "bad"}"><span class="v">${nis(summary.net)}</span><span class="k">רווח נטו</span></div>`;
      $("led-list").innerHTML = entries.length ? entries.map((l) => `
        <div class="biz-row" data-id="${esc(l.id)}">
          <span class="biz-row-date">${esc(fmtDate(l.date))}</span>
          <span class="biz-row-main ${l.type === "expense" ? "neg" : "pos"}">${l.type === "expense" ? "−" : "+"}${nis(l.amount)} <small>· ${esc(l.category)}${l.note ? " · " + esc(l.note) : ""}</small></span>
          <button class="biz-del" title="מחק">✕</button></div>`).join("") : `<div class="biz-empty">אין תנועות בחודש זה.</div>`;
      wireDelete($("led-list"), "/api/business/ledger/", paintLedger);
    } catch { $("led-list").innerHTML = `<div class="biz-empty">שגיאה בטעינה.</div>`; }
  }

  // ================= לקוחות =================
  async function renderClients() {
    main.innerHTML = `<div class="biz-panel">
      <div class="biz-cols">
        <div>
          <h3 class="biz-h">לקוחות</h3>
          <div id="cli-list" class="biz-list"></div>
        </div>
        <div>
          <h3 class="biz-h">לקוח חדש</h3>
          <form class="biz-form" id="cli-form">
            <label>שם <input type="text" id="cli-name" required></label>
            <div class="biz-row2">
              <label>טלפון <input type="text" id="cli-phone"></label>
              <label>אימייל <input type="email" id="cli-email"></label>
            </div>
            <label>הערות <textarea id="cli-notes" rows="2"></textarea></label>
            <button class="btn primary" type="submit">הוסף לקוח</button>
          </form>
        </div>
      </div>
    </div>`;
    $("cli-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/api/business/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          name: $("cli-name").value.trim(), phone: $("cli-phone").value.trim(), email: $("cli-email").value.trim(), notes: $("cli-notes").value.trim()
        }) });
        toast("הלקוח נוסף"); e.target.reset();
        await loadClients(); paintClientList();
      } catch (err) { toast("שגיאה: " + err.message, true); }
    });
    await loadClients(); paintClientList();
  }
  function paintClientList() {
    const box = $("cli-list");
    box.innerHTML = CLIENTS.length ? CLIENTS.map((c) => `
      <div class="biz-row" data-id="${esc(c.id)}">
        <span class="biz-row-main">${esc(c.name)} <small>${c.phone ? "· " + esc(c.phone) : ""}${c.email ? " · " + esc(c.email) : ""}</small></span>
        <button class="biz-del" title="מחק">✕</button></div>`).join("") : `<div class="biz-empty">אין עדיין לקוחות.</div>`;
    wireDelete(box, "/api/business/clients/", async () => { await loadClients(); paintClientList(); });
  }

  // ================= ניתוב =================
  function paint() {
    if (PANEL === "calendar") renderCalendar();
    else if (PANEL === "invoices") loadClients().then(renderInvoices);
    else if (PANEL === "ledger") renderLedger();
    else if (PANEL === "clients") renderClients();
  }
  $("biz-tabbar").addEventListener("click", (e) => {
    const b = e.target.closest(".biz-tab");
    if (!b) return;
    document.querySelectorAll(".biz-tab").forEach((x) => x.classList.toggle("active", x === b));
    PANEL = b.dataset.panel;
    paint();
  });
  loadClients().then(paint);
})();
