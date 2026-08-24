import assert from "node:assert/strict";
import { analyzeImageSets } from "./analyze-image-sets.mjs";
import { buildPrompt, parseVisionJson } from "./annotate-image-sets.mjs";

const result = analyzeImageSets({ records: [
  { watch_key: "A", product_title: "A", sold_total: 10000, image_assets: [{ sequence: 1, source_url: "a-1" }, { sequence: 2, source_url: "a-2" }], image_annotations: [{ sequence: 1, text: "Waterproof", claim_type: "feature", visual_emphasis: 0.9 }, { sequence: 2, text: "Outdoor", claim_type: "scene", scene: "outdoor" }] },
  { watch_key: "B", product_title: "B", sold_total: 5000, image_assets: [{ sequence: 1, source_url: "b-1" }, { sequence: 2, source_url: "b-2" }], image_annotations: [{ sequence: 1, text: "Water resistant", claim_type: "feature", visual_emphasis: 0.8 }, { sequence: 2, text: "Size 20cm", claim_type: "spec" }] }
] });

assert.equal(result.input_records, 2);
assert.equal(result.annotation_coverage.coverage, 1);
assert.equal(result.claim_ranking[0].claim_key, "water_resistance");
assert.equal(result.claim_ranking[0].product_count, 2);
assert.equal(result.products[0].images[0].order_score, 1);
assert.equal(result.recommendation[0].suggested_claims[0].claim_key, "water_resistance");
assert.equal(result.scene_ranking[0].scene_key, "outdoor");
assert.equal(result.recommendation[2].suggested_scenes[0].label, "outdoor");

const multiClaimResult = analyzeImageSets({ records: [
  { watch_key: "beauty", category: "卸妆/洁面", image_assets: [{ sequence: 1, source_url: "beauty-1" }], image_annotations: [{ sequence: 1, text: "Powerful Bersihkan Makeup\nGentle On Skin", claims: [
    { text: "Powerful Bersihkan Makeup", normalized_claim: "makeup_removal", claim_type: "feature", confidence: 0.95 },
    { text: "Gentle On Skin", normalized_claim: "gentle_non_irritating", claim_type: "benefit", confidence: 0.92 }
  ], visual_emphasis: 0.9 }] }
] });
assert.equal(multiClaimResult.annotation_coverage.coverage, 1);
assert.deepEqual(multiClaimResult.claim_ranking.map((claim) => claim.claim_key).sort(), ["gentle_non_irritating", "makeup_removal"]);
assert.equal(multiClaimResult.products[0].images[0].claims.length, 2);

const parsed = parseVisionJson("```json\n{\"text\":\"Waterproof\",\"language\":\"en\",\"normalized_claim\":\"water_resistance\",\"confidence\":0.94,\"visual_emphasis\":0.8}\n```");
assert.equal(parsed.normalized_claim, "water_resistance");
assert.equal(parsed.needs_review, false);
const parsedMulti = parseVisionJson('{"text":"Makeup\nGentle","claims":[{"text":"Makeup","normalized_claim":"makeup_removal","claim_type":"feature","confidence":0.9},{"text":"Gentle","normalized_claim":"gentle_non_irritating","claim_type":"benefit","confidence":0.9}],"confidence":0.9}');
assert.equal(parsedMulti.claims.length, 2);
assert.match(buildPrompt({ category: "收纳", product_title: "测试" }, { sequence: 1 }), /water_resistance/);
assert.match(buildPrompt({ category: "卸妆", product_title: "测试" }, { sequence: 1 }), /makeup_removal/);
console.log("Image-set analysis tests passed.");
