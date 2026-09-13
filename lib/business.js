// lib/business.js — ניהול עסק: לקוחות, חשבוניות, הנהלת חשבונות (הכנסות/הוצאות), יומן עסקי.
// כל הנתונים ב-PERSIST_DIR/business/*.json (ראו lib/paths.js) — שורד פריסה מחדש בענן עם דיסק קבוע. אין תלות ב-API חיצוני.

const fs = require("fs");
const path = require("path");
const { PERSIST_DIR } = require("./paths");

const DIR = path.join(PERSIST_DIR, "business");
const FILES = {
  clients: path.join(DIR, "clients.json"),
  invoices: path.join(DIR, "invoices.json"),
  ledger: path.join(DIR, "ledger.json"),
  calendar: path.join(DIR, "calendar.json")
};

function readArr(file) {
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(j) ? j : []; }
  catch { return []; }
}
function writeArr(file, arr) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(arr, null, 2));
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---------- לקוחות ----------
function listClients() { return readArr(FILES.clients).sort((a, b) => a.name.localeCompare(b.name, "he")); }
function saveClient(input) {
  const list = readArr(FILES.clients);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("צריך שם לקוח");
  if (input.id) {
    const c = list.find((x) => x.id === input.id);
    if (!c) throw new Error("לקוח לא נמצא");
    Object.assign(c, { name, phone: input.phone || "", email: input.email || "", notes: input.notes || "" });
    writeArr(FILES.clients, list);
    return c;
  }
  const c = { id: newId(), name, phone: input.phone || "", email: input.email || "", notes: input.notes || "", createdAt: new Date().toISOString() };
  list.push(c);
  writeArr(FILES.clients, list);
  return c;
}
function deleteClient(id) {
  writeArr(FILES.clients, readArr(FILES.clients).filter((c) => c.id !== id));
  return { ok: true };
}

