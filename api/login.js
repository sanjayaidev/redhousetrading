import { adminConfigured, checkPassword, signToken, sleep, method } from './_lib.js';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!adminConfigured()) {
    return res.status(503).json({ error: 'ADMIN_PASS is not set. Add it in your Vercel project environment variables and redeploy.' });
  }
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!checkPassword(password)) {
    await sleep(800);
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.status(200).json({ token: signToken(12) });
}
