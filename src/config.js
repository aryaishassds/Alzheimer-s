try { require('dotenv').config({ quiet: true }); } catch {}
const fs = require('fs');
const path = require('path');

// Rebuild a PEM that lost its line breaks (e.g. pasted into a one-line field).
function fixPem(t) {
  t = t.replace(/\\n/g, '\n');
  const m = t.match(/^(-----BEGIN [^-]+-----)([\s\S]*?)(-----END [^-]+-----)/);
  if (!m) return t;
  const body = m[2].replace(/\s+/g, '').match(/.{1,64}/g) || [];
  return `${m[1]}\n${body.join('\n')}\n${m[3]}\n`;
}

// A secret can be given as: raw PEM/JSON text, base64 of it, or a file path (local dev).
function secret(name) {
  const v = process.env[name];
  if (!v) return undefined;
  const t = v.replace(/\r/g, '').trim();
  if (t.startsWith('{')) return Buffer.from(t);
  if (t.startsWith('-----BEGIN')) return Buffer.from(fixPem(t));
  const file = path.resolve(t);
  if (t.length < 300 && fs.existsSync(file)) return fs.readFileSync(file);
  try {
    const dec = Buffer.from(t, 'base64');
    const s = dec.toString();
    if (s.includes('-----BEGIN') || s.trim().startsWith('{')) return dec;
  } catch {}
  return undefined;
}

const cfg = {
  baseUrl: (process.env.BASE_URL || process.env.URL || 'http://localhost:8888').replace(/\/$/, ''),
  priceUsd: Number(process.env.PRICE_USD || 2),
  trialDays: Number(process.env.TRIAL_DAYS || 7),
  brandName: process.env.BRAND_NAME || 'كرت الطلبات',
  brandNameEn: process.env.BRAND_NAME_EN || 'Home List',
  adminToken: process.env.ADMIN_TOKEN || '',
  cronSecret: process.env.CRON_SECRET || '',

  apple: {
    teamId: process.env.APPLE_TEAM_ID || '',
    passTypeId: process.env.APPLE_PASS_TYPE_ID || '',
    wwdr: secret('APPLE_WWDR'),
    signerCert: secret('APPLE_SIGNER_CERT'),
    signerKey: secret('APPLE_SIGNER_KEY'),
    signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
  },

  google: {
    issuerId: process.env.GOOGLE_ISSUER_ID || '',
    classSuffix: process.env.GOOGLE_CLASS_SUFFIX || 'home_list',
    serviceAccount: null,
    error: null,
  },

  whatsapp: {
    token: process.env.WA_TOKEN || '',
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WA_VERIFY_TOKEN || '',
    botNumber: (process.env.WA_BOT_NUMBER || '').replace(/\D/g, ''),
    appSecret: process.env.WA_APP_SECRET || '',
  },

  stripe: {
    paymentLink: process.env.STRIPE_PAYMENT_LINK || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
};

// Google service account: tolerate wrapping quotes, base64, or the _JSON name; record why it failed.
(() => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!raw.trim()) { cfg.google.error = 'GOOGLE_SERVICE_ACCOUNT is empty or missing'; return; }
  let v = raw.replace(/\r/g, '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!v.startsWith('{')) { try { const d = Buffer.from(v, 'base64').toString(); if (d.trim().startsWith('{')) v = d; } catch {} }
  try {
    const j = JSON.parse(v);
    if (!j.client_email || !j.private_key) throw new Error('missing client_email or private_key');
    j.private_key = j.private_key.replace(/\\n/g, '\n');
    cfg.google.serviceAccount = j;
  } catch (e) {
    cfg.google.error = 'GOOGLE_SERVICE_ACCOUNT is not valid JSON: ' + e.message + ` (starts with "${v.slice(0, 12)}")`;
  }
})();

module.exports = cfg;
