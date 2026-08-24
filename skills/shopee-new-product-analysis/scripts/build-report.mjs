import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLAIM_RULES = [
  ["makeup_removal", "卸妆清洁", "feature", /卸妆|清洁彩妆|清除彩妆|makeup removal|remove makeup|bersihkan makeup|mengangkat makeup/i],
  ["gentle_non_irritating", "温和不刺激", "benefit", /温和|不刺激|无刺激|gentle|non.?irritat|tanpa drama iritasi|gentle on skin/i],
  ["sensitive_skin", "敏感肌适用", "benefit", /敏感肌|敏感皮|sensitive skin|kulit sensitif/i],
  ["acne_care", "痘肌护理", "benefit", /痘肌|祛痘|痘痘|acne care|anti.?acne|jerawat/i],
  ["hydration", "保湿补水", "benefit", /保湿|补水|水润|hydrating|moisturizing|hydration|menghidrasi|terhidrasi|barrier/i],
  ["brightening", "提亮/焕亮", "benefit", /提亮|焕亮|美白|brightening|mencerahkan|glowing|cerah/i],
  ["ingredient_complex", "成分复合配方", "proof", /成分|配方|ingredients?|soothing complex|brightening agent|skin comfort ingredients|cica|panthenol|niacinamide/i],
  ["skin_type_fit", "肤质适配", "spec", /油性肌|干性肌|暗沉肌|敏感肌|痘肌|oily skin|dry skin|dull skin|skin concerns|kulit/i],
  ["easy_to_use", "易用/使用步骤", "benefit", /使用方法|使用步骤|cara penggunaan|step|easy to use|effortless/i],
  ["comparison", "对比/效果", "proof", /对比|升级|前后|before|after|comparison|upgrade/i],
  ["after_sales", "售后/投诉规则", "trust", /投诉|售后|开箱视频|退换|komplain|complaint|unboxing|feedback|rating toko/i],
  ["promotion", "促销/优惠", "promotion", /优惠|折扣|买赠|限时|discount|sale|voucher|free gift/i]
];

const SLOT_RULES = [
  [1, "吸引注意", "产品主体 + 一个最强核心利益", ["benefit", "feature"]],
  [2, "说明价值", "痛点、前后对比或最直观的效果证明", ["benefit", "proof"]],
  [3, "展示场景", "真实使用场景，说明适合谁、何时使用", ["scene"]],
  [4, "证明能力", "功能、机制、结构或可验证细节", ["feature", "proof"]],
  [5, "建立信任", "成分、材质、安全、认证或品质证明", ["proof", "trust"]],
  [6, "解除疑虑", "尺寸、规格、肤质或适配范围", ["spec"]],
  [7, "教会使用", "使用步骤、包装内容或操作方法", ["trust", "feature"]],
  [8, "促成购买", "售后、保障或促销信息，仅在有必要时使用", ["trust", "promotion"]]
];

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, number(value, minimum)));
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeClaim(value, explicitClaim = "") {
  const explicit = text(explicitClaim).toLowerCase().replace(/\s+/g, "_");
  const known = CLAIM_RULES.find((rule) => rule[0] === explicit);
  if (known) return { key: known[0], label: known[1], type: known[2] };
  const source = text(value);
  const matched = CLAIM_RULES.find((rule) => rule[3].test(source));
  if (matched) return { key: matched[0], label: matched[1], type: matched[2] };
  return source ? { key: `unmapped:${source.toLowerCase()}`, label: source, type: "unmapped" } : null;
}

function imageAssets(record) {
  if (Array.isArray(record.image_assets) && record.image_assets.length) return record.image_assets;
  return (record.image_sources || []).map((source_url, index) => ({ source_url, sequence: index + 1 }));
}

function annotationRecords(input) {
  return Array.isArray(input) ? input : input?.records || [];
}

function findAnnotationRecord(record, annotations) {
  return annotations.find((item) => item.watch_key === record.watch_key || item.source_url === record.source_url) || {};
}

function claimItems(annotation, fallbackText) {
  if (Array.isArray(annotation.claims) && annotation.claims.length) return annotation.claims;
  const claimText = text(annotation.text || annotation.ocr_text || fallbackText);
  return claimText ? [{ ...annotation, text: claimText }] : [];
}

function qualityWeight(record) {
  const sold = number(record.sold_total, -1);
  const reviews = number(record.review_count, -1);
  const rating = number(record.rating, -1);
  if (sold < 0 && reviews < 0 && rating < 0) return 1;
  const soldScore = sold < 0 ? 0.5 : clamp(Math.log1p(sold) / Math.log1p(10000));
  const reviewScore = reviews < 0 ? 0.5 : clamp(Math.log1p(reviews) / Math.log1p(5000));
  const ratingScore = rating < 0 ? 0.5 : clamp(rating / 5);
  return 0.7 + 0.3 * (soldScore * 0.5 + reviewScore * 0.3 + ratingScore * 0.2);
}

function orderScore(sequence) {
  return 1 / Math.log2(Math.max(2, sequence + 1));
}

