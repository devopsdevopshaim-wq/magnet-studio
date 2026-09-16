// lib/profile.js — פרופיל אישי: שם התצוגה ופרטים שמתאימים את המערכת למשתמש.
// baseDir מגיע מהקורא (server.js) — PERSIST_DIR לבעלים, או תיקיית המשתמש הפרטית לחשבון רשום.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { PERSIST_DIR } = require("./paths");

const DEFAULTS = {
  displayName: "",
  firstName: "",
  city: "",
  configuredFor: null // hostname שהוגדר עבורו
};

function fileFor(baseDir) { return path.join(baseDir || PERSIST_DIR, "profile.json"); }

function read(baseDir) {
  const FILE = fileFor(baseDir);
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, "utf8")) || {}; } catch { /* ברירת מחדל */ }
  const p = { ...DEFAULTS, ...saved };
  if (!p.firstName && p.displayName) p.firstName = p.displayName.trim().split(/\s+/)[0];
  p.hostname = os.hostname();
  p.needsSetup = !saved.displayName || (saved.configuredFor && saved.configuredFor !== p.hostname);
  return p;
}

function write(patch, baseDir) {
  const FILE = fileFor(baseDir);
  const cur = read(baseDir);
  const next = {
    displayName: (patch.displayName || cur.displayName || "").trim().slice(0, 60),
    firstName: (patch.firstName || "").trim().slice(0, 30) || (patch.displayName || cur.displayName || "").trim().split(/\s+/)[0],
    city: (patch.city ?? cur.city ?? "").trim().slice(0, 40),
    configuredFor: os.hostname()
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return read(baseDir);
}

module.exports = { read, write };
