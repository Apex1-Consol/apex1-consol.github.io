// Generic pager: any long list/table body gets pages of 20 instead of endless scrolling.
(function () {
  const SIZE = 20, SEL = '#mwtasks, #mwprogs, section.tdy, tbody, .list';
  const ROW = el => el.tagName === 'SECTION' ? [...el.children].filter(c => c.classList.contains('tdyr')) : [...el.children].filter(c => !c.classList.contains('pgbar'));
  document.head.insertAdjacentHTML('beforeend', `<style>.pgh{display:none!important}.pgbar{display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:8px 4px;font-size:12px;color:var(--muted)}.pgbar button{border:1px solid var(--line);background:none;border-radius:6px;padding:3px 10px;cursor:pointer;font:inherit;color:inherit}.pgbar button:disabled{opacity:.4;cursor:default}@media print{.pgh{display:revert!important}.pgbar{display:none}}</style>`);
  let busy = false;
  function apply(el) {
    const rows = ROW(el).filter(r => r.classList.contains('pgh') || r.style.display !== 'none');
    const host = el.tagName === 'TBODY' ? el.closest('table') : el;
    let bar = host && host.nextElementSibling && host.nextElementSibling.classList.contains('pgbar') ? host.nextElementSibling : null;
    if (rows.length <= SIZE) { rows.forEach(r => r.classList.remove('pgh')); if (bar) bar.remove(); return; }
    const pages = Math.ceil(rows.length / SIZE); el._pg = Math.min(Math.max(1, el._pg || 1), pages);
    rows.forEach((r, i) => r.classList.toggle('pgh', Math.floor(i / SIZE) + 1 !== el._pg));
    if (!bar) { bar = document.createElement('div'); bar.className = 'pgbar'; host.after(bar); }
    const a = (el._pg - 1) * SIZE + 1, b = Math.min(el._pg * SIZE, rows.length);
    bar.innerHTML = `<span>${a}–${b} of ${rows.length}</span><button type="button" data-d="-1"${el._pg === 1 ? ' disabled' : ''}>‹ Prev</button><span>Page ${el._pg} of ${pages}</span><button type="button" data-d="1"${el._pg === pages ? ' disabled' : ''}>Next ›</button>`;
    bar.onclick = e => { const d = +(e.target.dataset && e.target.dataset.d); if (!d) return; el._pg += d; run(); host.scrollIntoView({ block: 'nearest' }); };
  }
  function run() { busy = true; document.querySelectorAll(SEL).forEach(el => { if (el.tagName !== 'SECTION' || el.classList.contains('tdy')) apply(el); }); document.querySelectorAll('.pgbar').forEach(b => { const p = b.previousElementSibling; if (!p || !(p.matches(SEL) || p.querySelector(':scope > tbody'))) b.remove(); }); setTimeout(() => { busy = false; }); }
  let t; const mo = new MutationObserver(() => { if (busy) return; clearTimeout(t); t = setTimeout(run, 60); });
  const go = () => { mo.observe(document.body, { childList: true, subtree: true }); run(); };
  document.body ? go() : document.addEventListener('DOMContentLoaded', go);
  window.apxPager = run;
  // Card/pick lists (Programmes side list, Clients cards): 25 per page, bar inside the list, group headers follow their items.
  window.apxPgIn = function (el, key, size) {
    if (!el) return; size = size || 25;
    const picks = [...el.children].filter(c => c.classList.contains('pick') && !c.hidden);
    const pages = Math.max(1, Math.ceil(picks.length / size));
    if (el._pk !== key || !el._pg) { el._pk = key; const on = picks.findIndex(c => c.classList.contains('on')); el._pg = on >= 0 && key === el._pk0 ? Math.floor(on / size) + 1 : (el._pk0 === undefined && on >= 0 ? Math.floor(on / size) + 1 : 1); el._pk0 = key; }
    el._pg = Math.min(Math.max(1, el._pg), pages);
    picks.forEach((c, i) => c.classList.toggle('pgh', Math.floor(i / size) + 1 !== el._pg));
    let gh = null, any = false; const close = () => { if (gh) gh.classList.toggle('pgh', !any); };
    [...el.children].forEach(c => { if (c.classList.contains('pickgh')) { close(); gh = c; any = false; } else if (c.classList.contains('pick') && !c.hidden && !c.classList.contains('pgh')) any = true; }); close();
    let bar = el.querySelector(':scope > .pgbar'); if (bar) bar.remove();
    if (picks.length <= size) return;
    bar = document.createElement('div'); bar.className = 'pgbar'; bar.style.gridColumn = '1/-1';
    const a = (el._pg - 1) * size + 1, b = Math.min(el._pg * size, picks.length);
    bar.innerHTML = `<span>${a}–${b} of ${picks.length}</span><button type="button" data-d="-1"${el._pg === 1 ? ' disabled' : ''}>‹ Prev</button><span>Page ${el._pg} of ${pages}</span><button type="button" data-d="1"${el._pg === pages ? ' disabled' : ''}>Next ›</button>`;
    bar.onclick = e => { const d = +(e.target.dataset && e.target.dataset.d); if (!d) return; el._pg += d; window.apxPgIn(el, key, size); el.scrollIntoView({ block: 'nearest' }); };
    el.appendChild(bar);
  };
})();
