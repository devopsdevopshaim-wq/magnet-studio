/*
 * knowledge-base.js
 * -----------------
 * The canonical graphology knowledge base for the analysis engine.
 *
 * This file is the SINGLE SOURCE OF TRUTH. It is consumed by:
 *   - web/engine/analyze.js          (the deterministic rule engine)
 *   - scripts/build-workflow.mjs     (inlines this file into the n8n Code node)
 *
 * IMPORTANT SCIENTIFIC NOTE
 * ------------------------
 * Graphology (handwriting analysis for personality inference) is NOT an
 * empirically validated science. Controlled studies have repeatedly failed to
 * show that it predicts personality or job performance better than chance.
 * The mappings below are drawn from the traditional graphological literature
 * (Crepieux-Jamin, Klages, Pulver, Saudek, Roman, Olyanova, etc.) and are
 * offered as a structured self-reflection / entertainment tool ONLY.
 * Every report the system produces must carry this disclaimer.
 *
 * DIMENSION MODEL
 * ---------------
 * Each answer option contributes weighted deltas (roughly -2..+2) to a set of
 * 10 personality dimensions. The engine aggregates them into 0..100 scores.
 *
 *   extraversion          - outward social energy vs. inward focus
 *   emotional_expression  - openness of feeling vs. emotional restraint
 *   analytical_thinking   - logical / structured reasoning
 *   detail_orientation    - carefulness, thoroughness, precision
 *   self_confidence       - self-assurance and assertiveness
 *   adaptability          - flexibility, openness to change
 *   drive_energy          - vitality, ambition, pace of action
 *   social_warmth         - empathy, need for connection
 *   structure_discipline  - order, planning, self-regulation
 *   independence          - autonomy vs. need for external anchoring
 */

const DIMENSIONS = [
  { key: "extraversion",         he: "מוחצנוּת",            en: "Extraversion" },
  { key: "emotional_expression", he: "הבעה רגשית",         en: "Emotional expression" },
  { key: "analytical_thinking",  he: "חשיבה אנליטית",      en: "Analytical thinking" },
  { key: "detail_orientation",   he: "תשומת לב לפרטים",    en: "Detail orientation" },
  { key: "self_confidence",      he: "ביטחון עצמי",         en: "Self-confidence" },
  { key: "adaptability",         he: "גמישוּת והסתגלוּת",   en: "Adaptability" },
  { key: "drive_energy",         he: "מרץ ודחף פעולה",      en: "Drive & energy" },
  { key: "social_warmth",        he: "חום חברתי",           en: "Social warmth" },
  { key: "structure_discipline", he: "מבנה ומשמעת עצמית",  en: "Structure & discipline" },
  { key: "independence",         he: "עצמאוּת",             en: "Independence" },
];

/*
 * PARAMETERS
 * Each parameter is one question in the structured questionnaire.
 *   id        - stable key
 *   he/en     - question label
 *   help      - short guidance for the user (he/en)
 *   weight    - how much this parameter counts overall (0..1)
 *   options[] - { id, he, en, interpretation:{he,en}, rationale:{he,en}, effects:{dim:delta} }
 */
