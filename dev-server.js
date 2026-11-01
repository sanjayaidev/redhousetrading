// Local development server that mimics Vercel: static files, clean URLs and /api/* handlers.
// Usage:  ADMIN_PASS=secret npm run dev      (saves to ./.data instead of Vercel Blob)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const BLOCKED = /^\/(_legacy|\.data|node_modules|api\/_|\.git|dev-server|package|\.env)/;

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function serveFile(res, file) {
  const buf = await fs.readFile(file);
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(buf);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(u.pathname);
  try {
    if (p.startsWith('/api/')) {
      const name = p.slice(5).replace(/[^a-z0-9-]/gi, '');
      const mod = await import(pathToFileURL(path.join(ROOT, 'api', name + '.js')).href).catch(() => null);
      if (!mod) { res.writeHead(404); return res.end('Not found'); }
      req.body = req.method === 'POST' ? await readBody(req) : {};
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      return await mod.default(req, res);
    }
    if (p.startsWith('/uploads/')) {
      const f = path.join(ROOT, '.data', path.normalize(p));
      if (!f.startsWith(path.join(ROOT, '.data'))) throw new Error('bad path');
      return await serveFile(res, f);
    }
    if (BLOCKED.test(p)) { res.writeHead(404); return res.end('Not found'); }
    if (p === '/') p = '/index';
    let file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) throw new Error('bad path');
    if (!path.extname(file)) file += '.html';
    await serveFile(res, file);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('Not found'); }
    console.error(e);
    res.writeHead(500); res.end('Server error');
  }
}).listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}  (admin: /admin)`));
