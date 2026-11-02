import { Readable } from 'node:stream';
import { readImage, method } from './_lib.js';

// Serves images uploaded to a private Blob store.
export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  const r = await readImage(String(req.query?.p || ''));
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', r.blob.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Uploaded SVGs must never run scripts when opened directly.
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.status(200);
  Readable.fromWeb(r.stream).pipe(res);
}
