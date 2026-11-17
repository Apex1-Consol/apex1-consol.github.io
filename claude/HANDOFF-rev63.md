ApexOne handoff — 2026-11-17 (rev63) — START HERE

Supersedes rev62 for everything below. rev62 (Project doc claude/HANDOFF-rev62.md) is still the reference for older detail (brand shell, logo, QA/delivery screens, Programme Initiation standalone files); grep it, never read it whole.

WORKING RULE (every task, no exceptions; the user has asked for this repeatedly, again on 2026-11-17): USE THE FEWEST TOKENS AND CREDITS POSSIBLE. Cheapest path first: one targeted grep or SQL query beats reading; batch related checks into one call; one patch script per change; no tests, screenshots, subagents, extended search, image search or AI calls unless the change needs them or the user asks. Never read whole files (preview/index.html, handover.js ~48 KB, today.js ~42 KB, shell.js, qa.js, delivery.js) — grep, then read only the lines needed. Short replies, no recaps, at most one question. Don't redo anything this handoff records as done.

WHAT CHANGED SINCE rev62 (found 2026-11-17)
- The redesign is now on main of repo Apex1-Consol/apex1-consol.github.io, served by GitHub Pages at /preview/ (the user's URL: https://apex1-consol.github.io/preview/index.html) and a near-copy at /next/ (has next-gate.js; index.html and today.js differ from preview/, other files mostly the same). Push to main = live immediately.
- Both pages talk to the LIVE Supabase project apex-one (ref nducwhlmudksgxggjrbo), not apexone-preview. Real people use it. Read-only SQL via the Supabase MCP works. Writes: the user lets me run SQL in their Chrome (Claude in Chrome) in the Supabase SQL editor; load the SQL into Monaco with fetch from raw.githubusercontent.com/<commit>/<path> + monaco.editor.getModels()[0].setValue(t), click Run, confirm "Run query" on the destructive-ops warning. Commit the .sql to supabase/migrations/ first.
- Many new modules in preview/: handover.js (programme hand-over/sign-off), today.js (My work blocks), admin.js, reports.js, fam.js, famcu.js, desk.js, progdocs.js, pager.js, ava*.js, autofill.js, scope-catalogue.js, inbox.js (new, below). Script tags carry ?v= cache-busters: bump the one you change.
- Push clone: add_repo access push, then git clone --depth 1 to /home/claude/apex1-consol.github.io; commit as Stavros <stavros@apexu.co.za>; push with git -c push.negotiate=true push origin HEAD:main.

HAND-OVER CHAIN (live DB)
- Tables handoff_signoffs (programme_id, status, pi_user, compliance_user, ops_user uuids, details jsonb incl. pm_email, version), handoff_signatures (role, signer_email, record_hash, invalidated_*), handoff_events (audit, actor_email), handoff_records (PDF + ClickUp after hand-over), plus gates/risks/verifications/fields/sources.
- Status flow (handoff_sign): preparing → with_compliance (pi signs) → with_operations (compliance signs) → handed_over (ops signs; sets programmes.status='handed_over', handed_over_to_email = details.pm_email, enqueues clickup_sync_outbox). handoff_unlock(reason) invalidates signatures → preparing (or reopened if handed_over). handoff_assign sets <step>_user. Page calls everything through act() in handover.js.
- Ayanda's test hand-over: programme 896 (SAQA 59201 Generic Management NQF 5), 41 events on 2026-11-17 from 13:25, she signed as Programme Initiator at 13:53 (first try blocked by the typed-name check, which works). Status with_compliance, compliance_user = Stavros, ops_user = Dolores. Evidence links are junk test values (ClickUp marketing URL, "https/sdfg"); user says some fields will be removed, don't worry about the data.
- Never tested yet: compliance and ops signatures, the final hand-over (PDF in storage, ClickUp task, PM). Next step is the user signing 896 as Compliance, then Dolores as Head of Ops.
- Gaps noticed (not fixed, user deprioritised): evidence fields accept any text, not only URLs; programme record had no name in details.

IN-APP NOTIFICATIONS FOR THE HAND-OVER CHAIN (built 2026-11-17, commit a7121e0, SQL run on live 15:03, verified)
- No email, by the user's decision. Deliberately NOT in reports.notifications: that table's trigger notify_poke → reports.notify_kick → report-notify edge function (email).
- Migration supabase/migrations/20261117_handoff_inbox.sql: table public.user_inbox (recipient uuid, kind handoff_sign|handoff_returned|handoff_received, action bool, programme_id, title, detail, link 'handover/<id>', done_at). RLS: read/update own rows; authenticated may update done_at only. Trigger trg_handoff_inbox (security definer handoff_inbox_trg) on handoff_signoffs insert/update of status/compliance_user/ops_user: closes open handoff_sign items for the programme, then notifies with_compliance → compliance_user, with_operations → ops_user, handed_over → user with email details.pm_email (info), preparing/reopened after a signed state → pi_user with the invalidation reason (info). Skips telling people about their own action for info items. Backfill created the item for 896 → stavros@.
- Client preview/inbox.js and next/inbox.js (loaded after handover.js): reads user_inbox where done_at is null; window.AO_BELL feeds the bell (renderBell now merges AO_BELL + BELL_FAM; famBell sets window.BELL_FAM; bellRead covers both); "Waiting for you" card inserted at the top of #view-mywork (#aoInbox); refresh on sign-in, every 60 s, on hashchange, and 0.8 s after any handover.js act(); opening #handover/<id> sets done_at on that programme's info items. Only a node --check was run; user to confirm in the browser.
- Agreed next (only on the user's go): extend the same pattern to other chains (sign-off queue merges/visits/recs, reports submitted/returned, SoR issued → PM); maybe one reminder after 2 working days; email later.

OTHER STATE
- Project "Programme Initiation System" docs: claude/programme-initiation-apexone.html (management standalone version), REVIEW copy, handoffs rev60–63. The standalone file is browser-only (localStorage); the live hand-over flow is now handover.js on the live DB.
- apexone-preview Supabase project (qszikynltvyplzqootrc) and its ClickUp TEST folder still exist; the pages no longer use it.
- Live ClickUp/outbox: the hand-over enqueues to clickup_sync_outbox on live — real ClickUp lists. Treat test hand-overs with care.

NEXT
1. User reloads the page, checks the bell/My work item, signs 896 as Compliance; confirm Dolores's item appears (one query: select ... from user_inbox where programme_id=896).
2. Dolores signs; check handed_over, PM item, handoff_records (PDF/ClickUp) and outbox for errors.
3. Fix only what they report. Then, on go, extend notifications to other chains.
