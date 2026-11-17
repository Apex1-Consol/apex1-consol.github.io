-- Switch ClickUp sync ON for hand-overs (user decision 2026-11-17). The live adapter picks handoffs outbox rows via
-- clickup_handoff_next; handoff-record-pdf v4 uploads the stored record PDF only. Trial hand-overs stay blocked
-- by handoff_outbox_trial_guard. To switch off again: set live = false.
update public.clickup_sync_adapter_flags set live = true, updated_at = now() where source_table = 'handoffs';
