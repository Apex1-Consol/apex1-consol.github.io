/* Hand-over documents uploaded in Programme Initiation (table public.programme_documents, private bucket 'programme-documents').
   Shown on the programme page and the sign-off page; the PM gets a "Review hand-over documents" task on My work
   (window.apxDocTasks, read by shell.js) until they mark them reviewed. */
(function () {
  const sb = window.__sb, P = window.__preview;
  if (!sb || !P) return;
  const esc = window.esc || (s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const $ = id => document.getElementById(id);
  const say = m => { if (window.toast) window.toast(m); };
  const me = () => ((P.user && P.user.email) || '').toLowerCase();
  const progs = () => (P.data && P.data.progs) || [];
  // PI document checklist (programme-initiation.html, Documents stage)
  const DOCS = [['idsReceived', 'Certified identity documents'], ['qualificationsReceived', 'Certified highest qualifications'], ['cvsReceived', 'CVs'],
    ['disabilityLettersReceived', 'Disability letters'], ['backgroundCheck', 'Background check'], ['approvedScheduleReceived', 'Approved implementation schedule'],
    ['learnerListReceived', 'Learner list'], ['learnerAgreementReceived', 'Learner agreements'], ['mieChecksCompleted', 'MIE checks'], ['otherDocs', 'Other supporting documents']];
  const LAB = Object.fromEntries(DOCS);
  let ROWS = [];
  window.apxProgDocCount = (pid, type) => ROWS.filter(r => r.programme_id === pid && r.doc_type === type).length;

  async function load() {
    if (!P.user) return;
    const { data, error } = await sb.from('programme_documents').select('id,programme_id,doc_type,doc_label,file_path,file_name,file_size,created_at,reviewed_at,reviewed_by').not('programme_id', 'is', null).order('id').limit(5000);
    if (error) { console.warn('programme_documents', error.message); return; }
    ROWS = data || [];
    if (window.previewShell) try { window.previewShell(); } catch (e) {}
  }

  window.apxDocTasks = () => {
    const mine = progs().filter(p => (p.handed_over_to_email || '').toLowerCase() === me() && me());
    return mine.map(p => ({ p, n: ROWS.filter(r => r.programme_id === p.id && !r.reviewed_at).length })).filter(x => x.n)
      .map(({ p, n }) => ({ id: 'hd' + p.id, t: 'Review hand-over documents', s: `#${p.id} ${p.programme_name || ''} · ${n} file${n > 1 ? 's' : ''}`,
        k: 'Hand-over', c: 'Open', on: `dvApi.setProg(${p.id});location.hash='programmes';setTimeout(()=>window.dvProg&&dvProg(${p.id}),50)` }));
  };

  window.apxDocOpen = async path => {
    const { data, error } = await sb.storage.from('programme-documents').createSignedUrl(path, 120);
    if (error) return say('Cannot open: ' + error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  window.apxDocsReviewed = async pid => {
    const { error } = await sb.rpc('programme_docs_reviewed', { p_programme_id: pid });
    if (error) return say('Not saved: ' + error.message);
    say('Hand-over documents marked reviewed'); await load(); window.apxProgDocs(pid, 'pdocs');
  };

  // Renders the documents card for a programme into element `elId` (created after #psuit on the programme page if missing).
  window.apxProgDocs = async (pid, elId) => {
    pid = Number(pid);
    let el = $(elId);
    if (!el && elId === 'pdocs') { const su = $('psuit'); if (!su) return; su.insertAdjacentHTML('afterend', '<section class="card" id="pdocs" style="margin-top:16px"></section>'); el = $('pdocs'); }
    if (!el) return;
    const p = progs().find(x => x.id === pid) || {};
    const { data, error } = await sb.from('programme_documents').select('doc_type,doc_label,file_path,file_name,file_size,created_at,reviewed_at,reviewed_by').eq('programme_id', pid).order('id');
    const rows = error ? [] : (data || []), f = p.fields || {};
    // The old PI checklist is replaced by the verified gates once a programme has a sign-off record.
    const ho = await sb.from('handoff_signoffs').select('status').eq('programme_id', pid).maybeSingle();
    const out = ho.data ? [] : DOCS.filter(([k]) => k !== 'otherDocs' && f[k] === 'No');
    if (!rows.length && !out.length && !p.intake_source_id) { el.hidden = true; return; }
    el.hidden = false;
    const groups = {}; rows.forEach(r => (groups[r.doc_type] = groups[r.doc_type] || []).push(r));
    const kb = n => n ? (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '';
    const unrev = rows.filter(r => !r.reviewed_at).length, isPM = (p.handed_over_to_email || '').toLowerCase() === me();
    const rev = rows.find(r => r.reviewed_at);
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <h3 style="margin:0;font-size:15px">Hand-over documents <span class="sub">(${rows.length} file${rows.length === 1 ? '' : 's'})</span></h3>
        ${unrev && isPM ? `<button class="btn sm y" onclick="apxDocsReviewed(${pid})">Mark reviewed</button>` : (rows.length && !unrev && rev ? `<span class="sub">Reviewed by ${esc(rev.reviewed_by || '')} ${esc(String(rev.reviewed_at).slice(0, 10))}</span>` : '')}
      </div>
      ${error ? `<p class="sub">Documents could not be loaded: ${esc(error.message)}</p>` : ''}
      ${Object.keys(groups).length ? `<div style="display:grid;gap:8px;margin-top:10px">${Object.entries(groups).map(([k, list]) => `<div>
          <div class="sub" style="font-weight:600">${esc(LAB[k] || list[0].doc_label || k)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${list.map(r => `<button class="btn sm" onclick="apxDocOpen('${esc(r.file_path).replace(/'/g, '&#39;')}')" title="${esc(kb(r.file_size))}">${esc(r.file_name)}</button>`).join('')}</div></div>`).join('')}</div>`
        : '<p class="sub" style="margin:8px 0 0">No documents were uploaded in Programme Initiation.</p>'}
      ${out.length ? `<div style="margin-top:12px"><div class="sub" style="font-weight:600;color:var(--warn)">Still outstanding at hand-over</div><ul style="margin:4px 0 0 18px;padding:0">${out.map(([k, l]) =>
        `<li>${esc(l)}${f[k + 'Due'] ? ` · expected ${esc(f[k + 'Due'])}` : ''}${f[k + 'Note'] ? ` · ${esc(f[k + 'Note'])}` : ''}</li>`).join('')}</ul></div>` : ''}`;
  };

  const t = setInterval(() => { if (P.user) { clearInterval(t); load(); } }, 1500);
})();
