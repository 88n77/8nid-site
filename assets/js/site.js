'use strict';
/* 8nID Anty — shared site script: languages, header, menu, reveal, tabs, FAQ, release link, live prices.
   Works on every page (index, account, legal); each block checks that its elements exist. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const local = /^(localhost|127\.|192\.168\.)/.test(location.hostname);
  const qs = new URLSearchParams(location.search);
  // a custom API host is allowed ONLY on a local copy — on the real site it would be a phishing hole
  const API = local ? (qs.get('api') || 'http://127.0.0.1:8080') : 'https://api.8nid.com';

  /* ---------------- languages ---------------- */
  const LANGS = ['uk', 'en', 'pl', 'ru', 'fr', 'pt', 'tr'];
  let lang = 'uk';
  const langCbs = [];
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function tr(k, ...args) {
    const D = window.I18N || {};
    let v = (D[lang] && D[lang][k]) ?? (D.en && D.en[k]) ?? (D.uk && D.uk[k]) ?? '';
    args.forEach((a, i) => { v = v.split('{' + i + '}').join(a); });
    return v;
  }
  function apply(scope = document) {
    $$('[data-t]', scope).forEach(el => {
      const v = tr(el.dataset.t); if (!v) return;
      if (v.includes('\n')) el.innerHTML = esc(v).replace(/\n/g, '<br>'); else el.textContent = v;
    });
    $$('[data-tp]', scope).forEach(el => { const v = tr(el.dataset.tp); if (v) el.placeholder = v; });
    $$('[data-ta]', scope).forEach(el => { const v = tr('@' + el.dataset.ta); if (v) el.setAttribute('aria-label', v); });
    $$('[data-talt]', scope).forEach(el => { const v = tr('@' + el.dataset.talt); if (v) el.alt = v; });
  }
  function setLang(next, save) {
    lang = LANGS.includes(next) ? next : 'uk';
    root.lang = lang;
    apply();
    const meta = (window.I18N_META || {})[lang];
    const page = document.body.dataset.page;
    if (meta && !page) {
      document.title = meta.title;
      $$('meta[name="description"], meta[property="og:description"]').forEach(m => (m.content = meta.description));
      const og = $('meta[property="og:title"]'); if (og) og.content = meta.title;
    } else if (page) {
      const t = tr('title_' + page) || tr({ terms: 'legalTerms', privacy: 'legalPrivacy', rules: 'legalRules' }[page] || '');
      if (t) document.title = t + ' — 8nID Anty Pro';
    }
    const code = $('#langCode'); if (code) code.textContent = lang === 'uk' ? 'UA' : lang.toUpperCase();
    $$('[data-lang]').forEach(b => b.classList.toggle('is-active', b.dataset.lang === lang));
    if (releaseTag) $$('.release-version').forEach(el => (el.textContent = releaseTag));
    // legal pages exist in uk + en only
    const docs = $$('.doc__body[data-l]');
    if (docs.length) {
      const dl = lang === 'uk' ? 'uk' : 'en';
      docs.forEach(d => { d.hidden = d.dataset.l !== dl; });
      const note = $('.doc__langnote'); if (note) note.hidden = lang === 'uk' || lang === 'en';
    } else if ($('.doc__body--uk')) {   // the current edition exists in Ukrainian only until it is approved
      const note = $('.doc__langnote'); if (note) note.hidden = lang === 'uk';
    }
    langCbs.forEach(cb => cb(lang));
    if (save) {
      try { localStorage.setItem('8nid-language', lang); } catch (_) {}
      const u = new URL(location.href); u.searchParams.set('lang', lang);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  }
  function initialLang() {
    const q = qs.get('lang'); if (LANGS.includes(q)) return q;
    try { const s = localStorage.getItem('8nid-language'); if (LANGS.includes(s)) return s; } catch (_) {}
    const nav = (navigator.language || 'uk').slice(0, 2).toLowerCase();
    return LANGS.includes(nav) ? nav : (nav === 'be' ? 'uk' : 'en');
  }

  const langsel = $('#langsel'), langBtn = $('#langBtn');
  if (langsel && langBtn) {
    langBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !langsel.classList.contains('is-open');
      langsel.classList.toggle('is-open', open); langBtn.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', () => { langsel.classList.remove('is-open'); langBtn.setAttribute('aria-expanded', false); });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (b) { setLang(b.dataset.lang, true); }
  });

  /* ---------------- header + mobile menu ---------------- */
  const top = $('#top');
  const onScroll = () => top && top.classList.toggle('is-stuck', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const burger = $('#burger'), mnav = $('#mnav');
  function menu(open) {
    if (!burger || !mnav) return;
    const was = mnav.classList.contains('is-open');
    if (was === open) return;
    mnav.classList.toggle('is-open', open); burger.setAttribute('aria-expanded', open);
    mnav.toggleAttribute('inert', !open);
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-label', tr(open ? '@close' : '@menu') || '');
    if (open) { const f = mnav.querySelector('a'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 60); }
    else burger.focus({ preventScroll: true });
  }
  if (mnav) mnav.setAttribute('inert', '');
  if (burger) burger.addEventListener('click', () => menu(!mnav.classList.contains('is-open')));
  if (mnav) mnav.addEventListener('click', e => { if (e.target.closest('a')) menu(false); });

  // highlight the menu item of the section in view
  const menuLinks = $$('.menu a[href^="#"]');
  if (menuLinks.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      menuLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    menuLinks.forEach(a => { const s = $(a.getAttribute('href')); if (s) io.observe(s); });
  }

  /* ---------------- reveal on scroll ---------------- */
  const anims = $$('[data-anim]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    anims.forEach(el => io.observe(el));
  } else anims.forEach(el => el.classList.add('is-in'));
  function revealTarget(hash) {
    const t = hash && hash.length > 1 && document.getElementById(hash.slice(1));
    if (t) $$('[data-anim]', t).forEach(el => el.classList.add('is-in'));
  }
  document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (a) revealTarget(a.getAttribute('href')); });
  revealTarget(location.hash);

  /* ---------------- tabs ---------------- */
  const tabs = $$('.tab[data-tab]');
  function selectTab(t, focus) {
    const i = t.dataset.tab;
    tabs.forEach(x => { const on = x === t; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
    $$('[data-pane]').forEach(p => { const on = p.dataset.pane === i; p.classList.toggle('is-active', on); p.hidden = !on; });
    $$('[data-vis]').forEach(p => p.classList.toggle('is-active', p.dataset.vis === i));
    if (focus) t.focus();
  }
  tabs.forEach((t, n) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', e => {
      const k = e.key, last = tabs.length - 1;
      const to = k === 'ArrowRight' || k === 'ArrowDown' ? (n + 1) % tabs.length : k === 'ArrowLeft' || k === 'ArrowUp' ? (n + last) % tabs.length
        : k === 'Home' ? 0 : k === 'End' ? last : -1;
      if (to >= 0) { e.preventDefault(); selectTab(tabs[to], true); }
    });
  });

  /* ---------------- FAQ ---------------- */
  $$('.qa > button').forEach(b => b.addEventListener('click', () => {
    const qa = b.parentElement, open = !qa.classList.contains('is-open');
    qa.classList.toggle('is-open', open); b.setAttribute('aria-expanded', open);
  }));

  /* ---------------- latest release (.exe) ---------------- */
  let releaseTag = '';
  if ($('.dl-link') || $('.release-version')) {
    fetch('https://api.github.com/repos/88n77/8nid-anty-pro/releases/latest')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(rel => {
        const exe = (rel.assets || []).find(a => /\.exe$/i.test(a.name));
        if (exe) $$('.dl-link').forEach(a => (a.href = exe.browser_download_url));
        releaseTag = rel.tag_name || '';
        if (releaseTag) $$('.release-version').forEach(el => (el.textContent = releaseTag));
      }).catch(() => {});
  }

  /* ---------------- prices ---------------- */
  // Same table the server starts with; replaced by the live one from /pay/plans when it answers.
  let PLANS = {
    tiers: [
      { code: 'p20', profiles: 20, name: 'Pro 20', usd: 12, sync: false }, { code: 'p50', profiles: 50, name: 'Pro 50', usd: 24 },
      { code: 'p100', profiles: 100, name: 'Pro', usd: 39 }, { code: 'p300', profiles: 300, name: 'Pro+', usd: 89 },
      { code: 'p500', profiles: 500, name: 'Pro Ultra 500', usd: 129 }, { code: 'p1000', profiles: 1000, name: 'Pro Ultra 1000', usd: 199 },
      { code: 'pmax', profiles: 0, name: 'Pro Max', usd: 299 }],
    terms: [{ months: 1, days: 30, discount: 0 }, { months: 3, days: 90, discount: 10 },
      { months: 6, days: 180, discount: 20 }, { months: 12, days: 365, discount: 30 }],
    prices: null, free: { profiles: 5 },
  };
  const round = x => { const step = x < 100 ? 1 : 5; return Math.max(1, Math.floor(x / step + 0.5) * step); };
  function price(tier, term) {
    const live = PLANS.prices && PLANS.prices[tier.code + ':' + term.months];
    if (live) return { full: live.full, base: live.base, pay: live.sale ?? live.base, sale: live.sale_label || '' };
    const full = tier.usd * term.months;
    const base = term.discount ? round(full * (100 - term.discount) / 100) : full;
    return { full, base, pay: base, sale: '' };
  }
  const usd = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const profilesText = n => (n ? tr('nProfiles', n) : tr('unlimitedProfiles'));
  const monthsText = m => tr(m === 1 ? 'month1' : 'monthsN', m);
  const termShort = m => tr('monthsN', m);   // chips: the same short form for every term

  const sel = { tier: 'p100', months: 12 };
  const sortedTiers = () => PLANS.tiers.slice().sort((a, b) => (a.profiles || 1e9) - (b.profiles || 1e9));
  const termOf = m => PLANS.terms.find(t => t.months === m) || PLANS.terms[0];

  function renderTermBar() {
    const bar = $('#termBar'); if (!bar) return;
    bar.innerHTML = '';
    PLANS.terms.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (m.months === sel.months ? ' is-active' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', m.months === sel.months);
      b.innerHTML = esc(termShort(m.months)) + (m.discount ? ` <em>−${m.discount}%</em>` : '');
      b.onclick = () => { sel.months = m.months; renderTermBar(); renderCards(); };
      bar.appendChild(b);
    });
  }
  function renderCards() {
    const m = termOf(sel.months);
    $$('.plan[data-tier]').forEach(card => {
      const t = PLANS.tiers.find(x => x.code === card.dataset.tier);
      if (!t) return;
      const p = price(t, m);
      const name = $('.tname', card); if (name) name.textContent = t.name;
      const pr = $('.tprice', card);
      const perMo = p.pay / m.months;
      if (pr) pr.textContent = perMo >= 100 ? String(Math.round(perMo)) : (Math.round(perMo * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
      const prof = $('.tprof', card); if (prof) prof.textContent = profilesText(t.profiles);
      const sy = $('.tsync', card);
      if (sy) { const on = t.sync !== false; sy.classList.toggle('no', !on); sy.textContent = tr(on ? 'planSync' : 'planNoSync'); }
      const tot = $('.ttotal', card);
      if (tot) {
        const pct = p.full > p.pay ? Math.round((1 - p.pay / p.full) * 100) : 0;
        tot.innerHTML = m.months === 1 ? esc(tr('payMonthly'))
          : tr('payTotal', `<b>${esc(usd(p.pay))}</b>`, esc(monthsText(m.months))) + (pct ? ` · <s>${esc(usd(p.full))}</s>` : '');
      }
    });
    const free = $('.plan[data-tier="free"] [data-t="free5"]');
    if (free) free.textContent = tr('nProfiles', PLANS.free.profiles);
    const line = $('#tiersLine');
    if (line) {
      const mid = sortedTiers().filter(t => !['p20', 'p100', 'pmax'].includes(t.code)).map(t => `${t.name} — ${profilesText(t.profiles)}`).join(', ');
      const disc = PLANS.terms.filter(t => t.discount).map(t => t.months).join(' / ');
      const pct = PLANS.terms.filter(t => t.discount).map(t => t.discount).join(' / ');
      line.textContent = tr('pricingNote', mid, disc, pct);
    }
  }

  // dialogs: plan picker + screenshot viewer
  const modal = $('#planModal'), shot = $('#shotModal');
  let lastFocus = null, openM = null;
  function renderModal() {
    if (!modal) return;
    const tc = $('#tierChips'), mc = $('#termChips');
    tc.innerHTML = ''; mc.innerHTML = ''; tc.classList.add('chips--tiers');
    sortedTiers().forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip chip--tier' + (t.code === sel.tier ? ' is-active' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', t.code === sel.tier);
      b.innerHTML = `${esc(t.name)}<small>${esc(profilesText(t.profiles))}</small>`;
      b.onclick = () => { sel.tier = t.code; renderModal(); };
      tc.appendChild(b);
    });
    PLANS.terms.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (m.months === sel.months ? ' is-active' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', m.months === sel.months);
      b.innerHTML = esc(termShort(m.months)) + (m.discount ? ` <em>−${m.discount}%</em>` : '');
      b.onclick = () => { sel.months = m.months; renderModal(); renderTermBar(); renderCards(); };
      mc.appendChild(b);
    });
    const t = PLANS.tiers.find(x => x.code === sel.tier) || PLANS.tiers[0];
    const m = termOf(sel.months);
    const p = price(t, m);
    $('#planName').textContent = t.name;
    $('#planMeta').textContent = profilesText(t.profiles) + ' · ' + monthsText(m.months);
    $('#planPrice').textContent = p.pay;
    const full = $('#planFull');
    full.hidden = !(p.pay < p.full); full.textContent = usd(p.full);
    $('#planMo').textContent = m.months > 1 ? tr('perMonthEq', usd(p.pay / m.months)) : '';
    $('#planGo').href = `account.html?buy=${encodeURIComponent(t.code)}&m=${m.months}` + (lang !== 'uk' ? `&lang=${lang}` : '');
  }
  function showModal(m, from) {
    if (!m) return;
    if (openM) hideModal(true);
    lastFocus = from || document.activeElement; openM = m;
    m.hidden = false; document.body.classList.add('modal-open');
    requestAnimationFrame(() => requestAnimationFrame(() => { m.classList.add('is-open'); $('.modal__close', m).focus({ preventScroll: true }); }));
  }
  function hideModal(keepFocus) {
    const m = openM; if (!m) return;
    openM = null;
    m.classList.remove('is-open'); document.body.classList.remove('modal-open');
    setTimeout(() => { if (!m.classList.contains('is-open')) m.hidden = true; }, 400);
    if (!keepFocus && lastFocus) lastFocus.focus({ preventScroll: true });
  }
  function openModal(tier, from) {
    if (!modal) return;
    if (tier && PLANS.tiers.some(t => t.code === tier)) sel.tier = tier;
    renderModal(); showModal(modal, from);
  }
  const closeModal = () => hideModal();
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-plan]');
    if (p) { e.preventDefault(); openModal(p.dataset.plan, p); return; }
    if (e.target.closest('#shotOpen')) { showModal(shot, $('#shotOpen')); return; }
    if (openM && e.target.closest('.modal [data-close]')) hideModal(e.target.closest('a[href^="#"]'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (openM) closeModal(); else menu(false); }
    if (e.key === 'Tab' && openM) {   // keep focus inside the dialog
      const f = $$('button, a, input', openM).filter(x => x.offsetParent);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  if ($('.plan[data-tier]') || modal) {
    fetch(API + '/pay/plans').then(r => (r.ok ? r.json() : Promise.reject()))
      .then(j => { if (j && j.tiers && j.terms) { PLANS = j; if (!PLANS.terms.some(t => t.months === sel.months)) sel.months = PLANS.terms[0].months; renderTermBar(); renderCards(); if (modal && !modal.hidden) renderModal(); } })
      .catch(() => {});
  }

  /* ---------------- referral code from ?ref= ---------------- */
  const REF_RE = /^[A-Z0-9]{4,16}$/;
  const refIn = (qs.get('ref') || '').trim().toUpperCase();
  if (REF_RE.test(refIn)) { try { localStorage.setItem('8nid-ref', refIn); } catch (_) {} }
  let ref = '';
  try { ref = localStorage.getItem('8nid-ref') || ''; } catch (_) {}
  const refBox = $('#refBox');
  if (refBox && REF_RE.test(ref)) {
    refBox.hidden = false; $('#refCode').textContent = ref;
    $('#refCopy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(ref));
  }

  const yr = $('#year'); if (yr) yr.textContent = new Date().getFullYear();

  langCbs.push(() => { renderTermBar(); renderCards(); if (modal && !modal.hidden) renderModal(); });
  window.SITE = { $, $$, tr, esc, apply, API, usd, profilesText, monthsText, termShort, price, plans: () => PLANS,
    setPlans: p => { PLANS = p; }, lang: () => lang, onLang: cb => langCbs.push(cb), ref: () => (REF_RE.test(ref) ? ref : '') };
  setLang(initialLang(), false);
})();
