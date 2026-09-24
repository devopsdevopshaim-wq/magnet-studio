/*
 * combinations.js
 * ---------------
 * The "deep reading" layer on top of the single-feature engine.
 *
 *  COMBINATIONS - interaction rules. Traditional graphology never reads a single
 *  stroke in isolation; meaning comes from how features co-occur. Each rule fires
 *  only when ALL its conditions are present in the answers, adds a written
 *  insight, and may nudge dimension scores (small deltas, applied after the
 *  linear pass).
 *
 *  ARCHETYPES - a named profile derived from the shape of the final scores, so
 *  the report lands on a recognisable portrait rather than ten loose numbers.
 *
 * Inlined into the n8n Code node alongside knowledge-base.js + analyze.js.
 * ES5-safe, no imports.
 */

/* Each condition value may be a string or an array of accepted option ids. */
const COMBINATIONS = [
  {
    id: "controlled_intensity",
    he: "עוצמה מבוקרת",
    en: "Controlled intensity",
    when: { pressure: "heavy", form: "angular", word_spacing: ["narrow", "balanced"] },
    insight: {
      he: "לחץ חזק יחד עם צורות זוויתיות ורווחים מצומצמים מציירים דחף פנימי חזק המוחזק במושכות קצרות. האנרגיה קיימת בשפע, אך היא מנותבת דרך עקרונות ובקרה עצמית ולא נשפכת החוצה. אחרים עשויים לחוות את הנוכחות כתקיפה או כדרוכה, גם כשלא נאמרת מילה.",
      en: "Heavy pressure with angular forms and tight spacing paints a strong inner drive held on a short rein. The energy is abundant, but it is channelled through principle and self-control rather than spilled outward. Others may experience the presence as forceful or taut even when nothing is said.",
    },
    effects: { drive_energy: 0.5, self_confidence: 0.4, adaptability: -0.4, social_warmth: -0.3 },
  },
  {
    id: "responsive_warmth",
    he: "חמימוּת מגיבה",
    en: "Responsive warmth",
    when: { pressure: "light", slant: ["slight_right", "strong_right"], form: "rounded" },
    insight: {
      he: "לחץ קל, נטייה ימינה וצורות עגולות יחד מעידים על אדם שקולט מהר את מצב הרוח של הסביבה ומגיב אליו רגשית כמעט מיד. זו יכולת אמפתית אמיתית, אך היא באה עם סכנה של ספיגת מתחים של אחרים ושל נתינת יתר עד כדי טשטוש הגבול בין הצרכים שלי לצרכים שלהם.",
      en: "Light pressure, a rightward lean and rounded forms together describe someone who reads the room's mood quickly and responds to it emotionally almost at once. It is a genuine empathic gift, but it comes with the risk of absorbing others' tension and over-giving to the point where the line between one's own needs and theirs blurs.",
    },
    effects: { social_warmth: 0.5, emotional_expression: 0.4, independence: -0.4, self_confidence: -0.3 },
  },
  {
    id: "methodical_observer",
    he: "המתבונן השיטתי",
    en: "The methodical observer",
    when: { size: "small", consistency: ["consistent", "slight_variation"], baseline: "straight", word_spacing: ["balanced", "wide"] },
    insight: {
      he: "כתב קטן, אחיד, על קו בסיס ישר ועם רווחים שמורים מצייר תודעה שמתעדפת דיוק, ריכוז ומרחב אישי. אדם כזה קולט פרטים שרוב האנשים מפספסים, מסיק מסקנות בזהירות, ולא ממהר לחלוק אותן עד שהוא בטוח. החום קיים אך הוא נשמר למעגל קרוב וקטן.",
      en: "Small, consistent writing on a straight baseline with preserved spacing paints a mind that prioritises precision, concentration and personal space. Such a person notices details most people miss, reasons cautiously, and is in no hurry to share conclusions until sure of them. Warmth is present but reserved for a small, close circle.",
    },
    effects: { analytical_thinking: 0.5, detail_orientation: 0.5, independence: 0.4, extraversion: -0.3 },
  },
  {
    id: "momentum_over_detail",
    he: "תנופה על חשבון דיוק",
    en: "Momentum over detail",
    when: { speed: "fast", baseline: ["ascending", "wavy"], size: ["large", "medium"], legibility: ["readable", "hard"] },
    insight: {
      he: "כתב מהיר, שורה שנוטה כלפי מעלה וקריאוּת שנפגעת יחד מעידים על אדם שמונע מתנופה ומחזון. הרעיונות מגיעים מהר והדחף להתקדם חזק, אך הביצוע המדוקדק, הבדיקה החוזרת והשלב הטכני נוטים להישאר מאחור. עובד היטב בפתיחה של דברים, פחות בסגירה שלהם.",
      en: "Fast writing, an upward-tilting line and legibility that suffers together describe someone driven by momentum and vision. Ideas arrive quickly and the urge to move forward is strong, but careful execution, double-checking and the technical stage tend to lag. Works well at the start of things, less so at closing them.",
    },
    effects: { drive_energy: 0.5, adaptability: 0.3, detail_orientation: -0.5, structure_discipline: -0.4 },
  },
  {
    id: "emotional_weather",
    he: "מזג אוויר רגשי",
    en: "Emotional weather",
    when: { slant: "variable", pressure: "variable", baseline: ["wavy", "descending"] },
    insight: {
      he: "שיפוע משתנה, לחץ לא יציב וקו בסיס גלי יחד מעידים על מערכת רגשית תגובתית מאוד, שבה מצב הרוח של היום צובע ממש את התפקוד. ביום טוב היכולות נגישות ומלאות; ביום פחות טוב אותן משימות מרגישות כבדות. ויסות רגשי ומבנה חיצוני קבוע יעזרו כאן יותר מכל דבר אחר.",
      en: "A shifting slant, unstable pressure and a wavy baseline together indicate a highly reactive emotional system, where the mood of the day genuinely colours functioning. On a good day abilities are accessible and full; on a worse day the same tasks feel heavy. Emotional regulation and a fixed external structure will help here more than anything else.",
    },
    effects: { emotional_expression: 0.5, adaptability: 0.3, structure_discipline: -0.5, self_confidence: -0.4 },
  },
  {
    id: "quiet_authority",
    he: "סמכוּת שקטה",
    en: "Quiet authority",
    when: { slant: "vertical", pressure: ["medium", "heavy"], baseline: "straight", consistency: "consistent" },
    insight: {
      he: "כתב זקוף, לחץ יציב, קו בסיס ישר ואחידוּת גבוהה מציירים אדם ששומר על ראש קר, מקיים את מה שהבטיח, ומשדר יציבוּת מבלי להרים את הקול. אנשים נוטים לסמוך עליו ולפנות אליו בשעת משבר. הצד השני: קושי מסוים להראות פגיעוּת או להתרפות.",
      en: "Upright writing, steady pressure, a straight baseline and high consistency paint someone who keeps a level head, does what they said they would, and projects stability without raising their voice. People tend to trust them and turn to them in a crisis. The flip side: some difficulty showing vulnerability or letting go.",
    },
    effects: { self_confidence: 0.5, structure_discipline: 0.4, emotional_expression: -0.3 },
  },
  {
    id: "guarded_inner_world",
    he: "עולם פנימי שמור",
    en: "A guarded inner world",
    when: { slant: ["left", "vertical"], ovals: ["closed", "looped"], word_spacing: "wide" },
    insight: {
      he: "נטייה שמאלה או זקופה, אותיות עגולות סגורות ורווחים רחבים בין מילים יחד מעידים על אדם ששומר את עולמו הפנימי קרוב לחזה. הוא בוחר בקפידה מה לחשוף ולמי, ולוקח זמן להיפתח. מי שמצליח להיכנס פנימה מגלה נאמנוּת ועומק, אך הכניסה עצמה איטית.",
      en: "A leftward or upright slant, closed ovals and wide word spacing together indicate someone who keeps their inner world close to the chest. They choose carefully what to reveal and to whom, and take time to open up. Those who do get in find loyalty and depth, but the entrance itself is slow.",
    },
    effects: { emotional_expression: -0.5, independence: 0.4, social_warmth: -0.3 },
  },
  {
    id: "performer_gap",
    he: "פער בין הבמה לקלעים",
    en: "The stage-and-wings gap",
    when: { signature: ["larger", "underlined"], size: ["small", "medium"], retouching: ["occasional", "frequent"] },
    insight: {
      he: "חתימה גדולה או מודגשת לצד כתב גוף קטן יותר ותיקונים מעידים על פער בין הדימוי שהאדם מקרין כלפי חוץ — בטוח, נוכח — לבין תחושה פנימית ביקורתית ופחות רגועה. הביטחון החיצוני אמיתי כאסטרטגיה, אך הוא עובד קשה כדי לכסות על ספק פנימי.",
      en: "A large or emphasised signature alongside smaller body writing and corrections indicates a gap between the image projected outward — confident, present — and a more critical, less settled inner feeling. The outward confidence is real as a strategy, but it works hard to cover an inner doubt.",
    },
    effects: { self_confidence: -0.4, extraversion: 0.3, emotional_expression: -0.3 },
  },
  {
    id: "open_communicator",
    he: "מתקשר פתוח",
    en: "The open communicator",
    when: { ovals: "open", legibility: ["clear", "readable"], slant: ["slight_right", "strong_right"], connection: ["connected", "mixed"] },
    insight: {
      he: "אותיות עגולות פתוחות, כתב קריא, נטייה ימינה וחיבור בין אותיות יחד מציירים אדם שאוהב לתקשר, אומר את מה שהוא חושב, ומשקיע בכך שהאחר יבין אותו. הוא זורם בשיחה ובונה קשרים בקלות. שווה לו לשים לב מתי גילוי הלב הופך ליותר מדי מהר או מוקדם.",
      en: "Open ovals, legible writing, a rightward lean and connected letters together paint someone who enjoys communicating, says what they think, and invests in being understood. They flow in conversation and build rapport easily. Worth watching for when candour becomes too fast or too soon.",
    },
    effects: { extraversion: 0.4, social_warmth: 0.4, emotional_expression: 0.3 },
  },
  {
    id: "self_contained_engine",
    he: "מנוע עצמאי",
    en: "A self-contained engine",
    when: { connection: "disconnected", word_spacing: "wide", slant: ["vertical", "left"], size: "small" },
    insight: {
      he: "אותיות מנותקות, רווחים רחבים, שיפוע מאופק וכתב קטן יחד מעידים על חשיבה עצמאית ואינטואיטיבית שפועלת הכי טוב ללא הפרעות. אדם כזה מגיע לתובנות בקפיצות, לא בשרשרת לינארית, וזקוק למרחב שקט כדי לתפקד במיטבו. עבודת צוות צמודה מתישה אותו.",
      en: "Disconnected letters, wide spacing, a restrained slant and small writing together indicate independent, intuitive thinking that works best without interruption. Such a person reaches insight in jumps rather than a linear chain, and needs quiet space to function at their best. Close teamwork drains them.",
    },
    effects: { independence: 0.5, analytical_thinking: 0.3, extraversion: -0.3 },
  },
  {
    id: "driven_expansive",
    he: "שאפתן מתפשט",
    en: "Driven and expansive",
    when: { size: "large", capitals: "tall", baseline: "ascending", pressure: ["medium", "heavy"] },
    insight: {
      he: "כתב גדול, אותיות פתיחה גבוהות, שורה עולה ולחץ מלא יחד מציירים שאפתנוּת גלויה וצורך אמיתי בהשפעה ובהכרה. האדם חושב בגדול, לוקח מקום, ומניע אחרים בכוח האנרגיה שלו. האתגר: מרחב לאחרים, וסבלנוּת לפרטים ולתהליכים איטיים.",
      en: "Large writing, tall opening letters, an ascending line and full pressure together paint open ambition and a real need for impact and recognition. This person thinks big, takes up room, and moves others through sheer energy. The challenge: room for others, and patience for detail and slow processes.",
    },
    effects: { drive_energy: 0.5, self_confidence: 0.4, extraversion: 0.3, detail_orientation: -0.3 },
  },
  {
    id: "conscientious_worrier",
    he: "מצפוני ודואג",
    en: "The conscientious worrier",
    when: { retouching: "frequent", legibility: ["clear", "readable"], left_margin: ["narrow", "narrowing"], size: "small" },
    insight: {
      he: "תיקונים תכופים, כתב קריא ומוקפד, שוליים צרים או מצטמצמים וכתב קטן יחד מעידים על אדם עם סטנדרט פנימי גבוה מאוד ומודעוּת חדה לאיך שדברים ייראו. הוא אחראי ויסודי מאוד, אך משלם על כך בחרדת ביצוע ובקושי לשחרר משימה כ'גמורה'.",
      en: "Frequent corrections, careful legible writing, narrow or narrowing margins and small script together indicate someone with a very high internal standard and a sharp awareness of how things will look. They are responsible and very thorough, but pay for it in performance anxiety and difficulty releasing a task as 'done'.",
    },
    effects: { detail_orientation: 0.5, structure_discipline: 0.3, self_confidence: -0.5, adaptability: -0.3 },
  },
  {
    id: "free_spirit",
    he: "רוח חופשית",
    en: "The free spirit",
    when: { line_spacing: "crowded", left_margin: "widening", speed: "fast", consistency: ["irregular", "slight_variation"] },
    insight: {
      he: "שורות צפופות, שוליים מתרחבים, מהירוּת גבוהה ואי-אחידוּת יחד מציירים אדם ספונטני, מלא רעיונות ולא סבלן למסגרות. הוא מבריק בסיעור מוחות ובמצבים משתנים, אבל לוחות זמנים, נהלים ומעקב מרגישים לו כמו כלוב. סביבה גמישה עם מעט מבנה חיצוני מוציאה ממנו את המיטב.",
      en: "Crowded lines, a widening margin, high speed and irregularity together paint someone spontaneous, full of ideas and impatient with frameworks. They shine in brainstorming and shifting situations, but schedules, procedures and follow-up feel like a cage. A flexible environment with just a little external structure brings out their best.",
    },
    effects: { adaptability: 0.5, drive_energy: 0.3, structure_discipline: -0.5 },
  },
  {
    id: "diplomat_blend",
    he: "מזיגה דיפלומטית",
    en: "The diplomatic blend",
    when: { form: "mixed", slant: ["slight_right", "vertical"], legibility: ["clear", "readable"], consistency: ["consistent", "slight_variation"] },
    insight: {
      he: "צורות מעורבות (עגול וזוויתי), שיפוע מתון, כתב קריא ואחידוּת סבירה יחד מעידים על אדם שיודע לעבור בין רכוּת לנחישוּת לפי מה שהמצב דורש. הוא קורא אנשים היטב, בורר מילים, ומצליח להעביר מסר קשה מבלי לשבור את הקשר. חוזק אמיתי בתפקידי גישור, ניהול וממשקים.",
      en: "Mixed forms (rounded and angular), a moderate slant, legible writing and reasonable consistency together indicate someone who can move between softness and firmness as the situation demands. They read people well, choose words, and manage to deliver a hard message without breaking the relationship. A real strength in mediation, management and interface roles.",
    },
    effects: { adaptability: 0.4, social_warmth: 0.3, analytical_thinking: 0.3 },
  },
];

