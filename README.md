# Red House Trading — static site + admin

A static website (plain HTML/CSS/JS) for Vercel, with a password-protected admin at `/admin`.

## What the admin can change

| Tab | Controls |
|---|---|
| Site & logo | Site title, tagline, logo upload (also used as the browser tab icon) |
| Theme | Accent, page background, card surface and text colours, with live preview |
| Contact & map | Address, phone, mobile/WhatsApp, email, hours, **map pointer** (coordinates or address → pin on the embedded map) and **map link** (used for "Get directions") |
| Services | Add, remove, reorder, edit (title, summary, description, key points) |
| Products | Add, remove, reorder, edit (name, description, price, image). The Products menu link appears once there is at least one product |

Empty contact fields are hidden on the site.

## Deploy on Vercel

1. Push this folder to GitHub and import the repo in Vercel (framework preset: **Other**, no build command).
2. **Environment variable:** Project → Settings → Environment Variables → add `ADMIN_PASS` (a long passphrase).
3. **Storage:** Project → Storage → Create → **Blob** → choose **Public** access → connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically. (Vercel's filesystem is read-only, so Blob is where admin edits and uploaded images are saved.)
4. Redeploy, then open `/admin` and sign in.

Changing `ADMIN_PASS` later signs everyone out.

## How it works

- Pages are static HTML. `js/site.js` loads `/api/content` and renders the page, applying theme colours, logo and title.
- Until the first save, content comes from `data/site.json` (the text from the Word document). The first save writes `site-data.json` to Blob; after that Blob is the source of truth, and edits show on the site within a few seconds.
- `/api/login` checks `ADMIN_PASS` (constant-time) and returns a 12-hour signed token. `/api/save` and `/api/upload` reject requests without a valid token, and the server validates everything it stores (hex colours, `http(s)` URLs only, length limits).
- Admin (`/admin`) is `noindex` and sends `no-store`.

## Run locally

```bash
npm install
ADMIN_PASS=secret npm run dev      # http://localhost:3000  ·  admin at /admin
```

Locally, edits are saved to `./.data` (git-ignored) instead of Blob. You can also use `vercel dev`.

## Notes

- **Contact form:** it opens the visitor's email app (to the address set in admin), or WhatsApp if only a mobile number is set. It does not store messages on a server.
- **Page copy** (home headline, About text, mission/vision) lives in `data/site.json` and is not editable from the admin; edit that file and redeploy to change it.
- `_legacy/` holds the files from the original repo; it is excluded from deployment (`.vercelignore`) and can be deleted.