function imageType(annotation, claimType, sequence) {
  if (text(annotation.image_type)) return text(annotation.image_type);
  if (claimType === "scene") return "scene";
  if (claimType === "spec") return "specification";
  if (claimType === "proof" || claimType === "trust") return "proof";
  return sequence === 1 ? "hero" : "feature";
}

function prominence(annotation, sequence) {
  if (annotation.visual_emphasis != null) return clamp(annotation.visual_emphasis);
  const area = number(annotation.text_area_ratio, -1);
  const font = number(annotation.font_size_ratio, -1);
  const headline = annotation.is_headline === true ? 0.2 : 0;
  if (area >= 0 || font >= 0) return clamp((area >= 0 ? area * 0.45 : 0) + (font >= 0 ? font * 0.35 : 0) + headline);
  return clamp(sequence === 1 ? 0.75 : 0.55);
}

function buildProducts(snapshot, annotationDocument) {
  const records = Array.isArray(snapshot) ? snapshot : snapshot.records || [];
  const annotations = annotationRecords(annotationDocument);
  return records.map((record) => {
    const annotationRecord = findAnnotationRecord(record, annotations);
    const bySequence = new Map((annotationRecord.images || []).map((image) => [number(image.sequence), image]));
    const images = imageAssets(record).map((asset, index) => {
      const sequence = number(asset.sequence, index + 1);
      const annotation = bySequence.get(sequence) || {};
      const claims = claimItems(annotation, text(asset.ocr_text)).map((claim) => {
        const normalized = normalizeClaim(claim.text || claim.ocr_text, claim.normalized_claim || claim.claim);
        if (!normalized) return null;
        return { ...normalized, evidence: text(claim.text || claim.ocr_text), confidence: clamp(claim.confidence ?? annotation.confidence, 0), needs_review: claim.needs_review === true || annotation.needs_review === true };
      }).filter(Boolean);
      const primaryClaim = claims[0] || null;
      return {
        sequence,
        source_url: asset.source_url || annotation.source_url || null,
        text: text(annotation.text || annotation.ocr_text || asset.ocr_text),
        claims,
        image_type: imageType(annotation, primaryClaim?.type, sequence),
        scene: text(annotation.scene),
        order_score: orderScore(sequence),
        visual_prominence: prominence(annotation, sequence),
        confidence: number(annotation.confidence, null),
        needs_review: annotation.needs_review === true || claims.some((claim) => claim.needs_review) || (!claims.length && !text(annotation.text || annotation.ocr_text || asset.ocr_text)),
        review_reason: text(annotation.review_reason)
      };
    });
    return { watch_key: record.watch_key || record.source_url, source_url: record.source_url, product_title: record.product_title || record.product_name, category: record.category, competitor_brand: record.competitor_brand, market: record.market, quality_weight: qualityWeight(record), images };
  });
}

function aggregateClaims(products) {
  const totalWeight = products.reduce((sum, product) => sum + product.quality_weight, 0) || 1;
  const result = new Map();
  for (const product of products) {
    const perProduct = new Map();
    for (const image of product.images) {
      for (const claim of image.claims) {
        const current = perProduct.get(claim.key) || { ...claim, sequence: image.sequence, order_score: image.order_score, visual_prominence: image.visual_prominence, occurrences: 0 };
        current.sequence = Math.min(current.sequence, image.sequence);
        current.order_score = Math.max(current.order_score, image.order_score);
        current.visual_prominence = Math.max(current.visual_prominence, image.visual_prominence);
        current.occurrences += 1;
        perProduct.set(claim.key, current);
      }
    }
    for (const [key, claim] of perProduct) {
      const current = result.get(key) || { claim_key: key, label: claim.label, type: claim.type, product_count: 0, weighted_presence: 0, order_total: 0, visual_total: 0, repetition_total: 0, weight_total: 0, evidence: [] };
      current.product_count += 1;
      current.weighted_presence += product.quality_weight;
      current.order_total += claim.order_score * product.quality_weight;
      current.visual_total += claim.visual_prominence * product.quality_weight;
      current.repetition_total += Math.min(claim.occurrences / 3, 1) * product.quality_weight;
      current.weight_total += product.quality_weight;
      current.evidence.push({ brand: product.competitor_brand || "未标注品牌", sequence: claim.sequence, text: claim.evidence });
      result.set(key, current);
    }
  }
  return [...result.values()].map((claim) => {
    const frequency = claim.weighted_presence / totalWeight;
    const order = claim.order_total / (claim.weight_total || 1);
    const visual = claim.visual_total / (claim.weight_total || 1);
    const repetition = claim.repetition_total / (claim.weight_total || 1);
    const score = 100 * (frequency * 0.3 + order * 0.25 + visual * 0.2 + repetition * 0.15 + (claim.weight_total / totalWeight) * 0.1);
    return { claim_key: claim.claim_key, label: claim.label, type: claim.type, product_count: claim.product_count, frequency: Number(frequency.toFixed(4)), average_first_sequence: Number((1 / Math.max(order, 0.01)).toFixed(2)), order_score: Number(order.toFixed(4)), visual_prominence: Number(visual.toFixed(4)), repetition_score: Number(repetition.toFixed(4)), score: Number(score.toFixed(2)), evidence: claim.evidence.slice(0, 8) };
  }).sort((left, right) => right.score - left.score);
}

