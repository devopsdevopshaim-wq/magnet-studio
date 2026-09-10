(function () {
  const chipsEl = document.getElementById("ai-source-chips");
  const askBtn = document.getElementById("ai-ask-btn");
  const questionEl = document.getElementById("ai-question");
  const statusEl = document.getElementById("ai-status-line");
  const synthWrap = document.getElementById("ai-synth-wrap");
  const answerListEl = document.getElementById("ai-answer-list");

  if (!chipsEl || !askBtn) return;

  async function loadSources() {
    try {
      const res = await fetch("/api/ai/sources");
      const data = await res.json();
      renderChips(data.sources || []);
    } catch {
      chipsEl.textContent = "לא ניתן לבדוק מקורות כרגע";
    }
  }

  function renderChips(sources) {
    chipsEl.innerHTML = "";
    if (!sources.length) {
      chipsEl.textContent = "אין מקורות AI זמינים כרגע";
      return;
    }
    for (const s of sources) {
      const chip = document.createElement("span");
      chip.className = "ai-chip" + (s.available ? " available" : "");
      chip.textContent = s.label;
      chip.title = s.available
        ? "זמין"
        : s.note || `לא מוגדר - יש להגדיר משתנה סביבה ${s.envVar || ""} ולהפעיל מחדש את השרת`;
      chipsEl.appendChild(chip);
    }
  }

  async function askAll() {
    const question = (questionEl.value || "").trim();
    if (!question) return;

    askBtn.disabled = true;
    askBtn.textContent = "שואל את כולם…";
    statusEl.textContent = "שולח שאלה לכל המקורות הזמינים במקביל…";
    synthWrap.innerHTML = "";
    answerListEl.innerHTML = "";

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        statusEl.textContent = data.error || "השאלה נכשלה";
        return;
      }

      const okCount = (data.answers || []).filter((a) => a.ok).length;
      statusEl.textContent = `התקבלו תשובות מ-${okCount} מתוך ${data.answers.length} מקורות`;

      if (data.synthesized) {
        const box = document.createElement("div");
        box.className = "ai-synth";
        box.innerHTML = `<div class="label">תשובה מסונתזת</div><div class="text"></div>`;
        box.querySelector(".text").textContent = data.synthesized;
        synthWrap.appendChild(box);
      }

      for (const a of data.answers || []) {
        const item = document.createElement("details");
        item.className = "ai-answer-item" + (a.ok ? "" : " error");
        const summary = document.createElement("summary");
        summary.textContent = a.ok ? a.source : `${a.source} - שגיאה`;
        item.appendChild(summary);
        const text = document.createElement("div");
        text.className = "text";
        text.textContent = a.ok ? a.text : a.error;
        item.appendChild(text);
        answerListEl.appendChild(item);
      }
    } catch (err) {
      statusEl.textContent = "שגיאת תקשורת עם השרת";
    } finally {
      askBtn.disabled = false;
      askBtn.textContent = "שאל את כולם";
    }
  }

  askBtn.addEventListener("click", askAll);
  questionEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) askAll();
  });

  loadSources();
  setInterval(loadSources, 60000);
})();
