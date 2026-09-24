/*
 * analyze.js  (engine v2 - "deep reading")
 * ---------------------------------------
 * Deterministic graphology rule engine.
 *
 * Pipeline:
 *   1. linear pass   - each answer contributes weighted deltas to 10 dimensions
 *   2. interaction    - COMBINATIONS fire when feature clusters co-occur, add
 *                       written insights and nudge the deltas
 *   3. scoring        - deltas -> 0..100 scores + per-dimension confidence
 *   4. portrait       - archetype match, narrative sections, tensions, headline
 *
 * Pure function, self-contained, ES5-safe. Inlined into the n8n Code node by
 * scripts/build-workflow.mjs together with knowledge-base.js + combinations.js.
 */

const { DIMENSIONS, PARAMETERS, PARAM_GROUPS } = require("./knowledge-base");
const { COMBINATIONS, ARCHETYPES } = require("./combinations");

const PARAM_BY_ID = {};
PARAMETERS.forEach((p) => (PARAM_BY_ID[p.id] = p));

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round2(v) { return Math.round(v * 100) / 100; }
function band(score) { return score >= 66 ? "high" : score <= 34 ? "low" : "mid"; }
function t(obj, lang) { return obj ? (obj[lang] != null ? obj[lang] : obj.en) : ""; }

// average delta (-2..+2) -> 0..100 deviation from 50
const SPREAD = 18;
// weight given to an interaction rule's nudge, as if it were one extra parameter
const COMBO_WEIGHT = 0.85;

/* ---------------------------------------------------------------------------
 * Narrative library.  Per dimension / per band:
 *   short  - one clause, used to assemble summary lines
 *   detail - 2 sentences, the behavioural reading shown next to the score
 * ------------------------------------------------------------------------- */
