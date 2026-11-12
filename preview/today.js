/* ApexOne preview — "Today" side panel per screen (2026-11-12).
   Same idea as FAM's Today panel: what to act on now on this screen, each line one click away.
   Reads only the data live.js already loaded (P.data). No writes, no extra queries. FAM keeps its own panel. */
(function () {
  const P = window.__preview, D = () => (P && P.data) || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T0 = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const dd = s => { if (!s) return null; const t = Date.parse(String(s).slice(0, 10)); return isNaN(t) ? null : Math.round((t - T0) / 864e5); };
  const fmt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const when = n => n == null ? '' : n === 0 ? 'today' : n < 0 ? `${-n} d overdue` : `in ${n} d`;
  const ok = h => !window.NAVR || !NAVR[h] || NAVR[h]();
  const progs = () => (D().progs || []).filter(p => !String(p.programme_name || '').startsWith('[TEST]') && (!window.apxMineProg || apxMineProg(p)));
  const pmap = () => { const m = new Map(); progs().forEach(p => m.set(String(p.id), p)); return m; };
  const live = p => p.status === 'active';
  const pname = p => esc((p?.programme_name || '').replace('[TEST] ', '') || 'Programme');
  const goP = id => `location.hash='programmes';setTimeout(()=>window.dvProg&&dvProg(${+id}),60)`;
  const goH = h => `location.hash='${h}'`;
  const lname = id => { const l = (D().learners || []).find(x => x.id === id); return l ? esc((l.first_name + ' ' + l.last_name).trim()) : 'Learner'; };
  const F = (o, ...k) => { const f = o.fields || {}; for (const x of k) if (f[x]) return f[x]; return ''; };
  const it = (t, s, go, warn) => ({ t, s, go, warn });
  const byN = (a, k = 'n') => a.sort((x, y) => (x[k] ?? 9e9) - (y[k] ?? 9e9));

  /* ---------- building blocks, each returns { h, items, link } ---------- */
  const B = {
    recs(m) { const r = byN((D().recs || []).filter(x => !x.resolved && m.has(String(x.programme_id))).map(x => ({ x, n: dd(F(x, 'Due Date')) })));
      return { h: 'Open recommendations', link: 'recs', items: r.filter(o => o.n == null || o.n <= 14).map(o => it(esc(String(F(o.x, 'Text')).slice(0, 80) || 'Recommendation'), `${pname(m.get(String(o.x.programme_id)))} · ${F(o.x, 'Owner') ? esc(F(o.x, 'Owner')) + ' · ' : ''}${o.n == null ? 'no due date' : 'due ' + when(o.n)}`, goH('recs'), o.n == null || o.n < 0)) }; },
    visits(m) { const v = D().visits || [], last = new Map(), next = [];
      v.forEach(x => { const k = String(x.programme_id), d = F(x, 'Date of Visit', 'Date'), n = F(x, 'Next Visit Date'); if (d && (!last.get(k) || d > last.get(k))) last.set(k, d); if (n && m.has(k)) next.push({ x, n: dd(n), d: n }); });
      const due = byN(next.filter(o => o.n != null && o.n <= 14)).map(o => it(pname(m.get(String(o.x.programme_id))), `Next visit ${fmt(o.d)} · ${when(o.n)}`, goH('visits'), o.n < 0));
      const none = [...m.values()].filter(p => live(p) && (dd(p.start_date) ?? 1) <= -30 && !(last.get(String(p.id)) && dd(last.get(String(p.id))) > -90))
        .map(p => it(pname(p), last.get(String(p.id)) ? `Last visit ${fmt(last.get(String(p.id)))}` : 'No visit recorded', goP(p.id), true));
      return { h: 'Visits due', link: 'visits', items: due.concat(none) }; },
    eisa(m) { const t = byN((D().tracker || []).filter(x => m.has(String(x.programme_id)) && x.eisa_date && !x.eisa_outcome).map(x => ({ x, n: dd(x.eisa_date) })).filter(o => o.n >= -7 && o.n <= 30));
      const g = new Map(); t.forEach(o => { const k = o.x.programme_id + '|' + String(o.x.eisa_date).slice(0, 10); g.set(k, (g.get(k) || { o, c: 0 })); g.get(k).c++; });
      const w = byN((D().windows || []).map(x => ({ x, n: dd(x.registration_closing) })).filter(o => o.n != null && o.n >= 0 && o.n <= 21));
      return { h: 'EISA coming up', link: 'eisa', items: [...g.values()].map(({ o, c }) => it(pname(m.get(String(o.x.programme_id))), `${c} learner${c > 1 ? 's' : ''} · EISA ${fmt(o.x.eisa_date)} · ${when(o.n)}`, `window.dvGo?dvGo('eisa','Readiness'):${goH('eisa')}`, o.n <= 7))
        .concat(w.map(o => it(esc(o.x.label || o.x.qualification || 'EISA window'), `Registration closes ${fmt(o.x.registration_closing)} · ${when(o.n)}`, goH('eisa'), o.n <= 7))) }; },
    qcto(m) { const t = (D().tracker || []).filter(x => m.has(String(x.programme_id)) && x.current_status === 'Not Started'), g = new Map();
      t.forEach(x => { const p = m.get(String(x.programme_id)); if (p && (dd(p.start_date) ?? 1) <= -30) g.set(p.id, (g.get(p.id) || 0) + 1); });
      return { h: 'Not started, programme running 30+ days', link: 'qcto', items: [...g].sort((a, b) => b[1] - a[1]).map(([id, c]) => it(pname(m.get(String(id))), `${c} learner${c > 1 ? 's' : ''} still Not Started`, goH('qcto'), true)) }; },
    mods(m) { const r = (D().mods || []).filter(x => m.has(String(x.programme_id)) && x.stage !== 'Submitted to PM').map(x => ({ x, n: dd(x.stage_date), e: dd(x.exit_verification_date) }));
      const it2 = r.filter(o => o.x.stage === 'On hold' || (o.n != null && o.n <= -30) || (o.e != null && o.e >= 0 && o.e <= 30))
        .map(o => it(pname(m.get(String(o.x.programme_id))), `${esc(o.x.stage || 'No stage')}${o.e != null && o.e >= 0 && o.e <= 30 ? ' · exit verification ' + fmt(o.x.exit_verification_date) : o.n != null ? ' · ' + (-o.n) + ' d at this stage' : ''}`, goH('modver'), o.x.stage === 'On hold' || o.n <= -30));
      return { h: 'Moderation needing a push', link: 'modver', items: it2 }; },
    accs() { const a = byN((D().accs || []).map(x => ({ x, n: dd(x.accreditation_to) })));
      return { h: 'Accreditation', link: 'accred', items: a.filter(o => (o.n != null && o.n <= 120) || (o.x.status && o.x.status !== 'Accreditation granted'))
        .map(o => it(esc(`${o.x.saqa_id || ''} ${o.x.title || ''}`.trim()), o.n != null && o.n <= 120 ? `Expires ${fmt(o.x.accreditation_to)} · ${when(o.n)}` : esc(o.x.status) + (o.x.site_visit_date ? ' · site visit ' + fmt(o.x.site_visit_date) : ''), goH('accred'), o.n != null && o.n <= 60)) }; },
    signoffs() { const s = (D().signoffs || []).filter(x => !x.status || /pend|submit|open/i.test(x.status));
      return { h: 'Waiting for sign-off', link: 'signoff', items: s.map(x => it(esc(x.title || x.kind || 'Item'), `${esc(x.submitted_by || '')}${x.created_at ? ' · ' + fmt(x.created_at) : ''}`, goH('signoff'), (dd(x.created_at) ?? 0) <= -3)) }; },
    reports(m) { const r = (D().reports || []).filter(x => !x.archived_at && (!x.programme_id || m.has(String(x.programme_id))));
      const items = [];
      r.forEach(x => { const nm = esc(x.programme_name_snapshot || x.client_name_snapshot || 'Report') + (x.month ? ' · ' + esc(String(x.month).slice(0, 7)) : '');
        if (x.status === 'needs_changes') items.push(it(nm, 'Needs changes' + (x.reviewer_note ? ': ' + esc(String(x.reviewer_note).slice(0, 60)) : ''), goH('reports'), true));
        else if (x.status === 'approved' && !x.sent_at) items.push(it(nm, 'Approved, not sent to client', goH('reports'), (dd(x.reviewed_at) ?? 0) <= -3));
        else if (x.remind_pm_at && dd(x.remind_pm_at) <= 0) items.push(it(nm, 'PM reminder due ' + fmt(x.remind_pm_at), goH('reports'), true));
        else if (x.hold_until && dd(x.hold_until) <= 3) items.push(it(nm, 'Hold ends ' + fmt(x.hold_until) + (x.hold_reason ? ' · ' + esc(x.hold_reason) : ''), goH('reports'), dd(x.hold_until) < 0)); });
      return { h: 'Reports to move', link: 'reports', items }; },
    dates(m) { const r = byN([...m.values()].filter(live).flatMap(p => [['Starts', p.start_date], ['Ends', p.end_date]].map(([k, d]) => ({ p, k, d, n: dd(d) }))).filter(o => o.n != null && o.n >= -3 && o.n <= 21));
      return { h: 'Starting or ending soon', link: 'pmtracker', items: r.map(o => it(pname(o.p), `${o.k} ${fmt(o.d)} · ${when(o.n)}`, goP(o.p.id), o.k === 'Ends' && o.n <= 7)) }; },
    gaps(m) { const L = new Set((D().enrol || []).map(e => String(e.programme_id)));
      const r = [...m.values()].filter(p => p.status !== 'closed').map(p => ({ p, miss: [!p.saqa_id && 'SAQA', !p.project_manager_name && 'PM', !(p.start_date && p.end_date) && 'dates', live(p) && !L.has(String(p.id)) && 'learners'].filter(Boolean) })).filter(o => o.miss.length);
      return { h: 'Programmes missing details', link: 'programmes', items: r.sort((a, b) => b.miss.length - a.miss.length).map(o => it(pname(o.p), 'Missing ' + o.miss.join(', '), goP(o.p.id), o.miss.length > 1)) }; },
    clients(m) { const used = new Set([...m.values()].filter(live).map(p => String(p.client_id)));
      const c = (D().clients || []).filter(x => !x.deleted_at && (!window.apxMineProg || used.has(String(x.id))));
      return { h: 'Clients missing details', link: 'clients', items: c.map(x => ({ x, miss: [!x.project_manager && 'PM', !x.contact_email && 'contact email', !x.contact_number && 'contact number'].filter(Boolean) })).filter(o => o.miss.length)
        .map(o => it(esc(o.x.client_name), 'Missing ' + o.miss.join(', ') + (used.has(String(o.x.id)) ? ' · has live programmes' : ''), goH('clients'), !o.x.project_manager && used.has(String(o.x.id)))) }; },
    att(m) { const last = new Map(); (D().sessions || []).forEach(s => { const k = String(s.programme_id); if (dd(s.session_date) <= 0 && (!last.get(k) || s.session_date > last.get(k))) last.set(k, s.session_date); });
      const A = window.dvApi, quiet = [...m.values()].filter(p => live(p) && (dd(p.start_date) ?? 1) <= -14 && A && A.learnersOf(p.id).length && !(last.get(String(p.id)) && dd(last.get(String(p.id))) > -14))
        .map(p => it(pname(p), last.get(String(p.id)) ? `Last register ${fmt(last.get(String(p.id)))}` : 'No register captured', `window.dvProg&&dvProg(${p.id});window.dvGo?dvGo('attendance','Register'):${goH('attendance')}`, true));
      const ab = new Map(); (D().att || []).forEach(a => { if (m.has(String(a.programme_id)) && /^a/i.test(a.status || '') && dd(a.session_date) >= -30) { const k = a.programme_id + '|' + a.learner_id; ab.set(k, (ab.get(k) || 0) + 1); } });
      const hi = [...ab].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).map(([k, c]) => { const [pid, lid] = k.split('|'); return it(lname(+lid), `${c} absences in 30 days · ${pname(m.get(pid))}`, `window.shOpen&&shOpen(${+pid},${+lid})`, c >= 5); });
      return { h: 'Attendance', link: 'attendance', items: quiet.concat(hi) }; },
    learners(m) { const E = new Set((D().enrol || []).map(e => e.learner_id)), L = (D().learners || []).filter(l => !/\[TEST\]|^test/i.test(l.first_name || ''));
      const enrolled = window.apxMineProg ? new Set((D().enrol || []).filter(e => m.has(String(e.programme_id))).map(e => e.learner_id)) : null;
      const r = L.filter(l => enrolled ? enrolled.has(l.id) : true).map(l => ({ l, miss: [!l.id_number && 'ID number', !l.email && 'email', !l.phone && 'phone', !enrolled && !E.has(l.id) && 'enrolment'].filter(Boolean) })).filter(o => o.miss.includes('ID number') || o.miss.includes('enrolment'));
      return { h: 'Learners missing ID or enrolment', link: 'learners', items: r.sort((a, b) => b.miss.length - a.miss.length).map(o => it(esc((o.l.first_name + ' ' + o.l.last_name).trim()), 'Missing ' + o.miss.join(', '), `window.shOpen&&shOpen(null,${o.l.id})`, o.miss.includes('ID number'))) }; },
    enrol(m) { const T = new Set((D().tracker || []).map(t => String(t.enrolment_id))), g = new Map();
      (D().enrol || []).forEach(e => { const p = m.get(String(e.programme_id)); if (p && live(p) && !T.has(String(e.id))) g.set(p.id, (g.get(p.id) || 0) + 1); });
      return { h: 'Enrolments with no QCTO row', link: 'enrolments', items: [...g].sort((a, b) => b[1] - a[1]).map(([id, c]) => it(pname(m.get(String(id))), `${c} enrolment${c > 1 ? 's' : ''} not on the QCTO tracker`, goH('qcto'), false)) }; },
    sync() { const o = D().outbox || [], f = o.filter(x => /fail|error/i.test(x.status || '')), p = o.filter(x => /pend|queue/i.test(x.status || ''));
      const g = new Map(); f.forEach(x => g.set(x.source_table, (g.get(x.source_table) || 0) + 1));
      return { h: 'ClickUp sync', link: 'synchealth', items: [...g].map(([t, c]) => it(esc(t), `${c} failed · ${esc((f.find(x => x.source_table === t).last_error || '').slice(0, 70))}`, goH('synchealth'), true)).concat(p.length ? [it('Waiting to send', `${p.length} change${p.length > 1 ? 's' : ''} queued`, goH('synchealth'), p.length > 50)] : []) }; }
  };

  /* ---------- which blocks each screen shows (first = most relevant) ---------- */
  const SCREENS = {
    mywork: ['signoffs', 'recs', 'visits', 'eisa', 'reports', 'dates', 'mods', 'accs'],
    dashboard: ['dates', 'recs', 'visits', 'eisa', 'mods', 'reports'],
    hoo: ['signoffs', 'gaps', 'clients', 'recs', 'mods', 'reports', 'accs', 'sync'],
    reports: ['reports'], clients: ['clients', 'dates'], pmtracker: ['dates', 'recs', 'visits', 'reports'],
    programmes: ['dates', 'gaps', 'recs'], pi: ['gaps', 'dates'], learners: ['learners', 'att'], dq: ['learners', 'enrol'],
    enrolments: ['enrol', 'learners'], eisa: ['eisa', 'qcto'], qcto: ['eisa', 'qcto', 'enrol'], attendance: ['att'],
    visits: ['visits', 'recs'], recs: ['recs', 'visits'], modver: ['mods', 'eisa'], accred: ['accs'], signoff: ['signoffs', 'recs'],
    synchealth: ['sync'], assessors: ['mods', 'accs']
  };
  const LBL = { recs: 'Recommendations', visits: 'Visits', eisa: 'EISA', qcto: 'QCTO tracker', modver: 'Moderation', accred: 'Accreditation', signoff: 'Sign-off', reports: 'Reports', pmtracker: 'PM Tracker', programmes: 'Programmes', clients: 'Clients', attendance: 'Attendance', learners: 'Learners', enrolments: 'Enrolments', synchealth: 'Sync health' };
  const MAX = 6;

  window.apxToday = scr => {
    const keys = (SCREENS[scr] || SCREENS.mywork), m = pmap(), out = [];
    keys.forEach(k => { let b; try { b = B[k](m); } catch (e) { return; } if (!b || (b.link && !ok(b.link))) return; out.push(b); });
    const shown = out.filter(b => b.items.length);
    const head = `<div class="sub">${scr in SCREENS ? 'What to act on now on this screen.' : 'Nothing specific for this screen; here is your day.'} Click a line to open it.</div>`;
    if (!D().progs) return head + '<div class="empty"><b>Loading…</b></div>';
    if (!shown.length) return head + '<div class="empty"><b>All clear</b><span>Nothing due or overdue here.</span></div>';
    return head + shown.map(b => { const n = b.items.length, w = b.items.filter(x => x.warn).length;
      const rows = b.items.slice().sort((a, c) => (c.warn ? 1 : 0) - (a.warn ? 1 : 0)).slice(0, MAX);
      return `<div class="tdy"><h3>${esc(b.h)} <span class="sub" style="font-weight:400">${n}${w ? ` · <span style="color:var(--warn)">${w} need action</span>` : ''}</span></h3>
        ${rows.map(x => `<button type="button" class="tdyi${x.warn ? ' w' : ''}" onclick="${esc(x.go)}"><b>${x.t}</b><span>${x.s}</span></button>`).join('')}
        ${n > MAX && LBL[b.link] ? `<a class="sub" href="#${b.link}">All ${n} in ${LBL[b.link]} ›</a>` : ''}</div>`; }).join('');
  };
  if (!document.getElementById('tdycss')) document.head.insertAdjacentHTML('beforeend', `<style id="tdycss">
    .tdy{display:flex;flex-direction:column;gap:4px}.tdy h3{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
    .tdyi{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;width:100%;padding:7px 10px;border:1px solid var(--line,#e5e5ef);border-left:3px solid var(--line,#e5e5ef);border-radius:8px;background:none;font:inherit;font-size:13px;color:var(--ink);cursor:pointer}
    .tdyi:hover{background:var(--hover,rgba(0,0,0,.03))}.tdyi.w{border-left-color:var(--warn,#c80)}.tdyi span{color:var(--muted);font-size:12px}
    .tdyi b{font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:100%;white-space:nowrap}</style>`);
})();
