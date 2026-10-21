// Preview page tests (jsdom + a fake Supabase client). Run: node page.test.js
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  .replace(/<script src="https:\/\/cdn[^>]+><\/script>/, '').replace('<script src="live.js"></script>', '')
  .replace(/<link[^>]+fonts[^>]+>/g, '');
const live = fs.readFileSync(path.join(__dirname, '..', 'live.js'), 'utf8');

const DATA = {
  learners: [{ id: 1, first_name: 'Test', last_name: 'Learner01', id_number: '9001015009087' }, { id: 2, first_name: 'Test', last_name: 'Learner02', id_number: null }, { id: 3, first_name: 'Test', last_name: 'Learner01', id_number: '9001015009081' }],
  enrolments: [{ id: 10, learner_id: 1, programme_id: 100, status: 'active', created_at: '2026-06-05' }],
  programmes: [{ id: 100, programme_name: 'PM Cohort', client_id: 7, saqa_id: '101869', nqf_level: '5', status: 'active', start_date: '2026-06-05', end_date: '2028-05-05', facilitator_id: 1 }],
  clients: [{ id: 7, client_name: 'Client A', project_manager: 'PM 1' }],
  qcto_tracker: [{ id: 50, learner_id: 1, programme_id: 100, enrolment_id: 10, current_status: 'In Progress', monitoring_status: 'Delayed', sor_status: 'Issued', eisa_booking_status: 'Pending Booking' }],
  moderation_items: [{ id: 60, sheet: 'External moderation', qualification: '57608: NC: Wealth Management', stage: 'Documents requested', learners: 4 }, { id: 61, sheet: 'Exit verification', qualification: 'BA', stage: 'Awaiting verification report', learners: 15 }],
  accreditation_items: [{ id: 1, saqa_id: '118699', title: 'Cloud Administrator', status: 'Accreditation granted' }],
  legacy_qualifications: [{ saqa_id: '57608', quality_partner: 'INSETA', title: 'NC: Wealth Management', extended: true, extension: '24 Months' }],
  signoff_items: [{ id: 70, kind: 'Visit report', title: 'VIS draft', status: 'waiting', created_at: '2026-10-20' }],
  monitoring_visits: [{ id: 80, programme_id: 100, fields: { 'Visit Title': 'Impl visit', Scores: { KMA3: 2 } } }],
  recommendations: [{ id: 90, programme_id: 100, resolved: false, fields: { KMA: 'KMA3', Text: 'Fix strategy', Priority: 'High' } }],
  assessors: [{ id: 1, full_name: 'Fac One', role: 'Facilitator' }],
  v_fam_completeness: [{ assessor_id: 1, full_name: 'Fac One', document_count: 2, registration_count: 1, open_follow_ups: 0 }],
  v_learner_data_quality: [{ learner_id: 2, issue: 'missing_id', first_name: 'Test', last_name: 'Learner02', enrolment_count: 0 }, { learner_id: 1, issue: 'possible_duplicate', first_name: 'Test', last_name: 'Learner01', enrolment_count: 1 }, { learner_id: 3, issue: 'possible_duplicate', first_name: 'Test', last_name: 'Learner01', enrolment_count: 0 }],
  clickup_sync_outbox: [{ id: 1, status: 'queued' }, { id: 2, status: 'succeeded' }, { id: 3, status: 'quarantined', last_error: 'ClickUp API 400' }]
};

function fakeSupabase(log, opts) {
  let cb;
  const chain = (table) => {
    const st = { table, op: 'select' };
    const p = {
      select() { return p; }, order() { return p; }, limit() { return p; }, eq(k, v) { st.eq = [k, v]; return p; },
      update(v) { st.op = 'update'; st.val = v; return p; }, insert(v) { st.op = 'insert'; st.val = v; return p; },
      then(res) { if (st.op !== 'select') log.push({ table, op: st.op, val: st.val, eq: st.eq }); const fail = opts.fail && opts.fail === table && st.op !== 'select';
        return Promise.resolve(fail ? { data: null, error: { message: 'denied by RLS' } } : { data: st.op === 'select' ? JSON.parse(JSON.stringify(DATA[table] || [])) : [], error: null }).then(res); }
    };
    return p;
  };
  return {
    from: chain, schema: () => ({ rpc: async () => ({ data: [], error: null }), from: chain }),
    rpc: async (fn, args) => { log.push({ rpc: fn, args }); return opts.failRpc ? { data: null, error: { message: 'Only an admin can sign off' } } : { data: {}, error: null }; },
    auth: {
      onAuthStateChange(f) { cb = f; setTimeout(() => f('INITIAL_SESSION', opts.session), 0); },
      async signInWithPassword() { return { error: { message: 'Invalid login credentials' } }; },
      async signOut() { log.push({ signOut: true }); cb('SIGNED_OUT', null); }
    }
  };
}

async function boot(session, opts = {}) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://preview.test/#dashboard', pretendToBeVisual: true });
  const w = dom.window, log = [];
  w.matchMedia = () => ({ matches: false }); w.scrollTo = () => {};
  w.supabase = { createClient: () => fakeSupabase(log, { session, ...opts }) };
  if (opts.cfg) w.PREVIEW_CFG = opts.cfg;
  const s = w.document.createElement('script'); s.textContent = live;
  let err = null; w.addEventListener('error', e => { err = e.error; });
  w.document.body.appendChild(s);
  await new Promise(r => setTimeout(r, 30));
  return { w, d: w.document, log, err };
}
const sess = (role, tenant = 'apex-preview') => ({ user: { email: 'x@apexu.co.za', app_metadata: { role, tenant } } });
const tick = () => new Promise(r => setTimeout(r, 20));
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } }
const ok = (c, m) => { if (!c) throw Error(m); };

