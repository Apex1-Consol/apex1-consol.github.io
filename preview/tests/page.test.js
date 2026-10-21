// Preview page tests (jsdom + a fake Supabase client). Run: node page.test.js
const { JSDOM } = require('jsdom');
const XLSX = require('xlsx');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  .replace(/<script src="https:\/\/cdn[^>]+><\/script>/g, '').replace('<script src="qa.js"></script>', '').replace('<script src="live.js"></script>', '').replace('<script src="delivery.js"></script>', '')
  .replace(/<link[^>]+fonts[^>]+>/g, '');
const live = fs.readFileSync(path.join(__dirname, '..', 'live.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'qa.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'delivery.js'), 'utf8');

const DATA = {
  learners: [{ id: 1, first_name: 'Test', last_name: 'Learner01', id_number: '9001015009087' }, { id: 2, first_name: 'Test', last_name: 'Learner02', id_number: null }, { id: 3, first_name: 'Test', last_name: 'Learner01', id_number: '9001015009081' }],
  enrolments: [{ id: 10, learner_id: 1, programme_id: 100, status: 'active', created_at: '2026-06-05' }],
  programmes: [{ id: 100, provider: 'apex', programme_name: 'PM Cohort', client_id: 7, saqa_id: '101869', nqf_level: '5', status: 'active', start_date: '2026-06-05', end_date: '2028-05-05', facilitator_id: 1 }],
  clients: [{ id: 7, client_name: 'Client A', project_manager: 'PM 1' }],
  qcto_tracker: [{ id: 50, learner_id: 1, programme_id: 100, enrolment_id: 10, current_status: 'In Progress', monitoring_status: 'Delayed', sor_status: 'Issued', eisa_booking_status: 'Pending Booking' }],
  moderation_items: [{ id: 60, sheet: 'External moderation', qualification: '57608: NC: Wealth Management', stage: 'Documents requested', learners: 4 }, { id: 61, sheet: 'Exit verification', qualification: 'BA', stage: 'Awaiting verification report', learners: 15 },
    { id: 62, sheet: 'QCTO projects', programme_id: 100, qualification: '101869 - Project Manager', learners: 1, entity: 'Apex Business Academy' }],
  accreditation_items: [{ id: 1, saqa_id: '118699', title: 'Cloud Administrator', status: 'Accreditation granted', accreditation_from: '2025-08-29' }],
  eisa_windows: [{ id: 1, label: 'Official EISA', eisa_date: '2099-11-12', registration_closing: '2099-10-30' }, { id: 2, label: 'Official EISA', eisa_date: '2100-03-10', registration_closing: '2100-01-29' }],
  leisa_settings: [{ provider: 'apex', sdp_name: 'Apex Business Academy (Pty) Ltd', sdp_code: '07-QCTO/SDP000000000001', compiler_name: 'Test Compiler' }],
  leisa_learner: [{ learner_id: 1, programme_id: 100, fields: { LearnerEmailAddress: 'a b@example.test', LearnerCellPhoneNumber: '08212345678', LearnerFaxNumber: 'NA' } }],
  legacy_qualifications: [{ saqa_id: '57608', quality_partner: 'INSETA', title: 'NC: Wealth Management', extended: true, extension: '24 Months' }],
  signoff_items: [{ id: 70, kind: 'Visit report', title: 'VIS draft', status: 'waiting', created_at: '2026-10-20' }],
  monitoring_visits: [{ id: 80, programme_id: 100, fields: { 'Visit Title': 'Impl visit', Scores: { KMA3: 2 } } }],
  recommendations: [{ id: 90, programme_id: 100, resolved: false, fields: { KMA: 'KMA3', Text: 'Fix strategy', Priority: 'High' } }],
  assessors: [{ id: 1, full_name: 'Fac One', role: 'Facilitator' }],
  v_fam_completeness: [{ assessor_id: 1, full_name: 'Fac One', document_count: 2, registration_count: 1, open_follow_ups: 0 }],
  v_learner_data_quality: [{ learner_id: 2, issue: 'missing_id', first_name: 'Test', last_name: 'Learner02', enrolment_count: 0 }, { learner_id: 1, issue: 'possible_duplicate', first_name: 'Test', last_name: 'Learner01', enrolment_count: 1 }, { learner_id: 3, issue: 'possible_duplicate', first_name: 'Test', last_name: 'Learner01', enrolment_count: 0 }],
  program_modules: [{ id: 200, programme_id: 100, module_number: 1, title: 'Mod one', dates: 'Jun 2026', trained: true, components: [{ code: 'T-KM-01', kind: 'KM', title: 'Know', hours: 10, facilitator_id: 1 }, { code: 'T-PM-01', kind: 'PM', title: 'Do', hours: null, facilitator_id: 1 }, { code: 'T-WM-01', kind: 'WM', title: 'Work', hours: 5 }] }],
  attendance_sessions: [{ id: 300, programme_id: 100, session_date: '2026-06-10', topic: 'Day 1', fields: { Module: 1 } }],
  attendance: [{ id: 400, programme_id: 100, learner_id: 1, session_date: '2026-06-10', status: 'Present' }],
  eisa: [{ id: 500, programme_id: 100, learner_id: 1, module_number: 1, km_result: 'C', pm_result: 'C', wm_result: 'C', fields: { 'Internal moderation': 'Yes' } }],
  clickup_sync_outbox: [{ id: 1, status: 'queued' }, { id: 2, status: 'succeeded' }, { id: 3, status: 'quarantined', last_error: 'ClickUp API 400' }]
};

function fakeSupabase(log, opts) {
  let cb;
  const chain = (table) => {
    const st = { table, op: 'select' };
    const p = {
      select() { return p; }, order() { return p; }, limit() { return p; }, eq(k, v) { st.eq = [k, v]; return p; },
      update(v) { st.op = 'update'; st.val = v; return p; }, insert(v) { st.op = 'insert'; st.val = v; return p; }, upsert(v, o) { st.op = 'upsert'; st.val = v; st.eq = ['onConflict', o && o.onConflict]; return p; },
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
  const files = []; w.XLSX = Object.assign({}, XLSX, { writeFile: (wb, name) => files.push({ wb, name }) }); w.__files = files;
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
  /* ---------- QA / ETQA module (qa.js) ---------- */
  const rows = (f, sheet) => XLSX.utils.sheet_to_json(f.wb.Sheets[sheet], { header: 1, raw: true, defval: '' });
  await t('Tracker: dates and comments save to their own columns; SOR Issued fills its date', async () => {
    const { w, log } = await boot(sess('qa_specialist')); w.location.hash = 'qcto'; await tick();
    await w.qaT(0, 'monD', '2026-10-01'); await w.qaT(0, 'cm', 'PoE outstanding'); await w.qSet(0, 'sor', 'Pending'); await w.qSet(0, 'sor', 'Issued'); await tick();
    const u = log.filter(x => x.table === 'qcto_tracker').map(x => x.val);
    ok(u.some(v => v.monitoring_date === '2026-10-01') && u.some(v => v.comments === 'PoE outstanding') && u.some(v => v.sor_issued_date), JSON.stringify(u));
  });
  await t('Tracker: upcoming EISA windows come from the database', async () => {
    const { w, d } = await boot(sess('qa_specialist')); await tick();
    ok(w.eval('QWIN[0][1]') === '2099-11-12' && /12\/11\/2099/.test(d.getElementById('qtable').textContent), 'windows not used');
  });
  await t('Tracker: export has the 25 tracker columns and the full ID as text', async () => {
    const { w } = await boot(sess('qa_specialist')); await tick(); w.qaExportTracker();
    const f = w.__files[0], r = rows(f, 'QCTO Projects'); ok(/^QCTO_Projects_Tracker_/.test(f.name), f.name);
    ok(r[0].length === 25 && r[0][24] === 'Comments' && r[1][7] === '9001015009087' && f.wb.Sheets['QCTO Projects'].H2.t === 's', JSON.stringify(r[1]));
  });
  await t('Tracker: operations role sees values, not edit boxes', async () => {
    const { d, w } = await boot(sess('operations')); w.location.hash = 'qcto'; await tick();
    ok(!d.querySelector('#qtable input.cellin'), 'operations can edit dates');
  });
  await t('Moderation: QCTO projects sheet edits mentor; Submitted to PM moves to Projects completed', async () => {
    const { w, d, log } = await boot(sess('qa_specialist')); w.eval("mTab='QCTO projects'"); w.renderM();
    ok(/101869/.test(d.getElementById('mtable').textContent), 'QCTO projects sheet empty');
    await w.qaM(62, 'mentor', 'Test Mentor'); await w.mSet('VER', 0, String(w.eval("MSTAGE.indexOf('Submitted to PM')"))); await tick();
    const u = log.filter(x => x.table === 'moderation_items').map(x => x.val);
    ok(u.some(v => v.mentor === 'Test Mentor') && u.some(v => v.sheet === 'Projects completed' && v.submitted_to_pm_date), JSON.stringify(u));
  });
  await t('Moderation: workbook export has the five sheets of External Moderation – 2026', async () => {
    const { w } = await boot(sess('qa_specialist')); await tick(); w.qaExportModeration();
    ok(w.__files[0].wb.SheetNames.length === 5 && w.__files[0].wb.SheetNames[1] === 'QCTO Projects', JSON.stringify(w.__files[0].wb.SheetNames));
  });
  await t('Accreditation: a date change writes the date and the matching Feedback line', async () => {
    const { w, log } = await boot(sess('qa_specialist')); await tick(); await w.qaA(1, 'accreditation_to', '2030-08-28'); await tick();
    const u = log.find(x => x.table === 'accreditation_items'); ok(u && u.val.accreditation_to === '2030-08-28' && u.val.feedback === 'Accreditation Granted (29/08/2025 – 28/08/2030)', JSON.stringify(u));
  });
  await t('Accreditation: project manager sees the status, cannot change it', async () => {
    const { d, w } = await boot(sess('project_manager')); w.location.hash = 'accred'; await tick();
    ok(!d.querySelector('#atable select') && /Accreditation granted/.test(d.getElementById('atable').textContent), 'PM has a status picker');
  });
  await t('LEISA: field check finds the same problems as the March file', async () => {
    const { w } = await boot(sess('qa_specialist')); await tick(); const [a, b] = w.qaLeisaCheck(1, 100);
    ok(a.includes('LearnerEmailAddress: contains a space') && a.includes('LearnerCellPhoneNumber: 11 digits, needs 10') && b.includes('AssessmentCentreCode'), JSON.stringify([a, b]));
  });
  await t('LEISA: stage 1 export is blocked while errors exist; forced file follows the QCTO template', async () => {
    const { w } = await boot(sess('qa_specialist')); await tick(); w.eval("eTab='LEISA file'"); w.renderE();
    w.qaExportLeisa(1); ok(!w.__files.length && /errors for stage 1/.test(w.document.getElementById('toast').textContent), 'not blocked');
    w.qaExportLeisa(1, true); const f = w.__files[0], r = rows(f, '2 - Learner Enrolment and EISA.');
    ok(/^LEISA\d{8}-SDP000000000001Apex_Business_Academy_Pty_Ltd\.xlsx$/.test(f.name), f.name);
    ok(r[0].length === 43 && r[0][38] === 'AssessmentCentreCode' && r[1][0] === '07-QCTO/SDP000000000001' && r[1][2] === '9001015009087' && r[1][29] === 'N/A' && r[1].slice(36, 42).every(x => x === '') && /^\d{8}$/.test(r[1][42]), JSON.stringify(r[1]));
    ok(rows(f, '1 - Instructions').some(x => x[0] === 'Name and Surname of Compiler:' && x[1] === 'Test Compiler'), 'details block');
  });
  await t('LEISA: saving a learner’s fields writes them to leisa_learner', async () => {
    const { w, d, log } = await boot(sess('qa_specialist'), {}); await tick(); w.eval("eTab='LEISA file'"); w.qaLeisaPick(1);
    d.querySelector('#leisaedit [data-col="AssessmentCentreCode"]').value = 'AC123'; await w.qaLeisaSave(); await tick();
    const u = log.find(x => x.table === 'leisa_learner'); ok(u && u.op === 'update' && u.val.fields.AssessmentCentreCode === 'AC123', JSON.stringify(u));
  });
  await t('Legacy check: search by title as well as ID', async () => {
    const { w, d } = await boot(sess('qa_specialist')); await tick(); d.getElementById('legq').value = 'wealth'; w.renderLeg();
    ok(/57608/.test(d.getElementById('legres').textContent), 'title search');
  });
  /* ---------- Delivery screens (delivery.js) ---------- */
  await t('Programmes: real list, header, KPIs and module progress', async () => {
    const { w, d } = await boot(sess('project_manager')); w.location.hash = 'programmes'; await tick();
    ok(/PM Cohort/.test(d.getElementById('plist').textContent) && d.querySelector('#view-programmes h1').textContent === 'PM Cohort', 'list/header');
    ok(/100%/.test(d.getElementById('pstats').textContent) && /Mod one/.test(d.getElementById('modrows').textContent) && /1 of 1/.test(d.getElementById('modrows').textContent), d.getElementById('pstats').textContent);
  });
  await t('Form 3: modules from the database, missing hours flagged, hours save, export', async () => {
    const { w, d, log } = await boot(sess('project_manager')); w.eval("pTab='Form 3'"); w.renderProg(); await tick();
    const f3 = d.getElementById('form3'); ok(!f3.hidden && /T-KM-01/.test(f3.textContent) && /Fac One/.test(f3.innerHTML) && /On FAM registry/.test(f3.textContent), 'form 3 content');
    await w.dvComp(200, 1, 'hours', '40'); await tick();
    const u = log.find(x => x.table === 'program_modules'); ok(u && u.val.components[1].hours === 40 && u.val.components[0].hours === 10, JSON.stringify(u));
    ok(/^Form3-101869-PM-Cohort\.doc$/.test(w.dvForm3Export()), 'export name');
  });
  await t('Attendance: register reads P/Present, a tap upserts the next letter', async () => {
    const { w, d, log } = await boot(sess('qa_specialist')); w.location.hash = 'attendance'; await tick();
    const b = d.querySelector('#register button[aria-label*="10/06/2026"]'); ok(b && b.textContent === 'P', 'cell');
    await w.dvMark(1, '2026-06-10'); await tick();
    const u = log.find(x => x.table === 'attendance'); ok(u && u.op === 'upsert' && u.val.status === 'R' && u.val.tenant_id === 'apex-preview' && u.eq[1] === 'tenant_id,learner_id,programme_id,session_date', JSON.stringify(u));
  });
  await t('Attendance: operations sees the register read only', async () => {
    const { w, d } = await boot(sess('operations')); w.location.hash = 'attendance'; await tick();
    ok(!d.querySelector('#register button') && d.getElementById('dvadd').hidden, 'operations can edit');
  });
  await t('PoE tracker: result and moderation tick upsert one eisa row per module', async () => {
    const { w, log } = await boot(sess('qa_specialist')); await tick();
    await w.dvRes2(1, 1, 'PM', 'RW'); await w.dvMod(1, 1, false); await tick();
    const u = log.filter(x => x.table === 'eisa'); ok(u.length === 2 && u[0].val.pm_result === 'RW' && u[0].val.km_result === 'C' && u[1].val.fields['Internal moderation'] === 'No' && u[0].eq[1] === 'learner_id,programme_id,module_number', JSON.stringify(u));
  });
  await t('EISA readiness: six criteria from results, moderation and SoR', async () => {
    const { w, d } = await boot(sess('qa_specialist')); w.eval("eTab='Readiness'"); w.renderE(); await tick();
    ok(/Ready/.test(d.getElementById('eisarows').textContent) && d.getElementById('eisarows').querySelectorAll('.b-ok.dot').length === 6, d.getElementById('eisarows').textContent);
    await w.dvRes2(1, 1, 'WM', 'NS'); w.renderE();
    ok(/Not yet/.test(d.getElementById('eisarows').textContent), 'NS should block readiness');
  });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
