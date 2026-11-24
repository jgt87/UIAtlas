// Server for the viewer and the extracted atlases, loopback only.
//   /                     -> viewer/index.html
//   /api/atlases          -> list of extracted atlas names
//   /data/<name>/...      -> atlas.json + screenshots
//   /<viewer asset>       -> viewer/*
//   POST /api/jobs        -> start a job: { type: 'extract'|'storybook', url, name?, pages?, modes?, screenshots?, replace? } or
//                            { type: 'export', atlas, formats: [an EXPORT_FORMAT_IDS id, ...] }
//   POST /api/upload      -> upload a file (raw body, ?filename=&name=&...&replace=1) and import it
//   GET  /api/jobs[/<id>] -> job status and progress log
// A job whose atlas name already exists answers 409 { error, exists: true, name } unless it says replace.
// Requests that start work must come from the viewer itself: the Host must be this loopback address (against DNS
// rebinding) and the request must carry the API_HEADER (viewer/js/shared.js), which other sites can't send without
// a CORS preflight this server never approves.
import http from 'node:http';
import { readFile, readdirSync, existsSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createJobs } from './jobs.mjs';
import { isInside } from './atlas-file.mjs';
import { API_HEADER } from '../viewer/js/shared.js';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const HEADER = API_HEADER.toLowerCase(); // Node lower-cases incoming header names

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
const json = (res, code, obj) => send(res, code, JSON.stringify(obj));
const body = req => new Promise((ok, fail) => { let s = ''; req.on('data', c => { s += c; if (s.length > 64 * 1024) { req.destroy(); fail(new Error('Request too large.')); } }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { fail(new Error('Invalid request.')); } }); });
// read and drop a request body that is refused, so the client gets the answer rather than a reset connection
const drain = req => new Promise(ok => { req.on('data', () => {}); req.on('end', ok); req.on('error', ok); req.on('close', ok); });
// the request's URL and decoded path, or null when either is malformed (e.g. /%E0): a 400, never a crash
const parseUrl = raw => { try { const url = new URL(raw, 'http://localhost'); return { url, p: decodeURIComponent(url.pathname) }; } catch { return null; } };

export function serve({ root, dataDir, port, node }) {
  const viewer = path.join(root, 'viewer'), jobs = createJobs({ root, dataDir, node });
  const trusted = req => [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host) && req.headers[HEADER] === '1'
    && (!req.headers.origin || [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin));

  async function upload(req, res, url) {
    const q = Object.fromEntries(url.searchParams);
    try { jobs.checkUpload(q); } catch (e) { await drain(req); throw e; } // a bad option or a taken name: nothing is saved
    const { file, tmp } = await jobs.receive(req, q.filename);
    try { return json(res, 202, jobs.get(jobs.add({ ...q, type: 'import' }, file, tmp).id)); }
    catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; } // bad options: drop the upload
  }
  function status(res, p) {
    if (p === '/api/jobs') return json(res, 200, jobs.list());
    const j = jobs.get(p.slice('/api/jobs/'.length)); return j ? json(res, 200, j) : json(res, 404, { error: 'No such job.' });
  }
  async function startWork(req, res, p, url) {
    if (p === '/api/jobs') return json(res, 202, jobs.get(jobs.add(await body(req)).id));
    if (p === '/api/upload') return upload(req, res, url);
    return json(res, 405, { error: 'Not allowed.' });
  }
  async function api(req, res, p, url) {
    if (req.method === 'GET') return status(res, p);
    if (req.method !== 'POST') return json(res, 405, { error: 'Not allowed.' });
    if (!trusted(req)) return json(res, 403, { error: 'Jobs can only be started from the UI Atlas page itself.' });
    try { return await startWork(req, res, p, url); } catch (e) { return json(res, e.status || 400, e.body || { error: e.message }); }
  }
  // /data/* resolves under dataDir, everything else under viewer/; anything that resolves outside its base is refused
  function file(res, p, url) {
    const data = p.startsWith('/data/'), base = data ? dataDir : viewer;
    const target = path.join(base, data ? p.slice('/data/'.length) : p === '/' ? 'index.html' : p.slice(1));
    if (!isInside(base, target)) return send(res, 403, 'forbidden', 'text/plain');
    if (!existsSync(target) || statSync(target).isDirectory()) return send(res, 404, 'not found', 'text/plain');
    // ?download: save instead of open (export files)
    if (url.searchParams.has('download')) res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target).replace(/"/g, '')}"`);
    readFile(target, (err, buf) => err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, buf, types[path.extname(target).toLowerCase()] || 'application/octet-stream'));
  }

  const server = http.createServer(async (req, res) => {
    const parsed = parseUrl(req.url);
    if (!parsed) return send(res, 400, 'bad request: the path is not valid URL encoding', 'text/plain');
    const { url, p } = parsed;
    if (p.startsWith('/api/jobs') || p === '/api/upload') return api(req, res, p, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'not allowed', 'text/plain');
    if (p === '/api/atlases') {
      const sets = existsSync(dataDir) ? readdirSync(dataDir).filter(d => existsSync(path.join(dataDir, d, 'atlas.json'))) : [];
      return send(res, 200, JSON.stringify(sets));
    }
    return file(res, p, url);
  });
  server.listen(port, '127.0.0.1', () => console.log(`UI Atlas: http://127.0.0.1:${port}/`));
  return server;
}
