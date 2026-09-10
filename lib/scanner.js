const fs = require("fs");
const path = require("path");
const {
  MAGNET_ROOT,
  EVENTS_DIR,
  FRAMES_DIR,
  CLIPART_DIR,
  READY_SUBDIR,
  IMAGE_EXT,
  NON_EVENT_FOLDERS
} = require("./config");

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isImage(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

/** סופר תמונות בתוך תיקייה (רמה אחת בלבד, לא רקורסיבי - מספיק למטרת תצוגה) */
function countImages(dirPath) {
  return listDir(dirPath).filter((e) => e.isFile() && isImage(e.name)).length;
}

/** סופר תמונות בתיקייה + תת-תיקיות ברמה אחת (למשל תיקיית "1" עם תמונות מהצלם) */
function countImagesDeep(dirPath) {
  const top = countImages(dirPath);
  const nested = listDir(dirPath).reduce((sum, sub) => {
    if (sub.isDirectory() && sub.name !== READY_SUBDIR) {
      return sum + countImages(path.join(dirPath, sub.name));
    }
    return sum;
  }, 0);
  return top + nested;
}

function folderLooksLikeProgram(dirPath) {
  const entries = listDir(dirPath);
  return entries.some((e) => e.isFile() && /\.(exe|dll)$/i.test(e.name));
}

function latestMTime(dirPath) {
  let latest = 0;
  for (const e of listDir(dirPath)) {
    try {
      const full = path.join(dirPath, e.name);
      const st = fs.statSync(full);
      const t = st.mtimeMs;
      if (t > latest) latest = t;
    } catch {
      /* skip unreadable entries */
    }
  }
  return latest;
}

/**
 * מאתר "אירועים": תיקיות עם תמונות, גם תחת אירועים\ וגם תיקיות אירוע ישירות בשורש.
 */
function scanEvents() {
  const events = [];

  for (const e of listDir(EVENTS_DIR)) {
    if (e.isDirectory()) {
      const full = path.join(EVENTS_DIR, e.name);
      if (folderLooksLikeProgram(full)) continue; // תיקיית תוכנה שהסתננה בטעות
      const imgCount = countImagesDeep(full);
      if (imgCount === 0) continue; // תיקייה ללא תמונות (למשל דרייברים של מדפסת)
      events.push({
        id: `events/${e.name}`,
        name: e.name,
        source: "אירועים",
        photoCount: imgCount,
        updatedAt: latestMTime(full)
      });
    }
  }

  // תמונות בודדות שיושבות ישירות תחת אירועים\ (לא בתוך תת-תיקייה)
  const looseImages = listDir(EVENTS_DIR).filter((e) => e.isFile() && isImage(e.name));
  if (looseImages.length) {
    events.push({
      id: "events/__loose__",
      name: "תמונות כלליות",
      source: "אירועים",
      photoCount: looseImages.length,
      updatedAt: latestMTime(EVENTS_DIR)
    });
  }

  for (const e of listDir(MAGNET_ROOT)) {
    if (e.isDirectory() && !NON_EVENT_FOLDERS.has(e.name)) {
      const full = path.join(MAGNET_ROOT, e.name);
      const imgCount = countImagesDeep(full);
      if (imgCount > 0) {
        events.push({
          id: `root/${e.name}`,
          name: e.name,
          source: "שורש",
          photoCount: imgCount,
          updatedAt: latestMTime(full)
        });
      }
    }
  }

  return events.sort((a, b) => b.updatedAt - a.updatedAt);
}

function resolveEventDir(eventId) {
  if (eventId === "events/__loose__") return EVENTS_DIR;
  if (eventId.startsWith("events/")) return path.join(EVENTS_DIR, eventId.slice("events/".length));
  if (eventId.startsWith("root/")) return path.join(MAGNET_ROOT, eventId.slice("root/".length));
  throw new Error("מזהה אירוע לא תקין");
}

/** מחזיר את קבצי התמונה של אירוע - כולל תיקיות משנה ברמה אחת (למשל תיקיית "1" עם תמונות מהצלם) */
function listEventFiles(eventId) {
  const dir = resolveEventDir(eventId);
  const files = [];

  // "תמונות כלליות" הוא פסאודו-אירוע לתמונות בודדות תחת אירועים\ בלבד - לא כולל תיקיות משנה
  // (שכן כל תת-תיקייה שם היא אירוע נפרד בפני עצמו)
  if (eventId === "events/__loose__") {
    for (const e of listDir(dir)) {
      if (e.isFile() && isImage(e.name)) files.push({ name: e.name, relPath: e.name });
    }
    return files;
  }

  for (const e of listDir(dir)) {
    if (e.isFile() && isImage(e.name)) {
      files.push({ name: e.name, relPath: e.name });
    } else if (e.isDirectory() && e.name !== READY_SUBDIR) {
      const sub = path.join(dir, e.name);
      for (const f of listDir(sub)) {
        if (f.isFile() && isImage(f.name)) {
          files.push({ name: f.name, relPath: path.join(e.name, f.name) });
        }
      }
    }
  }
  return files;
}

function listFrames() {
  return listDir(FRAMES_DIR)
    .filter((e) => e.isFile() && path.extname(e.name).toLowerCase() === ".png")
    .map((e) => e.name)
    .sort();
}

function listClipart() {
  return listDir(CLIPART_DIR)
    .filter((e) => e.isFile() && isImage(e.name))
    .map((e) => e.name)
    .sort();
}

/** סריקה מלאה - משמשת גם את לוח הבקרה וגם את ה-webhook של n8n */
function fullScan() {
  const events = scanEvents();
  return {
    scannedAt: new Date().toISOString(),
    root: MAGNET_ROOT,
    eventCount: events.length,
    totalPhotos: events.reduce((s, e) => s + e.photoCount, 0),
    frameCount: listFrames().length,
    clipartCount: listClipart().length,
    events
  };
}

module.exports = {
  scanEvents,
  resolveEventDir,
  listEventFiles,
  listFrames,
  listClipart,
  fullScan
};
