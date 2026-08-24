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
  snapshots: null,
  periodAnalysis: null,
  periodImportDraft: { product: {}, ads: {}, livestream: {} },
  selectedPeriodModule: "product",
  selectedPeriodProductId: null,
  periodSheetJs: null,
  periodIssueFilter: "全部",
  periodIssueSearch: "",
  analysisHistory: JSON.parse(localStorage.getItem("shopee-ai-analysis-history") || "[]"),
  analysisTask: JSON.parse(localStorage.getItem("shopee-ai-analysis-task") || "null")
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const setText = (selector, value) => {
  const target = $(selector);
  if (target) target.textContent = value;
};

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
  if (!$("#metricGrid")) return;
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
    item.originalName ||= item.name || "";
    item.shortName = generateShortName(item.name);
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
  if (!$("#storeOverview")) return;
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
  $("#modelDialogTitle").textContent = `${item.shortName || item.name} · ${item.productId}`;
  $("#modelDialogSummary").innerHTML = `<span>Model ${item.modelSummary.count}</span><span>有货 ${item.modelSummary.inStock}</span><span>缺货 ${item.modelSummary.outOfStock}</span><span>Top集中度 ${formatPercent(item.modelSummary.topShare)}</span>`;
  $("#modelDialogBody").innerHTML = item.modelSummary.topModels.length ? item.modelSummary.topModels.map((model, index) => `<article><b>${index + 1}</b><div><strong>${escapeHtml(model.variation)}</strong><small>${escapeHtml(model.sku || model.modelId)}</small></div><div><strong>${Number(model.units).toLocaleString("zh-CN")}件</strong><small>库存 ${Number(model.stock).toLocaleString("zh-CN")}</small></div></article>`).join("") : `<p>该链接没有可用的 Model 数据。</p>`;
  $("#modelDialog").showModal();
}

function openDiagnosisDialog(linkId) {
  const item = state.module1.links.find(link => link.id === linkId);
  if (!item) return;
  $("#diagnosisDialogTitle").textContent = `${item.shortName || item.name} · ${item.productId}`;
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
  const periodActions = JSON.parse(localStorage.getItem("shopee-ai-period-actions") || "[]");
  if (periodActions.length || location.hash === "#actions") {
    const completedActions = periodActions.filter(item => item.status === "done").length;
    $("#taskProgress").textContent = (periodActions.length ? Math.round(completedActions / periodActions.length * 100) : 0) + "%";
    $("#taskColumns").innerHTML = periodActions.length ? "<section class=\"task-column action-column\"><div class=\"task-column-head\"><div><span class=\"lane-priority\">ACTION QUEUE</span><h3>待处理问题</h3></div><div><strong>" + periodActions.length + "</strong><span>个动作</span></div></div><p class=\"lane-caption\">每个动作需在下周期填写验证结果。</p><div class=\"task-list\">" + periodActions.map(item => "<article class=\"task-item " + (item.status === "done" ? "completed" : "") + "\"><input class=\"task-check\" type=\"checkbox\" data-period-action-key=\"" + escapeHtml(item.key) + "\" " + (item.status === "done" ? "checked" : "") + " /><div class=\"link-task-body\"><div class=\"link-task-tags\"><span>" + escapeHtml(item.priority) + "</span><span>" + escapeHtml(item.source) + "</span></div><h4>" + escapeHtml(item.title) + "</h4><p>" + escapeHtml(item.action) + "</p><small>验证指标：" + escapeHtml(item.verification) + "</small></div></article>").join("") + "</div></section>" : "<div class=\"period-home-note\">还没有加入待处理的问题。请从诊断首页打开问题详情后加入动作。</div>";
    $$("[data-period-action-key]").forEach(input => input.addEventListener("change", () => {
      const next = JSON.parse(localStorage.getItem("shopee-ai-period-actions") || "[]").map(item => item.key === input.dataset.periodActionKey ? { ...item, status: input.checked ? "done" : "todo" } : item);
      localStorage.setItem("shopee-ai-period-actions", JSON.stringify(next));
      renderTasks();
    }));
    return;
  }
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
  setText(".hero-date strong", `${period} · ${state.module1.summary.shops} 个店铺`);
  setText(".sidebar-note small", `数据更新 · ${formatSnapshotDate(lastUpdated)}`);
  setText(".hero-signal p", `成熟链接中 ${formatPercent(declineRate)} 处于单月下滑或连续衰退；当前优先保护 ${summary.t1t2} 条 T1/T2 核心链接。`);
  setText("#currencyNote", `链接销售数据不重复累计 Model；金额统一人民币，当前汇率 ¥1 = Rp${Number(state.definitions.parameters.idrPerCny).toLocaleString("zh-CN")}。`);
  setText("#diagnosisSourceNote", `每张卡由${state.module1.summary.links.toLocaleString("zh-CN")}条链接实时计算；点击即可回到对应链接并查看AI方案。`);
  renderMetrics(); renderOverviewLevels(); renderWorkflows(); renderSubsidy(); renderModule1Summary(); renderListingFilters();
  $("#storeFilter").value = state.filters.store; $("#poolFilter").value = state.filters.pool; $("#tierFilter").value = state.filters.tier; $("#matrixFilter").value = state.filters.matrix; $("#matchFilter").value = state.filters.match;
  renderListings(); renderDiagnoses(); renderTasks(); renderSop(); renderGovernance(); renderPeriodAnalysis(); renderPeriodHome(); renderHistory();
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

const PERIOD_MODULES = {
  product: { label: "商品 & Model 销售", primary: "netSalesIdr", primaryLabel: "净销售额", currency: "IDR", empty: "Product Performance" },
  ads: { label: "产品广告", primary: "salesIdr", primaryLabel: "广告归因 Gross Sales", currency: "IDR", empty: "On-platform Ads" },
  livestream: { label: "产品直播", primary: "netSalesIdr", primaryLabel: "净销售额", currency: "IDR", empty: "Livestream" }
};

function generateShortName(value) {
  let name = String(value || "未命名商品").replace(/\[[^\]]*\]/g, " ").replace(/\b(?:hemat|discount|best seller|special discount|new launch|free shipping|100%\s*ori)\b[^|]*/gi, " ");
  name = name.replace(/https?:\/\/\S+/gi, " ").replace(/\b(?:official\s*store|authorize\s*store|ready\s*stock|shopee|store)\b/gi, " ");
  name = name.replace(/\bskinti?fl?c\b/gi, "SKINTIFIC").replace(/\b(?:g2g|g2glow|glad\s*2\s*glow)\b/gi, "Glad2Glow");
  const parts = name.split(/[|｜]/).map(part => part.replace(/\s+/g, " ").trim()).filter(Boolean);
  let core = parts[0] || name;
  core = core.replace(/^(?:SKINTIFIC|Glad2Glow)\s*[-–—:]?\s*/i, "");
  core = core.replace(/\b(?:mencerahkan|melembabkan|wajah|kulit|skincare|perawatan|facial|brightening|moisturizer|moisturiser)\b/gi, " ");
  core = core.replace(/\s*[×x]\s*.*$/i, "").replace(/\s+/g, " ").replace(/[,:;|]+$/g, "").trim();
  const brand = /skintific/i.test(name) ? "SKINTIFIC" : /glad2glow/i.test(name) ? "Glad2Glow" : "";
  const tokens = core.split(" ").filter(Boolean).slice(0, 7);
  const result = [brand, tokens.join(" ")].filter(Boolean).join(" · ") || String(value || "未命名商品").replace(/\s+/g, " ").trim();
  return result.length > 48 ? `${result.slice(0, 45).replace(/[\s,;:|]+$/g, "")}…` : result;
}

function withShortName(row) {
  return row ? { ...row, originalName: row.originalName || row.name || "", shortName: row.shortName || generateShortName(row.name) } : row;
}

function periodNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().replace(/,/g, "").replace(/Rp|IDR|USD/gi, "");
  const percent = text.endsWith("%");
  const number = Number(text.replace(/%$/, "").replace(/[^\d.+-Ee]/g, ""));
  if (!Number.isFinite(number)) return null;
  return percent ? number / 100 : number;
}

function periodId(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim().replace(/,/g, "");
  if (/e/i.test(text)) { const number = Number(text); return Number.isFinite(number) ? number.toFixed(0) : text; }
  return text.replace(/\.0+$/, "");
}

function periodLabelFromFile(fileName) {
  const match = String(fileName || "").match(/(20\d{2}[._-]\d{2}[._-]\d{2}(?:[._-]\d{2})?)/g);
  return match?.length ? match.join(" → ").replaceAll(".", "/").replaceAll("_", "/").replaceAll("-", "/") : fileName || "上传周期";
}

function periodSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  return workbook.utils.sheet_to_json(sheet, { defval: "", raw: false }).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), value])));
}

function periodResult(label, rows, errors = []) {
  const usable = rows.filter(row => row.productId).map(withShortName);
  if (errors.length || !usable.length) return { status: "blocked", label, rows: [], errors: errors.length ? errors : ["没有读取到有效 Product ID"] };
  return { status: "ready", label, rows: usable, errors: [] };
}

function normalizeProductPerformance(workbook, label) {
  const itemRows = periodSheetRows(workbook, "Product Performance Item Level");
  const modelRows = periodSheetRows(workbook, "Product Performance SKU Level");
  const errors = [];
  if (!itemRows) errors.push("缺少 Sheet：Product Performance Item Level");
  if (!modelRows) errors.push("缺少 Sheet：Product Performance SKU Level");
  if (!itemRows || !modelRows) return periodResult(label, [], errors);
  const rows = itemRows.map(row => ({
    productId: periodId(row["Product ID"]), name: row.Name || "未命名商品", url: row.URL || "", shop: row["Shop name"] || "", shopId: periodId(row["Shop ID"]), category: row.Category || "", rating: periodNumber(row["Product Rating"]),
    netUnits: periodNumber(row["Net Units Sold"]) || 0, netOrders: periodNumber(row["Net Orders"]) || 0, netSalesIdr: periodNumber(row["Net Sales(Rp)"]) || 0, buyers: periodNumber(row["Net # of Unique Buyers"]) || 0,
    grossUnits: periodNumber(row["Gross Units Sold"]) || 0, grossOrders: periodNumber(row["Gross Orders"]) || 0, grossSalesIdr: periodNumber(row["Gross Sales(Rp)"]) || 0, views: periodNumber(row["Product Views"]) || 0, clicks: periodNumber(row["Product Clicks"]) || 0, visitors: periodNumber(row["Product Visitors"]) || 0, atc: periodNumber(row["ATC Units"]) || 0,
    modelAtp: periodNumber(row["Model ATP %"]), stock: periodNumber(row["Current Stock"]) || 0, adis: periodNumber(row["L30D ADIS"]), coverage: periodNumber(row["Stock Coverage in Days"]), models: []
  }));
  const modelMap = new Map();
  modelRows.forEach(row => {
    const productId = periodId(row["Product ID"]);
    if (!productId) return;
    const modelId = periodId(row["Product_Model ID"]) || periodId(row.SKU) || `${productId}-${row.Variation || "model"}`;
    const model = { modelId, variation: row.Variation || "未命名 Model", sku: row.SKU || "", units: periodNumber(row["Net Units Sold"]) || 0, orders: periodNumber(row["Net Orders"]) || 0, salesIdr: periodNumber(row["Net Sales(Rp)"]) || 0, atc: periodNumber(row["ATC Units"]) || 0, stock: periodNumber(row["Current Stock"]) || 0, adis: periodNumber(row["L30D ADIS"]), coverage: periodNumber(row["Stock Coverage in Days"]) };
    if (!modelMap.has(productId)) modelMap.set(productId, []);
    modelMap.get(productId).push(model);
  });
  rows.forEach(row => { row.models = (modelMap.get(row.productId) || []).sort((a, b) => b.salesIdr - a.salesIdr); });
  return periodResult(label, rows, errors);
}

