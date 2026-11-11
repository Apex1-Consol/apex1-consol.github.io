/* Reports in the new look (live data). Replaces the old app's "Reports" screen:
   1. Monthly report reviews: reports.my_report_queue / reports.transition_report (the database decides who may do what).
   2. Downloads: CSV or Excel of each data set, filtered by client and programme, plus one workbook with everything. */
(() => {
const sb = window.__sb, P = window.__preview, D = () => P.data;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const say = m => { window.toast(m); const t = document.getElementById('toast'); if (t) t.textContent = m; };
const has = (...r) => (P.roles || []).some(x => x === 'admin' || r.includes(x));
const when = d => d ? new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const note = n => String(n || '').replace(/^\[\[tags:[^\]]*\]\]\n?/, '');

const ST = { pending: ['Pending review', 'b-warn'], needs_changes: ['Changes requested', 'b-bad'], approved: ['Approved', 'b-ok'], sent_to_client: ['Sent to client', ''], archived: ['Archived', ''] };
const ACT = { approved: 'Approve', needs_changes: 'Request changes', pending: 'Resubmit for review', sent_to_client: 'Mark sent to client', archived: 'Archive' };
let Q = null, QF = 'open', QERR = '';
const R = sb.schema('reports');

async function loadQ() { const r = await R.rpc('my_report_queue', { p_limit: 100 }); if (r.error) { QERR = r.error.message; Q = []; } else { QERR = ''; Q = r.data || []; } }
function queue() {
  if (Q === null) return '<div class="empty"><b>Loading…</b></div>';
  if (QERR) return `<div class="empty"><b>Could not load report reviews</b><span>${esc(QERR)}</span></div>`;
  const rows = QF === 'open' ? Q.filter(r => (r.next_actions || []).length) : Q;
  if (!rows.length) return `<div class="empty"><b>${QF === 'open' ? 'Nothing needs your action right now' : 'No monthly reports yet'}</b></div>`;
  return `<div class="tw"><table class="dense"><thead><tr><th>Client / programme</th><th>Month</th><th>Status</th><th>Reviewer note</th><th>Next action</th></tr></thead><tbody>${rows.map(r => {
    const st = ST[r.status] || [r.status, ''], acts = r.next_actions || [];
    return `<tr><td><a href="/report-generator.html?report=${+r.id}" target="_blank" rel="noopener"><b>${esc(r.client_name || 'Report ' + r.id)}</b> ↗</a><div class="famas">${esc(r.programme_name || '')}${r.submitted_by_email ? ' · ' + esc(r.submitted_by_email) : ''}</div><a href="#" class="famas" onclick="rpHist(${+r.id});return false">History</a></td>
      <td>${esc(r.month || '')}</td><td><span class="badge ${st[1]}">${esc(st[0])}</span><div class="famas">${esc(r.reviewed_by ? 'Reviewed by ' + r.reviewed_by + ' · ' + when(r.reviewed_at) : r.printed_at ? 'Submitted ' + when(r.printed_at) : '')}</div></td>
      <td style="max-width:320px;white-space:pre-wrap">${esc(note(r.reviewer_note)) || '—'}</td>
      <td>${acts.length ? `${acts.includes('needs_changes') ? `<textarea id="rpn-${r.id}" class="cellin" rows="2" placeholder="Note for the PM (needed to request changes)" style="width:100%;min-width:200px;margin-bottom:6px"></textarea>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap">${acts.map(a => `<button class="btn sm ${a === 'needs_changes' ? '' : 'y'}" onclick="rpAct(${+r.id},'${esc(a)}',this)">${esc(ACT[a] || a)}</button>`).join('')}</div>` : '<span class="famas">No action for you</span>'}</td></tr>
      <tr id="rph-${r.id}" hidden><td colspan="5"></td></tr>`; }).join('')}</tbody></table></div>`;
}
/* Saved drafts from the Report Generator (reports.drafts; each PM sees only their own, admins all) */
let DR = null, DRALL = false, DROPEN = false;
async function loadDr() { const r = await R.from('drafts').select('id,programme_id,client_name,programme_name,month,pm_email,saved_at,updated_at').order('updated_at', { ascending: false }); DR = r.error ? { err: r.error.message } : r.data || []; }
function drafts() {
  if (DR === null) return '';
  if (DR.err) return `<section class="card"><b>Saved drafts</b><div class="famas">Could not load: ${esc(DR.err)}</div></section>`;
  const rows = DRALL ? DR : DR.slice(0, 10);
  return `<section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line2)">
    <h2 style="flex-grow:1;font-size:18px;cursor:pointer" onclick="rpDrOpen()">${DROPEN ? '▾' : '▸'} Saved drafts <span style="font-weight:400;color:var(--muted)">(${DR.length})</span></h2>${!DROPEN ? '' : DR.length > 10 ? `<button class="btn sm" onclick="rpDrAll()">${DRALL ? 'Show latest 10' : 'Show all ' + DR.length}</button>` : ''}<a class="btn sm" href="/report-generator.html" target="_blank" rel="noopener">Open in Report Generator ↗</a></div>
    ${!DROPEN ? '' : DR.length ? `<div class="tw"><table class="dense"><thead><tr><th>Client</th><th>Programme</th><th>Month</th><th>PM</th><th>Last saved</th></tr></thead><tbody>${rows.map(d => `<tr><td><b>${esc(d.client_name || '')}</b></td><td>${esc(d.programme_name || '')}</td><td>${esc(d.month || '')}</td><td>${esc(pmName(d.pm_email))}</td><td>${esc(when(d.saved_at || d.updated_at))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No saved drafts</b></div>'}</section>`;
}
window.rpDrOpen = () => { DROPEN = !DROPEN; render(); };
window.rpDrAll = () => { DRALL = !DRALL; render(); };
/* ---------- Monthly progress + deadline tracker (same rules as the Report Generator dashboard) ---------- */
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fri = d => { const w = d.getDay(); return w === 6 ? dAdd(d, -1) : w === 0 ? dAdd(d, -2) : d; };
const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtD = d => d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const mIdx = m => { const x = /^([A-Za-z]+)\s+(\d{4})$/.exec(m || ''); return x ? +x[2] * 12 + MN.indexOf(x[1]) : -1; };
const mName = i => MN[i % 12] + ' ' + Math.floor(i / 12);
function dls(month) { const i = mIdx(month) + 1, y = Math.floor(i / 12), m = i % 12, submit = fri(new Date(y, m, 5)), send = fri(new Date(y, m, 7)), pre = dAdd(send, -1);
  return { submit, send, review: pre.getDay() % 6 === 0 ? send : pre, submitWarn: dAdd(submit, -2), sendWarn: dAdd(send, -1) }; }
const STAGE = { notstarted: 'Not started', draft: 'With PM (draft)', changes: 'Changes requested', review: 'Waiting for review', approved: 'Approved, not sent', sent: 'Sent to client' };
const STC = { notstarted: '#B42318', draft: '#9A3412', changes: '#C2410C', review: '#3A3994', approved: '#0F6B45', sent: '#25247B' };
function tone(x, month) {
  if (x.stage === 'sent') return ['', 'Sent'];
  const curI = (() => { const n = new Date(); return n.getFullYear() * 12 + n.getMonth() - 1; })();
  if (x.stage === 'approved' && mIdx(month) < curI) return ['', 'Approved'];   // earlier months: approved counts as done
  const r = x.r, t = day(new Date()), dl = dls(month), hu = r && r.hold_until ? new Date(r.hold_until + 'T00:00') : null;
  if (hu && t <= hu) return ['hold', 'On hold to ' + fmtD(hu)];
  const st = ['notstarted', 'draft', 'changes'].includes(x.stage) ? 'submit' : x.stage === 'review' ? 'review' : 'send';
  const due = dl[st], warn = st === 'submit' ? dl.submitWarn : st === 'send' ? dl.sendWarn : dl.review;
  if (t > due) return ['dan', 'Overdue · due ' + fmtD(due)];
  if (t >= warn) return ['warn', 'Due ' + fmtD(due)];
  return ['', 'Due ' + fmtD(due)];
}
let TR = null, TRM = null, TRS = '', TRPM = '', TRV = 'prog';
async function loadTR() {
  const r = await R.from('reports').select('id,programme_id,client_name_snapshot,programme_name_snapshot,month,status,submitted_by_email,hold_until,remind_pm_at').neq('status', 'archived');
  if (r.error) { TR = { err: r.error.message }; return; }
  const reps = r.data || [], drs = Array.isArray(DR) ? DR : [], cur = (() => { const n = new Date(); return n.getFullYear() * 12 + n.getMonth() - 1; })();
  const months = new Set([...reps.map(x => x.month), ...drs.map(x => x.month), mName(cur)].filter(m => mIdx(m) >= 0));
  const byM = {};
  [...months].sort((a, b) => mIdx(a) - mIdx(b)).forEach(m => {
    const rows = [], seen = new Set();
    reps.filter(x => x.month === m).forEach(x => { seen.add(String(x.programme_id)); rows.push({ r: x, pid: x.programme_id, client: x.client_name_snapshot, prog: x.programme_name_snapshot, pm: x.submitted_by_email,
      stage: { needs_changes: 'changes', pending: 'review', approved: 'approved', sent_to_client: 'sent' }[x.status] || 'review' }); });
    drs.filter(d => d.month === m && !seen.has(String(d.programme_id))).forEach(d => { seen.add(String(d.programme_id)); rows.push({ r: null, pid: d.programme_id, client: d.client_name, prog: d.programme_name, pm: d.pm_email, stage: 'draft' }); });
    // Not started: reported on last month, nothing yet this month
    const prev = mName(mIdx(m) - 1);
    if (mIdx(m) <= cur) [...reps.filter(x => x.month === prev).map(x => ({ pid: x.programme_id, client: x.client_name_snapshot, prog: x.programme_name_snapshot, pm: x.submitted_by_email })),
      ...drs.filter(d => d.month === prev).map(d => ({ pid: d.programme_id, client: d.client_name, prog: d.programme_name, pm: d.pm_email }))]
      .forEach(x => { if (seen.has(String(x.pid))) return; seen.add(String(x.pid)); const p = (D().progsAll || []).find(q => q.id === x.pid); if (p && (p.deleted_at || p.status === 'closed')) return; rows.push({ r: null, ...x, stage: 'notstarted' }); });
    rows.forEach(x => { x.t = tone(x, m); });
    byM[m] = rows;
  });
  TR = { byM, cur: mName(cur), curI: cur, reps }; if (!TRM || !byM[TRM]) TRM = byM[TR.cur] ? TR.cur : Object.keys(byM).pop();
}
const acts = x => { if (!x.r) return []; const q = (Q || []).find(r => r.id === x.r.id); return ((q && q.next_actions) || []).filter(a => a !== 'archived' && a !== 'pending'); };
window.rpNote = id => { const t = $('rpn-row-' + id); if (t) { t.hidden = !t.hidden; if (!t.hidden) $('rpn-' + id).focus(); } };
const pmName = e => String(e || 'Unassigned').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function tracker() { const h = trackerM(); if (TRV !== 'prog' || !h.includes('<!--TRBODY-->')) return h; return h.slice(0, h.indexOf('<!--TRBODY-->')) + progView() + '</section>'; }
function trackerM() {
  if (TR === null) return '';
  if (TR.err) return `<section class="card"><b>Monthly reports</b><div class="famas">Could not load: ${esc(TR.err)}</div></section>`;
  const admin = has(), months = Object.keys(TR.byM), f = rows => rows.filter(x => !TRPM || x.pm === TRPM);
  const bar = m => { const rows = f(TR.byM[m]), n = rows.length, sent = rows.filter(x => x.stage === 'sent' || (x.stage === 'approved' && x.t[1] === 'Approved')).length, od = rows.filter(x => x.t[0] === 'dan').length;
    const segs = Object.keys(STAGE).map(k => { const c = rows.filter(x => x.stage === k).length; return c ? `<span title="${STAGE[k]}: ${c}" style="flex:${c};background:${STC[k]}"></span>` : ''; }).join('');
    return `<button onclick="rpTM('${m}')" style="all:unset;cursor:pointer;display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;border:${m === TRM ? '2px solid var(--accent)' : '1px solid var(--line)'};background:var(--surface);min-width:180px;flex:1 1 180px">
      <span style="display:flex;justify-content:space-between;gap:8px"><b>${esc(m)}${m === TR.cur ? ' <span class="badge b-warn">Current</span>' : ''}</b><span style="font-size:12.5px;color:var(--muted)">${sent} of ${n} done</span></span>
      <span style="display:flex;height:10px;border-radius:6px;overflow:hidden;background:var(--line2)">${segs}</span>
      <span class="famas">${od ? `<span style="color:var(--bad);font-weight:600">${od} overdue</span>` : n ? 'Nothing overdue' : 'No reports'}</span></button>`; };
  const rows = f(TR.byM[TRM] || []).filter(x => !TRS || x.stage === TRS).sort((a, b) => ({ dan: 0, warn: 1, hold: 2, '': 3 }[a.t[0]] - { dan: 0, warn: 1, hold: 2, '': 3 }[b.t[0]]) || Object.keys(STAGE).indexOf(a.stage) - Object.keys(STAGE).indexOf(b.stage) || String(a.client).localeCompare(String(b.client)));
  const all = f(TR.byM[TRM] || []), pms = [...new Set(months.flatMap(m => TR.byM[m].map(x => x.pm)).filter(Boolean))].sort();
  const chips = Object.keys(STAGE).map(k => { const c = all.filter(x => x.stage === k).length; return c ? `<button class="btn sm ${TRS === k ? 'y' : ''}" onclick="rpTS('${k}')"><span style="width:8px;height:8px;border-radius:50%;background:${STC[k]};display:inline-block;margin-right:6px"></span>${STAGE[k]} ${c}</button>` : ''; }).join('');
  const TB = { dan: 'b-bad', warn: 'b-warn', hold: '', '': 'b-ok' };
  return `<section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line2)">
    <h2 style="flex-grow:1;font-size:18px">Monthly reports</h2><span class="seg" style="display:inline-flex;gap:4px"><button class="btn sm ${TRV === 'prog' ? 'y' : ''}" onclick="rpTV('prog')">By programme</button><button class="btn sm ${TRV === 'month' ? 'y' : ''}" onclick="rpTV('month')">By month</button></span>${admin && pms.length > 1 ? `<select class="cellin" style="height:36px" onchange="rpTP(this.value)"><option value="">All PMs</option>${pms.map(p => `<option value="${esc(p)}"${p === TRPM ? ' selected' : ''}>${esc(pmName(p))}</option>`).join('')}</select>` : ''}<button class="btn sm" onclick="rpTR()">Refresh</button></div>
<!--TRBODY-->
    <div style="display:flex;flex-wrap:wrap;gap:10px;padding:14px 20px">${months.slice(-4).map(bar).join('')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 20px 12px">${chips}${TRS ? '<button class="btn sm ghost" style="color:var(--ink)" onclick="rpTS(\'\')">Show all</button>' : ''}</div>
    <div class="tw"><table class="dense"><thead><tr><th>Client / programme</th><th>PM</th><th>Stage</th><th>Deadline</th><th></th></tr></thead><tbody>
    ${rows.map(x => `<tr><td><b>${esc(x.client || '')}</b><div style="font-size:12.5px;color:var(--muted);margin-top:2px">${esc(x.prog || '')}${x.r ? ` · <a href="#" onclick="rpHist(${+x.r.id});return false" style="color:inherit">History</a>` : ''}</div></td><td>${esc(pmName(x.pm))}</td>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STC[x.stage]};margin-right:6px"></span>${STAGE[x.stage]}</td>
      <td><span class="badge ${TB[x.t[0]]}">${esc(x.t[1])}</span>${x.r && x.r.remind_pm_at ? `<div style="font-size:12.5px;color:var(--muted);margin-top:2px">Reminded ${esc(fmtD(new Date(x.r.remind_pm_at)))}</div>` : ''}</td>
      <td style="text-align:right;line-height:2.4">${x.r ? `<a class="btn sm" href="/report-generator.html?report=${+x.r.id}" target="_blank" rel="noopener">Open ↗</a>` : `<a class="btn sm" href="/report-generator.html" target="_blank" rel="noopener">Generator ↗</a>`}
        ${acts(x).map(a => a === 'needs_changes' ? ` <button class="btn sm" onclick="rpNote(${+x.r.id})">Request changes</button>` : ` <button class="btn sm y" onclick="rpAct(${+x.r.id},'${a}',this)">${esc(ACT[a] || a)}</button>`).join('')}
        ${admin && x.r && ['changes', 'approved'].includes(x.stage) && !x.r.remind_pm_at ? ` <button class="btn sm" onclick="rpRemind(${+x.r.id},this)">Remind PM</button>` : ''}</td></tr>
      ${x.r ? `<tr id="rpn-row-${+x.r.id}" hidden><td colspan="5"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start"><textarea id="rpn-${+x.r.id}" class="cellin" rows="2" placeholder="Note for the PM: what needs to change" style="flex:1 1 320px"></textarea><button class="btn sm y" onclick="rpAct(${+x.r.id},'needs_changes',this)">Send to PM</button><button class="btn sm" onclick="rpNote(${+x.r.id})">Cancel</button></div></td></tr>
      <tr id="rph-${+x.r.id}" hidden><td colspan="5"></td></tr>` : ''}`).join('') || `<tr><td colspan="5" class="famas" style="padding:16px 20px">No reports for ${esc(TRM)}${TRS ? ' at this stage' : ''}.</td></tr>`}
    </tbody></table></div><p class="note" style="margin:12px 20px">Deadlines as in the Report Generator: to the reviewer by the 5th, to the client by the 7th of the next month (Friday if that falls on a weekend). "Not started" = reported on last month, nothing yet this month.</p></section>`;
}
/* By programme: one block per month of the programme's run, coloured by that month's report; click opens it. */
const PV = { sent_to_client: ['Sent', '#25247B'], archived: ['Archived', '#5F5E5A'], approved: ['Approved', '#0F6E56'], pending: ['Waiting for review', '#534AB7'], needs_changes: ['Changes requested', '#D85A30'], draft: ['Draft', '#BA7517'], missing: ['Missing, overdue', '#A32D2D'], due: ['Due, not started', '#EF9F27'] };
const monthsOfProg = p => { const a = p.start_date && new Date(p.start_date), b = p.end_date && new Date(p.end_date); if (!a || !b || b < a) return null; const out = []; for (let i = a.getFullYear() * 12 + a.getMonth(); i <= b.getFullYear() * 12 + b.getMonth() && out.length < 60; i++) out.push(i); return out; };
function progView() {
  const admin = has(), reps = TR.reps || [], drs = Array.isArray(DR) ? DR : [], cur = TR.curI;
  const mine = new Set([...reps.map(r => r.programme_id), ...drs.map(d => d.programme_id)].map(String));
  let progs = (D().progsAll || D().progs || []).filter(p => mine.has(String(p.id)) || (admin && !p.deleted_at && ['active', 'handed_over'].includes(p.status)));   // programmes with reports count even if hidden elsewhere
  if (TRPM) progs = progs.filter(p => reps.some(r => r.programme_id === p.id && r.submitted_by_email === TRPM) || drs.some(d => d.programme_id === p.id && d.pm_email === TRPM));
  const cname = p => (D().clients || []).find(c => c.id === p.client_id)?.client_name || reps.find(r => r.programme_id === p.id)?.client_name_snapshot || drs.find(d => d.programme_id === p.id)?.client_name || 'No client';
  const groups = {}; progs.forEach(p => (groups[cname(p)] = groups[cname(p)] || []).push(p));
  const cell = (p, i) => {
    const m = mName(i), r = reps.find(x => x.programme_id === p.id && x.month === m), d = !r && drs.find(x => x.programme_id === p.id && x.month === m);
    const k = r ? r.status : d ? 'draft' : i > cur ? null : (day(new Date()) > dls(m).submit ? 'missing' : 'due');
    const lab = MN[i % 12].slice(0, 3) + ' ' + String(Math.floor(i / 12)).slice(2);
    const tip = m + ' · ' + (k ? PV[k][0] : 'Upcoming'), href = r ? '/report-generator.html?report=' + r.id : '/report-generator.html';
    return `<a href="${href}" target="_blank" rel="noopener" title="${esc(tip)}" style="flex:1;min-width:46px;height:30px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;text-decoration:none;${k ? `background:${PV[k][1]};color:#fff` : 'background:var(--surface2);color:var(--muted);border:1px dashed var(--border2)'};${i === cur ? 'outline:2px solid var(--ink);outline-offset:1px;' : ''}">${lab}</a>`;
  };
  const row = p => {
    const ms = monthsOfProg(p), have = [...new Set([...reps, ...drs].filter(x => x.programme_id === p.id).map(x => mIdx(x.month)).filter(i => i >= 0))].sort((a, b) => a - b);
    const list = ms || have, pos = ms ? ms.indexOf(cur) : -1, pm = reps.find(r => r.programme_id === p.id)?.submitted_by_email || drs.find(d => d.programme_id === p.id)?.pm_email || p.project_manager_name;
    const where = ms ? (pos >= 0 ? `Month ${pos + 1} of ${ms.length}` : cur < ms[0] ? `Starts ${mName(ms[0])}` : `Ended ${mName(ms[ms.length - 1])} · ${ms.length} months`) : 'No start or end date';
    return `<div style="padding:10px 20px;border-top:1px solid var(--line2);display:grid;gap:6px;grid-template-columns:minmax(0,1fr)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(p.programme_name || '')}${p.group_name ? ` <span style="font-weight:400;color:var(--muted)">· ${esc(p.group_name)}</span>` : ''}</b><span style="font-size:12.5px;color:var(--muted)">${esc(where)} · ${esc(pmName(pm))}</span></div>
      ${list.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap">${list.map(i => cell(p, i)).join('')}</div>` : '<div style="font-size:12.5px;color:var(--muted)">No reports yet.</div>'}
      ${ms ? '' : `<div style="font-size:12.5px;color:var(--warn)">Add the programme's start and end dates to see all its months.</div>`}</div>`;
  };
  const lg = Object.values(PV).filter(v => v[0] !== 'Archived').map(([l, c]) => `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:${c}"></span>${l}</span>`).join('') + '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;border:1px dashed var(--border2)"></span>Upcoming</span>';
  const names = Object.keys(groups).sort();
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;padding:12px 20px;font-size:12.5px;color:var(--muted)">${lg}</div>
    ${names.map(c => `<details open style="border-top:1px solid var(--line)"><summary style="padding:12px 20px;cursor:pointer;font-weight:600;display:flex;justify-content:space-between;gap:8px"><span>${esc(c)}</span><span style="font-weight:400;color:var(--muted);font-size:12.5px">${groups[c].length} programme${groups[c].length === 1 ? '' : 's'}</span></summary>${groups[c].sort((a, b) => (a.programme_name || '').localeCompare(b.programme_name || '')).map(row).join('')}</details>`).join('') || '<div class="empty"><b>No programmes with reports yet</b></div>'}
    <p class="note" style="margin:12px 20px">Each block is one month of the programme, from its start to its end date. The outlined block is the current reporting month. Click a month to open its report in the Report Generator.</p>`;
}
window.rpTV = v => { TRV = v; render(); };
window.rpTM = m => { TRM = m; TRS = ''; render(); };
window.rpTS = k => { TRS = TRS === k ? '' : k; render(); };
window.rpTP = v => { TRPM = v; render(); };
window.rpTR = async () => { TR = null; render(); await loadDr(); await loadTR(); render(); };
window.rpRemind = async (id, btn) => { btn.disabled = true; const r = await R.rpc('remind_pm', { p_report_id: id }); if (r.error) { btn.disabled = false; return say('Not sent: ' + r.error.message); } say('Reminder sent to the PM'); await rpTR(); };
window.rpSummary = () => { if (!TR || TR.err) return null; const rows = TR.byM[TR.cur] || []; return { month: TR.cur, n: rows.length, sent: rows.filter(x => x.stage === 'sent' || (x.stage === 'approved' && x.t[1] === 'Approved')).length, od: rows.filter(x => x.t[0] === 'dan').length }; };
window.rpLoadTR = async () => { if (TR === null) { await loadDr(); await loadTR(); } return window.rpSummary(); };
window.rpQF = f => { QF = f; render(); };
window.rpReload = async () => { Q = null; render(); await loadQ(); render(); };
window.rpAct = async (id, to, btn) => {
  const el = $('rpn-' + id), n = el ? el.value.trim() : '';
  if (to === 'needs_changes' && !n) { say('Add a note for the PM before requesting changes'); if (el) el.focus(); return; }
  btn.disabled = true;
  const r = await R.rpc('transition_report', { p_report_id: id, p_to_status: to, p_note: n || null });
  if (r.error) { btn.disabled = false; return say('Not saved: ' + r.error.message); }
  say('Report ' + (ST[to] || [to])[0].toLowerCase()); Q = null; await loadQ(); await rpTR();
};
window.rpHist = async id => {
  const tr = $('rph-' + id); if (!tr) return; tr.hidden = !tr.hidden; if (tr.hidden) return;
  const c = tr.firstElementChild; c.textContent = 'Loading history…';
  const r = await R.from('report_events').select('from_status,to_status,actor_email,note,created_at').eq('report_id', id).order('created_at');
  if (r.error) { c.textContent = r.error.message; return; }
  c.innerHTML = r.data.length ? `<ol style="margin:6px 0 6px 18px">${r.data.map(e => `<li><b>${esc((ST[e.to_status] || [e.to_status])[0])}</b>${e.from_status ? ` <span class="famas">from ${esc((ST[e.from_status] || [e.from_status])[0])}</span>` : ''} · ${esc(e.actor_email || 'system')} · ${esc(when(e.created_at))}${e.note ? `<div style="white-space:pre-wrap">${esc(note(e.note))}</div>` : ''}</li>`).join('')}</ol>` : '<span class="famas">No history recorded.</span>';
};

/* ---------- downloads ---------- */
const F = { client: '', prog: '' };
const real = r => !(r.fields && (r.fields.is_test_data === true || r.fields.is_test_data === 'true'));
const progOf = id => (D().progsAll || D().progs || []).find(p => p.id === id);
const SETS = [
  ['Programmes', () => D().progs, p => p.id],
  ['Learners', () => { const ids = new Set(enrolF().map(e => e.learner_id)); return (D().learners || []).filter(l => !F.client && !F.prog || ids.has(l.id)); }, null],
  ['Enrolments', () => enrolF(), null],
  ['QCTO tracker', () => D().tracker, r => r.programme_id],
  ['Monitoring visits', () => D().visits, r => r.programme_id ?? +(((r.fields || {}).Programme || [])[0])],
  ['Recommendations', () => D().recs, null],
  ['Attendance', () => D().att, r => r.programme_id],
  ['EISA results', () => D().eisaRes, r => r.programme_id],
  ['Clients', () => D().clients, null]
];
function enrolF() { return (D().enrol || []).filter(e => okProg(e.programme_id)); }
function okProg(pid) { if (F.prog) return String(pid) === F.prog; if (F.client) { const p = progOf(pid); return p && String(p.client_id) === F.client; } return true; }
function rowsOf(s) { const [, get, pid] = s; let rows = (get() || []).filter(real); if (pid && (F.client || F.prog)) rows = rows.filter(r => okProg(pid(r))); if (s[0] === 'Clients' && F.client) rows = rows.filter(c => String(c.id) === F.client); return rows; }
function flat(rows) {
  const out = rows.map(r => { const o = {}; Object.entries(r).forEach(([k, v]) => { if (k === 'fields' || k === 'tenant_id') return; o[k] = v && typeof v === 'object' ? JSON.stringify(v) : v; });
    Object.entries(r.fields || {}).forEach(([k, v]) => { if (k === 'is_test_data' || k in o) return; o[k] = v && typeof v === 'object' ? JSON.stringify(v) : v; }); return o; });
  const cols = [...new Set(out.flatMap(o => Object.keys(o)))];
  return [cols, ...out.map(o => cols.map(c => o[c] ?? ''))];
}
const stamp = () => new Date().toISOString().slice(0, 10);
const tag = () => F.prog ? '_prog' + F.prog : F.client ? '_client' + F.client : '';
window.rpCsv = i => { const s = SETS[i], a = flat(rowsOf(s));
  const txt = a.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n');
  const b = new Blob(['﻿' + txt], { type: 'text/csv' }), u = URL.createObjectURL(b), l = document.createElement('a');
  l.href = u; l.download = `${s[0].replace(/ /g, '_')}${tag()}_${stamp()}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); say(`Exported ${a.length - 1} rows`); };
window.rpXlsx = i => { if (!window.XLSX) return say('Excel library not loaded'); const wb = XLSX.utils.book_new();
  (i == null ? SETS : [SETS[i]]).forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(flat(rowsOf(s))), s[0].slice(0, 31)));
  XLSX.writeFile(wb, `${i == null ? 'ApexOne_all_data' : SETS[i][0].replace(/ /g, '_')}${tag()}_${stamp()}.xlsx`); say('Excel file downloaded'); };
