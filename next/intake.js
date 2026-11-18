/* Learner intake (#intake, admin only). Built 18 Nov 2026.
   Rows = upcoming/running ApexOne programmes on a timeline (like the FAM Calendar); click one to fill it from the
   ClickUp Recruitment Candidates pool. Candidates are READ-ONLY from ClickUp via the clickup-relay function: nothing is
   written to ClickUp. "Place" records a placement in ApexOne (intake_placements); "Enrol" creates the learner +
   enrolment in ApexOne (relay action 'enrol', which only reads the candidate task). Eligibility is fixed rules, no AI. */
(function () {
  if (window.__intake) return; window.__intake = 1;
  const I = { skip: {}, restOpen: false, st: 'idle', tab: 'time', wk: 13, from: null, sel: null, pool: '', more: 0, f: { client: '', nqf: '', prov: '', pwd: false, bpwd: false, q: '', need: false, all: false, emp: false }, rows: 25 };
  const $ = id => document.getElementById(id);
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const today = () => ymd(new Date());
  const addD = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
  const monday = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return ymd(x); };
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const sb = () => window.__sb;
  const isRec = () => (((window.__preview || {}).roles) || []).includes('recruitment');
  const isAdmin = () => !!window.apxRole && (apxRole() === 'admin' || isRec());   /* admins + recruitment role */
  const PROV = [['Gauteng', /gauteng|johannesburg|joburg|pretoria|tshwane|sandton|midrand|soweto|ekurhuleni/i], ['Western Cape', /western cape|cape town|stellenbosch|paarl/i], ['KwaZulu-Natal', /kwazulu|kzn|durban|pietermaritzburg/i], ['Eastern Cape', /eastern cape|gqeberha|port elizabeth|east london|mthatha/i], ['Free State', /free state|bloemfontein/i], ['Limpopo', /limpopo|polokwane/i], ['Mpumalanga', /mpumalanga|mbombela|nelspruit|witbank|emalahleni/i], ['North West', /north west|rustenburg|mahikeng|mafikeng/i], ['Northern Cape', /northern cape|kimberley|upington/i]];
  const provOf = s => { const p = PROV.find(([, r]) => r.test(String(s || ''))); return p ? p[0] : ''; };

  /* ---------- rules ---------- */
  const DEMX = /unsuitable|exited|archived/i, RECR = /^recruited/i;
  const active = c => !DEMX.test(c.status || '');
  /* highest qualification from the free-text Tertiary + "Highest Qualification - Specify" fields; anything unclear = Unknown */
  const hqOf = c => { if (c._hq !== undefined) return c._hq; const s = `${c.hq || ''} ${c.tertiary || ''}`.toLowerCase();
    return (c._hq = /\b(phd|doctor|master|honours|hons|postgrad|post-grad|bachelor|degree|llb|mba|b\.?\s?(com|sc|a|ed|tech|admin|soc sc)\b)/.test(s) ? 'Degree'
      : /diploma|advanced cert/.test(s) ? 'Diploma' : /higher cert/.test(s) ? 'Higher Certificate' : /\bn\s?[4-6]\b|\bncv\b|nated/.test(s) ? 'N4–N6 / NCV' : ''); };
  const NQF_HQ = { 'Degree': 7, 'Diploma': 6, 'Higher Certificate': 5, 'N4–N6 / NCV': 4 };
  const tertOK = c => ['Degree', 'Diploma', 'Higher Certificate'].includes(hqOf(c));
  const level = c => tertOK(c) ? 'tert' : hqOf(c) ? 'n46' : /matric|senior certificate/i.test(c.school || '') ? 'matric' : /grade 1[01]/i.test(c.school || '') ? 'g1011' : '';
  const placedTask = id => (I.P || []).some(p => p.task_id === id);
  const ready = c => active(c) && !RECR.test(c.status || '') && !c.onP && !placedTask(c.id);
  const wait = c => c.created ? days(c.created, today()) : 0;
  const nqfN = p => { const m = String(p.nqf_level || '').match(/\d+/); return m ? +m[0] : null; };
  const pwdProg = p => /\bpwd\b|disab/i.test([p.programme_name, p.group_name, p.qualification_name, JSON.stringify((p.fields || {}).demographics || ''), (p.fields || {}).type || ''].join(' '));
  const progProv = p => { const f = p.fields || {}, c = I.CL.get(p.client_id); return provOf([f.facilitationVenue, f.inductionVenue, f.workplaceVenue, f.delivery].join(' ')) || provOf(c ? JSON.stringify(c.fields || {}) : ''); };
  const fitsLevel = (c, n) => { const l = level(c); return n == null ? true : n >= 5 ? l === 'tert' : n === 4 ? (l === 'matric' || l === 'n46' || l === 'tert') : !!l; };
  const bpwd = c => c.pwd && c.race === 'Black';
  const candF = c => (!I.f.pwd || c.pwd) && (!I.f.bpwd || bpwd(c)) && (!I.f.prov || provOf(c.province) === I.f.prov) && (!I.f.q || I.tab !== 'cand' || String(c.name).toLowerCase().includes(I.f.q.toLowerCase()));
  const eligible = p => { const n = nqfN(p), pw = pwdProg(p), pp = progProv(p);
    return I.C.filter(c => ready(c) && candF(c) && fitsLevel(c, n) && (!pw || c.pwd))
      
      .sort((a, b) => (pp ? (provOf(b.province) === pp) - (provOf(a.province) === pp) : 0) || fit(b, n) - fit(a, n) || wait(b) - wait(a)); };
  /* education fit: the closest level to the programme ranks first (avoids using up degree holders on NQF 2-4 programmes) */
  const fit = (c, n) => { const l = level(c); return n == null ? 0 : n >= 5 ? (l === 'tert' ? 1 : 0) : n === 4 ? (l === 'matric' || l === 'n46' ? 2 : l === 'tert' ? 1 : 0) : (l === 'g1011' || l === 'matric' ? 2 : 1); };
  /* employment status from the PM masterlist: unemployed and mixed cohorts are filled from candidates; employed cohorts are the client's own staff (top-up only, hidden by default) */
  const empK = p => { const v = String((p.fields || {}).employment || '').toLowerCase(); return !v ? '' : /un\s*\/\s*em|&|\band\b|mix|\d.*employ.*\d/.test(v) || (/unemploy/.test(v) && /(^|[^n])employ/.test(v.replace(/unemploy/g, ''))) ? 'mixed' : /unemp|unempl/.test(v) ? 'unemp' : /empl|emply/.test(v) ? 'emp' : ''; };
  const notLoaded = p => /^done$/i.test(String((p.fields || {}).learnersEnrolled || '').trim()) && !(I.EN.get(p.id) || 0);
  const places = p => { const tg = +p.group_size || 0, en = I.EN.get(p.id) || 0, pl = (I.P || []).filter(x => x.programme_id === p.id && x.status === 'placed').length, nl = notLoaded(p); return { tg, en, pl, nl, open: nl ? 0 : Math.max(0, tg - en - pl) }; };
  const needs = p => { const s = places(p); return empK(p) !== 'emp' && s.tg > 0 && s.open > 0 && p.start_date >= today() && p.start_date <= addD(today(), 30); };

  /* ---------- data ---------- */
  async function load(force) {
    if (I.st === 'loading' || (I.st === 'ok' && !force)) return; I.st = 'loading'; paint();
    try {
      const t = today(), lim = addD(t, 182);
      const [rl, pr, en, cl, pl, rq] = await Promise.all([
        sb().functions.invoke('clickup-relay', { body: {} }),
        sb().from('programmes').select('id,programme_name,display_id,client_id,nqf_level,group_size,group_name,start_date,end_date,status,qualification_name,fields').is('deleted_at', null).not('start_date', 'is', null).lte('start_date', lim).or('end_date.is.null,end_date.gte.' + t).order('start_date'),
        sb().from('enrolments').select('programme_id,status').range(0, 19999),
        sb().from('clients').select('id,client_name,fields'),
        sb().from('intake_placements').select('*').order('placed_at'), sb().from('intake_requests').select('programme_id,source,created_at')]);
      const d = rl.data;
      if (rl.error || !d || !d.ok) { I.st = d && d.reason === 'not_connected' ? 'off' : 'err'; paint(); return; }
      I.C = d.candidates || []; I.at = d.at; I.adm = !!d.admin;
      I.PR = (pr.data || []).filter(p => String(p.status || '') !== 'closed');
      I.EN = new Map(); (en.data || []).forEach(x => { if ((x.status || 'active') === 'active') I.EN.set(x.programme_id, (I.EN.get(x.programme_id) || 0) + 1); });
      I.CL = new Map((cl.data || []).map(c => [c.id, c])); I.P = pl.data || []; I.RQ = rq.data || []; I.st = 'ok';
    } catch (_) { I.st = 'err'; }
    paint(); try { renderNav(curNav); } catch (_) {}
  }
  async function reloadP() { try { const { data } = await sb().from('intake_placements').select('*').order('placed_at'); I.P = data || []; } catch (_) {} paint(); try { renderNav(curNav); } catch (_) {} }

  /* ---------- actions ---------- */
  const say = m => { try { (window.toast || window.say || alert)(m); } catch (_) { alert(m); } };
  window.intk = (k, v) => {
    if (k === 'tab') { I.tab = v; I.more = 0; } else if (k === 'sel') { I.sel = I.sel === v ? null : v; I.more = 0; }
    else if (k === 'wk') I.wk = +v; else if (k === 'move') I.from = addD(I.from, v * 7); else if (k === 'today') I.from = monday(today());
    else if (k === 'pool') { I.pool = I.pool === v ? '' : v; I.more = 0; } else if (k === 'more') I.more++;
    else if (k === 'need') { I.f.need = !I.f.need; I.tab = 'time'; I.rows = 25; } else if (k === 'all') { I.f.all = !I.f.all; I.rows = 25; } else if (k === 'emp') { I.f.emp = !I.f.emp; I.rows = 25; } else if (k === 'req') { I.f.req = !I.f.req; I.tab = 'time'; I.rows = 25; } else if (k === 'rows') I.rows += 25; else if (k === 'refresh') { load(true); return; }
    else if (k in I.f) { I.f[k] = k === 'pwd' || k === 'bpwd' ? !!v : v; I.more = 0; }
    paint();
  };
  window.intkSwap = (pid, tid) => { (I.skip[pid] = I.skip[pid] || []).push(tid); paint(); };
  window.intkRest = o => { I.restOpen = o; };
  window.intkPlaceAll = async pid => { const p = I.PR.find(x => x.id === pid); if (!p) return; const s = places(p), sk = I.skip[pid] || [], SL = eligible(p).filter(c => !sk.includes(c.id)).slice(0, s.open);
    if (!SL.length || !confirm(`Reserve ${SL.length} candidate${SL.length === 1 ? '' : 's'} for ${p.programme_name}? Saved in ApexOne only; ClickUp is not changed.`)) return;
    const { error } = await sb().from('intake_placements').insert(SL.map(c => ({ task_id: c.id, programme_id: pid, candidate_name: c.name })));
    if (error) say('Could not reserve: ' + error.message); reloadP(); };
  window.intkPlace = async (tid, pid) => { const c = I.C.find(x => x.id === tid);
    const { error } = await sb().from('intake_placements').insert({ task_id: tid, programme_id: pid, candidate_name: c ? c.name : null });
    if (error) say(/duplicate|unique/i.test(error.message) ? 'This candidate is already placed on a programme.' : 'Could not place: ' + error.message); reloadP(); };
  window.intkDrop = async id => { if (!confirm('Remove this placement? The candidate goes back into the pool. ClickUp is not changed.')) return;
    const { error } = await sb().from('intake_placements').delete().eq('id', id); if (error) say('Could not remove: ' + error.message); reloadP(); };
  window.intkEnrol = async (tid, pid) => { const p = I.PR.find(x => x.id === pid);
    if (!confirm(`Enrol this candidate on ${p ? p.programme_name : 'this programme'}? This creates the learner (or reuses the existing record) and the enrolment in ApexOne. ClickUp is not changed.`)) return;
    I.busy = tid; paint();
    try { const { data, error } = await sb().functions.invoke('clickup-relay', { body: { action: 'enrol', task_id: tid, programme_id: pid } });
      if (error || !data || !data.ok) say('Could not enrol: ' + ((data && (data.detail || data.reason)) || (error && error.message) || 'unknown error'));
      else { say(data.created ? 'Learner created and enrolled.' : 'Existing learner enrolled.'); I.EN.set(pid, (I.EN.get(pid) || 0) + 1); }
    } catch (err) { say('Could not enrol: ' + err.message); }
    I.busy = null; reloadP(); };

  /* ---------- view ---------- */
  const chip = (lbl, n, on, js, cls) => `<button type="button" class="intchip${on ? ' on' : ''}${cls ? ' ' + cls : ''}" onclick="${js}"><b>${n}</b><span>${lbl}</span></button>`;
  const sel = (k, opts, cur, lbl) => `<select aria-label="${lbl}" class="intsel" onchange="intk('${k}',this.value)"><option value="">${lbl}</option>${opts.map(([v, l]) => `<option value="${e(v)}"${String(cur) === String(v) ? ' selected' : ''}>${e(l)}</option>`).join('')}</select>`;
  const badge = (cls, t, tip) => `<span class="badge ${cls}"${tip ? ` title="${e(tip)}"` : ''}>${e(t)}</span>`;
  const lvlTxt = c => { const l = level(c); return l === 'tert' || l === 'n46' ? hqOf(c) : l === 'matric' ? 'Matric' : l === 'g1011' ? c.school : 'Unknown'; };
  const flags = c => (c.onP ? badge('b-bad', 'On a programme', 'Already enrolled on a running ApexOne programme') : c.isL ? badge('b-warn', 'Already a learner', 'Has an ApexOne learner record from an earlier programme') : '')
    + (RECR.test(c.status || '') ? badge('b-n', 'Recruited in ClickUp') : '') + (placedTask(c.id) ? badge('b-n', 'Placed') : '');
  const cuLink = c => /^https:\/\/app\.clickup\.com\//.test(c.url || '') ? `<a href="${e(c.url)}" target="_blank" rel="noopener">ClickUp</a>` : '';
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const mix = L => { const n = L.length, k = fn => { const x = L.filter(fn).length; return `<b>${x}</b> (${pct(x, n)})`; }, bl = c => c.race === 'Black';
    return `<div class="intmix" title="B-BBEE Skills Development groups (no client targets are stored, so these are counts in the pool)"><span>${k(bl)} Black</span><span>${k(c => bl(c) && c.gender === 'F')} Black women</span><span>${k(bpwd)} Black PwD</span><span>${k(c => c.pwd)} PwD</span><span>${k(c => c.age && c.age >= 18 && c.age <= 35)} youth 18–35</span><span>${k(c => wait(c) > 30)} waiting 30+ days</span></div>`; };

  function progRows() {
    const q = I.f.q.toLowerCase();
    return I.PR.filter(p => (!I.f.client || String(p.client_id) === I.f.client) && (!I.f.nqf || String(nqfN(p)) === I.f.nqf) && (!I.f.need || needs(p)) && (!I.f.req || (I.RQ || []).some(r => r.programme_id === p.id)) && (I.f.emp || I.f.req || empK(p) !== 'emp') && (I.f.all || I.f.need || I.f.req || (places(p).tg > 0 && places(p).open > 0))
      && (!q || I.tab !== 'time' || `${p.programme_name} ${p.display_id || ''} ${p.group_name || ''} ${(I.CL.get(p.client_id) || {}).client_name || ''}`.toLowerCase().includes(q)));
  }
  function timeline() {
    const from = I.from || (I.from = monday(today())), span = I.wk * 7, to = addD(from, span), P = progRows();
    const x = d => Math.max(0, Math.min(100, days(from, d) / span * 100)), tp = today() >= from && today() < to ? x(today()) : null;
    const wks = [...Array(I.wk)].map((_, i) => addD(from, i * 7)), step = I.wk > 13 ? 4 : I.wk > 4 ? 2 : 1;
    const PW = P.filter(p => p.start_date < to && (!p.end_date || p.end_date >= from)), nAll = I.PR.filter(p => p.start_date < to && (!p.end_date || p.end_date >= from)).length;
    const rows = PW.slice(0, I.rows).map(p => {
      const s = places(p), l = x(p.start_date > from ? p.start_date : from), r = p.end_date ? x(p.end_date < to ? p.end_date : to) : 100;
      const cls = !s.tg || s.nl ? 'n' : !s.open ? 'ok' : needs(p) ? 'bad' : 'warn', ek = empK(p), cl = (I.CL.get(p.client_id) || {}).client_name || '';
      const lab = s.nl ? 'Enrolled per PM Tracker – list not loaded' : s.tg ? `${s.en + s.pl} / ${s.tg}${s.open ? ` · ${s.open} open` : ' · full'}` : `${s.en} enrolled · no target`;
      return `<div class="introw${I.sel === p.id ? ' on' : ''}"><button type="button" class="intname" onclick="intk('sel',${p.id})" title="${e([p.programme_name, p.display_id, cl, nqfN(p) ? 'NQF ' + nqfN(p) : ''].filter(Boolean).join(' · '))}">${e(p.programme_name)} <span class="sub">${e([cl, nqfN(p) ? 'NQF ' + nqfN(p) : '', (I.RQ || []).some(r => r.programme_id === p.id) ? 'Request' : '', ek === 'mixed' ? 'Mixed' : ek === 'emp' ? 'Employed (top-up)' : ek ? '' : 'Status not set'].filter(Boolean).join(' · '))}</span></button>`
        + `<div class="inttrack">${tp != null ? `<i class="inttoday" style="left:${tp}%"></i>` : ''}<button type="button" class="intbar ${cls}" style="left:${l}%;width:${Math.max(r - l, 2)}%" onclick="intk('sel',${p.id})" title="${e(`${p.programme_name}\n${fmt(p.start_date)} – ${fmt(p.end_date)}\n${lab}`)}">${e(lab)}</button></div></div>`;
    }).join('');
    return `<div class="intnav"><button class="btn sm" onclick="intk('move',-${step})">‹</button><button class="btn sm" onclick="intk('today')">Today</button><button class="btn sm" onclick="intk('move',${step})">›</button>
      <span class="sub" style="flex-grow:1">${fmt(from)} – ${fmt(addD(to, -1))}</span>${[4, 13, 26].map(w => `<button class="btn sm${I.wk === w ? ' on' : ''}" onclick="intk('wk',${w})">${w} wk</button>`).join('')}</div>
      <div class="introw inthead"><div class="intname"></div><div class="inttrack">${wks.map((w, i) => i % step ? '' : `<span style="left:${x(w)}%">${fmt(w).replace(/ \d{4}$/, '')}</span>`).join('')}</div></div>
      ${rows || '<div class="sub" style="padding:18px">No programmes in this window for these filters.</div>'}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">${PW.length > I.rows ? `<button class="btn sm" onclick="intk('rows')">Show ${Math.min(25, PW.length - I.rows)} more (${PW.length - I.rows} left)</button>` : ''}<button class="btn sm" onclick="intk('emp')">${I.f.emp ? 'Hide employed cohorts' : 'Include employed cohorts (top-up)'}</button><button class="btn sm" onclick="intk('all')">${I.f.all ? 'Show only programmes needing learners' : `Show all ${nAll} programmes`}</button><span class="sub">${I.f.all ? 'Showing every programme in this window.' : I.f.need ? 'Showing programmes starting within 30 days with places open.' : 'Showing unemployed and mixed cohorts with learner places open.'}</span></div>
      <div class="sub" style="margin-top:8px">Bars: <b>enrolled + placed / target</b> (programme group size). Red = starts within 30 days with places open, amber = places open, green = full, grey = no target set.</div>`;
  }
  function panel() {
    const p = I.PR.find(x => x.id === I.sel); if (!p) return '';
    const s = places(p), L = eligible(p), pp = progProv(p), n = nqfN(p), PL = (I.P || []).filter(x => x.programme_id === p.id), sk = I.skip[p.id] || [];
    const SL = s.open ? L.filter(c => !sk.includes(c.id)).slice(0, s.open) : [], rest = L.filter(c => !SL.includes(c)), shown = rest.slice(0, 25 + I.more * 25);
    const rule = [n == null ? 'any education level' : n >= 5 ? 'Higher Certificate or above (NQF ' + n + ')' : n === 4 ? 'matric or higher (NQF 4)' : 'Grade 10 or higher (NQF ' + n + ')', pwdProg(p) ? 'people with disabilities only' : '', pp ? 'same province (' + pp + ') first' : ''].filter(Boolean).join(' · ');
    const why = c => [pp && provOf(c.province) === pp ? 'Same province' : '', c.pwd ? 'PwD' : '', lvlTxt(c), 'Waiting ' + wait(c) + ' days'].filter(Boolean).map(t => `<span class="inttag">${e(t)}</span>`).join('');
    const line = c => e([lvlTxt(c), c.pwd ? 'PwD' : '', c.province, c.age ? c.age + ' yrs' : '', wait(c) + ' days'].filter(Boolean).join(' · '));
    const cu = c => /^https:\/\/app\.clickup\.com\//.test(c.url || '') ? ` <a href="${e(c.url)}" target="_blank" rel="noopener" title="Open in ClickUp (read-only)" class="intcu">↗</a>` : '';
    const res = (c, lbl) => `<button class="btn sm" title="Reserve this person for this programme. Saved in ApexOne only; ClickUp is not changed." onclick="intkPlace('${e(c.id)}',${p.id})">${lbl || 'Reserve'}</button>`;
    const bl = c => c.race === 'Black', cnt = fn => L.filter(fn).length;
    return `<aside class="card intpanel"><div style="display:flex;gap:8px;align-items:flex-start"><div style="flex-grow:1"><b style="font-size:16px">Fill this intake</b><div class="sub">${e(p.programme_name)}</div></div><button class="btn sm" onclick="intk('sel',${p.id})" aria-label="Close">✕</button></div>
      <div class="sub" style="margin:6px 0">${e([(I.CL.get(p.client_id) || {}).client_name, fmt(p.start_date) + ' – ' + fmt(p.end_date), ({ unemp: 'Unemployed', mixed: 'Mixed', emp: 'Employed (top-up)' })[empK(p)] || ''].filter(Boolean).join(' · '))}${(I.RQ || []).some(r => r.programme_id === p.id) ? ' ' + badge('b-warn', 'Hand-over request') : ''}</div>
      <div class="intmix"><span><b>${s.tg || '—'}</b> target</span><span><b>${s.en}</b> enrolled</span><span><b>${s.pl}</b> reserved</span><span><b>${s.tg ? s.open : '—'}</b> open</span></div>
      ${PL.length ? `<div style="margin-top:10px"><b>Reserved and enrolled</b>${PL.map(x => { const c = I.C.find(y => y.id === x.task_id) || { name: x.candidate_name, id: x.task_id };
        return `<div class="intcand"><div style="flex-grow:1;min-width:0"><b>${e(c.name || x.candidate_name)}</b> ${x.status === 'enrolled' ? badge('b-ok', 'Enrolled') : badge('b-warn', 'Reserved')}${cu(c)}<div class="sub intline">${c.created ? line(c) : ''}</div></div>${x.status === 'placed' ? `<button class="btn sm" ${I.busy === x.task_id ? 'disabled' : ''} onclick="intkEnrol('${e(x.task_id)}',${p.id})">${I.busy === x.task_id ? 'Enrolling…' : 'Enrol'}</button><button class="btn sm" onclick="intkDrop(${x.id})">Remove</button>` : ''}</div>`; }).join('')}</div>` : ''}
      <div style="margin-top:12px"><b>${L.length} eligible</b> <span class="sub">· ${e(rule)}</span><div class="intmix"><span><b>${cnt(c => c.pwd && bl(c))}</b> Black PwD</span><span><b>${cnt(c => bl(c) && c.gender === 'F')}</b> Black women</span><span><b>${cnt(c => c.pwd)}</b> PwD</span>${pp ? `<span><b>${cnt(c => provOf(c.province) === pp)}</b> in ${e(pp)}</span>` : ''}</div></div>
      ${SL.length ? `<div class="intshort"><div style="display:flex;gap:8px;align-items:center"><b style="flex-grow:1">Suggested for the ${s.open} open place${s.open === 1 ? '' : 's'}</b><button class="btn sm" onclick="intkPlaceAll(${p.id})">Reserve all ${SL.length}</button></div>
        ${SL.map(c => `<div class="intcand"><div style="flex-grow:1;min-width:0"><b>${e(c.name)}</b> ${flags(c)}${cu(c)}<div class="inttags">${why(c)}</div></div><button class="btn sm" title="Swap for the next best candidate" onclick="intkSwap(${p.id},'${e(c.id)}')">Swap</button>${res(c)}</div>`).join('')}
        <div class="sub" style="margin-top:6px">Ranked by fixed rules: ${pp ? 'same province, ' : ''}${pwdProg(p) ? 'PwD, ' : ''}education fit, then longest waiting. No AI.</div></div>` : s.tg ? `<div class="sub" style="margin-top:8px">No open places${s.nl ? ' (PM Tracker says learners are enrolled; list not loaded)' : ''}.</div>` : ''}
      ${rest.length ? `<details class="intrest"${I.restOpen ? ' open' : ''} ontoggle="intkRest(this.open)"><summary><b>Other eligible (${rest.length})</b></summary>
        ${shown.map(c => `<div class="intcand"><div style="flex-grow:1;min-width:0"><b>${e(c.name)}</b> ${flags(c)}${cu(c)}<div class="sub intline">${line(c)}</div></div>${res(c)}</div>`).join('')}
        ${rest.length > shown.length ? `<button class="btn sm" style="margin-top:8px" onclick="intk('more')">Show ${Math.min(25, rest.length - shown.length)} more</button>` : ''}</details>` : ''}
      <div class="sub" style="margin-top:10px">Reserve holds a person for this programme in ApexOne. Enrol creates the learner and enrolment in ApexOne. Recruitment Candidates in ClickUp is never changed.</div></aside>`;
  }
  function candidates() {
    const R = I.C.filter(c => ready(c) && candF(c)), POOLS = [['pwd', 'People with disabilities', 'Disability learnerships', c => c.pwd], ['matric', 'Matric or higher', 'NQF 4 learnerships', c => ['matric', 'n46', 'tert'].includes(level(c))],
      ['g1011', 'Grade 10–11', 'NQF 2–3', c => level(c) === 'g1011'], ['tert', 'Higher Certificate or above', 'NQF 5+', c => level(c) === 'tert'], ['bpwd', 'Black people with disabilities', 'B-BBEE priority group', bpwd], ['none', 'Education unknown', 'Ask recruitment to complete', c => !level(c)]];
    const cards = POOLS.map(([k, t, s, fn]) => { const L = R.filter(fn); return `<button type="button" class="card intpool${I.pool === k ? ' on' : ''}" onclick="intk('pool','${k}')"><b style="font-size:24px">${L.length}</b><div><b>${t}</b></div><div class="sub">${s}</div><div class="sub">${L.filter(c => wait(c) > 30).length} waiting 30+ days</div></button>`; }).join('');
    const pool = POOLS.find(x => x[0] === I.pool), L = (pool ? R.filter(pool[3]) : R).sort((a, b) => wait(b) - wait(a)), shown = L.slice(0, 50 + I.more * 50);
    const act = I.C.filter(active), provF = act.filter(c => provOf(c.province)).length, provA = act.filter(c => c.provFromAddr).length, terF = act.filter(c => hqOf(c)).length;
    return `<div class="intpools">${cards}</div><div class="sub" style="margin:8px 0 12px">Pools overlap (one person can be in several). Ready to place = active in ClickUp, not marked recruited, not already on a running programme and not placed here. ${mix(R)}</div>
      <div class="sub" style="margin-bottom:10px">Province known for ${pct(provF, act.length)} of active candidates (${provA} worked out from the home address). A post-school qualification could be identified for ${pct(terF, act.length)}; the rest count by their school result or as Unknown. Programmes have no province until PMs add the venue in PM Tracker, so same-province ranking applies only where a venue is set.</div>
      <div class="card" style="padding:0"><div class="tw"><table class="dense"><thead><tr><th>Candidate</th><th>Highest qualification</th><th>PwD</th><th>Province</th><th>Gender · age</th><th>Waiting</th><th></th></tr></thead><tbody>
      ${shown.map(c => `<tr><td><b>${e(c.name)}</b> ${flags(c)}</td><td>${e(lvlTxt(c))}</td><td>${c.pwd ? 'Yes' : '—'}</td><td>${e(c.province || '—')}</td><td>${e([c.gender, c.age].filter(Boolean).join(' · ') || '—')}</td><td>${wait(c)} days</td><td>${cuLink(c)}</td></tr>`).join('') || '<tr><td colspan="7" class="sub">No candidates for these filters.</td></tr>'}
      </tbody></table></div></div>${L.length > shown.length ? `<button class="btn sm" style="margin-top:8px" onclick="intk('more')">Show more (${L.length - shown.length} left)</button>` : ''}`;
  }
  function paint() {
    const m = $('view-intake'); if (!m || m.hidden) return;
    if (!isAdmin()) { m.innerHTML = '<div class="card" style="padding:18px">Learner intake is for admins.</div>'; return; }
    const head = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px"><div style="flex-grow:1"><h1 style="font-size:26px">Learner intake</h1><div class="sub">Fill upcoming programmes from ClickUp › Recruitment Candidates (read-only)${I.at ? ' · loaded ' + new Date(I.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}</div></div><button class="btn sm" onclick="intk('refresh')">Refresh</button></div>`;
    if (I.st !== 'ok') { m.innerHTML = head + `<div class="card" style="padding:18px">${I.st === 'off' ? 'ClickUp is not connected (CLICKUP_TOKEN missing).' : I.st === 'err' ? 'Could not load from ClickUp. <button class="btn sm" onclick="intk(\'refresh\')">Try again</button>' : 'Loading candidates and programmes…'}</div>`; if (I.st === 'idle') load(); return; }
    const act = I.C.filter(active), rd = I.C.filter(ready), nd = I.PR.filter(needs), rqN = (I.RQ || []).filter(r => !(I.P || []).some(x => x.programme_id === r.programme_id) && !(I.EN.get(r.programme_id) || 0));
    const chips = `<div class="intchips">${chip('candidates in ClickUp', I.C.length, false, "intk('tab','cand')")}${chip('active', act.length, false, "intk('tab','cand')")}${chip('ready to place', rd.length, I.tab === 'cand' && !I.pool, "intk('tab','cand');intk('pool','')")}${chip('ready, waiting 30+ days', rd.filter(c => wait(c) > 30).length, false, "intk('tab','cand')", 'warn')}${chip('programmes start within 30 days with places open', nd.length, I.f.need, "intk('need')", nd.length ? 'bad' : '')}${chip('new hand-over requests', rqN.length, I.f.req, "intk('req')", rqN.length ? 'warn' : '')}</div>`;
    const cls = [...new Map(I.PR.filter(p => p.client_id).map(p => [String(p.client_id), (I.CL.get(p.client_id) || {}).client_name || 'Client ' + p.client_id])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const nq = [...new Set(I.PR.map(nqfN).filter(x => x != null))].sort((a, b) => a - b).map(n => [n, 'NQF ' + n]);
    const filt = `<div class="intfilt">${I.tab === 'time' ? sel('client', cls, I.f.client, 'All clients') + sel('nqf', nq, I.f.nqf, 'All NQF levels') : ''}${sel('prov', PROV.map(p => [p[0], p[0]]), I.f.prov, 'All provinces')}
      <label class="intchk"><input type="checkbox"${I.f.pwd ? ' checked' : ''} onchange="intk('pwd',this.checked)"> PwD only</label><label class="intchk"><input type="checkbox"${I.f.bpwd ? ' checked' : ''} onchange="intk('bpwd',this.checked)"> Black PwD only</label><input type="search" class="intsel" style="flex:1 1 200px" placeholder="${I.tab === 'time' ? 'Search programmes' : 'Search candidates'}" value="${e(I.f.q)}" onchange="intk('q',this.value)"></div>`;
    const tabs = `<div class="intabs" role="tablist"><button role="tab" aria-selected="${I.tab === 'time'}" class="${I.tab === 'time' ? 'on' : ''}" onclick="intk('tab','time')">Programmes</button><button role="tab" aria-selected="${I.tab === 'cand'}" class="${I.tab === 'cand' ? 'on' : ''}" onclick="intk('tab','cand')">Candidates</button></div>`;
    const body = I.tab === 'time' ? `<div class="intwrap"><div class="card intcal">${timeline()}</div>${panel()}</div>` : candidates();
    m.innerHTML = head + chips + `<div class="inttop">${tabs}${filt}</div>` + body;
  }

  /* ---------- styles, route, nav ---------- */
  const css = document.createElement('style');
  css.textContent = `.intchips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.intchip{display:flex;gap:6px;align-items:baseline;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:5px 10px;font:inherit;cursor:pointer;text-align:left}.intchip b{font-size:18px}.intchip span{font-size:13px}.intchip.on{outline:2px solid var(--accent2)}.intchip.warn b{color:#b45309}.intchip.bad b{color:#b91c1c}
.inttop{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:10px}.inttop .intfilt{margin:0;flex:1 1 480px}.intabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}.intabs button{border:0;background:none;font:inherit;font-weight:600;padding:8px 14px;cursor:pointer;color:var(--ink);border-bottom:3px solid transparent}.intabs button.on{border-bottom-color:var(--accent2)}
.intfilt{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.intsel{height:38px;max-width:100%;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:var(--surface);color:var(--ink);font:inherit}.intchk{display:flex;gap:6px;align-items:center;font-size:14px}
.intwrap{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}.intcal{flex:1 1 560px;min-width:0;padding:12px 14px;overflow:visible}.intpanel{flex:0 1 400px;min-width:280px;padding:14px 16px;max-height:calc(100vh - 140px);overflow:auto;position:sticky;top:90px}
.intnav{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.intnav .btn.on{outline:2px solid var(--accent2)}
.introw{display:flex;align-items:stretch;border-bottom:1px solid var(--line2,var(--line));min-height:32px}.introw.on{background:rgba(0,120,212,.06)}.inthead{min-height:22px;border-bottom:1px solid var(--line)}.inthead span{position:absolute;top:2px;font-size:11px;color:var(--muted,#666);white-space:nowrap}
.intname{flex:0 0 240px;max-width:40%;border:0;background:none;text-align:left;font:inherit;font-size:13px;font-weight:600;padding:6px 8px 6px 0;cursor:pointer;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.intname .sub{font-weight:400;font-size:12px}
.inttrack{position:relative;flex:1 1 auto;min-width:0}.inttoday{position:absolute;top:0;bottom:0;width:2px;background:#d13438;opacity:.6}
.intbar{position:absolute;top:4px;height:24px;border:0;border-radius:6px;font:inherit;font-size:12px;font-weight:600;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;text-align:left;color:#fff}.intbar.ok{background:#107c10}.intbar.warn{background:#c27c0e}.intbar.bad{background:#c50f1f}.intbar.n{background:#8a8886}
.intmix{display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0;font-size:13px}.intcand{display:flex;gap:6px;align-items:center;padding:8px 0;border-top:1px solid var(--line2,var(--line))}.intcand .badge{font-size:11px;padding:2px 6px}.inttags{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}.inttag{font-size:11px;border:1px solid var(--line);border-radius:6px;padding:1px 6px}.intline{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.intcu{text-decoration:none;font-weight:700}.intshort{margin-top:10px;padding:10px 12px;border:1px solid var(--accent2);border-radius:10px}.intrest{margin-top:10px}.intrest summary{cursor:pointer;padding:6px 0}
.intpools{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.intpool{text-align:left;padding:12px 14px;cursor:pointer;font:inherit;color:var(--ink);border:1px solid var(--line)}.intpool.on{outline:2px solid var(--accent2)}
@media(max-width:700px){.intname{flex-basis:130px}.intpanel{position:static;max-height:none;flex-basis:100%}}`;
  document.head.appendChild(css);
  const anchor = document.querySelector('main[id^="view-"]');
  if (anchor && !$('view-intake')) { const m = document.createElement('main'); m.id = 'view-intake'; m.hidden = true; anchor.parentNode.appendChild(m); }
  try { ICO.intake = 'M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6'; } catch (_) {}
  try { ROUTES.intake = ['Learner intake', 'Learners']; const g = NAV.find(x => x[0] === 'Learners'); if (g && !g[1].some(x => x[1] === 'intake')) g[1].push(['Learner intake', 'intake']); } catch (_) {}
  const go = () => { if (location.hash.slice(1).split('/')[0] === 'intake') setTimeout(paint, 60); };
  addEventListener('hashchange', go);
  /* menu count = programmes starting within 30 days with places open (same rule as the chip); menu item hidden for non-admins */
  const nav = () => { try { renderNav(curNav); } catch (_) {} };
  async function navCount() { if (!isAdmin()) return; try { const t = today();
    const { data: P } = await sb().from('programmes').select('id,group_size,status,fields').is('deleted_at', null).gte('start_date', t).lte('start_date', addD(t, 30)).gt('group_size', 0);
    const L = (P || []).filter(p => String(p.status || '') !== 'closed' && empK(p) !== 'emp'), ids = L.map(p => p.id), c = new Map();
    if (ids.length) { const [{ data: E }, { data: Q }] = await Promise.all([sb().from('enrolments').select('programme_id,status').in('programme_id', ids), sb().from('intake_placements').select('programme_id').eq('status', 'placed').in('programme_id', ids)]);
      (E || []).forEach(x => { if ((x.status || 'active') === 'active') c.set(x.programme_id, (c.get(x.programme_id) || 0) + 1); }); (Q || []).forEach(x => c.set(x.programme_id, (c.get(x.programme_id) || 0) + 1)); }
    I.navN = L.filter(p => !(/^done$/i.test(String((p.fields || {}).learnersEnrolled || '').trim()) && !(c.get(p.id) || 0)) && p.group_size > (c.get(p.id) || 0)).length; nav(); } catch (_) {} }
  const navN = () => I.st === 'ok' ? I.PR.filter(needs).length : (I.navN || 0);
  const wrapDot = () => { const f = window.apxNavDot; if (!f || f.__intk) return; const g = r => { if (r !== 'intake') return f(r); const n = navN();
    return n ? `<span class="navcnt r" aria-label="${n} programmes start within 30 days with places open">${n}</span>` : ''; }; g.__intk = 1; window.apxNavDot = g; };
  (function wait0(n) { if (window.apxRole && window.__sb) { if (isRec() && apxRole() !== 'admin' && ['', 'mywork', 'pmtracker', 'desk'].includes(location.hash.slice(1).split('/')[0])) location.hash = 'intake'; try { window.NAVR = window.NAVR || {}; NAVR.intake = isAdmin; } catch (_) {} wrapDot(); nav(); navCount();
    if (location.hash.slice(1).split('/')[0] === 'intake') { try { route(); } catch (_) {} go(); } } else if (n < 60) setTimeout(() => wait0(n + 1), 500); })(0);
  window.intkSummary = () => I.st === 'ok' ? { ready: I.C.filter(ready).length, wait30: I.C.filter(c => ready(c) && wait(c) > 30).length, need: I.PR.filter(needs).length } : null;
})();
