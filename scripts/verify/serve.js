const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml'
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(8731, () => console.log('http://localhost:8731/'));
