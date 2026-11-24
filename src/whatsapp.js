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

// Tappable list of options (WhatsApp interactive list: max 10 rows, titles up to 24 chars)
function sendMenu(to, L) {
  const row = (id, key) => { const [title, description] = t(L, key); return { id, title, description }; };
  return api({
    to, type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: t(L, 'menuBody') },
      action: {
        button: t(L, 'menuButton'),
        sections: [
          { title: t(L, 'menuSection'), rows: [row('m:item', 'mItem'), row('m:event', 'mEvent'), row('m:task', 'mTask'), row('m:reminder', 'mReminder'), row('m:location', 'mLocation')] },
          { title: t(L, 'menuSection2'), rows: [row('m:list', 'mList'), row('m:clear', 'mClear'), row('m:help', 'mHelp')] },
        ],
      },
    },
  });
}
// Up to 3 reply buttons (titles up to 20 chars)
const sendButtons = (to, text, buttons) => api({
  to, type: 'interactive',
  interactive: { type: 'button', body: { text }, action: { buttons: buttons.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } },
});

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
  await sendMenu(phone, lang);
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

  if (msg.type === 'interactive') {
    if (!f) return onStart(phone, name, L);
    const id = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id || '';
    return onChoice(f, phone, id, L);
  }

  if (msg.type !== 'text') {
    if (f) await markRead(msg.id);
    return; // voice / images: later
  }

  const cmd = command(text);

  if (!f && (cmd?.cmd === 'start' || !cmd)) return onStart(phone, name, L);
  if (f && (cmd?.cmd === 'start' || cmd?.cmd === 'menu')) { await db.clearState(phone); return sendMenu(phone, L); }

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
        .map((e, i) => `${i + 1}. ${ev.display(e, L, f.timezone)}${e.yearly && !e.raw ? ' · ' + t(L, 'yearly') : ''}`).join('\n');
      return send(phone, t(L, 'eventsList', list));
    }
    case 'removeEvent': {
      const e = await fam.removeEvent(f, cmd.q);
      return send(phone, e ? t(L, 'eventRemoved', ev.label(e, L)) : t(L, 'eventNotFound'));
    }
    case 'tasks': return send(phone, t(L, 'tasksList', (f.tasks || []).map((x, i) => `${i + 1}. ${x.text}`).join('\n')));
    case 'task': { await db.clearState(phone); const x = await fam.addTask(f, cmd.text, phone); return x ? send(phone, t(L, 'taskAdded', x.text)) : markRead(msg.id); }
    case 'done': {
      const x = await fam.doneTask(f, cmd.q);
      return send(phone, x ? t(L, 'taskDone', x.text) : t(L, 'taskNotFound'));
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

  // The person picked something from the menu → read the text that way.
  const st = cmd ? null : await db.getState(phone);
  if (st) {
    const opts = { tz: f.timezone, monthFirst: String(f.ownerPhone).startsWith('1') };
    switch (st.mode) {
      case 'item': {
        await db.clearState(phone);
        // From the menu: keep exactly what was typed, only split lines / commas.
        const items = text.split(/\n|،|,|؛/).map(x => x.trim()).filter(Boolean);
        if (items.length) await fam.addItems(f, items, phone);
        return send(phone, t(L, 'itemsAdded', items.join(L === 'ar' ? '، ' : ', ')));
      }
      case 'task': {
        await db.clearState(phone);
        const x = await fam.addTask(f, text, phone);
        return x ? send(phone, t(L, 'taskAdded', x.text)) : markRead(msg.id);
      }
      case 'event': {
        // From the menu: saved as typed. If a date is readable it also gets reminders.
        const e = ev.rawEvent(text, ev.parseEvent(text, opts));
        await db.clearState(phone);
        await fam.addEvent(f, e);
        return send(phone, t(L, 'eventSaved', e.raw) + (ev.undated(e) ? '' : `\n🔔 ${ev.whenText(e, L, f.timezone)}`));
      }
      case 'reminder': {
        const parsed = ev.parseEvent(text, { ...opts, allowTimeOnly: true, forceKind: 'reminder' });
        const e = ev.rawEvent(text, parsed);
        if (!parsed) { e.kind = 'reminder'; e.emoji = '⏰'; }
        await db.clearState(phone);
        await fam.addEvent(f, e);
        return send(phone, t(L, 'reminderSaved', e.raw) + (ev.undated(e) ? '' : `\n🔔 ${ev.whenText(e, L, f.timezone)}`));
      }
      case 'placeName': {
        await db.clearState(phone);
        const nameOfPlace = text.trim().slice(0, 30);
        await db.updateFamily(f.id, x => { x.pendingLocation = nameOfPlace; });
        return send(phone, t(L, 'sendLocation', nameOfPlace));
      }
    }
  }

  // A date in the message → it's an event (birthday, wedding, flight...)
  const e = ev.parseEvent(text, { tz: f.timezone, monthFirst: String(f.ownerPhone).startsWith('1') });
  if (e) {
    await fam.addEvent(f, e);
    return send(phone, t(L, e.kind === 'reminder' ? 'reminderSet' : 'eventAdded', e.kind === 'reminder' ? (e.title || ev.label(e, L)) : ev.label(e, L), ev.whenText(e, L, f.timezone)));
  }

  // Otherwise it's a list message. Add silently, mark as read (free), no reply.
  const items = await splitItems(text);
  if (items.length) await fam.addItems(f, items, phone);
  return markRead(msg.id);
}

// A tapped menu row or button.
async function onChoice(f, phone, id, L) {
  switch (id) {
    case 'm:item': await db.setState(phone, 'item'); return send(phone, t(L, 'askItem'));
    case 'm:event': await db.setState(phone, 'event'); return send(phone, t(L, 'askEvent'));
    case 'm:task': await db.setState(phone, 'task'); return send(phone, t(L, 'askTask'));
    case 'm:reminder': await db.setState(phone, 'reminder'); return send(phone, t(L, 'askReminder'));
    case 'm:location':
      return sendButtons(phone, t(L, 'askLocation'), [['loc:home', t(L, 'locHome')], ['loc:other', t(L, 'locOther')]]);
    case 'loc:home': {
      const home = L === 'ar' ? 'البيت' : 'Home';
      await db.updateFamily(f.id, x => { x.pendingLocation = home; });
      return send(phone, t(L, 'sendLocation', home));
    }
    case 'loc:other': await db.setState(phone, 'placeName'); return send(phone, t(L, 'askPlaceName'));
    case 'm:list': {
      const fresh = await db.getFamily(f.id);
      const items = fresh.items.length ? fresh.items.map((x, i) => `${i + 1}. ${x.text}`).join('\n') : t(L, 'none');
      const tasks = (fresh.tasks || []).length ? fresh.tasks.map((x, i) => `${i + 1}. ${x.text}`).join('\n') : t(L, 'none');
      const evs = ev.upcoming(fresh.events, fresh.timezone).map((e, i) => `${i + 1}. ${ev.display(e, L, fresh.timezone)}`).join('\n') || t(L, 'none');
      return send(phone, t(L, 'overview', items, tasks, evs));
    }
    case 'm:clear': await fam.clear(f); return send(phone, t(L, 'cleared'));
    case 'm:help': return send(phone, t(L, 'help'));
    default: return sendMenu(phone, L);
  }
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
