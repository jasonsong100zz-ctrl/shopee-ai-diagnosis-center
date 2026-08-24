import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLAIM_TAXONOMY = [
  ["water_resistance", "防水/防泼溅", "feature"],
  ["capacity", "容量/收纳", "benefit"],
  ["easy_to_use", "易用/易安装", "benefit"],
  ["material_quality", "材质/品质", "proof"],
  ["space_saving", "节省空间", "benefit"],
  ["durability", "耐用/耐磨", "proof"],
  ["safety", "安全/保护", "trust"],
  ["scene_outdoor", "户外场景", "scene"],
  ["scene_home", "居家场景", "scene"],
  ["size_fit", "尺寸/适配", "spec"],
  ["comparison", "对比/效果", "proof"],
  ["package", "包装/配件", "trust"],
  ["promotion", "促销/优惠", "promotion"],
  ["makeup_removal", "卸妆清洁", "feature"],
  ["sensitive_skin", "敏感肌适用", "benefit"],
  ["gentle_non_irritating", "温和不刺激", "benefit"],
  ["acne_care", "痘肌护理", "benefit"],
  ["hydration", "保湿补水", "benefit"],
  ["brightening", "提亮/焕亮", "benefit"],
  ["ingredient_complex", "成分复合配方", "proof"],
  ["skin_type_fit", "肤质适配", "spec"],
  ["after_sales", "售后/投诉规则", "trust"]
];

const IMAGE_TYPES = ["hero", "feature", "scene", "proof", "specification", "usage", "package", "comparison", "promotion", "other"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 45_000;

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  const parsed = number(value, minimum);
  return Math.max(minimum, Math.min(maximum, parsed));
}

function imageList(record) {
  if (Array.isArray(record.image_assets) && record.image_assets.length) return record.image_assets;
  return (record.image_sources || []).map((source_url, index) => ({ source_url, sequence: index + 1 }));
}

function annotationMap(input) {
  const records = Array.isArray(input) ? input : input.records || [];
  return new Map(records.map((record) => [record.watch_key || record.source_url, record]));
}

function isSafeImageUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)
      && !host.endsWith(".local")
      && !/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  } catch {
    return false;
  }
}

function imageDataUrl(buffer, contentType) {
  const safeType = /^image\/(jpeg|jpg|png|webp|gif|bmp|avif)$/i.test(contentType || "") ? contentType.split(";")[0] : "image/jpeg";
  return `data:${safeType};base64,${Buffer.from(buffer).toString("base64")}`;
}

