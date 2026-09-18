const ICONS = {
  lightroom: `<path d="M24 6l14 8v20l-14 8-14-8V14z" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="24" cy="24" r="7" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="24" cy="24" r="2.4" fill="currentColor"/>`,
  photomate: `<rect x="7" y="7" width="34" height="34" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><rect x="13" y="13" width="22" height="22" rx="1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/>`,
  photoscape: `<path d="M24 8v8M24 32v8M8 24h8M32 24h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="24" r="9" stroke="currentColor" stroke-width="2" fill="none"/>`,
  picasa: `<rect x="8" y="12" width="14" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><rect x="26" y="12" width="14" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><rect x="17" y="26" width="14" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>`,
  _default: `<rect x="9" y="9" width="30" height="30" rx="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 30l9-9 7 7 5-5 9 9" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="19" cy="17" r="3" fill="currentColor"/>`
};

async function checkSetupStatus() {
  const status = await fetch("/api/setup/status").then((r) => r.json()).catch(() => null);
  const nudge = document.getElementById("setup-nudge");
  if (status && !status.configured) nudge.classList.remove("hidden");
}
checkSetupStatus();

const toastEl = document.getElementById("toast");
function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.className = "toast"), 3200);
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const clockEl = document.getElementById("clock");
function tickClock() {
  clockEl.textContent = new Date().toLocaleString("he-IL", {
    weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}
tickClock();
setInterval(tickClock, 30000);

// ---------- App launch tiles ----------

let knownAppKeys = null; // null = first load (no "new app" toasts on initial paint)

async function loadApps() {
  const row = document.getElementById("apps-row");
  const apps = await fetch("/api/apps").then((r) => r.json()).catch(() => null);
  if (!apps) return;

  const currentKeys = new Set(apps.map((a) => a.key));
  if (knownAppKeys) {
    const newOnes = apps.filter((a) => a.auto && !knownAppKeys.has(a.key));
    newOnes.forEach((a) => toast(`תוכנה חדשה התגלתה: ${a.label}`));
  }
  knownAppKeys = currentKeys;

  row.innerHTML = apps.map((a) => `
    <div class="magnet-tile" data-key="${a.key}" tabindex="0" role="button" aria-label="הפעל ${a.label}">
      <span class="rivet"></span>
      ${a.icon
        ? `<img class="icon" src="${a.icon}" alt="" />`
        : `<svg class="icon" viewBox="0 0 48 48">${ICONS[a.key] || ICONS._default}</svg>`}
      <h3>${a.label}</h3>
      <p>${a.description}</p>
      <div class="status ${a.installed ? "ok" : "missing"}">${a.installed ? "מוכן להפעלה" : "לא נמצא במחשב"}</div>
    </div>
  `).join("");

  row.querySelectorAll(".magnet-tile").forEach((tile) => {
    const launch = async () => {
      if (tile.classList.contains("launching")) return;
      tile.classList.add("launching");
      try {
        const res = await fetch("/api/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app: tile.dataset.key })
        }).then((r) => r.json());
        if (res.ok) toast(`${res.label} נפתח`);
        else toast(res.error || "שגיאה בהפעלה", true);
      } catch {
        toast("שגיאת תקשורת עם השרת המקומי", true);
      } finally {
        tile.classList.remove("launching");
      }
    };
    tile.addEventListener("click", launch);
    tile.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); launch(); } });
  });
}

// ---------- Events ----------

let lastEventsSignature = null; // מונע רענון מיותר (וטעינת תמונות מחדש) כשכלום לא השתנה
let knownEventIds = null; // null = טעינה ראשונה (בלי הודעות "אירוע חדש")

