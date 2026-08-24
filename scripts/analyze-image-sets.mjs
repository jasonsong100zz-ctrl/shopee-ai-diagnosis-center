import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLAIM_RULES = [
  { key: "water_resistance", label: "防水/防泼溅", type: "feature", patterns: [/防水|防泼溅|waterproof|water resistant|กันน้ำ/i] },
  { key: "capacity", label: "容量/收纳", type: "benefit", patterns: [/容量|收纳|大空间|大容量|capacity|storage|large space/i] },
  { key: "easy_to_use", label: "易用/易安装", type: "benefit", patterns: [/易用|好用|易安装|免安装|使用方法|使用步骤|cara penggunaan|step|easy to use|easy install|no installation/i] },
  { key: "material_quality", label: "材质/品质", type: "proof", patterns: [/材质|不锈钢|铝合金|食品级|premium material|stainless|quality/i] },
  { key: "space_saving", label: "节省空间", type: "benefit", patterns: [/省空间|节省空间|不占地|space saving|save space|compact/i] },
  { key: "durability", label: "耐用/耐磨", type: "proof", patterns: [/耐用|耐磨|坚固|durable|wear resistant|heavy duty/i] },
  { key: "safety", label: "安全/保护", type: "trust", patterns: [/安全|防滑|保护|safe|safety|non.?slip|protection/i] },
  { key: "scene_outdoor", label: "户外场景", type: "scene", patterns: [/户外|露营|旅行|outdoor|camping|travel/i] },
  { key: "scene_home", label: "居家场景", type: "scene", patterns: [/居家|厨房|卧室|客厅|home|kitchen|bedroom|living room/i] },
  { key: "size_fit", label: "尺寸/适配", type: "spec", patterns: [/尺寸|规格|适配|型号|size|specification|compatible|fits/i] },
  { key: "comparison", label: "对比/效果", type: "proof", patterns: [/对比|升级|前后|before|after|comparison|upgrade/i] },
  { key: "package", label: "包装/配件", type: "trust", patterns: [/包装|配件|清单|套装|package|accessories|what.?s included|set/i] },
  { key: "promotion", label: "促销/优惠", type: "promotion", patterns: [/优惠|折扣|买赠|限时|discount|sale|voucher|free gift/i] }
  ,{ key: "makeup_removal", label: "卸妆清洁", type: "feature", patterns: [/卸妆|清洁彩妆|清除彩妆|makeup removal|remove makeup|cleans? makeup|bersihkan makeup/i] }
  ,{ key: "sensitive_skin", label: "敏感肌适用", type: "benefit", patterns: [/敏感肌|敏感皮|sensitive skin|kulit sensitif/i] }
  ,{ key: "gentle_non_irritating", label: "温和不刺激", type: "benefit", patterns: [/温和|不刺激|无刺激|gentle|non.?irritat|tanpa drama iritasi/i] }
  ,{ key: "acne_care", label: "痘肌护理", type: "benefit", patterns: [/痘肌|祛痘|痘痘|acne care|anti.?acne/i] }
  ,{ key: "hydration", label: "保湿补水", type: "benefit", patterns: [/保湿|补水|水润|hydrating|moisturizing|melembabkan|menghidrasi/i] }
  ,{ key: "brightening", label: "提亮/焕亮", type: "benefit", patterns: [/提亮|焕亮|美白|brightening|mencerahkan/i] }
  ,{ key: "ingredient_complex", label: "成分复合配方", type: "proof", patterns: [/成分|配方|ingredients?|soothing complex|brightening agent|skin comfort ingredients|hyaluronic|cica|panthenol/i] }
  ,{ key: "skin_type_fit", label: "肤质适配", type: "spec", patterns: [/油性肌|干性肌|暗沉肌|敏感肌|痘肌|oily skin|dry skin|dull skin|sensitive skin|skin concerns/i] }
  ,{ key: "after_sales", label: "售后/投诉规则", type: "trust", patterns: [/投诉|售后|开箱视频|退换|komplain|complaint|unboxing|feedback dari team|rating toko/i] }
];

