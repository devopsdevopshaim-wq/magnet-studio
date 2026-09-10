// חדשות היום — מיזוג RSS של Ynet + Walla. פרסור regex פשוט (בלי תלות npm).
// best-effort: כשל מקור אחד לא מפיל את השני. מטמון בזיכרון 12 דקות.

const https = require("https");

const FEEDS = [
  { source: "ynet", url: "https://www.ynet.co.il/Integration/StoryRss2.xml" },
  { source: "וואלה", url: "https://rss.walla.co.il/feed/1?type=main" }
];

let cache = { at: 0, items: [] };
const CACHE_MS = 12 * 60 * 1000;

function fetchText(url, timeout = 9000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: "GET", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml,text/xml,*/*" }, timeout },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchText(new URL(res.headers.location, url).toString(), timeout).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`RSS ${res.statusCode}`));
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("RSS timeout")));
    req.on("error", reject);
    req.end();
  });
}

function unwrap(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseItems(xml, source) {
  const out = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && out.length < 40) {
    const block = m[1];
    const grab = (tag) => {
      const r = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
      return r ? r[1] : "";
    };
    const title = unwrap(grab("title"));
    const link = unwrap(grab("link")) || unwrap(grab("guid"));
    const pub = unwrap(grab("pubDate"));
    if (!title || title.length < 8) continue;
    const ts = pub ? Date.parse(pub) : Date.now();
    out.push({ title, link: /^https?:/.test(link) ? link : null, source, ts: Number.isFinite(ts) ? ts : Date.now() });
  }
  return out;
}

async function getNews() {
  const now = Date.now();
  if (cache.items.length && now - cache.at < CACHE_MS) return { items: cache.items, cached: true };

  const results = await Promise.allSettled(
    FEEDS.map((f) => fetchText(f.url).then((xml) => parseItems(xml, f.source)))
  );

  const seen = new Set();
  const items = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const it of r.value) {
      const key = it.title.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  }
  items.sort((a, b) => b.ts - a.ts);
  const trimmed = items.slice(0, 30);

  if (trimmed.length) cache = { at: now, items: trimmed };
  return { items: trimmed.length ? trimmed : cache.items, updatedAt: new Date().toISOString() };
}

module.exports = { getNews };