const NARRATIVE = {
  extraversion: {
    high: {
      short: { he: "שואב אנרגיה ממפגש חברתי ויוזם קשר", en: "draws energy from social contact and initiates it" },
      detail: {
        he: "נוטה להיטען מנוכחות של אנשים, לדבר כדי לחשוב, ולהרגיש בנוח לתפוס מקום בחדר. בסביבה מבודדת או שקטה מדי האנרגיה יורדת, ולכן חשוב לו לשלב אינטראקציה גם ביום עמוס.",
        en: "Tends to be charged by the presence of people, to think out loud, and to be comfortable taking up room. In an isolated or too-quiet setting the energy drops, so it matters to build interaction into even a busy day.",
      },
    },
    mid: {
      short: { he: "מאזן בין זמן חברתי לזמן לעצמו", en: "balances social time with time alone" },
      detail: {
        he: "יכול ליהנות מקבוצה וגם מעבודה בשקט, ומכייל את מידת החשיפה לפי המצב ולפי רמת האנרגיה של אותו יום. אינו זקוק לבמה אך גם אינו נמנע ממנה.",
        en: "Can enjoy a group and also quiet solo work, tuning exposure to the situation and to that day's energy. Doesn't need a stage but doesn't avoid one either.",
      },
    },
    low: {
      short: { he: "מעדיף מפגשים קטנים ומעבד חוויות בפנים", en: "prefers small settings and processes experience inwardly" },
      detail: {
        he: "מפגש חברתי ממושך, בייחוד עם לא-מוכרים, גובה אנרגיה שצריך לטעון מחדש לבד. מגיע לשיחה אחרי שכבר חשב, ולרוב יעדיף עומק עם מעטים על פני רוחב עם רבים.",
        en: "Extended socialising, especially with unfamiliar people, costs energy that has to be recharged alone. Comes to a conversation after already thinking, and will usually prefer depth with a few over breadth with many.",
      },
    },
  },
  emotional_expression: {
    high: {
      short: { he: "מבטא רגש בגלוי ומגיב מהר", en: "expresses feeling openly and reacts fast" },
      detail: {
        he: "מה שמרגיש עולה החוצה כמעט מיד — בפנים, בטון, בבחירת המילים. זה יוצר קשר אותנטי ומהיר, אך גם אומר שמצב רוח קשה נראה לעין ומשפיע על הסובבים.",
        en: "What is felt shows almost at once — in the face, the tone, the choice of words. This makes for authentic, fast connection, but also means a hard mood is visible and affects those around.",
      },
    },
    mid: {
      short: { he: "מביע רגש כשמתאים אך שומר ריסון", en: "shows emotion when fitting while keeping restraint" },
      detail: {
        he: "משתף רגש עם אנשים קרובים ובמצבים מתאימים, אך מסוגל להחזיק אותו בפנים כשצריך תפקוד ענייני. הקו בין 'להראות' ל'לשמור' נקבע לפי ההקשר.",
        en: "Shares feeling with close people and in fitting situations, but can hold it in when matter-of-fact functioning is needed. The line between 'showing' and 'holding' is set by context.",
      },
    },
    low: {
      short: { he: "שומר רגש בפנים ומציג חזית מאופקת", en: "keeps feeling private and presents a composed front" },
      detail: {
        he: "מעבד רגש בשקט לפני שהוא בוחר אם ואיך לחלוק אותו. אחרים עשויים לקרוא את האיפוק כרוגע או כריחוק, בעוד שבפנים הפעילות הרגשית יכולה להיות ערה.",
        en: "Processes feeling quietly before choosing whether and how to share it. Others may read the restraint as calm or as distance, while inwardly the emotional activity can be lively.",
      },
    },
  },
  analytical_thinking: {
    high: {
      short: { he: "מפרק בעיות לגורמים ומחפש היגיון", en: "breaks problems into parts and looks for logic" },
      detail: {
        he: "ניגש למצב חדש בשאלה 'מאילו חלקים זה מורכב ומה מניע כל חלק'. חזק בזיהוי דפוסים, סתירות והנחות סמויות; פחות בנוח כשצריך להכריע לפי תחושה בלבד ובלי מספיק נתונים.",
        en: "Approaches a new situation by asking 'what parts is this made of and what drives each'. Strong at spotting patterns, contradictions and hidden assumptions; less comfortable deciding on feel alone with too little data.",
      },
    },
    mid: {
      short: { he: "משלב ניתוח שקול עם אינטואיציה", en: "combines measured analysis with intuition" },
      detail: {
        he: "משתמש בהיגיון מסודר במשימות שדורשות זאת, ומרשה לעצמו ללכת עם תחושת בטן כשהזמן קצר או כשהנושא מוכר. אינו נצמד לשיטה אחת.",
        en: "Uses ordered logic on tasks that call for it, and allows a gut call when time is short or the subject is familiar. Not wedded to a single method.",
      },
    },
    low: {
      short: { he: "מסתמך על תחושה, התרשמות כוללת וניסיון", en: "relies on feel, overall impression and experience" },
      detail: {
        he: "קולט מצב 'בבת אחת' ומגיב ממקום של ניסיון והתרשמות, לא מפירוק שיטתי. זה מהיר ולעיתים מדויק להפליא, אך קשה יותר להסביר לאחרים איך הגיע למסקנה או לשחזר אותה.",
        en: "Grasps a situation 'all at once' and responds from experience and impression rather than systematic breakdown. This is fast and sometimes strikingly accurate, but harder to explain to others or to reproduce.",
      },
    },
  },
  detail_orientation: {
    high: {
      short: { he: "קשוב לפרטים הקטנים ומקפיד על דיוק", en: "attentive to small details and insists on accuracy" },
      detail: {
        he: "שם לב לאי-התאמות, לשגיאות ולפרטים שרוב האנשים מחליקים מעליהם, ובודק את עצמו לפני שמוסר. החיסרון: לפעמים נתקע בזוטה או מתקשה לשחרר משהו כ'מספיק טוב'.",
        en: "Notices mismatches, errors and details most people skip past, and checks their own work before handing it over. The downside: can get stuck on a trifle or struggle to release something as 'good enough'.",
      },
    },
    mid: {
      short: { he: "שם לב לפרטים החשובים בלי להיתקע", en: "catches the important details without getting stuck" },
      detail: {
        he: "מזהה אילו פרטים באמת משנים למשימה ומשקיע בהם, מבלי להחיל את אותה רמת דקדוק על הכול. איזון סביר בין דיוק לקצב.",
        en: "Identifies which details actually matter to the task and invests there, without applying the same scrutiny to everything. A reasonable balance of accuracy and pace.",
      },
    },
    low: {
      short: { he: "מתמקד בתמונה הגדולה ועלול לפספס פרטים", en: "focuses on the big picture and may miss details" },
      detail: {
        he: "המחשבה נמשכת אל הכיוון הכללי, המשמעות והמטרה, ופחות אל הביצוע המדוקדק. שלבים טכניים, הגהה ומעקב אחר פרטים קטנים עדיף שיעברו לגורם נוסף או לרשימת בדיקה קבועה.",
        en: "Thought is drawn to the general direction, meaning and goal, less to precise execution. Technical steps, proofing and tracking small details are best passed to someone else or to a fixed checklist.",
      },
    },
  },
  self_confidence: {
    high: {
      short: { he: "פועל מתחושת ערך יציבה ולוקח אחריות", en: "acts from stable self-worth and takes responsibility" },
      detail: {
        he: "מביע עמדה בבירור, מוכן לעמוד מאחורי החלטה גם כשהיא לא פופולרית, ומתאושש יחסית מהר מכישלון. צריך להיזהר מלפרש ביטחון כאילו אין צורך להקשיב לספקות של אחרים.",
        en: "States a position clearly, is willing to stand behind a decision even when unpopular, and recovers relatively fast from failure. Needs to guard against treating confidence as a reason not to hear others' doubts.",
      },
    },
    mid: {
      short: { he: "בטוח בתחומים מוכרים ונזהר בשטח חדש", en: "assured in familiar areas, cautious in new terrain" },
      detail: {
        he: "בתוך תחום הידע והניסיון שלו פועל בביטחון ובלי היסוס; מול משהו לא מוכר לוקח זמן לאסוף מידע ולבדוק לפני שמתחייב. הערכה עצמית מציאותית ולא מנופחת.",
        en: "Within their field of knowledge and experience acts with confidence and little hesitation; facing something unfamiliar takes time to gather information and check before committing. A realistic, un-inflated self-appraisal.",
      },
    },
    low: {
      short: { he: "מטיל ספק בעצמו ומחפש אישור חיצוני", en: "doubts themselves and seeks outside validation" },
      detail: {
        he: "נוטה להמעיט בהישגים, לחשוש מטעות בפומבי, ולבקש חיזוק מהסביבה לפני שמתקדם. לרוב מוכן ומדויק הרבה יותר משהוא מרגיש; משוב חיצוני עקבי עוזר לכייל את התחושה.",
        en: "Tends to downplay achievements, to fear a public mistake, and to seek reassurance before moving ahead. Usually far more prepared and accurate than they feel; consistent external feedback helps calibrate the sense.",
      },
    },
  },
  adaptability: {
    high: {
      short: { he: "מסתגל מהר לשינוי ופתוח לגישות חדשות", en: "adapts fast to change and is open to new approaches" },
      detail: {
        he: "אי-ודאות ושינוי תוכניות אינם מפילים אותו — הוא מחשב מסלול מחדש וממשיך. חזק בסביבה דינמית; פחות בנוח כשהתפקיד דורש חזרתיוּת ארוכה על אותו נוהל בדיוק.",
        en: "Uncertainty and changing plans don't derail them — they re-route and carry on. Strong in a dynamic environment; less comfortable when the role demands long repetition of the exact same procedure.",
      },
    },
    mid: {
      short: { he: "מקבל שינוי סביר אך מעדיף תקופת הסתגלות", en: "accepts reasonable change but wants an adjustment period" },
      detail: {
        he: "פתוח לשינוי כשמסבירים לו את הטעם ונותנים לו זמן להיערך. שינוי פתאומי וללא הקשר עלול לעורר התנגדות ראשונית שחולפת אחרי שהתמונה מתבהרת.",
        en: "Open to change when the reason is explained and there is time to prepare. A sudden, context-free change can trigger initial resistance that passes once the picture clears.",
      },
    },
    low: {
      short: { he: "מעדיף שגרה יציבה, כללים ברורים ותכנון", en: "prefers stable routine, clear rules and planning" },
      detail: {
        he: "מתפקד במיטבו כשהמסגרת ידועה מראש והציפיות ברורות. שינוי פתאומי נחווה כמתיש ודורש אנרגיה ניכרת; התראה מוקדמת ומעבר מדורג עושים הבדל גדול.",
        en: "Functions best when the framework is known in advance and expectations are clear. Sudden change is experienced as draining and demands significant energy; advance notice and a phased transition make a large difference.",
      },
    },
  },
  drive_energy: {
    high: {
      short: { he: "מרץ גבוה, פועל מהר ומחפש אתגר", en: "high energy, acts fast and seeks challenge" },
      detail: {
        he: "צובר תאוצה כשיש יעד ומתחיל להתנדנד כשאין. מזיז דברים ומדביק אחרים באנרגיה, אך זקוק לניהול של הקצב כדי לא לשחוק את עצמו ואת הצוות ולא לדלג על שלבים.",
        en: "Gathers speed when there is a target and gets restless when there isn't. Moves things and energises others, but needs to manage the pace so as not to wear themselves and the team down or skip steps.",
      },
    },
    mid: {
      short: { he: "קצב עבודה יציב ומווסת לאורך זמן", en: "steady work pace, regulated over time" },
      detail: {
        he: "מחזיק תפוקה סבירה לאורך זמן בלי פרצים ובלי נפילות חדות. לא הראשון לזנק על משימה, אך מסיים את מה שלקח על עצמו.",
        en: "Holds a reasonable output over time without spikes or sharp dips. Not the first to leap on a task, but finishes what they took on.",
      },
    },
    low: {
      short: { he: "קצב מתון ומדוד, מעדיף עומק על תפוקה", en: "moderate deliberate pace, prefers depth over output" },
      detail: {
        he: "עובד בצורה מחושבת ולא נחפזת, ומשקיע את האנרגיה במיקוד ובאיכות ולא בכמות או במהירות. לחץ לתפוקה מהירה פוגע דווקא באיכות שהיא החוזק שלו.",
        en: "Works in a considered, unhurried way, putting energy into focus and quality rather than volume or speed. Pressure for fast output actually undermines the quality that is their strength.",
      },
    },
  },
  social_warmth: {
    high: {
      short: { he: "קשוב לצרכים של אחרים ומחפש הרמוניה", en: "attuned to others' needs and seeks harmony" },
      detail: {
        he: "שם לב מהר כשמישהו לא בסדר, נוטה לרכך חיכוכים, ומעמיד את טובת הקשר גבוה. חזק בליווי ובצוות; האתגר הוא לומר 'לא' ולהחזיק עמדה לא-פופולרית כשצריך.",
        en: "Quickly notices when someone is off, tends to smooth friction, and puts the good of the relationship high. Strong in support and team roles; the challenge is saying 'no' and holding an unpopular position when needed.",
      },
    },
    mid: {
      short: { he: "אכפתי לקרובים ומקצועי מול היתר", en: "caring toward close people, professional with the rest" },
      detail: {
        he: "משקיע רגשית במעגל הקרוב ושומר על יחס ענייני ומכובד עם כל השאר. אינו מתערב יותר מדי אך גם אינו קר.",
        en: "Invests emotionally in the close circle and keeps a matter-of-fact, respectful stance with everyone else. Neither over-involved nor cold.",
      },
    },
    low: {
      short: { he: "ענייני ביחסים, המשימה לפני הצד הבין-אישי", en: "matter-of-fact in relationships, task before the interpersonal" },
      detail: {
        he: "מעריך יעילוּת וישירוּת יותר מאשר החלקה חברתית, ועשוי להיתפס כמרוחק גם כשאכפת לו. עובד היטב כשהתפקידים ברורים ואין ציפייה לתחזוקה רגשית מתמדת.",
        en: "Values efficiency and directness over social smoothing, and can come across as distant even when they care. Works well when roles are clear and there is no expectation of constant emotional maintenance.",
      },
    },
  },
  structure_discipline: {
    high: {
      short: { he: "מאורגן, מתכנן מראש ומסיים מה שהתחיל", en: "organised, plans ahead and finishes what they start" },
      detail: {
        he: "בונה סדר מסביבו — רשימות, לוחות זמנים, שלבים — ועומד בהתחייבויות גם כשלא בא לו. מאוד אמין; החיסרון הוא נוקשות אפשרית כשהמציאות דורשת לסטות מהתוכנית.",
        en: "Builds order around themselves — lists, schedules, stages — and keeps commitments even when not in the mood. Very reliable; the downside is possible rigidity when reality demands deviating from the plan.",
      },
    },
    mid: {
      short: { he: "מאורגן במידה ומוסיף מבנה כשצריך", en: "organised enough, adds structure when needed" },
      detail: {
        he: "מחזיק סדר בסיסי ומעלה את רמת הארגון כשהמשימה מורכבת או כשיש דד-ליין. לא זקוק למערכת מלאה לכל דבר קטן.",
        en: "Keeps a basic order and raises the level of organisation when the task is complex or a deadline looms. Doesn't need a full system for every small thing.",
      },
    },
    low: {
      short: { he: "ספונטני וגמיש, מתקשה עם שגרה ומעקב", en: "spontaneous and flexible, struggles with routine and follow-up" },
      detail: {
        he: "פועל לפי אנרגיה ועניין של הרגע יותר מאשר לפי תוכנית. חזק באלתור ובפתיחת דברים; לוחות זמנים, נהלים ומעקב ארוך-טווח דורשים תמיכה חיצונית — שותף, כלי, או מסגרת שמכתיבה מקצב.",
        en: "Works by the energy and interest of the moment more than by a plan. Strong at improvising and starting things; schedules, procedures and long-term follow-up need external support — a partner, a tool, or a framework that sets the cadence.",
      },
    },
  },
  independence: {
    high: {
      short: { he: "מגבש עמדה עצמאית ופועל היטב לבד", en: "forms an independent position and works well alone" },
      detail: {
        he: "מגיע למסקנה משלו ולא זז ממנה רק בגלל לחץ קבוצתי; מעדיף אחריות מלאה על פיסת עבודה על פני שותפוּת צמודה. זקוק פחות לאישור, אך שווה לו לוודא שהוא לא מפספס מידע שרק אחרים מחזיקים.",
        en: "Reaches their own conclusion and won't shift it just from group pressure; prefers full ownership of a piece of work over close partnership. Needs less approval, but should make sure they aren't missing information only others hold.",
      },
    },
    mid: {
      short: { he: "עצמאי בשוטף אך מעריך משוב ותיאום", en: "independent day-to-day but values feedback and coordination" },
      detail: {
        he: "מנהל את עבודתו בעצמו ולא זקוק לפיקוח, אך מחפש נקודות תיאום ומשוב בצמתים. איזון בין 'לתת לי לרוץ' ל'בוא נסתנכרן'.",
        en: "Runs their own work without supervision, but seeks coordination points and feedback at junctions. A balance between 'let me run' and 'let's sync'.",
      },
    },
    low: {
      short: { he: "מעדיף צוות, התייעצות ומסגרת תומכת", en: "prefers a team, consultation and a supportive framework" },
      detail: {
        he: "מרגיש בטוח יותר כשיש עם מי להתייעץ ועם מי לחלוק אחריות, ועבודה מבודדת לאורך זמן מכבידה. מוציא את המיטב בתוך צוות מתפקד ועם גב ארגוני ברור.",
        en: "Feels more secure with someone to consult and to share responsibility, and isolated work over time is a burden. Does best inside a functioning team with clear organisational backing.",
      },
    },
  },
};

