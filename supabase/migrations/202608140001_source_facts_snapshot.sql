alter table public.app_snapshots
  drop constraint if exists app_snapshots_key_check;

alter table public.app_snapshots
  add constraint app_snapshots_key_check
  check (key in ('dashboard', 'module1', 'definitions', 'sourceFacts'));
