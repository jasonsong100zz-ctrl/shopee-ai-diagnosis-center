const networkPdpResponses = [];

window.addEventListener("fm-shopee-pdp-response", (event) => {
  try {
    const payload = JSON.parse(typeof event.detail === "string" ? event.detail : "{}");
    if (payload?.data) networkPdpResponses.push(payload);
    if (networkPdpResponses.length > 5) networkPdpResponses.shift();
  } catch {}
});

function installNetworkObserver() {
  if (!document.documentElement || !chrome?.runtime?.getURL) return;
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.onload = () => script.remove();
  script.onerror = () => script.remove();
  document.documentElement.appendChild(script);
}

installNetworkObserver();

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

function valuesBetweenAny(lines, startLabels, endLabels) {
  const start = lines.findIndex((line) => startLabels.some((label) => normalizeLabel(line) === normalizeLabel(label)));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && endLabels.some((label) => normalizeLabel(line) === normalizeLabel(label)));
  return lines.slice(start + 1, end < 0 ? start + 30 : end);
}

function variationOptions(lines) {
  return unique(valuesBetweenAny(lines, ["Shades", "Color", "Colors", "颜色", "Size", "规格", "型号", "Variation", "Model"], ["Quantity", "Add To Cart", "Buy Now", "Product Description"]))
    .filter((line) => line.length <= 100 && !/^(shades?|colors?|颜色|size|规格|型号|variation|model|quantity)$/i.test(line))
    .slice(0, 100);
}

function currentPriceState() {
  const prices = parseMoneyTokens(document.body?.innerText || "").map(money).filter(Boolean);
  return { price: prices[0]?.value ?? null, original_price: prices[1]?.value ?? null, currency: prices[0]?.currency || null };
}

function imageAssets() {
  return [...document.images].map((image, index) => {
    const rect = image.getBoundingClientRect();
    return {
      sequence: index + 1,
      source_url: image.currentSrc || image.src || "",
      alt_text: (image.alt || "").replace(/\s+/g, " ").trim(),
      natural_width: image.naturalWidth || null,
      natural_height: image.naturalHeight || null,
      displayed_width: Math.round(rect.width) || null,
      displayed_height: Math.round(rect.height) || null,
      displayed_x: Math.round(rect.x),
      displayed_y: Math.round(rect.y),
      visible: rect.width > 0 && rect.height > 0
    };
  }).filter((asset) => asset.source_url && asset.natural_width >= 160 && asset.natural_height >= 160)
    .filter((asset, index, list) => list.findIndex((candidate) => candidate.source_url === asset.source_url) === index)
    .slice(0, 40)
    .map((asset, index) => ({ ...asset, sequence: index + 1 }));
}

function numericModelValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object") return numericModelValue(value.value ?? value.amount ?? value.price);
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[^\d.,-]/g, "");
  if (!normalized) return null;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const decimalDigits = decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0;
  if (decimalDigits === 1 || decimalDigits === 2) {
    const integerPart = normalized.slice(0, decimalIndex).replace(/[.,]/g, "");
    const fractionPart = normalized.slice(decimalIndex + 1).replace(/[.,]/g, "");
    const parsed = Number(`${integerPart}.${fractionPart}`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(normalized.replace(/[.,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function modelValue(model, keys) {
  for (const key of keys) {
    const value = numericModelValue(model?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeModelPrice(value, basePrice) {
  if (value === null || !Number.isFinite(basePrice?.price) || basePrice.price <= 0) return value;
  if (value > basePrice.price * 1000) {
    const scaled = value / 100000;
    if (scaled > 0 && scaled < 100000000) return scaled;
  }
  return value;
}

function modelName(model) { return model?.name || model?.name_tr || model?.sku || model?.model_name || model?.modelName || null; }

function findNetworkModels(value, record, depth = 0) {
  if (!value || depth > 8) return [];
  if (Array.isArray(value)) {
    const modelList = value.filter((item) => item && typeof item === "object" && (item.model_id || item.modelid || item.skuId || item.sku_id || item.sku));
    if (modelList.length) return modelList;
    for (const item of value) {
      const result = findNetworkModels(item, record, depth + 1);
      if (result.length) return result;
    }
    return [];
  }
  if (typeof value !== "object") return [];
  if (Array.isArray(value.models)) {
    const modelList = findNetworkModels(value.models, record, depth + 1);
    if (modelList.length) return modelList;
  }
  const itemId = value.item_id ?? value.itemId;
  const shopId = value.shop_id ?? value.shopId;
  if ((itemId === undefined || String(itemId) === String(record.item_id)) && (shopId === undefined || String(shopId) === String(record.shop_id))) {
    for (const child of Object.values(value)) {
      const result = findNetworkModels(child, record, depth + 1);
      if (result.length) return result;
    }
  }
  return [];
}

function networkModelData(record) {
  for (const payload of [...networkPdpResponses].reverse()) {
    const models = findNetworkModels(payload.data, record);
    if (models.length) return models;
  }
  return [];
}

function embeddedModelData(record) {
  const script = [...document.scripts].find((node) => {
    const text = node.textContent || "";
    return text.includes("initialState") && text.includes("model_id") && text.trim().startsWith("{");
  });
  if (!script) return { models: [], tierVariations: [] };
  try {
    const data = JSON.parse(script.textContent || "{}");
    const cachedMap = data.initialState?.DOMAIN_PDP?.data?.PDP_BFF_DATA?.cachedMap || {};
    const directItem = cachedMap[`${record.shop_id}/${record.item_id}`]?.item;
    const item = directItem || Object.values(cachedMap).find((entry) => entry?.item?.item_id === Number(record.item_id))?.item;
    return { models: item?.models || [], tierVariations: item?.tier_variations || [] };
  } catch {
    return { models: [], tierVariations: [] };
  }
}

async function collect(record) {
  const bodyText = document.body?.innerText || "";
  const lines = linesOf(bodyText);
  const pageStatus = parsePageStatus(bodyText, location.href);
  if (pageStatus !== "product") return { status: pageStatus, error: `页面当前不可采集: ${location.href}` };
  const title = (document.querySelector("h1")?.innerText?.replace(/\s*Click to Copy\s*$/i, "").trim() || document.title).trim();
  const basePrice = currentPriceState();
  const ratingMatch = bodyText.match(/\b([0-5](?:[.,]\d)?)\s+(?:[\d.,]+[kmb]?\s+)?ratings?\b/i);
  const reviewMatch = bodyText.match(/\b([\d.,]+\s*[kmb]?)\s+ratings?\b/i);
  const soldMatch = bodyText.match(/(?:sold|terjual)\s*([\d.,]+\s*[kmb]?)/i) || bodyText.match(/([\d.,]+\s*[kmb]?)\s*(?:sold|terjual)/i);
  const promotionLines = unique(bodyText.split(/\r?\n/).filter((line) => /voucher|flash sale|% off|discount|coins|free shipping|sale/i.test(line))).slice(0, 20);
  const shippingLines = unique(bodyText.split(/\r?\n/).filter((line) => /shipping|delivery|guaranteed to get|free ongkir/i.test(line))).slice(0, 10);
  const voucherLines = valuesBetween(lines, "Shop Vouchers", ["Shipping", "Shopping Guarantee", "Shades"])
    .filter((line) => /off|min\. spend|used|valid|expiring|claim|voucher/i.test(line))
    .slice(0, 30);
  const categoryPath = valuesBetween(lines, "Category", ["Listing Date", "Seller", "Brand", "Product Specifications"]);
  const embeddedModels = embeddedModelData(record);
  const capturedNetworkModels = networkModelData(record);
  const sourceModels = capturedNetworkModels.length ? capturedNetworkModels : embeddedModels.models;
  const modelPriceSource = capturedNetworkModels.length ? "page_network_response" : embeddedModels.models.length ? "embedded_page_state" : "current_page_only";
  const skuNames = unique([...embeddedModels.models.map((model) => model.name || model.name_tr), ...variationOptions(lines)]).slice(0, 50);
  const modelPrices = sourceModels.map((model) => {
    const price = normalizeModelPrice(modelValue(model, ["priceLocal", "price_local", "price"]), basePrice);
    const originalPrice = normalizeModelPrice(modelValue(model, ["priceBeforeDiscountLocal", "price_before_discount_local", "price_before_discount", "priceBeforeDiscount"]), basePrice);
    return { model_id: model.model_id || model.modelid || model.skuId || model.sku_id || null, model_name: modelName(model), stock: model.stock ?? model.stock_num ?? model.stockNum ?? null, price, original_price: originalPrice, currency: basePrice.currency, capture_status: price === null ? "requires_selection" : "complete" };
  });
  const availableModelPrices = modelPrices.filter((model) => model.price !== null);
  const modelPriceCaptureStatus = modelPrices.length === 0 ? "unavailable" : availableModelPrices.length === modelPrices.length ? "complete" : "requires_selection";
  const modelPriceRange = modelPrices.length === 0
    ? { price_min: basePrice.price, price_max: basePrice.price }
    : modelPriceCaptureStatus === "complete"
      ? { price_min: Math.min(...availableModelPrices.map((item) => item.price)), price_max: Math.max(...availableModelPrices.map((item) => item.price)) }
      : { price_min: null, price_max: null };
  const productDescription = valuesBetween(lines, "Product Description", ["Product Ratings", "Customer Service"])
    .join(" ").slice(0, 10000);
  const productSpecifications = valuesBetweenAny(lines, ["Product Specifications"], ["Product Description", "Product Ratings", "Customer Service"]).slice(0, 100);
  const sellerMetricLines = unique(lines.filter((line) => /response rate|response time|followers?|shop rating|products?|joined|chat response|rating/i.test(line))).slice(0, 30);
  const policyLines = unique(lines.filter((line) => /return|refund|guarantee|warranty|payment|cash on delivery|protection/i.test(line))).slice(0, 30);
  const imageAssetList = imageAssets();
  const imageSources = unique(imageAssetList.map((image) => image.source_url));
  const imageAltTexts = unique(imageAssetList.map((image) => image.alt_text)).slice(0, 100);
  const videoSources = unique([...document.querySelectorAll("video")].map((video) => video.currentSrc || video.src || ""));
  const snapshot = {
    watch_key: record.watch_key,
    capture_date: new Date().toISOString().slice(0, 10),
    captured_at: new Date().toISOString(),
    source_url: location.href,
    product_title: title || null,
    product_status: /sold out|out of stock|stok habis|habis terjual/i.test(bodyText) ? "out_of_stock" : "active",
    price: basePrice.price,
    price_min: modelPriceRange.price_min,
    price_max: modelPriceRange.price_max,
    original_price: basePrice.original_price,
    discount_rate: Math.abs(Number(bodyText.match(/(?:^|\s)(-?\d{1,3})%/)?.[1] || 0)) / 100 || null,
    currency: basePrice.currency,
    promotion_summary: { lines: promotionLines, has_flash_sale: /flash sale/i.test(bodyText) },
    effective_price: basePrice.price,
    sold_total: soldMatch ? compactNumber(soldMatch[1]) : null,
    rating: ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null,
    review_count: reviewMatch ? compactNumber(reviewMatch[1]) : null,
    stock_status: /sold out|out of stock|stok habis|habis terjual/i.test(bodyText) ? "out_of_stock" : "available",
    shipping_summary: { lines: shippingLines },
    model_names: skuNames,
    model_prices: modelPrices,
    model_price_capture_status: modelPriceCaptureStatus,
    model_price_source: modelPriceSource,
    seller_name: valueAfterLabel(lines, "Seller"),
    brand_name: valueAfterLabel(lines, "Brand"),
    category_path: categoryPath,
    listing_date: valueAfterLabel(lines, "Listing Date"),
    product_specifications: productSpecifications,
    seller_metrics: { lines: sellerMetricLines },
    visible_policies: { lines: policyLines },
    voucher_lines: voucherLines,
    product_description: productDescription || null,
    image_count: imageSources.length,
    image_sources: imageSources,
    image_assets: imageAssetList,
    image_alt_texts: imageAltTexts,
    video_count: videoSources.length,
    review_summary: {
      rating: ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null,
      review_count: reviewMatch ? compactNumber(reviewMatch[1]) : null,
      breakdown: lines.filter((line) => /^(All|[1-5] Star|With Comments|With Media)/i.test(line)).slice(0, 20)
    },
    source_capture_mode: "chrome-extension-user-session",
    title_hash: await digest(title),
    image_hash: await digest(imageSources.sort().join("\n")),
    description_hash: await digest(productDescription || document.querySelector('meta[name="description"]')?.content || ""),
    capture_status: title && basePrice.price !== null ? "complete" : "partial",
    error_message: title && basePrice.price !== null ? null : "页面已加载，但标题或价格字段不完整"
  };
  return { status: "collected", snapshot };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "COLLECT_COMPETITOR") return undefined;
  collect(message.record).then(sendResponse).catch((error) => sendResponse({ status: "error", error: String(error) }));
  return true;
});
