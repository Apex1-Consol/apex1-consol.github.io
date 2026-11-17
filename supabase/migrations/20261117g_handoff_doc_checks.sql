-- Automatic document checks on hand-over evidence (advice only; Compliance still verifies).
-- Stores ONLY the verdict, reason, method and time. Never the document text. Organisational gates only.
create table if not exists public.handoff_doc_checks (
  id bigserial primary key,
  tenant_id text not null default coalesce(public.auth_tenant_id(), 'apex-academy'),
  programme_id bigint not null,
  gate text not null check (gate ~ '^(c[123]|q[1-4]|w[124]|d[1345]|s[146])$'),
  document_id bigint references public.programme_documents(id) on delete cascade,
  verdict text not null check (verdict in ('ok', 'check')),
  reason text,
  method text not null check (method in ('rules', 'rules+free-ai')),
  checked_at timestamptz not null default now(),
  checked_by text
);
create index if not exists handoff_doc_checks_prog on public.handoff_doc_checks (programme_id, gate, checked_at desc);
alter table public.handoff_doc_checks enable row level security;
drop policy if exists hdc_select on public.handoff_doc_checks;
create policy hdc_select on public.handoff_doc_checks for select to authenticated
  using (tenant_id = public.auth_tenant_id() and exists (select 1 from public.programme_documents d where d.id = document_id));
revoke insert, update, delete on public.handoff_doc_checks from anon, authenticated;
grant select on public.handoff_doc_checks to authenticated;
