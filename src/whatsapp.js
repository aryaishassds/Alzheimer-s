// WhatsApp Cloud API: receive messages, reply only during setup.
// Regular list messages get NO reply (only blue ticks) to keep cost near zero.
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const fam = require('./family');
const google = require('./pass/google');
const { command, splitItems } = require('./parse');
const ev = require('./events');
const { t, detectLang, locale } = require('./i18n');
const c = require('./pass/content');

const GRAPH = 'https://graph.facebook.com/v21.0';

async function api(body) {
  if (!cfg.whatsapp.token) { console.log('[wa:dry-run]', JSON.stringify(body)); return; }
  const r = await fetch(`${GRAPH}/${cfg.whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.whatsapp.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  if (!r.ok) console.error('[wa]', r.status, await r.text());
}
const send = (to, text) => api({ to, type: 'text', text: { body: text, preview_url: true } });
const markRead = id => api({ status: 'read', message_id: id });

const cardLink = f => `${cfg.baseUrl}/card/${f.serial}?t=${f.authToken}`;
const inviteLink = f => `https://wa.me/${cfg.whatsapp.botNumber}?text=${encodeURIComponent((c.lang(f) === 'ar' ? 'انضمام-' : 'join-') + f.joinCode)}`;
const payLink = (f, L) => cfg.stripe.paymentLink ? `${cfg.stripe.paymentLink}?client_reference_id=${f.id}` : t(L, 'payLinkMissing');

function verifySignature(rawBody, sig = '') {
  if (!cfg.whatsapp.appSecret) return true;
  const mine = 'sha256=' + crypto.createHmac('sha256', cfg.whatsapp.appSecret).update(rawBody || '').digest('hex');
  return sig.length === mine.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mine));
}

async function onStart(phone, name, L) {
  let f = await db.familyByPhone(phone);
  const isNew = !f;
  if (!f) f = await db.createFamily(phone, name, L);
  const lang = isNew ? L : c.lang(f);
  const trial = isNew ? t(lang, 'trial', cfg.trialDays, cfg.priceUsd, payLink(f, lang)) : '';
  await send(phone, t(lang, 'welcome', name || '', cardLink(f), inviteLink(f), trial));
}

// Language to answer in: the language the person just wrote in, else the family's.
const replyLang = (text, f) => (/[A-Za-z؀-ۿ]/.test(text || '') ? detectLang(text) : (f ? c.lang(f) : 'ar'));

