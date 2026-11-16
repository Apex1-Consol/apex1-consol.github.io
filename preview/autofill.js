/* Smart fill: when a form opens, blank fields are suggested from records that already exist
   (Accreditation, Clients, FAM Registry, earlier visits, registers). No AI and no guessing:
   a value is only suggested when the source is clear. Suggested fields are highlighted; the user
   checks them and can change them before saving. "Fill with Ava" buttons draft text boxes (AI). */
(() => {
  const D = () => ((window.__preview || {}).data) || {};
  const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); if (isNaN(d)) return ''; d.setDate(d.getDate() + n); return iso(d); };
  const addMonths = (s, n) => { const d = new Date(s + 'T12:00:00'); if (isNaN(d)) return ''; d.setMonth(d.getMonth() + n); return iso(d); };
  const progs = () => D().progsAll || D().progs || [];
  const prog = id => progs().find(p => String(p.id) === String(id));
  const pid = p => '#' + (p.display_id || p.id);
  const nk = s => String(s || '').replace(/^SP:\s*/i, '').trim();
  const accOf = saqa => { const k = nk(saqa); return k ? (D().accs || []).filter(a => nk(a.saqa_id) === k).sort((a, b) => String(b.accreditation_to || '').localeCompare(String(a.accreditation_to || '')))[0] : null; };

  /* ---------- shared helpers ---------- */
  const css = `<style id="afcss">.af{background:rgba(245,197,66,.18)!important;outline:1px dashed #d9a400}.afnote{font-size:12px;color:var(--muted,#666);margin:4px 0}.afnote b{color:#b88a00}
    .afbtn{border:1px solid var(--line,#ccc);background:none;color:inherit;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer;margin-top:4px;align-self:flex-start}.afbtn:disabled{opacity:.5}
    .afhint{display:block;font-size:11.5px;margin-top:2px}.afhint.warn{color:var(--bad,#c33)}.afhint.ok{color:var(--ok,#2a7)}</style>`;
  function note(form) { let n = form.querySelector('.afnote'); if (!n) { n = document.createElement('p'); n.className = 'afnote'; const h = form.querySelector('h2'); (h || form.firstChild) && (h ? h.after(n) : form.prepend(n)); n.hidden = true; } return n; }
  function sug(form, el, val, src) {
    if (!el || val == null || val === '') return false;
    if (String(el.value || '').trim() !== '' && !el.classList.contains('af')) return false;   // never overwrite what someone typed or saved
    if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(val))) return false;
    el.value = val; el.classList.add('af'); el.title = 'Suggested from ' + src + '. Check it before you save.';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const n = note(form); form.__af = form.__af || new Set(); form.__af.add(src); n.hidden = false;
    n.innerHTML = `<b>✦ Smart fill:</b> highlighted fields were filled from ${[...form.__af].map(e).join(', ')}. Check them before you save.`;
    return true;
  }
  const clearOnEdit = form => form.addEventListener('input', ev => { if (ev.isTrusted && ev.target.classList) ev.target.classList.remove('af'); });
  function hint(el, cls, html) { if (!el) return; const lab = el.closest('label') || el.parentNode; let h = lab.querySelector('.afhint'); if (!h) { h = document.createElement('span'); h.className = 'afhint'; lab.appendChild(h); } h.className = 'afhint ' + cls; h.innerHTML = html; }

  /* FAM full name from a first name, only when exactly one practitioner matches */
  function famFull(v) {
    const t = String(v || '').trim(); if (!t || /\s/.test(t) || /^(tbc|tba|n\/?a|none|online)$/i.test(t)) return '';
    const m = [...new Set((D().assessors || []).map(a => String(a.full_name || '').trim()).filter(n => n.split(/\s+/)[0].toLowerCase() === t.toLowerCase()))];
    return m.length === 1 ? m[0] : '';
  }
  function famField(form, el) {
    if (!el) return; const go = () => { const f = famFull(el.value); if (f) { el.classList.add('af'); const v = el.value; el.value = ''; if (!sug(form, el, f, 'the FAM Registry')) { el.value = v; el.classList.remove('af'); } } };
    el.addEventListener('change', go); go();
  }

  /* ---------- programme form ---------- */
  function programmeForm(form) {
    const E = form.elements;
    const accFill = () => {
      const raw = E.saqa.value; if (!nk(raw)) { hint(E.saqa, '', ''); return; }
      const a = accOf(raw);
      if (!a) { hint(E.saqa, 'warn', 'No accreditation record for this SAQA ID. QA to check.'); return; }
      const leg = /legacy/i.test(a.qual_type || ''), st = String(a.status || ''), to = a.accreditation_to ? String(a.accreditation_to).slice(0, 10) : '';
      hint(E.saqa, /granted/i.test(st) && (!to || to >= iso(new Date())) ? 'ok' : 'warn', e(`${a.title || ''} · ${st || 'status not set'}${to ? ' · to ' + to : ''}`));
      sug(form, E.qual, a.title, 'Accreditation');
      sug(form, E.nqf, a.nqf, 'Accreditation');
      sug(form, E.seta, nk(a.quality_partner), 'Accreditation');
      sug(form, E.type, leg ? 'legacy' : (a.qual_type ? 'occupational' : ''), 'Accreditation');
      if (/granted/i.test(st)) sug(form, E.accred, to, 'Accreditation');
    };
    E.saqa.addEventListener('change', accFill); E.saqa.addEventListener('blur', accFill);
    const clFill = () => { const c = (D().clients || []).find(x => String(x.id) === E.client.value); if (c) sug(form, E.pm, String(c.project_manager || '').includes('/') ? '' : c.project_manager, 'the client record'); };
    E.client.addEventListener('change', clFill);
    ['fac', 'ass', 'mod'].forEach(n => famField(form, E[n]));
    if (nk(E.saqa.value)) accFill();
  }

  /* ---------- withdraw learner ---------- */
  const REASONS = ['Resigned from employer', 'Found other employment', 'Medical reasons', 'Personal or family reasons', 'Relocated', 'Dismissed by employer', 'Stopped attending (no contact)', 'Programme no longer required by employer', 'Deceased'];
  function withdrawForm(form) {
    const el = form.elements.wr; if (!el || document.getElementById('afwr')) return;
    const used = (D().enrol || []).map(x => (x.fields || {})['Withdrawal Reason']).filter(Boolean);
    form.insertAdjacentHTML('beforeend', `<datalist id="afwr">${[...new Set([...used, ...REASONS])].map(r => `<option value="${e(r)}"></option>`).join('')}</datalist>`);
    el.setAttribute('list', 'afwr'); el.setAttribute('autocomplete', 'off');
  }

  /* ---------- monitoring visits ---------- */
  const lastVisit = progId => (D().visits || []).filter(v => String(v.programme_id) === String(progId)).sort((a, b) => String((b.fields || {})['Date of Visit'] || '').localeCompare(String((a.fields || {})['Date of Visit'] || '')))[0];
  function addVisitForm(form) {
    const E = form.elements, go = () => { const v = lastVisit(E.prog.value); if (v) sug(form, E.venue, (v.fields || {}).Venue, 'the last visit to this programme'); };
    E.prog.addEventListener('change', go); go();
  }
  function visitForm(form) {
    const E = form.elements; if (!E.date || !E.next) return;
    const go = () => { if (E.date.value) sug(form, E.next, addMonths(E.date.value, 3), 'the visit date + 3 months'); };
    E.date.addEventListener('change', go); go();
    if (E.notes) avaFillBtn(form, E.notes, 'Visit notes', () => visitFacts(E));
  }
  function visitFacts(E) {
    const p = prog(E.prog && E.prog.value), L = [];
    if (p) L.push(`Programme ${pid(p)}: ${p.programme_name || ''} | ${p.start_date || '?'} to ${p.end_date || '?'}`);
    const K = ['Programme implementation', 'Human resources', 'Assessment strategy', 'Progress on implementation', 'General responsiveness', 'E-learning'];
    K.forEach((k, i) => { const el = E['KMA' + (i + 1)]; if (el && el.value) L.push(`KMA${i + 1} ${k}: score ${el.value}`); });
    ['date', 'venue', 'overall', 'eisa', 'logbook', 'dropwhy'].forEach(n => { const el = E[n]; if (el && el.value) L.push(`${(el.closest('label') || {}).firstChild?.textContent || n}: ${el.value}`); });
    return L.join('\n');
  }

  /* ---------- recommendations ---------- */
  function recForm(form) {
    const E = form.elements; if (!E.Owner) return;
    const go = () => {
      const v = (D().visits || []).find(x => String(x.id) === String(E.Visit && E.Visit.value)), p = prog(E.programme_id && E.programme_id.value) || (v && prog(v.programme_id));
      if (p) sug(form, E.Owner, String(p.project_manager_name || '').trim().split(/\s+/)[0] || '', 'the programme PM');
      const vd = v && (v.fields || {})['Date of Visit'];
      const vdue = vd ? addDays(String(vd).slice(0, 10), 30) : '', ok = vdue && vdue >= iso(new Date());
      sug(form, E.Due, ok ? vdue : addDays(iso(new Date()), 30), ok ? 'the visit date + 30 days' : 'today + 30 days');
    };
    form.addEventListener('change', ev => { if ((ev.target.name === 'Visit' || ev.target.name === 'programme_id')) go(); });
    if (!E.Owner.value) go();
    if (E.Text) avaFillBtn(form, E.Text, 'Recommendation', () => {
      const v = (D().visits || []).find(x => String(x.id) === String(E.Visit && E.Visit.value)), p = prog(E.programme_id && E.programme_id.value) || (v && prog(v.programme_id)), f = (v && v.fields) || {}, L = [];
      if (p) L.push(`Programme ${pid(p)}: ${p.programme_name || ''}`);
      for (let i = 1; i <= 6; i++) if (f['KMA' + i]) L.push(`KMA${i} score ${f['KMA' + i]}`);
      if (f['Overall Judgment']) L.push(`Overall judgement: ${f['Overall Judgment']}`);
      if (f['Visit Notes']) L.push(`Visit notes: ${String(f['Visit Notes']).slice(0, 1200)}`);
      return L.join('\n') || 'No visit selected.';
    });
  }

  /* ---------- add register session ---------- */
  function sessionForm(box) {
    const A = window.dvApi, p = A && A.cur && prog(A.cur()); if (!p) return;
    const dt = box.querySelector('[data-k="session_date"]'), fac = box.querySelector('[data-k="facilitator"]'), today = iso(new Date());
    const regs = A.regDates ? A.regDates(p.id) : [], last = regs[regs.length - 1];
    let d = last ? addDays(last, 1) : (p.start_date || today);
    while (d && [0, 6].includes(new Date(d + 'T12:00:00').getDay())) d = addDays(d, 1);
    if (d && d <= today && (!p.start_date || d >= p.start_date) && (!p.end_date || d <= p.end_date) && !regs.includes(d)) sug(box, dt, d, last ? 'the next weekday after the last register' : 'the programme start date');
    const ff = (p.fields || {}).Facilitator || (p.fields || {}).facilitator; if (ff) sug(box, fac, famFull(ff) || ff, 'the programme');
  }

  /* ---------- Fill with Ava (AI, text boxes only) ---------- */
  function avaFillBtn(form, ta, label, facts) {
    if (!ta || ta.dataset.ava) return; ta.dataset.ava = 1;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'afbtn'; b.textContent = '✦ Fill with Ava';
    b.title = 'Ava drafts this from the saved data (no names or ID numbers are sent). Check and edit before saving.';
    b.onclick = async () => {
      if (!window.avaFillText) return; b.disabled = true; b.textContent = 'Ava is writing…';
      try { const t = await avaFillText(label, facts(), ta.value); if (t) { ta.value = t; ta.classList.add('af'); ta.dispatchEvent(new Event('input', { bubbles: true })); } b.textContent = '✦ Redo with Ava'; }
      catch (err) { b.textContent = '✦ Fill with Ava'; (window.toast || alert)('Ava: ' + err.message); }
      b.disabled = false;
    };
    (ta.closest('label') || ta.parentNode).appendChild(b);
  }

  /* ---------- wiring ---------- */
  const HOOK = { pform: programmeForm, ewform: withdrawForm, vaform: addVisitForm, vform: visitForm, recform: recForm };
  function scan() {
    if (!document.getElementById('afcss')) document.head.insertAdjacentHTML('beforeend', css);
    Object.entries(HOOK).forEach(([id, fn]) => { const f = document.getElementById(id); if (f && !f.__afHooked) { f.__afHooked = 1; clearOnEdit(f); try { fn(f); } catch (err) { console.warn('[smart fill]', id, err); } } });
    const s = document.getElementById('dvsess'); if (s && !s.__afHooked) { s.__afHooked = 1; clearOnEdit(s); try { sessionForm(s); } catch (err) { console.warn('[smart fill] session', err); } }
  }
  let t; new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 30); }).observe(document.documentElement, { childList: true, subtree: true });
  window.apxFamFull = famFull;
})();
