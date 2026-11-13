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
})();
