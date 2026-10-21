-- Database tests for the preview project. Everything runs inside one transaction and is
-- ROLLED BACK at the end, so running it leaves no trace (this is also the rollback test).
-- Each check raises on failure; a clean run returns 'ALL DB TESTS PASSED'.
create temp table _r(n int generated always as identity, test text, ok boolean) on commit drop;
grant all on _r to authenticated;
create or replace function pg_temp.as_user(email text, roles text[], tenant text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('email',email,'role','authenticated','app_metadata',json_build_object('role',roles,'tenant',tenant))::text, true) $$;

-- 1 tenant isolation: a user from another tenant sees nothing
select pg_temp.as_user('outsider@x.test', array['admin'], 'other-tenant'); set local role authenticated;
insert into _r(test,ok) select 'tenant isolation: other tenant sees 0 learners', count(*)=0 from learners;
reset role;

-- 2 admin sees all preview learners
select pg_temp.as_user('stavros@apexu.co.za', array['admin'], 'apex-preview'); set local role authenticated;
insert into _r(test,ok) select 'admin sees all learners', count(*)=12 from learners;

-- 3 tracker status write is accepted with the spreadsheet words and captured in outbox + audit
do $$ declare n0 int; a0 int; begin
  select count(*) into a0 from audit_log;
  update qcto_tracker set eisa_booking_status='Booked' where id=(select min(id) from qcto_tracker);
  insert into _r(test,ok) values ('tracker write audited', (select count(*) from audit_log) > a0);
end $$;
reset role;
insert into _r(test,ok) select 'tracker write queued in outbox', exists(select 1 from clickup_sync_outbox where source_table='qcto_tracker' and operation='UPDATE' and payload->>'eisa_booking_status'='Booked');
set local role authenticated;

-- 4 wrong status word is rejected (keeps spreadsheet vocabulary exact)
do $$ begin
  begin update qcto_tracker set sor_status='Done' where id=(select min(id) from qcto_tracker); insert into _r(test,ok) values ('bad tracker status rejected', false);
  exception when check_violation then insert into _r(test,ok) values ('bad tracker status rejected', true); end;
end $$;

-- 5 merge request: creates a sign-off item, merges nothing
do $$ declare s signoff_items; n int; begin
  select count(*) into n from learners;
  s := request_learner_merge(array(select id from learners where last_name='Learner01' order by id), 'test');
  insert into _r(test,ok) values ('merge request lands in sign-off queue', s.kind='Learner merge' and s.status='waiting');
  insert into _r(test,ok) values ('merge request deletes no learner', (select count(*) from learners)=n);
end $$;

-- 6 sign-off: return needs a comment; approve works for admin
do $$ declare s signoff_items; begin
  begin perform signoff_decide((select min(id) from signoff_items), 'returned', null); insert into _r(test,ok) values ('return without comment refused', false);
  exception when check_violation then insert into _r(test,ok) values ('return without comment refused', true); end;
  s := signoff_decide((select min(id) from signoff_items), 'approved', null);
  insert into _r(test,ok) values ('admin approve recorded with name', s.status='approved' and s.decided_by='stavros@apexu.co.za');
end $$;
reset role;

-- 7 PM cannot sign off and cannot see data-quality view rows
select pg_temp.as_user('preview.pm@apexu.co.za', array['project_manager'], 'apex-preview'); set local role authenticated;
do $$ begin
  begin perform signoff_decide((select min(id) from signoff_items), 'approved', null); insert into _r(test,ok) values ('PM sign-off refused', false);
  exception when insufficient_privilege then insert into _r(test,ok) values ('PM sign-off refused', true); end;
end $$;
insert into _r(test,ok) select 'PM sees no data-quality rows', count(*)=0 from v_learner_data_quality;
insert into _r(test,ok) select 'PM can read the outbox (ops view)', count(*)>0 from clickup_sync_outbox;
do $$ begin
  begin insert into clickup_sync_outbox(event_key,source_table,source_record_id,operation) values ('x','x','1','INSERT'); insert into _r(test,ok) values ('browser cannot write the outbox', false);
  exception when insufficient_privilege then insert into _r(test,ok) values ('browser cannot write the outbox', true); end;
end $$;
reset role;

-- 8 QA role: can update moderation stage, cannot touch programmes it does not own beyond RLS
select pg_temp.as_user('preview.qa@apexu.co.za', array['qa_specialist'], 'apex-preview'); set local role authenticated;
do $$ declare n int; begin
  update moderation_items set stage='Follow-up sent' where sheet='External moderation'; get diagnostics n = row_count;
  insert into _r(test,ok) values ('QA can move a moderation stage', n=1);
end $$;
insert into _r(test,ok) select 'QA cannot read the outbox', count(*)=0 from clickup_sync_outbox;
reset role;

-- 9 programme lifecycle: PM cannot skip the hand-over sign-off
select pg_temp.as_user('preview.pm@apexu.co.za', array['project_manager'], 'apex-preview'); set local role authenticated;
do $$ begin
  begin insert into programmes(tenant_id,programme_name,status) values ('apex-preview','x','active'); insert into _r(test,ok) values ('PM cannot create an active programme', false);
  exception when others then insert into _r(test,ok) values ('PM cannot create an active programme', true); end;
