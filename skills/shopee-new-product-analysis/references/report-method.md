# Report Method

## Claim score

The default expression score is:

```text
frequency × 30%
+ first-image order × 25%
+ visual prominence × 20%
+ repeated emphasis × 15%
+ public quality signal × 10%
```

First-image order uses `1 / log2(sequence + 1)`. Public quality signals such as sold count, review count, and rating only adjust the weight mildly; they are not sales truth. Product-level presence is counted once even when one image has several claims or the same claim repeats.

## Safe recommendation language

- `可直接使用`: the user supplied a matching fact or proof point.
- `需补充证据`: the message is a useful angle but the user's product evidence is missing.
- `不要直接使用`: the message is competitor-only, an absolute/regulated promise, or conflicts with the user's product constraints.

Do not convert “appears frequently in competitor images” into “improves conversion”. Phrase it as “competitors emphasize” or “test this angle”.

## Main-image logic

The default eight-slot logic is an editable hypothesis, not a fixed rule:

1. Product and one core benefit.
2. Pain point or before/after proof.
3. Real usage scene and target user.
4. Functional detail or mechanism.
5. Ingredient, material, safety, or quality proof.
6. Specification and fit.
7. How to use or package contents.
8. Reassurance, after-sales, or promotion only when relevant.

## Detail-page logic

Use the strongest evidence-backed claim first, then explain the problem, show proof, demonstrate the scene and usage, resolve specification and objection questions, and finish with trust/after-sales. Keep regulated efficacy, medical, guaranteed, and absolute language in the evidence review queue.

## New-product logic

For a full new-product report, keep these layers separate:

```text
market opportunity → product facts → competitor observations → user feedback
→ positioning hypothesis → creative blueprint → link/channel execution → measurement
```

Use the historical-new-product framework as a reusable reference, not as a fixed template:

- Basic information and objective: product, timing, price, stock, target, and launch goal.
- Market and category: search demand, growth, average price, concentration, and opportunity.
- Competitor and reviews: page expression, model structure, positive drivers, negative drivers, and objections.
- Positioning: target user, problem, core benefit, proof, differentiation, and message risk.
- Creative: main-image slots, detail-page modules, scene, icon, short-copy, and long-copy directions.
- Execution: link matrix, Bundle, channel message, roadmap, KPI, A/B test, and review loop.

The report should label each recommendation as an observation, evidence-backed suggestion, test hypothesis, or missing-input action. Do not describe a frequent competitor phrase as a proven conversion driver.
