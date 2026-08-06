# Shopee AI 诊断中心｜总控看板

面向 Shopee Indonesia Glad2Glow 运营团队的安全协作工作台。页面统一管理五个工作流、全量链接诊断、Model 匹配、链接层级任务、SOP 与日报/周报模板；账号、任务、审批、数据快照和审计日志由 Supabase 管理。

## 团队账号与安全

- 未登录时不加载看板；员工可以自行注册，管理员白名单邮箱自动成为管理员，其他新账号默认为员工。
- 角色分为 `admin`、`employee`、`viewer`。管理员管理数据发布、成员角色和补贴审批；员工仅写入授权板块/店铺；只读账号不能改数据。
- 数据库所有业务表均启用 Row Level Security（RLS），浏览器中的公开连接密钥不能绕过行级权限。
- 正式构建只输出 `index.html`、`assets/` 和安全响应头，**不会发布 `data/`、Excel 或 CSV 原始数据**。
- 任务状态、补贴方案与数据发布均写入审计日志；浏览器 `localStorage` 只用于 localhost 本机演示。
- 仓库必须设为 Private。若使用 GitHub Pages，页面仍通过 Supabase 登录保护数据；正式团队使用更推荐 Cloudflare Pages，以启用 `_headers` 中的 CSP、禁止 iframe 和浏览器权限限制。

### 首次启用

1. 登录页已登记首位管理员邮箱 `jason.song100zz@gmail.com`；填写密码后点击“员工 / 管理员注册”，完成邮箱验证即可成为管理员。
2. 员工可以使用同一入口自行注册；注册完成后默认没有店铺和板块权限，管理员在工作台 07「数据源 & 定义」的“账号与权限”中配置角色、店铺和可写板块。
3. 管理员在 localhost 登录，进入 07 点击“发布当前数据到云端”，完成第一次数据快照。
4. 在 GitHub 仓库 Secrets 添加 `GOOGLE_SHEETS_CREDENTIALS` 与 `SUPABASE_SERVICE_ROLE_KEY`。定时任务会拉取 Google Sheet、重算指标并发布团队快照。
5. 在 Supabase Authentication → URL Configuration 中加入正式域名和回调地址，否则邮箱登录链接无法回到工作台。

不要把 `SUPABASE_SERVICE_ROLE_KEY` 写入前端、仓库或聊天记录；前端只使用可公开的 publishable key，权限由 RLS 保证。

## 当前数据

- 7 月链接：695 条，覆盖 5 个店铺
- Model：4,964 个，用于规格结构、缺货与头部 Model 集中度分析
- 产品匹配：487 条已匹配，208 条待治理
- 金额：统一显示人民币，当前运营固定汇率为 `¥1 = Rp2,650`
- 链接销售数据不重复累计 Model 销售数据
- 链接表 11 个字段均支持点击表头正序 / 倒序，排序后自动回到第 1 页

## 诊断到动作的闭环

看板不再展示脱离链接的静态结论，而是用全量链接实时生成诊断队列：

1. 根据流量、加购、转化、UV 价值、生命周期和类目基准，识别命中链接。
2. 点击诊断卡可筛回全部命中链接，并显示队列名称与真实数量。
3. 点击任一 Product ID 或“查看 AI 方案”，查看该链接的现状判断、指标证据与执行动作。
4. 链接任务按 T 级进入任务板：T1 核心保护、T2 腰部修复、T3 机会放大、T4 / 新品治理。
5. 任务可直接定位回原链接；正式账号的勾选状态保存到云端并实时共享，本机演示才保存到当前浏览器。

## 动态 SOP 与数据治理

