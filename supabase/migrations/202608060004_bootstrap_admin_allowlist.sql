create table if not exists public.admin_allowlist (
  email text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;
create policy admin_allowlist_admin_read on public.admin_allowlist for select to authenticated using (private.is_admin());
grant select on public.admin_allowlist to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, new.id::text), coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  update public.profiles
  set role = 'admin'
  where id = new.id
    and exists (select 1 from public.admin_allowlist where lower(email) = lower(coalesce(new.email, '')) and enabled = true);
  return new;
end;
$$;

