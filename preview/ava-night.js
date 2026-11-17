/* Ava Phase 4: night shift. pg_cron ava_night() (00:30 UTC) runs rule checks and writes ava_prepared rows routed to an owner
   (owner_email, else owner_role pm/qa/pi/admin). Morning card "Prepared for you": Open = go to the screen and show the playbook plan
   (user approves Run); Done = mark handled. RLS shows each user only their own/role rows (admin sees all). No AI calls. */
(() => {
  const Q = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const role = () => (window.apxRole && apxRole()) || 'pm';
  const today = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  const WHO = { pm: 'PM', qa: 'QA', pi: 'PI', admin: 'Admin' };
  const N = { items: [], loaded: false };

  async function load() {
    if (!window.__sb) return [];
    try { const { data } = await __sb.from('ava_prepared').select('id,owner_email,owner_role,kind,label,n,route,pb').eq('day', today()).is('done_at', null).order('id'); N.items = data || []; } catch (_) { N.items = []; }
    N.loaded = true; return N.items;
  }
  function paint() {
    const box = Q('#avaprep'); if (!box) return; const adm = role() === 'admin';
    box.innerHTML = `<div class="avkh"><b>☀ Prepared for you</b><button type="button" class="avkx" aria-label="Close" onclick="avaPrep(false)">×</button></div>`
      + (N.items.length ? `<div class="avsm">Ava checked overnight. Open shows the plan; you approve each step.</div><ol class="avkl">` + N.items.map(x => `<li><span><b>${esc(x.label)}</b>${adm ? `<br><span class="avsm">for ${esc(x.owner_email || WHO[x.owner_role] || x.owner_role)}</span>` : ''}</span><span class="avkb"><button type="button" class="btn y" onclick="avaPrepOpen(${x.id})">Open</button><button type="button" class="btn" onclick="avaPrepDone(${x.id})">Done</button></span></li>`).join('') + '</ol>'
        : '<p class="avok">Nothing waiting. All clear ✓</p>');
  }
  window.avaPrep = async open => {
    const box = Q('#avaprep'); if (!box) return; const o = open === undefined ? box.hidden : !!open;
    if (!o) { box.hidden = true; return; } if (!N.loaded) await load(); box.hidden = false; paint();
  };
  window.avaPrepOpen = id => {
    const x = N.items.find(i => i.id === id); if (!x) return; avaPrep(false);
    if (x.route) location.hash = x.route;
    if (x.pb && window.avaCmdPb) setTimeout(() => avaCmdPb(x.pb), 400);
  };
  window.avaPrepDone = async id => {
    N.items = N.items.filter(i => i.id !== id); paint();
    try { await __sb.from('ava_prepared').update({ done_at: new Date().toISOString(), done_by: role() }).eq('id', id); } catch (_) {}
  };
  window.AVANIGHT = { N, load, today };

  function mount() {
    if (Q('#avaprep')) return;
    document.head.insertAdjacentHTML('beforeend', `<style>#avaprep{position:fixed;right:16px;top:64px;z-index:949;width:min(380px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:var(--bg,#fff);color:var(--ink,#111);border:1px solid var(--line,#ddd);border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.22);padding:12px}#avaprep .avsm{font-size:12px;opacity:.8}</style>`);
    document.body.insertAdjacentHTML('beforeend', '<div id="avaprep" role="dialog" aria-label="Ava Prepared for you" hidden></div>');
    setTimeout(async () => {
      if (document.body.classList.contains('embed') || /embed=1/.test(location.search) || !window.apxRole || ls('avaPrepSeen') === today()) return;
      const it = await load(); if (it.length) { ls('avaPrepSeen', today()); avaPrep(true); }
    }, 6000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
