---
name: ecommerce-review-purchase-drivers
description: 分析一个或多个同品类、多品牌、多平台的电商用户评论导出文件，从好评和差评中发现真实购买决策因子，比较目标产品与竞品的优势、短板、品类空白和预期分化，并生成可追溯到原文、中文翻译、产品和评论图片的交互式 HTML 与商品页优化建议。适用于 CSV、XLSX、TSV、JSON 评论数据，支持中文、英文、印尼语、泰语及混合语言；当用户要做电商 VOC、评论洞察、购买决策因素、竞品评论对比、PDP/Listing/商品详情页优化、头图或卖点优化时使用。不要用于不同品类混合分析，也不要把评论体验直接写成产品事实或合规宣称。
---

# 电商评论购买决策洞察

## 目标

把同品类多产品评论转成以下可审计结果：

- 品类购买决策因子地图；
- 目标产品与竞品的因子矩阵；
- 基础门槛、英雄差异点、关键短板、品类空白、分化/预期敏感和新兴信号；
- 标题、头图、卖点、图片组、PDP/A+、FAQ、规格选择器、视频或产品/包装的优化机会；
- 可下钻到原文、中文旁注、产品、来源行和评论图片的交互式 HTML。

## 先读取的契约

按任务需要读取：

- 输入与产品身份：`references/input-contract.md`
- 多语言处理：`references/multilingual-contract.md`
- 因子发现与指标：`references/factor-taxonomy.md`
- 原子标注格式：`references/annotation-contract.md`
- 商品页机会与宣称边界：`references/report-contract.md`

## 工作流

### 1. 确认分析边界

只把同一可比较品类放入一次运行，例如多个品牌的保湿面霜。优先从文件字段识别产品、品牌、平台、市场和语言；只有产品身份或品类确实歧义时才向用户追问。

- 有目标产品：用 `--target` 指定目标文件，或用 `--target-product-id` 指定产品 ID；其他产品为 `PEER`。
- 没有目标产品：全部作为品类样本，输出品类决策地图与产品比较，不强行指定赢家。
- 必须用 `--category` 或输入字段确认唯一品类。多品类为 `FAIL`，品类缺失为 `DEGRADED`。

### 2. 准备运行包

先确认 `requirements.txt` 的依赖可用。运行：

```bash
python3 scripts/purchase_driver_voc.py prepare \
  --input /path/to/reviews.xlsx \
  --input /path/to/more-reviews.csv \
  --target-product-id PRODUCT-001 \
  --category "保湿面霜" \
  --output-dir /path/to/run
```

也可重复使用 `--target`、`--peer`、`--positive`、`--negative`。最终交付离线 HTML 时推荐加 `--download-images`，把可访问的评论图片安全缓存到运行包，避免热链过期或被拦截；只有快速预览且明确接受联网加载时才省略。下载器拒绝私网地址、非图片响应和大于 8 MB 的文件，缓存失败必须在质量审计中披露。

使用合成数据做技术验证时必须加 `--demo`。演示运行即使技术状态为 `PASS`，报告也必须持续显示“不可用于真实业务决策”，不得与正式数据混淆。

准备阶段会生成：

- `normalized-reviews.csv/jsonl`
- `evidence-atoms.jsonl`
- `factor-discovery-queue.jsonl`
- `annotation-queue.jsonl`
- `factor-catalog-draft.json`
- `import-audit.json`

不得修改原始导出文件。

### 3. 开放编码并确认运行级因子目录

检查 `factor-discovery-queue.jsonl`，覆盖每个产品、语言、市场和正负方向。以 `factor-catalog-draft.json` 为起点：

- 合并同义因子；
- 拆分对购买决策含义不同的因子；
- 增加本品类特有因子；
- 把定义写到可重复判断的粒度；
- 保留 `insufficient_detail` 处理没有决策细节的评论。

保存为 `factor-catalog.json`，并把 `status` 设为 `ai_confirmed` 或 `human_confirmed`。不要把正向和负向拆成两套因子；方向属于原子声音。

### 4. 完成多语言语义标注

按 `references/annotation-contract.md` 逐条完成 `annotations.jsonl`。必须：

- 以原文判断，不用星级强行覆盖原句；
- 中文、英文、印尼语、泰语分别检查否定、主客体和口语；
- 保留 `evidence_original`，为非中文原子提供忠实 `evidence_zh`；
- 同时给出原语言关键词和中文规范词；
- 识别回购、推荐、退货、不再购买、换牌、停用、安全或无法使用等行为影响；
- 低置信度或翻译歧义使用 `needs_review`，不要伪装成确认结果。

只有 `ai_confirmed` / `human_confirmed` 的标注和 `original_zh` / 已确认翻译才能通过正式门槛。

### 5. 构建交互式报告

```bash
python3 scripts/purchase_driver_voc.py build \
  --run-dir /path/to/run \
  --factor-catalog /path/to/run/factor-catalog.json \
  --annotations /path/to/run/annotations.jsonl
```

输出包括：

- `review-purchase-drivers.html`
- `analysis.json`
- `decision-factor-matrix.csv`
- `pdp-opportunities.csv`
- `evidence-atoms.csv`
- `run-summary.json`

HTML 支持日/夜主题、产品/角色/品牌/平台/市场/语言/方向/因子/星级/行为/搜索筛选、逐项取消筛选、因子矩阵下钻、产品对应词云、原语言/中文规范词切换、原声 CSV 导出和图片预览。

### 6. 验证后交付

```bash
python3 scripts/purchase_driver_voc.py verify --run-dir /path/to/run
```

解释状态：

- `PASS`：可把统计与机会卡用于正式业务讨论；公开宣称仍需产品事实、测试和合规证据。
- `DEGRADED`：可预览，但仍有品类、身份、因子目录、标注或翻译未确认。
- `FAIL`：没有有效证据或混入多个品类，不能据此给业务结论。

交付时简要说明样本范围、目标产品是否存在、质量状态、前三个购买决策因子、最重要的页面机会和报告路径。所有比例必须称为“本次样本覆盖”，不得称为市场问题率、渗透率或普遍发生率。

## 分析纪律

- 一个原子声音可以同时有因子、方向、场景和行为影响，但统计按去重评论覆盖，避免长评论放大权重。
- 产品广度表示多少个输入产品提及，不代表市场份额或市场普遍性。
- 少于 3 条去重评论的因子只标为新兴信号。
- 目标产品强弱必须相对竞品样本解释；没有目标产品时只输出品类优先级。
- 文案无法解决的质量、包装、安全或适配问题，必须进入产品/包装改进，不得用营销表达掩盖。
- VOC 证明用户关心什么；产品事实证明能否兑现；合规证据决定能否公开表达。三者不能互相替代。
