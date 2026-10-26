// Static server for the viewer and the extracted atlases. Read-only, loopback only.
//   /                     -> viewer/index.html
//   /api/atlases          -> list of extracted atlas names
//   /data/<name>/...      -> atlas.json + screenshots
//   /<viewer asset>       -> viewer/*
import http from 'node:http';
import { readFile, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

export function serve({ root, dataDir, port }) {
  const viewer = path.join(root, 'viewer');
  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    if (p === '/api/atlases') {
      const sets = existsSync(dataDir) ? readdirSync(dataDir).filter(d => existsSync(path.join(dataDir, d, 'atlas.json'))) : [];
      return send(res, 200, JSON.stringify(sets));
    }
    // /data/* resolves under dataDir; everything else under viewer/
    const base = p.startsWith('/data/') ? dataDir : viewer;
    const rel = p.startsWith('/data/') ? p.slice('/data/'.length) : p.slice(1);
    const file = path.join(base, rel);
    if (!file.startsWith(base)) return send(res, 403, 'forbidden', 'text/plain');
    if (!existsSync(file) || statSync(file).isDirectory()) return send(res, 404, 'not found', 'text/plain');
    readFile(file, (err, data) => err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, data, types[path.extname(file).toLowerCase()] || 'application/octet-stream'));
  });
  server.listen(port, '127.0.0.1', () => console.log(`UI Atlas: http://127.0.0.1:${port}/`));
  return server;
}