async function loadEvents() {
  const grid = document.getElementById("events-grid");
  const sub = document.getElementById("events-sub");
  const events = await fetch("/api/events").then((r) => r.json()).catch(() => null);
  if (!events) return;

  const signature = events.map((e) => `${e.id}:${e.photoCount}:${e.updatedAt}`).join("|");
  if (signature === lastEventsSignature) return; // שום דבר לא השתנה בתיקייה - לא נוגעים ב-DOM
  lastEventsSignature = signature;

  const currentIds = new Set(events.map((e) => e.id));
  if (knownEventIds) {
    const newOnes = events.filter((e) => !knownEventIds.has(e.id));
    newOnes.forEach((e) => toast(`אירוע חדש התגלה: ${e.name}`));
  }
  knownEventIds = currentIds;

  if (!events.length) {
    sub.textContent = "לא נמצאו אירועים";
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">לא נמצאו תיקיות אירועים עם תמונות תחת תיקיית "עיצובים מגנטים"</div>`;
    return;
  }

  sub.textContent = `${events.length} אירועים נמצאו`;
  grid.innerHTML = events.map((e) => `
    <a class="event-card" href="#" data-id="${encodeURIComponent(e.id)}" data-name="${e.name}">
      <div class="thumb" data-thumb></div>
      <div class="info">
        <div class="name">${e.name}</div>
        <div class="meta"><span>${e.photoCount} תמונות</span><span class="tag">${e.source}</span></div>
      </div>
    </a>
  `).join("");

  grid.querySelectorAll(".event-card").forEach((card) => {
    card.addEventListener("click", (ev) => {
      ev.preventDefault();
      openEventModal(decodeURIComponent(card.dataset.id), card.dataset.name);
    });
    loadThumb(card);
  });
}

async function loadThumb(card) {
  const files = await fetch(`/api/events/${card.dataset.id}/files`).then((r) => r.json()).catch(() => []);
  const thumbBox = card.querySelector("[data-thumb]");
  if (files && files[0]) {
    const img = document.createElement("img");
    img.src = `/media/event/${card.dataset.id}?file=${encodeURIComponent(files[0].relPath)}`;
    img.alt = card.dataset.name;
    thumbBox.appendChild(img);
  } else {
    thumbBox.innerHTML = `<span class="placeholder">אין תמונות</span>`;
  }
}

// ---------- Event detail modal ----------

const modal = document.getElementById("event-modal");
document.getElementById("modal-close").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

async function openEventModal(eventId, name) {
  document.getElementById("modal-title").textContent = name;
  const filesBox = document.getElementById("modal-files");
  filesBox.innerHTML = "";
  document.getElementById("modal-sub").textContent = "טוען תמונות…";
  modal.classList.remove("hidden");

  const files = await fetch(`/api/events/${encodeURIComponent(eventId)}/files`).then((r) => r.json()).catch(() => []);
  document.getElementById("modal-sub").textContent = `${files.length} תמונות · לחיצה על תמונה פותחת אותה בעורך המסגרות`;

  filesBox.innerHTML = files.map((f) => `
    <div class="file-tile" data-rel="${encodeURIComponent(f.relPath)}">
      <img src="/media/event/${encodeURIComponent(eventId)}?file=${encodeURIComponent(f.relPath)}" alt="${f.name}" loading="lazy"/>
      <div class="name">${f.name}</div>
    </div>
  `).join("");

  filesBox.querySelectorAll(".file-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const rel = decodeURIComponent(tile.dataset.rel);
      const eventName = document.getElementById("modal-title").textContent;
      const url = `/editor.html?event=${encodeURIComponent(eventId)}&file=${encodeURIComponent(rel)}&eventName=${encodeURIComponent(eventName)}`;
      window.location.href = url;
    });
  });
}

// ---------- System-wide installed software (Start Menu, categorized) ----------

let systemAppsData = null;
let activeCategory = "all";
let lastSystemAppsSignature = null;

async function loadSystemApps() {
  const sub = document.getElementById("system-apps-sub");
  const data = await fetch("/api/system-apps").then((r) => r.json()).catch(() => null);
  if (!data) return;

  const signature = data.categories.map((c) => `${c.key}:${c.apps.map((a) => a.key).join(",")}`).join("|");
  if (signature === lastSystemAppsSignature) return; // כלום לא השתנה - לא נוגעים ב-DOM
  lastSystemAppsSignature = signature;

  systemAppsData = data;
  sub.textContent = data.total
    ? `${data.total} תוכנות נמצאו בתפריט ההתחלה, מסווגות אוטומטית`
    : "לא נמצאו תוכנות נוספות בתפריט ההתחלה";
  renderCategoryChips();
  renderSystemAppGrid();
}