const TENSION_PAIRS = [
  ["structure_discipline", "adaptability"],
  ["extraversion", "independence"],
  ["drive_energy", "detail_orientation"],
  ["emotional_expression", "analytical_thinking"],
  ["social_warmth", "independence"],
  ["self_confidence", "detail_orientation"],
];

function labelFor(dimKey, lang) {
  const d = DIMENSIONS.find((x) => x.key === dimKey);
  return d ? (lang === "en" ? d.en : d.he) : dimKey;
}

/* --- interaction rules ---------------------------------------------------- */
function matchCombination(rule, answers) {
  const keys = Object.keys(rule.when);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const need = rule.when[k];
    const got = answers[k];
    if (got == null) return false;
    if (Array.isArray(need)) {
      if (need.indexOf(got) === -1) return false;
    } else if (need !== got) {
      return false;
    }
  }
  return true;
}

/* --- archetype ---------------------------------------------------------- */
function pickArchetype(dimByKey) {
  let best = null;
  let bestScore = -1;
  ARCHETYPES.forEach((a) => {
    if (a.fallback) return;
    const needs = Object.keys(a.need);
    let met = 0;
    let margin = 0;
    let failed = false;
    needs.forEach((k) => {
      const threshold = a.need[k];
      if (threshold <= 0) return; // 0 = "don't care" marker
      const s = dimByKey[k] ? dimByKey[k].score : 50;
      if (s >= threshold) {
        met++;
        margin += s - threshold;
      } else {
        failed = true;
      }
    });
    if (failed) return;
    const activeNeeds = needs.filter((k) => a.need[k] > 0).length;
    if (met < activeNeeds) return;
    const score = met * 100 + margin;
    if (score > bestScore) {
      bestScore = score;
      best = { def: a, met: met, margin: margin };
    }
  });
  if (!best) {
    const fb = ARCHETYPES.find((a) => a.fallback) || ARCHETYPES[ARCHETYPES.length - 1];
    return { def: fb, match_strength: 0.35 };
  }
  return {
    def: best.def,
    match_strength: Math.round(clamp(0.55 + best.margin / 120, 0, 1) * 100) / 100,
  };
}

