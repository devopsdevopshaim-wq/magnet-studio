// lib/remotionRender.js — גשר לרינדור וידאו דרך Remotion (React אמיתי, כרום אמיתי).
// למה זה קיים לצד aiaRender.js (מונטאז' FFmpeg): ffmpeg's drawtext לא תומך ב-BiDi, אז טקסט עברי
// שם נאלץ "להתהפך" תו-תו כדי להיראות נכון. כאן זה דפדפן אמיתי שמרנדר RTL כמו שצריך, ומאפשר
// אנימציות spring עשירות (כניסת כותרת, קו מבטא שנפרש וכו') שקשה מאוד לחקות ב-ffmpeg.
//
// כרום: לא מורידים עותק נוסף — נעזרים ב-Chromium שכבר מותקן דרך puppeteer (whatsapp-web.js).

const fs = require("fs");
const path = require("path");
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

const ENTRY = path.join(__dirname, "..", "remotion", "entry.jsx");
const COMPOSITION_ID = "MotionVideo";

let bundlePromise = null;
function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: ENTRY, onProgress: () => {} })
      .catch((e) => { bundlePromise = null; throw e; }); // כישלון — לנסות שוב בפעם הבאה, לא להישאר תקוע
  }
  return bundlePromise;
}

const jobs = new Map(); // projectId -> {status,pct,phase,file,error,durationSec}
function jobState(id) { return jobs.get(id) || null; }

// תמונת ייחוס → data URI מוטמע (נמנעים מבעיות טעינת file:// בכרום headless)
function imageToDataUri(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "jpeg" : ext;
    return `data:image/${mime};base64,${buf.toString("base64")}`;
  } catch { return null; }
}

async function render(aiaDir, project, opts = {}) {
  const id = project.id;
  const job = { status: "running", pct: 2, phase: "מכין רינדור (Remotion)", file: null, error: null };
  jobs.set(id, job);

  try {
    job.phase = "בונה את הסטודיו (פעם ראשונה זה לוקח כדקה)"; job.pct = 5;
    const serveUrl = await getBundle();

    const pkg = project.package || {};
    const brief = project.brief || {};
    const title = opts.titleText || pkg.title || brief.title || "";
    const subtitle = opts.subtitleText || brief.mood || "";
    const palette = (pkg.styleNotes && pkg.styleNotes.palette) || [];
    const assetDir = path.join(aiaDir, "assets", id);
    const images = (project.assets || [])
      .slice(0, 6)
      .map((a) => imageToDataUri(path.join(assetDir, a.name)))
      .filter(Boolean)
      .map((url) => ({ url }));

    const inputProps = {
      title, subtitle, palette, images,
      aspect: opts.aspect || brief.aspect || "16:9",
      durationSec: Number(opts.durationSec) || Number(pkg.durationSec) || Number(brief.duration) || 8
    };

    // בקונטיינר הענן (Dockerfile) יש כרום מערכת אחד שמשותף גם ל-whatsapp-web.js —
    // נמנעים מהורדת Chrome Headless Shell נוסף. מקומית (Windows/פיתוח) — לא מוגדר, Remotion מוריד לבד.
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;

    job.phase = "בודק הרכב וידאו"; job.pct = 15;
    const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps, browserExecutable });

    const outDir = path.join(aiaDir, "renders");
    fs.mkdirSync(outDir, { recursive: true });
    const outputLocation = path.join(outDir, `${id}.mp4`);

    job.phase = "מרנדר"; job.pct = 20;
    await renderMedia({
      composition, serveUrl, codec: "h264", outputLocation, inputProps, browserExecutable,
      onProgress: ({ progress }) => { job.pct = 20 + Math.round((progress || 0) * 78); }
    });

    job.status = "done"; job.pct = 100; job.phase = "מוכן";
    job.file = `/api/aia/render/${id}.mp4`;
    job.durationSec = Math.round(composition.durationInFrames / composition.fps);
    return job;
  } catch (e) {
    job.status = "error"; job.error = e.message;
    throw e;
  }
}

module.exports = { render, jobState };