function renderCategoryChips() {
  const row = document.getElementById("category-chips");
  if (!systemAppsData || !systemAppsData.categories.length) { row.innerHTML = ""; return; }

  const chips = [
    { key: "all", label: "הכל", count: systemAppsData.total },
    ...systemAppsData.categories.map((c) => ({ key: c.key, label: c.label, count: c.apps.length }))
  ];

  row.innerHTML = chips.map((c) => `
    <button class="chip ${c.key === activeCategory ? "active" : ""}" data-cat="${c.key}">
      ${c.label}<span class="count">${c.count}</span>
    </button>
  `).join("");

  row.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeCategory = chip.dataset.cat;
      renderCategoryChips();
      renderSystemAppGrid();
    });
  });
}

function renderSystemAppGrid() {
  const grid = document.getElementById("system-app-grid");
  if (!systemAppsData) return;

  const apps = activeCategory === "all"
    ? systemAppsData.categories.flatMap((c) => c.apps.map((a) => ({ ...a, categoryLabel: c.label })))
    : (systemAppsData.categories.find((c) => c.key === activeCategory)?.apps || []).map((a) => ({ ...a }));

  if (!apps.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">אין תוכנות בקטגוריה הזו</div>`;
    return;
  }

  grid.innerHTML = apps.map((a) => `
    <div class="system-app-card" data-key="${a.key}" tabindex="0" role="button" aria-label="הפעל ${a.label}">
      ${a.icon ? `<img src="${a.icon}" alt=""/>` : `<div class="icon-fallback">${a.label.slice(0, 1)}</div>`}
      <div class="name">${a.label}</div>
      <div class="cat-label">${a.categoryLabel || ""}</div>
    </div>
  `).join("");

  grid.querySelectorAll(".system-app-card").forEach((card) => {
    const launch = async () => {
      if (card.classList.contains("launching")) return;
      card.classList.add("launching");
      try {
        const res = await fetch("/api/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app: card.dataset.key })
        }).then((r) => r.json());
        if (res.ok) toast(`${res.label} נפתח`);
        else toast(res.error || "שגיאה בהפעלה", true);
      } catch {
        toast("שגיאת תקשורת עם השרת המקומי", true);
      } finally {
        card.classList.remove("launching");
      }
    };
    card.addEventListener("click", launch);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); launch(); } });
  });
}

// ---------- Side panel: Hebrew calendar (parasha, holidays) ----------

function fmtEventTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso; // תאריך ללא שעה (יום שלם)
  return d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function daysAwayLabel(n) {
  if (n === 0) return "היום";
  if (n === 1) return "מחר";
  return `בעוד ${n} ימים`;
}

async function loadShabbat() {
  const el = document.getElementById("shabbat-mini");
  if (!el) return;
  const s = await fetch("/api/shabbat").then((r) => r.json()).catch(() => null);
  if (!s || !s.available || !s.candleLighting) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = s.isShabbatNow
    ? `<span class="sm-k">שבת שלום</span> · יציאה ${s.havdalah ? s.havdalah.timeStr : "—"}`
    : `<span class="sm-k">כניסת שבת</span> ${s.candleLighting.timeStr} · <span class="sm-k">יציאה</span> ${s.havdalah ? s.havdalah.timeStr : "—"}`;
}

async function loadHebrewCalendar() {
  const data = await fetch("/api/hebrew-calendar/today").then((r) => r.json()).catch(() => null);
  if (!data) return;

  document.getElementById("hebrew-date").textContent = data.hebrewDate;
  document.getElementById("greg-date").textContent = new Date(data.generatedAt).toLocaleDateString("he-IL", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
  });

  const parashaLine = document.getElementById("parasha-line");
  const parashaContentEl = document.getElementById("parasha-content");
  if (data.isFriday && data.parasha) {
    parashaLine.textContent = `פרשת השבוע: ${data.parasha}`;
    parashaLine.style.opacity = "1";
    parashaContentEl.textContent = data.parashaContent || "";
  } else if (data.parasha) {
    parashaLine.textContent = `השבת: ${data.parasha} (יוצג כאן בימי שישי)`;
    parashaLine.style.opacity = "0.6";
    parashaContentEl.textContent = "";
  } else {
    parashaLine.textContent = "";
    parashaContentEl.textContent = "";
  }

  const list = document.getElementById("holiday-list");
  const upcoming = (data.holidays || []).slice(0, 5);
  list.innerHTML = upcoming.length
    ? upcoming.map((h) => `
        <div class="holiday-item ${h.isMajor ? "major" : ""}">
          <span class="title">${h.title}</span>
          <span class="when">${daysAwayLabel(h.daysAway)}</span>
        </div>
      `).join("")
    : `<div class="side-meta">אין מועדים קרובים ב-45 הימים הבאים</div>`;
}

