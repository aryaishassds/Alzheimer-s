// What the card says, shared by Apple and Google — in the family's language.
const { t } = require('../i18n');
const ev = require('../events');

const MAX_LOCATIONS = 5;
const lang = f => f.lang || 'ar';
const sep = f => (lang(f) === 'ar' ? '، ' : ', ');

function itemsLine(family, max = 6) {
  const names = family.items.map(i => i.text);
  if (names.length <= max) return names.join(sep(family));
  return names.slice(0, max).join(sep(family)) + ` +${names.length - max}`;
}

const hasItems = f => f.items.length > 0;

function frontTitle(f) { return hasItems(f) ? t(lang(f), 'count', f.items.length) : t(lang(f), 'noOrders'); }

// Lock-screen text near one of the card's locations.
function locationText(f, loc) {
  if (loc.kind === 'home') return hasItems(f) ? t(lang(f), 'dontForget', itemsLine(f, 5)) : t(lang(f), 'welcomeHome');
  return t(lang(f), 'nearPlace', loc.name, itemsLine(f, 5));
}

// Home always stays on the card (welcome or reminder); other places only while the list has items.
function activeLocations(f) {
  return f.locations.filter(l => l.kind === 'home' || hasItems(f)).slice(0, MAX_LOCATIONS);
}

function nextEvent(f) { return ev.upcoming(f.events, f.timezone)[0] || null; }

function nextEventShort(f) {
  const e = nextEvent(f);
  if (!e) return null;
  return `${ev.label(e, lang(f))} · ${ev.whenText(e, lang(f), f.timezone, { withWeekday: false })}`;
}

function eventsBlock(f) {
  const list = ev.upcoming(f.events, f.timezone);
  if (!list.length) return t(lang(f), 'noEvents');
  return list.map((e, i) => `${i + 1}. ${ev.label(e, lang(f))}\n   ${ev.whenText(e, lang(f), f.timezone)}${e.yearly ? ' · ' + t(lang(f), 'yearly') : ''}`).join('\n');
}

function isActive(f) {
  const now = Date.now();
  return (f.status === 'paid' && f.paidUntil > now) || (f.status === 'trial' && f.trialEnds > now);
}

module.exports = { itemsLine, hasItems, frontTitle, locationText, activeLocations, isActive, nextEvent, nextEventShort, eventsBlock, lang, MAX_LOCATIONS };
