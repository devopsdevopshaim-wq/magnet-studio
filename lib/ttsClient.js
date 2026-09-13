// הקראת טקסט בעברית בקול אנושי — צד שרת.
//  1) AZURE_SPEECH_KEY (+ AZURE_SPEECH_REGION) → Azure Neural "he-IL-HilaNeural" (הכי טבעי).
//  2) אחרת → Google Translate TTS (לא רשמי, ללא מפתח).
//  3) שניהם נכשלים → הדפדפן נופל ל-speechSynthesis.
//
// לפני ההקראה הטקסט עובר "האנשה": ניקוי Markdown, פתיחת קיצורים, הוספת נשימות
// וסימני פיסוק — כדי שהקול יישמע כמו אדם שמדבר, לא כמו מכונה שמקריאה.

const https = require("https");
const fs = require("fs");
const path = require("path");

// תצורת קול אופציונלית (data/tts-config.json) — גוברת על משתני הסביבה.
// { "azureKey": "...", "azureRegion": "westeurope", "azureVoice": "he-IL-HilaNeural" }
const TTS_CONFIG = path.join(__dirname, "..", "data", "tts-config.json");
function fileConfig() {
  try { return JSON.parse(fs.readFileSync(TTS_CONFIG, "utf8")) || {}; } catch { return {}; }
}

// ---------- האנשת הטקסט ----------

