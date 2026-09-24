// lib/graphologyEngine.js — עטיפה דקה סביב מנוע הגרפולוגיה (lib/graphology/*.js, מנוע דטרמיניסטי
// טהור — הועתק מ-graphology-system/web/engine, בלי n8n/Postgres/Docker). שמירת דוחות פר-חשבון.
//
// הערה מדעית חשובה (מוצגת גם למשתמש בדו"ח עצמו): גרפולוגיה אינה שיטה מדעית מאומתת.
// המערכת מוצגת ככלי להרהור עצמי ובידור, על בסיס הספרות הגרפולוגית המסורתית — לא כאבחון.

const fs = require("fs");
const path = require("path");
const { analyze, validateAnswers, PARAMETERS, DIMENSIONS, PARAM_GROUPS } = require("./graphology/analyze");

function questionnaireSchema(lang = "he") {
  return {
    dimensions: DIMENSIONS.map((d) => ({ key: d.key, label: lang === "en" ? d.en : d.he })),
    groups: PARAM_GROUPS.map((g) => ({
      id: g.id, label: lang === "en" ? g.en : g.he, hint: lang === "en" ? g.hint.en : g.hint.he,
      params: g.params
    })),
    parameters: PARAMETERS.map((p) => ({
      id: p.id, label: lang === "en" ? p.en : p.he, help: lang === "en" ? p.help.en : p.help.he,
      options: p.options.map((o) => ({ id: o.id, label: lang === "en" ? o.en : o.he }))
    }))
  };
}

function runAnalysis(answers, lang = "he") {
  const errors = validateAnswers(answers || {});
  if (errors.length) throw new Error("תשובות לא תקינות: " + errors.join(", "));
  if (Object.keys(answers || {}).length < 4) throw new Error("צריך לפחות 4 תשובות");
  return analyze(answers, { lang });
}

// ---------- היסטוריה פר-חשבון ----------
function fileFor(baseDir) { return path.join(baseDir, "graphology-history.json"); }
function readHistory(baseDir) {
  try { return JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8")) || []; } catch { return []; }
}
function saveToHistory(baseDir, { subjectLabel, lang, answers, report }) {
  const list = readHistory(baseDir);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    subjectLabel: String(subjectLabel || "").slice(0, 120),
    lang, answers, report,
    createdAt: new Date().toISOString()
  };
  list.unshift(entry);
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(fileFor(baseDir), JSON.stringify(list.slice(0, 100), null, 2));
  return entry;
}
function listHistory(baseDir) {
  return readHistory(baseDir).map((e) => ({ id: e.id, subjectLabel: e.subjectLabel, createdAt: e.createdAt, headline: e.report?.headline || "" }));
}
function getHistoryEntry(baseDir, id) {
  return readHistory(baseDir).find((e) => e.id === id) || null;
}
function deleteHistoryEntry(baseDir, id) {
  const list = readHistory(baseDir).filter((e) => e.id !== id);
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(fileFor(baseDir), JSON.stringify(list, null, 2));
  return { ok: true };
}

module.exports = { questionnaireSchema, runAnalysis, saveToHistory, listHistory, getHistoryEntry, deleteHistoryEntry };
