# ApexOne preview: end-to-end checklist

Run these against the preview only. Every record is test data in `apexone-preview`, and ClickUp writes land only in **ApexOne Operations › Z. Redesign Preview (TEST — not live data)**.

## One-time setup (Stavros)

1. In Supabase, open project **apexone-preview** › Edge Functions › Secrets. Add `CLICKUP_API_TOKEN` (your ClickUp personal token).
2. In Supabase › Authentication › Users, use **Add user** for `stavros@apexu.co.za`. The account gets `admin` and tenant `apex-preview` automatically. Optional role-test accounts are `preview.pm@`, `preview.qa@` and `preview.viewer@apexu.co.za`.
3. Tell Claude the token is set. Claude then re-enables the outbox kick and the 2-minute poll, and delivers the 46 queued test events.

## Automated (already passing)

| Suite | Command | Result |
|---|---|---|
| Page (jsdom, fake backend) | `node preview/tests/page.test.js` | 15/15 |
| Adapter ClickUp guard | `node preview/tests/guard.test.js` | 27/27 |
| Database, as each role, rolled back | `preview/tests/db.test.sql` via SQL editor | 20/20, nothing persisted |

## Manual run (tick each)

**Login and roles**
- [ ] Opening the page shows the yellow PREVIEW banner and the sign-in form.
- [ ] A wrong password shows “Invalid login credentials”.
- [ ] An account not on the allow-list is signed straight back out.
- [ ] Admin sees Data quality and the ClickUp sync panel.
- [ ] `preview.qa@` sees no sync panel, and Data quality says “Admins only”.
- [ ] `preview.pm@` cannot approve a sign-off item (the button does nothing and nothing is written).

**Loading data**
- [ ] Dashboard: Learners 12, Active enrolments 10, “2 learners unlinked”.
- [ ] Learners list shows masked IDs, and the Unlinked filter shows 2.
- [ ] QCTO Tracker shows 7 rows using the spreadsheet's status words.

**Create, edit, status transitions**
- [ ] Tracker: change one EISA Booking Status to “Booked”. The save dot goes green; reload and it stays.
- [ ] Moderation: move the stage to “Follow-up sent”. Reload and it stays.
- [ ] Visit: click a KMA score. The judgement and QCTO finding update; reload and they stay.
- [ ] Recommendation: Mark resolved. It moves to the Resolved filter.
- [ ] Data quality: “Same person” on Test Learner01. A “Learner merge” item appears in the Sign-off queue, and both learners still exist.
- [ ] Sign-off: Return without a comment is blocked. Return with a comment is saved. Approve records your name.

**Relationships and attachments**
- [ ] In ClickUp, a T4 Enrolment task has *Parent Record ID* = `programmes:<id>` and *Related Record* points to the T2 Programme task.
- [ ] A T15 Tracker task links to its T4 Enrolment task.
- [ ] Attachments: **not testable in the preview.** The FAM document bucket and sync worker were not copied (see the gap report).

**Outbox delivery to ClickUp**
- [ ] After the token is set, the sync panel moves Queued → Delivered within about 2 minutes.
- [ ] Every new task has *ApexOne Record ID* (`table:id`), *Record Type*, and *Schema Version* = `preview-v1`.
- [ ] No task appears in any live list, in Recruitment Candidates, or in the Monthly Recruitment Report space.

**Retry and error handling**
- [ ] Remove the token, then edit a tracker row. The panel shows Retrying, and after 5 attempts it is Quarantined.
- [ ] A task “Sync Exception: qcto_tracker:<id>” appears in T13 (once the token is back).
- [ ] As admin, `requeue_clickup_outbox(<id>)` puts it back to Queued, and it is then delivered.

**Report generation**
- [ ] DB level is covered by the tests: PM submits, PM cannot approve, admin requests changes with a note, and events, notification and outbox all fire.
- [ ] UI level is **not wired**. Keep using `report-generator.html` (see the gap report).

**Rollback**
- [ ] The DB test run leaves no rows behind (verified: sign-offs 1, reports 0).
- [ ] To remove the whole preview: delete the ClickUp folder “Z. Redesign Preview (TEST…)”, pause or delete the Supabase project `apexone-preview`, and delete the branch. Live is unaffected because nothing in it was changed.
