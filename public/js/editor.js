const toastEl = document.getElementById("toast");
function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.className = "toast"), 3200);
}

const canvas = new fabric.Canvas("magnet-canvas", {
  backgroundColor: "#2e2e4e",
  preserveObjectStacking: true
});
const CANVAS_SIZE = 560;
const MAX_PHOTO_DIM = 2000; // תמונות מצלמה (20-40MP) שוברות את מנוע הפילטרים של fabric - מקטינים לפני שימוש

// מקטין תמונות ענקיות לפני הוספה לקנבס. פילטרים (בהירות/ניגודיות וכו') על תמונות
// ענקיות עם clipPath שוברים את הרינדור ב-fabric (התמונה "מתכווצת" לפינה) - זה מונע את זה,
// וגם משפר ביצועים כי אין צורך ברזולוציה גבוהה יותר מגודל הקנבס (560px, עד 1120px בייצוא).
function downscaleIfHuge(img, maxDim = MAX_PHOTO_DIM) {
  if (img.width <= maxDim && img.height <= maxDim) return img;
  const scale = maxDim / Math.max(img.width, img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  off.getContext("2d").drawImage(img.getElement(), 0, 0, w, h);
  return new fabric.Image(off);
}

let currentEvent = null; // { id, name }
let basePhoto = null; // fabric.Image reference to whichever photo is currently selected/edited
let activeLayout = null; // פריסת הקולאז' הנוכחית (null = תמונה בודדת, המצב הישן)

// פריסות קולאז' - קואורדינטות במרחב הקנבס (560x560)
const LAYOUTS = [
  { key: "single", label: "תמונה בודדת", slots: [{ x: 0, y: 0, w: 560, h: 560 }] },
  { key: "split-v", label: "שני צילומים · אנכי", slots: [{ x: 0, y: 0, w: 278, h: 560 }, { x: 282, y: 0, w: 278, h: 560 }] },
  { key: "split-h", label: "שני צילומים · אופקי", slots: [{ x: 0, y: 0, w: 560, h: 278 }, { x: 0, y: 282, w: 560, h: 278 }] },
  { key: "strip-3", label: "שלושה צילומים", slots: [{ x: 0, y: 0, w: 184, h: 560 }, { x: 188, y: 0, w: 184, h: 560 }, { x: 376, y: 0, w: 184, h: 560 }] },
  { key: "grid-4", label: "רשת 2×2", slots: [{ x: 0, y: 0, w: 278, h: 278 }, { x: 282, y: 0, w: 278, h: 278 }, { x: 0, y: 282, w: 278, h: 278 }, { x: 282, y: 282, w: 278, h: 278 }] },
  { key: "hero-2", label: "מרכזית + שתי קטנות", slots: [{ x: 0, y: 0, w: 372, h: 560 }, { x: 376, y: 0, w: 184, h: 278 }, { x: 376, y: 282, w: 184, h: 278 }] }
];

const params = new URLSearchParams(window.location.search);
const initialEvent = params.get("event");
const initialFile = params.get("file");

// ---------- Base photo ----------

function loadPhotoIntoCanvas(eventId, relPath, eventName) {
  const url = `/media/event/${encodeURIComponent(eventId)}?file=${encodeURIComponent(relPath)}`;
  fabric.Image.fromURL(url, (loaded) => {
    const img = downscaleIfHuge(loaded);
    const scale = Math.min(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
    img.set({
      left: CANVAS_SIZE / 2,
      top: CANVAS_SIZE / 2,
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale,
      selectable: true,
      name: "photo"
    });
    if (basePhoto) canvas.remove(basePhoto);
    canvas.insertAt(img, 0, false);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();

    basePhoto = img;
    resetPhotoControls();
    refreshPhotoProps();
  }, { crossOrigin: "anonymous" });

  currentEvent = { id: eventId, name: eventName || eventId };
  document.getElementById("event-context").textContent = `אירוע: ${currentEvent.name}`;
  const baseName = relPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  document.getElementById("save-name").value = baseName + "-מגנט";
  document.getElementById("canvas-hint").textContent = "גררו את התמונה כדי למקם אותה, ואז הוסיפו מסגרת מהצד.";
}

if (initialEvent && initialFile) {
  loadPhotoIntoCanvas(initialEvent, initialFile, params.get("eventName"));
}

// ---------- Frames & clipart sidebars ----------

async function loadFrames() {
  const grid = document.getElementById("frames-grid");
  const frames = await fetch("/api/frames").then((r) => r.json()).catch(() => []);
  if (!frames.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">לא נמצאו מסגרות</div>`;
    return;
  }
  grid.innerHTML = frames.map((f) => `
    <div class="thumb-item" data-name="${encodeURIComponent(f)}" title="${f}">
      <img src="/media/frame/${encodeURIComponent(f)}" alt="${f}" loading="lazy"/>
    </div>
  `).join("");
  grid.querySelectorAll(".thumb-item").forEach((el) => {
    el.addEventListener("click", () => addImageObject(`/media/frame/${el.dataset.name}`, "frame", true));
  });
}

async function loadClipart() {
  const grid = document.getElementById("clipart-grid");
  const items = await fetch("/api/clipart").then((r) => r.json()).catch(() => []);
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">לא נמצא קליפ-ארט</div>`;
    return;
  }
  grid.innerHTML = items.slice(0, 40).map((f) => `
    <div class="thumb-item" data-name="${encodeURIComponent(f)}" title="${f}">
      <img src="/media/clipart/${encodeURIComponent(f)}" alt="${f}" loading="lazy"/>
    </div>
  `).join("");
  grid.querySelectorAll(".thumb-item").forEach((el) => {
    el.addEventListener("click", () => addImageObject(`/media/clipart/${el.dataset.name}`, "clipart", false));
  });
}

function addImageObject(url, kind, fillCanvas) {
  fabric.Image.fromURL(url, (img) => {
    if (fillCanvas) {
      const scale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
      img.set({ left: CANVAS_SIZE / 2, top: CANVAS_SIZE / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
    } else {
      const scale = Math.min(160 / img.width, 160 / img.height);
      img.set({ left: CANVAS_SIZE / 2, top: CANVAS_SIZE / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
    }
    img.set({ name: kind });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
  }, { crossOrigin: "anonymous" });
}

loadFrames();
loadClipart();

// ---------- Text ----------

document.getElementById("btn-add-text").addEventListener("click", () => {
  const text = new fabric.IText("שם / תאריך", {
    left: CANVAS_SIZE / 2,
    top: CANVAS_SIZE / 2,
    originX: "center",
    originY: "center",
    fontFamily: "Frank Ruhl Libre, serif",
    fontSize: 36,
    fill: "#f3ecdd",
    name: "text"
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.requestRenderAll();
});

const textProps = document.getElementById("text-props");
const textPropsEmpty = document.getElementById("text-props-empty");
const textColor = document.getElementById("text-color");
const textSize = document.getElementById("text-size");
const textFont = document.getElementById("text-font");
const textBoldBtn = document.getElementById("text-bold");
const textItalicBtn = document.getElementById("text-italic");
const textStroke = document.getElementById("text-stroke");

function refreshTextProps() {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    textProps.classList.remove("hidden");
    textPropsEmpty.classList.add("hidden");
    textColor.value = obj.fill || "#f3ecdd";
    textSize.value = obj.fontSize || 36;
    textFont.value = obj.fontFamily || "Frank Ruhl Libre, serif";
    textBoldBtn.classList.toggle("active", obj.fontWeight === "bold");
    textItalicBtn.classList.toggle("active", obj.fontStyle === "italic");
    textStroke.value = obj.stroke || "#000000";
  } else {
    textProps.classList.add("hidden");
    textPropsEmpty.classList.remove("hidden");
  }
}

const opacityProps = document.getElementById("opacity-props");
const opacityPropsEmpty = document.getElementById("opacity-props-empty");
const opacityInput = document.getElementById("obj-opacity");

function refreshOpacityProps() {
  const obj = canvas.getActiveObject();
  if (obj) {
    opacityProps.classList.remove("hidden");
    opacityPropsEmpty.classList.add("hidden");
    opacityInput.value = Math.round((obj.opacity ?? 1) * 100);
  } else {
    opacityProps.classList.add("hidden");
    opacityPropsEmpty.classList.remove("hidden");
  }
}

opacityInput.addEventListener("input", () => {
  const obj = canvas.getActiveObject();
  if (obj) { obj.set("opacity", Number(opacityInput.value) / 100); canvas.requestRenderAll(); }
});

function syncSelectionToPanels() {
  refreshTextProps();
  refreshOpacityProps();
  const obj = canvas.getActiveObject();
  basePhoto = obj && obj.name === "photo" ? obj : null;
  refreshPhotoProps(); // קורא את editState של האובייקט שנבחר (או ריק אם אין)
}

canvas.on("selection:created", syncSelectionToPanels);
canvas.on("selection:updated", syncSelectionToPanels);
canvas.on("selection:cleared", syncSelectionToPanels);

textColor.addEventListener("input", () => {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "i-text") { obj.set("fill", textColor.value); canvas.requestRenderAll(); }
});
textSize.addEventListener("input", () => {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "i-text") { obj.set("fontSize", Number(textSize.value)); canvas.requestRenderAll(); }
});
textFont.addEventListener("change", () => {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "i-text") { obj.set("fontFamily", textFont.value); canvas.requestRenderAll(); }
});
textBoldBtn.addEventListener("click", () => {
  const obj = canvas.getActiveObject();
  if (!obj || obj.type !== "i-text") return;
  const bold = obj.fontWeight === "bold" ? "normal" : "bold";
  obj.set("fontWeight", bold);
  textBoldBtn.classList.toggle("active", bold === "bold");
  canvas.requestRenderAll();
});
textItalicBtn.addEventListener("click", () => {
  const obj = canvas.getActiveObject();
  if (!obj || obj.type !== "i-text") return;
  const italic = obj.fontStyle === "italic" ? "normal" : "italic";
  obj.set("fontStyle", italic);
  textItalicBtn.classList.toggle("active", italic === "italic");
  canvas.requestRenderAll();
});
textStroke.addEventListener("input", () => {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "i-text") { obj.set({ stroke: textStroke.value, strokeWidth: 1 }); canvas.requestRenderAll(); }
});

// ---------- Photo editing (brightness / contrast / saturation / grayscale / sepia / rotate / flip) ----------

const photoProps = document.getElementById("photo-props");
const photoPropsEmpty = document.getElementById("photo-props-empty");
const brightnessInput = document.getElementById("photo-brightness");
const contrastInput = document.getElementById("photo-contrast");
const saturationInput = document.getElementById("photo-saturation");
const grayscaleBtn = document.getElementById("photo-grayscale");
const sepiaBtn = document.getElementById("photo-sepia");
const invertBtn = document.getElementById("photo-invert");
const sharpenBtn = document.getElementById("photo-sharpen");
const blurInput = document.getElementById("photo-blur");
const hueInput = document.getElementById("photo-hue");

// כל תמונה שומרת את מצב העריכה שלה על עצמה (obj.editState), כדי שמעבר בין כמה תמונות
// בקולאז' לא ידרוס את ההתאמות של תמונה אחרת.
function defaultEditState() {
  return { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0, grayscale: false, sepia: false, invert: false, sharpen: false };
}

// בונה מופע פילטר בבטחה - אם גרסת fabric שנטענה לא כוללת מחלקת פילטר מסוימת, פשוט מדלגים
// עליה במקום לשבור את כל שרשרת הפילטרים.
function safeFilter(ctor, opts) {
  try {
    return ctor ? new ctor(opts) : null;
  } catch {
    return null;
  }
}

function refreshPhotoProps() {
  if (basePhoto) {
    photoProps.classList.remove("hidden");
    photoPropsEmpty.classList.add("hidden");
    const st = basePhoto.editState || defaultEditState();
    brightnessInput.value = st.brightness;
    contrastInput.value = st.contrast;
    saturationInput.value = st.saturation;
    blurInput.value = st.blur;
    hueInput.value = st.hue;
    grayscaleBtn.classList.toggle("active", st.grayscale);
    sepiaBtn.classList.toggle("active", st.sepia);
    invertBtn.classList.toggle("active", st.invert);
    sharpenBtn.classList.toggle("active", st.sharpen);
  } else {
    photoProps.classList.add("hidden");
    photoPropsEmpty.classList.remove("hidden");
  }
}

function resetPhotoControls() {
  brightnessInput.value = 0;
  contrastInput.value = 0;
  saturationInput.value = 0;
  blurInput.value = 0;
  hueInput.value = 0;
  [grayscaleBtn, sepiaBtn, invertBtn, sharpenBtn].forEach((b) => b.classList.remove("active"));
}

function applyPhotoFilters() {
  if (!basePhoto || !window.fabric) return;
  if (!basePhoto.editState) basePhoto.editState = defaultEditState();
  const st = basePhoto.editState;
  st.brightness = Number(brightnessInput.value);
  st.contrast = Number(contrastInput.value);
  st.saturation = Number(saturationInput.value);
  st.blur = Number(blurInput.value);
  st.hue = Number(hueInput.value);

  const f = fabric.Image.filters;
  const filters = [
    st.brightness !== 0 && safeFilter(f.Brightness, { brightness: st.brightness / 100 }),
    st.contrast !== 0 && safeFilter(f.Contrast, { contrast: st.contrast / 100 }),
    st.saturation !== 0 && safeFilter(f.Saturation, { saturation: st.saturation / 100 }),
    st.blur > 0 && safeFilter(f.Blur, { blur: st.blur / 100 }),
    st.hue !== 0 && safeFilter(f.HueRotation, { rotation: (st.hue * Math.PI) / 180 }),
    st.grayscale && safeFilter(f.Grayscale),
    st.sepia && safeFilter(f.Sepia),
    st.invert && safeFilter(f.Invert),
    st.sharpen && safeFilter(f.Convolute, { matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0] })
  ].filter(Boolean);

  basePhoto.filters = filters;
  basePhoto.applyFilters();
  canvas.requestRenderAll();
}

[brightnessInput, contrastInput, saturationInput, blurInput, hueInput].forEach((el) => el.addEventListener("input", applyPhotoFilters));

function toggleEditState(key, btn) {
  if (!basePhoto) return;
  if (!basePhoto.editState) basePhoto.editState = defaultEditState();
  basePhoto.editState[key] = !basePhoto.editState[key];
  btn.classList.toggle("active", basePhoto.editState[key]);
  applyPhotoFilters();
}

grayscaleBtn.addEventListener("click", () => toggleEditState("grayscale", grayscaleBtn));
sepiaBtn.addEventListener("click", () => toggleEditState("sepia", sepiaBtn));
invertBtn.addEventListener("click", () => toggleEditState("invert", invertBtn));
sharpenBtn.addEventListener("click", () => toggleEditState("sharpen", sharpenBtn));

// ---------- אפקטים אמנותיים (שילובי פילטרים מוכנים - לא AI, מחושב מקומית) ----------

function applyArtisticPreset(preset) {
  if (!basePhoto) return;
  const st = defaultEditState();
  if (preset === "cartoon") {
    Object.assign(st, { saturation: 65, contrast: 45, sharpen: true });
  } else if (preset === "sketch") {
    Object.assign(st, { grayscale: true, contrast: 60, sharpen: true, brightness: 15 });
  } else if (preset === "vintage") {
    Object.assign(st, { sepia: true, contrast: -15, saturation: -20, brightness: -5 });
  }
  basePhoto.editState = st;
  refreshPhotoProps();
  applyPhotoFilters();
}

document.getElementById("photo-cartoon").addEventListener("click", () => applyArtisticPreset("cartoon"));
document.getElementById("photo-sketch").addEventListener("click", () => applyArtisticPreset("sketch"));
document.getElementById("photo-vintage").addEventListener("click", () => applyArtisticPreset("vintage"));

document.getElementById("photo-rotate").addEventListener("click", () => {
  if (!basePhoto) return;
  basePhoto.rotate((basePhoto.angle + 90) % 360);
  canvas.requestRenderAll();
});
document.getElementById("photo-flip-h").addEventListener("click", () => {
  if (!basePhoto) return;
  basePhoto.set("flipX", !basePhoto.flipX);
  canvas.requestRenderAll();
});
document.getElementById("photo-flip-v").addEventListener("click", () => {
  if (!basePhoto) return;
  basePhoto.set("flipY", !basePhoto.flipY);
  canvas.requestRenderAll();
});
document.getElementById("photo-reset").addEventListener("click", () => {
  if (!basePhoto) return;
  basePhoto.editState = defaultEditState();
  resetPhotoControls();
  basePhoto.filters = [];
  basePhoto.applyFilters();
  basePhoto.set({ angle: 0, flipX: false, flipY: false });
  canvas.requestRenderAll();
});

// ---------- Layer / object controls ----------

document.getElementById("btn-front").addEventListener("click", () => {
  const obj = canvas.getActiveObject();
  if (obj) { canvas.bringToFront(obj); canvas.requestRenderAll(); }
});
document.getElementById("btn-back").addEventListener("click", () => {
  const obj = canvas.getActiveObject();
  if (obj) { canvas.sendToBack(obj); canvas.requestRenderAll(); }
});
document.getElementById("btn-delete").addEventListener("click", () => {
  const obj = canvas.getActiveObject();
  if (obj) { canvas.remove(obj); canvas.requestRenderAll(); }
});
document.getElementById("btn-duplicate").addEventListener("click", () => {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  obj.clone((cloned) => {
    cloned.set({ left: obj.left + 18, top: obj.top + 18 });
    delete cloned.slotIndex; // עותק חופשי - לא קשור לתא קולאז' של המקור
    if (cloned.editState) cloned.editState = JSON.parse(JSON.stringify(cloned.editState));
    canvas.add(cloned);
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
  }, ["name", "slotIndex", "editState"]);
});
window.addEventListener("keydown", (e) => {
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT") return;
  const obj = canvas.getActiveObject();
  if ((e.key === "Delete" || e.key === "Backspace") && obj && !obj.isEditing) {
    canvas.remove(obj);
    canvas.requestRenderAll();
  } else if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undoHistory();
  } else if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
    e.preventDefault();
    redoHistory();
  }
});

