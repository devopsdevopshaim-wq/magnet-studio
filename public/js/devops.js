/* DevOps Hub — לוח בקרה ל-n8n Cloud, תשתית, הרצת פרויקטים וצנרת CI. הכל מול השרת המקומי. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, bad) => { const t = $("toast"); t.textContent = m; t.className = "toast show" + (bad ? " error" : ""); setTimeout(() => (t.className = "toast"), 3200); };

  let STATE = null;
  const pipeTimers = {};

  // ---------- ניווט פנימי ----------
  document.querySelectorAll(".do-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".do-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".do-panel").forEach((p) => (p.hidden = p.id !== "panel-" + tab.dataset.panel));
      if (tab.dataset.panel === "n8n") loadN8n();
      if (tab.dataset.panel === "infra") renderInfra();
      if (tab.dataset.panel === "projects") loadProjects();
    });
  });

  $("do-refresh").addEventListener("click", () => { toast("מרענן…"); boot(); });

  // ---------- מודל ----------
  const modal = $("do-modal");
  $("do-modal-close").addEventListener("click", () => (modal.hidden = true));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  function showModal(title, body) { $("do-modal-title").textContent = title; $("do-modal-body").textContent = body; modal.hidden = false; }

  // ---------- מבט־על ----------
  function statCard(k, v, cls, sub) {
    return `<div class="do-stat"><span class="k">${esc(k)}</span><span class="v ${cls || ""}">${esc(v)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</div>`;
  }

  function renderOverview() {
    const s = STATE;
    const g = $("ops-grid");
    const svcUp = (s.infra.services || []).filter((x) => x.up).length;
    const svcTot = (s.infra.services || []).length;
    const ctrUp = (s.infra.containers || []).filter((c) => c.state === "running").length;
    const projUp = (s.projects || []).filter((p) => p.running).length;
    const sys = s.infra.system || {};
    const mem = sys.memory || {}, disk = sys.disk || {};
    g.innerHTML = [
      statCard("n8n Cloud", s.n8n.up ? "פעיל" : "כבוי", s.n8n.up ? "ok" : "bad",
        s.n8n.up ? (s.n8n.apiOk ? "API מחובר" : s.n8n.hasKey ? "מפתח לא תקף" : "ללא מפתח API") : s.n8n.base),
      statCard("שירותים", `${svcUp}/${svcTot}`, svcUp === svcTot ? "ok" : svcUp ? "warn" : "bad", "בריאות שירותי ליבה"),
      statCard("קונטיינרים", String(ctrUp), ctrUp ? "ok" : "warn", `${(s.infra.containers || []).length} סה״כ`),
      statCard("פרויקטים פעילים", String(projUp), projUp ? "ok" : "", `${(s.projects || []).length} מנוהלים`),
      mem.percent != null ? statCard("זיכרון", mem.percent + "%", mem.percent > 88 ? "bad" : mem.percent > 75 ? "warn" : "ok", `${mem.usedGB} / ${mem.totalGB} GB`) : "",
      disk.percent != null ? statCard("דיסק C", disk.percent + "%", disk.percent > 90 ? "bad" : "ok", `${disk.freeGB} GB פנוי`) : ""
    ].join("");
    $("ops-pipeline-card").hidden = true;
  }

  // ---------- n8n ----------
  async function loadN8n() {
    const s = STATE.n8n;
    $("n8n-base").value = s.base || "https://haimkripisn.app.n8n.cloud";
    $("n8n-open").href = (s.base || "") + "/home/workflows";
    if (!s.apiOk) {
      $("n8n-connect").hidden = false;
      $("n8n-panel").hidden = true;
      return;
    }
    $("n8n-connect").hidden = true;
    $("n8n-panel").hidden = false;
    try {
      const [wf, ex] = await Promise.all([
        fetch("/api/devops/n8n/workflows").then((r) => r.json()),
        fetch("/api/devops/n8n/executions").then((r) => r.json())
      ]);
      renderWorkflows(wf.workflows || []);
      renderExecutions(ex.executions || []);
    } catch (e) { toast("שגיאת n8n: " + e.message, true); }
  }

  function renderWorkflows(list) {
    $("n8n-count").textContent = `${list.filter((w) => w.active).length} פעילים · ${list.length} סה״כ`;
    const base = (STATE.n8n.base || "").replace(/\/+$/, "");
    $("n8n-wf-list").innerHTML = list.map((w) => `
      <div class="do-wf" data-id="${esc(w.id)}">
        <div class="do-toggle ${w.active ? "on" : ""}" data-act="toggle" title="הפעל/כבה"></div>
        <span class="name">${esc(w.name)}</span>
        ${w.trigger ? `<span class="trg">${esc(String(w.trigger).replace(/^n8n-nodes-base\./, ""))}</span>` : ""}
        <span class="meta">${w.nodes} nodes</span>
        <a class="do-runbtn" href="${esc(base)}/workflow/${esc(w.id)}" target="_blank" rel="noopener">פתח עורך ↗</a>
      </div>`).join("") || `<div class="do-muted">אין workflows.</div>`;

    $("n8n-wf-list").querySelectorAll(".do-wf").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-act="toggle"]').addEventListener("click", async (e) => {
        const el = e.currentTarget;
        const to = !el.classList.contains("on");
        el.classList.toggle("on", to);
        try {
          const r = await fetch("/api/devops/n8n/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: to }) }).then((x) => x.json());
          if (r.error) throw new Error(r.error);
          toast(to ? "ה-workflow הופעל" : "ה-workflow כובה");
        } catch (err) { el.classList.toggle("on", !to); toast(err.message, true); }
      });
    });
  }

  function renderExecutions(list) {
    $("n8n-exec-list").innerHTML = list.map((e) => `
      <div class="do-exec">
        <span class="st ${esc(e.status)}">${esc(e.status)}</span>
        <span class="wn">${esc(e.workflowName || e.workflowId)}</span>
        ${e.ms != null ? `<span class="tm">${(e.ms / 1000).toFixed(1)}s</span>` : ""}
        <span class="tm">${e.startedAt ? new Date(e.startedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
      </div>`).join("") || `<div class="do-muted">אין הרצות מתועדות.</div>`;
  }

  $("n8n-save").addEventListener("click", async () => {
    const base = $("n8n-base").value.trim();
    const apiKey = $("n8n-key").value.trim();
    const res = $("n8n-save-result");
    res.textContent = "בודק…"; res.className = "do-inline-result";
    try {
      await fetch("/api/devops/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n8n: { base, ...(apiKey ? { apiKey } : {}) } }) });
      const ov = await fetch("/api/devops/overview").then((r) => r.json());
      STATE = ov;
      if (ov.n8n.apiOk) { res.textContent = "✓ מחובר ל-n8n"; res.className = "do-inline-result ok"; loadN8n(); }
      else { res.textContent = "✗ " + (ov.n8n.apiError || "המפתח לא התקבל"); res.className = "do-inline-result bad"; }
    } catch (e) { res.textContent = "✗ " + e.message; res.className = "do-inline-result bad"; }
  });

  // ---------- פרויקטים ----------
  async function loadProjects() {
    try {
      const { projects } = await fetch("/api/devops/projects").then((r) => r.json());
      STATE.projects = projects;
      renderProjects(projects);
    } catch (e) { toast(e.message, true); }
  }

  function renderProjects(list) {
    $("projects-list").innerHTML = list.map((p) => `
      <div class="do-proj" data-id="${esc(p.id)}">
        <div class="do-proj-head">
          <span class="do-dot ${p.running ? "up" : "down"}"></span>
          <span class="name">${esc(p.name)}</span>
          <span class="type">${esc(p.type)}${p.self ? " · self" : ""}</span>
          ${p.containers != null ? `<span class="type">${p.containers} קונטיינרים</span>` : ""}
          <span class="spring"></span>
          <span class="do-muted">${p.running ? "פעיל" : "כבוי"}</span>
        </div>
        <div class="path">${esc(p.dir)}</div>
        ${p.self ? `<div class="do-muted">השרת שמריץ את הדף הזה. ניהול דרך המשימה <code class="mono">MagnetStudioServer</code>.</div>` : `
        <div class="do-proj-actions">
          <button class="go" data-act="start" ${p.running && p.type !== "compose" ? "disabled" : ""}>▶ הפעל</button>
          <button class="stop" data-act="stop" ${!p.running ? "disabled" : ""}>■ עצור</button>
          <button data-act="logs">לוגים</button>
          <button class="ci" data-act="pipeline">⚙ הרץ CI</button>
        </div>
        <div class="do-pipeline" id="pipe-${esc(p.id)}"></div>`}
      </div>`).join("") || `<div class="do-muted">לא נמצאו פרויקטים תחת התיקייה המנוהלת.</div>`;

    $("projects-list").querySelectorAll(".do-proj").forEach((card) => {
      const id = card.dataset.id;
      card.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", () => projAction(id, btn.dataset.act, btn)));
      if (pipeTimers[id]) pollPipeline(id);
    });
  }

  async function projAction(id, act, btn) {
    const orig = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      if (act === "logs") {
        const r = await fetch(`/api/devops/projects/${id}/logs`, { method: "POST" }).then((x) => x.json());
        showModal("לוגים · " + id, (r.lines || []).map((l) => l.l).join("\n") || "(אין לוגים)");
      } else if (act === "pipeline") {
        await fetch(`/api/devops/projects/${id}/pipeline`, { method: "POST" }).then((x) => x.json());
        toast("צנרת CI התחילה");
        pollPipeline(id);
      } else {
        const r = await fetch(`/api/devops/projects/${id}/${act}`, { method: "POST" }).then((x) => x.json());
        if (r.error) throw new Error(r.error);
        if (r.output) showModal((act === "start" ? "הפעלה" : "עצירה") + " · " + id, r.output);
        toast(act === "start" ? "הופעל" : "נעצר");
        setTimeout(loadProjects, 1500);
      }
    } catch (e) { toast(e.message, true); }
    finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
  }

  async function pollPipeline(id) {
    clearTimeout(pipeTimers[id]);
    const box = $("pipe-" + id);
    if (!box) return;
    try {
      const st = await fetch(`/api/devops/projects/${id}/pipeline`).then((r) => r.json());
      box.innerHTML = (st.steps || []).map((s, i) => {
        const ic = { ok: "✓", fail: "✕", running: "⟳", skipped: "–", blocked: "·", pending: "·" }[s.status] || "·";
        return `<div class="do-step ${s.status}">
          <span class="ic">${ic}</span><span class="nm">${esc(s.name)}</span>
          ${s.ms != null ? `<span class="ms">${(s.ms / 1000).toFixed(1)}s</span>` : ""}
          ${s.output ? `<span class="viewout" data-i="${i}">פלט</span>` : ""}
        </div>`;
      }).join("");
      box.querySelectorAll(".viewout").forEach((v) => v.addEventListener("click", () => showModal("פלט · " + st.steps[v.dataset.i].name, st.steps[v.dataset.i].output)));
      if (st.running) pipeTimers[id] = setTimeout(() => pollPipeline(id), 1500);
      else { delete pipeTimers[id]; if ((st.steps || []).length) toast("צנרת CI הסתיימה"); loadProjectsSoft(); }
    } catch { delete pipeTimers[id]; }
  }
  async function loadProjectsSoft() {
    try { const { projects } = await fetch("/api/devops/projects").then((r) => r.json()); STATE.projects = projects; } catch {}
  }

  // ---------- תשתית ----------
  function renderInfra() {
    const s = STATE.infra;
    $("infra-services").innerHTML = (s.services || []).map((x) =>
      `<div class="do-stat"><span class="k">${esc(x.name)}</span><span class="v ${x.up ? "ok" : "bad"}">${x.up ? "פעיל" : "כבוי"}</span></div>`
    ).join("");

    const ctrs = s.containers || [];
    $("infra-ctr-count").textContent = `${ctrs.filter((c) => c.state === "running").length} רצים · ${ctrs.length}`;
    $("infra-ctr-table").innerHTML =
      `<tr><th>שם</th><th>מצב</th><th>פורטים</th><th>image</th></tr>` +
      ctrs.map((c) => `<tr>
        <td>${esc(c.name)}</td>
        <td><span class="badge ${c.state === "running" ? "running" : "exited"}">${esc(c.state)}</span></td>
        <td class="mono">${esc(c.ports || "")}</td>
        <td class="mono">${esc((c.image || "").split("@")[0])}</td>
      </tr>`).join("");

    const sys = s.system || {}, mem = sys.memory || {}, disk = sys.disk || {};
    $("infra-sys-card").innerHTML = `<h3>משאבי מערכת</h3><div class="do-grid">` + [
      mem.percent != null ? statCard("זיכרון", mem.percent + "%", mem.percent > 85 ? "warn" : "ok", `${mem.usedGB} / ${mem.totalGB} GB`) : "",
      disk.percent != null ? statCard("דיסק C", disk.percent + "%", disk.percent > 90 ? "bad" : "ok", `${disk.freeGB} GB פנוי`) : "",
      sys.cpuPercent != null ? statCard("מעבד", sys.cpuPercent + "%", "ok", `${sys.cpuCount || "?"} ליבות`) : "",
      sys.uptimeHours != null ? statCard("Uptime", sys.uptimeHours + " ש'", "") : ""
    ].join("") + `</div>`;
  }

  // ---------- אשף AI ----------
  let wizMessages = [];
  let wizSessionId = "devops-wizard-" + Date.now();
  let wizBusy = false;

  function wizRenderThread() {
    $("wiz-thread").innerHTML = wizMessages.map((m) => `
      <div class="wiz-msg ${m.role}"><div class="b">${esc(m.text)}</div></div>
    `).join("");
    $("wiz-thread").scrollTop = $("wiz-thread").scrollHeight;
  }

  async function wizSend() {
    const input = $("wiz-input");
    const text = input.value.trim();
    if (!text || wizBusy) return;
    wizMessages.push({ role: "user", text });
    wizRenderThread();
    input.value = "";
    wizBusy = true;
    const btn = $("wiz-send");
    btn.disabled = true; btn.textContent = "חושב…";
    try {
      const r = await fetch("/api/devops/wizard/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: wizMessages, sessionId: wizSessionId })
      }).then((x) => x.json());
      if (!r.ok) {
        wizMessages.push({ role: "assistant", text: "✗ " + (r.error || "שגיאה בפנייה לצ'אט AI") });
        wizRenderThread();
      } else if (r.done) {
        wizMessages.push({ role: "assistant", text: "✓ הכנתי מפרט מלא — ראו למטה." });
        wizRenderThread();
        $("wiz-result-title").textContent = r.json.title || "התוצאה";
        $("wiz-json").textContent = JSON.stringify(r.json, null, 2);
        $("wiz-result").hidden = false;
        $("wiz-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        wizMessages.push({ role: "assistant", text: r.question });
        wizRenderThread();
      }
    } catch (err) {
      wizMessages.push({ role: "assistant", text: "✗ שגיאת רשת: " + err.message });
      wizRenderThread();
    } finally {
      wizBusy = false;
      btn.disabled = false; btn.textContent = "שלח";
      input.focus();
    }
  }
  $("wiz-send").addEventListener("click", wizSend);
  $("wiz-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); wizSend(); }
  });
  $("wiz-copy").addEventListener("click", () => {
    navigator.clipboard?.writeText($("wiz-json").textContent).then(() => toast("הועתק")).catch(() => toast("ההעתקה נכשלה", true));
  });
  $("wiz-download").addEventListener("click", () => {
    const blob = new Blob([$("wiz-json").textContent], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (($("wiz-result-title").textContent || "devops-spec").replace(/[\\/:*?"<>|]/g, "_")) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------- boot ----------
  async function boot() {
    try {
      STATE = await fetch("/api/devops/overview").then((r) => r.json());
      if (STATE.error) throw new Error(STATE.error);
      $("do-loading").hidden = true;
      const active = document.querySelector(".do-tab.active").dataset.panel;
      document.querySelectorAll(".do-panel").forEach((p) => (p.hidden = p.id !== "panel-" + active));
      renderOverview();
      renderProjects(STATE.projects || []);
      if (active === "n8n") loadN8n();
      if (active === "infra") renderInfra();
    } catch (e) {
      $("do-loading").textContent = "שגיאה בטעינת המצב: " + e.message;
    }
  }
  boot();
})();