// ---------- Side panel: upcoming calendar events ----------

async function loadCalendarEvents() {
  const data = await fetch("/api/calendar/status").then((r) => r.json()).catch(() => null);
  const updatedEl = document.getElementById("calendar-updated");
  const listEl = document.getElementById("calendar-events");

  if (!data) {
    updatedEl.textContent = "אין עדיין נתוני יומן";
    listEl.innerHTML = "";
    return;
  }

  updatedEl.textContent = `עודכן: ${fmtTime(data.updatedAt)}`;
  listEl.innerHTML = (data.events || []).slice(0, 6).map((ev) => `
    <div class="event-item">
      <span class="title">${ev.summary || "(ללא כותרת)"}</span>
      <span class="when">${fmtEventTime(ev.start)}</span>
    </div>
  `).join("") || `<div class="side-meta">אין אירועים קרובים</div>`;
}

// ---------- Side panel: security alerts ----------

async function loadSecurityAlerts() {
  const data = await fetch("/api/security/alerts").then((r) => r.json()).catch(() => null);
  const statusEl = document.getElementById("security-status");
  const listEl = document.getElementById("security-list");

  if (!data || data.status !== "ok") {
    statusEl.textContent = "לא ניתן לקרוא את יומן האבטחה של Windows (ייתכן שנדרשות הרשאות)";
    listEl.innerHTML = "";
    return;
  }

  if (!data.events.length) {
    statusEl.textContent = "נסרק ב-24 השעות האחרונות · לא נמצאה פעילות חשודה";
    listEl.innerHTML = `<div class="alert-item ok"><div class="title">הכל תקין</div><div class="detail">אין כניסות כושלות, נעילות חשבון או שינויי הרשאה ב-24 השעות האחרונות.</div></div>`;
    return;
  }

  statusEl.textContent = `נמצאו ${data.events.length} אירועי אבטחה ב-24 השעות האחרונות`;
  listEl.innerHTML = data.events.slice(0, 8).map((ev) => `
    <div class="alert-item warn">
      <div class="title">אירוע אבטחה #${ev.id}</div>
      <div class="detail">${(ev.message || "").slice(0, 140)}</div>
      <div class="when">${fmtTime(ev.time)}</div>
    </div>
  `).join("");
}

// ---------- Side panel: system improvement recommendations ----------

async function loadRecommendations() {
  const items = await fetch("/api/recommendations").then((r) => r.json()).catch(() => []);
  const listEl = document.getElementById("recommendations-list");
  listEl.innerHTML = items.map((r) => `
    <div class="alert-item ${r.level}">
      <div class="title">${r.title}</div>
      <div class="detail">${r.detail}</div>
    </div>
  `).join("");
}

// ---------- Side panel: Maton (Gmail/Drive/Calendar/Slack/YouTube gateway) ----------

const MATON_APPS = [
  { key: "google-mail", label: "Gmail" },
  { key: "google-drive", label: "Drive" },
  { key: "google-calendar", label: "יומן" },
  { key: "slack", label: "Slack" },
  { key: "youtube", label: "YouTube" }
];

async function loadMatonStatus() {
  const statusEl = document.getElementById("maton-status");
  try {
    await loadMatonStatusInner();
  } catch (err) {
    // רשת בטחון - כדי שהכרטיס לעולם לא יישאר תקוע על "בודק..." גם אם משהו בלתי צפוי נשבר
    statusEl.textContent = "שגיאה בטעינת מצב Maton";
    console.error("loadMatonStatus failed:", err);
  }
}

