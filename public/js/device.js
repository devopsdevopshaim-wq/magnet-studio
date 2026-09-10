/* "המכשיר הזה" — קורא כל מה שהדפדפן חושף על המכשיר, ומעדכן חי. הכל מקומי, שום דבר לא נשלח. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var na = "לא נתמך";

  /* ---------- סוללה ---------- */
  var RING_LEN = 2 * Math.PI * 34; // 213.6
  function paintBattery(b) {
    var pct = Math.round(b.level * 100);
    $("dvBattPct").textContent = pct;
    var ring = $("dvRing");
    $("dvRingFill").style.strokeDashoffset = (RING_LEN * (1 - b.level)).toFixed(1);
    ring.setAttribute("class", "dv-ring" + (b.charging ? " charging" : pct <= 20 ? " low" : pct <= 45 ? " mid" : ""));
    var parts = [];
    parts.push(b.charging ? "בטעינה" : "מתרוקנת");
    if (b.charging && b.chargingTime && isFinite(b.chargingTime) && b.chargingTime > 0) {
      parts.push("מלאה בעוד " + fmtSec(b.chargingTime));
    } else if (!b.charging && b.dischargingTime && isFinite(b.dischargingTime) && b.dischargingTime > 0) {
      parts.push("נותרו ~" + fmtSec(b.dischargingTime));
    }
    $("dvBattState").textContent = parts.join(" · ");
  }
  function fmtSec(s) {
    var h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? h + " ש' " + m + " ד'" : m + " ד'";
  }
  function initBattery(triesLeft) {
    if (!navigator.getBattery) {
      $("dvBattPct").textContent = "—";
      $("dvBattState").textContent = na + " בדפדפן זה";
      return;
    }
    navigator.getBattery().then(function (b) {
      paintBattery(b);
      ["levelchange", "chargingchange", "chargingtimechange", "dischargingtimechange"].forEach(function (ev) {
        b.addEventListener(ev, function () { paintBattery(b); });
      });
    }).catch(function () {
      if (triesLeft > 0) setTimeout(function () { initBattery(triesLeft - 1); }, 800);
      else $("dvBattState").textContent = na + " בדפדפן זה";
    });
  }
  initBattery(3);

  /* ---------- רשת ---------- */
  var NET_HE = { slow_2g: "איטי מאוד (2G)", "2g": "2G", "3g": "3G", "4g": "4G / מהיר" };
  var NET_TYPE_HE = { wifi: "Wi-Fi", cellular: "סלולרי", ethernet: "כבל", none: "מנותק", bluetooth: "Bluetooth", wimax: "WiMAX", other: "אחר", unknown: "לא ידוע" };
  function paintNet() {
    $("dvNetOnline").textContent = navigator.onLine ? "מחובר" : "מנותק";
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) { $("dvNetType").textContent = navigator.onLine ? "מחובר" : "מנותק"; $("dvNetDown").textContent = na; $("dvNetRtt").textContent = na; $("dvNetSave").textContent = na; return; }
    $("dvNetType").textContent = c.type ? (NET_TYPE_HE[c.type] || c.type) : (NET_HE[c.effectiveType] || c.effectiveType || "—");
    $("dvNetDown").textContent = c.downlink != null ? c.downlink + " Mbps" : "—";
    $("dvNetRtt").textContent = c.rtt != null ? c.rtt + " ms" : "—";
    $("dvNetSave").textContent = c.saveData ? "פעיל" : "כבוי";
  }
  paintNet();
  window.addEventListener("online", paintNet);
  window.addEventListener("offline", paintNet);
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.addEventListener) conn.addEventListener("change", paintNet);

  /* ---------- חומרה ---------- */
  $("dvRam").textContent = navigator.deviceMemory ? "≈ " + navigator.deviceMemory + " GB" : na;
  $("dvCores").textContent = navigator.hardwareConcurrency || na;
  $("dvTouch").textContent = (navigator.maxTouchPoints || 0) > 0 ? (navigator.maxTouchPoints + " נקודות מגע") : "אין מסך מגע";
  try {
    var cv = document.createElement("canvas");
    var gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
    var dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    var r = dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    if (r) {
      var s = String(r);
      // "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "Intel UHD Graphics"
      var m = s.match(/\(([^,]+),\s*([^,]+?)(?:\s+Direct3D| \(| vs_| Metal|,)/i);
      var name = m ? (m[2] || m[1]) : s.replace(/^ANGLE\s*\(|\)$/g, "");
      $("dvGpu").textContent = name.replace(/\(R\)|\(TM\)/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    } else { $("dvGpu").textContent = na; }
  } catch (e) { $("dvGpu").textContent = na; }

  /* ---------- אחסון ---------- */
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(function (est) {
      var gb = function (n) { return (n / 1073741824).toFixed(n > 1073741824 ? 1 : 2); };
      var used = est.usage || 0, quota = est.quota || 0;
      $("dvStoreUsed").textContent = gb(used) + " GB";
      $("dvStoreSub").textContent = quota ? "מתוך ~" + gb(quota) + " GB שהדפדפן מקצה לאתר" : "";
      $("dvStoreBar").style.width = quota ? Math.min(100, (used / quota) * 100).toFixed(1) + "%" : "0%";
    }).catch(function () { $("dvStoreUsed").textContent = na; });
  } else {
    $("dvStoreUsed").textContent = na;
  }

  /* ---------- מסך ---------- */
  function paintScreen() {
    $("dvScreenRes").textContent = window.screen.width + " × " + window.screen.height;
    $("dvScreenDpr").textContent = "×" + (window.devicePixelRatio || 1);
    var o = (screen.orientation && screen.orientation.type) || (window.matchMedia("(orientation:portrait)").matches ? "portrait" : "landscape");
    $("dvScreenOrient").textContent = /portrait/.test(o) ? "לאורך" : "לרוחב";
  }
  paintScreen();
  window.addEventListener("resize", paintScreen);
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", paintScreen);
  // קצב רענון — מדידת דלתא בין פריימים
  (function measureHz() {
    var frames = 0, t0 = performance.now(), done = false;
    function finish(hz) {
      if (done) return; done = true;
      $("dvScreenHz").textContent = hz >= 20 ? "~" + hz + " Hz" : "—";
    }
    function tick(t) {
      frames++;
      if (t - t0 >= 1200) return finish(Math.round((frames * 1000) / (t - t0)));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    setTimeout(function () { finish(Math.round((frames * 1000) / (performance.now() - t0))); }, 2500);
  })();

  /* ---------- מערכת ודפדפן ---------- */
  function detectOsBrowser() {
    var ua = navigator.userAgent;
    var uad = navigator.userAgentData;
    var os = "—", br = "—";
    if (uad && uad.platform) os = uad.platform;
    else if (/Android[ /]([\d.]+)/.test(ua)) os = "Android " + RegExp.$1;
    else if (/iPhone OS ([\d_]+)/.test(ua)) os = "iOS " + RegExp.$1.replace(/_/g, ".");
    else if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) os = "iPadOS";
    else if (/Windows NT ([\d.]+)/.test(ua)) os = ({ "10.0": "Windows 10/11", "6.3": "Windows 8.1", "6.1": "Windows 7" }[RegExp.$1] || "Windows");
    else if (/Mac OS X ([\d_]+)/.test(ua)) os = "macOS " + RegExp.$1.replace(/_/g, ".");
    else if (/Linux/.test(ua)) os = "Linux";
    if (/Edg\/([\d.]+)/.test(ua)) br = "Edge " + RegExp.$1.split(".")[0];
    else if (/OPR\/([\d.]+)/.test(ua)) br = "Opera " + RegExp.$1.split(".")[0];
    else if (/SamsungBrowser\/([\d.]+)/.test(ua)) br = "Samsung Internet " + RegExp.$1.split(".")[0];
    else if (/Firefox\/([\d.]+)/.test(ua)) br = "Firefox " + RegExp.$1.split(".")[0];
    else if (/CriOS\/([\d.]+)/.test(ua)) br = "Chrome (iOS) " + RegExp.$1.split(".")[0];
    else if (/Chrome\/([\d.]+)/.test(ua)) br = "Chrome " + RegExp.$1.split(".")[0];
    else if (/Version\/([\d.]+).*Safari/.test(ua)) br = "Safari " + RegExp.$1.split(".")[0];
    $("dvOs").textContent = os;
    $("dvBrowser").textContent = br;
  }
  detectOsBrowser();
  $("dvLang").textContent = navigator.language || "—";
  try { $("dvTz").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "—"; } catch (e) { $("dvTz").textContent = "—"; }
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  $("dvPwa").textContent = standalone ? "מותקן (מסך מלא)" : "רץ בדפדפן";

  /* ---------- שעון "חי" ---------- */
  setInterval(function () {
    var d = new Date();
    $("dvClock").textContent = "חי · " + d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    paintNet();
  }, 1000);
})();
