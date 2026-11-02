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

| Backup / CSV | Download everything as a CSV; upload a CSV to restore or bulk-edit (see below) |

Empty contact fields are hidden on the site.

## Backup, restore and bulk edit (CSV)

Open **Backup / CSV** in the admin.

- **Download CSV** exports the site title, tagline, logo link, theme colours, contact details, map, page text, all services and all products.
- **Upload a CSV** shows a preview of what will change, then **Apply to editor**; nothing goes live until you press **Save changes**.
  - **Merge**: adds and updates the rows in the file. Blank cells keep the current value; nothing is deleted. Use it to add products or services in bulk.
  - **Replace**: makes the site match the file. Blank cells are cleared and services/products missing from the file are removed (a list is only replaced if the file has at least one row of that kind). Use it to restore a backup after a redeploy or when moving to a new Vercel project.

Format: one header row `type,id,key,value,title,summary,description,points,price,image`, then one row per item. `setting` rows use `key` + `value`; `service` rows use `id,title,summary,description,points` (points one per line as `Heading: details`); `product` rows use `id,title,description,price,image`. Leave `id` blank for new items; a row whose title matches an existing item updates it rather than duplicating it. Excel and Google Sheets files work (save as **CSV UTF-8**; `;` and tab separators are detected). Phone numbers and other cells starting with `+ - = @` are exported with a leading `'` so spreadsheets do not treat them as formulas; the import removes it.

Images are stored as links, not inside the CSV. If you move to a new Blob store, re-upload the logo and product images.

## Deploy on Vercel

1. Push this folder to GitHub and import the repo in Vercel (framework preset: **Other**, no build command).
2. **Environment variable:** Project → Settings → Environment Variables → add `ADMIN_PASS` (a long passphrase).
3. **Storage:** Project → Storage → Create → **Blob** → connect it to the project. This adds `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN`) automatically. Private stores work (uploaded images are served through `/api/image`); if your store is **Public**, also add the environment variable `BLOB_ACCESS=public`. (Vercel's filesystem is read-only, so Blob is where admin edits and uploaded images are saved.)
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
- **Page copy** (home headline, About text, mission/vision) has no form in the admin; change it by editing the `home.*`, `about.*` and `contactPage.*` rows of the CSV and uploading it, or by editing `data/site.json` (the starting content used before the first save).
- `_legacy/` holds the files from the original repo; it is excluded from deployment (`.vercelignore`) and can be deleted.
