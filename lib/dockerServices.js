// הרמת שירותי Docker נלווים (n8n מקומי, סטאק DiraFinder) - best-effort.
// אם Docker Desktop לא רץ / הפקודה נכשלת, פשוט מדלגים ומדווחים.

const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");

function run(cmd, args, { cwd, timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: (stdout || "").trim(), stderr: (stderr || "").trim(), err });
    });
  });
}

let dockerOk = null;
async function dockerAvailable() {
  // כשרצים בעצמנו בתוך קונטיינר (docker-compose) — לא מנסים לתזמר Docker נוסף
  if (process.env.DISABLE_DOCKER_ORCHESTRATION === "1") return false;
  if (dockerOk !== null) return dockerOk;
  const r = await run("docker", ["version", "--format", "{{.Server.Version}}"], { timeout: 8000 });
  dockerOk = r.ok && !!r.stdout;
  return dockerOk;
}

/** מריץ `docker compose -f <file> up -d`. מחזיר {ok, skipped?, error?}.
 *  אם נמסר healthUrl והשירות כבר נגיש - מדלגים (כדי לא להתנגש בקונטיינר שכבר רץ). */
async function ensureUp(composeFile, { profile, envFile, healthUrl } = {}) {
  if (!fs.existsSync(composeFile)) return { ok: false, skipped: true, error: "compose file לא נמצא" };
  if (healthUrl && (await reachable(healthUrl))) return { ok: true, alreadyUp: true };
  if (!(await dockerAvailable())) return { ok: false, skipped: true, error: "Docker Desktop לא פעיל" };

  const dir = path.dirname(composeFile);
  const args = ["compose", "-f", path.basename(composeFile)];
  if (envFile && fs.existsSync(path.join(dir, envFile))) args.push("--env-file", envFile);
  if (profile) args.push("--profile", profile);
  args.push("up", "-d");

  const r = await run("docker", args, { cwd: dir, timeout: 180000 });
  return r.ok ? { ok: true } : { ok: false, error: (r.stderr || r.err?.message || "").slice(0, 300) };
}

/**
 * מייבא + מפעיל workflow לתוך קונטיינר n8n דרך ה-CLI (בלי צורך ב-owner account / API key).
 * ה-workflow חייב לכלול "id". idempotent - ייבוא חוזר פשוט דורס.
 * @returns {ok, skipped?, alreadyPresent?, error?}
 */
async function importN8nWorkflow(containerName, localJsonPath, workflowId) {
  if (!fs.existsSync(localJsonPath)) return { ok: false, skipped: true, error: "workflow file לא נמצא" };
  if (!(await dockerAvailable())) return { ok: false, skipped: true, error: "Docker לא פעיל" };

  // כבר קיים?
  const listed = await run("docker", ["exec", containerName, "n8n", "list:workflow"], { timeout: 20000 });
  if (listed.ok && listed.stdout.includes(workflowId)) return { ok: true, alreadyPresent: true };

  const tmp = `/tmp/${workflowId}.json`;
  const cp = await run("docker", ["cp", localJsonPath, `${containerName}:${tmp}`], { timeout: 20000 });
  if (!cp.ok) return { ok: false, error: `docker cp נכשל: ${cp.stderr || cp.err?.message}` };

  const imp = await run("docker", ["exec", containerName, "n8n", "import:workflow", `--input=${tmp}`], { timeout: 40000 });
  if (!imp.ok || /error occurred/i.test(imp.stdout)) {
    return { ok: false, error: `import נכשל: ${(imp.stdout || imp.stderr).slice(0, 200)}` };
  }
  await run("docker", ["exec", containerName, "n8n", "publish:workflow", `--id=${workflowId}`], { timeout: 30000 });
  await run("docker", ["exec", containerName, "n8n", "update:workflow", `--id=${workflowId}`, "--active=true"], { timeout: 30000 });
  return { ok: true, imported: true, needsRestart: true };
}

/** מריץ SQL מתוך קובץ בתוך קונטיינר ה-db של קומפוז (via docker compose exec) */
async function execSqlFile(composeFile, service, dbUser, dbName, sqlPathInContainer) {
  if (!(await dockerAvailable())) return { ok: false, skipped: true };
  const dir = path.dirname(composeFile);
  const r = await run(
    "docker",
    ["compose", "-f", path.basename(composeFile), "exec", "-T", service, "psql", "-v", "ON_ERROR_STOP=0", "-U", dbUser, "-d", dbName, "-f", sqlPathInContainer],
    { cwd: dir, timeout: 60000 }
  );
  return { ok: r.ok, out: r.stdout, err: r.stderr };
}

function reachable(url, timeout = 3000) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return resolve(false);
    }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      { hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname, method: "GET", timeout },
      (res) => {
        res.resume();
        resolve(res.statusCode > 0 && res.statusCode < 500);
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

module.exports = { ensureUp, execSqlFile, importN8nWorkflow, reachable, dockerAvailable };
