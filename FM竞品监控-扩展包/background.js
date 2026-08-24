const DEFAULTS = {
  sheetUrl: "https://docs.google.com/spreadsheets/d/1sQfu_8VCBhH3WnKp67It3RwiB8vQRLjBzSWY9ndWI8w/export?format=csv&gid=0",
  bridgeUrl: "http://127.0.0.1:8787",
  workspaceId: "d67e57a2-b486-41e3-9321-bdf8b30ae6c6",
  mode: "offline",
  syncMode: "none",
  syncEndpoint: "",
  syncKey: ""
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

const REPORT_HEADERS = ["采集日期", "品类", "产品", "竞对品牌", "市场", "商品链接", "店铺ID", "商品ID", "商品标题", "当前价格", "原价", "折扣率", "币种", "最低SKU价格", "最高SKU价格", "SKU ID", "SKU名称", "SKU价格", "SKU原价", "SKU库存", "SKU价格状态", "SKU价格明细", "库存状态", "累计已售代理值", "评分", "评论数", "促销摘要", "优惠券", "配送摘要", "采集状态", "失败原因"];

function linesText(value) { return Array.isArray(value?.lines) ? value.lines.join(" | ") : ""; }
function percentText(value) { return Number.isFinite(value) ? `${Number((value * 100).toFixed(2))}%` : ""; }
function reportRowsFor(record, snapshot) {
  const baseRow = {
    "采集日期": snapshot.capture_date || "",
    "品类": record.category || "",
    "产品": record.product_name || "",
    "竞对品牌": record.competitor_brand || "",
    "市场": record.market || "",
    "商品链接": snapshot.source_url || record.product_url || "",
    "店铺ID": record.shop_id || "",
    "商品ID": record.item_id || "",
    "商品标题": snapshot.product_title || "",
    "当前价格": snapshot.price ?? "",
    "原价": snapshot.original_price ?? "",
    "折扣率": percentText(snapshot.discount_rate),
    "币种": snapshot.currency || "",
    "最低SKU价格": snapshot.price_min ?? "",
    "最高SKU价格": snapshot.price_max ?? "",
    "库存状态": snapshot.stock_status || snapshot.product_status || "",
    "累计已售代理值": snapshot.sold_total ?? "",
    "评分": snapshot.rating ?? "",
    "评论数": snapshot.review_count ?? "",
    "促销摘要": linesText(snapshot.promotion_summary),
    "优惠券": (snapshot.voucher_lines || []).join(" | "),
    "配送摘要": linesText(snapshot.shipping_summary),
    "采集状态": snapshot.capture_status || "",
    "失败原因": snapshot.error_message || ""
  };
  const models = snapshot.model_prices || [];
  if (!models.length) return [{ ...baseRow, "SKU名称": (snapshot.model_names || []).join(" | "), "SKU价格状态": "未识别 SKU", "SKU价格明细": "" }];
  return models.map((model) => {
    const priceStatus = model.price === null || model.price === undefined ? "需选择确认" : "已确认";
    const priceText = model.price === null || model.price === undefined ? "需选择确认" : `${model.price}${model.currency ? ` ${model.currency}` : ""}`;
    return { ...baseRow, "SKU ID": model.model_id ?? "", "SKU名称": model.model_name || "未命名", "SKU价格": model.price ?? "", "SKU原价": model.original_price ?? "", "SKU库存": model.stock ?? "", "SKU价格状态": priceStatus, "SKU价格明细": snapshot.model_price_capture_status === "requires_selection" ? `价格未完整提供（当前页只确认当前 SKU）：${priceText}` : priceText };
  });
}
function failedReportRow(item) {
  const record = item.record || {};
  return { "采集日期": new Date().toISOString().slice(0, 10), "品类": record.category || "", "产品": item.product_name || record.product_name || "", "竞对品牌": record.competitor_brand || "", "市场": record.market || "", "商品链接": item.product_url || record.product_url || "", "店铺ID": record.shop_id || "", "商品ID": record.item_id || "", "采集状态": "failed", "失败原因": item.error || "" };
}
function csvCell(value, header) {
  const text = String(value ?? "");
  const safeText = /^(店铺ID|商品ID|SKU ID)$/.test(header) && text ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}
function buildReportCsv(state) {
  const rows = [...(state.reportRows || []), ...(state.failed || []).map(failedReportRow)];
  return `\uFEFF${[REPORT_HEADERS, ...rows.map((row) => REPORT_HEADERS.map((header) => row[header] ?? ""))].map((row) => row.map((value, columnIndex) => csvCell(value, REPORT_HEADERS[columnIndex])).join(",")).join("\r\n")}`;
}
function reportFileName(state) { return state.reportFileName || `FM竞品监控-${new Date().toISOString().slice(0, 10)}.csv`; }
function syncEndpoint(settings) {
  const value = String(settings.syncEndpoint || "").trim();
  if (!value) throw new Error("请填写云端同步接口地址");
  const endpoint = new URL(value);
  if (!["https:", "http:"].includes(endpoint.protocol)) throw new Error("同步接口必须使用 HTTP 或 HTTPS 地址");
  if (endpoint.protocol === "http:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) throw new Error("公网同步接口必须使用 HTTPS");
  return endpoint;
}
async function syncReport(state, fileName, csv) {
  const settings = { ...DEFAULTS, ...(state.settings || {}) };
  if (settings.syncMode !== "webhook") return { status: "未启用" };
  const endpoint = syncEndpoint(settings);
  const payload = { schema_version: 1, event: "competitor_report.completed", run_id: state.reportRunId || crypto.randomUUID(), file_name: fileName, generated_at: new Date().toISOString(), report_rows: state.reportRows || [], failed: state.failed || [], csv };
  const headers = { "Content-Type": "application/json", "X-FM-Sync-Version": "1" };
  if (settings.syncKey) headers.Authorization = `Bearer ${settings.syncKey}`;
  const response = await fetch(endpoint.href, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
  return { status: "同步成功", response: body };
}
async function getState() { return chrome.storage.local.get({ settings: DEFAULTS, queue: [], index: 0, running: false, paused: false, status: "未开始", results: [], reportRows: [], failed: [], reportFileName: null, downloadPath: null, reportRunId: null, syncStatus: "未启用", syncError: null, syncAt: null }); }
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

function bridgeUrl(settings, path) { return `${settings.bridgeUrl.replace(/\/$/, "")}${path}`; }

async function fetchJson(url, options, unavailableMessage) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  } catch (error) {
    if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(error.message || "")) throw new Error(unavailableMessage);
    throw error;
  }
}

