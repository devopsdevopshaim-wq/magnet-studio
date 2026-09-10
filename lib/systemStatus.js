const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

let cache = { at: 0, data: null };
const CACHE_MS = 5000;
const IS_WIN = process.platform === "win32";

const PS_SCRIPT = `
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object Size,FreeSpace
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 LoadPercentage
[PSCustomObject]@{ diskSize = $disk.Size; diskFree = $disk.FreeSpace; cpuLoad = $cpu.LoadPercentage } | ConvertTo-Json -Compress
`;

function readWindowsStats() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve(null);
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// חוצה-פלטפורמות: דיסק דרך fs.statfsSync (Node 18+), CPU דרך ממוצע עומס
function readPosixStats() {
  const out = { diskSize: null, diskFree: null, cpuLoad: null };
  try {
    const st = fs.statfsSync(path.parse(process.cwd()).root || "/");
    out.diskSize = st.blocks * st.bsize;
    out.diskFree = st.bavail * st.bsize;
  } catch {
    /* אין statfs — נשאיר null */
  }
  try {
    const cores = os.cpus().length || 1;
    const load1 = os.loadavg()[0]; // 0 ב-Windows, לכן רק ל-POSIX
    if (load1 > 0) out.cpuLoad = Math.min(100, Math.round((load1 / cores) * 100));
  } catch {
    /* ignore */
  }
  return out;
}

async function getSystemStatus() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let hw = null;
  if (IS_WIN) hw = await readWindowsStats();
  if (!hw || (!hw.diskSize && hw.cpuLoad == null)) {
    // גיבוי חוצה-פלטפורמות (וגם אם ה-PowerShell נכשל ב-Windows)
    const posix = readPosixStats();
    hw = { diskSize: hw?.diskSize || posix.diskSize, diskFree: hw?.diskFree ?? posix.diskFree, cpuLoad: hw?.cpuLoad ?? posix.cpuLoad };
  }

  const data = {
    memory: {
      usedGB: +(usedMem / 1e9).toFixed(1),
      totalGB: +(totalMem / 1e9).toFixed(1),
      percent: Math.round((usedMem / totalMem) * 100)
    },
    disk: hw && hw.diskSize
      ? {
          freeGB: +(hw.diskFree / 1e9).toFixed(1),
          totalGB: +(hw.diskSize / 1e9).toFixed(1),
          percent: Math.round(((hw.diskSize - hw.diskFree) / hw.diskSize) * 100)
        }
      : null,
    cpuPercent: hw && typeof hw.cpuLoad === "number" ? hw.cpuLoad : null,
    cpuCount: os.cpus().length,
    platform: process.platform,
    uptimeHours: +(os.uptime() / 3600).toFixed(1)
  };

  cache = { at: now, data };
  return data;
}

module.exports = { getSystemStatus };
