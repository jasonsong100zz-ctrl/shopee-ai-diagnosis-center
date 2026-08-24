# 输入契约

## 支持格式

支持 `.xlsx`、`.csv`、`.tsv`、`.json`。一个文件可含多个产品，一个任务也可重复传入多份文件。分析对象必须属于同一可比较品类；用 `--category` 明确品类后，才可通过正式交付门槛。

## 产品字段

脚本会识别中英文常见表头：

- `product_id`：ASIN、SKU、item_id、product_id 等稳定产品标识。字段缺失时，可从 `产品id=...`、`商品id=...`、`product id=...` 或 `item id=...` 文件名恢复；仍无法识别时生成临时 ID，报告降级。
- `brand`、`product_name`、`variant`、`product_category`。
- `platform`、`market`、`language`。
- 平台字段缺失时可根据图片 URL 的官方静态资源域名恢复 Amazon、Shopee 或 TikTok Shop；市场字段缺失时可根据文件名中的国家名恢复常见站点。恢复结果必须保留在导入审计中，不得据此补写品牌或商品事实。
- `entity_role`：`TARGET` 或 `PEER`。可用 `--target` / `--peer` 按文件指定，也可用 `--target-product-id` 覆盖。

## 评论字段

- `review_id`、`review_title`、`review_body`、`rating`、`review_date`。
- `verified`、`helpful_votes`。
- `product_image_urls`、`review_image_urls`：支持单 URL、分隔字符串或 JSON 数组。

## 产品身份与同品类门槛

- 同一市场内以 `product_id` 为产品身份；跨市场相同 ID 仍保留市场维度。
- 没有稳定产品 ID、没有品类说明、或输入中出现多个品类时，质量状态不得为 `PASS`。
- 重复评论只在同一产品内去重；跨产品同文保留但单独提示，避免组合统计放大。

## 原始数据边界

原始文件保持只读。所有清洗、翻译、分类和汇总只写入运行目录；原文、来源文件、工作表和行号必须可追溯。
