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
  css.textContent = `.flb{position:fixed;left:280px;bottom:16px;z-index:60;border:1px solid var(--line);background:var(--card,#fff);color:var(--ink);border-radius:20px;padding:7px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.flbt{white-space:nowrap;font-weight:600;cursor:pointer;flex:0 0 auto}.flb:hover{border-color:var(--accent2)}.flov{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}
.flm{background:var(--card,#fff);color:var(--ink);border-radius:10px;padding:18px;width:min(460px,100%);max-height:90vh;overflow:auto}.flm label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px}
.flm input,.flm select,.flm textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card,#fff);color:var(--ink)}
.flbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.flbar .btn.on{outline:2px solid var(--accent2)}
.flcols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.flcol{background:var(--bg2,rgba(0,0,0,.03));border-radius:8px;padding:8px;min-height:120px}
.flcol h3{font-size:13px;margin:2px 4px 8px;display:flex;justify-content:space-between}.flcard{background:var(--card,#fff);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px;cursor:pointer;font-size:13px}
.flcard.st{border-left:3px solid #d13438}.flcard .t{font-weight:600}.flcard .m{font-size:12px;opacity:.75;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap}.flcard .late{color:#d13438;font-weight:600;opacity:1}
.flprog{height:4px;background:var(--line);border-radius:2px;margin-top:6px;overflow:hidden}.flprog i{display:block;height:100%;background:#107c10}
.fldet{border-top:1px solid var(--line);margin-top:8px;padding-top:8px;cursor:default}.fldet .stp{display:flex;gap:6px;align-items:center;padding:2px 0}.fldet .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
.fldet input[type=text],.fldet input[type=date],.fldet select{font:inherit;font-size:13px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card,#fff);color:var(--ink)}
.flpv{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.flchip{font-size:12px;background:var(--bg2,rgba(0,0,0,.05));border:1px solid var(--line);border-radius:12px;padding:2px 8px}.fldup{font-size:12px;margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(255,185,0,.15)}.flmini{font-size:13px;padding:4px 0;border-bottom:1px solid var(--line)}
.flnew{background:#0078d4;color:#fff;border-radius:8px;padding:0 6px;opacity:1!important}.flcard.pr{border-top:3px solid #d13438}.flrefb{font-size:13px;margin:-4px 0 10px;padding:6px 10px;border-radius:6px;background:var(--bg2,rgba(0,0,0,.04))}
.flsum{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;padding:8px 12px;margin:0 0 10px;border:1px solid var(--line);border-radius:8px;background:var(--card,#fff);cursor:pointer}
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

  /* ---------- smart quick add: rules in the browser, nothing leaves the app (Plan with Ava strips names, emails and numbers first) ---------- */
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const WD = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)';
  const KW = [[/moderat|\bpoe|evidence/i, 'qa_mod'], [/verif/i, 'qa_ver'], [/accredit/i, 'qa_accr'], [/site visit|\bvisit\b/i, 'ohs_visit'], [/\bfam\b|registration/i, 'ohs_fam'], [/sign[- ]?off/i, 'so_review'], [/intake|recruit|candidate|shortlist|places/i, 'rec_fill'], [/hand[- ]?over/i, 'pi_hand'], [/\bpi\b|initiat|client brief/i, 'pi_new'], [/kick[- ]?off|venue|facilitator/i, 'pm_kickoff'], [/enrol|learner list|capture learners/i, 'pm_enrol'], [/attendance|check[- ]?in|register/i, 'pm_delivery'], [/assess|results/i, 'pm_assess'], [/close[- ]?out|certificate/i, 'pm_close'], [/report/i, 'rep_prep'], [/\bfix\b|wrong|typo|correct/i, 'ad_fix'], [/follow[- ]?up|chase|remind/i, 'ad_follow']];
  const SL = { pm: 'pm_kickoff', kick: 'pm_kickoff', enrol: 'pm_enrol', del: 'pm_delivery', ass: 'pm_assess', close: 'pm_close', pi: 'pi_new', hand: 'pi_hand', qa: 'qa_mod', mod: 'qa_mod', ver: 'qa_ver', acc: 'qa_accr', ohs: 'ohs_visit', visit: 'ohs_visit', fam: 'ohs_fam', so: 'so_review', sign: 'so_review', rec: 'rec_fill', intake: 'rec_fill', rep: 'rep_prep', fix: 'ad_fix', follow: 'ad_follow', custom: 'custom' };
  function when(s, P) { let t = ' ' + s + ' ', d = null; const now = new Date(); now.setHours(0, 0, 0, 0);
    const hit = (re, f) => { if (d) return; const m = t.match(re); if (!m) return; const r = f(m); if (r) { d = r; t = t.replace(m[0], ' '); } };
    const pre = '(?:by |on |due |before |until )?';
    hit(new RegExp('\\b' + pre + '(\\d{4})-(\\d{2})-(\\d{2})\\b', 'i'), m => new Date(+m[1], m[2] - 1, +m[3]));
    hit(new RegExp('(?:^|\\s)' + pre + '(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?(?=\\s)', 'i'), m => { let y = m[3] ? +m[3] : now.getFullYear(); if (y < 100) y += 2000; const x = new Date(y, m[2] - 1, +m[1]); if (!m[3] && x < now) x.setFullYear(y + 1); return x; });
    hit(new RegExp('\\b' + pre + '(\\d{1,2})(?:st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\b', 'i'), m => { const x = new Date(now.getFullYear(), MON.indexOf(m[2].toLowerCase()), +m[1]); if (x < now) x.setFullYear(x.getFullYear() + 1); return x; });
    hit(/\b(?:(a|one|two|three|\d+) (day|week)s? )?(before|after) (?:the )?(start|end)\b/i, m => { const b = P && (/start/i.test(m[4]) ? P.start_date : P.end_date); if (!b) return null;
      const n = (m[1] ? ({ a: 1, one: 1, two: 2, three: 3 })[m[1].toLowerCase()] || +m[1] : 1) * (/week/i.test(m[2] || '') ? 7 : 1); return addD(new Date(b + 'T00:00:00'), /before/i.test(m[3]) ? -n : n); });
    hit(/\bin (\d+|a|one|two|three) (day|week|month)s?\b/i, m => { const n = ({ a: 1, one: 1, two: 2, three: 3 })[m[1].toLowerCase()] || +m[1]; if (/month/i.test(m[2])) { const x = new Date(now); x.setMonth(x.getMonth() + n); return x; } return addD(now, n * (/week/i.test(m[2]) ? 7 : 1)); });
    hit(/\b(?:by )?(today|tonight|eod|end of (?:the )?day)\b/i, () => now);
    hit(/\b(?:by )?tomorrow\b/i, () => addD(now, 1));
    hit(/\b(?:by )?(?:the )?end of (?:the )?month\b/i, () => new Date(now.getFullYear(), now.getMonth() + 1, 0));
    hit(/\b(?:by )?(?:this week|end of (?:the )?week)\b/i, () => addD(now, (5 - now.getDay() + 7) % 7));
    hit(/\b(?:by )?next week\b/i, () => addD(now, ((1 - now.getDay() + 7) % 7) || 7));
    hit(new RegExp('\\b(?:by |on |this |next )?' + WD + '\\b', 'i'), m => { const w = m[1].toLowerCase(), i = DOW.findIndex(x => x.startsWith(w.slice(0, 3))); return addD(now, ((i - now.getDay() + 7) % 7) || 7); });
    return [d ? ymd(d) : null, t]; }
  function people(t) { const out = [];
    (F.staff || []).forEach(s => { const em = String(s.email).toLowerCase(), fn = String(s.name || '').split(/\s+/)[0];
      [s.name, fn, em.split('@')[0]].filter(x => x && x.length > 2).forEach(x => { if (out.some(o => o.email === em)) return; const m = t.match(new RegExp('(@)?\\b' + esc(x) + '\\b', 'i'));
        if (m) out.push({ email: em, name: s.name, i: m.index, w: m[0] }); }); });
    return out.sort((a, b) => a.i - b.i); }
  function sched(steps, due) { const n = steps.length; if (!due || !n) return steps.map(t => ({ t, d: false }));
    const a = new Date(today() + 'T00:00:00'), b = new Date(due + 'T00:00:00'), span = Math.max(0, Math.round((b - a) / 864e5));
    return steps.map((t, i) => ({ t, d: false, due: ymd(addD(a, Math.round(span * (i + 1) / n))) })); }
  const words = s => new Set(String(s).toLowerCase().split(/[^a-z0-9#]+/).filter(w => w.length > 2));
  const sim = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / (A.size + B.size - n); };
  function parse(raw, c, P) { let s = String(raw || '').trim(); const r = { tpl: null, owner: null, due: null, waiting: null, prio: false, repeat: '', steps: null, cards: null, how: {} };
    if (!s) return r;
    const sl = s.match(/^\/([a-z]+)\b\s*/i); if (sl) { const k = Object.keys(SL).find(x => sl[1].toLowerCase().startsWith(x)); if (k) { r.tpl = SL[k]; r.how.tpl = '/' + sl[1]; } s = s.slice(sl[0].length); }
    // one card per person: "Ayanda: fix #774; Amanda: check dates"
    const segs = s.split(/\s*(?:;|\n)\s*/).filter(Boolean);
    if (segs.length > 1) { const per = segs.map(g => { const m = g.match(/^@?([A-Za-z][\w.'-]+)\s*[:\-–]\s*(.+)$/); const p = m && people(m[1])[0]; return p ? [p, m[2]] : null; });
      if (per.every(Boolean)) { r.cards = per.map(([p, g]) => { const q = parse(g, c, P); return { owner: p.email, name: p.name, title: q.title, tpl: q.tpl || r.tpl || 'custom', due: q.due, prio: q.prio, repeat: q.repeat, steps: q.steps }; }); return r; } }
    if (/\b(urgent|asap|priority|critical|high priority)\b/i.test(s)) { r.prio = true; s = s.replace(/\b(urgent(ly)?|asap|high priority|priority|critical)\b,?/ig, ' '); }
    const rp = s.match(/\b(every (?:week|month)|weekly|monthly|every\s+(?=(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b))/i);
    if (rp) { r.repeat = /month/i.test(rp[0]) ? 'monthly' : 'weekly'; s = s.replace(rp[0], ' '); }
    const wt = s.match(/\b(?:waiting (?:on|for)|blocked by)\s+@?([A-Za-z][\w.'-]+)/i);
    if (wt) { const p = people(wt[1])[0]; r.waiting = p ? p.name : wt[1]; s = s.replace(wt[0], ' '); }
    const [due, rest] = when(s, P); r.due = due || (r.prio ? today() : null); s = rest;
    for (const re of [/^\s*@?([A-Za-z][\w.'-]+)\s*(?::|\bto\b|\bshould\b|\bmust\b|\bneeds? to\b|\bplease\b)\s*/i, /(?:\bfor\b|\bassign(?:ed)? to\b|\bhand(?:ed)? to\b|\bgive to\b)\s+@?([A-Za-z][\w.'-]+)/i, /@([A-Za-z][\w.'-]+)/]) {
      const ow = s.match(re), p = ow && people(ow[1])[0]; if (p) { r.owner = p.email; r.how.owner = 'named'; s = s.replace(ow[0], ' '); break; } }
    s = s.replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,;:-]+$/g, '').replace(/\s(by|on|due|before)$/i, '');
    let parts = s.split(/\s*(?:,?\s+and then\s+|,?\s+then\s+|\s+>\s+)\s*/i).filter(Boolean);
    if (parts.length < 2) { const m = s.match(/^([^:]{3,}):\s*(.+)$/); if (m && m[2].split(/\s*,\s*/).length >= 2) { s = m[1]; parts = [m[1], ...m[2].split(/\s*,\s*|\s+and\s+/)]; parts.shift(); r.steps = parts; } }
    else { s = parts[0]; r.steps = parts; }
    r.title = s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    if (!r.tpl) { const k = KW.find(([re]) => re.test(raw)); if (k) { r.tpl = k[1]; r.how.tpl = 'keyword'; } }
    if (!r.tpl && c && RT[c.r]) { r.tpl = RT[c.r]; r.how.tpl = 'page'; }
    if (!r.owner) { const L = (F.hist || []).filter(h => h.template === (r.tpl || 'custom') && h.owner_email !== me()), cnt = {};
      L.forEach(h => cnt[h.owner_email] = (cnt[h.owner_email] || 0) + 1); const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 2) { r.owner = best[0]; r.how.owner = 'usual'; }
      else if (P && P.owner_email && /^pm_/.test(r.tpl || '') && P.owner_email.toLowerCase() !== me()) { r.owner = P.owner_email.toLowerCase(); r.how.owner = 'pm'; } }
    return r; }
  async function strip(text) { const map = []; let s = String(text);
    (F.staff || []).forEach(p => { const fn = String(p.name || '').split(/\s+/)[0]; [String(p.email), p.name, fn].filter(w => w && w.length > 2).forEach(w => { const re = new RegExp('\\b' + esc(w) + '\\b', 'ig'); if (!re.test(s)) return;
      let k = map.findIndex(m => m[1] === p.name); if (k < 0) { map.push(['[P' + (map.length + 1) + ']', p.name]); k = map.length - 1; } s = s.replace(re, map[k][0]); }); });
    s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/(\+27|\b0)\d{9}\b/g, '[phone]').replace(/\b\d{6,}\b/g, '[number]');
    return [s, map]; }
  async function avaPlan(text) { const [s, map] = await strip(text);
    const { data } = await sb().auth.getSession(), tok = data.session && data.session.access_token; if (!tok) throw new Error('Please sign in again.');
    const Q = 'Break this work task into 3 to 8 short, practical steps for staff at a South African skills development provider (programmes, learners, moderation, QA, SETA). Reply with one step per line, each starting with a verb, no numbering, no extra text. Keep any [P1]-style tokens exactly as written. Task: ' + s.slice(0, 1200);
    const res = await fetch(sb().supabaseUrl + '/functions/v1/ava', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ type: 'ava', mode: 'fill', question: Q, page: 'My Flow', facts: '', history: [] }) });
    const j = await res.json().catch(() => null); if (res.status === 429) throw new Error((j && j.error) || 'Ava is busy (free AI limit). Try again in a minute.');
    if (!res.ok || !j || j.ok === false) throw new Error((j && j.error) || 'Ava could not plan this right now.');
    let a = String(j.answer || '').replace(/\{\{\w+\}\}/g, ''); map.forEach(([k, v]) => { a = a.split(k).join(v); });
    return a.split(/\n+/).map(x => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim()).filter(x => x && x.length < 160).slice(0, 8); }

  /* ---------- Action in Flow (any page) ---------- */
  function ctx() { const r = route(), v = $('view-' + r); let lab = '';
    if (v) { const h = v.querySelector('h1,h2,.title,.ptitle'); lab = h ? h.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) : ''; }
    let page = r; try { page = (ROUTES[r] && ROUTES[r][0]) || r; } catch (_) {}
    const pm = location.hash.match(/\/(\d+)(?:\/|$)/);
    return { r, page, lab, hash: location.hash || '#' + r, pid: pm ? +pm[1] : null }; }
  async function staff() { if (!F.staff) { try { const r = await sb().rpc('apx_staff'); F.staff = (r.data || []).sort((a, b) => String(a.name).localeCompare(b.name)); } catch (_) { F.staff = []; } } }
  async function openNew(pre) { await staff();
    const c = pre || ctx(), g = grp(), tk0 = (c.r === 'flow' ? GD[g] : RT[c.r]) || GD[g] || 'custom';
    let P = null; const side = [];
    if (c.pid && /prog|pmtracker|attendance|enrol|delivery|visits/.test(c.r)) side.push(sb().from('programmes').select('id,programme_name,group_name,owner_email,start_date,end_date').eq('id', c.pid).maybeSingle().then(x => { P = x.data; }, () => {}));
    if (!F.hist) side.push(sb().from('flow_items').select('template,owner_email').eq('created_by', me()).is('rule_key', null).order('created_at', { ascending: false }).limit(300).then(x => { F.hist = x.data || []; }, () => { F.hist = []; }));
    if (!F.mine) side.push(sb().from('flow_items').select('id,title,steps,history,status,owner_email').eq('owner_email', me()).neq('status', 'done').limit(400).then(x => { F.mine = x.data || []; }, () => { F.mine = []; }));
    Promise.all(side).then(() => { if ($('fl-q')) live(); });
    const opts = Object.entries(GN).map(([k, n]) => { const L = Object.entries(T).filter(([, v]) => v[0] === k); return L.length ? `<optgroup label="${e(n)}">${L.map(([id, v]) => `<option value="${id}"${id === tk0 ? ' selected' : ''}>${e(v[1])}</option>`).join('')}</optgroup>` : ''; });
    const mine = opts.splice(Object.keys(GN).indexOf(g), 1); opts.unshift(mine);
    const ttl = c.r === 'flow' ? '' : (c.lab && c.lab !== c.page ? c.lab : c.page);
    const ov = document.createElement('div'); ov.className = 'flov'; ov.innerHTML = `<div class="flm" role="dialog" aria-label="Action in Flow">
