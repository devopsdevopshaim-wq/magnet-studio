const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { categorize } = require("./categoryRules");

// תיקיות תפריט ההתחלה של Windows - המקום הסטנדרטי שבו כל תוכנה מותקנת רושמת קיצור דרך להפעלה.
// os.homedir() מבטיח שזה עובד תחת כל שם משתמש/מחשב, לא רק זה שעליו נבנה הקוד.
const SCAN_ROOTS = [
  "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
  path.join(os.homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs")
];

const EXCLUDE_KEYWORDS = [
  "uninstall", "unins0", "read me", "readme", "help", "license", "documentation",
  "changelog", "website", "support", "installer", "setup wizard"
];

let cache = { signature: "", apps: [], scannedAt: null, scanning: false };

// טביעת אצבע קלה (כמות קבצים + זמן שינוי אחרון) - כשהיא לא משתנה, לא מפעילים PowerShell שוב
function folderSignature(rootDir, depth = 4) {
  let count = 0;
  let maxMtime = 0;

  function walk(dir, remaining) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && remaining > 0) {
        walk(full, remaining - 1);
      } else if (e.isFile() && /\.lnk$/i.test(e.name)) {
        count += 1;
        try {
          const mtime = fs.statSync(full).mtimeMs;
          if (mtime > maxMtime) maxMtime = mtime;
        } catch {
          /* ignore unreadable file */
        }
      }
    }
  }

  walk(rootDir, depth);
  return `${count}:${maxMtime}`;
}

function overallSignature() {
  return SCAN_ROOTS.map((r) => `${r}=${folderSignature(r)}`).join("|");
}

const PS_SCRIPT = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Drawing
$ws = New-Object -ComObject WScript.Shell
$rootsB64 = "__ROOTS_B64__"
$roots = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($rootsB64)) -split "\`n"
$results = @()
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Filter *.lnk -File -Recurse | ForEach-Object {
    $sc = $ws.CreateShortcut($_.FullName)
    $target = $sc.TargetPath
    if (-not $target) { return }
    if ($target -notmatch '\\.exe$') { return }
    if (-not (Test-Path $target)) { return }
    $iconB64 = $null
    try {
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
      $bmp = $icon.ToBitmap()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $iconB64 = [Convert]::ToBase64String($ms.ToArray())
    } catch {}
    $results += [PSCustomObject]@{ name = $_.BaseName; target = $target; icon = $iconB64 }
  }
}
$json = $results | ConvertTo-Json -Compress
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
`;

function runScanScript() {
  return new Promise((resolve) => {
    const rootsB64 = Buffer.from(SCAN_ROOTS.join("\n"), "utf8").toString("base64");
    const script = PS_SCRIPT.replace("__ROOTS_B64__", rootsB64);
    const encoded = Buffer.from(script, "utf16le").toString("base64");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 60000, maxBuffer: 40 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve([]);
        try {
          const json = Buffer.from(stdout.trim(), "base64").toString("utf8");
          const parsed = JSON.parse(json);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function slugify(name) {
  const pattern = /[^a-z0-9֐-׿]+/g;
  const cleaned = name.toLowerCase().replace(pattern, "-").replace(/^-+|-+$/g, "");
  return "sys-" + (cleaned || "app");
}

function isExcluded(name) {
  const lower = name.toLowerCase();
  return EXCLUDE_KEYWORDS.some((k) => lower.includes(k));
}

async function scanSystemApps() {
  const signature = overallSignature();
  if (signature === cache.signature) return cache.apps;
  if (cache.scanning) return cache.apps; // סריקה כבר רצה - מחזירים את מה שיש בינתיים
  cache.scanning = true;

  try {
    const raw = await runScanScript();
    const seenTargets = new Set();
    const seenSlugs = new Set();
    const apps = [];

    for (const entry of raw) {
      if (!entry || !entry.target || !entry.name) continue;
      if (isExcluded(entry.name)) continue;
      const targetKey = path.resolve(entry.target).toLowerCase();
      if (seenTargets.has(targetKey)) continue; // כמה קיצורי דרך לאותה תוכנה
      seenTargets.add(targetKey);

      let slug = slugify(entry.name);
      while (seenSlugs.has(slug)) slug += "-2";
      seenSlugs.add(slug);

      const category = categorize(`${entry.name} ${entry.target}`);
      apps.push({
        key: slug,
        label: entry.name,
        exe: entry.target,
        icon: entry.icon ? `data:image/png;base64,${entry.icon}` : null,
        category: category.key,
        categoryLabel: category.label
      });
    }

    apps.sort((a, b) => a.label.localeCompare(b.label, "he"));
    cache = { signature, apps, scannedAt: new Date().toISOString(), scanning: false };
  } catch {
    cache.scanning = false;
  }

  return cache.apps;
}

function getCachedSystemApps() {
  return cache.apps;
}

module.exports = { scanSystemApps, getCachedSystemApps };
