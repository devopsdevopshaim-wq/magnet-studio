const toastEl = document.getElementById("toast");
function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.className = "toast"), 3200);
}

const clockEl = document.getElementById("clock");
function tickClock() {
  clockEl.textContent = new Date().toLocaleString("he-IL", {
    weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}
tickClock();
setInterval(tickClock, 30000);

function greetingForHour(h) {
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "");
const dmy = (iso) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long" }) : "");

function row(main, aside, link) {
  const m = link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(main)}</a>` : esc(main);
  return `<div class="daily-row"><span class="main">${m}</span>${aside ? `<span class="aside">${esc(aside)}</span>` : ""}</div>`;
}

function card(title, badge, bodyHtml) {
  const b = badge ? `<span class="badge ${badge.cls || ""}">${esc(badge.text)}</span>` : "";
  return `<div class="daily-card"><h3>${esc(title)}${b}</h3>${bodyHtml}</div>`;
}

// eyebrow קצר לכל מקטע — אומר משהו נכון על התוכן, לא קישוט
const EYEBROWS = {
  today: "מן היום",
  day: "התנהלות",
  week: "השבוע הקרוב",
  lotto: "מזל והזדמנות",
  learning: "מן המקורות",
  parasha: "פרשת השבוע",
  proverb: "מילת היום",
  sky: "מן השמים",
  astro: "מן המזל",
  system: "מצב הכלים"
};

function section(id, title, bodyHtml, sub) {
  const eyebrow = EYEBROWS[id];
  return `<section class="daily-section" id="${id}">
    <div class="daily-section-head">
      ${eyebrow ? `<span class="daily-eyebrow">${esc(eyebrow)}</span>` : ""}
      <h2>${esc(title)}</h2>
      ${sub ? `<span class="daily-section-sub">${esc(sub)}</span>` : ""}
    </div>
    ${bodyHtml}
  </section>`;
}

// ---------- קשת האופק (החתימה) ----------

function renderHorizon(sky, now) {
  const times = (sky && sky.halachicTimes) || [];
  const find = (k) => {
    const t = times.find((x) => x.key === k);
    if (!t || !t.value) return null;
    const [h, m] = t.value.split(":").map(Number);
    return h * 60 + m;
  };
  const sunrise = find("sunrise");
  const sunset = find("sunset");
  const chatzot = find("chatzot");
  if (sunrise == null || sunset == null) return "";

  const W = 900, H = 62, pad = 8;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // ממפים 04:00–22:00 לרוחב
  const dayStart = 4 * 60, dayEnd = 22 * 60;
  const x = (min) => pad + ((min - dayStart) / (dayEnd - dayStart)) * (W - 2 * pad);
  // קשת: פרבולה נמוכה
  const y = (min) => {
    const frac = (min - sunrise) / (sunset - sunrise); // 0..1 בין זריחה לשקיעה
    const clamped = Math.max(0, Math.min(1, frac));
    return H - 6 - Math.sin(clamped * Math.PI) * (H - 20);
  };
  const seg = [];
  for (let mn = sunrise; mn <= sunset; mn += 12) seg.push(`${seg.length ? "L" : "M"} ${x(mn).toFixed(1)} ${y(mn).toFixed(1)}`);
  const nx = x(Math.max(dayStart, Math.min(dayEnd, nowMin)));
  const ny = nowMin >= sunrise && nowMin <= sunset ? y(nowMin) : H - 6;

  const label = (min, txt) =>
    `<line class="tick" x1="${x(min).toFixed(1)}" y1="${H - 4}" x2="${x(min).toFixed(1)}" y2="${H}" />
     <text class="tick-label" x="${x(min).toFixed(1)}" y="${H + 12}" text-anchor="middle">${txt}</text>`;

  return `<div class="horizon">
    <svg viewBox="0 0 ${W} ${H + 16}" preserveAspectRatio="none" role="img" aria-label="אור היום מהזריחה עד השקיעה">
      <defs>
        <linearGradient id="dayGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--ember)" stop-opacity="0.35"/>
          <stop offset="0.5" stop-color="var(--brass)"/>
          <stop offset="1" stop-color="var(--ember)" stop-opacity="0.35"/>
        </linearGradient>
      </defs>
      <line class="arc" x1="${pad}" y1="${H - 5}" x2="${W - pad}" y2="${H - 5}" />
      <path class="arc-day" d="${seg.join(" ")}" />
      ${label(sunrise, "זריחה")}
      ${chatzot != null ? label(chatzot, "חצות") : ""}
      ${label(sunset, "שקיעה")}
      <circle class="now-ring" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="9" />
      <circle class="now-dot" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="3.5" />
    </svg>
  </div>`;
}

function listOrEmpty(items, emptyText) {
  if (!items || !items.length) return `<div class="daily-empty">${esc(emptyText)}</div>`;
  return `<div class="daily-list">${items.join("")}</div>`;
}

function collapsible(summary, inner, open) {
  return `<details class="daily-collapse"${open ? " open" : ""}><summary>${esc(summary)}</summary><div class="daily-collapse-body">${inner}</div></details>`;
}

// ---------- מקטעים ----------

function renderParasha(b) {
  const heb = b.hebrew || {};
  const lp = b.learning?.items?.parasha;
  const haft = b.learning?.items?.haftarah;
  const aliyah = b.aliyah;
  const rows = [];
  const nameHe = (heb.parasha || "").replace(/^פָּרָשַׁת\s*/, "").replace(/^פרשת\s*/, "") || (lp?.displayHe || "");
  if (aliyah && heb.parasha) rows.push(row(`עליית היום: ${aliyah.name} (עלייה ${aliyah.number} מתוך 7)`, ""));
  if (lp?.displayHe) rows.push(row(`קריאת השבוע: ${lp.displayHe}`, "", lp.url));
  if (haft?.displayHe) rows.push(row(`הפטרה: ${haft.displayHe}`, "", haft.url));

  const summary = heb.parashaContent
    ? `<p class="daily-para">${esc(heb.parashaContent)}</p>`
    : (lp?.displayHe ? "" : `<div class="daily-empty">אין תקציר זמין</div>`);

  return section(
    "parasha",
    "פרשת השבוע" + (nameHe ? " · " + nameHe : ""),
    `<div class="daily-card">${listOrEmpty(rows, "אין נתוני פרשה")}${summary}</div>`
  );
}

function learningItem(entry, label) {
  if (!entry) return "";
  const head = `${label}: ${entry.displayHe || entry.title || ""}`;
  const link = entry.url ? ` &nbsp;<a href="${esc(entry.url)}" target="_blank" rel="noopener">↗ ספריא</a>` : "";
  if (entry.text?.he) {
    const inner =
      `<p class="daily-source">${esc(entry.text.he)}</p>` +
      (entry.explanation ? `<p class="daily-explain"><b>בקצרה:</b> ${esc(entry.explanation)}</p>` : "") +
      `<div class="daily-linkline">${link}</div>`;
    return collapsible(head, inner);
  }
  return `<div class="daily-row"><span class="main">${esc(head)}</span><span class="aside">${entry.url ? `<a href="${esc(entry.url)}" target="_blank" rel="noopener">↗</a>` : ""}</span></div>`;
}

function renderLearning(b) {
  const L = b.learning;
  if (!L || !L.available) {
    return section("learning", "הלימוד היומי", `<div class="daily-card"><div class="daily-empty">לוח הלימוד היומי (ספריא) לא זמין כרגע — בדקו חיבור לאינטרנט ולחצו "רענן".</div></div>`);
  }
  const it = L.items || {};
  const body =
    `<div class="daily-card">` +
    learningItem(it.mishnah, "משנה יומית") +
    learningItem(it.tanya, "תניא יומי · קבלה") +
    learningItem(it.halacha, "הלכה יומית") +
    `<div class="daily-list" style="margin-top:10px">` +
    (it.dafYomi ? row("דף יומי: " + it.dafYomi.displayHe, "↗", it.dafYomi.url) : "") +
    (it["929"] ? row('תנ"ך 929: ' + it["929"].displayHe, "↗", it["929"].url) : "") +
    (it.chok ? row("חוק לישראל: " + it.chok.displayHe, it.chok.url ? "↗" : "", it.chok.url) : "") +
    `</div></div>`;
  return section("learning", "הלימוד היומי", body, "לחיצה על פריט פותחת את הטקסט וההסבר");
}

function renderProverb(b) {
  if (!b.proverb) return "";
  return section(
    "proverb",
    "פתגם היום",
    `<div class="daily-card daily-quote">
       <blockquote>${esc(b.proverb.text)}</blockquote>
       <cite>— ${esc(b.proverb.source)}</cite>
     </div>`
  );
}

function renderTehillim(b) {
  const t = b.tehillim;
  if (!t || !(t.chapters || []).length) return "";
  return section("tehillim", "תהילים ליום",
    `<div class="daily-card">
       <div class="daily-row"><span class="main">פרקי היום</span><span class="aside" style="color:var(--brass-soft)">${(t.chapters || []).join(" · ")}</span></div>
       <div class="daily-sub" style="margin-top:6px">לפי החלוקה המסורתית לימי החודש · ${esc(t.hebrewDate || "")}</div>
       <div style="margin-top:10px"><a href="/library/tehillim.html" style="color:var(--brass-soft)">פתיחת הפרקים עם ניקוד →</a></div>
     </div>`);
}

// אוצר קבצים לחג — מוצג רק כשיש חומר רלוונטי לתאריך (חג מתקרב / שבת). הקבוע שנתי חי ב-/library.html
function renderLibrary(b) {
  const timely = (b.library || []).filter((r) => r.reason && r.reason !== "always");
  if (!timely.length) return "";
  const card = (r) => `
    <div class="daily-lib-item">
      <div class="daily-lib-main">
        <span class="daily-lib-title">${esc(r.title)}</span>
        ${r.label ? `<span class="daily-lib-tag">${esc(r.label)}</span>` : ""}
        ${r.desc ? `<div class="daily-sub">${esc(r.desc)}</div>` : ""}
      </div>
      <div class="daily-lib-actions">
        <a href="${esc(r.file)}" target="_blank" rel="noopener">פתח</a>
        <a href="${esc(r.file)}" download>הורד${r.sizeKB ? ` · ${r.sizeKB > 1024 ? (r.sizeKB / 1024).toFixed(1) + "MB" : r.sizeKB + "KB"}` : ""}</a>
      </div>
    </div>`;
  return section("library", "אוצר לחג",
    `<div class="daily-card">${timely.map(card).join("")}
       <div class="daily-sub" style="margin-top:10px"><a href="/library.html" style="color:var(--brass-soft)">לכל האוצר →</a></div>
     </div>`);
}

function shabbatCardHtml(b) {
  const sh = b.shabbat;
  if (!sh || !sh.available || !sh.candleLighting) return "";
  return `<div class="daily-card daily-shabbat">
       <h3>${sh.isShabbatNow ? "שבת שלום" : "השבת הקרובה"}${sh.parasha ? ` · ${esc(sh.parasha.replace(/^פָּרָשַׁת\s*/, "פרשת "))}` : ""}</h3>
       <div class="shabbat-times">
         <div class="shabbat-t"><span class="lbl">כניסת שבת</span><span class="val">${esc(sh.candleLighting.timeStr)}</span><span class="sub">${esc(sh.candleLighting.dateHe)}</span></div>
         <div class="shabbat-t"><span class="lbl">יציאת שבת</span><span class="val">${esc(sh.havdalah?.timeStr || "—")}</span><span class="sub">${esc(sh.havdalah?.dateHe || "")}</span></div>
       </div>
       ${
         (sh.upcoming || []).length
           ? `<div class="daily-list" style="margin-top:10px">${sh.upcoming.map((u) => row(u.reason || "שבת", `${u.timeStr} · ${u.dateHe}`)).join("")}</div>`
           : ""
       }
       <div class="daily-sub" style="margin-top:8px">זמנים ל-${esc(sh.place || "מיקום מקומי")} · חישוב מקומי (@hebcal)</div>
     </div>`;
}

function renderSky(b) {
  const s = b.sky;
  if (!s) {
    const sc = shabbatCardHtml(b);
    return section("sky", "השמיים היום",
      sc + `<div class="daily-card"><div class="daily-empty">חישוב השמיים לא זמין כרגע — לחץ "רענן".</div></div>`);
  }

  const zmanim = (s.halachicTimes || [])
    .map((t) => `<div class="zman"><span class="zman-l">${esc(t.label)}</span><span class="zman-v">${esc(t.value)}</span></div>`)
    .join("");

  const moon = s.moon
    ? `<div class="daily-moon">
         <div class="moon-glyph">${esc(s.moon.glyph || "🌙")}</div>
         <div>
           <div class="moon-name">${esc(s.moon.phaseName)}</div>
           <div class="daily-sub">${s.moon.illuminationPercent}% מואר · גיל ${s.moon.ageDays} ימים · ${s.moon.waxing ? "מתמלא" : "מתמעט"}</div>
           <div class="daily-sub">מולד הבא: ${dmy(s.moon.nextNew)} · ירח מלא הבא: ${dmy(s.moon.nextFull)}</div>
         </div>
       </div>`
    : "";

  const dl = s.dayLength
    ? `<div class="daily-row"><span class="main">אורך היום</span><span class="aside">${s.dayLength.hours}:${String(s.dayLength.minutes).padStart(2, "0")} שעות${
        s.dayLength.deltaMin != null ? ` (${s.dayLength.deltaMin > 0 ? "+" : ""}${s.dayLength.deltaMin} דק' מאתמול)` : ""
      }</span></div>`
    : "";

  const planets = (s.visiblePlanets || []).length
    ? `<div class="daily-list" style="margin-top:8px">${s.visiblePlanets
        .map((p) => row(p.name, `${p.direction} · ${p.altitude}° מעל האופק`))
        .join("")}</div>`
    : `<div class="daily-empty">אין כוכבי לכת בולטים מעל האופק אחרי השקיעה</div>`;

  return section(
    "sky",
    "השמיים היום",
    `${shabbatCardHtml(b)}
     <div class="daily-card">
       <h3>זמני היום · ${esc(s.place || "ירושלים")}</h3>
       <div class="zmanim-grid">${zmanim}</div>
       <div class="daily-list" style="margin-top:10px">${dl}</div>
     </div>
     <div class="daily-card">
       <h3>הירח</h3>
       ${moon}
     </div>
     <div class="daily-card">
       <h3>כוכבי לכת נראים הערב</h3>
       ${planets}
     </div>`
  );
}

function renderAstro(b) {
  const a = b.astro || {};
  if (!a.configured) {
    return section(
      "astro",
      "המזל היום",
      `<div class="daily-card">
         <p class="daily-para">כדי לקבל קריאה אסטרולוגית אישית לפי מפת הלידה, הזינו את פרטי הלידה. החישוב נעשה מקומית במחשב — שום דבר לא נשלח לאף שירות.</p>
         <form id="astro-form" class="astro-form">
           <label>תאריך לידה<input type="date" name="birthDate" required></label>
           <label>שעת לידה<input type="time" name="birthTime" value="12:00"></label>
           <label>עיר לידה
             <select name="birthPlace" id="astro-city"></select>
           </label>
           <button type="submit" class="btn primary">חשב מפה</button>
         </form>
         ${
           a.transits
             ? `<div class="daily-list" style="margin-top:14px">
                  ${row("מזל השמש היום", `${a.transits.sunSign.glyph} ${a.transits.sunSign.name}`)}
                  ${row("מזל הירח היום", `${a.transits.moonSign.glyph} ${a.transits.moonSign.name}`)}
                </div>`
             : ""
         }
       </div>`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const picker = `<div class="astro-datepick">
      <label>בחירת תאריך לקריאת טרנזיטים
        <input type="date" id="astro-date" value="${esc(a.date || today)}">
      </label>
      <span class="daily-sub" id="astro-date-note"></span>
    </div>`;

  return section(
    "astro",
    "המזל היום",
    picker + `<div id="astro-dynamic">${astroReadingBody(a)}</div>`,
    "מפת לידה מקומית · בחרו תאריך לראות את הטרנזיטים וההסבר המלא"
  );
}

// גוף הקריאה האסטרולוגית — משמש גם לרינדור ראשוני וגם אחרי בחירת תאריך
function astroReadingBody(a) {
  const n = a.natal || {};
  const t = a.transits || {};
  const natalRows = [
    n.sun ? row("שמש בלידה", `${n.sun.signGlyph} ${n.sun.sign} ${n.sun.degInSign}° · בית ${n.sun.house}`) : "",
    n.moon ? row("ירח בלידה", `${n.moon.signGlyph} ${n.moon.sign} ${n.moon.degInSign}° · בית ${n.moon.house}`) : "",
    n.ascendant ? row("אופק (מזל עולה)", `${n.ascendant.glyph} ${n.ascendant.sign} ${n.ascendant.degInSign}°`) : "",
    n.midheaven ? row("רום השמים (MC)", `${n.midheaven.glyph} ${n.midheaven.sign}`) : ""
  ];
  const todayRows = [
    row("מזל השמש בתאריך", `${t.sunSign?.glyph || ""} ${t.sunSign?.name || ""}`),
    row("מזל הירח בתאריך", `${t.moonSign?.glyph || ""} ${t.moonSign?.name || ""}`)
  ];
  const interps = a.interpretations || [];
  const interpHtml = interps.length
    ? `<div class="astro-interp-list">${interps
        .map(
          (it) => `<div class="astro-interp${it.tight ? " tight" : ""}">
            <div class="astro-interp-head">${esc(it.headline)}</div>
            <p class="astro-interp-text">${esc(it.text)}</p>
          </div>`
        )
        .join("")}</div>`
    : listOrEmpty([], "אין היבטים משמעותיים בתאריך שנבחר");
  const planetsFull = collapsible(
    "כל הכוכבים במפת הלידה",
    `<div class="daily-list">${(n.planets || [])
      .map((p) => row(`${p.glyph} ${p.name}`, `${p.signGlyph} ${p.sign} ${p.degInSign}° · בית ${p.house}`))
      .join("")}</div>`
  );

  return `<div class="daily-card">
       <h3>מזל היום · ${esc(a.date || "")}</h3>
       <div class="daily-list">${todayRows.join("")}</div>
     </div>
     <div class="daily-card">
       <h3>טרנזיטים מול מפת הלידה — הסבר מלא</h3>
       ${interpHtml}
       <div class="daily-sub" style="margin-top:8px">"מדויק" = היבט הדוק (עד 1.5°) — משפיע חזק יותר.</div>
     </div>
     <div class="daily-card">
       <h3>מפת הלידה · ${esc(a.place || "")}</h3>
       <div class="daily-list">${natalRows.join("")}</div>
       ${planetsFull}
       <div class="daily-linkline">
         <a href="/astro-full.html">פענוח אסטרולוגי מלא ←</a>
         &nbsp;·&nbsp;
         <a href="#" id="astro-edit">שינוי פרטי לידה</a>
       </div>
     </div>`;
}

function renderStatusGrid(b) {
  const grid = [];

  const calToday = (b.calendar?.today || []).map((e) => row(e.summary, e.when, e.link));
  const calTomorrow = (b.calendar?.tomorrow || []).map((e) => row("מחר · " + e.summary, e.when, e.link));
  grid.push(
    card(
      "אירועי היום",
      { text: String((b.calendar?.today || []).length) },
      listOrEmpty(
        [...calToday, ...calTomorrow],
        b.calendar?.source ? "אין אירועים היום או מחר · יומן Maton מחובר" : "היומן לא מחובר — חברו google-calendar בכרטיס Maton"
      )
    )
  );

  const eh = b.email?.matonHealth;
  if (eh && eh.ok === false) {
    grid.push(card("מיילים", { text: "תקלה", cls: "warn" }, `<div class="daily-empty">${esc(eh.error)}</div>`));
  } else if (b.email?.configured) {
    const rec = b.email.recent || [];
    const jobs = rec.filter((m) => m.jobRelated);
    const others = rec.filter((m) => !m.jobRelated);
    const fields = Object.entries(b.email.byField || {}).sort((a, b2) => b2[1] - a[1]);
    const jobBlock = jobs.length
      ? `<div class="daily-note"><div class="t" style="color:var(--ember)">חיפוש עבודה · ${b.email.jobRelatedCount || jobs.length}</div>` +
        (fields.length ? `<div class="d">${fields.map(([f, n]) => `${esc(f)} (${n})`).join(" · ")}</div>` : "") +
        `<div class="daily-list" style="margin-top:6px">${jobs.slice(0, 5).map((m) => row(m.subject, esc(m.field || ""), m.link)).join("")}</div></div>`
      : "";
    const otherBlock = others.length
      ? `<div class="daily-note"><div class="t">אחר · ${others.length}</div><div class="daily-list" style="margin-top:6px">${others.slice(0, 5).map((m) => row(m.subject, "", m.link)).join("")}</div></div>`
      : "";
    grid.push(
      card(
        "מיילים שלא נקראו",
        { text: String(b.email.unreadCount ?? rec.length), cls: (b.email.unreadCount || 0) > 0 ? "warn" : "ok" },
        (jobBlock + otherBlock) || `<div class="daily-empty">אין מיילים חדשים 🎉</div>`
      )
    );
  } else {
    grid.push(card("מיילים", null, `<div class="daily-empty">מצב המיילים לא מוגדר — הגדירו <code class="mono">MATON_API_KEY</code> וחברו Gmail ב-Maton.</div>`));
  }

  const pending = (b.magnets?.pending || []).map((e) => row(e.name, `${e.photoCount} תמונות`));
  grid.push(
    card(
      "מגנטים ממתינים לעיצוב",
      { text: String((b.magnets?.pending || []).length), cls: (b.magnets?.pending || []).length ? "warn" : "ok" },
      listOrEmpty(pending, "כל האירועים עוצבו ✓")
    )
  );

  const inbox = (b.inbox || []).map((i) => row(i.title, hhmm(i.receivedAt)));
  grid.push(card("התראות n8n", { text: String((b.inbox || []).length) }, listOrEmpty(inbox, "אין התראות מ-n8n")));

  const sec = b.security || {};
  const secItems = (sec.events || []).map((e) => row(e.message || `אירוע ${e.id}`, hhmm(e.time)));
  grid.push(
    card(
      "אבטחה · 24 שעות",
      sec.count > 0 ? { text: String(sec.count), cls: "warn" } : { text: "נקי", cls: "ok" },
      sec.status === "unavailable" ? `<div class="daily-empty">יומן האבטחה לא נגיש.</div>` : listOrEmpty(secItems, "לא נרשמו כניסות כושלות")
    )
  );

  const hous = b.housing || {};
  if (hous.up) {
    const items = (hous.listings || []).slice(0, 8).map((l) => {
      const priceStr = l.price ? "₪" + Number(l.price).toLocaleString("he-IL") : "";
      const contact = l.contactPhone
        ? `<div class="daily-sub" style="margin-top:2px">${esc(l.contactName || "ליצירת קשר")}${l.contactType === "agency" ? " · תיווך" : ""} · <a href="tel:${esc(l.contactPhone.replace(/[^0-9+]/g, ""))}">${esc(l.contactPhone)}</a></div>`
        : "";
      return `<div class="daily-row"><span class="main">${l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener">${esc(l.title)}${l.city ? " · " + esc(l.city) : ""}</a>` : esc(l.title)}${contact}</span><span class="aside">${esc(priceStr)}</span></div>`;
    });
    grid.push(card("דיור · DiraFinder", { text: String((hous.listings || []).length) }, listOrEmpty(items, "אין נכסים חדשים")));
  } else {
    grid.push(
      card("דיור · DiraFinder", { text: "כבוי" }, `<div class="daily-empty"><a href="/housing.html" style="color:var(--brass-soft)">פתחו את לשונית הדיור</a> להוראות הפעלה.</div>`)
    );
  }

  return section("today", "מבט מהיר על היום", `<div class="daily-grid">${grid.join("")}</div>`);
}