// ---------- Undo / Redo ----------

let historyStack = [];
let historyIndex = -1;
let suppressHistory = false;
const EXTRA_PROPS = ["name", "slotIndex", "editState", "selectable"];

function pushHistory() {
  if (suppressHistory) return;
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(JSON.stringify(canvas.toJSON(EXTRA_PROPS)));
  if (historyStack.length > 40) historyStack.shift();
  historyIndex = historyStack.length - 1;
}

function loadHistoryState(json) {
  suppressHistory = true;
  canvas.loadFromJSON(json, () => {
    canvas.requestRenderAll();
    basePhoto = null;
    refreshPhotoProps();
    suppressHistory = false;
  });
}

function undoHistory() {
  if (historyIndex <= 0) return;
  historyIndex--;
  loadHistoryState(historyStack[historyIndex]);
}
function redoHistory() {
  if (historyIndex >= historyStack.length - 1) return;
  historyIndex++;
  loadHistoryState(historyStack[historyIndex]);
}

canvas.on("object:added", pushHistory);
canvas.on("object:removed", pushHistory);
canvas.on("object:modified", pushHistory);
document.getElementById("btn-undo").addEventListener("click", undoHistory);
document.getElementById("btn-redo").addEventListener("click", redoHistory);

// ---------- Zoom ----------

