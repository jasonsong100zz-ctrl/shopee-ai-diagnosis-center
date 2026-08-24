# 应用仓库治理规则

本仓库只承载 Shopee AI 诊断中心应用。可复用的个人电商 Skill 位于独立仓库 [shopee-ai-skill](https://github.com/jasonsong100zz-ctrl/shopee-ai-skill)，两边的目录、校验、发布和数据边界分开维护。

## 仓库边界

允许在本仓库维护：

- 前端页面、组件、Supabase 客户端和数据库迁移；
- Shopee 公开链接采集、快照发布和 Chrome 扩展；
- 主图图像标注、评分、分析和 HTML 报告渲染；
- GitHub Pages 构建、响应头和应用使用说明。

不在本仓库维护可复用 Skill 的 `SKILL.md`、`agents/openai.yaml`、Skill 目录索引或 Skill 库验证器；这些内容统一提交到 `shopee-ai-skill`。

## 数据与权限

- Supabase 业务表必须启用并持续验证 Row Level Security（RLS）。
- 前端可以使用公开连接密钥，但不得包含 Service Role Key、API Key、Cookie、Token、密码或其他凭据。
- 只采集用户明确提供的公开商品链接；遇到登录墙、地区限制、风控或缺失字段时如实记录，不绕过访问控制。
- 公开 Pages 构建只发布应用壳、静态资源和安全响应头，不发布原始业务数据。
- `tmp/`、`midscene_run/` 和生成的报告、截图、快照用于本地验证，默认不进入 Git。

## 图像分析证据

主图分析报告必须区分：

```text
页面观察 → 视觉/OCR 识别 → 规则评分 → 待验证假设 → 应用动作
```

竞品出现频率只能说明样本中的表达频率，不能证明转化因果或功效；OCR 不确定、图片缺失和模型未覆盖字段必须保留缺失状态。医疗、治疗、保证、100%、零刺激和永久等表述进入人工审核。

## 开发与验证

修改应用前先阅读对应模块文档。提交前按影响范围运行：

```powershell
npm run validate
npm run test:image-analysis
npm run build
```

图像或 HTML 改动还要使用去敏/合成 fixture，在 Chrome 检查桌面与窄屏布局、报告标题、数据来源、空数据状态和证据边界。不要提交生成物。

## 提交与 PR

- 使用简短的英文 Conventional Commits，例如 `feat(app): add snapshot review state`。
- PR 说明影响的应用模块、数据表/权限、采集范围和验证命令。
- 明确列出未验证字段、需要人工审核的文案和任何外部依赖。
- 只提交当前应用改动；需要修改 Skill 时，附上 `shopee-ai-skill` 仓库的对应变更链接。
