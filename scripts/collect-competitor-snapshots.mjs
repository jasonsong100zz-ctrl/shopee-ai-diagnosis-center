import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function requiredOption(name) {
  const value = option(name);
  if (!value) throw new Error(`缺少参数 ${name}`);
  return value;
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function hash(value) {
  return createHash("sha256").update(value || "").digest("hex");
}

function unique(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseCompactNumber(value) {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").toLowerCase();
  const suffix = normalized.match(/[kmb]$/)?.[0] || "";
  const numberPart = normalized.replace(/[kmb]$/, "");
  const numeric = Number(numberPart.replace(/\.(?=\d{3}(?:\.|$))/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * ({ k: 1e3, m: 1e6, b: 1e9, "": 1 }[suffix]));
}

function currencyFromText(value) {
  const match = value.match(/(Rp|RM|฿|₫|₱|S\$|NT\$|R\$)/i);
  return match ? match[1].toUpperCase() : null;
}

function parseMoney(value) {
  if (!value) return null;
  const currency = currencyFromText(value);
  const digits = value.replace(/[^0-9.,]/g, "");
  if (!digits) return null;
  if (currency === "RM" || currency === "S$" || currency === "NT$" || currency === "R$") {
    const normalized = digits.includes(",") && digits.includes(".")
      ? digits.replace(/,/g, "")
      : digits.replace(/,/g, ".");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const numeric = Number(digits.replace(/[.,]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function extractMoneyTokens(text) {
  return unique(text.match(/(?:Rp|RM|฿|₫|₱|S\$|NT\$|R\$)\s*[\d.,]+/gi) || []);
}

function extractRating(text) {
  const match = text.match(/\b([0-5](?:[.,]\d)?)\s+(?:[\d.,]+[kmb]?\s+)?ratings?\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function extractReviewCount(text) {
  const match = text.match(/\b([\d.,]+\s*[kmb]?)\s+ratings?\b/i);
  return match ? parseCompactNumber(match[1]) : null;
}

function extractSoldTotal(text) {
  const match = text.match(/(?:sold|terjual)\s*([\d.,]+\s*[kmb]?)/i) || text.match(/([\d.,]+\s*[kmb]?)\s*(?:sold|terjual)/i);
  return match ? parseCompactNumber(match[1]) : null;
}

function extractDiscount(text) {
  const match = text.match(/(?:^|\s)(-?\d{1,3})%/);
  if (!match) return null;
  const value = Math.abs(Number(match[1]));
  return value <= 100 ? value / 100 : null;
}

function extractLines(text, pattern) {
  return unique(text.split(/\r?\n/).filter((line) => pattern.test(line)));
}

function parseListingStatus(text) {
  if (/sold out|out of stock|stok habis|habis terjual/i.test(text)) return "out_of_stock";
  if (/deleted|removed|not found|produk tidak ditemukan/i.test(text)) return "removed";
  return "active";
}

function parseStockStatus(text) {
  if (/sold out|out of stock|stok habis|habis terjual/i.test(text)) return "out_of_stock";
  if (/pre-?order|preorder|pre order/i.test(text)) return "preorder";
  return "available";
}

function makeEvent(record, previous, eventType, oldValue, newValue, deltaValue = null, changeRate = null, severity = "info", evidence = {}) {
  return {
    watch_key: record.watch_key,
    event_type: eventType,
    event_date: record.capture_date,
    old_value: oldValue,
    new_value: newValue,
    delta_value: deltaValue,
    change_rate: changeRate,
    severity,
    evidence: { previous_capture_date: previous?.capture_date || null, ...evidence },
  };
}

function compareSnapshots(record, previous) {
  if (!previous || record.capture_status === "failed" || previous.capture_status === "failed") return [];
  const events = [];
  const priceComparisons = [["price", "PRICE"]];
  if (record.effective_price !== record.price || previous.effective_price !== previous.price) priceComparisons.push(["effective_price", "EFFECTIVE_PRICE"]);
  for (const [field, eventType] of priceComparisons) {
    if (record[field] == null || previous[field] == null || previous[field] === 0) continue;
    const delta = record[field] - previous[field];
    const rate = delta / previous[field];
    if (Math.abs(rate) >= 0.05) {
      events.push(makeEvent(record, previous, rate < 0 ? `${eventType}_DOWN` : `${eventType}_UP`, previous[field], record[field], delta, rate, rate < 0 ? "warning" : "info"));
    }
  }
  if (record.sold_total != null && previous.sold_total != null && record.sold_total > previous.sold_total) {
    events.push(makeEvent(record, previous, "SOLD_PROXY_INCREASED", previous.sold_total, record.sold_total, record.sold_total - previous.sold_total, null, "info"));
  }
  if (record.review_count != null && previous.review_count != null && record.review_count > previous.review_count) {
    events.push(makeEvent(record, previous, "REVIEW_INCREASED", previous.review_count, record.review_count, record.review_count - previous.review_count, null, "info"));
  }
  if (record.rating != null && previous.rating != null && record.rating !== previous.rating) {
    events.push(makeEvent(record, previous, "RATING_CHANGED", previous.rating, record.rating, record.rating - previous.rating, null, record.rating < previous.rating ? "warning" : "info"));
  }
  if (record.stock_status !== previous.stock_status) {
    const severity = record.stock_status === "out_of_stock" ? "critical" : "warning";
    events.push(makeEvent(record, previous, record.stock_status === "out_of_stock" ? "STOCK_OUT" : "RESTOCKED", previous.stock_status, record.stock_status, null, null, severity));
  }
  if (record.product_status !== previous.product_status) {
    events.push(makeEvent(record, previous, record.product_status === "removed" ? "LISTING_REMOVED" : "LISTING_STATUS_CHANGED", previous.product_status, record.product_status, null, null, record.product_status === "removed" ? "critical" : "warning"));
  }
  for (const [field, eventType] of [["title_hash", "TITLE_CHANGED"], ["image_hash", "IMAGE_CHANGED"], ["description_hash", "DESCRIPTION_CHANGED"]]) {
    if (record[field] && previous[field] && record[field] !== previous[field]) {
      events.push(makeEvent(record, previous, eventType, previous[field], record[field], null, null, "warning"));
    }
  }
  const oldPromotion = JSON.stringify(previous.promotion_summary || {});
  const newPromotion = JSON.stringify(record.promotion_summary || {});
  if (oldPromotion !== newPromotion) {
    events.push(makeEvent(record, previous, "PROMOTION_CHANGED", previous.promotion_summary, record.promotion_summary, null, null, "warning"));
  }
  return events;
}

async function loadPreviousSnapshot(outputDirectory, captureDate, watchKey) {
  const files = (await readdir(outputDirectory).catch(() => []))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file) && file.slice(0, 10) < captureDate)
    .sort()
    .reverse();
  for (const file of files) {
    const data = JSON.parse(await readFile(join(outputDirectory, file), "utf8"));
    const match = data.records?.find((entry) => entry.watch_key === watchKey);
    if (match) return match;
  }
  return null;
}

async function collectPage(page, record, captureDate) {
  const snapshot = {
    watch_key: record.watch_key,
    capture_date: captureDate,
    captured_at: new Date().toISOString(),
    source_url: record.product_url,
    product_title: null,
    product_status: "unknown",
    price: null,
    price_min: null,
    price_max: null,
    original_price: null,
    discount_rate: null,
    currency: null,
    promotion_summary: { lines: [] },
    effective_price: null,
    sold_total: null,
    rating: null,
    review_count: null,
    stock_status: null,
    shipping_summary: { lines: [] },
    model_names: [],
    title_hash: null,
    image_hash: null,
    description_hash: null,
    capture_status: "failed",
    error_message: null,
  };

  try {
    await page.goto(record.product_url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const finalUrl = page.url();
    if (!/-i\.\d+\.\d+/i.test(finalUrl) || /\/verify\/(?:traffic|captcha)/i.test(finalUrl)) {
      snapshot.error_message = `商品页被重定向或未公开可见，最终地址: ${finalUrl}`;
      return snapshot;
    }
    const bodyText = await page.locator("body").innerText({ timeout: 15000 });
    if (/\b(?:login|log in|sign in|masuk)\b/i.test(bodyText) && !/\b(?:ratings?|sold|terjual)\b/i.test(bodyText)) {
      snapshot.error_message = "当前 Chrome 会话未登录或商品页未公开可见";
      return snapshot;
    }
    const titleLocator = page.locator("h1").first();
    const title = await titleLocator.count() ? await titleLocator.innerText().catch(() => "") : "";
    const prices = extractMoneyTokens(bodyText);
    const imageSources = await page.locator("img[src]").evaluateAll((elements) => elements.map((element) => element.getAttribute("src")).filter(Boolean));
    const modelNames = await page.locator("button").evaluateAll((elements) => elements.map((element) => element.textContent || "").map((value) => value.trim()).filter((value) => value && value.length < 80));
    const promotionLines = extractLines(bodyText, /voucher|flash sale|% off|discount|coins|free shipping|sale/i);
    const shippingLines = extractLines(bodyText, /shipping|delivery|guaranteed to get|free ongkir/i);
    const priceValues = prices.map(parseMoney).filter((value) => value != null);

    snapshot.product_title = title || await page.title();
    snapshot.product_status = parseListingStatus(bodyText);
    snapshot.price = priceValues[0] ?? null;
    snapshot.price_min = priceValues[0] ?? null;
    snapshot.price_max = priceValues[0] ?? null;
    snapshot.original_price = priceValues[1] ?? null;
    snapshot.currency = currencyFromText(prices[0] || "");
    snapshot.discount_rate = extractDiscount(bodyText);
    snapshot.promotion_summary = { lines: promotionLines.slice(0, 20), has_flash_sale: /flash sale/i.test(bodyText) };
    snapshot.effective_price = snapshot.price;
    snapshot.sold_total = extractSoldTotal(bodyText);
    snapshot.rating = extractRating(bodyText);
    snapshot.review_count = extractReviewCount(bodyText);
    snapshot.stock_status = parseStockStatus(bodyText);
    snapshot.shipping_summary = { lines: shippingLines.slice(0, 10) };
    snapshot.model_names = unique(modelNames.filter((value) => !/^(increase|decrease|buy now|add to cart|share|report)$/i.test(value))).slice(0, 100);
    snapshot.title_hash = hash(snapshot.product_title);
    snapshot.image_hash = hash(unique(imageSources).sort().join("\n"));
    snapshot.description_hash = hash((await page.locator('meta[name="description"]').getAttribute("content").catch(() => "")) || "");
    snapshot.capture_status = snapshot.product_title && snapshot.price != null ? "complete" : "partial";
    if (snapshot.capture_status === "partial") snapshot.error_message = "页面已加载，但标题或价格字段不完整";
  } catch (error) {
    snapshot.error_message = error instanceof Error ? error.message : String(error);
  }

  return snapshot;
}

const watchlistPath = resolve(requiredOption("--watchlist"));
const outputDirectory = resolve(option("--out-dir", "tmp/competitor-snapshots"));
const captureDate = option("--capture-date", utcDate());
const limit = Number(option("--limit", "0"));
const delayMilliseconds = Number(option("--delay-ms", "2500"));
const headed = process.argv.includes("--headed");
const chromeCdpUrl = option("--chrome-cdp-url") || process.env.CHROME_CDP_URL || null;
const watchlist = JSON.parse(await readFile(watchlistPath, "utf8"));
const records = (watchlist.records || []).filter((record) => record.enabled !== false && record.tracking_frequency === "daily");
const selectedRecords = limit > 0 ? records.slice(0, limit) : records;
await mkdir(outputDirectory, { recursive: true });

const browser = chromeCdpUrl
  ? await chromium.connectOverCDP(chromeCdpUrl)
  : await chromium.launch({ headless: !headed, executablePath: process.env.CHROME_BIN || undefined });
const context = chromeCdpUrl
  ? browser.contexts()[0]
  : await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
if (!context) throw new Error("Chrome CDP 未返回可用浏览器上下文");
const page = await context.newPage();
const snapshots = [];
const events = [];

try {
  for (const record of selectedRecords) {
    const snapshot = await collectPage(page, record, captureDate);
    const enriched = { ...snapshot, category: record.category, product_name: record.product_name, competitor_brand: record.competitor_brand, market: record.market, shop_id: record.shop_id, item_id: record.item_id };
    snapshots.push(enriched);
    const previous = await loadPreviousSnapshot(outputDirectory, captureDate, record.watch_key);
    events.push(...compareSnapshots(enriched, previous));
    if (delayMilliseconds > 0) await sleep(delayMilliseconds);
  }
} finally {
  await page.close();
  if (!chromeCdpUrl) await browser.close();
  else if (typeof browser.disconnect === "function") browser.disconnect();
}

const summary = {
  input_rows: records.length,
  collected_rows: snapshots.length,
  complete_rows: snapshots.filter((snapshot) => snapshot.capture_status === "complete").length,
  partial_rows: snapshots.filter((snapshot) => snapshot.capture_status === "partial").length,
  failed_rows: snapshots.filter((snapshot) => snapshot.capture_status === "failed").length,
  events: events.length,
};
const output = { schema_version: "competitor-snapshot-v1", capture_date: captureDate, generated_at: new Date().toISOString(), summary, records: snapshots, events };
const outputPath = join(outputDirectory, `${captureDate}.json`);
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, summary }));
