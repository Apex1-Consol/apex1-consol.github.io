-- Preview only (project apexone-preview). Never run on apex-one.
-- Bucket + storage policies mirror live; test data is all [TEST] and removable with the cleanup below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fam-documents', 'fam-documents', false, 10485760, array['application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'])
on conflict (id) do nothing;
drop policy if exists fam_documents_tenant_read on storage.objects;
drop policy if exists fam_documents_tenant_write on storage.objects;
drop policy if exists fam_documents_tenant_update on storage.objects;
create policy fam_documents_tenant_read on storage.objects for select
  using (bucket_id = 'fam-documents' and auth.role() = 'authenticated' and (storage.foldername(name))[1] = auth_tenant_id());
create policy fam_documents_tenant_write on storage.objects for insert
  with check (bucket_id = 'fam-documents' and auth.role() = 'authenticated' and (storage.foldername(name))[1] = auth_tenant_id());
create policy fam_documents_tenant_update on storage.objects for update
  using (bucket_id = 'fam-documents' and auth.role() = 'authenticated' and (storage.foldername(name))[1] = auth_tenant_id());

do $$
declare t text := 'apex-preview'; a4 bigint; a5 bigint; a6 bigint; a7 bigint; old_id bigint; new_id bigint; r2 bigint; r3 bigint;
begin
  if exists (select 1 from fam_seta_registrations where tenant_id = t) then return; end if;
  insert into assessors (tenant_id, full_name, role, email) values (t, '[TEST] Pending Four', 'Assessor', 'test4@example.invalid') returning id into a4;
  insert into assessors (tenant_id, full_name, role, email) values (t, '[TEST] Inactive Five', 'Facilitator', 'test5@example.invalid') returning id into a5;
  insert into assessors (tenant_id, full_name, role, email) values (t, '[TEST] Unregistered Six', 'Facilitator', 'test6@example.invalid') returning id into a6;
  insert into assessors (tenant_id, full_name, role, email) values (t, '[TEST] Mixed Seven', 'Assessor', 'test7@example.invalid') returning id into a7;

  insert into fam_seta_registrations (tenant_id, assessor_id, seta_name, role, roles, registration_number, registration_expiry_date, status) values
    (t, 1, 'ETDP SETA', 'Facilitator', array['Facilitator'], 'TEST-001', current_date + 400, 'Active');
  insert into fam_seta_registrations (tenant_id, assessor_id, seta_name, role, roles, registration_number, registration_expiry_date, status)
    values (t, 2, 'MICT SETA', 'Assessor', array['Assessor'], 'TEST-002', current_date + 21, 'Active') returning id into r2;
  insert into fam_seta_registrations (tenant_id, assessor_id, seta_name, role, roles, registration_number, registration_expiry_date, status)
    values (t, 3, 'ETDP SETA', 'Moderator', array['Moderator','Assessor'], 'TEST-003', current_date - 12, 'Active') returning id into r3;
  insert into fam_seta_registrations (tenant_id, assessor_id, seta_name, role, roles, registration_number, registration_expiry_date, status) values
    (t, 2, 'Services SETA', 'Assessor', array['Assessor'], 'TEST-004', current_date + 50, 'Active'),
    (t, a4, 'Pending Entry', 'Assessor', array['Assessor'], null, null, 'Pending Entry'),
    (t, a5, 'AgriSETA', 'Facilitator', array['Facilitator'], 'TEST-005', null, 'Inactive'),
    (t, a7, 'MICT SETA', 'Assessor', array['Assessor'], 'TEST-006', current_date + 300, 'Active'),
    (t, a7, 'ETDP SETA', 'Assessor', array['Assessor'], 'TEST-007', current_date - 40, 'Active');

  -- Practitioner 1 fully compliant (6 of 6), with a replaced CV for the history view.
  insert into fam_documents (tenant_id, assessor_id, doc_type, status, doc_date, is_current, version, notes)
    values (t, 1, 'CV', 'Current', current_date - 400, false, 1, '[TEST] old version') returning id into old_id;
  insert into fam_documents (tenant_id, assessor_id, doc_type, status, doc_date, is_current, version, notes)
    values (t, 1, 'CV', 'Current', current_date - 20, true, 2, '[TEST] no file attached') returning id into new_id;
  update fam_documents set superseded_at = now() - interval '20 days', superseded_by = new_id where id = old_id;
  insert into fam_documents (tenant_id, assessor_id, doc_type, status, doc_date, is_current, version, notes)
    select t, 1, d, 'Current', current_date - 30, true, 1, '[TEST] no file attached'
    from unnest(array['ID','Highest Qualification','QUAL','SLA','AFFIDAVIT']) d;
  insert into fam_documents (tenant_id, assessor_id, doc_type, status, doc_date, is_current, version, notes) values
    (t, 2, 'CV', 'Current', current_date - 90, true, 1, '[TEST] no file attached'),
    (t, 2, 'ID', 'Current', current_date - 90, true, 1, '[TEST] no file attached'),
    (t, 2, 'SLA', 'Missing', null, true, 1, '[TEST]'),
    (t, 3, 'ID', 'Missing', null, true, 1, '[TEST]'),
    (t, a7, 'CV', 'Current', current_date - 10, true, 1, '[TEST] no file attached');

  insert into fam_follow_ups (tenant_id, assessor_id, source_type, source_id, kind, status, assigned_to, notes, created_by) values
    (t, 2, 'registration', r2, 'due_30', 'In Progress', 'test-admin@example.invalid', '[TEST] Renewal form requested', 'test-admin@example.invalid'),
    (t, 3, 'registration', r3, 'expired', 'Open', null, '[TEST]', 'test-admin@example.invalid');
  insert into fam_follow_ups (tenant_id, assessor_id, source_type, source_id, kind, status, notes, created_by, resolved_at, resolved_by)
    select t, 2, 'document', id, 'missing_doc', 'Dismissed', '[TEST] SLA not needed for this provider', 'test-admin@example.invalid', now(), 'test-admin@example.invalid'
    from fam_documents where tenant_id = t and assessor_id = 2 and doc_type = 'SLA';
end $$;

-- CLEANUP (run manually to reset; keeps the three original [TEST] practitioners):
-- delete from fam_follow_ups where tenant_id = 'apex-preview';
-- delete from fam_registration_scope where tenant_id = 'apex-preview';
-- update fam_documents set superseded_by = null where tenant_id = 'apex-preview';
-- delete from fam_documents where tenant_id = 'apex-preview';
-- delete from fam_seta_registrations where tenant_id = 'apex-preview';
-- delete from assessors where tenant_id = 'apex-preview' and id > 3 and full_name like '[TEST]%';
-- delete from storage.objects where bucket_id = 'fam-documents' and name like 'apex-preview/%';
