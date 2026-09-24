/* כושר יומי — אימון היום, מחזור שבועי, וספריית תרגילים עם תמונות. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]); }); };

  var DAY_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var LOG_KEY = "fit_log_v1";
  function readLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function writeLog(l) { try { localStorage.setItem(LOG_KEY, JSON.stringify(l)); } catch (e) {} }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // ── יומן סטים בפועל (לא רק "בוצע/לא בוצע") ──
  var SETS_KEY = "fit_sets_v1";
  function readSets() { try { return JSON.parse(localStorage.getItem(SETS_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function writeSets(s) { try { localStorage.setItem(SETS_KEY, JSON.stringify(s)); } catch (e) {} }
  function targetSets(dose) {
    var m = /(\d+)\s*(?:–\d+)?\s*סטים/.exec(dose || "");
    return m ? parseInt(m[1], 10) : 1; // תרגיל בלי "סטים" מפורש (למשל הליכה) — יעד יחיד
  }
  function completedSets(dayKey, exId) {
    var d = readSets()[dayKey];
    return (d && d[exId]) || 0;
  }
  function setCompleted(dayKey, exId, n) {
    var s = readSets();
    if (!s[dayKey]) s[dayKey] = {};
    s[dayKey][exId] = Math.max(0, n);
    writeSets(s);
  }
  function syncDoneFromSets(dayKey, ids) {
    var allDone = ids.length > 0 && ids.every(function (id) {
      var e = exById(id);
      return e && completedSets(dayKey, id) >= targetSets(e.dose);
    });
    var l = readLog();
    if (allDone) l[dayKey] = true; else delete l[dayKey];
    writeLog(l);
    return allDone;
  }
  function streak(log) {
    var n = 0, d = new Date();
    for (var i = 0; i < 400; i++) {
      var k = d.toISOString().slice(0, 10);
      if (log[k]) n++;
      else if (i > 0) break;          // היום עצמו לא מנתק את הרצף
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  // אייקון גיבוי אם אין תמונה
  var FIG = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="24" cy="9" r="4"/><path d="M24 14v16M24 18l-9 6M24 18l9 6M24 30l-7 12M24 30l7 12"/></svg>';
  window.__ftImgFail = function (img) {
    var fb = img.nextElementSibling;
    img.style.display = "none";
    if (fb && fb.classList.contains("ft-ex-fallback")) fb.hidden = false;
  };

  var DATA = null;

  function exById(id) { return (DATA.exercises || []).find(function (e) { return e.id === id; }); }

  function renderToday() {
    var r = DATA.routine;
    var card = $("ft-today-card");
    var k = todayKey();
    var ids = r.ids || [];
    var doneToday = syncDoneFromSets(k, ids);
    var totalTarget = 0, totalDone = 0;
    var items = ids.map(function (id, i) {
      var e = exById(id);
      if (!e) return "";
      var target = targetSets(e.dose);
      var done = completedSets(k, id);
      totalTarget += target; totalDone += Math.min(done, target);
      var dots = "";
      for (var s = 1; s <= target; s++) {
        dots += '<button type="button" class="ft-set-dot' + (s <= done ? " on" : "") + '" data-id="' + esc(id) + '" data-n="' + s + '" title="סט ' + s + '"></button>';
      }
      return '<div class="ft-routine-item' + (done >= target ? " is-done" : "") + '"><span class="n">' + (i + 1) + '</span>' +
        '<a href="#ex-' + esc(id) + '"><span class="nm">' + esc(e.name) + "</span></a>" +
        '<span class="ds">' + esc(e.dose) + "</span>" +
        '<span class="ft-sets">' + dots + "</span></div>";
    }).join("");
    card.innerHTML =
      '<div class="ft-focus">' + esc(r.name) + "</div>" +
      '<div class="ft-focus-sub">' + esc(r.focus) + "</div>" +
      '<div class="ft-routine-list">' + items + "</div>" +
      '<div class="ft-done-row">' +
      '<button class="btn primary ft-done' + (doneToday ? " is-done" : "") + '" id="ft-done-btn">' +
      (doneToday ? "✓ בוצע היום" : "סמן הכל כבוצע") + "</button>" +
      '<span class="ft-streak">רצף נוכחי: <b id="ft-streak-n">' + streak(readLog()) + "</b> ימים</span>" +
      '<span class="ft-vol">נפח היום: <b>' + totalDone + "/" + totalTarget + "</b> סטים</span>" +
      "</div>";
    card.querySelectorAll(".ft-set-dot").forEach(function (dot) {
      dot.addEventListener("click", function () {
        var id = dot.dataset.id, n = parseInt(dot.dataset.n, 10);
        var cur = completedSets(k, id);
        setCompleted(k, id, cur === n ? n - 1 : n); // לחיצה על הנקודה הפעילה האחרונה — ביטול
        renderToday();
        renderWeek();
      });
    });
    $("ft-done-btn").addEventListener("click", function () {
      var allDone = ids.every(function (id) { var e = exById(id); return e && completedSets(k, id) >= targetSets(e.dose); });
      ids.forEach(function (id) {
        var e = exById(id);
        if (!e) return;
        setCompleted(k, id, allDone ? 0 : targetSets(e.dose));
      });
      renderToday();
      renderWeek();
    });
  }

  function renderWeek() {
    var log = readLog();
    // תאריך של יום ראשון בשבוע הנוכחי
    var now = new Date();
    var sunday = new Date(now); sunday.setDate(now.getDate() - now.getDay());
    $("ft-week").innerHTML = (DATA.week || []).map(function (w) {
      var d = new Date(sunday); d.setDate(sunday.getDate() + w.day);
      var k = d.toISOString().slice(0, 10);
      var isToday = w.day === DATA.today;
      var isDone = !!log[k];
      return '<div class="ft-day' + (isToday ? " today" : "") + (isDone ? " done" : "") + '">' +
        '<div class="dn">' + DAY_HE[w.day] + "</div>" +
        '<div class="df">' + esc(w.focus.split("—")[0].split("·")[0].trim().slice(0, 22)) + "</div></div>";
    }).join("");
  }

  function exImg(e) {
    if (e.video && e.video.thumb) {
      return '<div class="ft-ex-video" data-video-id="' + esc(e.video.videoId) + '" data-title="' + esc(e.name) + '">' +
        '<img class="ft-ex-img" src="' + esc(e.video.thumb) + '" alt="' + esc(e.name) + '" loading="lazy">' +
        '<button type="button" class="ft-ex-play" aria-label="צפה בהדגמה">▶</button></div>';
    }
    var figs = window.EXERCISE_FIGURES || {};
    if (figs[e.id]) return '<div class="ft-ex-fallback">' + figs[e.id] + "</div>";
    return '<div class="ft-ex-fallback">' + FIG + "</div>";
  }

  function playExerciseVideo(box) {
    var vid = box.dataset.videoId;
    if (!vid) return;
    box.innerHTML = '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(vid) +
      '?autoplay=1&playsinline=1" title="' + esc(box.dataset.title || "") +
      '" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen class="ft-ex-iframe"></iframe>';
  }

  function renderLibrary() {
    var ex = DATA.exercises || [];
    $("ft-lib-count").textContent = ex.length + " תרגילים";
    $("ft-lib").innerHTML = ex.map(function (e) {
      return '<article class="ft-ex" id="ex-' + esc(e.id) + '">' +
        exImg(e) +
        '<div class="ft-ex-body">' +
        "<h3>" + esc(e.name) + "</h3>" +
        '<div class="ft-meta">' + (e.targets || []).map(function (t) { return '<span class="ft-tag">' + esc(t) + "</span>"; }).join("") +
        '<span class="ft-tag">' + esc(e.level) + "</span>" +
        (e.equipment && e.equipment !== "ללא" ? '<span class="ft-tag">' + esc(e.equipment) + "</span>" : "") + "</div>" +
        '<div class="ft-dose">' + esc(e.dose) + "</div>" +
        "<details><summary>איך מבצעים</summary>" +
        "<ol>" + (e.steps || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
        (e.cues && e.cues.length ? '<div class="ft-sub-h">דגשים</div><ul>' + e.cues.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "") +
        (e.mistakes && e.mistakes.length ? '<div class="ft-sub-h">טעויות נפוצות</div><ul class="ft-mistakes">' + e.mistakes.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>" : "") +
        "</details>" +
        "</div></article>";
    }).join("");
    $("ft-lib").querySelectorAll(".ft-ex-play").forEach(function (btn) {
      btn.addEventListener("click", function () { playExerciseVideo(btn.closest(".ft-ex-video")); });
    });
    $("ft-lib").querySelectorAll(".ft-ex-video .ft-ex-img").forEach(function (img) {
      img.addEventListener("click", function () { playExerciseVideo(img.closest(".ft-ex-video")); });
    });
  }

  function boot(d, offline) {
    if (!d || !d.exercises || !d.exercises.length) {
      $("ft-today-card").innerHTML = '<div class="ft-empty">ספריית התרגילים לא נטענה — ודא שהשרת פועל.</div>';
      return;
    }
    DATA = d;
    if (typeof d.today !== "number") d.today = new Date().getDay();
    if (!d.routine) d.routine = (d.week || []).find(function (w) { return w.day === d.today; }) || (d.week || [])[0];
    $("ft-date").textContent = DAY_HE[d.today] + " · " + new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long" }) +
      (offline ? " · אופליין" : "");
    $("ft-foot").innerHTML = "תרגול משקל-גוף לבסיס כושר, מבוסס הנחיות ACSM / AHA / NHS. " + esc(d.note || "") +
      ' · לפירוט מלא: <a href="/health.html">מצפן בריאות</a>.';
    renderToday();
    renderWeek();
    renderLibrary();
    if (location.hash && $(location.hash.slice(1))) $(location.hash.slice(1)).scrollIntoView();
  }

  fetch("/api/fitness")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { boot(d, false); })
    .catch(function () { boot(null, false); });
})();
