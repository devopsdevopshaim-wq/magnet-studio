# ARCHITECTURE — DiraFinder

## 1. תמונה כללית

```
                          ┌─────────────────────────────────────────────┐
   מקורות נתונים          │                  n8n (self-hosted)          │
 ┌───────────────┐        │                                             │
 │ nadlan/gov.il │──┐     │  WF01  Ingest → Normalize → Claude Enrich →  │      ┌──────────────┐
 │ iplan / mavat │  ├────▶│        Score → Upsert                        │─────▶│  Postgres     │
 │ RMI (רמ"י)    │  │     │                                             │      │  (listings,   │
 │ Apify actor   │──┤     │  WF02  Mortgage Eligibility + Buyer Match    │◀────▶│  enriched,    │
 │ Idealista API │  │     │  WF03  Planning / TAMA / Pinui-Binui         │      │  areas, plans)│
 │ Rightmove(*)  │──┘     │  WF04  Public API (Webhook)  ◀───────────────┼──────┤              │
 └───────────────┘        │                                             │      └──────────────┘
                          │  Sub-nodes: Anthropic Chat Model (Claude),  │             ▲
                          │  Structured Output Parser (+autoFix)        │             │
                          └─────────────────────────────────────────────┘             │
                                              ▲                                       │
                                              │  REST/JSON                            │
                                   ┌──────────┴───────────┐                           │
                                   │   אתר (Next.js)      │───────────────────────────┘
                                   │  חיפוש · השוואה ·    │   קורא ישירות מ‑DB (read replica)
                                   │  מחשבון משכנתא ·     │
                                   │  מפת תב"ע/תמ"א       │
                                   └──────────────────────┘
```

(*) Rightmove אין API ציבורי — דורש שותפות או ספק מורשה. ראה DATA_SOURCES.

## 2. שכבות

