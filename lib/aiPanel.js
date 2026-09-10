// שאילתה מקבילה למספר מנועי AI - מקומיים (Ollama, חינם) וענן (דורשים מפתח API משלהם).
// אותה פילוסופיה כמו Maton: מפתחות רק מ-process.env, לעולם לא בקוד. מקור שלא הוגדר - מדלגים עליו בשקט.

const https = require("https");
const http = require("http");

const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11434;

function httpJson(url, { method = "GET", headers = {}, body, timeout = 45000 } = {}) {
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
        headers: { "Content-Type": "application/json", ...headers, ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) },
        timeout
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* לא JSON */ }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json ?? text);
          else reject(new Error(`${res.statusCode}: ${json?.error?.message || json?.error || text.slice(0, 200)}`));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- Ollama (מקומי, חינם, ללא מפתח) ----------

async function listOllamaModels() {
  try {
    const r = await httpJson(`http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/tags`, { timeout: 4000 });
    return (r.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function queryOllama(model, prompt) {
  const r = await httpJson(`http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/generate`, {
    method: "POST",
    body: { model, prompt, stream: false },
    timeout: 90000
  });
  return r.response || "";
}

// ---------- Open WebUI (רץ מקומית ב-Docker על פורט 3000, דורש מפתח API משלו) ----------

const OPENWEBUI_BASE = process.env.OPENWEBUI_BASE_URL || "http://localhost:3000";

async function isOpenWebUIReachable() {
  try {
    await httpJson(`${OPENWEBUI_BASE}/api/config`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function queryOpenWebUI(prompt, apiKey) {
  const r = await httpJson(`${OPENWEBUI_BASE}/api/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { model: process.env.OPENWEBUI_MODEL || "llama3.1:latest", messages: [{ role: "user", content: prompt }] },
    timeout: 90000
  });
  return r.choices?.[0]?.message?.content || "";
}

// ---------- ספקי ענן - כל אחד דורש מפתח API נפרד מהמשתמש ----------

const CLOUD_SOURCES = [
  {
    key: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    async ask(prompt, apiKey) {
      const r = await httpJson("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: { model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }] }
      });
      return r.choices?.[0]?.message?.content || "";
    }
  },
  {
    key: "perplexity",
    label: "Perplexity",
    envVar: "PERPLEXITY_API_KEY",
    async ask(prompt, apiKey) {
      const r = await httpJson("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: { model: "sonar", messages: [{ role: "user", content: prompt }] }
      });
      return r.choices?.[0]?.message?.content || "";
    }
  },
  {
    key: "gemini",
    label: "Gemini",
    envVar: "GEMINI_API_KEY",
    async ask(prompt, apiKey) {
      const r = await httpJson(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        body: { contents: [{ parts: [{ text: prompt }] }] }
      });
      return r.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    async ask(prompt, apiKey) {
      const r = await httpJson("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: { model: "deepseek-chat", messages: [{ role: "user", content: prompt }] }
      });
      return r.choices?.[0]?.message?.content || "";
    }
  },
  {
    key: "grok",
    label: "Grok",
    envVar: "XAI_API_KEY",
    async ask(prompt, apiKey) {
      const r = await httpJson("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: { model: "grok-4", messages: [{ role: "user", content: prompt }] }
      });
      return r.choices?.[0]?.message?.content || "";
    }
  }
];

async function listSources() {
  const ollamaModels = await listOllamaModels();
  const local = ollamaModels.map((m) => ({ key: `ollama:${m}`, label: `Ollama · ${m}`, type: "local", available: true }));

  const openwebuiReachable = await isOpenWebUIReachable();
  const openwebuiKey = process.env.OPENWEBUI_API_KEY;
  const openwebui = {
    key: "openwebui",
    label: "Open WebUI",
    type: "local",
    available: openwebuiReachable && !!openwebuiKey,
    envVar: "OPENWEBUI_API_KEY",
    note: !openwebuiReachable ? "השירות לא פעיל כרגע על פורט 3000" : !openwebuiKey ? "רץ, אך חסר מפתח API" : null
  };

  const cloud = CLOUD_SOURCES.map((s) => ({ key: s.key, label: s.label, type: "cloud", available: !!process.env[s.envVar], envVar: s.envVar }));
  return [...local, openwebui, ...cloud];
}

/** שולח שאלה אחת לכל המקורות הזמינים במקביל */
async function askAll(prompt) {
  const ollamaModels = await listOllamaModels();
  const jobs = [];

  for (const model of ollamaModels) {
    jobs.push(
      queryOllama(model, prompt)
        .then((text) => ({ source: `Ollama · ${model}`, ok: true, text }))
        .catch((err) => ({ source: `Ollama · ${model}`, ok: false, error: err.message }))
    );
  }

  const openwebuiKey = process.env.OPENWEBUI_API_KEY;
  if (openwebuiKey && (await isOpenWebUIReachable())) {
    jobs.push(
      queryOpenWebUI(prompt, openwebuiKey)
        .then((text) => ({ source: "Open WebUI", ok: true, text }))
        .catch((err) => ({ source: "Open WebUI", ok: false, error: err.message }))
    );
  }

  for (const s of CLOUD_SOURCES) {
    const apiKey = process.env[s.envVar];
    if (!apiKey) continue; // מקור לא מוגדר - מדלגים בשקט, לא שגיאה
    jobs.push(
      s.ask(prompt, apiKey)
        .then((text) => ({ source: s.label, ok: true, text }))
        .catch((err) => ({ source: s.label, ok: false, error: err.message }))
    );
  }

  return Promise.all(jobs);
}

/** מסנתז את כל התשובות לתשובה אחת מקצועית אחת, באמצעות המודל המקומי הגדול ביותר הזמין */
async function synthesize(question, answers) {
  const goodAnswers = answers.filter((a) => a.ok && a.text?.trim());
  if (!goodAnswers.length) return null;

  const models = await listOllamaModels();
  const preferredOrder = ["gpt-oss:120b-cloud", "glm-5.2:cloud", "llama3.1:latest", "llama3.2:latest"];
  const model = preferredOrder.find((m) => models.includes(m)) || models[0];
  if (!model) return null;

  const combined = goodAnswers.map((a) => `--- ${a.source} ---\n${a.text}`).join("\n\n");
  const prompt = `שאלה מהמשתמש: "${question}"\n\nלהלן תשובות שהתקבלו ממספר מודלים שונים:\n\n${combined}\n\nענה בעברית תשובה אחת, מקצועית, מדויקת ותמציתית, המשלבת את הנקודות הטובות ביותר מכל התשובות למעלה, ומציינת אם יש סתירות ביניהן.`;

  try {
    return await queryOllama(model, prompt);
  } catch {
    return null;
  }
}

module.exports = { listSources, askAll, synthesize, listOllamaModels, queryOllama, CLOUD_SOURCES };