function aggregateScenes(products) {
  const totalWeight = products.reduce((sum, product) => sum + product.quality_weight, 0) || 1;
  const result = new Map();
  for (const product of products) {
    const perProduct = new Map();
    for (const image of product.images) {
      if (!image.scene) continue;
      const key = image.scene.toLowerCase();
      const current = perProduct.get(key) || { scene_key: key, label: image.scene, sequence: image.sequence, order_score: image.order_score, visual_prominence: image.visual_prominence, occurrences: 0 };
      current.sequence = Math.min(current.sequence, image.sequence);
      current.order_score = Math.max(current.order_score, image.order_score);
      current.visual_prominence = Math.max(current.visual_prominence, image.visual_prominence);
      current.occurrences += 1;
      perProduct.set(key, current);
    }
    for (const [key, scene] of perProduct) {
      const current = result.get(key) || { ...scene, product_count: 0, weighted_presence: 0, order_total: 0, visual_total: 0, repetition_total: 0, weight_total: 0 };
      current.product_count += 1;
      current.weighted_presence += product.quality_weight;
      current.order_total += scene.order_score * product.quality_weight;
      current.visual_total += scene.visual_prominence * product.quality_weight;
      current.repetition_total += Math.min(scene.occurrences / 3, 1) * product.quality_weight;
      current.weight_total += product.quality_weight;
      result.set(key, current);
    }
  }
  return [...result.values()].map((scene) => {
    const frequency = scene.weighted_presence / totalWeight;
    const order = scene.order_total / (scene.weight_total || 1);
    const visual = scene.visual_total / (scene.weight_total || 1);
    const repetition = scene.repetition_total / (scene.weight_total || 1);
    return { scene_key: scene.scene_key, label: scene.label, product_count: scene.product_count, frequency: Number(frequency.toFixed(4)), average_first_sequence: Number((1 / Math.max(order, 0.01)).toFixed(2)), order_score: Number(order.toFixed(4)), visual_prominence: Number(visual.toFixed(4)), repetition_score: Number(repetition.toFixed(4)), score: Number((100 * (frequency * 0.3 + order * 0.25 + visual * 0.2 + repetition * 0.15 + (scene.weight_total / totalWeight) * 0.1)).toFixed(2)) };
  }).sort((left, right) => right.score - left.score);
}

function buildRecommendations(claimRanking, sceneRanking) {
  return SLOT_RULES.map(([sequence, stage, instruction, acceptedTypes]) => ({ sequence, stage, instruction, suggested_claims: acceptedTypes.includes("scene") ? [] : claimRanking.filter((claim) => acceptedTypes.includes(claim.type)).slice(0, 3), suggested_scenes: acceptedTypes.includes("scene") ? sceneRanking.slice(0, 3) : [] }));
}

function productMessagePlan(claimRanking, product = {}) {
  const facts = unique([...(product.product_facts || []), ...(product.proof_points || []), ...(product.required_messages || [])]);
  const avoid = unique(product.claims_to_avoid || []);
  const corpus = facts.join(" ").toLowerCase();
  return claimRanking.slice(0, 10).map((claim) => {
    const avoided = avoid.some((value) => corpus.includes(value.toLowerCase()) || value.toLowerCase().includes(claim.label.toLowerCase()) || claim.label.toLowerCase().includes(value.toLowerCase()));
    const supported = corpus.includes(claim.label.toLowerCase()) || (claim.claim_key === "makeup_removal" && /卸妆|makeup|清洁|cleansing/i.test(corpus)) || (claim.claim_key === "hydration" && /保湿|补水|hydration|hydrating/i.test(corpus)) || (claim.claim_key === "ingredient_complex" && /成分|ingredient|配方/i.test(corpus));
    const regulated = /治疗|治愈|根治|100%|零刺激|永久|保证|medical|cure|guarantee|zero irritation/i.test(claim.label);
    const status = avoided || regulated ? "不要直接使用" : supported ? "可直接使用" : "需补充证据";
    return { ...claim, status, reason: avoided ? "与自有产品限制冲突" : regulated ? "存在绝对或高风险表述" : supported ? "产品资料中有对应事实或证明" : "竞品有表达，但自有产品资料未提供足够证据" };
  });
}

