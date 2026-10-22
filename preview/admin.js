/* ApexOne redesign preview — screens carried over from live that the redesign was missing.
   Loaded after shell.js. Screens: PM Tracker, Assessors & Moderators (live menu "09 SETA Assessments"),
   Consolidated view (Head of Operations), Data & Sync Health, Audit log, User management.
   Each screen builds its own <main> and renders when its route opens.
   Role gates follow live's data-roles; RLS enforces the same on the server. */
(function () {
  const sb = window.__sb, P = window.__preview, write = window.previewWrite;
  if (!sb || !P || !write) return;

  const D = () => P.data || {};
  const has = (...r) => (P.roles || []).some(x => x === 'admin' || r.includes(x));
  const day = s => s ? String(s).slice(0, 10) : '';
  const iso = () => new Date().toISOString().slice(0, 10);
  const H = h => `<thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead>`;
  const none = (cols, msg) => `<tr><td colspan="${cols}" style="padding:24px;text-align:center;color:var(--muted)">${msg}</td></tr>`;
  const locked = (what, who) => `<div class="empty"><b>${what}</b><span>Needs the ${who} role.</span></div>`;
  const say = m => window.toast(m);
  const daysTo = d => d ? Math.round((new Date(day(d) + 'T00:00:00') - new Date(iso() + 'T00:00:00')) / 864e5) : null;
  const progName = id => (D().progs || []).find(p => p.id === id)?.programme_name || 'Programme ' + id;
  const clientName = cid => (D().clients || []).find(c => c.id === cid)?.client_name || '—';
  const learnersIn = pid => new Set((D().enrol || []).filter(e => e.programme_id === pid).map(e => e.learner_id)).size;
  const personName = id => (D().assessors || []).find(a => a.id === id)?.full_name || '';
  function csv(name, head, rows) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob([[head, ...rows].map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  const head = (title, sub, btns = '') => `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px"><div style="flex-grow:1;display:flex;flex-direction:column;gap:6px"><h1 style="font-size:26px">${title}</h1><span class="famas">${sub}</span></div>${btns}</div>`;
  const kpi = (l, v, n = '') => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span>${n ? `<span class="n">${n}</span>` : ''}</div>`;
  const sel = (id, lab, opts, cur, fn) => `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">${lab}<select id="${id}" class="cellin" style="height:36px;min-width:150px" onchange="${fn}"><option value="">All</option>${opts.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  const seg = (tabs, cur, fn) => `<div class="seg" style="flex:0 1 720px;flex-wrap:wrap">${tabs.map(([k, l, n]) => `<button class="${k === cur ? 'on' : ''}" onclick="${fn}('${k}')">${l}${n != null ? ` (${n})` : ''}</button>`).join('')}</div>`;

  /* ---------- views ---------- */
  const VIEWS = {
    hoo: ['Consolidated view', 'Overview', ['head_of_ops']],
    pmtracker: ['PM Tracker', 'Delivery', ['qa_specialist', 'project_manager', 'pi_specialist']],
    assessors: ['Assessors & Moderators', 'Quality & compliance', null],
    synchealth: ['Data & Sync Health', 'Admin', ['operations', 'project_manager']],
    audit: ['Audit log', 'Admin', ['head_of_ops']],
    users: ['User management', 'Admin', []]
  };
  // menu items are hidden for roles that cannot open them (index.html renderNav reads this)
  window.NAVR = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, () => !v[2] || has(...v[2])]));
  const anchor = $('view-dq');
  if (anchor) Object.keys(VIEWS).forEach(k => { if (!$('view-' + k)) anchor.insertAdjacentHTML('beforebegin', `<main id="view-${k}" hidden></main>`); });

  /* ---------- PM Tracker (live: Project Manager Tracker) ---------- */
  const PMF = { pm: '', client: '', type: '', q: '' };
  let PMS = []; Object.defineProperty(window, 'PMS_', { get: () => PMS });
  const pmQuality = p => !(p.qualification_name || p.saqa_id) || !p.start_date || !p.end_date;
  function pmRows() {
    return (D().progs || []).filter(p => (!PMF.pm || (p.project_manager_name || 'Unassigned') === PMF.pm)
      && (!PMF.client || clientName(p.client_id) === PMF.client) && (!PMF.type || (p.programme_type || '—') === PMF.type)
      && (!PMF.q || pmQuality(p)));
  }
  function renderPM() {
    const v = $('view-pmtracker');
    if (!has('qa_specialist', 'project_manager', 'pi_specialist')) { v.innerHTML = locked('PM Tracker', 'admin, QA, project manager or PI specialist'); return; }
    const all = D().progs || [], rows = pmRows();
    const pms = [...new Set(all.map(p => p.project_manager_name || 'Unassigned'))].sort();
    PMS = pms;
    const cards = pms.map((n, i) => {
      const ps = all.filter(p => (p.project_manager_name || 'Unassigned') === n);
      const act = ps.filter(p => p.status === 'active').length, lrn = ps.reduce((s, p) => s + learnersIn(p.id), 0), gaps = ps.filter(pmQuality).length;
      return `<button class="card" style="text-align:left;display:flex;flex-direction:column;gap:6px;cursor:pointer;${PMF.pm === n ? 'outline:2px solid var(--navy)' : ''}" onclick="adPM('pm',PMS_[${i}])">
        <b>${esc(n)}</b><span class="famas">${ps.length} programme${ps.length === 1 ? '' : 's'} · ${act} active · ${lrn} learners</span>
        ${gaps ? `<span class="badge b-warn">${gaps} missing qualification or dates</span>` : '<span class="badge b-ok">Data complete</span>'}</button>`;
    }).join('');
    v.innerHTML = head('Project Manager Tracker', 'Caseload per project manager, from the programmes in ApexOne',
      `<a class="btn" href="#programmes">Programmes</a><button class="btn" onclick="adPMcsv()">Export CSV</button><button class="btn" onclick="adPMtpl()">Download template</button><button class="btn y" onclick="toast('New programmes start in Programme Initiation')">+ Add programme</button>`)
      + `<div class="grid">${cards || '<div class="empty"><b>No programmes yet</b></div>'}</div>
      <section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px 20px;border-bottom:1px solid var(--line2)">
        ${sel('pmf-pm', 'Project manager', pms, PMF.pm, "adPM('pm',this.value)")}
        ${sel('pmf-c', 'Client', [...new Set(all.map(p => clientName(p.client_id)))].sort(), PMF.client, "adPM('client',this.value)")}
        ${sel('pmf-t', 'Programme type', [...new Set(all.map(p => p.programme_type || '—'))].sort(), PMF.type, "adPM('type',this.value)")}
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;height:36px"><input type="checkbox" ${PMF.q ? 'checked' : ''} onchange="adPM('q',this.checked?'1':'')"> Missing qualification or dates</label>
        <button class="btn sm ghost" onclick="adPM()">Clear</button><span class="famas" style="margin-left:auto">Showing ${rows.length} of ${all.length}</span></div>
        <div class="tw"><table class="dense">${H(['Prog ID', 'Project manager', 'Client', 'Qualification', 'Learners', 'Type', 'NQF', 'Start', 'End', 'Facilitator', 'Status', ''])}<tbody>
        ${rows.map(p => `<tr><td>${p.id}</td><td>${esc(p.project_manager_name || 'Unassigned')}</td><td>${esc(clientName(p.client_id))}</td>
          <td>${esc(p.qualification_name || p.programme_name || '')}${p.saqa_id ? ` <span class="famas">SAQA ${esc(p.saqa_id)}</span>` : ''}</td><td>${learnersIn(p.id)}</td>
          <td>${esc(p.programme_type || '—')}</td><td>${esc(p.nqf_level || '—')}</td><td>${p.start_date ? fmtD(day(p.start_date)) : '<span class="badge b-warn">Missing</span>'}</td>
          <td>${p.end_date ? fmtD(day(p.end_date)) : '<span class="badge b-warn">Missing</span>'}</td><td>${esc(personName(p.facilitator_id) || '—')}</td>
          <td>${esc(p.status || '')}</td><td><button class="btn sm" onclick="window.dvProg&&dvProg(${p.id});location.hash='programmes'">Open</button></td></tr>`).join('') || none(12, 'No programmes match these filters.')}
        </tbody></table></div></section>`;
  }
  window.adPM = (k, val) => { if (!k) Object.keys(PMF).forEach(x => PMF[x] = ''); else PMF[k] = PMF[k] === val && k === 'pm' ? '' : val; renderPM(); };
  window.adPMcsv = () => csv('pm-tracker.csv', ['Prog ID', 'Project manager', 'Client', 'Qualification', 'SAQA ID', 'Learners', 'Type', 'NQF', 'Start', 'End', 'Facilitator', 'Status'],
    pmRows().map(p => [p.id, p.project_manager_name || 'Unassigned', clientName(p.client_id), p.qualification_name || p.programme_name, p.saqa_id, learnersIn(p.id), p.programme_type, p.nqf_level, day(p.start_date), day(p.end_date), personName(p.facilitator_id), p.status]));
  window.adPMtpl = () => {
    if (!window.XLSX) return say('Excel library not loaded');
    const ws = XLSX.utils.aoa_to_sheet([['Project manager', 'Client', 'Programme name', 'Qualification', 'SAQA ID', 'Programme type', 'NQF level', 'Start date (yyyy-mm-dd)', 'End date (yyyy-mm-dd)', 'Facilitator']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Programmes'); XLSX.writeFile(wb, 'pm-tracker-template.xlsx');
    say('Template downloaded. Import stays switched off in the preview.');
  };

  /* ---------- Assessors & Moderators (live menu "09 SETA Assessments") ---------- */
  let AS = null, ASF = 'All';
  const asStatus = a => { const d = daysTo(a.registration_expiry_date); return d == null ? 'No expiry date' : d < 0 ? 'Expired' : d <= 90 ? 'Expiring soon' : 'Active'; };
  const ASB = { Active: 'b-ok', 'Expiring soon': 'b-warn', Expired: 'b-bad', 'No expiry date': '' };
  const mask = s => s ? '•••••••••' + String(s).slice(-4) : '—';
  const famOf = id => { const f = (D().famc || []).find(x => x.assessor_id === id); return !f ? ['No FAM record', ''] : f.missing_or_expired_documents > 0 ? [`${f.missing_or_expired_documents} document(s) missing or expired`, 'b-warn'] : ['Complete', 'b-ok']; };
  const canAs = () => has('qa_specialist', 'etqa');
  async function loadAs() {
    const r = await sb.from('assessors').select('id,full_name,role,email,phone,id_number,seta_registration_number,accreditation_body,registration_expiry_date,fields,owner_email').order('full_name');
    if (r.error) { say('Could not load assessors: ' + r.error.message); AS = []; } else AS = r.data || [];
  }
  async function renderAs() {
    const v = $('view-assessors');
    if (!AS) { v.innerHTML = '<div class="empty"><b>Loading…</b></div>'; await loadAs(); }
    const c = s => AS.filter(a => asStatus(a) === s).length;
    const rows = AS.filter(a => ASF === 'All' || asStatus(a) === ASF);
    v.innerHTML = head('Assessors & Moderators', 'Facilitators, assessors and moderators with their SETA / QCTO registration (live menu: 09 SETA Assessments)',
      `<button class="btn" onclick="adAsReload()">Reload</button><a class="btn" href="#fam">FAM Registry →</a>${canAs() ? '<button class="btn y" onclick="adAsEdit()">+ Add person</button>' : ''}`)
      + `<div class="grid">${kpi('Total', AS.length)}${kpi('Active', c('Active'))}${kpi('Expiring in 90 days', c('Expiring soon'), c('Expiring soon') ? '<span class="badge b-warn">Renew</span>' : '')}${kpi('Expired', c('Expired'), c('Expired') ? '<span class="badge b-bad">Action needed</span>' : '')}</div>
      <section class="card" style="padding:0"><div style="padding:14px 20px;border-bottom:1px solid var(--line2)">${seg(['All', 'Active', 'Expiring soon', 'Expired', 'No expiry date'].map(s => [s, s, s === 'All' ? AS.length : c(s)]), ASF, 'adAsF')}</div>
      <p class="note" style="margin:14px 20px 6px">ID numbers are masked (POPIA).</p>
      <div class="tw"><table class="dense">${H(['Full name', 'ID number', 'Role', 'Reg number', 'Accreditation body', 'Qualification(s)', 'Expiry date', 'Status', 'FAM status', ''])}<tbody>
      ${rows.map(a => { const st = asStatus(a), f = famOf(a.id); return `<tr><td><b>${esc(a.full_name || '')}</b>${a.email ? `<div class="famas">${esc(a.email)}</div>` : ''}</td><td>${mask(a.id_number)}</td><td>${esc(a.role || '')}</td>
        <td>${esc(a.seta_registration_number || '—')}</td><td>${esc(a.accreditation_body || '—')}</td><td>${esc(a.fields?.Qualifications || '—')}</td>
        <td>${a.registration_expiry_date ? fmtD(day(a.registration_expiry_date)) : '—'}</td><td><span class="badge ${ASB[st]}">${st}</span></td><td><span class="badge ${f[1]}">${f[0]}</span></td>
        <td>${canAs() ? `<button class="btn sm" onclick="adAsEdit(${a.id})">Edit</button>` : ''}</td></tr>`; }).join('') || none(10, AS.length ? 'Nobody in this group.' : 'No assessors yet. Use + Add person.')}
      </tbody></table></div></section>`;
  }
  window.adAsF = s => { ASF = s; renderAs(); };
  window.adAsReload = async () => { AS = null; await renderAs(); };
  window.adAsEdit = id => {
    const a = (AS || []).find(x => x.id === id) || {};
    const F = [['full_name', 'Full name *', 'text'], ['role', 'Role *', 'select', ['Facilitator', 'Assessor', 'Moderator', 'Assessor & Moderator']], ['id_number', 'ID number', 'text'],
      ['email', 'Email', 'email'], ['phone', 'Phone', 'text'], ['seta_registration_number', 'Registration number', 'text'], ['accreditation_body', 'Accreditation body (SETA / QCTO)', 'text'],
      ['registration_expiry_date', 'Registration expiry', 'date'], ['quals', 'Qualification(s)', 'text']];
    document.body.insertAdjacentHTML('beforeend', `<div id="adov" role="dialog" aria-modal="true" aria-label="Person" style="position:fixed;inset:0;background:rgba(0,20,45,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto">
      <form class="card" id="adform" style="width:min(720px,100%);display:flex;flex-direction:column;gap:12px"><h2>${id ? 'Edit person' : 'Add person'}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">${F.map(([k, l, t, o]) => { const val = k === 'quals' ? a.fields?.Qualifications : k === 'registration_expiry_date' ? day(a[k]) : a[k];
        return `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">${l}${t === 'select' ? `<select name="${k}" class="cellin" style="height:36px">${o.map(x => `<option${x === val ? ' selected' : ''}>${x}</option>`).join('')}</select>` : `<input name="${k}" type="${t}" class="cellin" style="height:36px" value="${esc(val || '')}">`}</label>`; }).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" onclick="$('adov').remove()">Cancel</button><button class="btn y">Save</button></div></form></div>`);
    $('adform').onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      if (!f.full_name.trim()) return say('Full name is required');
      const row = { full_name: f.full_name.trim(), role: f.role, id_number: f.id_number || null, email: f.email || null, phone: f.phone || null, seta_registration_number: f.seta_registration_number || null,
        accreditation_body: f.accreditation_body || null, registration_expiry_date: f.registration_expiry_date || null, fields: Object.assign({}, a.fields || {}, { Qualifications: f.quals || undefined }) };
      try {
        if (id) await write('Person', () => sb.from('assessors').update(row).eq('id', id));
        else await write('Person', () => sb.from('assessors').insert(Object.assign(row, { tenant_id: P.tenant })));
        $('adov').remove(); AS = null; say('Saved'); await renderAs();
      } catch (err) {}
    };
  };

  /* ---------- Consolidated view (live: Head of Operations) ---------- */
  let hooTimer = null, hooAt = null;
  function renderHoo() {
    const v = $('view-hoo');
    if (!has('head_of_ops')) { v.innerHTML = locked('Consolidated view', 'Head of Operations'); return; }
    const progs = D().progs || [], visits = D().visits || [], recs = D().recs || [], dv = window.dvApi;
    const lastVisit = pid => visits.filter(x => x.programme_id === pid).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const openRecs = pid => recs.filter(r => r.programme_id === pid && !r.resolved).length;
    const expiring = (D().assessors || []).length && AS ? AS.filter(a => ['Expiring soon', 'Expired'].includes(asStatus(a))).length : '—';
    const jb = j => /non|not|unsat|poor/i.test(j || '') ? 'b-bad' : /partial|improv|minor/i.test(j || '') ? 'b-warn' : j ? 'b-ok' : '';
    const ready = p => { if (!dv) return '—'; const ls = dv.learnersOf(p.id); if (!ls.length) return '—'; const n = ls.filter(l => dv.readiness(p, l).c.every(Boolean)).length; return `${n} / ${ls.length}`; };
    const act = progs.filter(p => p.status === 'active');
    v.innerHTML = head('Consolidated overview', `All programmes at a glance. Refreshes every 30 seconds while open${hooAt ? ` · last refreshed ${hooAt}` : ''}`,
      `<button class="btn" onclick="adHooRefresh()">Refresh live data</button><a class="btn" href="#reports">All reports</a><button class="btn" onclick="window.print()">Print</button>`)
      + `<div class="grid">${kpi('Programmes', progs.length, `${act.length} active`)}${kpi('Learners', (D().learners || []).length)}${kpi('Monitoring visits', visits.length)}
        ${kpi('Open recommendations', recs.filter(r => !r.resolved).length)}${kpi('Assessors expiring or expired', expiring)}</div>
      <section class="card"><h2 style="font-size:17px">Programme health</h2><span class="famas">Judgement from the latest monitoring visit per programme</span>
        <div class="grid" style="margin-top:12px">${act.map(p => { const lv = lastVisit(p.id), j = lv?.fields?.Judgement;
          return `<a class="card" href="#programmes" onclick="window.dvProg&&dvProg(${p.id})" style="display:flex;flex-direction:column;gap:6px;text-decoration:none;color:inherit"><b>${esc(p.programme_name || '')}</b><span class="famas">${esc(clientName(p.client_id))} · ${learnersIn(p.id)} learners</span>
            <span class="badge ${jb(j)}">${esc(j || 'No visit yet')}</span></a>`; }).join('') || '<div class="empty"><b>No active programmes</b></div>'}</div></section>
      <section class="card" style="padding:0"><div style="padding:14px 20px;border-bottom:1px solid var(--line2)"><h2 style="font-size:17px">Compliance summary</h2></div>
      <div class="tw"><table class="dense">${H(['Programme', 'Client', 'Learners', 'Last visit', 'Overall', 'EISA ready', 'Open recs', 'Status'])}<tbody>
      ${progs.map(p => { const lv = lastVisit(p.id), j = lv?.fields?.Judgement; return `<tr><td>${esc(p.programme_name || '')}</td><td>${esc(clientName(p.client_id))}</td><td>${learnersIn(p.id)}</td>
        <td>${lv ? fmtD(day(lv.created_at)) : '—'}</td><td>${j ? `<span class="badge ${jb(j)}">${esc(j)}</span>` : '—'}</td><td>${ready(p)}</td><td>${openRecs(p.id) || '—'}</td><td>${esc(p.status || '')}</td></tr>`; }).join('') || none(8, 'No programmes.')}
      </tbody></table></div></section>`;
    if (!AS) loadAs().then(() => { if (location.hash === '#hoo') renderHoo(); });
  }
  window.adHooRefresh = async () => { if (window.previewReload) await window.previewReload(); hooAt = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }); renderHoo(); };
  function hooAuto(on) { clearInterval(hooTimer); hooTimer = on ? setInterval(() => { if (location.hash === '#hoo' && !document.hidden) window.adHooRefresh(); else hooAuto(false); }, 30000) : null; }

  /* ---------- Data & Sync Health (live: ClickUp sync queue + learner data quality) ---------- */
  let OQ = null, OQF = 'attention';
  const oqSt = r => r.queue_type === 'legacy_failure' ? 'legacy' : r.queue_status;
  const OQT = { attention: ['Needs attention', r => ['retrying', 'quarantined', 'failed', 'legacy'].includes(oqSt(r))], queued: ['Queued', r => oqSt(r) === 'queued'], retrying: ['Retrying', r => oqSt(r) === 'retrying'],
    quarantined: ['Quarantined', r => ['quarantined', 'failed'].includes(oqSt(r))], legacy: ['Legacy failures (30 days)', r => oqSt(r) === 'legacy'] };
  async function renderOps() {
    const v = $('view-synchealth');
    if (!has('operations', 'project_manager')) { v.innerHTML = locked('Data & Sync Health', 'admin, operations or project manager'); return; }
    if (!OQ) { v.innerHTML = '<div class="empty"><b>Loading…</b></div>'; const r = await sb.from('v_clickup_operator_queue').select('*').order('updated_at', { ascending: false }).limit(500); OQ = r.error ? (say('Could not load the sync queue: ' + r.error.message), []) : r.data || []; }
    const rows = OQ.filter(OQT[OQF][1]), dq = D().dq || [];
    const ob = D().outbox || [], okN = ob.filter(o => o.status === 'succeeded').length;
    v.innerHTML = head('Data & Sync Health', 'ApexOne is the system of record; ClickUp mirrors it. Records are identified only by source table and record id.', '<button class="btn" onclick="adOpsReload()">Refresh</button>')
      + `<div class="grid">${Object.entries(OQT).map(([k, [l, f]]) => kpi(l, OQ.filter(f).length)).join('')}${kpi('Synced (latest 500)', okN)}</div>
      <section class="card" style="padding:0"><div style="padding:14px 20px;border-bottom:1px solid var(--line2)"><h2 style="font-size:17px;margin-bottom:10px">ClickUp sync queue</h2>${seg(Object.entries(OQT).map(([k, [l, f]]) => [k, l, OQ.filter(f).length]), OQF, 'adOpsF')}</div>
      <div class="tw"><table class="dense">${H(['Record', 'Status', 'Attempts', 'Last error', 'Next try', 'Updated', ''])}<tbody>
      ${rows.map(r => `<tr><td><code>${esc(r.source_table)}:${esc(r.source_record_id)}</code></td><td><span class="badge ${oqSt(r) === 'queued' ? '' : oqSt(r) === 'retrying' ? 'b-warn' : 'b-bad'}">${esc(oqSt(r))}</span></td>
        <td>${r.attempts ?? ''}</td><td style="max-width:360px">${esc(r.last_error || '')}</td><td>${r.next_action_at ? new Date(r.next_action_at).toLocaleString('en-ZA') : '—'}</td><td>${r.updated_at ? new Date(r.updated_at).toLocaleString('en-ZA') : ''}</td>
        <td>${has() && r.queue_type !== 'legacy_failure' && oqSt(r) !== 'queued' ? `<button class="btn sm" onclick="adRequeue('${esc(r.item_id)}')">Requeue</button>` : ''}</td></tr>`).join('') || none(7, 'Nothing here. The queue is clear.')}
      </tbody></table></div></section>
      <section class="card" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center"><div style="flex-grow:1"><h2 style="font-size:17px">Learner data quality</h2>
        <span class="famas">${has() ? `${dq.length} learner record${dq.length === 1 ? '' : 's'} flagged (missing, placeholder or invalid ID, same name). Decisions are recorded only; nothing is merged automatically.` : 'Admins review flagged learner records.'}</span></div>
        ${has() ? '<a class="btn y" href="#dq">Review data quality →</a>' : ''}</section>`;
  }
  window.adOpsF = k => { OQF = k; renderOps(); };
  window.adOpsReload = () => { OQ = null; renderOps(); };
  window.adRequeue = async id => {
    const reason = prompt('Reason for requeue (saved with the event)', 'Manual requeue from Data & Sync Health'); if (reason === null) return;
    try { await write('Requeue', () => sb.rpc('requeue_clickup_outbox', { p_outbox_id: Number(id), p_reason: reason })); say('Requeued'); window.adOpsReload(); } catch (e) {}
  };

  /* ---------- Audit log ---------- */
  const AF = { user: '', table: '', action: '', from: '', to: '' }; let AL = null;
  async function renderAudit() {
    const v = $('view-audit');
    if (!has('head_of_ops')) { v.innerHTML = locked('Audit log', 'admin or Head of Operations'); return; }
    if (!AL) {
      v.innerHTML = '<div class="empty"><b>Loading…</b></div>';
      let q = sb.from('audit_log').select('id,action,table_name,record_id,user_name,user_role,changes,created_at').order('created_at', { ascending: false }).limit(500);
      if (AF.user) q = q.eq('user_name', AF.user); if (AF.table) q = q.eq('table_name', AF.table); if (AF.action) q = q.eq('action', AF.action);
      if (AF.from) q = q.gte('created_at', AF.from); if (AF.to) q = q.lte('created_at', AF.to + 'T23:59:59');
      const r = await q; AL = r.error ? (say('Could not load the audit log: ' + r.error.message), []) : r.data || [];
    }
    const opt = k => [...new Set(AL.map(x => x[k]).filter(Boolean))].sort();
    const ch = c => { if (!c) return ''; const a = c.after || c.new || c, b = c.before || c.old || {}; const keys = Object.keys(a).filter(k => !['updated_at', 'created_at', 'tenant_id'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])).slice(0, 4);
      return keys.map(k => `<div><b>${esc(k)}</b>: ${esc(JSON.stringify(a[k])).slice(0, 80)}</div>`).join(''); };
    v.innerHTML = head('Audit log', 'Every create, update and delete, newest first (latest 500)', `<button class="btn" onclick="adAuF()">Clear filters</button><button class="btn" onclick="adAuCsv()">Export CSV</button><button class="btn" onclick="adAuReload()">Refresh</button>`)
      + `<section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px 20px;border-bottom:1px solid var(--line2)">
        ${sel('auf-u', 'User', opt('user_name'), AF.user, "adAuF('user',this.value)")}${sel('auf-t', 'Table', opt('table_name'), AF.table, "adAuF('table',this.value)")}${sel('auf-a', 'Action', opt('action'), AF.action, "adAuF('action',this.value)")}
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">From<input type="date" class="cellin" style="height:36px" value="${AF.from}" onchange="adAuF('from',this.value)"></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">To<input type="date" class="cellin" style="height:36px" value="${AF.to}" onchange="adAuF('to',this.value)"></label>
        <span class="famas" style="margin-left:auto">${AL.length} entr${AL.length === 1 ? 'y' : 'ies'}</span></div>
      <div class="tw"><table class="dense">${H(['When', 'User', 'Role', 'Action', 'Table', 'Record', 'Change'])}<tbody>
      ${AL.map(r => `<tr><td style="white-space:nowrap">${new Date(r.created_at).toLocaleString('en-ZA')}</td><td>${esc(r.user_name || 'system')}</td><td>${esc(r.user_role || '')}</td>
        <td><span class="badge ${r.action === 'delete' ? 'b-bad' : r.action === 'insert' ? 'b-ok' : ''}">${esc(r.action || '')}</span></td><td>${esc(r.table_name || '')}</td><td>${esc(r.record_id || '')}</td><td style="font-size:12px;max-width:380px">${ch(r.changes)}</td></tr>`).join('') || none(7, 'No entries match these filters.')}
      </tbody></table></div></section>`;
  }
  window.adAuF = (k, val) => { if (!k) Object.keys(AF).forEach(x => AF[x] = ''); else AF[k] = val; AL = null; renderAudit(); };
  window.adAuReload = () => { AL = null; renderAudit(); };
  window.adAuCsv = () => csv('audit-log.csv', ['When', 'User', 'Role', 'Action', 'Table', 'Record', 'Changes'], (AL || []).map(r => [r.created_at, r.user_name, r.user_role, r.action, r.table_name, r.record_id, JSON.stringify(r.changes)]));

  /* ---------- User management ---------- */
  const ROLES = [['admin', 'Admin'], ['head_of_ops', 'Head of Operations'], ['qa_specialist', 'QA specialist'], ['etqa', 'ETQA'], ['project_manager', 'Project manager'], ['operations', 'Operations'], ['pi_specialist', 'PI specialist'], ['compliance_officer', 'Compliance officer']];
  let US = null;
  async function renderUsers() {
    const v = $('view-users');
    if (!has()) { v.innerHTML = locked('User management', 'admin'); return; }
    if (!US) { v.innerHTML = '<div class="empty"><b>Loading…</b></div>'; const r = await sb.rpc('preview_list_users'); if (r.error) { US = null; v.innerHTML = head('User management', 'Who can sign in and what they can do') + `<div class="empty"><b>User management is not set up yet</b><span>Run migrations/preview_user_admin.sql in the Supabase SQL editor for apexone-preview. (${esc(r.error.message)})</span></div>`; return; } US = r.data || []; }
    const me = (P.user?.email || '').toLowerCase();
    v.innerHTML = head('User management', 'Who can sign in and what they can do. A role change applies when that person next signs in.', '<button class="btn y" onclick="adUserAdd()">+ Add user</button>')
      + `<section class="card" style="padding:0"><div class="tw"><table class="dense">${H(['Email', 'Roles', 'Signed up', 'Last sign-in', 'Note', ''])}<tbody>
      ${US.map((u, i) => `<tr><td><b>${esc(u.email)}</b>${u.email === me ? ' <span class="badge">You</span>' : ''}</td>
        <td><div style="display:flex;flex-wrap:wrap;gap:4px 12px">${ROLES.map(([k, l]) => `<label style="font-size:12px;white-space:nowrap"><input type="checkbox" data-u="${i}" value="${k}"${(u.roles || []).includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div></td>
        <td>${u.signed_up ? '<span class="badge b-ok">Yes</span>' : '<span class="badge b-warn">Not yet</span>'}</td><td>${u.last_sign_in_at ? fmtD(day(u.last_sign_in_at)) : 'never'}</td><td>${esc(u.note || '')}</td>
        <td style="white-space:nowrap"><button class="btn sm y" onclick="adUserSave(${i})">Save</button>${u.email === me ? '' : ` <button class="btn sm" style="color:var(--bad)" onclick="adUserRemove(${i})">Remove</button>`}</td></tr>`).join('') || none(6, 'No users.')}
      </tbody></table></div><p class="note" style="margin:12px 20px">Only @apexu.co.za addresses. Remove takes away roles and access; the sign-in account itself is kept. Every change is written to the audit log.</p></section>`;
  }
  const setRoles = async (email, roles, note) => { try { await write('User', () => sb.rpc('preview_set_user_roles', { p_email: email, p_roles: roles, p_note: note || null })); US = null; say('Saved. Applies at their next sign-in.'); renderUsers(); } catch (e) {} };
  window.adUserSave = i => { const roles = [...document.querySelectorAll(`#view-users input[data-u="${i}"]:checked`)].map(x => x.value); if (!roles.length) return say('Pick at least one role, or use Remove'); setRoles(US[i].email, roles); };
  window.adUserRemove = async i => { if (!confirm(`Remove access for ${US[i].email}?`)) return; try { await write('User', () => sb.rpc('preview_remove_user', { p_email: US[i].email })); US = null; say('Access removed'); renderUsers(); } catch (e) {} };
  window.adUserAdd = () => {
    const email = (prompt('Email address (@apexu.co.za)') || '').trim().toLowerCase(); if (!email) return;
    if (!/^[^@\s]+@apexu\.co\.za$/.test(email)) return say('Only @apexu.co.za addresses');
    const r = prompt('Roles, comma separated: ' + ROLES.map(x => x[0]).join(', '), 'project_manager'); if (!r) return;
    const roles = r.split(',').map(x => x.trim()).filter(Boolean), bad = roles.filter(x => !ROLES.some(y => y[0] === x));
    if (bad.length) return say('Unknown role: ' + bad.join(', '));
    setRoles(email, roles, prompt('Note (optional)', '') || null);
  };

  /* ---------- routing ---------- */
  const RENDER = { pmtracker: renderPM, assessors: renderAs, hoo: renderHoo, synchealth: renderOps, audit: renderAudit, users: renderUsers };
  function onRoute() { const r = location.hash.slice(1); hooAuto(r === 'hoo'); if (RENDER[r] && P.user) RENDER[r](); }
  addEventListener('hashchange', () => setTimeout(onRoute, 0));
  // called from applyAll after every data load
  window.previewAdmin = function () { AS = null; OQ = null; AL = null; const r = location.hash.slice(1); if (RENDER[r]) RENDER[r](); };
})();
