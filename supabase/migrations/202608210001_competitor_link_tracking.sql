create table if not exists public.competitor_watchlist (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  category text not null,
  product_name text not null,
  competitor_brand text not null,
  market text not null check (market = upper(market) and length(market) between 2 and 8),
  product_url text not null,
  shop_id text not null,
  item_id text not null,
  model_id text,
  watch_key text not null,
  enabled boolean not null default true,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  own_product_id text,
  target_model text,
  tracking_frequency text not null default 'daily' check (tracking_frequency in ('daily', 'weekly')),
  notes text,
  last_capture_status text check (last_capture_status in ('complete', 'partial', 'failed')),
  last_captured_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists competitor_watchlist_identity_idx
  on public.competitor_watchlist (workspace_id, watch_key);

create table if not exists public.competitor_product_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  watchlist_id uuid not null references public.competitor_watchlist(id) on delete cascade,
  captured_at timestamptz not null default now(),
  capture_date date not null,
  product_title text,
  product_status text,
  price numeric(18,2),
  price_min numeric(18,2),
  price_max numeric(18,2),
  original_price numeric(18,2),
  discount_rate numeric(7,4) check (discount_rate is null or (discount_rate >= 0 and discount_rate <= 1)),
  currency text,
  promotion_summary jsonb not null default '{}'::jsonb,
  effective_price numeric(18,2),
  sold_total bigint check (sold_total is null or sold_total >= 0),
  rating numeric(3,2) check (rating is null or (rating >= 0 and rating <= 5)),
  review_count bigint check (review_count is null or review_count >= 0),
  stock_status text,
  shipping_summary jsonb not null default '{}'::jsonb,
  title_hash text,
  image_hash text,
  description_hash text,
  source_url text not null,
  capture_status text not null check (capture_status in ('complete', 'partial', 'failed')),
  error_message text,
  raw_hash text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists competitor_product_snapshot_day_idx
  on public.competitor_product_snapshots (watchlist_id, capture_date);
create index if not exists competitor_product_snapshot_workspace_date_idx
  on public.competitor_product_snapshots (workspace_id, capture_date desc);
create index if not exists competitor_product_snapshot_item_date_idx
  on public.competitor_product_snapshots (workspace_id, watchlist_id, captured_at desc);

create table if not exists public.competitor_change_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.brand_workspaces(id) on delete cascade,
  watchlist_id uuid not null references public.competitor_watchlist(id) on delete cascade,
  snapshot_id uuid references public.competitor_product_snapshots(id) on delete set null,
  event_date date not null,
  event_key text not null,
  event_type text not null,
  old_value jsonb,
  new_value jsonb,
  delta_value numeric(18,4),
  change_rate numeric(12,6),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists competitor_change_events_workspace_date_idx
  on public.competitor_change_events (workspace_id, event_date desc, severity);
create index if not exists competitor_change_events_watchlist_date_idx
  on public.competitor_change_events (watchlist_id, event_date desc);
create unique index if not exists competitor_change_events_key_idx
  on public.competitor_change_events (workspace_id, event_key);

alter table public.competitor_watchlist enable row level security;
alter table public.competitor_product_snapshots enable row level security;
alter table public.competitor_change_events enable row level security;

drop policy if exists competitor_watchlist_read on public.competitor_watchlist;
drop policy if exists competitor_watchlist_write on public.competitor_watchlist;
drop policy if exists competitor_snapshots_read on public.competitor_product_snapshots;
drop policy if exists competitor_snapshots_write on public.competitor_product_snapshots;
drop policy if exists competitor_events_read on public.competitor_change_events;
drop policy if exists competitor_events_write on public.competitor_change_events;

create policy competitor_watchlist_read on public.competitor_watchlist for select to authenticated
using (private.has_workspace_access(workspace_id));
create policy competitor_watchlist_write on public.competitor_watchlist for all to authenticated
using (private.has_workspace_access(workspace_id, true))
with check (private.has_workspace_access(workspace_id, true));

create policy competitor_snapshots_read on public.competitor_product_snapshots for select to authenticated
using (private.has_workspace_access(workspace_id));
create policy competitor_snapshots_write on public.competitor_product_snapshots for all to authenticated
using (private.has_workspace_access(workspace_id, true))
with check (private.has_workspace_access(workspace_id, true));

create policy competitor_events_read on public.competitor_change_events for select to authenticated
using (private.has_workspace_access(workspace_id));
create policy competitor_events_write on public.competitor_change_events for all to authenticated
using (private.has_workspace_access(workspace_id, true))
with check (private.has_workspace_access(workspace_id, true));

grant select, insert, update, delete on public.competitor_watchlist,
  public.competitor_product_snapshots,
  public.competitor_change_events to authenticated;

drop trigger if exists competitor_watchlist_updated_at on public.competitor_watchlist;
create trigger competitor_watchlist_updated_at
before update on public.competitor_watchlist
for each row execute function private.set_updated_at();

drop trigger if exists audit_competitor_watchlist on public.competitor_watchlist;
create trigger audit_competitor_watchlist
after insert or update or delete on public.competitor_watchlist
for each row execute function private.audit_row_change();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'competitor_watchlist') then
    alter publication supabase_realtime add table public.competitor_watchlist;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'competitor_product_snapshots') then
    alter publication supabase_realtime add table public.competitor_product_snapshots;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'competitor_change_events') then
    alter publication supabase_realtime add table public.competitor_change_events;
  end if;
end $$;
