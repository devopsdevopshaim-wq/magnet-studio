// עוזר JARVIS - כל הקריאות עוברות דרך /api/jarvis/* (same-origin, פותר CORS).
// היסטוריית השיחה ומזהה ה-session נשמרים ב-localStorage של הדפדפן.

const GREETING = "שלום, כאן JARVIS. איך אפשר לעזור?";

const $ = (s) => document.querySelector(s);
const chatEl = $("#chat");
const inputEl = $("#input");
const sendBtn = $("#btn-send");
const statusDot = $("#status-dot");
const statusText = $("#status-text");
const toastEl = $("#toast");

let busy = false;

// ---------- הדמות ----------
const avatar = (window.JarvisAvatar && document.getElementById("jarvis-avatar"))
  ? window.JarvisAvatar.create(document.getElementById("jarvis-avatar"), { size: "lg" })
  : { setState() {}, attachAudio() {}, flapWhile() {} };

function faceState(s) { avatar.setState(s); }

function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.className = "toast"), 3000);
}

// ---------- session + history ----------

function loadSession() {
  try {
    let id = localStorage.getItem("jarvisSessionId");
    if (!id) {
      id = "jarvis-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
      localStorage.setItem("jarvisSessionId", id);
    }
    return id;
  } catch {
    return "jarvis-" + Date.now();
  }
}
let sessionId = loadSession();

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem("jarvisHistory") || "[]");
  } catch {
    return [];
  }
}
function saveHistory(h) {
  try {
    localStorage.setItem("jarvisHistory", JSON.stringify(h.slice(-100)));
  } catch { /* ignore */ }
}
let history = loadHistory();

function newSession() {
  try {
    localStorage.removeItem("jarvisHistory");
    localStorage.setItem(
      "jarvisSessionId",
      (sessionId = "jarvis-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()))
    );
  } catch { /* ignore */ }
  history = [];
  chatEl.innerHTML = "";
  addBot(GREETING, { save: false });
}

// ---------- rendering ----------

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// מרנדר טקסט פשוט + `code` inline + **bold**
function fmt(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function addMsg(role, text, { save = true, error = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "jmsg " + (role === "user" ? "user" : "bot") + (error ? " error" : "");
  wrap.innerHTML = `<div class="avatar">${role === "user" ? "א" : "J"}</div><div class="bubble">${fmt(text)}</div>`;
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (save) {
    history.push({ role, text });
    saveHistory(history);
  }
}
const addUser = (t) => addMsg("user", t);
const addBot = (t, opts) => addMsg("bot", t, opts);

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "jmsg bot";
  wrap.id = "typing";
  wrap.innerHTML = `<div class="avatar">J</div><div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function hideTyping() {
  const t = $("#typing");
  if (t) t.remove();
}

// ---------- networking ----------

async function send(text) {
  text = (text || "").trim();
  if (busy || !text) return;
  busy = true;
  sendBtn.disabled = true;
  addUser(text);
  inputEl.value = "";
  autoGrow();
  showTyping();
  faceState("thinking");

  try {
    let res, data = {};
    try {
      res = await fetch("/api/jarvis/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatInput: text, sessionId })
      });
      data = await res.json().catch(() => ({}));
    } catch (e) { res = { ok: false }; }

    hideTyping();
    if (res.ok && data.ok) {
      const reply = data.reply || "_(לא התקבל טקסט תשובה מהוורקפלואו)_";
      addBot(reply);
      setStatus("ok", "מחובר ל-n8n");
      if (typeof voice !== "undefined" && voice.isEnabled()) voice.speak(reply);
      else faceState("idle");
    } else if (data.hint) {
      addBot(`**${data.hint}**` + (data.detail ? `\n\n\`${esc(data.detail)}\`` : ""), { error: true });
      setStatus(data.status === 404 ? "bad" : "ok", data.status === 404 ? "ה-workflow כבוי" : "שגיאת n8n");
      faceState("idle");
    } else {
      addBot(`**לא הצלחתי להגיע ל-n8n.**\n\n${esc(data.error || "שגיאה לא ידועה")}`, { error: true });
      setStatus("bad", "אין חיבור");
      faceState("idle");
    }
  } catch (err) {
    hideTyping();
    addBot(`**שגיאת רשת מול השרת המקומי.**\n\n\`${esc(err.message)}\``, { error: true });
    setStatus("bad", "אין חיבור");
    faceState("idle");
  } finally {
    busy = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function setStatus(kind, text) {
  statusDot.className = "dot" + (kind ? " " + kind : "");
  statusText.textContent = text;
}

async function ping() {
  setStatus("", "בודק חיבור…");
  try {
    const cfg = await fetch("/api/jarvis/config").then((r) => r.json());
    const where = cfg.target === "cloud" ? "n8n Cloud" : `n8n מקומי (${(cfg.localBase || "").replace(/^https?:\/\//, "")})`;
    setStatus("", `${where} · שלח הודעה לבדיקה`);
  } catch {
    setStatus("bad", "השרת המקומי לא נגיש");
  }
}

// ---------- composer ----------

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}
inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send(inputEl.value);
  }
});
sendBtn.addEventListener("click", () => send(inputEl.value));

