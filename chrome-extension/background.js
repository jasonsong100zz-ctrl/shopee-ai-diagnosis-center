const DEFAULTS = {
  sheetUrl: "https://docs.google.com/spreadsheets/d/1sQfu_8VCBhH3WnKp67It3RwiB8vQRLjBzSWY9ndWI8w/export?format=csv&gid=0",
  bridgeUrl: "http://127.0.0.1:8787",
  workspaceId: "d67e57a2-b486-41e3-9321-bdf8b30ae6c6"
};

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"') {
      if (quoted && next === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(value); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = "";
    } else value += character;
  }
  if (value || row.length) { row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); }
  const headers = (rows.shift() || []).map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.map((cells, index) => {
    const record = Object.fromEntries(headers.map((header, column) => [header, (cells[column] || "").trim()]));
    record.source_row = index + 2;
    return record;
  });
}

function sheetCsvUrl(input) {
  const value = String(input || "").trim();
  if (!value) throw new Error("请填写 Google Sheet 链接");
  const url = new URL(value);
  if (url.hostname !== "docs.google.com" || !url.pathname.startsWith("/spreadsheets/")) return value;
  const match = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (!match) return value;
  const gid = url.searchParams.get("gid") || url.hash.match(/gid=(\d+)/)?.[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

function normalizeRows(input) {
  return parseCsv(input).map((record) => {
    const url = new URL(record["竞品链接"]);
    const match = url.pathname.match(/-i\.(\d+)\.(\d+)/i);
    if (!match) throw new Error(`第 ${record.source_row} 行没有商品 ID`);
    const market = { "shopee.co.id": "ID", "shopee.com.my": "MY", "shopee.sg": "SG", "shopee.co.th": "TH", "shopee.ph": "PH", "shopee.vn": "VN", "shopee.tw": "TW" }[url.hostname];
    if (!market) throw new Error(`第 ${record.source_row} 行不是支持的 Shopee 市场`);
    const enabled = !["false", "0", "no", "n", "否", "停用"].includes(String(record.enabled || "").toLowerCase());
    return { source_row: record.source_row, category: record["品类"], product_name: record["产品"], competitor_brand: record["竞对品牌"], product_url: `${url.origin}${url.pathname}`, market: record.market?.trim().toUpperCase() || market, shop_id: match[1], item_id: match[2], model_id: record.model_id || null, watch_key: `${market}:${match[1]}:${match[2]}:${record.model_id || ""}`, enabled, priority: record.priority || "medium", own_product_id: record.own_product_id || null, target_model: record.target_model || null, tracking_frequency: record.tracking_frequency || "daily", notes: record.notes || null };
  }).filter((record) => record.enabled);
}

const REPORT_HEADERS = ["结果", "清单行号", "品类", "产品", "竞对品牌", "市场", "商品链接", "商品标题", "采集日期", "采集状态", "价格", "原价", "折扣", "币种", "评分", "评论数", "累计已售（代理）", "库存状态", "卖家", "品牌", "SKU数量", "优惠券数量", "配送摘要", "促销摘要", "错误信息"];

function linesText(value) { return Array.isArray(value?.lines) ? value.lines.join(" | ") : ""; }
function percentText(value) { return Number.isFinite(value) ? `${Number((value * 100).toFixed(2))}%` : ""; }
function reportRow(record, snapshot) {
  return {
    "结果": "成功",
    "清单行号": record.source_row ?? "",
    "品类": record.category || "",
    "产品": record.product_name || "",
    "竞对品牌": record.competitor_brand || "",
    "市场": record.market || "",
    "商品链接": snapshot.source_url || record.product_url || "",
    "商品标题": snapshot.product_title || "",
    "采集日期": snapshot.capture_date || "",
    "采集状态": snapshot.capture_status || "",
    "价格": snapshot.price ?? "",
    "原价": snapshot.original_price ?? "",
    "折扣": percentText(snapshot.discount_rate),
    "币种": snapshot.currency || "",
    "评分": snapshot.rating ?? "",
    "评论数": snapshot.review_count ?? "",
    "累计已售（代理）": snapshot.sold_total ?? "",
    "库存状态": snapshot.stock_status || snapshot.product_status || "",
    "卖家": snapshot.seller_name || "",
    "品牌": snapshot.brand_name || "",
    "SKU数量": snapshot.model_names?.length ?? "",
    "优惠券数量": snapshot.voucher_lines?.length ?? "",
    "配送摘要": linesText(snapshot.shipping_summary),
    "促销摘要": linesText(snapshot.promotion_summary),
    "错误信息": snapshot.error_message || ""
  };
}
function failedReportRow(item) {
  const record = item.record || {};
  return { "结果": "失败", "清单行号": item.source_row ?? "", "品类": record.category || "", "产品": item.product_name || record.product_name || "", "竞对品牌": record.competitor_brand || "", "市场": record.market || "", "商品链接": item.product_url || record.product_url || "", "错误信息": item.error || "" };
}
function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function buildReportCsv(state) {
  const rows = [...(state.reportRows || []), ...(state.failed || []).map(failedReportRow)];
  return `\uFEFF${[REPORT_HEADERS, ...rows.map((row) => REPORT_HEADERS.map((header) => row[header] ?? ""))].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
function reportFileName(state) { return state.reportFileName || `FM竞品监控-${new Date().toISOString().slice(0, 10)}.csv`; }
async function getState() { return chrome.storage.local.get({ settings: DEFAULTS, queue: [], index: 0, running: false, paused: false, status: "未开始", results: [], reportRows: [], failed: [], reportFileName: null, downloadPath: null }); }
async function updateBadge(state) {
  if (state.paused) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
    await chrome.action.setTitle({ title: `FM 竞品监控：${state.status}` });
    return;
  }
  if (state.running) {
    await chrome.action.setBadgeText({ text: state.queue?.length ? `${Math.min(state.index, 99)}` : "…" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    await chrome.action.setTitle({ title: `FM 竞品监控：${state.status}` });
    return;
  }
  if (state.status?.startsWith("监控完成")) {
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
    await chrome.action.setTitle({ title: "FM 竞品监控：已完成" });
    return;
  }
  if (state.status?.startsWith("失败")) {
    await chrome.action.setBadgeText({ text: "×" });
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    await chrome.action.setTitle({ title: `FM 竞品监控：${state.status}` });
    return;
  }
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "FM 竞品监控" });
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
  const state = { ...(await getState()), ...patch };
  await updateBadge(state);
  chrome.runtime.sendMessage({ type: "STATE", state }).catch(() => {});
}

async function fetchQueue(settings) {
  const csvUrl = sheetCsvUrl(settings.sheetUrl);
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error(`读取 Google Sheet 失败: HTTP ${response.status}`);
  const queue = normalizeRows(await response.text());
  if (!queue.length) throw new Error("清单中没有启用的有效竞品链接");
  return { csvUrl, queue };
}

async function ensureTab() {
  const state = await getState();
  if (state.tabId) { try { await chrome.tabs.get(state.tabId); return state.tabId; } catch {} }
  const tab = await chrome.tabs.create({ url: "https://shopee.co.id/", active: true });
  await setState({ tabId: tab.id });
  return tab.id;
}

function waitForTab(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => { if (updatedTabId === tabId && changeInfo.status === "complete") { chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function collectCurrent() {
  while (true) {
    const state = await getState();
    if (!state.running || state.paused) return;
    const record = state.queue[state.index];
    if (!record) return finish();
    try {
      const tabId = await ensureTab();
      await chrome.tabs.update(tabId, { url: record.product_url, active: true });
      await waitForTab(tabId);
      await new Promise((resolve) => setTimeout(resolve, 2200));
      const current = await getState();
      if (!current.running || current.paused) return;
      const result = await chrome.tabs.sendMessage(tabId, { type: "COLLECT_COMPETITOR", record });
      if (["captcha", "login", "redirected"].includes(result.status)) return setState({ paused: true, status: `已暂停：${result.error}`, current: record });
      if (result.status === "error") throw new Error(result.error);
      const settings = (await getState()).settings;
      const response = await fetch(`${settings.bridgeUrl.replace(/\/$/, "")}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: settings.workspaceId, record, snapshot: result.snapshot }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `发布失败: HTTP ${response.status}`);
      const latest = await getState();
      await setState({ results: [...latest.results, { watch_key: record.watch_key, product_name: record.product_name, status: result.snapshot.capture_status, published: true }], reportRows: [...(latest.reportRows || []), reportRow(record, result.snapshot)], index: latest.index + 1, status: `已完成 ${latest.index + 1}/${latest.queue.length}` });
    } catch (error) {
      const latest = await getState();
      if (!latest.running || latest.paused) return;
      const failure = { source_row: record.source_row, watch_key: record.watch_key, product_name: record.product_name, product_url: record.product_url, record, error: error.message || String(error) };
      await setState({ failed: [...latest.failed, failure], index: latest.index + 1, status: `已处理 ${latest.index + 1}/${latest.queue.length}，失败 ${latest.failed.length + 1} 条` });
    }
  }
}

