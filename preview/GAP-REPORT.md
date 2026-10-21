# ApexOne redesign preview: gap report

Date: 21 October 2026. Branch: `feat/apexone-redesign-preview`. Live ApexOne (`index.html`, project `apex-one`) is unchanged.

## What was built

| Piece | Where | Isolation |
|---|---|---|
| Preview page | `preview/index.html` + `preview/live.js` (the mock, now wired to data) | Signs in only against `apexone-preview`. It refuses to start if pointed at the live project. |
| Database | New free Supabase project `apexone-preview` (`qszikynltvyplzqootrc`, eu-west-2) | Live schema copied (tables, constraints, RLS, roles, triggers, outbox, audit), with no live data. Test data only, tenant `apex-preview`. |
| ClickUp writer | Edge function `preview-clickup-adapter` (a copy of `clickup-sync-live-adapter` v37) | Every list ID is remapped to the test folder. A hard guard refuses any write to a list or task outside it. The token is a server-side secret. |
| ClickUp sandbox | ApexOne Operations › **Z. Redesign Preview (TEST — not live data)**, lists T1–T18 | No existing list was touched. Recruitment Candidates and Monthly Recruitment Report are not in scope and are refused by the guard. |

## Screen-by-screen

Legend: **Live** = what the current app uses. **Preview** = what the redesign preview now does. **Build** = what is still needed before porting.

| Screen | Live: Supabase | Live: ClickUp list | Roles (RLS) | Preview status | Still to build |
|---|---|---|---|---|---|
| Dashboard | `learners`, `enrolments`, `programmes`, `recommendations`, views `v_learner_kpis`, `v_clickup_sync_health` | n/a | all signed-in | **Real counts**, QA alerts from real tables, ClickUp sync panel (PM/ops/admin only) | Confirm KPI definitions match reports. AI summary deliberately off. |
| Programmes | `programmes`, `program_modules`, RPCs `activate_programme`, `close_programme`, `submit_and_handover_programme` | 2. Programmes, 10. QCTO Modules | owner/admin; PI-specialist status gate | Mock UI (list and Form 3 still sample) | Wire the list and tabs. Form 3 needs a module-hours table and a .docx export. Hand-over stays in the live sign-off flow. |
| Learners | `learners` (+ `check_learner_duplicate`) | 3. Learners | owner-of-programme or unlinked | **Real list**, filter, masked IDs | Add/import learner forms; induction pack + appeals tables (new). |
| Enrolments | `enrolments` | 4. Enrolments | owner-of-programme | **Real list** + unlinked count | Enrol/link action. |
| Data quality | view `v_learner_data_quality`, `learner_quality_reviews` | n/a | admin only | **Real issues; decisions write**; “Same person” → `request_learner_merge` → Sign-off queue (never merges) | Actual merge procedure after approval (who approves is an open decision). |
| Attendance & PoE | `attendance`, `attendance_sessions`, `poe_checklist` | 5. Attendance & PoE | owner-of-programme | Mock UI | Wire register cells to `attendance` upserts. |
| EISA readiness / LEISA | `leisa_learner`, `leisa_settings` (preview-only) | 8. EISA Readiness | QA, ETQA, admin write | LEISA tab real (2026-10-21): per-learner 43 QCTO fields, field check, SDP/compiler details, stage 1 / stage 2 .xlsx in the QCTO template. Readiness tab still mock. | Live needs the two tables; `AssessmentCentreCode` owner still open. |
| Monitoring visits | `monitoring_visits.fields` | 6. Monitoring Visits | owner/admin | **Real visits; KMA scores, type, judgement save** | Evidence checklist persistence; AI visit report. |
| Recommendations | `recommendations` | 7. Recommendations | owner/admin | **Real list; “Mark resolved” writes** | Add/assign owner + due date form. |
| FAM Registry | `assessors`, `fam_*` (+ storage bucket `fam-documents`) | 9. FAM Practitioners / 12. Assessors & Moderators (via `fam-sync-worker`) | FAM writer/admin roles | **Real practitioner list** (counts) | Document upload (bucket + signed URLs not copied), FAM sync worker not copied, so `fam_*` events queue but are not delivered. Bulk Intake stays in PR #61. |
| Clients | `clients` | 1. Clients | owner/admin | **Real cards** | Detail panel + edit. |
| QCTO Tracker | **none in live** | none in live | QA/ETQA/PM write, all read | **New table `qcto_tracker`; status dropdowns write; outbox → T15** | 2026-10-21: assessor, duration, all dates and comments editable; EISA windows from `eisa_windows`; export in the tracker's 25 columns. Import still off (preview holds test data). Product decision: replace or sync the spreadsheet. |
| Moderation & Verification | **none in live** | none | QA/ETQA/PM write | **New table `moderation_items`; stage writes → T16** | 2026-10-21: QCTO projects sheet added; stage date, comments, verifier, SoR submission, enrolment dates, mentor, certification editable; “Submitted to PM” moves to Projects completed; add-programme form; 5-sheet workbook export. |
| Accreditation | **none in live** | none | QA/ETQA/PM write | **New tables `accreditation_items`, `legacy_qualifications`** (read) → T17 | 2026-10-21: status, SMME, advisor, verifier and desktop/site-visit/accreditation dates editable; Feedback written from the dates; expiry flag; add-qualification form; full legacy list (626 IDs) with title search. |
| Sign-off queue | **none in live** (reports use `reports.transition_report`) | none | decide = admin only (RPC) | **New `signoff_items` + `signoff_decide`**; return needs a comment → T18 | Feed visit reports / monthly reports / FAM renewals into it automatically. |
| Reports (generator) | `reports.*`, RPCs `my_report_queue`, `transition_report`; `report-generator.html` | 11. Reports & Compliance | PM submits, admin reviews | Report workflow copied and tested at DB level; generator UI still mock | Keep using `report-generator.html` until the redesign's generator is wired. Signed-PDF flow (`handoff-record-pdf`) not copied. |
| Recruitment Candidates | separate ClickUp space | Recruitment Candidates | n/a | **Not touched.** Not in preview. Adapter guard refuses its lists. | Nothing. Out of scope by instruction. |
| Monthly Recruitment Report | `recruitment_report_snapshots`, `report_viewers`, functions `recruitment-report*` | Monthly Recruitment Report space | report viewers | **Not touched.** Not copied. | Nothing. Stays on `monthly-recruitment-report.html`. |

