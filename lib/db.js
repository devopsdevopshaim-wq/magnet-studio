// lib/db.js — חיבור Postgres יחיד (pool) לכל האפליקציה, משתמש ב-DATABASE_URL.
const { Pool } = require("pg");

let pool = null;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL לא מוגדר — ראו .env מקומי או משתני הסביבה ב-Render.");
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on("error", (err) => console.error("Postgres pool error (חיבור לא פעיל שנפל ברקע):", err.message));
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, query };