async function loadMatonStatusInner() {
  const statusEl = document.getElementById("maton-status");
  const setupEl = document.getElementById("maton-setup");
  const connectRow = document.getElementById("maton-connect-row");
  const data = await fetch("/api/maton/status").then((r) => r.json()).catch(() => null);

  if (!data || !data.configured) {
    statusEl.textContent = "לא מוגדר";
    setupEl.classList.remove("hidden");
    connectRow.classList.add("hidden");
    document.getElementById("maton-summary").innerHTML = "";
    return;
  }
  setupEl.classList.add("hidden");
  connectRow.classList.remove("hidden");

  let connectedApps;
  try {
    const list = Array.isArray(data.connections) ? data.connections : [];
    connectedApps = new Set(list.filter((c) => c.status === "ACTIVE").map((c) => c.app));
  } catch {
    connectedApps = new Set();
  }
  statusEl.textContent = connectedApps.size ? `${connectedApps.size} חשבונות מחוברים` : "אין חשבונות מחוברים עדיין";

  connectRow.innerHTML = MATON_APPS.map((a) => `
    <button class="maton-connect-chip ${connectedApps.has(a.key) ? "connected" : ""}" data-app="${a.key}">
      ${connectedApps.has(a.key) ? "✓ " : "+ "}${a.label}
    </button>
  `).join("");

  connectRow.querySelectorAll(".maton-connect-chip").forEach((btn) => {
    if (btn.classList.contains("connected")) return;
    btn.addEventListener("click", async () => {
      const original = btn.textContent;
      btn.textContent = "מתחבר…";
      try {
        const res = await fetch("/api/maton/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app: btn.dataset.app })
        }).then((r) => r.json());
        if (res.ok && res.url) {
          window.open(res.url, "_blank");
          toast("נפתח חלון אישור - השלימו את ההתחברות שם, ואז רעננו את הדף");
        } else {
          toast(res.error || "שגיאה בחיבור", true);
        }
      } catch {
        toast("שגיאת תקשורת עם השרת המקומי", true);
      } finally {
        btn.textContent = original;
      }
    });
  });

  if (connectedApps.size) loadMatonSummary();
}

let lastMatonSummary = null;

async function loadMatonSummary() {
  const box = document.getElementById("maton-summary");
  const data = await fetch("/api/maton/summary").then((r) => r.json()).catch(() => null);
  if (!data || !data.configured) { box.innerHTML = ""; return; }
  lastMatonSummary = data;

  const rows = [
    data.gmail && { key: "gmail", title: "Gmail", detail: `${data.gmail.count ?? "—"} מיילים שלא נקראו` },
    data.drive && { key: "drive", title: "Drive", detail: `${data.drive.count ?? "—"} קבצים אחרונים` },
    data.calendar && { key: "calendar", title: "יומן", detail: `${data.calendar.count ?? "—"} אירועים קרובים` },
    data.slack && { key: "slack", title: "Slack", detail: `${data.slack.count ?? "—"} ערוצים` },
    data.youtube && { key: "youtube", title: "YouTube", detail: `${data.youtube.count ?? "—"} ערוצים במעקב` }
  ].filter(Boolean);

  box.innerHTML = rows.map((r) => `
    <div class="alert-item info maton-row" data-key="${r.key}" style="cursor:pointer;">
      <div class="title">${r.title} ›</div>
      <div class="detail">${r.detail}</div>
    </div>
  `).join("")
    || (data.errors?.length ? `<div class="alert-item warn"><div class="title">שגיאות בשליפת נתונים</div><div class="detail">${data.errors.join(" · ")}</div></div>` : "");

  box.querySelectorAll(".maton-row").forEach((row) => {
    row.addEventListener("click", () => openMatonModal(row.dataset.key));
  });
}

const MATON_LABELS = { gmail: "Gmail", drive: "Drive", calendar: "יומן", slack: "Slack", youtube: "YouTube" };

function openMatonModal(key) {
  const data = lastMatonSummary?.[key];
  const modal = document.getElementById("maton-modal");
  document.getElementById("maton-modal-title").textContent = MATON_LABELS[key] || key;
  const list = document.getElementById("maton-modal-list");

  if (!data || !data.items?.length) {
    list.innerHTML = `<div class="empty-state">אין פריטים להצגה</div>`;
  } else {
    list.innerHTML = data.items.map((item) => `
      <a class="maton-item-row" href="${item.link || "#"}" target="_blank" rel="noopener" style="${item.link ? "" : "pointer-events:none; opacity:0.6;"}">
        <div class="title">${item.title || "(ללא כותרת)"}</div>
        <div class="sub">${item.sub || ""}</div>
      </a>
    `).join("");
  }
  modal.classList.remove("hidden");
}

