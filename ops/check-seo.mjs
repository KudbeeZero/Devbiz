// Sitemap + robots check: what we ask search engines to index must be real, allowed and complete.
//   node ops/check-seo.mjs   → check (exit 1 on any problem)
// 0. robots.txt blocks the private paths and leaves the public site open
// 1. every sitemap <loc> is a file on disk
// 2. no sitemap URL is blocked by robots.txt (RFC 9309 matching: `*` and `$`, longest rule wins, Allow wins a tie)
// 3. no sitemap URL carries a noindex robots meta, and a page's canonical (if it has one) is its sitemap URL
// 4. every page the home page links to is in the sitemap, unless robots.txt blocks it or it is noindex
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://devbiz.kudbee.workers.dev';
const read = f => readFileSync(resolve(ROOT, f), 'utf8');
const problems = [];

// the file a site path is served from (a folder serves its index.html)
const fileOf = (path) => { let p = decodeURIComponent(path.split(/[?#]/)[0]).replace(/^\/+/, ''); if (p === '' || p.endsWith('/')) p += 'index.html'; return p; };
const isFile = f => existsSync(resolve(ROOT, f)) && statSync(resolve(ROOT, f)).isFile();

// robots.txt: the rules of the `User-agent: *` group
const rules = [];
{ let star = false;
  for (const raw of read('robots.txt').split('\n')) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const [k, ...v] = line.split(':'), key = k.trim().toLowerCase(), val = v.join(':').trim();
    if (key === 'user-agent') star = val === '*';
    else if (star && (key === 'allow' || key === 'disallow') && val) rules.push({ allow: key === 'allow', path: val });
  } }
const toRe = p => new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\?\$$/, '$'));
const allowed = (path) => {
  let best = null;
  for (const r of rules) if (toRe(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  return !best || best.allow;
};
// robots.txt itself: the private paths stay blocked and the public site stays open (the `$` rules must anchor at the end of the URL)
for (const [path, want] of [['/CLAUDE.md', false], ['/games/README.md', false], ['/wrangler.toml', false], ['/docs/BUILD_LEDGER.md', false], ['/lab/grow/', false],
  ['/', true], ['/games/kudbee-abyss/index.html', true], ['/lab/aether-wing/index.html', true], ['/llms.txt', true], ['/blog/', true]])
  if (allowed(path) !== want) problems.push(`robots.txt: ${path} should be ${want ? 'allowed' : 'blocked'}`);
const meta = (html, re) => (html.match(re) || [])[1] || '';
const noindex = html => /noindex/i.test(meta(html, /<meta\s+name="robots"\s+content="([^"]*)"/i));
const canonical = html => meta(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i);

// the sitemap
const xml = read('sitemap.xml'), locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
if (!/<urlset[^>]*>[\s\S]*<\/urlset>\s*$/.test(xml)) problems.push('sitemap.xml: no closing </urlset>');
if ((xml.match(/<url>/g) || []).length !== locs.length || (xml.match(/<\/url>/g) || []).length !== locs.length) problems.push('sitemap.xml: unbalanced <url> entries');
const listed = new Set();
for (const loc of locs) {
  if (!loc.startsWith(ORIGIN + '/')) { problems.push(`sitemap: ${loc} is not on ${ORIGIN}`); continue; }
  const path = loc.slice(ORIGIN.length), file = fileOf(path);
  if (listed.has(file)) problems.push(`sitemap: ${loc} is listed twice`);
  listed.add(file);
  if (!isFile(file)) { problems.push(`sitemap: ${loc} has no file on disk (${file})`); continue; }
  if (!allowed(path)) problems.push(`sitemap: ${loc} is blocked by robots.txt`);
  if (/\.html$/.test(file)) {
    const html = read(file), can = canonical(html);
    if (noindex(html)) problems.push(`sitemap: ${loc} is marked noindex`);
    if (can && can !== loc) problems.push(`sitemap: ${loc} declares a different canonical (${can})`);
  }
}

// every page the home page links to
const home = read('index.html');
const links = [...new Set([...home.matchAll(/href="([^"#?]+)"/g)].map(m => m[1]))]
  .filter(h => !/^(https?:|mailto:|tel:|data:|javascript:)/.test(h) && (/\.html$/.test(h) || h.endsWith('/')))
  .map(h => '/' + h.replace(/^\.?\//, ''));
for (const path of links) {
  const file = fileOf(path); if (file === 'index.html' || !isFile(file) || !allowed(path)) continue;
  if (noindex(read(file))) continue;
  if (!listed.has(file)) problems.push(`sitemap: the home page links to ${path}, which is missing from sitemap.xml`);
}

if (problems.length) { console.error('SEO check: ' + problems.length + ' problem(s)\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`SEO check: ${locs.length} sitemap URLs, every one on disk, allowed by robots.txt and indexable; every page the home page links to is listed`);
