const fs = require("fs");
const path = require("path");
const { IS_CONFIGURED, APPS, readUserConfig, DATA_DIR } = require("./config");
const { getSystemStatus } = require("./systemStatus");

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function getRecommendations() {
  const items = [];
  const sys = await getSystemStatus();
  const cfg = readUserConfig() || {};

  if (sys.disk && sys.disk.percent >= 90) {
    items.push({ level: "warn", title: "מקום פנוי בדיסק נמוך", detail: `רק ${sys.disk.freeGB} GB פנויים (${sys.disk.percent}% בשימוש). כדאי לפנות מקום או לגבות תמונות ישנות.` });
  } else if (sys.disk && sys.disk.percent >= 80) {
    items.push({ level: "info", title: "מקום בדיסק מתמלא", detail: `${sys.disk.freeGB} GB פנויים בלבד. שווה לעקוב.` });
  }

  if (sys.memory.percent >= 90) {
    items.push({ level: "warn", title: "שימוש זיכרון גבוה", detail: `${sys.memory.percent}% מהזיכרון בשימוש. סגירת תוכנות לא בשימוש עשויה לשפר ביצועים.` });
  }

  if (!IS_CONFIGURED || !cfg.magnetRoot) {
    items.push({ level: "info", title: "לא הוגדרה תיקיית עיצובים", detail: "אפשר להגדיר תיקיית עיצובים במסך ההגדרות אם רוצים לנהל אירועים ומגנטים." });
  }

  if (!cfg.quickLaunchApps || cfg.quickLaunchApps.length === 0) {
    items.push({ level: "info", title: "אין תוכנות הפעלה מהירה מוגדרות", detail: "אפשר לבחור תוכנות להצמדה בלוח הבקרה דרך מסך ההגדרות." });
  }

  const emailStatus = readJsonSafe(path.join(DATA_DIR, "email-status.json"));
  if (!emailStatus) {
    items.push({ level: "info", title: "מצב מיילים לא מוגדר", detail: "חברו את Outlook או את הוורקפלואו של n8n כדי לראות מצב מיילים חי." });
  } else if (emailStatus.source === "manual") {
    items.push({ level: "info", title: "מצב מיילים לא מתעדכן אוטומטית", detail: "הנתונים המוצגים הם תמונת מצב חד-פעמית. הפעילו את סנכרון Outlook או את וורקפלואו n8n לעדכון חי." });
  }

  const calendarStatus = readJsonSafe(path.join(DATA_DIR, "calendar-status.json"));
  if (!calendarStatus || calendarStatus.source === "manual") {
    items.push({ level: "info", title: "יומן לא מסתנכרן אוטומטית", detail: "הפעילו את וורקפלואו היומן ב-n8n לעדכון אירועים חי." });
  }

  const outlookAutoscan = process.env.ENABLE_OUTLOOK_AUTOSCAN === "1";
  if (!outlookAutoscan) {
    items.push({ level: "info", title: "סריקת Outlook אוטומטית כבויה", detail: "אם הגדרתם חשבון ב-Outlook, אפשר להפעיל סריקה כל 5 דקות עם המשתנה ENABLE_OUTLOOK_AUTOSCAN=1." });
  }

  if (!items.length) {
    items.push({ level: "ok", title: "הכל תקין", detail: "לא נמצאו נקודות לשיפור כרגע." });
  }

  return items;
}

module.exports = { getRecommendations };