<h2 style="margin:0 0 4px;font-size:18px">Action in Flow</h2><div style="font-size:12px;opacity:.7">${c.r === 'flow' ? 'New flow item' : 'From ' + e(c.page) + (c.lab && c.lab !== c.page ? ' · ' + e(c.lab) : '')}</div>
<label for="fl-q">Describe it <span style="font-weight:400;opacity:.7">(type naturally; the fields below fill in)</span></label>
<textarea id="fl-q" rows="2" maxlength="1500" placeholder="e.g. Ayanda to fix the #774 end date by Friday, urgent · or: Prepare pack: check docs, get signatures, send to QA · /qa for a template"></textarea>
<div id="fl-pv" class="flpv"></div><div id="fl-dup"></div>
<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><button class="btn" id="fl-ai" type="button">✨ Plan steps with Ava</button><span id="fl-ais" style="font-size:12px;opacity:.7">Names, emails and ID numbers are removed before Ava sees it.</span></div>
<div id="fl-one"><label for="fl-t">What needs to happen</label><input id="fl-t" type="text" value="${e(ttl)}" maxlength="200">
<label for="fl-k">Flow</label><select id="fl-k">${opts.join('')}</select>
<label for="fl-o">Owner</label><select id="fl-o"><option value="${e(me())}">Me</option>${(F.staff || []).filter(s => String(s.email).toLowerCase() !== me()).map(s => `<option value="${e(String(s.email).toLowerCase())}">${e(s.name)}</option>`).join('')}</select>
<div style="display:flex;gap:10px"><div style="flex:1"><label for="fl-d">Due</label><input id="fl-d" type="date"></div><div style="flex:1"><label for="fl-r">Repeats</label><select id="fl-r"><option value="">No</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div></div>
<label style="display:flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" id="fl-p" style="width:auto"> Urgent (goes to the top)</label>
<label for="fl-st">Steps <span style="font-weight:400;opacity:.7">(one per line; dates are spread up to the due date)</span></label><textarea id="fl-st" rows="5"></textarea></div>
<div id="fl-many"></div>
<div id="fl-err" style="color:#d13438;font-size:13px;margin-top:6px"></div>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" id="fl-x">Cancel</button><button class="btn primary" id="fl-s">Add to Flow</button></div></div>`;
    document.body.appendChild(ov); $('fl-q').focus();
    const touched = new Set(), setSteps = k => { if (!touched.has('fl-st')) $('fl-st').value = (T[k] ? T[k][2] : []).join('\n'); };
    setSteps(tk0);
    ['fl-t', 'fl-k', 'fl-o', 'fl-d', 'fl-r', 'fl-p', 'fl-st'].forEach(id => { $(id).addEventListener('input', () => touched.add(id)); $(id).addEventListener('change', () => { touched.add(id); if (id === 'fl-k') setSteps($('fl-k').value); }); });
    let R = null;
    const chip = (t, w) => `<span class="flchip"${w ? ` title="${e(w)}"` : ''}>${t}</span>`;
    function live() { const q = $('fl-q').value; R = parse(q, c, P); const pv = [];
      if (R.cards) { $('fl-one').hidden = true; $('fl-many').innerHTML = `<div style="font-size:13px;font-weight:600;margin-top:10px">${R.cards.length} items, one per person:</div>` + R.cards.map(x => `<div class="flmini"><b>${e(x.name)}</b> · ${e(x.title)}${x.due ? ' · due ' + fmt(x.due) : ''}${x.prio ? ' · urgent' : ''}</div>`).join('');
        $('fl-s').textContent = 'Add ' + R.cards.length + ' items'; $('fl-pv').innerHTML = ''; $('fl-dup').innerHTML = ''; return; }
      $('fl-one').hidden = false; $('fl-many').innerHTML = ''; $('fl-s').textContent = 'Add to Flow';
      const set = (id, v) => { if (!touched.has(id) && v != null) { if (id === 'fl-p') $(id).checked = !!v; else $(id).value = v; } };
      if (q.trim()) { set('fl-t', R.title || ttl); if (R.tpl) { set('fl-k', R.tpl); setSteps($('fl-k').value); } set('fl-o', R.owner || me()); set('fl-d', R.due || ''); set('fl-r', R.repeat); set('fl-p', R.prio);
        if (R.steps && R.steps.length > 1 && !touched.has('fl-st')) $('fl-st').value = R.steps.join('\n'); }
      const k = $('fl-k').value, o = $('fl-o').value, d = $('fl-d').value;
      pv.push(chip('👤 ' + e(o === me() ? 'Me' : nameOf(o)), R.how.owner === 'usual' ? 'Who you usually give this kind of item to' : R.how.owner === 'pm' ? "This programme's PM" : ''));
      pv.push(chip('📅 ' + (d ? e(fmt(d)) : 'No due date')));
      pv.push(chip('🗂 ' + e(T[k] ? T[k][1] : 'Custom'), R.how.tpl === 'keyword' ? 'Picked from your words' : ''));
      if (R.prio || $('fl-p').checked) pv.push(chip('⚡ Urgent'));
      if ($('fl-r').value) pv.push(chip('↻ ' + ($('fl-r').value === 'weekly' ? 'Every week' : 'Every month')));
      if (R.waiting) pv.push(chip('⏳ Waiting on ' + e(R.waiting)));
      if (P) pv.push(chip('🔗 ' + e(P.programme_name || 'Programme') + (P.group_name ? ' · ' + e(P.group_name) : '')));
      else if (c.r !== 'flow') pv.push(chip('🔗 ' + e(c.page)));
      $('fl-pv').innerHTML = pv.join('');
      const t = $('fl-t').value, dup = t.length > 5 && (F.mine || []).map(x => [x, sim(t, x.title)]).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1])[0];
      $('fl-dup').innerHTML = dup ? `<div class="fldup">Looks like an open item: <b>${e(dup[0].title)}</b> <button class="btn" type="button" id="fl-dupb">Add as steps there instead</button></div>` : '';
      if (dup) $('fl-dupb').onclick = async () => { const x = dup[0], add = $('fl-st').value.split('\n').map(s => s.trim()).filter(Boolean); const st = [...(x.steps || []), ...(add.length ? add : [t]).map(s => ({ t: s, d: false }))];
        const { error } = await sb().from('flow_items').update({ steps: st, history: hist(x, 'Steps added: ' + (add.length ? add.length + ' steps' : t)) }).eq('id', x.id); if (error) { $('fl-err').textContent = 'Not saved: ' + error.message; return; }
        ov.remove(); toast('Added to "' + x.title.slice(0, 40) + '"'); F.mine = null; if (route() === 'flow') { await load(); paint(); } }; }
    let tm = 0; $('fl-q').oninput = () => { $('fl-err').textContent = ''; clearTimeout(tm); tm = setTimeout(live, 120); };
    ['fl-k', 'fl-o', 'fl-d', 'fl-r', 'fl-p', 'fl-t'].forEach(id => $(id).addEventListener('change', () => R && live()));
    $('fl-ai').onclick = async () => { const q = ($('fl-q').value.trim() || $('fl-t').value.trim()); if (!q) { $('fl-err').textContent = 'Describe the task first.'; return; }
      const b = $('fl-ai'); b.disabled = true; $('fl-ais').textContent = 'Ava is planning…';
      try { const st = await avaPlan(q + (c.r !== 'flow' ? ' (from the ' + c.page + ' page)' : '')); if (!st.length) throw new Error('Ava returned no steps. Try describing it differently.');
        $('fl-st').value = st.join('\n'); touched.add('fl-st'); if (!$('fl-t').value.trim()) $('fl-t').value = (R && R.title) || q.slice(0, 120); $('fl-ais').textContent = 'Ava suggested ' + st.length + ' steps. Edit them as you like.'; }
      catch (x) { $('fl-ais').textContent = x.message || String(x); } finally { b.disabled = false; } };
    const close = () => ov.remove(); ov.onclick = ev => { if (ev.target === ov) close(); }; $('fl-x').onclick = close;
    $('fl-t').oninput = () => { $('fl-err').textContent = ''; };
    const refR = c.r === 'flow' ? null : c.hash, refL = c.r === 'flow' ? null : (P ? (P.programme_name || c.page) + (P.group_name ? ' · ' + P.group_name : '') : c.page + (c.lab && c.lab !== c.page ? ' · ' + c.lab : ''));
    const mk = (title, k, o, due, rep, prio, steps, waiting) => ({ title, template: k, owner_email: o, due: due || null, repeat: rep || null, prio: !!prio,
      steps: sched(steps.length ? steps : (T[k] ? T[k][2] : []), due || null), status: waiting ? 'waiting' : 'todo', waiting_on: waiting || null,
      unread: o !== me(), from_email: o !== me() ? me() : null, ref_route: refR, ref_label: refL,
      history: [{ at: new Date().toISOString(), by: me(), t: o === me() ? 'Created' : 'Created for ' + nameOf(o) }] });
    $('fl-s').onclick = async () => { const b = $('fl-s'); let rows;
      if (R && R.cards) rows = R.cards.map(x => mk(x.title, x.tpl, x.owner, x.due, x.repeat, x.prio, x.steps || [], null));
      else { const t = $('fl-t').value.trim(); if (!t) { $('fl-err').textContent = 'Enter what needs to happen first.'; return; }
        rows = [mk(t, $('fl-k').value, $('fl-o').value, $('fl-d').value, $('fl-r').value, $('fl-p').checked, $('fl-st').value.split('\n').map(s => s.trim()).filter(Boolean), R && R.waiting)]; }
      if (rows.some(r => !r.title)) { $('fl-err').textContent = 'Each item needs a description.'; return; }
      b.disabled = true; const { error } = await sb().from('flow_items').insert(rows); if (error) { b.disabled = false; $('fl-err').textContent = 'Not saved: ' + error.message; return; }
      close(); F.mine = null; F.hist = null; F.sc = null; const o = rows[0].owner_email;
      toast(rows.length > 1 ? rows.length + ' items added' : o === me() ? 'Added to your Flow' : 'Added to ' + nameOf(o) + "'s Flow"); if (route() === 'flow') { await load(); paint(); } navCount(); chip2(); }; }
  function toast(t, go, ms) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:16px;bottom:60px;z-index:80;background:#107c10;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px' + (go ? ';cursor:pointer' : '');
    if (go) d.onclick = () => { d.remove(); go(); }; document.body.appendChild(d); setTimeout(() => d.remove(), ms || 2500); }
  function btn() { let b = $('fl-btn'); const on = !!roles().length && !['login', 'privacy', ''].includes(route()) && route() !== 'flow';
    if (!b) { b = document.createElement('button'); b.id = 'fl-btn'; b.className = 'flb'; b.textContent = '+ Action in Flow'; b.title = 'Send this page into a flow item'; b.onclick = () => openNew(); const top = document.querySelector('header.top'), at = top && top.querySelector('.sw.s');
      if (at) { b.className = 'pill flbt'; at.parentNode.insertBefore(b, at); } else document.body.appendChild(b); }
    b.hidden = !on; }

  /* ---------- Flow page ---------- */
  function card(x) { const n = (x.steps || []).length, d = (x.steps || []).filter(s => s.d).length, o = F.open === x.id, all = isAdmin() && F.all;
    let h = `<div class="flcard${stuck(x) ? ' st' : ''}${x.prio && x.status !== 'done' ? ' pr' : ''}" data-id="${x.id}"><div class="t">${e(x.title)}</div><div class="m">${x.unread && x.owner_email === me() ? `<span class="flnew">New${x.from_email ? ' from ' + e(x.from_email === 'auto' ? 'Flow rules' : nameOf(x.from_email)) : ''}</span>` : ''}${x.prio && x.status !== 'done' ? '<span class="late">Urgent</span>' : ''}${x.repeat ? `<span>↻ ${x.repeat === 'weekly' ? 'weekly' : 'monthly'}</span>` : ''}${T[x.template] ? `<span>${e(T[x.template][1])}</span>` : ''}${x.due ? `<span class="${late(x) ? 'late' : ''}">${late(x) ? 'Overdue · ' : 'Due '}${fmt(x.due)}</span>` : ''}${all ? `<span>${e(nameOf(x.owner_email))}</span>` : ''}${x.status === 'waiting' && x.waiting_on ? `<span>Waiting on ${e(x.waiting_on)}</span>` : ''}${x.status !== 'done' && !late(x) && ago(x.updated_at) >= 5 ? `<span class="late">No change ${ago(x.updated_at)} days</span>` : ''}</div>${n ? `<div class="flprog" title="${d} of ${n} steps"><i style="width:${Math.round(d / n * 100)}%"></i></div>` : ''}`;
    if (o) { h += `<div class="fldet">${(x.steps || []).map((s, i) => `<label class="stp"><input type="checkbox" data-s="${i}"${s.d ? ' checked' : ''}> <span${s.d ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${e(s.t)}</span>${s.due && !s.d ? ` <small class="${s.due < today() ? 'late' : ''}" style="opacity:.65">${fmt(s.due)}</small>` : ''}</label>`).join('')}
<div class="row"><input type="text" id="fl-ns" placeholder="Add a step" maxlength="120" style="flex:1"><button class="btn" data-a="step">Add</button></div>
${x.ref_route ? `<div class="row"><a href="${e(x.ref_route)}">Open ${e(x.ref_label || 'linked page')}</a></div>` : ''}
<div class="row">${ST.filter(s => s[0] !== x.status).map(s => `<button class="btn" data-a="st" data-v="${s[0]}">${e(s[1])}</button>`).join('')}</div>
${x.status === 'waiting' ? `<div class="row"><input type="text" id="fl-w" placeholder="Waiting on whom or what" value="${e(x.waiting_on || '')}" maxlength="120" style="flex:1"><button class="btn" data-a="wait">Save</button></div>` : ''}
<div class="row"><span style="font-size:12px">Due</span><input type="date" id="fl-due" value="${e(x.due || '')}"><span style="font-size:12px">Repeats</span><select id="fl-rp"><option value="">No</option><option value="weekly"${x.repeat === 'weekly' ? ' selected' : ''}>Weekly</option><option value="monthly"${x.repeat === 'monthly' ? ' selected' : ''}>Monthly</option></select><label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="fl-pr"${x.prio ? ' checked' : ''}> Urgent</label><span style="font-size:12px">Hand to</span><select id="fl-h"><option value="">Choose</option>${(F.staff || []).filter(s => String(s.email).toLowerCase() !== x.owner_email).map(s => `<option value="${e(String(s.email).toLowerCase())}">${e(s.name)}</option>`).join('')}</select></div>
<div class="row"><input type="text" id="fl-n" placeholder="Add a note" maxlength="300" style="flex:1"><button class="btn" data-a="note">Add note</button>${x.created_by === me() || isAdmin() ? '<button class="btn" data-a="del">Delete</button>' : ''}</div>
<div class="his">${(x.history || []).slice().reverse().map(r => `<div>${e(fmt(r.at))} · ${e(nameOf(r.by))}: ${e(r.t)}</div>`).join('')}</div></div>`; }
    return h + '</div>'; }
  function paint() { const v = $('view-flow'); if (!v || route() !== 'flow') return;
    if (F.st === 'idle') { v.innerHTML = '<p>Loading your Flow…</p>'; load().then(paint); return; }
    if (F.st === 'loading') return;
    if (F.st === 'err') { v.innerHTML = `<h1>My Flow</h1><p style="color:#d13438">Couldn't load your Flow: ${e(F.err)}</p><button class="btn" id="fl-re">Try again</button>`; $('fl-re').onclick = () => { F.st = 'idle'; paint(); }; return; }
    const all = isAdmin() && F.all; let L = F.items; if (all && F.stuck) L = L.filter(stuck); if (F.ref) L = L.filter(x => x.ref_route === F.ref);
    const open = F.items.filter(x => x.status !== 'done'), nl = open.filter(late).length, ns = open.filter(stuck).length;
    v.innerHTML = `<h1>${all ? 'Everyone\'s Flow' : 'My Flow'}</h1><p style="margin:-4px 0 10px;opacity:.75;font-size:13px">${open.length} open · ${nl} overdue · ${ns} stuck (overdue or no change in 5+ days). Use “+ Action in Flow” on any page to add the item you're looking at.</p>
${F.ref ? `<div class="flrefb">Showing items linked to <b>${e(F.refl || F.ref)}</b> · <a href="#flow" id="fl-unref">Show all</a></div>` : ''}<div class="flbar"><button class="btn primary" id="fl-new">New flow item</button>${isAdmin() ? `<button class="btn${!F.all ? ' on' : ''}" data-v="me">Mine</button><button class="btn${F.all ? ' on' : ''}" data-v="all">Everyone</button>${F.all ? `<button class="btn${F.stuck ? ' on' : ''}" id="fl-stk">Stuck only (${ns})</button>` : ''}` : ''}</div>
<div class="flcols">${ST.map(([k, n]) => { const C = L.filter(x => x.status === k).sort((a, b) => k === 'done' ? String(b.done_at).localeCompare(String(a.done_at)) : (b.prio - a.prio) || ((b.unread && b.owner_email === me()) - (a.unread && a.owner_email === me()))); const S = k === 'done' ? C.slice(0, 15) : C;
      return `<div class="flcol"><h3><span>${e(n)}</span><span>${C.length}</span></h3>${S.map(card).join('') || '<div style="font-size:12px;opacity:.6;padding:4px">Nothing here</div>'}${k === 'done' && C.length > 15 ? `<div style="font-size:12px;opacity:.6">Showing the latest 15</div>` : ''}</div>`; }).join('')}</div>`;
    $('fl-new').onclick = () => openNew({ r: 'flow' }); if ($('fl-unref')) $('fl-unref').onclick = ev => { ev.preventDefault(); F.ref = null; paint(); };
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
    $('fl-h').onchange = () => { const o = $('fl-h').value; if (o && confirm('Hand this item to ' + nameOf(o) + '?')) upd(x, { owner_email: o, unread: true, from_email: me(), status: x.status === 'done' ? 'todo' : x.status }, 'Handed to ' + nameOf(o)); };
    $('fl-rp').onchange = () => upd(x, { repeat: $('fl-rp').value || null }, $('fl-rp').value ? 'Repeats ' + $('fl-rp').value : 'Repeat off');
    $('fl-pr').onchange = () => upd(x, { prio: $('fl-pr').checked }, $('fl-pr').checked ? 'Marked urgent' : 'Urgent removed');
    if (x.unread && x.owner_email === me()) { x.unread = false; sb().from('flow_items').update({ unread: false }).eq('id', x.id).then(() => navCount()); } }

  /* ---------- route, menu, count ---------- */
  const anchor = document.querySelector('main[id^="view-"]');
  if (anchor && !$('view-flow')) { const m = document.createElement('main'); m.id = 'view-flow'; m.hidden = true; anchor.parentNode.appendChild(m); }
  try { ICO.flow = 'M4 6h10M4 12h7M4 18h10M17 5l3 3-3 3M17 13l3 3-3 3'; } catch (_) {}
  try { ROUTES.flow = ['My Flow', 'Overview']; const g = NAV.find(x => x[0] === 'Overview'); if (g && !g[1].some(x => x[1] === 'flow')) g[1].splice(1, 0, ['My Flow', 'flow']); } catch (_) {}
  const go = () => { btn(); chip2(); summ(); if (route() !== 'flow' && F.leftRef) F.ref = null; F.leftRef = route() === 'flow'; if (route() === 'flow') { F.open = null; F.st = 'idle'; setTimeout(paint, 60); } };
  addEventListener('hashchange', go);
  const nav = () => { try { renderNav(curNav); } catch (_) {} };
  async function navCount() { try { if (!me()) { if (!F.user) { const { data } = await sb().auth.getUser(); F.user = data && data.user; } if (!me()) return; }
    const { count } = await sb().from('flow_items').select('id', { count: 'exact', head: true }).eq('owner_email', me()).neq('status', 'done').or('due.lte.' + today() + ',unread.eq.true');
    F.nav = count || 0; nav(); } catch (_) {} }
  const wrapDot = () => { const f = window.apxNavDot; if (!f || f.__flow) return; const g = r => { if (r !== 'flow') return f(r); const n = F.nav || 0;
    return n ? `<span class="navcnt r" aria-label="${n} flow items new, due or overdue">${n}</span>` : ''; }; g.__flow = 1; window.apxNavDot = g; };
  (function wait0(n) { if (window.apxRole && window.__sb) { try { window.NAVR = window.NAVR || {}; NAVR.flow = () => true; } catch (_) {}
    wrapDot(); nav(); btn(); if (route() === 'flow') go();
    (function wr(k) { if (roles().length) { wrapDot(); nav(); btn(); navCount(); chip2(); summ(); notice(); if (route() === 'flow') go(); } else if (k < 60) setTimeout(() => wr(k + 1), 500); })(0);
    try { __sb.auth.onAuthStateChange(() => setTimeout(() => { F.user = null; F.staff = null; F.st = 'idle'; btn(); navCount(); }, 400)); } catch (_) {} } else if (n < 60) setTimeout(() => wait0(n + 1), 500); })(0);
  /* ---------- new-item notice, live count, page chip, summary line ---------- */
  async function notice() { try { if (sessionStorage.getItem('flnote')) return; sessionStorage.setItem('flnote', 1); } catch (_) {}
    if (!me()) return; const { data } = await sb().from('flow_items').select('from_email').eq('owner_email', me()).eq('unread', true).neq('status', 'done').limit(50);
    if (!data || !data.length) return; const by = [...new Set(data.map(x => x.from_email === 'auto' ? 'Flow rules' : nameOf(x.from_email)))].slice(0, 3).join(', ');
    toast(data.length + ' new item' + (data.length > 1 ? 's' : '') + ' in your Flow' + (by ? ' (from ' + by + ')' : '') + ' – click to open', () => { location.hash = 'flow'; }, 9000); }
  setInterval(() => { if (!document.hidden && roles().length) { navCount(); if (route() === 'flow' && !F.open && !document.querySelector('.flov')) { load().then(paint); } } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && roles().length) navCount(); });
  async function chip2() { const old = $('fl-chip'); if (old) old.remove(); const r = route(), b = $('fl-btn'); if (!b || b.hidden || ['flow', 'login', 'privacy', ''].includes(r) || !me()) return;
    const h = location.hash; const { count } = await sb().from('flow_items').select('id', { count: 'exact', head: true }).eq('ref_route', h).neq('status', 'done');
    if (!count || location.hash !== h || $('fl-chip')) return; const c = document.createElement('button'); c.id = 'fl-chip'; c.className = b.className; c.style.marginLeft = '6px';
    c.textContent = count + ' open in Flow'; c.title = 'Flow items linked to this page'; c.onclick = () => { const x = ctx(); F.ref = h; F.refl = x.page + (x.lab && x.lab !== x.page ? ' · ' + x.lab : ''); if (isAdmin()) F.all = true; location.hash = 'flow'; };
    b.parentNode.insertBefore(c, b.nextSibling); }
  async function stats() { if (F.sc && Date.now() - F.sc.t < 60000) return F.sc; const { data } = await sb().from('flow_items').select('status,due,unread,prio').eq('owner_email', me()).neq('status', 'done').limit(1000);
    const L = data || [], t = today(); F.sc = { t: Date.now(), open: L.length, late: L.filter(x => x.due && x.due < t).length, today: L.filter(x => x.due === t).length, waiting: L.filter(x => x.status === 'waiting').length, fresh: L.filter(x => x.unread).length, urgent: L.filter(x => x.prio).length }; return F.sc; }
  let sumT = 0; function summ() { clearInterval(sumT); if (!['mywork', 'today'].includes(route())) return; const put = async () => { const r = route(), v = $('view-' + r); if (!v || v.hidden || !me() || !['mywork', 'today'].includes(r)) return;
      if ($('fl-sum') && v.contains($('fl-sum'))) return; const s = await stats(); if (!s.open || ($('fl-sum') && v.contains($('fl-sum')))) return; const old = $('fl-sum'); if (old) old.remove();
      const d = document.createElement('div'); d.id = 'fl-sum'; d.className = 'flsum'; d.title = 'Open My Flow';
      d.innerHTML = `<b>My Flow</b><span>${s.open} open</span>${s.fresh ? `<span class="flnew">${s.fresh} new</span>` : ''}${s.urgent ? `<span style="color:#d13438;font-weight:600">${s.urgent} urgent</span>` : ''}${s.late ? `<span style="color:#d13438;font-weight:600">${s.late} overdue</span>` : ''}${s.today ? `<span>${s.today} due today</span>` : ''}${s.waiting ? `<span>${s.waiting} waiting on someone</span>` : ''}<span style="margin-left:auto;opacity:.7">Open →</span>`;
      d.onclick = () => { location.hash = 'flow'; }; v.insertBefore(d, v.firstChild); };
    put(); sumT = setInterval(put, 3000); }
  /* ---------- Ava answer -> Flow: review list, one card with steps by default, one card per person when people are named ---------- */
  async function fromAva(q, ans) { await staff();
    if (!F.mine) { try { const x = await sb().from('flow_items').select('id,title,steps,history,status,owner_email').eq('owner_email', me()).neq('status', 'done').limit(400); F.mine = x.data || []; } catch (_) { F.mine = []; } }
    const c = ctx(), clean = t => String(t).replace(/\{\{\w+\}\}/g, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
    let L = String(ans || '').split(/\n+/).map(x => x.trim()).filter(x => /^(?:[-*•]|\d+[.)])\s+/.test(x)).map(x => clean(x.replace(/^(?:[-*•]|\d+[.)])\s+/, '')));
    if (L.length < 2) L = clean(ans).split(/(?<=[.!])\s+(?=[A-Z])/).filter(x => x.length > 12 && !/^(to |here|this |you can|i can|note)/i.test(x));
    L = L.map(x => x.replace(/[:.]$/, '')).filter(x => x.length > 3 && x.length < 220).slice(0, 12);
    if (!L.length) { toast('Nothing to turn into steps in this answer.'); return; }
    const items = L.map(t => { const r = parse(t, c, null), ak = t.match(/\b(?:ask|tell|get|remind|email|call|let)\s+@?([A-Za-z][\w.'-]+)/i), ap = ak && people(ak[1])[0], o = r.how.owner === 'named' ? r.owner : ap ? String(ap.email).toLowerCase() : null; return { t, on: true, owner: o, due: r.due, prio: r.prio }; });
    const qt = clean(q).replace(/^(please\s+)?(how (do|can|should) (i|we)|what (do|should) (i|we)( do)?( to)?|can you( help me)?|help me( with| to)?|i want to|i need to|show me how to|tell me how to)\s+/i, '').replace(/[?.!]+$/, '');
    const title0 = qt.length > 4 && !/^help me with what is on my screen/i.test(qt) ? qt.charAt(0).toUpperCase() + qt.slice(1, 160) : 'Next steps on ' + c.page;
    const tpl0 = (KW.find(([re]) => re.test(q + ' ' + ans)) || [])[1] || RT[c.r] || 'custom';
    const people = () => [...new Set(items.filter(i => i.on && i.owner).map(i => i.owner))];
    let split = people().length >= 1 && people().some(o => o !== me()) && items.some(i => i.on && i.owner);
    const ov = document.createElement('div'); ov.className = 'flov';
    ov.innerHTML = `<div class="flm" role="dialog" aria-label="Action in Flow from Ava"><h2 style="margin:0 0 4px;font-size:18px">Action in Flow</h2><div style="font-size:12px;opacity:.7">From Ava's answer · ${e(c.page)}. Untick anything you don't need.</div>
<label for="fa-t">What needs to happen</label><input id="fa-t" type="text" maxlength="200" value="${e(title0)}">
<div id="fa-l" style="margin-top:8px"></div>
<div id="fa-m" style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"></div>
<div style="display:flex;gap:10px"><div style="flex:1"><label for="fa-d">Due</label><input id="fa-d" type="date"></div><div style="flex:1;display:flex;align-items:flex-end"><label style="display:flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" id="fa-p" style="width:auto"> Urgent</label></div></div>
<div id="fa-dup"></div><div id="fa-err" style="color:#d13438;font-size:13px;margin-top:6px"></div>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" id="fa-x" type="button">Cancel</button><button class="btn primary" id="fa-s" type="button">Add to Flow</button></div></div>`;
    document.body.appendChild(ov); const close = () => ov.remove(); ov.onclick = ev => { if (ev.target === ov) close(); }; $('fa-x').onclick = close;
    const d0 = items.map(i => i.due).filter(Boolean).sort().pop(); if (d0) $('fa-d').value = d0; if (items.some(i => i.prio)) $('fa-p').checked = true;
    const opt = sel => `<option value="">Me</option>${(F.staff || []).filter(s => String(s.email).toLowerCase() !== me()).map(s => { const m = String(s.email).toLowerCase(); return `<option value="${e(m)}"${m === sel ? ' selected' : ''}>${e(s.name)}</option>`; }).join('')}`;
    const groups = () => { const on = items.filter(i => i.on); if (!split) return [{ owner: me(), list: on }]; const m = new Map(); on.forEach(i => { const k = i.owner || me(); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return [...m].map(([owner, list]) => ({ owner, list })); };
    function paintL() {
      $('fa-l').innerHTML = items.map((i, k) => `<div class="flmini" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-k="${k}"${i.on ? ' checked' : ''} style="width:auto;margin-top:3px" aria-label="Include step"><span style="flex:1${i.on ? '' : ';opacity:.45;text-decoration:line-through'}">${e(i.t)}</span>${split ? `<select data-o="${k}" style="width:auto;max-width:140px;font-size:12px" aria-label="Owner">${opt(i.owner)}</select>` : ''}</div>`).join('');
      $('fa-l').querySelectorAll('[data-k]').forEach(x => x.onchange = () => { items[+x.dataset.k].on = x.checked; paintL(); });
      $('fa-l').querySelectorAll('[data-o]').forEach(x => x.onchange = () => { items[+x.dataset.o].owner = x.value || null; paintL(); });
      const G = groups(), n = items.filter(i => i.on).length;
      $('fa-m').innerHTML = `<button type="button" class="btn${split ? '' : ' primary'}" id="fa-one">One card, ${n} steps</button><button type="button" class="btn${split ? ' primary' : ''}" id="fa-sp">One card per person</button>` + (split ? `<span style="font-size:12px;opacity:.7;align-self:center">${G.length} card${G.length > 1 ? 's' : ''}: ${G.map(g => e(g.owner === me() ? 'Me' : nameOf(g.owner))).join(', ')}</span>` : '');
      $('fa-one').onclick = () => { split = false; paintL(); }; $('fa-sp').onclick = () => { split = true; paintL(); };
      $('fa-s').textContent = G.length > 1 ? 'Add ' + G.length + ' cards' : 'Add to Flow';
      const t = $('fa-t').value, dup = !split && t.length > 5 && (F.mine || []).map(x => [x, sim(t, x.title)]).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1])[0];
      $('fa-dup').innerHTML = dup ? `<div class="fldup">Looks like an open item: <b>${e(dup[0].title)}</b> <button class="btn" type="button" id="fa-dupb">Add as steps there instead</button></div>` : '';
      if (dup) $('fa-dupb').onclick = async () => { const x = dup[0], add = items.filter(i => i.on).map(i => ({ t: i.t, d: false }));
        const { error } = await sb().from('flow_items').update({ steps: [...(x.steps || []), ...add], history: hist(x, 'Steps added from Ava: ' + add.length) }).eq('id', x.id); if (error) { $('fa-err').textContent = 'Not saved: ' + error.message; return; }
        close(); toast('Added to "' + x.title.slice(0, 40) + '"'); F.mine = null; if (route() === 'flow') { await load(); paint(); } navCount(); chip2(); }; }
    paintL(); $('fa-t').oninput = () => { clearTimeout(ov.tm); ov.tm = setTimeout(paintL, 200); };
    $('fa-s').onclick = async () => { const t = $('fa-t').value.trim(), G = groups().filter(g => g.list.length), due = $('fa-d').value || null, prio = $('fa-p').checked;
      if (!t) { $('fa-err').textContent = 'Enter what needs to happen first.'; return; } if (!G.length) { $('fa-err').textContent = 'Tick at least one step.'; return; }
      const rows = G.map(g => ({ title: t.slice(0, 200), template: tpl0, owner_email: g.owner, due, repeat: null, prio, steps: sched(g.list.map(i => i.t), due), status: 'todo', waiting_on: null,
        unread: g.owner !== me(), from_email: g.owner !== me() ? me() : null, ref_route: c.r === 'flow' ? null : c.hash, ref_label: c.r === 'flow' ? null : c.page + (c.lab && c.lab !== c.page ? ' · ' + c.lab : ''),
        history: [{ at: new Date().toISOString(), by: me(), t: (g.owner === me() ? 'Created' : 'Created for ' + nameOf(g.owner)) + ' from an Ava answer' }] }));
      const b = $('fa-s'); b.disabled = true; const { error } = await sb().from('flow_items').insert(rows); if (error) { b.disabled = false; $('fa-err').textContent = 'Not saved: ' + error.message; return; }
      close(); F.mine = null; F.hist = null; F.sc = null; toast(rows.length > 1 ? rows.length + ' cards added' : rows[0].owner_email === me() ? 'Added to your Flow' : 'Added to ' + nameOf(rows[0].owner_email) + "'s Flow", () => { location.hash = 'flow'; });
      if (route() === 'flow') { await load(); paint(); } navCount(); chip2(); }; }
  window.apxFlowFromAva = fromAva;
  window.apxFlowAdd = openNew;
  window.apxFlowStats = () => { if (F.st !== 'ok') return null; const o = F.items.filter(x => x.status !== 'done'); return { open: o.length, late: o.filter(late).length, stuck: o.filter(stuck).length, waiting: o.filter(x => x.status === 'waiting').length, all: !!F.all }; };
  window.apxFlowView = (all, stk) => { F.all = !!all && isAdmin(); F.stuck = !!stk; F.open = null; F.st = 'idle'; paint(); };
})();
