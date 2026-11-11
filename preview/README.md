# ApexOne redesign preview (isolated)

A working preview of the redesign, **Now wired to the LIVE ApexOne project (`apex-one`) since 10 Nov 2026.** FAM bookings use `fam_bookings` + `fam_availability()`. Screens built on preview-only tables (QA/ETQA, LEISA, sign-offs) show load errors on live.
Live ApexOne (`/index.html`, project `apex-one`) and its ClickUp lists are untouched.

- `index.html`: the redesign mock, plus sign-in and live data (`live.js`) and the QA/ETQA screens (`qa.js`: Tracker, Moderation & Verification, Accreditation, LEISA file, real .xlsx exports), and the delivery screens (`delivery.js`: Programmes with Form 3, Attendance register and PoE tracker, EISA readiness), and the app shell (`shell.js`: ApexU brand colours and logos, menu that closes to an icon rail, right side panel with Details / Activity / Assistant, "My work" home per role with hide-for-today bulk action, Ctrl K search). Logo sources are in `assets/`.
- `migrations/`: preview-only SQL for the QA/ETQA screens (schema, test data, full Pre-2009/NATED list)
- `adapter/`: the deployed `preview-clickup-adapter` (copy of the live adapter, remapped to the TEST folder and guarded)
- `tests/`: `page.test.js` (15), `guard.test.js` (27), `db.test.sql` (20, rolls back)
- `GAP-REPORT.md`: every screen against the live app; what is real and what is still mock
- `E2E-CHECKLIST.md`: setup and manual test run

Open it locally (double-click `index.html`, keeping `live.js`, `qa.js`, `delivery.js` and `shell.js` in the same folder) or from any static host.
Hosted on `main` at /preview/ (page files only). It talks to the LIVE apex-one project. Migrations, adapter and older tests stay on the feat/apexone-redesign-preview branch (its GAP-REPORT.md is from 21 Oct and predates the switch to live; the module list below is the current one).

## Moving modules from the old app to the new look

One module at a time. When a module is complete here, the old app's menu item redirects to it; after that only this copy changes.

| Module | Status (11 Nov 2026) | Left to do |
|---|---|---|
| FAM Registry (+ old Assessors, SETA Assessments, QCTO Modules items) | **Moved** (ApexOne #68, #71) | Data capture; user guide kept current |
| Recommendations | **Moved** (#69) | Nothing |
| Clients | **Moved** (#70) | Nothing |
| Monitoring visits | **Moved** (#71): list, full edit form (old field keys), add, print, recommendations per visit | AI visit report not carried over (AI off) |
| Learners | **Moved** (#71): list, learner page, add/edit with SA ID + duplicate check | Excel import: use the old app's Import |
| Enrolments | **Moved** (#71): enrol one or many, edit status/statement/EISA type/funding/site | Old app's EISA table here is now PoE tracker (module results) + EISA › Exam results |
| Attendance & PoE | **Moved** (#71): register (R = Late, as in the old app), add session, CSV, PoE tracker, Documents checklist (old "EISA & PoE Readiness" item opens #attendance/documents) | — |
| EISA readiness | Readiness + Exam results tabs on live data; LEISA tab needs leisa tables on live | Migrations for LEISA |
| Programmes | **Moved** (#72): stages, search, overview, Form 3 (program_modules.components added on live), edit, Activate/Close, CSV | Sign-off/hand-over, Sign-off queue, + Add Programme and PM Tracker stay in the old app (?classic=1) |
| Dashboard | Real counts (home page) | Confirm KPI definitions |
| Data quality | Real issues; decisions write | Merge procedure (approver not decided) |
| QCTO Tracker, Moderation, Accreditation, Sign-off queue | Preview-only tables, not on live | Migrations to live first |
| Reports, Audit, Users | Stay in the old app | — |
