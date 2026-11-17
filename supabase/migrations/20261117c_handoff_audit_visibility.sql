-- Hand-over audit trail visibility (2026-11-17).
-- The full event history and cleared signatures are shown only to the programme's three assigned signers,
-- admins, Compliance Officers and Heads of Operations. Everyone else (PMs included) still sees the signature
-- cards, gates and documents, but handoff_get returns no 'events' / 'signature_history' and sets audit=false.

create or replace function public.handoff_can_audit(p_programme_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_is_admin() or public.auth_has_role('compliance_officer') or public.auth_has_role('head_of_ops')
      or exists (select 1 from public.handoff_signoffs s where s.programme_id = p_programme_id
                 and auth.uid() in (s.pi_user, s.compliance_user, s.ops_user));
$$;
grant execute on function public.handoff_can_audit(bigint) to authenticated;

-- Keep the original builder under a private name; every caller (page and other handoff_* functions) goes through the wrapper.
alter function public.handoff_get(bigint) rename to handoff_get_full;
revoke execute on function public.handoff_get_full(bigint) from public, anon, authenticated;

create function public.handoff_get(p_programme_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g jsonb := public.handoff_get_full(p_programme_id);
begin
  if g is null or public.handoff_can_audit(p_programme_id) then return g || jsonb_build_object('audit', true); end if;
  return (g - 'events' - 'signature_history') || jsonb_build_object('audit', false);
end $$;
revoke execute on function public.handoff_get(bigint) from public, anon;
grant execute on function public.handoff_get(bigint) to authenticated;

drop policy if exists handoff_events_tenant_read on public.handoff_events;
create policy handoff_events_tenant_read on public.handoff_events for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.handoff_can_audit(programme_id));
