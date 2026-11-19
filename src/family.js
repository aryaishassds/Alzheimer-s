// Every change to a family's card goes through here: update the record safely,
// then refresh the card on iPhones (APNs) and Android (Google Wallet API).
const db = require('./db');
const apple = require('./pass/apple');
const google = require('./pass/google');
const c = require('./pass/content');
const ev = require('./events');
const { t, locale } = require('./i18n');
const { sameItem } = require('./parse');

const fmt = (f, o) => new Intl.DateTimeFormat(locale(c.lang(f)), { timeZone: f.timezone, ...o }).format(new Date());
const timeLabel = f => fmt(f, { hour: 'numeric', minute: '2-digit' });
const dayLabel = f => fmt(f, { day: 'numeric', month: 'numeric' });

async function refresh(f, androidNotify) {
  const [a, g] = await Promise.allSettled([apple.pushUpdate(f), google.update(f, androidNotify)]);
  if (a.status === 'rejected') console.error('[apple push]', a.reason);
  if (g.status === 'rejected') console.error('[google update]', g.reason);
  return f;
}

// mutate(f) changes the fresh record; return false for "nothing changed", or a string to notify Android.
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
    const clean = [];
    for (const raw of texts) {
      const text = raw.trim();
      if (!text) continue;
      if (f.items.some(i => sameItem(i.text, text)) || clean.some(x => sameItem(x, text))) continue;
      clean.push(text);
    }
    if (!clean.length) return false;
    for (const text of clean) f.items.push({ text, by: byPhone, at: Date.now() });
    const s = c.lang(f) === 'ar' ? '، ' : ', ';
    f.lastAdded = `${clean.join(s)} · ${timeLabel(f)}`; // the time makes it unique, so the iPhone always notifies
    return t(c.lang(f), 'addedNotify', clean.join(s));
  });
}

async function removeItem(fam, text) {
  let removed = 0;
  await change(fam.id, f => {
    const before = f.items.length;
    f.items = f.items.filter(i => !(sameItem(i.text, text) || i.text.includes(text.trim())));
    removed = before - f.items.length;
    if (!removed) return false;
  });
  return removed;
}

// Silent: no notification when the list is wiped.
const clear = fam => change(fam.id, f => { if (!f.items.length) return false; f.items = []; });

async function setLocation(fam, { name, lat, lng }) {
  const isHome = /بيت|منزل|home|house/i.test(name);
  let ok = true;
  await change(fam.id, f => {
    if (isHome) {
      f.locations = f.locations.filter(l => l.kind !== 'home');
      f.locations.unshift({ kind: 'home', name: c.lang(f) === 'ar' ? 'البيت' : 'Home', lat, lng });
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
    f.locations = f.locations.filter(l => !l.name.toLowerCase().includes(name.toLowerCase()));
    n = before - f.locations.length;
    if (!n) return false;
  });
  return n;
}

const setReminderTimes = (fam, times) => change(fam.id, f => { f.reminderTimes = times; });
const setLang = (fam, L) => change(fam.id, f => { f.lang = L; });

// Scheduler: daily reminder, only when the list has items.
const timeReminder = fam => change(fam.id, f => {
  if (!c.hasItems(f)) return false;
  f.reminderNote = t(c.lang(f), 'beforeYouReturn', dayLabel(f), c.itemsLine(f, 6));
  return f.reminderNote;
});

const sendOffer = (fam, text) => change(fam.id, f => { f.offerNote = `${text} (${dayLabel(f)})`; return text; });

// ---------- events ----------
async function addEvent(fam, e) {
  let added = null;
  await change(fam.id, f => {
    f.events = f.events || [];
    if (f.events.length >= 30) return false;
    f.events.push(e);
    added = e;
    const L = c.lang(f);
    // shows on the iPhone as a notification, so the sender sees how the date was understood
    f.eventNote = `${t(L, 'eventAdded', ev.label(e, L), ev.whenText(e, L, f.timezone))} · ${timeLabel(f)}`;
    return f.eventNote;
  });
  return added;
}

async function removeEvent(fam, query) {
  let removed = null;
  await change(fam.id, f => {
    const list = ev.upcoming(f.events, f.timezone);
    const q = String(query).trim();
    const byNum = /^\d+$/.test(q) ? list[Number(q) - 1] : null;
    const target = byNum || list.find(e => (e.title || '').includes(q));
    if (!target) return false;
    f.events = f.events.filter(e => e.id !== target.id);
    removed = target;
  });
  return removed;
}

// Called by the scheduler with a trigger kind: 'tomorrow' | 'today' | 'soon'
const eventNotify = (fam, eventId, kind) => change(fam.id, f => {
  const e = (f.events || []).find(x => x.id === eventId);
  if (!e) return false;
  const L = c.lang(f);
  const name = ev.label(e, L);
  const when = e.time ? ` · ${ev.whenText(e, L, f.timezone, { withWeekday: false })}` : '';
  const text = kind === 'tomorrow' ? t(L, 'eventTomorrow', name + when)
    : kind === 'today' ? t(L, 'eventToday', name + when)
    : t(L, 'eventSoon', name, e.lead);
  f.eventNote = text;
  return text;
});

module.exports = {
  addItems, removeItem, clear, setLocation, removeLocation, setReminderTimes, setLang,
  timeReminder, sendOffer, addEvent, removeEvent, eventNotify, refresh, change,
};