document.getElementById("maton-modal-close")?.addEventListener("click", () => document.getElementById("maton-modal").classList.add("hidden"));
document.getElementById("maton-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "maton-modal") document.getElementById("maton-modal").classList.add("hidden");
});

// ---------- Side panel: system status ----------

function setGauge(fillId, textId, percent, text, warnAt) {
  const fill = document.getElementById(fillId);
  const label = document.getElementById(textId);
  if (percent == null) { label.textContent = "לא זמין"; return; }
  fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  fill.classList.toggle("warn", warnAt != null && percent >= warnAt);
  label.textContent = text;
}

async function loadSystemStatus() {
  const data = await fetch("/api/system/status").then((r) => r.json()).catch(() => null);
  if (!data) return;

  setGauge("mem-fill", "mem-text", data.memory.percent, `${data.memory.usedGB} / ${data.memory.totalGB} GB`, 85);
  if (data.disk) {
    setGauge("disk-fill", "disk-text", data.disk.percent, `${data.disk.freeGB} GB פנוי`, 90);
  } else {
    setGauge("disk-fill", "disk-text", null, "");
  }
  setGauge("cpu-fill", "cpu-text", data.cpuPercent, data.cpuPercent != null ? `${data.cpuPercent}%` : "לא זמין", 85);

  const hours = data.uptimeHours;
  const uptimeText = hours < 24 ? `המחשב פעיל ${hours} שעות` : `המחשב פעיל ${(hours / 24).toFixed(1)} ימים`;
  document.getElementById("uptime-text").textContent = uptimeText;
}

// ---------- Side panel: email status ----------

async function loadEmailStatus() {
  const data = await fetch("/api/email/status").then((r) => r.json()).catch(() => null);
  const countEl = document.getElementById("email-count");
  const updatedEl = document.getElementById("email-updated");
  const listEl = document.getElementById("email-list");
  const bdEl = document.getElementById("email-breakdown");

  if (!data) {
    countEl.textContent = "—";
    updatedEl.textContent = "אין עדיין נתוני מייל";
    listEl.innerHTML = "";
    if (bdEl) bdEl.innerHTML = "";
    return;
  }

  const job = data.jobRelatedCount || 0;
  countEl.innerHTML = `${data.unreadCount ?? "—"} <span class="email-count-sub">לא נקראו</span>` +
    (job ? ` <span class="email-count-job">· ${job} חיפוש עבודה</span>` : "");
  updatedEl.textContent = `עודכן: ${fmtTime(data.updatedAt)}`;

  if (bdEl) {
    const fields = Object.entries(data.byField || {}).sort((a, b) => b[1] - a[1]);
    bdEl.innerHTML = fields.length
      ? `<div class="email-fields">${fields.map(([f, n]) => `<span class="email-field-tag">${f} · ${n}</span>`).join("")}</div>`
      : "";
  }

  listEl.innerHTML = (data.recentUnread || []).slice(0, 6).map((m) => `
    <div class="email-item${m.jobRelated ? " job" : ""}">
      <div class="subject">${m.jobRelated ? "💼 " : ""}${m.subject || "(ללא נושא)"}</div>
      <div class="sender">${m.sender || ""}${m.field ? " · " + m.field : ""}</div>
    </div>
  `).join("");
}

// פולינג — מרגיש חי בלי רענון ידני
setInterval(() => { loadEmailStatus().catch(() => {}); }, 60000);

document.getElementById("btn-refresh-outlook").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "בודק מול Outlook…";
  try {
    const res = await fetch("/api/outlook/scan-now", { method: "POST" }).then((r) => r.json());
    if (res.ok) {
      toast("מצב המיילים עודכן מ-Outlook");
      await loadEmailStatus();
    } else {
      toast(res.error || "לא הצלחתי להתחבר ל-Outlook", true);
    }
  } catch {
    toast("שגיאת תקשורת עם השרת המקומי", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "רענון מ-Outlook";
  }
});

// ---------- n8n panel ----------

async function loadScan() {
  const data = await fetch("/api/n8n/scan").then((r) => r.json()).catch(() => null);
  if (!data) return;
  const stats = document.querySelectorAll("#scan-stats .stat .num");
  stats[0].textContent = data.eventCount;
  stats[1].textContent = data.totalPhotos;
  stats[2].textContent = data.frameCount;
}

