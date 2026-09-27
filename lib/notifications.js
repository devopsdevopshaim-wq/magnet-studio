// lib/notifications.js — התראות פר-חשבון (מייל חדש/אירוע יומן קרוב/הערה). נוצרות ע"י לולאת
// הסנכרון ברקע (server.js), נקראות ע"י הלקוח בכל טעינת עמוד. source_key ייחודי-per-account
// מונע יצירת אותה התראה פעמיים (ON CONFLICT DO NOTHING).

const db = require("./db");

async function create(accountId, { type, title, body, sourceKey }) {
  await db.query(
    `INSERT INTO notifications (account_id, type, title, body, source_key)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, source_key) DO NOTHING`,
    [accountId, type, title, body || null, sourceKey]
  );
}

async function listRecent(accountId, { limit = 30 } = {}) {
  const r = await db.query(
    `SELECT id, type, title, body, read_at, created_at FROM notifications
     WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [accountId, limit]
  );
  return r.rows;
}

async function unreadCount(accountId) {
  const r = await db.query(
    `SELECT count(*) FROM notifications WHERE account_id = $1 AND read_at IS NULL`,
    [accountId]
  );
  return Number(r.rows[0].count);
}

async function markRead(accountId, id) {
  await db.query(`UPDATE notifications SET read_at = now() WHERE account_id = $1 AND id = $2 AND read_at IS NULL`, [accountId, id]);
  return { ok: true };
}

async function markAllRead(accountId) {
  await db.query(`UPDATE notifications SET read_at = now() WHERE account_id = $1 AND read_at IS NULL`, [accountId]);
  return { ok: true };
}

module.exports = { create, listRecent, unreadCount, markRead, markAllRead };
