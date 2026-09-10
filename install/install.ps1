# הפנקס היומי — התקנה על מחשב Windows חדש.
#   פתחו PowerShell בתיקיית הפרויקט והריצו:  .\install\install.ps1
# מה זה עושה: מתקין תלויות, פותח את הפורט ב-Firewall, ומגדיר הפעלה אוטומטית בכניסה למחשב.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "== הפנקס היומי — התקנה ==" -ForegroundColor Cyan

# 1. Node
try { $nv = node --version } catch { $nv = $null }
if (-not $nv) {
  Write-Host "Node.js לא מותקן. התקינו מ- https://nodejs.org (LTS) והריצו שוב." -ForegroundColor Red
  exit 1
}
Write-Host "Node $nv" -ForegroundColor Green

# 2. תלויות
Write-Host "מתקין תלויות (npm ci)..." -ForegroundColor Cyan
if (Test-Path package-lock.json) { npm ci --omit=dev } else { npm install --omit=dev }

# 3. .env
if (-not (Test-Path .env) -and (Test-Path .env.example)) {
  Copy-Item .env.example .env
  Write-Host "נוצר .env מתוך .env.example — ערכו אותו והוסיפו מפתחות (אופציונלי)." -ForegroundColor Yellow
}

# 4. Firewall — פותח את הפורט לרשת המקומית (כדי שהטלפון יוכל להתחבר)
$port = 4420
if (Test-Path .env) {
  $m = (Get-Content .env | Select-String '^\s*PORT\s*=\s*(\d+)').Matches
  if ($m.Count -gt 0) { $port = [int]$m[0].Groups[1].Value }
}
try {
  Remove-NetFirewallRule -DisplayName "Magnet Studio (Pnks)" -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName "Magnet Studio (Pnks)" -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $port -Profile Private | Out-Null
  Write-Host "Firewall: פורט $port פתוח לרשת פרטית." -ForegroundColor Green
} catch {
  Write-Host "לא הצלחתי לפתוח את ה-Firewall (צריך הרשאת מנהל). הריצו את install\allow-firewall.ps1 כ-Administrator." -ForegroundColor Yellow
}

# 5. הפעלה אוטומטית בכניסה למחשב
$vbsPath = Join-Path $root "run-hidden.vbs"
if (Test-Path $vbsPath) {
  $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbsPath`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName "MagnetStudioServer" -Action $action -Trigger $trigger -RunLevel Limited -Force | Out-Null
  Write-Host "הפעלה אוטומטית: מוגדרת (משימה MagnetStudioServer)." -ForegroundColor Green
}

Write-Host ""
Write-Host "== מוכן ==" -ForegroundColor Cyan
Write-Host "הפעלה עכשיו:  npm start   (ואז http://localhost:$port/daily.html)"
Write-Host "בטלפון: מסך 'הגדרות' באתר → קוד QR → 'הוסף למסך הבית'."