- SOP 支持按全店或品类切换，自动引用对应链接数、GMV、访客、订单 CR、业务矩阵和下滑队列。
- 日报、周报和 Listing 诊断模板会随品类与源数据变化自动生成，不再只显示固定示例文字。
- 广告、客服、差评、竞品和店铺总览等未接入数据会明确显示“待补充”，避免无数据归因。
- 07「数据源 & 指标定义」展示链接、Model、匹配表、工作流和定义配置的引用关系。
- 可修改汇率、矩阵边界、加购/流量/UV 诊断阈值和每层任务展示数，应用后全看板重算。
- 可按 Product ID 修改单条链接源数据，也可导入/导出 `Links.csv` 与 `Parameters.csv`。
- 正式数据源采用 Google Sheets / Excel 多 Sheet 工作簿；GitHub 保存 CSV 快照和历史版本。
- JSON 仅作为脚本自动生成的页面发布快照，不再要求运营人员直接编辑。
- 参数和单条链接修改保存在当前浏览器；如需沉淀为团队正式版本，应更新 Google Sheet 或 CSV 表格。

当前动态诊断队列包括：黑马链接待放大、流量浪费待修复、加购意向低于类目、核心链接下滑、UV 价值偏低。

## 链接层级优先级

| 链接层级 | 任务优先级 | 运营目标 | 默认处理范围 |
|---|---|---|---|
| T1 | P0 · 今日 | 核心保护、抢救下滑 | 全部 T1 链接，先展示高风险高 GMV 链接 |
| T2 | P1 · 本周 | 腰部修复、稳定出货 | 全部 T2 链接，优先流量浪费和下滑链接 |
| T3 | P2 · 测试 | 机会放大 | 黑马宝藏款或快速增长款 |
| T4 / 新品 | P3 · 治理 | T4 清退、新品孵化 | T4 与新品池链接 |

## 项目结构

```text
shopee-ai-dashboard/
├── index.html
├── assets/
│   ├── styles.css
│   ├── app.js
│   └── og.png
├── data/
│   ├── dashboard.json
│   ├── module1.json              # 自动生成的页面快照
│   ├── definitions.json          # 自动生成的定义快照
│   ├── Shopee_AI_Data_Source.xlsx
│   └── tables/                   # Google Sheets / CSV 主数据快照
├── scripts/
│   ├── build-module1-data.mjs
│   ├── export-table-sources.mjs
│   ├── build-from-tables.mjs
│   ├── sync-google-sheets.mjs
│   ├── inspect-source.mjs
│   └── validate.mjs
├── .github/workflows/deploy-pages.yml
├── .nojekyll
└── README.md
```

## 本地预览

页面通过模块脚本加载登录与数据服务，因此需要本地静态服务器预览，不能直接双击 `index.html`。localhost 会额外显示“本机演示”入口；正式域名不会显示。

```bash
python -m http.server 4173
```

访问 `http://localhost:4173/`。正式构建执行：

```bash
node scripts/build-secure-site.mjs
```

产物位于 `dist/`，其中不包含原始运营数据。

然后访问 `http://localhost:4173`。

发布前校验：

```bash
node --check assets/app.js
node scripts/validate.mjs
```

## 部署到 GitHub Pages

1. 在 GitHub 新建空仓库。
2. 将本目录全部文件提交到仓库的 `main` 分支。
3. 打开仓库 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **GitHub Actions**。
5. 推送后等待工作流完成，即可通过 GitHub Pages 地址访问。

项目使用相对路径，可直接部署在 GitHub Pages 子路径下，无需修改页面配置。

## 更新运营数据

推荐在 `data/Shopee_AI_Data_Source.xlsx` 对应的 Google Sheet 中维护数据。Google Sheets 同步后会更新 `data/tables/*.csv`，再自动生成页面快照。

也可以在本地修改 CSV 后重建：

```bash
node scripts/build-from-tables.mjs
```

需要从当前快照重新生成表格源时：

```bash
node scripts/export-table-sources.mjs
```

Google Sheets 私有同步配置见 `data/tables/README.md`。同步任务可以手动触发，也会每 6 小时运行一次。

## 口径说明

- 缺少平台 Impressions 时，当前流量吸引指标采用 `Product Visitors ÷ Product Views`，不等同平台标准 CTR。
- 缺少首周 14 天明细时，生命周期暂以月度销量环比代理。
- 任务完成状态仅保存在访问者当前浏览器；如需多人实时协作，可继续接入 Supabase、Airtable 或 Google Sheets。
- Listing 文案上线前仍需按 Shopee Indonesia 最新政策复核。

