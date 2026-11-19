/* My desk minutes (/next/ only): formal minutes from a meeting note, approve + lock (DB trigger desk_minutes_lock),
   versions, Minutes register tab, PDF with letterhead, redacted tender sample, agenda for the next meeting, meeting types.
   Stored as desk_notes kind 'minutes' (parent_id = meeting note, minutes jsonb). Ava drafts from TEXT only; a person approves. */
(function () {
  const sbc = () => window.__sb, D = () => window.__desk;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const TYPES = {
    general: ['General meeting', ['Matters arising', 'Discussion', 'Any other business']],
    mgmt: ['Management review (ISO 9001)', ['Status of actions from previous management reviews', 'Changes in external and internal issues', 'Customer satisfaction and feedback from interested parties', 'Extent to which quality objectives have been met', 'Process performance and conformity of services', 'Nonconformities and corrective actions', 'Monitoring and measurement results', 'Audit results', 'Performance of external providers (e.g. FAM practitioners)', 'Adequacy of resources', 'Effectiveness of actions taken to address risks and opportunities', 'Opportunities for improvement', 'Outputs: improvement opportunities, changes needed to the QMS, resource needs']],
    em: ['Exit Moderation meeting', ['Matters arising', 'Upcoming exits by programme', 'Moderator allocation', 'Learner admin complete before assessment', 'Remediation and costs', 'FAM practitioners and costs', 'Any other business']],
    qa: ['QA / moderation meeting', ['Matters arising', 'Moderation schedule', 'Moderation findings', 'Verification and EISA readiness', 'Corrective actions', 'Any other business']],
    pm: ['Staff / PM meeting', ['Matters arising', 'Programme status', 'Risks and escalations', 'Resources', 'Any other business']] };
  const guess = t => /management review/i.test(t) ? 'mgmt' : /exit|moderation|\bem\b/i.test(t) ? 'em' : /\bqa\b|quality|verification|eisa/i.test(t) ? 'qa' : /\bpm\b|staff|programme/i.test(t) ? 'pm' : 'general';
  const rows = () => D().rows(), mins = () => rows().filter(r => r.kind === 'minutes' && r.minutes);
  const nm = e => { const s = D().staff().find(x => x.e === String(e || '').toLowerCase()); return s ? s.N : (e ? String(e).split('@')[0] : ''); };
  const myName = () => nm(D().me()) || D().me();
  const d10 = v => String(v || '').slice(0, 10);
  const act = a => ({ t: a.title, o: nm(a.owner_email) || 'no owner', d: a.due_date || '', s: a.status === 'done' ? 'Done' : 'Open' });

  /* ---------- data for a meeting note ---------- */
  function prevNote(n) { return D().series(n).filter(x => String(x.created_at) < String(n.created_at))[0] || null; }
  function facts(n) {
    const all = rows().filter(a => a.parent_id === n.id && a.kind === 'action'), pv = prevNote(n);
    const carried = all.filter(a => String(a.created_at) < String(n.created_at));
    const arising = (pv ? rows().filter(a => a.parent_id === pv.id && a.kind === 'action') : []).concat(carried).map(act);
    return { arising, actions: all.filter(a => !carried.includes(a)).map(act), decisions: rows().filter(d => d.kind === 'decision' && (d.body || '') === 'From: ' + n.title).map(d => d.title) };
  }
  const agendaOf = noteId => rows().find(r => r.kind === 'minutes' && r.parent_id === noteId && r.minutes && r.minutes.status === 'agenda');
  const ofNote = id => mins().filter(r => r.parent_id === id && r.minutes.status !== 'agenda').sort((a, b) => (b.minutes.v || 1) - (a.minutes.v || 1));
  function nextNo() { const y = new Date().getFullYear(); let m = 0; mins().forEach(r => { const x = String(r.minutes.no || '').match(new RegExp('^MIN-' + y + '-(\\d+)$')); if (x) m = Math.max(m, +x[1]); }); return `MIN-${y}-${String(m + 1).padStart(3, '0')}`; }

  /* ---------- card buttons / register ---------- */
  window.apxMinBtns = r => { const l = ofNote(r.id)[0];
    return `<button class="btn sm" onclick="apxMin(${r.id}${l ? ',' + l.id : ''})" title="Formal minutes for compliance / QMS">📄 ${l ? esc(l.minutes.no) + (l.minutes.status === 'approved' ? ' ✓' : ' draft') : 'Minutes'}</button><button class="btn sm" onclick="apxAgenda(${r.id})" title="Agenda for the next meeting">📋 Agenda</button>`; };
  const latest = () => { const by = {}; mins().filter(r => r.minutes.status !== 'agenda').forEach(r => { const k = r.minutes.no; if (!by[k] || (r.minutes.v || 1) > (by[k].minutes.v || 1)) by[k] = r; }); return Object.values(by).sort((a, b) => String(b.minutes.no).localeCompare(String(a.minutes.no))); };
  window.apxMinCount = () => latest().length;
  const openActs = r => rows().filter(a => a.parent_id === r.parent_id && a.kind === 'action' && a.status === 'open').length;
  window.apxMinReg = () => { const L = latest();
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="famas" style="flex:1">Controlled record: approved minutes are locked; changes create a new version.</span><button class="btn sm" onclick="apxMinRegPdf()">🖨 Register PDF</button></div>
      <div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>No.</th><th>Ver</th><th>Meeting</th><th>Date</th><th>Chair</th><th>Status</th><th>Open actions</th><th></th></tr></thead><tbody>
      ${L.map(r => { const m = r.minutes; return `<tr><td>${esc(m.no)}</td><td>${m.v || 1}</td><td>${esc(m.meeting)}</td><td>${esc(m.date)}</td><td>${esc(m.chair)}</td><td>${m.status === 'approved' ? 'Approved ' + esc(d10(m.approved_at)) : 'Draft'}</td><td>${openActs(r)}</td><td><button class="btn sm" onclick="apxMin(${r.parent_id},${r.id})">View</button></td></tr>`; }).join('') || '<tr><td colspan="8">No minutes yet. Open a meeting note and tap 📄 Minutes.</td></tr>'}</tbody></table></div>`; };

  /* ---------- overlay helpers ---------- */
  function css() { if ($('mincss')) return; const s = document.createElement('style'); s.id = 'mincss';
    s.textContent = `#minov{position:fixed;inset:0;z-index:9000;background:rgba(15,14,51,.5);overflow:auto;padding:16px 10px 40px}
#minov .mw{max-width:880px;margin:0 auto;background:var(--surface,#fff);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}
#minov .g{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}#minov label{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:600}
#minov input,#minov textarea,#minov select{font:inherit;font-size:16px;padding:7px 9px;border:1px solid var(--line,#ccc);border-radius:8px;background:var(--surface,#fff);color:inherit}
#minov textarea{min-height:90px;resize:vertical}#minov .it{border:1px solid var(--line,#ddd);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px}
#minov table{width:100%;border-collapse:collapse;font-size:13px;min-width:0;display:table}#minov td,#minov th{border-bottom:1px solid var(--line,#eee);padding:4px 6px;text-align:left}
#minov .bar{display:flex;gap:8px;flex-wrap:wrap;position:sticky;bottom:-16px;background:var(--surface,#fff);padding:10px 0;border-top:1px solid var(--line,#ddd)}`;
    document.head.appendChild(s); }
  const shut = () => { const o = $('minov'); if (o) o.remove(); document.documentElement.style.overflow = ''; };
  const ov = html => { css(); shut(); const o = document.createElement('div'); o.id = 'minov'; o.innerHTML = `<div class="mw">${html}</div>`; document.body.appendChild(o); document.documentElement.style.overflow = 'hidden'; return o; };
  const tbl = (a, empty) => a.length ? `<table><thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${a.map(x => `<tr><td>${esc(x.t)}</td><td>${esc(x.o)}</td><td>${esc(x.d)}</td><td>${esc(x.s)}</td></tr>`).join('')}</tbody></table>` : `<i>${empty}</i>`;

  /* ---------- minutes editor / viewer ---------- */
  let M = null, NOTE = null, RID = null;
  window.apxMin = (noteId, minId) => {
    NOTE = rows().find(r => r.id === noteId); if (!NOTE) return;
    const r = minId ? rows().find(x => x.id === minId) : null; RID = r ? r.id : null;
    if (r) { M = JSON.parse(JSON.stringify(r.minutes)); if (M.status === 'approved') return view(); }
    else { const f = facts(NOTE), pv = prevNote(NOTE), ag = pv && agendaOf(pv.id), ty = (ag && ag.minutes.type) || guess(NOTE.title);
      M = { status: 'draft', no: nextNo(), v: 1, type: ty, meeting: NOTE.title, date: d10(NOTE.created_at), time: '', venue: '', chair: myName(), taker: myName(), attendees: NOTE.person || '', apologies: '',
        arising: f.arising, items: (ag ? ag.minutes.items.map(i => ({ h: i.h, d: '' })) : TYPES[ty][1].map(h => ({ h, d: '' }))), decisions: f.decisions, actions: f.actions, next: '' }; }
    edit();
  };
  function edit() {
    const F = (k, l, t) => `<label>${l}<input data-k="${k}" type="${t || 'text'}" value="${esc(M[k])}"></label>`;
    ov(`<div style="display:flex;gap:8px;align-items:center"><b style="flex:1;font-size:18px">📄 ${esc(M.no)} v${M.v} · Draft minutes</b><button class="btn sm" onclick="apxMinClose()">Close</button></div>
      ${M.change ? `<span class="famas">Version ${M.v}: ${esc(M.change)}</span>` : ''}
      <div class="g"><label>Meeting type<select data-k="type">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}"${k === M.type ? ' selected' : ''}>${l}</option>`).join('')}</select></label>${F('meeting', 'Meeting')}${F('date', 'Date', 'date')}${F('time', 'Time', 'time')}${F('venue', 'Venue / online')}${F('chair', 'Chair')}${F('taker', 'Minute-taker')}${F('attendees', 'Attendees')}${F('apologies', 'Apologies')}${F('next', 'Next meeting', 'date')}</div>
      <b>Matters arising (actions from the previous meeting)</b>${tbl(M.arising, 'No previous actions in this series.')}
      <div style="display:flex;gap:8px;align-items:center"><b style="flex:1">Agenda items and discussion</b><button class="btn sm" onclick="apxMinAva()">✨ Draft with Ava</button></div><span class="famas" id="minmsg">Ava drafts formal minute text from the meeting note's text only. Check every item.</span>
      <div id="minitems" style="display:flex;flex-direction:column;gap:8px"></div><button class="btn sm" style="align-self:flex-start" onclick="apxMinItem()">+ Add item</button>
      <label>Decisions (one per line)<textarea data-k="decisions">${esc((M.decisions || []).join('\n'))}</textarea></label>
      <b>Action register</b>${tbl(M.actions, 'No actions on this meeting note yet.')}<span class="famas">Actions come from the meeting note and are refreshed when you approve.</span>
      <div class="bar"><button class="btn y" onclick="apxMinSave()">Save draft</button><button class="btn" onclick="apxMinApprove()">✓ Approve &amp; lock</button><button class="btn" onclick="apxMinPdf(0)">🖨 Preview PDF</button>${RID && M.v === 1 ? '<button class="btn" onclick="apxMinDel()">Delete draft</button>' : ''}</div>`);
    items();
    $('minov').querySelectorAll('[data-k]').forEach(i => i.oninput = i.onchange = () => { const k = i.dataset.k;
      if (k === 'decisions') M.decisions = i.value.split('\n').map(x => x.trim()).filter(Boolean);
      else if (k === 'type') { const hs = TYPES[i.value][1], old = M.items; M.type = i.value; M.items = hs.map(h => ({ h, d: (old.find(o => o.h === h) || {}).d || '' })).concat(old.filter(o => o.d && !hs.includes(o.h))); items(); }
      else M[k] = i.value; });
  }
  function items() { const el = $('minitems'); if (!el) return;
    el.innerHTML = M.items.map((it, i) => `<div class="it"><div style="display:flex;gap:6px"><input value="${esc(it.h)}" style="flex:1;font-weight:600" oninput="apxMinIt(${i},'h',this.value)"><button class="btn sm" onclick="apxMinIt(${i},'x')" aria-label="Remove item">✕</button></div><textarea oninput="apxMinIt(${i},'d',this.value)" placeholder="What was discussed / noted">${esc(it.d)}</textarea></div>`).join(''); }
  window.apxMinIt = (i, k, v) => { if (k === 'x') { M.items.splice(i, 1); items(); } else M.items[i][k] = v; };
  window.apxMinItem = () => { M.items.push({ h: 'New item', d: '' }); items(); };
  window.apxMinClose = () => { shut(); M = null; };

  async function put(m) {
    const row = { kind: 'minutes', status: 'open', parent_id: NOTE.id, programme_id: NOTE.programme_id || null, title: `${m.no} v${m.v} · ${m.meeting}`, minutes: m, updated_at: new Date().toISOString() };
    const r = RID ? await sbc().from('desk_notes').update(row).eq('id', RID) : await sbc().from('desk_notes').insert(row).select('id').single();
    if (r.error) { D().say('Not saved: ' + r.error.message); return false; } if (!RID) RID = r.data.id; await D().reload(); return true;
  }
  window.apxMinSave = async () => { if (await put(M)) D().say('Minutes saved (draft)'); };
  window.apxMinDel = async () => { if (!RID || !confirm('Delete this draft?')) return; const { error } = await sbc().from('desk_notes').delete().eq('id', RID); if (error) return D().say(error.message); shut(); await D().reload(); };
  window.apxMinApprove = async () => {
    if (!M.chair || !M.date) { D().say('Add the chair and the date first.'); return; }
    if (!confirm(`Approve and lock ${M.no} v${M.v}? After this it cannot be changed; changes need a new version.`)) return;
    const f = facts(NOTE); M.arising = f.arising; M.actions = f.actions; if (!M.decisions.length) M.decisions = f.decisions;
    M.status = 'approved'; M.approved_by = myName(); M.approved_at = new Date().toISOString();
    if (await put(M)) { D().say(`${M.no} approved and locked`); view(); } else M.status = 'draft';
  };

  function view() {
    ov(`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1;font-size:18px">📄 ${esc(M.no)} v${M.v} · Approved ✓</b><button class="btn sm" onclick="apxMinClose()">Close</button></div>
      <span class="famas">Approved by ${esc(M.approved_by)} on ${esc(d10(M.approved_at))}. Locked: changes need a new version.</span>
      <div style="border:1px solid var(--line,#ddd);border-radius:10px;padding:12px;max-height:55vh;overflow:auto">${doc(M)}</div>
      <div class="bar"><button class="btn y" onclick="apxMinPdf(0)">🖨 PDF</button><button class="btn" onclick="apxMinPdf(1)">🖨 Tender sample (redacted)</button><button class="btn" onclick="apxMinNew()">New version</button></div>`);
  }
  window.apxMinNew = async () => {
    const why = prompt('What changes in the new version? (kept in the change history)'); if (!why) return;
    const m = JSON.parse(JSON.stringify(M)); m.v = (m.v || 1) + 1; m.status = 'draft'; m.prev = RID; m.change = why; delete m.approved_by; delete m.approved_at;
    M = m; RID = null; if (await put(M)) edit();
  };

  /* ---------- document (screen, PDF, redacted) ---------- */
  function doc(m) {
    const sec = (h, b) => `<h3>${esc(h)}</h3>${b}`, p = t => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`;
    let n = 2;
    return `<table class="hd"><tr><td><b>Meeting</b></td><td>${esc(m.meeting)} (${esc(TYPES[m.type] ? TYPES[m.type][0] : '')})</td><td><b>Minutes no.</b></td><td>${esc(m.no)} v${m.v}</td></tr>
      <tr><td><b>Date / time</b></td><td>${esc(m.date)} ${esc(m.time)}</td><td><b>Venue</b></td><td>${esc(m.venue)}</td></tr>
      <tr><td><b>Chair</b></td><td>${esc(m.chair)}</td><td><b>Minute-taker</b></td><td>${esc(m.taker)}</td></tr>
      <tr><td><b>Attendees</b></td><td colspan="3">${esc(m.attendees)}</td></tr><tr><td><b>Apologies</b></td><td colspan="3">${esc(m.apologies || 'None')}</td></tr></table>
      ${sec('1. Opening and attendance', p(`The meeting was opened by ${m.chair || 'the chair'}. Attendance as recorded above.`))}
      ${sec('2. Previous minutes and matters arising', tbl(m.arising || [], 'No matters arising.'))}
      ${(m.items || []).filter(i => !/^matters arising$/i.test(i.h)).map(i => sec(`${++n}. ${i.h}`, p(i.d || 'No matters raised.'))).join('')}
      ${sec(`${++n}. Decisions`, (m.decisions || []).length ? '<ol>' + m.decisions.map(d => `<li>${esc(d)}</li>`).join('') + '</ol>' : p('No decisions recorded.'))}
      ${sec(`${++n}. Action register`, tbl(m.actions || [], 'No actions.'))}
      ${sec(`${++n}. Next meeting`, p(m.next || 'To be confirmed.'))}
      ${sec(`${++n}. Approval`, m.status === 'approved' ? p(`Approved by ${m.approved_by} on ${d10(m.approved_at)}. Version ${m.v}.${m.change ? ' Change: ' + m.change : ''}`) : p('DRAFT - not yet approved.'))}`;
  }
  const ROLE = { admin: 'Administrator', head_of_ops: 'Head of Operations', pm: 'Programme Manager', programme_manager: 'Programme Manager', qa_specialist: 'QA Specialist', pi_specialist: 'PI Specialist', etqa: 'ETQA Officer', compliance_officer: 'Compliance Officer', ohs: 'OHS Officer', recruitment: 'Recruitment Officer' };
  function redact(m) {
    const rep = [], letter = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
    D().staff().forEach(s => { const rl = Array.isArray(s.r) ? s.r : Object.keys(s.r || {}); const role = ROLE[rl.find(x => ROLE[x])] || 'Staff member';
      if (s.N) { rep.push([s.N, role]); const f = s.N.split(/\s+/)[0]; if (f.length >= 3) rep.push([f, role]); } });
    D().progs().forEach((p, i) => { if (p.programme_name && p.programme_name.length >= 4) rep.push([p.programme_name, 'Programme ' + letter(i)]); rep.push(['#' + p.id, 'Programme ' + letter(i)]); });
    const cl = ((window.__preview || {}).data || {}).clients || []; cl.forEach((c, i) => { if (c.client_name && c.client_name.length >= 3) rep.push([c.client_name, 'Client ' + letter(i)]); });
    rep.sort((a, b) => b[0].length - a[0].length);
    const fix = t => { let s = String(t); rep.forEach(([a, b]) => { s = s.replace(new RegExp('(^|[^\\w])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])', 'gi'), '$1' + b); });
      return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\b\d{13}\b/g, '[ID]').replace(/(\+?\d[\d ()-]{7,}\d)/g, '[number]'); };
    const walk = v => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'no' || k === 'type' || k === 'status' || k === 'date' ? x : walk(x)])) : typeof v === 'string' ? fix(v) : v;
    return walk(m);
  }
  const PCSS = `@page{size:A4;margin:18mm 16mm 20mm;@bottom-left{content:"${'{NO}'}";font:9px sans-serif;color:#555}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px sans-serif;color:#555}}
body{font:11pt/1.45 'Open Sans',Arial,sans-serif;color:#0F0E33;margin:0}h1{font:700 18pt Montserrat,Arial,sans-serif;margin:8px 0 4px;color:#25247B}h3{font:700 12pt Montserrat,Arial,sans-serif;color:#25247B;margin:16px 0 4px;break-after:avoid}
table{width:100%;border-collapse:collapse;font-size:10pt;margin:4px 0}td,th{border:1px solid #c9c8e0;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eeeef8}.hd td{border-color:#ddd}
.lh{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #FFD400;padding-bottom:8px}.lh img{height:46px}.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font:800 54pt Montserrat,sans-serif;color:rgba(192,38,45,.12);transform:rotate(-24deg);pointer-events:none}
.note{background:#fff7cc;border:1px solid #e6c800;padding:6px 10px;font-size:9pt;margin:8px 0}@media screen{body{max-width:800px;margin:20px auto;padding:0 16px}}`;
  function printDoc(title, body, foot, red) {
    const w = window.open('', '_blank'); if (!w) { D().say('Allow pop-ups to open the PDF.'); return; }
    const logo = new URL('assets/lockup.png', location.href).href;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PCSS.replace('{NO}', foot.replace(/"/g, ''))}</style></head><body>
      ${red ? '<div class="wm">SAMPLE - REDACTED</div><div class="note">Sample for tender purposes. Names, clients, programmes and contact details have been replaced. Check for any remaining names before sharing.</div>' : ''}
      <div class="lh"><img src="${logo}" alt="Apex"><div style="text-align:right;font-size:9pt">Controlled document<br>${esc(foot)}</div></div><h1>${esc(title)}</h1>${body}
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
    w.document.close();
  }
  window.apxMinPdf = red => { const m = red ? redact(M) : M; printDoc(red ? 'Minutes of meeting (sample)' : 'Minutes: ' + m.meeting, doc(m), `${m.no} v${m.v} · ${m.status === 'approved' ? 'Approved ' + d10(m.approved_at) : 'DRAFT'}`, red); };
  window.apxMinRegPdf = () => { const L = latest();
    printDoc('Minutes register', `<p>Printed ${D().iso()}. Latest version of each set of minutes.</p><table><thead><tr><th>No.</th><th>Ver</th><th>Meeting</th><th>Type</th><th>Date</th><th>Chair</th><th>Status</th><th>Open actions</th></tr></thead><tbody>${L.map(r => { const m = r.minutes; return `<tr><td>${esc(m.no)}</td><td>${m.v || 1}</td><td>${esc(m.meeting)}</td><td>${esc(TYPES[m.type] ? TYPES[m.type][0] : '')}</td><td>${esc(m.date)}</td><td>${esc(m.chair)}</td><td>${m.status === 'approved' ? 'Approved ' + esc(d10(m.approved_at)) + ' by ' + esc(m.approved_by) : 'Draft'}</td><td>${openActs(r)}</td></tr>`; }).join('')}</tbody></table>`, 'Minutes register · ' + D().iso(), 0); };

  /* ---------- Ava drafts the discussion text (text only) ---------- */
  const scrub = t => String(t || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\b\d{13}\b/g, '[ID number]').replace(/(\+?\d[\d ()-]{7,}\d)/g, '[number]').slice(0, 8000);
  window.apxMinAva = async () => {
    const msg = $('minmsg'), txt = scrub(NOTE.body); if (!txt.trim()) { msg.textContent = 'The meeting note has no text for Ava to work from.'; return; }
    if (!confirm('Ava gets only the meeting note text (never photos), with emails, phone and ID numbers removed. Names in the text are still sent. Continue?')) return;
    msg.textContent = 'Ava is drafting…';
    try {
      const sb = sbc(), { data } = await sb.auth.getSession(), tok = data.session && data.session.access_token; if (!tok) throw new Error('Please sign in again.');
      const hs = M.items.map(i => i.h);
      const q = 'Write formal meeting minutes from the NOTES in the facts. For each heading write the minute in formal third person past tense (e.g. "It was noted that…", "The meeting agreed…"), only from the notes, keep every fact and the exact meaning, never invent. Use "No matters raised." if a heading has nothing. Reply with ONLY one JSON object: {"items":[{"h":"heading","d":"minute text"}],"decisions":["decision"],"extra":[{"h":"heading for notes that fit no heading","d":"minute text"}]}. Headings: ' + JSON.stringify(hs);
      const res = await fetch(sb.supabaseUrl + '/functions/v1/ava', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ type: 'ava', mode: 'ask', question: q, page: 'My desk minutes', facts: 'NOTES:\n' + txt, history: [] }) });
      const j = await res.json().catch(() => null);
      if (res.status === 429) throw new Error('Ava is busy (free AI limit). Try again in a minute.');
      if (!res.ok || !j || j.ok === false) throw new Error((j && j.error) || 'Request failed');
      const mm = String(j.answer || '').match(/\{[\s\S]*\}/); if (!mm) throw new Error('Ava did not return minutes. Try again.');
      const o = JSON.parse(mm[0]);
      (o.items || []).forEach(x => { const it = M.items.find(i => i.h === x.h); if (it && x.d && !it.d.trim()) it.d = String(x.d); });
      (o.extra || []).forEach(x => { if (x.h && x.d) M.items.splice(Math.max(0, M.items.length - 1), 0, { h: String(x.h), d: String(x.d) }); });
      if (Array.isArray(o.decisions) && o.decisions.length) { M.decisions = [...new Set((M.decisions || []).concat(o.decisions.map(String)))]; const t = $('minov').querySelector('[data-k=decisions]'); if (t) t.value = M.decisions.join('\n'); }
      items(); msg.textContent = 'Drafted. Check every item, then Save draft or Approve.';
    } catch (e) { msg.textContent = 'Sorry: ' + e.message; }
  };

  /* ---------- agenda for the next meeting ---------- */
  let A = null, AID = null;
  window.apxAgenda = noteId => {
    NOTE = rows().find(r => r.id === noteId); if (!NOTE) return; const r = agendaOf(noteId); AID = r ? r.id : null;
    const open = rows().filter(a => a.parent_id === noteId && a.kind === 'action' && a.status === 'open').map(act), ty = r ? r.minutes.type : guess(NOTE.title);
    A = r ? JSON.parse(JSON.stringify(r.minutes)) : { status: 'agenda', type: ty, meeting: NOTE.title, date: '', items: TYPES[ty][1].map(h => ({ h, d: /^matters arising$/i.test(h) ? open.map(x => `- ${x.t} (${x.o}${x.d ? ', due ' + x.d : ''})`).join('\n') : '' })) };
    ov(`<div style="display:flex;gap:8px;align-items:center"><b style="flex:1;font-size:18px">📋 Agenda for the next meeting</b><button class="btn sm" onclick="apxMinClose()">Close</button></div>
      <div class="g"><label>Meeting type<select id="agty">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}"${k === A.type ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>Meeting<input id="agm" value="${esc(A.meeting)}"></label><label>Date<input id="agd" type="date" value="${esc(A.date)}"></label></div>
      <span class="famas">Matters arising are the open actions from this meeting. The minutes of the next meeting in this series follow this agenda.</span>
      <div id="agitems" style="display:flex;flex-direction:column;gap:8px"></div><button class="btn sm" style="align-self:flex-start" onclick="apxAgIt(-1,'add')">+ Add item</button>
      <div class="bar"><button class="btn y" onclick="apxAgSave()">Save agenda</button><button class="btn" onclick="apxAgCopy()">📋 Copy text</button></div>`);
    $('agty').onchange = e => { const hs = TYPES[e.target.value][1], old = A.items; A.type = e.target.value; A.items = hs.map(h => old.find(o => o.h === h) || { h, d: '' }).concat(old.filter(o => o.d && !hs.includes(o.h))); agItems(); };
    $('agm').oninput = e => A.meeting = e.target.value; $('agd').oninput = e => A.date = e.target.value; agItems();
  };
  function agItems() { $('agitems').innerHTML = A.items.map((it, i) => `<div class="it"><div style="display:flex;gap:6px"><input value="${esc(it.h)}" style="flex:1;font-weight:600" oninput="apxAgIt(${i},'h',this.value)"><button class="btn sm" onclick="apxAgIt(${i},'x')" aria-label="Remove">✕</button></div><textarea oninput="apxAgIt(${i},'d',this.value)" placeholder="Notes for this item (optional)">${esc(it.d)}</textarea></div>`).join(''); }
  window.apxAgIt = (i, k, v) => { if (k === 'add') { A.items.push({ h: 'New item', d: '' }); agItems(); } else if (k === 'x') { A.items.splice(i, 1); agItems(); } else A.items[i][k] = v; };
  window.apxAgSave = async () => {
    const row = { kind: 'minutes', status: 'open', parent_id: NOTE.id, programme_id: NOTE.programme_id || null, title: 'Agenda · ' + A.meeting, minutes: A, updated_at: new Date().toISOString() };
    const r = AID ? await sbc().from('desk_notes').update(row).eq('id', AID) : await sbc().from('desk_notes').insert(row).select('id').single();
    if (r.error) return D().say('Not saved: ' + r.error.message); if (!AID) AID = r.data.id; await D().reload(); D().say('Agenda saved');
  };
  window.apxAgCopy = () => { const t = [`*Agenda: ${A.meeting}*`, A.date ? 'Date: ' + A.date : '', ''].concat(A.items.map((it, i) => `${i + 1}. ${it.h}${it.d ? '\n' + it.d : ''}`)).join('\n').trim();
    navigator.clipboard.writeText(t).then(() => D().say('Agenda copied. Paste it into WhatsApp or Teams.'), () => D().say('Could not copy.')); };
})();
