// What the card says, shared by Apple and Google.
const cfg = require('../config');

const MAX_LOCATIONS = 5;

function itemsLine(family, max = 6) {
  const names = family.items.map(i => i.text);
  if (names.length <= max) return names.join('، ');
  return names.slice(0, max).join('، ') + ` +${names.length - max}`;
}

function hasItems(family) { return family.items.length > 0; }

function frontTitle(family) {
  const n = family.items.length;
  if (n === 0) return 'لا توجد طلبات اليوم ✨';
  if (n === 1) return 'غرض واحد';
  if (n === 2) return 'غرضان';
  if (n <= 10) return `${n} أغراض`;
  return `${n} غرضاً`;
}

// Text shown on the lock screen when the phone is near one of the card's locations.
function locationText(family, loc) {
  if (loc.kind === 'home') {
    return hasItems(family) ? `🛒 لا تنسَ: ${itemsLine(family, 5)}` : '🏠 أهلاً بك في البيت';
  }
  return `🛒 أنت قريب من ${loc.name}: ${itemsLine(family, 5)}`;
}

// Home always stays on the card (welcome or reminder).
// Other places are only active while the list has items.
function activeLocations(family) {
  return family.locations
    .filter(l => l.kind === 'home' || hasItems(family))
    .slice(0, MAX_LOCATIONS);
}

function isActive(family) {
  const now = Date.now();
  return (family.status === 'paid' && family.paidUntil > now) ||
         (family.status === 'trial' && family.trialEnds > now);
}

module.exports = { itemsLine, hasItems, frontTitle, locationText, activeLocations, isActive, MAX_LOCATIONS, brand: cfg.brandName };