const RECOMMENDATION_SLOTS = [
  { sequence: 1, stage: "吸引注意", image_type: "hero", accepted_types: ["benefit", "feature"], instruction: "产品主体 + 一个最强核心利益，移动端一眼读懂" },
  { sequence: 2, stage: "说明价值", image_type: "pain_point_or_comparison", accepted_types: ["benefit", "proof"], instruction: "痛点对比或使用前后，让消费者理解为什么需要" },
  { sequence: 3, stage: "展示场景", image_type: "scene", accepted_types: ["scene"], instruction: "真实使用场景，证明产品适合谁、在什么时刻使用" },
  { sequence: 4, stage: "证明能力", image_type: "feature_detail", accepted_types: ["feature", "proof"], instruction: "核心功能、结构或细节，补充可验证的产品能力" },
  { sequence: 5, stage: "建立信任", image_type: "quality_proof", accepted_types: ["proof", "trust"], instruction: "材质、认证、耐用性或安全证明，减少购买风险" },
  { sequence: 6, stage: "解除疑虑", image_type: "specification", accepted_types: ["spec"], instruction: "尺寸、规格、适配范围和关键参数" },
  { sequence: 7, stage: "教会使用", image_type: "usage_or_package", accepted_types: ["trust", "feature"], instruction: "安装、使用步骤或包装清单，避免下单后预期落差" },
  { sequence: 8, stage: "促成购买", image_type: "trust_or_promotion", accepted_types: ["trust", "promotion"], instruction: "售后、保障或促销信息；仅在确有必要时前置" }
];

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeClaim(annotationText, explicitClaim) {
  const normalizedExplicit = text(explicitClaim);
  if (normalizedExplicit) {
    const explicitKey = normalizedExplicit.toLowerCase().replace(/\s+/g, "_");
    const knownRule = CLAIM_RULES.find((candidate) => candidate.key === explicitKey);
    return knownRule ? { key: knownRule.key, label: knownRule.label, type: knownRule.type } : { key: explicitKey, label: normalizedExplicit, type: "custom" };
  }
  const value = text(annotationText);
  const rule = CLAIM_RULES.find((candidate) => candidate.patterns.some((pattern) => pattern.test(value)));
  if (rule) return { key: rule.key, label: rule.label, type: rule.type };
  return value ? { key: `unmapped:${value.toLowerCase()}`, label: value, type: "unmapped" } : null;
}

function inferImageType(annotation, claimType, sequence) {
  if (text(annotation.image_type)) return text(annotation.image_type);
  if (claimType === "scene") return "scene";
  if (claimType === "spec") return "specification";
  if (claimType === "promotion") return "promotion";
  if (claimType === "proof" || claimType === "trust") return "proof";
  return sequence === 1 ? "hero" : "feature";
}

function visualProminence(annotation, asset, sequence) {
  const explicit = number(annotation.visual_emphasis, -1);
  if (explicit >= 0) return clamp(explicit);
  const area = number(annotation.text_area_ratio, -1);
  const fontSize = number(annotation.font_size_ratio, -1);
  const headline = annotation.is_headline === true ? 1 : 0;
  if (area >= 0 || fontSize >= 0 || headline) return clamp((area >= 0 ? area * 0.45 : 0) + (fontSize >= 0 ? fontSize * 0.35 : 0) + headline * 0.2);
  const displayedArea = number(asset.displayed_width) * number(asset.displayed_height);
  return displayedArea > 0 ? clamp(sequence === 1 ? 0.75 : 0.55) : 0.4;
}

function orderScore(sequence) {
  return 1 / Math.log2(Math.max(2, sequence + 1));
}

function productWeight(record) {
  const sold = number(record.sold_total, -1);
  const reviews = number(record.review_count, -1);
  const rating = number(record.rating, -1);
  const signals = [sold, reviews, rating].filter((value) => value >= 0);
  if (!signals.length) return 1;
  const soldScore = sold < 0 ? 0.5 : clamp(Math.log1p(sold) / Math.log1p(10000));
  const reviewScore = reviews < 0 ? 0.5 : clamp(Math.log1p(reviews) / Math.log1p(5000));
  const ratingScore = rating < 0 ? 0.5 : clamp(rating / 5);
  return 0.7 + 0.3 * (soldScore * 0.5 + reviewScore * 0.3 + ratingScore * 0.2);
}

