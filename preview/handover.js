/* Sign-off / hand-over in the new look. Ported from the old app's HO module (ApexOne index.html).
   The database decides everything (handoff_* RPCs); this file only renders handoff_get and calls the RPCs. */
(() => {
const sb = window.__sb, P = window.__preview;
const SUPA_URL = sb.supabaseUrl;
async function supaHeaders() { const { data } = await sb.auth.getSession(); return { apikey: sb.supabaseKey, Authorization: 'Bearer ' + ((data.session && data.session.access_token) || sb.supabaseKey), 'Content-Type': 'application/json' }; }
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const showToast = (t, m) => { m = m === undefined ? t : m; window.toast(m); const e = document.getElementById('toast'); if (e) e.textContent = m; };
const state = { get programmes() { return (P.data.progsAll || P.data.progs || []).map(p => ({ id: p.id, fields: Object.assign({ Qualification: p.programme_name, 'Prog ID': p.display_id, __stage: p.status }, p.fields || {}, { __stage: p.status }) })); },
  get currentUserEmail() { return P.user && P.user.email; }, get currentUser() { return P.user && P.user.email; } };
const loadProgrammes = () => window.previewReload && window.previewReload();
const notifyAdmins = async (type, message) => { try { await sb.schema('reports').from('notifications').insert({ tenant_id: P.tenant, recipient_role: 'admin', type, message }); } catch (e) { console.warn('notifyAdmins failed (non-blocking)', e); } };   // same as the old app
const programmeStageBadge = st => `<span class="pill">${escapeHtml({ initiated: 'Initiated', handed_over: 'Handed over', active: 'Active', closed: 'Closed' }[st] || st)}</span>`;
const programmeStageActions = () => '';
const openEditProgramme = id => { location.hash = 'programmes'; setTimeout(() => window.dvProgEdit && window.dvProgEdit(+id), 300); };
// ===================== PROGRAMME DETAIL · SIGN-OFF / HANDOVER =====================
// The database is the authority for the PI -> PM sign-off: who is assigned to
// each step, which gates apply and whether they are blocked, signatures,
// locking, the hand-over itself and the ClickUp outbox event (handoff_* RPCs,
// migration 20261014120000). This module only renders handoff_get() and calls
// those RPCs with the signed-in user's Supabase session. Nothing here decides
// whether something is allowed; a refused call comes back with the reason.
window.HO = (() => {
  const s = { pid: null, tab: 'overview', g: null, busy: false, cat: null, assignable: {}, err: null, open: new Set() };

  const STEP = {
    pi:         { n: 'Step 1', t: 'Programme Initiator', verb: 'Pack prepared',       attest: 'I prepared this handover pack and the evidence is filed as described.' },
    compliance: { n: 'Step 2', t: 'Compliance Officer',  verb: 'Compliance verified', attest: 'I checked each applicable gate against its evidence and the statutory deadlines.' },
    ops:        { n: 'Step 3', t: 'Head of Operations & HR', verb: 'Handover approved', attest: 'I approve the hand-over to the Project Manager and accept the open risks shown.' }
  };
  // How the pack inputs are shown. Which ones are required, and their formats, come from handoff_fields.
  const INPUT = {
    'details.qual_type':        { opts: ['Learnership', 'Qualification', 'Skills programme'] },
    'details.learnership_type': { opts: ['Employed (18.1)', 'Unemployed (18.2)'] },
    'details.funded':           { opts: ['SETA-funded', 'Employer-funded', 'Unfunded'] },
    'details.learners':         { type: 'number' }, 'details.disability_count': { type: 'number' }, 'details.sites_count': { type: 'number' },
    'details.pm_email':         { type: 'email' },
    // pack.*: fields carried over from the old PI-PM artifact. Lists are one item per line, parts split by |
    'pack.sites':   { type: 'lines', keys: ['name', 'address', 'learners'], hint: 'One site per line: name | address | learners' },
    'pack.modules': { type: 'lines', keys: ['module', 'kind', 'start', 'end'], hint: 'One module per line: module | knowledge, practical or workplace | start | end' },
    'pack.notes':   { type: 'area', hint: 'Notes on the checklist' },
    'pack.clickup_url': { type: 'url' }, 'pack.evidence_folder': { type: 'url' },
    // printed on the hand-over record PDF (migration 20261015090623)
    'pack.mou_status':  { opts: ['Draft', 'Signed', 'Expired', 'Not required'] },
    'pack.handover_notes': { type: 'area', hint: 'Anything the Project Manager should know; printed on the hand-over record' }
  };
  const packLines = (v, keys) => Array.isArray(v) ? v.map(o => keys.map(k => (o || {})[k] ?? '').join(' | ').replace(/( \| )+$/, '')).join('\n') : (v || '');
  const DATES = [['signed', 'Learner agreements signed'], ['start', 'Training start'], ['eisa', 'EISA date']];
  const CHECKS = [['agreements', 'Learner agreements received'], ['schedule', 'Implementation schedule approved'], ['ids', 'Certified ID copies received'],
                  ['quals', 'Certified qualification copies received'], ['disability_letters', 'Proof of disability received (where claimed)']];
  const FACTS = {
    c2: [['agreementSeta', 'SETA registering the agreements']],
    l1: [['signedCount', 'Agreements fully signed by learner, employer and provider', 'number']],
    l2: [['unemployedCount', 'Unemployed learners (18.2)', 'number'], ['contracts', 'Fixed-term employment contracts signed', 'number']],
    l8: [['minorsCount', 'Learners under 18 (0 if none)', 'number'], ['guardianSigned', 'Guardian signatures on file', 'number']],
    q1: [['qualStatus', 'Status on the SAQA register', ['Registered', 'Registration ended, enrolment extended', 'Deregistered']]],
    q2: [['accrBody', 'Accrediting body'], ['accrRef', 'Accreditation number'], ['accrExpiry', 'Accreditation valid until', 'date']],
    q3: [['onList', 'SAQA ID on the GG 54858 extension list', ['Yes', 'No']], ['lastEnrol', 'Last enrolment date for this SAQA ID', 'date']],
    q4: [['lshipCode', 'Learnership registration number'], ['lshipEnd', 'Learnership registration end date', 'date']],
    q5: [['eisaClose', 'EISA registration closes', 'date']],
    s1: [['plannedS1', 'Planned date the SETA receives the agreements', 'date']],
    s2: [['plannedS2', 'Planned stage 1 submission', 'date']],
    s3: [['plannedS3', 'Planned stage 2 submission', 'date']],
    s5: [['plannedS5', 'Planned enrolment submission', 'date'], ['fisaDate', 'FISA date', 'date']]
  };
  const STATE_LABEL = { blocked: ['Blocked', 'red'], evidence: ['Needs evidence', 'amber'], ready: ['Ready to verify', 'blue'],
                        verified: ['Verified', 'green'], na_confirmed: ['N/A confirmed', 'green'], na: ['Not applicable', 'grey'] };
  const esc = escapeHtml;
  const day = d => d ? new Date(String(d).length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const when = d => d ? new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const prog = () => (state.programmes || []).find(p => String(p.id) === String(s.pid));

  async function rpc(fn, body) {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: await supaHeaders(), body: JSON.stringify(body || {}) });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = (data && (data.message || data.hint)) || `Request failed (${res.status})`;
      const e = new Error(msg); e.code = data && data.code; e.status = res.status; throw e;
    }
    return data;
  }
  async function catalogue() {
    if (s.cat) return s.cat;
    const get = async t => { const r = await fetch(`${SUPA_URL}/rest/v1/${t}?select=*`, { headers: await supaHeaders() }); return r.ok ? r.json() : []; };
    const [fields, sources] = await Promise.all([get('handoff_fields'), get('handoff_sources')]);
    s.cat = { fields, sources: Object.fromEntries(sources.map(x => [x.id, x])) };
    return s.cat;
  }

  // ---------- open / load ----------
  async function open(pid, tab) {
    s.pid = String(pid); s.tab = tab || 'overview'; s.g = null; s.err = null; s.assignable = {}; s.open = new Set();
    if (location.hash !== '#handover/' + s.pid) history.replaceState(null, '', '#handover/' + s.pid); route();
    render();
    await load();
  }
  async function load() {
    const pid = s.pid;
    try {
      const [g] = await Promise.all([rpc('handoff_get', { p_programme_id: Number(pid) }), catalogue()]);
      if (pid !== s.pid) return;
      s.g = g; s.err = null;
      if (g && g.me && g.me.can_assign) loadAssignable();
    } catch (e) {
      if (pid !== s.pid) return;
      s.err = e.code === '42501' ? 'You can\'t open the sign-off for this programme.' : e.message;
    }
    render();
  }
  async function loadAssignable() {
    for (const step of ['pi', 'compliance', 'ops']) {
      if (s.assignable[step]) continue;
      try { s.assignable[step] = await rpc('handoff_assignable', { p_step: step }); } catch { s.assignable[step] = []; }
    }
    render();
  }
  // Every write goes through one place: call, show the database's answer, re-render.
  async function act(fn, body, okMsg) {
    if (s.busy) return null;
    s.busy = true; render();
    try {
      const g = await rpc(fn, { p_programme_id: Number(s.pid), ...body });
      s.g = g;
      if (g && g.error) showToast('error', g.error.message);
      else if (okMsg) showToast('success', okMsg);
      return g;
    } catch (e) {
      showToast('error', e.message);
      if (e.code === '40001') await load();
      return null;
    } finally { s.busy = false; render(); }
  }

  // ---------- render ----------
  function render() {
    const el = document.getElementById('programme-detail-root');
    if (!el) return;
    const p = prog(), f = (p && p.fields) || {};
    const g = s.g;
    const title = f['Qualification'] || (g && g.doc && g.doc.prog && g.doc.prog.qualification) || ('Programme ' + s.pid);
    const sub = [f['Prog ID'], f['Client'] || (g && g.doc && g.doc.prog && g.doc.prog.client), g && g.record_no].filter(Boolean).map(esc).join(' · ');
    const tabBadge = g ? (g.stage === 'complete' ? ' ✓' : ` (${g.approved}/3)`) : '';
    el.innerHTML = `
      <div class="pd-head">
        <button class="btn btn-sm" onclick="location.hash='programmes'">&larr; Programmes</button>
        <div class="pd-title"><h2>${esc(title)}</h2><div class="pd-sub">${sub}</div></div>
        ${programmeStageBadge((p && p.fields && p.fields['__stage']) || (g && g.stage === 'complete' ? 'handed_over' : 'initiated'))}
      </div>
      <div class="pd-tabs" role="tablist">
        <button class="pd-tab ${s.tab === 'overview' ? 'active' : ''}" role="tab" aria-selected="${s.tab === 'overview'}" onclick="HO.setTab('overview')">Overview</button>
        <button class="pd-tab ${s.tab === 'signoff' ? 'active' : ''}" role="tab" aria-selected="${s.tab === 'signoff'}" onclick="HO.setTab('signoff')">Sign-off / Handover${tabBadge}</button>
      </div>
      <div class="pd-body">${s.tab === 'overview' ? overview(p, f, g) : signoff(g)}</div>`;
  }

  function overview(p, f, g) {
    const kv = (k, v) => `<div class="pd-kv"><div class="k">${esc(k)}</div><div class="v">${v ? esc(v) : '<span class="ho-muted">—</span>'}</div></div>`;
    const fieldsHtml = ['Prog ID', 'Entity', 'Client', 'Type', 'Qualification', 'SAQA ID', 'NQF', 'SETA', 'Learners', 'Employment Status', 'Project Manager',
      'Facilitator', 'Assessor', 'Start Date', 'End Date', 'EISA Start', 'EISA End', 'Status'].map(k => kv(k, f[k])).join('');
    const so = !g ? `<div class="ho-muted">${s.err ? esc(s.err) : 'Loading the sign-off…'}</div>` : `
      <div class="ho-ready ${esc(g.tone)}" style="border-left-width:4px;border-left-style:solid;padding-left:12px;">
        <div class="hl">${esc(g.headline)}<div class="next">${esc(nextLine(g))}</div></div>
        <button class="btn y btn-sm" onclick="HO.setTab('signoff')">Open sign-off</button>
      </div>`;
    const actions = p ? programmeStageActions(p.fields || {}, p.id) : '';
    return `
      <div class="ho-card"><h3>Sign-off / Handover</h3>${so}</div>
      <div class="ho-card"><h3>Programme</h3><div class="pd-grid">${fieldsHtml}</div>
        ${actions ? `<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">${actions}</div>` : ''}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">${p ? `<button class="btn btn-sm" onclick="openEditProgramme('${p.id}')">Edit programme</button>` : ''}</div>
      </div>`;
  }

  function nextLine(g) {
    const a = g.assignees || {};
    const nm = st => (a[st] && a[st].name) || 'unassigned';
    if (g.stage === 'complete') return `Handed over ${day(g.record && g.record.handed_over_at)} to ${(g.record && g.record.details && g.record.details.pm_name) || 'the Project Manager'}.`;
    if (g.stage === 'pi') return g.blockers.length ? `${nm('pi')} (Programme Initiator) resolves the items below, then signs.` : `${nm('pi')} can sign: Pack prepared.`;
    if (g.stage === 'compliance') return g.blockers.length ? 'The pack has changed or a compliance risk is open: see below.' : `${nm('compliance')} verifies ${g.review.length} gate(s), then signs.`;
    return g.review.length ? `${nm('ops')} acknowledges ${g.review.length} open risk(s), then approves.` : `${nm('ops')} can approve the hand-over.`;
  }

  function signoff(g) {
    if (s.err) return `<div class="ho-banner err">${esc(s.err)}</div>`;
    if (!g) return '<div class="ho-muted">Loading the sign-off…</div>';
    const me = g.me || {};
    const err = g.error ? `<div class="ho-banner err" role="alert"><b>Not done:</b> ${esc(g.error.message)}</div>` : '';
    const lock = g.locked ? `<div class="ho-banner"><span>&#128274; Signed records are locked. ${g.stage === 'complete' ? 'Only the Head of Operations can reopen it.' : 'Any assigned signer can unlock it; every signature is then cleared and kept in the history.'}</span>
        ${me.can_unlock ? `<button class="btn btn-sm" onclick="HO.unlock()" ${s.busy ? 'disabled' : ''}>Unlock to edit</button>` : ''}</div>` : '';
    return `${err}${readiness(g)}${lock}
      <div class="ho-steps" id="ho-t-ho-approvals">${['pi', 'compliance', 'ops'].map(st => stepCard(g, st)).join('')}</div>
      ${work(g)}
      ${deadlines(g)}
      ${packForm(g)}
      <h3 style="font-size:14px;margin:18px 0 8px;">Evidence review</h3>
      ${gatesHtml(g)}
      <div class="ho-two" style="margin-top:14px;">${risksHtml(g)}${trail(g)}</div>`;
  }

  function readiness(g) {
    return `<div class="ho-card ho-ready ${esc(g.tone)}">
      <div class="hl">${esc(g.headline)}<div class="next">${esc(nextLine(g))}</div></div>
      <div class="ho-stats">
        <div class="ho-stat"><b>${g.applicable}</b><span>gates apply</span></div>
        <div class="ho-stat"><b>${g.with_evidence}</b><span>with evidence</span></div>
        <div class="ho-stat"><b>${g.verified}</b><span>verified</span></div>
        <div class="ho-stat"><b>${g.approved}/3</b><span>signed</span></div>
      </div></div>`;
  }

  function stepCard(g, st) {
    const meta = STEP[st], me = g.me || {}, a = (g.assignees || {})[st], sig = (g.signatures || {})[st];
    const can = (me.can_sign || {})[st] || {}, mine = (me.steps || []).includes(st), cur = g.stage === st;
    const opts = s.assignable[st];
    const assign = me.can_assign && opts
      ? `<select aria-label="${esc(meta.t)}" onchange="HO.assign('${st}', this.value)" ${s.busy ? 'disabled' : ''}>
           ${a ? '' : '<option value="">Choose…</option>'}
           ${opts.map(u => `<option value="${esc(u.id)}" ${a && a.id === u.id ? 'selected' : ''}>${esc(u.name)} · ${esc(u.email)}</option>`).join('')}
           ${a && !opts.some(u => u.id === a.id) ? `<option value="${esc(a.id)}" selected>${esc(a.name)} (no longer has the role)</option>` : ''}
         </select>`
      : `<div class="who">${a ? `${esc(a.name)} · ${esc(a.email)}` : '<span style="color:var(--accent-rose);">Not assigned</span>'}</div>`;
    let body;
    if (sig) {
      body = `<div class="sig ${sig.state === 'valid' ? '' : 'bad'}">${sig.state === 'valid' ? '&#10003; ' + esc(meta.verb) : '&#9888; No longer valid'} · ${esc(sig.name)}<br>
        <span class="ho-muted">${when(sig.at)} · record ${esc(String(sig.hash || '').slice(0, 8))}${sig.why ? ' · ' + esc(sig.why) : ''}</span></div>`;
    } else if (mine && cur) {
      body = `<label class="ho-attest"><input type="checkbox" id="ho-att-${st}" ${can.ok ? '' : 'disabled'}> ${esc(meta.attest)}</label>
        <input type="text" id="ho-name-${st}" placeholder="Type your name to sign" autocomplete="off" ${can.ok ? '' : 'disabled'}>
        <button class="btn y btn-sm" onclick="HO.sign('${st}')" ${can.ok && !s.busy ? '' : 'disabled'}>Sign: ${esc(meta.verb)}</button>
        ${can.ok ? '' : `<div class="why">${esc(can.reason || '')}</div>`}`;
    } else {
      body = `<div class="why">${esc(can.reason || (cur ? 'Waiting for the assigned signer' : ''))}</div>`;
    }
    return `<div class="ho-step ${cur ? 'current' : ''}"><div class="n">${meta.n}${mine ? ' · you' : ''}</div><div class="t">${esc(meta.t)}</div>${assign}${body}</div>`;
  }

  function work(g) {
    const item = (b, dot) => `<button class="ho-item" onclick="HO.go('${esc(b.target || '')}')">
        <span class="ho-dot ${dot}"></span><span><div class="t">${esc(b.title)}</div><div class="w">${esc(b.why || '')}</div></span>
        <span class="meta">${esc(b.owner || '')}${b.deadline ? '<br>due ' + day(b.deadline) : ''}</span></button>`;
    let out = '';
    if (g.blockers.length) {
      const all = s.open.has('blockers'), shown = all ? g.blockers : g.blockers.slice(0, 8);
      out += `<div class="ho-card"><h3>What stands in the way (${g.blockers.length})</h3><div class="ho-list">${shown.map(b => item(b, '')).join('')}</div>
        ${g.blockers.length > 8 ? `<button class="btn btn-sm" style="margin-top:8px;" onclick="HO.remember('blockers', ${!all});HO.render()">${all ? 'Show fewer' : 'Show all ' + g.blockers.length}</button>` : ''}</div>`;
    }
    if (g.review.length) out += `<div class="ho-card"><h3>${g.stage === 'ops' ? 'Open risks to acknowledge' : 'To verify'} (${g.review.length})</h3><div class="ho-list">${g.review.map(b => item(b, 'amber')).join('')}</div></div>`;
    return out;
  }

  function deadlines(g) {
    if (!g.deadlines || !g.deadlines.length) return '';
    const today = new Date().toISOString().slice(0, 10);
    return `<div class="ho-card"><h3>Statutory deadlines</h3><div class="ho-dl">${g.deadlines.map(d => `<div>
      <b>${esc(d.label)}${d.gate ? ' · ' + esc(d.gate.toUpperCase()) : ''}</b>${esc(d.rule)}<br>
      ${d.due ? `<span style="color:${d.due < today ? 'var(--accent-rose)' : 'inherit'};font-weight:600;">Due ${day(d.due)}</span>` : `<span class="ho-muted">${esc(d.need)}</span>`}</div>`).join('')}</div></div>`;
  }

  function packForm(g) {
    const r = g.record || {}, me = g.me || {}, ed = me.can_edit && !s.busy, cat = (s.cat && s.cat.fields) || [];
    const doc = g.doc || {};
    const val = path => { const [a, b] = path.split('.'); return a === 'prog' ? (doc.prog || {})[b] : (r[a] || {})[b]; };
    const missing = new Set(((g.blockers.find(b => b.id === 'required') || {}).why || '').split(', '));
    const fld = x => {
      const v = val(x.path) ?? '', inp = INPUT[x.path] || {}, req = x.pattern && x.pattern[0] === '!', ro = x.path.startsWith('prog.') || !ed;
      const bad = missing.has(x.label) || g.blockers.some(b => b.id === 'format-' + x.path);
      const ctl = (inp.type === 'lines' || inp.type === 'area')
        ? `<textarea data-ho="${esc(x.path)}" rows="3" ${ro ? 'disabled' : ''} placeholder="${esc(inp.hint || '')}" style="width:100%;">${esc(inp.keys ? packLines(v, inp.keys) : v)}</textarea>`
        : inp.opts
        ? `<select data-ho="${esc(x.path)}" ${ro ? 'disabled' : ''}><option value=""></option>${inp.opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input data-ho="${esc(x.path)}" type="${inp.type || 'text'}" value="${esc(v)}" ${ro ? 'disabled' : ''} placeholder="${esc(x.hint || '')}">`;
      return `<div class="${bad ? 'bad' : ''}" id="ho-t-hf-${esc(x.path)}"><label>${esc(x.label)}${req ? ' *' : ''}${x.path.startsWith('prog.') ? ' · edit on the programme' : ''}</label>${ctl}</div>`;
    };
    const open = s.open.has('pack') || g.blockers.some(b => b.category === 'Handover details');
    return `<details class="ho-group" id="ho-t-hf-details" ${open ? 'open' : ''} ontoggle="HO.remember('pack', this.open)">
      <summary>Handover details <span class="c">${missing.size && missing.has('') ? '' : ''}${g.blockers.filter(b => b.category === 'Handover details').length ? 'needs attention' : 'complete'}</span></summary>
      <div class="ho-gate ho-form" id="ho-pack">
        <div class="row">${cat.map(fld).join('')}</div>
        <div class="row">${DATES.map(([k, l]) => `<div><label>${esc(l)}</label><input data-ho="dates.${k}" type="date" value="${esc((r.dates || {})[k] || '')}" ${ed ? '' : 'disabled'}></div>`).join('')}</div>
        <div class="ho-checks">${CHECKS.map(([k, l]) => `<label><input type="checkbox" data-ho="checklist.${k}" ${(r.checklist || {})[k] ? 'checked' : ''} ${ed ? '' : 'disabled'}> ${esc(l)}</label>`).join('')}</div>
        ${me.can_edit ? `<div class="acts"><button class="btn y btn-sm" onclick="HO.savePack()" ${s.busy ? 'disabled' : ''}>Save details</button>
          <span class="ho-muted">Saving re-checks every gate. Changes to information a verified gate relies on clear that verification.</span></div>`
          : `<div class="ho-muted">${g.locked ? 'Locked while it is being signed.' : 'Only the assigned Programme Initiator can edit the pack.'}</div>`}
      </div></details>`;
  }

  function gatesHtml(g) {
    const groups = [];
    g.gates.forEach(x => { let gr = groups.find(y => y.id === x.grp); if (!gr) groups.push(gr = { id: x.grp, title: x.grp_title, gates: [] }); gr.gates.push(x); });
    return groups.map(gr => {
      const ap = gr.gates.filter(x => x.applicable), bad = ap.filter(x => x.state === 'blocked').length, ev = ap.filter(x => x.state === 'evidence').length;
      const ok = ap.filter(x => x.state === 'verified' || x.state === 'na_confirmed').length;
      const open = s.open.has(gr.id);
      return `<details class="ho-group" id="ho-grp-${esc(gr.id)}" ${open ? 'open' : ''} ontoggle="HO.remember('${esc(gr.id)}', this.open)">
        <summary><span class="ho-dot ${bad ? '' : ev ? 'amber' : ok === ap.length ? 'green' : 'grey'}"></span>${esc(gr.title)}
          <span class="c">${ap.length} apply · ${bad ? bad + ' blocked · ' : ''}${ev ? ev + ' need evidence · ' : ''}${ok} verified</span></summary>
        ${gr.gates.map(x => gateHtml(g, x)).join('')}</details>`;
    }).join('');
  }

  function gateHtml(g, x) {
    const me = g.me || {}, ed = me.can_edit && !s.busy, r = g.record || {}, [lbl, cls] = STATE_LABEL[x.state] || [x.state, 'grey'];
    const src = (x.sources || []).map(id => { const z = s.cat && s.cat.sources[id]; return z ? (z.url ? `<a href="${esc(z.url)}" target="_blank" rel="noopener">${esc(z.short)}</a>` : esc(z.short)) : esc(id); }).join(' · ');
    const head = `<div class="top"><span class="id">${esc(x.id.toUpperCase())}</span><span class="txt">${esc(x.text)}${x.optional ? ' <span class="ho-muted">(optional)</span>' : ''}</span>
      <span class="ph-pill ${cls}">${lbl}</span></div>`;
    if (!x.applicable) return `<div class="ho-gate" id="ho-t-gate-${esc(x.id)}">${head}<div class="ho-muted">${esc(x.na_why)} · worked out from the programme profile</div></div>`;
    const reasons = (x.reasons || []).length ? `<ul class="rs">${x.reasons.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
    const notes = (x.notes || []).length ? `<ul class="ns">${x.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
    const changed = x.changed ? `<div class="ns">Changed since it was verified: Compliance must check it again.</div>` : '';
    const decl = x.declared;
    const facts = (FACTS[x.id] || []).map(([k, l, t]) => {
      const v = (r.facts || {})[k] || '';
      const ctl = Array.isArray(t) ? `<select data-hf="${k}" ${ed ? '' : 'disabled'}><option value=""></option>${t.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input data-hf="${k}" type="${t || 'text'}" value="${esc(v)}" ${ed ? '' : 'disabled'}>`;
      return `<div><label>${esc(l)}</label>${ctl}</div>`;
    }).join('');
    const evi = x.evidence || {};
    const edit = decl ? `<div class="ho-muted">Declared not applicable: “${esc(decl.why)}” · ${esc(decl.by || '')}</div>`
      : `<div class="row">${facts}
          <div style="grid-column:span 2;min-width:0;"><label>Evidence (document name or link in the evidence folder)</label><input data-he="ref" value="${esc(evi.ref || '')}" ${ed ? '' : 'disabled'} placeholder="e.g. Drive › Client › Signed agreements.pdf"></div>
          ${x.deadline ? `<div><label>Date submitted (if already sent)</label><input data-he="date" type="date" value="${esc(evi.date || '')}" ${ed ? '' : 'disabled'}></div>` : ''}
        </div>`;
    const btns = [];
    if (me.can_edit) {
      btns.push(`<button class="btn btn-sm" onclick="HO.saveGate('${x.id}')" ${s.busy ? 'disabled' : ''}>Save ${esc(x.id.toUpperCase())}</button>`);
      if (x.optional && !decl) btns.push(`<button class="btn btn-sm" onclick="HO.declareNA('${x.id}')" ${s.busy ? 'disabled' : ''}>Doesn't apply…</button>`);
      if (decl) btns.push(`<button class="btn btn-sm" onclick="HO.undeclareNA('${x.id}')" ${s.busy ? 'disabled' : ''}>It applies after all</button>`);
    }
    if (me.can_verify && x.state === 'ready') btns.push(`<button class="btn y btn-sm" onclick="HO.verify('${x.id}', true)" ${s.busy ? 'disabled' : ''}>${decl ? 'Confirm N/A' : 'Verify against evidence'}</button>`);
    if (me.can_verify && (x.state === 'verified' || x.state === 'na_confirmed')) btns.push(`<button class="btn btn-sm" onclick="HO.verify('${x.id}', false)" ${s.busy ? 'disabled' : ''}>Withdraw</button>`);
    const ver = x.verification ? `<span class="ho-muted">${x.verification.state === 'na_confirmed' ? 'N/A confirmed' : 'Verified'} by ${esc((x.verification.by || {}).name || '')} · ${when(x.verification.at)}</span>` : '';
    const dl = x.deadline && x.deadline.due ? `<span class="ho-muted">Deadline ${day(x.deadline.due)} · ${esc(x.deadline.rule)}</span>` : '';
    return `<div class="ho-gate" id="ho-t-gate-${esc(x.id)}" data-gate="${esc(x.id)}">${head}${reasons}${notes}${changed}${edit}
      <div class="acts">${btns.join('')}${ver}${dl}${src ? `<span class="ho-src">Source: ${src}</span>` : ''}</div></div>`;
  }

  function risksHtml(g) {
    const me = g.me || {}, mine = (me.steps || []).length > 0, canAdd = mine && !g.locked;
    const list = (g.risks || []).map(r => `<div class="ho-risk" id="ho-t-risk-${r.id}">
        <span class="ph-pill ${r.severity === 'high' ? 'red' : r.severity === 'medium' ? 'amber' : 'grey'}">${esc(r.severity)}</span>
        <div style="flex:1;"><b>${esc(r.title)}</b> <span class="ho-muted">· ${esc(r.kind)} · ${esc(r.status)}${r.gate_id ? ' · ' + esc(r.gate_id.toUpperCase()) : ''}</span>
          ${r.description ? `<div class="ho-muted">${esc(r.description)}</div>` : ''}
          <div class="ho-muted">${r.owner ? 'Owner ' + esc(r.owner) : 'No owner'}${r.due_date ? ' · due ' + day(r.due_date) : ''}${r.ack ? ' · acknowledged by ' + esc(r.ack.by.name) + ' ' + when(r.ack.at) : ''}</div></div>
        ${me.can_ack && r.kind === 'operational' && r.status === 'open' && !r.ack ? `<button class="btn y btn-sm" onclick="HO.ack(${r.id})" ${s.busy ? 'disabled' : ''}>Acknowledge</button>` : ''}
        ${canAdd && r.status === 'open' ? `<button class="btn btn-sm" onclick="HO.closeRisk(${r.id})" ${s.busy ? 'disabled' : ''}>Mark mitigated</button>` : ''}
      </div>`).join('') || '<div class="ho-muted">No risks recorded.</div>';
    const form = canAdd ? `<details style="margin-top:10px;"><summary class="ho-muted" style="cursor:pointer;">+ Add a risk</summary>
      <div class="ho-risk-form" id="ho-risk-form" style="display:grid;gap:8px;margin-top:8px;">
        <div><label>Risk</label><input data-hr="title"></div>
        <div><label>Details</label><textarea data-hr="description" rows="2"></textarea></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">
          <div><label>Type</label><select data-hr="kind"><option value="operational">Operational</option><option value="compliance">Compliance (blocks Compliance sign-off)</option></select></div>
          <div><label>Severity</label><select data-hr="severity"><option>low</option><option selected>medium</option><option>high</option></select></div>
          <div><label>Owner</label><input data-hr="owner"></div><div><label>Due</label><input data-hr="due_date" type="date"></div>
          <div><label>Gate</label><select data-hr="gate_id"><option value=""></option>${g.gates.filter(x => x.applicable).map(x => `<option value="${x.id}">${x.id.toUpperCase()}</option>`).join('')}</select></div>
        </div>
        <div><button class="btn y btn-sm" onclick="HO.addRisk()" ${s.busy ? 'disabled' : ''}>Add risk</button></div>
      </div></details>` : (g.locked ? '<div class="ho-muted" style="margin-top:8px;">Risks are locked while the record is being signed.</div>' : '');
    return `<div class="ho-card"><h3>Risks</h3>${list}${form}</div>`;
  }

  function trail(g) {
    const ob = g.outbox;
    const obLine = ob ? `<div class="ho-banner ${ob.status === 'quarantined' ? 'err' : ''}" style="margin:0 0 10px;">ClickUp Handoffs list: ${esc(ob.status)}${ob.attempts ? ' · ' + ob.attempts + ' attempt(s)' : ''}${ob.last_error ? ' · ' + esc(ob.last_error) : ''}</div>`
      : (g.stage === 'complete' ? '' : '<div class="ho-muted" style="margin-bottom:8px;">The ClickUp record is created when Operations approves.</div>');
    const hist = (g.signature_history || []).filter(x => x.invalidated_at);
    const histHtml = hist.length ? `<details style="margin-bottom:8px;"><summary class="ho-muted" style="cursor:pointer;">Earlier signatures (${hist.length})</summary>${hist.map(x =>
      `<div class="ho-muted">${esc(STEP[x.role].t)} · ${esc(x.name)} · ${when(x.at)} · cleared ${when(x.invalidated_at)}: ${esc(x.reason || '')}</div>`).join('')}</details>` : '';
    const ev = (g.events || []).map(e => `<div class="${/_blocked$/.test(e.kind) ? 'blk' : ''}"><span class="ho-muted">${when(e.at)}<br>${esc(e.by)}</span><span>${esc(e.detail)}</span></div>`).join('');
    return `<div class="ho-card"><h3>Audit trail</h3>${obLine}${histHtml}<div class="ho-events">${ev || '<span class="ho-muted">Nothing yet.</span>'}</div></div>`;
  }

  // ---------- actions ----------
  function setTab(t) { s.tab = t; render(); }
  function remember(k, on) { if (on) s.open.add(k); else s.open.delete(k); }
  function go(target) {
    if (!target) return;
    s.tab = 'signoff';
    const gate = /^gate-(\w+)$/.exec(target);
    if (gate && s.g) { const x = s.g.gates.find(y => y.id === gate[1]); if (x) s.open.add(x.grp); }
    if (/^hf-/.test(target)) s.open.add('pack');
    render();
    const el = document.getElementById('ho-t-' + target);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); }
  }
  const ver = () => (s.g && s.g.record && s.g.record.version) || 0;

  async function savePack() {
    const root = document.getElementById('ho-pack'); if (!root) return;
    const r = s.g.record, patch = {};
    root.querySelectorAll('[data-ho]').forEach(el => {
      const [sec, key] = el.dataset.ho.split('.');
      if (sec === 'prog') return;
      const inp = INPUT[el.dataset.ho] || {};
      let v = el.type === 'checkbox' ? el.checked : el.value.trim();
      let old = (r[sec] || {})[key];
      if (inp.keys) { // list field: compare as text, save as [{...}]
        if (v === packLines(old, inp.keys)) return;
        (patch[sec] ||= {})[key] = v ? v.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const parts = l.split('|').map(x => x.trim()), o = {};
          inp.keys.forEach((k, i) => { if (parts[i]) o[k] = k === 'learners' && /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i]; });
          return o; }) : null;
        return;
      }
      if ((v === '' || v === false) && (old === undefined || old === null || old === '' || old === false)) return;
      if (String(v) === String(old ?? '')) return;
      (patch[sec] ||= {})[key] = v === '' ? null : v;
    });
    if (!Object.keys(patch).length) { showToast('info', 'Nothing changed'); return; }
    await act('handoff_save', { p_patch: patch, p_version: ver() }, 'Handover details saved');
  }
  async function saveGate(id) {
    const root = document.querySelector(`[data-gate="${id}"]`); if (!root) return;
    const r = s.g.record, patch = {}, facts = {};
    root.querySelectorAll('[data-hf]').forEach(el => { const v = el.value.trim(), old = (r.facts || {})[el.dataset.hf] || ''; if (v !== old) facts[el.dataset.hf] = v || null; });
    if (Object.keys(facts).length) patch.facts = facts;
    const ref = root.querySelector('[data-he="ref"]'), dt = root.querySelector('[data-he="date"]');
    if (ref) {
      const old = (r.evidence || {})[id] || {}, nr = ref.value.trim(), nd = dt ? dt.value : (old.date || '');
      if (nr !== (old.ref || '') || nd !== (old.date || '')) patch.evidence = { [id]: nr ? { ref: nr, date: nd || null } : null };
    }
    if (!Object.keys(patch).length) { showToast('info', 'Nothing changed'); return; }
    await act('handoff_save', { p_patch: patch, p_version: ver() }, id.toUpperCase() + ' saved');
  }
  async function declareNA(id) {
    const why = prompt(`Why doesn't ${id.toUpperCase()} apply to this programme? Compliance will confirm it.`);
    if (!why) return;
    await act('handoff_save', { p_patch: { na_decl: { [id]: { why } } }, p_version: ver() }, id.toUpperCase() + ' declared not applicable');
  }
  async function undeclareNA(id) { await act('handoff_save', { p_patch: { na_decl: { [id]: null } }, p_version: ver() }, id.toUpperCase() + ' applies again'); }
  async function assign(step, uid) { if (uid) await act('handoff_assign', { p_step: step, p_user: uid }, STEP[step].t + ' assigned'); }
  async function verify(id, on) { await act('handoff_verify', { p_gate: id, p_on: on }, on ? id.toUpperCase() + ' verified' : 'Verification withdrawn'); }
  async function sign(step) {
    const att = document.getElementById('ho-att-' + step), nm = document.getElementById('ho-name-' + step);
    if (!att || !att.checked) { showToast('error', 'Tick the declaration first'); return; }
    if (!nm || !nm.value.trim()) { showToast('error', 'Type your name to sign'); return; }
    const g = await act('handoff_sign', { p_step: step, p_typed_name: nm.value.trim() }, null);
    if (!g || g.error) return;
    showToast('success', STEP[step].verb + ' · signed');
    if (step === 'ops' && g.stage === 'complete') {
      const p = prog(), label = (p && p.fields && (p.fields['Prog ID'] || p.fields['Qualification'])) || s.pid;
      notifyAdmins('programme_handover', `${label} handed over to ${(g.record.details || {}).pm_email || 'the PM'} after the three-step sign-off (${state.currentUserEmail || state.currentUser})`);
      await loadProgrammes();
      render();
    }
  }
  async function unlock() {
    const why = prompt('What needs to change? Every signature is cleared and kept in the history.');
    if (!why) return;
    await act('handoff_unlock', { p_reason: why }, 'Unlocked for editing');
  }
  async function addRisk() {
    const root = document.getElementById('ho-risk-form'); if (!root) return;
    const r = {}; root.querySelectorAll('[data-hr]').forEach(el => { if (el.value.trim()) r[el.dataset.hr] = el.value.trim(); });
    if (!r.title) { showToast('error', 'Describe the risk'); return; }
    await act('handoff_risk_save', { p_risk: r }, 'Risk added');
  }
  async function closeRisk(id) { await act('handoff_risk_save', { p_risk: { id, status: 'mitigated' } }, 'Risk marked mitigated'); }
  async function ack(id) { await act('handoff_risk_ack', { p_risk_id: id }, 'Risk acknowledged'); }

  return { open, load, render, setTab, remember, go, savePack, saveGate, declareNA, undeclareNA, assign, verify, sign, unlock, addRisk, closeRisk, ack, _s: s };
})();

