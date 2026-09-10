// lib/financeAdvisor.js — מצפן פיננסי: בודק מצב כלכלי ובונה תוכנית התנהלות מבוססת-עקרונות.
// חינוכי בלבד. אינו ייעוץ השקעות, אינו ייעוץ פנסיוני, אינו המלצת מוצר.
// כל החישובים מקומיים. התוכנית המילולית דרך שרשרת ה-AI המקומית.

const { askAI } = require("./dailyNarrative");

// עקרונות מקובלים (Ramsey, Bogleheads, CFPB, רשות שוק ההון, פסגות/בנק ישראל — עדכני 2026):
const KB = [
  "תקציב: מסגרת 50/30/20 — 50% צרכים, 30% רצונות, 20% חיסכון והחזר חוב. מתאימים לפי הכנסה. הכלל החשוב: להוציא פחות ממה שמכניסים, כל חודש.",
  "קרן חירום: 3–6 חודשי הוצאות בפיקדון נזיל וזמין (עו״ש/פק״מ). לעצמאי או הכנסה לא יציבה — 6–9 חודשים. זו העדיפות הראשונה אחרי כיסוי חוב יקר.",
  "חוב: קודם כל חוב יקר (אשראי חוץ-בנקאי, מסגרת עו״ש, כרטיס אשראי בריבית) — שיטת 'מפולת' (הריבית הגבוהה קודם) חוסכת הכי הרבה; שיטת 'כדור שלג' (הקטן קודם) עוזרת למוטיבציה. הלוואת משכנתא/רכב בריבית נמוכה — פחות דחוף.",
  "שיעור חיסכון: היעד 15–20% מההכנסה נטו לחיסכון ארוך-טווח (מעבר לפנסיה). כל אחוז נוסף מקצר את הדרך לעצמאות כלכלית.",
  "יחסים למעקב: יחס חוב-להכנסה (תשלומי חוב חודשיים / הכנסה נטו) — מתחת ל-36% בריא, מעל 43% מסוכן. יחס דיור (שכ״ד+משכנתא / הכנסה) — עד ~30%.",
  "השקעה (חינוכי): אחרי קרן חירום וכיסוי חוב יקר — חיסכון ארוך-טווח מפוזר ובעלות נמוכה, אופק של שנים, בהתאם לסבילות סיכון אישית. תזמון שוק לא עובד באופן עקבי. הפקדה קבועה (עלות ממוצעת) מפחיתה טעויות רגשיות. אין כאן המלצה על מוצר או נייר ספציפי.",
  "עצמאי/עסק: להפריד חשבון עסקי מפרטי; לשריין ~25–30% מכל תקבול למס ולביטוח לאומי; לשלם לעצמך 'משכורת' קבועה.",
  "הגנות: ביטוח בריאות/חיים/אובדן כושר עבודה לפי הצורך המשפחתי; צוואה ומיופה כוח כשיש תלויים."
].join("\n");

const LABELS = {
  netIncome: "הכנסה חודשית נטו (משק בית)",
  fixedExpenses: "הוצאות קבועות/חודש (דיור, חשבונות, ביטוחים, מנויים)",
  variableExpenses: "הוצאות משתנות/חודש (אוכל, דלק, בילויים)",
  monthlySavings: "סכום שנחסך בפועל/חודש",
  cashSavings: "חיסכון נזיל זמין (עו״ש/פק״מ)",
  investments: "השקעות/חיסכון ארוך-טווח (לא פנסיה)",
  pension: "צבירת פנסיה/גמל",
  expensiveDebt: "חוב יקר — יתרה (אשראי, מסגרת, חוץ-בנקאי)",
  expensiveDebtRate: "ריבית שנתית ממוצעת על החוב היקר (%)",
  mortgage: "יתרת משכנתא",
  mortgagePayment: "החזר משכנתא/חודש",
  otherDebtPayment: "החזרי חוב אחרים/חודש (רכב, הלוואות)",
  dependents: "מספר תלויים",
  employment: "מעמד תעסוקתי (שכיר / עצמאי / משולב)",
  goals: "מטרות פיננסיות (טקסט חופשי)"
};

const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : 0; };