function imageAssetsFor(record) {
  if (Array.isArray(record.image_assets) && record.image_assets.length) return record.image_assets;
  return (record.image_sources || []).map((sourceUrl, index) => ({ sequence: index + 1, source_url: sourceUrl }));
}

function annotationList(record, externalAnnotations) {
  const own = record.image_annotations || record.annotations;
  if (Array.isArray(own) && own.length) return own;
  if (own && typeof own === "object") return Object.entries(own).map(([sequence, annotation]) => ({ sequence: Number(sequence), ...annotation }));
  const external = externalAnnotations.find((entry) => entry.watch_key === record.watch_key || entry.source_url === record.source_url);
  return Array.isArray(external?.images) ? external.images : [];
}

function claimAnnotations(annotation, fallbackText) {
  if (Array.isArray(annotation.claims) && annotation.claims.length) return annotation.claims;
  return [{ ...annotation, text: text(annotation.text || annotation.ocr_text || fallbackText) }];
}

function buildObservations(records, externalAnnotations) {
  return records.map((record) => {
    const annotations = annotationList(record, externalAnnotations);
    const bySequence = new Map(annotations.map((annotation) => [number(annotation.sequence), annotation]));
    const images = imageAssetsFor(record).map((asset, index) => {
      const sequence = number(asset.sequence, index + 1);
      const annotation = bySequence.get(sequence) || {};
      const ocrText = text(annotation.text || annotation.ocr_text || asset.ocr_text);
      const claims = claimAnnotations(annotation, ocrText).map((candidate) => {
        const claimText = text(candidate.text || candidate.ocr_text || ocrText);
        const normalized = normalizeClaim(claimText, candidate.normalized_claim || candidate.claim);
        if (!normalized) return null;
        return {
          claim_key: normalized.key,
          claim_label: normalized.label,
          claim_type: text(candidate.claim_type) || normalized.type,
          text: claimText || null,
          confidence: number(candidate.confidence, number(annotation.confidence, null)),
          needs_review: candidate.needs_review === true || annotation.needs_review === true || !claimText,
          review_reason: text(candidate.review_reason || annotation.review_reason) || null
        };
      }).filter(Boolean);
      const claim = claims[0] || null;
      const source = text(annotation.text || annotation.ocr_text) || claims.some((candidate) => candidate.text) ? "annotation" : text(asset.ocr_text) ? "ocr" : "none";
      return {
        sequence,
        source_url: asset.source_url || null,
        text: ocrText || null,
        text_source: source,
        language: text(annotation.language) || null,
        claims,
        claim_key: claim?.key || null,
        claim_label: claim?.label || null,
        claim_type: text(annotation.claim_type) || claim?.type || null,
        image_type: inferImageType(annotation, claim?.type, sequence),
        scene: text(annotation.scene) || null,
        order_score: orderScore(sequence),
        visual_prominence: visualProminence(annotation, asset, sequence),
        confidence: number(annotation.confidence, null),
        needs_review: annotation.needs_review === true || claims.some((candidate) => candidate.needs_review) || (!ocrText && !claims.length),
        review_reason: text(annotation.review_reason) || null
      };
    });
    return {
      watch_key: record.watch_key || record.source_url || `record-${records.indexOf(record) + 1}`,
      source_url: record.source_url || null,
      product_title: record.product_title || record.product_name || null,
      category: record.category || null,
      competitor_brand: record.competitor_brand || null,
      quality_weight: productWeight(record),
      images
    };
  });
}

