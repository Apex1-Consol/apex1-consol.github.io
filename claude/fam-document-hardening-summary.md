# FAM document hardening — session summary (2026-09-17)

Continuity note for the next session, same pattern as `claude/turnstile-and-recovery-fix-summary.md`. Repo: `Apex1-Consol/apex1-consol.github.io` (mirrored as `Apex1-Consol/ApexOne` — same content, same HEAD). Supabase project: `nducwhlmudksgxggjrbo` ("apex-one").

## State as of this session

`main` is at `925d8b8` (merge of PR #8, `hardening/fam-document-limits-metadata`). Repo and live Supabase are reconciled — every migration below was applied directly to the live project first, then committed to the repo as a record. Verified live in this session:

- `fam_documents` table has the new columns (`file_name`, `file_size_bytes`, `mime_type`, `uploaded_by`, `uploaded_at`).
- `fam-documents` storage bucket has `file_size_limit = 10485760` (10 MB) and `allowed_mime_types` restricted to PDF, Word (`.doc`/`.docx`), JPEG, PNG.
- `app_kv_store` RLS policies are split as below (no more blanket `authenticated_all`).
- `log_audit_event_kv()` EXECUTE grant is down to `service_role` and `postgres` only.

## The three fixes shipped and verified this session

**1. `app_kv_store` RLS hardening** (`supabase/migrations/20260917083000_harden_app_kv_store_rls.sql`)
The table previously had one blanket `authenticated_all` policy (ALL commands, `qual`/`with_check = true`), so any authenticated user — any role — could delete or overwrite every row, including the `programmes-v2` blob holding every uploaded programme-initiation document (base64-embedded). The browser app (`programme-initiation.html`'s `window.storage` shim) only ever calls `.get()`/`.set()` → SELECT/INSERT/UPDATE, never DELETE. Fix: dropped the blanket policy, replaced with separate SELECT/INSERT/UPDATE policies open to any authenticated user (unchanged behavior) plus a DELETE policy gated on `auth_is_admin()`. Closes "any logged-in user can wipe all programme data" with zero behavior change for the app's actual usage pattern.

**2. FAM document upload size/type limits + metadata** (`supabase/migrations/20260917084000_harden_fam_documents_bucket_limits.sql`, plus `fam-registry.html` changes in the same PR)
The `fam-documents` bucket had no `file_size_limit` or `allowed_mime_types` — nothing stopped an oversized or arbitrary-type upload except client code that didn't check either. Fix applied at both layers:
- Storage layer: bucket now enforces 10 MB limit and an allow-list (PDF, `.doc`/`.docx`, JPEG, PNG), so this holds even if the storage API is called directly, bypassing the UI.
- Client layer (`fam-registry.html`): file input now has an `accept` filter and a caption; `validateDocumentFile()` checks size and MIME type before upload (falling back to extension check when `file.type` is blank, which some browsers/OSes do); `uploadDocumentFile()` calls it first.
- Metadata: `fam_documents` rows now also record `file_name`, `file_size_bytes`, `mime_type`, `uploaded_by` (uploader's email, read via `sb.auth.getUser()`), and `uploaded_at` alongside `file_url`.

**3. `log_audit_event_kv` grant cleanup** (`supabase/migrations/20260917084500_revoke_log_audit_event_kv_execute.sql`)
Security advisor flagged this SECURITY DEFINER trigger function (fires via `trg_audit_log` on `app_kv_store`) as executable by `anon`/`authenticated` because EXECUTE was granted to PUBLIC. Verified live before changing anything: PostgREST doesn't expose it over `/rest/v1/rpc` at all (calling as `anon` returns `PGRST202`, because PostgREST excludes functions returning the trigger pseudo-type from its API surface) — so there was no real-world exposure. Trigger execution itself doesn't require EXECUTE privilege on the function (the trigger mechanism invokes it directly, independent of grants). Fix: revoked EXECUTE from `public`/`anon`/`authenticated`. Verified live afterward that `trg_audit_log` on `app_kv_store` still fires correctly. Pure hygiene, zero functional impact.

## Explicitly deferred — do not pick up unless asked

The programme-initiation Storage migration (moving the base64-embedded documents currently stored inside the `app_kv_store` `programmes-v2` blob into actual Supabase Storage objects) is a known, separate piece of work and was **intentionally left alone** this session. Do not start it, plan it, or mention it as overdue unless the user explicitly raises it.

## Only real next-action item: FAM upload replacement/version history

Not started, not committed to. Only worth building if the actual workflow needs it — ask these scoping questions before writing any code or migration:
- Should re-uploading a document for the same `doc_type`/assessor replace the existing row, or keep both as version history?
- If versioned, does anyone need to see/download prior versions, or is it just an audit trail?
- Does the 10 MB / MIME allow-list from this session's hardening need to change for this feature, or stay as-is?
- Any retention requirement (e.g. auto-expire old versions) or is storage growth not a concern yet?

Get answers before building — this could be a one-column change (`replace on conflict`) or a real versioning table, and guessing wrong wastes a round trip.

## Efficiency notes for the next session

- **Don't re-clone or re-explore the repos from scratch.** This session already confirmed `Apex1-Consol/ApexOne` and `Apex1-Consol/apex1-consol.github.io` are the same content at the same HEAD (`925d8b8`). Start from that fact.
- **`git push` to these repos is unreliable in this environment** — it hung/failed in a prior session. If a push doesn't complete within one attempt, don't retry it repeatedly; go straight to the GitHub web-UI upload/edit workaround instead.
- **Check live Supabase state directly** (via the Supabase MCP tools, project `nducwhlmudksgxggjrbo`) rather than re-deriving current state from the repo's migration files — migrations here are applied live first and committed as a record afterward, so the repo can lag by one session if something wasn't yet written back.
