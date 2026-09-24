const toastEl = document.getElementById("toast");
function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.className = "toast"), 3200);
}

function fmtFull(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

let mailItems = [];
let usingPersonalAccount = false;

async function loadMail() {
  const list = document.getElementById("mail-list");
  const summary = document.getElementById("mail-summary");

  // מעדיפים את חשבון המייל האישי של המשתמש המחובר, אם הוגדר
  const acctStatus = await fetch("/api/email-account/status").then((r) => r.json()).catch(() => null);
  if (acctStatus && acctStatus.connected) {
    usingPersonalAccount = true;
    try {
      const data = await fetch("/api/email-account/recent").then((r) => r.json());
      if (!data.messages || !data.messages.length) {
        summary.textContent = "אין עדיין מיילים להצגה";
        list.innerHTML = `<div class="empty-state">אין עדיין מיילים להצגה</div>`;
        return;
      }
      mailItems = data.messages.map((m) => ({ subject: m.subject, sender: m.from, date: m.date, snippet: "" }));
      summary.textContent = `${data.unreadCount} שלא נקראו · מציג ${mailItems.length} מתוך ${data.total} · חשבון אישי: ${acctStatus.email}`;
      renderList(list);
      return;
    } catch (err) {
      summary.textContent = "שגיאה בטעינת התיבה האישית: " + err.message;
      list.innerHTML = `<div class="empty-state">שגיאה בחיבור לתיבה האישית</div>`;
      return;
    }
  }
  usingPersonalAccount = false;

  const data = await fetch("/api/email/status").then((r) => r.json()).catch(() => null);

  if (!data || !data.recentUnread || !data.recentUnread.length) {
    summary.textContent = "אין עדיין מיילים להצגה — אפשר לחבר תיבת מייל אישית למעלה";
    list.innerHTML = `<div class="empty-state">אין עדיין מיילים להצגה</div>`;
    return;
  }

  mailItems = data.recentUnread;
  const sourceLabel = data.source === "outlook" ? "Outlook" : data.source === "n8n" ? "Gmail (n8n)" : "Gmail";
  summary.textContent = `${data.unreadCount} מיילים שלא נקראו · מציג ${mailItems.length} · מקור: ${sourceLabel} · עודכן ${fmtFull(data.updatedAt)}`;
  renderList(list);
}

function renderList(list) {
  list.innerHTML = mailItems.map((m, i) => `
    <div class="mail-item" data-idx="${i}">
      <div class="subject">${m.subject || "(ללא נושא)"}</div>
      <div class="meta"><span>${m.sender || ""}</span><span>${m.date ? new Date(m.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : ""}</span></div>
      <div class="preview">${m.snippet || ""}</div>
    </div>
  `).join("");

  list.querySelectorAll(".mail-item").forEach((el) => {
    el.addEventListener("click", () => openMail(Number(el.dataset.idx)));
  });

  if (mailItems.length) openMail(0);
}

// ---------- חיבור/ניתוק תיבה אישית ----------
async function loadAccountCard() {
  const s = await fetch("/api/email-account/status").then((r) => r.json()).catch(() => ({ connected: false }));
  document.getElementById("mail-account-connected").hidden = !s.connected;
  document.getElementById("mail-connect-form").hidden = !!s.connected;
  if (s.connected) document.getElementById("mail-account-email").textContent = s.email;
}

document.getElementById("mail-connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = document.getElementById("mail-connect-result");
  r.textContent = "מתחבר…"; r.className = "validate-result";
  try {
    const email = document.getElementById("mail-connect-email").value.trim();
    const password = document.getElementById("mail-connect-pass").value;
    const res = await fetch("/api/email-account/connect", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "שגיאה");
    r.textContent = "חובר בהצלחה ✓"; r.className = "validate-result ok";
    document.getElementById("mail-connect-pass").value = "";
    await loadAccountCard();
    await loadMail();
  } catch (err) { r.textContent = "שגיאה: " + err.message; r.className = "validate-result error"; }
});

document.getElementById("btn-mail-disconnect").addEventListener("click", async () => {
  await fetch("/api/email-account/disconnect", { method: "POST" });
  await loadAccountCard();
  await loadMail();
  toast("התיבה נותקה");
});

loadAccountCard();

function openMail(idx) {
  const m = mailItems[idx];
  if (!m) return;

  document.querySelectorAll(".mail-item").forEach((el, i) => el.classList.toggle("active", i === idx));

  const reader = document.getElementById("mail-reader");
  reader.innerHTML = `
    <h2>${m.subject || "(ללא נושא)"}</h2>
    <div class="reader-meta">
      <span>מאת: ${m.sender || "לא ידוע"}</span>
      <span>${fmtFull(m.date)}</span>
    </div>
    <div class="reader-body">${(m.snippet || "אין תצוגה מקדימה זמינה למייל הזה.").replace(/\n/g, "<br>")}</div>
    <div class="reader-note">מוצג כאן תקציר המייל. לפתיחת המייל המלא עם כל התוכן והקבצים המצורפים, יש להיכנס ל-Gmail או ל-Outlook ישירות.</div>
  `;
}

document.getElementById("btn-refresh-mail").addEventListener("click", async () => {
  toast("בודק מייל חדש…");
  await loadMail();
  toast("הרשימה עודכנה");
});

loadMail();
