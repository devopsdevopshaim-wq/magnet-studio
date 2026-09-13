// lib/aiaVideo.js — מנועי וידאו AI חיצוניים לסטודיו AIA.
//
//   • Seedance 2.5  — דרך fal.ai (מודל bytedance/seedance).  מפתח: FAL_KEY.
//   • Deevid.AI     — דרך ה-API של Deevid.  מפתח: DEEVID_API_KEY.
//
// המפתחות נשמרים בצד השרת בלבד (data/aia-video-config.json) — לעולם לא בדפדפן.
// בלי מפתח: המערכת מסבירה מה צריך ומייצאת פרומפט מותאם למנוע להדבקה ידנית באתר שלו.
//
// תוצאה: קובץ MP4 יורד לתיקיית הרינדרים של הפרויקט ומופיע באותו נגן/גלריה
// כמו המונטאז' המקומי.

const fs = require("fs");
const path = require("path");
const { PERSIST_DIR } = require("./paths");

const AIA_DIR = path.join(PERSIST_DIR, "aia");
const RENDER_DIR = path.join(AIA_DIR, "renders");
const CONFIG = path.join(PERSIST_DIR, "aia-video-config.json");

const jobs = new Map(); // projectId -> { status, pct, phase, file, error, provider, durationSec }

// ---------- תצורה ----------

const PROVIDERS = {
  seedance: {
    id: "seedance",
    label: "Seedance 2.5",
    vendor: "ByteDance · דרך fal.ai",
    site: "https://fal.ai/models/fal-ai/bytedance/seedance/v1/pro",
    keyEnv: "FAL_KEY",
    keyHint: "מפתח fal.ai (מתחיל ב-\"fal-\" או זוג key:secret) — fal.ai/dashboard/keys",
    defaultModel: "fal-ai/bytedance/seedance/v1/pro/text-to-video",
    imageModel: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    durations: [4, 6, 8, 10, 12],
    aspects: ["16:9", "9:16", "1:1", "4:3", "21:9"]
  },
  deevid: {
    id: "deevid",
    label: "Deevid.AI",
    vendor: "Deevid AI",
    site: "https://deevid.ai/app/assets",
    mode: "handoff",                       // אין API ציבורי — עובדים דרך האתר
    appUrl: "https://deevid.ai/app/assets",
    keyEnv: "DEEVID_API_KEY",
    keyHint: "ל-Deevid אין API — הפרומפט מוכן להדבקה באתר",
    apiBase: "https://api.deevid.ai",
    durations: [4, 5, 8, 10],
    aspects: ["16:9", "9:16", "1:1"]
  }
};

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { return { providers: {} }; }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}

function keyFor(pid) {
  const p = PROVIDERS[pid];
  if (!p) return null;
  const cfg = readConfig();
  return (cfg.providers && cfg.providers[pid] && cfg.providers[pid].key) || process.env[p.keyEnv] || null;
}

/** הערך הגולמי כפי שהוא מוגדר — למסך אינטגרציות. */
function getKey(pid) { return keyFor(pid) || ""; }

function providerList() {
  const cfg = readConfig();
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    vendor: p.vendor,
    site: p.site,
    keyHint: p.keyHint,
    durations: p.durations,
    aspects: p.aspects,
    mode: p.mode || "api",
    appUrl: p.appUrl || null,
    configured: p.mode === "handoff" ? true : !!keyFor(p.id),
    model: (cfg.providers && cfg.providers[p.id] && cfg.providers[p.id].model) || p.defaultModel || null
  }));
}

/** שמירת מפתח / מודל למנוע. value ריק = מחיקה. */
function saveProvider(pid, { key, model } = {}) {
  if (!PROVIDERS[pid]) throw new Error("מנוע לא מוכר");
  const cfg = readConfig();
  cfg.providers = cfg.providers || {};
  const cur = cfg.providers[pid] || {};
  if (key !== undefined) {
    const k = String(key || "").trim();
    if (k) cur.key = k; else delete cur.key;
  }
  if (model !== undefined) {
    const m = String(model || "").trim();
    if (m) cur.model = m; else delete cur.model;
  }
  cfg.providers[pid] = cur;
  writeConfig(cfg);
  return providerList().find((p) => p.id === pid);
}

// ---------- בניית פרומפט למנוע ----------

