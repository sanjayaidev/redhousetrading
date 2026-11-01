import { verifyRequest, saveImage, StorageError, method } from './_lib.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!verifyRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  const { contentType, data } = req.body || {};
  if (typeof data !== 'string' || typeof contentType !== 'string') {
    return res.status(400).json({ error: 'Missing image data' });
  }
  try {
    const buf = Buffer.from(data, 'base64');
    if (!buf.length || buf.length > 3_000_000) return res.status(413).json({ error: 'Image must be under 3 MB' });
    const url = await saveImage(buf, contentType);
    res.status(200).json({ url });
  } catch (e) {
    const status = e instanceof StorageError ? 503 : 400;
    res.status(status).json({ error: e.message || 'Upload failed' });
  }
}
