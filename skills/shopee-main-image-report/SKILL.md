---
name: shopee-main-image-report
description: Analyze a fixed list of public Shopee competitor links on a recurring cadence and generate a self-contained HTML report for main-image copy, scenes, visual order, claim weights, and changes between snapshots; do not use for new-product research, own-product launch planning, arbitrary product discovery, store analytics, or unauthorized/private data collection.
metadata:
  short-description: Track competitor main-image expression and trends
---

# Shopee Competitor Main-Image Monitor

Turn a user-supplied fixed list of Shopee competitor product links, or previously collected snapshots for that fixed list, into a periodic competitor visual-analysis report. The deliverable is a local `.html` file that can be opened in Chrome.

## Workflow

1. Extract the fixed competitor links from the user's message, CSV, Google Sheet export, or prior snapshot. Keep the supplied links as the only scope; do not discover additional products unless the user explicitly requests a separate discovery task.
2. For a new collection cycle, use the authorized browser workflow to read only publicly visible product-page data and normally returned image assets. Never read cookies, passwords, tokens, private browser storage, or bypass CAPTCHA, login gates, traffic verification, or platform restrictions.
3. Preserve the same competitor key across cycles. Record capture date, source URL, title, price, promotion, sold count, rating, review count, stock status, Model names, image order, image URLs, and capture errors.
4. Review each main image visually. Record all visible copy, language, image type, scene, text prominence, and claims. One image may contain multiple claims. Label model-generated, human-reviewed, and unreviewed records separately.
5. Compare the current cycle with prior supplied snapshots when available. Report added, removed, reordered, or materially changed images and changes to title, price, promotion, rating, reviews, sold count, stock, and Models. Missing historical data must be shown as unavailable, not treated as no change.
6. Rank normalized claims and scenes using occurrence across products, image sequence, visual prominence, repetition, and a gentle public-quality signal. Treat the ranking as competitor expression priority, not proof of efficacy or conversion causality.
7. Run the bundled report script:

   ```powershell
   node scripts/build-report.mjs --snapshot snapshot.json --previous previous-snapshot.json --annotations annotations.json --out competitor-main-image-report.html
   ```

   `--previous` and `--annotations` are optional. If running from outside the Skill directory, use absolute paths. For a recurring cycle, save the generated snapshot and report with the capture date; pass the preceding snapshot through `--previous` on the next run.
8. Open the generated HTML in Chrome. Check the collection scope, coverage, source links, image order, review queue, claim ranking, scene ranking, and any cycle-change notes before handing it off.

## Required report behavior

- Show fixed-link scope, market, category, capture date, number of competitors, number of images, annotation coverage, review status, capture errors, and source links.
- Preserve one evidence card per competitor with ordered main-image thumbnails and visible source URLs.
- Rank claims and scenes separately using the scoring method in [references/report-method.md](references/report-method.md).
- Show an ordered main-image expression map describing what competitors put in slots 1–8. Do not force category conclusions when the sample is small.
- Include a review queue for missing OCR, unclear language, uncertain scene, broken image, or conflicting annotations.
- If prior snapshots are supplied outside the script, describe the comparison as a time-series observation and keep “no data” separate from “no change”.
- Include limitations: competitor expression is not proof of efficacy, a single competitor is not category consensus, public quality signals are not sales truth, and local platform/compliance review remains required.

## Input contracts

Read [references/data-contract.md](references/data-contract.md) for snapshot and annotation fields. Read [references/report-method.md](references/report-method.md) when explaining scores, limitations, or periodic comparisons.

Do not load the new-product research contract for this Skill. Market opportunity, own-product facts, product positioning, detail-page planning, link matrices, Bundle strategy, and launch Roadmaps belong to `$shopee-new-product-analysis`.

## Output handoff

Return a clickable local HTML file path and state the capture date, fixed-link count, image count, annotation method, coverage, review queue, and any collection failures. If the user asks for a new product's main-image or detail-page plan, direct that request to `$shopee-new-product-analysis` instead of expanding this report.