function renderSystem(b) {
  const core = b.system || {};
  const sp = b.systemPlus || {};
  const metric = (num, lbl, warn) =>
    `<div class="daily-metric"><span class="num ${warn ? "warn" : ""}">${num}</span><span class="lbl">${lbl}</span></div>`;

  const metrics = [
    metric((core.memoryPercent ?? "—") + "%", "זיכרון", (core.memoryPercent || 0) >= 90),
    metric((core.diskPercent ?? "—") + "%", "דיסק C", (core.diskPercent || 0) >= 88),
    metric(core.cpuPercent != null ? core.cpuPercent + "%" : "—", "מעבד", (core.cpuPercent || 0) >= 90),
    sp.cpuTempC != null ? metric(sp.cpuTempC + "°", "טמפ' מעבד", sp.cpuTempC >= 85) : "",
    sp.battery ? metric(sp.battery.percent + "%", sp.battery.plugged ? "סוללה (טעינה)" : "סוללה", !sp.battery.plugged && sp.battery.percent <= 20) : "",
    metric(core.uptimeHours != null ? core.uptimeHours + "ש'" : "—", "פעילות", false),
    sp.processCount != null ? metric(sp.processCount, "תהליכים", false) : ""
  ].filter(Boolean);

  const drives = (sp.drives || [])
    .map((d) => row(`כונן ${d.letter}`, `${d.freeGB} GB פנויים מתוך ${d.totalGB} · ${d.percent}% בשימוש`))
    .join("");

  const net = sp.network || {};
  const netRows = [
    row("אינטרנט", net.online ? "מחובר" : "מנותק"),
    net.adapter ? row("מתאם רשת", `${net.adapter}${net.linkSpeed ? " · " + net.linkSpeed : ""}`) : "",
    net.localIp ? row('כתובת IP מקומית', net.localIp) : "",
    net.externalIp ? row('כתובת IP חיצונית', net.externalIp) : ""
  ].join("");

  const svc = sp.services || {};
  const svcRows = [
    row("n8n Cloud", svc.n8nCloud ? "זמין" : "לא נגיש"),
    row("n8n מקומי (5680)", svc.n8nLocal ? "פעיל" : "כבוי"),
    row("Ollama (AI מקומי)", svc.ollama ? "פעיל" : "כבוי"),
    row("OpenClaw (18789)", svc.openclaw ? "פעיל" : "כבוי"),
    row("Maton", svc.maton ? (svc.maton === 1 ? "חשבון אחד" : `${svc.maton} חשבונות`) : "לא מוגדר")
  ].join("");

  const maintRows = [
    sp.lastBoot ? row("אתחול אחרון", new Date(sp.lastBoot).toLocaleString("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })) : "",
    sp.lastUpdateInstalled ? row("עדכון Windows אחרון", sp.lastUpdateInstalled) : "",
    sp.topProcess ? row("התהליך הכבד ביותר", `${sp.topProcess.name} · ${sp.topProcess.memMB} MB`) : ""
  ].join("");

  const allWarnings = [...(core.warnings || []), ...(sp.warnings || [])];
  const note = (t, d) => `<div class="daily-note"><div class="t">${esc(t)}</div>${d ? `<div class="d">${esc(d)}</div>` : ""}</div>`;
  const recs = (b.recommendations || []).filter((r) => r.level !== "ok").map((r) => note(r.title, r.detail || ""));

  return section(
    "system",
    "מצב המערכת",
    `<div class="daily-card">
       <h3>מדדים</h3>
       <div class="daily-metric-row">${metrics.join("")}</div>
       ${allWarnings.length ? `<div class="daily-list" style="margin-top:12px">${allWarnings.map((w) => row("⚠ " + w, "")).join("")}</div>` : `<div class="daily-sub" style="margin-top:10px">אין אזהרות — המערכת תקינה.</div>`}
     </div>
     <div class="daily-card"><h3>כוננים</h3>${drives ? `<div class="daily-list">${drives}</div>` : `<div class="daily-empty">—</div>`}</div>
     <div class="daily-card"><h3>רשת ואינטרנט</h3><div class="daily-list">${netRows}</div></div>
     <div class="daily-card"><h3>שירותים</h3><div class="daily-list">${svcRows}</div></div>
     <div class="daily-card"><h3>עדכונים ותחזוקה</h3>${maintRows ? `<div class="daily-list">${maintRows}</div>` : `<div class="daily-empty">—</div>`}</div>
     ${recs.length ? `<div class="daily-card"><h3>המלצות</h3><div class="daily-list">${recs.join("")}</div></div>` : ""}`
  );
}

// ---------- הרכבה ----------

const ANCHORS = [
  ["today", "מבט מהיר"],
  ["day", "התנהלות"],
  ["week", "השבוע"],
  ["lotto", "הגרלה"],
  ["learning", "לימוד"],
  ["parasha", "פרשה"],
  ["tehillim", "תהילים"],
  ["proverb", "פתגם"],
  ["sky", "שמיים"],
  ["astro", "מזל"],
  ["system", "מערכת"]
];

const ACCOUNT_COLORS = ["var(--brass-soft)", "var(--sage)", "var(--ember)", "var(--accent-warm)"];

function renderDay(b) {
  const tips = b.dayTips || [];
  if (!tips.length) return "";
  const items = tips
    .map(
      (t) => `<div class="tip-row">
        <span class="tip-cat">${esc(t.category)}</span>
        <span class="tip-text">${esc(t.text)}</span>
      </div>`
    )
    .join("");
  return section("day", "ניהול היום", `<div class="daily-card">${items}</div>`, "שלוש נקודות למחר טוב יותר");
}

function renderWeek(b) {
  const w = b.weekCalendar;
  if (!w || !w.configured) {
    return section("week", "היומן השבוע", `<div class="daily-card"><div class="daily-empty">אין יומן מחובר. בכרטיס Maton בלוח הבקרה → "חבר" → google-calendar → התחברו עם litaldahan1@gmail.com ו/או devopsdevopshaim@gmail.com.</div></div>`);
  }
  const accColor = {};
  w.accounts.forEach((a, i) => (accColor[a] = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]));
  const legend = w.accounts
    .map((a) => `<span class="acc-tag" style="border-color:${accColor[a]};color:${accColor[a]}">${esc(a.replace(/@gmail\.com$/, ""))}</span>`)
    .join(" ");

  const dayCards = w.days
    .map((d) => {
      const evs = d.events.length
        ? d.events
            .map(
              (e) =>
                `<div class="daily-row"><span class="main">${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.summary)}</a>` : esc(e.summary)}</span><span class="aside" style="color:${accColor[e.account] || "var(--cream-dim)"}">${esc(e.when)}</span></div>`
            )
            .join("")
        : `<div class="daily-empty">—</div>`;
      return `<div class="daily-card week-day${d.isToday ? " today" : ""}">
        <h3>${esc(d.weekday)} <span class="badge">${esc(d.label)}</span></h3>
        ${evs}
      </div>`;
    })
    .join("");

  return section(
    "week",
    "היומן השבוע",
    `<div class="daily-legend">${legend} · ${w.totalEvents} אירועים</div><div class="daily-grid week-grid">${dayCards}</div>`
  );
}

function renderLotto(b) {
  const l = b.lotto;
  if (!l || !l.available) {
    return section("lotto", "הגרלה קרובה", `<div class="daily-card"><div class="daily-empty">לא הצלחתי למשוך את תוצאות מפעל הפיס כרגע — בדקו חיבור לאינטרנט ולחצו "רענן".</div></div>`);
  }
  // רק לוח זמנים (אין תוצאות — פיס חוסם גישה מהענן/דפדפן)
  if (l._scheduleOnly && l.nextDraw) {
    const nd = l.nextDraw;
    return section("lotto", "הגרלה קרובה",
      `<div class="daily-card lotto-next">
         <h3>ההגרלה הבאה</h3>
         <div class="lotto-when">${esc(nd.dateHe)} · ${esc(nd.approxTime)}</div>
         <div class="lotto-count">${nd.daysAway === 0 ? "היום" : nd.daysAway === 1 ? "מחר" : `בעוד ${nd.daysAway} ימים`}</div>
       </div>
       <div class="daily-card"><div class="daily-empty">תוצאות ההגרלה, מספרים חמים/קרים וטורים משוקללים — זמינים כשמתחברים למחשב.</div></div>`,
      "לוח הגרלות מפעל הפיס");
  }
  const balls = (nums, strong) =>
    `<div class="lotto-line">${nums.map((n) => `<span class="ball">${n}</span>`).join("")}<span class="ball strong">${strong ?? "—"}</span></div>`;

  return section(
    "lotto",
    "הגרלה קרובה",
    `<div class="daily-card lotto-next">
       <h3>הגרלה ${l.nextDraw.id}</h3>
       <div class="lotto-when">${esc(l.nextDraw.dateHe)} · ${esc(l.nextDraw.approxTime)}</div>
       <div class="lotto-count">${l.nextDraw.daysAway === 0 ? "היום!" : l.nextDraw.daysAway === 1 ? "מחר" : `בעוד ${l.nextDraw.daysAway} ימים`}</div>
     </div>
     <div class="daily-card">
       <h3>ההגרלה האחרונה (${l.lastDraw.id})</h3>
       <div class="daily-sub" style="margin-bottom:8px">${esc(l.lastDraw.dateHe)}</div>
       ${balls(l.lastDraw.numbers, l.lastDraw.strong)}
     </div>
     <div class="daily-card">
       <h3>מספרים חמים / קרים <span class="daily-sub">(${l.frequencyWindow} הגרלות אחרונות)</span></h3>
       <div class="daily-row"><span class="main">חמים</span><span class="aside" style="color:var(--hot)">${l.hotCold.main.hot.join(" · ")}</span></div>
       <div class="daily-row"><span class="main">קרים</span><span class="aside" style="color:var(--cyan)">${l.hotCold.main.cold.join(" · ")}</span></div>
       <div class="daily-row"><span class="main">מספר חזק חם</span><span class="aside" style="color:var(--hot)">${l.hotCold.strong.hot.join(" · ")}</span></div>
     </div>
     ${l.primary ? `<div class="daily-card">
       <h3>הטור המדויק <span class="daily-sub">6 + נוסף</span></h3>
       ${balls(l.primary.nums, l.primary.strong)}
       <div class="daily-sub" style="margin-top:6px">${esc(l.method || "")}</div>
     </div>` : ""}
     ${l.systemBets ? `<div class="daily-card">
       <h3>טורים מורכבים <span class="daily-sub">8 · 9 · 10 + נוסף</span></h3>
       ${["8", "9", "10"].filter((k) => l.systemBets[k]).map((k) => `
         <div class="daily-row" style="align-items:flex-start">
           <span class="main">${k} מספרים<br><small class="daily-sub">${l.systemBets[k].combos} טורים</small></span>
           <span class="aside">${balls(l.systemBets[k].nums, l.systemBets[k].strong)}</span>
         </div>`).join("")}
     </div>` : ""}
     <div class="daily-card">
       <h3>3 טורים משוקללים</h3>
       ${l.suggestions.map((s) => balls(s.nums, s.strong)).join("")}
       <div class="daily-warn">${esc(l.disclaimer)}</div>
     </div>`,
    "מבוסס על היסטוריית מפעל הפיס"
  );
}

let dailyAvatar = null;
function ensureAvatar() {
  if (dailyAvatar || !window.JarvisAvatar) return;
  const el = document.getElementById("daily-avatar");
  if (!el) return;
  dailyAvatar = window.JarvisAvatar.create(el, { size: "sm" });
  dailyAvatar.setState("idle");
}

function render(b) {
  const now = new Date();
  ensureAvatar();
  document.getElementById("greeting").textContent = greetingForHour(now.getHours()) + ", חיים";

  const heb = b.hebrew || {};
  const sublineParts = [];
  if (heb.hebrewDate) sublineParts.push(heb.hebrewDate);
  if (heb.parasha) sublineParts.push(heb.parasha);
  const nextHoliday = (heb.holidays || []).find((h) => h.isMajor && h.daysAway >= 0);
  if (nextHoliday) sublineParts.push(`${nextHoliday.title} בעוד ${nextHoliday.daysAway} ימים`);
  document.getElementById("subline").textContent =
    sublineParts.join(" · ") || now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  const parts = [];

  parts.push(renderHorizon(b.sky, now));
  parts.push(`<nav class="daily-anchors">${ANCHORS.map(([id, l]) => `<a href="#${id}">${l}</a>`).join("")}</nav>`);

  if (b.narrative) {
    const auto = b.narrativeSource === "סיכום אוטומטי";
    parts.push(`
      <div class="daily-narrative">
        <div class="label">${auto ? "סיכום היום" : "מן היום · נכתב ב-AI" + (b.narrativeSource ? " · " + esc(b.narrativeSource) : "")}</div>
        <div class="text">${esc(b.narrative)}</div>
      </div>`);
  } else {
    parts.push(`
      <div class="daily-narrative muted">
        <div class="label">סיכום היום</div>
        <div class="text">לא היה מנוע AI זמין לכתיבת הסיכום. הפעילו את JARVIS ב-n8n, את Ollama המקומי, או הגדירו מפתח ספק ענן — ולחצו "רענן".</div>
      </div>`);
  }

  parts.push(renderStatusGrid(b));
  parts.push(renderLibrary(b));
  parts.push(renderDay(b));
  parts.push(renderWeek(b));
  parts.push(renderLotto(b));
  parts.push(renderLearning(b));
  parts.push(renderParasha(b));
  parts.push(renderTehillim(b));
  parts.push(renderProverb(b));
  parts.push(renderSky(b));
  parts.push(renderAstro(b));
  parts.push(renderSystem(b));

  if ((b.errors || []).length) {
    parts.push(`<div class="daily-errors">הערות: ${b.errors.map(esc).join(" · ")}</div>`);
  }

  document.getElementById("content").innerHTML = parts.join("");
  wireAstroForm();
  wireScrollSpy();

  try {
    localStorage.setItem("dailyBriefSeen", b.date || new Date().toISOString().slice(0, 10));
  } catch { /* localStorage לא זמין */ }
}

// ---------- הדגשת המקטע הנוכחי בניווט ----------

let spyObserver = null;
function wireScrollSpy() {
  if (spyObserver) spyObserver.disconnect();
  const anchors = [...document.querySelectorAll(".daily-anchors a")];
  const byId = Object.fromEntries(anchors.map((a) => [a.getAttribute("href").slice(1), a]));
  spyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          anchors.forEach((a) => a.classList.remove("here"));
          byId[e.target.id]?.classList.add("here");
        }
      });
    },
    { rootMargin: "-20% 0px -70% 0px" }
  );
  document.querySelectorAll(".daily-section").forEach((s) => spyObserver.observe(s));
}

// ---------- טופס אסטרולוגיה ----------

async function wireAstroDate() {
  const inp = document.getElementById("astro-date");
  if (!inp) return;
  inp.addEventListener("change", async () => {
    const dyn = document.getElementById("astro-dynamic");
    const note = document.getElementById("astro-date-note");
    if (!inp.value) return;
    if (note) note.textContent = "מחשב…";
    try {
      const data = await fetch("/api/astro/reading?date=" + encodeURIComponent(inp.value)).then((r) => r.json());
      if (data.configured === false && !data.natal) {
        if (note) note.textContent = "אין מפת לידה מוגדרת";
        return;
      }
      dyn.innerHTML = astroReadingBody(data);
      if (note) note.textContent = "";
      wireAstroForm();
    } catch {
      if (note) note.textContent = "שגיאה בחישוב";
    }
  });
}

async function wireAstroForm() {
  wireAstroDate();
  const form = document.getElementById("astro-form");
  const edit = document.getElementById("astro-edit");
  if (edit) {
    edit.addEventListener("click", async (e) => {
      e.preventDefault();
      const cfg = await fetch("/api/astro/config").then((r) => r.json());
      const sec = document.getElementById("astro");
      sec.querySelector(".daily-card").innerHTML = `
        <form id="astro-form" class="astro-form">
          <label>תאריך לידה<input type="date" name="birthDate" value="${esc(cfg.birthDate || "")}" required></label>
          <label>שעת לידה<input type="time" name="birthTime" value="${esc(cfg.birthTime || "12:00")}"></label>
          <label>עיר לידה<select name="birthPlace" id="astro-city"></select></label>
          <button type="submit" class="btn primary">חשב מחדש</button>
        </form>`;
      wireAstroForm();
    });
  }
  if (!form) return;

  const citySel = document.getElementById("astro-city");
  try {
    const cfg = await fetch("/api/astro/config").then((r) => r.json());
    citySel.innerHTML = (cfg.cities || ["ירושלים"])
      .map((c) => `<option${c === (cfg.birthPlace || "ירושלים") ? " selected" : ""}>${esc(c)}</option>`)
      .join("");
  } catch {
    citySel.innerHTML = "<option>ירושלים</option>";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { birthDate: fd.get("birthDate"), birthTime: fd.get("birthTime"), birthPlace: fd.get("birthPlace") };
    if (!body.birthDate) return toast("נא להזין תאריך לידה", true);
    const btn = form.querySelector("button");
    btn.disabled = true;
    btn.textContent = "מחשב…";
    const res = await fetch("/api/astro/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then((r) => r.json());
    if (res.ok) {
      toast("מפת הלידה נשמרה — מרענן");
      load(true);
    } else {
      btn.disabled = false;
      btn.textContent = "חשב מפה";
      toast(res.error || "שגיאה", true);
    }
  });
}

// ---------- טעינה ----------

async function load(refresh) {
  const loading = document.getElementById("loading");
  if (loading) loading.textContent = refresh
    ? "כותב מחדש — לימוד היום, השמים, המזל והסיכום…"
    : "אוסף את היום — יומן, לימוד, שמים ומזל…";
  document.getElementById("btn-refresh").disabled = !!refresh;
  try {
    const path = "/api/daily-brief" + (refresh ? "?refresh=1" : "");
    const r = await PNKS.get(path, { timeout: refresh ? 120000 : 25000 });
    if (!r.ok) throw new Error(r.error || "השרת לא הגיב");
    render(r.data);
    showOfflineNote(r);
    if (refresh) toast(r.offline ? "אין חיבור לשרת — מוצג המידע השמור" : "המענה היומי עודכן");
  } catch (err) {
    document.getElementById("content").innerHTML =
      `<div class="daily-loading">לא הצלחתי לטעון את המענה היומי.<br>
       <span style="color:var(--danger)">${esc(err.message)}</span><br>
       ודא שהשרת של הפנקס פועל, ולחץ "רענן".</div>`;
  } finally {
    document.getElementById("btn-refresh").disabled = false;
  }
}

function showOfflineNote(r) {
  let el = document.getElementById("daily-offline-note");
  if (!r || (!r.offline && !r.stale && !r.computed)) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "daily-offline-note";
    el.style.cssText = "margin:10px auto;max-width:680px;padding:8px 14px;border-radius:10px;font-size:.82rem;" +
      "background:var(--surface-2,#2c231a);color:var(--cream-dim,#a3927a);border:1px solid var(--line,rgba(198,154,99,.2));text-align:center";
    const c = document.getElementById("content");
    c.parentNode.insertBefore(el, c);
  }
  const when = r.cachedAt ? " · " + (window.PNKS ? PNKS.cachedAtLabel(r.cachedAt) : "") : "";
  el.textContent = r.computed
    ? "מצב לא-מקוון — תאריך, פרשה ותהילים מחושבים במכשיר; שאר הנתונים מהעותק האחרון" + when
    : "מוצג המידע האחרון שנשמר במכשיר" + when;
}

document.getElementById("btn-refresh").addEventListener("click", () => load(true));
load(false);