/* --- prose sections --------------------------------------------------- */
function joinClauses(arr, lang) {
  return arr.filter(Boolean).join(lang === "en" ? "; " : "; ");
}

function buildSections(dimByKey, ranked, standout, tensions, lang) {
  const g = (k) => dimByKey[k];
  const sd = (k) => g(k).detail;   // {he,en} detail object
  const ss = (k) => g(k).short;    // {he,en} short object
  const top = ranked.slice(0, 3);
  const bottom = ranked.slice(-2);
  const L = (o) => t(o, lang);

  const out = [];

  out.push({
    id: "character_core",
    title: lang === "en" ? "Character core" : "גרעין האופי",
    body:
      (lang === "en"
        ? "At the centre of this profile: "
        : "במרכז הפרופיל הזה: ") +
      joinClauses(top.map((d) => L(d.short)), lang) +
      ". " +
      L(sd(top[0].key)),
  });

  out.push({
    id: "thinking",
    title: lang === "en" ? "Thinking & decisions" : "חשיבה והחלטות",
    body: L(sd("analytical_thinking")) + " " + L(sd("adaptability")),
  });

  out.push({
    id: "work",
    title: lang === "en" ? "Work & productivity" : "עבודה ותפוקה",
    body: L(sd("structure_discipline")) + " " + L(sd("drive_energy")) + " " + L(sd("detail_orientation")),
  });

  out.push({
    id: "communication",
    title: lang === "en" ? "Communication style" : "סגנון תקשורת",
    body: L(sd("extraversion")) + " " + L(sd("emotional_expression")),
  });

  out.push({
    id: "relationships",
    title: lang === "en" ? "Relationships & social" : "יחסים וחברה",
    body: L(sd("social_warmth")) + " " + L(sd("independence")),
  });

  out.push({
    id: "stress",
    title: lang === "en" ? "Under pressure" : "תחת לחץ",
    body: buildStress(dimByKey, lang),
  });

  out.push({
    id: "motivation",
    title: lang === "en" ? "Motivation & drives" : "מוטיבציה ומניעים",
    body: buildMotivation(dimByKey, lang),
  });

  out.push({
    id: "leadership",
    title: lang === "en" ? "Leadership tendency" : "נטייה למנהיגות",
    body: buildLeadership(dimByKey, lang),
  });

  out.push({
    id: "growth",
    title: lang === "en" ? "Growth edges" : "נקודות לצמיחה",
    body:
      (lang === "en"
        ? "The handwriting expresses these least — areas to develop deliberately, not deficits: "
        : "הכתב מבטא הכי פחות את התחומים הבאים — כדאי לפתח אותם במכוון, אין מדובר בחסרונות: ") +
      joinClauses(bottom.map((d) => L(d.short)), lang) +
      ". " +
      L(sd(bottom[0].key)),
  });

  if (standout.length) {
    out.push({
      id: "standout",
      title: lang === "en" ? "What stands out" : "מה בולט במיוחד",
      body: standout.map((s) => s.insight).join(lang === "en" ? "  " : "  "),
    });
  }

  if (tensions.length) {
    out.push({
      id: "tensions",
      title: lang === "en" ? "Internal tensions" : "מתחים פנימיים",
      body: tensions.map((x) => x.note).join(" "),
    });
  }

  return out;
}

