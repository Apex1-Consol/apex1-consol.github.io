/* In-app notifications for the hand-over chain (public.user_inbox, filled by database triggers; no email).
   My work gets: "Waiting for you" (inbox items + statutory deadlines of programmes handed to me, with a reminder
   in the bell from 7 days before), and for admin / Compliance / Head of Ops / Initiators a "Hand-overs in progress"
   list (handoff_pipeline: whose turn, days waiting). */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sb = () => window.__sb, P = () => window.__preview;
  const roles = () => (P() && P().roles) || [];
  const canPipe = () => roles().some(r => ['admin', 'compliance_officer', 'head_of_ops', 'pi_specialist'].includes(r));
  const dmy = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
  const daysTo = d => Math.round((new Date(String(d).slice(0, 10) + 'T12:00:00') - new Date(new Date().toDateString() + ' 12:00')) / 864e5);
  let rows = [], dls = [], pipe = [], busy = false, uid = null, slowAt = 0;

  function dueText(n) { return n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : n === 0 ? 'due today' : `due in ${n} day${n === 1 ? '' : 's'}`; }

  function paint() {
    const soon = dls.filter(d => daysTo(d.due) <= 7);
    window.AO_BELL = rows.map(r => ({ k: 'inbox' + r.id, c: r.action ? 'warn' : 'n', r: -1, d: 0, t: r.title, s: r.detail || 'Hand-over', h: r.link || 'mywork' }))
      .concat(soon.map(d => ({ k: 'dl' + d.programme_id + d.gate, c: 'warn', r: -1, d: 0, t: `${d.label}: ${dueText(daysTo(d.due))}`, s: d.programme, h: 'handover/' + d.programme_id })));
    if (typeof renderBell === 'function') try { renderBell(); } catch (_) {}
    const main = document.getElementById('view-mywork'); if (!main) return;
    let box = document.getElementById('aoInbox');
    if (!box) { box = document.createElement('div'); box.id = 'aoInbox'; main.insertBefore(box, main.children[1] || null); }
    const link = (h, title, sub, right = '') => `<a href="#${esc(h)}" style="display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--line);margin-top:8px;color:inherit;text-decoration:none">
      <span style="flex:1;min-width:0"><span style="display:block;font-weight:600">${title}</span><span class="sub">${sub}</span></span>${right}</a>`;
    const near = dls.filter(d => daysTo(d.due) >= -60).slice(0, 5);
    const dlRow = d => { const n = daysTo(d.due), col = n < 0 ? 'var(--bad,#b42318)' : n <= 7 ? '#8A5100' : 'var(--muted)';
      return link('handover/' + d.programme_id, `${esc(d.label)} · ${esc(dmy(d.due))}${d.trial ? ' <span class="sub">(trial)</span>' : ''}`, `${esc(d.programme)} · ${esc(d.rule || '')}`,
        `<span style="font-size:12px;font-weight:600;color:${col};white-space:nowrap">${dueText(n)}</span>`); };
    const waiting = rows.length || near.length ? `<div class="card" style="margin-top:16px;border-left:4px solid var(--yellow)">
      <b>Waiting for you</b>${rows.map(r => link(r.link || 'mywork', esc(r.title), `${esc(r.detail || '')} · ${esc(dmy(r.created_at))}`)).join('')}
      ${near.length ? `<div class="sub" style="margin-top:12px;font-weight:600">Your statutory deadlines</div>${near.map(dlRow).join('')}` : ''}</div>` : '';
    const pipeCard = canPipe() && pipe.length ? `<div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><b>Hand-overs in progress</b><span class="sub">${pipe.filter(x => x.turn !== 'Done').length} open</span></div>
      ${pipe.map(x => { const w = x.waiting_days, col = x.turn === 'Done' ? 'var(--ok,#1a7f52)' : w > 7 ? 'var(--bad,#b42318)' : w > 3 ? '#8A5100' : 'var(--muted)';
        return link('handover/' + x.programme_id, `${esc(x.programme)}${x.trial ? ' <span class="sub">(trial)</span>' : ''}`,
          `#${x.programme_id} · ${esc(x.turn)}${x.turn_email ? ' · ' + esc(x.turn_email) : ''}`,
          `<span style="font-size:12px;font-weight:600;color:${col};white-space:nowrap">${x.turn === 'Done' ? 'accepted' : w === 0 ? 'today' : w + ' day' + (w === 1 ? '' : 's') + ' waiting'}</span>`); }).join('')}</div>` : '';
    box.innerHTML = waiting + pipeCard;
  }

  async function load() {
    const c = sb(), p = P(); if (!c || !p || !p.user || busy) return;
    if (uid !== p.user.id) { uid = p.user.id; rows = []; dls = []; pipe = []; slowAt = 0; }
    busy = true;
    try {
      const { data, error } = await c.from('user_inbox').select('id,kind,action,programme_id,title,detail,link,created_at')
        .is('done_at', null).order('created_at', { ascending: false }).limit(30);
      if (!error) rows = data || [];
      // deadlines and the pipeline change slowly: every 5 minutes, or straight away on My work
      if (Date.now() - slowAt > 300000 || /^#?mywork/.test(location.hash || '#mywork')) {
        slowAt = Date.now();
        const d = await c.rpc('handoff_my_deadlines'); if (!d.error) dls = (d.data || []).sort((a, b) => String(a.due).localeCompare(String(b.due)));
        if (canPipe()) { const q = await c.rpc('handoff_pipeline'); if (!q.error) pipe = q.data || []; }
      }
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
