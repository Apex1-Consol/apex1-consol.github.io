-- Hand-over gate documents (2026-11-17).
-- Files attached to a hand-over gate live in public.programme_documents (doc_type 'gate_<id>') and the private
-- bucket 'programme-documents' under <tenant>/<programme_id>/<gate>/<file>. The PM reads them through the
-- existing pd_select / programme_docs_read policies.
-- Signed packs are frozen: no files can be added to or removed from a programme while any valid signature exists
-- (public.handoff_is_locked). While unlocked, the Programme Initiator may remove a file attached by mistake.

drop policy if exists pd_insert on public.programme_documents;
create policy pd_insert on public.programme_documents for insert to authenticated
  with check (tenant_id = public.auth_tenant_id()
    and (public.auth_is_admin() or public.auth_has_role('pi_specialist'))
    and (programme_id is null or not public.handoff_is_locked(programme_id)));

drop policy if exists pd_delete on public.programme_documents;
create policy pd_delete on public.programme_documents for delete to authenticated
  using (tenant_id = public.auth_tenant_id()
    and (public.auth_is_admin() or public.auth_has_role('pi_specialist'))
    and (programme_id is null or (doc_type like 'gate\_%' and not public.handoff_is_locked(programme_id))));

drop policy if exists programme_docs_insert on storage.objects;
create policy programme_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'programme-documents'
    and (storage.foldername(name))[1] = public.auth_tenant_id()
    and (public.auth_is_admin() or public.auth_has_role('pi_specialist'))
    and case when (storage.foldername(name))[2] ~ '^[0-9]+$'
             then not public.handoff_is_locked(((storage.foldername(name))[2])::bigint) else true end);

-- A file can only be removed once its programme_documents row is gone (that delete carries the lock check).
drop policy if exists programme_docs_delete on storage.objects;
create policy programme_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'programme-documents'
    and (storage.foldername(name))[1] = public.auth_tenant_id()
    and (public.auth_is_admin() or public.auth_has_role('pi_specialist'))
    and not exists (select 1 from public.programme_documents d where d.file_path = objects.name));

-- The lock check runs inside the policies above as the signed-in user.
grant execute on function public.handoff_is_locked(bigint) to authenticated;
