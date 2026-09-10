/* PNKS offline engine — הופך את הפנקס לאפליקציה עצמאית בכל מכשיר.
 *
 * כשיש שרת (המחשב דלוק, אותה רשת) — עובד רגיל מולו.
 * כשאין — מגיש מהמטמון (Cache Storage של ה-Service Worker) ומחשב מקומית בדפדפן
 * את מה שאפשר: תאריך עברי, פרשה, תהילים היומי, ספירה לחג, מדדים פיננסיים.
 *
 * דורש: /vendor/hebcal-core.min.js (נטען עצמאית בעת הצורך).
 * מרחיב את window.PNKS (מ-pnks-core.js).
 */
(function () {
  if (!window.PNKS || window.PNKS.__offline) return;
  window.PNKS.__offline = true;

  var LIVE_CACHE = "pnks-live-v1";
  var SNAP_PREFIX = "pnksSnap:";

  // ---------- מטמון תגובות ----------
  function snapKey(path) { return SNAP_PREFIX + path.split("?")[0]; }

  function saveSnapshot(path, data) {
    try {
      localStorage.setItem(snapKey(path), JSON.stringify({ at: Date.now(), data: data }));
    } catch (e) { /* מכסת localStorage — לא נורא */ }
    if (window.caches) {
      caches.open(LIVE_CACHE).then(function (c) {
        c.put(path, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "X-Pnks-Cached-At": String(Date.now()) } }));
      }).catch(function () {});
    }
  }

  function readSnapshot(path) {
    // 1) localStorage (מהיר, שורד ניקוי-מטמון)
    try {
      var raw = localStorage.getItem(snapKey(path));
      if (raw) { var o = JSON.parse(raw); return Promise.resolve({ data: o.data, at: o.at }); }
    } catch (e) {}
    // 2) Cache Storage (מה שה-SW או אנחנו שמרנו)
    if (window.caches) {
      return caches.match(path).then(function (r) {
        if (!r) return null;
        return r.json().then(function (data) {
          return { data: data, at: Number(r.headers.get("X-Pnks-Cached-At")) || 0 };
        });
      }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  // ---------- חישוב מקומי (hebcal) ----------
  var hebcalP = null;
  function loadHebcal() {
    if (hebcalP) return hebcalP;
    hebcalP = new Promise(function (resolve, reject) {
      if (window.hebcal) return resolve(window.hebcal);
      var s = document.createElement("script");
      s.src = "/vendor/hebcal-core.min.js";
      s.onload = function () { window.hebcal ? resolve(window.hebcal) : reject(new Error("hebcal not global")); };
      s.onerror = function () { reject(new Error("hebcal load failed")); };
      document.head.appendChild(s);
    });
    return hebcalP;
  }

  // תהילים לחודש — אותה חלוקה כמו lib/tehillim.js
  var MONTHLY = {
    1: [1, 9], 2: [10, 17], 3: [18, 22], 4: [23, 28], 5: [29, 34], 6: [35, 38],
    7: [39, 43], 8: [44, 48], 9: [49, 54], 10: [55, 59], 11: [60, 65], 12: [66, 68],
    13: [69, 71], 14: [72, 76], 15: [77, 78], 16: [79, 82], 17: [83, 87], 18: [88, 89],
    19: [90, 96], 20: [97, 103], 21: [104, 105], 22: [106, 107], 23: [108, 112], 24: [113, 118],
    25: [119, 119], 26: [119, 119], 27: [120, 134], 28: [135, 139], 29: [140, 144], 30: [145, 150]
  };
  var P119_SPLIT = 96;

  function chapName(n) {
    var ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    var tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    if (n < 10) return ones[n];
    if (n < 100) { if (n === 15) return "טו"; if (n === 16) return "טז"; return tens[Math.floor(n / 10)] + ones[n % 10]; }
    var rem = n % 100;
    return "ק" + (rem === 0 ? "" : rem < 10 ? ones[rem] : rem === 15 ? "טו" : rem === 16 ? "טז" : tens[Math.floor(rem / 10)] + ones[rem % 10]);
  }

  function chapterList(day, monthLen) {
    var days = (day === 29 && monthLen === 29) ? [29, 30] : [day];
    var chapters = [];
    days.forEach(function (d) {
      var r = MONTHLY[d] || [1, 1];
      for (var c = r[0]; c <= r[1]; c++) if (chapters.indexOf(c) < 0) chapters.push(c);
    });
    return {
      chapters: chapters,
      split119: days.indexOf(25) >= 0 ? "first" : days.indexOf(26) >= 0 ? "second" : null
    };
  }

  var bundleP = null;
  function loadTehillimBundle() {
    if (bundleP) return bundleP;
    bundleP = fetch("/library/tehillim-full.json").then(function (r) { return r.json(); })
      .then(function (j) { return j.chapters || {}; }).catch(function () { return {}; });
    return bundleP;
  }

  function cleanVerse(s) {
    return String(s).replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;|&thinsp;|&#8201;/g, " ")
      .replace(/&amp;/g, "&").replace(/&[a-z]+;|&#\d+;/gi, "").replace(/\s*\{[פס]\}\s*/g, " ")
      .replace(/\s{2,}/g, " ").trim();
  }

  var compute = {
    // תאריך עברי, פרשה, חגים קרובים
    hebrew: function () {
      return loadHebcal().then(function (H) {
        var now = new Date();
        var hd = new H.HDate();
        var loc = H.Location.lookup("Jerusalem");
        var dow = now.getDay();
        var sat = new Date(now); sat.setDate(now.getDate() + ((6 - dow + 7) % 7));
        var sedra = H.HebrewCalendar.calendar({ start: sat, end: sat, sedrot: true, il: true, location: loc });
        var par = sedra.find(function (ev) { return (ev.getFlags() & H.flags.PARSHA_HASHAVUA) !== 0; });
        var end = new Date(now); end.setDate(now.getDate() + 60);
        var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var hols = H.HebrewCalendar.calendar({ start: now, end: end, il: true, location: loc, sedrot: false })
          .filter(function (ev) { return (ev.getFlags() & H.flags.PARSHA_HASHAVUA) === 0; })
          .map(function (ev) {
            var d = ev.getDate().greg();
            var away = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t0) / 86400000);
            var f = ev.getFlags();
            return { date: d.toISOString().slice(0, 10), title: ev.render("he"), daysAway: away,
              isMajor: !!(f & (H.flags.CHAG | H.flags.MAJOR_FAST | H.flags.LIGHT_CANDLES_TZEIS)) };
          });
        return {
          hebrewDate: hd.render("he"),
          dayOfWeek: dow, isFriday: dow === 5,
          parasha: par ? par.render("he") : null,
          parashaDate: sat.toISOString().slice(0, 10),
          holidays: hols
        };
      });
    },

    // פרקי תהילים היום (שמות בלבד)
    tehillimChapters: function () {
      return loadHebcal().then(function (H) {
        var hd = new H.HDate();
        var cl = chapterList(hd.getDate(), hd.daysInMonth());
        return {
          hebrewDate: hd.render("he"),
          dayOfMonth: hd.getDate(),
          chapters: cl.chapters.map(chapName),
          range: cl.chapters.length > 1
            ? chapName(cl.chapters[0]) + "–" + chapName(cl.chapters[cl.chapters.length - 1])
            : chapName(cl.chapters[0])
        };
      });
    },

    // תהילים היומי המלא (טקסט מנוקד) — כמו /api/tehillim
    tehillim: function () {
      return Promise.all([loadHebcal(), loadTehillimBundle()]).then(function (res) {
        var H = res[0], bundle = res[1];
        var now = new Date();
        var hd = new H.HDate();
        var day = hd.getDate();
        var cl = chapterList(day, hd.daysInMonth());
        var sections = cl.chapters.map(function (ch) {
          var verses = (bundle[ch] || bundle[String(ch)] || []).map(cleanVerse);
          var range = null;
          if (ch === 119 && cl.split119 === "first") { verses = verses.slice(0, P119_SPLIT); range = "פסוקים א׳–צ״ו"; }
          else if (ch === 119 && cl.split119 === "second") { verses = verses.slice(P119_SPLIT); range = "פסוקים צ״ז–קע״ו"; }
          var base = (ch === 119 && cl.split119 === "second") ? P119_SPLIT + 1 : 1;
          return { n: ch, name: chapName(ch), range: range, verses: verses.map(function (v, i) { return { n: base + i, he: v }; }) };
        });
        return {
          date: now.toISOString().slice(0, 10),
          hebrewDate: hd.render("he"),
          dayOfMonth: day,
          monthName: hd.render("he").split(" ").slice(1).join(" "),
          chapters: cl.chapters.map(chapName),
          available: sections.some(function (s) { return s.verses.length; }),
          sections: sections,
          _computed: true
        };
      });
    },

    // מדדים פיננסיים — נמל מ-lib/financeAdvisor.js computeMetrics
    financeMetrics: function (d) {
      d = d || {};
      var num = function (v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^\d.\-]/g, "")); return isFinite(n) ? n : 0; };
      var income = num(d.netIncome), fixed = num(d.fixedExpenses), variable = num(d.variableExpenses);
      var debtPayments = num(d.mortgagePayment) + num(d.otherDebtPayment);
      var totalOut = fixed + variable + debtPayments;
      var surplus = income - totalOut;
      var savings = num(d.monthlySavings) || Math.max(0, surplus);
      var cash = num(d.cashSavings);
      var monthlyNeed = fixed + variable + debtPayments;
      var emergencyMonths = monthlyNeed > 0 ? +(cash / monthlyNeed).toFixed(1) : null;
      var dti = income > 0 ? +((debtPayments + num(d.expensiveDebt) * 0.03) / income * 100).toFixed(0) : null;
      var savingsRate = income > 0 ? +(savings / income * 100).toFixed(0) : null;
      var netWorth = cash + num(d.investments) + num(d.pension) - num(d.expensiveDebt) - num(d.mortgage);
      var split = income > 0 ? {
        needs: +((fixed + debtPayments) / income * 100).toFixed(0),
        wants: +(variable / income * 100).toFixed(0),
        save: savingsRate
      } : null;
      var flags = [];
      if (surplus < 0) flags.push({ level: "high", text: "ההוצאות החודשיות גבוהות מההכנסה — גירעון שוטף." });
      if (emergencyMonths != null && emergencyMonths < 1) flags.push({ level: "high", text: "אין כמעט קרן חירום (פחות מחודש הוצאות)." });
      else if (emergencyMonths != null && emergencyMonths < 3) flags.push({ level: "mid", text: "קרן חירום חלקית (" + emergencyMonths + " חודשים; היעד 3–6)." });
      if (num(d.expensiveDebt) > 0 && num(d.expensiveDebtRate) >= 8) flags.push({ level: "high", text: "חוב יקר בריבית גבוהה — עדיפות לכיסוי." });
      if (dti != null && dti > 43) flags.push({ level: "high", text: "יחס חוב-להכנסה גבוה (" + dti + "%)." });
      else if (dti != null && dti > 36) flags.push({ level: "mid", text: "יחס חוב-להכנסה על הגבול (" + dti + "%)." });
      if (savingsRate != null && savingsRate < 10 && surplus >= 0) flags.push({ level: "mid", text: "שיעור חיסכון נמוך (" + savingsRate + "%; היעד 15–20%)." });
      return { income: income, totalOut: totalOut, surplus: surplus, savings: savings,
        emergencyMonths: emergencyMonths, savingsRate: savingsRate, dti: dti, netWorth: netWorth,
        split: split, emergencyTarget: Math.round(monthlyNeed * 4), flags: flags, _computed: true };
    }
  };

  // הרכבת מענה יומי מקומי (כשאין שרת ואין מטמון טרי)
  function computeDailyBrief(cachedParts) {
    var parts = cachedParts || {};
    return Promise.all([
      compute.hebrew().catch(function () { return parts.hebrew || null; }),
      compute.tehillimChapters().catch(function () { return parts.tehillim || null; })
    ]).then(function (r) {
      var hebrew = r[0], tehillim = r[1];
      var skeleton = {
        date: new Date().toISOString().slice(0, 10),
        calendar: { today: [], tomorrow: [] },
        email: { configured: false, recent: [] },
        magnets: { total: 0, pending: [], recentlyReady: [] },
        inbox: [], system: { warnings: [] },
        security: { status: "unavailable", count: 0, events: [] },
        housing: { up: false, listings: [] },
        learning: { available: false },
        sky: null, astro: { configured: false, transits: null },
        systemPlus: null, proverb: null, recommendations: [],
        lotto: { available: false },
        weekCalendar: { configured: false, days: [] },
        shabbat: { available: false }, library: [],
        narrative: null, narrativeSource: null, errors: []
      };
      return Object.assign(skeleton, parts, {
        generatedAt: new Date().toISOString(),
        hebrew: hebrew,
        tehillim: tehillim,
        _computed: true,
        _partial: true
      });
    });
  }

  // ---------- עטיפת PNKS.get עם נפילה למטמון + חישוב ----------
  var netGet = window.PNKS.get.bind(window.PNKS);

  window.PNKS.get = function (path, opts) {
    opts = opts || {};
    return netGet(path, opts).then(function (res) {
      if (res && res.ok) {
        saveSnapshot(path, res.data);
        document.documentElement.classList.remove("pnks-offline");
        return res;
      }
      // אין רשת → מטמון → חישוב
      return readSnapshot(path).then(function (snap) {
        var base = path.split("?")[0];
        var wantCompute = /\/api\/(tehillim|daily-brief)$/.test(base);

        if (snap && snap.data && !(wantCompute && isStale(snap.at))) {
          return { ok: true, stale: true, offline: true, cachedAt: snap.at, data: snap.data };
        }

        if (base === "/api/tehillim") {
          return compute.tehillim().then(function (d) {
            saveSnapshot("/api/tehillim", d);
            return { ok: true, computed: true, offline: true, data: d };
          }).catch(function () {
            return snap ? { ok: true, stale: true, offline: true, cachedAt: snap.at, data: snap.data } : res;
          });
        }
        if (base === "/api/daily-brief") {
          return computeDailyBrief(snap && snap.data).then(function (d) {
            return { ok: true, computed: true, offline: true, cachedAt: snap && snap.at, data: d };
          }).catch(function () {
            return snap ? { ok: true, stale: true, offline: true, cachedAt: snap.at, data: snap.data } : res;
          });
        }
        if (snap && snap.data) return { ok: true, stale: true, offline: true, cachedAt: snap.at, data: snap.data };
        return res;
      });
    });
  };

  function isStale(ts) {
    if (!ts) return true;
    var d = new Date(ts), now = new Date();
    return d.toDateString() !== now.toDateString(); // תוכן יומי — "טרי" רק אם מאותו יום
  }

  window.PNKS.compute = compute;
  window.PNKS.cachedAtLabel = function (ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return "עודכן לאחרונה " + d.toLocaleDateString("he-IL", { day: "numeric", month: "long" }) +
      " " + d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  };
})();