function aggregateClaims(products) {
  const totalWeight = products.reduce((sum, product) => sum + product.quality_weight, 0) || 1;
  const byClaim = new Map();
  for (const product of products) {
    const perProduct = new Map();
    for (const image of product.images) {
      for (const imageClaim of image.claims || []) {
        if (!imageClaim.claim_key) continue;
        const current = perProduct.get(imageClaim.claim_key) || { ...imageClaim, sequence: image.sequence, visual_prominence: image.visual_prominence, order_score: image.order_score, occurrences: 0 };
      current.occurrences += 1;
      if (image.sequence < current.sequence) current.sequence = image.sequence;
      current.order_score = Math.max(current.order_score, image.order_score);
      current.visual_prominence = Math.max(current.visual_prominence, image.visual_prominence);
        perProduct.set(imageClaim.claim_key, current);
      }
    }
    for (const [claimKey, value] of perProduct) {
      const current = byClaim.get(claimKey) || { claim_key: claimKey, label: value.claim_label, type: value.claim_type, product_count: 0, weighted_presence: 0, order_total: 0, visual_total: 0, repetition_total: 0, weight_total: 0 };
      current.product_count += 1;
      current.weighted_presence += product.quality_weight;
      current.order_total += value.order_score * product.quality_weight;
      current.visual_total += value.visual_prominence * product.quality_weight;
      current.repetition_total += Math.min(value.occurrences / 3, 1) * product.quality_weight;
      current.weight_total += product.quality_weight;
      byClaim.set(claimKey, current);
    }
  }
  return [...byClaim.values()].map((claim) => {
    const frequency = claim.weighted_presence / totalWeight;
    const order = claim.order_total / (claim.weight_total || 1);
    const visual = claim.visual_total / (claim.weight_total || 1);
    const repetition = claim.repetition_total / (claim.weight_total || 1);
    const score = 100 * (frequency * 0.3 + order * 0.25 + visual * 0.2 + repetition * 0.15 + (claim.weight_total / totalWeight) * 0.1);
    return { claim_key: claim.claim_key, label: claim.label, type: claim.type, product_count: claim.product_count, frequency: Number(frequency.toFixed(4)), average_first_sequence: Number((1 / Math.max(order, 0.01)).toFixed(2)), order_score: Number(order.toFixed(4)), visual_prominence: Number(visual.toFixed(4)), repetition_score: Number(repetition.toFixed(4)), score: Number(score.toFixed(2)) };
  }).sort((left, right) => right.score - left.score);
}

function sequencePatterns(products) {
  const transitions = new Map();
  for (const product of products) {
    const types = product.images.map((image) => image.image_type).filter(Boolean);
    for (let index = 0; index < types.length - 1; index += 1) {
      const key = `${types[index]} → ${types[index + 1]}`;
      transitions.set(key, (transitions.get(key) || 0) + 1);
    }
  }
  return [...transitions.entries()].map(([transition, count]) => ({ transition, count })).sort((left, right) => right.count - left.count).slice(0, 20);
}

function aggregateScenes(products) {
  const totalWeight = products.reduce((sum, product) => sum + product.quality_weight, 0) || 1;
  const byScene = new Map();
  for (const product of products) {
    const perProduct = new Map();
    for (const image of product.images) {
      const scene = text(image.scene);
      if (!scene) continue;
      const sceneKey = scene.toLowerCase();
      const current = perProduct.get(sceneKey) || { scene_key: sceneKey, label: scene, sequence: image.sequence, order_score: image.order_score, visual_prominence: image.visual_prominence, occurrences: 0 };
      current.occurrences += 1;
      current.sequence = Math.min(current.sequence, image.sequence);
      current.order_score = Math.max(current.order_score, image.order_score);
      current.visual_prominence = Math.max(current.visual_prominence, image.visual_prominence);
      perProduct.set(sceneKey, current);
    }
    for (const [sceneKey, value] of perProduct) {
      const current = byScene.get(sceneKey) || { ...value, product_count: 0, weighted_presence: 0, order_total: 0, visual_total: 0, repetition_total: 0, weight_total: 0 };
      current.product_count += 1;
      current.weighted_presence += product.quality_weight;
      current.order_total += value.order_score * product.quality_weight;
      current.visual_total += value.visual_prominence * product.quality_weight;
      current.repetition_total += Math.min(value.occurrences / 3, 1) * product.quality_weight;
      current.weight_total += product.quality_weight;
      byScene.set(sceneKey, current);
    }
  }
  return [...byScene.values()].map((scene) => {
    const frequency = scene.weighted_presence / totalWeight;
    const order = scene.order_total / (scene.weight_total || 1);
    const visual = scene.visual_total / (scene.weight_total || 1);
    const repetition = scene.repetition_total / (scene.weight_total || 1);
    const score = 100 * (frequency * 0.3 + order * 0.25 + visual * 0.2 + repetition * 0.15 + (scene.weight_total / totalWeight) * 0.1);
    return { scene_key: scene.scene_key, label: scene.label, product_count: scene.product_count, frequency: Number(frequency.toFixed(4)), average_first_sequence: Number((1 / Math.max(order, 0.01)).toFixed(2)), order_score: Number(order.toFixed(4)), visual_prominence: Number(visual.toFixed(4)), repetition_score: Number(repetition.toFixed(4)), score: Number(score.toFixed(2)) };
  }).sort((left, right) => right.score - left.score);
}

