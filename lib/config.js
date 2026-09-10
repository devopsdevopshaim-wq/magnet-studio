const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
const USER_CONFIG_FILE = path.join(DATA_DIR, "user-config.json");

function readUserConfig() {
  try {
    return JSON.parse(fs.readFileSync(USER_CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeUserConfig(partial) {
  const current = readUserConfig() || {};
  const next = {
    magnetRoot: current.magnetRoot || null,
    quickLaunchApps: current.quickLaunchApps || [],
    ...partial,
    setupCompletedAt: new Date().toISOString()
  };
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USER_CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

const userConfig = readUserConfig();
const IS_CONFIGURED = !!userConfig;

// שורש תיקיית העיצובים - מגיע ממסך ההתקנה (data/user-config.json). null = עדיין לא הוגדר במחשב הזה.
const MAGNET_ROOT = userConfig?.magnetRoot || null;
const EVENTS_DIR = MAGNET_ROOT ? path.join(MAGNET_ROOT, "אירועים") : null;
const PHOTOMATE_ROOT = MAGNET_ROOT ? path.join(MAGNET_ROOT, "PhotoMATE-1.0") : null;
const FRAMES_DIR = PHOTOMATE_ROOT ? path.join(PHOTOMATE_ROOT, "AdditionalMaterial", "Frame") : null;
const CLIPART_DIR = PHOTOMATE_ROOT ? path.join(PHOTOMATE_ROOT, "AdditionalMaterial", "Clipart") : null;
const READY_SUBDIR = "מגנטים-מוכנים";

// תוכנות הפעלה מהירה - נבחרות במסך ההתקנה מתוך התוכנות שהתגלו במחשב הזה
const APPS = {};
(userConfig?.quickLaunchApps || []).forEach((a) => {
  APPS[a.key] = a;
});

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"]);

// תיקיות שאסור לזהות כ"אירוע" למרות שהן נמצאות תחת שורש העיצובים
const NON_EVENT_FOLDERS = new Set(["PhotoMATE-1.0", "אירועים"]);

module.exports = {
  IS_CONFIGURED,
  MAGNET_ROOT,
  EVENTS_DIR,
  PHOTOMATE_ROOT,
  FRAMES_DIR,
  CLIPART_DIR,
  READY_SUBDIR,
  APPS,
  IMAGE_EXT,
  NON_EVENT_FOLDERS,
  PORT: process.env.PORT || 4420,
  DATA_DIR,
  readUserConfig,
  writeUserConfig
};
