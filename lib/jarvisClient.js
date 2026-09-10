// פרוקסי צד-שרת ל-workflow "JARVIS" ב-n8n Cloud. מטרתו לפתור CORS (הדפדפן מדבר מול
// same-origin /api/jarvis/ask במקום ישירות מול n8n) ולאפשר גם לנרטיב היומי להשתמש
// באותו סוכן. שום מפתח לא נדרש - ה-Chat Trigger של n8n פתוח לפי ה-webhook id.

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CONFIG_FILE = path.join(DATA_DIR, "jarvis-config.json");

const DEFAULTS = {
  target: "local", // local | cloud
  // n8n מקומי (Docker, 5680) - ה-workflow jarvis-local.json מיובא ומופעל שם.
  // ב-docker-compose מגדירים JARVIS_LOCAL_BASE=http://n8n:5678 (שם השירות).
  localBase: process.env.JARVIS_LOCAL_BASE || "http://localhost:5680",
  localPath: "jarvis", // Webhook node path => /webhook/jarvis
  // n8n Cloud
  base: "https://haimkripisn.app.n8n.cloud",
  id: "e92be7e4-3947-4cbf-830b-5f89627fbf4c",
  mode: "prod" // prod | test
};

function readConfig() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) || {};
  } catch {
    /* אין קובץ - ברירות מחדל */
  }
  return {
    target: saved.target === "cloud" ? "cloud" : "local",
    localBase: (saved.localBase || DEFAULTS.localBase).replace(/\/+$/, ""),
    localPath: (saved.localPath || DEFAULTS.localPath).replace(/^\/+|\/+$/g, ""),
    base: (saved.base || DEFAULTS.base).replace(/\/+$/, ""),
    id: saved.id || DEFAULTS.id,
    mode: saved.mode === "test" ? "test" : "prod"
  };
}

function writeConfig(partial) {
  const next = { ...readConfig(), ...partial };
  next.target = next.target === "cloud" ? "cloud" : "local";
  next.localBase = (next.localBase || DEFAULTS.localBase).replace(/\/+$/, "");
  next.localPath = (next.localPath || DEFAULTS.localPath).replace(/^\/+|\/+$/g, "");
  next.base = (next.base || DEFAULTS.base).replace(/\/+$/, "");
  next.mode = next.mode === "test" ? "test" : "prod";
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function webhookUrl(cfg) {
  if (cfg.target === "local") {
    return `${cfg.localBase}/webhook/${cfg.localPath}`;
  }
  const seg = cfg.mode === "test" ? "webhook-test" : "webhook";
  return `${cfg.base}/${seg}/${cfg.id}/chat`;
}

// אותה לוגיקת חילוץ תשובה כמו jarvis-web/index.html
function extractReply(data) {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return extractReply(data[0]);
  if (typeof data === "object") {
    return (
      data.output ??
      data.text ??
      data.response ??
      data.message ??
      data.answer ??
      (data.json ? extractReply(data.json) : null) ??
      JSON.stringify(data)
    );
  }
  return String(data);
}

function httpJson(url, { method = "POST", body, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        },
        timeout
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            /* לא תמיד JSON */
          }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * שולח הודעה ל-JARVIS ומחזיר { ok, reply, status }.
 * זורק רק על תקלת רשת אמיתית; 404/500 מוחזרים כ-ok:false עם רמז.
 */
async function ask(chatInput, sessionId, { timeout } = {}) {
  const cfg = readConfig();
  const url = webhookUrl(cfg);
  const res = await httpJson(url, {
    method: "POST",
    body: {
      action: "sendMessage",
      sessionId: sessionId || `magnet-studio-${Date.now()}`,
      chatInput,
      route: ""
    },
    timeout
  });

  if (res.status >= 200 && res.status < 300) {
    const reply = extractReply(res.json ?? res.text).trim();
    return { ok: true, status: res.status, reply, url };
  }

  let hint;
  if (res.status === 404) {
    hint =
      cfg.target === "local"
        ? `ה-workflow "JARVIS Local" לא פעיל ב-n8n המקומי (${cfg.localBase}). ודאו שהקונטיינר magnet-studio-n8n רץ ושה-workflow Active — או לחצו "הפעל n8n" בלוח הבקרה.`
        : "ה-workflow של JARVIS אינו Active ב-n8n Cloud, או שמזהה ה-Webhook שגוי.";
  } else if (res.status === 500) {
    hint = "ה-workflow של JARVIS נכשל בריצה. בדקו את לוג ההרצות (Executions) ב-n8n.";
  } else {
    hint = `שרת n8n החזיר סטטוס ${res.status}.`;
  }
  return { ok: false, status: res.status, reply: "", hint, url, detail: (res.text || "").slice(0, 300) };
}

module.exports = { ask, readConfig, writeConfig, extractReply, DEFAULTS };
