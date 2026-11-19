/* Phone layout (<=900px): drawer menu, bottom bar, open on My work. Laptop unchanged. */
(function () {
  const mq = matchMedia('(max-width:900px)'), H = document.documentElement, $ = id => document.getElementById(id);
  const sh = () => $('shell'), phone = () => mq.matches && !H.classList.contains('embed');
  const DESK = H.classList.contains('deskapp');
  if (DESK) { if (location.hash !== '#login') history.replaceState(null, '', location.search + '#desk');
    addEventListener('hashchange', () => { if (!/^#(desk|login)$/.test(location.hash)) location.replace('#desk'); }); return; }
  /* phones / home-screen app: if a newer /next/ version is online, load it (GitHub caches the page ~10 min) */
  async function fresh() {
    if (!mq.matches) return;
    try { const t = await fetch('index.html?x' + Date.now(), { cache: 'no-store' }).then(r => r.text()), m = t.match(/mobile\.js\?v=([\w]+)/), me = document.querySelector('script[src*="mobile.js?v="]');
      const mine = me && (me.getAttribute('src').match(/v=([\w]+)/) || [])[1], t2 = t.match(/desk\.js\?v=([\w]+)/), d2 = document.querySelector('script[src*="desk.js?v="]');
      const old = (m && mine && m[1] !== mine) || (t2 && d2 && !d2.getAttribute('src').includes(t2[1]));
      if (old && !sessionStorage.getItem('apxfresh' + (t2 && t2[1]))) { sessionStorage.setItem('apxfresh' + (t2 && t2[1]), '1');
        const u = new URL(location.href); u.searchParams.set('r', Date.now()); location.replace(u.toString()); } } catch (e) {}
  }
  setTimeout(fresh, 3000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fresh(); });
  const close = () => H.classList.remove('drawer');
  window.apxDrawer = f => H.classList.toggle('drawer', f === undefined ? !H.classList.contains('drawer') : !!f);
  const tr = window.toggleRail;
  window.toggleRail = f => phone() ? apxDrawer() : tr && tr(f);
  function fix() { if (phone() && sh() && sh().classList.contains('rail')) sh().classList.remove('rail'); if (!mq.matches) close(); }
  function build() {
    const s = sh(); if (!s || $('apxbar')) return;
    const bd = document.createElement('div'); bd.className = 'mbd'; bd.onclick = close; s.appendChild(bd);
    const ic = p => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    const it = [['mywork', 'My work', '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>'],
      ['flow', 'My Flow', '<path d="M4 6h16M4 12h10M4 18h6"/>'],
      ['desk', 'My desk', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>'],
      ['ava', 'Ava', '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'],
      ['menu', 'Menu', '<path d="M4 6h16M4 12h16M4 18h16"/>']];
    const n = document.createElement('nav'); n.id = 'apxbar'; n.setAttribute('aria-label', 'Quick');
    n.innerHTML = it.map(([k, l, p]) => `<button type="button" data-k="${k}">${ic(p)}<span>${l}</span></button>`).join('');
    n.onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; close();
      if (k === 'menu') apxDrawer(true); else if (k === 'ava') { window.avaToggle && avaToggle(true); } else location.hash = k; };
    s.appendChild(n);
    const nav = s.querySelector('.side'); nav && nav.addEventListener('click', e => { if (e.target.closest('a,button')) setTimeout(close, 50); });
    mark();
  }
  function mark() { const r = location.hash.slice(1).split('/')[0]; document.querySelectorAll('#apxbar button').forEach(b => b.classList.toggle('on', b.dataset.k === r)); }
  /* phones: after sign-in (or a bare link) the first screen is My work; deep links are kept */
  const h0 = location.hash; let first = /^#?(login|dashboard)?$/.test(h0);
  if (phone() && /^#?(dashboard)?$/.test(h0)) history.replaceState(null, '', '#mywork');
  addEventListener('hashchange', () => { close();
    if (first && phone() && !/^#?(login)?$/.test(location.hash)) { first = false; if (location.hash !== '#mywork') { location.replace('#mywork'); return; } }
    mark(); });
  mq.addEventListener('change', fix); addEventListener('resize', fix);
  const go = () => { build(); fix(); setTimeout(fix, 300); };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go();
  new MutationObserver(fix).observe(document.getElementById('shell') || document.body, { attributes: true, attributeFilter: ['class'] });
})();
