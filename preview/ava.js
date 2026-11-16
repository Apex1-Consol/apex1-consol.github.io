/* Ava: the ApexOne assistant. One panel on every page (✦ button or Ctrl+K).
   Free Gemini tier, so the browser sends only programme numbers, counts and labels the user can already see:
   no learner names, ID numbers, emails or phone numbers (the server strips those again). All AI calls go through ai-generate. */
(() => {
  const D = () => ((window.__preview || {}).data) || {};
  const A = () => window.dvApi;
  const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const iso = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const route = () => location.hash.slice(1).split('/')[0] || 'mywork';
  const NAVF = () => { try { return NAV.flatMap(g => g[1]); } catch (_) { return []; } };
  const pageName = r => (NAVF().find(x => x[1] === r) || [])[0] || (typeof ROUTES !== 'undefined' && ROUTES[r] && ROUTES[r][0]) || r;
  const role = () => (window.apxRole ? apxRole() : 'pm');
  const rs = p => (A() && A().runState ? A().runState(p) : '');
  const progAll = () => D().progsAll || D().progs || [];
  const pid = p => '#' + (p.display_id || p.id);
  const mine = p => !window.apxMineProg || role() === 'admin' || apxMineProg(p);
  const clientOf = p => ((D().clients || []).find(c => c.id === p.client_id) || {}).client_name || '';
  const pf = (p, k) => (p.fields || {})[k];
  const recOpen = r => !r.resolved && !/closed/i.test(String((r.fields || {}).Status || ''));
  const S = { open: false, busy: false, msgs: [] };
  try { S.msgs = JSON.parse(sessionStorage.getItem('apxAva') || '[]'); } catch (_) { S.msgs = []; }
  const save = () => { try { sessionStorage.setItem('apxAva', JSON.stringify(S.msgs.slice(-20))); } catch (_) {} };

  /* ---------- facts: what this user can see, without personal data ---------- */
  function progFacts(p) {
    const a = A(), L = [], today = iso();
    const ls = a ? a.learnersOf(p.id) : [], wd = (D().enrol || []).filter(x => x.programme_id === p.id && /withdrawn/i.test(String((x.fields || {}).Status || x.status || ''))).length;
    L.push(`Programme ${pid(p)}: ${p.programme_name || ''} | client ${clientOf(p)} | type ${p.programme_type || pf(p, 'Type') || 'unknown'} | SAQA ${p.saqa_id || 'not set'} | ${p.start_date || 'no start'} to ${p.end_date || 'no end'} | run state ${rs(p)}`);
    L.push(`Learners enrolled: ${ls.length}${wd ? ` (${wd} withdrawn)` : ''}`);
    if (a && a.regDates) { const r = a.regDates(p.id); L.push(`Registers captured: ${r.length}${r.length ? `, last ${r[r.length - 1]}` : ''}`); }
    if (a && a.modsOf) L.push(`Modules set up: ${a.modsOf(p.id).length}`);
    const recs = (D().recs || []).filter(r => r.programme_id === p.id && recOpen(r));
    L.push(`Open recommendations: ${recs.length}${recs.length ? `, overdue ${recs.filter(r => (r.fields || {})['Due Date'] && r.fields['Due Date'] < today).length}` : ''}`);
    const v = (D().visits || []).filter(x => x.programme_id === p.id).map(x => x.fields || {}).sort((x, y) => String(y['Date of Visit'] || '').localeCompare(String(x['Date of Visit'] || '')))[0];
    L.push(v ? `Last monitoring visit ${v['Date of Visit'] || 'date not set'}, next visit due ${v['Next Visit Date'] || 'not set'}` : 'No monitoring visit recorded');
    const fl = flags().filter(x => x.pid === p.id).map(x => x.hh);
    if (fl.length) L.push(`Open flags on this programme: ${[...new Set(fl)].join('; ')}`);
    return L.join('\n');
  }
  function flags() {
    if (!window.apxOvItems) return [];
    const out = [], ids = new Map(progAll().map(p => [p.id, p]));
    NAVF().forEach(([lab, r]) => (apxOvItems(r) || []).forEach(x => { const p = x.pid && ids.get(+x.pid); if (p && !mine(p)) return; out.push({ r, lab, hh: x.hh || lab, pid: p ? p.id : null, warn: !!x.warn }); }));
    return out;
  }
  function attentionFacts() {
    const L = [], tasks = (window.apxMyTasks ? apxMyTasks() : []) || [];
    L.push(`My work tasks (${tasks.length}):`);
    tasks.slice(0, 40).forEach(t => L.push(`- [${t.k || 'Task'}] ${String(t.t || '').replace(/<[^>]+>/g, '')}`));
    if (tasks.length > 40) L.push(`- …and ${tasks.length - 40} more`);
    const byPage = new Map(); flags().forEach(x => { const k = x.lab + ' > ' + x.hh; if (!byPage.has(k)) byPage.set(k, { r: x.r, n: 0, w: 0, ids: [] }); const o = byPage.get(k); o.n++; if (x.warn) o.w++; if (x.pid) { const p = progAll().find(q => q.id === x.pid); if (p && o.ids.length < 8) o.ids.push(pid(p)); } });
    L.push(`Overview flags (page > check: count, red flags, example programmes). Red means the Overview shows it red; it does NOT mean overdue. "Visits due" also counts running programmes with no visit recorded yet.`);
    [...byPage.entries()].sort((a, b) => b[1].w - a[1].w || b[1].n - a[1].n).slice(0, 35).forEach(([k, o]) => L.push(`- ${k} {{${o.r}}}: ${o.n}${o.w ? `, ${o.w} red` : ''}${o.ids.length ? ` (${o.ids.join(', ')})` : ''}`));
    return L.join('\n');
  }
  function briefFacts() {
    const d = D(), ps = progAll().filter(p => !p.deleted_at && mine(p)), by = {}; ps.forEach(p => { const s = rs(p) || 'Unknown'; by[s] = (by[s] || 0) + 1; });
    const run = new Set(ps.filter(p => rs(p) === 'Active').map(p => p.id)), today = iso();
    const en = (d.enrol || []).filter(x => run.has(x.programme_id) && !/withdrawn/i.test(String((x.fields || {}).Status || x.status || '')));
    const recs = (d.recs || []).filter(recOpen), od = recs.filter(r => (r.fields || {})['Due Date'] && r.fields['Due Date'] < today);
    const end30 = ps.filter(p => run.has(p.id) && p.end_date && p.end_date <= iso(new Date(Date.now() + 30 * 864e5)));
    return [`Programmes by run state: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}`,
      `Running programmes ending in 30 days: ${end30.length}${end30.length ? ` (${end30.slice(0, 10).map(pid).join(', ')})` : ''}`,
      `Learners on record: ${(d.learners || []).length}; active enrolments on running programmes: ${en.length}`,
      `Open recommendations: ${recs.length} (${od.length} overdue); monitoring visits recorded: ${(d.visits || []).length}`,
      attentionFacts()].join('\n');
  }
  function context(mode) {
    const r = route(), L = [`Signed-in role: ${role()}. Current page: ${pageName(r)} {{${r}}}.`];
    const cp = r === 'programmes' && A() && A().cur ? progAll().find(p => p.id === A().cur()) : null;
    if (cp) L.push(progFacts(cp));
    if (mode === 'brief') L.push(briefFacts()); else if (mode !== 'page') L.push(attentionFacts());
    return L.join('\n').slice(0, 9000);
  }

  /* ---------- server ---------- */
  async function call(body) {
    const sb = window.__sb, ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 60000);
    try {
      const { data } = await sb.auth.getSession(), tok = data.session && data.session.access_token; if (!tok) throw new Error('Please sign in again.');
      const res = await fetch(sb.supabaseUrl + '/functions/v1/' + (body.type === 'ava' ? 'ava' : 'ai-generate'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body), signal: ctrl.signal });
      const j = await res.json().catch(() => null);
      if (res.status === 429) throw new Error((j && j.error) || 'Ava is busy (free AI limit). Try again in a minute.');
      if (!res.ok || !j || j.ok === false) throw new Error((j && j.error) || res.statusText || 'Request failed');
      return j;
    } catch (err) { throw err.name === 'AbortError' ? new Error('That took too long. Please try again.') : err; }
    finally { clearTimeout(tm); }
  }
  const PMODE = { attention: 'What needs my attention?', brief: 'Give me a brief of where things stand', page: 'Explain this page', draft: 'Draft a follow-up message about what needs attention' };
  async function ask(text, mode = 'ask') {
    if (S.busy) return; const q = String(text || '').trim(); if (!q && mode === 'ask') return;
    S.busy = true; S.msgs.push({ r: 'u', t: q || PMODE[mode] }); render(true);
    try {
      const hist = S.msgs.slice(-7, -1).map(m => ({ r: m.r, t: String(m.t).slice(0, 1200) }));
      const j = await call({ type: 'ava', mode, question: q || PMODE[mode], page: pageName(route()), facts: context(mode), history: hist });
      S.msgs.push({ r: 'a', t: j.answer || '(No answer returned)', un: (j.fact_check || {}).unverified_numbers });
    } catch (err) { S.msgs.push({ r: 'a', t: 'Sorry, I could not answer: ' + err.message, err: 1 }); }
    S.busy = false; save(); render(true);
  }
  async function tool(label, body, key) {
    if (S.busy) return; S.busy = true; S.msgs.push({ r: 'u', t: label }); render(true);
    try {
      const j = await call(body);
      const t = j.no_data ? 'There is no data for this yet on this programme (nothing captured), so there is nothing to analyse.' : String(j[key] || '').trim() || '(No text returned)';
      S.msgs.push({ r: 'a', t, un: (j.fact_check || {}).unverified_numbers, draft: 1 });
    } catch (err) { S.msgs.push({ r: 'a', t: 'Sorry, I could not do that: ' + err.message, err: 1 }); }
    S.busy = false; save(); render(true);
  }

  /* ---------- rendering ---------- */
  const pByDisp = n => progAll().find(p => String(p.display_id || p.id) === String(n)) || progAll().find(p => String(p.id) === String(n));
  function fmt(t) {
    let h = e(t);
    h = h.replace(/\{\{([a-z]+)\}\}/g, (m, r) => NAVF().some(x => x[1] === r) || r === 'mywork' ? `<a href="#${r}" class="avl">${e(pageName(r))}</a>` : '');
    h = h.replace(/(^|[\s(,;])#(\d{1,5})\b/g, (m, a, n) => { const p = pByDisp(n); return p ? `${a}<a href="#programmes" class="avl" onclick="avaGoP(${p.id});return false">#${n}</a>` : m; });
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/^#{1,4} +(.+)$/gm, '<b>$1</b>');
    const lines = h.split('\n'), out = []; let ul = false;
    lines.forEach(l => { const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/); if (m) { if (!ul) { out.push('<ul>'); ul = true; } out.push('<li>' + m[1] + '</li>'); } else { if (ul) { out.push('</ul>'); ul = false; } out.push(l.trim() ? '<p>' + l + '</p>' : ''); } });
    if (ul) out.push('</ul>'); return out.join('');
  }
  window.avaGoP = id => { location.hash = 'programmes'; setTimeout(() => { A() && A().setProg(id); window.dvProg && dvProg(id); }, 60); };
  function chips() {
    const r = route(), c = [['What needs my attention?', "avaMode('attention')"], ['Explain this page', "avaMode('page')"]];
    if (role() === 'admin' || role() === 'qa') c.push(['Brief me', "avaMode('brief')"]);
    const cp = r === 'programmes' && A() && A().cur ? progAll().find(p => p.id === A().cur()) : null;
    if (cp) { const n = pid(cp), id = cp.id; c.push([`Summarise ${n}`, `avaTool('Summarise ${n}',{type:'programme_summary',programme_id:${id}},'narrative')`], [`Attendance ${n}`, `avaTool('Attendance analysis ${n}',{type:'attendance_analysis',programme_id:${id}},'narrative')`]);
      if (!/legacy/i.test(cp.programme_type || '')) c.push([`EISA readiness ${n}`, `avaTool('EISA readiness ${n}',{type:'eisa_readiness_check',programme_id:${id}},'narrative')`]);
      c.push([`PoE gaps ${n}`, `avaTool('PoE gaps ${n}',{type:'poe_gap_analysis',programme_id:${id}},'narrative')`]); }
    if (r === 'fam' && (role() === 'admin' || role() === 'qa')) c.push(['FAM compliance digest', "avaTool('FAM compliance digest',{type:'fam_compliance_digest'},'narrative')"]);
    c.push(['Draft a follow-up', "avaMode('draft')"], ['How do I…', "avaHow()"]);
    return c.map(([l, on]) => `<button type="button" class="avc" onclick="${e(on)}">${e(l)}</button>`).join('');
  }
  function render(scroll) {
    const box = document.getElementById('avapanel'); if (!box) return;
    box.querySelector('#avachips').innerHTML = chips();
    const m = box.querySelector('#avamsgs');
    m.innerHTML = (S.msgs.length ? '' : `<div class="avhi"><b>Hi, I'm Ava.</b><p>Ask me how to do something in ApexOne, what needs your attention, or what a page or flag means. On a programme page I can summarise it and check attendance, EISA readiness and PoE gaps.</p><p class="avsm">I use the free AI tier, so I never send learner names, ID numbers, emails or phone numbers. Please don't type them. I can make mistakes: check before you act.</p></div>`)
      + S.msgs.map((x, i) => `<div class="avm ${x.r}${x.err ? ' er' : ''}">${x.r === 'u' ? e(x.t) : fmt(x.t)}${x.un && x.un.length ? `<div class="avw">⚠ Check these numbers, I could not match them to ApexOne data: ${e(x.un.join(', '))}</div>` : ''}${x.r === 'a' && !x.err ? `<div class="avact"><button type="button" onclick="avaCopy(${i})">Copy</button></div>` : ''}</div>`).join('')
      + (S.busy ? '<div class="avm a avdots"><span></span><span></span><span></span></div>' : '');
    box.querySelector('#avasend').disabled = S.busy;
    if (scroll) m.scrollTop = m.scrollHeight;
  }
  window.avaMode = m => ask('', m);
  window.avaTool = tool;
  window.avaHow = () => { const i = document.getElementById('avain'); i.value = 'How do I '; i.focus(); };
  window.avaCopy = i => { const t = (S.msgs[i] || {}).t || ''; navigator.clipboard.writeText(t).then(() => window.toast && toast('Copied'), () => {}); };
  window.avaClear = () => { S.msgs = []; save(); render(); };
  window.avaToggle = open => {
    S.open = open == null ? !S.open : open; const b = document.getElementById('avapanel'); if (!b) return;
    b.classList.toggle('on', S.open); document.getElementById('avafab').setAttribute('aria-expanded', S.open);
    if (S.open) { render(true); setTimeout(() => document.getElementById('avain').focus(), 50); }
  };
  function mount() {
    if (document.getElementById('avafab') || !document.body) return;
    document.head.insertAdjacentHTML('beforeend', `<style>
#avafab{position:fixed;right:18px;bottom:18px;z-index:900;display:flex;align-items:center;gap:6px;padding:10px 16px;border-radius:999px;border:0;background:#1f2a44;color:#fff;font:600 14px/1 inherit;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
#avafab .st{color:#f5c542;font-size:16px}#avafab kbd{font:500 11px inherit;opacity:.7;margin-left:4px}
#avapanel{position:fixed;top:0;right:0;bottom:0;z-index:950;width:min(440px,100vw);background:var(--bg,#fff);color:var(--ink,#111);border-left:1px solid var(--line,#ddd);box-shadow:-6px 0 24px rgba(0,0,0,.18);display:flex;flex-direction:column;transform:translateX(105%);transition:transform .2s}
#avapanel.on{transform:none}
#avapanel header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#ddd)}
#avapanel header b{font-size:16px}#avapanel header .st{color:#d9a400}#avapanel header span.sub{flex:1;font-size:12px;opacity:.7}
#avapanel header button{border:0;background:none;cursor:pointer;font-size:13px;color:inherit;opacity:.75;padding:4px 6px}
#avachips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-bottom:1px solid var(--line,#eee)}
.avc{border:1px solid var(--line,#ccc);background:none;color:inherit;border-radius:999px;padding:5px 10px;font-size:12.5px;cursor:pointer}.avc:hover{background:rgba(127,127,127,.12)}
#avamsgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.45}
.avm{max-width:92%;padding:9px 12px;border-radius:12px}.avm p{margin:0 0 6px}.avm p:last-child{margin:0}.avm ul{margin:4px 0 6px;padding-left:18px}
.avm.u{align-self:flex-end;background:#1f2a44;color:#fff;white-space:pre-wrap}.avm.a{align-self:flex-start;background:rgba(127,127,127,.1)}.avm.er{background:rgba(220,60,60,.12)}
.avl{color:#2a6fdb;font-weight:600}.avw{margin-top:6px;font-size:12px;color:#b26b00}.avact{margin-top:6px}.avact button{border:0;background:none;color:inherit;opacity:.6;font-size:12px;cursor:pointer;padding:0}
.avhi p{margin:6px 0}.avsm{font-size:12px;opacity:.7}
.avdots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:currentColor;opacity:.4;animation:avd 1s infinite}.avdots span:nth-child(2){animation-delay:.2s}.avdots span:nth-child(3){animation-delay:.4s}@keyframes avd{50%{opacity:1}}
#avapanel form{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--line,#ddd)}
#avain{flex:1;resize:none;min-height:40px;max-height:120px;padding:8px 10px;border:1px solid var(--line,#ccc);border-radius:10px;font:inherit;background:transparent;color:inherit}
@media print{#avafab,#avapanel{display:none}}</style>`);
    document.body.insertAdjacentHTML('beforeend', `<button id="avafab" type="button" aria-controls="avapanel" aria-expanded="false" onclick="avaToggle()" title="Ask Ava (Ctrl+K)"><span class="st">✦</span>Ava<kbd>Ctrl K</kbd></button>
<aside id="avapanel" role="dialog" aria-label="Ava assistant"><header><span class="st">✦</span><b>Ava</b><span class="sub">ApexOne assistant</span><button type="button" onclick="avaClear()">New chat</button><button type="button" onclick="avaToggle(false)" aria-label="Close">✕</button></header>
<div id="avachips"></div><div id="avamsgs" aria-live="polite"></div>
<form onsubmit="event.preventDefault();const i=document.getElementById('avain');const v=i.value;i.value='';avaAsk(v)"><textarea id="avain" rows="1" maxlength="800" placeholder="Ask Ava… (no ID numbers or personal details)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"></textarea><button class="btn y" id="avasend">Send</button></form></aside>`);
    document.addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); avaToggle(); } else if (ev.key === 'Escape' && S.open) avaToggle(false); });
    window.addEventListener('hashchange', () => S.open && render());
    const o = window.dvProg; if (typeof o === 'function') window.dvProg = id => { const r = o(id); if (S.open) setTimeout(render, 0); return r; };
  }
  window.avaAsk = q => ask(q, 'ask');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
