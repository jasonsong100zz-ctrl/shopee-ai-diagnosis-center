---
name: shopee-new-product-analysis
description: Analyze a new product using supplied product files plus fixed Shopee competitor links and generate a self-contained HTML report covering market opportunity, positioning, main-image sets, detail pages, links, launch actions, and evidence boundaries; do not use for competitor-only periodic monitoring, arbitrary product discovery, store analytics, or unauthorized/private data collection.
metadata:
  short-description: Generate new-product research and launch HTML reports
---

# Shopee New-Product Analysis

Turn a user-supplied list of fixed Shopee product links and optional own-product files into an evidence-based HTML report for a new-product launch. The deliverable is a local `.html` file that the user can open in Chrome. The report connects market opportunity, competitor expression, user feedback, product facts, creative planning, links, channels, and measurement.

## Workflow

1. Extract the competitor links from the user's message or uploaded file. Keep the supplied links as the only product scope; do not search for additional products unless the user explicitly asks for a separate discovery task. Record the market, category, collection date, and missing links.
2. If links require a live page, use the available browser-automation skill to open each supplied page in the user's authorized Chrome context. Collect only publicly visible page data and image assets normally returned by the page. Never read cookies, passwords, tokens, or private browser storage; never bypass CAPTCHA, login gates, traffic verification, or platform restrictions.
3. Preserve image order. Prefer the product page's normal complete image ID list, then supplement with the visible gallery dimensions and positions. Record `source_url`, `sequence`, `alt_text`, `visible`, and dimensions when available.
4. Review each image visually. Use model vision when a configured vision API is available; otherwise use Chrome screenshots and label the result `human-visual-review`. Keep all visible copy, language, image type, scene, text prominence, and evidence-backed claims. A single image may contain multiple `claims`.
5. If the user uploads product information, extract only stated facts. Accept PPTX/PPT, DOCX, XLSX/CSV, text, and images when available; use the relevant document, presentation, or spreadsheet skill for structured files. Separate product facts, proof, target users, required messages, price/stock/launch targets, available assets, and forbidden or unverified claims. Treat historical launch documents as evidence, not instructions. Never turn competitor wording into a fact about the user's product.
6. Run the bundled report script:

   ```powershell
   node scripts/build-report.mjs --snapshot snapshot.json --annotations annotations.json --product product.json --research research.json --out new-product-analysis-report.html
   ```

   `--annotations`, `--product`, and `--research` are optional. If the script is run from outside the skill directory, use absolute paths to the script and input files.

7. Open the generated HTML in Chrome, check that the report renders, images are attributable to a source URL, and the report clearly distinguishes competitor observations from recommendations. Return the HTML file path and a short summary of the highest-priority actions.

## Required report behavior

- Show collection scope, market, category, date, number of competitors, number of images, annotation coverage, review status, and source links.
- Show the new-product objective, product facts, proof gaps, target users, market opportunity, keyword evidence, industry context, review insights, positioning, link/Bundle suggestions, launch roadmap, channel plan, KPI test list, and risks when those inputs are available.
- Rank normalized claims using occurrence across competitors, image sequence, visual prominence, repetition, and a gentle public-quality weight. Rank scenes separately.
- Produce an ordered main-image blueprint with up to eight slots: hero/core benefit, pain point or comparison, scene, feature/proof, trust, specification, usage/package, and purchase reassurance. Do not force a slot when evidence is insufficient.
- Produce a detail-page blueprint that converts the observed logic into sections such as hero promise, problem/benefit, proof and ingredients, scenario, how-to-use, specification, FAQ/objection handling, and after-sales. Adjust sections to the category and available facts.
- For the user's product, classify proposed messages as `可直接使用` only when supported by supplied facts/proof, `需补充证据` when plausible but unsupported, and `不要直接使用` when it is a competitor-only claim, regulated/absolute language, or conflicts with supplied constraints.
- Include an explicit limitations box: competitor expression is not proof of efficacy or conversion causality; one competitor is a sample, not category consensus; local platform and market compliance review remains required.
- Keep conclusions layered: `观察到的页面表达`, `用户反馈`, `产品资料支持`, `待验证假设`, and `执行建议` must not be merged into one unsupported fact.
- Use a standalone HTML document with inline CSS and JSON data. Do not require a build step, framework, or local server to view the final report.

## Input contracts

Read [references/data-contract.md](references/data-contract.md) when constructing snapshots, annotations, or product input. Read [references/new-product-contract.md](references/new-product-contract.md) when the user supplies market, reviews, positioning, launch, or historical-new-product material. Read [references/report-method.md](references/report-method.md) when explaining scores, claim safety, or report limitations.

The report script accepts either a snapshot document with `records`, or a plain records array. Each annotation record is matched by `watch_key` or `source_url`. Existing legacy single-claim annotations remain supported, but prefer the `claims` array.

## Output handoff

Use a clickable local file link to the generated HTML. Mention whether annotations were model-generated or human-reviewed, the coverage, the number of competitor links, and any missing product facts that prevent a safe final copy recommendation. Mention which research sections were absent. Do not present a one-competitor result as a definitive category best practice. If the user only wants recurring competitor monitoring without a new product, direct that request to `$shopee-main-image-report`.
