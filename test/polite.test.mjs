// Polite crawling: robots.txt parsing/matching (RFC 9309) and the per-origin gate (fetch, failure modes, pacing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseRobots, isAllowed, createGate, userAgentSuffix } from '../src/polite.mjs';

const ok = (txt, p, a) => isAllowed(parseRobots(txt), p, a);

test('parser: longest match wins, ties go to Allow', () => {
  const r = 'User-agent: *\nDisallow: /shop\nAllow: /shop/catalogue\nDisallow: /shop/catalogue/hidden\nAllow: /tie\nDisallow: /tie';
  assert.equal(ok(r, '/shop/basket'), false);
  assert.equal(ok(r, '/shop/catalogue/lamps'), true);
  assert.equal(ok(r, '/shop/catalogue/hidden/x'), false);
  assert.equal(ok(r, '/tie/page'), true);
  assert.equal(ok(r, '/other'), true);
  assert.equal(ok(r, '/robots.txt'), true);
  assert.equal(ok('User-agent: *\nDisallow:', '/anything'), true, 'empty Disallow matches nothing');
  assert.equal(ok('User-agent: *\nDisallow: /', '/'), false);
});

test('parser: * wildcards, $ anchors and query strings', () => {
  const r = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /drafts/*/edit\nDisallow: /*?session=\nAllow: /drafts/public*';
  assert.equal(ok(r, '/files/plan.pdf'), false);
  assert.equal(ok(r, '/files/plan.pdf?v=2'), true, '$ anchors at the end of path+query');
  assert.equal(ok(r, '/files/plan.pdfx'), true);
  assert.equal(ok(r, '/drafts/42/edit'), false);
  assert.equal(ok(r, '/drafts/publicnote/edit'), true, 'longer Allow pattern beats the wildcard Disallow');
  assert.equal(ok(r, '/list?page=2&session=abc'), true, 'pattern needs ?session= right after the path');
  assert.equal(ok(r, '/list?session=abc'), false);
  assert.equal(ok('User-agent: *\nDisallow: /a.b+c', '/aXb+c'), true, 'regex specials are literal');
  assert.equal(ok('User-agent: *\nDisallow: /a.b+c', '/a.b+cd'), false);
});

test('parser: group selection, UIAtlas group overrides *, multiple agents per group, merged groups', () => {
  const r = `User-agent: *\nDisallow: /\n\nUser-agent: OtherBot\nUser-Agent: uiatlas/2.0\nDisallow: /private\nCrawl-delay: 3\n\nUser-agent: UIATLAS\nDisallow: /tmp`;
  const p = parseRobots(r);
  assert.equal(p.groups.length, 3);
  assert.deepEqual(p.groups[1].agents, ['otherbot', 'uiatlas']);
  assert.equal(isAllowed(p, '/home', 'UIAtlas'), true);
  assert.equal(isAllowed(p, '/private/x', 'UIAtlas'), false);
  assert.equal(isAllowed(p, '/tmp/x', 'UIAtlas'), false, 'groups for the same agent are combined');
  assert.equal(isAllowed(p, '/home', 'SomeoneElse'), false, 'falls back to *');
  assert.equal(ok('User-agent: OtherBot\nDisallow: /', '/x'), true, 'no matching group → allowed');
  assert.equal(ok('Disallow: /\nUser-agent: *\nAllow: /', '/x'), true, 'rules before any user-agent are ignored');
});

test('parser: comments, CRLF, BOM, odd case and whitespace', () => {
  const r = '\uFEFF# site rules\r\nUser-agent: * # everyone\r\n\r\n  DISALLOW :  /secret   # keep out\r\nallow: /secret/ok\r\nSitemap: https://example.test/s.xml\r\n';
  assert.equal(ok(r, '/secret/file'), false);
  assert.equal(ok(r, '/secret/ok'), true);
  assert.equal(ok(r, '/open'), true);
});

test('parser: percent-encoding normalisation', () => {
  const r = 'User-agent: *\nDisallow: /caf%c3%a9\nDisallow: /%7Euser\nDisallow: /a%2fb\nDisallow: /spaced name';
  assert.equal(ok(r, '/café/menu'), false, 'raw UTF-8 path vs encoded pattern');
  assert.equal(ok(r, '/caf%C3%A9'), false, 'escape case is ignored');
  assert.equal(ok(r, '/~user/home'), false, 'escaped unreserved char equals the literal');
  assert.equal(ok(r, '/a%2Fb'), false);
  assert.equal(ok(r, '/a/b'), true, '%2F is reserved and stays distinct from /');
  assert.equal(ok(r, '/spaced%20name'), false);
});

test('parser: crawl-delay read from the matched group', () => {
  const p = parseRobots('User-agent: *\nCrawl-delay: 2.5\nDisallow: /x');
  assert.equal(p.groups[0].crawlDelay, 2.5);
});

test('userAgentSuffix names the tool, version and project URL', () => {
  assert.match(userAgentSuffix, /^UIAtlas\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/jgt87\/UIAtlas\)$/);
});

// Local servers on port 0, one per robots.txt behaviour (each is its own origin).
function serve(handler) {
  const seen = [];
  const server = http.createServer((req, res) => { seen.push({ url: req.url, ua: req.headers['user-agent'] }); handler(req, res); });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise(c => { server.closeAllConnections?.(); server.close(c); }) })));
}
const robotsServer = (status, body = '', delay = 0) => serve((req, res) => setTimeout(() => {
  if (req.url !== '/robots.txt') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(body);
}, delay));

test('gate: 200 rules are applied, robots.txt fetched once, User-Agent identifies the tool', async () => {
  const s = await robotsServer(200, 'User-agent: *\nDisallow: /private\n');
  try {
    const g = createGate({ delayMs: 0 });
    assert.deepEqual(await g.allow(`${s.base}/public/page`), { ok: true });
    const no = await g.allow(`${s.base}/private/page?x=1`);
    assert.equal(no.ok, false); assert.match(no.reason, /disallowed by robots\.txt/);
    await g.allow(`${s.base}/private/two`);
    assert.equal(s.seen.filter(r => r.url === '/robots.txt').length, 1);
    assert.match(s.seen[0].ua, /UIAtlas/);
    const host = new URL(s.base).host;
    assert.deepEqual(g.notes(), [`robots.txt disallows 2 URL(s) on ${host}`]);
    assert.ok(!g.notes().join(' ').includes('/private'), 'notes carry no paths');
  } finally { await s.close(); }
});

test('gate: 404 → everything allowed; 500 → everything disallowed', async () => {
  const a = await robotsServer(404), b = await robotsServer(500);
  try {
    const g = createGate({ delayMs: 0 });
    assert.equal((await g.allow(`${a.base}/any`)).ok, true);
    const r = await g.allow(`${b.base}/any`);
    assert.equal(r.ok, false); assert.match(r.reason, /unreachable \(HTTP 500\).*full disallow/);
    assert.ok(g.notes().some(n => /unreachable \(HTTP 500\).*1 URL\(s\) skipped/.test(n)));
  } finally { await a.close(); await b.close(); }
});

test('gate: slow robots.txt times out → disallowed; network error → disallowed', async () => {
  const s = await robotsServer(200, 'User-agent: *\nAllow: /', 1000);
  try {
    const g = createGate({ delayMs: 0, timeoutMs: 100 });
    const t = Date.now(), r = await g.allow(`${s.base}/page`);
    assert.ok(Date.now() - t < 900, 'gave up at the timeout');
    assert.equal(r.ok, false); assert.match(r.reason, /timed out/);
    const dead = await serve(() => {}); const deadBase = dead.base; await dead.close();
    const n = await g.allow(`${deadBase}/page`);
    assert.equal(n.ok, false); assert.match(n.reason, /unreachable/);
  } finally { await s.close(); }
});

test('gate: ignoreRobots and non-http URLs are always allowed without fetching', async () => {
  const s = await robotsServer(200, 'User-agent: *\nDisallow: /');
  try {
    assert.deepEqual(await createGate({ ignoreRobots: true }).allow(`${s.base}/x`), { ok: true });
    assert.equal(s.seen.length, 0);
    const g = createGate();
    assert.deepEqual(await g.allow('file:///C:/somewhere/index.html'), { ok: true });
    assert.equal(await g.wait('file:///C:/somewhere/index.html'), undefined);
    assert.equal((await g.allow('not a url')).ok, false);
  } finally { await s.close(); }
});

test('pacing: same origin waits ≥ delay, other origins do not, Crawl-delay is honoured and capped', async () => {
  const a = await robotsServer(404), b = await robotsServer(404), c = await robotsServer(200, 'User-agent: UIAtlas\nCrawl-delay: 0.3\n'), d = await robotsServer(200, 'User-agent: *\nCrawl-delay: 120');
  try {
    const g = createGate({ delayMs: 150 });
    let t = Date.now(); await g.wait(`${a.base}/1`); const t1 = Date.now(); assert.ok(t1 - t < 100, 'first request does not wait');
    await g.wait(`${b.base}/1`); assert.ok(Date.now() - t1 < 100, 'other origin does not wait');
    await g.wait(`${a.base}/2`); const t2 = Date.now(); assert.ok(t2 - t1 >= 140, 'same origin waits the delay');
    await Promise.all([g.wait(`${a.base}/3`), g.wait(`${a.base}/4`)]); assert.ok(Date.now() - t2 >= 290, 'concurrent calls queue up');

    await g.wait(`${c.base}/1`); t = Date.now(); await g.wait(`${c.base}/2`);
    assert.ok(Date.now() - t >= 290, 'Crawl-delay above delayMs wins');
    assert.equal(await g.crawlDelay(`${d.base}/x`), 30);
    const host = h => new URL(h).host, notes = g.notes();
    assert.ok(notes.includes(`Crawl-delay of 0.3 s honoured on ${host(c.base)}`));
    assert.ok(notes.includes(`Crawl-delay of 120 s on ${host(d.base)} capped at 30 s`));
  } finally { for (const s of [a, b, c, d]) await s.close(); }
});
