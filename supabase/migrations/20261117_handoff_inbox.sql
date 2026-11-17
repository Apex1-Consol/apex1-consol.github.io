-- In-app notifications for the hand-over chain (no email).
-- Run once in the Supabase SQL editor for the live project (apex-one).
-- Kept out of reports.notifications on purpose: that table pokes the report-notify email function.

create table if not exists public.user_inbox (
  id           bigserial primary key,
  tenant_id    text,
  recipient    uuid not null references auth.users(id) on delete cascade,
  kind         text not null,            -- handoff_sign | handoff_returned | handoff_received
  action       boolean not null default true,  -- true: clears when acted on; false: clears when opened
  programme_id bigint,
  title        text not null,
  detail       text,
  link         text,
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);
create index if not exists user_inbox_open on public.user_inbox (recipient) where done_at is null;
create index if not exists user_inbox_prog on public.user_inbox (programme_id) where done_at is null;

alter table public.user_inbox enable row level security;
drop policy if exists user_inbox_read on public.user_inbox;
create policy user_inbox_read on public.user_inbox for select to authenticated using (recipient = auth.uid());
drop policy if exists user_inbox_done on public.user_inbox;
create policy user_inbox_done on public.user_inbox for update to authenticated using (recipient = auth.uid()) with check (recipient = auth.uid());
revoke all on public.user_inbox from anon, authenticated;
grant select on public.user_inbox to authenticated;
grant update (done_at) on public.user_inbox to authenticated;

create or replace function public.handoff_inbox_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pname text; to_user uuid; k text; t text; reason text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.compliance_user is not distinct from old.compliance_user
     and new.ops_user is not distinct from old.ops_user then
    return null;
  end if;

  select coalesce(nullif(trim(programme_name), ''), 'Programme ' || coalesce(display_id, id::text))
    into pname from programmes where id = new.programme_id;
  pname := coalesce(pname, 'Programme ' || new.programme_id);

  -- the previous step's "please sign" is no longer waiting on anyone
  update user_inbox set done_at = now()
   where programme_id = new.programme_id and kind = 'handoff_sign' and done_at is null;

  if new.status = 'with_compliance' then
    to_user := new.compliance_user; k := 'handoff_sign'; t := 'Hand-over waiting for your Compliance sign-off';
  elsif new.status = 'with_operations' then
    to_user := new.ops_user; k := 'handoff_sign'; t := 'Hand-over waiting for your Head of Ops sign-off';
  elsif new.status = 'handed_over' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select id into to_user from auth.users where lower(email) = lower(new.details ->> 'pm_email') limit 1;
    k := 'handoff_received'; t := 'Programme handed over to you';
  elsif tg_op = 'UPDATE' and new.status in ('preparing', 'reopened')
        and old.status in ('with_compliance', 'with_operations', 'handed_over') then
    to_user := new.pi_user; k := 'handoff_returned'; t := 'Hand-over sent back to you';
    select invalidated_reason into reason from handoff_signatures
     where programme_id = new.programme_id and invalidated_at is not null
     order by invalidated_at desc limit 1;
  end if;

  -- no one to tell, or telling people about their own action
  if to_user is null or (k <> 'handoff_sign' and to_user = auth.uid()) then
    return null;
  end if;

  insert into user_inbox (tenant_id, recipient, kind, action, programme_id, title, detail, link)
  values (new.tenant_id, to_user, k, k = 'handoff_sign', new.programme_id, t,
          pname || coalesce(' · ' || nullif(trim(reason), ''), ''), 'handover/' || new.programme_id);
  return null;
end $$;
revoke all on function public.handoff_inbox_trg() from public, anon, authenticated;

drop trigger if exists trg_handoff_inbox on public.handoff_signoffs;
create trigger trg_handoff_inbox
  after insert or update of status, compliance_user, ops_user on public.handoff_signoffs
  for each row execute function public.handoff_inbox_trg();

-- backfill: hand-overs already waiting on a signer
insert into public.user_inbox (tenant_id, recipient, kind, action, programme_id, title, detail, link)
select s.tenant_id,
       case s.status when 'with_compliance' then s.compliance_user else s.ops_user end,
       'handoff_sign', true, s.programme_id,
       case s.status when 'with_compliance' then 'Hand-over waiting for your Compliance sign-off'
                     else 'Hand-over waiting for your Head of Ops sign-off' end,
       coalesce(nullif(trim(p.programme_name), ''), 'Programme ' || coalesce(p.display_id, s.programme_id::text)),
       'handover/' || s.programme_id
  from public.handoff_signoffs s left join public.programmes p on p.id = s.programme_id
 where s.status in ('with_compliance', 'with_operations')
   and not exists (select 1 from public.user_inbox i where i.programme_id = s.programme_id and i.kind = 'handoff_sign' and i.done_at is null);
