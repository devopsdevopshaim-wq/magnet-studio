/* עיצוב AIA — בונה חבילת הפקה מבריף + מפיק וידאו מונטאז' אמיתי. הכל מול השרת המקומי. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };

  let type = "animation";
  let refs = [];            // { previewUrl, note, name, staged }
  let MAX = 120;
  let CAN_RENDER = false;
  let BEDS = [];
  let TRANSITIONS = [];
  const stageId = "st-" + Date.now().toString(36) + Math.random().toString(16).slice(2, 8);

  $("aia-type").querySelectorAll(".aia-type").forEach((b) => b.addEventListener("click", () => {
    $("aia-type").querySelectorAll(".aia-type").forEach((x) => x.classList.toggle("active", x === b));
    type = b.dataset.v;
  }));

  // ---------- צ'יפים מוכנים לסגנון/מצב-רוח — לחיצה מוסיפה/מסירה מהשדה, אפשר גם להקליד חופשי ----------
  const STYLE_PRESETS = ["קולנועי", "מינימליסטי", "ניאון", "אקוורל", "רטרו", "3D ריאליסטי", "יד-מצוירת", "קורפורטיבי נקי"];
  const MOOD_PRESETS = ["חמים", "אנרגטי", "חלומי", "דרמטי", "עליז", "רגוע", "מסתורי", "חגיגי"];
  function wireChips(containerId, inputId, presets) {
    const box = $(containerId), input = $(inputId);
    box.innerHTML = presets.map((p) => `<button type="button" class="aia-chip" data-v="${esc(p)}">${esc(p)}</button>`).join("");
    const parts = () => input.value.split(/\s*[·,]\s*/).map((s) => s.trim()).filter(Boolean);
    const sync = () => { const sel = new Set(parts()); box.querySelectorAll(".aia-chip").forEach((c) => c.classList.toggle("on", sel.has(c.dataset.v))); };
    box.querySelectorAll(".aia-chip").forEach((c) => c.addEventListener("click", () => {
      const sel = parts();
      const i = sel.indexOf(c.dataset.v);
      if (i === -1) sel.push(c.dataset.v); else sel.splice(i, 1);
      input.value = sel.join(" · ");
      sync();
    }));
    input.addEventListener("input", sync);
  }
  wireChips("aia-style-chips", "aia-style", STYLE_PRESETS);
  wireChips("aia-mood-chips", "aia-mood", MOOD_PRESETS);

  // ---------- תמונות ייחוס — כיווץ + העלאה מדורגת (בלי גבול מספר) ----------
  const drop = $("aia-drop");
  const fileInput = $("aia-files");
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
  fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });

  let uploading = 0;
  async function addFiles(fileList) {
    const incoming = [...fileList].filter((f) => f.type.startsWith("image/")).slice(0, MAX - refs.length);
    if (![...fileList].length) return;
    if (refs.length + incoming.length >= MAX) toast(`המקסימום הוא ${MAX} תמונות`);
    for (const f of incoming) {
      const slot = { previewUrl: "", note: "", name: f.name, staged: false, busy: true };
      refs.push(slot); renderRefs();
      uploading++;
      updateGoBtn();
      try {
        const dataUrl = await downscale(f);
        slot.previewUrl = dataUrl;
        renderRefs();
        const r = await fetch("/api/aia/stage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId, dataUrl, note: "" })
        }).then((x) => x.json());
        if (r.error) throw new Error(r.error);
        slot.staged = true; slot.busy = false;
      } catch (e) {
        refs = refs.filter((x) => x !== slot);
        toast("דילגתי על " + f.name + " — " + (e.message || "שגיאה"), true);
      } finally {
        uploading--; renderRefs(); updateGoBtn();
      }
    }
  }

  // כיווץ בדפדפן: מקטינים לצד ארוך 1200, ואז מורידים איכות עד מתחת ל-480KB. לעולם לא גודל מקורי.
  async function downscale(file, maxSide = 1200) {
    const bmp = await loadBitmap(file);
    let w = bmp.width, h = bmp.height;
    if (Math.max(w, h) > maxSide) { const s = maxSide / Math.max(w, h); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    for (const q of [0.8, 0.65, 0.5, 0.38]) {
      const url = cv.toDataURL("image/jpeg", q);
      if (!url || url.length < 200) throw new Error("קידוד נכשל");
      if (url.length < 480 * 1024 || q === 0.38) return url;
    }
  }
  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file).catch(() => loadViaImg(file));
    return loadViaImg(file);
  }
  function loadViaImg(file) {
    return new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onerror = () => reject(new Error("קריאת קובץ נכשלה"));
      rd.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("פענוח תמונה נכשל"));
        img.onload = () => resolve(img);
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }

  function renderRefs() {
    $("aia-refcount").textContent = refs.length ? `${refs.length} תמונות${uploading ? " · מעלה…" : ""}` : "";
    $("aia-refs").innerHTML = refs.map((r, i) => `
      <div class="aia-ref${r.busy ? " busy" : ""}">
        <div class="x">
          ${r.previewUrl ? `<img src="${r.previewUrl}" alt="">` : `<div class="aia-ref-ph">…</div>`}
          <button data-del="${i}">✕</button>
        </div>
        <input type="text" placeholder="הערה…" data-note="${i}" value="${esc(r.note)}">
      </div>`).join("");
    $("aia-refs").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { refs.splice(+b.dataset.del, 1); renderRefs(); updateGoBtn(); }));
    $("aia-refs").querySelectorAll("[data-note]").forEach((inp) => inp.addEventListener("input", () => { refs[+inp.dataset.note].note = inp.value; }));
  }

  function updateGoBtn() {
    const b = $("aia-generate");
    b.disabled = uploading > 0;
    b.textContent = uploading > 0 ? `מעלה תמונות… (${uploading})` : "✦ צור חבילת הפקה";
  }

  // ---------- יצירה ----------
  $("aia-generate").addEventListener("click", async () => {
    if (uploading > 0) return;
    const brief = {
      type,
      title: $("aia-title").value.trim(),
      style: $("aia-style").value.trim(),
      mood: $("aia-mood").value.trim(),
      aspect: $("aia-aspect").value,
      duration: $("aia-duration").value,
      text: $("aia-text").value.trim(),
      stageId: refs.some((r) => r.staged) ? stageId : undefined,
      stageNotes: refs.filter((r) => r.staged).map((r) => r.note)
    };
    if (!brief.title && !brief.text && !brief.stageId) { toast("מלא לפחות נושא או תיאור", true); return; }

    const btn = $("aia-generate");
    btn.disabled = true;
    const st = $("aia-status");
    st.className = "aia-status";
    st.innerHTML = '<span class="spin">✦</span> בונה קונספט, פרומפטים וסטוריבורד… (עד דקה)';
    try {
      const resp = await fetch("/api/aia/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) });
      const ct = resp.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error(`השרת החזיר שגיאה (${resp.status}). ודא שהשרת פועל ונסה שוב.`);
      const project = await resp.json();
      if (project.error) throw new Error(project.error);
      refs = []; renderRefs();
      renderResult(project);
      st.textContent = "";
      loadGallery();
      $("aia-result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      st.textContent = "שגיאה: " + e.message;
      st.className = "aia-status bad";
    } finally {
      btn.disabled = false;
      btn.textContent = "✦ צור חבילת הפקה";
    }
  });

  // ---------- רינדור תוצאה ----------
  const copyBtn = (t) => `<button class="copy" data-copy="${esc(t).replace(/"/g, "&quot;")}">העתק</button>`;
  function wireCopy(root) {
    root.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast("הועתק"))));
  }
  const block = (title, body, open) =>
    `<details class="aia-block"${open ? " open" : ""}><summary>${esc(title)}<span>▾</span></summary><div class="aia-block-body">${body}</div></details>`;

  let CURRENT = null;

  function renderResult(project) {
    CURRENT = project;
    const p = project.package || {};
    $("aia-result").hidden = false;
    $("aia-result-title").textContent = p.title || (project.brief || {}).title || "חבילת הפקה";
    $("aia-dl").href = `/api/aia/project/${project.id}/markdown`;

    const parts = [];
    parts.push(block("קונספט", `<div class="aia-concept">${esc(p.concept || "-")}</div>`, true));

    if ((p.imagePrompts || []).length)
      parts.push(block(`פרומפטים לתמונה (${p.imagePrompts.length})`,
        p.imagePrompts.map((x) => `<div class="aia-prompt" dir="ltr">${copyBtn(x)}${esc(x)}</div>`).join(""), true));

    if ((p.storyboard || []).length) {
      const rows = p.storyboard.map((s) => `<tr><td>${esc(s.shot ?? "")}</td><td>${esc(s.description ?? "")}</td><td>${esc(s.camera ?? "")}</td><td>${esc(s.motion ?? "")}</td><td>${esc(s.seconds ?? "")}</td></tr>`).join("");
      parts.push(block(`סטוריבורד (${p.storyboard.length} שוטים)`,
        `<div style="overflow-x:auto"><table class="aia-sb-table"><tr><th>#</th><th>תיאור</th><th>מצלמה</th><th>תנועה</th><th>שנ'</th></tr>${rows}</table></div>`, true));
    }

    if ((p.videoPrompts || []).length)
      parts.push(block(`פרומפטים לוידאו (${p.videoPrompts.length})`,
        p.videoPrompts.map((v) => `<div class="aia-prompt" dir="ltr"><span class="eng">${esc(v.engine || "וידאו")}</span>${copyBtn(v.prompt || "")}${esc(v.prompt || "")}</div>`).join(""), true));

    const sn = p.styleNotes || {};
    if (Object.keys(sn).length) {
      let h = "";
      if ((sn.palette || []).length) h += `<div class="aia-swatches">${sn.palette.map((c) => `<div class="aia-swatch" style="background:${esc(c)}" title="${esc(c)}"></div>`).join("")}</div>`;
      if (sn.lighting) h += `<div class="aia-style-line"><b>תאורה:</b> ${esc(sn.lighting)}</div>`;
      if ((sn.keywords || []).length) h += `<div class="aia-chips">${sn.keywords.map((k) => `<span class="aia-chip">${esc(k)}</span>`).join("")}</div>`;
      if (sn.negative) h += `<div class="aia-style-line" style="margin-top:8px"><b>להימנע:</b> ${esc(sn.negative)}</div>`;
      parts.push(block("הערות סגנון", h));
    }

    if ((project.assets || []).length)
      parts.push(block(`תמונות ייחוס (${project.assets.length})`,
        `<div class="aia-refs">${project.assets.map((a) => `<div class="aia-ref"><div class="x"><img src="${esc(a.url)}" alt=""></div>${a.note ? `<div class="aia-style-line">${esc(a.note)}</div>` : ""}</div>`).join("")}</div>`));

    if (p._expandRaw) parts.push(block("פלט גולמי מהמנוע", `<div class="aia-prompt">${esc(p._expandRaw)}</div>`, true));

    $("aia-blocks").innerHTML = parts.join("");
    wireCopy($("aia-blocks"));

    renderStudio(project);
  }

  // ---------- אולפן הפקה: מונטאז' וידאו אמיתי ----------
  let pollTimer = null;

  function renderStudio(project) {
    const wrap = $("aia-studio");
    const imgCount = (project.assets || []).length;
    if (!CAN_RENDER) {
      wrap.hidden = false;
      wrap.innerHTML = `<div class="aia-note">הפקת וידאו דורשת FFmpeg. הרץ במחשב <code class="mono">npm install</code> בתיקיית הפרויקט (ffmpeg מצורף) ואתחל את השרת.</div>`;
      return;
    }

    const type = project.brief?.type;
    const canMontage = imgCount >= 2;
    const defaultMode = (type === "animation" || type === "logo_reveal" || !canMontage) ? "animation" : "montage";

    const bedOpts = `<option value="none">ללא מוזיקה</option>` +
      BEDS.map((b) => `<option value="${esc(b.id)}">${esc(b.he)} (מובנה)</option>`).join("") +
      `<option value="upload">העלה קובץ…</option>`;

    wrap.hidden = false;
    wrap.innerHTML = `
      <h3>🎬 הפקת וידאו</h3>
      <div class="aia-mode-pick" id="st-mode">
        <button class="${defaultMode === "montage" ? "on" : ""}" data-mode="montage" ${canMontage ? "" : "disabled"}>מונטאז' תמונות (${imgCount})</button>
        <button class="${defaultMode === "animation" ? "on" : ""}" data-mode="animation">אנימציית מושן (FFmpeg)</button>
        <button data-mode="remotion">✨ מושן גרפיקס (Remotion — RTL מושלם)</button>
      </div>
      <div class="aia-studio-grid">
        <label class="st-montage-only">שניות לתמונה
          <input type="range" id="st-per" min="1.5" max="6" step="0.5" value="3">
          <span id="st-per-val">3</span> שנ'
        </label>
        <label class="aia-check st-montage-only"><input type="checkbox" id="st-kb" checked> תנועת Ken Burns (זום/פאן)</label>
        <label class="st-montage-only">מעבר בין תמונות
          <select id="st-transition">${TRANSITIONS.map((t) => `<option value="${esc(t.id)}">${esc(t.he)}</option>`).join("")}</select>
        </label>
        <label class="st-anim-only st-remotion-only">אורך (שניות)
          <input type="number" id="st-dur" min="4" max="20" value="${project.package?.durationSec || 8}">
        </label>
        <label>כותרת פתיחה <input type="text" id="st-title" value="${esc(project.package?.title || "")}"></label>
        <label>טקסט סיום <span class="st-remotion-only" style="font-size:0.75em;color:var(--cream-dim)">(כתובית מתחת לכותרת ב-Remotion)</span><input type="text" id="st-end" placeholder="למשל: מזל טוב"></label>
        <label class="st-hasaudio-only">מוזיקת רקע
          <select id="st-bed">${bedOpts}</select>
          <input type="file" id="st-audio" accept="audio/*" hidden>
          <span id="st-audio-name" class="aia-audio-name"></span>
        </label>
      </div>
      <div class="aia-est" id="st-est"></div>
      <button class="btn primary" id="st-render">▶ הפק וידאו</button>
      <div class="aia-render-status" id="st-status"></div>
      <div id="st-out"></div>`;

    let mode = defaultMode;
    const applyMode = () => {
      wrap.querySelectorAll("#st-mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
      wrap.querySelectorAll(".st-montage-only").forEach((el) => el.hidden = mode !== "montage");
      wrap.querySelectorAll(".st-anim-only").forEach((el) => el.hidden = mode === "montage");
      wrap.querySelectorAll(".st-hasaudio-only").forEach((el) => el.hidden = mode === "remotion");
      wrap.querySelectorAll(".st-remotion-only:not(input)").forEach((el) => el.hidden = mode !== "remotion");
      updEst();
    };
    wrap.querySelectorAll("#st-mode button").forEach((b) => b.addEventListener("click", () => {
      if (b.disabled) return; mode = b.dataset.mode; applyMode();
    }));

    const per = $("st-per");
    const updEst = () => {
      if (per) $("st-per-val").textContent = per.value;
      const secs = mode === "montage" ? Math.round(imgCount * (per ? per.value : 3)) : ($("st-dur")?.value || 8);
      $("st-est").textContent = `אורך משוער: ~${secs} שניות`;
    };
    if (per) per.addEventListener("input", updEst);

    let audioDataUrl = null;
    $("st-bed").addEventListener("change", (e) => {
      if (e.target.value === "upload") { $("st-audio").click(); }
      else { audioDataUrl = null; $("st-audio-name").textContent = ""; }
    });
    $("st-audio").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) { $("st-bed").value = "none"; return; }
      if (f.size > 28 * 1024 * 1024) { toast("קובץ שמע גדול מדי (מקס' 28MB)", true); e.target.value = ""; $("st-bed").value = "none"; return; }
      const rd = new FileReader();
      rd.onload = () => { audioDataUrl = rd.result; $("st-audio-name").textContent = f.name; };
      rd.readAsDataURL(f);
    });

    $("st-render").addEventListener("click", async () => {
      const btn = $("st-render");
      btn.disabled = true;
      $("st-status").className = "aia-render-status";
      $("st-status").innerHTML = '<span class="spin">✦</span> מתחיל רינדור…';
      $("st-out").innerHTML = "";
      const bedVal = $("st-bed").value;
      try {
        await fetch(`/api/aia/project/${project.id}/render`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            secondsPerImage: per ? parseFloat(per.value) : 3,
            durationSec: parseFloat($("st-dur")?.value) || undefined,
            kenBurns: $("st-kb") ? $("st-kb").checked : true,
            transition: $("st-transition") ? $("st-transition").value : "fade",
            titleText: $("st-title").value.trim(),
            endText: $("st-end").value.trim(),
            subtitleText: mode === "remotion" ? $("st-end").value.trim() : undefined,
            bed: bedVal === "upload" ? "none" : bedVal,
            audioDataUrl: audioDataUrl || undefined
          })
        });
        pollRender(project.id, btn);
      } catch (e) {
        $("st-status").textContent = "שגיאה: " + e.message;
        $("st-status").className = "aia-render-status bad";
        btn.disabled = false;
      }
    });

    applyMode();
    if (project.render && project.render.file) showVideo(project.render.file, project.render.durationSec);

    renderAiVideo(project, wrap);
  }

  // ---------- מנועי וידאו AI: Seedance 2.5 · Deevid.AI · ComfyUI מקומי ----------
  let aiVideoPoll = null;
  let comfyPoll = null;
  async function renderAiVideo(project, wrap) {
    const host = document.createElement("div");
    host.className = "aia-aivideo";
    host.innerHTML = `<h3>✨ וידאו AI חיצוני</h3><div class="aia-note">טוען מנועים…</div>`;
    wrap.appendChild(host);

    let providers = [];
    try { providers = (await fetch("/api/aia/video/providers").then((r) => r.json())).providers || []; }
    catch { host.innerHTML = `<h3>✨ וידאו AI חיצוני</h3><div class="aia-note bad">לא ניתן לטעון מנועים</div>`; return; }

    const aspect = (project.brief && project.brief.aspect) || "16:9";

    const apiCard = (p) => `
        <div class="aiv-vendor">${esc(p.vendor)} · <a href="${esc(p.site)}" target="_blank" rel="noopener">האתר</a></div>
        <div class="aiv-controls">
          <label>אורך
            <select class="aiv-dur">${(p.durations || [8]).map((d) => `<option${d === 8 ? " selected" : ""}>${d}</option>`).join("")}</select> שנ'
          </label>
          <label>יחס
            <select class="aiv-aspect">${(p.aspects || [aspect]).map((a) => `<option${a === aspect ? " selected" : ""}>${a}</option>`).join("")}</select>
          </label>
        </div>
        <label class="aiv-keyrow${p.configured ? " done" : ""}">
          <input type="password" class="aiv-key" placeholder="${esc(p.keyHint)}" autocomplete="off">
          <button class="btn tiny aiv-savekey" type="button">שמור מפתח</button>
        </label>
        <div class="aiv-actions">
          <button class="btn primary aiv-go" type="button">▶ הפק ב-${esc(p.label)}</button>
          <button class="btn ghost aiv-copy" type="button">העתק פרומפט למנוע</button>
        </div>`;

    const handoffCard = (p) => `
        <div class="aiv-vendor">${esc(p.vendor)} — אין API, עובדים דרך האתר שלך</div>
        <ol class="aiv-steps">
          <li>לחצו <b>“פתח את Deevid + העתק פרומפט”</b> — נפתחת לשונית ל-${esc(p.appUrl || p.site)} והפרומפט מועתק.</li>
          <li>ב-Deevid: הדביקו את הפרומפט, בחרו אורך/יחס, והפיקו את הווידאו.</li>
          <li>הורידו את ה-MP4 מ-Deevid, וחזרו לכאן — <b>“העלה את הווידאו”</b> יכניס אותו לגלריית הפרויקט.</li>
        </ol>
        <div class="aiv-actions">
          <button class="btn primary aiv-open" type="button">↗ פתח את Deevid + העתק פרומפט</button>
        </div>
        <label class="aiv-upload">
          <span>העלה את הווידאו שהורדת מ-Deevid:</span>
          <input type="file" class="aiv-file" accept="video/mp4,video/webm">
        </label>`;

    const card = (p) => `
      <div class="aiv-card" data-p="${esc(p.id)}" data-mode="${esc(p.mode || "api")}" data-appurl="${esc(p.appUrl || "")}">
        <div class="aiv-head">
          <b>${esc(p.label)}</b>
          <span class="aiv-status ${p.mode === "handoff" ? "hand" : p.configured ? "ok" : "off"}">${
            p.mode === "handoff" ? "דרך האתר" : p.configured ? "מחובר ✓" : "דרוש מפתח API"}</span>
        </div>
        ${p.mode === "handoff" ? handoffCard(p) : apiCard(p)}
        <div class="aiv-msg"></div>
      </div>`;

    host.innerHTML = `<h3>✨ וידאו AI חיצוני</h3>
      <div class="aia-note">Seedance — עם מפתח API מפיק אוטומטית. Deevid — אין API, אז הפרומפט נפתח מוכן באתר שלך ואת הווידאו המוכן מעלים חזרה לכאן.</div>
      <div class="aiv-grid">${providers.map(card).join("")}</div>
      <div class="aiv-card comfy-standalone" id="comfy-card">
        <div class="aiv-head"><b>ComfyUI (מקומי)</b><span class="aiv-status" id="comfy-status">בודק…</span></div>
        <div class="aiv-vendor">תהליך העבודה שלכם, רץ על המחשב הזה — עובד רק כשהאתר פתוח מאותו מחשב שבו ComfyUI רץ (אלא אם הגדרתם טאנל).</div>
        <label>כתובת ComfyUI <input type="text" id="comfy-url" placeholder="http://127.0.0.1:8188"></label>
        <label>תהליך עבודה (Workflow, API Format)
          <textarea id="comfy-workflow" rows="5" placeholder='ב-ComfyUI: Workflow → Export (API Format). הדביקו כאן, ובתיבת הפרומפט כתבו בדיוק %%PROMPT%% במקום טקסט קבוע.'></textarea>
        </label>
        <div class="aiv-actions">
          <button class="btn ghost" id="comfy-save">שמירת הגדרות</button>
          <button class="btn primary" id="comfy-go">▶ הפק ב-ComfyUI</button>
        </div>
        <div class="aiv-msg" id="comfy-msg"></div>
      </div>`;

    const copyPrompt = async (pid) => {
      const txt = await fetch(`/api/aia/project/${project.id}/video/prompt?provider=${pid}`).then((r) => r.text());
      await navigator.clipboard.writeText(txt);
      return txt;
    };

    host.querySelectorAll(".aiv-card:not(.comfy-standalone)").forEach((el) => {
      const pid = el.dataset.p;
      const msg = el.querySelector(".aiv-msg");
      const setMsg = (t, cls) => { msg.textContent = t; msg.className = "aiv-msg" + (cls ? " " + cls : ""); };
      const q = (s) => el.querySelector(s);

      if (q(".aiv-savekey")) q(".aiv-savekey").addEventListener("click", async () => {
        const key = q(".aiv-key").value.trim();
        if (!key) return setMsg("הדבק מפתח קודם", "bad");
        setMsg("שומר…");
        try {
          const r = await fetch("/api/aia/video/config", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: pid, key })
          }).then((r) => r.json());
          if (r.provider && r.provider.configured) {
            q(".aiv-status").className = "aiv-status ok";
            q(".aiv-status").textContent = "מחובר ✓";
            q(".aiv-key").value = "";
            q(".aiv-keyrow").classList.add("done");
            setMsg("המפתח נשמר. אפשר להפיק.", "ok");
          } else setMsg("לא נשמר", "bad");
        } catch { setMsg("שגיאה בשמירה", "bad"); }
      });

      if (q(".aiv-copy")) q(".aiv-copy").addEventListener("click", async () => {
        try { await copyPrompt(pid); toast("הפרומפט הועתק — הדבק באתר " + pid); }
        catch { toast("לא ניתן להעתיק", true); }
      });

      if (q(".aiv-open")) q(".aiv-open").addEventListener("click", async () => {
        setMsg("מעתיק פרומפט…");
        try { await copyPrompt(pid); } catch {}
        window.open(el.dataset.appurl || "https://deevid.ai/app/assets", "_blank", "noopener");
        setMsg("הפרומפט הועתק. הדביקו ב-Deevid (Ctrl+V), הפיקו, הורידו — וחזרו להעלות כאן.", "ok");
      });

      if (q(".aiv-file")) q(".aiv-file").addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 200 * 1024 * 1024) { setMsg("הקובץ גדול מדי (מקס' 200MB)", "bad"); return; }
        setMsg("מעלה את הווידאו…");
        const rd = new FileReader();
        rd.onload = async () => {
          try {
            const r = await fetch(`/api/aia/project/${project.id}/video/upload`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataUrl: rd.result })
            });
            const j = await r.json();
            if (!r.ok) { setMsg("שגיאה: " + (j.error || r.status), "bad"); return; }
            setMsg("");
            showVideo(j.file, j.durationSec);
            loadGallery();
            toast("הווידאו מ-Deevid נוסף לפרויקט!");
          } catch (err) { setMsg("שגיאה בהעלאה: " + err.message, "bad"); }
        };
        rd.readAsDataURL(f);
      });

      if (q(".aiv-go")) q(".aiv-go").addEventListener("click", async () => {
        const btn = q(".aiv-go");
        btn.disabled = true;
        setMsg("שולח למנוע…");
        try {
          const r = await fetch(`/api/aia/project/${project.id}/video`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: pid,
              duration: parseInt(q(".aiv-dur").value, 10),
              aspect: q(".aiv-aspect").value
            })
          });
          const j = await r.json();
          if (r.status === 428 || j.needKey) {
            setMsg("דרוש מפתח API. הדבק אותו למעלה, או העתק את הפרומפט והדבק באתר המנוע.", "bad");
            btn.disabled = false;
            return;
          }
          if (!r.ok) { setMsg("שגיאה: " + (j.error || r.status), "bad"); btn.disabled = false; return; }
          pollAiVideo(project.id, el, btn);
        } catch (e) { setMsg("שגיאה: " + e.message, "bad"); btn.disabled = false; }
      });
    });

    // ---- ComfyUI מקומי ----
    loadComfyStatus();
    $("comfy-save").addEventListener("click", async () => {
      const m = $("comfy-msg"); m.textContent = "שומר…"; m.className = "aiv-msg";
      try {
        await fetch("/api/aia/comfyui/config", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: $("comfy-url").value.trim(), workflowTemplate: $("comfy-workflow").value })
        });
        m.textContent = "נשמר ✓"; m.className = "aiv-msg ok";
        loadComfyStatus();
      } catch { m.textContent = "שגיאה בשמירה"; m.className = "aiv-msg bad"; }
    });
    $("comfy-go").addEventListener("click", async () => {
      const btn = $("comfy-go"); btn.disabled = true;
      const m = $("comfy-msg"); m.textContent = "שולח ל-ComfyUI…"; m.className = "aiv-msg";
      try {
        const r = await fetch(`/api/aia/project/${project.id}/comfyui`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const j = await r.json();
        if (!r.ok) { m.textContent = "שגיאה: " + (j.error || r.status); m.className = "aiv-msg bad"; btn.disabled = false; return; }
        pollComfy(project.id, btn);
      } catch (e) { m.textContent = "שגיאה: " + e.message; m.className = "aiv-msg bad"; btn.disabled = false; }
    });
  }

  async function loadComfyStatus() {
    const statusEl = $("comfy-status");
    if (!statusEl) return;
    try {
      const s = await fetch("/api/aia/comfyui/status").then((r) => r.json());
      $("comfy-url").value = s.baseUrl || "";
      statusEl.className = "aiv-status " + (s.reachable ? "ok" : "off");
      statusEl.textContent = s.reachable ? "ComfyUI מחובר ✓" : "לא מגיב בכתובת שהוגדרה";
      if (s.hasTemplate && !s.hasPlaceholder) {
        $("comfy-msg").textContent = "בתהליך העבודה השמור חסר %%PROMPT%% — הפרומפט לא יוזרק";
        $("comfy-msg").className = "aiv-msg bad";
      }
    } catch { statusEl.textContent = "שגיאה בבדיקה"; }
  }

  function pollComfy(id, btn) {
    const msg = $("comfy-msg");
    clearInterval(comfyPoll);
    comfyPoll = setInterval(async () => {
      let j;
      try { j = await fetch(`/api/aia/project/${id}/comfyui`).then((r) => r.json()); } catch { return; }
      if (j.status === "running") {
        msg.className = "aiv-msg";
        msg.innerHTML = `<div class="aia-bar"><div style="width:${j.pct || 0}%"></div></div><span>${esc(j.phase || "מעבד")} · ${j.pct || 0}%</span>`;
      } else if (j.status === "done") {
        clearInterval(comfyPoll);
        if (btn) btn.disabled = false;
        msg.textContent = "";
        showComfyResult(j.file, j.ext);
        loadGallery();
        toast("ComfyUI סיים!");
      } else if (j.status === "error") {
        clearInterval(comfyPoll);
        if (btn) btn.disabled = false;
        msg.textContent = "שגיאה: " + (j.error || "לא ידועה");
        msg.className = "aiv-msg bad";
      }
    }, 2500);
  }

  function showComfyResult(url, ext) {
    const isVideo = ["mp4", "webm", "gif"].includes((ext || "").toLowerCase());
    $("st-out").innerHTML = isVideo
      ? `<video class="aia-video" src="${esc(url)}" controls playsinline></video>
         <div class="aia-video-actions"><a class="btn primary" href="${esc(url)}" download>⤓ הורדה</a></div>`
      : `<img class="aia-video" src="${esc(url)}" alt="תוצר ComfyUI" style="max-width:100%; border-radius:12px;">
         <div class="aia-video-actions"><a class="btn primary" href="${esc(url)}" download>⤓ הורדה</a></div>`;
  }

  function pollAiVideo(id, el, btn) {
    const msg = el.querySelector(".aiv-msg");
    clearInterval(aiVideoPoll);
    aiVideoPoll = setInterval(async () => {
      let j;
      try { j = await fetch(`/api/aia/project/${id}/video`).then((r) => r.json()); } catch { return; }
      if (j.status === "running") {
        msg.className = "aiv-msg";
        msg.innerHTML = `<div class="aia-bar"><div style="width:${j.pct || 0}%"></div></div><span>${esc(j.phase || "מעבד")} · ${j.pct || 0}%</span>`;
      } else if (j.status === "done") {
        clearInterval(aiVideoPoll);
        if (btn) btn.disabled = false;
        msg.textContent = "";
        showVideo(j.file, j.durationSec);
        loadGallery();
        toast("וידאו ה-AI מוכן!");
      } else if (j.status === "error") {
        clearInterval(aiVideoPoll);
        if (btn) btn.disabled = false;
        msg.textContent = "שגיאת מנוע: " + (j.error || "לא ידועה");
        msg.className = "aiv-msg bad";
      }
    }, 2500);
  }

  function pollRender(id, btn) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      let j;
      try { j = await fetch(`/api/aia/project/${id}/render`).then((r) => r.json()); }
      catch { return; }
      const st = $("st-status");
      if (!st) { clearInterval(pollTimer); return; }
      if (j.status === "running") {
        st.innerHTML = `<div class="aia-bar"><div style="width:${j.pct || 0}%"></div></div><span>${esc(j.phase || "מרנדר")} · ${j.pct || 0}%</span>`;
      } else if (j.status === "done") {
        clearInterval(pollTimer);
        st.textContent = "";
        if (btn) btn.disabled = false;
        showVideo(j.file, j.durationSec);
        loadGallery();
        toast("הווידאו מוכן!");
      } else if (j.status === "error") {
        clearInterval(pollTimer);
        st.textContent = "שגיאת רינדור: " + (j.error || "לא ידועה");
        st.className = "aia-render-status bad";
        if (btn) btn.disabled = false;
      }
    }, 1500);
  }

  function showVideo(url, dur) {
    $("st-out").innerHTML = `
      <video class="aia-video" src="${esc(url)}" controls playsinline></video>
      <div class="aia-video-actions">
        <a class="btn primary" href="${esc(url)}" download>⤓ הורד MP4${dur ? ` (${dur}s)` : ""}</a>
      </div>`;
  }

  // ---------- גלריה ----------
  async function loadGallery() {
    try {
      const d = await fetch("/api/aia/projects").then((r) => r.json());
      if (d.maxImages) { MAX = d.maxImages; $("aia-maxnote").textContent = `עד ${MAX} תמונות`; }
      CAN_RENDER = !!d.canRender;
      BEDS = d.beds || [];
      TRANSITIONS = d.transitions || [];
      $("aia-gallery").innerHTML = (d.projects || []).map((p) => `
        <div class="aia-gcard" data-id="${esc(p.id)}">
          <button class="del" data-del="${esc(p.id)}" title="מחק">🗑</button>
          <div class="t">${esc(p.title || "ללא כותרת")}</div>
          <div class="m">${esc(p.type || "")} · ${new Date(p.createdAt).toLocaleDateString("he-IL")}${p.assetCount ? ` · ${p.assetCount} ייחוס` : ""}</div>
        </div>`).join("") || `<div class="aia-note">עוד אין הפקות. מלא בריף ולחץ "צור חבילת הפקה".</div>`;

      $("aia-gallery").querySelectorAll(".aia-gcard").forEach((c) => {
        c.addEventListener("click", async (e) => {
          if (e.target.dataset.del) return;
          const project = await fetch("/api/aia/project/" + c.dataset.id).then((r) => r.json());
          if (project.error) return toast(project.error, true);
          renderResult(project);
          $("aia-result").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      $("aia-gallery").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("למחוק את ההפקה?")) return;
        await fetch("/api/aia/project/" + b.dataset.del, { method: "DELETE" });
        loadGallery();
      }));
    } catch { /* השרת לא זמין */ }
  }

  loadGallery();
})();
