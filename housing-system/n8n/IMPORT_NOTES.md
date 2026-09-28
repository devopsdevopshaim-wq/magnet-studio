# הערות ייבוא ותיקוף — WF01

ה‑JSON נכתב ידנית לפי n8n עדכני. גרסאות צמתים (typeVersion) ומבנה פרמטרים **זזים בין גרסאות n8n**.
אחרי הייבוא, עברו את הצ'קליסט:

## 1. Credentials (חובה)
- פתחו כל צומת Postgres → בחרו את ה‑credential `Postgres — dira` (במקום `REPLACE_POSTGRES_CRED_ID`).
- פתחו `Anthropic Chat Model` → בחרו `Anthropic account`.

## 2. מודל Claude
`Anthropic Chat Model` → שדה Model. אם `claude-sonnet-5` לא מופיע ברשימה — בחרו את דגם ה‑Sonnet העדכני
מהרשימה הנפתחת (n8n מושך אותה מה‑API). עדכנו גם את המחרוזת `model: 'claude-sonnet-5'` ב‑`Code: Compute Score`.

## 3. תיקוף לפני הפעלה
אם מחובר n8n-mcp:
```
validate_workflow  → תקנו כל error
n8n_get_workflow   → ודאו שכל ה-connections קיימים, במיוחד:
    Anthropic Chat Model --ai_languageModel--> Property Analyst Agent
    Anthropic Chat Model --ai_languageModel--> Structured Output Parser   (ל-autoFix)
    Structured Output Parser --ai_outputParser--> Property Analyst Agent
```
אם אין n8n-mcp: פתחו את ה‑Agent, ודאו שלוש נקודות חיבור מלאות (Model, Output Parser), ושה‑Parser עצמו
מחובר למודל (אייקון קטן מתחתיו).

## 4. הרצת בדיקה
1. `Code: Normalize` — אם המקור `nadlan` מחזיר מבנה אחר מהצפוי, פתחו את פלט `HTTP: Fetch Listings`,
   מצאו את שם מערך התוצאות, ועדכנו `list_path` ב‑`Set: Run Config` ואת `mapNadlan()` בהתאם.
2. הריצו `Execute Workflow` מה‑Manual Trigger. בדקו שכל item עובר עד `Done`.
3. `select id, city, price_ils, score, recommended_use from v_listings_public order by 4 desc nulls last;`

## 5. שינויים נפוצים שתצטרכו
- **Postgres upsert `outputColumns`** — אם הגרסה שלכם לא תומכת ב‑`options.outputColumns`, הסירו אותו;
  ה‑upsert עדיין יחזיר את השורה כולל `id`.
- **Set node** — אם `assignments` נראה אחר, בנו מחדש את השדות ידנית (כולם strings/numbers פשוטים).
- **Agent `typeVersion`** — n8n עשוי להציע "update"; אשרו.
- אם `require('crypto')` חסום ב‑Code node: החליפו את ה‑hash ב‑`content_hash` פשוט:
  `String(m.price_amount)+'|'+String(m.built_sqm)+'|'+String(m.rooms)`.

## 6. עלויות / ביצועים
- כל item = קריאת Claude אחת (~1-3K tokens קלט). לרוץ על 200 נכסים ≈ מאות אלפי טוקנים.
- לפני ה‑Agent אפשר להוסיף `Filter`: לדלג על נכסים ש‑`content_hash` שלהם כבר קיים ב‑DB (query קטן) —
  חוסך את רוב העלות בהרצות חוזרות.
