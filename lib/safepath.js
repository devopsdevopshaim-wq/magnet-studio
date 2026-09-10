const path = require("path");

/**
 * מוודא שנתיב שנבנה מקלט משתמש (שם תיקייה/קובץ) נשאר בתוך תיקיית השורש המותרת.
 * מונע Path Traversal (למשל "..\..\Windows\System32").
 */
function safeJoin(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error("נתיב לא חוקי");
  }
  return target;
}

module.exports = { safeJoin };