async function checkBridge(settings) {
  const body = await fetchJson(bridgeUrl(settings, "/health"), { signal: AbortSignal.timeout(5000) }, "本地发布桥不可用，请先启动 npm run competitor:bridge");
  if (!body.supabaseConfigured) throw new Error("本地发布桥已启动，但缺少 Supabase 配置");
  if (!body.workspaceConfigured) throw new Error("本地发布桥已启动，但缺少工作区配置");
  return body;
}

async function fetchQueue(settings) {
  const csvUrl = sheetCsvUrl(settings.sheetUrl);
  let text;
  try {
    const response = await fetch(csvUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    text = await response.text();
  } catch (error) {
    if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(error.message || "")) throw new Error("Google Sheet 无法读取，请确认链接可访问且已发布为可查看");
    throw new Error(`读取 Google Sheet 失败：${error.message || error}`);
  }
  const queue = normalizeRows(text);
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
      if (settings.mode === "cloud") {
        await fetchJson(bridgeUrl(settings, "/publish"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: settings.workspaceId, record, snapshot: result.snapshot }), signal: AbortSignal.timeout(15000) }, "本地发布桥不可用，请先启动 npm run competitor:bridge");
      }
      const latest = await getState();
      await setState({ results: [...latest.results, { watch_key: record.watch_key, product_name: record.product_name, status: result.snapshot.capture_status, published: settings.mode === "cloud" }], reportRows: [...(latest.reportRows || []), ...reportRowsFor(record, result.snapshot)], index: latest.index + 1, status: `已完成 ${latest.index + 1}/${latest.queue.length}${settings.mode === "offline" ? "（离线保存）" : ""}` });
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
  const offlineSuffix = state.settings?.mode === "offline" ? " · 离线结果可下载" : "";
  await setState({ running: false, paused: false, reportFileName: fileName, downloadPath: `Chrome 下载目录/${fileName}`, status: state.failed.length ? `监控完成：成功 ${state.results.length} 条，失败 ${state.failed.length} 条${offlineSuffix}` : `监控完成：成功 ${state.results.length} 条${offlineSuffix}` });
}

