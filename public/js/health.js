/* מצפן בריאות — סינון, טופס, ספר עיון, וניתוח אישי דרך מנוע ה-AI המקומי. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var toastEl = $("toast");
  function toast(msg, bad) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (bad ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.className = "toast"; }, 3000);
  }

  /* ---------- דגלים אדומים ---------- */
  var FLAGS = [
    "ירידה לא-מכוונת במשקל (מעל 5% תוך 6–12 חודשים)",
    "דם בצואה, צואה שחורה או דימום מהפי הטבעת",
    "הקאות מתמשכות או קושי / כאב בבליעה",
    "כאב בטן חמור, מתגבר, או כאב שמעיר משינה",
    "חום ממושך או הזעות לילה",
    "אנמיה או עייפות קיצונית חדשה",
    "שינוי מתמשך בהרגלי היציאות מעל גיל 50, או גוש נמוש בבטן",
    "נפיחות בטנית מהירה ומתמשכת עם תחושת מלאות מוקדמת",
    "קוצר נשימה, או בטן קשה ותפוחה שמתפתחת מהר",
    "היסטוריה משפחתית קרובה של סרטן מעי גס או שחלה"
  ];
  var flagGrid = $("hcFlagGrid");
  FLAGS.forEach(function (t, i) {
    var l = document.createElement("label");
    l.className = "hc-chk";
    l.innerHTML = '<input type="checkbox" data-flag="' + i + '"><span>' + t + "</span>";
    flagGrid.appendChild(l);
  });
  function checkedFlags() {
    return [].slice.call(document.querySelectorAll("[data-flag]:checked")).map(function (c) { return FLAGS[+c.dataset.flag]; });
  }
  function updateFlags() {
    var f = checkedFlags();
    var el = $("hcFlagResult");
    if (f.length) {
      el.className = "hc-flag-result alarm";
      el.innerHTML = "<strong>סימנת " + f.length + " סימן/ים שמצריכים בירור רפואי.</strong> מומלץ לפנות לרופא/ה משפחה (או למיון אם הסימן חריף) לפני התחלת דיאטה או תוכנית עצמאית. אפשר עדיין למלא נתונים ולקבל תמצית — אך הבירור קודם.";
    } else {
      el.className = "hc-flag-result";
      el.textContent = "לא סומנו דגלים אדומים. אפשר להמשיך לאיסוף הנתונים.";
    }
  }
  flagGrid.addEventListener("change", updateFlags);

  /* ---------- צ'יפים ---------- */
  var CONCERNS = ["עלייה במשקל", "קושי לרדת במשקל", "נפיחות בבטן", "גזים", "אצירת נוזלים / בצקת", "תחושת מלאות אחרי אוכל", "עצירות", "שלשולים", "צרבת / ריפלוקס", "אכילה רגשית / התקפי אכילה", "עייפות אחרי ארוחות", "כאבי בטן"];
  var CONDITIONS = ["סוכרת / טרום-סוכרת", "תת-פעילות בלוטת התריס", "PCOS", "יתר לחץ דם", "כולסטרול גבוה", "כבד שומני", "מעי רגיז (IBS)", "צליאק / רגישות לגלוטן", "אי-סבילות ללקטוז", "דום נשימה בשינה", "אין"];
  function fillChips(host, arr, name) {
    arr.forEach(function (t) {
      var l = document.createElement("label");
      l.innerHTML = '<input type="checkbox" name="' + name + '" value="' + t + '">' + t;
      host.appendChild(l);
    });
  }
  fillChips($("hcConcerns"), CONCERNS, "concern");
  fillChips($("hcConditions"), CONDITIONS, "condition");

  /* ---------- BMI ---------- */
  ["height", "weight", "waist", "sex"].forEach(function (id) { $(id).addEventListener("input", calcBMI); });
  function calcBMI() {
    var h = parseFloat($("height").value), w = parseFloat($("weight").value);
    var out = $("hcReadout");
    if (!h || !w || h < 100 || w < 20) { out.hidden = true; return; }
    var bmi = w / Math.pow(h / 100, 2);
    $("bmiVal").textContent = bmi.toFixed(1);
    var cls = bmi < 18.5 ? "תת-משקל" : bmi < 25 ? "תקין" : bmi < 30 ? "עודף משקל"
      : bmi < 35 ? "השמנה 1" : bmi < 40 ? "השמנה 2" : "השמנה 3";
    $("bmiClass").textContent = cls;
    var bmiCell = $("bmiVal").parentElement;
    bmiCell.className = "cell" + (bmi >= 30 ? " bad" : bmi >= 25 ? " warn" : bmi >= 18.5 ? " ok" : " warn");
    var waist = parseFloat($("waist").value), sex = $("sex").value, wr = "—", wrCls = "";
    if (waist && sex) {
      var hi = sex === "male" ? 102 : 88, mid = sex === "male" ? 94 : 80;
      if (waist >= hi) { wr = "סיכון גבוה"; wrCls = " bad"; }
      else if (waist >= mid) { wr = "סיכון מוגבר"; wrCls = " warn"; }
      else { wr = "תקין"; wrCls = " ok"; }
    }
    $("waistRisk").textContent = wr;
    $("waistRisk").parentElement.className = "cell" + wrCls;
    out.hidden = false;
  }

  /* ---------- שמירה מקומית ---------- */
  var TEXT_IDS = ["age", "sex", "height", "weight", "waist", "goalWeight", "concernText", "duration", "pattern",
    "meds", "history", "meals", "window", "upf", "drinks", "sleep", "stress", "aerobic", "strength", "steps", "limits", "goals"];
  var KEY = "hc_intake_v1";
  function collect() {
    var d = {};
    TEXT_IDS.forEach(function (id) { d[id] = $(id).value.trim(); });
    d.concern = [].slice.call(document.querySelectorAll('input[name="concern"]:checked')).map(function (c) { return c.value; });
    d.condition = [].slice.call(document.querySelectorAll('input[name="condition"]:checked')).map(function (c) { return c.value; });
    d.flags = checkedFlags();
    return d;
  }
  function restore(d) {
    if (!d) return;
    TEXT_IDS.forEach(function (id) { if (d[id] != null) $(id).value = d[id]; });
    (d.concern || []).forEach(function (v) { var c = document.querySelector('input[name="concern"][value="' + v + '"]'); if (c) c.checked = true; });
    (d.condition || []).forEach(function (v) { var c = document.querySelector('input[name="condition"][value="' + v + '"]'); if (c) c.checked = true; });
    calcBMI();
  }
  function save(silent) {
    try {
      localStorage.setItem(KEY, JSON.stringify(collect()));
      if (!silent) { var b = $("hcSave"); var o = b.textContent; b.textContent = "נשמר ✓"; setTimeout(function () { b.textContent = o; }, 1400); }
    } catch (e) { /* localStorage לא זמין */ }
  }
  try { restore(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) {}
  updateFlags();
  $("hcForm").addEventListener("input", function () { save(true); });
  $("hcSave").addEventListener("click", function () { save(false); });
  $("hcClear").addEventListener("click", function () {
    if (!confirm("לאפס את כל הנתונים שהוזנו?")) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  });

  /* ---------- ניתוח אישי דרך השרת ---------- */
  var lastReport = "", lastSource = "";

  // פרומפט מקומי לניתוח דרך JARVIS Cloud כשאין שרת (פורט מ-lib/healthAdvisor.js)
  var KB_SUMMARY = [
    'תזונה: הגורם המכריע הוא גירעון קלורי בר-התמדה (~500 קק"ל/יום, ~0.5 ק"ג/שבוע). בסיס ים-תיכוני; להפחית קודם סוכר, משקאות ממותקים, אלכוהול ופחמימות מזוקקות; חלבון 1.2-1.6 ג\'/ק"ג/יום; סיבים 25-30+ ג\'/יום; אפשר חלון אכילה 10-12 שעות.',
    "פעילות: 150-300 דק'/שבוע אירובי מתון + 2+ ימי כוח. לירידה משמעותית 225-300+ דק'/שבוע. עלייה הדרגתית ~10%/שבוע. 7,000-10,000 צעדים/יום; הליכה 10-15 דק' אחרי ארוחה.",
    "נפיחות: רוב הכרונית תפקודית. קו ראשון FODMAP נמוך ב-3 שלבים בליווי דיאטנית. ארוחות קבועות ולא גדולות, טיפול בעצירות, ניסיון הפחתת לקטוז שבועיים, פרוביוטיקה 4 שבועות, שמן מנטה. לשלול צליאק/IBD/SIBO אצל רופא.",
    "נוסף: שינה 7-9 ש'; ניהול מתח; לבדוק תרופות שמעלות משקל. GLP-1 קו ראשון תרופתי ל-BMI>=30 או >=27 עם מחלה נלווית - במרשם ובמעקב."
  ].join("\n\n");
  var LBL = { age: "גיל", sex: "מין", height: 'גובה ס"מ', weight: 'משקל ק"ג', waist: 'היקף מותן', goalWeight: "משקל יעד", concernText: "תיאור", duration: "משך", pattern: "דפוס", meds: "תרופות", history: "רקע רפואי", meals: "ארוחות ביום", window: "חלון אכילה", upf: "מזון מעובד", drinks: "משקאות ממותקים", sleep: "שינה", stress: "מתח", aerobic: "אירובי/שבוע", strength: "ימי כוח", steps: "צעדים", limits: "מגבלות", goals: "מטרות" };
  function buildClientPrompt(d) {
    var L = ["אתה עוזר בריאות שמנסח תוכנית מבוססת-הנחיות בעברית. אינך רופא, אינך מאבחן. אל תמציא נתונים שלא נמסרו.",
      "כתוב תוכנית אישית קונקרטית ומספרית עם כותרות מודגשות (**): 1. תמונת מצב 2. דגלים אדומים 3. תזונה 4. פעילות 4 שבועות 5. נפיחות ועיכול 6. גורמים נוספים 7. מעקב 8. סייג. עד ~600 מילים.", "", "=== נתוני המשתמש ==="];
    Object.keys(LBL).forEach(function (k) { if (d[k]) L.push(LBL[k] + ": " + d[k]); });
    if (d.concern && d.concern.length) L.push("תסמינים: " + d.concern.join(", "));
    if (d.condition && d.condition.length) L.push("רקע: " + d.condition.join(", "));
    if (d.flags && d.flags.length) L.push("דגלים אדומים שסומנו: " + d.flags.join("; "));
    var h = parseFloat(d.height), w = parseFloat(d.weight);
    if (h > 100 && w > 20) L.push("BMI מחושב: " + (w / Math.pow(h / 100, 2)).toFixed(1));
    L.push("", "=== תמצית ההנחיות ===", KB_SUMMARY);
    return L.join("\n");
  }

  $("hcAnalyze").addEventListener("click", function () {
    var d = collect();
    var filled = TEXT_IDS.filter(function (id) { return d[id]; }).length + d.concern.length;
    if (filled < 3) {
      toast("מלאו לפחות כמה שדות בסיס (גיל, גובה, משקל ומה מטריד) לפני הניתוח.", true);
      location.hash = "#intake";
      return;
    }
    save(true);
    var out = $("hcOut");
    var btn = $("hcAnalyze");
    out.className = "hc-analysis";
    out.innerHTML = '<span class="hc-thinking">מנתח מול ההנחיות<span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
    btn.disabled = true;
    btn.textContent = "מנתח…";

    fetch("/api/health/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
      if (!res) return;
      if (res && res.ok) {
        lastReport = res.text;
        lastSource = res.source || "";
        out.className = "hc-analysis";
        out.textContent = res.text;
        if (lastSource) {
          var s = document.createElement("span");
          s.className = "src";
          s.textContent = "נכתב ע\"י " + lastSource;
          out.appendChild(s);
        }
        $("hcExport").hidden = false;
      } else {
        out.className = "hc-analysis empty";
        out.textContent = res.error || "לא ניתן היה להפיק את הניתוח כרגע.";
      }
    }).catch(function () {
      out.className = "hc-analysis empty";
      out.textContent = "אין חיבור לשרת המקומי. ודאו שהשרת רץ ונסו שוב.";
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = "נתח את המקרה שלי";
    });
  });

  /* ---------- ייצוא Markdown ---------- */
  $("hcExport").addEventListener("click", function () {
    if (!lastReport) return;
    var d = collect();
    var md = "# מצפן בריאות — סיכום אישי\n\nתאריך: " + new Date().toLocaleDateString("he-IL") + "\n\n## נתונים שהוזנו\n\n";
    TEXT_IDS.forEach(function (id) { if (d[id]) md += "- " + id + ": " + d[id] + "\n"; });
    if (d.concern.length) md += "- תסמינים: " + d.concern.join(", ") + "\n";
    if (d.condition.length) md += "- רקע: " + d.condition.join(", ") + "\n";
    if (d.flags.length) md += "- דגלים אדומים: " + d.flags.join("; ") + "\n";
    md += "\n## התוכנית האישית\n\n" + lastReport + "\n";
    if (lastSource) md += "\n_נכתב ע\"י " + lastSource + "_\n";
    md += "\n---\nמידע כללי, אינו תחליף לייעוץ רפואי.\n";
    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "מצפן-בריאות-סיכום.md";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  /* ---------- המצפן: המחט עוקבת אחרי השלב שנצפה ---------- */
  var ticks = $("hcTicks");
  for (var i = 0; i < 72; i++) {
    var a = (i / 72) * Math.PI * 2;
    var long = i % 9 === 0;
    var r1 = long ? 68 : 72, r2 = 76;
    var x1 = 84 + Math.sin(a) * r1, y1 = 84 - Math.cos(a) * r1;
    var x2 = 84 + Math.sin(a) * r2, y2 = 84 - Math.cos(a) * r2;
    var ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    ln.setAttribute("class", "tick");
    ln.setAttribute("x1", x1.toFixed(1)); ln.setAttribute("y1", y1.toFixed(1));
    ln.setAttribute("x2", x2.toFixed(1)); ln.setAttribute("y2", y2.toFixed(1));
    ln.setAttribute("stroke-width", long ? "1" : "0.5");
    ln.setAttribute("opacity", long ? "0.9" : "0.4");
    ticks.appendChild(ln);
  }
  var STEPS = ["screener", "intake", "knowledge", "analysis"];
  var needle = $("hcNeedle"), needleTail = $("hcNeedleTail");
  var current = -1;
  function pointTo(idx) {
    if (idx === current || idx < 0) return;
    current = idx;
    var deg = idx * 90;
    needle.style.transform = "rotate(" + deg + "deg)";
    needleTail.style.transform = "rotate(" + deg + "deg)";
  }
  function syncNeedle() {
    var line = window.scrollY + window.innerHeight * 0.45;
    var active = 0;
    STEPS.forEach(function (id, i) {
      var el = $(id);
      if (el && el.offsetTop <= line) active = i;
    });
    // קרוב לתחתית הדף — השלב האחרון פעיל תמיד
    if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 4) active = STEPS.length - 1;
    pointTo(active);
  }
  var lastSync = 0;
  window.addEventListener("scroll", function () {
    var now = Date.now();
    if (now - lastSync < 120) return;
    lastSync = now;
    syncNeedle();
  }, { passive: true });
  syncNeedle();
})();