async function loadInbox() {
  const items = await fetch("/api/n8n/inbox").then((r) => r.json()).catch(() => []);
  const box = document.getElementById("inbox");
  if (!items.length) {
    box.innerHTML = `<div class="empty-state" style="border:none; padding:14px 0;">אין עדיין הודעות מ-n8n</div>`;
    return;
  }
  box.innerHTML = items.map((i) => `
    <div class="inbox-item">
      <span>${i.message || i.title || JSON.stringify(i).slice(0, 80)}</span>
      <span class="time">${fmtTime(i.receivedAt)}</span>
    </div>
  `).join("");
}

document.getElementById("btn-scan").addEventListener("click", async () => {
  await fetch("/api/n8n/scan");
  await loadScan();
  await loadEvents();
  toast("הסריקה עודכנה");
});

document.getElementById("btn-endpoint").addEventListener("click", () => {
  const url = `${window.location.origin}/api/n8n/scan`;
  navigator.clipboard?.writeText(url).catch(() => {});
  toast(`הכתובת הועתקה: ${url}`);
});

// ---------- n8n מקומי (Docker) ----------

async function loadN8nLocal() {
  const el = document.getElementById("n8n-local-status");
  if (!el) return;
  try {
    const s = await fetch("/api/n8n/local-status").then((r) => r.json());
    const parts = [];
    parts.push(`n8n ראשי (5678): ${s.n8n5678 ? "✓ פעיל" : "✗ כבוי"}`);
    parts.push(`magnet-studio-n8n (5680): ${s.n8n5680 ? "✓ פעיל" : "✗ כבוי"}`);
    if (!s.dockerAvailable) parts.push("· Docker Desktop לא פעיל");
    el.textContent = parts.join("  ");
  } catch {
    el.textContent = "לא הצלחתי לבדוק את n8n המקומי";
  }
}

document.getElementById("btn-n8n-open")?.addEventListener("click", () => window.open("http://localhost:5680", "_blank"));
document.getElementById("btn-openclaw-open")?.addEventListener("click", () => window.open("http://127.0.0.1:18789/", "_blank"));

document.getElementById("btn-n8n-up")?.addEventListener("click", async (e) => {
  e.target.disabled = true;
  e.target.textContent = "מפעיל…";
  const r = await fetch("/api/n8n/local-up", { method: "POST" }).then((r) => r.json()).catch(() => ({ ok: false }));
  e.target.disabled = false;
  e.target.textContent = "הפעל n8n";
  toast(r.ok ? "n8n המקומי הופעל" : r.error || "לא הצלחתי (Docker Desktop פתוח?)", !r.ok);
  setTimeout(loadN8nLocal, 4000);
});

loadN8nLocal();
setInterval(loadN8nLocal, 60000);

loadApps();
loadEvents();
loadSystemApps();
loadSystemStatus();
loadEmailStatus();
loadHebrewCalendar();
loadShabbat();
loadCalendarEvents();
loadSecurityAlerts();
loadRecommendations();
loadMatonStatus();
loadPrintersDash();
loadScan();
loadInbox();

async function loadPrintersDash() {
  const el = document.getElementById("printers-list-dash");
  const printers = await fetch("/api/printers").then((r) => r.json()).catch(() => []);
  el.textContent = printers.length ? printers.join(" · ") : "לא זוהו מדפסות מותקנות";
}

