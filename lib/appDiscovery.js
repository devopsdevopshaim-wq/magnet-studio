const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { MAGNET_ROOT, APPS: CURATED_APPS } = require("./config");

const curatedTargets = new Set(
  Object.values(CURATED_APPS).map((a) => path.resolve(a.exe).toLowerCase())
);

let cache = { signature: "", apps: [] };

// טביעת אצבע קלה של כל קיצורי הדרך בתיקיית השורש - כשהיא לא משתנה, לא צריך להפעיל PowerShell שוב
function shortcutSignature() {
  let entries;
  try {
    entries = fs.readdirSync(MAGNET_ROOT, { withFileTypes: true });
  } catch {
    return "";
  }
  return entries
    .filter((e) => e.isFile() && /\.lnk$/i.test(e.name))
    .map((e) => {
      try {
        const st = fs.statSync(path.join(MAGNET_ROOT, e.name));
        return `${e.name}:${st.mtimeMs}`;
      } catch {
        return e.name;
      }
    })
    .sort()
    .join("|");
}

const PS_SCRIPT = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Drawing
$ws = New-Object -ComObject WScript.Shell
$root = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("__ROOT_B64__"))
$results = @()
Get-ChildItem -Path $root -Filter *.lnk -File | ForEach-Object {
  $sc = $ws.CreateShortcut($_.FullName)
  $target = $sc.TargetPath
  $iconB64 = $null
  if ($target -and (Test-Path $target) -and ($target -match '\\.exe$')) {
    try {
      $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
      $bmp = $icon.ToBitmap()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $iconB64 = [Convert]::ToBase64String($ms.ToArray())
    } catch {}
  }
  $results += [PSCustomObject]@{ name = $_.BaseName; target = $target; icon = $iconB64 }
}
$json = $results | ConvertTo-Json -Compress
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
`;

function runDiscoveryScript() {
  return new Promise((resolve) => {
    const rootB64 = Buffer.from(MAGNET_ROOT, "utf8").toString("base64");
    const script = PS_SCRIPT.replace("__ROOT_B64__", rootB64);
    // -EncodedCommand (UTF-16LE base64) sidesteps codepage issues with Hebrew paths/filenames
    const encoded = Buffer.from(script, "utf16le").toString("base64");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 12000, maxBuffer: 20 * 1024 * 1024 },
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

// U+200E/U+200F (LRM/RLM) ו-U+202A-U+202E (bidi embedding marks) נדבקים לפעמים לשמות קיצורי דרך בעברית
const BIDI_MARKS = /[‎‏‪-‮]/g;
const HEBREW_BLOCK = "֐-׿";

function cleanLabel(name) {
  return name
    .replace(BIDI_MARKS, "")
    .replace(/\s*[-–]?\s*קיצור\s*דרך\s*$/i, "")
    .trim();
}

function slugify(name) {
  const pattern = new RegExp(`[^a-z0-9${HEBREW_BLOCK}]+`, "g");
  const cleaned = name.toLowerCase().replace(pattern, "-").replace(/^-+|-+$/g, "");
  return "auto-" + (cleaned || "app");
}

async function discoverApps() {
  const signature = shortcutSignature();
  if (signature === cache.signature) return cache.apps;

  const raw = await runDiscoveryScript();
  const apps = [];
  const seenSlugs = new Set();

  for (const entry of raw) {
    if (!entry || !entry.target) continue;
    const target = entry.target;
    if (!/\.exe$/i.test(target)) continue;
    if (/uninstall/i.test(path.basename(target))) continue;
    if (curatedTargets.has(path.resolve(target).toLowerCase())) continue; // כבר מוצג כתוכנה מוגדרת מראש

    const label = cleanLabel(entry.name) || path.basename(target, ".exe");
    let slug = slugify(label);
    while (seenSlugs.has(slug)) slug += "-2";
    seenSlugs.add(slug);

    apps.push({
      key: slug,
      label,
      description: "התגלה אוטומטית בתיקיית העיצובים",
      exe: target,
      icon: entry.icon ? `data:image/png;base64,${entry.icon}` : null,
      auto: true
    });
  }

  cache = { signature, apps };
  return apps;
}

function getCachedApps() {
  return cache.apps;
}

module.exports = { discoverApps, getCachedApps };
