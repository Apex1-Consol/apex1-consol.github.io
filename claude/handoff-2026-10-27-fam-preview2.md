# Handoff: 2026-10-27 (FAM preview, part 2)

## Working rule (read first)
Use the fewest tokens and credits possible on every task.
- Grep first and read only the lines you need. Never read all of `index.html` (~800 KB), `fam-registry.html`, `preview/fam.js` (~950 lines) or whole docs.
- No subagents, no extended web search, no AI/Gemini test calls unless the user asks.
- Batch browser actions. Use a JS check instead of a screenshot when that does the job.
- Make targeted edits only, never full rewrites. Don't re-verify things already confirmed.
- Keep replies short, with no recaps. Ask one short question when a spec is missing instead of guessing big.
- The sandbox cannot reach `*.github.io`, so ask the user to check live pages.

## Quick reference
- Repo: `Apex1-Consol/apex1-consol.github.io`. Work goes straight to `main` (preview files only). `feat/apexone-redesign-preview` is old (3a4de16) and not used for this work.
- Preview: https://apex1-consol.github.io/preview/ talks only to Supabase `apexone-preview`. The live app (`/index.html`, project `apex-one`) is untouched.
- FAM code: `preview/fam.js`. Tests: `cd preview/tests && node page.test.js`. Run `npm i` first if `node_modules` is missing. **47 pass.**
- Test fixtures live in the `DATA` object at the top of `page.test.js`. For a one-off case, swap a table inside `try/finally`. `boot(sess, { ls: {...} })` seeds localStorage.
- Commits end with the Co-Authored-By and Claude-Session lines.
- `handoff-2026-10-27-triage4.md` (the original triage list and earlier open items) is **not in the repo**. It is on the user's computer. Ask for it before working on "older open items".

## Done today (main 4be41f3 → 173e59f)
1. **KPI / strip / pill overlap (item 2).**
   - Triage view hides the "Registrations" KPI group; the triage summary pills lead. Table view keeps that group.
   - Switching to triage clears a registration filter (`REGK`, `famMode` now calls `render()`).
   - The strip lost its "expired registrations" link.
2. **Remembered filters (item 6).**
   - localStorage key `famFilters.v1` holds filter, fRole, fSt, fSeta, view, hideTest and the collapsed groups.
   - Search text is not saved. Bad JSON is ignored.
   - Implemented as `LSK`/`LSF`/`saveF()` just after `S`, called at the top of `renderRows()`. The selects got ids `famdd-role` and `famdd-st`.
3. **Claimed by me (item 7).** A new practitioner KPI and filter, key `mine`, built on `mineFU()`: open follow-ups that are "In Progress" with `assigned_to === me()`.
4. **"+n to capture" (item 8).**
   - The Mixed status pill (table view) adds "+n to capture" when its leading label is expired or due.
   - Triage rows add the same text after the expiry line when the row's group isn't "Not captured".
5. **Empty 90-day strip** collapses to one line ("nothing due"), with class `famstrip0`.

Items 6, 7 and 8 were built from the code without the triage4 spec, so the user should confirm they match the intent.

## Next
1. The user checks /preview/ for the changes above.
2. Older open items from triage4: get the file from the user first.
3. Carried over from the 2026-10-23 handoff (`claude/handoff-2026-10-23-fam-preview.md`), unless already done:
   - preview DB migration and FAM end-to-end test;
   - Scope Import on the preview;
   - decisions on the navy token, the QUAL label and retiring the standalone page;
   - PRs #61, #16, #9 and #11, as listed there.
