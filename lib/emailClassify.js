// סיווג מיילים לפי סוג, ולמיילים של חיפוש עבודה — גם לפי תחום מקצועי.
// היוריסטיקה מהירה (regex), בלי AI.

const JOB_SENDERS = /linkedin|drushin?|alljobs|jobmaster|jobmaster|jobinfo|indeed|glassdoor|ethosia|prowork|jobnik|ג'?וב|jobs?[.@]|talent|recruit|hh\.co\.il|sqlink|matrix-jobs|nisha|careerjet|xplace/i;
const JOB_TEXT =
  /משר(ה|ות)|דרוש(\/ה|ים|ה)?|מועמד(ות|ים)?|קורות ?חיים|קו"?ח|ראיון|גיוס|השמה|hiring|recruit|job ?(opening|offer|alert|posting)|position|vacancy|career|apply now|we're hiring|opportunity/i;

const FINANCE = /בנק|כרטיס אשראי|פנסי|ביטוח|הלוואה|isracard|max|leumi|hapoalim|discount|mizrahi|cal-online|visa|paypal|invoice|חשבונית/i;
const SOCIAL = /facebook|instagram|twitter|x\.com|tiktok|linkedin\.com\/feed|reddit|whatsapp/i;
const NEWSLETTER = /unsubscribe|הסרה מרשימת|newsletter|no-?reply|donotreply|עלון|דיוור/i;

// תחומים מקצועיים לחיפוש עבודה
const FIELDS = [
  ["DevOps / SRE", /devops|sre|site reliability|ci\/cd|kubernetes|k8s|terraform|ansible|תשתיות|אוטומציה/i],
  ["Cloud", /\bcloud\b|aws|azure|gcp|google cloud|ענן/i],
  ["Data / BigData", /\bdata\b|נתונים|big ?data|etl|spark|hadoop|databricks|bi\b|data engineer|data analyst|אנליסט/i],
  ["פיתוח / Backend", /back-?end|בק-?אנד|java|python|node\.?js|golang|\.net|c#|micro-?services|api developer/i],
  ["פיתוח / Frontend", /front-?end|פרונט|react|angular|vue|javascript|typescript|ui developer/i],
  ["QA / בדיקות", /\bqa\b|בדיקות|automation tester|בודק תוכנה|test engineer|selenium|cypress/i],
  ["ניהול מוצר / פרויקטים", /product manager|מנהל מוצר|project manager|מנהל פרויקט|scrum master|program manager|pmo/i],
  ["עיצוב / UX", /\bux\b|\bui\b|עיצוב|designer|מעצב|product design/i],
  ["IT / תמיכה", /\bit\b|help ?desk|תמיכה טכנית|system admin|סיסטם|תמיכה|network|רשתות/i],
  ["אבטחת מידע", /cyber|סייבר|security|אבטחת מידע|soc analyst|pen ?test|infosec/i],
  ["מכירות / שיווק", /sales|מכירות|marketing|שיווק|bdr|sdr|account executive/i]
];

function detectField(text) {
  for (const [name, re] of FIELDS) if (re.test(text)) return name;
  return "כללי";
}

/**
 * @param {{subject?:string, sender?:string, from?:string, snippet?:string}} m
 * @returns {{category:string, jobRelated:boolean, field:string|null}}
 */
function classify(m) {
  const sender = (m.sender || m.from || "").toString();
  const text = `${m.subject || ""} ${m.snippet || ""}`.toString();
  const all = `${sender} ${text}`;

  const jobRelated = JOB_SENDERS.test(sender) || JOB_TEXT.test(text);
  if (jobRelated) {
    return { category: "job", jobRelated: true, field: detectField(all) };
  }
  if (FINANCE.test(all)) return { category: "finance", jobRelated: false, field: null };
  if (SOCIAL.test(all)) return { category: "social", jobRelated: false, field: null };
  if (NEWSLETTER.test(all)) return { category: "newsletter", jobRelated: false, field: null };
  return { category: "other", jobRelated: false, field: null };
}

const CATEGORY_HE = {
  job: "חיפוש עבודה",
  finance: "כספים",
  social: "רשתות",
  newsletter: "דיוור",
  other: "אחר"
};

/** מקבל מערך מיילים ומחזיר אותם מסווגים + סיכומים */
function summarize(items = []) {
  const enriched = items.map((m) => ({ ...m, ...classify(m) }));
  const byCategory = {};
  const byField = {};
  for (const m of enriched) {
    byCategory[m.category] = (byCategory[m.category] || 0) + 1;
    if (m.jobRelated) byField[m.field] = (byField[m.field] || 0) + 1;
  }
  return {
    items: enriched,
    jobRelatedCount: enriched.filter((m) => m.jobRelated).length,
    byCategory,
    byField
  };
}

module.exports = { classify, summarize, CATEGORY_HE, FIELDS: FIELDS.map((f) => f[0]) };