end $$;
reset role;

-- 10 report workflow: PM submits, cannot approve own report; admin can
select pg_temp.as_user('preview.pm@apexu.co.za', array['project_manager'], 'apex-preview'); set local role authenticated;
insert into reports.reports(tenant_id,programme_id,month,client_name_snapshot,programme_name_snapshot) select 'apex-preview', min(id), '2026-10','[TEST] Client A','[TEST] Programme' from programmes;
do $$ begin
  begin perform reports.transition_report((select max(id) from reports.reports),'approved',null); insert into _r(test,ok) values ('PM cannot approve own report', false);
  exception when insufficient_privilege then insert into _r(test,ok) values ('PM cannot approve own report', true); end;
end $$;
reset role;
select pg_temp.as_user('stavros@apexu.co.za', array['admin'], 'apex-preview'); set local role authenticated;
do $$ declare r reports.reports; begin
  r := reports.transition_report((select max(id) from reports.reports),'needs_changes','Please add attendance');
  insert into _r(test,ok) values ('admin requests changes with a note', r.status='needs_changes');
end $$;
reset role;
insert into _r(test,ok) select 'report events + notification + outbox written',
  exists(select 1 from reports.report_events where to_status='needs_changes') and exists(select 1 from reports.notifications where type='needs_changes') and exists(select 1 from clickup_sync_outbox where source_table='reports');

-- 11 outbox is idempotent by event_key
do $$ declare n int; begin
  insert into clickup_sync_outbox(event_key,source_table,source_record_id,operation) values ('dup-key','x','1','INSERT') on conflict (event_key) do nothing;
  insert into clickup_sync_outbox(event_key,source_table,source_record_id,operation) values ('dup-key','x','1','INSERT') on conflict (event_key) do nothing;
  select count(*) into n from clickup_sync_outbox where event_key='dup-key';
  insert into _r(test,ok) values ('outbox idempotent by event_key', n=1);
end $$;

-- 12 EISA windows + LEISA tables: QA writes (audited); operations and PM cannot; anon cannot read
-- (QA cannot read audit_log, so the audit count is taken as the owner before and after)
create temp table _a on commit drop as select count(*) n from audit_log where table_name='leisa_learner';
select pg_temp.as_user('preview.qa@apexu.co.za', array['qa_specialist'], 'apex-preview'); set local role authenticated;
do $$ declare n int; begin
  insert into eisa_windows(label,eisa_date,registration_closing) values ('[TEST] window','2027-06-10','2027-04-29');
  insert into _r(test,ok) values ('QA can add an EISA window', true);
  update leisa_settings set compiler_name='Test Compiler QA'; get diagnostics n = row_count;
  insert into _r(test,ok) values ('QA can edit LEISA settings', n>=1);
  update leisa_learner set fields = fields || '{"LearnerCellPhoneNumber":"0820000000"}' where id=(select min(id) from leisa_learner); get diagnostics n = row_count;
  insert into _r(test,ok) values ('QA can edit LEISA learner fields', n=1);
end $$;
reset role;
insert into _r(test,ok) select 'LEISA learner edit audited', (select count(*) from audit_log where table_name='leisa_learner') > (select n from _a);
do $$ declare r text; e text; begin
  foreach r in array array['operations','project_manager'] loop
    perform pg_temp.as_user('preview.'||r||'@apexu.co.za', array[r], 'apex-preview');
    execute 'set local role authenticated';
    declare n1 int; n2 int; n3 int; begin
      update eisa_windows set label=label; get diagnostics n1 = row_count;
      update leisa_settings set compiler_name='x'; get diagnostics n2 = row_count;
      update leisa_learner set fields='{}'::jsonb; get diagnostics n3 = row_count;
      insert into _r(test,ok) values (r||' cannot edit EISA windows / LEISA (0 rows)', n1+n2+n3=0);
      insert into _r(test,ok) values (r||' can still read EISA windows', (select count(*) from eisa_windows)>0);
    end;
    begin insert into eisa_windows(label,eisa_date,registration_closing) values ('x','2027-01-01','2026-12-01'); insert into _r(test,ok) values (r||' cannot add an EISA window', false);
    exception when insufficient_privilege then insert into _r(test,ok) values (r||' cannot add an EISA window', true); end;
    execute 'reset role';
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['eisa_windows','leisa_settings','leisa_learner'] loop
    execute 'set local role anon';
    begin execute format('select count(*) from %I', t); execute 'reset role'; insert into _r(test,ok) values ('anon cannot read '||t, false);
    exception when insufficient_privilege then execute 'reset role'; insert into _r(test,ok) values ('anon cannot read '||t, true); end;
  end loop;
end $$;

-- Report and undo in one step: the exception aborts the transaction, so nothing persists.
do $$ declare m text; begin
  select case when bool_and(ok) then 'ALL DB TESTS PASSED ('||count(*)||')' else 'FAILED: '||string_agg(test, '; ') filter (where not ok) end into m from _r;
  raise exception 'RESULT: %', m;
end $$;
