// Local test server: node scripts/dev.js  ->  http://localhost:8888
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const scheduler = require('../src/scheduler');
const PUB = path.join(__dirname, '../public');
const PORT = Number(process.env.PORT || 8888);
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  let file = path.join(PUB, decodeURIComponent(u.pathname));
  if (file.startsWith(PUB) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (file.startsWith(PUB) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const r = await app.handle(new Request(u, { method: req.method, headers: req.headers, body }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`dev server http://localhost:${PORT}`));

setInterval(() => scheduler.tick().catch(console.error), 60e3);
