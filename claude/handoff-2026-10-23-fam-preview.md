# Handoff: 2026-10-23 (FAM preview)

## Working rule (read first)
Use the fewest tokens and credits possible on every task.
- Grep first and read only the lines you need. Never read all of `index.html` (~800 KB), `fam-registry.html` or whole docs.
- No subagents, no extended web search, no AI/Gemini test calls unless the user asks.
- Batch browser actions. Use a JS check instead of a screenshot when it does the job.
- Targeted edits only, never full rewrites. Don't re-verify things already confirmed.
- Short replies, no recaps.
- The sandbox cannot reach `*.github.io`; ask the user to check live pages.

## Done today
1. **FAM duplication check** (read-only). The standalone `fam-registry.html` and the FAM IIFE in `index.html` (lines ~10649–11505) use the same Supabase project, key, tables and Turnstile key. The 50 core functions are copied, and only 14 of 46 bodies are still near-identical, so the two are drifting.
   - Only in ApexOne: the AI digest and summary, the completeness score, the `#view=fam&assessor=` deep link, and Bulk Intake (PR #61).
   - Password recovery differs: the standalone uses a link, ApexOne uses an OTP code.
   - Nothing in the app links to the standalone.
   - The IIFE header comment saying Scope Import was "not ported" is stale; it has been ported.
   - **Recommendation (awaiting the user's choice):** retire the standalone page and redirect it to `index.html#view=fam`.
2. **FAM screen in the redesign preview built out.** Branch `feat/apexone-redesign-preview`, commit `3ef1b3f`.
   - New `preview/fam.js`, hooked in through `window.previewFam` in `live.js` `applyAll()` and loaded with a script tag after `qa.js`.
   - KPIs: Practitioners, Registrations, Active, Expired, Due ≤30, Due 31–60, Pending, Inactive, Missing docs, Open follow-ups. Clicking one filters the list.
   - Search box, plus the columns SETA coverage, Documents, Status and Next action.
   - Status and risk rules are copied from `fam-registry.html`.
   - Side panel: registrations with risk badges, follow-ups (claim, note, dismiss, reopen), and a versioned document checklist. Upload, view by signed URL, replace (admins only) and history all work. Non-admin re-uploads add a newer version.
   - Add practitioner and add registration forms work.
   - Tests: `preview/tests/page.test.js` has 3 new FAM tests and all 38 pass (`cd preview/tests && npm i && node page.test.js`). `xlsx` was added to the test dependencies.
3. **Preview hosted at https://apex1-consol.github.io/preview/** (commit `9df2ebf` on `main`). Only the page files are there. Migrations, adapter and tests stay on the branch. The live app is untouched. The user chose this instead of the githack proxy.

## Open / blocked
- **Preview DB migration is not applied.** The user cancelled the approval twice and then said "go". The file is `preview/migrations/2026-10-23_fam_preview.sql` on the branch. It does two things in the `apexone-preview` project (`qszikynltvyplzqootrc`):
  - creates the private `fam-documents` bucket and its tenant storage policies, mirroring live;
  - adds `[TEST]` data: 4 extra practitioners, 8 registrations covering every status, documents including a replaced version, and 3 follow-ups. Cleanup SQL is at the bottom of the file.
  - Without it, uploads fail and only the 3 bare `[TEST]` people show.
  - Apply it with the user's approval, or have the user paste it into the SQL editor.
- **Two copies of the preview.** The copy on `main` must be refreshed whenever `preview/` changes on the branch. Copy only `index.html`, the `*.js` files, `assets/` and `README.md`.

## Next (in order)
1. Get the migration applied, then the user runs the FAM end-to-end test on `/preview/`:
   - add a practitioner;
   - add a registration (the role check should block a save with no role);
   - upload a PDF, view it, replace it as admin, and check that the history shows;
   - claim, note, dismiss and reopen a follow-up;
   - use the KPI filters;
   - check the statuses: No registrations, Expired, Mixed and Needs review.
2. Scope Import on the preview (needs the qualification catalogue). Bulk Intake waits for PR #61.
3. Decisions for the user:
   - the whole preview uses indigo `--navy:#25247B` instead of brand `#002C5B` (one-line token fix that affects every screen);
   - what the "QUAL" document label should say;
   - whether to retire the standalone page.
4. Carried over: merge PR #61, then run its 5-item checklist; PR #16 review; the generateDocExtract pg_net check ("Charles Chamusi" not "Assessor 30"); PR #9 untouched; PR #11 parked (do not merge); then Dashboard AI → smaller tabs → smart_write UI last.
5. AI compliance summary in the preview stays disabled until a paid Gemini tier is on (POPIA rules in the 2026-10-20 handoff).

## Notes
- The repo moved to `Apex1-Consol/apex1-consol.github.io`. Pushes still work through the redirect.
- The redesign mock `claude/apexone-redesign.html` is not in the repo; it's on the user's computer.
