// lib/aiaRender.js — הפקת וידאו אמיתי (MP4) לפרויקט AIA, מקומית עם ffmpeg-static:
//   • montage: מונטאז' תמונות — התאמה מלאה בלי חיתוך (רקע מטושטש) + Ken Burns + מעברים + מוזיקה + כותרות
//   • animation: אנימציית motion-graphics אמיתית — רקע גרדיאנט נע, טיפוגרפיה קינטית, צורות וחלקיקים
// מוזיקת רקע: קבצים מובנים שנוצרים פעם אחת (סינתזה) או העלאה של המשתמש.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");

const AIA_DIR = path.join(__dirname, "..", "data", "aia");
const RENDER_DIR = path.join(AIA_DIR, "renders");
const WORK_DIR = path.join(AIA_DIR, "_work");
const BEDS_DIR = path.join(AIA_DIR, "beds");

const FONT = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
  .find((f) => { try { return fs.existsSync(f); } catch { return false; } });
const FONT_FF = FONT ? FONT.replace(/\\/g, "/").replace(/:/g, "\\:") : null;

const CANVAS = {
  "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080],
  "4:5": [1080, 1350], "21:9": [1920, 822], "4:3": [1440, 1080]
};

// ---------- מצב עבודה ----------
const jobs = new Map(); // id -> { status, pct, phase, file, error, images, durationSec }
function jobState(id) { return jobs.get(id) || null; }

function run(args, { onProgress, totalSec } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-hide_banner", "-y", ...args], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => {
      const s = d.toString();
      err = (err + s).slice(-24000);
      const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(s);
      if (m && onProgress && totalSec) {
        const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
        onProgress(Math.min(0.99, t / totalSec));
      }
    });
    p.on("error", reject);
    p.on("close", (c) => c === 0 ? resolve() : reject(new Error("ffmpeg (" + c + "): " + err.slice(-500))));
  });
}

const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%").replace(/\n/g, " ");
// drawtext לא עושה BiDi — הופכים סדר תווים לרצף עברי. משאיר לטינית/מספרים במקומם היחסי הגס.
function heDraw(s) {
  s = String(s || "").trim();
  if (!s) return s;
  const heavy = (s.match(/[\u0590-\u05FF]/g) || []).length;
  const latin = (s.match(/[A-Za-z0-9]/g) || []).length;
  if (heavy > 0 && latin === 0) return s.split("").reverse().join("");
  return s;
}

function drawtext(text, { size, y = "(h-text_h)/2", enable, alpha, box = true, color = "white" }) {
  if (!text || !FONT_FF) return null;
  const parts = [
    `fontfile='${FONT_FF}'`, `text='${esc(heDraw(text))}'`,
    `fontcolor=${color}`, `fontsize=${size}`,
    `x=(w-text_w)/2`, `y=${y}`
  ];
  if (box) parts.push(`box=1:boxcolor=black@0.4:boxborderw=${Math.round(size / 3)}`);
  if (enable) parts.push(`enable='${enable}'`);
  if (alpha) parts.push(`alpha='${alpha}'`);
  return "drawtext=" + parts.join(":");
}

// ---------- מוזיקת רקע מובנית (סינתזה חד-פעמית) ----------
const BEDS = [
  { id: "warm", he: "חמים ורגוע", freqs: "220*1.0 + 277.18*0.6 + 329.63*0.4", lfo: 0.06 },
  { id: "dream", he: "חלומי", freqs: "196*0.9 + 293.66*0.5 + 392*0.35 + 587.33*0.15", lfo: 0.04 },
  { id: "uplift", he: "אופטימי", freqs: "261.63*0.8 + 329.63*0.6 + 392*0.5 + 523.25*0.3", lfo: 0.12 },
  { id: "cinematic", he: "קולנועי", freqs: "110*1.0 + 164.81*0.5 + 220*0.4 + 329.63*0.2", lfo: 0.03 },
  { id: "energetic", he: "אנרגטי", freqs: "196*1.0 + 246.94*0.7 + 293.66*0.5 + 392*0.35", lfo: 0.22 },
  { id: "mysterious", he: "מסתורי", freqs: "87.31*1.0 + 110*0.5 + 146.83*0.3 + 233.08*0.12", lfo: 0.02 },
  { id: "gentle", he: "עדין (פסנתר)", freqs: "261.63*0.7 + 329.63*0.45 + 392*0.3 + 523.25*0.18", lfo: 0.05 }
];

