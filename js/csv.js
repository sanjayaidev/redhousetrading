/* CSV backup / bulk-edit helpers for the admin. Pure functions, no DOM; exposed as globalThis.RHCSV.
 *
 * File layout (one header row, then one row per setting / service / product):
 *   type,id,key,value,title,summary,description,points,price,image
 *   setting rows : key + value            (e.g. contact.phone)
 *   service rows : id,title,summary,description,points   (points: one per line, "Heading: details")
 *   product rows : id,title,description,price,image
 */
(function () {
  'use strict';

  const COLS = ['type', 'id', 'key', 'value', 'title', 'summary', 'description', 'points', 'price', 'image'];

  const KEYS = [
    'settings.title', 'settings.tagline', 'settings.logoUrl',
    'theme.accent', 'theme.background', 'theme.surface', 'theme.text',
    'contact.address', 'contact.phone', 'contact.mobile', 'contact.email', 'contact.hours', 'contact.mapPointer', 'contact.mapUrl',
    'home.headline', 'home.sub', 'home.cta', 'home.overviewTitle',
    'contactPage.headline',
    'about.legacyTitle', 'about.legacy', 'about.nextTitle', 'about.next', 'about.futureTitle', 'about.future', 'about.mission', 'about.vision'
  ];
  const URL_KEYS = ['settings.logoUrl', 'contact.mapUrl'];

  const KINDS = {
    service: { list: 'services', prefix: 'svc', nameKey: 'title', cap: 30, cols: { title: 'title', summary: 'summary', description: 'description', points: 'points' } },
    product: { list: 'products', prefix: 'prd', nameKey: 'name', cap: 100, cols: { title: 'name', description: 'description', price: 'price', image: 'image' } }
  };

  const HEX = /^#[0-9a-f]{6}$/i;
  const okUrl = (v) => v === '' || /^https?:\/\//i.test(v) || (v[0] === '/' && v[1] !== '/');
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const slug = (v) => String(v || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const genId = (prefix) => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- points <-> text ---------- */
  function formatPoints(points) {
    return (points || []).map((p) => (p.title ? `${p.title}: ${p.text}` : p.text)).join('\n');
  }
  function parsePoints(text) {
    return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const k = l.indexOf(':');
      return k > 0 && k < 80 ? { title: l.slice(0, k).trim(), text: l.slice(k + 1).trim() } : { title: '', text: l };
    });
  }

  /* ---------- writing ---------- */
  // Cells starting with = + - @ would be run as formulas by Excel; a leading ' defuses them (removed again on import).
  function cell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const line = (obj) => COLS.map((c) => cell(obj[c])).join(',');

  function toCSV(d) {
    const out = [COLS.join(',')];
    KEYS.forEach((key) => out.push(line({ type: 'setting', key, value: getPath(d, key) || '' })));
    (d.services || []).forEach((s) => out.push(line({ type: 'service', id: s.id, title: s.title, summary: s.summary, description: s.description, points: formatPoints(s.points) })));
    (d.products || []).forEach((p) => out.push(line({ type: 'product', id: p.id, title: p.name, description: p.description, price: p.price, image: p.image })));
    return '﻿' + out.join('\r\n') + '\r\n'; // BOM so Excel opens it as UTF-8
  }

  /* ---------- reading ---------- */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const nl = text.search(/\r|\n/);
    const head = nl < 0 ? text : text.slice(0, nl);
    // Excel in some regions saves with ; or tabs instead of commas
    const delim = [',', ';', '\t'].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], c = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; }
        else c += ch;
      } else if (ch === '"' && c === '') q = true;
      else if (ch === delim) { row.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(c); c = ''; rows.push(row); row = [];
      } else c += ch;
    }
    if (c !== '' || row.length) { row.push(c); rows.push(row); }
    return rows;
  }

  function toRecords(rows) {
    if (!rows.length) throw new Error('The file is empty.');
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/^name$/, 'title'));
    if (!head.includes('type')) throw new Error('This does not look like a site CSV: the first row must contain a "type" column. Download a CSV from this page to see the format.');
    const recs = [];
    rows.slice(1).forEach((r, idx) => {
      if (r.every((x) => !String(x).trim())) return;
      const rec = { _line: idx + 2 };
      COLS.forEach((c) => {
        const i = head.indexOf(c);
        let v = i >= 0 && r[i] != null ? String(r[i]) : '';
        if (/^'[=+\-@\t\r]/.test(v)) v = v.slice(1); // undo formula guard
        rec[c] = v.trim();
      });
      rec.type = rec.type.toLowerCase();
      recs.push(rec);
    });
    return recs;
  }

  /* ---------- applying ---------- */
  // mode 'merge'  : adds/updates; blank cells keep the existing value; nothing is removed.
  // mode 'replace': cells are applied exactly (blank clears); services/products missing from the file are removed
  //                 (only when the file contains at least one row of that kind). Settings not in the file stay as they are.
  function apply(current, records, mode) {
    const replace = mode === 'replace';
    const d = JSON.parse(JSON.stringify(current || {}));
    ['settings', 'theme', 'contact', 'home', 'about', 'contactPage'].forEach((k) => { d[k] = d[k] || {}; });
    d.services = d.services || []; d.products = d.products || [];
    const warnings = [];
    const stats = { settings: 0, service: { added: 0, updated: 0, removed: 0 }, product: { added: 0, updated: 0, removed: 0 } };
    const use = (v) => replace || v !== '';

    // settings
    records.filter((r) => r.type === 'setting').forEach((r) => {
      const key = r.key.trim();
      if (!KEYS.includes(key)) { warnings.push(`Row ${r._line}: unknown setting "${key}" was skipped.`); return; }
      const v = r.value;
      if (!use(v)) return;
      if (key.startsWith('theme.') && !HEX.test(v)) { warnings.push(`Row ${r._line}: ${key} must be a colour like #b91c1c (got "${v}"), skipped.`); return; }
      if (URL_KEYS.includes(key) && !okUrl(v)) { warnings.push(`Row ${r._line}: ${key} must start with http:// or https://, skipped.`); return; }
      if (key === 'settings.title' && !v) { warnings.push(`Row ${r._line}: the site title cannot be empty, skipped.`); return; }
      const parts = key.split('.');
      const obj = d[parts[0]];
      if (obj[parts[1]] !== v) { obj[parts[1]] = v; stats.settings++; }
    });

    // services & products
    records.filter((r) => !['setting', 'service', 'product'].includes(r.type))
      .forEach((r) => warnings.push(`Row ${r._line}: unknown type "${r.type}" was skipped.`));

    Object.entries(KINDS).forEach(([type, k]) => {
      const recs = records.filter((r) => r.type === type);
      if (!recs.length) { if (replace) warnings.push(`No ${type} rows in the file, so your ${k.list} were left unchanged.`); return; }
      const items = d[k.list];
      const used = new Set(items.map((x) => x.id));
      const order = [], seen = new Set();

      recs.forEach((r) => {
        const id = slug(r.id), title = r.title;
        let item = id ? items.find((x) => x.id === id) : null;
        if (!item && !id && title) item = items.find((x) => String(x[k.nameKey]).trim().toLowerCase() === title.toLowerCase());
        let isNew = false;
        if (!item) {
          if (!title) { warnings.push(`Row ${r._line}: ${type} has no title, skipped.`); return; }
          let nid = id && !used.has(id) ? id : genId(k.prefix);
          used.add(nid);
          item = { id: nid, [k.nameKey]: '', ...(type === 'service' ? { summary: '', description: '', points: [] } : { description: '', price: '', image: '' }) };
          items.push(item); isNew = true;
        }
        Object.entries(k.cols).forEach(([col, prop]) => {
          const v = r[col];
          if (!use(v)) return;
          if (col === 'image' && !okUrl(v)) { warnings.push(`Row ${r._line}: image must start with http:// or https://, skipped.`); return; }
          item[prop] = col === 'points' ? parsePoints(v) : v;
        });
        if (!seen.has(item.id)) { seen.add(item.id); order.push(item); stats[type][isNew ? 'added' : 'updated']++; }
      });

      if (replace) {
        stats[type].removed = items.filter((x) => !seen.has(x.id)).length;
        d[k.list] = order;
      }
      if (d[k.list].length > k.cap) {
        warnings.push(`Only the first ${k.cap} ${k.list} are kept (limit).`);
        d[k.list] = d[k.list].slice(0, k.cap);
      }
    });

    return { data: d, stats, warnings };
  }

  globalThis.RHCSV = { COLS, KEYS, toCSV, parseCSV, toRecords, apply, formatPoints, parsePoints };
})();
