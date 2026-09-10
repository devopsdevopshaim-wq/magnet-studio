#!/usr/bin/env bash
# הפנקס היומי — התקנה על macOS / Linux.
#   cd אל תיקיית הפרויקט ואז:  bash install/install.sh
# מתקין תלויות, יוצר .env, ומגדיר הפעלה אוטומטית (LaunchAgent ב-macOS / systemd user ב-Linux).

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== הפנקס היומי — התקנה =="

# 1. Node
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js לא מותקן. התקינו (nvm / brew / apt) והריצו שוב." >&2
  exit 1
fi
echo "Node $(node --version)"

# 2. תלויות
echo "מתקין תלויות..."
if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# 3. .env
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "נוצר .env — ערכו והוסיפו מפתחות (אופציונלי)."
fi

PORT="$(grep -E '^\s*PORT\s*=' .env 2>/dev/null | head -1 | sed -E 's/.*=\s*//' | tr -d '[:space:]')"
PORT="${PORT:-4420}"

# 4. הפעלה אוטומטית
NODE_BIN="$(command -v node)"
if [[ "$OSTYPE" == darwin* ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.magnetstudio.server.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.magnetstudio.server</string>
  <key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$ROOT/server.js</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/data/server.log</string>
  <key>StandardErrorPath</key><string>$ROOT/data/server.log</string>
</dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "הפעלה אוטומטית: LaunchAgent נטען."
elif command -v systemctl >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/magnet-studio.service" <<EOF
[Unit]
Description=Magnet Studio (הפנקס היומי)
[Service]
ExecStart=$NODE_BIN $ROOT/server.js
WorkingDirectory=$ROOT
Restart=always
[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now magnet-studio.service
  loginctl enable-linger "$USER" 2>/dev/null || true
  echo "הפעלה אוטומטית: systemd user service פעיל."
else
  echo "לא זוהתה מערכת הפעלה אוטומטית — הריצו ידנית: npm start"
fi

echo ""
echo "== מוכן =="
echo "הפעלה עכשיו:  npm start   (ואז http://localhost:$PORT/daily.html)"
echo "בטלפון (אותה רשת): מסך 'הגדרות' באתר → קוד QR."
echo "אם הטלפון לא מתחבר — פתחו את הפורט $PORT בחומת האש של המערכת."
