import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const requiredColumns = ["品类", "产品", "竞对品牌", "竞品链接"];
const marketByHost = new Map([
  ["shopee.co.id", "ID"],
  ["shopee.com.my", "MY"],
  ["shopee.sg", "SG"],
  ["shopee.co.th", "TH"],
  ["shopee.ph", "PH"],
  ["shopee.vn", "VN"],
  ["shopee.tw", "TW"],
  ["shopee.com.br", "BR"],
  ["shopee.com.mx", "MX"],
]);

function readOption(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((cells, rowIndex) => Object.fromEntries(
    headers.map((header, columnIndex) => [header, (cells[columnIndex] || "").trim()]),
  )).map((record, rowIndex) => ({ ...record, source_row: rowIndex + 2 }));
}

function parseBoolean(value, fallback = true) {
  if (!value) return fallback;
  if (["false", "0", "no", "n", "否", "停用"].includes(value.toLowerCase())) return false;
  if (["true", "1", "yes", "y", "是", "启用"].includes(value.toLowerCase())) return true;
  return fallback;
}

function marketFromHost(host) {
  return marketByHost.get(host.toLowerCase()) || null;
}

function normalizeRecord(record) {
  const errors = [];
  const rawUrl = record["竞品链接"];
  let parsedUrl;
  let shopId = null;
  let itemId = null;
  let derivedMarket = null;

  if (!rawUrl) {
    errors.push("竞品链接为空");
  } else {
    try {
      parsedUrl = new URL(rawUrl);
      derivedMarket = marketFromHost(parsedUrl.hostname);
      if (!derivedMarket) errors.push(`不支持的 Shopee 域名: ${parsedUrl.hostname}`);
      const match = parsedUrl.pathname.match(/-i\.(\d+)\.(\d+)(?:$|[/?#])/i);
      if (!match) errors.push("链接中未找到 -i.<shop_id>.<item_id> 标识");
      if (match) {
        shopId = match[1];
        itemId = match[2];
      }
    } catch {
      errors.push("竞品链接不是有效 URL");
    }
  }

  const suppliedMarket = (record.market || "").trim().toUpperCase();
  if (suppliedMarket && derivedMarket && suppliedMarket !== derivedMarket) {
    errors.push(`market=${suppliedMarket} 与域名市场 ${derivedMarket} 不一致`);
  }

  for (const column of requiredColumns) {
    if (!record[column]) errors.push(`${column} 为空`);
  }

  const market = suppliedMarket || derivedMarket;
  const canonicalUrl = parsedUrl ? `${parsedUrl.origin}${parsedUrl.pathname}` : rawUrl || null;
  return {
    record: errors.length > 0 ? null : {
      source_row: record.source_row,
      category: record["品类"],
      product_name: record["产品"],
      competitor_brand: record["竞对品牌"],
      product_url: canonicalUrl,
      market,
      shop_id: shopId,
      item_id: itemId,
      model_id: record.model_id || null,
      enabled: parseBoolean(record.enabled, true),
      priority: record.priority || "medium",
      own_product_id: record.own_product_id || null,
      target_model: record.target_model || null,
      tracking_frequency: record.tracking_frequency || "daily",
      notes: record.notes || null,
      watch_key: `${market}:${shopId}:${itemId}:${record.model_id || ""}`,
    },
    errors,
  };
}

async function readInput() {
  const inputUrl = readOption("--url");
  const inputFile = readOption("--file");
  if (!inputUrl && !inputFile) throw new Error("请提供 --url 或 --file");
  if (inputUrl && inputFile) throw new Error("--url 与 --file 只能使用一个");
  if (inputUrl) {
    const response = await fetch(inputUrl);
    if (!response.ok) throw new Error(`读取 Google Sheet 失败: HTTP ${response.status}`);
    return { source: inputUrl, text: await response.text() };
  }
  return { source: resolve(inputFile), text: await readFile(resolve(inputFile), "utf8") };
}

const outputPath = resolve(readOption("--out", "competitor-watchlist.json"));
const input = await readInput();
const rows = parseCsv(input.text);
if (rows.length === 0) throw new Error("CSV 没有数据行");

const missingHeaders = requiredColumns.filter((column) => !(column in rows[0]));
if (missingHeaders.length > 0) throw new Error(`缺少必需列: ${missingHeaders.join(", ")}`);

const records = [];
const errors = [];
const seen = new Map();
for (const row of rows) {
  const result = normalizeRecord(row);
  if (result.errors.length > 0) {
    errors.push({ source_row: row.source_row, messages: result.errors });
    continue;
  }
  if (seen.has(result.record.watch_key)) {
    errors.push({ source_row: row.source_row, messages: [`与第 ${seen.get(result.record.watch_key)} 行重复`] });
    continue;
  }
  seen.set(result.record.watch_key, row.source_row);
  records.push(result.record);
}

const result = {
  generated_at: new Date().toISOString(),
  source: input.source,
  input_rows: rows.length,
  valid_rows: records.length,
  error_rows: errors.length,
  records,
  errors,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, input_rows: rows.length, valid_rows: records.length, error_rows: errors.length }));
if (errors.length > 0) process.exitCode = 1;
