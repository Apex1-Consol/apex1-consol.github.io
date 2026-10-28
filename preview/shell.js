/* ApexOne redesign preview — app shell (2026-10-22).
   Menu open/close (icon rail), right side panel (Details / Activity / Assistant),
   "My work" home per role, Ctrl K search. Reads the data live.js loaded; the only
   extra reads are the Activity tab's audit_log and outbox look-ups. No writes. */
(function () {
  const sb = window.__sb, P = window.__preview;
  const D = () => (P && P.data) || {};
  const A = () => window.dvApi;
  const roles = () => (P && P.roles) || [];
  const has = r => roles().includes('admin') || roles().includes(r);
  const ls = { get(k, d) { try { const v = localStorage.getItem('ao.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem('ao.' + k, JSON.stringify(v)); } catch (e) { } } };
  const iso = (d = new Date()) => d.toISOString().slice(0, 10);
  const fmt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const nm = l => l ? (l.first_name + ' ' + l.last_name).trim() : '';
  const short = p => (p?.programme_name || '').replace('[TEST] ', '');
  const learner = id => (D().learners || []).find(l => l.id === id);
  const active = () => (D().progs || []).filter(p => p.status === 'active' && A() && A().learnersOf(p.id).length);

  /* ---------- menu open / closed ---------- */
  const app = () => document.getElementById('shell');
  function applyRail() {
    const r = ls.get('rail', window.innerWidth < 1100);
    app().classList.toggle('rail', !!r);
    const b = $('lpbtn'); if (b) { b.setAttribute('aria-expanded', String(!r)); b.setAttribute('aria-label', r ? 'Open menu' : 'Close menu'); b.title = r ? 'Open menu' : 'Close menu'; }
  }
  window.toggleRail = f => { const now = app().classList.contains('rail'); ls.set('rail', f === undefined ? !now : !f); applyRail(); };
  window.jumpTo = () => { const q = $('q'); if (q) { q.focus(); q.select(); } };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); window.jumpTo(); } });

  /* ---------- right side panel ---------- */
  const S = { open: ls.get('rp', false), tab: 'Details', pid: null, lid: null, act: null };
  function applyRP() {
    $('rpanel').hidden = !S.open || onFam(); // FAM uses its own docked practitioner panel
    const b = $('rpbtn'); b.setAttribute('aria-expanded', String(S.open)); b.setAttribute('aria-label', onFam() ? 'Show or hide practitioner details' : S.open ? 'Close side panel' : 'Open side panel'); b.title = b.getAttribute('aria-label');
    if (S.open) renderRP();
  }
  const onFam = () => location.hash.slice(1).split('/')[0] === 'fam';
  window.toggleRP = f => { if (onFam() && window.famShow) { const open = !!document.querySelector('#view-fam .famdrawer.open'); if (f === undefined ? open : !f) famClose(); else { (window.famOpenFirst || (() => famShow(Math.max(0, famSel))))(); const dr = document.querySelector('#view-fam .famdrawer.open'); if (dr && dr.getBoundingClientRect().top > innerHeight * 0.5) dr.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); } return; } S.open = f === undefined ? !S.open : !!f; ls.set('rp', S.open); applyRP(); };
  window.shOpen = (pid, lid) => {
    if (!pid) { const e = (D().enrol || []).find(x => x.learner_id === lid); pid = e ? e.programme_id : null; }
    Object.assign(S, { pid, lid, tab: 'Details', act: null, open: true }); ls.set('rp', true); applyRP();
  };
  window.shTab = t => { S.tab = t; renderRP(); };
  window.addEventListener('hashchange', () => { if (S.open) applyRP(); });

  function renderRP() {
    $('rptabs').innerHTML = ['Details', 'Activity', 'Assistant'].map(t => `<button role="tab" type="button" aria-selected="${t === S.tab}" class="${t === S.tab ? 'on' : ''}" onclick="shTab('${t}')">${t}</button>`).join('');
    const l = learner(S.lid), p = A() && S.pid ? A().prog(S.pid) : null, body = $('rpbody');
    if (!l) { const fam = location.hash.slice(1).split('/')[0] === 'fam'; body.innerHTML = `<div class="empty"><b>Nothing selected</b><span>${fam ? 'This panel shows learner details. To see a practitioner, click their name in the FAM Registry list.' : "Select a learner's name in Attendance &amp; PoE, EISA readiness or search (Ctrl K) to see their details here."}</span></div>`; return; }
    if (S.tab === 'Details') body.innerHTML = details(l, p);
    if (S.tab === 'Activity') activity(l, p);
    if (S.tab === 'Assistant') body.innerHTML = assistant(l, p);
  }
  function facts(l, p) {
    const a = A(); if (!p || !a) return null;
    const ss = a.sessOf(p.id); let rec = 0, here = 0, abs = 0;
    ss.forEach(s => { const v = a.AT(a.attFor(p.id, l.id, s.session_date)?.status); if (v) { rec++; if (v === 'A') abs++; else here++; } });
    const ms = a.modsOf(p.id), r = a.readiness(p, l);
    return { rate: rec ? Math.round(here / rec * 100) + '%' : '—', abs, lim: a.absenceLimit(p), ms, r, ready: r.c.every(Boolean) };
  }
  const CL = ['All KM components C', 'All PM components C', 'All WM components C', 'Every component assessed', 'Every module moderated', 'SoR issued on QCTO tracker'];
  const res = v => v ? `<span style="font-weight:600;color:${v === 'C' ? 'var(--ok)' : v === 'NYC' ? 'var(--bad)' : 'var(--warn)'}">${v}</span>` : '<span class="sub">—</span>';
  function head(l, p, f) {
    const st = !f ? '' : f.ready ? '<span class="badge b-ok">Ready</span>' : f.r.booked ? '<span class="badge b-warn">Booked, not ready</span>' : `<span class="badge b-warn">${f.r.c.filter(x => !x).length} open</span>`;
    const ini = ((l.first_name || '?')[0] + (l.last_name || ' ')[0]).toUpperCase();
    return `<div style="display:flex;align-items:center;gap:12px"><span class="avatar" style="background:var(--soft);color:var(--navy)">${esc(ini)}</span><div style="flex-grow:1;min-width:0"><b style="display:block;font-size:16px">${esc(nm(l))}</b><span class="sub">ID •••••••••${esc(String(l.id_number || '').slice(-4))} · ${p ? esc(short(p)) : 'No enrolment'}</span></div>${st}</div>`;
  }
  function details(l, p) {
    const f = facts(l, p), a = A();
    if (!f) return head(l, p, null) + '<div class="empty"><b>No programme</b><span>This learner is not enrolled on a programme in the preview.</span></div>';
    const rows = f.ms.map(m => { const r = a.resFor(p.id, l.id, m.module_number), ks = a.kindsOf(m);
      return `<tr><td>${m.module_number}</td>${['KM', 'PM', 'WM'].map(k => `<td>${ks.includes(k) ? res(r?.[a.COL[k]]) : '<span class="sub">n/a</span>'}</td>`).join('')}<td>${r?.fields?.['Internal moderation'] === 'Yes' ? 'Yes' : '<span class="sub">No</span>'}</td></tr>`; }).join('');
    return head(l, p, f) +
      `<div class="rpstat"><div><span class="sub">Attendance</span><b>${f.rate}</b></div><div><span class="sub">Absences</span><b>${f.abs} <span class="sub" style="font-size:12px;font-weight:400">of ${f.lim} allowed</span></b></div></div>
      <div><h3>Results</h3><table><thead><tr><th>Module</th><th>KM</th><th>PM</th><th>WM</th><th>Moderated</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="sub">No modules set up</td></tr>'}</tbody></table></div>
      <div><h3>EISA checklist</h3>${f.r.c.map((x, i) => `<div class="chk" title="${esc(a.why[i])}"><span class="dot ${x ? 'b-ok' : 'b-warn'}" style="width:12px;height:12px" aria-hidden="true"></span><span${x ? ' class="sub"' : ''}>${CL[i]}</span><span class="sr">${x ? 'met' : 'not met'}</span></div>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn y" type="button" onclick="dvApi.setProg(${p.id});dvGo('attendance','PoE tracker')">Open PoE tracker</button><button class="btn" type="button" onclick="dvApi.setProg(${p.id});dvGo('eisa','Readiness')">EISA readiness</button></div>`;
  }
  const TBL = { learners: 'Learner record', eisa: 'Result', attendance: 'Attendance', enrolments: 'Enrolment' };
  async function activity(l, p) {
    const body = $('rpbody'), key = l.id + ':' + (p ? p.id : '');
    const ob = D().outbox || [], wait = ob.filter(o => ['queued', 'retrying', 'processing'].includes(o.status)).length, bad = ob.filter(o => o.status === 'failed').length;
    const sync = ob.length ? `<div class="${wait || bad ? 'err' : 'note'}" style="display:flex;gap:8px;align-items:center;margin:0"><b>ClickUp sync:</b><span>${wait || bad ? `${wait} waiting${bad ? ', ' + bad + ' failed' : ''}` : 'up to date'}</span><a href="#dashboard" style="margin-left:auto">Details</a></div>` : '';
    body.innerHTML = head(l, p, facts(l, p)) + sync + '<div class="sub">Loading history…</div>';
    if (S.act && S.act.key === key) return draw(S.act);
    const eids = (D().eisaRes || []).filter(r => r.learner_id === l.id).map(r => r.id), aids = (D().att || []).filter(r => r.learner_id === l.id).map(r => r.id);
    const or = [`and(table_name.eq.learners,record_id.eq.${l.id})`].concat(eids.length ? [`and(table_name.eq.eisa,record_id.in.(${eids.join(',')}))`] : [], aids.length ? [`and(table_name.eq.attendance,record_id.in.(${aids.join(',')}))`] : []).join(',');
    let rows = [], note = '';
    if (has('head_of_ops')) {
      const r = await sb.from('audit_log').select('action,table_name,user_name,changes,created_at').or(or).order('created_at', { ascending: false }).limit(15);
      if (r.error) note = 'Could not load history: ' + r.error.message; else rows = r.data || [];
    } else note = 'Change history is visible to admin and head of operations.';
    S.act = { key, rows, note, l, p, sync }; if (S.tab === 'Activity' && S.lid === l.id) draw(S.act);
  }
  function draw(x) {
    const what = r => { const c = r.changes || {}, f = Object.keys(c.new || c || {}).filter(k => !['id', 'tenant_id', 'created_at', 'updated_at'].includes(k)).slice(0, 3);
      return `${esc(TBL[r.table_name] || r.table_name)} ${esc((r.action || '').toLowerCase())}${f.length ? ': ' + esc(f.join(', ')) : ''}`; };
    $('rpbody').innerHTML = head(x.l, x.p, facts(x.l, x.p)) + x.sync + `<div><h3>History</h3>${x.rows.length ? `<div class="tl">${x.rows.map(r => `<div>${what(r)}<div class="sub">${esc(r.user_name || 'system')} · ${fmt(r.created_at)} ${String(r.created_at || '').slice(11, 16)}</div></div>`).join('')}</div>` : `<div class="sub">${esc(x.note || 'No changes recorded yet.')}</div>`}</div>`;
  }
  function assistant(l, p) {
    const f = facts(l, p), a = A(); let ans = 'Not enrolled on a programme in the preview.';
    if (f) {
      const gaps = [];
      f.ms.forEach(m => { const r = a.resFor(p.id, l.id, m.module_number); a.kindsOf(m).forEach(k => { const v = r?.[a.COL[k]]; if (v !== 'C') gaps.push(`module ${m.module_number} ${k} is ${v ? a.RLAB[v].toLowerCase() : 'not recorded'}`); });
        if (r?.fields?.['Internal moderation'] !== 'Yes') gaps.push(`module ${m.module_number} is not moderated`); });
      if (!f.r.c[5]) gaps.push('the SoR is not issued on the QCTO tracker');
      ans = f.ready ? `${nm(l)} meets all six EISA criteria.` : `${nm(l)} is not EISA ready: ${gaps.slice(0, 6).join('; ')}.`;
      if (f.abs) ans += ` Attendance ${f.rate} with ${f.abs} absence${f.abs > 1 ? 's' : ''} (limit ${f.lim}).`;
    }
    return head(l, p, f) + `<div class="note" style="margin:0">The AI assistant is switched off in the preview. In the live app it answers questions about this screen's data. The answer below comes straight from the data.</div>
      <div style="align-self:flex-end;max-width:85%;background:var(--soft);color:var(--navy);border-radius:10px 10px 2px 10px;padding:8px 12px;font-size:13px">Why isn't ${esc(nm(l))} EISA ready?</div>
      <div style="max-width:92%;background:var(--ground);border:1px solid var(--line2);border-radius:10px 10px 10px 2px;padding:10px 12px;font-size:13px;line-height:1.5">${esc(ans)}</div>
      <label style="display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:6px 6px 6px 12px"><span class="sr">Ask the assistant</span><input disabled placeholder="Ask about this programme… (live app only)" style="flex-grow:1;min-width:0;border:0;background:transparent;font:inherit;font-size:13px"><button class="btn sm" type="button" disabled>Send</button></label>`;
  }

  /* ---------- My work ---------- */
  let mwRole = null, mwPick = {}, mwShowHidden = false;
  const hid = () => { const h = ls.get('hide', {}); return h.d === iso() ? h.ids || [] : []; };
  const roleOf = () => roles().includes('admin') ? 'admin' : (roles().some(r => ['qa_specialist', 'etqa'].includes(r)) ? 'qa' : 'pm');
  function tasks(role) {
    const a = A(), out = [], d = D(); if (!a) return out;
    const go = (pid, h, t) => `dvApi.setProg(${pid});dvGo('${h}','${t}')`;
    if (role === 'pm') active().forEach(p => {
      a.learnersOf(p.id).forEach(l => {
        a.modsOf(p.id).forEach(m => { const r = a.resFor(p.id, l.id, m.module_number); if (!r && !m.trained) return;
          a.kindsOf(m).forEach(k => { const v = r?.[a.COL[k]], at = `${nm(l)} · ${short(p)}`, cl = go(p.id, 'attendance', 'PoE tracker');
            if (!v) out.push({ id: `r${p.id}.${l.id}.${m.module_number}.${k}`, t: `Record module ${m.module_number} ${k} result`, s: at, k: 'Result', c: 'Record', on: cl, bad: 1 });
            else if (v === 'NYC') out.push({ id: `n${p.id}.${l.id}.${m.module_number}.${k}`, t: `Book reassessment: module ${m.module_number} ${k} (NYC)`, s: at, k: 'Result', c: 'Open', on: cl, bad: 1 });
            else if (v === 'RW') out.push({ id: `w${p.id}.${l.id}.${m.module_number}.${k}`, t: `Rework due: module ${m.module_number} ${k}`, s: at, k: 'Result', c: 'Open', on: cl });
            else if (v === 'NS') out.push({ id: `s${p.id}.${l.id}.${m.module_number}.${k}`, t: `Not submitted: module ${m.module_number} ${k}`, s: at, k: 'Result', c: 'Open', on: cl }); }); });
        const f = facts(l, p); if (f && f.abs > f.lim) out.push({ id: `a${p.id}.${l.id}`, t: `${f.abs} absences, over the ${f.lim}-day limit`, s: `${nm(l)} · ${short(p)}`, k: 'Attendance', c: 'Register', on: go(p.id, 'attendance', 'Register'), bad: 1 });
      });
      a.modsOf(p.id).forEach(m => (m.components || []).forEach(c => { if (!c.hours) out.push({ id: `h${p.id}.${m.module_number}.${c.kind}`, t: `Add hours for module ${m.module_number} ${c.kind}`, s: `Form 3 · ${short(p)}`, k: 'Form 3', c: 'Open', on: `location.hash='programmes';setTimeout(()=>{dvProg(${p.id});pTab='Form 3';renderProg()})`, bad: 1 }); }));
    });
    if (role === 'qa') {
      active().forEach(p => a.learnersOf(p.id).forEach(l => {
        a.modsOf(p.id).forEach(m => { const r = a.resFor(p.id, l.id, m.module_number); if (!r || r.fields?.['Internal moderation'] === 'Yes') return;
          const done = a.kindsOf(m).every(k => ['C', 'NYC'].includes(r[a.COL[k]]));
          out.push({ id: `m${p.id}.${l.id}.${m.module_number}`, t: `Moderate module ${m.module_number}`, s: `${nm(l)} · ${short(p)}${done ? '' : ' · waiting on results'}`, k: 'Moderation', c: done ? 'Moderate' : 'Open', on: go(p.id, 'attendance', 'PoE tracker'), bad: done ? 1 : 0 }); });
        const rr = a.readiness(p, l); if (rr.c.slice(0, 5).every(Boolean) && !rr.c[5]) out.push({ id: `o${p.id}.${l.id}`, t: 'Issue SoR on the QCTO tracker', s: `${nm(l)} · ${short(p)} · all other criteria met`, k: 'Tracker', c: 'Update', on: `location.hash='qcto'`, bad: 1 });
      }));
      const open = (d.recs || []).filter(r => !r.resolved).length;
      if (open) out.push({ id: 'recs', t: `Close ${open} open recommendation${open > 1 ? 's' : ''}`, s: 'From monitoring visits', k: 'Recommendation', c: 'Review', on: `location.hash='recs'`, bad: 1 });
    }
    if (role === 'admin') {
      const w = typeof soWaiting === 'function' ? soWaiting() : 0, ret = (d.signoffs || []).filter(s => s.status === 'returned').length;
      if (w) out.push({ id: 'sow', t: `${w} sign-off item${w > 1 ? 's' : ''} waiting for a decision`, s: 'Sign-off queue', k: 'Sign-off', c: 'Review', on: `location.hash='signoff'`, bad: 1 });
      if (ret) out.push({ id: 'sor', t: `${ret} sign-off item${ret > 1 ? 's' : ''} returned`, s: 'Waiting on the sender to resubmit', k: 'Sign-off', c: 'View', on: `location.hash='signoff'` });
      const ob = d.outbox || [], wait = ob.filter(o => ['queued', 'retrying'].includes(o.status)).length, bad = ob.filter(o => o.status === 'failed').length;
      if (wait || bad) out.push({ id: 'sync', t: `ClickUp sync: ${wait} waiting${bad ? ', ' + bad + ' failed' : ''}`, s: 'Usually the ClickUp rate limit; retries every 2 minutes', k: 'Sync', c: 'Details', on: `location.hash='dashboard'`, bad: bad ? 1 : 0 });
      if (window.qaLeisaCheck) active().forEach(p => a.learnersOf(p.id).forEach(l => { const e = window.qaLeisaCheck(l.id, p.id); const n = e ? e[0].length : 0;
        if (n) out.push({ id: `x${p.id}.${l.id}`, t: `Fix LEISA data (${n} issue${n > 1 ? 's' : ''})`, s: `${nm(l)} · ${short(p)} · ${e[0][0]}`, k: 'LEISA', c: 'Fix', on: go(p.id, 'eisa', 'LEISA file') }); }));
      const dq = (d.dq || []).length; if (dq) out.push({ id: 'dq', t: `Review ${dq} possible data-quality issue${dq > 1 ? 's' : ''}`, s: 'Data quality review', k: 'Data quality', c: 'Review', on: `location.hash='dq'` });
    }
    return out;
  }
  function banner() {
    const w = (D().windows || []).filter(x => (x.registration_closing || x.eisa_date) >= iso()).sort((a, b) => a.eisa_date < b.eisa_date ? -1 : 1)[0];
    if (!w || !A()) return '';
    const days = Math.max(0, Math.round((new Date(w.registration_closing || w.eisa_date) - new Date(iso())) / 864e5));
    let ready = 0, booked = 0, not = 0, n = 0;
    active().forEach(p => A().learnersOf(p.id).forEach(l => { const r = A().readiness(p, l); n++; if (r.booked) booked++; else if (r.c.every(Boolean)) ready++; else not++; }));
    return `<div class="mwban"><div class="days">${days}<small>DAY${days === 1 ? '' : 'S'}</small></div><div style="flex:1 1 300px"><b style="font-size:15px;display:block">EISA bookings for ${fmt(w.eisa_date)} close on ${fmt(w.registration_closing)}</b><span style="font-size:13px;color:#E4E4F4">${ready} ready · ${booked} booked · ${not} not ready across ${active().length} active programme${active().length === 1 ? '' : 's'}</span></div><button class="btn y" type="button" onclick="dvGo('eisa','Readiness')">Review readiness</button></div>`;
  }
  window.mwRoleSet = r => { mwRole = r; mwPick = {}; renderMW(); };
  window.mwToggle = id => { mwPick[id] = !mwPick[id]; renderMW(); };
  window.mwHide = () => { const ids = hid().concat(Object.keys(mwPick).filter(k => mwPick[k])); ls.set('hide', { d: iso(), ids }); mwPick = {}; renderMW(); window.toast('Hidden until tomorrow'); };
  window.mwClear = () => { mwPick = {}; renderMW(); };
  window.mwShow = () => { mwShowHidden = !mwShowHidden; renderMW(); };
  window.mwUnhide = () => { ls.set('hide', { d: iso(), ids: [] }); mwShowHidden = false; renderMW(); };
  function renderMW() {
    if (!$('mwtasks')) return;
    const mine = roleOf(); if (!mwRole || (mine !== 'admin' && mwRole !== mine)) mwRole = mine;
    const now = new Date(), h = now.getHours(), who = ((P.user && P.user.email) || '').split(/[@+.]/)[0];
    $('mwgreet').textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (who ? ', ' + who[0].toUpperCase() + who.slice(1) : '');
    const all = tasks(mwRole), hidden = hid(), list = all.filter(t => mwShowHidden || !hidden.includes(t.id)), nHid = all.length - all.filter(t => !hidden.includes(t.id)).length;
    $('mwdate').textContent = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + (all.length - nHid) + ' thing' + (all.length - nHid === 1 ? '' : 's') + ' need you today';
    $('mwroles').innerHTML = mine === 'admin' ? '<span class="sub" style="align-self:center;padding:0 8px">View as</span>' + [['pm', 'Project manager'], ['qa', 'QA / ETQA'], ['admin', 'Admin']].map(([k, t]) => `<button type="button" aria-pressed="${k === mwRole}" class="${k === mwRole ? 'on' : ''}" onclick="mwRoleSet('${k}')">${t}</button>`).join('') : '';
    $('mwroles').hidden = mine !== 'admin';
    $('mwbanner').innerHTML = banner();
    const sel = list.filter(t => mwPick[t.id]).length;
    $('mwhead').innerHTML = sel ? `<b style="flex-grow:1;color:var(--navy)">${sel} selected</b><button class="btn sm" type="button" onclick="mwHide()">Hide for today</button><button class="btn sm ghost" type="button" onclick="mwClear()">Clear</button>`
      : `<h2 style="flex-grow:1;font-size:15px;margin:0">My tasks <span class="sub" style="font-weight:400">${all.length - nHid}</span></h2>${nHid ? `<button class="btn sm ghost" type="button" onclick="mwShow()">${mwShowHidden ? 'Hide' : 'Show'} ${nHid} hidden</button>${mwShowHidden ? '<button class="btn sm ghost" type="button" onclick="mwUnhide()">Unhide all</button>' : ''}` : ''}`;
    $('mwtasks').innerHTML = list.length ? list.map((t, i) => `<div class="mwtask${mwPick[t.id] ? ' sel' : ''}"><input type="checkbox" id="mwt${i}"${mwPick[t.id] ? ' checked' : ''} onchange="mwToggle('${t.id}')"><span class="mwdot" style="background:${t.bad ? 'var(--warn)' : 'var(--line)'}" aria-hidden="true"></span><label for="mwt${i}"><b style="display:block;font-size:13px${hidden.includes(t.id) ? ';color:var(--muted)' : ''}">${esc(t.t)}</b><span class="sub">${esc(t.s)}</span></label><span class="k">${t.k}</span><a href="#" onclick="${t.on};return false" style="font-size:13px;font-weight:600;white-space:nowrap">${t.c}</a></div>`).join('')
      : '<div class="empty" style="padding:28px"><b>All clear</b><span>Nothing needs you right now.</span></div>';
    const a = A();
    $('mwprogs').innerHTML = a ? active().map(p => { const lsn = a.learnersOf(p.id), at = a.attendance(p), rd = lsn.filter(l => a.readiness(p, l).c.every(Boolean)).length;
      return `<a class="mwprog" href="#programmes" onclick="setTimeout(()=>dvProg(${p.id}))"><b style="display:block;font-size:13px">${esc(short(p))}</b><span class="sub">${lsn.length} learner${lsn.length === 1 ? '' : 's'} · ${at.rate === null ? '—' : at.rate + '%'} attendance · ${rd} of ${lsn.length} EISA ready</span><span class="mwbar"><i style="width:${lsn.length ? Math.max(2, Math.round(rd / lsn.length * 100)) : 0}%"></i></span></a>`; }).join('') || '<div class="empty" style="padding:20px"><span>No active programmes</span></div>' : '';
    const L = { pm: [['Attendance register', "dvGo('attendance','Register')"], ['PoE tracker', "dvGo('attendance','PoE tracker')"], ['EISA readiness', "dvGo('eisa','Readiness')"]],
      qa: [['Moderation & Verification', "location.hash='modver'"], ['QCTO Tracker', "location.hash='qcto'"], ['LEISA file', "dvGo('eisa','LEISA file')"]],
      admin: [['Sign-off queue', "location.hash='signoff'"], ['Data quality', "location.hash='dq'"], ['Accreditation', "location.hash='accred'"]] }[mwRole];
    $('mwlinks').innerHTML = L.map(([t, f]) => `<a href="#" onclick="${f};return false">${t}</a>`).join('');
  }

  /* ---------- hooks ---------- */
  window.previewShell = function () { renderMW(); if (S.open) { S.act = null; renderRP(); } };
  const _route = window.route;
  window.route = function () { _route(); if (location.hash === '#mywork') renderMW(); };
  addEventListener('resize', () => { if (ls.get('rail', null) === null) applyRail(); });
  applyRail(); applyRP();
})();
