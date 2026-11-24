// Apple Wallet: build the .pkpass and push updates to registered iPhones.
const http2 = require('http2');
const { PKPass } = require('passkit-generator');
const cfg = require('../config');
const db = require('../db');
const c = require('./content');

const assetBuffers = Object.fromEntries(Object.entries(require('./assets')).map(([k, v]) => [k, Buffer.from(v, 'base64')]));

const { t, locale } = require('../i18n');
const ev = require('../events');

// Sticky-note colors (override with CARD_BG / CARD_FG / CARD_LABEL, e.g. "rgb(255, 247, 209)")
const COLORS = {
  bg: process.env.CARD_BG || 'rgb(255, 247, 209)',
  fg: process.env.CARD_FG || 'rgb(51, 46, 28)',
  label: process.env.CARD_LABEL || 'rgb(133, 110, 36)',
};

function localDate(f) {
  return new Intl.DateTimeFormat(locale(c.lang(f)), { timeZone: f.timezone, weekday: 'long', day: 'numeric', month: 'short' }).format(new Date());
}

function passJson(family, { withStrip = false } = {}) {
  const L = c.lang(family);
  const align = L === 'ar' ? 'PKTextAlignmentRight' : 'PKTextAlignmentLeft';
  const brand = t(L, 'brand');
  const fullList = family.items.length ? family.items.map((i, n) => `${n + 1}. ${i.text}`).join('\n') : t(L, 'emptyList');
  const placesList = family.locations.length
    ? family.locations.map(l => (l.kind === 'home' ? '🏠 ' + t(L, 'home') : '📍 ' + l.name)).join('\n')
    : t(L, 'noPlaces');
  const listUrl = `${cfg.baseUrl}/list/${family.serial}?t=${family.authToken}`;
  const next = c.nextEventShort(family);

  const aux = [{ key: 'next', label: t(L, 'reminder'), value: family.reminderTimes.join(' · ') || '—', textAlignment: align }];
  if (next) aux.unshift({ key: 'event', label: t(L, 'nextEvent'), value: next, textAlignment: align });
  if ((family.tasks || []).length) aux.push({ key: 'tasks', label: t(L, 'tasks'), value: String(family.tasks.length), textAlignment: align });

  const json = {
    formatVersion: 1,
    passTypeIdentifier: cfg.apple.passTypeId,
    teamIdentifier: cfg.apple.teamId,
    serialNumber: family.serial,
    organizationName: brand,
    description: `${brand} – ${t(L, 'homeOrders')}`,
    logoText: brand,
    foregroundColor: COLORS.fg,
    backgroundColor: COLORS.bg,
    labelColor: COLORS.label,
    sharingProhibited: true,
    [withStrip ? 'storeCard' : 'generic']: {
      headerFields: [{ key: 'date', label: t(L, 'today'), value: localDate(family), textAlignment: align }],
      // With the strip image the list, tasks and events are drawn in the picture;
      // only the reminder time stays as text under it.
      primaryFields: withStrip ? [] : [{ key: 'count', label: t(L, 'homeOrders'), value: c.frontTitle(family) }],
      secondaryFields: withStrip ? [] : [{ key: 'items', label: t(L, 'list'), value: c.hasItems(family) ? c.itemsLine(family, 4) : '—', textAlignment: align }],
      auxiliaryFields: withStrip ? [{ key: 'next', label: t(L, 'reminder'), value: family.reminderTimes.join(' · ') || '—', textAlignment: align }] : aux,
      backFields: [
        { key: 'open', label: t(L, 'fullListLabel'), value: listUrl, attributedValue: `<a href="${listUrl}">${t(L, 'fullListLink', family.items.length)}</a>` },
        { key: 'full', label: t(L, 'allOrders', family.items.length), value: fullList },
        // changeMessage => the iPhone shows a notification when this value changes
        { key: 'last', label: t(L, 'lastAdded'), value: family.lastAdded || '—', changeMessage: t(L, 'added') },
        { key: 'reminder', label: t(L, 'reminderLabel'), value: family.reminderNote || '—', changeMessage: '%@' },
        { key: 'eventNote', label: '🔔', value: family.eventNote || '—', changeMessage: '%@' },
        { key: 'tasksList', label: t(L, 'tasks'), value: c.tasksBlock(family) },
        { key: 'taskNote', label: '✅', value: family.taskNote || '—', changeMessage: '%@' },
        { key: 'events', label: t(L, 'events'), value: c.eventsBlock(family) },
        { key: 'offer', label: t(L, 'offers'), value: family.offerNote || '—', changeMessage: '%@' },
        { key: 'places', label: t(L, 'places'), value: placesList },
        { key: 'help', label: t(L, 'commandsLabel'), value: t(L, 'commandsShort') },
      ],
    },
  };

  if (cfg.baseUrl.startsWith('https://')) {
    json.webServiceURL = cfg.baseUrl + '/apple';
    json.authenticationToken = family.authToken;
  }

  const locs = c.activeLocations(family);
  if (locs.length) json.locations = locs.map(l => ({ latitude: l.lat, longitude: l.lng, relevantText: c.locationText(family, l) }));

  // Upcoming events surface the card on the lock screen around their time.
  const soon = ev.upcoming(family.events, family.timezone).filter(e => !ev.undated(e)).slice(0, 10);
  if (soon.length) {
    json.relevantDate = new Date(ev.eventStart(soon[0], family.timezone)).toISOString();
    json.relevantDates = soon.map(e => ({
      startDate: new Date(ev.eventStart(e, family.timezone) - (e.time ? e.lead * 3600e3 : 0)).toISOString(),
      endDate: new Date(ev.eventEnd(e, family.timezone)).toISOString(),
    }));
  }
  return json;
}

