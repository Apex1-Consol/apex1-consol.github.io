-- PREVIEW ONLY. Test data for the new QA/ETQA fields. All values are made up; nothing is copied
-- from the real workbooks except public QCTO dates/labels. Safe to re-run.
update qcto_tracker set assessor = 'Test Assessor ' || programme_id,
  duration = case programme_id when 1 then '24 Months' else '18 Months' end
  where tenant_id = 'apex-preview';

insert into eisa_windows (tenant_id, label, eisa_date, registration_closing)
select 'apex-preview', 'Official EISA', d::date, c::date
from (values ('2026-11-12','2026-10-30'), ('2027-03-10','2027-01-29')) v(d, c)
where not exists (select 1 from eisa_windows where tenant_id = 'apex-preview');

-- QCTO projects sheet: one row per test QCTO programme
insert into moderation_items (tenant_id, sheet, programme_id, entity, project_manager, client_name, prog_type, qualification, nqf, learners, groups, employment, start_date, end_date, facilitator, assessor, mentor, enrolment_requested_date, enrolment_received_date, owner_email)
select 'apex-preview', 'QCTO projects', p.id, 'Apex Business Academy', p.project_manager_name, 'Test Client ' || p.id, 'Learnership',
       p.saqa_id || ' - ' || replace(p.programme_name, '[TEST] ', ''), p.nqf_level, (select count(*) from qcto_tracker t where t.programme_id = p.id), 'Group 1', 'Employed',
       p.start_date, p.end_date, 'Test Facilitator', 'Test Assessor ' || p.id, 'Test Mentor', p.start_date - 10, p.start_date - 2, 'stavros@apexu.co.za'
from programmes p
where p.tenant_id = 'apex-preview' and p.id in (1, 2)
  and not exists (select 1 from moderation_items m where m.sheet = 'QCTO projects' and m.programme_id = p.id);

update moderation_items set sor_submission_date = null, verifier = coalesce(verifier, 'Test Verifier'), exit_verification_date = coalesce(exit_verification_date, '2026-09-15')
  where tenant_id = 'apex-preview' and sheet = 'Exit verification';

-- Accreditation: dates behind each status, feedback written the way the sheet writes it
update accreditation_items set accreditation_from = '2025-08-29', accreditation_to = '2030-08-28', desktop_date = '2025-03-10', site_visit_date = '2025-06-18',
  feedback = 'Accreditation Granted (29/08/2025 – 28/08/2030)' where tenant_id = 'apex-preview' and status = 'Accreditation granted';
update accreditation_items set desktop_date = '2026-01-29', site_visit_date = '2026-11-20', feedback = 'Site Visit - 20/11/2026'
  where tenant_id = 'apex-preview' and status = 'Site visit scheduled';
update accreditation_items set smme = coalesce(smme, 'Test SMME'), qcto_advisor = coalesce(qcto_advisor, 'Test Advisor'), qcto_verifier = coalesce(qcto_verifier, 'Test Verifier')
  where tenant_id = 'apex-preview';

insert into leisa_settings (tenant_id, provider, sdp_name, sdp_code, sdp_address, province, compiler_name, compiler_email, compiler_phone, institution_phone)
values ('apex-preview', 'apex', 'Apex Business Academy (Pty) Ltd', '07-QCTO/SDP000000000001', 'Test address, Midrand, 1685', 'Gauteng', 'Test Compiler', 'compiler@example.test', '0110000000', '0110000001')
on conflict (tenant_id, provider) do nothing;

-- LEISA fields for every learner on the tracker. Learner 5 has an email with a space and
-- learner 7 an 11-digit cell number, so the field check has something to show.
-- Stage 2 is complete only for learner 1.
insert into leisa_learner (tenant_id, learner_id, programme_id, fields, updated_by)
select 'apex-preview', t.learner_id, t.programme_id,
  jsonb_build_object(
    'AlternativeIdType', '533', 'EquityCode', 'BA', 'NationalityCode', 'SA', 'HomeLanguageCode', 'Zul', 'GenderCode', 'F',
    'CitizenResidentStatusCode', 'SA', 'SocioeconomicStatusCode', '01', 'DisabilityStatusCode', '01', 'DisabilityRating', '01', 'ImmigrantStatus', '03',
    'LearnerTitle', 'Ms', 'LearnerBirthDate', case when length(l.id_number) = 13 then (case when left(l.id_number, 2)::int > 30 then '19' else '20' end) || left(l.id_number, 6) end,
    'LearnerHomeAddress1', t.learner_id || ' Test Street', 'LearnerHomeAddress2', 'Testville', 'LearnerHomeAddress3', 'Midrand',
    'LearnerPostalAddress1', t.learner_id || ' Test Street', 'LearnerPostalAddress2', 'Testville', 'LearnerPostalAddress3', 'Midrand',
    'LearnerHomeAddressPostalCode', '1685', 'LearnerPostalAddressPostCode', '1685',
    'LearnerPhoneNumber', '0110000' || lpad(t.learner_id::text, 3, '0'),
    'LearnerCellPhoneNumber', case when t.learner_id = 7 then '08200000007' else '0820000' || lpad(t.learner_id::text, 3, '0') end,
    'LearnerFaxNumber', 'N/A',
    'LearnerEmailAddress', case when t.learner_id = 5 then 'test 5@example.test' else 'test.' || t.learner_id || '@example.test' end,
    'ProvinceCode', '7', 'STATSSAAreaCode', '2011-798000000', 'POPIActAgree', 'Yes', 'POPIActDate', '20260605')
  || case when t.learner_id = 1 then jsonb_build_object('StatementofResultsStatus', '01', 'StatementofResultsIssueDate', '20261001', 'AssessmentCentreCode', 'TEST-AC-001', 'LearnerReadinessforEISATypeId', '1') else '{}'::jsonb end,
  'seed'
from qcto_tracker t join learners l on l.id = t.learner_id
where t.tenant_id = 'apex-preview'
on conflict (learner_id) do nothing;
