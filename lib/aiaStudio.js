// lib/aiaStudio.js — סטודיו "עיצוב AIA": הופך בריף (תמונות ייחוס / מסמך / טקסט) ל"חבילת הפקה":
//   קונספט · פרומפטים לתמונה · סטוריבורד shot-by-shot · פרומפטים לוידאו (Seedance/Runway/Kling) · הערות סגנון
// יצירת הטקסט דרך Ollama המקומי (או ספק ענן אם מוגדר מפתח). אחסון מקומי בלבד.

const fs = require("fs");
const path = require("path");
const aiPanel = require("./aiPanel");

const AIA_DIR = path.join(__dirname, "..", "data", "aia");
const ASSET_DIR = path.join(AIA_DIR, "assets");
const STAGING_DIR = path.join(AIA_DIR, "staging");
const INDEX_FILE = path.join(AIA_DIR, "projects.json");

const MAX_IMAGES = 120;

function ensureDirs() {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, "[]");
}

function readIndex() {
  ensureDirs();
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")); } catch { return []; }
}
function writeIndex(arr) { fs.writeFileSync(INDEX_FILE, JSON.stringify(arr, null, 2)); }

function projectFile(id) { return path.join(AIA_DIR, `${id}.json`); }
function readProject(id) {
  try { return JSON.parse(fs.readFileSync(projectFile(id), "utf8")); } catch { return null; }
}

// ---------- שמירת תמונות ייחוס ----------

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

function decodeImg(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 12 * 1024 * 1024) return null; // 12MB לתמונה
  return { ext: EXT[m[1]] || "png", buf };
}

// ---------- staging: העלאת תמונות אחת-אחת (בלי גבול על גודל בקשה) ----------