function detailPagePlan(claimRanking, sceneRanking, product = {}) {
  const productName = text(product.product_name) || "新品";
  const topClaims = claimRanking.slice(0, 3).map((claim) => claim.label).join("、") || "核心产品利益";
  const topScene = sceneRanking[0]?.label || "真实使用场景";
  return [
    ["01", "首屏承诺", `${productName} + ${topClaims}`, "只放一个主承诺，必须由产品事实或证明支持。"],
    ["02", "用户问题与利益", `解释用户为什么需要${topClaims}`, "用痛点—利益—适用人群结构，避免把竞品宣称写成自有产品事实。"],
    ["03", "效果/机制证明", "放测试、成分、结构或前后对比证据", "没有可验证证据时标记为待补充，不直接使用绝对效果词。"],
    ["04", "场景与人群", topScene, "展示真实使用时刻和目标用户，不用与产品无关的氛围图替代场景。"],
    ["05", "使用方法", "步骤、用量、频次和注意事项", "降低购买后的预期落差，信息应与包装或实际说明一致。"],
    ["06", "规格与适配", "容量、型号、肤质/人群适配、包装清单", "把下单前最容易产生疑问的参数集中说明。"],
    ["07", "异议与 FAQ", "安全性、兼容性、效果边界、售后问题", "把未确认问题列为待验证，不用客服无法兑现的承诺。"],
    ["08", "信任与购买收口", "售后、保障、活动或组合购买", "售后规则和促销信息只写平台及店铺真实可兑现内容。"]
  ];
}

function arrayValue(value) {
  return Array.isArray(value) ? value.filter((item) => item != null) : [];
}

function listHtml(values, empty = "未提供") {
  const items = arrayValue(values).map((value) => `<li>${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</li>`).join("");
  return items ? `<ul>${items}</ul>` : `<p class="missing">${escapeHtml(empty)}</p>`;
}

function researchMetricCards(metrics = {}) {
  const labels = [["monthly_units", "类目月销量"], ["average_price", "类目均价"], ["brand_count", "品牌数量"], ["seller_count", "卖家数量"], ["brand_concentration", "品牌集中度"], ["seller_concentration", "卖家集中度"]];
  return labels.map(([key, label]) => metricCard(label, metrics[key] == null || metrics[key] === "" ? "—" : metrics[key], metrics.source || "来源未提供")).join("");
}

function reviewInsightCards(reviewInsights = {}) {
  const positive = arrayValue(reviewInsights.positive);
  const negative = arrayValue(reviewInsights.negative);
  const faq = arrayValue(reviewInsights.faq);
  const themeCards = (items, fallback) => items.length ? items.map((item) => `<article class="insight-card"><b>${escapeHtml(item.theme || fallback)}</b><strong>${item.count == null ? "" : escapeHtml(item.count)}</strong>${listHtml(item.examples, "未提供用户原话")}${item.action ? `<p class="action">动作：${escapeHtml(item.action)}</p>` : ""}</article>`).join("") : `<div class="empty">${escapeHtml(fallback)}暂无数据</div>`;
  return `<div class="grid-2"><div><h3>好评驱动</h3><div class="insight-grid">${themeCards(positive, "好评主题")}</div></div><div><h3>差评与风险</h3><div class="insight-grid">${themeCards(negative, "差评主题")}</div></div></div><div class="faq-box"><h3>高频疑问 / FAQ</h3>${listHtml(faq, "未提供评论 FAQ")}</div>`;
}

function positioningHtml(positioning = {}) {
  const rows = [["目标人群", positioning.target_users], ["核心痛点", positioning.pain_points], ["核心主承诺", positioning.core_promise ? [positioning.core_promise] : []], ["次级利益", positioning.supporting_benefits], ["差异化方向", positioning.differentiation], ["证据缺口", positioning.proof_gaps], ["测试假设", positioning.test_hypotheses]];
  return `<div class="positioning-grid">${rows.map(([label, values]) => `<article class="detail-card"><b>${escapeHtml(label)}</b>${listHtml(values, "未提供")}</article>`).join("")}</div>`;
}

function launchHtml(launchPlan = {}) {
  const linkRows = arrayValue(launchPlan.link_matrix).map((item) => `<tr><td>${escapeHtml(item.link_type)}</td><td>${escapeHtml(arrayValue(item.models).join("、"))}</td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.price)}</td></tr>`).join("");
  const channelRows = arrayValue(launchPlan.channels).map((item) => `<tr><td>${escapeHtml(item.channel)}</td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.asset)}</td></tr>`).join("");
  const roadmapRows = arrayValue(launchPlan.roadmap).map((item) => `<article class="timeline-card"><b>${escapeHtml(item.stage)}</b><span>${escapeHtml(item.timing)}</span>${listHtml(item.actions, "未提供动作")}</article>`).join("");
  return `<div class="grid-2"><div><h3>链接矩阵 / Bundle</h3>${linkRows ? `<div class="table-scroll"><table><thead><tr><th>链接</th><th>Model</th><th>角色</th><th>价格</th></tr></thead><tbody>${linkRows}</tbody></table></div>` : `<div class="empty">未提供链接矩阵</div>`}</div><div><h3>渠道表达</h3>${channelRows ? `<div class="table-scroll"><table><thead><tr><th>渠道</th><th>重点信息</th><th>素材</th></tr></thead><tbody>${channelRows}</tbody></table></div>` : `<div class="empty">未提供渠道规划</div>`}</div></div><h3>Roadmap</h3><div class="timeline">${roadmapRows || `<div class="empty">未提供上市节奏</div>`}</div><div class="grid-2"><div><h3>KPI / 测试指标</h3>${listHtml(launchPlan.kpis, "未提供")}</div><div><h3>执行风险</h3>${listHtml(launchPlan.risks, "未提供")}</div></div>`;
}

