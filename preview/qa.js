/* ApexOne redesign preview — QA / ETQA module. Loaded after live.js.
   Screens: QCTO Projects Tracker, Moderation & Verification, Accreditation (+ legacy check), LEISA file.
   Columns, statuses and file layouts follow the team's own workbooks:
   QCTO Projects Tracker.xlsx, External Moderation – 2026.xlsx (4 sheets), the QCTO LEISA template,
   and the Consolidated List of Pre-2009 / NATED qualifications.
   Writes go through previewWrite (same error handling as live.js) and are limited by RLS to
   admin, qa_specialist and etqa. */
(function () {
  const sb = window.__sb, P = window.__preview, write = window.previewWrite;
  if (!sb || !P || !write) return;

  /* ---------- helpers ---------- */
  const say = m => { window.toast(m); const t = $('toast'); if (t) t.textContent = m; };
  const QA = () => (P.roles || []).some(r => ['admin', 'qa_specialist', 'etqa'].includes(r));
  const iso = () => new Date().toISOString().slice(0, 10);
  const day = s => s ? String(s).slice(0, 10) : '';
  const ymd = s => s ? day(s).replace(/-/g, '') : '';
  const H = h => `<thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead>`;
  const dIn = (fn, v, lab) => QA() ? `<input type="date" class="cellin" aria-label="${lab}" value="${day(v)}" onchange="${fn}">` : fmtD(day(v));
  const tIn = (fn, v, lab, w = 160) => QA() ? `<input class="cellin" aria-label="${lab}" style="min-width:${w}px" value="${esc(v || '')}" onchange="${fn}">` : esc(v || '');
  const D = () => P.data || {};
  TODAY.setTime(new Date(iso() + 'T00:00:00').getTime()); // day counts follow the real date

  document.head.insertAdjacentHTML('beforeend', `<style>
  .cellin{height:30px;border:1px solid var(--line);border-radius:6px;padding:0 6px;font:inherit;font-size:13px;background:transparent;color:var(--ink);max-width:100%}
  .cellin:focus{outline:2px solid #FBDC00;outline-offset:1px}
  #qaov{position:fixed;inset:0;background:rgba(0,20,45,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
  #qaov .card{width:min(720px,100%);display:flex;flex-direction:column;gap:12px}
  .qagrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
  .qagrid label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}
  .qagrid input,.qagrid select{height:36px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;font-size:14px;color:var(--ink);background:transparent}
  .qagrid .bad input{border-color:var(--bad)}
  </style>`);

  /* small form overlay used by the "Add" buttons */
  function form(title, fields, onSave) {
    close();
    document.body.insertAdjacentHTML('beforeend', `<div id="qaov" role="dialog" aria-modal="true" aria-label="${esc(title)}"><form class="card" id="qaform"><h2>${esc(title)}</h2>
      <div class="qagrid">${fields.map(([k, lab, type, opts, val]) => `<label>${lab}${type === 'select'
        ? `<select name="${k}">${opts.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input name="${k}" type="${type || 'text'}" value="${esc(val ?? '')}">`}</label>`).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="qacancel">Cancel</button><button class="btn y">Save</button></div></form></div>`);
    $('qacancel').onclick = close;
    $('qaform').onsubmit = async e => { e.preventDefault(); const v = {}; fields.forEach(([k]) => { const x = $('qaform').elements[k].value.trim(); v[k] = x === '' ? null : x; });
      try { await onSave(v); close(); } catch (err) { /* write() already showed the error */ } };
  }
  function close() { const o = $('qaov'); if (o) o.remove(); }
  function rebind(text, fn) { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('onclick') || '').includes(text)); if (b) { b.removeAttribute('onclick'); b.onclick = fn; } return b; }

  /* ---------- spreadsheet export (SheetJS) ---------- */
  function xl() { if (!window.XLSX) { say('Export needs the spreadsheet library, which did not load. Check the internet connection and reload.'); return null; } return window.XLSX; }
  const serial = s => (Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  // aoa: rows of values; dateCols: column indexes whose yyyy-mm-dd strings become real Excel dates; textCols:'all' keeps every cell as text
  function sheet(X, aoa, { dateCols = [], allText = false, widths } = {}) {
    const ws = X.utils.aoa_to_sheet(aoa.map(r => r.map(v => v == null ? '' : allText ? String(v) : v)));
    aoa.forEach((r, ri) => r.forEach((v, ci) => {
      const a = X.utils.encode_cell({ r: ri, c: ci });
      if (ri && dateCols.includes(ci) && /^\d{4}-\d{2}-\d{2}/.test(v || '')) ws[a] = { t: 'n', v: serial(String(v)), z: 'yyyy-mm-dd' };
      else if (allText && ws[a]) { ws[a].t = 's'; ws[a].v = String(v ?? ''); }
    }));
    ws['!cols'] = widths || Array.from({ length: Math.max(...aoa.map(r => r.length)) }, (h, i) => ({ wch: Math.min(48, Math.max(10, ...aoa.slice(0, 40).map(r => String(r[i] ?? '').length + 2))) }));
    return ws;
  }
  function save(X, wb, name) { X.writeFile(wb, name); say('Exported ' + name); return name; }
  const stamp = () => { const d = new Date(); return d.getDate() + '_' + d.toLocaleString('en-GB', { month: 'short' }) + '_' + String(d.getFullYear()).slice(2); };

  /* =====================================================================
     QCTO PROJECTS TRACKER
     ===================================================================== */
  const TCOL = { monD: 'monitoring_date', sorD: 'sor_issued_date', eD: 'eisa_date', cm: 'comments', a: 'assessor', d: 'duration' };
  function augTracker() {
    const d = D();
    QT.forEach(r => { const t = (d.tracker || []).find(x => x.id === r.dbid); if (!t) return; const l = (d.learners || []).find(x => x.id === t.learner_id) || {};
      Object.assign(r, { a: t.assessor || '', d: t.duration || '', lid: t.learner_id, pid: t.programme_id, sn: l.last_name || '', idFull: l.id_number || '' }); });
    QCO.forEach((k, ci) => { const a = QT.find(r => r.ci === ci); if (a) { k.a = a.a; k.d = a.d; k.pid = a.pid; } });
    const w = (d.windows || []).filter(x => x.eisa_date >= iso()).sort((a, b) => a.eisa_date < b.eisa_date ? -1 : 1);
    if (d.windows) { QWIN.length = 0; w.slice(0, 2).forEach((x, i) => QWIN.push(['Next official EISA date ' + (i + 1), x.eisa_date, 'Registration closing date ' + (i + 1), x.registration_closing])); }
    if (!QWIN.length) QWIN.push(['Next official EISA date 1', '', 'Registration closing date 1', '']);
  }
  // next two official windows for one tracker row (a window can be limited to one qualification ID)
  function winFor(r) {
    const saqa = (D().progs || []).find(p => p.id === r.pid)?.saqa_id;
    return (D().windows || []).filter(x => x.eisa_date >= iso() && (!x.qualification || x.qualification === saqa)).sort((a, b) => a.eisa_date < b.eisa_date ? -1 : 1).slice(0, 2);
  }
  window.qaT = async function (i, k, v) {
    const r = QT[i], before = r[k]; r[k] = v || (['cm', 'a', 'd'].includes(k) ? '' : null); renderQ();
    const rec = (D().tracker || []).find(x => x.id === r.dbid);
    try { await write('Tracker', () => sb.from('qcto_tracker').update({ [TCOL[k]]: v || null }).eq('id', r.dbid)); if (rec) rec[TCOL[k]] = v || null; }
    catch (e) { r[k] = before; renderQ(); }
  };
  // status change from live.js, plus: SOR "Issued" with no date fills today's date
  const _qSet = window.qSet;
  window.qSet = qSet = async function (i, k, v) {
    await _qSet(i, k, v);
    const r = QT[i], rec = (D().tracker || []).find(x => x.id === r.dbid);
    if (rec && r[k] === v) rec[{ cur: 'current_status', mon: 'monitoring_status', sor: 'sor_status', book: 'eisa_booking_status', out: 'eisa_outcome' }[k]] = v || null;
    if (k === 'sor' && v === 'Issued' && r.sor === 'Issued' && !r.sorD) await window.qaT(i, 'sorD', iso());
  };

  window.qaWin = async function (id, col, v) {
    const w = (D().windows || []).find(x => x.id === id); if (!w || !v) return;
    const before = w[col]; w[col] = v; augTracker(); renderQ();
    try { await write('EISA window', () => sb.from('eisa_windows').update({ [col]: v }).eq('id', id)); } catch (e) { w[col] = before; augTracker(); renderQ(); }
  };
  function addWindow() {
    form('Add official EISA window', [['label', 'Label', 'text', null, 'Official EISA'], ['eisa_date', 'EISA date', 'date'], ['registration_closing', 'Registration closing date', 'date'], ['qualification', 'Only for qualification ID (blank = all)', 'text']],
      async v => { if (!v.eisa_date || !v.registration_closing) { say('Both dates are needed'); throw Error('dates'); }
        await write('EISA window', () => sb.from('eisa_windows').insert({ tenant_id: P.tenant, ...v })); say('EISA window added'); await window.previewReload(); });
  }
  window.qaAddWindow = addWindow;

  const _renderQ = renderQ;
  renderQ = function () {
    if (!P.user) return _renderQ();
    try { _renderQ(); } catch (e) { /* mock cohort view can trip on missing NQF; the table is rebuilt below */ } // KPIs, flags, filters
    const wins = (D().windows || []).filter(x => x.eisa_date >= iso()).sort((a, b) => a.eisa_date < b.eisa_date ? -1 : 1);
    $('qwin').innerHTML = (wins.length ? wins.map(w => { const dd = dDays(w.registration_closing);
      return `<div class="kv"><span>${esc(w.label || 'Official EISA')}${w.qualification ? ' · ' + esc(w.qualification) : ''}</span><span style="font-weight:600">${dIn(`qaWin(${w.id},'eisa_date',this.value)`, w.eisa_date, 'EISA date')}</span></div>
        <div class="kv"><span>Registration closes</span><span style="font-weight:600;color:${dd <= 30 ? 'var(--bad)' : 'var(--ink)'}">${dIn(`qaWin(${w.id},'registration_closing',this.value)`, w.registration_closing, 'Registration closing')} · ${dd} days</span></div>`; }).join('<hr style="border:0;border-top:1px solid var(--line2);margin:6px 0">')
      : '<p class="sub">No upcoming EISA windows recorded.</p>') + (QA() ? '<button class="btn sm" style="margin-top:10px" onclick="qaAddWindow()">+ Add EISA window</button>' : '');
    const fc = $('qclient').value, fp = $('qpm').value, fs = $('qstat').value;
    const rows = QT.map((r, i) => [r, i]).filter(([r]) => (!fc || r.c === fc) && (!fp || r.pm === fp) && (!fs || r.cur === fs));
    const sel = (i, k, v) => `<select class="cellsel ${BADGE(v)}" aria-label="${k}" onchange="qSet(${i},'${k}',this.value)">${QV[k].map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    if (qV === 'Learner rows') {
      $('qtable').innerHTML = H(['No', 'Client Name', 'Project Manager', 'Facilitator', 'Assessor', 'Learner Name', 'Learner Surname', 'Learner ID Number', 'Programme Name', 'Duration', 'Start Date', 'End Date', 'Current Status', 'Monitoring Status', 'Monitoring Date', 'SOR Status', 'SOR Issued Date', 'EISA Booking Status', 'EISA Date', 'EISA Outcome', 'Next Official EISA Date 1', 'Registration Closing Date 1', 'Next Official EISA Date 2', 'Registration Closing Date 2', 'Comments']) + '<tbody>' +
        rows.map(([r, i]) => { const w = winFor(r);
          return `<tr><td>${i + 1}</td><td>${esc(r.c)}</td><td>${esc(r.pm)}</td><td>${esc(r.f)}</td><td>${tIn(`qaT(${i},'a',this.value)`, r.a, 'Assessor', 130)}</td><td style="font-weight:600">${esc(r.ln)}</td><td>${esc(r.sn || '')}</td><td>${r.id}</td><td>${esc(r.p)}</td><td>${tIn(`qaT(${i},'d',this.value)`, r.d, 'Duration', 90)}</td><td>${fmtD(r.s)}</td><td>${fmtD(r.e)}</td>
          <td>${sel(i, 'cur', r.cur)}</td><td>${sel(i, 'mon', r.mon)}</td><td>${dIn(`qaT(${i},'monD',this.value)`, r.monD, 'Monitoring date')}</td><td>${sel(i, 'sor', r.sor)}</td><td>${dIn(`qaT(${i},'sorD',this.value)`, r.sorD, 'SOR issued date')}</td><td>${sel(i, 'book', r.book)}</td><td>${dIn(`qaT(${i},'eD',this.value)`, r.eD, 'EISA date')}</td><td>${sel(i, 'out', r.out)}</td>
          <td>${w[0] ? fmtD(w[0].eisa_date) : '<span class="sub">To be confirmed</span>'}</td><td>${w[0] ? fmtD(w[0].registration_closing) : ''}</td><td>${w[1] ? fmtD(w[1].eisa_date) : '<span class="sub">To be confirmed</span>'}</td><td>${w[1] ? fmtD(w[1].registration_closing) : ''}</td>
          <td>${tIn(`qaT(${i},'cm',this.value)`, r.cm, 'Comments', 240)}</td></tr>`; }).join('') + '</tbody>';
    } else {
      const g = QCO.map((k, ci) => [k, ci, QT.filter(r => r.ci === ci)]).filter(([, , a]) => a.length && rows.some(([r]) => r.ci === a[0].ci));
      $('qtable').innerHTML = H(['Entity', 'Project Manager', 'Client', 'Type', 'Qualification', 'NQF', 'Group', 'No. of learners', 'Employment status', 'Start date', 'End date', 'Enrolment requested', 'Enrolment received', 'EISA dates booked', 'Facilitator', 'Assessor', 'Mentor', 'Certification']) + '<tbody>' +
        g.map(([k, ci, a]) => { const m = (D().mods || []).find(x => x.sheet === 'QCTO projects' && x.programme_id === k.pid) || {}, p = (D().progs || []).find(x => x.id === k.pid) || {};
          const ed = {}; a.forEach(r => { if (r.eD) ed[r.eD] = (ed[r.eD] || 0) + 1; }); const cert = a.filter(r => r.out === 'Competent').length;
          return `<tr><td>${esc(m.entity || '—')}</td><td>${esc(k.pm)}</td><td>${esc(k.c)}</td><td>${esc(m.prog_type || p.programme_type || '—')}</td><td>${esc(k.p)}</td><td>${esc(p.nqf_level || '')}</td><td>${esc(m.groups || '—')}</td><td>${a.length}</td><td>${esc(m.employment || '—')}</td><td>${fmtD(k.s)}</td><td>${fmtD(k.e)}</td><td>${fmtD(day(m.enrolment_requested_date)) || '—'}</td><td>${fmtD(day(m.enrolment_received_date)) || '—'}</td>
          <td>${Object.entries(ed).map(([dt, c]) => `${fmtD(dt)} × ${c}`).join('<br>') || '<span class="sub">—</span>'}</td><td>${esc(k.f)}</td><td>${esc(k.a || '')}</td><td>${esc(m.mentor || '—')}</td><td>${m.certification ? esc(m.certification) : cert ? `<span class="badge b-ok">${cert} competent</span>` : '<span class="sub">—</span>'}</td></tr>`; }).join('') + '</tbody>';
      $('qcount').textContent = g.length + ' cohorts · enrolment, mentor and certification come from Moderation & Verification › QCTO projects';
    }
  };

  function exportTracker() {
    const X = xl(); if (!X) return;
    const head = ['No of Learners', 'Client Name', 'Project Manager', 'Facilitator', 'Assessor', 'Learner Name', 'Learner Surname', 'Learner ID Number', 'Programme Name', 'Duration', 'Start Date ', 'End Date', 'Current Status', 'Monitoring Status', 'Monitoring Date', 'SOR Status', 'SOR Issued Date', 'EISA Booking Status', 'EISA Date', 'EISA Outcome', 'Next Official EISA Date 1', 'Registration Closing Date 1', 'Next Official  EISA Date 2', 'Registration Closing Date 2', 'Comments'];
    const tbc = 'To be confirmed';
    const rows = QT.map((r, i) => { const w = winFor(r);
      return [i + 1, r.c, r.pm, r.f, r.a, r.ln, r.sn, r.idFull || '', r.p, r.d, day(r.s), day(r.e), r.cur, r.mon, day(r.monD), r.sor, day(r.sorD) || tbc, r.book, day(r.eD) || tbc, r.out || 'Pending', w[0] ? w[0].eisa_date : tbc, w[0] ? w[0].registration_closing : tbc, w[1] ? w[1].eisa_date : tbc, w[1] ? w[1].registration_closing : tbc, r.cm]; });
    const wb = X.utils.book_new();
    const ws = sheet(X, [head, ...rows], { dateCols: [10, 11, 14, 16, 18, 20, 21, 22, 23] });
    rows.forEach((r, ri) => { const a = X.utils.encode_cell({ r: ri + 1, c: 7 }); ws[a] = { t: 's', v: String(r[7]) }; }); // ID numbers stay text
    X.utils.book_append_sheet(wb, ws, 'QCTO Projects');
    return save(X, wb, `QCTO_Projects_Tracker_${stamp()}.xlsx`);
  }
  window.qaExportTracker = exportTracker;

  /* =====================================================================
     MODERATION & VERIFICATION  (sheets of External Moderation – 2026.xlsx)
     ===================================================================== */
  const MTABS = ['External moderation', 'QCTO projects', 'Exit verification stats', 'Projects completed'];
  const SHEET = { 'External moderation': 'External moderation', 'QCTO projects': 'QCTO projects', 'Exit verification stats': 'Exit verification', 'Projects completed': 'Projects completed' };
  const mrec = id => (D().mods || []).find(m => m.id === id);
  function rebuildMods() {
    const ix = s => Math.max(0, MSTAGE.indexOf(s)); MOD.length = 0; VER.length = 0; DONE.length = 0;
    (D().mods || []).forEach(m => {
      if (m.sheet === 'External moderation') MOD.push(Object.assign([m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.employment, m.start_date, m.end_date, m.delivery, m.facilitator, m.assessor, m.moderator, m.seta, ix(m.stage), m.stage_date], { dbid: m.id }));
      else if (m.sheet === 'Exit verification') VER.push(Object.assign([m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, m.verifier, m.exit_verification_date, ix(m.stage)], { dbid: m.id }));
      else if (m.sheet === 'Projects completed') DONE.push(Object.assign([m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, m.exit_verification_date, m.sor_submission_date || m.stage_date, m.submitted_to_pm_date], { dbid: m.id }));
    });
  }
  window.qaM = async function (id, col, v) {
    const m = mrec(id); if (!m) return; const before = m[col]; m[col] = v === '' ? null : v; rebuildMods(); renderM();
    try { await write('Moderation', () => sb.from('moderation_items').update({ [col]: v === '' ? null : v }).eq('id', id)); }
    catch (e) { m[col] = before; rebuildMods(); renderM(); }
  };
  // stage change from live.js, plus: "Submitted to PM" moves the programme to Projects completed
  const _mSet = window.mSet;
  window.mSet = mSet = async function (arr, i, v) {
    const row = (arr === 'MOD' ? MOD : VER)[i], col = arr === 'MOD' ? 16 : 11; if (!row) return;
    await _mSet(arr, i, v);
    if (row[col] !== +v) return; // live.js reverted after an error
    const m = mrec(row.dbid); if (!m) return;
    m.stage = MSTAGE[+v]; m.stage_date = iso();
    if (m.stage === 'SoRs received' && !m.sor_submission_date) await window.qaM(m.id, 'sor_submission_date', iso());
    if (m.stage === 'Submitted to PM') {
      try { await write('Move to Projects completed', () => sb.from('moderation_items').update({ sheet: 'Projects completed', submitted_to_pm_date: iso() }).eq('id', m.id)); m.sheet = 'Projects completed'; m.submitted_to_pm_date = iso(); say('Moved to Projects completed'); } catch (e) { }
    }
    rebuildMods(); renderM();
  };

  const _renderM = renderM;
  renderM = function () {
    if (!P.user) return _renderM();
    if (!MTABS.includes(mTab)) mTab = MTABS[0];
    const M = D().mods || [], of = s => M.filter(m => m.sheet === s), sum = a => a.reduce((t, m) => t + (+m.learners || 0), 0);
    $('mkpis').innerHTML = [['On moderation list', of('External moderation').length, 'programmes', 'var(--ink)'], ['QCTO active programmes', of('QCTO projects').length, 'programmes', 'var(--ink)'], ['Exit verification 2026', sum(of('Exit verification')), 'learners', 'var(--ink)'],
      ['Awaiting SoRs or report', of('Exit verification').filter(m => MSTAGE.indexOf(m.stage) < 7).length, 'programmes', 'var(--warn)'], ['Completed', sum(of('Projects completed')), 'learners certified', 'var(--ok)']]
      .map(([l, v, s, c]) => `<div class="kpi"><span class="l">${l}</span><span class="v" style="color:${c}">${v}</span><span class="n" style="color:var(--muted)">${s}</span></div>`).join('');
    $('mtabs').innerHTML = MTABS.map(t => `<button role="tab" aria-selected="${t === mTab}" class="${t === mTab ? 'on' : ''}" onclick="mTab='${t}';renderM()">${t}</button>`).join('');
    const st = (a, i, v) => QA() ? `<select class="cellsel" aria-label="Stage" onchange="mSet('${a}',${i},this.value)">${MSTAGE.map((s, k) => `<option value="${k}"${k === v ? ' selected' : ''}>${s}</option>`).join('')}</select>` : esc(MSTAGE[v]);
    const q = v => esc(v || '') + ' ' + legB(v || ''), base = m => [m.entity, m.project_manager, m.client_name, m.prog_type].map(x => `<td>${esc(x || '')}</td>`).join('') + `<td style="white-space:normal;min-width:200px">${q(m.qualification)}</td><td>${esc(m.nqf || '')}</td>`;
    const empty = n => `<tr><td colspan="${n}"><div class="empty"><b>Nothing on this sheet yet</b>${QA() ? '<span>Use “+ Add programme” to add one.</span>' : ''}</div></td></tr>`;
    if (mTab === 'External moderation') {
      $('mnote').innerHTML = 'Same columns as the External Moderation sheet. FEEDBACK is a stage plus a date, so it can be filtered and counted; free-text notes go in Comments. Legacy qualifications are flagged from the Pre-2009 list.';
      $('mtable').innerHTML = H(['Entity', 'Project Manager', 'Client', 'Type', 'Qualification (OFO / ID)', 'NQF', 'Learners', 'Groups', 'Employment', 'Start', 'End', 'Face-to-face or Online', 'Facilitator', 'Assessor', 'Moderator', 'SETA', 'Feedback stage', 'Stage date', 'Comments']) + '<tbody>' +
        (MOD.map((r, i) => { const m = mrec(r.dbid) || {}; return `<tr>${base(m)}<td>${m.learners ?? ''}</td><td>${esc(m.groups || '')}</td><td>${esc(m.employment || '')}</td><td>${fmtD(day(m.start_date))}</td><td>${fmtD(day(m.end_date))}</td><td>${esc(m.delivery || '')}</td><td>${esc(m.facilitator || '')}</td><td>${esc(m.assessor || '')}</td><td>${esc(m.moderator || '')}</td><td>${esc(m.seta || '')}</td>
          <td>${st('MOD', i, r[16])}</td><td>${dIn(`qaM(${m.id},'stage_date',this.value)`, m.stage_date, 'Stage date')}</td><td>${tIn(`qaM(${m.id},'comments',this.value)`, m.comments, 'Comments', 220)}</td></tr>`; }).join('') || empty(19)) + '</tbody>';
    } else if (mTab === 'QCTO projects') {
      $('mnote').innerHTML = 'Same columns as the QCTO Projects sheet (QCTO active programmes). EISA dates are counted from the QCTO Projects Tracker, so they are not typed twice.';
      $('mtable').innerHTML = H(['Entity', 'Project Manager', 'Client', 'Type', 'Qualification (OFO / ID)', 'NQF', 'Groups', 'Learners', 'Employment', 'Start', 'End', 'Enrolment requested', 'Enrolment received', 'EISA dates (from tracker)', 'Facilitator', 'Assessor', 'Mentor', 'Certification']) + '<tbody>' +
        (of('QCTO projects').map(m => { const ed = {}; (D().tracker || []).filter(t => t.programme_id && t.programme_id === m.programme_id && t.eisa_date).forEach(t => ed[t.eisa_date] = (ed[t.eisa_date] || 0) + 1);
          return `<tr>${base(m)}<td>${esc(m.groups || '')}</td><td>${m.learners ?? ''}</td><td>${esc(m.employment || '')}</td><td>${fmtD(day(m.start_date))}</td><td>${fmtD(day(m.end_date))}</td>
          <td>${dIn(`qaM(${m.id},'enrolment_requested_date',this.value)`, m.enrolment_requested_date, 'Enrolment requested')}</td><td>${dIn(`qaM(${m.id},'enrolment_received_date',this.value)`, m.enrolment_received_date, 'Enrolment received')}</td>
          <td>${Object.entries(ed).map(([d, c]) => `${fmtD(d)} × ${c}`).join('<br>') || '<span class="sub">—</span>'}</td><td>${esc(m.facilitator || '')}</td><td>${esc(m.assessor || '')}</td>
          <td>${tIn(`qaM(${m.id},'mentor',this.value)`, m.mentor, 'Mentor', 120)}</td><td>${tIn(`qaM(${m.id},'certification',this.value)`, m.certification, 'Certification', 220)}</td></tr>`; }).join('') || empty(18)) + '</tbody>';
    } else if (mTab === 'Exit verification stats') {
      $('mnote').innerHTML = 'Same columns as the VERIFICATION STATS 2026 sheet. The status is a stage; choosing “SoRs received” fills the submission date, and “Submitted to PM” moves the programme to Projects completed.';
      $('mtable').innerHTML = H(['Entity', 'Project Manager', 'Client', 'Type', 'Qualification', 'NQF', 'Learners', 'Groups', 'SETA', 'Verifier', 'Exit verification date', 'Stage', 'Certificate / SoR submission date', 'Comments']) + '<tbody>' +
        (VER.map((r, i) => { const m = mrec(r.dbid) || {}; return `<tr>${base(m)}<td>${m.learners ?? ''}</td><td>${esc(m.groups || '')}</td><td>${esc(m.seta || '')}</td><td>${tIn(`qaM(${m.id},'verifier',this.value)`, m.verifier, 'Verifier', 110)}</td>
          <td>${dIn(`qaM(${m.id},'exit_verification_date',this.value)`, m.exit_verification_date, 'Exit verification date')}</td><td>${st('VER', i, r[11])}</td><td>${dIn(`qaM(${m.id},'sor_submission_date',this.value)`, m.sor_submission_date, 'SoR submission date')}</td><td>${tIn(`qaM(${m.id},'comments',this.value)`, m.comments, 'Comments', 220)}</td></tr>`; }).join('') || empty(14)) + '</tbody>';
    } else {
      $('mnote').innerHTML = 'Same columns as the PROJECTS COMPLETED 2026 sheet. Programmes arrive here when the exit-verification stage is set to “Submitted to PM”.';
      $('mtable').innerHTML = H(['Entity', 'Project Manager', 'Client', 'Type', 'Qualification', 'NQF', 'Learners', 'Groups', 'SETA', 'Exit verification date', 'Certificate / SoR submission date', 'Date submitted to PM']) + '<tbody>' +
        (of('Projects completed').map(m => `<tr>${base(m)}<td>${m.learners ?? ''}</td><td>${esc(m.groups || '')}</td><td>${esc(m.seta || '')}</td><td>${fmtD(day(m.exit_verification_date))}</td><td>${dIn(`qaM(${m.id},'sor_submission_date',this.value)`, m.sor_submission_date || m.stage_date, 'SoR submission date')}</td><td>${dIn(`qaM(${m.id},'submitted_to_pm_date',this.value)`, m.submitted_to_pm_date, 'Date submitted to PM')}</td></tr>`).join('') || empty(12)) + '</tbody>';
    }
  };

  function addModeration() {
    if (!QA()) { say('Only QA, ETQA or an admin can add to this list'); return; }
    const sheetName = SHEET[mTab] === 'Projects completed' ? 'External moderation' : SHEET[mTab];
    const progs = D().progs || [];
    form('Add programme · ' + (mTab === 'Projects completed' ? 'External moderation' : mTab), [
      ['programme_id', 'Linked programme (optional)', 'select', ['— none —', ...progs.map(p => p.id + ' · ' + p.programme_name)], '— none —'],
      ['entity', 'Entity qualification falls under', 'select', ['Apex Business Academy', 'Catalyst AI (Pty) Ltd'], 'Apex Business Academy'],
      ['project_manager', 'Project manager'], ['client_name', 'Client'],
      ['prog_type', 'Type of learning programme', 'select', ['Learnership', 'Skills Programme', 'Occupational Certificate', 'Part Qualification'], 'Learnership'],
      ['qualification', 'Qualification (OFO code / ID and title)'], ['nqf', 'NQF level'], ['learners', 'Number of learners', 'number'], ['groups', 'Groups'],
      ['employment', 'Employment status', 'select', ['Employed', 'Unemployed', 'Employed & Unemployed'], 'Employed'],
      ['start_date', 'Actual start date', 'date'], ['end_date', 'End date', 'date'],
      ['delivery', 'Face-to-face or online', 'select', ['Online', 'Face-to-face', 'Blended'], 'Online'],
      ['facilitator', 'Facilitator'], ['assessor', 'Assessor'], ['moderator', 'Moderator'], ['verifier', 'Verifier'], ['seta', 'SETA / quality partner']],
      async v => {
        if (!v.qualification) { say('Qualification is needed'); throw Error('qualification'); }
        const pid = v.programme_id && v.programme_id !== '— none —' ? +v.programme_id.split(' · ')[0] : null;
        const row = { tenant_id: P.tenant, sheet: sheetName, ...v, programme_id: pid, learners: v.learners ? +v.learners : null, owner_email: P.user.email,
          stage: sheetName === 'QCTO projects' ? null : sheetName === 'Exit verification' ? 'Exit verification application in progress' : 'Documents requested', stage_date: sheetName === 'QCTO projects' ? null : iso() };
        await write('Add programme', () => sb.from('moderation_items').insert(row)); say('Added to ' + mTab); await window.previewReload();
      });
  }

  function exportModeration() {
    const X = xl(); if (!X) return; const M = D().mods || [], of = s => M.filter(m => m.sheet === s), wb = X.utils.book_new();
    const em = ['Entity Qualification Falls Under', 'PROJECT MANAGER', 'CLIENT', 'TYPE OF LEARNING PROGRAMME  (SKILLS PROGRAMME/ LEARNERSHIP)', 'QUALIFICATION  AS PER OFO CODE/DESCRIPTION', 'NQF LEVEL (NQF ACT)'];
    const fb = m => [m.stage, m.stage_date ? fmtD(day(m.stage_date)) : '', m.comments].filter(Boolean).join(' - ');
    const add = (name, title, head, rows, dateCols) => { const ws = sheet(X, [[title], head, ...rows], { dateCols: dateCols.map(c => c) }); X.utils.book_append_sheet(wb, ws, name); };
    // sheet() treats row 0 as the header; the title row shifts real headers to row 1, which is fine for dates (only data rows match the pattern)
    add('External Moderation ', 'External Moderation List ' + new Date().getFullYear(), [...em, 'NUMBER OF THE LEARNERS', 'GROUPS', 'EMPLOYMENT STATUS', 'ACTUAL START DATE OF THE LEARNING PROGRAMME', 'END DATE OF THE LEARNING PROGRAMME', 'Training Face-to-face or Online', 'Facilitator', 'Assessor', 'Moderator', 'SETA', 'FEEDBACK '],
      of('External moderation').map(m => [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.employment, day(m.start_date), day(m.end_date), m.delivery, m.facilitator, m.assessor, m.moderator, m.seta, fb(m)]), [9, 10]);
    add('QCTO Projects', 'QCTO ACTIVE PROGRAMMES', [...em, 'Groups', 'NUMBER OF THE LEARNERS', 'EMPLOYMENT STATUS', 'ACTUAL START DATE OF THE LEARNING PROGRAMME', 'END DATE OF THE LEARNING PROGRAMME', 'Enrolment Requested', 'Enrolment Received', 'EISA Dates', 'Facilitator', 'Assessor', 'Mentor', 'Certification'],
      of('QCTO projects').map(m => { const ed = {}; (D().tracker || []).filter(t => t.programme_id && t.programme_id === m.programme_id && t.eisa_date).forEach(t => ed[t.eisa_date] = (ed[t.eisa_date] || 0) + 1);
        return [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.groups, m.learners, m.employment, day(m.start_date), day(m.end_date), day(m.enrolment_requested_date), day(m.enrolment_received_date), Object.entries(ed).map(([d, c]) => fmtD(d) + ' x' + c).join(', '), m.facilitator, m.assessor, m.mentor, m.certification]; }), [9, 10, 11, 12]);
    const acc = (D().accs || []);
    add('Accreditation', 'QCTO ACCREDITATION', ['Number', 'Qualification and/or Skills Programme ID', 'Qualification and/or Skills Programme Title', 'NQF Level', 'Credits', 'Type of Qualification and/or Skills Programme', 'Provider Name', 'Quality SETA Partner', 'SMME', 'QCTO ADVISOR', 'QCTO Verifier', 'Status', 'Feedback'],
      acc.map((a, i) => [i + 1, a.saqa_id, a.title, a.nqf, a.credits, a.qual_type, a.provider, a.quality_partner, a.smme, a.qcto_advisor, a.qcto_verifier, a.status, accFeedback(a)]), []);
    add('VERIFICATION STATS ' + new Date().getFullYear(), 'EXIT VERIFICATION STATS - ' + new Date().getFullYear(), [...em, 'NUMBER OF THE LEARNERS', 'GROUPS', 'SETA', 'VERIFIER', 'EXIT VERIFICATION DATE', "Certificate/SoR's Submission Date", 'Status'],
      of('Exit verification').map(m => [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, m.verifier, day(m.exit_verification_date), day(m.sor_submission_date), fb(m)]), [10, 11]);
    add('Project Completed', 'PROJECTS COMPLETED ' + new Date().getFullYear(), [...em, 'NUMBER OF THE LEARNERS', 'GROUPS', 'SETA', 'EXIT VERIFICATION DATE', "Certificate/SoR's Submission Date", 'Date submitted to  PM'],
      of('Projects completed').map(m => [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, day(m.exit_verification_date), day(m.sor_submission_date || m.stage_date), day(m.submitted_to_pm_date)]), [9, 10, 11]);
    return save(X, wb, `External_Moderation_-_${new Date().getFullYear()}.xlsx`);
  }
  window.qaExportModeration = exportModeration;

  /* =====================================================================
     ACCREDITATION  (+ legacy qualification check)
     ===================================================================== */
  const ASTAT = ['Desktop application to be submitted', 'Desktop application successful', 'Site visit scheduled', 'Site visit done', 'Accreditation granted'];
  const ABADGE = { 'Accreditation granted': 'b-ok', 'Desktop application successful': 'b-n', 'Site visit scheduled': 'b-warn', 'Site visit done': 'b-n', 'Desktop application to be submitted': 'b-bad' };
  // Feedback is written the way the Accreditation sheet writes it, from the dates
  function accFeedback(a) {
    const f = s => fmtD(day(s));
    switch (a.status) {
      case 'Accreditation granted': return a.accreditation_from ? `Accreditation Granted (${f(a.accreditation_from)} – ${f(a.accreditation_to) || '?'})` : 'Accreditation Granted';
      case 'Site visit scheduled': return a.site_visit_date ? 'Site Visit - ' + f(a.site_visit_date) : 'Site visit to be scheduled';
      case 'Site visit done': return 'Site Visit - ' + (a.site_visit_date ? f(a.site_visit_date) + ' - ' : '') + 'DONE';
      case 'Desktop application successful': return 'Desktop Application Successful' + (a.desktop_date ? ' - ' + f(a.desktop_date) : '');
      default: return 'Desktop/Accreditation Application to be submitted';
    }
  }
  window.qaAccFeedback = accFeedback;
  const monthsLeft = a => a.status === 'Accreditation granted' && a.accreditation_to ? Math.floor((new Date(day(a.accreditation_to)) - TODAY) / (864e5 * 30.44)) : null;
  window.qaA = async function (id, col, v) {
    const a = (D().accs || []).find(x => x.id === id); if (!a) return;
    const before = { ...a }; a[col] = v === '' ? null : v; const fbk = accFeedback(a); a.feedback = fbk; renderA();
    try { await write('Accreditation', () => sb.from('accreditation_items').update({ [col]: a[col], feedback: fbk }).eq('id', id)); }
    catch (e) { Object.assign(a, before); renderA(); }
  };
  const _renderA = renderA;
  renderA = function () {
    if (!P.user) return _renderA();
    const A = D().accs || [], c = s => A.filter(a => a.status === s).length;
    const exp = A.filter(a => { const m = monthsLeft(a); return m != null && m < 12; }).length;
    $('akpis').innerHTML = ASTAT.slice().reverse().map(s => `<div class="kpi"><span class="l">${s}</span><span class="v">${c(s)}</span><span class="n"><span class="badge ${ABADGE[s]}">${s === 'Desktop application to be submitted' ? 'Action needed' : s === 'Site visit scheduled' ? 'Prepare' : 'Status'}</span></span></div>`).join('')
      + `<div class="kpi"><span class="l">Expiring within 12 months</span><span class="v" style="color:${exp ? 'var(--bad)' : 'var(--ink)'}">${exp}</span><span class="n" style="color:var(--muted)">plan re-accreditation</span></div>`;
    $('afilter').innerHTML = ['All', 'Granted', 'In progress', 'To submit', 'Expiring'].map(f => `<button class="${f === aF ? 'on' : ''}" onclick="aF='${f}';renderA()">${f}</button>`).join('');
    const m = a => aF === 'All' || (aF === 'Granted' ? a.status === 'Accreditation granted' : aF === 'To submit' ? a.status === 'Desktop application to be submitted' : aF === 'Expiring' ? (monthsLeft(a) ?? 99) < 12 : !['Accreditation granted', 'Desktop application to be submitted'].includes(a.status));
    const sel = a => QA() ? `<select class="cellsel" aria-label="Status" onchange="qaA(${a.id},'status',this.value)">${ASTAT.map(s => `<option${s === a.status ? ' selected' : ''}>${s}</option>`).join('')}</select>` : `<span class="badge ${ABADGE[a.status]}">${esc(a.status)}</span>`;
    $('atable').innerHTML = H(['No', 'Qualification / SP ID', 'Title', 'NQF', 'Credits', 'Type', 'Provider', 'Quality SETA partner', 'SMME', 'QCTO advisor', 'QCTO verifier', 'Status', 'Desktop result date', 'Site visit date', 'Accredited from', 'Accredited to', 'Feedback']) + '<tbody>' +
      (A.filter(m).map(a => { const ml = monthsLeft(a);
        return `<tr><td>${A.indexOf(a) + 1}</td><td>${esc(a.saqa_id || '')} ${legB(a.saqa_id || '')}</td><td style="white-space:normal;min-width:220px;font-weight:600">${esc(a.title || '')}</td><td>${a.nqf ?? ''}</td><td>${a.credits ?? ''}</td><td>${esc(a.qual_type || '')}</td><td>${esc(a.provider || '')}</td><td>${esc(a.quality_partner || '')}</td>
        <td>${tIn(`qaA(${a.id},'smme',this.value)`, a.smme, 'SMME', 130)}</td><td>${tIn(`qaA(${a.id},'qcto_advisor',this.value)`, a.qcto_advisor, 'QCTO advisor', 130)}</td><td>${tIn(`qaA(${a.id},'qcto_verifier',this.value)`, a.qcto_verifier, 'QCTO verifier', 130)}</td>
        <td>${sel(a)}</td><td>${dIn(`qaA(${a.id},'desktop_date',this.value)`, a.desktop_date, 'Desktop result date')}</td><td>${dIn(`qaA(${a.id},'site_visit_date',this.value)`, a.site_visit_date, 'Site visit date')}</td><td>${dIn(`qaA(${a.id},'accreditation_from',this.value)`, a.accreditation_from, 'Accredited from')}</td><td>${dIn(`qaA(${a.id},'accreditation_to',this.value)`, a.accreditation_to, 'Accredited to')}</td>
        <td style="white-space:normal;min-width:200px">${esc(accFeedback(a))}${ml != null && ml < 12 ? ` <span class="badge ${ml < 6 ? 'b-bad' : 'b-warn'}">Expires in ${Math.max(ml, 0)} months</span>` : ''}</td></tr>`; }).join('')
        || `<tr><td colspan="17"><div class="empty"><b>No qualifications match</b></div></td></tr>`) + '</tbody>';
  };
  function addAccreditation() {
    if (!QA()) { say('Only QA, ETQA or an admin can add to the accreditation pipeline'); return; }
    form('Add qualification to the accreditation pipeline', [['saqa_id', 'Qualification / skills programme ID'], ['title', 'Title'], ['nqf', 'NQF level', 'number'], ['credits', 'Credits', 'number'],
      ['qual_type', 'Type', 'select', ['Occupational Certificate', 'National Occupational Certificate', 'Higher Occupational Certificate', 'Advanced Occupational Diploma', 'Skills Programme', 'Part Qualification'], 'Occupational Certificate'],
      ['provider', 'Provider name', 'select', ['Catalyst AI (Pty) Ltd', 'Apex Business Academy Pty Ltd'], 'Catalyst AI (Pty) Ltd'], ['quality_partner', 'Quality SETA partner'], ['smme', 'SMME'], ['qcto_advisor', 'QCTO advisor'], ['qcto_verifier', 'QCTO verifier']],
      async v => {
        if (!v.saqa_id || !v.title) { say('ID and title are needed'); throw Error('fields'); }
        const row = { tenant_id: P.tenant, ...v, nqf: v.nqf ? +v.nqf : null, credits: v.credits ? +v.credits : null, status: 'Desktop application to be submitted', owner_email: P.user.email };
        row.feedback = accFeedback(row);
        await write('Add qualification', () => sb.from('accreditation_items').insert(row)); say('Added to the accreditation pipeline'); await window.previewReload();
      });
  }
  // legacy list: look up by ID (5 or 6 digits) or by words in the title
  const _renderLeg = renderLeg;
  renderLeg = function () {
    const q = $('legq').value.trim();
    if (!P.user || /^\d+$/.test(q) || q.length < 3) {
      _renderLeg();
      const r = LEG[q]; if (r && r[2] !== 'Yes') $('legres').innerHTML = `<div class="err" style="display:flex;flex-direction:column;gap:4px"><b>${esc(q)} · ${esc(r[1])}</b><span>Quality partner ${esc(r[0])} · Not extended</span><span class="sub">This legacy qualification was not extended. Do not enrol new learners on it.</span></div>`;
      return;
    }
    const w = q.toLowerCase().split(/\s+/), hits = Object.entries(LEG).filter(([, r]) => w.every(x => r[1].toLowerCase().includes(x))).slice(0, 12);
    $('legres').innerHTML = hits.length ? `<div class="tw"><table class="dense">${H(['ID', 'Title', 'Quality partner', 'Extended', 'Extension'])}<tbody>${hits.map(([id, r]) => `<tr><td>${id}</td><td style="white-space:normal">${esc(r[1])}</td><td>${esc(r[0])}</td><td>${r[2] === 'Yes' ? '<span class="badge b-warn">Yes</span>' : '<span class="badge b-bad">No</span>'}</td><td>${esc(r[3] || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<span class="badge b-ok">No title on the consolidated list matches</span>';
  };

  /* =====================================================================
     LEISA FILE  (QCTO Learner Enrolment and Readiness for EISA)
     ===================================================================== */
  const LCOLS = ['SDPCode', 'QualificationId', 'NationalId', 'LearnerAlternateID', 'AlternativeIdType', 'EquityCode', 'NationalityCode', 'HomeLanguageCode', 'GenderCode', 'CitizenResidentStatusCode', 'SocioeconomicStatusCode', 'DisabilityStatusCode', 'DisabilityRating', 'ImmigrantStatus', 'LearnerLastName', 'LearnerFirstName', 'LearnerMiddleName', 'LearnerTitle', 'LearnerBirthDate', 'LearnerHomeAddress1', 'LearnerHomeAddress2', 'LearnerHomeAddress3', 'LearnerPostalAddress1', 'LearnerPostalAddress2', 'LearnerPostalAddress3', 'LearnerHomeAddressPostalCode', 'LearnerPostalAddressPostCode', 'LearnerPhoneNumber', 'LearnerCellPhoneNumber', 'LearnerFaxNumber', 'LearnerEmailAddress', 'ProvinceCode', 'STATSSAAreaCode', 'POPIActAgree', 'POPIActDate', 'ExpectedTrainingCompletionDate', 'StatementofResultsStatus', 'StatementofResultsIssueDate', 'AssessmentCentreCode', 'LearnerReadinessforEISATypeId', 'FLC', 'FLCStatementofresultnumber', 'DateStamp'];
  window.QA_LEISA_COLUMNS = LCOLS;
  const S1 = LCOLS.slice(0, 36), S2 = LCOLS.slice(36, 42);           // A–AJ and AK–AP (AQ = DateStamp)
  const FROM_DB = ['SDPCode', 'QualificationId', 'NationalId', 'LearnerLastName', 'LearnerFirstName', 'DateStamp'];
  const REQ1 = ['SDPCode', 'QualificationId', 'EquityCode', 'NationalityCode', 'HomeLanguageCode', 'GenderCode', 'CitizenResidentStatusCode', 'SocioeconomicStatusCode', 'DisabilityStatusCode', 'ImmigrantStatus', 'LearnerLastName', 'LearnerFirstName', 'LearnerTitle', 'LearnerBirthDate', 'LearnerHomeAddress1', 'LearnerPostalAddress1', 'LearnerHomeAddressPostalCode', 'LearnerPostalAddressPostCode', 'LearnerCellPhoneNumber', 'LearnerEmailAddress', 'ProvinceCode', 'STATSSAAreaCode', 'POPIActAgree', 'POPIActDate', 'ExpectedTrainingCompletionDate'];
  const REQ2 = ['StatementofResultsStatus', 'StatementofResultsIssueDate', 'AssessmentCentreCode', 'LearnerReadinessforEISATypeId'];
  // suggestions = values used in the team's March 2026 LEISA file (not an official code list)
  const SUGG = { AlternativeIdType: ['533'], EquityCode: ['BA', 'Wh'], NationalityCode: ['SA'], HomeLanguageCode: ['Afr', 'Ses', 'Sep', 'Zul'], GenderCode: ['F', 'M'], CitizenResidentStatusCode: ['SA'], SocioeconomicStatusCode: ['01'], DisabilityStatusCode: ['01'], DisabilityRating: ['01'], ImmigrantStatus: ['03'], LearnerTitle: ['Miss', 'Mr', 'Mrs', 'Ms', 'Dr'], ProvinceCode: ['7'], POPIActAgree: ['Yes', 'No'], StatementofResultsStatus: ['01'], LearnerReadinessforEISATypeId: ['1'], FLC: ['03'] };
  const DATES = ['LearnerBirthDate', 'POPIActDate', 'ExpectedTrainingCompletionDate', 'StatementofResultsIssueDate'];
  let lProg = null, lSel = null;
  const lrec = id => (D().leisa || []).find(x => x.learner_id === id);
  const settingsFor = p => (D().leisaSettings || []).find(s => s.provider === (p?.provider || 'apex')) || (D().leisaSettings || [])[0] || {};
  const luhn = s => { let t = 0; for (let i = 0; i < 13; i++) { let d = +s[12 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; } return t % 10 === 0; };
  const okDate = s => /^\d{8}$/.test(s) && !isNaN(new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}T00:00:00`)) && +s.slice(4, 6) <= 12 && +s.slice(6) <= 31;
  function leisaLearners(pid) {
    const d = D(), ids = new Set([...(d.enrol || []).filter(e => e.programme_id === pid && e.status === 'active').map(e => e.learner_id), ...(d.tracker || []).filter(t => t.programme_id === pid).map(t => t.learner_id)]);
    return (d.learners || []).filter(l => ids.has(l.id));
  }
  // value of one LEISA column for one learner: database first, then the learner's LEISA fields
  function lval(col, l, p) {
    const f = lrec(l.id)?.fields || {}, s = settingsFor(p), t = (D().tracker || []).find(x => x.learner_id === l.id && x.programme_id === p.id) || {};
    switch (col) {
      case 'SDPCode': return s.sdp_code || '';
      case 'QualificationId': return p.saqa_id || '';
      case 'NationalId': return l.id_number || '';
      case 'LearnerLastName': return l.last_name || '';
      case 'LearnerFirstName': return l.first_name || '';
      case 'LearnerEmailAddress': return f[col] || l.email || '';
      case 'LearnerFaxNumber': return !f[col] || /^n\/?a$/i.test(f[col]) ? 'N/A' : f[col];
      case 'ExpectedTrainingCompletionDate': return f[col] || ymd(p.end_date);
      case 'StatementofResultsIssueDate': return f[col] || (t.sor_status === 'Issued' ? ymd(t.sor_issued_date) : '');
      case 'DateStamp': return ymd(iso());
      default: return f[col] == null ? '' : String(f[col]);
    }
  }
  function check(l, p) {
    const v = c => lval(c, l, p), e1 = [], e2 = [];
    const nid = v('NationalId');
    if (!nid && !(v('LearnerAlternateID') && v('AlternativeIdType'))) e1.push('NationalId or LearnerAlternateID + AlternativeIdType');
    if (nid && !/^\d{13}$/.test(nid)) e1.push('NationalId: must be 13 digits');
    else if (nid && !luhn(nid)) e1.push('NationalId: check digit is wrong');
    else if (nid && v('LearnerBirthDate') && nid.slice(0, 6) !== v('LearnerBirthDate').slice(2)) e1.push('NationalId does not match LearnerBirthDate');
    REQ1.forEach(c => { if (!v(c)) e1.push('Missing ' + c); });
    DATES.slice(0, 3).forEach(c => { if (v(c) && !okDate(v(c))) e1.push(c + ': use yyyymmdd'); });
    ['LearnerPhoneNumber', 'LearnerCellPhoneNumber'].forEach(c => { const x = v(c); if (x && !/^0\d{9}$/.test(x)) e1.push(c + ': ' + (/\D/.test(x) ? 'digits only' : x.length + ' digits, needs 10')); });
    const em = v('LearnerEmailAddress'); if (em && /\s/.test(em)) e1.push('LearnerEmailAddress: contains a space'); else if (em && !/^[^@]+@[^@]+\.[^@]+$/.test(em)) e1.push('LearnerEmailAddress: not a valid address');
    ['LearnerHomeAddressPostalCode', 'LearnerPostalAddressPostCode'].forEach(c => { if (v(c) && !/^\d{4}$/.test(v(c))) e1.push(c + ': 4 digits'); });
    if (v('GenderCode') && !['M', 'F'].includes(v('GenderCode'))) e1.push('GenderCode: M or F');
    if (v('POPIActAgree') && v('POPIActAgree') !== 'Yes') e1.push('POPIActAgree: learner has not agreed');
    REQ2.forEach(c => { if (!v(c)) e2.push(c); });
    if (v('StatementofResultsIssueDate') && !okDate(v('StatementofResultsIssueDate'))) e2.push('StatementofResultsIssueDate (yyyymmdd)');
    if (v('FLC') && !v('FLCStatementofresultnumber')) e2.push('FLCStatementofresultnumber');
    return [e1, e2];
  }
  function rebuildLEI() {
    LEI.length = 0; const d = D();
    (d.progs || []).forEach(p => leisaLearners(p.id).forEach(l => { const [a, b] = check(l, p); LEI.push([l.first_name + ' ' + l.last_name, a, b, l.id, p.id]); }));
  }
  window.qaLeisaCheck = (lid, pid) => { const l = (D().learners || []).find(x => x.id === lid), p = (D().progs || []).find(x => x.id === pid); return l && p ? check(l, p) : null; };

  function leisaFileName(p) {
    const s = settingsFor(p), code = String(s.sdp_code || '').split('/').pop() || 'SDP', name = String(s.sdp_name || 'SDP').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return `LEISA${ymd(iso())}-${code}${name}.xlsx`;
  }
  function exportLeisa(stage, force) {
    const p = (D().progs || []).find(x => x.id === lProg); if (!p) { say('Choose a programme first'); return; }
    const ls = leisaLearners(p.id), errs = ls.map(l => check(l, p)), bad = errs.filter(([a, b]) => a.length || (stage === 2 && b.length)).length;
    if (!ls.length) { say('No learners on this programme'); return; }
    if (bad && !force) { say(`${bad} learner${bad > 1 ? 's' : ''} still ${bad > 1 ? 'have' : 'has'} errors for stage ${stage}. Fix them first, or use “Export anyway”.`); return; }
    const X = xl(); if (!X) return;
    const s = settingsFor(p), wb = X.utils.book_new();
    const ins = [['QCTO Learner Enrolment and Readiness for EISA File'], [''], ['Purpose of this Form'], ['Learner information the QCTO needs to enrol learners on a QCTO full or part qualification and to confirm their readiness for the EISA.'], [''],
      ['Format of this Form'], ['The form contains Two (2) Sheets:'], ['Sheet 1', 'This sheet is named "Instructions"'], ['Sheet 2', 'This sheet is named "Learner Enrolment and EISA"'], [''],
      ['Instructions'], ['FIRST SUBMISSION:'], ['Complete columns A–AJ and the DateStamp in column AQ on Sheet 2, per batch of learners per full or part qualification, and send to Learnerenrolments@qcto.org.za. Do not PDF this spreadsheet.'],
      ['SECOND SUBMISSION:'], ['Update columns AK–AP and the DateStamp, and send to EISAreadiness@qcto.org.za at least 3 months before the anticipated EISA date.'],
      ['NAMING CONVENTION:'], ['LEISAyyyymmdd-SDP/AC name'], [''], ['This file: ' + (stage === 1 ? 'first submission (enrolment)' : 'second submission (EISA readiness)')], [''],
      ['DETAILS: (COMPULSORY INFORMATION)'], ['Name and Surname of Compiler:', s.compiler_name || ''], ['Email address:', s.compiler_email || ''], ['Contact Number of Compiler:', s.compiler_phone || ''], ['Contact Number of Institution:', s.institution_phone || ''],
      ['Name of Qualification:', (p.qualification_type ? p.qualification_type + ': ' : '') + (p.programme_name || '')], ['Start Date: ', day(p.start_date)], ['Expected Completion Date:', day(p.end_date)], ['Name of SDP:', s.sdp_name || ''], ['Address of SDP:', s.sdp_address || ''], ['Province:', s.province || '']];
    X.utils.book_append_sheet(wb, sheet(X, ins, { allText: true, widths: [{ wch: 34 }, { wch: 60 }] }), '1 - Instructions');
    const rows = ls.map(l => LCOLS.map((c, i) => stage === 1 && i >= 36 && i < 42 ? '' : lval(c, l, p)));
    X.utils.book_append_sheet(wb, sheet(X, [LCOLS, ...rows], { allText: true }), '2 - Learner Enrolment and EISA.');
    return save(X, wb, leisaFileName(p));
  }
  window.qaExportLeisa = exportLeisa;

  window.qaLeisaPick = id => { lSel = lSel === id ? null : id; renderE(); setTimeout(() => { const c = $('leisaedit'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); }, 0); };
  window.qaLeisaSave = async function () {
    const l = (D().learners || []).find(x => x.id === lSel); if (!l) return;
    const fields = { ...(lrec(l.id)?.fields || {}) };
    document.querySelectorAll('#leisaedit [data-col]').forEach(el => { const v = el.value.trim(); if (v) fields[el.dataset.col] = v; else delete fields[el.dataset.col]; });
    const row = lrec(l.id);
    if (row) await write('LEISA fields', () => sb.from('leisa_learner').update({ fields, programme_id: lProg, updated_by: P.user.email }).eq('learner_id', l.id));
    else await write('LEISA fields', () => sb.from('leisa_learner').insert({ learner_id: l.id, tenant_id: P.tenant, programme_id: lProg, fields, updated_by: P.user.email }));
    if (row) row.fields = fields; else (D().leisa = D().leisa || []).push({ learner_id: l.id, programme_id: lProg, fields });
    say('LEISA fields saved for ' + l.first_name + ' ' + l.last_name); rebuildLEI(); renderE();
  };
  window.qaLeisaSettings = async function () {
    const p = (D().progs || []).find(x => x.id === lProg), prov = p?.provider || 'apex', v = {};
    document.querySelectorAll('#leisaset [data-k]').forEach(el => v[el.dataset.k] = el.value.trim() || null);
    const cur = (D().leisaSettings || []).find(s => s.provider === prov);
    if (cur) await write('SDP details', () => sb.from('leisa_settings').update(v).eq('provider', prov));
    else await write('SDP details', () => sb.from('leisa_settings').insert({ tenant_id: P.tenant, provider: prov, ...v }));
    if (cur) Object.assign(cur, v); else (D().leisaSettings = D().leisaSettings || []).push({ provider: prov, ...v });
    say('SDP and compiler details saved'); rebuildLEI(); renderE();
  };

  const _renderE = renderE;
  renderE = function () {
    _renderE();
    if (!P.user || eTab === 'Readiness') return;
    const progs = (D().progs || []).filter(p => leisaLearners(p.id).length);
    if (!progs.some(p => p.id === lProg)) lProg = progs[0]?.id ?? null;
    const top = document.querySelector('#view-eisa select');
    if (top) { top.innerHTML = progs.map(p => `<option value="${p.id}"${p.id === lProg ? ' selected' : ''}>${esc(p.programme_name)}</option>`).join('') || '<option>No programmes with learners</option>'; top.onchange = () => { lProg = +top.value; lSel = null; renderE(); }; }
    const p = progs.find(x => x.id === lProg);
    if (!p) { $('leisa').innerHTML = '<div class="empty"><b>No programmes with enrolled learners</b></div>'; return; }
    const s = settingsFor(p), ls = leisaLearners(p.id), res = ls.map(l => [l, ...check(l, p)]);
    const s1 = res.filter(r => r[1].length).length, s2 = res.filter(r => r[2].length).length;
    const start = day(p.start_date), due1 = start ? new Date(new Date(start).getTime() + 21 * 864e5).toISOString().slice(0, 10) : '';
    const wins = winFor({ pid: p.id }), eisa = wins[0]?.eisa_date, due2 = eisa ? (() => { const x = new Date(eisa); x.setMonth(x.getMonth() - 3); return x.toISOString().slice(0, 10); })() : '';
    const ro = !QA(), inp = (k, lab) => `<label>${lab}<input data-k="${k}" value="${esc(s[k] || '')}"${ro ? ' disabled' : ''}></label>`;
    const card = (t, c, w, m, due, k, lab, stage) => `<section class="card" style="flex:1 1 300px;display:flex;flex-direction:column;gap:8px"><h2>${t}</h2>
      <div class="kv"><span>Columns</span><span>${c}</span></div><div class="kv"><span>When</span><span>${w}</span></div><div class="kv"><span>Due</span><span style="font-weight:600">${due || 'Set the dates first'}</span></div><div class="kv"><span>Send to</span><span>${m}</span></div>
      <span class="badge ${k ? 'b-warn' : 'b-ok'}" style="align-self:flex-start">${k ? k + ' ' + lab : 'Ready to submit'}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn y sm" onclick="qaExportLeisa(${stage})">Export stage ${stage} file</button>${k ? `<button class="btn sm" onclick="qaExportLeisa(${stage},true)">Export anyway</button>` : ''}</div></section>`;
    $('leisa').innerHTML = `<div class="row" style="align-items:stretch">
      ${card('Stage 1 · Learner enrolment', 'A–AJ + DateStamp', 'Within 21 days after training start', 'Learnerenrolments@qcto.org.za', fmtD(due1), s1, 'learners with field errors', 1)}
      ${card('Stage 2 · EISA readiness', 'AK–AP + DateStamp', 'At least 3 months before the EISA date', 'EISAreadiness@qcto.org.za', due2 ? fmtD(due2) + ' for the ' + fmtD(eisa) + ' EISA' : '', s2, 'learners missing stage 2 fields', 2)}
      <section class="card" style="flex:1 1 300px;display:flex;flex-direction:column;gap:8px"><h2>File</h2>
        <div class="kv"><span>Name (QCTO convention)</span><span style="font-weight:600;word-break:break-all">${esc(leisaFileName(p))}</span></div>
        <div class="kv"><span>Template</span><span>QCTO, 2 sheets, 43 columns, all text</span></div>
        <div class="kv"><span>Compiler</span><span>${esc([s.compiler_name, s.compiler_email, s.compiler_phone].filter(Boolean).join(' · ') || 'Not set')}</span></div>
        <span class="sub">Exported as .xlsx only. The QCTO instructions say not to PDF this file. LearnerFaxNumber is written as “N/A” for everyone.</span></section></div>
      <section class="card" id="leisaset" style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:baseline"><h2 style="flex-grow:1">SDP and compiler details</h2><span class="sub">The compulsory DETAILS block on the Instructions sheet, and the SDPCode on every row</span></div>
        <div class="qagrid">${inp('sdp_name', 'Name of SDP')}${inp('sdp_code', 'SDP code (e.g. 07-QCTO/SDP…)')}${inp('sdp_address', 'Address of SDP')}${inp('province', 'Province')}${inp('compiler_name', 'Name and surname of compiler')}${inp('compiler_email', 'Compiler email')}${inp('compiler_phone', 'Compiler contact number')}${inp('institution_phone', 'Institution contact number')}</div>
        ${ro ? '' : '<div><button class="btn sm" onclick="qaLeisaSettings()">Save details</button></div>'}</section>
      <section class="card" style="padding:0"><div style="padding:16px 20px;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline"><h2 style="flex-grow:1">Field check before submission</h2><span class="sub">Select a learner to fill in or correct their LEISA fields</span></div>
      <div class="tw"><table class="dense"><thead><tr><th>Learner</th><th>Stage 1 (A–AJ)</th><th>Stage 2 (AK–AP)</th></tr></thead><tbody>${res.map(([l, a, b]) => `<tr${l.id === lSel ? ' style="background:var(--ground)"' : ''}><td><a href="#eisa" style="font-weight:600" onclick="qaLeisaPick(${l.id});return false">${esc(l.first_name + ' ' + l.last_name)}</a></td>
        <td style="white-space:normal">${a.length ? a.map(x => `<span class="badge b-bad" style="margin:2px">${esc(x)}</span>`).join('') : '<span class="badge b-ok">Complete</span>'}</td>
        <td style="white-space:normal">${b.length ? b.map(x => `<span class="badge b-warn" style="margin:2px">Missing ${esc(x)}</span>`).join('') : '<span class="badge b-ok">Complete</span>'}</td></tr>`).join('')}</tbody></table></div></section>
      ${editor(p)}`;
  };
  function editor(p) {
    const l = (D().learners || []).find(x => x.id === lSel); if (!l) return '';
    const ro = !QA(), f = lrec(l.id)?.fields || {}, [e1, e2] = check(l, p), bad = c => [...e1, ...e2].some(e => e.includes(c));
    const fld = c => FROM_DB.includes(c) ? `<label>${c}<input value="${esc(lval(c, l, p))}" disabled title="Comes from the learner or programme record"></label>`
      : `<label class="${bad(c) ? 'bad' : ''}">${c}${DATES.includes(c) ? ' (yyyymmdd)' : ''}<input data-col="${c}" value="${esc(f[c] ?? '')}" placeholder="${esc(lval(c, l, p) && !f[c] ? lval(c, l, p) : '')}"${SUGG[c] ? ` list="dl-${c}"` : ''}${ro ? ' disabled' : ''}></label>`;
    return `<section class="card" id="leisaedit" style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:baseline"><h2 style="flex-grow:1">LEISA fields · ${esc(l.first_name + ' ' + l.last_name)}</h2><span class="sub">Grey fields come from the learner and programme records. Placeholder values are filled in automatically on export. Suggestions are the values used in the March 2026 file, not an official QCTO code list.</span></div>
      ${Object.entries(SUGG).map(([k, a]) => `<datalist id="dl-${k}">${a.map(x => `<option value="${x}">`).join('')}</datalist>`).join('')}
      <h3 style="margin:0;font-size:14px">Stage 1 · columns A–AJ</h3><div class="qagrid">${S1.map(fld).join('')}</div>
      <h3 style="margin:0;font-size:14px">Stage 2 · columns AK–AP</h3><div class="qagrid">${S2.map(fld).join('')}</div>
      ${ro ? '<span class="sub">Only QA, ETQA or an admin can change LEISA fields.</span>' : '<div style="display:flex;gap:8px"><button class="btn y" onclick="qaLeisaSave()">Save LEISA fields</button><button class="btn" onclick="qaLeisaPick(' + l.id + ')">Close</button></div>'}</section>`;
  }

  /* ---------- wire up after every data load (called from live.js applyAll) ---------- */
  let bound = false;
  window.previewQA = function () {
    augTracker(); rebuildMods(); rebuildLEI();
    renderQ(); renderM(); renderA(); renderLeg(); if (typeof renderE === 'function') renderE();
    if (bound) return; bound = true;
    rebind('Import: columns matched', () => say('Import is switched off in the preview: it only holds test data. In the live app this will match columns by heading.'));
    rebind('Exported QCTO Projects Tracker.xlsx', exportTracker);
    rebind('Add programme to the moderation list', addModeration);
    rebind('Exported External Moderation', exportModeration);
    rebind('Add qualification to accreditation pipeline', addAccreditation);
    rebind("Exported QCTO Projects Tracker (.xlsx)", exportTracker);
    rebind("Exported External Moderation", exportModeration);
    rebind("Exported LEISA file, QCTO template (.xlsx)", () => { location.hash = 'eisa'; eTab = 'LEISA file'; renderE(); });
    const n = [...document.querySelectorAll('.famas')].find(x => /631 qualifications/.test(x.textContent));
    if (n) n.innerHTML = `From <b>Consolidated List: Pre-2009 qualifications and NATED</b> (${Object.keys(LEG).length} qualifications, ${Object.values(LEG).filter(r => r[2] === 'Yes').length} extended) · search by ID or title`;
    const lq = $('legq'); if (lq) { lq.removeAttribute('inputmode'); lq.placeholder = 'e.g. 57918 or “short term insurance”'; }
  };
})();