async function downloadReport() {
  const state = await getState();
  if (state.running || !state.status?.startsWith("监控完成")) throw new Error("任务尚未完成，暂时没有可下载结果");
  const fileName = reportFileName(state);
  const csv = buildReportCsv(state);
  const downloadId = await chrome.downloads.download({ url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`, filename: fileName, saveAs: true });
  let syncStatus = state.settings?.syncMode === "webhook" ? "同步中" : "未启用";
  let syncError = null;
  if (state.settings?.syncMode === "webhook") {
    try { ({ status: syncStatus } = await syncReport(state, fileName, csv)); }
    catch (error) { syncStatus = "同步失败"; syncError = error.message || String(error); }
  }
  const syncSuffix = syncStatus === "未启用" ? "" : ` · ${syncStatus}`;
  await setState({ reportFileName: fileName, downloadPath: `Chrome 下载目录/${fileName}`, syncStatus, syncError, syncAt: new Date().toISOString(), status: `${state.status} · 下载已发起${syncSuffix}` });
  return { ok: true, downloadId, fileName, syncStatus, syncError };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_STATE") getState().then(sendResponse);
  if (message?.type === "SAVE_SETTINGS") chrome.storage.local.set({ settings: { ...DEFAULTS, ...message.settings } }).then(() => sendResponse({ ok: true }));
  if (message?.type === "START") {
    (async () => {
      const current = await getState();
      if (current.running) return;
      const settings = { ...DEFAULTS, ...message.settings, mode: message.settings?.mode === "cloud" ? "cloud" : "offline", sheetUrl: sheetCsvUrl(message.settings?.sheetUrl || DEFAULTS.sheetUrl) };
      await chrome.storage.local.set({ settings });
      if (settings.mode === "cloud") await checkBridge(settings);
      const fetched = await fetchQueue(settings);
      await setState({ queue: fetched.queue, index: 0, results: [], reportRows: [], failed: [], reportFileName: null, downloadPath: null, reportRunId: crypto.randomUUID(), syncStatus: "未同步", syncError: null, syncAt: null, running: true, paused: false, status: `已读取 ${fetched.queue.length} 条链接` });
      await collectCurrent();
    })().catch((error) => setState({ running: false, paused: false, status: `失败：${error.message}` }));
    sendResponse({ ok: true });
  }
  if (message?.type === "CHECK_BRIDGE") {
    (async () => {
      const state = await getState();
      if ((state.settings || DEFAULTS).mode !== "cloud") {
        await setState({ status: "离线模式正常，无需启动本地桥接服务" });
        return { ok: true, offline: true };
      }
      const body = await checkBridge(state.settings || DEFAULTS);
      await setState({ status: "本地发布桥正常，可开始监控" });
      return { ok: true, body };
    })().then(sendResponse).catch((error) => {
      setState({ status: `桥接检查失败：${error.message}` });
      sendResponse({ ok: false, error: error.message });
    });
  }
  if (message?.type === "RESUME") { setState({ running: true, paused: false, status: "继续采集" }).then(() => collectCurrent()).catch((error) => setState({ paused: true, status: `失败：${error.message}` })); sendResponse({ ok: true }); }
  if (message?.type === "RETRY_FAILED") {
    (async () => {
      const state = await getState();
      if (state.running || !state.failed.length) return;
      await setState({ queue: state.failed.map((item) => item.record), index: 0, failed: [], reportFileName: null, downloadPath: null, reportRunId: crypto.randomUUID(), syncStatus: "未同步", syncError: null, syncAt: null, running: true, paused: false, status: `准备重试 ${state.failed.length} 条链接` });
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