async function ensureBed(id) {
  const bed = BEDS.find((b) => b.id === id);
  if (!bed) return null;
  fs.mkdirSync(BEDS_DIR, { recursive: true });
  const out = path.join(BEDS_DIR, `${id}.m4a`);
  if (fs.existsSync(out)) return out;
  // פאד סינתטי: סכום סינוסים + רעד עדין (tremolo) + reverb קל דרך aecho
  const expr = `0.16*(sin(2*PI*t*(${bed.freqs}))) * (0.85+0.15*sin(2*PI*t*${bed.lfo}))`;
  await run([
    "-f", "lavfi", "-i", `aevalsrc=${expr}:s=44100:d=90`,
    "-af", "aecho=0.8:0.7:120|200:0.35|0.22,lowpass=f=2600,highpass=f=90,volume=1.6,afade=t=in:d=2",
    "-c:a", "aac", "-b:a", "160k", out
  ]);
  return out;
}
function bedList() { return BEDS.map((b) => ({ id: b.id, he: b.he })); }

// מעברים נתמכים ע"י xfade של ffmpeg — נבחרים ידנית (רשימה מלאה יותר, אבל אלה נראים הכי טוב לתמונות)
const TRANSITIONS = ["fade", "wipeleft", "wiperight", "slideleft", "slideright", "circleopen", "circleclose", "dissolve", "pixelize", "radial"];
function transitionList() { return TRANSITIONS.map((id) => ({ id, he: TRANSITION_HE[id] || id })); }
const TRANSITION_HE = {
  fade: "עמעום (קלאסי)", wipeleft: "מחיקה שמאלה", wiperight: "מחיקה ימינה",
  slideleft: "החלקה שמאלה", slideright: "החלקה ימינה", circleopen: "פתיחת עיגול",
  circleclose: "סגירת עיגול", dissolve: "התמוססות", pixelize: "פיקסלים", radial: "רדיאלי"
};

