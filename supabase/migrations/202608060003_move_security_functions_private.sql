create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.current_profile_role() set schema private;
alter function public.is_admin() set schema private;
alter function public.has_shop_access(text) set schema private;
alter function public.has_module_write(text) set schema private;
alter function public.audit_row_change() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.set_updated_at() set schema private;

create or replace function private.current_profile_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = public, private
as $$ select coalesce(private.current_profile_role() = 'admin', false) $$;

create or replace function private.has_shop_access(target_shop text)
returns boolean
language sql stable security definer set search_path = public, private
as $$
  select private.is_admin() or exists (
    select 1 from public.user_shop_access
    where user_id = auth.uid() and shop_name = target_shop
  )
$$;

create or replace function private.has_module_write(target_module text)
returns boolean
language sql stable security definer set search_path = public, private
as $$
  select private.is_admin() or exists (
    select 1 from public.user_module_access
    where user_id = auth.uid() and module_key = target_module and can_write = true
  )
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_shop_access(text) to authenticated;
grant execute on function private.has_module_write(text) to authenticated;
revoke all on function private.audit_row_change() from authenticated;
revoke all on function private.handle_new_user() from authenticated;
revoke all on function private.set_updated_at() from authenticated;


