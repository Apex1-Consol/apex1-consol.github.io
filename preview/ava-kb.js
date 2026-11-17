/* Ava knowledge base (internal; staff never see this file). Per route: purpose, guides (live steps), fields, flags; plus owners for routing.
   Step: { t: text, sel: where "Show me" points ('tile:Label', 'btn:Text', 'field:name' or CSS), done: () => true when the step is done }.
   No personal data and no invented values: examples describe formats, never real IDs or names. */
(() => {
  const R = () => location.hash.slice(1).split('/')[0] || 'mywork';
  const Q = s => !!document.querySelector(s);
  const vis = el => !!el && el.getClientRects().length > 0;
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const tile = l => [...document.querySelectorAll('.famk')].find(b => vis(b) && txt(b.querySelector('.l') || b).toLowerCase().startsWith(l.toLowerCase()));
  const btn = l => [...document.querySelectorAll('button,a.btn')].find(b => vis(b) && !b.closest('#avapanel') && txt(b).toLowerCase().startsWith(l.toLowerCase()));
  const fld = n => document.querySelector(`#famov [name="${n}"],#pform [name="${n}"]`);
  const V = n => { const f = fld(n); return !!f && String(f.value || '').trim() !== ''; };
  const T = l => { const b = tile(l); return !!b && b.classList.contains('on'); };
  const anyOn = () => Q('.famk.on');
  const at = r => () => R() === r;
  const NM = { mywork: 'My work', desk: 'My desk', dashboard: 'Dashboard', hoo: 'Consolidated view', pmtracker: 'PM Tracker', programmes: 'Programmes', learners: 'Learner profile', enrolments: 'Enrolments', attendance: 'Attendance & PoE', eisa: 'EISA readiness', visits: 'Monitoring visits', recs: 'Recommendations', qcto: 'QCTO Tracker', modver: 'Moderation & Verification', pi: 'Programme Initiation', signoff: 'Sign-off queue', clients: 'Clients', accred: 'Accreditation', fam: 'FAM Registry', dq: 'Data quality', reports: 'Reports' };
  const open = (r, t) => ({ t: t || `Open ${NM[r] || r}`, sel: `a[href="#${r}"]`, done: at(r) });
  function find(sel) {
    if (!sel) return null;
    if (sel.startsWith('tile:')) return tile(sel.slice(5)) || null;
    if (sel.startsWith('btn:')) return btn(sel.slice(4)) || null;
    if (sel.startsWith('field:')) return fld(sel.slice(6));
    return [...document.querySelectorAll(sel)].find(el => vis(el) && !el.closest('#avapanel')) || null;
  }

  /* who to route to (roles, never names) */
  const OWNERS = {
    pm: 'your project manager', qa: 'the QA specialist', pi: 'the PI specialist', admin: 'an ApexOne admin', ohs: 'the FAM / OHS specialist', signoff: 'the person signing off'
  };

  /* flags: [match, why, fix label, fix action (JS; {pid} = programme on that row), owner] */
  const FLAGS = [
    [/^(Ending in 30 days|Ending soon)/i, 'A running programme ends within 30 days. Start close-out now: registers, PoE, EISA bookings, open recommendations and the final report.', 'Prepare close-out', "avaGuide('programmes','closeout')", 'pm'],
    [/^Ending ≤30 days, none ready/i, 'Ends within 30 days and no learner meets all six EISA criteria yet. Check modules, results and moderation on the PoE tracker.', 'Open PoE tracker', "dvGo('attendance','PoE tracker')", 'pm'],
    [/^No register/i, 'Running, but no attendance marked in the last 14 days. Capture the missing registers so attendance and EISA readiness are right.', 'Capture a register', "avaGuide('attendance','register')", 'pm'],
    [/^Visit due/i, 'The next visit date from the latest monitoring visit is within 14 days or already past. Book the visit with QA and record it after.', 'Open visits', "location.hash='visits'", 'qa'],
    [/^No monitoring visit/i, 'A running programme has no visit recorded yet. QA plans visits; record it when it happens.', 'Open visits', "location.hash='visits'", 'qa'],
    [/^No learners( enrolled)?$/i, 'Running with no learners linked. Link the learners on Enrolments (each needs a valid SA ID).', 'Open enrolments', "location.hash='enrolments'", 'pm'],
    [/^Rec(ommendation)?s overdue/i, 'An open recommendation from a monitoring visit is past its due date. Do the action, then Request close with a note.', 'Open recommendations', "location.hash='recs'", 'pm'],
    [/^Open recommendations/i, 'Actions from monitoring visits that are not closed yet.', 'Open recommendations', "location.hash='recs'", 'pm'],
    [/^Awaiting hand-over/i, 'Captured in Programme Initiation, but the hand-over is not signed yet. The PI specialist submits; the PM signs in the Sign-off queue.', 'Open sign-off queue', "location.hash='signoff'", 'pi'],
    [/^No SAQA/i, 'The programme has no SAQA ID, so accreditation, SETA and EISA checks cannot run. Edit the programme and pick the SAQA ID from the list.', 'Edit programme', "avaEditProg({pid})", 'pm'],
    [/^(Missing or bad dates|No start|No end|End before start)/i, 'Start or end date is blank, or the end is before the start. Dates drive run state, registers and close-out. Fix them on Edit (PMs only).', 'Edit programme', "avaEditProg({pid})", 'pm'],
    [/^SoR issued, not booked/i, 'Learners have their SoR issued on the QCTO tracker but the EISA is not booked yet.', 'Open QCTO tracker', "location.hash='qcto'", 'qa'],
    [/^Booked, no EISA date/i, 'EISA marked Booked on the QCTO tracker without an EISA date. Add the date.', 'Open QCTO tracker', "location.hash='qcto'", 'qa'],
    [/^Result outstanding/i, 'The EISA date has passed and no outcome is recorded. Record the outcome on the QCTO tracker.', 'Open QCTO tracker', "location.hash='qcto'", 'qa'],
    [/^No modules set up/i, 'Modules are not captured on the PoE tracker, so EISA readiness cannot be worked out.', 'Set up modules', "avaGuide('attendance','modules')", 'pm'],
    [/^(No ID|Invalid ID|missing.*SA ID)/i, 'Learners need a valid 13-digit South African ID. Add or fix it on Data quality.', 'Open data quality', "location.hash='dq'", 'pm'],
    [/^Expired|^Expiring/i, 'A registration or accreditation has expired or expires soon. Renew it and upload the new document.', 'Open FAM Registry', "location.hash='fam'", 'ohs'],
    [/^Missing$|documents? missing/i, 'A required document is not uploaded yet. Upload it where the row shows Missing.', '', '', 'pm'],
    [/^Unassigned/i, 'No project manager is set on these programmes. Edit each programme and set the PM.', 'Edit programme', "avaEditProg({pid})", 'pi'],
    [/^Never signed in/i, 'These staff have accounts but have not signed in yet. They use their own work email and "Forgot password?".', 'Open users', "location.hash='users'", 'admin'],
  ];
  const flag = h => { const s = String(h || '').replace(/\s+\d+$/, '').trim(); const m = FLAGS.find(([r]) => r.test(s)); return m ? { why: m[1], fixL: m[2], fix: m[3], owner: OWNERS[m[4]] } : null; };

  const PG = (name, purpose, guides = {}, fields = {}) => ({ name, purpose, guides, fields });
  const PAGES = {
    mywork: PG('My work', 'Your to-do list across ApexOne, built from your role. Each row says what to do and opens the right page.', {
      start: { t: 'Work through my list', steps: [open('mywork'), { t: 'Click a tile with a count (red first: overdue or blocking someone). It takes you straight to the fix.', sel: '#view-mywork [id^="mwt"]', done: () => R() !== 'mywork' }] } }),
    desk: PG('My desk', 'Your personal overview: what you own and what changed.', { start: { t: 'Use my desk', steps: [open('desk'), { t: 'Click a tile to filter what you own.', sel: '.famk' }] } }),
    dashboard: PG('Dashboard', 'Company-wide numbers: programmes, learners, visits and reports.', { read: { t: 'Read the dashboard', steps: [open('dashboard'), { t: 'Click a number to open the list behind it.', sel: '#view-dashboard .kpi' }] } }),
    hoo: PG('Consolidated view', 'All programmes and their health in one table, for heads of operations.', { read: { t: 'Find a programme', steps: [open('hoo'), { t: 'Search by #id or client.', sel: 'input[type=search]' }] } }),
    pmtracker: PG('PM Tracker', 'Caseload per project manager: running programmes and what needs attention on each.', {
      attention: { t: 'Find what needs my attention', roles: ['pm', 'admin', 'qa'], steps: [open('pmtracker'),
        { t: 'Click a "Needs attention" tile (for example Visit due or overdue). The list filters to those programmes.', sel: '.famgrp[aria-label="Needs attention"] .famk', done: anyOn },
        { t: 'Click the #Prog ID on a row to open the programme.', sel: '#view-pmtracker a[title="Open programme"]', done: at('programmes') },
        { t: 'Ask Ava "What\'s missing?" on the programme, then fix each item.', sel: '#avafab' }] },
      dates: { t: 'Fix missing dates or SAQA ID', roles: ['pm', 'admin'], steps: [open('pmtracker'),
        { t: 'Click the "Missing or bad dates" (or "No SAQA") tile under Data gaps.', sel: 'tile:Missing or bad dates', done: () => T('Missing or bad dates') || T('No SAQA') },
        { t: 'Click Edit on the programme row.', sel: 'btn:Edit', done: () => Q('#pform') },
        { t: 'Fill in Start date and End date (end after start).', sel: 'field:start', done: () => V('start') && V('end') && fld('end').value >= fld('start').value },
        { t: 'Pick the SAQA ID from the list (it comes from Accreditation).', sel: 'field:saqa', done: () => V('saqa') },
        { t: 'Click Save.', sel: '#pform button[type=submit],#pform .btn.y', done: () => !Q('#pform') }] },
      caseload: { t: 'See one PM\'s caseload', steps: [open('pmtracker'), { t: 'Click the PM\'s tile under Caseload, or pick them in the Project manager filter.', sel: '#pmf-pm', done: anyOn }, { t: 'Click Clear filters to see everyone again.', sel: 'btn:Clear filters', done: () => !anyOn() }] },
      export: { t: 'Export the tracker', steps: [open('pmtracker'), { t: 'Set the filters you want, then click Export CSV.', sel: 'btn:Export CSV' }] } },
      { 'Prog ID': 'The programme number shown everywhere as #id. Click it to open the programme.', State: 'Run state from the dates: Planned, Active (running) or Completed.', Learners: 'Learners enrolled (withdrawn left out).', 'Type · SETA': 'Occupational (QCTO) or Legacy (SETA); SETA comes from the programme or its accreditation.', Dates: 'Start – end. Badges show blank or bad dates.', 'Facilitator / Assessor': 'Full names from the FAM Registry.' }),
    programmes: PG('Programmes', 'One programme at a time: overview, Form 3, learners, attendance, PoE, EISA readiness and visits.', {
      missing: { t: 'Check what\'s missing on a programme', steps: [open('programmes'), { t: 'Pick the programme from the list.', sel: '#view-programmes .pick', done: () => !!(window.dvApi && dvApi.cur && dvApi.cur()) }, { t: 'Click "What\'s missing?" (Ava chip) and fix each item with its button.', sel: '#avachips .avc' }] },
      edit: { t: 'Edit programme details', roles: ['pm', 'admin', 'pi'], steps: [open('programmes'), { t: 'Pick the programme.', sel: '#view-programmes .pick', done: () => !!(window.dvApi && dvApi.cur && dvApi.cur()) },
        { t: 'Click Edit at the top of the programme.', sel: 'btn:Edit', done: () => Q('#pform') },
        { t: 'Pick Facilitator, Assessor and Moderator from the FAM list (full names).', sel: 'field:fac', done: () => V('fac') && V('ass') },
        { t: 'Check SAQA ID, dates and project manager.', sel: 'field:saqa', done: () => V('saqa') && V('start') && V('end') && V('pm') },
        { t: 'Click Save.', sel: '#pform .btn.y', done: () => !Q('#pform') }] },
      closeout: { t: 'Prepare close-out (ending soon)', roles: ['pm', 'admin'], steps: [open('programmes'),
        { t: 'Registers: every session captured up to the end date.', sel: 'btn:Attendance' },
        { t: 'PoE: modules, results and internal moderation captured.', sel: 'btn:PoE' },
        { t: 'EISA readiness: each learner meets all six; SoR issued and EISA booked on the QCTO tracker.', sel: 'btn:EISA readiness' },
        { t: 'Recommendations closed and the final monthly report sent.', sel: '#prelated' }] } },
      { 'Prog ID': 'Required. The programme number used everywhere (#id). Do not reuse an old number.', 'Qualification / programme name': 'Required. The qualification title as on the accreditation.', Client: 'Required. Pick the client; add new clients on Clients first.', Entity: 'Which Apex entity delivers it.', 'Project manager': 'The PM responsible. Must match the PM\'s name in User management.', Type: 'Occupational (QCTO) has EISA; Legacy (SETA) does not.', 'SAQA ID': 'Pick from the list (Accreditation). Drives SETA, accreditation and EISA checks.', 'QCTO code': 'The QCTO qualification code, if occupational.', 'NQF level': 'Number 1 to 10.', Cohort: 'Group name when a client has several intakes.', 'Learners (planned)': 'Planned number; the real count comes from Enrolments.', 'Employment status': 'Employed or Unemployed learners.', 'Mode of delivery': 'Face to Face, Online or Blended.', SETA: 'Leave blank to use the accreditation\'s SETA.', 'Programme status': 'Only for Suspended or Cancelled; run state otherwise comes from the dates.', 'Start date': 'First training day.', 'End date': 'Last training day; must be after the start.', 'Accreditation period end': 'From the accreditation letter.', 'EISA start': 'Window for the external assessment (occupational).', 'EISA end': 'End of that window.', Facilitator: 'Full name from the FAM Registry list.', Assessor: 'Full name from the FAM Registry list.', Moderator: 'Full name from the FAM Registry list.' }),
    learners: PG('Learner profile', 'Learner records. Personal details stay in ApexOne; Ava never sees them.', { find: { t: 'Find a learner', steps: [open('learners'), { t: 'Search by name or ID number.', sel: 'input[type=search]' }] } }),
    learner: PG('Learner', 'One learner\'s record, enrolments and documents.', {}),
    enrolments: PG('Enrolments', 'Which learner is on which programme. Withdraw here; never delete.', { withdraw: { t: 'Withdraw a learner', steps: [open('enrolments'), { t: 'Search the learner or programme.', sel: 'input[type=search]' }, { t: 'Click Withdraw, enter the date and reason (both required), Save.', sel: 'btn:Withdraw' }] } }),
    attendance: PG('Attendance & PoE', 'Registers, PoE tracker (modules and results) and learner documents per programme.', {
      register: { t: 'Capture a register', steps: [open('attendance'), { t: 'Pick the programme in the Programme list.', sel: '#view-attendance label.f select:not(#ascope)' }, { t: 'Click + Add session, choose date and module, Save session.', sel: 'btn:+ Add session' }, { t: 'Tap each learner\'s cell: Present → Late → Absent. It saves by itself.', sel: '#view-attendance table' }] },
      modules: { t: 'Set up modules', steps: [open('attendance'), { t: 'Open the PoE tracker tab.', sel: 'btn:PoE tracker' }, { t: 'Click + Add module: number, title and at least one KM, PM or WM code.', sel: 'btn:+ Add module' }] } }),
    eisa: PG('EISA readiness', 'Which learners meet all six criteria for the EISA, per programme.', { read: { t: 'Check readiness', steps: [open('eisa'), { t: 'Click a Needs attention tile, then a programme row to see its learners.', sel: '.famk' }, { t: 'Hover a ✓ / ✕ for the rule behind it.', sel: '#eisarows' }] } }),
    visits: PG('Monitoring visits', 'Visit records with KMA scores, judgement and next visit date.', { add: { t: 'Record a visit', roles: ['qa', 'admin', 'pm'], steps: [open('visits'), { t: 'Click + Add visit, pick the programme and date.', sel: 'btn:+ Add visit' }, { t: 'Fill in KMA scores, judgement and next visit date.', sel: '#view-visit' }] } }),
    visit: PG('Visit', 'One monitoring visit: scores, findings and recommendations.', {}),
    recs: PG('Recommendations', 'Actions from monitoring visits, with due dates.', { close: { t: 'Close a recommendation', steps: [open('recs'), { t: 'Click Request close on it.', sel: 'btn:Request close' }, { t: 'Write what was done; it goes to the Sign-off queue for approval.', sel: 'textarea' }] } }),
    qcto: PG('QCTO Tracker', 'Per learner: status, SoR, EISA booking, date and outcome.', { book: { t: 'Book EISAs', roles: ['qa', 'admin', 'pm'], steps: [open('qcto'), { t: 'Set SOR to SOR Issued (with date).', sel: 'select' }, { t: 'Set Booking to Booked and enter the EISA date; Set for all does a cohort.', sel: 'btn:Set for all' }] } }),
    modver: PG('Moderation & Verification', 'External moderation and exit verification items, linked to programmes.', { link: { t: 'Link an item to a programme', roles: ['qa', 'admin'], steps: [open('modver'), { t: 'Open the item and pick its programme.', sel: '#view-modver table' }] } }),
    pi: PG('Programme Initiation', 'New programmes start here: client, qualification, dates, people and hand-over documents.', { new: { t: 'Start a new programme', roles: ['pi', 'admin'], steps: [open('pi'), { t: 'In the form, capture client, qualification, dates and people.', sel: '#piFrame', self: 1 }, { t: 'Upload the hand-over documents, then Submit for hand-over. When practising, do NOT press Submit (this form can\'t be blocked): press "I\'ve done it".', sel: '#piFrame', self: 1 }] } }),
    handover: PG('Hand-over', 'One programme\'s hand-over: Initiator prepares and signs, Compliance verifies and signs, Head of Ops signs, then the PM accepts or queries.', {
      prepare: { t: 'Prepare and sign a pack', roles: ['pi'], steps: [open('mywork'), { t: 'Under Waiting for you, click the hand-over to open it.', sel: '#view-mywork', done: at('handover') },
        { t: 'Work through What stands in the way, top to bottom. Each item has its own button.', sel: '#view-handover .ho-list' },
        { t: 'For each gate, attach the file or paste an https link as evidence.', sel: '#view-handover [data-gate]' },
        { t: 'Check the attached files here before you sign.', sel: '#hoDocs' },
        { t: 'Tick the statement, type your name and click Sign.', sel: '.ho-steps', done: () => Q('.ho-steps .sig') }] },
      verify: { t: 'Verify and sign', roles: ['qa'], steps: [open('mywork'), { t: 'Under Waiting for you, click the hand-over to open it.', sel: '#view-mywork', done: at('handover') },
        { t: 'Open each gate\'s evidence and verify it. When all are checked, Verify all does the rest in one go.', sel: '#view-handover [data-gate]' },
        { t: 'Tick the statement, type your name and click Sign.', sel: '.ho-steps' }] },
      approve: { t: 'Approve or name an acting signer', roles: ['admin'], steps: [open('mywork'), { t: 'Under Waiting for you, click the hand-over to open it.', sel: '#view-mywork', done: at('handover') },
        { t: 'Read the signatures and the pack, then sign your step.', sel: '.ho-steps' },
        { t: 'If a signer is away, click Name an acting signer instead of unlocking: it keeps every signature.', sel: 'btn:Name an acting signer' }] },
      accept: { t: 'Accept or query a hand-over', roles: ['pm'], steps: [open('mywork'), { t: 'Under Waiting for you, click the hand-over to open it.', sel: '#view-mywork', done: at('handover') },
        { t: 'Check the hand-over pack and your deadlines.', sel: '#hoDocs' },
        { t: 'Click Accept hand-over, or Raise a query and say what is missing.', sel: 'btn:Accept hand-over' }] } }),
    signoff: PG('Sign-off queue', 'Hand-overs, closing notes and reports waiting for a decision.', { review: { t: 'Review an item', steps: [open('signoff'), { t: 'Open the item, check the documents.', sel: '#view-signoff table' }, { t: 'Approve, or Return with a note saying what to fix.', sel: 'btn:Approve' }] } }),
    clients: PG('Clients', 'Client companies, contacts, PM and MOU status.', { gaps: { t: 'Complete client details', steps: [open('clients'), { t: 'Pick the client and click Edit.', sel: 'btn:Edit' }, { t: 'Fill contact person, email, phone, PM, sector and MOU status.', sel: '#famov' }] } }),
    accred: PG('Accreditation', 'Qualifications Apex is accredited for, with expiry and SETA.', { read: { t: 'Check expiring accreditation', steps: [open('accred'), { t: 'Click the expiring tile.', sel: '.famk' }] } }),
    fam: PG('FAM Registry', 'Facilitators, assessors and moderators: SETA registrations, scope and documents.', { renew: { t: 'Renew a registration', roles: ['ohs', 'qa', 'admin'], steps: [open('fam'), { t: 'Click the Expired or Expiring tile.', sel: '.famk' }, { t: 'Open the practitioner, update the registration and upload the new letter.', sel: '#view-fam table' }] } }),
    dq: PG('Data quality', 'Learners without a valid SA ID, not enrolled, or possible duplicates.', { id: { t: 'Fix a learner ID', steps: [open('dq'), { t: 'Find a learner with a red No ID or Invalid ID badge.', sel: '#view-dq .b-bad' }, { t: 'Click Add SA ID and enter the 13-digit South African ID.', sel: 'btn:Add SA ID' }] } }),
    reports: PG('Reports', 'Monthly client reports: draft → review → sent.', { move: { t: 'Move a report on', steps: [open('reports'), { t: 'Open the programme row and complete the next stage.', sel: '#view-reports .ddrow' }] } }),
    assessors: PG('Assessors & Moderators', 'Registration status of assessors and moderators.', {}),
    synchealth: PG('Data & Sync Health', 'Health checks and the ClickUp sync queue (admin).', {}),
    audit: PG('Audit log', 'Who changed what and when (admin).', {}),
    users: PG('User management', 'Staff accounts and roles (admin).', {}),
  };
  const ROLEMAP = { project_manager: 'pm', qa_specialist: 'qa', pi_specialist: 'pi' };
  const guides = (r, role) => Object.entries((PAGES[r] || {}).guides || {}).filter(([, g]) => !g.roles || !role || role === 'admin' || g.roles.includes(ROLEMAP[role] || role));
  function search(q) {
    const w = String(q || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length > 2 && !/^(how|the|can|what|where|do|does|and|for|with|this|that|you|ava)$/.test(x));
    if (!w.length) return [];
    const out = [];
    Object.entries(PAGES).forEach(([r, p]) => Object.entries(p.guides).forEach(([k, g]) => {
      const hay = (g.t + ' ' + g.steps.map(s => s.t).join(' ')).toLowerCase(), title = g.t.toLowerCase();
      const s = w.reduce((n, x) => n + (title.includes(x) ? 3 : hay.includes(x) ? 1 : 0), 0); if (s) out.push({ r, k, g, s, page: p.name });
    }));
    return out.sort((a, b) => b.s - a.s).slice(0, 4);
  }
  window.AVAKB = { PAGES, FLAGS, OWNERS, flag, find, guides, search, route: R };
})();