async function downloadImage(sourceUrl) {
  if (!isSafeImageUrl(sourceUrl)) throw new Error("图片地址不是允许的 HTTPS 公网图片地址");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal, headers: { Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1", "User-Agent": "ShopeeImageSetAnalyzer/1.0" } });
    if (!response.ok) throw new Error(`图片下载失败: HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/^image\/(jpeg|jpg|png|webp|gif)(?:;|$)/i.test(contentType)) throw new Error(`响应不是支持的图片格式: ${contentType || "未知类型"}`);
    const declaredLength = number(response.headers.get("content-length"), 0);
    if (declaredLength > MAX_IMAGE_BYTES) throw new Error("图片超过 8 MB 限制");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("图片为空或超过 8 MB 限制");
    return { dataUrl: imageDataUrl(buffer, contentType), contentType: contentType.split(";")[0], bytes: buffer.length };
  } finally {
    clearTimeout(timeout);
  }
}

function taxonomyText() {
  return CLAIM_TAXONOMY.map(([key, label, type]) => `${key}=${label} (${type})`).join("; ");
}

export function buildPrompt(record, asset) {
  return `你是电商主图套图分析器。只分析图片中确实可见的文字与视觉信息，不根据商品标题或常识臆造图片里没有的卖点。请保留可见文案原文，不要把价格、店铺名、平台按钮误判为产品卖点。\n\n商品品类：${text(record.category) || "未提供"}\n商品标题（仅用于消歧，不可补写图片事实）：${text(record.product_title || record.product_name) || "未提供"}\n图片序号：${asset.sequence}\n\n可选归一化卖点：${taxonomyText()}\n可选图片类型：${IMAGE_TYPES.join(", ")}\n\n请只返回 JSON，不要 Markdown：\n{\n  "text": "图片中可见的全部重要文案，多个文本用 \\n 分隔；没有文字则为空字符串",\n  "claims": [{"text":"与卖点对应的原文片段","normalized_claim":"taxonomy key","claim_type":"feature|benefit|proof|trust|scene|spec|promotion|other","confidence":0.0,"needs_review":false,"review_reason":""}],\n  "language": "zh|en|id|th|ms|vi|mixed|und",\n  "normalized_claim": "兼容旧格式时填写主卖点；使用 claims 时可为空字符串",\n  "claim_type": "主卖点类型；使用 claims 时可为空字符串",\n  "image_type": "hero|feature|scene|proof|specification|usage|package|comparison|promotion|other",\n  "scene": "可见使用场景；没有则为空字符串",\n  "text_area_ratio": 0,\n  "font_size_ratio": 0,\n  "visual_emphasis": 0,\n  "is_headline": false,\n  "confidence": 0,\n  "needs_review": false,\n  "review_reason": "低清晰度、文字不确定或无法判断时说明；否则为空字符串"\n}\n\n一张图可以有多个 claims，但只保留确实有图片证据的卖点。比例字段均为 0 到 1：文字面积占整图比例、最大字号相对整图高度、视觉强调程度。没有文字时 text_area_ratio 和 font_size_ratio 为 0，visual_emphasis 仍可按产品主体/场景视觉焦点判断。`;
}

function responseText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  return (response?.output || []).flatMap((item) => item.content || []).map((part) => part.text || "").filter(Boolean).join("\n");
}

export function parseVisionJson(value) {
  const raw = text(value).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("视觉模型没有返回 JSON 对象");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const claims = Array.isArray(parsed.claims) ? parsed.claims.map((claim) => ({
    text: text(claim?.text),
    normalized_claim: text(claim?.normalized_claim || claim?.claim),
    claim_type: text(claim?.claim_type) || "other",
    confidence: clamp(claim?.confidence ?? parsed.confidence),
    needs_review: claim?.needs_review === true || clamp(claim?.confidence ?? parsed.confidence) < 0.7,
    review_reason: text(claim?.review_reason)
  })).filter((claim) => claim.text || claim.normalized_claim) : [];
  const legacyClaim = text(parsed.normalized_claim) || text(parsed.claim);
  if (!claims.length && (text(parsed.text) || legacyClaim)) claims.push({ text: text(parsed.text), normalized_claim: legacyClaim, claim_type: text(parsed.claim_type) || "other", confidence: clamp(parsed.confidence), needs_review: parsed.needs_review === true || clamp(parsed.confidence) < 0.7, review_reason: text(parsed.review_reason) });
  return {
    text: text(parsed.text),
    claims,
    language: text(parsed.language) || "und",
    normalized_claim: text(parsed.normalized_claim),
    claim_type: text(parsed.claim_type) || "other",
    image_type: IMAGE_TYPES.includes(text(parsed.image_type)) ? text(parsed.image_type) : "other",
    scene: text(parsed.scene),
    text_area_ratio: clamp(parsed.text_area_ratio),
    font_size_ratio: clamp(parsed.font_size_ratio),
    visual_emphasis: clamp(parsed.visual_emphasis),
    is_headline: parsed.is_headline === true,
    confidence: clamp(parsed.confidence),
    needs_review: parsed.needs_review === true || clamp(parsed.confidence) < 0.7,
    review_reason: text(parsed.review_reason)
  };
}

async function requestVision(apiKey, model, prompt, dataUrl, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: dataUrl, detail: "high" }] }], max_output_tokens: 1200 })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (attempt < 2 && [429, 500, 502, 503, 504].includes(response.status)) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000 * (attempt + 1)));
        return requestVision(apiKey, model, prompt, dataUrl, attempt + 1);
      }
      throw new Error(body.error?.message || `视觉识别失败: HTTP ${response.status}`);
    }
    return parseVisionJson(responseText(body));
  } finally {
    clearTimeout(timeout);
  }
}

async function annotateOne(apiKey, model, record, asset) {
  const startedAt = Date.now();
  try {
    const downloaded = await downloadImage(asset.source_url);
    const annotation = await requestVision(apiKey, model, buildPrompt(record, asset), downloaded.dataUrl);
    return { sequence: asset.sequence, source_url: asset.source_url, ...annotation, model, image_bytes: downloaded.bytes, status: "complete", elapsed_ms: Date.now() - startedAt };
  } catch (error) {
    return { sequence: asset.sequence, source_url: asset.source_url, text: "", claims: [], language: "und", normalized_claim: "", claim_type: "other", image_type: "other", scene: "", text_area_ratio: 0, font_size_ratio: 0, visual_emphasis: 0, is_headline: false, confidence: 0, needs_review: true, review_reason: error.message || String(error), model, status: "failed", elapsed_ms: Date.now() - startedAt };
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, consume));
  return results;
}

export async function annotateImageSets(input, options = {}) {
  const source = Array.isArray(input) ? { records: input } : input;
  const existing = annotationMap(options.existing || { records: [] });
  const records = (source.records || []).map((record) => ({ ...record, image_annotations: record.image_annotations || existing.get(record.watch_key || record.source_url)?.images || [] }));
  const tasks = [];
  for (const record of records) {
    const completed = new Map((record.image_annotations || []).map((annotation) => [Number(annotation.sequence), annotation]));
    for (const asset of imageList(record)) {
      if (!asset.source_url || (!options.force && completed.get(Number(asset.sequence))?.status === "complete")) continue;
      tasks.push({ record, asset: { ...asset, sequence: Number(asset.sequence) || tasks.length + 1 } });
    }
  }
  const annotations = await mapWithConcurrency(tasks, options.concurrency || 2, (task) => annotateOne(options.apiKey, options.model, task.record, task.asset));
  const byRecord = new Map(records.map((record) => [record.watch_key || record.source_url, new Map((record.image_annotations || []).map((annotation) => [Number(annotation.sequence), annotation]))]));
  tasks.forEach((task, index) => byRecord.get(task.record.watch_key || task.record.source_url).set(task.asset.sequence, annotations[index]));
  return {
    schema_version: "image-annotations-v1",
    generated_at: new Date().toISOString(),
    model: options.model,
    source_schema_version: source.schema_version || null,
    records: records.map((record) => ({ watch_key: record.watch_key || null, source_url: record.source_url || null, product_title: record.product_title || record.product_name || null, images: [...byRecord.get(record.watch_key || record.source_url).values()].sort((left, right) => left.sequence - right.sequence) })),
    summary: { input_records: records.length, images_requested: tasks.length, completed_images: annotations.filter((annotation) => annotation.status === "complete").length, failed_images: annotations.filter((annotation) => annotation.status === "failed").length, skipped_existing: records.reduce((sum, record) => sum + Math.max(0, imageList(record).length - tasks.filter((task) => task.record === record).length), 0) }
  };
}

async function main() {
  const inputPath = resolve(option("--input", "tmp/competitor-snapshots/latest.json"));
  const outputPath = resolve(option("--out", "tmp/image-annotations.json"));
  const existingPath = option("--existing");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const existing = existingPath ? JSON.parse(await readFile(resolve(existingPath), "utf8")) : { records: [] };
  const dryRun = process.argv.includes("--dry-run");
  const model = option("--model", process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini");
  if (!dryRun && !process.env.OPENAI_API_KEY) throw new Error("缺少 OPENAI_API_KEY；只做流程检查请加 --dry-run");
  const result = dryRun
    ? { schema_version: "image-annotations-v1", generated_at: new Date().toISOString(), model, source_schema_version: input.schema_version || null, records: (input.records || []).map((record) => ({ watch_key: record.watch_key || null, source_url: record.source_url || null, product_title: record.product_title || record.product_name || null, images: imageList(record).map((asset) => ({ sequence: asset.sequence, source_url: asset.source_url, status: "pending", needs_review: true })) })), summary: { input_records: (input.records || []).length, images_requested: (input.records || []).reduce((sum, record) => sum + imageList(record).length, 0), completed_images: 0, failed_images: 0 } }
    : await annotateImageSets(input, { apiKey: process.env.OPENAI_API_KEY, model, concurrency: Number(option("--concurrency", "2")), existing, force: process.argv.includes("--force") });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: outputPath, ...result.summary }));
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
