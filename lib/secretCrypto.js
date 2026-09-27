// lib/secretCrypto.js — הצפנה/פענוח משותפים לכל סוד פר-חשבון שצריך להישמר בדיסק (סיסמת IMAP,
// refresh token של Google Calendar וכו'). AES-256-GCM, מפתח נוצר פעם אחת ונשמר ב-PERSIST_DIR
// (אותו דיסק קבוע ששורד redeploy), נפרד לגמרי ממפתח החתימה של ה-session.
//
// keyName מבדיל בין מרחבי-סודות (למשל "email" ו-"calendar") כך שלכל אחד קובץ מפתח נפרד -
// דליפה/סיבוב של אחד לא חושפת את השני.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PERSIST_DIR } = require("./paths");

const keyCache = new Map();
function cryptoKey(keyName) {
  if (keyCache.has(keyName)) return keyCache.get(keyName);
  const file = path.join(PERSIST_DIR, `${keyName}-crypto-key.txt`);
  let key;
  try {
    const hex = fs.readFileSync(file, "utf8").trim();
    if (hex.length === 64) key = Buffer.from(hex, "hex");
  } catch { /* עדיין לא נוצר */ }
  if (!key) {
    key = crypto.randomBytes(32);
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
    fs.writeFileSync(file, key.toString("hex"));
  }
  keyCache.set(keyName, key);
  return key;
}

function encrypt(keyName, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cryptoKey(keyName), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}
function decrypt(keyName, packed) {
  const [ivHex, tagHex, dataHex] = String(packed || "").split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("נתון מוצפן פגום");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cryptoKey(keyName), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
