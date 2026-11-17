-- Ava night shift: hand-over rules (no AI). Called from ava_night(); one row per owner per rule per day.
create or replace function public.ava_night_handoffs(d date)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare c int;
begin
  with s as (
    select s.*, p.handed_over_to_email pm, coalesce(nullif(trim(p.programme_name), ''), 'Programme ' || p.id) pname,
      (coalesce((select max(e.created_at) from handoff_events e where e.programme_id = s.programme_id
         and e.kind in ('sign', 'unlock', 'handover', 'submitted', 'pm_query', 'pm_accepted')), s.created_at) at time zone 'Africa/Johannesburg')::date last_move
    from handoff_signoffs s join programmes p on p.id = s.programme_id where p.deleted_at is null
  ), r as (
    -- step waiting > 3 working days: owner = whose turn (as handoff_pipeline)
    select tenant_id, lower(case status when 'with_compliance' then (select email from auth.users where id = compliance_user)
             when 'with_operations' then (select email from auth.users where id = ops_user)
             else (select email from auth.users where id = pi_user) end) owner, 'hostep' kind,
           ' hand-over(s) waiting on you for more than 3 working days' txt, programme_id
      from s where status in ('preparing', 'with_compliance', 'with_operations', 'reopened')
       and (status <> 'preparing' or exists (select 1 from handoff_events e where e.programme_id = s.programme_id and e.kind <> 'opened'))
       and handoff_add_working_days(last_move, 3) < d
    union all -- PM statutory deadline within 7 days (or overdue)
    select distinct s.tenant_id, lower(s.pm), 'hodue', ' hand-over deadline(s) due within 7 days', s.programme_id
      from s cross join lateral jsonb_array_elements(coalesce(handoff_evaluate(s.programme_id) -> 'deadlines', '[]'::jsonb)) x
     where s.status = 'handed_over' and s.pm is not null and handoff_date(x ->> 'due') <= d + 7
    union all -- PM query unanswered > 2 days: Initiator and Head of Ops
    select tenant_id, lower((select email from auth.users where id = u)), 'hoquery', ' PM query(ies) on a hand-over unanswered for 2+ days', programme_id
      from s cross join lateral (values (pi_user), (ops_user)) v(u)
     where status = 'handed_over' and pm_response = 'query' and pm_response_at < now() - interval '2 days' and u is not null
    union all -- handed over, not accepted > 3 days: PM
    select tenant_id, lower(pm), 'hoaccept', ' hand-over(s) to accept or query (waiting 3+ days)', programme_id
      from s where status = 'handed_over' and pm_response is null and pm is not null and handed_over_at < now() - interval '3 days'
  )
  insert into ava_prepared(tenant_id, day, owner_email, owner_role, kind, label, n, route, pb, ids)
  select tenant_id, d, owner, null, kind, count(distinct programme_id) || min(txt), count(distinct programme_id),
         case when count(distinct programme_id) = 1 then 'handover/' || min(programme_id) else 'mywork' end, null,
         jsonb_agg(distinct programme_id)
    from r where owner is not null group by tenant_id, owner, kind;
  get diagnostics c = row_count;
  return c;
end $$;
revoke all on function public.ava_night_handoffs(date) from public, anon, authenticated;

create or replace function public.ava_night()
returns integer language plpgsql security definer set search_path to 'public', 'cron' as $function$
declare d date := (now() at time zone 'Africa/Johannesburg')::date; c int;
begin
  delete from ava_prepared where day = d and done_at is null;
  insert into ava_prepared(tenant_id, day, owner_email, owner_role, kind, label, n, route, pb, ids)
  select tenant_id, d, lower(owner_email), case when owner_email is null then 'admin' end, 'closeout',
         count(*) || ' programme(s) end within 14 days: prepare close-out', count(*), 'pmtracker', 'closeout', jsonb_agg(id)
    from programmes where deleted_at is null and status = 'active' and end_date between d and d + 14 group by 1, 3, 4
  union all
  select tenant_id, d, lower(owner_email), case when owner_email is null then 'admin' end, 'reportdue',
         count(*) || ' report(s) due within 7 days', count(*), 'pmtracker', 'attention', jsonb_agg(id)
    from programmes where deleted_at is null and status = 'active' and report_due_date between d and d + 7 group by 1, 3, 4
  union all
  select tenant_id, d, lower(owner_email), case when owner_email is null then 'admin' end, 'gaps',
         count(*) || ' active programme(s) missing start, end or qualification', count(*), 'pmtracker', 'gaps', jsonb_agg(id)
    from programmes where deleted_at is null and status = 'active' and (start_date is null or end_date is null or coalesce(qualification_name, qualification_code, '') = '') group by 1, 3, 4
  union all
  select tenant_id, d, null, 'admin', 'noowner', count(*) || ' programme(s) have no owner', count(*), 'pmtracker', null, jsonb_agg(id)
    from programmes where deleted_at is null and owner_email is null group by 1
  union all
  select tenant_id, d, null, 'pi', 'pihand', count(*) || ' initiated programme(s) not handed over after 7 days', count(*), 'pi', 'pihand', jsonb_agg(id)
    from programmes where deleted_at is null and status = 'initiated' and handed_over_at is null and created_at < now() - interval '7 days' group by 1
  union all
  select tenant_id, d, null, 'qa', 'modlink', count(*) || ' moderation item(s) not linked to a programme', count(*), 'modver', 'modprep', '[]'::jsonb
    from moderation_items where programme_id is null group by 1
  union all
  select tenant_id, d, null, 'qa', 'famreview', count(*) || ' FAM renewal upload(s) waiting for review', count(*), 'fam', 'renew', jsonb_agg(id)
    from fam_renewals where uploaded_at is not null and reviewed_at is null group by 1
  union all
  select tenant_id, d, null, 'admin', 'signoff', count(*) || ' sign-off(s) waiting 3+ days', count(*), 'signoff', 'soreview', jsonb_agg(id)
    from signoff_items where decided_at is null and coalesce(status, 'waiting') not in ('approved', 'rejected', 'signed', 'done') and created_at < now() - interval '3 days' group by 1
  union all
  select t.id::text, d, null, 'admin', 'health', f.n || ' background job failure(s) in the last 24h', f.n, 'synchealth', 'health', '[]'::jsonb
    from (select count(*)::int n from cron.job_run_details where status = 'failed' and start_time > now() - interval '24 hours') f, tenants t where f.n > 0;
  perform public.ava_night_handoffs(d);
  -- no duplicates: drop a fresh row when the same owner already marked that rule done today
  delete from ava_prepared a where a.day = d and a.done_at is null and exists (select 1 from ava_prepared b where b.day = d and b.done_at is not null
    and b.tenant_id = a.tenant_id and b.kind = a.kind and b.owner_email is not distinct from a.owner_email and b.owner_role is not distinct from a.owner_role);
  select count(*) into c from ava_prepared where day = d and done_at is null;
  delete from ava_prepared where day < d - 14;
  return c;
end $function$;
