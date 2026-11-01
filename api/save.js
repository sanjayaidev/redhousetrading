import { verifyRequest, readSite, writeSite, sanitizeSite, StorageError, method } from './_lib.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!verifyRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  try {
    const current = await readSite();
    const clean = sanitizeSite(req.body, current);
    await writeSite(clean);
    res.status(200).json({ ok: true, site: clean });
  } catch (e) {
    const status = e instanceof StorageError ? 503 : 500;
    res.status(status).json({ error: e.message || 'Save failed' });
  }
}
