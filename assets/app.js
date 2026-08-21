const DATA_URL = "data/dashboard.json";
const MODULE1_URL = "data/module1.json";
const DEFINITIONS_URL = "data/definitions.json";

const state = {
  data: null,
  module1: null,
  definitions: null,
  defaultDefinitions: null,
  originalModule1: null,
  sourcePatches: JSON.parse(localStorage.getItem("shopee-ai-source-patches") || "{}"),
  selectedSourceLink: null,
  sopCategory: "全部",
  query: "",
  filters: { store: "全部", pool: "全部", tier: "全部", matrix: "全部", match: "全部" },
  listingPage: 1,
  listingPageSize: 50,
  listingSort: { key: null, direction: "asc" },
  activeQueue: null,
  pendingImportWorkflow: null,
  importFiles: {},
  subsidyBudget: Number(localStorage.getItem("shopee-ai-subsidy-budget")) || 100000,
  template: "daily",
  completedTasks: new Set(JSON.parse(localStorage.getItem("shopee-ai-completed") || "[]")),
  snapshots: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function renderMetrics() {
  const comparison = state.module1.comparison;
  const totals = comparison?.overall?.july || state.module1.links.reduce((a, item) => ({ views: a.views + item.views, visitors: a.visitors + item.visitors, orders: a.orders + item.orders, buyers: a.buyers + (item.buyers || 0), units: a.units + item.units, sales: a.sales + item.sales, atc: a.atc + item.atcRate * item.visitors }), { views: 0, visitors: 0, orders: 0, buyers: 0, units: 0, sales: 0, atc: 0 });
  const prior = comparison?.overall?.june || {};
  const mom = (current, previous) => Number(previous) ? Number(current) / Number(previous) - 1 : null;
  const delta = (current, previous, suffix = "环比") => { const value = mom(current, previous); return value == null ? "无基期" : `${suffix} ${formatPercent(value)}`; };
  const atcRate = totals.visitors ? totals.atc / totals.visitors : 0, priorAtcRate = prior.visitors ? prior.atc / prior.visitors : 0;
  const orderCr = totals.visitors ? totals.orders / totals.visitors : 0, priorOrderCr = prior.visitors ? prior.orders / prior.visitors : 0;
  const itemCr = totals.visitors ? totals.units / totals.visitors : 0, priorItemCr = prior.visitors ? prior.units / prior.visitors : 0;
  const metrics = [
    { label: "浏览量 PV", value: totals.views.toLocaleString("zh-CN"), delta: delta(totals.views, prior.views), tone: mom(totals.views, prior.views) < 0 ? "risk" : "good", note: "7月表 vs 6月表" },
    { label: "访客 UV", value: totals.visitors.toLocaleString("zh-CN"), delta: delta(totals.visitors, prior.visitors), tone: mom(totals.visitors, prior.visitors) < 0 ? "risk" : "good", note: "7月表 vs 6月表" },
    { label: "加购率", value: formatPercent(atcRate, 2), delta: delta(atcRate, priorAtcRate), tone: mom(atcRate, priorAtcRate) < 0 ? "risk" : "good", note: "ATC Units ÷ Visitors" },
    { label: "订单转化率", value: formatPercent(orderCr, 2), delta: delta(orderCr, priorOrderCr), tone: mom(orderCr, priorOrderCr) < 0 ? "risk" : "good", note: "订单 ÷ 访客" },
    { label: "件转化率", value: formatPercent(itemCr, 2), delta: delta(itemCr, priorItemCr), tone: mom(itemCr, priorItemCr) < 0 ? "risk" : "good", note: "销量件数 ÷ 访客" },
    { label: "GMV", value: formatMoney(totals.sales), delta: delta(totals.sales, prior.sales), tone: mom(totals.sales, prior.sales) < 0 ? "risk" : "good", note: "Net Sales" },
    { label: "订单数", value: totals.orders.toLocaleString("zh-CN"), delta: delta(totals.orders, prior.orders), tone: mom(totals.orders, prior.orders) < 0 ? "risk" : "good", note: "Net Orders" },
    { label: "成交人数", value: totals.buyers.toLocaleString("zh-CN"), delta: delta(totals.buyers, prior.buyers), tone: mom(totals.buyers, prior.buyers) < 0 ? "risk" : "good", note: "Net # of Unique Buyers" }
  ];
  $("#metricGrid").innerHTML = metrics.map(item => `
    <article class="metric-card">
      <div class="metric-top"><span>${escapeHtml(item.label)}</span><i class="tone ${escapeHtml(item.tone)}"></i></div>
      <div class="metric-value">${escapeHtml(item.value)}</div>
      <div class="metric-bottom"><span>${escapeHtml(item.note)}</span><span class="metric-delta">${escapeHtml(item.delta)}</span></div>
    </article>`).join("");
}

function aggregateDimension(key) {
  const groups = new Map();
  state.module1.links.forEach(item => {
    const name = item[key] || "未归属";
    const current = groups.get(name) || { name, links: 0, visitors: 0, orders: 0, units: 0, sales: 0, comparableSales: 0, previousSales: 0, declining: 0, waste: 0 };
    current.links += 1; current.visitors += item.visitors; current.orders += item.orders; current.units += item.units; current.sales += item.sales;
    if (item.mom != null && item.mom > -.99 && item.sales > 0) { current.comparableSales += item.sales; current.previousSales += item.sales / (1 + item.mom); }
    current.declining += ["单月下滑", "连续衰退"].includes(item.lifecycle) ? 1 : 0;
    current.waste += item.matrix === "流量浪费款" ? 1 : 0;
    groups.set(name, current);
  });
  const comparisonKey = key === "shop" ? "shops" : "categories";
  const june = state.module1.comparison?.[comparisonKey]?.june || {};
  return [...groups.values()].map(x => {
    const prior = june[x.name];
    return { ...x, cr: x.visitors ? x.orders / x.visitors : 0, orderMom: prior?.orders ? x.orders / prior.orders - 1 : null, mom: prior?.sales ? x.sales / prior.sales - 1 : null };
  }).sort((a, b) => b.sales - a.sales);
}

function dimensionRows(items, limit) {
  const trend = value => `<span class="dimension-mom ${value == null ? "neutral" : value >= 0 ? "up" : "down"}">${value == null ? "新增/无基期" : formatPercent(value)}</span>`;
  return `<div class="dimension-table"><div class="dimension-row dimension-header"><span>名称</span><span>链接</span><span>访客</span><span>订单CR</span><span>GMV</span><span>订单环比</span><span>GMV环比</span></div>${items.slice(0, limit).map(item => `<div class="dimension-row"><strong>${escapeHtml(item.name)}</strong><span>${item.links}</span><span>${item.visitors.toLocaleString("zh-CN")}</span><span>${formatPercent(item.cr, 2)}</span><span>${formatMoney(item.sales)}</span>${trend(item.orderMom)}${trend(item.mom)}</div>`).join("")}</div>`;
}

function renderOverviewLevels() {
  const stores = aggregateDimension("shop");
  const categories = aggregateDimension("category");
  const s = state.module1.summary;
  $("#storeOverview").innerHTML = dimensionRows(stores, 5);
  $("#categoryOverview").innerHTML = dimensionRows(categories, 7);
  $("#linkOverview").innerHTML = `<div class="link-overview-grid">
    <div><span>全量链接</span><strong>${s.links}</strong><small>${s.shops} 个店铺</small></div>
    <div><span>产品匹配率</span><strong>${formatPercent(s.matchRate)}</strong><small>${s.links - s.matched} 条待匹配</small></div>
    <div><span>核心 T1/T2</span><strong>${s.t1t2}</strong><small>优先保护</small></div>
    <div><span>流量浪费</span><strong>${s.waste}</strong><small>有流量、转化偏弱</small></div>
    <div><span>黑马链接</span><strong>${s.blackHorse}</strong><small>转化好、流量不足</small></div>
    <div><span>下滑链接</span><strong>${s.declining}</strong><small>单月下滑或连续衰退</small></div>
  </div>`;
  const weakStore = [...stores].filter(x => x.visitors > 0).sort((a, b) => a.cr - b.cr)[0];
  const weakCategory = [...categories].filter(x => x.visitors > 0).sort((a, b) => a.cr - b.cr)[0];
  const coreDecline = state.module1.links.filter(item => ["T1", "T2"].includes(item.tier) && ["单月下滑", "连续衰退"].includes(item.lifecycle)).length;
  const actions = [
    { level: "店铺", problem: `${weakStore?.name || "—"} 当前订单CR最低（${formatPercent(weakStore?.cr || 0, 2)}）`, action: "先拆该店铺的类目与T1/T2链接，排查流量结构和转化承接。", href: "#chat-03" },
    { level: "类目", problem: `${weakCategory?.name || "—"} 当前订单CR最低（${formatPercent(weakCategory?.cr || 0, 2)}）`, action: "优先核对价格、规格、主图承诺和缺货Model，再做单变量测试。", href: "#listings" },
    { level: "链接", problem: `${s.waste} 条流量浪费，${coreDecline} 条T1/T2核心链接下滑`, action: "先处理核心下滑，再修复高流量低转化链接；黑马链接小步放量。", href: "#listings" },
    { level: "数据", problem: `${s.links - s.matched} 条待匹配；成交人数与历史日序列尚未接入`, action: "每日补充日期、成交人数及店铺/类目快照，形成可比较时间线。", href: "#data-governance" }
  ];
  $("#overviewActionsGrid").innerHTML = actions.map(item => `<article><span>${escapeHtml(item.level)}层问题</span><h4>${escapeHtml(item.problem)}</h4><p>${escapeHtml(item.action)}</p><a href="${item.href}">进入调整 →</a></article>`).join("");
}

function renderWorkflows() {
  const specs = {
    "01": { status: "数据完整", statusTone: "ready", progress: 100, source: "链接 · Model · 匹配表已接入", links: [["链接诊断", "#listings", "all"], ["匹配治理", "#listings", "unmatched"], ["AI方案", "#tasks", ""]], action: ["查看695条链接", "#listings"] },
    "02": { status: "数据缺失", statusTone: "missing", progress: 0, source: "Shopee Ads 报表未导入", links: [["亏损否定词", "", ""], ["高潜提价词", "", ""], ["预算建议", "", ""]], action: ["补充导入广告报表", "import"] },
    "03": { status: "部分数据", statusTone: "partial", progress: 45, source: "链接漏斗已接入 · 店铺总览待补", links: [["漏斗诊断", "#diagnosis", ""], ["商品分层", "#listings", "all"], ["任务队列", "#tasks", ""]], action: ["补充店铺总览数据", "import"] },
    "04": { status: "数据缺失", statusTone: "missing", progress: 0, source: "差评 · 客服 · 竞品链接未导入", links: [["异议库", "", ""], ["差评归因", "", ""], ["竞品反制", "", ""]], action: ["补充导入客户声音", "import"] },
    "05": { status: "主控可用", statusTone: "ready", progress: 90, source: "任务池 · SOP · 模板已建立", links: [["任务主控", "#tasks", ""], ["日报模板", "#sop", ""], ["周报模板", "#sop", ""]], action: ["进入主控工作台", "#tasks"] }
  };
  const workflows = state.data.workflows.map(item => ({ ...item, ...specs[item.id] }));
  $("#workflowGrid").innerHTML = workflows.map(item => {
    const chosen = state.importFiles[item.id];
    const status = chosen ? "已选择文件" : item.status;
    const source = chosen ? chosen : item.source;
    return `
    <article class="workflow-card ${escapeHtml(item.tone)}" id="chat-${escapeHtml(item.id)}">
      <div class="workflow-head"><span class="workflow-id">板块 ${Number(item.id)}</span><span class="status-badge ${escapeHtml(item.statusTone)}">${escapeHtml(status)}</span></div>
      <h3>${escapeHtml(item.name)}</h3><span class="workflow-subtitle">${escapeHtml(item.subtitle)}</span>
      <div class="progress-track" aria-label="完成 ${item.progress}%"><i style="width:${Number(item.progress)}%"></i></div>
      <div class="workflow-links">${item.links.map(([label, href, preset]) => href ? `<a href="${href}" data-preset="${preset}">${escapeHtml(label)} <b>↗</b></a>` : `<span>${escapeHtml(label)} · 待数据</span>`).join("")}</div>
      <div class="workflow-source"><span>DATA SOURCE</span><strong>${escapeHtml(source)}</strong></div>
      ${item.action[1] === "import" ? `<button class="workflow-action" type="button" data-import-workflow="${item.id}">${escapeHtml(item.action[0])}</button>` : `<a class="workflow-action" href="${item.action[1]}">${escapeHtml(item.action[0])} <b>→</b></a>`}
    </article>`;
  }).join("");
  $$("[data-import-workflow]").forEach(button => button.addEventListener("click", () => {
    state.pendingImportWorkflow = button.dataset.importWorkflow;
    $("#workflowFileInput").click();
  }));
  $$(".workflow-links a[data-preset]").forEach(link => link.addEventListener("click", () => applyListingPreset(link.dataset.preset)));
}

function subsidyCandidates() {
  const p = state.definitions.parameters;
  return state.module1.links.map(item => {
    const atcRatio = Number(item.benchmarks?.atcRateRatio) || 0;
    const trafficRatio = Number(item.benchmarks?.trafficRatio) || 0;
    const crRatio = Number(item.benchmarks?.crRatio) || 0;
    const pricePowerGap = trafficRatio >= p.subsidyTrafficFloor && crRatio < p.subsidyCrCeiling && (atcRatio >= p.subsidyAtcFloor || item.matrix === "流量浪费款");
    const momentum = (Number(item.mom) || 0) >= p.subsidyMomentumFloor || item.lifecycle === "快速爆发" || (item.matrix === "黑马宝藏款" && crRatio >= 1);
    const core = item.tier === "T1" || item.tier === "T2";
    const model = (item.modelSummary?.topModels || []).filter(model => Number(model.stock) > 0).sort((a, b) => Number(b.units) - Number(a.units))[0];
    let score = (core ? 24 : 8) + (pricePowerGap ? 38 : 0) + (momentum ? 28 : 0) + (item.matrix === "黑马宝藏款" ? 12 : 0);
    score += Math.min(12, Math.log10(Math.max(10, item.sales)));
    if (!model) score -= 30;
    const signal = pricePowerGap && momentum ? "价格力修复 + 趋势加速" : pricePowerGap ? "疑似缺价格力转化" : momentum ? "近期趋势好，适合放量" : "常规观察";
    const depth = pricePowerGap && momentum ? "加深 10%–15%" : pricePowerGap ? "测试 8%–12%" : "测试 5%–8%";
    return { item, model, score, pricePowerGap, momentum, signal, depth };
  }).filter(x => (x.pricePowerGap || x.momentum) && x.model && x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
}

function renderSubsidy() {
  const candidates = subsidyCandidates();
  const budget = Math.max(0, Number(state.subsidyBudget) || 0);
  const totalScore = candidates.reduce((sum, x) => sum + x.score, 0) || 1;
  const priceGapCount = candidates.filter(x => x.pricePowerGap).length;
  const momentumCount = candidates.filter(x => x.momentum).length;
  $("#subsidyBudget").value = budget;
  $("#subsidySummary").innerHTML = `<div><span>建议链接</span><strong>${candidates.length}</strong></div><div><span>价格力待验证</span><strong>${priceGapCount}</strong></div><div><span>趋势放大</span><strong>${momentumCount}</strong></div><div><span>预算状态</span><strong>${budget ? "可分配" : "待输入"}</strong></div>`;
  $("#subsidyTable").innerHTML = candidates.map((candidate, index) => {
    const item = candidate.item;
    const weight = candidate.score / totalScore;
    const allocation = budget * weight;
    const proof = candidate.pricePowerGap ? "订单CR、件转化率、补贴ROI" : "销量增量、边际CR、补贴ROI";
    return `<tr>
      <td><span class="subsidy-rank">P${index < 3 ? 0 : index < 7 ? 1 : 2}</span><small>${item.tier || item.newGrade || "—"}</small></td>
      <td><strong>${escapeHtml(item.name)}</strong><small>Product ID ${escapeHtml(item.productId)} · ${escapeHtml(item.category)}</small><button type="button" data-subsidy-locate="${escapeHtml(item.productId)}">查看链接</button></td>
      <td><span class="opportunity-badge ${candidate.pricePowerGap ? "price-gap" : "momentum"}">${escapeHtml(candidate.signal)}</span><small>流量/类目 ${item.benchmarks.trafficRatio.toFixed(1)}× · CR/类目 ${item.benchmarks.crRatio.toFixed(1)}× · 环比 ${item.mom == null ? "—" : formatPercent(item.mom)}</small></td>
      <td><strong>${escapeHtml(candidate.model.variation || candidate.model.sku || candidate.model.modelId)}</strong><small>Model ID ${escapeHtml(candidate.model.modelId)} · 库存 ${Number(candidate.model.stock).toLocaleString("zh-CN")}</small></td>
      <td><strong>${formatCny(allocation)}</strong><small>${formatPercent(weight)} 的本次预算</small></td>
      <td><strong>${escapeHtml(candidate.depth)}</strong><small>补齐当前活动价、毛利率、平台上限后生成最终价</small></td>
      <td><strong>${escapeHtml(proof)}</strong><small>大促当日分时监控，次日复盘增量</small></td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" class="empty-state">当前数据没有命中补贴候选；补充近期趋势、活动价和毛利后重新诊断。</td></tr>`;
  $$('[data-subsidy-locate]').forEach(button => button.addEventListener("click", () => locateProduct(button.dataset.subsidyLocate)));
}

function formatCny(value) {
  return `¥${Math.round(Number(value) || 0).toLocaleString("zh-CN")}`;
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function formatMoney(value) {
  const rate = state.definitions?.parameters?.idrPerCny || state.module1?.meta?.currency?.idrPerCny || 2650;
  const amount = (Number(value) || 0) / rate;
  if (amount >= 1e8) return `¥${(amount / 1e8).toFixed(2)}亿`;
  if (amount >= 1e4) return `¥${(amount / 1e4).toFixed(2)}万`;
  if (amount >= 1000) return `¥${Math.round(amount).toLocaleString("zh-CN")}`;
  return `¥${amount.toFixed(2)}`;
}

function formatSnapshotDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "未知");
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function benchmarkBadge(label, ratio, mode = "percent") {
  const safe = Number(ratio) || 0;
  const display = mode === "multiple" ? `${safe.toFixed(1)}×` : `${Math.round(safe * 100)}%`;
  const tone = safe >= 1 ? "above" : safe >= .8 ? "near" : "below";
  return `<span class="benchmark-badge ${tone}">${escapeHtml(label)} ${display}</span>`;
}

function fillSelect(selector, values, label) {
  const select = $(selector);
  select.innerHTML = `<option value="全部">全部${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function renderModule1Summary() {
  const summary = state.module1.summary;
  const cards = [
    ["成熟池", summary.mature, "进入 T1–T4 四维评估"],
    ["新品池", summary.newborn, "新品A 1条 · 新品B 20条"],
    ["流量浪费", summary.waste, "有流量但转化偏低"],
    ["黑马宝藏", summary.blackHorse, "低流量但转化较好"],
    ["下滑队列", summary.declining, "单月下滑或连续衰退"],
    ["未匹配", summary.links - summary.matched, "需补产品名 / 类目 / 分级"]
  ];
  $("#module1Summary").innerHTML = cards.map(([label, value, note]) => `<article><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString("zh-CN")}</strong><small>${escapeHtml(note)}</small></article>`).join("");
}

function renderListingFilters() {
  fillSelect("#storeFilter", Object.keys(state.module1.distributions.shop), "店铺");
  fillSelect("#poolFilter", Object.keys(state.module1.distributions.pool), "池");
  fillSelect("#tierFilter", ["T1", "T2", "T3", "T4", "新品A", "新品B", "新品C"], "T级");
  fillSelect("#matrixFilter", Object.keys(state.module1.distributions.matrix), "矩阵");
  fillSelect("#matchFilter", Object.keys(state.module1.distributions.matchStatus), "匹配状态");
}

function prepareModule1Data() {
  const parameters = state.definitions.parameters;
  state.module1.links ||= [];
  state.module1.distributions ||= { shop: {}, pool: {}, matrix: {}, matchStatus: {} };
  state.module1.distributions.shop ||= {};
  state.module1.distributions.pool ||= {};
  state.module1.distributions.matrix ||= {};
  state.module1.distributions.matchStatus ||= {};
  state.module1.meta ||= {};
  state.module1.meta.currency ||= { display: "CNY" };
  state.module1.meta.currency.idrPerCny = parameters.idrPerCny;
  Object.entries(state.sourcePatches).forEach(([productId, patch]) => {
    const item = state.module1.links.find(link => String(link.productId) === String(productId));
    if (item) Object.assign(item, patch);
  });
  const categoryStats = new Map();
  state.module1.links.forEach(item => {
    item.views = Number(item.views) || 0;
    item.visitors = Number(item.visitors) || 0;
    item.orders = Number(item.orders) || 0;
    item.units = Number(item.units) || 0;
    item.sales = Number(item.sales) || 0;
    item.atcRate = Number(item.atcRate) || 0;
    item.mom = item.mom === "" || item.mom == null ? null : Number(item.mom);
    item.cr = item.visitors ? item.orders / item.visitors : 0;
    item.itemConversion = item.visitors ? item.units / item.visitors : 0;
    item.uvValue = item.visitors ? item.sales / item.visitors : 0;
    const current = categoryStats.get(item.category) || { visitors: 0, cr: 0, uv: 0, itemConversion: 0, atc: 0, count: 0 };
    if (item.visitors > 0) {
      current.visitors += item.visitors;
      current.cr += item.cr;
      current.uv += item.uvValue;
      current.itemConversion += item.itemConversion;
      current.atc += item.atcRate;
      current.count += 1;
    }
    categoryStats.set(item.category, current);
  });
  state.module1.links.forEach(item => {
    const stat = categoryStats.get(item.category);
    const average = key => stat?.count ? stat[key] / stat.count : 0;
    item.benchmarks = {
      ...item.benchmarks,
      trafficRatio: average("visitors") ? item.visitors / average("visitors") : 0,
      crRatio: average("cr") ? item.cr / average("cr") : 0,
      uvValueRatio: average("uv") ? item.uvValue / average("uv") : 0,
      itemConversionRatio: average("itemConversion") ? item.itemConversion / average("itemConversion") : 0,
      atcRateRatio: average("atc") ? item.atcRate / average("atc") : 0
    };
    const highTraffic = item.benchmarks.trafficRatio >= parameters.matrixTrafficRatio;
    const highConversion = item.benchmarks.crRatio >= parameters.matrixConversionRatio;
    item.matrix = highTraffic && highConversion ? "明星收割款"
      : highTraffic ? "流量浪费款"
      : highConversion ? "黑马宝藏款"
      : "沉没/待淘汰款";
    item.decision = item.pool === "新品池" ? "孵化"
      : item.tier === "T4" && item.matrix === "沉没/待淘汰款" ? "淘汰"
      : item.matrix === "流量浪费款" || ["单月下滑", "连续衰退"].includes(item.lifecycle) ? "重点优化"
      : "保留";
    item.action = item.decision === "孵化" ? "保持新品保护节奏，每次只测试一个变量"
      : item.decision === "淘汰" ? "核对库存与利润后进入清仓、合并或下架队列"
      : item.matrix === "流量浪费款" ? "优先核对价格、首图、规格、评价与缺货 Model；单变量测试"
      : ["单月下滑", "连续衰退"].includes(item.lifecycle) ? "复核流量来源、活动退出、广告预算与关键词排名"
      : item.matrix === "黑马宝藏款" ? "小幅提高搜索预算与关键词覆盖，3天复盘边际转化"
      : "维持当前节奏，按周监控流量与转化变化";
  });
  recalculateSummary();
}

function countBy(items, key) {
  return items.reduce((result, item) => { const value = item[key] || "未定义"; result[value] = (result[value] || 0) + 1; return result; }, {});
}

function recalculateSummary() {
  const links = state.module1.links;
  const matched = links.filter(item => item.matchStatus !== "未匹配").length;
  state.module1.summary = {
    ...state.module1.summary,
    links: links.length,
    models: links.reduce((sum, item) => sum + (Number(item.modelSummary?.count) || 0), 0),
    shops: new Set(links.map(item => item.shop)).size,
    matched,
    matchRate: links.length ? matched / links.length : 0,
    t1t2: links.filter(item => ["T1", "T2"].includes(item.tier)).length,
    mature: links.filter(item => item.pool === "成熟池").length,
    newborn: links.filter(item => item.pool === "新品池").length,
    waste: links.filter(item => item.matrix === "流量浪费款").length,
    blackHorse: links.filter(item => item.matrix === "黑马宝藏款").length,
    declining: links.filter(item => ["单月下滑", "连续衰退"].includes(item.lifecycle)).length
  };
  state.module1.distributions = {
    ...state.module1.distributions,
    shop: countBy(links, "shop"), pool: countBy(links, "pool"), matrix: countBy(links, "matrix"), matchStatus: countBy(links, "matchStatus")
  };
}

function diagnosisQueues() {
  const p = state.definitions.parameters;
  return [
    { id: "traffic_gap", stage: "流量", signal: "黑马链接待放大", test: item => item.matrix === "黑马宝藏款", reason: "转化高于店铺基准，但流量规模不足。", action: "扩展搜索词与关联入口，小幅提高预算，3天观察边际CR。", metric: "访客 / CR" },
    { id: "traffic_waste", stage: "转化", signal: "流量浪费待修复", test: item => item.matrix === "流量浪费款", reason: "已有流量进入，但订单转化没有同步承接。", action: "优先核对到手价、首图承诺、规格、评价和缺货Model。", metric: "CR / GMV" },
    { id: "atc_weak", stage: "加购", signal: "加购意向低于类目", test: item => item.visitors > 0 && item.benchmarks.atcRateRatio < p.atcWeakRatio && item.benchmarks.trafficRatio >= p.trafficSufficientRatio, reason: `流量达到类目${Math.round(p.trafficSufficientRatio * 100)}%，但加购强度低于类目${Math.round(p.atcWeakRatio * 100)}%。`, action: "检查利益点、套装价差、赠品与规格表达，进行单变量测试。", metric: "加购强度" },
    { id: "core_decline", stage: "生命周期", signal: "核心链接下滑", test: item => ["T1", "T2"].includes(item.tier) && ["单月下滑", "连续衰退"].includes(item.lifecycle), reason: "T1/T2核心链接销量已出现明显或连续下滑。", action: "复盘流量来源、活动退出、关键词排名与预算变化，优先恢复有效入口。", metric: "环比 / GMV" },
    { id: "uv_low", stage: "价值", signal: "UV价值偏低", test: item => item.visitors > 0 && item.benchmarks.uvValueRatio < p.uvLowRatio, reason: `每位访客创造的GMV低于同类均值${Math.round(p.uvLowRatio * 100)}%。`, action: "优化客单、组合与连带购，同时排查低价Model占比和无效流量。", metric: "UV价值" }
  ];
}

function queueFor(id) {
  return diagnosisQueues().find(queue => queue.id === id);
}

function filteredListings() {
  const query = state.query.trim().toLowerCase();
  const queue = queueFor(state.activeQueue);
  return state.module1.links.filter(item => {
    const effectiveTier = item.pool === "新品池" ? item.newGrade : item.tier;
    const haystack = [item.productId, item.name, item.originalName, item.shop, item.category, item.url, item.modelSummary.topModels.map(model => `${model.variation} ${model.sku}`).join(" ")].join(" ").toLowerCase();
    return (state.filters.store === "全部" || item.shop === state.filters.store)
      && (state.filters.pool === "全部" || item.pool === state.filters.pool)
      && (state.filters.tier === "全部" || effectiveTier === state.filters.tier)
      && (state.filters.matrix === "全部" || item.matrix === state.filters.matrix)
      && (state.filters.match === "全部" || item.matchStatus === state.filters.match)
      && (!queue || queue.test(item))
      && (!query || haystack.includes(query));
  });
}

function listingSortValue(item, key) {
  const effectiveTier = item.pool === "新品池" ? item.newGrade : item.tier;
  const diagnosisWeight = { "重点优化": 4, "孵化": 3, "保留": 2, "淘汰": 1 };
  const tierWeight = { T1: 1, T2: 2, T3: 3, T4: 4, 新品A: 5, 新品B: 6, 新品C: 7 };
  return {
    category: `${item.category || ""} ${item.priceRole || ""}`,
    product: `${item.name || ""} ${item.productId || ""}`,
    business: `${item.matrix || ""} ${item.lifecycle || ""}`,
    tier: tierWeight[effectiveTier] ?? 99,
    shop: item.shop || "",
    traffic: Number(item.visitors) || 0,
    conversion: Number(item.cr) || 0,
    sales: Number(item.sales) || 0,
    models: Number(item.modelSummary?.count) || 0,
    uv: Number(item.uvValue) || 0,
    diagnosis: diagnosisWeight[item.decision] || 0
  }[key];
}

function sortedListings(items) {
  const { key, direction } = state.listingSort;
  if (!key) return items;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = listingSortValue(a, key);
    const right = listingSortValue(b, key);
    const result = typeof left === "string"
      ? left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" })
      : left - right;
    return result * multiplier || String(a.productId).localeCompare(String(b.productId), "zh-CN", { numeric: true });
  });
}

function renderSortHeaders() {
  $$(".sort-button").forEach(button => {
    const active = button.dataset.sort === state.listingSort.key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-sort", active ? (state.listingSort.direction === "asc" ? "ascending" : "descending") : "none");
    button.querySelector("span").textContent = active ? (state.listingSort.direction === "asc" ? "↑" : "↓") : "↕";
  });
}

function renderListings() {
  const filtered = sortedListings(filteredListings());
  const pages = Math.max(1, Math.ceil(filtered.length / state.listingPageSize));
  state.listingPage = Math.min(state.listingPage, pages);
  const start = (state.listingPage - 1) * state.listingPageSize;
  const items = filtered.slice(start, start + state.listingPageSize);
  $("#listingTable").innerHTML = items.map(item => `
    <tr>
      <td class="category-cell"><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.priceRole)}</small></td>
      <td class="product-cell"><small>Product ID ${escapeHtml(item.productId)}</small><strong>${escapeHtml(item.name)}</strong><div class="product-meta"><span class="state-badge ${item.matchStatus === "未匹配" ? "unmatched" : ""}">${escapeHtml(item.matchStatus)}</span><a class="product-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Shopee ↗</a></div></td>
      <td class="business-cell"><strong class="matrix-label">${escapeHtml(item.matrix)}</strong><small class="cell-note">${escapeHtml(item.lifecycle)} · ${item.mom == null ? "—" : formatPercent(item.mom)}</small></td>
      <td><span class="priority-badge ${item.tier === "T1" ? "p1" : item.tier === "T2" ? "p2" : "p3"}">${escapeHtml(item.pool === "新品池" ? item.newGrade : item.tier)}</span><small class="cell-note">${escapeHtml(item.pool)}</small></td>
      <td class="shop-cell">${escapeHtml(item.shop)}</td>
      <td class="metric-cell"><span>浏览 ${Number(item.views).toLocaleString("zh-CN")}</span><strong>访客 ${Number(item.visitors).toLocaleString("zh-CN")}</strong>${benchmarkBadge("链接/类目", item.benchmarks.trafficRatio, "multiple")}</td>
      <td class="metric-cell"><strong>订单CR ${formatPercent(item.cr, 2)}</strong><span>件转化率 ${formatPercent(item.itemConversion, 2)}</span>${benchmarkBadge("CR/类目", item.benchmarks.crRatio)}</td>
      <td class="metric-cell"><strong>${Number(item.units).toLocaleString("zh-CN")} 件</strong><span>${formatMoney(item.sales)}</span></td>
      <td><button class="model-button" type="button" data-link-id="${escapeHtml(item.id)}">${item.modelSummary.count} 个 Model</button><small class="cell-note">缺货 ${item.modelSummary.outOfStock} · Top ${formatPercent(item.modelSummary.topShare, 0)}</small></td>
      <td class="metric-cell"><strong>${formatMoney(item.uvValue)}</strong>${benchmarkBadge("链接/类目", item.benchmarks.uvValueRatio)}</td>
      <td class="diagnosis-cell"><span class="decision-badge ${item.decision === "保留" ? "keep" : item.decision === "重点优化" ? "optimize" : item.decision === "孵化" ? "incubate" : "retire"}">${escapeHtml(item.decision)}</span><small>${escapeHtml(item.action)}</small><button class="diagnosis-button" type="button" data-diagnosis-id="${escapeHtml(item.id)}">查看AI方案 →</button></td>
    </tr>`).join("");
  $("#listingEmpty").hidden = items.length > 0;
  renderActiveQueueBar(filtered.length);
  renderPagination(filtered.length, pages);
  renderSortHeaders();
  $$(".model-button").forEach(button => button.addEventListener("click", () => openModelDialog(button.dataset.linkId)));
  $$(".diagnosis-button").forEach(button => button.addEventListener("click", () => openDiagnosisDialog(button.dataset.diagnosisId)));
}

function renderActiveQueueBar(count) {
  const bar = $("#activeQueueBar");
  const queue = queueFor(state.activeQueue);
  if (!queue) { bar.hidden = true; bar.innerHTML = ""; return; }
  bar.hidden = false;
  bar.innerHTML = `<div><span>当前诊断队列</span><strong>${escapeHtml(queue.signal)}</strong><small>${count} 条链接</small></div><button type="button" id="clearQueue">清除队列筛选 ×</button>`;
  $("#clearQueue").addEventListener("click", () => { state.activeQueue = null; state.listingPage = 1; renderListings(); });
}

function renderPagination(total, pages) {
  $("#listingPagination").innerHTML = `<span>共 ${total.toLocaleString("zh-CN")} 条 · 第 ${state.listingPage}/${pages} 页</span><div><button type="button" data-page="prev" ${state.listingPage <= 1 ? "disabled" : ""}>上一页</button><button type="button" data-page="next" ${state.listingPage >= pages ? "disabled" : ""}>下一页</button></div>`;
  $$("#listingPagination button").forEach(button => button.addEventListener("click", () => {
    state.listingPage += button.dataset.page === "next" ? 1 : -1;
    renderListings();
    $("#listings").scrollIntoView({ behavior: "smooth" });
  }));
}

function openModelDialog(linkId) {
  const item = state.module1.links.find(link => link.id === linkId);
  if (!item) return;
  $("#modelDialogTitle").textContent = `${item.name} · ${item.productId}`;
  $("#modelDialogSummary").innerHTML = `<span>Model ${item.modelSummary.count}</span><span>有货 ${item.modelSummary.inStock}</span><span>缺货 ${item.modelSummary.outOfStock}</span><span>Top集中度 ${formatPercent(item.modelSummary.topShare)}</span>`;
  $("#modelDialogBody").innerHTML = item.modelSummary.topModels.length ? item.modelSummary.topModels.map((model, index) => `<article><b>${index + 1}</b><div><strong>${escapeHtml(model.variation)}</strong><small>${escapeHtml(model.sku || model.modelId)}</small></div><div><strong>${Number(model.units).toLocaleString("zh-CN")}件</strong><small>库存 ${Number(model.stock).toLocaleString("zh-CN")}</small></div></article>`).join("") : `<p>该链接没有可用的 Model 数据。</p>`;
  $("#modelDialog").showModal();
}

function openDiagnosisDialog(linkId) {
  const item = state.module1.links.find(link => link.id === linkId);
  if (!item) return;
  $("#diagnosisDialogTitle").textContent = `${item.name} · ${item.productId}`;
  $("#diagnosisDialogTags").innerHTML = `<span>${escapeHtml(item.category)}</span><span>${escapeHtml(item.pool === "新品池" ? item.newGrade : item.tier)}</span><span>${escapeHtml(item.matrix)}</span><span>${escapeHtml(item.lifecycle)}</span><span>${escapeHtml(item.decision)}</span>`;
  const reason = item.matrix === "流量浪费款" ? "流量已进入，但订单转化低于同类或店铺基准，优先检查到手价、首图承诺、规格选择、评价与缺货 Model。"
    : item.matrix === "黑马宝藏款" ? "当前转化效率较好但流量规模不足，适合小步提高关键词覆盖和广告预算。"
    : item.matrix === "沉没/待淘汰款" ? "流量与转化均弱，不建议继续逐条投入精修，应先判断库存和战略价值。"
    : "流量与转化相对健康，重点保护排名、库存及有效流量来源。";
  $("#diagnosisDialogBody").innerHTML = `
    <div class="diagnosis-score-grid">
      <article><span>UV价值</span><strong>${formatMoney(item.uvValue)}</strong><small>类目均值的 ${Math.round(item.benchmarks.uvValueRatio * 100)}%</small></article>
      <article><span>流量规模</span><strong>${item.benchmarks.trafficRatio.toFixed(1)}×</strong><small>相对类目平均访客</small></article>
      <article><span>订单CR</span><strong>${formatPercent(item.cr, 2)}</strong><small>类目均值的 ${Math.round(item.benchmarks.crRatio * 100)}%</small></article>
      <article><span>件转化率</span><strong>${formatPercent(item.itemConversion, 2)}</strong><small>类目均值的 ${Math.round(item.benchmarks.itemConversionRatio * 100)}%</small></article>
    </div>
    <section><span class="detail-label">现状判断</span><p>${escapeHtml(reason)}</p></section>
    <section class="ai-solution"><span class="detail-label">AI执行方案</span><p>${escapeHtml(item.action)}</p><ul><li>每次只调整一个核心变量，避免价格、主图和投流同时变化。</li><li>以7天为第一观察窗口，复盘访客、CR、件转化率和GMV变化。</li></ul></section><div class="dialog-actions"><button type="button" class="primary-button" id="createTaskFromDiagnosis">生成任务</button></div>`;
  $("#createTaskFromDiagnosis").addEventListener("click", async () => {
    const taskId = `link-${item.id}`;
    try {
      if (window.ShopeeCloud?.session) await window.ShopeeCloud.saveGeneratedTask(item, false);
      else localStorage.setItem("shopee-ai-completed", JSON.stringify([...state.completedTasks].filter(id => id !== taskId)));
      state.completedTasks.delete(taskId);
      renderTasks();
      showToast("诊断任务已生成");
    } catch (error) {
      showToast(`任务生成失败：${error.message}`);
    }
  });
  $("#diagnosisDialog").showModal();
}

function applyListingPreset(preset) {
  if (!preset) return;
  state.activeQueue = null;
  state.filters = { store: "全部", pool: "全部", tier: "全部", matrix: "全部", match: "全部" };
  if (preset === "unmatched") state.filters.match = "未匹配";
  state.query = "";
  state.listingPage = 1;
  $("#listingSearch").value = "";
  $("#storeFilter").value = state.filters.store;
  $("#poolFilter").value = state.filters.pool;
  $("#tierFilter").value = state.filters.tier;
  $("#matrixFilter").value = state.filters.matrix;
  $("#matchFilter").value = state.filters.match;
  renderListings();
}

function renderDiagnoses() {
  const queues = diagnosisQueues().map(queue => {
    const links = state.module1.links.filter(queue.test).sort((a, b) => b.sales - a.sales);
    return { ...queue, links };
  });
  $("#diagnosisGrid").innerHTML = queues.map((queue, index) => `
    <article class="diagnosis-card">
      <div class="diagnosis-stage"><span>${escapeHtml(queue.stage)}</span><b>${String(index + 1).padStart(2, "0")}</b></div>
      <div class="diagnosis-count"><strong>${queue.links.length}</strong><span>条链接</span></div>
      <h3>${escapeHtml(queue.signal)}</h3><p>${escapeHtml(queue.reason)}</p>
      <div class="diagnosis-links">${queue.links.slice(0, 3).map(link => `<button type="button" data-diagnosis-id="${escapeHtml(link.id)}"><span>${escapeHtml(link.productId)}</span><strong>${escapeHtml(link.name)}</strong></button>`).join("") || "<span>当前没有命中链接</span>"}</div>
      <div class="diagnosis-action"><span>队列动作</span><p>${escapeHtml(queue.action)}</p></div>
      <button class="queue-button" type="button" data-queue-id="${escapeHtml(queue.id)}">查看全部 ${queue.links.length} 条链接 →</button>
      <div class="diagnosis-meta"><span>${escapeHtml(queue.metric)}</span><span>数据来自链接诊断</span></div>
    </article>`).join("");
  $$("#diagnosisGrid [data-diagnosis-id]").forEach(button => button.addEventListener("click", () => openDiagnosisDialog(button.dataset.diagnosisId)));
  $$("[data-queue-id]").forEach(button => button.addEventListener("click", () => {
    state.activeQueue = button.dataset.queueId;
    state.filters = { store: "全部", pool: "全部", tier: "全部", matrix: "全部", match: "全部" };
    state.listingPage = 1;
    ["store", "pool", "tier", "matrix", "match"].forEach(key => $("#" + key + "Filter").value = "全部");
    renderListings();
    $("#listings").scrollIntoView({ behavior: "smooth" });
  }));
}

function renderTasks() {
  const score = item => (item.decision === "重点优化" ? 1e15 : 0) + (["单月下滑", "连续衰退"].includes(item.lifecycle) ? 5e14 : 0) + (item.matrix === "黑马宝藏款" ? 2e14 : 0) + item.sales;
  const definitions = [
    { id: "t1", title: "T1 核心保护", priority: "P0 · 今日", caption: "保排名 / 抢救下滑", test: item => item.tier === "T1" },
    { id: "t2", title: "T2 腰部修复", priority: "P1 · 本周", caption: "修复浪费 / 稳定出货", test: item => item.tier === "T2" },
    { id: "t3", title: "T3 机会放大", priority: "P2 · 测试", caption: "只做黑马与增长款", test: item => item.tier === "T3" && (item.matrix === "黑马宝藏款" || item.lifecycle === "快速爆发") },
    { id: "t4new", title: "T4 / 新品治理", priority: "P3 · 治理", caption: "T4清退 / 新品孵化", test: item => item.tier === "T4" || item.pool === "新品池" }
  ];
  const lanes = definitions.map(definition => {
    const candidates = state.module1.links.filter(definition.test).sort((a, b) => score(b) - score(a));
    return { ...definition, candidates, tasks: candidates.slice(0, state.definitions.parameters.taskDisplayLimit) };
  });
  const visibleTasks = lanes.flatMap(lane => lane.tasks);
  $("#taskColumns").innerHTML = lanes.map(lane => `<section class="task-column link-task-column">
    <div class="task-column-head"><div><span class="lane-priority">${escapeHtml(lane.priority)}</span><h3>${escapeHtml(lane.title)}</h3></div><div><strong>${lane.candidates.length}</strong><span>候选链接</span></div></div>
    <p class="lane-caption">${escapeHtml(lane.caption)} · 展示最高优先${state.definitions.parameters.taskDisplayLimit}条</p>
    <div class="task-list">${lane.tasks.map(item => {
      const taskId = `link-${item.id}`;
      const completed = state.completedTasks.has(taskId);
      return `<article class="task-item link-task-item ${completed ? "completed" : ""}">
        <input class="task-check" type="checkbox" data-task-id="${escapeHtml(taskId)}" data-item-id="${escapeHtml(item.id)}" ${completed ? "checked" : ""} aria-label="完成任务：${escapeHtml(item.name)}" />
        <div class="link-task-body"><div class="link-task-tags"><span>${escapeHtml(item.pool === "新品池" ? item.newGrade : item.tier)}</span><span>${escapeHtml(item.matrix)}</span><span>${escapeHtml(item.lifecycle)}</span></div><h4>${escapeHtml(item.name)}</h4><small>Product ID ${escapeHtml(item.productId)} · ${escapeHtml(item.shop)}</small><p>${escapeHtml(item.action)}</p><div class="link-task-actions"><button type="button" data-task-diagnosis="${escapeHtml(item.id)}">查看诊断</button><button type="button" data-task-locate="${escapeHtml(item.productId)}">定位链接</button></div></div>
      </article>`; }).join("")}</div>
  </section>`).join("");
  $$(".task-check").forEach(input => input.addEventListener("change", async () => {
    const completed = input.checked;
    const item = state.module1.links.find(link => String(link.id) === String(input.dataset.itemId));
    if (completed) state.completedTasks.add(input.dataset.taskId); else state.completedTasks.delete(input.dataset.taskId);
    if (window.ShopeeCloud?.session && item) {
      input.disabled = true;
      try { await window.ShopeeCloud.saveGeneratedTask(item, completed); }
      catch (error) {
        if (completed) state.completedTasks.delete(input.dataset.taskId); else state.completedTasks.add(input.dataset.taskId);
        showToast(`云端任务保存失败：${error.message}`);
      }
    } else {
      localStorage.setItem("shopee-ai-completed", JSON.stringify([...state.completedTasks]));
    }
    renderTasks();
  }));
  $$("[data-task-diagnosis]").forEach(button => button.addEventListener("click", () => openDiagnosisDialog(button.dataset.taskDiagnosis)));
  $$("[data-task-locate]").forEach(button => button.addEventListener("click", () => locateProduct(button.dataset.taskLocate)));
  const total = visibleTasks.length;
  const completed = visibleTasks.filter(item => state.completedTasks.has(`link-${item.id}`)).length;
  $("#taskProgress").textContent = `${total ? Math.round(completed / total * 100) : 0}%`;
}

function locateProduct(productId) {
  state.activeQueue = null;
  state.filters = { store: "全部", pool: "全部", tier: "全部", matrix: "全部", match: "全部" };
  state.query = productId;
  state.listingPage = 1;
  $("#listingSearch").value = productId;
  ["store", "pool", "tier", "matrix", "match"].forEach(key => $("#" + key + "Filter").value = "全部");
  renderListings();
  $("#listings").scrollIntoView({ behavior: "smooth" });
}

function renderSop() {
  $("#sopSteps").innerHTML = state.data.sop.map(item => `<article class="sop-step"><span>${escapeHtml(item.step)}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div></article>`).join("");
  const categories = [...new Set(state.module1.links.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (state.sopCategory !== "全部" && !categories.includes(state.sopCategory)) state.sopCategory = "全部";
  $("#sopCategory").innerHTML = `<option value="全部">全店</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  $("#sopCategory").value = state.sopCategory;
  const analysis = sopAnalysis();
  const missing = ["Shopee Ads关键词报表", "客服/差评文本", "竞品价格与卖点", "店铺总览流量来源"];
  $("#sopDataHealth").innerHTML = `<span class="available">链接数据已接入</span><span class="available">Model已接入</span>${missing.map(item => `<span class="missing">待补：${escapeHtml(item)}</span>`).join("")}`;
  $("#sopLiveConclusion").innerHTML = `<div><span>当前分析范围</span><strong>${escapeHtml(analysis.label)}</strong><small>${analysis.links.length} 条链接 · ${analysis.matched} 条已匹配</small></div><div><span>经营结果</span><strong>${formatMoney(analysis.sales)}</strong><small>${analysis.visitors.toLocaleString("zh-CN")} 访客 · 订单CR ${formatPercent(analysis.cr, 2)}</small></div><div><span>AI结论</span><strong>${analysis.primaryConclusion}</strong><small>流量浪费 ${analysis.waste} · 黑马 ${analysis.blackHorse} · 下滑 ${analysis.declining}</small></div><div class="missing-conclusion"><span>结论边界</span><strong>广告与客户声音暂不归因</strong><small>补充缺失数据后自动进入模板</small></div>`;
  renderTemplate();
}

function sopAnalysis() {
  const links = state.module1.links.filter(item => state.sopCategory === "全部" || item.category === state.sopCategory);
  const sales = links.reduce((sum, item) => sum + item.sales, 0);
  const visitors = links.reduce((sum, item) => sum + item.visitors, 0);
  const orders = links.reduce((sum, item) => sum + item.orders, 0);
  const waste = links.filter(item => item.matrix === "流量浪费款").length;
  const blackHorse = links.filter(item => item.matrix === "黑马宝藏款").length;
  const declining = links.filter(item => ["单月下滑", "连续衰退"].includes(item.lifecycle)).length;
  const unmatched = links.filter(item => item.matchStatus === "未匹配").length;
  const primaryConclusion = waste > blackHorse && waste > 0 ? "优先修复流量浪费链接" : blackHorse > 0 ? "优先放大黑马宝藏链接" : declining > 0 ? "优先处理下滑链接" : "维持节奏并监控变化";
  return { links, label: state.sopCategory === "全部" ? "全店" : state.sopCategory, sales, visitors, orders, cr: visitors ? orders / visitors : 0, waste, blackHorse, declining, unmatched, matched: links.length - unmatched, primaryConclusion };
}

function buildDynamicTemplate(type) {
  const a = sopAnalysis();
  const common = `分析范围：${a.label}\n链接数：${a.links.length}\nGMV：${formatMoney(a.sales)}\n访客：${a.visitors.toLocaleString("zh-CN")}\n订单CR：${formatPercent(a.cr, 2)}\n业务矩阵：流量浪费 ${a.waste} / 黑马宝藏 ${a.blackHorse} / 下滑 ${a.declining}\n产品匹配：${a.matched} 已匹配 / ${a.unmatched} 待匹配\n核心结论：${a.primaryConclusion}`;
  const missing = `[待补充] Shopee Ads关键词报表\n[待补充] 客服/差评与退货原因\n[待补充] 竞品价格、活动与卖点\n[待补充] 店铺总览流量来源`;
  if (type === "weekly") return `# Shopee周报｜${a.label}\n\n## 本周数据结论\n${common}\n\n## 链接层动作\n- 流量浪费：优先检查价格、首图、规格、评价和缺货Model\n- 黑马宝藏：小幅增加搜索入口，3天复盘边际CR\n- 下滑链接：复核活动退出、关键词排名与预算变化\n\n## 数据缺口\n${missing}\n\n## 下周验证\n- 访客变化：\n- 订单CR变化：\n- GMV变化：\n- 动作是否保留：`;
  if (type === "listing") return `# Listing诊断卡｜${a.label}\n\n${common}\n\n## 诊断问题\n- 当前主要问题：${a.primaryConclusion}\n- 优先链接：从任务板T1/T2开始\n\n## SEO标题\n[待人工确认目标Product ID与主关键词后生成]\n\n## 5点描述\n[待补充具体产品成分、肤质与合规卖点]\n\n## 主图建议\n[待补充当前主图与竞品素材后生成]\n\n## 数据缺口\n${missing}`;
  return `# Shopee日报｜${a.label}\n\n${common}\n\n## 今日高优先\n- 处理T1核心保护队列\n- 复核${a.waste}条流量浪费链接\n- 评估${a.blackHorse}条黑马链接的增量入口\n\n## 数据缺口\n${missing}\n\n## 明日验证\n- 访客：\n- 订单CR：\n- GMV：`;
}

function renderTemplate() {
  $("#templateContent").textContent = buildDynamicTemplate(state.template);
  $$(".template-tab").forEach(button => {
    const active = button.dataset.template === state.template;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function parameterFields() {
  return [
    ["idrPerCny", "人民币汇率", "1 CNY 对应 IDR", 1, 100],
    ["matrixTrafficRatio", "矩阵流量边界", "流量规模比达到该值视为高流量", .01, .05],
    ["matrixConversionRatio", "矩阵转化边界", "CR类目比达到该值视为高转化", .01, .05],
    ["atcWeakRatio", "加购偏弱阈值", "低于类目该比例进入加购弱队列", .01, .05],
    ["trafficSufficientRatio", "流量充足阈值", "达到类目该比例才判断加购承接", .01, .05],
    ["uvLowRatio", "UV价值偏低阈值", "低于类目该比例进入UV偏低队列", .01, .05],
    ["taskDisplayLimit", "每层任务展示数", "每个T级任务栏展示的最高优先链接数", 1, 1],
    ["subsidyTrafficFloor", "补贴流量下限", "流量达到类目该比例才进入价格力判断", .01, .05],
    ["subsidyCrCeiling", "补贴CR上限", "CR低于类目该比例视为价格力待验证", .01, .05],
    ["subsidyAtcFloor", "补贴加购下限", "加购达到类目该比例才判断为强意向", .01, .05],
    ["subsidyMomentumFloor", "补贴趋势下限", "环比达到该增幅进入趋势放大候选", .01, .05]
  ];
}

function renderGovernance() {
  const summary = state.module1.summary;
  const overrideCount = Object.keys(state.sourcePatches).length;
  $("#governanceStatus").innerHTML = `<div><span>当前数据版本</span><strong>${escapeHtml(state.module1.meta?.generatedAt || state.definitions.version)}</strong></div><div><span>已接入</span><strong>${summary.links.toLocaleString("zh-CN")} 链接 · ${summary.models.toLocaleString("zh-CN")} Model</strong></div><div><span>本机修改</span><strong>${overrideCount} 条链接</strong></div><div><span>自动计算</span><strong>类目基准 · 矩阵 · 诊断 · 任务</strong></div>`;
  $("#sourceGrid").innerHTML = state.definitions.sources.map(source => {
    const count = source.id === "links" ? `${summary.links}条` : source.id === "models" ? `${summary.models}个` : source.id === "mapping" ? `${summary.matched}/${summary.links}` : source.id === "definitions" ? `${state.definitions.metrics.length}项指标` : "已加载";
    const actions = source.id === "links" ? `<button type="button" data-source-action="import-module1">导入 Links.csv</button><button type="button" data-source-action="export-module1">导出 Links.csv</button>`
      : source.id === "definitions" ? `<button type="button" data-source-action="import-definitions">导入 Parameters.csv</button><button type="button" data-source-action="export-definitions">导出 Parameters.csv</button>` : "";
    return `<article class="source-card"><div><span>${escapeHtml(source.id.toUpperCase())}</span><b>${escapeHtml(count)}</b></div><h3>${escapeHtml(source.name)}</h3><p>${escapeHtml(source.role)}</p><small>${escapeHtml(source.fields)}</small><div class="source-card-actions"><a href="${escapeHtml(source.file)}" target="_blank" rel="noopener">查看引用源 ↗</a>${actions}</div></article>`;
  }).join("");
  const p = state.definitions.parameters;
  $("#definitionForm").innerHTML = parameterFields().map(([key, label, note, min, step]) => `<label><span>${escapeHtml(label)}</span><input type="number" data-param="${escapeHtml(key)}" value="${p[key]}" min="${min}" step="${step}" /><small>${escapeHtml(note)}</small></label>`).join("");
  $("#definitionVersion").textContent = state.definitions.version;
  $("#metricDefinitionTable").innerHTML = state.definitions.metrics.map(metric => `<tr><td><strong>${escapeHtml(metric.name)}</strong></td><td>${escapeHtml(metric.formula)}</td><td><code>${escapeHtml(metric.source)}</code></td><td>${escapeHtml(metric.usage)}</td></tr>`).join("");
  $$('[data-source-action="import-module1"]').forEach(button => button.addEventListener("click", () => $("#module1FileInput").click()));
  $$('[data-source-action="export-module1"]').forEach(button => button.addEventListener("click", exportLinksCsv));
  $$('[data-source-action="import-definitions"]').forEach(button => button.addEventListener("click", () => $("#definitionsFileInput").click()));
  $$('[data-source-action="export-definitions"]').forEach(button => button.addEventListener("click", exportParametersCsv));
}

function downloadCsv(filename, headers, rows) {
  const encode = value => { const text = value == null ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  const csv = "\ufeff" + [headers, ...rows].map(row => row.map(encode).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function exportLinksCsv() {
  const headers = ["Product ID","Shopee URL","产品名称","原始名称","店铺","类目","业务角色","池","T级","新品级","匹配状态","生命周期","浏览","访客","订单","销量件数","GMV_IDR","加购率","环比"];
  const rows = state.module1.links.map(x => [x.productId,x.url,x.name,x.originalName,x.shop,x.category,x.priceRole,x.pool,x.tier,x.newGrade,x.matchStatus,x.lifecycle,x.views,x.visitors,x.orders,x.units,x.sales,x.atcRate,x.mom]);
  downloadCsv("Links.csv", headers, rows);
}

function exportParametersCsv() {
  const meanings = { idrPerCny:"1 CNY 对应 IDR",matrixTrafficRatio:"业务矩阵高流量边界",matrixConversionRatio:"业务矩阵高转化边界",atcWeakRatio:"加购偏弱阈值",trafficSufficientRatio:"流量充足阈值",uvLowRatio:"UV价值偏低阈值",taskDisplayLimit:"每个T级任务栏展示数",subsidyTrafficFloor:"补贴候选最低流量类目比",subsidyCrCeiling:"价格力候选最高CR类目比",subsidyAtcFloor:"价格力候选最低加购类目比",subsidyMomentumFloor:"趋势候选最低环比增幅" };
  downloadCsv("Parameters.csv", ["参数Key","当前值","业务含义"], Object.entries(state.definitions.parameters).map(([key,value]) => [key,value,meanings[key]]));
}

function refreshDashboard() {
  prepareModule1Data();
  const summary = state.module1.summary;
  const declineRate = summary.mature ? summary.declining / summary.mature : 0;
  const period = state.module1.meta?.periodLabel || state.module1.meta?.period || state.data?.periodLabel || state.data?.period || "当前周期";
  const snapshotDates = Object.values(state.snapshots || {}).map(snapshot => snapshot.updated_at).filter(Boolean).sort();
  const lastUpdated = snapshotDates.at(-1) || state.module1.meta?.generatedAt || state.definitions.version;
  $(".hero-date strong").textContent = `${period} · ${state.module1.summary.shops} 个店铺`;
  $(".sidebar-note small").textContent = `数据更新 · ${formatSnapshotDate(lastUpdated)}`;
  $(".hero-signal p").textContent = `成熟链接中 ${formatPercent(declineRate)} 处于单月下滑或连续衰退；当前优先保护 ${summary.t1t2} 条 T1/T2 核心链接。`;
  $("#currencyNote").textContent = `链接销售数据不重复累计 Model；金额统一人民币，当前汇率 ¥1 = Rp${Number(state.definitions.parameters.idrPerCny).toLocaleString("zh-CN")}。`;
  $("#diagnosisSourceNote").textContent = `每张卡由${state.module1.summary.links.toLocaleString("zh-CN")}条链接实时计算；点击即可回到对应链接并查看AI方案。`;
  renderMetrics(); renderOverviewLevels(); renderWorkflows(); renderSubsidy(); renderModule1Summary(); renderListingFilters();
  $("#storeFilter").value = state.filters.store; $("#poolFilter").value = state.filters.pool; $("#tierFilter").value = state.filters.tier; $("#matrixFilter").value = state.filters.matrix; $("#matchFilter").value = state.filters.match;
  renderListings(); renderDiagnoses(); renderTasks(); renderSop(); renderGovernance();
}

function renderSourceLinkForm(item) {
  state.selectedSourceLink = item?.productId || null;
  $("#saveSourceLink").disabled = !item;
  if (!item) { $("#sourceLinkForm").innerHTML = `<p class="editor-placeholder">没有找到对应 Product ID，请检查输入。</p>`; return; }
  const fields = [
    ["name", "产品名称", "text"], ["category", "类目", "text"], ["priceRole", "业务角色", "text"], ["shop", "店铺", "text"],
    ["pool", "池", "text"], ["tier", "T级", "text"], ["views", "浏览", "number"], ["visitors", "访客", "number"],
    ["orders", "订单", "number"], ["units", "销量件数", "number"], ["sales", "GMV（IDR）", "number"], ["atcRate", "加购率（小数）", "number"], ["mom", "环比（小数）", "number"], ["matchStatus", "匹配状态", "text"]
  ];
  $("#sourceLinkForm").innerHTML = `<div class="editor-link-title"><span>Product ID ${escapeHtml(item.productId)}</span><strong>${escapeHtml(item.name)}</strong></div><div class="editor-fields">${fields.map(([key, label, type]) => `<label><span>${escapeHtml(label)}</span><input data-source-field="${escapeHtml(key)}" type="${type}" step="any" value="${escapeHtml(item[key] ?? "")}" /></label>`).join("")}</div>`;
}

function parseCsv(text) {
  const rows=[]; let row=[], value="", quoted=false; text=text.replace(/^\ufeff/,"");
  for(let index=0;index<text.length;index++){const char=text[index]; if(quoted){if(char==='"'&&text[index+1]==='"'){value+='"';index++;}else if(char==='"')quoted=false;else value+=char;}else if(char==='"')quoted=true;else if(char===','){row.push(value);value="";}else if(char==='\n'){row.push(value.replace(/\r$/, ""));rows.push(row);row=[];value="";}else value+=char;}
  if(value.length||row.length){row.push(value.replace(/\r$/, ""));rows.push(row);}
  const headers=rows.shift()||[]; return rows.filter(row=>row.some(Boolean)).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??""])));
}

function exportWeeklyReport() {
  const score = item => (item.decision === "重点优化" ? 1e15 : 0) + (["单月下滑", "连续衰退"].includes(item.lifecycle) ? 5e14 : 0) + item.sales;
  const tasks = [...state.module1.links].sort((a, b) => score(b) - score(a)).slice(0, 12).map(item => `- [${state.completedTasks.has(`link-${item.id}`) ? "x" : " "}] ${item.tier} · ${item.name}（${item.productId}）— ${item.action}`).join("\n");
  const content = `${buildDynamicTemplate("weekly")}\n\n## 当前任务快照\n${tasks}\n`;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Shopee-ID-weekly-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("周报模板已导出");
}

function bindEvents() {
  $("#subsidyBudget").addEventListener("input", event => {
    state.subsidyBudget = Math.max(0, Number(event.target.value) || 0);
    localStorage.setItem("shopee-ai-subsidy-budget", String(state.subsidyBudget));
    renderSubsidy();
  });
  $("#listingSearch").addEventListener("input", event => { state.query = event.target.value; state.listingPage = 1; renderListings(); });
  const filterMap = { storeFilter: "store", poolFilter: "pool", tierFilter: "tier", matrixFilter: "matrix", matchFilter: "match" };
  Object.entries(filterMap).forEach(([id, key]) => $("#" + id).addEventListener("change", event => {
    state.activeQueue = null;
    state.filters[key] = event.target.value;
    state.listingPage = 1;
    renderListings();
  }));
  $$(".sort-button").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    state.listingSort = state.listingSort.key === key
      ? { key, direction: state.listingSort.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" };
    state.listingPage = 1;
    renderListings();
  }));
  $("#closeModelDialog").addEventListener("click", () => $("#modelDialog").close());
  $("#modelDialog").addEventListener("click", event => { if (event.target === $("#modelDialog")) $("#modelDialog").close(); });
  $("#closeDiagnosisDialog").addEventListener("click", () => $("#diagnosisDialog").close());
  $("#diagnosisDialog").addEventListener("click", event => { if (event.target === $("#diagnosisDialog")) $("#diagnosisDialog").close(); });
  $("#workflowFileInput").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file || !state.pendingImportWorkflow) return;
    state.importFiles[state.pendingImportWorkflow] = file.name;
    showToast(`已选择 ${file.name}，待数据处理后发布`);
    state.pendingImportWorkflow = null;
    event.target.value = "";
    renderWorkflows();
  });
  $$(".template-tab").forEach(button => button.addEventListener("click", () => { state.template = button.dataset.template; renderTemplate(); }));
  $("#sopCategory").addEventListener("change", event => { state.sopCategory = event.target.value; renderSop(); });
  $("#copyTemplate").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(buildDynamicTemplate(state.template)); showToast("动态模板已复制"); }
    catch { showToast("复制失败，请手动选择文本"); }
  });
  $("#applyDefinitions").addEventListener("click", () => {
    const next = { ...state.definitions.parameters };
    $$("#definitionForm [data-param]").forEach(input => { next[input.dataset.param] = Number(input.value); });
    if (Object.values(next).some(value => !Number.isFinite(value) || value <= 0)) { showToast("参数必须为大于0的数字"); return; }
    next.taskDisplayLimit = Math.max(1, Math.round(next.taskDisplayLimit));
    state.definitions.parameters = next;
    localStorage.setItem("shopee-ai-definitions", JSON.stringify(next));
    refreshDashboard(); showToast("定义已应用，全看板已重算");
  });
  $("#resetDefinitions").addEventListener("click", () => {
    state.definitions = JSON.parse(JSON.stringify(state.defaultDefinitions));
    localStorage.removeItem("shopee-ai-definitions"); refreshDashboard(); showToast("已恢复默认定义");
  });
  $("#loadSourceLink").addEventListener("click", () => {
    const productId = $("#sourceProductId").value.trim();
    renderSourceLinkForm(state.module1.links.find(item => String(item.productId) === productId));
  });
  $("#sourceProductId").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("#loadSourceLink").click(); } });
  $("#saveSourceLink").addEventListener("click", () => {
    const item = state.module1.links.find(link => String(link.productId) === String(state.selectedSourceLink));
    if (!item) return;
    const patch = {};
    $$("#sourceLinkForm [data-source-field]").forEach(input => { patch[input.dataset.sourceField] = input.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value.trim(); });
    state.sourcePatches[String(item.productId)] = patch;
    localStorage.setItem("shopee-ai-source-patches", JSON.stringify(state.sourcePatches));
    Object.assign(item, patch); refreshDashboard(); renderSourceLinkForm(state.module1.links.find(link => String(link.productId) === String(item.productId))); showToast("链接源数据已保存并重算");
  });
  $("#clearSourcePatches").addEventListener("click", () => {
    state.sourcePatches = {}; localStorage.removeItem("shopee-ai-source-patches");
    state.module1 = JSON.parse(JSON.stringify(state.originalModule1)); state.selectedSourceLink = null; renderSourceLinkForm(null); refreshDashboard(); showToast("已清除本机链接修改");
  });
  $("#module1FileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const rows = parseCsv(await file.text()); if (!rows.length || !("Product ID" in rows[0])) throw new Error("缺少 Product ID 表头");
      const byId = new Map(state.module1.links.map(item => [String(item.productId), item])); let updated = 0;
      const numeric = value => value === "" ? null : Number(value);
      rows.forEach(row => { const item = byId.get(String(row["Product ID"])); if (!item) return; Object.assign(item,{url:row["Shopee URL"],name:row["产品名称"]||"#N/A",originalName:row["原始名称"],shop:row["店铺"],category:row["类目"]||"#N/A",priceRole:row["业务角色"],pool:row["池"],tier:row["T级"],newGrade:row["新品级"],matchStatus:row["匹配状态"],lifecycle:row["生命周期"],views:numeric(row["浏览"])||0,visitors:numeric(row["访客"])||0,orders:numeric(row["订单"])||0,units:numeric(row["销量件数"])||0,sales:numeric(row["GMV_IDR"])||0,atcRate:numeric(row["加购率"])||0,mom:numeric(row["环比"])}); updated++; });
      state.originalModule1 = JSON.parse(JSON.stringify(state.module1)); state.sourcePatches = {}; state.filters = { store: "全部", pool: "全部", tier: "全部", matrix: "全部", match: "全部" }; state.query = ""; localStorage.removeItem("shopee-ai-source-patches"); refreshDashboard(); showToast(`已导入并重算 ${updated} 条链接`);
    } catch (error) { showToast(`导入失败：${error.message}`); }
    event.target.value = "";
  });
  $("#definitionsFileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const rows = parseCsv(await file.text()); if (!rows.length || !("参数Key" in rows[0])) throw new Error("缺少 参数Key 表头");
      const parameters = Object.fromEntries(rows.map(row => [row["参数Key"], Number(row["当前值"])]));
      if (Object.values(parameters).some(value => !Number.isFinite(value) || value <= 0)) throw new Error("参数必须为大于0的数字");
      state.definitions.parameters = { ...state.definitions.parameters, ...parameters }; state.defaultDefinitions.parameters = { ...state.defaultDefinitions.parameters, ...parameters }; localStorage.setItem("shopee-ai-definitions", JSON.stringify(state.definitions.parameters)); refreshDashboard(); showToast("Parameters.csv 已导入并重算");
    } catch (error) { showToast(`导入失败：${error.message}`); }
    event.target.value = "";
  });
  $("#exportButton").addEventListener("click", exportWeeklyReport);
  const menuButton = $(".menu-button");
  const workflowNavToggle = $("#workflowNavToggle");
  const workflowSubmenu = $("#workflowSubmenu");
  workflowNavToggle.addEventListener("click", () => {
    const expanded = workflowNavToggle.getAttribute("aria-expanded") === "true";
    workflowNavToggle.setAttribute("aria-expanded", String(!expanded));
    workflowSubmenu.hidden = expanded;
  });
  menuButton.addEventListener("click", () => {
    const open = $(".sidebar").classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-item[href], .nav-submenu a").forEach(link => link.addEventListener("click", () => {
    $(".sidebar").classList.remove("open"); menuButton.setAttribute("aria-expanded", "false");
  }));
  window.addEventListener("hashchange", () => setRoute(true));
  setRoute(false);
}

