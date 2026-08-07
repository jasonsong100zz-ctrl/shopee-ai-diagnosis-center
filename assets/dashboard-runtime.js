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
  sopCategory: "鍏ㄩ儴",
  query: "",
  filters: { store: "鍏ㄩ儴", pool: "鍏ㄩ儴", tier: "鍏ㄩ儴", matrix: "鍏ㄩ儴", match: "鍏ㄩ儴" },
  listingPage: 1,
  listingPageSize: 50,
  listingSort: { key: null, direction: "asc" },
  activeQueue: null,
  pendingImportWorkflow: null,
  importFiles: {},
  subsidyBudget: Number(localStorage.getItem("shopee-ai-subsidy-budget")) || 100000,
  template: "daily",
  completedTasks: new Set(JSON.parse(localStorage.getItem("shopee-ai-completed") || "[]"))
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
  const delta = (current, previous, suffix = "鐜瘮") => { const value = mom(current, previous); return value == null ? "鏃犲熀鏈? : `${suffix} ${formatPercent(value)}`; };
  const atcRate = totals.visitors ? totals.atc / totals.visitors : 0, priorAtcRate = prior.visitors ? prior.atc / prior.visitors : 0;
  const orderCr = totals.visitors ? totals.orders / totals.visitors : 0, priorOrderCr = prior.visitors ? prior.orders / prior.visitors : 0;
  const itemCr = totals.visitors ? totals.units / totals.visitors : 0, priorItemCr = prior.visitors ? prior.units / prior.visitors : 0;
  const metrics = [
    { label: "娴忚閲?PV", value: totals.views.toLocaleString("zh-CN"), delta: delta(totals.views, prior.views), tone: mom(totals.views, prior.views) < 0 ? "risk" : "good", note: "7鏈堣〃 vs 6鏈堣〃" },
    { label: "璁垮 UV", value: totals.visitors.toLocaleString("zh-CN"), delta: delta(totals.visitors, prior.visitors), tone: mom(totals.visitors, prior.visitors) < 0 ? "risk" : "good", note: "7鏈堣〃 vs 6鏈堣〃" },
    { label: "鍔犺喘鐜?, value: formatPercent(atcRate, 2), delta: delta(atcRate, priorAtcRate), tone: mom(atcRate, priorAtcRate) < 0 ? "risk" : "good", note: "ATC Units 梅 Visitors" },
    { label: "璁㈠崟杞寲鐜?, value: formatPercent(orderCr, 2), delta: delta(orderCr, priorOrderCr), tone: mom(orderCr, priorOrderCr) < 0 ? "risk" : "good", note: "璁㈠崟 梅 璁垮" },
    { label: "浠惰浆鍖栫巼", value: formatPercent(itemCr, 2), delta: delta(itemCr, priorItemCr), tone: mom(itemCr, priorItemCr) < 0 ? "risk" : "good", note: "閿€閲忎欢鏁?梅 璁垮" },
    { label: "GMV", value: formatMoney(totals.sales), delta: delta(totals.sales, prior.sales), tone: mom(totals.sales, prior.sales) < 0 ? "risk" : "good", note: "Net Sales" },
    { label: "璁㈠崟鏁?, value: totals.orders.toLocaleString("zh-CN"), delta: delta(totals.orders, prior.orders), tone: mom(totals.orders, prior.orders) < 0 ? "risk" : "good", note: "Net Orders" },
    { label: "鎴愪氦浜烘暟", value: totals.buyers.toLocaleString("zh-CN"), delta: delta(totals.buyers, prior.buyers), tone: mom(totals.buyers, prior.buyers) < 0 ? "risk" : "good", note: "Net # of Unique Buyers" }
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
    const name = item[key] || "鏈綊灞?;
    const current = groups.get(name) || { name, links: 0, visitors: 0, orders: 0, units: 0, sales: 0, comparableSales: 0, previousSales: 0, declining: 0, waste: 0 };
    current.links += 1; current.visitors += item.visitors; current.orders += item.orders; current.units += item.units; current.sales += item.sales;
    if (item.mom != null && item.mom > -.99 && item.sales > 0) { current.comparableSales += item.sales; current.previousSales += item.sales / (1 + item.mom); }
    current.declining += ["鍗曟湀涓嬫粦", "杩炵画琛伴€€"].includes(item.lifecycle) ? 1 : 0;
    current.waste += item.matrix === "娴侀噺娴垂娆? ? 1 : 0;
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
  const trend = value => `<span class="dimension-mom ${value == null ? "neutral" : value >= 0 ? "up" : "down"}">${value == null ? "鏂板/鏃犲熀鏈? : formatPercent(value)}</span>`;
  return `<div class="dimension-table"><div class="dimension-row dimension-header"><span>鍚嶇О</span><span>閾炬帴</span><span>璁垮</span><span>璁㈠崟CR</span><span>GMV</span><span>璁㈠崟鐜瘮</span><span>GMV鐜瘮</span></div>${items.slice(0, limit).map(item => `<div class="dimension-row"><strong>${escapeHtml(item.name)}</strong><span>${item.links}</span><span>${item.visitors.toLocaleString("zh-CN")}</span><span>${formatPercent(item.cr, 2)}</span><span>${formatMoney(item.sales)}</span>${trend(item.orderMom)}${trend(item.mom)}</div>`).join("")}</div>`;
}

function renderOverviewLevels() {
  const stores = aggregateDimension("shop");
  const categories = aggregateDimension("category");
  const s = state.module1.summary;
  $("#storeOverview").innerHTML = dimensionRows(stores, 5);
  $("#categoryOverview").innerHTML = dimensionRows(categories, 7);
  $("#linkOverview").innerHTML = `<div class="link-overview-grid">
    <div><span>鍏ㄩ噺閾炬帴</span><strong>${s.links}</strong><small>${s.shops} 涓簵閾?/small></div>
    <div><span>浜у搧鍖归厤鐜?/span><strong>${formatPercent(s.matchRate)}</strong><small>${s.links - s.matched} 鏉″緟鍖归厤</small></div>
    <div><span>鏍稿績 T1/T2</span><strong>${s.t1t2}</strong><small>浼樺厛淇濇姢</small></div>
    <div><span>娴侀噺娴垂</span><strong>${s.waste}</strong><small>鏈夋祦閲忋€佽浆鍖栧亸寮?/small></div>
    <div><span>榛戦┈閾炬帴</span><strong>${s.blackHorse}</strong><small>杞寲濂姐€佹祦閲忎笉瓒?/small></div>
    <div><span>涓嬫粦閾炬帴</span><strong>${s.declining}</strong><small>鍗曟湀涓嬫粦鎴栬繛缁“閫€</small></div>
  </div>`;
  const weakStore = [...stores].filter(x => x.visitors > 0).sort((a, b) => a.cr - b.cr)[0];
  const weakCategory = [...categories].filter(x => x.visitors > 0).sort((a, b) => a.cr - b.cr)[0];
  const coreDecline = state.module1.links.filter(item => ["T1", "T2"].includes(item.tier) && ["鍗曟湀涓嬫粦", "杩炵画琛伴€€"].includes(item.lifecycle)).length;
  const actions = [
    { level: "搴楅摵", problem: `${weakStore?.name || "鈥?} 褰撳墠璁㈠崟CR鏈€浣庯紙${formatPercent(weakStore?.cr || 0, 2)}锛塦, action: "鍏堟媶璇ュ簵閾虹殑绫荤洰涓嶵1/T2閾炬帴锛屾帓鏌ユ祦閲忕粨鏋勫拰杞寲鎵挎帴銆?, href: "#chat-03" },
    { level: "绫荤洰", problem: `${weakCategory?.name || "鈥?} 褰撳墠璁㈠崟CR鏈€浣庯紙${formatPercent(weakCategory?.cr || 0, 2)}锛塦, action: "浼樺厛鏍稿浠锋牸銆佽鏍笺€佷富鍥炬壙璇哄拰缂鸿揣Model锛屽啀鍋氬崟鍙橀噺娴嬭瘯銆?, href: "#listings" },
    { level: "閾炬帴", problem: `${s.waste} 鏉℃祦閲忔氮璐癸紝${coreDecline} 鏉1/T2鏍稿績閾炬帴涓嬫粦`, action: "鍏堝鐞嗘牳蹇冧笅婊戯紝鍐嶄慨澶嶉珮娴侀噺浣庤浆鍖栭摼鎺ワ紱榛戦┈閾炬帴灏忔鏀鹃噺銆?, href: "#listings" },
    { level: "鏁版嵁", problem: `${s.links - s.matched} 鏉″緟鍖归厤锛涙垚浜や汉鏁颁笌鍘嗗彶鏃ュ簭鍒楀皻鏈帴鍏, action: "姣忔棩琛ュ厖鏃ユ湡銆佹垚浜や汉鏁板強搴楅摵/绫荤洰蹇収锛屽舰鎴愬彲姣旇緝鏃堕棿绾裤€?, href: "#data-governance" }
  ];
  $("#overviewActionsGrid").innerHTML = actions.map(item => `<article><span>${escapeHtml(item.level)}灞傞棶棰?/span><h4>${escapeHtml(item.problem)}</h4><p>${escapeHtml(item.action)}</p><a href="${item.href}">杩涘叆璋冩暣 鈫?/a></article>`).join("");
}

function renderWorkflows() {
  const specs = {
    "01": { status: "鏁版嵁瀹屾暣", statusTone: "ready", progress: 100, source: "閾炬帴 路 Model 路 鍖归厤琛ㄥ凡鎺ュ叆", links: [["閾炬帴璇婃柇", "#listings", "all"], ["鍖归厤娌荤悊", "#listings", "unmatched"], ["AI鏂规", "#tasks", ""]], action: ["鏌ョ湅695鏉￠摼鎺?, "#listings"] },
    "02": { status: "鏁版嵁缂哄け", statusTone: "missing", progress: 0, source: "Shopee Ads 鎶ヨ〃鏈鍏?, links: [["浜忔崯鍚﹀畾璇?, "", ""], ["楂樻綔鎻愪环璇?, "", ""], ["棰勭畻寤鸿", "", ""]], action: ["琛ュ厖瀵煎叆骞垮憡鎶ヨ〃", "import"] },
    "03": { status: "閮ㄥ垎鏁版嵁", statusTone: "partial", progress: 45, source: "閾炬帴婕忔枟宸叉帴鍏?路 搴楅摵鎬昏寰呰ˉ", links: [["婕忔枟璇婃柇", "#diagnosis", ""], ["鍟嗗搧鍒嗗眰", "#listings", "all"], ["浠诲姟闃熷垪", "#tasks", ""]], action: ["琛ュ厖搴楅摵鎬昏鏁版嵁", "import"] },
    "04": { status: "鏁版嵁缂哄け", statusTone: "missing", progress: 0, source: "宸瘎 路 瀹㈡湇 路 绔炲搧閾炬帴鏈鍏?, links: [["寮傝搴?, "", ""], ["宸瘎褰掑洜", "", ""], ["绔炲搧鍙嶅埗", "", ""]], action: ["琛ュ厖瀵煎叆瀹㈡埛澹伴煶", "import"] },
    "05": { status: "涓绘帶鍙敤", statusTone: "ready", progress: 90, source: "浠诲姟姹?路 SOP 路 妯℃澘宸插缓绔?, links: [["浠诲姟涓绘帶", "#tasks", ""], ["鏃ユ姤妯℃澘", "#sop", ""], ["鍛ㄦ姤妯℃澘", "#sop", ""]], action: ["杩涘叆涓绘帶宸ヤ綔鍙?, "#tasks"] }
  };
  const workflows = state.data.workflows.map(item => ({ ...item, ...specs[item.id] }));
  $("#workflowGrid").innerHTML = workflows.map(item => {
    const chosen = state.importFiles[item.id];
    const status = chosen ? "宸查€夋嫨鏂囦欢" : item.status;
    const source = chosen ? chosen : item.source;
    return `
    <article class="workflow-card ${escapeHtml(item.tone)}" id="chat-${escapeHtml(item.id)}">
      <div class="workflow-head"><span class="workflow-id">鏉垮潡 ${Number(item.id)}</span><span class="status-badge ${escapeHtml(item.statusTone)}">${escapeHtml(status)}</span></div>
      <h3>${escapeHtml(item.name)}</h3><span class="workflow-subtitle">${escapeHtml(item.subtitle)}</span>
      <div class="progress-track" aria-label="瀹屾垚 ${item.progress}%"><i style="width:${Number(item.progress)}%"></i></div>
      <div class="workflow-links">${item.links.map(([label, href, preset]) => href ? `<a href="${href}" data-preset="${preset}">${escapeHtml(label)} <b>鈫?/b></a>` : `<span>${escapeHtml(label)} 路 寰呮暟鎹?/span>`).join("")}</div>
      <div class="workflow-source"><span>DATA SOURCE</span><strong>${escapeHtml(source)}</strong></div>
      ${item.action[1] === "import" ? `<button class="workflow-action" type="button" data-import-workflow="${item.id}">${escapeHtml(item.action[0])}</button>` : `<a class="workflow-action" href="${item.action[1]}">${escapeHtml(item.action[0])} <b>鈫?/b></a>`}
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
    const pricePowerGap = trafficRatio >= p.subsidyTrafficFloor && crRatio < p.subsidyCrCeiling && (atcRatio >= p.subsidyAtcFloor || item.matrix === "娴侀噺娴垂娆?);
    const momentum = (Number(item.mom) || 0) >= p.subsidyMomentumFloor || item.lifecycle === "蹇€熺垎鍙? || (item.matrix === "榛戦┈瀹濊棌娆? && crRatio >= 1);
    const core = item.tier === "T1" || item.tier === "T2";
    const model = (item.modelSummary?.topModels || []).filter(model => Number(model.stock) > 0).sort((a, b) => Number(b.units) - Number(a.units))[0];
    let score = (core ? 24 : 8) + (pricePowerGap ? 38 : 0) + (momentum ? 28 : 0) + (item.matrix === "榛戦┈瀹濊棌娆? ? 12 : 0);
    score += Math.min(12, Math.log10(Math.max(10, item.sales)));
    if (!model) score -= 30;
    const signal = pricePowerGap && momentum ? "浠锋牸鍔涗慨澶?+ 瓒嬪娍鍔犻€? : pricePowerGap ? "鐤戜技缂轰环鏍煎姏杞寲" : momentum ? "杩戞湡瓒嬪娍濂斤紝閫傚悎鏀鹃噺" : "甯歌瑙傚療";
    const depth = pricePowerGap && momentum ? "鍔犳繁 10%鈥?5%" : pricePowerGap ? "娴嬭瘯 8%鈥?2%" : "娴嬭瘯 5%鈥?%";
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
  $("#subsidySummary").innerHTML = `<div><span>寤鸿閾炬帴</span><strong>${candidates.length}</strong></div><div><span>浠锋牸鍔涘緟楠岃瘉</span><strong>${priceGapCount}</strong></div><div><span>瓒嬪娍鏀惧ぇ</span><strong>${momentumCount}</strong></div><div><span>棰勭畻鐘舵€?/span><strong>${budget ? "鍙垎閰? : "寰呰緭鍏?}</strong></div>`;
  $("#subsidyTable").innerHTML = candidates.map((candidate, index) => {
    const item = candidate.item;
    const weight = candidate.score / totalScore;
    const allocation = budget * weight;
    const proof = candidate.pricePowerGap ? "璁㈠崟CR銆佷欢杞寲鐜囥€佽ˉ璐碦OI" : "閿€閲忓閲忋€佽竟闄匔R銆佽ˉ璐碦OI";
    return `<tr>
      <td><span class="subsidy-rank">P${index < 3 ? 0 : index < 7 ? 1 : 2}</span><small>${item.tier || item.newGrade || "鈥?}</small></td>
      <td><strong>${escapeHtml(item.name)}</strong><small>Product ID ${escapeHtml(item.productId)} 路 ${escapeHtml(item.category)}</small><button type="button" data-subsidy-locate="${escapeHtml(item.productId)}">鏌ョ湅閾炬帴</button></td>
      <td><span class="opportunity-badge ${candidate.pricePowerGap ? "price-gap" : "momentum"}">${escapeHtml(candidate.signal)}</span><small>娴侀噺/绫荤洰 ${item.benchmarks.trafficRatio.toFixed(1)}脳 路 CR/绫荤洰 ${item.benchmarks.crRatio.toFixed(1)}脳 路 鐜瘮 ${item.mom == null ? "鈥? : formatPercent(item.mom)}</small></td>
      <td><strong>${escapeHtml(candidate.model.variation || candidate.model.sku || candidate.model.modelId)}</strong><small>Model ID ${escapeHtml(candidate.model.modelId)} 路 搴撳瓨 ${Number(candidate.model.stock).toLocaleString("zh-CN")}</small></td>
      <td><strong>${formatCny(allocation)}</strong><small>${formatPercent(weight)} 鐨勬湰娆￠绠?/small></td>
      <td><strong>${escapeHtml(candidate.depth)}</strong><small>琛ラ綈褰撳墠娲诲姩浠枫€佹瘺鍒╃巼銆佸钩鍙颁笂闄愬悗鐢熸垚鏈€缁堜环</small></td>
      <td><strong>${escapeHtml(proof)}</strong><small>澶т績褰撴棩鍒嗘椂鐩戞帶锛屾鏃ュ鐩樺閲?/small></td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" class="empty-state">褰撳墠鏁版嵁娌℃湁鍛戒腑琛ヨ创鍊欓€夛紱琛ュ厖杩戞湡瓒嬪娍銆佹椿鍔ㄤ环鍜屾瘺鍒╁悗閲嶆柊璇婃柇銆?/td></tr>`;
  $$('[data-subsidy-locate]').forEach(button => button.addEventListener("click", () => locateProduct(button.dataset.subsidyLocate)));
}

function formatCny(value) {
  return `楼${Math.round(Number(value) || 0).toLocaleString("zh-CN")}`;
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "鈥?;
}

function formatMoney(value) {
  const rate = state.definitions?.parameters?.idrPerCny || state.module1?.meta?.currency?.idrPerCny || 2650;
  const amount = (Number(value) || 0) / rate;
  if (amount >= 1e8) return `楼${(amount / 1e8).toFixed(2)}浜縛;
  if (amount >= 1e4) return `楼${(amount / 1e4).toFixed(2)}涓嘸;
  if (amount >= 1000) return `楼${Math.round(amount).toLocaleString("zh-CN")}`;
  return `楼${amount.toFixed(2)}`;
}

function benchmarkBadge(label, ratio, mode = "percent") {
  const safe = Number(ratio) || 0;
  const display = mode === "multiple" ? `${safe.toFixed(1)}脳` : `${Math.round(safe * 100)}%`;
  const tone = safe >= 1 ? "above" : safe >= .8 ? "near" : "below";
  return `<span class="benchmark-badge ${tone}">${escapeHtml(label)} ${display}</span>`;
}

function fillSelect(selector, values, label) {
  const select = $(selector);
  select.innerHTML = `<option value="鍏ㄩ儴">鍏ㄩ儴${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function renderModule1Summary() {
  const summary = state.module1.summary;
  const cards = [
    ["鎴愮啛姹?, summary.mature, "杩涘叆 T1鈥揟4 鍥涚淮璇勪及"],
    ["鏂板搧姹?, summary.newborn, "鏂板搧A 1鏉?路 鏂板搧B 20鏉?],
    ["娴侀噺娴垂", summary.waste, "鏈夋祦閲忎絾杞寲鍋忎綆"],
    ["榛戦┈瀹濊棌", summary.blackHorse, "浣庢祦閲忎絾杞寲杈冨ソ"],
    ["涓嬫粦闃熷垪", summary.declining, "鍗曟湀涓嬫粦鎴栬繛缁“閫€"],
    ["鏈尮閰?, summary.links - summary.matched, "闇€琛ヤ骇鍝佸悕 / 绫荤洰 / 鍒嗙骇"]
  ];
  $("#module1Summary").innerHTML = cards.map(([label, value, note]) => `<article><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString("zh-CN")}</strong><small>${escapeHtml(note)}</small></article>`).join("");
}

function renderListingFilters() {
  fillSel…8793 tokens truncated…煎叆 Links.csv</button><button type="button" data-source-action="export-module1">瀵煎嚭 Links.csv</button>`
      : source.id === "definitions" ? `<button type="button" data-source-action="import-definitions">瀵煎叆 Parameters.csv</button><button type="button" data-source-action="export-definitions">瀵煎嚭 Parameters.csv</button>` : "";
    return `<article class="source-card"><div><span>${escapeHtml(source.id.toUpperCase())}</span><b>${escapeHtml(count)}</b></div><h3>${escapeHtml(source.name)}</h3><p>${escapeHtml(source.role)}</p><small>${escapeHtml(source.fields)}</small><div class="source-card-actions"><a href="${escapeHtml(source.file)}" target="_blank" rel="noopener">鏌ョ湅寮曠敤婧?鈫?/a>${actions}</div></article>`;
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
  const headers = ["Product ID","Shopee URL","浜у搧鍚嶇О","鍘熷鍚嶇О","搴楅摵","绫荤洰","涓氬姟瑙掕壊","姹?,"T绾?,"鏂板搧绾?,"鍖归厤鐘舵€?,"鐢熷懡鍛ㄦ湡","娴忚","璁垮","璁㈠崟","閿€閲忎欢鏁?,"GMV_IDR","鍔犺喘鐜?,"鐜瘮"];
  const rows = state.module1.links.map(x => [x.productId,x.url,x.name,x.originalName,x.shop,x.category,x.priceRole,x.pool,x.tier,x.newGrade,x.matchStatus,x.lifecycle,x.views,x.visitors,x.orders,x.units,x.sales,x.atcRate,x.mom]);
  downloadCsv("Links.csv", headers, rows);
}

function exportParametersCsv() {
  const meanings = { idrPerCny:"1 CNY 瀵瑰簲 IDR",matrixTrafficRatio:"涓氬姟鐭╅樀楂樻祦閲忚竟鐣?,matrixConversionRatio:"涓氬姟鐭╅樀楂樿浆鍖栬竟鐣?,atcWeakRatio:"鍔犺喘鍋忓急闃堝€?,trafficSufficientRatio:"娴侀噺鍏呰冻闃堝€?,uvLowRatio:"UV浠峰€煎亸浣庨槇鍊?,taskDisplayLimit:"姣忎釜T绾т换鍔℃爮灞曠ず鏁?,subsidyTrafficFloor:"琛ヨ创鍊欓€夋渶浣庢祦閲忕被鐩瘮",subsidyCrCeiling:"浠锋牸鍔涘€欓€夋渶楂楥R绫荤洰姣?,subsidyAtcFloor:"浠锋牸鍔涘€欓€夋渶浣庡姞璐被鐩瘮",subsidyMomentumFloor:"瓒嬪娍鍊欓€夋渶浣庣幆姣斿骞? };
  downloadCsv("Parameters.csv", ["鍙傛暟Key","褰撳墠鍊?,"涓氬姟鍚箟"], Object.entries(state.definitions.parameters).map(([key,value]) => [key,value,meanings[key]]));
}

function refreshDashboard() {
  prepareModule1Data();
  const summary = state.module1.summary;
  const declineRate = summary.mature ? summary.declining / summary.mature : 0;
  $(".hero-date strong").textContent = `2026 年 7 月 · ${summary.shops} 个店铺`;
  $(".hero-signal p").textContent = `成熟链接中 ${formatPercent(declineRate)} 处于单月下滑或连续衰退；当前优先保护 ${summary.t1t2} 条 T1/T2 核心链接。`;
  $("#currencyNote").textContent = `链接销售数据不重复累计 Model；金额统一人民币，当前汇率 ¥1 = Rp${Number(state.definitions.parameters.idrPerCny).toLocaleString("zh-CN")}。`;
  $("#diagnosisSourceNote").textContent = `每张卡由${summary.links.toLocaleString("zh-CN")}条链接实时计算；点击即可回到对应链接并查看 AI 方案。`;
  renderMetrics(); renderOverviewLevels(); renderWorkflows(); renderSubsidy(); renderModule1Summary(); renderListingFilters();
  $("#storeFilter").value = state.filters.store; $("#poolFilter").value = state.filters.pool; $("#tierFilter").value = state.filters.tier; $("#matrixFilter").value = state.filters.matrix; $("#matchFilter").value = state.filters.match;
  renderListings(); renderDiagnoses(); renderTasks(); renderSop(); renderGovernance();
}
function renderSourceLinkForm(item) {
  state.selectedSourceLink = item?.productId || null;
  $("#saveSourceLink").disabled = !item;
  if (!item) { $("#sourceLinkForm").innerHTML = `<p class="editor-placeholder">娌℃湁鎵惧埌瀵瑰簲 Product ID锛岃妫€鏌ヨ緭鍏ャ€?/p>`; return; }
  const fields = [
    ["name", "浜у搧鍚嶇О", "text"], ["category", "绫荤洰", "text"], ["priceRole", "涓氬姟瑙掕壊", "text"], ["shop", "搴楅摵", "text"],
    ["pool", "姹?, "text"], ["tier", "T绾?, "text"], ["views", "娴忚", "number"], ["visitors", "璁垮", "number"],
    ["orders", "璁㈠崟", "number"], ["units", "閿€閲忎欢鏁?, "number"], ["sales", "GMV锛圛DR锛?, "number"], ["atcRate", "鍔犺喘鐜囷紙灏忔暟锛?, "number"], ["mom", "鐜瘮锛堝皬鏁帮級", "number"], ["matchStatus", "鍖归厤鐘舵€?, "text"]
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
  const score = item => (item.decision === "閲嶇偣浼樺寲" ? 1e15 : 0) + (["鍗曟湀涓嬫粦", "杩炵画琛伴€€"].includes(item.lifecycle) ? 5e14 : 0) + item.sales;
  const tasks = [...state.module1.links].sort((a, b) => score(b) - score(a)).slice(0, 12).map(item => `- [${state.completedTasks.has(`link-${item.id}`) ? "x" : " "}] ${item.tier} 路 ${item.name}锛?{item.productId}锛夆€?${item.action}`).join("\n");
  const content = `${buildDynamicTemplate("weekly")}\n\n## 褰撳墠浠诲姟蹇収\n${tasks}\n`;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Shopee-ID-weekly-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("鍛ㄦ姤妯℃澘宸插鍑?);
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
    showToast(`宸查€夋嫨 ${file.name}锛屽緟鏁版嵁澶勭悊鍚庡彂甯僠);
    state.pendingImportWorkflow = null;
    event.target.value = "";
    renderWorkflows();
  });
  $$(".template-tab").forEach(button => button.addEventListener("click", () => { state.template = button.dataset.template; renderTemplate(); }));
  $("#sopCategory").addEventListener("change", event => { state.sopCategory = event.target.value; renderSop(); });
  $("#copyTemplate").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(buildDynamicTemplate(state.template)); showToast("鍔ㄦ€佹ā鏉垮凡澶嶅埗"); }
    catch { showToast("澶嶅埗澶辫触锛岃鎵嬪姩閫夋嫨鏂囨湰"); }
  });
  $("#applyDefinitions").addEventListener("click", () => {
    const next = { ...state.definitions.parameters };
    $$("#definitionForm [data-param]").forEach(input => { next[input.dataset.param] = Number(input.value); });
    if (Object.values(next).some(value => !Number.isFinite(value) || value <= 0)) { showToast("鍙傛暟蹇呴』涓哄ぇ浜?鐨勬暟瀛?); return; }
    next.taskDisplayLimit = Math.max(1, Math.round(next.taskDisplayLimit));
    state.definitions.parameters = next;
    localStorage.setItem("shopee-ai-definitions", JSON.stringify(next));
    refreshDashboard(); showToast("瀹氫箟宸插簲鐢紝鍏ㄧ湅鏉垮凡閲嶇畻");
  });
  $("#resetDefinitions").addEventListener("click", () => {
    state.definitions = JSON.parse(JSON.stringify(state.defaultDefinitions));
    localStorage.removeItem("shopee-ai-definitions"); refreshDashboard(); showToast("宸叉仮澶嶉粯璁ゅ畾涔?);
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
    Object.assign(item, patch); refreshDashboard(); renderSourceLinkForm(state.module1.links.find(link => String(link.productId) === String(item.productId))); showToast("閾炬帴婧愭暟鎹凡淇濆瓨骞堕噸绠?);
  });
  $("#clearSourcePatches").addEventListener("click", () => {
    state.sourcePatches = {}; localStorage.removeItem("shopee-ai-source-patches");
    state.module1 = JSON.parse(JSON.stringify(state.originalModule1)); state.selectedSourceLink = null; renderSourceLinkForm(null); refreshDashboard(); showToast("宸叉竻闄ゆ湰鏈洪摼鎺ヤ慨鏀?);
  });
  $("#module1FileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const rows = parseCsv(await file.text()); if (!rows.length || !("Product ID" in rows[0])) throw new Error("缂哄皯 Product ID 琛ㄥご");
      const byId = new Map(state.module1.links.map(item => [String(item.productId), item])); let updated = 0;
      const numeric = value => value === "" ? null : Number(value);
      rows.forEach(row => { const item = byId.get(String(row["Product ID"])); if (!item) return; Object.assign(item,{url:row["Shopee URL"],name:row["浜у搧鍚嶇О"]||"#N/A",originalName:row["鍘熷鍚嶇О"],shop:row["搴楅摵"],category:row["绫荤洰"]||"#N/A",priceRole:row["涓氬姟瑙掕壊"],pool:row["姹?],tier:row["T绾?],newGrade:row["鏂板搧绾?],matchStatus:row["鍖归厤鐘舵€?],lifecycle:row["鐢熷懡鍛ㄦ湡"],views:numeric(row["娴忚"])||0,visitors:numeric(row["璁垮"])||0,orders:numeric(row["璁㈠崟"])||0,units:numeric(row["閿€閲忎欢鏁?])||0,sales:numeric(row["GMV_IDR"])||0,atcRate:numeric(row["鍔犺喘鐜?])||0,mom:numeric(row["鐜瘮"])}); updated++; });
      state.originalModule1 = JSON.parse(JSON.stringify(state.module1)); state.sourcePatches = {}; state.filters = { store: "鍏ㄩ儴", pool: "鍏ㄩ儴", tier: "鍏ㄩ儴", matrix: "鍏ㄩ儴", match: "鍏ㄩ儴" }; state.query = ""; localStorage.removeItem("shopee-ai-source-patches"); refreshDashboard(); showToast(`宸插鍏ュ苟閲嶇畻 ${updated} 鏉￠摼鎺);
    } catch (error) { showToast(`瀵煎叆澶辫触锛?{error.message}`); }
    event.target.value = "";
  });
  $("#definitionsFileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const rows = parseCsv(await file.text()); if (!rows.length || !("鍙傛暟Key" in rows[0])) throw new Error("缂哄皯 鍙傛暟Key 琛ㄥご");
      const parameters = Object.fromEntries(rows.map(row => [row["鍙傛暟Key"], Number(row["褰撳墠鍊?])]));
      if (Object.values(parameters).some(value => !Number.isFinite(value) || value <= 0)) throw new Error("鍙傛暟蹇呴』涓哄ぇ浜?鐨勬暟瀛?);
      state.definitions.parameters = { ...state.definitions.parameters, ...parameters }; state.defaultDefinitions.parameters = { ...state.defaultDefinitions.parameters, ...parameters }; localStorage.setItem("shopee-ai-definitions", JSON.stringify(state.definitions.parameters)); refreshDashboard(); showToast("Parameters.csv 宸插鍏ュ苟閲嶇畻");
    } catch (error) { showToast(`瀵煎叆澶辫触锛?{error.message}`); }
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
    document.body.innerHTML = `<main class="load-error"><h1>鐪嬫澘鏁版嵁鍔犺浇澶辫触</h1><p>璇烽€氳繃鏈湴鏈嶅姟鍣ㄦ垨 GitHub Pages 鎵撳紑姝ら」鐩紝鑰屼笉鏄洿鎺ュ弻鍑?HTML 鏂囦欢銆?/p><code>${escapeHtml(error.message)}</code></main>`;
  }
}

init();

