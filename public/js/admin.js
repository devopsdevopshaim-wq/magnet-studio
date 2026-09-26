// public/js/admin.js — פאנל ניהול משתמשים: רשימת חשבונות, שינוי סטטוס, מחיקה, פירוט שימוש.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
  const toast = (m, bad) => { const t = $("toast"); if (!t) return; t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };

  const STATUS_LABEL = { active: "פעיל", suspended: "מושעה", trial: "ניסיון" };

  // צבע דטרמיניסטי מכתובת המייל — כדי שלכל חשבון יהיה אווטאר עקבי בלי לשמור שום דבר
  function colorFor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 40%))`;
  }

  let ACCOUNTS = [];

  async function boot() {
    let status;
    try { status = await fetch("/api/auth/status").then((r) => r.json()); }
    catch { status = null; }

    if (!status || !status.user || !status.user.is_admin) {
      $("ad2-denied").hidden = false;
      return;
    }
    $("ad2-content").hidden = false;
    await loadAccounts();
  }

  async function loadAccounts() {
    $("ad2-list").innerHTML = `<div class="ad2-loading">טוען חשבונות…</div>`;
    try {
      const { users } = await fetch("/api/admin/users").then((r) => r.json());
      ACCOUNTS = users || [];
      renderStats();
      renderList(ACCOUNTS);
    } catch (err) {
      $("ad2-list").innerHTML = `<div class="ad2-empty">שגיאה בטעינת חשבונות: ${esc(err.message)}</div>`;
    }
  }

  function renderStats() {
    const total = ACCOUNTS.length;
    const active = ACCOUNTS.filter((u) => u.account_status === "active").length;
    const suspended = ACCOUNTS.filter((u) => u.account_status === "suspended").length;
    const admins = ACCOUNTS.filter((u) => u.is_admin).length;
    $("ad2-stats").innerHTML = [
      ["סה\"כ חשבונות", total],
      ["פעילים", active],
      ["מושעים", suspended],
      ["מנהלים", admins]
    ].map(([l, n]) => `<div class="ad2-stat"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`).join("");
  }

  function renderList(list) {
    $("ad2-count").textContent = `${list.length} חשבונות`;
    if (!list.length) { $("ad2-list").innerHTML = `<div class="ad2-empty">לא נמצאו חשבונות תואמים.</div>`; return; }

    $("ad2-list").innerHTML = list.map((u) => {
      const initial = (u.name || u.email || "?").trim().charAt(0).toUpperCase();
      const created = (u.created_at || "").slice(0, 10);
      const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
      return `
      <div class="ad2-row" data-id="${esc(u.id)}">
        <div class="ad2-row-head">
          <div class="ad2-avatar" style="background:${colorFor(u.email || u.id)}">${esc(initial)}</div>
          <div class="ad2-identity">
            <div class="name">${esc(u.name)}
              ${u.is_admin ? '<span class="ad2-badge admin">מנהל</span>' : ""}
              <span class="ad2-badge ${esc(u.account_status)}">${esc(STATUS_LABEL[u.account_status] || u.account_status)}</span>
            </div>
            <div class="email">${esc(u.email)}</div>
            <div class="ad2-meta"><span>נרשם: ${esc(created)}</span><span>כניסה אחרונה: ${esc(lastLogin)}</span></div>
          </div>
          ${u.is_admin ? "" : `
          <div class="ad2-row-actions">
            <select class="ad2-status-select" data-id="${esc(u.id)}">
              <option value="active" ${u.account_status === "active" ? "selected" : ""}>פעיל</option>
              <option value="suspended" ${u.account_status === "suspended" ? "selected" : ""}>מושעה</option>
              <option value="trial" ${u.account_status === "trial" ? "selected" : ""}>ניסיון</option>
            </select>
            <button class="btn danger sm" data-act="delete" data-id="${esc(u.id)}" data-name="${esc(u.name)}">מחיקה</button>
          </div>`}
        </div>
        <button class="ad2-usage-toggle" data-act="usage" data-id="${esc(u.id)}">📊 הצג שימוש בלשוניות</button>
        <div class="ad2-usage" id="usage-${esc(u.id)}"></div>
      </div>`;
    }).join("");

    wireRowEvents();
  }

  function wireRowEvents() {
    $("ad2-list").querySelectorAll(".ad2-status-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const id = sel.dataset.id;
        try {
          await fetch(`/api/admin/users/${encodeURIComponent(id)}/status`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: sel.value })
          }).then((r) => { if (!r.ok) throw new Error("שגיאה"); return r.json(); });
          toast("הסטטוס עודכן");
          const acc = ACCOUNTS.find((a) => a.id === id);
          if (acc) acc.account_status = sel.value;
          const row = sel.closest(".ad2-row");
          const badge = row.querySelector(".ad2-badge:not(.admin)");
          if (badge) { badge.className = "ad2-badge " + sel.value; badge.textContent = STATUS_LABEL[sel.value] || sel.value; }
          renderStats();
        } catch { toast("עדכון הסטטוס נכשל", true); }
      });
    });

    $("ad2-list").querySelectorAll('[data-act="usage"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const box = $("usage-" + id);
        const showing = box.classList.contains("show");
        if (showing) { box.classList.remove("show"); btn.textContent = "📊 הצג שימוש בלשוניות"; return; }
        btn.textContent = "📊 מסתיר…";
        try {
          const s = await fetch(`/api/admin/users/${encodeURIComponent(id)}/usage`).then((r) => r.json());
          if (!s.tabs || !s.tabs.length) {
            box.innerHTML = `<div class="ad2-usage-empty">עדיין אין נתוני שימוש לחשבון הזה.</div>`;
          } else {
            box.innerHTML =
              `<div class="ad2-usage-tabs">` + s.tabs.map((t) => `<span class="ad2-usage-tab">${esc(t.tab)} <b>${t.visits}</b></span>`).join("") + `</div>` +
              `<div class="ad2-usage-last">סה"כ ${s.totalEvents} טעינות עמוד · פעילות אחרונה: ${s.lastActivity ? new Date(s.lastActivity).toLocaleString("he-IL") : "—"}</div>`;
          }
          box.classList.add("show");
          btn.textContent = "📊 הסתר שימוש בלשוניות";
        } catch { toast("טעינת נתוני השימוש נכשלה", true); btn.textContent = "📊 הצג שימוש בלשוניות"; }
      });
    });

    $("ad2-list").querySelectorAll('[data-act="delete"]').forEach((btn) => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.id, btn.dataset.name));
    });
  }

  // ---------- מחיקה ----------
  let pendingDeleteId = null;
  function openDeleteModal(id, name) {
    pendingDeleteId = id;
    $("ad2-del-text").textContent = `למחוק לצמיתות את החשבון של "${name}"?`;
    $("ad2-del-modal").hidden = false;
  }
  $("ad2-del-cancel").addEventListener("click", () => { $("ad2-del-modal").hidden = true; pendingDeleteId = null; });
  $("ad2-del-modal").addEventListener("click", (e) => { if (e.target === $("ad2-del-modal")) { $("ad2-del-modal").hidden = true; pendingDeleteId = null; } });
  $("ad2-del-confirm").addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    const btn = $("ad2-del-confirm");
    btn.disabled = true; btn.textContent = "מוחק…";
    try {
      const r = await fetch(`/api/admin/users/${encodeURIComponent(pendingDeleteId)}`, { method: "DELETE" }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      toast("החשבון נמחק");
      $("ad2-del-modal").hidden = true;
      await loadAccounts();
    } catch (err) { toast(err.message || "המחיקה נכשלה", true); }
    finally { btn.disabled = false; btn.textContent = "מחיקה לצמיתות"; pendingDeleteId = null; }
  });

  // ---------- חיפוש ----------
  $("ad2-search").addEventListener("input", () => {
    const q = $("ad2-search").value.trim().toLowerCase();
    if (!q) return renderList(ACCOUNTS);
    renderList(ACCOUNTS.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)));
  });

  $("ad2-refresh").addEventListener("click", () => { toast("מרענן…"); loadAccounts(); });

  boot();
})();
