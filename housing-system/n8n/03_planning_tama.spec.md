# WF03 — Planning / Zoning / TAMA / Pinui-Binui (spec)

**מטרה**: לנקודה (כתובת / lat,lon / גוש,חלקה) — להחזיר מצב תכנוני מלא: תב"ע תקפה, ייעוד, זכויות בנייה,
תוכניות בהפקדה, בנייה עתידית ותשתיות תחבורה בסביבה, ופוטנציאל תמ"א 38 / פינוי‑בינוי.

## טריגר
`Execute Workflow Trigger` (כדי לשמש כ‑tool) **+** `Webhook` `GET /webhook/area/plan?...` לאתר.
קלט: `{ address? , lat? , lon? , gush? , helka? , authority? , year_built? , floors? , units_in_building? }`.

## שרשרת הצמתים

```
Trigger
 └─ IF: has lat/lon ?
     ├─ no  → HTTP: govmap geocode  (address → x,y → lat,lon,gush,helka)
     └─ yes → (skip)
 └─ HTTP: iplan Xplan query          (גיאומטריית נקודה → תוכניות מאושרות/בהפקדה)
 └─ HTTP: iplan land-use query       (ייעודי קרקע)
 └─ HTTP: mavat plan docs            (מספר תוכנית → תקנון/נספחים, טקסט)
 └─ HTTP: RMI tenders within radius  (מכרזי שיווק קרקע)
 └─ HTTP: renewal complexes layer    (מתחמי פינוי-בינוי מוכרזים)
 └─ Merge (combine, 6 inputs → אחד; שים לב: Merge ברירת מחדל 2 קלטים — הגדל ל-6 או שרשר)
 └─ Code: Pack Layers                (מארז layers = {plans, landuse, mavat, rmi, infra})
 └─ Planning & Zoning Analyst Agent  (PROMPTS §4 ; parser+autoFix)
 └─ Assess Urban Renewal Agent       (PROMPTS §5 ; מקבל planning_summary מהסוכן הקודם + year_built/floors)
 └─ Code: Merge Results
 └─ Postgres: upsert plans           (cache לפי gush/helka; TTL 90 יום)
 └─ Respond to Webhook / return to caller
```

### נקודות קצה (מ‑`docs/DATA_SOURCES.md`)
- geocode: `https://ags.govmap.gov.il/Search/FreeSearch?searchText=<address>`  → ואז `https://ags.govmap.gov.il/Identify/IdentifyByXY`
- תוכניות: `https://ags.iplan.gov.il/arcgis/rest/services/PlanningPublic/Xplan/MapServer/identify` — `geometry={x,y}`, `geometryType=esriGeometryPoint`, `sr=2039`, `layers=all`, `tolerance=5`, `f=json`
- mavat: `https://mavat.iplan.gov.il/rest/api/SV3/1?...` (חיפוש תוכנית לפי מיקום)
- RMI: `https://apps.land.gov.il/MichrazimSite/api/SearchApi/Search` (POST, גבולות מפה)

> כל צומת HTTP: `onError: continueRegularOutput`, `alwaysOutputData: true` — שכבה שנופלת לא מפילה את הניתוח;
> הסוכן מקבל את מה שיש ומדווח `data_gaps_he`.

## פלט
מבנה מ‑`PROMPTS §4` (active_plan, land_use, building_rights, pending_plans_nearby, future_construction, impact_on_value)
+ מבנה מ‑`§5` (tama38, pinui_binui, buyer_impact).

## חשיפה כ‑tools
- `Analyze area plan` → פרמטרים `address | lat,lon | gush,helka`.
- `Assess urban renewal` → פרמטרים `address, year_built, floors, units_in_building`.
