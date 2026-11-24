// Data layer on top of kv.js. Every family is its own record, so two messages
// for two different families never overwrite each other.
const crypto = require('crypto');
const kv = require('./kv');

const COUNTRY_TZ = [
  ['+966', 'Asia/Riyadh'], ['+971', 'Asia/Dubai'], ['+965', 'Asia/Kuwait'],
  ['+974', 'Asia/Qatar'], ['+973', 'Asia/Bahrain'], ['+968', 'Asia/Muscat'],
  ['+970', 'Asia/Hebron'], ['+972', 'Asia/Jerusalem'], ['+962', 'Asia/Amman'],
  ['+961', 'Asia/Beirut'], ['+963', 'Asia/Damascus'], ['+964', 'Asia/Baghdad'],
  ['+967', 'Asia/Aden'], ['+249', 'Africa/Khartoum'], ['+218', 'Africa/Tripoli'],
  ['+216', 'Africa/Tunis'], ['+213', 'Africa/Algiers'], ['+212', 'Africa/Casablanca'],
  ['+20', 'Africa/Cairo'], ['+90', 'Europe/Istanbul'], ['+44', 'Europe/London'],
  ['+49', 'Europe/Berlin'], ['+33', 'Europe/Paris'], ['+34', 'Europe/Madrid'],
  ['+39', 'Europe/Rome'], ['+31', 'Europe/Amsterdam'], ['+46', 'Europe/Stockholm'],
  ['+61', 'Australia/Sydney'], ['+52', 'America/Mexico_City'], ['+55', 'America/Sao_Paulo'],
  ['+1', 'America/Chicago'],
].sort((a, b) => b[0].length - a[0].length);
const DEFAULT_TZ = process.env.DEFAULT_TIMEZONE || 'Asia/Jerusalem';
function guessTimezone(phone) {
  const p = '+' + String(phone).replace(/\D/g, '');
  const hit = COUNTRY_TZ.find(([code]) => p.startsWith(code));
  return hit ? hit[1] : DEFAULT_TZ;
}
const newId = (n = 8) => crypto.randomBytes(n).toString('hex');

const K = {
  fam: id => `fam/${id}`,
  phone: p => `phone/${p}`,
  serial: s => `serial/${s}`,
  join: c => `join/${c}`,
  reg: (serial, dev) => `reg/${serial}/${dev}`,
  dev: (dev, serial) => `dev/${dev}/${serial}`,
  camp: () => `camp/${Date.now()}`,
  state: p => `state/${p}`,
};

async function createFamily(ownerPhone, ownerName, lang = 'ar') {
  const id = newId(6);
  const f = {
    id, serial: 'HL-' + newId(8), authToken: newId(16),
    joinCode: String(Math.floor(1000 + Math.random() * 9000)) + id.slice(0, 2),
    ownerPhone, members: [ownerPhone], names: { [ownerPhone]: ownerName || '' },
    items: [], lastAdded: '', locations: [], pendingLocation: null,
    reminderTimes: ['17:00'], clearAt: '00:00', timezone: guessTimezone(ownerPhone),
    reminderNote: '', offerNote: '', eventNote: '', events: [], tasks: [], lang, lastRuns: {},
    status: 'trial', trialEnds: Date.now() + Number(process.env.TRIAL_DAYS || 7) * 864e5, paidUntil: 0,
    optInOffers: true, updatedAt: Date.now(), createdAt: Date.now(),
  };
  await Promise.all([
    kv.set(K.fam(id), f), kv.set(K.phone(ownerPhone), id),
    kv.set(K.serial(f.serial), id), kv.set(K.join(f.joinCode), id),
  ]);
  return f;
}

async function getFamily(id) {
  const f = id ? await kv.get(K.fam(id)) : null;
  if (f && (!f.timezone || f.timezone === 'UTC')) f.timezone = guessTimezone(f.ownerPhone); // older records
  return f;
}
async function familyByPhone(p) { return getFamily(await kv.get(K.phone(p))); }
async function familyBySerial(s) { return getFamily(await kv.get(K.serial(s))); }
async function familyByJoinCode(c) { return getFamily(await kv.get(K.join(c))); }
async function allFamilies() {
  const keys = await kv.keys('fam/');
  return (await Promise.all(keys.map(k => getFamily(k.slice(4))))).filter(Boolean);
}

// Apply a change to the freshest copy of the family. fn returns false to cancel.
async function updateFamily(id, fn) {
  return kv.update(K.fam(id), async f => {
    if (!f) return null;
    if (!f.timezone || f.timezone === 'UTC') f.timezone = guessTimezone(f.ownerPhone);
    const r = await fn(f);
    if (r === false) return null;
    f.updatedAt = Date.now();
    return f;
  });
}

async function addMember(f, phone, name) {
  await kv.set(K.phone(phone), f.id);
  return updateFamily(f.id, x => {
    if (!x.members.includes(phone)) x.members.push(phone);
    x.names[phone] = name || x.names[phone] || '';
  });
}

// Apple device registrations
async function register(deviceId, pushToken, serial) {
  const existed = await kv.get(K.reg(serial, deviceId));
  await kv.set(K.reg(serial, deviceId), { deviceId, pushToken, serial, at: Date.now() });
  await kv.set(K.dev(deviceId, serial), 1);
  return !existed;
}
async function unregister(deviceId, serial) {
  await Promise.all([kv.del(K.reg(serial, deviceId)), kv.del(K.dev(deviceId, serial))]);
}
async function serialsForDevice(deviceId) {
  return (await kv.keys(`dev/${deviceId}/`)).map(k => k.split('/').pop());
}
async function devicesForSerial(serial) {
  const keys = await kv.keys(`reg/${serial}/`);
  return (await Promise.all(keys.map(k => kv.get(k)))).filter(Boolean);
}

// "Delete my account": the owner removes the whole family; a member only leaves it.
async function deletePhone(phone) {
  const f = await familyByPhone(phone);
  if (!f) return;
  if (f.ownerPhone !== phone) {
    await kv.del(K.phone(phone));
    await updateFamily(f.id, x => { x.members = x.members.filter(p => p !== phone); delete x.names[phone]; });
    return;
  }
  const regs = await kv.keys(`reg/${f.serial}/`);
  const devs = regs.map(k => k.split('/').pop());
  await Promise.all([
    ...f.members.map(p => kv.del(K.phone(p))),
    kv.del(K.serial(f.serial)), kv.del(K.join(f.joinCode)), kv.del(K.fam(f.id)), kv.del(K.state(phone)),
    ...regs.map(k => kv.del(k)), ...devs.map(d => kv.del(K.dev(d, f.serial))),
  ]);
}

// What a person picked from the WhatsApp menu, kept for 10 minutes.
async function getState(phone) {
  const st = await kv.get(K.state(phone));
  return st && st.exp > Date.now() ? st : null;
}
const setState = (phone, mode, extra = {}) => kv.set(K.state(phone), { mode, ...extra, exp: Date.now() + 10 * 60e3 });
const clearState = phone => kv.del(K.state(phone));

async function logCampaign(c) { await kv.set(K.camp(), { ...c, at: Date.now() }); }
async function campaigns() {
  const keys = (await kv.keys('camp/')).sort().reverse().slice(0, 50);
  return (await Promise.all(keys.map(k => kv.get(k)))).filter(Boolean);
}

module.exports = {
  createFamily, getFamily, familyByPhone, familyBySerial, familyByJoinCode, allFamilies,
  updateFamily, addMember, register, unregister, serialsForDevice, devicesForSerial,
  logCampaign, campaigns, guessTimezone, deletePhone, getState, setState, clearState,
};