// ---------- montage: מונטאז' תמונות ----------
async function renderMontage(project, opts = {}) {
  const id = project.id;
  const imgs = (project.assets || []).map((a) => path.join(AIA_DIR, "assets", id, a.name)).filter((f) => fs.existsSync(f));
  if (imgs.length < 2) throw new Error("צריך לפחות 2 תמונות ייחוס למונטאז'");

  const [W, H] = CANVAS[project.brief?.aspect] || CANVAS["16:9"];
  const per = Math.max(1.5, Math.min(8, Number(opts.secondsPerImage) || 3));
  const T = Math.min(0.8, per / 3);
  const kb = opts.kenBurns !== false;
  const fps = 30;
  const totalSec = imgs.length * per - (imgs.length - 1) * T;

  fs.mkdirSync(RENDER_DIR, { recursive: true });
  const work = path.join(WORK_DIR, id);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  const job = { status: "running", pct: 0, phase: "מכין קטעים", file: null, error: null, images: imgs.length, mode: "montage" };
  jobs.set(id, job);

  try {
    // שלב 1: כל תמונה → קליפ. התאמה מלאה בלי חיתוך: fg (contain) על bg מטושטש (cover).
    const clips = [];
    for (let i = 0; i < imgs.length; i++) {
      job.phase = `מעבד תמונה ${i + 1}/${imgs.length}`;
      job.pct = Math.round((i / imgs.length) * 45);
      const out = path.join(work, `c${String(i).padStart(3, "0")}.mp4`);
      const frames = Math.round(per * fps);
      const dir = i % 4;
      const zx = dir === 1 ? "iw-iw/zoom" : dir === 3 ? "0" : "iw/2-(iw/zoom/2)";
      const zy = dir === 0 ? "0" : dir === 2 ? "ih-ih/zoom" : "ih/2-(ih/zoom/2)";
      const kbf = kb
        ? `,zoompan=z='min(zoom+0.0013,1.16)':x='${zx}':y='${zy}':d=${frames}:s=${W}x${H}:fps=${fps}`
        : `,fps=${fps}`;
      const fc =
        `[0:v]split=2[bg][fg];` +
        `[bg]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
        `gblur=sigma=32,eq=brightness=-0.12:saturation=0.9,scale=${W}:${H}[bgb];` +
        `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];` +
        `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1[base];` +
        `[base]scale=${W * 2}:${H * 2}${kbf},format=yuv420p[v]`;
      await run([
        "-loop", "1", "-i", imgs[i],
        "-filter_complex", fc, "-map", "[v]",
        "-t", String(per), "-r", String(fps),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out
      ]);
      clips.push(out);
    }

    // שלב 2: crossfade
    job.phase = "מחבר מעברים"; job.pct = 50;
    const merged = path.join(work, "merged.mp4");
    const transition = TRANSITIONS.includes(opts.transition) ? opts.transition : "fade";
    if (clips.length === 1) fs.copyFileSync(clips[0], merged);
    else {
      const inputs = clips.flatMap((c) => ["-i", c]);
      let fc = "", last = "0:v", offset = per - T;
      for (let i = 1; i < clips.length; i++) {
        const lbl = i === clips.length - 1 ? "vout" : `x${i}`;
        fc += `[${last}][${i}:v]xfade=transition=${transition}:duration=${T}:offset=${offset.toFixed(3)}[${lbl}];`;
        last = lbl; offset += per - T;
      }
      await run([...inputs, "-filter_complex", fc.replace(/;$/, ""), "-map", "[vout]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", merged],
        { onProgress: (p) => { job.pct = 50 + Math.round(p * 25); }, totalSec });
    }

    await finalize(id, job, merged, { W, H, totalSec, opts, project });
    fs.rmSync(work, { recursive: true, force: true });
    return job;
  } catch (e) {
    job.status = "error"; job.error = e.message;
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    throw e;
  }
}

// ---------- animation: motion graphics אמיתי ----------
async function renderAnimation(project, opts = {}) {
  const id = project.id;
  const [W, H] = CANVAS[project.brief?.aspect] || CANVAS["16:9"];
  const D = Math.max(4, Math.min(20, Number(opts.durationSec) || Number(project.package?.durationSec) || 8));
  const fps = 30;
  const pal = (project.package?.styleNotes?.palette || []).filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c)).map((c) => c.replace("#", "0x"));
  const c0 = pal[0] || "0x1b1633", c1 = pal[1] || "0xdb8b42", c2 = pal[2] || "0x8ba07c", c3 = pal[3] || "0xf1e7d4";

  const title = opts.titleText || project.package?.title || project.brief?.title || "";
  const sub = opts.endText || (project.brief?.mood || "");

  fs.mkdirSync(RENDER_DIR, { recursive: true });
  const finalOut = path.join(RENDER_DIR, `${id}.mp4`);
  const job = { status: "running", pct: 5, phase: "מרנדר אנימציה", file: null, error: null, mode: "animation" };
  jobs.set(id, job);

  try {
    const tSize = Math.round(H / 12);
    const sSize = Math.round(H / 26);
    const lineY = Math.round(H / 2 + tSize * 1.4);
    const layers = [];
    // קו מבטא שנפרש
    layers.push(
      `drawbox=x='iw*0.13':y=${lineY}:w='iw*0.74*min(1,max(0,(t-0.5)/0.9))':h=4:color=${c1}@0.95:t=fill`
    );
    // כותרת: מחליקה מלמטה + fade-in + "נשימה" עדינה
    if (title && FONT_FF) {
      layers.push(
        `drawtext=fontfile='${FONT_FF}':text='${esc(heDraw(title))}':` +
        `fontcolor=white:fontsize='${tSize}+${Math.max(2, Math.round(tSize / 22))}*sin(t*1.5)':` +
        `x=(w-text_w)/2:y='h/2-text_h/2-40*max(0,1-t/0.9)':` +
        `alpha='min(1,t/0.7)':shadowcolor=black@0.55:shadowx=3:shadowy=4`
      );
    }
    // תת-כותרת / מצב רוח
    if (sub && FONT_FF) {
      layers.push(
        `drawtext=fontfile='${FONT_FF}':text='${esc(heDraw(sub))}':` +
        `fontcolor=0x${(pal[3] || "0xddc39a").replace("0x", "")}:fontsize=${sSize}:` +
        `x=(w-text_w)/2:y=${lineY + 24}:alpha='max(0,min(1,(t-1.0)/0.7))'`
      );
    }

    const fc = [
      `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:c2=${c2}:nb_colors=3:speed=0.03:type=spiral:d=${D}:r=${fps}[bg]`,
      `gradients=s=${W}x${H}:c0=0x000000@0:c1=0x000000@0.5:type=radial:speed=0.001:d=${D}:r=${fps}[vig]`,
      `[bg][vig]overlay,hue=h='16*sin(t/4)',format=yuv420p[base]`,
      `[base]${layers.join(",")},fade=t=in:d=0.4,fade=t=out:st=${(D - 0.5).toFixed(2)}:d=0.5[v]`
    ].join(";");

    // מוזיקה — הקלט לפני filter_complex
    const audio = await resolveAudio(id, opts);
    const args = [];
    if (audio) args.push("-stream_loop", "-1", "-i", audio);
    args.push("-filter_complex", fc, "-map", "[v]");
    if (audio) {
      args.push("-map", "0:a", "-t", String(D),
        "-af", `afade=t=in:d=1,afade=t=out:st=${(D - 2).toFixed(2)}:d=2`,
        "-c:a", "aac", "-b:a", "160k", "-shortest");
    } else {
      args.push("-t", String(D), "-an");
    }
    args.push("-r", String(fps), "-c:v", "libx264", "-preset", "medium", "-crf", "19",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", finalOut);

    await run(args, { onProgress: (p) => { job.pct = 5 + Math.round(p * 92); }, totalSec: D });

    job.status = "done"; job.pct = 100; job.phase = "מוכן";
    job.file = `/api/aia/render/${id}.mp4`; job.durationSec = Math.round(D);
    return job;
  } catch (e) {
    job.status = "error"; job.error = e.message;
    throw e;
  }
}

// ---------- שלב אחרון משותף: כותרות + מוזיקה ----------
async function resolveAudio(id, opts) {
  if (opts.audioPath && fs.existsSync(opts.audioPath)) return opts.audioPath;
  if (opts.bed && opts.bed !== "none") { try { return await ensureBed(opts.bed); } catch { return null; } }
  return null;
}

async function finalize(id, job, videoIn, { W, H, totalSec, opts, project }) {
  job.phase = "כותרות ומוזיקה"; job.pct = 80;
  const finalOut = path.join(RENDER_DIR, `${id}.mp4`);
  const fsz = Math.round(H / 16);
  const vf = [];
  const title = opts.titleText || project.package?.title || "";
  const endText = opts.endText || "";
  const t1 = drawtext(title, { size: fsz, enable: "between(t,0.4,3.4)", alpha: "if(lt(t,0.8),(t-0.4)/0.4,if(lt(t,3),1,(3.4-t)/0.4))" });
  if (t1) vf.push(t1);
  if (endText) {
    const s = (totalSec - 3).toFixed(2), e = (totalSec - 0.3).toFixed(2);
    const t2 = drawtext(endText, { size: fsz, enable: `between(t,${s},${e})`, alpha: `if(lt(t,${(+s + 0.4).toFixed(2)}),(t-${s})/0.4,1)` });
    if (t2) vf.push(t2);
  }

  const args = ["-i", videoIn];
  const audio = await resolveAudio(id, opts);
  if (audio) args.push("-stream_loop", "-1", "-i", audio);

  if (vf.length) args.push("-vf", vf.join(","), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p");
  else args.push("-c:v", "copy");

  if (audio) {
    args.push("-t", totalSec.toFixed(2), "-af", `afade=t=in:d=1.5,afade=t=out:st=${(totalSec - 2).toFixed(2)}:d=2`,
      "-c:a", "aac", "-b:a", "160k", "-map", "0:v", "-map", "1:a", "-shortest");
  } else args.push("-an");
  args.push("-movflags", "+faststart", finalOut);

  await run(args, { onProgress: (p) => { job.pct = 80 + Math.round(p * 18); }, totalSec });
  job.status = "done"; job.pct = 100; job.phase = "מוכן";
  job.file = `/api/aia/render/${id}.mp4`; job.durationSec = Math.round(totalSec);
}

// ---------- ניתוב ----------
async function render(project, opts = {}) {
  const mode = opts.mode || (["animation", "logo_reveal"].includes(project.brief?.type) ? "animation" : "montage");
  if (mode === "animation") return renderAnimation(project, opts);
  return renderMontage(project, opts);
}

function renderPath(id) {
  const p = path.join(RENDER_DIR, `${id}.mp4`);
  return fs.existsSync(p) ? p : null;
}

module.exports = { render, renderMontage, renderAnimation, jobState, renderPath, bedList, transitionList, hasFFmpeg: !!ffmpegPath };
