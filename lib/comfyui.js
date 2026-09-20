// lib/comfyui.js — חיבור ל-ComfyUI מקומי (http://127.0.0.1:8188 כברירת מחדל) להפקת תמונה/וידאו
// דרך המודלים המותקנים אצלכם. בניגוד ל-Seedance/HunyuanVideo (API בענן), כאן זה תלוי לגמרי
// בתהליך העבודה (workflow) שאתם בונים בעצמכם ב-ComfyUI — אין "וידאו AI" גנרי, יש מה שהתקנתם.
//
// איך זה עובד:
//   1. בונים תהליך עבודה ב-ComfyUI (txt2img, AnimateDiff, SVD, WAN — מה שיש לכם מותקן)
//   2. בתיבת הטקסט (CLIPTextEncode) של הפרומפט, כותבים בדיוק %%PROMPT%% במקום טקסט קבוע
//   3. בתפריט ComfyUI: Workflow → Export (API Format) → שומר JSON
//   4. מדביקים את ה-JSON כאן. בכל הפקה, %%PROMPT%% מוחלף בפרומפט האמיתי של הפרויקט ונשלח ל-ComfyUI.
//
// עובד רק כשהאתר עצמו רץ על אותו מחשב כמו ComfyUI (כרגע — localhost). כדי שזה יעבוד גם מהטלפון/הענן,
// ComfyUI צריך להיות נגיש מהאינטרנט (טאנל כמו Tailscale/Cloudflare Tunnel), בדיוק כמו Ollama.

const fs = require("fs");
const path = require("path");

