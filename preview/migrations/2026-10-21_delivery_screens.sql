-- Preview only (apexone-preview). Run once in the Supabase SQL editor. Safe to re-run.
-- Wires Programmes / Form 3, Attendance & PoE and EISA readiness to real tables.
-- Live needs the same ALTER when these screens are ported (program_modules.components).

-- 1. Form 3 components per delivery module: [{code, kind: KM|PM|WM, title, hours, facilitator_id}]
alter table program_modules add column if not exists components jsonb not null default '[]'::jsonb;

-- 2. Test data ([TEST] only, tenant apex-preview). Writes queue to the preview ClickUp lists (T2, T5, T8, T10).
update programmes set fields = coalesce(fields,'{}'::jsonb) || '{"Curriculum code":"TEST-101869","Credits":"240"}' where id = 1 and tenant_id = 'apex-preview';
update programmes set fields = coalesce(fields,'{}'::jsonb) || '{"Curriculum code":"TEST-117329","Credits":"180"}' where id = 2 and tenant_id = 'apex-preview';

insert into program_modules (tenant_id, programme_id, module_number, title, dates, trained, components) values
 ('apex-preview',1,1,'[TEST] Project initiation','05/06/2026 – 30/06/2026',true,
  '[{"code":"TEST-KM-01","kind":"KM","title":"Project management fundamentals","hours":120,"facilitator_id":1},{"code":"TEST-PM-01","kind":"PM","title":"Plan a small project","hours":80,"facilitator_id":1},{"code":"TEST-WM-01","kind":"WM","title":"Project initiation in the workplace","hours":100}]'),
 ('apex-preview',1,2,'[TEST] Project execution','01/07/2026 – 31/08/2026',true,
  '[{"code":"TEST-KM-02","kind":"KM","title":"Scope, time and cost control","hours":140,"facilitator_id":1},{"code":"TEST-PM-02","kind":"PM","title":"Track and report project progress","hours":60,"facilitator_id":1},{"code":"TEST-WM-02","kind":"WM","title":"Executing project tasks in the workplace","hours":null}]'),
 ('apex-preview',1,3,'[TEST] Project close-out','01/09/2026 – 30/11/2026',false,
  '[{"code":"TEST-KM-03","kind":"KM","title":"Closing and reviewing projects","hours":80},{"code":"TEST-PM-03","kind":"PM","title":"Compile a close-out report","hours":40},{"code":"TEST-WM-03","kind":"WM","title":"Project close-out in the workplace","hours":120}]'),
 ('apex-preview',2,1,'[TEST] Underwriting principles','01/04/2025 – 30/09/2025',true,
  '[{"code":"TEST-KM-01","kind":"KM","title":"Insurance and underwriting principles","hours":160,"facilitator_id":1},{"code":"TEST-PM-01","kind":"PM","title":"Assess a standard risk","hours":90,"facilitator_id":1},{"code":"TEST-WM-01","kind":"WM","title":"Underwriting standard risks","hours":150}]'),
 ('apex-preview',2,2,'[TEST] Complex risks','01/10/2025 – 31/03/2026',true,
  '[{"code":"TEST-KM-02","kind":"KM","title":"Complex and commercial risks","hours":140,"facilitator_id":1},{"code":"TEST-PM-02","kind":"PM","title":"Price and document a complex risk","hours":80,"facilitator_id":1},{"code":"TEST-WM-02","kind":"WM","title":"Underwriting complex risks","hours":200}]')
on conflict (programme_id, module_number) do update set components = excluded.components, title = excluded.title, dates = excluded.dates, trained = excluded.trained;

insert into attendance_sessions (tenant_id, programme_id, session_date, topic, facilitator, venue, fields)
select 'apex-preview', p, d::date, t, '[TEST] Facilitator One', 'Online',
  jsonb_build_object('Date', d, 'Topic', t, 'Facilitator', '[TEST] Facilitator One', 'Venue', 'Online', 'Programme', p, 'Module', m)
from (values (1,'2026-06-10','Module 1 · day 1',1),(1,'2026-06-24','Module 1 · day 2',1),(1,'2026-07-15','Module 2 · day 1',2),(1,'2026-08-05','Module 2 · day 2',2),
             (2,'2025-04-15','Module 1 · day 1',1),(2,'2025-06-10','Module 1 · day 2',1),(2,'2025-10-14','Module 2 · day 1',2),(2,'2026-01-20','Module 2 · day 2',2)) v(p,d,t,m)
on conflict (programme_id, session_date) do nothing;

-- P present, R absent with a valid reason, A absent (same letters as the live register)
insert into attendance (tenant_id, programme_id, learner_id, session_date, status)
select 'apex-preview', p, l, d::date, s from (values
 (1,1,'2026-06-10','P'),(1,1,'2026-06-24','P'),(1,1,'2026-07-15','P'),(1,1,'2026-08-05','P'),
 (1,5,'2026-06-10','P'),(1,5,'2026-06-24','R'),(1,5,'2026-07-15','P'),(1,5,'2026-08-05','P'),
 (1,7,'2026-06-10','A'),(1,7,'2026-06-24','P'),(1,7,'2026-07-15','A'),(1,7,'2026-08-05','P'),
 (2,2,'2025-04-15','P'),(2,2,'2025-06-10','P'),(2,2,'2025-10-14','R'),(2,2,'2026-01-20','P'),
 (2,4,'2025-04-15','P'),(2,4,'2025-06-10','P'),(2,4,'2025-10-14','P'),(2,4,'2026-01-20','P'),
 (2,8,'2025-04-15','A'),(2,8,'2025-06-10','A'),(2,8,'2025-10-14','P'),(2,8,'2026-01-20','A'),
 (2,10,'2025-04-15','P'),(2,10,'2025-06-10','P'),(2,10,'2025-10-14','P'),(2,10,'2026-01-20','P')) v(p,l,d,s)
on conflict (tenant_id, learner_id, programme_id, session_date) do nothing;

-- Module results (C competent, NYC not yet competent, RW rework, NS not submitted) + internal moderation
insert into eisa (tenant_id, programme_id, learner_id, module_number, km_result, pm_result, wm_result, fields)
select 'apex-preview', p, l, m, nullif(k,''), nullif(pr,''), nullif(w,''), case when mo then '{"Internal moderation":"Yes"}'::jsonb else '{}'::jsonb end from (values
 (1,1,1,'C','C','C',true),(1,1,2,'C','C','C',true),(1,1,3,'C','C','C',true),
 (1,5,1,'C','C','C',true),(1,5,2,'C','C','C',true),(1,5,3,'C','C','',false),
 (1,7,1,'C','C','C',true),(1,7,2,'NYC','C','',false),
 (2,2,1,'C','RW','C',true),(2,2,2,'C','C','C',true),
 (2,4,1,'C','C','C',true),(2,4,2,'C','C','C',false),
 (2,8,1,'C','NS','',false),
 (2,10,1,'C','C','C',true),(2,10,2,'C','C','C',true)) v(p,l,m,k,pr,w,mo)
on conflict (learner_id, programme_id, module_number) do nothing;

-- Learner 1 has an issued SoR, so one learner shows as fully EISA-ready
update qcto_tracker set sor_status = 'Issued', sor_issued_date = coalesce(sor_issued_date, '2026-10-01')
 where programme_id = 1 and learner_id = 1 and tenant_id = 'apex-preview';

select (select count(*) from program_modules) modules, (select count(*) from attendance_sessions) sessions,
       (select count(*) from attendance) attendance, (select count(*) from eisa) results;
