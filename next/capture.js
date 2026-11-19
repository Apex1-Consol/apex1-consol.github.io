/* My desk ＋ Capture (/next/ only): one note in progress built from pages (copied text, scans, S Pen ink, typing).
   Saved as you go in ApexOne as desk_notes status 'draft' (pages jsonb) - nothing kept on the phone. Scans upload at once
   (private bucket desk-scans). Drafts older than 7 days are deleted (with their scans) when an admin opens My desk.
   Finish: Fill with Ava (text only, never images) -> check screen (Edit form) -> Save; or Save without Ava. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sbc = () => window.__sb, B = 'desk-scans', $ = id => document.getElementById(id);
  let C = null, T = 0; const URLS = {};
  const stamp = () => new Date().toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function css() {
    if ($('capcss')) return;
    const s = document.createElement('style'); s.id = 'capcss';
    s.textContent = `#capov{position:fixed;inset:0;z-index:9000;background:var(--bg,#f4f4f8);overflow:auto;padding:calc(10px + env(safe-area-inset-top,0px)) 10px calc(90px + env(safe-area-inset-bottom,0px))}
#capov .cw{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
#capov .ch{display:flex;gap:6px;align-items:center;flex-wrap:wrap}#capov .ch input{flex:1 1 200px;font-size:16px;height:42px;padding:0 10px;border:1px solid var(--line,#ccc);border-radius:8px}
#capov .pgc{background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}
#capov .pgc textarea{width:100%;min-height:120px;font:inherit;font-size:16px;padding:8px;border:1px solid var(--line,#ddd);border-radius:8px;box-sizing:border-box}
#capov .pgc img{max-height:160px;border-radius:6px;border:1px solid var(--line,#ddd)}
#capov .add{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}#capov .add .btn{min-height:52px;justify-content:center;display:flex;align-items:center}
#capov .ft{position:fixed;left:0;right:0;bottom:0;background:var(--surface,#fff);border-top:1px solid var(--line,#ddd);padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:8px;justify-content:center;flex-wrap:wrap;z-index:9001}
#capclip{position:sticky;top:0;z-index:2;background:#ffd400;color:#0F0E33;border-radius:10px;padding:10px 12px;display:flex;gap:8px;align-items:center}
#capov .st{font-size:12px;color:var(--muted,#666)}
#capov .pgc svg{max-height:180px;max-width:100%;width:auto}`;
    document.head.appendChild(s);
  }
  const say = t => { const m = $('capst'); if (m) m.textContent = t; };

  /* ---------- open ---------- */
  window.apxCapture = id => {
    css(); const d = (window.apxDeskDrafts || []).find(r => r.id === id);
    C = d ? { id: d.id, title: d.title === 'Unfinished capture' ? '' : (d.title || ''), pages: Array.isArray(d.pages) ? d.pages : [] } : { id: null, title: '', pages: [] };
    const o = document.createElement('div'); o.id = 'capov';
    o.innerHTML = `<div class="cw"><div class="ch"><b style="font-size:20px">＋ Capture</b><span class="st" id="capst">${C.id ? 'Saved in ApexOne' : 'Add your first page'}</span><span style="flex:1"></span>
        <button class="btn sm" type="button" onclick="apxCapClose()">Close (keep)</button><button class="btn sm" type="button" onclick="apxCapDiscard()">Discard</button></div>
      <div class="ch"><input id="captitle" placeholder="Title (optional - Ava can suggest one)" value="${esc(C.title)}" oninput="apxCapTitle(this.value)"></div>
      <div id="capclip" hidden><span style="flex:1">📋 Copied a page? Add it as page <b id="capn"></b></span><button class="btn sm" type="button" onclick="apxCapPaste()">Add</button><button class="btn sm" type="button" onclick="document.getElementById('capclip').hidden=true">No</button></div>
      <div id="cappages" style="display:flex;flex-direction:column;gap:8px"></div>
      <b style="font-size:14px">Add a page</b>
      <div class="add"><button class="btn" type="button" onclick="apxCapPaste()">📋 Copied text</button>
        <label class="btn" style="cursor:pointer">📷 Scan photo<input type="file" accept="image/*" multiple hidden onchange="apxScanFiles(this, apxCapScan)"></label>
        <button class="btn" type="button" onclick="apxInk(apxCapInk)">✍️ Handwrite / sketch</button><button class="btn" type="button" onclick="apxCapType()">⌨ Type</button></div><div style="font-size:12px;opacity:.7;margin-top:6px">Tip: tap the 🎤 on your keyboard to dictate instead of typing.</div>
      <span class="st">Tip: in Gallery tap T → Copy all, then come back here and tap Add. Nothing is kept on your phone; this is saved in ApexOne as you go.</span></div>
      <div class="ft"><button class="btn y" type="button" style="min-height:48px" onclick="apxCapFinish(1)">✨ Fill with Ava</button><button class="btn" type="button" style="min-height:48px" onclick="apxCapFinish(0)">Save without Ava</button></div>`;
    document.body.appendChild(o); document.documentElement.style.overflow = 'hidden'; draw();
  };
  const open = () => !!(C && $('capov'));
  function close() { const o = $('capov'); if (o) o.remove(); document.documentElement.style.overflow = ''; C = null; }
  window.apxCapClose = async () => { clearTimeout(T); if (C && C.pages.length) await save(); close(); window.apxDeskReload && apxDeskReload(); };
  window.apxCapDiscard = async () => {
    if (C.pages.length && !confirm('Discard this capture and its pages? This cannot be undone.')) return;
    clearTimeout(T); const sb = sbc(), files = C.pages.filter(p => p.t === 'scan').map(p => p.p);
    if (files.length) await sb.storage.from(B).remove(files);
    if (C.id) await sb.from('desk_notes').delete().eq('id', C.id);
    close(); window.apxDeskReload && apxDeskReload();
  };
  window.apxCapTitle = v => { C.title = v; later(); };

  /* ---------- pages ---------- */
  function draw() {
    const el = $('cappages'); if (!el || !C) return;
    el.innerHTML = C.pages.map((p, i) => `<div class="pgc"><div class="ch"><b style="flex:1;font-size:13px">Page ${i + 1} · ${{ text: 'Text', scan: 'Scan', ink: 'Ink' }[p.t]}</b><button class="btn sm" type="button" onclick="apxCapDel(${i})" aria-label="Remove page">✕</button></div>
      ${p.t === 'text' ? `<textarea oninput="apxCapEdit(${i},this.value)" placeholder="Type or paste">${esc(p.x)}</textarea>` : p.t === 'scan' ? `<img data-cap="${esc(p.p)}" alt="Scanned page">` : window.apxInkSvg ? apxInkSvg(p.ink) : 'Ink'}</div>`).join('')
      || '<div class="empty"><span>No pages yet. Add copied text, a scan, ink or type below.</span></div>';
    const need = C.pages.filter(p => p.t === 'scan' && !URLS[p.p]).map(p => p.p);
    const fill = () => el.querySelectorAll('img[data-cap]').forEach(i => { if (URLS[i.dataset.cap]) i.src = URLS[i.dataset.cap]; });
    if (need.length) sbc().storage.from(B).createSignedUrls(need, 3600).then(({ data }) => { (data || []).forEach(d => { if (d.signedUrl) URLS[d.path] = d.signedUrl; }); fill(); }); else fill();
    const n = $('capn'); if (n) n.textContent = C.pages.length + 1;
  }
  const push = p => { C.pages.push(p); draw(); save(); const l = $('cappages'); if (l && l.lastElementChild) l.lastElementChild.scrollIntoView({ block: 'nearest' }); };
  window.apxCapEdit = (i, v) => { C.pages[i].x = v; later(); };
  window.apxCapDel = async i => { const p = C.pages[i]; if (!p) return;
    if ((p.t !== 'text' || (p.x || '').trim()) && !confirm('Remove page ' + (i + 1) + '?')) return;
    if (p.t === 'scan') sbc().storage.from(B).remove([p.p]); C.pages.splice(i, 1); draw(); save(); };
  window.apxCapType = () => { push({ t: 'text', x: '' }); const t = document.querySelectorAll('#cappages textarea'); if (t.length) t[t.length - 1].focus(); };
  window.apxCapScan = (done, t) => { if (t && !C.title) { C.title = t; $('captitle').value = t; } done.forEach(d => C.pages.push({ t: 'scan', p: d.p, w: d.w, h: d.h })); draw(); save(); };
  window.apxCapInk = (ink, t) => { if (t && !C.title) { C.title = t; $('captitle').value = t; } push({ t: 'ink', ink }); };
  window.apxCapPaste = async () => {
    $('capclip').hidden = true; let t = '';
    try { t = (await navigator.clipboard.readText() || '').trim(); } catch (e) { say('Clipboard blocked: tap ⌨ Type, then long-press the box and Paste.'); return; }
    if (!t) { say('Nothing copied yet. In Gallery tap T, then Copy all.'); return; }
    if (C.pages.some(p => p.t === 'text' && (p.x || '').trim() === t)) { say('That text is already a page. Copy the next page first.'); return; }
    push({ t: 'text', x: t });
  };
  /* back from Gallery: offer the copied text */
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && open()) { const b = $('capclip'); if (b) { $('capn').textContent = C.pages.length + 1; b.hidden = false; } } });

  /* ---------- save to ApexOne (draft) ---------- */
  function later() { clearTimeout(T); say('Saving…'); T = setTimeout(save, 800); }
  async function save() {
    clearTimeout(T); if (!C) return; const sb = sbc(); if (!sb) return;
    const row = { kind: 'note', status: 'draft', title: (C.title || '').trim() || 'Unfinished capture', pages: C.pages, updated_at: new Date().toISOString() };
    if (!C.id && !C.pages.length) return;
    say('Saving…');
    const r = C.id ? await sb.from('desk_notes').update(row).eq('id', C.id) : await sb.from('desk_notes').insert(row).select('id').single();
    if (r.error) { say('Not saved: ' + r.error.message); return; }
    if (!C.id) C.id = r.data.id; say('Saved in ApexOne ✓');
  }

  /* ---------- finish ---------- */
  window.apxCapFinish = async fill => {
    if (!C || !C.pages.length) { say('Add at least one page first.'); return; }
    const text = C.pages.filter(p => p.t === 'text' && (p.x || '').trim()).map(p => p.x.trim()).join('\n\n');
    if (fill && !text) { say('Ava reads text only (never photos). Add copied text or type first, or Save without Ava.'); return; }
    await save(); if (!C.id) return;
    const scans = C.pages.filter(p => p.t === 'scan').map(({ p, w, h }) => ({ p, w, h })), inks = C.pages.filter(p => p.t === 'ink');
    const id = C.id, t = (C.title || '').trim() || 'Note ' + stamp();
    const { error } = await sbc().from('desk_notes').update({ status: 'open', kind: 'note', title: t, body: text || null, scan: scans.length ? { pages: scans } : null,
      ink: inks.length ? inks[0].ink : null, pages: C.pages, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { say('Not saved: ' + error.message); return; }
    close(); if (window.apxDeskReload) await apxDeskReload();
    if (scans.length) window.toast && toast('Saved. You can now delete the photo' + (scans.length > 1 ? 's' : '') + ' from your Gallery.');
    if (fill && window.apxDeskFill) setTimeout(() => apxDeskFill(id), 100);
  };

  /* drafts older than 7 days: delete with their scans (runs when an admin opens My desk) */
  window.apxCapCleanup = async drafts => {
    const sb = sbc(), cut = Date.now() - 7 * 864e5, old = (drafts || []).filter(r => Date.parse(r.updated_at || r.created_at) < cut); if (!sb || !old.length) return;
    const files = old.flatMap(r => (r.pages || []).filter(p => p.t === 'scan').map(p => p.p));
    if (files.length) await sb.storage.from(B).remove(files);
    await sb.from('desk_notes').delete().in('id', old.map(r => r.id)).eq('status', 'draft');
  };
})();
