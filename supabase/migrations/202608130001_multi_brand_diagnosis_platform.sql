create table if not exists public.brand_workspaces (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null unique check (brand_key ~ '^[a-z0-9][a-z0-9_-]{1,48}$'),
  brand_name text not null,
  market text not null default 'Shopee Indonesia',
  default_currency text not null default 'CNY',
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_workspace_access (
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  source_key text not null,
  source_name text not null,
  grain text not null check (grain in ('day','week','month','snapshot')),
  entity text not null check (entity in ('store','link','model','ads','orders','inventory','reviews')),
  status text not null default 'missing' check (status in ('ready','partial','missing','stale','error')),
  last_imported_at timestamptz,
  coverage_start date,
  coverage_end date,
  row_count integer not null default 0 check (row_count >= 0),
  schema_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_key, grain, entity)
);

create table if not exists public.diagnosis_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  config_key text not null,
  config_version integer not null default 1,
  active boolean not null default true,
  parameters jsonb not null default '{}'::jsonb,
  metric_definitions jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, config_key, config_version)
);

create table if not exists public.diagnosis_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  period_type text not null check (period_type in ('day','week','month','snapshot')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','running','ready','failed')),
  source_version text,
  data_quality jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, period_type, period_start, period_end, source_version)
);

create table if not exists public.diagnosis_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.diagnosis_runs(id) on delete cascade,
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('store','category','link','model','ad','campaign')),
  entity_key text not null,
  diagnosis_key text not null,
  priority text not null default 'P2' check (priority in ('P0','P1','P2','P3')),
  confidence numeric(5,4) check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '[]'::jsonb,
  conclusion text not null,
  recommended_actions jsonb not null default '[]'::jsonb,
  verification_plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, entity_type, entity_key, diagnosis_key)
);

alter table public.brand_workspaces enable row level security;
alter table public.brand_workspace_access enable row level security;
alter table public.data_sources enable row level security;
alter table public.diagnosis_configs enable row level security;
alter table public.diagnosis_runs enable row level security;
alter table public.diagnosis_results enable row level security;

create or replace function private.has_workspace_access(target_workspace uuid, write_access boolean default false)
returns boolean language sql stable security definer set search_path = public, private
as $$ select private.is_admin() or exists (
  select 1 from public.brand_workspace_access a
  where a.workspace_id = target_workspace and a.user_id = auth.uid() and (not write_access or a.can_write = true)
) $$;

create policy brand_workspaces_read on public.brand_workspaces for select to authenticated
using (private.has_workspace_access(id));
create policy brand_workspaces_admin_write on public.brand_workspaces for all to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy workspace_access_read on public.brand_workspace_access for select to authenticated
using (user_id = auth.uid() or private.is_admin());
create policy workspace_access_admin_write on public.brand_workspace_access for all to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy data_sources_read on public.data_sources for select to authenticated
using (private.has_workspace_access(workspace_id));
create policy data_sources_write on public.data_sources for all to authenticated
using (private.has_workspace_access(workspace_id, true)) with check (private.has_workspace_access(workspace_id, true));

create policy diagnosis_configs_read on public.diagnosis_configs for select to authenticated
using (private.has_workspace_access(workspace_id));
create policy diagnosis_configs_write on public.diagnosis_configs for all to authenticated
using (private.has_workspace_access(workspace_id, true)) with check (private.has_workspace_access(workspace_id, true));

create policy diagnosis_runs_read on public.diagnosis_runs for select to authenticated
using (private.has_workspace_access(workspace_id));
create policy diagnosis_runs_write on public.diagnosis_runs for all to authenticated
using (private.has_workspace_access(workspace_id, true)) with check (private.has_workspace_access(workspace_id, true));

create policy diagnosis_results_read on public.diagnosis_results for select to authenticated
using (private.has_workspace_access(workspace_id));
create policy diagnosis_results_write on public.diagnosis_results for all to authenticated
using (private.has_workspace_access(workspace_id, true)) with check (private.has_workspace_access(workspace_id, true));

grant select, insert, update, delete on public.brand_workspaces, public.brand_workspace_access, public.data_sources, public.diagnosis_configs, public.diagnosis_runs, public.diagnosis_results to authenticated;
grant execute on function private.has_workspace_access(uuid, boolean) to authenticated;

create trigger brand_workspaces_updated_at before update on public.brand_workspaces for each row execute function private.set_updated_at();
create trigger data_sources_updated_at before update on public.data_sources for each row execute function private.set_updated_at();
create trigger diagnosis_configs_updated_at before update on public.diagnosis_configs for each row execute function private.set_updated_at();