function buildPrompt(project, opts = {}) {
  if (opts.prompt) return String(opts.prompt).slice(0, 2000);
  const p = project.package || {};
  const b = project.brief || {};
  const parts = [];
  if (p.concept) parts.push(p.concept);
  const vp = (p.videoPrompts || [])[0];
  if (vp && vp.prompt) parts.push(vp.prompt);
  if ((p.storyboard || []).length) {
    parts.push("Shots: " + p.storyboard.slice(0, 6).map((s) =>
      `${s.description || ""}${s.camera ? " (" + s.camera + ")" : ""}${s.motion ? ", " + s.motion : ""}`).join("; "));
  }
  const sn = p.styleNotes || {};
  if (sn.lighting) parts.push("Lighting: " + sn.lighting);
  if ((sn.keywords || []).length) parts.push("Style: " + sn.keywords.join(", "));
  if (sn.negative) parts.push("Avoid: " + sn.negative);
  if (!parts.length && b.text) parts.push(b.text);
  return parts.filter(Boolean).join(". ").replace(/\s+/g, " ").trim().slice(0, 2000) || (b.title || "cinematic short video");
}

/** טקסט מוכן להדבקה ידנית באתר המנוע (כשאין מפתח). */
function exportPrompt(project, pid) {
  const prov = PROVIDERS[pid] || {};
  const prompt = buildPrompt(project);
  const p = project.package || {};
  const lines = [
    `# ${prov.label || "וידאו AI"} — פרומפט מוכן`,
    "",
    prompt,
    ""
  ];
  if (p.styleNotes && (p.styleNotes.palette || []).length) lines.push("Palette: " + p.styleNotes.palette.join(", "));
  if (p.durationSec) lines.push(`Duration: ~${p.durationSec}s`);
  lines.push(`Aspect: ${(project.brief || {}).aspect || "16:9"}`);
  return lines.join("\n");
}

// ---------- הרצה ----------

async function downloadTo(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("הורדת הווידאו נכשלה (" + r.status + ")");
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function runSeedance(job, project, opts) {
  const key = keyFor("seedance");
  const cfg = readConfig();
  const pcfg = (cfg.providers && cfg.providers.seedance) || {};
  const prov = PROVIDERS.seedance;
  const imageUrl = opts.imageUrl || null;
  const model = pcfg.model || (imageUrl ? prov.imageModel : prov.defaultModel);
  const prompt = buildPrompt(project, opts);

  const body = {
    prompt,
    aspect_ratio: opts.aspect || (project.brief || {}).aspect || "16:9",
    duration: String(opts.duration || 8),
    resolution: opts.resolution || "1080p"
  };
  if (imageUrl) body.image_url = imageUrl;

  job.phase = "שולח ל-Seedance"; job.pct = 8;
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { "Authorization": "Key " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const sj = await submit.json().catch(() => ({}));
  if (!submit.ok) throw new Error("Seedance: " + (sj.detail || sj.error || submit.status));
  const reqId = sj.request_id;
  const statusUrl = sj.status_url || `https://queue.fal.run/${model}/requests/${reqId}/status`;
  const respUrl = sj.response_url || `https://queue.fal.run/${model}/requests/${reqId}`;

  job.phase = "Seedance מייצר וידאו"; job.pct = 20;
  const started = Date.now();
  while (Date.now() - started < 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await fetch(statusUrl, { headers: { "Authorization": "Key " + key } }).then((r) => r.json()).catch(() => ({}));
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED" || st.error) throw new Error("Seedance נכשל: " + (st.error || "שגיאת מנוע"));
    job.pct = Math.min(75, job.pct + 3);
    if (st.queue_position != null) job.phase = `בתור ב-Seedance (${st.queue_position})`;
  }

  job.phase = "מוריד וידאו"; job.pct = 82;
  const out = await fetch(respUrl, { headers: { "Authorization": "Key " + key } }).then((r) => r.json());
  const videoUrl = out.video?.url || (out.videos && out.videos[0] && out.videos[0].url) || out.output?.video?.url;
  if (!videoUrl) throw new Error("Seedance לא החזיר קובץ וידאו");
  const dest = path.join(RENDER_DIR, `${project.id}.mp4`);
  await downloadTo(videoUrl, dest);
  return { file: `/api/aia/render/${project.id}.mp4`, durationSec: Number(body.duration) || 8 };
}

async function runDeevid(job, project, opts) {
  const key = keyFor("deevid");
  const cfg = readConfig();
  const pcfg = (cfg.providers && cfg.providers.deevid) || {};
  const base = (pcfg.apiBase || PROVIDERS.deevid.apiBase).replace(/\/$/, "");
  const prompt = buildPrompt(project, opts);

  job.phase = "שולח ל-Deevid"; job.pct = 8;
  const submit = await fetch(`${base}/v1/video/generate`, {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      aspect_ratio: opts.aspect || (project.brief || {}).aspect || "16:9",
      duration: opts.duration || 5,
      image_url: opts.imageUrl || undefined
    })
  });
  const sj = await submit.json().catch(() => ({}));
  if (!submit.ok) throw new Error("Deevid: " + (sj.message || sj.error || submit.status) + " — ייתכן שמבנה ה-API שונה; עדכן data/aia-video-config.json");
  const taskId = sj.task_id || sj.id || sj.data?.task_id;
  if (!taskId) throw new Error("Deevid לא החזיר מזהה משימה");

  job.phase = "Deevid מייצר וידאו"; job.pct = 20;
  const started = Date.now();
  let videoUrl = null;
  while (Date.now() - started < 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(`${base}/v1/video/status/${taskId}`, { headers: { "Authorization": "Bearer " + key } })
      .then((r) => r.json()).catch(() => ({}));
    const state = st.status || st.state || st.data?.status;
    if (state === "succeeded" || state === "completed" || state === "success") {
      videoUrl = st.video_url || st.url || st.data?.video_url || (st.data?.videos && st.data.videos[0]);
      break;
    }
    if (state === "failed" || state === "error") throw new Error("Deevid נכשל: " + (st.message || "שגיאת מנוע"));
    job.pct = Math.min(75, job.pct + 3);
  }
  if (!videoUrl) throw new Error("Deevid לא החזיר קובץ וידאו בזמן");

  job.phase = "מוריד וידאו"; job.pct = 82;
  const dest = path.join(RENDER_DIR, `${project.id}.mp4`);
  await downloadTo(videoUrl, dest);
  return { file: `/api/aia/render/${project.id}.mp4`, durationSec: Number(opts.duration) || 5 };
}

