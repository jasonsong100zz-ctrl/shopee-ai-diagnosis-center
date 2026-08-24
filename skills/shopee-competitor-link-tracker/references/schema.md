# Competitor Link Tracking Schema

## Watchlist import mapping

| Google Sheet column | Normalized field | Required |
| --- | --- | --- |
| `品类` | `category` | yes |
| `产品` | `product_name` | yes |
| `竞对品牌` | `competitor_brand` | yes |
| `竞品链接` | `product_url` | yes |
| `market` | `market` | no; derive from host |
| `enabled` | `enabled` | no; default `true` |
| `priority` | `priority` | no; default `medium` |
| `own_product_id` | `own_product_id` | no |
| `target_model` | `target_model` | no |
| `tracking_frequency` | `tracking_frequency` | no; default `daily` |
| `notes` | `notes` | no |

## Stable identity

Use `market + shop_id + item_id + model_id` when a Model is explicitly tracked. Without a Model, use `market + shop_id + item_id`. Keep the original URL because the title segment is useful for audit but is not a stable identifier.

## Snapshot versus event

Snapshots hold the observed state at a capture time. Events hold the difference between two successful snapshots. A missing observation is not a zero and should not create a business decline event.

## Minimum snapshot fields

`captured_at`, `capture_date`, `product_title`, `product_status`, `price`, `price_min`, `price_max`, `original_price`, `discount_rate`, `currency`, `promotion_summary`, `effective_price`, `sold_total`, `rating`, `review_count`, `stock_status`, `shipping_summary`, `title_hash`, `image_hash`, `description_hash`, `source_url`, `capture_status`, `error_message`, and `raw_hash`.

## Data-quality labels

- `complete`: all required page fields were observed.
- `partial`: the page loaded but one or more optional fields were unavailable.
- `failed`: no reliable product observation was obtained.
- `stale`: the latest successful observation is outside the configured collection window.