function recommendation(claimRanking, sceneRanking) {
  return RECOMMENDATION_SLOTS.map((slot) => ({
    ...slot,
    suggested_claims: claimRanking.filter((claim) => slot.accepted_types.includes(claim.type)).slice(0, 3).map((claim) => ({ claim_key: claim.claim_key, label: claim.label, score: claim.score })),
    suggested_scenes: slot.accepted_types.includes("scene") ? sceneRanking.slice(0, 3).map((scene) => ({ scene_key: scene.scene_key, label: scene.label, score: scene.score })) : []
  }));
}

export function analyzeImageSets(input, annotations = []) {
  const records = Array.isArray(input) ? input : input.records || [];
  const annotationDocument = Array.isArray(annotations) ? { records: annotations } : annotations || {};
  const externalAnnotations = annotationDocument.records || [];
  const products = buildObservations(records, externalAnnotations);
  const allImages = products.flatMap((product) => product.images);
  const annotatedImages = allImages.filter((image) => image.text_source === "annotation" || image.text_source === "ocr");
  const claimRanking = aggregateClaims(products);
  const sceneRanking = aggregateScenes(products);
  return {
    schema_version: "image-set-analysis-v1",
    generated_at: new Date().toISOString(),
    input_records: records.length,
    annotation_metadata: { model: text(annotationDocument.model) || null, review_method: text(annotationDocument.review_method) || null, generated_at: text(annotationDocument.generated_at) || null },
    annotation_coverage: { total_images: allImages.length, annotated_images: annotatedImages.length, coverage: allImages.length ? Number((annotatedImages.length / allImages.length).toFixed(4)) : 0, needs_review_images: allImages.filter((image) => image.needs_review).length },
    claim_ranking: claimRanking,
    scene_ranking: sceneRanking,
    sequence_patterns: sequencePatterns(products),
    recommendation: recommendation(claimRanking, sceneRanking),
    products,
    review_queue: products.flatMap((product) => product.images.filter((image) => image.needs_review).map((image) => ({ watch_key: product.watch_key, product_title: product.product_title, sequence: image.sequence, source_url: image.source_url })))
  };
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function rankingCsv(result) {
  const headers = ["排名", "卖点", "类型", "覆盖竞品数", "出现频率", "平均首次图片序号", "顺序分", "视觉显著度", "重复强调分", "表达权重"];
  const rows = result.claim_ranking.map((claim, index) => [index + 1, claim.label, claim.type, claim.product_count, claim.frequency, claim.average_first_sequence, claim.order_score, claim.visual_prominence, claim.repetition_score, claim.score]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

async function main() {
  const inputPath = resolve(option("--input", "tmp/competitor-snapshots/latest.json"));
  const outputPath = resolve(option("--out", "tmp/image-set-analysis.json"));
  const annotationsPath = option("--annotations");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const annotations = annotationsPath ? JSON.parse(await readFile(resolve(annotationsPath), "utf8")) : [];
  const result = analyzeImageSets(input, annotations);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const csvPath = option("--csv");
  if (csvPath) { await mkdir(dirname(resolve(csvPath)), { recursive: true }); await writeFile(resolve(csvPath), rankingCsv(result), "utf8"); }
  console.log(JSON.stringify({ output: outputPath, csv: csvPath ? resolve(csvPath) : null, records: result.input_records, claims: result.claim_ranking.length, annotation_coverage: result.annotation_coverage.coverage }));
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) await main();