const ABBREV = [
  [/וכו['׳]/g, "וכולי"],
  [/לדוג['׳]/g, "לדוגמה"],
  [/אלש["״]ח/g, "אלף שקלים"],
  [/\bNIS\b/g, "שקלים"],
  [/ש["״]ח/g, "שקלים"],
  [/ד["״]ר(?=\s)/g, "דוקטור"],
  [/פרופ['׳]/g, "פרופסור"],
  [/מס['׳]/g, "מספר"],
  [/עמ['׳]/g, "עמוד"],
  [/&/g, " ו"]
];

/** מנקה Markdown ומכין את הטקסט לדיבור אנושי. */
function humanize(raw) {
  let t = String(raw || "");

  // הורדת בלוקי קוד, קישורים, הדגשות
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");
  t = t.replace(/^\s*>\s?/gm, "");

  // רשימות → משפטים: "• פריט" / "- פריט" / "1. פריט"
  t = t.replace(/^\s*[-•*]\s+/gm, "");
  t = t.replace(/^\s*\d+[.)]\s+/gm, "");

  // טבלאות Markdown — משאירים תאים מופרדים בפסיק
  t = t.replace(/^\s*\|(.+)\|\s*$/gm, (m, row) =>
    /^[\s|:-]+$/.test(row) ? "" : row.split("|").map((c) => c.trim()).filter(Boolean).join(", ") + ".");

  // אימוג'י וסמלים מיותרים
  t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}←-⇿⬀-⯿]/gu, " ");

  for (const [re, rep] of ABBREV) t = t.replace(re, rep);

  // אחוזים ומטבע קריאים
  t = t.replace(/(\d)%/g, "$1 אחוז");
  t = t.replace(/₪\s?(\d)/g, "$1 שקלים").replace(/(\d)\s?₪/g, "$1 שקלים");
  t = t.replace(/\$\s?(\d)/g, "$1 דולר");

  // ריווח ופיסוק
  t = t.replace(/\s*\n\s*\n\s*/g, ". ");   // פסקה = עצירה
  t = t.replace(/\s*\n\s*/g, ", ");         // שורה = פסיק
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([.,;:!?])/g, "$1");
  t = t.replace(/([.,;:!?])(?=\S)/g, "$1 ");
  t = t.replace(/\.{2,}/g, "…");
  t = t.replace(/(^|\s)[-–—](\s|$)/g, "$1, $2");

  return t.trim();
}

const xmlEsc = (s) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

/** בונה SSML עם נשימות טבעיות בין משפטים ובפסיקים. */
function buildSsml(text, voice) {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const body = sentences.map((s) => {
    const withCommas = xmlEsc(s).replace(/,\s*/g, ', <break strength="weak"/>');
    return `<s>${withCommas}</s><break strength="medium"/>`;
  }).join(" ");
  return (
    `<speak version="1.0" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="he-IL">` +
    `<voice name="${voice}">` +
    `<prosody rate="-3%" pitch="+1%">${body}</prosody>` +
    `</voice></speak>`
  );
}

// ---------- Azure Neural ----------

// מנקה ערכי-סביבה שהגיעו עם תו לא-חוקי לכותרת HTTP (רווח/שורה חדשה/גרשיים)
const envClean = (v) => String(v || "").replace(/[\r\n\t"']/g, "").trim();

// מפתח Azure תקין = ASCII בלבד, בלי רווחים, באורך סביר. אחרת מתייחסים כ"לא מוגדר"
// (למשל אם ערך הסביבה מכיל טקסט הסבר בעברית במקום מפתח אמיתי).
function azureKey() {
  const k = envClean(fileConfig().azureKey || process.env.AZURE_SPEECH_KEY);
  return /^[A-Za-z0-9._+/=:-]{20,200}$/.test(k) ? k : "";
}

function azureTts(text) {
  const cfg = fileConfig();
  const key = azureKey();
  const region = envClean(cfg.azureRegion || process.env.AZURE_SPEECH_REGION) || "westeurope";
  if (!key) return Promise.reject(new Error("no azure key"));
  const voice = envClean(cfg.azureVoice || process.env.AZURE_SPEECH_VOICE) || "he-IL-HilaNeural";
  const ssml = buildSsml(text, voice);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: `${region}.tts.speech.microsoft.com`,
        path: "/cognitiveservices/v1",
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "magnet-studio"
        },
        timeout: 15000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`azure ${res.statusCode}: ${Buffer.concat(chunks).toString("utf8").slice(0, 200)}`));
          resolve(Buffer.concat(chunks));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("azure timeout")));
    req.on("error", reject);
    req.write(ssml);
    req.end();
  });
}

function ttsChunk(text, lang = "iw", timeout = 9000) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(text);
    const path = `/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&total=1&idx=0&textlen=${text.length}&q=${q}`;
    const req = https.request(
      {
        host: "translate.google.com",
        path,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Referer: "https://translate.google.com/"
        },
        timeout
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`tts ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on("timeout", () => req.destroy(new Error("tts timeout")));
    req.on("error", reject);
    req.end();
  });
}

// חלוקה למקטעים של ~190 תווים על גבול משפט
function splitText(text, max = 190) {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?…:;])\s+/);
  const parts = [];
  let cur = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (cur) { parts.push(cur.trim()); cur = ""; }
      for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
      continue;
    }
    if ((cur + " " + s).trim().length > max) {
      if (cur) parts.push(cur.trim());
      cur = s;
    } else {
      cur = (cur ? cur + " " : "") + s;
    }
  }
  if (cur) parts.push(cur.trim());
  return parts.filter(Boolean).slice(0, 20);
}

/** @returns {Promise<{audio:Buffer, engine:string}>} */
async function synthesize(text) {
  const clean = humanize(text).replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("אין טקסט");

  // 1) Azure Neural — טקסט מלא בבקשה אחת
  if (azureKey()) {
    try {
      return { audio: await azureTts(clean.slice(0, 3200)), engine: "azure" };
    } catch (e) {
      if (process.env.TTS_DEBUG) console.error("[tts azure]", e.message);
      /* נופלים ל-Google */
    }
  }

  // 2) Google Translate TTS — מקטעים
  const parts = splitText(clean);
  const buffers = [];
  for (const p of parts) {
    try {
      buffers.push(await ttsChunk(p));
    } catch {
      /* מדלגים על מקטע שנכשל */
    }
  }
  if (!buffers.length) throw new Error("לא התקבל אודיו מ-TTS");
  return { audio: Buffer.concat(buffers), engine: "google" };
}

function status() {
  return {
    engine: azureKey() ? "azure" : "google",
    voice: azureKey() ? (envClean(fileConfig().azureVoice || process.env.AZURE_SPEECH_VOICE) || "he-IL-HilaNeural") : "google-he",
    azureConfigured: !!azureKey()
  };
}
/** הערכים הגולמיים כפי שהם מוגדרים כרגע — למסך אינטגרציות (לא מוצפן, מיועד למסך מוגן-סיסמה). */
function getConfig() {
  const cfg = fileConfig();
  return {
    azureKey: envClean(cfg.azureKey || process.env.AZURE_SPEECH_KEY || ""),
    azureRegion: envClean(cfg.azureRegion || process.env.AZURE_SPEECH_REGION || "") || "westeurope",
    azureVoice: envClean(cfg.azureVoice || process.env.AZURE_SPEECH_VOICE || "") || "he-IL-HilaNeural"
  };
}
function setAzure({ key, region, voice } = {}) {
  const cfg = fileConfig();
  if (key !== undefined) { key = String(key || "").trim(); if (key) cfg.azureKey = key; else delete cfg.azureKey; }
  if (region !== undefined) { region = String(region || "").trim(); if (region) cfg.azureRegion = region; else delete cfg.azureRegion; }
  if (voice !== undefined) { voice = String(voice || "").trim(); if (voice) cfg.azureVoice = voice; else delete cfg.azureVoice; }
  fs.mkdirSync(path.dirname(TTS_CONFIG), { recursive: true });
  fs.writeFileSync(TTS_CONFIG, JSON.stringify(cfg, null, 2));
  return status();
}

module.exports = { synthesize, humanize, status, setAzure, getConfig };