let zoomLevel = 1;
function applyZoom() {
  canvas.setZoom(zoomLevel);
  canvas.setWidth(CANVAS_SIZE * zoomLevel);
  canvas.setHeight(CANVAS_SIZE * zoomLevel);
  document.getElementById("zoom-level").textContent = `${Math.round(zoomLevel * 100)}%`;
}
document.getElementById("btn-zoom-in").addEventListener("click", () => { zoomLevel = Math.min(3, zoomLevel + 0.1); applyZoom(); });
document.getElementById("btn-zoom-out").addEventListener("click", () => { zoomLevel = Math.max(0.3, zoomLevel - 0.1); applyZoom(); });
document.getElementById("btn-zoom-reset").addEventListener("click", () => { zoomLevel = 1; applyZoom(); });

/** מייצא PNG תמיד ברזולוציה מלאה ב-zoom 100%, בלי קשר לזום התצוגה הנוכחי */
function exportCanvasPng(multiplier) {
  const savedZoom = zoomLevel;
  if (savedZoom !== 1) { zoomLevel = 1; applyZoom(); }
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  const dataUrl = canvas.toDataURL({ format: "png", multiplier });
  if (savedZoom !== 1) { zoomLevel = savedZoom; applyZoom(); }
  return dataUrl;
}

