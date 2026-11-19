/* My desk (admin only): meeting notes with actions, escalations, decisions log. Table public.desk_notes.
   Open actions and escalations with an owner appear on that owner's My work (window.apxDeskTasks, read by shell.js). */
(function () {
  const sb = window.__sb, P = window.__preview;
  if (!sb || !P) return;
  const esc = window.esc || (s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const $ = id => document.getElementById(id);
  const iso = () => new Date().toISOString().slice(0, 10);
  const say = m => { window.toast(m); const t = $('toast'); if (t) t.textContent = m; };
  const me = () => ((P.user && P.user.email) || '').toLowerCase();
  const isAdmin = () => (P.roles || []).some(r => r === 'admin' || r === 'demo');
  const progs = () => (P.data && P.data.progs) || [];
  const pn = id => { const p = progs().find(x => x.id === id); return p ? `#${p.id} ${p.programme_name || ''}` : ''; };
  let ROWS = [], TAB = 'note', SHOW = 'open', Q = '', loaded = false;

  async function load() {
    if (!P.user) return;
    const { data, error } = await sb.from('desk_notes').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) { console.warn('desk_notes', error.message); return; }
    ROWS = data || []; loaded = true;
    if (location.hash.slice(1) === 'desk') render();
    if (window.previewShell) try { window.previewShell(); } catch (e) {}
  }
  window.apxDeskReload = () => load();
  async function run(fn, ok) { const { error } = await fn(); if (error) { say('Not saved: ' + error.message); return false; } if (ok) say(ok); await load(); return true; }

  // ---------- My work hook ----------
  window.apxDeskTasks = () => ROWS.filter(r => r.status === 'open' && (r.kind === 'action' || r.kind === 'escalation' || (r.kind === 'watch' && r.due_date && r.due_date <= iso())) && (r.owner_email || '').toLowerCase() === me())
    .map(r => ({ id: 'dk' + r.id, t: ({ escalation: 'Escalation: ', watch: 'Check: ' }[r.kind] || '') + r.title,
      s: [r.person, pn(r.programme_id), r.due_date ? 'due ' + r.due_date : ''].filter(Boolean).join(' · '),
      k: 'Desk', c: 'Done', on: `apxDeskDone(${r.id})`, bad: r.due_date && r.due_date < iso() ? 1 : 0 }));
  window.apxDeskEdit = (id, b) => {
    const r = ROWS.find(x => x.id === id), c = b.closest('.card'); if (!r || !c || c.querySelector('.dkedit')) return;
    const f = document.createElement('form'); f.className = 'dkedit'; f.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    f.innerHTML = `<input name="t" class="cellin" style="height:36px" value="${esc(r.title)}" required>
      <textarea name="b" class="cellin" rows="6" style="padding:8px;font:inherit" placeholder="Typed notes / summary (Ava can tidy this)">${esc(r.body || '')}</textarea>
      <div style="display:flex;gap:8px"><button class="btn y sm" type="submit">Save</button><button class="btn sm" type="button">Cancel</button></div>`;
    f.querySelector('button[type=button]').onclick = () => f.remove();
    f.onsubmit = e => { e.preventDefault(); const t = f.t.value.trim(); if (!t) return;
      run(() => sb.from('desk_notes').update({ title: t, body: f.b.value.trim() || null, updated_at: new Date().toISOString() }).eq('id', id), 'Saved'); };
    c.querySelector('.famas').after(f); f.b.focus();
  };
  window.apxDeskDone = id => run(() => sb.from('desk_notes').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', id), 'Marked done');

  // ---------- page ----------
  const TABS = [['note', 'Notes & meetings'], ['escalation', 'Escalations'], ['decision', 'Decisions'], ['watch', 'Watch items'], ['comp', 'Compliance watch']];
  const inKind = r => TAB === 'note' ? (r.kind === 'note' || r.kind === 'meeting') : r.kind === TAB;
  const progOpts = () => `<datalist id="dkprogs">${progs().filter(p => !p.deleted_at).map(p => `<option value="#${p.id} ${esc(p.programme_name || '')}">`).join('')}</datalist>`;
  const ownerOpts = () => `<datalist id="dkowners">${[...new Set(ROWS.map(r => r.owner_email).filter(Boolean).concat(me()))].map(e => `<option value="${esc(e)}">`).join('')}</datalist>`;
  const pid = v => { const m = String(v || '').match(/^#(\d+)/); return m ? Number(m[1]) : null; };
  const inp = (n, ph, extra = '') => `<input name="${n}" class="cellin" placeholder="${ph}" style="height:36px;flex:1 1 180px" ${extra}>`;

  function form() {
    const lab = { note: 'Add note or meeting', escalation: 'Log escalation', decision: 'Record decision', watch: 'Add watch item (shows on My work from the check date)' }[TAB];
    return `<form id="dkform" class="card" style="display:flex;flex-direction:column;gap:8px;padding:14px" onsubmit="event.preventDefault();apxDeskAdd()">
      <b>${lab}</b>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${TAB === 'note' ? `<select name="kind" class="cellin" style="height:36px"><option value="meeting">Meeting</option><option value="note">Note</option></select>` : ''}
        ${inp('title', TAB === 'escalation' ? 'What is needed' : 'Title', 'required')}
        ${inp('person', TAB === 'escalation' ? 'Raised by' : TAB === 'note' ? 'Attendees / person' : 'Agreed with')}
        ${inp('prog', 'Programme (optional)', 'list="dkprogs"')}
        ${TAB === 'escalation' || TAB === 'watch' ? inp('owner', 'Owner email', `list="dkowners" value="${esc(me())}"`) + `<input name="due" type="date" class="cellin" style="height:36px">` : ''}
      </div>
      ${TAB === 'note' ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" onclick="apxInk()">✎ Ink note (S Pen)</button><label class="btn sm" style="cursor:pointer">📷 Scan page<input type="file" accept="image/*" multiple hidden onchange="apxScanFiles(this)"></label></div>` : ''}
      <textarea name="body" class="cellin" rows="${TAB === 'note' ? 6 : 3}" placeholder="${TAB === 'note' ? 'Paste meeting notes (e.g. Read AI summary). Add actions after saving.' : 'Details'}" style="padding:8px;font:inherit"></textarea>
      <div><button class="btn y" type="submit">Save</button></div></form>`;
  }
  function actionsOf(n) {
    const a = ROWS.filter(r => r.parent_id === n.id);
    return `<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${a.map(r => `<div style="display:flex;gap:8px;align-items:center;font-size:13px">
      <input type="checkbox" ${r.status === 'done' ? 'checked' : ''} onchange="apxDeskSet(${r.id},this.checked)" aria-label="Done">
      <span style="${r.status === 'done' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(r.title)}</span>
      <span class="famas">${esc(r.owner_email || 'no owner')}${r.due_date ? ' · due ' + r.due_date : ''}</span>
      ${r.status === 'open' && r.due_date && r.due_date < iso() ? '<span style="color:var(--bad,#c00);font-size:12px">overdue</span>' : ''}</div>`).join('')}
      <form style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px" onsubmit="event.preventDefault();apxDeskAct(${n.id},this)">
        <input name="t" class="cellin" placeholder="New action" required style="height:32px;flex:2 1 200px">
        <input name="o" class="cellin" placeholder="Owner email" list="dkowners" style="height:32px;flex:1 1 160px">
        <input name="d" type="date" class="cellin" style="height:32px">
        <button class="btn sm" type="submit">Add action</button></form></div>`;
  }
  function card(r) {
    const meta = [r.kind === 'meeting' ? 'Meeting' : r.kind === 'note' ? 'Note' : '', r.person, pn(r.programme_id),
      r.kind === 'escalation' || r.kind === 'watch' ? (r.owner_email || 'no owner') + (r.due_date ? (r.kind === 'watch' ? ' · check ' : ' · due ') + r.due_date : '') : '', String(r.created_at || '').slice(0, 10)].filter(Boolean).join(' · ');
    const late = r.status === 'open' && r.due_date && (r.kind === 'watch' ? r.due_date <= iso() : r.due_date < iso());
    return `<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1">${esc(r.title)}</b>
        ${late ? `<span style="color:var(--bad,#c00);font-size:12px">${r.kind === 'watch' ? 'check now' : 'overdue'}</span>` : ''}
        ${r.kind !== 'decision' ? `<button class="btn sm" onclick="apxDeskSet(${r.id},${r.status === 'open'})">${r.status === 'open' ? ({ escalation: 'Resolve', watch: 'Done' }[r.kind] || 'Close') : 'Reopen'}</button>` : ''}
        ${r.kind === 'note' || r.kind === 'meeting' ? `<button class="btn sm" onclick="apxDeskEdit(${r.id},this)">Edit</button>` : ''}
        <button class="btn sm" onclick="apxDeskDel(${r.id})" aria-label="Delete">Delete</button></div>
      <span class="famas">${esc(meta)}</span>
      ${r.ink && window.apxInkSvg ? apxInkSvg(r.ink) : ''}
      ${r.scan && window.apxScanHtml ? apxScanHtml(r) : ''}
      ${r.body ? `<div style="white-space:pre-wrap;font-size:14px">${esc(r.body)}</div>` : ''}
      ${TAB === 'note' ? actionsOf(r) : ''}</div>`;
  }
  const COMP = [['accred', 'Accreditation'], ['fam', 'FAM Registry: SETA registrations and documents'], ['modver', 'Moderation & verification'], ['eisa', 'EISA'], ['qcto', 'QCTO Tracker']];
  const compItems = r => (window.apxOvItems ? window.apxOvItems(r) : []);
  function comp() {
    return COMP.map(([r, l]) => { const xs = compItems(r).slice().sort((a, b) => (b.warn ? 1 : 0) - (a.warn ? 1 : 0));
      return `<div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:8px;align-items:center"><b style="flex:1">${l}</b><span class="famas">${xs.filter(x => x.warn).length} red · ${xs.filter(x => !x.warn).length} amber</span>
        <button class="btn sm" onclick="location.hash='${r}'">Open page</button></div>
        ${xs.length ? xs.slice(0, 25).map(x => `<div style="display:flex;gap:8px;align-items:baseline;font-size:13px;cursor:pointer" onclick="${esc(x.go || `location.hash='${r}'`)}">
          <span aria-hidden="true" style="color:${x.warn ? 'var(--bad,#c00)' : 'var(--warn,#b70)'}">●</span><span><b>${x.t}</b> <span class="famas">${x.s || ''}</span></span></div>`).join('')
          + (xs.length > 25 ? `<span class="famas">+ ${xs.length - 25} more on the page</span>` : '') : '<span class="famas">All clear</span>'}</div>`; }).join('');
  }
  function render() {
    const v = $('view-desk'); if (!v) return;
    if (!isAdmin()) { v.innerHTML = '<div class="empty"><b>My desk</b><span>Admin only.</span></div>'; return; }
    const q = Q.toLowerCase(), all = ROWS.filter(r => !r.parent_id && inKind(r));
    const list = all.filter(r => (TAB === 'decision' || SHOW === 'all' || r.status === SHOW) && (!q || [r.title, r.body, r.person, pn(r.programme_id)].join(' ').toLowerCase().includes(q)));
    const n = k => k === 'comp' ? COMP.reduce((s, [r]) => s + compItems(r).filter(x => x.warn).length, 0) : ROWS.filter(r => !r.parent_id && (k === 'note' ? (r.kind === 'note' || r.kind === 'meeting') : r.kind === k) && (k === 'decision' || r.status === 'open')).length;
    const openActs = ROWS.filter(r => r.kind === 'action' && r.status === 'open').length;
    v.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px;padding:4px 0">
      <div><h1 style="font-size:26px">My desk</h1><span class="famas">${loaded ? `${openActs} open action${openActs === 1 ? '' : 's'} · actions and escalations with an owner show on that person's My work` : 'Loading…'}</span></div>
      <div class="seg" style="flex-wrap:wrap">${TABS.map(([k, l]) => `<button class="${k === TAB ? 'on' : ''}" onclick="apxDeskTab('${k}')">${l} (${n(k)})</button>`).join('')}</div>
      ${TAB === 'comp' ? `<span class="famas">Live from the Overview flags. Click an item to open it.</span>${comp()}</div>` : `${form()}${progOpts()}${ownerOpts()}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input class="cellin" placeholder="Search" value="${esc(Q)}" oninput="apxDeskQ(this.value)" style="height:36px;flex:1 1 220px">
        ${TAB !== 'decision' ? `<select class="cellin" style="height:36px" onchange="apxDeskShow(this.value)">${[['open', 'Open'], ['done', 'Closed'], ['all', 'All']].map(([k, l]) => `<option value="${k}"${k === SHOW ? ' selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      </div>
      <div id="dklist" style="display:flex;flex-direction:column;gap:10px">${list.map(card).join('') || '<div class="empty"><span>Nothing here yet.</span></div>'}</div></div>`}`;
  }
  window.apxDeskTab = k => { TAB = k; render(); };
  window.apxDeskShow = k => { SHOW = k; render(); };
  window.apxDeskQ = v => { Q = v || ''; clearTimeout(window.__dkq); window.__dkq = setTimeout(() => { render(); const i = document.querySelector('#view-desk input[placeholder=Search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  window.apxDeskAdd = () => {
    const f = $('dkform').elements, title = f.title.value.trim(); if (!title) return;
    const row = { kind: TAB === 'note' ? f.kind.value : TAB, title, body: f.body.value.trim() || null, person: f.person.value.trim() || null, programme_id: pid(f.prog.value) };
    if (TAB === 'escalation' || TAB === 'watch') { row.owner_email = f.owner.value.trim().toLowerCase() || null; row.due_date = f.due.value || null; }
    run(() => sb.from('desk_notes').insert(row), 'Saved');
  };
  window.apxDeskAct = (parent, fm) => {
    const e = fm.elements, t = e.t.value.trim(); if (!t) return;
    const n = ROWS.find(r => r.id === parent) || {};
    run(() => sb.from('desk_notes').insert({ kind: 'action', parent_id: parent, title: t, owner_email: e.o.value.trim().toLowerCase() || null, due_date: e.d.value || null, programme_id: n.programme_id || null, person: n.title || null }), 'Action added');
  };
  window.apxDeskSet = (id, done) => run(() => sb.from('desk_notes').update({ status: done ? 'done' : 'open', updated_at: new Date().toISOString() }).eq('id', id));
  window.apxDeskDel = id => { if (confirm('Delete this item (and its actions)? This cannot be undone.')) run(() => sb.from('desk_notes').delete().eq('id', id), 'Deleted'); };

  const anchor = $('view-dq');
  if (anchor && !$('view-desk')) anchor.insertAdjacentHTML('beforebegin', '<main id="view-desk" hidden></main>');
  addEventListener('hashchange', () => setTimeout(() => { if (location.hash.slice(1) === 'desk') render(); }, 0));
  const t = setInterval(() => { if (P.user) { clearInterval(t); load(); } }, 1500);
})();
