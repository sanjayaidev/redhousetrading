import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put, get } from '@vercel/blob';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_KEY = 'site-data.json';
const LOCAL_DIR = path.join(ROOT, '.data');
// Blob is available with either the classic token or the newer store-id + OIDC setup.
const hasBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const onVercel = () => !!process.env.VERCEL;
// Must match how the Blob store was created. Private is the default for new stores;
// set BLOB_ACCESS=public in Vercel only if your store is Public.
const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';

/* ---------------- auth ---------------- */
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const secret = () => sha('rh-admin-token:' + (process.env.ADMIN_PASS || ''));
const b64u = (b) => Buffer.from(b).toString('base64url');

export function adminConfigured() {
  return !!process.env.ADMIN_PASS;
}

export function checkPassword(input) {
  if (!adminConfigured()) return false;
  return crypto.timingSafeEqual(sha(input || ''), sha(process.env.ADMIN_PASS));
}

export function signToken(hours = 12) {
  const payload = b64u(JSON.stringify({ exp: Date.now() + hours * 3600_000 }));
  const sig = b64u(crypto.createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyRequest(req) {
  if (!adminConfigured()) return false;
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = b64u(crypto.createHmac('sha256', secret()).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

/* ---------------- storage ---------------- */
async function readSeed() {
  return JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'site.json'), 'utf8'));
}

export async function readSite() {
  try {
    if (hasBlob()) {
      const r = await get(DATA_KEY, { access: ACCESS, useCache: false });
      if (r && r.stream) return JSON.parse(await new Response(r.stream).text());
    } else if (!onVercel()) {
      return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, 'site.json'), 'utf8'));
    }
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.error('readSite:', e.message);
  }
  return readSeed();
}

export class StorageError extends Error {}

export async function writeSite(data) {
  const body = JSON.stringify(data, null, 2);
  if (hasBlob()) {
    await put(DATA_KEY, body, {
      access: ACCESS,
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60
    });
  } else if (!onVercel()) {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    await fs.writeFile(path.join(LOCAL_DIR, 'site.json'), body);
  } else {
    throw new StorageError('Storage is not set up. Add a Blob store to this Vercel project (Storage tab) and redeploy.');
  }
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

export async function saveImage(buffer, contentType) {
  const ext = EXT[contentType];
  if (!ext) throw new Error('Unsupported image type');
  const name = `uploads/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  if (hasBlob()) {
    const r = await put(name, buffer, { access: ACCESS, contentType, addRandomSuffix: false });
    // Private blobs have no public URL, so they are served through /api/image.
    return ACCESS === 'public' ? r.url : '/api/image?p=' + encodeURIComponent(name);
  }
  if (!onVercel()) {
    const file = path.join(LOCAL_DIR, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
    return '/' + name;
  }
  throw new StorageError('Storage is not set up. Add a Blob store to this Vercel project (Storage tab) and redeploy.');
}

// Streams an uploaded image from a private store (used by /api/image).
export async function readImage(pathname) {
  if (!hasBlob() || !/^uploads\/[A-Za-z0-9._-]+$/.test(pathname)) return null;
  try {
    const r = await get(pathname, { access: ACCESS });
    return r && r.stream ? r : null;
  } catch {
    return null;
  }
}

/* ---------------- validation ---------------- */
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const hex = (v, fallback) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback);
const url = (v) => {
  const s = str(v, 2000);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return /^https?:\/\//i.test(s) ? s : '';
};
const id = (v) => str(v, 40).replace(/[^a-zA-Z0-9_-]/g, '') || crypto.randomBytes(4).toString('hex');

export function sanitizeSite(input, current) {
  const i = input && typeof input === 'object' ? input : {};
  const cur = current || {};
  const out = { ...cur };

  const s = i.settings || {};
  out.settings = {
    title: str(s.title, 80) || 'My Company',
    tagline: str(s.tagline, 160),
    logoUrl: url(s.logoUrl)
  };

  const t = i.theme || {};
  const ct = cur.theme || {};
  out.theme = {
    accent: hex(t.accent, ct.accent || '#b91c1c'),
    background: hex(t.background, ct.background || '#faf7f5'),
    surface: hex(t.surface, ct.surface || '#ffffff'),
    text: hex(t.text, ct.text || '#1f1a17')
  };

  const c = i.contact || {};
  out.contact = {
    address: str(c.address, 300),
    phone: str(c.phone, 40),
    mobile: str(c.mobile, 40),
    email: str(c.email, 120),
    hours: str(c.hours, 200),
    mapUrl: url(c.mapUrl),
    mapPointer: str(c.mapPointer, 200)
  };

  // Page copy (editable via CSV import). Missing fields keep their current value.
  const PAGE_COPY = {
    home: ['headline', 'sub', 'cta', 'overviewTitle'],
    contactPage: ['headline'],
    about: ['legacyTitle', 'legacy', 'nextTitle', 'next', 'futureTitle', 'future', 'mission', 'vision']
  };
  for (const [sec, keys] of Object.entries(PAGE_COPY)) {
    const inp = i[sec] && typeof i[sec] === 'object' ? i[sec] : {};
    out[sec] = { ...(cur[sec] || {}) };
    for (const k of keys) if (typeof inp[k] === 'string') out[sec][k] = str(inp[k], 2000);
  }

  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  out.services = list(i.services, 30).map((x) => ({
    id: id(x.id),
    title: str(x.title, 100) || 'Untitled service',
    summary: str(x.summary, 300),
    description: str(x.description, 1200),
    points: list(x.points, 12).map((p) => ({ title: str(p.title, 100), text: str(p.text, 400) })).filter((p) => p.title || p.text)
  }));
  out.products = list(i.products, 100).map((x) => ({
    id: id(x.id),
    name: str(x.name, 100) || 'Untitled product',
    description: str(x.description, 800),
    price: str(x.price, 40),
    image: url(x.image)
  }));
  return out;
}

/* ---------------- http helpers ---------------- */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function method(req, res, m) {
  if (req.method !== m) {
    res.setHeader('Allow', m);
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}
