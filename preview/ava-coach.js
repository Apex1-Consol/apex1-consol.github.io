/* Ava Phase 3: Start here + practice mode + skills tracker. No AI calls.
   Lessons = AVAKB guides per role. Practice = do the guide yourself on the real screens; Ava blocks every save while you practise,
   ticks steps (done() or a click on the step's target), counts hints, and records the skill (localStorage + ava_skills). */
(() => {
  const Q = s => document.querySelector(s), KB = () => window.AVAKB;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const role = () => (window.apxRole && apxRole()) || 'pm';
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const NAME = { pm: 'PM', qa: 'QA', pi: 'PI', admin: 'Admin' };
  const PATHS = {
    pm: ['mywork.start', 'pmtracker.attention', 'pmtracker.dates', 'pmtracker.caseload', 'programmes.missing', 'programmes.edit', 'attendance.register', 'attendance.modules', 'visits.add', 'recs.close'],
    qa: ['mywork.start', 'modver.link', 'qcto.book', 'visits.add', 'eisa.read', 'attendance.modules', 'fam.renew'],
    pi: ['mywork.start', 'pi.new', 'clients.gaps', 'programmes.edit', 'signoff.review'],
    admin: ['mywork.start', 'pmtracker.attention', 'signoff.review', 'dq.id', 'clients.gaps', 'fam.renew', 'reports.move']
  };
  const lessons = r => (PATHS[r] || PATHS.pm).map(id => { const [p, k] = id.split('.'), pg = KB() && KB().PAGES[p], g = pg && pg.guides[k]; return g ? { id, r: p, k, g, page: pg.name } : null; }).filter(Boolean);
  const skills = () => ls('avaSkills') || {};
  const progress = r => { const L = lessons(r), s = skills(); const n = L.filter(l => s[l.id]).length; return { n, of: L.length, ready: L.length && n === L.length }; };
  const SAVE = /^(save|submit|approve|return|send|delete|remove|withdraw|request close|set for all|add sa id|confirm|upload|archive|import)/i;
  const P = { on: false, l: null, i: 0, hints: 0, hit: -1, timer: 0, view: 'list' };
  const txt = el => (el.textContent || el.value || '').replace(/\s+/g, ' ').trim();

  function stepDone(i) { const s = P.l.g.steps[i]; if (!s) return true; if (s.done) { try { if (s.done()) return true; } catch (_) {} } return P.hit >= i; }
  function tick() {
    if (!P.on) return; let moved = false;
    while (P.i < P.l.g.steps.length && stepDone(P.i)) { P.i++; moved = true; }
    if (P.i >= P.l.g.steps.length) return finish(); if (moved) paint();
  }
  function finish() {
    clearInterval(P.timer); const score = Math.max(1, 3 - P.hints), id = P.l.id, s = skills();
    if (!s[id] || s[id].score <= score) { s[id] = { score, hints: P.hints, at: new Date().toISOString() }; ls('avaSkills', s); }
    try { window.__sb && __sb.from('ava_skills').upsert({ skill: id, score, hints: P.hints, role: role(), passed_at: new Date().toISOString() }, { onConflict: 'tenant_id,user_email,skill' }).then(() => {}, () => {}); } catch (_) {}
    P.on = false; P.view = 'pass'; P.score = score; paint();
  }
  // While practising, block anything that would save; a blocked click on the current step's target still counts.
  function guard(e) {
    if (!P.on || e.target.closest('#avacoach,#avapanel,#avacmd')) return;
    const st = P.l.g.steps[P.i], tgt = st && st.sel && KB().find(st.sel);
    const onStep = !!tgt && tgt.contains(e.target);
    const b = e.target.closest('button,a.btn,input[type=submit]');
    const save = !!b && !b.classList.contains('famk') && (b.type === 'submit' || SAVE.test(txt(b)));
    if (save) { e.preventDefault(); e.stopImmediatePropagation(); window.toast && toast('Practice: nothing saved.'); }
    if (onStep) { P.hit = Math.max(P.hit, P.i); setTimeout(tick, 50); }
  }
  function block(e) { if (P.on && !e.target.closest('#avacoach')) { e.preventDefault(); e.stopImmediatePropagation(); window.toast && toast('Practice: nothing saved.'); } }

  function paint() {
    const box = Q('#avacoach'); if (!box) return; const r = role(), pr = progress(r), s = skills();
    let h = `<div class="avkh"><b>${P.view === 'list' ? 'Start here' : esc(P.l.g.t)}</b><button type="button" class="avkx" aria-label="Close" onclick="avaLearn(false)">×</button></div>`;
    if (P.view === 'list') {
      h += `<p class="avsm">Your ${NAME[r] || 'PM'} path: ${pr.n}/${pr.of} done${pr.ready ? ` · <b class="avok">${NAME[r] || 'PM'} ready ✓</b>` : ''}. <b>Learn</b> = Ava walks you through it. <b>Practise</b> = you do it, Ava checks; nothing is saved.</p><ol class="avkl">`
        + lessons(r).map(l => `<li class="${s[l.id] ? 'ok' : ''}"><span><b>${s[l.id] ? '★'.repeat(s[l.id].score) + ' ' : ''}${esc(l.g.t)}</b><br><span class="avsm">${esc(l.page)}</span></span><span class="avkb"><button type="button" class="btn" onclick="avaLearnGuide('${l.id}')">Learn</button><button type="button" class="btn y" onclick="avaPractise('${l.id}')">Practise</button></span></li>`).join('') + '</ol>';
    } else if (P.view === 'run') {
      h += `<p class="avsm">Practice: do each step yourself on the real screen. Saves are blocked. Hints used: ${P.hints}.</p><ol class="avkl">`
        + P.l.g.steps.map((st, i) => `<li class="${i < P.i ? 'ok' : i === P.i ? 'now' : ''}"><span>${i < P.i ? '✓ ' : ''}${esc(st.t)}</span></li>`).join('') + '</ol>'
        + `<div class="avkb"><button type="button" class="btn" onclick="avaPHint()">Show me (hint)</button><button type="button" class="btn" onclick="avaPSkip()">Can't do this step</button><button type="button" class="btn" onclick="avaPStop()">Stop</button></div>`;
    } else {
      const nx = lessons(r).find(l => !skills()[l.id]);
      h += `<p><b>Passed ${'★'.repeat(P.score)}${'☆'.repeat(3 - P.score)}</b> <span class="avsm">(${P.hints} hint${P.hints === 1 ? '' : 's'})</span></p><p class="avsm">${pr.ready ? `All done: you're <b>${NAME[r] || 'PM'} ready ✓</b>.` : `${pr.n}/${pr.of} on your path.`}</p>`
        + `<div class="avkb">${nx ? `<button type="button" class="btn y" onclick="avaPractise('${nx.id}')">Next: ${esc(nx.g.t)}</button>` : ''}<button type="button" class="btn" onclick="avaPractise('${P.l.id}')">Again</button><button type="button" class="btn" onclick="avaLearn(true)">All lessons</button></div>`;
    }
    box.innerHTML = h;
  }
  const byId = id => lessons(role()).concat(...Object.keys(PATHS).map(lessons)).find(l => l.id === id);
  window.avaLearn = open => { const box = Q('#avacoach'); if (!box) return; const o = open === undefined ? box.hidden : !!open; if (!o) { avaPStop(true); box.hidden = true; return; } P.view = 'list'; box.hidden = false; paint(); };
  window.avaLearnGuide = id => { const l = byId(id); if (!l) return; avaLearn(false); location.hash = l.r; window.avaGuide && avaGuide(l.r, l.k); };
  window.avaPractise = id => { const l = byId(id); if (!l) return; clearInterval(P.timer); Object.assign(P, { on: true, l, i: 0, hints: 0, hit: -1, view: 'run' }); Q('#avacoach').hidden = false; if (window.avaToggle) avaToggle(false); paint(); P.timer = setInterval(tick, 400); tick(); };
  window.avaPHint = () => { const st = P.l && P.l.g.steps[P.i], el = st && KB().find(st.sel); P.hints++; if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('avpulse'); void el.offsetWidth; el.classList.add('avpulse'); setTimeout(() => el.classList.remove('avpulse'), 3200); } else window.toast && toast('Not on screen yet: finish the step before it first.'); paint(); };
  window.avaPSkip = () => { if (!P.on) return; P.hints++; P.hit = Math.max(P.hit, P.i); tick(); paint(); };
  window.avaPStop = quiet => { const was = P.on; P.on = false; clearInterval(P.timer); if (was && quiet !== true) { P.view = 'list'; paint(); } };
  window.AVACOACH = { PATHS, lessons, progress, guard, P };

  function mount() {
    if (Q('#avacoach')) return;
    document.head.insertAdjacentHTML('beforeend', `<style>#avacoach{position:fixed;left:16px;bottom:16px;z-index:950;width:min(360px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:var(--bg,#fff);color:var(--ink,#111);border:1px solid var(--line,#ddd);border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.22);padding:12px}
.avkh{display:flex;justify-content:space-between;align-items:center;gap:8px}.avkx{border:0;background:none;color:inherit;font-size:20px;cursor:pointer}
.avkl{list-style:none;padding:0;margin:6px 0}.avkl li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--line,#eee)}
.avkl li.ok>span:first-child b{color:var(--ok,#1a7f37)}.avkl li.now{font-weight:600}.avkb{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start}.avkb .btn{padding:4px 10px;font-size:12px}.avok{color:var(--ok,#1a7f37)}#avacoach .avsm{font-size:12px;opacity:.8}</style>`);
    document.body.insertAdjacentHTML('beforeend', '<div id="avacoach" role="dialog" aria-label="Ava Start here" hidden></div>');
    document.addEventListener('click', guard, true); document.addEventListener('submit', block, true);
    if (!ls('avaStartSeen')) setTimeout(() => { if (document.body.classList.contains('embed') || /embed=1/.test(location.search) || !window.apxRole) return; ls('avaStartSeen', 1); avaLearn(true); }, 4000);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
})();
