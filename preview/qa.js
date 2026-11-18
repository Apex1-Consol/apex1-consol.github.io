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
  #qaov{position:fixed;inset:0;background:rgba(1,0,45,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
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
    try { await write('Tracker', () => sb.from('qcto_tracker').update({ [TCOL[k]]: v || null }).eq('id', r.dbid)); if (rec) rec[TCOL[k]] = v || null; if (k === 'eD' && v && r.book === 'Pending Booking') await window.qSet(i, 'book', 'Booked'); }
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
  // Live view: occupational programmes only, withdrawn learners out, PMs see their own; grouped by programme, 25 learners a page.
  let qScope = 'Running', qF = '', qQ = '', qPg = 0, qKey = '';
  const qRS = p => (window.dvApi && dvApi.runState) ? dvApi.runState(p) : 'Active';
  const qProg = r => (D().progs || []).find(p => p.id === r.pid);
  const qWd = r => (D().enrol || []).some(e => e.learner_id === r.lid && e.programme_id === r.pid && /withdraw/i.test((e.fields || {}).Status || (e.fields || {}).status || e.status || ''));
  const qPf = (p, ...k) => { const f = (p && p.fields) || {}; for (const x of k) if (f[x] && String(f[x]).trim()) return String(f[x]).trim(); return ''; };
  const qDur = pid => { const c = {}; QT.filter(r => r.pid === pid && r.d).forEach(r => c[r.d] = (c[r.d] || 0) + 1); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || ''; };
  const qFac = r => r.f || qPf(qProg(r), 'Facilitator', 'facilitator');
  const qAss = r => qPf(qProg(r), 'Assessor', 'assessor');
  function qBase() {
    if (QT.length && QT[0].pid === undefined) augTracker();
    return QT.map((r, i) => [r, i]).filter(([r]) => { const p = qProg(r); return p && !p.deleted_at && p.programme_type !== 'legacy' && !qWd(r) && (!window.apxMineProg || apxMineProg(p)); });
  }
  const qEnded = r => r.e && day(r.e) < iso();
  const q30 = () => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const QFK = {
    ns: ['Not started', r => r.cur === 'Not Started' && r.s && day(r.s) <= q30(), 'Programme running 30+ days, learner still Not Started', 'warn'],
    mon: ['Monitoring delayed', r => r.mon === 'Delayed', 'Schedule a visit and record the Monitoring date', 'bad'],
    sor: ['SOR pending after training end', r => r.sor === 'Pending' && qEnded(r), 'Usually outstanding PoE or workplace items', 'warn'],
    rdy: ['SOR issued, EISA not booked', r => r.sor === 'Issued' && r.book === 'Pending Booking', 'Book before registration closes', 'bad'],
    nyc: ['Not Yet Competent or Absent', r => /Not Yet Competent|Absent/.test(r.out || ''), 'Plan the re-write for the next official EISA date', 'bad'],
    noid: ['No SA ID number', r => !r.idFull, 'Needed to register the learner for the EISA · click the learner to add it', 'bad'],
    m1: ['In Progress after training ended', r => r.cur === 'In Progress' && qEnded(r), 'Mismatch: update Current Status', 'warn'],
    m2: ['Completed but SOR still Pending', r => r.cur === 'Completed' && r.sor === 'Pending', 'Mismatch: issue the SOR or correct the status', 'warn'],
    m3: ['EISA date set but not Booked', r => r.eD && r.book !== 'Booked', 'Mismatch: set EISA Booking Status', 'warn']
  };
  const QMIS = ['m1', 'm2', 'm3'];
  const QE = r => QA() || ((P.roles || []).includes('project_manager') && (!window.apxMineProg || apxMineProg(qProg(r) || {})));
  const eD = (r, fn, v, lab) => QE(r) ? `<input type="date" class="cellin" aria-label="${lab}" value="${day(v)}" onchange="${fn}">` : fmtD(day(v));
  const eT = (r, fn, v, lab, w = 160) => QE(r) ? `<input class="cellin" aria-label="${lab}" style="min-width:${w}px" value="${esc(v || '')}" onchange="${fn}">` : esc(v || '');
  const qVis = pid => { const v = (D().visits || []).filter(x => String(x.programme_id || ((x.fields || {}).Programme || [])[0]) === String(pid)).map(x => (x.fields || {})['Date of Visit'] || (x.fields || {}).Date).filter(Boolean).sort(); return v[v.length - 1]; };
  const qNext = pid => { const v = (D().visits || []).filter(x => String(x.programme_id || ((x.fields || {}).Programme || [])[0]) === String(pid)).sort((a, b) => String((a.fields || {})['Date of Visit']).localeCompare(String((b.fields || {})['Date of Visit']))); return v.length ? (v[v.length - 1].fields || {})['Next Visit Date'] : ''; };
  let qPre = null;
  window.qaQCoh = pid => { qV = 'Learner rows'; qF = ''; qPre = pid; renderQ(); };
  window.qaQGo = pid => { qScope = 'All'; qF = ''; qPre = pid; location.hash = 'qcto'; setTimeout(renderQ, 50); };
  // bulk: one status (and optional date) for every learner in one programme who is not already on it
  const QBF = [['cur', 'Current Status', null], ['mon', 'Monitoring Status', 'monD'], ['sor', 'SOR Status', 'sorD'], ['book', 'EISA Booking Status', 'eD'], ['out', 'EISA Outcome', null]];
  window.qaQBulk = pid => {
    const opts = []; QBF.forEach(([k, l]) => QV[k].filter(Boolean).forEach(v => opts.push(`${l}: ${v}`)));
    form('Set for all learners in this programme', [['what', 'Set', 'select', opts, opts[0]], ['date', 'Date (Monitoring, SOR issued or EISA date; optional)', 'date']], async v => {
      const [l, val] = v.what.split(': '), [k, , dk] = QBF.find(x => x[1] === l), col = { cur: 'current_status', mon: 'monitoring_status', sor: 'sor_status', book: 'eisa_booking_status', out: 'eisa_outcome' }[k];
      const rs = qBase().map(([r]) => r).filter(r => String(r.pid) === String(pid) && r[k] !== val); if (!rs.length) { say('Everyone is already on ' + val); return; }
      const dt = v.date || (k === 'sor' && val === 'Issued' ? iso() : ''), upd = { [col]: val }; if (dt && dk) upd[TCOL[dk]] = dt;
      await write('Tracker', () => sb.from('qcto_tracker').update(upd).in('id', rs.map(r => r.dbid)));
      rs.forEach(r => { r[k] = val; if (dt && dk) r[dk] = dt; const t = (D().tracker || []).find(x => x.id === r.dbid); if (t) Object.assign(t, upd); });
      say(`${val} set for ${rs.length} learner${rs.length === 1 ? '' : 's'}`); renderQ();
    });
  };
  // My work: PM per running programme with flags; QA when no EISA windows are recorded
  window.apxQTasks = role => { const out = []; try {
    if (role === 'qa' || role === 'admin') { if (!(D().windows || []).some(x => x.eisa_date >= iso())) out.push({ id: 'qwin', t: 'Add the next official EISA windows', s: 'None recorded, so every learner shows "to be confirmed"', k: 'QCTO', c: 'Add', on: `location.hash='qcto'`, bad: 1 }); }
    if (role === 'pm') { const g = new Map(); qBase().forEach(([r]) => { if (qRS(qProg(r)) !== 'Active') return; const ks = Object.keys(QFK).filter(k => k !== 'noid' && QFK[k][1](r)); if (ks.length) { const a = g.get(r.pid) || { n: 0, k: {} }; a.n++; ks.forEach(k => a.k[k] = (a.k[k] || 0) + 1); g.set(r.pid, a); } });
      g.forEach((a, pid) => { const p = qProg({ pid }) || {}, top = Object.keys(a.k).sort((x, y) => a.k[y] - a.k[x]);
        out.push({ id: `qt${pid}`, t: `Update QCTO tracker: #${p.display_id || pid} ${p.programme_name || ''} (${a.n})`, s: top.map(k => `${QFK[k][0]} ${a.k[k]}`).join(' · '), k: 'QCTO', c: 'Open', on: `qaQGo(${pid})` }); }); }
  } catch (e) {} return out; };
  window.qaQF = k => { qF = qF === k ? '' : k; if (k && QFK[k]) qScope = 'All'; renderQ(); };
  window.qaQS = s => { qScope = s; renderQ(); };
  window.qaQq = v => { qQ = v; renderQ(); };
  window.qaQpg = n => { qPg = n; renderQ(); };

  renderQ = function () {
    if (!P.user) return _renderQ();
    const admin = (P.roles || []).includes('admin');
    const ib = [...document.querySelectorAll('#view-qcto .btn')].find(b => /Import tracker/.test(b.textContent)); if (ib) ib.hidden = !admin;
    const wins = (D().windows || []).filter(x => x.eisa_date >= iso()).sort((a, b) => a.eisa_date < b.eisa_date ? -1 : 1);
    $('qwin').innerHTML = (wins.length ? wins.map(w => { const dd = dDays(w.registration_closing);
      return `<div class="kv"><span>${esc(w.label || 'Official EISA')}${w.qualification ? ' · ' + esc(w.qualification) : ''}</span><span style="font-weight:600">${dIn(`qaWin(${w.id},'eisa_date',this.value)`, w.eisa_date, 'EISA date')}</span></div>
        <div class="kv"><span>Registration closes</span><span style="font-weight:600;color:${dd <= 30 ? 'var(--bad)' : 'var(--ink)'}">${dIn(`qaWin(${w.id},'registration_closing',this.value)`, w.registration_closing, 'Registration closing')} · ${dd} days</span></div>`; }).join('<hr style="border:0;border-top:1px solid var(--line2);margin:6px 0">')
      : '<p class="sub">No upcoming EISA windows recorded. QA adds the official dates.</p>') + (QA() ? '<button class="btn sm" style="margin-top:10px" onclick="qaAddWindow()">+ Add EISA window</button>' : '');

    const base = qBase(), st = r => qRS(qProg(r)), cnt = s => base.filter(([r]) => s === 'All' || st(r) === (s === 'Running' ? 'Active' : s)).length;
    const scoped = base.filter(([r]) => qScope === 'All' || st(r) === (qScope === 'Running' ? 'Active' : qScope));
    // tiles: current status of the learners in scope (click = filter)
    const sc = k => scoped.filter(([r]) => r.cur === k).length;
    $('qkpis').className = ''; $('qkpis').innerHTML = `<div class="famtiles">${UI.tiles([{ t: `Learners · ${qScope === 'Running' ? 'running programmes' : qScope.toLowerCase()} · occupational only`, k: [
      ['All', scoped.length, '', !qF, "qaQF('')", 'Learners on the tracker'], ['Not Started', sc('Not Started'), '', qF === 'c:Not Started', "qaQF('c:Not Started')", 'Current status'], ['In Progress', sc('In Progress'), '', qF === 'c:In Progress', "qaQF('c:In Progress')", 'Current status'], ['Completed', sc('Completed'), 'var(--ok)', qF === 'c:Completed', "qaQF('c:Completed')", 'Current status']] }])}</div>`;
    const ns = new Set(base.filter(([r]) => QFK.ns[1](r)).map(([r]) => r.pid)).size;
    $('qflags').innerHTML = Object.entries(QFK).map(([k, [t, f, s, c]]) => { const n = base.filter(([r]) => f(r)).length;
      return `<a href="#qcto" onclick="qaQF('${k}');return false" style="${qF === k ? 'background:var(--line2)' : ''}"><span class="count b-${n ? c : 'ok'}">${n}</span><span style="flex-grow:1"><b style="display:block">${t}</b><span class="sub">${k === 'ns' ? `${ns} programme${ns === 1 ? '' : 's'} · ` : ''}${s}${k === 'rdy' && wins[0] ? ' · closes ' + fmtD(wins[0].registration_closing) : ''}</span></span></a>`; }).join('');

    // toolbar: scope tabs, view switch, client / programme filters, search
    if (!$('qscope')) $('qview').insertAdjacentHTML('afterend', '<div class="seg" id="qscope"></div>');
    $('qscope').innerHTML = ['Running', 'Planned', 'Completed', 'All'].map(s => `<button class="${s === qScope ? 'on' : ''}" onclick="qaQS('${s}')">${s} (${cnt(s)})</button>`).join('');
    $('qview').innerHTML = ['Learner rows', 'Cohort summary'].map(v => `<button class="${v === qV ? 'on' : ''}" onclick="qV='${v}';renderQ()">${v}</button>`).join('');
    $('qstat').hidden = true;
    if (!$('qq')) $('qstat').insertAdjacentHTML('afterend', '<input id="qq" class="fsel" type="search" placeholder="Search learner, client, #id" oninput="qaQq(this.value)" style="min-width:200px">');
    const cl = $('qclient'), cv = cl.value; cl.innerHTML = '<option value="">Client: All</option>' + [...new Set(scoped.map(([r]) => r.c))].sort().map(v => `<option${v === cv ? ' selected' : ''}>${esc(v)}</option>`).join('');
    const pg = $('qpm'), pv = qPre != null ? String(qPre) : pg.value, ps = [...new Map(scoped.filter(([r]) => !cl.value || r.c === cl.value).map(([r]) => [r.pid, r])).values()].sort((a, b) => (a.c + a.pid).localeCompare(b.c + b.pid));
    pg.innerHTML = '<option value="">Programme: All</option>' + ps.map(r => { const p = qProg(r); return `<option value="${r.pid}"${String(r.pid) === pv ? ' selected' : ''}>#${esc(p.display_id || p.id)} · ${esc(r.c)} · ${esc(p.programme_name || '')}</option>`; }).join('');
    qPre = null; const fc = cl.value, fp = pg.value, q = qQ.trim().toLowerCase();
    const rows = (QFK[qF] ? base : scoped).filter(([r]) => (!fc || r.c === fc) && (!fp || String(r.pid) === fp) && (!qF || (QFK[qF] ? QFK[qF][1](r) : r.cur === qF.slice(2)))
      && (!q || `${r.ln} ${r.sn} ${r.c} #${r.pid} ${r.p}`.toLowerCase().includes(q)))
      .sort((a, b) => (a[0].c + '|' + String(a[0].pid).padStart(6, '0') + '|' + a[0].ln + a[0].sn).localeCompare(b[0].c + '|' + String(b[0].pid).padStart(6, '0') + '|' + b[0].ln + b[0].sn));
    const key = [qScope, qF, fc, fp, q, qV].join('|'); if (key !== qKey) { qPg = 0; qKey = key; }
    const sel = (i, k, v) => `<select class="cellsel ${BADGE(v)}" aria-label="${k}" onchange="qSet(${i},'${k}',this.value)">${QV[k].map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    let pager = $('qpager'); if (!pager) { $('qtable').closest('.tw').insertAdjacentHTML('afterend', '<div id="qpager" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 20px"></div>'); pager = $('qpager'); }
    if (qV === 'Learner rows') {
      const PER = 25, pages = Math.max(1, Math.ceil(rows.length / PER)); if (qPg >= pages) qPg = pages - 1;
      const page = rows.slice(qPg * PER, qPg * PER + PER); let last = null;
      $('qtable').innerHTML = H(['No', 'Learner', 'Current Status', 'Monitoring Status', 'Monitoring Date', 'SOR Status', 'SOR Issued Date', 'EISA Booking Status', 'EISA Date', 'EISA Outcome', 'Comments']) + '<tbody>' +
        page.map(([r, i], n) => { const p = qProg(r) || {}, w = winFor(r), as = qAss(r);
          const gh = r.pid !== last ? UI.gh(`#${esc(p.display_id || p.id)} · ${esc(r.c)} · ${esc(p.programme_name || r.p)} · ${fmtD(r.s) || 'no start'} – ${fmtD(r.e) || 'no end'}`, rows.filter(([x]) => x.pid === r.pid).length, 'var(--navy)', 11,
            `${esc(qRS(p))} · PM ${esc(r.pm || 'not set')} · Facilitator ${esc(qFac(r) || 'not set')} · Assessor ${esc(as || 'not set')} · Duration ${esc(qDur(r.pid) || 'not set')} · Last visit ${fmtD(qVis(r.pid)) || 'none'}${qNext(r.pid) ? ' · Next visit ' + fmtD(qNext(r.pid)) : ''} · Next EISA ${w[0] ? fmtD(w[0].eisa_date) + ' (closes ' + fmtD(w[0].registration_closing) + ')' : 'to be confirmed'}${QE(r) ? ` <button class="btn sm" style="margin-left:8px" onclick="event.stopPropagation();qaQBulk(${r.pid})">Set for all…</button>` : ''}`) : ''; last = r.pid;
          const ov = r.a && r.a !== as ? ` · Assessor ${esc(r.a)}` : '';
          return gh + `<tr><td>${qPg * PER + n + 1}</td><td style="min-width:200px"><a href="#learners" style="font-weight:600;color:var(--navy)" onclick="window.previewLearnerEdit&&previewLearnerEdit(${r.lid});return false">${esc(r.ln)} ${esc(r.sn || '')}</a><div class="sub">${r.idFull ? 'ID ' + r.id : '<span class="badge b-bad">No SA ID</span>'}${ov}</div>${QMIS.filter(k => QFK[k][1](r)).map(k => `<span class="badge b-warn" style="margin-top:3px">${QFK[k][0]}</span>`).join(' ')}${r.mon === 'Delayed' ? ` <a class="badge b-bad" href="#visits" title="Record the visit on Monitoring Visits">Visit delayed</a>` : ''}</td>
          <td>${sel(i, 'cur', r.cur)}</td><td>${sel(i, 'mon', r.mon)}</td><td>${eD(r, `qaT(${i},'monD',this.value)`, r.monD, 'Monitoring date')}</td><td>${sel(i, 'sor', r.sor)}</td><td>${eD(r, `qaT(${i},'sorD',this.value)`, r.sorD, 'SOR issued date')}</td><td>${sel(i, 'book', r.book)}</td><td>${eD(r, `qaT(${i},'eD',this.value)`, r.eD, 'EISA date')}</td><td>${sel(i, 'out', r.out)}</td>
          <td>${eT(r, `qaT(${i},'cm',this.value)`, r.cm, 'Comments', 220)}</td></tr>`; }).join('') + (rows.length ? '' : '<tr><td colspan="11" class="sub" style="padding:16px">No learners match.</td></tr>') + '</tbody>';
      $('qcount').textContent = rows.length + ' learner' + (rows.length === 1 ? '' : 's') + (base.length !== QT.length ? ` · ${QT.length - base.length} legacy, withdrawn or other PMs' rows hidden` : '');
      pager.innerHTML = pages > 1 ? `<span class="sub">Page ${qPg + 1} of ${pages}</span><button class="btn sm" ${qPg ? '' : 'disabled'} onclick="qaQpg(${qPg - 1})">‹ Prev</button><button class="btn sm" ${qPg < pages - 1 ? '' : 'disabled'} onclick="qaQpg(${qPg + 1})">Next ›</button>` : '';
    } else {
      const PER = 25, gm = new Map(); rows.forEach(([r]) => { if (!gm.has(r.pid)) gm.set(r.pid, []); gm.get(r.pid).push(r); });
      const g = [...gm.entries()], pages = Math.max(1, Math.ceil(g.length / PER)); if (qPg >= pages) qPg = pages - 1;
      const c = (a, f) => a.filter(f).length, pill = (n, t, k, tip) => `<span class="badge ${n ? k : ''}" title="${tip}" style="margin:1px 2px 1px 0">${t} ${n}/${'$N'}</span>`;
      $('qtable').innerHTML = H(['Cohort', 'Project Manager', 'Learners', 'Progress', 'EISA dates booked', 'Enrolment requested / received', 'Facilitator / Assessor', 'Mentor', 'Certification']) + '<tbody>' +
        g.slice(qPg * PER, qPg * PER + PER).map(([pid, a]) => { const k = QCO[a[0].ci] || {}, p = qProg(a[0]) || {}, m = (D().mods || []).find(x => x.sheet === 'QCTO projects' && x.programme_id === pid) || {};
          const ed = {}; a.forEach(r => { if (r.eD) ed[r.eD] = (ed[r.eD] || 0) + 1; }); const n = a.length, cert = c(a, r => r.out === 'Competent');
          const nqf = p.nqf_level || ((p.programme_name || '').match(/NQF\s*(\d+)/i) || [])[1] || '';
          const mis = c(a, r => QMIS.some(x => QFK[x][1](r))), noid = c(a, r => !r.idFull), P_ = (x, t, cls, tip) => pill(x, t, cls, tip).replace('$N', n);
          const grey = [p.group_name || m.groups, `${fmtD(k.s) || 'no start'} – ${fmtD(k.e) || 'no end'}`, qRS(p), m.entity || p.entity, m.prog_type || (p.programme_type === 'occupational' ? 'Occupational' : p.programme_type), nqf && 'NQF ' + nqf, m.employment].filter(Boolean).map(esc).join(' · ');
          return `<tr class="famtr" style="cursor:pointer" title="Open the learners of this cohort" onclick="qaQCoh(${pid})"><td style="min-width:260px;max-width:380px;white-space:normal"><b style="color:var(--navy)">#${esc(p.display_id || pid)} · ${esc(k.c)}</b><div>${esc(k.p)}</div><div class="sub">${grey}</div></td>
          <td>${esc(k.pm || '—')}</td><td>${n}</td>
          <td style="min-width:220px;white-space:normal">${P_(c(a, r => r.sor === 'Issued'), 'SOR', 'b-info', 'SOR issued')}${P_(c(a, r => r.book === 'Booked'), 'Booked', 'b-info', 'EISA booked')}${P_(cert, 'Competent', 'b-ok', 'EISA outcome Competent')}${P_(c(a, r => /Not Yet Competent|Absent/.test(r.out || '')), 'NYC/Absent', 'b-bad', 'Not Yet Competent or Absent')}
            ${mis ? `<div><span class="badge b-warn">${mis} mismatch${mis === 1 ? '' : 'es'}</span>` : '<div>'}${noid ? ` <span class="badge b-bad">${noid} no SA ID</span>` : ''}</div></td>
          <td>${Object.entries(ed).sort().map(([dt, x]) => `${fmtD(dt)} × ${x}`).join('<br>') || '<span class="sub">—</span>'}</td>
          <td>${fmtD(day(m.enrolment_requested_date)) || '—'} / ${fmtD(day(m.enrolment_received_date)) || '—'}</td>
          <td style="white-space:normal;min-width:140px">${esc(qFac(a[0]) || 'not set')}<div class="sub">${esc(qAss(a[0]) || k.a || 'not set')}</div></td><td>${esc(m.mentor || '—')}</td>
          <td>${m.certification ? esc(m.certification) : cert ? `<span class="badge b-ok">${cert} competent</span>` : '<span class="sub">—</span>'}</td></tr>`; }).join('') + (g.length ? '' : '<tr><td colspan="9" class="sub" style="padding:16px">No cohorts match.</td></tr>') + '</tbody>';
      $('qcount').textContent = g.length + ' cohort' + (g.length === 1 ? '' : 's') + ' · click a cohort for its learners · enrolment, mentor and certification come from Moderation & Verification › QCTO projects';
      pager.innerHTML = pages > 1 ? `<span class="sub">Page ${qPg + 1} of ${pages}</span><button class="btn sm" ${qPg ? '' : 'disabled'} onclick="qaQpg(${qPg - 1})">‹ Prev</button><button class="btn sm" ${qPg < pages - 1 ? '' : 'disabled'} onclick="qaQpg(${qPg + 1})">Next ›</button>` : '';
    }
  };

  function exportTracker() {
    const X = xl(); if (!X) return;
    const head = ['No of Learners', 'Client Name', 'Project Manager', 'Facilitator', 'Assessor', 'Learner Name', 'Learner Surname', 'Learner ID Number', 'Programme Name', 'Duration', 'Start Date ', 'End Date', 'Current Status', 'Monitoring Status', 'Monitoring Date', 'SOR Status', 'SOR Issued Date', 'EISA Booking Status', 'EISA Date', 'EISA Outcome', 'Next Official EISA Date 1', 'Registration Closing Date 1', 'Next Official  EISA Date 2', 'Registration Closing Date 2', 'Comments'];
    const tbc = 'To be confirmed';
    const rows = qBase().map(([r], i) => { const w = winFor(r);
      return [i + 1, r.c, r.pm, qFac(r), r.a || qAss(r), r.ln, r.sn, r.idFull || '', r.p, r.d, day(r.s), day(r.e), r.cur, r.mon, day(r.monD), r.sor, day(r.sorD) || tbc, r.book, day(r.eD) || tbc, r.out || 'Pending', w[0] ? w[0].eisa_date : tbc, w[0] ? w[0].registration_closing : tbc, w[1] ? w[1].eisa_date : tbc, w[1] ? w[1].registration_closing : tbc, r.cm]; });
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
    const mP = m => m.programme_id != null ? (D().progs || []).find(p => p.id === m.programme_id) : null;
    const RS = m => { const p = mP(m); return window.dvApi && dvApi.runState ? dvApi.runState(p || { start_date: day(m.start_date), end_date: day(m.end_date), status: '' }) : 'Active'; };
    const ixS = m => MSTAGE.indexOf(m.stage), td = iso();
    const MF = { nl: ['Not linked', 'No programme linked: QA links it', m => !mP(m), 'var(--warn)'], oh: ['On hold', 'Stage is On hold', m => m.stage === 'On hold', 'var(--warn)'],
      aw: ['Awaiting SoRs or report', 'Exit verification stage before SoRs received', m => m.sheet === 'Exit verification' && ixS(m) < 7, 'var(--warn)'],
      ev: ['Verification date past, not done', 'Exit verification date has passed, SoRs not received', m => m.sheet === 'Exit verification' && ixS(m) < 7 && m.exit_verification_date && day(m.exit_verification_date) < td, 'var(--bad)'] };
    const TK = { 'External moderation': ['nl', 'oh'], 'QCTO projects': ['nl'], 'Exit verification stats': ['nl', 'aw', 'ev'], 'Projects completed': ['nl'] }[mTab];
    const scoped = mTab === 'External moderation' || mTab === 'QCTO projects';
    const src = mTab === 'External moderation' ? MOD.map((r, i) => [mrec(r.dbid) || {}, i]) : mTab === 'Exit verification stats' ? VER.map((r, i) => [mrec(r.dbid) || {}, i]) : of(SHEET[mTab]).map(m => [m, -1]);
    const mine = src.filter(([m]) => !(window.apxPMonly && apxPMonly()) || (mP(m) ? apxMineProg(mP(m)) : apxMineName(m.project_manager)));
    if (!TK.includes(mF)) mF = '';
    const inScope = ([m]) => !scoped || mF || mScope === 'All' || RS(m) === (mScope === 'Running' ? 'Active' : mScope);
    const q = mQ.trim().toLowerCase(), hay = m => { const p = mP(m); return `${p ? '#' + (p.display_id || p.id) : ''} ${m.client_name} ${m.qualification} ${p ? p.project_manager_name : ''} ${m.project_manager} ${m.entity} ${m.seta} ${m.verifier || ''}`.toLowerCase(); };
    const rows = mine.filter(inScope).filter(([m]) => (!mF || MF[mF][2](m)) && (!q || hay(m).includes(q)));
    const key = [mTab, mScope, mF, q].join('|'); if (key !== mKey) { mPg = 0; mKey = key; }
    let tools = $('mtools'); if (!tools) { $('mtabs').insertAdjacentHTML('afterend', '<div id="mtools" style="display:flex;flex-direction:column;gap:10px;margin-bottom:10px"><div id="mtiles" class="famtiles"></div><div id="mbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"></div></div>'); tools = $('mtools'); }
    const cnt = k => mine.filter(([m]) => MF[k][2](m)).length;
    $('mtiles').innerHTML = UI.tiles([{ t: 'Needs attention', k: TK.map(k => [MF[k][0], cnt(k), cnt(k) ? MF[k][3] : 'var(--muted)', mF === k, `qaMF('${k}')`, MF[k][1]]) }]);
    const sc = s => mine.filter(([m]) => s === 'All' || RS(m) === (s === 'Running' ? 'Active' : s)).length;
    $('mbar').innerHTML = (scoped ? UI.seg(['Running', 'Planned', 'Completed', 'All'], mF ? 'All' : mScope, o => `qaMS('${o}')`).replace(/>(Running|Planned|Completed|All)</g, (x, o) => `>${o} (${sc(o)})<`) : '') +
      `<input id="mq" type="search" placeholder="Search #id, client, qualification, PM" value="${esc(mQ)}" oninput="qaMQ(this.value)" style="flex:1 1 240px;max-width:340px">` +
      (mTab !== 'Projects completed' && mTab !== 'Exit verification stats' ? `<label class="sub" style="margin-left:auto;display:flex;gap:6px;align-items:center"><input type="checkbox" ${mAll ? 'checked' : ''} onchange="qaMAll(this.checked)"> All sheet columns</label>` : '');
    const tw = $('mtable').closest('.tw'); tw.classList.remove('tall');
    let pager = $('mpager'); if (!pager) { tw.insertAdjacentHTML('afterend', '<div id="mpager" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 20px"></div>'); pager = $('mpager'); }
    const PER = 25, pages = Math.max(1, Math.ceil(rows.length / PER)); if (mPg >= pages) mPg = pages - 1;
    const page = rows.slice(mPg * PER, mPg * PER + PER);
    const W = 'style="white-space:normal;min-width:120px;max-width:200px"';
    const progC = m => { const p = mP(m); return p ? `<a href="#programmes" style="font-weight:700;color:var(--navy)" onclick="dvApi.setProg(${p.id});dvProg&&dvProg(${p.id})">#${esc(p.display_id || p.id)}</a><div class="sub">${esc(RS(m))}</div>`
      : `<span class="badge b-warn">Not linked</span>${QA() ? `<div><button class="btn sm" style="margin-top:4px" onclick="qaMLink(${m.id})">Link</button></div>` : ''}`; };
    const pmC = m => { const p = mP(m); return esc((p && p.project_manager_name) || m.project_manager || '—'); };
    const B = [['Programme', progC], ['Client', m => `${esc(m.client_name || '')}<div class="sub">${esc(m.entity || '')}</div>`, 0, W], ['Project Manager', pmC], ['Type', m => esc(m.prog_type || '')],
      ['Qualification (OFO / ID)', m => esc(m.qualification || '') + ' ' + legB(m.qualification || ''), 0, 'style="white-space:normal;min-width:200px;max-width:320px"'], ['NQF', m => esc(m.nqf || '')]];
    const G = ['Learners', m => m.learners ?? ''], dts = m => `${fmtD(day(m.start_date)) || '—'}<div class="sub">to ${fmtD(day(m.end_date)) || '—'}</div>`;
    let cols, note;
    if (mTab === 'External moderation') {
      note = 'Same columns as the External Moderation sheet. FEEDBACK is a stage plus a date, so it can be filtered and counted; free-text notes go in Comments. Legacy qualifications are flagged from the Pre-2009 list.';
      cols = [...B, G, ['Groups', m => esc(m.groups || ''), 1], ['Employment', m => esc(m.employment || ''), 1], ['Dates', dts], ['Face-to-face or Online', m => esc(m.delivery || ''), 1],
        ['Facilitator / Assessor', m => `${esc(m.facilitator || '—')}<div class="sub">${esc(m.assessor || '—')}</div>`, 0, W], ['Moderator', m => esc(m.moderator || ''), 1], ['SETA', m => esc(m.seta || '')],
        ['Feedback stage', (m, i) => st('MOD', i, MOD[i][16])], ['Stage date', m => dIn(`qaM(${m.id},'stage_date',this.value)`, m.stage_date, 'Stage date')],
        ['Qualification registration date', m => tIn(`qaM(${m.id},'qual_registration_date',this.value)`, m.qual_registration_date, 'Qualification registration date', 110), 1], ['Comments', m => tIn(`qaM(${m.id},'comments',this.value)`, m.comments, 'Comments', 220)]];
    } else if (mTab === 'QCTO projects') {
      note = 'Same columns as the QCTO Projects sheet (QCTO active programmes). EISA dates are counted from the QCTO Projects Tracker, so they are not typed twice.';
      cols = [...B, ['Groups', m => esc(m.groups || ''), 1], G, ['Employment', m => esc(m.employment || ''), 1], ['Dates', dts],
        ['Enrolment requested', m => dIn(`qaM(${m.id},'enrolment_requested_date',this.value)`, m.enrolment_requested_date, 'Enrolment requested')], ['Enrolment received', m => dIn(`qaM(${m.id},'enrolment_received_date',this.value)`, m.enrolment_received_date, 'Enrolment received')],
        ['EISA dates (from tracker)', m => { const ed = {}; (D().tracker || []).filter(t => t.programme_id && t.programme_id === m.programme_id && t.eisa_date).forEach(t => ed[t.eisa_date] = (ed[t.eisa_date] || 0) + 1); return Object.entries(ed).map(([d, c]) => `${fmtD(d)} × ${c}`).join('<br>') || '<span class="sub">—</span>'; }],
        ['Facilitator / Assessor', m => `${esc(m.facilitator || '—')}<div class="sub">${esc(m.assessor || '—')}</div>`, 0, W],
        ['Monitoring date', m => tIn(`qaM(${m.id},'monitoring_date',this.value)`, m.monitoring_date, 'Monitoring date', 110), 1], ['Approval of alternative site', m => tIn(`qaM(${m.id},'alt_site_approval',this.value)`, m.alt_site_approval, 'Approval of alternative site', 110), 1],
        ['Mentor', m => tIn(`qaM(${m.id},'mentor',this.value)`, m.mentor, 'Mentor', 120)], ['Certification', m => tIn(`qaM(${m.id},'certification',this.value)`, m.certification, 'Certification', 160)], ['Comments', m => tIn(`qaM(${m.id},'comments',this.value)`, m.comments, 'Comments', 200)]];
    } else if (mTab === 'Exit verification stats') {
      note = 'Same columns as the VERIFICATION STATS 2026 sheet. The status is a stage; choosing “SoRs received” fills the submission date, and “Submitted to PM” moves the programme to Projects completed.';
      cols = [...B, G, ['SETA', m => esc(m.seta || '')], ['Verifier', m => tIn(`qaM(${m.id},'verifier',this.value)`, m.verifier, 'Verifier', 110)],
        ['Exit verification date', m => dIn(`qaM(${m.id},'exit_verification_date',this.value)`, m.exit_verification_date, 'Exit verification date') + (MF.ev[2](m) ? '<div><span class="badge b-bad">Past, not done</span></div>' : '')],
        ['Verification report received', m => tIn(`qaM(${m.id},'verification_report_received',this.value)`, m.verification_report_received, 'Verification report received', 110)], ['Stage', (m, i) => st('VER', i, VER[i][11])],
        ['Certificate / SoR submission date', m => dIn(`qaM(${m.id},'sor_submission_date',this.value)`, m.sor_submission_date, 'SoR submission date')], ['Comments', m => tIn(`qaM(${m.id},'comments',this.value)`, m.comments, 'Comments', 200)]];
    } else {
      note = 'Same columns as the PROJECTS COMPLETED 2026 sheet. Programmes arrive here when the exit-verification stage is set to “Submitted to PM”.';
      cols = [...B, G, ['SETA', m => esc(m.seta || '')], ['Exit verification date', m => fmtD(day(m.exit_verification_date))],
        ['Certificate / SoR submission date', m => dIn(`qaM(${m.id},'sor_submission_date',this.value)`, m.sor_submission_date || m.stage_date, 'SoR submission date')], ['Date submitted to PM', m => dIn(`qaM(${m.id},'submitted_to_pm_date',this.value)`, m.submitted_to_pm_date, 'Date submitted to PM')]];
    }
    cols = cols.filter(c => mAll || !c[2]);
    $('mnote').innerHTML = note + (mAll || !cols.length ? '' : ' Some sheet columns are hidden: tick “All sheet columns” to see them; Export has them all.');
    $('mtable').innerHTML = H(cols.map(c => c[0])) + '<tbody>' + (page.map(([m, i]) => `<tr>${cols.map(c => `<td ${c[3] || ''}>${c[1](m, i)}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${cols.length}"><div class="empty"><b>${src.length ? 'Nothing matches' : 'Nothing on this sheet yet'}</b>${!src.length && QA() ? '<span>Use “+ Add programme” to add one.</span>' : ''}</div></td></tr>`) + '</tbody>';
    pager.innerHTML = `<span class="sub" style="margin-right:auto;padding-left:0">${rows.length} of ${src.length} row${src.length === 1 ? '' : 's'}</span>` + (pages > 1 ? `<span class="sub">Page ${mPg + 1} of ${pages}</span><button class="btn sm" ${mPg ? '' : 'disabled'} onclick="qaMPg(${mPg - 1})">‹ Prev</button><button class="btn sm" ${mPg < pages - 1 ? '' : 'disabled'} onclick="qaMPg(${mPg + 1})">Next ›</button>` : '');
  };
  let mScope = 'Running', mF = '', mQ = '', mPg = 0, mKey = '', mAll = false;
  window.qaMF = k => { mF = mF === k ? '' : k; renderM(); };
  window.qaMS = s => { mScope = s; mF = ''; renderM(); };
  window.qaMQ = v => { mQ = v; renderM(); const e = $('mq'); if (e) { e.focus(); e.setSelectionRange(v.length, v.length); } };
  window.qaMPg = n => { mPg = n; renderM(); };
  window.qaMAll = v => { mAll = v; renderM(); };
  window.qaMLink = id => { const m = mrec(id); if (!m || !QA()) return; const cn = String(m.client_name || '').toLowerCase().trim(), cl = new Map((D().clients || []).map(c => [c.id, c.client_name || '']));
    const ps = (D().progs || []).filter(p => !p.deleted_at).map(p => [p, (cl.get(p.client_id) || '')]).sort((a, b) => ((cn && b[1].toLowerCase().includes(cn) ? 1 : 0) - (cn && a[1].toLowerCase().includes(cn) ? 1 : 0)) || (a[1] + a[0].id).localeCompare(b[1] + b[0].id));
    const opt = ([p, c]) => `${p.id} · #${p.display_id || p.id} · ${c} · ${p.programme_name || ''}`;
    form(`Link to a programme · ${m.client_name || ''} · ${m.qualification || ''}`, [['pid', 'Programme (same client first)', 'select', ['— choose —', ...ps.map(opt)], '— choose —']],
      async v => { const pid = parseInt(v.pid, 10); if (!pid) { say('Choose a programme'); throw Error('pid'); } await window.qaM(id, 'programme_id', pid); say('Linked'); }); };
  window.apxModTasks = role => { if (role !== 'qa' && role !== 'admin') return []; const a = (D().mods || []).filter(m => m.sheet === 'Exit verification' && MSTAGE.indexOf(m.stage) < 7).length;
    return a ? [{ id: 'modaw', t: `Moderation: ${a} awaiting SoRs or report`, s: 'Exit verification stage before SoRs received', k: 'Moderation', c: 'Open', on: `mTab='Exit verification stats';location.hash='modver';qaMF('aw')` }] : []; };

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
    add('External Moderation ', 'External Moderation List ' + new Date().getFullYear(), [...em, 'NUMBER OF THE LEARNERS', 'GROUPS', 'EMPLOYMENT STATUS', 'ACTUAL START DATE OF THE LEARNING PROGRAMME', 'END DATE OF THE LEARNING PROGRAMME', 'Training Face-to-face or Online', 'Facilitator', 'Assessor', 'Moderator', 'SETA', 'FEEDBACK ', 'Qualification Registration Date'],
      of('External moderation').map(m => [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.employment, day(m.start_date), day(m.end_date), m.delivery, m.facilitator, m.assessor, m.moderator, m.seta, fb(m), m.qual_registration_date]), [9, 10]);
    add('QCTO Projects', 'QCTO ACTIVE PROGRAMMES', [...em, 'Groups', 'NUMBER OF THE LEARNERS', 'EMPLOYMENT STATUS', 'ACTUAL START DATE OF THE LEARNING PROGRAMME', 'END DATE OF THE LEARNING PROGRAMME', 'Enrolment Requested', 'Enrolment Received', 'EISA Dates', 'Facilitator', 'Assessor', 'Monitoring Date', 'Approval of Alternative Site', 'Mentor', 'Certification', 'Comments'],
      of('QCTO projects').map(m => { const ed = {}; (D().tracker || []).filter(t => t.programme_id && t.programme_id === m.programme_id && t.eisa_date).forEach(t => ed[t.eisa_date] = (ed[t.eisa_date] || 0) + 1);
        return [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.groups, m.learners, m.employment, day(m.start_date), day(m.end_date), day(m.enrolment_requested_date), day(m.enrolment_received_date), Object.entries(ed).map(([d, c]) => fmtD(d) + ' x' + c).join(', '), m.facilitator, m.assessor, m.monitoring_date, m.alt_site_approval, m.mentor, m.certification, m.comments]; }), [9, 10, 11, 12]);
    const acc = (D().accs || []);
    add('Accreditation', 'QCTO ACCREDITATION', ['Number', 'Qualification and/or Skills Programme ID', 'Qualification and/or Skills Programme Title', 'NQF Level', 'Credits', 'Type of Qualification and/or Skills Programme', 'Provider Name', 'Quality SETA Partner', 'SMME', 'QCTO ADVISOR', 'QCTO Verifier', 'Status', 'Feedback'],
      acc.map((a, i) => [i + 1, a.saqa_id, a.title, a.nqf, a.credits, a.qual_type, a.provider, a.quality_partner, a.smme, a.qcto_advisor, a.qcto_verifier, a.status, accFeedback(a)]), []);
    add('VERIFICATION STATS ' + new Date().getFullYear(), 'EXIT VERIFICATION STATS - ' + new Date().getFullYear(), [...em, 'NUMBER OF THE LEARNERS', 'GROUPS', 'SETA', 'VERIFIER', 'EXIT VERIFICATION DATE', 'VERIFICATION REPORT RECEIVED', "Certificate/SoR's Submission Date", 'Status'],
      of('Exit verification').map(m => [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, m.verifier, day(m.exit_verification_date), m.verification_report_received, day(m.sor_submission_date), fb(m)]), [10, 12]);
    add('Project Completed', 'PROJECTS COMPLETED ' + new Date().getFullYear(), [...em, 'NUMBER OF THE LEARNERS', 'GROUPS', 'SETA', 'EXIT VERIFICATION DATE', "Certificate/SoR's Submission Date", 'Date submitted to  PM'],
      of('Projects completed').map(m => [m.entity, m.project_manager, m.client_name, m.prog_type, m.qualification, m.nqf, m.learners, m.groups, m.seta, day(m.exit_verification_date), day(m.sor_submission_date || m.stage_date), day(m.submitted_to_pm_date)]), [9, 10, 11]);
    return save(X, wb, `External_Moderation_-_${new Date().getFullYear()}.xlsx`);
  }
  window.qaExportModeration = exportModeration;

  /* =====================================================================
     ACCREDITATION  (+ legacy qualification check)
     ===================================================================== */
  const ASTAT = ['Desktop application to be submitted', 'Desktop application submitted', 'Desktop application successful', 'Site visit scheduled', 'Site visit done', 'Accreditation granted', 'Desktop application unsuccessful', 'Withdrawn'];
  const ABADGE = { 'Accreditation granted': 'b-ok', 'Desktop application successful': 'b-n', 'Site visit scheduled': 'b-warn', 'Site visit done': 'b-n', 'Desktop application to be submitted': 'b-bad', 'Desktop application unsuccessful': 'b-bad', 'Withdrawn': 'b-n', 'Desktop application submitted': 'b-n' };
  // Feedback is written the way the Accreditation sheet writes it, from the dates
  function accFeedback(a) {
    const f = s => fmtD(day(s));
    switch (a.status) {
      case 'Accreditation granted': return a.accreditation_from ? `Accreditation Granted (${f(a.accreditation_from)} – ${f(a.accreditation_to) || '?'})` : 'Accreditation Granted';
      case 'Site visit scheduled': return a.site_visit_date ? 'Site Visit - ' + f(a.site_visit_date) : 'Site visit to be scheduled';
      case 'Site visit done': return 'Site Visit - ' + (a.site_visit_date ? f(a.site_visit_date) + ' - ' : '') + 'DONE';
      case 'Desktop application successful': return 'Desktop Application Successful' + (a.desktop_date ? ' - ' + f(a.desktop_date) : '');
      case 'Desktop application unsuccessful': return 'Desktop Application Unsuccessful' + (a.desktop_date ? ' - ' + f(a.desktop_date) : '');
      case 'Withdrawn': return 'Withdrawn';
      case 'Desktop application submitted': return 'Desktop Application Submitted';
      default: return 'Desktop/Accreditation Application to be submitted';
    }
  }
  window.qaAccFeedback = accFeedback;
  const monthsLeft = a => a.status === 'Accreditation granted' && a.accreditation_to ? Math.floor((new Date(day(a.accreditation_to)) - TODAY) / (864e5 * 30.44)) : null;
  window.qaA = async function (id, col, v) {
    const a = (D().accs || []).find(x => x.id === id); if (!a) return;
    const before = { ...a }; a[col] = v === '' ? null : v; const fbk = (!before.feedback || /^(Accreditation Granted|Site Visit|Site visit to be scheduled|Desktop Application|Desktop\/Accreditation|Withdrawn)/.test(before.feedback)) ? accFeedback(a) : before.feedback; a.feedback = fbk; renderA();
    try { await write('Accreditation', () => sb.from('accreditation_items').update({ [col]: a[col], feedback: fbk }).eq('id', id)); }
    catch (e) { Object.assign(a, before); renderA(); }
  };
  const _renderA = renderA;
  renderA = function () {
    if (!P.user) return _renderA();
    const A = D().accs || [], aT = window.aT || 'All types', LGO = aT === 'Legacy (SETA)';
    const isLeg = a => /legacy/i.test(a.qual_type || '') || !!(typeof LEG === 'object' && LEG && LEG[String(a.saqa_id || '').trim()]);
    const tm = a => aT === 'All types' || isLeg(a) === LGO, AT = A.filter(tm), c = s => AT.filter(a => a.status === s).length;
    const exp = AT.filter(a => { const m = monthsLeft(a); return m != null && m < 12; }).length;
    $('akpis').innerHTML = ASTAT.slice(0, 6).reverse().concat(['Desktop application unsuccessful']).map(s => `<div class="kpi"><span class="l">${s}</span><span class="v">${c(s)}</span><span class="n"><span class="badge ${ABADGE[s]}">${s === 'Desktop application to be submitted' ? 'Action needed' : s === 'Desktop application unsuccessful' ? 'Resubmit' : s === 'Site visit scheduled' ? 'Prepare' : 'Status'}</span></span></div>`).join('')
      + `<div class="kpi"><span class="l">Expiring within 12 months</span><span class="v" style="color:${exp ? 'var(--bad)' : 'var(--ink)'}">${exp}</span><span class="n" style="color:var(--muted)">plan re-accreditation</span></div>`;
    const nk = x => String(x || '').trim().replace(/^SP:\s*/i, ''), cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '', pcnt = {}; let actAll = [];
    { // Programme checks: expiring / not accredited (client-side from programmes + accreditation_items)
      const td = new Date().toISOString().slice(0, 10), t90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
      const kc = x => String(x || '').trim(), gr = {};
      A.filter(a => a.status === 'Accreditation granted' && kc(a.saqa_id)).forEach(a => { const k = kc(a.saqa_id); if (!gr[k] || String(a.accreditation_to || '9') > String(gr[k].accreditation_to || '9')) gr[k] = a; });
      const act = (P.data.progs || []).filter(p => kc(p.saqa_id || p.qualification_code) && !/complet|cancel|closed/i.test((p.status || '') + ' ' + (p.programme_status || '')) && (!p.end_date || p.end_date >= td));
      actAll = act;
      act.forEach(p => { const k = nk(p.saqa_id || p.qualification_code); pcnt[k] = (pcnt[k] || 0) + 1; });
      const pLeg = p => { const k = kc(p.saqa_id || p.qualification_code); return !!(typeof LEG === 'object' && LEG && LEG[k]) || A.some(a => nk(a.saqa_id) === nk(k) && isLeg(a)); };
      const actT = aT === 'All types' ? act : act.filter(p => pLeg(p) === LGO);
      const exp = [], na = [];
      actT.forEach(p => { const a = gr[kc(p.saqa_id || p.qualification_code)];
        const lg = typeof LEG === 'object' && LEG ? LEG[kc(p.saqa_id || p.qualification_code)] : null;
        if (!a && lg && lg[2] === 'Yes') return;
        if (!a) na.push([p, lg ? 'Legacy (' + lg[0] + '), not extended' : 'No granted accreditation on record']);
        else if (a.accreditation_to && (a.accreditation_to < t90 || (p.end_date && a.accreditation_to < p.end_date))) exp.push([p, 'Accredited to ' + a.accreditation_to + (p.end_date && a.accreditation_to < p.end_date ? ' (before programme end ' + p.end_date + ')' : '')]); });
      if (!$('apchk')) $('akpis').insertAdjacentHTML('beforebegin', '<div id="apchk" style="margin-bottom:14px"></div>');
      const sel = window.aPC === 'exp' ? exp : window.aPC === 'na' ? na : /^q:/.test(window.aPC || '') ? act.filter(p => nk(p.saqa_id || p.qualification_code) === window.aPC.slice(2)).map(p => [p, 'Open programme on this qualification']) : null;
      const cl = p => { const c = (P.data.clients || []).find(x => x.id === p.client_id); return c ? c.client_name || (c.fields || {})['Company Name'] || '' : ''; };
      $('apchk').innerHTML = UI.tiles([{ t: 'Programme checks', k: [['Accreditation expiring', exp.length, 'var(--bad)', window.aPC === 'exp', "aPC=aPC==='exp'?null:'exp';renderA()"], ['No accreditation record', na.length, 'var(--bad)', window.aPC === 'na', "aPC=aPC==='na'?null:'na';renderA()"]] }])
        + (sel ? `<div class="tw" style="margin-top:10px"><table class="dense">${H(['ID', 'Programme', 'Client', 'Qualification ID', 'Start', 'End', 'PM', 'Issue'])}<tbody>${sel.sort((x, y) => kc(x[0].saqa_id).localeCompare(kc(y[0].saqa_id))).map(([p, r]) => `<tr><td>${esc(p.display_id || p.id)}</td><td style="white-space:normal;font-weight:600">${esc(p.programme_name || '')}</td><td>${esc(cl(p))}</td><td>${esc(kc(p.saqa_id || p.qualification_code))}</td><td>${p.start_date || ''}</td><td>${p.end_date || ''}</td><td>${esc(p.project_manager_name || '')}</td><td style="white-space:normal">${esc(r)}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty"><b>None</b></div></td></tr>'}</tbody></table></div>` : '');
    }
    $('afilter').innerHTML = ['All', 'Granted', 'In progress', 'To submit', 'Expiring'].map(f => `<button class="${f === aF ? 'on' : ''}" onclick="aF='${f}';renderA()">${f}</button>`).join('');
    if (!$('atype')) $('afilter').insertAdjacentHTML('afterend', '<div class="seg" id="atype" style="flex:0 1 460px"></div>');
    $('atype').innerHTML = ['All types', 'Legacy (SETA)', 'Occupational (QCTO)'].map(f => `<button class="${f === aT ? 'on' : ''}" onclick="aT='${f}';renderA()">${f}</button>`).join('');
    if (!$('atools')) $('atype').insertAdjacentHTML('afterend', '<span id="atools" style="display:flex;gap:8px;align-items:center"><input class="cellin" id="asearch" aria-label="Search qualifications" placeholder="Search ID or title" style="min-width:190px" oninput="aQ=this.value;renderA()"><button class="btn sm" id="asort" onclick="aS=!window.aS;renderA()"></button></span>');
    $('asort').textContent = window.aS ? 'Sorted by expiry' : 'Sort by expiry';
    const qs = String(window.aQ || '').trim().toLowerCase(), sm = a => !qs || (String(a.saqa_id || '') + ' ' + (a.title || '')).toLowerCase().includes(qs);
    const rows = () => { const r = AT.filter(a => m(a) && sm(a)); return window.aS ? r.slice().sort((x, y) => String(x.accreditation_to || '9999').localeCompare(String(y.accreditation_to || '9999'))) : r; };
    const m = a => aF === 'All' || (aF === 'Granted' ? a.status === 'Accreditation granted' : aF === 'To submit' ? ['Desktop application to be submitted', 'Desktop application unsuccessful'].includes(a.status) : aF === 'Expiring' ? (monthsLeft(a) ?? 99) < 12 : !['Accreditation granted', 'Desktop application to be submitted', 'Desktop application unsuccessful', 'Withdrawn'].includes(a.status));
    const sel = a => QA() ? `<select class="cellsel accsel ${ABADGE[a.status] || ''}" aria-label="Status" onchange="qaA(${a.id},'status',this.value)">${ASTAT.map(s => `<option${s === a.status ? ' selected' : ''}>${s}</option>`).join('')}</select>` : `<span class="badge ${ABADGE[a.status]}">${esc(a.status)}</span>`;
    { // Cards view (default) with overview panel; table kept as second view
      let aV = window.aV; try { aV = aV || localStorage.getItem('apxAccView'); } catch (e) { } aV = aV === 'table' ? 'table' : 'cards';
      if (!$('aview')) $('atools').insertAdjacentHTML('beforeend', '<span class="seg" id="aview" style="flex:0 0 auto"></span>');
      $('aview').innerHTML = ['cards', 'table'].map(v => `<button class="${v === aV ? 'on' : ''}" onclick="aV='${v}';try{localStorage.setItem('apxAccView','${v}')}catch(e){};renderA()">${v === 'cards' ? 'List' : 'Table'}</button>`).join('');
      const tw = $('atable').parentElement;
      if (!$('acards')) tw.insertAdjacentHTML('beforebegin', '<div id="acards" style="flex-wrap:wrap;gap:16px;align-items:flex-start;padding:16px 20px"></div>');
      tw.style.display = aV === 'cards' ? 'none' : ''; $('acards').style.display = aV === 'cards' ? 'flex' : 'none';
      if (aV === 'cards') {
        const td0 = new Date().toISOString().slice(0, 10), d10 = v => v ? String(v).slice(0, 10) : '';
        const flag = a => { const ml = monthsLeft(a), L = typeof LEG === 'object' && LEG ? LEG[nk(a.saqa_id)] : null;
          if (a.status === 'Accreditation granted' && a.accreditation_to && d10(a.accreditation_to) < td0) return [0, 'b-bad', 'Expired ' + d10(a.accreditation_to)];
          if (a.status === 'Withdrawn') return [3, 'b-n', 'Withdrawn'];
          if (a.status === 'Desktop application to be submitted') return [0, 'b-bad', 'Application to submit'];
          if (a.status === 'Desktop application unsuccessful') return [0, 'b-bad', 'Application unsuccessful'];
          if (L && L[2] !== 'Yes') return [0, 'b-bad', 'Legacy · not extended'];
          if (ml != null && ml < 6) return [0, 'b-bad', 'Expires in ' + Math.max(ml, 0) + ' months'];
          if (ml != null && ml < 12) return [1, 'b-warn', 'Expires in ' + ml + ' months'];
          if (a.status === 'Site visit scheduled') return [1, 'b-warn', 'Site visit scheduled' + (a.site_visit_date ? ' ' + d10(a.site_visit_date) : '')];
          if (isLeg(a) && !L) return [1, 'b-warn', 'Legacy · no extension recorded'];
          if (L) return [2, 'b-ok', 'Legacy · extended ' + (L[3] || '')];
          if (a.status === 'Accreditation granted' && !a.accreditation_to) return [1, 'b-warn', 'End date not set'];
          return [2, ABADGE[a.status] || 'b-n', a.status || 'Status not set']; };
        let list = rows(); if (!window.aS) list = list.map((a, i) => [flag(a)[0], i, a]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(x => x[2]);
        const a = list.find(x => x.id === window.aPick) || list[0];
        const cards = list.map(x => { const f = flag(x), n = pcnt[nk(x.saqa_id)] || 0;
          return `<tr onclick="aPick=${x.id};renderA()" style="cursor:pointer;border-top:1px solid var(--line);${a && x.id === a.id ? 'background:rgba(0,90,200,.08);box-shadow:inset 3px 0 0 var(--accent,#0a58ca)' : ''}"><td style="padding:7px 10px"><b style="display:block">${esc(x.title || 'Title not set')}</b><span class="sub">${esc(x.saqa_id || 'ID not set')} · ${esc(cap(x.qual_type) || 'Type not set')}${x.nqf != null ? ' · NQF ' + x.nqf : ''} · ${esc(x.quality_partner || 'partner not set')}</span></td><td style="padding:7px 10px"><span class="badge ${f[1]}" style="white-space:nowrap">${esc(f[2])}</span></td><td style="padding:7px 10px;text-align:right">${n || '<span class="sub">0</span>'}</td></tr>`; }).join('');
        const cardsT = cards ? `<div class="sub" style="margin:0 0 6px">${list.length} qualification${list.length === 1 ? '' : 's'}</div><div style="overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding:8px 10px">Qualification</th><th style="text-align:left;padding:8px 10px">Status</th><th style="text-align:right;padding:8px 10px;white-space:nowrap">Open prog.</th></tr></thead><tbody>${cards}</tbody></table></div>` : '<p class="sub">No qualifications match.</p>';
        let pane = '<p class="sub">No qualification selected.</p>';
        if (a) { const lg = isLeg(a), f = flag(a), kv = (k, v) => `<div style="display:flex;gap:8px;align-items:center"><span class="sub" style="min-width:130px;flex:none">${k}</span><span style="flex:1;min-width:0">${v || '<span class="sub">not set</span>'}</span></div>`;
          const cn = p => { const c = (P.data.clients || []).find(x => x.id === p.client_id); return c ? c.client_name || (c.fields || {})['Company Name'] || '' : ''; };
          const pr = actAll.filter(p => nk(p.saqa_id || p.qualification_code) === nk(a.saqa_id)).sort((x, y) => String(y.start_date || '').localeCompare(String(x.start_date || '')));
          pane = `<h2 style="white-space:normal">${esc(a.title || 'Title not set')}</h2>
            <span class="sub">${esc(a.saqa_id || 'ID not set')} · ${esc(cap(a.qual_type) || 'Type not set')} · NQF ${a.nqf ?? 'not set'} · ${a.credits != null ? a.credits + ' credits' : 'credits not set'}</span>
            <span><span class="badge ${f[1]}">${esc(f[2])}</span> ${legB(a.saqa_id || '')}</span>
            <div style="display:flex;flex-direction:column;gap:6px">${kv('Status', sel(a))}${kv('Accredited from', dIn(`qaA(${a.id},'accreditation_from',this.value)`, a.accreditation_from, 'Accredited from'))}${kv(lg ? 'Accredited / extended to' : 'Accredited to', dIn(`qaA(${a.id},'accreditation_to',this.value)`, a.accreditation_to, 'Accredited to'))}
            ${kv('Provider', esc(cap(a.provider)))}${kv('SETA / quality partner', esc(a.quality_partner || ''))}
            ${lg ? '' : kv('Desktop result date', dIn(`qaA(${a.id},'desktop_date',this.value)`, a.desktop_date, 'Desktop result date')) + kv('Site visit date', dIn(`qaA(${a.id},'site_visit_date',this.value)`, a.site_visit_date, 'Site visit date'))}
            ${kv('SMME', tIn(`qaA(${a.id},'smme',this.value)`, a.smme, 'SMME', 130))}${lg ? '' : kv('QCTO advisor', tIn(`qaA(${a.id},'qcto_advisor',this.value)`, a.qcto_advisor, 'QCTO advisor', 130)) + kv('QCTO verifier', tIn(`qaA(${a.id},'qcto_verifier',this.value)`, a.qcto_verifier, 'QCTO verifier', 130))}</div>
            <div><span class="sub">Feedback / next step</span><div style="white-space:normal">${esc(accFeedback(a)) || '<span class="sub">not set</span>'}</div></div>
            <h2 style="font-size:15px;margin-top:8px">Open programmes (${pr.length})</h2>
            <div class="list">${pr.map(p => `<a href="#programmes" onclick="window.dvApi&&dvApi.setProg(${p.id});setTimeout(()=>window.dvProg&&dvProg(${p.id}),50)"><span style="flex-grow:1"><b style="display:block;white-space:normal">${esc(p.programme_name || 'Programme ' + p.id)} <span class="sub" style="font-weight:400">#${p.id}</span></b><span class="sub">${esc(cn(p) || 'client not set')} · PM ${esc(p.project_manager_name || 'not set')} · ${p.start_date || 'start not set'} to ${p.end_date || 'end not set'}</span></span></a>`).join('') || '<p class="sub">No open programmes on this qualification.</p>'}</div>`; }
        $('acards').innerHTML = `<div style="flex:1 1 420px;min-width:0">${cardsT}</div><aside class="card" style="flex:0 1 380px;display:flex;flex-direction:column;gap:10px;position:sticky;top:12px">${pane}</aside>`;
      }
    }
    $('atable').innerHTML = H(['No', 'Qualification / SP ID', 'Title', 'Status', 'Accredited from', LGO ? 'Accredited / extended to' : 'Accredited to', 'Open programmes', 'NQF', 'Credits', 'Type', 'Provider', 'SETA / quality partner'].concat(LGO ? [] : ['Desktop result date', 'Site visit date'], ['SMME'], LGO ? [] : ['QCTO advisor', 'QCTO verifier'], ['Feedback'])) + '<tbody>' +
      (rows().map(a => { const ml = monthsLeft(a), k = nk(a.saqa_id), n = pcnt[k] || 0, ok = /^[\w .-]+$/.test(k);
        const lb = legB(a.saqa_id || '') || (isLeg(a) ? '<span class="badge b-n">Legacy · no extension recorded</span>' : '');
        return `<tr><td>${A.indexOf(a) + 1}</td><td>${esc(a.saqa_id || '')} ${lb}</td><td style="white-space:normal;min-width:220px;font-weight:600">${esc(a.title || '')}</td>
        <td>${sel(a)}</td><td>${dIn(`qaA(${a.id},'accreditation_from',this.value)`, a.accreditation_from, 'Accredited from')}</td><td>${dIn(`qaA(${a.id},'accreditation_to',this.value)`, a.accreditation_to, 'Accredited to')}</td>
        <td>${n && ok ? `<button class="btn sm" title="Show these programmes" onclick="aPC='q:${k}';renderA();document.getElementById('apchk').scrollIntoView({behavior:'smooth'})">${n}</button>` : n}</td>
        <td>${a.nqf ?? ''}</td><td>${a.credits ?? ''}</td><td>${esc(cap(a.qual_type))}</td><td>${esc(cap(a.provider))}</td><td>${esc(a.quality_partner || '')}</td>
        ${LGO ? '' : `<td>${dIn(`qaA(${a.id},'desktop_date',this.value)`, a.desktop_date, 'Desktop result date')}</td><td>${dIn(`qaA(${a.id},'site_visit_date',this.value)`, a.site_visit_date, 'Site visit date')}</td>`}
        <td>${tIn(`qaA(${a.id},'smme',this.value)`, a.smme, 'SMME', 130)}</td>${LGO ? '' : `<td>${tIn(`qaA(${a.id},'qcto_advisor',this.value)`, a.qcto_advisor, 'QCTO advisor', 130)}</td><td>${tIn(`qaA(${a.id},'qcto_verifier',this.value)`, a.qcto_verifier, 'QCTO verifier', 130)}</td>`}
        <td style="white-space:normal;min-width:200px">${esc(accFeedback(a))}${ml != null && ml < 12 ? ` <span class="badge ${ml < 6 ? 'b-bad' : 'b-warn'}">Expires in ${Math.max(ml, 0)} months</span>` : ''}</td></tr>`; }).join('')
        || `<tr><td colspan="17"><div class="empty"><b>No qualifications match</b></div></td></tr>`) + '</tbody>';
  };
  function addAccreditation() {
    if (!QA()) { say('Only QA, ETQA or an admin can add to the accreditation pipeline'); return; }
    form('Add qualification to the accreditation pipeline', [['saqa_id', 'Qualification / skills programme ID'], ['title', 'Title'], ['nqf', 'NQF level', 'number'], ['credits', 'Credits', 'number'],
      ['qual_type', 'Type', 'select', ['legacy', 'Occupational Certificate', 'National Occupational Certificate', 'Higher Occupational Certificate', 'Advanced Occupational Diploma', 'Skills Programme', 'Part Qualification'], 'Occupational Certificate'],
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
    rebind('Import: columns matched', () => say('Import by column heading is not switched on yet.'));
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
