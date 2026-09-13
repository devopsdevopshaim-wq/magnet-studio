// lib/exerciseVideos.js — מאתר לכל תרגיל סרטון הדגמה אמיתי (בן אדם מדגים) ביוטיוב,
// ומשתמש בתמונה הממוזערת של הסרטון כתמונת התרגיל האמיתית (במקום איור סכמטי).

const { searchYouTube } = require("./youtubeSearch");

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // סרטוני הדרכה כמעט לא משתנים — cache ארוך
const cache = new Map(); // exerciseId -> { videoId, title, channel, thumb, at }

// מעדיפים סרטון קצר-בינוני (הדרכה ממוקדת, לא שיעור אימון שלם ארוך מדי)
function pickBest(items) {
  const withDur = items.filter((it) => it.duration && !it.isLive);
  const scored = withDur.map((it) => {
    const parts = it.duration.split(":").map(Number);
    const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + (parts[1] || 0);
    return { it, sec };
  });
  const sweet = scored.filter((s) => s.sec >= 30 && s.sec <= 480);
  const pool = sweet.length ? sweet : scored;
  pool.sort((a, b) => a.sec - b.sec);
  return (pool[0] || { it: items[0] }).it || null;
}

async function resolveExerciseVideo(exercise) {
  const cached = cache.get(exercise.id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;

  let result = { videoId: null, title: null, channel: null, thumb: null, at: Date.now() };
  try {
    const items = await searchYouTube(exercise.enQuery || exercise.name, 8);
    const best = pickBest(items);
    if (best) {
      result = {
        videoId: best.id,
        title: best.title,
        channel: best.channel,
        thumb: `https://i.ytimg.com/vi/${best.id}/hqdefault.jpg`,
        at: Date.now()
      };
    }
  } catch { /* נשאר null — הלקוח יציג את האיור הסכמטי כגיבוי */ }

  cache.set(exercise.id, result);
  return result;
}

module.exports = { resolveExerciseVideo };
