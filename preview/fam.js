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
  const MAX = 10 * 1024 * 1024, EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  const S = { A: [], R: [], D: [], F: [], Q: [], SC: [], filter: '', q: '', hist: {}, sort: { k: 'name', dir: 1 }, view: 'triage', hideTest: false, page: 0, ptab: 'record', loadedAt: null, sel: new Set(), tab: 'overview', mode: 'list', prof: null, cat: null, catQ: '', catSeta: '' };
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
  const RISK = { expired: ['b-bad', d => `Expired ${Math.abs(d)}d ago`], due_30: ['b-bad', d => `Due in ${d}d`], due_60: ['b-warn', d => `Due in ${d}d`], pending: ['b-n', () => 'Pending entry'], inactive: ['b-bad', () => 'Inactive'], active: ['b-ok', () => 'Active'] };
  const riskBadge = r => { const k = risk(r), [c, f] = RISK[k]; return `<span class="badge ${c}">${f(days(r))}</span>`; };
  const roles = id => [...new Set(regsFor(id).flatMap(r => r.roles?.length ? r.roles : r.role ? [r.role] : []))];
  const rolesOf = a => { const r = roles(a.id); return r.length ? r : a.role ? [a.role] : []; };
  const setas = id => [...new Set(regsFor(id).map(r => r.seta_name).filter(s => s && s !== 'N/A' && s !== 'Pending Entry'))];
  // latest current row per type (a non-admin re-upload adds a newer version without retiring the old row)
  const cur = (id, t) => S.D.filter(d => d.assessor_id === id && d.doc_type === t && d.is_current !== false).sort((x, y) => (y.version || 1) - (x.version || 1))[0];
  const onFile = id => TYPES.filter(t => { const c = cur(id, t); return c && c.status !== 'Missing'; });
  const fu = (type, sid) => S.F.find(f => f.source_type === type && f.source_id === sid);
  const openFU = id => S.F.filter(f => f.assessor_id === id && !CLOSED.includes(f.status));
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
    const miss = TYPES.length - docs;
    const checks = [[regs > 0, 'no registration'], [!miss, `${miss} document${miss === 1 ? '' : 's'} not on file`], [!missExp, `${missExp} missing/expired doc${missExp === 1 ? '' : 's'}`], [!open, `${open} open follow-up${open === 1 ? '' : 's'}`]];
    const gaps = checks.filter(c => !c[0]).map(c => c[1]);
    return { score: Math.round(checks.filter(c => c[0]).length / checks.length * 100), gaps, complete: !gaps.length };
  }
  const complHtml = id => { const c = compl(id); return c.complete ? '<div class="famok">✓ Profile complete</div>' : `<div class="sub famgap">${e(c.gaps.join(' · '))}</div>`; };

  /* ---------- KPIs (click to filter) ---------- */
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
    ['pending', 'Pending entry', allRisks().filter(s => s === 'pending').length, 'var(--muted)'],
    ['inactive', 'Inactive', allRisks().filter(s => s === 'inactive').length, 'var(--bad)'],
    ['missing', 'Missing docs', vis().filter(a => onFile(a.id).length < TYPES.length).length, 'var(--bad)'],
    ['followups', 'Open follow-ups', vis().filter(a => openFU(a.id).length > 0).length, 'var(--ink)'],
    ['incomplete', 'Incomplete profiles', vis().filter(a => !compl(a.id).complete).length, 'var(--warn)'],
    ['tidy', 'Data to tidy', vis().filter(a => dataFlags(a).length > 0).length, '#8A5100']];
  const matches = (a, k) => !k ? true : k === 'missing' ? onFile(a.id).length < TYPES.length : k === 'followups' ? openFU(a.id).length > 0 : k === 'incomplete' ? !compl(a.id).complete : k === 'tidy' ? dataFlags(a).length > 0 : regsFor(a.id).some(r => risk(r) === k);
  window.famFilter = k => { S.filter = S.filter === k ? '' : k; S.page = 0; render(); };
  window.famSearch = v => { S.q = v.toLowerCase(); S.page = 0; renderRows(); };
  window.famSort = k => { S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : 1 }; renderRows(); };
  window.famMode = v => { S.view = v; S.page = 0; renderFam(); };
  window.famTest = () => { S.hideTest = !S.hideTest; S.page = 0; S.sel.clear(); render(); };
  window.famPage = d => { S.page = Math.max(0, S.page + d); renderRows(); };
  window.famShow = i => { famSel = i; S.open = true; renderFam(); };
  window.famClose = () => { S.open = false; renderPanel(); };
  window.famPTab = t => { S.ptab = t; renderPanel(); };
  window.famOpen = id => { location.hash = 'fam/' + id; };

  /* ---------- list ---------- */
  const SORT = {
    name: a => a.full_name.toLowerCase(),
    expiry: a => { const r = nextExp(a.id); return r ? days(r) : 1e9; },
    docs: a => onFile(a.id).length,
    status: a => RANK[status(a.id)] * 1000 + (100 - compl(a.id).score)
  };
  const WRANK = ['expired', 'due_30', 'due_60', 'pending', 'none', 'active', 'inactive'];
  const WGRP = { expired: ['Expired', 'var(--bad)', 'Renew now'], due_30: ['Due in 30 days', 'var(--bad)', 'Start the renewal'], due_60: ['Due in 31–60 days', '#E0A100', 'Plan the renewal'], pending: ['Registration not captured', 'var(--navy2)', 'Details still to enter'], none: ['No registration', 'var(--muted)', 'Add one or mark inactive'], active: ['Active', 'var(--ok)', 'Registered; check documents'], inactive: ['Inactive', 'var(--muted)', ''] };
  const worst = a => { const st = regsFor(a.id).map(risk); return st.length ? WRANK.find(k => st.includes(k)) : 'none'; };
  function when(a) {
    const w = worst(a);
    if (w === 'none') return ['No registration', 'color:var(--muted)'];
    if (w === 'inactive') return ['Inactive', 'color:var(--muted)'];
    if (w === 'pending') return ['Details not captured', 'color:var(--navy2);font-weight:600'];
    const r = nextExp(a.id);
    if (!r) return ['No expiry on record', 'color:#8A5100;font-weight:600'];
    const d = days(r);
    if (d < 0) return [`Expired ${-d} days ago`, 'color:var(--bad);font-weight:700'];
    if (d <= 60) return [`${d} days left · ${fmt(r.registration_expiry_date)}`, `color:${d <= 30 ? 'var(--bad)' : '#8A5100'};font-weight:700`];
    return [fmt(r.registration_expiry_date), ''];
  }
  function rowAction(a) {
    if (!canWrite()) return '';
    const w = worst(a), r = regsFor(a.id).find(x => risk(x) === w), miss = TYPES.length - onFile(a.id).length;
    if (['expired', 'due_30', 'due_60'].includes(w)) return 'Renew ' + String(r?.seta_name || '').replace(/\s+SETA$/i, '');
    if (w === 'pending') return 'Capture registration';
    if (w === 'none') return 'Add registration';
    if (w === 'inactive') return 'Review';
    return miss ? `Request ${miss} doc${miss > 1 ? 's' : ''}` : '';
  }
  function rows() {
    const k = SORT[S.sort.k] || SORT.name, q = S.q;
    const hit = a => !q || [a.full_name, rolesOf(a).join(' '), regsFor(a.id).map(r => r.seta_name || '').join(' ')].join(' ').toLowerCase().includes(q);
    const list = S.A.map((a, i) => [a, i]).filter(([a]) => (!S.hideTest || !isTest(a)) && matches(a, S.filter) && hit(a));
    if (S.view === 'triage') return list.sort(([x], [y]) => WRANK.indexOf(worst(x)) - WRANK.indexOf(worst(y)) || dataFlags(y).length - dataFlags(x).length || x.full_name.localeCompare(y.full_name));
    return list.sort(([x], [y]) => { const p = k(x), r = k(y); return (p < r ? -1 : p > r ? 1 : 0) * S.sort.dir; });
  }
  window.famClearAll = () => { S.filter = ''; S.q = ''; S.page = 0; const i = $('famq'); if (i) i.value = ''; render(); };
  window.famMove = d => { const ids = rows().map(([, i]) => i); if (!ids.length) return; const p = ids.indexOf(famSel); famSel = ids[p < 0 ? 0 : (p + d + ids.length) % ids.length]; renderFam(); };
  const PER = 50;
  const th = (k, l) => `<th${k ? ` aria-sort="${S.sort.k === k ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}>${k ? `<button class="famth" onclick="famSort('${k}')">${l}${S.sort.k === k ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>` : l}</th>`;
  function renderRows() {
    const all = rows(), cw = canWrite(), tri = S.view === 'triage', pages = Math.max(1, Math.ceil(all.length / PER));
    if (S.page >= pages) S.page = pages - 1;
    const list = all.slice(S.page * PER, S.page * PER + PER);
    const meter = a => { const k = onFile(a.id).length, c = k === 6 ? 'var(--ok)' : k >= 3 ? '#E0A100' : 'var(--bad)'; return `<span class="bar" style="width:56px"><i style="width:${Math.round(k / 6 * 100)}%;background:${c}"></i></span> <span class="sub">${k}/6</span>`; };
    const tag = a => isTest(a) ? '<span class="famtag">TEST</span>' : '';
    const flag = a => { const n = dataFlags(a).length; return n ? `<span class="famflag" title="Data to tidy: ${e(dataFlags(a).join('; '))}">⚑ ${n}</span>` : ''; };
    const empty = c => `<tr><td colspan="${c}" class="sub" style="padding:20px">No practitioners match${S.filter || S.q ? '. <a href="#" onclick="famClearAll();return false">Clear filters</a>' : '.'}</td></tr>`;
    $('famv-t').className = tri ? 'on' : ''; $('famv-t').setAttribute('aria-pressed', tri);
    $('famv-l').className = tri ? '' : 'on'; $('famv-l').setAttribute('aria-pressed', !tri);
    $('famtest').textContent = S.hideTest ? 'Show test records' : 'Hide test records';
    if (tri) {
      $('famhead').innerHTML = '';
      $('famrows').innerHTML = list.length ? list.map(([a, i], n) => {
        const g = worst(a), gn = n === 0 || worst(list[n - 1][0]) !== g ? all.filter(([b]) => worst(b) === g).length : 0, w = when(a), act = rowAction(a), st = [...new Set(regsFor(a.id).map(r => r.seta_name === 'N/A' ? 'SETA not named' : r.seta_name === 'Pending Entry' ? 'Not captured yet' : r.seta_name).filter(Boolean))];
        return (gn ? `<tr class="famgh"><td colspan="4"><span class="famgd" style="background:${WGRP[g][1]}"></span>${WGRP[g][0]}<span class="famgn">${gn}</span><span class="sub">${WGRP[g][2]}</span></td></tr>` : '') +
          `<tr class="famtr${i === famSel ? ' sel' : ''}" onclick="famShow(${i})">
          <td><button class="famname" onclick="event.stopPropagation();famShow(${i})" aria-current="${i === famSel}">${tag(a)}${e(shownName(a))}</button>${flag(a)}<div class="sub">${e(rolesOf(a).join(' · ') || '—')}</div></td>
          <td><div style="${w[1]}">${e(w[0])}</div><div class="sub famclip">${e(st.join(', ') || '—')}</div></td>
          <td class="famdocs" style="white-space:nowrap">${meter(a)}</td>
          <td style="text-align:right">${act ? `<button class="famact" onclick="event.stopPropagation();famOpen(${a.id})">${e(act)}</button>` : ''}</td></tr>`;
      }).join('') : empty(4);
      finishRows(all, list, pages);
      return;
    }
    $('famhead').innerHTML = `<tr>${cw ? `<th style="width:28px"><input type="checkbox" aria-label="Select all shown" onchange="famSelAll(this.checked)" ${all.length && all.every(([a]) => S.sel.has(a.id)) ? 'checked' : ''}></th>` : ''}${th('name', 'Practitioner')}<th>SETA coverage</th>${th('expiry', 'Next expiry')}${th('docs', 'Documents')}${th('status', 'Status')}<th>Next action</th></tr>`;
    $('famrows').innerHTML = list.length ? list.map(([a, i]) => {
      const k = onFile(a.id).length, c = k === 6 ? 'var(--ok)' : k >= 3 ? '#E0A100' : 'var(--bad)', st = setas(a.id), nx = nextExp(a.id);
      return `<tr class="${i === famSel ? 'sel' : ''}">${cw ? `<td><input type="checkbox" aria-label="Select ${e(a.full_name)}" onchange="famPick(${a.id},this.checked)" ${S.sel.has(a.id) ? 'checked' : ''}></td>` : ''}
        <td><button class="famname" onclick="famShow(${i})">${tag(a)}${e(shownName(a))}</button>${flag(a)}<div class="sub">${e(rolesOf(a).join(' · ') || '—')}</div></td>
        <td class="sub">${st.length ? st.map(e).join(', ') : '—'}</td>
        <td style="white-space:nowrap">${nx ? `${fmt(nx.registration_expiry_date)}<div>${riskBadge(nx)}</div>` : '<span class="sub">—</span>'}</td>
        <td style="white-space:nowrap"><span class="bar"><i style="width:${Math.round(k / 6 * 100)}%;background:${c}"></i></span> <span class="sub">${k}/6</span></td>
        <td>${pill(status(a.id))}${complHtml(a.id)}</td><td class="sub">${e(nextAction(a))}</td></tr>`;
    }).join('') : empty(cw ? 7 : 6);
    finishRows(all, list, pages);
  }
  function finishRows(all, list, pages) {
    $('famcount').textContent = `${all.length} of ${vis().length} practitioners${S.filter || S.q ? ' match' : ''}${S.hideTest ? ' · test records hidden' : ''}`;
    $('famasof').textContent = S.loadedAt ? `Data loaded ${S.loadedAt} · ↑ ↓ to move between practitioners` : '';
    $('fampage').innerHTML = `<span class="sub" style="flex-grow:1">Showing ${all.length ? S.page * PER + 1 : 0}–${S.page * PER + list.length} of ${all.length} · ${PER} per page</span>
      <button class="btn sm" onclick="famPage(-1)" ${S.page ? '' : 'disabled'} aria-label="Previous page">‹</button><span class="sub">Page ${S.page + 1} of ${pages}</span>
      <button class="btn sm" onclick="famPage(1)" ${S.page < pages - 1 ? '' : 'disabled'} aria-label="Next page">›</button>`;
    renderBulk();
  }

  /* ---------- 90-day expiry strip ---------- */
  function renderStrip() {
    const regs = S.R.filter(r => r.registration_expiry_date && days(r) <= 90).sort((x, y) => days(x) - days(y));
    const exp = regs.filter(r => days(r) < 0), soon = regs.filter(r => days(r) >= 0);
    const who = r => S.A.find(a => a.id === r.assessor_id)?.full_name || 'Unknown';
    const dot = r => { const d = days(r), c = d <= 30 ? 'var(--bad)' : d <= 60 ? '#E0A100' : 'var(--navy2)';
      return `<button class="famdot" style="left:${Math.min(100, d / 90 * 100)}%;background:${c}" title="${e(who(r))} · ${e(r.seta_name)} · in ${d}d" aria-label="${e(who(r))}, ${e(r.seta_name)}, expires in ${d} days" onclick="famOpen(${r.assessor_id})"></button>`; };
    $('famstrip').innerHTML = `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 style="font-size:15px;flex-grow:1">Expiries in the next 90 days</h2>
        <span class="sub">${soon.length} due${exp.length ? ` · <a href="#" onclick="famFilter('expired');return false" style="color:var(--bad);font-weight:600">${exp.length} already expired</a>` : ''}</span></div>
      <div class="famtrack">${soon.map(dot).join('')}</div>
      <div class="famticks"><span>Today</span><span>30d</span><span>60d</span><span>90d</span></div>
      ${soon.length ? `<div class="famnext">${soon.slice(0, 4).map(r => `<a href="#fam/${r.assessor_id}">${e(who(r))}</a> <span class="sub">${e(r.seta_name)} · ${fmt(r.registration_expiry_date)}</span>`).join('<span class="sub"> · </span>')}${soon.length > 4 ? `<span class="sub"> +${soon.length - 4} more</span>` : ''}</div>` : '<div class="sub">Nothing due in the next 90 days.</div>'}`;
  }

  /* ---------- selection, bulk follow-ups, export ---------- */
  window.famPick = (id, on) => { on ? S.sel.add(id) : S.sel.delete(id); renderBulk(); };
  window.famSelAll = on => { rows().forEach(([a]) => on ? S.sel.add(a.id) : S.sel.delete(a.id)); renderRows(); };
  function renderBulk() {
    const n = S.sel.size, box = $('fambulk'); if (!box) return;
    box.hidden = !n || S.view !== 'table' || !canWrite();
    if (box.hidden) return;
    const open = S.F.filter(f => S.sel.has(f.assessor_id) && !CLOSED.includes(f.status)).length;
    box.innerHTML = `<b>${n} selected</b><span class="sub">${open} open follow-up${open === 1 ? '' : 's'}</span>
      <button class="btn sm" onclick="famBulk('claim')" ${open ? '' : 'disabled'}>Claim follow-ups</button><button class="btn sm" onclick="famBulk('dismiss')" ${open ? '' : 'disabled'}>Dismiss follow-ups</button>
      <button class="btn sm" onclick="famExport(true)">Export selected</button><button class="btn sm" onclick="famClearSel()">Clear</button>`;
  }
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
      ${st === 'Dismissed' ? b('reopen', 'Reopen') : (st !== 'In Progress' ? b('claim', 'Claim') : '') + b('note', 'Note') + b('dismiss', 'Dismiss')}</div>`;
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
  function renderPanel() {
    const a = S.A[famSel] || S.A[0], box = $('fampanel');
    if (!a) { box.innerHTML = '<div style="padding:20px" class="sub">No practitioners yet. Add one to start.</div>'; return; }
    const ids = rows().map(([, i]) => i), pos = ids.indexOf(famSel), hist = S.ptab === 'history';
    const dr = box.parentElement, shut = !S.open || pos < 0;
    dr.classList.toggle('open', !shut); $('fambk').hidden = shut; if (shut) { S.open = false; box.innerHTML = ''; return; }
    const ev = hist ? activity(a) : [];
    box.innerHTML = `<div class="famnav"><span class="sub">${pos >= 0 ? `${pos + 1} of ${ids.length} in this list` : 'Not in the current list'}</span>
        <button class="btn sm" onclick="famMove(-1)" aria-label="Previous practitioner">↑</button><button class="btn sm" onclick="famMove(1)" aria-label="Next practitioner">↓</button><button class="btn sm" onclick="famClose()" aria-label="Close panel">✕</button></div>
      <div class="famhead"><span class="disp" style="font-size:20px">${isTest(a) ? '<span class="famtag" style="background:#3A3994;color:#fff">TEST</span>' : ''}${e(shownName(a))}</span>
        <span style="font-size:13px;color:#D2D1EC">${e(rolesOf(a).join(' · ') || 'No roles yet')}</span>
        <span style="font-size:13px;color:#D2D1EC">${e([a.email, a.phone].filter(Boolean).join(' · ') || 'No contact details')}</span>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">${pill(status(a.id))}<button class="btn y sm" onclick="famOpen(${a.id})">Open profile</button></div></div>
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
          <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">${pill(status(a.id))}<span class="famscore">${c.score}% complete</span></div></div>
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

  /* ---------- modes ---------- */
  function syncRoute() {
    const h = location.hash.slice(1);
    if (h.split('/')[0] !== 'fam' || !ready) return;
    const arg = h.split('/')[1];
    const mode = arg === 'scope' ? 'scope' : arg === 'queue' ? 'queue' : arg ? 'profile' : 'list';
    if (mode === 'profile' && S.prof !== Number(arg)) S.tab = 'overview';
    S.mode = mode; S.prof = mode === 'profile' ? Number(arg) : null;
    const v = $('view-fam');
    [...v.children].forEach(ch => { ch.hidden = ch.id === 'famprof' ? mode === 'list' : mode !== 'list'; });
    if (mode === 'profile') { const i = S.A.findIndex(a => a.id === S.prof); if (i >= 0) famSel = i; renderProfile(); }
    else if (mode === 'scope') renderScope();
    else if (mode === 'queue') renderQueue();
    else { $('heading').textContent = 'FAM Registry'; $('crumb').textContent = 'Quality / Facilitators, Assessors & Moderators'; }
  }
  function render() {
    const K = KPIS(), kbtn = ([k, l, v, c]) => `<button class="kpi famk${S.filter === k ? ' on' : ''}" onclick="famFilter('${k}')" aria-pressed="${S.filter === k}" title="${S.filter === k ? 'Click again to clear the filter' : 'Filter the list'}"><span class="l">${l}</span><span class="v" style="color:${c}">${v}</span></button>`;
    const kgrp = (title, ks) => `<div class="famgrp" role="group" aria-label="${title}"><div class="famgl">${title}</div><div class="famgk">${K.filter(x => ks.includes(x[0])).map(kbtn).join('')}</div></div>`;
    $('famkpis').innerHTML = kgrp(`Registrations · ${visR().length}`, ['expired', 'due_30', 'due_60', 'active', 'pending', 'inactive']) + kgrp(`Practitioners · ${vis().length}`, ['missing', 'followups', 'incomplete', 'tidy']);
    renderStrip(); renderRows(); renderPanel();
    if (S.mode === 'profile') renderProfile(); else if (S.mode === 'scope' && S.cat) renderScope(); else if (S.mode === 'queue') renderQueue();
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

  window.famReg = aid => modal('Add SETA registration', `<div class="qagrid">${fld('seta_name', 'SETA *', 'text', 'required list="famsetas"')}<datalist id="famsetas">${['ETDP SETA', 'MICT SETA', 'Services SETA', 'AgriSETA', 'BANKSETA', 'CHIETA', 'FASSET', 'HWSETA', 'INSETA', 'LGSETA', 'MERSETA', 'PSETA', 'QCTO', 'TETA', 'W&RSETA'].map(s => `<option value="${s}">`).join('')}</datalist>
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
      say('Follow-up updated'); await load();
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
      #view-fam .famdrawer{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);margin:0;z-index:60;overflow:auto;background:var(--card,#fff);border-radius:0;box-shadow:-8px 0 32px rgba(20,20,60,.18);transform:translateX(105%);transition:transform .2s ease;visibility:hidden}
      #view-fam .famdrawer.open{transform:none;visibility:visible}
      #fambk{position:fixed;inset:0;background:rgba(20,20,60,.25);z-index:59}
      @media (prefers-reduced-motion:reduce){#view-fam .famdrawer{transition:none}}
      @media (max-width:720px){#view-fam .famdrawer{width:100vw}#view-fam .famdocs{display:none}.famtool{flex-wrap:wrap}.famtool input{flex:1 1 100%}.famclip{max-width:140px}.famact{white-space:normal;text-align:right}#famkpis .famk{min-width:96px}}
      .famstep{margin:16px 20px 0;border-radius:12px;padding:14px;border:1px solid var(--line);border-left:4px solid var(--yellow);display:flex;flex-direction:column;gap:6px;font-size:14px}
      .famnl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
      .famtidy{margin-top:6px;padding:10px 12px;border-radius:8px;background:#FFF9EB;color:#3A2600;font-size:13px;display:flex;flex-direction:column;gap:2px}
      #view-fam table{min-width:0!important;width:100%}#view-fam td{vertical-align:top}
      .famname{border:0;background:none;font:inherit;font-weight:600;color:var(--ink);padding:4px 0;text-align:left;cursor:pointer}
      .famth{border:0;background:none;font:inherit;font-weight:inherit;color:inherit;padding:0;cursor:pointer;text-align:left}
      .famok{font-size:12px;color:var(--ok);font-weight:700;margin-top:4px}.famgap{font-size:12px;margin-top:4px}
      .famhead{background:var(--navy);color:#fff;padding:20px;display:flex;flex-direction:column;gap:4px}
      .famreg{border-top:1px solid var(--line2);padding:10px 0;display:flex;flex-direction:column;gap:4px}
      .famfu{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}.famfu .sub{flex-grow:1}
      .famacts{display:flex;gap:12px;font-weight:600;font-size:13px}.famh{padding:2px 0 2px 32px}
      .famscope{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      #famstrip{display:flex;flex-direction:column;gap:8px}
      .famtrack{position:relative;height:26px;margin:4px 8px 0;border-radius:13px;background:linear-gradient(90deg,var(--badbg) 0 33.3%,var(--warnbg) 33.3% 66.6%,var(--soft) 66.6%)}
      .famdot{position:absolute;top:5px;width:16px;height:16px;margin-left:-8px;border-radius:50%;border:2px solid var(--surface);cursor:pointer;padding:0}
      .famdot:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
      .famticks{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin:0 2px}
      .famnext{font-size:13px;display:flex;flex-wrap:wrap;gap:4px;align-items:baseline}
      #fambulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;background:var(--soft);border-bottom:1px solid var(--line)}#fambulk .sub{flex-grow:1}
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
    </style>`);
    const v = $('view-fam'), aside = v.querySelector('aside'), btns = v.querySelectorAll('button');
    btns.forEach(b => {
      const t = b.textContent.trim();
      if (t === '+ Add practitioner') { b.removeAttribute('onclick'); b.onclick = () => canWrite() ? window.famAdd() : say('You do not have FAM write access'); }
      if (t === 'Scope Import') { b.removeAttribute('onclick'); b.onclick = () => { location.hash = 'fam/scope'; }; }
      if (t === 'Bulk Intake') { b.removeAttribute('onclick'); b.title = 'Arrives with PR #61'; b.onclick = () => say('Bulk Intake arrives with PR #61'); }
    });
    btns[0]?.parentElement.insertAdjacentHTML('afterbegin', '<button class="btn" onclick="location.hash=\'fam/queue\'">Action queue</button><button class="btn" onclick="famExport(false)" title="Exports the list as shown (filter, search and sort)">Export to Excel</button>');
    aside.classList.add('famdrawer'); aside.parentElement.classList.add('famrow'); aside.setAttribute('aria-label', 'Practitioner details');
    v.insertAdjacentHTML('beforeend', '<div id="fambk" hidden onclick="famClose()"></div>');
    addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.open) famClose(); });
    aside.addEventListener('keydown', ev => { if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && S.open) { ev.preventDefault(); famMove(ev.key === 'ArrowDown' ? 1 : -1); } });
    aside.innerHTML = '<div id="fampanel"></div><span id="famname" hidden></span><span id="famroles" hidden></span><span id="famdocs" hidden></span><div id="famcheck" hidden></div>';
    const tbl = v.querySelector('table'), sec = tbl.closest('section');
    tbl.querySelector('thead').id = 'famhead';
    sec.insertAdjacentHTML('afterbegin', `<div class="famtool"><input id="famq" type="search" placeholder="Search name, role or SETA" aria-label="Search practitioners" oninput="famSearch(this.value)" class="faminput" style="flex-grow:1">
      <div class="famseg" role="group" aria-label="List view"><button id="famv-t" onclick="famMode('triage')">Triage</button><button id="famv-l" onclick="famMode('table')">Table</button></div>
      <button class="btn sm" id="famtest" onclick="famTest()">Hide test records</button></div>
      <div class="famsub"><span class="sub" id="famcount" aria-live="polite"></span><span class="sub" id="famasof"></span></div><div id="fambulk" hidden></div>`);
    (tbl.parentElement.classList.contains('tw') ? tbl.parentElement : tbl).insertAdjacentHTML('afterend', '<div id="fampage" class="fampage"></div>');
    sec.addEventListener('keydown', ev => { if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !(ev.target.type === 'checkbox')) { ev.preventDefault(); famMove(ev.key === 'ArrowDown' ? 1 : -1); } });
    v.querySelector('.row').insertAdjacentHTML('beforebegin', '<section class="card" id="famstrip"></section>');
    v.insertAdjacentHTML('beforeend', '<div id="famprof" hidden></div>');
    window.renderFam = () => { renderRows(); renderPanel(); };
    addEventListener('hashchange', syncRoute);
  }

  window.previewFam = () => { setup(); load(); };
})();
