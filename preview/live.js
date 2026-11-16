/* ApexOne redesign preview — live data layer.
   Talks to the LIVE ApexOne project (apex-one, nducwhlmudksgxggjrbo) since 10 Nov 2026 (Stavros:
   the new UI is the one to use). Writes here are real.
   It never calls ClickUp: writes land in Supabase, the database queues them in the
   outbox, and the preview adapter (server-side, token never in the browser) delivers
   them to the "Z. Redesign Preview (TEST)" folder in ApexOne Operations. */
(function () {
  const CFG = window.PREVIEW_CFG || {
    url: 'https://nducwhlmudksgxggjrbo.supabase.co',
    key: 'sb_publishable_G2BvFAbvXlrq9nwIl4Gupw_3qyTRe2b'
  };
  // Messages from this layer are real, so drop the mock's " (mock)" suffix.
  const toast = m => { window.toast(m); const t = document.getElementById('toast'); if (t) t.textContent = m; };
  const sb = window.supabase.createClient(CFG.url, CFG.key);
  window.__sb = sb;
  const P = { user: null, roles: [], tenant: null, data: {} };
  window.__preview = P;
  /* Shared look (FAM Registry style) for every screen: KPI filter tiles, segmented switch, grouped table rows */
  window.UI = {
    tiles: gs => gs.map(g => `<div class="famgrp" role="group" aria-label="${g.t}"><div class="famgl">${g.t}</div><div class="famgk">${g.k.map(([l, v, c, on, click, h]) => click
      ? `<button type="button" class="kpi famk${on ? ' on' : ''}" onclick="${click}" aria-pressed="${!!on}" title="${h ? h + '. ' : ''}${on ? 'Click again to clear the filter' : 'Click to filter the list'}"><span class="l">${l}</span><span class="v" style="color:${v && c ? c : v ? 'var(--ink)' : 'var(--muted)'}">${v}</span>${h ? `<span class="h" style="display:block;font-size:11px;line-height:1.3;color:var(--muted);margin-top:2px;font-weight:400">${h}</span>` : ''}</button>`
      : `<div class="kpi famk" style="cursor:default"><span class="l">${l}</span><span class="v" style="color:${c || 'var(--ink)'}">${v}</span></div>`).join('')}</div></div>`).join(''),
    seg: (opts, cur, fn) => `<div class="famseg" role="group">${opts.map(o => `<button type="button" class="${o === cur ? 'on' : ''}" aria-pressed="${o === cur}" onclick="${fn(o)}">${o}</button>`).join('')}</div>`,
    gh: (label, n, color, cols, note) => `<tr class="famgh"><td colspan="${cols}"><span class="famgd" style="background:${color}"></span>${label}<span class="famgn">${n}</span>${note ? `<span class="sub">${note}</span>` : ''}</td></tr>`
  };
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
    const legacy = location.hash.match(/view=fam&assessor=(\d+)/); // live-style deep link
    if (legacy) { location.replace('#fam/' + legacy[1]); return; }
    const r = location.hash.slice(1).split('/')[0] || 'login';
    if (!P.user && r !== 'login') { try { sessionStorage.setItem('pvNext', location.hash); } catch (_) {} location.hash = 'login'; return; }
    if (P.user && r === 'login') { let n = null; try { n = sessionStorage.getItem('pvNext'); sessionStorage.removeItem('pvNext'); } catch (_) {} location.hash = n && n !== '#login' ? n : 'mywork'; return; }
    _route();
    if (P.user) afterRoute(r);
  };
  const form = document.querySelector('#view-login form');
  form.onsubmit = async ev => {
    ev.preventDefault();
    const [em, pw] = form.querySelectorAll('input');
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    if (!window._pvCap && window.turnstile) { btn.disabled = false; btn.textContent = 'Sign in'; let e0 = form.querySelector('.err'); if (e0) e0.remove(); form.insertAdjacentHTML('beforeend', '<div class="err" role="alert">Please wait for the security check to finish, then try again.</div>'); return; }
    const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value, ...(window._pvCap ? { options: { captchaToken: window._pvCap } } : {}) });
    window._pvCap = null; try { window.turnstile && turnstile.reset('#pv-ts'); } catch (_) {}
    btn.disabled = false; btn.textContent = 'Sign in';
    let e = form.querySelector('.err'); if (e) e.remove();
    if (error) form.insertAdjacentHTML('beforeend', `<div class="err" role="alert">${esc(error.message)}</div>`);
  };
  // Forgot password: real reset email (needs the email above and the security check).
  form.querySelector('a[onclick*="Reset link flow"]').onclick = async ev => {
    ev.preventDefault(); const em = form.querySelector('input[type=email]').value.trim();
    let e = form.querySelector('.err'); if (e) e.remove();
    const say = (m, ok) => form.insertAdjacentHTML('beforeend', `<div class="err" role="alert"${ok ? ' style="color:#166534;background:#dcfce7"' : ''}>${esc(m)}</div>`);
    if (!em) return say('Type your email above first.');
    if (!window._pvCap && window.turnstile) return say('Please wait for the security check to finish, then try again.');
    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname + '#login', ...(window._pvCap ? { captchaToken: window._pvCap } : {}) });
    window._pvCap = null; try { window.turnstile && turnstile.reset('#pv-ts'); } catch (_) {}
    say(error ? error.message : 'If that email has an account, a reset link is on its way.', !error);
  };
  // Live ApexOne auth has captcha protection on: same Turnstile site key as the live app.
  const ts = form.querySelector('.ts'); ts.className = ''; ts.innerHTML = '<div id="pv-ts"></div>';
  window._pvTsLoad = () => turnstile.render('#pv-ts', { sitekey: '0x4AAAAAAE4gMGMxYC7Zn1qJ', callback: t => { window._pvCap = t; }, 'expired-callback': () => { window._pvCap = null; } });
  { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=_pvTsLoad&render=explicit'; sc.async = true; document.head.appendChild(sc); }
  // Sign out must never wait on the auth lock: clear the local session first, then tell the server in the background.
  function hardSignOut() {
    P.user = null; P.roles = []; P.tenant = null;
    try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (_) {}
    sb.auth.signOut({ scope: 'local' }).catch(() => {});
    // Full reload so the sign-in page always runs the latest code (captcha etc.), even in a tab left open for days.
    location.replace(location.pathname + '#login'); setTimeout(() => location.reload(), 50);
  }
  document.querySelector('.me a[href="#login"]').onclick = e => { e.preventDefault(); hardSignOut(); };

  // Supabase holds its auth lock while this callback runs, so awaiting other sb calls inside it can deadlock.
  // Defer the real work to the next tick.
  sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => onAuth(session), 0); if (_e === 'PASSWORD_RECOVERY') setTimeout(pvNewPw, 300); });
  // Reset link from "Forgot password?" lands here signed in: ask for the new password.
  async function pvNewPw() {
    for (;;) {
      const a = prompt('Choose a new password (at least 8 characters):'); if (a == null) return;
      if (a.length < 8) { alert('At least 8 characters, please.'); continue; }
      if (prompt('Type the new password again:') !== a) { alert('The two passwords did not match.'); continue; }
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) { alert(error.message); continue; }
      alert('Password changed.'); return;
    }
  }
  async function onAuth(session) {
    P.user = session?.user || null;
    const am = P.user?.app_metadata || {};
    P.roles = Array.isArray(am.role) ? am.role : am.role ? [am.role] : [];
    P.tenant = am.tenant || null;
    if (P.user && !P.tenant) { toast('This account has no ApexOne tenant'); hardSignOut(); return; }
    if (P.user) {
      document.querySelector('.me .avatar').textContent = (P.user.email || '?')[0].toUpperCase();
      document.querySelector('.me div div').textContent = P.user.email;
      document.querySelector('.me div div+div').textContent = (P.roles.join(', ') || 'no role') + ' · NEW UI';
      const now = new Date(), h = now.getHours(), who = (P.user.email || '').split(/[@+.]/)[0];
      const g = $('greet'), gd = $('greetdate');
      if (g) g.textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (who ? ', ' + who[0].toUpperCase() + who.slice(1) : '');
      if (gd) gd.textContent = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      await loadAll();
    }
    window.route();
  }

  /* ---------- reads ---------- */
  async function q(name, p) { let r = await p; if (r.error) { P.errors[name] = r.error.message; return []; } let a = r.data || [];
    // paging: the API returns at most 1000 rows per request, so keep fetching until a short page comes back
    while (r.data && r.data.length === 1000 && typeof p.range === 'function') { r = await p.range(a.length, a.length + 999); if (r.error) { P.errors[name] = r.error.message; break; } a = a.concat(r.data || []); }
    return a; }
  async function loadAll() {
    P.errors = {};
    const R = sb.schema('reports');
    const [learners, enrol, progs, clients, tracker, mods, accs, legacy, signoffs, visits, recs, assessors, famc, dq, outbox, reports, windows, leisaSettings, leisa, pmods, sessions, att, eisaRes, poeRows] = await Promise.all([
      q('learners', sb.from('learners').select('id,first_name,last_name,id_number,email,phone,fields').order('last_name').order('id')),
      q('enrolments', sb.from('enrolments').select('id,learner_id,programme_id,status,created_at,fields').order('id')),
      q('programmes', sb.from('programmes').select('id,programme_name,client_id,saqa_id,qualification_type,nqf_level,start_date,end_date,status,programme_type,project_manager_name,facilitator_id,provider,qualification_name,fields,display_id,entity,qualification_code,group_name,group_size,programme_status,accreditation_end_date,eisa_start_date,eisa_end_date,deleted_at,handed_over_to_email,intake_source_id')),
      q('clients', sb.from('clients').select('id,client_name,contact_person,contact_email,contact_number,project_manager,sales_person,fields,deleted_at')),
      q('qcto_tracker', sb.from('qcto_tracker').select('*').order('id')),
      q('moderation_items', sb.from('moderation_items').select('*').order('id')),
      q('accreditation_items', sb.from('accreditation_items').select('*').order('id')),
      q('legacy_qualifications', sb.from('legacy_qualifications').select('*')),
      q('signoff_items', sb.from('signoff_items').select('*').order('created_at', { ascending: false })),
      q('monitoring_visits', sb.from('monitoring_visits').select('*').order('id')),
      q('recommendations', sb.from('recommendations').select('*').order('id')),
      q('assessors', (window.__sb || sb).from('assessors').select('id,full_name,role')),
      q('v_fam_completeness', sb.from('v_fam_completeness').select('*')),
      isAdmin() ? q('v_learner_data_quality', sb.from('v_learner_data_quality').select('*')) : [],
      can('project_manager', 'operations') ? q('outbox', sb.from('clickup_sync_outbox').select('id,source_table,status,last_error').order('id', { ascending: false }).limit(500)) : [],
      q('reports', R.rpc('my_report_queue', { p_limit: 60 })),
      q('eisa_windows', sb.from('eisa_windows').select('*').order('eisa_date')),
      q('leisa_settings', sb.from('leisa_settings').select('*')),
      q('leisa_learner', sb.from('leisa_learner').select('*')),
      q('program_modules', sb.from('program_modules').select('*').order('module_number')),
      q('attendance_sessions', sb.from('attendance_sessions').select('*').order('session_date')),
      q('attendance', sb.from('attendance').select('id,programme_id,learner_id,session_date,status,fields').order('id')),
      q('eisa', sb.from('eisa').select('*').order('id')),
      q('poe_checklist', sb.from('poe_checklist').select('id,programme_id,learner_id,fields,created_at,updated_at').order('id'))
    ]);
    Object.assign(P.data, { learners, enrol, progs, clients, tracker, mods, accs, legacy, signoffs, visits, recs, assessors, famc, dq, outbox, reports, windows, leisaSettings, leisa, pmods, sessions, att, eisaRes, poeRows });
    P.data.progsAll = progs; P.data.progs = progs.filter(p => !p.deleted_at);   // 233 of 260 programmes are soft-deleted on live
    applyAll();
    const bad = Object.keys(P.errors);
    const real = bad;   // QA/ETQA, LEISA and sign-off tables are on live since 11 Nov (migration qa_tables_live)
    if (real.length) toast('Could not load: ' + real.join(', '));
  }
  window.previewReload = loadAll;

  const progName = id => (P.data.progsAll || P.data.progs).find(p => p.id === id)?.programme_name || 'Programme ' + id;
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
    const d = P.data, test = new Set(d.learners.filter(lTest).map(l => l.id)), realL = d.learners.filter(l => !test.has(l.id));   // test records left out of the counts
    const actE = d.enrol.filter(e => !test.has(e.learner_id) && enLive(e)), linked = new Set(actE.map(e => e.learner_id));
    const unlinked = realL.filter(l => !linked.has(l.id)).length, openRecs = d.recs.filter(r => !r.resolved).length;
    $('kpis').innerHTML = [['Learners', realL.length, 'on record', 'var(--muted)', 'learners'], ['Active enrolments', actE.length, unlinked + ' learners unlinked', unlinked ? 'var(--warn)' : 'var(--muted)', 'enrolments'],
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

  /* ---------- Learners + Enrolments (same fields as the old app) ---------- */
  // learners: columns first_name,last_name,id_number,email,phone + fields 'First Name','Last Name','National ID',DOB,Gender,Province,Email,Phone,Employment,Programme,'Programme Name'
  // enrolments: columns learner_id, programme_id, status ('active') + fields Status (Active|Completed|Withdrawn|Enrolled|Pending|In Progress),'Statement Status','EISA Type','Funding Type',Site,'Learner Name','Programme Name','Enrolment ID'
  const LG = ['Male', 'Female', 'Other'], LPROV = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'], LEMP = ['Employed', 'Unemployed'];
  const ENST = ['Active', 'Completed', 'Withdrawn', 'Enrolled', 'Pending'], ENSS = ['Issued', 'Pending', 'Not Issued', 'Not Applicable', 'Training In Progress'], ENET = ['Internal', 'External'];
  const ENFUND = ['Self-Funded', 'SETA Funded', 'Discretionary Grant', 'Mandatory Grant', 'Learnership Grant', 'Company Funded', 'NSFAS', 'Bursary', 'Other'];
  const lf = l => l.fields || {}, ef = e => e.fields || {};
  const lName = l => `${l.first_name || lf(l)['First Name'] || ''} ${l.last_name || lf(l)['Last Name'] || ''}`.trim() || 'Learner ' + l.id;
  const lIdn = l => l.id_number || lf(l)['National ID'] || '';
  const enSt = e => { const s = ef(e).Status || e.status || ''; return s ? s[0].toUpperCase() + s.slice(1) : 'Active'; };
  const enLive = e => ['Active', 'Enrolled', 'In progress', 'In Progress', 'Pending'].includes(enSt(e));
  const lTest = l => String(lf(l).is_test_data) === 'true';
  const said = id => { if (!/^\d{13}$/.test(id)) return false; let s = 0; for (let i = 0; i < 13; i++) { let d = +id[i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; } return s % 10 === 0; };
  const opt = (list, v, blank = '—') => `<option value="">${blank}</option>` + (v && !list.includes(v) ? [v, ...list] : list).map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const progOpts = sel => P.data.progs.slice().sort((a, b) => String(a.programme_name || '').localeCompare(String(b.programme_name || ''))).map(p => `<option value="${p.id}" ${String(p.id) === String(sel) ? 'selected' : ''}>${esc(p.programme_name || 'Programme ' + p.id)}</option>`).join('');
  const lCss = () => { if (!$('lformcss')) document.head.insertAdjacentHTML('beforeend', '<style id="lformcss">#famov textarea,#famov .lpick{border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;background:transparent;color:var(--ink)}#famov .lpick{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:2px}#famov .lpick label{flex-direction:row;align-items:center;gap:8px;font-size:13px;color:var(--ink)}#famov .lpick input{height:auto}</style>'); };
  window.apxDlg = (...a) => dlg(...a);
  function dlg(id, title, body, onSave, saveLabel = 'Save') {
    lCss(); document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="${esc(title)}"><form class="card" id="${id}"><h2>${esc(title)}</h2>${body}<div class="sub" id="${id}err" style="color:var(--bad)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" onclick="document.getElementById('famov').remove()">Cancel</button><button class="btn y" id="${id}save">${saveLabel}</button></div></form></div>`);
    $(id).onsubmit = async ev => { ev.preventDefault(); const b = $(id + 'save'); b.disabled = true; const t = b.textContent; b.textContent = 'Saving…';
      try { if (!P.tenant) throw new Error('No tenant on your account.'); await onSave($(id).elements); $('famov')?.remove(); await loadAll(); } catch (err) { $(id + 'err').textContent = err.message || String(err); b.disabled = false; b.textContent = t; } };
    $(id).querySelector('input,select')?.focus();
  }
  function applyLearners() {
    LEARNERS.length = 0;
    P.data.learners.forEach(l => { const e = P.data.enrol.filter(x => x.learner_id === l.id), live = e.find(enLive);
      const pe = live || e[0], dqi = (P.data.dq || []).filter(r => r.learner_id === l.id && !r.decision).map(r => String(r.issue || ''));
      LEARNERS.push({ lid: l.id, n: lName(l), id: lIdn(l) ? '••••••••' + lIdn(l).slice(-4) : '', pid: pe ? pe.programme_id : null, p: live ? progName(live.programme_id) : (e[0] ? progName(e[0].programme_id) + ' (' + enSt(e[0]).toLowerCase() + ')' : ''), s: live ? 'Active' : e.length ? 'Not active' : 'Not enrolled', t: lTest(l), bad: dqi.some(x => x.includes('invalid')), dup: dqi.some(x => x.includes('dup')) }); });
    lLoaded = true;
    const h = document.querySelector('#view-learners h1 .sub'); if (h) h.textContent = LEARNERS.filter(x => !x.t).length + ' on record';
    const head = document.querySelector('#view-learners h1')?.parentElement;
    if (head && !$('ladd')) head.insertAdjacentHTML('beforeend', '<button class="btn" id="limp" onclick="previewLearnerImport()">Import from Excel</button><button class="btn y" id="ladd" onclick="previewLearnerAdd()">+ Add learner</button>');
    head?.querySelectorAll('button:not(#ladd):not(#limp)').forEach(b => b.remove());
    const th = $('lrows')?.closest('table')?.querySelector('thead tr'); if (th) th.innerHTML = '<th>Learner</th><th>ID number</th><th>Client</th><th>Status</th><th></th>';
    const lcard = $('lrows')?.closest('.card'); if (lcard && !$('ltiles')) { lcard.insertAdjacentHTML('beforebegin', '<div id="ltiles" class="famtiles"></div>'); const tb = $('lfilter').parentElement; tb.className = 'famtool'; tb.removeAttribute('style'); $('lfilter').removeAttribute('style'); $('lfilter').className = ''; }
    renderLearners();
    if (location.hash.startsWith('#learner/')) renderLearner(+location.hash.split('/')[1]);
  }
  let lView = 'By programme';
  window.lSetView = v => { lView = v; lPage = 0; renderLearners(); };
  renderLearners = function () {
    const q = ($('lq').value || '').trim().toLowerCase(), base = LEARNERS.filter(l => !l.t), all = base.length, act = base.filter(l => l.s === 'Active').length, noid = base.filter(l => !l.id).length;
    if (lF === 'Unlinked') lF = 'Not enrolled';
    const FL = { 'No ID': l => !l.id, 'Invalid ID': l => l.bad, 'Possible duplicate': l => l.dup };
    if (!['All', 'Active', 'Not enrolled', 'Not active', ...Object.keys(FL)].includes(lF)) lF = 'All';
    const pOf = id => P.data.progs.find(p => p.id === id), cOf = id => clientOf(id)?.client_name || '', dt = d => d ? String(d).slice(0, 10) : '?';
    const HINT = { All: 'Everyone on record', Active: 'Enrolled on a programme running now', 'Not enrolled': 'No enrolment on any programme', 'Not active': 'Enrolled only on completed or planned programmes', 'No ID': 'ID number is blank', 'Invalid ID': 'Fails the SA ID check (length, date or checksum)', 'Possible duplicate': 'Same ID or name as another learner' };
    const tile = (k, v, c) => [k === 'All' ? 'All learners' : k, v, c, lF === k && k !== 'All', `lF='${lF === k ? 'All' : k}';lPage=0;renderLearners()`, HINT[k]];
    if ($('ltiles')) $('ltiles').innerHTML = UI.tiles([{ t: 'Enrolment', k: [tile('All', all), tile('Active', act, 'var(--ok)'), tile('Not enrolled', base.filter(l => l.s === 'Not enrolled').length, 'var(--warn)'), tile('Not active', base.filter(l => l.s === 'Not active').length, 'var(--warn)')] }, { t: 'Needs attention', k: [tile('No ID', noid, 'var(--bad)'), tile('Invalid ID', base.filter(FL['Invalid ID']).length, 'var(--bad)'), tile('Possible duplicate', base.filter(FL['Possible duplicate']).length, 'var(--warn)')] }]);
    $('lfilter').innerHTML = UI.seg(['By programme', 'List'], lView, o => `lSetView('${o}')`);
    let rows = base.filter(l => (lF === 'All' || (FL[lF] ? FL[lF](l) : l.s === lF)) && (!q || l.n.toLowerCase().includes(q) || (l.id || '').includes(q) || (l.p || '').toLowerCase().includes(q) || cOf(l.pid).toLowerCase().includes(q) || String(l.pid) === q.replace('#', '')));
    const grp = l => { if (!l.pid) return 'Not enrolled'; const p = pOf(l.pid); return '#' + l.pid + ' · ' + (cOf(l.pid) || 'No client') + ' · ' + l.p + (p ? ' · ' + dt(p.start_date) + ' – ' + dt(p.end_date) : ''); }, byP = lView === 'By programme';
    if (byP) rows = rows.slice().sort((a, b) => (!a.p - !b.p) || grp(a).localeCompare(grp(b)) || a.n.localeCompare(b.n));
    const cnt = {}; rows.forEach(l => { cnt[grp(l)] = (cnt[grp(l)] || 0) + 1; });
    const pages = Math.max(1, Math.ceil(rows.length / PER)); if (lPage >= pages) lPage = pages - 1; const pg = rows.slice(lPage * PER, lPage * PER + PER);
    let last = null;
    $('lrows').innerHTML = pg.map(l => {
      const gh = byP && grp(l) !== last ? UI.gh(esc(grp(l)), cnt[grp(l)], l.pid ? 'var(--navy)' : 'var(--warn)', 5, l.pid ? esc(pOf(l.pid)?.project_manager_name || 'No PM') : '') : ''; last = grp(l);
      return gh + `<tr class="famtr" onclick="location.hash='learner/${l.lid}'"><td><b>${esc(l.n)}</b>${l.id ? '' : '<span class="famflag">No ID</span>'}${l.bad ? '<span class="famflag">Invalid ID</span>' : ''}${l.dup ? '<span class="famflag">Possible duplicate</span>' : ''}</td><td class="sub">${l.id}</td><td>${byP ? esc(cOf(l.pid)) : (l.p ? esc((cOf(l.pid) ? cOf(l.pid) + ' · ' : '') + l.p) : '<span class="sub">Not enrolled</span>')}</td><td>${l.s === 'Active' ? '<span class="badge b-ok">Active</span>' : `<span class="badge b-warn">${l.s}</span>`}</td><td style="text-align:right"><button class="famact" onclick="event.stopPropagation();previewLearnerEdit(${l.lid})">Edit</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="sub">No learners match.</td></tr>';
    $('lpager').innerHTML = `<span class="sub" style="flex-grow:1">Showing ${rows.length ? lPage * PER + 1 : 0}–${lPage * PER + pg.length} of ${rows.length}</span>${pages > 1 ? `<button class="btn sm" ${lPage ? '' : 'disabled'} onclick="lPage--;renderLearners()">Previous</button><button class="btn sm" ${lPage < pages - 1 ? '' : 'disabled'} onclick="lPage++;renderLearners()">Next</button>` : ''}`;
  };
  loadLearners = renderLearners;
  addEventListener('hashchange', () => { if (location.hash.startsWith('#learner/')) renderLearner(+location.hash.split('/')[1]); });
  function renderLearner(id) {
    const l = P.data.learners.find(x => x.id === id), box = $('view-learner'); if (!box) return;
    if (!l) { box.innerHTML = '<a class="back" href="#learners">← All learners</a><p class="sub">Learner not found.</p>'; return; }
    try { ROUTES.learner[0] = lName(l); } catch (_) {}
    const f = lf(l), en = P.data.enrol.filter(e => e.learner_id === id), kv = (k, v) => v ? `<div style="display:flex;gap:8px"><span class="sub" style="min-width:120px">${k}</span><span>${esc(String(v))}</span></div>` : '';
    const ini = lName(l).split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
    box.innerHTML = `<a class="back" href="#learners">← All learners</a>
      <div class="card" style="display:flex;flex-wrap:wrap;gap:18px;align-items:center"><span style="width:64px;height:64px;border-radius:50%;background:var(--navy);color:var(--yellow);font-family:Poppins;font-weight:600;font-size:22px;display:flex;align-items:center;justify-content:center">${esc(ini)}</span>
        <div style="flex-grow:1"><h1 style="font-size:24px">${esc(lName(l))}</h1><span class="sub" style="font-size:14px">${lIdn(l) ? 'ID ••••••••' + esc(lIdn(l).slice(-4)) : 'No ID number'}${f.Employment ? ' · ' + esc(f.Employment) : ''}</span></div>
        <button class="btn" onclick="previewLearnerAI(${l.id})">✨ Progress summary</button><button class="btn" onclick="previewLearnerEdit(${l.id})">Edit details</button><button class="btn y" onclick="previewEnrolAdd(null,${l.id})">+ Enrol</button></div>
      <div class="row"><section class="card" style="flex:1 1 320px;display:flex;flex-direction:column;gap:6px"><h2 style="font-size:15px">Details</h2>${kv('Email', l.email || f.Email)}${kv('Phone', l.phone || f.Phone)}${kv('Date of birth', f.DOB)}${kv('Gender', f.Gender)}${kv('Province', f.Province)}${kv('Employment', f.Employment)}</section>
      <section class="card" style="flex:2 1 420px;display:flex;flex-direction:column;gap:8px"><h2 style="font-size:15px">Enrolments (${en.length})</h2>
        ${en.map(e => `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="badge ${enLive(e) ? 'b-ok' : 'b-n'}">${esc(enSt(e))}</span><b style="flex-grow:1">${esc(progName(e.programme_id))}</b><span class="sub">${esc([ef(e)['Statement Status'] && 'Statement ' + ef(e)['Statement Status'], ef(e)['Funding Type'], ef(e).Site].filter(Boolean).join(' · '))}</span><button class="btn sm" onclick="previewEnrolEdit(${e.id})">Edit</button></div>`).join('') || '<p class="sub">Not enrolled yet.</p>'}</section></div>`;
  }
  function learnerBody(l) {
    const f = l ? lf(l) : {}, i = (n, lab, v, t = 'text', ex = '') => `<label>${lab}<input name="${n}" type="${t}" value="${esc(v || '')}" ${ex}></label>`;
    return `<div class="qagrid">${i('fn', 'First name *', l ? (l.first_name || f['First Name']) : '', 'text', 'required')}${i('ln', 'Last name *', l ? (l.last_name || f['Last Name']) : '', 'text', 'required')}${i('nid', 'SA ID number', l ? lIdn(l) : '', 'text', 'inputmode="numeric" maxlength="13"')}${i('dob', 'Date of birth', f.DOB, 'date')}
      <label>Gender<select name="gender">${opt(LG, f.Gender)}</select></label><label>Province<select name="prov">${opt(LPROV, f.Province)}</select></label>${i('email', 'Email', l ? (l.email || f.Email) : '', 'email')}${i('phone', 'Phone', l ? (l.phone || f.Phone) : '', 'tel')}
      <label>Employment<select name="emp">${opt(LEMP, f.Employment)}</select></label></div>`;
  }
  async function learnerVals(el, l) {
    const v = n => el[n].value.trim(), nid = v('nid');
    if (nid) { if (!said(nid)) throw new Error('That SA ID number is not valid (13 digits, check digit).');
      const dup = P.data.learners.find(x => x.id !== l?.id && lIdn(x) === nid); if (dup) throw new Error(`${lName(dup)} already has this ID number.`);
      try { const { data } = await sb.rpc('check_learner_duplicate', { p_tenant_id: P.tenant, p_id_number: nid }); const d = (data || []).find(x => x.learner_id !== l?.id); if (d) throw new Error(`${d.first_name} ${d.last_name} already has this ID number.`); } catch (e) { if (/already has/.test(e.message)) throw e; } }
    const fields = { ...(l ? lf(l) : {}), 'First Name': v('fn'), 'Last Name': v('ln'), 'National ID': nid, DOB: v('dob'), Gender: v('gender'), Province: v('prov'), Email: v('email'), Phone: v('phone'), Employment: v('emp') };
    Object.keys(fields).forEach(k => { if (fields[k] === '' && !(l && k in lf(l))) delete fields[k]; });
    return { first_name: v('fn'), last_name: v('ln'), id_number: nid || null, email: v('email') || null, phone: v('phone') || null, fields };
  }
  window.previewLearnerAdd = () => dlg('lform', 'Add learner', learnerBody(null) + `<label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px">Enrol on programme (optional)<select name="prog" style="height:36px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:transparent;color:var(--ink)"><option value="">—</option>${progOpts()}</select></label>`,
    async el => { const row = await learnerVals(el, null); const r = await write('Learner', () => sb.from('learners').insert({ tenant_id: P.tenant, ...row }).select('id'));
      const lid = r?.[0]?.id; if (lid && el.prog.value) await enrolInsert(+el.prog.value, [lid], { Status: 'Active' }); if (lid) setTimeout(() => { location.hash = 'learner/' + lid; }, 0); });
  /* Learner import from Excel (replaces the old app's Smart Import for learners). Step 1 reads and checks the file; step 2 saves. */
  const IMAP = { fn: /^(first ?names?|name|given ?names?)$/, ln: /^(last ?name|surname|family ?name)$/, nid: /^(national ?id|sa ?id( ?number)?|id ?(number|no\.?)?|identity ?number)$/, dob: /^(dob|date ?of ?birth|birth ?date)$/,
    gender: /^(gender|sex)$/, prov: /^province$/, email: /^(e-?mail( ?address)?)$/, phone: /^(phone|cell(phone)?|mobile|contact ?(number|no\.?)?|tel(ephone)?)$/, emp: /^(employment( ?status)?|employed)$/ };
  let IMP = null;
  window.previewImpReset = () => { IMP = null; const b = $('limpfsave'); if (b) b.textContent = 'Check file'; const m = $('limpsum'); if (m) m.textContent = ''; };
  window.previewLearnerImport = () => { IMP = null; const progs = P.data.progs.slice().sort((a, b) => (a.programme_name || '').localeCompare(b.programme_name || ''));
    dlg('limpf', 'Import learners from Excel', `<p class="sub">First sheet, one learner per row. Columns are matched by heading: First name, Last name, ID number, Date of birth, Gender, Province, Email, Phone, Employment. Rows with an invalid or already-used ID number are skipped.</p>
      <input type="file" name="file" accept=".xlsx,.xls,.csv" required onchange="previewImpReset()">
      <label style="font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px">Enrol everyone on (optional)<select name="prog" style="height:36px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:transparent;color:inherit"><option value="">No enrolment</option>${progs.map(p => `<option value="${p.id}">${esc(p.programme_name || 'Programme ' + p.id)}</option>`).join('')}</select></label>
      <div id="limpsum" class="sub"></div>`, async el => {
      if (!IMP) { await impCheck(el); throw new Error(' '); }
      const r = await write('Learners', () => sb.from('learners').insert(IMP.ok.map(x => ({ tenant_id: P.tenant, ...x }))).select('id'));
      const ids = (r || []).map(x => x.id); let msg = `Imported ${ids.length} learner${ids.length === 1 ? '' : 's'}`;
      if (ids.length && el.prog.value) { await loadAll(); const e = await enrolInsert(+el.prog.value, ids, { Status: 'Active' }); msg += `, enrolled ${e.added}`; }
      toast(msg); IMP = null; }, 'Check file'); };
  async function impCheck(el) {
    const f = el.file.files[0]; if (!f) throw new Error('Choose a file');
    if (!window.XLSX) throw new Error('Excel library not loaded');
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
    if (!rows.length) throw new Error('The first sheet has no rows');
    const heads = Object.keys(rows[0]), col = {}; Object.entries(IMAP).forEach(([k, re]) => { const h = heads.find(x => re.test(String(x).trim().toLowerCase())); if (h) col[k] = h; });
    if (!col.fn || !col.ln) throw new Error('Need a "First name" and a "Last name" column. Found: ' + heads.join(', '));
    const seen = new Set(P.data.learners.map(lIdn).filter(Boolean)), ok = [], skip = [];
    for (const [i, r] of rows.entries()) {
      const g = k => col[k] ? String(r[col[k]] ?? '').trim() : '', fn = g('fn'), ln = g('ln'), nid = g('nid').replace(/\s/g, ''), line = i + 2;
      if (!fn && !ln) continue;
      if (!fn || !ln) { skip.push(`Row ${line}: name missing`); continue; }
      if (nid && !said(nid)) { skip.push(`Row ${line} ${fn} ${ln}: invalid ID number`); continue; }
      if (nid && seen.has(nid)) { skip.push(`Row ${line} ${fn} ${ln}: ID number already on record`); continue; }
      if (nid) { try { const { data } = await sb.rpc('check_learner_duplicate', { p_tenant_id: P.tenant, p_id_number: nid }); if ((data || []).length) { skip.push(`Row ${line} ${fn} ${ln}: ID number already on record`); continue; } } catch (e) {} seen.add(nid); }
      const fields = { 'First Name': fn, 'Last Name': ln, 'National ID': nid, DOB: g('dob'), Gender: g('gender'), Province: g('prov'), Email: g('email'), Phone: g('phone'), Employment: g('emp') };
      Object.keys(fields).forEach(k => { if (!fields[k]) delete fields[k]; });
      ok.push({ first_name: fn, last_name: ln, id_number: nid || null, email: g('email') || null, phone: g('phone') || null, fields });
    }
    IMP = { ok };
    $('limpsum').innerHTML = `<b>${ok.length} ready to import</b>, ${skip.length} skipped. Columns used: ${esc(Object.values(col).join(', '))}.${skip.length ? `<div style="max-height:140px;overflow:auto;margin-top:6px">${skip.map(esc).join('<br>')}</div>` : ''}`;
    const b = $('limpfsave'); if (!ok.length) { IMP = null; return; } setTimeout(() => { b.textContent = `Import ${ok.length}`; }, 0);
  }
  window.previewLearnerEdit = id => { const l = P.data.learners.find(x => x.id === id); if (!l) return;
    dlg('lform', 'Edit learner', learnerBody(l), async el => { const row = await learnerVals(el, l); await write('Learner', () => sb.from('learners').update(row).eq('id', id).select('id')); }); };

  async function enrolInsert(pid, lids, extra) {
    const p = P.data.progs.find(x => x.id === pid), existing = new Set(P.data.enrol.filter(e => e.programme_id === pid).map(e => e.learner_id)), todo = lids.filter(id => !existing.has(id));
    if (!todo.length) throw new Error('Already enrolled on this programme.');
    const rows = todo.map(id => { const l = P.data.learners.find(x => x.id === id); const fields = { Status: 'Active', ...extra, Learner: [String(id)], 'Learner Name': [l ? lName(l) : ''], Programme: [String(pid)], 'Programme Name': [p?.programme_name || ''] };
      Object.keys(fields).forEach(k => { if (fields[k] === '') delete fields[k]; }); return { tenant_id: P.tenant, learner_id: id, programme_id: pid, status: 'active', fields }; });
    await write('Enrolment', () => sb.from('enrolments').insert(rows).select('id')); return { added: todo.length, skipped: lids.length - todo.length };
  }
  const enExtra = el => ({ Status: el.st.value || 'Active', 'Funding Type': el.fund.value, Site: el.site.value.trim() });
  window.previewEnrolAdd = (pid, lid) => {
    const learners = P.data.learners.filter(l => !lTest(l)).sort((a, b) => lName(a).localeCompare(lName(b)));
    dlg('enform', lid ? 'Enrol learner' : 'Enrol learners', `<div class="qagrid"><label>Programme *<select name="prog" required><option value="">—</option>${progOpts(pid)}</select></label><label>Status<select name="st">${opt(ENST, 'Active', 'Active')}</select></label><label>Funding type<select name="fund">${opt(ENFUND, '')}</select></label><label>Site<input name="site"></label></div>
      ${lid ? `<input type="hidden" name="one" value="${lid}"><p>${esc(lName(P.data.learners.find(x => x.id === lid) || {}))}</p>` : `<label>Learners * <input name="lq" type="search" placeholder="Filter by name" oninput="[...document.querySelectorAll('#famov .lpick label')].forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(this.value.toLowerCase()))"></label>
      <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="unl" style="height:auto" onchange="[...document.querySelectorAll('#famov .lpick label')].forEach(x=>{if(this.checked&&x.dataset.l==='1')x.hidden=true;else if(!this.checked)x.hidden=false})"> Only show learners without an active enrolment</label>
      <div class="lpick">${learners.map(l => `<label data-l="${P.data.enrol.some(e => e.learner_id === l.id && enLive(e)) ? 1 : 0}"><input type="checkbox" name="lid" value="${l.id}"> ${esc(lName(l))} <span class="sub">${lIdn(l) ? '··' + esc(lIdn(l).slice(-4)) : ''}</span></label>`).join('')}</div>`}`,
      async el => { const ids = el.one ? [+el.one.value] : [...$('enform').querySelectorAll('input[name=lid]:checked')].map(x => +x.value); if (!ids.length) throw new Error('Pick at least one learner.');
        const r = await enrolInsert(+el.prog.value, ids, enExtra(el)); toast2(`${r.added} enrolled${r.skipped ? `, ${r.skipped} already on this programme` : ''}`); }, 'Enrol');
  };
  window.previewEnrolEdit = id => { const e = P.data.enrol.find(x => x.id === id); if (!e) return; const f = ef(e), l = P.data.learners.find(x => x.id === e.learner_id);
    dlg('eeform', 'Edit enrolment', `<p><b>${esc(l ? lName(l) : 'Learner')}</b> · ${esc(progName(e.programme_id))}</p><div class="qagrid"><label>Status<select name="st">${opt(ENST, enSt(e), 'Active')}</select></label><label>Statement status<select name="ss">${opt(ENSS, f['Statement Status'])}</select></label>
      <label>EISA type<select name="et">${opt(ENET, f['EISA Type'])}</select></label><label>Funding type<select name="fund">${opt(ENFUND, f['Funding Type'])}</select></label><label>Site<input name="site" value="${esc(f.Site || '')}"></label></div>`,
      async el => { const nf = { ...f, Status: el.st.value || 'Active', 'Statement Status': el.ss.value, 'EISA Type': el.et.value, 'Funding Type': el.fund.value, Site: el.site.value.trim() };
        Object.keys(nf).forEach(k => { if (nf[k] === '' && !(k in f)) delete nf[k]; }); await write('Enrolment', () => sb.from('enrolments').update({ fields: nf }).eq('id', id).select('id')); }); };
  let enProg = '', enQ = '', enPage = 0;
  function applyEnrolments() {
    const d = P.data, lmap = new Map(d.learners.map(l => [l.id, l])), lname = id => { const l = lmap.get(id); return l ? lName(l) : 'Learner ' + id; };
    const pOf = id => d.progs.find(p => p.id === id), cOf = id => clientOf(id)?.client_name || '', rs = p => (window.dvApi && dvApi.runState) ? dvApi.runState(p) : 'Active';
    const anyE = new Set(d.enrol.map(e => e.learner_id));
    document.querySelector('#view-enrolments .count').textContent = d.learners.filter(l => !lTest(l) && !anyE.has(l.id)).length;
    const bt = document.querySelector('#view-enrolments .count + span b'); if (bt) bt.textContent = 'Learners not enrolled on any programme';
    const bs = document.querySelector('#view-enrolments .count + span .sub'); if (bs) bs.textContent = 'Enrol them on their programme, or check they are not duplicates. Learners on completed or planned programmes are not counted.';
    const dqa = document.querySelector('#view-enrolments a[href="#dq"]'); if (dqa) dqa.onclick = () => { window.dqSet && dqSet('Possible duplicate'); };
    const head = document.querySelector('#view-enrolments h1')?.parentElement; if (head && !$('enadd')) { head.querySelectorAll('button').forEach(b => b.remove()); head.insertAdjacentHTML('beforeend', '<button class="btn y" id="enadd" onclick="previewEnrolAdd()">+ Enrol learners</button>'); }
    const lab = document.querySelector('#view-enrolments label.f'); if (lab && !$('enq')) { lab.hidden = true; lab.insertAdjacentHTML('afterend', '<input type="search" id="enq" placeholder="Learner, client, #id or ID number" style="height:36px;min-width:260px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:var(--surface);color:var(--ink)" oninput="previewEnQ(this.value)">'); }
    if (!$('enpager')) document.querySelector('#view-enrolments .tw')?.insertAdjacentHTML('afterend', '<div id="enpager" style="display:flex;gap:8px;align-items:center;padding:10px 20px"></div>');
    if (!$('ennote')) document.querySelector('#view-enrolments .card:last-of-type')?.insertAdjacentHTML('afterend', '<p class="sub" id="ennote">Module results (knowledge, practical, workplace, moderation) are in <a href="#attendance" onclick="aTab=\'PoE tracker\'">Attendance &amp; PoE › PoE tracker</a>; exam results in <a href="#eisa" onclick="eTab=\'Exam results\'">EISA readiness › Exam results</a>.</p>');
    const dupKey = new Map(); d.enrol.forEach(e => { const k = e.learner_id + '|' + e.programme_id; dupKey.set(k, (dupKey.get(k) || 0) + 1); });
    // status shown = Withdrawn from the enrolment itself, otherwise the programme's run state
    const stOf = e => enSt(e) === 'Withdrawn' ? 'Withdrawn' : rs(pOf(e.programme_id));
    const ST = ['All', 'Active', 'Planned', 'Completed', 'Withdrawn'], SB = { Active: 'b-ok', Planned: 'b-n', Completed: 'b-n', Withdrawn: 'b-warn' };
    const grp = pid => { const p = pOf(pid); return '#' + pid + ' · ' + (cOf(pid) || 'No client') + ' · ' + (p?.programme_name || 'Programme ' + pid) + (p ? ' · ' + fmt(p.start_date) + ' – ' + fmt(p.end_date) : ''); };
    renderEn = function () {
      const base = d.enrol.filter(e => { const l = lmap.get(e.learner_id); return !l || !lTest(l); }), cnt = s => s === 'All' ? base.length : base.filter(e => stOf(e) === s).length;
      $('enfilter').innerHTML = ST.map(s => `<button class="${s === enF ? 'on' : ''}" onclick="enF='${s}';enPage=0;renderEn()">${s} <span class="sub">${cnt(s)}</span></button>`).join('');
      const q = enQ.toLowerCase().trim(), rows = base.filter(e => (enF === 'All' || stOf(e) === enF) && (!q || [lname(e.learner_id), cOf(e.programme_id), '#' + e.programme_id, pOf(e.programme_id)?.programme_name || '', lIdn(lmap.get(e.learner_id) || {})].join(' ').toLowerCase().includes(q)))
        .sort((a, b) => grp(a.programme_id).localeCompare(grp(b.programme_id)) || lname(a.learner_id).localeCompare(lname(b.learner_id)));
      const gc = {}; rows.forEach(e => { const g = grp(e.programme_id); gc[g] = (gc[g] || 0) + 1; });
      const PER = 25, pages = Math.max(1, Math.ceil(rows.length / PER)); if (enPage >= pages) enPage = pages - 1; const pg = rows.slice(enPage * PER, enPage * PER + PER);
      let last = '';
      $('enrows').innerHTML = pg.map(e => { const g = grp(e.programme_id), p = pOf(e.programme_id), l = lmap.get(e.learner_id), idn = l ? lIdn(l) : '', f = ef(e), s = stOf(e), ed = f['Enrolment Date'] || f['Date Enrolled'] || f['Enrolled Date'];
        const gh = g !== last ? UI.gh(esc(g), gc[g], 'var(--navy)', 5, esc(p?.project_manager_name || 'No PM')) : ''; last = g;
        const flags = (!idn ? `<span class="famflag" style="cursor:pointer" onclick="previewLearnerEdit(${e.learner_id})">No ID</span>` : !said(String(idn)) ? `<span class="famflag" style="cursor:pointer" onclick="previewLearnerEdit(${e.learner_id})">Invalid ID</span>` : '') + (dupKey.get(e.learner_id + '|' + e.programme_id) > 1 ? '<span class="famflag" style="background:var(--badbg,#fde8e8);color:var(--bad)">Enrolled twice</span>' : '');
        const sub = [f['Statement Status'] && 'Statement ' + f['Statement Status'], f['Funding Type'], f.Site, s === 'Withdrawn' && f['Withdrawal Reason'] && 'Withdrawn ' + fmt(f['Withdrawal Date']) + ': ' + f['Withdrawal Reason']].filter(Boolean).join(' · ');
        return gh + `<tr><td><a href="#learner/${e.learner_id}"><b>${esc(lname(e.learner_id))}</b></a>${flags}</td><td>${esc(cOf(e.programme_id) || 'No client')}<div class="sub">${esc(sub)}</div></td><td>${p ? fmt(p.start_date) + ' – ' + fmt(p.end_date) : ''}${ed ? `<div class="sub">Enrolled ${fmt(ed)}</div>` : ''}</td><td><span class="badge ${SB[s] || 'b-n'}">${esc(s)}</span></td><td style="text-align:right;white-space:nowrap"><button class="btn sm" onclick="previewEnrolEdit(${e.id})">Edit</button>${s !== 'Withdrawn' ? ` <button class="btn sm" onclick="previewEnrolWithdraw(${e.id})">Withdraw</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="sub">No enrolments match.</td></tr>';
      $('enpager').innerHTML = `<span class="sub" style="flex-grow:1">Showing ${rows.length ? enPage * PER + 1 : 0}–${enPage * PER + pg.length} of ${rows.length}</span>${pages > 1 ? `<button class="btn sm" ${enPage ? '' : 'disabled'} onclick="enPage--;renderEn()">Previous</button><button class="btn sm" ${enPage < pages - 1 ? '' : 'disabled'} onclick="enPage++;renderEn()">Next</button>` : ''}`;
    };
    if (!ST.includes(enF)) enF = 'All';
    renderEn();
  }
  window.previewEnrolWithdraw = id => { const e = P.data.enrol.find(x => x.id === id); if (!e) return; const f = ef(e), l = P.data.learners.find(x => x.id === e.learner_id);
    dlg('ewform', 'Withdraw learner', `<p><b>${esc(l ? lName(l) : 'Learner')}</b> · ${esc(progName(e.programme_id))}</p><p class="sub">Only this enrolment is marked Withdrawn. The learner record stays.</p><div class="qagrid"><label>Withdrawal date *<input type="date" name="wd" required value="${new Date().toISOString().slice(0, 10)}"></label><label>Reason *<input name="wr" required placeholder="e.g. resigned, found employment, medical"></label></div>`,
      async el => { const nf = Object.assign({}, f, { Status: 'Withdrawn', 'Withdrawal Date': el.wd.value, 'Withdrawal Reason': el.wr.value.trim() }); if (!nf['Withdrawal Reason']) throw new Error('Reason is required.');
        await write('Enrolment', () => sb.from('enrolments').update({ fields: nf }).eq('id', id).select('id')); }, 'Withdraw'); };
  window.previewEnQ = v => { enQ = v || ''; enPage = 0; renderEn(); };

  /* ---------- QCTO tracker (writes) ---------- */
  function applyTracker() {
    const d = P.data; QCO.length = 0; QT.length = 0;
    const ps = [...new Set(d.tracker.map(r => r.programme_id))];
    ps.forEach(pid => { const p = d.progs.find(x => x.id === pid) || {}; const fac = d.assessors.find(a => a.id === p.facilitator_id);
      QCO.push({ c: clientOf(pid)?.client_name || '', pm: p.project_manager_name || '', f: fac?.full_name || '', a: '', p: (() => { const nm = (p.programme_name || '').trim(), sq = String(p.saqa_id || '').replace(/^SP:/i, '').trim(); return (sq && !nm.includes(sq) ? sq + ' - ' : '') + nm + (p.nqf_level && !/NQF/i.test(nm) ? ' NQF ' + p.nqf_level : ''); })(), d: '', s: p.start_date, e: p.end_date }); });
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
  let dqT = '', dqQ = '';
  const DQK = g => g.decided ? 'Decided' : g.issue === 'possible_duplicate' ? 'Possible duplicate' : g.issue === 'invalid_id' ? 'Invalid ID' : 'No ID';
  const DQDEC = { needs_fix: ['b-warn', 'Sent to PM'], not_duplicate: ['b-ok', 'Different people'], quarantined: ['b-n', 'Quarantined'], reviewed_ok: ['b-ok', 'Reviewed OK'], merge: ['b-warn', 'Merge requested'] };
  window.dqTile = t => { dqT = dqT === t ? '' : t; renderDQ(); }; window.dqSet = t => { dqT = t; };
  window.dqSearch = v => { dqQ = v.toLowerCase(); renderDQ(); };
  renderDQ = function () {
    if (!isAdmin()) { $('dqlist').innerHTML = '<div class="empty"><b>Admins only</b><span>Data quality review needs the admin role.</span></div>'; $('dqkpis').innerHTML = ''; $('dqfilter').innerHTML = ''; return; }
    const HT = { 'No ID': 'ID number is blank', 'Invalid ID': 'Fails the SA ID check (length, date or checksum)', 'Possible duplicate': 'Same ID or name as another learner', Decided: 'Already reviewed' };
    $('dqkpis').innerHTML = ['No ID', 'Invalid ID', 'Possible duplicate', 'Decided'].map(t => `<div class="kpi" style="cursor:pointer;${dqT === t ? 'outline:2px solid var(--navy)' : ''}" title="${HT[t]}" onclick="dqTile('${t}')"><span class="l">${t}</span><span class="v">${DQG.filter(g => DQK(g) === t).length}</span><span class="sub">${HT[t]}</span></div>`).join('');
    if (!$('dqq')) $('dqfilter').innerHTML = `<input id="dqq" placeholder="Search learner, client, programme or #id" style="flex:1 1 320px" oninput="dqSearch(this.value)">`;
    const L = id => LEARNERS.find(x => x.lid === id) || {}, pOf = id => P.data.progs.find(p => p.id === id);
    const items = DQG.map((g, gi) => { const l = L(g.a[0].learner_id), pr = l.pid ? pOf(l.pid) : null;
      const key = l.pid ? '#' + l.pid + ' · ' + (clientOf(l.pid)?.client_name || 'No client') + ' · ' + (pr?.programme_name || '') : 'Not enrolled';
      return { g, gi, l, key, pm: pr ? (pr.project_manager_name || 'No PM') : '' }; })
      .filter(x => dqT ? DQK(x.g) === dqT : !x.g.decided)
      .filter(x => !dqQ || (x.g.n + ' ' + x.key).toLowerCase().includes(dqQ))
      .sort((x, y) => (x.key === 'Not enrolled') - (y.key === 'Not enrolled') || x.key.localeCompare(y.key) || x.g.n.localeCompare(y.g.n));
    window.DQX = items; let last = null;
    $('dqlist').innerHTML = items.map(({ g, gi, l, key, pm }) => { const n = items.filter(x => x.key === key).length;
      const gh = key !== last ? `<div class="pickgh dqgh"><b>${esc(key)}</b> <span class="sub">${n} · ${l.pid ? 'PM: ' + esc(pm) : 'no programme'}</span></div>` : ''; last = key;
      const dec = g.decided ? DQDEC[g.decided] || ['b-n', g.decided] : null, lid = g.a[0].learner_id;
      return gh + `<div class="dqpair pick"><div class="who"><div style="display:flex;gap:8px;align-items:center"><a href="#learner/${lid}"><b>${esc(g.n)}</b></a><span class="badge ${g.issue === 'possible_duplicate' ? 'b-warn' : 'b-bad'}">${g.issue === 'possible_duplicate' ? 'Possible duplicate' : g.issue === 'invalid_id' ? 'Invalid ID' : 'No ID'}</span></div>
      ${g.a.map(r => `<div class="sub">${r.id_number_masked && g.issue !== 'missing_id' ? 'ID ' + r.id_number_masked + ' · ' : ''}${r.enrolment_count ? esc(r.programmes || '') : 'Not enrolled'}</div>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${dec ? `<span class="badge ${dec[0]}">${dec[1]}</span>` : ''}${g.issue === 'possible_duplicate'
        ? (dec ? '' : `<button class="btn sm" onclick="previewDQ(${gi},'merge')">Same person</button><button class="btn sm" onclick="previewDQ(${gi},'not_duplicate')">Different people</button><button class="btn sm" style="color:var(--bad)" onclick="previewDQ(${gi},'quarantined')">Quarantine</button>`)
        : `<button class="btn sm y" onclick="previewLearnerEdit(${lid})">Add SA ID</button>${dec ? '' : `<button class="btn sm" title="Flag for the PM; the My work task closes when the ID is captured" onclick="previewDQ(${gi},'needs_fix')">Send to PM</button>`}`}</div></div>`; }).join('') || '<div class="empty"><b>Nothing to review here</b></div>';
    $('dqpager').innerHTML = ''; if (window.apxPgIn) apxPgIn($('dqlist'), dqT + '|' + dqQ, 25);
  };
  window.dqExport = () => { const rows = [['Learner', 'Issue', 'Programme', 'PM', 'Decision']].concat((window.DQX || []).map(x => [x.g.n, DQK(x.g) === 'Decided' ? x.g.issue : DQK(x.g), x.key, x.pm, x.g.decided || ''])); const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'data-quality-review.csv'; a.click(); };
  window.apxSaid = id => said(id);
  window.previewDQ = async function (gi, decision) {
    const g = DQG[gi];
    if (decision === 'merge') { await write('Merge request', () => sb.rpc('request_learner_merge', { p_learner_ids: g.a.map(r => r.learner_id), p_note: 'From preview Data quality' })); toast('Merge request sent to the Sign-off queue'); }
    else await write('Review', () => sb.from('learner_quality_reviews').insert(g.a.map(r => ({ tenant_id: P.tenant, learner_id: r.learner_id, issue: r.issue, decision, reviewed_by: P.user.email }))));
    await loadAll(); renderDQ();
  };

  /* ---------- Sign-off queue (writes via RPC; admin only) ---------- */
  function applySignoff() {
    SO.length = 0; Object.keys(SOD).forEach(k => delete SOD[k]);
    P.data.signoffs.forEach(s => { SO.push([String(s.id), s.kind, s.title, s.detail || '', s.ref_table === 'learners' ? '#dq' : s.ref_table === 'recommendations' ? '#recs' : s.ref_table === 'monitoring_visits' ? '#visit/' + s.ref_id : '#signoff', s.submitted_by || '', fmt(s.created_at)]);
      if (s.status !== 'waiting') SOD[String(s.id)] = { s: s.status, t: fmt(s.decided_at), c: s.comment || '' }; });
  }
  soItems = () => SO;
  soAct = async function (i, s) {
    if (!isAdmin()) { toast('Only an admin can sign off'); return; }
    const id = +SO[i][0], c = s === 'returned' ? ($('socmt')?.value || '').trim() : null;
    try { await write('Sign-off', () => sb.rpc('signoff_decide', { p_id: id, p_decision: s || 'waiting', p_comment: c })); soOpen = null; await loadAll(); renderSO(); }
    catch (e) {}
  };

  /* ---------- Monitoring visits: list, add, full edit, print (same fields as the old app) ---------- */
  // fields jsonb keys: 'Visit ID','Date of Visit',Venue,'QCTO Personnel',Programme ["<id>"],'Programme Name',KMA1..KMA6 ("1".."4", KMA6 may be "N/A"),
  // 'Overall Judgment','EISA Readiness','Logbook Status','Next Monitoring Date' (older rows: 'Next Visit Date'),'Learners Enrolled','Learners on Course for EISA',
  // Dropouts,'Dropout Reasons','Special Needs Count','Knowledge Facilitator','Practical Facilitator','Workplace Mentor','MOU Signed','Visit Notes'
  const VKMA = ['Programme Implementation', 'Human Resources', 'Assessment Strategy', 'Progress on Implementation', 'General Responsiveness', 'E-learning'];
  const VDROP = ['Employment Secured', 'Relocated', 'Financial Constraints', 'Health/Medical', 'Family/Personal', 'Academic Performance', 'Disciplinary', 'Lost Interest', 'Transport Issues', 'Other'];
  let vFilt = 'All', vCur = null, vView = 'By status';
  const vF = v => v.fields || {};
  const vDate = d => { const t = d && new Date(d); return t && !isNaN(t) ? t.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const vProg = v => v.programme_id || +((vF(v).Programme || [])[0]) || null;
  const vLabel = v => vF(v)['Visit ID'] || 'VIS-' + String(v.id).padStart(3, '0');
  const vNext = v => vF(v)['Next Monitoring Date'] || vF(v)['Next Visit Date'] || '';
  const vJudge = j => j ? { 4: 'b-ok', 3: 'b-ok', 2: 'b-warn', 1: 'b-bad' }[+j] || 'b-n' : 'b-n';
  let vScope = 'Running', vQ = '', vPg = 0, vKey = '';
  window.previewVisitView = o => { vScope = o; vPg = 0; applyVisits(); };
  window.previewVisitQ = s => { vQ = s; vPg = 0; applyVisits(); setTimeout(() => { const i = $('vq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); };
  window.previewVisitPg = n => { vPg = n; applyVisits(); };
  function applyVisits() {
    const today = new Date().toISOString().slice(0, 10), d30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), rs = p => (window.dvApi?.runState || (() => 'Active'))(p);
    const head = document.querySelector('#view-visits h1')?.parentElement; const btn = head?.querySelector('button'); if (btn) { btn.textContent = '+ Add visit'; btn.onclick = () => previewVisitAdd(); btn.removeAttribute('onclick'); }
    const vd = v => String(vF(v)['Date of Visit'] || vF(v).Date || ''), byP = {};
    P.data.visits.slice().sort((a, b) => vd(b).localeCompare(vd(a))).forEach(v => { const k = vProg(v) || 0; (byP[k] = byP[k] || []).push(v); });
    const openRecs = id => P.data.recs.filter(r => !r.resolved && (r.fields?.Visit || []).map(String).includes(String(id))).length;
    const cl = id => (P.data.clients || []).find(c => c.id === id)?.client_name || '';
    const mine = p => !window.apxMineProg || apxMineProg(p);
    const progs = P.data.progs.filter(p => !p.deleted_at && mine(p));
    const FK = { od: ['Overdue', 'Next visit date has passed', 'var(--bad)'], due: ['Due in 30 days', 'Next visit within 30 days', 'var(--warn)'], none: ['Running with no visit', 'Running programme, no visit recorded', 'var(--bad)'], low: ['Low score', 'Latest visit judged 1 or 2', 'var(--bad)'], rec: ['Open recommendations', 'Unresolved recommendations from its visits', 'var(--warn)'] };
    const info = p => { const vs = byP[p.id] || [], L = vs[0], nx = L ? vNext(L) : '', st = rs(p), fl = [];
      if (L && nx && nx < today && st !== 'Completed') fl.push('od'); else if (L && nx && nx <= d30 && st !== 'Completed') fl.push('due');
      if (!L && st === 'Active') fl.push('none'); if (L && +vF(L)['Overall Judgment'] && +vF(L)['Overall Judgment'] <= 2) fl.push('low');
      if (vs.some(v => openRecs(v.id))) fl.push('rec'); return { p, vs, L, nx, st, fl }; };
    const all = progs.map(info), scoped = all.filter(x => vScope === 'All' || (vScope === 'Running' ? x.st === 'Active' : x.st === 'Completed'));
    const cnt = k => all.filter(x => x.fl.includes(k)).length;
    $('vkpis').className = 'famtiles';
    const vt = k => [FK[k][0], cnt(k), cnt(k) ? FK[k][2] : 'var(--muted)', vFilt === k, `previewVisitFilter('${vFilt === k ? 'All' : k}')`, FK[k][1]];
    const nv = P.data.visits.filter(v => !vProg(v) || progs.some(p => p.id === vProg(v))).length;
    $('vkpis').innerHTML = UI.tiles([{ t: 'Visits due', k: [vt('od'), vt('due'), vt('none')] }, { t: 'Follow-up', k: [vt('low'), vt('rec'), ['Visits recorded', nv, 'var(--muted)', false, '', 'All monitoring visits on record']] }]);
    const showPers = P.data.visits.some(v => (vF(v)['QCTO Personnel'] || '').trim()), cols = showPers ? 6 : 5;
    const th = $('vrows').closest('table').querySelector('thead tr'); if (th) th.innerHTML = '<th>Visit</th><th>Venue</th><th>Date</th>' + (showPers ? '<th>QCTO personnel</th>' : '') + '<th>Judgement</th><th>Next visit</th>';
    const tb = $('vfilter').parentElement; if (tb.className !== 'famtool') { tb.className = 'famtool'; tb.removeAttribute('style'); $('vfilter').removeAttribute('style'); $('vfilter').className = ''; }
    const sc = k => all.filter(x => k === 'All' || (k === 'Running' ? x.st === 'Active' : x.st === 'Completed')).length;
    $('vfilter').innerHTML = UI.seg(['Running', 'Completed', 'All'], vScope, o => `previewVisitView('${o}')`).replace(/>(Running|Completed|All)</g, (m, o) => `>${o} (${sc(o)})<`) + `<input id="vq" type="search" placeholder="Search #id, client, programme, venue" value="${esc(vQ)}" oninput="previewVisitQ(this.value)" style="flex:1 1 240px;max-width:340px;margin-left:10px">`;
    const q = vQ.trim().toLowerCase();
    let list = (vFilt !== 'All' ? all.filter(x => x.fl.includes(vFilt)) : scoped.filter(x => x.vs.length || x.fl.includes('none')))
      .filter(x => !q || ['#' + x.p.id, cl(x.p.client_id), x.p.programme_name, ...x.vs.map(v => vF(v).Venue), ...x.vs.map(vLabel)].join(' ').toLowerCase().includes(q));
    const pri = x => ['od', 'low', 'due', 'rec'].map(k => x.fl.includes(k)).indexOf(true) >>> 0, rank = x => x.vs.length ? pri(x) : 1e10;
    list.sort((a, b) => rank(a) - rank(b) || (a.nx || '9').localeCompare(b.nx || '9') || cl(a.p.client_id).localeCompare(cl(b.p.client_id)) || a.p.id - b.p.id);
    const key = vScope + '|' + vFilt + '|' + q; if (key !== vKey) { vKey = key; vPg = 0; }
    const PER = 25, pages = Math.max(1, Math.ceil(list.length / PER)); if (vPg >= pages) vPg = pages - 1;
    const dt = p => [p.start_date, p.end_date].map(x => x ? vDate(x) : '?').join(' – ');
    $('vrows').innerHTML = list.slice(vPg * PER, vPg * PER + PER).map(x => { const p = x.p;
      const gh = UI.gh(`<a href="#programmes" onclick="event.stopPropagation();window.dvProg&&dvProg(${p.id})" style="color:inherit">#${esc(p.display_id || p.id)}</a> · ${esc(cl(p.client_id))} · ${esc(p.programme_name || '')} · ${dt(p)}`, x.vs.length, x.fl.length ? FK[x.fl[0]][2] : 'var(--ok)', cols,
        [x.st === 'Active' ? 'Running' : x.st, p.project_manager_name || 'No PM', ...x.fl.map(k => FK[k][0])].map(esc).join(' · '));
      if (!x.vs.length) return gh + `<tr><td colspan="${cols}"><span class="sub">No visit recorded.</span> <button class="btn sm" onclick="previewVisitAdd(${p.id})">+ Add visit</button></td></tr>`;
      return gh + x.vs.map((v, i) => { const f = vF(v), nx = vNext(v), late = i === 0 && nx && nx < today && x.st !== 'Completed', soon = i === 0 && !late && nx && nx <= d30 && x.st !== 'Completed', orc = openRecs(v.id);
        return `<tr class="famtr" onclick="previewOpenVisit(${v.id})"${i ? ' style="opacity:.7"' : ''}><td><a href="#visit/${v.id}" onclick="event.stopPropagation();previewOpenVisit(${v.id});return false" style="font-weight:700;color:var(--navy)">${esc(vLabel(v))}</a>${i ? '<div class="sub">Earlier visit</div>' : ''}</td><td>${esc(f.Venue || '—')}</td><td>${vDate(vd(v))}</td>${showPers ? `<td>${esc(f['QCTO Personnel'] || '—')}</td>` : ''}
        <td>${f['Overall Judgment'] ? `<span class="badge ${vJudge(f['Overall Judgment'])}">${esc(f['Overall Judgment'])} / 4</span>` : '<span class="sub">Not scored</span>'}</td>
        <td>${nx ? (i ? `<span class="sub">Next ${vDate(nx)}</span>` : `<span style="${late ? 'color:var(--bad);font-weight:600' : soon ? 'color:var(--warn);font-weight:600' : ''}">${late ? 'Overdue · ' : ''}Next ${vDate(nx)}</span>`) : '<span class="sub">No next date</span>'}${orc ? `<div class="sub">${orc} open recommendation${orc > 1 ? 's' : ''}</div>` : ''}</td></tr>`; }).join(''); }).join('') || `<tr><td colspan="${cols}" class="sub">Nothing here</td></tr>`;
    let pager = $('vpager'); if (!pager) { $('vrows').closest('.tw').insertAdjacentHTML('afterend', '<div id="vpager" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 20px"></div>'); pager = $('vpager'); }
    pager.innerHTML = pages > 1 ? `<span class="sub">${list.length} programmes · page ${vPg + 1} of ${pages}</span><button class="btn sm" ${vPg ? '' : 'disabled'} onclick="previewVisitPg(${vPg - 1})">‹ Prev</button><button class="btn sm" ${vPg < pages - 1 ? '' : 'disabled'} onclick="previewVisitPg(${vPg + 1})">Next ›</button>` : '';
    if (location.hash.startsWith('#visit/')) renderVisit(+location.hash.split('/')[1]);
  }
  window.previewVisitFilter = s => { vFilt = s; applyVisits(); };
  window.previewOpenVisit = function (id) { location.hash = 'visit/' + id; setTimeout(() => renderVisit(id), 0); };
  addEventListener('hashchange', () => { if (location.hash.startsWith('#visit/')) renderVisit(+location.hash.split('/')[1]); });
  function renderVisit(id) {
    const v = P.data.visits.find(x => x.id === id), box = $('view-visit'); if (!box) return;
    if (!v) { box.innerHTML = '<a class="back" href="#visits">← All visits</a><p class="sub">Visit not found.</p>'; return; }
    vCur = v; try { ROUTES.visit[0] = vLabel(v); } catch (_) {}
    const f = vF(v), o = (list, val) => `<option value="">—</option>` + (val && !list.includes(String(val)) ? [String(val), ...list] : list).map(x => `<option ${String(val) === x ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const inp = (n, l, val, t = 'text') => `<label>${l}<input name="${n}" type="${t}" value="${esc(val ?? '')}"></label>`;
    const progs = P.data.progs.slice().sort((a, b) => String(a.programme_name || '').localeCompare(String(b.programme_name || '')));
    const recs = P.data.recs.filter(r => (r.fields?.Visit || []).map(String).includes(String(v.id)));
    box.innerHTML = `<a class="back" href="#visits">← All visits</a>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><h1 style="font-size:26px;flex-grow:1">${esc(vLabel(v))} · ${esc(vProg(v) ? progName(vProg(v)) : 'No programme')}${vProg(v) ? `<div class="sub" style="font-size:14px;font-weight:400"><a href="#programmes" onclick="window.dvProg&&dvProg(${vProg(v)})" style="color:var(--navy);font-weight:600">#${vProg(v)}</a> · ${esc((P.data.clients || []).find(c => c.id === (P.data.progs.find(p => p.id === vProg(v)) || {}).client_id)?.client_name || '')}</div>` : ''}</h1><button class="btn" onclick="previewVisitAI(${v.id})">✨ AI report</button><button class="btn" onclick="previewVisitPrint(${v.id})">Print report</button>${(() => { const so = vF(v)['Sign-off']; return so === 'Signed off' ? `<span class="badge b-ok">Signed off</span>` : so === 'Submitted' ? `<button class="btn" disabled title="Waiting in the Sign-off queue">Awaiting sign-off</button>` : `<button class="btn" onclick="previewVisitSignoff(${v.id})">${so === 'Returned' ? 'Resubmit for sign-off' : 'Submit for sign-off'}</button>`; })()}<button class="btn y" form="vform">Save visit</button></div>
      <form id="vform" class="card vform" style="display:flex;flex-direction:column;gap:14px">
        <h2 style="font-size:15px">Visit</h2><div class="qagrid">${inp('date', 'Date of visit', f['Date of Visit'], 'date')}<label>Programme<select name="prog"><option value="">—</option>${progs.map(p => `<option value="${p.id}" ${p.id === vProg(v) ? 'selected' : ''}>${esc(p.programme_name || 'Programme ' + p.id)}</option>`).join('')}</select></label>${inp('venue', 'Venue', f.Venue)}${inp('pers', 'QCTO personnel', f['QCTO Personnel'])}</div>
        <h2 style="font-size:15px">Key monitoring areas (1 = Not yet adequate … 4 = Exceeds)</h2><div class="qagrid">${VKMA.map((l, i) => `<label>KMA${i + 1} · ${l}<select name="KMA${i + 1}">${o(i === 5 ? ['1', '2', '3', '4', 'N/A'] : ['1', '2', '3', '4'], f['KMA' + (i + 1)])}</select></label>`).join('')}
          <label><b>Overall judgement</b><select name="overall">${o(['1', '2', '3', '4'], f['Overall Judgment'])}</select></label></div>
        <h2 style="font-size:15px">Learners and readiness</h2><div class="qagrid">${inp('enrolled', 'Learners enrolled', f['Learners Enrolled'], 'number')}${inp('oneisa', 'On course for EISA', f['Learners on Course for EISA'], 'number')}${inp('drop', 'Dropouts', f.Dropouts, 'number')}<label>Dropout reasons<select name="dropwhy">${o(VDROP, f['Dropout Reasons'])}</select></label>${inp('special', 'Special needs count', f['Special Needs Count'], 'number')}
          <label>EISA readiness<select name="eisa">${o(['Ready', 'Not Ready', 'In Progress'], f['EISA Readiness'])}</select></label><label>Logbook status<select name="logbook">${o(['Signed', 'Not Signed', 'Partial'], f['Logbook Status'])}</select></label>${inp('next', 'Next monitoring date', vNext(v), 'date')}</div>
        <h2 style="font-size:15px">People</h2><div class="qagrid">${inp('kf', 'Knowledge facilitator', f['Knowledge Facilitator'])}${inp('pf', 'Practical facilitator', f['Practical Facilitator'])}${inp('wm', 'Workplace mentor', f['Workplace Mentor'])}<label style="flex-direction:row;align-items:center;gap:8px;margin-top:18px"><input name="mou" type="checkbox" style="height:auto" ${f['MOU Signed'] ? 'checked' : ''}> MOU signed</label></div>
        <label>Visit notes<textarea name="notes" rows="4" style="border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;background:transparent;color:var(--ink)">${esc(f['Visit Notes'] || '')}</textarea></label>
        <div class="sub" id="verr" style="color:var(--bad)"></div></form>
      <section class="card" style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:8px"><h2 style="flex-grow:1;font-size:15px">Recommendations from this visit (${recs.length})</h2><button class="btn sm" onclick="previewRecAI(${v.id})">✨ Suggest</button><button class="btn sm y" onclick="previewRecAdd(${v.id})">+ Add</button></div>
        ${recs.map(r => `<div style="display:flex;gap:8px;align-items:baseline"><span class="badge ${r.resolved ? 'b-ok' : 'b-warn'}">${r.resolved ? 'Resolved' : 'Open'}</span><span style="flex-grow:1">${esc(r.fields?.Text || '')}<span class="sub"> · ${esc(r.fields?.Owner || 'No owner')}${r.fields?.['Due Date'] ? ' · due ' + vDate(r.fields['Due Date']) : ''}</span></span><button class="btn sm" onclick="previewRecEdit(${r.id})">Edit</button></div>`).join('') || '<p class="sub">None yet.</p>'}</section>`;
    if (!$('vformcss')) document.head.insertAdjacentHTML('beforeend', '<style id="vformcss">.vform .qagrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.vform label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}.vform input,.vform select{height:36px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:transparent;color:var(--ink)}</style>');
    $('vform').onsubmit = async ev => {
      ev.preventDefault(); const el = $('vform').elements, val = n => el[n].value.trim(), num = n => val(n) === '' ? null : +val(n);
      if (val('date') && val('next') && val('next') <= val('date')) { $('verr').textContent = 'Next monitoring date must be after the visit date.'; return; }
      const nf = { ...f, 'Date of Visit': val('date') || null, Venue: val('venue') || null, 'QCTO Personnel': val('pers') || null, 'Overall Judgment': val('overall') || null, 'EISA Readiness': val('eisa') || null, 'Logbook Status': val('logbook') || null,
        'Next Monitoring Date': val('next') || null, 'Next Visit Date': val('next') || null, 'Learners Enrolled': num('enrolled'), 'Learners on Course for EISA': num('oneisa'), Dropouts: num('drop'), 'Dropout Reasons': val('dropwhy') || null, 'Special Needs Count': num('special'),
        'Knowledge Facilitator': val('kf') || null, 'Practical Facilitator': val('pf') || null, 'Workplace Mentor': val('wm') || null, 'MOU Signed': el.mou.checked, 'Visit Notes': val('notes') || null, Programme: val('prog') ? [val('prog')] : [] };
      VKMA.forEach((_, i) => { nf['KMA' + (i + 1)] = val('KMA' + (i + 1)) || null; });
      Object.keys(nf).forEach(k => { if (nf[k] === null) delete nf[k]; });
      try { await write('Visit', () => sb.from('monitoring_visits').update({ fields: nf, programme_id: val('prog') ? +val('prog') : null }).eq('id', v.id).select('id')); toast2('Visit saved'); await loadAll(); } catch (err) { $('verr').textContent = err.message || String(err); }
    };
  }
  const toast2 = m => { try { const t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1600); } catch (_) {} };
  window.previewVisitAdd = pre => {
    const cn = id => (P.data.clients || []).find(c => c.id === id)?.client_name || '', progs = P.data.progs.filter(p => !p.deleted_at && (!window.apxMineProg || apxMineProg(p))).sort((a, b) => cn(a.client_id).localeCompare(cn(b.client_id)) || a.id - b.id);
    document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="Add visit"><form class="card" id="vaform"><h2>Add monitoring visit</h2><div class="qagrid">
      <label>Programme *<select name="prog" required><option value="">—</option>${progs.map(p => `<option value="${p.id}" ${+pre === p.id ? 'selected' : ''}>#${esc(p.display_id || p.id)} · ${esc(cn(p.client_id))} · ${esc(p.programme_name || 'Programme ' + p.id)}</option>`).join('')}</select></label><label>Date of visit *<input name="date" type="date" required></label><label>Venue<input name="venue"></label><label>QCTO personnel<input name="pers"></label></div>
      <div class="sub" id="vaerr" style="color:var(--bad)"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" onclick="document.getElementById('famov').remove()">Cancel</button><button class="btn y">Save</button></form></div>`);
    $('vaform').onsubmit = async ev => {
      ev.preventDefault(); const el = $('vaform').elements, prog = el.prog.value, date = el.date.value;
      if (date > new Date().toISOString().slice(0, 10) && !confirm('The visit date is in the future. Add it anyway?')) return;
      if (P.data.visits.some(v => String(vProg(v)) === prog && vF(v)['Date of Visit'] === date) && !confirm('A visit for this programme on this date already exists. Add anyway?')) return;
      const nums = P.data.visits.map(v => vF(v)['Visit ID'] || '').filter(x => /^VIS-\d+$/.test(x)).map(x => +x.slice(4)), nextId = 'VIS-' + String((nums.length ? Math.max(...nums) : P.data.visits.length) + 1).padStart(3, '0');
      const p = P.data.progs.find(x => String(x.id) === prog);
      const fields = { 'Visit ID': nextId, Programme: [prog], 'Programme Name': p ? [p.programme_name] : [], 'Date of Visit': date }; if (el.venue.value.trim()) fields.Venue = el.venue.value.trim(); if (el.pers.value.trim()) fields['QCTO Personnel'] = el.pers.value.trim();
      try { if (!P.tenant) throw new Error('No tenant on your account.'); const r = await write('Visit', () => sb.from('monitoring_visits').insert({ tenant_id: P.tenant, programme_id: +prog, fields }).select('id')); $('famov').remove(); await loadAll(); if (r?.[0]?.id) previewOpenVisit(r[0].id); }
      catch (err) { $('vaerr').textContent = err.message || String(err); }
    };
  };
  /* AI helpers: all use the ai-generate Edge Function (same types as the old app); the server builds the text from saved data. */
  const aiCall = async body => {
    const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 45000);
    try {
      const { data } = await sb.auth.getSession(); const tok = data.session && data.session.access_token; if (!tok) throw new Error('Not signed in. Please sign in again.');
      const res = await fetch(sb.supabaseUrl + '/functions/v1/ai-generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body), signal: ctrl.signal });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(res.status === 401 ? 'Not authorised to use AI features. Please sign in again.' : (j && j.error) || res.statusText || 'AI request failed');
      return j;
    } catch (e) { throw e.name === 'AbortError' ? new Error('it took too long, please try again.') : e; }
    finally { clearTimeout(tm); }
  };
  const aiBox = title => { lCss(); document.getElementById('famov')?.remove(); document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="card" style="max-width:760px;width:100%;max-height:85vh;display:flex;flex-direction:column;gap:10px"><h2>${esc(title)}</h2>
      <div id="aivr" class="sub" style="white-space:pre-wrap;overflow:auto;flex:1;color:var(--ink)">Generating… (up to 45 seconds)</div><div class="sub" style="font-size:12px">AI draft from saved data. Check it before you use it.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="aivrcopy" disabled>Copy</button><button class="btn y" onclick="document.getElementById('famov').remove()">Close</button></div></div></div>`); return $('aivr'); };
  window.previewAI = async (title, body, key) => {
    const out = aiBox(title);
    try {
      const j = await aiCall(body), txt = String(j[key] || '').trim(); if (!out.isConnected) return;
      const un = j.fact_check && j.fact_check.unverified_numbers;
      out.textContent = (txt || '(No text returned)') + (un && un.length ? '\n\n⚠ Check these numbers, they could not be matched to the data: ' + un.join(', ') : '');
      const c = $('aivrcopy'); if (txt) { c.disabled = false; c.onclick = () => navigator.clipboard.writeText(txt).then(() => toast('Copied'), () => toast('Copy failed')); }
    } catch (e) { if (out.isConnected) out.textContent = 'Could not generate: ' + e.message; }
  };
  window.previewVisitAI = id => previewAI('AI visit report', { type: 'visit_report', visit_id: Number(id) }, 'report');
  window.previewLearnerAI = id => previewAI('AI learner progress', { type: 'learner_progress', learner_id: Number(id) }, 'narrative');
  window.previewProgAI = id => previewAI('AI programme summary', { type: 'programme_summary', programme_id: Number(id) }, 'narrative');
  /* Suggest recommendations: one AI draft per key monitoring area scored 1 or 2 on the saved visit; "Use" opens the + Add form pre-filled. */
  window.previewRecAI = async visitId => {
    const v = P.data.visits.find(x => x.id === visitId); if (!v) return; const f = vF(v);
    const low = VKMA.map((l, i) => ({ k: 'KMA' + (i + 1), l, s: Number(f['KMA' + (i + 1)]) })).filter(x => x.s === 1 || x.s === 2);
    if (!low.length) return toast('No monitoring area is scored 1 or 2 on the saved visit, so nothing needs a recommendation.');
    const out = aiBox('Suggested recommendations'); out.style.whiteSpace = 'normal';
    const rs = await Promise.all(low.map(x => aiCall({ type: 'recommendation_draft', visit_id: Number(visitId), kma_domain: x.k, score: x.s }).then(j => ({ x, t: String(j.draft || '').trim() }), e => ({ x, err: e.message }))));
    if (!out.isConnected) return; window.__recAI = rs.map(r => r.t || '');
    out.innerHTML = rs.map((r, i) => `<div class="card" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"><b>${r.x.k} · ${esc(r.x.l)} (scored ${r.x.s})</b><div style="white-space:pre-wrap">${esc(r.t || 'Could not generate: ' + (r.err || 'no text'))}</div>${r.t ? `<div><button class="btn sm y" onclick="previewRecUseAI(${visitId},${i})">Use</button></div>` : ''}</div>`).join('');
  };
  window.previewRecUseAI = (visitId, i) => { const t = (window.__recAI || [])[i]; document.getElementById('famov')?.remove(); previewRecAdd(visitId); const el = $('recform')?.elements; if (el && t) el.Text.value = t; };
  window.previewVisitSignoff = async id => { try { await write('Visit', () => sb.rpc('request_visit_signoff', { p_id: id, p_note: null })); toast('Sent to the Sign-off queue.'); await loadAll(); renderVisit(id); } catch (err) { toast(err.message || String(err)); } };
  window.previewVisitPrint = id => {
    const v = P.data.visits.find(x => x.id === id); if (!v) return; const f = vF(v), w = window.open('', '_blank'); if (!w) return;
    const row = (k, val) => val || val === 0 ? `<tr><th>${k}</th><td>${esc(String(val))}</td></tr>` : '';
    const recs = P.data.recs.filter(r => (r.fields?.Visit || []).map(String).includes(String(v.id)));
    w.document.write(`<!doctype html><title>${esc(vLabel(v))}</title><style>body{font:14px system-ui,sans-serif;color:#111;margin:32px;max-width:800px}h1{color:#25247B;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{width:40%;background:#f4f4f8}.k{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.k div{border:1px solid #ccc;padding:8px;border-radius:6px}.k b{font-size:22px;display:block;color:#25247B}</style>
      <h1>Monitoring visit report · ${esc(vLabel(v))}</h1><div>${esc(vProg(v) ? progName(vProg(v)) : '')} · ${vDate(f['Date of Visit'])}</div>
      <h2>Key monitoring areas</h2><div class="k">${VKMA.map((l, i) => `<div><b>${esc(f['KMA' + (i + 1)] || '—')}</b>KMA${i + 1} · ${l}</div>`).join('')}</div>
      <table>${row('Overall judgement (1–4)', f['Overall Judgment'])}${row('Venue', f.Venue)}${row('QCTO personnel', f['QCTO Personnel'])}${row('Learners enrolled', f['Learners Enrolled'])}${row('On course for EISA', f['Learners on Course for EISA'])}${row('Dropouts', f.Dropouts)}${row('Dropout reasons', f['Dropout Reasons'])}${row('Special needs count', f['Special Needs Count'])}${row('EISA readiness', f['EISA Readiness'])}${row('Logbook status', f['Logbook Status'])}${row('Next monitoring date', vDate(vNext(v)))}${row('Knowledge facilitator', f['Knowledge Facilitator'])}${row('Practical facilitator', f['Practical Facilitator'])}${row('Workplace mentor', f['Workplace Mentor'])}${row('MOU signed', f['MOU Signed'] ? 'Yes' : '')}${row('Notes', f['Visit Notes'])}</table>
      ${recs.length ? `<h2>Recommendations</h2><table>${recs.map(r => `<tr><td>${esc(r.fields?.Text || '')}</td><td>${esc(r.fields?.Owner || '')}</td><td>${vDate(r.fields?.['Due Date'])}</td><td>${r.resolved ? 'Resolved' : 'Open'}</td></tr>`).join('')}</table>` : ''}<script>print()<\/script>`);
    w.document.close();
  };

  /* ---------- Recommendations: list, add, edit, resolve ---------- */
  // fields jsonb (same keys as the live app): Text, Owner, 'Due Date' (yyyy-mm-dd), Status (Open|Resolved), Visit (["<visit id>"])
  const recDate = d => { const t = d && new Date(d); return t && !isNaN(t) ? t.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const recVisits = f => { let v = f.Visit; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = v ? [v] : []; } } return Array.isArray(v) ? v.map(String).filter(Boolean) : []; };
  const recShown = () => P.data.recs.filter(r => rF === 'All' || (rF === 'Resolved') === !!r.resolved)
    .sort((a, b) => (!!a.resolved - !!b.resolved) || String(a.fields?.['Due Date'] || '9999').localeCompare(String(b.fields?.['Due Date'] || '9999')));
  function applyRecs() { window.renderRecs(); }
  let rT = '', rQ = '';
  const recDue = r => { const f = r.fields || {}; return f['Due Date'] || f.Due || ''; };
  const recP = r => r.programme_id ? (P.data.progsAll || P.data.progs).find(p => p.id === r.programme_id) || null : null;
  const recDel = r => !!r.programme_id && (!recP(r) || !!recP(r).deleted_at);
  const recWait = r => !r.resolved && (r.fields || {}).Status === 'Closure requested';
  const recCl = id => (P.data.clients || []).find(c => c.id === id)?.client_name || '';
  const recPid = p => p ? '#' + (p.display_id || p.id) : '';
  window.previewRecT = k => { rT = rT === k ? '' : k; if (rT) rF = 'Open'; renderRecs(); };
  window.previewRecQ = v => { rQ = v; renderRecs(); setTimeout(() => { const i = $('recq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); };
  window.apxRecTasks = role => { const out = []; try {
    const today = new Date().toISOString().slice(0, 10), me = ((P.user && P.user.email) || '').toLowerCase(), g = new Map();
    P.data.recs.filter(r => !r.resolved && !recWait(r) && recDue(r) && recDue(r) < today && !recDel(r)).forEach(r => { const p = recP(r);
      if (!((r.owner_email || '').toLowerCase() === me || (role === 'pm' && p && window.apxMineProg && apxMineProg(p)))) return;
      const k = r.programme_id || 0; g.set(k, (g.get(k) || 0) + 1); });
    g.forEach((n, pid) => { const p = recP({ programme_id: pid });
      out.push({ id: `rec${pid}`, t: `Overdue recommendation${n > 1 ? 's' : ''}: ${p ? recPid(p) + ' ' + (p.programme_name || '') : 'no programme'} (${n})`, s: 'Fix it, then Request close (an admin signs it off)', k: 'Recommendations', c: 'Open', on: `previewRecQ('${p ? recPid(p) : ''}');location.hash='recs'`, bad: 1 }); });
  } catch (e) {} return out; };
  window.renderRecs = function () {
    const today = new Date().toISOString().slice(0, 10), d30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const mine = r => { const p = recP(r); return !P.roles.includes('project_manager') || P.roles.includes('admin') || !window.apxMineProg || (p && apxMineProg(p)); };
    const base = P.data.recs.filter(mine), open = base.filter(r => !r.resolved);
    const TK = { od: ['Overdue', 'Due date has passed', 'var(--bad)', r => recDue(r) && recDue(r) < today && !recWait(r)], due: ['Due in 30 days', 'Due within the next 30 days', 'var(--warn)', r => recDue(r) >= today && recDue(r) <= d30 && !recWait(r)],
      own: ['No owner', 'Nobody named to fix it', 'var(--bad)', r => !(r.fields || {}).Owner], wait: ['Awaiting sign-off', 'Close requested, waiting for an admin', 'var(--warn)', recWait] };
    const cnt = k => open.filter(TK[k][3]).length, tl = k => [TK[k][0], cnt(k), cnt(k) ? TK[k][2] : 'var(--muted)', rT === k, `previewRecT('${k}')`, TK[k][1]];
    if (!$('rectiles')) { $('recfilter').insertAdjacentHTML('beforebegin', '<div id="rectiles" class="famtiles"></div>'); $('recfilter').insertAdjacentHTML('afterend', '<div class="famtool"><input id="recq" type="search" placeholder="Search text, #id, client, programme, VIS id" oninput="previewRecQ(this.value)" style="max-width:420px"></div>'); }
    $('rectiles').innerHTML = UI.tiles([{ t: 'Open recommendations', k: [tl('od'), tl('due'), tl('own'), tl('wait')] }]);
    if ($('recq').value !== rQ) $('recq').value = rQ;
    const rc = k => base.filter(r => k === 'All' || (k === 'Resolved') === !!r.resolved).length;
    $('recfilter').innerHTML = ['Open', 'Resolved', 'All'].map(s => `<button class="${s === rF ? 'on' : ''}" onclick="rF='${s}';rT='';renderRecs()">${s} · ${rc(s)}</button>`).join('');
    const ql = rQ.trim().toLowerCase(), hay = r => { const p = recP(r), f = r.fields || {}; return [f.Text, f.Owner, p && recPid(p), p && p.programme_name, p && recCl(p.client_id), ...recVisits(f).map(v => 'vis-' + v)].join(' ').toLowerCase(); };
    const shown = base.filter(r => (rF === 'All' || (rF === 'Resolved') === !!r.resolved) && (!rT || (!r.resolved && TK[rT][3](r))) && (!ql || hay(r).includes(ql.replace(/^#/, '#'))))
      .sort((a, b) => (!!a.resolved - !!b.resolved) || String(recDue(a) || '9999').localeCompare(String(recDue(b) || '9999')));
    const RG = [['Overdue', 'var(--bad)', r => !r.resolved && !recWait(r) && recDue(r) && recDue(r) < today], ['Awaiting sign-off', 'var(--warn)', recWait], ['Open', 'var(--warn)', r => !r.resolved], ['Resolved', 'var(--ok)', () => true]];
    const rg = r => RG.findIndex(g => g[2](r)), ordered = shown.map(r => [rg(r), r]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
    const adm = P.roles.includes('admin'), days = d => Math.round((new Date(today) - new Date(d)) / 864e5);
    let rLast = -1;
    $('reclist').innerHTML = !ordered.length ? '<section class="card"><div class="empty"><b>Nothing here</b></div></section>' : `<section class="card reccard" style="padding:0;overflow:hidden"><div class="tw"><table><thead><tr><th>Recommendation</th><th>Programme · visit</th><th>Owner</th><th>Due</th><th></th></tr></thead><tbody>${ordered.map(r => {
      const f = r.fields || {}, due = recDue(r), late = !r.resolved && !recWait(r) && due && due < today, vis = recVisits(f), gi = rg(r), p = recP(r), del = recDel(r);
      const gh = gi !== rLast ? UI.gh(RG[gi][0], ordered.filter(x => rg(x) === gi).length, RG[gi][1], 5) : ''; rLast = gi;
      const prog = del ? `<span class="badge b-bad" title="Programme ${r.programme_id} was deleted: move or close this recommendation">Programme deleted</span>` : p ? `<a href="#programmes" style="font-weight:700" onclick="dvApi.setProg(${p.id});dvProg&&dvProg()">${esc(recPid(p))}</a> · ${esc(recCl(p.client_id) || '—')}<div>${esc(p.programme_name || '')}</div>` : '<span class="sub">—</span>';
      const act = r.resolved ? `<button class="btn sm" onclick="previewRecResolve(${r.id},false)">Reopen</button>` : recWait(r) ? (adm ? `<a class="btn sm y" href="#signoff">Review in Sign-off queue</a>` : `<button class="btn sm" disabled title="Waiting in the Sign-off queue">Awaiting sign-off</button>`) : `<button class="btn sm y" onclick="previewRecResolve(${r.id},true)">Request close</button>`;
      return gh + `<tr class="famtr"><td style="white-space:normal;min-width:260px"><b>${esc(f.Text || 'Recommendation')}</b>${r.resolved && r.resolved_at ? `<div class="sub">Resolved ${recDate(r.resolved_at)}</div>` : ''}${f['Closure Note'] && !r.resolved ? `<div class="sub">Closing note: ${esc(f['Closure Note'])}</div>` : ''}</td>
        <td style="white-space:normal;min-width:180px;max-width:280px">${prog}${vis.length ? `<div class="sub">${vis.map(v => `<a href="#visit" onclick="previewOpenVisit(${+v || 0})">VIS-${esc(v)}</a>`).join(', ')}</div>` : ''}</td>
        <td>${f.Owner ? esc(f.Owner) : '<span class="badge b-bad">No owner</span>'}</td>
        <td>${due ? `<span style="${late ? 'color:var(--bad);font-weight:700' : ''}">${recDate(due)}</span>${late ? `<div class="sub" style="color:var(--bad)">${days(due)} days overdue</div>` : ''}` : '<span class="badge b-bad">No date</span>'}</td>
        <td style="text-align:right;white-space:nowrap"><button class="famact" onclick="previewRecEdit(${r.id})">Edit</button> &nbsp; ${act}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  };
  function recForm(r) {
    const f = r?.fields || {}, vis = recVisits(f)[0] || '', o = (v, l, s) => `<option value="${esc(v)}" ${s ? 'selected' : ''}>${esc(l)}</option>`;
    const progs = P.data.progs.slice().sort((a, b) => String(a.programme_name || '').localeCompare(String(b.programme_name || '')));
    document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="Recommendation"><form class="card" id="recform"><h2>${r ? 'Edit' : 'Add'} recommendation</h2>
      <label>What must be put right? *<textarea name="Text" required rows="3" style="border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;background:transparent;color:var(--ink)">${esc(f.Text || '')}</textarea></label>
      <div class="qagrid"><label>Programme<select name="programme_id">${o('', '—', !r?.programme_id)}${progs.map(p => o(p.id, p.programme_name || 'Programme ' + p.id, p.id === r?.programme_id)).join('')}</select></label>
      <label>From visit<select name="Visit">${o('', '—', !vis)}${P.data.visits.map(v => o(v.id, 'VIS-' + v.id + ' · ' + (v.fields?.['Visit Title'] || progName(v.programme_id)), String(v.id) === vis)).join('')}</select></label>
      <label>Owner *<input name="Owner" required value="${esc(f.Owner || '')}" placeholder="Who fixes it"></label>
      <label>Due date *<input name="Due" type="date" required value="${esc(f['Due Date'] || '')}"></label></div>
      <div class="sub" id="recerr" style="color:var(--bad)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" onclick="document.getElementById('famov').remove()">Cancel</button><button class="btn y" id="recsave">Save</button></div></form></div>`);
    $('recform').onchange = e => { if (e.target.name === 'Visit' && e.target.value) { const v = P.data.visits.find(x => String(x.id) === e.target.value); if (v?.programme_id) $('recform').elements.programme_id.value = v.programme_id; } };
    $('recform').onsubmit = async ev => {
      ev.preventDefault(); const el = $('recform').elements, btn = $('recsave'); btn.disabled = true; btn.textContent = 'Saving…';
      const fields = { ...f, Text: el.Text.value.trim(), Owner: el.Owner.value.trim(), 'Due Date': el.Due.value, Visit: el.Visit.value ? [el.Visit.value] : [], Status: r?.resolved ? 'Resolved' : 'Open' };
      const row = { fields, programme_id: el.programme_id.value ? +el.programme_id.value : null };
      try {
        if (r) await write('Recommendation', () => sb.from('recommendations').update(row).eq('id', r.id).select('id'));
        else { if (!P.tenant) throw new Error('No tenant on your account.'); await write('Recommendation', () => sb.from('recommendations').insert({ tenant_id: P.tenant, resolved: false, ...row }).select('id')); }
        $('famov').remove(); await loadAll();
      } catch (err) { $('recerr').textContent = err.message || String(err); btn.disabled = false; btn.textContent = 'Save'; }
    };
    $('recform').elements.Text.focus();
  }
  window.previewRecAdd = visitId => { recForm(null); if (visitId) { const el = $('recform').elements; el.Visit.value = String(visitId); el.Visit.dispatchEvent(new Event('change', { bubbles: true })); } };
  window.previewRecEdit = id => { const r = P.data.recs.find(x => x.id === id); if (r) recForm(r); };
  window.previewRecResolve = async (id, done) => {
    const r = P.data.recs.find(x => x.id === id); if (!r) return;
    try {
      if (done) { const note = prompt('Closing note: what was done to put it right?'); if (note === null) return; if (!note.trim()) { toast('Add a short closing note.'); return; } await write('Recommendation', () => sb.rpc('request_rec_closure', { p_id: id, p_note: note.trim() })); toast('Sent to the Sign-off queue. It closes once an admin approves.'); }
      else await write('Recommendation', () => sb.from('recommendations').update({ resolved: false, resolved_at: null, fields: { ...(r.fields || {}), Status: 'Open' } }).eq('id', id).select('id'));
      await loadAll();
    } catch (_) {}
  };

  /* ---------- FAM + clients (read) ---------- */
  function applyFam() {
    PEOPLE.length = 0; P.data.famc.forEach(a => PEOPLE.push([a.full_name, P.data.assessors.find(x => x.id === a.assessor_id)?.role || '', Array(Math.max(0, a.document_count)).fill('CV')]));
    if (!PEOPLE.length) PEOPLE.push(['No practitioners yet', '', []]);
    famSel = 0; renderFam();
    if (!$('famkpis').dataset.fam) $('famkpis').innerHTML = [['Practitioners', P.data.famc.length], ['Registrations', P.data.famc.reduce((t, a) => t + a.registration_count, 0)], ['Open follow-ups', P.data.famc.reduce((t, a) => t + a.open_follow_ups, 0)]]
      .map(([l, v]) => `<div class="kpi" style="min-width:150px;padding:12px 16px;gap:2px"><span class="l">${l}</span><span class="v" style="font-size:24px">${v}</span></div>`).join('');
  }
  /* ---------- Clients: list, search, detail, add, edit ---------- */
  // Same storage as the old app: typed columns + fields jsonb ('Company Name', 'Contact Person', Email, Phone, Address, Sector, 'BEE Level', 'MOU Status', 'MOU Date Signed', 'MOU Expiry Date').
  const CL_SECTORS = ['Agriculture', 'Construction', 'Education & Training', 'Energy', 'Financial Services', 'Government/Public Sector', 'Healthcare', 'Hospitality & Tourism', 'ICT', 'Insurance', 'Manufacturing', 'Mining', 'Retail & Wholesale', 'Transport & Logistics', 'Other'];
  const CL_BEE = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Non-Compliant'];
  const CL_MOU = ['Signed', 'Draft', 'Pending', 'Expired', 'Not Required'];
  let clPick = null, clQ = '';
  const clF = c => c.fields || {};
  const clName = c => c.client_name || clF(c)['Company Name'] || 'Client ' + c.id;
  const clDate = d => { const t = d && new Date(d); return t && !isNaN(t) ? t.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  function clMou(c) {
    const f = clF(c), exp = f['MOU Expiry Date'] || f['MOU Expiry'] || '', today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
    let s = f['MOU Status'] || '';
    if (exp && exp < today && s !== 'Not Required') s = 'Expired';
    const cls = s === 'Signed' ? (exp && exp <= soon ? 'b-warn' : 'b-ok') : s === 'Expired' ? 'b-bad' : s === 'Pending' || s === 'Draft' ? 'b-warn' : 'b-n';
    return { s: s || 'No MOU recorded', exp, cls, note: s === 'Signed' && exp && exp <= soon ? 'expires ' + clDate(exp) : '' };
  }
  const clBadDates = p => p.start_date && p.end_date && String(p.end_date).slice(0, 10) < String(p.start_date).slice(0, 10);
  const clRun = p => window.dvApi?.runState ? dvApi.runState(p) : (p.status || '');
  function applyClients() {
    const list = P.data.clients.filter(c => !c.deleted_at && (!window.apxPMonly || !apxPMonly() || apxMineName(c.project_manager) || P.data.progs.some(p => p.client_id === c.id && apxMineProg(p)))).sort((a, b) => clName(a).localeCompare(clName(b)));
    if (!list.find(c => c.id === clPick)) clPick = list[0]?.id ?? null;
    const head = document.querySelector('#view-clients h1')?.parentElement;
    if (head && !$('clq')) head.insertAdjacentHTML('beforeend', '<input id="clq" type="search" placeholder="Search clients, contacts, PM" style="height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit;background:var(--surface);color:var(--ink);min-width:220px" oninput="previewClSearch(this.value)">');
    const q = clQ.toLowerCase(), shown = list.filter(c => !q || [clName(c), c.contact_person, c.project_manager, c.sales_person, clF(c).Sector].join(' ').toLowerCase().includes(q));
    $('clientcards').innerHTML = shown.map(c => { const m = clMou(c), cp = P.data.progs.filter(p => p.client_id === c.id), n = cp.length, bad = cp.filter(clBadDates).length;
    if (window.apxPgIn) apxPgIn($('clientcards'), q);
      return `<button class="pick${c.id === clPick ? ' on' : ''}" onclick="previewClPick(${c.id})"><b>${esc(clName(c))}</b><span class="sub">${esc(clF(c).Sector || 'Sector not set')} · PM ${esc(c.project_manager || '—')}</span><span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="badge ${m.cls}">${esc(m.s === 'No MOU recorded' ? m.s : 'MOU ' + m.s)}${m.note ? ' · ' + m.note : ''}</span>${bad ? `<span class="badge b-bad">${bad} end before start</span>` : ''}</span><span class="sub">${n} programme${n === 1 ? '' : 's'}</span></button>`; }).join('') || '<p class="sub">No clients match.</p>';
    const c = list.find(x => x.id === clPick), aside = document.querySelector('#view-clients aside');
    if (!aside) return;
    if (!c) { aside.innerHTML = '<p class="sub">No client selected.</p>'; return; }
    const f = clF(c), m = clMou(c), kv = (k, v, opt) => v || !opt ? `<div style="display:flex;gap:8px"><span class="sub" style="min-width:110px">${k}</span><span>${v || '<span class="sub">not set</span>'}</span></div>` : '';
    const progs = P.data.progs.filter(p => p.client_id === c.id).sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
    aside.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-start"><h2 style="flex-grow:1">${esc(clName(c))}</h2><button class="btn sm" onclick="previewClEdit(${c.id})">Edit</button></div>
      <span class="sub">${esc([f.Sector, f.Address].filter(Boolean).join(' · ') || 'Sector and address not set')}</span>
      <div style="display:flex;flex-direction:column;gap:6px">${kv('Contact', esc(c.contact_person || f['Contact Person'] || ''))}${kv('Email', (c.contact_email || f.Email) ? `<a href="mailto:${esc(c.contact_email || f.Email)}">${esc(c.contact_email || f.Email)}</a>` : '')}${kv('Phone', esc(c.contact_number || f.Phone || ''))}
      ${kv('Project manager', esc(c.project_manager || ''))}${kv('Sales person', esc(c.sales_person || ''))}${kv('BEE level', esc(f['BEE Level'] || ''), 1)}
      ${kv('MOU', `<span class="badge ${m.cls}">${esc(m.s)}</span>`)}${kv('MOU signed', clDate(f['MOU Date Signed']), 1)}${kv('MOU expiry', clDate(m.exp), 1)}</div>
      <h2 style="font-size:15px;margin-top:8px">Programmes (${progs.length})</h2>
      <div class="list">${progs.map(p => `<a href="#programmes" onclick="window.dvApi&&dvApi.setProg(${p.id});setTimeout(()=>window.dvProg&&dvProg(${p.id}),50)"><span style="flex-grow:1"><b style="display:block">${esc(p.programme_name || 'Programme ' + p.id)} <span class="sub" style="font-weight:400">#${p.id}</span></b><span class="sub">${esc([clRun(p), p.start_date ? clDate(p.start_date) + (p.end_date ? ' – ' + clDate(p.end_date) : '') : 'no dates'].filter(Boolean).join(' · '))}</span>${clBadDates(p) ? ' <span class="badge b-bad">End before start</span>' : ''}</span></a>`).join('') || '<p class="sub">No programmes yet.</p>'}</div>`;
  }
  window.previewClPick = id => { clPick = id; applyClients(); };
  window.previewClSearch = v => { clQ = v || ''; applyClients(); };
  function clForm(c) {
    const f = c ? clF(c) : {}, o = (list, v) => `<option value="">—</option>` + (v && !list.includes(v) ? [v, ...list] : list).map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const inp = (n, l, v, t = 'text', ex = '') => `<label>${l}<input name="${n}" type="${t}" value="${esc(v || '')}" ${ex}></label>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="Client"><form class="card" id="clform"><h2>${c ? 'Edit' : 'Add'} client</h2><div class="qagrid">
      ${inp('name', 'Company name *', c ? clName(c) : '', 'text', 'required')}${inp('contact', 'Contact person', c?.contact_person || f['Contact Person'])}${inp('email', 'Email', c?.contact_email || f.Email, 'email')}${inp('phone', 'Phone', c?.contact_number || f.Phone, 'tel')}
      ${inp('address', 'Physical address', f.Address)}<label>Sector<select name="sector">${o(CL_SECTORS, f.Sector)}</select></label><label>BEE level<select name="bee">${o(CL_BEE, f['BEE Level'])}</select></label>
      ${inp('pm', 'Project manager', c?.project_manager)}${inp('sales', 'Sales person', c?.sales_person)}
      <label>MOU status<select name="mou">${o(CL_MOU, f['MOU Status'])}</select></label>${inp('mousigned', 'MOU date signed', f['MOU Date Signed'], 'date')}${inp('mouexp', 'MOU expiry date', f['MOU Expiry Date'] || f['MOU Expiry'], 'date')}</div>
      <div class="sub" id="clerr" style="color:var(--bad)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" onclick="document.getElementById('famov').remove()">Cancel</button><button class="btn y" id="clsave">Save</button></div></form></div>`);
    $('clform').onsubmit = async ev => {
      ev.preventDefault(); const el = $('clform').elements, v = n => el[n].value.trim(), btn = $('clsave'); btn.disabled = true; btn.textContent = 'Saving…';
      const name = v('name'), dup = P.data.clients.find(x => !x.deleted_at && x.id !== c?.id && clName(x).trim().toLowerCase() === name.toLowerCase());
      if (dup) { $('clerr').textContent = `A client called “${clName(dup)}” already exists.`; btn.disabled = false; btn.textContent = 'Save'; return; }
      const fields = { ...f, 'Company Name': name, 'Contact Person': v('contact'), Email: v('email'), Phone: v('phone'), Address: v('address'), Sector: v('sector'), 'BEE Level': v('bee'), 'MOU Status': v('mou') };
      ['MOU Date Signed', 'MOU Expiry Date'].forEach((k, i) => { const d = v(i ? 'mouexp' : 'mousigned'); if (d) fields[k] = d; else delete fields[k]; }); delete fields['MOU Expiry'];
      const row = { client_name: name, contact_person: v('contact') || null, contact_email: v('email') || null, contact_number: v('phone') || null, project_manager: v('pm') || null, sales_person: v('sales') || null, fields };
      try {
        if (c) await write('Client', () => sb.from('clients').update(row).eq('id', c.id).select('id'));
        else { if (!P.tenant) throw new Error('No tenant on your account.'); const r = await write('Client', () => sb.from('clients').insert({ tenant_id: P.tenant, ...row }).select('id')); clPick = r?.[0]?.id ?? clPick; }
        $('famov').remove(); await loadAll();
      } catch (err) { $('clerr').textContent = err.message || String(err); btn.disabled = false; btn.textContent = 'Save'; }
    };
    $('clform').elements.name.focus();
  }
  window.previewClAdd = () => clForm(null);
  window.previewClEdit = id => { const c = P.data.clients.find(x => x.id === id); if (c) clForm(c); };

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
  document.body.insertAdjacentHTML('afterbegin', '<div id="pvbanner" style="position:sticky;top:0;z-index:50;background:#FBDC00;color:#25247B;font-weight:700;text-align:center;padding:6px 12px;font-size:13px">NEW UI · live ApexOne data · changes here are real</div>');
})();
