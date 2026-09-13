// lib/holidayStories.js — סיפורי החגים (טקסט קבוע, לא תלוי-API).

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "holiday-stories.json");

function list() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return j.stories || [];
  } catch { return []; }
}

module.exports = { list };
