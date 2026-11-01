import { readSite } from './_lib.js';

export default async function handler(req, res) {
  const site = await readSite();
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10');
  res.status(200).json(site);
}
