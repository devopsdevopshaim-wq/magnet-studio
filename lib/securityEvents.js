const { execFile } = require("child_process");

let cache = { at: 0, data: null };
const CACHE_MS = 5 * 60 * 1000;

// Event IDs שרלוונטיים לניטור פריצות/פעילות חשודה ביומן האבטחה של Windows:
// 4625 = כניסה כושלת, 4740 = נעילת חשבון, 4720 = חשבון משתמש חדש נוצר,
// 4732 = משתמש נוסף לקבוצת מנהלים, 4648 = כניסה עם אישורים מפורשים (לעיתים חשוד)
const PS_SCRIPT = `
$ErrorActionPreference = "SilentlyContinue"
$since = (Get-Date).AddHours(-24)
$ids = 4625,4740,4720,4732
$events = @()
try {
  $raw = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = $ids; StartTime = $since } -MaxEvents 30 -ErrorAction Stop
  foreach ($e in $raw) {
    $events += [PSCustomObject]@{
      id = $e.Id
      time = $e.TimeCreated.ToString("o")
      message = ($e.Message -split "\`n")[0]
    }
  }
  $status = "ok"
} catch {
  # Get-WinEvent זורק שגיאה גם כשהשאילתה תקינה אך פשוט לא נמצאו אירועים תואמים -
  # זה לא "לא זמין", זה בדיוק "הכל תקין, אין התראות". רק שגיאות אחרות (למשל הרשאות) הן "unavailable".
  if ($_.FullyQualifiedErrorId -like "NoMatchingEventsFound*") {
    $status = "ok"
  } else {
    $status = "unavailable"
  }
}
$result = [PSCustomObject]@{ status = $status; events = $events }
$json = $result | ConvertTo-Json -Compress -Depth 5
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
`;

function runQuery() {
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve({ status: "unavailable", events: [] });
        try {
          const json = Buffer.from(stdout.trim(), "base64").toString("utf8");
          const parsed = JSON.parse(json);
          const events = Array.isArray(parsed.events) ? parsed.events : parsed.events ? [parsed.events] : [];
          resolve({ status: parsed.status, events });
        } catch {
          resolve({ status: "unavailable", events: [] });
        }
      }
    );
  });
}

async function getSecurityAlerts() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;
  const result = await runQuery();
  const data = { ...result, checkedAt: new Date().toISOString() };
  cache = { at: now, data };
  return data;
}

module.exports = { getSecurityAlerts };
