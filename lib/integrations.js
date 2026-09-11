// lib/integrations.js — מרשם מרכזי של כל האינטגרציות/ה-API-ים שהמערכת משתמשת בהם.
// מטרה: מסך "הגדרות → אינטגרציות" אחד שמראה את כולם + מאפשר לעדכן מפתחות משם.
//
// אחסון כללי (למפתחות פשוטים): data/integrations-config.json { ENV_VAR: value }.
// בעלייה נטען ל-process.env (אם לא כבר מוגדר שם — משתנה סביבה אמיתי תמיד מנצח).
// שמירה מעדכנת גם את process.env באותה שנייה — לא צריך להפעיל מחדש את השרת.
//
// הערה לפריסה בענן (Render וכו'): בלי דיסק קבוע, הקובץ מתאפס בכל פריסה מחדש —
// מפתחות שחייבים לשרוד restart צריך להגדיר גם במשתני הסביבה של שירות האחסון.

const fs = require("fs");
const path = require("path");

const CONFIG = path.join(__dirname, "..", "data", "integrations-config.json");

function readStore() {
  try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")) || {}; } catch { return {}; }
}
function writeStore(store) {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(store, null, 2));
}

// בעלייה: מה שנשמר בעבר נכנס ל-process.env (רק אם עוד לא הוגדר שם ישירות)
(function hydrate() {
  const store = readStore();
  for (const [k, v] of Object.entries(store)) {
    if (v && !process.env[k]) process.env[k] = v;
  }
})();

function setEnv(envVar, value) {
  const store = readStore();
  const v = String(value == null ? "" : value).trim();
  if (v) { store[envVar] = v; process.env[envVar] = v; }
  else { delete store[envVar]; delete process.env[envVar]; }
  writeStore(store);
}
function envConfigured(envVar) { return !!String(process.env[envVar] || "").trim(); }
function masked(envVar) {
  const v = String(process.env[envVar] || "");
  return v ? v.slice(0, 3) + "…" + v.slice(-2) : "";
}

// ---------- מרשם ----------
// כל רשומה: id, label, category, vendor, docsUrl, fields[], status(), save(values)
// fields ריק = מידע בלבד (ציבורי / ללא הגדרה / מנוהל במקום אחר).

function simpleEnvField(envVar, label, opts = {}) {
  return { key: envVar, label, type: opts.type || "password", placeholder: opts.placeholder || "" };
}