const PARAMETERS = [
  {
    id: "slant",
    weight: 1.0,
    he: "שיפוע הכתב",
    en: "Slant",
    help: {
      he: "לאיזה כיוון נוטות האותיות ביחס לקו הבסיס?",
      en: "Which way do the letters lean relative to the baseline?",
    },
    options: [
      {
        id: "left",
        he: "נוטה שמאלה",
        en: "Leans left",
        interpretation: {
          he: "נטייה שמאלה נקשרת במסורת הגרפולוגית לזהירות רגשית, הסתייגות מביטוי חיצוני ונטייה להפנות את הקשב פנימה ואל העבר.",
          en: "A leftward slant is traditionally linked to emotional caution, reticence about outward expression, and a tendency to direct attention inward and toward the past.",
        },
        rationale: {
          he: "בכתב לטיני התנועה הטבעית קדימה היא ימינה (אל הכותב הבא ואל 'האחר'). כתיבה כנגד כיוון זה מתפרשת כריסון של הדחף לפנות החוצה.",
          en: "In Latin script the natural forward motion is rightward (toward the reader and the 'other'). Writing against that direction is read as restraint of the impulse to move outward.",
        },
        effects: { extraversion: -1.4, emotional_expression: -1.2, independence: 0.8, social_warmth: -0.6 },
      },
      {
        id: "vertical",
        he: "אנכי / זקוף",
        en: "Vertical / upright",
        interpretation: {
          he: "כתב זקוף מתפרש כשליטה של השכל על הרגש, איפוק ויכולת לשמור על ראש קר גם במצבים טעונים.",
          en: "Upright writing is read as the head governing the heart: composure, and the ability to stay level-headed under emotional load.",
        },
        rationale: {
          he: "היעדר הטיה לכל כיוון מתפרש כאיזון בין המשיכה אל האחר (ימין) לבין ההסתגרות (שמאל) — עמדה של ניטרליות ושליטה עצמית.",
          en: "The absence of a lean in either direction is read as balance between pull toward others (right) and withdrawal (left) — a stance of neutrality and self-control.",
        },
        effects: { emotional_expression: -0.6, analytical_thinking: 0.9, self_confidence: 0.5, structure_discipline: 0.7, independence: 0.6 },
      },
      {
        id: "slight_right",
        he: "נוטה מעט ימינה",
        en: "Slight rightward lean",
        interpretation: {
          he: "נטייה מתונה ימינה נחשבת ל'ברירת המחדל הבריאה': פתיחות חברתית לצד יכולת לשמור על גבולות, ותגובתיות רגשית מאוזנת.",
          en: "A moderate rightward lean is considered the 'healthy default': social openness together with intact boundaries, and balanced emotional responsiveness.",
        },
        rationale: {
          he: "נטייה קלה בכיוון התנועה הטבעית מסמלת פנייה אל האחר ואל העתיד מבלי לאבד את מרכז הכובד העצמי.",
          en: "A light lean along the natural direction of motion signals turning toward others and the future without losing one's own center of gravity.",
        },
        effects: { extraversion: 0.9, emotional_expression: 0.8, social_warmth: 1.0, adaptability: 0.6 },
      },
      {
        id: "strong_right",
        he: "נוטה חזק ימינה",
        en: "Strong rightward lean",
        interpretation: {
          he: "הטיה חדה ימינה מתפרשת כרגשנות עזה, אימפולסיביות ומעורבות רגשית מהירה — לעיתים על חשבון שיקול דעת מרוחק.",
          en: "A steep rightward slant is read as intense emotionality, impulsiveness and rapid emotional involvement — sometimes at the expense of detached judgement.",
        },
        rationale: {
          he: "ככל שההטיה בכיוון התנועה גדולה יותר, כך נתפס הדחף לפנות אל האחר כחזק ופחות ממותן על ידי בקרה עצמית.",
          en: "The greater the lean along the direction of motion, the more the impulse toward others is seen as strong and less tempered by self-regulation.",
        },
        effects: { extraversion: 1.6, emotional_expression: 1.8, social_warmth: 1.0, drive_energy: 0.8, structure_discipline: -0.9, analytical_thinking: -0.7 },
      },
      {
        id: "variable",
        he: "משתנה / לא עקבי",
        en: "Variable / inconsistent",
        interpretation: {
          he: "שיפוע לא יציב נקשר לרגישות רגשית משתנה, אמביוולנטיות בקבלת החלטות ותגובתיות תלוית-מצב-רוח.",
          en: "An unstable slant is linked to fluctuating emotional sensitivity, ambivalence in decision-making, and mood-dependent reactivity.",
        },
        rationale: {
          he: "חוסר עקביות בזווית מתפרש כהיעדר עמדה רגשית קבועה כלפי הסביבה — הכותב 'מתלבט' פיזית בכל מילה.",
          en: "Inconsistency in the angle is read as the lack of a fixed emotional stance toward the environment — the writer physically 'wavers' with every word.",
        },
        effects: { emotional_expression: 1.0, adaptability: 0.7, structure_discipline: -1.2, self_confidence: -0.9, analytical_thinking: -0.5 },
      },
    ],
  },

  {
    id: "pressure",
    weight: 0.95,
    he: "לחץ הכתיבה",
    en: "Pressure",
    help: {
      he: "כמה חזק נלחץ העט על הנייר? בדוק אם יש חריטה בצד השני של הדף.",
      en: "How hard was the pen pressed? Check whether the writing is embossed on the back of the page.",
    },
    options: [
      {
        id: "light",
        he: "קל",
        en: "Light",
        interpretation: {
          he: "לחץ קל נקשר לרגישוּת, מהירות תפיסה, יכולת הסתגלות גבוהה ולעיתים לרמת אנרגיה פיזית נמוכה יותר או לרתיעה מעימות.",
          en: "Light pressure is linked to sensitivity, quick perception, high adaptability, and sometimes to lower physical energy or aversion to confrontation.",
        },
        rationale: {
          he: "לחץ נתפס כמדד ל'עוצמת ההשקעה' של הכותב בעולם החומרי. מגע קל = השארת חותם עדין, מעורבות פחות תובענית.",
          en: "Pressure is treated as a measure of how forcefully the writer invests in the material world. A light touch leaves a delicate mark — a less demanding form of engagement.",
        },
        effects: { adaptability: 1.2, drive_energy: -1.1, emotional_expression: 0.5, self_confidence: -0.6, analytical_thinking: 0.4 },
      },
      {
        id: "medium",
        he: "בינוני",
        en: "Medium",
        interpretation: {
          he: "לחץ מאוזן מעיד על רמת אנרגיה יציבה, יכולת עמידה במאמץ מתמשך וויסות טוב בין נחישות לגמישות.",
          en: "Balanced pressure suggests steady energy, the capacity to sustain effort over time, and good regulation between persistence and flexibility.",
        },
        rationale: {
          he: "ערך אמצע במדד ההשקעה מתפרש כמשאב זמין ומווסת — לא מבוזבז ולא נצור.",
          en: "A mid-range value on the investment measure is read as an available, well-regulated resource — neither squandered nor withheld.",
        },
        effects: { drive_energy: 0.8, structure_discipline: 0.6, self_confidence: 0.5, adaptability: 0.4 },
      },
      {
        id: "heavy",
        he: "חזק",
        en: "Heavy",
        interpretation: {
          he: "לחץ חזק נקשר לעוצמה, נחישוּת, אנרגיה גופנית גבוהה ועקשנות — ולעיתים למתח פנימי או קושי להרפות.",
          en: "Heavy pressure is linked to force, determination, high physical energy and tenacity — and sometimes to inner tension or difficulty letting go.",
        },
        rationale: {
          he: "השקעת כוח פיזי רב בהותרת החותם מתפרשת כצורך עז להשפיע על הסביבה ולהותיר בה סימן ממשי.",
          en: "Investing significant physical force in leaving the mark is read as a strong need to affect the environment and leave a tangible imprint.",
        },
        effects: { drive_energy: 1.7, self_confidence: 1.0, structure_discipline: 0.7, adaptability: -1.0, emotional_expression: 0.6 },
      },
      {
        id: "variable",
        he: "משתנה",
        en: "Variable",
        interpretation: {
          he: "לחץ לא אחיד נקשר לתנודתיוּת באנרגיה ובמצב הרוח, לרגישוּת גבוהה לגירויים ולפרצי מוטיבציה לא צפויים.",
          en: "Uneven pressure is linked to fluctuations in energy and mood, high sensitivity to stimuli, and unpredictable bursts of motivation.",
        },
        rationale: {
          he: "שינויים בעוצמת החותם לאורך הטקסט מתפרשים כהיעדר ויסות יציב של המשאב האנרגטי.",
          en: "Changes in the strength of the mark across the text are read as the lack of stable regulation of the energetic resource.",
        },
        effects: { emotional_expression: 1.1, adaptability: 0.6, drive_energy: 0.3, structure_discipline: -1.1, self_confidence: -0.5 },
      },
    ],
  },

  {
    id: "size",
    weight: 0.85,
    he: "גודל האותיות",
    en: "Letter size",
    help: {
      he: "גובה אות ממוצעת באזור האמצעי (כמו א, ם, ס). קטן ≈ עד 2 מ\"מ, גדול ≈ מעל 3.5 מ\"מ.",
      en: "Height of an average middle-zone letter. Small ≈ up to 2 mm, large ≈ over 3.5 mm.",
    },
    options: [
      {
        id: "small",
        he: "קטן",
        en: "Small",
        interpretation: {
          he: "כתב קטן נקשר לריכוז, יכולת התבוננות, חשיבה מדויקת וצניעות — ולעיתים לנטייה להימנע מבמה חברתית.",
          en: "Small writing is linked to concentration, observational ability, precise thinking and modesty — and sometimes to a tendency to avoid the social spotlight.",
        },
        rationale: {
          he: "גודל הכתב נתפס כ'נפח הנוכחות' שהכותב תופס במרחב. כתב מצומצם = מיקוד פנימי וצריכת מרחב מעטה.",
          en: "Writing size is treated as the 'volume of presence' the writer occupies in space. Compact writing means inward focus and a small spatial footprint.",
        },
        effects: { analytical_thinking: 1.3, detail_orientation: 1.4, extraversion: -1.2, structure_discipline: 0.7, self_confidence: -0.3 },
      },
      {
        id: "medium",
        he: "בינוני",
        en: "Medium",
        interpretation: {
          he: "גודל סטנדרטי מעיד על תפיסה מציאותית של המקום העצמי בסביבה ועל איזון בין צרכים אישיים לחברתיים.",
          en: "Standard size suggests a realistic sense of one's place in the environment and a balance between personal and social needs.",
        },
        rationale: {
          he: "התאמה לנורמה הכתיבתית מתפרשת כהתאמה חברתית וכהערכה עצמית מציאותית.",
          en: "Conforming to the writing norm is read as social adjustment and a realistic self-appraisal.",
        },
        effects: { adaptability: 0.7, structure_discipline: 0.4, self_confidence: 0.4, social_warmth: 0.4 },
      },
      {
        id: "large",
        he: "גדול",
        en: "Large",
        interpretation: {
          he: "כתב גדול נקשר לביטחון, אקספרסיביות, צורך בהכרה חברתית ובחשיבה רחבה — ולעיתים לקושי בתשומת לב לפרטים.",
          en: "Large writing is linked to confidence, expressiveness, a need for social recognition and big-picture thinking — and sometimes to difficulty with fine detail.",
        },
        rationale: {
          he: "צריכת מרחב רבה על הדף מתפרשת כצורך לתפוס מקום גם בעולם החברתי ובתשומת הלב של האחרים.",
          en: "Consuming a lot of space on the page is read as a need to take up room in the social world and in others' attention.",
        },
        effects: { extraversion: 1.5, self_confidence: 1.2, emotional_expression: 0.9, drive_energy: 0.7, detail_orientation: -1.1, analytical_thinking: -0.5 },
      },
    ],
  },

  {
    id: "word_spacing",
    weight: 0.8,
    he: "רווח בין מילים",
    en: "Word spacing",
    help: {
      he: "האם המילים 'נושקות' זו לזו, שומרות מרחק סביר, או מופרדות במובהק?",
      en: "Do words nearly touch, keep a reasonable gap, or stand markedly apart?",
    },
    options: [
      {
        id: "narrow",
        he: "צפוף",
        en: "Narrow",
        interpretation: {
          he: "רווחים צרים בין מילים נקשרים לצורך בקרבה, לחוסר סבלנות לגבולות בין-אישיים ולעיתים לקושי לשאת בדידות.",
          en: "Narrow gaps between words are linked to a need for closeness, low tolerance for interpersonal boundaries, and sometimes difficulty tolerating solitude.",
        },
        rationale: {
          he: "המרחב בין מילים מייצג את המרחק שהכותב שומר בינו לבין אחרים. רווח קטן = צורך במגע ובנוכחות מתמדת של הזולת.",
          en: "The space between words represents the distance the writer keeps from others. A small gap means a need for contact and the constant presence of others.",
        },
        effects: { social_warmth: 1.3, extraversion: 0.9, independence: -1.2, structure_discipline: -0.5 },
      },
      {
        id: "balanced",
        he: "מאוזן",
        en: "Balanced",
        interpretation: {
          he: "מרחק סביר בין מילים מעיד על יכולת לנהל קרבה ומרחק בגמישות, ועל תחושת גבולות בריאה.",
          en: "A reasonable distance between words suggests the ability to manage closeness and distance flexibly, and a healthy sense of boundaries.",
        },
        rationale: {
          he: "ערך אמצע במדד המרחק הבין-אישי מתפרש כוויסות מותאם של הצורך בקשר מול הצורך במרחב.",
          en: "A mid-range value on the interpersonal-distance measure is read as adaptive regulation of the need for connection versus the need for space.",
        },
        effects: { social_warmth: 0.6, adaptability: 0.6, structure_discipline: 0.5, independence: 0.4 },
      },
      {
        id: "wide",
        he: "רחב",
        en: "Wide",
        interpretation: {
          he: "רווחים גדולים בין מילים נקשרים לצורך במרחב אישי, לחשיבה עצמאית ולעיתים לזהירות או ריחוק חברתי.",
          en: "Large gaps between words are linked to a need for personal space, independent thinking, and sometimes to social caution or distance.",
        },
        rationale: {
          he: "שמירת מרחק רב בין יחידות המשמעות מתפרשת כצורך להפריד בין העצמי לאחר ולשמור על אוטונומיה.",
          en: "Keeping a wide distance between units of meaning is read as a need to separate self from other and preserve autonomy.",
        },
        effects: { independence: 1.4, analytical_thinking: 0.7, extraversion: -0.9, social_warmth: -0.7 },
      },
    ],
  },

  {
    id: "line_spacing",
    weight: 0.7,
    he: "רווח בין שורות",
    en: "Line spacing",
    help: {
      he: "האם הזנבות של אותיות משורה אחת מתערבבים בשורה הבאה, או שיש הפרדה נקייה?",
      en: "Do descenders from one line tangle into the next, or is there clean separation?",
    },
    options: [
      {
        id: "crowded",
        he: "צפוף / שורות מתערבבות",
        en: "Crowded / lines tangle",
        interpretation: {
          he: "שורות דחוסות נקשרות לשפע רעיונות, ספונטניוּת ולעיתים לקושי בתעדוף, בתכנון ובשמירה על סדר.",
          en: "Densely packed lines are linked to an abundance of ideas, spontaneity, and sometimes difficulty prioritising, planning and keeping order.",
        },
        rationale: {
          he: "היעדר מרחב מנוחה בין השורות מתפרש כמחשבה 'שלא מספיקה לנשום' — לחץ פנימי ליצור ולומר הרבה.",
          en: "The lack of resting space between lines is read as thought that 'doesn't get to breathe' — inner pressure to produce and say a great deal.",
        },
        effects: { drive_energy: 1.0, emotional_expression: 0.8, structure_discipline: -1.4, analytical_thinking: -0.6 },
      },
      {
        id: "balanced",
        he: "מאוזן",
        en: "Balanced",
        interpretation: {
          he: "מרווח שורות אחיד ונקי מעיד על חשיבה מאורגנת, יכולת תכנון ובהירות בהצגת רעיונות.",
          en: "Even, clean line spacing suggests organised thinking, planning ability and clarity in presenting ideas.",
        },
        rationale: {
          he: "הפרדה עקבית בין השורות מתפרשת כיכולת לסדר את תוכן התודעה במבנה ברור.",
          en: "Consistent separation between lines is read as the ability to arrange the contents of the mind into a clear structure.",
        },
        effects: { structure_discipline: 1.3, analytical_thinking: 1.0, detail_orientation: 0.6 },
      },
      {
        id: "airy",
        he: "מרווח מאוד",
        en: "Very airy",
        interpretation: {
          he: "מרווחים גדולים בין שורות נקשרים לצורך בפרספקטיבה, בזהירות ובבהירות — ולעיתים לריחוק, בררנוּת או קושי במעורבות.",
          en: "Large gaps between lines are linked to a need for perspective, caution and clarity — and sometimes to detachment, selectiveness or difficulty getting involved.",
        },
        rationale: {
          he: "עודף מרחב 'ריק' סביב הטקסט מתפרש כצורך במרווח נשימה רגשי ובשליטה, לעיתים על חשבון ספונטניוּת.",
          en: "Excess 'empty' space around the text is read as a need for emotional breathing room and control, sometimes at the cost of spontaneity.",
        },
        effects: { analytical_thinking: 0.9, structure_discipline: 0.7, independence: 0.7, extraversion: -0.7, emotional_expression: -0.6 },
      },
    ],
  },

  {
    id: "baseline",
    weight: 0.85,
    he: "קו הבסיס",
    en: "Baseline",
    help: {
      he: "על נייר ללא שורות — האם השורות עולות, יורדות, ישרות או גליות?",
      en: "On unlined paper — do the lines rise, fall, stay straight, or wave?",
    },
    options: [
      {
        id: "ascending",
        he: "עולה",
        en: "Ascending",
        interpretation: {
          he: "שורה שעולה מעלה נקשרת לאופטימיוּת, אנרגיה, שאפתנוּת ומצב רוח מרומם — לעיתים גם לחוסר ריאליזם.",
          en: "A line that climbs is linked to optimism, energy, ambition and elevated mood — sometimes also to a lack of realism.",
        },
        rationale: {
          he: "כיוון אנכי כלפי מעלה מזוהה מסורתית עם 'שאיפה', עלייה ורוח חיובית, בניגוד למשקל הכובד המושך מטה.",
          en: "An upward vertical direction is traditionally identified with 'aspiration', ascent and positive spirit, against the pull of gravity downward.",
        },
        effects: { drive_energy: 1.3, self_confidence: 1.0, extraversion: 0.7, adaptability: 0.4, analytical_thinking: -0.4 },
      },
      {
        id: "straight",
        he: "ישר",
        en: "Straight",
        interpretation: {
          he: "קו בסיס יציב מעיד על יציבוּת רגשית, אמינוּת, שליטה עצמית ועקביוּת בהתנהלות.",
          en: "A stable baseline suggests emotional steadiness, reliability, self-control and consistency of conduct.",
        },
        rationale: {
          he: "שמירה על ישר ללא עזרת שורות מתפרשת כיכולת לווסת דחפים ולשמור על מסלול קבוע למרות הפרעות.",
          en: "Holding a straight line without ruled guides is read as the ability to regulate impulses and hold a steady course despite disturbances.",
        },
        effects: { structure_discipline: 1.4, self_confidence: 0.8, analytical_thinking: 0.6, adaptability: -0.4 },
      },
      {
        id: "descending",
        he: "יורד",
        en: "Descending",
        interpretation: {
          he: "שורה יורדת נקשרת לעייפוּת, פסימיוּת נקודתית, דכדוך או תשישוּת — ולעיתים לריאליזם ביקורתי.",
          en: "A descending line is linked to fatigue, situational pessimism, low mood or exhaustion — and sometimes to critical realism.",
        },
        rationale: {
          he: "כניעה למשקל הכובד המושך מטה מתפרשת כירידה באנרגיה או בהלך הרוח בזמן הכתיבה.",
          en: "Yielding to the downward pull of gravity is read as a drop in energy or mood at the time of writing.",
        },
        effects: { drive_energy: -1.3, self_confidence: -0.9, emotional_expression: -0.5, analytical_thinking: 0.5 },
      },
      {
        id: "wavy",
        he: "גלי / לא יציב",
        en: "Wavy / unstable",
        interpretation: {
          he: "קו בסיס גלי נקשר לגמישוּת, מצב רוח משתנה, סקרנוּת ורגישוּת סביבתית — ולעיתים לחוסר יציבוּת בהחלטות.",
          en: "A wavy baseline is linked to flexibility, changeable mood, curiosity and environmental sensitivity — and sometimes to instability in decisions.",
        },
        rationale: {
          he: "תנודות למעלה ולמטה לאורך השורה מתפרשות כתגובתיוּת מהירה לגירויים פנימיים וחיצוניים.",
          en: "Up-and-down fluctuation along the line is read as rapid reactivity to internal and external stimuli.",
        },
        effects: { adaptability: 1.3, emotional_expression: 0.9, structure_discipline: -1.1, self_confidence: -0.5 },
      },
    ],
  },

  {
    id: "connection",
    weight: 0.6,
    he: "חיבור בין אותיות",
    en: "Letter connection",
    help: {
      he: "רלוונטי בעיקר לכתב לטיני/מחובר. בעברית — עד כמה האותיות במילה נכתבות ברצף אחד מול מנותקות.",
      en: "Mostly relevant to cursive/Latin script. In Hebrew — how far letters within a word flow in one stroke vs. stand apart.",
    },
    options: [
      {
        id: "connected",
        he: "מחובר / רציף",
        en: "Connected / continuous",
        interpretation: {
          he: "כתב רציף נקשר לחשיבה לוגית-רציפה, יכולת התמדה, תכנון קדימה וזרימה בין רעיונות.",
          en: "Continuous writing is linked to sequential-logical thinking, perseverance, forward planning and flow between ideas.",
        },
        rationale: {
          he: "חיבור בין הסימנים מתפרש כיכולת לקשר בין יחידות מידע ולהחזיק שרשרת מחשבה ללא ניתוק.",
          en: "Linking the signs is read as the ability to connect units of information and hold a chain of thought without breaks.",
        },
        effects: { analytical_thinking: 1.2, structure_discipline: 0.8, drive_energy: 0.5, adaptability: -0.4 },
      },
      {
        id: "disconnected",
        he: "מנותק / אות-אות",
        en: "Disconnected / letter by letter",
        interpretation: {
          he: "כתב מנותק נקשר לאינטואיציה, לחשיבה מקורית ולקליטה מהירה של תובנות — ולעיתים לקושי בהתמדה או בשיתוף פעולה.",
          en: "Disconnected writing is linked to intuition, original thinking and quick grasp of insights — and sometimes to difficulty with follow-through or cooperation.",
        },
        rationale: {
          he: "עצירה בין סימן לסימן מתפרשת כרגעי 'האזנה פנימית' — הכותב עוצר לשקול, לחוש או לקבל השראה.",
          en: "Pausing between signs is read as moments of 'inner listening' — the writer stops to weigh, sense or receive inspiration.",
        },
        effects: { independence: 1.2, adaptability: 0.8, analytical_thinking: -0.4, structure_discipline: -0.7, social_warmth: -0.3 },
      },
      {
        id: "mixed",
        he: "מעורב",
        en: "Mixed",
        interpretation: {
          he: "שילוב של חיבור וניתוק מעיד על איזון בין חשיבה שיטתית לאינטואיציה, ועל יכולת לעבור בין המצבים לפי הצורך.",
          en: "A mix of connected and disconnected forms suggests a balance between systematic thinking and intuition, and the ability to switch modes as needed.",
        },
        rationale: {
          he: "מעבר גמיש בין חיבור לניתוק מתפרש כגישה אדפטיבית לעיבוד מידע.",
          en: "Flexible movement between connection and separation is read as an adaptive approach to processing information.",
        },
        effects: { adaptability: 1.1, analytical_thinking: 0.5, independence: 0.5 },
      },
    ],
  },

  {
    id: "left_margin",
    weight: 0.6,
    he: "שוליים שמאליים",
    en: "Left margin",
    help: {
      he: "המרחק מקצה הדף השמאלי לתחילת השורות, ואיך הוא משתנה לאורך העמוד.",
      en: "The gap from the left page edge to where lines begin, and how it changes down the page.",
    },
    options: [
      {
        id: "narrow",
        he: "צרים",
        en: "Narrow",
        interpretation: {
          he: "שוליים שמאליים צרים נקשרים לחיסכון, זהירוּת, קשר לעבר ולמוכר, ולעיתים לחשש מהוצאה או מסיכון.",
          en: "Narrow left margins are linked to thrift, caution, attachment to the past and the familiar, and sometimes to reluctance to spend or take risks.",
        },
        rationale: {
          he: "הצד השמאלי מזוהה עם ה'התחלה', העבר והבית. הצמדה אליו מתפרשת כקושי להתרחק מנקודת המוצא.",
          en: "The left side is identified with 'the beginning', the past and home. Hugging it is read as difficulty moving away from the point of origin.",
        },
        effects: { independence: -0.9, adaptability: -0.8, detail_orientation: 0.7, structure_discipline: 0.5 },
      },
      {
        id: "normal",
        he: "רגילים ואחידים",
        en: "Normal and even",
        interpretation: {
          he: "שוליים אחידים מעידים על תחושת סדר, כבוד למסגרת ויכולת לפעול בתוך כללים מוסכמים.",
          en: "Even margins suggest a sense of order, respect for structure and the ability to operate within agreed rules.",
        },
        rationale: {
          he: "עמידה עקבית בגבול שהוגדר מתפרשת כהפנמה של נורמות והתנהלות מתוכננת.",
          en: "Consistently observing a self-set boundary is read as internalised norms and planned conduct.",
        },
        effects: { structure_discipline: 1.0, detail_orientation: 0.6, adaptability: 0.3 },
      },
      {
        id: "widening",
        he: "מתרחבים כלפי מטה",
        en: "Widening down the page",
        interpretation: {
          he: "שוליים ההולכים ומתרחבים נקשרים לחוסר סבלנוּת, להיסחפוּת ולתאוצה רגשית ככל שהמשימה מתקדמת.",
          en: "Margins that keep widening are linked to impatience, getting carried away, and emotional acceleration as the task progresses.",
        },
        rationale: {
          he: "התרחקות גוברת מנקודת ההתחלה מתפרשת כדחף להתקדם ולסיים, לעיתים על חשבון דיוק.",
          en: "Increasing distance from the starting point is read as an urge to press ahead and finish, sometimes at the expense of precision.",
        },
        effects: { drive_energy: 1.1, extraversion: 0.5, structure_discipline: -0.9, detail_orientation: -0.6 },
      },
      {
        id: "narrowing",
        he: "מצטמצמים כלפי מטה",
        en: "Narrowing down the page",
        interpretation: {
          he: "שוליים ההולכים ומצטמצמים נקשרים לזהירוּת גוברת, לחסכנוּת ולנטייה לבלום את עצמו ככל שמתקדמים.",
          en: "Margins that keep narrowing are linked to growing caution, thrift and a tendency to rein oneself in as one proceeds.",
        },
        rationale: {
          he: "חזרה הדרגתית לכיוון נקודת ההתחלה מתפרשת כמשיכה אחורה, אל הביטחון של המוכר.",
          en: "A gradual return toward the starting point is read as a pull backward, toward the safety of the familiar.",
        },
        effects: { adaptability: -1.0, structure_discipline: 0.5, independence: -0.7, emotional_expression: -0.4 },
      },
    ],
  },

  {
    id: "speed",
    weight: 0.75,
    he: "מהירוּת ושטף",
    en: "Speed & fluency",
    help: {
      he: "האם הכתב נראה מהיר וזורם, מדוד ואיטי, או משהו באמצע?",
      en: "Does the writing look fast and flowing, deliberate and slow, or somewhere between?",
    },
    options: [
      {
        id: "slow",
        he: "איטי ומדוד",
        en: "Slow and deliberate",
        interpretation: {
          he: "כתב איטי נקשר לזהירוּת, יסודיוּת, שליטה ותשומת לב לפרטים — ולעיתים לחוסר ספונטניוּת או להיסוס.",
          en: "Slow writing is linked to caution, thoroughness, control and attention to detail — and sometimes to a lack of spontaneity or to hesitation.",
        },
        rationale: {
          he: "השקעת זמן רב בכל תנועה מתפרשת כצורך בבקרה ובוודאוּת לפני פעולה.",
          en: "Investing a lot of time in each stroke is read as a need for control and certainty before acting.",
        },
        effects: { detail_orientation: 1.3, structure_discipline: 1.0, analytical_thinking: 0.7, drive_energy: -0.9, adaptability: -0.5 },
      },
      {
        id: "moderate",
        he: "בינוני",
        en: "Moderate",
        interpretation: {
          he: "קצב מאוזן מעיד על שילוב בין יעילוּת לדיוק ועל יכולת להתאים את קצב הפעולה לדרישות המשימה.",
          en: "A balanced pace suggests a combination of efficiency and accuracy and the ability to match one's tempo to the task.",
        },
        rationale: {
          he: "ערך אמצע במדד המהירוּת מתפרש כוויסות מותאם בין דחף לפעולה לבין צורך בבקרה.",
          en: "A mid-range speed value is read as adaptive regulation between the drive to act and the need for control.",
        },
        effects: { adaptability: 0.7, structure_discipline: 0.5, drive_energy: 0.4, analytical_thinking: 0.4 },
      },
      {
        id: "fast",
        he: "מהיר וזורם",
        en: "Fast and flowing",
        interpretation: {
          he: "כתב מהיר נקשר לזריזוּת מחשבתית, ספונטניוּת, יוזמה ואנרגיה — ולעיתים לחוסר סבלנוּת ולפגיעה בקריאוּת ובדיוק.",
          en: "Fast writing is linked to mental quickness, spontaneity, initiative and energy — and sometimes to impatience and reduced legibility and accuracy.",
        },
        rationale: {
          he: "מיעוט זמן בכל תנועה מתפרש כביטחון בפעולה וכעדיפות לתפוקה מהירה על פני שלמות הצורה.",
          en: "Spending little time per stroke is read as confidence in action and a preference for fast output over perfect form.",
        },
        effects: { drive_energy: 1.5, extraversion: 0.8, adaptability: 0.9, detail_orientation: -1.1, structure_discipline: -0.7 },
      },
    ],
  },

  {
    id: "form",
    weight: 0.7,
    he: "צורת האותיות",
    en: "Letter form",
    help: {
      he: "האם הצורות נוטות לעגלגלוֹת ורכות, לזוויתיוֹת וחדות, או מעורבות?",
      en: "Do the shapes tend toward rounded and soft, angular and sharp, or mixed?",
    },
    options: [
      {
        id: "rounded",
        he: "עגול ורך",
        en: "Rounded and soft",
        interpretation: {
          he: "צורות עגולות נקשרות לנעימוּת, גמישוּת, חשיבה מכילה ורצון להימנע מחיכוך — ולעיתים לנטייה לוותר או להתפשר.",
          en: "Rounded forms are linked to pleasantness, flexibility, accommodating thinking and a wish to avoid friction — and sometimes to a tendency to concede or compromise.",
        },
        rationale: {
          he: "עקומות רכות דורשות פחות 'התנגדות' ביד ומתפרשות כגישה מקבלת ופייסנית לעולם.",
          en: "Soft curves require less 'resistance' in the hand and are read as a receptive, conciliatory approach to the world.",
        },
        effects: { social_warmth: 1.3, adaptability: 1.0, emotional_expression: 0.6, self_confidence: -0.5, analytical_thinking: -0.4 },
      },
      {
        id: "angular",
        he: "זוויתי וחד",
        en: "Angular and sharp",
        interpretation: {
          he: "צורות זוויתיות נקשרות לנחישוּת, ביקורתיוּת, חשיבה חדה ועקרונוּת — ולעיתים לקשיחוּת או לחוסר גמישוּת בין-אישית.",
          en: "Angular forms are linked to determination, critical thinking, sharp reasoning and principledness — and sometimes to rigidity or interpersonal inflexibility.",
        },
        rationale: {
          he: "זוויות חדות דורשות עצירה ושינוי כיוון מכוון, ומתפרשות כנכונוּת לעמוד על שלך ולהתעמת.",
          en: "Sharp angles require a deliberate stop and change of direction, and are read as a willingness to stand one's ground and confront.",
        },
        effects: { analytical_thinking: 1.2, self_confidence: 1.0, structure_discipline: 0.8, drive_energy: 0.6, social_warmth: -1.1, adaptability: -0.8 },
      },
      {
        id: "mixed",
        he: "מעורב",
        en: "Mixed",
        interpretation: {
          he: "שילוב של עיגול וזוויתיוּת מעיד על יכולת לעבור בין גמישוּת לנחישוּת לפי ההקשר, ועל איזון בין-אישי.",
          en: "A blend of rounded and angular forms suggests the ability to shift between flexibility and firmness by context, and interpersonal balance.",
        },
        rationale: {
          he: "מעבר בין סוגי הצורה מתפרש כרפרטואר התנהגותי מגוון ולא נוקשה.",
          en: "Moving between form types is read as a varied, non-rigid behavioural repertoire.",
        },
        effects: { adaptability: 1.0, social_warmth: 0.4, analytical_thinking: 0.4, self_confidence: 0.4 },
      },
    ],
  },

  {
    id: "zones",
    weight: 0.75,
    he: "דגש אזורי",
    en: "Zonal emphasis",
    help: {
      he: "איזה אזור בולט: העליון (זנבות למעלה כמו ל), האמצעי (גוף האות), או התחתון (זנבות למטה כמו ך, ן)?",
      en: "Which zone stands out: upper (ascenders), middle (letter body), or lower (descenders)?",
    },
    options: [
      {
        id: "upper",
        he: "עליון דומיננטי",
        en: "Upper zone dominant",
        interpretation: {
          he: "הדגשת האזור העליון נקשרת לחשיבה מופשטת, שאיפות, אידאלים ודמיון — ולעיתים לניתוק מהמעשי או מהגופני.",
          en: "Emphasis on the upper zone is linked to abstract thought, aspirations, ideals and imagination — and sometimes to detachment from the practical or the physical.",
        },
        rationale: {
          he: "האזור העליון מזוהה מסורתית עם התחום השכלי והרוחני ('הראש'), ועם מה שמעל היומיום.",
          en: "The upper zone is traditionally identified with the intellectual and spiritual domain ('the head') and with what lies above the everyday.",
        },
        effects: { analytical_thinking: 1.2, drive_energy: 0.5, structure_discipline: 0.4, detail_orientation: -0.4, social_warmth: -0.4 },
      },
      {
        id: "middle",
        he: "אמצעי דומיננטי",
        en: "Middle zone dominant",
        interpretation: {
          he: "הדגשת האזור האמצעי נקשרת למיקוד בהווה, ביחסים בין-אישיים, ברגש היומיומי ובצרכים חברתיים.",
          en: "Emphasis on the middle zone is linked to a focus on the present, on interpersonal relationships, everyday emotion and social needs.",
        },
        rationale: {
          he: "האזור האמצעי מייצג את ה'אני' החברתי הפועל בהווה, בין השאיפות (למעלה) לדחפים (למטה).",
          en: "The middle zone represents the social 'self' operating in the present, between aspirations (above) and drives (below).",
        },
        effects: { social_warmth: 1.2, extraversion: 0.8, emotional_expression: 0.7, analytical_thinking: -0.4 },
      },
      {
        id: "lower",
        he: "תחתון דומיננטי",
        en: "Lower zone dominant",
        interpretation: {
          he: "הדגשת האזור התחתון נקשרת לצרכים חומריים וגופניים, למעשיוּת, לתנועה ולאנרגיה אינסטינקטיבית — ולעיתים לחוסר מנוחה.",
          en: "Emphasis on the lower zone is linked to material and physical needs, practicality, movement and instinctual energy — and sometimes to restlessness.",
        },
        rationale: {
          he: "האזור התחתון מזוהה עם התחום הגופני, החומרי והלא-מודע ('היצר' ו'הקרקע').",
          en: "The lower zone is identified with the physical, material and unconscious domain ('drive' and 'ground').",
        },
        effects: { drive_energy: 1.3, detail_orientation: 0.5, analytical_thinking: -0.4, structure_discipline: -0.4, emotional_expression: 0.5 },
      },
      {
        id: "balanced",
        he: "מאוזן בין האזורים",
        en: "Balanced across zones",
        interpretation: {
          he: "איזון בין שלושת האזורים מעיד על אינטגרציה בין שאיפות, יחסים וצרכים מעשיים, ועל אישיוּת מגובשת.",
          en: "Balance across the three zones suggests integration of aspirations, relationships and practical needs, and a well-consolidated personality.",
        },
        rationale: {
          he: "פרופורציה שווה בין האזורים מתפרשת כהרמוניה בין תחומי החיים השונים.",
          en: "Equal proportion between the zones is read as harmony between the different domains of life.",
        },
        effects: { structure_discipline: 0.8, adaptability: 0.6, self_confidence: 0.6, analytical_thinking: 0.4, social_warmth: 0.4 },
      },
    ],
  },

  {
    id: "signature",
    weight: 0.8,
    he: "חתימה ביחס לטקסט",
    en: "Signature vs. body text",
    help: {
      he: "השווה את החתימה לכתב הרגיל: גודל, קריאוּת, קו תחתי, סגנון.",
      en: "Compare the signature to the ordinary writing: size, legibility, underline, style.",
    },
    options: [
      {
        id: "similar",
        he: "דומה לטקסט",
        en: "Similar to the text",
        interpretation: {
          he: "חתימה התואמת את הכתב הרגיל מעידה על התאמה בין הדימוי העצמי הפומבי לבין החוויה הפנימית — אותנטיוּת ועקביוּת.",
          en: "A signature that matches the ordinary writing suggests alignment between the public self-image and inner experience — authenticity and consistency.",
        },
        rationale: {
          he: "החתימה מייצגת את ה'אני הפומבי' והטקסט את ה'אני הפרטי'. דמיון ביניהם = פער קטן בין החזית לפנים.",
          en: "The signature represents the 'public self' and the text the 'private self'. Similarity means a small gap between the front and the interior.",
        },
        effects: { self_confidence: 0.7, structure_discipline: 0.6, emotional_expression: 0.3, adaptability: 0.3 },
      },
      {
        id: "larger",
        he: "גדולה משמעותית מהטקסט",
        en: "Markedly larger than the text",
        interpretation: {
          he: "חתימה גדולה בהרבה מהכתב נקשרת לשאיפה להכרה, לביטחון עצמי מוצג כלפי חוץ ולעיתים לפער בין דימוי חיצוני לתחושה פנימית.",
          en: "A signature much larger than the text is linked to a striving for recognition, outward-projected confidence, and sometimes a gap between external image and inner feeling.",
        },
        rationale: {
          he: "הגדלת ה'אני הפומבי' ביחס ל'אני הפרטי' מתפרשת כצורך להיראות ולתפוס מקום בזירה החברתית.",
          en: "Enlarging the 'public self' relative to the 'private self' is read as a need to be seen and to take up space in the social arena.",
        },
        effects: { self_confidence: 1.1, extraversion: 1.0, drive_energy: 0.7, independence: 0.5, detail_orientation: -0.4 },
      },
      {
        id: "smaller",
        he: "קטנה מהטקסט",
        en: "Smaller than the text",
        interpretation: {
          he: "חתימה קטנה מהכתב נקשרת לצניעוּת, להסתייגוּת מחשיפה ולעיתים להערכה עצמית נמוכה בזירה הפומבית.",
          en: "A signature smaller than the text is linked to modesty, reluctance to be exposed, and sometimes low self-regard in the public arena.",
        },
        rationale: {
          he: "הקטנת ה'אני הפומבי' מתפרשת כרצון לצמצם נוכחות ולהימנע מתשומת לב.",
          en: "Shrinking the 'public self' is read as a wish to reduce one's presence and avoid attention.",
        },
        effects: { self_confidence: -1.0, extraversion: -0.9, detail_orientation: 0.5, social_warmth: 0.3 },
      },
      {
        id: "illegible",
        he: "לא קריאה / מקושקשת",
        en: "Illegible / scrawled",
        interpretation: {
          he: "חתימה בלתי קריאה נקשרת לרצון לשמור על פרטיוּת, למהירוּת ולעיתים לחוסר סבלנוּת או להסתרה של העצמי מפני האחר.",
          en: "An illegible signature is linked to a wish to guard privacy, to speed, and sometimes to impatience or concealment of the self from others.",
        },
        rationale: {
          he: "טשטוש ה'אני הפומבי' מתפרש כשמירה על מרחק — 'הנה אני, אך לא תדעו בדיוק מי'.",
          en: "Blurring the 'public self' is read as keeping distance — 'here I am, but you won't know exactly who'.",
        },
        effects: { independence: 1.0, drive_energy: 0.6, social_warmth: -0.7, detail_orientation: -0.7, structure_discipline: -0.4 },
      },
      {
        id: "underlined",
        he: "עם קו תחתי / הדגשה",
        en: "Underlined / emphasised",
        interpretation: {
          he: "קו תחת החתימה נקשר לצורך בהדגשה עצמית, לביטחון בערך האישי ולעיתים לצורך באישור חיצוני.",
          en: "An underline beneath the signature is linked to a need for self-assertion, confidence in one's worth, and sometimes a need for external validation.",
        },
        rationale: {
          he: "הוספת קו מתחת לשם מתפרשת כ'קו תחתון' פסיכולוגי — הכרזה על נוכחות ועל חשיבוּת.",
          en: "Adding a line under the name is read as a psychological 'bottom line' — a declaration of presence and importance.",
        },
        effects: { self_confidence: 1.0, drive_energy: 0.6, extraversion: 0.5, structure_discipline: 0.4 },
      },
    ],
  },

  {
    id: "consistency",
    weight: 0.7,
    he: "אחידוּת הכתב",
    en: "Overall consistency",
    help: {
      he: "עד כמה גודל, שיפוע, לחץ ורווחים נשארים אחידים לאורך כל הדגימה?",
      en: "How uniform are size, slant, pressure and spacing across the whole sample?",
    },
    options: [
      {
        id: "consistent",
        he: "אחיד מאוד",
        en: "Very consistent",
        interpretation: {
          he: "כתב אחיד מעיד על יציבוּת רגשית, אמינוּת, משמעת עצמית גבוהה ויכולת לספק תפוקה צפויה לאורך זמן.",
          en: "Consistent writing suggests emotional stability, reliability, high self-discipline and the ability to deliver predictable output over time.",
        },
        rationale: {
          he: "שמירה על אותם ערכים גרפיים לאורך הטקסט מתפרשת כשליטה בדחפים וכעקביוּת פנימית.",
          en: "Holding the same graphic values throughout the text is read as impulse control and inner consistency.",
        },
        effects: { structure_discipline: 1.5, self_confidence: 0.8, analytical_thinking: 0.6, detail_orientation: 0.6, adaptability: -0.5 },
      },
      {
        id: "slight_variation",
        he: "שונוּת קלה",
        en: "Slight variation",
        interpretation: {
          he: "שונוּת מתונה מעידה על איזון בין יציבוּת לחיוּת — אדם עקבי אך לא נוקשה, המגיב לסביבה מבלי לאבד מסלול.",
          en: "Moderate variation suggests a balance between stability and liveliness — someone consistent but not rigid, who responds to the environment without losing their course.",
        },
        rationale: {
          he: "תנודות קטנות סביב ערך יציב מתפרשות כגמישוּת בריאה בתוך מסגרת.",
          en: "Small fluctuations around a stable value are read as healthy flexibility within a framework.",
        },
        effects: { adaptability: 0.9, structure_discipline: 0.6, emotional_expression: 0.5, self_confidence: 0.4 },
      },
      {
        id: "irregular",
        he: "לא אחיד בעליל",
        en: "Markedly irregular",
        interpretation: {
          he: "כתב לא אחיד נקשר לרגישוּת גבוהה, תנודתיוּת רגשית, יצירתיוּת לא ממושמעת ולעיתים למתח, עומס או חוסר יציבוּת.",
          en: "Irregular writing is linked to high sensitivity, emotional volatility, undisciplined creativity, and sometimes to tension, overload or instability.",
        },
        rationale: {
          he: "היעדר ערך גרפי יציב מתפרש כקושי לווסת דחפים ותגובות באופן עקבי.",
          en: "The absence of a stable graphic value is read as difficulty regulating impulses and reactions consistently.",
        },
        effects: { emotional_expression: 1.3, adaptability: 0.6, structure_discipline: -1.6, self_confidence: -0.9, detail_orientation: -0.6 },
      },
    ],
  },

  {
    id: "capitals",
    weight: 0.7,
    he: "אותיות פתיחה / רישיות",
    en: "Capitals / opening letters",
    help: {
      he: "גובה ובולטוּת האות הראשונה במילה או במשפט ביחס לשאר האותיות.",
      en: "The height and prominence of the first letter of a word or sentence relative to the rest.",
    },
    options: [
      {
        id: "tall",
        he: "גבוהות ובולטות מאוד",
        en: "Very tall and prominent",
        interpretation: {
          he: "אותיות פתיחה גדולות במיוחד נקשרות לגאווה, לצורך בהכרה ולדימוי עצמי מוגבה — ולעיתים לפער בין השאיפה לתחושת הערך בפועל.",
          en: "Unusually large opening letters are linked to pride, a need for recognition and an elevated self-image — and sometimes to a gap between ambition and actual self-worth.",
        },
        rationale: {
          he: "האות הראשונה נתפסת כ'הצהרת הפתיחה' של הכותב על עצמו. הגדלתה = הדגשת ה'אני' בכניסה לכל יחידת תוכן.",
          en: "The first letter is read as the writer's 'opening statement' about themselves. Enlarging it emphasises the 'I' at the entry to every unit of content.",
        },
        effects: { self_confidence: 1.1, drive_energy: 0.7, extraversion: 0.7, independence: 0.6, social_warmth: -0.4 },
      },
      {
        id: "proportionate",
        he: "מודגשות במידה",
        en: "Moderately emphasised",
        interpretation: {
          he: "אות פתיחה מודגשת במידה סבירה מעידה על הערכה עצמית מציאותית, על כבוד עצמי בריא ועל תחושת מקום מאוזנת.",
          en: "A reasonably emphasised opening letter suggests realistic self-esteem, healthy self-respect and a balanced sense of one's place.",
        },
        rationale: {
          he: "פרופורציה מקובלת בין האות הראשונה לשאר מתפרשת כהתאמה בין הדימוי העצמי לנורמה החברתית.",
          en: "A conventional proportion between the first letter and the rest is read as alignment between self-image and the social norm.",
        },
        effects: { self_confidence: 0.6, structure_discipline: 0.5, social_warmth: 0.4, adaptability: 0.4 },
      },
      {
        id: "flat",
        he: "כמעט ללא בליטה",
        en: "Barely distinguished",
        interpretation: {
          he: "אות פתיחה שאינה בולטת נקשרת לצניעוּת, להמעטה בערך עצמי בפומבי ולעיתים לרתיעה מלתפוס עמדה מובילה.",
          en: "An opening letter that barely stands out is linked to modesty, public understatement of self-worth, and sometimes reluctance to take a leading position.",
        },
        rationale: {
          he: "ויתור על הדגשת האות הראשונה מתפרש כוויתור על הבלטת ה'אני' בכניסה לתוכן.",
          en: "Forgoing emphasis on the first letter is read as forgoing prominence of the 'I' when entering content.",
        },
        effects: { self_confidence: -0.8, extraversion: -0.6, social_warmth: 0.5, independence: -0.4 },
      },
    ],
  },

  {
    id: "ovals",
    weight: 0.6,
    he: "פתיחוּת האותיות העגולות",
    en: "Openness of oval letters",
    help: {
      he: "אותיות עגולות (o, a, ס, ם, ע) — פתוחות למעלה, סגורות היטב, או סגורות עם לולאה כפולה? (רלוונטי בעיקר לכתב לטיני, נכון בחלקו לעברית.)",
      en: "Round letters (o, a) — open at the top, firmly closed, or closed with a double loop? (Mostly Latin-script; partly applies to Hebrew.)",
    },
    options: [
      {
        id: "open",
        he: "פתוחות למעלה",
        en: "Open at the top",
        interpretation: {
          he: "אותיות עגולות פתוחות נקשרות לגילוי לב, לדברנוּת, לנכונוּת לשתף ולתקשורת זורמת — ולעיתים לקושי לשמור סוד.",
          en: "Open oval letters are linked to candour, talkativeness, willingness to share and fluid communication — and sometimes to difficulty keeping a secret.",
        },
        rationale: {
          he: "ה'כלי' של האות נותר פתוח כלפי חוץ, ומתפרש כתקשורת פנימית הזורמת החוצה ללא חסימה.",
          en: "The 'vessel' of the letter stays open outward, read as inner content flowing out unobstructed.",
        },
        effects: { emotional_expression: 1.0, extraversion: 0.8, social_warmth: 0.7, detail_orientation: -0.5, structure_discipline: -0.4 },
      },
      {
        id: "closed",
        he: "סגורות היטב",
        en: "Firmly closed",
        interpretation: {
          he: "אותיות עגולות סגורות היטב נקשרות לשיקול דעת בדיבור, לשמירה על פרטיוּת ולזהירוּת לגבי מה משתפים ועם מי.",
          en: "Firmly closed ovals are linked to discretion in speech, guarding of privacy and care about what is shared and with whom.",
        },
        rationale: {
          he: "סגירת ה'כלי' מתפרשת כבקרה על מעבר המידע מהפנים אל החוץ.",
          en: "Closing the 'vessel' is read as control over the passage of information from inside to outside.",
        },
        effects: { detail_orientation: 0.7, structure_discipline: 0.6, analytical_thinking: 0.5, emotional_expression: -0.7, social_warmth: -0.4 },
      },
      {
        id: "looped",
        he: "סגורות עם לולאה כפולה",
        en: "Closed with a double loop",
        interpretation: {
          he: "לולאות כפולות באותיות עגולות נקשרות מסורתית לזהירוּת יתר בדיבור, לנטייה להסתייג או להגן על העמדה — ולעיתים לחשדנוּת.",
          en: "Double loops in oval letters are traditionally linked to over-caution in speech, a tendency to qualify or defend one's position — and sometimes to wariness.",
        },
        rationale: {
          he: "שכבת סגירה נוספת מתפרשת כהגנה כפולה על התוכן הפנימי מפני חשיפה.",
          en: "An extra layer of closure is read as a double guard on inner content against exposure.",
        },
        effects: { detail_orientation: 0.6, emotional_expression: -0.8, social_warmth: -0.6, adaptability: -0.5, analytical_thinking: 0.4 },
      },
    ],
  },

  {
    id: "endings",
    weight: 0.6,
    he: "משיכות סיום",
    en: "Terminal strokes",
    help: {
      he: "הקצה של האות/המילה האחרונה: נמשך קדימה בנדיבוּת, נקטע בחדוּת, או מסתלסל כלפי מעלה/אחורה?",
      en: "The end of the last letter or word: extended forward generously, cut off sharply, or curling up/back?",
    },
    options: [
      {
        id: "extended",
        he: "נמשכות קדימה",
        en: "Extended forward",
        interpretation: {
          he: "משיכות סיום נדיבות נקשרות לנדיבוּת, לחמימוּת, לנכונוּת לתת ולפתיחוּת כלפי הבא בתור — ולעיתים לקושי לסיים אינטראקציה.",
          en: "Generous terminal strokes are linked to generosity, warmth, willingness to give and openness toward whoever comes next — and sometimes to difficulty ending an interaction.",
        },
        rationale: {
          he: "הארכת התנועה אל מעבר לגבול ההכרחי מתפרשת כמתן מעצמו אל המרחב שאחרי.",
          en: "Extending the movement past the necessary boundary is read as giving of oneself into the space beyond.",
        },
        effects: { social_warmth: 1.1, extraversion: 0.6, emotional_expression: 0.5, structure_discipline: -0.4 },
      },
      {
        id: "cut",
        he: "נקטעות בחדוּת",
        en: "Cut off abruptly",
        interpretation: {
          he: "סיומים חתוכים נקשרים לענייניוּת, לגבולות ברורים, ליכולת לסיים ולומר 'עד כאן' — ולעיתים לחוסר סבלנוּת או קמצנוּת רגשית.",
          en: "Abrupt endings are linked to matter-of-factness, clear boundaries, the ability to conclude and say 'that's enough' — and sometimes to impatience or emotional thrift.",
        },
        rationale: {
          he: "עצירה מדויקת בגבול ההכרחי מתפרשת כשליטה וכחיסכון בתנועה ובנתינה.",
          en: "Stopping precisely at the necessary boundary is read as control and economy of movement and of giving.",
        },
        effects: { structure_discipline: 0.7, analytical_thinking: 0.5, self_confidence: 0.5, social_warmth: -0.7, emotional_expression: -0.5 },
      },
      {
        id: "hooked",
        he: "מסתלסלות אחורה / כלפי מעלה",
        en: "Curling back / upward",
        interpretation: {
          he: "סיומים המסתלסלים אחורה נקשרים לשמירת משאבים לעצמו, לזהירוּת, לעיתים לעקשנוּת או לצורך בהחזקה ובשליטה.",
          en: "Endings that curl back are linked to keeping resources for oneself, caution, and sometimes to stubbornness or a need to hold on and control.",
        },
        rationale: {
          he: "היפוך כיוון התנועה בסיום מתפרש כמשיכה חזרה אל העצמי במקום מסירה החוצה.",
          en: "Reversing the direction of motion at the end is read as pulling back toward the self instead of releasing outward.",
        },
        effects: { independence: 0.7, detail_orientation: 0.5, adaptability: -0.6, social_warmth: -0.5, self_confidence: 0.3 },
      },
    ],
  },

  {
    id: "legibility",
    weight: 0.8,
    he: "קריאוּת הכתב",
    en: "Legibility",
    help: {
      he: "עד כמה קל לקורא זר לפענח את הכתב מבלי לנחש?",
      en: "How easily can an unfamiliar reader decode the writing without guessing?",
    },
    options: [
      {
        id: "clear",
        he: "ברור וקריא מאוד",
        en: "Very clear and legible",
        interpretation: {
          he: "כתב קריא מעיד על תקשורת בהירה, על התחשבוּת בקורא, על שקיפוּת ועל רצון להיות מובן — ולעיתים על צורך בשליטה בצורה.",
          en: "Legible writing suggests clear communication, consideration for the reader, transparency and a wish to be understood — and sometimes a need to control form.",
        },
        rationale: {
          he: "השקעת מאמץ בכך שהאחר יפענח בקלות מתפרשת כהתחשבוּת וכפתיחוּת בתקשורת.",
          en: "Investing effort so the other can decode easily is read as consideration and openness in communication.",
        },
        effects: { structure_discipline: 0.9, social_warmth: 0.7, detail_orientation: 0.7, analytical_thinking: 0.4 },
      },
      {
        id: "readable",
        he: "קריא ברוב המקרים",
        en: "Mostly readable",
        interpretation: {
          he: "קריאוּת סבירה מעידה על איזון בין הצורך להיות מובן לבין קצב וזרימה אישיים.",
          en: "Reasonable legibility suggests a balance between the need to be understood and personal pace and flow.",
        },
        rationale: {
          he: "פשרה בין בהירוּת למהירוּת מתפרשת כתקשורת מותאמת-מצב.",
          en: "A compromise between clarity and speed is read as situationally-tuned communication.",
        },
        effects: { adaptability: 0.6, structure_discipline: 0.4, drive_energy: 0.4 },
      },
      {
        id: "hard",
        he: "קשה לפענוח",
        en: "Hard to decipher",
        interpretation: {
          he: "כתב לא קריא נקשר למחשבה מהירה שהיד לא מדביקה, למיקוד בתוכן על חשבון הצורה, לעיתים לחוסר סבלנוּת או לריחוק מהקורא.",
          en: "Illegible writing is linked to thinking too fast for the hand, focus on content over form, and sometimes to impatience or distance from the reader.",
        },
        rationale: {
          he: "ויתור על בהירוּת עבור הקורא מתפרש כמיקוד בתהליך הפנימי יותר מאשר בהעברה החוצה.",
          en: "Sacrificing clarity for the reader is read as focus on the inner process more than on transmission outward.",
        },
        effects: { drive_energy: 0.9, independence: 0.6, analytical_thinking: 0.3, structure_discipline: -0.9, detail_orientation: -0.9, social_warmth: -0.6 },
      },
    ],
  },

  {
    id: "retouching",
    weight: 0.7,
    he: "תיקונים וחיזוקים",
    en: "Corrections & retouching",
    help: {
      he: "האם יש מעברים חוזרים על אותיות, תיקונים, מחיקות או 'שיפוצים' של צורות?",
      en: "Are there strokes gone over twice, corrections, crossings-out or 'touch-ups' of letter shapes?",
    },
    options: [
      {
        id: "none",
        he: "כמעט ואין",
        en: "Almost none",
        interpretation: {
          he: "היעדר תיקונים מעיד על ביטחון בפעולה, על קבלת עצמי ועל נכונוּת להשאיר את הדברים כפי שיצאו.",
          en: "The absence of corrections suggests confidence in action, self-acceptance and a willingness to let things stand as they came out.",
        },
        rationale: {
          he: "אי-חזרה על מה שנכתב מתפרש כהיעדר צורך לבקר ולתקן את עצמו בדיעבד.",
          en: "Not returning to what was written is read as the absence of a need to review and correct oneself after the fact.",
        },
        effects: { self_confidence: 1.0, drive_energy: 0.5, adaptability: 0.5, emotional_expression: 0.3 },
      },
      {
        id: "occasional",
        he: "מדי פעם",
        en: "Occasional",
        interpretation: {
          he: "תיקונים מדי פעם מעידים על בקרה עצמית מותאמת — שמירה על סטנדרט מבלי להיתקע בו.",
          en: "Occasional corrections suggest adaptive self-monitoring — maintaining a standard without getting stuck on it.",
        },
        rationale: {
          he: "חזרה מדודה על פרטים מתפרשת כאיזון בין דיוק לזרימה.",
          en: "Measured revisiting of details is read as a balance between accuracy and flow.",
        },
        effects: { detail_orientation: 0.7, structure_discipline: 0.6, analytical_thinking: 0.4 },
      },
      {
        id: "frequent",
        he: "תכופים",
        en: "Frequent",
        interpretation: {
          he: "תיקונים רבים נקשרים לפרפקציוניזם, לבקרה עצמית גבוהה, לחרדת ביצוע ולעיתים לקושי לשחרר ולהסתפק ב'מספיק טוב'.",
          en: "Many corrections are linked to perfectionism, high self-monitoring, performance anxiety, and sometimes difficulty letting go and settling for 'good enough'.",
        },
        rationale: {
          he: "חזרה תכופה אל מה שכבר נכתב מתפרשת כצורך מתמשך לתקן את הרושם שהותרת.",
          en: "Frequently returning to what is already written is read as an ongoing need to fix the impression left behind.",
        },
        effects: { detail_orientation: 1.1, structure_discipline: 0.5, self_confidence: -0.9, adaptability: -0.7, emotional_expression: -0.4 },
      },
    ],
  },

  {
    id: "page_use",
    weight: 0.7,
    he: "ניצול העמוד",
    en: "Use of the page",
    help: {
      he: "מבט-על על העמוד כולו: מאוזן ומאוורר, צפוף וממלא כל פינה, או מרוכז בחלק קטן מהדף?",
      en: "The whole page at a glance: balanced and airy, dense and filling every corner, or confined to a small part of the sheet?",
    },
    options: [
      {
        id: "balanced",
        he: "מאוזן ומאוורר",
        en: "Balanced and airy",
        interpretation: {
          he: "ניצול מאוזן של העמוד מעיד על תחושת סדר, על חוש אסתטי, על יכולת תכנון מרחבי ועל יחס בטוח לסביבה.",
          en: "Balanced use of the page suggests a sense of order, an aesthetic eye, spatial planning ability and a secure relationship to one's environment.",
        },
        rationale: {
          he: "העמוד מייצג את 'שדה הפעולה' של הכותב. חלוקה הרמונית שלו מתפרשת כארגון פנימי וכשליטה במרחב.",
          en: "The page represents the writer's 'field of action'. Dividing it harmoniously is read as inner organisation and command of space.",
        },
        effects: { structure_discipline: 1.1, analytical_thinking: 0.6, self_confidence: 0.6, detail_orientation: 0.5, adaptability: 0.4 },
      },
      {
        id: "dense",
        he: "צפוף וממלא את הדף",
        en: "Dense, fills the sheet",
        interpretation: {
          he: "מילוי צפוף של העמוד נקשר לשפע פנימי, לחסכנוּת, לצורך למצות כל משאב ולעיתים לקושי לתת לעצמו ולאחרים מרחב.",
          en: "Filling the page densely is linked to inner abundance, thrift, a need to use every resource, and sometimes difficulty giving oneself and others space.",
        },
        rationale: {
          he: "אי-השארת מרחב פנוי מתפרש כחרדה מפני ריק או כדחף למצות את השדה עד תום.",
          en: "Leaving no empty space is read as anxiety about emptiness or a drive to exhaust the field completely.",
        },
        effects: { drive_energy: 0.9, detail_orientation: 0.6, emotional_expression: 0.5, structure_discipline: -0.7, independence: -0.5 },
      },
      {
        id: "confined",
        he: "מרוכז בחלק קטן",
        en: "Confined to a small area",
        interpretation: {
          he: "כתיבה המרוכזת בפינה או בחלק קטן של הדף נקשרת לזהירוּת, להסתייגוּת, לצניעוּת ולעיתים לחוסר ביטחון בתפיסת מקום.",
          en: "Writing confined to a corner or a small part of the sheet is linked to caution, reticence, modesty, and sometimes to insecurity about taking up space.",
        },
        rationale: {
          he: "אי-שימוש ברוב 'שדה הפעולה' הזמין מתפרש כצמצום עצמי וכחשש להתפרש.",
          en: "Not using most of the available 'field of action' is read as self-contraction and a fear of spreading out.",
        },
        effects: { self_confidence: -0.9, extraversion: -0.7, drive_energy: -0.6, detail_orientation: 0.4 },
      },
    ],
  },
];

