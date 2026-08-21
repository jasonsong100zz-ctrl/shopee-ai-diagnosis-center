import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function request(baseUrl, serviceKey, table, method, body, query = "") {
  const response = await fetch(`${baseUrl}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`${table} ${method} failed: HTTP ${response.status} ${responseText.slice(0, 500)}`);
  return responseText ? JSON.parse(responseText) : [];
}

const snapshotPath = resolve(option("--snapshot", "tmp/competitor-snapshots/latest.json"));
const workspaceId = option("--workspace-id") || requiredEnv("COMPETITOR_WORKSPACE_ID");
const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const source = JSON.parse(await readFile(snapshotPath, "utf8"));
const watchlistPath = option("--watchlist");
const watchlist = watchlistPath ? JSON.parse(await readFile(resolve(watchlistPath), "utf8")) : null;
const watchlistByKey = new Map((watchlist?.records || []).map((record) => [record.watch_key, record]));

const watchlistRows = source.records.map((snapshot) => {
  const record = watchlistByKey.get(snapshot.watch_key) || snapshot;
  return {
    workspace_id: workspaceId,
    category: record.category || snapshot.category || "未分类",
    product_name: record.product_name || snapshot.product_name || "未命名商品",
    competitor_brand: record.competitor_brand || snapshot.competitor_brand || "未标注品牌",
    market: record.market || snapshot.market,
    product_url: record.product_url || snapshot.source_url,
    shop_id: record.shop_id || snapshot.shop_id,
    item_id: record.item_id || snapshot.item_id,
    model_id: record.model_id || null,
    watch_key: snapshot.watch_key,
    enabled: record.enabled !== false,
    priority: record.priority || "medium",
    own_product_id: record.own_product_id || null,
    target_model: record.target_model || null,
    tracking_frequency: record.tracking_frequency || "daily",
    notes: record.notes || null,
    last_capture_status: snapshot.capture_status,
    last_captured_at: snapshot.captured_at,
  };
});

const savedWatchlist = await request(supabaseUrl, serviceKey, "competitor_watchlist", "POST", watchlistRows, "?on_conflict=workspace_id,watch_key");
const idByKey = new Map(savedWatchlist.map((row) => [row.watch_key, row.id]));
if (idByKey.size !== watchlistRows.length) throw new Error("Supabase 未返回全部竞品链接 ID，已停止发布快照");

const snapshotRows = source.records.map((snapshot) => ({
  workspace_id: workspaceId,
  watchlist_id: idByKey.get(snapshot.watch_key),
  captured_at: snapshot.captured_at,
  capture_date: snapshot.capture_date,
  product_title: snapshot.product_title,
  product_status: snapshot.product_status,
  price: snapshot.price,
  price_min: snapshot.price_min,
  price_max: snapshot.price_max,
  original_price: snapshot.original_price,
  discount_rate: snapshot.discount_rate,
  currency: snapshot.currency,
  promotion_summary: snapshot.promotion_summary || {},
  effective_price: snapshot.effective_price,
  sold_total: snapshot.sold_total,
  rating: snapshot.rating,
  review_count: snapshot.review_count,
  stock_status: snapshot.stock_status,
  shipping_summary: snapshot.shipping_summary || {},
  title_hash: snapshot.title_hash,
  image_hash: snapshot.image_hash,
  description_hash: snapshot.description_hash,
  source_url: snapshot.source_url,
  capture_status: snapshot.capture_status,
  error_message: snapshot.error_message,
  raw_hash: hash(JSON.stringify(snapshot)),
}));
await request(supabaseUrl, serviceKey, "competitor_product_snapshots", "POST", snapshotRows, "?on_conflict=watchlist_id,capture_date");

const eventRows = source.events.map((event) => ({
  workspace_id: workspaceId,
  watchlist_id: idByKey.get(event.watch_key),
  event_date: event.event_date,
  event_key: hash(`${event.watch_key}|${event.event_date}|${event.event_type}|${JSON.stringify(event.new_value)}`),
  event_type: event.event_type,
  old_value: event.old_value,
  new_value: event.new_value,
  delta_value: event.delta_value,
  change_rate: event.change_rate,
  severity: event.severity,
  evidence: event.evidence || {},
}));
if (eventRows.length > 0) {
  await request(supabaseUrl, serviceKey, "competitor_change_events", "POST", eventRows, "?on_conflict=workspace_id,event_key");
}

console.log(JSON.stringify({ watchlist_rows: watchlistRows.length, snapshot_rows: snapshotRows.length, event_rows: eventRows.length, capture_date: source.capture_date }));
