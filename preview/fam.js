/* ApexOne redesign preview — FAM Registry module. Loaded after live.js.
   List: expiry KPIs (click to filter), 90-day expiry strip, sortable columns, completeness per practitioner,
   row selection with bulk follow-up actions, Excel export of the filtered or selected list.
   Side panel: quick view with registrations, follow-ups and the versioned document checklist.
   Profile page (#fam/<id>, live-style #view=fam&assessor=<id> also works): header with contact details and
   completeness, tabs for Overview, Registrations (+ qualification scope), Documents, Follow-ups and Activity.
   Action queue (#fam/queue): all open follow-up items, filter by issue / mine, show dismissed.
   Scope Import (#fam/scope): catalogue rows linked to registrations, written to fam_registration_scope + audit_log.
   Status and risk rules are the same as fam-registry.html. Writes go through previewWrite; RLS decides who may write. */
(function () {
  const sb = window.__sb, P = window.__preview, write = window.previewWrite;
  if (!sb || !P || !write) return;

  const TYPES = ['CV', 'ID', 'Highest Qualification', 'QUAL', 'SLA', 'AFFIDAVIT'];
  // Stored values stay as-is; QUAL files on live are assessor/moderator certificates, SETA registration reports and professional body certificates.
  const LABEL = { QUAL: 'Practitioner certificate', AFFIDAVIT: 'Affidavit' };
  const HINT = { CV: 'Curriculum vitae', ID: 'ID document or passport', 'Highest Qualification': 'Highest academic qualification', QUAL: 'Assessor, moderator or facilitator certificate, SETA registration report or professional body certificate', SLA: 'Signed service level agreement', AFFIDAVIT: 'Sworn affidavit' };
  const lbl = t => LABEL[t] || t;
  const CRIT = ['ID', 'QUAL']; const critMiss = id => CRIT.some(t => !onFile(id).includes(t)); // ID and practitioner certificate
  const MAX = 10 * 1024 * 1024, EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  const S = { A: [], R: [], D: [], F: [], Q: [], SC: [], filter: '', q: '', hist: {}, sort: { k: 'name', dir: 1 }, fRole: '', fSt: '', fSeta: '', view: 'triage', hideTest: true, page: 0, ptab: 'record', loadedAt: null, sel: new Set(), col: new Set(['lapsed', 'none', 'active', 'inactive']), tab: 'overview', mode: 'list', prof: null, cat: null, catQ: '', catSeta: '' };
  /* Filters remembered per browser (item 6). Search text is not kept. */
  const LSK = 'famFilters.v1', LSF = ['filter', 'fRole', 'fSt', 'fSeta', 'view', 'hideTest'];
  try { const j = JSON.parse(localStorage.getItem(LSK) || 'null'); if (j) { LSF.forEach(k => { if (k in j) S[k] = j[k]; }); if (Array.isArray(j.col)) S.col = new Set(j.col); } } catch (_) {}
  ['expired', 'due_30', 'due_60'].forEach(g => S.col.delete(g)); // urgent groups always open on load, so the first screen shows names
  const saveF = () => { try { localStorage.setItem(LSK, JSON.stringify({ ...Object.fromEntries(LSF.map(k => [k, S[k]])), col: [...S.col] })); } catch (_) {} };
  const say = m => window.toast(m);
  const has = (...r) => (P.roles || []).some(x => r.includes(x));
  const isAdm = () => has('admin');
  const canWrite = () => has('admin', 'qa_specialist', 'etqa', 'project_manager', 'pi_specialist');
  const me = () => P.user?.email || null;
  const fmt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  const e = s => esc(s ?? '');
  const today = () => new Date().toISOString().slice(0, 10);
  const CLOSED = ['Dismissed', 'Resolved', 'Done'];

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
    if (st.every(s => s === 'due_30' || s === 'due_60')) return 'due_soon';
    if (st.some(s => ['due_30', 'due_60', 'pending', 'inactive'].includes(s))) return st.includes('active') ? 'mixed' : st.includes('pending') ? 'needs_review' : 'inactive';
    return 'active';
  }
  const PILL = { active: ['b-ok', 'Active'], inactive: ['b-bad', 'Inactive'], expired: ['b-bad', 'Expired'], mixed: ['b-warn', 'Mixed'], due_soon: ['b-warn', 'Due soon'], needs_review: ['b-warn', 'Needs review'], unknown: ['b-n', 'No registrations'] };
  const RANK = { expired: 0, mixed: 1, due_soon: 2, needs_review: 3, inactive: 4, unknown: 5, active: 6 };
  const GROUPS = { expired: ['Expired', 'var(--bad)', 'Renew now'], mixed: ['Mixed', 'var(--bad)', 'At least one registration needs action'], due_soon: ['Due soon', '#E0A100', 'Start the renewal'], needs_review: ['Needs review', 'var(--navy2)', 'Registration details not captured'], inactive: ['Inactive', 'var(--muted)', ''], unknown: ['No registrations', 'var(--muted)', 'Add one or mark inactive'], active: ['Active', 'var(--ok)', 'Registered; check documents'] };
  const pill = s => { const [c, l] = PILL[s] || PILL.unknown; return `<span class="badge ${c}">${l}</span>`; };
  /* "Mixed" says nothing on its own: name the registrations that need action instead */
  const stPill = id => {
    const s = status(id); if (s !== 'mixed') return pill(s);
    const st = regsFor(id).map(risk), n = k => st.filter(x => k.includes(x)).length;
    const [c, l] = n(['expired']) ? ['b-bad', `${n(['expired'])} expired`] : n(['due_30', 'due_60']) ? ['b-warn', `${n(['due_30', 'due_60'])} due soon`]
      : n(['pending']) ? ['b-warn', `${n(['pending'])} to capture`] : ['b-warn', `${n(['inactive'])} inactive`];
    const pc = n(['pending']), more = pc && !/to capture/.test(l) ? ` +${pc} to capture` : '';
    return `<span class="badge ${c}" title="${st.length} registrations, not all active${pc ? ` · ${pc} not captured yet` : ''}">${l}${more}</span>`;
  };
  const RISK = { expired: ['b-bad', d => `Expired ${Math.abs(d)}d ago`], due_30: ['b-bad', d => `Due in ${d}d`], due_60: ['b-warn', d => `Due in ${d}d`], pending: ['b-n', () => 'Not captured'], inactive: ['b-bad', () => 'Inactive'], active: ['b-ok', () => 'Active'] };
  const riskBadge = r => { const k = risk(r), [c, f] = RISK[k]; return `<span class="badge ${c}">${f(days(r))}</span>`; };
  const roles = id => [...new Set(regsFor(id).flatMap(r => r.roles?.length ? r.roles : r.role ? [r.role] : []))];
  const rolesOf = a => { const r = roles(a.id); return r.length ? r : a.role ? [a.role] : []; };
  const setas = id => [...new Set(regsFor(id).map(r => r.seta_name).filter(s => s && s !== 'N/A' && s !== 'Pending Entry'))];
  // latest current row per type (a non-admin re-upload adds a newer version without retiring the old row)
  const cur = (id, t) => S.D.filter(d => d.assessor_id === id && d.doc_type === t && d.is_current !== false).sort((x, y) => (y.version || 1) - (x.version || 1))[0];
  const onFile = id => TYPES.filter(t => { const c = cur(id, t); return c && c.status !== 'Missing'; });
  const fu = (type, sid) => S.F.find(f => f.source_type === type && f.source_id === sid);
  const openFU = id => S.F.filter(f => f.assessor_id === id && !CLOSED.includes(f.status));
  const mineFU = id => openFU(id).filter(f => f.status === 'In Progress' && me() && f.assigned_to === me());
  const nextExp = id => regsFor(id).filter(r => r.registration_expiry_date).sort((x, y) => days(x) - days(y))[0];
  const scopeOf = rid => S.SC.filter(s => s.registration_id === rid);
  const qual = qid => S.Q.find(q => q.id === qid);

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

  /* ---------- completeness: four checks, same gaps as live's v_fam_completeness ---------- */
  function compl(id) {
    const regs = regsFor(id).length, docs = onFile(id).length, open = openFU(id).length;
    const missExp = S.D.filter(d => d.assessor_id === id && d.is_current !== false && (d.status === 'Missing' || (d.expiry_date && d.expiry_date < today()))).length;
        const checks = [[regs > 0, 'no registration'], [docs > 0, 'no documents'], [!missExp, `${missExp} missing/expired doc${missExp === 1 ? '' : 's'}`], [!open, `${open} open follow-up${open === 1 ? '' : 's'}`]];
    const gaps = checks.filter(c => !c[0]).map(c => c[1]);
    return { score: Math.round(checks.filter(c => c[0]).length / checks.length * 100), gaps, complete: !gaps.length };
  }
  const complHtml = id => { const c = compl(id); return c.complete ? '<div class="famok">✓ Profile complete</div>' : `<div class="sub famgap">${e(c.gaps.join(' · '))}</div>`; };

  /* ---------- KPIs (click to filter) ---------- */
  const SETAS = ['ETDP SETA', 'MICT SETA', 'Services SETA', 'AgriSETA', 'BANKSETA', 'CHIETA', 'FASSET', 'HWSETA', 'INSETA', 'LGSETA', 'MERSETA', 'PSETA', 'QCTO', 'TETA', 'W&RSETA'], SETAK = Object.fromEntries(SETAS.map(x => [x.toLowerCase().replace(/[^a-z&]/g, ''), x]));
  const isTest = a => /^\s*\[TEST\]/i.test(a.full_name || '');
  const shownName = a => (a.full_name || '').replace(/^\s*\[TEST\]\s*/i, '');
  const vis = () => S.hideTest ? S.A.filter(a => !isTest(a)) : S.A;
  const visR = () => { const ids = new Set(vis().map(a => a.id)); return S.R.filter(r => ids.has(r.assessor_id)); };
  const allRisks = () => visR().map(risk);
  const KPIS = () => [
    ['active', 'Active', allRisks().filter(s => s === 'active').length, 'var(--ok)'],
    ['expired', 'Expired', allRisks().filter(s => s === 'expired').length, 'var(--bad)'],
    ['due_30', 'Due ≤30 days', allRisks().filter(s => s === 'due_30').length, 'var(--bad)'],
    ['due_60', 'Due 31–60 days', allRisks().filter(s => s === 'due_60').length, 'var(--warn)'],
    ['pending', 'Not captured (regs)', allRisks().filter(s => s === 'pending').length, 'var(--muted)'],
    ['inactive', 'Inactive', allRisks().filter(s => s === 'inactive').length, 'var(--bad)'],
    ['missing', 'No ID / certificate', vis().filter(a => critMiss(a.id)).length, 'var(--bad)'],
    ['followups', 'Open follow-ups', vis().filter(a => openFU(a.id).length > 0).length, 'var(--ink)'],
    ['mine', 'Claimed by me', vis().filter(a => mineFU(a.id).length > 0).length, 'var(--navy2)'],
    ['incomplete', 'Incomplete profiles', vis().filter(a => !compl(a.id).complete).length, 'var(--warn)'],
    ['tidy', 'Data to tidy', vis().filter(a => dataFlags(a).length > 0).length, '#8A5100']];
  const matches = (a, k) => !k ? true : k === 'missing' ? critMiss(a.id) : k === 'followups' ? openFU(a.id).length > 0 : k === 'mine' ? mineFU(a.id).length > 0 : k === 'incomplete' ? !compl(a.id).complete : k === 'tidy' ? dataFlags(a).length > 0 : regsFor(a.id).some(r => risk(r) === k);
  window.famFilter = k => { S.filter = S.filter === k ? '' : k; S.page = 0; render(); };
  window.famDD = (k, v) => { S[k] = v; S.page = 0; renderRows(); };
  window.famSearch = v => { S.q = v.toLowerCase(); S.page = 0; renderRows(); };
  window.famSort = k => { S.sort = { k, dir: S.view !== 'triage' && S.sort.k === k ? -S.sort.dir : 1 }; S.view = 'table'; S.page = 0; renderRows(); };
  const REGK = ['expired', 'due_30', 'due_60', 'active', 'pending', 'inactive'];
  window.famMode = v => { S.view = v; S.page = 0; render(); };
  window.famTest = () => { S.hideTest = !S.hideTest; S.page = 0; S.sel.clear(); render(); };
  window.famPage = d => { S.page = Math.max(0, S.page + d); renderRows(); };
  const OPEN = /^#fam\/open\/\d+$/;
  const panelHash = (id, push) => { try { const u = '#fam/open/' + id; if (location.hash === u) return; push ? history.pushState(null, '', u) : history.replaceState(null, '', u); } catch (_) {} };
  window.famShow = i => { const was = S.open && OPEN.test(location.hash); famSel = i; S.open = true; S.acted = null; renderFam(); if (S.A[i]) panelHash(S.A[i].id, !was); };
  window.famClose = () => { S.open = false; S.acted = null; renderPanel(); if (OPEN.test(location.hash)) { try { history.replaceState(null, '', '#fam'); } catch (_) {} } };
  window.famPTab = t => { S.ptab = t; renderPanel(); };
  window.famOpen = id => { location.hash = 'fam/' + id; };

  /* ---------- list ---------- */
  const SORT = {
    name: a => a.full_name.toLowerCase(),
    expiry: a => { const r = nextExp(a.id); return r ? days(r) : 1e9; },
    docs: a => onFile(a.id).length,
    status: a => RANK[status(a.id)] * 1000 + (100 - compl(a.id).score)
  };
  // triage-only states on top of risk(): active but expiring within 90 days, and expired over a year ago
  const wrisk = r => { const k = risk(r), d = days(r); return k === 'expired' && d < -365 ? 'lapsed' : k === 'active' && d !== null && d <= 90 ? 'due_90' : k; };
  const WRANK = ['expired', 'due_30', 'due_60', 'due_90', 'pending', 'lapsed', 'none', 'active', 'inactive'];
  const WGRP = { expired: ['Expired', 'var(--bad)', 'Renew now'], due_30: ['Due in 30 days', 'var(--bad)', 'Start the renewal'], due_60: ['Due in 31–60 days', '#E0A100', 'Plan the renewal'], due_90: ['Expiring soon · 61–90 days', 'var(--navy2)', 'Renew before it lapses'], lapsed: ['Lapsed over a year', 'var(--muted)', 'Renew or mark inactive'], pending: ['Registration not captured', 'var(--navy2)', 'Details still to enter'], none: ['No registration', 'var(--muted)', 'Add one or mark inactive'], active: ['Active', 'var(--ok)', 'Registered; check documents'], inactive: ['Inactive', 'var(--muted)', ''] };
  const worst = a => { const st = regsFor(a.id).map(wrisk); return st.length ? WRANK.find(k => st.includes(k)) : 'none'; };
  const EXPG = ['expired', 'lapsed', 'due_30', 'due_60', 'due_90'];
  // registrations in the person's worst group, most urgent first
  const inGrp = a => { const w = worst(a); return regsFor(a.id).filter(r => wrisk(r) === w).sort((x, y) => (days(x) ?? 1e9) - (days(y) ?? 1e9)); };
  const urg = a => EXPG.includes(worst(a)) ? (days(inGrp(a)[0]) ?? 1e9) : onFile(a.id).length;
  function when(a) {
    const w = worst(a);
    if (w === 'none') return ['No registration', 'color:var(--muted)'];
    if (w === 'inactive') return ['Inactive', 'color:var(--muted)'];
    if (w === 'pending') return ['Not captured', 'color:var(--navy2);font-weight:600'];
    const r = EXPG.includes(w) ? inGrp(a)[0] : nextExp(a.id);
    if (!r || days(r) === null) return ['No expiry on record', 'color:#8A5100;font-weight:600'];
    const d = days(r), on = ` · ${fmt(r.registration_expiry_date)}`;
    if (d < 0) return [`Expired ${-d} days ago${on}`, `color:${w === 'lapsed' ? 'var(--muted)' : 'var(--bad)'};font-weight:700`];
    if (d <= 90) return [`${d} days left${on}`, `color:${d <= 30 ? 'var(--bad)' : d <= 60 ? '#8A5100' : 'var(--navy2)'};font-weight:700`];
    return [fmt(r.registration_expiry_date), ''];
  }
  function rowAction(a) {
    if (!canWrite()) return '';
    const w = worst(a), g = inGrp(a), miss = TYPES.length - onFile(a.id).length;
    if (EXPG.includes(w)) return 'Renew ' + String(g[0]?.seta_name || '').replace(/\s+SETA$/i, '') + (g.length > 1 ? ` +${g.length - 1}` : '');
    if (w === 'pending') return 'Capture registration';
    if (w === 'none') return 'Add registration';
    if (w === 'inactive') return 'Review';
    return miss ? `Request ${miss} doc${miss > 1 ? 's' : ''}` : '';
  }
  function rows() {
    const k = SORT[S.sort.k] || SORT.name, q = S.q;
    const hit = a => !q || [a.full_name, a.id_number || '', rolesOf(a).join(' '), regsFor(a.id).map(r => r.seta_name || '').join(' ')].join(' ').toLowerCase().includes(q);
    const dd = a => (!S.fRole || rolesOf(a).includes(S.fRole)) && (!S.fSt || worst(a) === S.fSt) && (!S.fSeta || regsFor(a.id).some(r => (r.seta_name || '').split(/\s*,\s*/).includes(S.fSeta)));
    const list = S.A.map((a, i) => [a, i]).filter(([a]) => (!S.hideTest || !isTest(a)) && matches(a, S.filter) && hit(a) && dd(a));
    if (S.view === 'triage') return list.sort(([x], [y]) => WRANK.indexOf(worst(x)) - WRANK.indexOf(worst(y)) || urg(x) - urg(y) || dataFlags(y).length - dataFlags(x).length || x.full_name.localeCompare(y.full_name));
    return list.sort(([x], [y]) => { const p = k(x), r = k(y); return (p < r ? -1 : p > r ? 1 : 0) * S.sort.dir; });
  }
  window.famClearAll = () => { S.filter = ''; S.q = ''; S.fRole = S.fSt = S.fSeta = ''; document.querySelectorAll('.famdd').forEach(x => { x.value = ''; }); S.page = 0; const i = $('famq'); if (i) i.value = ''; render(); };
  window.famMove = d => { const ids = rows().filter(([a]) => S.view !== 'triage' || !S.col.has(worst(a))).map(([, i]) => i); if (!ids.length) return; const p = ids.indexOf(famSel); famSel = ids[p < 0 ? 0 : (p + d + ids.length) % ids.length]; S.acted = null; renderFam(); if (S.open && S.A[famSel]) panelHash(S.A[famSel].id, false); };
  const PER = 50;
  const th = (k, l) => { const on = S.view !== 'triage' && S.sort.k === k; return `<th${k ? ` aria-sort="${on ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${k ? `<button class="famth" onclick="famSort('${k}')" title="Sort by this column">${l}${on ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>` : l}</th>`; };
  const RCH = { Facilitator: 'famc-f', Assessor: 'famc-a', Moderator: 'famc-m' };
  const roleChips = a => { const r = rolesOf(a); return r.length ? `<div class="famchips">${r.map(x => `<span class="famchip ${RCH[x] || ''}">${e(x)}</span>`).join('')}</div>` : '<div class="sub">No role yet</div>'; };
  const setaChips = list => list.length ? `<div class="famchips">${list.map(x => `<span class="famchip famc-s">${e(x)}</span>`).join('')}</div>` : '<span class="sub">—</span>';
  const RCLS = { expired: 'famc-bad', lapsed: 'famc-bad', due_30: 'famc-bad', due_60: 'famc-warn', due_90: 'famc-warn', active: 'famc-ok', inactive: 'famc-s', pending: 'famc-nc' };
  const RTXT = { expired: 'expired', lapsed: 'expired over a year ago', due_30: 'due within 30 days', due_60: 'due within 60 days', due_90: 'due within 90 days', active: 'active', inactive: 'inactive', pending: 'details not captured' };
  function regChips(a) {
    const m = new Map();
    regsFor(a.id).forEach(r => { const k = wrisk(r), n = r.seta_name === 'Pending Entry' || (!r.seta_name && k === 'pending') ? 'SETA not captured' : r.seta_name === 'N/A' || !r.seta_name ? 'SETA not named' : r.seta_name, o = m.get(n);
      if (!o || WRANK.indexOf(k) < WRANK.indexOf(o.k)) m.set(n, { k, r }); });
    if (!m.size) return '';
    return `<div class="famchips">${[...m].sort(([, x], [, y]) => WRANK.indexOf(x.k) - WRANK.indexOf(y.k) || (days(x.r) ?? 1e9) - (days(y.r) ?? 1e9)).map(([n, { k, r }]) => `<span class="famchip ${n === 'SETA not captured' ? 'famc-nc' : RCLS[k]}" title="${n === 'SETA not captured' ? 'Registration added; SETA and expiry date still to be entered' : `${e(n)}: ${RTXT[k]}${r.registration_expiry_date ? ' · expires ' + fmt(r.registration_expiry_date) : ''}`}">${e(n)}</span>`).join('')}</div>`;
  }
  const docTip = a => { const have = onFile(a.id), miss = TYPES.filter(t => !have.includes(t)).map(lbl), c = compl(a.id);
    return `Documents on file: ${have.length} of 6. ${miss.length ? 'Missing: ' + miss.join(', ') + '.' : 'All on file.'} Profile checks: ${c.complete ? 'complete' : c.gaps.join(', ')}.`; };
  function ddSync() {
    const sel = $('famdd-seta'); if (!sel || document.activeElement === sel) return;
    const all = [...new Set(S.R.flatMap(r => (r.seta_name || '').split(/\s*,\s*/)).filter(x => x && x !== 'N/A' && x !== 'Pending Entry'))].sort();
    sel.innerHTML = '<option value="">All SETAs</option>' + all.map(x => `<option ${x === S.fSeta ? 'selected' : ''}>${e(x)}</option>`).join('');
  }
  function renderRows() {
    saveF();
    const all = rows(), cw = canWrite(), tri = S.view === 'triage', pages = tri ? 1 : Math.max(1, Math.ceil(all.length / PER));
    if (S.page >= pages) S.page = pages - 1; ddSync();
    const list = tri ? all : all.slice(S.page * PER, S.page * PER + PER);
    const meter = a => { const k = onFile(a.id).length, c = k === 6 ? 'var(--ok)' : k >= 3 ? '#E0A100' : 'var(--bad)'; return `<span class="bar" style="width:56px"><i style="width:${Math.round(k / 6 * 100)}%;background:${c}"></i></span> <span class="sub">${k === 6 ? 'All docs on file' : (m => `Missing ${m.slice(0, 2).join(', ')}${m.length > 2 ? ` +${m.length - 2}` : ''}`)(TYPES.filter(t => !onFile(a.id).includes(t)).map(lbl))}</span>`; };
    const ini = a => e(shownName(a).split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?');
    const who = (a, btn) => `<div class="famwho"><span class="famav" aria-hidden="true">${ini(a)}</span><div>${btn}${flag(a)}${mineFU(a.id).length ? '<span class="famb famb-m">Claimed by me</span>' : openFU(a.id).length ? '<span class="famb">Follow-up open</span>' : ''}${a.id_number ? '' : '<div class="famnoid famidl">ID not captured</div>'}${roleChips(a)}</div></div>`;
    const tag = a => isTest(a) ? '<span class="famtag">TEST</span>' : '';
    const flag = a => { const n = dataFlags(a).length; return n ? `<span class="famflag" title="Data to tidy: ${e(dataFlags(a).join('; '))}">⚑ ${n}</span>` : ''; };
    const empty = c => `<tr><td colspan="${c}" class="sub" style="padding:20px">No practitioners match${S.filter || S.q || S.fRole || S.fSt || S.fSeta ? '. <a href="#" onclick="famClearAll();return false">Clear filters</a>' : '.'}</td></tr>`;
    $('famv-t').hidden = tri;
    $('famtest').textContent = S.hideTest ? 'Show test records' : 'Hide test records';
    if (tri) {
      $('famhead').innerHTML = `<tr>${th('name', 'Practitioner')}${th('expiry', 'Registrations')}${th('docs', 'Documents')}<th class="sub" style="text-align:right;font-weight:400" title="Rows are sorted by urgency">Actions</th></tr>`;
      const cnt = WRANK.map(g => [g, all.filter(([b]) => worst(b) === g).length]).filter(([, c]) => c);
      const sum = cnt.length ? `<tr class="famsum"><td colspan="4"><button class="famsc${S.col.size ? '' : ' on'}" onclick="famCol()" aria-pressed="${!S.col.size}" title="Open every group">All practitioners <b>${all.length}</b></button>${cnt.map(([g, c]) => `<button class="famsc${['lapsed', 'none', 'active', 'inactive'].includes(g) ? ' q' : ''}" onclick="famJump('${g}')"><span class="famgd" style="background:${WGRP[g][1]}"></span>${WGRP[g][0]} <b title="${c} ${c === 1 ? 'person' : 'people'}">${c}</b></button>`).join('')}${[['due_30', 'due_60', 'due_90'].some(g => cnt.some(([x]) => x === g)) ? '' : 'Due soon', cnt.some(([x]) => x === 'inactive') ? '' : 'Inactive'].filter(Boolean).map(l => `<button class="famsc famsc0" disabled title="None right now">${l} <b>0</b></button>`).join('')}<div class="famkey sub"><b>SETA chips:</b>${[['famc-ok', 'Active', '90+ days left'], ['famc-warn', 'Due within 90 days', 'renew'], ['famc-bad', 'Expired', 'past expiry'], ['famc-nc', 'Details not captured', 'number or dates missing'], ['famc-s', 'Inactive', 'not in use']].map(([c, l, m]) => `<span class="famki"><span class="famchip ${c}">${l}</span>${m}</span>`).join('')}</div></td></tr>` : '';
      $('famrows').innerHTML = list.length ? sum + list.map(([a, i], n) => {
        const g = worst(a), mem = n === 0 || worst(list[n - 1][0]) !== g ? all.filter(([b]) => worst(b) === g) : null, w = when(a), act = rowAction(a), shut = S.col.has(g) && !S.q && S.fSt !== g;
        const allOn = mem && mem.every(([b]) => S.sel.has(b.id));
        return (mem ? `<tr class="famgh" id="famg-${g}" style="--g:${WGRP[g][1]}"><td colspan="4"><button class="famgt" onclick="famCol('${g}')" aria-expanded="${!shut}">${shut ? '▸' : '▾'} <span class="famgd" style="background:${WGRP[g][1]}"></span>${WGRP[g][0]}<span class="famgn">${mem.length}</span></button><span class="sub">${WGRP[g][2]}</span>${cw ? `<label class="famgsel sub"><input type="checkbox" onchange="famSelGrp('${g}',this.checked)" ${allOn ? 'checked' : ''}> Select group</label>` : ''}</td></tr>` : '') + (shut ? '' :
          `<tr class="famtr${i === famSel ? ' sel' : ''}" onclick="famShow(${i})">
          <td>${cw ? `<input type="checkbox" class="famck" aria-label="Select ${e(a.full_name)}" onclick="event.stopPropagation()" onchange="famPick(${a.id},this.checked)" ${S.sel.has(a.id) ? 'checked' : ''}>` : ''}${who(a, `<button class="famname" onclick="event.stopPropagation();famShow(${i})" aria-current="${i === famSel}">${tag(a)}${e(shownName(a))}</button>`)}</td>
          <td>${g === 'pending' ? '' : `<div style="${w[1]}">${e(w[0])}${(k => k ? ` <span class="sub famcap" style="font-weight:400">+${k} ${k === 1 ? 'reg' : 'regs'} missing dates</span>` : '')(regsFor(a.id).filter(r => risk(r) === 'pending').length)}</div>`}${regChips(a)}</td>
          <td class="famdocs" style="white-space:nowrap" title="${e(docTip(a))}">${meter(a)}</td>
          <td style="text-align:right;white-space:nowrap">${act ? `<button class="famact${['pending', 'none'].includes(g) ? ' q' : ''}${/^Renew/.test(act) ? ' y' : ''}" onclick="event.stopPropagation();famOpen(${a.id})">${e(act)}</button>` : ''}<details class="famfum famrm" onclick="event.stopPropagation()"><summary class="famdots" aria-label="More actions for ${e(a.full_name)}">⋯</summary><div><button class="btn sm" onclick="famOpen(${a.id})">Quick view</button><button class="btn sm" onclick="location.hash='fam/${a.id}'">Full profile</button>${cw ? `<button class="btn sm" onclick="famReg(${a.id})">Add registration</button><button class="btn sm" onclick="famEdit(${a.id})">Edit details</button>` : ''}<button class="btn sm" onclick="famCopyLink(${a.id})">Copy link</button></div></details></td></tr>`);
      }).join('') : empty(4);
      finishRows(all, list, pages);
      return;
    }
    $('famhead').innerHTML = `<tr>${cw ? `<th style="width:28px"><input type="checkbox" aria-label="Select all shown" onchange="famSelAll(this.checked)" ${all.length && all.every(([a]) => S.sel.has(a.id)) ? 'checked' : ''}></th>` : ''}${th('name', 'Practitioner')}<th>SETA coverage</th>${th('expiry', 'Next expiry')}${th('docs', 'Documents')}${th('status', 'Status')}<th>Next action</th></tr>`;
    $('famrows').innerHTML = list.length ? list.map(([a, i]) => {
      const k = onFile(a.id).length, c = k === 6 ? 'var(--ok)' : k >= 3 ? '#E0A100' : 'var(--bad)', st = setas(a.id), nx = nextExp(a.id);
      return `<tr class="${i === famSel ? 'sel' : ''}">${cw ? `<td><input type="checkbox" aria-label="Select ${e(a.full_name)}" onchange="famPick(${a.id},this.checked)" ${S.sel.has(a.id) ? 'checked' : ''}></td>` : ''}
        <td>${who(a, `<button class="famname" onclick="famShow(${i})">${tag(a)}${e(shownName(a))}</button>`)}</td>
        <td>${setaChips(st)}</td>
        <td style="white-space:nowrap">${nx ? `${fmt(nx.registration_expiry_date)}<div>${riskBadge(nx)}</div>` : '<span class="sub">—</span>'}</td>
        <td style="white-space:nowrap" title="${e(docTip(a))}"><span class="bar"><i style="width:${Math.round(k / 6 * 100)}%;background:${c}"></i></span> <span class="sub">${k}/6</span></td>
        <td>${stPill(a.id)}${complHtml(a.id)}</td><td class="sub">${e(nextAction(a))}</td></tr>`;
    }).join('') : empty(cw ? 7 : 6);
    finishRows(all, list, pages);
  }
  function finishRows(all, list, pages) {
    let nc;
    const fil = S.filter || S.q || S.fRole || S.fSt || S.fSeta;
    $('famcount').textContent = fil ? `${all.length} of ${vis().length} practitioners match${S.hideTest ? ' · test records hidden' : ''}` : '';
    $('famasof').textContent = ''; $('famcount').parentElement.hidden = !fil;
    $('famrows').closest('section').title = S.loadedAt ? `Data loaded ${S.loadedAt} · ↑ ↓ to move between practitioners` : '';
    $('fampage').innerHTML = S.view === 'triage' ? `<span class="sub" style="flex-grow:1">${(nc = [...S.col].filter(g => all.some(([b]) => worst(b) === g)).length) ? `${nc} group${nc > 1 ? 's' : ''} collapsed · <a href="#" onclick="famCol();return false">Expand all</a>` : 'Click a group heading to collapse it'}</span>` : `<span class="sub" style="flex-grow:1">Showing ${all.length ? S.page * PER + 1 : 0}–${S.page * PER + list.length} of ${all.length} · ${PER} per page</span>
      <button class="btn sm" onclick="famPage(-1)" ${S.page ? '' : 'disabled'} aria-label="Previous page">‹</button><span class="sub">Page ${S.page + 1} of ${pages}</span>
      <button class="btn sm" onclick="famPage(1)" ${S.page < pages - 1 ? '' : 'disabled'} aria-label="Next page">›</button>`;
    renderBulk();
  }

  /* ---------- 90-day expiry strip ---------- */
  function renderStrip() {
    const regs = visR().filter(r => r.registration_expiry_date && days(r) <= 90).sort((x, y) => days(x) - days(y));
    const soon = regs.filter(r => days(r) >= 0);
    const who = r => S.A.find(a => a.id === r.assessor_id)?.full_name || 'Unknown';
    const dot = r => { const d = days(r), c = d <= 30 ? 'var(--bad)' : d <= 60 ? '#E0A100' : 'var(--navy2)';
      return `<button class="famdot" style="left:${Math.min(100, d / 90 * 100)}%;background:${c}" title="${e(who(r))} · ${e(r.seta_name)} · in ${d}d" aria-label="${e(who(r))}, ${e(r.seta_name)}, expires in ${d} days" onclick="famOpen(${r.assessor_id})"></button>`; };
    $('famstrip').classList.toggle('famstrip0', !soon.length);
    if (!soon.length) { $('famstrip').innerHTML = '<span class="sub"><b style="color:var(--ink)">Expiries in the next 90 days:</b> nothing due.</span>'; return; }
    $('famstrip').innerHTML = `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 style="font-size:15px;flex-grow:1">Expiries in the next 90 days</h2>
        <span class="sub">${soon.length} due</span></div>
      <div class="famtrack">${soon.map(dot).join('')}</div>
      <div class="famticks"><span>Today</span><span>30d</span><span>60d</span><span>90d</span></div>
      ${soon.length ? `<div class="famnext">${soon.slice(0, 4).map(r => `<a href="#fam/${r.assessor_id}">${e(who(r))}</a> <span class="sub">${e(r.seta_name)} · ${fmt(r.registration_expiry_date)}</span>`).join('<span class="sub"> · </span>')}${soon.length > 4 ? `<span class="sub"> +${soon.length - 4} more</span>` : ''}</div>` : '<div class="sub">Nothing due in the next 90 days.</div>'}`;
  }

  /* ---------- selection, bulk follow-ups, export ---------- */
  window.famPick = (id, on) => { on ? S.sel.add(id) : S.sel.delete(id); renderBulk(); };
  window.famSelAll = on => { rows().forEach(([a]) => on ? S.sel.add(a.id) : S.sel.delete(a.id)); renderRows(); };
  function renderBulk() {
    const n = S.sel.size, box = $('fambulk'); if (!box) return;
    box.hidden = !n || !canWrite();
    if (box.hidden) return;
    const open = S.F.filter(f => S.sel.has(f.assessor_id) && !CLOSED.includes(f.status)).length;
    box.innerHTML = `<b>${n} selected</b><span class="sub">${open} open follow-up${open === 1 ? '' : 's'}</span>
      <button class="btn sm" onclick="famBulk('claim')" ${open ? '' : 'disabled'}>Claim follow-ups</button><button class="btn sm" onclick="famBulk('dismiss')" ${open ? '' : 'disabled'}>Dismiss follow-ups</button>
      <button class="btn sm" onclick="famExport(true)">Export selected</button><button class="btn sm" onclick="famMail()" title="Opens your mail app with the selected practitioners in Bcc; nothing is sent until you send it">Email selected</button><button class="btn sm" onclick="famClearSel()">Clear</button>`;
  }
  window.famJump = g => { S.col.delete(g); renderRows(); $('famg-' + g)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); };
  window.famCol = g => { if (!g) S.col.clear(); else S.col.has(g) ? S.col.delete(g) : S.col.add(g); renderRows(); };
  window.famSelGrp = (g, on) => { rows().forEach(([a]) => { if (worst(a) === g) on ? S.sel.add(a.id) : S.sel.delete(a.id); }); renderRows(); };
  window.famMail = () => { const sel = S.A.filter(a => S.sel.has(a.id)), ok = sel.filter(a => a.email), no = sel.filter(a => !a.email);
    if (!ok.length) return say('None of the selected practitioners has an email address');
    modal('Email preview', `<div class="sub">Bcc (${ok.length}): ${ok.map(a => e(a.name || a.email)).join(', ')}</div>
      ${no.length ? `<div class="sub" style="color:var(--bad)">Left out, no email address (${no.length}): ${no.map(a => e(a.name || '')).join(', ')}</div>` : ''}
      <label>Subject<input name="subj" value="Your SETA registration and documents"></label>
      <label>Message<textarea name="body" rows="5">Hi,\n\nPlease send us your updated SETA registration and outstanding documents.\n\nThank you</textarea></label>
      <div class="sub">This opens your mail app. Nothing is sent until you send it there.</div>`, () => {});
    $('famsave').textContent = 'Open in mail app';
    $('famform').onsubmit = ev => { ev.preventDefault(); const f = $('famform').elements;
      const url = 'mailto:?bcc=' + encodeURIComponent(ok.map(a => a.email).join(',')) + '&subject=' + encodeURIComponent(f.subj.value) + '&body=' + encodeURIComponent(f.body.value);
      close(); location.href = url; }; };
  window.famClearSel = () => { S.sel.clear(); renderRows(); };
  window.famBulk = async act => {
    const list = S.F.filter(f => S.sel.has(f.assessor_id) && !CLOSED.includes(f.status));
    if (!list.length) return say('No open follow-ups for the selection');
    let extra = {};
    if (act === 'dismiss') { const n = prompt(`Reason for dismissing ${list.length} follow-up${list.length > 1 ? 's' : ''}:`, ''); if (n === null) return; extra = { notes: n || null }; }
    const now = new Date().toISOString();
    const fields = act === 'claim' ? { status: 'In Progress', assigned_to: me() } : { status: 'Dismissed', resolved_at: now, resolved_by: me() };
    const up = list.map(f => ({ tenant_id: P.tenant, assessor_id: f.assessor_id, source_type: f.source_type, source_id: f.source_id, kind: f.kind, created_by: f.created_by || me(), notes: f.notes ?? null, ...fields, ...(extra.notes !== undefined && extra.notes !== null ? extra : {}) }));
    try {
      await write('Follow-up', () => sb.from('fam_follow_ups').upsert(up, { onConflict: 'tenant_id,assessor_id,source_type,source_id' }));
      say(`${up.length} follow-up${up.length > 1 ? 's' : ''} ${act === 'claim' ? 'claimed' : 'dismissed'}`); await load();
    } catch (err) { /* write() already showed it */ }
  };
  window.famExport = onlySel => {
    if (!window.XLSX) return say('Excel export is still loading. Try again in a moment.');
    const list = onlySel ? S.A.filter(a => S.sel.has(a.id)) : rows().map(([a]) => a);
    if (!list.length) return say('Nothing to export');
    const ppl = list.map(a => { const nx = nextExp(a.id), c = compl(a.id);
      return { Practitioner: a.full_name, Roles: rolesOf(a).join(', '), Email: a.email || '', Phone: a.phone || '', 'SETA coverage': setas(a.id).join(', '), Registrations: regsFor(a.id).length,
        'Next expiry': nx?.registration_expiry_date || '', 'Days to expiry': nx ? days(nx) : '', Status: (PILL[status(a.id)] || PILL.unknown)[1], 'Documents on file': `${onFile(a.id).length}/6`,
        'Documents missing': TYPES.filter(t => !onFile(a.id).includes(t)).map(lbl).join(', '), 'Completeness %': c.score, Gaps: c.gaps.join('; '), 'Open follow-ups': openFU(a.id).length, 'Next action': nextAction(a) }; });
    const ids = new Set(list.map(a => a.id));
    const regs = S.R.filter(r => ids.has(r.assessor_id)).map(r => ({ Practitioner: S.A.find(a => a.id === r.assessor_id)?.full_name || '', SETA: r.seta_name || '', Roles: (r.roles?.length ? r.roles : [r.role]).filter(Boolean).join(', '),
      'Registration number': r.registration_number || '', Expiry: r.registration_expiry_date || '', 'Days to expiry': days(r) ?? '', Risk: risk(r).replace('_', ' '), Status: r.status || 'Active',
      Scope: scopeOf(r.id).map(s => qual(s.qualification_id)?.name || s.qualifications?.name || s.qualification_id).join('; ') }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ppl), 'Practitioners');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regs.length ? regs : [{ Practitioner: 'No registrations' }]), 'Registrations');
    XLSX.writeFile(wb, `FAM-registry-${today()}${onlySel ? '-selected' : S.filter ? '-' + S.filter : ''}.xlsx`);
    say(`Exported ${list.length} practitioner${list.length > 1 ? 's' : ''}`);
  };

  /* ---------- shared blocks (panel + profile) ---------- */
  function fuControls(type, sid, aid, kind) {
    if (!canWrite()) return '';
    const f = fu(type, sid), st = f?.status || 'Open';
    const who = f?.assigned_to ? ` · ${e(f.assigned_to)}` : '';
    const b = (fn, l) => `<button class="btn sm" onclick="famFU('${fn}','${type}',${sid},${aid},'${kind}')">${l}</button>`;
    return `<div class="famfu"><span class="sub">${f ? e(st) + who : 'No follow-up'}${f?.notes ? ' — ' + e(f.notes) : ''}</span>
      <details class="famfum"><summary class="btn sm" aria-label="Follow-up actions">…</summary><div>${st === 'Dismissed' ? b('reopen', 'Reopen') : (st !== 'In Progress' ? b('claim', 'Claim') : '') + b('note', 'Note') + b('dismiss', 'Dismiss')}</div></details></div>`;
  }
  function regBlock(a, withScope) {
    const regs = regsFor(a.id);
    return regs.length ? regs.map(r => {
      const k = risk(r), flag = ['expired', 'due_30', 'due_60', 'pending'].includes(k), sc = scopeOf(r.id);
      const scope = !withScope ? '' : `<div class="famscope"><span class="sub">Scope:</span> ${sc.length ? sc.map(s => `<span class="badge b-n">${e(qual(s.qualification_id)?.name || s.qualifications?.name || s.qualification_id)}</span>`).join(' ') : '<span class="sub">No qualifications linked</span>'}
        ${canWrite() ? `<button class="btn sm" onclick="famScope(${r.id})">+ Scope</button>` : ''}</div>`;
      return `<div class="famreg"><div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="flex-grow:1">${e(r.seta_name)}</b>${riskBadge(r)}</div>
        <div class="sub">${e((r.roles?.length ? r.roles : [r.role]).join(', '))} · No. ${e(r.registration_number || '—')} · Expires ${fmt(r.registration_expiry_date)}</div>
        ${scope}${flag ? fuControls('registration', r.id, a.id, k) : ''}</div>`;
    }).join('') : '<div class="sub" style="padding:8px 0">No SETA registrations yet.</div>';
  }
  function docBlock(a) {
    const docs = S.D.filter(d => d.assessor_id === a.id);
    return TYPES.map(t => {
      const c0 = cur(a.id, t), ok = c0 && c0.status !== 'Missing';
      const old = docs.filter(d => d.doc_type === t && d !== c0 && (d.is_current === false || d.version < (c0?.version || 0))).sort((x, y) => (y.version || 0) - (x.version || 0));
      const view = c0?.file_url ? `<a href="#" onclick="famView(${c0.id});return false">View</a>` : ok ? '<span class="sub">No file</span>' : '';
      const act = !canWrite() ? '' : ok ? (isAdm() ? `<a href="#" onclick="famDoc(${a.id},'${t}',${c0.id});return false">Replace</a>` : '') : `<a href="#" style="color:var(--bad)" onclick="famDoc(${a.id},'${t}');return false">Upload</a>`;
      const hist = old.length ? `<a href="#" onclick="famHist('${a.id}:${t}');return false">${old.length} older</a>` : '';
      const histRows = S.hist[a.id + ':' + t] ? old.map(d => `<div class="sub famh">v${d.version || 1} · ${fmt(d.doc_date)} · replaced ${fmt(d.superseded_at)} ${d.file_url ? `<a href="#" onclick="famView(${d.id});return false">View</a>` : ''}</div>`).join('') : '';
      const missFU = c0 && c0.status === 'Missing' ? fuControls('document', c0.id, a.id, 'missing_doc') : '';
      const exp = ok && c0.expiry_date ? ` · expires ${fmt(c0.expiry_date)}` : '';
      return `<div class="chk" style="flex-wrap:wrap"><span class="dot ${ok ? 'b-ok' : 'b-bad'}">${ok ? '✓' : '!'}</span>
        <span style="flex-grow:1" title="${e(HINT[t] || '')}">${e(lbl(t))}${ok ? `<span class="sub"> · ${fmt(c0.doc_date)}${c0.version > 1 ? ' · v' + c0.version : ''}${exp}</span>` : ''}</span>
        <span class="famacts">${view}${act}${hist}</span>${histRows ? `<div style="flex-basis:100%">${histRows}</div>` : ''}${missFU ? `<div style="flex-basis:100%">${missFU}</div>` : ''}</div>`;
    }).join('');
  }

  /* ---------- next step + data to tidy ---------- */
  const normName = s => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  function dataFlags(a) {
    const regs = regsFor(a.id), f = [];
    if (regs.some(r => normName(r.seta_name) === 'n/a')) f.push('SETA saved as "N/A"');
    if (regs.some(r => /,/.test(r.seta_name || ''))) f.push('Two SETAs saved in one registration');
    if (regs.some(r => risk(r) === 'active' && !r.registration_expiry_date)) f.push('Active registration has no expiry date');
    if (S.A.some(b => b.id !== a.id && normName(b.full_name) === normName(a.full_name))) f.push('Possible duplicate: another profile has the same name');
    if (!/\s/.test((a.full_name || '').trim())) f.push('Surname missing');
    return f;
  }
  function nextBox(a) {
    const nx = nextAction(a), fu = openFU(a.id), fl = dataFlags(a);
    return `<div class="famstep"><div class="famnl">Next step</div>
      <div>${e(nx === '—' ? 'Nothing due. Registration and documents are complete.' : nx + '.')}</div>
      ${fu.length ? `<div class="sub">Open follow-up: ${e(KIND[fu[0].kind] || fu[0].kind)} (${e(fu[0].status)})</div>` : ''}
      ${fl.length ? `<div class="famtidy"><b>Data to tidy</b>${fl.map(x => `<div>⚑ ${e(x)}</div>`).join('')}</div>` : ''}</div>`;
  }

  /* ---------- side panel (quick view) ---------- */
  function nextIn(a) {
    const g = S.acted; if (!g || !WGRP[g]) return '';
    const ids = rows().filter(([x]) => worst(x) === g || x.id === a.id).map(([, i]) => i); if (ids.length < 2) return '';
    const n = ids[(ids.indexOf(famSel) + 1) % ids.length]; return `<button class="btn sm" onclick="famNextIn('${g}',${n})">Next in ${e(WGRP[g][0])} →</button>`;
  }
  window.famNextIn = (g, i) => { famShow(i); S.acted = g; renderPanel(); };
  function renderPanel() {
    const a = S.A[famSel] || S.A[0], box = $('fampanel');
    if (!a) { box.innerHTML = '<div style="padding:20px" class="sub">No practitioners yet. Add one to start.</div>'; return; }
    const ids = rows().map(([, i]) => i), pos = ids.indexOf(famSel), hist = S.ptab === 'history';
    const dr = box.parentElement, shut = !S.open || pos < 0;
    const top = ($('pvbanner')?.offsetHeight || 0) + 'px'; dr.style.top = $('fambk').style.top = top;
    dr.classList.toggle('open', !shut); $('fambk').hidden = shut; if (shut) { S.open = false; box.innerHTML = ''; return; }
    const ev = hist ? activity(a) : [];
    box.innerHTML = `<div class="famnav"><span class="sub">${pos >= 0 ? `${pos + 1} of ${ids.length} in this list` : 'Not in the current list'}</span>
        <button class="btn sm" onclick="famMove(-1)" aria-label="Previous practitioner">↑</button><button class="btn sm" onclick="famMove(1)" aria-label="Next practitioner">↓</button><button class="btn sm" onclick="famClose()" aria-label="Close panel">✕</button></div>
      <div class="famhead"><span class="disp" style="font-size:20px">${isTest(a) ? '<span class="famtag" style="background:#3A3994;color:#fff">TEST</span>' : ''}${e(shownName(a))}</span>
        <span style="font-size:13px;color:#D2D1EC">${e(rolesOf(a).join(' · ') || 'No roles yet')}</span>
        <span style="font-size:13px;color:#D2D1EC">${e([a.email, a.phone].filter(Boolean).join(' · ') || 'No contact details')}</span>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">${stPill(a.id)}<button class="btn y sm" onclick="famOpen(${a.id})">Open profile</button>${nextIn(a)}</div></div>
      <div class="famtabs" role="tablist" style="padding:0 20px"><button role="tab" aria-selected="${!hist}" class="${hist ? '' : 'on'}" onclick="famPTab('record')">Record</button><button role="tab" aria-selected="${hist}" class="${hist ? 'on' : ''}" onclick="famPTab('history')">History</button></div>
      ${hist ? `<div style="padding:12px 20px 16px">${ev.length ? ev.map(([t, l]) => `<div class="famev"><span class="sub">${fmt(t)}</span><span>${e(l)}</span></div>`).join('') : '<div class="sub">No changes recorded yet.</div>'}
        <p class="sub" style="margin:10px 0 0;font-size:12px">Built from registrations, documents and follow-ups, newest first.</p></div>` : `${nextBox(a)}
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:18px">
        <div><div style="display:flex;align-items:baseline;margin-bottom:6px"><h2 style="font-size:15px;flex-grow:1">SETA registrations</h2>${canWrite() ? `<button class="btn sm" onclick="famReg(${a.id})">+ Add</button>` : ''}</div>${regBlock(a, false)}</div>
        <div><div style="display:flex;align-items:baseline;margin-bottom:6px"><h2 style="font-size:15px;flex-grow:1">Document checklist</h2><span class="sub">${onFile(a.id).length} of 6 on file</span></div>${docBlock(a)}</div>
        <p class="sub" style="margin:0;font-size:12px;border-top:1px solid var(--line2);padding-top:10px">Personal information (POPIA). Use it only for compliance work and don't share it outside ApexU. ID numbers show only on the full profile.</p>
      </div>`}`;
  }

  /* ---------- profile page ---------- */
  const KIND = { expired: 'Registration expired', due_30: 'Renewal due ≤30 days', due_60: 'Renewal due 31–60 days', pending: 'Registration entry pending', missing_doc: 'Missing document' };
  window.famTab = t => { S.tab = t; renderProfile(); };
  window.famCopyLink = id => { const u = location.href.split('#')[0] + '#fam/' + id; (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => say('Profile link copied'), () => prompt('Copy this link:', u)); };
  function activity(a) {
    const ev = [], regs = regsFor(a.id);
    regs.forEach(r => r.created_at && ev.push([r.created_at, `Registration added: ${r.seta_name}${r.registration_number ? ' (' + r.registration_number + ')' : ''}`]));
    S.D.filter(d => d.assessor_id === a.id).forEach(d => {
      const at = d.uploaded_at || d.created_at;
      if (at) ev.push([at, `${lbl(d.doc_type)} ${d.status === 'Missing' ? 'marked missing' : (d.version > 1 ? 'v' + d.version + ' ' : '') + (d.file_url ? 'uploaded' : 'recorded')}${d.uploaded_by ? ' by ' + d.uploaded_by : ''}`]);
      if (d.superseded_at) ev.push([d.superseded_at, `${lbl(d.doc_type)} v${d.version || 1} replaced`]);
    });
    S.F.filter(f => f.assessor_id === a.id).forEach(f => {
      if (f.created_at) ev.push([f.created_at, `Follow-up opened: ${KIND[f.kind] || f.kind}`]);
      if (f.resolved_at) ev.push([f.resolved_at, `Follow-up ${String(f.status || '').toLowerCase()}${f.resolved_by ? ' by ' + f.resolved_by : ''}`]);
    });
    return ev.sort((x, y) => String(y[0]).localeCompare(String(x[0])));
  }
  function renderProfile() {
    const box = $('famprof'), a = S.A.find(x => x.id === S.prof);
    if (!a) { box.innerHTML = `<a href="#fam" class="famback">← FAM Registry</a><div class="card sub" style="padding:20px">${S.A.length ? 'This practitioner was not found.' : 'Loading…'}</div>`; return; }
    $('heading').textContent = a.full_name; $('crumb').textContent = 'Quality / FAM Registry';
    const c = compl(a.id), regs = regsFor(a.id), fus = S.F.filter(f => f.assessor_id === a.id), open = openFU(a.id).length;
    const kv = (k, v) => `<div><span class="sub">${k}</span><div>${v ? e(v) : '<span class="sub">—</span>'}</div></div>`;
    const tabs = [['overview', 'Overview'], ['regs', `Registrations (${regs.length})`], ['docs', `Documents (${onFile(a.id).length}/6)`], ['fus', `Follow-ups (${open} open)`], ['activity', 'Activity']];
    let body = '';
    if (S.tab === 'overview') {
      const up = regs.filter(r => r.registration_expiry_date).sort((x, y) => days(x) - days(y));
      body = `<div class="famgrid">
        <div class="card"><h2 style="font-size:15px">Next action</h2><p style="font-size:18px;font-weight:600;margin:6px 0">${e(nextAction(a))}</p></div>
        <div class="card"><h2 style="font-size:15px">Completeness · ${c.score}%</h2><span class="bar" style="width:100%;margin:8px 0"><i style="width:${c.score}%;background:${c.complete ? 'var(--ok)' : c.score >= 50 ? '#E0A100' : 'var(--bad)'}"></i></span>
          ${c.complete ? '<div class="famok">✓ Profile complete</div>' : c.gaps.map(g => `<div class="sub">• ${e(g)}</div>`).join('')}</div>
        <div class="card"><h2 style="font-size:15px">Expiries</h2>${up.length ? up.map(r => `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0"><span style="flex-grow:1">${e(r.seta_name)} <span class="sub">${fmt(r.registration_expiry_date)}</span></span>${riskBadge(r)}</div>`).join('') : '<div class="sub">No expiry dates captured.</div>'}</div>
        <div class="card"><h2 style="font-size:15px">Qualifications in scope</h2>${(() => { const qs = [...new Set(regs.flatMap(r => scopeOf(r.id).map(s => qual(s.qualification_id)?.name || s.qualifications?.name || s.qualification_id)))]; return qs.length ? qs.map(q => `<div style="padding:3px 0">${e(q)}</div>`).join('') : '<div class="sub">None linked yet. Add scope on the Registrations tab or use Scope Import.</div>'; })()}</div></div>`;
    } else if (S.tab === 'regs') {
      body = `<div class="card"><div style="display:flex;align-items:baseline;margin-bottom:6px"><h2 style="font-size:15px;flex-grow:1">SETA registrations</h2>${canWrite() ? `<button class="btn sm" onclick="famReg(${a.id})">+ Add registration</button>` : ''}</div>${regBlock(a, true)}</div>`;
    } else if (S.tab === 'docs') {
      body = `<div class="card"><div style="display:flex;align-items:baseline;margin-bottom:6px"><h2 style="font-size:15px;flex-grow:1">Document checklist</h2><span class="sub">${onFile(a.id).length} of 6 on file · hover a name for what it covers</span></div>${docBlock(a)}</div>`;
    } else if (S.tab === 'fus') {
      body = `<div class="card">${fus.length ? fus.map(f => `<div class="famreg"><div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="flex-grow:1">${e(KIND[f.kind] || f.kind)}</b><span class="badge ${CLOSED.includes(f.status) ? 'b-n' : f.status === 'In Progress' ? 'b-warn' : 'b-bad'}">${e(f.status)}</span></div>
          <div class="sub">Opened ${fmt(f.created_at)}${f.assigned_to ? ' · assigned to ' + e(f.assigned_to) : ''}${f.resolved_at ? ' · closed ' + fmt(f.resolved_at) : ''}${f.notes ? ' · ' + e(f.notes) : ''}</div>
          ${fuControls(f.source_type, f.source_id, a.id, f.kind)}</div>`).join('') : '<div class="sub">No follow-ups for this practitioner.</div>'}</div>`;
    } else {
      const ev = activity(a);
      body = `<div class="card">${ev.length ? ev.map(([t, l]) => `<div class="famev"><span class="sub">${fmt(t)}</span><span>${e(l)}</span></div>`).join('') : '<div class="sub">No activity recorded yet.</div>'}</div>`;
    }
    box.innerHTML = `<a href="#fam" class="famback">← FAM Registry</a>
      <section class="card famphead"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start"><div style="flex-grow:1;display:flex;flex-direction:column;gap:4px">
          <span class="disp" style="font-size:24px">${e(a.full_name)}</span><span style="color:#D2D1EC">${e(rolesOf(a).join(' · ') || 'No roles yet')}</span>
          <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">${stPill(a.id)}<span class="famscore">${c.score}% complete</span></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${canWrite() ? `<button class="btn y sm" onclick="famEdit(${a.id})">Edit details</button>` : ''}<button class="btn sm" onclick="famCopyLink(${a.id})">Copy link</button></div></div>
        <div class="famkv">${kv('Email', a.email)}${kv('Phone', a.phone)}${kv('ID number', a.id_number)}${kv('Address', a.physical_address)}</div></section>
      <div class="famtabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'on' : ''}" onclick="famTab('${k}')">${l}</button>`).join('')}</div>
      ${body}`;
  }

  /* ---------- Scope Import ---------- */
  function regLabel(r) {
    const name = S.A.find(a => a.id === r.assessor_id)?.full_name || 'Unknown practitioner';
    const role = (r.roles?.length ? r.roles : [r.role]).filter(Boolean).join(' / ') || 'Role not captured';
    return `${name} · ${r.seta_name || 'Unverified coverage'} · ${role}${r.registration_number ? ' · #' + r.registration_number : ''}${r.status === 'Pending Entry' ? ' · Needs review' : ''}`;
  }
  const qFor = row => S.Q.find(q => String(q.saqa_id || '') === String(row.saqa_id || '') && row.saqa_id) || S.Q.find(q => String(q.name || '').trim().toLowerCase() === String(row.qualification_name || '').trim().toLowerCase());
  function loadCatalogue() {
    if (window.FAM_SCOPE_CATALOGUE) { S.cat = window.FAM_SCOPE_CATALOGUE; return Promise.resolve(); }
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'scope-catalogue.js'; s.onload = () => { S.cat = window.FAM_SCOPE_CATALOGUE || []; ok(); }; s.onerror = no; document.head.appendChild(s); });
  }
  window.famSI = () => renderScope();
  window.famSIReady = () => {
    const checked = [...document.querySelectorAll('.famsi-c:checked')];
    const btn = $('famsi-go'); if (btn) btn.disabled = !checked.length || !checked.every(c => c.closest('tr').querySelector('select').value);
    document.querySelectorAll('#famsi-rows tr').forEach(tr => { const sel = tr.querySelector('select'), p = tr.querySelector('.famsi-p'); if (sel && p && sel.value && p.dataset.ok) { p.textContent = 'Ready to commit'; p.className = 'badge b-ok famsi-p'; } else if (p && p.dataset.ok) { p.textContent = 'Catalogue match'; p.className = 'badge b-n famsi-p'; } });
  };
  function renderScope() {
    const box = $('famprof');
    $('heading').textContent = 'Scope Import'; $('crumb').textContent = 'Quality / FAM Registry';
    if (!S.cat) { box.innerHTML = '<a href="#fam" class="famback">← FAM Registry</a><div class="card sub" style="padding:20px">Loading the qualification catalogue…</div>'; loadCatalogue().then(renderScope, () => say('Could not load the qualification catalogue')); return; }
    const q = S.catQ.toLowerCase(), list = S.cat.filter(r => (!q || Object.values(r).join(' ').toLowerCase().includes(q)) && (!S.catSeta || r.seta === S.catSeta));
    const regs = [...S.R].sort((x, y) => regLabel(x).localeCompare(regLabel(y)));
    const matched = S.cat.filter(qFor).length;
    box.innerHTML = `<a href="#fam" class="famback">← FAM Registry</a>
      <section class="card" style="display:flex;flex-direction:column;gap:10px"><div><h2 style="font-size:17px">Scope Import</h2>
        <p class="sub" style="margin:4px 0 0">Link catalogue qualifications to a practitioner's SETA registration. ${matched} of ${S.cat.length} catalogue rows match a qualification in this database; rows without a match can't be committed yet.</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><input type="search" placeholder="Search qualification, SAQA ID or provider" aria-label="Search catalogue" value="${e(S.catQ)}" oninput="famSIq(this.value)" class="faminput" style="flex:1 1 260px">
          <select aria-label="Filter by SETA" class="faminput" onchange="famSIs(this.value)"><option value="">All SETAs</option>${[...new Set(S.cat.map(r => r.seta))].sort().map(s => `<option ${s === S.catSeta ? 'selected' : ''}>${e(s)}</option>`).join('')}</select>
          <button class="btn y" id="famsi-go" onclick="famSIGo()" disabled>Approve selected</button></div></section>
      <section class="card" style="padding:0"><div class="tw"><table style="min-width:0;width:100%"><thead><tr><th></th><th>Qualification</th><th>SETA</th><th>NQF · credits</th><th>Link to registration</th><th>State</th></tr></thead><tbody id="famsi-rows">
      ${list.slice(0, 100).map(r => { const m = qFor(r);
        return `<tr><td><input type="checkbox" class="famsi-c" data-saqa="${e(r.saqa_id)}" data-title="${e(r.qualification_name)}" onchange="famSIReady()" ${m && canWrite() ? '' : 'disabled'} aria-label="Select ${e(r.qualification_name)}"></td>
          <td><b>${e(r.qualification_name)}</b><div class="sub">SAQA ${e(r.saqa_id || 'missing')} · ${e(r.company || '')}</div></td><td>${e(r.seta)}</td><td class="sub">NQF ${e(r.nqf_level || '—')} · ${e(r.credits || '—')}</td>
          <td><select class="faminput" style="max-width:280px" onchange="famSIReady()" ${m ? '' : 'disabled'} aria-label="Registration for ${e(r.qualification_name)}"><option value="">Select registration</option>${regs.map(g => `<option value="${g.id}">${e(regLabel(g))}</option>`).join('')}</select></td>
          <td>${m ? '<span class="badge b-n famsi-p" data-ok="1">Catalogue match</span>' : '<span class="badge b-warn famsi-p">Not in qualifications</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="sub" style="padding:20px">No rows match.</td></tr>'}
      </tbody></table></div>${list.length > 100 ? `<div class="sub" style="padding:10px 16px">Showing 100 of ${list.length}. Narrow the search to see more.</div>` : ''}</section>`;
  }
  let siT; window.famSIq = v => { S.catQ = v; clearTimeout(siT); siT = setTimeout(() => { renderScope(); const i = document.querySelector('#famprof input[type=search]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 200); };
  window.famSIs = v => { S.catSeta = v; renderScope(); };
  window.famSIGo = async () => {
    if (!canWrite()) return say('You do not have FAM write access');
    const commits = [], skipped = [];
    document.querySelectorAll('.famsi-c:checked').forEach(c => {
      const rid = Number(c.closest('tr').querySelector('select').value), reg = S.R.find(r => r.id === rid), m = qFor({ saqa_id: c.dataset.saqa, qualification_name: c.dataset.title });
      if (!reg || !m) return skipped.push(c.dataset.title);
      if (scopeOf(rid).some(s => s.qualification_id === m.id) || commits.some(x => x.registration_id === rid && x.qualification_id === m.id)) return skipped.push(c.dataset.title + ' (already linked)');
      commits.push({ tenant_id: P.tenant, registration_id: rid, qualification_id: m.id });
    });
    if (skipped.length) say(`Skipped ${skipped.length}: ${skipped.slice(0, 2).join(', ')}`);
    if (!commits.length) return;
    const btn = $('famsi-go'); btn.disabled = true; btn.textContent = 'Committing…';
    try {
      await write('Scope', () => sb.from('fam_registration_scope').insert(commits));
      try { await sb.from('audit_log').insert({ tenant_id: P.tenant, action: 'SCOPE_IMPORT_COMMIT', table_name: 'fam_registration_scope', record_id: 'bulk', user_name: me(), user_role: (P.roles || []).join(',') || null, changes: { count: commits.length, qualification_ids: commits.map(x => x.qualification_id), registration_ids: commits.map(x => x.registration_id) } }); } catch (_) { /* audit is best-effort */ }
      say(`${commits.length} scope row${commits.length > 1 ? 's' : ''} committed`); await load();
    } catch (err) { btn.disabled = false; btn.textContent = 'Approve selected'; }
  };

  /* ---------- Action queue (#fam/queue): every open item across practitioners, like live's renewal queue ---------- */
  const QRANK = { expired: 0, due_30: 1, missing_doc: 2, due_60: 3, pending: 4 };
  function queueItems() {
    const out = [];
    S.R.forEach(r => { const k = risk(r); if (k in QRANK && k !== 'missing_doc') out.push({ type: 'registration', sid: r.id, aid: r.assessor_id, kind: k, what: `${r.seta_name || 'SETA not captured'}${r.registration_expiry_date ? ' · expires ' + fmt(r.registration_expiry_date) : ''}`, d: days(r) ?? 9999 }); });
    S.A.forEach(a => TYPES.forEach(t => { const c = cur(a.id, t); if (c && c.status === 'Missing') out.push({ type: 'document', sid: c.id, aid: a.id, kind: 'missing_doc', what: lbl(t), d: 9999 }); }));
    return out.map(i => ({ ...i, f: fu(i.type, i.sid), name: S.A.find(a => a.id === i.aid)?.full_name || 'Unknown' }))
      .sort((x, y) => QRANK[x.kind] - QRANK[y.kind] || x.d - y.d || x.name.localeCompare(y.name));
  }
  window.famQ = (k, v) => { S.qf = { ...(S.qf || {}), [k]: v }; renderQueue(); };
  function renderQueue() {
    const box = $('famprof'), qf = S.qf || {};
    $('heading').textContent = 'Action queue'; $('crumb').textContent = 'Quality / FAM Registry';
    const all = queueItems(), shut = i => i.f && CLOSED.includes(i.f.status);
    const list = all.filter(i => (qf.dis || !shut(i)) && (!qf.kind || i.kind === qf.kind) && (!qf.mine || i.f?.assigned_to === me()));
    const open = all.filter(i => !shut(i)), unclaimed = open.filter(i => i.f?.status !== 'In Progress').length;
    box.innerHTML = `<a href="#fam" class="famback">← FAM Registry</a>
      <section class="card" style="display:flex;flex-direction:column;gap:10px"><div><h2 style="font-size:17px">Action queue</h2>
        <p class="sub" style="margin:4px 0 0">${open.length} open item${open.length === 1 ? '' : 's'} · ${unclaimed} not claimed yet. Expired and due registrations, pending entries and missing documents across all practitioners.</p></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <select class="faminput" aria-label="Filter by issue" onchange="famQ('kind',this.value)"><option value="">All issues</option>${Object.keys(QRANK).map(k => `<option value="${k}" ${qf.kind === k ? 'selected' : ''}>${e(KIND[k])}</option>`).join('')}</select>
          <label class="sub" style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${qf.mine ? 'checked' : ''} onchange="famQ('mine',this.checked)"> Assigned to me</label>
          <label class="sub" style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${qf.dis ? 'checked' : ''} onchange="famQ('dis',this.checked)"> Show dismissed</label></div></section>
      <section class="card" style="padding:0"><div class="tw"><table style="min-width:0;width:100%"><thead><tr><th>Practitioner</th><th>Issue</th><th>Follow-up</th></tr></thead><tbody>
      ${list.map(i => `<tr><td><a href="#fam/${i.aid}"><b>${e(i.name)}</b></a></td>
        <td><span class="badge ${['expired', 'due_30', 'missing_doc'].includes(i.kind) ? 'b-bad' : i.kind === 'due_60' ? 'b-warn' : 'b-n'}">${e(KIND[i.kind])}</span><div class="sub">${e(i.what)}</div></td>
        <td>${canWrite() ? fuControls(i.type, i.sid, i.aid, i.kind) : `<span class="sub">${e(i.f?.status || 'Open')}${i.f?.assigned_to ? ' · ' + e(i.f.assigned_to) : ''}</span>`}</td></tr>`).join('') || '<tr><td colspan="3" class="sub" style="padding:20px">Nothing to action. 🎉</td></tr>'}
      </tbody></table></div></section>`;
  }

  /* ---------- Bulk Intake (#fam/bulk), ported from live: files are read in the browser; nothing is saved until Approve ---------- */
  const BI_SETAS = ['AGRI SETA','BANK SETA','CATHSSETA','CETA','CHIETA','ETDP SETA','EWSETA','FASSET','FP&M SETA','FOODBEV SETA','HWSETA','INSETA','LG SETA','MERSETA','MICT SETA','MQA','PSETA','SASSETA','SERVICES SETA','TETA','W&RSETA','QCTO'];
  const BI_STOP = new Set(['cv','curriculum','vitae','resume','id','copy','certified','certificate','cert','passport','qualification','qualifications','qual','assessor','moderator','facilitator','mba','degree','diploma','updated','final','new','doc','scan','scanned','document','documents','profile','pdf','docx','jpg','png','and','the','of','for','seta']);
  const BI = { rows: [], seq: 0, busy: false, status: '' };
  const biTitle = s => s.replace(/\b([a-z])([a-z]*)/gi, (m, a, b) => a.toUpperCase() + b.toLowerCase());
  const biTok = s => (String(s || '').toLowerCase().match(/[a-zÀ-ɏ]{2,}/g) || []);
  const biLib = {};
  const biLoad = (k, src) => biLib[k] ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete biLib[k]; no(new Error('Could not load the file reader')); }; document.head.appendChild(s); });
  async function biText(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'pdf') {
        await biLoad('pdf', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise, parts = [];
        for (let p = 1; p <= Math.min(pdf.numPages, 6); p++) parts.push((await (await pdf.getPage(p)).getTextContent()).items.map(i => i.str).join(' '));
        return parts.join('\n');
      }
      if (ext === 'docx') {
        await biLoad('zip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        const xml = await (await JSZip.loadAsync(await file.arrayBuffer())).file('word/document.xml')?.async('string');
        return xml ? xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ') : '';
      }
    } catch (err) { console.warn('Bulk intake: could not read', file.name, err.message); }
    return '';
  }
  function biType(name, text) {
    const f = name.toLowerCase(), t = text.slice(0, 3000).toLowerCase();
    if (/passport|\bid\b|id[_\- ]?(copy|doc)|identity/.test(f) || /identity document|republic of south africa.*identity|passport no/.test(t)) return 'ID';
    if (/affidavit/.test(f) || /commissioner of oaths|solemnly (swear|declare)/.test(t)) return 'AFFIDAVIT';
    if (/\bsla\b|service.?level/.test(f) || /service level agreement/.test(t)) return 'SLA';
    if (/\bcv\b|curriculum|vitae|resume/.test(f) || /curriculum vitae|work experience|employment history/.test(t)) return 'CV';
    if (/\bmba\b|degree|diploma|bachelor|master|honours|phd/.test(f) || /(bachelor|master|doctor) of |honours degree|national diploma/.test(t)) return 'Highest Qualification';
    return 'QUAL';
  }
  function biMatch(name, text) {
    const hay = new Set([...biTok(name.replace(/\.[^.]+$/, '')), ...biTok(text.slice(0, 4000))]);
    let best = null, score = 0, tie = false;
    for (const a of S.A) { const t = biTok(a.full_name); if (!t.length || !hay.has(t[t.length - 1])) continue;
      const s = t.filter(x => hay.has(x)).length / t.length; if (s > score) { best = a; score = s; tie = false; } else if (s === score) tie = true; }
    return score >= 0.6 ? { id: best.id, ambiguous: tie } : null;
  }
  function biName(name, text, type) {
    if (type === 'CV') { const l = text.split('\n').map(x => x.trim()).find(x => /^[A-Za-zÀ-ɏ'\-]+( [A-Za-zÀ-ɏ'\-]+){1,3}$/.test(x) && !biTok(x).some(t => BI_STOP.has(t))); if (l) return biTitle(l); }
    const h = text.match(/(?:certif(?:y|ies) that|awarded to|presented to|conferred (?:up)?on)\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){1,3})/); if (h) return biTitle(h[1]);
    return biTitle(name.replace(/\.[^.]+$/, '').split(/[^A-Za-zÀ-ɏ']+/).filter(t => t.length > 1 && !BI_STOP.has(t.toLowerCase())).slice(0, 3).join(' '));
  }
  const biSaId = n => { if (!/^\d{13}$/.test(n)) return false; let s = 0; for (let i = 0; i < 13; i++) { let d = +n[12 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; } return s % 10 === 0; };
  window.famBIAdd = async input => {
    const files = [...(input.files || [])]; input.value = ''; if (!files.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i], ext = (file.name.split('.').pop() || '').toLowerCase(); BI.status = `Reading ${i + 1} of ${files.length}: ${file.name}`; renderBI();
      const r = { key: ++BI.seq, file, include: true, error: '', note: [] };
      if (file.size > MAX) r.error = `Too large (${(file.size / 1048576).toFixed(1)} MB, limit 10 MB)`; else if (!EXT.includes(ext)) r.error = 'Unsupported file type';
      if (r.error) r.include = false;
      const text = r.error ? '' : await biText(file), low = text.slice(0, 20000).toLowerCase();
      r.type = biType(file.name, text); const m = biMatch(file.name, text);
      r.aid = m ? String(m.id) : 'new'; if (m?.ambiguous) r.note.push('Several practitioners match, check the name');
      r.newName = m ? '' : biName(file.name, text, r.type);
      r.roles = r.type === 'ID' ? [] : ['Facilitator', 'Assessor', 'Moderator'].filter(x => new RegExp('\\b' + x.toLowerCase() + '\\b').test(low));
      r.setas = BI_SETAS.filter(s => new RegExp('(^|[^a-z0-9])' + s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '').split('').join('[\\s-]*') + '(?![a-z0-9])').test(low));
      r.regNo = (text.match(/\b[A-Z]{2,6}\/\d{1,4}\/\d{4}\/\d{2,6}\b/) || [])[0] || '';
      r.idNo = r.type === 'ID' ? ((text.match(/\b\d{13}\b/g) || []).find(biSaId) || '') : '';
      r.addReg = r.roles.length > 0;
      if (!text && !r.error) r.note.push('No readable text (scan or image); type and name guessed from the file name');
      if (m && S.D.some(d => String(d.assessor_id) === r.aid && d.is_current !== false && d.file_name === file.name)) { r.note.push('A file with this name is already on file'); r.include = false; }
      BI.rows.push(r);
    }
    const news = BI.rows.filter(r => r.aid === 'new' && r.newName);
    news.forEach(r => { const sur = biTok(r.newName).pop(), lo = news.find(o => o !== r && biTok(o.newName).pop() === sur && o.newName.length > r.newName.length); if (lo) r.newName = lo.newName; });
    BI.status = `${BI.rows.length} file(s) ready for review. Nothing is saved until you approve.`; renderBI();
  };
  window.famBISet = (k, f, v) => { const r = BI.rows.find(x => x.key === k); if (!r) return;
    if (f === 'role') r.roles = r.roles.includes(v) ? r.roles.filter(x => x !== v) : [...r.roles, v]; else r[f] = v;
    if (f === 'aid' || f === 'type') renderBI(); else biBtn(); };
  window.famBIDel = k => { BI.rows = BI.rows.filter(x => x.key !== k); renderBI(); };
  const biChosen = () => BI.rows.filter(r => r.include && !r.error);
  function biBtn() { const b = $('fambi-go'); if (!b) return; const c = biChosen();
    b.disabled = BI.busy || !canWrite() || !c.length || !c.every(r => r.aid !== 'new' || r.newName.trim().length > 2);
    b.textContent = BI.busy ? 'Saving…' : c.length ? `Approve ${c.length} file${c.length > 1 ? 's' : ''}` : 'Approve selected'; }
  function renderBI() {
    const box = $('famprof'); $('heading').textContent = 'Bulk Intake'; $('crumb').textContent = 'Quality / FAM Registry';
    const opts = [...S.A].sort((x, y) => x.full_name.localeCompare(y.full_name));
    box.innerHTML = `<a href="#fam" class="famback" onclick="famBIClear()">← FAM Registry</a>
      <section class="card" style="display:flex;flex-direction:column;gap:10px"><div><h2 style="font-size:17px">Bulk Intake</h2>
        <p class="sub" style="margin:4px 0 0">Files are read in this browser only, and nothing is saved until you approve. Type, practitioner and roles are best guesses: check each row.</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onchange="famBIAdd(this)" aria-label="Choose files" ${canWrite() && !BI.busy ? '' : 'disabled'}>
          <span class="sub" style="flex:1 1 200px" role="status">${e(BI.status)}</span><button class="btn y" id="fambi-go" onclick="famBIGo()" disabled>Approve selected</button></div></section>
      <section class="card" style="padding:0"><div class="tw"><table style="min-width:0;width:100%"><thead><tr><th></th><th>File</th><th>Type</th><th>Practitioner</th><th>Roles</th><th>Found in file</th><th></th></tr></thead><tbody>
      ${BI.rows.map(r => `<tr><td><input type="checkbox" ${r.include ? 'checked' : ''} ${r.error ? 'disabled' : ''} onchange="famBISet(${r.key},'include',this.checked)" aria-label="Include ${e(r.file.name)}"></td>
        <td><b>${e(r.file.name)}</b><div class="sub">${(r.file.size / 1024).toFixed(0)} KB</div>${r.error ? `<div style="color:var(--bad,#c0392b);font-size:12px">${e(r.error)}</div>` : ''}${r.note.map(n => `<div style="color:#b7791f;font-size:12px">${e(n)}</div>`).join('')}</td>
        <td><select class="faminput" onchange="famBISet(${r.key},'type',this.value)">${TYPES.map(t => `<option value="${t}" ${t === r.type ? 'selected' : ''}>${e(lbl(t))}</option>`).join('')}</select></td>
        <td><select class="faminput" onchange="famBISet(${r.key},'aid',this.value)"><option value="new" ${r.aid === 'new' ? 'selected' : ''}>+ New practitioner</option>${opts.map(a => `<option value="${a.id}" ${String(a.id) === r.aid ? 'selected' : ''}>${e(a.full_name)}</option>`).join('')}</select>
          ${r.aid === 'new' ? `<input class="faminput" style="margin-top:4px;width:100%" placeholder="Full name" value="${e(r.newName)}" oninput="famBISet(${r.key},'newName',this.value)">${r.type === 'ID' ? `<input class="faminput" style="margin-top:4px;width:100%" placeholder="ID number (optional)" value="${e(r.idNo)}" oninput="famBISet(${r.key},'idNo',this.value)">` : ''}` : ''}</td>
        <td>${['Facilitator', 'Assessor', 'Moderator'].map(x => `<label style="display:block;font-size:12px"><input type="checkbox" ${r.roles.includes(x) ? 'checked' : ''} onchange="famBISet(${r.key},'role','${x}')"> ${x}</label>`).join('')}
          <label class="sub" style="display:block;font-size:12px;margin-top:4px"><input type="checkbox" ${r.addReg ? 'checked' : ''} onchange="famBISet(${r.key},'addReg',this.checked)"> Add as registration</label></td>
        <td style="font-size:12px">${r.setas.length ? e(r.setas.join(', ')) : '<span class="sub">No SETA found</span>'}${r.regNo ? `<div>Reg no. ${e(r.regNo)}</div>` : ''}</td>
        <td><button class="btn" onclick="famBIDel(${r.key})">Remove</button></td></tr>`).join('') || '<tr><td colspan="7" class="sub" style="padding:20px">Choose files to start: CVs, certificates, IDs and passports (PDF, Word, JPG or PNG, max 10 MB each).</td></tr>'}
      </tbody></table></div></section>`;
    biBtn();
  }
  window.famBIClear = () => { BI.rows = []; BI.status = ''; };
  window.famBIGo = async () => {
    const c = biChosen(); if (!c.length || BI.busy) return;
    try { need(); } catch (err) { return say(err.message); }
    if (c.some(r => r.aid === 'new' && r.newName.trim().length <= 2)) return say('Enter a full name for every new practitioner.');
    BI.busy = true; biBtn();
    const made = {}, done = { practitioners: [], documents: [], registrations: [] }, failed = [], nk = s => s.trim().toLowerCase().replace(/\s+/g, ' ');
    try {
      for (const r of c.filter(x => x.aid === 'new')) { const k = nk(r.newName);
        if (!made[k]) { const idNo = c.find(x => x.aid === 'new' && nk(x.newName) === k && x.idNo)?.idNo || null;
          const [a] = await write('Practitioner', () => sb.from('assessors').insert({ tenant_id: P.tenant, full_name: biTitle(r.newName.trim()), id_number: idNo }).select('id'));
          made[k] = a.id; done.practitioners.push(a.id); }
        r.tid = made[k]; }
      c.forEach(r => { if (r.aid !== 'new') r.tid = Number(r.aid); });
      for (let i = 0; i < c.length; i++) { const r = c[i]; BI.status = `Uploading ${i + 1} of ${c.length}: ${r.file.name}`; $('famprof').querySelector('[role=status]').textContent = BI.status;
        try { const path = `${P.tenant}/${r.tid}/${Date.now()}_${r.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          await write('Upload', () => sb.storage.from('fam-documents').upload(path, r.file, { contentType: r.file.type || undefined }));
          const [d] = await write('Document', () => sb.from('fam_documents').insert({ tenant_id: P.tenant, assessor_id: r.tid, doc_type: r.type, status: 'Current', doc_date: new Date().toISOString().slice(0, 10), is_current: true, version: 1,
            file_url: path, file_name: r.file.name, file_size_bytes: r.file.size, mime_type: r.file.type || null, uploaded_by: me(), uploaded_at: new Date().toISOString() }).select('id'));
          done.documents.push(d.id); r.saved = true; } catch (err) { failed.push(`${r.file.name}: ${err.message}`); } }
      const g = {};
      c.filter(r => r.addReg && r.roles.length).forEach(r => { const x = g[r.tid] ||= { roles: new Set(), setas: new Set(), regNo: '' }; r.roles.forEach(v => x.roles.add(v)); r.setas.forEach(v => x.setas.add(v)); x.regNo ||= r.regNo; });
      for (const [aid, x] of Object.entries(g)) {
        const held = new Set(S.R.filter(r => String(r.assessor_id) === aid && r.status !== 'Inactive').flatMap(r => r.roles?.length ? r.roles : [r.role]));
        const roles = [...x.roles].filter(v => !held.has(v)); if (!roles.length) continue;
        try { const [reg] = await write('Registration', () => sb.from('fam_seta_registrations').insert({ tenant_id: P.tenant, assessor_id: Number(aid), seta_name: x.setas.size ? [...x.setas].join(', ') : 'N/A', role: roles[0], roles, status: 'Active', ...(x.regNo ? { registration_number: x.regNo } : {}) }).select('id'));
          done.registrations.push(reg.id); } catch (err) { failed.push(`Registration for practitioner ${aid}: ${err.message}`); } }
      try { await sb.from('audit_log').insert({ tenant_id: P.tenant, action: 'FAM_BULK_INTAKE_COMMIT', table_name: 'fam_documents', record_id: 'bulk', user_name: me(), user_role: (P.roles || []).join(',') || null,
        changes: { new_practitioner_ids: done.practitioners, document_ids: done.documents, registration_ids: done.registrations, failed: failed.length } }); } catch (err) { console.warn('audit_log:', err.message); }
      BI.rows = BI.rows.filter(r => !r.saved);
      BI.status = failed.length ? `Some files failed and are still listed: ${failed[0]}` : 'All approved files saved.';
      say(`Saved ${done.documents.length} document(s), ${done.practitioners.length} new practitioner(s), ${done.registrations.length} registration(s)${failed.length ? `; ${failed.length} failed` : ''}`);
      await load();
    } catch (err) { say('Bulk intake failed: ' + (err.message || err)); }
    finally { BI.busy = false; if (S.mode === 'bulk') renderBI(); }
  };

  /* ---------- modes ---------- */
  function syncRoute() {
    const h = location.hash.slice(1);
    if (h.split('/')[0] !== 'fam' || !ready) return;
    const arg = h.split('/')[1];
    const mode = arg === 'scope' ? 'scope' : arg === 'bulk' ? 'bulk' : arg === 'queue' ? 'queue' : arg && arg !== 'open' ? 'profile' : 'list';
    if (mode === 'profile' && S.prof !== Number(arg)) S.tab = 'overview';
    S.mode = mode; S.prof = mode === 'profile' ? Number(arg) : null;
    const v = $('view-fam');
    [...v.children].forEach(ch => { ch.hidden = ch.id === 'famprof' ? mode === 'list' : mode !== 'list'; });
    if (mode !== 'list') { S.open = false; $('fambk').hidden = true; }
    if (mode === 'profile') { const i = S.A.findIndex(a => a.id === S.prof); if (i >= 0) famSel = i; renderProfile(); }
    else if (mode === 'scope') renderScope();
    else if (mode === 'bulk') renderBI();
    else if (mode === 'queue') renderQueue();
    else {
      const oi = arg === 'open' ? S.A.findIndex(a => a.id === Number(h.split('/')[2])) : -1;
      if (oi >= 0) { if (!S.open || famSel !== oi) { famSel = oi; S.open = true; renderFam(); } } else if (S.open) { S.open = false; S.acted = null; renderPanel(); }
      $('heading').textContent = 'FAM Registry'; $('crumb').textContent = 'Quality / Facilitators, Assessors & Moderators'; }
  }
  function render() {
    const K = KPIS(), kbtn = ([k, l, v, c]) => `<button class="kpi famk${S.filter === k ? ' on' : ''}" onclick="famFilter('${k}')" aria-pressed="${S.filter === k}" title="${S.filter === k ? 'Click again to clear the filter' : 'Filter the list'}"><span class="l">${l}</span><span class="v" style="color:${v ? c : 'var(--muted)'}">${v}</span></button>`;
    const kgrp = (title, ks, bar) => { const ks2 = K.filter(x => ks.includes(x[0])), tot = ks2.reduce((n, x) => n + x[2], 0);
      return `<div class="famgrp" role="group" aria-label="${title || 'Practitioners'}">${title ? `<div class="famgl">${title}</div>` : ''}${bar && tot ? `<div class="famstack" aria-hidden="true">${ks2.filter(x => x[2]).map(([, l, v, c]) => `<i style="flex:${v};background:${c}" title="${l}: ${v}"></i>`).join('')}</div>` : ''}<div class="famgk">${ks2.filter(x => x[2] || S.filter === x[0]).map(kbtn).join('')}</div>${ks2.some(x => !x[2] && S.filter !== x[0]) ? `<div class="famzero">${ks2.filter(x => !x[2] && S.filter !== x[0]).map(([k, l]) => `<button class="famz" onclick="famFilter('${k}')">${l} <b>0</b></button>`).join('')}</div>` : ''}</div>`; };
    $('famkpis').innerHTML = kgrp(`Registrations · ${visR().length}`, REGK, 1) + kgrp(`Practitioners · ${vis().length}`, ['missing', 'followups', 'mine', 'incomplete', 'tidy']);
    renderStrip(); renderRows(); renderPanel();
    if (S.mode === 'profile') renderProfile(); else if (S.mode === 'scope' && S.cat) renderScope(); else if (S.mode === 'bulk') renderBI(); else if (S.mode === 'queue') renderQueue();
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
  const personForm = (a = {}) => `<div class="qagrid">${fld('full_name', 'Full name *', 'text', `required value="${e(a.full_name)}"`)}<label>Main role<select name="role">${['Facilitator', 'Assessor', 'Moderator'].map(o => `<option ${a.role === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
    ${fld('id_number', 'ID number', 'text', `value="${e(a.id_number)}"`)}${fld('email', 'Email', 'email', `value="${e(a.email)}"`)}${fld('phone', 'Phone', 'tel', `value="${e(a.phone)}"`)}${fld('physical_address', 'Address', 'text', `value="${e(a.physical_address)}"`)}</div>`;
  const personVals = f => ({ full_name: val(f, 'full_name'), role: val(f, 'role'), id_number: val(f, 'id_number'), email: val(f, 'email'), phone: val(f, 'phone'), physical_address: val(f, 'physical_address') });

  window.famAdd = () => modal('Add practitioner', personForm(),
    async f => { need(); const rows = await write('Practitioner', () => sb.from('assessors').insert({ tenant_id: P.tenant, ...personVals(f) }).select('id'));
      say('Practitioner added'); famSel = -1; S.pick = rows?.[0]?.id; });
  window.famEdit = id => { const a = S.A.find(x => x.id === id); if (!a) return;
    modal('Edit practitioner', personForm(a), async f => { need(); await write('Practitioner', () => sb.from('assessors').update(personVals(f)).eq('id', id)); say('Details saved'); }); };

  window.famReg = aid => modal('Add SETA registration', `<div class="qagrid">${fld('seta_name', 'SETA *', 'text', 'required list="famsetas"')}<datalist id="famsetas">${SETAS.map(s => `<option value="${s}">`).join('')}</datalist>
      ${fld('registration_number', 'Registration number')}${fld('registration_expiry_date', 'Expiry date', 'date')}${sel('status', 'Status', ['Active', 'Pending Entry', 'Inactive'])}</div>
      <fieldset style="border:0;padding:0;display:flex;gap:14px;flex-wrap:wrap"><legend class="sub" style="margin-bottom:4px">Roles *</legend>${['Facilitator', 'Assessor', 'Moderator'].map(r => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="r_${r}">${r}</label>`).join('')}</fieldset>`,
    async f => { need(); const rl = ['Facilitator', 'Assessor', 'Moderator'].filter(r => f['r_' + r].checked);
      if (!rl.length) throw new Error('Select at least one role.');
      await write('Registration', () => sb.from('fam_seta_registrations').insert({ tenant_id: P.tenant, assessor_id: aid, seta_name: val(f, 'seta_name'), role: rl[0], roles: rl, registration_number: val(f, 'registration_number'), registration_expiry_date: val(f, 'registration_expiry_date'), status: val(f, 'status') }));
      say('Registration added'); });

  window.famScope = rid => {
    const have = new Set(scopeOf(rid).map(s => s.qualification_id)), opts = S.Q.filter(q => !have.has(q.id));
    if (!opts.length) return say(S.Q.length ? 'Every qualification is already linked' : 'No qualifications in the catalogue yet');
    modal('Add qualification to scope', `<label>Qualification *<select name="qid" required>${opts.map(q => `<option value="${e(q.id)}">${e(q.name)}${q.saqa_id ? ' · SAQA ' + e(q.saqa_id) : ''}</option>`).join('')}</select></label>`,
      async f => { need(); await write('Scope', () => sb.from('fam_registration_scope').insert({ tenant_id: P.tenant, registration_id: rid, qualification_id: f.qid.value })); say('Scope added'); });
  };

  window.famDoc = (aid, type, replaceId) => {
    if (replaceId && !isAdm()) return say('Only admins can replace a document');
    modal(replaceId ? `Replace ${lbl(type)}` : `Add ${lbl(type)}`, `${HINT[type] ? `<p class="sub" style="margin:0">${e(HINT[type])}</p>` : ''}<div class="qagrid">${sel('status', 'Status', ['Current', 'Missing'])}${fld('doc_date', 'Document date', 'date')}${fld('expiry_date', 'Expiry date (if any)', 'date')}</div>
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
  window.famHist = k => { S.hist[k] = !S.hist[k]; S.mode === 'profile' ? renderProfile() : renderPanel(); };
  window.famFU = async (act, type, sid, aid, kind) => {
    const f = fu(type, sid), now = new Date().toISOString();
    let fields;
    if (act === 'claim') fields = { status: 'In Progress', assigned_to: me() };
    else if (act === 'dismiss') fields = { status: 'Dismissed', resolved_at: now, resolved_by: me() };
    else if (act === 'reopen') fields = { status: 'Open', resolved_at: null, resolved_by: null };
    else { const n = prompt('Note for this follow-up:', f?.notes || ''); if (n === null) return; fields = { notes: n, status: f?.status || 'Open' }; }
    try {
      await write('Follow-up', () => sb.from('fam_follow_ups').upsert({ tenant_id: P.tenant, assessor_id: aid, source_type: type, source_id: sid, kind, created_by: f?.created_by || me(), ...fields }, { onConflict: 'tenant_id,assessor_id,source_type,source_id' }));
      S.acted = S.view === 'triage' && S.open ? worst(S.A.find(x => x.id === aid) || {}) : null; say('Follow-up updated'); await load();
    } catch (err) { /* write() already showed it */ }
  };

  /* ---------- data ---------- */
  async function load() {
    const q = async (n, p) => { const { data, error } = await p; if (error) { say('Could not load ' + n + ': ' + error.message); return []; } return data || []; };
    const [A, R, D, F, Q, SC] = await Promise.all([
      q('practitioners', sb.from('assessors').select('id,full_name,role,email,phone,id_number,physical_address').order('full_name')),
      q('registrations', sb.from('fam_seta_registrations').select('*')),
      q('documents', sb.from('fam_documents').select('id,assessor_id,doc_type,status,doc_date,expiry_date,file_url,file_name,is_current,version,superseded_at,created_at,uploaded_at,uploaded_by')),
      q('follow-ups', sb.from('fam_follow_ups').select('*')),
      q('qualifications', sb.from('qualifications').select('id,name,saqa_id,seta').order('name')),
      q('scope', sb.from('fam_registration_scope').select('id,registration_id,qualification_id'))]);
    R.forEach(r => { if (r.seta_name) r.seta_name = r.seta_name.split(/\s*,\s*/).map(x => SETAK[x.toLowerCase().replace(/[^a-z&]/g, '')] || x).join(', '); });
    Object.assign(S, { A, R, D, F, Q, SC, loadedAt: new Date().toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) });
    const ids = new Set(A.map(a => a.id)); [...S.sel].forEach(id => ids.has(id) || S.sel.delete(id));
    if (S.pick) { famSel = A.findIndex(a => a.id === S.pick); S.pick = null; }
    if (famSel < 0 || famSel >= A.length) famSel = 0;
    PEOPLE.length = 0; A.forEach(a => PEOPLE.push([a.full_name, rolesOf(a).join(' · '), onFile(a.id)])); // keeps Ctrl K search in step
    render(); syncRoute();
  }

  /* ---------- one-time layout ---------- */
  let ready = false;
  function setup() {
    if (ready) return; ready = true;
    document.head.insertAdjacentHTML('beforeend', `<style>
      #famkpis{display:flex!important;flex-wrap:wrap;gap:14px 28px;flex:1 1 100%!important;order:2;align-items:flex-start}
      #famkpis+div{margin-left:auto}
      #view-fam .tw{max-height:none!important}
      .famchips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
      .famchip{font-size:11px;line-height:18px;padding:0 8px;border-radius:9px;background:var(--soft);color:var(--ink);white-space:nowrap}
      .famc-f{background:#E3F1E6;color:#1E6B34}.famc-a{background:#E4ECFA;color:#2A4E9B}.famc-m{background:#FBF0D9;color:#8A5100}
      .famc-s{background:transparent;border:1px solid var(--line);color:var(--muted)}
      .famc-bad{background:transparent;border:1px solid var(--bad);color:var(--bad)}.famc-warn{background:transparent;border:1px solid #E0A100;color:#8A5100}.famc-ok{background:transparent;border:1px solid var(--ok);color:var(--ok)}
      .famc-nc{background:transparent;border:1px dashed var(--muted);color:var(--muted);font-style:italic}
      .famnoid{margin-left:8px;font-size:11px;color:#8A5100;white-space:nowrap}.famck{margin:0 8px 0 0;vertical-align:middle}
      .famsum td{padding:4px 0 10px!important;border:0!important}.famsc{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin:0 6px 6px 0;padding:5px 10px;border:1px solid var(--line);border-radius:999px;background:var(--soft);font-size:13px}.famsc.q{opacity:.75}.famsc:hover{border-color:var(--navy2)}.famsc:focus-visible{outline:2px solid var(--navy2);outline-offset:2px}
      .famsc.on{background:var(--navy);color:#fff;border-color:var(--navy)}.famfum{position:relative;display:inline-block}.famfum>summary{list-style:none;cursor:pointer}.famfum>summary::-webkit-details-marker{display:none}.famfum>div{position:absolute;right:0;top:calc(100% + 4px);z-index:5;display:flex;flex-direction:column;gap:4px;padding:6px;background:var(--card,#fff);border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.12)}.famleg{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;margin-top:2px}.famleg .famchip{font-size:11px}.famgt{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.famgt:focus-visible{outline:2px solid var(--navy2);outline-offset:2px}
      .famgsel{float:right;letter-spacing:0;text-transform:none;font-weight:400;cursor:pointer}@media (hover:hover){.famgsel{opacity:0;transition:opacity .15s}.famgh:hover .famgsel,.famgsel:focus-within,.famgsel:has(:checked){opacity:1}}
      @media (prefers-color-scheme:dark){:root:not([data-theme=light]) .famc-f{background:#1E3A26;color:#9FD8AE}:root:not([data-theme=light]) .famc-a{background:#1F2D4D;color:#A9C1F2}:root:not([data-theme=light]) .famc-m{background:#3D2F12;color:#F0CF8A}}
      :root[data-theme=dark] .famc-f{background:#1E3A26;color:#9FD8AE}:root[data-theme=dark] .famc-a{background:#1F2D4D;color:#A9C1F2}:root[data-theme=dark] .famc-m{background:#3D2F12;color:#F0CF8A}
      .famtool select.faminput{flex:0 0 auto;max-width:170px}
      .famgrp{display:flex;flex-direction:column;gap:6px;min-width:0}
      .famgl{font-size:12px;font-weight:700;color:var(--muted)}
      .famgk{display:flex;flex-wrap:wrap;gap:8px}
      .famk{min-width:112px;padding:10px 14px;gap:2px;text-align:left;cursor:pointer;font:inherit;border:1px solid var(--line);outline:none}
      .famk .v{font-size:22px}.famk .l{font-size:12px;white-space:nowrap}
      .famk:focus{outline:none}.famk:focus-visible{outline:3px solid var(--yellow);outline-offset:2px}
      .famk.on{border:2px solid var(--navy);padding:9px 13px;box-shadow:inset 0 -3px 0 var(--yellow)}
      tr.famgh td{background:var(--ground);padding:14px 12px 6px!important;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-top:1px solid var(--line)}
      .famgd{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:1px}
      .famgn{margin:0 8px;padding:1px 8px;border-radius:999px;background:var(--line2);letter-spacing:0;text-transform:none}
      tr.famgh .sub{letter-spacing:0;text-transform:none;font-weight:400}
      .famtool{display:flex;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
      .famseg{display:flex;background:var(--ground);border-radius:10px;padding:3px}
      .famseg button{border:0;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--muted);padding:6px 12px;border-radius:8px;cursor:pointer}
      .famseg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}
      .famsub{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:6px 16px;border-bottom:1px solid var(--line2);font-size:12px}
      .fampage{display:flex;gap:8px;align-items:center;padding:8px 16px;border-top:1px solid var(--line)}
      .famtr{cursor:pointer}.famtr:hover td{background:var(--ground)}
      .famtr.sel td{background:var(--soft)}.famtr.sel td:first-child{box-shadow:inset 4px 0 0 var(--yellow)}
      .famtag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--muted);background:var(--line2);border-radius:4px;padding:1px 5px;margin-right:6px;vertical-align:2px}
      .famflag{display:inline-block;margin-left:6px;font-size:11px;font-weight:700;color:#8A5100;background:#FFF3D6;border-radius:4px;padding:1px 5px;vertical-align:1px}
      .famact{border:0;background:none;font:inherit;font-size:13px;font-weight:700;color:var(--navy2);cursor:pointer;padding:6px 0;white-space:nowrap}
      .famact:hover{text-decoration:underline}
      .famclip{max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .famnav{display:flex;gap:6px;align-items:center;padding:10px 20px}.famnav .sub{flex-grow:1;font-size:12px}
      #view-fam .famrow{display:block}#view-fam .famrow>section{width:100%;max-width:none}
      #view-fam .famdrawer{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);margin:0;z-index:60;overflow:hidden auto!important;overscroll-behavior:contain;background:var(--card,#fff);border-radius:0;box-shadow:-8px 0 32px rgba(20,20,60,.18);transform:translateX(105%);transition:transform .2s ease;visibility:hidden}
      #view-fam .famdrawer.open{transform:none;visibility:visible}
      #fambk{position:fixed;inset:0;background:rgba(20,20,60,.25);z-index:59}
      @media (prefers-reduced-motion:reduce){#view-fam .famdrawer{transition:none}}
      @media (max-width:720px){#view-fam .famdrawer{width:100vw}#view-fam .famdocs{display:none}.famtool{flex-wrap:wrap}.famtool input{flex:1 1 100%}.famclip{max-width:140px}.famact{white-space:normal;text-align:right}#famkpis .famk{min-width:96px}}
      .famstep{margin:16px 20px 0;border-radius:12px;padding:14px;border:1px solid var(--line);border-left:4px solid var(--yellow);display:flex;flex-direction:column;gap:6px;font-size:14px}
      .famnl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
      .famtidy{margin-top:6px;padding:10px 12px;border-radius:8px;background:#FFF9EB;color:#3A2600;font-size:13px;display:flex;flex-direction:column;gap:2px}
      #view-fam table{min-width:0!important;width:100%}#view-fam td{vertical-align:top}
      .famwho{display:inline-flex;gap:10px;align-items:flex-start;vertical-align:top}.famav{width:32px;height:32px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#0C2F52;background:var(--accent-gold,#D4A537);margin-top:2px}.famidl{font-size:12px;margin:-2px 0 2px}.famname{border:0;background:none;font:inherit;font-weight:600;color:var(--ink);padding:4px 0;text-align:left;cursor:pointer}
      .famth{border:0;background:none;font:inherit;font-weight:inherit;color:inherit;padding:0;cursor:pointer;text-align:left}
      .famok{font-size:12px;color:var(--ok);font-weight:700;margin-top:4px}.famgap{font-size:12px;margin-top:4px}
      .famhead{background:var(--navy);color:#fff;padding:20px;display:flex;flex-direction:column;gap:4px}
      .famreg{border-top:1px solid var(--line2);padding:10px 0;display:flex;flex-direction:column;gap:4px}
      .famfu{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}.famfu .sub{flex-grow:1}
      .famacts{display:flex;gap:12px;font-weight:600;font-size:13px}.famh{padding:2px 0 2px 32px}
      .famscope{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      #famstrip{display:flex;flex-direction:column;gap:8px}#famstrip.famstrip0{display:none}.famio>div .btn{justify-content:flex-start;white-space:nowrap}.famlegd{vertical-align:middle}.famlegd>summary{min-width:0;padding:0 9px}.famkey{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:12px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}.famkey .famchip{font-size:11px;margin-right:4px}.famki{display:inline-flex;align-items:center;white-space:nowrap}.famlegd[open]{display:block;width:100%}.famlegd>div{position:static;box-shadow:none;margin-top:6px;width:max-content;max-width:100%}.famlegd .famleg{display:grid;grid-template-columns:auto auto;gap:8px 12px;align-items:center;justify-items:start;min-width:300px;padding:10px 12px}.famlegh{grid-column:1/-1;font-size:12px;color:var(--ink,inherit)}@media (hover:hover){.famact.q{opacity:0;transition:opacity .12s}.famtr:hover .famact.q,.famtr.sel .famact.q,.famact.q:focus-visible{opacity:1}}
      .famtrack{position:relative;height:26px;margin:4px 8px 0;border-radius:13px;background:linear-gradient(90deg,var(--badbg) 0 33.3%,var(--warnbg) 33.3% 66.6%,var(--soft) 66.6%)}
      .famdot{position:absolute;top:5px;width:16px;height:16px;margin-left:-8px;border-radius:50%;border:2px solid var(--surface);cursor:pointer;padding:0}
      .famdot:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
      .famticks{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin:0 2px}
      .famnext{font-size:13px;display:flex;flex-wrap:wrap;gap:4px;align-items:baseline}
      #fambulk{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:60;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;padding:10px 14px;max-width:calc(100vw - 32px);background:var(--soft);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18)}#fambulk[hidden]{display:none}@media (max-width:600px){#fambulk{left:12px;right:12px;bottom:12px;transform:none;max-width:none;gap:6px;padding:8px 10px}#fambulk .btn.sm{padding:4px 8px;font-size:12px}}
      .famback{font-weight:600;font-size:14px;align-self:flex-start}
      #famprof{display:flex;flex-direction:column;gap:14px}#famprof[hidden]{display:none}
      .famphead{background:var(--navy);color:#fff;display:flex;flex-direction:column;gap:14px}
      .famphead .sub{color:#D2D1EC}.famscore{font-size:13px;color:#D2D1EC}
      .famkv{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;border-top:1px solid rgba(255,255,255,.18);padding-top:12px;font-size:14px;overflow-wrap:anywhere}
      .famtabs{display:flex;gap:4px;border-bottom:1px solid var(--line);overflow-x:auto}
      .famtabs button{border:0;background:none;font:inherit;padding:10px 12px;color:var(--muted);cursor:pointer;white-space:nowrap;border-bottom:3px solid transparent}
      .famtabs button.on{color:var(--ink);font-weight:700;border-bottom-color:var(--yellow)}
      .famgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
      .famev{display:grid;grid-template-columns:96px 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--line2)}
      .faminput{height:36px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit;background:transparent;color:var(--ink);min-width:0}
      #famov{position:fixed;inset:0;background:rgba(1,0,45,.45);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
      #famov .card{width:min(640px,100%);display:flex;flex-direction:column;gap:12px}
      #famov .qagrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
      #famov label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}
      #famov input,#famov select{height:36px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:transparent;color:var(--ink)}
      #famov input[type=checkbox]{height:auto}#famov input[type=file]{height:auto;padding:6px 0;border:0}
      /* ApexU skin (28 Oct mock) */
      #view-fam .famgrp{flex:1 1 380px;background:var(--surface,#fff);border-radius:16px;padding:16px 18px;box-shadow:0 1px 2px rgba(22,21,74,.06),0 0 0 1px var(--line2);gap:10px}
      #view-fam .famgl{font-size:14px;color:var(--ink)}
      .famstack{display:flex;gap:2px;height:12px;border-radius:9px;overflow:hidden}.famstack i{display:block;height:100%}
      #view-fam .famk{flex:1 1 0;min-width:96px;border:0;background:var(--ground);border-radius:12px;box-shadow:none}
      #view-fam .famk .v{font-size:24px;font-weight:800}#view-fam .famk .l{white-space:normal}
      #view-fam .famk.on{box-shadow:inset 0 0 0 2px var(--navy),inset 0 -4px 0 var(--yellow);padding:10px 14px}
      .famzero{display:flex;flex-wrap:wrap;gap:6px}.famz{border:0;font:inherit;font-size:12px;color:var(--muted);background:var(--ground);border-radius:8px;padding:4px 10px;cursor:pointer}.famz b{margin-left:4px;color:var(--ink)}
      .famsc{border:0!important;border-radius:0!important;background:transparent!important;color:var(--muted)!important;font-weight:600;padding:8px 2px!important;margin:0 18px 6px 0!important;box-shadow:inset 0 -3px 0 transparent;opacity:1!important}
      .famsc b{order:2;font-size:12px;background:var(--line2);color:var(--ink);border-radius:999px;padding:1px 8px}.famsc:hover{color:var(--navy)!important}
      .famsc.on{color:var(--navy)!important;box-shadow:inset 0 -3px 0 var(--yellow)}.famsc.on b{background:var(--navy);color:#fff}
      .famc-f,.famc-a,.famc-m{background:rgba(37,36,123,.09)!important;color:var(--navy)!important;font-weight:700}
      :root[data-theme=dark] .famc-f,:root[data-theme=dark] .famc-a,:root[data-theme=dark] .famc-m{background:rgba(185,184,227,.16)!important;color:#D2D1EC!important}
      @media (prefers-color-scheme:dark){:root:not([data-theme=light]) .famc-f,:root:not([data-theme=light]) .famc-a,:root:not([data-theme=light]) .famc-m{background:rgba(185,184,227,.16)!important;color:#D2D1EC!important}}
      .famc-bad,.famc-warn,.famc-ok,.famc-nc{border:0!important;font-weight:600;line-height:22px;padding:0 10px;border-radius:8px}
      .famc-bad::before,.famc-warn::before,.famc-ok::before,.famc-nc::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;margin-right:6px;vertical-align:1px}
      .famc-bad{background:rgba(214,69,69,.12)!important}.famc-warn{background:rgba(224,161,0,.16)!important}.famc-ok{background:rgba(46,158,106,.13)!important}.famc-nc{background:var(--line2)!important;font-style:normal!important}
      .famav{background:var(--navy)!important;color:var(--yellow)!important;width:36px!important;height:36px!important}
      .famname{font-weight:700!important}
      tr.famgh td{background:var(--ground);color:var(--navy);text-transform:none;letter-spacing:0;font-size:13px;box-shadow:inset 4px 0 0 var(--g,var(--line))}
      #view-fam thead th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
      .famact{border:1px solid var(--line)!important;border-radius:8px;padding:6px 12px!important;background:var(--surface,#fff)!important;color:var(--navy)!important}
      .famact:hover{text-decoration:none!important;border-color:var(--navy2)!important}
      .famact.y{background:var(--yellow)!important;border-color:var(--yellow)!important;color:var(--navy)!important}
      .famb{display:inline-block;margin-left:8px;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:rgba(224,161,0,.18);color:#8A5100;vertical-align:1px}.famb-m{background:var(--navy);color:var(--yellow)}
      .famsc0{opacity:.5!important;cursor:default}
      .famdots{list-style:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;margin-left:6px;border:1px solid var(--line);border-radius:8px;color:var(--muted);cursor:pointer;vertical-align:middle;font-size:16px}.famdots::-webkit-details-marker{display:none}.famrm{text-align:left}.famrm>div{min-width:160px}
      .famtr .famck{float:left;margin:12px 8px 0 0}.famtr .famwho{display:flex;overflow:hidden}
      #fambulk{background:var(--navy)!important;color:#fff;border:0!important}#fambulk .sub{color:#D2D1EC}
    </style>`);
    const v = $('view-fam'), aside = v.querySelector('aside'), btns = v.querySelectorAll('button');
    btns.forEach(b => {
      const t = b.textContent.trim();
      if (t === '+ Add practitioner') { b.removeAttribute('onclick'); b.onclick = () => canWrite() ? window.famAdd() : say('You do not have FAM write access'); }
      if (t === 'Scope Import') { b.removeAttribute('onclick'); b.onclick = () => { location.hash = 'fam/scope'; }; }
      if (t === 'Bulk Intake') { b.removeAttribute('onclick'); b.onclick = () => canWrite() ? (location.hash = 'fam/bulk') : say('You do not have FAM write access'); }
    });
    const tb = btns[0]?.parentElement;
    tb?.insertAdjacentHTML('afterbegin', '<button class="btn" onclick="location.hash=\'fam/queue\'">Action queue</button><details class="famfum famio"><summary class="btn">Import / Export ▾</summary><div><button class="btn sm" onclick="famExport(false)" title="Exports the list as shown (filter, search and sort)">Export to Excel</button></div></details>');
    const io = tb?.querySelector('.famio');
    if (io) { [...btns].filter(b => /^(Scope Import|Bulk Intake)$/.test(b.textContent.trim())).forEach(b => { b.classList.add('sm'); io.lastChild.appendChild(b); });
      io.lastChild.addEventListener('click', () => { io.open = false; }); document.addEventListener('click', ev => { if (io.open && !io.contains(ev.target)) io.open = false; }); }
    $('famkpis').dataset.fam = '1';
    aside.classList.add('famdrawer'); aside.parentElement.classList.add('famrow'); aside.setAttribute('aria-label', 'Practitioner details');
    document.body.insertAdjacentHTML('beforeend', '<div id="fambk" hidden onclick="famClose()"></div>'); // outside #view-fam: route code toggles that view's children
    addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.open) famClose(); });
    aside.addEventListener('keydown', ev => { if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && S.open) { ev.preventDefault(); famMove(ev.key === 'ArrowDown' ? 1 : -1); } });
    aside.innerHTML = '<div id="fampanel"></div><span id="famname" hidden></span><span id="famroles" hidden></span><span id="famdocs" hidden></span><div id="famcheck" hidden></div>';
    const tbl = v.querySelector('table'), sec = tbl.closest('section');
    tbl.querySelector('thead').id = 'famhead';
    sec.insertAdjacentHTML('afterbegin', `<div class="famtool"><input id="famq" type="search" placeholder="Search name, ID number, role or SETA" aria-label="Search practitioners" oninput="famSearch(this.value)" class="faminput" style="flex:1 1 220px">
      <select class="faminput famdd" id="famdd-role" aria-label="Filter by role" onchange="famDD('fRole',this.value)"><option value="">All roles</option><option>Facilitator</option><option>Assessor</option><option>Moderator</option></select>

      <select class="faminput famdd" id="famdd-seta" aria-label="Filter by SETA" onchange="famDD('fSeta',this.value)"><option value="">All SETAs</option></select>
      <button class="btn sm" id="famv-t" onclick="famMode('triage')" title="Back to urgency order, grouped by status" hidden>↺ Sort: urgency</button>
      <button class="btn sm" id="famtest" onclick="famTest()">Hide test records</button></div>
      <div class="famsub"><span class="sub" id="famcount" aria-live="polite"></span><span class="sub" id="famasof"></span></div><div id="fambulk" hidden></div>`);
    (tbl.parentElement.classList.contains('tw') ? tbl.parentElement : tbl).insertAdjacentHTML('afterend', '<div id="fampage" class="fampage"></div>');
    sec.addEventListener('keydown', ev => { if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !(ev.target.type === 'checkbox')) { ev.preventDefault(); famMove(ev.key === 'ArrowDown' ? 1 : -1); } });
    $('famdd-role').value = S.fRole; 
    v.querySelector('.row').insertAdjacentHTML('beforebegin', '<section class="card" id="famstrip"></section>');
    v.insertAdjacentHTML('beforeend', '<div id="famprof" hidden></div>');
    window.renderFam = () => { renderRows(); renderPanel(); };
    addEventListener('hashchange', syncRoute);
  }

  window.previewFam = () => { setup(); load(); };
})();
