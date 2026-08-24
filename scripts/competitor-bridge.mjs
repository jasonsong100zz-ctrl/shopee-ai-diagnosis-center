import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.COMPETITOR_BRIDGE_PORT || 8787);
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultWorkspaceId = process.env.COMPETITOR_WORKSPACE_ID;

function json(response, status, body) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }); response.end(JSON.stringify(body)); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
async function request(table, method, body, query = "") {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, { method, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${method}: HTTP ${response.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}
async function publish(payload) {
  if (!supabaseUrl || !serviceKey) throw new Error("桥接服务缺少 Supabase 环境变量");
  const workspaceId = payload.workspaceId || defaultWorkspaceId;
  if (!workspaceId || workspaceId !== defaultWorkspaceId) throw new Error("工作区 UUID 不匹配");
  const { record, snapshot } = payload;
  if (!record?.watch_key || !snapshot?.capture_date) throw new Error("缺少竞品记录或快照日期");
  const { source_row: ignoredSourceRow, ...watchRecord } = record;
  const rows = await request("competitor_watchlist", "POST", [{ workspace_id: workspaceId, ...watchRecord, last_capture_status: snapshot.capture_status, last_captured_at: snapshot.captured_at }], "?on_conflict=workspace_id,watch_key");
  const watchlistId = rows[0]?.id;
  if (!watchlistId) throw new Error("Supabase 未返回竞品链接 ID");
  const previous = await request("competitor_product_snapshots", "GET", undefined, `?workspace_id=eq.${workspaceId}&watchlist_id=eq.${watchlistId}&capture_date=lt.${snapshot.capture_date}&order=capture_date.desc&limit=1`);
  const row = { workspace_id: workspaceId, watchlist_id: watchlistId, captured_at: snapshot.captured_at, capture_date: snapshot.capture_date, product_title: snapshot.product_title, product_status: snapshot.product_status, price: snapshot.price, price_min: snapshot.price_min, price_max: snapshot.price_max, original_price: snapshot.original_price, discount_rate: snapshot.discount_rate, currency: snapshot.currency, promotion_summary: snapshot.promotion_summary || {}, effective_price: snapshot.effective_price, sold_total: snapshot.sold_total, rating: snapshot.rating, review_count: snapshot.review_count, stock_status: snapshot.stock_status, shipping_summary: snapshot.shipping_summary || {}, title_hash: snapshot.title_hash, image_hash: snapshot.image_hash, description_hash: snapshot.description_hash, source_url: snapshot.source_url, capture_status: snapshot.capture_status, error_message: snapshot.error_message, raw_hash: hash(JSON.stringify(snapshot)), raw_payload: snapshot };
  const saved = await request("competitor_product_snapshots", "POST", [row], "?on_conflict=watchlist_id,capture_date");
  const prior = previous[0];
  const events = [];
  if (prior && snapshot.capture_status !== "failed" && prior.capture_status !== "failed" && prior.price && snapshot.price) {
    const delta = snapshot.price - prior.price;
    const rate = delta / prior.price;
    if (Math.abs(rate) >= 0.05) events.push({ workspace_id: workspaceId, watchlist_id: watchlistId, snapshot_id: saved[0]?.id, event_date: snapshot.capture_date, event_key: hash(`${record.watch_key}|${snapshot.capture_date}|PRICE|${snapshot.price}`), event_type: rate < 0 ? "PRICE_DOWN" : "PRICE_UP", old_value: { price: prior.price }, new_value: { price: snapshot.price }, delta_value: delta, change_rate: rate, severity: rate < 0 ? "warning" : "info", evidence: { source: "chrome-extension" } });
  }
  if (events.length) await request("competitor_change_events", "POST", events, "?on_conflict=workspace_id,event_key");
  return { watchlist_id: watchlistId, snapshot_id: saved[0]?.id || null, event_count: events.length };
}
const server = createServer(async (requestMessage, response) => {
  if (requestMessage.method === "OPTIONS") return json(response, 204, {});
  if (requestMessage.method === "GET" && requestMessage.url === "/health") return json(response, 200, { ok: true, supabaseConfigured: Boolean(supabaseUrl && serviceKey), workspaceConfigured: Boolean(defaultWorkspaceId) });
  if (requestMessage.method !== "POST" || requestMessage.url !== "/publish") return json(response, 404, { error: "Not found" });
  let body = "";
  for await (const chunk of requestMessage) body += chunk;
  try { return json(response, 200, { ok: true, result: await publish(JSON.parse(body)) }); } catch (error) { return json(response, 500, { ok: false, error: error.message }); }
});
server.listen(port, "127.0.0.1", () => console.log(`Shopee competitor bridge listening on http://127.0.0.1:${port}`));
