function compactNumber(value) {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").toLowerCase();
  const suffix = normalized.match(/[kmb]$/)?.[0] || "";
  const numberPart = normalized.replace(/[kmb]$/, "");
  const numeric = Number(numberPart.replace(/\.(?=\d{3}(?:\.|$))/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * ({ k: 1e3, m: 1e6, b: 1e9, "": 1 }[suffix])) : null;
}

function money(value) {
  if (!value) return null;
  const currency = value.match(/(Rp|RM|฿|₫|₱|S\$|NT\$|R\$)/i)?.[1]?.toUpperCase() || null;
  const digits = value.replace(/[^0-9.,]/g, "");
  const numeric = Number(digits.replace(/[.,]/g, ""));
  return digits && Number.isFinite(numeric) ? { currency, value: numeric } : null;
}

function unique(values) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }

async function digest(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value || ""));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parsePageStatus(text, url) {
  const lower = `${url}\n${text}`.toLowerCase();
  if (/\/verify\/(captcha|traffic)/i.test(url) || lower.includes("captcha") || lower.includes("verify traffic")) return "captcha";
  if (/\b(?:login|log in|sign in|masuk)\b/i.test(text) && !/\b(?:ratings?|sold|terjual)\b/i.test(text)) return "login";
  if (!/-i\.\d+\.\d+/i.test(url)) return "redirected";
  return "product";
}

function parseMoneyTokens(text) { return unique(text.match(/(?:Rp|RM|฿|₫|₱|S\$|NT\$|R\$)\s*[\d.,]+/gi) || []); }

function linesOf(text) { return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }

function normalizeLabel(value) { return value.toLowerCase().replace(/:$/, ""); }

function valueAfterLabel(lines, label) {
  const normalized = normalizeLabel(label);
  const index = lines.findIndex((line) => normalizeLabel(line) === normalized);
  return index >= 0 ? lines[index + 1] || null : null;
}

function valuesBetween(lines, startLabel, endLabels) {
  const start = lines.findIndex((line) => normalizeLabel(line) === normalizeLabel(startLabel));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && endLabels.some((label) => normalizeLabel(line) === normalizeLabel(label)));
  return lines.slice(start + 1, end < 0 ? start + 20 : end);
}

async function collect(record) {
  const bodyText = document.body?.innerText || "";
  const lines = linesOf(bodyText);
  const pageStatus = parsePageStatus(bodyText, location.href);
  if (pageStatus !== "product") return { status: pageStatus, error: `页面当前不可采集: ${location.href}` };
  const title = (document.querySelector("h1")?.innerText?.replace(/\s*Click to Copy\s*$/i, "").trim() || document.title).trim();
  const prices = parseMoneyTokens(bodyText).map(money).filter(Boolean);
  const ratingMatch = bodyText.match(/\b([0-5](?:[.,]\d)?)\s+(?:[\d.,]+[kmb]?\s+)?ratings?\b/i);
  const reviewMatch = bodyText.match(/\b([\d.,]+\s*[kmb]?)\s+ratings?\b/i);
  const soldMatch = bodyText.match(/(?:sold|terjual)\s*([\d.,]+\s*[kmb]?)/i) || bodyText.match(/([\d.,]+\s*[kmb]?)\s*(?:sold|terjual)/i);
  const promotionLines = unique(bodyText.split(/\r?\n/).filter((line) => /voucher|flash sale|% off|discount|coins|free shipping|sale/i.test(line))).slice(0, 20);
  const shippingLines = unique(bodyText.split(/\r?\n/).filter((line) => /shipping|delivery|guaranteed to get|free ongkir/i.test(line))).slice(0, 10);
  const voucherLines = valuesBetween(lines, "Shop Vouchers", ["Shipping", "Shopping Guarantee", "Shades"])
    .filter((line) => /off|min\. spend|used|valid|expiring|claim|voucher/i.test(line))
    .slice(0, 30);
  const categoryPath = valuesBetween(lines, "Category", ["Listing Date", "Seller", "Brand", "Product Specifications"]);
  const skuNames = valuesBetween(lines, "Shades", ["Quantity", "Add To Cart", "Buy Now"])
    .filter((line) => !/^(shades|quantity)$/i.test(line))
    .slice(0, 50);
  const productDescription = valuesBetween(lines, "Product Description", ["Product Ratings", "Customer Service"])
    .join(" ").slice(0, 10000);
  const imageSources = unique([...document.images].map((image) => image.currentSrc || image.src));
  const snapshot = {
    watch_key: record.watch_key,
    capture_date: new Date().toISOString().slice(0, 10),
    captured_at: new Date().toISOString(),
    source_url: location.href,
    product_title: title || null,
    product_status: /sold out|out of stock|stok habis|habis terjual/i.test(bodyText) ? "out_of_stock" : "active",
    price: prices[0]?.value ?? null,
    price_min: prices[0]?.value ?? null,
    price_max: prices[0]?.value ?? null,
    original_price: prices[1]?.value ?? null,
    discount_rate: Math.abs(Number(bodyText.match(/(?:^|\s)(-?\d{1,3})%/)?.[1] || 0)) / 100 || null,
    currency: prices[0]?.currency || null,
    promotion_summary: { lines: promotionLines, has_flash_sale: /flash sale/i.test(bodyText) },
    effective_price: prices[0]?.value ?? null,
    sold_total: soldMatch ? compactNumber(soldMatch[1]) : null,
    rating: ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null,
    review_count: reviewMatch ? compactNumber(reviewMatch[1]) : null,
    stock_status: /sold out|out of stock|stok habis|habis terjual/i.test(bodyText) ? "out_of_stock" : "available",
    shipping_summary: { lines: shippingLines },
    model_names: skuNames,
    seller_name: valueAfterLabel(lines, "Seller"),
    brand_name: valueAfterLabel(lines, "Brand"),
    category_path: categoryPath,
    listing_date: valueAfterLabel(lines, "Listing Date"),
    voucher_lines: voucherLines,
    product_description: productDescription || null,
    review_summary: {
      rating: ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null,
      review_count: reviewMatch ? compactNumber(reviewMatch[1]) : null,
      breakdown: lines.filter((line) => /^(All|[1-5] Star|With Comments|With Media)/i.test(line)).slice(0, 20)
    },
    source_capture_mode: "chrome-extension-user-session",
    title_hash: await digest(title),
    image_hash: await digest(imageSources.sort().join("\n")),
    description_hash: await digest(document.querySelector('meta[name="description"]')?.content || ""),
    capture_status: title && prices[0] ? "complete" : "partial",
    error_message: title && prices[0] ? null : "页面已加载，但标题或价格字段不完整"
  };
  return { status: "collected", snapshot };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "COLLECT_COMPETITOR") return undefined;
  collect(message.record).then(sendResponse).catch((error) => sendResponse({ status: "error", error: String(error) }));
  return true;
});
