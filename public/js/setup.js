const toastEl = document.getElementById("toast");
function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.className = "toast"), 3200);
}

const ICONS_FALLBACK = (label) => (label || "?").slice(0, 1).toUpperCase();

let selectedApps = new Map(); // key -> {key,label,description,exe,icon}
let currentStatus = null;

async function loadStatus() {
  currentStatus = await fetch("/api/setup/status").then((r) => r.json()).catch(() => null);
  const banner = document.getElementById("status-banner");
  if (!currentStatus) return;

  if (currentStatus.configured) {
    banner.className = "setup-banner ok";
    banner.textContent = `המערכת כבר מוגדרת במחשב הזה${currentStatus.magnetRoot ? " · תיקיית עיצובים: " + currentStatus.magnetRoot : " · בלי תיקיית עיצובים"} · ${currentStatus.quickLaunchApps.length} תוכנות מהירות נבחרו. אפשר לשנות ולשמור מחדש בכל עת.`;
  } else {
    banner.className = "setup-banner pending";
    banner.textContent = "המערכת עדיין לא הוגדרה במחשב הזה - השלימו את שני השלבים למטה ולחצו שמירה.";
  }

  if (currentStatus.magnetRoot) {
    document.getElementById("magnet-root-input").value = currentStatus.magnetRoot;
  } else {
    document.getElementById("skip-folder-checkbox").checked = true;
    document.getElementById("magnet-root-input").disabled = true;
  }

  (currentStatus.quickLaunchApps || []).forEach((a) => selectedApps.set(a.key, a));
}

document.getElementById("skip-folder-checkbox").addEventListener("change", (e) => {
  document.getElementById("magnet-root-input").disabled = e.target.checked;
  document.getElementById("validate-result").textContent = "";
});

document.getElementById("btn-validate-folder").addEventListener("click", async () => {
  const p = document.getElementById("magnet-root-input").value.trim();
  const result = document.getElementById("validate-result");
  if (!p) { result.textContent = "נא להזין נתיב תחילה"; result.className = "validate-result error"; return; }
  const res = await fetch(`/api/setup/validate-folder?path=${encodeURIComponent(p)}`).then((r) => r.json()).catch(() => null);
  if (res && res.ok) {
    result.textContent = `✓ התיקייה נמצאה (${res.entryCount} פריטים בתוכה)`;
    result.className = "validate-result ok";
  } else {
    result.textContent = res?.error || "שגיאה בבדיקת התיקייה";
    result.className = "validate-result error";
  }
});

async function loadInstalledApps() {
  const sub = document.getElementById("apps-scan-sub");
  const grid = document.getElementById("setup-app-grid");
  const data = await fetch("/api/system-apps").then((r) => r.json()).catch(() => null);
  if (!data || !data.categories.length) {
    sub.textContent = "לא נמצאו תוכנות מותקנות";
    return;
  }
  sub.textContent = `${data.total} תוכנות נמצאו - בחרו עד כמה שתרצו להצמיד להפעלה מהירה`;

  const allApps = data.categories.flatMap((c) => c.apps);
  grid.innerHTML = allApps.map((a) => `
    <div class="setup-app-card ${selectedApps.has(a.key) ? "selected" : ""}" data-key="${a.key}">
      <span class="checkmark">✓</span>
      ${a.icon ? `<img src="${a.icon}" alt=""/>` : `<div class="icon-fallback">${ICONS_FALLBACK(a.label)}</div>`}
      <div class="name">${a.label}</div>
    </div>
  `).join("");

  grid.querySelectorAll(".setup-app-card").forEach((card) => {
    card.addEventListener("click", () => {
      const key = card.dataset.key;
      const appData = allApps.find((a) => a.key === key);
      if (selectedApps.has(key)) {
        selectedApps.delete(key);
        card.classList.remove("selected");
      } else {
        selectedApps.set(key, { key: appData.key, label: appData.label, description: appData.categoryLabel || "", exe: appData.exe });
        card.classList.add("selected");
      }
    });
  });
}

