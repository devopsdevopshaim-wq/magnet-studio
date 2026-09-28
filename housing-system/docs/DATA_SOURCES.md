# DATA_SOURCES — מקורות נתונים ונקודות קצה

> חוקיות לפני הכול. עמודה "מעמד" מסמנת מה מותר ללא הסכם מיוחד.

## ישראל — מקורות מורשים (ברירת מחדל של המערכת)

| מקור | מה יש | נקודת קצה / גישה | מעמד | הערות |
|---|---|---|---|---|
| **נדל"ן — רשות המסים** (`nadlan.gov.il`) | עסקאות מכר בפועל: כתובת, גוש/חלקה, מחיר, שטח, תאריך, שנת בנייה | API פנימי `nadlan.gov.il/Nadlan.REST/Main/GetAssessmentAndDetails` + `GetDataByQuery` (JSON, לפי עיר/שכונה/גוש) | ציבורי, שימוש הוגן | הבסיס להערכת שווי ו‑₪/מ"ר אמיתי. אין תיעוד רשמי — סקור מבנה תשובה מול הכלי. |
| **data.gov.il** | דאטהסטים: היתרי בנייה, מדד מחירי דירות (הלמ"ס), אזורים סטטיסטיים | CKAN API `https://data.gov.il/api/3/action/datastore_search?resource_id=...` | ציבורי, רישיון פתוח | חפש resource: "עסקאות נדל"ן", "היתרי בנייה". |
| **מנהל התכנון — iplan / תב"ע** | תוכניות מתאר/מפורטות, ייעודי קרקע, זכויות בנייה, סטטוס (מאושר/הפקדה) | ArcGIS REST: `https://ags.iplan.gov.il/arcgis/rest/services/PlanningPublic/Xplan/MapServer/` — `query` לפי גיאומטריה | ציבורי | שכבות: תוכניות מאושרות, בהפקדה, קו כחול, ייעודים. |
| **מבא"ת / mavat** (`mavat.iplan.gov.il`) | מסמכי תוכנית, תקנון, נספחים | REST `https://mavat.iplan.gov.il/rest/api/...` | ציבורי | לשליפת מספר תוכנית ומסמכים לפי מיקום. |
| **govmap** | גוש/חלקה מ‑lat/lon, שכבות GIS | `https://ags.govmap.gov.il/Search` + `https://open.govmap.gov.il/` | ציבורי | geocoding הפוך גוש/חלקה. |
| **רמ"י (רשות מקרקעי ישראל)** | מכרזי קרקע, שיווק, תוכניות שיווק עתידיות | `https://apps.land.gov.il/MichrazimSite/` + open data ב‑data.gov.il | ציבורי | "בנייה עתידית ותוכניות עבודה". |
| **הלמ"ס** | מדד מחירי דירות, למחירי שכירות, דמוגרפיה לפי אזור | `https://api.cbs.gov.il/index/data/...` | ציבורי | לנרמול מגמת מחירים. |
| **פרויקטים — פינוי‑בינוי / התחדשות עירונית** | מתחמים מוכרזים, סטטוס | הרשות להתחדשות עירונית — datasets ב‑data.gov.il; אתרי עיריות | ציבורי | חלקי; משלימים ב‑Claude מתוך מסמכי תוכנית. |

## ישראל — נכסים בכינוס / הוצאה לפועל / מכירות בנקים

| מקור | מה יש | גישה | מעמד |
|---|---|---|---|
| **רשות האכיפה והגבייה (הוצל"פ)** | נכסים למכירה בהליכי הוצאה לפועל, מכרזים ומכירות פומביות | `https://www.gov.il/he/departments/the_enforcement_and_collection_authority` + פורטל המכירות | ציבורי |
| **כונסי נכסים (עו"ד שמונו)** | מודעות מכר לפי צו בית משפט — לרוב מפורסמות בעיתונות ובאתרי המשרדים | אין מאגר מרכזי; scraping ממוקד של מודעות "כונס"/"מימוש" + חיפוש ממוקד | אפור — מודעה פומבית, אך בדוק ToS של כל אתר |
| **בנקים — נכסים למכירה** | נכסים ממימוש שעבוד (לאומי, פועלים, דיסקונט, מזרחי) | עמודי "נכסים למכירה" באתרי הבנקים | ציבורי |
| **לוחות — תיוג "כונס"** | חלק מהמודעות ביד2/מדלן מסומנות ככונס/מימוש | דרך אותו feed שותפים של הלוחות | כפוף ל‑ToS |

ב‑`sources` config: `kind: "receiver"`, ו‑Enrichment מוסיף שדות `receiver_process` (כינוס/הוצל"פ/בנק), `encumbrances`, `deposit_required`, `court_approval`. ה‑Property Analyst מוסיף אזהרת as‑is + עלות שכ"ט כונס (~2%+מע"מ) לחישוב העלות האפקטיבית.

## ישראל — מקורות מוגבלים (דורש הסכם / ספק מורשה)

| מקור | מעמד | דרך מותרת |
|---|---|---|
| **יד2** | ToS אוסר scraping; אין API ציבורי | Yad2 for Business / feed שותפים, או ספק נתונים מורשה (Apify actor עם אחריות המשתמש, Bright Data). המערכת קוראת דרך צומת גנרי `Fetch: partner_feed`. |
| **מדלן (Madlan)** | ToS אוסר scraping; חלק מהמידע התכנוני שלהם ממילא נגזר מ‑iplan | קח את המקור הראשוני (iplan/nadlan) במקום. לניתוח שכונתי — Madlan API מסחרי אם תחתום. |
| לוחות אחרים (הומלס, WinWin, komo) | דומה | feed שותפים / ספק מורשה |

## חו"ל

| מדינה | מקור | API | מעמד |
|---|---|---|---|
| ספרד/פורטוגל/איטליה | **Idealista** | REST OAuth2 `https://api.idealista.com/3.5/{country}/search` — **דורש בקשת מפתח ומגבלת קריאות** | רשמי, מוגבל קצב |
| בריטניה | **Rightmove / Zoopla** | אין API ציבורי. Zoopla יש API היסטורי סגור; Rightmove דרך שותפים בלבד | דורש שותפות / ספק מורשה |
| ארה"ב | **Zillow** | Bridge Interactive / Zillow API — נדל"ן דרך MLS, תנאים מחמירים; `RapidAPI` actors לא רשמיים | דורש הסכם MLS |
| כללי | **Realtor / Redfin / PAP / ImmoScout** | חלקם API שותפים | לפי מדינה |
| חלופה חוקית רוחבית | **Apify Store actors** ל‑Zillow/Rightmove/Idealista | הרצה דרך צומת Apify ב‑n8n | האחריות לעמידה ב‑ToS על מריץ ה‑actor — קבל ייעוץ |

## תבנית הגדרת מקור ב‑WF01

כל מקור מתואר ברשומת config אחת (נטענת מ‑`Set: Run Config` או מטבלת `sources`):

```jsonc
{
  "key": "gov_il_nadlan",
  "country": "IL",
  "kind": "transactions",           // transactions | listings
  "base_url": "https://nadlan.gov.il/Nadlan.REST/Main/GetDataByQuery",
  "auth": null,                      // או { "type":"header", "cred":"idealista_oauth" }
  "method": "POST",
  "body_template": { "query": "={{ $json.city }}", "page": "={{ $json.page }}" },
  "list_path": "AllResults",         // JMESPath לרשימה בתשובה
  "page_param": "page",
  "max_pages": 20,
  "map": "nadlan"                    // איזו פונקציית נרמול ב‑Code node
}
```

הוספת מקור חדש = הוספת רשומת config + ענף `case` ב‑Switch + פונקציית `map<Source>()` ב‑Code node. שאר ה‑pipeline זהה.
