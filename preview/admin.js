/* ApexOne redesign preview — screens carried over from live that the redesign was missing.
   Loaded after shell.js. Screens: PM Tracker, Assessors & Moderators (live menu "09 SETA Assessments"),
   Consolidated view (Head of Operations), Data & Sync Health, Audit log, User management.
   Each screen builds its own <main> and renders when its route opens.
   Role gates follow live's data-roles; RLS enforces the same on the server. */
(function () {
  const sb = window.__sb, P = window.__preview, write = window.previewWrite;
  if (!sb || !P || !write) return;

  const D = () => P.data || {};
  const has = (...r) => (P.roles || []).some(x => x === 'admin' || x === 'demo' || r.includes(x));
  const day = s => s ? String(s).slice(0, 10) : '';
  const iso = () => new Date().toISOString().slice(0, 10);
  const H = h => `<thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead>`;
  const none = (cols, msg) => `<tr><td colspan="${cols}" style="padding:24px;text-align:center;color:var(--muted)">${msg}</td></tr>`;
  const locked = (what, who) => `<div class="empty"><b>${what}</b><span>Needs the ${who} role.</span></div>`;
  const say = m => { window.toast(m); const t = document.getElementById('toast'); if (t) t.textContent = m; };
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
  // Page access per role, agreed with Stavros 12 Nov 2026. Admin and demo see everything; null = everyone.
  const PM = 'project_manager', PI = 'pi_specialist', QA = 'qa_specialist', ET = 'etqa';
  const GATE = { mywork: null, desk: [], dashboard: null, reports: [PM, QA, ET, 'compliance_officer', 'head_of_ops'], hoo: ['head_of_ops'],
    clients: [PM, PI], pmtracker: [PM, PI], programmes: [PM, PI, QA], pi: [PI],
    learners: [PM, QA, ET], dq: [QA, ET], enrolments: [QA, ET], eisa: [QA, ET], qcto: [QA, ET, PI, PM],
    attendance: [PM, QA], visits: [PM, QA], recs: [PM, QA], modver: [QA, ET, PM], accred: [QA],
    signoff: [PI, 'compliance_officer', 'head_of_ops'], fam: [PI, 'ohs', 'fam_admin'], assessors: [QA, ET],
    synchealth: [], audit: [], users: [] };
  window.NAVR = Object.fromEntries(Object.entries(GATE).map(([k, r]) => [k, () => !r || has(...r)]));
  // A project manager (not admin/demo) sees only their own programmes and clients in My work, Clients and PM Tracker.
  const ALIAS = { thia: 'tia', johannes: 'hansie', hansie: 'johannes' };
  const myNames = () => { const u = P.user || {}, e = (u.email || '').split(/[@+.]/)[0].toLowerCase(), n = String(u.user_metadata?.name || '').toLowerCase().split(/\s+/)[0]; return [e, n, ALIAS[e], ALIAS[n]].filter(Boolean); };
  window.apxPMonly = () => (P.roles || []).includes(PM) && !(P.roles || []).some(r => r === 'admin' || r === 'demo');
  window.apxMineName = s => { const t = String(s || '').toLowerCase().split(/[^a-z]+/); return myNames().some(x => t.includes(x)); };
  window.apxMineProg = p => !apxPMonly() || apxMineName(p.project_manager_name);
  const guard = () => { const r = location.hash.slice(1).split('/')[0], no = P.user && NAVR[r] && !NAVR[r]();
    if (!window.APX_EMBED) { if (no) location.hash = 'mywork'; return; }
    let d = document.getElementById('apxNoAccess');
    if (no && !d) { d = document.createElement('div'); d.id = 'apxNoAccess'; d.setAttribute('role', 'alert'); d.style.cssText = 'position:fixed;inset:0;z-index:90;background:var(--ground,#fff);color:var(--ink,#111);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:16px/1.5 inherit'; d.innerHTML = '<div><b style="font-size:20px;display:block;margin-bottom:6px">You don\'t have access to this screen</b>Your ApexOne role doesn\'t include it. Ask an admin if you need it.</div>'; document.body.appendChild(d); }
    else if (!no && d) d.remove(); };
  addEventListener('hashchange', guard); setTimeout(guard, 0);
  const anchor = $('view-dq');
  if (anchor) Object.keys(VIEWS).forEach(k => { if (!$('view-' + k)) anchor.insertAdjacentHTML('beforebegin', `<main id="view-${k}" hidden></main>`); });

  /* ---------- PM Tracker (live: Project Manager Tracker) ---------- */
  const PMF = { pm: '', client: '', type: '', seta: '', q: '', a: '', st: 'Active', qs: '', pg: 0 };
  const toConf = p => String((p.fields || {}).imported) === 'true' && !(p.fields || {}).confirmed_at;
  const pf = (p, k) => ((p.fields || {})[k] || '');
  let PMS = []; Object.defineProperty(window, 'PMS_', { get: () => PMS });
  const pmOf = p => p.project_manager_name || 'Unassigned';
  const rs = p => (window.dvApi && dvApi.runState) ? dvApi.runState(p) : 'Planned';
  const noSaqa = p => !(String(p.saqa_id || '').trim() || String(pf(p, 'SAQA ID')).trim());
  const badDates = p => !p.start_date || !p.end_date || day(p.end_date) < day(p.start_date);
  const pmQuality = p => noSaqa(p) || badDates(p);
  const dIn = d => d ? Math.round((new Date(day(d)) - new Date(iso())) / 864e5) : null;
  const lastReg = p => { const r = (window.dvApi && dvApi.regDates) ? dvApi.regDates(p.id).filter(d => d <= iso()) : []; return r[r.length - 1] || ''; };
  const nextVisit = p => { let last = '', nx = ''; (D().visits || []).filter(v => v.programme_id === p.id).forEach(v => { const f = v.fields || {}, d = f['Date of Visit'] || f.Date || ''; if (d >= last) { last = d; nx = f['Next Visit Date'] || ''; } }); return nx; };
  const ACT = {
    end: ['Ending in 30 days', 'Active programme ends within 30 days', p => rs(p) === 'Active' && dIn(p.end_date) !== null && dIn(p.end_date) >= 0 && dIn(p.end_date) <= 30],
    reg: ['No register in 14 days', 'Running, but no attendance marked in the last 14 days', p => rs(p) === 'Active' && (!lastReg(p) || dIn(lastReg(p)) < -14)],
    vis: ['Visit due or overdue', 'Next visit date from the latest visit is within 14 days or past', p => rs(p) === 'Active' && nextVisit(p) && dIn(nextVisit(p)) <= 14],
    lrn: ['No learners enrolled', 'Running with no learners enrolled', p => rs(p) === 'Active' && !learnersIn(p.id)],
    rec: ['Recommendations overdue', 'Open recommendation past its due date', p => rs(p) === 'Active' && (D().recs || []).some(x => x.programme_id === p.id && !x.resolved && (x.fields || {})['Due Date'] && day((x.fields || {})['Due Date']) < iso())],
    ho: ['Awaiting hand-over', 'Started in Programme Initiation, hand-over not signed yet', p => !!p.intake_source_id && pf(p, '__stage') !== 'handed_over' && rs(p) !== 'Completed']
  };
  const SHORT = { end: 'Ending soon', reg: 'No register', vis: 'Visit due', lrn: 'No learners', rec: 'Recs overdue', ho: 'Awaiting hand-over' };
  const nk = x => String(x || '').trim().replace(/^SP:\s*/i, '');
  const ssG = (k, d) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, ssS = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  Object.assign(PMF, ssG('apxPMF', {}));
  const PMOPEN = new Set(ssG('apxPMopen', [])), isCol = pm => !(PMF.q || PMF.a) && !PMOPEN.has(pm);
  let pmRestored = false;
  window.addEventListener('scroll', () => { if (location.hash === '#pmtracker' && pmRestored) ssS('apxPMy', window.scrollY); }, { passive: true });
  const setaOf = p => { if (pf(p, 'SETA')) return pf(p, 'SETA'); const a = (D().accs || []).find(x => nk(x.saqa_id) && nk(x.saqa_id) === nk(p.saqa_id)); return a ? (a.quality_partner || a.seta || '') : ''; };
  const why = p => Object.keys(ACT).filter(k => ACT[k][2](p));
  const GAPS = { saqa: ['No SAQA', 'No SAQA ID on the programme', noSaqa], dates: ['Missing or bad dates', 'Start or end date blank, or end before start', badDates] };
  function pmRows() {
    const q = PMF.qs.toLowerCase();
    return (D().progs || []).filter(p => (!PMF.st || PMF.st === 'All' || rs(p) === PMF.st) && (!PMF.pm || pmOf(p) === PMF.pm)
      && (!PMF.client || clientName(p.client_id) === PMF.client) && (!PMF.type || (p.programme_type || '—') === PMF.type) && (!PMF.seta || (setaOf(p) || '—') === PMF.seta)
      && (!PMF.q || GAPS[PMF.q][2](p)) && (!PMF.a || ACT[PMF.a][2](p))
      && (!q || [p.display_id, p.id, '#' + p.id, clientName(p.client_id), p.qualification_name, p.programme_name, p.saqa_id].join(' ').toLowerCase().includes(q)));
  }
  function renderPM() {
    const v = $('view-pmtracker');
    if (!has('qa_specialist', 'project_manager', 'pi_specialist')) { v.innerHTML = locked('PM Tracker', 'admin, QA, project manager or PI specialist'); return; }
    const all = (D().progs || []).filter(apxMineProg), rows = pmRows().filter(apxMineProg), act = all.filter(p => rs(p) === 'Active');
    const pms = [...new Set(all.map(pmOf))].sort(); PMS = pms;
    const admin = (P.roles || []).includes('admin');
    const cnt = st => all.filter(p => st === 'All' || rs(p) === st).length;
    const tabs = ['Active', 'Planned', 'Completed', 'All'].map(t => `<button class="btn sm${PMF.st === t ? ' y' : ''}" onclick="adPM('st','${t}')">${t} (${cnt(t)})</button>`).join('');
    const sorted = rows.slice().sort((a, b) => pmOf(a).localeCompare(pmOf(b)) || String(a.start_date || '').localeCompare(String(b.start_date || '')));
    const vis = sorted.filter((p, i) => !isCol(pmOf(p)) || !i || pmOf(sorted[i - 1]) !== pmOf(p));
    const PER = 25, pages = Math.max(1, Math.ceil(vis.length / PER)); if (PMF.pg >= pages) PMF.pg = pages - 1;
    const page = vis.slice(PMF.pg * PER, PMF.pg * PER + PER);
    v.innerHTML = head('Project Manager Tracker', 'Caseload per project manager: programmes running now, with what needs attention',
      `<a class="btn" href="#programmes">Programmes</a><button class="btn" onclick="adPMcsv()">Export CSV</button>${admin ? '<button class="btn" onclick="adPMtpl()">Download template</button>' : ''}${(P.roles || []).some(r => r === 'admin' || r === 'pi_specialist') ? `<button class="btn y" onclick="location.hash='pi'" title="New programmes start in Programme Initiation, then go through hand-over">+ New programme</button>` : ''}`)
      + (pms.length ? `<div class="famtiles">${UI.tiles([{ t: `Caseload · running now · ${act.length}`, k: pms.map((n, i) => { const ps = all.filter(p => pmOf(p) === n), run = ps.filter(p => rs(p) === 'Active'), need = ps.filter(p => why(p).some(k => k !== 'reg')).length; return [esc(n), run.length, n === 'Unassigned' || need / Math.max(run.length, 1) >= 0.5 ? 'var(--bad,#b42318)' : need ? 'var(--warn)' : '', PMF.pm === n, `adPM('pm',PMS_[${i}])`, `${need} need attention · ${ps.filter(p => rs(p) === 'Planned').length} planned`]; }) },
        { t: 'Needs attention', k: Object.keys(ACT).map(k => [ACT[k][0], all.filter(ACT[k][2]).length, 'var(--warn)', PMF.a === k, `adPM('a','${PMF.a === k ? '' : k}')`, ACT[k][1]]) },
        { t: 'Data gaps (all programmes)', k: Object.keys(GAPS).map(k => [GAPS[k][0], all.filter(GAPS[k][2]).length, 'var(--warn)', PMF.q === k, `adPM('q','${PMF.q === k ? '' : k}')`, GAPS[k][1]]) }])}</div>` : '<div class="empty"><b>No programmes yet</b></div>')
      + `
      <section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:6px;padding:14px 20px 0">${tabs}</div><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px 20px;border-bottom:1px solid var(--line2)">
        <label class="f" style="min-width:220px"><span>Search</span><input id="pmq" placeholder="Search #id, client, qualification" value="${esc(PMF.qs)}" oninput="adPMq(this.value)"></label>
        ${sel('pmf-pm', 'Project manager', pms, PMF.pm, "adPM('pm',this.value)")}
        ${sel('pmf-c', 'Client', [...new Set(all.map(p => clientName(p.client_id)))].sort(), PMF.client, "adPM('client',this.value)")}
        ${sel('pmf-t', 'Programme type', [...new Set(all.map(p => p.programme_type || '—'))].sort(), PMF.type, "adPM('type',this.value)")}
        ${sel('pmf-s', 'SETA', [...new Set(all.map(p => setaOf(p) || '—'))].sort(), PMF.seta, "adPM('seta',this.value)")}
        <button class="btn sm" onclick="adPM()">Clear filters</button><span class="famas" style="margin-left:auto">Showing ${rows.length} of ${all.length}</span></div>
        <div class="tw"><table class="dense">${H(['Prog ID', 'State', 'Client', 'Qualification', 'Learners', 'Type · SETA', 'Dates', 'Facilitator / Assessor', ''])}<tbody>
        ${page.map((p, i, arr) => { const pm = pmOf(p), prev = i ? pmOf(arr[i - 1]) : null, st = rs(p), bd = badDates(p);
          const grp = sorted.filter(x => pmOf(x) === pm), na = grp.filter(x => why(x).some(k => k !== 'reg')).length, col = isCol(pm);
          return (pm !== prev ? UI.gh(`${col ? '▸' : '▾'} ${esc(pm)}`, grp.length, pm === 'Unassigned' ? 'var(--warn)' : 'var(--navy)', 9, na ? `${na} need attention` : '').replace('<tr class="famgh"', `<tr class="famgh" style="cursor:pointer" title="Click to ${col ? 'expand' : 'collapse'}" onclick='adPMcol(${JSON.stringify(pm).replace(/'/g, '&#39;')})'`) : '') + (col ? '' : `<tr class="famtr"><td><a href="#programmes" style="font-weight:600;color:var(--navy)" title="Open programme" onclick="window.dvProg&&dvProg(${p.id})">#${esc(p.display_id || p.id)}</a></td><td style="min-width:150px;max-width:240px"><div style="display:flex;flex-wrap:wrap;gap:4px"><span class="badge ${st === 'Active' ? 'b-ok' : st === 'Planned' ? 'b-info' : ''}">${st}</span>${why(p).map(k => k === 'ho' ? `<a class="badge b-warn" href="#handover/${p.id}">${SHORT[k]}</a>` : `<span class="badge b-warn" title="${esc(ACT[k][1])}">${SHORT[k]}</span>`).join('')}</div></td><td style="min-width:110px;max-width:160px;white-space:normal">${esc(clientName(p.client_id))}</td>
          <td style="min-width:240px;max-width:340px;white-space:normal">${esc(p.qualification_name || p.programme_name || '')}<div class="sub">${p.saqa_id ? `SAQA ${esc(p.saqa_id)}` : '<span class="badge b-warn">No SAQA</span>'}${pf(p, 'Cohort') || p.group_name ? ` · Cohort ${esc(pf(p, 'Cohort') || p.group_name)}` : ''}</div></td><td>${learnersIn(p.id)}</td>
          <td>${esc((t => t ? t[0].toUpperCase() + t.slice(1) : '—')(p.programme_type || ''))}<div class="sub">${esc(setaOf(p) || '—')}</div></td>
          <td style="white-space:nowrap">${p.start_date ? fmtD(day(p.start_date)) : '<span class="badge b-warn">No start</span>'} – ${p.end_date ? fmtD(day(p.end_date)) : '<span class="badge b-warn">No end</span>'}${bd && p.start_date && p.end_date ? '<div><span class="badge b-bad">End before start</span></div>' : ''}</td>
          <td>${esc(personName(p.facilitator_id) || pf(p, 'Facilitator') || '—')}<div class="sub">${esc(pf(p, 'Assessor') || '—')}</div></td>
          <td style="white-space:nowrap">${window.dvProgEdit && has('project_manager') ? `<button class="btn sm" onclick="location.hash='programmes';setTimeout(()=>dvProgEdit(${p.id}),300)">Edit</button> ` : ''}</td></tr>`); }).join('') || none(9, 'No programmes match these filters.')}
        </tbody></table></div>${pages > 1 ? `<div class="pgbar" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 20px"><button class="btn sm" ${PMF.pg ? '' : 'disabled'} onclick="adPMpg(-1)">Previous</button><span class="famas">Page ${PMF.pg + 1} of ${pages}</span><button class="btn sm" ${PMF.pg < pages - 1 ? '' : 'disabled'} onclick="adPMpg(1)">Next</button></div>` : ''}</section>`;
    ssS('apxPMF', PMF);
    if (!pmRestored && (D().progs || []).length) { pmRestored = true; const y = ssG('apxPMy', 0); if (y) setTimeout(() => window.scrollTo(0, y), 50); }
  }
  window.adPMpg = d => { PMF.pg += d; renderPM(); };
  window.adPMcol = pm => { PMOPEN.has(pm) ? PMOPEN.delete(pm) : PMOPEN.add(pm); ssS('apxPMopen', [...PMOPEN]); renderPM(); };
  let pmT; window.adPMq = val => { PMF.qs = val; PMF.pg = 0; clearTimeout(pmT); pmT = setTimeout(() => { renderPM(); const e = $('pmq'); if (e) { e.focus(); e.setSelectionRange(val.length, val.length); } }, 250); };
  window.adPM = (k, val) => { if (!k) { const st = PMF.st; Object.keys(PMF).forEach(x => PMF[x] = ''); PMF.st = st; PMF.pg = 0; } else { PMF[k] = PMF[k] === val && k === 'pm' ? '' : val; PMF.pg = 0; if (k === 'a' && val) PMF.st = 'All'; } renderPM(); };
  window.adPMconf = async id => {
    const p = (D().progs || []).find(x => x.id === id); if (!p) return;
    try {
      const cur = await sb.from('programmes').select('fields').eq('id', id).single(); if (cur.error) throw cur.error;
      const f = Object.assign({}, cur.data.fields || {}, { confirmed_at: new Date().toISOString(), confirmed_by: P.user.email });
      await write('Confirm programme', () => sb.from('programmes').update({ fields: f }).eq('id', id));
      p.fields = f; say('Programme confirmed'); renderPM();
    } catch (e) {}
  };
  // Signed proposal intake: client (new or existing) + initiated programme (lands in "To confirm") + pasted learner list
  window.adIntake = () => {
    const cls = (D().clients || []).filter(c => !c.deleted_at), cn = c => c.client_name || (c.fields || {})['Company Name'] || '';
    const st = 'border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;background:transparent;color:var(--ink)';
    const L = (l, h) => `<label style="display:flex;flex-direction:column;gap:4px;font-size:13px">${l}${h}</label>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="New programme from signed proposal"><form class="card" id="adin" style="max-width:640px;max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:10px"><h2>New programme from signed proposal</h2>
      ${L('Client * (pick or type a new one)', `<input name="client" list="adincl" required style="${st}"><datalist id="adincl">${cls.map(c => `<option value="${esc(cn(c))}">`).join('')}</datalist>`)}
      ${L('Qualification / programme name *', `<input name="qual" required style="${st}">`)}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">${L('Qualification code', `<input name="code" style="${st}">`)}${L('NQF', `<input name="nqf" style="${st}">`)}${L('Type', `<select name="ptype" style="${st}"><option value="occupational">Occupational</option><option value="legacy">Legacy</option></select>`)}
      ${L('Start date', `<input type="date" name="start" style="${st}">`)}${L('Proposal date', `<input type="date" name="pdate" style="${st}">`)}${L('Project manager', `<select name="pm" style="${st}"><option value="">To assign</option>${(PMS || []).filter(n => n !== 'Unassigned').map(n => `<option>${esc(n)}</option>`).join('')}</select>`)}</div>
      ${L('Notes (facilitator, moderator, group size…)', `<textarea name="note" rows="2" style="${st}"></textarea>`)}
      ${L('Learners (optional): paste rows from Excel — first name, surname, ID number, phone, email', `<textarea name="lrn" rows="5" style="${st}" placeholder="Thandi	Hadebe	9711260991081	0676902353	thandi@mail.com"></textarea>`)}
      <div class="sub" id="adinerr" style="color:var(--bad)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" onclick="document.getElementById('famov').remove()">Cancel</button><button class="btn y" id="adinsave">Create programme</button></div></form></div>`);
    $('adin').onsubmit = async ev => {
      ev.preventDefault(); const f = $('adin').elements, b = $('adinsave'); b.disabled = true; b.textContent = 'Saving…';
      try {
        const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''), name = f.client.value.trim();
        let cl = cls.find(c => norm(cn(c)) === norm(name)), src = 'Proposal intake ' + new Date().toISOString().slice(0, 10) + ' by ' + P.user.email;
        if (!cl) { const r = await sb.from('clients').insert({ tenant_id: P.tenant, client_name: name, fields: { source: src } }).select('id').single(); if (r.error) throw r.error; cl = r.data; }
        const pm = f.pm.value, own = pm ? ((D().progs || []).find(p => p.project_manager_name === pm && p.owner_email) || {}).owner_email : null;
        const code = f.code.value.trim(), qual = f.qual.value.trim();
        const pr = await sb.from('programmes').insert({ tenant_id: P.tenant, client_id: cl.id, programme_name: code ? code + ': ' + qual : qual, qualification_name: qual, saqa_id: code || null, nqf_level: f.nqf.value.trim() || null,
          start_date: f.start.value || null, status: 'initiated', programme_type: f.ptype.value, project_manager_name: pm || null, owner_email: own || null,
          fields: { imported: true, source: src, proposal_date: f.pdate.value || null, note: f.note.value.trim() || null } }).select('id').single();
        if (pr.error) throw pr.error;
        const rows = f.lrn.value.split(/\r?\n/).map(l => l.split(/\t|;|,/).map(x => x.trim())).filter(r => r[0] && r[1]);
        let added = 0;
        if (rows.length) {
          const ids = rows.map(r => (r[2] || '').replace(/\D/g, '')).filter(Boolean), ex = ids.length ? await sb.from('learners').select('id,id_number').in('id_number', ids) : { data: [] };
          const have = new Map((ex.data || []).map(x => [String(x.id_number).replace(/\D/g, ''), x.id])), lids = [];
          for (const r of rows) { const idn = (r[2] || '').replace(/\D/g, '');
            if (idn && have.has(idn)) { lids.push(have.get(idn)); continue; }
            const l = await sb.from('learners').insert({ tenant_id: P.tenant, first_name: r[0], last_name: r[1], id_number: idn || null, phone: r[3] || null, email: r[4] || null, fields: { source: src } }).select('id').single();
            if (l.error) throw l.error; lids.push(l.data.id); added++; }
          if (lids.length) { const e = await sb.from('enrolments').insert(lids.map(id => ({ tenant_id: P.tenant, learner_id: id, programme_id: pr.data.id, status: 'active', fields: { source: src } }))); if (e.error) throw e.error; }
        }
        $('famov').remove(); say(`Programme created${rows.length ? ` · ${rows.length} learners enrolled (${added} new)` : ''} · now in "To confirm"`); if (window.previewReload) await window.previewReload(); renderPM();
      } catch (e) { $('adinerr').textContent = e.message || String(e); b.disabled = false; b.textContent = 'Create programme'; }
    };
  };
  window.adPMcsv = () => csv('pm-tracker.csv', ['Prog ID', 'Project manager', 'Client', 'Qualification', 'SAQA ID', 'Cohort', 'Learners', 'Employment', 'Mode', 'SETA', 'Type', 'NQF', 'Start', 'End', 'Facilitator', 'Assessor', 'Status'],
    pmRows().filter(apxMineProg).map(p => [p.display_id || p.id, p.project_manager_name || 'Unassigned', clientName(p.client_id), p.qualification_name || p.programme_name, p.saqa_id, pf(p, 'Cohort') || p.group_name, learnersIn(p.id), pf(p, 'Employment Status'), pf(p, 'Mode of Delivery'), pf(p, 'SETA'), p.programme_type, p.nqf_level || pf(p, 'NQF'), day(p.start_date), day(p.end_date), personName(p.facilitator_id) || pf(p, 'Facilitator'), pf(p, 'Assessor'), p.status]));
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
    document.body.insertAdjacentHTML('beforeend', `<div id="adov" role="dialog" aria-modal="true" aria-label="Person" style="position:fixed;inset:0;background:rgba(1,0,45,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto">
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

  /* ---------- shared helpers (admin pages) ---------- */
  const apP = id => (D().progsAll || D().progs || []).find(p => String(p.id) === String(id));
  const apPid = p => '#' + (p.display_id || p.id);
  const apCl = p => ((D().clients || []).find(c => String(c.id) === String(p?.client_id)) || {}).client_name || '';
  const apLink = id => { const p = apP(id); return p ? `<a href="#programmes" onclick="dvApi.setProg(${p.id});setTimeout(()=>window.dvProg&&dvProg(${p.id}),50)"><b>${esc(apPid(p))}</b></a>` : `#${esc(id)}`; };
  const apTs = x => x ? new Date(x).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const apDays = x => x ? Math.floor((Date.now() - new Date(x)) / 864e5) : 0;
  const apPg = (n, pg, fn, size = 25) => { const m = Math.max(1, Math.ceil(n / size)); return n > size ? `<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 20px"><span class="famas">Page ${pg + 1} of ${m} · ${n} rows</span><button class="btn sm" ${pg ? '' : 'disabled'} onclick="${fn}(${pg - 1})">‹ Prev</button><button class="btn sm" ${pg + 1 < m ? '' : 'disabled'} onclick="${fn}(${pg + 1})">Next ›</button></div>` : ''; };

  /* ---------- Sign-off queue (replaces the base renderSO) ---------- */
  let SOS = 'waiting', SOK = '', SOQ = '', HS = null;
  const soPid = s => s.ref_table === 'programmes' || s.ref_table === 'handoff_signoffs' ? s.ref_id
    : s.ref_table === 'recommendations' ? ((D().recs || []).find(r => String(r.id) === String(s.ref_id)) || {}).programme_id
    : s.ref_table === 'monitoring_visits' ? ((D().visits || []).find(r => String(r.id) === String(s.ref_id)) || {}).programme_id : null;
  const soKind = k => { k = String(k || 'other').replace(/_/g, ' '); return k.charAt(0).toUpperCase() + k.slice(1); };
  const soSt = s => s.status === 'waiting' ? 'waiting' : s.status === 'returned' ? 'returned' : 'done';
  window.renderSO = function () {
    const f = $('sofilter'), l = $('solist'); if (!f || !l) return;
    if (HS === null) { HS = []; sb.from('handoff_signoffs').select('programme_id,status,updated_at,handed_over_at').then(r => { HS = r.data || []; if (location.hash === '#signoff') window.renderSO(); }); }
    const all = D().signoffs || [], inS = s => SOS === 'all' || soSt(s) === SOS;
    const txt = s => { const p = apP(soPid(s)); return [s.title, s.detail, s.submitted_by, s.kind, p && apPid(p), p && apCl(p), p && p.programme_name].join(' ').toLowerCase(); };
    const sc = all.filter(inS), kinds = [...new Set(all.map(s => s.kind || 'other'))].sort();
    const rows = sc.filter(s => (!SOK || (s.kind || 'other') === SOK) && (!SOQ || txt(s).includes(SOQ.toLowerCase())))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const cnt = k => all.filter(s => k === 'all' || soSt(s) === k).length;
    f.removeAttribute('style'); f.className = '';
    f.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">${seg([['waiting', 'Waiting', cnt('waiting')], ['returned', 'Returned', cnt('returned')], ['done', 'Approved', cnt('done')], ['all', 'All', cnt('all')]], SOS, 'adSoS')}
      <input id="soq" class="cellin" style="height:36px;min-width:240px" placeholder="Search #id, client, title, person" value="${esc(SOQ)}" oninput="adSoQ(this.value)"></div>
      ${kinds.length ? `<div class="famtiles" style="margin-top:10px">${UI.tiles([{ t: 'By type', k: kinds.map(k => [esc(soKind(k)), sc.filter(s => (s.kind || 'other') === k).length, '', SOK === k, `adSoK('${esc(k)}')`]) }])}</div>` : ''}`;
    const it = typeof soItems === 'function' ? soItems() : [];
    const card = s => { const i = it.findIndex(x => x[0] === String(s.id)), p = apP(soPid(s)), st = soSt(s), open = soOpen === String(s.id) && st === 'waiting', age = apDays(s.created_at);
      const href = s.ref_table === 'learners' ? '#dq' : s.ref_table === 'recommendations' ? '#recs' : s.ref_table === 'monitoring_visits' ? '#visit/' + s.ref_id : s.ref_table === 'handoff_signoffs' || s.kind === 'handover' ? '#handover/' + s.ref_id : '';
      return `<article class="card" style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">
      <div style="flex:1 1 360px;min-width:0;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;flex-wrap:wrap;gap:6px"><span class="badge b-n">${esc(soKind(s.kind))}</span>
          ${st === 'waiting' ? `<span class="badge ${age > 7 ? 'b-bad' : age > 3 ? 'b-warn' : ''}">Waiting ${age} day${age === 1 ? '' : 's'}</span>` : `<span class="badge ${s.status === 'approved' ? 'b-ok' : 'b-warn'}">${s.status === 'approved' ? 'Approved' : 'Returned'} · ${esc((s.decided_by || '').split('@')[0])} ${s.decided_at ? fmtD(day(s.decided_at)) : ''}</span>`}</div>
        ${p ? `<span>${apLink(p.id)} · ${esc(apCl(p))}<br><span class="sub">${esc(p.programme_name || '')}</span></span>` : ''}
        <b style="font-size:15px">${esc(s.title || '')}</b>${s.detail ? `<span class="sub">${esc(s.detail)}</span>` : ''}
        <span class="sub">Submitted by ${esc(s.submitted_by || '—')} · ${s.created_at ? fmtD(day(s.created_at)) : ''}${href ? ` · <a href="${href}">Open</a>` : ''}</span>
        ${s.comment ? `<span class="sub">Comment: “${esc(s.comment)}”</span>` : ''}
        ${open ? `<label class="f" style="margin-top:6px">What needs to change?<textarea id="socmt" rows="3" oninput="$('sosend').disabled=!this.value.trim()"></textarea></label><div style="display:flex;gap:8px"><button class="btn sm n" id="sosend" disabled onclick="soAct(${i},'returned')">Send back</button><button class="btn sm" onclick="soOpen=null;renderSO()">Cancel</button></div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${i < 0 ? '' : st !== 'waiting' ? `<button class="btn sm" onclick="adSoReopen(${i})">Reopen decision</button>` : open ? '' : `<button class="btn sm" onclick="soOpen='${s.id}';renderSO()">Return…</button><button class="btn sm y" onclick="soAct(${i},'approved')">Approve</button>`}</div></article>`; };
    const prep = (HS || []).filter(h => !h.handed_over_at && h.status !== 'handed_over' && apP(h.programme_id) && !apP(h.programme_id).deleted_at);
    l.innerHTML = (rows.map(card).join('') || `<div class="empty"><b>${SOS === 'waiting' && !SOQ && !SOK ? 'Queue is clear' : 'Nothing matches'}</b><span>${SOS === 'waiting' && !SOQ && !SOK ? 'Nothing is waiting for a sign-off decision.' : 'Try another tab, type or search.'}</span></div>`)
      + (SOS === 'waiting' && prep.length ? `<details class="card"><summary style="cursor:pointer"><b>Coming up · ${prep.length} hand-over${prep.length === 1 ? '' : 's'} being prepared</b> <span class="famas">Not in the queue yet: they arrive here when submitted</span></summary>
        <div class="tw" style="margin-top:10px"><table class="dense">${H(['Programme', 'Client', 'Status', 'Last change', ''])}<tbody>${prep.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at)).map(h => { const p = apP(h.programme_id); return `<tr><td>${apLink(p.id)} <span class="sub">${esc(p.programme_name || '')}</span></td><td>${esc(apCl(p))}</td><td><span class="badge">Preparing</span></td><td>${apDays(h.updated_at)} days ago</td><td><a class="btn sm" href="#handover/${p.id}">Open</a></td></tr>`; }).join('')}</tbody></table></div></details>` : '');
    if (soOpen && $('socmt')) $('socmt').focus();
  };
  window.adSoS = k => { SOS = k; window.renderSO(); };
  window.adSoK = k => { SOK = SOK === k ? '' : k; window.renderSO(); };
  window.adSoQ = v => { SOQ = v || ''; window.renderSO(); const e = $('soq'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } };
  window.adSoReopen = i => { if (confirm('Reopen this decision? The item goes back to Waiting.')) soAct(i); };

  /* ---------- Data & Sync Health (live: ClickUp sync queue + learner data quality) ---------- */
  let OQ = null, OQF = 'attention';
  const oqSt = r => r.queue_type === 'legacy_failure' ? 'legacy' : r.queue_status;
  const OQT = { attention: ['Needs attention', r => ['retrying', 'quarantined', 'failed', 'legacy'].includes(oqSt(r))], queued: ['Queued', r => oqSt(r) === 'queued'], retrying: ['Retrying', r => oqSt(r) === 'retrying'],
    quarantined: ['Quarantined', r => ['quarantined', 'failed'].includes(oqSt(r))], legacy: ['Legacy failures (30 days)', r => oqSt(r) === 'legacy'] };
  let OH = null, OHt = '';
  async function renderOps() {
    const v = $('view-synchealth');
    if (!has('operations', 'project_manager')) { v.innerHTML = locked('Data & Sync Health', 'admin, operations or project manager'); return; }
    if (!OQ) { v.innerHTML = '<div class="empty"><b>Loading…</b></div>';
      const [r, h, au, fb] = await Promise.all([sb.from('v_clickup_operator_queue').select('*').order('updated_at', { ascending: false }).limit(500), sb.rpc('ops_health'), sb.rpc('ava_usage'), sb.from('ava_feedback').select('created_at,user_email,page,question,answer,rating').order('created_at', { ascending: false }).limit(200)]); window.__avaU = au.error ? null : au.data; window.__avaF = fb.error ? [] : fb.data || [];
      OQ = r.error ? (say('Could not load the sync queue: ' + r.error.message), []) : r.data || []; OH = h.error ? null : h.data; OHt = apTs(new Date()); }
    const rows = OQ.filter(OQT[OQF][1]), dq = D().dq || [];
    const ob = D().outbox || [], okN = ob.filter(o => o.status === 'succeeded').length, att = OQ.filter(OQT.attention[1]).length;
    const al = OH ? (OH.alerts || []) : [];
    const hk = OH ? [['Failed scheduled jobs (48 h)', OH.cron_fail, (OH.cron_list || []).join(', ')], ['Report emails not sent (7 days)', OH.mail_stuck, ''], ['Report cards stuck (10+ min)', OH.cards_dirty, ''], ['ClickUp sync alerts', al.length, al.map(a => a.message || a.code || JSON.stringify(a)).join('; ').slice(0, 200)]] : [];
    const bad = att + hk.reduce((s, x) => s + (+x[1] || 0), 0);
    v.innerHTML = head('Data & Sync Health', 'ApexOne is the system of record; ClickUp mirrors it. Records are identified only by source table and record id.', (has() ? '<button class="btn" onclick="rpXlsx()" title="Every data set in one Excel file, test records left out">Backup: everything (.xlsx)</button>' : '') + '<button class="btn" onclick="adOpsReload()">Refresh</button>')
      + `<section class="card" style="border-left:4px solid var(${bad ? '--bad' : '--ok'});display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center"><b style="font-size:16px">${bad ? `${bad} item${bad === 1 ? '' : 's'} need attention` : 'All healthy'}</b>
        <span class="famas">${OH ? `Last scheduled job ${apTs(OH.last_cron)} · last report card sync ${apTs(OH.last_card_sync)} · ` : has() ? 'Health checks could not be loaded · ' : 'Health checks are admin only · '}checked ${OHt}</span></section>
      <div class="famtiles">${UI.tiles([...(hk.length ? [{ t: 'Health checks', k: hk.map(([l, n, t]) => [l, n, n ? 'var(--bad)' : 'var(--ok)', false, '', t || (n ? 'Needs a look' : 'OK')]) }] : []),
        { t: 'ClickUp sync queue', k: [...Object.entries(OQT).map(([k, [l, f]]) => { const n = OQ.filter(f).length; return [l, n, n && k !== 'queued' ? 'var(--bad)' : '', OQF === k, `adOpsF('${k}')`]; }), ['Synced (latest 500)', okN, 'var(--ok)', false, '']] }])}</div>
      ${(() => { const U = window.__avaU; if (!U || !U.users) return ''; const us = U.users;
        return `<section class="card" style="padding:0"><div style="padding:14px 20px;border-bottom:1px solid var(--line2)"><h2 style="font-size:17px">AI usage (Ava and AI features)</h2><span class="famas">Limits per person per day: Ava ${U.ava_cap} questions, all AI features ${U.all_cap}. They reset at midnight. The free Google quota is shared by everyone and resets about 10:00.</span></div>
        ${us.length ? `<div class="tw"><table class="dense">${H(['User', 'Ava today', 'All AI today', 'Ava 7 days', 'All AI 7 days'])}<tbody>${us.map(x => { const w = x.ava_today >= U.ava_cap * .8 || x.all_today >= U.all_cap * .8; return `<tr><td>${esc(x.email)}</td><td>${x.ava_today} / ${U.ava_cap}${w ? ' <span class="badge b-warn">Near limit</span>' : ''}</td><td>${x.all_today} / ${U.all_cap}</td><td>${x.ava_7d}</td><td>${x.all_7d}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="note" style="padding:0 20px 14px">No AI use in the last 7 days.</p>'}
        ${(() => { const F = window.__avaF || [], up = F.filter(x => x.rating > 0).length, dn = F.filter(x => x.rating < 0); return F.length ? `<div style="padding:12px 20px;border-top:1px solid var(--line2)"><b>Ava feedback</b> <span class="famas">👍 ${up} · 👎 ${dn.length} (latest 200)</span>${dn.length ? `<details style="margin-top:6px"><summary style="cursor:pointer">Answers marked wrong or not helpful (${dn.length})</summary><div class="tw"><table class="dense">${H(['When', 'User', 'Page', 'Question', 'Answer'])}<tbody>${dn.slice(0, 30).map(x => `<tr><td>${esc(apTs(x.created_at))}</td><td>${esc(x.user_email)}</td><td>${esc(x.page || '')}</td><td style="max-width:240px">${esc(x.question || '')}</td><td style="max-width:420px;white-space:pre-wrap">${esc(String(x.answer || '').slice(0, 500))}</td></tr>`).join('')}</tbody></table></div></details>` : ''}</div>` : ''; })()}</section>`; })()}
      ${rows.length ? `<section class="card" style="padding:0"><div style="padding:14px 20px;border-bottom:1px solid var(--line2)"><h2 style="font-size:17px">ClickUp sync queue · ${esc(OQT[OQF][0])}</h2></div>
      <div class="tw"><table class="dense">${H(['Record', 'Status', 'Attempts', 'Last error', 'Next try', 'Updated', ''])}<tbody>
      ${rows.map(r => `<tr><td><code>${esc(r.source_table)}:${esc(r.source_record_id)}</code></td><td><span class="badge ${oqSt(r) === 'queued' ? '' : oqSt(r) === 'retrying' ? 'b-warn' : 'b-bad'}">${esc(oqSt(r))}</span></td>
        <td>${r.attempts ?? ''}</td><td style="max-width:360px">${esc(r.last_error || '')}</td><td>${r.next_action_at ? new Date(r.next_action_at).toLocaleString('en-ZA') : '—'}</td><td>${r.updated_at ? new Date(r.updated_at).toLocaleString('en-ZA') : ''}</td>
        <td>${has() && r.queue_type !== 'legacy_failure' && oqSt(r) !== 'queued' ? `<button class="btn sm" onclick="adRequeue('${esc(r.item_id)}')">Requeue</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></section>` : `<p class="note">ClickUp sync queue · ${esc(OQT[OQF][0])}: nothing here.</p>`}
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
  const AF = { user: '', table: '', action: '', from: '', to: '', q: '', imp: 1 }; let AL = null, AN = 0, AP = 0, AFC = null;
  const auQ = (cols, cnt) => {
    let q = sb.from('audit_log').select(cols, cnt ? { count: 'exact' } : undefined).order('created_at', { ascending: false });
    if (AF.user) q = q.eq('user_name', AF.user); if (AF.table) q = q.eq('table_name', AF.table); if (AF.action) q = q.eq('action', AF.action);
    if (AF.from) q = q.gte('created_at', AF.from); if (AF.to) q = q.lte('created_at', AF.to + 'T23:59:59');
    if (AF.imp && !AF.user) q = q.not('user_name', 'is', null);
    const s = (AF.q || '').replace(/[,()*%"]/g, ' ').trim();
    if (s) q = /^\d+$/.test(s) ? q.or(`record_id.eq.${s},user_name.ilike.*${s}*`) : q.or(`user_name.ilike.*${s}*,table_name.ilike.*${s}*`);
    return q;
  };
  const auRec = r => { const id = r.record_id; if (!id) return '';
    if (r.table_name === 'programmes' && apP(id)) return apLink(id);
    if (r.table_name === 'learners' && /^\d+$/.test(id)) return `<a href="javascript:void 0" onclick="window.previewLearnerEdit&&previewLearnerEdit(${id})">${esc(id)}</a>`;
    const p = ['enrolments', 'qcto_tracker', 'attendance', 'eisa', 'monitoring_visits', 'recommendations', 'moderation_items'].includes(r.table_name) && (r.changes?.after || r.changes?.new || r.changes || {}).programme_id;
    return esc(id) + (p && apP(p) ? ` <span class="sub">· ${apLink(p)}</span>` : ''); };
  async function renderAudit() {
    const v = $('view-audit');
    if (!has('head_of_ops')) { v.innerHTML = locked('Audit log', 'admin or Head of Operations'); return; }
    if (!AFC) { const f = await sb.rpc('audit_facets'); AFC = f.data || { users: [], tables: [], actions: [] }; }
    if (!AL) {
      v.innerHTML = '<div class="empty"><b>Loading…</b></div>';
      const r = await auQ('id,action,table_name,record_id,user_name,user_role,changes,created_at', 1).range(AP * 25, AP * 25 + 24);
      AL = r.error ? (say('Could not load the audit log: ' + r.error.message), []) : r.data || []; AN = r.count || AL.length;
    }
    const ch = c => { if (!c) return ''; const a = c.after || c.new || c, b = c.before || c.old || {}; const keys = Object.keys(a).filter(k => !['updated_at', 'created_at', 'tenant_id'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])).slice(0, 4);
      return keys.map(k => `<div><b>${esc(k)}</b>: ${esc(JSON.stringify(a[k])).slice(0, 80)}</div>`).join(''); };
    const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }, today = ago(0);
    const rng = [['', 'All time', ''], ['0', 'Today', today], ['7', '7 days', ago(7)], ['30', '30 days', ago(30)]];
    const curR = (rng.find(x => x[2] === AF.from && !AF.to) || [null])[0];
    v.innerHTML = head('Audit log', 'Every create, update and delete, newest first', `<button class="btn" onclick="adAuF()">Clear filters</button><button class="btn" onclick="adAuCsv()">Export CSV</button><button class="btn" onclick="adAuReload()">Refresh</button>`)
      + `<section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px 20px;border-bottom:1px solid var(--line2)">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">Search<input id="auq" class="cellin" style="height:36px;min-width:220px" placeholder="Record id, user or table" value="${esc(AF.q)}" onchange="adAuF('q',this.value)"></label>
        ${sel('auf-u', 'User', AFC.users || [], AF.user, "adAuF('user',this.value)")}${sel('auf-t', 'Table', AFC.tables || [], AF.table, "adAuF('table',this.value)")}${sel('auf-a', 'Action', AFC.actions || [], AF.action, "adAuF('action',this.value)")}
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">From<input type="date" class="cellin" style="height:36px" value="${AF.from}" onchange="adAuF('from',this.value)"></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">To<input type="date" class="cellin" style="height:36px" value="${AF.to}" onchange="adAuF('to',this.value)"></label></div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 20px;border-bottom:1px solid var(--line2)">${seg(rng.map(([k, l]) => [k || 'all', l]), curR === '' ? 'all' : curR, 'adAuR')}
        <label style="font-size:13px"><input type="checkbox" ${AF.imp ? 'checked' : ''} onchange="adAuF('imp',this.checked?1:0)"> Exclude imports / system</label>
        <span class="famas" style="margin-left:auto">${AN} entr${AN === 1 ? 'y' : 'ies'}</span></div>
      <div class="tw"><table class="dense">${H(['When', 'User', 'Role', 'Action', 'Table', 'Record', 'Change'])}<tbody>
      ${AL.map(r => `<tr><td style="white-space:nowrap">${new Date(r.created_at).toLocaleString('en-ZA')}</td><td>${r.user_name ? esc(r.user_name) : '<span class="sub">Import / system</span>'}</td><td>${esc(r.user_role || '')}</td>
        <td><span class="badge ${r.action === 'delete' ? 'b-bad' : r.action === 'insert' ? 'b-ok' : ''}">${esc(r.action || '')}</span></td><td>${esc(r.table_name || '')}</td><td>${auRec(r)}</td><td style="font-size:12px;max-width:380px">${ch(r.changes)}</td></tr>`).join('') || none(7, 'No entries match these filters.')}
      </tbody></table></div>${apPg(AN, AP, 'adAuPg')}</section>`;
  }
  window.adAuF = (k, val) => { if (!k) { Object.keys(AF).forEach(x => AF[x] = ''); AF.imp = 1; } else AF[k] = val; AP = 0; AL = null; renderAudit(); };
  window.adAuR = k => { const d = new Date(); if (k !== 'all') d.setDate(d.getDate() - +k); AF.from = k === 'all' ? '' : d.toISOString().slice(0, 10); AF.to = ''; AP = 0; AL = null; renderAudit(); };
  window.adAuPg = p => { AP = Math.max(0, p); AL = null; renderAudit(); };
  window.adAuReload = () => { AL = null; AFC = null; renderAudit(); };
  window.adAuCsv = async () => { const r = await auQ('action,table_name,record_id,user_name,user_role,changes,created_at').limit(5000); if (r.error) return say('Export failed: ' + r.error.message);
    csv('audit-log.csv', ['When', 'User', 'Role', 'Action', 'Table', 'Record', 'Changes'], (r.data || []).map(r => [r.created_at, r.user_name || 'Import / system', r.user_role, r.action, r.table_name, r.record_id, JSON.stringify(r.changes)])); };

  /* ---------- User management ---------- */
  const ROLES = [['admin', 'Admin'], ['head_of_ops', 'Head of Operations'], ['qa_specialist', 'QA specialist'], ['etqa', 'ETQA'], ['project_manager', 'Project manager'], ['operations', 'Operations'], ['pi_specialist', 'PI specialist'], ['compliance_officer', 'Compliance officer'], ['ohs', 'OHS (FAM Registry)']];
  let US = null;
  // Live: the user-admin Edge Function (service key stays server-side; it re-checks the caller is admin). Same calls as the old app.
  async function ua(action, payload) {
    const { data, error } = await sb.functions.invoke('user-admin', { body: { action, ...payload } });
    if (error) { let m = error.message || 'Request failed'; try { const c = await error.context?.json?.(); if (c?.error) m = c.error; } catch (_) {} throw new Error(m); }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  const rl = r => Array.isArray(r) ? r.filter(Boolean).map(String) : r ? [String(r)] : [];
  let UF = { r: '', q: '' };
  const uProgs = u => { const n = (u.name || '').trim().toLowerCase(), e = (u.email || '').toLowerCase();
    const lp = e.split('@')[0]; return (D().progsAll || D().progs || []).filter(p => { const pn = (p.project_manager_name || '').trim().toLowerCase(); return !p.deleted_at && ((n && pn === n) || (!n && lp && pn.split(/\s+/)[0] === lp) || (e && [(p.owner_email || ''), (p.handed_over_to_email || '')].some(x => x.toLowerCase() === e))); }); };
  async function renderUsers() {
    const v = $('view-users');
    if (!has()) { v.innerHTML = locked('User management', 'admin'); return; }
    if (!US) { v.innerHTML = '<div class="empty"><b>Loading…</b></div>'; try { US = ((await ua('list', {})).users || []).sort((a, b) => (a.email || '').localeCompare(b.email || '')); } catch (e) { v.innerHTML = head('User management', 'Who can sign in and what they can do') + `<div class="empty"><b>Could not load users</b><span>${esc(e.message)}</span></div>`; return; } }
    const me = (P.user?.email || '').toLowerCase(), rs = p => window.dvApi?.runState ? dvApi.runState(p) : '';
    const inR = u => !UF.r || (UF.r === 'never' ? !u.last_sign_in_at : rl(u.role).includes(UF.r));
    const inQ = u => !UF.q || `${u.email} ${u.name || ''}`.toLowerCase().includes(UF.q.toLowerCase());
    const list = US.map((u, i) => [u, i]).filter(([u]) => inR(u) && inQ(u)).sort(([a], [b]) => (!!a.last_sign_in_at - !!b.last_sign_in_at) || (a.email || '').localeCompare(b.email || ''));
    const noPm = (D().progsAll || D().progs || []).filter(p => !p.deleted_at && rs(p) === 'Active' && !(p.project_manager_name || '').trim()).length;
    const never = US.filter(u => !u.last_sign_in_at).length;
    v.innerHTML = head('User management', 'Who can sign in and what they can do. A role change applies when that person next signs in.', '<button class="btn y" onclick="adUserAdd()">+ Add user</button>')
      + `<div class="famtiles">${UI.tiles([{ t: `Users · ${US.length}`, k: [['All', US.length, '', !UF.r, `adUF('r','')`], ...ROLES.map(([k, l]) => [l, US.filter(u => rl(u.role).includes(k)).length, '', UF.r === k, `adUF('r','${k}')`]).filter(x => x[1])] },
        { t: 'Needs attention', k: [['Never signed in', never, never ? 'var(--warn)' : 'var(--ok)', UF.r === 'never', `adUF('r','never')`], ['Running programmes with no PM', noPm, noPm ? 'var(--bad)' : 'var(--ok)', false, `location.hash='pmtracker'`]] }])}</div>
      <section class="card" style="padding:0"><div style="padding:14px 20px;border-bottom:1px solid var(--line2)"><input id="usq" class="cellin" style="height:36px;min-width:260px" placeholder="Search email or name" value="${esc(UF.q)}" oninput="adUF('q',this.value)"></div>
      <div class="tw"><table class="dense">${H(['Email', 'Name', 'Roles', 'Programmes', 'Last sign-in', ''])}<tbody>
      ${list.map(([u, i]) => { const pm = rl(u.role).includes('project_manager'), ps = pm ? uProgs(u) : [], run = ps.filter(p => rs(p) === 'Active').length;
        return `<tr><td><b>${esc(u.email)}</b>${(u.email || '').toLowerCase() === me ? ' <span class="badge">You</span>' : ''}</td>
        <td><input class="cellin" id="un-${i}" value="${esc(u.name || '')}" style="height:32px;min-width:140px"></td>
        <td><div style="display:flex;flex-wrap:wrap;gap:4px 12px">${ROLES.map(([k, l]) => `<label style="font-size:12px;white-space:nowrap"><input type="checkbox" data-u="${i}" value="${k}"${rl(u.role).includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div></td>
        <td style="white-space:nowrap">${!pm ? '<span class="sub">—</span>' : ps.length ? `<a href="#pmtracker">${ps.length}</a> <span class="sub">(${run} running)</span>` : `<span class="badge b-warn" title="No programme has this person's name as PM. Check the name matches the PM name on programmes.">None matched</span>`}</td>
        <td>${u.last_sign_in_at ? fmtD(day(u.last_sign_in_at)) : '<span class="badge b-warn">never</span>'}</td>
        <td style="white-space:nowrap"><button class="btn sm y" onclick="adUserSave(${i})">Save</button>${(u.email || '').toLowerCase() === me ? '' : ` <button class="btn sm" style="color:var(--bad)" onclick="adUserRemove(${i})">Delete</button>`}</td></tr>`; }).join('') || none(6, 'No users match.')}
      </tbody></table></div><p class="note" style="margin:12px 20px">Only @apexu.co.za addresses. Delete removes the sign-in account; it cannot be undone. Add user sends an invitation email. Programmes = PM name on the programme matches the user's name (or, with no name saved, the first part of their email matches the PM's first name).</p></section>`;
    if (UF.q && document.activeElement?.id !== 'usq') { const e = $('usq'); if (e && UF._f) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }
  }
  window.adUF = (k, val) => { UF[k] = val; UF._f = k === 'q'; renderUsers(); };
  const run = async (fn, ok) => { try { await fn(); US = null; say(ok); renderUsers(); } catch (e) { say('Not saved: ' + e.message); } };
  window.adUserSave = i => { const roles = [...document.querySelectorAll(`#view-users input[data-u="${i}"]:checked`)].map(x => x.value); const u = US[i]; rl(u.role).filter(r => !ROLES.some(x => x[0] === r)).forEach(r => roles.push(r));   // keep roles this screen does not show (e.g. demo)
    if (!roles.length) return say('Pick at least one role, or use Delete');
    run(() => ua('update', { user_id: u.id, role: roles, name: ($('un-' + i)?.value || '').trim(), tenant: u.tenant || 'apex-academy' }), 'Saved. Applies at their next sign-in.'); };
  window.adUserRemove = i => { const u = US[i]; if (!confirm(`Delete the sign-in account of ${u.email}? This cannot be undone.`)) return; run(() => ua('delete', { user_id: u.id }), 'User deleted'); };
  window.adUserAdd = () => {
    if (!window.apxDlg) return say('Form not available. Refresh the page.');
    apxDlg('uaform', 'Add user', `<div class="qagrid"><label>Email (@apexu.co.za) *<input name="em" type="email" required></label><label>Full name *<input name="nm" required></label></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0">${ROLES.map(([k, l]) => `<label style="font-size:13px;white-space:nowrap"><input type="checkbox" name="rl" value="${k}"${k === 'project_manager' ? ' checked' : ''}> ${l}</label>`).join('')}</div>
      <p class="sub">An invitation email is sent to this address.</p>`,
      async el => { const email = el.em.value.trim().toLowerCase(), name = el.nm.value.trim(), roles = [...document.querySelectorAll('#uaform input[name="rl"]:checked')].map(x => x.value);
        if (!/^[^@\s]+@apexu\.co\.za$/.test(email)) throw new Error('Only @apexu.co.za addresses.');
        if (!name) throw new Error('Full name is required.'); if (!roles.length) throw new Error('Pick at least one role.');
        if ((US || []).some(u => (u.email || '').toLowerCase() === email)) throw new Error('This user already exists.');
        await ua('invite', { email, role: roles, name, tenant: 'apex-academy' }); US = null; say('Invitation sent to ' + email); setTimeout(renderUsers, 0); }, 'Send invitation');
  };


  /* ---------- routing ---------- */
  const RENDER = { pmtracker: renderPM, assessors: renderAs, hoo: renderHoo, synchealth: renderOps, audit: renderAudit, users: renderUsers };
  function onRoute() { const r = location.hash.slice(1); hooAuto(r === 'hoo'); if (RENDER[r] && P.user) RENDER[r](); }
  addEventListener('hashchange', () => setTimeout(onRoute, 0));
  // called from applyAll after every data load
  window.previewAdmin = function () { AS = null; OQ = null; AL = null; const r = location.hash.slice(1); if (RENDER[r]) RENDER[r](); };
})();
