// Server for the viewer and the extracted atlases, loopback only.
//   /                     -> viewer/index.html
//   /api/atlases          -> list of extracted atlas names
//   /data/<name>/...      -> atlas.json + screenshots
//   /<viewer asset>       -> viewer/*
//   POST /api/jobs        -> start a job: { type: 'extract'|'storybook', url, name?, pages?, modes?, screenshots? } or
//                            { type: 'export', atlas, formats: ['pdf'|'json'|'css'|'html'] }
//   POST /api/upload      -> upload a file (raw body, ?filename=&name=&...) and import it
//   GET  /api/jobs[/<id>] -> job status and progress log
// Requests that start work must come from the viewer itself: the Host must be this loopback address (against DNS
// rebinding) and the request must carry the X-UI-Atlas header, which other sites can't send without a CORS
// preflight this server never approves.
import http from 'node:http';
import { readFile, readdirSync, existsSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createJobs } from './jobs.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

export function serve({ root, dataDir, port }) {
  const viewer = path.join(root, 'viewer'), jobs = createJobs({ root, dataDir });
  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj));
  const trusted = req => [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) && req.headers['x-ui-atlas'] === '1'
    && (!req.headers.origin || [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin));
  const body = req => new Promise((ok, fail) => { let s = ''; req.on('data', c => { s += c; if (s.length > 64 * 1024) { req.destroy(); fail(new Error('Request too large.')); } }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { fail(new Error('Invalid request.')); } }); });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/jobs') || p === '/api/upload') {
      if (req.method !== 'GET' && !trusted(req)) return json(res, 403, { error: 'Jobs can only be started from the UI Atlas page itself.' });
      try {
        if (req.method === 'GET' && p === '/api/jobs') return json(res, 200, jobs.list());
        if (req.method === 'GET') { const j = jobs.get(p.slice('/api/jobs/'.length)); return j ? json(res, 200, j) : json(res, 404, { error: 'No such job.' }); }
        if (req.method === 'POST' && p === '/api/jobs') return json(res, 202, jobs.get(jobs.add(await body(req)).id));
        if (req.method === 'POST' && p === '/api/upload') {
          const q = Object.fromEntries(url.searchParams), { file, tmp } = await jobs.receive(req, q.filename);
          try { return json(res, 202, jobs.get(jobs.add({ type: 'import', name: q.name, pages: q.pages, modes: q.modes, screenshots: q.screenshots === '1' }, file, tmp).id)); }
          catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; } // bad options: drop the upload
        }
        return json(res, 405, { error: 'Not allowed.' });
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'not allowed', 'text/plain');
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
    // ?download: save instead of open (export files)
    if (url.searchParams.has('download')) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file).replace(/"/g, '')}"`);
    readFile(file, (err, data) => err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, data, types[path.extname(file).toLowerCase()] || 'application/octet-stream'));
  });
  server.listen(port, '127.0.0.1', () => console.log(`UI Atlas: http://127.0.0.1:${port}/`));
  return server;
}
