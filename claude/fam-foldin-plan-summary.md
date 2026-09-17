# FAM fold-in — plan approved, not yet implemented (2026-09-17)

Continuity note for a new chat. Repo: `Apex1-Consol/apex1-consol.github.io` (mirrored as `Apex1-Consol/ApexOne`). Supabase project: `nducwhlmudksgxggjrbo` ("apex-one"). Read this file first — do not re-explore the codebase or re-derive any of the below from scratch.

**Status: planning/review only this session. Zero code or DB changes were made. Start the next session by implementing Step 0, then Step 1, both below.**

## Prior work (already shipped, live, on `main` — do not redo)
- FAM document hardening (10MB/MIME limits, metadata columns, `app_kv_store` RLS, audit grant cleanup) — see `claude/fam-document-hardening-summary.md`.
- Versioned document replacement (admin-only "Replace", immutable history, `is_current`/`version`/`superseded_at`/`superseded_by` on `fam_documents`, RLS split into `tenant_select`/`tenant_insert`/`admin_update`) — see `claude/fam-versioning-and-foldin-summary.md`. Smoke-tested live, verified working.

## Step 0 — approved, do this first (small, independent of Step 1)
`fam_documents` currently GRANTs `DELETE` to both `anon` and `authenticated` (confirmed via `information_schema.table_privileges`), but has no `DELETE` RLS policy. Result: any delete attempt is silently RLS-filtered to 0 rows and returns `200` with an empty body — indistinguishable from success. Hit this personally during test-data cleanup last session.

Fix (apply as a migration to `nducwhlmudksgxggjrbo`):
```sql
revoke delete on public.fam_documents from authenticated, anon;
```
Leaves `service_role` untouched. After this, any delete attempt gets a real Postgres `permission denied` (42501) → PostgREST surfaces it as a genuine `403`. Zero behavior change for any real code path (nothing in the app calls delete on this table). Same shape as the `log_audit_event_kv` grant cleanup from the hardening session.

## Step 1 — approved: fold FAM into `index.html` as a namespaced, lazy-loaded tab

**Guardrails from Stav, both confirmed correct, incorporate exactly:**
1. **Keep `fam-registry.html` fully functional and untouched** until the new native tab has passed the full smoke test. Only then convert it to a redirect. The redirect must preserve the assessor id.
2. **Reuse the app's actual authenticated Supabase client** — do not assume a variable name, verify it. **Verified this session:** `index.html` line ~1858 does `window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`, and every other call site in the file (~10 of them) uses the bare global `supabase` (e.g. `supabase.auth.getSession()`). So inside the FAM namespace, use `const sb = supabase;` — matches the app's own convention.

**Redirect target format (also verified this session, don't reinvent):** `index.html` already has a deep-link convention at boot (~line 1968): `location.hash.match(/view=([a-z]+)/i)`, with an explicit comment: *"a page like programme-initiation.html can link to index.html#view=clients."* So:
- `fam-registry.html`'s eventual redirect stub should target `index.html#view=fam&assessor=<id>` (reading its own `?assessor=` param and translating it), not a new query-string scheme.
- The existing hash-parsing block in `index.html` needs a small extension to also read `assessor=(\d+)` from the hash and, after `switchTab('fam')`, call the FAM tab's own open-practitioner function with that id.

**Confirmed real name collisions** (grepped both files this session, not hypothetical): `index.html` already defines global `state`, `toast`, `escapeHtml`, `openModal`, `closeModal`, `switchTab`. `fam-registry.html` independently defines its own `state`, `toast`, `escapeHtml`, `openModal`, `closeModal` — these five *will* collide and must not both survive in global scope. `switchTab` exists only in `index.html` and should be *reused* by the FAM tab (call it, don't redefine it).

**Design (unchanged from what was reviewed and approved):**
1. Wrap all ported FAM code in an IIFE: `const FAM = (function(){ ...; return { openReplaceDocument, toggleDocHistory, openAssessor, ... }; })();`. Only functions referenced by inline `onclick="..."` in rendered HTML get exposed as `FAM.xxx` — everything else (state, toast, escapeHtml, openModal/closeModal equivalents, sb) stays inside the closure.
2. No second Supabase client, no separate login screen, no Turnstile widget in the ported tab — `index.html` already has an authenticated session by the time any tab renders.
3. New `#tab-fam` content section (index.html's existing tab-content pattern), containing the ported practitioner-registry + detail-panel markup only.
4. Nav rewire: "FAM Registry" nav item (desktop line ~723, mobile line ~811) changes from `onclick="openExternalApp('fam-registry.html')"` to `onclick="switchTab('fam')"`; drop the "↗ opens in new tab" visual affordance.
5. Badge deep-link rewire: `famStatusBadgeHtml()` in `index.html` currently builds `<a href="fam-registry.html?assessor=${id}" target="_blank">`. Becomes an in-page handler: `switchTab('fam')` then `FAM.openAssessor(id)`.
6. FAM data (`fam_seta_registrations`, `fam_documents`, `qualifications`, `fam_follow_ups`, `fam_registration_scope`) loads lazily on first `switchTab('fam')`, not at app boot.
7. FAM's CSS scoped under `#tab-fam` to avoid leaking into the rest of the stylesheet.
8. Only after the merged tab passes the full smoke test: turn `fam-registry.html` into the redirect stub described above (still don't delete it — it's the safety net if the tab has a problem post-merge).

**Branch mechanics (this session's constraint, confirmed, still true):** no git push, no GitHub API access for this repo in this environment (`add_repo` tool does not exist here). Only the GitHub web upload UI works. It has a "Create a new branch for this commit and start a pull request" radio option on the commit step — use that for this work, so it lands as a PR for review rather than a direct commit to `main` like the smaller prior fixes.

**Testing before calling Step 1 done:** full smoke test inside the merged tab (badge → in-page switch, add doc, replace doc, history toggle, signed download) plus a console-error check on a few of `index.html`'s *other* existing tabs, to catch any collision regression the merge might have introduced.

## Operational notes carried over from prior sessions (still true, don't re-derive)
- `Apex1-Consol/ApexOne` and `Apex1-Consol/apex1-consol.github.io` are the same content at the same HEAD.
- Check live Supabase state directly (`nducwhlmudksgxggjrbo`) rather than re-deriving from migration files in the repo.
- `git push` / GitHub API blocked this session; GitHub web upload UI (`https://github.com/<owner>/<repo>/upload/<branch>`) is the only write path. Uploading a file with the same name as an existing path there is recognized as a diff/replace, not a duplicate — a scare about a stray `fam-registry_4.html` this session turned out to be a stale sidebar cache, confirmed via a cache-busted `raw.githubusercontent.com` 404 check; no actual duplicate existed.
- Files handed to the browser's `file_upload` tool must live under `/mnt/user-data/uploads/` **and** be registered with `SendUserFile` first, even if written there directly with `Write`/`Bash` — otherwise `file_upload` refuses them.
- A DELETE against `fam_documents` returning HTTP 200 does **not** mean it worked — check row counts. (This is exactly what Step 0 above fixes going forward.)
