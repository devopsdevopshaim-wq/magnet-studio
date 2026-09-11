#!/usr/bin/env bash
# בונה חבילת התקנה נקייה להעברה למחשב אחר:  Desktop/הפנקס-היומי-להעברה.zip
# כל התקנה עצמאית לגמרי — כל מחשב מריץ שרת משלו ומציג את הנתונים של עצמו.
#
# מה נכנס:  הקוד + פרטי הלידה (אסטרולוגיה) + הגדרות JARVIS + רשימת המוזיקה.
# מה לא:    node_modules, .env (סודות), מטמוני יום, ותצורה ספציפית-למחשב (נתיבי תיקיות/תוכנות).

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)"
DEST="${1:-$HOME/Desktop/הפנקס-היומי-להעברה.zip}"

cp -r "$ROOT" "$STAGE/magnet-studio"
cd "$STAGE/magnet-studio"

rm -rf node_modules .git scratchpad public/downloads .vercel data/aia data/devops-logs
rm -f public/_yttest.html
rm -f data/daily-brief-*.json data/learning-*.json data/lotto-*.json \
      data/astro-natal-cache.json data/*.bak data/*.pre-import-*.bak data/sync-status.json \
      data/devops-config.json data/devops-runtime.json data/profile.json \
      data/tts-config.json data/aia-video-config.json data/auth-config.json data/integrations-config.json \
      "הפעלת הסטודיו.bat"
rm -rf data/tehillim-cache

# תצורה ספציפית-למחשב — נמחקת כדי שכל מחשב יגדיר את שלו במסך ההגדרות
rm -f data/user-config.json

# מצב ריצה — מתאפס, ייבנה מחדש בכל מחשב
echo "null" > data/email-status.json
echo "null" > data/calendar-status.json
echo "[]"   > data/n8n-inbox.json

cat > "START-HERE-התחל-כאן.txt" <<'EOF'
הפנקס היומי — התקנה על המחשב הזה
=====================================
** כל מחשב עצמאי לגמרי. ** הוא מריץ שרת משלו ומציג את הנתונים של עצמו:
המעבד/הדיסק/הרשת שלו, והמיילים/היומן שתגדיר בו. אין סנכרון אוטומטי בין מחשבים.

Docker (הכי פשוט):
  docker compose up -d        ואז  http://localhost:4420/daily.html

בלי Docker (Node.js 20+):
  Windows:   לחיצה ימנית על install\install.ps1  ->  Run with PowerShell     ואז  npm start
  Mac/Linux: bash install/install.sh                                          ואז  npm start

מיילים ויומן (אופציונלי, לכל מחשב בנפרד):
  העתק  .env.example  ל-.env  והוסף MATON_API_KEY משלך (console.maton.ai).

טלפון (אותה רשת Wi-Fi):
  1. הרץ:  install\פתח-גישה-לטלפון.bat   (אשר UAC)
  2. באתר -> הגדרות -> סעיף 04 -> סרוק QR -> "הוסף למסך הבית"
  * טלפון תמיד מציג את המחשב שאליו הוא מחובר, לא את עצמו.

תיקיית העיצובים והתוכנות המהירות: נקבעות במסך "הגדרות" בכל מחשב בנפרד.
פרטי הלידה (אסטרולוגיה) כבר מובאים — אותו אדם בכל מחשב.

הסבר מלא ופתרון תקלות: INSTALL.md
EOF

# עותק שני שמוגש מהאתר עצמו (הגדרות → הורדת המערכת)
SITE_COPY="$ROOT/public/downloads/magnet-studio-install.zip"
mkdir -p "$ROOT/public/downloads"

rm -f "$DEST" "$SITE_COPY"
if command -v powershell.exe >/dev/null 2>&1; then
  WINDEST="$(cygpath -w "$DEST" 2>/dev/null || echo "$DEST")"
  WINSTAGE="$(cygpath -w "$STAGE/magnet-studio" 2>/dev/null || echo "$STAGE/magnet-studio")"
  powershell.exe -NoProfile -Command "Compress-Archive -Path '$WINSTAGE' -DestinationPath '$WINDEST' -Force"
else
  (cd "$STAGE" && zip -qr "$DEST" magnet-studio)
fi
cp "$DEST" "$SITE_COPY"

rm -rf "$STAGE"
echo "✓ נוצר: $DEST"
echo "✓ עותק לאתר: $SITE_COPY  (מוגש ב-/downloads/magnet-studio-install.zip)"
