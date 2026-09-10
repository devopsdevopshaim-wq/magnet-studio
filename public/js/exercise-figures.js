/* איורי תרגילים — פיגורה מצוירת ב-SVG לכל תרגיל (תנוחת מפתח + חץ תנועה).
   מקומי לגמרי, נטען עם fitness.js. currentColor = --brass-soft; החץ ב---ember. */
(function () {
  var W = "http://www.w3.org/2000/svg";
  // עוטף: קרקע + סגנון אחיד
  function wrap(inner, opts) {
    opts = opts || {};
    var ground = opts.ground === false ? "" : '<line x1="8" y1="112" x2="152" y2="112" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>';
    return '<svg viewBox="0 0 160 120" xmlns="' + W + '" role="img" aria-label="' + (opts.label || "") + '" ' +
      'style="color:var(--brass-soft)">' +
      '<g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' +
      ground + inner + "</g></svg>";
  }
  var arrow =
    '<defs><marker id="fa" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
    '<path d="M0 0 L10 5 L0 10 z" fill="var(--ember)"/></marker></defs>';
  function mo(d) { return arrow + '<path d="' + d + '" stroke="var(--ember)" stroke-width="2.5" stroke-dasharray="4 4" marker-end="url(#fa)"/>'; }
  function head(cx, cy) { return '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="currentColor"/>'; }

  var F = {
    // סקוואט — ירידת אגן אחורה-מטה
    squat: wrap(
      head(74, 40) +
      '<path d="M74 48 L78 74"/>' +            // גו
      '<path d="M78 74 L64 92 L64 112"/>' +    // רגל אחורית
      '<path d="M78 74 L96 92 L96 112"/>' +    // רגל קדמית
      '<path d="M76 54 L92 66"/>' +            // ידיים קדימה
      mo("M104 52 q14 18 -2 40"),
      { label: "סקוואט" }
    ),
    // שכיבת סמיכה — ירידת חזה לרצפה
    pushup: wrap(
      head(40, 66) +
      '<path d="M46 68 L120 96"/>' +           // גו נטוי
      '<path d="M60 74 L58 100"/>' +           // יד
      '<path d="M120 96 L150 104"/>' +         // רגליים
      '<path d="M120 96 L118 106"/>' +
      mo("M70 58 q0 16 0 26"),
      { ground: true, label: "שכיבת סמיכה" }
    ),
    // פלאנק — החזקה סטטית
    plank: wrap(
      head(34, 70) +
      '<path d="M40 74 L138 100"/>' +
      '<path d="M52 78 L50 100"/>' +
      '<path d="M138 100 L150 104"/>' +
      '<text x="80" y="46" fill="var(--ember)" stroke="none" font-size="11" font-family="var(--font-mono)">החזקה</text>',
      { ground: true, label: "פלאנק" }
    ),
    // גשר ישבן — הרמת אגן
    "glute-bridge": wrap(
      head(30, 92) +
      '<path d="M36 92 L86 84"/>' +            // גו על הרצפה עד אגן מורם
      '<path d="M86 84 L104 104 L104 112"/>' + // רגל כפופה
      '<path d="M40 88 L38 104"/>' +           // יד
      mo("M92 100 q6 -16 0 -26"),
      { label: "גשר ישבן" }
    ),
    // ציפור-כלב — יד ורגל נגדית נמתחות
    "bird-dog": wrap(
      head(58, 52) +
      '<path d="M62 58 L92 70"/>' +            // גו
      '<path d="M92 70 L96 96 L96 112"/>' +    // רגל תומכת
      '<path d="M92 70 L124 58"/>' +           // רגל מורמת אחורה
      '<path d="M66 60 L96 96"/>' +            // יד תומכת
      '<path d="M62 56 L34 44"/>' +            // יד מורמת קדימה
      mo("M28 40 L14 34") + mo("M130 54 L146 48"),
      { label: "ציפור-כלב" }
    ),
    // לאנג' — צעד קדימה וירידה
    lunge: wrap(
      head(76, 34) +
      '<path d="M76 42 L80 74"/>' +
      '<path d="M80 74 L104 92 L104 112"/>' +  // רגל קדמית כפופה
      '<path d="M80 74 L58 100 L52 112"/>' +   // רגל אחורית
      '<path d="M78 50 L78 72"/>' +
      mo("M110 46 q10 20 -4 38"),
      { label: "מספריים" }
    ),
    // חיפושית מתה — שכיבה על הגב, גפיים נגדיות יורדות
    "dead-bug": wrap(
      '<path d="M20 96 L120 96"/>' +           // גב על הרצפה
      head(24, 90) +
      '<path d="M60 96 L60 60"/>' +            // ירך אנכית
      '<path d="M60 60 L84 60"/>' +            // שוק אופקית
      '<path d="M46 96 L20 78"/>' +            // רגל נגדית יורדת
      '<path d="M40 92 L64 60"/>' +            // יד למעלה
      '<path d="M40 92 L16 100"/>' +           // יד נגדית לאחור
      mo("M22 72 L14 64") + mo("M92 54 L104 48"),
      { ground: false, label: "חיפושית מתה" }
    ),
    // חתול-פרה — קימור וקיעור גב
    "cat-cow": wrap(
      head(44, 58) +
      '<path d="M50 62 Q86 40 118 62" stroke-dasharray="3 4" opacity="0.55"/>' + // קיעור (פרה)
      '<path d="M50 66 Q86 92 118 66"/>' +     // קימור (חתול)
      '<path d="M50 66 L48 96 L48 112"/>' +
      '<path d="M118 66 L120 96 L120 112"/>' +
      mo("M86 82 L86 52"),
      { label: "חתול-פרה" }
    ),
    // ישיבת קיר
    "wall-sit": wrap(
      '<line x1="30" y1="12" x2="30" y2="112" stroke="currentColor" stroke-width="3" opacity="0.4"/>' + // קיר
      head(38, 46) +
      '<path d="M38 54 L38 84"/>' +            // גו צמוד לקיר
      '<path d="M38 84 L78 84"/>' +            // ירך אופקית
      '<path d="M78 84 L78 112"/>' +           // שוק אנכית
      '<path d="M40 62 L58 78"/>' +
      '<text x="52" y="40" fill="var(--ember)" stroke="none" font-size="10" font-family="var(--font-mono)">90°</text>',
      { label: "ישיבת קיר" }
    ),
    // צעידה / הליכה
    march: wrap(
      head(74, 30) +
      '<path d="M74 38 L74 72"/>' +
      '<path d="M74 72 L62 96 L62 112"/>' +    // רגל עומדת
      '<path d="M74 72 L92 78 L90 96"/>' +     // רגל מורמת (ברך גבוהה)
      '<path d="M74 46 L58 40"/>' +            // יד אחת אחורה
      '<path d="M74 46 L90 52"/>' +            // יד אחת קדימה
      mo("M104 84 q10 -6 16 -18"),
      { label: "צעידה במקום" }
    )
  };

  window.EXERCISE_FIGURES = F;
})();
