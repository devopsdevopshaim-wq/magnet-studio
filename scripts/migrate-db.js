// scripts/migrate-db.js — מריץ את db/schema.sql מול DATABASE_URL. אידמפוטנטי (CREATE ... IF NOT
// EXISTS בלבד) — בטוח להריץ שוב ושוב, גם על מסד שכבר מוגדר. אין כאן מנגנון migrations מתוחכם
// (מספור/היסטוריה) בכוונה — היקף הפרויקט עדיין קטן מספיק ששינוי סכימה = עדכון schema.sql + הרצה חוזרת.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("חסר DATABASE_URL (ב-.env מקומי, או במשתני הסביבה של Render).");
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log("✓ הסכימה הופעלה בהצלחה.");
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    console.log("טבלאות במסד:", tables.rows.map((r) => r.table_name).join(", "));
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error("✗ המיגרציה נכשלה:", err.message); process.exit(1); });
