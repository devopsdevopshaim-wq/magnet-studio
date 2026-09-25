// lib/devopsWizard.js — "אשף AI" של DevOps Hub: שיחה עם צ'אט AI (n8n Cloud) שמכירה את המצב
// האמיתי של המחשב (קונטיינרים, פרויקטים, n8n) ומגיעה בסוף לקובץ JSON מלא — למשל מפרט להקמת
// שרת, או אבחון תקלת תקשורת. משתמשת באותו jarvis.ask() כמו הצ'אט הרגיל, לא מנוע AI נפרד.

const devops = require("./devops");
const jarvis = require("./jarvisClient");

const SYSTEM_INSTRUCTIONS = `אתה יועץ DevOps מקצועי בתוך "DevOps Hub" של המערכת. המשתמש מתאר מה
הוא רוצה ליצור או איזו תקלה יש לו (למשל: הקמת שרת, תקלת תקשורת בין שירותים, הגדרת n8n חדש).

חוקי עבודה:
1. אתה רואה למטה תמונת מצב אמיתית של המחשב (קונטיינרים, פרויקטים, n8n) - תמיד תתייחס אליה
   בפועל, אל תמציא שירותים או פרויקטים שלא מופיעים שם.
2. אם חסר לך מידע קריטי כדי לבנות מפרט שימושי - שאל שאלת המשך אחת, קצרה וממוקדת (לא רשימה
   ארוכה של שאלות). המשתמש יענה ואתה תשאל את הבאה אם עדיין חסר.
3. ברגע שיש לך מספיק מידע - סיים עם בלוק JSON יחיד, מלא ומדויק, עטוף בדיוק כך:
   \`\`\`json
   { ... }
   \`\`\`
   ה-JSON חייב לכלול לפחות: "title" (כותרת קצרה), "summary" (תקציר של הבקשה/התקלה),
   "steps" (מערך צעדים מעשיים לביצוע, כל צעד עם "action" ו-"detail"), ו-"checks" (מערך בדיקות
   לאימות שהכל עובד). אפשר להוסיף שדות רלוונטיים נוספים (למשל "risks", "rollback").
   אחרי בלוק ה-JSON אל תוסיף עוד טקסט.
4. כל עוד לא הגעת ל-JSON סופי - אל תכתוב שום בלוק קוד, רק שאלת ההמשך בעברית פשוטה.`;

async function systemSnapshot(baseDir) {
  const [infra, projects, cfg] = await Promise.all([
    devops.infra().catch(() => ({})),
    devops.listProjects().catch(() => []),
    Promise.resolve(devops.readConfig())
  ]);
  const containers = (infra.containers || []).map((c) => `${c.name} (${c.state}${c.ports ? ", " + c.ports : ""})`);
  const services = (infra.services || []).map((s) => `${s.name}: ${s.up ? "פעיל" : "כבוי"}`);
  const projLines = projects.map((p) => `${p.name} [${p.type}${p.self ? ", זהו השרת הזה" : ""}] - ${p.running ? "פעיל" : "כבוי"}`);
  return [
    `Docker זמין: ${infra.docker ? "כן" : "לא"}`,
    `שירותי ליבה: ${services.join(" · ") || "אין נתונים"}`,
    `קונטיינרים (${containers.length}): ${containers.slice(0, 25).join(" · ") || "אין"}`,
    `פרויקטים מנוהלים: ${projLines.join(" · ") || "אין"}`,
    `n8n: ${cfg.n8n.base}${cfg.n8n.apiKey ? " (מחובר)" : " (ללא מפתח API)"}`,
    infra.system ? `משאבי מערכת: זיכרון ${infra.system.memory?.percent ?? "?"}%, דיסק ${infra.system.disk?.percent ?? "?"}%, מעבד ${infra.system.cpuPercent ?? "?"}%` : ""
  ].filter(Boolean).join("\n");
}

function extractJson(text) {
  const m = /```json\s*([\s\S]*?)```/i.exec(text || "");
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// messages: [{role:"user"|"assistant", text}], החדשה האחרונה היא של המשתמש
async function ask(baseDir, messages, sessionId) {
  const snapshot = await systemSnapshot(baseDir);
  const convo = (messages || []).map((m) => `${m.role === "user" ? "משתמש" : "יועץ"}: ${m.text}`).join("\n");
  const prompt = `${SYSTEM_INSTRUCTIONS}\n\n[תמונת מצב נוכחית של המחשב]\n${snapshot}\n\n[השיחה עד כה]\n${convo}\n\nיועץ:`;

  const r = await jarvis.ask(prompt, sessionId || `devops-wizard-${Date.now()}`, { timeout: 90000 });
  if (!r.ok) return { ok: false, error: r.hint || "לא הצלחתי להגיע לצ'אט AI", detail: r.detail };

  const json = extractJson(r.reply);
  if (json) return { ok: true, done: true, json, raw: r.reply };
  return { ok: true, done: false, question: r.reply };
}

module.exports = { ask, systemSnapshot };