window.rpF = (k, v) => { F[k] = v; if (k === 'client') F.prog = ''; render(); };

function render() {
  const v = $('view-reports'); if (!v || v.hidden) return;
  const clients = (D().clients || []).map(c => [String(c.id), c.client_name || (c.fields || {})['Company Name'] || 'Client ' + c.id]).sort((a, b) => a[1].localeCompare(b[1]));
  const progs = (D().progs || []).filter(p => !F.client || String(p.client_id) === F.client).map(p => [String(p.id), (p.display_id ? p.display_id + ' · ' : '') + (p.programme_name || '')]);
  const opt = (list, cur, all) => `<option value="">${all}</option>` + list.map(([k, l]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const reviewer = true;   // the database returns only the reports this user may see
  v.innerHTML = `<div style="display:flex;flex-direction:column;gap:20px">
    <section class="card" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center"><div style="flex:1 1 300px"><h2 style="font-size:18px">Report Generator</h2><span class="sub">Write, print and submit monthly client reports. Same screen and steps as before.</span></div><a class="btn y" href="/report-generator.html" target="_blank" rel="noopener">Open Report Generator ↗</a></section>
    ${tracker()}
    ${drafts()}
    <section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px 20px;border-bottom:1px solid var(--line2)">
      <h2 style="flex-grow:1;font-size:18px;align-self:center">Downloads</h2>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">Client<select class="cellin" style="height:36px;max-width:260px" onchange="rpF('client',this.value)">${opt(clients, F.client, 'All clients')}</select></label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">Programme<select class="cellin" style="height:36px;max-width:300px" onchange="rpF('prog',this.value)">${opt(progs, F.prog, 'All programmes')}</select></label>
      ${has() ? '<button class="btn y" onclick="rpXlsx()">Everything (.xlsx)</button>' : ''}</div>
      <div class="tw"><table class="dense"><thead><tr><th>Data set</th><th>Rows</th><th></th></tr></thead><tbody>
      ${SETS.map((s, i) => `<tr><td><b>${esc(s[0])}</b></td><td>${rowsOf(s).length}</td><td style="white-space:nowrap;text-align:right"><button class="btn sm" onclick="rpCsv(${i})">CSV</button> <button class="btn sm" onclick="rpXlsx(${i})">Excel</button></td></tr>`).join('')}
      </tbody></table></div><p class="note" style="margin:12px 20px">Test records are left out. Each file holds the database columns plus the captured fields, as on screen.</p></section>
  </div>`;
}
ROUTES.reports = ['Reports', 'Outputs'];
async function onRoute() { if (location.hash.slice(1).split('/')[0] !== 'reports' || !P.user) return; render(); if (Q === null) { await Promise.all([loadQ(), loadDr().then(loadTR)]); render(); } }
/* Dashboard and My work: a one-line card for the current reporting month */
async function homeCard() {
  const r = location.hash.slice(1).split('/')[0] || 'mywork'; if (!['dashboard', 'mywork'].includes(r) || !P.user) return;
  const sm = await window.rpLoadTR(); const v = $('view-' + r); if (!sm || !v) return;
  const html = `<section class="card" id="rpdash-${r}" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px"><div style="flex:1 1 260px"><b>${esc(sm.month)} reports</b>
    <div style="font-size:12.5px;color:var(--muted)">${sm.sent} of ${sm.n} sent to clients${sm.od ? ` · <span style="color:var(--bad);font-weight:600">${sm.od} overdue</span>` : ''}</div></div>
    <span style="flex:1 1 160px;height:10px;border-radius:6px;background:var(--line2);overflow:hidden;display:flex"><span style="width:${sm.n ? Math.round(100 * sm.sent / sm.n) : 0}%;background:#25247B"></span></span>
    <a class="btn sm y" href="#reports">Open monthly reports</a></section>`;
  const old = $('rpdash-' + r); if (old) old.outerHTML = html; else v.insertAdjacentHTML('afterbegin', html);
}
addEventListener('hashchange', () => setTimeout(homeCard, 300));
setTimeout(function hc() { if (P.user && D().progs) homeCard(); else setTimeout(hc, 500); }, 800);
addEventListener('hashchange', () => setTimeout(onRoute, 0));
const w = setInterval(() => { if (P.user && D().progs) { clearInterval(w); onRoute(); } }, 400);
})();
