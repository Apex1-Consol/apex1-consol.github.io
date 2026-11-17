-- Trial flag for hand-overs (2026-11-17).
-- handoff_signoffs.trial_note marks a sign-off as a trial run. It is not part of the signed fingerprint
-- (handoff_hashes covers the pack, evidence, N/A, assignees, risks, verifications and acks only), so setting it
-- leaves signatures valid. handoff_get returns it; the page shows a banner on the sign-off and the Hand-over pack.

alter table public.handoff_signoffs add column if not exists trial_note text;

create or replace function public.handoff_get(p_programme_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g jsonb := public.handoff_get_full(p_programme_id); tn text;
begin
  if g is null then return g; end if;
  select trial_note into tn from public.handoff_signoffs where programme_id = p_programme_id;
  g := g || jsonb_build_object('trial_note', tn);
  if public.handoff_can_audit(p_programme_id) then return g || jsonb_build_object('audit', true); end if;
  return (g - 'events' - 'signature_history') || jsonb_build_object('audit', false);
end $$;
revoke execute on function public.handoff_get(bigint) from public, anon;
grant execute on function public.handoff_get(bigint) to authenticated;

-- Programme 896: the 2026-11-17 end-to-end trial. Kept as it is, flagged, and its ClickUp jobs parked so they never
-- create real ClickUp tasks from trial data.
update public.handoff_signoffs set trial_note =
  'Trial run on 17 Nov 2026 to test the hand-over flow end to end. Demo documents; Programme Initiator and Head of Operations signatures entered on their behalf with Stavros''s authorisation. Not a real hand-over.'
where programme_id = 896;
update public.clickup_sync_outbox set status = 'superseded', last_error = 'Trial hand-over (programme 896): not sent to ClickUp', updated_at = now()
where source_table = 'handoffs' and source_record_id = '896' and status = 'queued';
insert into public.handoff_events (programme_id, tenant_id, kind, detail, actor, actor_email)
select 896, tenant_id, 'note', 'Marked as a TRIAL hand-over (kept as is). ClickUp jobs for this hand-over parked as superseded.',
  '3e0f72ed-df6e-4237-915d-667e0dc26966', 'stavros@apexu.co.za' from public.handoff_signoffs where programme_id = 896;
