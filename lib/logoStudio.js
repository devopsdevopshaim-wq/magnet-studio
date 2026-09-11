// lib/logoStudio.js — סטודיו לוגו: 6 קונספטים גיאומטריים מיידיים (SVG, וקטורי, מוכן להורדה)
// + רציונל מותג ופרומפטים מוכנים למחוללי תמונה (Midjourney/DALL·E/Ideogram) כשרוצים גרסה מאוירת.

const PALETTES = [
  { id: "brass", he: "ברונזה חמה (כמו המערכת)", colors: ["#1b1611", "#c69a63", "#f1e7d4"] },
  { id: "sage", he: "ירוק שלווה", colors: ["#1f2a20", "#8ba07c", "#eef2ea"] },
  { id: "navy", he: "כחול אמין", colors: ["#101826", "#3b6ea5", "#eef3f8"] },
  { id: "ember", he: "כתום נועז", colors: ["#1b1611", "#db8b42", "#fff3e6"] },
  { id: "mono", he: "שחור-לבן מינימלי", colors: ["#111111", "#111111", "#ffffff"] },
  { id: "rose", he: "בורדו עדין", colors: ["#241014", "#a4485a", "#fbeef0"] }
];

function pickPalette(brief) {
  if (Array.isArray(brief.colors) && brief.colors.length >= 2) {
    return { id: "custom", he: "מותאם אישית", colors: brief.colors.slice(0, 3) };
  }
  const want = String(brief.style || "").toLowerCase();
  const byKeyword = PALETTES.find((p) => want.includes(p.id));
  return byKeyword || PALETTES[Math.floor(Math.random() * PALETTES.length)];
}

function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AB";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function svgWrap(inner, bg) {
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">` +
    (bg ? `<rect width="200" height="200" fill="${bg}"/>` : "") + inner + `</svg>`;
}
const FONT = `font-family="'Frank Ruhl Libre','Georgia',serif"`;

// ---------- תבניות ----------
function tplHexBadge(init, pal) {
  const [bg, mid, fg] = pal.colors;
  return svgWrap(
    `<polygon points="100,14 173,57 173,143 100,186 27,143 27,57" fill="none" stroke="${mid}" stroke-width="4"/>` +
    `<polygon points="100,42 151,71 151,129 100,158 49,129 49,71" fill="${mid}" opacity="0.14"/>` +
    `<text x="100" y="118" ${FONT} font-size="58" font-weight="700" fill="${mid}" text-anchor="middle">${esc(init)}</text>`,
    bg
  );
}
function tplCircleRing(init, pal) {
  const [bg, mid, fg] = pal.colors;
  return svgWrap(
    `<circle cx="100" cy="100" r="82" fill="none" stroke="${mid}" stroke-width="5"/>` +
    `<circle cx="100" cy="100" r="62" fill="none" stroke="${mid}" stroke-width="1.5" opacity="0.5"/>` +
    `<text x="100" y="120" ${FONT} font-size="56" font-weight="700" fill="${mid}" text-anchor="middle">${esc(init)}</text>`,
    bg
  );
}
function tplDiamondMono(init, pal) {
  const [bg, mid, fg] = pal.colors;
  return svgWrap(
    `<rect x="45" y="45" width="110" height="110" fill="${mid}" transform="rotate(45 100 100)"/>` +
    `<text x="100" y="120" ${FONT} font-size="52" font-weight="700" fill="${bg}" text-anchor="middle">${esc(init)}</text>`,
    bg
  );
}
function tplArchWordmark(name, pal) {
  const [bg, mid] = pal.colors;
  const label = String(name || "").toUpperCase().slice(0, 16);
  return svgWrap(
    `<path d="M 30 130 A 70 70 0 0 1 170 130" fill="none" stroke="${mid}" stroke-width="3"/>` +
    `<text x="100" y="100" ${FONT} font-size="17" font-weight="600" letter-spacing="3" fill="${mid}" text-anchor="middle">${esc(label)}</text>` +
    `<circle cx="100" cy="150" r="4" fill="${mid}"/>`,
    bg
  );
}
function tplUnderlineMark(name, pal) {
  const [bg, mid] = pal.colors;
  const words = String(name || "").trim().split(/\s+/);
  const label = (words[0] || "Brand").slice(0, 12);
  return svgWrap(
    `<text x="100" y="105" ${FONT} font-size="30" font-weight="700" fill="${mid}" text-anchor="middle">${esc(label)}</text>` +
    `<line x1="45" y1="122" x2="155" y2="122" stroke="${mid}" stroke-width="3"/>` +
    `<line x1="70" y1="132" x2="130" y2="132" stroke="${mid}" stroke-width="1.5" opacity="0.6"/>`,
    bg
  );
}
function tplShield(init, pal) {
  const [bg, mid] = pal.colors;
  return svgWrap(
    `<path d="M100 20 L165 45 V105 C165 150 135 175 100 190 C65 175 35 150 35 105 V45 Z" fill="none" stroke="${mid}" stroke-width="4"/>` +
    `<path d="M100 38 L150 57 V104 C150 138 128 156 100 168 C72 156 50 138 50 104 V57 Z" fill="${mid}" opacity="0.12"/>` +
    `<text x="100" y="118" ${FONT} font-size="46" font-weight="700" fill="${mid}" text-anchor="middle">${esc(init)}</text>`,
    bg
  );
}

