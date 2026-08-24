# 竞品主图套图分析 MVP

本模块把竞品商品页的图片资产、人工/模型图像标注和竞品质量信号，整理成“文案—卖点—场景—顺序—视觉强调—套图逻辑”分析结果。当前版本先建立可复现的数据合同和评分引擎，OCR/视觉模型可以通过 `image_annotations` 接入，不把没有 OCR 证据的图片误判成已识别文案。

## 1. 采集图片资产

现有 Playwright 采集器和 Chrome 扩展会在商品快照中保存：

- `image_sources`：去重后的图片 URL，保持页面发现顺序。
- `image_assets`：图片序号、URL、alt 文案、原始尺寸、显示尺寸、页面位置和可见性。
- `image_alt_texts`：图片可见的 alt 文案。

优先使用商品页正常返回的商品图片 ID 完整列表；如果页面没有该字段，再回退到主画廊内、原始宽高至少 64px 且当前显示宽高至少 60px 的图片，最多 40 张。这样既能保留隐藏缩略图，也能排除页面图标和评论头像。

## 2. 标注合同

在快照记录中增加 `image_annotations`，或者使用单独 JSON 文件通过 `--annotations` 传入：

```json
[
  {
    "watch_key": "ID:123:456:",
    "images": [
      {
        "sequence": 1,
        "text": "Waterproof",
        "normalized_claim": "water_resistance",
        "claim_type": "feature",
        "image_type": "hero",
        "scene": "outdoor",
        "visual_emphasis": 0.9,
        "is_headline": true
      }
    ]
  }
]
```

`text` 可以来自人工校正、OCR 或多模态模型。`normalized_claim` 可直接指定归一化卖点；不指定时，MVP 使用内置中英关键词规则归并。`visual_emphasis`、`text_area_ratio` 和 `font_size_ratio` 都是 0～1，相对值优先于绝对像素。

一张主图可以同时表达多个卖点，建议用 `claims` 数组逐项保留“原文片段 + 归一化 key”，评分器会按图片序号和视觉显著度把每个卖点分别聚合；不会因为一张图有多个卖点而重复计算竞品数量。`scene` 仍是图片级字段，分析结果会额外输出 `scene_ranking`，用于展示场景槽位。

分析结果的 `annotation_metadata` 会保留识别模型、人工复核方式和标注文件时间；人工标注可以明确标记为 `model: "human-visual-review"`，不与自动识别混淆。

## 3. 运行分析

```powershell
npm run image-analysis -- --input "tmp/competitor-snapshots/2026-08-21.json" --annotations "tmp/image-annotations.json" --out "tmp/image-set-analysis.json" --csv "tmp/claim-ranking.csv"
```

也可以直接分析没有标注的快照；此时不会把商品标题或图片 alt 文案误认为图片内 OCR，结果会标记 `annotation_coverage` 和 `review_queue`，不会假装完成图片 OCR。

## 4. 当前评分口径

```text
卖点表达权重 = 出现频率 × 30%
             + 首次出现顺序 × 25%
             + 视觉显著度 × 20%
             + 重复强调 × 15%
             + 竞品质量加权 × 10%
```

顺序分使用 `1 / log2(图片序号 + 1)`，竞品质量信号使用公开的累计已售、评论数和评分，并设置温和的 0.7～1.0 权重范围，避免低销量竞品数量过多时淹没头部表达。

这个结果代表“竞品表达共识”，不是转化因果结论。接入自有商品的点击率、加购率、转化率和主图 A/B 版本后，才可以进一步计算真实转化权重。

如果输入只有 1 个竞品，`frequency` 只能说明该样本中出现，不能称为品类共识。建议至少采集 5～10 个同品类固定链接，并按相同市场、语言和价格带分组后再输出“最佳逻辑”。

## 5. 验证

```powershell
npm run test:image-analysis
npm run validate
```
