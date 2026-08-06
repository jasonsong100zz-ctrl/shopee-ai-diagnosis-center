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

每次推送到 `main` 会自动重新构建。