document.getElementById("btn-save-setup").addEventListener("click", async () => {
  const skip = document.getElementById("skip-folder-checkbox").checked;
  const magnetRoot = skip ? null : document.getElementById("magnet-root-input").value.trim();

  const btn = document.getElementById("btn-save-setup");
  btn.disabled = true;
  btn.textContent = "שומר…";

  try {
    const res = await fetch("/api/setup/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magnetRoot, quickLaunchApps: [...selectedApps.values()] })
    }).then((r) => r.json());

    const result = document.getElementById("save-result");
    if (res.ok) {
      result.className = "save-result ok";
      result.textContent = "✓ נשמר בהצלחה! כדי שהשינויים ייכנסו לתוקף, סגרו את חלון השרת (השחור, אם פתוח) והפעילו מחדש דרך \"הפעלת הסטודיו.bat\", או הריצו שוב npm start.";
      toast("ההגדרות נשמרו");
    } else {
      toast(res.error || "שגיאה בשמירה", true);
    }
  } catch {
    toast("שגיאת תקשורת עם השרת המקומי", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "שמירת הגדרות";
  }
});

// ---------- גיבוי / ייצוא-ייבוא ----------

const backupResult = document.getElementById("backup-result");

document.getElementById("btn-export")?.addEventListener("click", () => {
  // הורדה ישירה מהשרת (Content-Disposition: attachment)
  const a = document.createElement("a");
  a.href = "/api/backup/export";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (backupResult) {
    backupResult.className = "validate-result ok";
    backupResult.textContent = "✓ קובץ הגיבוי יורד. העבירו אותו למחשב השני וייבאו שם.";
  }
});

document.getElementById("import-file")?.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!confirm("ייבוא ידרוס את ההגדרות הנוכחיות במחשב הזה (גיבוי אוטומטי נשמר). להמשיך?")) {
    e.target.value = "";
    return;
  }
  try {
    const bundle = JSON.parse(await file.text());
    const res = await fetch("/api/backup/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle)
    }).then((r) => r.json());
    if (res.ok) {
      backupResult.className = "validate-result ok";
      backupResult.textContent = `✓ שוחזר: ${res.restored.join(", ")}. ${res.hint}`;
      toast("הגיבוי יובא — הפעילו מחדש את השרת");
    } else {
      backupResult.className = "validate-result bad";
      backupResult.textContent = res.error || "הייבוא נכשל";
    }
  } catch (err) {
    backupResult.className = "validate-result bad";
    backupResult.textContent = "קובץ לא תקין: " + err.message;
  }
  e.target.value = "";
});

// ---------- כתובת LAN + QR להתקנת PWA בטלפון ----------

async function loadPwaAccess() {
  try {
    const net = await fetch("/api/network/access").then((r) => r.json());
    const urlEl = document.getElementById("pwa-lan-url");
    const portEl = document.getElementById("pwa-port");
    const qrEl = document.getElementById("pwa-qr");
    if (portEl) portEl.textContent = net.port;
    if (!net.lanUrl) {
      if (urlEl) urlEl.textContent = "לא נמצאה כתובת רשת מקומית — חברו את המחשב ל-Wi-Fi/כבל.";
      return;
    }
    if (urlEl) urlEl.textContent = net.lanUrl;
    if (qrEl) {
      qrEl.innerHTML = `<img alt="QR לכתובת הפנקס" width="190" height="190"
        style="border:1px solid var(--line); border-radius:6px; background:#e7dbc2; padding:6px;"
        src="/api/network/qr?url=${encodeURIComponent(net.lanUrl)}" />`;
    }
  } catch {
    const urlEl = document.getElementById("pwa-lan-url");
    if (urlEl) urlEl.textContent = "לא ניתן לקבל את כתובת הרשת כרגע.";
  }
}

// ---------- כפתור "התקן במכשיר הזה" ----------

function wireInstallButton() {
  const btn = document.getElementById("btn-install-here");
  const hint = document.getElementById("install-hint");
  if (!btn) return;

  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) {
    hint.textContent = "✓ האפליקציה כבר מותקנת ואתה מריץ אותה עכשיו.";
    return;
  }

  function show() { btn.hidden = false; hint.textContent = ""; }
  if (window.__pwaCanInstall) show();
  window.addEventListener("pwa-installable", show);
  window.addEventListener("pwa-installed", () => {
    btn.hidden = true;
    hint.textContent = "✓ מותקן. פתח מהאייקון במסך הבית.";
  });

  // אם אחרי 2 שניות אין אירוע התקנה — הדפדפן לא תומך / כבר נדחה. מציגים הסבר.
  setTimeout(() => {
    if (btn.hidden && !window.__pwaCanInstall) {
      hint.innerHTML = "הדפדפן הזה לא מציע כפתור התקנה אוטומטי. השתמש בתפריט הדפדפן: " +
        "בכרום למחשב — סמל ההתקנה בשורת הכתובת; בטלפון — <b>⋮</b> ← \"הוסף למסך הבית\".";
    }
  }, 2000);

  btn.addEventListener("click", async () => {
    const r = window.__pwaInstall ? await window.__pwaInstall() : "unavailable";
    if (r === "accepted") { btn.hidden = true; hint.textContent = "✓ מותקן."; }
    else if (r === "unavailable") hint.textContent = "אין אפשרות התקנה אוטומטית כרגע — השתמש בתפריט הדפדפן.";
  });
}

