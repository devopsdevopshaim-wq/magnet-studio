// share.js — כפתור "שתף" גלובלי: שולח את תוכן הלשונית הנוכחית במייל או בוואטסאפ.
// כל עמוד יכול להגדיר window.__shareContent = () => ({ subject, text }) כדי לקבוע מה בדיוק
// נשלח (למשל דוח גרפולוגיה, פסוק תנ"ך, חשבונית). בלי הגדרה — נשלחים כותרת העמוד + הקישור אליו.
// מזריק את עצמו (DOM+CSS) — כל עמוד צריך רק <script src="/js/share.js" defer>.

(function () {
  if (window.__shareWidget) return;
  window.__shareWidget = true;

  if (!document.querySelector('link[href="/css/share.css"]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/css/share.css";
    document.head.appendChild(l);
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function defaultContent() {
    return { subject: document.title || "HKDAILY", text: (document.title ? document.title + "\n" : "") + location.href };
  }
  function getContent() {
    try {
      const c = typeof window.__shareContent === "function" ? window.__shareContent() : window.__shareContent;
      if (c && (c.subject || c.text)) return { subject: c.subject || document.title, text: c.text || "" };
    } catch { /* נופלים לברירת מחדל */ }
    return defaultContent();
  }

  function boot() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "share-fab";
    btn.title = "שתף במייל או בוואטסאפ";
    btn.setAttribute("aria-label", "שתף");
    btn.textContent = "📤";
    document.body.appendChild(btn);

    const backdrop = document.createElement("div");
    backdrop.id = "share-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="share-modal" role="dialog" aria-modal="true">
        <div class="share-head">
          <h3>שיתוף</h3>
          <button type="button" class="share-x" id="share-close" aria-label="סגור">✕</button>
        </div>
        <div class="share-tabs">
          <button type="button" class="share-tab active" data-ch="email">✉️ מייל</button>
          <button type="button" class="share-tab" data-ch="whatsapp">💬 וואטסאפ</button>
        </div>
        <div class="share-field">
          <label for="share-to" id="share-to-label">אל (כתובת מייל)</label>
          <input type="text" id="share-to" dir="ltr" placeholder="name@example.com" />
        </div>
        <div class="share-field" id="share-subject-field">
          <label for="share-subject">נושא</label>
          <input type="text" id="share-subject" />
        </div>
        <div class="share-field">
          <label for="share-text">תוכן</label>
          <textarea id="share-text" rows="6"></textarea>
        </div>
        <div class="share-result" id="share-result"></div>
        <div class="share-actions">
          <button type="button" class="btn ghost" id="share-cancel">ביטול</button>
          <button type="button" class="btn primary" id="share-send">שליחה</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const $ = (id) => document.getElementById(id);
    let channel = "email";

    function openModal() {
      const c = getContent();
      $("share-subject").value = c.subject || "";
      $("share-text").value = c.text || "";
      $("share-result").textContent = "";
      $("share-result").className = "share-result";
      backdrop.hidden = false;
    }
    function closeModal() { backdrop.hidden = true; }

    function setChannel(ch) {
      channel = ch;
      backdrop.querySelectorAll(".share-tab").forEach((t) => t.classList.toggle("active", t.dataset.ch === ch));
      $("share-subject-field").hidden = ch !== "email";
      $("share-to-label").textContent = ch === "email" ? "אל (כתובת מייל)" : "אל (מספר טלפון)";
      $("share-to").placeholder = ch === "email" ? "name@example.com" : "050-1234567";
    }

    btn.addEventListener("click", openModal);
    $("share-close").addEventListener("click", closeModal);
    $("share-cancel").addEventListener("click", closeModal);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    backdrop.querySelectorAll(".share-tab").forEach((t) => t.addEventListener("click", () => setChannel(t.dataset.ch)));

    $("share-send").addEventListener("click", async () => {
      const to = $("share-to").value.trim();
      const text = $("share-text").value.trim();
      const subject = $("share-subject").value.trim();
      const res = $("share-result");
      if (!to) { res.textContent = "צריך למלא נמען"; res.className = "share-result bad"; return; }
      res.textContent = "שולח…"; res.className = "share-result";
      const sendBtn = $("share-send");
      sendBtn.disabled = true;
      try {
        const url = channel === "email" ? "/api/email-account/send" : "/api/whatsapp/send";
        const body = channel === "email" ? { to, subject, text } : { to, text };
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && (j.ok || j.id)) {
          res.textContent = "✓ נשלח בהצלחה";
          res.className = "share-result ok";
          setTimeout(closeModal, 1200);
        } else {
          res.textContent = "✗ " + (j.error || "השליחה נכשלה");
          res.className = "share-result bad";
        }
      } catch (err) {
        res.textContent = "✗ שגיאת רשת: " + err.message;
        res.className = "share-result bad";
      } finally {
        sendBtn.disabled = false;
      }
    });

    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !backdrop.hidden) closeModal(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
