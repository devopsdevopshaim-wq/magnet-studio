// lib/users.js — חשבונות משתמשים: כל אחד שנרשם מקבל תיקיית נתונים פרטית משלו
// (data/persist/users/<id>/...), נפרדת לגמרי מנתוני הבעלים (חיים) שנשארים ב-PERSIST_DIR הרגיל
// כדי לא לדרוש הגירה. סיסמה מגובבת (scrypt) + salt, לעולם לא בטקסט גלוי.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PERSIST_DIR } = require("./paths");

const FILE = path.join(PERSIST_DIR, "users.json");
const USERS_DIR = path.join(PERSIST_DIR, "users");

function readAll() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")) || []; } catch { return []; }
}
function writeAll(list) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(pw, salt, wantHash) {
  const { hash } = hashPassword(pw, salt);
  try { return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(wantHash)); } catch { return false; }
}

function slugify(name) {
  return String(name || "").trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "user";
}

function register(name, password) {
  name = String(name || "").trim();
  password = String(password || "");
  if (name.length < 2) throw new Error("שם קצר מדי — לפחות 2 תווים");
  if (password.length < 4) throw new Error("סיסמה קצרה מדי — לפחות 4 תווים");
  if (name.toLowerCase() === "owner") throw new Error("השם הזה שמור — בחר שם אחר");
  const users = readAll();
  if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) throw new Error("השם הזה כבר תפוס — בחר שם אחר");
  let id = slugify(name);
  if (users.some((u) => u.id === id)) id = id + "-" + crypto.randomBytes(3).toString("hex");
  const { salt, hash } = hashPassword(password);
  const user = { id, name, salt, hash, createdAt: new Date().toISOString() };
  users.push(user);
  writeAll(users);
  fs.mkdirSync(path.join(USERS_DIR, id), { recursive: true });
  return { id, name };
}

function login(name, password) {
  name = String(name || "").trim();
  const users = readAll();
  const u = users.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!u) return null;
  if (!verifyPassword(password, u.salt, u.hash)) return null;
  return { id: u.id, name: u.name };
}

function getUser(id) {
  const u = readAll().find((x) => x.id === id);
  return u ? { id: u.id, name: u.name } : null;
}

function listUsers() {
  return readAll().map((u) => ({ id: u.id, name: u.name, createdAt: u.createdAt }));
}

// תיקיית הנתונים הפרטית של משתמש רשום — data/persist/users/<id>/...
function userDir(id) {
  const dir = path.join(USERS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { register, login, getUser, listUsers, userDir };
