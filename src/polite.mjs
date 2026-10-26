// Polite crawling: robots.txt (RFC 9309) per origin and request pacing. createGate() answers allow(url) and wait(url)
// for the crawl loop; non-http(s) URLs (file:, data:) are never checked or paced. Unreachable robots.txt (5xx, network
// error, timeout) means "assume complete disallow" for that origin, as the RFC asks; 4xx means no restrictions.
import { readFileSync } from 'node:fs';

const version = (() => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch { return '0'; } })();
export const userAgentSuffix = `UIAtlas/${version} (+https://github.com/jgt87/UIAtlas)`;

const MAX_BYTES = 500 * 1024, DELAY_CAP_S = 30;
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
  const groups = []; let cur = null, inRules = false;
  for (const raw of String(text).slice(0, MAX_BYTES).replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 1) continue;
    const key = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!cur || inRules) { cur = { agents: [], rules: [] }; groups.push(cur); inRules = false; }
      const t = agentToken(val); if (t) cur.agents.push(t);
    } else if (key === 'allow' || key === 'disallow') {
      if (!cur) continue; inRules = true;
      if (val) cur.rules.push({ allow: key === 'allow', pattern: norm(val) });
    } else if (key === 'crawl-delay') {
      if (!cur) continue; inRules = true;
      const n = parseFloat(val); if (n >= 0 && isFinite(n)) cur.crawlDelay = n;
    }
  }
  return { groups };
}

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
  for (const r of g.rules) if (toRegex(r.pattern).test(path) && (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow))) best = r;
  return !best || best.allow;
}

export function createGate({ ignoreRobots = false, delayMs = 1000, userAgent = 'UIAtlas', timeoutMs = 10000 } = {}) {
  const ua = agentToken(userAgent) === 'uiatlas' ? userAgentSuffix : `${userAgent} ${userAgentSuffix}`;
  const robots = new Map(), done = new Map(), next = new Map(), blocked = new Map(), skipped = new Map();
  const parse = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u : null; } catch { return undefined; } };

  // Per origin: { status: 'ok'|'none'|'unreachable', rules?, reason?, crawlDelay?, capped? } (promise, fetched once)
  const load = u => {
    if (!robots.has(u.origin)) robots.set(u.origin, (async () => {
      try {
        const res = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
        if (res.status >= 500) { res.body?.cancel().catch(() => {}); return { status: 'unreachable', reason: `HTTP ${res.status}` }; }
        if (!res.ok) { res.body?.cancel().catch(() => {}); return { status: 'none' }; }
        const rules = parseRobots(await res.text()), d = groupFor(rules, userAgent)?.crawlDelay;
        return { status: 'ok', rules, crawlDelay: d != null ? Math.min(d, DELAY_CAP_S) : undefined, capped: d > DELAY_CAP_S ? d : undefined };
      } catch (e) {
        return { status: 'unreachable', reason: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `timed out after ${Math.round(timeoutMs / 100) / 10} s` : 'network error' };
      }
    })().then(r => (done.set(u.host, r), r)));
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
    const d = await crawlDelay(url), gap = Math.max(delayMs, (d || 0) * 1000), now = Date.now();
    const at = next.has(u.origin) ? Math.max(now, next.get(u.origin)) : now;
    next.set(u.origin, at + gap); // reserve the slot before sleeping so concurrent callers queue up
    if (at > now) await new Promise(ok => setTimeout(ok, at - now));
  }

  // Human-readable notes for project.notes (hosts only; no paths or page content).
  function notes() {
    const out = [];
    if (ignoreRobots) out.push('robots.txt was not checked (ignoreRobots)');
    for (const [host, r] of done) {
      if (r.status === 'unreachable') out.push(`robots.txt on ${host} was unreachable (${r.reason}); treated as full disallow, ${skipped.get(host) || 0} URL(s) skipped`);
      if (r.crawlDelay) out.push(r.capped ? `Crawl-delay of ${r.capped} s on ${host} capped at ${DELAY_CAP_S} s` : `Crawl-delay of ${r.crawlDelay} s honoured on ${host}`);
    }
    for (const [host, n] of blocked) out.push(`robots.txt disallows ${n} URL(s) on ${host}`);
    return out;
  }

  return { allow, wait, crawlDelay, notes };
}