ROUTES.handover = ['Sign-off & hand-over', 'Delivery']; PARENT.handover = 'programmes';
const st = document.createElement('style');
st.textContent = `#view-handover{--accent-gold:var(--accent);--accent-rose:var(--bad);--bg-card:var(--surface);--bg-card-hover:var(--surface2);--bg-secondary:var(--surface2);--border-accent:var(--accent);--border-subtle:var(--line);--font-mono:ui-monospace,monospace;--font-sans:inherit;--font-serif:inherit;--radius-md:12px;--radius-sm:8px;--text-muted:var(--muted);--text-primary:var(--ink);--text-secondary:var(--muted)}
#view-handover .btn-sm{height:34px;padding:0 12px;font-size:13px}#view-handover .btn-gold{background:var(--yellow);border:0;color:var(--navy);font-weight:700}
#view-handover input,#view-handover select,#view-handover textarea{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:8px 10px;max-width:100%}
#view-handover label{display:block;font-size:12px;color:var(--muted);margin:6px 0 3px}
#view-handover .pd-tabs{display:flex;gap:6px;padding:12px 18px 0;border-bottom:1px solid var(--line)}#view-handover .pd-tab{background:none;border:0;padding:10px 12px;font:inherit;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;cursor:pointer}#view-handover .pd-tab.active{color:var(--ink);border-color:var(--accent)}#view-handover .pd-body{padding:16px 18px}
` + "#view-handover .pd-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:16px 18px 0;}\n#view-handover .pd-title{flex:1;min-width:220px;}\n#view-handover .pd-title h2{font-family:var(--font-serif);font-size:19px;margin:0;line-height:1.3;}\n#view-handover .pd-sub{font-size:12px;color:var(--text-muted);margin-top:2px;}\n#view-handover .pd-tabs{display:flex;gap:4px;padding:10px 18px 0;border-bottom:1px solid var(--border-subtle);overflow-x:auto;}\n#view-handover .pd-tab{padding:10px 14px;font-size:13px;color:var(--text-muted);border:none;background:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;font-weight:600;}\n#view-handover .pd-tab.active{color:var(--text-primary);border-bottom-color:var(--accent-gold);}\n#view-handover .pd-body{padding:18px;}\n.pd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px 18px;}\n.pd-kv .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);}\n.pd-kv .v{font-size:13.5px;margin-top:2px;word-break:break-word;}\n.ho-card{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;}\n.ho-card h3{font-size:14px;margin:0 0 10px;font-weight:700;}\n.ho-ready{display:flex;flex-wrap:wrap;gap:12px 22px;align-items:center;border-left:4px solid var(--text-muted);}\n.ho-ready.red{border-left-color:var(--accent-rose);} .ho-ready.amber{border-left-color:var(--accent-gold);} .ho-ready.green{border-left-color:#22a06b;}\n.ho-ready .hl{font-family:var(--font-serif);font-size:20px;font-weight:700;flex:1;min-width:220px;}\n.ho-ready .next{font-size:12.5px;color:var(--text-secondary);margin-top:4px;font-family:var(--font-sans);font-weight:400;}\n.ho-stats{display:flex;gap:18px;flex-wrap:wrap;}\n.ho-stat b{display:block;font-size:18px;} .ho-stat span{font-size:11px;color:var(--text-muted);}\n.ho-banner{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 14px;border-radius:var(--radius-sm);background:rgba(212,165,55,0.12);border:1px solid var(--border-accent);font-size:12.5px;margin-bottom:14px;}\n.ho-banner.err{background:rgba(166,58,58,0.14);border-color:rgba(166,58,58,0.5);}\n.ho-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:14px;}\n.ho-step{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;display:flex;flex-direction:column;gap:8px;}\n.ho-step.current{border-color:var(--accent-gold);box-shadow:0 0 0 1px var(--accent-gold) inset;}\n.ho-step .n{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);}\n.ho-step .t{font-weight:700;font-size:14px;}\n.ho-step .who{font-size:12.5px;color:var(--text-secondary);}\n.ho-step .why{font-size:12px;color:var(--text-muted);}\n.ho-step .sig{font-size:12px;padding:8px;border-radius:var(--radius-sm);background:rgba(34,160,107,0.12);}\n.ho-step .sig.bad{background:rgba(166,58,58,0.14);}\n.ho-step select,.ho-step input[type=text],.ho-form input,.ho-form select,.ho-form textarea,.ho-gate input,.ho-gate select,.ho-gate textarea,.ho-risk-form input,.ho-risk-form select,.ho-risk-form textarea{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:var(--bg-card);color:var(--text-primary);font:inherit;font-size:13px;}\n.ho-attest{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--text-secondary);}\n.ho-list{display:flex;flex-direction:column;gap:6px;}\n.ho-item{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:var(--radius-sm);background:var(--bg-card);border:1px solid var(--border-subtle);cursor:pointer;text-align:left;color:inherit;font:inherit;width:100%;}\n.ho-item:hover{background:var(--bg-card-hover);}\n.ho-item .t{font-size:13px;font-weight:600;} .ho-item .w{font-size:12px;color:var(--text-muted);margin-top:2px;}\n.ho-item .meta{margin-left:auto;font-size:11px;color:var(--text-muted);white-space:nowrap;text-align:right;}\n.ho-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex:none;background:var(--accent-rose);}\n.ho-dot.amber{background:var(--accent-gold);} .ho-dot.green{background:#22a06b;} .ho-dot.grey{background:var(--text-muted);}\n.ho-dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;}\n.ho-dl div{font-size:12px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-card);border:1px solid var(--border-subtle);}\n.ho-dl b{display:block;font-size:13px;}\n.ho-group{border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:8px;background:var(--bg-secondary);}\n.ho-group>summary{padding:11px 14px;cursor:pointer;display:flex;gap:10px;align-items:center;font-weight:700;font-size:13px;list-style:none;}\n.ho-group>summary::-webkit-details-marker{display:none;}\n.ho-group>summary .c{margin-left:auto;font-weight:400;font-size:11.5px;color:var(--text-muted);}\n.ho-gate{border-top:1px solid var(--border-subtle);padding:12px 14px;display:flex;flex-direction:column;gap:8px;}\n.ho-gate.flash{animation:hoflash 1.6s ease;}\n@keyframes hoflash{0%{background:rgba(212,165,55,0.3);}100%{background:transparent;}}\n.ho-gate .top{display:flex;gap:10px;align-items:flex-start;}\n.ho-gate .id{font-family:var(--font-mono);font-size:12px;font-weight:700;min-width:28px;}\n.ho-gate .txt{flex:1;font-size:13px;}\n.ho-gate .rs{font-size:12px;color:var(--accent-rose);margin:0;padding-left:16px;}\n.ho-gate .ns{font-size:12px;color:var(--accent-gold);margin:0;padding-left:16px;}\n.ho-gate .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;}\n.ho-gate label,.ho-form label,.ho-risk-form label{font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px;}\n.ho-gate .acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}\n.ho-src{font-size:11px;color:var(--text-muted);}\n.ho-form .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:10px;}\n.ho-form .bad input,.ho-form .bad select{border-color:var(--accent-rose);}\n.ho-checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;font-size:12.5px;margin-bottom:10px;}\n.ho-checks label{display:flex;gap:8px;align-items:center;justify-content:flex-start;font-size:12.5px;color:var(--text-primary);text-align:left;}\n.ho-checks input,.ho-attest input{width:auto;flex:none;margin:0;}\n.ho-risk{display:flex;gap:10px;align-items:flex-start;padding:10px;border-top:1px solid var(--border-subtle);font-size:12.5px;}\n.ho-risk:first-child{border-top:none;}\n.ho-events{max-height:340px;overflow-y:auto;font-size:12px;}\n.ho-events div{padding:6px 0;border-bottom:1px solid var(--border-subtle);display:grid;grid-template-columns:150px 1fr;gap:10px;}\n.ho-events .blk{color:var(--accent-rose);}\n.ho-muted{color:var(--text-muted);font-size:12px;}\n.ho-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;}\n#view-handover .pd-title h2,#view-handover .ho-ready .hl{font-family:Poppins,sans-serif;font-weight:600}\n#view-handover .pd-tab{border-bottom-width:3px}#view-handover .pd-tab.active{color:var(--ink);font-weight:700;border-bottom-color:var(--yellow)}\n#view-handover .ho-card{background:var(--surface);border-radius:14px;padding:18px 20px}\n#view-handover .ho-card h3{font-family:Poppins,sans-serif;font-size:16px;font-weight:600;margin-bottom:12px}\n#view-handover .ho-ready.amber{border-left-color:#E0A100}#view-handover .ho-ready.green{border-left-color:var(--ok)}\n#view-handover .ho-stats{gap:8px}\n#view-handover .ho-stat{display:flex;flex-direction:column;gap:2px;min-width:104px;padding:10px 14px;border-radius:12px;background:var(--ground)}\n#view-handover .ho-stat b{order:2;font-family:Poppins,sans-serif;font-size:24px;font-weight:800;line-height:1.1}\n#view-handover .ho-stat span{order:1;font-size:12px;font-weight:600;color:var(--muted)}\n#view-handover .ho-step{background:var(--surface);border-radius:14px}\n#view-handover .ho-step.current{border:2px solid var(--navy);box-shadow:inset 0 -4px 0 var(--yellow)}\n#view-handover .ho-step .n{font-weight:700}\n#view-handover .ho-list{gap:0}\n#view-handover .ho-item{border:0;border-bottom:1px solid var(--line2);border-radius:0;background:transparent}\n#view-handover .ho-item:hover{background:var(--ground)}\n#view-handover .ho-dot.amber{background:#E0A100}#view-handover .ho-dot.green{background:var(--ok)}\n#view-handover .ho-group{background:var(--surface);border-radius:14px;overflow:hidden}\n#view-handover .ho-group>summary{background:var(--ground);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}\n#view-handover .ho-group>summary .c{text-transform:none;letter-spacing:0}\n#view-handover .ho-banner{background:var(--warnbg);border:0;color:var(--ink)}#view-handover .ho-banner.err{background:var(--badbg);color:var(--bad)}\n#view-handover .ho-step .sig{background:var(--okbg);color:var(--ok)}#view-handover .ho-step .sig.bad{background:var(--badbg);color:var(--bad)}\n#view-handover .ho-dl div{background:var(--ground);border:0}#view-handover .ho-gate .ns{color:#8A5100}\n@media (max-width:820px){.ho-two{grid-template-columns:1fr;}.ho-events div{grid-template-columns:1fr;gap:2px;}.ho-item .meta{display:none;}}\n";
document.head.appendChild(st);
const main = document.createElement('main'); main.id = 'view-handover'; main.hidden = true;
main.innerHTML = '<section class="card" style="padding:0;overflow:hidden"><div id="programme-detail-root"></div></section>';
const last = [...document.querySelectorAll('main[id^=view-]')].pop(); last.after(main);
function fromHash() { const m = location.hash.match(/^#handover\/(\d+)/); if (m && HO._s.pid !== m[1]) HO.open(m[1], 'signoff'); }
addEventListener('hashchange', fromHash);
const wait = setInterval(() => { if (P.user) { clearInterval(wait); fromHash(); } }, 300);
})();
