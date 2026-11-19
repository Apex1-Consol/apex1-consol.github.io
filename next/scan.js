/* Scanned paper notes for My desk (/next/ only). Photo -> crop/rotate -> "scan look" on the phone -> JPEG (~200-300 KB)
   in private bucket desk-scans/<tenant>/..., row desk_notes {kind:'note', scan:{pages:[{p,w,h}]}}. Images NEVER go to Ava;
   only the typed summary can be sent (on tap) with emails, phone and ID numbers removed. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = 'desk-scans', MAXIN = 2400, MAXOUT = 1600;
  let S = null; const URLS = {};
  const sbc = () => window.__sb;

  function css() {
    if (document.getElementById('scancss')) return;
    const s = document.createElement('style'); s.id = 'scancss';
    s.textContent = `#scanpad{position:fixed;inset:0;z-index:9999;background:#111;color:#fff;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
#scanpad .sb{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 10px;background:var(--surface,#fff);color:var(--ink,#111)}
#scanpad input{flex:1;min-width:140px;font:inherit;font-size:16px;padding:8px 9px;border:1px solid var(--line,#ccc);border-radius:6px}
#scanpad .cv{flex:1;position:relative;min-height:0}#scanpad canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
#scanpad .pg{display:flex;gap:8px;overflow-x:auto;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));background:#000}
#scanpad .pg span{position:relative;flex:none}#scanpad .pg canvas{position:static;width:auto;height:64px;border:2px solid transparent;border-radius:4px}
#scanpad .pg span.on canvas{border-color:#ffd400}#scanpad .pg b{position:absolute;top:-4px;right:-4px;background:#c0262d;color:#fff;border-radius:50%;width:22px;height:22px;font-size:13px;line-height:22px;text-align:center}
#scanpad .msg{font-size:13px;width:100%}
.scth{display:flex;gap:6px;flex-wrap:wrap}.scth img{height:110px;border-radius:6px;border:1px solid var(--line,#ddd);cursor:zoom-in;background:#f4f4f4;min-width:70px}
#scanview{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);overflow:auto;padding:56px 8px 24px}#scanview img{display:block;width:100%;max-width:1000px;margin:0 auto 12px;background:#fff}
#scanview button{position:fixed;top:10px;right:10px}`;
    document.head.appendChild(s);
  }
  const say = t => { const m = document.getElementById('scmsg'); if (m) m.textContent = t || ''; };

  /* ---------- open: pick photos (Android offers camera or gallery) ---------- */
  function pick(cb) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
    i.onchange = () => cb([...i.files]); i.click();
  }
  function load(f) {
    return new Promise((ok, no) => { const u = URL.createObjectURL(f), im = new Image();
      im.onload = () => { const k = Math.min(1, MAXIN / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); ok({ src: c, rot: 0, crop: [0.03, 0.03, 0.97, 0.97], scan: true }); };
      im.onerror = () => { URL.revokeObjectURL(u); no(new Error('Could not read that photo')); }; im.src = u; });
  }
  async function add(files) {
    if (!files.length) return; say('Loading…');
    for (const f of files) { try { S.pages.push(await load(f)); } catch (e) { say(e.message); } }
    S.cur = S.pages.length - 1; say(''); draw(); strip();
  }
  window.apxScan = () => pick(async files => {
    if (!files.length) return; css();
    const f = document.getElementById('dkform'), t = f && f.elements.title ? f.elements.title.value.trim() : '';
    S = { pages: [], cur: 0 };
    const d = document.createElement('div'); d.id = 'scanpad';
    d.innerHTML = `<div class="sb"><input id="sct" placeholder="Title (optional)" value="${esc(t)}">
      <button class="btn sm" type="button" onclick="apxScanRot()">⟳ Rotate</button>
      <button class="btn sm" type="button" id="sclook" onclick="apxScanLook()">Scan look: on</button>
      <button class="btn sm" type="button" onclick="apxScanMore()">+ Page</button>
      <button class="btn sm" type="button" onclick="apxScanClose()">Cancel</button>
      <button class="btn sm y" type="button" id="scsave" onclick="apxScanSave()">Save</button>
      <div class="msg" id="scmsg">Drag the corners to the edges of the page.</div></div>
      <div class="cv"><canvas id="sccv"></canvas></div><div class="pg" id="scpg"></div>`;
    document.body.appendChild(d); document.documentElement.style.overflow = 'hidden';
    const cv = document.getElementById('sccv'); S.cv = cv;
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    addEventListener('resize', draw);
    await add(files);
  });
  window.apxScanClose = (force) => {
    if (!force && S && S.pages.length && !confirm('Discard these scanned pages?')) return;
    const d = document.getElementById('scanpad'); if (d) d.remove(); document.documentElement.style.overflow = ''; removeEventListener('resize', draw); S = null;
  };
  window.apxScanMore = () => pick(add);
  window.apxScanRot = () => { const p = S.pages[S.cur]; if (!p) return; p.rot = (p.rot + 1) % 4; const [a, b, c, d] = p.crop; p.crop = [1 - d, a, 1 - b, c]; draw(); strip(); };
  window.apxScanLook = () => { const p = S.pages[S.cur]; if (!p) return; p.scan = !p.scan; draw(); strip(); };
  window.apxScanSel = i => { S.cur = i; draw(); strip(); };
  window.apxScanDel = i => { S.pages.splice(i, 1); S.cur = Math.max(0, Math.min(S.cur, S.pages.length - 1)); draw(); strip(); };

  /* rotated full image of a page */
  function rotated(p) {
    const s = p.src, sw = p.rot % 2 ? s.height : s.width, shh = p.rot % 2 ? s.width : s.height, c = document.createElement('canvas');
    c.width = sw; c.height = shh; const x = c.getContext('2d'); x.translate(sw / 2, shh / 2); x.rotate(p.rot * Math.PI / 2); x.drawImage(s, -s.width / 2, -s.height / 2); return c;
  }
  /* "scan look": divide by blurred background (removes shadows), then stretch contrast */
  function look(c) {
    const w = c.width, h = c.height, x = c.getContext('2d', { willReadFrequently: true });
    const sm = document.createElement('canvas'); sm.width = Math.max(8, w >> 4); sm.height = Math.max(8, h >> 4);
    const sx = sm.getContext('2d'); sx.filter = 'blur(3px)'; sx.drawImage(c, 0, 0, sm.width, sm.height);
    const bg = document.createElement('canvas'); bg.width = w; bg.height = h; const bx = bg.getContext('2d', { willReadFrequently: true }); bx.drawImage(sm, 0, 0, w, h);
    const im = x.getImageData(0, 0, w, h), d = im.data, g = bx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], b = Math.max(1, 0.299 * g[i] + 0.587 * g[i + 1] + 0.114 * g[i + 2]);
      let n = v / b * 255; n = (n - 90) * 255 / 145; n = n < 0 ? 0 : n > 255 ? 255 : n; d[i] = d[i + 1] = d[i + 2] = n;
    }
    x.putImageData(im, 0, 0); return c;
  }
  function out(p, max) {
    const r = rotated(p), [a, b, c2, d] = p.crop, cx = a * r.width, cy = b * r.height, cw = (c2 - a) * r.width, ch = (d - b) * r.height;
    const k = Math.min(1, max / Math.max(cw, ch)), o = document.createElement('canvas'); o.width = Math.max(1, Math.round(cw * k)); o.height = Math.max(1, Math.round(ch * k));
    const ox = o.getContext('2d'); ox.fillStyle = '#fff'; ox.fillRect(0, 0, o.width, o.height); ox.drawImage(r, cx, cy, cw, ch, 0, 0, o.width, o.height);
    return p.scan ? look(o) : o;
  }

  /* ---------- editor canvas: image + crop box with corner handles ---------- */
  function geom() {
    const p = S.pages[S.cur], cv = S.cv, r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const iw = p.rot % 2 ? p.src.height : p.src.width, ih = p.rot % 2 ? p.src.width : p.src.height, pad = 24;
    const k = Math.min((r.width - pad * 2) / iw, (r.height - pad * 2) / ih);
    return { p, r, dpr, w: iw * k, h: ih * k, x: (r.width - iw * k) / 2, y: (r.height - ih * k) / 2 };
  }
  function draw() {
    if (!S || !S.cv) return; const cv = S.cv, b = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, b.width, b.height);
    const btn = document.getElementById('sclook');
    if (!S.pages.length) { if (btn) btn.textContent = 'Scan look'; say('No pages. Tap + Page.'); return; }
    const g = geom(), p = g.p; if (btn) btn.textContent = 'Scan look: ' + (p.scan ? 'on' : 'off');
    x.save(); x.translate(g.x + g.w / 2, g.y + g.h / 2); x.rotate(p.rot * Math.PI / 2);
    const dw = p.rot % 2 ? g.h : g.w, dh = p.rot % 2 ? g.w : g.h; x.drawImage(p.src, -dw / 2, -dh / 2, dw, dh); x.restore();
    const [a, bb, c, d] = p.crop, X0 = g.x + a * g.w, Y0 = g.y + bb * g.h, X1 = g.x + c * g.w, Y1 = g.y + d * g.h;
    x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.rect(0, 0, b.width, b.height); x.rect(X0, Y0, X1 - X0, Y1 - Y0); x.fill('evenodd');
    x.strokeStyle = '#ffd400'; x.lineWidth = 2; x.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    x.fillStyle = '#ffd400'; [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]].forEach(([u, v]) => { x.beginPath(); x.arc(u, v, 11, 0, 7); x.fill(); });
  }
  let drag = null;
  function down(e) {
    if (!S.pages.length) return; const g = geom(), p = g.p, px = e.clientX - g.r.left, py = e.clientY - g.r.top;
    const pts = [[0, 1], [2, 1], [0, 3], [2, 3]].map(([i, j]) => [i, j, g.x + p.crop[i] * g.w, g.y + p.crop[j] * g.h]);
    let best = null, bd = 48; pts.forEach(q => { const dd = Math.hypot(q[2] - px, q[3] - py); if (dd < bd) { bd = dd; best = q; } });
    if (best) { drag = best; S.cv.setPointerCapture(e.pointerId); e.preventDefault(); }
  }
  function move(e) {
    if (!drag) return; const g = geom(), p = g.p, cl = v => Math.max(0, Math.min(1, v));
    const u = cl((e.clientX - g.r.left - g.x) / g.w), v = cl((e.clientY - g.r.top - g.y) / g.h), [i, j] = drag;
    if (i === 0) p.crop[0] = Math.min(u, p.crop[2] - 0.05); else p.crop[2] = Math.max(u, p.crop[0] + 0.05);
    if (j === 1) p.crop[1] = Math.min(v, p.crop[3] - 0.05); else p.crop[3] = Math.max(v, p.crop[1] + 0.05);
    draw();
  }
  function up() { if (drag) { drag = null; strip(); } }
  function strip() {
    const el = document.getElementById('scpg'); if (!el || !S) return; el.innerHTML = '';
    S.pages.forEach((p, i) => { const s = document.createElement('span'); s.className = i === S.cur ? 'on' : ''; const c = out(p, 160); c.onclick = () => apxScanSel(i);
      const x = document.createElement('b'); x.textContent = '✕'; x.onclick = ev => { ev.stopPropagation(); apxScanDel(i); }; s.append(c, x); el.appendChild(s); });
  }

  /* ---------- save ---------- */
  window.apxScanSave = async () => {
    if (!S || !S.pages.length) { say('No pages to save.'); return; }
    const sb = sbc(); if (!sb) { say('Not signed in.'); return; }
    const bt = document.getElementById('scsave'); bt.disabled = true; say('Saving…');
    const done = [];
    try {
      const { data: ten, error: te } = await sb.rpc('auth_tenant_id'); if (te || !ten) throw new Error(te ? te.message : 'no tenant');
      const stamp = Date.now();
      for (let i = 0; i < S.pages.length; i++) {
        say(`Uploading page ${i + 1} of ${S.pages.length}…`);
        const c = out(S.pages[i], MAXOUT), blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.72)), path = `${ten}/${stamp}-${i + 1}.jpg`;
        const { error } = await sb.storage.from(B).upload(path, blob, { contentType: 'image/jpeg', upsert: false }); if (error) throw error;
        done.push({ p: path, w: c.width, h: c.height });
      }
      const f = document.getElementById('dkform'), fe = f ? f.elements : {}, t = document.getElementById('sct').value.trim();
      const row = { kind: 'note', title: t || 'Scanned note ' + new Date().toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        body: fe.body && fe.body.value.trim() || null, person: fe.person && fe.person.value.trim() || null, scan: { pages: done } };
      const { error } = await sb.from('desk_notes').insert(row); if (error) throw error;
      if (f) f.reset(); apxScanClose(true); window.toast && toast('Scan saved'); window.apxDeskReload && apxDeskReload();
    } catch (e) {
      if (done.length) sb.storage.from(B).remove(done.map(d => d.p));
      say('Not saved: ' + (e.message || e) + '. Your pages are still here; try Save again.'); bt.disabled = false;
    }
  };

  /* ---------- card: thumbnails (signed links, 1 hour), full view, Ask Ava (text only) ---------- */
  let fillT = 0;
  async function fill() {
    const sb = sbc(), imgs = [...document.querySelectorAll('img[data-scan]:not([src])')]; if (!sb || !imgs.length) return;
    const need = [...new Set(imgs.map(i => i.dataset.scan))].filter(p => !URLS[p]);
    if (need.length) { const { data } = await sb.storage.from(B).createSignedUrls(need, 3600); (data || []).forEach(d => { if (d.signedUrl) URLS[d.path] = d.signedUrl; }); }
    imgs.forEach(i => { if (URLS[i.dataset.scan]) i.src = URLS[i.dataset.scan]; });
  }
  window.apxScanHtml = r => {
    clearTimeout(fillT); fillT = setTimeout(fill, 30); css();
    const pg = (r.scan && r.scan.pages) || [];
    return `<div class="scth" data-id="${r.id}">${pg.map(p => `<img data-scan="${esc(p.p)}" alt="Scanned page" loading="lazy" onclick="apxScanView(${r.id})">`).join('')}</div>
      ${r.body ? `<button type="button" class="btn sm" style="align-self:flex-start" onclick="apxScanAva(${r.id})">Ask Ava to tidy the summary</button>` : ''}`;
  };
  window.apxScanView = id => {
    const imgs = [...document.querySelectorAll(`.scth[data-id="${id}"] img`)];
    const v = document.createElement('div'); v.id = 'scanview';
    v.innerHTML = `<button class="btn sm y" type="button">Close</button>` + imgs.map(i => `<img src="${esc(i.src || '')}" alt="Scanned page">`).join('');
    v.querySelector('button').onclick = () => v.remove(); document.body.appendChild(v);
  };
  const scrub = t => String(t || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b\d{13}\b/g, '[ID number]')
    .replace(/(\+?\d[\d ()-]{7,}\d)/g, '[number]')
    .slice(0, 700);
  window.apxScanAva = async id => {
    const sb = sbc(); if (!sb) return;
    const { data } = await sb.from('desk_notes').select('body').eq('id', id).single(); const t = scrub(data && data.body);
    if (!t.trim()) return;
    if (!confirm('Ava gets only the typed summary (never the photo), with emails, phone and ID numbers removed. Names you typed will still be sent. Continue?')) return;
    window.avaToggle && avaToggle(true);
    window.avaAsk && avaAsk('Tidy these handwritten meeting notes into short headings and bullet points. Then list action items (who, what, by when; use [placeholder] where unknown) and suggest a short title. Notes:\n' + t);
  };

  /* delete a note -> also remove its scanned pages */
  const del = window.apxDeskDel;
  if (del) window.apxDeskDel = async id => {
    const sb = sbc(); let paths = [];
    try { const { data } = await sb.from('desk_notes').select('scan').eq('id', id).single(); paths = ((data && data.scan && data.scan.pages) || []).map(p => p.p); } catch (e) {}
    del(id);
    if (paths.length) setTimeout(async () => { const { data } = await sb.from('desk_notes').select('id').eq('id', id); if (!data || !data.length) sb.storage.from(B).remove(paths); }, 4000);
  };
})();