async function handle(msg, contactName) {
  const phone = msg.from;
  const name = contactName || '';
  const f = await db.familyByPhone(phone);
  const text = msg.type === 'text' ? (msg.text.body || '') : '';
  const L = msg.type === 'text' ? replyLang(text, f) : (f ? c.lang(f) : 'ar');

  if (msg.type === 'location') {
    if (!f) return onStart(phone, name, L);
    const target = f.pendingLocation || (f.locations.some(l => l.kind === 'home') ? null : (L === 'ar' ? 'البيت' : 'Home'));
    if (!target) return send(phone, t(L, 'locationFirst'));
    const r = await fam.setLocation(f, { name: target, lat: msg.location.latitude, lng: msg.location.longitude });
    if (!r.ok) return send(phone, t(L, 'placesFull', c.MAX_LOCATIONS));
    return send(phone, r.home ? t(L, 'homeSaved') : t(L, 'placeSaved', target));
  }

  if (msg.type !== 'text') {
    if (f) await markRead(msg.id);
    return; // voice / images: later
  }

  const cmd = command(text);

  if (cmd?.cmd === 'start' || (!f && !cmd)) return onStart(phone, name, L);

  if (cmd?.cmd === 'join') {
    const target = await db.familyByJoinCode(cmd.code);
    if (!target) return send(phone, t(L, 'badCode'));
    await db.addMember(target, phone, name);
    await send(target.ownerPhone, t(c.lang(target), 'joinedOwner', name || phone));
    return send(phone, t(L, 'joinedMember', cardLink(target)));
  }

  if (!f) return onStart(phone, name, L);

  if (cmd?.cmd === 'deleteAsk') return send(phone, t(L, 'deleteConfirm'));
  if (cmd?.cmd === 'deleteConfirm') { await db.deletePhone(phone); return send(phone, t(L, 'deleted')); }

  if (!c.isActive(f)) return send(phone, t(L, 'expired', cfg.priceUsd, payLink(f, L)));

  switch (cmd?.cmd) {
    case 'help': return send(phone, t(L, 'help'));
    case 'card': return send(phone, cardLink(f));
    case 'list': return send(phone, f.items.length ? f.items.map((i, n) => `${n + 1}. ${i.text}`).join('\n') : t(L, 'listEmpty'));
    case 'events': {
      const list = ev.upcoming(f.events, f.timezone)
        .map((e, i) => `${i + 1}. ${ev.label(e, L)} – ${ev.whenText(e, L, f.timezone)}${e.yearly ? ' · ' + t(L, 'yearly') : ''}`).join('\n');
      return send(phone, t(L, 'eventsList', list));
    }
    case 'removeEvent': {
      const e = await fam.removeEvent(f, cmd.q);
      return send(phone, e ? t(L, 'eventRemoved', ev.label(e, L)) : t(L, 'eventNotFound'));
    }
    case 'clear': await fam.clear(f); return markRead(msg.id);
    case 'remove': await fam.removeItem(f, cmd.text); return markRead(msg.id);
    case 'lang': await fam.setLang(f, cmd.lang); return send(phone, t(cmd.lang, 'langSet'));
    case 'pendingLocation':
      await db.updateFamily(f.id, x => { x.pendingLocation = cmd.name; });
      return send(phone, t(L, 'sendLocation', cmd.name));
    case 'removeLocation': {
      const n = await fam.removeLocation(f, cmd.name);
      return send(phone, n ? t(L, 'placeRemoved', cmd.name) : t(L, 'placeNotFound'));
    }
    case 'time':
      await fam.setReminderTimes(f, cmd.times);
      return send(phone, t(L, 'timesSet', cmd.times.join(L === 'ar' ? ' و ' : ' & ')));
    case 'timezone':
      if (!cmd.tz) return send(phone, t(L, 'tzUnknown'));
      await fam.change(f.id, x => { x.timezone = cmd.tz; });
      return send(phone, t(L, 'tzSet', cmd.name, new Intl.DateTimeFormat(locale(L), { timeZone: cmd.tz, hour: 'numeric', minute: '2-digit' }).format(new Date())));
    case 'optout':
      await db.updateFamily(f.id, x => { x.optInOffers = false; });
      return send(phone, t(L, 'optedOut'));
  }

  // A date in the message → it's an event (birthday, wedding, flight...)
  const e = ev.parseEvent(text, { tz: f.timezone, monthFirst: String(f.ownerPhone).startsWith('1') });
  if (e) {
    await fam.addEvent(f, e);
    return send(phone, t(L, 'eventAdded', ev.label(e, L), ev.whenText(e, L, f.timezone)));
  }

  // Otherwise it's a list message. Add silently, mark as read (free), no reply.
  const items = await splitItems(text);
  if (items.length) await fam.addItems(f, items, phone);
  return markRead(msg.id);
}

// Meta sends message events here. Returns an HTTP status.
async function webhook(rawBody, signature) {
  if (!verifySignature(rawBody, signature)) return 401;
  let body;
  try { body = JSON.parse(rawBody); } catch { return 400; }
  for (const entry of body.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    const names = Object.fromEntries((v.contacts || []).map(x => [x.wa_id, x.profile?.name]));
    for (const m of v.messages || []) {
      try { await handle(m, names[m.from]); } catch (e) { console.error('[wa] handle error', e); }
    }
  }
  return 200;
}

function verify(query) {
  if (query.get('hub.mode') === 'subscribe' && cfg.whatsapp.verifyToken && query.get('hub.verify_token') === cfg.whatsapp.verifyToken) {
    return { status: 200, body: query.get('hub.challenge') || '' };
  }
  return { status: 403, body: 'Forbidden' };
}

module.exports = { webhook, verify, handle, send, cardLink };
