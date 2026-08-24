# Business Configuration

## Watchlist input

The default Google Sheet or CSV must contain:

| Column | Required | Meaning |
| --- | --- | --- |
| `品类` | yes | Business category |
| `产品` | yes | Internal product type or name |
| `竞对品牌` | yes | Competitor brand |
| `竞品链接` | yes | Shopee product detail URL |

Optional controls include `market`, `enabled`, `priority`, `target_model`, `tracking_frequency`, and `notes`.

Normalize each URL containing `-i.<shop_id>.<item_id>`. Keep the original URL for audit, but use a canonical URL and stable `market/shop_id/item_id` identity for joins. A row with `enabled` set to `false`, `0`, `no`, `否`, or `停用` is excluded.

## Product and SKU output

Use a product-plus-SKU row model. Every SKU row repeats product-level fields and contains:

- `SKU ID`
- `SKU名称`
- `SKU价格`
- `SKU原价`
- `SKU库存`
- `SKU价格状态`

Recommended product-level fields are `采集日期`, `市场`, `商品链接`, `店铺ID`, `商品ID`, `商品标题`, `当前价格`, `原价`, `折扣率`, `币种`, `最低SKU价格`, `最高SKU价格`, `库存状态`, `累计已售代理值`, `评分`, `评论数`, `促销摘要`, `优惠券`, `配送摘要`, `采集状态`, and `失败原因`.

`当前价格` means the price visible for the currently selected page state. It is not automatically the price of every SKU. `最低SKU价格` and `最高SKU价格` are filled only if every recognized SKU has a verified price; otherwise both are null or blank and the row quality state explains why.

## Price quality

Shopee and related page responses can represent `priceLocal` as an enlarged integer. Normalize only when the scale is evidenced by the page response and the visible page price. For example, `4300000000` may represent `43000` under a `100000` scale. Never blindly divide all prices by a fixed number without checking the market and response shape.

Valid statuses:

- `已确认`: SKU price was obtained from a normal page response or other verifiable page data.
- `需选择确认`: the SKU was identified but its price was not provided without selecting it.
- `未识别 SKU`: no SKU model list was obtained.
- `价格未完整提供`: the product has models but not all model prices are available.

## Recommended alerts

Use a 5% price movement alert, an 8% owned-product price-position alert, and inventory alerts for out-of-stock, restock, and partial-model changes only when the source field is valid. Keep thresholds configurable by business rather than hard-coding them into the skill.
