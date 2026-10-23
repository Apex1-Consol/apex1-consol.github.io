/* ApexOne redesign preview — live data layer.
   Talks ONLY to the separate free Supabase project "apexone-preview" (test data).
   It never calls ClickUp: writes land in Supabase, the database queues them in the
   outbox, and the preview adapter (server-side, token never in the browser) delivers
   them to the "Z. Redesign Preview (TEST)" folder in ApexOne Operations. */
(function () {
  const CFG = window.PREVIEW_CFG || {
    url: 'https://qszikynltvyplzqootrc.supabase.co',
    key: 'sb_publishable_pP_daaZNEJOTl1mZVraZZg_fOK6LZQt',
    liveRef: 'nducwhlmudksgxggjrbo'
  };
  if (CFG.url.includes(CFG.liveRef)) throw Error('Preview must never point at the live project');
  // Messages from this layer are real, so drop the mock's " (mock)" suffix.
  const toast = m => { window.toast(m); const t = document.getElementById('toast'); if (t) t.textContent = m; };
  const sb = window.supabase.createClient(CFG.url, CFG.key);
  window.__sb = sb;
  const P = { user: null, roles: [], tenant: null, data: {} };
  window.__preview = P;
  const isAdmin = () => P.roles.includes('admin');
  const can = (...r) => isAdmin() || r.some(x => P.roles.includes(x));
  const fmt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';

  /* ---------- writes: one helper so every save reports errors the same way ---------- */
  async function write(label, fn) {
    markSaved(1);
    const { data, error } = await fn();
    if (error) { $('savest').className = 'savest dirty'; $('savest').lastChild.textContent = 'Not saved'; toast(label + ' failed: ' + error.message); throw error; }
    markSaved(); return data;
  }
  window.previewWrite = write;

  /* ---------- auth ---------- */
  const _route = window.route;
  removeEventListener('hashchange', _route);
  addEventListener('hashchange', () => window.route());
  window.route = function () {
    const r = location.hash.slice(1) || 'login';
    if (!P.user && r !== 'login') { location.hash = 'login'; return; }
    if (P.user && r === 'login') { location.hash = 'mywork'; return; }
    _route();
    if (P.user) afterRoute(r);
  };
  const form = document.querySelector('#view-login form');
  form.onsubmit = async ev => {
    ev.preventDefault();
    const [em, pw] = form.querySelectorAll('input');
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
    btn.disabled = false; btn.textContent = 'Sign in';
    let e = form.querySelector('.err'); if (e) e.remove();
    if (error) form.insertAdjacentHTML('beforeend', `<div class="err" role="alert">${esc(error.message)}</div>`);
  };
  form.querySelector('.ts').textContent = 'Preview project · test data only';
  // Sign out must never wait on the auth lock: clear the local session first, then tell the server in the background.
  function hardSignOut() {
    P.user = null; P.roles = []; P.tenant = null;
    try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (_) {}
    sb.auth.signOut({ scope: 'local' }).catch(() => {});
    if (location.hash !== '#login') location.hash = 'login'; else window.route();
  }
  document.querySelector('.me a[href="#login"]').onclick = e => { e.preventDefault(); hardSignOut(); };

  // Supabase holds its auth lock while this callback runs, so awaiting other sb calls inside it can deadlock.
  // Defer the real work to the next tick.
  sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => onAuth(session), 0); });
  async function onAuth(session) {
    P.user = session?.user || null;
    const am = P.user?.app_metadata || {};
    P.roles = Array.isArray(am.role) ? am.role : am.role ? [am.role] : [];
    P.tenant = am.tenant || null;
    if (P.user && !P.tenant) { toast('This account is not on the preview allow-list'); hardSignOut(); return; }
    if (P.user) {
      document.querySelector('.me .avatar').textContent = (P.user.email || '?')[0].toUpperCase();
      document.querySelector('.me div div').textContent = P.user.email;
      document.querySelector('.me div div+div').textContent = (P.roles.join(', ') || 'no role') + ' · PREVIEW';
      const now = new Date(), h = now.getHours(), who = (P.user.email || '').split(/[@+.]/)[0];
      const g = $('greet'), gd = $('greetdate');
      if (g) g.textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (who ? ', ' + who[0].toUpperCase() + who.slice(1) : '');
      if (gd) gd.textContent = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      await loadAll();
    }
    window.route();
  }

  /* ---------- reads ---------- */
  async function q(name, p) { const r = await p; if (r.error) { P.errors[name] = r.error.message; return []; } return r.data || []; }
  async function loadAll() {
    P.errors = {};
    const R = sb.schema('reports');
    const [learners, enrol, progs, clients, tracker, mods, accs, legacy, signoffs, visits, recs, assessors, famc, dq, outbox, reports, windows, leisaSettings, leisa, pmods, sessions, att, eisaRes] = await Promise.all([
      q('learners', sb.from('learners').select('id,first_name,last_name,id_number,email').order('last_name')),
      q('enrolments', sb.from('enrolments').select('id,learner_id,programme_id,status,created_at')),
      q('programmes', sb.from('programmes').select('id,programme_name,client_id,saqa_id,qualification_type,nqf_level,start_date,end_date,status,programme_type,project_manager_name,facilitator_id,provider,qualification_name,fields')),
      q('clients', sb.from('clients').select('id,client_name,contact_person,contact_email,contact_number,project_manager')),
      q('qcto_tracker', sb.from('qcto_tracker').select('*').order('id')),
      q('moderation_items', sb.from('moderation_items').select('*').order('id')),
      q('accreditation_items', sb.from('accreditation_items').select('*').order('id')),
      q('legacy_qualifications', sb.from('legacy_qualifications').select('*')),
      q('signoff_items', sb.from('signoff_items').select('*').order('created_at', { ascending: false })),
      q('monitoring_visits', sb.from('monitoring_visits').select('*').order('id')),
      q('recommendations', sb.from('recommendations').select('*').order('id')),
      q('assessors', sb.from('assessors').select('id,full_name,role')),
      q('v_fam_completeness', sb.from('v_fam_completeness').select('*')),
      isAdmin() ? q('v_learner_data_quality', sb.from('v_learner_data_quality').select('*')) : [],
      can('project_manager', 'operations') ? q('outbox', sb.from('clickup_sync_outbox').select('id,source_table,status,last_error').order('id', { ascending: false }).limit(500)) : [],
      q('reports', R.rpc('my_report_queue', { p_limit: 60 })),
      q('eisa_windows', sb.from('eisa_windows').select('*').order('eisa_date')),
      q('leisa_settings', sb.from('leisa_settings').select('*')),
      q('leisa_learner', sb.from('leisa_learner').select('*')),
      q('program_modules', sb.from('program_modules').select('*').order('module_number')),
      q('attendance_sessions', sb.from('attendance_sessions').select('*').order('session_date')),
      q('attendance', sb.from('attendance').select('id,programme_id,learner_id,session_date,status')),
      q('eisa', sb.from('eisa').select('*'))
    ]);
    Object.assign(P.data, { learners, enrol, progs, clients, tracker, mods, accs, legacy, signoffs, visits, recs, assessors, famc, dq, outbox, reports, windows, leisaSettings, leisa, pmods, sessions, att, eisaRes });
    applyAll();
    const bad = Object.keys(P.errors);
    if (bad.length) toast('Could not load: ' + bad.join(', '));
  }
  window.previewReload = loadAll;

  const progName = id => P.data.progs.find(p => p.id === id)?.programme_name || 'Programme ' + id;
  const clientOf = pid => { const p = P.data.progs.find(x => x.id === pid); return P.data.clients.find(c => c.id === p?.client_id); };

  function applyAll() {
    applyDashboard(); applyLearners(); applyEnrolments(); applyTracker(); applyModVer(); applyAccred();
    applyDQ(); applySignoff(); applyVisits(); applyRecs(); applyFam(); applyClients(); applySync();
    if (window.previewQA) window.previewQA(); // QA/ETQA screens (qa.js)
    if (window.previewDelivery) window.previewDelivery(); // Programmes, Attendance & PoE, EISA readiness (delivery.js)
    if (window.previewFam) window.previewFam(); // FAM Registry (fam.js)
    if (window.previewShell) window.previewShell(); // My work, side panel (shell.js)
    if (window.previewAdmin) window.previewAdmin(); // PM Tracker, Assessors, Consolidated view, Sync health, Audit, Users (admin.js)
    renderNav(curNav);
  }
  function afterRoute(r) { if (r === 'learners') renderLearners(); if (r === 'dq') renderDQ(); if (r === 'signoff') renderSO(); }

  /* ---------- dashboard ---------- */
  function applyDashboard() {
    const d = P.data, linked = new Set(d.enrol.filter(e => e.status === 'active').map(e => e.learner_id));
    const unlinked = d.learners.filter(l => !linked.has(l.id)).length, openRecs = d.recs.filter(r => !r.resolved).length;
    $('kpis').innerHTML = [['Learners', d.learners.length, 'on record (test data)', 'var(--muted)', 'learners'], ['Active enrolments', d.enrol.filter(e => e.status === 'active').length, unlinked + ' learners unlinked', unlinked ? 'var(--warn)' : 'var(--muted)', 'enrolments'],
      ['Active programmes', d.progs.filter(p => p.status === 'active').length, 'in delivery', 'var(--muted)', 'programmes'], ['Open recommendations', openRecs, 'from monitoring visits', openRecs ? 'var(--bad)' : 'var(--muted)', 'recs'],
      ['Waiting for sign-off', d.signoffs.filter(s => s.status === 'waiting').length, 'admin decisions', 'var(--muted)', 'signoff']]
      .map(([l, v, n, c, h]) => `<a class="kpi" href="#${h}"><span class="l">${l}</span><span class="v">${v}</span><span class="n" style="color:${c}">${n}</span></a>`).join('');
    const t = d.tracker, fl = [[t.filter(r => r.monitoring_status === 'Delayed').length, 'QCTO monitoring Delayed', 'From the QCTO Projects Tracker', 'bad', 'qcto'],
      [t.filter(r => r.sor_status === 'Issued' && r.eisa_booking_status === 'Pending Booking').length, 'SOR issued, EISA not booked', 'Book before registration closes', 'warn', 'qcto'],
      [d.mods.filter(m => m.sheet === 'Exit verification' && m.stage !== 'SoRs received').length, 'Exit verifications awaiting SoRs', 'Legacy SETA programmes', 'warn', 'modver'],
      [openRecs, 'Open audit recommendations', 'Assign owners and due dates', 'bad', 'recs'], [unlinked, 'Learners without an active enrolment', 'Link or archive to keep reports accurate', 'warn', 'enrolments']];
    $('alerts').innerHTML = fl.map(([c, ti, s, k, h]) => `<a href="#${h}"><span class="count b-${c ? k : 'ok'}">${c}</span><span style="flex-grow:1"><b style="display:block">${ti}</b><span class="sub">${s}</span></span></a>`).join('');
    $('progrows').innerHTML = d.progs.filter(p => p.status === 'active').map(p => { const n = d.enrol.filter(e => e.programme_id === p.id).length;
      return `<tr><td><b>${esc(p.programme_name)}</b><div class="sub">${esc(clientOf(p.id)?.client_name || '')}</div></td><td>${n}</td><td><span class="sub">—</span></td><td>${t.filter(r => r.programme_id === p.id && r.sor_status === 'Issued').length} of ${n}</td></tr>`; }).join('') || '<tr><td colspan="4" class="sub">No active programmes</td></tr>';
    $('visitlist').innerHTML = d.visits.map(v => `<a href="#visit" onclick="previewOpenVisit(${v.id})"><span class="date">VIS<b>${v.id}</b></span><span><b style="display:block">${esc(v.fields?.['Visit Title'] || 'Visit ' + v.id)}</b><span class="sub">${esc(progName(v.programme_id))}</span></span></a>`).join('') || '<p class="sub">No visits</p>';
    $('aisum').textContent = 'AI summary is off in the preview (no AI calls are made against test data).';
  }

  /* ---------- learners ---------- */
  function applyLearners() {
    const d = P.data; LEARNERS.length = 0;
    d.learners.forEach(l => { const e = d.enrol.find(x => x.learner_id === l.id && x.status === 'active');
      LEARNERS.push({ id: l.id, n: (l.first_name + ' ' + l.last_name).trim(), idn: l.id ? '••••••••' + String(l.id_number || '').slice(-4) : '', p: e ? progName(e.programme_id) : '', a: null, s: e ? 'Active' : 'Unlinked' }); });
    LEARNERS.forEach(l => l.id = l.idn);
    lLoaded = true;
    const h = document.querySelector('#view-learners h1 .sub'); if (h) h.textContent = LEARNERS.length + ' on record · preview test data';
  }
  renderLearners = function () {
    const q = ($('lq').value || '').trim().toLowerCase(), all = LEARNERS.length, act = LEARNERS.filter(l => l.s === 'Active').length;
    $('lfilter').innerHTML = [['All', all], ['Active', act], ['Unlinked', all - act]].map(([f, c]) => `<button class="${f === lF ? 'on' : ''}" onclick="lF='${f}';lPage=0;renderLearners()">${f} · ${c}</button>`).join('');
    const rows = LEARNERS.filter(l => (lF === 'All' || l.s === lF) && (!q || l.n.toLowerCase().includes(q)));
    const pages = Math.max(1, Math.ceil(rows.length / PER)); if (lPage >= pages) lPage = pages - 1; const pg = rows.slice(lPage * PER, lPage * PER + PER);
    $('lrows').innerHTML = pg.map(l => `<tr><td><b>${esc(l.n)}</b></td><td class="sub">${l.id || '<span class="badge b-warn">No ID</span>'}</td><td>${l.p ? esc(l.p) : '<span class="sub">Not enrolled</span>'}</td><td><span class="sub">—</span></td><td>${l.s === 'Active' ? '<span class="badge b-ok">Active</span>' : '<span class="badge b-warn">Unlinked</span>'}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty"><b>No learners match</b></div></td></tr>';
    $('lpager').innerHTML = `<span class="sub" style="flex-grow:1">Showing ${rows.length ? lPage * PER + 1 : 0}–${lPage * PER + pg.length} of ${rows.length}</span>`;
  };
  loadLearners = renderLearners;

  /* ---------- enrolments ---------- */
  function applyEnrolments() {
    const d = P.data, lname = id => { const l = d.learners.find(x => x.id === id); return l ? l.first_name + ' ' + l.last_name : 'Learner ' + id; };
    const linked = new Set(d.enrol.filter(e => e.status === 'active').map(e => e.learner_id));
    document.querySelector('#view-enrolments .count').textContent = d.learners.filter(l => !linked.has(l.id)).length;
    renderEn = function () {
      $('enfilter').innerHTML = ['All', 'active', 'completed', 'withdrawn'].map(s => `<button class="${s === enF ? 'on' : ''}" onclick="enF='${s}';renderEn()">${s[0].toUpperCase() + s.slice(1)}</button>`).join('');
      $('enrows').innerHTML = d.enrol.filter(e => enF === 'All' || e.status === enF).map(e => `<tr><td><b>${esc(lname(e.learner_id))}</b></td><td>${esc(progName(e.programme_id))}</td><td>${fmt(e.created_at)}</td><td><span class="badge ${e.status === 'active' ? 'b-ok' : 'b-n'}">${e.status}</span></td><td></td></tr>`).join('');
    }; renderEn();
  }

  /* ---------- QCTO tracker (writes) ---------- */
  function applyTracker() {
    const d = P.data; QCO.length = 0; QT.length = 0;
    const ps = [...new Set(d.tracker.map(r => r.programme_id))];
    ps.forEach(pid => { const p = d.progs.find(x => x.id === pid) || {}; const fac = d.assessors.find(a => a.id === p.facilitator_id);
      QCO.push({ c: clientOf(pid)?.client_name || '', pm: p.project_manager_name || '', f: fac?.full_name || '', a: '', p: (p.saqa_id ? p.saqa_id + ' - ' : '') + (p.programme_name || '') + ' NQF ' + (p.nqf_level || '?'), d: '', s: p.start_date, e: p.end_date }); });
    d.tracker.forEach(r => { const ci = ps.indexOf(r.programme_id), k = QCO[ci], l = d.learners.find(x => x.id === r.learner_id) || {};
      QT.push({ dbid: r.id, ci, c: k.c, pm: k.pm, f: k.f, a: k.a, ln: l.first_name || '', sn: l.last_name || '', id: l.id_number ? '•••••••••' + String(l.id_number).slice(-4) : '', p: k.p, d: '', s: k.s, e: k.e,
        cur: r.current_status, mon: r.monitoring_status, monD: r.monitoring_date, sor: r.sor_status, sorD: r.sor_issued_date, book: r.eisa_booking_status, eD: r.eisa_date, out: r.eisa_outcome || '', cm: r.comments || '' }); });
    renderQ();
  }
  const QCOL = { cur: 'current_status', mon: 'monitoring_status', sor: 'sor_status', book: 'eisa_booking_status', out: 'eisa_outcome' };
  qSet = async function (i, k, v) {
    const row = QT[i], before = row[k]; row[k] = v; renderQ();
    try { await write('Tracker', () => sb.from('qcto_tracker').update({ [QCOL[k]]: v || null }).eq('id', row.dbid)); }
    catch (e) { row[k] = before; renderQ(); }
  };

  /* ---------- Moderation & Verification (writes) ---------- */
  function applyModVer() {
    const d = P.data, ix = s => Math.max(0, MSTAGE.indexOf(s));
    MOD.length = 0; VER.length = 0; DONE.length = 0;
    d.mods.forEach(m => {
      if (m.sheet === 'External moderation') MOD.push(Object.assign([m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.employment, m.start_date, m.end_date, m.delivery, m.facilitator, m.assessor, m.moderator, m.seta, ix(m.stage), m.stage_date], { dbid: m.id }));
      else if (m.sheet === 'Exit verification') VER.push(Object.assign([m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, m.verifier, m.exit_verification_date, ix(m.stage)], { dbid: m.id }));
      else DONE.push([m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, m.exit_verification_date, m.stage_date, m.submitted_to_pm_date]);
    });
    renderM();
  }
  mSet = async function (arr, i, v) {
    const row = (arr === 'MOD' ? MOD : VER)[i], col = arr === 'MOD' ? 16 : 11, before = row[col]; row[col] = +v; renderM();
    try { await write('Stage', () => sb.from('moderation_items').update({ stage: MSTAGE[+v], stage_date: new Date().toISOString().slice(0, 10) }).eq('id', row.dbid)); }
    catch (e) { row[col] = before; renderM(); }
  };

  /* ---------- Accreditation + legacy lookup ---------- */
  function applyAccred() {
    const K = { 'Accreditation granted': 'g', 'Desktop application successful': 'ok', 'Site visit scheduled': 'sv', 'Site visit done': 'svd', 'Desktop application to be submitted': 'sub' };
    ACC.length = 0; P.data.accs.forEach(a => ACC.push([a.saqa_id, a.title, a.nqf, a.credits, a.qual_type, a.provider, a.quality_partner, K[a.status], a.feedback || '—']));
    Object.keys(LEG).forEach(k => delete LEG[k]); P.data.legacy.forEach(l => LEG[l.saqa_id] = [l.quality_partner, l.title, l.extended ? 'Yes' : 'No', l.extension]);
    renderA(); renderLeg(); renderM();
  }

  /* ---------- Data quality (writes: review + merge request) ---------- */
  function applyDQ() {
    DQG.length = 0; const by = {};
    P.data.dq.forEach(r => { const key = r.issue === 'possible_duplicate' ? 'dup:' + (r.first_name + ' ' + r.last_name).toLowerCase() : r.issue + ':' + r.learner_id; (by[key] = by[key] || { n: r.first_name + ' ' + r.last_name, rows: [], issue: r.issue }).rows.push(r); });
    Object.values(by).forEach(g => DQG.push({ n: g.n, a: g.rows, t: g.issue === 'possible_duplicate' ? 'Possible duplicate' : 'Same name', issue: g.issue, decided: g.rows.every(r => r.decision) ? g.rows[0].decision : null }));
  }
  const ISSUE = { missing_id: 'Missing ID', placeholder_id: 'Placeholder ID', invalid_id: 'Invalid ID', possible_duplicate: 'Possible duplicate' };
  renderDQ = function () {
    if (!isAdmin()) { $('dqlist').innerHTML = '<div class="empty"><b>Admins only</b><span>Data quality review needs the admin role.</span></div>'; $('dqkpis').innerHTML = ''; $('dqfilter').innerHTML = ''; return; }
    const open = DQG.filter(g => !g.decided);
    $('dqkpis').innerHTML = [['Needs review', open.length], ['Possible duplicates', DQG.filter(g => g.issue === 'possible_duplicate').length], ['ID problems', DQG.filter(g => g.issue !== 'possible_duplicate').length], ['Decided', DQG.length - open.length]]
      .map(([l, v]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span></div>`).join('');
    $('dqfilter').innerHTML = '';
    $('dqlist').innerHTML = DQG.map((g, gi) => `<div class="dqpair"><div class="who"><div style="display:flex;gap:8px;align-items:center"><b>${esc(g.n)}</b><span class="badge ${g.issue === 'possible_duplicate' ? 'b-warn' : 'b-bad'}">${ISSUE[g.issue]}</span></div>
      ${g.a.map(r => `<div class="sub">ID ${r.id_number_masked || '—'} · ${r.enrolment_count ? esc(r.programmes || '') : 'Not enrolled'}</div>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${g.decided ? `<span class="badge b-ok">${esc(g.decided)}</span>` : g.issue === 'possible_duplicate'
        ? `<button class="btn sm" onclick="previewDQ(${gi},'merge')">Same person</button><button class="btn sm" onclick="previewDQ(${gi},'not_duplicate')">Different people</button><button class="btn sm" style="color:var(--bad)" onclick="previewDQ(${gi},'quarantined')">Quarantine</button>`
        : `<button class="btn sm" onclick="previewDQ(${gi},'needs_fix')">Needs fix</button><button class="btn sm" onclick="previewDQ(${gi},'reviewed_ok')">Reviewed OK</button>`}</div></div>`).join('') || '<div class="empty"><b>No data-quality issues</b></div>';
    $('dqpager').innerHTML = '';
  };
  window.previewDQ = async function (gi, decision) {
    const g = DQG[gi];
    if (decision === 'merge') { await write('Merge request', () => sb.rpc('request_learner_merge', { p_learner_ids: g.a.map(r => r.learner_id), p_note: 'From preview Data quality' })); toast('Merge request sent to the Sign-off queue'); }
    else await write('Review', () => sb.from('learner_quality_reviews').insert(g.a.map(r => ({ tenant_id: P.tenant, learner_id: r.learner_id, issue: r.issue, decision, reviewed_by: P.user.email }))));
    await loadAll(); renderDQ();
  };

  /* ---------- Sign-off queue (writes via RPC; admin only) ---------- */
  function applySignoff() {
    SO.length = 0; Object.keys(SOD).forEach(k => delete SOD[k]);
    P.data.signoffs.forEach(s => { SO.push([String(s.id), s.kind, s.title, s.detail || '', s.ref_table === 'learners' ? '#dq' : '#signoff', s.submitted_by || '', fmt(s.created_at)]);
      if (s.status !== 'waiting') SOD[String(s.id)] = { s: s.status, t: fmt(s.decided_at), c: s.comment || '' }; });
  }
  soItems = () => SO;
  soAct = async function (i, s) {
    if (!isAdmin()) { toast('Only an admin can sign off'); return; }
    const id = +SO[i][0], c = s === 'returned' ? ($('socmt')?.value || '').trim() : null;
    try { await write('Sign-off', () => sb.rpc('signoff_decide', { p_id: id, p_decision: s || 'waiting', p_comment: c })); soOpen = null; await loadAll(); renderSO(); }
    catch (e) {}
  };

  /* ---------- Visits (writes KMA scores) ---------- */
  let curVisit = null;
  function applyVisits() {
    VISITS.length = 0; P.data.visits.forEach(v => VISITS.push(['VIS-' + v.id, v.fields?.Status || 'Draft', v.fields?.Judgement || '—', v.id]));
    renderVisits(); if (!curVisit && P.data.visits[0]) previewOpenVisit(P.data.visits[0].id, true);
  }
  window.previewOpenVisit = function (id, quiet) {
    const v = P.data.visits.find(x => x.id === id); if (!v) return; curVisit = v;
    const s = v.fields?.Scores || {}; Object.keys(scores).forEach(k => scores[k] = s[k] || 0);
    vType = (v.fields?.['QCTO Type'] || 'Implementation') + ' monitoring'; if (!EVID[vType]) vType = 'Implementation monitoring';
    vAnn = v.fields?.Announced || 'Announced'; renderKma(); if (!quiet) ROUTES.visit[0] = 'VIS-' + id;
  };
  const _rk = renderKma;
  renderKma = function () {
    _rk();
    document.querySelectorAll('#kmas .score').forEach(b => { const old = b.onclick; b.onclick = async ev => { old && old.call(b, ev); await saveVisit(); }; });
  };
  async function saveVisit() {
    if (!curVisit) return;
    const f = Object.assign({}, curVisit.fields, { Scores: { ...scores }, 'QCTO Type': vType.replace(' monitoring', ''), Announced: vAnn, Judgement: $('judge').textContent.replace(' (draft)', '') });
    try { await write('Visit', () => sb.from('monitoring_visits').update({ fields: f }).eq('id', curVisit.id)); curVisit.fields = f; } catch (e) {}
  }
  document.addEventListener('click', e => { if (e.target.closest('#vrows a')) { const id = +e.target.textContent.replace('VIS-', ''); if (id) previewOpenVisit(id); } });

  /* ---------- Recommendations (writes resolved) ---------- */
  function applyRecs() {
    const kmaName = k => (typeof KMAS !== 'undefined' && KMAS.find(x => x[0] === k)?.[1]) || '';
    const fmtDate = d => { const t = d && new Date(d); return t && !isNaN(t) ? t.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };
    RECS.length = 0; P.data.recs.forEach(r => {
      const f = r.fields || {}, due = fmtDate(f.Due), bits = [r.programme_id ? esc(progName(r.programme_id)) : '', due ? 'Due ' + due : 'No due date', r.owner_email ? 'Owner ' + esc(r.owner_email) : 'No owner'].filter(Boolean);
      RECS.push([f.KMA || 'KMA', kmaName(f.KMA) || 'Key monitoring area', f.Priority || 'Medium', r.resolved ? 1 : 0, 0, r.id,
        { text: esc(f.Text || 'Recommendation'), sub: bits.join(' · ') + (r.resolved && r.resolved_at ? ' · Resolved ' + fmtDate(r.resolved_at) : '') }]);
    });
    renderRecs();
    document.querySelectorAll('#reclist button').forEach(b => { b.onclick = null; });
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('#reclist button'); if (!b || !/Mark resolved/.test(b.textContent)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const card = b.closest('article'), idx = [...$('reclist').children].indexOf(card), open = RECS.filter(r => rF === 'All' || (rF === 'Resolved') === !!r[3]);
    const rec = open[idx]; if (!rec) return;
    await write('Recommendation', () => sb.from('recommendations').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', rec[5]));
    await loadAll();
  }, true);

  /* ---------- FAM + clients (read) ---------- */
  function applyFam() {
    PEOPLE.length = 0; P.data.famc.forEach(a => PEOPLE.push([a.full_name, P.data.assessors.find(x => x.id === a.assessor_id)?.role || '', Array(Math.max(0, a.document_count)).fill('CV')]));
    if (!PEOPLE.length) PEOPLE.push(['No practitioners yet', '', []]);
    famSel = 0; renderFam();
    $('famkpis').innerHTML = [['Practitioners', P.data.famc.length], ['Registrations', P.data.famc.reduce((t, a) => t + a.registration_count, 0)], ['Open follow-ups', P.data.famc.reduce((t, a) => t + a.open_follow_ups, 0)]]
      .map(([l, v]) => `<div class="kpi" style="min-width:150px;padding:12px 16px;gap:2px"><span class="l">${l}</span><span class="v" style="font-size:24px">${v}</span></div>`).join('');
  }
  function applyClients() {
    $('clientcards').innerHTML = P.data.clients.map((c, i) => `<button class="pick${i === 0 ? ' on' : ''}"><b>${esc(c.client_name)}</b><span class="sub">PM: ${esc(c.project_manager || '—')}</span><span class="sub">${P.data.progs.filter(p => p.client_id === c.id).length} programmes</span></button>`).join('');
  }

  /* ---------- ClickUp sync status (read; only for roles that may see the outbox) ---------- */
  function applySync() {
    let box = $('syncbox');
    if (!box) { document.querySelector('#view-dashboard .row').insertAdjacentHTML('afterend', '<section class="card" id="syncbox"></section>'); box = $('syncbox'); }
    if (!can('project_manager', 'operations')) { box.hidden = true; return; }
    const o = P.data.outbox, c = s => o.filter(x => x.status === s).length;
    box.hidden = false;
    box.innerHTML = `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 style="flex-grow:1">ClickUp sync (test folder)</h2><span class="sub">Delivered by the preview adapter to “Z. Redesign Preview (TEST)”</span></div>
      <div class="grid" style="margin-top:12px">${[['Queued', c('queued'), 'b-n'], ['Retrying', c('retrying'), 'b-warn'], ['Delivered', c('succeeded'), 'b-ok'], ['Quarantined (Sync Exception)', c('quarantined'), 'b-bad']]
      .map(([l, v, b]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="n"><span class="badge ${b}">${l.split(' ')[0]}</span></span></div>`).join('')}</div>
      ${o.find(x => x.last_error) ? `<p class="sub" style="margin:10px 0 0">Last error: ${esc(o.find(x => x.last_error).last_error.slice(0, 160))}</p>` : ''}`;
  }

  /* banner */
  document.body.insertAdjacentHTML('afterbegin', '<div id="pvbanner" style="position:sticky;top:0;z-index:50;background:#FBDC00;color:#002C5B;font-weight:700;text-align:center;padding:6px 12px;font-size:13px">PREVIEW · separate test project · test data only · live ApexOne is unchanged</div>');
})();
