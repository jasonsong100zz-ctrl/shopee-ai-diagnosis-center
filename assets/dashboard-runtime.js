(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const num = (v) => Number(v) || 0;
  const fmt = (v) => num(v).toLocaleString("zh-CN");
  const pct = (v) => (num(v) * 100).toFixed(2) + "%";
  const style = document.createElement("style");
  style.textContent = `
    #metricGrid{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));gap:0;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}
    #metricGrid article{min-height:120px;padding:22px 18px;border-right:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column;gap:10px}
    #metricGrid article:last-child{border-right:0}
    #metricGrid article span{font-size:14px;color:#6b7280;font-weight:600}
    #metricGrid article strong{font-size:24px;line-height:1.1;color:#111827;white-space:nowrap}
    #metricGrid article small{font-size:12px;color:#9ca3af}
    .overview-row{display:grid;grid-template-columns:minmax(180px,1.5fr) 110px 150px 90px 120px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #eef0f2;font-size:14px;white-space:nowrap}
    .overview-row strong{font-weight:700;color:#1f2937}.overview-row span{color:#6b7280}.overview-row b{color:#176b4d}.overview-row em{font-style:normal;font-weight:700;color:#111827}
    #storeOverview,#categoryOverview,#linkOverview{padding:12px 26px 18px}
    #module1Summary{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:12px}
    #module1Summary article{padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff}
    #module1Summary article span,#module1Summary article small{display:block;color:#6b7280;font-size:12px}
    #module1Summary article strong{display:block;font-size:22px;margin:6px 0}
    #listingTable td{padding:10px 8px;vertical-align:top}#listingTable small{display:block;color:#9ca3af;margin-top:4px}
    @media(max-width:1100px){#metricGrid{grid-template-columns:repeat(4,1fr)}#module1Summary{grid-template-columns:repeat(3,1fr)}.overview-row{grid-template-columns:1.4fr 90px 120px 70px 100px}}
    @media(max-width:700px){#metricGrid{grid-template-columns:repeat(2,1fr)}#metricGrid article{border-bottom:1px solid #e5e7eb}.overview-row{grid-template-columns:1fr 90px 90px}.overview-row b,.overview-row em{display:none}}
  `;
  document.head.appendChild(style);
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
    document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", () => {
      const id = link.getAttribute("href").slice(1);
      const route = id === "overview" ? "overview" : id.startsWith("chat-") ? "workflows" : id === "listings" || id === "diagnosis" ? "listings" : id;
      document.querySelectorAll("[data-route]").forEach((section) => { section.hidden = section.dataset.route !== route; });
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.getAttribute("href") === "#" + route));
      document.querySelector(".sidebar")?.classList.remove("open");
    }));
    document.querySelector("#workflowNavToggle")?.addEventListener("click", () => {
      const menu = document.querySelector("#workflowSubmenu"); if (menu) menu.hidden = !menu.hidden;
    });
    document.body.dataset.dataReady = "true";
  } catch (error) {
    document.body.dataset.dataError = error.message;
    const n = document.querySelector(".topbar");
    if (n) n.insertAdjacentHTML("afterend", `<div class="load-error" style="margin:16px;padding:16px">云端数据加载失败：${esc(error.message)}</div>`);
  }
})();