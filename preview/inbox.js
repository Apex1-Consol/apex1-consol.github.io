/* In-app notifications for the hand-over chain (public.user_inbox, filled by a database trigger; no email).
   Shows in the bell and as a "Waiting for you" card at the top of My work. */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => window.__sb, P = () => window.__preview;
  let rows = [], busy = false, uid = null;

  function paint() {
    window.AO_BELL = rows.map(r => ({ k: 'inbox' + r.id, c: r.action ? 'warn' : 'n', r: -1, d: 0, t: r.title, s: r.detail || 'Hand-over', h: r.link || 'mywork' }));
    if (typeof renderBell === 'function') try { renderBell(); } catch (_) {}
    const main = document.getElementById('view-mywork'); if (!main) return;
    let box = document.getElementById('aoInbox');
    if (!box) { box = document.createElement('div'); box.id = 'aoInbox'; main.insertBefore(box, main.children[1] || null); }
    box.innerHTML = rows.length ? `<div class="card" style="margin-top:16px;border-left:4px solid var(--yellow)">
      <b>Waiting for you</b>${rows.map(r => `<a href="#${esc(r.link || 'mywork')}" style="display:block;padding:10px 0;border-top:1px solid var(--line);margin-top:8px;color:inherit;text-decoration:none">
      <span style="display:block;font-weight:600">${esc(r.title)}</span><span class="sub">${esc(r.detail || '')} · ${esc(String(r.created_at).slice(0, 10).split('-').reverse().join('/'))}</span></a>`).join('')}</div>` : '';
  }

  async function load() {
    const c = sb(), p = P(); if (!c || !p || !p.user || busy) return;
    if (uid !== p.user.id) { uid = p.user.id; rows = []; }
    busy = true;
    try {
      const { data, error } = await c.from('user_inbox').select('id,kind,action,programme_id,title,detail,link,created_at')
        .is('done_at', null).order('created_at', { ascending: false }).limit(30);
      if (!error) rows = data || [];
    } catch (_) {}
    busy = false; paint();
  }

  // Opening a hand-over clears its "for your information" items (sent back, handed over to you).
  async function seen() {
    const m = /^#handover\/(\d+)/.exec(location.hash); if (!m || !sb()) return;
    const ids = rows.filter(r => !r.action && String(r.programme_id) === m[1]).map(r => r.id); if (!ids.length) return;
    try { await sb().from('user_inbox').update({ done_at: new Date().toISOString() }).in('id', ids); } catch (_) {}
    rows = rows.filter(r => !ids.includes(r.id)); paint();
  }

  window.aoInboxLoad = load;
  window.addEventListener('hashchange', () => { seen(); load(); });
  setInterval(load, 60000);
  const boot = setInterval(() => { const p = P(); if (p && p.user) { clearInterval(boot); load().then(seen); } }, 1000);
})();
