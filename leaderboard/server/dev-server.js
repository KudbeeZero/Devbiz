/* =====================================================================
 * Kudbee Leaderboard — server/dev-server.js
 * A dependency-free Node server that runs the EXACT same API as the
 * Cloudflare Worker (shared/* ), backed by a JSON file. It also serves:
 *   /            -> the leaderboard page (public/)
 *   /game/*      -> the Kudbee Darts game (../../games/kudbee-darts) so the
 *                   page can read the local profile same-origin for testing
 * Run:  npm run dev   (PORT, DATA_FILE, CLERK_* via env)
 *
 * For production on a Node host, put this behind your existing static server
 * or run it as the API origin and point public/config.js API_BASE at it.
 * ===================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { createFileStore } from './store-file.js';
import { runApi, corsHeaders } from '../shared/http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const GAME = join(ROOT, '..', 'games', 'kudbee-darts');
const PORT = process.env.PORT || 8787;
const DATA_FILE = process.env.DATA_FILE || join(ROOT, '.data', 'leaderboard.json');

const env = process.env;
const store = createFileStore(DATA_FILE);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

async function serveStatic(res, baseDir, relPath, fallback) {
  let p = normalize(join(baseDir, relPath));
  if (!p.startsWith(baseDir)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch (_) {
    if (fallback) return serveStatic(res, baseDir, fallback);
    res.writeHead(404); res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const origin = req.headers.origin;
  const cors = corsHeaders(origin, '*');

  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let body = null;
    if (req.method === 'POST') { try { body = JSON.parse(await readBody(req)); } catch (_) { body = null; } }
    const { status, body: out } = await runApi(store, env, {
      method: req.method, path: url.pathname, query: url.searchParams,
      headers: req.headers, body,
    });
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...cors });
    return res.end(JSON.stringify(out));
  }

  // Static: the game under /game/*, the shared client SDK under /client/*,
  // everything else from public/. (The page references ../client/... which
  // resolves to /client/... here and to /leaderboard/client/... on Cloudflare.)
  if (url.pathname.startsWith('/game/')) {
    return serveStatic(res, GAME, url.pathname.replace('/game/', '') || 'index.html');
  }
  if (url.pathname.startsWith('/client/')) {
    return serveStatic(res, join(ROOT, 'client'), url.pathname.replace('/client/', ''));
  }
  const rel = url.pathname === '/' ? 'leaderboard.html' : url.pathname.slice(1);
  return serveStatic(res, PUBLIC, rel, 'leaderboard.html');
});

server.listen(PORT, () => {
  console.log(`Kudbee Leaderboard dev server → http://localhost:${PORT}`);
  console.log(`  API:   http://localhost:${PORT}/api/health`);
  console.log(`  Page:  http://localhost:${PORT}/`);
  console.log(`  Game:  http://localhost:${PORT}/game/`);
  console.log(`  Data:  ${DATA_FILE}  (demo mode: ${demoStatus()})`);
});

function demoStatus() {
  return (!env.CLERK_PUBLISHABLE_KEY && !env.CLERK_ISSUER) ? 'ON (keyless)' : (env.ALLOW_DEMO ? 'ON' : 'off');
}
