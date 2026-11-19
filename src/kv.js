// Key-value storage.
// On Netlify: Netlify Blobs (built in, no extra account).
// Locally: a JSON file (data/kv.json).
const fs = require('fs');
const path = require('path');

const onNetlify = Boolean(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY || process.env.NETLIFY_DEV);

let store;
function blobs() {
  if (!store) {
    const { getStore } = require('@netlify/blobs');
    store = getStore({ name: 'home-list', consistency: 'strong' });
  }
  return store;
}

const FILE = path.resolve(process.env.KV_FILE || 'data/kv.json');
let mem = null;
function load() { if (!mem) mem = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}; return mem; }
function flush() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(mem, null, 1)); }

module.exports = {
  backend: onNetlify ? 'netlify-blobs' : 'file',
  async get(key) {
    if (onNetlify) return (await blobs().get(key, { type: 'json' })) ?? null;
    const v = load()[key]; return v === undefined ? null : JSON.parse(JSON.stringify(v));
  },
  async set(key, value) {
    if (onNetlify) return blobs().setJSON(key, value);
    load()[key] = value; flush();
  },
  // Safe read-modify-write: retries if another request changed the record meanwhile.
  async update(key, fn) {
    if (!onNetlify) { const cur = await this.get(key); const next = await fn(cur); if (next) await this.set(key, next); return next; }
    for (let i = 0; i < 8; i++) {
      const res = await blobs().getWithMetadata(key, { type: 'json' });
      const next = await fn(res ? JSON.parse(JSON.stringify(res.data)) : null);
      if (!next) return null;
      const w = res?.etag
        ? await blobs().setJSON(key, next, { onlyIfMatch: res.etag })
        : await blobs().setJSON(key, next, { onlyIfNew: true });
      if (w.modified) return next;
      await new Promise(r => setTimeout(r, 40 + Math.random() * 120));
    }
    throw new Error('kv.update: too much contention on ' + key);
  },
  async del(key) {
    if (onNetlify) return blobs().delete(key);
    delete load()[key]; flush();
  },
  async keys(prefix) {
    if (onNetlify) {
      const out = [];
      for await (const page of blobs().list({ prefix, paginate: true })) out.push(...page.blobs.map(b => b.key));
      return out;
    }
    return Object.keys(load()).filter(k => k.startsWith(prefix));
  },
};