// ---------- לוטו · תהילים · שוק (כרטיסי סייד) ----------
const ballHtml = (n, strong) => `<span class="lball${strong ? " strong" : ""}">${n}</span>`;
function lineHtml(nums, strong) {
  return `<span class="lotto-line">${(nums || []).map((n) => ballHtml(n)).join("")}<span class="lplus">+</span>${ballHtml(strong, true)}</span>`;
}
async function loadLotto() {
  const card = document.getElementById("lotto-card");
  if (!card) return;
  const l = await fetch("/api/lotto").then((r) => r.json()).catch(() => null);
  if (!l || !l.available) { document.getElementById("lotto-next").textContent = "נתוני פיס לא זמינים כרגע"; return; }
  const nd = l.nextDraw || {};
  document.getElementById("lotto-next").textContent =
    `הגרלה ${nd.id || ""} · ${nd.dateHe || ""}${nd.daysAway != null ? ` (בעוד ${nd.daysAway} ימים)` : ""}`;
  if (l.primary) {
    document.getElementById("lotto-primary").innerHTML =
      `<div class="lotto-label">הטור המדויק (6+נוסף)</div>${lineHtml(l.primary.nums, l.primary.strong)}`;
  }
  const sb = l.systemBets || {};
  document.getElementById("lotto-systems").innerHTML = ["8", "9", "10"].filter((k) => sb[k]).map((k) =>
    `<div class="lotto-sysrow"><span class="lotto-label">${k}+נוסף <small>(${sb[k].combos} טורים)</small></span>${lineHtml(sb[k].nums, sb[k].strong)}</div>`
  ).join("");
}
async function loadTehillimSide() {
  const el = document.getElementById("tehillim-line");
  if (!el) return;
  const t = await fetch("/api/tehillim").then((r) => r.json()).catch(() => null);
  if (!t) { el.textContent = "לא זמין כרגע"; return; }
  el.innerHTML = `<b>${(t.chapters || []).join(", ")}</b><br><span style="opacity:.75">${t.hebrewDate || ""}</span>`;
}
async function loadMarketSide() {
  const card = document.getElementById("market-card");
  if (!card) return;
  const m = await fetch("/api/market").then((r) => r.json()).catch(() => null);
  if (!m || m.error) { document.getElementById("market-mood").textContent = "נתוני שוק לא זמינים"; return; }
  const s = m.summary;
  document.getElementById("market-mood").innerHTML =
    `מצב: <b class="${s.mood === "חיובי" ? "up" : s.mood === "שלילי" ? "down" : ""}">${s.mood}</b> · מגמה ${s.trend}`;
  const pick = (m.quotes || []).filter((q) => ["S&P 500", "ת״א 35", "ביטקוין", "דולר/שקל"].includes(q.he));
  document.getElementById("market-mini").innerHTML = pick.map((q) => {
    const up = q.changePct >= 0;
    return `<div class="mkt-mini-row"><span>${q.he}</span><span class="${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(q.changePct)}%</span></div>`;
  }).join("");
}

// ---------- שם תצוגה נייד (מתאים למחשב) ----------
async function applyProfile() {
  try {
    const p = await fetch("/api/profile").then((r) => r.json());
    if (p && p.displayName && p.displayName !== "חיים קריספין") {
      document.querySelectorAll('[data-name]').forEach((el) => (el.textContent = p.displayName));
      document.title = document.title.replace("חיים קריספין", p.displayName);
    }
    if (p && p.needsSetup) {
      const n = document.getElementById("setup-nudge");
      if (n) { n.classList.remove("hidden"); }
    }
  } catch {}
}

async function loadSocialSide() {
  const el = document.getElementById("social-summary");
  if (!el) return;
  try {
    const s = await fetch("/api/social/status").then((r) => r.json());
    const on = [];
    if (s.whatsapp && s.whatsapp.status === "ready") on.push("וואטסאפ");
    if (s.meta && s.meta.facebookConnected) on.push("פייסבוק");
    if (s.meta && s.meta.instagramConnected) on.push("אינסטגרם");
    if (s.linkedin && s.linkedin.connected) on.push("לינקדין");
    el.textContent = on.length ? `מחובר: ${on.join(" · ")}` : "אין חיבורים פעילים עדיין";
  } catch { el.textContent = "לא זמין כרגע"; }
}

loadLotto();
loadTehillimSide();
loadMarketSide();
loadSocialSide();
applyProfile();
setInterval(loadLotto, 30 * 60000);
setInterval(loadMarketSide, 3 * 60000);

// ניטור חי - מזהה אוטומטית תוכנות/אירועים חדשים שנוספים לתיקייה בלי לרענן את הדף
setInterval(loadApps, 25000);
setInterval(loadEvents, 25000);
setInterval(loadSystemApps, 40000);
setInterval(loadSystemStatus, 6000);
setInterval(loadEmailStatus, 60000);
setInterval(loadHebrewCalendar, 5 * 60000);
setInterval(loadCalendarEvents, 60000);
setInterval(loadSecurityAlerts, 5 * 60000);
setInterval(loadRecommendations, 5 * 60000);
setInterval(loadMatonStatus, 60000);
setInterval(loadScan, 25000);
setInterval(loadInbox, 20000);