function normalizeSupportingReport(workbook, moduleKey, label) {
  const rows = periodSheetRows(workbook, "By Product");
  if (!rows) return periodResult(label, [], ["缺少 Sheet：By Product"]);
  if (moduleKey === "ads") return periodResult(label, rows.map(row => ({
    productId: periodId(row["Product ID"]), name: row["Product Name"] || "未命名商品", shop: row["Shop Name"] || "", shopId: periodId(row["Shop ID"]), impressions: periodNumber(row.Impressions) || 0, clicks: periodNumber(row.Clicks) || 0, ctr: periodNumber(row.CTR), spendIdr: periodNumber(row["Ads Spend(Local currency)"]) || 0, orders: periodNumber(row.Orders) || 0, salesIdr: periodNumber(row["Gross Sales(Local currency)"]) || 0, roas: periodNumber(row.ROAS), units: periodNumber(row["Units Sold"]) || 0, cr: periodNumber(row.CR), cpc: periodNumber(row.CPC)
  })), []);
  return periodResult(label, rows.map(row => ({
    productId: periodId(row["Product ID"]), name: row["Product Name"] || "未命名商品", shop: row["Shop Name"] || "", shopId: periodId(row["Shop ID"]), buyers: periodNumber(row.Buyers) || 0, atc: periodNumber(row["ATC Units"]) || 0, units: periodNumber(row["Units Sold"]) || 0, orders: periodNumber(row.Orders) || 0, grossSalesIdr: periodNumber(row["Gross Sales(Local Currency)"]) || 0, netSalesIdr: periodNumber(row["Net Sales(Local Currency)"]) || 0
  })), []);
}

async function loadPeriodSheetJs() {
  if (!state.periodSheetJs) state.periodSheetJs = import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  return state.periodSheetJs;
}

async function parsePeriodFile(file, moduleKey) {
  const XLSX = await loadPeriodSheetJs();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  return moduleKey === "product" ? normalizeProductPerformance(workbook, periodLabelFromFile(file.name)) : normalizeSupportingReport(workbook, moduleKey, periodLabelFromFile(file.name));
}

function periodStatus(moduleKey) {
  const draft = state.periodImportDraft[moduleKey] || {};
  const source = state.periodAnalysis?.modules?.[moduleKey] || {};
  const current = draft.current || source.current;
  const compare = draft.compare || source.compare;
  if (current?.status === "blocked" || compare?.status === "blocked") return "blocked";
  if (current?.status === "ready" && compare?.status === "ready") return "ready";
  if (current || compare) return "partial";
  return "missing";
}

function periodStatusText(moduleKey) {
  const status = periodStatus(moduleKey);
  return { ready: "已解析", partial: "缺少另一周期", blocked: "表头不兼容", missing: "未上传" }[status];
}

function periodAllReady() {
  return Object.keys(PERIOD_MODULES).every(moduleKey => periodStatus(moduleKey) === "ready");
}

function periodSourceSnapshot() {
  return state.periodAnalysis ? { schemaVersion: state.periodAnalysis.schemaVersion || "period-analysis-v1", generatedAt: new Date().toISOString(), modules: state.periodAnalysis.modules } : null;
}

function periodRowMap(moduleKey, period) {
  const result = state.periodAnalysis?.modules?.[moduleKey]?.[period];
  return new Map((result?.rows || []).map(row => [String(row.productId), row]));
}

function periodDelta(current, compare) {
  if (current == null || compare == null || Number(compare) === 0) return null;
  return Number(current) / Number(compare) - 1;
}