// ---------- Custom grid (unlimited photo slots) + free-floating photos ----------

document.getElementById("btn-apply-custom-grid").addEventListener("click", () => {
  const rows = Math.max(1, Number(document.getElementById("grid-rows").value) || 1);
  const cols = Math.max(1, Number(document.getElementById("grid-cols").value) || 1);
  const gap = 4;
  const cw = (CANVAS_SIZE - (cols - 1) * gap) / cols;
  const ch = (CANVAS_SIZE - (rows - 1) * gap) / rows;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: c * (cw + gap), y: r * (ch + gap), w: cw, h: ch });
    }
  }
  activeLayout = { key: "custom", label: `${rows}×${cols}`, slots };
  suppressHistory = true;
  clearSlots();
  slots.forEach((slot, index) => makePlaceholder(slot, index).forEach((obj) => canvas.insertAt(obj, 0, false)));
  suppressHistory = false;
  pushHistory();
  canvas.requestRenderAll();
  document.querySelectorAll(".layout-thumb").forEach((t) => t.classList.remove("active"));
  document.getElementById("canvas-hint").textContent = `${rows * cols} תאים - לחצו על כל תא כדי לבחור תמונה.`;
});

document.getElementById("btn-add-free-photo").addEventListener("click", () => {
  openPicker((eid, rel, name) => {
    const url = `/media/event/${encodeURIComponent(eid)}?file=${encodeURIComponent(rel)}`;
    fabric.Image.fromURL(url, (loaded) => {
      const img = downscaleIfHuge(loaded);
      const scale = Math.min(200 / img.width, 200 / img.height);
      img.set({
        left: CANVAS_SIZE / 2, top: CANVAS_SIZE / 2,
        originX: "center", originY: "center",
        scaleX: scale, scaleY: scale,
        name: "photo"
      });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
      basePhoto = img;
      resetPhotoControls();
      refreshPhotoProps();
    }, { crossOrigin: "anonymous" });
    if (!currentEvent) {
      currentEvent = { id: eid, name: name || eid };
      document.getElementById("event-context").textContent = `אירוע: ${currentEvent.name}`;
    }
  });
});

