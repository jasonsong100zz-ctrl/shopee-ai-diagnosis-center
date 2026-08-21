alter table public.app_snapshots
  add column if not exists workspace_id uuid references public.brand_workspaces(id) on delete cascade;

alter table public.app_snapshots drop constraint if exists app_snapshots_pkey;
alter table public.app_snapshots add constraint app_snapshots_workspace_key_unique unique (workspace_id, key);

create index if not exists app_snapshots_workspace_idx on public.app_snapshots(workspace_id, key);

drop policy if exists snapshots_read on public.app_snapshots;
drop policy if exists snapshots_admin_write on public.app_snapshots;

create policy snapshots_read on public.app_snapshots for select to authenticated
using (
  (workspace_id is null and exists (select 1 from public.profiles where id = auth.uid() and active))
  or (workspace_id is not null and private.has_workspace_access(workspace_id))
);

create policy snapshots_admin_write on public.app_snapshots for all to authenticated
using (private.is_admin() and (workspace_id is null or private.has_workspace_access(workspace_id, true)))
with check (private.is_admin() and (workspace_id is null or private.has_workspace_access(workspace_id, true)));

grant select, insert, update, delete on public.app_snapshots to authenticated;
