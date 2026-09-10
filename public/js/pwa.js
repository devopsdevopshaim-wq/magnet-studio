// רישום Service Worker + הזמנה להתקנה כאפליקציה (מחשב, טלפון, טאבלט).
// כל מכשיר מתקין את המערכת שרצה עליו — לא מסונכרן, מותאם למכשיר.

(function () {
  if (window.__pwa) return;
  window.__pwa = true;

  // --- מטא-תגים שצריך לכל עמוד (מוזרקים אם חסרים) ---
  function meta(name, content, prop) {
    var key = prop ? "property" : "name";
    if (document.head.querySelector("meta[" + key + "='" + name + "']")) return;
    var m = document.createElement("meta");
    m.setAttribute(key, name); m.content = content;
    document.head.appendChild(m);
  }
  if (!document.head.querySelector("link[rel='manifest']")) {
    var l = document.createElement("link");
    l.rel = "manifest"; l.href = "/manifest.webmanifest";
    document.head.appendChild(l);
  }
  meta("theme-color", "#1b1611");
  meta("apple-mobile-web-app-capable", "yes");
  meta("mobile-web-app-capable", "yes");
  meta("apple-mobile-web-app-status-bar-style", "black-translucent");
  meta("apple-mobile-web-app-title", "הפנקס");
  if (!document.head.querySelector("link[rel='apple-touch-icon']")) {
    var at = document.createElement("link");
    at.rel = "apple-touch-icon"; at.href = "/icons/apple-touch-180.png";
    document.head.appendChild(at);
  }

  // --- רישום Service Worker ---
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", function () {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage("skipWaiting");
              toast("עודכנה גרסה חדשה — רענן לקבלתה", function () { location.reload(); }, "רענן");
            }
          });
        });
      }).catch(function () {});
    });
  }

  // --- הזמנה להתקנה ---
  var deferred = null;
  var DISMISS_KEY = "pwaInstallDismissed";
  function dismissed() { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch (e) { return false; } }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    if (!dismissed() && !isStandalone()) showInstallBar();
  });
  window.addEventListener("appinstalled", function () {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
    hideInstallBar();
    toast("הפנקס הותקן כאפליקציה ✓");
  });

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function showInstallBar() {
    if (document.getElementById("pwa-bar")) return;
    var bar = document.createElement("div");
    bar.id = "pwa-bar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "התקנת האפליקציה");
    bar.innerHTML =
      '<span class="pb-ic" aria-hidden="true">📔</span>' +
      '<span class="pb-tx">להתקין את הפנקס כאפליקציה על המכשיר הזה?</span>' +
      '<button class="pb-yes" type="button">התקן</button>' +
      '<button class="pb-no" type="button" aria-label="לא עכשיו">לא עכשיו</button>';
    document.body.appendChild(bar);
    bar.querySelector(".pb-yes").addEventListener("click", async function () {
      hideInstallBar();
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null;
    });
    bar.querySelector(".pb-no").addEventListener("click", function () {
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
      hideInstallBar();
    });
  }
  function hideInstallBar() {
    var b = document.getElementById("pwa-bar");
    if (b) b.remove();
  }

  // iOS Safari: אין beforeinstallprompt — רמז חד-פעמי
  function iosHint() {
    var ua = navigator.userAgent;
    var isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    if (isIos && !isStandalone() && !dismissed()) {
      toast('להתקנה: שתף ← "הוסף למסך הבית"', null, null, 5000);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
    }
  }
  setTimeout(iosHint, 3000);

  // --- CSS + toast ---
  var css = document.createElement("style");
  css.textContent = [
    "#pwa-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:9997;display:flex;align-items:center;gap:10px;flex-wrap:wrap;",
    "max-width:560px;margin:0 auto;padding:12px 14px;border-radius:16px;border:1px solid var(--line,rgba(198,154,99,.3));",
    "background:var(--surface-2,#2c231a);color:var(--cream,#f1e7d4);box-shadow:0 10px 34px rgba(0,0,0,.45);",
    "font:500 14px/1.35 var(--font-body,'Assistant',system-ui,sans-serif)}",
    "#pwa-bar .pb-ic{font-size:20px}",
    "#pwa-bar .pb-tx{flex:1;min-width:180px}",
    "#pwa-bar button{min-height:40px;padding:8px 16px;border-radius:10px;font:600 14px var(--font-body,sans-serif);cursor:pointer;border:1px solid var(--line,rgba(198,154,99,.3))}",
    "#pwa-bar .pb-yes{background:var(--brass,#c69a63);color:#1b1611;border-color:transparent}",
    "#pwa-bar .pb-no{background:transparent;color:var(--cream-dim,#a3927a)}",
    "#pwa-bar .pb-yes:focus-visible,#pwa-bar .pb-no:focus-visible{outline:3px solid var(--ember,#db8b42);outline-offset:2px}",
    ".pwa-toast{position:fixed;left:50%;bottom:150px;transform:translateX(-50%) translateY(10px);z-index:9999;display:flex;gap:10px;align-items:center;",
    "background:var(--surface-2,#2c231a);color:var(--cream,#f1e7d4);border:1px solid var(--line,rgba(198,154,99,.3));",
    "padding:10px 16px;border-radius:12px;font:500 14px var(--font-body,sans-serif);opacity:0;transition:opacity .3s,transform .3s;max-width:90vw}",
    ".pwa-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}",
    ".pwa-toast button{background:var(--brass,#c69a63);color:#1b1611;border:0;border-radius:8px;padding:6px 12px;font:600 13px var(--font-body,sans-serif);cursor:pointer;min-height:34px}"
  ].join("");
  document.head.appendChild(css);

  function toast(msg, action, actionLabel, ms) {
    var d = document.createElement("div");
    d.className = "pwa-toast";
    d.textContent = msg;
    if (action) {
      var b = document.createElement("button");
      b.textContent = actionLabel || "אישור";
      b.addEventListener("click", function () { action(); d.remove(); });
      d.appendChild(b);
    }
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add("show"); }, 10);
    setTimeout(function () { d.classList.remove("show"); setTimeout(function () { d.remove(); }, 300); }, ms || 4200);
  }
})();
