# 语义标注契约

每行 `annotations.jsonl` 对应一个 `atom_id`，必须包含：

```json
{
  "atom_id": "atom-...",
  "factor_id": "hydration_duration",
  "polarity": "positive",
  "language": "id",
  "evidence_zh": "保湿能持续一整天",
  "keywords_original": ["lembap seharian"],
  "keywords_canonical_zh": ["全天保湿"],
  "contexts": ["日间使用"],
  "impact_signals": ["REPURCHASE"],
  "confidence": 0.94,
  "translation_status": "ai_confirmed",
  "review_status": "ai_confirmed"
}
```

约束：

- `factor_id` 必须存在于已确认的运行级因子目录。
- `polarity` 只允许 `positive`、`negative`、`neutral`。
- `confidence` 为 0–1。
- 只有 `ai_confirmed` / `human_confirmed` 进入正式结论。
- 不要因星级强行覆盖原句；一条五星评论可含负向原子，一条一星评论可含正向原子。
- 把“产品本身”“物流”“客服”和“竞品比较”的主客体区分清楚。
- 评论只有泛化情绪且没有决策细节时，使用 `insufficient_detail`。