async function finish() {
  const state = await getState();
  const fileName = reportFileName(state);
  await setState({ running: false, paused: false, reportFileName: fileName, downloadPath: `Chrome 下载目录/${fileName}`, status: state.failed.length ? `监控完成：成功 ${state.results.length} 条，失败 ${state.failed.length} 条` : `监控完成：成功 ${state.results.length} 条` });
}

async function downloadReport() {
  const state = await getState();
  if (state.running || !state.status?.startsWith("监控完成")) throw new Error("任务尚未完成，暂时没有可下载结果");
  const fileName = reportFileName(state);
  const downloadId = await chrome.downloads.download({ url: `data:text/csv;charset=utf-8,${encodeURIComponent(buildReportCsv(state))}`, filename: fileName, saveAs: true });
  await setState({ reportFileName: fileName, downloadPath: `Chrome 下载目录/${fileName}`, status: `${state.status} · 下载已发起` });
  return { ok: true, downloadId, fileName };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_STATE") getState().then(sendResponse);
  if (message?.type === "SAVE_SETTINGS") chrome.storage.local.set({ settings: { ...DEFAULTS, ...message.settings } }).then(() => sendResponse({ ok: true }));
  if (message?.type === "START") {
    (async () => {
      const current = await getState();
      if (current.running) return;
      const settings = { ...DEFAULTS, ...message.settings, sheetUrl: sheetCsvUrl(message.settings?.sheetUrl || DEFAULTS.sheetUrl) };
      await chrome.storage.local.set({ settings });
      const fetched = await fetchQueue(settings);
      await setState({ queue: fetched.queue, index: 0, results: [], reportRows: [], failed: [], reportFileName: null, downloadPath: null, running: true, paused: false, status: `已读取 ${fetched.queue.length} 条链接` });
      await collectCurrent();
    })().catch((error) => setState({ running: false, paused: true, status: `失败：${error.message}` }));
    sendResponse({ ok: true });
  }
  if (message?.type === "RESUME") { setState({ running: true, paused: false, status: "继续采集" }).then(() => collectCurrent()).catch((error) => setState({ paused: true, status: `失败：${error.message}` })); sendResponse({ ok: true }); }
  if (message?.type === "RETRY_FAILED") {
    (async () => {
      const state = await getState();
      if (state.running || !state.failed.length) return;
      await setState({ queue: state.failed.map((item) => item.record), index: 0, failed: [], reportFileName: null, downloadPath: null, running: true, paused: false, status: `准备重试 ${state.failed.length} 条链接` });
      await collectCurrent();
    })().catch((error) => setState({ running: false, paused: true, status: `失败：${error.message}` }));
    sendResponse({ ok: true });
  }
  if (message?.type === "DOWNLOAD_REPORT") {
    downloadReport().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  }
  if (message?.type === "STOP") setState({ running: false, paused: false, status: "已停止" }).then(() => sendResponse({ ok: true }));
  return true;
});
