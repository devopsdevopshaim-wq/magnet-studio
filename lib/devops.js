// lib/devops.js — מנוע ה-DevOps Hub:
//  • n8n: לוח בקרה ל-n8n Cloud (workflows, הרצות, הפעלה/כיבוי) — אותו חשבון שמשמש את צ'אט AI
//  • infra: מצב קונטיינרים, פורטים, בריאות שירותים, משאבי מערכת
//  • projects: הרצה/עצירה/לוגים של פרויקטים מקומיים (docker-compose או node)
//  • pipeline: צנרת CI פשוטה — git pull → install → build → test → restart, צעד-אחר-צעד
//
// אבטחה: פרויקטים מותרים רק מתחת ל-ALLOWED_ROOT; הפקודות מגיעות מקובץ התצורה או
// מזיהוי-אוטומטי — לעולם לא מפרמטרים של בקשה.

const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const DATA_DIR = path.join(__dirname, "..", "data");
const CFG_FILE = path.join(DATA_DIR, "devops-config.json");
const RUNTIME_FILE = path.join(DATA_DIR, "devops-runtime.json");
const ALLOWED_ROOT = path.resolve(__dirname, "..", ".."); // C:\Users\user\Desktop\AI Agent

const DEFAULT_CFG = {
  n8n: {
    base: require("./jarvisClient").DEFAULTS.base, // n8n Cloud — אותו חשבון שמשמש את צ'אט AI
    apiKey: "" // נוצר ב-n8n Cloud: Settings → n8n API → Create API key
  },
  roots: [ALLOWED_ROOT],
  // פרויקטים ידניים גוברים על הזיהוי-האוטומטי (לפי id)
  projects: []
};

// ---------- תצורה ----------

function readConfig() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CFG_FILE, "utf8")) || {}; } catch { /* ברירת מחדל */ }
  return {
    n8n: { ...DEFAULT_CFG.n8n, ...(saved.n8n || {}) },
    roots: Array.isArray(saved.roots) && saved.roots.length ? saved.roots : DEFAULT_CFG.roots,
    projects: Array.isArray(saved.projects) ? saved.projects : []
  };
}

function writeConfig(patch) {
  const cur = readConfig();
  const next = {
    n8n: { ...cur.n8n, ...(patch.n8n || {}) },
    roots: patch.roots || cur.roots,
    projects: patch.projects || cur.projects
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CFG_FILE, JSON.stringify(next, null, 2));
  return next;
}

// ---------- עזרי הרצה ----------

function run(cmd, args, { cwd, timeout = 60000, env } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: env || process.env }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: (stdout || "").toString(), stderr: (stderr || "").toString(), err });
    });
  });
}

function reachable(url, timeout = 3000) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const lib = url.startsWith("https") ? https : http;
      const req = lib.get(url, { timeout }, (res) => { res.resume(); fin(res.statusCode < 500); });
      req.on("timeout", () => { req.destroy(); fin(false); });
      req.on("error", () => fin(false));
    } catch { fin(false); }
  });
}

