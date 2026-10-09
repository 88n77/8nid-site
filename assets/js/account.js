'use strict';
/* 8nID Anty — web account. Talks to api.8nid.com with a short web session (Bearer, sessionStorage).
   A web session never binds a PC and never gets a license — that stays in the desktop app. */
(() => {
  const S = window.SITE;
  const { $, $$, tr, esc, usd } = S;
  const TOKEN_KEY = '8nid-web-token';
  let token = '';
  try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) {}
  let ov = null, info = null, inv = null, net = null, pollT = 0, tickT = 0, quoteT = 0;
  const sel = { tier: 'p100', months: 1, promo: '' };
  const qs = new URLSearchParams(location.search);
  let wantBuy = qs.get('buy') ? { tier: qs.get('buy'), months: +qs.get('m') || 1 } : null;
  let pendingEmail = '';

  /* ---------------- api ---------------- */
  class ApiError extends Error { constructor(code, msg, status) { super(msg); this.code = code; this.status = status; } }
  async function api(path, body, method) {
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    let r;
    try {
      r = await fetch(S.API + path, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (_) { throw new ApiError('network', tr('err_network'), 0); }
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) {
      if (r.status === 401 && token && path !== '/web/login') { signOut(true); }
      throw new ApiError(r.status === 429 ? 'rate' : (j.code || 'error'), j.message || '', r.status);
    }
    return j;
  }
  // server messages are Ukrainian; translate by code, fall back to the server text
  const errText = e => tr('err_' + e.code) || e.message || tr('err_error');

  function msg(el, text, kind) {
    el = typeof el === 'string' ? $(el) : el;
    if (!text) { el.hidden = true; return; }
    el.hidden = false; el.textContent = text;
    el.className = 'msg' + (kind === 'err' ? ' msg--err' : kind === 'ok' ? ' msg--ok' : '');
  }
  async function busy(btn, fn) {
    btn.classList.add('is-busy');
    try { return await fn(); } finally { btn.classList.remove('is-busy'); }
  }
  const locale = () => ({ uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', ru: 'ru-RU', fr: 'fr-FR', pt: 'pt-PT', tr: 'tr-TR' }[S.lang()] || 'en-GB');
  const fmtDate = iso => (iso ? new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z').toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
  const parseIso = iso => new Date(iso && !(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso)) ? iso + 'Z' : iso);

  /* ---------------- views ---------------- */
  const VIEWS = ['vLogin', 'vVerify', 'vReset', 'vDash', 'vLoading'];
  function show(id) {
    VIEWS.forEach(v => { $('#' + v).hidden = v !== id; });
    $('#logoutBtn').hidden = id !== 'vDash';
    scrollTo(0, 0);
  }
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view]');
    if (v) { e.preventDefault(); show(v.dataset.view); }
    const c = e.target.closest('[data-copy]');
    if (c) {
      const src = $('#' + c.dataset.copy); const text = src ? src.textContent.trim() : '';
      if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
      const sp = c.querySelector('span'); const old = sp.textContent; sp.textContent = tr('copied');
      setTimeout(() => { sp.textContent = old; }, 1400);
    }
  });

  function setToken(t) {
    token = t || '';
    try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
  }
  function signOut(expired) {
    clearInterval(pollT); clearInterval(tickT);
    setToken(''); ov = info = inv = null;
    show('vLogin');
    if (expired) msg('#lErr', tr('err_session_expired'), 'err');
  }
  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/auth/logout', {}); } catch (_) {}
    signOut(false);
  });

  /* ---------------- sign in / verify / reset ---------------- */
  $('#fLogin').addEventListener('submit', e => {
    e.preventDefault();
    const btn = e.submitter || $('#fLogin button[type=submit]');
    const email = $('#lEmail').value.trim(), password = $('#lPass').value;
    msg('#lErr', '');
    if (!email || !password) { msg('#lErr', tr('err_fill'), 'err'); return; }
    busy(btn, async () => {
      try {
        const j = await api('/web/login', { email, password });
        setToken(j.token); $('#lPass').value = '';
        await loadDash();
      } catch (er) {
        if (er.code === 'not_verified') {
          pendingEmail = email; $('#vEmail').textContent = email;
          try { await api('/auth/resend-code', { email }); } catch (_) {}
          show('vVerify');
        } else msg('#lErr', errText(er), 'err');
      }
    });
  });
  $('#fVerify').addEventListener('submit', e => {
    e.preventDefault();
    const btn = $('#fVerify button[type=submit]');
    busy(btn, async () => {
      try {
        await api('/auth/verify-email', { email: pendingEmail, code: $('#vCode').value.trim() });
        msg('#lErr', tr('verifiedSignIn'), 'ok'); show('vLogin'); $('#lEmail').value = pendingEmail;
        $('#lErr').hidden = false;
      } catch (er) { msg('#vMsg', errText(er), 'err'); }
    });
  });
  $('#vResend').addEventListener('click', async () => {
    try { await api('/auth/resend-code', { email: pendingEmail }); msg('#vMsg', tr('codeSent'), 'ok'); } catch (er) { msg('#vMsg', errText(er), 'err'); }
  });
  let resetEmail = '';
  $('#fReset1').addEventListener('submit', e => {
    e.preventDefault();
    resetEmail = $('#rEmail').value.trim();
    if (!resetEmail) return;
    busy($('#fReset1 button'), async () => {
      try {
        await api('/auth/password/reset-request', { email: resetEmail });
        $('#fReset1').hidden = true; $('#fReset2').hidden = false;
        msg('#rMsg', tr('resetSent'), 'ok');
      } catch (er) { msg('#rMsg', errText(er), 'err'); }
    });
  });
  $('#fReset2').addEventListener('submit', e => {
    e.preventDefault();
    busy($('#fReset2 button'), async () => {
      try {
        await api('/auth/password/reset-confirm', { email: resetEmail, code: $('#rCode').value.trim(), new_password: $('#rPass').value });
        $('#fReset1').hidden = false; $('#fReset2').hidden = true; $('#rPass').value = ''; $('#rCode').value = '';
        msg('#rMsg', ''); show('vLogin'); $('#lEmail').value = resetEmail; msg('#lErr', tr('resetDone'), 'ok');
      } catch (er) { msg('#rMsg', errText(er), 'err'); }
    });
  });

  /* ---------------- dashboard ---------------- */
  async function loadDash() {
    show('vLoading');
    try {
      [ov, info] = await Promise.all([api('/web/overview'), api('/pay/info')]);
    } catch (er) {
      if (!token) return;
      show('vLogin'); msg('#lErr', errText(er), 'err'); return;
    }
    S.setPlans({ tiers: info.tiers, terms: info.terms, prices: info.prices, free: S.plans().free });
    show('vDash');
    renderDash();
    if (info.open_invoice) openPay(info.open_invoice);
    else if (wantBuy) { openBuy(wantBuy.tier, wantBuy.months); }
    wantBuy = null;
  }

  function renderDash() {
    if (!ov) return;
    const st = ov.status;
    $('#dEmail').textContent = ov.email;
    $('#pwUser').value = ov.email;
    // subscription
    const pill = $('#sState');
    const free = st.state === 'free';
    const active = st.state === 'active';
    pill.className = 'pill ' + (active ? 'pill--ok' : free ? '' : 'pill--bad');
    pill.textContent = tr('state_' + st.state) || st.state;
    $('#sTier').textContent = st.tier_name || (free ? 'Free' : '—');
    $('#sProfiles').textContent = st.max_profiles ? tr('nProfiles', st.max_profiles) : (active || free ? tr('unlimitedProfiles') : '');
    if (active && st.paid_until) {
      $('#sUntil').textContent = tr('activeUntil', fmtDate(st.paid_until), st.days_left);
      $('#sBar').style.width = Math.max(3, Math.min(100, st.days_left / 365 * 100)) + '%';
      $('#sBar').parentElement.hidden = false;
    } else {
      $('#sUntil').textContent = free ? tr('freeForever') : tr('noSub');
      $('#sBar').parentElement.hidden = true;
    }
    $('#sNote').textContent = free && st.pro_expired ? tr('proExpired') : '';
    $('#sBuy span').textContent = active ? tr('buyOrExtend') : tr('choosePlan');
    // device
    const d = ov.device;
    $('#devInfo').innerHTML = d
      ? `<b>${esc(d.name || tr('unnamedPc'))}</b><span>${esc(tr('lastSeen', fmtDate(d.last_seen)))}</span>`
      : `<b>${esc(tr('noPc'))}</b><span>${esc(tr('noPcHint'))}</span>`;
    $('#devRelease').hidden = !d;
    $('#devRelease').disabled = !ov.switches_left;
    if (d) $('#devRelease').title = tr('switchesLeft', ov.switches_left);
    // referrals
    const r = ov.ref;
    $('#refCode').textContent = r.code || '—';
    $('#refLink').textContent = 'https://8nid.com/?ref=' + (r.code || '');
    $('#refLead').textContent = tr('refLeadText', r.discount, r.bonus_days);
    $('#refInv').textContent = r.invited; $('#refPaid').textContent = r.paid; $('#refDays').textContent = r.days_earned;
    $('#refIn').hidden = !r.can_attach;
    const by = $('#refBy');
    by.hidden = !r.referred_by;
    if (r.referred_by) by.textContent = r.first_discount ? tr('refByDiscount', r.referred_by, r.first_discount) : tr('refBy', r.referred_by);
    // history
    const tb = $('#hTable tbody'); tb.innerHTML = '';
    const rows = (ov.invoices || []).filter(i => i.status === 'paid');
    $('#hEmpty').hidden = rows.length > 0; $('#hTable').hidden = !rows.length;
    rows.forEach(i => {
      const tx = i.paid_tx ? (i.network === 'trc20' ? 'https://tronscan.org/#/transaction/' : 'https://bscscan.com/tx/') + encodeURIComponent(i.paid_tx) : '';
      const tr_ = document.createElement('tr');
      tr_.innerHTML = `<td>${esc(fmtDate(i.created_at))}</td><td>${esc(i.tier_name)}</td><td>${esc(S.monthsText(i.months))}</td>` +
        `<td class="num">${esc(i.amount)} USDT</td><td><span class="pill pill--ok">${esc(tr('paid'))}</span></td>` +
        `<td>${tx ? `<a href="${tx}" target="_blank" rel="noopener noreferrer">${esc(i.network.toUpperCase())} ↗</a>` : '—'}</td>`;
      tb.appendChild(tr_);
    });
  }

  $('#devRelease').addEventListener('click', () => {
    if (!confirm(tr('releaseConfirm'))) return;
    busy($('#devRelease'), async () => {
      try { await api('/web/device/release', {}); ov = await api('/web/overview'); renderDash(); msg('#devMsg', tr('released'), 'ok'); }
      catch (er) { msg('#devMsg', errText(er), 'err'); }
    });
  });
  $('#refApply').addEventListener('click', () => {
    const code = $('#refInput').value.trim();
    if (!code) return;
    busy($('#refApply'), async () => {
      try { const j = await api('/web/ref', { code }); ov.ref = j.ref; renderDash(); msg('#refMsg', tr('refAdded', j.ref.first_discount), 'ok'); }
      catch (er) { msg('#refMsg', errText(er), 'err'); }
    });
  });
  $('#fPass').addEventListener('submit', e => {
    e.preventDefault();
    const o = $('#pwOld').value, n = $('#pwNew').value;
    if (n.length < 8) { msg('#pwMsg', tr('err_weak_password'), 'err'); return; }
    busy($('#fPass button[type=submit]'), async () => {
      try { await api('/web/password', { old_password: o, new_password: n }); $('#pwOld').value = $('#pwNew').value = ''; msg('#pwMsg', tr('passChanged'), 'ok'); }
      catch (er) { msg('#pwMsg', errText(er), 'err'); }
    });
  });

  /* ---------------- buy ---------------- */
  $('#sBuy').addEventListener('click', () => openBuy());
  $('#buyClose').addEventListener('click', () => { $('#bBuy').hidden = true; });
  function openBuy(tier, months) {
    const st = ov.status;
    if (tier && info.tiers.some(t => t.code === tier)) sel.tier = tier;
    else if (st.state === 'active' && info.tiers.some(t => t.code === st.tier)) sel.tier = st.tier;
    if (months && info.terms.some(t => t.months === months)) sel.months = months;
    $('#bPay').hidden = true; $('#bPaid').hidden = true; $('#bBuy').hidden = false;
    renderBuy(); requestQuote(0);
    $('#bBuy').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderBuy() {
    const tc = $('#bTiers'), mc = $('#bTerms');
    tc.innerHTML = ''; mc.innerHTML = '';
    info.tiers.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (t.code === sel.tier ? ' is-active' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', t.code === sel.tier);
      b.innerHTML = `${esc(t.name)} <small>${t.profiles || '∞'}</small>`;
      b.onclick = () => { sel.tier = t.code; renderBuy(); requestQuote(); };
      tc.appendChild(b);
    });
    info.terms.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (m.months === sel.months ? ' is-active' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', m.months === sel.months);
      b.innerHTML = esc(S.termShort(m.months)) + (m.discount ? ` <em>−${m.discount}%</em>` : '');
      b.onclick = () => { sel.months = m.months; renderBuy(); requestQuote(); };
      mc.appendChild(b);
    });
  }
  $('#bPromoApply').addEventListener('click', () => { sel.promo = $('#bPromo').value.trim(); requestQuote(0); });
  $('#bPromo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#bPromoApply').click(); } });

  let lastQuote = null, quoteSeq = 0;
  function requestQuote(delay = 200) {
    clearTimeout(quoteT);
    quoteT = setTimeout(async () => {
      const seq = ++quoteSeq;
      msg('#bErr', '');
      try {
        const j = await api('/pay/quote', { tier: sel.tier, months: sel.months, promo: sel.promo });
        if (seq !== quoteSeq) return;
        lastQuote = j.quote; renderQuote();
      } catch (er) { if (seq === quoteSeq) msg('#bErr', errText(er), 'err'); }
    }, delay);
  }
  function renderQuote() {
    const q = lastQuote; if (!q) return;
    const t = q.tier, m = q.term;
    $('#qName').textContent = `${t.name} · ${S.profilesText(t.profiles)} · ${S.monthsText(m.months)}`;
    $('#qPrice').textContent = usd(q.final_usd);
    const full = $('#qFull'); full.hidden = !(q.full_usd > q.final_usd); full.textContent = usd(q.full_usd);
    const disc = $('#qDisc');
    const label = q.discount_kind === 'ref' ? tr('discRef', q.discount_label.replace(/\D/g, '') || 10)
      : q.discount_kind === 'promo' ? tr('discPromo', sel.promo.toUpperCase()) : q.discount_kind === 'sale' ? q.discount_label : '';
    disc.hidden = !label; disc.textContent = label;
    if (q.promo_error && sel.promo) msg('#bErr', tr('err_bad_promo') + (S.lang() === 'uk' ? ' — ' + q.promo_error : ''), 'err');
    const rows = [];
    if (m.discount) rows.push([tr('termDiscount'), '−' + m.discount + '%']);
    const c = q.conversion;
    if (c.mode === 'convert') rows.push([tr('convRow', Math.round(c.remaining_days), (info.tiers.find(x => x.code === c.from_tier) || {}).name || c.from_tier), '+' + Math.round(c.converted_days) + ' ' + tr('daysShort')]);
    else if (c.mode === 'keep' && c.remaining_days > 0) rows.push([tr('keepRow'), '+' + Math.round(c.remaining_days) + ' ' + tr('daysShort')]);
    rows.push([tr('totalDays'), Math.round(q.total_days) + ' ' + tr('daysShort')]);
    $('#qRows').innerHTML = rows.map(([a, b]) => `<li><span>${esc(a)}</span><b>${esc(b)}</b></li>`).join('');
    // downgrade warning: the site can't see the PC's profile count, so warn whenever the limit gets lower
    const cur = ov.status, curMax = cur.state === 'active' ? cur.max_profiles : (cur.max_profiles || 0);
    const lower = cur.state === 'active' && t.profiles && (curMax === 0 || t.profiles < curMax);
    msg('#qWarn', lower ? tr('downgradeWarn', t.profiles) : '');
  }
  $('#bInvoice').addEventListener('click', () => {
    busy($('#bInvoice'), async () => {
      try {
        const j = await api('/pay/invoice', { tier: sel.tier, months: sel.months, promo: sel.promo });
        info.wallets = j.wallets;
        openPay(j.invoice);
      } catch (er) { msg('#bErr', errText(er), 'err'); }
    });
  });

  /* ---------------- pay ---------------- */
  function openPay(invoice) {
    inv = invoice;
    $('#bBuy').hidden = true; $('#bPaid').hidden = true; $('#bPay').hidden = false;
    const wallets = info.wallets || [];
    net = wallets.find(w => w.code === (inv.network || 'trc20')) || wallets[0] || null;
    $('#pWhat').textContent = `${inv.tier_name} · ${S.profilesText(inv.profiles)} · ${S.monthsText(inv.months)}`;
    $('#pAmount').textContent = inv.amount;
    const nets = $('#pNets'); nets.innerHTML = '';
    wallets.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'net' + (w === net ? ' is-active' : ''); b.setAttribute('role', 'tab');
      b.innerHTML = `<b>${esc(w.coin)} · ${esc(w.chain)}</b><small>${esc(w.net)}</small>`;
      b.onclick = () => { net = w; $$('.net', nets).forEach(x => x.classList.toggle('is-active', x === b)); paintNet(); };
      nets.appendChild(b);
    });
    paintNet(); paintStatus('open');
    clearInterval(tickT); tickT = setInterval(tick, 1000); tick();
    clearInterval(pollT); pollT = setInterval(poll, 10000);
    $('#bPay').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function paintNet() {
    if (!net) return;
    $('#pAddr').textContent = net.address;
    $('#pChain').textContent = `${net.net} (${net.chain})`;
    const cv = $('#pQr');
    if (window.QRCode) window.QRCode.toCanvas(cv, net.address, { width: 220, margin: 1 }, () => {});
  }
  function paintStatus(s) {
    const p = $('#pStatus');
    p.className = 'pill ' + (s === 'paid' ? 'pill--ok' : s === 'open' ? 'pill--wait' : 'pill--bad');
    p.textContent = tr('inv_' + s) || s;
  }
  function tick() {
    if (!inv || !inv.expires_at) return;
    const left = Math.max(0, parseIso(inv.expires_at) - Date.now());
    const h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000), s = Math.floor(left % 60000 / 1000);
    $('#pTimer').textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (!left) { clearInterval(tickT); poll(); }
  }
  async function poll() {
    if (!inv || document.hidden) return;
    try {
      const j = await api('/pay/invoice/' + inv.id);
      inv = j.invoice; paintStatus(inv.status);
      if (inv.status === 'paid') paidDone(j.status);
      else if (inv.status !== 'open') { clearInterval(pollT); clearInterval(tickT); }
    } catch (_) {}
  }
  async function paidDone(status) {
    clearInterval(pollT); clearInterval(tickT);
    $('#bPay').hidden = true; $('#bPaid').hidden = false;
    $('#paidText').textContent = tr('paidText', status.tier_name || '', fmtDate(status.paid_until));
    try { ov = await api('/web/overview'); renderDash(); } catch (_) {}
    $('#bPaid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#pVerify').addEventListener('click', () => {
    const h = $('#pHash').value.trim();
    if (!h || !net) return;
    busy($('#pVerify'), async () => {
      try {
        const j = await api('/pay/verify', { invoice_id: inv.id, network: net.code, tx_hash: h });
        msg('#pMsg', '');
        inv.status = 'paid'; paidDone(j.status);
      } catch (er) { msg('#pMsg', errText(er), 'err'); }
    });
  });
  $('#pChange').addEventListener('click', () => { clearInterval(pollT); clearInterval(tickT); openBuy(inv && inv.tier, inv && inv.months); });

  /* ---------------- language changes ---------------- */
  S.onLang(() => { if (ov) renderDash(); if (lastQuote && !$('#bBuy').hidden) { renderBuy(); renderQuote(); } if (inv && !$('#bPay').hidden) { paintStatus(inv.status); $('#pWhat').textContent = `${inv.tier_name} · ${S.profilesText(inv.profiles)} · ${S.monthsText(inv.months)}`; } });

  /* ---------------- start ---------------- */
  if (token) loadDash(); else show('vLogin');
})();
