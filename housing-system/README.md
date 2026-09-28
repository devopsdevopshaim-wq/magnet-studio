# DiraFinder — מערכת חכמה למציאת דיור (n8n + Claude)

מערכת המבוססת על **n8n (self‑hosted)** + **Anthropic Claude** שאוספת נכסים ממקורות שונים (ישראל + חו"ל),
מנרמלת אותם, מעשירה אותם ב‑AI, ומחשבת: השוואת מחיר/אזור/גודל/שטח, זכאות ותמהיל משכנתא לפי הכנסת בני הזוג,
מתאר אזורי ותב"ע, בנייה עתידית, ותוכניות תמ"א 38 / פינוי‑בינוי. בהמשך — אתר שנותן גישה מלאה לכל היכולות.

> **גרסה זו (V1)** כוללת: ארכיטקטורה מלאה · workflow אחד עובד מקצה‑לקצה (`n8n/01_ingest_enrich_score.json`) ·
> ספריית פרומפטים מלאה לכל הסוכנים (`docs/PROMPTS.md`) · תשתית Docker · סכימת DB.

## מבנה התיקייה

| נתיב | תיאור |
|---|---|
| `docs/ARCHITECTURE.md` | ארכיטקטורה, זרימות, רשימת כל ה‑workflows |
| `docs/DATA_SOURCES.md` | מקורות נתונים, נקודות קצה, והערות משפטיות/ToS חשובות |
| `docs/PROMPTS.md` | **כל הפרומפטים המלאים** לכל סוכן — system prompt, template, ו‑JSON schema |
| `docs/MORTGAGE_RULES.md` | חוקי זכאות/החזר/מבחן לחץ דטרמיניסטיים (בנק ישראל) + פסאודו‑קוד |
| `n8n/01_ingest_enrich_score.json` | ה‑workflow העובד: איסוף → נרמול → העשרת Claude → ניקוד → אחסון |
| `n8n/02_mortgage_and_match.spec.md` | מפרט ל‑workflow זכאות משכנתא + התאמת נכס לקונה |
| `n8n/03_planning_tama.spec.md` | מפרט ל‑workflow תב"ע / מתאר / תמ"א / פינוי‑בינוי |
| `n8n/04_public_api.spec.md` | מפרט ל‑API שהאתר יצרוך |
| `infra/docker-compose.yml` | n8n + Postgres + (אופ') Qdrant לחיפוש סמנטי |
| `infra/.env.example` | משתני סביבה |
| `db/schema.sql` | טבלאות: listings, listings_enriched, areas, plans, mortgage_profiles |

## התקנה מהירה (self‑hosted)

```bash
cd infra
cp .env.example .env
# ערוך .env: ANTHROPIC_API_KEY, מפתחות מקורות נתונים, סיסמת DB, דומיין
docker compose up -d
```

1. פתח `https://<DOMAIN>` → צור משתמש owner ב‑n8n.
2. **Credentials**: הוסף `Anthropic API` (מ‑`ANTHROPIC_API_KEY`), `Postgres` (מ‑compose), וכל מפתח מקור נתונים.
3. ייבא את `n8n/01_ingest_enrich_score.json` (Workflows → Import from File).
4. הרץ `db/schema.sql` מול Postgres (`docker compose exec db psql -U n8n -d dira -f /schema.sql`).
5. ב‑workflow: פתח את צומת **Set – Run Config**, בחר מקור (`yad2` / `madlan` / `gov_il` / `abroad`), הרץ Execute Workflow.
6. בדוק תוצאות: `select * from listings_enriched order by created_at desc limit 20;`

## אזהרה משפטית (חובה לקרוא)

איסוף אוטומטי (scraping) מ‑**יד2** ו‑**מדלן** מפר בדרך כלל את תנאי השימוש שלהם וייתכן שאסור לפי חוק המחשבים / זכויות יוצרים במאגר.
המערכת בנויה כך ש**כברירת מחדל היא משתמשת רק במקורות מורשים**: נתוני עסקאות נדל"ן ממשלתיים (nadlan / data.gov.il),
שכבות תכנון של מנהל התכנון (iplan/mavat), ו‑API רשמי / ספק מורשה (Apify/Bright Data עם הסכמה) לשאר.
ראה `docs/DATA_SOURCES.md`. אחריות השימוש עליך.
