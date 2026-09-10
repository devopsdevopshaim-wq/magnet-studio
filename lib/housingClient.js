// לקוח ל-DiraFinder (מערכת הדיור). הסטאק המקומי (Postgres) חי ב-housing-system/infra/docker-compose.local.yml.
// סדר ניסיונות: (1) Postgres ישיר אם HOUSING_DB_URL מוגדר; (2) HTTP API אם HOUSING_API_BASE; (3) down.
// הכל best-effort: אם שום מקור לא נגיש -> up:false / [] בלי לזרוק.

const https = require("https");
const http = require("http");

const DB_URL = process.env.HOUSING_DB_URL || "postgres://dira:dira_local@localhost:5433/dira";
const BASE = (process.env.HOUSING_API_BASE || "").replace(/\/+$/, "");

// ---------- Postgres ----------

let pool = null;
function getPool() {
  if (pool) return pool;
  try {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: DB_URL, max: 3, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 });
    pool.on("error", () => {}); // לא להפיל את התהליך על נפילת חיבור רקע
  } catch {
    pool = null;
  }
  return pool;
}

function mapRow(r) {
  return {
    title: [r.property_kind, r.neighborhood].filter(Boolean).join(" · ") || r.city || "(נכס)",
    city: r.city || "",
    neighborhood: r.neighborhood || "",
    dealType: r.deal_type === "rent" ? "השכרה" : "מכירה",
    price: r.price_ils != null ? Number(r.price_ils) : null,
    rooms: r.rooms != null ? Number(r.rooms) : null,
    sizeSqm: r.built_sqm != null ? Number(r.built_sqm) : null,
    pricePerSqm: r.price_per_sqm_ils != null ? Number(r.price_per_sqm_ils) : null,
    marketGapPct: r.market_gap_pct != null ? Number(r.market_gap_pct) : null,
    score: r.score != null ? Number(r.score) : null,
    recommendedUse: r.recommended_use || null,
    contactName: r.contact_name || null,
    contactPhone: r.contact_phone || null,
    contactType: r.contact_type || null,
    link: r.url || null
  };
}

async function pgStatus() {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query("SELECT count(*)::int AS n FROM listings");
    return { up: true, source: "postgres", base: DB_URL.replace(/:[^:@/]+@/, ":***@"), count: rows[0].n };
  } catch {
    return null;
  }
}

async function pgListings(limit) {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query(
      "SELECT * FROM v_listings_public ORDER BY score DESC NULLS LAST, updated_at DESC LIMIT $1",
      [limit]
    );
    return rows.map(mapRow);
  } catch {
    return null;
  }
}

// ---------- HTTP fallback ----------

function httpJson(url, { timeout = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      { hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname + u.search, method: "GET", headers: { Accept: "application/json" }, timeout },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            /* לא JSON */
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function httpStatus() {
  if (!BASE) return null;
  for (const path of ["/api/listings?limit=1", "/api/health", "/health"]) {
    try {
      const res = await httpJson(`${BASE}${path}`);
      if (res.status >= 200 && res.status < 300) return { up: true, source: "http", base: BASE };
    } catch {
      /* ננסה את הבא */
    }
  }
  return null;
}

async function httpListings(limit) {
  if (!BASE) return null;
  try {
    const res = await httpJson(`${BASE}/api/listings?limit=${limit}`, { timeout: 6000 });
    const rows = Array.isArray(res.json) ? res.json : res.json?.listings || res.json?.data || [];
    if (Array.isArray(rows)) {
      return rows.slice(0, limit).map((r) => ({
        title: r.title || r.address || r.name || "(נכס)",
        city: r.city || "",
        price: r.price ?? r.price_ils ?? null,
        rooms: r.rooms ?? null,
        sizeSqm: r.size_sqm ?? r.built_sqm ?? null,
        score: r.score ?? null,
        link: r.url || r.link || null
      }));
    }
  } catch {
    /* ניפול ל-null */
  }
  return null;
}

// ---------- API ----------

async function status() {
  return (await pgStatus()) || (await httpStatus()) || { up: false, base: DB_URL.replace(/:[^:@/]+@/, ":***@") };
}

async function recentListings(limit = 12) {
  return (await pgListings(limit)) || (await httpListings(limit)) || [];
}

module.exports = { status, recentListings, BASE, DB_URL };