function competitorComparisonHtml(rows) {
  if (!rows.length) return `<div class="empty">未提供竞品对比补充表；当前使用链接和主图证据。</div>`;
  return `<div class="table-scroll"><table><thead><tr><th>品牌/标题</th><th>价格/规格</th><th>优势</th><th>不足</th><th>自有产品动作</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${escapeHtml(item.brand)}</strong><br>${escapeHtml(item.title)}</td><td>${escapeHtml(item.price)}<br>${escapeHtml(item.specification)}</td><td>${escapeHtml(arrayValue(item.advantages).join("、"))}</td><td>${escapeHtml(arrayValue(item.weaknesses).join("、"))}</td><td>${escapeHtml(item.own_action)}</td></tr>`).join("")}</tbody></table></div>`;
}

function researchHtml(research = {}) {
  if (!research || !Object.keys(research).length) return `<div class="notice"><strong>新品调研补充：</strong>当前未提供市场、评论、定位或上市执行资料，报告仅输出竞品主图和自有产品事实适配。</div>`;
  const market = research.market_context || {};
  const positioning = research.positioning || {};
  const launch = research.launch_plan || {};
  const keywords = arrayValue(market.keywords);
  return `<section class="section"><h2>六、新品调研与定位</h2><p class="section-lead">市场、评论和定位资料按“证据—判断—动作”分层展示。</p><div class="notice"><strong>调研目标：</strong>${escapeHtml(research.objective || "未提供")}<br><strong>市场机会摘要：</strong>${escapeHtml(market.opportunity_summary || "未提供")}<br><strong>来源：</strong>${escapeHtml(market.source || "部分字段未提供来源")}</div><h3>市场与关键词</h3><div class="metrics research-metrics">${researchMetricCards(market.industry_metrics || {})}</div>${keywords.length ? `<div class="table-scroll"><table><thead><tr><th>关键词</th><th>搜索量</th><th>增长率</th><th>来源</th></tr></thead><tbody>${keywords.map((item) => `<tr><td><strong>${escapeHtml(item.term)}</strong></td><td>${escapeHtml(item.search_volume)}</td><td>${escapeHtml(item.growth_rate)}</td><td>${escapeHtml(item.source)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">未提供关键词数据</div>`}<h3>竞品结构补充</h3>${competitorComparisonHtml(arrayValue(research.competitor_comparison))}<h3>用户反馈</h3>${reviewInsightCards(research.review_insights || {})}<h3>新品定位</h3>${positioningHtml(positioning)}</section><section class="section"><h2>七、链接、渠道与上线执行</h2><p class="section-lead">执行规划只使用用户提供的历史或当前业务资料，不自动复制历史新品的价格和排期。</p>${launchHtml(launch)}</section>`;
}

function metricCard(label, value, note = "") {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function claimTable(rows, type = "claim") {
  if (!rows.length) return `<div class="empty">暂无足够标注数据</div>`;
  return `<div class="table-scroll"><table><thead><tr><th>排名</th><th>${type === "scene" ? "场景" : "归一化卖点"}</th><th>类型</th><th>覆盖竞品</th><th>首次序号</th><th>视觉显著度</th><th>表达权重</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.label)}</strong></td><td>${escapeHtml(row.type || "场景")}</td><td>${row.product_count}</td><td>${row.average_first_sequence}</td><td><div class="bar"><i style="width:${Math.round(row.visual_prominence * 100)}%"></i></div><small>${Math.round(row.visual_prominence * 100)}%</small></td><td><b class="score">${row.score}</b></td></tr>`).join("")}</tbody></table></div>`;
}

function competitorCards(products) {
  return products.map((product) => `<article class="competitor-card"><div class="competitor-head"><div><span>${escapeHtml(product.competitor_brand || "未标注品牌")}</span><h3>${escapeHtml(product.product_title || "未命名商品")}</h3></div><a href="${escapeHtml(safeUrl(product.source_url) || "#")}" target="_blank" rel="noopener">打开商品页 ↗</a></div><div class="image-strip">${product.images.map((image) => { const url = safeUrl(image.source_url); return `<figure>${url ? `<img src="${escapeHtml(url)}" alt="第${image.sequence}张主图" loading="lazy">` : `<div class="image-missing">无图片地址</div>`}<figcaption>#${image.sequence} · ${escapeHtml(image.image_type)}${image.scene ? ` · ${escapeHtml(image.scene)}` : ""}<br>${escapeHtml(image.claims.slice(0, 2).map((claim) => claim.label).join("、") || "待复核")}</figcaption></figure>`; }).join("")}</div></article>`).join("");
}

