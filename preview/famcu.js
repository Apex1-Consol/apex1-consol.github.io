/* FAM on ClickUp (preview). Off unless the URL has ?cu=1 (remembered per browser; ?cu=0 turns it off).
   Wraps the Supabase client so fam.js keeps calling sb.from(...) while FAM tables go to ClickUp
   through the fam-relay edge function. Supabase stays for sign-in, qualifications, programmes,
   renewals, audit log, document files and fam_private (rates, ID numbers: writers only). */
(function () {
  try { const m = location.search.match(/[?&]cu=([01])/); if (m) localStorage.setItem('famCU', m[1]); } catch (_) {}
  let on = false; try { on = localStorage.getItem('famCU') === '1'; } catch (_) {}
  if (!on) return;
  const RELAY = 'fam-relay';
  const CU = new Set(['assessors', 'fam_seta_registrations', 'fam_registration_scope', 'fam_documents', 'fam_follow_ups', 'fam_quality']);
  const cache = {};
  window.famCUOn = true;

  window.famCU = function (sb) {
    const call = async body => {
      const { data, error } = await sb.functions.invoke(RELAY, { body });
      if (error) { let m = error.message; try { const j = await error.context.json(); m = j.message || j.reason || m; } catch (_) {} return { error: { message: m } }; }
      if (!data || !data.ok) return { error: { message: data?.message || data?.reason || 'ClickUp relay error' } };
      return { data: data.rows };
    };
    const ids = async t => { const r = await call({ action: 'list', table: t }); if (!r.error) cache[t] = r.data; return r; };
    // ID numbers live in fam_private (Supabase, writers only), never in ClickUp.
    const splitId = async (rows) => {
      for (const r of rows) if (r && 'id_number' in r && r.id != null) {
        await sb.from('fam_private').upsert({ assessor_id: r.id, id_number: r.id_number || null }, { onConflict: 'assessor_id' });
      }
    };

    function q(t) {
      const st = { op: 'select', f: [], ord: null, lim: null, one: false, vals: null, conflict: null };
      const match = r => st.f.every(([k, op, v]) => op === 'eq' ? String(r[k]) === String(v) : op === 'in' ? v.map(String).includes(String(r[k])) : op === 'gte' ? String(r[k] ?? '') >= String(v) : true);
      const b = {
        select() { if (st.op === 'select') st.op = 'select'; else st.ret = true; return b; },
        eq(k, v) { st.f.push([k, 'eq', v]); return b; }, in(k, v) { st.f.push([k, 'in', v]); return b; },
        gte(k, v) { st.f.push([k, 'gte', v]); return b; },
        order(k, o) { st.ord = [k, !o || o.ascending !== false]; return b; }, limit(n) { st.lim = n; return b; },
        single() { st.one = true; return b; },
        insert(v) { st.op = 'insert'; st.vals = [].concat(v); return b; },
        update(v) { st.op = 'update'; st.vals = v; return b; },
        upsert(v, o) { st.op = 'upsert'; st.vals = [].concat(v); st.conflict = (o?.onConflict || 'id').split(','); return b; },
        then(res, rej) { return run().then(res, rej); }
      };
      async function run() {
        let out;
        if (st.op === 'select') {
          const r = await ids(t); if (r.error) return { data: null, error: r.error };
          out = r.data.filter(match);
          if (t === 'assessors') {
            const { data: pv } = await sb.from('fam_private').select('assessor_id,id_number');
            const m = Object.fromEntries((pv || []).map(x => [x.assessor_id, x.id_number]));
            out = out.map(a => ({ ...a, id_number: m[a.id] ?? null }));
          }
          if (st.ord) { const [k, asc] = st.ord; out.sort((a, b) => (String(a[k] ?? '') > String(b[k] ?? '') ? 1 : -1) * (asc ? 1 : -1)); }
          if (st.lim) out = out.slice(0, st.lim);
        } else if (st.op === 'insert') {
          const r = await call({ action: 'insert', table: t, rows: st.vals.map(({ id_number, ...x }) => x) });
          if (r.error) return { data: null, error: r.error };
          if (t === 'assessors') await splitId(r.data.map((x, i) => ({ id: x.id, id_number: st.vals[i].id_number })).filter((x, i) => 'id_number' in st.vals[i]));
          out = r.data;
        } else if (st.op === 'update') {
          if (!cache[t]) { const r = await ids(t); if (r.error) return { data: null, error: r.error }; }
          const hit = cache[t].filter(match);
          const { id_number, ...patch } = st.vals;
          if (t === 'assessors' && 'id_number' in st.vals) await splitId(hit.map(h => ({ id: h.id, id_number })));
          if (!hit.length || !Object.keys(patch).length) return { data: [], error: null };
          const r = await call({ action: 'update', table: t, rows: hit.map(h => ({ ...patch, _t: h._t })) });
          if (r.error) return { data: null, error: r.error };
          out = r.data;
        } else if (st.op === 'upsert') {
          const r0 = await ids(t); if (r0.error) return { data: null, error: r0.error };
          const ins = [], upd = [];
          for (const v of st.vals) {
            const h = cache[t].find(x => st.conflict.every(k => String(x[k.trim()]) === String(v[k.trim()])));
            if (h) upd.push({ ...v, _t: h._t }); else ins.push(v);
          }
          const a = ins.length ? await call({ action: 'insert', table: t, rows: ins }) : { data: [] };
          if (a.error) return { data: null, error: a.error };
          const u = upd.length ? await call({ action: 'update', table: t, rows: upd }) : { data: [] };
          if (u.error) return { data: null, error: u.error };
          out = [...a.data, ...u.data];
        }
        if (st.op !== 'select' && cache[t]) { for (const r of out) { const i = cache[t].findIndex(x => x._t === r._t); if (i >= 0) cache[t][i] = r; else cache[t].push(r); } }
        return { data: st.one ? (out[0] || null) : out, error: null };
      }
      return b;
    }

    // SETA registration renewal approval (was the fam_approve_renewal RPC, which writes Supabase tables).
    async function approve(id) {
      const { data: n, error } = await sb.from('fam_renewals').select('*').eq('id', id).single();
      if (error || !n) return { data: null, error: error || { message: 'Renewal not found' } };
      if (n.status !== 'Uploaded') return { data: null, error: { message: 'This renewal is ' + String(n.status).toLowerCase() + ', not waiting for review' } };
      if (n.registration_id != null) {
        const r = await ids('fam_seta_registrations'); if (r.error) return r;
        const g = r.data.find(x => String(x.id) === String(n.registration_id));
        if (g && n.proposed_expiry && g.registration_expiry_date && n.proposed_expiry <= g.registration_expiry_date)
          return { data: null, error: { message: 'The new expiry is not later than the current one' } };
        const u = await q('fam_seta_registrations').update({ status: 'Active', ...(n.proposed_expiry ? { registration_expiry_date: n.proposed_expiry } : {}), ...(n.proposed_reg_no ? { registration_number: n.proposed_reg_no } : {}) }).eq('id', n.registration_id);
        if (u.error) return u;
      }
      return sb.from('fam_renewals').update({ status: 'Approved', reviewed_by: window.__preview?.user?.email || null, reviewed_at: new Date().toISOString() }).eq('id', id);
    }

    return new Proxy(sb, {
      get(o, k) {
        if (k === 'from') return t => CU.has(t) ? q(t) : o.from(t);
        if (k === 'rpc') return (fn, args) => fn === 'fam_approve_renewal' ? approve(args.p_id) : o.rpc(fn, args);
        const v = o[k]; return typeof v === 'function' ? v.bind(o) : v;
      }
    });
  };

  // Admin-only one-time copy of this tenant's preview rows into ClickUp. Run in the console: famCUImport()
  window.famCUImport = async function () {
    const sb = window.__sb, log = [];
    for (const t of CU) {
      let off = 0;
      while (off != null) {
        const { data, error } = await sb.functions.invoke(RELAY, { body: { action: 'import', table: t, offset: off } });
        if (error || !data?.ok) { log.push(t + ': failed at ' + off + ' ' + (data?.message || data?.reason || error?.message)); break; }
        log.push(t + ' @' + off + ': +' + data.made); off = data.next;
      }
    }
    return log;
  };
})();
