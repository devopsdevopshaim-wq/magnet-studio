# MORTGAGE_RULES — חוקי משכנתא דטרמיניסטיים (Code node ב‑WF02)

> מבוסס על הוראות בנק ישראל (נכון לעדכון זה — **אמת מול המקור לפני פרודקשן**, הפרמטרים משתנים).
> ה‑Code node מחשב את המספרים; סוכן ה‑AI רק מסביר ובונה תמהיל.

## פרמטרים (חשופים ב‑`Set: Mortgage Params` כדי לעדכן בלי לגעת בקוד)

| פרמטר | ערך ברירת מחדל | הערה |
|---|---|---|
| `LTV_SINGLE` | 0.75 | דירה יחידה |
| `LTV_UPGRADE` | 0.70 | משפר דיור (עם התחייבות למכור דירה קודמת בתוך פרק זמן) |
| `LTV_INVESTMENT` | 0.50 | דירה נוספת / משקיע |
| `DTI_MAX_HARD` | 0.50 | מעל — הבנק אינו רשאי לאשר |
| `DTI_TARGET` | 0.35 | יעד שמרני להמלצה |
| `TERM_MAX_YEARS` | 30 | תקופה מקסימלית |
| `PRIME_MIN_SHARE` | 0.33 | מינימום מסלול שאינו בריבית קבועה... (למעשה: לפחות 1/3 בריבית משתנה מוגבל; מגבלת פריים מקס' בוטלה — עדכן) |
| `BASE_RATE_ANNUAL` | 0.05 | ריבית בסיס משוקללת להערכת החזר (עדכן לפי שוק) |
| `STRESS_DELTA` | 0.02 | תוספת ריבית למבחן לחץ |
| `MAX_AGE_AT_END` | 80 | גיל הלווה בתום התקופה → מגביל term |

## פסאודו‑קוד

```js
// קלט: income_a, income_b, other_income, monthly_obligations, equity, max_age,
//       purpose ('residence'|'upgrade'|'investment'), property_price, params

const netIncome = income_a + income_b + other_income;

// 1. קטגוריית לווה → LTV
const ltvByPurpose = { residence: params.LTV_SINGLE, upgrade: params.LTV_UPGRADE, investment: params.LTV_INVESTMENT };
const max_ltv_pct = ltvByPurpose[purpose];

// 2. תקופה מקסימלית לפי גיל
const term_years = Math.min(params.TERM_MAX_YEARS, params.MAX_AGE_AT_END - max_age);

// 3. הלוואה מקסימלית לפי LTV (על בסיס מחיר הנכס המבוקש)
const max_loan_by_ltv = property_price * max_ltv_pct;

// 4. הלוואה מקסימלית לפי יחס החזר (DTI). החזר פנוי = netIncome*DTI_MAX_HARD - obligations
const affordable_payment_hard   = netIncome * params.DTI_MAX_HARD   - monthly_obligations;
const affordable_payment_target = netIncome * params.DTI_TARGET     - monthly_obligations;

// annuity: PMT -> principal.  r = monthly rate, n = term months
function loanFromPayment(pmt, annualRate, years) {
  const r = annualRate / 12, n = years * 12;
  if (pmt <= 0) return 0;
  return pmt * (1 - Math.pow(1 + r, -n)) / r;
}
const max_loan_by_dti        = loanFromPayment(affordable_payment_hard,   params.BASE_RATE_ANNUAL, term_years);
const recommended_loan_by_dti = loanFromPayment(affordable_payment_target, params.BASE_RATE_ANNUAL, term_years);

// 5. הלוואה סופית = מינימום מבין המגבלות, וגם לא יותר ממה שההון העצמי מאפשר
const max_loan_by_equity = property_price - equity;                       // הבנק לא ייתן יותר מהפער
const max_loan_final = Math.max(0, Math.min(max_loan_by_ltv, max_loan_by_dti, max_loan_by_equity));

// 6. מחיר נכס מקסימלי שאפשר לרכוש בכלל (לא תלוי במחיר המבוקש)
//    כפוף גם ל‑LTV וגם ל‑DTI:
const price_cap_by_ltv = equity / (1 - max_ltv_pct);                      // ההון חייב לכסות (1-LTV)
const loan_cap_by_dti  = loanFromPayment(affordable_payment_hard, params.BASE_RATE_ANNUAL, term_years);
const max_property_price = Math.min(price_cap_by_ltv, equity + loan_cap_by_dti);

const required_equity = Math.max(property_price * (1 - max_ltv_pct), property_price - max_loan_final);

// 7. החזר חודשי בפועל להלוואה שנבחרה (min(המבוקש, המקסימלי))
function paymentFromLoan(principal, annualRate, years) {
  const r = annualRate / 12, n = years * 12;
  return principal * r / (1 - Math.pow(1 + r, -n));
}
const chosen_loan = Math.min(max_loan_final, Math.max(0, property_price - equity));
const monthly_payment_at_base_rate   = paymentFromLoan(chosen_loan, params.BASE_RATE_ANNUAL, term_years);
const monthly_payment_at_stress_rate = paymentFromLoan(chosen_loan, params.BASE_RATE_ANNUAL + params.STRESS_DELTA, term_years);

// 8. יחסי DTI ומבחן לחץ
const dti_at_base   = (monthly_payment_at_base_rate   + monthly_obligations) / netIncome;
const dti_at_stress = (monthly_payment_at_stress_rate + monthly_obligations) / netIncome;
const stress_test_pass = dti_at_stress <= params.DTI_MAX_HARD;

// 9. ניקוד זכאות משרד השיכון — טבלת נקודות (מצב משפחתי, ילדים, שנות נישואין, אחים, שירות צבאי, עולה חדש).
//    מיושם כפונקציה נפרדת eligibilityPoints(profile) → מספר; מעל סף מסוים פותח מסלול "זכאות".

return {
  max_ltv_pct, term_years,
  max_loan_by_ltv, max_loan_by_dti, max_loan_by_equity, max_loan_final,
  max_property_price, required_equity,
  monthly_payment_at_base_rate, monthly_payment_at_stress_rate,
  dti_at_base, dti_at_stress, stress_test_pass,
  base_rate: params.BASE_RATE_ANNUAL, stress_rate: params.BASE_RATE_ANNUAL + params.STRESS_DELTA,
  borrower_category: purpose,
  can_afford_requested: chosen_loan >= (property_price - equity) - 1 && stress_test_pass
};
```

## תמהיל (הסוכן בונה, כאן רק מסגרת ברירת מחדל)

| פרופיל סיכון | פריים (משתנה) | קבועה לא צמודה | משתנה כל 5 (צמודה) |
|---|---|---|---|
| שמרן | 33% | 50% | 17% |
| מאוזן | 40% | 35% | 25% |
| אגרסיבי / מתכנן מיחזור | 50% | 20% | 30% |

מגבלות רגולטוריות שהסוכן חייב לכבד: לפחות ~1/3 מהתיק לא במסלול שמגיב מיידית לריבית; תקופה ≤ 30 שנה; DTI ≤ 50%.