// ---------- Shapes ----------

document.getElementById("shape-rect").addEventListener("click", () => {
  const rect = new fabric.Rect({
    left: CANVAS_SIZE / 2, top: CANVAS_SIZE / 2, originX: "center", originY: "center",
    width: 150, height: 100, fill: "#c9a96e", name: "shape"
  });
  canvas.add(rect); canvas.setActiveObject(rect); canvas.requestRenderAll();
});
document.getElementById("shape-circle").addEventListener("click", () => {
  const circle = new fabric.Circle({
    left: CANVAS_SIZE / 2, top: CANVAS_SIZE / 2, originX: "center", originY: "center",
    radius: 60, fill: "#c9a96e", name: "shape"
  });
  canvas.add(circle); canvas.setActiveObject(circle); canvas.requestRenderAll();
});
document.getElementById("shape-line").addEventListener("click", () => {
  const line = new fabric.Line([CANVAS_SIZE / 2 - 80, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 80, CANVAS_SIZE / 2], {
    stroke: "#c9a96e", strokeWidth: 4, name: "shape"
  });
  canvas.add(line); canvas.setActiveObject(line); canvas.requestRenderAll();
});

// ---------- Print (דרך תיבת ההדפסה של הדפדפן - רואה את כל המדפסות שמוגדרות בווינדוס) ----------

