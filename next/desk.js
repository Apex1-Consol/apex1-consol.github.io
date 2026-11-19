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
  let EXTRA = [], STAFF = []; (async () => { try { const { data } = await sb.rpc('apx_staff'); STAFF = (data || []).filter(x => x.email).map(x => ({ n: String(x.name || '').toLowerCase(), e: String(x.email).toLowerCase() })); EXTRA = STAFF.map(x => x.e); } catch (e) {} })();
  const known = () => [...new Set(ROWS.map(r => (r.owner_email || '').toLowerCase()).filter(Boolean).concat(EXTRA, me()))];
  /* name from Ava ("Kathleen") -> staff email, matched on this device only (emails never go to Ava) */
  const ownerOf = who => { const ws = String(who || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !['pms', 'all', 'team', 'the', 'and', 'staff', 'admin', 'everyone'].includes(w)); if (!ws.length) return '';
    const nm = e => ((STAFF.find(s => s.e === e) || {}).n || '') + ' ' + e.split('@')[0];
    for (const w of ws) { const h = known().filter(e => nm(e).split(/[^a-z]+/).some(p => p === w || (w.length >= 4 && p.startsWith(w)))); if (h.length === 1) return h[0]; } return ''; };
  async function run(fn, ok) { const { error } = await fn(); if (error) { say('Not saved: ' + error.message); return false; } if (ok) say(ok); await load(); return true; }

  // ---------- My work hook ----------
  window.apxDeskTasks = () => ROWS.filter(r => r.status === 'open' && (r.kind === 'action' || r.kind === 'escalation' || (r.kind === 'watch' && r.due_date && r.due_date <= iso())) && (r.owner_email || '').toLowerCase() === me())
    .map(r => ({ id: 'dk' + r.id, t: ({ escalation: 'Escalation: ', watch: 'Check: ' }[r.kind] || '') + r.title,
      s: [r.person, pn(r.programme_id), r.due_date ? 'due ' + r.due_date : ''].filter(Boolean).join(' · '),
      k: 'Desk', c: 'Done', on: `apxDeskDone(${r.id})`, bad: r.due_date && r.due_date < iso() ? 1 : 0 }));
  window.apxDeskEdit = (id, b) => {
    const r = ROWS.find(x => x.id === id), c = b.closest('.card'); if (!r || !c || c.querySelector('.dkedit')) return;
    const f = document.createElement('form'); f.className = 'dkedit'; f.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    f.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px"><select name="k" class="cellin" style="height:36px"><option value="meeting"${r.kind === 'meeting' ? ' selected' : ''}>Meeting</option><option value="note"${r.kind === 'note' ? ' selected' : ''}>Note</option></select>
      <input name="t" class="cellin" style="height:36px;flex:2;min-width:180px" value="${esc(r.title)}" placeholder="Title" required>
      <input name="p" class="cellin" style="height:36px;flex:1;min-width:150px" value="${esc(r.person || '')}" placeholder="Attendees / person">
      <input name="g" class="cellin" style="height:36px;flex:1;min-width:150px" list="dkprogs" value="${esc(pn(r.programme_id))}" placeholder="Programme (optional)"></div>
      <textarea name="b" class="cellin" rows="8" style="padding:8px;font:inherit" placeholder="Paste the text from your scan here (Gallery → T Extract text → Copy all), then tap Fill with Ava">${esc(r.body || '')}</textarea>
      <div class="dkacts" style="display:flex;flex-direction:column;gap:4px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn y sm" type="submit">Save</button><button class="btn sm" type="button" data-x="fill">✨ Fill with Ava</button><button class="btn sm" type="button" data-x="cancel">Cancel</button><span class="dkmsg" style="font-size:12px"></span></div>`;
    f.querySelector('[data-x=cancel]').onclick = () => f.remove();
    f.querySelector('[data-x=fill]').onclick = () => fillAva(f);
    f.onsubmit = async e => { e.preventDefault(); const t = f.t.value.trim(); if (!t) return;
      const prog = pid(f.g.value) || r.programme_id || null;
      const acts = [...f.querySelectorAll('.dkprop')].filter(x => x.querySelector('input[type=checkbox]').checked).map(x => { const ty = x.querySelector('.py').value, o = x.querySelector('.po').value.trim().toLowerCase() || null, dd = x.querySelector('.pd').value || null, tt = x.querySelector('.pt').value.trim();
        return ty === 'decision' ? { kind: 'decision', title: tt, programme_id: prog, person: f.p.value.trim() || null, body: 'From: ' + t }
          : { kind: ty, parent_id: ty === 'action' ? id : null, title: tt, owner_email: o, due_date: dd, programme_id: prog, person: t }; }).filter(x => x.title);
      if (acts.length) { const { error } = await sb.from('desk_notes').insert(acts); if (error) { say('Not saved: ' + error.message); return; } }
      run(() => sb.from('desk_notes').update({ kind: f.k.value, title: t, person: f.p.value.trim() || null, programme_id: pid(f.g.value), body: f.b.value.trim() || null, updated_at: new Date().toISOString() }).eq('id', id), acts.length ? `Saved with ${acts.length} item${acts.length > 1 ? 's' : ''} (actions here, decisions and watch items in their tabs)` : 'Saved'); };
    c.querySelector('.famas').after(f); f.b.focus();
  };
  window.apxDeskOwn = (id, b) => {
    const r = ROWS.find(x => x.id === id); if (!r || b.nextElementSibling && b.nextElementSibling.classList.contains('dkown')) return;
    const f = document.createElement('form'); f.className = 'dkown'; f.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;width:100%';
    f.innerHTML = `<input name="o" class="cellin" list="dkowners" placeholder="Owner email" value="${esc(r.owner_email || '')}" style="height:36px;flex:1 1 180px"><input name="d" type="date" class="cellin" value="${esc(r.due_date || '')}" style="height:36px"><button class="btn y sm">Save</button><button class="btn sm" type="button">Cancel</button>`;
    f.querySelector('button[type=button]').onclick = () => f.remove();
    f.onsubmit = e => { e.preventDefault(); run(() => sb.from('desk_notes').update({ owner_email: f.o.value.trim().toLowerCase() || null, due_date: f.d.value || null, updated_at: new Date().toISOString() }).eq('id', id), 'Saved'); };
    b.parentElement.style.flexWrap = 'wrap'; b.after(f); f.o.focus();
  };
  /* one tap after "Copy all" in Gallery T / Live Text: paste clipboard into a new note, then Fill with Ava */
  window.apxDeskPaste = async () => {
    const f = $('dkform').elements; let t = '';
    try { t = await navigator.clipboard.readText(); } catch (e) { say('Allow clipboard access, or long-press the notes box and tap Paste.'); f.body.focus(); return; }
    if (!t.trim()) { say('Nothing copied yet. In Gallery tap T, then Copy all.'); return; }
    f.body.value = (f.body.value.trim() ? f.body.value.trim() + '\n' : '') + t.trim(); apxDeskAddFill();
  };
  /* new note: save it, then open Edit and run Fill with Ava there */
  window.apxDeskAddFill = async () => {
    const f = $('dkform').elements, b = f.body.value.trim(); if (!b) { say('Paste or type the note text first.'); return; }
    const { data, error } = await sb.from('desk_notes').insert({ kind: f.kind.value, title: f.title.value.trim() || 'Note ' + new Date().toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), body: b, person: f.person.value.trim() || null, programme_id: pid(f.prog.value) }).select('id').single();
    if (error) { say('Not saved: ' + error.message); return; }
    await load(); const btn = document.querySelector(`#view-desk button[onclick^="apxDeskEdit(${data.id},"]`); if (!btn) return;
    btn.closest('.card').scrollIntoView({ block: 'start' }); btn.click(); const ef = btn.closest('.card').querySelector('.dkedit'); if (ef) fillAva(ef);
  };
  /* Fill with Ava: typed/pasted text only (never the scan image), emails/phones/ID numbers removed. Ava proposes; you check and Save. */
  const scrubT = t => String(t || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\b\d{13}\b/g, '[ID number]').replace(/(\+?\d[\d ()-]{7,}\d)/g, '[number]').slice(0, 4000);
  async function fillAva(f) {
    const msg = f.querySelector('.dkmsg'), txt = scrubT(f.b.value);
    if (!txt.trim()) { msg.textContent = 'Paste or type the note text first.'; return; }
    if (!confirm('Ava gets only this text (never the photo), with emails, phone and ID numbers removed. Names in the text will still be sent. Continue?')) return;
    msg.textContent = 'Ava is reading…';
    try {
      const { data } = await sb.auth.getSession(), tok = data.session && data.session.access_token; if (!tok) throw new Error('Please sign in again.');
      const q = 'Turn the NOTES in the facts into structured meeting notes. Reply with ONLY one JSON object, no other text: {"title":"short title","kind":"meeting or note","attendees":"comma separated names or empty","programme":"programme or client name if mentioned, else empty","summary":"well structured notes in plain text: short headings and - bullet points, keep every fact, fix spelling, do not invent anything","items":[{"what":"short item text","who":"person name if stated, else empty","due":"YYYY-MM-DD if a date is stated or clearly implied, else empty","type":"action (a task someone must do) or decision (an agreed rule or decision) or watch (a recurring or ongoing thing to check)"}]}. Today is ' + iso() + '.';
      const res = await fetch(sb.supabaseUrl + '/functions/v1/ava', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ type: 'ava', mode: 'ask', question: q, page: 'My desk', facts: 'NOTES:\n' + txt, history: [] }) });
      const j = await res.json().catch(() => null);
      if (res.status === 429) throw new Error('Ava is busy (free AI limit). Try again in a minute.');
      if (!res.ok || !j || j.ok === false) throw new Error((j && j.error) || 'Request failed');
      const a = String(j.answer || ''), m = a.match(/\{[\s\S]*\}/); if (!m) throw new Error('Ava did not return notes. Try again.');
      const o = JSON.parse(m[0]);
      if (o.title) f.t.value = String(o.title).slice(0, 140);
      if (/meeting|note/.test(o.kind || '')) f.k.value = /meeting/.test(o.kind) ? 'meeting' : 'note';
      if (o.attendees && !f.p.value.trim()) f.p.value = String(o.attendees).slice(0, 200);
      if (o.programme && !pid(f.g.value)) { const g = String(o.programme).toLowerCase(), n = (g.match(/#?(\d{2,5})/) || [])[1];
        const hit = progs().filter(p => !p.deleted_at && (n ? String(p.id) === n : (p.programme_name || '').toLowerCase().includes(g)));
        if (hit.length === 1) f.g.value = `#${hit[0].id} ${hit[0].programme_name || ''}`; }
      if (o.summary) { f.dataset.orig = f.dataset.orig || f.b.value; f.b.value = String(o.summary); }
      const its = (Array.isArray(o.items) ? o.items : Array.isArray(o.actions) ? o.actions : []).filter(x => x && x.what).slice(0, 20);
      const box = f.querySelector('.dkacts'); box.innerHTML = its.length ? '<b style="font-size:13px">Proposed (tick to add; change type, owner or date):</b>' : '';
      its.forEach(x => { const ty = /decision/i.test(x.type || '') ? 'decision' : /watch/i.test(x.type || '') ? 'watch' : 'action', dd = /^\d{4}-\d{2}-\d{2}$/.test(x.due || '') ? x.due : '';
        const row = document.createElement('div'); row.className = 'dkprop'; row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:14px;padding:6px 0;border-top:1px solid var(--line)';
        row.innerHTML = `<input type="checkbox" checked style="width:20px;height:20px;flex:none"><input class="cellin pt" value="${esc(String(x.what).slice(0, 300))}" style="height:34px;flex:3 1 220px">
          <select class="cellin py" style="height:34px"><option value="action"${ty === 'action' ? ' selected' : ''}>Action</option><option value="decision"${ty === 'decision' ? ' selected' : ''}>Decision</option><option value="watch"${ty === 'watch' ? ' selected' : ''}>Watch item</option></select>
          <input class="cellin po" list="dkowners" placeholder="Owner email${x.who ? ' (' + esc(x.who) + ')' : ''}" value="${esc(ownerOf(x.who))}" style="height:34px;flex:1 1 170px"><input class="cellin pd" type="date" value="${dd}" style="height:34px">`;
        box.appendChild(row); });
      msg.innerHTML = 'Check the fields, then Save.' + (f.dataset.orig ? ' <a href="#" onclick="event.preventDefault();const f=this.closest(\'form\');f.b.value=f.dataset.orig">Undo text</a>' : '');
    } catch (e) { msg.textContent = 'Sorry: ' + e.message; }
  }
  window.apxDeskDone = id => run(() => sb.from('desk_notes').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', id), 'Marked done');

  // ---------- page ----------
  const TABS = [['note', 'Notes & meetings'], ['escalation', 'Escalations'], ['decision', 'Decisions'], ['watch', 'Watch items'], ['comp', 'Compliance watch']];
  const inKind = r => TAB === 'note' ? (r.kind === 'note' || r.kind === 'meeting') : r.kind === TAB;
  const progOpts = () => `<datalist id="dkprogs">${progs().filter(p => !p.deleted_at).map(p => `<option value="#${p.id} ${esc(p.programme_name || '')}">`).join('')}</datalist>`;
  const ownerOpts = () => `<datalist id="dkowners">${known().map(e => `<option value="${esc(e)}">${esc((STAFF.find(s => s.e === e) || {}).n || '')}</option>`).join('')}</datalist>`;
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
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn y" type="submit">Save</button>${TAB === 'note' ? '<button class="btn" type="button" onclick="apxDeskPaste()">📋 Paste &amp; fill with Ava</button><button class="btn" type="button" onclick="apxDeskAddFill()">✨ Fill with Ava</button>' : ''}</div></form>`;
  }
  function actionsOf(n) {
    const a = ROWS.filter(r => r.parent_id === n.id);
    return `<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${a.map(r => `<div style="display:flex;gap:8px;align-items:center;font-size:13px">
      <input type="checkbox" ${r.status === 'done' ? 'checked' : ''} onchange="apxDeskSet(${r.id},this.checked)" aria-label="Done">
      <span style="${r.status === 'done' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(r.title)}</span>
      <button type="button" class="famas" style="cursor:pointer;border:0" title="Set owner and due date" onclick="apxDeskOwn(${r.id},this)">${esc(r.owner_email || 'no owner')}${r.due_date ? ' · due ' + r.due_date : ''} ✎</button>
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