// ---------- מדדים מקומיים ----------
function computeMetrics(d) {
  d = d || {};
  const income = num(d.netIncome);
  const fixed = num(d.fixedExpenses);
  const variable = num(d.variableExpenses);
  const debtPayments = num(d.mortgagePayment) + num(d.otherDebtPayment);
  const totalOut = fixed + variable + debtPayments;
  const surplus = income - totalOut;
  const savings = num(d.monthlySavings) || Math.max(0, surplus);

  const cash = num(d.cashSavings);
  const monthlyNeed = fixed + variable + debtPayments;
  const emergencyMonths = monthlyNeed > 0 ? +(cash / monthlyNeed).toFixed(1) : null;

  const dti = income > 0 ? +((debtPayments + num(d.expensiveDebt) * 0.03) / income * 100).toFixed(0) : null;
  const savingsRate = income > 0 ? +(savings / income * 100).toFixed(0) : null;
  const housing = num(d.mortgagePayment); // אם שכר דירה — נכלל בהוצאות קבועות; זה קירוב
  const netWorth = cash + num(d.investments) + num(d.pension) - num(d.expensiveDebt) - num(d.mortgage);

  // 50/30/20 בפועל
  const split = income > 0 ? {
    needs: +((fixed + debtPayments) / income * 100).toFixed(0),
    wants: +(variable / income * 100).toFixed(0),
    save: savingsRate
  } : null;

  const flags = [];
  if (surplus < 0) flags.push({ level: "high", text: "ההוצאות החודשיות גבוהות מההכנסה — גירעון שוטף." });
  if (emergencyMonths != null && emergencyMonths < 1) flags.push({ level: "high", text: "אין כמעט קרן חירום (פחות מחודש הוצאות)." });
  else if (emergencyMonths != null && emergencyMonths < 3) flags.push({ level: "mid", text: `קרן חירום חלקית (${emergencyMonths} חודשים; היעד 3–6).` });
  if (num(d.expensiveDebt) > 0 && num(d.expensiveDebtRate) >= 8) flags.push({ level: "high", text: `חוב יקר של ${num(d.expensiveDebt).toLocaleString("he-IL")} ₪ בריבית ~${num(d.expensiveDebtRate)}% — עדיפות לכיסוי.` });
  if (dti != null && dti > 43) flags.push({ level: "high", text: `יחס חוב-להכנסה גבוה (${dti}%).` });
  else if (dti != null && dti > 36) flags.push({ level: "mid", text: `יחס חוב-להכנסה על הגבול (${dti}%).` });
  if (savingsRate != null && savingsRate < 10 && surplus >= 0) flags.push({ level: "mid", text: `שיעור חיסכון נמוך (${savingsRate}%; היעד 15–20%).` });

  return {
    income, totalOut, surplus, savings,
    emergencyMonths, savingsRate, dti, netWorth, split,
    emergencyTarget: Math.round(monthlyNeed * 4),
    flags
  };
}

function buildPrompt(d, metrics) {
  const L = [];
  L.push("אתה מלווה פיננסי שכותב תוכנית התנהלות אישית בעברית, מבוססת עקרונות מקובלים. אינך יועץ השקעות ואינך יועץ פנסיוני מורשה. אל תמליץ על מוצר, נייר ערך, קרן או חברה ספציפיים. אל תמציא נתונים שלא נמסרו.");
  L.push("");
  L.push("=== נתוני המשתמש ===");
  Object.keys(LABELS).forEach((k) => { if (d[k]) L.push(LABELS[k] + ": " + d[k]); });
  L.push("");
  L.push("=== מדדים שחושבו ===");
  if (metrics.income) L.push(`הכנסה נטו: ${metrics.income.toLocaleString("he-IL")} ₪ · הוצאות: ${metrics.totalOut.toLocaleString("he-IL")} ₪ · עודף/גירעון חודשי: ${metrics.surplus.toLocaleString("he-IL")} ₪`);
  if (metrics.savingsRate != null) L.push(`שיעור חיסכון: ${metrics.savingsRate}%`);
  if (metrics.emergencyMonths != null) L.push(`קרן חירום: ${metrics.emergencyMonths} חודשי הוצאות (יעד 3–6 = ~${metrics.emergencyTarget.toLocaleString("he-IL")} ₪)`);
  if (metrics.dti != null) L.push(`יחס חוב-להכנסה משוער: ${metrics.dti}%`);
  L.push(`שווי נקי משוער: ${metrics.netWorth.toLocaleString("he-IL")} ₪`);
  if (metrics.flags.length) L.push("דגלים: " + metrics.flags.map((f) => f.text).join(" | "));
  L.push("");
  L.push("=== תמצית העקרונות ===");
  L.push(KB);
  L.push("");
  L.push("כתוב תוכנית קונקרטית ומספרית, בעברית, עם כותרות מודגשות (**), במבנה:");
  L.push("1. תמונת מצב — 2–3 משפטים על המצב לפי המדדים.");
  L.push("2. סדר עדיפויות — 3–5 צעדים לפי חשיבות (גירעון → חוב יקר → קרן חירום → הגדלת חיסכון), עם סכומים חודשיים קונקרטיים.");
  L.push("3. תקציב מוצע — חלוקה מספרית (₪) לפי 50/30/20 מותאם, כולל היכן לקצץ אם יש גירעון.");
  L.push("4. חוב — אם יש חוב יקר: תוכנית החזר (איזו שיטה, כמה לשלם לחודש, בכמה זמן ייסגר בקירוב).");
  L.push("5. קרן חירום — יעד בשקלים, כמה להפריש לחודש, כמה זמן עד שמגיעים.");
  L.push("6. חיסכון ארוך-טווח — כלל אצבע לשיעור החיסכון (בלי מוצרים), והצעה להפקדה אוטומטית קבועה.");
  L.push("7. מעקב — מה למדוד כל חודש ומתי לעדכן את התוכנית.");
  L.push("8. סייג קצר: זו אינה המלצת השקעה ואינה תחליף ליועץ פיננסי/פנסיוני מורשה.");
  L.push("אורך: עד ~600 מילים.");
  L.push("");
  L.push("התוכנית:");
  return L.join("\n");
}

async function analyze(data) {
  const metrics = computeMetrics(data || {});
  let plan = null, source = null;
  try {
    const r = await askAI(buildPrompt(data || {}, metrics), { timeout: 120000, sessionTag: "finance-compass" });
    if (r && r.text) { plan = r.text; source = r.source; }
  } catch (e) {
    return { ok: false, metrics, error: e.message };
  }
  return { ok: !!plan, metrics, plan, source, generatedAt: new Date().toISOString() };
}

module.exports = { analyze, computeMetrics, buildPrompt, LABELS };
