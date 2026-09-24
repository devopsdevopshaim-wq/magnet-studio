// יוצר את אייקוני ה-PWA (PNG) בלי שום תלות חיצונית — מקודד PNG ידני עם zlib המובנה.
// הרצה:  node scripts/gen-icons.js
// פלט:   public/icons/icon-{192,512}.png, icon-maskable-512.png, apple-touch-180.png, favicon-64.png

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

// ----- CRC32 -----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ----- ציור -----
const palette = {
  bg: [27, 22, 17, 255], // #1b1611
  brass: [198, 154, 99, 255], // #c69a63
  ember: [219, 139, 66, 255], // #db8b42
  parchment: [231, 219, 194, 255]
};

function lerp(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    (a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * t
  ];
}
const COS30 = 0.8660254037844387;

// נקודה בתוך משושה מחודד-למעלה/למטה (צדדים אנכיים), מרוכז ב-(cx,cy), R = מרחק לקודקוד
function inHexagon(px, py, cx, cy, R) {
  const x = Math.abs(px - cx);
  const y = Math.abs(py - cy);
  if (x > COS30 * R) return false;
  if (y > R) return false;
  return y <= R - x * (0.5 / COS30);
}

// מונוגרם HKDELY: אות H בענבר זוהר בתוך משושה פנימי כהה (מסגרת), בתוך משושה חיצוני פליז.
function inH(px, py, cx, cy, hexInner) {
  const halfW = hexInner * COS30 * 0.62;
  const halfH = hexInner * 0.78;
  const barT = hexInner * 0.26; // עובי הקורות
  const x = px - cx, y = py - cy;
  if (Math.abs(y) > halfH) return false;
  const inLeftBar = x >= -halfW && x <= -halfW + barT;
  const inRightBar = x <= halfW && x >= halfW - barT;
  const inMidBar = Math.abs(y) <= barT / 2 && x >= -halfW && x <= halfW;
  return inLeftBar || inRightBar || inMidBar;
}

// צבע של נקודה בודדת (ללא אלפא-מיזוג — ההחלטה הסופית) — מחזיר [r,g,b,a] 0..255
function sampleColor(x, y, size, bleed) {
  const cx = size / 2;
  const cy = size / 2;
  const pad = bleed ? 0 : size * 0.11;
  const plateR = size / 2 - pad;
  const hexOuter = plateR * 0.88;
  const hexInner = plateR * 0.56;

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (inHexagon(x, y, cx, cy, hexInner)) {
    return inH(x, y, cx, cy, hexInner) ? palette.ember : [34, 26, 18, 255];
  }
  if (inHexagon(x, y, cx, cy, hexOuter)) return palette.brass;
  if (bleed) {
    const g = Math.min(1, dist / (size / 2));
    return lerp([38, 30, 22, 255], [21, 16, 12, 255], g);
  }
  if (dist <= plateR) {
    const g = Math.min(1, dist / plateR);
    return lerp([40, 32, 24, 255], [22, 17, 12, 255], g);
  }
  return [0, 0, 0, 0];
}

function drawIcon(size, { bleed = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling לקצוות חלקים
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sampleColor(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, bleed);
          const ca = c[3] ?? 255;
          r += c[0] * ca;
          g += c[1] * ca;
          b += c[2] * ca;
          a += ca;
        }
      }
      const i = (y * size + x) * 4;
      const n = SS * SS;
      rgba[i] = a > 0 ? Math.round(r / a) : 0;
      rgba[i + 1] = a > 0 ? Math.round(g / a) : 0;
      rgba[i + 2] = a > 0 ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, size, rgba);
}

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { bleed: true }],
  ["apple-touch-180.png", 180, { bleed: true }],
  ["favicon-64.png", 64, {}]
];

for (const [name, size, opts] of targets) {
  const png = drawIcon(size, opts);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`✓ ${name} (${size}px, ${png.length} bytes)`);
}
console.log("אייקונים נוצרו ב-public/icons/");
