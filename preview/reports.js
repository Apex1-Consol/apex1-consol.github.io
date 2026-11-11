/* Reports in the new look (live data). Replaces the old app's "Reports" screen:
   1. Monthly report reviews: reports.my_report_queue / reports.transition_report (the database decides who may do what).
   2. Downloads: CSV or Excel of each data set, filtered by client and programme, plus one workbook with everything. */
(() => {
const sb = window.__sb, P = window.__preview, D = () => P.data;
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const say = m => window.toast(m);
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
    return `<tr><td><b>${esc(r.client_name || 'Report ' + r.id)}</b><div class="famas">${esc(r.programme_name || '')}${r.submitted_by_email ? ' · ' + esc(r.submitted_by_email) : ''}</div><a href="#" class="famas" onclick="rpHist(${+r.id});return false">History</a></td>
      <td>${esc(r.month || '')}</td><td><span class="badge ${st[1]}">${esc(st[0])}</span><div class="famas">${esc(r.reviewed_by ? 'Reviewed by ' + r.reviewed_by + ' · ' + when(r.reviewed_at) : r.printed_at ? 'Submitted ' + when(r.printed_at) : '')}</div></td>
      <td style="max-width:320px;white-space:pre-wrap">${esc(note(r.reviewer_note)) || '—'}</td>
      <td>${acts.length ? `${acts.includes('needs_changes') ? `<textarea id="rpn-${r.id}" class="cellin" rows="2" placeholder="Note for the PM (needed to request changes)" style="width:100%;min-width:200px;margin-bottom:6px"></textarea>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap">${acts.map(a => `<button class="btn sm ${a === 'needs_changes' ? '' : 'y'}" onclick="rpAct(${+r.id},'${esc(a)}',this)">${esc(ACT[a] || a)}</button>`).join('')}</div>` : '<span class="famas">No action for you</span>'}</td></tr>
      <tr id="rph-${r.id}" hidden><td colspan="5"></td></tr>`; }).join('')}</tbody></table></div>`;
}
window.rpQF = f => { QF = f; render(); };
window.rpReload = async () => { Q = null; render(); await loadQ(); render(); };
window.rpAct = async (id, to, btn) => {
  const el = $('rpn-' + id), n = el ? el.value.trim() : '';
  if (to === 'needs_changes' && !n) { say('Add a note for the PM before requesting changes'); if (el) el.focus(); return; }
  btn.disabled = true;
  const r = await R.rpc('transition_report', { p_report_id: id, p_to_status: to, p_note: n || null });
  if (r.error) { btn.disabled = false; return say('Not saved: ' + r.error.message); }
  say('Report ' + (ST[to] || [to])[0].toLowerCase()); await rpReload();
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
    ${reviewer ? `<section class="card" style="padding:0"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line2)">
      <h2 style="flex-grow:1;font-size:18px">Monthly report reviews</h2>
      <button class="btn sm ${QF === 'open' ? 'y' : ''}" onclick="rpQF('open')">Needs action</button><button class="btn sm ${QF === 'all' ? 'y' : ''}" onclick="rpQF('all')">All</button><button class="btn sm" onclick="rpReload()">Refresh</button></div>
      ${queue()}</section>` : ''}
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
async function onRoute() { if (location.hash.slice(1).split('/')[0] !== 'reports' || !P.user) return; render(); if (Q === null) { await loadQ(); render(); } }
addEventListener('hashchange', () => setTimeout(onRoute, 0));
const w = setInterval(() => { if (P.user && D().progs) { clearInterval(w); onRoute(); } }, 400);
})();
