(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const num = (v) => Number(v) || 0;
  const fmt = (v) => num(v).toLocaleString("zh-CN");
  const pct = (v) => (num(v) * 100).toFixed(2) + "%";
  const money = (v) => "¥" + (num(v) / 2650).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  try {
    const cloud = window.ShopeeCloud;
    if (!cloud?.session) throw new Error("当前页面没有检测到管理员会话，请重新登录。");
    const data = await cloud.loadCloudDatasets();
    const m = data.module1 || {};
    const links = Array.isArray(m.links) ? m.links : [];
    const summary = m.summary || {};
    const definitions = data.definitions || { parameters: { idrPerCny: 2650 }, metrics: [], sources: [] };
    const totalViews = links.reduce((a,x)=>a+num(x.views),0);
    const totalVisitors = links.reduce((a,x)=>a+num(x.visitors),0);
    const totalOrders = links.reduce((a,x)=>a+num(x.orders),0);
    const totalUnits = links.reduce((a,x)=>a+num(x.units),0);
    const totalSales = links.reduce((a,x)=>a+num(x.sales),0);
    const totalAtc = links.reduce((a,x)=>a+num(x.atcRate)*num(x.visitors),0);
    const storeMap = new Map(), catMap = new Map();
    const add = (map,key,x) => {
      const k = key || "未定义";
      const a = map.get(k) || { links:0, visitors:0, orders:0, sales:0, units:0 };
      a.links++; a.visitors+=num(x.visitors); a.orders+=num(x.orders); a.sales+=num(x.sales); a.units+=num(x.units); map.set(k,a);
    };
    links.forEach(x => { add(storeMap,x.shop,x); add(catMap,x.category,x); });
    const rows = (map) => [...map.entries()].sort((a,b)=>b[1].sales-a[1].sales).slice(0,12).map(([k,a]) =>
      `<div class="overview-row"><strong>${esc(k)}</strong><span>${a.links} 条链接</span><span>${fmt(a.visitors)} 访客</span><b>${pct(a.visitors?a.orders/a.visitors:0)}</b><em>${money(a.sales)}</em></div>`).join("");
    const metric = (label,value,note) => `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
    if ($("#metricGrid")) $("#metricGrid").innerHTML = [
      metric("浏览量 PV",fmt(totalViews),"全量链接汇总"),
      metric("访客 UV",fmt(totalVisitors),`${storeMap.size} 个店铺`),
      metric("加购率",pct(totalVisitors?totalAtc/totalVisitors:0),"链接加购率汇总"),
      metric("订单转化率",pct(totalVisitors?totalOrders/totalVisitors:0),`${fmt(totalOrders)} 单`),
      metric("件转化率",pct(totalVisitors?totalUnits/totalVisitors:0),`${fmt(totalUnits)} 件`),
      metric("GMV",money(totalSales),"统一人民币"),
      metric("订单数",fmt(totalOrders),"当前快照")
    ].join("");
    if ($("#storeOverview")) $("#storeOverview").innerHTML = rows(storeMap);
    if ($("#categoryOverview")) $("#categoryOverview").innerHTML = rows(catMap);
    if ($("#linkOverview")) $("#linkOverview").innerHTML = `<div class="overview-row"><strong>${fmt(links.length)} 条链接</strong><span>${fmt(summary.models || links.reduce((a,x)=>a+num(x.modelSummary?.count),0))} Model</span><span>${fmt(summary.matched || links.filter(x=>x.matchStatus!=="未匹配").length)} 条已匹配</span><b>${pct(links.length?(summary.matched||0)/links.length:0)}</b><em>${money(totalSales)}</em></div>`;
    if ($("#module1Summary")) $("#module1Summary").innerHTML = [
      ["成熟池",summary.mature],["新品池",summary.newborn],["流量浪费",summary.waste],["黑马宝藏",summary.blackHorse],["下滑队列",summary.declining],["未匹配",links.length-(summary.matched||0)]
    ].map(([l,v])=>`<article><span>${l}</span><strong>${fmt(v)}</strong><small>链接诊断队列</small></article>`).join("");
    if ($("#listingTable")) $("#listingTable").innerHTML = links.slice(0,100).map(x=>`<tr><td><strong>${esc(x.category||"未定义")}</strong></td><td><a href="${esc(x.url||"#")}" target="_blank" rel="noopener">${esc(x.name||x.productId)}</a><small>Product ID ${esc(x.productId)}</small></td><td>${esc(x.shop)}</td><td>${esc(x.pool||"—")} / ${esc(x.tier||"—")}</td><td>${fmt(x.visitors)}</td><td>${pct(x.visitors?num(x.orders)/num(x.visitors):0)}</td><td>${fmt(x.units)} / ${money(x.sales)}</td><td>${esc(x.matchStatus||"—")}</td></tr>`).join("");
    if ($("#diagnosisSourceNote")) $("#diagnosisSourceNote").textContent = `每张卡由${fmt(links.length)}条链接实时计算；当前数据来自 Supabase 云端快照。`;
    if ($("#governanceStatus")) $("#governanceStatus").innerHTML = `<div><span>当前数据版本</span><strong>${esc(m.meta?.generatedAt || definitions.version || "云端快照")}</strong></div><div><span>已接入</span><strong>${fmt(links.length)} 链接 · ${fmt(summary.models || 0)} Model</strong></div><div><span>数据模式</span><strong>Supabase 云端</strong></div>`;
    document.body.dataset.dataReady = "true";
  } catch (error) {
    document.body.dataset.dataError = error.message;
    const n = document.querySelector(".topbar");
    if (n) n.insertAdjacentHTML("afterend", `<div class="load-error" style="margin:16px;padding:16px">云端数据加载失败：${esc(error.message)}</div>`);
  }
})();