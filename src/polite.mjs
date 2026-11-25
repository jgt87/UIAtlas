// Polite crawling: robots.txt (RFC 9309) per origin and request pacing. createGate() answers allow(url) and wait(url)
// for the crawl loop; non-http(s) URLs (file:, data:) are never checked or paced. Unreachable robots.txt (5xx, network
// error, timeout) means "assume complete disallow" for that origin, as the RFC asks; 4xx means no restrictions.
import { readFileSync } from 'node:fs';

const version = (() => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')).version; } catch { return '0'; } })(); // BOM stripped
export const userAgentSuffix = `UIAtlas/${version} (+https://github.com/jgt87/UIAtlas)`;

const MAX_BYTES = 500 * 1024, DELAY_CAP_S = 30;
const NBSP = ' '; // between a number and its unit in the notes the viewer shows, so they never wrap apart
const UNRESERVED = /[A-Za-z0-9\-._~]/;

// Percent-encoding normalisation: escapes upper-cased, escaped unreserved chars decoded, non-ASCII/space/control encoded.
function norm(s) {
  let out = '';
  for (const ch of s) out += /[\x21-\x7e]/.test(ch) ? ch : encodeURIComponent(ch);
  return out.replace(/%([0-9a-fA-F]{2})/g, (_, h) => { const c = String.fromCharCode(parseInt(h, 16)); return UNRESERVED.test(c) ? c : '%' + h.toUpperCase(); });
}
const agentToken = v => (v.match(/^[A-Za-z_*-]+/)?.[0] || '').toLowerCase();

// → { groups: [{ agents: [lowercase tokens], rules: [{ allow, pattern }], crawlDelay? }] }
export function parseRobots(text = '') {
  const st = { groups: [], cur: null, inRules: false };
  for (const raw of String(text).slice(0, MAX_BYTES).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const d = directive(raw);
    if (d && Object.hasOwn(DIRECTIVES, d.key)) DIRECTIVES[d.key](st, d.val, d.key); // hasOwn: a line "constructor: x" is no directive
  }
  return { groups: st.groups };
}
// 'Key: value # comment' -> { key (lowercase), val }, or null for a blank, comment-only or malformed line
function directive(raw) {
  const line = raw.replace(/#.*/, '').trim(); if (!line) return null;
  const i = line.indexOf(':'); if (i < 1) return null;
  return { key: line.slice(0, i).trim().toLowerCase(), val: line.slice(i + 1).trim() };
}
// A user-agent line after rules starts a new group; rules before any user-agent line belong to no group.
const rule = (st, val, key) => { if (!st.cur) return; st.inRules = true; if (val) st.cur.rules.push({ allow: key === 'allow', pattern: norm(val) }); };
const DIRECTIVES = {
  'user-agent': (st, val) => {
    if (!st.cur || st.inRules) { st.cur = { agents: [], rules: [] }; st.groups.push(st.cur); st.inRules = false; }
    const t = agentToken(val); if (t) st.cur.agents.push(t);
  },
  allow: rule,
  disallow: rule,
  'crawl-delay': (st, val) => {
    if (!st.cur) return; st.inRules = true;
    const n = parseFloat(val); if (n >= 0 && isFinite(n)) st.cur.crawlDelay = n;
  },
};

// Rules for an agent: all groups naming it (combined), else all '*' groups, else none.
function groupFor(robots, agent = 'UIAtlas') {
  const a = agentToken(agent), gs = robots?.groups || [];
  let hit = gs.filter(g => g.agents.includes(a)); if (!hit.length) hit = gs.filter(g => g.agents.includes('*'));
  if (!hit.length) return null;
  const d = hit.map(g => g.crawlDelay).filter(n => n != null);
  return { rules: hit.flatMap(g => g.rules), crawlDelay: d.length ? Math.max(...d) : undefined };
}

const reCache = new Map();
function toRegex(p) {
  let re = reCache.get(p); if (re) return re;
  const anchored = p.endsWith('$'), body = anchored ? p.slice(0, -1) : p;
  re = new RegExp('^' + body.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  reCache.set(p, re); return re;
}

// Longest matching pattern wins; equal length → Allow. /robots.txt itself is always allowed.
export function isAllowed(robots, pathWithQuery = '/', agent = 'UIAtlas') {
  const path = norm(pathWithQuery || '/');
  if (path === '/robots.txt') return true;
  const g = groupFor(robots, agent); if (!g) return true;
  let best = null;
  for (const r of g.rules) if (toRegex(r.pattern).test(path) && beats(r, best)) best = r;
  return !best || best.allow;
}
// a matching rule wins over the best so far when its pattern is longer, or as long and an Allow
const beats = (r, best) => !best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow);

// One origin's robots.txt -> { status: 'ok'|'none'|'unreachable', rules?, reason?, crawlDelay?, capped? }. Never throws.
async function fetchRobots(origin, { ua, userAgent, timeoutMs }) {
  try {
    const res = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (!res.ok) res.body?.cancel().catch(() => {});
    if (res.status >= 500) return { status: 'unreachable', reason: `HTTP ${res.status}` };
    if (!res.ok) return { status: 'none' };
    return robotsFound(parseRobots(await res.text()), userAgent);
  } catch (e) {
    return { status: 'unreachable', reason: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `timed out after ${Math.round(timeoutMs / 100) / 10}${NBSP}s` : 'network error' };
  }
}
// a parsed robots.txt with its Crawl-delay for this agent, capped at DELAY_CAP_S (capped: the asked value)
function robotsFound(rules, userAgent) {
  const d = groupFor(rules, userAgent)?.crawlDelay;
  return { status: 'ok', rules, crawlDelay: d != null ? Math.min(d, DELAY_CAP_S) : undefined, capped: d > DELAY_CAP_S ? d : undefined };
}

// `now` and `sleep` are injectable so tests check the pacing by the waits it asks for, not by a clock.
const realSleep = ms => new Promise(ok => setTimeout(ok, ms));
export function createGate({ ignoreRobots = false, delayMs = 1000, userAgent = 'UIAtlas', timeoutMs = 10000, now: clock = Date.now, sleep = realSleep } = {}) {
  const ua = agentToken(userAgent) === 'uiatlas' ? userAgentSuffix : `${userAgent} ${userAgentSuffix}`;
  const robots = new Map(), done = new Map(), next = new Map(), blocked = new Map(), skipped = new Map();
  const parse = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u : null; } catch { return undefined; } };

  // Per origin: { status: 'ok'|'none'|'unreachable', rules?, reason?, crawlDelay?, capped? } (promise, fetched once)
  const load = u => {
    if (!robots.has(u.origin)) robots.set(u.origin, fetchRobots(u.origin, { ua, userAgent, timeoutMs }).then(r => (done.set(u.host, r), r)));
    return robots.get(u.origin);
  };

  async function allow(url) {
    const u = parse(url);
    if (u === undefined) return { ok: false, reason: 'invalid URL' };
    if (!u || ignoreRobots) return { ok: true };
    const r = await load(u);
    const deny = (m, reason) => { m.set(u.host, (m.get(u.host) || 0) + 1); return { ok: false, reason }; };
    if (r.status === 'unreachable') return deny(skipped, `robots.txt on ${u.host} unreachable (${r.reason}); treated as full disallow`);
    if (r.status === 'ok' && !isAllowed(r.rules, u.pathname + u.search, userAgent)) return deny(blocked, `disallowed by robots.txt on ${u.host}`);
    return { ok: true };
  }

  // Seconds of Crawl-delay in force for the URL's origin (capped), or undefined; resolves robots.txt if needed.
  async function crawlDelay(url) {
    const u = parse(url); if (!u || ignoreRobots) return undefined;
    return (await load(u)).crawlDelay;
  }

  async function wait(url) {
    const u = parse(url); if (!u) return;
    const d = await crawlDelay(url), gap = Math.max(delayMs, (d || 0) * 1000), now = clock();
    const at = next.has(u.origin) ? Math.max(now, next.get(u.origin)) : now;
    next.set(u.origin, at + gap); // reserve the slot before sleeping so concurrent callers queue up
    if (at > now) await sleep(at - now);
  }

  // Human-readable notes for project.notes (hosts only; no paths or page content).
  function notes() {
    const out = [];
    if (ignoreRobots) out.push('robots.txt was not checked (ignoreRobots)');
    for (const [host, r] of done) {
      if (r.status === 'unreachable') out.push(`robots.txt on ${host} was unreachable (${r.reason}); treated as full disallow, ${skipped.get(host) || 0} URL(s) skipped`);
      if (r.crawlDelay) out.push(r.capped ? `Crawl-delay of ${r.capped}${NBSP}s on ${host} capped at ${DELAY_CAP_S}${NBSP}s` : `Crawl-delay of ${r.crawlDelay}${NBSP}s honoured on ${host}`);
    }
    for (const [host, n] of blocked) out.push(`robots.txt disallows ${n} URL(s) on ${host}`);
    return out;
  }

  return { allow, wait, crawlDelay, notes };
}