// ---------- חשבוניות ----------
function invoiceTotal(inv) {
  const sub = (inv.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const disc = Math.max(0, Math.min(100, Number(inv.discount) || 0));
  return +(sub * (1 - disc / 100)).toFixed(2);
}
function nextInvoiceNumber() {
  const list = readArr(FILES.invoices);
  const year = new Date().getFullYear();
  const thisYear = list.filter((i) => (i.number || "").startsWith(String(year)));
  const n = thisYear.length + 1;
  return `${year}-${String(n).padStart(4, "0")}`;
}
function listInvoices() {
  const clients = listClients();
  return readArr(FILES.invoices).map((inv) => ({
    ...inv,
    total: invoiceTotal(inv),
    clientName: inv.clientName || (clients.find((c) => c.id === inv.clientId) || {}).name || "—"
  })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
function getInvoice(id) {
  const inv = readArr(FILES.invoices).find((i) => i.id === id);
  if (!inv) return null;
  const client = listClients().find((c) => c.id === inv.clientId);
  return { ...inv, total: invoiceTotal(inv), client: client || { name: inv.clientName || "לקוח" } };
}
function saveInvoice(input) {
  const list = readArr(FILES.invoices);
  const items = (input.items || []).filter((it) => it.desc).map((it) => ({
    desc: String(it.desc).slice(0, 200), qty: Number(it.qty) || 1, price: Number(it.price) || 0
  }));
  if (!items.length) throw new Error("צריך לפחות פריט אחד");
  if (input.id) {
    const inv = list.find((i) => i.id === input.id);
    if (!inv) throw new Error("חשבונית לא נמצאה");
    Object.assign(inv, {
      clientId: input.clientId || inv.clientId, clientName: input.clientName || inv.clientName,
      date: input.date || inv.date, dueDate: input.dueDate || inv.dueDate,
      items, discount: Number(input.discount) || 0, notes: input.notes || ""
    });
    writeArr(FILES.invoices, list);
    return inv;
  }
  const inv = {
    id: newId(), number: nextInvoiceNumber(),
    clientId: input.clientId || null, clientName: input.clientName || "",
    date: input.date || new Date().toISOString().slice(0, 10),
    dueDate: input.dueDate || "",
    items, discount: Number(input.discount) || 0, notes: input.notes || "",
    status: "draft", createdAt: new Date().toISOString()
  };
  list.push(inv);
  writeArr(FILES.invoices, list);
  return inv;
}
function deleteInvoice(id) {
  writeArr(FILES.invoices, readArr(FILES.invoices).filter((i) => i.id !== id));
  return { ok: true };
}
function markInvoicePaid(id) {
  const list = readArr(FILES.invoices);
  const inv = list.find((i) => i.id === id);
  if (!inv) throw new Error("חשבונית לא נמצאה");
  inv.status = "paid";
  inv.paidAt = new Date().toISOString();
  writeArr(FILES.invoices, list);
  // רישום אוטומטי בהנהלת החשבונות — בלי הזנה כפולה
  const ledger = readArr(FILES.ledger);
  if (!ledger.some((l) => l.linkedInvoiceId === id)) {
    ledger.push({
      id: newId(), date: inv.date, type: "income", category: "מכירות",
      amount: invoiceTotal(inv), note: `חשבונית ${inv.number} — ${inv.clientName || ""}`.trim(),
      linkedInvoiceId: id, createdAt: new Date().toISOString()
    });
    writeArr(FILES.ledger, ledger);
  }
  return getInvoice(id);
}
function setInvoiceStatus(id, status) {
  const list = readArr(FILES.invoices);
  const inv = list.find((i) => i.id === id);
  if (!inv) throw new Error("חשבונית לא נמצאה");
  if (status === "paid") return markInvoicePaid(id);
  inv.status = status;
  writeArr(FILES.invoices, list);
  return getInvoice(id);
}

// ---------- הנהלת חשבונות ----------
function listLedger(month) {
  let list = readArr(FILES.ledger);
  if (month) list = list.filter((l) => (l.date || "").startsWith(month));
  list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const income = list.filter((l) => l.type === "income").reduce((s, l) => s + Number(l.amount || 0), 0);
  const expense = list.filter((l) => l.type === "expense").reduce((s, l) => s + Number(l.amount || 0), 0);
  const byCategory = {};
  list.forEach((l) => { byCategory[l.category] = (byCategory[l.category] || 0) + (l.type === "expense" ? -Number(l.amount || 0) : Number(l.amount || 0)); });
  return { entries: list, summary: { income: +income.toFixed(2), expense: +expense.toFixed(2), net: +(income - expense).toFixed(2) }, byCategory };
}
function saveLedgerEntry(input) {
  const list = readArr(FILES.ledger);
  const amount = Number(input.amount);
  if (!amount || amount <= 0) throw new Error("צריך סכום חיובי");
  if (!["income", "expense"].includes(input.type)) throw new Error("סוג לא תקין");
  const e = {
    id: newId(), date: input.date || new Date().toISOString().slice(0, 10),
    type: input.type, category: input.category || (input.type === "income" ? "אחר — הכנסה" : "אחר — הוצאה"),
    amount, note: input.note || "", createdAt: new Date().toISOString()
  };
  list.push(e);
  writeArr(FILES.ledger, list);
  return e;
}
function deleteLedgerEntry(id) {
  writeArr(FILES.ledger, readArr(FILES.ledger).filter((l) => l.id !== id));
  return { ok: true };
}

// ---------- יומן עסקי ----------
function listCalendar(month) {
  let list = readArr(FILES.calendar);
  if (month) list = list.filter((c) => (c.date || "").startsWith(month));
  return list.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
}
function upcomingCalendar(days = 14) {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return readArr(FILES.calendar).filter((c) => c.date >= today && c.date <= end)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
}
function saveCalendarEntry(input) {
  const list = readArr(FILES.calendar);
  if (!input.date) throw new Error("צריך תאריך");
  if (!input.title) throw new Error("צריך כותרת");
  const e = {
    id: newId(), date: input.date, time: input.time || "", title: String(input.title).slice(0, 140),
    type: input.type || "meeting", clientId: input.clientId || null, notes: input.notes || "",
    createdAt: new Date().toISOString()
  };
  list.push(e);
  writeArr(FILES.calendar, list);
  return e;
}
function deleteCalendarEntry(id) {
  writeArr(FILES.calendar, readArr(FILES.calendar).filter((c) => c.id !== id));
  return { ok: true };
}

module.exports = {
  listClients, saveClient, deleteClient,
  listInvoices, getInvoice, saveInvoice, deleteInvoice, markInvoicePaid, setInvoiceStatus, invoiceTotal,
  listLedger, saveLedgerEntry, deleteLedgerEntry,
  listCalendar, upcomingCalendar, saveCalendarEntry, deleteCalendarEntry
};