function buildStress(dimByKey, lang) {
  const emo = dimByKey.emotional_expression.score;
  const disc = dimByKey.structure_discipline.score;
  const adapt = dimByKey.adaptability.score;
  const conf = dimByKey.self_confidence.score;
  const frags = [];
  if (lang === "en") {
    frags.push(emo >= 58 ? "Under pressure feelings surface quickly and visibly" : "Under pressure the outward reaction stays contained while the inner load builds");
    frags.push(disc >= 55 ? "the instinct is to tighten structure, list, and control the process" : "structure tends to loosen further and the approach turns improvised");
    frags.push(adapt >= 55 ? "and new information is absorbed and used rather than resisted" : "and unexpected changes are felt as especially costly");
    if (conf <= 42) frags.push("self-doubt can amplify the load, so early external feedback helps");
    return frags.join(", ") + ".";
  }
  frags.push(emo >= 58 ? "תחת לחץ הרגשות עולים מהר ובאופן גלוי" : "תחת לחץ התגובה החיצונית נשארת מרוסנת בעוד העומס הפנימי מצטבר");
  frags.push(disc >= 55 ? "האינסטינקט הוא להדק מבנה, לעשות רשימות ולשלוט בתהליך" : "המבנה נוטה להתרופף עוד יותר והגישה נעשית מאולתרת");
  frags.push(adapt >= 55 ? "ומידע חדש נקלט ומשולב במקום להידחות" : "ושינויים לא צפויים נחווים כיקרים במיוחד");
  if (conf <= 42) frags.push("וספק עצמי עלול להגביר את העומס, ולכן משוב חיצוני מוקדם עוזר");
  return frags.join(", ") + ".";
}

