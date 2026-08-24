# 电商 Skill 子弹库

这里存放可复用的个人电商运营 Skill。目录名是机器识别用的稳定 ID，`agents/openai.yaml` 中的 `display_name` 是界面展示名称。

## Skill 目录

| Skill ID | 适用场景 | 主要输入 | 主要输出 |
| --- | --- | --- | --- |
| `fm-shopee-competitor-monitor` | 固定链接的价格、SKU、库存和快照监测 | Shopee 链接、CSV、Chrome 会话 | CSV、快照、可选云同步 |
| `shopee-competitor-link-tracker` | 固定链接列表的周期追踪和变化提醒 | Google Sheet 或 CSV 链接清单 | 标准化快照、变化、提醒 |
| `shopee-main-image-report` | 竞品主图周期视觉监测 | 固定竞品快照、主图标注、上一周期快照 | 竞品主图权重和周期变化 HTML |
| `shopee-new-product-analysis` | 新品调研、定位和上市规划 | 竞品链接、自有产品文件、调研资料 | 新品调研和上市规划 HTML |
| `ecommerce-review-purchase-drivers` | 同品类评论和购买决策因子分析 | CSV、XLSX、TSV、JSON 评论数据 | VOC、因子矩阵、PDP 优化 HTML |

## 安装

从个人 GitHub 仓库安装时，选择具体的 Skill 子目录，不要把整个应用仓库当成一个 Skill：

```text
<个人仓库>/skills/shopee-main-image-report
<个人仓库>/skills/shopee-new-product-analysis
```

安装后可显式调用：

```text
$shopee-main-image-report
$shopee-new-product-analysis
```

Skill 也允许自动发现，但当任务同时涉及竞品监测和新品上市时，优先明确指定新品 Skill，避免两个工作流混用。

## 使用指引

### 竞品主图周期监测

适用于“每周/每天看竞品主图怎么变”的任务：

```text
使用 $shopee-main-image-report。

固定竞品链接：
1. https://shopee.co.id/...
2. https://shopee.co.id/...

请对比本周期和上周期，输出主图卖点、场景、图片顺序、视觉重点和变化提醒。
```

这个 Skill 不负责新品定位、自己的产品文案、链接矩阵或上市 Roadmap。

### 新品调研分析

适用于“我要上一个新品，需要从竞品和自有产品资料制定表达和上市方案”的任务：

```text
使用 $shopee-new-product-analysis。

竞品链接：
1. https://shopee.co.id/...
2. https://shopee.co.id/...

我已上传新品 PPT/产品资料，请输出：
- 市场机会和关键词
- 竞品主图与详情页结构
- 用户好评、差评和 FAQ
- 新品定位和差异化
- 主图套图和详情页逻辑
- 链接矩阵、渠道和上市 Roadmap
- HTML 分析报告
```

### 评论购买因子

使用 `$ecommerce-review-purchase-drivers` 时，必须说明品类、市场、目标产品和评论文件来源；报告中的评论比例只能称为“本次样本覆盖”。

## 选择规则

```text
固定竞品价格/库存/销量监测 → fm-shopee-competitor-monitor
固定竞品链接变化追踪 → shopee-competitor-link-tracker
固定竞品主图表达变化 → shopee-main-image-report
新品调研和上市方案 → shopee-new-product-analysis
评论驱动因素和 VOC → ecommerce-review-purchase-drivers
```

## 证据边界

- 竞品页面表达只能证明“竞品在强调什么”，不能证明功效或转化因果。
- 用户评论只能证明“样本用户说了什么”，不能直接变成产品事实。
- 自有产品资料中的事实、检测、成分和资质优先于模型常识。
- 没有证据的功效词标记为待补充，不生成医疗、保证性或绝对化承诺。
- 原始客户数据、私有链接、Cookie、Token、API Key 和真实业务快照不得提交到仓库。
