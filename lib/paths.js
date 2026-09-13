// lib/paths.js — נתיבי אחסון משותפים.
// PERSIST_DIR מיועד לדיסק קבוע מחובר (render.yaml disk.mountPath) — כל מה שהמשתמש
// יוצר/שומר דרך האתר (מפתחות API, נתוני עסק, פרויקטי AIA, פרופיל) חי כאן כדי לשרוד redeploy.
// תוכן קבוע שמגיע עם הקוד (תרגילים, ערוצי טלוויזיה, סיפורי חגים...) נשאר ישירות תחת data/ הרגיל.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const PERSIST_DIR = path.join(DATA_DIR, "persist");

fs.mkdirSync(PERSIST_DIR, { recursive: true });

module.exports = { DATA_DIR, PERSIST_DIR };
