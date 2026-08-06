create type public.app_role as enum ('admin', 'employee', 'viewer');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.approval_status as enum ('draft', 'submitted', 'approved', 'rejected', 'executed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role public.app_role not null default 'employee',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_allowlist (
  email text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;

create table public.user_shop_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_name)
);

create table public.user_module_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null check (module_key in ('overview','listing','ads','funnel','customer','control','subsidy','data')),
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, module_key)
);

create table public.app_snapshots (
  key text primary key check (key in ('dashboard','module1','definitions')),
  payload jsonb not null,
  source_version text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  generated_key text unique,
  module_key text not null,
  shop_name text,
  product_id text,
  title text not null,
  detail text,
  priority text not null default 'P2',
  status public.task_status not null default 'todo',
  assigned_to uuid references public.profiles(id),
  due_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_updates (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  body text not null,
  status public.task_status,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.subsidy_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  shop_name text not null,
  product_id text not null,
  model_id text,
  budget_cny numeric(14,2) not null check (budget_cny >= 0),
  discount_depth numeric(7,4),
  recommended_price numeric(14,2),
  status public.approval_status not null default 'draft',
  diagnosis jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index tasks_shop_idx on public.tasks(shop_name);
create index tasks_assigned_idx on public.tasks(assigned_to, status);
create index task_updates_task_idx on public.task_updates(task_id, created_at desc);
create index subsidy_plans_shop_idx on public.subsidy_plans(shop_name, status);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.current_profile_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_profile_role() = 'admin', false) $$;

create or replace function public.has_shop_access(target_shop text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.user_shop_access
    where user_id = auth.uid() and shop_name = target_shop
  )
$$;

create or replace function public.has_module_write(target_module text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.user_module_access
    where user_id = auth.uid() and module_key = target_module and can_write = true
  )
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, new.id::text), coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)));
  update public.profiles
  set role = 'admin'
  where id = new.id
    and exists (select 1 from public.admin_allowlist where lower(email) = lower(coalesce(new.email, '')) and enabled = true);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger subsidy_updated_at before update on public.subsidy_plans for each row execute function public.set_updated_at();

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs(actor_id, table_name, record_id, action, old_data, new_data)
  values (
    auth.uid(), TG_TABLE_NAME,
    coalesce((case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
             (case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'key'),
    TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_tasks after insert or update or delete on public.tasks for each row execute function public.audit_row_change();
create trigger audit_subsidy after insert or update or delete on public.subsidy_plans for each row execute function public.audit_row_change();
create trigger audit_snapshots after insert or update or delete on public.app_snapshots for each row execute function public.audit_row_change();

alter table public.profiles enable row level security;
alter table public.user_shop_access enable row level security;
alter table public.user_module_access enable row level security;
alter table public.app_snapshots enable row level security;
alter table public.tasks enable row level security;
alter table public.task_updates enable row level security;
alter table public.subsidy_plans enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy shop_access_select on public.user_shop_access for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy shop_access_admin_write on public.user_shop_access for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy module_access_select on public.user_module_access for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy module_access_admin_write on public.user_module_access for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy snapshots_read on public.app_snapshots for select to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and active));
create policy snapshots_admin_write on public.app_snapshots for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy tasks_read on public.tasks for select to authenticated using (public.is_admin() or assigned_to = auth.uid() or public.has_shop_access(shop_name));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.has_module_write(module_key) and created_by = auth.uid() and (shop_name is null or public.has_shop_access(shop_name)));
create policy tasks_update on public.tasks for update to authenticated using (public.is_admin() or assigned_to = auth.uid() or (public.has_shop_access(shop_name) and public.has_module_write(module_key))) with check (public.is_admin() or assigned_to = auth.uid() or (public.has_shop_access(shop_name) and public.has_module_write(module_key)));
create policy tasks_admin_delete on public.tasks for delete to authenticated using (public.is_admin());

create policy task_updates_read on public.task_updates for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id));
create policy task_updates_insert on public.task_updates for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy task_updates_admin_delete on public.task_updates for delete to authenticated using (public.is_admin());

create policy subsidy_read on public.subsidy_plans for select to authenticated using (public.is_admin() or public.has_shop_access(shop_name));
create policy subsidy_insert on public.subsidy_plans for insert to authenticated with check (created_by = auth.uid() and public.has_shop_access(shop_name) and public.has_module_write('subsidy') and status = 'draft');
create policy subsidy_employee_update on public.subsidy_plans for update to authenticated using (public.is_admin() or (created_by = auth.uid() and status = 'draft')) with check (public.is_admin() or (created_by = auth.uid() and status = 'draft'));
create policy subsidy_admin_delete on public.subsidy_plans for delete to authenticated using (public.is_admin());

create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_shop_access, public.user_module_access to authenticated;
grant select, insert, update, delete on public.app_snapshots, public.tasks, public.task_updates, public.subsidy_plans to authenticated;
grant select on public.audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_updates') then
    alter publication supabase_realtime add table public.task_updates;
  end if;
end $$;