function renderHtml(result, product, annotationDocument, research) {
  const productName = text(product.product_name) || "自有新品（未提供产品资料）";
  const coverage = result.annotation_coverage;
  const statusCounts = { "可直接使用": 0, "需补充证据": 0, "不要直接使用": 0 };
  result.product_message_plan.forEach((item) => { statusCounts[item.status] += 1; });
  const generatedAt = new Date().toISOString().slice(0, 10);
  const hasMultipleCompetitors = result.input_records >= 5;
  const reportJson = escapeJson({ ...result, product, research });
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shopee竞品主图分析报告｜${escapeHtml(productName)}</title><style>
  :root{--ink:#16323a;--muted:#5c7379;--line:#d9e6e8;--paper:#f6faf9;--card:#fff;--brand:#0e7490;--brand2:#0f766e;--hot:#d97706;--bad:#b42318;--good:#087443;--shadow:0 14px 40px #16323a12}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font:15px/1.65 Inter,"Noto Sans SC","Microsoft YaHei",sans-serif}a{color:var(--brand)}.wrap{max-width:1280px;margin:auto;padding:28px}.cover{background:linear-gradient(135deg,#092f3b,#0e7490 58%,#55a8a0);color:#fff;padding:54px;border-radius:28px;box-shadow:var(--shadow);margin-bottom:22px}.eyebrow{letter-spacing:.12em;font-size:12px;opacity:.8}.cover h1{font-size:42px;line-height:1.15;margin:14px 0}.cover p{max-width:760px;font-size:17px;color:#e2f4f5}.meta{display:flex;gap:10px;flex-wrap:wrap}.tag{display:inline-flex;padding:5px 10px;border-radius:999px;background:#ffffff1c;color:inherit;font-size:12px}.notice{padding:14px 16px;background:#fff7e6;border:1px solid #f3d39b;color:#7a4b00;border-radius:14px;margin:18px 0}.section{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:26px;margin:22px 0;box-shadow:var(--shadow)}.section h2{margin:0 0 6px;font-size:25px}.section h2 small{font-size:13px;color:var(--muted);font-weight:400}.section h3{margin:24px 0 10px}.section-lead{color:var(--muted);margin-top:0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.research-metrics{grid-template-columns:repeat(3,1fr);margin:12px 0}.metric{padding:16px;border:1px solid var(--line);border-radius:14px;background:#fbfefe}.metric span,.metric small{display:block;color:var(--muted)}.metric strong{display:block;font-size:28px;margin:4px 0}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;min-width:680px}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:12px;color:var(--muted);font-weight:600}.bar{display:inline-block;width:90px;height:7px;background:#e6eff0;border-radius:99px;vertical-align:middle;margin-right:6px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--brand),#51b9a6);border-radius:inherit}.score{color:var(--brand);font-size:18px}.blueprint{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.slot{border:1px solid var(--line);border-radius:14px;padding:15px;background:#fcffff;min-height:180px}.slot-no{color:var(--brand);font-weight:800;font-size:22px}.slot h3{margin:3px 0;font-size:17px}.slot p{color:var(--muted);margin:5px 0 10px;font-size:13px}.slot ul{padding-left:19px;margin:0}.slot li{font-size:13px}.competitor-card{border:1px solid var(--line);border-radius:16px;padding:16px;margin-top:14px}.competitor-head{display:flex;justify-content:space-between;gap:12px}.competitor-head span{color:var(--brand);font-size:12px}.competitor-head h3{margin:2px 0;font-size:17px}.image-strip{display:flex;gap:10px;overflow:auto;padding-top:12px}.image-strip figure{margin:0;min-width:130px;width:130px}.image-strip img,.image-missing{width:130px;height:130px;object-fit:cover;border-radius:10px;background:#edf4f5}.image-missing{display:grid;place-items:center;color:var(--muted);font-size:12px}.image-strip figcaption{font-size:11px;color:var(--muted);margin-top:5px}.detail-grid,.positioning-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.detail-card{padding:16px;border-left:4px solid var(--brand);background:#f5fbfb;border-radius:10px}.detail-card b{display:block;color:var(--brand);font-size:12px}.detail-card h3{margin:4px 0;font-size:16px}.detail-card p{margin:0;color:var(--muted);font-size:13px}.detail-card ul,.insight-card ul,.timeline-card ul{padding-left:19px;margin:7px 0 0}.positioning-grid .detail-card{min-height:130px}.insight-grid{display:grid;gap:10px}.insight-card{padding:13px;border:1px solid var(--line);border-radius:12px;background:#fbfefe}.insight-card b{color:var(--brand)}.insight-card strong{float:right;color:var(--brand)}.insight-card li,.timeline-card li{font-size:13px}.action{font-size:13px;color:var(--hot);margin:8px 0 0}.faq-box{margin-top:18px;padding:16px;background:#f5fbfb;border-radius:12px}.timeline{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.timeline-card{padding:14px;border-top:4px solid var(--brand);background:#f5fbfb;border-radius:10px}.timeline-card b,.timeline-card span{display:block}.timeline-card span{font-size:12px;color:var(--muted)}.missing{color:var(--muted);font-style:italic}.status-table td:first-child{font-weight:700}.status-direct{color:var(--good)}.status-proof{color:var(--hot)}.status-stop{color:var(--bad)}.empty{padding:24px;color:var(--muted);text-align:center;border:1px dashed var(--line);border-radius:12px}.foot{color:var(--muted);font-size:12px;padding:10px 4px 40px}@media(max-width:900px){.wrap{padding:14px}.cover{padding:30px 22px}.cover h1{font-size:31px}.metrics,.grid-2,.research-metrics{grid-template-columns:1fr 1fr}.blueprint,.detail-grid,.positioning-grid,.timeline{grid-template-columns:1fr 1fr}}@media(max-width:560px){.metrics,.grid-2,.blueprint,.detail-grid,.positioning-grid,.research-metrics,.timeline{grid-template-columns:1fr}.section{padding:18px}.competitor-head{display:block}}
  </style></head><body><main class="wrap"><header class="cover"><span class="eyebrow">SHOPEE COMPETITOR VISUAL INTELLIGENCE</span><h1>竞品主图套图与详情页优化报告</h1><p>把竞品如何表达卖点、如何安排图片顺序和如何消除购买疑虑，转译为新品可执行的主图与详情页测试假设。</p><div class="meta"><span class="tag">${escapeHtml(productName)}</span><span class="tag">${escapeHtml(product.category || result.category || "未分类")}</span><span class="tag">${result.input_records} 个竞品</span><span class="tag">生成日期 ${generatedAt}</span></div></header>
  ${!hasMultipleCompetitors ? `<div class="notice"><strong>样本边界：</strong>当前只有 ${result.input_records} 个竞品链接，本报告是样本观察，不代表整个品类共识。建议补充至少 5–10 个同市场、同价格带链接后再定稿。</div>` : ""}
  <section class="section"><h2>一、分析范围与质量</h2><p class="section-lead">数据来源、视觉识别方式和证据覆盖率先于结论展示。</p><div class="metrics">${metricCard("竞品链接", result.input_records, "固定链接范围")}${metricCard("主图总数", coverage.total_images, "保持原始顺序")}${metricCard("识别覆盖率", `${Math.round(coverage.coverage * 100)}%`, annotationDocument.model || "标注来源未说明")}${metricCard("待复核图片", coverage.needs_review_images, coverage.needs_review_images ? "不可直接定稿" : "当前队列为空")}</div><p class="section-lead">标注方式：${escapeHtml(annotationDocument.review_method || annotationDocument.model || "未说明")}。竞品页和图片来源见下方证据卡片。</p></section>
  <section class="section"><h2>二、竞品表达权重</h2><p class="section-lead">权重用于判断竞品的表达优先级，不等于转化因果。分数综合出现频率、图片先后、视觉显著度、重复强调和公开质量信号。</p>${claimTable(result.claim_ranking)} </section>
  <section class="section"><h2>三、场景表达权重</h2><p class="section-lead">场景单独统计，避免把“使用场景”埋没在产品卖点里。</p>${claimTable(result.scene_ranking, "scene")}</section>
  <section class="section"><h2>四、新品主图套图建议</h2><p class="section-lead">这是首轮测试蓝图。优先使用有产品事实支持的卖点；没有证据的候选在“自有产品适配”中补证后再写。</p><div class="blueprint">${result.recommendation.map((slot) => `<article class="slot"><span class="slot-no">${String(slot.sequence).padStart(2, "0")}</span><h3>${escapeHtml(slot.stage)}</h3><p>${escapeHtml(slot.instruction)}</p>${slot.suggested_claims.length ? `<ul>${slot.suggested_claims.map((claim) => `<li>${escapeHtml(claim.label)} · ${claim.score}</li>`).join("")}</ul>` : slot.suggested_scenes.length ? `<ul>${slot.suggested_scenes.map((scene) => `<li>${escapeHtml(scene.label)} · ${scene.score}</li>`).join("")}</ul>` : `<div class="empty">暂无证据，保留为空</div>`}</article>`).join("")}</div></section>
  <section class="section"><h2>五、自有产品适配与文案风险</h2><p class="section-lead">将竞品高频表达和自有产品资料交叉，先决定哪些能写、哪些要补证、哪些不要直接使用。</p><div class="metrics">${metricCard("可直接使用", statusCounts["可直接使用"], "产品资料有对应事实")}${metricCard("需补充证据", statusCounts["需补充证据"], "先补测试或事实")}${metricCard("不要直接使用", statusCounts["不要直接使用"], "冲突或高风险表达")}${metricCard("自有产品事实", unique(product.product_facts || []).length, "仅以用户上传资料为准")}</div>${result.product_message_plan.length ? `<div class="table-scroll"><table class="status-table"><thead><tr><th>竞品表达</th><th>竞品权重</th><th>自有产品建议</th><th>判断依据</th></tr></thead><tbody>${result.product_message_plan.map((item) => `<tr><td><strong>${escapeHtml(item.label)}</strong></td><td>${item.score}</td><td class="${item.status === "可直接使用" ? "status-direct" : item.status === "需补充证据" ? "status-proof" : "status-stop"}">${escapeHtml(item.status)}</td><td>${escapeHtml(item.reason)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">未提供自有产品资料，无法做安全的可用性判断。</div>`}<div class="grid-2"><div><h3>自有产品事实</h3><ul>${unique(product.product_facts || []).map((fact) => `<li>${escapeHtml(fact)}</li>`).join("") || "<li>未提供</li>"}</ul></div><div><h3>需避免表达</h3><ul>${unique(product.claims_to_avoid || []).map((fact) => `<li>${escapeHtml(fact)}</li>`).join("") || "<li>未提供</li>"}</ul></div></div></section>
  ${researchHtml(research)}
  <section class="section"><h2>八、详情页结构建议</h2><p class="section-lead">详情页承接主图承诺，顺序从理解价值到证据、场景、规格和售后收口。</p><div class="detail-grid">${result.detail_page_plan.map((item) => `<article class="detail-card"><b>${item[0]} · ${escapeHtml(item[1])}</b><h3>${escapeHtml(item[2])}</h3><p>${escapeHtml(item[3])}</p></article>`).join("")}</div></section>
  <section class="section"><h2>九、竞品证据卡片</h2><p class="section-lead">图片仅证明竞品页面如何表达，不证明竞品宣称真实。点击商品页或图片来源可回看原始证据。</p>${competitorCards(result.products)}</section>
  <section class="section"><h2>十、下一轮测试清单</h2><div class="grid-2"><div><h3>优先制作</h3><ul><li>为第 1 张主图保留一个核心利益，不堆叠全部卖点。</li><li>把最高权重的核心利益与产品主体放在首屏测试。</li><li>用一张前后对比或机制证明图承接“为什么需要”。</li><li>根据真实目标人群补充使用场景，不用纯装饰氛围图替代。</li></ul></div><div><h3>上线前复核</h3><ul><li>逐条核对成分、功效、肤质适配和安全表述的产品证据。</li><li>检查印尼语/英语文案、平台规则和当地合规限制。</li><li>详情页与主图的容量、用法、包装清单必须一致。</li><li>上线后用 CTR、加购率、转化率做单变量 A/B 复盘。</li></ul></div></div></section>
  <footer class="foot">报告生成自固定竞品链接。竞品表达频率不是销量因果结论；自有产品文案仍需事实、测试、平台和当地法规审核。<br>报告数据摘要：<code id="report-meta"></code></footer></main><script>window.reportData=${reportJson};document.getElementById('report-meta').textContent=JSON.stringify({schema:window.reportData.schema_version,claims:window.reportData.claim_ranking.length,scenes:window.reportData.scene_ranking.length});</script></body></html>`;
}

export function createReport(snapshot, annotations = {}, product = {}, research = {}) {
  const products = buildProducts(snapshot, annotations);
  const claimRanking = aggregateClaims(products);
  const sceneRanking = aggregateScenes(products);
  const allImages = products.flatMap((item) => item.images);
  const annotatedImages = allImages.filter((image) => image.claims.length || image.text);
  const result = {
    schema_version: "shopee-main-image-report-v1",
    generated_at: new Date().toISOString(),
    input_records: products.length,
    category: products.find((item) => item.category)?.category || product.category || null,
    annotation_metadata: { model: text(annotations.model) || null, review_method: text(annotations.review_method) || null, generated_at: text(annotations.generated_at) || null },
    annotation_coverage: { total_images: allImages.length, annotated_images: annotatedImages.length, coverage: allImages.length ? Number((annotatedImages.length / allImages.length).toFixed(4)) : 0, needs_review_images: allImages.filter((image) => image.needs_review).length },
    claim_ranking: claimRanking,
    scene_ranking: sceneRanking,
    recommendation: buildRecommendations(claimRanking, sceneRanking),
    product_message_plan: productMessagePlan(claimRanking, product),
    detail_page_plan: detailPagePlan(claimRanking, sceneRanking, product),
    products,
    review_queue: products.flatMap((productRecord) => productRecord.images.filter((image) => image.needs_review).map((image) => ({ watch_key: productRecord.watch_key, sequence: image.sequence, source_url: image.source_url }))),
    research_sections: { market: Boolean(research.market_context), competitor_comparison: arrayValue(research.competitor_comparison).length > 0, reviews: Boolean(research.review_insights), positioning: Boolean(research.positioning), launch: Boolean(research.launch_plan) }
  };
  return result;
}

async function main() {
  const snapshotPath = option("--snapshot");
  const annotationsPath = option("--annotations");
  const productPath = option("--product");
  const researchPath = option("--research");
  const outputPath = resolve(option("--out", "competitor-main-image-report.html"));
  if (!snapshotPath) throw new Error("缺少 --snapshot 竞品快照 JSON");
  const snapshot = JSON.parse(await readFile(resolve(snapshotPath), "utf8"));
  const annotations = annotationsPath ? JSON.parse(await readFile(resolve(annotationsPath), "utf8")) : {};
  const product = productPath ? JSON.parse(await readFile(resolve(productPath), "utf8")) : {};
  const research = researchPath ? JSON.parse(await readFile(resolve(researchPath), "utf8")) : {};
  const result = createReport(snapshot, annotations, product, research);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderHtml(result, product, annotations, research), "utf8");
  console.log(JSON.stringify({ output: outputPath, records: result.input_records, images: result.annotation_coverage.total_images, claims: result.claim_ranking.length, scenes: result.scene_ranking.length, coverage: result.annotation_coverage.coverage }));
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) await main();
