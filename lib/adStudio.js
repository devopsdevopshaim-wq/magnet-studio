// lib/adStudio.js — סטודיו פרסום ושיווק: קמפיין מלא (כותרות, טקסטים, קריאה-לפעולה, האשטגים,
// קהל יעד, בריף חזותי) ממותאם לפלטפורמה ולטון, דרך אותה שרשרת AI כמו שאר המערכת.

const PLATFORM_LABELS = {
  facebook: "פייסבוק", instagram: "אינסטגרם", google: "מודעות גוגל",
  whatsapp: "וואטסאפ / סטטוס", flyer: "פלייר / עלון להדפסה", email: "מייל שיווקי"
};
const GOAL_LABELS = { launch: "השקת מוצר/מבצע", sale: "מבצע/הנחה", awareness: "חשיפת מותג", event: "אירוע", loyalty: "שימור לקוחות" };

function buildPrompt(b) {
  const platform = PLATFORM_LABELS[b.platform] || b.platform || "רשתות חברתיות";
  const goal = GOAL_LABELS[b.goal] || b.goal || "קידום";
  return [
    `אתה קופירייטר שיווקי מקצועי הכותב בעברית עבור עסק קטן.`,
    `עסק: ${b.business || "—"}${b.industry ? ` (${b.industry})` : ""}`,
    `מוצר/הצעה: ${b.offer || "—"}`,
    `מטרת הקמפיין: ${goal} · פלטפורמה: ${platform} · טון: ${b.tone || "חם ומקצועי"}`,
    b.audience ? `קהל יעד: ${b.audience}` : "",
    b.notes ? `הערות נוספות: ${b.notes}` : "",
    "",
    "כתוב בדיוק בפורמט הזה, שמור את כותרות ה-### כפי שהן, בעברית (חוץ מהבריף החזותי שבאנגלית):",
    "",
    "### HEADLINES",
    "(5 כותרות קצרות וסוחפות, כל אחת בשורה ממוספרת)",
    "1. ...",
    "",
    "### BODY_SHORT",
    "(משפט-שניים, לסטורי/וואטסאפ)",
    "",
    "### BODY_MEDIUM",
    "(פסקה אחת, 3-4 משפטים, לפוסט רגיל)",
    "",
    "### BODY_LONG",
    "(3-4 פסקאות, למייל שיווקי או פלייר מפורט)",
    "",
    "### CTA",
    "(4 קריאות-לפעולה קצרות, ממוספרות)",
    "1. ...",
    "",
    "### HASHTAGS",
    "(8-12 האשטגים רלוונטיים בעברית ובאנגלית, מופרדים ברווח, עם #)",
    "",
    "### AUDIENCE",
    "(1-2 משפטים על קהל היעד המדויק והכי רלוונטי למודעה הזו)",
    "",
    "### IMAGE_BRIEF",
    "(פסקה קצרה בעברית שמתארת את התמונה/סרטון האידיאלי למודעה, ואז שורה נפרדת שמתחילה ב-PROMPT: עם תיאור מפורט באנגלית למחולל תמונה)"
  ].filter(Boolean).join("\n");
}

function parseSections(text) {
  const sec = {};
  const re = /^###\s*([A-Z_0-9 \-]+?)\s*$/gm;
  let m; const marks = [];
  while ((m = re.exec(text))) marks.push({ name: m[1].trim(), i: m.index, end: re.lastIndex });
  marks.forEach((mk, idx) => {
    sec[mk.name] = text.slice(mk.end, idx + 1 < marks.length ? marks[idx + 1].i : text.length).trim();
  });
  return sec;
}
const stripNum = (l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/\*\*/g, "").replace(/^["'`]+|["'`]+$/g, "").trim();
const listLines = (s) => (s || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\(/.test(l));

function parseCampaign(text) {
  const sec = parseSections(text);
  const imgSec = sec.IMAGE_BRIEF || "";
  const promptLine = (imgSec.split(/\r?\n/).find((l) => /^PROMPT:/i.test(l.trim())) || "").replace(/^PROMPT:\s*/i, "").trim();
  const imageBrief = imgSec.replace(/^PROMPT:.*$/im, "").trim();
  return {
    headlines: listLines(sec.HEADLINES).map(stripNum),
    bodyShort: (sec.BODY_SHORT || "").trim(),
    bodyMedium: (sec.BODY_MEDIUM || "").trim(),
    bodyLong: (sec.BODY_LONG || "").trim(),
    cta: listLines(sec.CTA).map(stripNum),
    hashtags: (sec.HASHTAGS || "").trim(),
    audience: (sec.AUDIENCE || "").trim(),
    imageBrief, imagePrompt: promptLine,
    _raw: text
  };
}

async function generate(brief) {
  brief = brief || {};
  if (!brief.business) throw new Error("צריך שם עסק");
  if (!brief.offer) throw new Error("צריך תיאור מוצר/הצעה");
  const { askAI } = require("./dailyNarrative");
  const r = await askAI(buildPrompt(brief), { sessionTag: "ads", timeout: 60000 });
  if (!r || !r.text) {
    const e = new Error("אין מנוע AI זמין כרגע — הוסיפו מפתח בהגדרות → אינטגרציות → בינה מלאכותית.");
    e.code = "NO_AI";
    throw e;
  }
  const campaign = parseCampaign(r.text);
  campaign.source = r.source;
  campaign.business = brief.business;
  campaign.platform = PLATFORM_LABELS[brief.platform] || brief.platform;
  return campaign;
}

module.exports = { generate, PLATFORM_LABELS, GOAL_LABELS };
