// מצב מערכת מורחב - superset של lib/systemStatus.js (שלא נגעתי בו).
//  - PowerShell מרוכז: סוללה, כל הכוננים, תהליכים, טמפ' מעבד, אתחול אחרון, עדכון אחרון, מתאם רשת, IP מקומי
//  - Node: IP חיצוני + זמינות שירותים (n8n Cloud, Ollama, Maton)
// הכל best-effort ומטומן ~60ש'.

const os = require("os");
const https = require("https");
const http = require("http");
const { execFile } = require("child_process");
const { getSystemStatus } = require("./systemStatus");
const maton = require("./matonClient");
const jarvis = require("./jarvisClient");

let cache = { at: 0, data: null };
const CACHE_MS = 60 * 1000;

const PS_SCRIPT = `
$ErrorActionPreference = "SilentlyContinue"
function TryVal($sb) { try { & $sb } catch { $null } }

$battery = TryVal { Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining, EstimatedRunTime, BatteryStatus }
$drives = TryVal { Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, Size, FreeSpace }
$procCount = TryVal { (Get-Process).Count }
$topProc = TryVal { Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 1 Name, @{n='MB';e={[math]::Round($_.WorkingSet64/1MB)}} }
$tempRaw = TryVal { (Get-CimInstance -Namespace "root/WMI" -ClassName MSAcpi_ThermalZoneTemperature | Select-Object -First 1).CurrentTemperature }
$lastBoot = TryVal { (Get-CimInstance Win32_OperatingSystem).LastBootUpTime }
$lastHotfix = TryVal { (Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn }
$adapter = TryVal {
  $up = Get-NetAdapter | Where-Object Status -eq 'Up'
  $phys = $up | Where-Object { $_.Virtual -eq $false -and $_.InterfaceDescription -notmatch 'VMware|VirtualBox|Hyper-V|Loopback|TAP|WSL|vEthernet' }
  (@($phys) + @($up) | Select-Object -First 1 Name, LinkSpeed, InterfaceDescription, ifIndex)
}
$localIp = TryVal {
  $ifIndex = $adapter.ifIndex
  $ip = $null
  if ($ifIndex) { $ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress }
  if (-not $ip) { $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress }
  $ip
}

$result = [PSCustomObject]@{
  battery = $battery
  drives = @($drives)
  procCount = $procCount
  topProc = $topProc
  cpuTempC = if ($tempRaw) { [math]::Round(($tempRaw / 10) - 273.15, 1) } else { $null }
  lastBoot = if ($lastBoot) { $lastBoot.ToString("o") } else { $null }
  lastHotfix = if ($lastHotfix) { $lastHotfix.ToString("yyyy-MM-dd") } else { $null }
  adapter = $adapter
  localIp = $localIp
}
$json = $result | ConvertTo-Json -Compress -Depth 6
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
`;

function runPowerShell() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null); // חוצה-פלטפורמות: אין PowerShell → מצב מורחב חלקי
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 18000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve(null);
        try {
          resolve(JSON.parse(Buffer.from(stdout.trim(), "base64").toString("utf8")));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function reachable(url, timeout = 3500) {
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
        resolve(res.statusCode < 500);
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

function externalIp(timeout = 3500) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: "api.ipify.org", path: "/?format=json", method: "GET", timeout },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")).ip || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

function batteryText(b) {
  if (!b || b.EstimatedChargeRemaining == null) return null;
  const plugged = b.BatteryStatus === 2 || b.BatteryStatus === 6 || b.BatteryStatus === 7 || b.BatteryStatus === 8;
  const runMin = b.EstimatedRunTime && b.EstimatedRunTime > 0 && b.EstimatedRunTime < 71582 ? b.EstimatedRunTime : null;
  return {
    percent: b.EstimatedChargeRemaining,
    plugged,
    remainingText: plugged ? "מחובר לחשמל" : runMin ? `כ-${Math.floor(runMin / 60)}:${String(runMin % 60).padStart(2, "0")} שעות` : null
  };
}

async function getSystemStatusPlus() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;

  const base = (jarvis.readConfig().base || "https://haimkripisn.app.n8n.cloud").replace(/\/+$/, "");

  const [core, ps, ext, n8nUp, ollamaUp, n8nLocalUp, openclawUp] = await Promise.all([
    getSystemStatus(),
    runPowerShell(),
    externalIp(),
    reachable(`${base}/healthz`),
    reachable("http://127.0.0.1:11434/api/tags"),
    reachable("http://127.0.0.1:5680/healthz"),
    reachable("http://127.0.0.1:18789/")
  ]);

  const drives = (ps?.drives || [])
    .filter((d) => d && d.Size)
    .map((d) => ({
      letter: d.DeviceID,
      freeGB: +(d.FreeSpace / 1e9).toFixed(1),
      totalGB: +(d.Size / 1e9).toFixed(1),
      percent: Math.round(((d.Size - d.FreeSpace) / d.Size) * 100)
    }));

  const data = {
    generatedAt: new Date().toISOString(),
    core, // memory / disk(C) / cpu / uptime מ-systemStatus הקיים
    hostname: os.hostname(),
    battery: batteryText(ps?.battery),
    drives,
    processCount: ps?.procCount ?? null,
    topProcess: ps?.topProc ? { name: ps.topProc.Name, memMB: ps.topProc.MB } : null,
    cpuTempC: ps?.cpuTempC ?? null,
    lastBoot: ps?.lastBoot ?? null,
    lastUpdateInstalled: ps?.lastHotfix ?? null,
    network: {
      adapter: ps?.adapter?.Name || null,
      linkSpeed: ps?.adapter?.LinkSpeed || null,
      localIp: ps?.localIp || null,
      externalIp: ext,
      online: !!ext
    },
    services: {
      n8nCloud: n8nUp,
      n8nLocal: n8nLocalUp,
      ollama: ollamaUp,
      openclaw: openclawUp,
      maton: maton.isConfigured() ? maton.keys().length : 0
    },
    warnings: []
  };

  if (data.battery && !data.battery.plugged && data.battery.percent <= 20)
    data.warnings.push(`הסוללה נמוכה (${data.battery.percent}%) ולא מחוברת לחשמל`);
  for (const d of drives) if (d.percent >= 90) data.warnings.push(`הכונן ${d.letter} כמעט מלא (${d.freeGB} GB פנויים)`);
  if (data.cpuTempC && data.cpuTempC >= 85) data.warnings.push(`טמפרטורת מעבד גבוהה (${data.cpuTempC}°C)`);
  if (!data.network.online) data.warnings.push("אין חיבור לאינטרנט");

  cache = { at: now, data };
  return data;
}

module.exports = { getSystemStatusPlus };
