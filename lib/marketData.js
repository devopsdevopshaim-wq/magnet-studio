// lib/marketData.js — נתוני שוק חיים (Yahoo Finance, ללא מפתח). מדדים, מניות, קריפטו, מטבע, סחורות.
// שים לב: מידע בלבד. לא ייעוץ השקעות ולא המלצת קנייה/מכירה.

const https = require("https");

const CACHE = { data: null, at: 0 };
const TTL = 90 * 1000;

const TRACKED = [
  { sym: "^GSPC", he: "S&P 500", grp: "מדדים" },
  { sym: "^IXIC", he: "נאסד״ק", grp: "מדדים" },
  { sym: "^DJI", he: "דאו ג׳ונס", grp: "מדדים" },
  { sym: "TA35.TA", he: "ת״א 35", grp: "מדדים" },
  { sym: "TA125.TA", he: "ת״א 125", grp: "מדדים" },
  { sym: "^STOXX50E", he: "יורו סטוקס 50", grp: "מדדים" },
  { sym: "BTC-USD", he: "ביטקוין", grp: "קריפטו" },
  { sym: "ETH-USD", he: "את׳ריום", grp: "קריפטו" },
  { sym: "GC=F", he: "זהב", grp: "סחורות" },
  { sym: "CL=F", he: "נפט (WTI)", grp: "סחורות" },
  { sym: "ILS=X", he: "דולר/שקל", grp: "מטבע" },
  { sym: "EURILS=X", he: "יורו/שקל", grp: "מטבע" },
  { sym: "^TNX", he: "אג״ח ארה״ב 10ש׳", grp: "ריבית" }
];

function fetchJson(host, path, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path, headers: { "User-Agent": "Mozilla/5.0" }, timeout }, (r) => {
      const bufs = [];
      r.on("data", (c) => bufs.push(c));
      r.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(bufs).toString("utf8"))); }
        catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

async function oneQuote(t) {
  try {
    const j = await fetchJson("query1.finance.yahoo.com",
      `/v8/finance/chart/${encodeURIComponent(t.sym)}?interval=1d&range=1mo`);
    const res = j.chart?.result?.[0];
    if (!res) return null;
    const m = res.meta;
    const closes = (res.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
    const price = m.regularMarketPrice;
    // השינוי היומי = מול הסגירה הקודמת (לא מול תחילת החודש)
    const prev = m.previousClose ?? m.regularMarketPreviousClose ?? closes[closes.length - 2] ?? m.chartPreviousClose ?? price;
    const spark = closes.slice(-22);
    const monthAgo = spark[0] || m.chartPreviousClose || price;
    return {
      ...t,
      price,
      currency: m.currency,
      changePct: prev ? +(((price / prev) - 1) * 100).toFixed(2) : 0,
      changeMonthPct: monthAgo ? +(((price / monthAgo) - 1) * 100).toFixed(1) : 0,
      spark,
      dayHigh: m.regularMarketDayHigh,
      dayLow: m.regularMarketDayLow
    };
  } catch { return null; }
}

async function getMarket() {
  if (CACHE.data && Date.now() - CACHE.at < TTL) return CACHE.data;
  const quotes = (await Promise.all(TRACKED.map(oneQuote))).filter(Boolean);

  // "מצב שוק" — סנטימנט מחושב פשוט מהמדדים המרכזיים
  const idx = quotes.filter((q) => q.grp === "מדדים");
  const avgDay = idx.length ? idx.reduce((s, q) => s + q.changePct, 0) / idx.length : 0;
  const avgMonth = idx.length ? idx.reduce((s, q) => s + q.changeMonthPct, 0) / idx.length : 0;
  const mood = avgDay > 0.6 ? "חיובי" : avgDay < -0.6 ? "שלילי" : "מעורב";
  const trend = avgMonth > 2 ? "עולה" : avgMonth < -2 ? "יורד" : "דשדוש";

  const byGrp = {};
  quotes.forEach((q) => { (byGrp[q.grp] = byGrp[q.grp] || []).push(q); });

  const out = {
    updatedAt: new Date().toISOString(),
    groups: byGrp,
    quotes,
    summary: { mood, trend, avgDayPct: +avgDay.toFixed(2), avgMonthPct: +avgMonth.toFixed(1) },
    disclaimer: "נתוני שוק לצורך מידע בלבד (מקור: Yahoo Finance, בעיכוב אפשרי). אין כאן ייעוץ השקעות, המלצת קנייה/מכירה, או התאמה אישית. החלטות פיננסיות — עם יועץ מורשה."
  };
  CACHE.data = out; CACHE.at = Date.now();
  return out;
}

// חדשות כלכלה — כותרות מ-RSS (Globes / TheMarker / Yahoo Finance)
async function getMarketNews() {
  const feeds = [
    { name: "גלובס", host: "www.globes.co.il", path: "/webservice/rss/rssfeeder.asmx/FeederNode?iID=2" },
    { name: "Yahoo Finance", host: "feeds.finance.yahoo.com", path: "/rss/2.0/headline?s=^GSPC&region=US&lang=en-US" }
  ];
  const items = [];
  await Promise.all(feeds.map((f) => new Promise((resolve) => {
    https.get({ host: f.host, path: f.path, headers: { "User-Agent": "Mozilla/5.0" }, timeout: 8000 }, (r) => {
      const bufs = [];
      r.on("data", (c) => bufs.push(c));
      r.on("end", () => {
        const xml = Buffer.concat(bufs).toString("utf8");
        const re = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>[\s\S]*?(?:<pubDate>(.*?)<\/pubDate>)?[\s\S]*?<\/item>/g;
        let m, n = 0;
        while ((m = re.exec(xml)) && n < 6) { items.push({ source: f.name, title: m[1].trim(), link: (m[2] || "").trim(), ts: m[3] ? Date.parse(m[3]) : null }); n++; }
        resolve();
      });
    }).on("error", () => resolve()).on("timeout", function () { this.destroy(); resolve(); });
  })));
  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 10);
}

