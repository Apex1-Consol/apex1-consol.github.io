/* ApexOne redesign preview — FAM Registry module. Loaded after live.js.
   Brings the standalone fam-registry.html features into the new layout:
   expiry KPIs (click to filter), SETA coverage + next action columns, computed status,
   registrations / follow-ups / versioned document checklist in the side panel,
   add practitioner, add registration, upload / view (signed URL) / replace documents.
   Status and risk rules are the same as fam-registry.html. Writes go through previewWrite; RLS decides who may write. */
(function () {
  const sb = window.__sb, P = window.__preview, write = window.previewWrite;
  if (!sb || !P || !write) return;

  const TYPES = ['CV', 'ID', 'Highest Qualification', 'QUAL', 'SLA', 'AFFIDAVIT'];
  const MAX = 10 * 1024 * 1024, EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  const S = { A: [], R: [], D: [], F: [], filter: '', q: '', showDismissed: false, hist: {} };
  const say = m => window.toast(m);
  const has = (...r) => (P.roles || []).some(x => r.includes(x));
  const isAdm = () => has('admin');
  const canWrite = () => has('admin', 'qa_specialist', 'etqa', 'project_manager', 'pi_specialist');
  const me = () => P.user?.email || null;
  const fmt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  const e = s => esc(s ?? '');

  /* ---------- rules (same as fam-registry.html) ---------- */
  const regsFor = id => S.R.filter(r => r.assessor_id === id);
  const days = r => r.registration_expiry_date ? Math.round((new Date(r.registration_expiry_date + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5) : null;
  const active = r => (r.status || 'Active') === 'Active';
  function risk(r) {
    if (r.status === 'Pending Entry') return 'pending';
    const d = days(r);
    if (d === null) return active(r) ? 'active' : 'inactive';
    if (d < 0) return 'expired'; if (d <= 30) return 'due_30'; if (d <= 60) return 'due_60';
    return active(r) ? 'active' : 'inactive';
  }
  function status(id) {
    const st = regsFor(id).map(risk);
    if (!st.length) return 'unknown';
    if (st.every(s => s === 'active')) return 'active';
    if (st.includes('expired')) return st.every(s => s === 'expired') ? 'expired' : 'mixed';
    if (st.some(s => ['due_30', 'due_60', 'pending', 'inactive'].includes(s))) return st.includes('active') ? 'mixed' : st.includes('pending') ? 'needs_review' : 'inactive';
    return 'active';
  }
  const PILL = { active: ['b-ok', 'Active'], inactive: ['b-bad', 'Inactive'], expired: ['b-bad', 'Expired'], mixed: ['b-warn', 'Mixed'], needs_review: ['b-warn', 'Needs review'], unknown: ['b-n', 'No registrations'] };
  const pill = s => { const [c, l] = PILL[s] || PILL.unknown; return `<span class="badge ${c}">${l}</span>`; };
  const RISK = { expired: ['b-bad', d => `Expired ${Math.abs(d)}d ago`], due_30: ['b-bad', d => `Due in ${d}d`], due_60: ['b-warn', d => `Due in ${d}d`], pending: ['b-n', () => 'Pending entry'], inactive: ['b-bad', () => 'Inactive'], active: ['b-ok', () => 'Active'] };
  const riskBadge = r => { const k = risk(r), [c, f] = RISK[k]; return `<span class="badge ${c}">${f(days(r))}</span>`; };
  const roles = id => [...new Set(regsFor(id).flatMap(r => r.roles?.length ? r.roles : r.role ? [r.role] : []))];
  const rolesOf = a => { const r = roles(a.id); return r.length ? r : a.role ? [a.role] : []; };
  const setas = id => [...new Set(regsFor(id).map(r => r.seta_name).filter(s => s && s !== 'N/A' && s !== 'Pending Entry'))];
  // latest current row per type (a non-admin re-upload adds a newer version without retiring the old row)
  const cur = (id, t) => S.D.filter(d => d.assessor_id === id && d.doc_type === t && d.is_current !== false).sort((x, y) => (y.version || 1) - (x.version || 1))[0];
  const onFile = id => TYPES.filter(t => { const c = cur(id, t); return c && c.status !== 'Missing'; });
  const fu = (type, sid) => S.F.find(f => f.source_type === type && f.source_id === sid);
  const openFU = id => S.F.filter(f => f.assessor_id === id && !['Dismissed', 'Resolved', 'Done'].includes(f.status));

  function nextAction(a) {
    const regs = regsFor(a.id), miss = TYPES.length - onFile(a.id).length;
    if (!regs.length) return 'Add a SETA registration';
    const by = k => regs.filter(r => risk(r) === k);
    if (by('expired').length) return `Renew ${by('expired')[0].seta_name} (expired)`;
    if (by('due_30').length) return `Renew ${by('due_30')[0].seta_name} in ${days(by('due_30')[0])}d`;
    if (by('pending').length) return 'Complete registration entry';
    if (miss) return `Upload ${miss} document${miss > 1 ? 's' : ''}`;
    if (by('due_60').length) return `Plan renewal: ${by('due_60')[0].seta_name}`;
    return '—';
  }

  /* ---------- KPIs (click to filter) ---------- */
  const allRisks = () => S.R.map(risk);
  const missingDocsCount = () => S.A.filter(a => onFile(a.id).length < TYPES.length).length;
  const KPIS = () => [
    ['', 'Practitioners', S.A.length, 'var(--ink)'],
    ['', 'Registrations', S.R.length, 'var(--ink)'],
    ['active', 'Active', allRisks().filter(s => s === 'active').length, 'var(--ok)'],
    ['expired', 'Expired', allRisks().filter(s => s === 'expired').length, 'var(--bad)'],
    ['due_30', 'Due ≤30 days', allRisks().filter(s => s === 'due_30').length, 'var(--bad)'],
    ['due_60', 'Due 31–60 days', allRisks().filter(s => s === 'due_60').length, 'var(--warn)'],
    ['pending', 'Pending entry', allRisks().filter(s => s === 'pending').length, 'var(--muted)'],
    ['inactive', 'Inactive', allRisks().filter(s => s === 'inactive').length, 'var(--bad)'],
    ['missing', 'Missing docs', missingDocsCount(), 'var(--bad)'],
    ['followups', 'Open follow-ups', S.F.filter(f => !['Dismissed', 'Resolved', 'Done'].includes(f.status)).length, 'var(--ink)']];
  const matches = (a, k) => !k ? true : k === 'missing' ? onFile(a.id).length < TYPES.length : k === 'followups' ? openFU(a.id).length > 0 : regsFor(a.id).some(r => risk(r) === k);
  window.famFilter = k => { S.filter = S.filter === k ? '' : k; render(); };
  window.famSearch = v => { S.q = v.toLowerCase(); renderRows(); };

  /* ---------- render ---------- */
  function render() {
    $('famkpis').innerHTML = KPIS().map(([k, l, v, c]) => `<button class="kpi famk${S.filter && S.filter === k ? ' on' : ''}" ${k ? `onclick="famFilter('${k}')" aria-pressed="${S.filter === k}"` : 'disabled'} title="${k ? 'Filter the list' : ''}"><span class="l">${l}</span><span class="v" style="color:${c}">${v}</span></button>`).join('');
    renderRows(); renderPanel();
  }
  function rows() { return S.A.map((a, i) => [a, i]).filter(([a]) => matches(a, S.filter) && (!S.q || a.full_name.toLowerCase().includes(S.q) || setas(a.id).join(' ').toLowerCase().includes(S.q))); }
  function renderRows() {
    const list = rows();
    $('famrows').innerHTML = list.length ? list.map(([a, i]) => {
      const k = onFile(a.id).length, c = k === 6 ? 'var(--ok)' : k >= 3 ? '#E0A100' : 'var(--bad)', st = setas(a.id);
      return `<tr class="${i === famSel ? 'sel' : ''}"><td><button class="famname" onclick="famSel=${i};renderFam()">${e(a.full_name)}</button><div class="sub">${e(rolesOf(a).join(' · ') || '—')}</div></td>
        <td class="sub">${st.length ? st.map(e).join(', ') : '—'}</td>
        <td style="white-space:nowrap"><span class="bar"><i style="width:${Math.round(k / 6 * 100)}%;background:${c}"></i></span> <span class="sub">${k}/6</span></td>
        <td>${pill(status(a.id))}</td><td class="sub">${e(nextAction(a))}</td></tr>`;
    }).join('') : `<tr><td colspan="5" class="sub" style="padding:20px">No practitioners match${S.filter ? ' this filter. <a href="#" onclick="famFilter(\'\');return false">Clear filter</a>' : '.'}</td></tr>`;
    $('famcount').textContent = `${list.length} of ${S.A.length}`;
  }
  function fuControls(type, sid, aid, kind) {
    if (!canWrite()) return '';
    const f = fu(type, sid), st = f?.status || 'Open';
    const who = f?.assigned_to ? ` · ${e(f.assigned_to)}` : '';
    const b = (fn, l) => `<button class="btn sm" onclick="famFU('${fn}','${type}',${sid},${aid},'${kind}')">${l}</button>`;
    return `<div class="famfu"><span class="sub">${f ? e(st) + who : 'No follow-up'}${f?.notes ? ' — ' + e(f.notes) : ''}</span>
      ${st === 'Dismissed' ? b('reopen', 'Reopen') : (st !== 'In Progress' ? b('claim', 'Claim') : '') + b('note', 'Note') + b('dismiss', 'Dismiss')}</div>`;
  }
  function renderPanel() {
    const a = S.A[famSel] || S.A[0], box = $('fampanel');
    if (!a) { box.innerHTML = '<div style="padding:20px" class="sub">No practitioners yet. Add one to start.</div>'; return; }
    const regs = regsFor(a.id), docs = S.D.filter(d => d.assessor_id === a.id);
    const regHtml = regs.length ? regs.map(r => {
      const k = risk(r), flag = ['expired', 'due_30', 'due_60', 'pending'].includes(k);
      return `<div class="famreg"><div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="flex-grow:1">${e(r.seta_name)}</b>${riskBadge(r)}</div>
        <div class="sub">${e((r.roles?.length ? r.roles : [r.role]).join(', '))} · No. ${e(r.registration_number || '—')} · Expires ${fmt(r.registration_expiry_date)}</div>
        ${flag ? fuControls('registration', r.id, a.id, k) : ''}</div>`;
    }).join('') : '<div class="sub" style="padding:8px 0">No SETA registrations yet.</div>';
    const chk = TYPES.map(t => {
      const c0 = cur(a.id, t), ok = c0 && c0.status !== 'Missing';
      const old = docs.filter(d => d.doc_type === t && d !== c0 && (d.is_current === false || d.version < (c0?.version || 0))).sort((x, y) => (y.version || 0) - (x.version || 0));
      const view = c0?.file_url ? `<a href="#" onclick="famView(${c0.id});return false">View</a>` : ok ? '<span class="sub">No file</span>' : '';
      const act = !canWrite() ? '' : ok ? (isAdm() ? `<a href="#" onclick="famDoc(${a.id},'${t}',${c0.id});return false">Replace</a>` : '') : `<a href="#" style="color:var(--bad)" onclick="famDoc(${a.id},'${t}');return false">Upload</a>`;
      const hist = old.length ? `<a href="#" onclick="famHist('${a.id}:${t}');return false">${old.length} older</a>` : '';
      const histRows = S.hist[a.id + ':' + t] ? old.map(d => `<div class="sub famh">v${d.version || 1} · ${fmt(d.doc_date)} · replaced ${fmt(d.superseded_at)} ${d.file_url ? `<a href="#" onclick="famView(${d.id});return false">View</a>` : ''}</div>`).join('') : '';
      const missFU = c0 && c0.status === 'Missing' ? fuControls('document', c0.id, a.id, 'missing_doc') : '';
      return `<div class="chk" style="flex-wrap:wrap"><span class="dot ${ok ? 'b-ok' : 'b-bad'}">${ok ? '✓' : '!'}</span>
        <span style="flex-grow:1">${e(t)}${ok ? `<span class="sub"> · ${fmt(c0.doc_date)}${c0.version > 1 ? ' · v' + c0.version : ''}</span>` : ''}</span>
        <span class="famacts">${view}${act}${hist}</span>${histRows ? `<div style="flex-basis:100%">${histRows}</div>` : ''}${missFU ? `<div style="flex-basis:100%">${missFU}</div>` : ''}</div>`;
    }).join('');
    box.innerHTML = `<div class="famhead"><span class="disp" style="font-size:20px">${e(a.full_name)}</span>
        <span style="font-size:13px;color:#D2D1EC">${e(rolesOf(a).join(' · ') || 'No roles yet')}</span>
        <span style="font-size:13px;color:#D2D1EC">${e([a.email, a.phone].filter(Boolean).join(' · ') || 'No contact details')}</span>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${pill(status(a.id))}
        <button class="btn sm" disabled title="Needs the AI function in the preview project (paid Gemini tier, see handoff)">AI compliance summary</button></div></div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:18px">
        <div><div style="display:flex;align-items:baseline;margin-bottom:6px"><h2 style="font-size:15px;flex-grow:1">SETA registrations</h2>${canWrite() ? `<button class="btn sm" onclick="famReg(${a.id})">+ Add</button>` : ''}</div>${regHtml}</div>
        <div><div style="display:flex;align-items:baseline;margin-bottom:6px"><h2 style="font-size:15px;flex-grow:1">Document checklist</h2><span class="sub">${onFile(a.id).length} of 6 on file</span></div>${chk}</div>
      </div>`;
  }

  /* ---------- modal ---------- */
  function modal(title, body, onSave) {
    close();
    document.body.insertAdjacentHTML('beforeend', `<div id="famov" role="dialog" aria-modal="true" aria-label="${e(title)}"><form class="card" id="famform"><h2>${e(title)}</h2>${body}
      <div class="sub" id="famerr" style="color:var(--bad)"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="famcancel">Cancel</button><button class="btn y" id="famsave">Save</button></div></form></div>`);
    $('famcancel').onclick = close;
    $('famform').onsubmit = async ev => {
      ev.preventDefault(); const btn = $('famsave'); btn.disabled = true; btn.textContent = 'Saving…';
      try { await onSave($('famform').elements); close(); await load(); }
      catch (err) { $('famerr').textContent = err.message || String(err); btn.disabled = false; btn.textContent = 'Save'; }
    };
    $('famform').querySelector('input,select')?.focus();
  }
  const close = () => $('famov')?.remove();
  const fld = (name, label, type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;
  const sel = (name, label, opts, extra = '') => `<label>${label}<select name="${name}" ${extra}>${opts.map(o => `<option>${e(o)}</option>`).join('')}</select></label>`;
  const val = (f, k) => (f[k]?.value || '').trim() || null;
  const need = () => { if (!P.tenant) throw new Error('No tenant on your account.'); };

  window.famAdd = () => modal('Add practitioner', `<div class="qagrid">${fld('full_name', 'Full name *', 'text', 'required')}${sel('role', 'Main role', ['Facilitator', 'Assessor', 'Moderator'])}${fld('id_number', 'ID number')}${fld('email', 'Email', 'email')}${fld('phone', 'Phone', 'tel')}${fld('physical_address', 'Address')}</div>`,
    async f => { need(); const rows = await write('Practitioner', () => sb.from('assessors').insert({ tenant_id: P.tenant, full_name: val(f, 'full_name'), role: val(f, 'role'), id_number: val(f, 'id_number'), email: val(f, 'email'), phone: val(f, 'phone'), physical_address: val(f, 'physical_address') }).select('id'));
      say('Practitioner added'); famSel = -1; S.pick = rows?.[0]?.id; });

  window.famReg = aid => modal('Add SETA registration', `<div class="qagrid">${fld('seta_name', 'SETA *', 'text', 'required list="famsetas"')}<datalist id="famsetas">${['ETDP SETA', 'MICT SETA', 'Services SETA', 'AgriSETA', 'BANKSETA', 'CHIETA', 'FASSET', 'HWSETA', 'INSETA', 'LGSETA', 'MERSETA', 'PSETA', 'QCTO', 'TETA', 'W&RSETA'].map(s => `<option value="${s}">`).join('')}</datalist>
      ${fld('registration_number', 'Registration number')}${fld('registration_expiry_date', 'Expiry date', 'date')}${sel('status', 'Status', ['Active', 'Pending Entry', 'Inactive'])}</div>
      <fieldset style="border:0;padding:0;display:flex;gap:14px;flex-wrap:wrap"><legend class="sub" style="margin-bottom:4px">Roles *</legend>${['Facilitator', 'Assessor', 'Moderator'].map(r => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="r_${r}">${r}</label>`).join('')}</fieldset>`,
    async f => { need(); const rl = ['Facilitator', 'Assessor', 'Moderator'].filter(r => f['r_' + r].checked);
      if (!rl.length) throw new Error('Select at least one role.');
      await write('Registration', () => sb.from('fam_seta_registrations').insert({ tenant_id: P.tenant, assessor_id: aid, seta_name: val(f, 'seta_name'), role: rl[0], roles: rl, registration_number: val(f, 'registration_number'), registration_expiry_date: val(f, 'registration_expiry_date'), status: val(f, 'status') }));
      say('Registration added'); });

  window.famDoc = (aid, type, replaceId) => {
    if (replaceId && !isAdm()) return say('Only admins can replace a document');
    modal(replaceId ? `Replace ${type}` : `Add ${type}`, `<div class="qagrid">${sel('status', 'Status', ['Current', 'Missing'])}${fld('doc_date', 'Document date', 'date')}${fld('expiry_date', 'Expiry date (if any)', 'date')}</div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">File (PDF, Word, JPG or PNG, max 10 MB)${replaceId ? ' *' : ''}<input name="file" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" ${replaceId ? 'required' : ''}></label>`,
      async f => { need(); const file = f.file.files[0], st = val(f, 'status');
        if (replaceId && !file) throw new Error('Choose a replacement file.');
        let meta = {};
        if (file) {
          const ext = (file.name.split('.').pop() || '').toLowerCase();
          if (file.size > MAX) throw new Error(`File is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is 10 MB.`);
          if (!EXT.includes(ext)) throw new Error('Unsupported file type. Upload a PDF, Word document, or JPG/PNG image.');
          const path = `${P.tenant}/${aid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          await write('Upload', () => sb.storage.from('fam-documents').upload(path, file, { contentType: file.type || undefined }));
          meta = { file_url: path, file_name: file.name, file_size_bytes: file.size, mime_type: file.type || null, uploaded_by: me(), uploaded_at: new Date().toISOString() };
        }
        const base = { tenant_id: P.tenant, assessor_id: aid, doc_type: type, status: st, doc_date: val(f, 'doc_date'), expiry_date: val(f, 'expiry_date'), is_current: true, ...meta };
        const old = replaceId ? S.D.find(d => d.id === replaceId) : cur(aid, type);
        if (old) {
          const [n] = await write('Document', () => sb.from('fam_documents').insert({ ...base, version: (old.version || 1) + 1 }).select('id'));
          if (isAdm()) await write('Document', () => sb.from('fam_documents').update({ is_current: false, superseded_at: new Date().toISOString(), superseded_by: n?.id ?? null }).eq('id', old.id));
        } else await write('Document', () => sb.from('fam_documents').insert({ ...base, version: 1 }));
        say(replaceId ? 'Document replaced' : 'Document saved'); });
  };
  window.famView = async id => {
    const d = S.D.find(x => x.id === id); if (!d?.file_url) return say('No file attached');
    const { data, error } = await sb.storage.from('fam-documents').createSignedUrl(d.file_url, 60);
    if (error) return say('Could not open file: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  window.famHist = k => { S.hist[k] = !S.hist[k]; renderPanel(); };
  window.famFU = async (act, type, sid, aid, kind) => {
    const f = fu(type, sid), now = new Date().toISOString();
    let fields;
    if (act === 'claim') fields = { status: 'In Progress', assigned_to: me() };
    else if (act === 'dismiss') fields = { status: 'Dismissed', resolved_at: now, resolved_by: me() };
    else if (act === 'reopen') fields = { status: 'Open', resolved_at: null, resolved_by: null };
    else { const n = prompt('Note for this follow-up:', f?.notes || ''); if (n === null) return; fields = { notes: n, status: f?.status || 'Open' }; }
    try {
      await write('Follow-up', () => sb.from('fam_follow_ups').upsert({ tenant_id: P.tenant, assessor_id: aid, source_type: type, source_id: sid, kind, created_by: f?.created_by || me(), ...fields }, { onConflict: 'tenant_id,assessor_id,source_type,source_id' }));
      say('Follow-up updated'); await load();
    } catch (err) { /* write() already showed it */ }
  };

  /* ---------- data ---------- */
  async function load() {
    const q = async (n, p) => { const { data, error } = await p; if (error) { say('Could not load ' + n + ': ' + error.message); return []; } return data || []; };
    const [A, R, D, F] = await Promise.all([
      q('practitioners', sb.from('assessors').select('id,full_name,role,email,phone').order('full_name')),
      q('registrations', sb.from('fam_seta_registrations').select('*')),
      q('documents', sb.from('fam_documents').select('id,assessor_id,doc_type,status,doc_date,expiry_date,file_url,file_name,is_current,version,superseded_at')),
      q('follow-ups', sb.from('fam_follow_ups').select('*'))]);
    Object.assign(S, { A, R, D, F });
    if (S.pick) { famSel = A.findIndex(a => a.id === S.pick); S.pick = null; }
    if (famSel < 0 || famSel >= A.length) famSel = 0;
    PEOPLE.length = 0; A.forEach(a => PEOPLE.push([a.full_name, rolesOf(a).join(' · '), onFile(a.id)])); // keeps Ctrl K search in step
    render();
  }

  /* ---------- one-time layout ---------- */
  let ready = false;
  function setup() {
    if (ready) return; ready = true;
    document.head.insertAdjacentHTML('beforeend', `<style>
      #famkpis{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}
      .famk{min-width:0;padding:10px 14px;gap:2px;text-align:left;cursor:pointer;font:inherit;border:1px solid var(--line)}
      .famk[disabled]{cursor:default;opacity:1}.famk .v{font-size:22px}.famk .l{font-size:12px}
      .famk.on{outline:2px solid var(--yellow);outline-offset:-2px}
      #view-fam table{min-width:0!important;width:100%}#view-fam td{vertical-align:top}
      .famname{border:0;background:none;font:inherit;font-weight:600;color:var(--ink);padding:4px 0;text-align:left;cursor:pointer}
      .famhead{background:var(--navy);color:#fff;padding:20px;display:flex;flex-direction:column;gap:4px}
      .famreg{border-top:1px solid var(--line2);padding:10px 0;display:flex;flex-direction:column;gap:4px}
      .famfu{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}.famfu .sub{flex-grow:1}
      .famacts{display:flex;gap:12px;font-weight:600;font-size:13px}.famh{padding:2px 0 2px 32px}
      #famov{position:fixed;inset:0;background:rgba(0,20,45,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
      #famov .card{width:min(640px,100%);display:flex;flex-direction:column;gap:12px}
      #famov .qagrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
      #famov label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}
      #famov input,#famov select{height:36px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:transparent;color:var(--ink)}
      #famov input[type=checkbox]{height:auto}#famov input[type=file]{height:auto;padding:6px 0;border:0}
    </style>`);
    const v = $('view-fam'), aside = v.querySelector('aside'), btns = v.querySelectorAll('button');
    btns.forEach(b => {
      const t = b.textContent.trim();
      if (t === '+ Add practitioner') { b.removeAttribute('onclick'); b.onclick = () => canWrite() ? window.famAdd() : say('You do not have FAM write access'); }
      if (t === 'Scope Import' || t === 'Bulk Intake') { b.removeAttribute('onclick'); b.onclick = () => say(t === 'Bulk Intake' ? 'Bulk Intake comes with PR #61' : 'Scope Import: next step (needs the qualification catalogue)'); }
    });
    aside.innerHTML = '<div id="fampanel"></div><span id="famname" hidden></span><span id="famroles" hidden></span><span id="famdocs" hidden></span><div id="famcheck" hidden></div>';
    const tbl = v.querySelector('table');
    tbl.querySelector('thead').innerHTML = '<tr><th>Practitioner</th><th>SETA coverage</th><th>Documents</th><th>Status</th><th>Next action</th></tr>';
    tbl.closest('section').insertAdjacentHTML('afterbegin', `<div style="display:flex;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)"><input type="search" placeholder="Search name or SETA" aria-label="Search practitioners" oninput="famSearch(this.value)" style="flex-grow:1;height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit;background:transparent;color:var(--ink)"><span class="sub" id="famcount"></span></div>`);
    window.renderFam = () => { renderRows(); renderPanel(); };
  }

  window.previewFam = () => { setup(); load(); };
})();
