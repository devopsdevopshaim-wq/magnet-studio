# WF02 — Mortgage Eligibility + Buyer Match (spec)

**מטרה**: לפי הכנסת שני בני הזוג, הון, התחייבויות, גיל ומטרת הנכס — לחשב זכאות/יכולת, מבחן לחץ, תמהיל מומלץ,
ולהתאים נכסים מהמאגר לתקציב שהתקבל.

## טריגר
`Webhook` — `POST /webhook/mortgage/evaluate`, header auth `x-api-token = $env.PUBLIC_API_TOKEN`.
Body: ראה "קלט" ב‑`docs/PROMPTS.md §6`.

## שרשרת הצמתים

```
Webhook
 └─ Code: Validate Input            (בדיקת שדות חובה, טווחים; 400 אם חסר)
 └─ Set: Mortgage Params            (הפרמטרים מ-docs/MORTGAGE_RULES.md — ניתן לעדכן בלי קוד)
 └─ Code: Deterministic Calc        (הפסאודו-קוד מ-MORTGAGE_RULES.md → אובייקט calc)
 └─ Code: Eligibility Points        (ניקוד זכאות משרד השיכון לפי מצב משפחתי/ילדים/שירות/עולה)
 └─ Mortgage Advisor Agent          (system+schema = PROMPTS §6 ; model=Claude ; parser+autoFix)
 └─ (אופציונלי) Postgres: Search Listings In Budget
        SELECT * FROM v_listings_public
        WHERE city = $1 AND deal_type='sale'
          AND price_ils <= $2         -- calc.max_property_price
        ORDER BY score DESC LIMIT 15
 └─ Code: Assemble Response         (calc + advice + matched_listings)
 └─ Postgres: Insert mortgage_profiles   (audit)
 └─ Respond to Webhook              (JSON)
 (Error branch → Respond to Webhook 500 + ingest_errors)
```

## פרטי צמתים

- **Code: Validate Input** — דורש לפחות `income_a_ils` או `income_b_ils`, `equity_ils`, `purpose`. ממיר `purpose` מהאתר (`מגורים/משפר/משקיע`) ל‑`residence/upgrade/investment`.
- **Set: Mortgage Params** — assignments: `LTV_SINGLE=0.75`, `LTV_UPGRADE=0.70`, `LTV_INVESTMENT=0.50`, `DTI_MAX_HARD=0.50`, `DTI_TARGET=0.35`, `TERM_MAX_YEARS=30`, `BASE_RATE_ANNUAL=0.05`, `STRESS_DELTA=0.02`, `MAX_AGE_AT_END=80`.
- **Code: Deterministic Calc** — מעתיק את הפונקציה מ‑`docs/MORTGAGE_RULES.md` ("פסאודו‑קוד") 1:1. פלט `calc`.
- **Mortgage Advisor Agent** — `promptType: define`, `text` = ה‑User template מ‑§6 עם `{{ }}` על שדות ה‑webhook + `{{ JSON.stringify($json.calc) }}`. `hasOutputParser: true`. Structured schema = הפלט מ‑§6.
- **אין human review** — הכלי לא מבצע פעולה חיצונית בלתי הפיכה. רק חישוב והמלצה.

## פלט (מוחזר לאתר)
```jsonc
{
  "calc": { /* max_property_price, max_loan_final, required_equity, monthly_payment_at_base_rate,
              monthly_payment_at_stress_rate, dti_at_base, dti_at_stress, stress_test_pass, ... */ },
  "eligibility_points": 1600,
  "advice": { /* הפלט המובנה מ-PROMPTS §6: eligibility_summary, recommended_mix[], action_items_he, explanation_he */ },
  "matched_listings": [ { "id": "...", "city": "...", "price_ils": 0, "score": 0, "market_gap_pct": 0 } ]
}
```

## חשיפה כ‑tool לסוכן המנצח
עטוף כ‑`toolWorkflow` בשם `Evaluate mortgage` עם ה‑description מ‑`PROMPTS §8`. פרמטרי `fromAi`:
`income_a_ils, income_b_ils, other_income_ils, monthly_obligations_ils, equity_ils, max_age, purpose, property_price_ils, city`.