// ---------- קריאת שוק ("המלצות") — אותות טכניים עובדתיים + פרשנות חינוכית ----------
// חשוב: זו אינה המלצת קנייה/מכירה ואינה ייעוץ. אלה מדדים מחושבים מהמחיר עצמו
// + קונצנזוס אנליסטים מדווח (כשזמין), להקשר בלבד.

function signalsFor(q) {
  const s = q.spark || [];
  const price = q.price;
  const avg = s.length ? s.reduce((a, b) => a + b, 0) / s.length : price;
  const hi = Math.max(...s, price), lo = Math.min(...s, price);
  const rangePos = hi > lo ? +(((price - lo) / (hi - lo)) * 100).toFixed(0) : 50; // 0=תחתית, 100=שיא
  const vsAvg = avg ? +(((price / avg) - 1) * 100).toFixed(1) : 0;
  const half = s.slice(-11);
  const halfAvg = half.length ? half.reduce((a, b) => a + b, 0) / half.length : avg;
  const accel = halfAvg && avg ? +(((halfAvg / avg) - 1) * 100).toFixed(1) : 0;
  let read;
  if (q.changeMonthPct > 3 && vsAvg > 0) read = "מגמה חיובית — מעל הממוצע החודשי";
  else if (q.changeMonthPct < -3 && vsAvg < 0) read = "מגמה שלילית — מתחת לממוצע החודשי";
  else if (rangePos > 80) read = "קרוב לשיא החודשי — תנודתיות אפשרית";
  else if (rangePos < 20) read = "קרוב לתחתית החודשית";
  else read = "דשדוש בטווח החודשי";
  return { rangePos, vsAvgPct: vsAvg, momentumPct: accel, read };
}