function setRoute(shouldScroll = false) {
  const targetId = location.hash.replace(/^#/, "") || "overview";
  const route = targetId.startsWith("chat-") || targetId === "workflows" ? "workflows"
    : ["listings", "diagnosis"].includes(targetId) ? "listings"
    : ["tasks", "sop", "subsidy", "data-governance", "overview"].includes(targetId) ? targetId
    : "overview";
  $$('[data-route]').forEach(section => { section.hidden = section.dataset.route !== route; });
  const workflowRoutes = new Set(["workflows", "listings", "tasks", "sop"]);
  $$(".nav-item").forEach(link => {
    const active = link.id === "workflowNavToggle" ? workflowRoutes.has(route) : link.getAttribute("href") === `#${route}`;
    link.classList.toggle("active", active);
  });
  if (workflowRoutes.has(route)) {
    $("#workflowNavToggle").setAttribute("aria-expanded", "true");
    $("#workflowSubmenu").hidden = false;
  }
  if (shouldScroll) requestAnimationFrame(() => {
    const target = document.getElementById(targetId) || document.querySelector(`[data-route="${route}"]`);
    target?.scrollIntoView({ behavior: "auto", block: "start" });
  });
}

async function init() {
  try {
    const cloudData = window.ShopeeCloud?.session ? await window.ShopeeCloud.loadCloudDatasets() : null;
    if (cloudData) {
      state.data = cloudData.dashboard;
      state.module1 = cloudData.module1;
      state.definitions = cloudData.definitions;
      state.snapshots = cloudData.snapshots || null;
      window.ShopeeCloud.sourceMode = "cloud";
    } else {
      const [dashboardResponse, module1Response, definitionsResponse] = await Promise.all([fetch(DATA_URL), fetch(MODULE1_URL), fetch(DEFINITIONS_URL)]);
      if (!dashboardResponse.ok || !module1Response.ok || !definitionsResponse.ok) throw new Error(`HTTP ${dashboardResponse.status}/${module1Response.status}/${definitionsResponse.status}`);
      state.data = await dashboardResponse.json();
      state.module1 = await module1Response.json();
      state.definitions = await definitionsResponse.json();
    }
    state.originalModule1 = JSON.parse(JSON.stringify(state.module1));
    state.defaultDefinitions = JSON.parse(JSON.stringify(state.definitions));
    const savedDefinitions = window.ShopeeCloud?.session ? null : JSON.parse(localStorage.getItem("shopee-ai-definitions") || "null");
    if (savedDefinitions) state.definitions.parameters = { ...state.definitions.parameters, ...savedDefinitions };
    if (window.ShopeeCloud?.session) state.completedTasks = await window.ShopeeCloud.loadTaskStatuses();
    window.ShopeeDashboard = {
      getSnapshot: () => ({
        dashboard: state.data,
        module1: state.module1,
        definitions: state.definitions,
        version: new Date().toISOString()
      })
    };
    refreshDashboard(); bindEvents();
  } catch (error) {
    document.body.innerHTML = `<main class="load-error"><h1>看板数据加载失败</h1><p>请通过本地服务器或 GitHub Pages 打开此项目，而不是直接双击 HTML 文件。</p><code>${escapeHtml(error.message)}</code></main>`;
  }
}

window.ShopeeDashboardReady = init();

