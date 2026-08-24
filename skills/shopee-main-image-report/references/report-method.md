# Competitor Report Method

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

## Periodic comparison

Compare snapshots by stable `watch_key` and image `sequence` where available:

- `added`: a link, Model, or image present in the current cycle but absent from the prior cycle.
- `removed`: a previously observed link, Model, or image absent from the current cycle.
- `changed`: title, price, promotion, stock, rating, review count, sold count, or image asset differs.
- `unknown`: the prior or current field is missing, blocked, or not comparable.

Do not convert missing data into a zero or “unchanged” label. Store capture dates and source URLs with every comparison.

## Main-image expression map

Use up to eight observed slots as an editable map:

1. Hero/product identity and the first visible benefit.
2. Pain point, comparison, or immediate result.
3. Scene, target user, or use moment.
4. Functional detail or mechanism.
5. Ingredient, material, safety, certification, or quality proof.
6. Specification, Model, size, or fit.
7. How-to-use, package contents, or routine.
8. Reassurance, after-sales, or promotion when present.

This map describes competitor expression order. It does not prescribe the user's product copy and does not establish that a slot causes conversion.

## Evidence language

- Say `竞品页面强调` for visible competitor copy.
- Say `样本中出现` for frequency findings.
- Say `周期内观察到变化` for snapshot differences.
- Say `无法判断` when the required field or historical snapshot is missing.
- Do not describe a frequent phrase as a proven efficacy or conversion driver.
