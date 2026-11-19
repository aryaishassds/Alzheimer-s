// Apple Wallet: build the .pkpass and push updates to registered iPhones.
const http2 = require('http2');
const { PKPass } = require('passkit-generator');
const cfg = require('../config');
const db = require('../db');
const c = require('./content');

const assetBuffers = Object.fromEntries(Object.entries(require('./assets')).map(([k, v]) => [k, Buffer.from(v, 'base64')]));

function localDate(family) {
  return new Intl.DateTimeFormat('ar', { timeZone: family.timezone, weekday: 'long', day: 'numeric', month: 'short' })
    .format(new Date());
}

function passJson(family) {
  const fullList = family.items.length
    ? family.items.map((i, n) => `${n + 1}. ${i.text}`).join('\n')
    : 'القائمة فارغة. أي رسالة تصل على واتساب ستظهر هنا.';

  const placesList = family.locations.length
    ? family.locations.map(l => (l.kind === 'home' ? '🏠 ' : '📍 ') + l.name).join('\n')
    : 'لم تُضف مواقع بعد. أرسل "موقع البيت" على واتساب.';

  const json = {
    formatVersion: 1,
    passTypeIdentifier: cfg.apple.passTypeId,
    teamIdentifier: cfg.apple.teamId,
    serialNumber: family.serial,
    organizationName: cfg.brandName,
    description: cfg.brandName + ' – طلبات البيت',
    logoText: cfg.brandName,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(15, 118, 110)',
    labelColor: 'rgb(204, 251, 241)',
    sharingProhibited: true,
    generic: {
      headerFields: [{ key: 'date', label: 'اليوم', value: localDate(family), textAlignment: 'PKTextAlignmentNatural' }],
      primaryFields: [{ key: 'count', label: 'طلبات البيت', value: c.frontTitle(family) }],
      secondaryFields: [{
        key: 'items', label: 'القائمة',
        value: c.hasItems(family) ? c.itemsLine(family, 4) : '—',
        textAlignment: 'PKTextAlignmentNatural',
      }],
      auxiliaryFields: [{
        key: 'next', label: 'التذكير',
        value: family.reminderTimes.join(' · ') || '—',
      }],
      backFields: [
        {
          key: 'open', label: 'القائمة كاملة',
          value: `${cfg.baseUrl}/list/${family.serial}?t=${family.authToken}`,
          attributedValue: `<a href="${cfg.baseUrl}/list/${family.serial}?t=${family.authToken}">اضغط هنا لعرض كل الطلبات (${family.items.length})</a>`,
        },
        { key: 'full', label: `كل الطلبات (${family.items.length})`, value: fullList },
        // changeMessage => iPhone shows a notification when this value changes
        { key: 'last', label: 'آخر إضافة', value: family.lastAdded || '—', changeMessage: '➕ أُضيف: %@' },
        { key: 'reminder', label: 'تذكير', value: family.reminderNote || '—', changeMessage: '%@' },
        { key: 'offer', label: 'عروض', value: family.offerNote || '—', changeMessage: '%@' },
        { key: 'places', label: 'المواقع', value: placesList },
        {
          key: 'help', label: 'أوامر واتساب',
          value: 'مسح · حذف خبز · موقع البيت · إضافة موقع سوبرماركت · وقت 5 مساء · مساعدة',
        },
      ],
    },
  };

  if (cfg.baseUrl.startsWith('https://')) {
    json.webServiceURL = cfg.baseUrl + '/apple';
    json.authenticationToken = family.authToken;
  }

  const locs = c.activeLocations(family);
  if (locs.length) {
    json.locations = locs.map(l => ({ latitude: l.lat, longitude: l.lng, relevantText: c.locationText(family, l) }));
  }
  return json;
}

async function buildPass(family) {
  const buffers = { ...assetBuffers, 'pass.json': Buffer.from(JSON.stringify(passJson(family))) };
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
