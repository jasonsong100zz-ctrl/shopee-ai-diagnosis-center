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

## 使用已登录 Chrome 采集

首次使用时启动独立 Chrome 配置并手动登录 Shopee：

```powershell
npm run competitor:chrome
```

Chrome 配置默认保存在 `%LOCALAPPDATA%\ShopeeCompetitorChrome`，不会使用日常 Chrome 配置。登录状态由 Chrome 配置目录持久化；采集器不读取或导出密码、Cookie。启动后运行：

```powershell
npm run competitor:collect -- --watchlist "tmp/competitor-watchlist.json" --out-dir "tmp/competitor-snapshots" --chrome-cdp-url "http://127.0.0.1:9222"
```

如果 Chrome 会话失效、出现登录页、验证码或流量验证，采集器记录失败并停止处理该商品，不会尝试绕过平台限制。电脑需要开机并保持该专用 Chrome 可连接。

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

## Chrome 扩展：人工启动监控

如果 Shopee 对自动化访问触发流量验证，推荐使用 `chrome-extension` 目录的 Chrome 扩展。它复用当前已登录的 Chrome 页面，不读取或导出密码、Cookie；遇到登录、验证码或流量验证会暂停，用户人工处理后点击“验证后继续”。

1. 在本机设置 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`COMPETITOR_WORKSPACE_ID`，启动 `npm run competitor:bridge`。
2. Chrome 打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择本项目的 `chrome-extension` 文件夹。
3. 点击扩展图标，确认清单 CSV 地址、桥地址和工作区 UUID，点击“开始监控”。
4. 扩展逐条打开链接并采集；出现验证时人工处理，再点击“验证后继续”。

服务密钥只保存在本机桥接进程环境变量，不进入扩展、不进入网页、不进入 GitHub。扩展只允许访问指定 Shopee 市场、Google Sheet CSV 和 `127.0.0.1:8787` 本地桥。

## 给其他业务人员使用

当前版本不是“只发一个 Sheet 链接就能使用”。每位业务人员首次需要完成一次本机配置：

1. 安装 `chrome-extension` 扩展并在 Chrome 中重新加载。
2. 准备一个自己有权限访问的 Google Sheet 链接；现在可以直接粘贴 `/edit?gid=0`、`/view?gid=0` 或 CSV 导出链接，扩展会自动转换为 CSV 地址。
3. 启动本机桥接服务，并使用同一个 `COMPETITOR_WORKSPACE_ID`。扩展不会保存或读取 Chrome 密码、Cookie。
4. 点击“开始监控”；面板会显示已读取数量、成功/失败数量。遇到 Shopee 验证时人工完成验证，再点“验证后继续”；结束后可点“重试失败”。
5. 任务完成后，点击“下载本次结果 CSV”，Chrome 会让使用者选择保存位置。CSV 同时包含成功采集字段和失败链接，默认文件名为 `FM竞品监控-YYYY-MM-DD.csv`。

CSV 业务结果表固定保留：`采集日期`、`品类`、`产品`、`竞对品牌`、`市场`、`商品链接`、`店铺ID`、`商品ID`、`商品标题`、`当前价格`、`原价`、`折扣率`、`币种`、`最低SKU价格`、`最高SKU价格`、`SKU名称`、`SKU价格明细`、`库存状态`、`累计已售代理值`、`评分`、`评论数`、`促销摘要`、`优惠券`、`配送摘要`、`采集状态`、`失败原因`。

扩展优先读取商品页已公开加载的内嵌状态数据，一次性获取 SKU 名称、`model_id`、库存和规格，不自动连续点击 SKU。若页面没有提供每个 SKU 的价格，`SKU价格明细`会标记为“需选择确认”，不会把当前选中 SKU 的价格冒充所有 SKU 的价格。商品描述、商品规格、店铺指标、售后政策、图片/视频数量、评论分布、哈希和原始页面数据继续保存在快照 `raw_payload` 中，不进入业务 CSV 主表。

当前桥接服务需要本机配置 Supabase Service Role Key，因此不应把现有桥接目录和密钥直接分发给多人。小范围试用可以由管理员为每台电脑配置受控环境；正式多人版应迁移到 Supabase Auth + Edge Function：扩展只使用用户登录态和 anon key，Edge Function 服务端保存 Service Role Key，并按用户所属 workspace 做 RLS 权限校验。这样业务人员最终才可以做到“安装扩展 + 粘贴清单链接 + 选择工作区”。

建议清单维持稳定的列名：`品类`、`产品`、`竞对品牌`、`竞品链接`，并用 `enabled` 控制是否参与本次追踪。每次运行仅处理启用且链接格式有效的商品链接；页面可见的累计销量只能作为销量代理，不代表真实订单、GMV、流量或转化率。
