// לקוח ל-Maton (https://maton.ai) - שער API מאוחד לחיבורים חיצוניים (Gmail, Drive, Calendar, Slack, YouTube).
// המפתחות לעולם לא נשמרים בקוד - נקראים אך ורק ממשתני סביבה מקומיים:
//   MATON_API_KEY, MATON_API_KEY_2, MATON_API_KEY_3  (חשבון Maton אחד לכל מפתח).
// אם אף מפתח לא הוגדר, כל הפונקציות כאן מחזירות "not configured".

const https = require("https");

const BASE_HOST = "api.maton.ai";

/** כל מפתחות Maton המוגדרים, לפי הסדר. [] אם אין. */
function keys() {
  return [process.env.MATON_API_KEY, process.env.MATON_API_KEY_2, process.env.MATON_API_KEY_3].filter(Boolean);
}

function isConfigured() {
  return keys().length > 0;
}

// מצב הבריאות האחרון של Maton — כדי שה-UI יוכל להסביר "מפתח לא תקין" במקום להראות ריק
let health = { ok: null, error: null, checkedAt: null };
function getHealth() {
  return { configured: isConfigured(), keyCount: keys().length, ...health };
}
function noteResult(err) {
  if (err && /Maton 401|Invalid API key|Unauthorized/i.test(err.message || "")) {
    health = { ok: false, error: "מפתח Maton לא תקין או פג — צור חדש ב-maton.ai והגדר setx MATON_API_KEY", checkedAt: new Date().toISOString() };
  } else if (err) {
    health = { ok: false, error: (err.message || "").slice(0, 160), checkedAt: new Date().toISOString() };
  } else {
    health = { ok: true, error: null, checkedAt: new Date().toISOString() };
  }
}

function matonRequest(pathname, { method = "GET", body, apiKey } = {}) {
  return new Promise((resolve, reject) => {
    const key = apiKey || keys()[0];
    if (!key) return reject(new Error("אף מפתח Maton אינו מוגדר (MATON_API_KEY)"));

    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: BASE_HOST,
        path: pathname,
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        },
        timeout: 15000
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
            /* לא כל תשובה היא JSON */
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            noteResult(null);
            resolve(json ?? text);
          } else {
            const e = new Error(`Maton ${res.statusCode}: ${json?.message || text.slice(0, 200)}`);
            noteResult(e);
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Maton timeout")));
    req.on("error", (e) => { noteResult(e); reject(e); });
    if (payload) req.write(payload);
    req.end();
  });
}

/** חיבורי מפתח בודד */
function listConnections(apiKey) {
  return matonRequest("/connections", { apiKey });
}

/** כל החיבורים מכל המפתחות, כשכל חיבור מתויג ב-_keyIndex וב-_apiKey */
async function listAllConnections() {
  const ks = keys();
  const out = [];
  for (let i = 0; i < ks.length; i++) {
    try {
      const r = await listConnections(ks[i]);
      const list = r?.connections || r?.data || [];
      for (const c of list) out.push({ ...c, _keyIndex: i, _apiKey: ks[i] });
    } catch {
      /* מפתח לא תקין - מדלגים */
    }
  }
  return out;
}

function createConnection(app, apiKey) {
  return matonRequest("/connections", { method: "POST", body: { app }, apiKey });
}

function accountLabels() {
  // רק לתצוגה - איזה חשבונות Maton מוגדרים (מספר בלבד, לא מפתחות)
  return keys().map((_, i) => `חשבון Maton ${i + 1}`);
}

// ---------- Gmail ----------

function gmailListMessages(query, maxResults = 10, apiKey) {
  const q = query ? `?q=${encodeURIComponent(query)}&maxResults=${maxResults}` : `?maxResults=${maxResults}`;
  return matonRequest(`/google-mail/gmail/v1/users/me/messages${q}`, { apiKey });
}

function gmailGetMessage(id, apiKey) {
  return matonRequest(
    `/google-mail/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
    { apiKey }
  );
}

async function gmailListMessagesDetailed(query, maxResults = 10, apiKey) {
  const list = await gmailListMessages(query, maxResults, apiKey);
  const ids = (list.messages || []).map((m) => m.id);
  const details = await Promise.all(ids.map((id) => gmailGetMessage(id, apiKey).catch(() => null)));
  return {
    resultSizeEstimate: list.resultSizeEstimate,
    messages: details.filter(Boolean).map((d) => {
      const headers = d.payload?.headers || [];
      const get = (name) => headers.find((h) => h.name === name)?.value || "";
      return {
        id: d.id,
        subject: get("Subject") || "(ללא נושא)",
        from: get("From"),
        snippet: d.snippet || "",
        link: `https://mail.google.com/mail/u/0/#all/${d.id}`
      };
    })
  };
}

function driveListFiles(maxResults = 10, apiKey) {
  const fields = encodeURIComponent("files(id,name,mimeType,webViewLink,modifiedTime)");
  const q = `pageSize=${maxResults}&orderBy=${encodeURIComponent("modifiedTime desc")}&fields=${fields}`;
  return matonRequest(`/google-drive/drive/v3/files?${q}`, { apiKey });
}

function calendarListEvents(maxResults = 10, { timeMin, timeMax, connectionId, apiKey } = {}) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    timeMin: timeMin || new Date().toISOString(),
    singleEvents: "true",
    orderBy: "startTime"
  });
  if (timeMax) params.set("timeMax", timeMax);
  if (connectionId) params.set("connection_id", connectionId);
  return matonRequest(`/google-calendar/calendar/v3/calendars/primary/events?${params.toString()}`, { apiKey });
}

function slackListChannels(apiKey) {
  return matonRequest(`/slack/api/conversations.list?limit=20&exclude_archived=true`, { apiKey });
}

function youtubeSubscriptions(maxResults = 10, apiKey) {
  return matonRequest(`/youtube/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=${maxResults}`, { apiKey });
}

module.exports = {
  isConfigured,
  getHealth,
  keys,
  accountLabels,
  matonRequest,
  listConnections,
  listAllConnections,
  createConnection,
  gmailListMessages,
  gmailGetMessage,
  gmailListMessagesDetailed,
  driveListFiles,
  calendarListEvents,
  slackListChannels,
  youtubeSubscriptions
};
