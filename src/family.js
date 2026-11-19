// Every change to a family's card goes through here: update the record safely,
// then refresh the card on iPhones (APNs) and Android (Google Wallet API).
const db = require('./db');
const apple = require('./pass/apple');
const google = require('./pass/google');
const c = require('./pass/content');

const fmt = (f, o) => new Intl.DateTimeFormat('ar', { timeZone: f.timezone, ...o }).format(new Date());
const timeLabel = f => fmt(f, { hour: 'numeric', minute: '2-digit' });
const dayLabel = f => fmt(f, { day: 'numeric', month: 'numeric' });

async function refresh(f, androidNotify) {
  const [a, g] = await Promise.allSettled([apple.pushUpdate(f), google.update(f, androidNotify)]);
  if (a.status === 'rejected') console.error('[apple push]', a.reason);
  if (g.status === 'rejected') console.error('[google update]', g.reason);
  return f;
}

// change(f) mutates the fresh record; return false for "nothing changed".
async function change(id, mutate, notify) {
  let note = notify;
  const f = await db.updateFamily(id, x => {
    const r = mutate(x);
    if (r === false) return false;
    if (typeof r === 'string') note = r;
  });
  if (f) await refresh(f, note);
  return f;
}

function addItems(fam, texts, byPhone) {
  return change(fam.id, f => {
    const clean = [...new Set(texts.map(t => t.trim()).filter(Boolean))].filter(t => !f.items.some(i => i.text === t));
    if (!clean.length) return false;
    for (const text of clean) f.items.push({ text, by: byPhone, at: Date.now() });
    f.lastAdded = `${clean.join('، ')} · ${timeLabel(f)}`; // time makes the value unique => iPhone notifies
    return `➕ أُضيف: ${clean.join('، ')}`;
  });
}

async function removeItem(fam, text) {
  let removed = 0;
  await change(fam.id, f => {
    const before = f.items.length;
    f.items = f.items.filter(i => !i.text.includes(text.trim()));
    removed = before - f.items.length;
    if (!removed) return false;
  });
  return removed;
}

// Silent: no notification when the list is wiped.
const clear = fam => change(fam.id, f => { if (!f.items.length) return false; f.items = []; });

async function setLocation(fam, { name, lat, lng }) {
  const isHome = /بيت|منزل|home/i.test(name);
  let ok = true;
  await change(fam.id, f => {
    if (isHome) {
      f.locations = f.locations.filter(l => l.kind !== 'home');
      f.locations.unshift({ kind: 'home', name: 'البيت', lat, lng });
    } else {
      if (f.locations.length >= c.MAX_LOCATIONS) { ok = false; return false; }
      f.locations = f.locations.filter(l => l.name !== name);
      f.locations.push({ kind: 'place', name, lat, lng });
    }
    f.pendingLocation = null;
  });
  return { ok, home: isHome };
}

async function removeLocation(fam, name) {
  let n = 0;
  await change(fam.id, f => {
    const before = f.locations.length;
    f.locations = f.locations.filter(l => !l.name.includes(name));
    n = before - f.locations.length;
    if (!n) return false;
  });
  return n;
}

const setReminderTimes = (fam, times) => change(fam.id, f => { f.reminderTimes = times; });

// Scheduler: only when the list has items.
const timeReminder = fam => change(fam.id, f => {
  if (!c.hasItems(f)) return false;
  f.reminderNote = `⏰ ${dayLabel(f)} – قبل ما ترجع: ${c.itemsLine(f, 6)}`;
  return f.reminderNote;
});

const sendOffer = (fam, text) => change(fam.id, f => { f.offerNote = `${text} (${dayLabel(f)})`; return text; });

module.exports = { addItems, removeItem, clear, setLocation, removeLocation, setReminderTimes, timeReminder, sendOffer, refresh, change };
