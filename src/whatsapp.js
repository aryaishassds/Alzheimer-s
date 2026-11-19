// WhatsApp Cloud API: receive messages, reply only during setup.
// Regular list messages get NO reply (only blue ticks) to keep cost near zero.
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const fam = require('./family');
const google = require('./pass/google');
const { command, splitItems } = require('./parse');
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
const inviteLink = f => `https://wa.me/${cfg.whatsapp.botNumber}?text=${encodeURIComponent('انضمام-' + f.joinCode)}`;
const payLink = f => cfg.stripe.paymentLink
  ? `${cfg.stripe.paymentLink}?client_reference_id=${f.id}` : '(رابط الدفع غير مضبوط بعد)';

const HELP = `الأوامر:
• اكتب أي غرض (مثل: رز، خبز) فيُضاف للكرت
• مسح ← تفريغ القائمة
• حذف خبز ← حذف غرض
• القائمة ← عرض القائمة
• موقع البيت ← ثم أرسل الموقع 📍
• إضافة موقع سوبرماركت ← ثم أرسل الموقع 📍 (حتى 5 مواقع)
• حذف موقع سوبرماركت
• وقت 5 مساء ← وقت التذكير (حتى 3 أوقات: وقت 1 م 5 م)
• الكرت ← رابط الكرت للمحفظة
• ايقاف العروض`;

function verifySignature(rawBody, sig = '') {
  if (!cfg.whatsapp.appSecret) return true;
  const mine = 'sha256=' + crypto.createHmac('sha256', cfg.whatsapp.appSecret).update(rawBody || '').digest('hex');
  return sig.length === mine.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mine));
}

async function onStart(phone, name) {
  let f = await db.familyByPhone(phone);
  const isNew = !f;
  if (!f) f = await db.createFamily(phone, name);
  await send(phone,
`أهلاً ${name || ''} 👋 هذا ${cfg.brandName}.

1️⃣ أضف الكرت لمحفظتك:
${cardLink(f)}

2️⃣ أرسل لزوجتك/عائلتك هذا الرابط، وكل ما ترسله يظهر في كرتك:
${inviteLink(f)}

3️⃣ اكتب "موقع البيت" ثم أرسل موقعك 📍

${isNew ? `لديك ${cfg.trialDays} أيام مجاناً، بعدها الاشتراك ${cfg.priceUsd}$ للسنة كاملة:\n${payLink(f)}` : ''}`.trim());
}

async function handle(msg, contactName) {
  const phone = msg.from;
  const name = contactName || '';
  const f = await db.familyByPhone(phone);

  if (msg.type === 'location') {
    if (!f) return onStart(phone, name);
    const target = f.pendingLocation || (f.locations.some(l => l.kind === 'home') ? null : 'البيت');
    if (!target) return send(phone, 'لحفظ موقع اكتب أولاً: "موقع البيت" أو "إضافة موقع سوبرماركت"');
    const r = await fam.setLocation(f, { name: target, lat: msg.location.latitude, lng: msg.location.longitude });
    if (!r.ok) return send(phone, `وصلت للحد الأقصى (${c.MAX_LOCATIONS} مواقع). احذف موقعاً أولاً.`);
    return send(phone, r.home
      ? '🏠 تم حفظ موقع البيت. عند وصولك سيذكّرك الكرت بالأغراض، أو يرحب بك إن لم توجد طلبات.'
      : `📍 تم حفظ موقع "${target}". سيذكّرك عندما تقترب منه وتوجد أغراض.`);
  }

  if (msg.type !== 'text') {
    if (f) await markRead(msg.id);
    return; // voice/image support comes later
  }

  const text = msg.text.body || '';
  const cmd = command(text);

  if (cmd?.cmd === 'start' || (!f && !cmd)) return onStart(phone, name);

  if (cmd?.cmd === 'join') {
    const target = await db.familyByJoinCode(cmd.code);
    if (!target) return send(phone, 'الرمز غير صحيح. اطلب رابطاً جديداً.');
    await db.addMember(target, phone, name);
    await send(target.ownerPhone, `✅ ${name || phone} انضم/ت لقائمة البيت.`);
    return send(phone,
`✅ تم! أي غرض تكتبينه هنا يظهر فوراً في كرت العائلة.
مثال: رز، خبز، فوط

ولتري القائمة أنتِ أيضاً، أضيفي الكرت لمحفظتك:
${cardLink(target)}`);
  }

  if (!f) return onStart(phone, name);

  if (!c.isActive(f)) {
    return send(phone, `انتهت فترة اشتراكك. جدّد بـ ${cfg.priceUsd}$ للسنة:\n${payLink(f)}`);
  }

  switch (cmd?.cmd) {
    case 'help': return send(phone, HELP);
    case 'card': return send(phone, cardLink(f));
    case 'list': return send(phone, f.items.length ? f.items.map((i, n) => `${n + 1}. ${i.text}`).join('\n') : 'القائمة فارغة ✨');
    case 'clear': await fam.clear(f); return markRead(msg.id);
    case 'remove': await fam.removeItem(f, cmd.text); return markRead(msg.id);
    case 'pendingLocation':
      await db.updateFamily(f.id, x => { x.pendingLocation = cmd.name; });
      return send(phone, `📍 الآن أرسل موقع "${cmd.name}" من 📎 ← الموقع`);
    case 'removeLocation': {
      const n = await fam.removeLocation(f, cmd.name);
      return send(phone, n ? `تم حذف موقع "${cmd.name}"` : 'لم أجد هذا الموقع.');
    }
    case 'time':
      await fam.setReminderTimes(f, cmd.times);
      return send(phone, `⏰ التذكير اليومي: ${cmd.times.join(' و ')} (فقط إذا وُجدت أغراض)`);
    case 'optout':
      await db.updateFamily(f.id, x => { x.optInOffers = false; });
      return send(phone, 'تم إيقاف العروض.');
  }

  // Default: it's a list message. Add silently, mark as read (free), no reply.
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