function httpJson(url, { method = "GET", headers = {}, body } = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(url);
    const req = lib.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { "Content-Type": "application/json", ...headers, ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
      timeout
    }, (res) => {
      let s = "";
      res.on("data", (c) => (s += c));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${s.slice(0, 200)}`));
        try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); }
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let dockerOk = null;
async function dockerAvailable() {
  if (dockerOk !== null) return dockerOk;
  const r = await run("docker", ["version", "--format", "{{.Server.Version}}"], { timeout: 8000 });
  dockerOk = r.ok && !!r.stdout.trim();
  return dockerOk;
}

// ---------- n8n (Cloud — אותו חשבון n8n Cloud שמשמש את צ'אט AI) ----------

function n8nHeaders() {
  const key = readConfig().n8n.apiKey;
  return key ? { "X-N8N-API-KEY": key } : {};
}

async function n8nStatus() {
  const cfg = readConfig().n8n;
  // בודקים את ה-API עם המפתח קודם — לא תלויים ב-/healthz שאולי לא נגיש דרך ה-edge של n8n Cloud.
  let apiOk = false, apiError = null;
  if (cfg.apiKey) {
    try { await httpJson(cfg.base + "/api/v1/workflows?limit=1", { headers: n8nHeaders() }); apiOk = true; }
    catch (e) { apiError = e.message; }
  }
  const up = apiOk || await reachable(cfg.base + "/healthz").catch(() => false) || await reachable(cfg.base);
  return { base: cfg.base, up: !!up, hasKey: !!cfg.apiKey, apiOk, apiError };
}

async function n8nWorkflows() {
  const cfg = readConfig().n8n;
  const j = await httpJson(cfg.base + "/api/v1/workflows?limit=100", { headers: n8nHeaders() });
  const items = (j.data || j || []).map((w) => ({
    id: w.id, name: w.name, active: !!w.active,
    updatedAt: w.updatedAt, nodes: (w.nodes || []).length,
    trigger: (w.nodes || []).map((n) => n.type).find((t) => /trigger|webhook|cron|schedule/i.test(t || "")) || null
  }));
  return items.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

async function n8nExecutions(limit = 25) {
  const cfg = readConfig().n8n;
  const j = await httpJson(cfg.base + `/api/v1/executions?limit=${limit}&includeData=false`, { headers: n8nHeaders() });
  return (j.data || []).map((e) => ({
    id: e.id, workflowId: e.workflowId,
    workflowName: e.workflowData?.name || (e.workflowId),
    status: e.status || (e.finished ? (e.stoppedAt ? "success" : "unknown") : "running"),
    mode: e.mode, startedAt: e.startedAt, stoppedAt: e.stoppedAt,
    ms: e.startedAt && e.stoppedAt ? new Date(e.stoppedAt) - new Date(e.startedAt) : null
  }));
}

async function n8nSetActive(id, active) {
  const cfg = readConfig().n8n;
  await httpJson(cfg.base + `/api/v1/workflows/${id}/${active ? "activate" : "deactivate"}`, { method: "POST", headers: n8nHeaders() });
  return { id, active };
}

// n8n Cloud (ה-API הציבורי) לא חושף הרצה ידנית של workflow - זה היה עובד רק מול n8n מקומי
// דרך ה-CLI בתוך הקונטיינר. הדרך להריץ עכשיו: לפתוח את ה-workflow בעורך (כפתור "פתח עורך")
// וללחוץ "Execute Workflow" שם, או להפעיל אותו דרך ה-Webhook/Trigger שלו.
async function n8nRun(id) {
  return {
    ok: false,
    error: "הרצה ידנית לא נתמכת דרך ה-API של n8n Cloud. פתחו את ה-workflow בעורך (\"פתח עורך ↗\") ולחצו \"Execute Workflow\", או הפעילו דרך ה-Webhook/Trigger שלו."
  };
}

// ---------- infra ----------

async function infra() {
  const out = { docker: false, containers: [], ports: [], services: [], system: null };

  if (await dockerAvailable()) {
    out.docker = true;
    const r = await run("docker", ["ps", "-a", "--format", "{{.Names}}|{{.State}}|{{.Status}}|{{.Ports}}|{{.Image}}"], { timeout: 10000 });
    if (r.ok) {
      out.containers = r.stdout.trim().split("\n").filter(Boolean).map((l) => {
        const [name, state, status, ports, image] = l.split("|");
        return { name, state, status, ports: (ports || "").replace(/0\.0\.0\.0:/g, ":"), image };
      }).sort((a, b) => (a.state === "running" ? -1 : 1) - (b.state === "running" ? -1 : 1) || a.name.localeCompare(b.name));
    }
  }

  const ctrRunning = (name) => (out.containers || []).some((c) => c.name === name && c.state === "running");
  const checks = [
    { name: "הפנקס (השרת הזה)", url: "http://localhost:4420/api/setup/status" },
    { name: "n8n Cloud", url: readConfig().n8n.base + "/healthz" },
    { name: "גרפולוגיה", url: "http://localhost:3737/" },
    { name: "DiraFinder DB", container: "dira-local-db" },
    { name: "Ollama", url: "http://localhost:11434/api/tags" }
  ];
  out.services = await Promise.all(checks.map(async (c) => {
    if (c.container) return { name: c.name, up: ctrRunning(c.container) };
    if (c.tcp) return { name: c.name, up: await tcpOpen(c.tcp) };
    return { name: c.name, up: await reachable(c.url, 2500) };
  }));

  try { out.system = await require("./systemStatus").getSystemStatus(); } catch { /* אופציונלי */ }
  return out;
}

function tcpOpen(port, host = "127.0.0.1", timeout = 2000) {
  return new Promise((resolve) => {
    const net = require("net");
    const sock = new net.Socket();
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(timeout);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
    sock.connect(port, host);
  });
}

// ---------- projects ----------

const running = new Map(); // id -> { proc, pid, cmd, startedAt, log: [] }
const LOG_MAX = 400;

function pushLog(id, line) {
  const r = running.get(id);
  if (!r) return;
  String(line).split(/\r?\n/).forEach((l) => { if (l.trim()) r.log.push({ t: Date.now(), l: l.slice(0, 500) }); });
  if (r.log.length > LOG_MAX) r.log.splice(0, r.log.length - LOG_MAX);
}

function detectProjects() {
  const cfg = readConfig();
  const found = [];
  for (const root of cfg.roots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".") || ent.name === "node_modules") continue;
      if (/^\d+(\.\d+)+$/.test(ent.name)) continue; // תיקיות ממוספרות (version dirs) — לא פרויקטים
      const dir = path.join(root, ent.name);
      const hasCompose = fs.existsSync(path.join(dir, "docker-compose.yml")) || fs.existsSync(path.join(dir, "docker-compose.yaml"));
      const pkgPath = path.join(dir, "package.json");
      const hasPkg = fs.existsSync(pkgPath);
      if (!hasCompose && !hasPkg) continue;

      // הפנקס עצמו — רץ כ-node (server.js), לא כ-compose, ולא ניתן להפעלה/עצירה מכאן
      if (ent.name === "magnet-studio") {
        found.push({ id: "magnet-studio", name: "הפנקס היומי (השרת הזה)", dir, type: "node", self: true, detected: true });
        continue;
      }

      let type = hasCompose ? "compose" : "node";
      let start, name = ent.name;
      if (hasCompose) {
        start = "docker compose up -d";
      } else {
        let scripts = {};
        try { scripts = (JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts) || {}; } catch {}
        const s = scripts.dev ? "dev" : scripts.start ? "start" : Object.keys(scripts)[0];
        start = s ? `npm run ${s}` : "npm start";
      }
      found.push({ id: ent.name, name, dir, type, start, detected: true });
    }
  }
  // מיזוג עם ידניים
  const byId = new Map(found.map((p) => [p.id, p]));
  for (const p of cfg.projects) {
    if (!p.id || !p.dir) continue;
    const resolved = path.resolve(p.dir);
    if (resolved !== ALLOWED_ROOT && !resolved.startsWith(ALLOWED_ROOT + path.sep)) continue; // מחוץ לשורש המותר
    byId.set(p.id, { ...(byId.get(p.id) || {}), ...p, dir: resolved, detected: false });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function guardDir(dir) {
  const r = path.resolve(dir);
  if (r !== ALLOWED_ROOT && !r.startsWith(ALLOWED_ROOT + path.sep)) throw new Error("נתיב פרויקט מחוץ לתחום המותר");
  if (!fs.existsSync(r)) throw new Error("תיקיית הפרויקט לא קיימת");
  return r;
}

async function projectState(p) {
  if (p.self) return { ...p, running: true, self: true, pid: process.pid, startedAt: null };
  const live = running.get(p.id);
  let up = !!live, containers = null;
  if (p.type === "compose") {
    if (await dockerAvailable()) {
      // ps של הפרויקט הספציפי (לפי cwd) — לא רשימה גלובלית
      const r = await run("docker", ["compose", "ps", "--format", "json", "-a"], { cwd: p.dir, timeout: 10000 });
      try {
        const lines = r.stdout.trim().split("\n").filter(Boolean);
        const arr = lines.map((l) => JSON.parse(l));
        containers = arr.length;
        up = arr.some((x) => /run|up/i.test(x.State || x.Status || ""));
      } catch { up = false; }
    }
  } else if (p.port) {
    up = up || await tcpOpen(p.port);
  }
  return {
    ...p,
    running: up,
    containers,
    pid: live?.pid || null,
    startedAt: live?.startedAt || null,
    logLines: live ? live.log.length : 0
  };
}

async function listProjects() {
  const list = detectProjects();
  return Promise.all(list.map(projectState));
}

async function startProject(id) {
  const p = detectProjects().find((x) => x.id === id);
  if (!p) throw new Error("פרויקט לא נמצא");
  if (p.id === "magnet-studio") throw new Error("אי אפשר להפעיל/לעצור את הפנקס מתוך עצמו");
  const dir = guardDir(p.dir);
  if (running.has(id)) return { ok: true, alreadyRunning: true };

  if (p.type === "compose") {
    if (!(await dockerAvailable())) throw new Error("Docker Desktop לא פעיל");
    const r = await run("docker", ["compose", "up", "-d"], { cwd: dir, timeout: 240000 });
    return { ok: r.ok, output: (r.stdout + r.stderr).trim().split("\n").slice(-15).join("\n") };
  }

  // node — spawn עם shell
  const proc = spawn(p.start, { cwd: dir, shell: true, windowsHide: true, env: { ...process.env } });
  const rec = { proc, pid: proc.pid, cmd: p.start, startedAt: Date.now(), log: [] };
  running.set(id, rec);
  pushLog(id, `$ ${p.start}  (pid ${proc.pid})`);
  proc.stdout.on("data", (d) => pushLog(id, d.toString()));
  proc.stderr.on("data", (d) => pushLog(id, d.toString()));
  proc.on("exit", (code) => { pushLog(id, `— התהליך הסתיים (code ${code}) —`); setTimeout(() => running.delete(id), 60000); });
  proc.on("error", (e) => pushLog(id, `שגיאת הפעלה: ${e.message}`));
  persistRuntime();
  return { ok: true, pid: proc.pid };
}

async function stopProject(id) {
  const p = detectProjects().find((x) => x.id === id);
  if (!p) throw new Error("פרויקט לא נמצא");
  if (p.id === "magnet-studio") throw new Error("אי אפשר לעצור את הפנקס מתוך עצמו");

  if (p.type === "compose") {
    const r = await run("docker", ["compose", "down"], { cwd: guardDir(p.dir), timeout: 120000 });
    return { ok: r.ok, output: (r.stdout + r.stderr).trim().split("\n").slice(-12).join("\n") };
  }
  const rec = running.get(id);
  if (!rec) return { ok: true, notRunning: true };
  if (process.platform === "win32") await run("taskkill", ["/PID", String(rec.pid), "/T", "/F"], { timeout: 10000 });
  else { try { process.kill(-rec.pid); } catch { try { rec.proc.kill("SIGTERM"); } catch {} } }
  running.delete(id);
  persistRuntime();
  return { ok: true };
}

async function projectLogs(id) {
  const p = detectProjects().find((x) => x.id === id);
  if (!p) throw new Error("פרויקט לא נמצא");
  const rec = running.get(id);
  if (rec) return { type: "live", lines: rec.log.slice(-LOG_MAX) };
  if (p.type === "compose" && p.logs && (await dockerAvailable())) {
    const r = await run("docker", ["compose", "logs", "--tail=200", "--no-color"], { cwd: guardDir(p.dir), timeout: 15000 });
    return { type: "compose", lines: (r.stdout + r.stderr).trim().split("\n").map((l) => ({ l })) };
  }
  return { type: "none", lines: [] };
}

function persistRuntime() {
  try {
    const snap = [...running.entries()].map(([id, r]) => ({ id, pid: r.pid, cmd: r.cmd, startedAt: r.startedAt }));
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(snap, null, 2));
  } catch { /* לא קריטי */ }
}

// ---------- pipeline (CI פשוטה) ----------

const pipelines = new Map(); // id -> { steps:[{name,status,output,ms}], running, startedAt, finishedAt }

const PIPELINE_TEMPLATES = {
  node: [
    { name: "git pull", cmd: ["git", "pull", "--ff-only"] },
    { name: "התקנת תלויות", cmd: ["npm", "install", "--no-audit", "--no-fund"] },
    { name: "בדיקות", cmd: ["npm", "test", "--if-present"], allowFail: true },
    { name: "בנייה", cmd: ["npm", "run", "build", "--if-present"], allowFail: true }
  ],
  compose: [
    { name: "git pull", cmd: ["git", "pull", "--ff-only"] },
    { name: "docker compose build", cmd: ["docker", "compose", "build"] },
    { name: "docker compose up -d", cmd: ["docker", "compose", "up", "-d"] }
  ]
};

async function runPipeline(id) {
  const p = detectProjects().find((x) => x.id === id);
  if (!p) throw new Error("פרויקט לא נמצא");
  const dir = guardDir(p.dir);
  if (pipelines.get(id)?.running) return pipelines.get(id);

  const steps = (PIPELINE_TEMPLATES[p.type] || PIPELINE_TEMPLATES.node).map((s) => ({ name: s.name, status: "pending", output: "", ms: null }));
  const state = { id, project: p.name, steps, running: true, startedAt: Date.now(), finishedAt: null };
  pipelines.set(id, state);

  (async () => {
    const tmpl = PIPELINE_TEMPLATES[p.type] || PIPELINE_TEMPLATES.node;
    for (let i = 0; i < tmpl.length; i++) {
      const st = steps[i];
      st.status = "running";
      const t0 = Date.now();
      const r = await run(tmpl[i].cmd[0], tmpl[i].cmd.slice(1), { cwd: dir, timeout: 300000 });
      st.ms = Date.now() - t0;
      st.output = (r.stdout + "\n" + r.stderr).trim().split("\n").slice(-40).join("\n");
      if (r.ok || tmpl[i].allowFail) {
        st.status = r.ok ? "ok" : "skipped";
      } else {
        st.status = "fail";
        for (let j = i + 1; j < steps.length; j++) steps[j].status = "blocked";
        break;
      }
    }
    state.running = false;
    state.finishedAt = Date.now();
  })();

  return state;
}

function pipelineStatus(id) {
  return pipelines.get(id) || null;
}

module.exports = {
  readConfig, writeConfig,
  n8nStatus, n8nWorkflows, n8nExecutions, n8nSetActive, n8nRun,
  infra,
  listProjects, startProject, stopProject, projectLogs,
  runPipeline, pipelineStatus
};