async function loadPrintersInfo() {
  const box = document.getElementById("printers-info");
  const printers = await fetch("/api/printers").then((r) => r.json()).catch(() => []);
  box.textContent = printers.length
    ? `מדפסות זמינות: ${printers.join(", ")}`
    : "לא זוהו מדפסות באופן אוטומטי - תיבת ההדפסה עדיין תציג את המדפסות המותקנות";
}
loadPrintersInfo();

document.getElementById("btn-print").addEventListener("click", () => {
  const sizeCm = document.getElementById("print-size").value;
  const dataUrl = exportCanvasPng(3);
  const printWindow = window.open("", "_blank");
  if (!printWindow) { toast("הדפדפן חסם חלון קופץ - יש לאשר חלונות קופצים לאתר הזה", true); return; }
  printWindow.document.write(`<!DOCTYPE html><html><head><title>הדפסת מגנט</title><style>
    @page { size: ${sizeCm}cm ${sizeCm}cm; margin: 0; }
    html, body { margin: 0; padding: 0; height: 100%; display: flex; align-items: center; justify-content: center; }
    img { width: ${sizeCm}cm; height: ${sizeCm}cm; object-fit: contain; }
  </style></head><body><img src="${dataUrl}" /></body></html>`);
  printWindow.document.close();
  setTimeout(() => { try { printWindow.focus(); printWindow.print(); } catch { /* חלון נחסם */ } }, 500);
});

