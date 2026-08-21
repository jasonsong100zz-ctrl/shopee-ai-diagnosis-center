# 竞品链接每日追踪

本模块把 Google Sheet 作为竞品链接清单，把 Supabase 作为历史快照和变化事件存储。

## 当前清单

Google Sheet 必须至少包含以下列：

| 列名 | 说明 |
| --- | --- |
| `品类` | 业务品类 |
| `产品` | 产品类型或内部名称 |
| `竞对品牌` | 竞品品牌 |
| `竞品链接` | Shopee 商品详情链接 |

可选列：`market`、`enabled`、`priority`、`own_product_id`、`target_model`、`tracking_frequency`、`notes`。

## 导入 Google Sheet

公开可读的 Google Sheet 使用 CSV 导出地址：

```text
https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=<GID>
```

例如：

```powershell
npm run competitor:import -- --url "https://docs.google.com/spreadsheets/d/1sQfu_8VCBhH3WnKp67It3RwiB8vQRLjBzSWY9ndWI8w/export?format=csv&gid=0" --out "tmp/competitor-watchlist.json"
```

也支持本地 CSV：

```powershell
npm run competitor:import -- --file "input/competitor-links.csv" --out "tmp/competitor-watchlist.json"
```

导入器会解析 `market`、`shop_id`、`item_id`，检查必填列、域名、`-i.<shop_id>.<item_id>` 标识和重复链接。出现错误时仍会写出结果文件，但命令返回失败状态，方便定时任务阻止脏数据进入数据库。

## 运行一次采集

先安装 Playwright 浏览器：

```powershell
npx playwright install chromium
```

再运行：

```powershell
npm run competitor:collect -- --watchlist "tmp/competitor-watchlist.json" --out-dir "tmp/competitor-snapshots"
```

调试时可以限制条数并显示浏览器：

```powershell
npm run competitor:collect -- --watchlist "tmp/competitor-watchlist.json" --out-dir "tmp/competitor-snapshots" --limit 1 --headed
```

采集器只使用正常商品页导航，不处理 CAPTCHA、登录或访问限制。如果最终地址不再包含商品链接的 `-i.<shop_id>.<item_id>` 标识，会记录为 `failed`，不会把 Shopee 首页误记录为商品快照。无头环境被重定向时，应切换到 Shopee 允许的授权数据 API 或由用户提供的合规采集服务。

每日文件格式为 `tmp/competitor-snapshots/YYYY-MM-DD.json`，包括 `records`、`events` 和 `summary`。重复执行同一天会覆盖当天文件；历史日期文件用于下一次变化比较。

## 发布到 Supabase

不要把 Service Role Key 放入前端、Google Sheet 或仓库。服务端发布器使用环境变量：

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<server-only-key>"
$env:COMPETITOR_WORKSPACE_ID = "<workspace-uuid>"
npm run competitor:publish -- --snapshot "tmp/competitor-snapshots/2026-08-21.json" --watchlist "tmp/competitor-watchlist.json"
```

发布器会幂等写入竞品清单、每日快照和变化事件。GitHub Actions 中对应配置为 Repository Secret `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，以及 Repository Variable `COMPETITOR_WORKSPACE_ID`。

## 数据库

执行 `supabase/migrations/202608210001_competitor_link_tracking.sql` 后，主要使用：

- `competitor_watchlist`：标准化后的竞品链接和追踪配置。
- `competitor_product_snapshots`：每日商品观察快照。
- `competitor_change_events`：价格、促销、销量代理、评论、库存和 Listing 变化。

竞品数据按 `workspace_id` 隔离，不与自有店铺订单、广告或促销事实相加。

## 每日采集边界

采集器应保存公开可见的商品字段，并保留 `capture_status`、`error_message`、`source_url` 和内容哈希。页面累计已售的日变化只能作为销量代理，不得当作真实订单或 GMV。采集器不得绕过 CAPTCHA、登录、访问限制或 Shopee 平台规则。

关键词排名不属于固定商品链接快照，必须另建关键词、市场、类目、排序方式和采集时间维度。