// ---------- גודל חבילת ההתקנה ----------

async function showInstallZipMeta() {
  const meta = document.getElementById("install-zip-meta");
  const link = document.getElementById("btn-download-install");
  if (!meta) return;
  try {
    const r = await fetch("/downloads/magnet-studio-install.zip", { method: "HEAD" });
    if (r.ok) {
      const kb = Math.round((+r.headers.get("content-length") || 0) / 1024);
      const dt = r.headers.get("last-modified");
      meta.textContent = (kb ? kb + " KB" : "") + (dt ? " · עודכן " + new Date(dt).toLocaleDateString("he-IL") : "");
    } else {
      link.classList.add("ghost"); link.classList.remove("primary");
      meta.textContent = "הקובץ עוד לא נבנה — הרץ במחשב: bash scripts/make-package.sh";
    }
  } catch {
    meta.textContent = "";
  }
}

// ---------- כתובת המחשב לסנכרון (מצב אופליין / אפליקציית אנדרואיד) ----------

function wireApiBase() {
  var inp = document.getElementById("pnks-api-base");
  var res = document.getElementById("api-base-result");
  if (!inp) return;
  try { inp.value = localStorage.getItem("pnksApiBase") || ""; } catch (e) {}
  document.getElementById("btn-save-api-base").addEventListener("click", function () {
    var v = inp.value.trim().replace(/\/+$/, "");
    if (v && !/^https?:\/\//.test(v)) v = "http://" + v;
    try { localStorage.setItem("pnksApiBase", v); } catch (e) {}
    if (window.PNKS) PNKS.setApiBase(v);
    res.textContent = v ? "נשמר: " + v + " · בדוק חיבור בעמוד אחר" : "נוקה — מצב מקומי";
    if (v) {
      fetch(v + "/api/setup/status", { cache: "no-store" }).then(function (r) {
        res.textContent = r.ok ? "✓ מחובר: " + v : "נשמר, אך אין תגובה מ-" + v;
      }).catch(function () { res.textContent = "נשמר, אך לא הצלחתי להתחבר ל-" + v + " (המחשב פועל? אותה רשת?)"; });
    }
  });
  document.getElementById("btn-clear-api-base").addEventListener("click", function () {
    inp.value = "";
    try { localStorage.removeItem("pnksApiBase"); } catch (e) {}
    if (window.PNKS) PNKS.setApiBase("");
    res.textContent = "נוקה — מצב מקומי";
  });

  // גישה מרחוק — אם השרת זיהה Tailscale / מנהרה, מציע להשתמש בכתובת
  fetch("/api/network/access", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (net) {
    var r = net && net.remote;
    if (!r || !r.best) return;
    var box = document.getElementById("remote-access");
    var hint = document.getElementById("remote-hint");
    if (!box) return;
    document.getElementById("remote-url").textContent = r.best + "/daily.html";
    document.getElementById("remote-label").textContent = r.bestLabel || "";
    box.style.display = "block";
    if (hint) hint.style.display = "none";
    document.getElementById("btn-use-remote").addEventListener("click", function () {
      var v = r.best.replace(/\/+$/, "");
      inp.value = v;
      try { localStorage.setItem("pnksApiBase", v); } catch (e) {}
      if (window.PNKS) PNKS.setApiBase(v);
      res.textContent = "✓ נשמר: " + v + " — עכשיו כל הנתונים זמינים מכל מקום (כשהמחשב דלוק)";
    });
  }).catch(function () {});
}

// ---------- מפתח Maton במכשיר (עצמאות טלפון) ----------

function wireMatonKey() {
  var inp = document.getElementById("pnks-maton-key");
  var res = document.getElementById("maton-key-result");
  if (!inp) return;
  try { if (localStorage.getItem("pnksMatonKey")) res.textContent = "יש מפתח שמור במכשיר."; } catch (e) {}
  document.getElementById("btn-save-maton").addEventListener("click", function () {
    var v = inp.value.trim();
    if (!v) { res.textContent = "לא הוזן מפתח"; return; }
    if (window.PNKS && PNKS.maton) PNKS.maton.setKey(v);
    else try { localStorage.setItem("pnksMatonKey", v); } catch (e) {}
    inp.value = "";
    res.textContent = "בודק…";
    if (window.PNKS && PNKS.maton) {
      PNKS.maton.health().then(function (h) {
        res.textContent = h.ok ? "✓ המפתח תקין — מיילים ויומן זמינים בטלפון" : "✗ " + h.error;
      });
    } else res.textContent = "נשמר במכשיר.";
  });
  document.getElementById("btn-clear-maton").addEventListener("click", function () {
    if (window.PNKS && PNKS.maton) PNKS.maton.setKey("");
    else try { localStorage.removeItem("pnksMatonKey"); } catch (e) {}
    inp.value = "";
    res.textContent = "נמחק מהמכשיר.";
  });
}

// ---------- JARVIS Cloud במכשיר ----------

function wireJarvisCfg() {
  var base = document.getElementById("pnks-jarvis-base");
  var id = document.getElementById("pnks-jarvis-id");
  var res = document.getElementById("jarvis-cfg-result");
  if (!base) return;
  try {
    base.value = localStorage.getItem("pnksJarvisBase") || (window.PNKS && PNKS.jarvis ? PNKS.jarvis.base() : "");
    id.value = localStorage.getItem("pnksJarvisId") || (window.PNKS && PNKS.jarvis ? PNKS.jarvis.id() : "");
  } catch (e) {}
  document.getElementById("btn-save-jarvis").addEventListener("click", function () {
    if (window.PNKS && PNKS.jarvis) PNKS.jarvis.setConfig(base.value, id.value);
    else {
      try {
        if (base.value.trim()) localStorage.setItem("pnksJarvisBase", base.value.trim());
        if (id.value.trim()) localStorage.setItem("pnksJarvisId", id.value.trim());
      } catch (e) {}
    }
    res.textContent = "בודק…";
    if (window.PNKS && PNKS.jarvis) {
      PNKS.jarvis.ask("בדיקת חיבור", "setup-test", { timeout: 30000 }).then(function (r) {
        res.textContent = r.ok ? "✓ JARVIS Cloud עונה" : (r.cors ? "✗ צריך להפעיל CORS ב-n8n (ראו הסבר למעלה)" : "✗ " + r.error);
      });
    } else res.textContent = "נשמר.";
  });
}

// ---------- n8n Cloud כ-backend ----------

function wireCloudBase() {
  var inp = document.getElementById("pnks-cloud-base");
  var tok = document.getElementById("pnks-cloud-token");
  var res = document.getElementById("cloud-base-result");
  if (!inp) return;
  // מולא אוטומטית: אם אין ערך שמור — מציגים את ברירת המחדל מ-PNKS.n8n
  try {
    inp.value = localStorage.getItem("pnksCloudBase") || (window.PNKS && PNKS.n8n ? PNKS.n8n.base() : "");
    if (tok && localStorage.getItem("pnksCloudToken")) tok.placeholder = "יש מפתח שמור — הזן מחדש להחלפה";
  } catch (e) {}
  document.getElementById("btn-save-cloud").addEventListener("click", function () {
    var v = inp.value.trim().replace(/\/+$/, "");
    if (v && !/^https?:\/\//.test(v)) v = "https://" + v;
    if (window.PNKS && PNKS.n8n) {
      PNKS.n8n.setBase(v);
      if (tok && tok.value.trim()) PNKS.n8n.setToken(tok.value.trim());
    } else try { localStorage.setItem("pnksCloudBase", v); if (tok && tok.value.trim()) localStorage.setItem("pnksCloudToken", tok.value.trim()); } catch (e) {}
    inp.value = v; if (tok) tok.value = "";
    res.textContent = "בודק…";
    if (window.PNKS && PNKS.n8n) {
      PNKS.n8n.health().then(function (h) {
        res.textContent = h.ok ? "✓ ה-workflow פעיל ומגיב" : "✗ " + (h.error || "אין תגובה — ודא שה-workflow מיובא, פעיל (Active), ושמפתח הגישה תואם");
      });
    } else res.textContent = "נשמר.";
  });
  document.getElementById("btn-clear-cloud").addEventListener("click", function () {
    if (window.PNKS && PNKS.n8n) { PNKS.n8n.setBase(""); PNKS.n8n.setToken(""); }
    else try { localStorage.removeItem("pnksCloudBase"); localStorage.removeItem("pnksCloudToken"); } catch (e) {}
    inp.value = ""; if (tok) tok.value = "";
    res.textContent = "נוקה";
  });
}

function wirePair() {
  var btn = document.getElementById("btn-pair-make");
  var wrap = document.getElementById("pair-qr");
  var status = document.getElementById("pair-status");
  if (!btn) return;
  btn.addEventListener("click", async function () {
    btn.disabled = true;
    if (status) status.textContent = "מייצר קוד…";
    try {
      var p = await fetch("/api/pair/payload").then(function (r) { return r.json(); });
      wrap.innerHTML = '<img alt="קוד חיבור הטלפון" width="240" height="240" ' +
        'style="border:1px solid var(--line); border-radius:8px; background:#e7dbc2; padding:8px;" ' +
        'src="/api/pair/qr?ts=' + Date.now() + '" />';
      if (status) {
        var target = (p.remote && p.remote.best) || p.publicBase || "";
        var remoteLine = (p.remote && p.remote.best)
          ? '<br><span style="color:var(--sage)">✓ כולל כתובת מחשב מרחוק (' + (p.remote.bestLabel || "") + ') — כל הנתונים.</span>'
          : '<br><span style="color:var(--cream-dim)">להוספת כל הנתונים: הרץ install\\גישה-מרחוק-מכל-מקום.bat וצור קוד מחדש.</span>';
        status.innerHTML = (p.hasMaton
          ? '<span style="color:var(--sage)">✓ הקוד כולל את מפתח ה-Maton שלך.</span>'
          : '<span style="color:var(--danger)">⚠ ' + (p.note || "אין מפתח Maton בשרת") + '</span>')
          + remoteLine
          + '<br>יעד: <code class="mono">' + target + '/pair.html</code>';
      }
    } catch (e) {
      if (status) status.textContent = "לא הצלחתי לייצר קוד — ודא שהשרת רץ. (" + e.message + ")";
      btn.disabled = false;
    }
  });
}

async function loadProfile() {
  const p = await fetch("/api/profile").then((r) => r.json()).catch(() => null);
  if (!p) return;
  const name = document.getElementById("profile-name");
  const city = document.getElementById("profile-city");
  const host = document.getElementById("profile-host");
  if (name) name.value = p.displayName || "";
  if (city) city.value = p.city || "";
  if (host) host.textContent = p.hostname || "?";
  const btn = document.getElementById("btn-save-profile");
  const res = document.getElementById("profile-result");
  if (btn) btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const saved = await fetch("/api/profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.value.trim(), city: city.value.trim() })
      }).then((r) => r.json());
      res.textContent = "✓ נשמר — רענן דפים כדי לראות את השם החדש.";
      res.className = "validate-result ok";
    } catch (e) {
      res.textContent = "✗ " + e.message;
      res.className = "validate-result bad";
    } finally { btn.disabled = false; }
  });
}