## Not copied to the preview (deliberately)

- **PI → PM hand-over engine** (`handoff_*` tables and RPCs, `handoff.ts`, signed PDF). It is not on any mock screen, and copying it would duplicate the live sign-off. The preview lifecycle guard lets an admin override instead.
- **Legacy ClickUp notify triggers.** These are already disabled in live.
- **Email notifications** (`report-notify`, `notification_emails`). No emails are sent from the preview.
- **Turnstile.** The preview project has no CAPTCHA, so sign-in is email and password only.
- **AI** (`ai-generate`). No calls.
- **Webhook back from ClickUp** (`clickup-webhook`). The preview is one-way: Supabase writes to ClickUp.

## Bugs and risks found

1. **Relationship fields are pinned to live lists.** `Client Link`, `Programme Link` and `Learner Link` only accept tasks from the live lists, so the preview links child to parent through the generic `Related Record` field. Porting needs either new link fields or the same generic field.
2. **Report-events insert policy** was missing in my first copy. The DB tests caught it and it is fixed. This shows the tests do their job.
3. **Outbox status** `retrying` has no backoff in the copied adapter: it is retried every poll (2 minutes) until 5 attempts. Live has the same behaviour.
4. **Shared token.** A personal ClickUp token can reach every space. The preview guard is what keeps writes inside the test folder, and it is covered by `tests/guard.test.js`. A dedicated service user with access only to ApexOne Operations would be safer for both live and preview.
