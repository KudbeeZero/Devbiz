// Loads every game page under the CSP that _headers sets for /games/* and lists what it would block.
// Run from the repo root: `npm run games:csp`. The policy is read from _headers, so this tests the real one.
// Report-only: the page still runs; a violation is a thing to widen the policy for, or a hole to fix.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const hdr = readFileSync(join(ROOT, '_headers'), 'utf8');
const m = hdr.match(/^\/games\/\*\s*\n\s*Content-Security-Policy-Report-Only:\s*(.+)$/m);
if (!m) { console.log('FAIL no /games/* Content-Security-Policy-Report-Only in _headers'); process.exit(1); }
const POLICY = m[1].trim();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

const srv = http.createServer((q, r) => {
  let p = join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(ROOT) || !existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'content-security-policy-report-only': POLICY });
  r.end(readFileSync(p));
}).listen(0);
const base = 'http://localhost:' + srv.address().port;

const games = readdirSync(join(ROOT, 'games')).filter(g => existsSync(join(ROOT, 'games', g, 'index.html')));
const launch = { headless: true, args: ['--no-sandbox'] };
if (existsSync('/opt/pw-browsers/chromium')) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);
let bad = 0;
// every script/stylesheet a page pulls from another site must carry an integrity hash (a tampered CDN copy is refused)
for (const g of games) {
  const html = readFileSync(join(ROOT, 'games', g, 'index.html'), 'utf8');
  for (const t of html.match(/<(?:script|link)\b[^>]*>/gi) || []) {
    const ext = /(?:src|href)\s*=\s*["']https?:\/\//i.test(t) && /<script|rel=["']stylesheet/i.test(t) && !/fonts\.googleapis\.com/.test(t);
    if (ext && !/\bintegrity\s*=/.test(t)) { bad++; console.log('NO-SRI   ', g, t.slice(0, 120)); }
  }
}
for (const g of games) {
  const page = await browser.newPage();
  const seen = new Map(); let cdnDown = false;
  page.on('requestfailed', q => { if (/cdnjs\.cloudflare\.com/.test(q.url())) cdnDown = true; });
  await page.exposeFunction('__csp', (d, b) => { seen.set(d + ' ' + b, 1); });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__csp(e.violatedDirective, e.blockedURI || e.sample || 'inline')));
  await page.goto(`${base}/games/${g}/`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.mouse.click(200, 200).catch(() => {});
  await page.waitForTimeout(800);
  // 'inline' is expected and allowed by the policy; anything listed here is outside it
  const list = [...seen.keys()];
  if (g === 'kudbee-abyss') { const ok = await page.evaluate(() => typeof window.THREE !== 'undefined').catch(() => false); if (!ok && cdnDown) console.log('   (abyss: cdnjs unreachable from here - three.js integrity not exercised; static SRI check still ran)'); else if (!ok) list.push('three.js was fetched but refused: its integrity hash no longer matches'); }
  if (list.length) { bad++; console.log('VIOLATION', g, '\n   ' + list.join('\n   ')); } else console.log('clean    ', g);
  await page.close();
}
await browser.close(); srv.close();
console.log(bad ? `\n${bad}/${games.length} games would trigger reports` : `\nall ${games.length} games clean under the /games/* policy`);
process.exit(bad ? 1 : 0);
