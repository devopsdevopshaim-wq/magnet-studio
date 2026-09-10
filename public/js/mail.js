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

async function loadMail() {
  const data = await fetch("/api/email/status").then((r) => r.json()).catch(() => null);
  const list = document.getElementById("mail-list");
  const summary = document.getElementById("mail-summary");

  if (!data || !data.recentUnread || !data.recentUnread.length) {
    summary.textContent = "אין עדיין מיילים להצגה";
    list.innerHTML = `<div class="empty-state">אין עדיין מיילים להצגה</div>`;
    return;
  }

  mailItems = data.recentUnread;
  const sourceLabel = data.source === "outlook" ? "Outlook" : data.source === "n8n" ? "Gmail (n8n)" : "Gmail";
  summary.textContent = `${data.unreadCount} מיילים שלא נקראו · מציג ${mailItems.length} · מקור: ${sourceLabel} · עודכן ${fmtFull(data.updatedAt)}`;

  list.innerHTML = mailItems.map((m, i) => `
    <div class="mail-item" data-idx="${i}">
      <div class="subject">${m.subject || "(ללא נושא)"}</div>
      <div class="meta"><span>${m.sender || ""}</span><span>${new Date(m.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}</span></div>
      <div class="preview">${m.snippet || ""}</div>
    </div>
  `).join("");

  list.querySelectorAll(".mail-item").forEach((el) => {
    el.addEventListener("click", () => openMail(Number(el.dataset.idx)));
  });

  // פותח את הראשון כברירת מחדל
  if (mailItems.length) openMail(0);
}

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