function periodFormatNumber(value) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function periodFormatMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const amount = Number(value);
  if (amount >= 1e9) return `Rp${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `Rp${(amount / 1e6).toFixed(2)}M`;
  return `Rp${Math.round(amount).toLocaleString("en-US")}`;
}

function periodChangeText(value) {
  return value == null ? "无基期" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function periodChangeClass(value) {
  return value == null ? "neutral" : value >= 0 ? "up" : "down";
}

function periodTotals(moduleKey, period) {
  const rows = state.periodAnalysis?.modules?.[moduleKey]?.[period]?.rows || [];
  const config = PERIOD_MODULES[moduleKey];
  const fields = moduleKey === "product" ? ["netSalesIdr", "netOrders", "netUnits", "visitors", "atc", "stock"] : moduleKey === "ads" ? ["spendIdr", "salesIdr", "orders", "clicks", "impressions", "units"] : ["netSalesIdr", "grossSalesIdr", "orders", "units", "buyers", "atc"];
  const totals = Object.fromEntries(fields.map(field => [field, rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0)]));
  if (moduleKey === "ads") { totals.roas = totals.spendIdr ? totals.salesIdr / totals.spendIdr : null; totals.ctr = totals.impressions ? totals.clicks / totals.impressions : null; totals.cr = totals.clicks ? totals.orders / totals.clicks : null; }
  if (moduleKey === "product") { totals.orderRate = totals.visitors ? totals.netOrders / totals.visitors : null; totals.atcRate = totals.visitors ? totals.atc / totals.visitors : null; }
  if (moduleKey === "livestream") { totals.orderRate = totals.buyers ? totals.orders / totals.buyers : null; totals.netGrossRate = totals.grossSalesIdr ? totals.netSalesIdr / totals.grossSalesIdr : null; }
  return { ...totals, count: rows.length, primary: totals[config.primary] };
}

function periodCompareRows(moduleKey) {
  const current = periodRowMap(moduleKey, "current");
  const compare = periodRowMap(moduleKey, "compare");
  const ids = new Set([...current.keys(), ...compare.keys()]);
  const config = PERIOD_MODULES[moduleKey];
  return [...ids].map(productId => { const currentRow = current.get(productId) || null; const compareRow = compare.get(productId) || null; return { productId, current: currentRow, compare: compareRow, status: currentRow && compareRow ? "matched" : currentRow ? "new" : "removed", delta: periodDelta(currentRow?.[config.primary], compareRow?.[config.primary]) }; }).sort((a, b) => (Number(b.current?.[config.primary]) || 0) - (Number(a.current?.[config.primary]) || 0));
}

function periodDiagnosis(moduleKey) {
  const current = periodTotals(moduleKey, "current");
  const compare = periodTotals(moduleKey, "compare");
  const primaryDelta = periodDelta(current.primary, compare.primary);
  const rows = periodCompareRows(moduleKey);
  const facts = [];
  const conclusions = [];
  const hypotheses = [];
  const actions = [];
  const topDeclines = rows.filter(row => row.status === "matched" && row.delta != null && row.delta < -.15).sort((a, b) => a.delta - b.delta).slice(0, 3);
  if (moduleKey === "product") {
    const visitorDelta = periodDelta(current.visitors, compare.visitors); const atcDelta = periodDelta(current.atc, compare.atc); const orderDelta = periodDelta(current.netOrders, compare.netOrders);
    facts.push(`净销售额 ${periodFormatMoney(current.primary)}，环比 ${periodChangeText(primaryDelta)}；订单 ${periodFormatNumber(current.netOrders)}，环比 ${periodChangeText(orderDelta)}。`);
    facts.push(`访客 ${periodFormatNumber(current.visitors)}（${periodChangeText(visitorDelta)}），加购 ${periodFormatNumber(current.atc)}（${periodChangeText(atcDelta)}）。`);
    if (visitorDelta != null && visitorDelta >= -.05 && primaryDelta != null && primaryDelta < -.1) { conclusions.push("流量基本稳定但成交下滑，优先判断商品页承接与价格/优惠，而不是先扩大流量。"); hypotheses.push("可能存在价格力、规格选择、库存可售 Model 或商品页承诺不匹配；需要结合活动价与页面改动验证。"); actions.push("抽查高访客低成交商品的价格、券、主图承诺和可售 Model，做单变量修复。"); }
    if (visitorDelta != null && visitorDelta < -.1) { conclusions.push("商品访客明显下降，当前首要矛盾是流量入口或商品曝光收缩。"); hypotheses.push("可能与搜索词、标题点击率、活动资源或广告引流减少有关；当前文件不足以单独确认原因。"); actions.push("按店铺和商品拆访客下降 Top 20，再补广告/热搜词/活动资源数据定位入口。"); }
    if (atcDelta != null && atcDelta > .1 && orderDelta != null && orderDelta < -.1) { conclusions.push("加购增加但订单减少，意向存在而结算承接变弱。"); hypotheses.push("可能是价格、优惠券、规格库存、运费或结算环节阻力。"); actions.push("优先检查加购高但订单下滑的商品及 Model，验证券后价、库存和结算失败率。"); }
    if (current.stock > 0 && periodDelta(current.stock, compare.stock) < -.2) { conclusions.push("销售变化伴随库存下降，存在需求兑现后的供给风险。"); actions.push("对高销量且覆盖天数下降的 Model 设置补货和库存预警，不直接停投。"); }
    const modelCount = rows.reduce((sum, row) => sum + (row.current?.models?.length || 0), 0); facts.push(`当前周期纳入 ${current.count} 个商品、${modelCount} 个 Model；Model 结论仅基于销量、订单、加购和库存。`);
  } else if (moduleKey === "ads") {
    const spendDelta = periodDelta(current.spendIdr, compare.spendIdr); const salesDelta = periodDelta(current.salesIdr, compare.salesIdr); const roasDelta = periodDelta(current.roas, compare.roas); const ctrDelta = periodDelta(current.ctr, compare.ctr); const crDelta = periodDelta(current.cr, compare.cr);
    facts.push(`广告花费 ${periodFormatMoney(current.spendIdr)}（${periodChangeText(spendDelta)}），广告归因 Gross Sales ${periodFormatMoney(current.salesIdr)}（${periodChangeText(salesDelta)}）。`);
    facts.push(`ROAS ${current.roas == null ? "—" : current.roas.toFixed(2)}（${periodChangeText(roasDelta)}），CTR ${formatPercent(current.ctr, 2)}，点击后 CR ${formatPercent(current.cr, 2)}。`);
    if (spendDelta != null && spendDelta > .1 && roasDelta != null && roasDelta < -.1) { conclusions.push("广告花费增长但 ROAS 下滑，出现边际效率恶化。"); hypotheses.push("可能是扩量到低相关词、素材点击后承接弱，或归因订单结构变化；不能仅凭 ROAS 判定亏损。"); actions.push("按商品拆花费增量与 ROAS 下滑，先收缩低效增量，再检查词、素材和商品页承接。"); }
    if (ctrDelta != null && ctrDelta < -.1) { conclusions.push("曝光或投放覆盖扩大后点击率走弱，点击前信息承诺需要复核。"); hypotheses.push("标题、主图、价格展示或关键词相关性可能不足；热搜词接入后可验证标题改版。"); actions.push("保留预算不变做标题/主图单变量测试，并记录 CTR 与点击后 CR。"); }
    if (crDelta != null && crDelta < -.1) { conclusions.push("点击后的订单转化下降，广告问题已经传导到商品页承接。"); actions.push("对点击增长但订单下降商品核对券、价格、库存和落地页主推 Model。"); }
    if (current.roas != null && current.roas > 4 && spendDelta != null && spendDelta < .1) { conclusions.push("当前 ROAS 较高但花费未明显增长，存在小步扩量测试空间。"); actions.push("只对高 ROAS 且库存充足商品增加小预算，设置止损阈值。"); }
  } else {
    const netDelta = periodDelta(current.netSalesIdr, compare.netSalesIdr); const grossDelta = periodDelta(current.grossSalesIdr, compare.grossSalesIdr); const orderDelta = periodDelta(current.orders, compare.orders); const atcDelta = periodDelta(current.atc, compare.atc); const buyerDelta = periodDelta(current.buyers, compare.buyers);
    facts.push(`直播商品净销售额 ${periodFormatMoney(current.netSalesIdr)}（${periodChangeText(netDelta)}），Gross Sales ${periodFormatMoney(current.grossSalesIdr)}（${periodChangeText(grossDelta)}）。`);
    facts.push(`买家 ${periodFormatNumber(current.buyers)}（${periodChangeText(buyerDelta)}），加购 ${periodFormatNumber(current.atc)}，订单 ${periodFormatNumber(current.orders)}（${periodChangeText(orderDelta)}）。`);
    if (atcDelta != null && atcDelta > .1 && orderDelta != null && orderDelta < -.1) { conclusions.push("直播加购增长但订单下滑，直播间商品承接出现断点。"); hypotheses.push("可能是讲解、规格引导、券/价格或库存承接不足；当前文件没有场次与主播维度，不能归因到具体场次。"); actions.push("回看加购高、订单下滑商品的讲解和优惠，逐个核对主推 Model 可售库存。"); }
    if (grossDelta != null && grossDelta > .1 && netDelta != null && netDelta < 0) { conclusions.push("直播 Gross Sales 增长而 Net Sales 下滑，退款、取消或无效订单影响需要核对。"); hypotheses.push("Gross 与 Net 的差额扩大可能来自退款、取消或平台净额处理，不应直接当作直播增长。"); actions.push("按商品核对退款/取消明细与售后周期，确认净销售下降的真实原因。"); }
    if (buyerDelta != null && buyerDelta > .1 && netDelta != null && netDelta < .05) { conclusions.push("买家增长没有同步带动净销售，商品结构或客单贡献偏弱。"); actions.push("拆买家增长商品的订单、件数与净销售，优化直播主推商品组合和连带购。"); }
  }
  if (topDeclines.length) facts.push(`环比下降超过 15% 的商品 ${topDeclines.length} 个，先处理：${topDeclines.map(row => row.current?.name || row.compare?.name).join("、")}。`);
  if (!conclusions.length) conclusions.push(primaryDelta == null ? "当前数据缺少可比较基期，暂不下结论。" : primaryDelta >= 0 ? "核心结果保持或增长，继续关注结构变化和异常商品。" : "核心结果下滑，但现有字段不足以确认单一原因，需要继续拆商品。 ");
  if (!hypotheses.length) hypotheses.push("现有数据只能说明结果变化，价格、标题、优惠券、内容和外部流量因素需要补充数据验证。");
  if (!actions.length) actions.push("先查看商品级环比表，选择变化最大且业务影响高的商品做一项可验证调整。");
  return { current, compare, primaryDelta, facts, conclusions, hypotheses, actions, rows };
}

function periodDiagnosisText(row, moduleKey) {
  if (row.status === "new") return "本次新增，暂无基期";
  if (row.status === "removed") return "对比期有，本次缺失";
  if (row.delta != null && row.delta < -.2) return "重点下滑";
  if (row.delta != null && row.delta > .2) return "增长观察";
  if (moduleKey === "product" && row.current?.atc > row.current?.netOrders * 3 && row.delta != null && row.delta < 0) return "加购未转化";
  if (moduleKey === "ads" && row.current?.roas != null && row.current.roas < 1) return "低效投放";
  if (moduleKey === "livestream" && row.current?.atc > row.current?.orders * 3) return "直播承接待查";
  return "常规观察";
}

function periodTableConfig(moduleKey) {
  if (moduleKey === "product") return [["商品", "name"], ["净销售额", "netSalesIdr", "money"], ["订单", "netOrders", "number"], ["访客", "visitors", "number"], ["加购", "atc", "number"], ["环比", "delta", "change"], ["判断", "diagnosis"]];
  if (moduleKey === "ads") return [["商品", "name"], ["广告花费", "spendIdr", "money"], ["广告归因销售", "salesIdr", "money"], ["ROAS", "roas", "ratio"], ["点击后 CR", "cr", "ratio"], ["环比", "delta", "change"], ["判断", "diagnosis"]];
  return [["商品", "name"], ["净销售额", "netSalesIdr", "money"], ["Gross Sales", "grossSalesIdr", "money"], ["订单", "orders", "number"], ["加购", "atc", "number"], ["环比", "delta", "change"], ["判断", "diagnosis"]];
}

function periodEnsureShape(snapshot) {
  if (!snapshot?.modules) return null;
  const modules = {};
  Object.keys(PERIOD_MODULES).forEach(moduleKey => {
    const module = snapshot.modules[moduleKey];
    if (!module) return;
    modules[moduleKey] = {};
    ["current", "compare"].forEach(period => {
      const value = module[period];
      if (value?.rows) modules[moduleKey][period] = { status: value.status || "ready", label: value.label || period, rows: value.rows.map(row => {
        const normalized = withShortName({ ...row, productId: periodId(row.productId), shopId: periodId(row.shopId) });
        if (Array.isArray(normalized.models)) normalized.models = normalized.models.map(model => ({ ...model, modelId: periodId(model.modelId) }));
        return normalized;
      }), errors: value.errors || [] };
    });
  });
  return { schemaVersion: snapshot.schemaVersion || "period-analysis-v1", generatedAt: snapshot.generatedAt || new Date().toISOString(), modules };
}

function periodSetModule(moduleKey, current, compare) {
  state.periodAnalysis = periodEnsureShape({ schemaVersion: "period-analysis-v1", generatedAt: new Date().toISOString(), modules: { ...(state.periodAnalysis?.modules || {}), [moduleKey]: { current, compare } } });
}

function renderPeriodAnalysis() {
  const snapshot = state.periodAnalysis;
  Object.keys(PERIOD_MODULES).forEach(moduleKey => {
    const card = document.querySelector(`[data-period-module="${moduleKey}"]`);
    const status = card?.querySelector("[data-period-status]");
    if (!status) return;
    const text = periodStatusText(moduleKey);
    status.textContent = text;
    status.className = `period-status ${periodStatus(moduleKey)}`;
    ["current", "compare"].forEach(period => {
      const draft = state.periodImportDraft[moduleKey]?.[period];
      const source = draft?.fileName || snapshot?.modules?.[moduleKey]?.[period]?.fileName || snapshot?.modules?.[moduleKey]?.[period]?.label;
      const target = document.querySelector(`[data-period-file-name="${moduleKey}.${period}"]`);
      if (target) target.textContent = source || "未选择文件";
    });
  });
  const readyKeys = Object.keys(PERIOD_MODULES).filter(moduleKey => periodStatus(moduleKey) === "ready");
  if (!readyKeys.length) {
    $("#periodModuleTabs").innerHTML = "";
    $("#periodSummary").innerHTML = "";
    $("#periodInsights").innerHTML = `<div class="period-empty">请选择一个板块的本次周期和对比周期文件，或加载 Demo。</div>`;
    $("#periodTableHead").innerHTML = ""; $("#periodTableBody").innerHTML = "";
    $("#periodAnalysisStatus").innerHTML = `<div>当前按板块分别上传：${Object.keys(PERIOD_MODULES).map(key => `${PERIOD_MODULES[key].label}（${periodStatusText(key)}）`).join(" · ")}</div>`;
    return;
  }
  if (!readyKeys.includes(state.selectedPeriodModule)) state.selectedPeriodModule = readyKeys[0];
  $("#periodModuleTabs").innerHTML = readyKeys.map(moduleKey => {
    const module = snapshot.modules[moduleKey];
    return `<button class="period-tab ${moduleKey === state.selectedPeriodModule ? "active" : ""}" type="button" role="tab" aria-selected="${moduleKey === state.selectedPeriodModule}" data-period-module-tab="${moduleKey}">${escapeHtml(PERIOD_MODULES[moduleKey].label)}<small>${escapeHtml(module.current.label)} vs ${escapeHtml(module.compare.label)}</small></button>`;
  }).join("");
  const diagnosis = periodDiagnosis(state.selectedPeriodModule);
  const moduleKey = state.selectedPeriodModule;
  const current = diagnosis.current;
  const compare = diagnosis.compare;
  const summaryFields = moduleKey === "product" ? [["净销售额", current.primary, compare.primary, "money"], ["订单", current.netOrders, compare.netOrders, "number"], ["访客", current.visitors, compare.visitors, "number"], ["加购", current.atc, compare.atc, "number"], ["商品数", current.count, compare.count, "number"]] : moduleKey === "ads" ? [["广告归因销售", current.salesIdr, compare.salesIdr, "money"], ["广告花费", current.spendIdr, compare.spendIdr, "money"], ["ROAS", current.roas, compare.roas, "ratio"], ["点击", current.clicks, compare.clicks, "number"], ["商品数", current.count, compare.count, "number"]] : [["净销售额", current.netSalesIdr, compare.netSalesIdr, "money"], ["Gross Sales", current.grossSalesIdr, compare.grossSalesIdr, "money"], ["订单", current.orders, compare.orders, "number"], ["买家", current.buyers, compare.buyers, "number"], ["商品数", current.count, compare.count, "number"]];
  const display = (value, type) => type === "money" ? periodFormatMoney(value) : type === "ratio" ? (value == null ? "—" : Number(value).toFixed(2)) : periodFormatNumber(value);
  $("#periodSummary").innerHTML = summaryFields.map(([label, value, prior, type]) => { const change = periodDelta(value, prior); return `<div><span>${escapeHtml(label)}</span><strong>${display(value, type)}</strong><small class="period-change ${periodChangeClass(change)}">${periodChangeText(change)} · 对比 ${display(prior, type)}</small></div>`; }).join("");
  $("#periodAnalysisStatus").innerHTML = `<div class="ready">当前查看：${escapeHtml(PERIOD_MODULES[moduleKey].label)} · 本次 ${escapeHtml(snapshot.modules[moduleKey].current.label)} · 对比 ${escapeHtml(snapshot.modules[moduleKey].compare.label)} · 匹配方式：Product ID</div>`;
  $("#periodInsights").innerHTML = `<div class="period-products-head"><div><span>AI REVIEW</span><h3>诊断意见</h3></div></div>${diagnosis.facts.map(item => `<article class="period-insight"><span>事实</span><p>${escapeHtml(item)}</p></article>`).join("")}<article class="period-insight"><span>诊断结论</span><ul>${diagnosis.conclusions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article><article class="period-insight"><span>待验证猜想</span><ul>${diagnosis.hypotheses.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article><article class="period-insight"><span>建议动作</span><ul>${diagnosis.actions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>${renderPeriodSelectedModel(moduleKey, diagnosis.rows)}`;
  const config = periodTableConfig(moduleKey);
  $("#periodTableHead").innerHTML = `<tr>${config.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>`;
  $("#periodTableBody").innerHTML = diagnosis.rows.slice(0, 60).map(row => {
    const item = row.current || row.compare; const cells = config.map(([, key, type]) => { if (key === "name") return `<td><button type="button" data-period-product="${escapeHtml(row.productId)}"><strong>${escapeHtml(item?.shortName || item?.name || "未命名商品")}</strong><small>${escapeHtml(row.productId)} · ${escapeHtml(item?.shop || "")}</small></button></td>`; if (key === "delta") return `<td><span class="period-change-badge ${periodChangeClass(row.delta)}">${periodChangeText(row.delta)}</span></td>`; if (key === "diagnosis") return `<td>${escapeHtml(periodDiagnosisText(row, moduleKey))}</td>`; const value = item?.[key]; return `<td>${type === "money" ? periodFormatMoney(value) : type === "ratio" ? (value == null ? "—" : Number(value).toFixed(2)) : periodFormatNumber(value)}</td>`; }); return `<tr>${cells.join("")}</tr>`;
  }).join("") || `<tr><td colspan="${config.length}" class="period-empty">当前板块没有可显示商品。</td></tr>`;
  $$('[data-period-module-tab]').forEach(button => button.addEventListener("click", () => { state.selectedPeriodModule = button.dataset.periodModuleTab; state.selectedPeriodProductId = null; renderPeriodAnalysis(); }));
  $$('[data-period-product]').forEach(button => button.addEventListener("click", () => { state.selectedPeriodProductId = button.dataset.periodProduct; renderPeriodAnalysis(); }));
}

function renderPeriodSelectedModel(moduleKey, rows) {
  if (moduleKey !== "product" || !state.selectedPeriodProductId) return "";
  const row = rows.find(item => item.productId === state.selectedPeriodProductId); const current = row?.current; const compare = row?.compare;
  if (!current) return "";
  const compareModels = new Map((compare?.models || []).map(model => [String(model.modelId), model]));
  const models = (current.models || []).slice(0, 12);
  return `<div class="period-models"><h4>Model 下钻 · ${escapeHtml(current.shortName || current.name)}（本次 ${models.length} 个）</h4><small class="period-original-name">原始名称：${escapeHtml(current.originalName || current.name)}</small><table><tbody>${models.map(model => { const prior = compareModels.get(String(model.modelId)); const delta = periodDelta(model.salesIdr, prior?.salesIdr); const status = model.orders > 0 ? "有效成交" : model.atc > 0 ? "有兴趣未成交" : model.stock > 0 ? "低贡献待验证" : "数据不足"; return `<tr><td>${escapeHtml(model.variation || model.sku || model.modelId)}<br><span class="period-model-status">${escapeHtml(status)} · 库存 ${periodFormatNumber(model.stock)}</span></td><td>${periodFormatMoney(model.salesIdr)}<br><span class="period-model-status">环比 ${periodChangeText(delta)}</span></td></tr>`; }).join("") || `<tr><td>没有可用 Model 明细；不能据此判定无效。</td></tr>`}</tbody></table></div>`;
}

async function loadPeriodDemo() {
  const response = await fetch("assets/demo-periods.json");
  if (!response.ok) throw new Error("Demo 数据文件加载失败");
  state.periodAnalysis = periodEnsureShape(await response.json());
  state.periodImportDraft = { product: {}, ads: {}, livestream: {} };
  state.selectedPeriodProductId = null;
  renderPeriodAnalysis(); showToast("已加载三板块真实周期 Demo");
}

async function handlePeriodFile(file, moduleKey, period) {
  const result = await parsePeriodFile(file, moduleKey);
  result.fileName = file.name;
  state.periodImportDraft[moduleKey][period] = result;
  const current = state.periodImportDraft[moduleKey].current;
  const compare = state.periodImportDraft[moduleKey].compare;
  periodSetModule(moduleKey, current, compare);
  renderPeriodAnalysis();
  if (result.status === "blocked") showToast(`${PERIOD_MODULES[moduleKey].label}：${result.errors.join("；")}`);
  else showToast(`${PERIOD_MODULES[moduleKey].label} ${period === "current" ? "本次" : "对比"}周期解析完成`);
}

function periodIssuePriorityLegacy(score, impactShare, severity) {
  if (severity >= .2 && (impactShare >= .1 || score >= 3)) return "P0";
  if (severity >= .1 || impactShare >= .04 || score >= 1.5) return "P1";
  return "P2";
}

function periodIssueFromRowsLegacy(moduleKey, key, title, rows, valueField, conclusion, hypothesis, action, verification, severity, mode = "loss") {
  const total = periodTotals(moduleKey, "current");
  const impactAmount = rows.reduce((sum, row) => {
    const current = Number(row.current?.[valueField]) || 0;
    const compare = Number(row.compare?.[valueField]) || 0;
    return sum + Math.max(0, mode === "spend" ? current - compare : compare - current);
  }, 0);
  const denominator = Math.max(1, Number(total.primary) || Number(total.salesIdr) || Number(total.netSalesIdr) || 1);
  const impactShare = impactAmount / denominator;
  const score = impactShare * 10 + severity * Math.log10(impactAmount + 10);
  return {
    id: moduleKey + "-" + key,
    moduleKey,
    source: PERIOD_MODULES[moduleKey].label,
    priority: periodIssuePriorityLegacy(score, impactShare, severity),
    title,
    impactAmount,
    affectedRows: rows,
    affectedCount: rows.length,
    conclusion,
    hypothesis,
    action,
    verification,
    evidence: rows.slice(0, 4).map(row => ({
      name: row.current?.shortName || row.current?.name || row.compare?.shortName || row.compare?.name || "未命名商品",
      productId: row.productId,
      delta: row.delta
    }))
  };
}

function periodUnifiedIssuesLegacy() {
  const issues = [];
  ["product", "ads", "livestream"].forEach(moduleKey => {
    if (periodStatus(moduleKey) !== "ready") return;
    const rows = periodCompareRows(moduleKey);
    if (moduleKey === "product") {
      const stableTraffic = rows.filter(row => row.status === "matched" && row.delta != null && row.delta < -.1 && (periodDelta(row.current.visitors, row.compare.visitors) ?? -1) >= -.05);
      if (stableTraffic.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "stable-traffic-conversion-down", "流量基本稳定，但商品成交承接下降", stableTraffic, "netSalesIdr", "用户仍然进入商品页，但销售结果没有跟上流量，优先排查下单承接。", "可能与价格、优惠券、规格库存、运费或结算环节有关；当前文件不能单独确认原因。", "抽查受影响商品的券后价、主推 Model 库存和商品页价格承诺，做单变量修复。", "订单转化率、加购到订单转化率、净订单、净销售额", .24));
      const trafficDown = rows.filter(row => row.status === "matched" && (periodDelta(row.current.visitors, row.compare.visitors) ?? 0) < -.1);
      if (trafficDown.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "traffic-down", "商品访客下降，流量入口需要定位", trafficDown, "netSalesIdr", "本次商品流量收缩，是经营结果下滑的重要信号。", "可能与标题点击率、搜索词、活动资源或广告引流变化有关。", "按商品和店铺拆访客下降 Top 20，再结合广告和热搜词数据定位入口。", "访客、曝光、CTR、商品点击、订单转化率", .18));
      const atcDown = rows.filter(row => row.status === "matched" && row.current.atc > row.current.netOrders * 1.5 && (periodDelta(row.current.netOrders, row.compare.netOrders) ?? 0) < -.1);
      if (atcDown.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "atc-up-orders-down", "加购增加但订单下降，结算承接存在阻力", atcDown, "netSalesIdr", "购买意向存在，但从加购到下单的转化变弱。", "可能是优惠券门槛、规格库存、价格、运费或结算体验问题。", "先检查加购最高的商品和 Model，核对券后价、库存与结算可用性。", "加购到订单转化率、订单、净销售额、缺货率", .22));
    } else if (moduleKey === "ads") {
      const efficiency = rows.filter(row => row.status === "matched" && row.current.spendIdr > row.compare.spendIdr * 1.1 && row.current.roas != null && row.compare.roas != null && row.current.roas < row.compare.roas * .9);
      if (efficiency.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "spend-up-roas-down", "广告花费增加，但广告效率下降", efficiency, "spendIdr", "扩量没有带来等比例的广告归因销售增长，边际效率正在恶化。", "可能扩展到低相关词，或点击后的商品页承接变弱；没有毛利数据，不能直接称为亏损。", "按花费增量拆商品和关键词，先控制低效增量，再核对素材、词和商品页。", "Ads Spend、广告归因 Gross Sales、ROAS、点击后 CR", .25, "spend"));
      const ctrDown = rows.filter(row => row.status === "matched" && (periodDelta(row.current.ctr, row.compare.ctr) ?? 0) < -.1);
      if (ctrDown.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "ctr-down", "广告点击率下降，点击前承诺需要复核", ctrDown, "salesIdr", "曝光转化为点击的效率走弱，问题优先发生在点击前。", "标题、主图、价格展示或关键词相关性可能不足。", "保持预算基本不变，做标题或主图单变量测试，观察 CTR 和点击后 CR。", "Impressions、CTR、Clicks、点击后 CR", .15));
      const crDown = rows.filter(row => row.status === "matched" && (periodDelta(row.current.cr, row.compare.cr) ?? 0) < -.1);
      if (crDown.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "post-click-cr-down", "广告点击增加，但点击后转化下降", crDown, "salesIdr", "用户已经点击广告，但商品承接没有转成订单。", "可能与价格、优惠券、库存或主推 Model 不匹配有关。", "对点击增长且 CR 下滑商品核对券、价格、库存和落地页。", "Clicks、Orders、点击后 CR、广告归因销售", .18));
    } else {
      const handoff = rows.filter(row => row.status === "matched" && (periodDelta(row.current.atc, row.compare.atc) ?? 0) > .1 && (periodDelta(row.current.orders, row.compare.orders) ?? 0) < -.1);
      if (handoff.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "atc-up-orders-down", "直播加购增长，但订单没有同步增长", handoff, "netSalesIdr", "直播间存在商品兴趣，但从加购到下单的承接变弱。", "可能与讲解、规格引导、优惠券、价格或库存有关；当前数据没有场次和主播维度。", "回看受影响商品的讲解与优惠，逐个核对主推 Model 可售库存。", "ATC、Orders、加购到订单转化率、直播净销售额", .22));
      const netGap = rows.filter(row => row.status === "matched" && (periodDelta(row.current.grossSalesIdr, row.compare.grossSalesIdr) ?? 0) > .1 && (periodDelta(row.current.netSalesIdr, row.compare.netSalesIdr) ?? 0) < 0);
      if (netGap.length) issues.push(periodIssueFromRowsLegacy(moduleKey, "gross-up-net-down", "直播 Gross Sales 增长，但 Net Sales 下滑", netGap, "netSalesIdr", "直播表面成交增长没有转化为净销售，Gross 与 Net 的差额需要核对。", "可能来自退款、取消或平台净额处理，不能直接视为直播增长。", "按商品核对退款、取消明细和售后周期，确认净销售下降原因。", "Gross Sales、Net Sales、退款、取消、订单", .2));
    }
  });
  return issues.sort((a, b) => b.impactAmount - a.impactAmount);
}

function periodIssuePriority(score, impactShare, severity) {
  if (severity >= .2 && (impactShare >= .1 || score >= 3)) return "P0";
  if (severity >= .1 || impactShare >= .04 || score >= 1.5) return "P1";
  return "P2";
}

function periodIssueFromRows(moduleKey, key, title, rows, fields, conclusion, hypothesis, action, verification, severity) {
  const currentTotal = periodTotals(moduleKey, "current");
  const impactAmount = rows.reduce((sum, row) => {
    const current = Number(row.current?.[fields.current]) || 0;
    const compare = Number(row.compare?.[fields.compare || fields.current]) || 0;
    return sum + Math.max(0, fields.mode === "spend" ? current - compare : compare - current);
  }, 0);
  const denominator = Math.max(1, Number(currentTotal.primary) || Number(currentTotal.salesIdr) || Number(currentTotal.netSalesIdr) || 1);
  const impactShare = impactAmount / denominator;
  const score = Math.max(.1, impactShare * 10 + severity * Math.log10(impactAmount + 10));
  return { id: `${moduleKey}-${key}`, moduleKey, source: PERIOD_MODULES[moduleKey].label, priority: periodIssuePriority(score, impactShare, severity), title, key, impactAmount, impactShare, severity, affectedRows: rows, affectedCount: rows.length, conclusion, hypothesis, action, verification, evidence: rows.slice(0, 4).map(row => ({ name: row.current?.shortName || row.current?.name || row.compare?.shortName || row.compare?.name || "未命名商品", productId: row.productId, delta: row.delta })) };
}

function periodRatio(value, base) {
  return Number(base) ? Number(value || 0) / Number(base) : null;
}

function periodLinkModels(row) {
  return new Map((row?.models || []).map(model => [periodId(model.modelId) || model.variation, model]));
}

function periodModelDiagnosis(current, compare) {
  const currentModels = periodLinkModels(current);
  const compareModels = periodLinkModels(compare);
  const ids = new Set([...currentModels.keys(), ...compareModels.keys()]);
  return [...ids].map(modelId => {
    const currentModel = currentModels.get(modelId) || null;
    const compareModel = compareModels.get(modelId) || null;
    const currentUnits = Number(currentModel?.units) || 0;
    const compareUnits = Number(compareModel?.units) || 0;
    const currentSales = Number(currentModel?.salesIdr) || 0;
    const compareSales = Number(compareModel?.salesIdr) || 0;
    return {
      modelId,
      current: currentModel,
      compare: compareModel,
      name: currentModel?.variation || compareModel?.variation || "未命名 Model",
      salesLost: Math.max(0, compareSales - currentSales),
      salesDelta: periodDelta(currentSales, compareSales),
      unitsDelta: periodDelta(currentUnits, compareUnits),
      aspCurrent: periodRatio(currentSales, currentUnits),
      aspCompare: periodRatio(compareSales, compareUnits)
    };
  }).sort((a, b) => b.salesLost - a.salesLost);
}

function periodAdSignal(current, compare) {
  if (!current && !compare) return { status: "missing", label: "未接入广告数据", kind: "missing" };
  const spendCurrent = Number(current?.spendIdr) || 0;
  const spendCompare = Number(compare?.spendIdr) || 0;
  const spendDelta = periodDelta(spendCurrent, spendCompare);
  const clicksDelta = periodDelta(current?.clicks, compare?.clicks);
  const impressionsDelta = periodDelta(current?.impressions, compare?.impressions);
  const roasDelta = periodDelta(current?.roas, compare?.roas);
  const crDelta = periodDelta(current?.cr, compare?.cr);
  if (spendCompare > 0 && spendCurrent === 0) return { status: "signal", label: "本期无广告消耗 · 疑似停投", kind: "coverage", spendDelta, clicksDelta, impressionsDelta, roasDelta, crDelta };
  if (spendDelta != null && spendDelta < -.3 && (clicksDelta == null || clicksDelta < -.2)) return { status: "signal", label: "广告覆盖收缩", kind: "coverage", spendDelta, clicksDelta, impressionsDelta, roasDelta, crDelta };
  if (spendDelta != null && spendDelta > .1 && roasDelta != null && roasDelta < -.1) return { status: "signal", label: "广告效率恶化", kind: "efficiency", spendDelta, clicksDelta, impressionsDelta, roasDelta, crDelta };
  if (crDelta != null && crDelta < -.1) return { status: "signal", label: "广告点击后承接变弱", kind: "conversion", spendDelta, clicksDelta, impressionsDelta, roasDelta, crDelta };
  return { status: "observed", label: "广告未见明显异常", kind: "normal", spendDelta, clicksDelta, impressionsDelta, roasDelta, crDelta };
}

function periodLiveSignal(current, compare) {
  if (!current && !compare) return { status: "missing", label: "未接入直播数据", kind: "missing" };
  const netDelta = periodDelta(current?.netSalesIdr, compare?.netSalesIdr);
  const atcDelta = periodDelta(current?.atc, compare?.atc);
  const ordersDelta = periodDelta(current?.orders, compare?.orders);
  const grossDelta = periodDelta(current?.grossSalesIdr, compare?.grossSalesIdr);
  const buyerDelta = periodDelta(current?.buyers, compare?.buyers);
  if (atcDelta != null && atcDelta > .1 && ordersDelta != null && ordersDelta < -.1) return { status: "signal", label: "直播加购增长但成交承接下降", kind: "conversion", netDelta, atcDelta, ordersDelta, grossDelta, buyerDelta };
  if (grossDelta != null && grossDelta > .1 && netDelta != null && netDelta < 0) return { status: "signal", label: "直播 Gross 增长但 Net 下滑", kind: "net", netDelta, atcDelta, ordersDelta, grossDelta, buyerDelta };
  if (netDelta != null && netDelta < -.1 && (atcDelta == null || atcDelta < 0)) return { status: "signal", label: "直播商品产出下降", kind: "traffic", netDelta, atcDelta, ordersDelta, grossDelta, buyerDelta };
  return { status: "observed", label: "直播未见明显异常", kind: "normal", netDelta, atcDelta, ordersDelta, grossDelta, buyerDelta };
}

function periodLinkCause(metrics, adSignal, liveSignal) {
  if (metrics.current == null) return { type: "链接消失", title: "本期无销售", conclusion: "对比期有销售，但本期没有商品销售记录，先确认链接状态、库存和是否仍在售。", hypothesis: "可能是下架、缺货、数据过滤或链接经营状态变化；当前数据不能直接确认具体原因。", action: "先确认链接是否在售、主推 Model 是否有库存，再检查广告计划和活动状态。", verification: "链接可售状态、库存、订单、净销售额" };
  if (metrics.visitorDelta != null && metrics.visitorDelta < -.1 && adSignal.kind === "coverage") return { type: "流量 / 广告覆盖", title: "访客下降，广告覆盖同步收缩", conclusion: "这条链接的销售下滑首先表现为流量收缩，广告覆盖减少可能是重要渠道信号。", hypothesis: "报表显示广告消耗或点击减少，但缺少计划状态和预算变更，不能直接确认是停投还是预算不足。", action: "确认广告计划是否暂停、预算是否耗尽；同时检查自然流量入口，暂不直接改价格。", verification: "商品访客、广告曝光、点击、广告花费、净订单" };
  if (metrics.aspDelta != null && metrics.aspDelta < -.08 && (metrics.unitsDelta == null || metrics.unitsDelta < .05)) return { type: "件单价", title: "件单价下降，销售结构需要核对", conclusion: "这条链接的 GMV 下滑有明显件单价下降贡献，需先核对价格、优惠和低价 Model 结构。", hypothesis: "件单价变化可能来自实际到手价、优惠券或销售规格结构变化，当前没有价格历史，不能直接确认标价变化。", action: "核对本期与对比期售价、券后价、活动价，并检查低价 Model 是否占比上升。", verification: "件单价、销量、券后价、各 Model 销售占比" };
  if ((metrics.atcToOrderDelta != null && metrics.atcToOrderDelta < -.1) || (metrics.visitorDelta != null && metrics.visitorDelta >= -.05 && metrics.orderRateDelta != null && metrics.orderRateDelta < -.1)) return { type: "商品承接", title: "流量仍在，但商品成交承接下降", conclusion: "这条链接的主要断点在访客到订单之间，用户仍在进入商品页，但没有转化为成交。", hypothesis: "可能与券后价、库存、主推 Model、运费或结算体验有关；当前数据不能单独确认具体原因。", action: "优先核对券后价、主推 Model 可售状态、库存和结算可用性，再决定是否扩大流量。", verification: "订单转化率、加购到订单转化率、订单、净销售额" };
  if (metrics.coverageDelta != null && metrics.coverageDelta < -.2) return { type: "库存 / Model", title: "库存覆盖下降，可能限制成交", conclusion: "销售下滑同时伴随库存覆盖收缩，需要确认主推 Model 是否已经影响可购买性。", hypothesis: "库存约束可能先影响主推规格，再传导到订单和 GMV；当前数据没有完整缺货原因。", action: "按 Model 检查库存、覆盖天数和主推规格，制定补货或替代规格方案。", verification: "Model 库存、覆盖天数、缺货率、订单" };
  if (liveSignal.kind === "conversion") return { type: "直播承接", title: "直播有兴趣，但成交承接下降", conclusion: "商品整体销售下滑同时，直播加购没有转化为订单，直播渠道存在承接断点。", hypothesis: "可能与直播讲解、规格引导、优惠配置或库存有关；当前商品报表没有场次和主播维度。", action: "回看该商品直播讲解与优惠配置，核对主推 Model 可售状态，不先归因到主播。", verification: "直播加购到订单转化率、直播订单、直播净销售额" };
  return { type: "待拆解", title: "商品销售下滑，需继续拆解", conclusion: "这条链接出现明显 GMV 掉量，但现有指标没有形成单一断点，需要结合品类和渠道信号继续核查。", hypothesis: "可能由流量、件单价、商品承接、库存或渠道结构共同造成。", action: "先按销售链路核对访客、加购、订单、件单价，再查看广告和直播信号。", verification: "访客、订单转化率、件单价、广告点击、直播订单" };
}

function periodUnifiedIssues() {
  if (periodStatus("product") !== "ready") return [];
  const adsCurrent = periodRowMap("ads", "current");
  const adsCompare = periodRowMap("ads", "compare");
  const liveCurrentMap = periodRowMap("livestream", "current");
  const liveCompareMap = periodRowMap("livestream", "compare");
  const productTotal = periodTotals("product", "compare").primary || 1;
  const links = periodCompareRows("product").map(row => {
    const current = row.current;
    const compare = row.compare;
    const currentSales = Number(current?.netSalesIdr) || 0;
    const compareSales = Number(compare?.netSalesIdr) || 0;
    const currentUnits = Number(current?.netUnits) || 0;
    const compareUnits = Number(compare?.netUnits) || 0;
    const currentOrders = Number(current?.netOrders) || 0;
    const compareOrders = Number(compare?.netOrders) || 0;
    const currentVisitors = Number(current?.visitors) || 0;
    const compareVisitors = Number(compare?.visitors) || 0;
    const currentAtc = Number(current?.atc) || 0;
    const compareAtc = Number(compare?.atc) || 0;
    const currentAsp = periodRatio(currentSales, currentUnits);
    const compareAsp = periodRatio(compareSales, compareUnits);
    const currentOrderRate = periodRatio(currentOrders, currentVisitors);
    const compareOrderRate = periodRatio(compareOrders, compareVisitors);
    const currentAtcToOrder = periodRatio(currentOrders, currentAtc);
    const compareAtcToOrder = periodRatio(compareOrders, compareAtc);
    const coverageDelta = periodDelta(current?.coverage, compare?.coverage);
    const metrics = {
      current, compare, currentSales, compareSales, currentUnits, compareUnits, currentOrders, compareOrders, currentVisitors, compareVisitors, currentAtc, compareAtc, currentAsp, compareAsp,
      salesDelta: periodDelta(currentSales, compareSales), unitsDelta: periodDelta(currentUnits, compareUnits), visitorDelta: periodDelta(currentVisitors, compareVisitors), orderRateDelta: periodDelta(currentOrderRate, compareOrderRate), atcToOrderDelta: periodDelta(currentAtcToOrder, compareAtcToOrder), aspDelta: periodDelta(currentAsp, compareAsp), coverageDelta
    };
    const adCurrent = adsCurrent.get(row.productId) || null;
    const adCompare = adsCompare.get(row.productId) || null;
    const liveCurrent = liveCurrentMap.get(row.productId) || null;
    const liveCompare = liveCompareMap.get(row.productId) || null;
    const ad = { ...periodAdSignal(adCurrent, adCompare), current: adCurrent, compare: adCompare };
    const live = { ...periodLiveSignal(liveCurrent, liveCompare), current: liveCurrent, compare: liveCompare };
    const cause = periodLinkCause(metrics, ad, live);
    const lost = Math.max(0, compareSales - currentSales);
    const priceImpact = currentUnits * ((currentAsp || 0) - (compareAsp || 0));
    const volumeImpact = (currentUnits - compareUnits) * (compareAsp || 0);
    const category = current?.category || compare?.category || "未归类";
    return { id: `product-link-${row.productId}`, moduleKey: "product", source: "商品 & Model 销售", rank: 0, priority: "P2", productId: row.productId, category, shortName: current?.shortName || compare?.shortName || "未命名商品", originalName: current?.originalName || compare?.originalName || current?.name || compare?.name || "未命名商品", current, compare, status: row.status, impactAmount: lost, impactShare: lost / productTotal, lost, metrics, ad, live, cause, title: `${current?.shortName || compare?.shortName || "未命名商品"} · ${cause.title}`, conclusion: cause.conclusion, hypothesis: cause.hypothesis, action: cause.action, verification: cause.verification, modelRows: periodModelDiagnosis(current, compare), priceImpact, volumeImpact, affectedRows: [row], affectedCount: 1, evidence: [
      { name: "GMV", current: currentSales, compare: compareSales, delta: metrics.salesDelta },
      { name: "销量", current: currentUnits, compare: compareUnits, delta: metrics.unitsDelta },
      { name: "件单价", current: currentAsp, compare: compareAsp, delta: metrics.aspDelta },
      { name: "访客", current: currentVisitors, compare: compareVisitors, delta: metrics.visitorDelta }
    ] };
  }).filter(issue => issue.lost > 0 || issue.status === "removed").sort((a, b) => b.lost - a.lost);
  return links.map((issue, index) => ({ ...issue, rank: index + 1, priority: issue.impactShare >= .05 ? "P0" : issue.impactShare >= .015 ? "P1" : "P2" }));
}

function periodHomeMetricCards() {
  const productReady = periodStatus("product") === "ready";
  if (!productReady) return "";
  const current = periodTotals("product", "current");
  const compare = periodTotals("product", "compare");
  const issues = periodUnifiedIssues();
  const lost = issues.reduce((sum, issue) => sum + issue.lost, 0);
  const cards = [
    ["净销售额", periodFormatMoney(current.primary), periodChangeText(periodDelta(current.primary, compare.primary)), "商品销售主结果"],
    ["净订单", periodFormatNumber(current.netOrders), periodChangeText(periodDelta(current.netOrders, compare.netOrders)), "商品销售主结果"],
    ["商品访客", periodFormatNumber(current.visitors), periodChangeText(periodDelta(current.visitors, compare.visitors)), "商品销售主结果"],
    ["GMV掉量链接", String(issues.length), `少卖 ${periodFormatMoney(lost)}`, "按 Product ID 排序"]
  ];
  return cards.map(card => "<article><span>" + escapeHtml(card[0]) + "</span><strong>" + escapeHtml(card[1]) + "</strong><small>" + escapeHtml(card[3]) + " · " + escapeHtml(card[2]) + "</small></article>").join("");
}

function periodHomeChannelCard(moduleKey, title, fields) {
  if (periodStatus(moduleKey) !== "ready") return "<article class=\"period-channel-card channel-missing\"><span>" + escapeHtml(title) + "</span><strong>未完成</strong><small>" + escapeHtml(periodStatusText(moduleKey)) + " · 不参与首页问题排序</small></article>";
  const current = periodTotals(moduleKey, "current");
  const compare = periodTotals(moduleKey, "compare");
  const values = fields.map(field => {
    const value = field[2] === "money" ? periodFormatMoney(current[field[1]]) : field[2] === "ratio" ? (current[field[1]] == null ? "—" : Number(current[field[1]]).toFixed(2)) : periodFormatNumber(current[field[1]]);
    return "<div><span>" + escapeHtml(field[0]) + "</span><strong>" + value + "</strong><small>" + periodChangeText(periodDelta(current[field[1]], compare[field[1]])) + "</small></div>";
  }).join("");
  return "<article class=\"period-channel-card\"><div class=\"period-channel-head\"><span>" + escapeHtml(title) + "</span><small>" + escapeHtml(state.periodAnalysis.modules[moduleKey].current.label) + " vs " + escapeHtml(state.periodAnalysis.modules[moduleKey].compare.label) + "</small></div><div class=\"period-channel-metrics\">" + values + "</div></article>";
}

function periodCategoryRollup(issues) {
  const groups = new Map();
  issues.forEach(issue => {
    const currentSales = Number(issue.current?.netSalesIdr) || 0;
    const compareSales = Number(issue.compare?.netSalesIdr) || 0;
    const group = groups.get(issue.category) || { category: issue.category, links: 0, lost: 0, currentSales: 0, compareSales: 0 };
    group.links += 1; group.lost += issue.lost; group.currentSales += currentSales; group.compareSales += compareSales;
    groups.set(issue.category, group);
  });
  return [...groups.values()].map(group => ({ ...group, delta: periodDelta(group.currentSales, group.compareSales) })).sort((a, b) => b.lost - a.lost);
}

function periodIssueFilterMatch(issue, filter) {
  if (filter === "全部") return true;
  if (filter === "price") return issue.cause.type === "件单价";
  if (filter === "conversion") return ["商品承接", "直播承接"].includes(issue.cause.type);
  if (filter === "ads") return issue.ad.status === "signal";
  if (filter === "livestream") return issue.live.status === "signal";
  if (filter === "removed") return issue.status === "removed";
  return true;
}

function periodIssueCard(issue) {
  const metrics = issue.metrics;
  const signals = [issue.ad.status === "signal" ? `广告：${issue.ad.label}` : "", issue.live.status === "signal" ? `直播：${issue.live.label}` : ""].filter(Boolean);
  const metric = (label, value, delta) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small class="period-change ${periodChangeClass(delta)}">${escapeHtml(periodChangeText(delta))}</small></div>`;
  return `<article class="period-issue-card link-loss-card priority-${issue.priority.toLowerCase()}">
    <div class="period-issue-card-head"><span class="period-rank">TOP ${issue.rank}</span><span class="period-issue-source">${escapeHtml(issue.category)}</span><span class="period-priority">${issue.priority}</span></div>
    <h3>${escapeHtml(issue.shortName)}</h3><p class="period-link-id">Product ID · ${escapeHtml(issue.productId)}</p>
    <div class="period-issue-impact"><strong>${periodFormatMoney(issue.lost)}</strong><span>本周期少卖金额</span></div>
    <div class="period-link-metrics">${metric("GMV", periodFormatMoney(metrics.currentSales), metrics.salesDelta)}${metric("销量", periodFormatNumber(metrics.currentUnits), metrics.unitsDelta)}${metric("件单价", periodFormatMoney(metrics.currentAsp), metrics.aspDelta)}${metric("访客", periodFormatNumber(metrics.currentVisitors), metrics.visitorDelta)}</div>
    <div class="period-link-cause"><span>主诊断 · ${escapeHtml(issue.cause.type)}</span><strong>${escapeHtml(issue.cause.title)}</strong></div>
    <div class="period-signal-tags">${signals.length ? signals.map(signal => `<span>${escapeHtml(signal)}</span>`).join("") : "<span class=\"muted\">广告 / 直播暂无强信号</span>"}</div>
    <div class="period-issue-action"><span>先做什么</span>${escapeHtml(issue.action)}</div>
    <button type="button" class="period-issue-detail-button" data-period-issue="${escapeHtml(issue.id)}">打开链接诊断 →</button>
  </article>`;
}

function renderPeriodHome() {
  const ready = ["product", "ads", "livestream"].some(moduleKey => periodStatus(moduleKey) === "ready");
  $("#periodHomeEmpty").hidden = ready;
  if (!ready) {
    $("#periodHomeStatus").innerHTML = "<span>尚未生成分析</span><strong>请先新建分析任务</strong><small>上传两个周期后运行诊断</small>";
    $("#periodHomeHealth").innerHTML = "";
    $("#periodOutcomeGrid").innerHTML = "";
    $("#periodChannelGrid").innerHTML = "";
    $("#periodIssueGrid").innerHTML = "";
    $("#periodIssueCount").textContent = "暂无问题";
    return;
  }
  const first = ["product", "ads", "livestream"].find(moduleKey => periodStatus(moduleKey) === "ready");
  const module = state.periodAnalysis.modules[first];
  const taskLabel = state.analysisTask?.status === "published" ? "已发布" : "Demo / 草稿";
  $("#periodHomeStatus").innerHTML = "<span>当前分析任务 · " + taskLabel + "</span><strong>" + escapeHtml(module.current.label) + " vs " + escapeHtml(module.compare.label) + "</strong><small>规则诊断 · Product ID 匹配</small>";
  $("#periodHomeHealth").innerHTML = ["product", "ads", "livestream"].map(moduleKey => "<span class=\"home-health-" + periodStatus(moduleKey) + "\"><b></b>" + escapeHtml(PERIOD_MODULES[moduleKey].label) + " · " + escapeHtml(periodStatusText(moduleKey)) + "</span>").join("");
  $("#periodOutcomeGrid").innerHTML = periodHomeMetricCards() || "<div class=\"period-home-note\">商品销售尚未完成，当前只展示独立渠道信号。</div>";
  $("#periodChannelGrid").innerHTML = periodHomeChannelCard("ads", "产品广告", [["广告花费", "spendIdr", "money"], ["广告归因销售", "salesIdr", "money"], ["ROAS", "roas", "ratio"]]) + periodHomeChannelCard("livestream", "产品直播", [["净销售额", "netSalesIdr", "money"], ["订单", "orders", "number"], ["加购", "atc", "number"]]);
  const issues = periodUnifiedIssues();
  const filter = state.periodIssueFilter;
  const search = state.periodIssueSearch.toLowerCase();
  const visible = issues.filter(issue => periodIssueFilterMatch(issue, filter) && (!search || (issue.shortName + issue.originalName + issue.category + issue.productId + issue.cause.title).toLowerCase().includes(search)));
  const lost = visible.reduce((sum, issue) => sum + issue.lost, 0);
  $("#periodIssueCount").textContent = visible.length + " 条链接 · 少卖 " + periodFormatMoney(lost) + " · 按少卖金额排序";
  $("#periodIssueFilters").innerHTML = [["全部", "全部"], ["件单价信号", "price"], ["商品承接", "conversion"], ["广告有信号", "ads"], ["直播有信号", "livestream"], ["本期无销售", "removed"]].map(item => "<button type=\"button\" class=\"period-filter-button " + (filter === item[1] ? "active" : "") + "\" data-period-issue-filter=\"" + item[1] + "\">" + item[0] + "</button>").join("");
  $("#periodIssueGrid").innerHTML = visible.slice(0, 12).map(periodIssueCard).join("") || "<div class=\"period-home-note\">当前筛选没有 GMV 掉量链接。</div>";
  $$("[data-period-issue-filter]").forEach(button => button.addEventListener("click", () => { state.periodIssueFilter = button.dataset.periodIssueFilter; renderPeriodHome(); }));
  $$("[data-period-issue]").forEach(button => button.addEventListener("click", () => openPeriodIssueDialog(button.dataset.periodIssue)));
}

function renderHistory() {
  const history = state.analysisHistory || [];
  $("#historyStatus").innerHTML = "<div><span>版本规则</span><strong>已发布版本只读 · 修正生成新版本</strong></div><div><span>当前记录</span><strong>" + history.length + " 个分析任务</strong></div>";
  $("#historyList").innerHTML = history.length ? history.map(item => "<article class=\"history-card\"><div><span>" + escapeHtml(item.status || "草稿") + "</span><h3>" + escapeHtml(item.title) + "</h3><small>" + escapeHtml(item.currentLabel) + " vs " + escapeHtml(item.compareLabel) + "</small></div><strong>" + escapeHtml(item.issueCount + " 个问题") + "</strong><button type=\"button\" data-history-id=\"" + escapeHtml(item.id) + "\">查看版本</button></article>").join("") : "<div class=\"period-home-note\">暂无历史分析。完成一次周期诊断后，系统会在这里保留任务版本。</div>";
}

function saveAnalysisHistory(status = "draft") {
  const ready = ["product", "ads", "livestream"].find(moduleKey => periodStatus(moduleKey) === "ready");
  if (!ready) return;
  const module = state.periodAnalysis.modules[ready];
  const item = {
    id: "analysis-" + Date.now(),
    title: "周期运营诊断",
    currentLabel: module.current.label,
    compareLabel: module.compare.label,
    issueCount: periodUnifiedIssues().length,
    status,
    createdAt: new Date().toISOString(),
    snapshot: periodSourceSnapshot()
  };
  state.analysisHistory = [item, ...(state.analysisHistory || []).filter(history => history.id !== item.id)].slice(0, 30);
  localStorage.setItem("shopee-ai-analysis-history", JSON.stringify(state.analysisHistory));
  state.analysisTask = { id: item.id, status, currentLabel: item.currentLabel, compareLabel: item.compareLabel };
  localStorage.setItem("shopee-ai-analysis-task", JSON.stringify(state.analysisTask));
  renderHistory();
  renderPeriodHome();
}

function periodDetailValue(value, type = "number") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  if (type === "money") return periodFormatMoney(value);
  if (type === "percent") return formatPercent(value, 2);
  if (type === "ratio") return Number(value).toFixed(2);
  return periodFormatNumber(value);
}

function periodDetailMetric(label, current, compare, type = "number") {
  const delta = periodDelta(current, compare);
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(periodDetailValue(current, type))}</strong><small>${escapeHtml(periodChangeText(delta))} · 对比 ${escapeHtml(periodDetailValue(compare, type))}</small></div>`;
}

function periodChannelDetail(title, signal, fields) {
  if (signal.status === "missing") return `<section class="period-detail-section"><div class="period-detail-section-head"><span>${escapeHtml(title)}</span><small>未匹配 Product ID</small></div><p class="period-detail-muted">${escapeHtml(signal.label)}，本条链接暂不生成渠道判断。</p></section>`;
  const current = signal.current || {};
  const compare = signal.compare || {};
  return `<section class="period-detail-section"><div class="period-detail-section-head"><span>${escapeHtml(title)}</span><strong class="period-signal-${signal.status}">${escapeHtml(signal.label)}</strong></div><div class="period-detail-metrics">${fields.map(field => periodDetailMetric(field[0], current[field[1]], compare[field[1]], field[2])).join("")}</div><p class="period-detail-muted">${title === "广告信号" ? "广告归因销售独立展示，不与商品净销售额相加；投放状态需结合计划后台确认。" : "当前直播报表按商品关联；没有场次、主播和完整曝光字段时，不直接归因到具体场次。"}</p></section>`;
}

function openPeriodIssueDialog(issueId) {
  const issue = periodUnifiedIssues().find(item => item.id === issueId);
  if (!issue) return;
  const metrics = issue.metrics;
  const allIssues = periodUnifiedIssues();
  const categories = periodCategoryRollup(allIssues);
  const category = categories.find(item => item.category === issue.category);
  const categoryRank = categories.findIndex(item => item.category === issue.category) + 1;
  const modelRows = issue.modelRows.slice(0, 8);
  const modelHtml = modelRows.length ? `<table class="period-detail-table"><thead><tr><th>Model</th><th>销量</th><th>订单</th><th>件单价</th><th>库存</th></tr></thead><tbody>${modelRows.map(row => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.modelId)}</small></td><td>${periodDetailValue(row.current?.units)}<small>${periodChangeText(row.unitsDelta)}</small></td><td>${periodDetailValue(row.current?.orders)}<small>${periodChangeText(periodDelta(row.current?.orders, row.compare?.orders))}</small></td><td>${periodDetailValue(row.aspCurrent, "money")}<small>${periodChangeText(periodDelta(row.aspCurrent, row.aspCompare))}</small></td><td>${periodDetailValue(row.current?.stock)}</td></tr>`).join("")}</tbody></table>` : `<p class="period-detail-muted">当前链接没有足够的 Model 对比数据。</p>`;
  const categoryHtml = category ? `<div class="period-category-context"><div><span>所属品类</span><strong>${escapeHtml(category.category)}</strong><small>掉量品类排名 #${categoryRank} · ${category.links} 条掉量链接</small></div><div><span>品类少卖金额</span><strong>${periodFormatMoney(category.lost)}</strong><small>${periodChangeText(category.delta)} · 本期 ${periodFormatMoney(category.currentSales)}</small></div></div>` : "";
  $("#periodIssueDialogTitle").textContent = `${issue.shortName} · 链接诊断`;
  $("#periodIssueDialogTags").innerHTML = `<span>TOP ${issue.rank}</span><span>${escapeHtml(issue.category)}</span><span>${escapeHtml(issue.productId)}</span><span>少卖 ${periodFormatMoney(issue.lost)}</span>`;
  $("#periodIssueDialogBody").innerHTML = `<div class="period-detail-hero"><span>主诊断 · ${escapeHtml(issue.cause.type)}</span><h3>${escapeHtml(issue.cause.title)}</h3><p>${escapeHtml(issue.conclusion)}</p></div>
    <div class="diagnosis-score-grid period-detail-score"><article><span>本期销售额</span><strong>${periodFormatMoney(metrics.currentSales)}</strong><small>对比 ${periodFormatMoney(metrics.compareSales)}</small></article><article><span>少卖金额</span><strong>${periodFormatMoney(issue.lost)}</strong><small>${periodChangeText(metrics.salesDelta)}</small></article><article><span>销量贡献</span><strong>${periodFormatMoney(issue.volumeImpact)}</strong><small>GMV 变化拆解</small></article><article><span>件单价贡献</span><strong>${periodFormatMoney(issue.priceImpact)}</strong><small>GMV 变化拆解</small></article></div>
    <section class="period-detail-section"><div class="period-detail-section-head"><span>01 · 商品销售链路</span><small>本期 vs 对比期</small></div><div class="period-detail-metrics">${periodDetailMetric("商品访客", metrics.currentVisitors, metrics.compareVisitors)}${periodDetailMetric("加购", metrics.currentAtc, metrics.compareAtc)}${periodDetailMetric("订单", metrics.currentOrders, metrics.compareOrders)}${periodDetailMetric("销量件数", metrics.currentUnits, metrics.compareUnits)}${periodDetailMetric("订单转化率", periodRatio(metrics.currentOrders, metrics.currentVisitors), periodRatio(metrics.compareOrders, metrics.compareVisitors), "percent")}${periodDetailMetric("加购到订单", periodRatio(metrics.currentOrders, metrics.currentAtc), periodRatio(metrics.compareOrders, metrics.compareAtc), "percent")}${periodDetailMetric("件单价", metrics.currentAsp, metrics.compareAsp, "money")}${periodDetailMetric("库存覆盖", metrics.current?.coverage, metrics.compare?.coverage)}</div></section>
    ${categoryHtml}
    <section class="period-detail-section"><div class="period-detail-section-head"><span>02 · Model 下钻</span><small>按 Model 少卖金额排序</small></div>${modelHtml}</section>
    ${periodChannelDetail("广告信号", issue.ad, [["广告花费", "spendIdr", "money"], ["广告曝光", "impressions", "number"], ["广告点击", "clicks", "number"], ["广告订单", "orders", "number"], ["广告归因销售", "salesIdr", "money"], ["ROAS", "roas", "ratio"]])}
    ${periodChannelDetail("直播信号", issue.live, [["直播加购", "atc", "number"], ["直播订单", "orders", "number"], ["直播买家", "buyers", "number"], ["直播净销售", "netSalesIdr", "money"], ["直播 Gross Sales", "grossSalesIdr", "money"]])}
    <section class="period-detail-section"><div class="period-detail-section-head"><span>03 · 结论边界</span><small>事实 / 判断 / 待核查</small></div><div class="period-boundary-grid"><div><span>已确认事实</span><p>GMV ${periodChangeText(metrics.salesDelta)}；销量 ${periodChangeText(metrics.unitsDelta)}；件单价 ${periodChangeText(metrics.aspDelta)}；访客 ${periodChangeText(metrics.visitorDelta)}。</p></div><div><span>高概率判断</span><p>${escapeHtml(issue.conclusion)}</p></div><div><span>待验证</span><p>${escapeHtml(issue.hypothesis)}</p></div><div><span>暂未接入</span><p>标题 / 热搜词暂不诊断；价格历史、广告计划状态和直播场次维度按当前文件能力逐项核查。</p></div></div></section>
    <section class="period-detail-section ai-solution"><div class="period-detail-section-head"><span>04 · 下一步动作</span><small>调整后下周期验证</small></div><p class="period-action-lead">${escapeHtml(issue.action)}</p><p><strong>验证指标：</strong>${escapeHtml(issue.verification)}</p><button type="button" class="primary-button" data-add-period-action="${escapeHtml(issue.id)}">加入待处理</button></section>`;
  $("#periodIssueDialog").showModal();
  $("#periodIssueDialog [data-add-period-action]")?.addEventListener("click", () => { addPeriodAction(issue); $("#periodIssueDialog").close(); });
}

function addPeriodAction(issue) {
  const key = "period-" + issue.id;
  const actions = JSON.parse(localStorage.getItem("shopee-ai-period-actions") || "[]").filter(item => item.key !== key);
  actions.push({ key, title: issue.title, source: issue.source, priority: issue.priority, status: "todo", action: issue.action, verification: issue.verification, createdAt: new Date().toISOString() });
  localStorage.setItem("shopee-ai-period-actions", JSON.stringify(actions));
  showToast("问题已加入待处理动作");
  renderTasks();
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
  $$('[data-period-file]').forEach(input => input.addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    const [moduleKey, period] = event.target.dataset.periodFile.split(".");
    try { await handlePeriodFile(file, moduleKey, period); } catch (error) { state.periodImportDraft[moduleKey][period] = { status: "blocked", fileName: file.name, errors: [error.message] }; periodSetModule(moduleKey, state.periodImportDraft[moduleKey].current, state.periodImportDraft[moduleKey].compare); renderPeriodAnalysis(); showToast(`解析失败：${error.message}`); }
    event.target.value = "";
  }));
  $("#loadPeriodDemo").addEventListener("click", async () => { const button = $("#loadPeriodDemo"); button.disabled = true; button.textContent = "加载中…"; try { await loadPeriodDemo(); } catch (error) { showToast(error.message); } finally { button.disabled = false; button.textContent = "加载真实数据 Demo"; } });
  $("#clearPeriodAnalysis").addEventListener("click", () => { state.periodAnalysis = null; state.periodImportDraft = { product: {}, ads: {}, livestream: {} }; state.selectedPeriodProductId = null; renderPeriodAnalysis(); showToast("已清除本机周期数据"); });
  $("#runPeriodDiagnosis").addEventListener("click", () => {
    if (!["product", "ads", "livestream"].some(moduleKey => periodStatus(moduleKey) === "ready")) return showToast("至少完成一个板块的本次和对比周期上传");
    saveAnalysisHistory("draft");
    location.hash = "overview";
    showToast("诊断已生成，首页已切换到问题队列");
  });
  $("#periodIssueSearch").addEventListener("input", event => { state.periodIssueSearch = event.target.value; renderPeriodHome(); });
  $("#closePeriodIssueDialog").addEventListener("click", () => $("#periodIssueDialog").close());
  $("#periodIssueDialog").addEventListener("click", event => { if (event.target === $("#periodIssueDialog")) $("#periodIssueDialog").close(); });
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
    : ["actions", "history", "sop", "subsidy", "data-governance", "new-analysis", "overview"].includes(targetId) ? targetId
    : "overview";
  $$('[data-route]').forEach(section => { section.hidden = section.dataset.route !== route; });
  const workflowRoutes = new Set(["workflows", "listings", "actions", "sop"]);
  $$(".nav-item").forEach(link => {
    const active = link.id === "workflowNavToggle" ? workflowRoutes.has(route) : link.getAttribute("href") === `#${route}`;
    link.classList.toggle("active", active);
  });
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
      state.periodAnalysis = periodEnsureShape(cloudData.sourceFacts?.periodAnalysis || cloudData.sourceFacts);
      if (!state.periodAnalysis) {
        try { state.periodAnalysis = periodEnsureShape(await (await fetch("assets/demo-periods.json")).json()); } catch { state.periodAnalysis = null; }
      }
      window.ShopeeCloud.sourceMode = "cloud";
    } else {
      const [dashboardResponse, module1Response, definitionsResponse] = await Promise.all([fetch(DATA_URL), fetch(MODULE1_URL), fetch(DEFINITIONS_URL)]);
      if (!dashboardResponse.ok || !module1Response.ok || !definitionsResponse.ok) throw new Error(`HTTP ${dashboardResponse.status}/${module1Response.status}/${definitionsResponse.status}`);
      state.data = await dashboardResponse.json();
      state.module1 = await module1Response.json();
      state.definitions = await definitionsResponse.json();
      try { state.periodAnalysis = periodEnsureShape(await (await fetch("assets/demo-periods.json")).json()); } catch { state.periodAnalysis = null; }
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
        sourceFacts: { periodAnalysis: periodSourceSnapshot() },
        version: new Date().toISOString()
      })
    };
    refreshDashboard(); bindEvents();
  } catch (error) {
    document.body.innerHTML = `<main class="load-error"><h1>看板数据加载失败</h1><p>请通过本地服务器或 GitHub Pages 打开此项目，而不是直接双击 HTML 文件。</p><code>${escapeHtml(error.message)}</code></main>`;
  }
}

window.ShopeeDashboardReady = init();