document.querySelectorAll(".jarvis-chips .chip").forEach((c) => {
  c.addEventListener("click", () => {
    const p = c.dataset.prefix;
    const stripped = inputEl.value.replace(/^(שלח לכל המחלקות: |מחקר: |תכנון: |קוד: |דעה שנייה: )/, "");
    inputEl.value = p + stripped;
    inputEl.focus();
    autoGrow();
  });
});

$("#btn-new-chat").addEventListener("click", () => {
  if (confirm("להתחיל שיחה חדשה? ההיסטוריה הנוכחית תימחק.")) newSession();
});

// ---------- settings modal ----------

const modal = $("#settings-modal");

function applyTargetVisibility(target) {
  document.querySelectorAll("#settings-modal [data-target]").forEach((el) => {
    el.style.display = el.dataset.target === target ? "" : "none";
  });
}

async function openSettings() {
  const cfg = await fetch("/api/jarvis/config").then((r) => r.json()).catch(() => null);
  if (cfg) {
    const target = cfg.target === "cloud" ? "cloud" : "local";
    document.querySelector(`input[name="cfg-target"][value="${target}"]`).checked = true;
    $("#cfg-local-base").value = cfg.localBase || "http://localhost:5680";
    $("#cfg-local-path").value = cfg.localPath || "jarvis";
    $("#cfg-base").value = cfg.base || "";
    $("#cfg-id").value = cfg.id || "";
    document.querySelector(`input[name="cfg-mode"][value="${cfg.mode || "prod"}"]`).checked = true;
    applyTargetVisibility(target);
  }
  $("#test-result").textContent = "";
  $("#test-result").className = "jarvis-test-result";
  modal.classList.remove("hidden");
}

document.querySelectorAll('input[name="cfg-target"]').forEach((r) =>
  r.addEventListener("change", () => applyTargetVisibility(r.value))
);

function collectCfg() {
  return {
    target: document.querySelector('input[name="cfg-target"]:checked').value,
    localBase: $("#cfg-local-base").value.trim(),
    localPath: $("#cfg-local-path").value.trim(),
    base: $("#cfg-base").value.trim(),
    id: $("#cfg-id").value.trim(),
    mode: document.querySelector('input[name="cfg-mode"]:checked').value
  };
}
function closeSettings() {
  modal.classList.add("hidden");
}
$("#btn-settings").addEventListener("click", openSettings);
$("#btn-cancel").addEventListener("click", closeSettings);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeSettings();
});

$("#btn-save").addEventListener("click", async () => {
  await fetch("/api/jarvis/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectCfg())
  });
  closeSettings();
  toast("ההגדרות נשמרו");
  ping();
});

$("#btn-test").addEventListener("click", async () => {
  const rEl = $("#test-result");
  rEl.textContent = "בודק…";
  rEl.className = "jarvis-test-result";
  // שמירה זמנית כדי שהבדיקה תשתמש בערכים החדשים
  await fetch("/api/jarvis/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectCfg())
  });
  try {
    const res = await fetch("/api/jarvis/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: "בדיקת חיבור", sessionId: "jarvis-test-" + Date.now() })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      rEl.textContent = "✓ החיבור תקין — הוורקפלואו הגיב.";
      rEl.className = "jarvis-test-result ok";
    } else {
      rEl.textContent = "✗ " + (data.hint || data.error || `סטטוס ${data.status || res.status}`);
      rEl.className = "jarvis-test-result bad";
    }
  } catch (e) {
    rEl.textContent = "✗ השרת המקומי לא נגיש: " + e.message;
    rEl.className = "jarvis-test-result bad";
  }
});

// ---------- מצב קול: דיבור (STT) + הקראה בקול נשי (TTS) ----------