async function loadPhoneInstall() {
  const urlEl = document.getElementById("phone-url");
  const hintEl = document.getElementById("phone-hint");
  const qr = document.getElementById("phone-qr");
  const copyBtn = document.getElementById("btn-copy-url");
  if (!urlEl) return;
  try {
    const a = await fetch("/api/network/access").then((r) => r.json());
    const url = a.lanUrl || "";
    urlEl.textContent = url || "לא נמצאה כתובת רשת מקומית";
    if (hintEl) hintEl.textContent = a.hint || "";
    if (qr && url) qr.src = "/api/network/qr?url=" + encodeURIComponent(url) + "&t=" + Date.now();
    if (copyBtn) copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(url).then(() => toast("הכתובת הועתקה")).catch(() => toast("לא הצלחתי להעתיק", true));
    });
  } catch {
    urlEl.textContent = "לא ניתן לזהות את כתובת הרשת";
  }

  var openBtn = document.getElementById("btn-open-access");
  var stateEl = document.getElementById("access-state");
  if (openBtn) {
    openBtn.addEventListener("click", async function () {
      openBtn.disabled = true;
      stateEl.textContent = "פותח חלון אישור (UAC) במחשב…";
      try {
        var r = await fetch("/api/network/open-access", { method: "POST" }).then(function (x) { return x.json(); });
        stateEl.textContent = r.ok
          ? "✓ אשרו את חלון ה-UAC שנפתח. אחריו — סרקו את ה-QR מהטלפון."
          : "✗ " + (r.error || "לא הצלחתי. הריצו ידנית: install\\פתח-גישה-לטלפון.bat");
      } catch (e) {
        stateEl.textContent = "✗ הריצו ידנית: install\\פתח-גישה-לטלפון.bat";
      }
      setTimeout(function () { openBtn.disabled = false; }, 4000);
    });
  }
}