const TEMPLATES = [
  { id: "hex-badge", he: "תג משושה", build: (b, p) => tplHexBadge(initialsOf(b.name), p) },
  { id: "circle-ring", he: "טבעת עגולה", build: (b, p) => tplCircleRing(initialsOf(b.name), p) },
  { id: "diamond-mono", he: "מונוגרם יהלום", build: (b, p) => tplDiamondMono(initialsOf(b.name), p) },
  { id: "shield", he: "מגן", build: (b, p) => tplShield(initialsOf(b.name), p) },
  { id: "arch-wordmark", he: "קשת + שם", build: (b, p) => tplArchWordmark(b.name, p) },
  { id: "underline-mark", he: "שם עם קו", build: (b, p) => tplUnderlineMark(b.name, p) }
];

function externalPrompts(brief) {
  const base = `minimalist vector logo for "${brief.name}"${brief.industry ? `, a ${brief.industry} business` : ""}${brief.style ? `, ${brief.style} style` : ""}, flat design, clean geometric shapes, no gradients, white background`;
  return [
    { engine: "Midjourney / DALL·E — סמל בלבד", prompt: base + ", icon mark only, no text" },
    { engine: "Midjourney / DALL·E — לוגוטייפ", prompt: `wordmark logo typography for "${brief.name}", elegant custom lettering, flat vector, white background` },
    { engine: "Midjourney / DALL·E — לוגו משולב", prompt: base + `, combination mark with the word "${brief.name}" beneath the icon` }
  ];
}

async function generate(brief) {
  brief = brief || {};
  if (!brief.name) throw new Error("צריך שם עסק");
  const pal = pickPalette(brief);
  const marks = TEMPLATES.map((t) => ({ id: t.id, label: t.he, svg: t.build(brief, pal) }));

  let concept = null, source = null;
  try {
    const { askAI } = require("./dailyNarrative");
    const prompt =
      `אתה מעצב מותג. עסק בשם "${brief.name}"${brief.industry ? `, בתחום ${brief.industry}` : ""}` +
      `${brief.style ? `, בסגנון מבוקש: ${brief.style}` : ""}${brief.notes ? `. הערות: ${brief.notes}` : ""}.\n` +
      `כתוב בעברית, קצר (עד 90 מילים): רציונל למה השם/הסגנון עובד למותג הזה, ואיזו משתי הפלטות ` +
      `(${pal.he}, או פלטה חלופית) הכי מתאימה ולמה. בלי כותרות, בלי רשימות — פסקה זורמת אחת.`;
    const r = await askAI(prompt, { sessionTag: "logo" }).catch(() => null);
    if (r && r.text) { concept = r.text; source = r.source; }
  } catch { /* AI לא זמין — הקונספטים הגרפיים עדיין מוכנים */ }

  return {
    name: brief.name, palette: pal, marks,
    concept, source,
    externalPrompts: externalPrompts(brief),
    palettes: PALETTES
  };
}

module.exports = { generate, PALETTES };