async function buildPass(family) {
  let strip = null;
  try { strip = require('./strip').stripImages(family); } catch (e) { console.error('[strip]', e.message); }
  const buffers = { ...assetBuffers, ...(strip || {}), 'pass.json': Buffer.from(JSON.stringify(passJson(family, { withStrip: Boolean(strip) }))) };
  const pass = new PKPass(buffers, {
    wwdr: cfg.apple.wwdr,
    signerCert: cfg.apple.signerCert,
    signerKey: cfg.apple.signerKey,
    signerKeyPassphrase: cfg.apple.signerKeyPassphrase,
  });
  return pass.getAsBuffer();
}

// ---- APNs push: tells the iPhone "this pass changed, come fetch it" ----
// A fresh HTTP/2 connection per update (fits serverless functions).
function pushAll(tokens) {
  return new Promise(resolve => {
    const session = http2.connect('https://api.push.apple.com:443', {
      cert: cfg.apple.signerCert, key: cfg.apple.signerKey, passphrase: cfg.apple.signerKeyPassphrase,
    });
    const results = [];
    let pending = tokens.length;
    const done = () => { session.close(); resolve(results); };
    session.on('error', e => { tokens.forEach(t => results.push({ token: t, status: 0, body: String(e) })); done(); });
    for (const token of tokens) {
      const req = session.request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        'apns-topic': cfg.apple.passTypeId, 'apns-push-type': 'background', 'apns-priority': '5',
      });
      let status = 0;
      req.on('response', h => { status = h[':status']; });
      req.on('data', () => {});
      req.on('end', () => { results.push({ token, status }); if (--pending === 0) done(); });
      req.on('error', e => { results.push({ token, status: 0, body: String(e) }); if (--pending === 0) done(); });
      req.end('{}');
    }
  });
}

async function pushUpdate(family) {
  if (!cfg.apple.signerCert) return [];
  const devices = await db.devicesForSerial(family.serial);
  const tokens = [...new Set(devices.map(d => d.pushToken))];
  if (!tokens.length) return [];
  const results = await pushAll(tokens);
  for (const r of results) if (r.status === 410) { // the device removed the pass
    for (const d of devices.filter(d => d.pushToken === r.token)) await db.unregister(d.deviceId, family.serial);
  }
  return results;
}

module.exports = { buildPass, passJson, pushUpdate };
