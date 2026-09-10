const { execFile } = require("child_process");

const PS_SCRIPT = `
$ErrorActionPreference = "Stop"
try {
  $outlook = New-Object -ComObject Outlook.Application
  $ns = $outlook.GetNamespace("MAPI")
  $inbox = $ns.GetDefaultFolder(6)
  $account = $ns.CurrentUser.Address
  $unreadCount = $inbox.UnReadItemCount

  $items = $inbox.Items
  $items.Sort("[ReceivedTime]", $true)
  $recent = @()
  $n = 0
  foreach ($item in $items) {
    if ($n -ge 5) { break }
    try {
      if ($item.UnRead) {
        $recent += [PSCustomObject]@{
          subject = $item.Subject
          sender = $item.SenderName
          date = $item.ReceivedTime.ToString("o")
        }
        $n++
      }
    } catch {}
  }

  $result = [PSCustomObject]@{ ok = $true; account = $account; unreadCount = $unreadCount; recent = $recent }
} catch {
  $result = [PSCustomObject]@{ ok = $false; error = $_.Exception.Message }
}
$json = $result | ConvertTo-Json -Compress -Depth 5
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
`;

function runOutlookScript() {
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 45000, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve(null);
        try {
          const json = Buffer.from(stdout.trim(), "base64").toString("utf8");
          resolve(JSON.parse(json));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function getOutlookInboxSummary() {
  const raw = await runOutlookScript();
  if (!raw || !raw.ok) return null;

  const recentArr = Array.isArray(raw.recent) ? raw.recent : raw.recent ? [raw.recent] : [];
  return {
    account: raw.account || null,
    unreadCount: raw.unreadCount,
    recentUnread: recentArr.map((r) => ({ subject: r.subject, sender: r.sender, date: r.date })),
    source: "outlook"
  };
}

module.exports = { getOutlookInboxSummary };
