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

  const SEC = { c: 'Programme and client', q: 'Qualification and accreditation', w: 'Workplace readiness', l: 'Learner and agreement readiness',
    d: 'Delivery readiness', s: 'Statutory submissions and deadlines', h: 'Handover preparation' };
  // One zip of every hand-over file, named after the programme; files are prefixed with their gate.
  window.apxDocsZip = async pid => {
    const btn = $('pdzip-' + pid); if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    try {
      if (!window.JSZip) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('zip library did not load')); document.head.appendChild(sc); });
      const { data: rows, error } = await sb.from('programme_documents').select('doc_type,file_path,file_name').eq('programme_id', pid).order('id');
      if (error) throw error;
      const { data: urls, error: e2 } = await sb.storage.from('programme-documents').createSignedUrls(rows.map(r => r.file_path), 300);
      if (e2) throw e2;
      const zip = new JSZip(), used = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i], u = urls[i] && urls[i].signedUrl; if (!u) continue;
        const pre = /^gate_/.test(r.doc_type) ? r.doc_type.slice(5).toUpperCase() + ' - ' : '';
        let nm = (pre + r.file_name).replace(/[\\/:*?"<>|]+/g, '_'); used[nm] = (used[nm] || 0) + 1; if (used[nm] > 1) nm = nm.replace(/(\.[^.]*)?$/, ` (${used[nm]})$1`);
        zip.file(nm, await (await fetch(u)).blob());
      }
      const p = progs().find(x => x.id === Number(pid)) || {};
      const base = ('HO-' + String(pid).padStart(6, '0') + ' ' + (p.programme_name || 'hand-over documents')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
      const blob = await zip.generateAsync({ type: 'blob' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = base + '.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { say('Download failed: ' + e.message); }
    if (btn) { btn.disabled = false; btn.textContent = 'Download all'; }
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
    const kb = n => n ? (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '';
    const unrev = rows.filter(r => !r.reviewed_at).length, isPM = (p.handed_over_to_email || '').toLowerCase() === me();
    const rev = rows.find(r => r.reviewed_at);
    // Gate state from the sign-off page when it is open for this programme (✓ verified / N/A).
    const hg = window.HO && HO._s && String(HO._s.pid) === String(pid) && HO._s.g, gst = {};
    ((hg && hg.gates) || []).forEach(x => { gst[x.id] = x.state; });
    const rowsBy = {};
    rows.forEach(r => {
      const gate = /^gate_/.test(r.doc_type) ? r.doc_type.slice(5) : null, sec = gate ? (SEC[gate[0]] || 'Other') : 'Programme Initiation uploads';
      (rowsBy[sec] = rowsBy[sec] || []).push({ r, gate });
    });
    const order = [...Object.values(SEC), 'Other', 'Programme Initiation uploads'].filter(k => rowsBy[k]);
    const line = ({ r, gate }) => {
      const title = gate ? String(r.doc_label || '').replace(/^\s*\w+\s*[·\-]\s*/, '') : (LAB[r.doc_type] || r.doc_label || r.doc_type);
      const st = gate && gst[gate], ok = st === 'verified' || st === 'na_confirmed';
      return `<div class="pdl">
        <span class="c">${gate ? esc(gate.toUpperCase()) : '·'}</span>
        <span class="t" title="${esc(title)}">${esc(title)}</span>
        <span class="f" title="${esc(r.file_name)} · ${esc(kb(r.file_size))}">&#128196; ${esc(r.file_name)} · ${esc(kb(r.file_size))}</span>
        <span class="s">${ok ? '<span class="pdok">&#10003; verified</span>' : ''}</span>
        <a href="javascript:void 0" class="o" onclick="apxDocOpen('${esc(r.file_path).replace(/'/g, '&#39;')}')">Open</a></div>`;
    };
    el.innerHTML = `<style>
        .pdsecs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:14px 28px;margin-top:12px}
        .pdsec h4{margin:0 0 4px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
        .pdl{display:grid;grid-template-columns:30px minmax(0,1.2fr) minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line2,#eee);font-size:13px}
        .pdl .c{font-family:var(--font-mono,monospace);font-size:12px;font-weight:700}
        .pdl .t,.pdl .f{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pdl .f{font-size:12px;color:var(--muted)} .pdl .o{font-weight:600}
        .pdok{font-size:11.5px;color:var(--ok,#1a7f52);white-space:nowrap}
        @media (max-width:600px){.pdl{grid-template-columns:30px minmax(0,1fr) auto}.pdl .f,.pdl .s{display:none}}
      </style>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <h3 style="margin:0;font-size:15px">Hand-over documents <span class="sub">(${rows.length} file${rows.length === 1 ? '' : 's'})</span></h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${rows.length ? `<button class="btn sm" id="pdzip-${pid}" onclick="apxDocsZip(${pid})">Download all</button>` : ''}
          ${unrev && isPM ? `<button class="btn sm y" onclick="apxDocsReviewed(${pid})">Mark reviewed</button>` : (rows.length && !unrev && rev ? `<span class="sub">Reviewed by ${esc(rev.reviewed_by || '')} ${esc(String(rev.reviewed_at).slice(0, 10))}</span>` : '')}
        </div>
      </div>
      ${error ? `<p class="sub">Documents could not be loaded: ${esc(error.message)}</p>` : ''}
      ${rows.length ? `<div class="pdsecs">${order.map(k => `<div class="pdsec"><h4>${esc(k)} <span style="font-weight:400">· ${rowsBy[k].length}</span></h4>${rowsBy[k].map(line).join('')}</div>`).join('')}</div>`
        : '<p class="sub" style="margin:8px 0 0">No documents were uploaded.</p>'}
      ${out.length ? `<div style="margin-top:12px"><div class="sub" style="font-weight:600;color:var(--warn)">Still outstanding at hand-over</div><ul style="margin:4px 0 0 18px;padding:0">${out.map(([k, l]) =>
        `<li>${esc(l)}${f[k + 'Due'] ? ` · expected ${esc(f[k + 'Due'])}` : ''}${f[k + 'Note'] ? ` · ${esc(f[k + 'Note'])}` : ''}</li>`).join('')}</ul></div>` : ''}`;
  };

  const t = setInterval(() => { if (P.user) { clearInterval(t); load(); } }, 1500);
})();
