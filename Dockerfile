# הפנקס היומי — שרת מקומי חוצה-פלטפורמות.
# בנייה:   docker build -t magnet-studio .
# הרצה:    docker compose up -d   (מומלץ — ראו docker-compose.yml)

FROM node:22-alpine

# tini לניהול תקין של אותות עצירה
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

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
