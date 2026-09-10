/* דרושים — מיילי חיפוש עבודה + קישורי חיפוש בלוחות. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]); }); };

  var PICK_KEY = "jb_fields_v1";
  var DEFAULT_PICK = ["DevOps / SRE", "Cloud", "Data / BigData", "פיתוח / Backend"];
  var picked;
  try { picked = JSON.parse(localStorage.getItem(PICK_KEY) || "null"); } catch (e) { picked = null; }
  if (!Array.isArray(picked)) picked = DEFAULT_PICK.slice();

  var allFields = []; // [{field, query, boards:[{name,url}]}]

  // ---- מפת לוחות מקומית (עובד גם אופליין / מחשב כבוי) ----
  var BOARDS = [
    ["AllJobs", function (q) { return "https://www.alljobs.co.il/SearchResultsGuest.aspx?page=1&position=&type=&freetxt=" + encodeURIComponent(q) + "&city=&region="; }],
    ["דרושים", function (q) { return "https://www.drushim.co.il/jobs/search/" + encodeURIComponent(q) + "/"; }],
    ["JobMaster", function (q) { return "https://www.jobmaster.co.il/jobs/?q=" + encodeURIComponent(q); }],
    ["LinkedIn", function (q) { return "https://www.linkedin.com/jobs/search/?keywords=" + encodeURIComponent(q) + "&location=Israel"; }],
    ["Indeed", function (q) { return "https://il.indeed.com/jobs?q=" + encodeURIComponent(q); }],
    ["Google Jobs", function (q) { return "https://www.google.com/search?q=" + encodeURIComponent(q + " דרושים") + "&ibp=htl;jobs"; }]
  ];
  var FIELD_QUERY = {
    "DevOps / SRE": "DevOps SRE", "Cloud": "Cloud Engineer AWS Azure", "Data / BigData": "Data Engineer BigData",
    "פיתוח / Backend": "Backend Developer", "פיתוח / Frontend": "Frontend Developer React", "QA / בדיקות": "QA Automation",
    "ניהול מוצר / פרויקטים": "Product Manager", "עיצוב / UX": "UX UI Designer", "IT / תמיכה": "IT Support System Administrator",
    "אבטחת מידע": "Cyber Security", "מכירות / שיווק": "Sales Marketing", "כללי": "hi-tech"
  };
  function localBoards(q) { return BOARDS.map(function (b) { return { name: b[0], url: b[1](q) }; }); }
  function localFields() {
    return Object.keys(FIELD_QUERY).map(function (f) { return { field: f, query: FIELD_QUERY[f], boards: localBoards(FIELD_QUERY[f]) }; });
  }

  function savePick() { try { localStorage.setItem(PICK_KEY, JSON.stringify(picked)); } catch (e) {} }

  function boardLinks(boards) {
    return boards.map(function (b) {
      return '<a class="jb-board" href="' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(b.name) + " ↗</a>";
    }).join("");
  }

  function renderFieldPicker() {
    $("jb-fields-pick").innerHTML = allFields.map(function (f) {
      var on = picked.indexOf(f.field) >= 0;
      return '<label><input type="checkbox" value="' + esc(f.field) + '"' + (on ? " checked" : "") + ">" + esc(f.field) + "</label>";
    }).join("");
    $("jb-fields-pick").addEventListener("change", function (e) {
      if (e.target.type !== "checkbox") return;
      var v = e.target.value;
      var i = picked.indexOf(v);
      if (e.target.checked && i < 0) picked.push(v);
      else if (!e.target.checked && i >= 0) picked.splice(i, 1);
      savePick();
      renderFieldBlocks();
    });
  }

  function renderFieldBlocks() {
    var chosen = allFields.filter(function (f) { return picked.indexOf(f.field) >= 0; });
    var rest = allFields.filter(function (f) { return picked.indexOf(f.field) < 0; });
    var ordered = chosen.concat(rest);
    $("jb-fields-out").innerHTML = ordered.map(function (f, idx) {
      var dim = picked.indexOf(f.field) < 0;
      return '<div class="jb-field-block" style="' + (dim ? "opacity:.55" : "") + (idx ? ";margin-top:16px;border-top:1px solid var(--line);padding-top:14px" : "") + '">' +
        "<h3>" + esc(f.field) + "</h3>" +
        '<div class="q">חיפוש: ' + esc(f.query) + "</div>" +
        '<div class="jb-boards">' + boardLinks(f.boards) + "</div></div>";
    }).join("");
  }

  function renderFreeSearch() {
    var q = $("jb-free").value.trim();
    if (!q) { $("jb-free-boards").innerHTML = '<span class="jb-empty">הקלד מילת חיפוש כדי לקבל קישורים</span>'; return; }
    $("jb-free-boards").innerHTML = boardLinks(localBoards(q)); // מקומי — מיידי, עובד אופליין
  }

  // ---------- מיילים ----------
  function renderMails(d) {
    var card = $("jb-mails-card");
    if (!d || d.configured === false) {
      card.innerHTML = '<div class="jb-empty">מצב המיילים לא מוגדר — הגדר <code class="mono">MATON_API_KEY</code> וחבר Gmail ב-Maton כדי לראות כאן מיילי חיפוש עבודה.</div>';
      return;
    }
    if ($("jb-mail-updated") && d.updatedAt) $("jb-mail-updated").textContent = "עודכן " + new Date(d.updatedAt).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    var fields = Object.keys(d.byField || {});
    if (!fields.length) {
      card.innerHTML = '<div class="jb-empty">אין כרגע מיילי חיפוש עבודה במדגם' + (d.sampleSize ? " (" + d.sampleSize + " אחרונים)" : "") + ".</div>";
      return;
    }
    // תחומים שנבחרו קודם
    fields.sort(function (a, b) {
      var pa = picked.indexOf(a) >= 0 ? 0 : 1, pb = picked.indexOf(b) >= 0 ? 0 : 1;
      return pa - pb || d.byField[b].length - d.byField[a].length;
    });
    card.innerHTML = fields.map(function (f) {
      var list = d.byField[f];
      return '<div class="jb-mail-field"><h3>' + esc(f) + ' <span class="count">' + list.length + ' מיילים</span></h3>' +
        '<div class="jb-mail-list">' + list.slice(0, 8).map(function (m) {
          var subj = m.link
            ? '<a href="' + esc(m.link) + '" target="_blank" rel="noopener">' + esc(m.subject) + "</a>"
            : esc(m.subject);
          return '<div class="jb-mail"><span>' + subj + '</span><span class="who">' + esc((m.sender || "").replace(/<.*>/, "").trim().slice(0, 22)) + "</span></div>";
        }).join("") + "</div></div>";
    }).join("");
  }

  // ---------- טעינה ----------
  allFields = localFields();           // מיידי — מקומי
  renderFieldPicker();
  renderFieldBlocks();

  $("jb-free").addEventListener("input", function () {
    clearTimeout(renderFreeSearch._t);
    renderFreeSearch._t = setTimeout(renderFreeSearch, 350);
  });
  renderFreeSearch();

  // מיילים — מהשרת המקומי
  fetch("/api/jobs/emails")
    .then(function (r) { if (!r.ok) throw new Error("שרת"); return r.json(); })
    .then(function (d) {
      if (d && d.byField) renderMails(d);
      else $("jb-mails-card").innerHTML = '<div class="jb-empty">לא נמצאו מיילי חיפוש עבודה כרגע.</div>';
    })
    .catch(function () {
      $("jb-mails-card").innerHTML = '<div class="jb-empty">מיילי חיפוש עבודה — צריך שהשרת יפעל ומפתח Maton מוגדר (<code class="mono">setx MATON_API_KEY</code>). הקישורים למטה עובדים תמיד.</div>';
    });
})();
