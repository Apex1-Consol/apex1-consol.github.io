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
    NAVF().forEach(([lab, r]) => (apxOvItems(r) || []).forEach(x => { const p = x.pid && ids.get(+x.pid); if (p && !mine(p)) return; const sp = String(x.s || '').replace(/<[^>]+>/g, '').trim(); out.push({ r, lab, hh: x.hh === 'Visits due' ? (/^Next/.test(sp) ? 'Visit due or overdue (next visit date)' : 'No monitoring visit recorded yet') : (x.hh || lab), pid: p ? p.id : null, warn: !!x.warn }); }));
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
  /* ---------- answers without AI (no quota) ---------- */
  const FAQ = [
    [/withdraw/i, 'To withdraw a learner:\n- Open {{enrolments}} and search for the learner or programme.\n- Click **Withdraw** on that enrolment.\n- Enter the withdrawal date and reason (both required), then Save.\nOnly that enrolment is marked Withdrawn; the learner record stays.'],
    [/(sa )?id( number)?s?\b.*(add|capture|fix|missing|invalid)|(add|capture|fix).*\bid\b/i, 'To add or fix a learner\'s SA ID:\n- Open {{dq}} and click the **No ID** or **Invalid ID** tile.\n- Click **Add SA ID** on the learner and enter the 13-digit South African ID.\nOnly South African citizens can be on programmes, so passports are not accepted. Your My work list shows a "Capture SA ID numbers" task per programme until they are done.'],
    [/(register|attendance|session)/i, 'To capture a register:\n- Open {{attendance}} and pick the programme.\n- Click **+ Add session**, choose the date (inside the programme dates, up to today) and module, then Save session.\n- Tap each learner\'s cell to cycle Present → Late → Absent. It saves automatically.'],
    [/module/i, 'To set up modules: open {{attendance}}, pick the programme, open the **PoE tracker** tab and click **+ Add module**. Give the module number, title and at least one KM, PM or WM code.'],
    [/(add|record|capture).*visit|visit.*(add|record|capture)/i, 'To record a monitoring visit: open {{visits}}, click **+ Add visit** (or **+ Add visit** next to a programme with no visit), pick the programme and date, then fill in the KMA scores, judgement and next visit date on the visit page.'],
    [/(close|request close|resolve).*recommend|recommend.*(close|resolve)/i, 'To close a recommendation: open {{recs}}, click **Request close** on it and write a closing note (what was done). It then waits in the {{signoff}} for an admin to approve. Overdue ones show on your My work list.'],
    [/hand.?over|sign.?off/i, 'Hand-over: the PI specialist completes {{pi}} and submits. The programme then appears in the {{signoff}} for the project manager to review the documents and sign. Legacy (SETA) programmes do not go through hand-over.'],
    [/(new|add|create|start).*programme|programme initiation/i, 'New programmes start in {{pi}} (PI specialist or admin): capture client, qualification, dates and people, upload the hand-over documents, then submit for hand-over to the PM. Project managers do not create programmes themselves.'],
    [/(eisa|sor|statement of results).*(book|issue|status)|book.*eisa/i, 'EISA steps per learner on the {{qcto}}: set SOR to **SOR Issued** (with date), then Booking to **Booked** and enter the EISA date; after the assessment record the outcome. **Set for all** updates a whole cohort at once. {{eisa}} shows who is ready.'],
    [/(monthly )?report/i, 'Monthly client reports are on {{reports}}: open the programme row, work through the stages (draft → review → sent). Overdue reports show on My work and the Overview.'],
    [/(add|new).*learner|enrol/i, 'Learners are linked to programmes on {{enrolments}}. Every learner needs a valid 13-digit SA ID ({{dq}} shows gaps). To withdraw someone, use **Withdraw** on their enrolment rather than deleting anything.'],
  ];
  const faq = q => { if (q.length > 160 || !/^(how|where|what|can i|i want|help)/i.test(q.trim())) return null; const m = FAQ.find(([r]) => r.test(q)); return m ? m[1] : null; };
  const cache = { get: k => { try { return JSON.parse(localStorage.getItem('apxAvaC:' + k) || 'null'); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem('apxAvaC:' + k, JSON.stringify(v)); } catch (_) {} } };
  const me = () => (((window.__preview || {}).user || {}).email || 'me');
  const nk = s => String(s || '').replace(/^SP:\s*/i, '').trim();
  const btn = (l, on) => `<button type="button" class="avbtn" onclick="${e(on)}">${e(l)}</button>`;
  const lnk = (l, r) => `<a href="#${r}" class="avl">${e(l)}</a>`;
  function missing(p) {
    const a = A(), d = D(), out = [], today = iso(), ed = `dvProgEdit(${p.id})`, leg = /legacy/i.test(p.programme_type || '');
    const add = (t, act) => out.push(`<li>${e(t)} ${act}</li>`);
    if (!p.start_date || !p.end_date) add('Start or end date missing', btn('Edit', ed)); else if (p.end_date < p.start_date) add('End date is before the start date', btn('Edit', ed));
    if (!p.client_id) add('No client linked', btn('Edit', ed));
    if (!p.project_manager_name) add('No project manager', btn('Edit', ed));
    if (!nk(p.saqa_id)) add('No SAQA ID', btn('Edit', ed));
    else if (!(d.accs || []).some(x => nk(x.saqa_id) === nk(p.saqa_id))) add(`No accreditation record for SAQA ${nk(p.saqa_id)} (QA to check)`, lnk('Accreditation', 'accred'));
    ['Facilitator', 'Assessor'].forEach(k => { const v = String((p.fields || {})[k] || (p.fields || {})[k.toLowerCase()] || '').trim();
      if (!v) add(`No ${k.toLowerCase()}`, btn('Edit', ed)); else if (!/\s/.test(v) && window.apxFamFull && apxFamFull(v)) add(`${k} is a first name only ("${v}"); full name in FAM Registry: ${apxFamFull(v)}`, btn('Edit', ed)); });
    const ls = a ? a.learnersOf(p.id) : [];
    if (!ls.length) add('No learners enrolled', lnk('Enrolments', 'enrolments'));
    else { const bad = ls.filter(l => !(window.apxSaid ? apxSaid(String(l.id_number || '').trim()) : /^\d{13}$/.test(String(l.id_number || '').trim()))).length; if (bad) add(`${bad} learner${bad > 1 ? 's' : ''} with a missing or invalid SA ID`, lnk('Data quality', 'dq')); }
    if (rs(p) === 'Active' && ls.length) { const r = a && a.regDates ? a.regDates(p.id) : []; const l = r[r.length - 1]; if (!l || l < iso(new Date(Date.now() - 14 * 864e5))) add(l ? `No register since ${l}` : 'No registers captured', lnk('Attendance & PoE', 'attendance')); }
    if (!leg && a && a.modsOf && !a.modsOf(p.id).length) add('No modules set up (PoE tracker)', lnk('Attendance & PoE', 'attendance'));
    if (rs(p) === 'Active' && !(d.visits || []).some(v => v.programme_id === p.id)) add('No monitoring visit recorded', lnk('Monitoring Visits', 'visits'));
    const od = (d.recs || []).filter(r => r.programme_id === p.id && recOpen(r) && (r.fields || {})['Due Date'] && r.fields['Due Date'] < today).length;
    if (od) add(`${od} overdue recommendation${od > 1 ? 's' : ''}`, lnk('Recommendations', 'recs'));
    return `<p><b>${e(pid(p))} · ${e(clientOf(p))}</b><br>${e(p.programme_name || '')} · ${e(rs(p))}</p>` + (out.length ? `<p>${out.length} thing${out.length > 1 ? 's' : ''} to complete:</p><ul>${out.join('')}</ul>` : '<p>Nothing missing that ApexOne can check. ✓</p>');
  }
  const localMsg = (q, html) => { S.tab = 'chat'; S.msgs.push({ r: 'u', t: q }); S.msgs.push({ r: 'a', html, local: 1 }); save(); render(true); };
  window.avaMissing = id => { const p = progAll().find(x => x.id === id); if (p) localMsg(`What's missing on ${pid(p)}?`, missing(p)); };
  window.avaEnding = () => {
    const end = iso(new Date(Date.now() + 30 * 864e5)), ps = progAll().filter(p => !p.deleted_at && mine(p) && rs(p) === 'Active' && p.end_date && p.end_date <= end).sort((a, b) => a.end_date.localeCompare(b.end_date));
    localMsg('Programmes ending in the next 30 days', ps.length ? `<ul>${ps.map(p => `<li><a href="#programmes" class="avl" onclick="avaGoP(${p.id});return false">${e(pid(p))}</a> · ${e(clientOf(p))} · ends ${e(p.end_date)} · ${A() ? A().learnersOf(p.id).length : 0} learners ${btn('What\'s missing?', `avaMissing(${p.id})`)}</li>`).join('')}</ul>` : '<p>No running programmes end in the next 30 days.</p>');
  };
  const FLAGHELP = [
    [/Visit due or overdue/, 'The next monitoring visit date from the last visit is close or past. Book the visit and record it.'],
    [/No monitoring visit/, 'A running programme has no visit recorded yet. Record the visit when it happens (QA plans visits).'],
    [/Open recommendations/, 'Actions from monitoring visits that are not closed. Do the work, then Request close with a note.'],
    [/Attendance/, 'No recent register, registers outside the programme dates, or learners over the absence limit. Capture registers weekly.'],
    [/Learner documents/, 'Learner documents (ID copy, agreement, qualification) are not captured or are missing on the documents grid.'],
    [/missing ID or enrolment|Data quality/, 'Learners without a valid 13-digit SA ID, or not linked to a programme, or possible duplicates.'],
    [/Programmes missing details/, 'Programmes without a PM, dates, learners or SAQA ID. Open the programme and click Edit.'],
    [/Clients missing details/, 'Clients without a contact person, email, phone or PM. Open the client and fill in what you know.'],
    [/EISA/, 'EISA results outstanding or EISAs coming up. Update booking, date and outcome on the QCTO Tracker.'],
    [/Not started, programme running/, 'Learners still "Not Started" on the QCTO Tracker although the programme started 30+ days ago.'],
    [/no QCTO row/, 'Occupational enrolments without a QCTO Tracker row.'],
    [/Moderation/, 'Moderation or verification items not linked to a programme or waiting on SoRs/reports.'],
    [/Accreditation/, 'Qualifications expiring soon, with no accreditation record, or with an application still to submit.'],
    [/FAM Registry/, 'Practitioners with expired SETA registrations, missing documents or names not in the FAM Registry.'],
    [/Programme Initiation|Waiting for sign-off/, 'Programmes captured in Programme Initiation that are not yet signed and handed over to the PM.'],
    [/Reports to move/, 'Monthly client reports that are not started, past deadline or sent back with changes.'],
    [/Starting or ending soon/, 'Programmes starting or ending in the next weeks: check learners, registers and close-out.'],
    [/sync/i, 'ClickUp sync items waiting or failed. Usually the ClickUp rate limit; they retry by themselves.'],
  ];
  const fhelp = h => (FLAGHELP.find(([r]) => r.test(h)) || [])[1] || '';
  /* ---------- Phase 1: knowledge base (ava-kb.js), How to tab, clickable flags, fallback ---------- */
  const KB = () => window.AVAKB;
  const tx = el => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  const explain = h => { const k = KB() && KB().flag(h); return k || (fhelp(h) ? { why: fhelp(h) } : null); };
  const log = (q, note) => { try { window.__sb.from('ava_feedback').insert({ rating: 0, page: pageName(route()), question: String(q || '').slice(0, 800), answer: String(note || '').slice(0, 400) }).then(() => {}, () => {}); } catch (_) {} };
  const PAGEOWN = { qcto: 'qa', modver: 'qa', accred: 'qa', visits: 'qa', visit: 'qa', eisa: 'qa', fam: 'ohs', assessors: 'ohs', pi: 'pi', clients: 'pi', signoff: 'signoff', users: 'admin', synchealth: 'admin', audit: 'admin', dq: 'admin' };
  const ownerHere = () => ((KB() || {}).OWNERS || {})[PAGEOWN[route()] || 'pm'] || 'your project manager';
  window.avaEditProg = id => { if (!id) { location.hash = 'pmtracker'; return; } location.hash = 'programmes'; setTimeout(() => { A() && A().setProg && A().setProg(id); window.dvProg && dvProg(id); setTimeout(() => window.dvProgEdit && dvProgEdit(id), 150); }, 250); };
  window.avaExplain = (h, pv) => { const k = explain(h); avaToggle(true);
    localMsg(`What does "${h}" mean?`, k ? `<p>${e(k.why)}</p>${k.fix ? `<div>${btn(k.fixL || 'Fix it', k.fix.replace(/\{pid\}/g, pv || 0))}</div>` : ''}${k.owner ? `<p class="avsm">Stuck? This is usually for ${e(k.owner)}.</p>` : ''}` : '<p>No explanation saved for this flag yet. Hover it for the rule, or ask me below.</p>');
    if (!k) log(h, 'flag not in help'); };
  let HG = null, PF = [], TPL = '';
  const curGuide = () => HG && KB() && ((KB().PAGES[HG[0]] || {}).guides || {})[HG[1]];
  const pulse = el => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('avpulse'); void el.offsetWidth; el.classList.add('avpulse'); setTimeout(() => el.classList.remove('avpulse'), 3200); };
  window.avaGuide = (r, k) => { HG = r ? [r, k] : null; S.tab = 'how'; if (!S.open) avaToggle(true); else render(); };
  window.avaShow = i => { const g = curGuide(), st = g && g.steps[i], el = st && KB().find(st.sel); if (el) pulse(el); else window.toast && toast('Not on screen yet: do the step before this one first.'); };
  window.avaPF = i => { const x = PF[i], b = x && KB().find('tile:' + x.l); if (b && !b.classList.contains('on')) b.click(); const b2 = x && KB().find('tile:' + x.l); if (b2) pulse(b2); };
  window.avaTab = t => { S.tab = t; render(true); };
  function pageFlags() {
    const root = document.getElementById('view-' + route()) || document.querySelector('main:not([hidden])'); if (!root) return [];
    const seen = new Map();
    root.querySelectorAll('.famk').forEach(b => { const l = tx(b.querySelector('.l') || b), v = tx(b.querySelector('.v')); if (l && v && v !== '0' && !seen.has(l)) seen.set(l, { l, n: v, tile: 1 }); });
    root.querySelectorAll('.badge.b-warn,.badge.b-bad').forEach(b => { const l = tx(b).replace(/\s+\d+$/, ''); if (l && !seen.has(l)) seen.set(l, { l }); });
    return [...seen.values()].filter(x => explain(x.l)).slice(0, 20);
  }
  function howHtml() {
    const kb = KB(); if (!kb) return '<p>Help is loading…</p>';
    const g = curGuide();
    if (g) { let first = -1; const rows = g.steps.map((s, i) => { let d = false; try { d = !!(s.done && s.done()); } catch (_) {} if (!d && first < 0) first = i; return [s, d]; });
      const all = rows.every(([s, d]) => d || !s.done) && rows.some(([s]) => s.done) && rows.filter(([s]) => s.done).every(([, d]) => d);
      return `<p>${btn('‹ All guides', 'avaGuide(null)')}</p><p><b>${e(g.t)}</b></p><ol class="avsteps">${rows.map(([s, d], i) => `<li class="${d ? 'ok' : i === first ? 'now' : ''}"><span>${d ? '✓ ' : ''}${e(s.t)}</span>${s.sel ? ' ' + btn('Show me', `avaShow(${i})`) : ''}</li>`).join('')}</ol>${all ? '<p><b>Done. ✓</b></p>' : ''}<p class="avsm">Ticks update as you work. Steps without a tick can't be checked automatically; "Show me" points at the place on screen.</p>`; }
    const r = route(), p = kb.PAGES[r] || { name: pageName(r), purpose: '', fields: {} }, gs = kb.guides(r, role()), pf = pageFlags(); PF = pf;
    const other = Object.entries(kb.PAGES).filter(([x]) => x !== r).flatMap(([x]) => kb.guides(x, role()).map(([k, gg]) => [x, k, gg]));
    const fl = Object.entries(p.fields || {});
    return `<p><b>${e(p.name)}</b><br><span class="avsm">${e(p.purpose)}</span></p>`
      + (gs.length ? `<p><b>Guides for this page</b></p><ul class="avg">${gs.map(([k, gg]) => `<li>${btn(gg.t, `avaGuide('${r}','${k}')`)}</li>`).join('')}</ul>` : '')
      + (pf.length ? `<p><b>Flags on this page</b> <span class="avsm">(you can also click any amber or red flag on the page)</span></p><ul>${pf.map((x, i) => { const k = explain(x.l); return `<li><b>${e(x.l)}</b>${x.n ? ` (${e(x.n)})` : ''}<br><span class="avsm">${e(k.why)}</span><br>${x.tile ? btn('Show these', `avaPF(${i})`) + ' ' : ''}${k.fix && !/\{pid\}/.test(k.fix) ? btn(k.fixL || 'Fix it', k.fix) : ''}</li>`; }).join('')}</ul>` : '')
      + (fl.length ? `<details><summary><b>What each field means</b> (${fl.length})</summary><dl class="avdl">${fl.map(([f, d]) => `<dt>${e(f)}</dt><dd>${e(d)}</dd>`).join('')}</dl></details>` : '')
      + (other.length ? `<details><summary><b>Guides on other pages</b> (${other.length})</summary><ul class="avg">${other.map(([x, k, gg]) => `<li>${btn(gg.t, `avaGuide('${x}','${k}')`)} <span class="avsm">${e(kb.PAGES[x].name)}</span></li>`).join('')}</ul></details>` : '');
  }
  const tpl = () => { const c = new Map(); flags().forEach(x => c.set(x.hh, (c.get(x.hh) || 0) + 1)); const top = [...c].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `Hi [name],\n\nA quick update on [programme / my caseload]. These need attention:\n${top.map(([h, n]) => `- ${h}: ${n}`).join('\n') || '- [item]'}\n\nCould you please [action] by [date]?\n\nThanks,\n[your name]`; };
  window.avaCopyTpl = () => navigator.clipboard.writeText(TPL).then(() => window.toast && toast('Copied'), () => {});
  const guideList = kh => '<ul>' + kh.map(x => `<li>${e(x.g.t)} <span class="avsm">(${e(x.page)})</span> ${btn('Do it with me', `avaGuide('${x.r}','${x.k}')`)}</li>`).join('') + '</ul>';
  function fallback(q, mode, why) {
    const L = [`<p>I couldn't use the AI just now (${e(why)}). Here is what I can do without it:</p>`], kh = KB() ? KB().search(q) : [];
    if (kh.length) L.push('<p><b>Guides that may help</b></p>' + guideList(kh));
    if (mode === 'attention' || mode === 'brief') L.push(`<p>${btn('My flags by page', 'avaFlags()')} ${btn('Open My work', "location.hash='mywork'")}</p>`);
    if (mode === 'draft' || /draft|email|message|follow.?up/i.test(q)) { TPL = tpl(); L.push(`<p><b>Template draft</b> (fill in the [brackets])</p><p style="white-space:pre-wrap">${e(TPL)}</p>${btn('Copy template', 'avaCopyTpl()')}`); }
    L.push(`<p class="avsm">Still stuck? Ask ${e(ownerHere())}. I've logged the question so the help can be improved.</p>`);
    return L.join('');
  }
  window.avaFlags = () => {
    const g = new Map(); flags().forEach(x => { const k = x.r + '|' + x.lab + '|' + x.hh; g.set(k, (g.get(k) || 0) + 1); });
    const byP = new Map(); [...g.entries()].forEach(([k, n]) => { const [r, l, h] = k.split('|'); if (!byP.has(r)) byP.set(r, { l, n: 0, items: [] }); const o = byP.get(r); o.n += n; o.items.push([h, n]); });
    localMsg('My open flags by page', byP.size ? [...byP.entries()].sort((a, b) => b[1].n - a[1].n).map(([r, o]) => `<p>${lnk(o.l, r)} · ${o.n}</p><ul>${o.items.sort((a, b) => b[1] - a[1]).map(([h, n]) => `<li><b>${e(h)}</b> (${n})${fhelp(h) ? `<br><span class="avsm">${e(fhelp(h))}</span>` : ''}</li>`).join('')}</ul>`).join('') : '<p>No open flags. ✓</p>');
  };
  window.avaClientGaps = () => {
    const mineC = new Set(progAll().filter(p => !p.deleted_at && mine(p)).map(p => p.client_id));
    const cs = (D().clients || []).filter(c => !c.deleted_at && (role() === 'admin' || role() === 'pi' || mineC.has(c.id)));
    const rows = cs.map(c => { const f = c.fields || {}, m = [];
      if (!c.contact_person) m.push('contact person'); if (!c.contact_email) m.push('email'); if (!c.contact_number) m.push('phone');
      if (!c.project_manager) m.push('PM'); if (!c.sales_person) m.push('sales person'); if (!f['MOU Status']) m.push('MOU status'); if (!f.Sector) m.push('sector');
      return [c, m]; }).filter(x => x[1].length).sort((a, b) => b[1].length - a[1].length);
    localMsg('Clients missing details', rows.length ? `<p>${rows.length} of ${cs.length} clients have gaps. Open ${lnk('Clients', 'clients')}, pick the client and click Edit.</p><ul>${rows.slice(0, 25).map(([c, m]) => `<li><b>${e(c.client_name)}</b>: ${e(m.join(', '))}</li>`).join('')}</ul>${rows.length > 25 ? `<p class="avsm">…and ${rows.length - 25} more.</p>` : ''}` : '<p>Every client has its details filled in. ✓</p>');
  };
  window.avaLearnerGaps = () => {
    const a = A(), d = D(), ok = id => window.apxSaid ? apxSaid(String(id || '').trim()) : /^\d{13}$/.test(String(id || '').trim());
    const ps = progAll().filter(p => !p.deleted_at && mine(p) && rs(p) === 'Active' && a && a.learnersOf(p.id).length);
    const rows = ps.map(p => { const ls = a.learnersOf(p.id), bad = ls.filter(l => !ok(l.id_number)).length, dg = a.docGaps ? a.docGaps(p.id) : null;
      const m = []; if (bad) m.push(`${bad} missing/invalid SA ID`); if (dg && !dg.captured) m.push('documents not captured'); else if (dg && dg.missing) m.push(`${dg.missing} documents missing`);
      return [p, ls.length, m]; }).filter(x => x[2].length);
    const enrolled = new Set((d.enrol || []).map(x => x.learner_id)), none = role() === 'admin' ? (d.learners || []).filter(l => !enrolled.has(l.id)).length : 0;
    localMsg('Learner gaps by programme', (rows.length ? `<ul>${rows.slice(0, 25).map(([p, n, m]) => `<li><a href="#programmes" class="avl" onclick="avaGoP(${p.id});return false">${e(pid(p))}</a> · ${e(clientOf(p))} · ${n} learners: ${e(m.join(', '))}</li>`).join('')}</ul><p class="avsm">Fix IDs on ${lnk('Data quality', 'dq')}; documents on ${lnk('Attendance & PoE', 'attendance')} (Documents tab).</p>` : '<p>No ID or document gaps on your running programmes. ✓</p>') + (none ? `<p>${none} learners are not enrolled on any programme: see ${lnk('Enrolments', 'enrolments')}.</p>` : ''));
  };
  window.avaRate = async (i, v) => {
    const m = S.msgs[i]; if (!m || m.rated) return; m.rated = v; save(); render();
    const q = [...S.msgs.slice(0, i)].reverse().find(x => x.r === 'u');
    try { await window.__sb.from('ava_feedback').insert({ rating: v, page: pageName(route()), question: String(q ? q.t : '').slice(0, 800), answer: String(m.t || '').slice(0, 4000) }); window.toast && toast(v > 0 ? 'Thanks!' : 'Thanks, noted so Ava can be improved.'); } catch (_) {}
  };
  /* weekly brief card on My work (admin, QA): one AI call per person per week, saved */
  const wkKey = () => { const d = new Date(), k = new Date(d); k.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return 'week:' + me() + ':' + iso(k); };
  async function weekly(force) {
    const host = document.getElementById('view-mywork'); if (!host || host.hidden || !['admin', 'qa'].includes(role()) || !D().progs) return;
    let c = document.getElementById('avawk'); if (!c) { const anchor = document.getElementById('mwov') || host.firstElementChild; anchor.insertAdjacentHTML('beforebegin', '<details class="card" id="avawk" open style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:700"><span style="color:#d9a400">✦</span> Ava\'s weekly brief</summary><div id="avawkb" style="margin-top:8px;font-size:14px;line-height:1.45"></div></details>'); c = document.getElementById('avawk'); }
    const b = document.getElementById('avawkb'), k = wkKey(), hit = cache.get(k);
    if (hit && !force) { b.innerHTML = fmt(hit.t) + `<div class="avsm">Written ${e(hit.at)} for this week. ${btn('Refresh', 'avaWeekly(1)')}</div>`; return; }
    if (weekly.busy) return; weekly.busy = 1; b.innerHTML = '<span class="avsm">Ava is writing this week\'s brief…</span>';
    try { const j = await call({ type: 'ava', mode: 'brief', question: 'Weekly brief for this week', page: 'My work', facts: briefFacts().slice(0, 9000), history: [] });
      cache.set(k, { t: j.answer || '', at: new Date().toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) }); weekly.busy = 0; weekly(); }
    catch (err) { weekly.busy = 0; b.innerHTML = `<span class="avsm">Could not write the brief: ${e(err.message)} ${btn('Try again', 'avaWeekly(1)')}</span>`; }
  }
  window.avaWeekly = f => weekly(!!f);
  window.avaFillText = async (label, facts, current) => {
    const j = await call({ type: 'ava', mode: 'fill', question: `Write the text for the "${label}" field of this record, ready to paste into the form. Use only the facts in the context; where a fact is missing, leave a [placeholder] instead of guessing. Plain professional text, no greeting, no headings, no page links, under 150 words.${current && current.trim() ? ' Improve and complete this draft: ' + current.slice(0, 1500) : ''}`, page: pageName(route()), facts: String(facts || '').slice(0, 6000), history: [] });
    usage(); return String(j.answer || '').replace(/\{\{\w+\}\}/g, '').trim();
  };
  const PMODE = { attention: 'What needs my attention?', brief: 'Give me a brief of where things stand', page: 'Explain this page', draft: 'Draft a follow-up message about what needs attention' };
  async function ask(text, mode = 'ask', refresh) {
    if (S.busy) return; const q = String(text || '').trim(); if (!q && mode === 'ask') return;
    if (mode === 'ask') { const lf = faq(q); if (lf) { S.msgs.push({ r: 'u', t: q }); S.msgs.push({ r: 'a', t: lf, local: 1 }); save(); render(true); return; }
      const kh = KB() && /^(how|where|can i|i want|help|show me)/i.test(q) ? KB().search(q) : [];
      if (kh.length && kh[0].s >= 3) { localMsg(q, '<p>I can walk you through it, ticking each step as you do it:</p>' + guideList(kh)); return; }
      try { const { data } = await window.__sb.rpc('ava_shared', { q, pg: pageName(route()) }); const h = data && data[0]; if (h && h.answer) { S.msgs.push({ r: 'u', t: q }); S.msgs.push({ r: 'a', t: h.answer, shared: h.votes }); save(); render(true); return; } } catch (_) {} }
    const ck = mode === 'page' ? 'page:' + route() : mode === 'brief' ? 'brief:' + me() + ':' + iso() : null, hit = ck && cache.get(ck);
    if (hit && !refresh) { S.msgs.push({ r: 'u', t: PMODE[mode] }); S.msgs.push({ r: 'a', t: hit.t, un: hit.un, cached: ck, at: hit.at }); save(); render(true); return; }
    S.busy = true; S.msgs.push({ r: 'u', t: q || PMODE[mode] }); render(true);
    try {
      const hist = S.msgs.slice(-7, -1).map(m => ({ r: m.r, t: String(m.t).slice(0, 1200) }));
      const j = await call({ type: 'ava', mode, question: q || PMODE[mode], page: pageName(route()), facts: context(mode), history: hist });
      const m = { r: 'a', t: j.answer || '(No answer returned)', un: (j.fact_check || {}).unverified_numbers }; S.msgs.push(m);
      if (ck && j.answer) { const at = new Date().toTimeString().slice(0, 5); cache.set(ck, { t: m.t, un: m.un, at }); m.cached = ck; m.at = at; m.fresh = 1; }
    } catch (err) { S.msgs.push({ r: 'a', html: fallback(q || PMODE[mode], mode, err.message), local: 1 }); log(q || PMODE[mode], 'AI failed: ' + String(err.message).slice(0, 200)); }
    S.busy = false; save(); render(true); usage();
  }
  async function tool(label, body, key) {
    if (S.busy) return; S.busy = true; S.msgs.push({ r: 'u', t: label }); render(true);
    try {
      const j = await call(body);
      const t = j.no_data ? 'There is no data for this yet on this programme (nothing captured), so there is nothing to analyse.' : String(j[key] || '').trim() || '(No text returned)';
      S.msgs.push({ r: 'a', t, un: (j.fact_check || {}).unverified_numbers, draft: 1 });
    } catch (err) { S.msgs.push({ r: 'a', t: 'Sorry, I could not do that: ' + err.message, err: 1 }); }
    S.busy = false; save(); render(true); usage();
  }

  async function usage() {
    try { const { data } = await window.__sb.rpc('ava_usage'); const el = document.getElementById('avause'); if (!data || !el) return;
      const left = Math.max(0, data.ava_cap - data.me.ava), all = Math.max(0, data.all_cap - data.me.all);
      el.innerHTML = `${left} of ${data.ava_cap} Ava questions left today` + (all < 30 ? ` · ${all} AI requests left in total` : '') + (left <= 5 ? ' <b style="color:#b26b00">· running low</b>' : '');
    } catch (_) {}
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
  const fixBtns = t => { const ids = [...new Set((String(t).match(/#(\d{1,5})\b/g) || []).map(s => s.slice(1)))].map(pByDisp).filter(Boolean).slice(0, 3);
    return ids.length ? `<div class="avact">${ids.map(p => btn(`What's missing on ${pid(p)}?`, `avaMissing(${p.id})`)).join(' ')}</div>` : ''; };
  window.avaGoP = id => { location.hash = 'programmes'; setTimeout(() => { A() && A().setProg(id); window.dvProg && dvProg(id); }, 60); };
  function chips() {
    const r = route(), c = [['What needs my attention?', "avaMode('attention')"], ['Explain this page', "avaMode('page')"]];
    if (role() === 'admin' || role() === 'qa') c.push(['Brief me', "avaMode('brief')"]);
    const cp = r === 'programmes' && A() && A().cur ? progAll().find(p => p.id === A().cur()) : null;
    if (cp) { const n = pid(cp), id = cp.id; c.push([`Summarise ${n}`, `avaTool('Summarise ${n}',{type:'programme_summary',programme_id:${id}},'narrative')`], [`Attendance ${n}`, `avaTool('Attendance analysis ${n}',{type:'attendance_analysis',programme_id:${id}},'narrative')`]);
      if (!/legacy/i.test(cp.programme_type || '')) c.push([`EISA readiness ${n}`, `avaTool('EISA readiness ${n}',{type:'eisa_readiness_check',programme_id:${id}},'narrative')`]);
      c.push([`PoE gaps ${n}`, `avaTool('PoE gaps ${n}',{type:'poe_gap_analysis',programme_id:${id}},'narrative')`]); c.unshift([`What's missing on ${n}?`, `avaMissing(${id})`]); }
    if (role() === 'pm' || role() === 'admin') c.push(['Ending in 30 days', 'avaEnding()']);
    c.push(['My flags by page', 'avaFlags()']);
    if (r === 'clients') c.unshift(['Clients missing details', 'avaClientGaps()']);
    if (['learners', 'dq', 'enrolments', 'attendance'].includes(r)) c.unshift(['Learner gaps by programme', 'avaLearnerGaps()']);
    if (r === 'fam' && (role() === 'admin' || role() === 'qa')) c.push(['FAM compliance digest', "avaTool('FAM compliance digest',{type:'fam_compliance_digest'},'narrative')"]);
    c.push(['Draft a follow-up', "avaMode('draft')"], ['How do I…', "avaHow()"]);
    return c.map(([l, on]) => `<button type="button" class="avc" onclick="${e(on)}">${e(l)}</button>`).join('');
  }
  function render(scroll) {
    const box = document.getElementById('avapanel'); if (!box) return;
    const how = S.tab === 'how'; box.querySelectorAll('#avatabs button').forEach(b => b.classList.toggle('on', (b.dataset.t === 'how') === how));
    const ch = box.querySelector('#avachips'); ch.hidden = how; if (!how) ch.innerHTML = chips();
    const m = box.querySelector('#avamsgs');
    if (how) { m.innerHTML = howHtml(); box.querySelector('#avasend').disabled = S.busy; if (scroll) m.scrollTop = 0; return; }
    m.innerHTML = (S.msgs.length ? '' : `<div class="avhi"><b>Hi, I'm Ava.</b><p>Open <b>How to</b> for step-by-step help on this page (I tick each step as you do it), or click any amber or red flag to see why it shows.</p><p>Ask me how to do something in ApexOne, what needs your attention, or what a page or flag means. On a programme page I can summarise it and check attendance, EISA readiness and PoE gaps.</p><p class="avsm">I use the free AI tier, so I never send learner names, ID numbers, emails or phone numbers. Please don't type them. I can make mistakes: check before you act.</p></div>`)
      + S.msgs.map((x, i) => `<div class="avm ${x.r}${x.err ? ' er' : ''}">${x.r === 'u' ? e(x.t) : x.html || fmt(x.t)}${x.local ? '<div class="avsm">Answered from ApexOne, no AI used.</div>' : ''}${x.shared ? `<div class="avsm">Answer other staff marked helpful (${x.shared} 👍, no AI used).</div>` : ''}${x.cached && !x.fresh ? `<div class="avsm">Saved answer from ${e(x.at || 'earlier')} (no AI used). ${btn('Refresh', `avaRefresh('${x.cached.startsWith('page') ? 'page' : 'brief'}')`)}</div>` : ''}${x.r === 'a' && !x.err && !x.html ? fixBtns(x.t) : ''}${x.un && x.un.length ? `<div class="avw">⚠ Check these numbers, I could not match them to ApexOne data: ${e(x.un.join(', '))}</div>` : ''}${x.r === 'a' && !x.err ? `<div class="avact"><button type="button" onclick="avaCopy(${i})">Copy</button>${x.html || x.local ? '' : x.rated ? `<span class="avsm"> · ${x.rated > 0 ? '👍' : '👎'} thanks</span>` : ` <button type="button" title="Helpful" onclick="avaRate(${i},1)">👍</button> <button type="button" title="Wrong or not helpful" onclick="avaRate(${i},-1)">👎</button>`}</div>` : ''}</div>`).join('')
      + (S.busy ? '<div class="avm a avdots"><span></span><span></span><span></span></div>' : '');
    box.querySelector('#avasend').disabled = S.busy;
    if (scroll) m.scrollTop = m.scrollHeight;
  }
  window.avaMode = m => { S.tab = 'chat'; ask('', m); };
  window.avaRefresh = m => ask('', m, true);
  window.avaTool = (...a) => { S.tab = 'chat'; return tool(...a); };
  window.avaHow = () => { const i = document.getElementById('avain'); i.value = 'How do I '; i.focus(); };
  window.avaCopy = i => { const t = (S.msgs[i] || {}).t || ''; navigator.clipboard.writeText(t).then(() => window.toast && toast('Copied'), () => {}); };
  window.avaClear = () => { S.msgs = []; save(); render(); };
  window.avaToggle = open => {
    S.open = open == null ? !S.open : open; const b = document.getElementById('avapanel'); if (!b) return;
    b.classList.toggle('on', S.open); document.getElementById('avafab').setAttribute('aria-expanded', S.open);
    if (S.open) { render(true); usage(); setTimeout(() => document.getElementById('avain').focus(), 50); }
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
.avbtn{border:1px solid var(--line,#ccc);background:none;color:inherit;border-radius:6px;padding:1px 8px;font-size:12px;cursor:pointer;margin:2px 0}.avhi p{margin:6px 0}.avsm{font-size:12px;opacity:.7}
.avdots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:currentColor;opacity:.4;animation:avd 1s infinite}.avdots span:nth-child(2){animation-delay:.2s}.avdots span:nth-child(3){animation-delay:.4s}@keyframes avd{50%{opacity:1}}
#avapanel form{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--line,#ddd)}
#avain{flex:1;resize:none;min-height:40px;max-height:120px;padding:8px 10px;border:1px solid var(--line,#ccc);border-radius:10px;font:inherit;background:transparent;color:inherit}
#avatabs{display:flex;gap:4px;padding:6px 14px 0}#avatabs button{border:0;border-bottom:2px solid transparent;background:none;color:inherit;padding:6px 10px;font:600 13px inherit;cursor:pointer;opacity:.7}#avatabs button.on{border-color:#d9a400;opacity:1}
.avsteps{padding-left:20px}.avsteps li{margin:6px 0}.avsteps li.ok{opacity:.65}.avsteps li.now{font-weight:600}.avg{list-style:none;padding:0}.avg li{margin:4px 0}.avdl dt{font-weight:600;margin-top:6px}.avdl dd{margin:0 0 0 8px;font-size:13px;opacity:.85}
.avpulse{outline:3px solid #f5c542!important;outline-offset:3px;animation:avp 1s 3}@keyframes avp{50%{outline-color:transparent}}.badge.b-warn,.badge.b-bad{cursor:help}
@media print{#avafab,#avapanel{display:none}}</style>`);
    document.body.insertAdjacentHTML('beforeend', `<button id="avafab" type="button" aria-controls="avapanel" aria-expanded="false" onclick="avaToggle()" title="Ask Ava (Ctrl+K)"><span class="st">✦</span>Ava<kbd>Ctrl K</kbd></button>
<aside id="avapanel" role="dialog" aria-label="Ava assistant"><header><span class="st">✦</span><b>Ava</b><span class="sub">ApexOne assistant</span><button type="button" onclick="avaClear()">New chat</button><button type="button" onclick="avaToggle(false)" aria-label="Close">✕</button></header>
<div id="avatabs" role="tablist"><button type="button" role="tab" data-t="chat" onclick="avaTab('chat')">Chat</button><button type="button" role="tab" data-t="how" onclick="avaTab('how')">How to</button></div><div id="avause" class="avsm" style="padding:6px 14px 0"></div><div id="avachips"></div><div id="avamsgs" aria-live="polite"></div>
<form onsubmit="event.preventDefault();const i=document.getElementById('avain');const v=i.value;i.value='';avaAsk(v)"><textarea id="avain" rows="1" maxlength="800" placeholder="Ask Ava… (no ID numbers or personal details)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"></textarea><button class="btn y" id="avasend">Send</button></form></aside>`);
    document.addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); avaToggle(); } else if (ev.key === 'Escape' && S.open) avaToggle(false); });
    window.addEventListener('hashchange', () => S.open && render());
    document.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('.badge.b-warn,.badge.b-bad'); if (!b || b.closest('#avapanel,button,a,#famov')) return;
      const h = tx(b).replace(/\s+\d+$/, ''); if (!explain(h)) return; ev.stopPropagation(); ev.preventDefault();
      const tr = b.closest('tr'), mm = (tr && tr.innerHTML.match(/dv(?:ProgEdit|Prog|EOpen)\((\d+)\)/)) || []; avaExplain(h, mm[1] ? +mm[1] : 0); }, true);
    setInterval(() => { if (S.open && S.tab === 'how' && HG) render(); }, 1500);
    const o = window.dvProg; if (typeof o === 'function') window.dvProg = id => { const r = o(id); if (S.open) setTimeout(render, 0); return r; };
  }
  window.avaAsk = q => { S.tab = 'chat'; return ask(q, 'ask'); };
  const wk = () => setTimeout(() => weekly(), 400);
  window.addEventListener('hashchange', () => { if (route() === 'mywork') wk(); });
  (function waitData(n) { if (D().progs && window.apxRole) { if (route() === 'mywork') wk(); } else if (n < 60) setTimeout(() => waitData(n + 1), 1000); })(0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
