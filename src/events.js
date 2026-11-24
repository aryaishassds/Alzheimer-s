// Dated reminders: birthdays, weddings, parties, flights, appointments.
// "عيد ميلاد سارة 25/12"  "طيارة 22/11 10:30"  "Sara birthday 12/25"  "flight tomorrow 6 am"
const crypto = require('crypto');

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatin = s => s.replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));

const MONTHS = [
  ['يناير', 'كانون الثاني', 'jan', 'january'],
  ['فبراير', 'شباط', 'feb', 'february'],
  ['مارس', 'آذار', 'اذار', 'mar', 'march'],
  ['ابريل', 'أبريل', 'إبريل', 'نيسان', 'apr', 'april'],
  ['مايو', 'أيار', 'ايار', 'may'],
  ['يونيو', 'يونية', 'حزيران', 'jun', 'june'],
  ['يوليو', 'يولية', 'تموز', 'jul', 'july'],
  ['اغسطس', 'أغسطس', 'آب', 'اب', 'aug', 'august'],
  ['سبتمبر', 'أيلول', 'ايلول', 'sep', 'sept', 'september'],
  ['اكتوبر', 'أكتوبر', 'تشرين الأول', 'تشرين الاول', 'oct', 'october'],
  ['نوفمبر', 'تشرين الثاني', 'nov', 'november'],
  ['ديسمبر', 'كانون الأول', 'كانون الاول', 'dec', 'december'],
];
const monthAlternation = MONTHS.flat().sort((a, b) => b.length - a.length).map(s => s.replace(/ /g, '\\s+')).join('|');
const monthIndex = name => MONTHS.findIndex(list => list.some(n => n.toLowerCase() === name.toLowerCase().replace(/\s+/g, ' ')));

const WEEKDAYS = [
  ['الأحد', 'الاحد', 'احد', 'sunday', 'sun'],
  ['الاثنين', 'الإثنين', 'اثنين', 'monday', 'mon'],
  ['الثلاثاء', 'الثلاثا', 'ثلاثاء', 'tuesday', 'tue'],
  ['الأربعاء', 'الاربعاء', 'اربعاء', 'wednesday', 'wed'],
  ['الخميس', 'خميس', 'thursday', 'thu'],
  ['الجمعة', 'الجمعه', 'جمعة', 'جمعه', 'friday', 'fri'],
  ['السبت', 'سبت', 'saturday', 'sat'],
];
const WEEKDAY_RE = new RegExp(`(?:يوم\\s+|on\\s+|this\\s+)?(${WEEKDAYS.flat().sort((a, b) => b.length - a.length).join('|')})(?![\\w\\u0600-\\u06FF])`, 'i');

const KINDS = [
  { kind: 'birthday', emoji: '🎂', yearly: true, re: /عيد\s*ميلاد|ميلاد|birthday|bday/i },
  { kind: 'anniversary', emoji: '💐', yearly: true, re: /ذكرى|anniversary/i },
  { kind: 'wedding', emoji: '💍', re: /عرس|زفاف|فرح|خطوبة|wedding|engagement/i },
  { kind: 'flight', emoji: '✈️', lead: 3, re: /طيار[ةه]|طائر[ةه]|رحل[ةه]|طيران|سفر|flight|plane|airport/i },
  { kind: 'party', emoji: '🎉', re: /حفل[ةه]?|سهر[ةه]|party/i },
  { kind: 'appointment', emoji: '🩺', re: /دكتور|طبيب|عيادة|موعد|appointment|doctor|dentist/i },
  { kind: 'school', emoji: '🎒', re: /مدرس[ةه]|اجتماع|meeting|school/i },
];

// ---------- time-zone helpers ----------
function tzParts(tz, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}
// Local wall time in `tz` → epoch ms.
function zonedToUtc(y, m, d, hh, mm, tz) {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = tzParts(tz, new Date(guess));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    guess -= asUtc - Date.UTC(y, m - 1, d, hh, mm);
  }
  return guess;
}
const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

