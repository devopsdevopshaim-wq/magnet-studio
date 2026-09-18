// public/js/social.js — לשוניות חכמות לניהול רשתות חברתיות: וואטסאפ, אינסטגרם, פייסבוק, לינקדין.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, isError) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => { t.className = "toast"; }, 3200);
  }

  // ---------- טאבים ----------
  const tabbar = $("soc-tabbar");
  const panels = Array.from(document.querySelectorAll(".soc-panel"));
  function showPanel(name) {
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    tabbar.querySelectorAll(".biz-tab").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    history.replaceState(null, "", "#" + name);
  }
  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest(".biz-tab");
    if (b) showPanel(b.dataset.panel);
  });
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => showPanel(b.dataset.goto)));

  // ---------- וואטסאפ ----------
  let waTimer = null;
  function renderWa(s) {
    const el = $("wa-panel");
    if (!s || !s.available) {
      el.innerHTML = `<div class="validate-result error">מודול הוואטסאפ לא זמין בשרת הזה.</div>`;
      return;
    }
    if (s.status === "ready") {
      el.innerHTML = `
        <div class="soc-meta">מחובר ✅ ${s.info ? esc(s.info.name || "") + " · " + esc(s.info.number || "") : ""}</div>
        <div class="soc-row" style="margin-top:12px;">
          <button class="btn ghost" id="wa-disconnect">ניתוק</button>
        </div>
        <div class="soc-row" style="margin-top:16px;">
          <label class="field" style="flex:1; min-width:180px; margin:0;">למספר (עם קידומת, לדוגמה 0501234567)
            <input type="text" id="wa-to" />
          </label>
          <label class="field" style="flex:2; min-width:240px; margin:0;">הודעה
            <input type="text" id="wa-text" />
          </label>
          <button class="btn primary" id="wa-send">שליחה</button>
        </div>
        <div class="validate-result" id="wa-send-result"></div>`;
      $("wa-disconnect").addEventListener("click", async () => {
        await fetch("/api/whatsapp/disconnect", { method: "POST" });
        pollWa();
      });
      $("wa-send").addEventListener("click", async () => {
        const to = $("wa-to").value.trim(), text = $("wa-text").value.trim();
        const r = $("wa-send-result");
        if (!to || !text) { r.textContent = "צריך מספר וטקסט"; r.className = "validate-result error"; return; }
        try {
          const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, text }) });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "שגיאה");
          r.textContent = "נשלח ✓"; r.className = "validate-result ok";
          $("wa-text").value = "";
        } catch (err) { r.textContent = err.message; r.className = "validate-result error"; }
      });
      return;
    }
    if (s.status === "qr" && s.qr) {
      el.innerHTML = `
        <div class="soc-qr">
          <img src="${s.qr}" alt="קוד QR לחיבור וואטסאפ" />
          <div class="soc-meta">פותחים וואטסאפ בטלפון ← הגדרות ← מכשירים מקושרים ← קישור מכשיר ← סורקים</div>
        </div>`;
      return;
    }
    if (s.status === "connecting" || s.status === "authenticated") {
      el.innerHTML = `<div class="soc-meta">מתחבר… (${esc(s.status)})</div>`;
      return;
    }
    if (s.status === "auth_failure" || s.status === "error") {
      el.innerHTML = `<div class="validate-result error">שגיאה: ${esc(s.error || "לא ידוע")}</div>
        <button class="btn primary" id="wa-connect" style="margin-top:10px;">ניסיון חדש</button>`;
      $("wa-connect").addEventListener("click", waConnect);
      return;
    }
    el.innerHTML = `<button class="btn primary" id="wa-connect">חיבור וואטסאפ</button>`;
    $("wa-connect").addEventListener("click", waConnect);
  }
  async function waConnect() {
    $("wa-panel").innerHTML = `<div class="soc-meta">מתחבר…</div>`;
    await fetch("/api/whatsapp/connect", { method: "POST" });
    pollWa();
  }
  async function pollWa() {
    try {
      const s = await fetch("/api/whatsapp/status").then((r) => r.json());
      renderWa(s);
      clearTimeout(waTimer);
      if (["qr", "connecting", "authenticated"].includes(s.status)) waTimer = setTimeout(pollWa, 3000);
    } catch { /* ignore */ }
  }

  // ---------- אינסטגרם/פייסבוק ----------
  async function loadMeta() {
    const s = await fetch("/api/social/status").then((r) => r.json()).catch(() => null);
    if (!s) return;
    const m = s.meta || {};
    $("meta-status").innerHTML = m.error
      ? `<span style="color:var(--danger)">שגיאה: ${esc(m.error)}</span>`
      : m.facebookConnected
        ? `מחובר לדף "${esc(m.pageName || m.pageId)}" · אינסטגרם: ${m.instagramConnected ? "מחובר ✅" : "לא מקושר"}`
        : "לא מחובר עדיין";
    if (m.pageId) $("meta-pageId").value = m.pageId;
    loadMetaPosts();
  }
  $("btn-meta-save").addEventListener("click", async () => {
    const r = $("meta-result");
    r.textContent = "שומר…"; r.className = "validate-result";
    try {
      const body = { pageId: $("meta-pageId").value.trim(), pageToken: $("meta-token").value.trim() || undefined };
      const res = await fetch("/api/social/meta/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "שגיאה");
      r.textContent = "נשמר ✓"; r.className = "validate-result ok";
      loadMeta();
    } catch (err) { r.textContent = err.message; r.className = "validate-result error"; }
  });
  async function metaPost(kind) {
    const r = $("meta-post-result");
    const message = $("meta-text").value.trim();
    const imageUrl = $("meta-image").value.trim() || undefined;
    r.textContent = "מפרסם…"; r.className = "validate-result";
    try {
      const res = await fetch(`/api/social/meta/post/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "facebook" ? { message, imageUrl } : { caption: message, imageUrl })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "שגיאה");
      r.textContent = "פורסם ✓"; r.className = "validate-result ok";
      loadMetaPosts();
    } catch (err) { r.textContent = err.message; r.className = "validate-result error"; }
  }
  $("btn-post-fb").addEventListener("click", () => metaPost("facebook"));
  $("btn-post-ig").addEventListener("click", () => metaPost("instagram"));
  async function loadMetaPosts() {
    try {
      const { posts } = await fetch("/api/social/meta/posts").then((r) => r.json());
      const el = $("meta-posts");
      if (!posts || !posts.length) { el.innerHTML = `<span class="soc-meta">אין פוסטים להצגה עדיין</span>`; return; }
      el.innerHTML = posts.map((p) => `
        <div class="soc-post">${esc(p.message || "(ללא טקסט)")}
          <div class="meta">👍 ${p.likes} · 💬 ${p.comments} · ${esc((p.createdAt || "").slice(0, 10))}</div>
        </div>`).join("");
    } catch { /* ignore */ }
  }

  // ---------- לינקדין ----------
  $("li-redirect-hint").textContent = location.origin + "/api/social/linkedin/callback";
  async function loadLinkedin() {
    const s = await fetch("/api/social/status").then((r) => r.json()).catch(() => null);
    if (!s) return;
    const li = s.linkedin || {};
    $("li-status").textContent = li.connected ? `מחובר כ-${li.name || "משתמש"} ✅` : (li.appConfigured ? "לא מחובר — יש ללחוץ 'התחברות ללינקדין'" : "יש להגדיר Client ID/Secret קודם");
  }
  $("btn-li-save").addEventListener("click", async () => {
    const r = $("li-config-result");
    r.textContent = "שומר…"; r.className = "validate-result";
    try {
      const body = { clientId: $("li-clientId").value.trim(), clientSecret: $("li-clientSecret").value.trim() || undefined };
      const res = await fetch("/api/social/linkedin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "שגיאה");
      r.textContent = "נשמר ✓"; r.className = "validate-result ok";
      loadLinkedin();
    } catch (err) { r.textContent = err.message; r.className = "validate-result error"; }
  });
  $("btn-li-connect").addEventListener("click", () => { location.href = "/api/social/linkedin/connect"; });
  $("btn-li-disconnect").addEventListener("click", async () => {
    await fetch("/api/social/linkedin/disconnect", { method: "POST" });
    loadLinkedin();
  });
  $("btn-li-post").addEventListener("click", async () => {
    const r = $("li-post-result");
    const text = $("li-text").value.trim();
    if (!text) { r.textContent = "צריך טקסט"; r.className = "validate-result error"; return; }
    r.textContent = "מפרסם…"; r.className = "validate-result";
    try {
      const res = await fetch("/api/social/linkedin/post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "שגיאה");
      r.textContent = "פורסם ✓"; r.className = "validate-result ok";
      $("li-text").value = "";
    } catch (err) { r.textContent = err.message; r.className = "validate-result error"; }
  });

  // ---------- סקירה כללית ----------
  async function loadOverview() {
    try {
      const s = await fetch("/api/social/status").then((r) => r.json());
      const wa = s.whatsapp || {}, m = s.meta || {}, li = s.linkedin || {};
      $("dot-wa").className = "soc-dot" + (wa.status === "ready" ? " on" : wa.status === "qr" ? " warn" : "");
      $("sum-wa").textContent = wa.status === "ready" ? "מחובר" : wa.status === "qr" ? "ממתין לסריקת QR" : "לא מחובר";
      $("dot-fb").className = "soc-dot" + (m.facebookConnected ? " on" : "");
      $("sum-fb").textContent = m.facebookConnected ? `מחובר · ${m.pageName || m.pageId}` : "לא מחובר";
      $("dot-ig").className = "soc-dot" + (m.instagramConnected ? " on" : "");
      $("sum-ig").textContent = m.instagramConnected ? "מחובר" : "לא מקושר";
      $("dot-li").className = "soc-dot" + (li.connected ? " on" : "");
      $("sum-li").textContent = li.connected ? `מחובר כ-${li.name || "משתמש"}` : "לא מחובר";
    } catch { /* ignore */ }
  }

  // ---------- הפעלה ----------
  const qp = new URLSearchParams(location.search);
  if (qp.get("linkedin") === "connected") { toast("לינקדין חובר בהצלחה!"); showPanel("linkedin"); }
  else if (qp.get("linkedin") === "error") { toast("חיבור לינקדין נכשל: " + (qp.get("msg") || ""), true); showPanel("linkedin"); }
  else if (location.hash) { showPanel(location.hash.slice(1)); }

  loadOverview();
  loadMeta();
  loadLinkedin();
  pollWa();
  setInterval(loadOverview, 20000);
})();
