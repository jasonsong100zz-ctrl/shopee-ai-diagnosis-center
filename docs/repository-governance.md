# 电商子弹库仓库规则

本仓库同时承载 Shopee 诊断应用和个人电商 Skill 子弹库。应用代码与 Skill 目录可以共存，但发布、测试和数据边界必须分开。

## 命名规则

### 仓库

当前仓库名 `shopee-ai-diagnosis-center` 保留，用于兼容现有 GitHub Pages 地址。未来若拆出纯 Skill 仓库，建议使用 `ecommerce-skill-bullet-library`，不要把应用仓库和纯 Skill 仓库混为一个产品名。

### Skill

- 目录名和 frontmatter `name` 使用不超过 64 个字符的 lowercase kebab-case。
- 目录名表达能力和边界，不使用日期、个人姓名、品牌宣传语或模糊的 `tool`、`helper`、`misc`。
- `agents/openai.yaml` 使用清晰的中文或英文 `display_name`，并保持与 Skill ID 一一对应。
- 一个 Skill 只解决一个稳定工作流；需要不同输入、权限、交付物或风险边界时拆成不同 Skill。

### 文件

```text
skills/<skill-id>/
├── SKILL.md                 # 触发条件、边界、工作流、交付要求
├── agents/openai.yaml       # 界面名称和默认调用提示
├── references/              # 契约、评分方法、领域规则
├── scripts/                 # 可重复执行的确定性逻辑
├── assets/                  # 生成结果需要的模板和静态资源
└── tests/                   # 只在确有自动化测试价值时添加
```

## 工作流边界

`shopee-main-image-report` 和 `shopee-new-product-analysis` 必须保持分离：

- 主图监测 Skill 只处理固定竞品链接、主图表达、周期快照和视觉变化。
- 新品分析 Skill 处理自有产品资料、市场机会、产品定位、主图套图、详情页和上市执行。
- 新品分析可以复用竞品视觉数据，但主图监测 Skill 不读取新品资料、不输出新品定位或上市计划。
- 价格/库存监测、评论 VOC、竞品主图和新品上市各自保持独立输入契约。

## 数据和隐私

允许提交：

- 去敏后的 Skill 指令、契约、评分逻辑和测试夹具；
- 不含客户身份的合成数据；
- 公开页面 URL 和可复核的公开证据引用；
- 不包含业务秘密的示例 HTML。

禁止提交：

- API Key、Cookie、Session、Token、Service Account JSON 和密码；
- 原始评论导出、客户订单、内部销售报表和未脱敏产品资料；
- 真实业务快照、私有 Google Sheet、私有图片 URL 和登录态数据；
- 包含个人信息的截图、浏览器缓存或 Chrome profile 文件。

临时采集文件放在 `tmp/`，浏览器运行报告放在 `midscene_run/`，两者默认不进入 Git。

## 证据规则

报告必须区分：

```text
观察到的页面表达
→ 用户反馈
→ 自有产品事实
→ 待验证假设
→ 执行动作
```

竞品出现频率不是转化证明；评论频率不是市场普遍性；产品资料事实也不自动等于合规可宣传。医疗、治疗、保证、100%、零刺激和永久等表述必须进入人工审核。

## 开发和发布

提交 Skill 变更前至少运行：

```powershell
node scripts/validate-skills.mjs
node --check skills/<skill-id>/scripts/<script>.mjs
```

如果 Skill 生成 HTML：

1. 使用最小合成或去敏 fixture 生成报告；
2. 检查报告标题、数据来源、空数据状态和证据边界；
3. 在 Chrome 中打开并检查桌面与窄屏布局；
4. 不把生成的报告、截图和原始快照提交到仓库。

提交信息使用简短的英文 Conventional Commits 风格，例如：

```text
feat(skill): add new product analysis workflow
fix(skill): preserve missing-data status in periodic report
docs(repo): clarify skill boundaries
```

## Pull Request 门槛

- 说明新增或修改的 Skill、触发边界和输入输出；
- 说明是否涉及公开网页采集或浏览器操作；
- 通过 Skill 结构校验和最小运行验证；
- 明确列出未验证字段和需要人工审核的内容；
- 不包含凭据、私有数据或无关业务改动。
