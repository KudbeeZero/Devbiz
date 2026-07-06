// Tiny dependency-free static file server used only by the Playwright smoke
// suite (DBZ-059, Polish Lane 12). Serves the repo root exactly like
// Cloudflare Pages does (root = site root), with correct content-types for
// every extension the home page actually references — getting a MIME type
// wrong here would show up as a false-positive console error in the smoke
// test, so this list is deliberately complete for index.html's own assets
// (fonts, avif/webp/jpg art, css, js, svg/ico/png icons) rather than generic.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/**
 * Starts a static file server rooted at `rootDir`.
 * Returns { server, url, close() }.
 */
export function startServer(rootDir, port = 0) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      let reqPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (reqPath.endsWith('/')) reqPath += 'index.html';
      const filePath = path.join(root, reqPath);
      // Path-traversal guard: resolved path must stay inside root.
      if (!filePath.startsWith(root)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          // Serve 404.html for missing pages if present, else a plain 404 —
          // mirrors Cloudflare Pages' root-404 behavior close enough for tests.
          const notFoundPage = path.join(root, '404.html');
          fs.readFile(notFoundPage, (e2, nfData) => {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(e2 ? 'Not found' : nfData);
          });
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    } catch (e) {
      res.writeHead(500); res.end('Server error: ' + e.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Allow running this file directly for manual debugging: `node server.mjs [port]`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..');
  const port = Number(process.argv[2]) || 4173;
  startServer(repoRoot, port).then(({ url }) => console.log('Serving', repoRoot, 'at', url));
}
