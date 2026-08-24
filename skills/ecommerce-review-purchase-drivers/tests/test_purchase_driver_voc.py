import contextlib
import csv
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import purchase_driver_voc as voc  # noqa: E402


class PurchaseDriverVocTest(unittest.TestCase):
    def write_csv(self, path: Path, rows: list[dict[str, object]]) -> None:
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    def test_multilingual_multi_product_pass_report(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "moisturizer.csv"
            run = root / "run"
            rows = [
                {"product_id": "MOIST-A", "brand": "Aster", "product_name": "Barrier Cream", "platform": "Amazon", "market": "US", "language": "en", "review_id": "same-id", "review_body": "Keeps my skin comfortable all day. I will buy again.", "rating": 5, "review_date": "2026-08-01", "review_image_urls": "https://img.example.com/a.jpg"},
                {"product_id": "MOIST-A", "brand": "Aster", "product_name": "Barrier Cream", "platform": "Shopee", "market": "ID", "language": "id", "review_id": "id-2", "review_body": "Teksturnya nyaman tapi kemasannya bocor, tidak praktis.", "rating": 2, "review_date": "2026-08-02", "review_image_urls": ""},
                {"product_id": "MOIST-A", "brand": "Aster", "product_name": "Barrier Cream", "platform": "TikTok Shop", "market": "TH", "language": "th", "review_id": "th-3", "review_body": "เนื้อสบายและใช้ได้ทุกวัน แนะนำ", "rating": 5, "review_date": "2026-08-03", "review_image_urls": ""},
                {"product_id": "MOIST-B", "brand": "Beryl", "product_name": "Daily Moisture", "platform": "Amazon", "market": "US", "language": "en", "review_id": "same-id", "review_body": "The texture is greasy and the pump broke. I returned it.", "rating": 1, "review_date": "2026-08-04", "review_image_urls": "https://img.example.com/b.jpg"},
                {"product_id": "MOIST-B", "brand": "Beryl", "product_name": "Daily Moisture", "platform": "Shopee", "market": "ID", "language": "id", "review_id": "id-5", "review_body": "Cocok untuk kulit saya dan harganya sepadan. Beli lagi.", "rating": 5, "review_date": "2026-08-05", "review_image_urls": ""},
                {"product_id": "MOIST-C", "brand": "Cedar", "product_name": "Hydra Gel", "platform": "TikTok Shop", "market": "TH", "language": "th", "review_id": "th-6", "review_body": "ไม่เหมาะกับผิวฉัน ระคายเคืองและจะไม่ซื้อซ้ำ", "rating": 1, "review_date": "2026-08-06", "review_image_urls": ""},
                {"product_id": "MOIST-C", "brand": "Cedar", "product_name": "Hydra Gel", "platform": "Amazon", "market": "US", "language": "zh", "review_id": "zh-7", "review_body": "质地舒服，日常使用方便，我会回购。", "rating": 5, "review_date": "2026-08-07", "review_image_urls": ""},
            ]
            self.write_csv(source, rows)
            with contextlib.redirect_stdout(io.StringIO()):
                code = voc.main(["prepare", "--input", str(source), "--target-product-id", "MOIST-A", "--category", "保湿面霜", "--output-dir", str(run), "--demo"])
            self.assertEqual(code, 0)
            audit = json.loads((run / "import-audit.json").read_text(encoding="utf-8"))
            self.assertTrue(audit["demo_mode"])
            self.assertEqual(audit["product_count"], 3)
            self.assertEqual(audit["target_product_count"], 1)
            self.assertEqual(audit["category_homogeneity"], "CONFIRMED")
            self.assertEqual(set(audit["language_counts"]), {"en", "id", "th", "zh"})

            catalog = json.loads((run / "factor-catalog-draft.json").read_text(encoding="utf-8"))
            catalog["status"] = "ai_confirmed"
            (run / "factor-catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
            translations = {
                "en": "英文证据的忠实中文翻译",
                "id": "印尼语证据的忠实中文翻译",
                "th": "泰语证据的忠实中文翻译",
            }
            annotations = []
            for atom in voc.read_jsonl(run / "evidence-atoms.jsonl"):
                annotations.append({
                    "atom_id": atom["atom_id"],
                    "factor_id": atom["factor_id"],
                    "polarity": atom["polarity"],
                    "language": atom["language"],
                    "evidence_zh": atom["evidence_original"] if atom["language"] == "zh" else translations[atom["language"]],
                    "keywords_original": atom["keywords_original"] or [atom["evidence_original"][:24]],
                    "keywords_canonical_zh": atom["keywords_canonical_zh"] or ["具体体验"],
                    "contexts": ["日常使用"],
                    "impact_signals": atom["impact_signals"],
                    "confidence": 0.94,
                    "translation_status": "original_zh" if atom["language"] == "zh" else "ai_confirmed",
                    "review_status": "ai_confirmed",
                })
            annotations_path = run / "annotations.jsonl"
            voc.write_jsonl(annotations_path, annotations)
            with contextlib.redirect_stdout(io.StringIO()):
                code = voc.main(["build", "--run-dir", str(run), "--annotations", str(annotations_path)])
            self.assertEqual(code, 0)
            analysis = json.loads((run / "analysis.json").read_text(encoding="utf-8"))
            self.assertEqual(analysis["quality"]["status"], "PASS")
            self.assertTrue(analysis["demo_mode"])
            self.assertEqual(len(analysis["products"]), 3)
            self.assertTrue(analysis["factor_summary"])
            self.assertTrue(analysis["opportunities"])
            self.assertIn("by_product", analysis["keyword_cloud"])

            html = (run / "review-purchase-drivers.html").read_text(encoding="utf-8")
            self.assertNotIn("__REPORT_DATA__", html)
            self.assertIn('id="decision-map"', html)
            self.assertIn('id="factor-matrix"', html)
            self.assertIn('id="opportunity-list"', html)
            self.assertIn('id="positive-word-cloud"', html)
            self.assertIn('id="image-more"', html)
            self.assertIn('data-clear', html)
            self.assertIn("ecommerce-review-drivers-theme", html)
            self.assertIn("不可用于真实业务决策", html)
            with contextlib.redirect_stdout(io.StringIO()):
                code = voc.main(["verify", "--run-dir", str(run)])
            self.assertEqual(code, 0)

    def test_mixed_category_is_fail_and_xss_is_escaped(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "mixed.csv"
            run = root / "run"
            self.write_csv(source, [
                {"product_id": "A", "product_name": "Cream", "category": "面霜", "review_body": "很好用</script><script>bad()</script>", "rating": 5},
                {"product_id": "B", "product_name": "Headphone", "category": "耳机", "review_body": "声音不错", "rating": 5},
            ])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(voc.main(["prepare", "--input", str(source), "--output-dir", str(run)]), 0)
            catalog = json.loads((run / "factor-catalog-draft.json").read_text(encoding="utf-8"))
            catalog["status"] = "ai_confirmed"
            (run / "factor-catalog.json").write_text(json.dumps(catalog, ensure_ascii=False), encoding="utf-8")
            annotations = []
            for atom in voc.read_jsonl(run / "evidence-atoms.jsonl"):
                annotations.append({"atom_id": atom["atom_id"], "factor_id": atom["factor_id"], "polarity": atom["polarity"], "language": "zh", "evidence_zh": atom["evidence_original"], "keywords_original": [], "keywords_canonical_zh": ["体验"], "contexts": [], "impact_signals": [], "confidence": .9, "translation_status": "original_zh", "review_status": "ai_confirmed"})
            path = run / "annotations.jsonl"
            voc.write_jsonl(path, annotations)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(voc.main(["build", "--run-dir", str(run), "--annotations", str(path)]), 0)
            analysis = json.loads((run / "analysis.json").read_text(encoding="utf-8"))
            self.assertEqual(analysis["quality"]["status"], "FAIL")
            html = (run / "review-purchase-drivers.html").read_text(encoding="utf-8")
            self.assertNotIn("</script><script>bad()</script>", html)

    def test_filename_and_media_url_restore_product_market_and_platform(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "印尼(产品id=4088022296)评论.csv"
            run = root / "run"
            self.write_csv(source, [{
                "评论内容": "Teksturnya bagus dan cepat meresap",
                "星级": 5,
                "图片链接": "https://s-cf-id.shopeesz.com/file/example",
            }])
            with contextlib.redirect_stdout(io.StringIO()):
                code = voc.main(["prepare", "--target", str(source), "--category", "修护面霜", "--output-dir", str(run)])
            self.assertEqual(code, 0)
            review = voc.read_jsonl(run / "normalized-reviews.jsonl")[0]
            self.assertEqual(review["product_id"], "4088022296")
            self.assertFalse(review["temporary_product_id"])
            self.assertEqual(review["entity_role"], "TARGET")
            self.assertEqual(review["market"], "ID")
            self.assertEqual(review["platform"], "Shopee")
            self.assertEqual(review["language"], "id")

    def test_target_only_dataset_does_not_claim_relative_advantage(self) -> None:
        common = {
            "review_count": 80,
            "positive_review_count": 70,
            "negative_review_count": 2,
            "product_count": 1,
            "target_positive_review_count": 70,
            "target_negative_review_count": 2,
            "peer_positive_review_count": 0,
            "peer_negative_review_count": 0,
        }
        self.assertEqual(voc.classify_opportunity(common, target_total=100, peer_total=0, product_total=1), "TABLE_STAKES")
        negative_only = {**common, "positive_review_count": 0, "negative_review_count": 40}
        self.assertEqual(voc.classify_opportunity(negative_only, target_total=100, peer_total=0, product_total=1), "TABLE_STAKES")


if __name__ == "__main__":
    unittest.main()
