/* ApexOne preview — "Today" side panel per screen (2026-11-12).
   What to act on now on this screen, who must action it, and (admins) a one-click request to that person.
   Reads the data live.js already loaded (P.data), plus the staff directory (rpc apx_staff) and open fix requests (fix_requests).
   The only write is fix_requests (admins). Requests open in the admin's own mail app: nothing is sent by ApexOne. FAM keeps its own Today (fam.js). */
(function () {
  const P = window.__preview, D = () => (P && P.data) || {}, sb = () => window.__sb;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T0 = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const dd = s => { if (!s) return null; const t = Date.parse(String(s).slice(0, 10)); return isNaN(t) ? null : Math.round((t - T0) / 864e5); };
  const fmt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const when = n => n == null ? '' : n === 0 ? 'today' : n < 0 ? `${-n} d overdue` : `in ${n} d`;
  const ok = h => !window.NAVR || !NAVR[h] || NAVR[h]();
  const roles = () => (P && P.roles) || [], isAdm = () => roles().includes('admin');
  const meE = () => String(P?.user?.email || '').toLowerCase();
  const progs = () => (D().progs || []).filter(p => !String(p.programme_name || '').startsWith('[TEST]') && (!window.apxMineProg || apxMineProg(p)));
  const pmap = () => { const m = new Map(); progs().forEach(p => m.set(String(p.id), p)); return m; };
  const live = p => p.status === 'active';
  const pname = p => esc((p?.programme_name || '').replace('[TEST] ', '') || 'Programme');
  const goP = id => `location.hash='programmes';setTimeout(()=>window.dvProg&&dvProg(${+id}),60)`;
  const goH = h => `location.hash='${h}'`;
  const lname = id => { const l = (D().learners || []).find(x => x.id === id); return l ? esc((l.first_name + ' ' + l.last_name).trim()) : 'Learner'; };
  const F = (o, ...k) => { const f = o.fields || {}; for (const x of k) if (f[x]) return f[x]; return ''; };
  /* item: title, sub, go (onclick), warn, owner spec ('pm' | 'qa' | 'hoo' | 'pi' | 'comp' | 'admin' | a person's name/email), programme id */
  const it = (t, s, go, warn, o, pid) => ({ t, s, go, warn, o, pid });
  const byN = (a, k = 'n') => a.sort((x, y) => (x[k] ?? 9e9) - (y[k] ?? 9e9));

  /* ---------- who must action it ---------- */
  const ST = { list: null, req: null, busy: false };
  const ALIAS = { hansie: 'johannes', tia: 'thia' };
  const first = s => { const v = String(s || '').toLowerCase().trim(); if (v.includes('@')) return v; const w = v.split(/[^a-z]+/).filter(Boolean)[0] || ''; return ALIAS[w] || w; };
  const staff = () => ST.list || [];
  const disp = u => { const p = u.email.split('@')[0]; return /apex/i.test(u.name || '') || !u.name ? p[0].toUpperCase() + p.slice(1) : u.name; };
  const byName = s => { const f = first(s); if (!f) return null; if (f.includes('@')) return staff().find(u => u.email.toLowerCase() === f) || null; return staff().find(u => first(u.email.split('@')[0]) === f || first(u.name) === f) || null; };
  const byRole = r => staff().find(u => (u.roles || []).includes(r)) || null;
  const ROLE = { qa: ['qa_specialist', 'QA'], hoo: ['head_of_ops', 'Head of Ops'], pi: ['pi_specialist', 'PI'], comp: ['compliance_officer', 'Compliance'] };
  function owner(x) {
    const p = x.pid != null ? (D().progs || []).find(q => String(q.id) === String(x.pid)) : null;
    let o = x.o || 'admin', why = '';
    if (o === 'pm') { const c = p ? (D().clients || []).find(k => String(k.id) === String(p.client_id)) : null, nm = p?.project_manager_name || c?.project_manager;
      if (nm) { const u = byName(nm); return u ? { n: disp(u), e: u.email } : { n: String(nm).split(/\s+/)[0], e: '' }; }
      o = 'hoo'; why = ' (no PM)'; }
    if (ROLE[o]) { const u = byRole(ROLE[o][0]); return u ? { n: disp(u), e: u.email, why } : { n: ROLE[o][1], e: '', why }; }
    if (o === 'admin') o = 'nasreen'; // unowned admin items go to Nasreen (oversees PMs, ETQA, QA, compliance); IT/sync is Roy's
    const u = byName(o); return u ? { n: disp(u), e: u.email } : { n: String(o).split(/[\s@]+/)[0], e: '' };
  }
  async function loadSide(force) {
    if (ST.busy || (!force && ST.list && ST.req)) return; if (!sb() || !P?.user) return; ST.busy = true;
    try { const [a, b] = await Promise.all([ST.list && !force ? { data: ST.list } : sb().rpc('apx_staff'), sb().from('fix_requests').select('id,item_key,owner_name,requested_by,requested_at').is('cleared_at', null)]);
      ST.list = (a && a.data) || []; ST.req = new Map(); ((b && b.data) || []).forEach(r => { if (!ST.req.has(r.item_key)) ST.req.set(r.item_key, r); }); }
    catch (_) { ST.list = ST.list || []; ST.req = ST.req || new Map(); }
    ST.busy = false; clearGone(); window.shRefresh && shRefresh();
  }

  /* ---------- building blocks, each returns { h, items, link } ---------- */
  const B = {
    recs(m) { const r = byN((D().recs || []).filter(x => !x.resolved && m.has(String(x.programme_id))).map(x => ({ x, n: dd(F(x, 'Due Date')) })));
      return { h: 'Open recommendations', link: 'recs', items: r.filter(o => o.n == null || o.n <= 14).map(o => it(esc(String(F(o.x, 'Text')).slice(0, 80) || 'Recommendation'), `${pname(m.get(String(o.x.programme_id)))} · ${o.n == null ? 'no due date' : 'due ' + when(o.n)}`, goH('recs'), o.n == null || o.n < 0, F(o.x, 'Owner') || 'pm', o.x.programme_id)) }; },
    visits(m) { const v = D().visits || [], last = new Map(), next = [];
      v.forEach(x => { const k = String(x.programme_id), d = F(x, 'Date of Visit', 'Date'), n = F(x, 'Next Visit Date'); if (d && (!last.get(k) || d > last.get(k))) last.set(k, d); if (n && m.has(k)) next.push({ x, n: dd(n), d: n }); });
      const due = byN(next.filter(o => o.n != null && o.n <= 14)).map(o => it(pname(m.get(String(o.x.programme_id))), `Next visit ${fmt(o.d)} · ${when(o.n)}`, goH('visits'), o.n < 0, 'pm', o.x.programme_id));
      const none = [...m.values()].filter(p => live(p) && (dd(p.start_date) ?? 1) <= -30 && !(last.get(String(p.id)) && dd(last.get(String(p.id))) > -90))
        .map(p => it(pname(p), last.get(String(p.id)) ? `Last visit ${fmt(last.get(String(p.id)))}: book a visit` : 'No visit recorded: book or capture a visit', goP(p.id), true, 'pm', p.id));
      return { h: 'Visits due', link: 'visits', items: due.concat(none) }; },
    eisa(m) { const t = (D().tracker || []).filter(x => m.has(String(x.programme_id)) && x.eisa_date && !x.eisa_outcome).map(x => ({ x, n: dd(x.eisa_date) })).filter(o => o.n >= -7 && o.n <= 30);
      const g = new Map(); t.forEach(o => { const k = o.x.programme_id + '|' + String(o.x.eisa_date).slice(0, 10); if (!g.has(k)) g.set(k, { o, c: 0, n: o.n }); g.get(k).c++; });
      const w = byN((D().windows || []).map(x => ({ x, n: dd(x.registration_closing) })).filter(o => o.n != null && o.n >= 0 && o.n <= 21));
      return { h: 'EISA coming up', link: 'eisa', items: byN([...g.values()]).map(({ o, c }) => it(pname(m.get(String(o.x.programme_id))), `${c} learner${c > 1 ? 's' : ''} · EISA ${fmt(o.x.eisa_date)} · ${when(o.n)}`, `window.dvGo?dvGo('eisa','Readiness'):${goH('eisa')}`, o.n <= 7, 'qa', o.x.programme_id))
        .concat(w.map(o => it(esc(o.x.label || o.x.qualification || 'EISA window'), `Registration closes ${fmt(o.x.registration_closing)} · ${when(o.n)}`, goH('eisa'), o.n <= 7, 'qa'))) }; },
    qcto(m) { const g = new Map();
      (D().tracker || []).forEach(x => { const p = m.get(String(x.programme_id)); if (p && x.current_status === 'Not Started' && (dd(p.start_date) ?? 1) <= -30) g.set(p.id, (g.get(p.id) || 0) + 1); });
      return { h: 'Not started, programme running 30+ days', link: 'qcto', items: [...g].sort((a, b) => b[1] - a[1]).map(([id, c]) => it(pname(m.get(String(id))), `${c} learner${c > 1 ? 's' : ''} still Not Started on the QCTO tracker`, goH('qcto'), true, 'pm', id)) }; },
    mods(m) { const r = (D().mods || []).filter(x => m.has(String(x.programme_id)) && x.stage !== 'Submitted to PM').map(x => ({ x, n: dd(x.stage_date), e: dd(x.exit_verification_date) }));
      return { h: 'Moderation needing a push', link: 'modver', items: r.filter(o => o.x.stage === 'On hold' || (o.n != null && o.n <= -30) || (o.e != null && o.e >= 0 && o.e <= 30))
        .map(o => it(pname(m.get(String(o.x.programme_id))), `${esc(o.x.stage || 'No stage')}${o.e != null && o.e >= 0 && o.e <= 30 ? ' · exit verification ' + fmt(o.x.exit_verification_date) : o.n != null ? ' · ' + (-o.n) + ' d at this stage' : ''}`, goH('modver'), o.x.stage === 'On hold' || o.n <= -30, 'qa', o.x.programme_id)) }; },
    accs() { const a = byN((D().accs || []).map(x => ({ x, n: dd(x.accreditation_to) })));
      return { h: 'Accreditation', link: 'accred', items: a.filter(o => (o.n != null && o.n <= 120) || (o.x.status && o.x.status !== 'Accreditation granted'))
        .map(o => it(esc(`${o.x.saqa_id || ''} ${o.x.title || ''}`.trim()), o.n != null && o.n <= 120 ? `Expires ${fmt(o.x.accreditation_to)} · ${when(o.n)}` : esc(o.x.status) + (o.x.site_visit_date ? ' · site visit ' + fmt(o.x.site_visit_date) : ''), goH('accred'), o.n != null && o.n <= 60, 'qa')) }; },
    signoffs() { const s = (D().signoffs || []).filter(x => !x.status || /wait|pend|submit|open/i.test(x.status));
      return { h: 'Waiting for sign-off', link: 'signoff', items: s.map(x => it(esc(x.title || x.kind || 'Item'), `From ${esc(x.submitted_by || 'unknown')}${x.created_at ? ' · ' + fmt(x.created_at) : ''}`, goH('signoff'), (dd(x.created_at) ?? 0) <= -3, 'comp')) }; },
    reports(m) { const items = [];
      (D().reports || []).filter(x => !x.archived_at && (!x.programme_id || m.has(String(x.programme_id)))).forEach(x => { const nm = esc(x.programme_name_snapshot || x.client_name_snapshot || 'Report') + (x.month ? ' · ' + esc(String(x.month).slice(0, 7)) : ''), o = x.submitted_by_email || 'pm';
        if (x.status === 'needs_changes') items.push(it(nm, 'Needs changes' + (x.reviewer_note ? ': ' + esc(String(x.reviewer_note).slice(0, 60)) : ''), goH('reports'), true, o, x.programme_id));
        else if (x.status === 'pending') items.push(it(nm, 'Submitted, waiting for review', goH('reports'), false, 'admin', x.programme_id));
        else if (x.status === 'approved' && !x.sent_at) items.push(it(nm, 'Approved, not sent to client', goH('reports'), (dd(x.reviewed_at) ?? 0) <= -3, o, x.programme_id));
        else if (x.remind_pm_at && dd(x.remind_pm_at) <= 0) items.push(it(nm, 'PM reminder due ' + fmt(x.remind_pm_at), goH('reports'), true, o, x.programme_id));
        else if (x.hold_until && dd(x.hold_until) <= 3) items.push(it(nm, 'Hold ends ' + fmt(x.hold_until) + (x.hold_reason ? ' · ' + esc(x.hold_reason) : ''), goH('reports'), dd(x.hold_until) < 0, o, x.programme_id)); });
      const sm = window.rpSummary && window.rpSummary(); (sm && sm.rows || []).filter(x => (x.stage === 'draft' || x.stage === 'notstarted') && (!x.pid || m.has(String(x.pid)))).forEach(x =>
        items.push(it(esc(x.prog || x.client || 'Report') + ' · ' + esc(sm.month), x.stage === 'draft' ? 'Report draft saved, not submitted' : 'Report not started', goH('reports'), true, x.pm || 'pm', x.pid)));
      return { h: 'Reports to move', link: 'reports', items }; },
    dates(m) { const r = byN([...m.values()].filter(live).flatMap(p => [['Starts', p.start_date], ['Ends', p.end_date]].map(([k, d]) => ({ p, k, d, n: dd(d) }))).filter(o => o.n != null && o.n >= -3 && o.n <= 21));
      return { h: 'Starting or ending soon', link: 'pmtracker', items: r.map(o => it(pname(o.p), `${o.k} ${fmt(o.d)} · ${when(o.n)}`, goP(o.p.id), o.k === 'Ends' && o.n <= 7, 'pm', o.p.id)) }; },
    gaps(m) { const L = new Set((D().enrol || []).map(e => String(e.programme_id))), items = [];
      [...m.values()].filter(p => p.status !== 'closed').forEach(p => {
        if (!p.project_manager_name) items.push(it(pname(p), 'Missing PM: assign a project manager', goP(p.id), true, 'hoo', p.id));
        if (!p.saqa_id) items.push(it(pname(p), 'Missing SAQA ID', goP(p.id), false, 'qa', p.id));
        const mm = [!(p.start_date && p.end_date) && 'dates', live(p) && !L.has(String(p.id)) && 'learners'].filter(Boolean);
        if (mm.length) items.push(it(pname(p), 'Missing ' + mm.join(' and '), goP(p.id), mm.length > 1, 'pm', p.id)); });
      return { h: 'Programmes missing details', link: 'programmes', items }; },
    clients(m) { const used = new Set([...m.values()].filter(live).map(p => String(p.client_id)));
      const c = (D().clients || []).filter(x => !x.deleted_at && (!window.apxMineProg || used.has(String(x.id)))), items = [];
      c.forEach(x => { const lv = used.has(String(x.id)) ? ' · has live programmes' : '';
        if (!x.project_manager) items.push(it(esc(x.client_name), 'Missing PM' + lv, goH('clients'), !!lv, 'hoo'));
        const mm = [!x.contact_email && 'contact email', !x.contact_number && 'contact number'].filter(Boolean);
        if (mm.length) items.push(it(esc(x.client_name), 'Missing ' + mm.join(', ') + lv, goH('clients'), false, x.project_manager || 'hoo')); });
      return { h: 'Clients missing details', link: 'clients', items }; },
    att(m) { const last = new Map(); (D().sessions || []).forEach(s => { const k = String(s.programme_id); if (dd(s.session_date) <= 0 && (!last.get(k) || s.session_date > last.get(k))) last.set(k, s.session_date); });
      const A = window.dvApi, quiet = [...m.values()].filter(p => live(p) && (dd(p.start_date) ?? 1) <= -14 && A && A.learnersOf(p.id).length && !(last.get(String(p.id)) && dd(last.get(String(p.id))) > -14))
        .map(p => it(pname(p), last.get(String(p.id)) ? `Last register ${fmt(last.get(String(p.id)))}: capture registers` : 'No register captured', `window.dvProg&&dvProg(${p.id});window.dvGo?dvGo('attendance','Register'):${goH('attendance')}`, true, 'pm', p.id));
      const ab = new Map(); (D().att || []).forEach(a => { if (m.has(String(a.programme_id)) && /^a/i.test(a.status || '') && dd(a.session_date) >= -30) { const k = a.programme_id + '|' + a.learner_id; ab.set(k, (ab.get(k) || 0) + 1); } });
      const hi = [...ab].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).map(([k, c]) => { const [pid, lid] = k.split('|'); return it(lname(+lid), `${c} absences in 30 days · ${pname(m.get(pid))}`, `window.shOpen&&shOpen(${+pid},${+lid})`, c >= 5, 'pm', pid); });
      return { h: 'Attendance', link: 'attendance', items: quiet.concat(hi) }; },
    learners(m) { const EP = new Map(); (D().enrol || []).forEach(e => { if (!EP.has(e.learner_id)) EP.set(e.learner_id, e.programme_id); });
      const L = (D().learners || []).filter(l => !/\[TEST\]|^test/i.test(l.first_name || '')), mine = !!(window.apxPMonly && apxPMonly());
      const r = L.filter(l => !mine || m.has(String(EP.get(l.id)))).map(l => ({ l, pid: EP.get(l.id), miss: [!l.id_number && 'ID number', !EP.has(l.id) && 'enrolment'].filter(Boolean) })).filter(o => o.miss.length);
      return { h: 'Learners missing ID or enrolment', link: 'learners', items: r.map(o => it(esc((o.l.first_name + ' ' + o.l.last_name).trim()), 'Missing ' + o.miss.join(', ') + (o.pid ? ' · ' + pname(m.get(String(o.pid))) : ''), `window.shOpen&&shOpen(${o.pid ? +o.pid : 'null'},${o.l.id})`, o.miss.includes('ID number'), o.pid ? 'pm' : 'hoo', o.pid)) }; },
    enrol(m) { const T = new Set((D().tracker || []).map(t => String(t.enrolment_id))), g = new Map();
      (D().enrol || []).forEach(e => { const p = m.get(String(e.programme_id)); if (p && live(p) && !T.has(String(e.id))) g.set(p.id, (g.get(p.id) || 0) + 1); });
      return { h: 'Enrolments with no QCTO row', link: 'enrolments', items: [...g].sort((a, b) => b[1] - a[1]).map(([id, c]) => it(pname(m.get(String(id))), `${c} enrolment${c > 1 ? 's' : ''} not on the QCTO tracker`, goH('qcto'), false, 'qa', id)) }; },
    pi(m) { const r = byN([...m.values()].filter(p => p.status === 'initiated').map(p => ({ p, n: dd(p.start_date) })));
      return { h: 'Programme Initiation', link: 'pi', items: r.map(o => it(pname(o.p), 'Not handed over yet' + (o.n != null ? ` · starts ${fmt(o.p.start_date)} · ${when(o.n)}` : ' · no start date'), goH('pi'), o.n != null && o.n <= 7, 'pi', o.p.id)) }; },
    dq() { return { h: 'Data quality', link: 'dq', items: (D().dq || []).filter(x => !x.decision).map(x => it(esc(((x.first_name || '') + ' ' + (x.last_name || '')).trim() || 'Learner'), esc(String(x.issue || 'Possible issue').replace(/_/g, ' ')), goH('dq'), false, 'qa')) }; },
    fam() { const items = []; (D().famc || []).forEach(x => { const nm = esc(x.full_name || 'Practitioner'), go = `location.hash='fam/${+x.assessor_id}'`;
        if (x.missing_or_expired_documents > 0) items.push(it(nm, `Missing or expired documents · ${x.missing_or_expired_documents}`, go, true, 'comp'));
        if (!x.registration_count) items.push(it(nm, 'No SETA registration captured', go, false, 'comp'));
        if (x.open_follow_ups > 0) items.push(it(nm, `Open follow-ups · ${x.open_follow_ups}`, go, false, 'comp')); });
      return { h: 'FAM Registry', link: 'fam', items }; },
    sync() { const o = D().outbox || [], f = o.filter(x => /fail|error/i.test(x.status || '')), p = o.filter(x => /pend|queue/i.test(x.status || ''));
      const g = new Map(); f.forEach(x => g.set(x.source_table, (g.get(x.source_table) || 0) + 1));
      return { h: 'ClickUp sync', link: 'synchealth', items: [...g].map(([t, c]) => it(esc(t), `${c} failed · ${esc((f.find(x => x.source_table === t).last_error || '').slice(0, 70))}`, goH('synchealth'), true, 'roye')).concat(p.length ? [it('Waiting to send', `${p.length} change${p.length > 1 ? 's' : ''} queued`, goH('synchealth'), p.length > 50, 'roye')] : []) }; }
  };

  /* ---------- which blocks each screen shows (first = most relevant) ---------- */
  const SCREENS = {
    mywork: ['signoffs', 'recs', 'visits', 'eisa', 'reports', 'dates', 'mods', 'accs'],
    dashboard: ['dates', 'recs', 'visits', 'eisa', 'mods', 'reports'],
    hoo: ['signoffs', 'gaps', 'clients', 'learners', 'recs', 'visits', 'qcto', 'mods', 'reports', 'accs', 'att', 'enrol', 'sync'],
    reports: ['reports'], clients: ['clients', 'dates'], pmtracker: ['dates', 'recs', 'visits', 'reports'],
    programmes: ['dates', 'gaps', 'recs'], pi: ['pi', 'gaps', 'dates'], learners: ['learners', 'att'], dq: ['dq', 'learners', 'enrol'],
    enrolments: ['enrol', 'learners'], eisa: ['eisa', 'qcto'], qcto: ['eisa', 'qcto', 'enrol'], attendance: ['att'],
    visits: ['visits', 'recs'], recs: ['recs', 'visits'], modver: ['mods', 'eisa'], accred: ['accs'], signoff: ['signoffs', 'recs'],
    synchealth: ['sync'], assessors: ['mods', 'accs']
  };
  const LBL = { recs: 'Recommendations', visits: 'Visits', eisa: 'EISA', qcto: 'QCTO tracker', modver: 'Moderation', accred: 'Accreditation', signoff: 'Sign-off', reports: 'Reports', pmtracker: 'PM Tracker', programmes: 'Programmes', clients: 'Clients', attendance: 'Attendance', learners: 'Learners', enrolments: 'Enrolments', synchealth: 'Sync health' };
  const MAX = 6, ALLB = Object.keys(B);

  /* snooze (7 days, this browser only), filters and the admin "By person" view */
  const SK = 'ao.tdySnooze', TF = { f: (()=>{ try { return localStorage.getItem('ao.tdyF') || null; } catch (_) { return null; } })(), who: null };
  const snz = () => { try { const o = JSON.parse(localStorage.getItem(SK) || '{}'), now = Date.now(); Object.keys(o).forEach(k => { if (o[k] < now) delete o[k]; }); return o; } catch (_) { return {}; } };
  const plain = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const hsh = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'k' + (h >>> 0).toString(36); };
  window.tdySnooze = (k, on) => { const o = snz(); if (on) o[k] = Date.now() + 7 * 864e5; else delete o[k]; try { localStorage.setItem(SK, JSON.stringify(o)); } catch (_) {} window.shRefresh && shRefresh(); };
  window.tdyF = (f, who) => { TF.f = f; TF.who = who || null; try { if (f !== 'who') localStorage.setItem('ao.tdyF', f); } catch (_) {} window.shRefresh && shRefresh(); };
  const build = (scr, keys) => { const m = pmap(), out = [], S0 = snz(), R = ST.req || new Map();
    (keys || SCREENS[scr] || SCREENS.mywork).forEach(k => { let b; try { b = B[k](m); } catch (e) { return; } if (!b || (b.link && !ok(b.link))) return;
      b.items.forEach(x => { x.k = hsh(plain(x.go + '|' + x.t + '|' + x.o + '|' + String(x.s).split(' · ')[0].replace(/\d+ d (overdue|at this stage)|in \d+ d|today/g, ''))); x.z = !!S0[x.k]; x.w = owner(x); x.r = R.get(x.k) || null; x.h = b.h; x.link = b.link; }); out.push(b); });
    return out; };
  const mineX = x => !!x.w.e && x.w.e.toLowerCase() === meE();
  window.apxTodayCount = scr => { if (!D().progs) return 0; let n = 0; build(scr).forEach(b => b.items.forEach(x => { if (x.warn && !x.z && !x.r) n++; })); return n; };

  /* fix requests: open a ready email in the admin's own mail app and record who asked whom, when */
  const SITE = 'https://apex1-consol.github.io/preview/';
  async function record(xs) { const seen = new Set(), rows = xs.filter(x => !x.r && !seen.has(x.k) && seen.add(x.k)).map(x => ({ item_key: x.k, screen: x.link, title: plain(x.t).slice(0, 200), detail: plain(x.s).slice(0, 300), owner_name: x.w.n, owner_email: x.w.e || null }));
    if (!rows.length) return; try { const r = await sb().from('fix_requests').insert(rows); if (r.error) throw r.error; } catch (e) { alert('Could not record the request: ' + (e.message || e)); } await loadSide(true); }
  function mail(w, xs) { const n = xs.length, list = xs.slice(0, 25).map(x => `- ${x.h}: ${plain(x.t)} (${plain(x.s)})\n  ${SITE}#${x.link}`).join('\n');
    const body = `Hi ${w.n.split(/\s/)[0]},\n\nPlease update ApexOne for the following${n > 1 ? ' ' + n + ' items' : ''}:\n\n${list}${n > 25 ? `\n\n...and ${n - 25} more: open ApexOne, press the Today button (top right) and choose "Mine".` : ''}\n\nEach line clears by itself once the information is in ApexOne.\n\nThank you`;
    const subj = n > 1 ? `ApexOne: ${n} items to update` : `ApexOne: please update ${plain(xs[0].t).slice(0, 60)}`;
    apxMail(`mailto:${encodeURIComponent(w.e || '')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`); }
  let LAST = [];
  window.tdyReq = i => { const x = LAST[i]; if (!x || !isAdm()) return; mail(x.w, [x]); record([x]); };
  window.tdyReqAll = who => { if (!isAdm()) return; const xs = LAST.filter(x => x.w.n === who && !x.z && !x.r); if (!xs.length) return; mail(xs[0].w, xs); record(xs); };
  window.tdyUnreq = async i => { const x = LAST[i]; if (!x?.r || !isAdm()) return; try { await sb().from('fix_requests').update({ cleared_at: new Date().toISOString() }).eq('item_key', x.k).is('cleared_at', null); } catch (_) {} loadSide(true); };
  let cleared = false;
  function clearGone() { // a request is done once its line no longer appears anywhere: close it (admins, once per page load, after the data has loaded)
    if (cleared || !isAdm() || !ST.req || !ST.req.size || !D().progs || !(D().tracker || []).length) return; cleared = true;
    const all = new Set(); build('hoo', ALLB).forEach(b => b.items.forEach(x => all.add(x.k)));
    const gone = [...ST.req.keys()].filter(k => !all.has(k)); if (!gone.length) return;
    sb().from('fix_requests').update({ cleared_at: new Date().toISOString() }).in('item_key', gone).is('cleared_at', null).then(() => { gone.forEach(k => ST.req.delete(k)); window.shRefresh && shRefresh(); }, () => {}); }

  /* ---------- Overview on My work: every area, every marker; role decides the rows ---------- */
  const OVR = { pm: ['Delivery', 'recs', 'visits'], qa: ['Quality & compliance', 'eisa', 'dq'], pi: ['pi', 'programmes', 'clients'] };
  const OV = { open: null, t: 0, d: null, by: null };
  const ovData = () => { const d = D(); if (OV.by && OV.d === d.progs && Date.now() - OV.t < 20000) return OV.by;
    const by = new Map(); build(null, ALLB).forEach(b => { const k = b.link || 'other'; if (!by.has(k)) by.set(k, []); b.items.forEach(x => { x.hh = b.h; by.get(k).push(x); }); });
    Object.assign(OV, { t: Date.now(), d: d.progs, by }); return by; };
  const lev = xs => xs.filter(x => x.warn).length > xs.length / 4 ? 'r' : xs.length ? 'a' : 'g';
  const LAB = { 'Open recommendations': x => x.warn ? 'overdue' : 'due soon', 'Visits due': x => /^Next/.test(plain(x.s)) ? 'visit due' : 'no visit recorded', 'EISA coming up': () => 'EISA coming up',
    'Attendance': x => /regist/i.test(plain(x.s)) ? 'no recent register' : 'high absences', 'Not started, programme running 30+ days': () => 'with learners not started', 'Accreditation': x => /^Expires/.test(plain(x.s)) ? 'expiring' : null };
  const why = x => (LAB[x.hh] && LAB[x.hh](x)) || plain(x.s).split(' · ')[0].replace(/:.*/, '').replace(/\b\d[\d/]*\b/g, '').replace(/\s+/g, ' ').trim();
  const marks = xs => { const grp = f => { const g = new Map(); xs.forEach(x => { const k = f(x); if (!g.has(k)) g.set(k, { k, n: 0, w: 0 }); const o = g.get(k); o.n++; if (x.warn) o.w++; }); return [...g.values()]; };
    const r = grp(why); return (r.length > 4 ? grp(x => x.hh) : r).sort((a, b) => b.w - a.w || b.n - a.n); };
  window.apxNavDot = r => { if (!D().progs) return ''; const xs = ovData().get(r); if (!xs || !xs.length) return ''; const l = lev(xs);
    return `<span class="navdot ${l}" aria-label="${l === 'r' ? 'Urgent items' : 'Items to check'}"></span>`; };
  window.ovTog = r => { OV.open = OV.open === r ? null : r; window.previewShell && previewShell(); };
  window.apxOverview = role => { if (!D().progs || typeof NAV === 'undefined') return ''; const by = ovData(), f = OVR[role]; let nr = 0, na = 0;
    const row = o => { const on = OV.open === o.r, w = new Map(); o.xs.forEach(x => w.set(x.w.n, (w.get(x.w.n) || 0) + 1));
      return `<div class="ovr ${o.lv}"><button type="button" class="ovt" onclick="ovTog('${o.r}')" aria-expanded="${on}"><b>${esc(o.l)}</b><span class="ovc">${o.xs.length ? marks(o.xs).map(m => `<span class="ovp ${m.w ? 'r' : 'a'}">${m.n} ${esc(m.k)}</span>`).join('') : '<span class="ovp g">All clear</span>'}</span><span class="ovx" aria-hidden="true">${on ? '▾' : '▸'}</span></button>`
        + (on ? `<div class="ovd"><span>${o.xs.length ? 'Who actions it: ' + [...w].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${esc(n)} ${c}`).join(' · ') : 'Nothing open.'}</span><a href="#${o.r}">Open ${esc(o.l)} →</a></div>` : '') + '</div>'; };
    const body = NAV.map(([g, its]) => [g, its.filter(([, r]) => by.has(r) && ok(r) && (!f || f.includes(g) || f.includes(r)))]).filter(([, its]) => its.length)
      .map(([g, its]) => `<div class="ovg">${esc(g)}</div>` + its.map(([l, r]) => { const xs = by.get(r), lv = lev(xs); if (lv === 'r') nr++; else if (lv === 'a') na++; return { l, r, xs, lv }; })
        .sort((a, b) => 'rag'.indexOf(a.lv) - 'rag'.indexOf(b.lv)).map(row).join('')).join('');
    return body ? `<section class="card ov"><div class="ovh"><b>Overview</b><span class="sub">${nr} urgent · ${na} to check · click a row to see who actions it</span></div>${body}</section>` : ''; };

  window.apxToday = scr => {
    if (!D().progs) return '<div class="empty"><b>Loading…</b></div>';
    if (!ST.list || !ST.req) loadSide(); else clearGone();
    if (!TF.f || TF.f === 'who' && !isAdm()) TF.f = 'all';
    const adm = isAdm(), byP = TF.f === 'who', out = build(scr, byP && scr === 'hoo' ? ALLB : null), all = out.flatMap(b => b.items);
    const open = all.filter(x => !x.z), need = open.filter(x => x.warn && !x.r), wait = open.filter(x => x.r), mine = open.filter(mineX), zz = all.length - open.length;
    LAST = all;
    if (TF.f === 'all' && !TF.set) { TF.set = 1; let sv = null; try { sv = localStorage.getItem('ao.tdyF'); } catch (_) {} if (!sv && mine.length) TF.f = 'mine'; }
    const pick = { all: x => !x.z, need: x => x.warn && !x.z && !x.r, mine: x => mineX(x) && !x.z, wait: x => x.r && !x.z, snz: x => x.z, who: x => !x.z && (!TF.who || x.w.n === TF.who) }[TF.f] || (x => !x.z);
    const chip = (f, n, l, c) => `<button type="button" class="tdyc${TF.f === f && !TF.who ? ' on' : ''}" aria-pressed="${TF.f === f}" onclick="tdyF('${f}')"><span class="badge ${c}">${n}</span> ${l}</button>`;
    const head = `<div class="sub">${scr in SCREENS ? 'What to act on now on this screen, and who must action it.' : 'Your day across ApexOne.'} ${fmt(new Date().toISOString())} · ${open.length} open</div>
      <div class="tdycs">${chip('all', open.length, 'All', '')}${chip('need', need.length, 'Needs action', 'b-warn')}${mine.length ? chip('mine', mine.length, 'Mine', 'b-ok') : ''}${wait.length ? chip('wait', wait.length, 'Requested', '') : ''}${adm ? chip('who', new Set(open.map(x => x.w.n)).size, 'By person', '') : ''}${zz ? chip('snz', zz, 'Snoozed', '') : ''}</div>`;
    const q = s => esc(s).replace(/'/g, '');
    const row = x => { const i = LAST.indexOf(x), rq = x.r ? `Requested ${fmt(x.r.requested_at)} by ${esc(String(x.r.requested_by || '').split('@')[0])}` : '';
      return `<div class="tdyr"><button type="button" class="tdyi${x.warn && !x.r ? ' w' : ''}${x.r ? ' q' : ''}" onclick="${esc(x.go)}"><b>${x.t}</b><span>${x.s}</span><span class="tdyo">→ ${esc(x.w.n + (x.w.why || ''))}${rq ? ' · ' + rq : ''}</span></button>
        <span class="tdyb">${adm && x.w.e && !x.r ? `<button type="button" class="tdyz" title="Email ${esc(x.w.n)} to fix this" aria-label="Request fix from ${esc(x.w.n)}" onclick="tdyReq(${i})">✉</button>` : ''}${adm && x.r ? `<button type="button" class="tdyz" title="Clear the request mark" aria-label="Clear request" onclick="tdyUnreq(${i})">✓</button>` : ''}<button type="button" class="tdyz" title="${x.z ? 'Bring back' : 'Snooze 7 days'}" aria-label="${x.z ? 'Bring back' : 'Snooze 7 days'}" onclick="tdySnooze('${x.k}',${!x.z})">${x.z ? '↺' : 'z'}</button></span></div>`; };
    if (byP && !TF.who) { const g = new Map(); open.forEach(x => { const k = x.w.n; if (!g.has(k)) g.set(k, { w: x.w, n: 0, need: 0, req: 0 }); const o = g.get(k); o.n++; if (x.warn && !x.r) o.need++; if (x.r) o.req++; });
      const rows = [...g.values()].sort((a, b) => b.need - a.need || b.n - a.n);
      return head + `<div class="sub">${scr === 'hoo' ? 'Everything in ApexOne' : 'This screen'}, grouped by who must action it.${scr === 'hoo' ? '' : ' Head of Ops shows all screens.'}</div>` + rows.map(o => `<div class="tdyr"><button type="button" class="tdyi${o.need ? ' w' : ''}" onclick="tdyF('who','${q(o.w.n)}')"><b>${esc(o.w.n)}</b><span>${o.n} open · ${o.need} need action${o.req ? ' · ' + o.req + ' requested' : ''}</span></button>
        <span class="tdyb">${adm && o.w.e && o.n > o.req ? `<button type="button" class="tdyz" style="width:auto;padding:0 8px" title="One email to ${esc(o.w.n)} listing all ${o.n - o.req} unrequested items" onclick="tdyReqAll('${q(o.w.n)}')">✉ all</button>` : ''}</span></div>`).join(''); }
    const shown = out.map(b => ({ b, items: b.items.filter(pick) })).filter(o => o.items.length);
    const back = TF.who ? `<div class="tdycs"><button type="button" class="tdyc" onclick="tdyF('who')">‹ Everyone</button>${adm && open.some(x => x.w.n === TF.who && x.w.e && !x.r) ? `<button type="button" class="tdyc" onclick="tdyReqAll('${q(TF.who)}')">✉ Request all from ${esc(TF.who)}</button>` : ''}</div>` : '';
    if (!shown.length) return head + back + `<div class="empty"><b>${TF.f === 'snz' ? 'Nothing snoozed' : 'All clear ✓'}</b><span>${TF.f === 'all' ? 'Nothing due or overdue here.' : ''}</span></div>`;
    const lim = TF.who || TF.f === 'mine' ? 50 : MAX;
    return head + back + shown.map(({ b, items }) => { const n = items.length, w = items.filter(x => x.warn && !x.r).length;
      const rows = items.slice().sort((a, c) => ((c.warn && !c.r) ? 1 : 0) - ((a.warn && !a.r) ? 1 : 0)).slice(0, lim);
      return `<section class="tdy"><h3>${esc(b.h)} <span class="sub" style="font-weight:400">${n}${w && TF.f !== 'need' ? ` · <span style="color:var(--warn)">${w} need action</span>` : ''}</span></h3>
        ${rows.map(row).join('')}
        ${n > lim && LBL[b.link] ? `<a class="sub" href="#${b.link}">All ${n} in ${LBL[b.link]} ›</a>` : ''}</section>`; }).join('');
  };
  if (!document.getElementById('tdycss')) document.head.insertAdjacentHTML('beforeend', `<style id="tdycss">
    .tdy{display:flex;flex-direction:column;gap:4px}.tdy h3{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
    .tdyi{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;width:100%;padding:7px 10px;border:1px solid var(--line,#e5e5ef);border-left:3px solid var(--line,#e5e5ef);border-radius:8px;background:none;font:inherit;font-size:13px;color:var(--ink);cursor:pointer}
    .tdyi:hover{background:var(--hover,rgba(0,0,0,.03))}.tdyi.w{border-left-color:var(--warn,#c80)}.tdyi.q{border-left-color:var(--ok,#2a8)}.tdyi span{color:var(--muted);font-size:12px}
    .tdyi b{font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:100%;white-space:nowrap}.tdyi .tdyo{color:var(--ink);opacity:.75}
    .tdyr{display:flex;gap:4px;align-items:stretch}.tdyr .tdyi{flex:1;min-width:0}.tdyb{display:flex;flex-direction:column;gap:4px}.tdyb:empty{display:none}
    .tdyz{flex:1 0 auto;width:28px;min-height:26px;border:1px solid var(--line,#e5e5ef);border-radius:8px;background:none;color:var(--muted);cursor:pointer;font:inherit;font-size:12px}.tdyz:hover{color:var(--ink)}
    .tdycs{display:flex;gap:6px;flex-wrap:wrap}.tdyc{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:3px 10px 3px 4px;font:inherit;font-size:13px;cursor:pointer;display:flex;gap:6px;align-items:center}.tdyc.on{border-color:var(--ink)}
    #view-fam .famdrawer{z-index:61!important}</style>`);
})();