// ---------- parsing ----------
const EXPLICIT = /^\s*(مناسب[ةه]|تذكير|ذكرني|ذكّرني|event|remind|reminder)(?=\s|$|[:،,])/i;
const UNITS = /(?<![\u0600-\u06FF\w])(?:كيلو|كغ|كجم|غرام|جرام|غم|جم|لتر|ليتر|علب[ةه]?|حب[ةه]|حبات|كيس|اكياس|كرتون[ةه]?|ربط[ةه]|kg|lb|lbs|oz|g|liters?|litres?|gallons?|packs?|bags?|box(?:es)?|dozen)(?![\u0600-\u06FF\w])/i;

const REMIND = /^\s*(ذكرني|ذكّرني|تذكير|نبهني|remind\s*me|reminder)(?=\s|$|[:،,])/i;

function parseEvent(raw, { tz = 'UTC', monthFirst = false, allowTimeOnly = false, forceKind = null } = {}) {
  // "1/2 كيلو لحمة" is a quantity, not a date — unless the user says it's an event.
  if (UNITS.test(raw) && !EXPLICIT.test(raw)) return null;
  let text = toLatin(raw).trim();
  const today = tzParts(tz);
  let y, m, d, explicitYear = false, rel = null, weekdayHit = null;
  const cut = re => { text = text.replace(re, ' '); };

  let r;
  if ((r = text.match(/(بعد\s*(?:بكرا|بكرة|بكره|غد)|day after tomorrow)/i))) { rel = 2; cut(r[0]); }
  else if ((r = text.match(/(بكرا|بكرة|بكره|غدا|غداً|tomorrow)/i))) { rel = 1; cut(r[0]); }
  else if ((r = text.match(/(اليوم|الليلة|today|tonight)/i))) { rel = 0; cut(r[0]); }

  if (rel !== null) {
    const dt = new Date(Date.UTC(today.y, today.m - 1, today.d + rel));
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); explicitYear = true;
  } else if ((r = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    [y, m, d] = [+r[1], +r[2], +r[3]]; explicitYear = true; cut(r[0]);
  } else if ((r = text.match(/(?<![\d:])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?![\d:])/))) {
    const a = +r[1], b = +r[2];
    [m, d] = monthFirst ? [a, b] : [b, a];
    if (m > 12 && d <= 12) [m, d] = [d, m]; // obvious swap like 25/12 for a US user
    if (r[3]) { y = +r[3] < 100 ? 2000 + +r[3] : +r[3]; explicitYear = true; }
    cut(r[0]);
  } else if ((r = text.match(new RegExp(`(\\d{1,2})\\s*(?:من\\s*)?(${monthAlternation})(?:\\s*(\\d{4}))?`, 'i')))) {
    d = +r[1]; m = monthIndex(r[2]) + 1; if (r[3]) { y = +r[3]; explicitYear = true; } cut(r[0]);
  } else if ((r = text.match(new RegExp(`(${monthAlternation})\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, 'i')))) {
    m = monthIndex(r[1]) + 1; d = +r[2]; if (r[3]) { y = +r[3]; explicitYear = true; } cut(r[0]);
  }
  // "يوم الجمعة" / "on friday" → the next one (today counts if it's still ahead)
  if ((!m || !d) && (r = text.match(WEEKDAY_RE))) {
    const want = WEEKDAYS.findIndex(list => list.some(n => n === r[1].toLowerCase()));
    const nowDow = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
    let add = (want - nowDow + 7) % 7;
    weekdayHit = { add };
    const dt = new Date(Date.UTC(today.y, today.m - 1, today.d + add));
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); explicitYear = true;
    cut(r[0]);
  }
  else if (m && d) text = text.replace(new RegExp(WEEKDAY_RE.source, 'gi'), ' '); // "يوم الجمعة 30/11" → keep the date, drop the weekday word
  const noDate = !m || !d;
  if (noDate && !(allowTimeOnly || REMIND.test(raw))) return null; // no date → not an event

  // time
  let time = null;
  const pm = s => /pm|م|مساء|مساءً|عصرا|عصراً|بالليل|ليلا|ليلاً/i.test(s || '');
  const am = s => /am|ص|صباحا|صباحاً|الصبح|فجرا/i.test(s || '');
  let noMark = false;
  const setTime = (h, min, mark) => {
    noMark = !mark;
    if (pm(mark) && h < 12) h += 12;
    if (am(mark) && h === 12) h = 0;
    if (h < 24 && min < 60) time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };
  const MARK = '(am|pm|a\\.m\\.|p\\.m\\.|صباحاً|صباحا|مساءً|مساء|عصراً|عصرا|الصبح|بالليل|ص|م)?';
  if ((r = text.match(new RegExp(`(?:الساعة|الساعه|ساعة|ساعه|at|@)?\\s*(\\d{1,2}):(\\d{2})\\s*${MARK}`, 'i')))) { setTime(+r[1], +r[2], r[3]); cut(r[0]); }
  else if ((r = text.match(new RegExp(`(?:الساعة|الساعه|ساعة|ساعه|at|@)\\s*(\\d{1,2})\\s*${MARK}`, 'i')))) { setTime(+r[1], 0, r[2]); cut(r[0]); }
  else if ((r = text.match(/(?<!\d)(\d{1,2})\s*(am|pm|صباحاً|صباحا|مساءً|مساء)(?![\w؀-ۿ])/i))) { setTime(+r[1], 0, r[2]); cut(r[0]); }

  if (weekdayHit && weekdayHit.add === 0) {
    const [hh, mi] = (time || '23:59').split(':').map(Number);
    if (hh * 60 + mi <= today.hh * 60 + today.mm) {
      const dt = new Date(Date.UTC(y, m - 1, d + 7)); y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    }
  }

  // "ذكرني الساعة 6 اتصل بأمي" → today at 6, or tomorrow if 6 has passed
  if (noDate) {
    if (!time) return null;
    const [hh, mi] = time.split(':').map(Number);
    const passed = hh * 60 + mi <= today.hh * 60 + today.mm;
    const dt = new Date(Date.UTC(today.y, today.m - 1, today.d + (passed ? 1 : 0)));
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); explicitYear = true;
  }

  // year: next occurrence
  if (!explicitYear) {
    y = today.y;
    const isPast = Date.UTC(y, m - 1, d) < Date.UTC(today.y, today.m - 1, today.d);
    if (isPast) y += 1;
  }
  if (!validDate(y, m, d)) return null;

  let title = text
    .replace(/^\s*(مناسب[ةه]|تذكير|ذكرني|ذكّرني|نبهني|event|remind\s*me\s*(?:to)?|reminder|remind|note)\s*[:\-]?\s*(?:ب|ان|أن)?\s*/i, '')
    .replace(/\s(في|يوم|بتاريخ|تاريخ|on|at|the|of)\s*$/i, ' ')
    .replace(/^\s*(في|يوم|on)\s/i, ' ')
    .replace(/(^|\s)(?:بتاريخ|تاريخ|عندي|عندنا|في)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s,،.:\-]+|[\s,،.:\-]+$/g, '').trim();
  const REMINDER = { kind: 'reminder', emoji: '⏰' };
  const k = (forceKind === 'reminder' && REMINDER)
    || KINDS.find(x => x.re.test(title || raw))
    || (REMIND.test(raw) && REMINDER)
    || { kind: 'event', emoji: '📅' };
  // "عرس الساعة 6" means 6 in the evening
  if (time && noMark && ['wedding', 'party', 'birthday', 'anniversary'].includes(k.kind)) {
    const [hh, mi] = time.split(':').map(Number);
    if (hh >= 1 && hh <= 7) time = `${String(hh + 12).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  const yearly = Boolean(k.yearly) || /كل\s*سن[ةه]|سنوي|every\s*year|yearly/i.test(raw);
  title = title.replace(/كل\s*سن[ةه]|سنويا|سنوياً|every\s*year|yearly/ig, '').trim();

  return {
    id: crypto.randomBytes(3).toString('hex'),
    title: title || (k.kind === 'event' ? '' : ''), kind: k.kind, emoji: k.emoji,
    y, m, d, time, yearly, lead: k.lead || 1, sent: {}, createdAt: Date.now(),
  };
}

// ---------- scheduling ----------
const undated = e => !e.y || !e.m || !e.d;

// Saved exactly as typed from the menu, even when no date could be read.
function rawEvent(text, parsed) {
  const base = parsed || { id: crypto.randomBytes(3).toString('hex'), kind: 'note', emoji: '📝', title: '', time: null, yearly: false, lead: 1, sent: {}, createdAt: Date.now() };
  return { ...base, raw: String(text).trim() };
}

function eventStart(e, tz) {
  if (undated(e)) return Infinity;
  const [hh, mm] = e.time ? e.time.split(':').map(Number) : [9, 0];
  return zonedToUtc(e.y, e.m, e.d, hh, mm, tz);
}
function eventEnd(e, tz) {
  if (undated(e)) return Infinity;
  return e.time ? eventStart(e, tz) + 3 * 3600e3 : zonedToUtc(e.y, e.m, e.d, 23, 59, tz);
}

// When to notify, as [key, epochMs, kind]
function triggers(e, tz) {
  if (undated(e)) return [];
  if (e.kind === 'reminder') return [['at', eventStart(e, tz), 'now']];
  const out = [];
  const prev = new Date(Date.UTC(e.y, e.m - 1, e.d - 1));
  out.push(['dayBefore', zonedToUtc(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 20, 0, tz), 'tomorrow']);
  const morning = zonedToUtc(e.y, e.m, e.d, 9, 0, tz);
  const start = eventStart(e, tz);
  if (!e.time || start - morning >= 2 * 3600e3) out.push(['dayOf', morning, 'today']);
  if (e.time) out.push(['lead', start - e.lead * 3600e3, 'soon']);
  return out;
}

function label(e, lang) {
  if (e.raw) return e.raw;
  const fallback = lang === 'ar' ? 'مناسبة' : 'Event';
  return `${e.emoji} ${e.title || fallback}`;
}

function whenText(e, lang, tz, { withWeekday = true } = {}) {
  const loc = lang === 'ar' ? 'ar' : 'en-US';
  const start = eventStart(e, tz);
  const date = new Intl.DateTimeFormat(loc, { timeZone: tz, ...(withWeekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long' }).format(new Date(start));
  const time = e.time ? ' ' + new Intl.DateTimeFormat(loc, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(start)) : '';
  return date + time;
}

function upcoming(events, tz, now = Date.now()) {
  return (events || []).filter(e => eventEnd(e, tz) > now).sort((a, b) => {
    const x = eventStart(a, tz), y = eventStart(b, tz);
    return x === y ? (a.createdAt || 0) - (b.createdAt || 0) : x - y;
  });
}

// How an event is shown: as typed when it came from the menu, else name · date.
function display(e, lang, tz, opts = {}) {
  if (e.raw) return e.raw;
  if (undated(e)) return label(e, lang);
  return `${label(e, lang)} · ${whenText(e, lang, tz, opts)}`;
}

// Roll yearly events forward and drop finished one-off events. Returns true if changed.
function housekeeping(f, now = Date.now()) {
  let changed = false;
  const keep = [];
  for (const e of f.events || []) {
    if (undated(e) || eventEnd(e, f.timezone) > now) { keep.push(e); continue; }
    changed = true;
    if (e.yearly) { e.y += 1; if (!validDate(e.y, e.m, e.d)) e.d = 28; e.sent = {}; keep.push(e); }
  }
  if (changed) f.events = keep;
  return changed;
}

module.exports = { parseEvent, rawEvent, display, undated, triggers, label, whenText, upcoming, housekeeping, eventStart, eventEnd, zonedToUtc, tzParts };
