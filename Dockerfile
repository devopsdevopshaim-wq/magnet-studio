# הפנקס היומי — שרת מקומי חוצה-פלטפורמות.
# בנייה:   docker build -t magnet-studio .
# הרצה:    docker compose up -d   (מומלץ — ראו docker-compose.yml)

FROM node:22-alpine

# tini לניהול תקין של אותות עצירה
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# כרום מערכת + פונטים — נחוץ לכל מה שמפעיל דפדפן headless בתוך הקונטיינר:
#   • lib/whatsapp.js (whatsapp-web.js/Puppeteer)
#   • lib/remotionRender.js (Remotion — עיצוב סרטונים)
# בלי זה: Puppeteer/Remotion מנסים להוריד כרום שנבנה ל-glibc, שלא רץ על Alpine (musl) — נכשל בשקט.
# ttf-dejavu: אותו פונט ש-lib/aiaRender.js כבר מחפש כברירת מחדל (DejaVuSans.ttf) לכתוביות FFmpeg,
# ותומך גם בעברית בסיסית לכל טקסט שמצטייר בדפדפן עצמו.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-dejavu setpriv
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium-browser

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4420
# בתוך קונטיינר אין טעם לנסות להריץ Docker/PowerShell של המארח
ENV DISABLE_DOCKER_ORCHESTRATION=1

EXPOSE 4420

# בדיקת חיות
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4420/healthz >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
