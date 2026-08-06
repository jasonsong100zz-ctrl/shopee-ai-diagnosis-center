create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.current_profile_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.has_shop_access(text) from public, anon;
revoke all on function public.has_module_write(text) from public, anon;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_shop_access(text) to authenticated;
grant execute on function public.has_module_write(text) to authenticated;


