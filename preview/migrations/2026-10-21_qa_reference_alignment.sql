-- PREVIEW ONLY (apexone-preview, qszikynltvyplzqootrc). Not applied to live.
-- Aligns the QA/ETQA tables with the team's reference workbooks:
--   QCTO Projects Tracker.xlsx, External Moderation – 2026.xlsx (4 sheets),
--   the QCTO LEISA template (43 columns) and the Pre-2009/NATED consolidated list.
alter table qcto_tracker add column if not exists assessor text, add column if not exists duration text;

alter table moderation_items drop constraint if exists moderation_items_sheet_check;
alter table moderation_items add constraint moderation_items_sheet_check check (sheet = any (array['External moderation','Exit verification','Projects completed','QCTO projects']));
alter table moderation_items
  add column if not exists enrolment_requested_date date,
  add column if not exists enrolment_received_date date,
  add column if not exists mentor text,
  add column if not exists certification text,
  add column if not exists sor_submission_date date;

alter table accreditation_items
  add column if not exists desktop_date date,
  add column if not exists site_visit_date date,
  add column if not exists accreditation_from date,
  add column if not exists accreditation_to date;

-- Next official EISA dates and registration closing dates (were hard-coded)
create table if not exists eisa_windows (
  id bigint generated always as identity primary key,
  tenant_id text not null default auth_tenant_id(),
  label text not null,
  eisa_date date not null,
  registration_closing date not null,
  qualification text,
  created_at timestamptz default now(), updated_at timestamptz default now());

-- SDP code + compulsory DETAILS block of the LEISA Instructions sheet, per provider
create table if not exists leisa_settings (
  tenant_id text not null default auth_tenant_id(),
  provider text not null,
  sdp_name text, sdp_code text, sdp_address text, province text,
  compiler_name text, compiler_email text, compiler_phone text, institution_phone text,
  updated_at timestamptz default now(),
  primary key (tenant_id, provider));

-- Per-learner LEISA fields (keys = QCTO column names). Separate table so QA/ETQA can
-- edit them without write access to learners, and nothing here syncs to ClickUp.
create table if not exists leisa_learner (
  id bigint generated always as identity primary key,   -- audit trigger records NEW.id
  learner_id bigint not null unique references learners(id) on delete cascade,
  tenant_id text not null default auth_tenant_id(),
  programme_id bigint references programmes(id),
  fields jsonb not null default '{}'::jsonb,
  updated_by text, updated_at timestamptz default now());

do $$ declare t text; begin
  foreach t in array array['eisa_windows','leisa_settings','leisa_learner'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('create policy tenant_select on %I for select to authenticated using (tenant_id = auth_tenant_id())', t);
    execute format('drop policy if exists qa_write on %I', t);
    execute format($p$create policy qa_write on %I for all to authenticated
      using (tenant_id = auth_tenant_id() and (auth_is_admin() or auth_has_role('qa_specialist') or auth_has_role('etqa')))
      with check (tenant_id = auth_tenant_id() and (auth_is_admin() or auth_has_role('qa_specialist') or auth_has_role('etqa')))$p$, t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_updated_at_%s on %I', t, t);
    execute format('create trigger set_updated_at_%s before update on %I for each row execute function update_updated_at()', t, t);
  end loop;
end $$;
drop trigger if exists trg_audit_log on leisa_learner;
create trigger trg_audit_log after insert or update or delete on leisa_learner for each row execute function log_audit_event();
