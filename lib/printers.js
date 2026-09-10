const { execFile } = require("child_process");

let cache = { at: 0, names: [] };
const CACHE_MS = 60000;

const PS_SCRIPT = `
$ErrorActionPreference = "SilentlyContinue"
$names = Get-Printer | Select-Object -ExpandProperty Name
$json = $names | ConvertTo-Json -Compress
if (-not $json) { $json = "[]" }
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
`;

function runQuery() {
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 8000 },
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

async function listPrinters() {
  const now = Date.now();
  if (now - cache.at < CACHE_MS) return cache.names;
  const names = await runQuery();
  cache = { at: now, names };
  return names;
}

module.exports = { listPrinters };