// ---------- Photo picker modal ----------
// openPicker מקבלת callback(eventId, relPath, eventName) שנקרא כשבוחרים תמונה - כך גם
// הכפתור הראשי וגם כל תא בקולאז' יכולים להשתמש באותו מודל בחירה.

const pickerModal = document.getElementById("picker-modal");
let pickerOnSelect = null;

async function openPicker(onSelect) {
  pickerOnSelect = onSelect;
  pickerModal.classList.remove("hidden");
  const box = document.getElementById("picker-events");
  box.innerHTML = "טוען אירועים…";
  const events = await fetch("/api/events").then((r) => r.json()).catch(() => []);
  if (!events.length) { box.innerHTML = `<div class="empty-state">לא נמצאו אירועים</div>`; return; }

  box.innerHTML = events.map((e) => `<div class="picker-event" data-id="${encodeURIComponent(e.id)}" data-name="${e.name}"><h4>${e.name}</h4><div class="thumb-grid" style="grid-template-columns:repeat(6,1fr);"></div></div>`).join("");

  for (const wrap of box.querySelectorAll(".picker-event")) {
    const eid = decodeURIComponent(wrap.dataset.id);
    const files = await fetch(`/api/events/${encodeURIComponent(eid)}/files`).then((r) => r.json()).catch(() => []);
    const grid = wrap.querySelector(".thumb-grid");
    grid.innerHTML = files.slice(0, 12).map((f) => `
      <div class="thumb-item" data-rel="${encodeURIComponent(f.relPath)}">
        <img src="/media/event/${encodeURIComponent(eid)}?file=${encodeURIComponent(f.relPath)}" loading="lazy"/>
      </div>
    `).join("") || `<div class="empty-state">אין תמונות</div>`;
    grid.querySelectorAll(".thumb-item").forEach((tile) => {
      tile.addEventListener("click", () => {
        pickerModal.classList.add("hidden");
        if (pickerOnSelect) pickerOnSelect(eid, decodeURIComponent(tile.dataset.rel), wrap.dataset.name);
      });
    });
  }
}

document.getElementById("btn-pick-photo").addEventListener("click", () => {
  openPicker((eid, rel, name) => loadPhotoIntoCanvas(eid, rel, name));
});
document.getElementById("picker-close").addEventListener("click", () => pickerModal.classList.add("hidden"));
pickerModal.addEventListener("click", (e) => { if (e.target === pickerModal) pickerModal.classList.add("hidden"); });

// ---------- Collage layouts (multiple photo slots on one canvas) ----------

function clearSlots() {
  canvas.getObjects().filter((o) => o.slotIndex !== undefined).forEach((o) => canvas.remove(o));
}

