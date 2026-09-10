# פותח את הפנקס היומי לגישה מהטלפון (רשת מקומית).
# מטפל בשלושת הדברים שחוסמים גישה מהטלפון:
#   1. כלל Firewall נכנס לפורט 4420 — לכל הפרופילים (כולל Public)
#   2. הופך את רשת הבית מ-Public ל-Private (Windows פחות חוסם ברשת פרטית)
#   3. מוודא שהשרת מאזין על כל המתאמים
#
# הרצה כ-Administrator:  לחיצה ימנית על הקובץ → "Run with PowerShell"  (ואשרו את חלון ה-UAC)
# או:  powershell -ExecutionPolicy Bypass -File install\allow-firewall.ps1

param([int]$Port = 4420)
$ErrorActionPreference = "Stop"

# פורטים שהטלפון צריך: 4420 = הפנקס · 3737 = מערכת הגרפולוגיה (iframe)
$Ports = @($Port, 3737)

# הרצה מחדש עם הרשאות מנהל אם צריך
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "צריך הרשאות מנהל — פותח חלון מוגבה..." -ForegroundColor Yellow
  Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port" -Verb RunAs
  return
}

# 1. כלל Firewall — לכל הפרופילים
Remove-NetFirewallRule -DisplayName "Magnet Studio (Pnks)" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Magnet Studio (Pnks)" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $Ports -Profile Any | Out-Null
Write-Host "[1/3] Firewall: פורטים $($Ports -join ', ') פתוחים לכניסה (כל הפרופילים)." -ForegroundColor Green

# 2. רשת הבית → Private
$profiles = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq "Public" }
foreach ($p in $profiles) {
  try {
    Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private
    Write-Host "[2/3] רשת '$($p.Name)' ($($p.InterfaceAlias)) שונתה ל-Private." -ForegroundColor Green
  } catch {
    Write-Host "[2/3] לא הצלחתי לשנות את '$($p.Name)' ל-Private: $_" -ForegroundColor Yellow
  }
}
if (-not $profiles) { Write-Host "[2/3] כל הרשתות כבר Private — טוב." -ForegroundColor Green }

# 3. כתובת נכונה לטלפון
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like "192.168.*" -and $_.IPAddress -notlike "192.168.56.*" -and $_.InterfaceAlias -notmatch "vEthernet|VMware|VirtualBox|Loopback" } |
  Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "[3/3] מוכן! בטלפון (על אותה רשת Wi-Fi) פתחו בכרום:" -ForegroundColor Cyan
Write-Host "      http://${ip}:${Port}/daily.html" -ForegroundColor White
Write-Host ""
Write-Host "אם עדיין לא עובד — בדקו בראוטר אם מופעל 'AP Isolation' / 'בידוד לקוחות' וכבו אותו."
Write-Host "לביטול הכלל:  Remove-NetFirewallRule -DisplayName 'Magnet Studio (Pnks)'"
Read-Host "`nEnter לסגירה"
