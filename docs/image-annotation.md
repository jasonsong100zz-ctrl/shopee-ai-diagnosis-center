# 主图文案视觉识别

`annotate-image-sets.mjs` 是主图分析的可选识别层。它读取竞品快照中的 `image_assets`，下载公开图片，调用视觉模型识别可见文案和图片表达，再输出供 `analyze-image-sets.mjs` 使用的 `image-annotations-v1` 文件。

## 安全边界

- 只处理输入快照里的固定图片 URL，不做商品发现。
- 只下载 HTTPS 公网图片，拒绝本机、私网、带账号密码的地址。
- 单张图片上限 8 MB，请求有超时和 429/5xx 重试。
- API Key 只从当前终端的 `OPENAI_API_KEY` 读取，不写入扩展、配置文件或输出 JSON。
- 识别失败会保留失败记录和复核原因，不阻断整批任务。
- 视觉模型只报告图片中可见的文案与视觉信息，不把商品标题当成图片事实。

## 运行前检查

先用 dry-run 检查输入和输出结构，不调用模型：

```powershell
npm run image-annotate -- --input "tmp/competitor-snapshots/2026-08-24.json" --out "tmp/image-annotations.json" --dry-run
```

## 正式识别

```powershell
$env:OPENAI_API_KEY = "只在当前终端临时设置"
$env:OPENAI_VISION_MODEL = "gpt-4.1-mini"
npm run image-annotate -- --input "tmp/competitor-snapshots/2026-08-24.json" --existing "tmp/image-annotations.json" --out "tmp/image-annotations.json" --concurrency 2
```

默认会跳过已有 `status=complete` 的图片；需要重新识别时增加 `--force`。`--concurrency` 建议从 2 开始，避免对图片 CDN 或模型接口造成突发压力。

## 生成卖点权重

```powershell
npm run image-analysis -- --input "tmp/competitor-snapshots/2026-08-24.json" --annotations "tmp/image-annotations.json" --out "tmp/image-set-analysis.json" --csv "tmp/claim-ranking.csv"
```

结果中的 `annotation_coverage`、`review_queue` 和每张图的 `confidence` 需要先检查。识别覆盖不足或大量 `needs_review=true` 时，只能作为草稿，不能直接称为品类最佳主图逻辑。

## 识别结果字段

- `text`：图片中可见的原始文案，保留原语言。
- `language`：中文、英语、印尼语、泰语等候选语言。
- `normalized_claim`：统一卖点 key，用于跨竞品聚合。
- `claims`：同一张图可包含多个带原文证据的卖点对象；旧格式仍可只填写 `normalized_claim`。
- `claim_type`：功能、利益、证明、信任、场景、规格或促销。
- `image_type`：主视觉、卖点、场景、证明、规格、使用、包装、对比或促销图。
- `text_area_ratio`、`font_size_ratio`、`visual_emphasis`：0～1 的相对视觉指标。
- `confidence`、`needs_review`、`review_reason`：识别质量和人工复核依据。

同一张图的 `claims` 示例：

```json
{
  "sequence": 3,
  "text": "Powerful Bersihkan Makeup\nGentle On Skin",
  "claims": [
    { "text": "Powerful Bersihkan Makeup", "normalized_claim": "makeup_removal", "claim_type": "feature" },
    { "text": "Gentle On Skin", "normalized_claim": "gentle_non_irritating", "claim_type": "benefit" }
  ]
}
```

## 事实与宣称边界

图片识别证明的是竞品如何表达，不证明其产品宣称真实，也不证明某个卖点一定提升转化。对外发布文案仍需产品事实、测试结果和平台/当地合规审核。
