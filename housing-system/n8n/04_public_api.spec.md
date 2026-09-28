# WF04 — Public API for the website (spec)

n8n workflow אחד עם מספר `Webhook` nodes (או webhook אחד + Switch על `path`). כל תשובה JSON, CORS מוגדר,
אימות `x-api-token = $env.PUBLIC_API_TOKEN`, rate-limit ב‑Caddy / Code counter.

| Method + Path | תיאור | לוגיקה | פלט |
|---|---|---|---|
| `GET /webhook/search` | חיפוש נכסים | Postgres SELECT מ‑`v_listings_public` לפי query params (`city, deal_type, price_min, price_max, rooms_min, rooms_max, furnished, country, sort=score`) LIMIT 30 | `{ items: [...], count }` |
| `GET /webhook/listing/:id` | נכס בודד + enrichment | SELECT מ‑`v_listings_public` WHERE id; + אופ' `Analyze area plan` tool | אובייקט נכס מלא |
| `POST /webhook/compare` | השוואת 2‑6 נכסים | SELECT הנכסים לפי `listing_ids[]` → **Comparison Agent** (`PROMPTS §3`) | `{ matrix, scores, recommendation }` |
| `POST /webhook/mortgage/evaluate` | זכאות משכנתא | קורא ל‑WF02 (`Execute Workflow`) | פלט WF02 |
| `GET /webhook/area/:id/plan` | מצב תכנוני של אזור | קורא ל‑WF03; אם ב‑cache (`plans`) — מחזיר משם | פלט WF03 |
| `POST /webhook/areas/match` | דירוג אזורים לפרופיל | SELECT מ‑`areas` (סינון עיר/מדינה) → **Area Matcher Agent** (`PROMPTS §7`) | `{ ranked_areas, top_pick_area_id }` |
| `POST /webhook/assistant` | הצ'אט של האתר | **Master Assistant Agent** (`PROMPTS §8`) עם memory לפי `sessionId` + כל ה‑tools | `{ reply_markdown, cards?[], session_id }` |

## הצ'אט (assistant) — טופולוגיה
Workflow "shell" קטן: `Webhook → Code: strip/validate → Master Assistant Agent → Respond`.
ה‑Agent:
- `model`: Anthropic Chat Model (`claude-sonnet-5`, temp 0.3).
- `memory`: `memoryBufferWindow`, `sessionKey = {{ $json.sessionId }}`, N=20. (בפרוד: `memoryPostgres` כדי שהאתר יציג היסטוריה.)
- `tools` (כולם `toolWorkflow`): `Search listings`, `Get listing details`, `Compare listings`, `Analyze area plan`, `Assess urban renewal`, `Match areas to profile`, `Evaluate mortgage` — שמות + descriptions מדויקים מ‑`PROMPTS §8`.
- `outputParser`: אופציונלי. עדיף פלט טקסט markdown + בלוק `cards` JSON בסוף שהאתר מפרסר, או structured output עם `{ reply_markdown, cards[] }`.

## אבטחה
- כל ה‑webhookים: header auth, ולוג ל‑`ingest_errors` על כשל.
- הסוכן לא מקבל כלים שמבצעים פעולה חיצונית — אם יתווסף (יצירת ליד, יצירת קשר עם מתווך, תשלום) → לעטוף ב‑HITL (`slackHitlTool` / `gmailHitlTool`) לפי `n8n-agents §Human review`.
- CORS: `Access-Control-Allow-Origin` = דומיין האתר בלבד.
