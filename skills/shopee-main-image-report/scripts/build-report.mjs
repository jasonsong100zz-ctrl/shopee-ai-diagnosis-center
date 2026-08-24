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

function snapshotRecords(input) {
  return Array.isArray(input) ? input : input?.records || [];
}

function comparisonValue(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).sort().join(" | ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return text(value);
}

function periodicChanges(currentSnapshot, previousSnapshot) {
  if (!previousSnapshot) return { available: false, changes: [] };
  const currentRecords = snapshotRecords(currentSnapshot);
  const previousRecords = snapshotRecords(previousSnapshot);
  const currentMap = new Map(currentRecords.map((record) => [record.watch_key || record.source_url, record]));
  const previousMap = new Map(previousRecords.map((record) => [record.watch_key || record.source_url, record]));
  const changes = [];
  const fields = [["product_title", "标题"], ["effective_price", "到手价"], ["price", "价格"], ["promotion_summary", "促销"], ["sold_total", "销量", true], ["rating", "评分"], ["review_count", "评价数", true], ["stock_status", "库存"], ["model_names", "Model"]];
  for (const key of new Set([...currentMap.keys(), ...previousMap.keys()])) {
    const current = currentMap.get(key);
    const previous = previousMap.get(key);
    if (!previous) {
      changes.push({ type: "added", key, title: current.product_title || current.source_url, fields: [] });
      continue;
    }
    if (!current) {
      changes.push({ type: "removed", key, title: previous.product_title || previous.source_url, fields: [] });
      continue;
    }
    const fieldChanges = [];
    for (const [field, label, numeric] of fields) {
      const before = comparisonValue(previous[field]);
      const after = comparisonValue(current[field]);
      if (!before || !after || before === after) continue;
      fieldChanges.push({ label, before, after, numeric: Boolean(numeric) });
    }
    const previousImages = imageAssets(previous).map((asset) => asset.source_url || "").join("|");
    const currentImages = imageAssets(current).map((asset) => asset.source_url || "").join("|");
    if (previousImages && currentImages && previousImages !== currentImages) fieldChanges.push({ label: "主图资产/顺序", before: `${imageAssets(previous).length} 张`, after: `${imageAssets(current).length} 张` });
    if (fieldChanges.length) changes.push({ type: "changed", key, title: current.product_title || current.source_url, fields: fieldChanges });
  }
  return { available: true, changes };
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

function detailPagePlan(claimRanking, sceneRanking) {
  const productName = "竞品页面信息结构";
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

function periodicChangeHtml(periodic) {
  if (!periodic.available) return `<div class="notice"><strong>周期对比：</strong>未提供上一周期快照，本次报告只展示当前周期观察，不判断“无变化”。</div>`;
  if (!periodic.changes.length) return `<div class="notice"><strong>周期对比：</strong>当前与上一周期没有检测到已知字段变化；缺失字段仍可能无法比较。</div>`;
  const typeLabel = { added: "新增竞品", removed: "移除竞品", changed: "字段变化" };
  return `<div class="change-grid">${periodic.changes.map((change) => `<article class="change-card"><b>${escapeHtml(typeLabel[change.type] || change.type)}</b><h3>${escapeHtml(change.title)}</h3>${change.fields.length ? `<ul>${change.fields.map((field) => `<li><strong>${escapeHtml(field.label)}</strong>：${escapeHtml(field.before)} → ${escapeHtml(field.after)}</li>`).join("")}</ul>` : `<p>链接已${change.type === "added" ? "进入" : "离开"}当前周期样本。</p>`}</article>`).join("")}</div>`;
}

function renderHtml(result, annotationDocument) {
  const productName = "竞品样本周期分析";
  const coverage = result.annotation_coverage;
  const generatedAt = new Date().toISOString().slice(0, 10);
  const hasMultipleCompetitors = result.input_records >= 5;
  const reportJson = escapeJson(result);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shopee竞品主图分析报告｜${escapeHtml(productName)}</title><style>
  :root{--ink:#16323a;--muted:#5c7379;--line:#d9e6e8;--paper:#f6faf9;--card:#fff;--brand:#0e7490;--brand2:#0f766e;--hot:#d97706;--bad:#b42318;--good:#087443;--shadow:0 14px 40px #16323a12}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font:15px/1.65 Inter,"Noto Sans SC","Microsoft YaHei",sans-serif}a{color:var(--brand)}.wrap{max-width:1280px;margin:auto;padding:28px}.cover{background:linear-gradient(135deg,#092f3b,#0e7490 58%,#55a8a0);color:#fff;padding:54px;border-radius:28px;box-shadow:var(--shadow);margin-bottom:22px}.eyebrow{letter-spacing:.12em;font-size:12px;opacity:.8}.cover h1{font-size:42px;line-height:1.15;margin:14px 0}.cover p{max-width:760px;font-size:17px;color:#e2f4f5}.meta{display:flex;gap:10px;flex-wrap:wrap}.tag{display:inline-flex;padding:5px 10px;border-radius:999px;background:#ffffff1c;color:inherit;font-size:12px}.notice{padding:14px 16px;background:#fff7e6;border:1px solid #f3d39b;color:#7a4b00;border-radius:14px;margin:18px 0}.section{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:26px;margin:22px 0;box-shadow:var(--shadow)}.section h2{margin:0 0 6px;font-size:25px}.section h2 small{font-size:13px;color:var(--muted);font-weight:400}.section h3{margin:24px 0 10px}.section-lead{color:var(--muted);margin-top:0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{padding:16px;border:1px solid var(--line);border-radius:14px;background:#fbfefe}.metric span,.metric small{display:block;color:var(--muted)}.metric strong{display:block;font-size:28px;margin:4px 0}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.change-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.change-card{padding:16px;border-left:4px solid var(--brand);background:#f5fbfb;border-radius:10px}.change-card b{display:block;color:var(--brand)}.change-card h3{margin:5px 0;font-size:16px}.change-card ul{padding-left:20px;margin:7px 0}.change-card li,.change-card p{font-size:13px;color:var(--muted)}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;min-width:680px}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:12px;color:var(--muted);font-weight:600}.bar{display:inline-block;width:90px;height:7px;background:#e6eff0;border-radius:99px;vertical-align:middle;margin-right:6px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--brand),#51b9a6);border-radius:inherit}.score{color:var(--brand);font-size:18px}.blueprint{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.slot{border:1px solid var(--line);border-radius:14px;padding:15px;background:#fcffff;min-height:180px}.slot-no{color:var(--brand);font-weight:800;font-size:22px}.slot h3{margin:3px 0;font-size:17px}.slot p{color:var(--muted);margin:5px 0 10px;font-size:13px}.slot ul{padding-left:19px;margin:0}.slot li{font-size:13px}.competitor-card{border:1px solid var(--line);border-radius:16px;padding:16px;margin-top:14px}.competitor-head{display:flex;justify-content:space-between;gap:12px}.competitor-head span{color:var(--brand);font-size:12px}.competitor-head h3{margin:2px 0;font-size:17px}.image-strip{display:flex;gap:10px;overflow:auto;padding-top:12px}.image-strip figure{margin:0;min-width:130px;width:130px}.image-strip img,.image-missing{width:130px;height:130px;object-fit:cover;border-radius:10px;background:#edf4f5}.image-missing{display:grid;place-items:center;color:var(--muted);font-size:12px}.image-strip figcaption{font-size:11px;color:var(--muted);margin-top:5px}.detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.detail-card{padding:16px;border-left:4px solid var(--brand);background:#f5fbfb;border-radius:10px}.detail-card b{display:block;color:var(--brand);font-size:12px}.detail-card h3{margin:4px 0;font-size:16px}.detail-card p{margin:0;color:var(--muted);font-size:13px}.empty{padding:24px;color:var(--muted);text-align:center;border:1px dashed var(--line);border-radius:12px}.foot{color:var(--muted);font-size:12px;padding:10px 4px 40px}@media(max-width:900px){.wrap{padding:14px}.cover{padding:30px 22px}.cover h1{font-size:31px}.metrics,.grid-2,.change-grid{grid-template-columns:1fr 1fr}.blueprint,.detail-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.metrics,.grid-2,.blueprint,.detail-grid,.change-grid{grid-template-columns:1fr}.section{padding:18px}.competitor-head{display:block}}
  </style></head><body><main class="wrap"><header class="cover"><span class="eyebrow">SHOPEE COMPETITOR VISUAL INTELLIGENCE</span><h1>竞品主图周期分析报告</h1><p>记录固定竞品如何表达卖点、安排主图顺序和变化视觉重点，形成可供下一周期复核的竞品观察。</p><div class="meta"><span class="tag">${escapeHtml(productName)}</span><span class="tag">${escapeHtml(result.category || "未分类")}</span><span class="tag">${result.input_records} 个竞品</span><span class="tag">生成日期 ${generatedAt}</span></div></header>
  ${!hasMultipleCompetitors ? `<div class="notice"><strong>样本边界：</strong>当前只有 ${result.input_records} 个竞品链接，本报告是样本观察，不代表整个品类共识。建议补充至少 5–10 个同市场、同价格带链接后再定稿。</div>` : ""}
  <section class="section"><h2>一、分析范围与质量</h2><p class="section-lead">数据来源、视觉识别方式和证据覆盖率先于结论展示。</p><div class="metrics">${metricCard("竞品链接", result.input_records, "固定链接范围")}${metricCard("主图总数", coverage.total_images, "保持原始顺序")}${metricCard("识别覆盖率", `${Math.round(coverage.coverage * 100)}%`, annotationDocument.model || "标注来源未说明")}${metricCard("待复核图片", coverage.needs_review_images, coverage.needs_review_images ? "不可直接定稿" : "当前队列为空")}</div><p class="section-lead">标注方式：${escapeHtml(annotationDocument.review_method || annotationDocument.model || "未说明")}。竞品页和图片来源见下方证据卡片。</p></section>
  <section class="section"><h2>二、周期变化</h2><p class="section-lead">按固定竞品标识比较当前快照和上一周期快照；缺失字段不会被当作没有变化。</p>${periodicChangeHtml(result.periodic_changes)}</section>
  <section class="section"><h2>二、竞品表达权重</h2><p class="section-lead">权重用于判断竞品的表达优先级，不等于转化因果。分数综合出现频率、图片先后、视觉显著度、重复强调和公开质量信号。</p>${claimTable(result.claim_ranking)} </section>
  <section class="section"><h2>三、场景表达权重</h2><p class="section-lead">场景单独统计，避免把“使用场景”埋没在产品卖点里。</p>${claimTable(result.scene_ranking, "scene")}</section>
  <section class="section"><h2>四、竞品主图表达地图</h2><p class="section-lead">这是固定竞品样本中的表达顺序观察，不是自有新品的直接文案方案。</p><div class="blueprint">${result.recommendation.map((slot) => `<article class="slot"><span class="slot-no">${String(slot.sequence).padStart(2, "0")}</span><h3>${escapeHtml(slot.stage)}</h3><p>${escapeHtml(slot.instruction)}</p>${slot.suggested_claims.length ? `<ul>${slot.suggested_claims.map((claim) => `<li>${escapeHtml(claim.label)} · ${claim.score}</li>`).join("")}</ul>` : slot.suggested_scenes.length ? `<ul>${slot.suggested_scenes.map((scene) => `<li>${escapeHtml(scene.label)} · ${scene.score}</li>`).join("")}</ul>` : `<div class="empty">暂无证据，保留为空</div>`}</article>`).join("")}</div></section>
  <section class="section"><h2>五、详情页结构观察</h2><p class="section-lead">仅记录竞品常见的信息承接顺序，不生成自有新品文案。</p><div class="detail-grid">${result.detail_page_plan.map((item) => `<article class="detail-card"><b>${item[0]} · ${escapeHtml(item[1])}</b><h3>${escapeHtml(item[2])}</h3><p>${escapeHtml(item[3])}</p></article>`).join("")}</div></section>
  <section class="section"><h2>六、竞品证据卡片</h2><p class="section-lead">图片仅证明竞品页面如何表达，不证明竞品宣称真实。点击商品页或图片来源可回看原始证据。</p>${competitorCards(result.products)}</section>
  <section class="section"><h2>七、下一周期观察清单</h2><div class="grid-2"><div><h3>重点追踪</h3><ul><li>新增、删除或重排的主图及其卖点。</li><li>首图核心表达、视觉显著度和场景变化。</li><li>价格、促销、Model、库存和公开质量指标变化。</li><li>新的评论风险、FAQ 或售后表达。</li></ul></div><div><h3>数据边界</h3><ul><li>缺少历史快照时不判断“无变化”。</li><li>缺少公开字段时标记为未知。</li><li>竞品高频表达不等于功效或转化证据。</li><li>样本不足时只输出样本观察。</li></ul></div></div></section>
  <footer class="foot">报告生成自固定竞品链接。竞品表达频率不是销量因果结论；自有产品文案仍需事实、测试、平台和当地法规审核。<br>报告数据摘要：<code id="report-meta"></code></footer></main><script>window.reportData=${reportJson};document.getElementById('report-meta').textContent=JSON.stringify({schema:window.reportData.schema_version,claims:window.reportData.claim_ranking.length,scenes:window.reportData.scene_ranking.length});</script></body></html>`;
}

export function createReport(snapshot, annotations = {}, previousSnapshot = null) {
  const products = buildProducts(snapshot, annotations);
  const claimRanking = aggregateClaims(products);
  const sceneRanking = aggregateScenes(products);
  const allImages = products.flatMap((item) => item.images);
  const annotatedImages = allImages.filter((image) => image.claims.length || image.text);
  const result = {
    schema_version: "shopee-main-image-report-v1",
    generated_at: new Date().toISOString(),
    input_records: products.length,
    category: products.find((item) => item.category)?.category || null,
    annotation_metadata: { model: text(annotations.model) || null, review_method: text(annotations.review_method) || null, generated_at: text(annotations.generated_at) || null },
    annotation_coverage: { total_images: allImages.length, annotated_images: annotatedImages.length, coverage: allImages.length ? Number((annotatedImages.length / allImages.length).toFixed(4)) : 0, needs_review_images: allImages.filter((image) => image.needs_review).length },
    claim_ranking: claimRanking,
    scene_ranking: sceneRanking,
    recommendation: buildRecommendations(claimRanking, sceneRanking),
    detail_page_plan: detailPagePlan(claimRanking, sceneRanking),
    products,
    review_queue: products.flatMap((productRecord) => productRecord.images.filter((image) => image.needs_review).map((image) => ({ watch_key: productRecord.watch_key, sequence: image.sequence, source_url: image.source_url }))),
    periodic_changes: periodicChanges(snapshot, previousSnapshot)
  };
  return result;
}

async function main() {
  const snapshotPath = option("--snapshot");
  const annotationsPath = option("--annotations");
  const previousPath = option("--previous");
  const outputPath = resolve(option("--out", "competitor-main-image-report.html"));
  if (!snapshotPath) throw new Error("缺少 --snapshot 竞品快照 JSON");
  const snapshot = JSON.parse(await readFile(resolve(snapshotPath), "utf8"));
  const annotations = annotationsPath ? JSON.parse(await readFile(resolve(annotationsPath), "utf8")) : {};
  const previousSnapshot = previousPath ? JSON.parse(await readFile(resolve(previousPath), "utf8")) : null;
  const result = createReport(snapshot, annotations, previousSnapshot);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderHtml(result, annotations), "utf8");
  console.log(JSON.stringify({ output: outputPath, records: result.input_records, images: result.annotation_coverage.total_images, claims: result.claim_ranking.length, scenes: result.scene_ranking.length, coverage: result.annotation_coverage.coverage }));
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) await main();