(async () => {
  await t('signed out: login shows, app hidden, deep links bounce to login', async () => {
    const { w, d } = await boot(null);
    ok(!d.getElementById('view-login').hidden && d.getElementById('shell').hidden, 'login not shown');
    w.location.hash = 'qcto'; await tick(); ok(w.location.hash === '#login', 'deep link not blocked: ' + w.location.hash);
  });
  await t('bad password shows an error and stays on login', async () => {
    const { d, w } = await boot(null);
    const f = d.querySelector('#view-login form'); f.querySelectorAll('input')[0].value = 'a@b.c';
    f.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    ok(/Invalid login/.test(f.textContent), 'no error shown');
  });
  await t('preview refuses to run against the live project', async () => {
    const { err } = await boot(null, { cfg: { url: 'https://nducwhlmudksgxggjrbo.supabase.co', key: 'x', liveRef: 'nducwhlmudksgxggjrbo' } });
    ok(err && /never point at the live project/.test(err.message), 'no guard');
  });
  await t('account without preview tenant is signed out', async () => {
    const { log } = await boot(sess('admin', null)); await tick(); ok(log.some(x => x.signOut), 'not signed out');
  });
  await t('admin: dashboard loads real counts, banner present', async () => {
    const { d } = await boot(sess(['admin']));
    ok(d.getElementById('pvbanner'), 'no banner');
    ok(/Learners3/.test(d.getElementById('kpis').textContent.replace(/\s/g, '')), 'learner KPI wrong: ' + d.getElementById('kpis').textContent);
    ok(/2 learners unlinked/.test(d.getElementById('kpis').textContent), 'unlinked count wrong');
    ok(/Quarantined/.test(d.getElementById('syncbox').textContent), 'sync box missing');
  });
  await t('QCTO tracker: status change writes the right column', async () => {
    const { w, d, log } = await boot(sess('admin')); w.location.hash = 'qcto'; await tick();
    ok(d.querySelectorAll('#qtable tbody tr').length === 1, 'tracker rows');
    await w.qSet(0, 'book', 'Booked'); await tick();
    const u = log.find(x => x.table === 'qcto_tracker'); ok(u && u.val.eisa_booking_status === 'Booked' && u.eq[1] === 50, JSON.stringify(u));
  });
  await t('QCTO tracker: failed save reverts the cell and says so', async () => {
    const { w } = await boot(sess('admin'), { fail: 'qcto_tracker' });
    await w.qSet(0, 'cur', 'Completed'); await tick();
    ok(w.eval('QT[0].cur') === 'In Progress', 'not reverted');
    ok(/failed/.test(w.document.getElementById('toast').textContent), 'no error toast');
  });
  await t('Moderation: stage change writes stage name + date', async () => {
    const { w, log } = await boot(sess('qa_specialist'));
    await w.mSet('MOD', 0, '7'); await tick();
    const u = log.find(x => x.table === 'moderation_items'); ok(u && u.val.stage === 'SoRs received' && u.eq[1] === 60, JSON.stringify(u));
  });
  await t('Data quality: "Same person" sends a merge request, never merges', async () => {
    const { w, log } = await boot(sess('admin')); w.location.hash = 'dq'; await tick();
    const gi = w.eval("DQG.findIndex(g=>g.issue==='possible_duplicate')"); await w.previewDQ(gi, 'merge'); await tick();
    const r = log.find(x => x.rpc === 'request_learner_merge'); ok(r && r.args.p_learner_ids.join() === '1,3', JSON.stringify(r));
    ok(!log.some(x => x.op === 'delete' || (x.table === 'learners' && x.op !== 'select')), 'touched learners directly');
  });
  await t('Data quality: hidden from non-admins', async () => {
    const { w, d } = await boot(sess('project_manager')); w.location.hash = 'dq'; await tick();
    ok(/Admins only/.test(d.getElementById('dqlist').textContent), 'PM can see DQ');
  });
  await t('Sign-off: admin approve calls signoff_decide', async () => {
    const { w, log } = await boot(sess('admin')); await w.soAct(0, 'approved'); await tick();
    const r = log.find(x => x.rpc === 'signoff_decide'); ok(r && r.args.p_id === 70 && r.args.p_decision === 'approved', JSON.stringify(r));
  });
  await t('Sign-off: non-admin cannot decide (no call made)', async () => {
    const { w, log } = await boot(sess('project_manager')); await w.soAct(0, 'approved'); await tick();
    ok(!log.some(x => x.rpc === 'signoff_decide'), 'PM decided');
  });
  await t('Visit: KMA score click saves scores to the visit', async () => {
    const { w, d, log } = await boot(sess('admin')); w.location.hash = 'visit'; await tick();
    d.querySelectorAll('#kmas .score')[3].click(); await tick();
    const u = log.find(x => x.table === 'monitoring_visits'); ok(u && u.val.fields.Scores.KMA1 === 4 && u.eq[1] === 80, JSON.stringify(u && u.val));
  });
  await t('Recommendation: Mark resolved writes resolved=true', async () => {
    const { w, d, log } = await boot(sess('admin')); w.location.hash = 'recs'; await tick();
    const b = [...d.querySelectorAll('#reclist button')].find(x => /Mark resolved/.test(x.textContent)); b.click(); await tick();
    const u = log.find(x => x.table === 'recommendations'); ok(u && u.val.resolved === true && u.eq[1] === 90, JSON.stringify(u));
  });
  await t('Sync panel hidden for roles that cannot read the outbox', async () => {
    const { d } = await boot(sess('qa_specialist')); ok(d.getElementById('syncbox').hidden, 'QA sees outbox');
  });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
