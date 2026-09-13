// lib/profile.js — פרופיל נייד: שם התצוגה ופרטים שמתאימים את המערכת למחשב/משתמש.
// נשמר ב-data/profile.json ונמחק בעת אריזה להתקנה — כל מחשב מגדיר את שלו.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { PERSIST_DIR } = require("./paths");

const FILE = path.join(PERSIST_DIR, "profile.json");

const DEFAULTS = {
  displayName: "חיים קריספין",
  firstName: "חיים",
  city: "",
  configuredFor: null // hostname שהוגדר עבורו
};

function read() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, "utf8")) || {}; } catch { /* ברירת מחדל */ }
  const p = { ...DEFAULTS, ...saved };
  if (!p.firstName && p.displayName) p.firstName = p.displayName.trim().split(/\s+/)[0];
  p.hostname = os.hostname();
  p.needsSetup = !saved.displayName || (saved.configuredFor && saved.configuredFor !== p.hostname);
  return p;
}

function write(patch) {
  const cur = read();
  const next = {
    displayName: (patch.displayName || cur.displayName || DEFAULTS.displayName).trim().slice(0, 60),
    firstName: (patch.firstName || "").trim().slice(0, 30) || (patch.displayName || cur.displayName).trim().split(/\s+/)[0],
    city: (patch.city ?? cur.city ?? "").trim().slice(0, 40),
    configuredFor: os.hostname()
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return read();
}

module.exports = { read, write };
