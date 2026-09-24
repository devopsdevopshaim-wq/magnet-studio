// lib/housingLinks.js — קישורי חיפוש דיור ללוחות המובילים בישראל, לפי עיר/חדרים/סוג עסקה.
// אותה פילוסופיה כמו lib/jobBoards.js: אין scraping (חוסם ולא יציב) — רק בניית קישורים
// שנפתחים בלשונית. עובד תמיד, בכל מקום, בלי תלות בבסיס נתונים מקומי.

const BOARDS = [
  {
    key: "yad2", name: "יד2",
    url: ({ city, rooms, dealType }) => {
      const p = new URLSearchParams();
      if (city) p.set("city", city);
      if (rooms) p.set("rooms", `${rooms}-${rooms}`);
      const kind = dealType === "rent" ? "realestate/rent" : "realestate/forsale";
      return `https://www.yad2.co.il/${kind}?${p.toString()}`;
    }
  },
  {
    key: "madlan", name: "מדלן",
    url: ({ city, dealType }) => {
      const kind = dealType === "rent" ? "for-rent" : "for-sale";
      return `https://www.madlan.co.il/${city ? kind + "/" + encodeURIComponent(city) : kind}`;
    }
  },
  {
    key: "winwin", name: "WinWin",
    url: ({ city }) => `https://www.winwin.co.il/${city ? "רשימת-נכסים?city=" + encodeURIComponent(city) : ""}`
  },
  {
    key: "homeless", name: "Homeless",
    url: ({ city }) => `https://www.homeless.co.il/${city ? "?city=" + encodeURIComponent(city) : ""}`
  },
  {
    key: "onlyil", name: "Only",
    url: ({ city }) => `https://www.only.co.il/${city ? "search?q=" + encodeURIComponent(city) : ""}`
  },
  {
    key: "google", name: "חיפוש כללי",
    url: ({ city, rooms, dealType }) => {
      const q = [dealType === "rent" ? "דירה להשכרה" : "דירה למכירה", city, rooms ? `${rooms} חדרים` : ""].filter(Boolean).join(" ");
      return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    }
  }
];

function searchLinks({ city = "", rooms = "", dealType = "sale" } = {}) {
  const params = { city: String(city || "").trim(), rooms: String(rooms || "").trim(), dealType: dealType === "rent" ? "rent" : "sale" };
  return BOARDS.map((b) => ({ key: b.key, name: b.name, url: b.url(params) }));
}

const POPULAR_CITIES = ["תל אביב", "ירושלים", "חיפה", "רחובות", "ראשון לציון", "פתח תקווה", "באר שבע", "נתניה", "חולון", "אשדוד"];

module.exports = { searchLinks, POPULAR_CITIES, BOARDS: BOARDS.map((b) => ({ key: b.key, name: b.name })) };
