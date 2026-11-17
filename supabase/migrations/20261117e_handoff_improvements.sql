-- Hand-over improvements after the 2026-11-17 trial (run on live 2026-11-17 evening).

-- 1. Hand-over record PDF without ClickUp: edge function handoff-record-store (supabase/functions/handoff-record-store)
--    stores the newest record's PDF every minute; staff read it through this policy.
select cron.schedule('handoff-record-store-1min', '* * * * *', $c$
  select net.http_post(
    url := 'https://nducwhlmudksgxggjrbo.supabase.co/functions/v1/handoff-record-store',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'clickup_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 90000)
  where exists (select 1 from public.handoff_records r where r.storage_path is null
                and r.version = (select max(version) from public.handoff_records x where x.programme_id = r.programme_id));
$c$);
drop policy if exists handoff_records_pdf_read on storage.objects;
create policy handoff_records_pdf_read on storage.objects for select to authenticated
  using (bucket_id = 'handoff-records' and exists (select 1 from public.handoff_records r where r.storage_path = objects.name and r.tenant_id = public.auth_tenant_id()));

-- 2. Acting signer. A deputy named for a step signs as themselves; the signature says who they acted for.
create table if not exists public.handoff_deputies (
  id bigserial primary key,
  tenant_id text not null default public.auth_tenant_id(),
  principal uuid not null, deputy uuid not null,
  step text not null check (step in ('pi', 'compliance', 'ops')),
  valid_from date not null default current_date, valid_to date not null,
  reason text not null, created_by uuid default auth.uid(), created_at timestamptz not null default now(), revoked_at timestamptz,
  check (principal <> deputy), check (valid_to >= valid_from));
alter table public.handoff_deputies enable row level security;
drop policy if exists handoff_deputies_read on public.handoff_deputies;
create policy handoff_deputies_read on public.handoff_deputies for select to authenticated using (tenant_id = public.auth_tenant_id());
alter table public.handoff_signatures add column if not exists acting_for uuid;

create or replace function public.handoff_acting_ok(p_me uuid, p_assigned uuid, p_step text, s public.handoff_signoffs) returns boolean
language sql stable security definer set search_path = public as $$
  select p_me is not null and p_assigned is not null
     and p_me is distinct from s.pi_user and p_me is distinct from s.compliance_user and p_me is distinct from s.ops_user
     and not exists (select 1 from public.handoff_signatures x where x.programme_id = s.programme_id and x.signer = p_me and x.invalidated_at is null)
     and exists (select 1 from public.handoff_deputies d where d.principal = p_assigned and d.deputy = p_me and d.step = p_step
                 and d.revoked_at is null and current_date between d.valid_from and d.valid_to and d.tenant_id = s.tenant_id);
$$;

-- handoff_get_full: an active deputy passes the "assigned to someone else" and role checks for that step only.
do $$ declare src text; begin
  src := pg_get_functiondef('public.handoff_get_full(bigint)'::regprocedure);
  if (length(src) - length(replace(src, 'when assigned <> me then', ''))) / length('when assigned <> me then') <> 1
     or (length(src) - length(replace(src, 'when not public.handoff_user_has_role(me,', ''))) / length('when not public.handoff_user_has_role(me,') <> 1 then
    raise exception 'handoff_get_full changed shape; acting-signer patch not applied'; end if;
  src := replace(src, 'when assigned <> me then', 'when assigned <> me and not public.handoff_acting_ok(me, assigned, step, s) then');
  src := replace(src, 'when not public.handoff_user_has_role(me,', 'when assigned = me and not public.handoff_user_has_role(me,');
  execute src;
end $$;

-- Every signature: one person, one step; a deputy's signature names who they acted for.
create or replace function public.handoff_signature_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s public.handoff_signoffs; assigned uuid; pname text;
begin
  select * into s from public.handoff_signoffs where programme_id = new.programme_id;
  assigned := case new.role when 'pi' then s.pi_user when 'compliance' then s.compliance_user else s.ops_user end;
  if exists (select 1 from public.handoff_signatures x where x.programme_id = new.programme_id and x.signer = new.signer and x.invalidated_at is null and x.role <> new.role) then
    raise exception 'One person cannot sign two steps of the same hand-over' using errcode = '42501'; end if;
  if new.signer is distinct from assigned then
    if not public.handoff_acting_ok(new.signer, assigned, new.role, s) then raise exception 'Only the assigned signer or their acting deputy can sign this step' using errcode = '42501'; end if;
    new.acting_for := assigned;
    pname := coalesce(public.handoff_user_label(assigned) ->> 'name', 'the assigned signer');
    new.signer_name := coalesce(new.signer_name, '') || ' (acting for ' || pname || ')';
  end if;
  return new;
end $$;
drop trigger if exists handoff_signature_guard on public.handoff_signatures;
create trigger handoff_signature_guard before insert on public.handoff_signatures for each row execute function public.handoff_signature_guard();

create or replace function public.handoff_deputy_set(p_programme_id bigint, p_step text, p_deputy uuid, p_until date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.handoff_signoffs; assigned uuid; did bigint; pname text;
begin
  select * into s from public.handoff_signoffs where programme_id = p_programme_id and tenant_id = public.auth_tenant_id();
  if s.programme_id is null then raise exception 'Programme not in your tenant' using errcode = '42501'; end if;
  assigned := case p_step when 'pi' then s.pi_user when 'compliance' then s.compliance_user when 'ops' then s.ops_user end;
  if assigned is null then raise exception 'Assign this step first' using errcode = '22023'; end if;
  if not (public.auth_is_admin() or public.auth_has_role('head_of_ops') or auth.uid() = assigned) then
    raise exception 'Only an admin, the Head of Operations or the signer themselves can name an acting signer' using errcode = '42501'; end if;
  if p_deputy in (s.pi_user, s.compliance_user, s.ops_user) then raise exception 'That person already has a step on this hand-over' using errcode = '22023'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason (e.g. on leave until …)' using errcode = '22023'; end if;
  if p_until < current_date or p_until > current_date + 60 then raise exception 'Acting period must end within 60 days' using errcode = '22023'; end if;
  insert into public.handoff_deputies (tenant_id, principal, deputy, step, valid_to, reason) values (s.tenant_id, assigned, p_deputy, p_step, p_until, trim(p_reason)) returning id into did;
  select coalesce(nullif(trim(programme_name), ''), 'Programme ' || id) into pname from public.programmes where id = p_programme_id;
  insert into public.handoff_events (programme_id, tenant_id, kind, detail, actor, actor_email)
  values (p_programme_id, s.tenant_id, 'deputy', left(format('%s may sign %s acting for %s until %s: %s', public.handoff_user_label(p_deputy) ->> 'name',
    public.handoff_step_title(p_step), public.handoff_user_label(assigned) ->> 'name', p_until, trim(p_reason)), 500), auth.uid(), (select email from auth.users where id = auth.uid()));
  if (s.status = (case p_step when 'pi' then 'preparing' when 'compliance' then 'with_compliance' else 'with_operations' end) or (p_step = 'pi' and s.status = 'reopened')) then
    insert into public.user_inbox (tenant_id, recipient, kind, action, programme_id, title, detail, link)
    values (s.tenant_id, p_deputy, 'handoff_sign', true, p_programme_id, 'Hand-over waiting for you (acting ' || public.handoff_step_title(p_step) || ')',
            pname || ' · acting for ' || coalesce(public.handoff_user_label(assigned) ->> 'name', ''), 'handover/' || p_programme_id);
  end if;
  return public.handoff_get(p_programme_id);
end $$;
grant execute on function public.handoff_deputy_set(bigint, text, uuid, date, text) to authenticated;

-- Inbox: when a step becomes due, an active deputy for it is told as well.
create or replace function public.handoff_inbox_deputy_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare st text; assigned uuid; d record; pname text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  st := case new.status when 'with_compliance' then 'compliance' when 'with_operations' then 'ops' when 'preparing' then 'pi' when 'reopened' then 'pi' end;
  if st is null then return null; end if;
  assigned := case st when 'pi' then new.pi_user when 'compliance' then new.compliance_user else new.ops_user end;
  select coalesce(nullif(trim(programme_name), ''), 'Programme ' || id) into pname from programmes where id = new.programme_id;
  for d in select deputy from handoff_deputies where principal = assigned and step = st and revoked_at is null and current_date between valid_from and valid_to and tenant_id = new.tenant_id loop
    insert into user_inbox (tenant_id, recipient, kind, action, programme_id, title, detail, link)
    values (new.tenant_id, d.deputy, 'handoff_sign', true, new.programme_id, 'Hand-over waiting for you (acting ' || handoff_step_title(st) || ')',
            coalesce(pname, '') || ' · acting for ' || coalesce(handoff_user_label(assigned) ->> 'name', ''), 'handover/' || new.programme_id);
  end loop;
  return null;
end $$;
drop trigger if exists trg_handoff_inbox_deputy on public.handoff_signoffs;
create trigger trg_handoff_inbox_deputy after update of status on public.handoff_signoffs for each row execute function public.handoff_inbox_deputy_trg();

-- 4. Evidence must be an attached file (📎 …) or a full web link; checked on every save of a gate's evidence.
create or replace function public.handoff_evidence_check() returns trigger language plpgsql as $$
declare k text; v jsonb; part text;
begin
  for k, v in select * from jsonb_each(coalesce(new.evidence, '{}'::jsonb)) loop
    if v is not distinct from (coalesce(old.evidence, '{}'::jsonb) -> k) or v is null or jsonb_typeof(v) <> 'object' then continue; end if;
    foreach part in array string_to_array(coalesce(v ->> 'ref', ''), ' · ') loop
      part := trim(part);
      if part = '' or part like '📎 %' or part ~* '^https?://[^\s/]+\.[^\s]{2,}' then continue; end if;
      raise exception 'Evidence for % must be an attached file or a full web link starting with https:// (not "%")', upper(k), left(part, 40) using errcode = '22023';
    end loop;
  end loop;
  return new;
end $$;
drop trigger if exists handoff_evidence_check on public.handoff_signoffs;
create trigger handoff_evidence_check before update of evidence on public.handoff_signoffs for each row execute function public.handoff_evidence_check();

-- 8. Trial switch: a trial hand-over runs normally but never goes to ClickUp, and its record PDF is stamped TRIAL.
create or replace function public.handoff_set_trial(p_programme_id bigint, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.handoff_signoffs; who text := (select email from auth.users where id = auth.uid());
begin
  select * into s from public.handoff_signoffs where programme_id = p_programme_id and tenant_id = public.auth_tenant_id();
  if s.programme_id is null then raise exception 'Programme not in your tenant' using errcode = '42501'; end if;
  if not (public.auth_is_admin() or auth.uid() = s.pi_user) then raise exception 'Only an admin or the Programme Initiator can change this' using errcode = '42501'; end if;
  if not p_on and s.status = 'handed_over' then raise exception 'A handed-over trial stays a trial' using errcode = '55000'; end if;
  update public.handoff_signoffs set trial_note = case when p_on then 'Trial run marked by ' || who || ' on ' || to_char(now() at time zone 'Africa/Johannesburg', 'DD Mon YYYY') || '. Not a real hand-over.' end
   where programme_id = p_programme_id;
  insert into public.handoff_events (programme_id, tenant_id, kind, detail, actor, actor_email)
  values (p_programme_id, s.tenant_id, 'note', case when p_on then 'Marked as a TRIAL hand-over: it will not go to ClickUp.' else 'Trial mark removed: this is a real hand-over.' end, auth.uid(), who);
  return public.handoff_get(p_programme_id);
end $$;
grant execute on function public.handoff_set_trial(bigint, boolean) to authenticated;

create or replace function public.handoff_outbox_trial_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_table = 'handoffs' and exists (select 1 from handoff_signoffs where programme_id::text = new.source_record_id and trial_note is not null) then
    new.status := 'superseded'; new.last_error := 'Trial hand-over: not sent to ClickUp';
  end if;
  return new;
end $$;
drop trigger if exists handoff_outbox_trial_guard on public.clickup_sync_outbox;
create trigger handoff_outbox_trial_guard before insert on public.clickup_sync_outbox for each row execute function public.handoff_outbox_trial_guard();

-- 5. The PM accepts the hand-over or raises a query (which tells the Initiator and the Head of Operations).
alter table public.handoff_signoffs add column if not exists pm_response text check (pm_response in ('accepted', 'query')),
  add column if not exists pm_note text, add column if not exists pm_response_at timestamptz, add column if not exists pm_response_by text;

create or replace function public.handoff_pm_respond(p_programme_id bigint, p_accept boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.handoff_signoffs; me text := lower((select email from auth.users where id = auth.uid())); pname text; u uuid;
begin
  select * into s from public.handoff_signoffs where programme_id = p_programme_id and tenant_id = public.auth_tenant_id();
  if s.programme_id is null then raise exception 'Programme not in your tenant' using errcode = '42501'; end if;
  if s.status <> 'handed_over' then raise exception 'This programme has not been handed over' using errcode = '55000'; end if;
  if me is distinct from lower((select handed_over_to_email from public.programmes where id = p_programme_id)) then
    raise exception 'Only the Project Manager it was handed to can respond' using errcode = '42501'; end if;
  if not p_accept and coalesce(trim(p_note), '') = '' then raise exception 'Say what needs clarifying' using errcode = '22023'; end if;
  update public.handoff_signoffs set pm_response = case when p_accept then 'accepted' else 'query' end, pm_note = nullif(trim(p_note), ''),
    pm_response_at = now(), pm_response_by = me where programme_id = p_programme_id;
  if p_accept then
    update public.programme_documents set reviewed_at = now(), reviewed_by = me where programme_id = p_programme_id and reviewed_at is null;
  end if;
  update public.user_inbox set done_at = now() where programme_id = p_programme_id and recipient = auth.uid() and done_at is null;
  insert into public.handoff_events (programme_id, tenant_id, kind, detail, actor, actor_email)
  values (p_programme_id, s.tenant_id, case when p_accept then 'pm_accepted' else 'pm_query' end,
          left(case when p_accept then 'Project Manager accepted the hand-over' else 'Project Manager raised a query: ' end || coalesce(case when p_accept then nullif(' · ' || trim(p_note), ' · ') else trim(p_note) end, ''), 500), auth.uid(), me);
  if not p_accept then
    select coalesce(nullif(trim(programme_name), ''), 'Programme ' || id) into pname from public.programmes where id = p_programme_id;
    foreach u in array array[s.pi_user, s.ops_user] loop
      if u is not null then insert into public.user_inbox (tenant_id, recipient, kind, action, programme_id, title, detail, link)
        values (s.tenant_id, u, 'handoff_query', true, p_programme_id, 'PM query on a hand-over', pname || ' · ' || left(trim(p_note), 200), 'handover/' || p_programme_id); end if;
    end loop;
  end if;
  return public.handoff_get(p_programme_id);
end $$;
grant execute on function public.handoff_pm_respond(bigint, boolean, text) to authenticated;

-- 5b. Statutory deadlines of the programmes handed to me (for My work and reminders).
create or replace function public.handoff_my_deadlines() returns table (programme_id bigint, programme text, label text, due date, rule text, gate text, trial boolean)
language sql stable security definer set search_path = public as $$
  select s.programme_id, coalesce(nullif(trim(p.programme_name), ''), 'Programme ' || p.id), d ->> 'label', public.handoff_date(d ->> 'due'), d ->> 'rule', d ->> 'gate', s.trial_note is not null
  from public.handoff_signoffs s join public.programmes p on p.id = s.programme_id
  cross join lateral jsonb_array_elements(coalesce(public.handoff_evaluate(s.programme_id) -> 'deadlines', '[]'::jsonb)) d
  where s.tenant_id = public.auth_tenant_id() and s.status = 'handed_over'
    and lower(p.handed_over_to_email) = lower((select email from auth.users where id = auth.uid()))
    and public.handoff_date(d ->> 'due') is not null;
$$;
grant execute on function public.handoff_my_deadlines() to authenticated;

-- 9. Pipeline: every hand-over in progress (and the last 30 days of finished ones), whose turn it is, how long it has waited.
create or replace function public.handoff_pipeline() returns table (programme_id bigint, programme text, status text, turn text, turn_email text,
  waiting_days int, trial boolean, pm_response text, handed_over_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.auth_is_admin() or public.auth_has_role('compliance_officer') or public.auth_has_role('head_of_ops') or public.auth_has_role('pi_specialist')) then
    raise exception 'Not available for your role' using errcode = '42501'; end if;
  return query
  select s.programme_id, coalesce(nullif(trim(p.programme_name), ''), 'Programme ' || p.id)::text, s.status,
    (case s.status when 'with_compliance' then 'Compliance' when 'with_operations' then 'Head of Ops' when 'handed_over' then
       case s.pm_response when 'accepted' then 'Done' when 'query' then 'PM query' else 'PM to accept' end else 'Initiator' end)::text,
    (case s.status when 'with_compliance' then (select email from auth.users where id = s.compliance_user) when 'with_operations' then (select email from auth.users where id = s.ops_user)
       when 'handed_over' then case when s.pm_response = 'query' then (select email from auth.users where id = s.pi_user) when s.pm_response is null then p.handed_over_to_email end
       else (select email from auth.users where id = s.pi_user) end)::text,
    (current_date - (coalesce((select max(e.created_at) from public.handoff_events e where e.programme_id = s.programme_id
       and e.kind in ('sign', 'unlock', 'handover', 'submitted', 'pm_query', 'pm_accepted')), s.created_at) at time zone 'Africa/Johannesburg')::date)::int,
    s.trial_note is not null, s.pm_response, s.handed_over_at
  from public.handoff_signoffs s join public.programmes p on p.id = s.programme_id
  where s.tenant_id = public.auth_tenant_id()
    and (s.status <> 'preparing' or exists (select 1 from public.handoff_events e where e.programme_id = s.programme_id and e.kind not in ('opened')))
    and (s.status <> 'handed_over' or s.handed_over_at > now() - interval '30 days' or s.pm_response is distinct from 'accepted')
  order by (s.status = 'handed_over'), 6 desc;
end $$;
grant execute on function public.handoff_pipeline() to authenticated;

-- handoff_get also returns the trial note, active acting signers per step and the PM's response.
create or replace function public.handoff_get(p_programme_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g jsonb := public.handoff_get_full(p_programme_id); s public.handoff_signoffs; dep jsonb;
begin
  if g is null then return g; end if;
  select * into s from public.handoff_signoffs where programme_id = p_programme_id;
  select coalesce(jsonb_object_agg(d.step, jsonb_build_object('name', public.handoff_user_label(d.deputy) ->> 'name', 'email', public.handoff_user_label(d.deputy) ->> 'email',
           'until', d.valid_to, 'reason', d.reason, 'me', d.deputy = auth.uid())), '{}') into dep
    from public.handoff_deputies d
   where d.revoked_at is null and current_date between d.valid_from and d.valid_to and d.tenant_id = s.tenant_id
     and d.principal = case d.step when 'pi' then s.pi_user when 'compliance' then s.compliance_user else s.ops_user end;
  g := g || jsonb_build_object('trial_note', s.trial_note, 'deputies', dep, 'pm', jsonb_build_object('response', s.pm_response, 'note', s.pm_note,
         'at', s.pm_response_at, 'by', s.pm_response_by, 'email', (select handed_over_to_email from public.programmes where id = p_programme_id)));
  if public.handoff_can_audit(p_programme_id) then return g || jsonb_build_object('audit', true); end if;
  return (g - 'events' - 'signature_history') || jsonb_build_object('audit', false);
end $$;
revoke execute on function public.handoff_get(bigint) from public, anon;
grant execute on function public.handoff_get(bigint) to authenticated;
