# Shopee AI 诊断中心｜总控看板

面向 Shopee Indonesia Glad2Glow 运营团队的安全协作工作台。页面统一管理五个工作流、全量链接诊断、Model 匹配、链接层级任务、SOP 与日报/周报模板；账号、任务、审批、数据快照和审计日志由 Supabase 管理。

## 团队账号与安全

- 未登录时不加载看板；员工可以自行注册，管理员白名单邮箱自动成为管理员，其他新账号默认为员工。
- 角色分为 `admin`、`employee`、`viewer`。管理员管理数据发布、成员角色和补贴审批；员工仅写入授权板块/店铺；只读账号不能改数据。
- 数据库所有业务表均启用 Row Level Security（RLS），浏览器中的公开连接密钥不能绕过行级权限。
- 正式构建只输出 `index.html`、`assets/` 和安全响应头，不会发布 `data/`、Excel 或 CSV 原始数据。
- 数据、任务和权限由 Supabase 管理；仓库公开仅用于发布不含业务明细的前端壳。
- Supabase Authentication → URL Configuration 中需加入正式域名和回调地址。

## 当前数据

- 7 月链接：695 条，覆盖 5 个店铺
- Model：4,964 个
- 产品匹配：487 条已匹配，208 条待治理
- 金额统一显示人民币，当前运营固定汇率为 `¥1 = Rp2,650`

## 部署

项目使用 GitHub Actions 构建 GitHub Pages，访问地址：

https://jasonsong100zz-ctrl.github.io/shopee-ai-diagnosis-center/

每次推送到 `main` 会自动重新构建。Pages source 已配置为 GitHub Actions。

## 竞品主图套图分析

固定竞品链接采集完成后，可使用视觉识别器提取主图文案、场景、图片类型和视觉显著度，再用评分器生成品类卖点排名与主图套图建议。详细字段和安全边界见 `docs/image-annotation.md`、`docs/image-set-analysis.md`。

## 两个独立分析 Skill

- `skills/shopee-main-image-report`：固定竞品链接的周期性主图表达监测，只输出竞品卖点、场景、视觉顺序和快照观察。
- `skills/shopee-new-product-analysis`：新品调研与上市规划，可结合竞品链接和自有产品资料输出市场、定位、主图、详情页、链接矩阵、渠道和 Roadmap HTML 报告。

新品分析可以复用竞品主图观察，但两个 Skill 的触发边界和安装目录保持独立。

完整目录、安装方式、触发选择和对话模板见 [`skills/README.md`](skills/README.md)；命名、证据、隐私、测试和提交规则见 [`docs/repository-governance.md`](docs/repository-governance.md)。Skill 结构可用以下命令校验：

```powershell
node scripts/validate-skills.mjs
```

```powershell
npm run image-annotate -- --input "tmp/competitor-snapshots/2026-08-24.json" --out "tmp/image-annotations.json" --dry-run
$env:OPENAI_API_KEY = "仅在当前终端设置"
npm run image-annotate -- --input "tmp/competitor-snapshots/2026-08-24.json" --existing "tmp/image-annotations.json" --out "tmp/image-annotations.json"
npm run image-analysis -- --input "tmp/competitor-snapshots/2026-08-24.json" --annotations "tmp/image-annotations.json" --out "tmp/image-set-analysis.json" --csv "tmp/claim-ranking.csv"
```

识别器支持一张图多个 `claims`，分析结果同时包含 `claim_ranking`、`scene_ranking` 和 8 个主图槽位建议。若暂时没有视觉模型 Key，可先用 Chrome 逐图人工复核，参考 `tmp/chrome-live-image-annotations.json` 的 `human-visual-review` 格式，再运行同一条分析命令；单个竞品样本只能作为样本观察，不能直接代表品类共识。
