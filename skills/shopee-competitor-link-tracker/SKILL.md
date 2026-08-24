---
name: shopee-competitor-link-tracker
description: Read a Google Sheet of Shopee competitor product links, normalize market/shop/item identifiers, design or run daily product snapshots, calculate changes, and produce actionable alerts. Use for fixed-link competitor monitoring; do not treat it as a substitute for authorized own-store analytics or keyword-rank tracking.
---

# Shopee Competitor Link Tracker

Use this skill when the user has a list of Shopee product URLs and wants recurring price, promotion, sales-proxy, review, stock, or Listing-change tracking.

## Operating boundary

- Treat the supplied link list as a watchlist, not as permission to discover arbitrary products or shops.
- Read public Google Sheets through the CSV export endpoint when the sheet is link-accessible; use the Google Sheets API only when the sheet is private and the user provides an authorized integration.
- Preserve `market`, `shop_id`, `item_id`, and optional `model_id` as the stable identity. Do not match products by title alone.
- Keep observed values separate from derived values. `sold_total` and its daily delta are page-visible sales proxies, not verified orders or GMV.
- Do not claim access to competitor traffic, conversion, ad spend, ROAS, exact inventory, or backend metrics.
- Use an allowed public page or licensed data source. Do not bypass CAPTCHA, authentication, rate limits, or platform restrictions.

## Workflow

1. Read and validate the watchlist. Required fields are `品类`, `产品`, `竞对品牌`, and `竞品链接`; optional controls are `market`, `enabled`, `priority`, `own_product_id`, `target_model`, and `tracking_frequency`.
2. Normalize each URL to a canonical record. Parse Shopee URLs containing `-i.<shop_id>.<item_id>`, derive the market from the hostname when it is absent, and reject malformed or unsupported links.
3. Store the normalized watchlist separately from daily snapshots. Use one snapshot per enabled link and capture date; keep raw source URL, capture status, error details, and content hashes.
4. Compare the latest successful snapshot with the prior successful snapshot. Emit price, promotion, sold-proxy, review, rating, stock, listing-status, and content-change events.
5. Present the result as a daily change report, with data quality and unavailable metrics clearly labeled.

## Current project integration

For the Shopee AI diagnosis center, use the migration in `supabase/migrations/202608210001_competitor_link_tracking.sql`, the importer in `scripts/import-competitor-links.mjs`, the collector in `scripts/collect-competitor-snapshots.mjs`, and the publisher in `scripts/publish-competitor-snapshots.mjs` when those files exist in the project. Keep competitor rows scoped by `workspace_id`; do not merge them into owned-store order, advertising, or promotion facts.

Read [references/schema.md](references/schema.md) when creating migrations, import mappings, or dashboard queries.

## Daily MVP fields

Track product title/status, model-aware price, original price, discount, visible promotion summary, effective-price estimate, cumulative sold count, rating, review count, stock status, shipping summary, source URL, capture status, and title/image/description hashes. Add keyword rank only in a separate job whose keyword, market, category, sort method, and capture context are fixed.

## Alert defaults

- Price movement: flag a decrease or increase of at least 5%.
- Price position: flag when a competitor effective price is at least 8% below the linked owned product.
- Sales proxy: flag when one-day sold delta is at least 1.5 times the prior seven-day average, only when both periods have valid observations.
- Inventory: flag out-of-stock, restock, partial-model stock changes, and repeated collection failures.
- Listing: flag title, image, description, model, promotion, or status changes.

When the source cannot provide a field, store null plus a data-quality reason instead of zero.
