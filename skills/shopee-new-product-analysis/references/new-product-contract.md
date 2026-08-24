# New-Product Research Contract

Use this optional JSON document when the user provides research material beyond fixed product links and image annotations. Empty or missing fields must remain visible as missing; they are not permission to infer numbers or product facts.

```json
{
  "schema_version": "new-product-research-v1",
  "objective": "Validate positioning and creative plan for a new launch",
  "market_context": {
    "market": "ID",
    "category": "Skincare",
    "capture_date": "2026-08-24",
    "opportunity_summary": "Observed opportunity, not a market-size claim",
    "keywords": [
      { "term": "关键词", "search_volume": 0, "growth_rate": 0, "source": "来源" }
    ],
    "industry_metrics": {
      "monthly_units": null,
      "average_price": null,
      "brand_count": null,
      "seller_count": null,
      "brand_concentration": null,
      "seller_concentration": null,
      "source": "来源"
    }
  },
  "competitor_comparison": [
    {
      "brand": "品牌",
      "title": "标题",
      "price": "价格",
      "specification": "规格",
      "advantages": ["竞品优势"],
      "weaknesses": ["竞品不足"],
      "own_action": "对自有产品的动作",
      "source_url": "https://shopee.co.id/..."
    }
  ],
  "review_insights": {
    "positive": [{ "theme": "肤感", "count": 0, "examples": ["用户原话"] }],
    "negative": [{ "theme": "刺激", "count": 0, "examples": ["用户原话"], "action": "FAQ或预期管理动作" }],
    "faq": ["用户反复提出的问题"]
  },
  "positioning": {
    "target_users": ["目标人群"],
    "pain_points": ["核心痛点"],
    "core_promise": "一个核心主承诺",
    "supporting_benefits": ["次级利益"],
    "differentiation": ["差异化方向"],
    "proof_gaps": ["缺少的测试或事实"],
    "test_hypotheses": ["待验证的主图或卖点假设"]
  },
  "launch_plan": {
    "link_matrix": [{ "link_type": "旗舰店单品", "models": ["单件"], "role": "拉新", "price": "价格" }],
    "channels": [{ "channel": "站内广告", "message": "渠道表达", "asset": "素材" }],
    "roadmap": [{ "stage": "预热", "timing": "上线前7天", "actions": ["动作"] }],
    "kpis": ["CTR", "加购率", "转化率", "评价率"],
    "risks": ["库存、合规或预期管理风险"]
  }
}
```

## Source handling

- `market_context` stores market and keyword evidence; do not invent search volume, growth, ranking, or concentration.
- `competitor_comparison` stores page observations and proposed actions; it does not establish that a competitor claim is true.
- `review_insights` stores observed customer language. Counts are valid only when the source or sample is supplied.
- `positioning` is a recommendation layer. Keep `core_promise` separate from supporting benefits and proof gaps.
- `launch_plan` is an execution layer. Historical PPT schedules and prices are reference examples unless the user explicitly adopts them.