/*
 * ARCHETYPES - matched against the final dimension scores.
 * `need` lists dimensions that must be >= their threshold; the archetype with
 * the most satisfied needs (and highest total margin) wins. There is always a
 * generic fallback so a portrait is always produced.
 */
const ARCHETYPES = [
  {
    id: "architect",
    he: "האדריכל",
    en: "The Architect",
    need: { analytical_thinking: 60, structure_discipline: 58, detail_orientation: 56 },
    blurb: {
      he: "בונה מערכות. רואה את המבנה שמאחורי הבעיה, מתכנן לפני שהוא פועל, ונותן אמון בתהליך מסודר. חזק בתכנון, בארכיטקטורה של פתרונות ובעבודה שדורשת דיוק לאורך זמן. פחות בבית באלתור רגשי ובעמימוּת.",
      en: "A builder of systems. Sees the structure behind the problem, plans before acting, and trusts an orderly process. Strong at planning, at the architecture of solutions and at work that demands sustained precision. Less at home with emotional improvisation and ambiguity.",
    },
  },
  {
    id: "driver",
    he: "המניע",
    en: "The Driver",
    need: { drive_energy: 62, self_confidence: 58, independence: 55 },
    blurb: {
      he: "מנוע של תנועה. מחליט מהר, לוקח אחריות, ודוחף פרויקטים קדימה גם דרך התנגדות. מצוין בהנעה, בפתיחת דרכים ובמצבי לחץ. האתגר: להאט מספיק כדי לקחת אחרים ואת הפרטים.",
      en: "An engine of motion. Decides fast, takes responsibility, and pushes projects forward through resistance. Excellent at driving momentum, opening paths and high-pressure situations. The challenge: slowing enough to bring others and the details along.",
    },
  },
  {
    id: "connector",
    he: "המחבר",
    en: "The Connector",
    need: { extraversion: 60, social_warmth: 60, emotional_expression: 55 },
    blurb: {
      he: "חי מקשרים. קורא אנשים, יוצר אווירה, ומחבר בין אנשים ורעיונות בטבעיוּת. חזק בתפקידים חברתיים, במכירות, בבניית קהילה ובצוותים. שווה לו לשמור אנרגיה גם לעצמו ולהחלטות שדורשות ריחוק.",
      en: "Lives through connection. Reads people, creates atmosphere, and links people and ideas naturally. Strong in social roles, in sales, in community-building and in teams. Worth keeping some energy for themselves and for decisions that need distance.",
    },
  },
  {
    id: "investigator",
    he: "החוקר",
    en: "The Investigator",
    need: { analytical_thinking: 60, independence: 58, detail_orientation: 55 },
    blurb: {
      he: "חושב עצמאי. סקרן, בודק לעומק, ולא מקבל תשובה רק כי כולם מסכימים. פועל הכי טוב עם מרחב שקט ובלי פיקוח צמוד. פחות זקוק לאישור חברתי, יותר לאמת מדויקת.",
      en: "An independent thinker. Curious, digs deep, and won't accept an answer just because everyone agrees. Works best with quiet space and no close supervision. Needs less social approval, more precise truth.",
    },
  },
  {
    id: "diplomat",
    he: "הדיפלומט",
    en: "The Diplomat",
    need: { adaptability: 58, social_warmth: 56, analytical_thinking: 52 },
    blurb: {
      he: "מגשר בין עולמות. עובר בין רכוּת לנחישוּת לפי הצורך, קורא את החדר, ומעביר מסרים קשים בלי לשבור קשרים. חזק בממשקים, בניהול ובמצבים רב-צדדיים.",
      en: "Bridges worlds. Moves between softness and firmness as needed, reads the room, and delivers hard messages without breaking relationships. Strong at interfaces, management and multi-party situations.",
    },
  },
  {
    id: "craftsman",
    he: "בעל המלאכה",
    en: "The Craftsman",
    need: { detail_orientation: 62, structure_discipline: 58, drive_energy: 45 },
    blurb: {
      he: "אדם של ביצוע. סבלני, יסודי, ומביא דברים לגימור מלא. סומכים עליו שמה שיצא מתחת ידיו יהיה נכון. פחות מתלהב מרעיונות מופשטים, יותר מתוצאה ממשית ומדויקת.",
      en: "A person of execution. Patient, thorough, and brings things to a full finish. Trusted that whatever leaves their hands will be right. Less excited by abstract ideas, more by a tangible, accurate result.",
    },
  },
  {
    id: "visionary",
    he: "בעל החזון",
    en: "The Visionary",
    need: { drive_energy: 58, adaptability: 55, analytical_thinking: 52, detail_orientation: 0 },
    blurb: {
      he: "חושב קדימה ובגדול. מלא רעיונות, נדלק ממה שעדיין לא קיים, ומניע אחרים עם תמונה של העתיד. זקוק לצדו מישהו שסוגר פרטים ומתחזק את השגרה.",
      en: "Thinks ahead and big. Full of ideas, energised by what doesn't exist yet, and moves others with a picture of the future. Needs someone beside them who closes details and maintains the routine.",
    },
  },
  {
    id: "anchor",
    he: "העוגן",
    en: "The Anchor",
    need: { structure_discipline: 60, self_confidence: 55, emotional_expression: 0 },
    blurb: {
      he: "נקודת ייחוס יציבה. שומר על ראש קר, מקיים התחייבויות, ואנשים נשענים עליו במשבר. משדר ביטחון בלי להרים קול. האתגר: להראות גם את הצד הפגיע והמתלבט.",
      en: "A stable point of reference. Keeps a level head, honours commitments, and people lean on them in a crisis. Projects security without raising their voice. The challenge: showing the vulnerable, uncertain side too.",
    },
  },
  {
    id: "empath",
    he: "בעל האמפתיה",
    en: "The Empath",
    need: { social_warmth: 62, emotional_expression: 58, adaptability: 50 },
    blurb: {
      he: "קולט רגשות של אחרים כמעט מיד ומגיב אליהם. נותן, מכיל, ומחפש הרמוניה. חזק בליווי, בטיפול ובכל תפקיד שנשען על קשב אנושי. שווה לו לתרגל גבול בין הצרכים שלו לשל הסביבה.",
      en: "Picks up others' emotions almost instantly and responds to them. Gives, contains, and seeks harmony. Strong in support, care and any role built on human attention. Worth practising a boundary between their own needs and the environment's.",
    },
  },
  {
    id: "explorer",
    he: "המגלה",
    en: "The Explorer",
    need: { adaptability: 62, drive_energy: 52, structure_discipline: 0 },
    blurb: {
      he: "משגשג בשינוי. סקרן, ספונטני, ולא נבהל מאי-ודאות. מבריק בסיטואציות חדשות ובסיעור מוחות, פחות אוהב נהלים ולוחות זמנים. סביבה גמישה מוציאה ממנו את המיטב.",
      en: "Thrives on change. Curious, spontaneous, and unfazed by uncertainty. Brilliant in new situations and brainstorming, less fond of procedure and schedules. A flexible environment brings out their best.",
    },
  },
  {
    id: "strategist",
    he: "האסטרטג",
    en: "The Strategist",
    need: { analytical_thinking: 60, self_confidence: 55, structure_discipline: 52 },
    blurb: {
      he: "משלב חשיבה קרה עם ביטחון בהחלטה. רואה כמה מהלכים קדימה, שוקל סיכונים, ופועל כשהתמונה ברורה לו. חזק בתכנון ארוך-טווח ובקבלת החלטות תחת עמימוּת.",
      en: "Combines cold analysis with confidence in the call. Sees several moves ahead, weighs risk, and acts once the picture is clear. Strong at long-range planning and decisions under ambiguity.",
    },
  },
  {
    id: "harmoniser",
    he: "המאזן",
    en: "The Harmoniser",
    need: {},
    fallback: true,
    blurb: {
      he: "פרופיל מאוזן, בלי קצה אחד דומיננטי. יכול לנוע בין תפקידים וסגנונות לפי ההקשר, וזה כשלעצמו יתרון: אין 'ברירת מחדל' שמכתיבה תגובה. כדאי לזהות באילו הקשרים ספציפיים כל צד מתחזק ולבנות עליהם.",
      en: "A balanced profile with no single dominant edge. Able to move between roles and styles by context, which is itself an asset: there is no 'default setting' dictating the response. Worth identifying which specific contexts strengthen each side and building on those.",
    },
  },
];

module.exports = { COMBINATIONS, ARCHETYPES };
