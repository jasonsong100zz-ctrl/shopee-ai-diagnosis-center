---
name: fm-shopee-competitor-monitor
description: Configure, build, run, and extend fixed-link Shopee competitor monitoring with SKU-level prices, offline CSV export, and optional per-user cloud synchronization. Use for a supplied Shopee link list; do not use it for arbitrary product discovery, keyword ranking, or private competitor analytics.
metadata:
  short-description: Fixed-link Shopee tracking with SKU and cloud sync
---

# FM Shopee Competitor Monitor

Use this skill when the user has a watchlist of Shopee product URLs and needs repeatable daily snapshots, SKU-level price comparison, an installable Chrome extension, CSV output, or a user-owned cloud upload endpoint.

The Skill includes the FM Chrome extension source under `assets/chrome-extension/`. Use [references/chrome-session.md](references/chrome-session.md) to install or connect it to the user's existing Chrome profile before collecting.

## Operating boundary

- Treat supplied product URLs as the complete watchlist. Do not discover unrelated shops or products.
- Preserve `market`, `shop_id`, `item_id`, and `model_id` as stable identity fields. Do not match products by title alone.
- Collect only publicly visible page data or data already returned to the user's authorized browser page.
- Do not bypass CAPTCHA, login, traffic verification, rate limits, or platform restrictions. Pause for manual handling when Shopee presents a verification screen.
- Treat cumulative sold count as a page-visible sales proxy, not verified orders, GMV, traffic, conversion, or inventory truth.
- Keep local CSV output even when cloud synchronization fails.
- Never place Google service-account JSON, BigQuery private keys, or a user's real token in source code, a skill package, a Git commit, or a Chrome extension archive.
- When the user asks to use an already logged-in Chrome, prefer the Chrome browser control surface and the FM extension in that same Chrome profile. Do not select the in-app browser, Midscene, headless Chromium, or a new isolated profile as the default.
- A Chromium unpacked extension cannot be silently installed by a Skill. Prepare the extension, open `chrome://extensions`, and complete the one-time “Load unpacked” action with the user or an approved Chrome UI automation. Never claim that installation succeeded until the FM extension is visible in Chrome.

## Choose the workflow

1. For a new or changed watchlist, read [references/business-config.md](references/business-config.md), validate required columns, and normalize Shopee identifiers.
2. For an existing logged-in Chrome session or extension installation, read [references/chrome-session.md](references/chrome-session.md) and [references/extension-install.md](references/extension-install.md). Use the bundled `assets/chrome-extension/` source and `scripts/install-chrome-extension.ps1` when available.
3. For SKU pricing or multi-SKU behavior, preserve one exported row per SKU and read the SKU rules in [references/business-config.md](references/business-config.md).
4. For Drive, Sheets, BigQuery, or a personal API endpoint, read [references/cloud-sync.md](references/cloud-sync.md).
5. For daily or recurring execution, read [references/scheduling.md](references/scheduling.md) before creating a Codex automation or a server scheduler.
6. For onboarding a new operator or handing the workflow to business users, read [references/new-user-sop.md](references/new-user-sop.md).
7. For a code change, test the smallest affected JavaScript files first, then run the repository's validation and rebuild the extension package.

## Default product behavior

- Default to manual-start, offline collection and downloadable UTF-8 CSV through the user's existing Chrome profile. The Skill must not silently create or switch to a separate login profile.
- Read SKU prices from the page's normal PDP response when available; do not replay the endpoint or click every SKU automatically.
- Normalize Shopee's enlarged local-price units before calculating values. If the unit cannot be verified, keep the price null and mark the quality status.
- Export one row for each SKU. Repeat product-level fields on each row and include `SKU ID`, `SKU名称`, `SKU价格`, `SKU原价`, `SKU库存`, and `SKU价格状态`.
- Keep `最低SKU价格` and `最高SKU价格` as product-level summaries only when all SKU prices are verified. Never use the currently selected SKU as a false range.
- Preserve failure rows and explain whether the failure came from login, CAPTCHA/traffic verification, redirect, missing page fields, or a cloud upload error.

## Business customization

Business-specific fields, alert thresholds, market domains, output columns, and sync destinations are configuration decisions. Read [references/business-config.md](references/business-config.md) before changing them. Keep platform identity fields and data-quality statuses even when the business removes optional display columns.

## Delivery expectations

When changing this workflow, report the changed files, the install/package path, validation results, and any fields that remain unavailable. If the user asks to publish or push changes, confirm the target and include the commit or release reference; otherwise do not create external commits or releases automatically.
