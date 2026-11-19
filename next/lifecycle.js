/* Role lifecycle strip (/next/ only for now). Shows a stage strip at the top of a role's start page:
   #pmtracker = programme lifecycle, #signoff = hand-over signing, #intake = recruitment fill.
   Read-only: counts come from P.data + 4 small selects. Click a stage to list its programmes. */
(function () {
  const P = () => window.__preview || {}, D = () => P().data || {}, sb = () => window.__sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => d.toISOString().slice(0, 10), t0 = iso(new Date()), in30 = iso(new Date(Date.now() + 30 * 864e5));
  const L = { at: 0, busy: false, HS: [], SG: [], RQ: [], PL: [], open: {} };
  const PAGES = { pmtracker: 'pm', handovers: 'so', intake: 'rec', mywork: 'adm' };
  const adm = () => ((P().roles || []).includes('admin'));

  async function load() {
    if (L.busy || Date.now() - L.at < 60000) return;
    L.busy = true;
    const q = async p => { try { const r = await p; return r.data || []; } catch (_) { return []; } };
    const s = sb(); if (!s) { L.busy = false; return; }
    [L.HS, L.SG, L.RQ, L.PL] = await Promise.all([
      q(s.from('handoff_signoffs').select('programme_id,status')),
      q(s.from('handoff_signatures').select('programme_id,role').is('invalidated_at', null)),
      q(s.from('intake_requests').select('programme_id')),
      q(s.from('intake_placements').select('programme_id,status'))]);
    L.at = Date.now(); L.busy = false;
  }

  const name = p => (p.display_id ? '#' + p.display_id + ' ' : '') + (p.programme_name || 'Programme ' + p.id) + (p.group_name ? ' · ' + p.group_name : '');
  const soon = p => p.start_date && p.start_date >= t0 && p.start_date <= in30;
  const link = (p, h) => `<a href="${h || '#handover/' + p.id}">${esc(name(p))}</a>`;
  const progLink = p => `<a href="#programmes" onclick="try{dvApi.setProg(${p.id})}catch(_){}">${esc(name(p))}</a>`;
  const when = p => p.start_date ? 'starts ' + p.start_date : 'no start date';

  function stages(kind) {
    const PR = (D().progs || []), by = new Map(PR.map(p => [p.id, p]));
    const pack = new Map(L.HS.map(h => [h.programme_id, h.status]));
    const sigs = new Map(); L.SG.forEach(g => sigs.set(g.programme_id, (sigs.get(g.programme_id) || 0) + 1));
    const st = p => String(p.status || '');
    if (kind === 'pm') {
      const g = [
        ['Initiated', 'No hand-over pack yet', PR.filter(p => st(p) === 'initiated' && !pack.has(p.id)), p => [link(p), when(p)]],
        ['Hand-over', 'Pack being prepared or signed', PR.filter(p => st(p) === 'initiated' && pack.has(p.id)), p => [link(p), (sigs.get(p.id) || 0) + ' of 3 signed · ' + when(p)]],
        ['Intake', 'Handed over, learners being filled', PR.filter(p => st(p) === 'handed_over'), p => [link(p, '#intake'), when(p)]],
        ['Active', 'In delivery', PR.filter(p => st(p) === 'active'), p => [progLink(p), p.end_date ? 'ends ' + p.end_date : '']],
        ['Closed', 'Finished', PR.filter(p => st(p) === 'closed'), p => [progLink(p), p.end_date ? 'ended ' + p.end_date : '']]];
      return g;
    }
    if (kind === 'so') {
      const packs = L.HS.map(h => by.get(h.programme_id)).filter(Boolean);
      return [
        ['Preparing', 'Pack started, nobody signed', packs.filter(p => pack.get(p.id) !== 'handed_over' && !sigs.get(p.id)), p => [link(p), when(p)]],
        ['Signing', '1 or 2 of 3 signatures', packs.filter(p => pack.get(p.id) !== 'handed_over' && sigs.get(p.id)), p => [link(p), sigs.get(p.id) + ' of 3 signed · ' + when(p)]],
        ['Handed over', 'All signed, waiting to go live', packs.filter(p => pack.get(p.id) === 'handed_over' && st(p) !== 'active' && st(p) !== 'closed'), p => [link(p), when(p)]],
        ['Activated', 'Live after hand-over', packs.filter(p => st(p) === 'active'), p => [progLink(p), when(p)]]];
    }
    if (kind === 'adm') { // admin: the whole chain, initiation to close, from the data ApexOne already holds
      const en = new Map(); (D().enrol || []).forEach(e => { if ((e.status || 'active') === 'active') en.set(e.programme_id, (en.get(e.programme_id) || 0) + 1); });
      const ended = p => p.end_date && p.end_date < t0, sz = p => +p.group_size || 0, short = p => sz(p) && (en.get(p.id) || 0) < sz(p);
      const lrn = p => [progLink(p), (en.get(p.id) || 0) + ' of ' + (sz(p) || '?') + ' learners · ' + when(p)];
      return [
        ['Initiation', 'PI working, no hand-over pack', PR.filter(p => st(p) === 'initiated' && !pack.has(p.id)), p => [link(p), when(p)]],
        ['Hand-over', 'Pack being prepared or signed', PR.filter(p => st(p) === 'initiated' && pack.has(p.id)), p => [link(p), (sigs.get(p.id) || 0) + ' of 3 signed · ' + when(p)]],
        ['Learners', 'Handed over or live, places not filled', PR.filter(p => (st(p) === 'handed_over' || st(p) === 'active') && !ended(p) && short(p)), lrn],
        ['Delivery', 'Live with learners', PR.filter(p => (st(p) === 'handed_over' || st(p) === 'active') && !ended(p) && !short(p)), lrn],
        ['Close-out', 'End date passed, not closed', PR.filter(p => st(p) !== 'closed' && st(p) !== 'initiated' && ended(p)), p => [progLink(p), 'ended ' + p.end_date]],
        ['Closed', 'Finished', PR.filter(p => st(p) === 'closed'), p => [progLink(p), p.end_date ? 'ended ' + p.end_date : '']]];
    }
    // recruitment: programmes with an intake request or placements
    const req = new Set(L.RQ.map(r => r.programme_id)), pl = new Map();
    L.PL.forEach(x => { const o = pl.get(x.programme_id) || { placed: 0, enrolled: 0 }; o[x.status === 'enrolled' ? 'enrolled' : 'placed']++; pl.set(x.programme_id, o); });
    const en = new Map(); (D().enrol || []).forEach(e => { if ((e.status || 'active') === 'active') en.set(e.programme_id, (en.get(e.programme_id) || 0) + 1); });
    const base = [...new Set([...req, ...pl.keys()])].map(id => by.get(id)).filter(p => p && st(p) !== 'closed');
    const size = p => +p.group_size || 0, o = p => pl.get(p.id) || { placed: 0, enrolled: 0 };
    const filled = p => o(p).placed + Math.max(o(p).enrolled, en.get(p.id) || 0);
    const full = p => size(p) && filled(p) >= size(p);
    const fill = p => [link(p, '#intake'), filled(p) + ' of ' + (size(p) || '?') + ' · ' + when(p)];
    return [
      ['Request in', 'New from hand-over, nobody placed', base.filter(p => !pl.has(p.id) && !(en.get(p.id))), fill],
      ['Filling', 'Places still open', base.filter(p => (pl.has(p.id) || en.get(p.id)) && !full(p)), fill],
      ['Reserved', 'Full, enrolment not finished', base.filter(p => full(p) && o(p).placed > 0), fill],
      ['Enrolled', 'Full and enrolled', base.filter(p => full(p) && !o(p).placed), fill]];
  }

  function css() {
    if (document.getElementById('lccss')) return;
    const s = document.createElement('style'); s.id = 'lccss';
    s.textContent = `.lc{margin:0 0 14px}.lcs{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));border:1px solid var(--line,#ddd);border-radius:8px;overflow:hidden;background:var(--surface,#fff)}
.lcb{all:unset;cursor:pointer;padding:10px 14px;border-right:1px solid var(--line,#ddd);display:flex;flex-direction:column;gap:2px;position:relative}.lcb:last-child{border-right:0}
.lcb:focus-visible{outline:2px solid var(--accent,#33f);outline-offset:-2px}.lcb .k{font-size:11px;color:var(--muted,#666);text-transform:uppercase;letter-spacing:.05em}
.lcb .n{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}.lcb .h{font-size:12px;color:var(--muted,#666)}.lcb .r{font-size:11px;font-weight:600;color:var(--bad,#b42318)}
.lcb.on{background:var(--surface2,#f3f3f8)}.lcb.on:after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--accent,#33f)}
.lcl{border:1px solid var(--line,#ddd);border-top:0;border-radius:0 0 8px 8px;padding:6px 14px;background:var(--surface,#fff);max-height:320px;overflow:auto}
.lcl div{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--line,#eee);font-size:13px}.lcl div:first-child{border-top:0}.lcl span{color:var(--muted,#666);white-space:nowrap}
.lct{font-size:12px;color:var(--muted,#666);margin:0 0 6px}`;
    document.head.appendChild(s);
  }

  // upcoming first (soonest on top); programmes still open past their start date go in their own group
  const stale = (kind, i, p) => p.start_date && p.start_date < t0 && (((kind === 'pm' || kind === 'adm') && i < 2) || (kind === 'so' && i < 3) || kind === 'rec');
  function list(s, kind, i) {
    const row = p => { const [a, b] = s[3](p); return `<div>${a}<span>${esc(b)}</span></div>`; };
    const cap = (arr, n) => arr.slice(0, n).map(row).join('') + (arr.length > n ? `<div><span>+ ${arr.length - n} more</span></div>` : '');
    const old = s[2].filter(p => stale(kind, i, p)).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    const up = s[2].filter(p => !stale(kind, i, p)).sort((a, b) => String(a.start_date || '9').localeCompare(String(b.start_date || '9')));
    if (!s[2].length) return '<div><span>Nothing at this stage.</span></div>';
    return (up.length ? cap(up, 40) : '<div><span>Nothing upcoming at this stage.</span></div>') +
      (old.length ? `<p class="lct" style="margin:10px 0 2px;color:var(--bad,#b42318)"><b>Past start date (${old.length})</b> · status not moved on. The PM should update or close these.</p>` + cap(old, 40) : '');
  }

  function draw(r) {
    const kind = PAGES[r], v = document.getElementById('view-' + r); if (!kind || !v || (kind === 'adm' && !adm())) return;
    css();
    let box = document.getElementById('lc-' + r);
    if (!box) { box = document.createElement('div'); box.id = 'lc-' + r; box.className = 'lc'; v.prepend(box); }
    const g = stages(kind), o = L.open[r];
    const title = { pm: 'Programme lifecycle', so: 'Hand-over signing', rec: 'Recruitment lifecycle', adm: 'ApexOne overview: initiation to close' }[kind];
    box.innerHTML = `<p class="lct"><b>${title}</b> · click a stage to see its programmes${L.at ? '' : ' · loading…'}</p><div class="lcs">` +
      g.map((s, i) => { const risk = kind !== 'so' && kind !== 'adm' || (kind === 'so' ? i < 3 : i < 2) ? s[2].filter(p => p.start_date && soon(p)).length : 0;
        return `<button class="lcb${o === i ? ' on' : ''}" data-i="${i}" aria-expanded="${o === i}"><span class="k">${esc(s[0])}</span><span class="n">${s[2].length}</span><span class="h">${esc(s[1])}</span>${risk && i < 3 ? `<span class="r">${risk} start within 30 days</span>` : ''}${(n => n ? `<span class="h">${n} past start date</span>` : '')(s[2].filter(p => stale(kind, i, p)).length)}</button>`; }).join('') + '</div>' +
      (o != null && g[o] ? `<div class="lcl">${list(g[o], kind, o)}</div>` : '');
    box.querySelectorAll('.lcb').forEach(b => b.onclick = () => { const i = +b.dataset.i; L.open[r] = L.open[r] === i ? null : i; draw(r); });
  }

  const cur = () => (location.hash.slice(1).split('/')[0] || '').split('?')[0];
  async function run() {
    const r = cur(); if (!PAGES[r] || !(D().progs || []).length) return;
    draw(r); await load(); if (cur() === r) draw(r);
  }
  // re-insert if a page repaint wipes the strip
  const mo = new MutationObserver(() => { const r = cur(); if (PAGES[r] && document.getElementById('view-' + r) && !document.getElementById('lc-' + r) && L.at) draw(r); });
  mo.observe(document.body, { childList: true, subtree: true });
  addEventListener('hashchange', () => setTimeout(run, 50));
  // Hand-over menu: icon + count (packs not yet handed over; red if any start within 30 days)
  try { ICO.handovers = 'M14 3H6v18h12V7zM14 3v4h4M9 14l2 2 4-4'; } catch (_) {}
  const hoN = () => { const by = new Map((D().progs || []).map(p => [p.id, p])); const xs = L.HS.filter(h => h.status !== 'handed_over').map(h => by.get(h.programme_id)).filter(p => p && p.status !== 'closed');
    return { n: xs.length, r: xs.some(soon) }; };
  const wrapDot = () => { const f = window.apxNavDot; if (f && f.__ho) return; const g = r => { if (r !== 'handovers') return f ? f(r) : ''; const { n, r: red } = hoN();
    return n ? `<span class="navcnt ${red ? 'r' : 'a'}" aria-label="${n} hand-over packs in progress${red ? ', some start within 30 days' : ''}">${n}</span>` : ''; }; g.__ho = 1; if (f) { g.__flow = f.__flow; g.__intk = f.__intk; } window.apxNavDot = g; };
  const nav = () => { try { wrapDot(); renderNav(curNav); } catch (_) {} };
  let tries = 0; const boot = setInterval(async () => { if ((D().progs || []).length || ++tries > 60) { clearInterval(boot); run(); await load(); nav(); } }, 1000);
  // Menu in lifecycle order + a Hand-over page (/next/ only)
  try {
    const main = document.getElementById('view-signoff');
    if (main && !document.getElementById('view-handovers')) { const m = document.createElement('main'); m.id = 'view-handovers'; m.hidden = true;
      m.innerHTML = '<p class="sub" style="margin:0 0 12px">Every programme between initiation and go-live. Initiator prepares and signs, Compliance verifies, Head of Ops signs, then the PM accepts. Click a programme to open its pack.</p>';
      main.after(m); }
    ROUTES.handovers = ['Hand-over', 'Set-up']; PARENT.handover = 'handovers'; ROUTES.handover[1] = 'Set-up';
    const G = n => (NAV.find(g => g[0] === n) || [])[1], pick = (g, rs) => { const all = G(g); if (!all) return; const by = new Map(all.map(x => [x[1], x]));
      const out = rs.map(r => by.get(r) || (r === 'handovers' ? ['Hand-over', 'handovers'] : null)).filter(Boolean); all.forEach(x => { if (!rs.includes(x[1])) out.push(x); }); all.length = 0; all.push(...out); };
    const prog = G('Set-up') && G('Set-up').find(x => x[1] === 'programmes');
    if (prog) { G('Set-up').splice(G('Set-up').indexOf(prog), 1); const d = G('Delivery'); if (d && !d.some(x => x[1] === 'programmes')) d.unshift(prog); }
    pick('Set-up', ['clients', 'accred', 'fam', 'pi', 'handovers']);
    pick('Learners', ['intake', 'enrolments', 'learners', 'dq']);
    if (ROUTES.programmes) ROUTES.programmes[1] = 'Delivery';
    if (typeof renderNav === 'function') renderNav(typeof curNav !== 'undefined' ? curNav : null);
    if (cur() === 'handovers') window.route();
  } catch (e) { console.warn('lifecycle nav', e); }
  addEventListener('hashchange', () => { if (cur() === 'handovers' && L.open.handovers == null) L.open.handovers = 0; });
  if (cur() === 'handovers') L.open.handovers = 0;
  window.apxLifecycle = { run, stages };
})();
