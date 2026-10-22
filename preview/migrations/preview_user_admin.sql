-- ApexOne PREVIEW ONLY (apexone-preview, qszikynltvyplzqootrc). Never run on live.
-- 2026-10-22: User Management screen + Head of Operations test account.
-- Roles live in auth.users app_metadata (read by auth_has_role) and in preview_role_map
-- (applied at sign-up by preview_assign_role). These RPCs keep both in step. Admins only.
-- A role change takes effect when that user next signs in.

create or replace function public.preview_list_users()
returns table(email text, roles text[], tenant text, signed_up boolean, last_sign_in_at timestamptz, note text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.auth_is_admin() then raise exception 'Admins only'; end if;
  return query
  select lower(coalesce(u.email, m.email))::text,
         coalesce(case jsonb_typeof(u.raw_app_meta_data -> 'role')
                    when 'array'  then array(select jsonb_array_elements_text(u.raw_app_meta_data -> 'role'))
                    when 'string' then array[u.raw_app_meta_data ->> 'role'] end,
                  m.roles, '{}'::text[]),
         (u.raw_app_meta_data ->> 'tenant')::text,
         u.id is not null,
         u.last_sign_in_at,
         m.note
  from auth.users u
  full join public.preview_role_map m on lower(m.email) = lower(u.email)
  order by 1;
end $$;

create or replace function public.preview_set_user_roles(p_email text, p_roles text[], p_note text default null)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  e text := lower(trim(p_email));
  allowed text[] := array['admin','head_of_ops','qa_specialist','etqa','project_manager','operations','pi_specialist','compliance_officer'];
begin
  if not public.auth_is_admin() then raise exception 'Admins only'; end if;
  if e !~ '^[^@[:space:]]+@apexu\.co\.za$' then raise exception 'Only @apexu.co.za addresses can be added'; end if;
  if coalesce(array_length(p_roles, 1), 0) = 0 then raise exception 'Pick at least one role'; end if;
  if exists (select 1 from unnest(p_roles) r where not r = any(allowed)) then raise exception 'Unknown role'; end if;
  if e = lower(auth.jwt() ->> 'email') and not 'admin' = any(p_roles) then raise exception 'You cannot remove your own admin role'; end if;

  insert into public.preview_role_map(email, roles, note) values (e, p_roles, p_note)
  on conflict (email) do update set roles = excluded.roles, note = coalesce(excluded.note, public.preview_role_map.note);

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant', 'apex-preview', 'role', to_jsonb(p_roles))
   where lower(email) = e;

  insert into public.audit_log(action, table_name, record_id, user_name, user_role, changes, tenant_id)
  values ('update', 'users', e, auth.jwt() ->> 'email', 'admin', jsonb_build_object('roles', p_roles), 'apex-preview');
end $$;

create or replace function public.preview_remove_user(p_email text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare e text := lower(trim(p_email));
begin
  if not public.auth_is_admin() then raise exception 'Admins only'; end if;
  if e = lower(auth.jwt() ->> 'email') then raise exception 'You cannot remove yourself'; end if;
  delete from public.preview_role_map where lower(email) = e;
  -- access only: the sign-in account itself is kept, it just loses its roles and tenant
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role' - 'tenant' where lower(email) = e;
  insert into public.audit_log(action, table_name, record_id, user_name, user_role, changes, tenant_id)
  values ('delete', 'users', e, auth.jwt() ->> 'email', 'admin', '{}'::jsonb, 'apex-preview');
end $$;

revoke all on function public.preview_list_users() from public, anon;
revoke all on function public.preview_set_user_roles(text, text[], text) from public, anon;
revoke all on function public.preview_remove_user(text) from public, anon;
grant execute on function public.preview_list_users() to authenticated;
grant execute on function public.preview_set_user_roles(text, text[], text) to authenticated;
grant execute on function public.preview_remove_user(text) to authenticated;

-- Head of Operations test account (Consolidated view). Sign up with this address to use it.
insert into public.preview_role_map(email, roles, note)
values ('stavros+hoo@apexu.co.za', array['head_of_ops'], 'Head of Operations test account')
on conflict (email) do nothing;
