/* Ava command bar (Ctrl+K) + playbooks. Phase 2.
   Type what you want -> pick a playbook -> Ava shows the plan -> you click Run -> steps run as you (your login, your screen) with live ticks -> Undo.
   Playbooks only filter, open screens and point; they never save, send, delete, or change programme dates/status. 0 AI calls: keyword match + a cached pick per phrase.
   Each step: { t, run: async ctx => optional result text, done: () => bool }. */
(() => {
  const Q = s => document.querySelector(s);
  const vis = el => !!el && el.offsetParent !== null;
  const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const route = () => location.hash.slice(1).split('/')[0] || 'mywork';
  const role = () => (window.apxRole ? apxRole() : 'pm');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (f, ms = 6000) => { for (let i = 0; i < ms / 150; i++) { try { if (f()) return true; } catch (e) {} await sleep(150); } return false; };
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const tile = l => [...document.querySelectorAll('.famk')].find(b => vis(b) && txt(b.querySelector('.l') || b).toLowerCase().startsWith(l.toLowerCase()));
  const count = l => { const b = tile(l); return b ? parseInt(txt(b.querySelector('.v')), 10) || 0 : null; };
  const pulse = el => { if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('avpulse'); void el.offsetWidth; el.classList.add('avpulse'); setTimeout(() => el.classList.remove('avpulse'), 3200); };
  const firstRow = () => [...document.querySelectorAll('#view-pmtracker .famtr a')].find(vis);

  // shared steps
  const go = (r, name) => ({ t: `Open ${name}`, run: async () => { if (route() !== r) location.hash = r; await until(() => route() === r && vis(Q(`#view-${r}`))); }, done: () => route() === r });
  const pmReady = () => !!tile('Visit due') || !!Q('#view-pmtracker .empty');
  const pmOpen = { t: 'Open PM Tracker', run: async () => { if (route() !== 'pmtracker') location.hash = 'pmtracker'; if (!await until(pmReady, 8000)) throw new Error('PM Tracker did not load'); }, done: () => route() === 'pmtracker' };
  const pmClear = { t: 'Clear the tracker filters', run: async () => { if (window.adPM) adPM(); await sleep(250); }, done: () => !Q('#view-pmtracker .famk.on') };
  const pmFilter = (k, v, label) => ({ t: `Filter to "${label}"`, run: async () => {
    if (!window.adPM) throw new Error('PM Tracker filters not available');
    adPM(k, v); await until(() => tile(label) && tile(label).classList.contains('on'), 3000);
    const n = count(label); C.empty = n === 0; return n === 0 ? 'None right now. Nothing to do here.' : n == null ? '' : `${n} programme${n === 1 ? '' : 's'}.`;
  }, done: () => !!tile(label) && tile(label).classList.contains('on') });
  const point = (t, el) => ({ t, run: async () => { const e = el(); if (e) pulse(e); return e ? '' : 'Nothing to point at.'; }, done: () => true });

  const PLAYBOOKS = [
    { k: 'attention', t: 'What needs my attention (PM Tracker)', roles: ['pm', 'admin', 'qa'], words: 'attention today priorities overdue urgent what next todo to do focus',
      steps: [pmOpen, pmClear, { t: 'Count every "Needs attention" tile', run: async () => {
        const ts = [...document.querySelectorAll('.famgrp[aria-label="Needs attention"] .famk')].map(b => [txt(b.querySelector('.l')), parseInt(txt(b.querySelector('.v')), 10) || 0, b]).filter(x => x[1]);
        if (!ts.length) return 'Nothing needs attention. Well done.';
        ts.sort((a, b) => b[1] - a[1]); pulse(ts[0][2]);
        return ts.map(x => `${x[0]}: ${x[1]}`).join(' · ') + `. Start with "${ts[0][0]}" (highlighted): click it to see those programmes.`;
      }, done: () => true }] },
    { k: 'closeout', t: 'Close-out prep: programmes ending in 30 days', roles: ['pm', 'admin'], words: 'close out closeout closing ending end finish completion wrap final',
      steps: [pmOpen, pmClear, pmFilter('a', 'end', 'Ending in 30 days'), point('Point at the first programme', firstRow)],
      after: 'For each one: open it, check learners, register, PoE and recommendations are complete. Dates and status stay yours to confirm in Edit.' },
    { k: 'visits', t: 'Visit scheduling: visits due or overdue', roles: ['pm', 'admin'], words: 'visit visits monitoring schedule book booking site due overdue',
      steps: [pmOpen, pmClear, pmFilter('a', 'vis', 'Visit due or overdue'), point('Point at the first programme', firstRow)],
      after: 'Book each visit in Monitoring visits.', next: ['Open Monitoring visits', "location.hash='visits'"] },
    { k: 'gaps', t: 'Clear my data gaps (dates, SAQA ID)', roles: ['pm', 'admin'], words: 'gaps missing data dates saqa fix clean blank wrong bad',
      steps: [pmOpen, pmClear, pmFilter('q', 'dates', 'Missing or bad dates')],
      after: 'Fix them one by one with the live guide. Then do the same with the "No SAQA" tile.', next: ['Do it with me', "avaGuide('pmtracker','dates')"] },
    { k: 'register', t: 'Programmes with no register in 14 days', roles: ['pm', 'admin'], words: 'register attendance capture register missing 14 days',
      steps: [pmOpen, pmClear, pmFilter('a', 'reg', 'No register in 14 days'), point('Point at the first programme', firstRow)],
      after: 'Capture the missing registers in Attendance & PoE.', next: ['Open Attendance & PoE', "location.hash='attendance'"] }
  ];

  const C = { open: false, q: '', sel: 0, view: 'list', pb: null, st: [], undo: null };
  const words = q => String(q || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length > 2);
  function results(q) {
    const w = words(q), cache = ls('avaIntent') || {}, hit = cache[String(q).trim().toLowerCase()];
    const mineR = p => !p.roles || p.roles.includes(role()) || role() === 'admin';
    const pbs = PLAYBOOKS.filter(p => w.length || mineR(p)).map(p => {
      const hay = (p.t + ' ' + p.words).toLowerCase(); let s = w.reduce((n, x) => n + (p.t.toLowerCase().includes(x) ? 3 : hay.includes(x) ? 2 : 0), 0);
      if (hit === p.k) s += 10; if (s && mineR(p)) s += 1; return { kind: 'pb', p, s };
    }).filter(x => !w.length || x.s).sort((a, b) => b.s - a.s);
    const gs = w.length && window.AVAKB ? AVAKB.search(q).slice(0, 3).map(g => ({ kind: 'guide', g })) : [];
    const out = [...pbs, ...gs]; if (String(q).trim()) out.push({ kind: 'ask' }); return out;
  }
  const log = (p, ok, note) => { const j = ls('avaJobs') || []; j.unshift({ k: p.k, at: new Date().toISOString(), role: role(), ok, note: note || '' }); ls('avaJobs', j.slice(0, 30)); };

  function paint() {
    const box = Q('#avacmdbox'); if (!box) return;
    if (C.view === 'list') {
      const r = results(C.q); C.sel = Math.min(C.sel, Math.max(0, r.length - 1)); C.res = r;
      box.innerHTML = `<input id="avacmdin" type="text" autocomplete="off" placeholder="What do you want to do? (e.g. visits due, close-out, gaps)" value="${esc(C.q)}" aria-label="Ava command">
<div class="avcl" role="listbox">${r.map((x, i) => `<div class="avci${i === C.sel ? ' on' : ''}" role="option" aria-selected="${i === C.sel}" onmousemove="avaCmdSel(${i})" onclick="avaCmdPick(${i})">${x.kind === 'pb' ? `<b>▶ ${esc(x.p.t)}</b><span>Ava does it with you · ${x.p.steps.length} steps</span>` : x.kind === 'guide' ? `<b>? ${esc(x.g.g.t)}</b><span>Guide on ${esc(x.g.page)}</span>` : `<b>✦ Ask Ava: "${esc(C.q)}"</b><span>Opens the chat</span>`}</div>`).join('') || '<div class="avsm" style="padding:10px">No match. Type a few words.</div>'}</div>
<div class="avsm avcf">↑↓ choose · Enter pick · Esc close</div>`;
      const i = Q('#avacmdin'); i.oninput = e => { C.q = e.target.value; C.sel = 0; paint(); }; i.focus(); i.setSelectionRange(C.q.length, C.q.length);
    } else {
      const p = C.pb, run = C.view === 'run', done = C.view === 'done';
      box.innerHTML = `<div class="avch"><b>${esc(p.t)}</b><span class="avsm">${run ? 'Running as you…' : done ? 'Done' : 'Ava will:'}</span></div>
<ol class="avcs">${p.steps.map((s, i) => { const st = C.st[i] || {}; return `<li class="${st.s || ''}"><span class="ic">${st.s === 'ok' ? '✓' : st.s === 'bad' ? '✗' : st.s === 'go' ? '…' : i + 1}</span><span>${esc(s.t)}${st.m ? `<br><span class="avsm">${esc(st.m)}</span>` : ''}</span></li>`; }).join('')}</ol>
${done && C.empty ? '<p class="avsm" style="margin:6px 0"><b>Nothing to do on this list right now.</b></p>' : ''}${done && p.after && !C.empty ? `<p class="avsm" style="margin:6px 0">${esc(p.after)}</p>` : ''}
<p class="avsm" style="margin:6px 0">${done ? '' : 'Runs on your login. Only filters, opens screens and points; you save anything yourself.'}</p>
<div class="avcb">${done ? `${p.next && !C.empty ? `<button class="btn y" type="button" onclick="avaCmd(false);${esc(p.next[1])}">${esc(p.next[0])}</button>` : ''}<button class="btn" type="button" onclick="avaCmdUndo()">Undo</button><button class="btn" type="button" onclick="avaCmd(false)">Close</button>`
        : run ? '' : `<button class="btn y" type="button" id="avacmdrun" onclick="avaCmdRun()">Run</button><button class="btn" type="button" onclick="avaCmdBack()">Back</button>`}</div>`;
      const b = Q('#avacmdrun') || box.querySelector('.btn.y'); if (b) b.focus();
    }
  }

  window.avaCmd = open => {
    C.open = open === undefined ? !C.open : !!open; const ov = Q('#avacmd');
    if (!ov) return; ov.style.display = C.open ? 'flex' : 'none';
    if (C.open) { if (C.view !== 'done') { C.view = 'list'; C.q = ''; C.sel = 0; } else { C.view = 'list'; C.q = ''; } paint(); }
  };
  window.avaCmdSel = i => { if (C.sel !== i) { C.sel = i; document.querySelectorAll('.avci').forEach((e, j) => e.classList.toggle('on', j === i)); } };
  window.avaCmdBack = () => { C.view = 'list'; paint(); };
  window.avaCmdPick = i => {
    const x = (C.res || [])[i]; if (!x) return;
    if (x.kind === 'pb') { const q = C.q.trim().toLowerCase(); if (q) { const c = ls('avaIntent') || {}; c[q] = x.p.k; ls('avaIntent', c); } C.pb = x.p; C.st = []; C.view = 'plan'; paint(); }
    else if (x.kind === 'guide') { avaCmd(false); window.avaGuide && avaGuide(x.g.r, x.g.k); }
    else { const q = C.q; avaCmd(false); if (window.avaToggle) avaToggle(true); window.avaAsk && avaAsk(q); }
  };
  window.avaCmdRun = async () => {
    const p = C.pb; C.undo = { hash: location.hash || '#mywork' }; C.view = 'run'; C.st = []; C.empty = false; paint();
    for (let i = 0; i < p.steps.length; i++) {
      C.st[i] = { s: 'go' }; paint();
      try { const m = await p.steps[i].run(); C.st[i] = { s: 'ok', m: m || '' }; }
      catch (e) { C.st[i] = { s: 'bad', m: (e && e.message || 'Step failed') + '. Stopped here; nothing was saved.' }; C.view = 'done'; paint(); log(p, false, C.st[i].m); return; }
      paint();
    }
    C.view = 'done'; paint(); log(p, true);
  };
  window.avaCmdUndo = () => { const u = C.undo; if (route() === 'pmtracker' && window.adPM) adPM(); if (u && location.hash !== u.hash) location.hash = u.hash; C.undo = null; C.view = 'list'; avaCmd(false); window.toast && toast('Undone: back where you were.'); };
  window.AVACMD = { PLAYBOOKS, results };

  function mount() {
    if (Q('#avacmd')) return;
    document.head.insertAdjacentHTML('beforeend', `<style>#avacmd{position:fixed;inset:0;z-index:960;background:rgba(0,0,0,.35);display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px}
#avacmdbox{width:min(560px,100%);max-height:72vh;overflow:auto;background:var(--bg,#fff);color:var(--ink,#111);border:1px solid var(--line,#ddd);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:12px}
#avacmdin{width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px;border:1px solid var(--line,#ccc);border-radius:8px;background:transparent;color:inherit}
.avcl{margin-top:8px}.avci{padding:8px 10px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:2px}.avci span,.avcs .avsm,.avcf{font-size:12px;opacity:.75}.avci.on{background:rgba(245,197,66,.22)}
.avcf{margin-top:6px}.avch{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:6px}
.avcs{list-style:none;padding:0;margin:6px 0}.avcs li{display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--line,#eee)}.avcs .ic{width:22px;flex:none;text-align:center;font-weight:700}
.avcs li.ok .ic{color:var(--ok,#1a7f37)}.avcs li.bad .ic{color:var(--bad,#c62828)}.avcs li.go .ic{color:var(--warn,#b26a00)}.avcb{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}</style>`);
    document.body.insertAdjacentHTML('beforeend', '<div id="avacmd" role="dialog" aria-modal="true" aria-label="Ava command bar"><div id="avacmdbox"></div></div>');
    Q('#avacmd').addEventListener('click', e => { if (e.target.id === 'avacmd' && C.view !== 'run') avaCmd(false); });
    document.addEventListener('keydown', e => {
      if (!C.open) return;
      if (e.key === 'Escape' && C.view !== 'run') { e.preventDefault(); e.stopImmediatePropagation(); avaCmd(false); return; }
      if (C.view !== 'list') return;
      const n = (C.res || []).length;
      if (e.key === 'ArrowDown') { e.preventDefault(); avaCmdSel((C.sel + 1) % Math.max(n, 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); avaCmdSel((C.sel - 1 + n) % Math.max(n, 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); avaCmdPick(C.sel); }
    }, true);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
})();
