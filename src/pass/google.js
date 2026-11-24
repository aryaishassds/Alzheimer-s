// Google Wallet: generic pass, "Save to Google Wallet" link, and live updates.
// Docs: https://developers.google.com/wallet/generic
const crypto = require('crypto');
const cfg = require('../config');
const c = require('./content');

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const enabled = () => Boolean(cfg.google.issuerId && cfg.google.serviceAccount);
const classId = () => `${cfg.google.issuerId}.${cfg.google.classSuffix}`;
const objectId = family => `${cfg.google.issuerId}.${family.serial.replace(/[^\w.-]/g, '_')}`;

const b64url = b => Buffer.from(b).toString('base64url');
function signJwt(payload) {
  const sa = cfg.google.serviceAccount;
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key, 'base64url');
  return `${head}.${body}.${sig}`;
}

let cachedToken = { value: '', exp: 0 };
async function accessToken() {
  if (cachedToken.exp > Date.now() + 60e3) return cachedToken.value;
  const sa = cfg.google.serviceAccount;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await res.json();
  cachedToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cachedToken.value;
}

const { t } = require('../i18n');
const lang = (v, L = 'ar') => ({ defaultValue: { language: L, value: v } });

function genericObject(family) {
  const L = c.lang(family);
  const locs = c.activeLocations(family);
  const next = c.nextEventShort(family);
  return {
    id: objectId(family),
    classId: classId(),
    state: 'ACTIVE',
    hexBackgroundColor: process.env.CARD_BG_HEX || '#fff7d1',
    logo: { sourceUri: { uri: `${cfg.baseUrl}/assets/logo@3x.png` } },
    cardTitle: lang(t(L, 'brand'), L),
    header: lang(c.frontTitle(family), L),
    subheader: lang(t(L, 'homeOrders'), L),
    textModulesData: [
      { id: 'items', header: t(L, 'list'), body: c.hasItems(family) ? c.itemsLine(family, 12) : '—' },
      ...(next ? [{ id: 'event', header: t(L, 'nextEvent'), body: next }] : []),
      ...((family.tasks || []).length ? [{ id: 'tasks', header: t(L, 'tasks'), body: c.tasksLine(family, 8) }] : []),
      { id: 'home', header: t(L, 'home'), body: c.locationText(family, { kind: 'home' }) },
      { id: 'reminder', header: t(L, 'reminder'), body: family.reminderTimes.join(' · ') },
    ],
    // Nearby Passes notifications (Google decides the radius and text; max 10 locations).
    // Verify the field name against the current Google Wallet reference before launch.
    merchantLocations: locs.map(l => ({ latitude: l.lat, longitude: l.lng })),
  };
}

async function ensureClass() {
  const token = await accessToken();
  const r = await fetch(`${API}/genericClass/${classId()}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 404) {
    await fetch(`${API}/genericClass`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: classId(), multipleDevicesAndHoldersAllowedStatus: 'MULTIPLE_HOLDERS' }),
    });
  }
}

// Link the customer taps to add the card on Android.
// The class travels inside the link too, so Google creates it on first use.
function saveUrl(family) {
  if (!enabled()) return null;
  const sa = cfg.google.serviceAccount;
  const jwt = signJwt({
    iss: sa.client_email, aud: 'google', typ: 'savetowallet', origins: [cfg.baseUrl],
    payload: {
      genericClasses: [{ id: classId(), multipleDevicesAndHoldersAllowedStatus: 'MULTIPLE_HOLDERS' }],
      genericObjects: [genericObject(family)],
    },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

// Push the latest content. `notify` adds a message that shows as a phone notification.
// Google allows only 3 notifications per pass per day, so we use them for reminders,
// events and offers — not for every item added.
async function update(family, notify) {
  if (!enabled()) return null;
  const token = await accessToken();
  const obj = genericObject(family);
  const res = await fetch(`${API}/genericObject/${obj.id}`, {
    method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (res.status === 404) return 404; // not saved to any Android phone yet
  if (!res.ok) console.error('[google update]', res.status, (await res.text()).slice(0, 300));
  if (notify) {
    const r = await fetch(`${API}/genericObject/${obj.id}/addMessage`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { header: c.lang(family) === 'ar' ? cfg.brandName : cfg.brandNameEn, body: notify, id: 'm' + Date.now(), messageType: 'TEXT_AND_NOTIFY' } }),
    });
    if (!r.ok) console.error('[google notify]', r.status, (await r.text()).slice(0, 200));
  }
  return res.status;
}

module.exports = { enabled, ensureClass, saveUrl, update, genericObject };