const voice = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis || null;
  // זיהוי דיבור (מיקרופון) דורש הקשר מאובטח — HTTPS או localhost. בטלפון דרך http://192.168.x.x זה חסום ע"י הדפדפן.
  const micAllowed = window.isSecureContext || ["localhost", "127.0.0.1"].includes(location.hostname);
  const micBtn = $("#btn-mic");
  const voiceBtn = $("#btn-voice");
  const voicebar = $("#voicebar");
  const voiceHint = $("#voice-hint");

  // מצב: 0=כבוי · 1=הקראה בלבד · 2=שיחה רציפה (מקשיב אוטומטית אחרי כל תשובה)
  let mode = 0;
  try { mode = Math.max(0, Math.min(2, parseInt(localStorage.getItem("jarvisVoiceMode") || "0", 10))); } catch { /* ignore */ }
  let listening = false;
  let recog = null;
  let heVoice = null;
  const MODE_LABEL = ["כבוי", "הקראה", "שיחה רציפה"];
  const isEnabled = () => mode > 0;

  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices().filter((v) => /he[-_]?IL|hebrew|עברית/i.test(v.lang + " " + v.name));
    // מעדיפים קול נשי מזוהה
    heVoice =
      voices.find((v) => /hila|female|נקבה|רבקה|carmit|noa|נועה/i.test(v.name)) ||
      voices.find((v) => /google/i.test(v.name)) ||
      voices[0] ||
      null;
  }
  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }

  let audioEl = null;

  function afterSpeech() {
    faceState(mode === 2 ? "listening" : "idle");
    // שיחה רציפה — לאחר שסיים לדבר, מקשיב שוב
    if (mode === 2 && SR && !listening && !busy) {
      setTimeout(() => { if (mode === 2 && !listening && !busy) startListening(); }, 350);
    }
  }

  function speakLocal(clean) {
    if (!synth) { afterSpeech(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "he-IL";
    if (heVoice) u.voice = heVoice;
    u.rate = 1;
    u.pitch = 1.12;
    u.onstart = () => { faceState("speaking"); avatar.flapWhile(() => synth.speaking); };
    u.onend = () => { faceState("idle"); afterSpeech(); };
    u.onerror = () => { faceState("idle"); afterSpeech(); };
    synth.speak(u);
  }

  async function speak(text) {
    if (!isEnabled() || !text) return;
    stopSpeaking();
    const clean = text.replace(/[*_`#>]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").trim();
    if (!clean) return;

    // 1) קול נשי מהשרת (Azure Neural אם מוגדר, אחרת Google TTS). 2) נפילה ל-speechSynthesis.
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean })
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 500) {
          audioEl = new Audio(URL.createObjectURL(blob));
          audioEl.onplaying = () => { faceState("speaking"); avatar.attachAudio(audioEl); };
          audioEl.onended = () => { faceState("idle"); afterSpeech(); };
          audioEl.onerror = () => speakLocal(clean);
          audioEl.play().catch(() => speakLocal(clean));
          return;
        }
      }
    } catch { /* אין רשת / השרת ישן — נופלים לקול המקומי */ }
    speakLocal(clean);
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
    if (audioEl) { try { audioEl.pause(); audioEl.onended = null; audioEl.currentTime = 0; } catch { /* ignore */ } audioEl = null; }
  }

  function startListening() {
    if (!SR || listening) return;
    if (!micAllowed) {
      voicebar.hidden = false;
      voiceHint.textContent = "דיבור בקול דורש חיבור מאובטח (HTTPS). בטלפון — הקלד את ההודעה. במחשב זה עובד.";
      setTimeout(() => { voicebar.hidden = true; }, 5000);
      return;
    }
    recog = new SR();
    recog.lang = "he-IL";
    recog.interimResults = true;
    recog.continuous = false;
    listening = true;
    micBtn.classList.add("listening");
    voicebar.hidden = false;
    voiceHint.textContent = "מקשיב… דבר עכשיו";
    stopSpeaking();
    faceState("listening");

    recog.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      inputEl.value = txt;
      autoGrow();
      if (e.results[e.results.length - 1].isFinal) {
        voiceHint.textContent = "שולח…";
        const final = txt.trim();
        stopListening();
        if (final) send(final);
      }
    };
    recog.onerror = (e) => {
      voiceHint.textContent = e.error === "no-speech" ? "לא שמעתי כלום" : "שגיאת זיהוי: " + e.error;
      stopListening();
    };
    recog.onend = () => stopListening();
    try { recog.start(); } catch { stopListening(); }
  }
  function stopListening() {
    listening = false;
    micBtn.classList.remove("listening");
    if (recog) { try { recog.stop(); } catch { /* ignore */ } recog = null; }
    if (!busy) faceState("idle");
    setTimeout(() => { if (!listening) voicebar.hidden = true; }, 1500);
  }

  function setMode(m) {
    mode = ((m % 3) + 3) % 3;
    try { localStorage.setItem("jarvisVoiceMode", String(mode)); } catch { /* ignore */ }
    voiceBtn.textContent = "מצב קול: " + MODE_LABEL[mode];
    voiceBtn.classList.toggle("on", mode > 0);
    if (mode === 0) { stopSpeaking(); stopListening(); }
  }

  // אין תמיכה בדפדפן — מסתירים
  if (!SR && !synth) {
    micBtn.hidden = true;
    voiceBtn.hidden = true;
  } else {
    if (!SR) micBtn.title = "זיהוי דיבור לא נתמך בדפדפן זה";
    else if (!micAllowed) micBtn.title = "דיבור דורש HTTPS — בטלפון הקלד את ההודעה";
    micBtn.addEventListener("click", () => {
      if (!micAllowed && SR) { startListening(); return; } // מציג את ההסבר
      if (mode === 0) setMode(1);
      if (SR) (listening ? stopListening() : startListening());
    });
    voiceBtn.addEventListener("click", () => setMode(mode + 1));
    $("#btn-stop-speak").addEventListener("click", () => { stopSpeaking(); if (mode === 2) setMode(1); });
    setMode(mode);
  }

  return { speak, isEnabled };
})();

// ---------- boot ----------

if (history.length) {
  history.forEach((m) => addMsg(m.role, m.text, { save: false }));
} else {
  addBot(GREETING, { save: false });
}
ping();
autoGrow();
inputEl.focus();
