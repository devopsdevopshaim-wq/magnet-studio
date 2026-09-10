// טקסט AI למענה היומי:
//  - narrate(digest): פתיח יומי חם ורב-פסקאות בעברית מעל הסיכום המובנה
//  - explain(kind, text): הסבר 1-2 משפטים בעברית פשוטה לפריט לימוד (משנה / תניא / הלכה)
// שני אלה משתמשים באותו fallback: (1) JARVIS ב-n8n Cloud, (2) Ollama מקומי, (3) ספק ענן עם מפתח.
// אם אף מקור לא זמין -> null, וה-daily.html מציג רק את המידע המובנה.

const jarvis = require("./jarvisClient");
const aiPanel = require("./aiPanel");

const NARRATIVE_HINT =
  "אתה צ'יף-אוף-סטאף אישי שכותב תדריך בוקר תמציתי ומקצועי בעברית לחיים — יזם שמנהל עסק מגנטים, " +
  "מחפש עבודה בתחום ה-DevOps, ולומד יומי. הסגנון: ענייני, בהיר, מכובד — כמו מנכ\"ל שמדבר עם עצמו. " +
  "לא מתיילד, לא מזלזל, לא מטיף. משפטים קצרים, פועל פעיל, בלי סופרלטיבים ובלי קלישאות.\n" +
  "כתוב 3-4 פסקאות רצופות, בלי כותרות ובלי רשימות:\n" +
  "1) פתיחה לפי חלק היום והתאריך העברי, ומיד — שלוש המשימות שהכי חשוב לסגור היום (יומן, מגנטים לעיצוב, מיילי חיפוש עבודה). אם השבוע עמוס, אמור זאת ישירות.\n" +
  "2) הלימוד היומי במשפט-שניים ענייניים: נושא המשנה ומה מלמדת התניא/הקבלה של היום — כרעיון לחשוב עליו, לא כדרשה.\n" +
  "3) שורה על השמיים והמזל (מופע הירח, ההיבט האסטרולוגי הבולט אם יש) — כהערת אווירה קצרה, בלי לנבא.\n" +
  "4) שורת סיכום: מצב המחשב במילה, והמלצה מעשית אחת לניהול היום מתוך ההמלצות שנמסרו. אם ההגרלה בעוד יום-יומיים — אזכור עובדתי אחד עם המספרים החמים, בלי הבטחות.\n" +
  "אל תמציא נתונים שלא נמסרו. אל תשתמש במילים 'לסיכום', 'קחו', 'בהצלחה', 'יום מדהים'.";

const EXPLAIN_HINT =
  "הסבר בעברית פשוטה וברורה, במשפט אחד או שניים בלבד, על מה עוסק קטע הלימוד הבא ומה הרעיון המרכזי בו. " +
  "בלי ציטוט מחדש, בלי הקדמות, ישר לעניין.";

function narrativePrompt(digest) {
  return `${NARRATIVE_HINT}\n\n--- סיכום היום ---\n${digest}\n--- סוף הסיכום ---\n\nהפתיח היומי:`;
}

// ---------- fallback משותף ----------

async function askAI(prompt, { timeout = 60000, sessionTag = "daily", useJarvis = true } = {}) {
  // 1) JARVIS - רק כש-JARVIS מכוון ל-Cloud. אם הוא מכוון ל-n8n המקומי, ה-workflow שלו
  //    מושך בעצמו את /api/daily-brief -> קריאה מכאן (בתוך יצירת המענה היומי) תיצור מעגל.
  const jarvisCfg = jarvis.readConfig();
  if (useJarvis && jarvisCfg.target === "cloud") {
    try {
      const r = await jarvis.ask(prompt, `${sessionTag}-${new Date().toISOString().slice(0, 10)}`, { timeout });
      if (r.ok && r.reply && r.reply.trim()) return { text: r.reply.trim(), source: "JARVIS (n8n Cloud)" };
    } catch {
      /* המשך */
    }
  }
  // 2) Ollama
  try {
    const models = await aiPanel.listOllamaModels();
    if (models.length) {
      const preferred = ["gpt-oss:120b-cloud", "glm-5.2:cloud", "llama3.1:latest", "llama3.2:latest"];
      const model = preferred.find((m) => models.includes(m)) || models[0];
      const text = await aiPanel.queryOllama(model, prompt);
      if (text && text.trim()) return { text: text.trim(), source: `Ollama · ${model}` };
    }
  } catch {
    /* המשך */
  }
  // 3) ענן
  for (const s of aiPanel.CLOUD_SOURCES) {
    const apiKey = process.env[s.envVar];
    if (!apiKey) continue;
    try {
      const text = await s.ask(prompt, apiKey);
      if (text && text.trim()) return { text: text.trim(), source: s.label };
    } catch {
      /* ננסה את הספק הבא */
    }
  }
  return null;
}

/** @returns {Promise<{text:string, source:string}|null>} */
async function narrate(digest) {
  return askAI(narrativePrompt(digest), { timeout: 90000, sessionTag: "daily-brief" });
}

/** @returns {Promise<string|null>} הסבר קצר לפריט לימוד */
async function explain(kind, sourceText) {
  const prompt = `${EXPLAIN_HINT}\n\n(${kind} של היום)\n${sourceText}\n\nההסבר:`;
  const r = await askAI(prompt, { timeout: 45000, sessionTag: "learning-explain" });
  return r ? r.text : null;
}

module.exports = { narrate, explain, askAI };