function buildMotivation(dimByKey, lang) {
  const drive = dimByKey.drive_energy.score;
  const ind = dimByKey.independence.score;
  const warm = dimByKey.social_warmth.score;
  const anal = dimByKey.analytical_thinking.score;
  const conf = dimByKey.self_confidence.score;
  const pick = [];
  const add = (cond, he, en) => { if (cond) pick.push(lang === "en" ? en : he); };
  add(drive >= 58, "התקדמות נראית לעין ואתגר", "visible progress and challenge");
  add(anal >= 58, "להבין איך משהו עובד לעומק", "understanding how something works in depth");
  add(warm >= 58, "תרומה לאנשים והערכה מהקרובים", "contributing to people and appreciation from those close");
  add(ind >= 58, "אוטונומיה ואחריות מלאה על התוצר", "autonomy and full ownership of the outcome");
  add(conf >= 58, "הזדמנות להוביל ולהשפיע", "a chance to lead and to influence");
  add(dimByKey.structure_discipline.score >= 58, "סדר, בהירות וסגירת מעגלים", "order, clarity and closing loops");
  if (!pick.length) pick.push(lang === "en" ? "a mix of interest, fair recognition and a manageable pace" : "שילוב של עניין, הכרה הוגנת וקצב שאפשר לעמוד בו");
  const lead = lang === "en" ? "Most energised by: " : "מה שהכי מניע: ";
  const tail =
    lang === "en"
      ? ". Drains quickly on tasks that are none of these and offer no clear payoff."
      : ". מתרוקן מהר ממשימות שאינן אף אחד מאלה ואין בצידן תמורה ברורה.";
  return lead + pick.join(lang === "en" ? ", " : ", ") + tail;
}

function buildLeadership(dimByKey, lang) {
  const conf = dimByKey.self_confidence.score;
  const drive = dimByKey.drive_energy.score;
  const warm = dimByKey.social_warmth.score;
  const struct = dimByKey.structure_discipline.score;
  const anal = dimByKey.analytical_thinking.score;
  const composite = 0.3 * conf + 0.3 * drive + 0.2 * struct + 0.2 * Math.max(warm, anal);
  if (lang === "en") {
    if (composite >= 62) {
      const style = warm >= anal ? "a people-first style — leads by relationship, buy-in and reading the room" : "a task-first style — leads by clarity, standards and decisions";
      return "Shows a natural pull toward leadership with " + style + ". Watch for taking too much on personally and leaving others without room.";
    }
    if (composite >= 48) {
      return "Can lead well in the right conditions — a domain they know, a team that fits, a clear mandate — but doesn't chase the role for its own sake. Often strongest as a deputy, lead specialist or project owner.";
    }
    return "Prefers to contribute through the work itself rather than through authority over others. Most valuable given depth, ownership of a defined area and light-touch management.";
  }
  if (composite >= 62) {
    const style = warm >= anal ? "סגנון שמוביל דרך אנשים — קשר, גיוס הסכמה וקריאת החדר" : "סגנון שמוביל דרך משימה — בהירוּת, סטנדרטים והכרעות";
    return "יש כאן משיכה טבעית למנהיגות עם " + style + ". כדאי לשים לב לנטייה לקחת יותר מדי על עצמו ולא להשאיר מקום לאחרים.";
  }
  if (composite >= 48) {
    return "יכול להוביל היטב בתנאים הנכונים — תחום שהוא מכיר, צוות שמתאים, מנדט ברור — אך לא רודף אחרי התפקיד לשמו. לרוב חזק במיוחד כסגן, כמומחה מוביל או כאחראי פרויקט.";
  }
  return "מעדיף לתרום דרך העבודה עצמה ולא דרך סמכות על אחרים. בעל הערך הגבוה ביותר כשנותנים לו עומק, אחריות על תחום מוגדר וניהול בגישה מרפה.";
}

function confidenceLabel(v, lang) {
  if (lang === "en") {
    if (v >= 0.7) return "relatively coherent signal";
    if (v >= 0.45) return "moderate / mixed signal";
    return "weak / inconclusive signal";
  }
  if (v >= 0.7) return "סימן עקבי יחסית";
  if (v >= 0.45) return "סימן בינוני / מעורב";
  return "סימן חלש / לא מובהק";
}