function makePlaceholder(slot, index) {
  const rect = new fabric.Rect({
    left: slot.x, top: slot.y, width: slot.w, height: slot.h,
    fill: "rgba(201,169,110,0.08)",
    stroke: "#c9a96e",
    strokeDashArray: [7, 7],
    strokeWidth: 1.5,
    selectable: false,
    hoverCursor: "pointer",
    name: "slot-placeholder",
    slotIndex: index
  });
  const label = new fabric.Text("+ תמונה", {
    left: slot.x + slot.w / 2, top: slot.y + slot.h / 2,
    originX: "center", originY: "center",
    fontFamily: "Heebo, sans-serif",
    fontSize: 16, fill: "#c9a96e",
    selectable: false, evented: false,
    name: "slot-label", slotIndex: index
  });
  return [rect, label];
}

function applyLayout(layoutKey) {
  const layout = LAYOUTS.find((l) => l.key === layoutKey);
  if (!layout) return;
  activeLayout = layout;
  suppressHistory = true;
  clearSlots();
  layout.slots.forEach((slot, index) => {
    makePlaceholder(slot, index).forEach((obj) => canvas.insertAt(obj, 0, false));
  });
  suppressHistory = false;
  pushHistory();
  canvas.requestRenderAll();
  document.getElementById("canvas-hint").textContent = layout.key === "single"
    ? "בחרו תמונה מאירוע, ואז הוסיפו מסגרת מהצד."
    : "לחצו על כל תא כדי לבחור לו תמונה. לחיצה כפולה על תמונה שכבר הוזנה מחליפה אותה.";
}

function fillSlot(slotIndex, eventId, relPath, eventName) {
  const layout = activeLayout || LAYOUTS[0];
  const slot = layout.slots[slotIndex];
  if (!slot) return;
  const url = `/media/event/${encodeURIComponent(eventId)}?file=${encodeURIComponent(relPath)}`;

  fabric.Image.fromURL(url, (loaded) => {
    const img = downscaleIfHuge(loaded);
    const scale = Math.max(slot.w / img.width, slot.h / img.height); // "cover" - ממלא את התא ונחתך בקצוות
    img.set({
      left: slot.x + slot.w / 2,
      top: slot.y + slot.h / 2,
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale,
      clipPath: new fabric.Rect({ left: slot.x, top: slot.y, width: slot.w, height: slot.h, absolutePositioned: true }),
      name: "photo",
      slotIndex,
      selectable: true
    });
    canvas.getObjects().filter((o) => o.slotIndex === slotIndex).forEach((o) => canvas.remove(o));
    canvas.insertAt(img, 0, false);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();

    basePhoto = img;
    resetPhotoControls();
    refreshPhotoProps();
  }, { crossOrigin: "anonymous" });

  if (!currentEvent) {
    currentEvent = { id: eventId, name: eventName || eventId };
    document.getElementById("event-context").textContent = `אירוע: ${currentEvent.name}`;
    document.getElementById("save-name").value = "קולאז'-מגנט";
  }
}

canvas.on("mouse:down", (opt) => {
  const target = opt.target;
  if (target && target.name === "slot-placeholder" && target.slotIndex !== undefined) {
    openPicker((eid, rel, name) => fillSlot(target.slotIndex, eid, rel, name));
  }
});
canvas.on("mouse:dblclick", (opt) => {
  const target = opt.target;
  if (target && target.name === "photo" && target.slotIndex !== undefined) {
    openPicker((eid, rel, name) => fillSlot(target.slotIndex, eid, rel, name));
  }
});

document.querySelectorAll(".layout-thumb").forEach((el) => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".layout-thumb").forEach((t) => t.classList.remove("active"));
    el.classList.add("active");
    applyLayout(el.dataset.layout);
  });
});

// ---------- Save ----------

document.getElementById("btn-save").addEventListener("click", async () => {
  if (!currentEvent) { toast("יש לבחור תמונה מאירוע לפני השמירה", true); return; }
  const name = document.getElementById("save-name").value.trim() || "מגנט";
  const dataUrl = exportCanvasPng(2);

  try {
    const res = await fetch("/api/editor/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: currentEvent.id, fileName: name, dataUrl })
    }).then((r) => r.json());
    if (res.ok) toast("העיצוב נשמר בתיקיית האירוע");
    else toast(res.error || "שגיאה בשמירה", true);
  } catch {
    toast("שגיאת תקשורת עם השרת המקומי", true);
  }
});