// ---------- אינטגרציות ו-API ----------
async function loadIntegrations() {
  const host = document.getElementById("int-list");
  if (!host) return;
  let items = [];
  try { items = (await fetch("/api/integrations").then((r) => r.json())).integrations || []; }
  catch { host.innerHTML = '<div class="validate-result bad">לא הצלחתי לטעון את רשימת האינטגרציות.</div>'; return; }

  const order = ["ai", "media", "business", "data", "system"];
  const groups = {};
  items.forEach((it) => { (groups[it.category] = groups[it.category] || []).push(it); });

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fieldHtml = (f) => {
    if (f.type === "select") {
      return `<label>${esc(f.label)}<select name="${esc(f.key)}">${(f.options || []).map((o) => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join("")}</select></label>`;
    }
    if (f.type === "text") {
      return `<label>${esc(f.label)}<input type="text" name="${esc(f.key)}" placeholder="${esc(f.placeholder || "")}" autocomplete="off"></label>`;
    }
    return `<label>${esc(f.label)}
      <span class="int-pwrow">
        <input type="password" name="${esc(f.key)}" placeholder="${esc(f.placeholder || "")}" autocomplete="off">
        <button type="button" class="int-eye" title="הצג/הסתר">👁</button>
      </span></label>`;
  };

  const card = (it) => `
    <div class="int-card" data-id="${esc(it.id)}">
      <div class="int-head">
        <div>
          <b>${esc(it.label)}</b>
          <span class="int-vendor">${esc(it.vendor || "")}</span>
        </div>
        <span class="int-badge ${it.configured ? "ok" : "off"}">${it.configured ? "מוגדר ✓" : "לא מוגדר"}</span>
      </div>
      ${it.detail ? `<div class="int-detail">${esc(it.detail)}</div>` : ""}
      <div class="int-actions">
        ${it.docsUrl ? `<a href="${esc(it.docsUrl)}" target="_blank" rel="noopener" class="int-link">קבלת מפתח ↗</a>` : ""}
        ${it.editable ? `<button type="button" class="btn ghost int-edit">${it.configured ? "עדכון" : "הגדרה"}</button>` : ""}
      </div>
      ${it.editable ? `<form class="int-form" hidden>${it.fields.map(fieldHtml).join("")}<button type="submit" class="btn primary">שמור</button><span class="int-msg"></span></form>` : ""}
    </div>`;

  host.innerHTML = order.filter((c) => groups[c]).map((c) => `
    <div class="int-group">
      <h3>${esc(groups[c][0].categoryLabel)}</h3>
      <div class="int-grid">${groups[c].map(card).join("")}</div>
    </div>`).join("");

  host.querySelectorAll(".int-card").forEach((el) => {
    const id = el.dataset.id;
    const editBtn = el.querySelector(".int-edit");
    const form = el.querySelector(".int-form");
    let loadedValues = false;
    if (editBtn) editBtn.addEventListener("click", async () => {
      const opening = form.hidden;
      form.hidden = !form.hidden;
      if (opening && !loadedValues) {
        loadedValues = true;
        try {
          const { values } = await fetch(`/api/integrations/${id}/reveal`).then((r) => r.json());
          Object.entries(values || {}).forEach(([k, v]) => {
            const input = form.elements[k];
            if (input && v) input.value = v;
          });
        } catch { /* אין ערכים קיימים להציג */ }
      }
    });
    if (form) {
      form.querySelectorAll(".int-eye").forEach((eye) => eye.addEventListener("click", () => {
        const input = eye.previousElementSibling;
        input.type = input.type === "password" ? "text" : "password";
        eye.textContent = input.type === "password" ? "👁" : "🙈";
      }));
      form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector(".int-msg");
      const values = {};
      [...form.elements].forEach((el2) => { if (el2.name) values[el2.name] = el2.value; });
      msg.textContent = "שומר…"; msg.className = "int-msg";
      try {
        const r = await fetch(`/api/integrations/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || "שגיאה");
        msg.textContent = "נשמר ✓"; msg.className = "int-msg ok";
        setTimeout(loadIntegrations, 900);
      } catch (err) { msg.textContent = "✗ " + err.message; msg.className = "int-msg bad"; }
      });
    }
  });
}

(async () => {
  await loadStatus();
  await loadInstalledApps();
  showInstallZipMeta();
  loadProfile();
  loadPhoneInstall();
  loadIntegrations();
})();