/* ======================================================================= */
function analyze(answers, options) {
  options = options || {};
  const lang = options.lang === "en" ? "en" : "he";
  answers = answers || {};

  const acc = {};
  DIMENSIONS.forEach((d) => (acc[d.key] = { sum: 0, weight: 0, deltas: [] }));

  const breakdown = [];
  let answeredCount = 0;

  // --- 1. linear pass ---------------------------------------------------
  PARAMETERS.forEach((param) => {
    const chosenId = answers[param.id];
    if (!chosenId) return;
    const opt = (param.options || []).find((o) => o.id === chosenId);
    if (!opt) return;
    answeredCount++;

    const contributions = [];
    Object.keys(opt.effects || {}).forEach((dim) => {
      if (!acc[dim]) return;
      const rawDelta = opt.effects[dim];
      const weighted = rawDelta * param.weight;
      acc[dim].sum += weighted;
      acc[dim].weight += param.weight;
      acc[dim].deltas.push(weighted);
      contributions.push({
        dimension: dim,
        dimension_label: labelFor(dim, lang),
        delta: round2(rawDelta),
        weighted_delta: round2(weighted),
        direction: rawDelta >= 0 ? "+" : "-",
      });
    });
    contributions.sort((a, b) => Math.abs(b.weighted_delta) - Math.abs(a.weighted_delta));

    breakdown.push({
      parameter: param.id,
      parameter_label: t({ he: param.he, en: param.en }, lang),
      answer: opt.id,
      answer_label: t({ he: opt.he, en: opt.en }, lang),
      interpretation: t(opt.interpretation, lang),
      rationale: t(opt.rationale, lang),
      contributions: contributions,
    });
  });

  // --- 2. interaction rules ------------------------------------------
  const standout = [];
  const combinationsDetail = [];
  COMBINATIONS.forEach((rule) => {
    if (!matchCombination(rule, answers)) return;
    standout.push({
      id: rule.id,
      title: t({ he: rule.he, en: rule.en }, lang),
      insight: t(rule.insight, lang),
    });
    const conds = Object.keys(rule.when).map((k) => {
      const p = PARAM_BY_ID[k];
      const need = rule.when[k];
      const arr = Array.isArray(need) ? need : [need];
      const optLabels = arr.map((oid) => {
        const o = p && p.options.find((x) => x.id === oid);
        return o ? t({ he: o.he, en: o.en }, lang) : oid;
      });
      return (p ? t({ he: p.he, en: p.en }, lang) : k) + " = " + optLabels.join(lang === "en" ? " / " : " / ");
    });
    combinationsDetail.push({
      title: t({ he: rule.he, en: rule.en }, lang),
      why: conds.join(lang === "en" ? "  ·  " : "  ·  "),
    });
    Object.keys(rule.effects || {}).forEach((dim) => {
      if (!acc[dim]) return;
      const weighted = rule.effects[dim] * COMBO_WEIGHT;
      acc[dim].sum += weighted;
      acc[dim].weight += COMBO_WEIGHT;
      acc[dim].deltas.push(weighted);
    });
  });

  // --- 3. scoring --------------------------------------------------------
  const dimensions = DIMENSIONS.map((d) => {
    const a = acc[d.key];
    const avgDelta = a.weight > 0 ? a.sum / a.weight : 0;
    const score = Math.round(clamp(50 + SPREAD * avgDelta, 0, 100));

    let agreement = 1;
    if (a.deltas.length >= 2) {
      const mean = a.deltas.reduce((s, x) => s + x, 0) / a.deltas.length;
      const variance = a.deltas.reduce((s, x) => s + (x - mean) * (x - mean), 0) / a.deltas.length;
      agreement = clamp(1 - Math.sqrt(variance) / 1.6, 0.15, 1);
    }
    const coverage = clamp(a.deltas.length / 3, 0, 1);
    const confidence = Math.round(clamp(0.2 + 0.8 * (0.45 * coverage + 0.55 * agreement), 0, 1) * 100) / 100;
    const b = band(score);

    return {
      key: d.key,
      label: lang === "en" ? d.en : d.he,
      score: score,
      band: b,
      signal_count: a.deltas.length,
      confidence: confidence,
      short: t(NARRATIVE[d.key][b].short, lang),
      detail: t(NARRATIVE[d.key][b].detail, lang),
    };
  });

  const dimByKey = {};
  dimensions.forEach((d) => (dimByKey[d.key] = d));
  // attach {he,en} objects for section builder convenience
  dimensions.forEach((d) => {
    d._short = NARRATIVE[d.key][d.band].short;
    d._detail = NARRATIVE[d.key][d.band].detail;
  });

  // --- 4. portrait -----------------------------------------------------
  const totalParams = PARAMETERS.length;
  const questionnaireCoverage = answeredCount / totalParams;
  const meanDimConfidence = dimensions.reduce((s, d) => s + d.confidence, 0) / dimensions.length;
  const richness = clamp(standout.length / 4, 0, 1);
  const overallConfidence = Math.round(
    clamp(0.3 * questionnaireCoverage + 0.55 * meanDimConfidence + 0.15 * richness, 0, 1) * 100
  ) / 100;

  const tensions = [];
  TENSION_PAIRS.forEach((pair) => {
    const a = dimByKey[pair[0]];
    const b = dimByKey[pair[1]];
    if (!a || !b) return;
    if (a.score >= 60 && b.score >= 60) {
      tensions.push({
        between: [a.key, b.key],
        labels: [a.label, b.label],
        note:
          lang === "en"
            ? `Signals point to both ${a.label.toLowerCase()} and ${b.label.toLowerCase()}. These can pull in opposite directions, so this area is context-dependent rather than fixed — the person likely leans one way in some settings and the other elsewhere.`
            : `הסימנים מצביעים גם על ${a.label} וגם על ${b.label}. אלה יכולים למשוך לכיוונים מנוגדים, ולכן התחום הזה תלוי-הקשר ולא קבוע — סביר שהאדם נוטה לכיוון אחד בהקשרים מסוימים ולשני באחרים.`,
      });
    }
  });

  const ranked = dimensions.slice().sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 3);
  const bottom = ranked.slice(-2);
  const arche = pickArchetype(dimByKey);
  const archetype = {
    id: arche.def.id,
    name: t({ he: arche.def.he, en: arche.def.en }, lang),
    blurb: t(arche.def.blurb, lang),
    match_strength: arche.match_strength,
  };

  // narrative sections need {he,en} short objects; adapt g()
  const sectionDimByKey = {};
  dimensions.forEach((d) => {
    sectionDimByKey[d.key] = { key: d.key, score: d.score, band: d.band, short: d._short, detail: d._detail };
  });
  const rankedForSections = ranked.map((d) => sectionDimByKey[d.key]);
  const sections = buildSections(sectionDimByKey, rankedForSections, standout, tensions, lang);

  const headline =
    lang === "en"
      ? `${archetype.name}: ${top.map((d) => d.label.toLowerCase()).join(", ")} lead this profile.`
      : `${archetype.name}: ${top.map((d) => d.label).join(", ")} מובילים בפרופיל הזה.`;
  const subhead =
    lang === "en"
      ? `Least expressed: ${bottom.map((d) => d.label.toLowerCase()).join(" and ")}. ${standout.length} feature-cluster${standout.length === 1 ? "" : "s"} stood out.`
      : `הכי פחות בא לידי ביטוי: ${bottom.map((d) => d.label).join(" ו")}. זוהו ${standout.length} צירופי מאפיינים בולטים.`;

  return {
    meta: {
      generated_at: new Date().toISOString(),
      language: lang,
      engine_version: "2.0.0",
      answered_parameters: answeredCount,
      total_parameters: totalParams,
      questionnaire_coverage: Math.round(questionnaireCoverage * 100) / 100,
      combinations_fired: standout.length,
    },
    disclaimer: t(
      {
        he: "גרפולוגיה איננה שיטה מדעית מאומתת. מחקרים מבוקרים לא הצליחו להראות שהיא מנבאת אישיות או ביצועים טוב מהניחוש. הדו\"ח נועד להרהור עצמי ולבידור בלבד ואין להשתמש בו לקבלת החלטות לגבי אנשים (גיוס, אבחון, יחסים וכד').",
        en: "Graphology is not a validated science. Controlled studies have failed to show it predicts personality or performance better than chance. This report is for self-reflection and entertainment only and must not be used for decisions about people (hiring, diagnosis, relationships, etc.).",
      },
      lang
    ),
    archetype: archetype,
    headline: headline,
    subhead: subhead,
    confidence: {
      overall: overallConfidence,
      label: confidenceLabel(overallConfidence, lang),
      drivers: {
        questionnaire_coverage: Math.round(questionnaireCoverage * 100) / 100,
        mean_dimension_confidence: Math.round(meanDimConfidence * 100) / 100,
        interaction_richness: Math.round(richness * 100) / 100,
      },
    },
    dimensions: dimensions.map((d) => ({
      key: d.key, label: d.label, score: d.score, band: d.band,
      signal_count: d.signal_count, confidence: d.confidence,
      short: d.short, detail: d.detail,
    })),
    top_traits: top.map((d) => d.key),
    low_traits: bottom.map((d) => d.key),
    standout: standout,
    tensions: tensions,
    sections: sections,
    how_it_works: t(
      {
        he: "כל תשובה בשאלון ממופה במאגר הידע לסדרת השפעות מספריות על 10 מדדי אישיות. לאחר מכן נבדקים צירופי מאפיינים (חוקי אינטראקציה): כשאשכול של סימנים מופיע יחד, מתווספת תובנה ומעודכנים הציונים. המנוע ממיר לציון 0–100 (50 = ניטרלי), מחשב מידת ביטחון לפי כמות הסימנים והסכמתם, ובוחר ארכיטיפ לפי צורת התוצאה. סעיפי 'פירוט הסימנים' ו'צירופים שזוהו' מציגים את כל שרשרת החישוב — אין קופסה שחורה.",
        en: "Each questionnaire answer is mapped in the knowledge base to numeric effects on 10 personality dimensions. Then feature clusters are checked (interaction rules): when a cluster of signals appears together, an insight is added and the scores are updated. The engine converts to a 0–100 score (50 = neutral), derives a confidence value from how many signals agree, and selects an archetype from the shape of the result. The 'signal breakdown' and 'clusters detected' sections show the entire computation chain — there is no black box.",
      },
      lang
    ),
    breakdown: breakdown,
    combinations_detail: combinationsDetail,
  };
}

function validateAnswers(answers) {
  const errors = [];
  answers = answers || {};
  Object.keys(answers).forEach((pid) => {
    const p = PARAM_BY_ID[pid];
    if (!p) { errors.push("Unknown parameter: " + pid); return; }
    if (!p.options.some((o) => o.id === answers[pid])) {
      errors.push("Invalid option '" + answers[pid] + "' for parameter '" + pid + "'");
    }
  });
  return errors;
}

module.exports = { analyze, validateAnswers, DIMENSIONS, PARAMETERS, PARAM_GROUPS };
