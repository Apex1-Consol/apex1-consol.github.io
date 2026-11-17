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
  const AT = s => ({ Present: 'P', Absent: 'A', Reason: 'R', Late: 'R' }[s] || (['P', 'A', 'R'].includes(s) ? s : ''));   // 'N/A' and blanks show as not recorded
  const NEXT = { '': 'P', P: 'R', R: 'A', A: 'P' };

  const progs = () => D().progs || [];
  const prog = id => progs().find(p => p.id === id);
  const learnersOf = pid => { const ids = new Set((D().enrol || []).filter(e => e.programme_id === pid).map(e => e.learner_id)); return (D().learners || []).filter(l => ids.has(l.id)); };
  const modsOf = pid => { const pm = (D().pmods || []).filter(m => m.programme_id === pid); if (pm.length) return pm.sort((a, b) => a.module_number - b.module_number);
    return [...new Set((D().eisaRes || []).filter(r => r.programme_id === pid).map(r => r.module_number))].sort((a, b) => a - b).map(n => ({ programme_id: pid, module_number: n, title: '' })); };   // live: few programmes have program_modules; fall back to the modules that have results
  // Register dates = dates with at least one P / R / A mark. Imported registers often have marks but no attendance_sessions row:
  // those dates still show as register columns (marked "imported") so the register, rates and Today checks see them.
  const regDates = pid => [...new Set((D().att || []).filter(a => a.programme_id === pid && AT(a.status)).map(a => day(a.session_date)))].sort();
  const sessOf = pid => { const ss = (D().sessions || []).filter(s => s.programme_id === pid), have = new Set(ss.map(s => day(s.session_date)));
    const extra = regDates(pid).filter(d => !have.has(d)).map(d => ({ programme_id: pid, session_date: d, topic: '', fields: {}, imported: true }));
    return ss.concat(extra).sort((a, b) => day(a.session_date) < day(b.session_date) ? -1 : day(a.session_date) > day(b.session_date) ? 1 : 0); };
  /* Run state from status + dates. Legacy programmes stay 'initiated' while running, so 'initiated' with a start date (or, with no start
     date, a captured register) on or before today and no past end date is Active; past its end date it is Completed; otherwise Planned. */
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const runState = p => { if (!p) return 'Planned'; if (['closed', 'completed'].includes(p.status)) return 'Completed'; if (p.status === 'active') return 'Active';
    const t = today(), st = day(p.start_date) || regDates(p.id)[0] || '';
    if (!st || st > t) return 'Planned'; return p.end_date && day(p.end_date) < t ? 'Completed' : 'Active'; };
  const attFor = (pid, lid, d) => (D().att || []).find(a => a.programme_id === pid && a.learner_id === lid && day(a.session_date) === day(d));
  const resFor = (pid, lid, n) => (D().eisaRes || []).find(r => r.programme_id === pid && r.learner_id === lid && r.module_number === n);
  const kindsOf = m => { const k = KINDS.filter(x => (m.components || []).some(c => c.kind === x)); return k.length ? k : KINDS; };
  const modOfSession = s => +(s.fields?.Module || 0) || null;
  const name = l => esc(l.first_name + ' ' + l.last_name);
  const lnk = l => `<button type="button" class="lname" onclick="shOpen(${dProg},${l.id})">${name(l)}</button>`;
  const client = p => (D().clients || []).find(c => c.id === p?.client_id);
  const wdr = (pid, lid) => (D().enrol || []).some(e => e.programme_id === pid && e.learner_id === lid && /withdrawn/i.test(String((e.fields || {}).Status || e.status || '')));
  const months = p => p?.start_date && p?.end_date ? (new Date(p.end_date) - new Date(p.start_date)) / (30.4 * 864e5) : 12;
  const absenceLimit = p => months(p) >= 12 ? 5 : 3;            // induction pack: 5 days (12-month), 3 days (3-month)

  // Default programme: the first active one with learners, shared by all three screens
  let dProg = null;
  const ensure = () => {
    const ok = progs().filter(p => learnersOf(p.id).length);
    if (!ok.some(p => p.id === dProg)) dProg = (ok.find(p => runState(p) === 'Active') || ok[0] || progs()[0])?.id ?? null;
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
    const ss = sessOf(p.id).filter(s => !onlyModule || modOfSession(s) === onlyModule), ls = learnersOf(p.id).filter(l => !wdr(p.id, l.id));
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
    return { c: [all('KM'), all('PM'), all('WM'), assessed, moderated, t?.sor_status === 'Issued'], k: [any, any, any, any, any, !!t], booked: t?.eisa_booking_status === 'Booked', t };
  }
  const why = ['Every knowledge module competent', 'Every practical module competent', 'Every workplace module (logbook) competent',
    'Every module assessed: a final result (C or NYC) for each part, no rework or missing submissions', 'Every module ticked as internally moderated in the PoE tracker', 'SoR status is Issued in the QCTO tracker'];

  /* ---------- Programmes ---------- */
  const PST = { Active: p => runState(p) === 'Active', Planned: p => runState(p) === 'Planned', Completed: p => runState(p) === 'Completed' };
  // shared with shell.js (My work, side panel)
  window.dvApi = { readiness, why, learnersOf, modsOf, sessOf, attFor, resFor, kindsOf, attendance, absenceLimit, prog, progs, regDates, runState, docGaps: (...a) => docGaps(...a), AT, COL, KINDS, KLAB, RLAB, setProg: id => { dProg = id; }, cur: () => dProg };
  window.dvProg = id => { dProg = id; pTab = 'Overview'; renderProg(); };
  window.dvGo = (hash, tab) => { if (hash === 'attendance') aTab = tab; if (hash === 'eisa') eTab = tab; location.hash = hash; setTimeout(() => { if (hash === 'attendance') renderAtt(); if (hash === 'eisa') renderE(); }, 0); };
  const _renderProg = renderProg;
  renderProg = function () {
    if (!P.user) return _renderProg();
    let p = prog(dProg);
    const list = progs().filter(x => PST[pStatus](x));
    if (!p || !PST[pStatus](p)) { dProg = list[0]?.id ?? dProg; p = prog(dProg); }
    $('pstatus').className = 'famseg'; $('pstatus').style.flexWrap = 'wrap';
    $('pstatus').innerHTML = Object.keys(PST).map(s => `<button class="${s === pStatus ? 'on' : ''}" aria-pressed="${s === pStatus}" onclick="pStatus='${s}';renderProg()">${s} · ${progs().filter(x => PST[s](x)).length}</button>`).join('');
    const cn = x => client(x)?.client_name || 'No client', sorted = list.slice().sort((a, b) => (cn(a) === 'No client') - (cn(b) === 'No client') || cn(a).localeCompare(cn(b)) || String(a.programme_name || '').localeCompare(String(b.programme_name || '')));
    let pLast = null;
    $('plist').innerHTML = sorted.map(x => { const gh = cn(x) !== pLast ? `<div class="pickgh"><span class="famgd" style="background:${cn(x) === 'No client' ? 'var(--warn)' : 'var(--navy)'}"></span>${esc(cn(x))}<span class="famgn">${sorted.filter(y => cn(y) === cn(x)).length}</span></div>` : ''; pLast = cn(x);
      return gh + `<button class="pick${x.id === dProg ? ' on' : ''}" onclick="dvProg(${x.id})"><b>${esc(x.programme_name)}</b><span class="sub">${x.programme_type === 'legacy' ? '<span class="famtag">LEG</span>' : '<span class="famtag">OCC</span>'}#${x.id} · ${learnersOf(x.id).length} learners${x.start_date ? ' · ' + new Date(x.start_date).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }) : '<span class="famflag">No dates</span>'}</span></button>`; }).join('') || `<div class="empty"><b>No ${pStatus.toLowerCase()} programmes</b></div>`;
    const v = $('view-programmes'), hd = v.querySelector('.dark');
    if (!p || !PST[pStatus](p)) { if ($('psuit')) $('psuit').hidden = true; hd.hidden = true; $('ptabs').innerHTML = ''; $('pstats').hidden = $('pmodcard').hidden = $('form3').hidden = true; return; }
    hd.hidden = false;
    const sp = hd.querySelectorAll('span');
    sp[0].textContent = `${p.status === 'active' ? 'Active' : p.status} · ${p.programme_type || p.qualification_type || 'Programme'}`;
    hd.querySelector('h1').textContent = p.programme_name;
    sp[1].textContent = `${client(p)?.client_name || 'No client'} · SAQA ${p.saqa_id || '—'} · NQF ${p.nqf_level || '—'} · ${fmtD(day(p.start_date)) || '—'} → ${fmtD(day(p.end_date)) || '—'}`;
    hd.querySelectorAll('button').forEach(b => { b.hidden = true; });   // buttons are rebuilt below (Edit, stage, AI summary)
    const tabs = [['Overview', `pTab='Overview';renderProg()`], ['Form 3', `pTab='Form 3';renderProg()`], ['Learners ›', `location.hash='learners'`],
      ['Attendance ›', `dvGo('attendance','Register')`], ['PoE ›', `dvGo('attendance','PoE tracker')`], ['EISA readiness ›', `dvGo('eisa','Readiness')`], ['Visits ›', `location.hash='visits'`]];
    const TK = { 'Learners ›': ['learners', 'enrolments', 'dq'], 'Attendance ›': ['attendance'], 'PoE ›': ['poe'], 'EISA readiness ›': ['eisa'], 'Visits ›': ['visits', 'recs'] };
    const tcnt = t => { if (!window.apxOvItems || !TK[t]) return ''; const xs = TK[t].flatMap(k => apxOvItems(k)).filter(x => String(x.pid) === String(p.id)); if (!xs.length) return ''; const r = xs.some(x => x.warn);
      return ` <span class="navcnt ${r ? 'r' : 'a'}" aria-label="${xs.length} ${r ? 'items, some urgent' : 'items to check'}">${xs.length}</span>`; };
    $('ptabs').innerHTML = tabs.map(([t, f], i) => (i === 2 ? '<span class="ptsep" aria-hidden="true"></span>' : '') + `<button role="tab" aria-selected="${t === pTab}" class="${t === pTab ? 'on' : ''}" onclick="${f}">${t}${tcnt(t)}</button>`).join('');
    { const sid = String(p.id), cnt = k => (D()[k] || []).filter(x => String(x.programme_id) === sid), ok = h => !window.NAVR || !NAVR[h] || NAVR[h]();
      const rel = [['qcto', 'QCTO tracker', cnt('tracker').length], ['modver', 'Moderation', cnt('mods').length], ['visits', 'Visits', cnt('visits').length], ['recs', 'Open recommendations', cnt('recs').filter(r => !r.resolved).length], ['reports', 'Reports', cnt('reports').length], ['enrolments', 'Enrolments', cnt('enrol').length]].filter(r => ok(r[0]));
      let rs = $('prelated'); if (!rs) { $('ptabs').insertAdjacentHTML('afterend', '<div id="prelated" class="sub" style="display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 4px"></div>'); rs = $('prelated'); }
      rs.innerHTML = rel.length ? '<span>Related:</span>' + rel.map(([h, l, n]) => `<a href="#${h}" style="${n ? '' : 'color:var(--warn)'}">${l} · ${n}</a>`).join('') : ''; }
    const f3 = pTab === 'Form 3';
    $('pstats').hidden = f3; $('pmodcard').hidden = f3; $('form3').hidden = !f3;
    let su = $('psuit'); if (!su) { $('pmodcard').insertAdjacentHTML('afterend', '<section class="card" id="psuit" style="padding:0;margin-top:16px"></section>'); su = $('psuit'); }
    su.hidden = f3; if (!f3) su.innerHTML = window.famSuitable ? famSuitable(p) : '';
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


  /* ---------- Programmes: search, edit (typed columns + the old app's field keys), lifecycle, CSV ----------
     Lifecycle: initiated -> (PI/Compliance/Head of Ops sign-off, handover.js) -> handed_over -> activate_programme -> active -> close_programme -> closed. */
  const CLASSIC = '/?classic=1#view=programmes';
  let pQ = '';
  const pf = p => p.fields || {};
  const pv = (p, col, key) => p[col] ?? pf(p)[key] ?? '';
  const _renderProg2 = renderProg;
  renderProg = function () {
    _renderProg2();
    if (!P.user) return;
    const side = $('pstatus')?.parentElement; if (!side) return;
    if (!$('pq')) $('pstatus').insertAdjacentHTML('afterend', '<input id="pq" type="search" placeholder="Search programmes" oninput="dvPQ(this.value)" style="height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit;background:transparent;color:var(--ink)">');
    const q = pQ.toLowerCase(); if (q) { let gh = null, any = false; const close = () => { if (gh) gh.hidden = !any; };
      [...$('plist').children].forEach(b => { if (b.classList.contains('pickgh')) { close(); gh = b; any = b.textContent.toLowerCase().includes(q); return; } b.hidden = !(b.textContent.toLowerCase().includes(q) || (gh && gh.textContent.toLowerCase().includes(q))); any = any || !b.hidden; }); close(); }
    if (window.apxPgIn) apxPgIn($('plist'), pStatus + '|' + q);
    const nb = [...side.querySelectorAll('button')].find(b => /New programme/.test(b.textContent));
    if (nb) { nb.textContent = '+ New programme'; nb.onclick = () => (CAN() || has('pi_specialist')) ? dvProgEdit(null) : say('Ask a project manager or PI specialist to add programmes'); }
    if (!$('pcsv')) { side.insertAdjacentHTML('beforeend', '<div id="pbtns" style="display:flex;gap:8px"><button class="btn" id="pcsv" style="flex:1;padding-left:8px;padding-right:8px" onclick="dvProgCsv()">Export CSV</button></div>'); if (nb) { nb.style.flex = '1'; nb.style.paddingLeft = nb.style.paddingRight = '8px'; $('pbtns').prepend(nb); } }
    const p = prog(dProg), hd = $('view-programmes').querySelector('.dark'); if (!p || !hd || hd.hidden) return;
    const box = hd.lastElementChild, st = p.status || 'initiated', pm = has('project_manager'), lead = has('pi_specialist', 'compliance_officer', 'head_of_ops');
    const btns = [`<button class="btn" onclick="window.avaToggle&&avaToggle(true);window.avaTool&&avaTool('Summarise #${p.display_id||p.id}',{type:'programme_summary',programme_id:${p.id}},'narrative')">✦ Ask Ava: summary</button>`];
    if (CAN() || pm) btns.push(`<button class="btn ghost" onclick="dvProgEdit(${p.id})">Edit</button>`);
    if (st === 'initiated' && lead) btns.push(`<a class="btn y" href="#handover/${p.id}">Sign-off &amp; hand-over</a>`);
    if (st === 'handed_over' && pm) btns.push(`<button class="btn y" onclick="dvStage(${p.id},'activate_programme','Mark this programme as Active? This confirms you are taking it on.')">Activate</button>`);
    if (st === 'active' && pm) btns.push(`<button class="btn ghost" onclick="dvStage(${p.id},'close_programme','Mark this programme as Closed? This is the final stage.')">Close</button>`);
    box.innerHTML = btns.join('');
    { const L = ['Initiated', 'Signed off & handed over', 'Active', 'Moderation', 'EISA', 'Closed'], O = ['PI / compliance', 'PM', 'PM', 'QA', 'PM', 'PM'];
      let i = { initiated: 0, handed_over: 1, active: 2, closed: 6, completed: 6 }[st]; if (i == null) i = 2;
      if (i === 2 && (D().mods || []).some(m => m.programme_id === p.id && m.stage && m.stage !== 'Submitted to PM')) i = 3;
      if (i >= 2 && i < 6 && (D().tracker || []).some(x => x.programme_id === p.id && x.eisa_date)) i = 4;
      const ms = modsOf(p.id) || [], tr = ms.filter(m => m.trained).length;
      let sp = $('pstep'); if (!sp) { hd.insertAdjacentHTML('afterend', '<div id="pstep" class="card" style="padding:12px 16px;display:flex;flex-direction:column;gap:8px"></div>'); sp = $('pstep'); }
      sp.innerHTML = `<ol class="psteps">${L.map((s, k) => `<li class="${k < i ? 'done' : k === i ? 'cur' : ''}"><span>${k < i ? '✓' : k + 1}</span>${s}</li>`).join('')}</ol><div class="sub">${i < 6 ? `Now: <b>${L[i]}</b> · owner ${O[i]}` : 'All stages done'}${ms.length ? ` · Modules trained: <b>${tr} of ${ms.length}</b>` : ' · No modules set up yet'}</div>`; }
    if (window.apxProgDocs && pTab !== 'Form 3') apxProgDocs(p.id, 'pdocs'); else if ($('pdocs')) $('pdocs').hidden = true;
    const sp = hd.querySelectorAll('span'); if (sp[0]) sp[0].textContent = `${{ initiated: 'Initiated · awaiting sign-off', handed_over: 'Handed over · awaiting activation', active: 'Active', closed: 'Closed' }[st] || st} · ${p.programme_type || p.qualification_type || 'Programme'}${p.display_id ? ' · ' + p.display_id : ''}`;
  };
  window.dvPQ = v => { pQ = v || ''; renderProg(); };
  window.dvStage = async (id, fn, msg) => {
    if (!confirm(msg)) return;
    const { error } = await sb.rpc(fn, { p_id: id });
    if (error) return say('Update failed: ' + (error.message || 'you may not have permission for this stage change'));
    say(fn === 'activate_programme' ? 'Programme marked Active' : 'Programme marked Closed'); await window.previewReload();
  };
  window.dvProgEdit = id => {
    const p = id ? prog(id) : { fields: {} }; if (!p) return; const f = pf(p), cl = D().clients || [];   // id null = new programme
    const i = (n, l, v, t = 'text', ex = '') => `<label>${l}<input name="${n}" type="${t}" value="${esc(v ?? '')}" ${ex}></label>`;
    const o = (list, v) => '<option value="">—</option>' + (v && !list.includes(v) ? [v, ...list] : list).map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const d = v => v ? String(v).slice(0, 10) : '';
    const fk = k => (k in f) ? k : (k.toLowerCase() in f ? k.toLowerCase() : k);   // legacy rows hold facilitator/assessor/moderator in lower case: keep one key
    const famNames = [...new Set((D().assessors || []).map(a => String(a.full_name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const dl = `<datalist id="dlfam">${famNames.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist><datalist id="dlsaqa">${(D().accs || []).filter(a => a.saqa_id).map(a => `<option value="${esc(String(a.saqa_id).trim())}">${esc((a.title || '') + ' · ' + (a.status || ''))}</option>`).join('')}</datalist>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="Edit programme"><form class="card" id="pform"><h2>${id ? 'Edit programme' : 'New programme'}</h2><div class="qagrid">
      ${i('progid', 'Prog ID *', pv(p, 'display_id', 'Prog ID'), 'text', 'required')}${i('qual', 'Qualification / programme name *', p.qualification_name || f.Qualification || p.programme_name, 'text', 'required')}
      <label>Client *<select name="client" required><option value="">—</option>${cl.filter(c => !c.deleted_at).sort((a, b) => String(a.client_name).localeCompare(String(b.client_name))).map(c => `<option value="${c.id}" ${c.id === p.client_id ? 'selected' : ''}>${esc(c.client_name)}</option>`).join('')}</select></label>
      ${i('entity', 'Entity', pv(p, 'entity', 'Entity'))}${i('pm', 'Project manager', pv(p, 'project_manager_name', 'Project Manager'))}<label>Type<select name="type"><option value="">—</option>${[['occupational', 'Occupational (QCTO)'], ['legacy', 'Legacy (SETA)']].map(([k, l]) => `<option value="${k}" ${p.programme_type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${i('saqa', 'SAQA ID', pv(p, 'saqa_id', 'SAQA ID'), 'text', 'list="dlsaqa" autocomplete="off"')}${i('qcto', 'QCTO code', pv(p, 'qualification_code', 'QCTO Code'))}${i('nqf', 'NQF level', pv(p, 'nqf_level', 'NQF'))}
      ${i('cohort', 'Cohort', pv(p, 'group_name', 'Cohort'))}${i('learners', 'Learners (planned)', pv(p, 'group_size', 'Learners'), 'number')}<label>Employment status<select name="emp">${o(['Employed', 'Unemployed'], f['Employment Status'])}</select></label>
      <label>Mode of delivery<select name="mode">${o(['Face to Face', 'Online', 'Blended'], f['Mode of Delivery'])}</select></label>${i('seta', 'SETA', f.SETA)}<label>Programme status<select name="pst">${o(['Active', 'Completed', 'Suspended', 'Cancelled'], p.programme_status || f.Status)}</select></label>
      ${i('start', 'Start date', d(pv(p, 'start_date', 'Start Date')), 'date')}${i('end', 'End date', d(pv(p, 'end_date', 'End Date')), 'date')}${i('accred', 'Accreditation period end', d(pv(p, 'accreditation_end_date', 'Accreditation Period End Date')), 'date')}
      ${i('eisas', 'EISA start', d(pv(p, 'eisa_start_date', 'EISA Start')), 'date')}${i('eisae', 'EISA end', d(pv(p, 'eisa_end_date', 'EISA End')), 'date')}${i('fac', 'Facilitator', f[fk('Facilitator')], 'text', 'list="dlfam" autocomplete="off"')}${i('ass', 'Assessor', f[fk('Assessor')], 'text', 'list="dlfam" autocomplete="off"')}${i('mod', 'Moderator', f[fk('Moderator')], 'text', 'list="dlfam" autocomplete="off"')}</div>${dl}
      <p class="sub">Facilitator, assessor and moderator: pick the full name from the FAM Registry list. SAQA ID: pick from the Accreditation list. Type a value only if it is not listed yet.</p>
      <label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px">Comments<textarea name="comments" rows="3" style="border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;background:transparent;color:var(--ink)">${esc(f.Comments || '')}</textarea></label>
      <p class="sub">${id ? 'Lifecycle stage (initiated, handed over, active, closed) changes only through Sign-off, Activate and Close.' : 'The programme starts as Initiated. Next: Sign-off & hand-over to the project manager.'}</p>
      <div class="sub" id="perr" style="color:var(--bad)"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" onclick="document.getElementById('famov').remove()">Cancel</button><button class="btn y" id="psave">Save</button></div></form></div>`);
    $('pform').onsubmit = async ev => {
      ev.preventDefault(); const el = $('pform').elements, v = n => el[n].value.trim(), dn = n => v(n) || null, b = $('psave'); b.disabled = true; b.textContent = 'Saving…';
      const c = cl.find(x => String(x.id) === v('client'));
      const fields = { ...f, 'Prog ID': v('progid'), Qualification: v('qual'), Client: c ? (c.fields?.['Company Name'] || c.client_name) : '', Entity: v('entity'), 'Project Manager': v('pm'), Type: v('type') ? { occupational: 'Occupational', legacy: 'Legacy' }[v('type')] : (f.Type || ''), 'SAQA ID': v('saqa'), 'QCTO Code': v('qcto'), NQF: v('nqf'),
        Cohort: v('cohort'), Learners: v('learners') === '' ? null : +v('learners'), 'Employment Status': v('emp'), 'Mode of Delivery': v('mode'), SETA: v('seta'), Status: v('pst') || f.Status || 'Active', 'Start Date': dn('start'), 'End Date': dn('end'),
        'Accreditation Period End Date': dn('accred'), 'EISA Start': dn('eisas'), 'EISA End': dn('eisae'), [fk('Facilitator')]: v('fac'), [fk('Assessor')]: v('ass'), [fk('Moderator')]: v('mod'), Comments: v('comments') };
      Object.keys(fields).forEach(k => { if ((fields[k] === null || fields[k] === '') && !(k in f)) delete fields[k]; });
      const row = { fields, display_id: v('progid'), programme_name: v('qual') || v('progid'), qualification_name: v('qual') || null, client_id: c ? c.id : null, entity: v('entity') || null, project_manager_name: v('pm') || null, programme_type: v('type') || null,
        saqa_id: v('saqa') || null, qualification_code: v('qcto') || null, nqf_level: v('nqf') || null, group_name: v('cohort') || null, group_size: v('learners') === '' ? null : +v('learners'), programme_status: v('pst') || null,
        start_date: dn('start'), end_date: dn('end'), accreditation_end_date: dn('accred'), eisa_start_date: dn('eisas'), eisa_end_date: dn('eisae') };
      try { const r = await write('Programme', () => id ? sb.from('programmes').update(row).eq('id', id).select('id') : sb.from('programmes').insert({ ...row, tenant_id: P.tenant, initiated_by_email: P.user?.email || null }).select('id'));
        $('famov').remove(); say(id ? 'Programme saved' : 'Programme created'); await window.previewReload(); const nid = !id && r && r[0] && r[0].id; if (nid && window.dvProg) { location.hash = 'programmes'; setTimeout(() => dvProg(nid), 300); } }
      catch (err) { $('perr').textContent = err.message || String(err); b.disabled = false; b.textContent = 'Save'; }
    };
  };
  window.dvProgCsv = () => {
    const rows = progs().filter(p => PST[pStatus](p)), cols = [['Prog ID', p => p.display_id], ['Programme', p => p.programme_name], ['Client', p => client(p)?.client_name], ['Stage', p => p.status], ['Type', p => p.programme_type], ['SAQA ID', p => p.saqa_id], ['NQF', p => p.nqf_level], ['Project manager', p => p.project_manager_name], ['Start', p => day(p.start_date)], ['End', p => day(p.end_date)], ['Learners enrolled', p => learnersOf(p.id).length]];
    const t = [cols.map(c => c[0]), ...rows.map(p => cols.map(c => c[1](p) ?? ''))].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv' })); a.download = `Programmes-${pStatus}.csv`; document.body.appendChild(a); a.click(); a.remove(); } catch (_) {}
    say(`Exported ${rows.length} programmes`);
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
  /* Attention tiles (running programmes, PMs see their own), programme picker '#id · client · programme', programme strip. */
  let aF = null, aScope = 'run';
  const AF = { noreg: ['No register in 14 days', 'Running, no register captured in the last 14 days', 'var(--warn)'], low: ['Below 80% attendance', 'Late counts as attended', 'var(--bad)'],
    over: ['Over absence limit', 'At least one learner over 3 days (5 on 12-month programmes)', 'var(--bad)'], out: ['Register outside dates', 'Register before the start or after the end date', 'var(--bad)'],
    docs: ['Documents not captured', 'No document marks on the Documents tab yet', 'var(--warn)'], nomod: ['No modules set up', 'Occupational programme with no modules, so the PoE tracker is empty', 'var(--warn)'] };
  function attFlags() {
    const ab = {}, t = today(); (D().att || []).forEach(a => { if (AT(a.status) === 'A') { const k = a.programme_id + '.' + a.learner_id; ab[k] = (ab[k] || 0) + 1; } });
    return progs().filter(p => !p.deleted_at && runState(p) === 'Active' && learnersOf(p.id).length && (!window.apxMineProg || apxMineProg(p))).map(p => {
      const f = [], rd = regDates(p.id), past = rd.filter(d => d <= t), last = past[past.length - 1], lim = absenceLimit(p), r = attendance(p).rate;
      if (!last || (new Date(t) - new Date(last)) / 864e5 > 14) f.push('noreg');
      if (r != null && r < 80) f.push('low');
      if (learnersOf(p.id).some(l => !wdr(p.id, l.id) && (ab[p.id + '.' + l.id] || 0) > lim)) f.push('over');
      if (rd.some(d => (p.start_date && d < day(p.start_date)) || (p.end_date && d > day(p.end_date)))) f.push('out');
      if (!docGaps(p.id).captured) f.push('docs');
      if (p.programme_type !== 'legacy' && !modsOf(p.id).length) f.push('nomod');
      return [p, f, last]; });
  }
  window.dvAttF = k => { aF = aF === k ? null : k; dProg = null; renderAtt(); };
  window.dvAttScope = v => { aScope = v; aF = null; dProg = null; renderAtt(); };
  function attTop(FA) {
    let el = $('attwarn'); if (!el) { $('atabs').insertAdjacentHTML('beforebegin', '<div id="attstrip" class="card" style="margin-bottom:12px;padding:12px 20px"></div><section class="card" id="attwarn" style="margin-bottom:12px"></section>'); el = $('attwarn'); }
    el.hidden = false;
    el.innerHTML = `<div class="famtiles">${UI.tiles([{ t: `Needs attention · ${FA.length} running programme${FA.length === 1 ? '' : 's'}`, k: Object.keys(AF).map(k => [AF[k][0], FA.filter(x => x[1].includes(k)).length, AF[k][2], aF === k, `dvAttF('${k}')`, AF[k][1]]) }])}</div>`
      + (aF ? `<div class="sub" style="margin-top:8px">Programme list shows only: <b>${AF[aF][0]}</b> · <a href="javascript:void 0" onclick="dvAttF('${aF}')">Clear</a></div>` : '');
    const sel = document.querySelector('#view-attendance label.f select:not(#ascope)'); if (!sel) return;
    const cn = p => client(p)?.client_name || 'No client';
    let list = aF ? FA.filter(x => x[1].includes(aF)).map(x => x[0]) : aScope === 'all' ? progs().filter(p => !p.deleted_at && learnersOf(p.id).length && (!window.apxMineProg || apxMineProg(p))) : FA.map(x => x[0]);
    list = list.slice().sort((a, b) => cn(a).localeCompare(cn(b)) || a.id - b.id);
    if (!list.some(p => p.id === dProg)) { const cur = prog(dProg); if (!aF && cur && learnersOf(cur.id).length) list.unshift(cur); else dProg = list[0]?.id ?? null; }
    sel.innerHTML = list.map(p => `<option value="${p.id}"${p.id === dProg ? ' selected' : ''}>#${p.id} · ${esc(cn(p))} · ${esc(p.programme_name || '')}${p.group_name ? ' · ' + esc(p.group_name) : ''}</option>`).join('') || '<option value="">No programmes</option>';
    sel.style.maxWidth = '640px'; sel.onchange = () => { dProg = +sel.value; renderAtt(); };
    if (!$('ascope')) sel.insertAdjacentHTML('beforebegin', '<select id="ascope" style="height:40px;width:auto;flex:0 0 auto" aria-label="Which programmes" onchange="dvAttScope(this.value)"><option value="run">Running</option><option value="all">All</option></select>');
    $('ascope').value = aScope; $('ascope').disabled = !!aF;
  }
  function attStrip(p, FA) {
    const el = $('attstrip'); if (!el) return; el.hidden = !p; if (!p) return;
    const x = FA.find(y => y[0].id === p.id), rd = regDates(p.id), t = today(), past = rd.filter(d => d <= t), last = past[past.length - 1];
    const ls = learnersOf(p.id), w = ls.filter(l => wdr(p.id, l.id)).length, rs = runState(p);
    const bits = [esc(client(p)?.client_name || 'No client'), 'PM ' + esc(p.project_manager_name || 'not set'), `${fmtD(day(p.start_date)) || 'No start'} → ${fmtD(day(p.end_date)) || 'No end'}`,
      `${ls.length - w} learner${ls.length - w === 1 ? '' : 's'}${w ? ` (+${w} withdrawn)` : ''}`, `${sessOf(p.id).length} session${sessOf(p.id).length === 1 ? '' : 's'}`, 'Last register ' + (last ? fmtD(last) : 'none')];
    el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center"><b>#${p.id}</b><span class="badge ${rs === 'Active' ? 'b-ok' : 'b-n'}">${rs === 'Active' ? 'Running' : rs}</span><span class="sub">${bits.join(' · ')}</span>${(x ? x[1] : []).map(k => `<span class="badge" style="background:${AF[k][2]};color:#fff">${AF[k][0]}</span>`).join('')}</div>`;
  }
  window.dvAttPick = id => { dProg = id; aTab = 'Register'; renderAtt(); };
  const _renderAtt = renderAtt;
  renderAtt = function () {
    if (!P.user) return _renderAtt();
    const FA = attFlags(); attTop(FA);
    const p = dProg == null ? null : ensure(); attStrip(p, FA);
    $('atabs').innerHTML = ['Register', 'PoE tracker', 'Documents'].map(t => `<button class="${t === aTab ? 'on' : ''}" onclick="aTab='${t}';renderAtt()">${t}</button>`).join('');
    $('regcard').hidden = aTab !== 'Register'; $('poecard').hidden = aTab !== 'PoE tracker'; renderDocs(p);
    if (!p) { $('register').innerHTML = `<tbody><tr><td class="sub">${aF ? 'No programmes match this filter.' : 'No programmes with learners.'}</td></tr></tbody>`; $('poetable').innerHTML = ''; return; }
    const ls = learnersOf(p.id), ss = sessOf(p.id), ed = CAN(), lim = absenceLimit(p);
    const hint = $('regcard').querySelector('p.sub');
    if (hint) hint.innerHTML = (ed ? 'Tap a cell to cycle Present → Late → Absent. Changes save automatically. ' : 'Read only for your role. ') + `R means late and counts as attended. The absence limit for this programme is ${lim} days. Sessions can only be added on dates inside the programme dates, up to today.`;
    const head = $('regcard').firstElementChild;
    if (head && !$('dvadd')) head.insertAdjacentHTML('beforeend', '<button class="btn sm" onclick="dvAttCsv()">Export CSV</button><button class="btn sm" id="dvadd" onclick="dvAddToggle()">+ Add session</button>');
    if ($('dvadd')) $('dvadd').hidden = !ed;
    const form = !ed || !addOpen ? '' : `<tr><td colspan="${ss.length + 3}" style="white-space:normal"><div class="qagrid" id="dvsess"><label>Date<input type="date" data-k="session_date"></label>
      <label>Module<select data-k="module">${modsOf(p.id).map(m => `<option value="${m.module_number}">Module ${m.module_number}: ${esc(m.title || '')}</option>`).join('') || '<option value="">No modules</option>'}</select></label>
      <label>Topic<input data-k="topic"></label><label>Facilitator<input data-k="facilitator" value="${esc((D().assessors || []).find(a => a.id === p.facilitator_id)?.full_name || '')}"></label><label>Venue<input data-k="venue" value="Online"></label></div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn y sm" onclick="dvAddSession()">Save session</button><button class="btn sm" onclick="dvAddToggle()">Cancel</button></div></td></tr>`;
    $('register').innerHTML = `<thead><tr><th>Learner</th>${ss.map((s, i) => `<th style="text-align:center" title="${s.imported ? 'Imported register: marks captured without a session record' : esc(s.topic || '')}">S${i + 1}<div class="sub" style="font-weight:400">${fmtD(day(s.session_date)).slice(0, 5)}${modOfSession(s) ? ' · M' + modOfSession(s) : ''}</div></th>`).join('')}<th>Rate</th><th>Absent</th></tr></thead><tbody>${form}${ls.map(l => {
      let rec = 0, here = 0, ab = 0;
      const cells = ss.map(s => { const v = AT(attFor(p.id, l.id, s.session_date)?.status); if (v) { rec++; if (v !== 'A') here++; if (v === 'A') ab++; }
        const [bg, fg] = v && SC[v] ? SC[v] : ['var(--soft)', 'var(--muted)'];
        return `<td style="text-align:center;padding:8px 4px">${ed ? `<button aria-label="${name(l)} ${fmtD(day(s.session_date))}: ${v || 'not recorded'}" onclick="dvMark(${l.id},'${day(s.session_date)}')" style="width:36px;height:36px;border:0;border-radius:8px;font-weight:700;background:${bg};color:${fg}">${v || '·'}</button>` : `<span class="dot" style="width:32px;height:32px;background:${bg};color:${fg}">${v || '·'}</span>`}</td>`; }).join('');
      const wd = wdr(p.id, l.id);
      return `<tr${wd ? ' style="opacity:.55"' : ''}><td style="font-weight:600">${lnk(l)}${wd ? ' <span class="badge b-n">Withdrawn</span>' : ''}</td>${cells}<td style="font-weight:600">${rec ? pct(here, rec) + '%' : '—'}</td><td>${ab > lim && !wd ? `<span class="badge b-bad">${ab} · over ${lim}</span>` : ab}</td></tr>`; }).join('')}</tbody>`;
    if (!ss.length) $('register').insertAdjacentHTML('beforeend', `<tbody><tr><td colspan="3" class="sub">No sessions yet.${ed ? ' Use “+ Add session”.' : ''}</td></tr></tbody>`);
    // PoE tracker: module results per part + internal moderation (feeds EISA readiness)
    const ms = modsOf(p.id);
    const cell = (l, m, k) => { const v = resFor(p.id, l.id, m.module_number)?.[COL[k]] || '';
      return ed ? `<td><select class="cellin" aria-label="${name(l)} module ${m.module_number} ${KLAB[k]}" onchange="dvRes2(${l.id},${m.module_number},'${k}',this.value)"><option value=""${v ? '' : ' selected'}>—</option>${RES.map(r => `<option value="${r}"${r === v ? ' selected' : ''}>${r} · ${RLAB[r]}</option>`).join('')}</select></td>`
        : `<td>${v ? `<span class="badge ${RCL[v]}">${RLAB[v] || v}</span>` : '<span class="sub">—</span>'}</td>`; };
    const modc = (l, m) => { const on = resFor(p.id, l.id, m.module_number)?.fields?.['Internal moderation'] === 'Yes';
      return `<td style="text-align:center">${ed ? `<input type="checkbox" aria-label="${name(l)} module ${m.module_number} internally moderated"${on ? ' checked' : ''} onchange="dvMod(${l.id},${m.module_number},this.checked)">` : on ? '<span class="badge b-ok">Yes</span>' : '<span class="sub">No</span>'}</td>`; };
    const modForm = ed && p.programme_type !== 'legacy' && (!ms.length || modOpen) ? `<div class="qagrid" id="dvmod" style="margin-top:10px"><label>Module number<input type="number" min="1" data-k="n" value="${(ms.reduce((t, m) => Math.max(t, m.module_number), 0)) + 1}"></label><label>Module title<input data-k="title" placeholder="As on the curriculum"></label>
      ${KINDS.map(k => `<label>${KLAB[k]} code<input data-k="${k}" placeholder="Blank if this module has no ${KLAB[k].toLowerCase()} part"></label>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn y sm" onclick="dvModAdd()">Add module</button>${ms.length ? '<button class="btn sm" onclick="dvModToggle()">Cancel</button>' : ''}</div><p class="sub" style="margin:6px 0 0">Use the module codes from the QCTO curriculum. Hours and facilitators are added on the programme's Form 3.</p>` : '';
    { const hd = $('poecard').firstElementChild; hd.style.cssText = 'padding:16px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
      hd.innerHTML = `<h2 style="flex-grow:1">PoE tracker</h2>${ed && ms.length && p.programme_type !== 'legacy' ? '<button class="btn sm" onclick="dvModToggle()">+ Add module</button>' : ''}`;
      let mf = $('dvmodbox'); if (!mf) { hd.insertAdjacentHTML('afterend', '<div id="dvmodbox" style="padding:0 20px 14px"></div>'); mf = $('dvmodbox'); }
      mf.innerHTML = !ms.length ? (p.programme_type === 'legacy'
        ? '<p class="sub" style="margin:0">Legacy programme: tracked by unit standards, so the knowledge / practical / workplace module tracker does not apply. Use the Documents tab for learner documents.</p>'
        : `<p style="margin:0"><b>No modules set up for this programme yet.</b> <span class="sub">The PoE tracker, module results and EISA readiness all need the programme's modules.${ed ? ' Add them below.' : ' Ask the PM to add them.'}</span></p>${modForm}`) : modForm;
      mf.hidden = !mf.innerHTML; }
    $('poetable').innerHTML = !ms.length ? ''
      : `<thead><tr><th rowspan="2">Learner</th>${ms.map(m => `<th colspan="${kindsOf(m).length + 1}" style="text-align:center;border-left:1px solid var(--line)">Module ${m.module_number}</th>`).join('')}</tr>
        <tr>${ms.map(m => kindsOf(m).map((k, i) => `<th${i ? '' : ' style="border-left:1px solid var(--line)"'}>${KLAB[k]}</th>`).join('') + '<th>Moderated</th>').join('')}</tr></thead>
        <tbody>${ls.map(l => `<tr><td style="font-weight:600">${lnk(l)}</td>${ms.map(m => kindsOf(m).map(k => cell(l, m, k)).join('') + modc(l, m)).join('')}</tr>`).join('')}</tbody>`;
  };
  window.dvAddToggle = () => { addOpen = !addOpen; renderAtt(); };
  let modOpen = false; window.dvModToggle = () => { modOpen = !modOpen; renderAtt(); };
  window.dvModAdd = async () => {
    const p = prog(dProg), box = $('dvmod'); if (!p || !box) return;
    const v = {}; box.querySelectorAll('[data-k]').forEach(i => { v[i.dataset.k] = i.value.trim(); });
    const n = +v.n; if (!n || n < 1) return say('Enter the module number');
    if (modsOf(p.id).some(m => m.module_number === n)) return say('Module ' + n + ' already exists');
    if (!v.title) return say('Enter the module title');
    const comps = KINDS.filter(k => v[k]).map(k => ({ kind: k, code: v[k], title: v.title, hours: null, facilitator_id: null }));
    if (!comps.length) return say('Enter at least one module code (knowledge, practical or workplace)');
    const row = { tenant_id: P.tenant, programme_id: p.id, module_number: n, title: v.title, components: comps };
    const r = await write('Module', () => sb.from('program_modules').insert(row).select());
    (D().pmods = D().pmods || []).push((r && r[0]) || row); modOpen = false; say('Module ' + n + ' added'); renderAtt();
  };
  window.dvAddSession = async () => {
    const p = prog(dProg), box = $('dvsess'); if (!p || !box) return;
    const v = {}; box.querySelectorAll('[data-k]').forEach(i => { v[i.dataset.k] = i.value.trim(); });
    if (!v.session_date) return say('Pick the session date');
    if (v.session_date > today()) return say('A session cannot be in the future');
    if (p.start_date && v.session_date < day(p.start_date)) return say('That date is before the programme start (' + fmtD(day(p.start_date)) + ')');
    if (p.end_date && v.session_date > day(p.end_date)) return say('That date is after the programme end (' + fmtD(day(p.end_date)) + ')');
    if (sessOf(p.id).some(s => day(s.session_date) === v.session_date)) return say('There is already a session or register on that date');
    const row = { tenant_id: P.tenant, programme_id: p.id, session_date: v.session_date, topic: v.topic || null, facilitator: v.facilitator || null, venue: v.venue || null,
      fields: { Date: v.session_date, Topic: v.topic, Facilitator: v.facilitator, Venue: v.venue, Programme: [String(p.id)], Module: v.module ? +v.module : null } };
    const r = await write('Session', () => sb.from('attendance_sessions').insert(row).select());
    (D().sessions = D().sessions || []).push((r && r[0]) || row); addOpen = false; say('Session added'); renderAtt();
  };
  window.dvMark = async (lid, d) => {
    const p = prog(dProg); if (!p) return;
    const cur = attFor(p.id, lid, d), nv = NEXT[AT(cur?.status)] || 'P';
    const row = { tenant_id: P.tenant, programme_id: p.id, learner_id: lid, session_date: d, status: nv, fields: { ...(cur?.fields || {}), Programme: [String(p.id)], Learner: [String(lid)], Date: d, Status: nv } };
    await write('Attendance', () => sb.from('attendance').upsert(row, { onConflict: 'tenant_id,learner_id,programme_id,session_date' }));
    if (cur) { cur.status = nv; cur.fields = row.fields; } else (D().att = D().att || []).push(row);
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


  /* ---------- Documents checklist (the old app's "PoE" screen): per programme document list, per learner Received / Missing / N/A + note ----------
     poe_checklist rows: fields RecordType 'poe' {Programme:[id],Learner:[id],Marks: JSON {docId: received|missing|na, note_<docId>: text}}
     and RecordType 'poeconfig' {Programme:[id], Docs: JSON [{id,label,required}]}; typed programme_id / learner_id kept in step. */
  const POE_DOCS = [{ id: 'id_copy', label: 'ID Copy / Certified ID', required: true }, { id: 'enrolment_frm', label: 'Signed Enrolment Form', required: true }, { id: 'consent', label: 'Consent Form (POPIA)', required: true },
    { id: 'logbook', label: 'Logbook (signed)', required: true }, { id: 'poe', label: 'Portfolio of Evidence (PoE)', required: true }, { id: 'mou', label: 'MOU (employer-signed)', required: false },
    { id: 'medical', label: 'Medical Certificate (if applicable)', required: false }, { id: 'bank_confirm', label: 'Banking Confirmation Letter', required: false }];
  // Registers imported from the old app used this list (no 'poeconfig' row): show those programmes against it so their marks count.
  const POE_LEGACY = [{ id: 'id_copy', label: 'ID Copy / Certified ID', required: true }, { id: 'learner_agreement', label: 'Learner Agreement', required: true },
    { id: 'qualification_cert', label: 'Qualification Certificate', required: true }, { id: 'workplace_evidence', label: 'Workplace Evidence', required: true }];
  const pcProg = r => +((r.fields?.Programme || [])[0] ?? r.programme_id), pcLearner = r => +((r.fields?.Learner || [])[0] ?? r.learner_id);
  const pcRows = () => D().poeRows || [];
  const pcCfgRec = pid => pcRows().find(r => r.fields?.RecordType === 'poeconfig' && pcProg(r) === pid);
  const pcLearnerRows = pid => pcRows().filter(r => (r.fields?.RecordType || 'poe') === 'poe' && pcProg(r) === pid);
  const pcDocs = pid => { const r = pcCfgRec(pid); try { if (r?.fields?.Docs) return JSON.parse(r.fields.Docs); } catch (_) {}
    const legacy = new Set(POE_LEGACY.map(d => d.id).filter(k => !POE_DOCS.some(d => d.id === k)));
    const used = pcLearnerRows(pid).some(r => { try { return Object.keys(JSON.parse(r.fields?.Marks || '{}')).some(k => legacy.has(k)); } catch (_) { return false; } });
    return (used ? POE_LEGACY : POE_DOCS).map(d => ({ ...d })); };
  // Newest row wins if a learner has more than one
  const pcRec = (pid, lid) => pcLearnerRows(pid).filter(r => pcLearner(r) === lid).sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')) || (b.id || 0) - (a.id || 0))[0];
  const pcMarks = (pid, lid) => { try { return JSON.parse(pcRec(pid, lid)?.fields?.Marks || '{}'); } catch (_) { return {}; } };
  async function pcSave(pid, lid, marks) {
    const cur = pcRec(pid, lid), fields = { ...(cur?.fields || {}), RecordType: 'poe', Programme: [String(pid)], Learner: [String(lid)], Marks: JSON.stringify(marks) };
    if (cur) { await write('Documents', () => sb.from('poe_checklist').update({ fields, programme_id: pid, learner_id: lid }).eq('id', cur.id)); cur.fields = fields; }
    else { const r = await write('Documents', () => sb.from('poe_checklist').insert({ tenant_id: P.tenant, programme_id: pid, learner_id: lid, fields }).select()); pcRows().push((r && r[0]) || { fields, programme_id: pid, learner_id: lid }); }
  }
  /* Learner documents per programme for Today: learners, any marks captured, learners with a required document marked Missing,
     learners with a required document not yet marked. */
  function docGaps(pid) { const ls = learnersOf(pid), req = pcDocs(pid).filter(d => d.required); let captured = false, missing = 0, open = 0;
    ls.forEach(l => { const m = pcMarks(pid, l.id); if (Object.keys(m).some(k => !k.startsWith('note_') && m[k])) captured = true;
      if (req.some(d => m[d.id] === 'missing')) missing++; else if (req.some(d => !m[d.id])) open++; });
    return { learners: ls.length, captured, missing, open }; }
  window.dvDoc = async (lid, doc, st) => { const p = prog(dProg); if (!p) return; const m = pcMarks(p.id, lid); m[doc] = m[doc] === st ? '' : st; await pcSave(p.id, lid, m); renderAtt(); };
  window.dvDocNote = async (lid, doc, v) => { const p = prog(dProg); if (!p) return; const m = pcMarks(p.id, lid); if (v.trim()) m['note_' + doc] = v.trim(); else delete m['note_' + doc]; await pcSave(p.id, lid, m); say('Note saved'); };
  window.dvDocCfg = () => {
    const p = prog(dProg); if (!p) return; const docs = pcDocs(p.id);
    document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="Document list"><form class="card" id="dcform"><h2>Documents for ${esc(p.programme_name)}</h2>
      <div id="dclist" style="display:flex;flex-direction:column;gap:6px">${docs.map(d => `<div style="display:flex;gap:8px;align-items:center"><input data-id="${esc(d.id)}" value="${esc(d.label)}" style="flex-grow:1;height:34px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:transparent;color:var(--ink)"><label style="flex-direction:row;gap:6px;align-items:center;font-size:12px"><input type="checkbox" ${d.required ? 'checked' : ''} style="height:auto"> Required</label><button type="button" class="btn sm" onclick="this.parentElement.remove()">Remove</button></div>`).join('')}</div>
      <button type="button" class="btn sm" onclick="document.getElementById('dclist').insertAdjacentHTML('beforeend','<div style=&quot;display:flex;gap:8px;align-items:center&quot;><input data-id=&quot;doc_'+Date.now()+'&quot; placeholder=&quot;Document name&quot; style=&quot;flex-grow:1;height:34px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:transparent;color:var(--ink)&quot;><label style=&quot;flex-direction:row;gap:6px;align-items:center;font-size:12px&quot;><input type=&quot;checkbox&quot; checked style=&quot;height:auto&quot;> Required</label><button type=&quot;button&quot; class=&quot;btn sm&quot; onclick=&quot;this.parentElement.remove()&quot;>Remove</button></div>')">+ Add document</button>
      <div class="sub" id="dcerr" style="color:var(--bad)"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" onclick="document.getElementById('famov').remove()">Cancel</button><button class="btn y">Save list</button></div></form></div>`);
    $('dcform').onsubmit = async ev => { ev.preventDefault();
      const list = [...$('dclist').children].map(r => { const [t, c] = r.querySelectorAll('input'); return { id: t.dataset.id, label: t.value.trim(), required: c.checked }; }).filter(d => d.label);
      const cur = pcCfgRec(p.id), fields = { ...(cur?.fields || {}), RecordType: 'poeconfig', Programme: [String(p.id)], Docs: JSON.stringify(list) };
      try { if (cur) { await write('Document list', () => sb.from('poe_checklist').update({ fields, programme_id: p.id }).eq('id', cur.id)); cur.fields = fields; }
        else { const r = await write('Document list', () => sb.from('poe_checklist').insert({ tenant_id: P.tenant, programme_id: p.id, fields }).select()); pcRows().push((r && r[0]) || { fields, programme_id: p.id }); }
        $('famov').remove(); say('Document list saved'); renderAtt(); } catch (err) { $('dcerr').textContent = err.message || String(err); } };
  };
  let docView = 'Grid'; window.dvDocView = v => { docView = v; renderAtt(); };
  const DNX = { '': 'received', received: 'missing', missing: 'na', na: '' };
  window.dvDocCyc = async (lid, doc) => { const p = prog(dProg); if (!p) return; const m = pcMarks(p.id, lid); m[doc] = DNX[m[doc] || '']; await pcSave(p.id, lid, m); renderAtt(); };
  window.dvDocAll = async doc => { const p = prog(dProg); if (!p) return; let n = 0;
    for (const l of learnersOf(p.id)) { if (wdr(p.id, l.id)) continue; const m = pcMarks(p.id, l.id); if (m[doc]) continue; m[doc] = 'received'; await pcSave(p.id, l.id, m); n++; }
    say(n ? `Marked ${n} learner${n === 1 ? '' : 's'} as received` : 'Every learner is already marked'); renderAtt(); };
  function renderDocs(p) {
    let box = $('doccard'); if (!box) { $('poecard').insertAdjacentHTML('afterend', '<section class="card" id="doccard" hidden></section>'); box = $('doccard'); }
    box.hidden = aTab !== 'Documents'; if (aTab !== 'Documents' || !p) return;
    const ls = learnersOf(p.id), docs = pcDocs(p.id), req = docs.filter(d => d.required), ed = CAN();
    const done = l => { const m = pcMarks(p.id, l.id); return req.filter(d => m[d.id] === 'received' || m[d.id] === 'na').length; };
    const complete = ls.filter(l => done(l) === req.length).length;
    const btn = (l, d, st, lab, cls) => { const on = pcMarks(p.id, l.id)[d.id] === st; return ed ? `<button class="btn sm${on ? ' ' + cls : ''}" style="${on ? '' : 'opacity:.55'}" onclick="dvDoc(${l.id},'${esc(d.id)}','${st}')">${lab}</button>` : (on ? `<span class="badge ${cls === 'y' ? 'b-ok' : cls === 'n' ? 'b-bad' : 'b-n'}">${lab}</span>` : ''); };
    const MAP = { id_copy: 'idsReceived', learner_agreement: 'learnerAgreementReceived', qualification_cert: 'qualificationsReceived' };
    const SCD = { received: ['Received', 'var(--ok)', '#fff'], missing: ['Missing', 'var(--bad)', '#fff'], na: ['N/A', 'var(--soft)', 'var(--muted)'] };
    const miss = ls.filter(l => !wdr(p.id, l.id) && req.some(d => pcMarks(p.id, l.id)[d.id] === 'missing')).length;
    const pack = d => { const n = window.apxProgDocCount && MAP[d.id] ? apxProgDocCount(p.id, MAP[d.id]) : 0;
      return n ? `<div><a href="#programmes" onclick="setTimeout(()=>dvProg(${p.id}))" class="sub" style="font-weight:400">In hand-over pack (${n})</a></div>` : ''; };
    if (docView === 'List') { box.innerHTML = head() + `<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">${ls.map(l => { const m = pcMarks(p.id, l.id), d0 = done(l), pc = req.length ? Math.round(d0 / req.length * 100) : 100;
        return `<details class="card" style="padding:10px 14px"><summary style="display:flex;gap:10px;align-items:center;cursor:pointer"><b style="flex-grow:1">${name(l)}</b><span class="sub" style="min-width:90px">${d0}/${req.length} required</span></summary>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${docs.map(d => `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="flex:1 1 220px">${esc(d.label)}${d.required ? '' : ' <span class="sub">(optional)</span>'}</span>${btn(l, d, 'received', 'Received', 'y')}${btn(l, d, 'missing', 'Missing', 'n')}${btn(l, d, 'na', 'N/A', '')}
            ${ed ? `<input placeholder="Note" value="${esc(m['note_' + d.id] || '')}" onchange="dvDocNote(${l.id},'${esc(d.id)}',this.value)" style="flex:1 1 160px;height:30px;border:1px solid var(--line);border-radius:6px;padding:0 6px;font:inherit;background:transparent;color:var(--ink)">` : `<span class="sub">${esc(m['note_' + d.id] || '')}</span>`}</div>`).join('')}</div></details>`; }).join('') || '<p class="sub">No learners enrolled on this programme.</p>'}</div>`; return; }
    const ord = req.concat(docs.filter(d => !d.required));
    box.innerHTML = head() + (!ls.length ? '<p class="sub">No learners enrolled on this programme.</p>' : `<p class="sub" style="margin:8px 0">${ed ? 'Tap a cell to cycle Received → Missing → N/A → blank. Notes are in List view.' : 'Read only for your role.'}</p><div class="tw"><table class="dense" style="min-width:${200 + ord.length * 120}px"><thead><tr><th>Learner</th>${ord.map(d => `<th style="text-align:center;white-space:normal;min-width:110px">${esc(d.label)}${d.required ? '' : '<div class="sub" style="font-weight:400">optional</div>'}${pack(d)}${ed ? `<div><button class="btn sm" style="margin-top:4px;padding:2px 8px" onclick="dvDocAll('${esc(d.id)}')" title="Mark Received for every learner not yet marked">All received</button></div>` : ''}</th>`).join('')}<th>Required</th></tr></thead><tbody>${ls.map(l => {
      const m = pcMarks(p.id, l.id), wd = wdr(p.id, l.id);
      return `<tr${wd ? ' style="opacity:.55"' : ''}><td style="font-weight:600;white-space:normal">${lnk(l)}${wd ? ' <span class="badge b-n">Withdrawn</span>' : ''}</td>${ord.map(d => { const st = m[d.id] || '', [lab, bg, fg] = SCD[st] || ['·', 'var(--soft)', 'var(--muted)'], nt = m['note_' + d.id] || '';
        return `<td style="text-align:center;padding:6px 4px">${ed ? `<button title="${esc(nt)}" aria-label="${name(l)} ${esc(d.label)}: ${lab}" onclick="dvDocCyc(${l.id},'${esc(d.id)}')" style="min-width:84px;height:32px;border:0;border-radius:8px;font-weight:600;background:${bg};color:${fg}">${lab}${nt ? ' ✎' : ''}</button>` : `<span class="badge" style="background:${bg};color:${fg}" title="${esc(nt)}">${lab}</span>`}</td>`; }).join('')}<td>${done(l)}/${req.length}</td></tr>`; }).join('')}</tbody></table></div>`);
    function head() { return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><h2 style="flex-grow:1">Learner documents</h2><span class="sub">${complete} of ${ls.length} learners complete · ${req.length} required documents</span>${miss ? `<span class="badge b-bad">${miss} learner${miss === 1 ? '' : 's'} missing documents</span>` : ''}<span class="famseg">${['Grid', 'List'].map(v => `<button class="${v === docView ? 'on' : ''}" onclick="dvDocView('${v}')">${v}</button>`).join('')}</span>${ed ? '<button class="btn sm" onclick="dvDocCfg()">Edit document list</button>' : ''}<button class="btn sm" onclick="dvDocCsv()">Export CSV</button></div>`; }
  }
  const csv = (nm, rows) => { const t = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'); try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv' })); a.download = nm; document.body.appendChild(a); a.click(); a.remove(); } catch (_) {} say('Exported ' + nm); };
  window.dvDocCsv = () => { const p = prog(dProg); if (!p) return; const docs = pcDocs(p.id);
    csv(`Documents-${String(p.programme_name).replace(/[^\w]+/g, '-')}.csv`, [['Learner', ...docs.map(d => d.label)], ...learnersOf(p.id).map(l => { const m = pcMarks(p.id, l.id); return [l.first_name + ' ' + l.last_name, ...docs.map(d => m[d.id] || '')]; })]); };
  window.dvAttCsv = () => { const p = prog(dProg); if (!p) return; const ss = sessOf(p.id);
    csv(`Attendance-${String(p.programme_name).replace(/[^\w]+/g, '-')}.csv`, [['Learner', ...ss.map(s => day(s.session_date) + (s.topic ? ' ' + s.topic : ''))], ...learnersOf(p.id).map(l => [l.first_name + ' ' + l.last_name, ...ss.map(s => AT(attFor(p.id, l.id, s.session_date)?.status))])]); };

  /* ---------- Exam results (old app EISA screen: exam v1/v2 result and % per learner per module) ---------- */
  function renderExams(p) {
    let box = $('examcard'); if (!box) { $('eisaready').insertAdjacentHTML('afterend', '<section class="card" style="padding:0" id="examcard" hidden></section>'); box = $('examcard'); }
    box.hidden = eTab !== 'Exam results'; if (eTab !== 'Exam results') return;
    if (!p) { box.innerHTML = '<p class="sub" style="padding:16px">No programme.</p>'; return; }
    const ls = learnersOf(p.id), ms = modsOf(p.id), ed = CAN(), EX = ['C', 'NYC', 'NS', 'N/A'];
    const sel = (l, m, k) => { const v = resFor(p.id, l.id, m.module_number)?.[k] || ''; return ed ? `<select class="cellin" onchange="dvExam(${l.id},${m.module_number},'${k}',this.value)"><option value="">—</option>${EX.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>` : esc(v || '—'); };
    const pctIn = (l, m, k) => { const v = resFor(p.id, l.id, m.module_number)?.[k] || ''; return ed ? `<input class="cellin" style="width:64px" inputmode="decimal" value="${esc(v)}" onchange="dvExam(${l.id},${m.module_number},'${k}',this.value.trim())">` : esc(v || '—'); };
    box.innerHTML = `<div style="padding:16px 20px;display:flex;gap:10px;align-items:center"><h2 style="flex-grow:1">Exam results</h2><span class="sub">First and second attempt per module · saves as you change a cell</span></div>
      <div class="tw"><table style="min-width:760px"><thead><tr><th rowspan="2">Learner</th>${ms.map(m => `<th colspan="4" style="text-align:center;border-left:1px solid var(--line)">Module ${m.module_number}</th>`).join('')}</tr><tr>${ms.map(() => '<th style="border-left:1px solid var(--line)">Exam 1</th><th>%</th><th>Exam 2</th><th>%</th>').join('')}</tr></thead>
      <tbody>${ls.map(l => `<tr><td style="font-weight:600">${lnk(l)}</td>${ms.map(m => `<td style="border-left:1px solid var(--line)">${sel(l, m, 'exam_v1_result')}</td><td>${pctIn(l, m, 'exam_v1_pct')}</td><td>${sel(l, m, 'exam_v2_result')}</td><td>${pctIn(l, m, 'exam_v2_pct')}</td>`).join('')}</tr>`).join('') || '<tr><td class="sub">No learners enrolled on this programme.</td></tr>'}</tbody></table></div>`;
  }
  window.dvExam = (lid, n, k, v) => saveRes(lid, n, () => ({ [k]: v || null })).then(() => say('Exam result saved'));

  /* ---------- EISA readiness ---------- */
  const _renderE = renderE;
  renderE = function () {
    _renderE();                                   // qa.js handles the LEISA file tab
    if (P.user && $('etabs') && !$('etabs').textContent.includes('Exam results')) { $('etabs').insertAdjacentHTML('beforeend', `<button role="tab" class="${eTab === 'Exam results' ? 'on' : ''}" onclick="eTab='Exam results';renderE()">Exam results</button>`); }
    if (P.user && eTab === 'Exam results') { $('eisaready').hidden = true; if ($('leisa')) $('leisa').hidden = true; [...$('etabs').children].forEach(b => b.classList.toggle('on', b.textContent === 'Exam results')); picker('#view-eisa select', renderE); renderExams(ensure()); return; }
    if ($('examcard')) $('examcard').hidden = true;
    if (!P.user || eTab !== 'Readiness') return;
    renderReady();
  };
  /* EISA readiness: overview of occupational programmes near or past their end, then the learner grid for one programme */
  let eScope = 'Due soon', eF = '', eQ = '', ePg = 0, eKey = '';
  const isOcc = p => p && !p.deleted_at && p.programme_type !== 'legacy';
  const mineP = p => !window.apxMineProg || apxMineProg(p);
  const addD = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const pidOf = p => '#' + (p.display_id || p.id);
  const cName = p => client(p)?.client_name || '';
  // bucket: ready / one / two / nodata (a criterion has no data yet, e.g. no modules set up)
  const bucket = r => r.k.some(x => !x) ? 'nodata' : (n => n === 0 ? 'ready' : n === 1 ? 'one' : 'two')(r.c.filter(x => !x).length);
  function eStats(p) {
    const ls = learnersOf(p.id).filter(l => !wdr(p.id, l.id)), R = ls.map(l => [l, readiness(p, l)]), t = today();
    const n = { ready: 0, one: 0, two: 0, nodata: 0 }; R.forEach(([, r]) => n[bucket(r)]++);
    const tr = R.map(([, r]) => r.t).filter(Boolean);
    const f = {
      end: runState(p) === 'Active' && day(p.end_date) && day(p.end_date) <= addD(30) && ls.length && !n.ready ? 1 : 0,
      rdy: tr.filter(x => x.sor_status === 'Issued' && x.eisa_booking_status !== 'Booked').length,
      nod: tr.filter(x => x.eisa_booking_status === 'Booked' && !day(x.eisa_date)).length,
      res: tr.filter(x => day(x.eisa_date) && day(x.eisa_date) < t && !x.eisa_outcome).length,
      nomod: modsOf(p.id).length ? 0 : 1 };
    return { p, ls, R, n, f, booked: R.filter(([, r]) => r.booked).length };
  }
  const EF = { end: ['Ending ≤30 days, none ready', 'var(--bad)', 'Running, ends within 30 days and no learner meets all six'], rdy: ['SoR issued, not booked', 'var(--bad)', 'Learners: SoR Issued in the QCTO tracker but EISA not Booked'],
    nod: ['Booked, no EISA date', 'var(--warn)', 'Learners: Booked in the QCTO tracker with no EISA date'], res: ['Result outstanding', 'var(--bad)', 'Learners: EISA date has passed and no outcome is recorded'],
    nomod: ['No modules set up', 'var(--warn)', 'Programmes: modules not captured in Attendance & PoE › PoE tracker, so readiness cannot be worked out'] };
  const ESC = { 'Due soon': p => { const e = day(p.end_date); return e && e >= addD(-90) && e <= addD(90); }, Running: p => runState(p) === 'Active', Ended: p => runState(p) === 'Completed', All: () => true };
  window.dvEScope = s => { eScope = s; eF = ''; renderE(); };
  window.dvEF = k => { eF = eF === k ? '' : k; if (eF) eScope = 'All'; renderE(); };
  window.dvEQ = v => { eQ = v || ''; renderE(); setTimeout(() => { const i = $('eq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); };
  window.dvEPg = d => { ePg += d; renderE(); };
  window.dvEOpen = id => { dProg = id; renderE(); setTimeout(() => { const c = $('eisarows'); if (c && c.scrollIntoView) c.closest('section').scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 0); };
  window.apxEisaTasks = role => { const out = []; try { if (role !== 'pm') return out;
    progs().filter(p => isOcc(p) && mineP(p) && runState(p) === 'Active' && day(p.end_date) && day(p.end_date) <= addD(30) && learnersOf(p.id).length).forEach(p => { const s = eStats(p), not = s.ls.length - s.n.ready; if (!not) return;
      out.push({ id: `eisa${p.id}`, t: `EISA readiness: ${pidOf(p)} ${p.programme_name || ''} (${not} not ready)`, s: `Ends ${fmtD(p.end_date)}`, k: 'EISA', c: 'Open', on: `location.hash='eisa';eTab='Readiness';dvEOpen(${p.id})` }); }); } catch (e) {} return out; };
  function renderReady() {
    const all = progs().filter(p => isOcc(p) && mineP(p) && learnersOf(p.id).length).sort((a, b) => cName(a).localeCompare(cName(b)) || a.id - b.id);
    // programme picker: '#id · client · programme', occupational only (legacy has no EISA)
    const el = document.querySelector('#view-eisa select');
    if (!all.some(p => p.id === dProg)) dProg = (all.find(p => runState(p) === 'Active') || all[0])?.id ?? null;
    if (el) { el.innerHTML = all.map(p => `<option value="${p.id}"${p.id === dProg ? ' selected' : ''}>${esc(pidOf(p) + ' · ' + cName(p) + ' · ' + (p.programme_name || ''))}</option>`).join('') || '<option>No occupational programmes with learners</option>'; el.style.maxWidth = '520px'; el.onchange = () => { dProg = +el.value; renderE(); }; }
    // overview
    if (!$('eover')) $('eisaready').insertAdjacentHTML('afterbegin', '<section class="card" style="padding:0" id="eover"></section>');
    const S = all.map(eStats), inS = S.filter(x => ESC[eScope](x.p));
    const cnt = k => S.filter(x => x.f[k]).length, lc = k => S.reduce((t, x) => t + x.f[k], 0);
    const q = eQ.toLowerCase().trim();
    let L = (eF ? S.filter(x => x.f[eF]) : inS).filter(x => !q || [pidOf(x.p), cName(x.p), x.p.programme_name, x.p.project_manager_name].join(' ').toLowerCase().includes(q));
    L.sort((a, b) => (day(a.p.end_date) || '9') < (day(b.p.end_date) || '9') ? -1 : 1);
    const key = eScope + '|' + eF + '|' + q; if (key !== eKey) { eKey = key; ePg = 0; }
    const PER = 25, pages = Math.max(1, Math.ceil(L.length / PER)); ePg = Math.min(Math.max(ePg, 0), pages - 1); const pg = L.slice(ePg * PER, ePg * PER + PER);
    const nB = (v, c) => v ? `<span class="badge ${c}">${v}</span>` : '<span class="sub">0</span>';
    $('eover').innerHTML = `<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><h2 style="flex-grow:1">Programmes</h2>${UI.seg(Object.keys(ESC), eScope, o => `dvEScope('${o}')`)}
        <input id="eq" type="search" placeholder="Search #id, client, programme, PM" value="${esc(eQ)}" oninput="dvEQ(this.value)" style="height:36px;min-width:240px"></div>
      ${UI.tiles([{ t: 'Needs attention', k: Object.keys(EF).map(k => [EF[k][0], k === 'end' || k === 'nomod' ? cnt(k) : lc(k), EF[k][1], eF === k, `dvEF('${k}')`, EF[k][2]]) }])}
      <span class="sub">Occupational programmes only (legacy has no EISA). ${eScope === 'Due soon' ? 'Due soon = ending within 90 days or ended in the last 90 days. ' : ''}Withdrawn learners are left out. Click a programme to see its learners.</span></div>
      <div class="tw"><table class="dense"><thead><tr><th>Programme</th><th>Ends</th><th>Learners</th><th>Ready</th><th>1 short</th><th>2+ short</th><th>No data</th><th>Booked</th><th>Flags</th></tr></thead><tbody>${pg.map(x => `<tr style="cursor:pointer${x.p.id === dProg ? ';background:var(--soft,rgba(0,0,0,.04))' : ''}" onclick="dvEOpen(${x.p.id})">
        <td style="white-space:normal;min-width:240px"><b>${esc(pidOf(x.p))}</b> · ${esc(cName(x.p))}<div class="sub">${esc(x.p.programme_name || '')} · ${esc(x.p.project_manager_name || 'No PM')} · ${runState(x.p)}</div></td>
        <td>${fmtD(x.p.end_date) || '<span class="sub">No end</span>'}</td><td>${x.ls.length}</td><td>${nB(x.n.ready, 'b-ok')}</td><td>${nB(x.n.one, 'b-warn')}</td><td>${nB(x.n.two, 'b-bad')}</td><td>${x.n.nodata ? `<span class="badge" title="A criterion has no data yet">${x.n.nodata}</span>` : '<span class="sub">0</span>'}</td><td>${x.booked}</td>
        <td style="white-space:normal">${Object.keys(EF).filter(k => x.f[k]).map(k => `<span class="badge ${EF[k][1] === 'var(--bad)' ? 'b-bad' : 'b-warn'}" style="margin:2px">${EF[k][0]}${k === 'end' || k === 'nomod' ? '' : ' ' + x.f[k]}</span>`).join('')}</td></tr>`).join('') || `<tr><td colspan="9" class="sub">No programmes ${eF ? 'with this flag' : 'in this view'}.</td></tr>`}</tbody></table></div>
      <div style="padding:10px 20px;display:flex;gap:8px;align-items:center"><span class="sub" style="flex-grow:1">Showing ${L.length ? ePg * PER + 1 : 0}–${ePg * PER + pg.length} of ${L.length}</span>${pages > 1 ? `<button class="btn sm" ${ePg ? '' : 'disabled'} onclick="dvEPg(-1)">Previous</button><button class="btn sm" ${ePg < pages - 1 ? '' : 'disabled'} onclick="dvEPg(1)">Next</button>` : ''}</div>`;
    // learner grid for the selected programme
    const p = prog(dProg), st = p ? eStats(p) : { ls: [], R: [], n: { ready: 0, one: 0, two: 0, nodata: 0 }, booked: 0 };
    const h2 = document.querySelector('#eisaready .card:not(#eover) h2'); if (h2) h2.innerHTML = p ? `Readiness by learner · <b>${esc(pidOf(p))}</b> <span class="sub" style="font-weight:400">${esc(cName(p))} · ${esc(p.programme_name || '')}</span>` : 'Readiness by learner';
    $('eisakpis').innerHTML = [['Ready for EISA', st.n.ready, 'var(--ok)'], ['One criterion short', st.n.one, 'var(--warn)'], ['Two or more short', st.n.two, 'var(--bad)'], ['No data yet', st.n.nodata, 'var(--muted)'], ['EISA booked', st.booked, 'var(--ink)']]
      .map(([l, v, c]) => `<div class="kpi"><span class="l">${l}</span><span class="v" style="color:${v ? c : 'var(--muted)'}">${v}</span><span class="n sub">of ${st.ls.length} learners</span></div>`).join('');
    const noMod = p && !modsOf(p.id).length;
    const cell = (x, k, i) => !k ? `<td><span class="dot" style="width:24px;height:24px;background:var(--soft,#eee);color:var(--muted)" title="No data yet: ${i < 5 ? 'modules not set up in Attendance & PoE › PoE tracker' : 'no QCTO tracker row'}" aria-label="No data: ${why[i]}">–</span></td>`
      : `<td><span class="dot ${x ? 'b-ok' : 'b-bad'}" style="width:24px;height:24px" title="${why[i]}" aria-label="${x ? 'Met' : 'Not met'}: ${why[i]}">${x ? '✓' : '✕'}</span></td>`;
    $('eisarows').innerHTML = (noMod ? `<tr><td colspan="8"><span class="badge b-warn">No modules set up</span> <span class="sub">Knowledge, practical, workplace, assessment and moderation show “–” until modules and results are captured.</span> <button class="btn sm" onclick="dvGo('attendance','PoE tracker')">Capture modules</button></td></tr>` : '')
      + st.R.map(([l, r]) => { const b = bucket(r), t = r.t || {}, ed = day(t.eisa_date);
        const st2 = b === 'ready' ? `<span class="badge b-ok">Ready${r.booked ? ' · booked' : ''}</span>` : b === 'nodata' ? '<span class="badge">No data yet</span>' : '<span class="badge b-warn">Not yet</span>';
        const mm = [t.sor_status === 'Issued' && t.eisa_booking_status !== 'Booked' ? 'SoR issued, not booked' : '', r.booked && !ed ? 'Booked, no EISA date' : '', ed && ed < today() && !t.eisa_outcome ? 'Result outstanding' : ''].filter(Boolean);
        return `<tr><td style="font-weight:600">${lnk(l)}</td>${r.c.map((x, i) => cell(x, r.k[i], i)).join('')}
        <td style="white-space:normal">${st2}${r.booked ? `<div class="sub">${ed ? 'EISA ' + fmtD(ed) : ''}${t.eisa_outcome ? ' · ' + esc(t.eisa_outcome) : ''}</div>` : ''}${mm.map(m => `<div><span class="badge b-warn" style="margin-top:2px">${m}</span></div>`).join('')}</td></tr>`; }).join('')
      || '<tr><td colspan="8" class="sub">No learners enrolled on this programme.</td></tr>';
    const sub = document.querySelector('#eisaready .card:not(#eover) .sub');
    if (sub) sub.textContent = 'All six must be met. Module results and moderation come from Attendance & PoE › PoE tracker; SoR and booking from the QCTO tracker. “–” = no data yet. Hover a mark for the rule.';
  }

  /* ---------- wire up after every data load (called from live.js applyAll) ---------- */
  let bound = false;
  addEventListener('hashchange', () => { if (location.hash === '#attendance/documents') { aTab = 'Documents'; renderAtt(); } });
  window.previewDelivery = function () {
    if (location.hash === '#attendance/documents') aTab = 'Documents';
    renderProg(); renderAtt(); renderE();
    if (bound) return; bound = true;
    const np = [...document.querySelectorAll('#view-programmes button')].find(b => /New programme/.test(b.textContent));
    [...document.querySelectorAll('#view-attendance button, #view-eisa button')].filter(b => /^AI /.test(b.textContent.trim())).forEach(b => { b.hidden = true; });
  };
})();
