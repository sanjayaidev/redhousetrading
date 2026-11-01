/* Public site: loads content from /api/content (falls back to /data/site.json) and renders the page. */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const page = document.body.dataset.page || 'home';

  async function load() {
    try {
      const r = await fetch('/api/content');
      if (!r.ok) throw new Error('api');
      return await r.json();
    } catch (_) {
      const r = await fetch('/data/site.json');
      return r.json();
    }
  }

  /* ---------- theme ---------- */
  function readableOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#1a1a1a' : '#ffffff';
  }

  function applyTheme(t) {
    const root = document.documentElement.style;
    if (!t) return;
    root.setProperty('--accent', t.accent);
    root.setProperty('--bg', t.background);
    root.setProperty('--surface', t.surface);
    root.setProperty('--text', t.text);
    root.setProperty('--accent-ink', readableOn(t.accent));
  }

  /* ---------- helpers ---------- */
  const telHref = (v) => 'tel:' + String(v).replace(/[^\d+]/g, '');
  const waHref = (v) => 'https://wa.me/' + String(v).replace(/\D/g, '');

  function mapEmbed(c) {
    if (c.mapUrl && /\/maps\/embed|output=embed/.test(c.mapUrl)) return c.mapUrl;
    if (c.mapPointer) return 'https://maps.google.com/maps?q=' + encodeURIComponent(c.mapPointer) + '&z=15&output=embed';
    return '';
  }
  function mapLink(c) {
    if (c.mapUrl && !/\/maps\/embed|output=embed/.test(c.mapUrl)) return c.mapUrl;
    if (c.mapPointer) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.mapPointer);
    return '';
  }

  /* ---------- chrome (header/footer) ---------- */
  function renderChrome(d) {
    const s = d.settings;
    document.title = page === 'home' ? `${s.title}${s.tagline ? ' — ' + s.tagline : ''}` : `${titleFor(page)} | ${s.title}`;
    const desc = $('meta[name="description"]');
    if (desc && s.tagline) desc.content = `${s.title} — ${s.tagline}`;

    // favicon follows the logo when one is set
    if (s.logoUrl) {
      let ic = $('link[rel="icon"]');
      if (!ic) { ic = document.createElement('link'); ic.rel = 'icon'; document.head.appendChild(ic); }
      ic.href = s.logoUrl;
    }

    const links = [['home', '/', 'Home'], ['about', '/about', 'About'], ['services', '/services', 'Services']];
    if ((d.products || []).length) links.push(['products', '/products', 'Products']);
    links.push(['contact', '/contact', 'Contact']);

    const brand = s.logoUrl
      ? `<img src="${esc(s.logoUrl)}" alt="${esc(s.title)} logo">`
      : `<span class="mark">${esc(s.title.trim().charAt(0).toUpperCase())}</span><span>${esc(s.title)}</span>`;

    $('#site-header').innerHTML = `
      <header class="site-header"><div class="wrap">
        <a class="brand" href="/" aria-label="${esc(s.title)} home">${brand}</a>
        <button class="menu-btn" aria-label="Menu" aria-expanded="false">☰</button>
        <nav class="nav" id="nav">${links.map(([k, h, l]) => `<a href="${h}" class="${k === page ? 'on' : ''}">${l}</a>`).join('')}</nav>
      </div></header>`;
    const btn = $('.menu-btn'), nav = $('#nav');
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });

    const c = d.contact;
    $('#site-footer').innerHTML = `
      <footer class="site-footer"><div class="wrap">
        <div><strong style="font-family:var(--serif);font-size:1.1rem">${esc(s.title)}</strong>
          ${s.tagline ? `<p>${esc(s.tagline)}</p>` : ''}
          <p>© ${new Date().getFullYear()} ${esc(s.title)}. All rights reserved.</p></div>
        <div class="links">${links.map(([, h, l]) => `<a href="${h}">${l}</a>`).join('')}</div>
        ${c.email || c.phone || c.mobile ? `<div><p>${[c.phone && `<a href="${telHref(c.phone)}">${esc(c.phone)}</a>`, c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`].filter(Boolean).join('<br>')}</p></div>` : ''}
      </div></footer>`;
  }

  function titleFor(p) {
    return { about: 'About Us', services: 'Services', products: 'Products', contact: 'Contact' }[p] || '';
  }

  /* ---------- pages ---------- */
  const pages = {
    home(d) {
      const h = d.home;
      return `
      <section class="hero"><div class="wrap">
        <span class="eyebrow">${esc(d.settings.title)}</span>
        <h1>${esc(h.headline)}</h1>
        <p class="lead">${esc(h.sub)}</p>
        <a class="btn primary" href="/services">${esc(h.cta)} →</a>
      </div></section>
      <section class="block"><div class="wrap">
        <div class="section-head"><span class="eyebrow">What we do</span><h2>${esc(h.overviewTitle)}</h2></div>
        <div class="grid cols-2">
          ${(d.services || []).map((s, i) => `
            <a class="card" href="/services#${esc(s.id)}">
              <span class="num">${String(i + 1).padStart(2, '0')}</span>
              <h3>${esc(s.title)}</h3>
              <p>${esc(s.summary || s.description)}</p>
            </a>`).join('')}
        </div>
      </div></section>`;
    },

    about(d) {
      const a = d.about;
      const block = (t, x) => (t || x) ? `<div class="prose"><h2>${esc(t)}</h2><p>${esc(x)}</p></div>` : '';
      return `
      <section class="page-title"><div class="wrap"><span class="eyebrow">About us</span><h1>${esc(a.legacyTitle)}</h1></div></section>
      <section class="block" style="padding-top:1.5rem"><div class="wrap">
        <div class="prose"><p style="font-size:1.1rem">${esc(a.legacy)}</p></div>
        <div style="height:2.2rem"></div>
        ${block(a.nextTitle, a.next)}${block(a.futureTitle, a.future)}
      </div></section>
      ${(a.mission || a.vision) ? `<section class="block"><div class="wrap">
        <div class="section-head"><span class="eyebrow">Corporate pillars</span></div>
        <div class="pillars">
          ${a.mission ? `<div class="pillar"><h3>Our Mission</h3><p>${esc(a.mission)}</p></div>` : ''}
          ${a.vision ? `<div class="pillar"><h3>Our Vision</h3><p>${esc(a.vision)}</p></div>` : ''}
        </div></div></section>` : ''}`;
    },

    services(d) {
      const list = d.services || [];
      return `
      <section class="page-title"><div class="wrap"><span class="eyebrow">Services</span><h1>Four divisions, one standard.</h1></div></section>
      <section class="block" style="padding-top:1rem"><div class="wrap">
        ${list.length ? list.map((s, i) => `
          <article class="service" id="${esc(s.id)}">
            <div><span class="idx">${String(i + 1).padStart(2, '0')}</span><h2>${esc(s.title)}</h2>
              <p style="margin-top:.8rem">${esc(s.description)}</p></div>
            <ul class="points">${(s.points || []).map((p) => `<li><strong>${esc(p.title)}</strong>${p.title && p.text ? ' — ' : ''}${esc(p.text)}</li>`).join('')}</ul>
          </article>`).join('') : '<div class="empty"><p>Services will be listed here soon.</p></div>'}
      </div></section>`;
    },

    products(d) {
      const list = d.products || [];
      return `
      <section class="page-title"><div class="wrap"><span class="eyebrow">Products</span><h1>Our products</h1></div></section>
      <section class="block" style="padding-top:1rem"><div class="wrap">
        ${list.length ? `<div class="grid cols-3">${list.map((p) => `
          <article class="card product">
            <div class="img">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : '▦'}</div>
            <div class="body"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>${p.price ? `<div class="price">${esc(p.price)}</div>` : ''}</div>
          </article>`).join('')}</div>` : '<div class="empty"><p>Products will be listed here soon.</p></div>'}
      </div></section>`;
    },

    contact(d) {
      const c = d.contact;
      const embed = mapEmbed(c), link = mapLink(c);
      const rows = [
        ['Headquarters', c.address && esc(c.address)],
        ['Telephone', c.phone && `<a href="${telHref(c.phone)}">${esc(c.phone)}</a>`],
        ['Mobile / WhatsApp', c.mobile && `<a href="${waHref(c.mobile)}" target="_blank" rel="noopener">${esc(c.mobile)}</a>`],
        ['Email', c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`],
        ['Office hours', c.hours && esc(c.hours)]
      ].filter((r) => r[1]);
      const divisions = (d.services || []).map((s) => `<option>${esc(s.title)}</option>`).join('');
      return `
      <section class="page-title"><div class="wrap"><span class="eyebrow">Contact</span><h1>${esc(d.contactPage.headline)}</h1></div></section>
      <section class="block" style="padding-top:1.5rem"><div class="wrap contact-grid">
        <form class="card" id="contact-form">
          <label>Full name / Company name<input name="name" required autocomplete="name"></label>
          <label>Select division<select name="division"><option value="">General enquiry</option>${divisions}</select></label>
          <div class="row2">
            <label>Email address<input name="email" type="email" required autocomplete="email"></label>
            <label>Phone number<input name="phone" type="tel" autocomplete="tel"></label>
          </div>
          <label>Message / RFP details<textarea name="message" required></textarea></label>
          <button class="btn primary" type="submit">Send message</button>
          <p class="note" id="form-note"></p>
        </form>
        <div>
          ${rows.length ? `<ul class="details card">${rows.map(([k, v]) => `<li><small>${k}</small>${v}</li>`).join('')}</ul>` : '<div class="empty"><p>Contact details coming soon.</p></div>'}
          ${embed ? `<div class="map"><iframe src="${esc(embed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map"></iframe>
            ${link ? `<div class="bar"><a class="btn ghost" href="${esc(link)}" target="_blank" rel="noopener">Get directions ↗</a></div>` : ''}</div>` : ''}
        </div>
      </div></section>`;
    }
  };

  function wireContactForm(d) {
    const form = $('#contact-form');
    if (!form) return;
    const c = d.contact, note = $('#form-note');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const body = `Name: ${f.name}\nDivision: ${f.division || 'General enquiry'}\nEmail: ${f.email}\nPhone: ${f.phone || '-'}\n\n${f.message}`;
      if (c.email) {
        location.href = `mailto:${c.email}?subject=${encodeURIComponent('Enquiry — ' + (f.division || 'General'))}&body=${encodeURIComponent(body)}`;
        note.textContent = 'Opening your email app…';
      } else if (c.mobile) {
        window.open(`${waHref(c.mobile)}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
        note.textContent = 'Opening WhatsApp…';
      } else {
        note.textContent = 'Contact details have not been set up yet. Please try again later.';
      }
    });
  }

  /* ---------- boot ---------- */
  load().then((d) => {
    applyTheme(d.theme);
    renderChrome(d);
    const render = pages[page] || pages.home;
    $('#app').innerHTML = render(d);
    if (page === 'contact') wireContactForm(d);
    if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
  }).catch(() => {
    $('#app').innerHTML = '<div class="loading">Sorry, this page could not be loaded. Please refresh.</div>';
  });
})();
