(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const DEFAULT_THEME = { accent: '#b91c1c', background: '#faf7f5', surface: '#ffffff', text: '#1f1a17' };
  const S = { token: sessionStorage.getItem('rh_token') || '', data: null, dirty: false, tab: 'site', csvMode: 'merge', csvPlan: null };

  /* ---------- small utilities ---------- */
  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), bad ? 5000 : 2600);
  }
  function setDirty(v) { S.dirty = v; $('#dirty').hidden = !v; }
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'); const last = ks.pop();
    ks.reduce((a, k) => a[k], o)[last] = v;
  }

  function tokenValid(t) {
    try { return JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).exp > Date.now(); } catch (_) { return false; }
  }

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.token) headers.Authorization = 'Bearer ' + S.token;
    const r = await fetch(path, { ...opts, headers });
    let j = {};
    try { j = await r.json(); } catch (_) { /* non-JSON */ }
    if (r.status === 401 && path !== '/api/login') {
      signOut('Session expired. Please sign in again.');
      throw new Error('Session expired');
    }
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  }

  /* ---------- auth ---------- */
  function showLogin(msg) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-err').textContent = msg || '';
    $('#pw').value = '';
    $('#pw').focus();
  }
  function signOut(msg) {
    S.token = ''; sessionStorage.removeItem('rh_token'); S.data = null; S.csvPlan = null; setDirty(false);
    showLogin(msg);
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn');
    btn.disabled = true; $('#login-err').textContent = '';
    try {
      const j = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
      S.token = j.token; sessionStorage.setItem('rh_token', j.token);
      await enter();
    } catch (err) {
      $('#login-err').textContent = err.message;
    } finally { btn.disabled = false; }
  });

  $('#logout').addEventListener('click', () => {
    if (S.dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    signOut();
  });

  async function enter() {
    const r = await fetch('/api/content');
    const d = await r.json();
    d.settings = d.settings || {}; d.theme = { ...DEFAULT_THEME, ...(d.theme || {}) };
    d.contact = d.contact || {}; d.services = d.services || []; d.products = d.products || [];
    S.data = d;
    $('#login').hidden = true; $('#app').hidden = false;
    setDirty(false);
    render();
  }

  /* ---------- rendering ---------- */
  function field(label, path, o = {}) {
    const v = esc(getPath(S.data, path) || '');
    const hint = o.hint ? `<small>${o.hint}</small>` : '';
    const ph = o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : '';
    if (o.area) return `<label>${label}<textarea data-bind="${path}"${ph} ${o.rows ? `rows="${o.rows}"` : ''}>${v}</textarea>${hint}</label>`;
    return `<label>${label}<input type="${o.type || 'text'}" data-bind="${path}" value="${v}"${ph}>${hint}</label>`;
  }

  function colorField(label, key) {
    const v = S.data.theme[key];
    return `<label>${label}<span class="colorpair">
      <input type="color" data-bind="theme.${key}" value="${v}" aria-label="${label} picker">
      <input type="text" data-bind="theme.${key}" value="${v}" maxlength="7" spellcheck="false" aria-label="${label} hex">
    </span></label>`;
  }

  const panels = {
    site() {
      const s = S.data.settings;
      return `
      <section class="card"><h2>Site identity</h2>
        ${field('Site title', 'settings.title', { hint: 'Shown in the header, footer and browser tab.' })}
        ${field('Tagline', 'settings.tagline', { hint: 'Short line shown next to the title in search results and the footer.' })}
      </section>
      <section class="card"><h2>Logo</h2>
        <div class="logo-row">
          <div class="logo-box" id="logo-box">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" alt="Logo">` : '<span>No logo — showing title</span>'}</div>
          <div class="row-actions">
            <button class="btn ghost" data-act="upload-logo">${s.logoUrl ? 'Replace logo' : 'Upload logo'}</button>
            ${s.logoUrl ? '<button class="btn danger" data-act="clear-logo">Remove</button>' : ''}
          </div>
        </div>
        <p class="hint">PNG with a transparent background works best (SVG, JPG, WebP also fine). It is also used as the browser tab icon. Remember to press <b>Save changes</b>.</p>
      </section>`;
    },

    theme() {
      return `
      <section class="card"><h2>Theme colours</h2>
        <div class="colors">
          ${colorField('Accent (buttons, highlights)', 'accent')}
          ${colorField('Page background', 'background')}
          ${colorField('Card surface', 'surface')}
          ${colorField('Text', 'text')}
        </div>
        <div class="row-actions"><button class="btn ghost" data-act="reset-theme">Reset to default</button></div>
      </section>
      <section class="card"><h2>Preview</h2>
        <div class="preview" id="preview">
          <div class="pv-head">
            <div class="pv-brand" id="pv-brand"></div>
            <div class="pv-nav"><span>Home</span><span>About</span><span>Services</span><span>Contact</span></div>
          </div>
          <div class="pv-body">
            <h3>Building foundations, delivering excellence.</h3>
            <p>This is how text and buttons will look on your site.</p>
            <span class="pv-btn">Explore our divisions</span>
            <div class="pv-card"><b>01</b> &nbsp;A card on the surface colour</div>
          </div>
        </div>
      </section>`;
    },

    contact() {
      return `
      <section class="card"><h2>Contact details</h2>
        ${field('Headquarters address', 'contact.address', { area: true, rows: 2 })}
        <div class="grid2">
          ${field('Main telephone', 'contact.phone', { type: 'tel', placeholder: '+966 12 000 0000' })}
          ${field('Mobile / WhatsApp', 'contact.mobile', { type: 'tel', placeholder: '+966 50 000 0000', hint: 'Used for the WhatsApp link.' })}
        </div>
        <div class="grid2">
          ${field('General enquiry email', 'contact.email', { type: 'email', placeholder: 'info@example.com', hint: 'The contact form opens an email to this address.' })}
          ${field('Office working hours', 'contact.hours', { placeholder: 'Sat–Thu, 8:00–17:00' })}
        </div>
        <p class="hint">Leave a field empty to hide it on the site.</p>
      </section>
      <section class="card"><h2>Map</h2>
        ${field('Map pointer', 'contact.mapPointer', { placeholder: '21.5433, 39.1728   or   Red House Trading, Jeddah', hint: 'Coordinates (latitude, longitude) or a place/address. This drops the pin on the embedded map. Leave empty to hide the map.' })}
        ${field('Map link', 'contact.mapUrl', { type: 'url', placeholder: 'https://maps.app.goo.gl/…', hint: 'Any Google Maps share link. Used for the “Get directions” button. (If you paste a Google “Embed a map” URL here instead, it is shown as the map.)' })}
      </section>`;
    },

    services() {
      const list = S.data.services;
      return `
      <section class="card"><h2>Services <span class="hint">(${list.length})</span></h2>
        <p class="hint">Each service appears on the Home page overview, the Services page, and in the Contact form’s division list.</p>
        ${list.length ? list.map((s, i) => `
        <div class="item">
          <div class="item-head"><strong>Service ${i + 1}</strong>
            <span class="row-actions">
              <button class="btn ghost sm" data-act="up" data-list="services" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="btn ghost sm" data-act="down" data-list="services" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
              <button class="btn danger sm" data-act="del" data-list="services" data-i="${i}">Remove</button>
            </span></div>
          ${field('Title', `services.${i}.title`)}
          ${field('Short summary (Home page)', `services.${i}.summary`, { area: true, rows: 2 })}
          ${field('Description (Services page)', `services.${i}.description`, { area: true, rows: 3 })}
          <label>Key points<textarea data-points="${i}" rows="5">${esc((s.points || []).map((p) => (p.title ? `${p.title}: ${p.text}` : p.text)).join('\n'))}</textarea>
            <small>One per line. Write <b>Heading: details</b> to bold the heading.</small></label>
        </div>`).join('') : '<div class="empty">No services yet.</div>'}
        <div><button class="btn primary" data-act="add-service">+ Add service</button></div>
      </section>`;
    },

    products() {
      const list = S.data.products;
      return `
      <section class="card"><h2>Products <span class="hint">(${list.length})</span></h2>
        <p class="hint">The Products page and menu link appear on the site as soon as there is at least one product.</p>
        ${list.length ? list.map((p, i) => `
        <div class="item">
          <div class="item-head"><strong>Product ${i + 1}</strong>
            <span class="row-actions">
              <button class="btn ghost sm" data-act="up" data-list="products" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="btn ghost sm" data-act="down" data-list="products" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
              <button class="btn danger sm" data-act="del" data-list="products" data-i="${i}">Remove</button>
            </span></div>
          <div class="grid2">
            ${field('Name', `products.${i}.name`)}
            ${field('Price (optional)', `products.${i}.price`, { placeholder: 'SAR 120 / unit' })}
          </div>
          ${field('Description', `products.${i}.description`, { area: true, rows: 3 })}
          <div class="logo-row">
            <div class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="">` : 'No image'}</div>
            <div class="row-actions">
              <button class="btn ghost sm" data-act="upload-product" data-i="${i}">${p.image ? 'Replace image' : 'Upload image'}</button>
              ${p.image ? `<button class="btn danger sm" data-act="clear-product-img" data-i="${i}">Remove image</button>` : ''}
            </div>
          </div>
        </div>`).join('') : '<div class="empty">No products yet.</div>'}
        <div><button class="btn primary" data-act="add-product">+ Add product</button></div>
      </section>`;
    },

    data() {
      const mode = S.csvMode;
      return `
      <section class="card"><h2>Download a backup</h2>
        <p class="hint">Saves everything (site title, theme colours, contact details, page text, services and products) as one CSV file. Keep it safe: after a redeploy, or a move to a new Vercel project, upload it here to restore your site. You can also edit it in Excel or Google Sheets and upload it again to change many things at once.</p>
        <div><button class="btn primary" data-act="csv-download">Download CSV</button></div>
        <p class="hint">Includes any unsaved changes shown in the editor. Image files are not inside the CSV, only their links.</p>
      </section>
      <section class="card"><h2>Upload a CSV</h2>
        <fieldset class="modes">
          <label class="radio"><input type="radio" name="csvmode" value="merge" ${mode === 'merge' ? 'checked' : ''}>
            <span><b>Merge</b>: add and update the rows in the file. Blank cells keep the current value and nothing is deleted. Best for adding items in bulk.</span></label>
          <label class="radio"><input type="radio" name="csvmode" value="replace" ${mode === 'replace' ? 'checked' : ''}>
            <span><b>Replace</b>: make the site match the file. Blank cells are cleared, and services or products that are not in the file are removed. Best for restoring a backup.</span></label>
        </fieldset>
        <div><button class="btn ghost" data-act="csv-upload">Choose CSV file…</button></div>
        ${S.csvPlan ? csvPreview() : ''}
        <p class="hint">Nothing goes live until you press <b>Save changes</b>. Save Excel files as <b>CSV UTF-8</b> so Arabic and other non-English text stays intact.</p>
      </section>
      <section class="card"><h2>File format</h2>
        <p class="hint">The first row is a header. Then one row per item:</p>
        <table class="fmt">
          <tr><th>type</th><th>Columns used</th></tr>
          <tr><td><code>setting</code></td><td><code>key</code>, <code>value</code></td></tr>
          <tr><td><code>service</code></td><td><code>id</code>, <code>title</code>, <code>summary</code>, <code>description</code>, <code>points</code> (one per line, <code>Heading: details</code>)</td></tr>
          <tr><td><code>product</code></td><td><code>id</code>, <code>title</code> (the product name), <code>description</code>, <code>price</code>, <code>image</code> (a link)</td></tr>
        </table>
        <p class="hint">To add a new service or product, leave <code>id</code> blank. A row whose title matches an existing item updates it instead of creating a duplicate.</p>
        <details><summary class="hint">Setting keys</summary><p class="hint keys">${RHCSV.KEYS.map((k) => `<code>${k}</code>`).join(' ')}</p></details>
      </section>`;
    }
  };

  function csvPreview() {
    const p = RHCSV.apply(S.data, S.csvPlan.records, S.csvMode);
    const st = p.stats;
    const lines = [
      `<li><b>${st.settings}</b> setting${st.settings === 1 ? '' : 's'} changed</li>`,
      `<li>Services: <b>${st.service.added}</b> added, <b>${st.service.updated}</b> updated, <b>${st.service.removed}</b> removed</li>`,
      `<li>Products: <b>${st.product.added}</b> added, <b>${st.product.updated}</b> updated, <b>${st.product.removed}</b> removed</li>`
    ];
    const w = p.warnings;
    return `
      <div class="csv-preview">
        <strong>${esc(S.csvPlan.fileName)}</strong>
        <ul>${lines.join('')}</ul>
        ${w.length ? `<div class="warns"><b>${w.length} warning${w.length === 1 ? '' : 's'}</b><ul>${w.slice(0, 15).map((x) => `<li>${esc(x)}</li>`).join('')}${w.length > 15 ? `<li>…and ${w.length - 15} more</li>` : ''}</ul></div>` : ''}
        <div class="row-actions">
          <button class="btn primary" data-act="csv-apply">Apply to editor</button>
          <button class="btn ghost" data-act="csv-cancel">Cancel</button>
        </div>
      </div>`;
  }

  function downloadCSV() {
    const blob = new Blob([RHCSV.toCSV(S.data)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `site-data-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function render() {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    $('#panel').innerHTML = panels[S.tab]();
    if (S.tab === 'theme') updatePreview();
  }

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab; render(); window.scrollTo({ top: 0 });
  });

  /* ---------- theme preview ---------- */
  function readableOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#1a1a1a' : '#ffffff';
  }
  function updatePreview() {
    const el = $('#preview'); if (!el) return;
    const t = S.data.theme, s = S.data.settings;
    el.style.setProperty('--accent', t.accent);
    el.style.setProperty('--bg', t.background);
    el.style.setProperty('--surface', t.surface);
    el.style.setProperty('--text', t.text);
    el.style.setProperty('--ink2', readableOn(t.accent));
    $('#pv-brand').innerHTML = s.logoUrl
      ? `<img src="${esc(s.logoUrl)}" alt="">`
      : `<span class="pv-mark">${esc((s.title || '?').trim().charAt(0).toUpperCase())}</span>${esc(s.title)}`;
  }

  $('#panel').addEventListener('change', (e) => {
    if (e.target.name === 'csvmode') { S.csvMode = e.target.value; render(); }
  });

  /* ---------- input handling ---------- */
  $('#panel').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.points != null) {
      const i = +el.dataset.points;
      S.data.services[i].points = el.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const k = l.indexOf(':');
        return k > 0 && k < 80 ? { title: l.slice(0, k).trim(), text: l.slice(k + 1).trim() } : { title: '', text: l };
      });
      return setDirty(true);
    }
    const path = el.dataset.bind;
    if (!path) return;
    if (path.startsWith('theme.')) {
      const pair = el.closest('.colorpair');
      if (el.type === 'text') {
        if (!/^#[0-9a-f]{6}$/i.test(el.value)) return;
        pair.querySelector('input[type=color]').value = el.value;
      } else {
        pair.querySelector('input[type=text]').value = el.value;
      }
    }
    setPath(S.data, path, el.value);
    setDirty(true);
    if (path.startsWith('theme.') || path.startsWith('settings.')) updatePreview();
  });

  /* ---------- images ---------- */
  function pickFile(accept) {
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept || 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
      i.onchange = () => resolve(i.files[0] || null);
      i.click();
    });
  }
  const toB64 = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
  async function prepare(file, maxDim, keepAlpha) {
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      if (file.size > 2.2e6) throw new Error('Image is too large (max about 2 MB).');
      return { contentType: file.type, data: await toB64(file) };
    }
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(bmp, 0, 0, w, h);
    const type = keepAlpha ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((r) => cv.toBlob(r, type, 0.86));
    return { contentType: type, data: await toB64(blob) };
  }
  async function uploadImage(maxDim, keepAlphaIfPossible) {
    const file = await pickFile();
    if (!file) return null;
    toast('Uploading…');
    const body = await prepare(file, maxDim, keepAlphaIfPossible && file.type !== 'image/jpeg');
    const j = await api('/api/upload', { method: 'POST', body: JSON.stringify(body) });
    toast('Image uploaded. Remember to save.');
    return j.url;
  }

  /* ---------- actions ---------- */
  $('#panel').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act, i = +b.dataset.i, list = b.dataset.list;
    try {
      if (act === 'upload-logo') {
        const url = await uploadImage(600, true);
        if (url) { S.data.settings.logoUrl = url; setDirty(true); render(); }
      } else if (act === 'clear-logo') {
        S.data.settings.logoUrl = ''; setDirty(true); render();
      } else if (act === 'reset-theme') {
        S.data.theme = { ...DEFAULT_THEME }; setDirty(true); render();
      } else if (act === 'add-service') {
        S.data.services.push({ id: uid('svc'), title: 'New service', summary: '', description: '', points: [] });
        setDirty(true); render();
      } else if (act === 'add-product') {
        S.data.products.push({ id: uid('prd'), name: 'New product', description: '', price: '', image: '' });
        setDirty(true); render();
      } else if (act === 'del') {
        const item = S.data[list][i];
        if (!confirm(`Remove “${item.title || item.name}”? This takes effect after you save.`)) return;
        S.data[list].splice(i, 1); setDirty(true); render();
      } else if (act === 'up' || act === 'down') {
        const j = act === 'up' ? i - 1 : i + 1; const arr = S.data[list];
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]]; setDirty(true); render();
      } else if (act === 'upload-product') {
        const url = await uploadImage(1200, false);
        if (url) { S.data.products[i].image = url; setDirty(true); render(); }
      } else if (act === 'clear-product-img') {
        S.data.products[i].image = ''; setDirty(true); render();
      } else if (act === 'csv-download') {
        downloadCSV();
      } else if (act === 'csv-upload') {
        const file = await pickFile('.csv,text/csv,text/plain,application/vnd.ms-excel');
        if (!file) return;
        if (file.size > 2e6) throw new Error('That file is too large (max 2 MB).');
        const records = RHCSV.toRecords(RHCSV.parseCSV(await file.text()));
        if (!records.length) throw new Error('No data rows were found in that file.');
        S.csvPlan = { fileName: file.name, records };
        render();
      } else if (act === 'csv-apply') {
        const plan = RHCSV.apply(S.data, S.csvPlan.records, S.csvMode);
        S.data = plan.data; S.csvPlan = null; setDirty(true); render();
        toast('Imported into the editor. Review it, then press Save changes.');
      } else if (act === 'csv-cancel') {
        S.csvPlan = null; render();
      }
    } catch (err) {
      if (err.message !== 'Session expired') toast(err.message, true);
    }
  });

  $('#save').addEventListener('click', async () => {
    const btn = $('#save');
    if (!(S.data.settings.title || '').trim()) { S.tab = 'site'; render(); return toast('Please enter a site title first.', true); }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const j = await api('/api/save', { method: 'POST', body: JSON.stringify(S.data) });
      S.data = j.site; setDirty(false); render();
      toast('Saved. Your site is updated.');
    } catch (err) {
      if (err.message !== 'Session expired') toast(err.message, true);
    } finally { btn.disabled = false; btn.textContent = 'Save changes'; }
  });

  /* ---------- boot ---------- */
  if (S.token && tokenValid(S.token)) {
    enter().catch(() => showLogin());
  } else {
    S.token = ''; sessionStorage.removeItem('rh_token');
    showLogin();
  }
})();
