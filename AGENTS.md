# Shopee AI Diagnosis Center Agent Rules

本仓库是 Shopee 运营诊断应用，包含前端、Supabase、Chrome 扩展、公开页面采集和图像分析代码。可复用的电商 Skill 已迁移到独立仓库 [shopee-ai-skill](https://github.com/jasonsong100zz-ctrl/shopee-ai-skill)，本仓库不再维护 `skills/` 目录。

## 修改前

- 阅读 `docs/repository-governance.md` 和与改动直接相关的模块文档。
- 先确认改动属于应用、采集、图像分析、部署或数据治理范围。
- 保留其他用户改动，尤其是扩展包、临时采集和部署相关文件；只提交当前任务涉及的文件。

## 应用与数据

- 前端权限和业务数据访问必须遵循 Supabase RLS，不在前端硬编码密钥或绕过授权。
- 不提交 API Key、Cookie、Session、Token、密码、客户数据、私有 Google Sheet、真实业务快照或登录态浏览器文件。
- 公开构建只发布应用壳、静态资源和安全响应头，不发布原始 CSV、XLSX、PPTX 或采集临时文件。
- 公开页面采集只处理用户明确提供的公开链接；采集失败、登录限制和缺失字段必须如实保留。

## 可复用 Skill

Skill 的安装、触发、开发和发布规则统一维护在独立仓库。需要修改 Skill 时，在 `shopee-ai-skill` 中完成，不要把 Skill 复制回本应用仓库；应用需要复用 Skill 时只通过文档、输入契约或公开接口衔接。

## 验证

根据改动选择最小验证：

```powershell
npm run validate
npm run test:image-analysis
npm run build
```

图像分析或报告改动还要用去敏/合成 fixture 生成结果，在 Chrome 检查标题、来源、空数据状态、证据边界和桌面/窄屏布局。不要把生成报告、截图和临时快照提交到 Git。

## Git 规则

- 使用简短的英文 Conventional Commits，例如 `fix(app): preserve missing snapshot state`。
- 不使用 `git reset --hard`、`git checkout --` 或广泛清理命令覆盖用户改动。
- 不为了修复 Skill 库问题修改应用代码；两边仓库分别验证、提交和发布。
