# Data Contract

## Snapshot

```json
{
  "schema_version": "competitor-snapshot-v1",
  "capture_date": "2026-08-24",
  "records": [
    {
      "watch_key": "ID:shop:item:",
      "source_url": "https://shopee.co.id/...",
      "product_title": "Visible product title",
      "category": "Category",
      "competitor_brand": "Brand",
      "market": "ID",
      "sold_total": 0,
      "rating": 0,
      "review_count": 0,
      "image_assets": [
        {
          "sequence": 1,
          "source_url": "https://down-id.img.susercontent.com/file/...",
          "alt_text": "",
          "natural_width": 1024,
          "natural_height": 1024,
          "displayed_width": 512,
          "displayed_height": 512,
          "visible": true
        }
      ]
    }
  ]
}
```

Only use image URLs observed in the supplied product page or supplied files. A missing field is `null` or empty; do not infer product facts from the title.

## Annotation

```json
{
  "schema_version": "image-annotations-v1",
  "model": "human-visual-review",
  "review_method": "Chrome screenshot review",
  "records": [
    {
      "watch_key": "ID:shop:item:",
      "images": [
        {
          "sequence": 1,
          "source_url": "https://...",
          "text": "All important visible copy",
          "claims": [
            {
              "text": "Evidence-backed visible phrase",
              "normalized_claim": "makeup_removal",
              "claim_type": "feature",
              "confidence": 0.9,
              "needs_review": false,
              "review_reason": ""
            }
          ],
          "language": "mixed",
          "image_type": "hero",
          "scene": "Daily cleansing",
          "text_area_ratio": 0.2,
          "font_size_ratio": 0.1,
          "visual_emphasis": 0.9,
          "is_headline": true,
          "confidence": 0.9,
          "needs_review": false,
          "review_reason": ""
        }
      ]
    }
  ]
}
```

## Product input

```json
{
  "product_name": "Own new product",
  "category": "Category",
  "market": "ID",
  "target_users": ["Sensitive skin users"],
  "product_facts": ["Fact stated by the user"],
  "proof_points": ["Test, certificate, or ingredient evidence"],
  "required_messages": ["Must communicate"],
  "claims_to_avoid": ["Do not say"],
  "available_assets": ["Product bottle photo", "Usage photo"],
  "price_band": "Optional"
}
```

Product images can be supplied separately as local paths, but the report must label them as user-provided assets and must not treat them as competitor evidence.
