/* PNKS core — עטיפת fetch מול השרת + פס מצב חיבור.
   נטען ראשון בעמודים שצריכים אותו. pnks-offline.js מרחיב אותו לעבודה עצמאית בכל מכשיר. */
(function () {
  if (window.PNKS) return;

  function agoHe(ts) {
    if (!ts) return "מעולם";
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return "עכשיו";
    if (m < 60) return "לפני " + m + " ד'";
    var h = Math.round(m / 60);
    if (h < 24) return "לפני " + h + " ש'";
    return "לפני " + Math.round(h / 24) + " ימים";
  }

  var PNKS = {
    apiBase: function () { return ""; }, // תמיד same-origin (השרת המקומי)
    online: navigator.onLine,
    ago: agoHe,
    markSync: function () {},
    lastSync: function () { return 0; },

    /** GET JSON. מחזיר {ok, data} או {ok:false, offline:true}. */
    get: function (path, opts) {
      opts = opts || {};
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, opts.timeout || 15000);
      return fetch(path, { signal: ctrl.signal, cache: opts.cache || "default" })
        .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
          PNKS.online = true;
          document.documentElement.classList.remove("pnks-offline");
          return { ok: true, online: true, data: data };
        })
        .catch(function (e) {
          clearTimeout(to);
          PNKS.online = false;
          document.documentElement.classList.add("pnks-offline");
          return { ok: false, online: false, offline: true, error: (e && e.message) || "network" };
        });
    },

    /** POST JSON. */
    post: function (path, body, opts) {
      opts = opts || {};
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, opts.timeout || 120000);
      return fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal
      }).then(function (r) {
        clearTimeout(to);
        return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
      }).catch(function (e) {
        clearTimeout(to);
        return { ok: false, offline: true, error: (e && e.message) || "network" };
      });
    }
  };

  window.PNKS = PNKS;

  // ---- פס מצב חיבור (מוזרק פעם אחת) ----
  function mountBanner() {
    if (document.getElementById("pnks-conn")) return;
    var css = document.createElement("style");
    css.textContent =
      "#pnks-conn{position:fixed;top:0;inset-inline:0;z-index:120;display:none;" +
      "font-family:var(--font-mono,monospace);font-size:.72rem;text-align:center;" +
      "padding:5px 10px;background:var(--surface-2,#2c231a);color:var(--cream-dim,#a3927a);" +
      "border-bottom:1px solid var(--ember,#db8b42)}" +
      "html.pnks-offline #pnks-conn{display:block}" +
      "html.pnks-offline body{padding-top:26px}" +
      "#pnks-conn b{color:var(--ember,#db8b42)}" +
      "#pnks-conn button{background:none;border:1px solid var(--line,#3a2f22);color:inherit;" +
      "font:inherit;padding:1px 8px;margin-inline-start:8px;border-radius:2px;cursor:pointer}";
    document.head.appendChild(css);
    var bar = document.createElement("div");
    bar.id = "pnks-conn";
    bar.innerHTML = '<b>מצב לא-מקוון</b> — מוצג המידע האחרון שנשמר במכשיר. ' +
      '<button id="pnks-retry">התחבר מחדש</button>';
    document.body.appendChild(bar);
    document.getElementById("pnks-retry").addEventListener("click", function () { location.reload(); });
  }
  if (document.body) mountBanner();
  else document.addEventListener("DOMContentLoaded", mountBanner);

  window.addEventListener("online", function () { PNKS.online = true; document.documentElement.classList.remove("pnks-offline"); });
  window.addEventListener("offline", function () { PNKS.online = false; document.documentElement.classList.add("pnks-offline"); });

  // מנוע העבודה העצמאית נטען מיד אחרי הקובץ הזה (תג <script> מפורש ב-HTML,
  // לפני סקריפט העמוד) — כדי ש-PNKS.get כבר יהיה עטוף כשהעמוד קורא לו.
  // גיבוי: אם שכחו להוסיף אותו ב-HTML, טוענים דינמית (המטמון פשוט יתחיל מהטעינה הבאה).
  setTimeout(function () {
    if (!window.PNKS.__offline && !document.querySelector('script[src="/js/pnks-offline.js"]')) {
      var off = document.createElement("script");
      off.src = "/js/pnks-offline.js";
      document.head.appendChild(off);
    }
  }, 0);
})();