async function analystConsensus(symbol) {
  try {
    const j = await fetchJson("query2.finance.yahoo.com",
      `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,recommendationTrend`);
    const r = j.quoteSummary?.result?.[0];
    if (!r) return null;
    const fd = r.financialData || {};
    const tr = r.recommendationTrend?.trend?.[0] || {};
    const votes = (tr.strongBuy || 0) + (tr.buy || 0) + (tr.hold || 0) + (tr.sell || 0) + (tr.strongSell || 0);
    if (!votes && !fd.recommendationKey) return null;
    return {
      key: fd.recommendationKey || null,          // buy / hold / sell / strong_buy ...
      mean: fd.recommendationMean?.raw ?? fd.recommendationMean ?? null, // 1=strong buy ... 5=strong sell
      analysts: fd.numberOfAnalystOpinions?.raw ?? fd.numberOfAnalystOpinions ?? votes,
      targetMean: fd.targetMeanPrice?.raw ?? fd.targetMeanPrice ?? null,
      targetLow: fd.targetLowPrice?.raw ?? fd.targetLowPrice ?? null,
      targetHigh: fd.targetHighPrice?.raw ?? fd.targetHighPrice ?? null,
      current: fd.currentPrice?.raw ?? fd.currentPrice ?? null,
      breakdown: { strongBuy: tr.strongBuy || 0, buy: tr.buy || 0, hold: tr.hold || 0, sell: tr.sell || 0, strongSell: tr.strongSell || 0 },
      source: "Yahoo Finance / קונצנזוס אנליסטים מדווח"
    };
  } catch { return null; }
}

const OUT_CACHE = { data: null, at: 0 };
async function getMarketOutlook() {
  if (OUT_CACHE.data && Date.now() - OUT_CACHE.at < 5 * 60 * 1000) return OUT_CACHE.data;
  const mkt = await getMarket();
  const board = mkt.quotes.map((q) => ({
    sym: q.sym, he: q.he, grp: q.grp, price: q.price, currency: q.currency,
    changePct: q.changePct, changeMonthPct: q.changeMonthPct,
    signals: signalsFor(q)
  }));

  // פרשנות חינוכית קצרה — בלי שמות ניירות ובלי "לקנות/למכור"
  let commentary = null;
  try {
    const { askAI } = require("./dailyNarrative");
    const rows = board.map((b) => `${b.he}: יום ${b.changePct}%, חודש ${b.changeMonthPct}%, ${b.signals.read}`).join("\n");
    const r = await askAI(
      `אתה כותב סקירת שוק חינוכית בעברית לאדם פרטי. הנתונים:\n${rows}\n\n` +
      `כתוב 3–4 משפטים: מה המצב הכללי, מה בולט, ומה כדאי לשים לב אליו מבחינת סיכון ופיזור. ` +
      `אל תמליץ לקנות או למכור נייר ערך, קרן או חברה מסוימת. אל תיתן יעד מחיר. ` +
      `סיים במשפט שמזכיר שזה מידע חינוכי בלבד ולא ייעוץ.`,
      { sessionTag: "market" }
    ).catch(() => null);
    commentary = r && r.text ? r.text : null;
  } catch { /* AI לא זמין */ }

  const out = {
    updatedAt: new Date().toISOString(),
    summary: mkt.summary,
    board,
    commentary: commentary || null,
    disclaimer: "אותות טכניים מחושבים מנתוני המחיר עצמם — לא המלצת קנייה/מכירה, לא יעד מחיר, ולא ייעוץ השקעות או התאמה אישית. להחלטות — יועץ/ת השקעות מורשה/ת."
  };
  OUT_CACHE.data = out; OUT_CACHE.at = Date.now();
  return out;
}

// חיפוש נייר ערך שהמשתמש הזין — ציטוט + קונצנזוס אנליסטים מדווח (הקשר בלבד)
async function lookupTicker(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym || !/^[A-Z0-9.\-^=]{1,15}$/.test(sym)) throw new Error("סימבול לא תקין");
  const q = await oneQuote({ sym, he: sym, grp: "חיפוש" });
  if (!q) throw new Error("לא נמצא נייר בשם זה");
  const consensus = await analystConsensus(sym);
  return {
    symbol: sym,
    quote: { price: q.price, currency: q.currency, changePct: q.changePct, changeMonthPct: q.changeMonthPct, spark: q.spark },
    signals: signalsFor(q),
    consensus,
    disclaimer: "ציטוט + קונצנזוס אנליסטים מדווח (מקור: Yahoo Finance), למידע והקשר בלבד. אין כאן המלצה אישית, ואין ודאות שהתחזיות יתממשו."
  };
}

module.exports = { getMarket, getMarketNews, getMarketOutlook, lookupTicker };