const REGISTRY = [
  // ---------- AI ----------
  {
    id: "anthropic", label: "Claude (Anthropic)", category: "ai", vendor: "Anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
    fields: [simpleEnvField("ANTHROPIC_API_KEY", "מפתח API")],
    status: async () => ({ configured: envConfigured("ANTHROPIC_API_KEY"), detail: masked("ANTHROPIC_API_KEY") }),
    save: (v) => setEnv("ANTHROPIC_API_KEY", v.ANTHROPIC_API_KEY)
  },
  {
    id: "openai", label: "OpenAI", category: "ai", vendor: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
    fields: [simpleEnvField("OPENAI_API_KEY", "מפתח API")],
    status: async () => ({ configured: envConfigured("OPENAI_API_KEY"), detail: masked("OPENAI_API_KEY") }),
    save: (v) => setEnv("OPENAI_API_KEY", v.OPENAI_API_KEY)
  },
  {
    id: "perplexity", label: "Perplexity", category: "ai", vendor: "Perplexity AI",
    docsUrl: "https://www.perplexity.ai/settings/api",
    fields: [simpleEnvField("PERPLEXITY_API_KEY", "מפתח API")],
    status: async () => ({ configured: envConfigured("PERPLEXITY_API_KEY"), detail: masked("PERPLEXITY_API_KEY") }),
    save: (v) => setEnv("PERPLEXITY_API_KEY", v.PERPLEXITY_API_KEY)
  },
  {
    id: "gemini", label: "Gemini", category: "ai", vendor: "Google AI Studio",
    docsUrl: "https://aistudio.google.com/apikey",
    fields: [simpleEnvField("GEMINI_API_KEY", "מפתח API")],
    status: async () => ({ configured: envConfigured("GEMINI_API_KEY"), detail: masked("GEMINI_API_KEY") }),
    save: (v) => setEnv("GEMINI_API_KEY", v.GEMINI_API_KEY)
  },
  {
    id: "deepseek", label: "DeepSeek", category: "ai", vendor: "DeepSeek",
    docsUrl: "https://platform.deepseek.com/api_keys",
    fields: [simpleEnvField("DEEPSEEK_API_KEY", "מפתח API")],
    status: async () => ({ configured: envConfigured("DEEPSEEK_API_KEY"), detail: masked("DEEPSEEK_API_KEY") }),
    save: (v) => setEnv("DEEPSEEK_API_KEY", v.DEEPSEEK_API_KEY)
  },
  {
    id: "grok", label: "Grok (xAI)", category: "ai", vendor: "xAI",
    docsUrl: "https://console.x.ai",
    fields: [simpleEnvField("XAI_API_KEY", "מפתח API")],
    status: async () => ({ configured: envConfigured("XAI_API_KEY"), detail: masked("XAI_API_KEY") }),
    save: (v) => setEnv("XAI_API_KEY", v.XAI_API_KEY)
  },
  {
    id: "openwebui", label: "Open WebUI", category: "ai", vendor: "Open WebUI (Docker מקומי)",
    docsUrl: "https://docs.openwebui.com",
    fields: [
      simpleEnvField("OPENWEBUI_BASE_URL", "כתובת", { type: "text", placeholder: "http://localhost:3000" }),
      simpleEnvField("OPENWEBUI_API_KEY", "מפתח API")
    ],
    status: async () => {
      const reachable = await require("./aiPanel").listOllamaModels().then(() => true).catch(() => false);
      return { configured: envConfigured("OPENWEBUI_API_KEY"), detail: reachable ? "Ollama מקומי מזוהה" : "" };
    },
    save: (v) => { setEnv("OPENWEBUI_BASE_URL", v.OPENWEBUI_BASE_URL); setEnv("OPENWEBUI_API_KEY", v.OPENWEBUI_API_KEY); }
  },
  {
    id: "ollama", label: "Ollama (מקומי)", category: "ai", vendor: "Ollama — חינם, בלי מפתח",
    docsUrl: "https://ollama.com",
    fields: [],
    status: async () => {
      const models = await require("./aiPanel").listOllamaModels().catch(() => []);
      return { configured: models.length > 0, detail: models.length ? `${models.length} מודלים` : "לא זמין במחשב הזה" };
    }
  },
  {
    id: "jarvis", label: "JARVIS (n8n)", category: "ai", vendor: "n8n — מקומי או Cloud",
    docsUrl: "https://n8n.io",
    fields: [
      { key: "target", label: "יעד", type: "select", options: [["local", "מקומי (Docker)"], ["cloud", "n8n Cloud"]] },
      simpleEnvField("__jarvis_base", "כתובת n8n Cloud", { type: "text", placeholder: "https://xxx.app.n8n.cloud" })
    ],
    status: async () => {
      const cfg = require("./jarvisClient").readConfig();
      return { configured: true, detail: cfg.target === "cloud" ? "n8n Cloud" : "מקומי (Docker :5680)" };
    },
    save: (v) => require("./jarvisClient").writeConfig({ target: v.target === "cloud" ? "cloud" : "local", base: v.__jarvis_base || undefined })
  },

  // ---------- מדיה ----------
  {
    id: "azure-tts", label: "הקראה קולית — Azure Neural", category: "media", vendor: "Microsoft Azure Speech",
    docsUrl: "https://portal.azure.com",
    fields: [
      simpleEnvField("azureKey", "מפתח API"),
      simpleEnvField("azureRegion", "אזור", { type: "text", placeholder: "westeurope" }),
      simpleEnvField("azureVoice", "קול", { type: "text", placeholder: "he-IL-HilaNeural" })
    ],
    status: async () => {
      const s = require("./ttsClient").status();
      return { configured: s.azureConfigured, detail: s.azureConfigured ? s.voice : "נופל ל-Google TTS (חינם)" };
    },
    save: (v) => require("./ttsClient").setAzure({ key: v.azureKey, region: v.azureRegion, voice: v.azureVoice })
  },
  {
    id: "seedance", label: "Seedance 2.5 — וידאו AI", category: "media", vendor: "ByteDance · דרך fal.ai",
    docsUrl: "https://fal.ai/dashboard/keys",
    fields: [simpleEnvField("key", "מפתח fal.ai")],
    status: async () => {
      const p = (await require("./aiaVideo").providerList()).find((x) => x.id === "seedance");
      return { configured: !!(p && p.configured), detail: p && p.model };
    },
    save: (v) => require("./aiaVideo").saveProvider("seedance", { key: v.key })
  },
  {
    id: "deevid", label: "Deevid.AI — וידאו מושקע", category: "media", vendor: "Deevid AI",
    docsUrl: "https://deevid.ai/app/assets",
    fields: [],
    status: async () => ({ configured: true, detail: "אין API ציבורי — עובד דרך האתר (בלשונית AIA)" })
  },

  // ---------- עסק ותקשורת ----------
  {
    id: "maton", label: "Maton — Gmail / יומן / Drive", category: "business", vendor: "Maton",
    docsUrl: "https://console.maton.ai",
    fields: [simpleEnvField("MATON_API_KEY", "מפתח API")],
    status: async () => {
      const m = require("./matonClient");
      return { configured: m.isConfigured(), detail: m.isConfigured() ? "מחובר" : "" };
    },
    save: (v) => setEnv("MATON_API_KEY", v.MATON_API_KEY)
  },

  // ---------- נתונים ----------
  {
    id: "housing-db", label: "מסד הדיור (DiraFinder)", category: "data", vendor: "Postgres מקומי / API",
    docsUrl: "",
    fields: [
      simpleEnvField("HOUSING_DB_URL", "כתובת Postgres", { type: "text", placeholder: "postgres://..." }),
      simpleEnvField("HOUSING_API_BASE", "כתובת API חלופית", { type: "text" })
    ],
    status: async () => {
      try { const s = await require("./housingClient").status(); return { configured: !!s?.up, detail: s?.up ? "מחובר" : "לא זמין" }; }
      catch { return { configured: false, detail: "לא זמין" }; }
    },
    save: (v) => { setEnv("HOUSING_DB_URL", v.HOUSING_DB_URL); setEnv("HOUSING_API_BASE", v.HOUSING_API_BASE); }
  },
  {
    id: "yahoo-finance", label: "שוק ההון — Yahoo Finance", category: "data", vendor: "ציבורי, ללא מפתח",
    fields: [], status: async () => ({ configured: true, detail: "מקור נתונים חי" })
  },
  {
    id: "sefaria", label: "טקסטים יהודיים — Sefaria", category: "data", vendor: "ציבורי, ללא מפתח",
    fields: [], status: async () => ({ configured: true, detail: "תהילים · סידור · תנ״ך · פרשנים · תלמוד" })
  },
  {
    id: "pais-lotto", label: "לוטו — מפעל הפיס", category: "data", vendor: "ציבורי, ללא מפתח",
    fields: [], status: async () => ({ configured: true, detail: "היסטוריית הגרלות" })
  },
  {
    id: "hebcal", label: "לוח עברי — Hebcal", category: "data", vendor: "ספרייה מוטמעת, ללא מפתח",
    fields: [], status: async () => ({ configured: true, detail: "תאריכים, פרשות, חגים" })
  },

  // ---------- מערכת ----------
  {
    id: "site-password", label: "הגנת סיסמה לאתר הציבורי", category: "system", vendor: "lib/auth.js",
    fields: [simpleEnvField("password", "סיסמה חדשה", { placeholder: "השאר ריק כדי לא לשנות" })],
    status: async () => {
      const a = require("./auth").config();
      return { configured: a.enabled, detail: a.enabled ? "מוגן" : "פתוח (localhost בלבד)" };
    },
    save: (v) => require("./auth").setPassword(v.password)
  },
  {
    id: "docker", label: "Docker (מקומי)", category: "system", vendor: "Docker Desktop",
    fields: [], status: async () => {
      try { const r = await require("./dockerServices").reachable("http://localhost:5680/healthz"); return { configured: !!r, detail: r ? "פעיל" : "לא פעיל" }; }
      catch { return { configured: false, detail: "לא פעיל" }; }
    }
  }
];

const CATEGORY_LABELS = { ai: "בינה מלאכותית", media: "מדיה וקול", business: "עסק ותקשורת", data: "מקורות נתונים", system: "מערכת" };

async function list() {
  const rows = await Promise.all(REGISTRY.map(async (r) => {
    let st = { configured: false };
    try { st = await r.status(); } catch (e) { st = { configured: false, detail: "שגיאת בדיקה" }; }
    return {
      id: r.id, label: r.label, category: r.category, categoryLabel: CATEGORY_LABELS[r.category] || r.category,
      vendor: r.vendor, docsUrl: r.docsUrl || null, fields: r.fields || [],
      editable: (r.fields || []).length > 0 && typeof r.save === "function",
      ...st
    };
  }));
  return rows;
}

async function save(id, values) {
  const r = REGISTRY.find((x) => x.id === id);
  if (!r) throw new Error("אינטגרציה לא מוכרת");
  if (typeof r.save !== "function") throw new Error("אינטגרציה זו לא ניתנת לעריכה כאן");
  await r.save(values || {});
  return r.status();
}

module.exports = { list, save, setEnv };
