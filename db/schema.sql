-- schema.sql — טבלאות ליבה למערכת רב-משתמשית (חשבונות, ניסיונות התחברות, מעקב שימוש).
-- הרצה: node scripts/migrate-db.js (אידמפוטנטי — בטוח להריץ שוב).
-- נתוני האפליקציה עצמם (חשבוניות, פרויקטי AIA וכו') נשארים בשלב זה בקבצי JSON פר-חשבון —
-- אלה יעברו ל-Postgres בשלב נפרד (שלב 4), אחרי שהחשבונות/ההתחברות כבר עובדים ונבדקו.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- ל-gen_random_uuid()

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  account_status TEXT NOT NULL DEFAULT 'active', -- active | suspended | trial
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  success BOOLEAN NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts (email, occurred_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tab TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_account_time ON usage_events (account_id, occurred_at DESC);