/*
 * Presentation groups for the questionnaire UI (order matters).
 * Every parameter id must appear in exactly one group.
 */
const PARAM_GROUPS = [
  {
    id: "movement",
    he: "תנועה וקצב",
    en: "Movement & rhythm",
    hint: { he: "איך היד נעה על הדף", en: "how the hand moves across the page" },
    params: ["slant", "pressure", "speed", "baseline"],
  },
  {
    id: "space",
    he: "מרחב ופריסה",
    en: "Space & layout",
    hint: { he: "איך הכתב מחלק את הדף", en: "how the writing divides the page" },
    params: ["size", "word_spacing", "line_spacing", "left_margin", "page_use"],
  },
  {
    id: "form",
    he: "צורה ומבנה",
    en: "Form & structure",
    hint: { he: "צורת האותיות עצמן", en: "the shape of the letters themselves" },
    params: ["form", "connection", "zones", "ovals", "endings"],
  },
  {
    id: "expression",
    he: "ביטוי ובקרה",
    en: "Expression & control",
    hint: { he: "כמה הכתב מווסת או משוחרר", en: "how regulated or released the writing is" },
    params: ["consistency", "legibility", "retouching"],
  },
  {
    id: "self",
    he: "דימוי עצמי",
    en: "Self-image",
    hint: { he: "איך הכותב מציג את ה'אני'", en: "how the writer presents the 'I'" },
    params: ["capitals", "signature"],
  },
];

module.exports = { DIMENSIONS, PARAMETERS, PARAM_GROUPS };
