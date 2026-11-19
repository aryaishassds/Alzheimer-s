// All HTTP routes, written as (Request) => Response so the same code runs
// on Netlify Functions and locally (scripts/dev.js).
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const apple = require('./pass/apple');
const google = require('./pass/google');
const wa = require('./whatsapp');
const fam = require('./family');
const scheduler = require('./scheduler');
const { isActive } = require('./pass/content');

const text = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const html = body => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const empty = status => new Response(null, { status });
const pkpass = (buf, extra = {}) => new Response(buf, { headers: { 'content-type': 'application/vnd.apple.pkpass', ...extra } });

const safeEq = (a = '', b = '') => a.length === b.length && a.length > 0 && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------- card landing page ----------
async function cardPage(serial, t) {
  const f = await db.familyBySerial(serial);
  if (!f || !safeEq(t, f.authToken)) return text('Not found', 404);
  const g = google.saveUrl(f);
  const applePath = `/card/${f.serial}/pass.pkpass?t=${f.authToken}`;
  return html(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${cfg.brandName}</title>
<style>body{font-family:system-ui;background:#0f766e;color:#fff;text-align:center;padding:40px 20px;margin:0}
a.b{display:block;max-width:320px;margin:14px auto;padding:15px;border-radius:12px;background:#000;color:#fff;text-decoration:none;font-weight:700;font-size:17px}
a.g{background:#fff;color:#000}.m{opacity:.85;font-size:15px;line-height:1.7}.box{background:rgba(255,255,255,.12);border-radius:14px;padding:14px;max-width:340px;margin:24px auto;text-align:right;font-size:14px;line-height:1.9}</style>
<img src="/assets/logo@3x.png" width="76" alt=""><h1>${cfg.brandName}</h1>
<p class="m">أضف الكرت لمحفظتك، وكل طلبات البيت تظهر عليه.</p>
<a class="b" id="a" href="${applePath}"> إضافة إلى Apple Wallet</a>
${g ? `<a class="b g" id="g" href="${g}">إضافة إلى Google Wallet</a>` : ''}
<div class="box"><b>بعد الإضافة (مرة واحدة):</b><br>
<span id="ios">آيفون: الإعدادات ← الخصوصية والأمان ← خدمات الموقع ← Wallet ← تفعيل. ثم افتح الكرت ← ⋯ ← فعّل الإشعارات.</span>
<span id="and">أندرويد: Google Wallet ← الإعدادات ← فعّل الإشعارات و Nearby passes، واسمح بالموقع الدقيق دائماً.</span></div>
<script>var ua=navigator.userAgent,$=function(i){return document.getElementById(i)};
if(/Android/i.test(ua)){$('a').style.display='none';$('ios').style.display='none'}
else if(/iPhone|iPad/i.test(ua)){if($('g'))$('g').style.display='none';$('and').style.display='none'}</script></html>`);
}

// ---------- Stripe ----------
function stripeVerify(raw, header = '') {
  if (!cfg.stripe.webhookSecret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const expected = crypto.createHmac('sha256', cfg.stripe.webhookSecret).update(`${parts.t}.${raw}`).digest('hex');
  return safeEq(parts.v1, expected);
}

// ---------- router ----------
async function handle(req) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  let r;

  if (p === '/health') return json({
    ok: true, price: cfg.priceUsd, storage: require('./kv').backend, baseUrl: cfg.baseUrl,
    adminTokenSet: Boolean(cfg.adminToken), adminTokenLength: cfg.adminToken.length,
    apple: { teamId: Boolean(cfg.apple.teamId), passTypeId: cfg.apple.passTypeId || null,
      cert: Boolean(cfg.apple.signerCert), key: Boolean(cfg.apple.signerKey), wwdr: Boolean(cfg.apple.wwdr) },
    whatsapp: Boolean(cfg.whatsapp.token), stripe: Boolean(cfg.stripe.paymentLink), google: Boolean(cfg.google.serviceAccount),
  });

  // WhatsApp
  if (p === '/webhook' && m === 'GET') { const v = wa.verify(url.searchParams); return text(v.body, v.status); }
  if (p === '/webhook' && m === 'POST') return empty(await wa.webhook(await req.text(), req.headers.get('x-hub-signature-256') || ''));

  // Card
  if ((r = p.match(/^\/card\/([\w-]+)$/)) && m === 'GET') return cardPage(r[1], url.searchParams.get('t') || '');
  if ((r = p.match(/^\/card\/([\w-]+)\/pass\.pkpass$/)) && m === 'GET') {
    const f = await db.familyBySerial(r[1]);
    if (!f || !safeEq(url.searchParams.get('t') || '', f.authToken)) return text('Not found', 404);
    try { return pkpass(await apple.buildPass(f), { 'content-disposition': 'attachment; filename=card.pkpass' }); }
    catch (e) { console.error(e); return text('Pass error: ' + e.message, 500); }
  }

  // Apple Wallet web service — https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
  if (p.startsWith('/apple/v1/')) {
    const auth = (req.headers.get('authorization') || '').replace(/^ApplePass\s+/, '');
    const passAuth = async serial => { const f = await db.familyBySerial(serial); return f && safeEq(auth, f.authToken) ? f : null; };

    if ((r = p.match(/^\/apple\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)$/))) {
      const [, device, , serial] = r;
      const f = await passAuth(serial); if (!f) return empty(401);
      if (m === 'POST') { const { pushToken } = await req.json(); return empty((await db.register(device, pushToken, f.serial)) ? 201 : 200); }
      if (m === 'DELETE') { await db.unregister(device, f.serial); return empty(200); }
    }
    if ((r = p.match(/^\/apple\/v1\/devices\/([^/]+)\/registrations\/([^/]+)$/)) && m === 'GET') {
      const since = Number(url.searchParams.get('passesUpdatedSince') || 0);
      const fams = (await Promise.all((await db.serialsForDevice(r[1])).map(s => db.familyBySerial(s)))).filter(f => f && f.updatedAt > since);
      if (!fams.length) return empty(204);
      return json({ serialNumbers: fams.map(f => f.serial), lastUpdated: String(Math.max(...fams.map(f => f.updatedAt))) });
    }
    if ((r = p.match(/^\/apple\/v1\/passes\/([^/]+)\/([^/]+)$/)) && m === 'GET') {
      const f = await passAuth(r[2]); if (!f) return empty(401);
      const ims = req.headers.get('if-modified-since');
      if (ims && new Date(ims).getTime() >= Math.floor(f.updatedAt / 1000) * 1000) return empty(304);
      return pkpass(await apple.buildPass(f), { 'last-modified': new Date(f.updatedAt).toUTCString() });
    }
    if (p === '/apple/v1/log' && m === 'POST') { console.log('[apple log]', await req.text()); return empty(200); }
    return empty(404);
  }

  // Stripe
  if (p === '/stripe/webhook' && m === 'POST') {
    const raw = await req.text();
    if (!stripeVerify(raw, req.headers.get('stripe-signature') || '')) return empty(400);
    const ev = JSON.parse(raw);
    if (ev.type === 'checkout.session.completed') {
      const f = await db.getFamily(ev.data.object.client_reference_id);
      if (f) {
        const updated = await db.updateFamily(f.id, x => { x.status = 'paid'; x.paidUntil = Math.max(Date.now(), x.paidUntil || 0) + 365 * 864e5; });
        await wa.send(f.ownerPhone, `✅ تم الدفع. اشتراكك فعّال حتى ${new Date(updated.paidUntil).toLocaleDateString('ar')}. شكراً لك!`);
      }
    }
    return empty(200);
  }

  // Scheduler backup trigger (external cron, e.g. cron-job.org)
  if (p === '/cron/tick') {
    if (!safeEq(url.searchParams.get('key') || '', cfg.cronSecret)) return empty(401);
    return json(await scheduler.tick());
  }

  // Admin API
  if (p.startsWith('/admin/api/')) {
    if (!safeEq(req.headers.get('authorization') || '', `Bearer ${cfg.adminToken}`) || !cfg.adminToken) return empty(401);
    if (p === '/admin/api/families' && m === 'GET') {
      const fams = await db.allFamilies();
      const out = await Promise.all(fams.map(async f => ({
        id: f.id, owner: f.ownerPhone, name: f.names[f.ownerPhone] || '',
        members: f.members.map(ph => ({ phone: ph, name: f.names[ph] || '' })),
        status: isActive(f) ? f.status : 'expired', paidUntil: f.paidUntil, trialEnds: f.trialEnds,
        optInOffers: f.optInOffers, items: f.items.length, locations: f.locations.length,
        devices: (await db.devicesForSerial(f.serial)).length, createdAt: f.createdAt,
      })));
      return json({ price: cfg.priceUsd, families: out });
    }
    // Create a card for a phone number without WhatsApp (for testing the card first).
    if (p === '/admin/api/test-family' && m === 'POST') {
      const { phone, name = 'تجربة' } = await req.json();
      const ph = String(phone || '').replace(/\D/g, '');
      if (ph.length < 8) return json({ error: 'phone required' }, 400);
      let f = await db.familyByPhone(ph);
      if (!f) f = await db.createFamily(ph, name);
      return json({ id: f.id, card: `${cfg.baseUrl}/card/${f.serial}?t=${f.authToken}` });
    }
    // Add items to a family from the admin page (testing).
    if (p === '/admin/api/test-items' && m === 'POST') {
      const { phone, text: t } = await req.json();
      const f = await db.familyByPhone(String(phone || '').replace(/\D/g, ''));
      if (!f) return json({ error: 'not found' }, 404);
      await fam.addItems(f, String(t || '').split(/[،,\n]/), f.ownerPhone);
      return json({ ok: true });
    }
    if (p === '/admin/api/campaigns' && m === 'GET') return json(await db.campaigns());
    if (p === '/admin/api/broadcast' && m === 'POST') {
      const { text: msg, countries = [], status = '' } = await req.json();
      if (!msg) return json({ error: 'text required' }, 400);
      const targets = (await db.allFamilies()).filter(f => {
        const st = isActive(f) ? f.status : 'expired';
        const phone = '+' + f.ownerPhone;
        return f.optInOffers && (!status || status === st) && (!countries.length || countries.some(c => phone.startsWith(c)));
      });
      for (const f of targets) await fam.sendOffer(f, msg);
      await db.logCampaign({ text: msg, countries, status, channel: 'wallet', count: targets.length });
      return json({ sent: targets.length });
    }
    return empty(404);
  }

  return text('Not found', 404);
}

module.exports = { handle };
