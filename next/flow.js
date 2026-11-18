/* Flow (#flow, every role) + "Action in Flow" button on every page. Built 18 Nov 2026.
   Any page can be sent into a flow item (table flow_items, RLS: owner, creator or admin). Each item has a role template
   (fixed steps, editable), status To do / Doing / Waiting / Done, due date, hand-off to another staff member (apx_staff)
   and a history trail. Admins can switch to "Everyone" and filter to stuck items. Fixed rules, no AI. */
(function () {
  if (window.__flow) return; window.__flow = 1;
  const $ = id => document.getElementById(id);
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const today = () => ymd(new Date());
  const fmt = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '';
  const ago = t => Math.floor((Date.now() - new Date(t)) / 864e5);
  const sb = () => window.__sb;
  const roles = () => (((window.__preview || {}).roles) || []);
  const isAdmin = () => !!window.apxRole && apxRole() === 'admin';
  const me = () => String(((window.__preview || {}).email) || (F.user && F.user.email) || '').toLowerCase();
  const route = () => location.hash.slice(1).split('/')[0];
  const grp = () => { const r = roles().join(',');
    return /admin|head_of_ops/.test(r) ? 'admin' : /pi_specialist/.test(r) ? 'pi' : /qa_specialist|etqa|compliance_officer/.test(r) ? 'qa' : /ohs/.test(r) ? 'ohs' : /recruitment/.test(r) ? 'rec' : /sign/.test(r) ? 'signoff' : 'pm'; };

  /* ---------- role templates (steps are a starting point; users edit them per item) ---------- */
  const T = {
    pm_kickoff: ['pm', 'Kick off programme', ['Confirm start date and venue', 'Confirm facilitator', 'Learner list received', 'Kick-off meeting held', 'PM Tracker updated']],
    pm_enrol: ['pm', 'Enrol learners', ['Check intake / learner list', 'Capture learners', 'Enrolments confirmed', 'Learner documents complete']],
    pm_delivery: ['pm', 'Delivery check-in', ['Attendance up to date', 'Facilitator check-in', 'Issues logged', 'PM Tracker updated']],
    pm_assess: ['pm', 'Assessment and moderation', ['PoEs collected', 'Assessed', 'Sent to moderation', 'Moderation feedback closed']],
    pm_close: ['pm', 'Close out programme', ['Results captured', 'Certificates requested', 'Close-out documents filed', 'Sign-off requested']],
    pi_new: ['pi', 'Programme initiation', ['Client brief captured', 'Qualification confirmed', 'No. of Learners and employment status set', 'Candidate supply checked', 'Submitted']],
    pi_hand: ['pi', 'Hand over to PM', ['PI complete', 'PM assigned', 'Hand-over sent', 'PM accepted']],
    qa_mod: ['qa', 'Moderate', ['Evidence received', 'Moderated', 'Report uploaded', 'Feedback sent to PM']],
    qa_ver: ['qa', 'Verification', ['Sample prepared', 'Verifier booked', 'Verified', 'Outcome recorded']],
    qa_accr: ['qa', 'Accreditation', ['Documents gathered', 'Application submitted', 'Site visit / desktop review', 'Outcome recorded']],
    ohs_visit: ['ohs', 'Site visit', ['Visit booked', 'Checklist prepared', 'Visit done', 'Report filed', 'Actions closed']],
    ohs_fam: ['ohs', 'FAM registration', ['Documents checked', 'Submitted', 'Registration confirmed', 'Registry updated']],
    so_review: ['signoff', 'Review and sign off', ['Documents reviewed', 'Questions resolved', 'Signed off']],
    rec_fill: ['rec', 'Fill intake', ['Shortlist reviewed', 'Candidates reserved', 'Candidates contacted', 'Enrolled']],
    rep_prep: ['all', 'Prepare report', ['Data checked', 'Report generated', 'Reviewed', 'Sent / filed']],
    ad_follow: ['admin', 'Follow up', ['Owner contacted in app', 'Answer received', 'Closed']],
    ad_fix: ['admin', 'Data fix', ['Issue confirmed', 'Owner fixes in app', 'Checked']],
    custom: ['all', 'Custom', []]
  };
  const RT = { pmtracker: 'pm_kickoff', programmes: 'pm_kickoff', enrolments: 'pm_enrol', learners: 'pm_enrol', modver: 'qa_mod', accred: 'qa_accr', fam: 'ohs_visit', signoff: 'so_review', pi: 'pi_new', intake: 'rec_fill', reports: 'rep_prep', dq: 'ad_fix' };
  const GD = { pm: 'pm_kickoff', pi: 'pi_new', qa: 'qa_mod', ohs: 'ohs_visit', signoff: 'so_review', rec: 'rec_fill', admin: 'ad_follow' };
  const GN = { pm: 'Project management', pi: 'Programme initiation', qa: 'QA', ohs: 'OHS', signoff: 'Sign-off', rec: 'Recruitment', admin: 'Admin', all: 'General' };
  const ST = [['todo', 'To do'], ['doing', 'Doing'], ['waiting', 'Waiting on someone'], ['done', 'Done']];

  const F = { st: 'idle', items: [], staff: null, all: false, stuck: false, open: null, user: null };
  const late = x => x.status !== 'done' && x.due && x.due < today();
  const stuck = x => x.status !== 'done' && (late(x) || ago(x.updated_at) >= 5);
  const nameOf = m => { const s = (F.staff || []).find(x => String(x.email).toLowerCase() === m); return s ? s.name : (m || '').split('@')[0]; };

  /* ---------- styles ---------- */
  const css = document.createElement('style');
  css.textContent = `.flb{position:fixed;left:16px;bottom:16px;z-index:60;border:1px solid var(--line);background:var(--card,#fff);color:var(--ink);border-radius:20px;padding:7px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.flb:hover{border-color:var(--accent2)}.flov{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}
.flm{background:var(--card,#fff);color:var(--ink);border-radius:10px;padding:18px;width:min(460px,100%);max-height:90vh;overflow:auto}.flm label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px}
.flm input,.flm select,.flm textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card,#fff);color:var(--ink)}
.flbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.flbar .btn.on{outline:2px solid var(--accent2)}
.flcols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.flcol{background:var(--bg2,rgba(0,0,0,.03));border-radius:8px;padding:8px;min-height:120px}
.flcol h3{font-size:13px;margin:2px 4px 8px;display:flex;justify-content:space-between}.flcard{background:var(--card,#fff);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px;cursor:pointer;font-size:13px}
.flcard.st{border-left:3px solid #d13438}.flcard .t{font-weight:600}.flcard .m{font-size:12px;opacity:.75;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap}.flcard .late{color:#d13438;font-weight:600;opacity:1}
.flprog{height:4px;background:var(--line);border-radius:2px;margin-top:6px;overflow:hidden}.flprog i{display:block;height:100%;background:#107c10}
.fldet{border-top:1px solid var(--line);margin-top:8px;padding-top:8px;cursor:default}.fldet .stp{display:flex;gap:6px;align-items:center;padding:2px 0}.fldet .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
.fldet input[type=text],.fldet input[type=date],.fldet select{font:inherit;font-size:13px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card,#fff);color:var(--ink)}
.fldet .his{font-size:11px;opacity:.7;margin-top:6px;max-height:90px;overflow:auto}
@media(max-width:800px){.flcols{grid-template-columns:1fr}.flb{bottom:12px;left:12px}}`;
  document.head.appendChild(css);

  /* ---------- data ---------- */
  async function load() { F.st = 'loading'; try {
    if (!F.user) { const { data } = await sb().auth.getUser(); F.user = data && data.user; }
    let q = sb().from('flow_items').select('*').order('due', { ascending: true, nullsFirst: false }).order('created_at').limit(1000);
    if (!(isAdmin() && F.all)) q = q.eq('owner_email', me());
    const { data, error } = await q; if (error) throw error; F.items = data || []; F.st = 'ok';
    if (!F.staff) { const r = await sb().rpc('apx_staff'); F.staff = (r.data || []).sort((a, b) => String(a.name).localeCompare(b.name)); }
  } catch (x) { F.st = 'err'; F.err = x.message || String(x); } }
  const hist = (x, t) => [...(x.history || []), { at: new Date().toISOString(), by: me(), t }].slice(-50);
  async function upd(x, patch, t) { const p = Object.assign({}, patch); if (t) p.history = hist(x, t);
    const { error } = await sb().from('flow_items').update(p).eq('id', x.id); if (error) { alert('Not saved: ' + error.message); return; }
    Object.assign(x, p, { updated_at: new Date().toISOString() }); if (p.owner_email && p.owner_email !== me() && !(isAdmin() && F.all)) F.items = F.items.filter(y => y.id !== x.id);
    paint(); navCount(); }

  /* ---------- Action in Flow (any page) ---------- */
  function ctx() { const r = route(), v = $('view-' + r); let lab = '';
    if (v) { const h = v.querySelector('h1,h2,.title,.ptitle'); lab = h ? h.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) : ''; }
    let page = r; try { page = (ROUTES[r] && ROUTES[r][0]) || r; } catch (_) {}
    return { r, page, lab, hash: location.hash || '#' + r }; }
  async function openNew(pre) { if (!F.staff) { try { const r = await sb().rpc('apx_staff'); F.staff = (r.data || []).sort((a, b) => String(a.name).localeCompare(b.name)); } catch (_) { F.staff = []; } }
    const c = pre || ctx(), g = grp(), tk = (c.r === 'flow' ? GD[g] : RT[c.r]) || GD[g] || 'custom';
    const opts = Object.entries(GN).map(([k, n]) => { const L = Object.entries(T).filter(([, v]) => v[0] === k); return L.length ? `<optgroup label="${e(n)}">${L.map(([id, v]) => `<option value="${id}"${id === tk ? ' selected' : ''}>${e(v[1])}</option>`).join('')}</optgroup>` : ''; });
    const mine = opts.splice(Object.keys(GN).indexOf(g), 1); opts.unshift(mine);
    const ov = document.createElement('div'); ov.className = 'flov'; ov.innerHTML = `<div class="flm" role="dialog" aria-label="Action in Flow">
<h2 style="margin:0 0 4px;font-size:18px">Action in Flow</h2><div style="font-size:12px;opacity:.7">${c.r === 'flow' ? 'New flow item' : 'From ' + e(c.page) + (c.lab && c.lab !== c.page ? ' · ' + e(c.lab) : '')}</div>
<label for="fl-t">What needs to happen</label><input id="fl-t" type="text" value="${e(c.r === 'flow' ? '' : (c.lab && c.lab !== c.page ? c.lab : c.page))}" maxlength="200">
<label for="fl-k">Flow</label><select id="fl-k">${opts.join('')}</select>
<label for="fl-o">Owner</label><select id="fl-o"><option value="${e(me())}">Me</option>${(F.staff || []).filter(s => String(s.email).toLowerCase() !== me()).map(s => `<option value="${e(String(s.email).toLowerCase())}">${e(s.name)}</option>`).join('')}</select>
<label for="fl-d">Due</label><input id="fl-d" type="date">
<div id="fl-err" style="color:#d13438;font-size:13px;margin-top:6px"></div>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" id="fl-x">Cancel</button><button class="btn primary" id="fl-s">Add to Flow</button></div></div>`;
    document.body.appendChild(ov); $('fl-t').focus();
    const close = () => ov.remove(); ov.onclick = ev => { if (ev.target === ov) close(); }; $('fl-x').onclick = close;
    $('fl-t').oninput = () => { $('fl-err').textContent = ''; };
    $('fl-s').onclick = async () => { const t = $('fl-t').value.trim(); if (!t) { $('fl-err').textContent = 'Enter what needs to happen first.'; return; }
      const k = $('fl-k').value, o = $('fl-o').value, b = $('fl-s'); b.disabled = true;
      const row = { title: t, template: k, owner_email: o, due: $('fl-d').value || null, steps: T[k][2].map(s => ({ t: s, d: false })),
        ref_route: c.r === 'flow' ? null : c.hash, ref_label: c.r === 'flow' ? null : (c.page + (c.lab && c.lab !== c.page ? ' · ' + c.lab : '')),
        history: [{ at: new Date().toISOString(), by: me(), t: o === me() ? 'Created' : 'Created for ' + nameOf(o) }] };
      const { error } = await sb().from('flow_items').insert(row); if (error) { b.disabled = false; $('fl-err').textContent = 'Not saved: ' + error.message; return; }
      close(); toast(o === me() ? 'Added to your Flow' : 'Added to ' + nameOf(o) + "'s Flow"); if (route() === 'flow') { await load(); paint(); } navCount(); }; }
  function toast(t) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:16px;bottom:60px;z-index:80;background:#107c10;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 2500); }
  function btn() { let b = $('fl-btn'); const on = !!roles().length && !['login', 'privacy', ''].includes(route()) && route() !== 'flow';
    if (!b) { b = document.createElement('button'); b.id = 'fl-btn'; b.className = 'flb'; b.textContent = '+ Action in Flow'; b.title = 'Send this page into a flow item'; b.onclick = () => openNew(); document.body.appendChild(b); }
    b.hidden = !on; }

  /* ---------- Flow page ---------- */
  function card(x) { const n = (x.steps || []).length, d = (x.steps || []).filter(s => s.d).length, o = F.open === x.id, all = isAdmin() && F.all;
    let h = `<div class="flcard${stuck(x) ? ' st' : ''}" data-id="${x.id}"><div class="t">${e(x.title)}</div><div class="m">${T[x.template] ? `<span>${e(T[x.template][1])}</span>` : ''}${x.due ? `<span class="${late(x) ? 'late' : ''}">${late(x) ? 'Overdue · ' : 'Due '}${fmt(x.due)}</span>` : ''}${all ? `<span>${e(nameOf(x.owner_email))}</span>` : ''}${x.status === 'waiting' && x.waiting_on ? `<span>Waiting on ${e(x.waiting_on)}</span>` : ''}${x.status !== 'done' && !late(x) && ago(x.updated_at) >= 5 ? `<span class="late">No change ${ago(x.updated_at)} days</span>` : ''}</div>${n ? `<div class="flprog" title="${d} of ${n} steps"><i style="width:${Math.round(d / n * 100)}%"></i></div>` : ''}`;
    if (o) { h += `<div class="fldet">${(x.steps || []).map((s, i) => `<label class="stp"><input type="checkbox" data-s="${i}"${s.d ? ' checked' : ''}> <span${s.d ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${e(s.t)}</span></label>`).join('')}
<div class="row"><input type="text" id="fl-ns" placeholder="Add a step" maxlength="120" style="flex:1"><button class="btn" data-a="step">Add</button></div>
${x.ref_route ? `<div class="row"><a href="${e(x.ref_route)}">Open ${e(x.ref_label || 'linked page')}</a></div>` : ''}
<div class="row">${ST.filter(s => s[0] !== x.status).map(s => `<button class="btn" data-a="st" data-v="${s[0]}">${e(s[1])}</button>`).join('')}</div>
${x.status === 'waiting' ? `<div class="row"><input type="text" id="fl-w" placeholder="Waiting on whom or what" value="${e(x.waiting_on || '')}" maxlength="120" style="flex:1"><button class="btn" data-a="wait">Save</button></div>` : ''}
<div class="row"><span style="font-size:12px">Due</span><input type="date" id="fl-due" value="${e(x.due || '')}"><span style="font-size:12px">Hand to</span><select id="fl-h"><option value="">Choose</option>${(F.staff || []).filter(s => String(s.email).toLowerCase() !== x.owner_email).map(s => `<option value="${e(String(s.email).toLowerCase())}">${e(s.name)}</option>`).join('')}</select></div>
<div class="row"><input type="text" id="fl-n" placeholder="Add a note" maxlength="300" style="flex:1"><button class="btn" data-a="note">Add note</button>${x.created_by === me() || isAdmin() ? '<button class="btn" data-a="del">Delete</button>' : ''}</div>
<div class="his">${(x.history || []).slice().reverse().map(r => `<div>${e(fmt(r.at))} · ${e(nameOf(r.by))}: ${e(r.t)}</div>`).join('')}</div></div>`; }
    return h + '</div>'; }
  function paint() { const v = $('view-flow'); if (!v || route() !== 'flow') return;
    if (F.st === 'idle') { v.innerHTML = '<p>Loading your Flow…</p>'; load().then(paint); return; }
    if (F.st === 'loading') return;
    if (F.st === 'err') { v.innerHTML = `<h1>My Flow</h1><p style="color:#d13438">Couldn't load your Flow: ${e(F.err)}</p><button class="btn" id="fl-re">Try again</button>`; $('fl-re').onclick = () => { F.st = 'idle'; paint(); }; return; }
    const all = isAdmin() && F.all; let L = F.items; if (all && F.stuck) L = L.filter(stuck);
    const open = F.items.filter(x => x.status !== 'done'), nl = open.filter(late).length, ns = open.filter(stuck).length;
    v.innerHTML = `<h1>${all ? 'Everyone\'s Flow' : 'My Flow'}</h1><p style="margin:-4px 0 10px;opacity:.75;font-size:13px">${open.length} open · ${nl} overdue · ${ns} stuck (overdue or no change in 5+ days). Use “+ Action in Flow” on any page to add the item you're looking at.</p>
<div class="flbar"><button class="btn primary" id="fl-new">New flow item</button>${isAdmin() ? `<button class="btn${!F.all ? ' on' : ''}" data-v="me">Mine</button><button class="btn${F.all ? ' on' : ''}" data-v="all">Everyone</button>${F.all ? `<button class="btn${F.stuck ? ' on' : ''}" id="fl-stk">Stuck only (${ns})</button>` : ''}` : ''}</div>
<div class="flcols">${ST.map(([k, n]) => { const C = L.filter(x => x.status === k).sort((a, b) => k === 'done' ? String(b.done_at).localeCompare(String(a.done_at)) : 0); const S = k === 'done' ? C.slice(0, 15) : C;
      return `<div class="flcol"><h3><span>${e(n)}</span><span>${C.length}</span></h3>${S.map(card).join('') || '<div style="font-size:12px;opacity:.6;padding:4px">Nothing here</div>'}${k === 'done' && C.length > 15 ? `<div style="font-size:12px;opacity:.6">Showing the latest 15</div>` : ''}</div>`; }).join('')}</div>`;
    $('fl-new').onclick = () => openNew({ r: 'flow' });
    v.querySelectorAll('.flbar [data-v]').forEach(b => b.onclick = async () => { F.all = b.dataset.v === 'all'; F.stuck = false; F.open = null; F.st = 'idle'; paint(); });
    if ($('fl-stk')) $('fl-stk').onclick = () => { F.stuck = !F.stuck; paint(); };
    v.querySelectorAll('.flcard').forEach(c => c.onclick = ev => { if (ev.target.closest('.fldet')) return; F.open = F.open === c.dataset.id ? null : c.dataset.id; paint(); });
    const x = F.items.find(y => y.id === F.open); if (!x) return; const D = v.querySelector(`.flcard[data-id="${x.id}"] .fldet`); if (!D) return;
    D.querySelectorAll('[data-s]').forEach(c => c.onchange = () => { const s = x.steps.map((y, i) => i === +c.dataset.s ? Object.assign({}, y, { d: c.checked }) : y);
      const all = s.length && s.every(y => y.d), p = { steps: s }; if (x.status === 'todo' && c.checked) p.status = 'doing';
      upd(x, p, (c.checked ? 'Done: ' : 'Reopened: ') + x.steps[+c.dataset.s].t + (all ? ' (all steps done)' : '')); });
    D.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { const a = b.dataset.a;
      if (a === 'st') { const v2 = b.dataset.v; upd(x, { status: v2 }, 'Moved to ' + ST.find(s => s[0] === v2)[1]); }
      if (a === 'wait') upd(x, { waiting_on: $('fl-w').value.trim() || null }, 'Waiting on ' + ($('fl-w').value.trim() || '—'));
      if (a === 'step') { const t = $('fl-ns').value.trim(); if (t) upd(x, { steps: [...(x.steps || []), { t, d: false }] }, 'Step added: ' + t); }
      if (a === 'note') { const t = $('fl-n').value.trim(); if (t) upd(x, {}, 'Note: ' + t); }
      if (a === 'del' && confirm('Delete this flow item? This can\'t be undone.')) { const { error } = await sb().from('flow_items').delete().eq('id', x.id); if (error) return alert('Not deleted: ' + error.message); F.items = F.items.filter(y => y.id !== x.id); F.open = null; paint(); navCount(); } });
    $('fl-due').onchange = () => upd(x, { due: $('fl-due').value || null }, 'Due ' + ($('fl-due').value ? fmt($('fl-due').value) : 'cleared'));
    $('fl-h').onchange = () => { const o = $('fl-h').value; if (o && confirm('Hand this item to ' + nameOf(o) + '?')) upd(x, { owner_email: o, status: x.status === 'done' ? 'todo' : x.status }, 'Handed to ' + nameOf(o)); }; }

  /* ---------- route, menu, count ---------- */
  const anchor = document.querySelector('main[id^="view-"]');
  if (anchor && !$('view-flow')) { const m = document.createElement('main'); m.id = 'view-flow'; m.hidden = true; anchor.parentNode.appendChild(m); }
  try { ICO.flow = 'M4 6h10M4 12h7M4 18h10M17 5l3 3-3 3M17 13l3 3-3 3'; } catch (_) {}
  try { ROUTES.flow = ['My Flow', 'Overview']; const g = NAV.find(x => x[0] === 'Overview'); if (g && !g[1].some(x => x[1] === 'flow')) g[1].splice(1, 0, ['My Flow', 'flow']); } catch (_) {}
  const go = () => { btn(); if (route() === 'flow') { F.open = null; F.st = 'idle'; setTimeout(paint, 60); } };
  addEventListener('hashchange', go);
  const nav = () => { try { renderNav(curNav); } catch (_) {} };
  async function navCount() { try { if (!me()) { if (!F.user) { const { data } = await sb().auth.getUser(); F.user = data && data.user; } if (!me()) return; }
    const { count } = await sb().from('flow_items').select('id', { count: 'exact', head: true }).eq('owner_email', me()).neq('status', 'done').lte('due', today());
    F.nav = count || 0; nav(); } catch (_) {} }
  const wrapDot = () => { const f = window.apxNavDot; if (!f || f.__flow) return; const g = r => { if (r !== 'flow') return f(r); const n = F.nav || 0;
    return n ? `<span class="navcnt r" aria-label="${n} flow items due or overdue">${n}</span>` : ''; }; g.__flow = 1; window.apxNavDot = g; };
  (function wait0(n) { if (window.apxRole && window.__sb) { try { window.NAVR = window.NAVR || {}; NAVR.flow = () => !!roles().length; } catch (_) {}
    wrapDot(); nav(); btn(); if (route() === 'flow') { try { window.route && window.route(); } catch (_) {} go(); }
    (function wr(k) { if (roles().length) { wrapDot(); nav(); btn(); navCount(); if (route() === 'flow') go(); } else if (k < 60) setTimeout(() => wr(k + 1), 500); })(0);
    try { __sb.auth.onAuthStateChange(() => setTimeout(() => { F.user = null; F.staff = null; F.st = 'idle'; btn(); navCount(); }, 400)); } catch (_) {} } else if (n < 60) setTimeout(() => wait0(n + 1), 500); })(0);
  window.apxFlowAdd = openNew;
})();