function ensureStage(stageId) {
  if (!/^[a-z0-9-]{6,60}$/i.test(stageId)) throw new Error("stageId לא חוקי");
  const dir = path.join(STAGING_DIR, stageId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function stageImage(stageId, dataUrl, note) {
  const dir = ensureStage(stageId);
  const d = decodeImg(dataUrl);
  if (!d) throw new Error("תמונה לא תקינה");
  const count = fs.readdirSync(dir).filter((f) => /\.(jpg|png|webp|gif)$/i.test(f)).length;
  if (count >= MAX_IMAGES) throw new Error(`מקסימום ${MAX_IMAGES} תמונות`);
  const name = `s${String(count + 1).padStart(3, "0")}.${d.ext}`;
  fs.writeFileSync(path.join(dir, name), d.buf);
  if (note != null) {
    let notes = {};
    try { notes = JSON.parse(fs.readFileSync(path.join(dir, "_notes.json"), "utf8")); } catch {}
    notes[name] = String(note).slice(0, 400);
    fs.writeFileSync(path.join(dir, "_notes.json"), JSON.stringify(notes));
  }
  return { name };
}

function clearStage(stageId) {
  try { fs.rmSync(path.join(STAGING_DIR, stageId), { recursive: true, force: true }); } catch {}
}

// מעביר תמונות (inline base64 ו/או מ-staging) לתיקיית הפרויקט
function collectAssets(id, { files, stageId, stageNotes }) {
  const dir = path.join(ASSET_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  const add = (buf, ext, note) => {
    const name = `ref-${saved.length + 1}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    saved.push({ name, url: `/api/aia/asset/${id}/${name}`, note: (note || "").slice(0, 400) });
  };

  if (stageId && /^[a-z0-9-]{6,60}$/i.test(stageId)) {
    const sdir = path.join(STAGING_DIR, stageId);
    if (fs.existsSync(sdir)) {
      const notes = Array.isArray(stageNotes) ? stageNotes : [];
      fs.readdirSync(sdir).filter((f) => /\.(jpg|png|webp|gif)$/i.test(f)).sort().forEach((f, i) => {
        if (saved.length >= MAX_IMAGES) return;
        add(fs.readFileSync(path.join(sdir, f)), f.split(".").pop(), notes[i]);
      });
    }
  }
  (Array.isArray(files) ? files : []).forEach((f) => {
    if (saved.length >= MAX_IMAGES) return;
    const d = decodeImg(f.dataUrl);
    if (d) add(d.buf, d.ext, f.note);
  });
  return saved;
}

// ---------- AI ----------

async function askAI(prompt, { timeout = 120000 } = {}) {
  const preferred = ["gpt-oss:120b-cloud", "glm-5.2:cloud", "llama3.1:latest", "llama3.2:latest"];
  try {
    const models = await aiPanel.listOllamaModels();
    if (models.length) {
      const model = preferred.find((m) => models.includes(m)) || models[0];
      const text = await aiPanel.queryOllama(model, prompt);
      if (text && text.trim()) return { text: text.trim(), source: `Ollama · ${model}` };
    }
  } catch { /* המשך */ }
  for (const s of aiPanel.CLOUD_SOURCES) {
    if (!process.env[s.envVar]) continue;
    try { const t = await s.ask(prompt, process.env[s.envVar]); if (t && t.trim()) return { text: t.trim(), source: s.label }; }
    catch { /* המשך */ }
  }
  throw new Error("אין מנוע AI זמין — ודא ש-Ollama פועל (docker) או הגדר מפתח ספק ענן.");
}

const TYPE_HE = {
  animation: "אנימציה קצרה",
  video: "סרטון קצר",
  images: "סדרת תמונות סטילס",
  logo_reveal: "לוגו רוול / אינטרו"
};

function briefText(brief, assets) {
  const dur = Number(brief.duration) || 8;
  const L = [];
  // תיאור המשתמש ראשון ובולט — זה הלב של הבריף
  if (brief.text) L.push("מה קורה בסרטון: " + String(brief.text).slice(0, 6000));
  if (brief.title && !brief.text) L.push("נושא: " + brief.title);
  else if (brief.title) L.push("שם: " + brief.title);
  if (assets.length) L.push(`תמונות ייחוס: ${assets.length}${assets.some((a) => a.note) ? " — " + assets.map((a) => a.note).filter(Boolean).join("; ") : ""}`);
  const meta = [];
  meta.push((TYPE_HE[brief.type] || "אנימציה קצרה"));
  meta.push((brief.aspect || "16:9"));
  meta.push(dur + " שניות");
  if (brief.style) meta.push("סגנון " + brief.style);
  if (brief.mood) meta.push("אווירה " + brief.mood);
  L.push("פרטים: " + meta.join(" · "));
  return L.join("\n");
}

// שלב 1 — תיאור נאמן לבריף. בקשה אחת בלבד (ריבוי הוראות גורם למודל לברוח לגנרי).
function conceptPrompt(brief, assets) {
  return [
    "אתה במאי. תאר במדויק את הסצנה של הבריף הבא — מה רואים פריים-פריים, בעברית, פסקה אחת רציפה.",
    "הישאר צמוד לחלוטין לבריף. אל תוסיף אלמנטים מופשטים (חלקיקים זוהרים, קריסטלים, ספירלות, טקסט 'Welcome') אלא אם הם בבריף. סיים במשפט על האווירה והמסר.",
    "",
    "=== הבריף ===",
    briefText(brief, assets)
  ].join("\n");
}
function titlePrompt(concept) {
  return "תן כותרת קצרה בעברית (2-5 מילים, בלי מרכאות) לסרטון שהקונספט שלו:\n\n" + concept + "\n\nכותרת:";
}

// שלב 2 — הרחבה לפרומפטים + סטוריבורד, מעוגן בקונספט המאושר משלב 1
function expandPrompt(brief, assets, concept) {
  const dur = Number(brief.duration) || 8;
  return [
    "להלן קונספט מאושר לסרטון. המשימה: להפיק ממנו חומרי הפקה. כל הפרומפטים חייבים לתאר את הסצנה הזו בדיוק — לא סצנה אחרת.",
    "",
    "=== הקונספט המאושר ===",
    concept,
    "",
    "=== פרטי הפקה ===",
    "יחס מסך: " + (brief.aspect || "16:9") + " · אורך: " + dur + " שניות · סגנון: " + (brief.style || "—") + " · מצב רוח: " + (brief.mood || "—"),
    "",
    "כתוב בדיוק בפורמט הזה, שמור את כותרות ה-### כפי שהן:",
    "",
    "### IMAGE PROMPTS",
    "(4 פרומפטים באנגלית לג'נרטור תמונות. כל פרומפט מתאר רגע מהסצנה שלמעלה + סגנון, תאורה, עדשה, קומפוזיציה, צבע)",
    "1. ...",
    "2. ...",
    "3. ...",
    "4. ...",
    "",
    "### STORYBOARD",
    "(3-5 שוטים שמספרים את הסצנה שלמעלה. סכום השניות ≈ " + dur + ". שורה לכל שוט: מספר | תיאור בעברית | מצלמה/עדשה | תנועה | שניות)",
    "1 | ... | ... | ... | 3",
    "",
    "### VIDEO PROMPTS",
    "(משפט אנגלי עשיר אחד לכל מנוע, שמתאר את הסצנה שלמעלה + תנועה + מצלמה + סגנון)",
    "Seedance: ...",
    "Runway Gen-3: ...",
    "Kling: ...",
    "",
    "### STYLE",
    "palette: #hex, #hex, #hex, #hex",
    "lighting: תיאור קצר",
    "keywords: מילה, מילה, מילה",
    "negative: ממה להימנע"
  ].join("\n");
}

function parseSections(text) {
  const sec = {};
  const re = /^###\s*([A-Z0-9 \-]+?)\s*$/gm;
  let m; const marks = [];
  while ((m = re.exec(text))) marks.push({ name: m[1].trim(), i: m.index, end: re.lastIndex });
  marks.forEach((mk, idx) => {
    sec[mk.name] = text.slice(mk.end, idx + 1 < marks.length ? marks[idx + 1].i : text.length).trim();
  });
  return sec;
}

// ניתוח הפורמט המסודר לחבילה מובנית. concept/title מגיעים משלב 1.
function parsePackage(text, dur, concept, title) {
  const sec = parseSections(text);

  const stripNum = (l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/\*\*/g, "").replace(/^["'`]+|["'`]+$/g, "").trim();
  const listLines = (s) => (s || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\(/.test(l));

  const imagePrompts = listLines(sec["IMAGE PROMPTS"]).map(stripNum).filter((x) => x.length > 8);

  const storyboard = listLines(sec["STORYBOARD"]).map((l) => {
    const p = l.split("|").map((x) => x.trim());
    if (p.length < 2) return null;
    // עמודה אחרונה שהיא מספר => שניות
    let seconds;
    if (p.length >= 3 && /^\d+(\.\d+)?s?$/.test(p[p.length - 1])) { seconds = parseFloat(p.pop()); }
    return {
      shot: parseInt(p[0], 10) || undefined,
      description: p[1] || "",
      camera: p[2] || "",
      motion: p[3] || "",
      seconds
    };
  }).filter(Boolean);

  const videoPrompts = listLines(sec["VIDEO PROMPTS"]).map((l) => {
    const mm = /^[*\-\s]*([A-Za-z][A-Za-z0-9 .\-]*?)\s*[:：]\s*(.+)$/.exec(l.replace(/\*\*/g, ""));
    return mm && mm[2].length > 10 ? { engine: mm[1].trim(), prompt: mm[2].trim() } : null;
  }).filter(Boolean);

  const style = {};
  listLines(sec["STYLE"]).forEach((l) => {
    const mm = /^([a-zA-Z]+)\s*[:：]\s*(.+)$/.exec(l);
    if (!mm) return;
    const k = mm[1].toLowerCase(), v = mm[2].trim();
    if (k === "palette") style.palette = v.split(/[,\s]+/).filter((x) => /^#?[0-9a-fA-F]{3,8}$/.test(x)).map((x) => (x[0] === "#" ? x : "#" + x));
    else if (k === "keywords") style.keywords = v.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
    else if (k === "lighting") style.lighting = v;
    else if (k === "negative") style.negative = v;
  });

  const unparsed = !imagePrompts.length && !storyboard.length && !videoPrompts.length;
  return {
    title: title || "חבילת הפקה",
    concept: concept || "",
    imagePrompts, storyboard, videoPrompts,
    styleNotes: style,
    durationSec: dur,
    ...(unparsed ? { _expandRaw: text.trim() } : {})
  };
}

function cleanTitle(text) {
  return (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0]
    ?.replace(/^כותרת\s*[:：]\s*/, "").replace(/^["'`*]+|["'`*.]+$/g, "").slice(0, 60) || "";
}

// ---------- API ----------

async function createProject(brief) {
  ensureDirs();
  const id = "aia-" + Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
  const assets = collectAssets(id, { files: brief.files, stageId: brief.stageId, stageNotes: brief.stageNotes });
  if (brief.stageId) clearStage(brief.stageId);

  // שלב 1 — קונספט נאמן לבריף
  const c = await askAI(conceptPrompt(brief, assets), { timeout: 90000 });
  const concept = c.text.trim();

  // שלב 2 — הרחבה לחומרי הפקה, מעוגן בקונספט
  const e = await askAI(expandPrompt(brief, assets, concept), { timeout: 120000 });
  const pkg = parsePackage(e.text, Number(brief.duration) || 8);
  pkg.concept = concept;

  // כותרת — קריאה קצרה נפרדת (עם fallback לכותרת מהבריף)
  let title = brief.title || "";
  try { const t = await askAI(titlePrompt(concept), { timeout: 40000 }); title = cleanTitle(t.text) || title; } catch { /* fallback */ }
  pkg.title = title || pkg.title;

  const project = {
    id,
    createdAt: new Date().toISOString(),
    brief: { type: brief.type, title: brief.title, style: brief.style, mood: brief.mood, aspect: brief.aspect, duration: brief.duration, text: brief.text || "" },
    assets,
    package: pkg,
    aiSource: c.source
  };
  fs.writeFileSync(projectFile(id), JSON.stringify(project, null, 2));

  const idx = readIndex();
  idx.unshift({ id, title: pkg.title || brief.title || "ללא כותרת", type: brief.type, createdAt: project.createdAt, assetCount: assets.length });
  writeIndex(idx.slice(0, 200));
  return project;
}

function listProjects() { return readIndex(); }

function getProject(id) { return readProject(id); }

function deleteProject(id) {
  const idx = readIndex().filter((p) => p.id !== id);
  writeIndex(idx);
  try { fs.rmSync(projectFile(id)); } catch {}
  try { fs.rmSync(path.join(ASSET_DIR, id), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(AIA_DIR, "renders", `${id}.mp4`)); } catch {}
  return { ok: true };
}

// שמירת רשומת רינדור על הפרויקט
function attachRender(id, info) {
  const p = readProject(id);
  if (!p) return;
  p.render = { ...info, at: new Date().toISOString() };
  fs.writeFileSync(projectFile(id), JSON.stringify(p, null, 2));
}

// ניקוי staging ישן (מעל 12 שעות)
function purgeStaging() {
  try {
    const now = Date.now();
    for (const d of fs.readdirSync(STAGING_DIR)) {
      const full = path.join(STAGING_DIR, d);
      if (now - fs.statSync(full).mtimeMs > 12 * 3600 * 1000) fs.rmSync(full, { recursive: true, force: true });
    }
  } catch { /* אין תיקייה */ }
}

function assetPath(id, name) {
  if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+$/.test(name)) throw new Error("שם לא חוקי");
  const p = path.join(ASSET_DIR, id, name);
  if (!p.startsWith(ASSET_DIR + path.sep)) throw new Error("נתיב לא חוקי");
  return p;
}

// המרת חבילה ל-Markdown להורדה
function toMarkdown(project) {
  const p = project.package || {};
  const L = [`# ${p.title || "חבילת הפקה — עיצוב AIA"}`, "", `> נוצר: ${project.createdAt} · מנוע: ${project.aiSource || "?"}`, ""];
  L.push("## קונספט", "", p.concept || "-", "");
  if ((p.imagePrompts || []).length) { L.push("## פרומפטים לתמונה", ""); p.imagePrompts.forEach((x, i) => L.push(`${i + 1}. \`${x}\``)); L.push(""); }
  if ((p.storyboard || []).length) {
    L.push("## סטוריבורד", "", "| # | תיאור | מצלמה | תנועה | שנ' |", "|---|---|---|---|---|");
    p.storyboard.forEach((s) => L.push(`| ${s.shot ?? ""} | ${s.description ?? ""} | ${s.camera ?? ""} | ${s.motion ?? ""} | ${s.seconds ?? ""} |`));
    L.push("");
  }
  if ((p.videoPrompts || []).length) { L.push("## פרומפטים לוידאו", ""); p.videoPrompts.forEach((v) => L.push(`**${v.engine}:**`, "", `\`\`\`\n${v.prompt}\n\`\`\``, "")); }
  const sn = p.styleNotes || {};
  if (Object.keys(sn).length) {
    L.push("## הערות סגנון", "");
    if (sn.palette) L.push(`- פלטה: ${(sn.palette || []).join(", ")}`);
    if (sn.lighting) L.push(`- תאורה: ${sn.lighting}`);
    if (sn.keywords) L.push(`- מילות מפתח: ${(sn.keywords || []).join(", ")}`);
    if (sn.negative) L.push(`- להימנע: ${sn.negative}`);
  }
  return L.join("\n");
}

module.exports = {
  createProject, listProjects, getProject, deleteProject, assetPath, toMarkdown,
  stageImage, clearStage, attachRender, purgeStaging, MAX_IMAGES,
  AIA_DIR
};