function fileFor(baseDir) { return path.join(baseDir, "comfyui-config.json"); }
function readConfig(baseDir) {
  try { return JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8")) || {}; } catch { return {}; }
}
function writeConfig(baseDir, cfg) {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(fileFor(baseDir), JSON.stringify(cfg, null, 2));
}

function baseUrlFor(baseDir) {
  const cfg = readConfig(baseDir);
  return (cfg.baseUrl || "http://127.0.0.1:8188").replace(/\/$/, "");
}

function saveConfig(baseDir, { baseUrl, workflowTemplate } = {}) {
  const cfg = readConfig(baseDir);
  if (baseUrl !== undefined) cfg.baseUrl = String(baseUrl || "").trim() || "http://127.0.0.1:8188";
  if (workflowTemplate !== undefined) cfg.workflowTemplate = String(workflowTemplate || "");
  writeConfig(baseDir, cfg);
  return status(baseDir);
}

async function reachable(baseDir) {
  try {
    const r = await fetch(`${baseUrlFor(baseDir)}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

async function status(baseDir) {
  const cfg = readConfig(baseDir);
  const hasTemplate = !!(cfg.workflowTemplate && cfg.workflowTemplate.trim());
  let templateValid = null;
  if (hasTemplate) {
    try { JSON.parse(cfg.workflowTemplate); templateValid = true; } catch { templateValid = false; }
  }
  return {
    baseUrl: baseUrlFor(baseDir),
    reachable: await reachable(baseDir),
    hasTemplate, templateValid,
    hasPlaceholder: hasTemplate && cfg.workflowTemplate.includes("%%PROMPT%%")
  };
}

const jobs = new Map(); // projectId -> {status,pct,phase,file,error}
function jobState(id) { return jobs.get(id) || null; }

function buildPrompt(project, opts = {}) {
  if (opts.prompt) return String(opts.prompt).slice(0, 2000);
  const p = project.package || {};
  const b = project.brief || {};
  const parts = [];
  if (p.concept) parts.push(p.concept);
  if (!parts.length && b.text) parts.push(b.text);
  if (!parts.length && b.title) parts.push(b.title);
  return parts.filter(Boolean).join(". ").slice(0, 2000) || "cinematic shot";
}

async function submit(aiaDir, baseDir, project, opts = {}) {
  const cfg = readConfig(baseDir);
  if (!cfg.workflowTemplate) throw new Error("לא הוגדר תהליך עבודה (workflow) — יש להדביק JSON תחילה");
  if (!cfg.workflowTemplate.includes("%%PROMPT%%")) throw new Error("בתהליך העבודה חסר המקום-שומר %%PROMPT%% — ראו הוראות");

  const prompt = buildPrompt(project, opts);
  let workflow;
  try {
    const filled = cfg.workflowTemplate.split("%%PROMPT%%").join(prompt.replace(/"/g, '\\"').replace(/\n/g, " "));
    workflow = JSON.parse(filled);
  } catch (e) { throw new Error("תהליך העבודה אינו JSON תקין אחרי הזרקת הפרומפט: " + e.message); }

  const base = baseUrlFor(baseDir);
  const job = { status: "running", pct: 5, phase: "שולח ל-ComfyUI", file: null, error: null };
  jobs.set(project.id, job);

  (async () => {
    try {
      const clientId = "pnks-" + project.id;
      const submitRes = await fetch(`${base}/prompt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId })
      });
      const sj = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) throw new Error(sj.error?.message || sj.error || `ComfyUI החזיר ${submitRes.status}`);
      const promptId = sj.prompt_id;
      if (!promptId) throw new Error("ComfyUI לא החזיר prompt_id");

      job.phase = "ComfyUI מייצר"; job.pct = 15;
      const started = Date.now();
      let outputs = null;
      while (Date.now() - started < 15 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 3000));
        const hist = await fetch(`${base}/history/${promptId}`).then((r) => r.json()).catch(() => ({}));
        const entry = hist[promptId];
        if (entry && entry.status && entry.status.completed) { outputs = entry.outputs; break; }
        if (entry && entry.status && entry.status.status_str === "error") throw new Error("ComfyUI נכשל בהפקה");
        try {
          const q = await fetch(`${base}/queue`).then((r) => r.json());
          const stillRunning = (q.queue_running || []).some((it) => it[1] === promptId);
          const pos = (q.queue_pending || []).findIndex((it) => it[1] === promptId);
          if (pos >= 0) job.phase = `בתור ב-ComfyUI (מקום ${pos + 1})`;
          else if (stillRunning) job.phase = "מייצר עכשיו";
        } catch { /* לא קריטי */ }
        job.pct = Math.min(85, job.pct + 3);
      }
      if (!outputs) throw new Error("תם הזמן הקצוב — ComfyUI לא סיים בזמן");

      // מחפשים תוצר: images (תמונה/SaveImage) או gifs/videos (צמתי וידאו נפוצים כמו VHS_VideoCombine)
      let found = null;
      for (const nodeOut of Object.values(outputs)) {
        found = (nodeOut.videos && nodeOut.videos[0]) || (nodeOut.gifs && nodeOut.gifs[0]) || (nodeOut.images && nodeOut.images[0]);
        if (found) break;
      }
      if (!found) throw new Error("ComfyUI סיים אך לא נמצא קובץ פלט (תמונה/וידאו) בתוצאה");

      job.phase = "מוריד קובץ"; job.pct = 92;
      const q = new URLSearchParams({ filename: found.filename, subfolder: found.subfolder || "", type: found.type || "output" });
      const fileRes = await fetch(`${base}/view?${q.toString()}`);
      if (!fileRes.ok) throw new Error("הורדת התוצר מ-ComfyUI נכשלה");
      const buf = Buffer.from(await fileRes.arrayBuffer());
      const ext = (found.filename.split(".").pop() || "png").toLowerCase();
      const outDir = path.join(aiaDir, "renders");
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `${project.id}.${ext}`);
      fs.writeFileSync(outPath, buf);

      job.status = "done"; job.pct = 100; job.phase = "מוכן";
      job.file = `/api/aia/comfyui/file/${project.id}.${ext}`;
      job.ext = ext;
    } catch (e) {
      job.status = "error"; job.error = e.message;
    }
  })();

  return job;
}

function filePath(aiaDir, filename) {
  if (!/^[\w.-]+$/.test(filename)) throw new Error("שם קובץ לא חוקי");
  const p = path.join(aiaDir, "renders", filename);
  if (!p.startsWith(path.join(aiaDir, "renders") + path.sep)) throw new Error("נתיב לא חוקי");
  return p;
}

module.exports = { saveConfig, status, submit, jobState, filePath };
