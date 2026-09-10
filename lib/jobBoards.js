// דרושים — קישורי חיפוש מהירים ללוחות הדרושים המובילים בישראל, לפי מילת חיפוש.
// אין scraping (הלוחות חוסמים ומבנה ה-URL משתנה) — רק בניית קישורי חיפוש שנפתחים בלשונית.

const BOARDS = [
  { key: "alljobs", name: "AllJobs", url: (q) => `https://www.alljobs.co.il/SearchResultsGuest.aspx?page=1&position=&type=&freetxt=${encodeURIComponent(q)}&city=&region=` },
  { key: "drushim", name: "דרושים", url: (q) => `https://www.drushim.co.il/jobs/search/${encodeURIComponent(q)}/` },
  { key: "jobmaster", name: "JobMaster", url: (q) => `https://www.jobmaster.co.il/jobs/?q=${encodeURIComponent(q)}` },
  { key: "linkedin", name: "LinkedIn", url: (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=Israel` },
  { key: "indeed", name: "Indeed", url: (q) => `https://il.indeed.com/jobs?q=${encodeURIComponent(q)}` },
  { key: "google", name: "Google Jobs", url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q + " דרושים")}&ibp=htl;jobs` }
];

// שם התחום (מ-emailClassify) -> מילות חיפוש
const FIELD_QUERY = {
  "DevOps / SRE": "DevOps SRE",
  "Cloud": "Cloud Engineer AWS Azure",
  "Data / BigData": "Data Engineer BigData",
  "פיתוח / Backend": "Backend Developer",
  "פיתוח / Frontend": "Frontend Developer React",
  "QA / בדיקות": "QA Automation",
  "ניהול מוצר / פרויקטים": "Product Manager",
  "עיצוב / UX": "UX UI Designer",
  "IT / תמיכה": "IT Support System Administrator",
  "אבטחת מידע": "Cyber Security",
  "מכירות / שיווק": "Sales Marketing",
  "כללי": "hi-tech"
};

function boardsFor(query) {
  return BOARDS.map((b) => ({ key: b.key, name: b.name, url: b.url(query) }));
}

function byField() {
  return Object.entries(FIELD_QUERY).map(([field, query]) => ({
    field,
    query,
    boards: boardsFor(query)
  }));
}

module.exports = { BOARDS: BOARDS.map((b) => ({ key: b.key, name: b.name })), FIELD_QUERY, boardsFor, byField };