| שכבה | טכנולוגיה | תפקיד |
|---|---|---|
| Ingestion | n8n HTTP Request / Apify node | משיכת רשומות גולמיות ממקור, pagination, rate‑limit |
| Normalization | n8n Code node (JS) | סכימה אחידה `NormalizedListing`, המרות מטבע/יחידות, dedupe key |
| Enrichment | Claude via Agent + Structured Output | הערכת שווי, ₪/מ"ר, ריהוט, דיור מול השקעה, דגלים אדומים |
| Geo/Planning | n8n HTTP → ArcGIS REST (iplan) | חיתוך גוש/חלקה → תב"ע פעילה, ייעוד, זכויות בנייה, סטטוס תמ"א |
| Scoring | n8n Code node | ציון מנורמל 0‑100: מחיר יחסי, גודל, שטח, אזור, פוטנציאל |
| Mortgage | n8n Code (דטרמיניסטי) + Claude (הסבר/תמהיל) | זכאות, יחס החזר, מבחן לחץ, LTV, תמהיל מומלץ |
| Storage | Postgres 16 | מקור אמת; האתר קורא מ‑read replica / view |
| Semantic search (אופ') | Qdrant + Anthropic-compatible embeddings | "דירה שקטה עם מרפסת קרוב לים" → תוצאות |
| Presentation | Next.js + Mapbox/govmap | חיפוש, השוואה, מחשבון, שכבות תכנון |

## 3. סכימת הנתונים המנורמלת (`NormalizedListing`)

```jsonc
{
  "source": "gov_il|yad2|madlan|idealista|apify:<actor>",
  "source_id": "string",          // מזהה במקור
  "url": "string",
  "scraped_at": "ISO-8601",
  "country": "IL|ES|UK|US|...",
  "deal_type": "sale|rent",
  "address": { "raw": "", "city": "", "neighborhood": "", "street": "", "house_no": "" },
  "geo": { "lat": 0, "lon": 0, "gush": "", "helka": "" },
  "price": { "amount": 0, "currency": "ILS", "amount_ils": 0 },
  "size": { "built_sqm": 0, "plot_sqm": null, "rooms": 0, "floor": 0, "total_floors": 0 },
  "attributes": {
    "furnished": "yes|partial|no|unknown",
    "parking": 0, "balcony_sqm": null, "elevator": null,
    "condition": "new|good|renovated|needs_renovation|unknown",
    "property_kind": "apartment|garden_apt|penthouse|house|duplex|lot|commercial"
  },
  "raw": { /* payload מקורי לצורך audit */ }
}
```

לאחר Enrichment נוסף `enrichment` (ראה `PROMPTS.md §2`) ו‑`score` (ראה §5 למטה).

## 4. WF01 — הזרימה העובדת (`n8n/01_ingest_enrich_score.json`)

```
Schedule Trigger (yיומי 06:00)
  └─▶ Set: Run Config            (source, city, deal_type, max_pages, currency_target=ILS)
      └─▶ Switch by source ──▶ HTTP Request: Fetch page N   (pagination via loop)
              └─▶ Code: Normalize → NormalizedListing[]
                  └─▶ Filter: dedupe (source+source_id not in DB / stale > 7d)
                      └─▶ (per item) AI Agent: Property Analyst
                            model:  Anthropic Chat Model (claude-sonnet-5)
                            parser: Structured Output (+autoFix, fixer=claude-sonnet-5)
                          └─▶ Code: Compute Score
                              └─▶ Postgres: upsert listings + listings_enriched
                                  └─▶ NoOp: run summary
      (Error Trigger → Code: format → Postgres: ingest_errors)
```

הרחבות עתידיות מתחברות לאותו pipeline: אחרי Normalize מוסיפים HTTP→iplan (WF03 כ‑sub‑workflow tool), ואחרי Score קריאה ל‑WF02.

## 5. אלגוריתם הניקוד (Score)

ציון 0‑100 = ממוצע משוקלל של תת‑ציונים מנורמלים מול קבוצת ההשוואה (אותה עיר + טווח חדרים ±1 + אותו deal_type):

| רכיב | משקל | חישוב |
|---|---|---|
| `price_vs_market` | 0.30 | z‑score הפוך של ₪/מ"ר מול חציון הקבוצה |
| `size_fit` | 0.15 | קרבה ל‑built_sqm המבוקש בפרופיל הקונה |
| `plot_bonus` | 0.10 | plot_sqm יחסי (רלוונטי לבתים/מגרשים) |
| `area_quality` | 0.20 | ציון אזור (`areas.quality_score` — נגזר מ‑gov data: עסקאות, ביקוש, מרחק תחבורה) |
| `future_upside` | 0.15 | תמ"א/פינוי‑בינוי מאושר/בהליך + זכויות בנייה עודפות (WF03) |
| `condition_furnish` | 0.10 | condition + furnished מול ההעדפה |

הנוסחה, המשקלים והפרמטרים חשופים ב‑`Set: Scoring Weights` כדי שהאתר יוכל להעביר משקלים אישיים.

## 6. WF02 — Mortgage Eligibility + Buyer Match (מפרט: `n8n/02_mortgage_and_match.spec.md`)

Webhook `POST /mortgage/evaluate` → Code (חוקי בנק ישראל, `docs/MORTGAGE_RULES.md`) → Agent "Mortgage Advisor" (הסבר + תמהיל) → Structured Output → תשובה.
קלט: הכנסה נטו בן + בת זוג, הון עצמי, התחייבויות קיימות, גיל, מטרת נכס (מגורים/משקיע/משפר דיור), מחיר נכס.
פלט: `max_property_price`, `max_loan`, `ltv_allowed`, `monthly_payment_estimate`, `dti_ratio`, `stress_test_pass`, `recommended_mix[]`, `explanation`.

## 7. WF03 — Planning / TAMA (מפרט: `n8n/03_planning_tama.spec.md`)

קלט: `lat/lon` או `gush/helka` → HTTP ל‑ArcGIS REST של iplan/mavat + govmap → Agent "Planning Analyst" מסכם:
תב"ע פעילה + מספר, ייעוד קרקע, זכויות בנייה מול מצב קיים, תוכניות בהפקדה, מתחמי פינוי‑בינוי / תמ"א 38 מוכרזים, בנייה עתידית מתוכננת ברדיוס.

## 8. WF04 — Public API (מפרט: `n8n/04_public_api.spec.md`)

Webhook endpoints שהאתר צורך:
`GET /search`, `GET /listing/:id`, `POST /compare` (מקבל מזהים → טבלת השוואה + סוכן "Comparison"),
`POST /mortgage/evaluate`, `GET /area/:id/plan`, `POST /assistant` (הסוכן המנצח — chat).

## 9. אבטחה ותפעול

- כל המפתחות ב‑n8n Credentials בלבד — לא ב‑Set nodes.
- Webhookים מאחורי header‑auth + rate limit ב‑Caddy.
- `n8n_audit_instance` לפני העלאה לפרודקשן.
- גיבוי: `pg_dump` יומי + export של ה‑workflows ל‑git.
- עלויות Claude: batch של Enrichment, cache של system prompt, דילוג על רשומות שלא השתנו (hash).