function jobState(id) { return jobs.get(id) || null; }

// קליטת קובץ וידאו שהמשתמש הפיק ידנית (למשל ב-Deevid) — נכנס לגלריית הפרויקט
async function attachUpload(project, dataUrl) {
  const m = /^data:video\/(\w+);base64,(.+)$/s.exec(String(dataUrl || ""));
  if (!m) throw new Error("צריך קובץ וידאו (mp4/webm)");
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) throw new Error("קובץ ריק");
  if (buf.length > 200 * 1024 * 1024) throw new Error("הקובץ גדול מדי (מקס' 200MB)");
  fs.mkdirSync(RENDER_DIR, { recursive: true });
  fs.writeFileSync(path.join(RENDER_DIR, `${project.id}.mp4`), buf);
  const job = { status: "done", pct: 100, phase: "הועלה", provider: "upload",
    file: `/api/aia/render/${project.id}.mp4`, durationSec: null };
  jobs.set(project.id, job);
  return job;
}

async function submit(project, opts = {}) {
  const pid = opts.provider;
  if (!PROVIDERS[pid]) throw new Error("מנוע לא מוכר");
  if ((PROVIDERS[pid].mode) === "handoff") {
    const e = new Error("handoff");
    e.code = "HANDOFF";
    e.appUrl = PROVIDERS[pid].appUrl;
    throw e;
  }
  if (!keyFor(pid)) {
    const e = new Error("no-key");
    e.code = "NO_KEY";
    throw e;
  }
  const job = { status: "running", pct: 2, phase: "מתחיל", provider: pid };
  jobs.set(project.id, job);

  const runner = pid === "seedance" ? runSeedance : runDeevid;
  runner(job, project, opts)
    .then((res) => {
      job.status = "done"; job.pct = 100; job.phase = "מוכן";
      job.file = res.file; job.durationSec = res.durationSec;
    })
    .catch((err) => {
      job.status = "error"; job.error = err.message;
      console.error("[aia video]", pid, project.id, err.message);
    });
  return job;
}

module.exports = { providerList, saveProvider, submit, attachUpload, jobState, buildPrompt, exportPrompt, PROVIDERS, getKey };
