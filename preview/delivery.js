/* ApexOne redesign preview — delivery screens. Loaded after qa.js.
   Programmes (list, overview, module progress, Form 3), Attendance & PoE (session register,
   PoE tracker) and EISA readiness, on the same tables the live app uses:
   program_modules (+ components for Form 3), attendance_sessions, attendance, eisa.
   Saves queue to the preview ClickUp lists through the outbox like every other write.
   Letters and results follow the live data: attendance P / R / A, results C / NYC / RW / NS. */
(function () {
  const sb = window.__sb, P = window.__preview, write = window.previewWrite;
  if (!sb || !P || !write) return;

  /* ---------- helpers ---------- */
  const D = () => P.data || {};
  const say = m => { window.toast(m); const t = $('toast'); if (t) t.textContent = m; };
  const has = (...r) => (P.roles || []).some(x => x === 'admin' || r.includes(x));
  const CAN = () => has('project_manager', 'qa_specialist', 'etqa');          // operations: read only
  const day = s => s ? String(s).slice(0, 10) : '';
  const pct = (a, b) => b ? Math.round(a / b * 100) : null;
  const KINDS = ['KM', 'PM', 'WM'], COL = { KM: 'km_result', PM: 'pm_result', WM: 'wm_result' };
  const KLAB = { KM: 'Knowledge', PM: 'Practical', WM: 'Workplace' };
  const RES = ['C', 'NYC', 'RW', 'NS'], RLAB = { C: 'Competent', NYC: 'Not yet competent', RW: 'Rework', NS: 'Not submitted' };
  const RCL = { C: 'b-ok', NYC: 'b-bad', RW: 'b-warn', NS: 'b-warn' };
  const AT = s => ({ Present: 'P', Absent: 'A', Reason: 'R' }[s] || s || '');
  const NEXT = { '': 'P', P: 'R', R: 'A', A: 'P' };

  const progs = () => D().progs || [];
  const prog = id => progs().find(p => p.id === id);
  const learnersOf = pid => { const ids = new Set((D().enrol || []).filter(e => e.programme_id === pid).map(e => e.learner_id)); return (D().learners || []).filter(l => ids.has(l.id)); };
  const modsOf = pid => (D().pmods || []).filter(m => m.programme_id === pid).sort((a, b) => a.module_number - b.module_number);
  const sessOf = pid => (D().sessions || []).filter(s => s.programme_id === pid).sort((a, b) => day(a.session_date) < day(b.session_date) ? -1 : 1);
  const attFor = (pid, lid, d) => (D().att || []).find(a => a.programme_id === pid && a.learner_id === lid && day(a.session_date) === day(d));
  const resFor = (pid, lid, n) => (D().eisaRes || []).find(r => r.programme_id === pid && r.learner_id === lid && r.module_number === n);
  const kindsOf = m => { const k = KINDS.filter(x => (m.components || []).some(c => c.kind === x)); return k.length ? k : KINDS; };
  const modOfSession = s => +(s.fields?.Module || 0) || null;
  const name = l => esc(l.first_name + ' ' + l.last_name);
  const lnk = l => `<button type="button" class="lname" onclick="shOpen(${dProg},${l.id})">${name(l)}</button>`;
  const client = p => (D().clients || []).find(c => c.id === p?.client_id);
  const months = p => p?.start_date && p?.end_date ? (new Date(p.end_date) - new Date(p.start_date)) / (30.4 * 864e5) : 12;
  const absenceLimit = p => months(p) >= 12 ? 5 : 3;            // induction pack: 5 days (12-month), 3 days (3-month)

  // Default programme: the first active one with learners, shared by all three screens
  let dProg = null;
  const ensure = () => {
    const ok = progs().filter(p => learnersOf(p.id).length);
    if (!ok.some(p => p.id === dProg)) dProg = (ok.find(p => p.status === 'active') || ok[0] || progs()[0])?.id ?? null;
    return prog(dProg);
  };
  const picker = (sel, after) => {
    const el = document.querySelector(sel); if (!el) return;
    const ok = progs().filter(p => learnersOf(p.id).length);
    el.innerHTML = ok.map(p => `<option value="${p.id}"${p.id === dProg ? ' selected' : ''}>${esc(p.programme_name)}</option>`).join('') || '<option>No programmes with learners</option>';
    el.onchange = () => { dProg = +el.value; after(); };
  };

  /* ---------- derived figures ---------- */
  function attendance(p, onlyModule) {
    const ss = sessOf(p.id).filter(s => !onlyModule || modOfSession(s) === onlyModule), ls = learnersOf(p.id);
    let rec = 0, here = 0;
    ss.forEach(s => ls.forEach(l => { const v = AT(attFor(p.id, l.id, s.session_date)?.status); if (v) { rec++; if (v !== 'A') here++; } }));
    return { sessions: ss.length, rate: pct(here, rec) };
  }
  const moduleDone = (p, l, m) => { const r = resFor(p.id, l.id, m.module_number); return !!r && kindsOf(m).every(k => r[COL[k]] === 'C'); };
  // QCTO EISA-readiness criteria. All six must be met.
  function readiness(p, l) {
    const ms = modsOf(p.id), rows = ms.map(m => [m, resFor(p.id, l.id, m.module_number)]), any = ms.length > 0;
    const all = k => any && rows.every(([m, r]) => !kindsOf(m).includes(k) || (r && r[COL[k]] === 'C'));
    const assessed = any && rows.every(([m, r]) => r && kindsOf(m).every(k => ['C', 'NYC'].includes(r[COL[k]])));
    const moderated = any && rows.every(([, r]) => r?.fields?.['Internal moderation'] === 'Yes');
    const t = (D().tracker || []).find(x => x.programme_id === p.id && x.learner_id === l.id);
    return { c: [all('KM'), all('PM'), all('WM'), assessed, moderated, t?.sor_status === 'Issued'], booked: t?.eisa_booking_status === 'Booked' };
  }
  const why = ['Every knowledge module competent', 'Every practical module competent', 'Every workplace module (logbook) competent',
    'Every module assessed: a final result (C or NYC) for each part, no rework or missing submissions', 'Every module ticked as internally moderated in the PoE tracker', 'SoR status is Issued in the QCTO tracker'];

  /* ---------- Programmes ---------- */
  const PST = { Active: s => s === 'active', Planned: s => ['initiated', 'handed_over', 'planned', 'draft'].includes(s), Completed: s => ['closed', 'completed'].includes(s) };
  // shared with shell.js (My work, side panel)
  window.dvApi = { readiness, why, learnersOf, modsOf, sessOf, attFor, resFor, kindsOf, attendance, absenceLimit, prog, progs, AT, COL, KINDS, KLAB, RLAB, setProg: id => { dProg = id; } };
  window.dvProg = id => { dProg = id; pTab = 'Overview'; renderProg(); };
  window.dvGo = (hash, tab) => { if (hash === 'attendance') aTab = tab; if (hash === 'eisa') eTab = tab; location.hash = hash; setTimeout(() => { if (hash === 'attendance') renderAtt(); if (hash === 'eisa') renderE(); }, 0); };
  const _renderProg = renderProg;
  renderProg = function () {
    if (!P.user) return _renderProg();
    let p = prog(dProg);
    const list = progs().filter(x => PST[pStatus](x.status));
    if (!p || !PST[pStatus](p.status)) { dProg = list[0]?.id ?? dProg; p = prog(dProg); }
    $('pstatus').innerHTML = Object.keys(PST).map(s => `<button class="${s === pStatus ? 'on' : ''}" onclick="pStatus='${s}';renderProg()">${s}</button>`).join('');
    $('plist').innerHTML = list.map(x => `<button class="pick${x.id === dProg ? ' on' : ''}" onclick="dvProg(${x.id})"><b>${esc(x.programme_name)}</b><span class="sub">${esc(client(x)?.client_name || 'No client')} · ${learnersOf(x.id).length} learners</span></button>`).join('') || `<div class="empty"><b>No ${pStatus.toLowerCase()} programmes</b></div>`;
    const v = $('view-programmes'), hd = v.querySelector('.dark');
    if (!p || !PST[pStatus](p.status)) { hd.hidden = true; $('ptabs').innerHTML = ''; $('pstats').hidden = $('pmodcard').hidden = $('form3').hidden = true; return; }
    hd.hidden = false;
    const sp = hd.querySelectorAll('span');
    sp[0].textContent = `${p.status === 'active' ? 'Active' : p.status} · ${p.programme_type || p.qualification_type || 'Programme'}`;
    hd.querySelector('h1').textContent = p.programme_name;
    sp[1].textContent = `${client(p)?.client_name || 'No client'} · SAQA ${p.saqa_id || '—'} · NQF ${p.nqf_level || '—'} · ${fmtD(day(p.start_date)) || '—'} → ${fmtD(day(p.end_date)) || '—'}`;
    hd.querySelectorAll('button').forEach(b => { b.hidden = true; });   // AI summary / Edit are not part of the preview
    const tabs = [['Overview', `pTab='Overview';renderProg()`], ['Form 3', `pTab='Form 3';renderProg()`], ['Learners ›', `location.hash='learners'`],
      ['Attendance ›', `dvGo('attendance','Register')`], ['PoE ›', `dvGo('attendance','PoE tracker')`], ['EISA readiness ›', `dvGo('eisa','Readiness')`], ['Visits ›', `location.hash='visits'`]];
    $('ptabs').innerHTML = tabs.map(([t, f]) => `<button role="tab" aria-selected="${t === pTab}" class="${t === pTab ? 'on' : ''}" onclick="${f}">${t}</button>`).join('');
    const f3 = pTab === 'Form 3';
    $('pstats').hidden = f3; $('pmodcard').hidden = f3; $('form3').hidden = !f3;
    if (f3) { $('form3').innerHTML = form3(p); return; }
    const ls = learnersOf(p.id), a = attendance(p), rd = ls.filter(l => readiness(p, l).c.every(Boolean)).length;
    const recs = (D().recs || []).filter(r => r.programme_id === p.id && !r.resolved).length;
    $('pstats').innerHTML = [['Learners enrolled', ls.length, ''], ['Average attendance', a.rate == null ? '—' : a.rate + '%', `${a.sessions} sessions`], ['EISA ready', rd, `of ${ls.length} learners`], ['Open recommendations', recs, 'from monitoring visits']]
      .map(([l, v, n]) => `<div class="kpi"><span class="l">${l}</span><span class="v" style="font-size:26px">${v}</span>${n ? `<span class="n sub">${n}</span>` : ''}</div>`).join('');
    const ms = modsOf(p.id);
    $('modrows').innerHTML = ms.map(m => { const am = attendance(p, m.module_number), done = ls.filter(l => moduleDone(p, l, m)).length;
      return `<tr><td style="font-weight:600;white-space:normal">Module ${m.module_number}: ${esc(m.title || '')}<div class="sub">${esc(m.dates || '')} · ${m.trained ? '<span class="badge b-ok">Trained</span>' : '<span class="badge b-n">Not yet trained</span>'}</div></td><td>${am.sessions}</td>
        <td><span class="bar"><i style="width:${am.rate || 0}%;background:var(--navy2)"></i></span> ${am.rate == null ? '—' : am.rate + '%'}</td><td>${done} of ${ls.length}</td></tr>`; }).join('')
      || '<tr><td colspan="4" class="sub">No modules set up for this programme yet.</td></tr>';
  };

  /* ---------- Form 3 (QCTO programme implementation) ---------- */
  function form3(p) {
    const s = (D().leisaSettings || []).find(x => x.provider === (p.provider || 'apex')) || (D().leisaSettings || [])[0] || {};
    const ms = modsOf(p.id), ro = !CAN(), fx = p.fields || {};
    const fac = D().assessors || [], fam = D().famc || [];
    const comps = k => ms.flatMap(m => (m.components || []).map((c, i) => ({ c, i, m })).filter(x => x.c.kind === k));
    const tot = k => comps(k).reduce((t, x) => t + (+x.c.hours || 0), 0);
    const famOk = id => { const r = fam.find(x => x.assessor_id === id); return r ? r : null; };
    const row = ({ c, i, m }, withFac) => {
      const f = fac.find(a => a.id === c.facilitator_id), fr = c.facilitator_id ? famOk(c.facilitator_id) : null;
      const hrs = ro ? (c.hours == null ? '<span class="badge b-bad">Hours missing</span>' : c.hours)
        : `<input type="number" min="0" class="cellin" style="width:80px${c.hours == null ? ';border-color:var(--bad)' : ''}" aria-label="Hours for ${esc(c.code)}" value="${c.hours ?? ''}" placeholder="Missing" onchange="dvComp(${m.id},${i},'hours',this.value)">`;
      const fsel = ro ? esc(f?.full_name || '—') : `<select class="cellin" aria-label="Facilitator for ${esc(c.code)}" onchange="dvComp(${m.id},${i},'facilitator_id',this.value)"><option value="">Not assigned</option>${fac.map(a => `<option value="${a.id}"${a.id === c.facilitator_id ? ' selected' : ''}>${esc(a.full_name)}</option>`).join('')}</select>`;
      return `<tr><td>${esc(c.code || '')}</td><td style="white-space:normal;min-width:240px">${esc(c.title || '')}<div class="sub">Module ${m.module_number}</div></td><td>${hrs}</td>${withFac ? `<td>${fsel}</td>
        <td>${!c.facilitator_id ? '<span class="badge b-warn">No facilitator</span>' : fr && fr.document_count ? '<span class="badge b-ok">On FAM registry</span>' : '<span class="badge b-warn">Not on FAM registry</span>'}</td>
        <td class="sub">${fr ? `${fr.document_count || 0} documents · ${fr.registration_count || 0} registrations on FAM` : '—'}</td>` : ''}</tr>`;
    };
    const blk = (k, withFac) => `<tr><th colspan="${withFac ? 6 : 3}" style="background:var(--ground)">${KLAB[k]} modules · ${tot(k)} hours</th></tr>` + (comps(k).map(x => row(x, withFac)).join('') || `<tr><td colspan="${withFac ? 6 : 3}" class="sub">None listed</td></tr>`);
    const RESRC = ['Classroom furniture, audio & visual equipment', 'Handouts and stationery', 'Learning material (physical / online)', 'Learning Management System', 'Quality Management System'];
    const have = fx['Form 3 resources'] || {};
    return `<div class="card" style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:baseline"><h2 style="flex-grow:1">Form 3 · Programme Implementation</h2><span class="famas">Same layout as the QCTO <b>Form 3</b> document</span><button class="btn sm y" onclick="dvForm3Export()">Export Form 3 (Word)</button></div>
      <div class="kv"><span>Legal name of SDP</span><span>${esc(s.sdp_name || 'Set in EISA readiness › LEISA file')}</span></div>
      <div class="kv"><span>Qualification / curriculum title</span><span>${esc(p.qualification_name || p.programme_name)}</span></div>
      <div class="kv"><span>SAQA ID · NQF · Credits · Curriculum code</span><span>${esc(p.saqa_id || '—')} · ${esc(p.nqf_level || '—')} · ${esc(fx.Credits || '—')} · ${esc(fx['Curriculum code'] || '—')}</span></div>
      <div class="kv"><span>1. Proposed duration</span><span>${fmtD(day(p.start_date)) || '—'} → ${fmtD(day(p.end_date)) || '—'}</span></div></div>
      <div class="card" style="padding:0"><div style="padding:16px 20px"><h2>2. Modules and facilitators</h2><span class="sub">From the programme's modules. Facilitator credentials come from the FAM registry, so they don't need retyping on each form.${ro ? '' : ' Change hours or facilitators here; they save straight away.'}</span></div>
      <div class="tw"><table class="dense"><thead><tr><th>Module code</th><th>Module</th><th>Hours on timetable</th><th>Facilitator</th><th>FAM check</th><th>Qualification &amp; experience</th></tr></thead><tbody>${blk('KM', 1)}${blk('PM', 1)}${blk('WM', 0)}</tbody></table></div></div>
      <div class="card"><h2 style="margin-bottom:8px">Physical resources (as per curriculum)</h2>${RESRC.map((x, i) => `<label class="chk"${ro ? '' : ' style="cursor:pointer"'}><span style="flex-grow:1">${x}</span>${ro ? `<span class="badge ${have[x] ? 'b-ok' : 'b-warn'}">${have[x] ? 'Yes' : 'Not confirmed'}</span>` : `<input type="checkbox" aria-label="${x}"${have[x] ? ' checked' : ''} onchange="dvRes(${i},this.checked)">`}</label>`).join('')}</div>`;
    }
  window.dvComp = async (mid, i, k, v) => {
    const m = (D().pmods || []).find(x => x.id === mid); if (!m) return;
    const comps = JSON.parse(JSON.stringify(m.components || []));
    comps[i][k] = v === '' ? null : +v;
    await write('Form 3 module', () => sb.from('program_modules').update({ components: comps }).eq('id', mid));
    m.components = comps; say('Saved ' + (comps[i].code || 'module')); renderProg();
  };
  window.dvRes = async (i, on) => {
    const p = prog(dProg); if (!p) return;
    const RESRC = ['Classroom furniture, audio & visual equipment', 'Handouts and stationery', 'Learning material (physical / online)', 'Learning Management System', 'Quality Management System'];
    const fields = { ...(p.fields || {}) }; fields['Form 3 resources'] = { ...(fields['Form 3 resources'] || {}), [RESRC[i]]: on };
    await write('Form 3 resources', () => sb.from('programmes').update({ fields }).eq('id', p.id));
    p.fields = fields; say('Resources checklist saved');
  };
  window.dvForm3Export = () => {
    const p = prog(dProg); if (!p) return;
    const body = form3(p).replace(/<input[^>]*type="checkbox"[^>]*checked[^>]*>/g, 'Yes').replace(/<input[^>]*type="checkbox"[^>]*>/g, 'No')
      .replace(/<input[^>]*value="([^"]*)"[^>]*>/g, '$1').replace(/<select[\s\S]*?<\/select>/g, m => (m.match(/<option value="\d+" selected>([^<]*)</) || [, '—'])[1])
      .replace(/<button[\s\S]*?<\/button>/g, '');
    const doc = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Form 3</title><style>body{font-family:Arial;font-size:11pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:4px;text-align:left;vertical-align:top}.sub{color:#555;font-size:9pt}.kv{display:block;margin:2px 0}.kv span:first-child{font-weight:bold}.kv span:first-child:after{content:": "}</style></head><body>${body}</body></html>`;
    const nm = `Form3-${(p.saqa_id || p.id)}-${String(p.programme_name).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.doc`;
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + doc], { type: 'application/msword' })); a.download = nm; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* no download in tests */ }
    say('Exported ' + nm); return nm;
  };

  /* ---------- Attendance & PoE ---------- */
  let addOpen = false;
  const _renderAtt = renderAtt;
  renderAtt = function () {
    if (!P.user) return _renderAtt();
    const p = ensure();
    picker('#view-attendance select', renderAtt);
    $('atabs').innerHTML = ['Register', 'PoE tracker'].map(t => `<button class="${t === aTab ? 'on' : ''}" onclick="aTab='${t}';renderAtt()">${t}</button>`).join('');
    $('regcard').hidden = aTab !== 'Register'; $('poecard').hidden = aTab === 'Register';
    if (!p) { $('register').innerHTML = '<tbody><tr><td class="sub">No programmes with learners.</td></tr></tbody>'; $('poetable').innerHTML = ''; return; }
    const ls = learnersOf(p.id), ss = sessOf(p.id), ed = CAN(), lim = absenceLimit(p);
    const hint = $('regcard').querySelector('p.sub');
    if (hint) hint.innerHTML = (ed ? 'Tap a cell to cycle Present → Reason → Absent. Changes save automatically. ' : 'Read only for your role. ') + `R means absent with a valid reason (proof attached). The absence limit for this programme is ${lim} days.`;
    const head = $('regcard').firstElementChild;
    if (head && !$('dvadd')) head.insertAdjacentHTML('beforeend', '<button class="btn sm" id="dvadd" onclick="dvAddToggle()">+ Add session</button>');
    if ($('dvadd')) $('dvadd').hidden = !ed;
    const form = !ed || !addOpen ? '' : `<tr><td colspan="${ss.length + 3}" style="white-space:normal"><div class="qagrid" id="dvsess"><label>Date<input type="date" data-k="session_date"></label>
      <label>Module<select data-k="module">${modsOf(p.id).map(m => `<option value="${m.module_number}">Module ${m.module_number}: ${esc(m.title || '')}</option>`).join('') || '<option value="">No modules</option>'}</select></label>
      <label>Topic<input data-k="topic"></label><label>Facilitator<input data-k="facilitator" value="${esc((D().assessors || []).find(a => a.id === p.facilitator_id)?.full_name || '')}"></label><label>Venue<input data-k="venue" value="Online"></label></div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn y sm" onclick="dvAddSession()">Save session</button><button class="btn sm" onclick="dvAddToggle()">Cancel</button></div></td></tr>`;
    $('register').innerHTML = `<thead><tr><th>Learner</th>${ss.map((s, i) => `<th style="text-align:center" title="${esc(s.topic || '')}">S${i + 1}<div class="sub" style="font-weight:400">${fmtD(day(s.session_date)).slice(0, 5)}${modOfSession(s) ? ' · M' + modOfSession(s) : ''}</div></th>`).join('')}<th>Rate</th><th>Absent</th></tr></thead><tbody>${form}${ls.map(l => {
      let rec = 0, here = 0, ab = 0;
      const cells = ss.map(s => { const v = AT(attFor(p.id, l.id, s.session_date)?.status); if (v) { rec++; if (v !== 'A') here++; if (v === 'A') ab++; }
        const [bg, fg] = v ? SC[v] : ['var(--soft)', 'var(--muted)'];
        return `<td style="text-align:center;padding:8px 4px">${ed ? `<button aria-label="${name(l)} ${fmtD(day(s.session_date))}: ${v || 'not recorded'}" onclick="dvMark(${l.id},'${day(s.session_date)}')" style="width:36px;height:36px;border:0;border-radius:8px;font-weight:700;background:${bg};color:${fg}">${v || '·'}</button>` : `<span class="dot" style="width:32px;height:32px;background:${bg};color:${fg}">${v || '·'}</span>`}</td>`; }).join('');
      return `<tr><td style="font-weight:600">${lnk(l)}</td>${cells}<td style="font-weight:600">${rec ? pct(here, rec) + '%' : '—'}</td><td>${ab > lim ? `<span class="badge b-bad">${ab} · over ${lim}</span>` : ab}</td></tr>`; }).join('')}</tbody>`;
    if (!ss.length) $('register').insertAdjacentHTML('beforeend', `<tbody><tr><td colspan="3" class="sub">No sessions yet.${ed ? ' Use “+ Add session”.' : ''}</td></tr></tbody>`);
    // PoE tracker: module results per part + internal moderation (feeds EISA readiness)
    const ms = modsOf(p.id);
    const cell = (l, m, k) => { const v = resFor(p.id, l.id, m.module_number)?.[COL[k]] || '';
      return ed ? `<td><select class="cellin" aria-label="${name(l)} module ${m.module_number} ${KLAB[k]}" onchange="dvRes2(${l.id},${m.module_number},'${k}',this.value)"><option value=""${v ? '' : ' selected'}>—</option>${RES.map(r => `<option value="${r}"${r === v ? ' selected' : ''}>${r} · ${RLAB[r]}</option>`).join('')}</select></td>`
        : `<td>${v ? `<span class="badge ${RCL[v]}">${RLAB[v] || v}</span>` : '<span class="sub">—</span>'}</td>`; };
    const modc = (l, m) => { const on = resFor(p.id, l.id, m.module_number)?.fields?.['Internal moderation'] === 'Yes';
      return `<td style="text-align:center">${ed ? `<input type="checkbox" aria-label="${name(l)} module ${m.module_number} internally moderated"${on ? ' checked' : ''} onchange="dvMod(${l.id},${m.module_number},this.checked)">` : on ? '<span class="badge b-ok">Yes</span>' : '<span class="sub">No</span>'}</td>`; };
    $('poetable').innerHTML = !ms.length ? '<tbody><tr><td class="sub">No modules set up for this programme yet.</td></tr></tbody>'
      : `<thead><tr><th rowspan="2">Learner</th>${ms.map(m => `<th colspan="${kindsOf(m).length + 1}" style="text-align:center;border-left:1px solid var(--line)">Module ${m.module_number}</th>`).join('')}</tr>
        <tr>${ms.map(m => kindsOf(m).map((k, i) => `<th${i ? '' : ' style="border-left:1px solid var(--line)"'}>${KLAB[k]}</th>`).join('') + '<th>Moderated</th>').join('')}</tr></thead>
        <tbody>${ls.map(l => `<tr><td style="font-weight:600">${lnk(l)}</td>${ms.map(m => kindsOf(m).map(k => cell(l, m, k)).join('') + modc(l, m)).join('')}</tr>`).join('')}</tbody>`;
  };
  window.dvAddToggle = () => { addOpen = !addOpen; renderAtt(); };
  window.dvAddSession = async () => {
    const p = prog(dProg), box = $('dvsess'); if (!p || !box) return;
    const v = {}; box.querySelectorAll('[data-k]').forEach(i => { v[i.dataset.k] = i.value.trim(); });
    if (!v.session_date) return say('Pick the session date');
    if (sessOf(p.id).some(s => day(s.session_date) === v.session_date)) return say('There is already a session on that date');
    const row = { tenant_id: P.tenant, programme_id: p.id, session_date: v.session_date, topic: v.topic || null, facilitator: v.facilitator || null, venue: v.venue || null,
      fields: { Date: v.session_date, Topic: v.topic, Facilitator: v.facilitator, Venue: v.venue, Programme: p.id, Module: v.module ? +v.module : null } };
    const r = await write('Session', () => sb.from('attendance_sessions').insert(row).select());
    (D().sessions = D().sessions || []).push((r && r[0]) || row); addOpen = false; say('Session added'); renderAtt();
  };
  window.dvMark = async (lid, d) => {
    const p = prog(dProg); if (!p) return;
    const cur = attFor(p.id, lid, d), nv = NEXT[AT(cur?.status)];
    const row = { tenant_id: P.tenant, programme_id: p.id, learner_id: lid, session_date: d, status: nv };
    await write('Attendance', () => sb.from('attendance').upsert(row, { onConflict: 'tenant_id,learner_id,programme_id,session_date' }));
    if (cur) cur.status = nv; else (D().att = D().att || []).push(row);
    renderAtt();
  };
  async function saveRes(lid, n, patch) {
    const p = prog(dProg); if (!p) return;
    const cur = resFor(p.id, lid, n);
    const row = { tenant_id: P.tenant, programme_id: p.id, learner_id: lid, module_number: n, km_result: cur?.km_result ?? null, pm_result: cur?.pm_result ?? null, wm_result: cur?.wm_result ?? null, fields: { ...(cur?.fields || {}) }, ...patch(cur) };
    await write('Module result', () => sb.from('eisa').upsert(row, { onConflict: 'learner_id,programme_id,module_number' }));
    if (cur) Object.assign(cur, row); else (D().eisaRes = D().eisaRes || []).push(row);
    renderAtt();
  }
  window.dvRes2 = (lid, n, k, v) => saveRes(lid, n, () => ({ [COL[k]]: v || null })).then(() => say('Result saved'));
  window.dvMod = (lid, n, on) => saveRes(lid, n, c => ({ fields: { ...(c?.fields || {}), 'Internal moderation': on ? 'Yes' : 'No' } })).then(() => say(on ? 'Marked as internally moderated' : 'Moderation tick removed'));

  /* ---------- EISA readiness ---------- */
  const _renderE = renderE;
  renderE = function () {
    _renderE();                                   // qa.js handles the LEISA file tab
    if (!P.user || eTab !== 'Readiness') return;
    const p = ensure();
    picker('#view-eisa select', renderE);
    const ls = p ? learnersOf(p.id) : [], R = ls.map(l => [l, readiness(p, l)]);
    const short = n => R.filter(([, r]) => r.c.filter(x => !x).length === n).length;
    $('eisakpis').innerHTML = [['Ready for EISA', short(0), 'var(--ok)'], ['One criterion short', short(1), 'var(--warn)'], ['Two or more short', R.filter(([, r]) => r.c.filter(x => !x).length >= 2).length, 'var(--bad)'], ['EISA booked', R.filter(([, r]) => r.booked).length, 'var(--ink)']]
      .map(([l, v, c]) => `<div class="kpi"><span class="l">${l}</span><span class="v" style="color:${c}">${v}</span><span class="n sub">of ${ls.length} learners</span></div>`).join('');
    $('eisarows').innerHTML = R.map(([l, r]) => { const ok = r.c.every(Boolean);
      return `<tr><td style="font-weight:600">${lnk(l)}</td>${r.c.map((x, i) => `<td><span class="dot ${x ? 'b-ok' : 'b-bad'}" style="width:24px;height:24px" title="${why[i]}" aria-label="${x ? 'Met' : 'Not met'}: ${why[i]}">${x ? '✓' : '✕'}</span></td>`).join('')}
        <td>${ok ? `<span class="badge b-ok">Ready${r.booked ? ' · booked' : ''}</span>` : '<span class="badge b-warn">Not yet</span>'}</td></tr>`; }).join('')
      || '<tr><td colspan="8" class="sub">No learners enrolled on this programme.</td></tr>';
    const sub = document.querySelector('#eisaready .card .sub');
    if (sub) sub.textContent = 'All six must be met. Module results and moderation come from Attendance & PoE › PoE tracker; SoR from the QCTO tracker. Hover a mark for the rule.';
  };

  /* ---------- wire up after every data load (called from live.js applyAll) ---------- */
  let bound = false;
  window.previewDelivery = function () {
    renderProg(); renderAtt(); renderE();
    if (bound) return; bound = true;
    const np = [...document.querySelectorAll('#view-programmes button')].find(b => /New programme/.test(b.textContent));
    if (np) np.onclick = () => say('New programmes start in programme initiation (live app); the preview uses the test programmes.');
    [...document.querySelectorAll('#view-attendance button, #view-eisa button')].filter(b => /^AI /.test(b.textContent.trim())).forEach(b => { b.hidden = true; });
  };
})();
