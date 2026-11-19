/* Ink notes for My desk (/next/ only): S Pen / stylus pad with pressure, palm rejection, undo, eraser.
   Saved as vector strokes in desk_notes.ink {w,h,s:[[colour,size,[x,y,p,x,y,p...]]]}. Never sent to Ava. */
(function () {
  const COLS = ['#1d1f33', '#2f3aa8', '#c0262d'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let S = null;

  function css() {
    if (document.getElementById('inkcss')) return;
    const s = document.createElement('style'); s.id = 'inkcss';
    s.textContent = `#inkpad{position:fixed;inset:0;z-index:9999;background:var(--surface,#fff);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
#inkpad .ib{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px max(10px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line,#ddd)}
#inkpad input{flex:1;min-width:140px;font:inherit;padding:7px 9px;border:1px solid var(--line,#ccc);border-radius:6px;background:var(--surface,#fff);color:inherit}
#inkpad .sw{width:26px;height:26px;border-radius:50%;border:2px solid transparent;cursor:pointer}#inkpad .sw.on{outline:2px solid var(--accent,#33f);outline-offset:2px}
#inkpad .tb.on{background:var(--accent,#33f);color:#fff}
#inkpad canvas{flex:1;touch-action:none;background:#fff;cursor:crosshair;display:block;width:100%}
#inkpad .ih{font-size:12px;color:var(--muted,#666);padding:4px 10px}
.inkth{display:block;max-width:100%;max-height:240px;background:#fff;border:1px solid var(--line,#ddd);border-radius:6px;cursor:zoom-in}
#inkview{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px}
#inkview svg{max-width:100%;max-height:100%;background:#fff;border-radius:8px}`;
    document.head.appendChild(s);
  }

  const path = (pts, w, h) => { let d = ''; for (let i = 0; i < pts.length; i += 3) d += (i ? 'L' : 'M') + pts[i] + ' ' + pts[i + 1]; if (pts.length === 3) d += 'l0.1 0'; return d; };
  const avgP = pts => { let t = 0, n = 0; for (let i = 2; i < pts.length; i += 3) { t += pts[i]; n++; } return n ? t / n : .5; };
  window.apxInkSvg = (ink, big) => {
    if (!ink || !ink.s) return '';
    const body = ink.s.map(([c, z, pts]) => `<path d="${path(pts)}" fill="none" stroke="${esc(c)}" stroke-width="${(z * (0.4 + avgP(pts) * 1.2)).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ink.w} ${ink.h}" ${big ? '' : 'class="inkth" onclick="apxInkView(this)"'} role="img" aria-label="Handwritten note">${body}</svg>`;
    return svg;
  };
  window.apxInkView = el => { const v = document.createElement('div'); v.id = 'inkview'; v.innerHTML = el.outerHTML.replace('class="inkth" onclick="apxInkView(this)"', ''); v.onclick = () => v.remove(); document.body.appendChild(v); };

  function redraw() {
    const { cv, ctx } = S, r = cv.getBoundingClientRect(); ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    S.strokes.forEach(st => seg(st, 0));
  }
  function seg(st, from) {
    const [c, z, p] = st, ctx = S.ctx; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = Math.max(3, from); i < p.length; i += 3) { ctx.lineWidth = z * (0.4 + p[i + 2] * 1.2); ctx.beginPath(); ctx.moveTo(p[i - 3], p[i - 2]); ctx.lineTo(p[i], p[i + 1]); ctx.stroke(); }
    if (p.length === 3) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0], p[1], z * 0.6, 0, 7); ctx.fill(); }
  }
  const pos = e => { const r = S.cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10, Math.round((e.pointerType === 'mouse' || !e.pressure ? .5 : e.pressure) * 100) / 100]; };
  function erase(x, y) {
    const n = S.strokes.length; S.strokes = S.strokes.filter(([, , p]) => { for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i] - x, p[i + 1] - y) < 12) return false; return true; });
    if (S.strokes.length !== n) redraw();
  }

  window.apxInk = () => {
    css(); if (document.getElementById('inkpad')) return;
    const d = document.createElement('div'); d.id = 'inkpad';
    d.innerHTML = `<div class="ib"><input id="inkt" placeholder="Title (optional)" aria-label="Ink note title">
      ${COLS.map((c, i) => `<button class="sw${i ? '' : ' on'}" data-c="${c}" style="background:${c}" aria-label="Pen colour ${i + 1}"></button>`).join('')}
      <button class="btn sm tb" id="inke" type="button">Eraser</button><button class="btn sm" id="inku" type="button">Undo</button><button class="btn sm" id="inkc" type="button">Clear</button>
      <button class="btn sm" id="inkx" type="button">Cancel</button><button class="btn sm" id="inks" type="button" style="font-weight:700">Save</button></div>
      <div class="ih" id="inkh">Write with the S Pen. Your palm is ignored once the pen has touched the screen.</div><canvas id="inkcv"></canvas>`;
    document.body.appendChild(d);
    const cv = d.querySelector('canvas'), dpr = window.devicePixelRatio || 1;
    S = { cv, ctx: cv.getContext('2d'), dpr, strokes: [], cur: null, col: COLS[0], er: false, pen: false };
    const size = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * dpr; cv.height = r.height * dpr; redraw(); };
    size(); S.rs = () => size(); addEventListener('resize', S.rs);
    d.querySelectorAll('.sw').forEach(b => b.onclick = () => { S.col = b.dataset.c; S.er = false; d.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); d.querySelector('#inke').classList.remove('on'); });
    d.querySelector('#inke').onclick = e => { S.er = !S.er; e.target.classList.toggle('on', S.er); };
    d.querySelector('#inku').onclick = () => { if (!S.strokes.length && S.cleared) { S.strokes = S.cleared; S.cleared = null; } else S.strokes.pop(); redraw(); };
    d.querySelector('#inkc').onclick = () => { if (!S.strokes.length) return; S.cleared = S.strokes; S.strokes = []; redraw(); say('Cleared. Tap Undo to bring it back.'); };
    d.querySelector('#inkx').onclick = () => { if (S.strokes.length && !S.sure) { S.sure = 1; say('Unsaved ink. Tap Cancel again to discard.'); return; } close(); };
    d.querySelector('#inks').onclick = save;
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'pen') S.pen = true; else if (e.pointerType === 'touch' && S.pen) return; // palm rejection
      cv.setPointerCapture(e.pointerId); S.pid = e.pointerId; const p = pos(e);
      if (S.er || e.button === 5 || (e.buttons & 32)) { S.erasing = true; erase(p[0], p[1]); return; }
      S.cur = [S.col, 3, p]; S.strokes.push(S.cur); seg(S.cur, 0); S.sure = 0;
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerId !== S.pid) return;
      if (S.erasing) { const p = pos(e); erase(p[0], p[1]); return; }
      if (!S.cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach(ev => { const n = S.cur[2].length; S.cur[2].push(...pos(ev)); seg(S.cur, n); });
    });
    const up = e => { if (e.pointerId === S.pid) { S.cur = null; S.erasing = false; S.pid = null; } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  };
  const say = t => { const h = document.getElementById('inkh'); if (h) h.textContent = t; };
  function close() { removeEventListener('resize', S && S.rs); const d = document.getElementById('inkpad'); if (d) d.remove(); S = null; }
  async function save() {
    if (!S.strokes.length) { say('Nothing written yet.'); return; }
    const r = S.cv.getBoundingClientRect(), t = (document.getElementById('inkt').value || '').trim();
    const ink = { w: Math.round(r.width), h: Math.round(r.height), s: S.strokes.map(([c, z, p]) => [c, z, p]) };
    say('Saving…');
    const sb = window.__sb; if (!sb) { say('Not signed in. Your ink is still here; sign in in another tab and tap Save again.'); return; }
    const { error } = await sb.from('desk_notes').insert({ kind: 'note', title: t || 'Ink note ' + new Date().toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), ink });
    if (error) { say('Not saved: ' + error.message + '. Your ink is still here; try Save again.'); return; }
    close(); if (window.apxDeskReload) window.apxDeskReload();
  }
})();
